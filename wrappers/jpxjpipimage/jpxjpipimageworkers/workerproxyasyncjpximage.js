'use strict';

var WorkerProxyAsyncJpxImage = (function WorkerProxyAsyncJpxImageClosure() {
    function WorkerProxyAsyncJpxImage() {
        this._sizes = null;
        this._currentStatusCallbackWrapper = null;
        
        var scriptUrl = SlaveSideWorkerHelper.getMasterEntryUrl() +
            '/../wrappers/jpxjpipimage/jpxjpipimageworkers/asyncjpximageworker.js';
        
        this._workerHelper = new MasterSideWorkerHelper(scriptUrl);
    }
    
    WorkerProxyAsyncJpxImage.prototype = {
        parseCodestreamAsync: function parseCodestreamAsync(
            callback, data, start, end, options) {
            
            var transferables;
            
            if (!options.isOnlyParseHeaders) {
                var pathToPixelsArray = [0, 'pixels', 'buffer'];
                transferables = [pathToPixelsArray];
            }
            
            var callbackWrapper =
                this._workerHelper.wrapCallbackFromMasterSide(
                    callback,
                    'parseCodestreamAsyncCallback',
                    /*isMultipleTimeCallback=*/false,
                    transferables);
                    
            var args = [callbackWrapper, data, start, end, options];
            var options = { transferables: [data.buffer] };
            this._workerHelper.callFunction('parseCodestreamAsync', args, options);
        },
        
        addPacketsDataToCurrentContext :
            function addPacketsDataToCurrentContext(packetsData) {
            
            var args = [packetsData];
            var options = { transferables: [packetsData.data.buffer] };
            this._workerHelper.callFunction(
                'addPacketsDataToCurrentContext', args, options);
        },
        
        decodeCurrentContextAsync :
            function decodeCurrentContextAsync(callback, options) {
            
            var pathToPixelsArray = [0, 'pixels', 'buffer'];
            var transferables = [pathToPixelsArray];

            var callbackWrapper =
                this._workerHelper.wrapCallbackFromMasterSide(
                    callback,
                    'decodeCurrentContextAsyncCallback',
                    /*isMultipleTimeCallback=*/false,
                    transferables);
                    
            var args = [callbackWrapper, options];
            this._workerHelper.callFunction('decodeCurrentContextAsync', args);
        },
        
        terminate: function terminate() {
            this._workerHelper.terminate();
        }
    }; // Prototype
    
    return WorkerProxyAsyncJpxImage;
})();