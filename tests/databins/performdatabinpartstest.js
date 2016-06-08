'use strict';

// NOTE: This code is very unclear due to historical reason.
// Now, the CompositeArray is an external unit which is not
// unit-tested with databinParts, it may help to simplify
// testing significantly.
// In addition there are some undocumented assumptions about
// the structure of the offsets pushed into the databin parts
// in the test definitions (jpipDatabinPartsTests.js file),
// which is very very very bad.

// In short, this code should be refactored.

function performDatabinPartsTest(
    testName,
    rangesToAdd,
    expectedRangeExistOrNot,
    isContinuousDataExistFromOffset3,
    isAllDataExistFromOffset3,
    isAllDataExist,
    isLengthKnown,
    isCountinousDataExistFromOffset0) {
    
    if (isLengthKnown === undefined) {
        isLengthKnown = isAllDataExistFromOffset3;
    }
    
    if (isCountinousDataExistFromOffset0 === undefined) {
        isCountinousDataExistFromOffset0 = !!isAllDataExist;
    }
    
    QUnit.test(testName, function(assert) {
        var databin = new jpipExports.JpipDatabinParts(
            'Dummy Class-ID',
            'Dummy In-Class-ID',
            mockFactoryForDatabinPartsTest);
            
        for (var i = 0; i < rangesToAdd.length; ++i) {
            var addOffsettedMessage = i % 2 === 0; // Test different offsets of added messages
        
            var header = {
                bodyStart: rangesToAdd[i][0] + (addOffsettedMessage ? offset5 : 0),
                messageOffsetFromDatabinStart: rangesToAdd[i][0],
                messageBodyLength: rangesToAdd[i][1],
                isLastByteInDatabin: rangesToAdd[i][0] + rangesToAdd[i][1] === databinTestArray.length
            };
            
            //var partialArray = databinTestArray.slice(rangesToAdd[i][0], rangesToAdd[i][0] + rangesToAdd[i][1]);
            var message = addOffsettedMessage ? databinTestArrayOffsettedBy5 : databinTestArray;
            databin.addData(header, message);
        }
        
        var databinLengthIfKnownExpected = isLengthKnown ? databinTestArray.length : null;
        var databinLengthIfKnownActual = databin.getDatabinLengthIfKnown();
        assert.deepEqual(databinLengthIfKnownActual, databinLengthIfKnownExpected, 'getDatabinLengthIfKnown');
        
        var isAllDatabinLoadedExpected = !!isAllDataExist;
        var isAllDatabinLoadedActual = databin.isAllDatabinLoaded();
        assert.deepEqual(isAllDatabinLoadedActual, isAllDatabinLoadedExpected, 'isAllDatabinLoaded');

        var existingRangesActual = databin.getExistingRanges();
        var existingRangesExpected = [];
        var endOffsetToCopy = 0;
        var expectedBytes = 0;
    
        for (var i = 0; i < expectedRangeExistOrNot.length; ++i) {
            if (!expectedRangeExistOrNot[i].isExist) {
                continue;
            }
            
            endOffsetToCopy = expectedRangeExistOrNot[i].start + expectedRangeExistOrNot[i].length;
            
            existingRangesExpected.push({
                start: expectedRangeExistOrNot[i].start,
                length: expectedRangeExistOrNot[i].length
                });
            
            expectedBytes += expectedRangeExistOrNot[i].length;
        }
        
        assert.deepEqual(existingRangesActual, existingRangesExpected, 'getExistingRanges');
        
        var actualBytes = databin.getLoadedBytes();
        assert.deepEqual(actualBytes, expectedBytes, 'getLoadedBytes correctness');
        
        var offsetsFromDatabinOffset0 = {
            databinStartOffset: 0,
            maxLengthWithData: endOffsetToCopy,
            isAllDataUntilMaxLengthExist: isCountinousDataExistFromOffset0,
            isAllDataExist: !!isAllDataExist
        };
        
        var offsetsFromDatabinOffset3 = {
            databinStartOffset: 3,
            maxLengthWithData: Math.max(0, endOffsetToCopy - 3),
            isAllDataUntilMaxLengthExist: !!isContinuousDataExistFromOffset3,
            isAllDataExist: !!isAllDataExistFromOffset3
        };
        
        var offsetsFromDatabinOffsetUndefined = Object.create(
            offsetsFromDatabinOffset0);
        offsetsFromDatabinOffsetUndefined.databinStartOffset = undefined;
        
        var buffer = [];
        var outputArrayStartOffset = 1;
        
        var maxLengthCopiedExpected = endOffsetToCopy;
        var maxLengthCopiedActual = databin.copyBytes(buffer, outputArrayStartOffset);
        assert.deepEqual(maxLengthCopiedActual, maxLengthCopiedExpected, 'test maxLengthCopied returned from copyBytes with no range options parameter');
        
        var assertSuffixName = 'no range options parameter';
        checkArrayContent(buffer, assertSuffixName, outputArrayStartOffset, expectedRangeExistOrNot, assert, /*offsets=*/undefined);
        
        performCopyTestFromOffset(
            databin, expectedRangeExistOrNot, assert, offsetsFromDatabinOffset0);
        performCopyTestFromOffset(
            databin, expectedRangeExistOrNot, assert, offsetsFromDatabinOffset3);
        performCopyTestFromOffset(
            databin, expectedRangeExistOrNot, assert, offsetsFromDatabinOffsetUndefined);
        
        performCopyTestAtTheEndOfDatabin(isLengthKnown, databin, assert);
        performCopyTestWithoutParameters(endOffsetToCopy, databin, assert);
        });
}

