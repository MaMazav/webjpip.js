'use strict';

var jGlobals = require('j2k-jpip-globals.js');
var LOG2 = Math.log(2);

/* TODO: Need to separate this class into two functionalities:
 * - Internal sizes calculator in jpip structure (refered as sizesCalculator)
 * - Interface for image-decoder-framework.js (implements LevelCalculator)
 * Also, some of the methods here are actually accessed from
 * codestreamStructure, which only delegates the call to here.
 */

module.exports = function JpipLevelCalculator(
    params) {
    
    var EDGE_TYPE_NO_EDGE = 0;
    var EDGE_TYPE_FIRST = 1;
    var EDGE_TYPE_LAST = 2;

    this.EDGE_TYPE_NO_EDGE = EDGE_TYPE_NO_EDGE;
    this.EDGE_TYPE_FIRST = EDGE_TYPE_FIRST;
    this.EDGE_TYPE_LAST = EDGE_TYPE_LAST;
    
    this.getTilesFromPixels = getTilesFromPixels;
    
    this.getNumTilesX = getNumTilesX;
    
    this.getNumTilesY = getNumTilesY;
    
    this.getTileWidth = getTileWidth;
    
    this.getTileHeight = getTileHeight;
    
    this.getFirstTileOffsetX = getFirstTileOffsetX;
    
    this.getFirstTileOffsetY = getFirstTileOffsetY;
    
    this.getFirstTileWidth = getFirstTileWidth;
    
    this.getFirstTileHeight = getFirstTileHeight;
    
    this.isEdgeTileId = isEdgeTileId;
    
    this.getTileSize = getTileSize;
    
    // Public methods for imageDecoderFramework.js
    
    this.getLevelWidth = getLevelWidth;
    
    this.getLevelHeight = getLevelHeight;
    
    this.getImageLevel = function getImageLevel() {
        return 0;
    };
    
    this.getLevel = function getLevel(regionImageLevel) {
        if (params.numResolutionLevelsForLimittedViewer === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
        var levelX = Math.log((regionImageLevel.maxXExclusive - regionImageLevel.minX) / regionImageLevel.screenWidth ) / LOG2;
        var levelY = Math.log((regionImageLevel.maxYExclusive - regionImageLevel.minY) / regionImageLevel.screenHeight) / LOG2;
        var level = Math.ceil(Math.max(levelX, levelY));
        level = Math.max(0, Math.min(params.numResolutionLevelsForLimittedViewer - 1, level));
        return level;
    };
    
    this.getNumResolutionLevelsForLimittedViewer =
        function getNumResolutionLevelsForLimittedViewer() {
        
        if (params.numResolutionLevelsForLimittedViewer === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
        return params.numResolutionLevelsForLimittedViewer;
    };
    
    this.getLowestQuality = function getLowestQuality() {
        return 1;
    };
    
    this.getHighestQuality = function getHighestQuality() {
        if (params.highestQuality === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
        return params.highestQuality;
    };
    
    this.getSizeOfTiles = getSizeOfTiles;
    
    // Private methods
    
    function getSizeOfTiles(tileBounds) {
        var level = tileBounds.level;
        var tileWidth = getTileWidth(level);
        var tileHeight = getTileHeight(level);
        
        var firstTileIndex =
            tileBounds.minTileX + tileBounds.minTileY * getNumTilesX();
            
        var lastTileIndex =
            (tileBounds.maxTileXExclusive - 1) +
            (tileBounds.maxTileYExclusive - 1) * getNumTilesX();
        
        var firstEdgeType = isEdgeTileId(firstTileIndex);
        var lastEdgeType = isEdgeTileId(lastTileIndex);
        var firstSize = getTileSize(firstEdgeType, level);
        var lastSize = getTileSize(lastEdgeType, level);
        
        var width = firstSize[0];
        var height = firstSize[1];

        var tilesX = tileBounds.maxTileXExclusive - tileBounds.minTileX;
        var tilesY = tileBounds.maxTileYExclusive - tileBounds.minTileY;
        
        if (tilesX > 1) {
            width += lastSize[0];
            width += tileWidth * (tilesX - 2);
        }
        
        if (tilesY > 1) {
            height += lastSize[1];
            height += tileHeight * (tilesY - 2);
        }
        
        return {
            regionWidth: width,
            regionHeight: height,
            tileWidth: tileWidth,
            tileHeight: tileHeight
        };
    }
    
    function getTilesFromPixels(codestreamPartParams) {
        var level = codestreamPartParams.level;

        var tileWidth = getTileWidth(level);
        var tileHeight = getTileHeight(level);
        
        var firstTileWidth = getFirstTileWidth(level);
        var firstTileHeight = getFirstTileHeight(level);
        
        var minX = codestreamPartParams.minX;
        var minY = codestreamPartParams.minY;
        var maxX = codestreamPartParams.maxXExclusive;
        var maxY = codestreamPartParams.maxYExclusive;
        var startXNoFirst = (minX - firstTileWidth) / tileWidth;
        var startYNoFirst = (minY - firstTileHeight) / tileHeight;
        var endXNoFirst = (maxX - firstTileWidth) / tileWidth;
        var endYNoFirst = (maxY - firstTileHeight) / tileHeight;
        
        var minTileX = Math.max(0, 1 + startXNoFirst);
        var minTileY = Math.max(0, 1 + startYNoFirst);
        var maxTileX = Math.min(getNumTilesX(), 1 + endXNoFirst);
        var maxTileY = Math.min(getNumTilesY(), 1 + endYNoFirst);

        var bounds = {
            level: level,
            minTileX: Math.floor(minTileX),
            minTileY: Math.floor(minTileY),
            maxTileXExclusive: Math.ceil(maxTileX),
            maxTileYExclusive: Math.ceil(maxTileY)
            };
        
        return bounds;
    }

    function getTileSize(edgeType, level) {
        var tileWidth = getTileDimensionSize(
            edgeType.horizontalEdgeType,
            getFirstTileWidth,
            getLevelWidth,
            getTileWidth);
        
        var tileHeight = getTileDimensionSize(
            edgeType.verticalEdgeType,
            getFirstTileHeight,
            getLevelHeight,
            getTileHeight);
        
        if (level !== undefined) {
            var scale = 1 << level;
            tileWidth = Math.ceil(tileWidth / scale);
            tileHeight = Math.ceil(tileHeight / scale);
        }
        
        return [tileWidth, tileHeight];
    }

    function getTileDimensionSize(
        edgeType, getFirstTileSize, getLevelSize, getNonEdgeTileSize) {
        
        var result;
        
        switch (edgeType) {
            case EDGE_TYPE_FIRST:
                result = getFirstTileSize();
                break;
            
            case EDGE_TYPE_LAST:
                var nonEdgeTileSize = getNonEdgeTileSize();
                var widthWithoutFirst = getLevelSize() - getFirstTileSize();
                result = widthWithoutFirst % nonEdgeTileSize;
                
                if (result === 0) {
                    result = nonEdgeTileSize;
                }
                
                break;
            
            case EDGE_TYPE_NO_EDGE:
                result = getNonEdgeTileSize();
                break;
            
            default:
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected edge type: ' + edgeType);
        }
        
        return result;
    }
    function isEdgeTileId(tileId) {
        var numTilesX = getNumTilesX();
        var numTilesY = getNumTilesY();
        
        var tileX = tileId % numTilesX;
        var tileY = Math.floor(tileId / numTilesX);
        
        if (tileY > numTilesY || tileX < 0 || tileY < 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Tile index ' + tileId + ' is not in range');
        }
        
        var horizontalEdge =
            tileX === 0 ? EDGE_TYPE_FIRST :
            tileX === (numTilesX - 1) ? EDGE_TYPE_LAST :
            EDGE_TYPE_NO_EDGE;
        
        var verticalEdge =
            tileY === 0 ? EDGE_TYPE_FIRST :
            tileY === (numTilesY - 1) ? EDGE_TYPE_LAST :
            EDGE_TYPE_NO_EDGE;
        
        var result = {
            horizontalEdgeType: horizontalEdge,
            verticalEdgeType: verticalEdge
            };
        
        return result;
    }

    function getNumTilesX() {
        var numTilesX = Math.ceil(params.imageWidth / params.tileWidth);
        return numTilesX;
    }
    
    function getNumTilesY() {
        var numTilesY = Math.ceil(params.imageHeight / params.tileHeight);
        return numTilesY;
    }
    
    function getLevelWidth(level) {
        if (level === undefined) {
            return params.imageWidth;
        }
        
        var size = getSizeOfTiles({
            minTileX: 0,
            maxTileXExclusive: getNumTilesX(),
            minTileY: 0,
            maxTileYExclusive: 1,
            level: level
            });
        
        return size.regionWidth;
    }
    
    function getLevelHeight(level) {
        if (level === undefined) {
            return params.imageHeight;
        }
        
        var size = getSizeOfTiles({
            minTileX: 0,
            maxTileXExclusive: 1,
            minTileY: 0,
            maxTileYExclusive: getNumTilesY(),
            level: level
            });
        
        return size.regionHeight;
    }

    function getTileWidth(level) {
        if (level === undefined) {
            return params.tileWidth;
        }
    
        var scale = 1 << level;
        var width = Math.ceil(params.tileWidth / scale);
        return width;
    }
    
    function getTileHeight(level) {
        if (level === undefined) {
            return params.tileHeight;
        }
    
        var scale = 1 << level;
        var height = Math.ceil(params.tileHeight / scale);
        return height;
    }
    
    function getFirstTileOffsetX() {
        return params.firstTileOffsetX;
    }
    
    function getFirstTileOffsetY() {
        return params.firstTileOffsetY;
    }

    function getFirstTileWidth(level) {
        var firstTileWidthBestLevel =
            getTileWidth() - getFirstTileOffsetX();
        
        var imageWidth = getLevelWidth();
        if (firstTileWidthBestLevel > imageWidth) {
            firstTileWidthBestLevel = imageWidth;
        }
        
        var scale = 1 << level;
        var firstTileWidth = Math.ceil(firstTileWidthBestLevel / scale);
        
        return firstTileWidth;
    }
    
    function getFirstTileHeight(level) {
        var firstTileHeightBestLevel =
            getTileHeight() - getFirstTileOffsetY();
        
        var imageHeight = getLevelHeight();
        if (firstTileHeightBestLevel > imageHeight) {
            firstTileHeightBestLevel = imageHeight;
        }
        
        var scale = 1 << level;
        var firstTileHeight = Math.ceil(firstTileHeightBestLevel / scale);

        return firstTileHeight;
    }

    return this;
};