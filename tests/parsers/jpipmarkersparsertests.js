'use strict';

QUnit.module('JpipMarkersParser');

function createMarkersParserForTest(mainHeaderDatabin) {
    if (mainHeaderDatabin === undefined) {
        mainHeaderDatabin = databinStubs.mainHeaderDatabinStub;
    }
    
    jpipMessageHeaderParserStub.clearForTest();
    if (mainHeaderDatabin !== null) {
        mainHeaderDatabin.clearCacheForTest();
    }
    
    var result = new JpipMarkersParser(
        mainHeaderDatabin, jpipMessageHeaderParserStub, jpipMockFactory);
    return result;
}

QUnit.test('getMandatoryMarkerOffsetInDatabin InternalErrorException',
    function(assert) {
        var parser = createMarkersParserForTest();
        
        assert.throws(
            function() {
                parser.getMandatoryMarkerOffsetInDatabin(
                    databinStubs.notRecievedMarkerDatabinStub,
                    /*isMandatory=*/true);
            },
            jpipExceptions.InternalErrorException,
            'getMandatoryMarkerOffsetInDatabin (marker not ' +
            'recieved, exception is expected)');
    });

// NOTE: This test is irrelevant because markers parser does not use the
// ObjectPool cache anymore, thus does not care about ID duplication.
// Instead this test should be moved to ObjectPool tests.

//QUnit.test('getMarkerOffsetInDatabin InternalErrorException', function (assert) {
//    var parserWithSameIdForMainHeaderAndTileDatabinsSaver =
//        createMarkersParserForTest(
//            databinStubs.mainHeaderWithSameIdAsEmptyDatabinStub);
//    
//    var arbitraryMarker = [0xFF, 0x52];
//
//    assert.throws(
//        function() {
//            parserWithSameIdForMainHeaderAndTileDatabinsSaver.getMarkerOffsetInDatabin(
//                databinStubs.mainHeaderWithSameIdAsEmptyDatabinStub, arbitraryMarker);
//            parserWithSameIdForMainHeaderAndTileDatabinsSaver.getMarkerOffsetInDatabin(
//                databinStubs.emptyDatabinStub, arbitraryMarker);
//        },
//        jpipExceptions.InternalErrorException,
//        'Same ID for main header and tile header databins expects to throw exception');
//    
//    var parserWithSameIdForMainHeaderAndTileDatabinsSaver =
//        createMarkersParserForTest();
//    
//    assert.throws(
//        function() {
//            parserWithSameIdForMainHeaderAndTileDatabinsSaver.getMarkerOffsetInDatabin(
//                databinStubs.tileHeaderWithSameIdAsTileHeaderWithCODDatabinStub,
//                arbitraryMarker);
//            parserWithSameIdForMainHeaderAndTileDatabinsSaver.getMarkerOffsetInDatabin(
//                databinStubs.tileHeaderWithCodingStyleDatabinStub,
//                arbitraryMarker);
//        },
//        jpipExceptions.InternalErrorException,
//        'Same ID for two tile header databins expects to throw exception');
//    });

QUnit.test('IllegalDataException', function(assert) {
    var invalidMainHeader = databinStubs.mainHeaderWithoutSOCMarkerDatabinStub;
    var parserWithInvalidMainHeader = createMarkersParserForTest(invalidMainHeader);
    
    assert.throws(
        function() {
            parserWithInvalidMainHeader.getMarkerOffsetInDatabin(
                invalidMainHeader, j2kMarkers.CodingStyleDefault);
            },
        j2kExceptions.IllegalDataException,
        'parseCodestreamStructure without SOC marker expected to throw excetion');

    assert.throws(
        function() {
            parserWithInvalidMainHeader.getMandatoryMarkerOffsetInDatabin(
                invalidMainHeader,
                j2kMarkers.CodingStyleDefault,
                'COD segment name for exception in test',
                'Dummy standard section for exception in test');
            },
        j2kExceptions.IllegalDataException,
        'getMandatoryMarkerOffsetInDatabin without SOC marker expected to throw excetion');
    });

QUnit.test('checkSupportedMarkers unsupported marker presents (black list)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var unsupportedMarkers = [
            [0xFF, 0x12], // Arbitrary marker not present
            [0xFF, 0x51] ]; // SIZ marker present
        
        assert.throws(
            function() {
                parser.checkSupportedMarkers(
                    databinStubs.mainHeaderDatabinStub,
                    unsupportedMarkers,
                    /*isMarkerSupported=*/false);
            },
            j2kExceptions.InternalErrorException,
            'checkSupportedMarkers (marker not supported, exception is expected');
    });