function performCopyTestFromOffset(databin, expectedRangeExistOrNot, assert, offsets) {
    var outputArrayStartOffset = 1;
    
    testNoForceCopyAllRange(
        /*limitMaxLengthToCopy=*/true,
        /*assertSuffixName=*/'',
        outputArrayStartOffset,
        databin,
        expectedRangeExistOrNot,
        assert,
        offsets);
    
    var assertSuffixName = 'without maxLengthWithData input argument ';
    testNoForceCopyAllRange(
        /*limitMaxLengthToCopy=*/false,
        assertSuffixName,
        outputArrayStartOffset,
        databin,
        expectedRangeExistOrNot,
        assert,
        offsets);
    
    var noData = offsets.maxLengthWithData === 0;
    
    testForceCopyAllRange(
        /*defineMaxLength=*/true,
        /*isExpectedToSucceed=*/offsets.isAllDataUntilMaxLengthExist || noData,
        databin,
        expectedRangeExistOrNot,
        assert,
        offsets);
    testForceCopyAllRange(
        /*defineMaxLength=*/false,
        /*isExpectToSucceed=*/offsets.isAllDataExist,
        databin,
        expectedRangeExistOrNot,
        assert,
        offsets);
}

function performCopyTestAtTheEndOfDatabin(isLengthKnown, databin, assert) {
    var buffer = [];
    var outputArrayStartOffset = 1;

    var maxLengthCopiedNoMaxLengthToCopyActual = databin.copyBytes(buffer, outputArrayStartOffset, {
        forceCopyAllRange: true,
        databinStartOffset: databinTestArray.length } );
    var maxLengthCopiedNoMaxLengthToCopyExpected = isLengthKnown ? 0 : null;
    assert.deepEqual(
        maxLengthCopiedNoMaxLengthToCopyActual,
        maxLengthCopiedNoMaxLengthToCopyExpected,
        'test maxLengthCopied returned from copyBytes at the end of a known-length databin (no maxLengthToCopy parameter)');
    
    var maxLengthCopiedNoMaxLengthToCopyActual = databin.copyBytes(buffer, outputArrayStartOffset, {
        forceCopyAllRange: true,
        databinStartOffset: databinTestArray.length,
        maxLengthToCopy: 1 } );
    var maxLengthCopiedNoMaxLengthToCopyExpected = null;
    assert.deepEqual(
        maxLengthCopiedNoMaxLengthToCopyActual,
        maxLengthCopiedNoMaxLengthToCopyExpected,
        'test maxLengthCopied returned from copyBytes at the end of a known-length databin (maxLengthToCopy parameter is given)');
    
    var bufferLengthActual = buffer.length;
    var bufferLengthExpected = 0;
    assert.deepEqual(
        bufferLengthActual,
        bufferLengthExpected,
        'test buffer length after copyBytes at the end of a known-length databin');
}

