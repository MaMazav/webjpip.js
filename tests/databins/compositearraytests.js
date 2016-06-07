'use strict';

var testArrayForCompositeArrayTest = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20
    ]);
    
function testCopyToArrayWithOffsetBoundsForCompositeArrayTest(
    assert, compositeArray, startOffset, length, minOffsetToTest, maxOffsetToTest, arrayName) {
    
    var resultArray = [];
    var resultArrayOffset = -5;
    
    var minOffsetToCopy =
        minOffsetToTest === undefined ? startOffset: minOffsetToTest;
    var maxOffsetToCopy =
        maxOffsetToTest === undefined ? startOffset + length: maxOffsetToTest;
    
    compositeArray.copyToArray(
        resultArray, resultArrayOffset, minOffsetToCopy, maxOffsetToCopy);
    
    var firstWrongIndexWrittenActual = null;
    for (var i = resultArrayOffset; i < minOffsetToCopy; ++i) {
        if (resultArray[i - resultArrayOffset] !== undefined) {
            firstWrongIndexWrittenActual = i;
            break;
        }
    }
    
    var assertSuffix =
        ' (minOffset=' + minOffsetToCopy + ', maxOffset=' + maxOffsetToCopy;
    if (arrayName !== undefined) {
        assertSuffix += ', arrayName=' + arrayName;
    }
    assertSuffix += ')';
    
    var firstWrongIndexWrittenExpected = null;
    assert.deepEqual(
        firstWrongIndexWrittenActual,
        firstWrongIndexWrittenExpected,
        'Index written before range to copy should be null' + assertSuffix);
    
    var arrayLengthActual = resultArray.length;
    var arrayLengthExpected =
        minOffsetToCopy == maxOffsetToCopy ? 0 : maxOffsetToCopy - resultArrayOffset;
    assert.deepEqual(
        arrayLengthActual,
        arrayLengthExpected,
        'Array length should match exactly to lastOffsetToCopy' + assertSuffix);
    
    var isAllDataCorrect = true;
    for (var i = minOffsetToCopy; i < maxOffsetToCopy; ++i) {
        var actual = resultArray[i - resultArrayOffset];
        var expected = testArrayForCompositeArrayTest[i];
        if (actual === expected) {
            continue;
        }
        
        assert.deepEqual(
            actual,
            expected,
            'Correctness of copied data (wrong index: ' + i + ')' + assertSuffix);
        isAllDataCorrect = false;
        break;
    }
    
    if (isAllDataCorrect) {
        assert.ok(true, 'Correctness of copied data' + assertSuffix);
    }
}
    
function testCompositeArrayContent(assert, compositeArray, startOffset, length, arrayName) {
    var assertNameSuffix = arrayName === undefined ? '' : ' (' + arrayName + ')';

    var offsetExpected = startOffset;
    var offsetActual = compositeArray.getOffset();
    assert.deepEqual(offsetActual, offsetExpected, 'Correctness of offset property' + arrayName);
    
    var lengthExpected = length;
    var lengthActual = compositeArray.getLength();
    assert.deepEqual(lengthActual, lengthExpected, 'Correctness of length property' + arrayName);
    
    var minOffsetToTest = undefined;
    var maxOffsetToTest = undefined;
    testCopyToArrayWithOffsetBoundsForCompositeArrayTest(
        assert,
        compositeArray,
        startOffset,
        length,
        minOffsetToTest,
        maxOffsetToTest,
        arrayName);
    
    if (length < 2) {
        return;
    }
    
    var partialArrayMinOffset = startOffset + 1;
    var partialArrayMaxOffset = startOffset + length - 2;
    testCopyToArrayWithOffsetBoundsForCompositeArrayTest(
        assert, compositeArray, startOffset, length, partialArrayMinOffset, partialArrayMaxOffset);
}

function pushRange(compositeArray, rangeStartOffset, rangeLength) {
    var newSubArray = testArrayForCompositeArrayTest.subarray(
        rangeStartOffset,
        rangeStartOffset + rangeLength);
    
    compositeArray.pushSubArray(newSubArray);
}

QUnit.module('CompositeArray');

QUnit.test('empty CompositeArray', function(assert) {
    var compositeArray = new CompositeArray(2);
    
    testCompositeArrayContent(assert, compositeArray, 2, 0);
    });

QUnit.test('Single pushSubArray', function(assert) {
    var compositeArray = new CompositeArray(2);
    pushRange(compositeArray, 2, 4);
    
    testCompositeArrayContent(assert, compositeArray, 2, 4);
    });

QUnit.test('pushSubArray twice', function(assert) {
    var compositeArray = new CompositeArray(2);
    pushRange(compositeArray, 2, 4);
    pushRange(compositeArray, 6, 1);
    
    testCompositeArrayContent(assert, compositeArray, 2, 5);
    });

