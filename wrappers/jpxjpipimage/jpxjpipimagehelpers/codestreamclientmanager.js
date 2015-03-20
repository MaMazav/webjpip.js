'use strict';

var CodestreamClientManager = (function CodestreamClientManager() {
    function CodestreamClientManager(options) {
        var serverRequestsLimit = options.serverRequestsLimit || 5;
        
        this._codestreamClient = new JpipCodestreamClient();
        this._showLog = options.showLog;
        this._sizesCalculator = null;
        
        var serverRequestScheduler = jpipImageHelperFunctions.createScheduler(
            options.showLog,
            options.serverRequestPrioritizer,
            'serverRequest',
            createServerRequestDummyResource,
            serverRequestsLimit);
        
        this._serverRequestPrioritizer = serverRequestScheduler.prioritizer;
        
        this._requestManager = new ScheduledRequestManager(
            this._codestreamClient, serverRequestScheduler.scheduler);
    }
    
    CodestreamClientManager.prototype = {
        setStatusCallback: function setStatusCallback(statusCallback) {
            this._codestreamClient.setStatusCallback(statusCallback);
        },
        
        open : function open(url) {
            this._codestreamClient.open(url);
        },
        
        close: function close(closedCallback) {
            this._codestreamClient.close(closedCallback);
        },
        
        getSizesParams: function getSizesParams() {
            var sizesParams = this._codestreamClient.getSizesParams();
            return sizesParams;
        },
        
        setIsProgressiveRequest: function setIsProgressiveRequest(
            requestId, isProgressive) {
            
            var contextVars = this._requestManager.getContextVars(requestId);
            if (contextVars !== null) {
                contextVars.isProgressive = isProgressive;
            }
        },
        
        createMovableRequestHandle: function createMovableRequestHandle(
            createdCallback) {
            
            var requestHandle = this._requestManager.createMovableRequestHandle();
            createdCallback(requestHandle);
        },
        
        moveRequest: function moveRequest(
            movableRequestHandle, codestreamPartParams) {
            
            this._requestManager.moveRequest(
                movableRequestHandle, codestreamPartParams);
        },
        
        createRequest: function createRequest(
            fetchParams,
            callbackThis,
            callback,
            terminatedCallback,
            isOnlyWaitForData,
            requestId) {
            
            var contextVars = {
                progressiveStagesDone: 0,
                isProgressive: false,
                isLastCallbackCalledWithoutLowQualityLayerLimit: false,
                callbackThis: callbackThis,
                callback: callback,
                terminatedCallback: terminatedCallback
            };
            
            this._requestManager.createRequest(
                fetchParams,
                contextVars,
                internalCallback,
                internalTerminatedCallback,
                isOnlyWaitForData,
                requestId);
        },
        
        manualAbortNonMovableRequest: function manualAbortNonMovableRequest(
            requestId) {
            
            this._requestManager.manualAbortNonMovableRequest(requestId);
        },
        
        reconnect: function reconnect() {
            this._codestreamClient.reconnect();
        },
        
        setServerRequestPrioritizerData :
            function setServerRequestPrioritizerData(prioritizerData) {
                if (this._serverRequestPrioritizer === null) {
                    throw 'No serverRequest prioritizer has been set';
                }
                
                if (this._showLog) {
                    console.log('setServerRequestPrioritizerData(' + prioritizerData + ')');
                }
                
                prioritizerData.image = this;
                this._serverRequestPrioritizer.setPrioritizerData(prioritizerData);
            },
        
        getLevelWidth: function getLevelWidth(numResolutionLevelsToCut) {
            validateSizesCalculator(this);
            var width = this._sizesCalculator.getLevelWidth(
                numResolutionLevelsToCut);

            return width;
        },
        
        getLevelHeight: function getLevelHeight(numResolutionLevelsToCut) {
            validateSizesCalculator(this);
            var height = this._sizesCalculator.getLevelHeight(
                numResolutionLevelsToCut);

            return height;
        },
        
        getDefaultNumResolutionLevels: function getDefaultNumResolutionLevels() {
            validateSizesCalculator(this);
            var numLevels = this._sizesCalculator.getDefaultNumResolutionLevels();
            
            return numLevels;
        }
    };
    
    function internalCallback(contextVars, requestContext) {
        var isLimitToLowQualityLayer = 
            contextVars.progressiveStagesDone === 0;
        
        // See comment at internalTerminatedCallback method
        contextVars.isLastCallbackCalledWithoutLowQualityLayerLimit |=
            contextVars.isProgressive &&
            !isLimitToLowQualityLayer;
        
        if (!contextVars.isProgressive) {
            return;
        }
        
        var maxNumQualityLayers =
            isLimitToLowQualityLayer ? 1 : undefined;
        
        ++contextVars.progressiveStagesDone;
        
        extractDataAndCallCallback(
            contextVars, requestContext, maxNumQualityLayers);
    }
    
    function internalTerminatedCallback(contextVars, requestContext, isAborted) {
        if (!contextVars.isLastCallbackCalledWithoutLowQualityLayerLimit) {
            // This condition come to check if another decoding should be done.
            // One situation it may happen is when the request is not
            // progressive, then the decoding is done only on termination.
            // Another situation is when only the first stage has been reached,
            // thus the callback was called with only the first quality layer
            // (for performance reasons). Thus another decoding should be done.
            
            extractDataAndCallCallback(contextVars, requestContext);
        }
        
        contextVars.terminatedCallback.call(
            contextVars.callbackThis, isAborted);
    }

    function extractDataAndCallCallback(
        contextVars, requestContext, maxNumQualityLayers) {
        
        var packetsData = requestContext.getAllCodeblocksData(
            maxNumQualityLayers);
            
        var headersCodestream = requestContext.createCodestream(
            /*isOnlyHeadersWithoutBitstream=*/true);
        
        headersCodestream.codestream =
            convertToTypedArray(headersCodestream.codestream);
        
        contextVars.callback.call(
            contextVars.callbackThis, packetsData, headersCodestream);
    }

    function createServerRequestDummyResource() {
        return {};
    }
    
    function validateSizesCalculator(self) {
        if (self._sizesCalculator !== null) {
            return;
        }
        
        self._imageParams = self.getSizesParams();
        self._sizesCalculator = new JpipCodestreamSizesCalculator(
            self._imageParams);
    }
    
    function convertToTypedArray(array) {
        // NOTE: This can be done more efficiently within reconstruction,
        // if the array is lazily built from the databin parts and then
        // copied to a new arrayBuffer directly
        
        var typedArray = new Uint8Array(array.length);
        for (var i = 0; i < array.length; ++i) {
            typedArray[i] = array[i];
        }
        
        return typedArray;
    }
    
    return CodestreamClientManager;
})();