function performCopyTestWithoutParameters(maxLengthWithData, databin, assert) {
    var buffer = [];

    var maxLengthCopiedActual = databin.copyBytes(buffer);
    var maxLengthCopiedExpected = maxLengthWithData;
    assert.deepEqual(
        maxLengthCopiedActual,
        maxLengthCopiedExpected,
        'test maxLengthCopied returned from copyBytes without parameters');
    
    var bufferLengthActual = buffer.length;
    var bufferLengthExpected = maxLengthWithData;
    assert.deepEqual(
        bufferLengthActual,
        bufferLengthExpected,
        'test buffer length after copyBytes without parameters');
}

function checkArrayContent(
    buffer,
    assertSuffixName,
    outputArrayStartOffset,
    expectedRangeExistOrNot,
    assert,
    offsets,
    maxLengthWithDataExpected) {
    
    var fullAssertSuffixName;
    var databinStartOffset;
    if (offsets === undefined || offsets.databinStartOffset === undefined) {
        fullAssertSuffixName = ' (' + assertSuffixName + ')';
        databinStartOffset = 0;
    } else {
        databinStartOffset = offsets.databinStartOffset;
        fullAssertSuffixName = ' (databinStartOffset=' + offsets.databinStartOffset + ', ' + assertSuffixName + ')';
    }

    var isBeforeBeginningPassed = true;
    for (var offsetInBuffer = 0; offsetInBuffer < outputArrayStartOffset; ++offsetInBuffer) {
        if (buffer[offsetInBuffer] !== undefined) {
            isBeforeBeginningPassed = false;
            break;
        }
    }
    assert.ok(
        isBeforeBeginningPassed,
        'no data should be written into array ' +
        'before resultStartOffset' + fullAssertSuffixName);
    
    if (maxLengthWithDataExpected !== undefined) {
        var isBufferShortEnough =
            buffer.length <= outputArrayStartOffset + maxLengthWithDataExpected;
        
        assert.ok(
            isBufferShortEnough,
            'no data should be written into array ' + 
            'after maxLengthToCopy' + fullAssertSuffixName);
    }
    
    for (var i = 0; i < expectedRangeExistOrNot.length; ++i) {
        var range = expectedRangeExistOrNot[i];
        var isRangePassed = true;
        
        for (var offsetInDatabin = range.start; offsetInDatabin < range.start + range.length; ++offsetInDatabin) {
            if (maxLengthWithDataExpected !== undefined &&
                offsetInDatabin >= databinStartOffset + maxLengthWithDataExpected) {
                break;
            }
            var dataActual = undefined;
            var offsetInBuffer = outputArrayStartOffset + offsetInDatabin - databinStartOffset;
            if (offsetInBuffer >= outputArrayStartOffset) {
                dataActual = buffer[offsetInBuffer];
            }
            
            var dataExpected = undefined;
            if (range.isExist && offsetInBuffer >= outputArrayStartOffset) {
                dataExpected = databinTestArray[offsetInDatabin];
            }
            
            if (dataActual !== dataExpected) {
                if (dataExpected === undefined || dataActual === undefined) {
                    assert.ok(false, 'Data in index ' + offsetInDatabin + ' does ' +
                        (range.isExist ? 'not ' : '') + 'exist although expected to ' +
                        (range.isExist ? '' : 'not ') + 'be' + fullAssertSuffixName);
                }
                else {
                    assert.deepEqual(
                        dataActual,
                        dataExpected,
                        ' (Correctness of data in index ' + offsetInDatabin +
                        ')' + fullAssertSuffixName);
                }
                
                isRangePassed = false;
                break;
            }
        }
        
        if (isRangePassed) {
            assert.ok(true, 'Range ' + range.start + ', ' + range.length + (range.isExist ? '' : ' not') +
                ' exist' + fullAssertSuffixName);
        }
    }
}

