'use strict';

function bitstreamReaderTestContextInitializer(bitstreamReaderStub) {
    var bytesLength = bitstreamReaderStub.internalBufferForTest.length / 8;
    var bytes = new Array(Math.ceil(bytesLength));
    
    var fullBytesLength = Math.floor(bytesLength);
    
    for (var i = 0; i < fullBytesLength; ++i) {
        bytes[i] = bitstreamReaderStub.shiftBitsFFIgnoreForTest(8);
    }
    
    var remainingBits =
        bitstreamReaderStub.internalBufferForTest.length - fullBytesLength * 8;
        
    if (remainingBits > 0) {
        var lastByte = bitstreamReaderStub.shiftBitsFFIgnoreForTest(remainingBits);
        var lastByteShifted = lastByte << (8 - remainingBits);
        bytes[fullBytesLength] = lastByteShifted;
    }
    
    bitstreamReaderStub.setOffsetForTest(0);
    
    var databin = new DatabinPartsStub(bytes);
    var testedReader = new JpipBitstreamReader(databin, transactionHelperStub);
    var testContext = {
        testedReader: testedReader,
        stubReader: bitstreamReaderStub
        };
    
    return testContext;;
}

function performOperation(bitstreamReader, operation) {
    var result;
    var descriptionSuffix = '';
    
    switch (operation.type) {
        case 'setDatabinOffset':
            bitstreamReader.databinOffset = operation.offset;
            descriptionSuffix = ' (offset=' + operation.offset + ')';
            break;
            
        case 'bitsCounter':
            result = bitstreamReader.bitsCounter;
            break;
            
        case 'shiftRemainingBitsInByte':
            result = bitstreamReader.shiftRemainingBitsInByte();
            break;
    
        case 'shiftBit':
            result = bitstreamReader.shiftBit();
            break;
    
        case 'shiftBits':
            result = bitstreamReader.shiftBits(operation.bitsCount);
            descriptionSuffix = ' (bitsCount=' + operation.bitsCount + ')';
            break;
    
        case 'countOnesAndShiftUntilFirstZeroBit':
            result = bitstreamReader.countOnesAndShiftUntilFirstZeroBit(
                operation.maxBitsToShift);
            descriptionSuffix = ' (maxBitsToShift=' + operation.maxBitsToShift + ')';
            break;
    
        case 'countZerosAndShiftUntilFirstOneBit':
            result = bitstreamReader.countZerosAndShiftUntilFirstOneBit(
                operation.maxBitsToShift);
            descriptionSuffix = ' (maxBitsToShift=' + operation.maxBitsToShift + ')';
            break;
    
        default:
            throw 'Unknown operation of testedReader ' + operation.type + '. Fix test';
    }
    
    return {
        result: result,
        descriptionSuffix: descriptionSuffix
        };
}

function bitstreamReaderTestDoOperation(testContext, operation, assert, index) {
    var actualResult = performOperation(testContext.testedReader, operation);
    
    if (assert === null) {
        return;
    }
    
    var expectedResult = performOperation(testContext.stubReader, operation);
    
    var valueActual = actualResult.result;
    var valueExpected = expectedResult.result;
    
    var description = operation.type + ' expected to return ' +
        expectedResult.result + actualResult.descriptionSuffix;

    assert.deepEqual(valueActual, valueExpected, description);
}

function bitstreamReaderTestDatabinOffset(testContext, operation, assert, index) {
    var actualResult = performOperation(testContext.testedReader, operation);
    performOperation(testContext.stubReader, operation);
    
    if (assert === null) {
        return;
    }
    
    if (testContext.stubReader.bitsCounter % 8 !== 0) {
        assert.throws(
            function() {
                var offset = testContext.testedReader.databinOffset;
            },
            jpipExceptions.InternalErrorException,
            'get databinOffset expected to throw exception due to non ' +
                'partial byte offset after ' + operation.type +
                actualResult.descriptionSuffix + ' (bitsCounter=' +
                testContext.testedReader.bitsCounter + ')');
        return;
    }
    
    var valueActual = testContext.testedReader.databinOffset;
    var valueExpected = testContext.stubReader.databinOffset;

    var description = 'expected databinOffset=' + valueExpected +
        ' after ' + operation.type + actualResult.descriptionSuffix;

    assert.deepEqual(valueActual, valueExpected, description);
}

