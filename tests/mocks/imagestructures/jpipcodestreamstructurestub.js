'use strict';

var JpipCodestreamStructureStub = function JpipCodestreamStructureStub(
    defaultTileStructureStub, sizeOfPartResult, levelSizesResult) {
    
    var tileIndexToStructureMap = null;
    
    this.overrideTilesForTest = function overrideTilesForTest(
        indexToStructureMap) {
        
        tileIndexToStructureMap = indexToStructureMap;
    };

    this.getNumTilesX = function() { return 3; };
    this.getNumTilesY = function() { return 1; };
    this.getFirstTileOffsetX = function() { return 15; };
    this.getFirstTileOffsetY = function() { return 20; };
    
    this.getTileStructure = function(tileIndex) {
        if (tileIndexToStructureMap !== null) {
            var overridenTile = tileIndexToStructureMap[tileIndex];
            
            if (overridenTile !== undefined) {
                return overridenTile;
            }
        }
        
        return defaultTileStructureStub;
    };

    this.getDefaultTileStructure = function getDefaultTileStructure() {
        return defaultTileStructureStub;
    };
    
    this.getImageWidth = function getImageWidth() {
        return this.getNumTilesX() * defaultTileStructureStub.getTileWidth();
    };

    this.getImageHeight = function getImageHeight() {
        return this.getNumTilesY() * defaultTileStructureStub.getTileHeight();
    };
    
    this.getTileWidth = function getTileWidth(level) {
        return Math.ceil(defaultTileStructureStub.getTileWidth() / (1 << level));
    };
    
    this.getTileHeight = function getTileHeight(level) {
        return Math.ceil(defaultTileStructureStub.getTileHeight() / (1 << level));
    };
    
    this.getSizeOfPart = function getSizeOfPart(codestreamPartParams) {
        if (sizeOfPartResult === undefined) {
            throw 'Result of getSizeOfPart is not given to stub. Fix test';
        }
        
        return sizeOfPartResult;
    };

    this.getLevelWidth = function getLevelWidth(level) {
        if (levelSizesResult === undefined) {
            throw 'Result of getLevelSize is not given to stub. Fix test';
        }
        
        level = level || 0;
        
        if (levelSizesResult[level] === undefined) {
            throw 'Result of getLevelSize is not given to stub for level ' +
                level + '. Fix test';
        }
        
        return levelSizesResult[level][0];
    };

    this.getLevelHeight = function getLevelWidth(level) {
        if (levelSizesResult === undefined) {
            throw 'Result of getLevelSize is not given to stub. Fix test';
        }
        
        level = level || 0;
        
        if (levelSizesResult[level] === undefined) {
            throw 'Result of getLevelSize is not given to stub for level ' +
                level + '. Fix test';
        }
        
        return levelSizesResult[level][1];
    };
    
    this.getSizesParams = function getSizesParams() {
        return { sizes: 'Dummy sizes parameters' };
    };
};