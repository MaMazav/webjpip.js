'use strict';

var JpipHeaderModifierStubForReconstructorTest =
    function JpipHeaderModifierStubForReconstructorTest() {
    
    var databinsToOverride = {};
    
    this.levelArgumentForTest = null;
    this.codestreamPartParamsArgumentForTest = null;
    
    this.addDatabinOverrideDataForTest =
        function addDatabinOverrideDataForTestClosure(
            databin, offsetInDatabin, byteValue, bytesToRemove) {
        
        var byInClassId = databinsToOverride[databin.getClassId()];
        
        if (byInClassId === undefined) {
            byInClassId = [];
            databinsToOverride[databin.getClassId()] = byInClassId;
        } else if (byInClassId[databin.getInClassId()] !== undefined) {
            throw 'Conflicting override data in headerModifier stub. Fix test';
        }
        
        byInClassId[databin.getInClassId()] = {
            offsetInDatabin: offsetInDatabin,
            byteValue: byteValue,
            bytesToRemove: bytesToRemove
            };
    }

    this.modifyMainOrTileHeader = function modifyMainOrTileHeaderClosure(
        result, originalDatabin, databinOffsetInResult, level) {
        
        this.levelArgumentForTest = level;
        
        var byInClassId = databinsToOverride[originalDatabin.getClassId()];
        if (byInClassId === undefined) {
            return 0;
        }
        
        var overrideInfo = byInClassId[originalDatabin.getInClassId()];
        if (overrideInfo === undefined) {
            return 0;
        }
        
        result[databinOffsetInResult + overrideInfo.offsetInDatabin] =
            overrideInfo.byteValue;
        
        var startOffsetToRemove = databinOffsetInResult + overrideInfo.bytesToRemove.start;
        var newLength = result.length - overrideInfo.bytesToRemove.length;
        for (var target = startOffsetToRemove; target < newLength; ++target) {
            result[target] = result[target + overrideInfo.bytesToRemove.length];
        }
        
        var bytesAdded = -overrideInfo.bytesToRemove.length;
        return bytesAdded;
    };
    
    this.modifyImageSize = function modifyImageSize(
        result, codestreamPartParams) {
        
        this.codestreamPartParamsArgumentForTest = codestreamPartParams;
        
        result[3] = 0xBB;
    };
    
    this.modifyInt32 = function modifyInt32(bytes, offset, newValue) {
        if (offset + 4 > bytes.length) {
            throw 'Not enough room for int32';
        }
        
        if (newValue > 255) {
            throw 'Too large int32 to modify for HeaderModifier stub. Fix test';
        }
        
        bytes[offset] = 0;
        bytes[offset + 1] = 0;
        bytes[offset + 2] = 0;
        bytes[offset + 3] = newValue;
    };
};