'use strict';

var JpipCodestreamPartStub = function JpipCodestreamPartStub(iteratedTileIndices, level, minNumQualityLayers) {
    Object.defineProperty(this, 'level', { get: function() {
        return level || 0;
    }});
    
    Object.defineProperty(this, 'minNumQualityLayers', { get: function() {
        return minNumQualityLayers === undefined ? 1 : minNumQualityLayers;
    }});
    
    this.getTileIterator = function getTileIterator(codestreamPartParams) {
        var lastIndex = iteratedTileIndices.length - 1;
        
        var iterator = {
            tileIteratorIndexForTest: -1,
            
            tryAdvance: function tryAdvance() {
                if (iterator.tileIteratorIndexForTest >= lastIndex) {
                    return false;
                }
                
                ++iterator.tileIteratorIndexForTest;
                return true;
            },
            
            get tileIndex() {
                var indexInArray = iterator.tileIteratorIndexForTest;
                var result = iteratedTileIndices[indexInArray];
                return result;
            },
            
            get tileStructure() {
                return { getNumQualityLayers: function() {
                    return 5; }
                };
            },
            
            createPrecinctIterator: function createPrecinctIterator(
                isIteratePrecinctsNotInCodestreamPart) {
                
                var dummyPos = -1;
                
                var precinctIteratorTileIndex = iterator.tileIndex;
                
                var precinctIterator = {
                    tryAdvance: function tryAdvance() {
                        if (dummyPos === 2) {
                            return false;
                        }
                        ++dummyPos;
                        return true;
                    },
                    
                    get dummyPos() { return dummyPos; },
                    
                    get isInCodestreamPart() { return true; },
                    
                    get inClassIndex() { return dummyPos; }
                };
                
                return precinctIterator;
            }
        };
        
        return iterator;
    };
};