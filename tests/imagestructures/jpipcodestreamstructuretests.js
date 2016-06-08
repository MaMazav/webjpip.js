'use strict';

QUnit.module('JpipCodestreamStructure');

// NOTE: 
// 1. Split getTileStructure huge tests (51 assertions!) into small ones.
// 2. Move stubs and tested object creation into test (or at least give
//    them names with lower chances to conflict other tests...).

var numTilesX = 19;
var numTilesY = 20;
var tileWidth = 1024;
var tileHeight = 768;

var imageParamsWithoutComponentScale = {
    numComponents: 3,
    imageWidth: numTilesX * tileWidth - 0.75 * tileWidth,
    imageHeight: numTilesY * tileHeight - 0.75 * tileHeight,
    tileWidth: tileWidth,
    tileHeight: tileHeight,
    firstTileOffsetX: 0,
    firstTileOffsetY: 0
    //firstTileOffsetX: 10,
    //firstTileOffsetY: 20
    };
    
var initImageParams = Object.create(imageParamsWithoutComponentScale);
initImageParams.componentsScaleX = [1, 1, 1];
initImageParams.componentsScaleY = [1, 1, 1];

var initImageParamsWithFullTiles = {
    numComponents: 3,
    imageWidth: numTilesX * tileWidth,
    imageHeight: numTilesY * tileHeight,
    tileWidth: tileWidth,
    tileHeight: tileHeight,
    componentsScaleX: [1, 1, 1],
    componentsScaleY: [1, 1, 1],
    firstTileOffsetX: 0,
    firstTileOffsetY: 0
    //firstTileOffsetX: 5,
    //firstTileOffsetY: 10
    };
    
var defaultTileParams = createUniformPrecinctCountTileParams(
    /*tileSize=*/null,
    /*numChannels=*/3,
    /*numResolutionLevels=*/4,
    /*precinctWidth=*/132,
    /*precinctHeight=*/154,
    /*numQualityLayers=*/15);
var progressionOrder = 'RPCL';

var undefinedOverrideTileParams = undefined;
var undefinedOverrideTileIndex = 1;

var fullOverrideTileParams = createUniformPrecinctCountTileParams(
    /*tileSize=*/null,
    /*numChannels=*/3,
    /*numResolutionLevels=*/2,
    /*precinctWidth=*/11,
    /*precinctHeight=*/19,
    /*numQualityLayers=*/18);

var fullOverrideTileIndex = 4;
var overrideHorizontalEdgeTileIndex = 56;
var overrideVerticalEdgeTileIndex = 375;

var horizontalAndVerticalEdgeTileIndex = 379;

var structureParserStub = createStructureParserStubForCodestreamStructureTest(
    initImageParams);
var structureParserWithFullTilesStub =
    createStructureParserStubForCodestreamStructureTest(
        initImageParamsWithFullTiles);
var structureParserStubWithLastEdgeOverriden =
    createStructureParserStubForCodestreamStructureTest(initImageParams);
structureParserStubWithLastEdgeOverriden.overrideTileParamsForTest(
    horizontalAndVerticalEdgeTileIndex, fullOverrideTileParams);

function createStructureParserStubForCodestreamStructureTest(imageParams) {
    var structureParserStub = new JpipStructureParserStub(imageParams);
    
    structureParserStub.overrideTileParamsForTest(
        fullOverrideTileIndex, fullOverrideTileParams);
    structureParserStub.overrideTileParamsForTest(
        overrideHorizontalEdgeTileIndex, fullOverrideTileParams);
    structureParserStub.overrideTileParamsForTest(
        overrideVerticalEdgeTileIndex, fullOverrideTileParams);
        
    structureParserStub.overrideTileParamsForTest(
        undefinedOverrideTileIndex, undefinedOverrideTileParams);
    
    return structureParserStub;
}

