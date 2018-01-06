'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipImageDataContext;

function JpipImageDataContext(jpipObjects, codestreamPartParams, progressiveness) {
    this._codestreamPartParams = codestreamPartParams;
    this._progressiveness      = progressiveness;
    this._reconstructor        = jpipObjects.reconstructor;
    this._packetsDataCollector = jpipObjects.packetsDataCollector;
    this._qualityLayersCache   = jpipObjects.qualityLayersCache;
    this._codestreamStructure  = jpipObjects.codestreamStructure;
    this._databinsSaver        = jpipObjects.databinsSaver;
    this._jpipFactory          = jpipObjects.jpipFactory;

    this._progressiveStagesFinished = 0;
    this._qualityLayersReached = 0;
    this._dataListeners = [];
    
    this._listener = this._jpipFactory.createRequestDatabinsListener(
        codestreamPartParams,
        this._qualityLayerReachedCallback.bind(this),
        this._codestreamStructure,
        this._databinsSaver,
        this._qualityLayersCache);
}

JpipImageDataContext.prototype.hasData = function hasData() {
    //ensureNoFailure();
    this._ensureNotDisposed();
    return this._progressiveStagesFinished > 0;
};

JpipImageDataContext.prototype.getFetchedData = function getFetchedData(quality) {
    this._ensureNotDisposed();
    if (!this.hasData()) {
        throw 'JpipImageDataContext error: cannot call getFetchedData before hasData = true';
    }
    
    //ensureNoFailure();
    var params = this._getParamsForDataWriter(quality);
    var codeblocks = this._packetsDataCollector.getAllCodeblocksData(
        params.codestreamPartParams,
        params.minNumQualityLayers);
    
    var headersCodestream = this._reconstructor.createCodestreamForRegion(
        params.codestreamPartParams,
        params.minNumQualityLayers,
        /*isOnlyHeadersWithoutBitstream=*/true);
    
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
        codestreamPartParams: this._codestreamPartParams
    };
};

JpipImageDataContext.prototype.getFetchedDataAsCodestream = function getFetchedDataAsCodestream(quality) {
    this._ensureNotDisposed();
    //ensureNoFailure();
    
    var params = this._getParamsForDataWriter(quality);
    
    var codestream = this._reconstructor.createCodestreamForRegion(
        params.codestreamPartParams,
        params.minNumQualityLayers);
    
    if (codestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not reconstruct codestream although ' +
            'progressiveness stage has been reached');
    }
    
    return codestream;
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
    return this._isRequestDone;
};

JpipImageDataContext.prototype.dispose = function dispose() {
    this._ensureNotDisposed();
    this._listener.unregister();
    this._listener = null;
};

JpipImageDataContext.prototype.setIsProgressive = function setIsProgressive(isProgressive) {
    this._ensureNotDisposed();
    var oldIsProgressive = this._isProgressive;
    this._isProgressive = isProgressive;
    if (!oldIsProgressive && isProgressive && this.hasData()) {
        for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i](this);
        }
    }
};

// Methods for JpipFetchHandle

JpipImageDataContext.prototype.isDisposed = function isDisposed() {
    return !this._listener;
};

JpipImageDataContext.prototype.getCodestreamPartParams =
    function getCodestreamPartParams() {
        
    return this._codestreamPartParams;
};

JpipImageDataContext.prototype.getNextQualityLayer =
    function getNextQualityLayer() {
        
    return this._progressiveness[this._progressiveStagesFinished].minNumQualityLayers;
};

// Private methods

JpipImageDataContext.prototype._tryAdvanceProgressiveStage = function tryAdvanceProgressiveStage() {
    var numQualityLayersToWait = this._progressiveness[
        this._progressiveStagesFinished].minNumQualityLayers;

    if (this._qualityLayersReached < numQualityLayersToWait) {
        return false;
    }
    
    if (this._qualityLayersReached === 'max') {
        this._progressiveStagesFinished = this._progressiveness.length;
    }
    
    while (this._progressiveStagesFinished < this._progressiveness.length) {
        var qualityLayersRequired = this._progressiveness[
            this._progressiveStagesFinished].minNumQualityLayers;
        
        if (qualityLayersRequired === 'max' ||
            qualityLayersRequired > this._qualityLayersReached) {
            
            break;
        }
        
        ++this._progressiveStagesFinished;
    }
    
    this._isRequestDone = this._progressiveStagesFinished === this._progressiveness.length;

    return true;
};

JpipImageDataContext.prototype._qualityLayerReachedCallback = function qualityLayerReachedCallback(qualityLayersReached) {
    this._qualityLayersReached = qualityLayersReached;
    
    if (this._isRequestDone) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Request already done but callback is called');
    }
    
    if (!this._tryAdvanceProgressiveStage()) {
        return;
    }
    
    if (!this._isProgressive && !this._isRequestDone) {
        return;
    }
    
    for (var i = 0; i < this._dataListeners.length; ++i) {
        this._dataListeners[i](this);
    }
};

JpipImageDataContext.prototype._getParamsForDataWriter = function getParamsForDataWriter(quality) {
    //ensureNotEnded(status, /*allowZombie=*/true);
    
    //if (codestreamPartParams === null) {
    //    throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot ' +
    //        'get data of zombie request with no codestreamPartParams');
    //}
    
    //var isRequestDone = progressiveStagesFinished === progressiveness.length;
    //if (!isRequestDone) {
    //    ensureNotWaitingForUserInput(status);
    //}
    
    if (this._progressiveStagesFinished === 0) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot create codestream before first progressiveness ' +
            'stage has been reached');
    }
    
    var minNumQualityLayers =
        this._progressiveness[this._progressiveStagesFinished - 1].minNumQualityLayers;
    
    var newParams = this._codestreamPartParams;
    if (quality !== undefined) {
        newParams = Object.create(this._codestreamPartParams);
        newParams.quality = quality;
        
        if (minNumQualityLayers !== 'max') {
            minNumQualityLayers = Math.min(
                minNumQualityLayers, quality);
        }
    }
    
    return {
        codestreamPartParams: newParams,
        minNumQualityLayers: minNumQualityLayers
        };
};

JpipImageDataContext.prototype._ensureNotDisposed = function ensureNotDisposed() {
    if (this.isDisposed()) {
        throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot use ImageDataContext after disposed');
    }
};
