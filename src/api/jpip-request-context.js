'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipRequestContext = (function JpipRequestContext() {
    var STATUS_ACTIVE = 1;
    var STATUS_WAITING_FOR_USER_INPUT = 2;
    var STATUS_PAUSED = 3;
    var STATUS_ENDED = 4;
    
    var STATUS_ZOMBIE_OF_MOVABLE_REQUEST = 5;
    
    var requestIdCounter = 0;
    var showLogs = false;
    
    function JpipRequestContext(
        jpipObjects, codestreamPartParams, callback, progressiveness, options) {
        
        var disableServerRequests = options.disableServerRequests;
        var isMovable = options.isMovable;
        var userContextVars = options.userContextVars;
        var failureCallback = options.failureCallback;
        var lastServerRequest = null;
        var statusWhenFinished = isMovable ?
            STATUS_ZOMBIE_OF_MOVABLE_REQUEST: STATUS_WAITING_FOR_USER_INPUT;
        
        var requester = jpipObjects.requester;
        var reconstructor = jpipObjects.reconstructor;
        var packetsDataCollector = jpipObjects.packetsDataCollector;
        var qualityLayersCache = jpipObjects.qualityLayersCache;
        var codestreamStructure = jpipObjects.codestreamStructure;
        var databinsSaver = jpipObjects.databinsSaver;
        var jpipFactory = jpipObjects.jpipFactory;
        
        var listener = null;
        
        var self = this;
        var progressiveStagesFinished = 0;
        var alreadyReturnedCodeblocks = null;
        var qualityLayersReached = 0;

        var status = getInitialStatus(codestreamPartParams, isMovable);
        
        var isFailure = false;
        var isWaitingForQualityLayer = false;
        var isWaitingForServer = false;
        var isRequestDone = false;
        
        var dedicatedChannelHandle = options.dedicatedChannelHandle;
        
        var requestId = ++requestIdCounter;
        
        this.getRequestId = function getRequestId() {
            return requestId;
        };
        
        this.createMovedRequest = function move(
            newCodestreamPartParams, newProgressiveness) {
            
            // TODO: Move logic of casting progressiveness from the
            // codestreamClient to here
            
            if (!isMovable) {
                throw new jGlobals.jpipExceptions.InvalidOperationException(
                    'createMovedRequest() is supported only for movable ' +
                    'requests. Create the request with options.isMovable = true');
            }
            
            ensureNoFailure();

            updateStatus(STATUS_ENDED, 'createMovedRequest()');
            
            var modifiedOptions = options;
            if (options.dedicatedChannelHandle === undefined &&
                dedicatedChannelHandle !== undefined) {
                
                modifiedOptions = Object.create(options);
                modifiedOptions.dedicatedChannelHandle = dedicatedChannelHandle;
            }
            
            var requestContext = new JpipRequestContext(
                jpipObjects,
                newCodestreamPartParams || codestreamPartParams,
                callback,
                newProgressiveness || progressiveness,
                modifiedOptions);
            
            return requestContext;
        };
        
        this.ignorePreviousFailure = function ignorePreviousFailure() {
            isFailure = false;
        };
        
        this.createCodestream = function createCodestream(
            isOnlyHeadersWithoutBitstream, maxNumQualityLayers) {
            
            ensureNoFailure();
            
            var params = getParamsForDataWriter(maxNumQualityLayers);
            
            var codestream = reconstructor.createCodestreamForRegion(
                params.codestreamPartParams,
                params.minNumQualityLayers,
                isOnlyHeadersWithoutBitstream);
            
            if (codestream === null) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Could not reconstruct codestream although ' +
                    'progressiveness stage has been reached');
            }
            
            return codestream;
        };
        
        this.getNewCodeblocksData = function getNewCodeblocksData(
            maxNumQualityLayers) {
            
            ensureNoFailure();

            if (alreadyReturnedCodeblocks === null) {
                var result = getAllCodeblocksData();
                return result;
            }
            
            var params = getParamsForDataWriter(maxNumQualityLayers);
            var codeblocksData = packetsDataCollector
                .getNewCodeblocksDataAndUpdateReturnedCodeblocks(
                    params.codestreamPartParams,
                    params.minNumQualityLayers,
                    alreadyReturnedCodeblocks);
            
            if (codeblocksData === null) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Could not collect codeblocks although progressiveness ' +
                    'stage has been reached');
            }
            
            return codeblocksData;
        };
        
        this.endAsync = function endAsync() {
            if (isMovable) {
                throw new jGlobals.jpipExceptions.InvalidOperationException(
                    'endAsync() is not supported for movable requests');
            }

            ensureNoFailure();
            ensureNotEnded(status);
            updateStatus(STATUS_ENDED, 'endAsync()');
            
            // NOTE: This will be used when reconnect is implemented, to note
            // that the data related to this request that had been already
            // recieved is not needed to be copied to the new client
        };
        
        this.pauseAsync = function pauseAsync() {
            ensureNoFailure();
            ensureNotEnded(status);
            updateStatus(STATUS_PAUSED, 'pauseAsync()');
        };
        
        this.hasData = function hasData() {
            ensureNoFailure();
            return progressiveStagesFinished > 0;
        };
        
        this.getAllCodeblocksData = getAllCodeblocksData;
        
        this.tryContinueRequest = tryContinueRequest;
        
        function getAllCodeblocksData(maxNumQualityLayers) {
            ensureNoFailure();
            var params = getParamsForDataWriter(maxNumQualityLayers);
            var codeblocks = packetsDataCollector.getAllCodeblocksData(
                params.codestreamPartParams,
                params.minNumQualityLayers);
            
            if (codeblocks.codeblocksData === null) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Could not collect codeblocks although progressiveness ' +
                    'stage has been reached');
            }
            
            alreadyReturnedCodeblocks = codeblocks.alreadyReturnedCodeblocks;
            return codeblocks.codeblocksData;
        }
        
        function tryContinueRequest() {
            ensureNoFailure();
            ensureNotEnded(status);
            
            if (listener === null) {
                listener = jpipFactory.createRequestDatabinsListener(
                    codestreamPartParams,
                    qualityLayerReachedCallback,
                    codestreamStructure,
                    databinsSaver,
                    qualityLayersCache);
                
                tryAdvanceProgressiveStage();
                isRequestDone = progressiveStagesFinished === progressiveness.length;
            }
            
            if (isWaitingForServer) {
                updateStatus(
                    STATUS_ACTIVE, 'tryContinueRequest(): isWaitingForServer');
                
                if (isRequestDone) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Inconsistent state: isWaitingForServer=true, ' +
                        'needMoreRequests=false');
                }
                
                return !isRequestDone;
            }
            
            if (isRequestDone) {
                updateStatus(
                    statusWhenFinished,
                    'tryContinueRequest(): !needMoreRequests');

                return !isRequestDone;
            }
            
            isWaitingForQualityLayer = true;
            
            var newStatus = isRequestDone ? statusWhenFinished : STATUS_ACTIVE;
            
            updateStatus(newStatus, 'tryContinueRequest(): end function');
            
            if (isWaitingForServer || disableServerRequests) {
                return !isRequestDone;
            }

            // If still waiting for quality layer but no request to server
            // has been done, then request data from server
            
            if (lastServerRequest !== null) {
                requester.stopRequestAsync(lastServerRequest);
            }
                
            isWaitingForServer = true;
            var numQualityLayersToWait =
                progressiveness[progressiveStagesFinished].minNumQualityLayers;
            
            if (isMovable && dedicatedChannelHandle === undefined) {
                dedicatedChannelHandle =
                    requester.dedicateChannelForMovableRequest();
            }
            
            lastServerRequest = requester.requestData(
                codestreamPartParams,
                requesterCallbackOnAllDataRecieved,
                requesterCallbackOnFailure,
                numQualityLayersToWait,
                dedicatedChannelHandle);

            return !isRequestDone;
        }
        
        function requesterCallbackOnAllDataRecieved(request, isResponseDone) {
            if (isResponseDone && request === lastServerRequest) {
                throw new jGlobals.jpipExceptions.IllegalDataException(
                    'JPIP server not returned all data', 'D.3');
            }
        }
        
        function requesterCallbackOnFailure() {
            updateStatus(STATUS_ENDED, 'endAsync()');
            
            if (failureCallback !== undefined) {
                failureCallback(self, userContextVars);
            } else {
                isFailure = true;
            }
        }
        
        function qualityLayerReachedCallback(qualityLayersReached_) {
            qualityLayersReached = qualityLayersReached_;
            
            if (status === STATUS_ENDED) {
                throw new jGlobals.jpipExcpetions.InternalErrorException(
                    'Callback from requestDatabinsListener after request ended');
            }
            
            if (!isWaitingForQualityLayer /* && !disableServerRequests */) {
                return;
            }
            
            if (tryAdvanceProgressiveStage()) {
                isWaitingForQualityLayer = false;
                isWaitingForServer = false;
            }
            
            updateStatus(
                STATUS_WAITING_FOR_USER_INPUT, 'qualityLayerReachedCallback');

            // Do not call callback from within tryContinueRequest() called
            // by the user: avoid recursive calls, he can perform his operations
            // after tryContinueRequest() returns
            
            if (isRequestDone) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Request already done but callback is called');
            }
            
            isRequestDone = progressiveStagesFinished === progressiveness.length;
            callback(self, userContextVars, isRequestDone);

            ensureNotWaitingForUserInput(status);
        }
        
        function tryAdvanceProgressiveStage() {
            var numQualityLayersToWait =
                progressiveness[progressiveStagesFinished].minNumQualityLayers;

            if (qualityLayersReached < numQualityLayersToWait) {
                return false;
            }
            
            if (qualityLayersReached === 'max') {
                progressiveStagesFinished = progressiveness.length;
            }
            
            while (progressiveStagesFinished < progressiveness.length) {
                var qualityLayersRequired =
                    progressiveness[progressiveStagesFinished].minNumQualityLayers;
                
                if (qualityLayersRequired === 'max' ||
                    qualityLayersRequired > qualityLayersReached) {
                    
                    break;
                }
                
                ++progressiveStagesFinished;
            }
            
            return true;
        }
        
        function getParamsForDataWriter(maxNumQualityLayers) {
            ensureNotEnded(status, /*allowZombie=*/true);
            
            if (codestreamPartParams === null) {
                throw new jGlobals.jpipExceptions.InvalidOperationException('Cannot ' +
                    'get data of zombie request with no codestreamPartParams');
            }
            
            var isRequestDone = progressiveStagesFinished === progressiveness.length;
            if (!isRequestDone) {
                ensureNotWaitingForUserInput(status);
            }
            
            if (progressiveStagesFinished === 0) {
                throw new jGlobals.jpipExceptions.IllegalOperationException(
                    'Cannot create codestream before first progressiveness ' +
                    'stage has been reached');
            }
            
            var minNumQualityLayers =
                progressiveness[progressiveStagesFinished - 1].minNumQualityLayers;
            
            var newParams = codestreamPartParams;
            if (maxNumQualityLayers !== undefined) {
                newParams = Object.create(codestreamPartParams);
                newParams.maxNumQualityLayers = maxNumQualityLayers;
                
                if (minNumQualityLayers !== 'max') {
                    minNumQualityLayers = Math.min(
                        minNumQualityLayers, maxNumQualityLayers);
                }
            }
            
            return {
                codestreamPartParams: newParams,
                minNumQualityLayers: minNumQualityLayers
                };
        }
        
        function updateStatus(newStatus, location) {
            if (showLogs) {
                /* global console: false */
                console.log('Request ' + requestId + ' status changed: ' +
                    status + ' -> ' + newStatus + ' (' + location + ')');
            }
            
            if (listener !== null && newStatus === STATUS_ENDED) {
                listener.unregister();
                listener = null;
            }

            status = newStatus;
            
            if (newStatus !== STATUS_PAUSED && newStatus !== STATUS_ENDED) {
                return;
            }
            
            if (lastServerRequest !== null) {
                requester.stopRequestAsync(lastServerRequest);
                lastServerRequest = null;
            }
        }

        function ensureNoFailure() {
            if (isFailure) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'An error occurred while previous request from server. ' +
                    'Use ignorePreviousFailure() to ignore and continue');
            }
        }
    }
    
    function ensureNotEnded(status, allowZombie) {
        var notEndedDescription =
            'Cannot perform this operation after request ended';
        
        ensureNoStatus(status, STATUS_ENDED, notEndedDescription);
        
        if (allowZombie) {
            return;
        }
        
        var noZombieDescription =
            'Cannot perform this operation on zombie request (= request with ' +
            'codestreamPartParams = null, used as the first request of ' +
            'movable request';
        
        ensureNoStatus(
            status,
            STATUS_ZOMBIE_OF_MOVABLE_REQUEST,
            noZombieDescription);
    }
    
    function ensureNotWaitingForUserInput(status) {
        var description =
            'Call for endAsync(), pauseAsync() or tryContinueRequest() has ' +
                'not been performed';
                
        ensureNoStatus(status, STATUS_WAITING_FOR_USER_INPUT, description);
    }
    
    function ensureNoStatus(status, unexpectedStatus, exceptionDescription) {
        if (status === unexpectedStatus) {
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                exceptionDescription);
        }
    }
    
    function getInitialStatus(codestreamPartParams, isMovable) {
        if (codestreamPartParams !== null) {
            return STATUS_PAUSED;
        } else if (isMovable) {
            return STATUS_ZOMBIE_OF_MOVABLE_REQUEST;
        }
        
        throw new jGlobals.jpipExceptions.ArgumentException(
            'codestreamPartParams',
            codestreamPartParams,
            'Non movable request must  have codestreamPartParams !== null');
    }
    
    return JpipRequestContext;
})();