QUnit.test('checkSupportedMarkers unsupported marker presents (white list)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var onlySupportedMarkers = [
            [0xFF, 0x12], // Arbitrary marker not present
            [0xFF, 0x51] ]; // SIZ marker present
        
        assert.throws(
            function() {
                parser.checkSupportedMarkers(
                    databinStubs.mainHeaderDatabinStub,
                    onlySupportedMarkers,
                    /*isMarkerSupported=*/true);
            },
            j2kExceptions.InternalErrorException,
            'checkSupportedMarkers (marker not supported, exception is expected');
    });

QUnit.test('checkSupportedMarkers unsupported markers not presents (black list)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var unsupportedMarkers = [
            [0xFF, 0x12], // Arbitrary marker not present
            [0xFF, 0x43] ]; // Another arbitrary marker not present
        
        parser.checkSupportedMarkers(
            databinStubs.mainHeaderDatabinStub,
            unsupportedMarkers,
            /*isMarkerSupported=*/false);
        assert.ok(
            true,
            'checkSupportedMarkers (unsupported markers ' +
            'not present, no exception expected');
    });

QUnit.test('checkSupportedMarkers only supported markers presents (white list)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var supportedMarkers = [
            [0xFF, 0x64], // COM marker present
            [0xFF, 0x51], // SIZ marker present
            [0xFF, 0x52], // COD marker present
            [0xFF, 0x1A] ]; // Arbitrary marker not present
        
        parser.checkSupportedMarkers(
            databinStubs.mainHeaderDatabinStub,
            supportedMarkers,
            /*isMarkerSupported=*/true);
        assert.ok(
            true,
            'checkSupportedMarkers (only supported markers ' +
            'present, no exception expected');
    });

QUnit.test('checkSupportedMarkers only supported markers presents (white list, SOD exist)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var supportedMarkers = [
            [0xFF, 0x64], // COM marker not present
            [0xFF, 0x51], // SIZ marker not present
            [0xFF, 0x52], // COD marker present
            [0xFF, 0x5C], // QCD marker present
            [0xFF, 0x1A] ]; // Arbitrary marker not present
        
        parser.checkSupportedMarkers(
            databinStubs.tileHeaderWithStartOfDataDatabinStub,
            supportedMarkers,
            /*isMarkerSupported=*/true);
        assert.ok(
            true,
            'checkSupportedMarkers (only supported markers ' +
            'present, no exception expected');
    });

QUnit.test('getMandatoryMarkerOffsetInDatabin exception expected (not found marker)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var notExistMarker = [0xFF, 0x12]; // Arbitrary marker not present
        
        assert.throws(
            function() {
                parser.getMandatoryMarkerOffsetInDatabin(
                    databinStubs.mainHeaderDatabinStub,
                    notExistMarker,
                    'Arbitrary marker name',
                    'Section in standard');
            },
            j2kExceptions.IllegalDataException,
            'getMandatoryMarkerOffsetInDatabin (marker ' +
            'not exist, exception is expected');
    });

QUnit.test('getMarkerOffsetInDatabin (not found marker)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var notExistMarker = [0xFF, 0x12]; // Arbitrary marker not present
        
        var markerOffsetActual = parser.getMarkerOffsetInDatabin(
            databinStubs.mainHeaderDatabinStub,
            notExistMarker);
        
        var markerOffsetExpected = null;
        
        assert.deepEqual(
            markerOffsetActual,
            markerOffsetExpected,
            'Should return null for not exist marker');
    });

QUnit.test('getMarkerOffsetInDatabin (non main header)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var existMarker = [0xFF, 0x5C]; // QCD
        
        var markerOffsetActual = parser.getMarkerOffsetInDatabin(
            databinStubs.tileHeaderWithCodingStyleDatabinStub,
            existMarker);
        
        var markerOffsetExpected = 17;
        
        assert.deepEqual(
            markerOffsetActual,
            markerOffsetExpected,
            'Correctness of marker offset');
    });

QUnit.test('getMarkerOffsetInDatabin exception expected (invalid marker not start with 0xFF)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var invalidMarker = [0xFE, 0x12]; // Arbitrary marker not present
        
        assert.throws(
            function() {
                parser.getMarkerOffsetInDatabin(
                    databinStubs.mainHeaderDatabinStub,
                    invalidMarker);
            },
            j2kExceptions.InternalErrorException,
            'getMarkerOffsetInDatabin (invalid ' +
            'marker, exception is expected');
    });