function testNoForceCopyAllRange(
    limitMaxLengthToCopy,
    assertSuffixName,
    outputArrayStartOffset,
    databin,
    expectedRangeExistOrNot,
    assert,
    offsets) {
    
    var buffer = [];
    
    var maxLengthToCopy, maxLengthCopiedExpected;
    if (limitMaxLengthToCopy) {
        maxLengthToCopy = 3;
        
        var databinStartOffset =
            offsets.databinStartOffset === undefined ? 0 : offsets.databinStartOffset;
        var endRelevantOffset = databinStartOffset + maxLengthToCopy;
        var maxOffsetWithData = databinStartOffset;
        for (var i = 0; i < expectedRangeExistOrNot.length; ++i) {
            var range = expectedRangeExistOrNot[i];
            if (range.start >= endRelevantOffset) {
                break;
            }
            
            if (expectedRangeExistOrNot[i].isExist) {
                maxOffsetWithData = Math.min(range.start + range.length, endRelevantOffset);
            }
        }
        maxLengthCopiedExpected = maxOffsetWithData - databinStartOffset;
    } else {
        maxLengthToCopy = undefined;
        maxLengthCopiedExpected = offsets.maxLengthWithData;
    }

    var maxLengthCopiedActual = databin.copyBytes(buffer, outputArrayStartOffset, {
        forceCopyAllRange: false,
        databinStartOffset: offsets.databinStartOffset,
        maxLengthToCopy: maxLengthToCopy
        });

    var copyUntilString = maxLengthToCopy === undefined ?
        'until end of data ': '' + maxLengthToCopy + ' bytes ';
        
    var assertName = 'copyBytes expects to copy ' + copyUntilString +
        'when forceCopyAllRange = false ' +    assertSuffixName +
        '(databinStartOffset=' + offsets.databinStartOffset + ')';

    assert.deepEqual(maxLengthCopiedActual, maxLengthCopiedExpected, assertName);

    checkArrayContent(
        buffer,
        assertSuffixName,
        outputArrayStartOffset,
        expectedRangeExistOrNot,
        assert,
        offsets,
        maxLengthToCopy);
}

function testForceCopyAllRange(defineMaxLength, isExpectedToSucceed, databin, expectedRangeExistOrNot, assert, offsets) {
    var outputArrayStartOffset = 1;
    var buffer = [];
    var databinStartOffset = offsets.databinStartOffset;
    var maxLengthWithData = offsets.maxLengthWithData;
    var maxLengthToCopy = defineMaxLength ? maxLengthWithData : undefined;

    var maxLengthCopiedForceCopyAllRangeActual = databin.copyBytes(buffer, outputArrayStartOffset, {
        forceCopyAllRange: true,
        databinStartOffset: databinStartOffset,
        maxLengthToCopy: maxLengthToCopy
        });
    
    if (isExpectedToSucceed) {
        var maxLengthCopiedForceCopyAllRangeExpected = maxLengthWithData;
        assert.deepEqual(
            maxLengthCopiedForceCopyAllRangeActual,
            maxLengthCopiedForceCopyAllRangeExpected,
            'copyBytes expects to copy until maxLengthWithData when forceCopyAllRange = true and all range exists (databinStartOffset=' +
                databinStartOffset + ', maxLengthWithData=' + maxLengthWithData + ', maxLengthToCopy=' + maxLengthToCopy + ')');

        var assertSuffixName = 'maxLengthWithData=' + maxLengthWithData + ' and forceCopyAllRange=true';
        checkArrayContent(buffer, assertSuffixName, outputArrayStartOffset, expectedRangeExistOrNot, assert, offsets);
    } else {
        var maxLengthCopiedForceCopyAllRangeExpected = null;
        assert.deepEqual(
            maxLengthCopiedForceCopyAllRangeActual,
            maxLengthCopiedForceCopyAllRangeExpected,
            'copyBytes expects to copy nothing when forceCopyAllRange = true and not all range exists (databinStartOffset=' +
                databinStartOffset + ', maxLengthWithData=' + maxLengthWithData + ', maxLengthToCopy=' + maxLengthToCopy + ')');
    }
}

// TODO: Test also empty databin
// should cover all cases, but just in-case...