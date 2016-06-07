'use strict';

function codeblockLengthTestDoOperation(parser, operation, assert, index) {
    var valueActual = parser.parse(operation.codingPassesNumber);
    
    if (assert === null) {
        return;
    }
    
    var valueExpected = operation.expectedResult;
    
    assert.deepEqual(
        valueActual, valueExpected, 'Correctness of parse result #' + index);
}

function codeblockLengthTestContextInitializer(bitstreamReader) {
    var parser = new JpipCodeblockLengthParser(
        bitstreamReader, transactionHelperStub);
    
    return parser;
}

function testCodeblockLengthParser(
    testName,
    bitstreamContent,
    operationsSequence,
    disableTransactionArgumentCorrectnessTest) {
    
        testBitstreamParsingOperationSequence(
            testName,
            bitstreamContent,
            operationsSequence,
            codeblockLengthTestDoOperation,
            codeblockLengthTestContextInitializer,
            /*createNewTransaction=*/undefined,
            /*disableAbortedTransactionTest=*/false,
            disableTransactionArgumentCorrectnessTest
            );
}

QUnit.module('JpipCodeblockLengthParser');

QUnit.test(
    'Illegal coding passes number expected to throw exception',
    function(assert) {
        var dummyBitsteramContent = [1, 1, 0];
        var bitstreamReader = new JpipBitstreamReaderStub(dummyBitsteramContent);
        var parser = new JpipCodeblockLengthParser(
            bitstreamReader, transactionHelperStub);
            
        var illegalCodingPasses = 256;
        
        assert.throws(
            function() {
                parser.parse(illegalCodingPasses);
            },
            jpipExceptions.InternalErrorException,
            'parse() expected to throw exception');
    });

testCodeblockLengthParser(
    'Not enough data in LBlock increasing information',
    [1,1,1 , null],
    [ { codingPassesNumber: 'Never mind', expectedResult: null } ],
    /*disableTransactionArgumentCorrectnessTest=*/true);

testCodeblockLengthParser(
    'No LBlock increasing',
    [0 , 1,1,1 , null],
    [ { codingPassesNumber: 1, expectedResult: 7 } ] );

testCodeblockLengthParser(
    'Single LBlock increasing',
    [0 , 1,0,1 ,
     1,0 , 1,1,1,1 , null],
    [    { codingPassesNumber: 1, expectedResult: 5 },
        { codingPassesNumber: 1, expectedResult: 15 } ] );

testCodeblockLengthParser(
    'Single LBlock increasing by 2',
    [0 , 1,0,1 ,
     1,1,0 , 1,0,1,1,1 , null],
    [    { codingPassesNumber: 1, expectedResult: 5 },
        { codingPassesNumber: 1, expectedResult: 23 } ] );

testCodeblockLengthParser(
    'Coding Passes number > 1',
    [0 , 1,1,0,1 , null],
    [ { codingPassesNumber: 2, expectedResult: 13 } ] );

testCodeblockLengthParser(
    'Maximal Coding Passes number (164)',
    [0 , 1,0,1,0,1,0,1,0,1,0 , null],
    [ { codingPassesNumber: 164, expectedResult: 682 } ] );

testCodeblockLengthParser(
    'LBlock increasing preserved to later parsing',
    [1,0 , 1,1,1,1 , 
     0 , 1,0,0,1 , 
     1,0 , 1,1,0,1,1 , null],
    [    { codingPassesNumber: 1, expectedResult: 15 },
        { codingPassesNumber: 1, expectedResult: 9 },
        { codingPassesNumber: 1, expectedResult: 27 } ] );

testCodeblockLengthParser(
    'LBlock increasing with changing coding passes number',
    [1,0 , 1,0,1,1,1 , 
     0 , 1,0,0,1 , 
     1,0 , 1,1,0,1,1,0,1,1 , null],
    [    { codingPassesNumber: 3, expectedResult: 23 },
        { codingPassesNumber: 1, expectedResult: 9 },
        { codingPassesNumber: 9, expectedResult: 219 } ] );

testCodeblockLengthParser(
    'LBlock increasing in more than 1 with changing coding passes number',
    [1,0 , 1,0,1,1,1 , 
     1,1,0 , 1,0,0,1,0,0 , 
     1,0 , 1,1,0,1,1,0,1,1,0,0 , null],
    [    { codingPassesNumber: 3, expectedResult: 23 },
        { codingPassesNumber: 1, expectedResult: 36 },
        { codingPassesNumber: 9, expectedResult: 876 } ] );