'use strict';

function JpipPacketLengthCalculatorStub(
    tileStructure,
    componentStructure,
    databin,
    startOffsetInDatabin,
    precinct) {

    this.calculateEndOffsetOfLastFullPacket =
        function calculateFullPacketsAvailableOffsets(quality) {
    
        var isAllowedFullQuality =
            quality === undefined ||
            quality >= tileStructure.getNumQualityLayers();
            
        if (isAllowedFullQuality && databin.isAllDatabinLoaded()) {
            return {
                endOffset: databin.getDatabinLengthIfKnown(),
                numQualityLayers: tileStructure.getNumQualityLayers()
                };
        }
        
        var packetLengths = databin.buffer.packetLengths;
        if (packetLengths === undefined) {
            throw 'No packet length information in databin stub. Fix test';
        }
        
        var qualityLayers = quality || packetLengths.length;
        return packetLengths[qualityLayers - 1];
    }
}