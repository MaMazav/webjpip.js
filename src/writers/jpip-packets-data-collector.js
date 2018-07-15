'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipPacketsDataCollector(
    databinsSaver,
    qualityLayersCache,
    jpipFactory) {
    
    this.getAllCodeblocksData = function getAllCodeblocksData(
        codestreamPart, minQuality, maxQuality) {
            
        var alreadyReturnedCodeblocks = [];
        var codeblocksData = getNewCodeblocksDataAndUpdateReturnedCodeblocks(
            codestreamPart, minQuality, maxQuality, alreadyReturnedCodeblocks);
        
        return {
            codeblocksData: codeblocksData,
            alreadyReturnedCodeblocks: alreadyReturnedCodeblocks
            };
    };
        
    function getNewCodeblocksDataAndUpdateReturnedCodeblocks(
        codestreamPart, minQuality, maxQuality, alreadyReturnedCodeblocks) {
        
        var tileIndexInCodestreamPart = 0;
        var dummyOffset = 0;
        var tileIterator = codestreamPart.getTileIterator();
        var result = {
            packetDataOffsets: [],
            data: jpipFactory.createCompositeArray(dummyOffset),
            allRelevantBytesLoaded: 0
            };
        
        while (tileIterator.tryAdvance()) {
            var precinctIterator = tileIterator.createPrecinctIterator();
            
            var quality = tileIterator.tileStructure.getNumQualityLayers();
            
            if (maxQuality !== undefined && maxQuality !== 'max') {
                quality = Math.min(quality, maxQuality);
            }
            
            if (minQuality === 'max') {
                codestreamPart.minNumQualityLayers = quality;
            } else if (minQuality > quality) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'minQuality is larger than quality');
            }
            
            while (precinctIterator.tryAdvance()) {
                if (!precinctIterator.isInCodestreamPart) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Unexpected precinct not in codestream part');
                }
                
                var inClassIndex =
                    tileIterator.tileStructure.precinctPositionToInClassIndex(
                        precinctIterator);
                var precinctDatabin = databinsSaver.getPrecinctDatabin(
                    inClassIndex);
                
                var returnedInPrecinct =
                    alreadyReturnedCodeblocks[inClassIndex];
                if (returnedInPrecinct === undefined) {
                    returnedInPrecinct = { layerPerCodeblock: [] };
                    alreadyReturnedCodeblocks[inClassIndex] =
                        returnedInPrecinct;
                }
            
                var layerReached = pushPackets(
                    result,
                    tileIndexInCodestreamPart,
                    tileIterator.tileStructure,
                    precinctIterator,
                    precinctDatabin,
                    returnedInPrecinct,
                    quality);
                
                if (layerReached < minQuality) {
                    // NOTE: alreadyReturnedCodeblocks is wrong in this stage,
                    // because it was updated with a data which will not be
                    // returned. I don't care about it now because returning
                    // null here means something bad happened (an exception is
                    // thrown in RequestContext when this happens).
                    // If some day the consistency of alreadyReturnedCodeblocks
                    // is important then a new object should be returned on each
                    // call to this function, or a transactional style should be
                    // used here to abort all non-returned data.
                    
                    return null;
                }
            }
            
            ++tileIndexInCodestreamPart;
        }
        
        var dataAsUint8 = new Uint8Array(result.data.getLength());
        result.data.copyToTypedArray(dataAsUint8, 0, 0, result.data.getLength());
        result.data = dataAsUint8;
        
        return result;
    }

    function pushPackets(
        result,
        tileIndexInCodestreamPart,
        tileStructure,
        precinctIterator,
        precinctDatabin,
        returnedCodeblocksInPrecinct,
        quality) {
        
        var layer;
        var offsetInPrecinctDatabin;
        
        for (layer = 0; layer < quality; ++layer) {
            var codeblockOffsetsInDatabin =
                qualityLayersCache.getPacketOffsetsByCodeblockIndex(
                    precinctDatabin, layer, precinctIterator);
            
            if (codeblockOffsetsInDatabin === null) {
                break;
            }
            
            offsetInPrecinctDatabin =
                codeblockOffsetsInDatabin.headerStartOffset +
                codeblockOffsetsInDatabin.headerLength;
            
            var numCodeblocks =
                codeblockOffsetsInDatabin.codeblockBodyLengthByIndex.length;
            var codeblockOffsetsInResult = new Array(numCodeblocks);
            
            var isIncompletePacket = false;
            
            for (var i = 0; i < numCodeblocks; ++i) {
                var returned = returnedCodeblocksInPrecinct.layerPerCodeblock[i];
                if (returned === undefined) {
                    returned = { layer: -1 };
                    returnedCodeblocksInPrecinct.layerPerCodeblock[i] = returned;
                } else if (returned.layer >= layer) {
                    continue;
                }
                
                var codeblock =
                    codeblockOffsetsInDatabin.codeblockBodyLengthByIndex[i];
                
                var offsetInResultArray = result.data.getLength();
                
                var bytesCopied = precinctDatabin.copyToCompositeArray(
                    result.data,
                    {
                        databinStartOffset: offsetInPrecinctDatabin,
                        maxLengthToCopy: codeblock.codeblockBodyLengthBytes,
                        forceCopyAllRange: true
                    });
                
                if (bytesCopied !== codeblock.codeblockBodyLengthBytes) {
                    codeblockOffsetsInResult.length = i;
                    isIncompletePacket = true;
                    break;
                }
                
                returned.layer = layer;
                codeblockOffsetsInResult[i] = {
                    start: offsetInResultArray,
                    end: offsetInResultArray + codeblock.codeblockBodyLengthBytes,
                    codingpasses: codeblock.codingPasses,
                    zeroBitPlanes: codeblock.zeroBitPlanes
                    };
                
                offsetInPrecinctDatabin += codeblock.codeblockBodyLengthBytes;
            }
            
            var precinctIndex =
                tileStructure.precinctPositionToIndexInComponentResolution(
                    precinctIterator);
            var packet = {
                tileIndex: tileIndexInCodestreamPart,
                r: precinctIterator.resolutionLevel,
                p: precinctIndex,
                c: precinctIterator.component,
                l: layer,
                codeblockOffsets: codeblockOffsetsInResult
                };

            result.packetDataOffsets.push(packet);
            
            if (isIncompletePacket) {
                break;
            }
        }
        
        result.allRelevantBytesLoaded += offsetInPrecinctDatabin;
        return layer;
    }    
};