function createCodestreamStructure() {
    var codestreamStructure = new jpipExports.JpipCodestreamStructure(
        structureParserStub,
        mockFactoryForCodestreamStructureTest,
        progressionOrder);
    
    return codestreamStructure;
}

QUnit.test('JpipCodestreamStructure.(simple accessors)', function(assert) {
    var codestreamStructure = createCodestreamStructure();
    
    var paramsActual = {
        numComponents: codestreamStructure.getNumComponents(),
        imageWidth: codestreamStructure.getImageWidth(),
        imageHeight: codestreamStructure.getImageHeight(),
        tileWidth: codestreamStructure.getTileWidth(),
        tileHeight: codestreamStructure.getTileHeight(),
        firstTileOffsetX: codestreamStructure.getFirstTileOffsetX(),
        firstTileOffsetY: codestreamStructure.getFirstTileOffsetY()
        };
    
    var paramsExpected = imageParamsWithoutComponentScale;
    
    assert.deepEqual(paramsActual, paramsExpected, 'image structure accessors');
    
    var numTilesXActual = codestreamStructure.getNumTilesX();
    var numTilesXExpected = numTilesX;
    assert.deepEqual(numTilesXActual, numTilesXExpected, 'getNumTilesX calculation');

    var numTilesYActual = codestreamStructure.getNumTilesY();
    var numTilesYExpected = numTilesY;
    assert.deepEqual(numTilesYActual, numTilesYExpected, 'getNumTilesY calculation');
    });

