'use strict'

function createComponentStructureForTest(
    numResolutionLevels, createTileParams) {
    
    createTileParams = createTileParams || createUniformPrecinctCountTileParams;
    numResolutionLevels = numResolutionLevels || 5;

    // Tile size of edge tile, to check also corner cases
    var initTileSize = [4096 - 129, 2048 - 130];
    
    var initTileParams = createTileParams(
        initTileSize,
        /*numChannels=*/1,
        numResolutionLevels,
        /*precinctWidth=*/256,
        /*precinctHeight=*/512,
        /*numQualityLayers=*/undefined,
        /*maxCodeblockWidth=*/undefined,
        /*maxCodeblockHeight=*/undefined,
        /*componentScaleX=*/1,
        /*componentScaleY=*/1);
    
    var initComponentParams = initTileParams.paramsPerComponent[0];
    
    var tileStructureMock = {
        getTileWidth: function() { return initTileSize[0]; },
        getTileHeight: function() { return initTileSize[1]; }
        };
    
    var componentStructure = new JpipComponentStructure(initComponentParams, tileStructureMock);
    return componentStructure;
}

QUnit.module('JpipComponentStructure');

QUnit.test('getNumResolutionLevels', function(assert) {
    var componentStructure = createComponentStructureForTest();
    
    var numResolutionLevelsActual = componentStructure.getNumResolutionLevels();
    var numResolutionLevelsExpected = 5;
    assert.deepEqual(
        numResolutionLevelsActual,
        numResolutionLevelsExpected,
        'Correctness of numResolutionLevels');
    });

QUnit.test('getPrecinctWidth', function(assert) {
    var componentStructure = createComponentStructureForTest();
    
    var resolutionLevel = 1;
    var factor = 1 << (4 - resolutionLevel);
    
    var precinctWidthActual = componentStructure.getPrecinctWidth(resolutionLevel);
    var precinctWidthExpected = 256 / factor;
    assert.deepEqual(precinctWidthActual, precinctWidthExpected, 'Correctness of precinctWidth');
    });

QUnit.test('getPrecinctHeight', function(assert) {
    var componentStructure = createComponentStructureForTest();
    
    var resolutionLevel = 2;
    var factor = 1 << (4  - resolutionLevel);
    
    var precinctHeightActual = componentStructure.getPrecinctHeight(resolutionLevel);
    var precinctHeightExpected = 512 / factor;
    assert.deepEqual(precinctHeightActual, precinctHeightExpected, 'Correctness of precinctHeight');
    });

QUnit.test('getMaxCodeblockWidth', function(assert) {
    var componentStructure = createComponentStructureForTest();
    
    var maxCodeblockWidthActual = componentStructure.getMaxCodeblockWidth();
    var maxCodeblockWidthExpected = 64;
    assert.deepEqual(
        maxCodeblockWidthActual,
        maxCodeblockWidthExpected, 'Correctness of maxCodeblockWidth');
    });

QUnit.test('getMaxCodeblockHeight', function(assert) {
    var componentStructure = createComponentStructureForTest();
    
    var maxCodeblockHeightActual = componentStructure.getMaxCodeblockHeight();
    var maxCodeblockHeightExpected = 64;
    assert.deepEqual(
        maxCodeblockHeightActual,
        maxCodeblockHeightExpected, 'Correctness of maxCodeblockHeight');
    });

QUnit.test('getNumPrecinctsX', function(assert) {
    var componentStructure = createComponentStructureForTest();
    
    var numPrecinctsXActual = componentStructure.getNumPrecinctsX(3);
    var numPrecinctsXExpected = 16;
    assert.deepEqual(numPrecinctsXActual, numPrecinctsXExpected, 'numPrecinctsX calculation');
    });
    
QUnit.test('getNumPrecinctsY', function(assert) {
    var componentStructure = createComponentStructureForTest();
    
    var numPrecinctsYActual = componentStructure.getNumPrecinctsY(3);
    var numPrecinctsYExpected = 4;
    assert.deepEqual(numPrecinctsYActual, numPrecinctsYExpected, 'numPrecinctsY calculation');
    });
    
QUnit.test(
    'getNumCodeblocksXInPrecinct: resolution=0, precinct size not ' +
        'bounded by subband size',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/2,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 0,
            precinctY: 0,
            resolutionLevel: 0,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksXInPrecinct(precinct, 0);
        var numCodeblocksExpected = 4;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksXInSubband correctness');
    });
    
QUnit.test(
    'getNumCodeblocksYInPrecinct: resolution=0, precinct size not ' +
        'bounded by subband size',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/2,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 0,
            precinctY: 0,
            resolutionLevel: 0,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksYInPrecinct(precinct, 0);
        var numCodeblocksExpected = 8;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksYInSubband correctness');
    });
    
QUnit.test(
    'getNumCodeblocksXInPrecinct: resolution=1, precinct size not ' +
        'bounded by subband size',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/2,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 0,
            precinctY: 0,
            resolutionLevel: 1,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksXInPrecinct(precinct, 0);
        var numCodeblocksExpected = 4;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksXInSubband correctness');
    });
    
QUnit.test(
    'getNumCodeblocksYInPrecinct: resolution=1, precinct size not ' +
        'bounded by subband size',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/2,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 0,
            precinctY: 0,
            resolutionLevel: 1,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksYInPrecinct(precinct, 0);
        var numCodeblocksExpected = 8;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksYInSubband correctness');
    });
    
QUnit.test(
    'getNumCodeblocksXInPrecinct: resolution=0, precinct size IS ' +
        'bounded by subband size',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/6,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 0,
            precinctY: 0,
            resolutionLevel: 0,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksXInPrecinct(precinct, 0);
        var numCodeblocksExpected = 2;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksXInSubband correctness');
    });
    
QUnit.test(
    'getNumCodeblocksYInPrecinct: resolution=0, precinct size IS ' +
        'bounded by subband size',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/6,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 0,
            precinctY: 0,
            resolutionLevel: 0,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksYInPrecinct(precinct, 0);
        var numCodeblocksExpected = 1;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksYInSubband correctness');
    });
    
QUnit.test(
    'getNumCodeblocksXInPrecinct: resolution=1, precinct size is ' +
        'smaller because it is edge precinct',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/2,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 15,
            precinctY: 0,
            resolutionLevel: 1,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksXInPrecinct(precinct, 0);
        var numCodeblocksExpected = 2;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksXInSubband correctness');
    });
    
QUnit.test(
    'getNumCodeblocksYInPrecinct: resolution=1, precinct size is ' +
        'smaller because it is edge precinct',
    function(assert) {
        var componentStructure = createComponentStructureForTest(
            /*numResolutionLevels=*/2,
            createUniformPrecinctSizeTileParams);
        
        var precinct = {
            precinctX: 0,
            precinctY: 3,
            resolutionLevel: 1,
            component: null,
            };
        
        var numCodeblocksActual =
            componentStructure.getNumCodeblocksYInPrecinct(precinct, 0);
        var numCodeblocksExpected = 6;
        assert.deepEqual(
            numCodeblocksActual,
            numCodeblocksExpected,
            'numCodeblocksYInSubband correctness');
    });