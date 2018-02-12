'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipParamsCodestreamPart(
    codestreamPartParams, codestreamStructure, jpipFactory) {
    
    var minNumQualityLayers = 'max';
    var maxNumQualityLayersLimit = 'max';
    var tilesBounds = null;
    var fullTilesSize = null;
    
    // TODO: Ensure that strings property name doesn't break on uglify
    
    Object.defineProperty(this, 'level', { get: function() {
        return codestreamPartParams ? codestreamPartParams.level : 0;
    }});
    
    Object.defineProperty(this, 'minX', { get: function() {
        if (codestreamPartParams) {
            return codestreamPartParams.minX;
        } else {
            return 0;
        }
    }});

    Object.defineProperty(this, 'minY', { get: function() {
        if (codestreamPartParams) {
            return codestreamPartParams.minY;
        } else {
            return 0;
        }
    }});
    
    Object.defineProperty(this, 'width', { get: function() {
        if (codestreamPartParams) {
            return codestreamPartParams.maxXExclusive - codestreamPartParams.minX;
        } else {
            return codestreamStructure.getImageWidth();
        }
    }});

    Object.defineProperty(this, 'height', { get: function() {
        if (codestreamPartParams) {
            return codestreamPartParams.maxYExclusive - codestreamPartParams.minY;
        } else {
            return codestreamStructure.getImageHeight();
        }
    }});

    Object.defineProperty(this, 'minNumQualityLayers', { get: function() {
        return minNumQualityLayers;
    }});

    Object.defineProperty(this, 'maxNumQualityLayers', { get: function() {
        if ((!codestreamPartParams) || (codestreamPartParams.quality === 'max')) {
            return maxNumQualityLayersLimit;
        } else if (maxNumQualityLayersLimit == 'max') {
            return codestreamPartParams.quality;
        } else {
            return Math.min(codestreamPartParams.quality, maxNumQualityLayersLimit);
        }
    }});
    
    Object.defineProperty(this, 'fullTilesSize', { get: function() {
        if (fullTilesSize === null) {
            validateTilesBounds();
            fullTilesSize = codestreamStructure.getSizeOfTiles(tilesBounds);
        }
        return fullTilesSize;
    }});
    
    this.setMinNumQualityLayers = function(quality) {
        minNumQualityLayers = quality;
    };
    
    this.setMaxNumQualityLayersLimit = function(quality) {
        maxNumQualityLayersLimit = quality || 'max';
    };
    
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
                return jpipFactory.createJpipParamsPrecinctIterator(
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