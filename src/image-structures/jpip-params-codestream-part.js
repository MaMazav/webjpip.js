'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipParamsCodestreamPart(
    codestreamPartParams, codestreamStructure, jpipFactory) {

    var tilesBounds = null;
    var fullTilesSize = null;
    
    Object.defineProperty(this, 'level', { get: function() {
        return codestreamPartParams ? codestreamPartParams.level : 0;
    }});

    Object.defineProperty(this, 'fullTilesSize', { get: function() {
        if (fullTilesSize === null) {
            validateTilesBounds();
            fullTilesSize = codestreamStructure.getSizeOfTiles(tilesBounds);
        }
        return fullTilesSize;
    }});
    
    Object.defineProperty(this, 'tilesBounds', { get: function() {
        validateTilesBounds();
        return tilesBounds;
    }});
    
    this.getTileIterator = function() {
        var setableIterator = {
            isStarted: false,
            currentX: -1,
            currentY: -1
        };
        
        var iterator = {
            get tileIndex() {
                if (!setableIterator.isStarted) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'iterator.tileIndex accessed before tryAdvance()');
                }
                
                var tilesInRow = codestreamStructure.getNumTilesX();
                var firstInRow = setableIterator.currentY * tilesInRow;
                var index = firstInRow + setableIterator.currentX;
                
                return index;
            },
            
            get tileStructure() {
                if (!setableIterator.isStarted) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'iterator.tileIndex accessed before tryAdvance()');
                }
                var idx = iterator.tileIndex;
                var tileStructure = codestreamStructure.getTileStructure(idx);
                return tileStructure;
            },
            
            createPrecinctIterator: function createPrecinctIterator(
                isIteratePrecinctsNotInCodestreamPart) {
                
                if (!setableIterator.isStarted) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'iterator.tileIndex accessed before tryAdvance()');
                }
                var idx = iterator.tileIndex;
                return jpipFactory.createParamsPrecinctIterator(
                    codestreamStructure,
                    idx,
                    codestreamPartParams,
                    isIteratePrecinctsNotInCodestreamPart);
            },
            
            tryAdvance: function tryAdvance() {
                var result = tryAdvanceTileIterator(setableIterator);
                return result;
            }
        };
        
        return iterator;
    };
    
    function tryAdvanceTileIterator(setableIterator) {
        if (!setableIterator.isStarted) {
            validateTilesBounds();
            setableIterator.isStarted = true;
            setableIterator.currentX = tilesBounds.minTileX;
            setableIterator.currentY = tilesBounds.minTileY;
            
            return true;
        }

        if (setableIterator.currentY >= tilesBounds.maxTileYExclusive) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Cannot advance tile iterator after end');
        }
        
        ++setableIterator.currentX;
        if (setableIterator.currentX < tilesBounds.maxTileXExclusive) {
            return true;
        }
        
        setableIterator.currentX = tilesBounds.minTileX;
        ++setableIterator.currentY;
        
        var isMoreTilesAvailable =
            setableIterator.currentY < tilesBounds.maxTileYExclusive;
        
        return isMoreTilesAvailable;
    }
    
    function validateTilesBounds() {
        if (tilesBounds !== null) {
            return;
        }
        if (!codestreamPartParams) {
            tilesBounds = {
                level: 0,
                minTileX: 0,
                minTileY: 0,
                maxTileXExclusive: codestreamStructure.getNumTilesX(),
                maxTileYExclusive: codestreamStructure.getNumTilesY()
            };
        } else {
            tilesBounds = codestreamStructure.getTilesFromPixels(
                codestreamPartParams);
        }
    }
};