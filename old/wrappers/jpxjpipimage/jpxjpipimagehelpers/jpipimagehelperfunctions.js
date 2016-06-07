'use strict';

var jpipImageHelperFunctions = {
    calculateFrustum2DFromBounds: function calculateFrustum2DFromBounds(
        bounds, screenSize) {
        
        var screenPixels =
            screenSize.x * screenSize.x + screenSize.y * screenSize.y;
        
        var boundsWidth = bounds.east - bounds.west;
        var boundsHeight = bounds.north - bounds.south;
        var boundsDistance =
            boundsWidth * boundsWidth + boundsHeight * boundsHeight;
        
        var resolution = Math.sqrt(screenPixels / boundsDistance);
        
        var frustumData = {
            resolution: resolution,
            rectangle: bounds,
            
            // Redundant, but enables to avoid already-performed calculation
            screenSize: screenSize
        };
        
        return frustumData;
    },
    
    createScheduler: function createScheduler(
        showLog, prioritizerType, schedulerName, createResource, resourceLimit) {
        
        var prioritizer;
        var scheduler;
        
        if (prioritizerType === undefined) {
            prioritizer = null;
            
            scheduler = new LifoScheduler(
                createResource,
                resourceLimit);
        } else {
            var limitResourceByLowQualityPriority = false;
            
            if (prioritizerType === 'frustum') {
                limitResourceByLowQualityPriority = true;
                prioritizer = new FrustumRequestsPrioritizer();
            } else if (prioritizerType === 'frustumOnly') {
                limitResourceByLowQualityPriority = true;
                prioritizer = new FrustumRequestsPrioritizer(
                    /*isAbortRequestsNotInFrustum=*/true,
                    /*isPrioritizeLowQualityStage=*/true);
            } else if (prioritizerType === 'singleRegion') {
                prioritizer = new SingleRegionPrioritizer();
            } else {
                prioritizer = prioritizerType;
            }
            
            var options = {
                schedulerName: schedulerName,
                showLog: showLog
            };
            
            if (limitResourceByLowQualityPriority) {
                options.resourceGuaranteedForHighPriority = resourceLimit - 2;
                options.highPriorityToGuaranteeResource =
                    prioritizer.minimalLowQualityPriority;
            }
            
            scheduler = new PriorityScheduler(
                createResource,
                resourceLimit,
                prioritizer,
                options);
        }
        
        return {
            prioritizer: prioritizer,
            scheduler: scheduler
        };
    },
    
    fixBounds: function fixBounds(bounds, image, adaptProportions) {
        if (!adaptProportions) {
            return;
        }

        var rectangleWidth = bounds.east - bounds.west;
        var rectangleHeight = bounds.north - bounds.south;

        var pixelsAspectRatio =
            image.getLevelWidth() / image.getLevelHeight();
        var rectangleAspectRatio = rectangleWidth / rectangleHeight;
        
        if (pixelsAspectRatio < rectangleAspectRatio) {
            var oldWidth = rectangleWidth;
            rectangleWidth = rectangleHeight * pixelsAspectRatio;
            var substractFromWidth = oldWidth - rectangleWidth;
            
            bounds.east -= substractFromWidth / 2;
            bounds.west += substractFromWidth / 2;
        } else {
            var oldHeight = rectangleHeight;
            rectangleHeight = rectangleWidth / pixelsAspectRatio;
            var substractFromHeight = oldHeight - rectangleHeight;
            
            bounds.north -= substractFromHeight / 2;
            bounds.south += substractFromHeight / 2;
        }
    },

    alignParamsToTilesAndLevel: function alignParams(
        region, jpxJpipImage) {
        
        var sizesCalculator = jpxJpipImage._getSizesCalculator();
        var tileWidth = jpxJpipImage.getTileWidth();
        var tileHeight = jpxJpipImage.getTileHeight();
        
        var regionMinX = region.minX;
        var regionMinY = region.minY;
        var regionMaxX = region.maxXExclusive;
        var regionMaxY = region.maxYExclusive;
        var screenWidth = region.screenWidth;
        var screenHeight = region.screenHeight;
        
        var isValidOrder = regionMinX < regionMaxX && regionMinY < regionMaxY;
        if (!isValidOrder) {
            throw 'Parameters order is invalid';
        }
        
        if (regionMaxX < 0 || regionMinX >= sizesCalculator.getLevelWidth() ||
            regionMaxY < 0 || regionMinY >= sizesCalculator.getLevelHeight()) {
            
            return null;
        }
        
        var maxLevel =
            sizesCalculator.getDefaultNumResolutionLevels() - 1;

        var log2 = jpipImageHelperFunctions._LOG2;
        var levelX = Math.log((regionMaxX - regionMinX) / screenWidth ) / log2;
        var levelY = Math.log((regionMaxY - regionMinY) / screenHeight) / log2;
        var level = Math.ceil(Math.min(levelX, levelY));
        level = Math.max(0, Math.min(maxLevel, level));
        
        var levelWidth = sizesCalculator.getLevelWidth(level);
        var imageWidth = sizesCalculator.getLevelWidth();
        var levelHeight = sizesCalculator.getLevelHeight(level);
        var imageHeight = sizesCalculator.getLevelHeight();
        
        var scaleX = imageWidth / levelWidth;
        var scaleY = imageHeight / levelHeight;
        
        var minTileX = Math.floor(regionMinX / (scaleX * tileWidth));
        var minTileY = Math.floor(regionMinY / (scaleY * tileHeight));
        var maxTileX = Math.ceil(regionMaxX / (scaleX * tileWidth));
        var maxTileY = Math.ceil(regionMaxY / (scaleY * tileHeight));
        
        var minX = Math.max(0, Math.min(levelWidth, minTileX * tileWidth));
        var maxX = Math.max(0, Math.min(levelWidth, maxTileX * tileWidth));
        var minY = Math.max(0, Math.min(levelHeight, minTileY * tileHeight));
        var maxY = Math.max(0, Math.min(levelHeight, maxTileY * tileHeight));
        
        var codestreamPartParams = {
            minX: minX,
            minY: minY,
            maxXExclusive: maxX,
            maxYExclusive: maxY,
            numResolutionLevelsToCut: level
        };
        
        var positionInImage = {
            minX: minX * scaleX,
            minY: minY * scaleY,
            maxXExclusive: maxX * scaleX,
            maxYExclusive: maxY * scaleY
        };
        
        return {
            codestreamPartParams: codestreamPartParams,
            positionInImage: positionInImage
        };
    },
    
    _LOG2: Math.log(2)
}