'use strict';

var ScheduledRequestManager = (function ScheduledRequestManagerClosure() {
    function ScheduledRequestManager(codestreamClient, scheduler) {
        this._codestreamClient = codestreamClient;
        this._scheduler = scheduler;
        this._requestHandleCounter = 0;
        this._movableRequestHandles = [];
        this._nonMovableRequestById = [];
    }
    
    ScheduledRequestManager.prototype = {
        createRequest: function createRequest(
            codestreamPartParams,
            contextVars,
            callback,
            terminatedCallback,
            isOnlyWaitForData,
            requestId) {
            
            var internalRequestVars = createInternalRequestVars(
                this,
                codestreamPartParams,
                contextVars,
                callback,
                terminatedCallback,
                isOnlyWaitForData,
                /*isMovable=*/false,
                requestId);
            
            if (this._nonMovableRequestById[requestId] !== undefined) {
                throw 'Duplication of requestId ' + requestId;
            } else if (requestId !== undefined) {
                this._nonMovableRequestById[requestId] = internalRequestVars;
            }
                
            if (internalRequestVars.useScheduler) {
                this._scheduler.enqueueJob(
                    startNonMovableRequest, internalRequestVars, requestAborted);
            } else {
                startNonMovableRequest(/*resource=*/null, internalRequestVars);
            }
        },
        
        createMovableRequestHandle: function createMovableRequestHandle() {
            var terminatedDummyCallback = dummyCallback;
            
            var internalRequestVars = createInternalRequestVars(
                this,
                /*codestreamPartParams=*/null,
                /*contextVars=*/null,
                dummyCallback,
                terminatedDummyCallback,
                /*isOnlyWaitForData=*/false,
                /*isMovable=*/true);
            
            if (internalRequestVars.useScheduler) {
                throw 'Unexpected useScheduler=true for movableRequest';
            }
            
            var requestHandle = ++this._requestHandleCounter;
            this._movableRequestHandles[requestHandle] = internalRequestVars;
            
            internalRequestVars.requestContext =
                this._codestreamClient.createMovableRequest(
                    jpipCallback,
                    internalRequestVars);
            
            return requestHandle;
        },
        
        moveRequest: function moveRequest(
            movableRequestHandle, newCodestreamPartParams) {
            
            var internalRequestVars = this._movableRequestHandles[
                movableRequestHandle];
            
            internalRequestVars.codestreamPartParams = newCodestreamPartParams;
            
            var newRequestContext =
                internalRequestVars.requestContext.createMovedRequest(
                    newCodestreamPartParams);
            
            internalRequestVars.requestContext = newRequestContext;
            
            startRequest(internalRequestVars);
        },
        
        manualAbortNonMovableRequest: function manualAbortNonMovableRequest(
            requestId) {
            
            var internalRequestVars = this._nonMovableRequestById[requestId];
            if (internalRequestVars === undefined) {
                // This situation might occur if request has been terminated,
                // but user's terminatedCallback has not been called yet. It
                // happens on WorkerProxyCodestreamClientManager due to thread
                // message delay.
                
                return;
            }
            
            internalRequestVars.isManuallyAborted = true;
            internalRequestVars.isTerminated = true;
            delete this._nonMovableRequestById[requestId];
            
            if (internalRequestVars.requestContext !== null) {
                internalRequestVars.requestContext.endAsync();
            }
        },
        
        getContextVars: function getContextVars(requestId) {
            var internalRequestVars = this._nonMovableRequestById[requestId];
            if (internalRequestVars === undefined) {
                // This situation might occur if request has been terminated,
                // but user's terminatedCallback has not been called yet. It
                // happens on WorkerProxyCodestreamClientManager due to thread
                // message delay.
                
                return null;
            }
            
            return internalRequestVars.contextVars;
        }
    }; // Prototype
    
    function createInternalRequestVars(
        self,
        codestreamPartParams,
        contextVars,
        callback,
        terminatedCallback,
        isOnlyWaitForData,
        isMovable,
        requestId) {
        
        return {
            codestreamPartParams: codestreamPartParams,
            progressiveStagesDone: 0,

            self: self,
            isYielded: false,
            isFailure: false,
            isTerminated: false,
            isManuallyAborted: false,
            requestId: requestId,
            contextVars: contextVars,
            callback: callback,
            terminatedCallback: terminatedCallback,
            isOnlyWaitForData: isOnlyWaitForData,
            isMovable: isMovable,
            useScheduler: !isMovable && !isOnlyWaitForData,
            requestContext: null,
            resource: null
        };
    }
    
    function startNonMovableRequest(resource, internalRequestVars, movableRequestHandle) {
        if (internalRequestVars.requestContext !== null) {
            throw 'Unexpected restart of already started request';
        }
        
        if (internalRequestVars.isManuallyAborted) {
            if (resource !== null) {
                this._scheduler.jobDone(resource, internalRequestVars);
            }
            
            return;
        }
        
        internalRequestVars.resource = resource;
        
        var options = {
            isOnlyWaitForData: internalRequestVars.isOnlyWaitForData
        };
        
        internalRequestVars.requestContext =
            internalRequestVars.self._codestreamClient.createProgressiveDataRequest(
                internalRequestVars.codestreamPartParams,
                jpipCallback,
                internalRequestVars,
                options);
        
        startRequest(internalRequestVars);
    }
    
    function startRequest(internalRequestVars) {
        var isDone = !internalRequestVars.requestContext.tryContinueRequest();
        
        if (internalRequestVars.requestContext.hasData()) {
            // Even if tryContinueRequest() returned true, is might be that
            // some data is already in cache but not all progressiveness stages
            // have been reached (see requestContext implementation)
            internalRequestVars.callback(
                internalRequestVars.contextVars,
                internalRequestVars.requestContext);
        }
            
        if (isDone) {
            requestTerminated(internalRequestVars, /*isAborted=*/false);
        }
    }
    
    function continueYieldedRequest(resource, internalRequestVars) {
        if (internalRequestVars.isFailure) {
            // NOTE: Should not call jobDone() ?
            return;
        }
        
        if (internalRequestVars.isManuallyAborted) {
            if (internalRequestVars.resource === null) {
                throw 'Unexpected continueYield without resource allocated';
            }
            
            this._scheduler.jobDone(
                internalRequestVars.resource, internalRequestVars);
            
            return;
        }
        
        if (!internalRequestVars.isYielded || internalRequestVars.isTerminated) {
            throw 'Unexpected request state on continue';
        }
        
        internalRequestVars.isYielded = false;
        internalRequestVars.resource = resource;
        
        continueRequestAndCallCallbacks(internalRequestVars);
    }
    
    function jpipCallback(requestContext, internalRequestVars) {
        try {
            if (internalRequestVars.isYielded || internalRequestVars.isTerminated) {
                throw 'Unexpected request state on jpip callback';
            }
            
            if (requestContext !== internalRequestVars.requestContext) {
                throw 'Unexpected requestContext';
            }
            
            ++internalRequestVars.progressiveStagesDone;
            
            if (internalRequestVars.useScheduler) {
                if (internalRequestVars.resource === null) {
                    throw 'No resource allocated but JPIP callback called';
                }
                
                internalRequestVars.self._scheduler.tryYield(
                    continueYieldedRequest,
                    internalRequestVars,
                    requestAborted,
                    requestYielded,
                    internalRequestVars.resource);
            }
            
            if (!internalRequestVars.isTerminated && !internalRequestVars.isYielded) {
                continueRequestAndCallCallbacks(internalRequestVars);
            }
        } catch (e) {
            internalRequestVars.isFailure = true;
            requestAborted(internalRequestVars);
        }
    }
    
    function continueRequestAndCallCallbacks(internalRequestVars) {
        var isDone = false;
        if (!internalRequestVars.isYielded) {
            isDone = !internalRequestVars.requestContext.tryContinueRequest();
        }
        
        internalRequestVars.callback(
            internalRequestVars.contextVars,
            internalRequestVars.requestContext);
        
        if (isDone) {
            requestTerminated(internalRequestVars, /*isAborted=*/false);
        }
    }
    
    function requestYielded(internalRequestVars) {
        if (internalRequestVars.isYielded || internalRequestVars.isTerminated) {
            throw 'Unexpected request state on yield';
        }
        
        internalRequestVars.isYielded = true;
        internalRequestVars.resource = null;
        internalRequestVars.requestContext.pauseAsync();
    }
    
    function requestAborted(internalRequestVars) {
        internalRequestVars.isYielded = false;
        internalRequestVars.resource = null;
        requestTerminated(internalRequestVars, /*isAborted=*/true);
    }
    
    function requestTerminated(internalRequestVars, isAborted) {
        if (internalRequestVars.isYielded || internalRequestVars.isTerminated) {
            throw 'Unexpected request state on terminated';
        }
        
        if (internalRequestVars.resource !== null) {
            if (isAborted) {
                throw 'Unexpected request termination without resource allocated';
            }

            internalRequestVars.self._scheduler.jobDone(
                internalRequestVars.resource, internalRequestVars);

            internalRequestVars.resource = null;
        } else if (!isAborted && internalRequestVars.useScheduler) {
            throw 'Job expected to have resource on successful termination';
        }
        
        if (internalRequestVars.isMovable) {
            // Movable request is not really terminated, but only replaced with
            // a new one (created by createMoveRequest()).
            
            return;
        }
        
        internalRequestVars.isTerminated = true;
        delete internalRequestVars.self._nonMovableRequestById[
            internalRequestVars.requestId];
            
        if (internalRequestVars.requestContext !== null &&
            !internalRequestVars.isFailure) {
            
            internalRequestVars.requestContext.pauseAsync();
        }

        internalRequestVars.terminatedCallback(
            internalRequestVars.contextVars,
            internalRequestVars.requestContext,
            isAborted);
        
        if (internalRequestVars.requestContext !== null &&
            !internalRequestVars.isFailure) {
            
            internalRequestVars.requestContext.endAsync();
        }
    }
    
    function dummyCallback() {
    }
    
    return ScheduledRequestManager;
})();