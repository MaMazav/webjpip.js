'use strict';

var JpxJpipImage = (function JpxJpipImageClosure() {
    function JpxJpipImage(options) {
        options = options || {};
        var decodeWorkersLimit = options.workersLimit || 5;
        
        this._tileWidth = options.tileWidth || 256;
        this._tileHeight = options.tileHeight || 256;
        this._showLog = !!options.showLog;

        this._sizesParams = null;
        this._sizesCalculator = null;
        this._requestHandles = [];
        this._imageWorkers = [];
        this._codestreamClientManager = new WorkerProxyCodestreamClientManager(
            options);
        
        var decodeScheduler = jpipImageHelperFunctions.createScheduler(
            this._showLog,
            options.decodePrioritizer,
            'decode',
            this._createAsyncJpxImage.bind(this),
            decodeWorkersLimit);
        
        
        this._decodePrioritizer = decodeScheduler.prioritizer;

        this._nonMovableRequestsDecodeJobsPool = new DecodeJobsPool(
            this._codestreamClientManager,
            decodeScheduler.scheduler,
            this._tileWidth,
            this._tileHeight,
            /*onlyWaitForDataAndDecode=*/false);
            
        this._movableRequestsDecodeJobsPool = new DecodeJobsPool(
            this._codestreamClientManager,
            decodeScheduler.scheduler,
            this._tileWidth,
            this._tileHeight,
            /*onlyWaitForDataAndDecode=*/true);
    }
    
    JpxJpipImage.prototype = {
        setStatusCallback: function setStatusCallback(statusCallback) {
            this._statusCallback = statusCallback;
            this._codestreamClientManager.setStatusCallback(statusCallback);
        },
        
        setServerRequestPrioritizerData :
            function setServerRequestPrioritizerData(prioritizerData) {
            
            this._codestreamClientManager.setServerRequestPrioritizerData(
                prioritizerData);
        },
        
        setDecodePrioritizerData :
            function setDecodePrioritizerData(prioritizerData) {
            
            if (this._decodePrioritizer === null) {
                throw 'No decode prioritizer has been set';
            }
            
            if (this._showLog) {
                console.log('setDecodePrioritizerData(' + prioritizerData + ')');
            }
            
            var prioritizerDataModified = Object.create(prioritizerData);
            prioritizerDataModified.image = this;
            
            this._decodePrioritizer.setPrioritizerData(prioritizerDataModified);
        },
        
        open: function open(url) {
            this._codestreamClientManager.open(url);
        },
        
        close: function close(closedCallback) {
            for (var i = 0; i < this._imageWorkers.length; ++i) {
                this._imageWorkers[i].terminate();
            }

            this._codestreamClientManager.close(closedCallback);
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
        
        getTileWidth: function getTileWidth() {
            validateSizesCalculator(this);
            return this._tileWidth;
        },
        
        getTileHeight: function getTileHeight() {
            validateSizesCalculator(this);
            return this._tileHeight;
        },
        
        getDefaultNumResolutionLevels: function getDefaultNumResolutionLevels() {
            validateSizesCalculator(this);
            var numLevels = this._sizesCalculator.getDefaultNumResolutionLevels();
            
            return numLevels;
        },
        
        getDefaultNumQualityLayers: function getDefaultNumQualityLayers() {
            validateSizesCalculator(this);
            var numLayers = this._sizesCalculator.getDefaultNumQualityLayers();
            
            return numLayers;
        },
        
        createMovableRequestHandle: function createMovableRequestHandle(
            createdCallback) {
            
            validateSizesCalculator(this);
            
            var self = this;
            
            function requestHandleCreated(requestHandle) {
                self._requestHandles[requestHandle] = {
                    decodeJobsListenerHandle: null
                };
                
                createdCallback(requestHandle);
            }
            
            this._codestreamClientManager.createMovableRequestHandle(
                requestHandleCreated);
        },
        
        requestPixels: function requestPixels(codestreamPartParams) {
            validateSizesCalculator(this);
            
            var level = codestreamPartParams.numResolutionLevelsToCut;
            var levelWidth = this._sizesCalculator.getLevelWidth(level);
            var levelHeight = this._sizesCalculator.getLevelHeight(level);
            
            var resolve, reject;
            var accumulatedResult = {};
            
            var self = this;
            var promise = new Promise(startPromise);
            return promise;
            
            function startPromise(resolve_, reject_) {
                resolve = resolve_;
                reject = reject_;
                
                self._nonMovableRequestsDecodeJobsPool.forkDecodeJobs(
                    codestreamPartParams,
                    internalCallback,
                    internalTerminatedCallback,
                    levelWidth,
                    levelHeight,
                    /*isProgressive=*/false);
            }
            
            function internalCallback(decodedData) {
                copyPixelsToAccumulatedResult(decodedData, accumulatedResult);
            }
            
            function internalTerminatedCallback(isAborted) {
                if (isAborted) {
                    reject('Request was aborted due to failure or priority');
                } else {
                    resolve(accumulatedResult);
                }
            }
        },
        
        requestPixelsProgressive: function requestPixelsProgressive(
            codestreamPartParams,
            callback,
            terminatedCallback,
            codestreamPartParamsNotNeeded,
            movableRequestHandleToChange) {
            
            validateSizesCalculator(this);
            
            var level = codestreamPartParams.numResolutionLevelsToCut;
            var levelWidth = this._sizesCalculator.getLevelWidth(level);
            var levelHeight = this._sizesCalculator.getLevelHeight(level);
            
            var requestHandleVars = null;
            var decodeJobsPool;
            if (movableRequestHandleToChange === undefined) {
                decodeJobsPool = this._nonMovableRequestsDecodeJobsPool;
            } else {
                decodeJobsPool = this._movableRequestsDecodeJobsPool;
                
                requestHandleVars = this._requestHandles[
                    movableRequestHandleToChange];
                
                if (requestHandleVars === undefined) {
                    throw 'Request handle does not exist';
                }
                
                this._codestreamClientManager.moveRequest(
                    movableRequestHandleToChange, codestreamPartParams);
            }
            
            var listenerHandle = decodeJobsPool.forkDecodeJobs(
                codestreamPartParams,
                callback,
                terminatedCallback,
                levelWidth,
                levelHeight,
                /*isProgressive=*/true,
                codestreamPartParamsNotNeeded);
                
            if (movableRequestHandleToChange !== undefined &&
                requestHandleVars.decodeJobsListenerHandle !== null) {
                
                // Unregister after forked new jobs, so no termination occurs meanwhile
                decodeJobsPool.unregisterForkedJobs(
                    requestHandleVars.decodeJobsListenerHandle);
            }
            
            if (requestHandleVars !== null) {
                requestHandleVars.decodeJobsListenerHandle = listenerHandle;
            }
        },
        
        reconnect: function reconnect() {
            this._codestreamClientManager.reconnect();
        },
        
        _getSizesCalculator: function getSizesCalculator() {
            validateSizesCalculator(this);
            
            return this._sizesCalculator;
        },
        
        _getSizesParams: function getSizesParams() {
            if (this._sizesParams === null) {
                this._sizesParams = {
                    jpipImageParams: this._codestreamClientManager.getSizesParams(),
                    applicativeTileWidth: this._tileWidth,
                    applicativeTileHeight:  this._tileHeight
                };
            }
            
            return this._sizesParams;
        },
        
        _createAsyncJpxImage: function createAsyncJpxImage() {
            var image = new WorkerProxyAsyncJpxImage();
            this._imageWorkers.push(image);
            
            return image;
        }
    }; // Prototype
    
    function validateSizesCalculator(self) {
        if (self._sizesCalculator !== null) {
            return;
        }
        
        var sizesParams = self._getSizesParams();
        self._sizesCalculator = new JpipCodestreamSizesCalculator(
            sizesParams.jpipImageParams);
    }
    
    function copyPixelsToAccumulatedResult(decodedData, accumulatedResult) {
        var bytesPerPixel = 4;
        var sourceStride = decodedData.width * bytesPerPixel;
        var targetStride =
            decodedData.originalRequestWidth * bytesPerPixel;
        
        if (accumulatedResult.pixels === undefined) {
            var size =
                targetStride * decodedData.originalRequestHeight;
                
            accumulatedResult.pixels = new Uint8Array(size);
            accumulatedResult.xInOriginalRequest = 0;
            accumulatedResult.yInOriginalRequest = 0;
            
            var width = decodedData.originalRequestWidth;
            accumulatedResult.originalRequestWidth = width;
            accumulatedResult.width = width;

            var height = decodedData.originalRequestHeight;
            accumulatedResult.originalRequestHeight = height;
            accumulatedResult.height = height;
        }
        
        accumulatedResult.allRelevantBytesLoaded =
            decodedData.allRelevantBytesLoaded;

        var sourceOffset = 0;
        var targetOffset =
            decodedData.xInOriginalRequest * bytesPerPixel + 
            decodedData.yInOriginalRequest * targetStride;
        
        for (var i = 0; i < decodedData.height; ++i) {
            var sourceSubArray = decodedData.pixels.subarray(
                sourceOffset, sourceOffset + sourceStride);
            
            accumulatedResult.pixels.set(sourceSubArray, targetOffset);
            
            sourceOffset += sourceStride;
            targetOffset += targetStride;
        }
    }

    return JpxJpipImage;
})();