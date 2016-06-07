'use strict';

var JpipTileStructureStub = function(
    tileParams, codestreamStructure, progressionOrder, componentStructure) {
    
    this.getComponentStructure = function(component) {
        if (componentStructure !== undefined) {
            return componentStructure;
        }
        
        throw 'Unexpected call to JpipTileStructureStub.getComponentStructure(). Fix test stub implementation';
    };
    
    this.getDefaultComponentStructure = function() {
        if (componentStructure !== undefined) {
            return componentStructure;
        }
        
        throw 'Unexpected call to JpipTileStructureStub.getDefaultComponentStructure(). Fix test stub implementation';
    };
    
    this.getProgressionOrder = function() {
        return progressionOrder;
    };
    
    this.getTileWidth = function() {
        return tileParams.tileSize[0];
    };
    
    this.getTileHeight = function() {
        return tileParams.tileSize[1];
    };
    
    this.getNumQualityLayers = function getNumQualityLayers() {
        return tileParams.numQualityLayers;
    };
    
    this.getIsPacketHeaderNearData = function getIsPacketHeaderNearData() {
        return tileParams.isPacketHeadersNearData;
    };
    
    this.getIsStartOfPacketMarkerAllowed = function getIsStartOfPacketMarkerAllowed() {
        return tileParams.isStartOfPacketMarkerAllowed;
    };
    
    this.getIsEndPacketHeaderMarkerAllowed =
        function getIsEndPacketHeaderMarkerAllowed() {
        
        return tileParams.isEndPacketHeaderMarkerAllowed;
    };
    
    this.getCodestreamStructureForTest = function() {
        return codestreamStructure;
    };
    
    this.getTileSizeForTest = function() {
        return tileParams.tileSize;
    };
    
    this.getPrecinctIterator = function getPrecinctIterator(
        tileIndex, codestreamPartParams, isIteratePrecinctsNotInCodestreamPart) {
        
        var dummyPos = 0;
        
        var iterator = {
            tryAdvance: function tryAdvance() {
                if (dummyPos === 2) {
                    return false;
                }
                ++dummyPos;
                return true;
            },
            
            get dummyPos() { return dummyPos; },
            
            get isInCodestreamPart() { return true; }
        };
        
        return iterator;
    };
    
    this.precinctPositionToInClassIndex = function(precinctPosition) {
        return precinctPosition.dummyPos;
    };
};