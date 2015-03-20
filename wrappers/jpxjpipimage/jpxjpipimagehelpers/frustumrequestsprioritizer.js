'use strict';

var FrustumRequestsPrioritizer = (function FrustumRequestsPrioritizer() {
    var PRIORITY_ABORT_NOT_IN_FRUSTUM = -1;
    var PRIORITY_CALCULATION_FAILED = 0;
    var PRIORITY_TOO_GOOD_RESOLUTION = 1;
    var PRIORITY_NOT_IN_FRUSTUM = 2;
    var PRIORITY_LOWER_RESOLUTION = 3;
    
    var PRIORITY_MINORITY_IN_FRUSTUM = 4;
    var PRIORITY_PARTIAL_IN_FRUSTUM = 5;
    var PRIORITY_MAJORITY_IN_FRUSTUM = 6;
    var PRIORITY_FULLY_IN_FRUSTUM = 7;
    
    var ADD_PRIORITY_TO_LOW_QUALITY = 5;
    
    var PRIORITY_HIGHEST = 13;
    
    var log2 = Math.log(2);
    
    function FrustumRequestsPrioritizer(
        isAbortRequestsNotInFrustum, isPrioritizeLowProgressiveStage) {
        
        this._frustumData = null;
        this._isAbortRequestsNotInFrustum = isAbortRequestsNotInFrustum;
        this._isPrioritizeLowProgressiveStage = isPrioritizeLowProgressiveStage;
    }
    
    FrustumRequestsPrioritizer.prototype = {
        get minimalLowQualityPriority() {
            return PRIORITY_MINORITY_IN_FRUSTUM + ADD_PRIORITY_TO_LOW_QUALITY;
        },
        
        setPrioritizerData: function setPrioritizerData(prioritizerData) {
            this._frustumData = prioritizerData;
        },
        
        getPriority: function getPriority(jobContext) {
            var codestreamPartParams = jobContext.codestreamPartParams;
            if (codestreamPartParams.requestPriorityData.overrideHighestPriority) {
                return PRIORITY_HIGHEST;
            }
        
            var priority = this._getPriorityInternal(codestreamPartParams);
            var isInFrustum = priority >= PRIORITY_MINORITY_IN_FRUSTUM;
            
            if (this._isAbortRequestsNotInFrustum && !isInFrustum) {
                return PRIORITY_ABORT_NOT_IN_FRUSTUM;
            }
            
            var prioritizeLowProgressiveStage = 0;
            
            if (this._isPrioritizeLowProgressiveStage && isInFrustum) {
                if (jobContext.progressiveStagesDone === undefined) {
                    throw 'Missing progressive stage information';
                }
                
                prioritizeLowProgressiveStage =
                    jobContext.progressiveStagesDone === 0 ? ADD_PRIORITY_TO_LOW_QUALITY :
                    jobContext.progressiveStagesDone === 1 ? 1 :
                    0;
            }
            
            return priority + prioritizeLowProgressiveStage;
        },
        
        _getPriorityInternal: function getPriorityInternal(codestreamPartParams) {
            if (this._frustumData === null) {
                return PRIORITY_CALCULATION_FAILED;
            }
            
            if (this._frustumData.imageRectangle === undefined) {
                throw 'No imageRectangle information passed in setPrioritizerData';
            }
            
            var exactFrustumLevel = this._frustumData.exactNumResolutionLevelsToCut;
            
            if (this._frustumData.exactNumResolutionLevelsToCut === undefined) {
                throw 'No exactNumResolutionLevelsToCut information passed in ' +
                    'setPrioritizerData. Use null if unknown';
            }
            
            var tileWest = this._pixelToCartographicX(
                codestreamPartParams.minX, codestreamPartParams);
            var tileEast = this._pixelToCartographicX(
                codestreamPartParams.maxXExclusive, codestreamPartParams);
            var tileNorth = this._pixelToCartographicY(
                codestreamPartParams.minY, codestreamPartParams);
            var tileSouth = this._pixelToCartographicY(
                codestreamPartParams.maxYExclusive, codestreamPartParams);
            
            var tilePixelsWidth =
                codestreamPartParams.maxXExclusive - codestreamPartParams.minX;
            var tilePixelsHeight =
                codestreamPartParams.maxYExclusive - codestreamPartParams.minY;
            
            var requestToFrustumResolutionRatio;
            var tileLevel = codestreamPartParams.numResolutionLevelsToCut || 0;
            if (exactFrustumLevel === null) {
                var tileResolutionX = tilePixelsWidth / (tileEast - tileWest);
                var tileResolutionY = tilePixelsHeight / (tileNorth - tileSouth);
                var tileResolution = Math.max(tileResolutionX, tileResolutionY);
                var frustumResolution = this._frustumData.resolution;
                requestToFrustumResolutionRatio = tileResolution / frustumResolution;
            
                if (requestToFrustumResolutionRatio > 2) {
                    return PRIORITY_TOO_GOOD_RESOLUTION;
                }
            } else if (tileLevel < exactFrustumLevel) {
                return PRIORITY_TOO_GOOD_RESOLUTION;
            }
            
            var frustumRectangle = this._frustumData.rectangle;
            var intersectionWest = Math.max(frustumRectangle.west, tileWest);
            var intersectionEast = Math.min(frustumRectangle.east, tileEast);
            var intersectionSouth = Math.max(frustumRectangle.south, tileSouth);
            var intersectionNorth = Math.min(frustumRectangle.north, tileNorth);
            
            var intersectionWidth = intersectionEast - intersectionWest;
            var intersectionHeight = intersectionNorth - intersectionSouth;
            
            if (intersectionWidth < 0 || intersectionHeight < 0) {
                return PRIORITY_NOT_IN_FRUSTUM;
            }
            
            if (exactFrustumLevel !== null) {
                if (tileLevel > exactFrustumLevel) {
                    return PRIORITY_LOWER_RESOLUTION;
                }
            } else if (tileLevel > 0 && requestToFrustumResolutionRatio < 0.25) {
                return PRIORITY_LOWER_RESOLUTION;
            }
            
            var intersectionArea = intersectionWidth * intersectionHeight;
            var tileArea = (tileEast - tileWest) * (tileNorth - tileSouth);
            var partInFrustum = intersectionArea / tileArea;
            
            if (partInFrustum > 0.99) {
                return PRIORITY_FULLY_IN_FRUSTUM;
            } else if (partInFrustum > 0.7) {
                return PRIORITY_MAJORITY_IN_FRUSTUM;
            } else if (partInFrustum > 0.3) {
                return PRIORITY_PARTIAL_IN_FRUSTUM;
            } else {
                return PRIORITY_MINORITY_IN_FRUSTUM;
            }
        },
        
        _pixelToCartographicX: function pixelToCartographicX(
            x, codestreamPartParams) {
            
            var relativeX = x / this._frustumData.image.getLevelWidth(
                codestreamPartParams.numResolutionLevelsToCut);
            
            var imageRectangle = this._frustumData.imageRectangle;
            var rectangleWidth = imageRectangle.east - imageRectangle.west;
            
            var xProjected = imageRectangle.west + relativeX * rectangleWidth;
            return xProjected;
        },
        
        _pixelToCartographicY: function tileToCartographicY(
            y, codestreamPartParams, image) {
            
            var relativeY = y / this._frustumData.image.getLevelHeight(
                codestreamPartParams.numResolutionLevelsToCut);
            
            var imageRectangle = this._frustumData.imageRectangle;
            var rectangleHeight = imageRectangle.north - imageRectangle.south;
            
            var yProjected = imageRectangle.north - relativeY * rectangleHeight;
            return yProjected;
        }
    }; // end prototype
    
    return FrustumRequestsPrioritizer;
})();