function bitstreamReaderTestBitsCounter(testContext, operation, assert, index) {
    var actualResult = performOperation(testContext.testedReader, operation);
    performOperation(testContext.stubReader, operation);
    
    if (assert === null) {
        return;
    }
    
    var valueActual = testContext.testedReader.bitsCounter;
    var valueExpected = testContext.stubReader.bitsCounter;

    var description = 'expected bitsCounter=' + valueExpected +
        ' after ' + operation.type + actualResult.descriptionSuffix;

    assert.deepEqual(valueActual, valueExpected, description);
}

function testBitstreamReader(testName, bitstreamContent, operations) {
    var transactionId = 0;
    function createNewTransaction(testContext) {
        var transaction = { name: 'Dummy transaction #' + transactionId++ };

        transactionHelperStub.transactionToCreate = transaction;
        testContext.testedReader.startNewTransaction();
        
        return transaction;
    }

    // Simple operation results checks
    testBitstreamParsingOperationSequence(
        testName,
        bitstreamContent,
        operations,
        bitstreamReaderTestDoOperation,
        bitstreamReaderTestContextInitializer,
        createNewTransaction);

    // check only bitsCounter value after each operation
    testBitstreamParsingOperationSequence(
        'bitsCounter test only: ' + testName,
        bitstreamContent,
        operations,
        bitstreamReaderTestBitsCounter,
        bitstreamReaderTestContextInitializer,
        createNewTransaction);

    // check only databinOffset value after each operation
    testBitstreamParsingOperationSequence(
        'databinOffset test only: ' + testName,
        bitstreamContent,
        operations,
        bitstreamReaderTestDatabinOffset,
        bitstreamReaderTestContextInitializer,
        createNewTransaction);
}

function testCountBits(testName, bitstreamContent, operationArgs) {
    var operationName = 'countOnesAndShiftUntilFirstZeroBit';
    var operationNameInverse = 'countZerosAndShiftUntilFirstOneBit';
    
    //var operationToTest = 'countOnesAndShiftUntilFirstZeroBit';
    //var operationToTestInverse = 'countZerosAndShiftUntilFirstOneBit';
    
    var bitstreamContentInversed = new Array(bitstreamContent.length);
    var operationsToTest = new Array(operationArgs.length);
    var operationsToTestInverse = new Array(operationArgs.length);
    
    for (var i = 0; i < bitstreamContent.length; ++i) {
        bitstreamContentInversed[i] = 1 - bitstreamContent[i];
    }
    
    for (var i = 0; i < operationArgs.length; ++i) {
        operationsToTest[i] = Object.create(operationArgs[i]);
        operationsToTestInverse[i] = Object.create(operationArgs[i]);
        
        operationsToTest[i].type = operationName;
        operationsToTestInverse[i].type = operationNameInverse;
    }
    
    testBitstreamReader(
        operationName + ': ' + testName,
        bitstreamContent,
        operationsToTest);

    testBitstreamReader(
        operationNameInverse + ': ' + testName,
        bitstreamContentInversed,
        operationsToTestInverse);
}

QUnit.module('JpipBitstreamReader');

QUnit.test('activeTransaction returns last created transaction', function(assert) {
    var databin = null;
    var reader = new JpipBitstreamReader(databin, transactionHelperStub);
    
    for (var i = 0; i < 3; ++i) {
        var transaction = { name: 'Transaction #1' };
        transactionHelperStub.transactionToCreate = transaction;
        reader.startNewTransaction();
        
        var transactionExpected = transaction;
        var transactionActual = reader.activeTransaction;
        assert.deepEqual(
            transactionExpected,
            transactionActual,
            'Correctness of activeTransaction property for ' + transaction);
        
        transaction.isActive = false;
    }
    });

