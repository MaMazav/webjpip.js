'use strict';

QUnit.module('JpipTagTree');

function tagTreeTestDoOperation(context, operation, assert, index) {
    var tagTree = context.tagTree;
    
    var x = context.swapXY ? operation.y : operation.x;
    var y = context.swapXY ? operation.x : operation.y;
    
    var xyParamsDescription = 'x=' + x + ', y=' + y;
    var description = 'Correctness of ' + operation.type + '(';
    
    var valueActual;
    switch (operation.type) {
        case 'isSmallerThanOrEqualsTo':
            valueActual = tagTree.isSmallerThanOrEqualsTo(x, y, operation.value);
            description += xyParamsDescription + ', value=' + operation.value;
            break;
        
        case 'setMinimalValueIfNotReadBits':
            valueActual = tagTree.setMinimalValueIfNotReadBits(
                operation.minimalValue);
            description += 'minimalValue=' + operation.minimalValue;
            break;
            
        case 'getValue':
            valueActual = tagTree.getValue(x, y);
            description += xyParamsDescription;
            break;
    
        default:
            throw 'Unknown operation of tagTree ' + operation.type + '. Fix test';
    }
    
    if (assert === null) {
        return;
    }
    
    description += ')';
    
    var valueExpected = operation.result;
    
    assert.deepEqual(valueActual, valueExpected, description);
}

function testTagTree(
    testName, bitstreamContent, operationsSequence, width, height, noSwapTest) {
    
    function tagTreeTestContextInitializer(bitstreamReader) {
        var tagTree = new JpipTagTree(
            bitstreamReader, width, height, transactionHelperStub);
        
        var context = {
            swapXY: false,
            tagTree: tagTree
            };
        return context;
    }
    
    testBitstreamParsingOperationSequence(
        testName,
        bitstreamContent,
        operationsSequence,
        tagTreeTestDoOperation,
        tagTreeTestContextInitializer);
    
    if (noSwapTest) {
        return;
    }

    function tagTreeTestSwapXYContextInitializer(bitstreamReader) {
        var tagTree = new JpipTagTree(
            bitstreamReader, height, width, transactionHelperStub);
        
        var context = {
            swapXY: true,
            tagTree: tagTree
            };
        return context;
    }

    testBitstreamParsingOperationSequence(
        testName + ' (swapped X,Y)',
        bitstreamContent,
        operationsSequence,
        tagTreeTestDoOperation,
        tagTreeTestSwapXYContextInitializer);
}

testTagTree(
    'isSmallerThanOrEqualsTo: queried value 0, real value 0, result true, need 1 bit to read',
    [ 1, null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 0 }],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value 0, real value >= 1, result false, need 1 bit to read',
    [ 0, null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 0 }],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value 2, real value >= 3, result false, need 3 bits to read',
    [ 0, 0, 0, null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 2 }],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value is big enough in the root',
    [ 0, 0, 0, null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 2 }],
    /*width=*/8,
    /*height=*/8,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value is big enough in middle node',
    [    0, 0, 1, // root = 2
        0, 1, // value in level 1 = 3
        0, 0, 0, 0, // value in level 2 > 6
        null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 6 }],
    /*width=*/8,
    /*height=*/8,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value is big enough only in leaf',
    [    0, 0, 1, // root = 2
        0, 1, // value in level 1 = 3
        0, 0, 0, 0, 1, // value in level 2 = 7
        0, 0, // value in leaf > 8
        null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 8 }],
    /*width=*/8,
    /*height=*/8,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value equals to queried value',
    [    0, 0, 1, // root = 2
        0, 1, // value in level 1 = 3
        0, 0, 0, 0, 1, // value in level 2 = 7
        0, 0, 1, // value in leaf = 9
        null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 9 }],
    /*width=*/8,
    /*height=*/8,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value smaller than queried value',
    [    0, 0, 1, // root = 2
        0, 1, // value in level 1 = 3
        0, 0, 0, 0, 1, // value in level 2 = 7
        0, 0, 1, // value in leaf = 9
        null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 10 }],
    /*width=*/8,
    /*height=*/8,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: value is big enough only on node, ' +
        'parent are known from previous quries',
    [    0, 0, 1, // root = 2
        0, 1, // value of (0, 0) = 3
        0, 0, 0, // value of (1, 0) > 4
        null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 3 },
     { type: 'isSmallerThanOrEqualsTo', result: false, x: 1, y: 0, value: 4 }],
    /*width=*/2,
    /*height=*/1);

testTagTree(
    'isSmallerThanOrEqualsTo: value is big enough in parent node, ' +
        'some parent is known from previous quries',
    [    0, 0, 1, // root = 2
        0, 1, // value of (0, 0, level=1) = 3
        1, // value of (0, 0, level=2) = 3
        0, 0, 0, // value of (1, 0, level=1) > 4
        null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 3 },
     { type: 'isSmallerThanOrEqualsTo', result: false, x: 3, y: 0, value: 4 }],
    /*width=*/4,
    /*height=*/1);

testTagTree(
    'isSmallerThanOrEqualsTo: value is big enough in parent node, ' +
        'parents are big enough from previous quries',
    [    0, 0, 1, // root = 2
        0, 1, // value of (0, 0, level=1) = 3
        1, // value of (0, 0, level=2) = 3
        // No need for more data to (3, 0) because root > 1
        null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 3 },
     { type: 'isSmallerThanOrEqualsTo', result: false, x: 3, y: 0, value: 1 }],
    /*width=*/4,
    /*height=*/2);