QUnit.test('JpipCodestreamStructure.getTileStructure', function(assert) {
    var codestreamStructure = createCodestreamStructure();
    
    function testGetTileStructure(
        tileIndex, parsedParams, assertName, tileSizeExpected) {
        
        var tileStructureMockActual;
        if (tileIndex === null) {
            tileStructureMockActual = codestreamStructure.getDefaultTileStructure();
        } else {
            tileStructureMockActual = codestreamStructure.getTileStructure(tileIndex);
        }

        if (!tileSizeExpected) {
            tileSizeExpected = [tileWidth, tileHeight];
        }
        var tileParamsExpected = Object.create(parsedParams);
        tileParamsExpected.tileSize = tileSizeExpected;
        
        var progressionOrderExpected = progressionOrder;
        testTileStructureSimpleAccessors(
            assert,
            tileStructureMockActual,
            tileParamsExpected,
            progressionOrderExpected,
            initImageParams.numComponents,
            assertName);
        
        var codestreamStructureActual =
            tileStructureMockActual.getCodestreamStructureForTest();
        var codestreamStructureExpected = codestreamStructure;
        assert.equal(
            codestreamStructureActual,
            codestreamStructureExpected,
            assertName + ': passed correct codestreamStructure ' +
            'parameter to tileStructure C`tor');
    };
    
    function testEdgeTiles(structure, isEdgeTileFull) {
        var edgeSizeFactor = isEdgeTileFull ? 1 : 0.25;
    
        var noOverrideHorizontalEdgeTileIndex = 37;
        var horizontalEdgeTileSize = [edgeSizeFactor * tileWidth, tileHeight];
        testGetTileStructure(
            noOverrideHorizontalEdgeTileIndex,
            defaultTileParams,
            'Horizontal edge (no override, isEdgeTileFull = ' + isEdgeTileFull + ')',
            horizontalEdgeTileSize);

        testGetTileStructure(
            overrideHorizontalEdgeTileIndex,
            fullOverrideTileParams,
            'Horizontal edge (overriden, isEdgeTileFull = ' + isEdgeTileFull + ')',
            horizontalEdgeTileSize);

        var noOverrideVerticalEdgeTileIndex = 363;
        var verticalEdgeTileSize = [tileWidth, edgeSizeFactor * tileHeight];
        testGetTileStructure(
            noOverrideVerticalEdgeTileIndex,
            defaultTileParams,
            'Vertical edge (no override, isEdgeTileFull = ' + isEdgeTileFull + ')',
            verticalEdgeTileSize);

        testGetTileStructure(
            overrideVerticalEdgeTileIndex,
            fullOverrideTileParams,
            'Vertical edge (overriden, isEdgeTileFull = ' + isEdgeTileFull + ')',
            verticalEdgeTileSize);

        var horizontalAndVerticalEdgeTileSize =
            [edgeSizeFactor * tileWidth, edgeSizeFactor * tileHeight];
        testGetTileStructure(
            horizontalAndVerticalEdgeTileIndex,
            defaultTileParams,
            'Horizontal and Vertical edge (no override, isEdgeTileFull = ' + isEdgeTileFull + ')',
            horizontalAndVerticalEdgeTileSize);
    };
        
    //var defaultTileStructureActual = codestreamStructure.getDefaultTileStructure();
    //var defaultTileParamsExpected = defaultTileParams;
    //testTileStructureSimpleAccessors(
    //    assert,
    //    defaultTileStructureActual,
    //    defaultTileParamsExpected,
    //    progressionOrder,
    //    initImageParams.numComponents,
    //    'getDefaultTileStructure');
    
    //var defaultProgressionOrderActual = codestreamStructure.getDefaultProgressionOrder();
    //var defaultProgressionOrderExpected = progressionOrder;
    //assert.deepEqual(defaultProgressionOrderActual, defaultProgressionOrderExpected, 'getDefaultProgressionOrder');
    
    testGetTileStructure(
        /*tileIndex=*/null,
        defaultTileParams,
        'getDefaultTileStructure');
    
    testGetTileStructure(undefinedOverrideTileIndex, defaultTileParams, 'undefined override');
    
    testGetTileStructure(fullOverrideTileIndex, fullOverrideTileParams, 'full override');
    
    var noOverrideTileIndex = 152;
    testGetTileStructure(noOverrideTileIndex, defaultTileParams, 'null override');

    testGetTileStructure(fullOverrideTileIndex, fullOverrideTileParams, 'full override - second time (cached)');

    testGetTileStructure(noOverrideTileIndex, defaultTileParams, 'null override - second time');
    
    testEdgeTiles(codestreamStructure, /*isEdgeTileFull=*/false);
    
    codestreamStructure = new jpipExports.JpipCodestreamStructure(
        structureParserWithFullTilesStub,
        mockFactoryForCodestreamStructureTest,
        progressionOrder);
    testEdgeTiles(codestreamStructure, /*isEdgeTileFull=*/true);

    // Reset codestreamStructure to clear horizontal/vertical edge cached information
    codestreamStructure = new jpipExports.JpipCodestreamStructure(
        structureParserStubWithLastEdgeOverriden,
        mockFactoryForCodestreamStructureTest,
        progressionOrder);

    var horizontalAndVerticalEdgeTileSize =
        [0.25 * tileWidth, 0.25 * tileHeight];

    testGetTileStructure(
        horizontalAndVerticalEdgeTileIndex,
        fullOverrideTileParams,
        'Horizontal and Vertical edge (overriden)',
        horizontalAndVerticalEdgeTileSize);
    
    assert.throws(
        function() { codestreamStructure.getTileStructure(-1) },
        _jGlobals.jpipExceptions.ArgumentException,
        'Expect exception on negative tile index');

    assert.throws(
        function() { codestreamStructure.getTileStructure(numTilesX * numTilesY) },
        _jGlobals.jpipExceptions.ArgumentException,
        'Expect exception on too big tile index');
    });

testAllInClassPositionsInStructure(
    ['tileX', 'tileY'],
    { tileX: numTilesX, tileY: numTilesY },
    createCodestreamStructure,
    function (codestreamStructure) { return codestreamStructure.tileInClassIndexToPosition },
    function (codestreamStructure) { return codestreamStructure.tilePositionToInClassIndex },
    'Tile');