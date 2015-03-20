'use strict';

function JpipQualityLayersCacheStub(codestreamStructureStub, databinsSaver) {
    
    this.waitForQualityLayer = function waitForQualityLayer(
        callback, tileIndex, numResolutionLevelsToCut, numQualityLayers) {
        
        throw 'waitForQualityLayer stub is not implemented. Fix test';
    };
    
    this.getQualityLayerOffset = function getQualityLayerOffset(
        precinctDatabin, maxNumQualityLayers, precinctPosition) {
        
        var tileStructure = codestreamStructureStub.getTileStructure(
            precinctPosition.tileIndex);
        
        var packetLengthCalculator = new JpipPacketLengthCalculatorStub(
            tileStructure,
            /*componentStructure=*/null,
            precinctDatabin,
            /*startOffsetInDatabin=*/0,
            precinctPosition);
        
        var result = packetLengthCalculator.calculateEndOffsetOfLastFullPacket(
            maxNumQualityLayers);
        
        return result;
    };
}