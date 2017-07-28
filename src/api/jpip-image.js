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
        codestreamStructure, offsetsCalculator, progressionOrder);
    var reconstructor = jpipFactory.createCodestreamReconstructor(
        codestreamStructure, databinsSaver, headerModifier, qualityLayersCache);
    var packetsDataCollector = jpipFactory.createPacketsDataCollector(
        codestreamStructure, databinsSaver, qualityLayersCache);
    
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
	//	this._fetcher = fetcher;
	//	this._imageParams = null;
	//	this._waitingFetches = {};
	//	this._levelCalculator = null;
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
		return {
			ctorName: 'PdfjsJpxDecoder',
			ctorArgs: [],
			scriptsToImport: [getScriptName(new Error())]
		};
	};

	this.getKeyAsString = function getKeyAsString(key) {
		return JSON.stringify(key);
	};

	this.taskStarted = function taskStarted(task) {
		var params = paramsModifier.modify(/*codestreamTaskParams=*/task.key);
		var context = jpipFactory.createImageDataContext(
			jpipObjectsForRequestContext,
			params.codestreamPartParams,
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

function getScriptName(errorWithStackTrace) {
	var stack = errorWithStackTrace.stack.trim();
	
	var currentStackFrameRegex = /at (|[^ ]+ \()([^ ]+):\d+:\d+/;
	var source = currentStackFrameRegex.exec(stack);
	if (source && source[2] !== "") {
		return source[2];
	}

	var lastStackFrameRegex = new RegExp(/.+\/(.*?):\d+(:\d+)*$/);
	source = lastStackFrameRegex.exec(stack);
	if (source && source[1] !== "") {
		return source[1];
	}
	
	if (errorWithStackTrace.fileName !== undefined) {
		return errorWithStackTrace.fileName;
	}
	
	throw 'ImageDecoderFramework.js: Could not get current script URL';
}