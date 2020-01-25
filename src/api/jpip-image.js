'use strict';

var jpipFactory = require('jpip-runtime-factory.js'); 
var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipImage;

var WORKER_TYPE_PIXELS = 1;
var WORKER_TYPE_COEFFS = 2;

var TASK_ABORTED_RESULT_PLACEHOLDER = 'aborted';

function JpipImage(arg, progressiveness) {
    var jpipObjects;
    if (arg && arg.jpipFactory) {
        jpipObjects = arg;
    } else {
        if (!arg || !arg.url) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                'options.url', undefined);
        }
        jpipObjects = createJpipObjects(/*fetcherOptionsArg=*/arg);
    }
    
    var progressivenessModified;

    var imageParams = null;
    var levelCalculator = null;
    
    // NOTE: Proxying fetcher to web worker might boost performance
    var fetcher = jpipFactory.createFetcher(
        jpipObjects.databinsSaver,
        jpipObjects.fetcherSharedObjects,
        jpipObjects.fetcherOptions);
    
    this.nonProgressive = function nonProgressive(quality) {
        var qualityModified = quality || 'max';
        return this.customProgressive([ {
            minNumQualityLayers: qualityModified,
            forceMaxQuality: 'force'
        } ]);
    };
    
    this.autoProgressive = function autoProgressive(maxQuality) {
        var autoProgressiveness = this.getAutomaticProgressiveness(maxQuality);
        return this.customProgressive(autoProgressiveness);
    };
    
    this.customProgressive = function customProgressive(customProgressiveness) {
        var customProgressivenessModified = jpipObjects.paramsModifier.modifyCustomProgressiveness(customProgressiveness);
        return new JpipImage(jpipObjects, customProgressivenessModified);
    };

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
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'webjpip error: Unexpected worker type in ' +
                    'getWorkerTypeOptions ' + workerType);
        }
    };
    
    this.getKeyAsString = function getKeyAsString(key) {
        if (key.taskType === 'COEFFS') {
            return 'C:' + key.inClassIndex;
        } else {
            var partParams = jpipObjects.paramsModifier.modifyCodestreamPartParams(/*codestreamTaskParams=*/key);
            return 'P:xmin' + partParams.minX + 'ymin' + partParams.minY +
                   'xmax' + partParams.maxXExclusive +
                   'ymax' + partParams.maxYExclusive +
                   'r' + partParams.level;
        }
    };
    
    this.taskStarted = function taskStarted(task) {
        validateProgressiveness();
        if (task.key.taskType === 'COEFFS') {
            startCoefficientsTask(task);
        } else {
            startPixelsTask(task);
        }
    };
    
    function createJpipObjects(fetcherOptionsArg) {
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

        var paramsModifier = jpipFactory.createRequestParamsModifier(codestreamStructure);
        
        return {
            reconstructor: reconstructor,
            packetsDataCollector: packetsDataCollector,
            qualityLayersCache: qualityLayersCache,
            codestreamStructure: codestreamStructure,
            databinsSaver: databinsSaver,
            paramsModifier: paramsModifier,
            fetcherSharedObjects: {},
            fetcherOptions: fetcherOptionsArg,
            jpipFactory: jpipFactory
        };
    }
    
    function validateProgressiveness() {
        if (!progressivenessModified) {
            progressivenessModified = progressiveness ?
                jpipObjects.paramsModifier.modifyCustomProgressiveness(progressiveness) :
                jpipObjects.paramsModifier.getAutomaticProgressiveness();
            
            fetcher.setProgressiveness(progressivenessModified);
        }
    }
    
    function startPixelsTask(task) {
        var params = jpipObjects.paramsModifier.modifyCodestreamPartParams(/*codestreamTaskParams=*/task.key);
        var codestreamPart = jpipFactory.createParamsCodestreamPart(
            params,
            jpipObjects.codestreamStructure);
        
        var qualityWaiter;
        var dependencies = 0;
        var dependencyIndexByInClassIndex = [];
        
        task.on('dependencyTaskData', function(data, dependencyKey) {
            var index = dependencyIndexByInClassIndex[dependencyKey.inClassIndex];
            qualityWaiter.precinctQualityLayerReached(
                dependencyKey.inClassIndex, data.minQuality);
        });
        
        var isEnded = false;
        task.on('statusUpdated', function(status) {
            if (!isEnded &&
                !status.isWaitingForWorkerResult &&
                status.terminatedDependsTasks === status.dependsTasks) {
                
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'jpip error: Unexpected unended task without pending depend tasks');
            }
        });

        task.on('custom', function(customEventName) {
            if (customEventName === 'aborting') {
                taskEnded();
            }
        });
        
        qualityWaiter = jpipFactory.createQualityWaiter(
            codestreamPart,
            progressivenessModified,
            /*maxQuality=*/0, // TODO: Eliminate this unused argument
            qualityLayerReachedCallback,
            jpipObjects.codestreamStructure,
            jpipObjects.databinsSaver,
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
                inClassIndex: inClassIndex,
                precinctIndexInComponentResolution: precinctIndex
            });
        }
        
        var headersCodestream = null;
        var offsetInRegion = null;
        var imageTilesX;
        var tilesBounds;
        
        function qualityLayerReachedCallback() {
            if (headersCodestream === null) {
                headersCodestream = jpipObjects.reconstructor.createHeadersCodestream(codestreamPart);
                offsetInRegion = getOffsetInRegion(codestreamPart, params);
                imageTilesX = jpipObjects.codestreamStructure.getNumTilesX();
                tilesBounds = codestreamPart.tilesBounds;
            }
            
            // TODO: Aggregate results to support 'forceAll'
            var stage = qualityWaiter.getProgressiveStagesFinished();
            var canSkip =
                progressivenessModified[stage - 1].force === 'force' ||
                progressivenessModified[stage - 1].force === 'forceAll';
            task.dataReady({
                headersCodestream: headersCodestream,
                offsetInRegion: offsetInRegion,
                imageTilesX: imageTilesX,
                tilesBounds: tilesBounds,
                precinctCoefficients: task.dependTaskResults // NOTE: dependTaskResults might be changed while work (passed by ref)
            }, WORKER_TYPE_PIXELS, canSkip);
            
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
            jpipObjects.codestreamStructure.getTileStructure(task.key.tileIndex),
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
            jpipObjects,
            codestreamPart,
            task.key.maxQuality, // TODO: Eliminate this unused argument
            progressivenessModified);
        
        var hadData = false;
        var isTerminated = false;
        
        context.on('data', onData);
        if (context.getProgressiveStagesFinished() > 0) {
            onData(context);
        }
        
        function onData(context_) {
            if (context !== context_) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'webjpip error: Unexpected context in data event');
            }
            
            hadData = true;
            
            var quality;
            var stage = context.getProgressiveStagesFinished();
            var canSkip =
                progressivenessModified[stage - 1].force !== 'force' && progressivenessModified[stage - 1].force !== 'forceAll';
            if (!canSkip) {
                quality = progressivenessModified[stage - 1].minNumQualityLayers;
            }
            
            var data = context.getFetchedData(quality);
            task.dataReady(data, WORKER_TYPE_COEFFS, canSkip);
            
            if (context.isDone()) {
                if (!hadData) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'webjpip error: Coefficients task without data');
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
        validateProgressiveness();
        var params = jpipObjects.paramsModifier.modifyCodestreamPartParams(/*codestreamTaskParams=*/task.key);
        var codestreamPart = jpipFactory.createParamsCodestreamPart(
            params,
            jpipObjects.codestreamStructure);
            
        var context = jpipFactory.createImageDataContext(
            jpipObjects,
            codestreamPart,
            params.quality,
            progressivenessModified);
        
        var offsetInRegion = getOffsetInRegion(codestreamPart, params);
        
        context.on('data', onData);
        if (context.hasData()) {
            onData(context);
        }
        
        function onData(context_) {
            if (context !== context_) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'webjpip error: Unexpected context in data event');
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
            
            var firstTileLeft = jpipObjects.codestreamStructure.getTileLeft(
                firstTileId, codestreamPart.level);
            var firstTileTop = jpipObjects.codestreamStructure.getTileTop(
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
                width : jpipObjects.codestreamStructure.getImageWidth(),
                height: jpipObjects.codestreamStructure.getImageHeight()
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
    
    throw new jGlobals.jpipExceptions.InternalErrorException('webjpip.js: Could not get current script URL');
}