testTagTree(
    'getValue: simple 1 size tree',
    [0, 0, 1], // value = 2
    [ { type: 'getValue', result: 2, x: 0, y: 0 } ],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'getValue: Value correctness after parent is known',
    [    0, 0, 1, // root = 2
        0, 1, // value of (0, 0, level=1) = 3
        0, 0, 1, // value of (1, 0, level=1) = 4
        null ],
    [    { type: 'getValue', result: 3, x: 0, y: 0 },
        { type: 'getValue', result: 4, x: 1, y: 0 } ],
    /*width=*/2,
    /*height=*/1);

testTagTree(
    'getValue after parent partially known from isSmallerThanOrEqualsTo',
    [    0, 0, // root > 1
        1, // root = 2
        0, 1, // value of (0, 1, level=1) = 3
        null ],
    [    { type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 1 },
        { type: 'getValue', result: 3, x: 1, y: 0 } ],
    /*width=*/2,
    /*height=*/1);

testTagTree(
    'isSmallerThanOrEqualsTo (actual value is bigger than queried value) after parent known from getValue',
    [    0, 0, 1, // root = 2
        0, 1, // value of (0, 0, level=1) = 3
        0, 0, 0, // value of (1, 0, level=1) > 4
        null ],
    [    { type: 'getValue', result: 3, x: 0, y: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 1, y: 0, value: 4 } ],
    /*width=*/2,
    /*height=*/1);

testTagTree(
    'isSmallerThanOrEqualsTo (actual value equals to queried value) after parent known from getValue',
    [    0, 0, 1, // root = 2
        0, 1, // value of (0, 0, level=1) = 3
        0, 0, 0, 1, // value of (1, 0, level=1) = 5
        null ],
    [    { type: 'getValue', result: 3, x: 0, y: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 1, y: 0, value: 5 } ],
    /*width=*/2,
    /*height=*/1);

testTagTree(
    'isSmallerThanOrEqualsTo after setMinimalValueIfNotReadBits: value 2, ' +
        'real value >= 3, result false, need 1 bit to read',
    [ 0, null ],
    [    { type: 'setMinimalValueIfNotReadBits', result: undefined, minimalValue: 2 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 2 } ],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo after two setMinimalValueIfNotReadBits: ' +
        'value 2, real value >= 3, result false, need 0 bits to read',
    [ null ],
    [    { type: 'setMinimalValueIfNotReadBits', result: undefined, minimalValue: 2 },
        { type: 'setMinimalValueIfNotReadBits', result: undefined, minimalValue: 3 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 2 } ],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'setMinimalValueIfNotReadBits after read bits should have no effect',
    [ 0, 0, 1, null ],
    [    { type: 'setMinimalValueIfNotReadBits', result: undefined, minimalValue: 2 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 0, value: 3 },
        { type: 'setMinimalValueIfNotReadBits', result: undefined, minimalValue: 5,
            disableTransactionArgumentCorrectnessTest: true },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 6 } ],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'isSmallerThanOrEqualsTo: not enought data',
    [ 0, 0, null ],
    [{ type: 'isSmallerThanOrEqualsTo', result: null, x: 0, y: 0, value: 2 }],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'getValue: not enough data',
    [0, null], // value = 2
    [ { type: 'getValue', result: null, x: 0, y: 0 } ],
    /*width=*/1,
    /*height=*/1,
    /*noSwapTest=*/true);

testTagTree(
    'Inclusion-tree from the example in Table B.5 of J2k standard',
    [    1, 1, 1, // value of (0, 0) = 0
        1, // value of (1, 0) = 0
        0, // value of (2, 0) > 0
        0, // value of (0, 1) > 0
        0, // value of (1, 1) > 0
        1, 0, // value of (2, 0) > 1
        0, // value of (0, 1) > 1
        1, // value of (1, 1) = 1
        1, // value of (2, 1) = 1
        null ],
    [    { type: 'setMinimalValueIfNotReadBits', result: undefined, minimalValue: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 1, y: 0, value: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 2, y: 0, value: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 1, value: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 1, y: 1, value: 0 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 2, y: 1, value: 0 },
        
        { type: 'setMinimalValueIfNotReadBits', result: undefined, minimalValue: 1 },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 0, y: 0, value: 1 },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 1, y: 0, value: 1 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 2, y: 0, value: 1 },
        { type: 'isSmallerThanOrEqualsTo', result: false, x: 0, y: 1, value: 1 },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 1, y: 1, value: 1 },
        { type: 'isSmallerThanOrEqualsTo', result: true, x: 2, y: 1, value: 1 },
    ],
    /*width=*/3,
    /*height=*/2);

testTagTree(
    'Zero-bit-planes-tree from the example in Table B.5 of J2k standard',
    [    0, 0, 0, 1, 1, 1, // value of (0, 0) = 3
        0, 1, // value of (0, 1) = 4
        1, // value of (1, 1) = 3
        0, 0, 0, 1, 1, // value of (2, 1) = 6
        null ],
    [    { type: 'getValue', result: 3, x: 0, y: 0 },
        { type: 'getValue', result: 4, x: 1, y: 0 },
        { type: 'getValue', result: 3, x: 1, y: 1 },
        { type: 'getValue', result: 6, x: 2, y: 1 } ],
    /*width=*/3,
    /*height=*/2);
