'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipPrecinctCodestreamPart(
    sizesCalculator,
    tileStructure,
    tileIndex,
    component,
    levelIndex,
    precinctX,
    precinctY) {

    var fullTilesSize = null;
    var tilesBounds = null;
    var level = calculateLevel();

    Object.defineProperty(this, 'level', { get: function() {
        return level;
    }});

    Object.defineProperty(this, 'fullTilesSize', { get: function() {
        if (fullTilesSize === null) {
            var tileBounds = this.tilesBounds;
            fullTilesSize = sizesCalculator.getSizeOfTiles(tileBounds);
        }
        return fullTilesSize;
    }});
    
    Object.defineProperty(this, 'tilesBounds', { get: function() {
        if (tilesBounds === null) {
            var numTilesX = sizesCalculator.getNumTilesX();
            var x = tileIndex % numTilesX;
            var y = Math.floor(tileIndex / numTilesX);
            tilesBounds = {
                level: level,
                minTileX: x,
                minTileY: y,
                maxTileXExclusive: x + 1,
                maxTileYExclusive: y + 1
            };        
        }
        return tilesBounds;
    }});
    
    this.getTileIterator = function() {
        var tryAdvanceTileCalls = 0;
        
        return {
            get tileIndex() {
                checkValidTileIterator('tile', tryAdvanceTileCalls);
                return tileIndex;
            },
            
            get tileStructure() {
                checkValidTileIterator('tile', tryAdvanceTileCalls);
                return tileStructure;
            },
            
            tryAdvance: function tryAdvance() {
                if (tryAdvanceTileCalls > 2) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Cannot advance tile iterator after ended');
                }
                ++tryAdvanceTileCalls;
                return tryAdvanceTileCalls < 2;
            },
            
            createPrecinctIterator: function createPrecinctIterator(
                isIteratePrecinctsNotInCodestreamPart) {
                    
                checkValidTileIterator('tile', tryAdvanceTileCalls);
                
                if (isIteratePrecinctsNotInCodestreamPart) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Precinct iterator of single precinct part cannot ' +
                        'iterate precincts out of part');
                }
                
                var tryAdvanceCalls = 0;
                
                return {
                    get tileIndex() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return tileIndex;
                    },
                    get component() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return component;
                    },
                    get precinctX() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return precinctX;
                    },
                    get precinctY() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return precinctY;
                    },
                    get resolutionLevel() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return levelIndex;
                    },
                    get isInCodestreamPart() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return true;
                    },
                    tryAdvance: function tryAdvance() {
                        if (tryAdvanceCalls > 1) {
                            throw new jGlobals.jpipExceptions.InternalErrorException(
                                'Cannot advance precinct iterator after ended');
                        }
                        ++tryAdvanceCalls;
                        return tryAdvanceCalls < 2;
                    }
                };
            }
        };
    };

    function checkValidTileIterator(iteratorType, tryAdvanceCalls) {
        if (tryAdvanceCalls === 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Cannot use ' + iteratorType + ' iterator before started');
        }
        else if (tryAdvanceCalls > 1) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Cannot use ' + iteratorType + ' iterator after ended');
        }
    }
    
    function calculateLevel() {
        var componentStructure =
            tileStructure.getComponentStructure(component);
        var numResolutionLevelsInComponent =
            componentStructure.getNumResolutionLevels();
        return numResolutionLevelsInComponent - levelIndex - 1;
    }
};