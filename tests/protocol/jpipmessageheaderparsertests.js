'use strict';

// NOTE: Split huge parseMessageHeader test into small tests

function assertEqualParsed(assert, testName, actual, expectedNumber, expectedEndOffset) {
    var expected = {
        number: expectedNumber,
        endOffset: expectedEndOffset
    };
    
    assert.deepEqual(actual, expected, testName);
};

function createHeader(isLastByteInDatabin, inClassId, bodyStart, classId, codestreamIndex, messageOffsetFromDatabinStart, messageBodyLength, aux) {
    var result = {
        isLastByteInDatabin: isLastByteInDatabin,
        inClassId: inClassId,
        bodyStart: bodyStart,
        classId: classId,
        codestreamIndex: codestreamIndex,
        messageOffsetFromDatabinStart: messageOffsetFromDatabinStart,
        messageBodyLength: messageBodyLength
    };
    
    if (aux !== undefined) {
        expectedHeader.aux = aux;
    }
    
    return result;
};

function assertEqualHeader(assert, testName, actualHeader, isLastByteInDatabin, inClassId, bodyStart, classId, codestreamIndex, messageOffsetFromDatabinStart, messageBodyLength, aux) {
    var expectedHeader = createHeader(isLastByteInDatabin, inClassId, bodyStart, classId, codestreamIndex, messageOffsetFromDatabinStart, messageBodyLength, aux);
    
    assert.deepEqual(actualHeader, expectedHeader, testName);
};

QUnit.module('jpipMessageHeaderParser');

QUnit.test('getInt32 (zero)', function(assert) {
    var data = [0x5, 0, 0, 0, 0, 0x5];
    
    var int32Actual = jpipMessageHeaderParser.getInt32(data, 1);
    var int32Expected = 0;
    assert.deepEqual(int32Actual, int32Expected, 'Correct parse result');
    });

QUnit.test('getInt32 (single byte)', function(assert) {
    var data = [0x5, 0, 0, 0, 0x20, 0x5];
    
    var int32Actual = jpipMessageHeaderParser.getInt32(data, 1);
    var int32Expected = 0x20;
    assert.deepEqual(int32Actual, int32Expected, 'Correct parse result');
    });

QUnit.test('getInt32 (two bytes)', function(assert) {
    var data = [0x5, 0, 0, 0x47, 0x20, 0x5];
    
    var int32Actual = jpipMessageHeaderParser.getInt32(data, 1);
    var int32Expected = 0x4720;
    assert.deepEqual(int32Actual, int32Expected, 'Correct parse result');
    });

QUnit.test('getInt32 (three bytes)', function(assert) {
    var data = [0x5, 0, 0x61, 0x47, 0x20, 0x5];
    
    var int32Actual = jpipMessageHeaderParser.getInt32(data, 1);
    var int32Expected = 0x614720;
    assert.deepEqual(int32Actual, int32Expected, 'Correct parse result');
    });

QUnit.test('getInt32 (four bytes, msb=1)', function(assert) {
    var data = [0x5, 0x38, 0x61, 0x47, 0x20, 0x5];
    
    var int32Actual = jpipMessageHeaderParser.getInt32(data, 1);
    var int32Expected = 0x38614720;
    assert.deepEqual(int32Actual, int32Expected, 'Correct parse result');
    });

QUnit.test('getInt32 (four bytes, msb=0)', function(assert) {
    var data = [0x5, 0xF8, 0x61, 0x47, 0x20, 0x5];
    
    var int32Actual = jpipMessageHeaderParser.getInt32(data, 1);
    var int32Expected = 0xF8614720;
    assert.deepEqual(int32Actual, int32Expected, 'Correct parse result');
    });

QUnit.test('getInt16 (zero)', function(assert) {
    var data = [0x5, 0, 30, 0, 0, 0x5];
    
    var int16Actual = jpipMessageHeaderParser.getInt16(data, 3);
    var int16Expected = 0;
    assert.deepEqual(int16Actual, int16Expected, 'Correct parse result');
    });

