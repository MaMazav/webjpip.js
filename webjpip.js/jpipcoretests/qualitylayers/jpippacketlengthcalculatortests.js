'use strict';

function createPacketLengthCalculatorForTest(
    databin,
    startOffsetInDatabin,
    resolutionLevel,
    structureOptions) {
    
    qualityLayersCallsLog.clearForTest();
    
    structureOptions = structureOptions || {};
    
    var numCodeblocksXInPrecinct = +structureOptions.numCodeblocksXInPrecinct;
    var numCodeblocksYInPrecinct = +structureOptions.numCodeblocksYInPrecinct;
    
    var numQualityLayers = structureOptions.numQualityLayers || 1;
    var isPacketHeaderNearData = structureOptions.isPacketHeaderNearData;
    var isStartOfPacketMarkerAllowed =
        !!structureOptions.isStartOfPacketMarkerAllowed;
    var isEndPacketHeaderMarkerAllowed =
        !!structureOptions.isEndPacketHeaderMarkerAllowed;
    
    if (isPacketHeaderNearData === undefined) {
        isPacketHeaderNearData = true;
    }
    
    var dummyPrecinct = { resolutionLevel: resolutionLevel };
    
    var componentStructureStub = {
        getNumCodeblocksXInPrecinct: function getNumCodeblocksX(precinct) {
            return numCodeblocksXInPrecinct;
        },
        
        getNumCodeblocksYInPrecinct: function getNumCodeblocksY(precinct) {
            return numCodeblocksYInPrecinct;
        }
    };
    
    var tileStructureStub = {
        getNumQualityLayers: function getNumQualityLayers() {
            return numQualityLayers;
        },
        
        getIsPacketHeaderNearData: function getIsPacketHeaderNearData() {
            return isPacketHeaderNearData;
        },
        
        getIsStartOfPacketMarkerAllowed: function getIsStartOfPacketMarkerAllowed() {
            return isStartOfPacketMarkerAllowed;
        },
        
        getIsEndPacketHeaderMarkerAllowed: function getIsEndPacketHeaderMarkerAllowed() {
            return isEndPacketHeaderMarkerAllowed;
        }
    };
    
    var calculator = new JpipPacketLengthCalculator(
        tileStructureStub,
        componentStructureStub,
        databin,
        startOffsetInDatabin,
        dummyPrecinct,
        mockFactoryForQualityLayersTest);
    
    return calculator;
}

function testEmptyBitMissing(
    assert,
    assertName,
    calculator,
    databin,
    startPacketOffset,
    numQualityLayersBeforeMissing) {
    
    var emptyBitOffsetInBits = 8 * startPacketOffset;
    
    var originalBit = databin.bitsForBitstreamReaderStub[emptyBitOffsetInBits];
    databin.bitsForBitstreamReaderStub[emptyBitOffsetInBits] = null;
    
    var noPacketResultActual =
         calculator.calculateEndOffsetOfLastFullPacket();
    
    var noPacketResultExpected = {
        endOffset: startPacketOffset,
        numQualityLayers: numQualityLayersBeforeMissing
        };
        
    assert.deepEqual(
        noPacketResultActual,
        noPacketResultExpected,
        assertName);
    
    databin.bitsForBitstreamReaderStub[emptyBitOffsetInBits] = originalBit;
}

function testSubbandHeaderMissing(
    assert,
    assertName,
    calculator,
    databin,
    startPacketOffset,
    numQualityLayersBeforeMissing,
    missingSubbandHeaderOffset) {
    
    var original = databin.bitsForBitstreamReaderStub
        .calculateSubbandLength[missingSubbandHeaderOffset];
        
    databin.bitsForBitstreamReaderStub
        .calculateSubbandLength[missingSubbandHeaderOffset] = {
            result: null,
            bitsToShift: 0
            };
    
    var noPacketResultActual =
         calculator.calculateEndOffsetOfLastFullPacket();
        
    var noPacketResultExpected = {
        endOffset: startPacketOffset,
        numQualityLayers: numQualityLayersBeforeMissing
        };
        
    assert.deepEqual(
        noPacketResultActual,
        noPacketResultExpected,
        assertName);
    
    databin.bitsForBitstreamReaderStub
        .calculateSubbandLength[missingSubbandHeaderOffset] = original;
}

