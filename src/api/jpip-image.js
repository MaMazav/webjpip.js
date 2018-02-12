'use strict';

var jpipFactory = require('jpip-runtime-factory.js'); 

module.exports = JpipImage;

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
    
    var fetcher = jpipFactory.createFetcher(databinsSaver, options); // TODO: WorkerProxyFetcher
    //function GridImageBase() {
    //    this._fetcher = fetcher;
    //    this._imageParams = null;
    //    this._waitingFetches = {};
    //    this._levelCalculator = null;
    //}

    this.opened = function opened(imageDecoder) {
        imageParams = imageDecoder.getImageParams();
        //imageDecoder.onFetcherEvent('data', this._onDataFetched.bind(this));
        //imageDecoder.onFetcherEvent('tile-terminated', this._onTileTerminated.bind(this));
    };

    this.getLevelCalculator = function getLevelCalculator() {
        if (levelCalculator === null) {
            levelCalculator = jpipFactory.createLevelCalculator(imageParams);
        }
        return levelCalculator;
    };

    this.getDecoderWorkersInputRetreiver = function getDecoderWorkersInputRetreiver() {
        return this;
    };
    
    this.getFetcher = function getFetcher() {
        return fetcher;
    };

    this.getWorkerTypeOptions = function getWorkerTypeOptions(taskType) {
        var codestreamTransferable = [0, 'headersCodestream', 'codestream', 'buffer'];
        var codeblockTransferable = [0, 'codeblocksData', 'data', 'buffer'];
        return {
            ctorName: 'webjpip.PdfjsJpxDecoder',
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
        var part = jpipFactory.createParamsCodestreamPart(
            params.codestreamPartParams,
            codestreamStructure);
            
        var context = jpipFactory.createImageDataContext(
            jpipObjectsForRequestContext,
            part,
            params.progressiveness);
        
        context.on('data', onData);
        if (context.hasData()) {
            onData(context);
        }
        
        function onData(context_) {
            if (context !== context_) {
                throw 'webjpip error: Unexpected context in data event';
            }
            
            // TODO: First quality layer
            var data = context.getFetchedData();
            task.dataReady(data);
            
            if (context.isDone()) {
                task.terminate();
                context.dispose();
            }
        }
    };
}

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