'use strict';

var jpipFactory = require('jpip-runtime-factory.js'); 
var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipImage;

var WORKER_TYPE_PIXELS = 1;
var WORKER_TYPE_COEFFS = 2;

var TASK_ABORTED_RESULT_PLACEHOLDER = 'aborted';

function JpipImage(options) {
    var databinsSaver = jpipFactory.createDatabinsSaver(/*isJpipTilepartStream=*/false);
    var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

    var markersParser = jpipFactory.createMarkersParser(mainHeaderDatabin);
    var offsetsCalculator = jpipFactory.createOffsetsCalculator(
        mainHeaderDatabin, markersParser);
    var structureParser = jpipFactory.createStructureParser(
        databinsSaver, markersParser, offsetsCalculator);
    
    var progressionOrder = 'RPCL';
    var codestreamStructure = jpipFactory.createCodestreamStructure(
        structureParser, progressionOrder);
    
    var qualityLayersCache = jpipFactory.createQualityLayersCache(
        codestreamStructure);
        
    var headerModifier = jpipFactory.createHeaderModifier(
        offsetsCalculator, progressionOrder);
    var reconstructor = jpipFactory.createCodestreamReconstructor(
        databinsSaver, headerModifier, qualityLayersCache);
    var packetsDataCollector = jpipFactory.createPacketsDataCollector(
        databinsSaver, qualityLayersCache);
    
    var jpipObjectsForRequestContext = {
        reconstructor: reconstructor,
        packetsDataCollector: packetsDataCollector,
        qualityLayersCache: qualityLayersCache,
        codestreamStructure: codestreamStructure,
        databinsSaver: databinsSaver,
        jpipFactory: jpipFactory
    };
    
    var paramsModifier = jpipFactory.createRequestParamsModifier(codestreamStructure);

    var imageParams = null;
    var levelCalculator = null;
    
    var fetcher = jpipFactory.createFetcher(databinsSaver, options); // NOTE: Proxying fetcher to web worker might boost performance

    this.opened = function opened(imageDecoder) {
        imageParams = imageDecoder.getImageParams();
    };

    this.getLevelCalculator = getLevelCalculator;

    this.getDecoderWorkersInputRetreiver = function getDecoderWorkersInputRetreiver() {
        return this;
    };
    
    this.getFetcher = function getFetcher() {
        return fetcher;
    };

    this.getWorkerTypeOptions = function getWorkerTypeOptions(workerType) {
        switch (workerType) {
            case WORKER_TYPE_PIXELS:
                return {
                    ctorName: 'webjpip.Internals.PdfjsJpxPixelsDecoder',
                    ctorArgs: [],
                    scriptsToImport: [getScriptName(new Error())],
                    pathToTransferablesInPromiseResult: [[0, 'data', 'buffer']]
                };
            case WORKER_TYPE_COEFFS:
                var codestreamTransferable = [0, 'headersCodestream', 'buffer'];
                var codeblockTransferable = [0, 'codeblocksData', 'data', 'buffer'];
                return {
                    ctorName: 'webjpip.Internals.PdfjsJpxCoefficientsDecoder',
                    ctorArgs: [],
                    scriptsToImport: [getScriptName(new Error())],
                    transferables: [codestreamTransferable, codeblockTransferable],
                    pathToTransferablesInPromiseResult: [[0, 'coefficients', 'buffer']]
                };
            default:
                throw 'webjpip error: Unexpected worker type in ' +
                    'getWorkerTypeOptions ' + workerType;
        }
    };
    
    this.getKeyAsString = function getKeyAsString(key) {
        if (key.taskType === 'COEFFS') {
            return 'C:' + key.inClassIndex;
        } else {
            var params = paramsModifier.modify(/*codestreamTaskParams=*/key);
            var partParams = params.codestreamPartParams;
            return 'P:xmin' + partParams.minX + 'ymin' + partParams.minY +
                   'xmax' + partParams.maxXExclusive +
                   'ymax' + partParams.maxYExclusive +
                   'r' + partParams.level + 'q' + partParams.quality;
        }
    };
    
    this.taskStarted = function taskStarted(task) {
        if (task.key.taskType === 'COEFFS') {
            startCoefficientsTask(task);
        } else {
            startPixelsTask(task);
        }
    };
    
    function startPixelsTask(task) {
        var params = paramsModifier.modify(/*codestreamTaskParams=*/task.key);
        var codestreamPart = jpipFactory.createParamsCodestreamPart(
            params.codestreamPartParams,
            codestreamStructure);
        
        var qualityWaiter;
        var dependencies = 0;
        var dependencyIndexByInClassIndex = [];
        var minQualityData = [];
        var minQualityDataCount = 0;
        var isProcessedMinQuality = false;
        
        task.on('dependencyTaskData', function(data, dependencyKey) {
            var index = dependencyIndexByInClassIndex[dependencyKey.inClassIndex];
            if (!minQualityData[index]) {
                if (data.minQuality !== params.progressiveness[0].minNumQualityLayers) {
                    throw 'jpip error: Unexpected quality as min quality data';
                }
                
                minQualityData[index] = data;
                ++minQualityDataCount;
            }
            
            qualityWaiter.precinctQualityLayerReached(
                dependencyKey.inClassIndex, data.minQuality);
        });
        
        var isEnded = false;
        task.on('statusUpdated', function(status) {
            if (!isEnded &&
                !status.isWaitingForWorkerResult &&
                status.terminatedDependsTasks === status.dependsTasks) {
                
                throw 'jpip error: Unexpected unended task without pending ' +
                    'depend tasks';
            }
        });

        task.on('custom', function(customEventName) {
            if (customEventName === 'aborting') {
                taskEnded();
            }
        });
        
        qualityWaiter = jpipFactory.createQualityWaiter(
            codestreamPart,
            params.progressiveness,
            task.key.maxQuality,
            qualityLayerReachedCallback,
            codestreamStructure,
            databinsSaver,
            startTrackPrecinctCallback);
        
        qualityWaiter.register();
        
        function startTrackPrecinctCallback(
            precinctDatabin,
            qualityInTile,
            precinctIterator,
            inClassIndex,
            tileStructure) {

            dependencyIndexByInClassIndex[inClassIndex] = dependencies++;

            var precinctIndex =
                tileStructure.precinctPositionToIndexInComponentResolution(
                    precinctIterator);
                    
            // Depends on precincts tasks
            task.registerTaskDependency({
                taskType: 'COEFFS',
                tileIndex: precinctIterator.tileIndex,
                resolutionLevel: precinctIterator.resolutionLevel,
                precinctX: precinctIterator.precinctX,
                precinctY: precinctIterator.precinctY,
                component: precinctIterator.component,
                maxQuality: params.codestreamPartParams.quality,
                inClassIndex: inClassIndex,
                precinctIndexInComponentResolution: precinctIndex,
                progressiveness: params.progressiveness
            });
        }
        
        var headersCodestream = null;
        var offsetInRegion = null;
        var imageTilesX;
        var tilesBounds;
        
        function qualityLayerReachedCallback() {
            if (headersCodestream === null) {
                headersCodestream = reconstructor.createHeadersCodestream(codestreamPart);
                offsetInRegion = getOffsetInRegion(codestreamPart, params.codestreamPartParams);
                imageTilesX = codestreamStructure.getNumTilesX();
                tilesBounds = codestreamPart.tilesBounds;
            }
            
            if (!isProcessedMinQuality) {
                if (minQualityDataCount < minQualityData.length) {
                    throw 'webjpip error: Min quality layer data missing';
                }
                
                isProcessedMinQuality = true;
                task.dataReady({
                    headersCodestream: headersCodestream,
                    offsetInRegion: offsetInRegion,
                    imageTilesX: imageTilesX,
                    tilesBounds: tilesBounds,
                    precinctCoefficients: minQualityData
                }, WORKER_TYPE_PIXELS, /*canSkip=*/false);
            }
            
            if (qualityWaiter.getProgressiveStagesFinished() > 1) {
                task.dataReady({
                    headersCodestream: headersCodestream,
                    offsetInRegion: offsetInRegion,
                    imageTilesX: imageTilesX,
                    tilesBounds: tilesBounds,
                    precinctCoefficients: task.dependTaskResults // NOTE: dependTaskResults might be changed while work (passed by ref)
                }, WORKER_TYPE_PIXELS, /*canSkip=*/true);
            }
            
            if (qualityWaiter.isDone()) {
                taskEnded();
                task.terminate();
            }
        }
        
        function taskEnded() {
            if (!isEnded) {
                isEnded = true;
                qualityWaiter.unregister();
            }
        }
    }
    
    function startCoefficientsTask(task) {
        var codestreamPart = jpipFactory.createPrecinctCodestreamPart(
            getLevelCalculator(),
            codestreamStructure.getTileStructure(task.key.tileIndex),
            task.key.tileIndex,
            task.key.component,
            task.key.resolutionLevel,
            task.key.precinctX,
            task.key.precinctY);
        
        task.on('custom', function(customEventName) {
            if (customEventName === 'aborting') {
                taskEnded();
            }
        });

        var context = jpipFactory.createImageDataContext(
            jpipObjectsForRequestContext,
            codestreamPart,
            task.key.maxQuality,
            task.key.progressiveness); // TODO: Eliminate progressiveness from API
        
        var hadData = false;
        var hadMinQuality = false;
        var isTerminated = false;
        
        context.on('data', onData);
        if (context.getProgressiveStagesFinished() > 0) {
            onData(context);
        }
        
        function onData(context_) {
            if (context !== context_) {
                throw 'webjpip error: Unexpected context in data event';
            }
            
            hadData = true;
            
            var stage = context.getProgressiveStagesFinished();
            if (!hadMinQuality) {
                hadMinQuality = true;
                var minQualityData = context.getFetchedData(task.key.progressiveness[0].minNumQualityLayers);
                task.dataReady(minQualityData, WORKER_TYPE_COEFFS, /*canSkip=*/false);
            }
            
            if (stage > 1) {
                var data = context.getFetchedData();
                task.dataReady(data, WORKER_TYPE_COEFFS, /*canSkip=*/true);
            }
            
            if (context.isDone()) {
                if (!hadData) {
                    throw 'webjpip error: Coefficients task without data';
                }
                taskEnded();
                task.terminate();
            }
        }
        
        function taskEnded() {
            if (!isTerminated) {
                isTerminated = true;
                context.dispose();
            }
        }
    }
    
    // TODO: Remove
    if (!JpipImage.useLegacy) {
        return;
    }
    //*
    this.getWorkerTypeOptions = function getWorkerTypeOptions(taskType) {
        var codestreamTransferable = [0, 'headersCodestream', 'buffer'];
        var codeblockTransferable = [0, 'codeblocksData', 'data', 'buffer'];
        return {
            ctorName: 'webjpip.Internals.PdfjsJpxDecoderLegacy',
            ctorArgs: [],
            scriptsToImport: [getScriptName(new Error())],
            transferables: [codestreamTransferable, codeblockTransferable],
            pathToTransferablesInPromiseResult: [[]]
        };
    };
    
    this.getKeyAsString = function getKeyAsString(key) {
        return JSON.stringify(key);
    };
    
    this.taskStarted = function taskStarted(task) {
        var params = paramsModifier.modify(/*codestreamTaskParams=*/task.key);
        var codestreamPart = jpipFactory.createParamsCodestreamPart(
            params.codestreamPartParams,
            codestreamStructure);
            
        var context = jpipFactory.createImageDataContext(
            jpipObjectsForRequestContext,
            codestreamPart,
            params.codestreamPartParams.quality,
            params.progressiveness);
        
        var offsetInRegion = getOffsetInRegion(codestreamPart, params.codestreamPartParams);
        
        context.on('data', onData);
        if (context.hasData()) {
            onData(context);
        }
        
        function onData(context_) {
            if (context !== context_) {
                throw 'webjpip error: Unexpected context in data event';
            }
            
            var data = context.getFetchedData();
            data.offsetInRegion = offsetInRegion;
            task.dataReady(data, /*canSkip=*/true);
            
            if (context.isDone()) {
                task.terminate();
                context.dispose();
            }
        }
    };
    //*/
    
    function getOffsetInRegion(codestreamPart, codestreamPartParams) {
        if (codestreamPartParams) {
            var tileIterator = codestreamPart.getTileIterator();
            if (!tileIterator.tryAdvance()) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Empty codestreamPart in JpipImageDataContext');
            }
            var firstTileId = tileIterator.tileIndex;
            
            var firstTileLeft = codestreamStructure.getTileLeft(
                firstTileId, codestreamPart.level);
            var firstTileTop = codestreamStructure.getTileTop(
                firstTileId, codestreamPart.level);
                
            return {
                offsetX: codestreamPartParams.minX - firstTileLeft,
                offsetY: codestreamPartParams.minY - firstTileTop,
                width : codestreamPartParams.maxXExclusive - codestreamPartParams.minX,
                height: codestreamPartParams.maxYExclusive - codestreamPartParams.minY
            };
        } else {
            return {
                offsetX: 0,
                offsetY: 0,
                width : codestreamStructure.getImageWidth(),
                height: codestreamStructure.getImageHeight()
            };
        }
    }

    function getLevelCalculator() {
        if (levelCalculator === null) {
            levelCalculator = jpipFactory.createLevelCalculator(imageParams);
        }
        return levelCalculator;
    }
}

JpipImage.toggleLegacy = function() {
    JpipImage.useLegacy = !JpipImage.useLegacy;
};

var currentStackFrameRegex = /at (|[^ ]+ \()([^ ]+):\d+:\d+/;
var lastStackFrameRegexWithStrudel = new RegExp(/.+@(.*?):\d+:\d+/);
var lastStackFrameRegex = new RegExp(/.+\/(.*?):\d+(:\d+)*$/);

function getScriptName(errorWithStackTrace) {
    var stack = errorWithStackTrace.stack.trim();
    
    var source = currentStackFrameRegex.exec(stack);
    if (source && source[2] !== "") {
        return source[2];
    }

    source = lastStackFrameRegexWithStrudel.exec(stack);
    if (source && (source[1] !== "")) {
        return source[1];
    }
    
    source = lastStackFrameRegex.exec(stack);
    if (source && source[1] !== "") {
        return source[1];
    }
    
    if (errorWithStackTrace.fileName !== undefined) {
        return errorWithStackTrace.fileName;
    }
    
    throw 'webjpip.js: Could not get current script URL';
}