function fictiveCodeblockLengthForPacketParserTest(
    codeblockBodyLengthBytes, codingPasses) {
    
    return {
        codeblockBodyLengthBytes: codeblockBodyLengthBytes,
        codingPasses: codingPasses
        };
}

function createDatabinWithMultipleQualityLayersAndSingleSubband() {
    var databin = {
        isAllDatabinLoaded: function() { return false; },
        getDatabinLengthIfKnown: function() { return null; },
        bitsForBitstreamReaderStub: [
            1,                            // Non-zero packet
            0, 0, 0, 0, 0, 0, 0, 0, 0,    // Will be shifted by subband stub
            0, 0, 0, 0, 0, 0,            // Align to byte
            0, 0, 0, 0, 0, 0, 0, 0,        // packet body
            0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0,
            
            1,                            // Non-zero packet
            0, 0, 0, 0, 0,                // Will be shifted by subband stub
            0, 0,                        // Align to byte
            0, 0, 0, 0, 0, 0, 0, 0,        // packet body
            0, 0, 0, 0, 0, 0, 0, 0,
            
            0,                            // Zero-length packet
            0, 0, 0, 0, 0, 0, 0,        // Align to byte
            
            1,                            // Non-zero packet
            0, 0,                        // Will be shifted by subband stub
            0, 0, 0, 0, 0,                // Align to byte
            0, 0, 0, 0, 0, 0, 0, 0,        // packet body
            
            ]
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength = [];
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[1] = {
        result: {
            overallBodyLengthBytes: 3,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(1, 2)
            ] },
        bitsToShift: 9
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[41] = {
        result: {
            overallBodyLengthBytes: 2,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(3, 4)
            ] },
        bitsToShift: 5
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[73] = {
        result: {
            overallBodyLengthBytes: 1,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(5, 6)
            ] },
        bitsToShift: 2
        };
        
    return databin;
}

function createDatabinWithMultipleQualityLayersAndMultipleSubbands() {
    var databin = {
        isAllDatabinLoaded: function() { return false; },
        getDatabinLengthIfKnown: function() { return null; },
        bitsForBitstreamReaderStub: [
            // First packet
            
            1,                            // Non-zero packet

            0, 0, 0, 0, 0, 0, 0, 0, 0,    // First subband header
            0, 0, 0, 0, 0, 0, 0,        // Second subband header
            0, 0, 0, 0, 0,                // Third subband header
            
            0, 0,                        // Align to byte

            0, 0, 0, 0, 0, 0, 0, 0,        // packet body: First subband
            0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0,        // packet body: Second subband
            0, 0, 0, 0, 0, 0, 0, 0,        // packet body: Third subband
            0, 0, 0, 0, 0, 0, 0, 0,
            
            // Second packet
            0,                            // Zero-length packet
            0, 0, 0, 0, 0, 0, 0,        // Align to byte
            
            // Third packet
            
            1,                            // Non zero packet
            
            0, 0, 0,                    // First subband header
            0, 0,                        // Second subband header
            0,                            // Third subband header
            
            0,                            // Align to byte
            
            0, 0, 0, 0, 0, 0, 0, 0,        // packet body: First subband
            0, 0, 0, 0, 0, 0, 0, 0,        // packet body: Second subband
            0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0        // packet body: Third subband
            ]
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength = [];
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[1] = {
        result: {
            overallBodyLengthBytes: 3,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(7, 8)
            ] },
        bitsToShift: 9
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[10] = {
        result: {
            overallBodyLengthBytes: 1,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(9, 10)
            ] },
        bitsToShift: 7
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[17] = {
        result: {
            overallBodyLengthBytes: 2,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(11, 12)
            ] },
        bitsToShift: 5
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[81] = {
        result: {
            overallBodyLengthBytes: 1,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(13, 14)
            ] },
        bitsToShift: 3
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[84] = {
        result: {
            overallBodyLengthBytes: 2,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(15, 16)
            ] },
        bitsToShift: 2
        };
    databin.bitsForBitstreamReaderStub.calculateSubbandLength[86] = {
        result: {
            overallBodyLengthBytes: 1,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(17, 18)
            ] },
        bitsToShift: 1
        };
        
    return databin;
}

