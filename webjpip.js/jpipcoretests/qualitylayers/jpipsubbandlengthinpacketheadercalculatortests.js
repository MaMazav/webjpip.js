'use strict';

function clearForTest() {
    // NOTE: No call to clearForTest at the end of the tests, only at the beginning
    
    qualityLayersCallsLog.clearForTest();
    //mockFactoryForQualityLayersTest.clearForTest();
}

function testSubbandLengthInPacketHeaderCalculator(
    testName,
    bitstreamContent,
    numCodeblocksX,
    numCodeblocksY,
    calculateSubbandLengthOperations,
    expectedCalls) {
    
    var bitstreamReaderStub;
    var isOnlyPerformOperations = false;
    
    function calcualtorTestContextInitializer(bitstreamReader) {
        clearForTest();
        
        bitstreamReaderStub = bitstreamReader;
    
        var calculator = new JpipSubbandLengthInPacketHeaderCalculator(
            bitstreamReader,
            numCodeblocksX,
            numCodeblocksY,
            jpipCodingPassesNumberParserStub,
            transactionHelperStub,
            mockFactoryForQualityLayersTest);
        
        return calculator;
    }
    
    function calculatorResultsTestDoOperation(calculator, operation, assert, index) {
        bitstreamReaderStub.setOffsetForTest(operation.bitstreamOffset);
        
        if (operation.exception !== undefined) {
            if (assert === null) {
                try {
                    calculator.calculateSubbandLength(operation.qualityLayer);
                } catch(e) {
                    // Do nothing, only check that erronous calculateSubbandLength
                    // has no effect on latter transactions
                }
                return;
            }
            
            assert.throws(
                function() {
                    calculator.calculateSubbandLength(operation.qualityLayer);
                },
                operation.exception,
                'calculateSubbandLength(' + operation.qualityLayer +
                    ') expected to throw exception');
            
            return;
        }
        
        var resultActual = calculator.calculateSubbandLength(operation.qualityLayer);
        var resultExpected = operation.result;
        
        if (assert === null) {
            return; 
        }
        
        assert.deepEqual(
            resultActual,
            resultExpected,
            'Correctness of calculateSubbandLength of calculation #' + index);
    }
    
    function calculatorCallsLogTestDoOperation(calculator, operation, assert, index) {
        bitstreamReaderStub.setOffsetForTest(operation.bitstreamOffset);
        
        calculator.calculateSubbandLength(operation.qualityLayer);
        
        if (assert === null || index < calculateSubbandLengthOperations.length - 1) {
            return; 
        }
        
        qualityLayersCallsLog.assertCallsLogEqual(assert, expectedCalls);
    }

    testBitstreamParsingOperationSequence(
        testName + ' (test calculateSubbandLength result)',
        bitstreamContent,
        calculateSubbandLengthOperations,
        calculatorResultsTestDoOperation,
        calcualtorTestContextInitializer);
        
    if (expectedCalls === undefined) {
        return;
    }
    
    testBitstreamParsingOperationSequence(
        testName + ' (test parameter in calls to external objects)',
        bitstreamContent,
        calculateSubbandLengthOperations,
        calculatorCallsLogTestDoOperation,
        calcualtorTestContextInitializer,
        /*createNewTransaction=*/undefined,
        /*disableAbortedTransactionTest=*/true);
}

function createExpectedCallToInclusionTree(expectedCalls, x, y, qualityLayer) {
    expectedCalls.push({
        objectType: 'tagTree',
        instanceId: 'inclusion tree',
        details: {
            functionName: 'isSmallerThanOrEqualsTo',
            x: x,
            y: y,
            value: qualityLayer
        }
    });
}

function createExpectedCallToShiftBit(expectedCalls) {
    expectedCalls.push({
        objectType: 'bitstreamReader',
        instanceId: null,
        details: { functionName: 'shiftBit' }
    });
}

function createExpectedCallsToLengthParsers(
    expectedCalls, x, y, qualityLayer, codingPassesNumber) {
    
    var codeblockLengthParserUniqueId = 'parser of codeblock ' + x + ', ' + y;
    
    expectedCalls.push({
        objectType: 'codingPassesNumberParser',
        instanceId: null,
        details: {
            functionName: 'parse',
            bitstreamReader: bitstreamReaderStubPlaceholder
        }
    });
    
    expectedCalls.push({
        objectType: 'codeblockLengthParser',
        instanceId: codeblockLengthParserUniqueId,
        details: { functionName: 'parse', codingPassesNumber: codingPassesNumber }
    });
}

