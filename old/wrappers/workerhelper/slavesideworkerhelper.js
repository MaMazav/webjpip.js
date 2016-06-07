'use strict';

var Worker; // Avoid reference error

var SubWorkerEmulationForChrome = function SubWorkerEmulationForChrome(
    subWorkerIdToSubWorker) {
    
    var subWorkerId = 0;
    
    function SubWorkerEmulationForChrome(scriptUrl) {
        this._subWorkerId = ++subWorkerId;
        subWorkerIdToSubWorker[this._subWorkerId] = this;
        
        self.postMessage({
            type: 'subWorkerCtor',
            subWorkerId: this._subWorkerId,
            scriptUrl: scriptUrl
        });
    }
    
    SubWorkerEmulationForChrome.prototype.postMessage = function postMessage(
        data, transferables) {
        
        self.postMessage({
            type: 'subWorkerPostMessage',
            subWorkerId: this._subWorkerId,
            data: data
        },
        transferables);
    };
    
    SubWorkerEmulationForChrome.prototype.terminate = function terminate(
        data, transferables) {
        
        self.postMessage({
            type: 'subWorkerTerminate',
            subWorkerId: this._subWorkerId
        },
        transferables);
    };
    
    return SubWorkerEmulationForChrome;
};

var SlaveSideWorkerHelper = (function SlaveSideWorkerHelperClosure() {
    var slaveHelperSingleton = {};
    
    var beforeOperationListener = null;
    var isGetMasterEntryUrlCalled = false;
    var masterEntryUrl = getBaseUrlFromEntryScript();
    var slaveSideMainInstance;
    var slaveSideInstanceCreator;
    var subWorkerIdToSubWorker = {};
    
    slaveHelperSingleton.setSlaveSideCtor = function setSlaveSideCtor(creator) {
        slaveSideInstanceCreator = creator;
    };
    
    slaveHelperSingleton.setBeforeOperationListener =
        function setBeforeOperationListener(listener) {
            beforeOperationListener = listener;
        };
        
    slaveHelperSingleton.sendUserDataToMaster = function sendUserDataToMaster(
        userData) {
        
        self.postMessage({
            type: 'userData',
            userData: userData
        });
    };
    
    slaveHelperSingleton.getMasterEntryUrl = function getMasterEntryUrl() {
        isGetMasterEntryUrlCalled = true;
        return masterEntryUrl;
    };
    
    slaveHelperSingleton.onMessage = function slaveOnMessage(event) {
        var functionNameToCall = event.data.functionToCall;
        var args = event.data.args;
        var callId = event.data.callId;
        var isPromise = event.data.isPromise;
        var pathsToTransferablesInPromiseResult =
            event.data.pathsToTransferablesInPromiseResult;
        
        var result = null;
        
        switch (functionNameToCall) {
            case 'ctor':
                var newUrl = event.data.masterEntryUrl;
                if (masterEntryUrl !== newUrl && isGetMasterEntryUrlCalled) {
                    throw 'Previous values returned from getMasterEntryUrl ' +
                        'is wrong. Avoid calling it within the slave c`tor';
                }

                masterEntryUrl = newUrl;
                slaveSideMainInstance = slaveSideInstanceCreator(args);

                return;
            
            case 'subWorkerOnMessage':
                var subWorker = subWorkerIdToSubWorker[event.data.subWorkerId];
                var workerEvent = { data: event.data.data };
                
                subWorker.onmessage(workerEvent);
                
                return;
        }
        
        args = new Array(event.data.args.length);
        for (var i = 0; i < event.data.args.length; ++i) {
            var arg = event.data.args[i];
            if (arg !== undefined &&
                arg !== null &&
                arg.isWorkerHelperCallback) {
                
                arg = slaveHelperSingleton.wrapCallbackFromSlaveSide(arg);
            }
            
            args[i] = arg;
        }
        
        var functionToCall = slaveSideMainInstance.__proto__[
            functionNameToCall];
        
        var promise = functionToCall.apply(slaveSideMainInstance, args);
        
        if (isPromise) {
            slaveHelperSingleton.wrapPromiseFromSlaveSide(
                callId, promise, pathsToTransferablesInPromiseResult);
        }

        self.postMessage({
            type: 'functionCalled',
            callId: event.data.callId,
            result: result
        });
    };
    
    slaveHelperSingleton.wrapPromiseFromSlaveSide =
        function wrapPromiseFromSlaveSide(
            callId, promise, pathsToTransferables) {
        
        promise.then(function sendPromiseToMaster(result) {
            var transferables = extractTransferables(
                pathsToTransferables, result);
            
            self.postMessage({
                type: 'promiseResult',
                callId: callId,
                result: result
            });
        }).catch(function sendFailureToMaster(reason) {
            self.postMessage({
                type: 'promiseFailure',
                callId: callId
            });
        });
    };
    
    slaveHelperSingleton.wrapCallbackFromSlaveSide =
        function wrapCallbackFromSlaveSide(callbackHandle) {
            
        var isAlreadyCalled = false;
        
        function callbackWrapperFromSlaveSide(
            arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            
            if (isAlreadyCalled) {
                throw 'Callback is called twice but isMultipleTimeCallback ' +
                    '= false';
            }
            
            var args = [arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7];
            
            if (beforeOperationListener !== null) {
                beforeOperationListener(
                    'callback', callbackHandle.callbackName, args);
            }
            
            var transferables = extractTransferables(
                callbackHandle.pathsToTransferables, args);
            
            self.postMessage({
                    type: 'callback',
                    callId: callbackHandle.callId,
                    args: args
                },
                transferables);
            
            if (!callbackHandle.isMultipleTimeCallback) {
                isAlreadyCalled = true;
            }
        }
        
        return callbackWrapperFromSlaveSide;
    };
    
    function extractTransferables(pathsToTransferables, pathsBase) {
        if (pathsToTransferables === undefined) {
            return undefined;
        }
        
        var transferables = new Array(pathsToTransferables.length);
        
        for (var i = 0; i < pathsToTransferables.length; ++i) {
            var path = pathsToTransferables[i];
            var transferable = pathsBase;
            
            for (var j = 0; j < path.length; ++j) {
                var member = path[j];
                transferable = transferable[member];
            }
            
            transferables[i] = transferable;
        }
        
        return transferables;
    }
    
    function getBaseUrlFromEntryScript() {
        var baseUrl = location.href;
        var endOfPath = baseUrl.lastIndexOf('/');
        if (endOfPath >= 0) {
            baseUrl = baseUrl.substring(0, endOfPath);
        }
        
        return baseUrl;
    }
    
    if (Worker === undefined) {
        Worker = SubWorkerEmulationForChrome(subWorkerIdToSubWorker);
    }
    
    return slaveHelperSingleton;
})();