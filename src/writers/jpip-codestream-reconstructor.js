'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipCodestreamReconstructor(
    databinsSaver,
    headerModifier,
    qualityLayersCache) {
        
    var dummyBufferForLengthCalculation = { isDummyBufferForLengthCalculation: true };
    
    this.createCodestream = function createCodestream(
        codestreamPart,
        minQuality,
        maxQuality) {
        
        return createCodestreamInternal(codestreamPart, minQuality, maxQuality);
    };
    
    this.createHeadersCodestream = function createHeadersCodestream(codestreamPart) {
        var dummyQuality = 1;
        var isOnlyHeaders = true;
        return createCodestreamInternal(
            codestreamPart, dummyQuality, dummyQuality, isOnlyHeaders);
    };
    
    function createCodestreamInternal(
        codestreamPart,
        minQuality,
        maxQuality,
        isOnlyHeadersWithoutBitstream) {

        var calculatedLength = createCodestreamOrCalculateLength(
            dummyBufferForLengthCalculation,
            codestreamPart,
            minQuality,
            maxQuality,
            isOnlyHeadersWithoutBitstream);
        
        if (calculatedLength === null) {
            return null;
        }
        
        var result = new Uint8Array(calculatedLength);
        var actualLength = createCodestreamOrCalculateLength(
            result,
            codestreamPart,
            minQuality,
            maxQuality,
            isOnlyHeadersWithoutBitstream);

        if (actualLength === calculatedLength) {
            return result;
        } else if (actualLength === null) {
            return null;
        }

        throw new jGlobals.jpipExceptions.InternalErrorException(
            'JpipCodestreamReconstructor: Unmatched actualLength ' + actualLength +
            ' and calculatedLength ' + calculatedLength);
    }

    function createCodestreamOrCalculateLength(
        result,
        codestreamPart,
        minQuality,
        maxQuality,
        isOnlyHeadersWithoutBitstream) {
        
        var currentOffset = createMainHeader(result, codestreamPart.level);
        
        if (currentOffset === null) {
            return null;
        }
        
        var tileIdToWrite = 0;
        var tileIterator = codestreamPart.getTileIterator();
        while (tileIterator.tryAdvance()) {
            var tileIdOriginal = tileIterator.tileIndex;
            
            var tileBytesCopied = createTile(
                result,
                currentOffset,
                tileIdToWrite++,
                tileIterator,
                codestreamPart.level,
                minQuality,
                maxQuality,
                isOnlyHeadersWithoutBitstream);
                
            currentOffset += tileBytesCopied;
        
            if (tileBytesCopied === null) {
                return null;
            }
        }
        
        var markerBytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;

        headerModifier.modifyImageSize(result, codestreamPart.fullTilesSize);
        
        if (result === null) {
            return null;
        }
        
        return currentOffset;
    }
    
    function createMainHeader(result, level) {
        if (databinsSaver.getIsJpipTilePartStream()) {
            throw new jGlobals.jpipExceptions.UnsupportedFeatureException(
                'reconstruction of codestream from JPT (Jpip Tile-part) stream', 'A.3.4');
        }
        
        var mainHeader = databinsSaver.getMainHeaderDatabin();
        var currentOffset = mainHeader.copyBytes(result, /*startOffset=*/0, {
            forceCopyAllRange: true
            });
        
        if (currentOffset === null) {
            return null;
        }
        
        var bytesAdded = headerModifier.modifyMainOrTileHeader(
            result, mainHeader, /*offset=*/0, level);
        
        currentOffset += bytesAdded;
        
        bytesAdded = addMamazavComment(result, currentOffset);
        currentOffset += bytesAdded;
        
        return currentOffset;
    }
    
    function createTile(
        result,
        currentOffset,
        tileIdToWrite,
        tileIterator,
        level,
        minNumQualityLayers,
        maxNumQualityLayers,
        isOnlyHeadersWithoutBitstream) {
        
        var tileIdOriginal = tileIterator.tileIndex;

        var startTileOffset = currentOffset;
        var tileHeaderDatabin = databinsSaver.getTileHeaderDatabin(
            tileIdOriginal);
        
        var tileHeaderOffsets = createTileHeaderAndGetOffsets(
            result,
            currentOffset,
            tileHeaderDatabin,
            tileIdToWrite,
            level);
        
        if (tileHeaderOffsets === null) {
            return null;
        }
            
        currentOffset = tileHeaderOffsets.endTileHeaderOffset;
        
        if (!isOnlyHeadersWithoutBitstream) {
            var tileBytesCopied = createTileBitstream(
                result,
                currentOffset,
                tileIterator,
                minNumQualityLayers,
                maxNumQualityLayers);
                
            currentOffset += tileBytesCopied;
            
            if (tileBytesCopied === null) {
                return null;
            }
        }

        var endTileOffset = currentOffset;
        
        var headerAndDataLength =
            endTileOffset - tileHeaderOffsets.startOfTileHeaderOffset;

        headerModifier.modifyInt32(
            result,
            tileHeaderOffsets.headerAndDataLengthPlaceholderOffset,
            headerAndDataLength);

        var bytesCopied = endTileOffset - startTileOffset;
        return bytesCopied;
    }
    
    function createTileHeaderAndGetOffsets(
        result,
        currentOffset,
        tileHeaderDatabin,
        tileIdToWrite,
        level) {
        
        var startOfTileHeaderOffset = currentOffset;
    
        var bytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.StartOfTile);
        currentOffset += bytesCopied;
        
        // A.4.2
        
        var startOfTileSegmentLength = [0, 10]; // Lsot
        bytesCopied = copyBytes(result, currentOffset, startOfTileSegmentLength);
        currentOffset += bytesCopied;
        
        var tileIndex = [tileIdToWrite >>> 8, tileIdToWrite & 0xFF]; // Isot
        bytesCopied = copyBytes(result, currentOffset, tileIndex);
        currentOffset += bytesCopied;
        
        var headerAndDataLengthPlaceholderOffset = currentOffset;
        var headerAndDataLengthPlaceholder = [0, 0, 0, 0]; // Psot
        bytesCopied = copyBytes(result, currentOffset, headerAndDataLengthPlaceholder);
        currentOffset += bytesCopied;
        
        var tilePartIndex = [0]; // TPsot
        bytesCopied = copyBytes(result, currentOffset, tilePartIndex);
        currentOffset += bytesCopied;
        
        var numberOfTileparts = [1]; // TNsot
        bytesCopied = copyBytes(result, currentOffset, numberOfTileparts);
        currentOffset += bytesCopied;
        
        var afterStartOfTileSegmentOffset = currentOffset;
        bytesCopied = tileHeaderDatabin.copyBytes(result, currentOffset, {
            forceCopyAllRange: true
            });
        currentOffset += bytesCopied;
        
        if (bytesCopied === null) {
            // NOTE: Can create empty tile
            return null;
        }
        
        var optionalMarker = new Array(2);
        var databinLength = tileHeaderDatabin.getDatabinLengthIfKnown();
        tileHeaderDatabin.copyBytes(optionalMarker, 0, {
            databinStartOffset: databinLength - 2
        });
        
        var isEndedWithStartOfDataMarker =
            optionalMarker[0] === jGlobals.j2kMarkers.StartOfData[0] &&
            optionalMarker[1] === jGlobals.j2kMarkers.StartOfData[1];
            
        if (!isEndedWithStartOfDataMarker) {
            bytesCopied = copyBytes(
                result, currentOffset, jGlobals.j2kMarkers.StartOfData);
            currentOffset += bytesCopied;
        }
        
        var bytesAdded = headerModifier.modifyMainOrTileHeader(
            result,
            tileHeaderDatabin,
            afterStartOfTileSegmentOffset,
            level);
        
        currentOffset += bytesAdded;

        var offsets = {
            startOfTileHeaderOffset: startOfTileHeaderOffset,
            headerAndDataLengthPlaceholderOffset: headerAndDataLengthPlaceholderOffset,
            endTileHeaderOffset: currentOffset
            };
        
        return offsets;
    }
    
    function createTileBitstream(
        result,
        currentOffset,
        tileIterator,
        minNumQualityLayers,
        maxNumQualityLayers) {
        
        var numQualityLayersInTile =
            tileIterator.tileStructure.getNumQualityLayers();

        var allBytesCopied = 0;
        var hasMorePackets;
        
        if (minNumQualityLayers === 'max') {
            minNumQualityLayers = numQualityLayersInTile;
        }
        
        var precinctIterator = tileIterator.createPrecinctIterator(
            /*isIteratePrecinctsNotInCodestreamPart=*/true);
            
        while (precinctIterator.tryAdvance()) {
            var emptyPacketsToPush = numQualityLayersInTile;
            
            if (precinctIterator.isInCodestreamPart) {
                var inClassIndex =
                    tileIterator.tileStructure.precinctPositionToInClassIndex(
                        precinctIterator);
                var precinctDatabin = databinsSaver.getPrecinctDatabin(
                    inClassIndex);
                
                var qualityLayerOffset = qualityLayersCache.getQualityLayerOffset(
                    precinctDatabin,
                    maxNumQualityLayers,
                    precinctIterator);
                
                var bytesToCopy = qualityLayerOffset.endOffset;
                emptyPacketsToPush =
                    numQualityLayersInTile - qualityLayerOffset.numQualityLayers;
                
                if (qualityLayerOffset.numQualityLayers < minNumQualityLayers) {
                    return null;
                }
                
                var bytesCopied = precinctDatabin.copyBytes(result, currentOffset, {
                    forceCopyAllRange: true,
                    maxLengthToCopy: bytesToCopy
                    });
                
                if (bytesCopied === null) {
                    bytesCopied = 0;
                    emptyPacketsToPush = numQualityLayersInTile;
                }
                
                allBytesCopied += bytesCopied;
                currentOffset += bytesCopied;
            }
            
            if (!result.isDummyBufferForLengthCalculation) {
                for (var i = 0; i < emptyPacketsToPush; ++i) {
                    result[currentOffset++] = 0;
                }
            }
            allBytesCopied += emptyPacketsToPush;
        }
        
        return allBytesCopied;
    }
    
    function addMamazavComment(result, currentOffset) {
        var startOffset = currentOffset;
    
        putByte(result, currentOffset++, 0xFF);
        putByte(result, currentOffset++, 0x64);
        putByte(result, currentOffset++, 0x00);
        putByte(result, currentOffset++, 0x09);
        putByte(result, currentOffset++, 77  );
        putByte(result, currentOffset++, 97  );
        putByte(result, currentOffset++, 109 );
        putByte(result, currentOffset++, 97  );
        putByte(result, currentOffset++, 122 );
        putByte(result, currentOffset++, 97  );
        putByte(result, currentOffset++, 118 );
        
        var bytesAdded = currentOffset - startOffset;
        return bytesAdded;
    }
        
    function copyBytes(result, resultStartOffset, bytesToCopy) {
        if (!result.isDummyBufferForLengthCalculation) {
            for (var i = 0; i < bytesToCopy.length; ++i) {
                result[i + resultStartOffset] = bytesToCopy[i];
            }
        }
        
        return bytesToCopy.length;
    }
    
    function putByte(result, offset, value) {
        if (!result.isDummyBufferForLengthCalculation) {
            result[offset] = value;
        }
    }
};