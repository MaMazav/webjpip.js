'use strict';

QUnit.module('JpipDatabinParts');

var databinTestArray = new Uint8Array( [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    10, 11, 12, 13, 14, 15, 16, 17, 18, 19
    ] );

var offset5 = 5;
var databinTestArrayOffsettedBy5 = new Uint8Array( [
    251, 252, 253, 254, 255,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    10, 11, 12, 13, 14, 15, 16, 17, 18, 19
    ] );

performDatabinPartsTest('Simple range from 2',
            [ [2, 10] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 10, isExist: true },
                { start: 12, length: databinTestArray.length - 12, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Simple range from 3',
            [ [3, 10] ],
            [     { start: 0, length: 3, isExist: false },
                { start: 3, length: 10, isExist: true },
                { start: 13, length: databinTestArray.length - 13, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Simple range (all data exist)',
            [ [0, databinTestArray.length] ],
            [     { start: 0, length: databinTestArray.length, isExist: true } ],
            /*countinuousDataExistFromOffset3=*/true, /*isAllDataExistFromOffset3=*/true, /*isAllDataExist=*/true);

performDatabinPartsTest('Simple range (from offset 0, not all data exist)',
            [ [0, databinTestArray.length - 1], [databinTestArray.length, 0] ],
            [     { start: 0, length: databinTestArray.length - 1, isExist: true } ],
            /*countinuousDataExistFromOffset3=*/true,
            /*isAllDataExistFromOffset3=*/false,
            /*isAllDataExist=*/false,
            /*isLengthKnown=*/true,
            /*isCountinousDataExistFromOffset0=*/true);

performDatabinPartsTest('Simple foreign ranges',
            [ [2, 4] , [14, 3] , [8, 2] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 4, isExist: true },
                { start: 6, length: 2, isExist: false },
                { start: 8, length: 2, isExist: true },
                { start: 10, length: 4, isExist: false },
                { start: 14, length: 3, isExist: true },
                { start: 17, length: databinTestArray.length - 17, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/false, /*isAllDataExistFromOffset3=*/false, /*isAllDataExist=*/false);

performDatabinPartsTest('Simple foreign ranges (databin length is known)',
            [ [2, 4] , [14, 3] , [8, 2] , [20, 0] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 4, isExist: true },
                { start: 6, length: 2, isExist: false },
                { start: 8, length: 2, isExist: true },
                { start: 10, length: 4, isExist: false },
                { start: 14, length: 3, isExist: true },
                { start: 17, length: databinTestArray.length - 17, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/false,
            /*isAllDataExistFromOffset3=*/false,
            /*isAllDataExist=*/false,
            /*isLengthKnown=*/true);

performDatabinPartsTest('Simple multiple range',
            [ [2, 10] , [14, 3] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 10, isExist: true },
                { start: 12, length: 2, isExist: false },
                { start: 14, length: 3, isExist: true },
                { start: 17, length: databinTestArray.length - 17, isExist: false } ]);

performDatabinPartsTest('Simple merge',
            [ [2, 4] , [6, 4] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 8, isExist: true },
                { start: 10, length: databinTestArray.length - 10, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Simple merge (all data exist)',
            [ [0, 4] , [4, databinTestArray.length - 4] ],
            [     { start: 0, length: databinTestArray.length, isExist: true } ],
            /*countinuousDataExistFromOffset3=*/true,
            /*isAllDataExistFromOffset3=*/true,
            /*isAllDataExist=*/true);

performDatabinPartsTest('Lot of merges and overlapping (all data exist)',
            [ [2, 4] , [1, 2] , [0, 1] , [5, 5] , [10, databinTestArray.length - 10] ],
            [     { start: 0, length: databinTestArray.length, isExist: true } ],
            /*countinuousDataExistFromOffset3=*/true,
            /*isAllDataExistFromOffset3=*/true,
            /*isAllDataExist=*/true);

performDatabinPartsTest('Simple merge (not all data exist but from offset 2 to last byte do)',
            [ [2, 4] , [4, databinTestArray.length - 4] ],
            [     { start: 2, length: databinTestArray.length - 2, isExist: true } ],
            /*countinuousDataExistFromOffset3=*/true, /*isAllDataExistFromOffset3=*/true, /*isAllDataExist=*/false);

performDatabinPartsTest('Simple merge swapped',
            [ [6, 4] , [2, 4] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 8, isExist: true },
                { start: 10, length: databinTestArray.length - 10, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Merge with overlap swapped',
            [ [6, 4] , [2, 5] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 8, isExist: true },
                { start: 10, length: databinTestArray.length - 10, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Merge of 3 chunks',
            [ [2, 6] , [12, 5] , [8, 4] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 15, isExist: true },
                { start: 17, length: databinTestArray.length - 17, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Merge with containED chunk',
            [ [2, 10] , [5, 3] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 10, isExist: true },
                { start: 12, length: databinTestArray.length - 12, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Merge with containS chunk',
            [ [5, 3] , [2, 10] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 10, isExist: true },
                { start: 12, length: databinTestArray.length - 12, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Merge with contains chunk and overlapped chunks',
            [ [2, 4] , [14, 2] , [8, 2] , [18, 1] , [3, 12] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 14, isExist: true },
                { start: 16, length: 2, isExist: false },
                { start: 18, length: 1, isExist: true },
                { start: 19, length: databinTestArray.length - 19, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/false, /*isAllDataExistFromOffset3=*/false, /*isAllDataExist=*/false);

performDatabinPartsTest('Simple overlap',
            [ [2, 10] , [5, 10] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 13, isExist: true },
                { start: 15, length: databinTestArray.length - 15, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Multiple overlap',
            [ [2, 10] , [15, 2] , [10, 6] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 15, isExist: true },
                { start: 17, length: databinTestArray.length - 17, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('Multiple overlap and contains',
            [ [2, 3] , [7, 4] , [15, 2] , [4, 12] ],
            [     { start: 0, length: 2, isExist: false },
                { start: 2, length: 15, isExist: true },
                { start: 17, length: databinTestArray.length - 17, isExist: false } ],
            /*countinuousDataExistFromOffset3=*/true);

performDatabinPartsTest('No data sent but length is known',
            [ [20, 0] ],
            [    { start: 0, length: 20, isExist: false } ],
            /*isContinuousDataExistFromOffset3=*/false,
            /*isAllDataExistFromOffset3=*/false,
            /*isAllDataExist=*/false,
            /*isLengthKnown=*/true);

performDatabinPartsTest('Part of data sent and length is known',
            [ [5, 6], [20, 0] ],
            [     { start: 0, length: 5, isExist: false },
                { start: 5, length: 6, isExist: true },
                { start: 11, length: databinTestArray.length - 11, isExist: false } ],
            /*isContinuousDataExistFromOffset3=*/false,
            /*isAllDataExistFromOffset3=*/false,
            /*isAllDataExist=*/false,
            /*isLengthKnown=*/true);

performDatabinPartsTest('Override existing data (all data exist)',
            [ [0, 5], [5, 11], [16, databinTestArray.length - 16], [0, 4], [4, 14] ],
            [     { start: 0, length: databinTestArray.length, isExist: true } ],
            /*countinuousDataExistFromOffset3=*/true, /*isAllDataExistFromOffset3=*/true, /*isAllDataExist=*/true);

QUnit.test('(Simple accessors)', function(assert) {
    var classId = 'Dummy Class-ID';
    var inClassId = 'Dummy In-Class-ID';
    var databin = new JpipDatabinParts(
        classId, inClassId, mockFactoryForDatabinPartsTest);
    
    var classIdExpected = classId;
    var classIdActual = databin.getClassId();
    assert.deepEqual(classIdActual, classIdExpected, 'getClassId');

    var inClassIdExpected = inClassId;
    var inClassIdActual = databin.getInClassId();
    assert.deepEqual(inClassIdActual, inClassIdExpected, 'getInClassId');
    });