QUnit.test('getInt16 (single byte)', function(assert) {
    var data = [0x5, 0, 30, 0, 0x20, 0x5];
    
    var int16Actual = jpipMessageHeaderParser.getInt16(data, 3);
    var int16Expected = 0x20;
    assert.deepEqual(int16Actual, int16Expected, 'Correct parse result');
    });

QUnit.test('getInt16 (two bytes, msb=0)', function(assert) {
    var data = [0x5, 0, 30, 0x47, 0x20, 0x5];
    
    var int16Actual = jpipMessageHeaderParser.getInt16(data, 3);
    var int16Expected = 0x4720;
    assert.deepEqual(int16Actual, int16Expected, 'Correct parse result');
    });

QUnit.test('getInt16 (two bytes, msb=1)', function(assert) {
    var data = [0x5, 0, 30, 0x97, 0x20, 0x5];
    
    var int16Actual = jpipMessageHeaderParser.getInt16(data, 3);
    var int16Expected = 0x9720;
    assert.deepEqual(int16Actual, int16Expected, 'Correct parse result');
    });

QUnit.test('parseNumberInVbas', function(assert) {
    var parse = jpipMessageHeaderParser.parseNumberInVbas;
    
    var simpleParseNumberValue = parse([0x05], /*startOffset=*/0);
    assertEqualParsed(assert, 'Simple', simpleParseNumberValue, 0x05, 1);
    
    var withOffsetParseNumberValue = parse(
        [0x80, 0x84, 0x09, 0x12], /*startOffset=*/2);
    assertEqualParsed(assert, 'With Offset', withOffsetParseNumberValue, 0x09, 3);
    
    var twoBytesParseNumberValue = parse(
        [0x89, 0x02], /*startOffset=*/0);
    assertEqualParsed(assert, 'Two bytes', twoBytesParseNumberValue, 0x0482, 2);
    
    var twoBytesWithOffsetParseNumberValue = parse(
        [0x53, 0x04, 0x9B, 0x7F], /*startOffset=*/2);
    assertEqualParsed(
        assert, 'Two bytes with offset', twoBytesWithOffsetParseNumberValue, 0x0DFF, 4);
    
    var ignoreBitsParseNumberValue = parse(
        [0x7F], /*startOffset=*/0, /*bitsToTakeInFirstByte=*/5);
    assertEqualParsed(assert, 'Ignore bits', ignoreBitsParseNumberValue, 0x1F, 1);

    var ignoreBitsAndTwoBytesParseNumberValue = parse(
        [0xF5, 0x66], /*startOffset=*/0, /*bitsToTakeInFirstByte=*/6);
    assertEqualParsed(
        assert,
        'Ignore bits and two bytes',
        ignoreBitsAndTwoBytesParseNumberValue,
        0x1AE6,
        2);

    var ignoreBitsWithOffsetParseNumberValue = parse(
        [0x7E, 0xB5, 0x7F], /*startOffset=*/2, /*bitsToTakeInFirstByte=*/5);
    assertEqualParsed(
        assert,
        'Ignore bits with offset',
        ignoreBitsWithOffsetParseNumberValue,
        0x1F,
        3);

    var ignoreBitsAndTwoBytesWithOffsetParseNumberValue = parse(
        [0xB7, 0xF5, 0x66], /*startOffset=*/1, /*bitsToTakeInFirstByte=*/6);
    assertEqualParsed(
        assert,
        'Ignore bits and two bytes with offset',
        ignoreBitsAndTwoBytesWithOffsetParseNumberValue,
        0x1AE6,
        3);
    });

