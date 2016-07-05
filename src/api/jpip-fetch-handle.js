'use strict';

module.exports.JpipFetchHandle = JpipFetchHandle;

var jGlobals = require('j2k-jpip-globals.js');

function JpipFetchHandle(requester, imageDataContext, dedicatedChannelHandle) {
    this._requester = requester;
    this._imageDataContext = imageDataContext;
    this._serverRequest = null;
    this._dedicatedChannelHandle = dedicatedChannelHandle;
    this._isFailure = false;
    this._isMoved = false;
    this._requestedQualityLayer = 0;
    this._reachedQualityLayer = 0;
    this._requesterCallbackOnFailureBound = this._requesterCallbackOnFailure.bind(this);
    
    if (imageDataContext.isDisposed()) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot initialize JpipFetchHandle with disposed ImageDataContext');
    }
    imageDataContext.on('data', this._onData.bind(this));
}

JpipFetchHandle.prototype.resume = function resume() {
    if (this._serverRequest !== null) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot resume already-active-fetch');
    }
    
    if (this._imageDataContext.isDisposed()) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot fetch data with disposed imageDataContext');
    }
    
    if (this._isMoved) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot resume movable fetch which has been already moved; Should' +
            ' start a new fetch with same dedicatedChannelHandle instead');
    }
    
    this._requestData();
};

JpipFetchHandle.prototype.stopAsync = function stopAsync() {
    if (this._serverRequest === null) {
        if (this._imageDataContext.isDisposed() || this._imageDataContext.isDone()) {
            return;
        }
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot stop already stopped fetch');
    }
    
    if (this._dedicatedChannelHandle) {
        this._isMoved = true;
    } else {
        this._requester.stopRequestAsync(this._serverRequest);
        this._serverRequest = null;
    }
    
    return new Promise(function(resolve, reject) {
        // NOTE: Send a stop request within JpipRequest and resolve the Promise
        // only after server response (This is only performance issue, no
        // functional problem: a new fetch will trigger a JPIP request with
        // wait=no, and the old request will be actually stopped).
        resolve();
    });
};

JpipFetchHandle.prototype._requesterCallbackOnAllDataRecieved =
    function (request, isResponseDone, requestedQualityLayer) {
    
    if (isResponseDone &&
        !this._isMoved &&
        !this._imageDataContext.isDisposed() &&
        requestedQualityLayer > this._reachedQualityLayer) {
            
        throw new jGlobals.jpipExceptions.IllegalDataException(
            'JPIP server not returned all data', 'D.3');
    }
};

JpipFetchHandle.prototype._requesterCallbackOnFailure =
    function requesterCallbackOnFailure() {
        
    //updateStatus(STATUS_ENDED, 'endAsync()');
    
    //if (failureCallback !== undefined) {
    //    failureCallback(self, userContextVars);
    //} else {
    //    isFailure = true;
    //}
    this._isFailure = true;

    if (this._isMoved) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Failure callback to an old fetch which has been already moved');
    }
};

JpipFetchHandle.prototype._onData = function onData(imageDataContext) {
    this._reachedQualityLayer = this._requestedQualityLayer;
    
    if (imageDataContext !== this._imageDataContext) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Unexpected ImageDataContext in FetchHandle event');
    }
    
    if (!this._isMoved &&
        !this._imageDataContext.isDisposed() &&
        this._serverRequest !== null) {
        
        this._requestData();
    }
};

JpipFetchHandle.prototype._requestData = function requestData() {
    if (this._imageDataContext.isDone()) {
        return;
    }
    
    var self = this;
    var numQualityLayersToWait = this._imageDataContext.getNextQualityLayer();
    this._requestedQualityLayer = numQualityLayersToWait;
        
    this._serverRequest = this._requester.requestData(
        this._imageDataContext.getCodestreamPartParams(),
        function allDataRecieved(request, isResponseDone) {
            self._requesterCallbackOnAllDataRecieved(
                request, isResponseDone, numQualityLayersToWait);
        },
        this._requesterCallbackOnFailureBound,
        numQualityLayersToWait,
        this._dedicatedChannelHandle);
};