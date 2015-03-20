'use strict';

var WorkerProxyCodestreamClientManager = (function WorkerProxyCodestreamClientManagerClosure() {
    function WorkerProxyCodestreamClientManager(options) {
        this._imageWidth = null;
        this._imageHeight = null;
        this._sizesParams = null;
        this._currentStatusCallbackWrapper = null;
        
        var ctorArgs = [options];
        var scriptUrl = SlaveSideWorkerHelper.getMasterEntryUrl() +
            '/../wrappers/jpxjpipimage/jpxjpipimageworkers/codestreamclientmanagerworker.js';
        
        this._workerHelper = new MasterSideWorkerHelper(scriptUrl, ctorArgs);
        
        var boundUserDataHandler = this._userDataHandler.bind(this);
        this._workerHelper.setUserDataHandler(boundUserDataHandler);
    }
    
    WorkerProxyCodestreamClientManager.prototype = {
        setStatusCallback: function setStatusCallback(statusCallback) {
            if (this._currentStatusCallbackWrapper !== null) {
                this._workerHelper.freeCallback(this._currentStatusCallbackWrapper);
            }
            
            var callbackWrapper = this._workerHelper.wrapCallbackFromMasterSide(
                statusCallback, 'statusCallback', /*isMultipleTimeCallback=*/true);
            
            this._currentStatusCallbackWrapper = callbackWrapper;
            this._workerHelper.callFunction('setStatusCallback', [callbackWrapper]);
        },
        
        open: function open(url) {
            this._workerHelper.callFunction('open', [url]);
        },
        
        close: function close(closedCallback) {
            var self = this;
            
            var callbackWrapper = this._workerHelper.wrapCallbackFromMasterSide(
                internalClosedCallback, 'closedCallback');
                
            this._workerHelper.callFunction('close', [callbackWrapper]);
            
            function internalClosedCallback() {
                self._workerHelper.terminate();
                
                if (closedCallback !== undefined) {
                    closedCallback();
                }
            }
        },
        
        createMovableRequestHandle: function createMovableRequestHandle(
            createdCallback) {
            
            var callbackWrapper = this._workerHelper.wrapCallbackFromMasterSide(
                createdCallback,
                'CodestreamClientManager_createMovableRequestHandleCallback');
            
            var args = [callbackWrapper];
            this._workerHelper.callFunction('createMovableRequestHandle', args);
        },
        
        moveRequest: function moveRequest(
            movableRequestHandle, codestreamPartParams) {
            
            var args = [movableRequestHandle, codestreamPartParams];
            this._workerHelper.callFunction('moveRequest', args);
        },
        
        createRequest: function createRequest(
            fetchParams,
            callbackThis,
            callback,
            terminatedCallback,
            isOnlyWaitForData,
            requestId) {
            
            var pathToArrayInPacketsData = [0, 'data', 'buffer'];
            var pathToHeadersCodestream = [1, 'codestream', 'buffer'];
            var transferablePaths = [
                pathToArrayInPacketsData,
                pathToHeadersCodestream
            ];
            
            var internalCallbackWrapper =
                this._workerHelper.wrapCallbackFromMasterSide(
                    callback.bind(callbackThis),
                    'requestTilesProgressiveCallback',
                    /*isMultipleTimeCallback=*/true,
                    transferablePaths);
            
            var internalTerminatedCallbackWrapper =
                this._workerHelper.wrapCallbackFromMasterSide(
                    internalTerminatedCallback,
                    'requestTilesProgressiveTerminatedCallback',
                    /*isMultipleTimeCallback=*/false);
                    
            var args = [
                fetchParams,
                /*callbackThis=*/{ dummyThis: 'dummyThis' },
                internalCallbackWrapper,
                internalTerminatedCallbackWrapper,
                isOnlyWaitForData,
                requestId];
                
            var self = this;
            
            this._workerHelper.callFunction('createRequest', args);
            
            function internalTerminatedCallback(isAborted) {
                self._workerHelper.freeCallback(internalCallbackWrapper);
                terminatedCallback.call(callbackThis, isAborted);
            }
        },
        
        manualAbortNonMovableRequest: function manualAbortNonMovableRequest(
            requestId) {
            
            var args = [requestId];
            this._workerHelper.callFunction(
                'manualAbortNonMovableRequest', args);
        },
        
        setIsProgressiveRequest: function setIsProgressiveRequest(
            requestId, isProgressive) {
            
            var args = [requestId, isProgressive];
            this._workerHelper.callFunction('setIsProgressiveRequest', args);
        },
        
        setServerRequestPrioritizerData :
            function setServerRequestPrioritizerData(prioritizerData) {
            
            this._workerHelper.callFunction(
                'setServerRequestPrioritizerData',
                [ prioritizerData ],
                { isSendImmediately: true });
        },
        
        reconnect: function reconnect() {
            this._workerHelper.callFunction('reconnect');
        },
        
        getSizesParams: function getSizesParams() {
            if (this._sizesParams === null) {
                throw 'Image is not ready yet';
            }
            
            return this._sizesParams;
        },
        
        _userDataHandler: function userDataHandler(sizesParams) {
            this._sizesParams = sizesParams;
            //this._tileWidth = sizesParams.tileWidth;
            //this._tileHeight = sizesParams.tileHeight;
            //this._sizesCalculator = new JpipCodestreamSizesCalculator(
            //    sizesParams);
        }
    }; // Prototype
    
    return WorkerProxyCodestreamClientManager;
})();