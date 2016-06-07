'use strict';

function createStructureParserForTest(mainHeader) {
    if (mainHeader === undefined) {
        mainHeader = databinStubs.mainHeaderDatabinStub;
    }
    var databinsSaver = createDatabinsSaverStub(mainHeader);
    
    var offsetsCalculator = new JpipOffsetsCalculatorStub(mainHeader);
    
    var parser = new JpipStructureParser(
        databinsSaver,
        jpipMarkersParserStub,
        jpipMessageHeaderParserStub,
        offsetsCalculator);
    
    return parser;
}

QUnit.module('JpipStructureParser');

QUnit.test('parseCodestreamStructure', function(assert) {
    var parser = createStructureParserForTest();
    
    var tileSize = [128, 512];
    
    var codestreamStructureParamsActual = parser.parseCodestreamStructure();
    var codestreamStructureParamsExpected = {
        numComponents: 3,
        imageWidth: 5450,
        imageHeight: 3623,
        tileWidth: tileSize[0],
        tileHeight: tileSize[1],
        firstTileOffsetX: 5,
        firstTileOffsetY: 10,
        componentsScaleX: [1, 1, 1],
        componentsScaleY: [1, 1, 1]
    };
    assert.deepEqual(
        codestreamStructureParamsActual,
        codestreamStructureParamsExpected,
        'parseCodestreamStructure');
    });
    
QUnit.test('parseDefaultTileParams', function(assert) {
    var parser = createStructureParserForTest();
    
    var defaultTileStructureParamsActual = parser.parseDefaultTileParams();
    var defaultTileStructureParamsExpected = createUniformPrecinctSizeTileParams(
        /*tileSize=*/null,
        /*numComponents=*/3,
        /*numResolutionLevels=*/6,
        /*precinctWidthLevel0=*/32768,
        /*precinctHeightLevel0=*/32768,
        /*numQualityLayers=*/10);
    assert.deepEqual(
        defaultTileStructureParamsActual,
        defaultTileStructureParamsExpected,
        'parseDefaultTileParams');
    });
    
QUnit.test('parseDefaultTileParams with PPM', function(assert) {
    var databinContent = deepCloneDatabinContent(databinStubs.mainHeaderContent);
    databinContent.markerOffsets.PPM = 'Non-null position';
    var databin = new DatabinPartsStub(databinContent);

    var parser = createStructureParserForTest(databin);
    
    var defaultTileStructureParamsActual = parser.parseDefaultTileParams();
    var defaultTileStructureParamsExpected = createUniformPrecinctSizeTileParams(
        /*tileSize=*/null,
        /*numComponents=*/3,
        /*numResolutionLevels=*/6,
        /*precinctWidthLevel0=*/32768,
        /*precinctHeightLevel0=*/32768,
        /*numQualityLayers=*/10);
    defaultTileStructureParamsExpected.isPacketHeadersNearData = false;
    assert.deepEqual(
        defaultTileStructureParamsActual,
        defaultTileStructureParamsExpected,
        'parseDefaultTileParams');
    });
    
QUnit.test('parseOverridenTileParams (no COD in header)', function(assert) {
    var parser = createStructureParserForTest();
    
    var noCODTileParamsActual = parser.parseOverridenTileParams(databinStubs.indices.tileWithEmptyDatabin);
    var noCODTileParamsExpected = null;
    assert.deepEqual(
        noCODTileParamsActual,
        noCODTileParamsExpected,
        'parseOverridenTileParams (no COD in tile header)');
    
    var onlySODInHeaderTileParamsActual = parser.parseOverridenTileParams(
        databinStubs.indices.tileWithStartOfDataMarker);
    var onlySODInHeaderTileParamsExpected = null;
    assert.deepEqual(
        onlySODInHeaderTileParamsActual,
        onlySODInHeaderTileParamsExpected,
        'parseOverridenTileParams (only SOD in tile header)');
    });
    