QUnit.test('getMarkerOffsetInDatabin twice (check cache validity)',
    function(assert) {
        var parser = createMarkersParserForTest();
        var notExistMarker = [0xFF, 0x12]; // Arbitrary marker not present
        var existMarker = [0xFF, 0x51];
        
        var nonExistMarkerOffset = parser.getMarkerOffsetInDatabin(
            databinStubs.mainHeaderDatabinStub,
            notExistMarker);
        
        var existMarkerOffsetActual = parser.getMarkerOffsetInDatabin(
            databinStubs.mainHeaderDatabinStub,
            existMarker);
        
        var existMarkerOffsetExpected = 13;
        
        assert.deepEqual(
            existMarkerOffsetActual,
            existMarkerOffsetExpected,
            'Correctness of marker offset for second getMarkerOffsetInDatabin call');
    });

QUnit.test('getMarkerOffsetInDatabin exception expected (not recieved some data)',
    function(assert) {
        var databin = databinStubs.notRecievedMarkerDatabinStub;
        databin.clearCacheForTest();
        var parser = createMarkersParserForTest();
        var arbitraryMarker = [0xFF, 0x12];
        
        assert.throws(
            function() {
                parser.getMarkerOffsetInDatabin(databin, arbitraryMarker);
            },
            jpipExceptions.InternalErrorException,
            'getMarkerOffsetInDatabin (data not recieved, ' +
            'exception is expected)');
    });

QUnit.test('getMarkerOffsetInDatabin exception expected (not recieved some data arrived later)',
    function(assert) {
        var notRecievedRange = {
            start: 62,
            length: 14
            };
        var databin = new NotRecievedRangeDatabinPartsStub(
            databinStubs.mainHeaderContent, notRecievedRange);
        var parser = createMarkersParserForTest(databin);
        
        var notRecievedMarker = [0xFF, 0x52]; // COD
        
        assert.throws(
            function() {
                parser.getMarkerOffsetInDatabin(databin, notRecievedMarker);
            },
            jpipExceptions.InternalErrorException,
            'getMarkerOffsetInDatabin (data not recieved, ' +
            'exception is expected)');
        
        databin.setAllDataRecievedForTest();
        
        var recievedMarker = notRecievedMarker;
        var offsetActual = parser.getMarkerOffsetInDatabin(databin, recievedMarker);
        var offsetExpected = databinStubs.mainHeaderContent.markerOffsets.COD;
        assert.deepEqual(offsetActual, offsetExpected, 'getMarkerOffsetInDatabin ' +
            '(correcntess of offset after recieved rest of databin)');
    });

QUnit.test('getMarkerOffsetInDatabin exception expected (not recieved all data)',
    function(assert) {
        var databin = databinStubs.notRecievedAnythingDatabinStub;
        var parser = createMarkersParserForTest(databin);
        var arbitraryMarker = [0xFF, 0x12];
        
        assert.throws(
            function() {
                parser.getMarkerOffsetInDatabin(databin, arbitraryMarker);
            },
            jpipExceptions.InternalErrorException,
            'getMarkerOffsetInDatabin (data not recieved, ' +
            'exception is expected)');
    });
    
QUnit.test('getMandatoryMarkerOffsetInDatabin', function(assert) {
    var parser = createMarkersParserForTest();

    var codOffsetInHeaderWithoutCodContentActual =
        parser.getMandatoryMarkerOffsetInDatabin(
            databinStubs
                .notRecievedCodingStyleSegmentContentDatabinStub,
            j2kMarkers.CodingStyleDefault);
            
    var codOffsetInHeaderWithoutCodContentExpected = databinStubs
        .tileHeaderContentWithCOD.markerOffsets.COD;
        
    assert.deepEqual(
        codOffsetInHeaderWithoutCodContentActual,
        codOffsetInHeaderWithoutCodContentExpected,
        'getMandatoryMarkerOffsetInDatabin (COD content not ' +
            'recieved but expected to return marker offset)');
    });
    
QUnit.test('isMarker', function(assert) {
    // No need in that
    var databinsSaverStub = null;
    var messageHeaderParserStub = null;
    
    var parser = new JpipMarkersParser(
        databinsSaverStub, messageHeaderParserStub, jpipMockFactory);
    
    var isMarkerTrueActual = parser.isMarker([0xF4, 0xFF, 0xF6, 0x45], [0xFF, 0xF6], 1);
    assert.ok(isMarkerTrueActual, 'expected to return true');

    var isMarkerWrongOffsetActual = parser.isMarker(
        [0xF4, 0x67, 0xFF, 0xF6, 0x45],
        [0xFF, 0xF6],
        1);
    assert.ok(!isMarkerWrongOffsetActual, 'wrong offset');
    
    var isMarkerEndOfBufferActual = parser.isMarker([0xF4, 0xFF, 0xF6], [0xF6, 0x06], 1);
    assert.ok(!isMarkerEndOfBufferActual, 'after end of buffer');
    });