function createCallsLogForPacket(
    startOffset,
    qualityLayer,
    loadedSubbandsCount,
    dataNotLoaded) {
    
    var callsLog = [
        {
            objectType: 'bitstreamReader',
            instanceId: null,
            details: { functionName: 'startNewTransaction' }
        }, {
            objectType: 'bitstreamReader',
            instanceId: null,
            details: { functionName: 'set databinOffset', offset: startOffset }
        }, {
            objectType: 'bitstreamReader',
            instanceId: null,
            details: { functionName: 'shiftBit' }
        }
        ];
    
    for (var i = 0; i < loadedSubbandsCount; ++i) {
        var calculatorId;
        switch (i) {
            case 2:
                calculatorId = 'HH';
                break;
            case 1:
                calculatorId = 'LH' ;
                break;
            case 0:
                calculatorId = 
                    loadedSubbandsCount === 3 ? 'HL' :
                    loadedSubbandsCount === 1 ? 'LL' :
                    ('<Fictive subbands #' + i + '>');
                break;
        }
        
        callsLog.push({
            objectType: 'subbandLengthCalculator',
            instanceId: 'calculator of subband ' + calculatorId,
            details: {
                functionName: 'calculateSubbandLength',
                qualityLayer: qualityLayer }
            });
    }
    
    if (dataNotLoaded) {
        callsLog.push({
            objectType: 'bitstreamReader',
            instanceId: null,
            details: { functionName: 'activeTransaction.abort' }
            });
            
        return callsLog;
    }

    callsLog.push({
        objectType: 'bitstreamReader',
        instanceId: 'bitstreamReader instance',
        details: { functionName: 'shiftRemainingBitsInByte' }
        });
    
    var isEmptyPacket = loadedSubbandsCount === 0;
    if (!isEmptyPacket) {
        callsLog.push({
            objectType: 'bitstreamReader',
            instanceId: null,
            details: { functionName: 'get databinOffset' }
            });
    }

    callsLog.push({
        objectType: 'bitstreamReader',
        instanceId: null,
        details: { functionName: 'activeTransaction.commit' }
        });

    return callsLog;
}

