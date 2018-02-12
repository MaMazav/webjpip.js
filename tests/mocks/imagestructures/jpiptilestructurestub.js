'use strict';

var JpipTileStructureStub = function(
    tileParams, codestreamStructure, progressionOrder, componentStructure) {
    
    this.getComponentStructure = function(component) {
        if (componentStructure !== undefined) {
            return componentStructure;
        }
        
        return mockFactoryForCodestreamStructureTest.createComponentStructure(
            tileParams.paramsPerComponent[component],
            this);
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
    
    this.precinctPositionToInClassIndex = function(precinctPosition) {
        return precinctPosition.dummyPos;
    };
    
    this.getMinNumResolutionLevelsOverComponents = function() {
        var result = tileParams.paramsPerComponent[0].numResolutionLevels;
        for (var i = 1; i < tileParams.paramsPerComponent.length; ++i) {
            result = Math.min(result, tileParams.paramsPerComponent[i].numResolutionLevels);
        }
        return result;
    };
};