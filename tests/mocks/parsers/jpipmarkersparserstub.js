'use strict';

var jpipMarkersParserStub = {
    checkSupportedMarkers: function checkSupportedMarkers() {
    },
    
    getMandatoryMarkerOffsetInDatabin: function getMandatoryMarkerStub(databin, marker) {
        var result = jpipMarkersParserStub.getMarkerOffsetInDatabin(databin, marker);
        
        if (result === null) {
            throw 'Searched a mandatory marker in a databin in which the marker does not exist. Fix test';
        }
        
        return result;
    },
    
    getMarkerOffsetInDatabin: function getMarkerOffsetInDatabin(databin, marker) {
        if (marker[0] !== 0xFF) {
            throw 'structureParser searched for marker which doesn\'t begin ' +
                'in 0xFF, but 0x' + marker[0].toString(16);
        }
        
        if (databin.buffer.markerOffsets === undefined) {
            throw 'No marker offsets available for markerParserStub. Fix test';
        }
        
        switch (marker[1]) {
            case 0x51:
                return databin.buffer.markerOffsets.SIZ;
            case 0x52:
                return databin.buffer.markerOffsets.COD;
            case 0x53:
                return databin.buffer.markerOffsets.COC;
            case 0x5C:
                return databin.buffer.markerOffsets.QCD;
            case 0x60:
                return databin.buffer.markerOffsets.PPM;
            case 0x61:
                return databin.buffer.markerOffsets.PPT;
            default:
                throw 'structureParser searched for unknown marker 0xFF' +
                    marker[1].toString(16) + '. Fix test';
        }
    }
    };