'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipHeaderModifier = function JpipHeaderModifier(
    codestreamStructure, offsetsCalculator, progressionOrder) {

    var encodedProgressionOrder = encodeProgressionOrder(progressionOrder);
        
    this.modifyMainOrTileHeader = function modifyMainOrTileHeader(
        result, originalDatabin, databinOffsetInResult, numResolutionLevelsToCut) {
        
        modifyProgressionOrder(result, originalDatabin, databinOffsetInResult);
        
        if (numResolutionLevelsToCut === undefined) {
            return 0;
        }
        
        var bestResolutionLevelsRanges =
            offsetsCalculator.getRangesOfBestResolutionLevelsData(
                originalDatabin, numResolutionLevelsToCut);
        
        if (bestResolutionLevelsRanges.numDecompositionLevelsOffset !== null) {
            var offset =
                databinOffsetInResult +
                bestResolutionLevelsRanges.numDecompositionLevelsOffset;
                
            result[offset] -= numResolutionLevelsToCut;
        }
        
        var bytesRemoved = removeRanges(
            result, bestResolutionLevelsRanges.ranges, databinOffsetInResult);
        
        var bytesAdded = -bytesRemoved;
        return bytesAdded;
    };
    
    this.modifyImageSize = function modifyImageSize(result, codestreamPartParams) {
        var newTileWidth = codestreamStructure.getTileWidth(
            codestreamPartParams.numResolutionLevelsToCut);
        var newTileHeight = codestreamStructure.getTileHeight(
            codestreamPartParams.numResolutionLevelsToCut);
        
        var newReferenceGridSize = codestreamStructure.getSizeOfPart(
            codestreamPartParams);
        
        var sizMarkerOffset = offsetsCalculator.getImageAndTileSizeOffset();
            
        var referenceGridSizeOffset =
            sizMarkerOffset + jGlobals.j2kOffsets.REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER;

        var imageOffsetBytesOffset = referenceGridSizeOffset + 8;
        var tileSizeBytesOffset = referenceGridSizeOffset + 16;
        var firstTileOffsetBytesOffset = referenceGridSizeOffset + 24;
        
        modifyInt32(result, referenceGridSizeOffset, newReferenceGridSize.width);
        modifyInt32(result, referenceGridSizeOffset + 4, newReferenceGridSize.height);
        
        modifyInt32(result, tileSizeBytesOffset, newTileWidth);
        modifyInt32(result, tileSizeBytesOffset + 4, newTileHeight);
        
        modifyInt32(result, imageOffsetBytesOffset, 0);
        modifyInt32(result, imageOffsetBytesOffset + 4, 0);
                
        modifyInt32(result, firstTileOffsetBytesOffset, 0);
        modifyInt32(result, firstTileOffsetBytesOffset + 4, 0);
    };
    
    this.modifyInt32 = modifyInt32;
    
    function modifyProgressionOrder(result, originalDatabin, databinOffsetInResult) {
        var codingStyleOffset = offsetsCalculator.getCodingStyleOffset(originalDatabin);
        
        if (codingStyleOffset !== null) {
            var progressionOrderOffset =
                databinOffsetInResult + codingStyleOffset + 5;
            
            result[progressionOrderOffset] = encodedProgressionOrder;
        }
    }
    
    function removeRanges(result, rangesToRemove, addOffset) {
        if (rangesToRemove.length === 0) {
            return 0; // zero bytes removed
        }
        
        for (var i = 0; i < rangesToRemove.length; ++i) {
            var offset =
                addOffset +
                rangesToRemove[i].markerSegmentLengthOffset;
                
            var originalMarkerSegmentLength =
                (result[offset] << 8) + result[offset + 1];
            
            var newMarkerSegmentLength =
                originalMarkerSegmentLength - rangesToRemove[i].length;
            
            result[offset] = newMarkerSegmentLength >>> 8;
            result[offset + 1] = newMarkerSegmentLength & 0xFF;
        }
        
        var offsetTarget = addOffset + rangesToRemove[0].start;
        var offsetSource = offsetTarget;
        for (var j = 0; j < rangesToRemove.length; ++j) {
            offsetSource += rangesToRemove[j].length;
            
            var nextRangeOffset =
                j + 1 < rangesToRemove.length ?
                    addOffset + rangesToRemove[j + 1].start :
                    result.length;

            for (; offsetSource < nextRangeOffset; ++offsetSource) {
                result[offsetTarget] = result[offsetSource];
                ++offsetTarget;
            }
        }
        
        var bytesRemoved = offsetSource - offsetTarget;
        
        return bytesRemoved;
    }

    function modifyInt32(bytes, offset, newValue) {
        bytes[offset++] = newValue >>> 24;
        bytes[offset++] = (newValue >>> 16) & 0xFF;
        bytes[offset++] = (newValue >>> 8) & 0xFF;
        bytes[offset++] = newValue & 0xFF;
    }

    function encodeProgressionOrder(progressionOrder) {
        // A.6.1
        
        // Table A.16
        
        switch (progressionOrder) {
            case 'LRCP':
                return 0;
                
            case 'RLCP':
                return 1;
                
            case 'RPCL':
                return 2;
            
            case 'PCRL':
                return 3;
                
            case 'CPRL':
                return 4;
            
            default:
                throw new jGlobals.j2kExceptions.IllegalDataException('Progression order of ' + progressionOrder, 'A.6.1, table A.16');
        }
    }
};