QUnit.module('JpipPacketLengthCalculator');

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: Single quality layer, empty packet',
    function(assert) {
        var databin = {
            isAllDatabinLoaded: function() { return false; },
            getDatabinLengthIfKnown: function() { return null; },
            bitsForBitstreamReaderStub: [
                0,                            // Empty packet
                0, 0, 0, 0, 0, 0, 0            // Align to byte
                ]
            };
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/1);
            
        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 1,
            numQualityLayers: 1
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');

        qualityLayersCallsLog.clearForTest();
    });

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: Single quality layer, maxQualityLayer' +
        ' = undefined, resolution = 0 (single subband LL)',
    function(assert) {
        var databin = {
            isAllDatabinLoaded: function() { return false; },
            getDatabinLengthIfKnown: function() { return null; },
            bitsForBitstreamReaderStub: [
                1,                            // Non-zero packet
                0, 0, 0, 0, 0, 0, 0, 0, 0,    // Will be shifted by subband stub
                0, 0, 0, 0, 0, 0,            // Align to byte
                0, 0, 0, 0, 0, 0, 0, 0,        // packet body
                0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0
                ]
            };
        databin.bitsForBitstreamReaderStub.calculateSubbandLength = [];
        databin.bitsForBitstreamReaderStub.calculateSubbandLength[1] = {
            result: {
            overallBodyLengthBytes: 3,
            codeblockBodyLengthByIndex: [
                fictiveCodeblockLengthForPacketParserTest(19, 20)
            ] },
            bitsToShift: 9
            };
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/0);
            
        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 2 + 3,
            numQualityLayers: 1
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');

        qualityLayersCallsLog.clearForTest();
    });

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: Single quality layer, maxQualityLayer' +
        ' = undefined, resolution > 0 (3 subbands: LH, HL, HH)',
    function(assert) {
        var databin = {
            isAllDatabinLoaded: function() { return false; },
            getDatabinLengthIfKnown: function() { return null; },
            bitsForBitstreamReaderStub: [
                1,                            // Non-zero packet

                0, 0, 0, 0, 0, 0, 0, 0, 0,    // First subband header
                0, 0, 0, 0, 0, 0, 0,        // Second subband header
                0, 0, 0, 0, 0,                // Third subband header
                
                0, 0,                        // Align to byte

                0, 0, 0, 0, 0, 0, 0, 0,        // packet body: First subband
                0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0,        // packet body: Second subband
                0, 0, 0, 0, 0, 0, 0, 0,        // packet body: Third subband
                0, 0, 0, 0, 0, 0, 0, 0
                ]
            };
        databin.bitsForBitstreamReaderStub.calculateSubbandLength = [];
        databin.bitsForBitstreamReaderStub.calculateSubbandLength[1] = {
            result: {
                overallBodyLengthBytes: 3,
                codeblockBodyLengthByIndex: [
                    fictiveCodeblockLengthForPacketParserTest(21, 22)
                ] },
            bitsToShift: 9
            };
        databin.bitsForBitstreamReaderStub.calculateSubbandLength[10] = {
            result: {
                overallBodyLengthBytes: 1,
                codeblockBodyLengthByIndex: [
                    fictiveCodeblockLengthForPacketParserTest(23, 24)
                ] },
            bitsToShift: 7
            };
        databin.bitsForBitstreamReaderStub.calculateSubbandLength[17] = {
            result: {
                overallBodyLengthBytes: 2,
                codeblockBodyLengthByIndex: [
                    fictiveCodeblockLengthForPacketParserTest(25, 26)
                ] },
            bitsToShift: 5
            };
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/2);
            
        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 3 + 6,
            numQualityLayers: 1
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');

        qualityLayersCallsLog.clearForTest();
    });

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: Multiple quality layer, maxQualityLayer' +
        ' = undefined, resolution = 0 (single subband LL)',
    function(assert) {
        var databin = createDatabinWithMultipleQualityLayersAndSingleSubband();
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/0,
            { numQualityLayers: 4 });
            
        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 11,
            numQualityLayers: 4
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');

        qualityLayersCallsLog.clearForTest();
    });

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: Multiple quality layer, maxQualityLayer' +
        ' = undefined, resolution = 0 (single subband LL)',
    function(assert) {
        var databin = createDatabinWithMultipleQualityLayersAndSingleSubband();
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/0,
            { numQualityLayers: 4 });
            
        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 11,
            numQualityLayers: 4
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');
        
        var subbandsCount = 1;
        var emptyPacketSubbandsCount = 0;

        var firstPacketCalls = createCallsLogForPacket(
            /*startOffset=*/0, /*qualityLayer=*/0, subbandsCount);
        var secondPacketCalls = createCallsLogForPacket(
            /*startOffset=*/5, /*qualityLayer=*/1, subbandsCount);
        var thirdPacketCalls = createCallsLogForPacket(
            /*startOffset=*/8, /*qualityLayer=*/2, emptyPacketSubbandsCount);
        var fourthPacketCalls = createCallsLogForPacket(
            /*startOffset=*/9, /*qualityLayer=*/3, subbandsCount);

        var expectedCallsLog =
            firstPacketCalls
            .concat(secondPacketCalls)
            .concat(thirdPacketCalls)
            .concat(fourthPacketCalls);
        
        qualityLayersCallsLog.assertCallsLogEqual(assert, expectedCallsLog);

        qualityLayersCallsLog.clearForTest();
    });

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: Multiple quality layer, maxQualityLayer' +
        ' = undefined, resolution > 0 (multiple subbands HL, LH, HH)',
    function(assert) {
        var databin = createDatabinWithMultipleQualityLayersAndMultipleSubbands();
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/2,
            { numQualityLayers: 3 });
            
        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 15,
            numQualityLayers: 3
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');

        var subbandsCount = 3;
        var emptyPacketSubbandsCount = 0;

        var firstPacketCalls = createCallsLogForPacket(
            /*startOffset=*/0, /*qualityLayer=*/0, subbandsCount);
        var secondPacketCalls = createCallsLogForPacket(
            /*startOffset=*/9, /*qualityLayer=*/1, emptyPacketSubbandsCount);
        var thirdPacketCalls = createCallsLogForPacket(
            /*startOffset=*/10, /*qualityLayer=*/2, subbandsCount);

        var expectedCallsLog =
            firstPacketCalls
            .concat(secondPacketCalls)
            .concat(thirdPacketCalls);
        
        qualityLayersCallsLog.assertCallsLogEqual(assert, expectedCallsLog);

        qualityLayersCallsLog.clearForTest();
    });

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: missing zero length bit (Multiple ' +
        'quality layer and subbands)',
    function(assert) {
        var databin = createDatabinWithMultipleQualityLayersAndMultipleSubbands();
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/2,
            { numQualityLayers: 3 });
        
        var firstPacketStartOffset = 0;
        var secondPacketStartOffset = 9;
        var thirdPacketStartOffset = 10;
        
        testEmptyBitMissing(
            assert,
            'Correctness of calculateEndOffsetOfLastFullPacket (first packet missing)',
            calculator,
            databin,
            firstPacketStartOffset,
            /*qualityLayers=*/0);
        
        testEmptyBitMissing(
            assert,
            'Correctness of calculateEndOffsetOfLastFullPacket (second packet missing)',
            calculator,
            databin,
            secondPacketStartOffset,
            /*qualityLayers=*/1);
        
        testEmptyBitMissing(
            assert,
            'Correctness of calculateEndOffsetOfLastFullPacket (third packet missing)',
            calculator,
            databin,
            thirdPacketStartOffset,
            /*qualityLayers=*/2);
        
        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 15,
            numQualityLayers: 3
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');

        var subbandsCount = 3;
        var emptyPacketSubbandsCount = 0;

        var firstPacketCalls = createCallsLogForPacket(
            firstPacketStartOffset, /*qualityLayer=*/0, subbandsCount);
        var secondPacketCalls = createCallsLogForPacket(
            secondPacketStartOffset, /*qualityLayer=*/1, emptyPacketSubbandsCount);
        var thirdPacketCalls = createCallsLogForPacket(
            thirdPacketStartOffset, /*qualityLayer=*/2, subbandsCount);

        var noFirstPacketCalls = createCallsLogForPacket(
            firstPacketStartOffset,
            /*qualityLayer=*/0,
            /*loadedSubbandCount=*/0,
            /*dataNotLoaded=*/true);
            
        var noSecondPacketCalls = createCallsLogForPacket(
            secondPacketStartOffset,
            /*qualityLayer=*/1,
            /*loadedSubbandCount=*/0,
            /*dataNotLoaded=*/true);
            
        var noThirdPacketCalls = createCallsLogForPacket(
            thirdPacketStartOffset,
            /*qualityLayer=*/2,
            /*loadedSubbandCount=*/0,
            /*dataNotLoaded=*/true);
            
        var expectedCallsLog =
            noFirstPacketCalls
            
            .concat(firstPacketCalls)
            .concat(noSecondPacketCalls)
            
            .concat(secondPacketCalls)
            .concat(noThirdPacketCalls)
            
            .concat(thirdPacketCalls);
        
        qualityLayersCallsLog.assertCallsLogEqual(assert, expectedCallsLog);

        qualityLayersCallsLog.clearForTest();
    });