QUnit.test(
    'active transaction throws exception before transaction created',
    function(assert) {
        transactionHelperStub.clearForTest();
        
        var databin = null;
        var reader = new JpipBitstreamReader(databin, transactionHelperStub);
        
        assert.throws(
            function() {
                var activeTransaction = reader.activeTransaction;
            },
            jpipExceptions.InternalErrorException,
            'bitstreamReader.activeTransaction expected to throw exception');

        transactionHelperStub.clearForTest();
    });

QUnit.test(
    'active transaction throws exception after transaction ended',
    function(assert) {
        transactionHelperStub.clearForTest();
        
        var databin = null;
        var reader = new JpipBitstreamReader(databin, transactionHelperStub);
        
        var transaction = {};
        transactionHelperStub.transactionToCreate = transaction;
        reader.startNewTransaction();
        
        transaction.isActive = false;
        
        assert.throws(
            function() {
                var activeTransaction = reader.activeTransaction;
            },
            jpipExceptions.InternalErrorException,
            'bitstreamReader.activeTransaction expected to throw exception');

        transactionHelperStub.clearForTest();
        });

testBitstreamReader(
    'Simple shiftBit operations (input: 1100 1001 1001 0101)',
    [1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1],
    [    { type: 'shiftBit' }, { type: 'shiftBit' }, { type: 'shiftBit' },
        { type: 'shiftBit' }, { type: 'shiftBit' }, { type: 'shiftBit' },
        { type: 'shiftBit' }, { type: 'shiftBit' }, { type: 'shiftBit' },
        { type: 'shiftBit' }, { type: 'shiftBit' }, { type: 'shiftBit' },
        { type: 'shiftBit' }, { type: 'shiftBit' }, { type: 'shiftBit' },
        { type: 'shiftBit' }
    ] );
        
testBitstreamReader(
    'Simple shiftBits operations (input: 1100 1001 1001 0101)',
    [1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1],
    [    { type: 'shiftBits', bitsCount: 3 },
        { type: 'shiftBits', bitsCount: 1 },
        { type: 'shiftBits', bitsCount: 2 },
        { type: 'shiftBits', bitsCount: 1 },
        { type: 'shiftBits', bitsCount: 0 },
        { type: 'shiftBits', bitsCount: 1 },
        { type: 'shiftBits', bitsCount: 4 },
        { type: 'shiftBits', bitsCount: 3 },
        { type: 'shiftBits', bitsCount: 1 }
    ] );

testBitstreamReader(
    'shiftBits correctness when a byte is over in the middle of the bits',
    [1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1],
    [    {type: 'shiftBits', bitsCount: 4 },
        {type: 'shiftBits', bitsCount: 7 },
        {type: 'shiftBit' }
    ] );

testBitstreamReader(
    'shiftBits correctness over a lot of bytes',
    [    1, 1, 0, 0, 1, 0, 1, 1,
        1, 0, 1, 1, 0, 1, 0, 0,
        1, 1, 0, 1, 1, 0, 1, 1,
        0, 1, 0, 1, 1, 0, 1, 1,
        1, 0, 1, 1, 0, 0, 1, 1],
    [    {type: 'shiftBits', bitsCount: 4 },
        {type: 'shiftBits', bitsCount: 26 },
        {type: 'shiftBit' }
    ] );
    
testCountBits(
    'Simple operations (input: 1101 0010)',    
    [1, 1, 0, 1, 0, 0, 1, 0],    
    /*operationArgs=*/ [ {}, {}, {},    {}    ] // 4 operations with no args
    );    
    
