'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipImageDataContext;

function JpipImageDataContext(jpipObjects, codestreamPart, maxQuality, progressiveness) {
    this._codestreamPart       = codestreamPart;
    this._maxQuality           = maxQuality;
    this._reconstructor        = jpipObjects.reconstructor;
    this._packetsDataCollector = jpipObjects.packetsDataCollector;
    this._qualityLayersCache   = jpipObjects.qualityLayersCache;
    this._codestreamStructure  = jpipObjects.codestreamStructure;
    this._databinsSaver        = jpipObjects.databinsSaver;
    this._jpipFactory          = jpipObjects.jpipFactory;

    this._maxQualityPerPrecinct = [];
    this._registeredPrecinctDatabins = [];
    this._dataListeners = [];
    this._isDisposed = false;
    this._isProgressive = true;
    this._precinctDataArrivedBound = this._precinctDataArrived.bind(this);
    
    this._listener = this._jpipFactory.createQualityWaiter(
        this._codestreamPart,
        progressiveness,
        this._maxQuality,
        this._qualityLayerReachedCallback.bind(this),
        this._codestreamStructure,
        this._databinsSaver,
        this._startTrackPrecinct.bind(this));
    
    this._listener.register();
}

JpipImageDataContext.prototype.getProgressiveStagesFinished = function getProgressiveStagesFinished() {
    //ensureNoFailure();
    this._ensureNotDisposed();
    return this._listener.getProgressiveStagesFinished();
};

JpipImageDataContext.prototype.getFetchedData = function getFetchedData(quality) {
    this._ensureNotDisposed();
    if (this.getProgressiveStagesFinished() === 0) {
        throw 'JpipImageDataContext error: cannot call getFetchedData before getProgressiveStagesFinished() > 0';
    }
    
    //ensureNoFailure();
    var minQuality = this._listener.getQualityReached();
    if (quality) {
        if (quality > minQuality) {
            throw 'JpipImageDataContext error: getFetchedData called ' +
                'with quality higher than already reached';
        }
        minQuality = quality;
    }
    var codeblocks = this._packetsDataCollector.getAllCodeblocksData(
        this._codestreamPart, minQuality, quality);
    
    var headersCodestream =
        this._getCodestream(/*isOnlyHeadersWithoutBitstream=*/true);
    
    if (codeblocks.codeblocksData === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not collect codeblocks although progressiveness ' +
            'stage has been reached');
    }
    
    if (headersCodestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not reconstruct codestream although ' +
            'progressiveness stage has been reached');
    }
    
    //alreadyReturnedCodeblocks = codeblocks.alreadyReturnedCodeblocks;
    return {
        headersCodestream: headersCodestream,
        codeblocksData: codeblocks.codeblocksData,
        minQuality: minQuality
    };
};

JpipImageDataContext.prototype.getFetchedDataAsCodestream = function getFetchedDataAsCodestream() {
    return this._getCodestream(/*isOnlyHeadersWithoutBitstream=*/false);
};

JpipImageDataContext.prototype.on = function on(event, listener) {
    this._ensureNotDisposed();
    if (event !== 'data') {
        throw 'JpipImageDataContext error: Unexpected event ' + event;
    }
    
    this._dataListeners.push(listener);
};

JpipImageDataContext.prototype.isDone = function isDone() {
    this._ensureNotDisposed();
    return this._listener.isDone();
};

JpipImageDataContext.prototype.dispose = function dispose() {
    this._ensureNotDisposed();
    this._isDisposed = true;
    this._listener.unregister();
    this._listener = null;
    for (var i = 0; i < this._registeredPrecinctDatabins.length; ++i) {
        var precinctDatabin = this._registeredPrecinctDatabins[i];
        
        this._databinsSaver.removeEventListener(
            precinctDatabin,
            'dataArrived',
            this._precinctDataArrivedBound);
    }
};

JpipImageDataContext.prototype.setIsProgressive = function setIsProgressive(isProgressive) {
    this._ensureNotDisposed();
    var oldIsProgressive = this._isProgressive;
    this._isProgressive = isProgressive;
    if (!oldIsProgressive && isProgressive && this.getProgressiveStagesFinished() > 0) {
        for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i](this);
        }
    }
};

// Private methods

JpipImageDataContext.prototype._getCodestream = function getCodestream(
    isOnlyHeadersWithoutBitstream) {
    
    this._ensureNotDisposed();
    //ensureNoFailure();
    
    var qualityReached = this._listener.getQualityReached();
    
    var codestream;
    if (isOnlyHeadersWithoutBitstream) {
        codestream = this._reconstructor.createHeadersCodestream(this._codestreamPart);
    } else {
        codestream = this._reconstructor.createCodestream(
            this._codestreamPart, qualityReached, this._maxQuality);
    }
    
    if (codestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not reconstruct codestream although ' +
            'progressiveness stage has been reached');
    }
    
    return codestream;
};

JpipImageDataContext.prototype._startTrackPrecinct = function startTrackPrecinct(
    precinctDatabin, maxQuality, precinctIterator, precinctHandle) {
    
    var inClassIndex = precinctDatabin.getInClassId();
    this._maxQualityPerPrecinct[inClassIndex] = maxQuality;
    this._registeredPrecinctDatabins.push(precinctDatabin);
    this._databinsSaver.addEventListener(
        precinctDatabin, 'dataArrived', this._precinctDataArrivedBound);
    
    this._precinctDataArrived(precinctDatabin, precinctIterator);
};

JpipImageDataContext.prototype._precinctDataArrived = function precinctDataArrived(precinctDatabin, precinctIteratorOptional) {
    var inClassIndex = precinctDatabin.getInClassId();
    var maxQuality = this._maxQualityPerPrecinct[inClassIndex];
    var qualityLayers = this._qualityLayersCache.getQualityLayerOffset(
        precinctDatabin,
        maxQuality,
        precinctIteratorOptional);
    
    this._listener.precinctQualityLayerReached(inClassIndex, qualityLayers.numQualityLayers);
};

JpipImageDataContext.prototype._qualityLayerReachedCallback = function qualityLayerReachedCallback() {
    if (!this._isProgressive && !this._listener.isDone()) {
        return;
    }
    
    for (var i = 0; i < this._dataListeners.length; ++i) {
        this._dataListeners[i](this);
    }
};

JpipImageDataContext.prototype._ensureNotDisposed = function ensureNotDisposed() {
    if (this._isDisposed) {
        throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot use ImageDataContext after disposed');
    }
};
