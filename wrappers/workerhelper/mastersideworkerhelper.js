'use strict';

var MasterSideWorkerHelper = (function MasterSideWorkerHelper() {
    var callId = 0;
    
    function MasterSideWorkerHelper(scriptUrl, ctorArgs, options) {
        var self = this;
        options = options || {};
        
        this._callbacks = [];
        this._pendingPromiseCalls = [];
        this._subWorkerById = [];
        this._subWorkers = [];
        this._worker = new Worker(scriptUrl);
        this._worker.onmessage = onWorkerMessageInternal;
        this._userDataHandler = null;
        this._notReturnedFunctions = 0;
        this._functionsBufferSize = options.functionsBufferSize || 5;
        this._pendingMessages = [];
        
        this._worker.postMessage({
            functionToCall: 'ctor',
            args: ctorArgs,
            callId: ++callId,
            isPromise: false,
            masterEntryUrl: SlaveSideWorkerHelper.getMasterEntryUrl()
        });
        
        function onWorkerMessageInternal(workerEvent) {
            onWorkerMessage(self, workerEvent);
        }
    }
    
    MasterSideWorkerHelper.prototype = {
        setUserDataHandler: function setUserDataHandler(userDataHandler) {
            this._userDataHandler = userDataHandler;
        },
        
        terminate: function terminate() {
            this._worker.terminate();
            for (var i = 0; i < this._subWorkers.length; ++i) {
                this._subWorkers[i].terminate();
            }
        },
        
        callFunction: function callFunction(functionToCall, args, options) {
            options = options || {};
            var isReturnPromise = !!options.isReturnPromise;
            var transferables = options.transferables;
            var pathsToTransferables =
                options.pathsToTransferablesInPromiseResult;
            
            var localCallId = ++callId;
            var promiseOnMasterSide = null;
            var self = this;
            
            if (isReturnPromise) {
                promiseOnMasterSide = new Promise(function promiseFunc(resolve, reject) {
                    self._pendingPromiseCalls[localCallId] = {
                        resolve: resolve,
                        reject: reject
                    };
                });
            }
            
            var sendMessageFunction = options.isSendImmediately ?
                sendMessageToSlave: enqueueMessageToSlave;
            
            sendMessageFunction(this, transferables, /*isFunctionCall=*/true, {
                functionToCall: functionToCall,
                args: args || [],
                callId: localCallId,
                isPromise: isReturnPromise,
                pathsToTransferablesInPromiseResult : pathsToTransferables
            });
            
            if (isReturnPromise) {
                return promiseOnMasterSide;
            }
        },
        
        wrapCallbackFromMasterSide: function wrapCallbackFromMasterSide(
            callback, callbackName, isMultipleTimeCallback, pathsToTransferables) {
            
            var localCallId = ++callId;
            
            var callbackHandle = {
                isWorkerHelperCallback: true,
                isMultipleTimeCallback: !!isMultipleTimeCallback,
                callId: localCallId,
                callbackName: callbackName,
                pathsToTransferables: pathsToTransferables
            };
            
            var internalCallbackHandle = {
                isMultipleTimeCallback: !!isMultipleTimeCallback,
                callId: localCallId,
                callback: callback,
                pathsToTransferables: pathsToTransferables
            };
            
            this._callbacks[localCallId] = internalCallbackHandle;
            
            return callbackHandle;
        },
        
        freeCallback: function freeCallback(callbackHandle) {
            delete this._callbacks[callbackHandle.callId];
        }
    }; // Prototype
    
    function onWorkerMessage(self, workerEvent) {
        var callId = workerEvent.data.callId;
        
        switch (workerEvent.data.type) {
            case 'functionCalled':
                --self._notReturnedFunctions;
                trySendPendingMessages(self);
                break;
            
            case 'promiseResult':
                var promiseData = self._pendingPromiseCalls[callId];
                delete self._pendingPromiseCalls[callId];
                
                var result = workerEvent.data.result;
                promiseData.resolve(result);
                
                break;
            
            case 'promiseFailure':
                var promiseData = self._pendingPromiseCalls[callId];
                delete self._pendingPromiseCalls[callId];
                
                var reason = workerEvent.data.reason;
                promiseData.reject(reason);
                
                break;
            
            case 'userData':
                if (self._userDataHandler !== null) {
                    self._userDataHandler(workerEvent.data.userData);
                }
                
                break;
            
            case 'callback':
                var callbackHandle = self._callbacks[workerEvent.data.callId];
                if (callbackHandle === undefined) {
                    throw 'Unexpected message from SlaveWorker of callback ID: ' +
                        workerEvent.data.callId + '. Maybe should indicate ' +
                        'isMultipleTimesCallback = true on creation?';
                }
                
                if (!callbackHandle.isMultipleTimeCallback) {
                    self.freeCallback(self._callbacks[workerEvent.data.callId]);
                }
                
                if (callbackHandle.callback !== null) {
                    callbackHandle.callback.apply(null, workerEvent.data.args);
                }
                
                break;
            
            case 'subWorkerCtor':
                var subWorker = new Worker(workerEvent.data.scriptUrl);
                var id = workerEvent.data.subWorkerId;
                
                self._subWorkerById[id] = subWorker;
                self._subWorkers.push(subWorker);
                
                subWorker.onmessage = function onSubWorkerMessage(subWorkerEvent) {
                    enqueueMessageToSlave(
                        self, subWorkerEvent.ports, /*isFunctionCall=*/false, {
                            functionToCall: 'subWorkerOnMessage',
                            subWorkerId: id,
                            data: subWorkerEvent.data
                        });
                };
                
                break;
            
            case 'subWorkerPostMessage':
                var subWorker = self._subWorkerById[workerEvent.data.subWorkerId];
                subWorker.postMessage(workerEvent.data.data);
                break;
            
            case 'subWorkerTerminate':
                var subWorker = self._subWorkerById[workerEvent.data.subWorkerId];
                subWorker.terminate();
                break;
            
            default:
                throw 'Unknown message from SlaveSideWorkerHelper of type: ' +
                    workerEvent.data.type;
        }
    }
    
    function enqueueMessageToSlave(
        self, transferables, isFunctionCall, message) {
        
        if (self._notReturnedFunctions >= self._functionsBufferSize) {
            self._pendingMessages.push({
                transferables: transferables,
                isFunctionCall: isFunctionCall,
                message: message
            });
            return;
        }
        
        sendMessageToSlave(self, transferables, isFunctionCall, message);
    }
        
    function sendMessageToSlave(
        self, transferables, isFunctionCall, message) {
        
        if (isFunctionCall) {
            ++self._notReturnedFunctions;
        }
        
        self._worker.postMessage(message, transferables);
    }
    
    function trySendPendingMessages(self) {
        while (    self._notReturnedFunctions < self._functionsBufferSize &&
                self._pendingMessages.length > 0) {
            
            var message = self._pendingMessages.shift();
            sendMessageToSlave(
                self,
                message.transferables,
                message.isFunctionCall,
                message.message);
        }
    }
    
    return MasterSideWorkerHelper;
})();