'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipCodestreamReconstructor(
    codestreamStructure,
    databinsSaver,
    headerModifier,
    qualityLayersCache) {
        
    var dummyBufferForLengthCalculation = { dummyBufferForLengthCalculation: true };
    
    this.reconstructCodestream = function reconstructCodestream(
        minNumQualityLayers) {
        
        return getAsArrayBuffer(reconstructCodestreamInternal, minNumQualityLayers);
    };
    
    this.createCodestreamForRegion = function createCodestreamForRegion(
        params, minNumQualityLayers, isOnlyHeadersWithoutBitstream) {
        
        var codestream = getAsArrayBuffer(
            createCodestreamForRegionInternal,
            params,
            minNumQualityLayers,
            isOnlyHeadersWithoutBitstream);
        
        if (codestream === null) {
            return null;
        }
        
        var tileIterator = codestreamStructure.getTilesIterator(params);
        var firstTileId = tileIterator.tileIndex;
        
        var firstTileLeft = codestreamStructure.getTileLeft(
            firstTileId, params.level);
        var firstTileTop = codestreamStructure.getTileTop(
            firstTileId, params.level);
            
        var offsetX = params.minX - firstTileLeft;
        var offsetY = params.minY - firstTileTop;
        
        return {
            codestream: codestream,
            offsetX: offsetX,
            offsetY: offsetY
        };
    };
    
    this.createCodestreamForTile = function createCodestreamForTile(
        tileId,
        level,
        minNumQualityLayers,
        quality) {
        
        return getAsArrayBuffer(
            createCodestreamForTileInternal,
            tileId,
            level,
            minNumQualityLayers,
            quality);
    };
    
    function getAsArrayBuffer(writerFunction, arg1, arg2, arg3, arg4) {
        var calculatedLength = writerFunction(
            dummyBufferForLengthCalculation, arg1, arg2, arg3, arg4);
        
        if (calculatedLength === null) {
            return null;
        }
        
        var result = new Uint8Array(calculatedLength);
        var actualLength = writerFunction(
            result, arg1, arg2, arg3, arg4);

        if (actualLength === calculatedLength) {
            return result;
        } else if (actualLength === null) {
            return null;
        }

        throw new jGlobals.jpipExceptions.InternalErrorException(
            'JpipCodestreamReconstructor: Unmatched actualLength ' + actualLength +
            ' and calculatedLength ' + calculatedLength);
    }

    function reconstructCodestreamInternal(
        result, minNumQualityLayers) {
        
        var currentOffset = createMainHeader(result);
        
        if (currentOffset === null) {
            return null;
        }
        
        var numTiles =
            codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        
        var codestreamPart;
        
        if (minNumQualityLayers === undefined) {
            minNumQualityLayers = 'max';
        }
        
        for (var tileId = 0; tileId < numTiles; ++tileId) {
            var tileBytesCopied = createTile(
                result,
                currentOffset,
                tileId,
                tileId,
                codestreamPart,
                minNumQualityLayers);
            
            currentOffset += tileBytesCopied;
            
            if (tileBytesCopied === null) {
                return null;
            }
        }
        
        var markerBytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;

        return currentOffset;
    }
    
    function createCodestreamForRegionInternal(
        result, params, minNumQualityLayers, isOnlyHeadersWithoutBitstream) {
        
        var currentOffset = createMainHeader(
            result, params.level);
        
        if (currentOffset === null) {
            return null;
        }
        
        var tileIdToWrite = 0;
        var tileIterator = codestreamStructure.getTilesIterator(params);
        
        do {
            var tileIdOriginal = tileIterator.tileIndex;
            
            var tileBytesCopied = createTile(
                result,
                currentOffset,
                tileIdToWrite++,
                tileIdOriginal,
                params,
                minNumQualityLayers,
                isOnlyHeadersWithoutBitstream);
                
            currentOffset += tileBytesCopied;
        
            if (tileBytesCopied === null) {
                return null;
            }
        } while (tileIterator.tryAdvance());
        
        var markerBytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;

        headerModifier.modifyImageSize(result, params);
        
        if (result === null) {
            return null;
        }
        
        return currentOffset;
    }
    
    function createCodestreamForTileInternal(
        result,
        tileId,
        level,
        minNumQualityLayers,
        quality) {
        
        var currentOffset = createMainHeader(result, level);
        
        if (currentOffset === null) {
            return null;
        }
        
        // TODO: Delete this function and test createCodestreamForRegion instead
        
        var codestreamPartParams = {
            level: level,
            quality: quality
            };
        
        var tileBytesCopied = createTile(
            result,
            currentOffset,
            /*tileIdToWrite=*/0,
            /*tileIdOriginal=*/tileId,
            codestreamPartParams,
            minNumQualityLayers);
            
        currentOffset += tileBytesCopied;
        
        if (tileBytesCopied === null) {
            return null;
        }

        var markerBytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;
        
        var numTilesX = codestreamStructure.getNumTilesX();
        var tileX = tileId % numTilesX;
        var tileY = Math.floor(tileId / numTilesX);
        
        headerModifier.modifyImageSize(result, {
            level: level,
            minTileX: tileX,
            maxTileXExclusive: tileX + 1,
            minTileY: tileY,
            maxTileYExclusive: tileY + 1
            });
        
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
        tileIdOriginal,
        codestreamPartParams,
        minNumQualityLayers,
        isOnlyHeadersWithoutBitstream) {
        
        var tileStructure = codestreamStructure.getTileStructure(
            tileIdOriginal);

        var startTileOffset = currentOffset;
        var tileHeaderDatabin = databinsSaver.getTileHeaderDatabin(
            tileIdOriginal);
        
        var level;
        if (codestreamPartParams !== undefined) {
            level = codestreamPartParams.level;
        }
        
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
                tileStructure,
                tileIdOriginal,
                codestreamPartParams,
                minNumQualityLayers);
                
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
        
        var isEndedWithStartOfDataMarker =
            result[currentOffset - 2] === jGlobals.j2kMarkers.StartOfData[0] &&
            result[currentOffset - 1] === jGlobals.j2kMarkers.StartOfData[1];
            
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
        tileStructure,
        tileIdOriginal,
        codestreamPartParams,
        minNumQualityLayers) {
        
        var numQualityLayersInTile = tileStructure.getNumQualityLayers();
        var quality;
        var iterator = tileStructure.getPrecinctIterator(
            tileIdOriginal,
            codestreamPartParams,
            /*isIteratePrecinctsNotInCodestreamPart=*/true);

        var allBytesCopied = 0;
        var hasMorePackets;
        
        if (codestreamPartParams !== undefined) {
            quality = codestreamPartParams.quality;
        }
        
        if (minNumQualityLayers === 'max') {
            minNumQualityLayers = numQualityLayersInTile;
        }
        
        do {
            var emptyPacketsToPush = numQualityLayersInTile;
            
            if (iterator.isInCodestreamPart) {
                var inClassId =
                    tileStructure.precinctPositionToInClassIndex(iterator);
                var precinctDatabin = databinsSaver.getPrecinctDatabin(inClassId);
                
                var qualityLayerOffset = qualityLayersCache.getQualityLayerOffset(
                    precinctDatabin,
                    quality,
                    iterator);
                
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
            
            if (!result.dummyBufferForLengthCalculation) {
                for (var i = 0; i < emptyPacketsToPush; ++i) {
                    result[currentOffset++] = 0;
                }
            }
            allBytesCopied += emptyPacketsToPush;
        }
        while (iterator.tryAdvance());
        
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
        if (!result.dummyBufferForLengthCalculation) {
            for (var i = 0; i < bytesToCopy.length; ++i) {
                result[i + resultStartOffset] = bytesToCopy[i];
            }
        }
        
        return bytesToCopy.length;
    }
    
    function putByte(result, offset, value) {
        if (!result.dummyBufferForLengthCalculation) {
            result[offset] = value;
        }
    }
};