testCountBits(    
    'when a byte is over in the middle of the bits ' +    
        '(input: 1101 0011 1110 0101)',    
    [    1, 1, 0, 1, 0, 1, 1, 1,    
        1, 1, 1, 0, 0, 1, 0, 1],    
    /*operationArgs=*/ [ {}, {}, {}, {} ]
    );
    
testBitstreamReader(
    'countOnesAndShiftUntilFirstZeroBit in precense of 0xFF ' +
        '(input: 1111 1111 0111 1000)',
    [    1, 1, 1, 1, 1, 1, 1, 1,
        0, 1, 1, 1, 1, 0, 0, 0    ],
    [ {type: 'countOnesAndShiftUntilFirstZeroBit' } ] );

testBitstreamReader(
    'countZerosAndShiftUntilFirstOneBit after 0xFF (input: 1111 1111 0000 0010)',
    [    1, 1, 1, 1, 1, 1, 1, 1,
        0, 0, 0, 0, 0, 0, 1, 0],
    [    {type: 'shiftBits', bitsCount: 8 },
        {type: 'countZerosAndShiftUntilFirstOneBit' }
    ] );

testBitstreamReader(
    'shiftRemainingBitsInByte simple operation (input: 1111 1101 1010 0010)',
    [    1, 1, 1, 1, 1, 1, 0, 1,
        1, 0, 1, 0, 0, 0, 1, 0],
    [    {type: 'shiftBit' },
        {type: 'shiftRemainingBitsInByte' },
        {type: 'shiftBits', bitsCount: 7 }
    ] );

testBitstreamReader(
    'shiftRemainingBitsInByte in precense of 0xFF ' +
        '(input: 1111 1111 0xxx xxxx 0010 0010 1010 0101)',
    [    1, 1, 1, 1, 1, 1, 1, 1,
        0, 1, 0, 1, 0, 1, 0, 1,
        0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 1, 0, 0, 1, 0, 1],
    [    {type: 'shiftBit' },
        {type: 'shiftRemainingBitsInByte' },
        {type: 'shiftBits', bitsCount: 6 },
        {type: 'shiftBits', bitsCount: 7 }
    ] );

testBitstreamReader(
    'set databinOffset affects stream state (input: 11111111 xxxxxxxx 00100010 10100101)',
    [    1, 1, 1, 1, 1, 1, 1, 1,
        0, 1, 0, 1, 0, 1, 0, 1,
        0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 1, 0, 0, 1, 0, 1],
    [    {type: 'shiftBit' },
        {type: 'setDatabinOffset', offset: 2 },
        {type: 'shiftBits', bitsCount: 6 },
        {type: 'countOnesAndShiftUntilFirstZeroBit' }
    ] );

testBitstreamReader(
    'set databinOffset when skip byte flag is true ' +
        '(input: 1111 1111 0xxx xxxx xxxx xxxx 1010 0101 0011 1100)',
    [    1, 1, 1, 1, 1, 1, 1, 1,
        0, 1, 0, 1, 0, 1, 0, 1,
        0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 1, 0, 0, 1, 0, 1,
        0, 0, 1, 1, 1, 1, 0, 0],
    [    {type: 'shiftBit' },
        {type: 'shiftRemainingBitsInByte' },
        {type: 'setDatabinOffset', offset: 3 },
        {type: 'shiftBits', bitsCount: 7 }
    ] );

testBitstreamReader(
    'set databinOffset when last byte before set was 0xFF true ' +
        '(input: 1111 1111 0xxx xxxx xxxx xxxx 1010 0101 0011 1100)',
    [    1, 1, 1, 1, 1, 1, 1, 1,
        0, 1, 0, 1, 0, 1, 0, 1,
        0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 1, 0, 0, 1, 0, 1,
        0, 0, 1, 1, 1, 1, 0, 0],
    [    {type: 'shiftBit' },
        {type: 'setDatabinOffset', offset: 3 },
        {type: 'shiftBits', bitsCount: 7 }
    ] );