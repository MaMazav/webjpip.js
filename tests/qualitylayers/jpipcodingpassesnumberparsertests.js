'use strict';

QUnit.module('jpipCodingPassesNumberParser');

function testCodingPassesNumberParser(
    resultExpected, bitstreamContent, testName) {
    
    if (testName === undefined) {
        testName = 'Codeword for ' + resultExpected;
    }
    
    QUnit.test(testName, function(assert) {
        transactionHelperStub.clearForTest();
        
        var bitstreamReaderStub = new JpipBitstreamReaderStub(bitstreamContent);
        var resultActual = jpipCodingPassesNumberParser.parse(
            bitstreamReaderStub);
            
        assert.deepEqual(
            resultActual, resultExpected, 'parse result correctness');
            
        transactionHelperStub.clearForTest();
        });
}

testCodingPassesNumberParser(
    /*result=*/null,
    [1, 1, null],
    'Not enough data in the first sequence of ones');
    
testCodingPassesNumberParser(
    /*result=*/null,
    [1, 1, 0, null],
    'Not enough data after the first sequence of ones');

testCodingPassesNumberParser(1, [0]);
testCodingPassesNumberParser(2, [1, 0]);
testCodingPassesNumberParser(3, [1, 1, 0, 0]);
testCodingPassesNumberParser(4, [1, 1, 0, 1]);
testCodingPassesNumberParser(5, [1, 1, 1, 0]);

// r = redundant '0' due to previous byte of 0xFF
var r = 0;

testCodingPassesNumberParser(6 , [1,1,1,1 , 0,0,0,0 , 0]);
testCodingPassesNumberParser(23, [1,1,1,1 , 1,0,0,0 , 1]);
testCodingPassesNumberParser(31, [1,1,1,1 , 1,1,0,0 , 1]);
testCodingPassesNumberParser(35, [1,1,1,1 , 1,1,1,0 , 1]);
testCodingPassesNumberParser(36, [1,1,1,1 , 1,1,1,1,r , 0]);

testCodingPassesNumberParser(37, [1,1,1,1,1,1,1,1,r,1 , 0,0,0,0 , 0,0,0]);
testCodingPassesNumberParser(39, [1,1,1,1,1,1,1,1,r,1 , 0,0,0,0 , 0,1,0]);
testCodingPassesNumberParser(103, [1,1,1,1,1,1,1,1,r,1 , 1,0,0,0 , 0,1,0]);
testCodingPassesNumberParser(134, [1,1,1,1,1,1,1,1,r,1 , 1,1,0,0 , 0,0,1]);
testCodingPassesNumberParser(151, [1,1,1,1,1,1,1,1,r,1 , 1,1,1,0 , 0,1,0]);
testCodingPassesNumberParser(158, [1,1,1,1,1,1,1,1,r,1 , 1,1,1,1 , 0,0,1]);
testCodingPassesNumberParser(162, [1,1,1,1,1,1,1,1,r,1 , 1,1,1,1 , 1,0,1]);
testCodingPassesNumberParser(163, [1,1,1,1,1,1,1,1,r,1 , 1,1,1,1 , 1,1,0]);
testCodingPassesNumberParser(164, [1,1,1,1,1,1,1,1,r,1 , 1,1,1,1 , 1,1,1]);