QUnit.test('pushSubArray of zero length', function(assert) {
    var compositeArray = new CompositeArray(2);
    pushRange(compositeArray, 2, 4);
    pushRange(compositeArray, 6, 0);
    
    testCompositeArrayContent(assert, compositeArray, 2, 4);
    });

QUnit.test('copyToOther (simple)', function(assert) {
    var target = new CompositeArray(2);
    pushRange(target, 2, 3);
    
    var source = new CompositeArray(5);
    pushRange(source, 5, 7);
    
    source.copyToOther(target);
    
    testCompositeArrayContent(assert, source, 5, 7, 'source');
    testCompositeArrayContent(assert, target, 2, 10, 'target');
    });

QUnit.test('copyToOther (target is empty)', function(assert) {
    var target = new CompositeArray(5);
    pushRange(target, 5, 0);
    
    var source = new CompositeArray(5);
    pushRange(source, 5, 7);
    
    source.copyToOther(target);
    
    testCompositeArrayContent(assert, source, 5, 7, 'source');
    testCompositeArrayContent(assert, target, 5, 7, 'target');
    });

QUnit.test('copyToOther (source is empty)', function(assert) {
    var target = new CompositeArray(4);
    pushRange(target, 4, 3);
    
    var source = new CompositeArray(7);
    pushRange(source, 7, 0);
    
    source.copyToOther(target);
    
    testCompositeArrayContent(assert, source, 7, 0, 'source');
    testCompositeArrayContent(assert, target, 4, 3, 'target');
    });

QUnit.test('copyToOther (after two pushSubArray)', function(assert) {
    var target = new CompositeArray(2);
    pushRange(target, 2, 1);
    pushRange(target, 3, 2);
    
    var source = new CompositeArray(5);
    pushRange(source, 5, 4);
    pushRange(source, 9, 3);
    
    source.copyToOther(target);
    
    testCompositeArrayContent(assert, source, 5, 7, 'source');
    testCompositeArrayContent(assert, target, 2, 10, 'target');
    });

QUnit.test('copyToOther (with overlapping)', function(assert) {
    var target = new CompositeArray(2);
    pushRange(target, 2, 7);
    
    var source = new CompositeArray(5);
    pushRange(source, 5, 7);
    
    source.copyToOther(target);
    
    testCompositeArrayContent(assert, source, 5, 7, 'source');
    testCompositeArrayContent(assert, target, 2, 10, 'target');
    });

QUnit.test('copyToOther (with no new data)', function(assert) {
    var target = new CompositeArray(0);
    pushRange(target, 0, 4);
    pushRange(target, 4, 9);
    pushRange(target, 13, 5);
    
    var source = new CompositeArray(0);
    pushRange(source, 0, 3);
    pushRange(source, 3, 10);
    pushRange(source, 13, 2);
    
    source.copyToOther(target);
    
    testCompositeArrayContent(assert, source, 0, 15, 'source');
    testCompositeArrayContent(assert, target, 0, 18, 'target');
    });

QUnit.test('Illegal copyToOther (source.offset < target.offset', function(assert) {
    var target = new CompositeArray(2);
    pushRange(target, 2, 1);
    
    var source = new CompositeArray(1);
    pushRange(source, 1, 3);
    
    assert.throws(
        function() {
            source.copyToOther(target);
        },
        jpipExceptions.InternalErrorException,
        'IllegalOperationException expected on copy');
    });

QUnit.test('Illegal copyToArray (minOffset = undefined)', function(assert) {
    var compositeArray = new CompositeArray(2);
    pushRange(compositeArray, 2, 1);
    
    assert.throws(
        function() {
            var array = [];
            compositeArray.copyToArray(array, 0, undefined, 3);
        },
        jpipExceptions.InternalErrorException,
        'IllegalOperationException expected on copy');
    });

QUnit.test('Illegal copyToArray (maxOffset = undefined)', function(assert) {
    var compositeArray = new CompositeArray(2);
    pushRange(compositeArray, 2, 1);
    
    assert.throws(
        function() {
            var array = [];
            compositeArray.copyToArray(array, 0, 2, undefined);
        },
        jpipExceptions.InternalErrorException,
        'IllegalOperationException expected on copy');
    });

QUnit.test('Illegal copyToArray (minOffset is too small)', function(assert) {
    var compositeArray = new CompositeArray(2);
    pushRange(compositeArray, 2, 1);
    
    assert.throws(
        function() {
            var array = [];
            compositeArray.copyToArray(array, 0, 1, 3);
        },
        jpipExceptions.InternalErrorException,
        'IllegalOperationException expected on copy');
    });

QUnit.test('Illegal copyToArray (maxOffset is too large)', function(assert) {
    var compositeArray = new CompositeArray(2);
    pushRange(compositeArray, 2, 1);
    
    assert.throws(
        function() {
            var array = [];
            compositeArray.copyToArray(array, 0, 2, 5);
        },
        jpipExceptions.InternalErrorException,
        'IllegalOperationException expected on copy');
    });