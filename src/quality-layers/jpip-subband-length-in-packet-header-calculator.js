'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports =
    function JpipSubbandLengthInPacketHeaderCalculator(
        bitstreamReader,
        numCodeblocksX,
        numCodeblocksY,
        codingPassesNumberParser,
        transactionHelper,
        jpipFactory) {
    
    var codeblockLengthParsers = null;
    var isCodeblocksIncluded = null;
    var parsedQualityLayers = transactionHelper.createTransactionalObject(
        0, function cloneLayers(layers) {
            return layers;
        });
        
    var inclusionTree = jpipFactory.createTagTree(
        bitstreamReader, numCodeblocksX, numCodeblocksY);
    
    var zeroBitPlanesTree = jpipFactory.createTagTree(
        bitstreamReader, numCodeblocksX, numCodeblocksY);
    
    this.calculateSubbandLength = function calcualteSubbandLength(qualityLayer) {
        ensureQualityLayerNotParsedYet(qualityLayer);
        
        lazyInitArrays();
        
        inclusionTree.setMinimalValueIfNotReadBits(qualityLayer);
        
        var accumulatedBodyLengthBytes = 0;
        var codeblockIndex = 0;
        var codeblockLengthByIndex = new Array(numCodeblocksX * numCodeblocksY);
        
        for (var y = 0; y < numCodeblocksY; ++y) {
            for (var x = 0; x < numCodeblocksX; ++x) {
                var codeblockBodyLength = getNextCodeblockLength(x, y, qualityLayer);
                if (codeblockBodyLength === null) {
                    return null;
                }
                
                codeblockLengthByIndex[codeblockIndex++] = codeblockBodyLength;
                
                accumulatedBodyLengthBytes +=
                    codeblockBodyLength.codeblockBodyLengthBytes;
            }
        }
        
        parsedQualityLayers.setValue(
            bitstreamReader.activeTransaction, qualityLayer + 1);
        
        return {
            codeblockBodyLengthByIndex: codeblockLengthByIndex,
            overallBodyLengthBytes: accumulatedBodyLengthBytes
            };
    };
    
    function ensureQualityLayerNotParsedYet(qualityLayer) {
        var parsedQualityLayersValue = parsedQualityLayers.getValue(
            bitstreamReader.activeTransaction);
        
        if (parsedQualityLayersValue >= qualityLayer + 1) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Unexpected quality layer to parse');
        }
    }
    
    function lazyInitArrays() {
        if (codeblockLengthParsers !== null) {
            return;
        }
        
        codeblockLengthParsers = new Array(numCodeblocksX);
        isCodeblocksIncluded = new Array(numCodeblocksX);
        
        for (var x = 0; x < numCodeblocksX; ++x) {
            codeblockLengthParsers[x] = new Array(numCodeblocksY);
            isCodeblocksIncluded[x] = new Array(numCodeblocksY);
            
            for (var y = 0; y < numCodeblocksY; ++y) {
                codeblockLengthParsers[x][y] =
                    jpipFactory.createCodeblockLengthParser(
                        bitstreamReader, transactionHelper);
                    
                isCodeblocksIncluded[x][y] = transactionHelper.createTransactionalObject(
                    { isIncluded: false },
                    function cloneIsIncluded(old) {
                        return { isIncluded: old.isIncluded };
                    });
            }
        }
    }
    
    function getNextCodeblockLength(x, y, qualityLayer) {
        var isCodeblockAlreadyIncluded = isCodeblocksIncluded[x][y].getValue(
            bitstreamReader.activeTransaction);
        
        var isCodeblockIncludedNow;
        if (isCodeblockAlreadyIncluded.isIncluded) {
            isCodeblockIncludedNow = bitstreamReader.shiftBit();
        } else {
            isCodeblockIncludedNow = inclusionTree.isSmallerThanOrEqualsTo(
                x, y, qualityLayer);
        }
            
        if (isCodeblockIncludedNow === null) {
            return null;
        } else if (!isCodeblockIncludedNow) {
            return {
                codeblockBodyLengthBytes: 0,
                codingPasses: 0
                };
        }
        
        var zeroBitPlanes = null;
        if (!isCodeblockAlreadyIncluded.isIncluded) {
            zeroBitPlanes = zeroBitPlanesTree.getValue(x, y);
            if (zeroBitPlanes === null) {
                return null;
            }
        }
        
        var codingPasses = codingPassesNumberParser.parse(bitstreamReader);
        if (codingPasses === null) {
            return null;
        }
        
        var lengthParser = codeblockLengthParsers[x][y];
        var bodyLengthBytes = lengthParser.parse(codingPasses);
        
        if (bodyLengthBytes === null) {
            return null;
        }
        
        isCodeblockAlreadyIncluded.isIncluded = true;
        
        var result = {
            codeblockBodyLengthBytes: bodyLengthBytes,
            codingPasses: codingPasses
            };
        
        if (zeroBitPlanes !== null) {
            result.zeroBitPlanes = zeroBitPlanes;
        }
        
        return result;
    }
};