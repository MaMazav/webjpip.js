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
    this._requesterCallbackOnAllDataRecievedBound = this._requesterCallbackOnAllDataRecieved.bind(this);
    this._requesterCallbackOnFailureBound = this._requesterCallbackOnFailure.bind(this);
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
    
    if (this._imageDataContext.isDone()) {
        return;
    }
    
    var numQualityLayersToWait = this._imageDataContext.getNextQualityLayer();
        
    this._serverRequest = this._requester.requestData(
        this._imageDataContext.getCodestreamPartParams(),
        this._requesterCallbackOnAllDataRecievedBound,
        this._requesterCallbackOnFailureBound,
        numQualityLayersToWait,
        this._dedicatedChannelHandle);
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
    function requesterCallbackOnAllDataRecieved(request, isResponseDone) {
    
    if (this._isMoved) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Data callback to an old fetch which has been already moved');
    }
    
    if (isResponseDone &&
        !this._imageDataContext.isDisposed() &&
        !this._imageDataContext.isDone()) {
            
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