QUnit.test('parseOverridenTileParams (COD in header)', function(assert) {
    var parser = createStructureParserForTest();
    
    var withCODTileParamsActual = parser.parseOverridenTileParams(
        databinStubs.indices.tileWithCodingStyle);
    var withCODTileParamsExpected = createUniformPrecinctSizeTileParams(
        /*tileSize=*/null,
        /*numComponents=*/3,
        /*numResolutionLevels=*/3,
        /*precinctWidthLevel0=*/128,
        /*precinctHeightLevel0=*/64,
        /*numQualityLayers=*/1,
        /*maxCodeblockWidth=*/128,
        /*maxCodeblockHeight=*/32);
    withCODTileParamsExpected.paramsPerComponent[0].precinctWidthPerLevel[0] = 64;
    withCODTileParamsExpected.paramsPerComponent[1].precinctWidthPerLevel[0] = 64;
    withCODTileParamsExpected.paramsPerComponent[2].precinctWidthPerLevel[0] = 64;
    withCODTileParamsExpected.paramsPerComponent[0].precinctHeightPerLevel[0] = 32;
    withCODTileParamsExpected.paramsPerComponent[1].precinctHeightPerLevel[0] = 32;
    withCODTileParamsExpected.paramsPerComponent[2].precinctHeightPerLevel[0] = 32;
    assert.deepEqual(
        withCODTileParamsActual,
        withCODTileParamsExpected,
        'parseOverridenTileParams (with COD in tile header)');
    });
    
QUnit.test('parseOverridenTileParams (COD in header, PPT present)', function(assert) {
    var parser = createStructureParserForTest();
    
    var withCODTileParamsActual = parser.parseOverridenTileParams(
        databinStubs.indices.tileWithPpt);
    var withCODTileParamsExpected = createUniformPrecinctSizeTileParams(
        /*tileSize=*/null,
        /*numComponents=*/3,
        /*numResolutionLevels=*/3,
        /*precinctWidthLevel0=*/128,
        /*precinctHeightLevel0=*/64,
        /*numQualityLayers=*/1,
        /*maxCodeblockWidth=*/128,
        /*maxCodeblockHeight=*/32);
    withCODTileParamsExpected.paramsPerComponent[0].precinctWidthPerLevel[0] = 64;
    withCODTileParamsExpected.paramsPerComponent[1].precinctWidthPerLevel[0] = 64;
    withCODTileParamsExpected.paramsPerComponent[2].precinctWidthPerLevel[0] = 64;
    withCODTileParamsExpected.paramsPerComponent[0].precinctHeightPerLevel[0] = 32;
    withCODTileParamsExpected.paramsPerComponent[1].precinctHeightPerLevel[0] = 32;
    withCODTileParamsExpected.paramsPerComponent[2].precinctHeightPerLevel[0] = 32;
    withCODTileParamsExpected.isPacketHeadersNearData = false;
    assert.deepEqual(
        withCODTileParamsActual,
        withCODTileParamsExpected,
        'parseOverridenTileParams (with COD in tile header)');
    });
    
QUnit.test('parseCodestreamStructure (no SIZ segment content)', function(assert) {
    var databin = databinStubs.notRecievedSizContentInMainHeaderDatabinStub;
    var parser = createStructureParserForTest(databin);
    
    assert.throws(
        function() {
            parser.parseCodestreamStructure();
        },
        jpipExceptions.InternalErrorException,
        'Not recieved SIZ segment content should throw exception');
    });

QUnit.test('parseDefaultTileParams (illegal codeblock width)', function(assert) {
    var databinContent = deepCloneDatabinContent(databinStubs.mainHeaderContent);
    databinContent[72] = 11; // Set codeblock width to illegal size > 10
    var databin = new DatabinPartsStub(databinContent);
    
    var parser = createStructureParserForTest(databin);
    
    assert.throws(
        function() {
            parser.parseDefaultTileParams();
        },
        j2kExceptions.IllegalDataException,
        'Illegal codeblock width > 10 expected to throw exception');
    });

QUnit.test('parseDefaultTileParams (illegal codeblock height)', function(assert) {
    var databinContent = deepCloneDatabinContent(databinStubs.mainHeaderContent);
    databinContent[73] = 11; // Set codeblock height to illegal size > 10
    var databin = new DatabinPartsStub(databinContent);
    
    var parser = createStructureParserForTest(databin);
    
    assert.throws(
        function() {
            parser.parseDefaultTileParams();
        },
        j2kExceptions.IllegalDataException,
        'Illegal codeblock height > 10 expected to throw exception');
    });