QUnit.test(
    'calculateEndOffsetOfLastFullPacket: missing subband header (Multiple ' +
        'quality layer and subbands)',
    function(assert) {
        var databin = createDatabinWithMultipleQualityLayersAndMultipleSubbands();
        
        var calculator = createPacketLengthCalculatorForTest(
            databin,
            /*startOffset=*/0,
            /*resolutionLevel=*/2,
            { numQualityLayers: 3 });
        
        var packetStartOffsets = [0, 9, 10];
        
        var packetNames = ['first', 'second', 'third'];
        
        var packetSubbandsCount = [3, 0/*empty packet*/, 3];
        
        var missingValues = [
            { layer: 0, subband: 'HL', subbandOffset: 1},
            { layer: 0, subband: 'LH', subbandOffset: 10},
            { layer: 0, subband: 'HH', subbandOffset: 17},
            { layer: 2, subband: 'HL', subbandOffset: 81},
            { layer: 2, subband: 'LH', subbandOffset: 84},
            { layer: 2, subband: 'HH', subbandOffset: 86}
            ];
            
        var layersAlreadyParsed = 0;
        
        var expectedCallsLog = [];
        
        for (var i = 0; i < missingValues.length; ++i) {
            var assertName = 'Correctness of calculateEndOffsetOfLastFullPacket (' +
                missingValues[i].subband + ' subband of ' +
                packetNames[missingValues[i].layer] + ' packet missing)';
                
            testSubbandHeaderMissing(
                assert,
                assertName,
                calculator,
                databin,
                packetStartOffsets[missingValues[i].layer],
                missingValues[i].layer,
                missingValues[i].subbandOffset);
            
            while (layersAlreadyParsed < missingValues[i].layer) {
                var existingPacketCalls = createCallsLogForPacket(
                    packetStartOffsets[layersAlreadyParsed],
                    layersAlreadyParsed,
                    packetSubbandsCount[layersAlreadyParsed]);
                
                expectedCallsLog = expectedCallsLog.concat(existingPacketCalls);
                    
                ++layersAlreadyParsed;
            }
            
            var loadedSubbandCount =
                missingValues[i].subband === 'HL' ? 1 :
                missingValues[i].subband === 'LH' ? 2 :
                missingValues[i].subband === 'HH' ? 3 : null;
            
            if (loadedSubbandCount === null) {
                throw 'Unknown subband ' + missingValues[i].subband + '. Fix test';
            }
            
            var missingPacketCalls = createCallsLogForPacket(
                packetStartOffsets[missingValues[i].layer],
                missingValues[i].layer,
                loadedSubbandCount,
                /*dataNotLoaded=*/true);
            
            expectedCallsLog = expectedCallsLog.concat(missingPacketCalls);
        }
        
        var lastPacketCalls = createCallsLogForPacket(
            packetStartOffsets[2], 2, packetSubbandsCount[2]);
        
        expectedCallsLog = expectedCallsLog.concat(lastPacketCalls);

        var resultActual = calculator.calculateEndOffsetOfLastFullPacket();
        var resultExpected = {
            endOffset: 15,
            numQualityLayers: 3
            };
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateEndOffsetOfLastFullPacket result');
        
        qualityLayersCallsLog.assertCallsLogEqual(assert, expectedCallsLog);

        qualityLayersCallsLog.clearForTest();
    });