function createExpectedCallToSetMinimalValueOfInclusionTree(
    expectedCalls, firstQualityLayerSubbandIncluded) {
    
    expectedCalls.push({
        objectType: 'tagTree',
        instanceId: 'inclusion tree',
        details: {
            functionName: 'setMinimalValueIfNotReadBits',
            value: qualityLayer
        }
    });
}

function createExpectedCallsForFirstTimeCodeblockIncluded(
    expectedCalls, x, y, qualityLayer, codingPassesNumber) {

    createExpectedCallToInclusionTree(expectedCalls, x, y, qualityLayer);
    
    expectedCalls.push({
        objectType: 'tagTree',
        instanceId: 'Zero bit planes tree',
        details: { functionName: 'getValue', x: x, y: y }
    });
    
    createExpectedCallsToLengthParsers(
        expectedCalls, x, y, qualityLayer, codingPassesNumber);
}

function createExpectedCallsForAlreadyIncluded(
    expectedCalls, x, y, qualityLayer, codingPassesNumber) {
    
    createExpectedCallToShiftBit(expectedCalls);
    
    createExpectedCallsToLengthParsers(
        expectedCalls, x, y, qualityLayer, codingPassesNumber);
}

function codeblockLengthForSubbandParserTest(
    codeblockBodyLengthBytes, codingPasses, zeroBitPlanes) {
    
    var result = {
        codeblockBodyLengthBytes: codeblockBodyLengthBytes,
        codingPasses: codingPasses
        };
        
    if (zeroBitPlanes !== undefined) {
        result.zeroBitPlanes = zeroBitPlanes;
    }
    
    return result;
}

QUnit.module('JpipSubbandLengthPacketHeaderCalculator');

var bitstreamContentForTableB5SubbandLengthTest = [
    1            , // Packet non-zero in length
    1,1,1        , // Code-block 0, 0 included for the first time (partial inclusion tag tree)
    0,0,0,1,1,1    , // Code-block 0, 0 insignificant for 3 bit-planes
    1,1,0,0        , // Code-block 0, 0 has 3 coding passes included
    0            , // Code-block 0, 0 length indicator is unchanged
    0,1,0,0        , // Code-block 0, 0 has 4 bytes, 4 bits are used, 3 + floor(log2 3)
    1            , // Code-block 1, 0 included for the first time (partial inclusion tag tree)
    0,1            , // Code-block 1, 0 insignificant for 4 bit-planes
    1,0            , // Code-block 1, 0 has 2 coding passes included
    1,0            , // Code-block 1, 0 length indicator is increased by 1 bit (3 to 4)
    0,0,1,0,0    , // Code-block 1, 0 has 4 bytes, 5 bits are used 4 + floor(log2 2),
    0            , // Code-block 2, 0 not yet included (partial tag tree)
    0            , // Code-block 0, 1 not yet included
    0            , // Code-block 1, 1 not yet included
                    // Code-block 2, 1 not yet included (no data needed, already conveyed by partial tag tree for code-block 2, 0)
                    
    1            , // Packet non-zero in length
    1            , // Code-block 0, 0 included again
    1,1,0,0        , // Code-block 0, 0 has 3 coding passes included
    0            , // Code-block 0, 0 length indicator is unchanged
    1,0,1,0        , // Code-block 0, 0 has 10 bytes, 3 + log2 (3) bits used
    0            , // Code-block 1, 0 not included in this layer
    1,0            , // Code-block 2, 0 not yet included
    0             , // Code-block 0, 1 not yet included
    1             , // Code-block 1, 1 included for the first time
    1             , // Code-block 1, 1 insignificant for 3 bit-planes
    0             , // Code-block 1, 1 has 1 coding passes included
    0             , // Code-block 1, 1 length information is unchanged
    0,0,1        , // Code-block 1, 1 has 1 byte, 3 + log2 (1) bits used
    1            , // Code-block 2, 1 included for the first time
    0,0,0,1,1    , // Code-block 2, 1 insignificant for 6 bit-planes
    0            , // Code-block 2, 1 has 1 coding passes included
    0            , // Code-block 2, 1 length indicator is unchanged
    0,1,0          // Code-block 2, 1 has 2 bytes, 3 + log2 1 bits used
    ];

bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals = [];
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[1] = { result: true, bitsToShift: 3 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[19] = { result: true, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[31] = { result: false, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[32] = { result: false, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[33] = { result: false, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[34] = { result: false, bitsToShift: 0 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[46] = { result: false, bitsToShift: 2 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[48] = { result: false, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[49] = { result: true, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals[56] = { result: true, bitsToShift: 1 };

bitstreamContentForTableB5SubbandLengthTest.tagTreeGetValue = [];
bitstreamContentForTableB5SubbandLengthTest.tagTreeGetValue[4] = { result: 3, bitsToShift: 6 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeGetValue[20] = { result: 4, bitsToShift: 2 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeGetValue[50] = { result: 3, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.tagTreeGetValue[57] = { result: 6, bitsToShift: 5 };

bitstreamContentForTableB5SubbandLengthTest.codingPassesNumber = [];
bitstreamContentForTableB5SubbandLengthTest.codingPassesNumber[10] = { result: 3, bitsToShift: 4 };
bitstreamContentForTableB5SubbandLengthTest.codingPassesNumber[22] = { result: 2, bitsToShift: 2 };
bitstreamContentForTableB5SubbandLengthTest.codingPassesNumber[36] = { result: 3, bitsToShift: 4 };
bitstreamContentForTableB5SubbandLengthTest.codingPassesNumber[51] = { result: 1, bitsToShift: 1 };
bitstreamContentForTableB5SubbandLengthTest.codingPassesNumber[62] = { result: 1, bitsToShift: 1 };

bitstreamContentForTableB5SubbandLengthTest.codeblockLength = [];
bitstreamContentForTableB5SubbandLengthTest.codeblockLength[14] = { result: 4, bitsToShift: 5 };
bitstreamContentForTableB5SubbandLengthTest.codeblockLength[24] = { result: 4, bitsToShift: 7 };
bitstreamContentForTableB5SubbandLengthTest.codeblockLength[40] = { result: 10, bitsToShift: 5 };
bitstreamContentForTableB5SubbandLengthTest.codeblockLength[52] = { result: 1, bitsToShift: 4 };
bitstreamContentForTableB5SubbandLengthTest.codeblockLength[63] = { result: 2, bitsToShift: 4 };

var x = 0, y = 0, qualityLayer = 0;
var expectedCallsForTableB5SubbandLengthTest = [];

createExpectedCallToSetMinimalValueOfInclusionTree(
    expectedCallsForTableB5SubbandLengthTest,
    qualityLayer);

createExpectedCallsForFirstTimeCodeblockIncluded(
    expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer, /*codingPassesNumber=*/3);

x = 1;
createExpectedCallsForFirstTimeCodeblockIncluded(expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer, /*codingPassesNumber=*/2);

x = 2;
createExpectedCallToInclusionTree(expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer);

x = 0;
y = 1;
createExpectedCallToInclusionTree(expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer);
    
x = 1;
createExpectedCallToInclusionTree(expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer);

x = 2;
createExpectedCallToInclusionTree(expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer);

x = 0;
y = 0;
qualityLayer = 1;
createExpectedCallToSetMinimalValueOfInclusionTree(
    expectedCallsForTableB5SubbandLengthTest,
    qualityLayer);
createExpectedCallsForAlreadyIncluded(expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer, 3);

x = 1;
createExpectedCallToShiftBit(expectedCallsForTableB5SubbandLengthTest);

x = 2;
createExpectedCallToInclusionTree(expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer);

x = 0;
y = 1;
createExpectedCallToInclusionTree(
    expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer);

x = 1;
createExpectedCallsForFirstTimeCodeblockIncluded(
    expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer, /*codingPassesNumber=*/1);

x = 2;
createExpectedCallsForFirstTimeCodeblockIncluded(
    expectedCallsForTableB5SubbandLengthTest,
    x, y, qualityLayer, /*codingPassesNumber=*/1);

var resultLayer0 = {
    overallBodyLengthBytes: 8,
    codeblockBodyLengthByIndex: [
        codeblockLengthForSubbandParserTest(4, 3, 3),
        codeblockLengthForSubbandParserTest(4, 2, 4),
        codeblockLengthForSubbandParserTest(0, 0),
        codeblockLengthForSubbandParserTest(0, 0),
        codeblockLengthForSubbandParserTest(0, 0),
        codeblockLengthForSubbandParserTest(0, 0)
    ] };

var resultLayer1 = {
    overallBodyLengthBytes: 13,
    codeblockBodyLengthByIndex: [
        codeblockLengthForSubbandParserTest(10, 3),
        codeblockLengthForSubbandParserTest(0, 0),
        codeblockLengthForSubbandParserTest(0, 0),
        codeblockLengthForSubbandParserTest(0, 0),
        codeblockLengthForSubbandParserTest(1, 1, 3),
        codeblockLengthForSubbandParserTest(2, 1, 6)
    ] };

testSubbandLengthInPacketHeaderCalculator(
    'The example in Table B.5 of J2k standard',
    bitstreamContentForTableB5SubbandLengthTest,
    /*numCodeblocksX=*/3,
    /*numCodeblocksY=*/2,
    /*calculateSubbandLengthOperations=*/[
        { bitstreamOffset: 1, qualityLayer: 0, result: resultLayer0 },
        { bitstreamOffset: 35, qualityLayer: 1, result: resultLayer1 }
        ],
    /*expectedCalls=*/expectedCallsForTableB5SubbandLengthTest);

testSubbandLengthInPacketHeaderCalculator(
    'Exception when trying to parse same layer twice',
    bitstreamContentForTableB5SubbandLengthTest,
    /*numCodeblocksX=*/3,
    /*numCodeblocksY=*/2,
    /*calculateSubbandLengthOperations=*/[
        { bitstreamOffset: 1, qualityLayer: 0, result: resultLayer0 },
        { bitstreamOffset: 35, qualityLayer: 0,
            exception: jpipExceptions.InternalErrorException }
        ]
    );

testSubbandLengthInPacketHeaderCalculator(
    'Exception when trying to parse same layer twice',
    bitstreamContentForTableB5SubbandLengthTest,
    /*numCodeblocksX=*/3,
    /*numCodeblocksY=*/2,
    /*calculateSubbandLengthOperations=*/[
        { bitstreamOffset: 1, qualityLayer: 0, result: resultLayer0 },
        { bitstreamOffset: 35, qualityLayer: 0,
            exception: jpipExceptions.InternalErrorException }
        ]
    );

var contentForNotEnoughDataForInclusionTree = Object.create(
    bitstreamContentForTableB5SubbandLengthTest);
contentForNotEnoughDataForInclusionTree.tagTreeIsSmallerOrEquals = Object.create(
    bitstreamContentForTableB5SubbandLengthTest.tagTreeIsSmallerOrEquals);
contentForNotEnoughDataForInclusionTree.tagTreeIsSmallerOrEquals[19] =
    { result: null, bitsToShift: 0 };

testSubbandLengthInPacketHeaderCalculator(
    'Not enough data for inclusion tree',
    contentForNotEnoughDataForInclusionTree,
    /*numCodeblocksX=*/3,
    /*numCodeblocksY=*/2,
    /*calculateSubbandLengthOperations=*/
        [ { bitstreamOffset: 1, qualityLayer: 0, result: null } ]
    );

var contentForNotEnoughDataForZeroBitPlanesTree = Object.create(
    bitstreamContentForTableB5SubbandLengthTest);
contentForNotEnoughDataForZeroBitPlanesTree.tagTreeGetValue = Object.create(
    bitstreamContentForTableB5SubbandLengthTest.tagTreeGetValue);
contentForNotEnoughDataForZeroBitPlanesTree.tagTreeGetValue[20] =
    { result: null, bitsToShift: 0 };

testSubbandLengthInPacketHeaderCalculator(
    'Not enough data for zero bit planes tree',
    contentForNotEnoughDataForZeroBitPlanesTree,
    /*numCodeblocksX=*/3,
    /*numCodeblocksY=*/2,
    /*calculateSubbandLengthOperations=*/
        [ { bitstreamOffset: 1, qualityLayer: 0, result: null } ]
    );

var contentForNotEnoughDataForCodingPassesNumber = Object.create(
    bitstreamContentForTableB5SubbandLengthTest);
contentForNotEnoughDataForCodingPassesNumber.codingPassesNumber = Object.create(
    bitstreamContentForTableB5SubbandLengthTest.codingPassesNumber);
contentForNotEnoughDataForCodingPassesNumber.codingPassesNumber[22] =
    { result: null, bitsToShift: 0 };

testSubbandLengthInPacketHeaderCalculator(
    'Not enough data for coding passes number',
    contentForNotEnoughDataForCodingPassesNumber,
    /*numCodeblocksX=*/3,
    /*numCodeblocksY=*/2,
    /*calculateSubbandLengthOperations=*/
        [ { bitstreamOffset: 1, qualityLayer: 0, result: null } ]
    );

var contentForNotEnoughDataForCodeblockLength = Object.create(
    bitstreamContentForTableB5SubbandLengthTest);
contentForNotEnoughDataForCodeblockLength.codeblockLength = Object.create(
    bitstreamContentForTableB5SubbandLengthTest.codeblockLength);
contentForNotEnoughDataForCodeblockLength.codeblockLength[24] =
    { result: null, bitsToShift: 0 };

testSubbandLengthInPacketHeaderCalculator(
    'Not enough data for codeblock length',
    contentForNotEnoughDataForCodeblockLength,
    /*numCodeblocksX=*/3,
    /*numCodeblocksY=*/2,
    /*calculateSubbandLengthOperations=*/
        [ { bitstreamOffset: 1, qualityLayer: 0, result: null } ]
    );