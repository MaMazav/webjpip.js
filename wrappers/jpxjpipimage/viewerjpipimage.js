'use strict';

var ViewerJpipImage = (function ViewerJpipImage() {
    var PENDING_CALL_TYPE_PIXELS_UPDATED = 1;
    var PENDING_CALL_TYPE_REPOSITION = 2;
    
    var REGION_OVERVIEW = 0;
    var REGION_DYNAMIC = 1;
    
    function ViewerJpipImage(canvasUpdatedCallback, options) {
        this._canvasUpdatedCallback = canvasUpdatedCallback;
        
        this._adaptProportions = options.adaptProportions;
        this._cartographicBounds = options.cartographicBounds;
        this._maxNumQualityLayers = options.maxNumQualityLayers;
        this._isMainImageOnUi = options.isMainImageOnUi;
        this._showLog = options.showLog;
        this._allowMultipleChannelsInSession =
            options.allowMultipleChannelsInSession;
        this._minFunctionCallIntervalMilliseconds =
            options.minFunctionCallIntervalMilliseconds;
            
        this._lastRequestIndex = 0;
        this._pendingUpdateViewArea = null;
        this._regions = [];
        this._targetCanvas = null;
        
        this._callPendingCallbacksBound = this._callPendingCallbacks.bind(this);
        this._createdRequestHandleBound = this._createdRequestHandle.bind(this);
        
        this._pendingCallbacksIntervalHandle = 0;
        this._pendingCallbackCalls = [];
        this._exceptionCallback = null;
        this._canShowDynamicRegion = false;
        this._movableRequestHandle;
        
        if (this._cartographicBounds === undefined) {
            this._cartographicBounds = {
                west: -175.0,
                east: 175.0,
                south: -85.0,
                north: 85.0
            };
        }
        
        if (this._adaptProportions === undefined) {
            this._adaptProportions = true;
        }
        
        var imageType = this._isMainImageOnUi ?
            JpxJpipImage: WorkerProxyJpxJpipImage;
            
        this._image = new imageType({
            serverRequestPrioritizer: 'frustumOnly',
            decodePrioritizer: 'frustumOnly',
            showLog: this._showLog
            });
        
        this._image.setStatusCallback(this._internalStatusCallback.bind(this));
    }
    
    ViewerJpipImage.prototype = {
        setExceptionCallback: function setExceptionCallback(exceptionCallback) {
            this._exceptionCallback = exceptionCallback;
        },
        
        open: function open(url) {
            this._image.open(url);
        },

        close: function close() {
            this._image.close();
            this._isReady = false;
            this._canShowDynamicRegion = false;
            this._targetCanvas = null;
        },
        
        setTargetCanvas: function setTargetCanvas(canvas) {
            this._targetCanvas = canvas;
        },
        
        updateViewArea: function updateViewArea(frustumData) {
            if (this._targetCanvas === null) {
                throw 'Cannot update dynamic region before setTargetCanvas()';
            }
            
            if (!this._canShowDynamicRegion) {
                this._pendingUpdateViewArea = frustumData;
                
                return;
            }
            
            var bounds = frustumData.rectangle;
            var screenSize = frustumData.screenSize;
            
            var regionParams = {
                minX: bounds.west * this._scaleX + this._translateX,
                minY: bounds.north * this._scaleY + this._translateY,
                maxXExclusive: bounds.east * this._scaleX + this._translateX,
                maxYExclusive: bounds.south * this._scaleY + this._translateY,
                screenWidth: screenSize.x,
                screenHeight: screenSize.y
            };
            
            var alignedParams =
                jpipImageHelperFunctions.alignParamsToTilesAndLevel(
                    regionParams, this._image);
            
            var isOutsideScreen = alignedParams === null;
            if (isOutsideScreen) {
                return;
            }
            
            alignedParams.codestreamPartParams.maxNumQualityLayers = this._maxNumQualityLayers;

            var isSameRegion =
                this._dynamicFetchParams !== undefined &&
                this._isCodestreamPartsEqual(
                    alignedParams.codestreamPartParams,
                    this._dynamicFetchParams.codestreamPartParams);
            
            if (isSameRegion) {
                return;
            }
            
            frustumData.imageRectangle = this._cartographicBoundsFixed;
            frustumData.exactNumResolutionLevelsToCut =
                alignedParams.codestreamPartParams.numResolutionLevelsToCut;
            
            this._image.setDecodePrioritizerData(frustumData);
            this._image.setServerRequestPrioritizerData(frustumData);

            this._dynamicFetchParams = alignedParams;
            
            var startMovableRequestOnTerminated = false;
            var moveExistingRequest = !this._allowMultipleChannelsInSession;
            this._fetch(
                REGION_DYNAMIC,
                alignedParams,
                startMovableRequestOnTerminated,
                moveExistingRequest);
        },
        
        _isCodestreamPartsEqual: function isCodestreamPartsEqual(first, second) {
            var isEqual =
                this._dynamicFetchParams !== undefined &&
                first.minX === second.minX &&
                first.minY === second.minY &&
                first.maxXExclusive === second.maxXExclusive &&
                first.maxYExclusive === second.maxYExclusive &&
                first.numResolutionLevelsToCut === second.numResolutionLevelsToCut;
            
            return isEqual;
        },
        
        _fetch: function fetch(
            regionId,
            fetchParams,
            startMovableRequestOnTerminated,
            moveExistingRequest) {
            
            var requestIndex = ++this._lastRequestIndex;
            
            var codestreamPartParams = fetchParams.codestreamPartParams;
            codestreamPartParams.requestPriorityData =
                codestreamPartParams.requestPriorityData || {};
            
            codestreamPartParams.requestPriorityData.requestIndex = requestIndex;

            var minX = fetchParams.positionInImage.minX;
            var minY = fetchParams.positionInImage.minY;
            var maxX = fetchParams.positionInImage.maxXExclusive;
            var maxY = fetchParams.positionInImage.maxYExclusive;
            
            var west = (minX - this._translateX) / this._scaleX;
            var east = (maxX - this._translateX) / this._scaleX;
            var north = (minY - this._translateY) / this._scaleY;
            var south = (maxY - this._translateY) / this._scaleY;
            
            var position = {
                west: west,
                east: east,
                north: north,
                south: south
            };
            
            var canReuseOldData = false;
            var fetchParamsNotNeeded;
            
            var region = this._regions[regionId];
            if (region !== undefined) {
                var newResolution = codestreamPartParams.numResolutionLevelsToCut;
                var oldResolution = region.codestreamPartParams.numResolutionLevelsToCut;
                
                canReuseOldData = newResolution === oldResolution;
                
                if (canReuseOldData && region.isDone) {
                    fetchParamsNotNeeded = [ region.codestreamPartParams ];
                }

                if (regionId !== REGION_OVERVIEW) {
                    var addedPendingCall = this._checkIfRepositionNeeded(
                        region, codestreamPartParams, position);
                    
                    if (addedPendingCall) {
                        this._notifyNewPendingCalls();
                    }
                }
            }
            
            var self = this;
            
            var movableRequest = moveExistingRequest ?
                this._movableRequestHandle: undefined;

            this._image.requestPixelsProgressive(
                fetchParams.codestreamPartParams,
                callback,
                terminatedCallback,
                fetchParamsNotNeeded,
                movableRequest);
            
            function callback(decoded) {
                self._tilesDecodedCallback(
                    regionId,
                    fetchParams,
                    position,
                    decoded);
            }
            
            function terminatedCallback(isAborted) {
                if (isAborted &&
                    codestreamPartParams.requestPriorityData.overrideHighestPriority) {
                    
                    // NOTE: Bug in kdu_server causes first request to be sent wrongly.
                    // Then Chrome raises ERR_INVALID_CHUNKED_ENCODING and the request
                    // never returns. Thus perform second request.
                    
                    self._image.requestPixelsProgressive(
                        fetchParams.codestreamPartParams,
                        callback,
                        terminatedCallback,
                        fetchParamsNotNeeded);
                }
                
                self._fetchTerminatedCallback(
                    regionId,
                    fetchParams.codestreamPartParams.requestPriorityData,
                    isAborted,
                    startMovableRequestOnTerminated);
            }
        },
        
        _fetchTerminatedCallback: function fetchTerminatedCallback(
            regionId, priorityData, isAborted, startMovableRequestOnTerminated) {
            
            var region = this._regions[regionId];
            if (region === undefined) {
                return;
            }
            
            if (!priorityData.overrideHighestPriority &&
                priorityData.requestIndex !== this._lastRequestIndex) {
            
                return;
            }
            
            region.isDone = !isAborted && this._isReady;
            
            if (startMovableRequestOnTerminated) {
                this._image.createMovableRequestHandle(
                    this._createdRequestHandleBound);
            }
        },
        
        _createdRequestHandle: function createdRequestHandle(requestHandle) {
            this._movableRequestHandle = requestHandle;
            this._startShowingDynamicRegion();
        },
        
        _startShowingDynamicRegion: function startShowingDynamicRegion() {
            this._canShowDynamicRegion = true;
            
            if (this._pendingUpdateViewArea !== null) {
                this.updateViewArea(this._pendingUpdateViewArea);
                
                this._pendingUpdateViewArea = null;
            }
        },
        
        _tilesDecodedCallback: function tilesDecodedCallback(
            regionId, fetchParams, position, decoded) {
            
            if (!this._isReady) {
                return;
            }
            
            var region = this._regions[regionId];
            if (region === undefined) {
                region = {};
                this._regions[regionId] = region;
                
                switch (regionId) {
                    case REGION_DYNAMIC:
                        region.canvas = this._targetCanvas;
                        break;
                        
                    case REGION_OVERVIEW:
                        region.canvas = document.createElement('canvas');
                        break;
                    
                    default:
                        throw 'Unexpected regionId ' + regionId;
                }
            }
            
            var partParams = fetchParams.codestreamPartParams;
            if (!partParams.requestPriorityData.overrideHighestPriority &&
                partParams.requestPriorityData.requestIndex < region.currentDisplayRequestIndex) {
                
                return;
            }
            
            this._checkIfRepositionNeeded(region, partParams, position);
                
            this._pendingCallbackCalls.push({
                type: PENDING_CALL_TYPE_PIXELS_UPDATED,
                region: region,
                decoded: decoded
            });
            
            this._notifyNewPendingCalls();
        },
        
        _checkIfRepositionNeeded: function checkIfRepositionNeeded(
            region, newPartParams, newPosition) {
            
            var oldPartParams = region.codestreamPartParams;
            var level = newPartParams.numResolutionLevelsToCut;
            
            var needReposition =
                oldPartParams === undefined ||
                oldPartParams.minX !== newPartParams.minX ||
                oldPartParams.minY !== newPartParams.minY ||
                oldPartParams.maxXExclusive !== newPartParams.maxXExclusive ||
                oldPartParams.maxYExclusive !== newPartParams.maxYExclusive ||
                oldPartParams.numResolutionLevelsToCut !== level;
            
            if (!needReposition) {
                return false;
            }
            
            var copyData;
            var intersection;
            var reuseOldData = false;
            if (oldPartParams !== undefined &&
                oldPartParams.numResolutionLevelsToCut === level) {
                
                intersection = {
                    minX: Math.max(oldPartParams.minX, newPartParams.minX),
                    minY: Math.max(oldPartParams.minY, newPartParams.minY),
                    maxX: Math.min(oldPartParams.maxXExclusive, newPartParams.maxXExclusive),
                    maxY: Math.min(oldPartParams.maxYExclusive, newPartParams.maxYExclusive)
                };
                reuseOldData =
                    intersection.maxX > intersection.minX &&
                    intersection.maxY > intersection.minY;
            }
            
            if (reuseOldData) {
                copyData = {
                    fromX: intersection.minX - oldPartParams.minX,
                    fromY: intersection.minY - oldPartParams.minY,
                    toX: intersection.minX - newPartParams.minX,
                    toY: intersection.minY - newPartParams.minY,
                    width: intersection.maxX - intersection.minX,
                    height: intersection.maxY - intersection.minY
                };
            }
            
            region.codestreamPartParams = newPartParams;
            region.isDone = false;
            region.currentDisplayRequestIndex = newPartParams.requestPriorityData.requestIndex;
            
            var repositionArgs = {
                type: PENDING_CALL_TYPE_REPOSITION,
                region: region,
                position: newPosition,
                copyData: copyData,
                pixelsWidth: newPartParams.maxXExclusive - newPartParams.minX,
                pixelsHeight: newPartParams.maxYExclusive - newPartParams.minY
            };
            
            this._pendingCallbackCalls.push(repositionArgs);
            
            return true;
        },
        
        _notifyNewPendingCalls: function notifyNewPendingCalls() {
            if (!this._isNearCallbackCalled) {
                this._callPendingCallbacks();
            }
        },
        
        _callPendingCallbacks: function callPendingCallbacks() {
            if (this._pendingCallbackCalls.length === 0 || !this._isReady) {
                this._isNearCallbackCalled = false;
                return;
            }
            
            if (this._isNearCallbackCalled) {
                clearTimeout(this._pendingCallbacksIntervalHandle);
            }
            
            if (this._minFunctionCallIntervalMilliseconds !== undefined) {
                this._pendingCallbacksIntervalHandle =
                    setTimeout(this._callPendingCallbacksBound,
                    this._minFunctionCallIntervalMilliseconds);
                    
                this._isNearCallbackCalled = true;
            }

            var newPosition = null;
            
            for (var i = 0; i < this._pendingCallbackCalls.length; ++i) {
                var callArgs = this._pendingCallbackCalls[i];
                
                if (callArgs.type === PENDING_CALL_TYPE_REPOSITION) {
                    this._repositionCanvas(callArgs);
                    newPosition = callArgs.position;
                } else if (callArgs.type === PENDING_CALL_TYPE_PIXELS_UPDATED) {
                    this._pixelsUpdated(callArgs);
                } else {
                    throw 'Internal ViewerJpipImage Error: Unexpected call type ' +
                        callArgs.type;
                }
            }
            
            this._pendingCallbackCalls.length = 0;
            
            this._canvasUpdatedCallback(newPosition);
        },
        
        _pixelsUpdated: function pixelsUpdated(pixelsUpdatedArgs) {
            var region = pixelsUpdatedArgs.region;
            var decoded = pixelsUpdatedArgs.decoded;
            if (decoded.width === 0 || decoded.height === 0) {
                return;
            }
            
            var x = decoded.xInOriginalRequest;
            var y = decoded.yInOriginalRequest;
            
            var context = region.canvas.getContext('2d');
            var imageData = context.createImageData(decoded.width, decoded.height);
            imageData.data.set(decoded.pixels);
            
            context.putImageData(imageData, x, y);
        },
        
        _repositionCanvas: function repositionCanvas(repositionArgs) {
            var region = repositionArgs.region;
            var position = repositionArgs.position;
            var copyData = repositionArgs.copyData;
            var pixelsWidth = repositionArgs.pixelsWidth;
            var pixelsHeight = repositionArgs.pixelsHeight;
            
            var imageDataToCopy;
            var context = region.canvas.getContext('2d');
            
            if (copyData !== undefined) {
                imageDataToCopy = context.getImageData(
                    copyData.fromX, copyData.fromY, copyData.width, copyData.height);
            }
            
            region.canvas.width = pixelsWidth;
            region.canvas.height = pixelsHeight;
            
            if (region !== this._regions[REGION_OVERVIEW]) {
                this._copyOverviewToCanvas(
                    context, position, pixelsWidth, pixelsHeight);
            }
            
            if (copyData !== undefined) {
                context.putImageData(imageDataToCopy, copyData.toX, copyData.toY);
            }
            
            region.position = position;
        },
        
        _copyOverviewToCanvas: function copyOverviewToCanvas(
            context, canvasPosition, canvasPixelsWidth, canvasPixelsHeight) {
            
            var sourcePosition = this._regions[REGION_OVERVIEW].position;
            var sourcePixels =
                this._regions[REGION_OVERVIEW].codestreamPartParams;
            
            var sourcePixelsWidth =
                sourcePixels.maxXExclusive - sourcePixels.minX;
            var sourcePixelsHeight =
                sourcePixels.maxYExclusive - sourcePixels.minY;
            
            var sourcePositionWidth =
                sourcePosition.east - sourcePosition.west;
            var sourcePositionHeight =
                sourcePosition.north - sourcePosition.south;
                
            var sourceResolutionX =
                sourcePixelsWidth / sourcePositionWidth;
            var sourceResolutionY =
                sourcePixelsHeight / sourcePositionHeight;
            
            var targetPositionWidth =
                canvasPosition.east - canvasPosition.west;
            var targetPositionHeight =
                canvasPosition.north - canvasPosition.south;
                
            var cropWidth = targetPositionWidth * sourceResolutionX;
            var cropHeight = targetPositionHeight * sourceResolutionY;
            
            var cropOffsetPositionX =
                canvasPosition.west - sourcePosition.west;
            var cropOffsetPositionY =
                sourcePosition.north - canvasPosition.north;
                
            var cropPixelOffsetX = cropOffsetPositionX * sourceResolutionX;
            var cropPixelOffsetY = cropOffsetPositionY * sourceResolutionY;
            
            context.drawImage(
                this._regions[REGION_OVERVIEW].canvas,
                cropPixelOffsetX, cropPixelOffsetY, cropWidth, cropHeight,
                0, 0, canvasPixelsWidth, canvasPixelsHeight);
        },

        _internalStatusCallback: function statusCallback(status) {
            if (this._exceptionCallback !== null && status.exception !== null) {
                this._exceptionCallback(status.exception);
            }

            if (this._isReady || !status.isReady) {
                return;
            }
            
            this._isReady = true;
            
            var fixedBounds = {
                west: this._cartographicBounds.west,
                east: this._cartographicBounds.east,
                south: this._cartographicBounds.south,
                north: this._cartographicBounds.north
            };
            jpipImageHelperFunctions.fixBounds(
                fixedBounds, this._image, this._adaptProportions);
            this._cartographicBoundsFixed = fixedBounds;
            
            var imageWidth = this._image.getLevelWidth();
            var imageHeight = this._image.getLevelHeight();

            var rectangleWidth = fixedBounds.east - fixedBounds.west;
            var rectangleHeight = fixedBounds.north - fixedBounds.south;
            this._scaleX = imageWidth / rectangleWidth;
            this._scaleY = -imageHeight / rectangleHeight;
            
            this._translateX = -fixedBounds.west * this._scaleX;
            this._translateY = -fixedBounds.north * this._scaleY;
            
            var overviewParams = {
                minX: 0,
                minY: 0,
                maxXExclusive: imageWidth,
                maxYExclusive: imageHeight,
                screenWidth: 1,
                screenHeight: 1
            };
            
            var overviewAlignedParams =
                jpipImageHelperFunctions.alignParamsToTilesAndLevel(
                    overviewParams, this._image);
                    
            overviewAlignedParams.codestreamPartParams.requestPriorityData =
                overviewAlignedParams.codestreamPartParams.requestPriorityData || {};
            
            overviewAlignedParams.codestreamPartParams.requestPriorityData.overrideHighestPriority = true;
            overviewAlignedParams.codestreamPartParams.maxNumQualityLayers = 1;
            
            var startMovableRequestOnTerminated =
                !this._allowMultipleChannelsInSession;
                
            this._fetch(
                REGION_OVERVIEW,
                overviewAlignedParams,
                startMovableRequestOnTerminated);
            
            if (this._allowMultipleChannelsInSession) {
                this._startShowingDynamicRegion();
            }
        }
    };
    
    return ViewerJpipImage;
})();