'use strict';

var JpipOffsetsCalculatorStub = function JpipOffsetsCalculatorStubClosure(mainHeaderDatabin) {
    this.getCodingStyleBaseParams = function(databin, isMandatory) {
        if (databin.buffer.codingStyleBaseParams === undefined) {
            throw 'No codingStyleBaseParams available for offsetsCalculatorStub. Fix test';
        }
        
        return databin.buffer.codingStyleBaseParams;
    };
    
    this.getImageAndTileSizeOffset = function() {
        var result = jpipMarkersParserStub.getMandatoryMarkerOffsetInDatabin(
            mainHeaderDatabin, [0xFF, 0x51]);
        
        return result;
    };
    
    this.getCodingStyleOffset = function(databin, isMandatory) {
        var result;
        
        if (isMandatory) {
            result = jpipMarkersParserStub.getMandatoryMarkerOffsetInDatabin(
                databin, [0xFF, 0x52]);
        } else {
            result = jpipMarkersParserStub.getMarkerOffsetInDatabin(
                databin, [0xFF, 0x52]);
        }
        
        return result;
    };
    
    this.getRangesOfBestResolutionLevelsData = function(databin, numLevelsToCut) {
        if (databin.buffer.rangesOfBestResolutionLevelsData === undefined) {
            throw 'No rangesOfBestResolutionLevelsData available for ' +
                'offsetsCalculatorStub. Fix test';
        }
        
        var ranges = [];    
        
        if (numLevelsToCut !== 0) {
            ranges = databin.buffer.rangesOfBestResolutionLevelsData
                .rangesPerLevelsToCut[numLevelsToCut];
            
            if (ranges === undefined) {
                throw 'No rangesOfBestResolutionLevelsData available for ' +
                    'offsetsCalculatorStub with levelsToCut=' + numLevelsToCut +
                    '. Fix test';
            }
        }
        
        var result = {
            numDecompositionLevelsOffset :
                databin.buffer.rangesOfBestResolutionLevelsData
                    .numDecompositionLevelsOffset,
            ranges: ranges
            };
        
        return result;
    };
};