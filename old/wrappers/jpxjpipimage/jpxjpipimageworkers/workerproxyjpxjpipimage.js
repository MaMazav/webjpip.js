'use strict';

var WorkerProxyJpxJpipImage = (function WorkerProxyJpxJpipImageClosure() {
    function WorkerProxyJpxJpipImage(options) {
        this._imageWidth = null;
        this._imageHeight = null;
        this._sizesParams = null;
        this._tileWidth = 0;
        this._tileHeight = 0;
        this._currentStatusCallbackWrapper = null;
        
        var ctorArgs = [options];
        var scriptUrl = SlaveSideWorkerHelper.getMasterEntryUrl() +
            '/../wrappers/jpxjpipimage/jpxjpipimageworkers/jpxjpipimageworker.js';
        
        this._workerHelper = new MasterSideWorkerHelper(scriptUrl, ctorArgs);
        
        var boundUserDataHandler = this._userDataHandler.bind(this);
        this._workerHelper.setUserDataHandler(boundUserDataHandler);
    }
    
    WorkerProxyJpxJpipImage.prototype = {
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
        
        getLevelWidth: function getLevelWidth(numResolutionLevelsToCut) {
            if (this._sizesCalculator === null) {
                throw 'Image is not ready yet';
            }

            var width = this._sizesCalculator.getLevelWidth(
                numResolutionLevelsToCut);
            return width;
        },
        
        getLevelHeight: function getLevelHeight(numResolutionLevelsToCut) {
            if (this._sizesCalculator === null) {
                throw 'Image is not ready yet';
            }
            
            var height = this._sizesCalculator.getLevelHeight(
                numResolutionLevelsToCut);
            return height;
        },
        
        getTileWidth: function getTileWidth() {
            if (this._tileWidth === 0) {
                throw 'Image is not ready yet';
            }

            return this._tileWidth;
        },
        
        getTileHeight: function getTileHeight() {
            if (this._tileHeight === 0) {
                throw 'Image is not ready yet';
            }

            return this._tileHeight;
        },
        
        getDefaultNumResolutionLevels: function getDefaultNumResolutionLevels() {
            if (this._sizesCalculator === null) {
                throw 'Image is not ready yet';
            }
            
            var numLevels = this._sizesCalculator.getDefaultNumResolutionLevels();
            return numLevels;
        },
        
        getDefaultNumQualityLayers: function getDefaultNumQualityLayers() {
            if (this._sizesCalculator === null) {
                throw 'Image is not ready yet';
            }
            
            var numLayers = this._sizesCalculator.getDefaultNumQualityLayers();
            return numLayers;
        },
        
        createMovableRequestHandle: function createMovableRequestHandle(
            createdCallback) {
            
            var callbackWrapper = this._workerHelper.wrapCallbackFromMasterSide(
                createdCallback, 'JpipJpxImage_createMovableRequestHandleCallback');
            
            var args = [callbackWrapper];
            this._workerHelper.callFunction('createMovableRequestHandle', args);
        },
        
        requestPixels: function requestPixels(codestreamPartParams) {
            var pathToPixelsArray = ['pixels', 'buffer'];
            var transferables = [pathToPixelsArray];
            
            var args = [codestreamPartParams];
            
            this._workerHelper.callFunction('requestPixels', args, {
                isReturnPromise: true,
                pathsToTransferablesInPromiseResult: transferables
            });
        },
        
        requestPixelsProgressive: function requestPixelsProgressive(
            codestreamPartParams,
            callback,
            terminatedCallback,
            codestreamPartParamsNotNeeded,
            movableRequestHandleToChange) {
            
            var transferables;
            
            // NOTE: Cannot pass it as transferables because it is passed to all
            // listener callbacks, thus after the first one the buffer is not valid
            
            //var pathToPixelsArray = [0, 'pixels', 'buffer'];
            //transferables = [pathToPixelsArray];
            
            var internalCallbackWrapper =
                this._workerHelper.wrapCallbackFromMasterSide(
                    callback,
                    'requestPixelsProgressiveCallback',
                    /*isMultipleTimeCallback=*/true,
                    transferables);
            
            var internalTerminatedCallbackWrapper =
                this._workerHelper.wrapCallbackFromMasterSide(
                    internalTerminatedCallback,
                    'requestPixelsProgressiveTerminatedCallback',
                    /*isMultipleTimeCallback=*/false);
                    
            var args = [
                codestreamPartParams,
                internalCallbackWrapper,
                internalTerminatedCallbackWrapper,
                codestreamPartParamsNotNeeded,
                movableRequestHandleToChange];
            
            this._workerHelper.callFunction('requestPixelsProgressive', args);
                
            var self = this;
            
            function internalTerminatedCallback(isAborted) {
                self._workerHelper.freeCallback(internalCallbackWrapper);
                
                terminatedCallback(isAborted);
            }
        },
        
        setServerRequestPrioritizerData :
            function setServerRequestPrioritizerData(prioritizerData) {
            
            this._workerHelper.callFunction(
                'setServerRequestPrioritizerData',
                [ prioritizerData ],
                { isSendImmediately: true });
        },
        
        setDecodePrioritizerData :
            function setDecodePrioritizerData(prioritizerData) {
            
            this._workerHelper.callFunction(
                'setDecodePrioritizerData',
                [ prioritizerData ],
                { isSendImmediately: true });
        },
        
        reconnect: function reconnect() {
            this._workerHelper.callFunction('reconnect');
        },
        
        _getSizesCalculator: function getSizesCalculator() {
            if (this._sizesCalculator === null) {
                throw 'Image is not ready yet';
            }
            
            return this._sizesCalculator;
        },
        
        _getSizesParams: function getSizesParams() {
            if (this._sizesParams === null) {
                throw 'Image is not ready yet';
            }
            
            return this._sizesParams;
        },
        
        _userDataHandler: function userDataHandler(sizesParams) {
            this._sizesParams = sizesParams;
            this._tileWidth = sizesParams.applicativeTileWidth;
            this._tileHeight = sizesParams.applicativeTileHeight;
            this._sizesCalculator = new JpipCodestreamSizesCalculator(
                sizesParams.jpipImageParams);
        }
    }; // Prototype
    
    return WorkerProxyJpxJpipImage;
})();