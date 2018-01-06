'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipCodestreamStructure(
    jpipStructureParser,
    jpipFactory,
    progressionOrder) {

    var self = this;
    var params;
    var sizesCalculator;
    
    var defaultTileStructureByEdgeType;

    var cachedTileStructures = [];
    
    this.getSizesParams = function getSizesParams() {
        validateParams();
        return params;
    };
    
    this.getNumTilesX = function getNumTilesX() {
        validateParams();
        
        var numTiles = sizesCalculator.getNumTilesX();
        return numTiles;
    };
    
    this.getNumTilesY = function getNumTilesY() {
        validateParams();
        
        var numTiles = sizesCalculator.getNumTilesY();
        return numTiles;
    };

    this.getNumComponents = function() {
        validateParams();
        return params.numComponents;
    };
    
    this.getImageWidth = function() {
        validateParams();

        var size = sizesCalculator.getLevelWidth();
        return size;
    };
    
    this.getImageHeight = function() {
        validateParams();

        var size = sizesCalculator.getLevelHeight();
        return size;
    };
    
    this.getLevelWidth = function(level) {
        validateParams();

        var size = sizesCalculator.getLevelWidth(level);
        return size;
    };
    
    this.getLevelHeight = function(level) {
        validateParams();

        var size = sizesCalculator.getLevelHeight(level);
        return size;
    };
    
    this.getTileWidth = function(level) {
        validateParams();

        var size = sizesCalculator.getTileWidth(level);
        return size;
    };
    
    this.getTileHeight = function(level) {
        validateParams();

        var size = sizesCalculator.getTileHeight(level);
        return size;
    };
    
    this.getFirstTileOffsetX = function() {
        validateParams();

        var offset = sizesCalculator.getFirstTileOffsetX();
        return offset;
    };
    
    this.getFirstTileOffsetY = function() {
        validateParams();

        var offset = sizesCalculator.getFirstTileOffsetY();
        return offset;
    };
    
    this.getTileLeft = function getTileLeft(
        tileIndex, level) {
        
        validateParams();
        
        var tileX = tileIndex % sizesCalculator.getNumTilesX();
        if (tileX === 0) {
            return 0;
        }
        
        var tileLeft =
            (tileX - 1) * sizesCalculator.getTileWidth(level) +
            sizesCalculator.getFirstTileWidth(level);
        
        return tileLeft;
    };
    
    this.getTileTop = function getTileTop(tileIndex, level) {
        validateParams();
        
        var tileY = Math.floor(tileIndex / sizesCalculator.getNumTilesX());
        if (tileY === 0) {
            return 0;
        }
        
        var tileTop =
            (tileY - 1) * sizesCalculator.getTileHeight(level) +
            sizesCalculator.getFirstTileHeight(level);
        
        return tileTop;
    };
    
    this.getDefaultTileStructure = function getDefaultTileStructure() {
        validateParams();
        var result = getDefaultTileStructureInternal({
            horizontalEdgeType: sizesCalculator.EDGE_TYPE_NO_EDGE,
            verticalEdgeType: sizesCalculator.EDGE_TYPE_NO_EDGE
            });
            
        return result;
    };
    
    this.getTileStructure = getTileStructure;

    this.tilePositionToInClassIndex = function(tilePosition) {
        validateParams();
        var tilesX = sizesCalculator.getNumTilesX();
        var tilesY = sizesCalculator.getNumTilesY();
        
        validateArgumentInRange('tilePosition.tileX', tilePosition.tileX, tilesX);
        validateArgumentInRange('tilePosition.tileY', tilePosition.tileY, tilesY);

        var inClassIndex = tilePosition.tileX + tilePosition.tileY * tilesX;
        
        return inClassIndex;
    };

    this.tileInClassIndexToPosition = function(inClassIndex) {
        validateParams();
        var tilesX = sizesCalculator.getNumTilesX();
        var tilesY = sizesCalculator.getNumTilesY();
        var numTiles = tilesX * tilesY;

        validateArgumentInRange('inClassIndex', inClassIndex, tilesX * tilesY);
        
        var tileX = inClassIndex % tilesX;
        var tileY = (inClassIndex - tileX) / tilesX;
        
        var result = {
            tileX: tileX,
            tileY: tileY
            };
        
        return result;
    };
    
    this.getTilesIterator = function getTilesIterator(codestreamPartParams) {
        validateParams();
        var bounds = sizesCalculator.getTilesFromPixels(codestreamPartParams);
        
        var setableIterator = {
            currentX: bounds.minTileX,
            currentY: bounds.minTileY
        };
        
        var iterator = {
            get tileIndex() {
                var firstInRow =
                    setableIterator.currentY * sizesCalculator.getNumTilesX();
                var index = firstInRow + setableIterator.currentX;
                
                return index;
            },
            
            tryAdvance: function tryAdvance() {
                var result = tryAdvanceTileIterator(setableIterator, bounds);
                return result;
            }
        };
        
        return iterator;
    };
    
    this.getSizeOfPart = function getSizeOfPart(codestreamPartParams) {
        validateParams();
        
        var size = sizesCalculator.getSizeOfPart(codestreamPartParams);
        return size;
    };
    
    function tryAdvanceTileIterator(setableIterator, bounds) {
        if (setableIterator.currentY >= bounds.maxTileYExclusive) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Cannot advance tile iterator after end');
        }
        
        ++setableIterator.currentX;
        if (setableIterator.currentX < bounds.maxTileXExclusive) {
            return true;
        }
        
        setableIterator.currentX = bounds.minTileX;
        ++setableIterator.currentY;
        
        var isMoreTilesAvailable =
            setableIterator.currentY < bounds.maxTileYExclusive;
        
        return isMoreTilesAvailable;
    }
    
    function getTileStructure(tileId) {
        validateParams();
        
        var maxTileId =
            sizesCalculator.getNumTilesX() * sizesCalculator.getNumTilesY()- 1;
        
        if (tileId < 0 || tileId > maxTileId) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                'tileId',
                tileId,
                'Expected value between 0 and ' + maxTileId);
        }
        
        var isEdge = sizesCalculator.isEdgeTileId(tileId);
        
        if (cachedTileStructures[tileId] === undefined) {
            var tileParams = jpipStructureParser.parseOverridenTileParams(tileId);
            
            if (!!tileParams) {
                cachedTileStructures[tileId] = createTileStructure(tileParams, isEdge);
            }
            else {
                cachedTileStructures[tileId] = null;
            }
        }
        
        if (cachedTileStructures[tileId]) {
            return cachedTileStructures[tileId];
        }
        
        var result = getDefaultTileStructureInternal(isEdge);
        return result;
    }

    function validateArgumentInRange(paramName, paramValue, suprimumParamValue) {
        if (paramValue < 0 || paramValue >= suprimumParamValue) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                paramName,
                paramValue,
                paramName + ' is expected to be between 0 and ' + suprimumParamValue - 1);
        }
    }
    
    function getDefaultTileStructureInternal(edgeType) {
        if (!defaultTileStructureByEdgeType) {
            var defaultTileParams = jpipStructureParser.parseDefaultTileParams();
            
            defaultTileStructureByEdgeType = new Array(3);
            
            for (var horizontalEdge = 0; horizontalEdge < 3; ++horizontalEdge) {
                defaultTileStructureByEdgeType[horizontalEdge] = new Array(3);
                
                for (var verticalEdge = 0; verticalEdge < 3; ++verticalEdge) {
                    var edge = {
                        horizontalEdgeType: horizontalEdge,
                        verticalEdgeType: verticalEdge
                        };
                    
                    defaultTileStructureByEdgeType[horizontalEdge][verticalEdge] =
                        createTileStructure(defaultTileParams, edge);
                }
            }
        }
        
        var structureByVerticalType =
            defaultTileStructureByEdgeType[edgeType.horizontalEdgeType];
        
        var tileStructure = structureByVerticalType[edgeType.verticalEdgeType];
        
        return tileStructure;
    }
    
    function createTileStructure(tileParams, edgeType) {
        validateParams();
        
        var sizeParams = JSON.parse(JSON.stringify(tileParams));
        
        sizeParams.tileSize = sizesCalculator.getTileSize(edgeType);
        
        sizeParams.defaultComponentParams.scaleX = 1;
        sizeParams.defaultComponentParams.scaleY = 1;
        
        for (var i = 0; i < sizeParams.paramsPerComponent.length; ++i) {
            sizeParams.paramsPerComponent[i].scaleX = params.componentsScaleX[i];
            sizeParams.paramsPerComponent[i].scaleY = params.componentsScaleY[i];
        }
        
        var tileStructure = jpipFactory.createTileStructure(sizeParams, self, progressionOrder);
        
        return tileStructure;
    }
    
    function validateParams(self) {
        if (!params) {
            params = jpipStructureParser.parseCodestreamStructure();
            sizesCalculator = jpipFactory.createLevelCalculator(params);
        }
    }
    
    return this;
};