QUnit.test('parseMessageHeader', function(assert) {
    var message = [
        // Simplest header
        /*header*/ 0x24, 0x72, 0x2, /*body*/ 0xA4, 0x8B,
        
        // Simplest header with last byte in data-bin
        /*header*/ 0x34, 0x72, 0x2, /*body*/ 0xA4, 0x8B,
        
        // Forbidden combination of class and Csn existance bits
        /*header*/ 0x9F, 0x72, 0x2, /*body*/ 0xA4, 0x8B,
        
        // Header with class id
        /*header*/ 0x42, 0x7A, 0x72, 0x2, /*body*/ 0xA4, 0x8B,
        
        // Header with Csn
        /*header*/ 0x72, 0x7A, 0x3B, 0x72, 0x4, /*body*/ 0xA4, 0x8B, 0x8B, 0x02,

        // Header with long class and Csn
        /*header*/ 0x72, 0xAB, 0x7C, 0x3B, 0x72, 0x4, /*body*/ 0xA4, 0x8B, 0x8B, 0x02,

        // Header with long class and long Csn
        /*header*/ 0x72, 0xAB, 0x7C, 0x80, 0x01, 0x72, 0x4, /*body*/ 0xA4, 0x8B, 0x8B, 0x02,

        // Header with class id and aux
        /*header*/ 0x42, 0x7B, 0x72, 0x2, 0x51, /*body*/ 0xA4, 0x8B,
        
        // Header with long class, Csn and aux
        /*header*/ 0x72, 0xAB, 0x01, 0x3B, 0x72, 0x4, 0x70, /*body*/ 0xA4, 0x8B, 0x8B, 0x02,

        // Header with long class, long Csn and long aux
        /*header*/ 0x72, 0xAB, 0x53, 0x80, 0x01, 0x72, 0x4, 0x92, 0x00, /*body*/ 0xA4, 0x8B, 0x8B, 0x02,
        
        // Header with class id and long aux
        /*header*/ 0x4A, 0x21, 0x91, 0x42, 0x3, 0xAB, 0x71, /*body*/ 0xA9, 0xB2, 0x1B,

        // Header without class id with aux (class id using previous header)
        /*header*/ 0x3A, 0x21, 0x3, 0x14, /*body*/ 0xA9, 0xB2, 0x1B,

        // Header without class with long aux (class id using previous header)
        /*header*/ 0x3A, 0x71, 0x5, 0x84, 0x7A, /*body*/ 0xA9, 0xB2, 0x1B, 0x40, 0x81,

        // Header with long in-class ID
        /*header*/ 0xA4, 0x6D, 0x72, 0x2, /*body*/ 0xA4, 0x8B,
        
        // Header with class id and long in-class ID
        /*header*/ 0xC2, 0x6C, 0x7A, 0x72, 0x2, /*body*/ 0xA4, 0x8B,
        
        // A.3.2.2 Example, Case A, Non Extended
        /*header*/ 0x23, 0x6B, 0x81, 0x25, /*body*/ 0xA4, 0x8B, /* To Be Continued...*/
        
        // A.3.2.2 Example, Case A, Extended
        /*header*/ 0x43, 0x1, 0x6B, 0x81, 0x25, 0x3, /*body*/ 0xA4, 0x8B, /* To Be Continued...*/
        
        // A.3.2.2 Example, Case B, Non Extended
        /*header*/ 0x23, 0x81, 0x08, 0x54, /*body*/ 0xA4, 0x8B, /* To Be Continued...*/
        
        // A.3.2.2 Example, Case B, Extended
        /*header*/ 0x43, 0x01, 0x81, 0x08, 0x54, 0x03, /*body*/ 0xA4, 0x8B, /* To Be Continued...*/
        
        // A.3.2.2 Example, Case C, Non Extended
        /*header*/ 0x33, 0x81, 0x08, 0x81, 0x35, /*body*/ 0xA4, 0x8B, /* To Be Continued...*/
        
        // A.3.2.2 Example, Case C, Extended
        /*header*/ 0x53, 0x01, 0x81, 0x08, 0x81, 0x35, 0x04, /*body*/ 0xA4, 0x8B, /* To Be Continued...*/
        
        // inClassId = 65536
        /*header*/ 0xA4, 0x80, 0x0, 0x72, 0x2, /*body*/ 0xA4, 0x8B,
        
        0x0
        ];
        
    var firstHeader = createHeader(
        /*isLastByteInDatabin=*/false,
        /*inClassId=*/4,
        /*bodyStart=*/3,
        /*classId=*/0,
        /*codestreamIndex=*/0,
        /*messageOffsetFromDatabinStart=*/0x72,
        /*messageBodyLength=*/0x2);

    var previousHeader = Object.create(firstHeader);
    previousHeader.classId = 0x68;
    previousHeader.codestreamIndex = 0x5318;
    
    var simplestHeaderExpected = Object.create(firstHeader);
    var simplestHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/0);
    assert.deepEqual(simplestHeaderActual, simplestHeaderExpected, 'Simplest header');

    var simplestHeaderWithPreviousHeaderExpected = Object.create(simplestHeaderExpected);
    var simplestHeaderWithPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/0, previousHeader);
    simplestHeaderWithPreviousHeaderExpected.classId = previousHeader.classId;
    simplestHeaderWithPreviousHeaderExpected.codestreamIndex = previousHeader.codestreamIndex;
    assert.deepEqual(simplestHeaderWithPreviousHeaderActual, simplestHeaderWithPreviousHeaderExpected, 'Simplest header (with previous)');

    var simplestHeaderWithLastByteInDatabinActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/5);
    var simplestHeaderWithLastByteInDatabinExpected = Object.create(simplestHeaderExpected);
    simplestHeaderWithLastByteInDatabinExpected.bodyStart = 8;
    simplestHeaderWithLastByteInDatabinExpected.isLastByteInDatabin = true;
    assert.deepEqual(simplestHeaderWithLastByteInDatabinActual, simplestHeaderWithLastByteInDatabinExpected, 'Simplest header with last byte in data-bin');
    
    var simplestHeaderWithLastByteWithPreviousHeaderExpected = Object.create(simplestHeaderWithLastByteInDatabinExpected);
    var simplestHeaderWithLastByteWithPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/5, previousHeader);
    simplestHeaderWithLastByteWithPreviousHeaderExpected.classId = previousHeader.classId;
    simplestHeaderWithLastByteWithPreviousHeaderExpected.codestreamIndex = previousHeader.codestreamIndex;
    assert.deepEqual(simplestHeaderWithLastByteWithPreviousHeaderActual, simplestHeaderWithLastByteWithPreviousHeaderExpected, 'Simplest header with last byte (with previous)');

    assert.throws(
        function() { jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/10); },
        _jGlobals.jpipExceptions.ParseException,
        'Forbidden combination of class and Csn existance bits');
    
    assert.throws(
        function() { jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/10, previousHeader); },
        _jGlobals.jpipExceptions.ParseException,
        'Forbidden combination of class and Csn existance bits (with previous header)');
    
    var withClassIdActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/15);
    var withClassIdExpected = Object.create(simplestHeaderExpected);
    withClassIdExpected.inClassId = 2;
    withClassIdExpected.bodyStart = 19;
    withClassIdExpected.classId = 0x7A;
    assert.deepEqual(withClassIdActual, withClassIdExpected, 'With class ID');

    var withClassIdAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/15, previousHeader);
    var withClassIdAndPreviousHeaderExpected = Object.create(withClassIdExpected);
    withClassIdAndPreviousHeaderExpected.codestreamIndex = previousHeader.codestreamIndex;
    assert.deepEqual(withClassIdAndPreviousHeaderActual, withClassIdAndPreviousHeaderExpected, 'With class ID (with previous header)');

    var withCsnActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/21);
    var withCsnExpected = Object.create(withClassIdExpected);
    withCsnExpected.codestreamIndex = 0x3B;
    withCsnExpected.bodyStart = 26;
    withCsnExpected.messageBodyLength = 0x4;
    withCsnExpected.isLastByteInDatabin = true;
    assert.deepEqual(withCsnActual, withCsnExpected, 'With class ID and Code Stream Index');

    var withCsnAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/21, previousHeader);
    var withCsnAndPreviousHeaderExpected = Object.create(withCsnExpected);
    assert.deepEqual(withCsnAndPreviousHeaderActual, withCsnAndPreviousHeaderExpected, 'With class ID and Code Stream Index (with previous header)');

    var withLongClassAndCsnActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/30);
    var withLongClassAndCsnExpected = Object.create(withCsnExpected);
    withLongClassAndCsnExpected.bodyStart = 36;
    withLongClassAndCsnExpected.classId = 0x15FC;
    assert.deepEqual(withLongClassAndCsnActual, withLongClassAndCsnExpected, 'With long class ID and Code Stream Index');

    var withLongClassAndCsnAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/30, previousHeader);
    var withLongClassAndCsnAndPreviousHeaderExpected = Object.create(withLongClassAndCsnExpected);
    assert.deepEqual(withLongClassAndCsnAndPreviousHeaderActual, withLongClassAndCsnAndPreviousHeaderExpected, 'With long class ID and Code Stream Index (with previous header)');

    var withLongClassAndLongCsnActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/40);
    var withLongClassAndLongCsnExpected = Object.create(withLongClassAndCsnExpected);
    withLongClassAndLongCsnExpected.bodyStart = 47;
    withLongClassAndLongCsnExpected.codestreamIndex = 0x0001;
    assert.deepEqual(withLongClassAndLongCsnActual, withLongClassAndLongCsnExpected, 'With long class ID and long Code Stream Index');

    var withLongClassAndLongCsnAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/40, previousHeader);
    var withLongClassAndLongCsnAndPreviousHeaderExpected = Object.create(withLongClassAndLongCsnExpected);
    assert.deepEqual(withLongClassAndCsnAndPreviousHeaderActual, withLongClassAndCsnAndPreviousHeaderExpected, 'With long class ID and long Code Stream Index (with previous header)');

    var withClassIdAndAuxActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/51);
    var withClassIdAndAuxExpected = Object.create(withClassIdExpected);
    withClassIdAndAuxExpected.bodyStart = 56;
    withClassIdAndAuxExpected.classId = 0x7B;
    withClassIdAndAuxExpected.aux = 0x51;
    assert.deepEqual(withClassIdAndAuxActual, withClassIdAndAuxExpected, 'With class ID and aux');

    var withClassIdAndAuxAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/51, previousHeader);
    var withClassIdAndAuxAndPreviousHeaderExpected = Object.create(withClassIdAndAuxExpected);
    withClassIdAndAuxAndPreviousHeaderExpected.codestreamIndex = previousHeader.codestreamIndex;
    assert.deepEqual(withClassIdAndAuxAndPreviousHeaderActual, withClassIdAndAuxAndPreviousHeaderExpected, 'With class ID and aux (with previous header)');

    var withLongClassAndCsnAndAuxActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/58);
    var withLongClassAndCsnAndAuxExpected = Object.create(withLongClassAndCsnExpected);
    withLongClassAndCsnAndAuxExpected.bodyStart = 65;
    withLongClassAndCsnAndAuxExpected.classId = 0x1581;
    withLongClassAndCsnAndAuxExpected.aux = 0x70;
    assert.deepEqual(withLongClassAndCsnAndAuxActual, withLongClassAndCsnAndAuxExpected, 'With long class ID and Code Stream Index and aux');

    var withLongClassAndCsnAndAuxAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/58, previousHeader);
    var withLongClassAndCsnAndAuxAndPreviousHeaderExpected = Object.create(withLongClassAndCsnAndAuxExpected);
    assert.deepEqual(withLongClassAndCsnAndAuxAndPreviousHeaderActual, withLongClassAndCsnAndAuxAndPreviousHeaderExpected, 'With long class ID and Code Stream Index and aux (with previous header)');

    var withLongClassAndLongCsnAndAuxActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/69);
    var withLongClassAndLongCsnAndAuxExpected = Object.create(withLongClassAndLongCsnExpected);
    withLongClassAndLongCsnAndAuxExpected.bodyStart = 78;
    withLongClassAndLongCsnAndAuxExpected.classId = 0x15D3;
    withLongClassAndLongCsnAndAuxExpected.aux = 0x0900;
    assert.deepEqual(withLongClassAndLongCsnAndAuxActual, withLongClassAndLongCsnAndAuxExpected, 'With long class ID and long Code Stream Index and long aux');

    var withLongClassAndLongCsnAndAuxAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/69, previousHeader);
    var withLongClassAndLongCsnAndAuxAndPreviousHeaderExpected = Object.create(withLongClassAndLongCsnAndAuxExpected);
    assert.deepEqual(withLongClassAndCsnAndAuxAndPreviousHeaderActual, withLongClassAndCsnAndAuxAndPreviousHeaderExpected, 'With long class ID and long Code Stream Index and aux (with previous header)');

    var withLongAuxExpected = createHeader(
        /*isLastByteInDatabin=*/false,
        /*inClassId=*/0x0A,
        /*bodyStart=*/89,
        /*classId=*/0x21,
        /*codestreamIndex=*/0,
        /*messageOffsetFromDatabinStart=*/0x08C2,
        /*messageBodyLength=*/0x3);
    withLongAuxExpected.aux = 0x15F1
    var withLongAuxActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/82);
    assert.deepEqual(withLongAuxActual, withLongAuxExpected, 'With class ID and long aux');
    
    var withLongAuxAndNonEffectivePreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/82, previousHeader);
    var withLongAuxAndNonEffectivePreviousHeaderExpected = Object.create(withLongAuxExpected);
    withLongAuxAndNonEffectivePreviousHeaderExpected.codestreamIndex = previousHeader.codestreamIndex;
    assert.deepEqual(withLongAuxAndNonEffectivePreviousHeaderActual, withLongAuxAndNonEffectivePreviousHeaderExpected, 'With long aux and non effective previous header');
    
    var previousHeaderWithAux = Object.create(previousHeader);
    previousHeaderWithAux.classId = 0x83A5;
    previousHeaderWithAux.aux = 0x0832;
    
    var withAuxAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/92, previousHeaderWithAux);
    var withAuxAndPreviousHeaderExpected = Object.create(withLongAuxExpected);
    withAuxAndPreviousHeaderExpected.classId = previousHeaderWithAux.classId;
    withAuxAndPreviousHeaderExpected.messageOffsetFromDatabinStart = 0x21;
    withAuxAndPreviousHeaderExpected.bodyStart = 96;
    withAuxAndPreviousHeaderExpected.codestreamIndex = previousHeaderWithAux.codestreamIndex;
    withAuxAndPreviousHeaderExpected.isLastByteInDatabin = true;
    withAuxAndPreviousHeaderExpected.aux = 0x14;
    assert.deepEqual(withAuxAndPreviousHeaderActual, withAuxAndPreviousHeaderExpected, 'Without class ID with aux (with previous header)');
    
    var withLongAuxAndPreviousHeaderActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/99, previousHeaderWithAux);
    var withLongAuxAndPreviousHeaderExpected = Object.create(withAuxAndPreviousHeaderActual);
    withLongAuxAndPreviousHeaderExpected.messageOffsetFromDatabinStart = 0x71;
    withLongAuxAndPreviousHeaderExpected.messageBodyLength = 0x5;
    withLongAuxAndPreviousHeaderExpected.aux = 0x027A;
    withLongAuxAndPreviousHeaderExpected.bodyStart = 104;
    assert.deepEqual(withLongAuxAndPreviousHeaderActual, withLongAuxAndPreviousHeaderExpected, 'Without class ID with long aux (with previous header)');
    
    var withLongInClassIdActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/109);
    var withLongInClassIdExpected = Object.create(simplestHeaderExpected);
    withLongInClassIdExpected.bodyStart = 113;
    withLongInClassIdExpected.inClassId = 0x026D;
    assert.deepEqual(withLongInClassIdActual, withLongInClassIdExpected, 'With long in-class ID');

    var withClassIdAndLongInClassIdActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/115);
    var withClassIdAndLongInClassIdExpected = Object.create(withClassIdExpected);
    withClassIdAndLongInClassIdExpected.bodyStart = 120;
    withClassIdAndLongInClassIdExpected.inClassId = 0x016C;
    assert.deepEqual(withClassIdAndLongInClassIdActual, withClassIdAndLongInClassIdExpected, 'With class ID and long in-class ID');

    // A.3.2.2 Examples:
    
    // Case A, Non extended
    
    var caseANonExtendedExpected = createHeader(
        /*isLastByteInDatabin=*/false,
        /*inClassId=*/3,
        /*bodyStart=*/126,
        /*classId=*/0,
        /*codestreamIndex=*/0,
        /*messageOffsetFromDatabinStart=*/107,
        /*messageBodyLength=*/165);
    var caseANonExtendedActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/122);
    assert.deepEqual(caseANonExtendedActual, caseANonExtendedExpected, 'Example from standard: section A.3.2.2, case A, non extended');

    // Case A, extended
    
    var caseAExtendedExpected = Object.create(caseANonExtendedExpected);
    caseAExtendedExpected.classId = 1;
    caseAExtendedExpected.bodyStart = 134;
    caseAExtendedExpected.aux = 0x3;
    var caseAExtendedActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/128);
    assert.deepEqual(caseAExtendedActual, caseAExtendedExpected, 'Example from standard: section A.3.2.2, case A, extended');

    var caseBNonExtendedExpected = Object.create(caseANonExtendedExpected);
    caseBNonExtendedExpected.bodyStart = 140;
    caseBNonExtendedExpected.messageOffsetFromDatabinStart = 136;
    caseBNonExtendedExpected.messageBodyLength = 84;
    var caseBNonExtendedActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/136);
    assert.deepEqual(caseBNonExtendedActual, caseBNonExtendedExpected, 'Example from standard: section A.3.2.2, case B, non extended');

    var caseBExtendedExpected = Object.create(caseBNonExtendedExpected);
    caseBExtendedExpected.classId = 1;
    caseBExtendedExpected.bodyStart = 148;
    caseBExtendedExpected.aux = 0x3;
    var caseBExtendedActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/142);
    assert.deepEqual(caseBExtendedActual, caseBExtendedExpected, 'Example from standard: section A.3.2.2, case B, extended');

    var caseCNonExtendedExpected = Object.create(caseBNonExtendedExpected);
    caseCNonExtendedExpected.bodyStart = 155;
    caseCNonExtendedExpected.messageBodyLength = 181;
    caseCNonExtendedExpected.isLastByteInDatabin = true;
    var caseCNonExtendedActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/150);
    assert.deepEqual(caseCNonExtendedActual, caseCNonExtendedExpected, 'Example from standard: section A.3.2.2, case C, non extended');

    var caseCExtendedExpected = Object.create(caseCNonExtendedExpected);
    caseCExtendedExpected.classId = 1;
    caseCExtendedExpected.bodyStart = 164;
    caseCExtendedExpected.aux = 0x4;
    var caseCExtendedActual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/157);
    assert.deepEqual(caseCExtendedActual, caseCExtendedExpected, 'Example from standard: section A.3.2.2, case C, extended');
    
    var inClassId65536Expected = Object.create(simplestHeaderExpected);
    inClassId65536Expected.inClassId = 65536;
    inClassId65536Expected.bodyStart = 171;
    var inClassId65536Actual = jpipMessageHeaderParser.parseMessageHeader(message, /*startOffset=*/166);
    assert.deepEqual(inClassId65536Actual, inClassId65536Expected, 'in-class ID of 65536');

    });