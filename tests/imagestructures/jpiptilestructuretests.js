'use strict'

QUnit.module('JpipTileStructure');

var codestreamStructureStubForTileStructureTest = {
    getTileWidth: function() { return 1024; },
    getTileHeight: function() { return 512; },
    getNumTilesX: function() { return 8; },
    getNumTilesY: function() { return 3; },
    getNumComponents: function() { return 3; },
    getTileLeft: function() { return 252; },
    getTileTop: function() { return 143; },
    getImageWidth: function() { return 16384; },
    getImageHeight: function() { return 65536; },
    getLevelWidth: function getLevelWidth(numResolutionLevelsToCut) {
        var result = 16384;
        if (numResolutionLevelsToCut !== undefined) {
            result /= (1 << numResolutionLevelsToCut);
        }
        
        return result;
    },
    getLevelHeight: function getLevelHeight(numResolutionLevelsToCut) {
        var result = 65536;
        if (numResolutionLevelsToCut !== undefined) {
            result /= (1 << numResolutionLevelsToCut);
        }
        
        return result;
    }
    };

// Tile size of edge tile, just for fun
var initTileSize = [
    codestreamStructureStubForTileStructureTest.getTileWidth() - 3,
    codestreamStructureStubForTileStructureTest.getTileHeight() - 4];

var initNumResolutionLevels = 5;
var initTileParams = createUniformPrecinctCountTileParams(
    initTileSize,
    /*numChannels=*/3,
    initNumResolutionLevels,
    /*precinctWidth=*/64,
    /*precinctHeight=*/128,
    /*numQualityLayers=*/19);

var initProgressionOrder = 'RPCL';
    
var numPrecinctsX = 16;
var numPrecinctsY = 4;

QUnit.test('Simple accessors correctness', function(assert) {
    var tileStructure = createTileStructure(initProgressionOrder);

    var sizePerComponentExpected = initTileParams;
    var progressionOrderExpected = initProgressionOrder;
    testTileStructureSimpleAccessors(
        assert,
        tileStructure,
        //initTileSize,
        sizePerComponentExpected,
        progressionOrderExpected,
        codestreamStructureStubForTileStructureTest.getNumComponents(),
        'tile structure accessors');
    
    //var firstPrecinctPositionInTileComponentActual = tileStructure.getFirstPrecinctPositionInTile(19);
    //var firstPrecinctPositionInTileComponentExpected = createFirstPrecinctPosition();
    //firstPrecinctPositionInTileComponentExpected.tileIndex = 19;
    //firstPrecinctPositionInTileComponentExpected.component = 0;
    //assert.deepEqual(firstPrecinctPositionInTileComponentActual, firstPrecinctPositionInTileComponentExpected, 'getFirstPrecinctPositionInTile');
    });

QUnit.test(
    'getPrecinctIterator InternalErrorException on illegal numResolutionLevelsToCut',
    function(assert) {
        var tileStructure = createTileStructure(initProgressionOrder);
        
        assert.throws(
            function() {
                tileStructure.getPrecinctIterator(
                    /*tileIndex=*/0,
                    /*codestreamPartParams=*/ {
                        numResolutionLevelsToCut: initNumResolutionLevels
                        });
            },
            jpipExceptions.InternalErrorException,
            'Too large numResolutionLevelsToCut, exception is expected');
    });

testAllInClassPositionsInStructure(
    ['tileIndex', 'component', 'precinctX', 'precinctY', 'resolutionLevel'],
    createEndPrecinctPosition(),
    createTileStructure,
    function (tileStructure) { return tileStructure.precinctInClassIndexToPosition; },
    function (tileStructure) { return tileStructure.precinctPositionToInClassIndex; },
    'Precinct');

testProgressionOrderForUniformPrecinctCount(
    ['tileIndex', 'component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL');

testProgressionOrderForUniformPrecinctCount(
    ['tileIndex', 'component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL',
    /*numResolutionLevelsToCut=*/1);

//testProgressionOrderForUniformPrecinctCount(
//    ['tileIndex', 'resolutionLevel', 'component', 'precinctX', 'precinctY'],
//    'PCRL');

//testProgressionOrderForUniformPrecinctCount(
//    ['tileIndex', 'resolutionLevel', 'precinctX', 'precinctY', 'component'],
//    'CPRL');

testProgressionOrderForNonUniformStructure(
    ['tileIndex', 'component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL');

testProgressionOrderForNonUniformStructure(
    ['tileIndex', 'component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL',
    /*numResolutionLevelsToCut=*/1);

//testProgressionOrderForNonUniformStructure(
//    ['tileIndex', 'resolutionLevel', 'component', 'precinctX', 'precinctY'],
//    'PCRL');

//testProgressionOrderForNonUniformStructure(
//    ['tileIndex', 'resolutionLevel', 'precinctX', 'precinctY', 'component'],
//    'CPRL');

QUnit.test('Illegal & unsupported progression orders', function(assert) {
    assert.throws(
        function() { createTileStructure('LRCP') },
        jpipExceptions.IllegalDataException,
        'LRCP');
    
    assert.throws(
        function(assert) { createTileStructure('RLCP'); },
        jpipExceptions.IllegalDataException,
        'RLCP'); 

    assert.throws(
        function() { createTileStructure('CPRL') },
        j2kExceptions.UnsupportedFeatureException,
        'CPRL');
    
    assert.throws(
        function() { createTileStructure('PCRL') },
        j2kExceptions.UnsupportedFeatureException,
        'PCRL');
    
    assert.throws(
        function(assert) { createTileStructure('More than 4 letters'); },
        j2kExceptions.IllegalDataException,
        'Non 4-length letters'); 

    assert.throws(
        function(assert) { createTileStructure('RPPL'); },
        j2kExceptions.IllegalDataException,
        'No C'); 

    assert.throws(
        function(assert) { createTileStructure('CCRL'); },
        j2kExceptions.IllegalDataException,
        'No P');
        
    assert.throws(
        function(assert) { createTileStructure('PPCL'); },
        j2kExceptions.IllegalDataException,
        'No R'); 
        
    assert.throws(
        function(assert) { createTileStructure('RPCC'); },
        jpipExceptions.IllegalDataException,
        'No L'); 
    });

function getAdvanceFunctionSkipInexistPositions(
    paramsPerComponent, levelsAndPrecinctCounts, advanceFunction) {
    
    var advanceFunctionSkipInexist = function(precinct) {
        while (advanceFunction(precinct)) {
            if (precinct.resolutionLevel >= paramsPerComponent[precinct.component].numResolutionLevels) {
                continue;
            }
            
            if (precinct.precinctX >= levelsAndPrecinctCounts.numPrecinctsPerComponentPerLevel[precinct.component].x[precinct.resolutionLevel]) {
                continue;
            }
            
            if (precinct.precinctY >= levelsAndPrecinctCounts.numPrecinctsPerComponentPerLevel[precinct.component].y[precinct.resolutionLevel]) {
                continue;
            }
            
            return true;
        };
        
        return false;
    };
    
    return advanceFunctionSkipInexist;
}

function testProgressionOrderForUniformPrecinctCount(
    positionStructureOrderedMembers, progressionOrder, numResolutionLevelsToCut) {
    
    var endPrecinctInTile = createEndPrecinctPosition();
    endPrecinctInTile.tileIndex = 1;
    if (numResolutionLevelsToCut !== undefined) {
        endPrecinctInTile.resolutionLevel -= numResolutionLevelsToCut;
    }

    var advanceExpectedPositionFunction = getAdvancePositionFunctionByMembers(
        positionStructureOrderedMembers, endPrecinctInTile);
    
    testProgressionOrder(
        progressionOrder,
        advanceExpectedPositionFunction,
        initTileParams,
        'uniform precinct count',
        numResolutionLevelsToCut);
}

function testProgressionOrderForNonUniformStructure(
    positionStructureOrderedMembers, progressionOrder, numResolutionLevelsToCut) {
    
    var tileParamsArray = prepareCreationParamsForNonUniformTest(progressionOrder);
    
    var testName = 'Different Coding style per Component (COC) ' +
            'with progression order ' + progressionOrder;

    // Remove this test when COC is supported

    QUnit.test(testName, function(assert) {
        for (var i = 0; i < tileParamsArray.length; ++i) {
            if (tileParamsArray[i].isSupported) {
                continue;
            }
            
            var getFunctionInInternalClosure = function(tileParams) {
                var tryToCreate = function() {
                    createTileStructure(progressionOrder, tileParams);
                };
                
                return tryToCreate;
            };
            
            var tryToCreate = getFunctionInInternalClosure(tileParamsArray[i].tileParams);
            
            var assertName = 'creation of tile structure expects to throw exception, ' +
                    tileParamsArray[i].description;
            
            assert.throws(
                tryToCreate,
                j2kExceptions.UnsupportedFeatureException,
                assertName);
        }
        });
        
    for (var i = 0; i < tileParamsArray.length; ++i) {
        if (!tileParamsArray[i].isSupported) {
            continue;
        }

        var tileParams = tileParamsArray[i].tileParams;
        var description = tileParamsArray[i].description;
        
        var levelsAndPrecinctCounts = calculateLevelsAndPrecinctCounts(
            tileParams.paramsPerComponent);

        var endPrecinctInTile = {
            tileIndex: 1,
            component: codestreamStructureStubForTileStructureTest.getNumComponents(),
            
            precinctX: levelsAndPrecinctCounts.maxPrecinctsX,
            precinctY: levelsAndPrecinctCounts.maxPrecinctsY,
            resolutionLevel: levelsAndPrecinctCounts.maxNumResolutionLevels
            };
            
        if (numResolutionLevelsToCut !== undefined) {
            endPrecinctInTile.resolutionLevel -= numResolutionLevelsToCut;
        }
        
        var advanceExpectedPositionFunctionWithInexistPositions =
            getAdvancePositionFunctionByMembers(
                positionStructureOrderedMembers,
                endPrecinctInTile);
        
        var advanceExpectedPositionFunctionSkipInexistPositions =
            getAdvanceFunctionSkipInexistPositions(
                tileParams.paramsPerComponent,
                levelsAndPrecinctCounts,
                advanceExpectedPositionFunctionWithInexistPositions);
            
        testProgressionOrder(
            progressionOrder,
            advanceExpectedPositionFunctionSkipInexistPositions,
            tileParams,
            description,
            numResolutionLevelsToCut);
        
        levelsAndPrecinctCounts = null;
    }
}

function prepareCreationParamsForNonUniformTest(progressionOrder) {
    var nonUniformParamsPerComponent = [
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 2,
            precinctWidthPerLevel: [512, 512],
            precinctHeightPerLevel: [128, 64]
        },
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 3,
            precinctWidthPerLevel: [64, 256, 64],
            precinctHeightPerLevel: [64, 256, 128]
        },
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 1,
            precinctWidthPerLevel: [1024],
            precinctHeightPerLevel: [512]
        }];
    
    var nonUniformPrecinctWidthParamsPerComponent = [
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 2,
            precinctWidthPerLevel: [512, 512],
            precinctHeightPerLevel: [128, 64]
        },
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 2,
            precinctWidthPerLevel: [256, 64],
            precinctHeightPerLevel: [128, 64]
        },
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 2,
            precinctWidthPerLevel: [512, 1024],
            precinctHeightPerLevel: [128, 64]
        }];
        
    var nonUniformPrecinctHeightParamsPerComponent = [
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 2,
            precinctWidthPerLevel: [512, 512],
            precinctHeightPerLevel: [128, 64]
        },
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 2,
            precinctWidthPerLevel: [512, 512],
            precinctHeightPerLevel: [256, 128]
        },
        {
            maxCodeblockWidth: 64,
            maxCodeblockHeight: 64,
            
            numResolutionLevels: 2,
            precinctWidthPerLevel: [512, 512],
            precinctHeightPerLevel: [256, 512]
        }];
        
    var numComponents = 3;
    var numResolutionLevels = 2;

    var uniformCountParams = createUniformPrecinctCountTileParams(
        initTileSize,
        numComponents,
        numResolutionLevels,
        /*precinctWidthLevel0=*/128,
        /*precinctHeightLevel0=*/128,
        /*numQualityLayers=*/13);
    
    var nonUniformCountParams = createUniformPrecinctSizeTileParams(
        initTileSize,
        numComponents,
        numResolutionLevels,
        /*precinctWidthLevel0=*/128,
        /*precinctHeightLevel0=*/128,
        /*numQualityLayers=*/12);
    
    var supportedNonUniformPrecinctsXParams = {
        tileSize: initTileSize,
        paramsPerComponent: new Array(numComponents)
        };
    var supportedNonUniformPrecinctsYParams = {
        tileSize: initTileSize,
        paramsPerComponent: new Array(numComponents)
        };
    
    for (var c = 0; c < numComponents; ++c) {
        supportedNonUniformPrecinctsXParams.paramsPerComponent[c] = {
            maxCodeblockWidth: nonUniformCountParams.maxCodeblockWidth,
            maxCodeblockHeight: nonUniformCountParams.maxCodeblockHeight,
            
            numResolutionLevels: numResolutionLevels,
            precinctWidthPerLevel: new Array(numResolutionLevels),
            precinctHeightPerLevel: new Array(numResolutionLevels)
            };
        
        supportedNonUniformPrecinctsYParams.paramsPerComponent[c] = {
            maxCodeblockWidth: nonUniformCountParams.maxCodeblockWidth,
            maxCodeblockHeight: nonUniformCountParams.maxCodeblockHeight,
            
            numResolutionLevels: numResolutionLevels,
            precinctWidthPerLevel: new Array(numResolutionLevels),
            precinctHeightPerLevel: new Array(numResolutionLevels)
            };
        
        for (var r = 0; r < numResolutionLevels; ++r) {
            supportedNonUniformPrecinctsXParams.paramsPerComponent[c].precinctWidthPerLevel[r] =
                nonUniformCountParams.paramsPerComponent[c].precinctWidthPerLevel[r];
            supportedNonUniformPrecinctsXParams.paramsPerComponent[c].precinctHeightPerLevel[r] =
                uniformCountParams.paramsPerComponent[c].precinctHeightPerLevel[r];

            supportedNonUniformPrecinctsYParams.paramsPerComponent[c].precinctWidthPerLevel[r] =
                uniformCountParams.paramsPerComponent[c].precinctWidthPerLevel[r];
            supportedNonUniformPrecinctsYParams.paramsPerComponent[c].precinctHeightPerLevel[r] =
                nonUniformCountParams.paramsPerComponent[c].precinctHeightPerLevel[r];
        }
    }
    
    supportedNonUniformPrecinctsXParams.defaultComponentParams = supportedNonUniformPrecinctsXParams.paramsPerComponent[0];
    supportedNonUniformPrecinctsYParams.defaultComponentParams = supportedNonUniformPrecinctsYParams.paramsPerComponent[0];
    
    var isNonUniformLevelsSupported = progressionOrder === 'RPCL';

    var paramsPerComponentArray = [
        {
            isSupported: false,
            tileParams: {
                isPacketHeadersNearData: true,
                isStartOfPacketMarkerAllowed: false,
                isEndPacketHeaderMarkerAllowed: false,

                paramsPerComponent: nonUniformParamsPerComponent,
                defaultComponentParams: nonUniformParamsPerComponent[0],
                tileSize: initTileSize
                },
            description: 'totally different params per component and level'
        },
        {
            isSupported: false,
            tileParams: {
                isPacketHeadersNearData: true,
                isStartOfPacketMarkerAllowed: false,
                isEndPacketHeaderMarkerAllowed: false,

                paramsPerComponent: nonUniformPrecinctWidthParamsPerComponent,
                defaultComponentParams: nonUniformPrecinctWidthParamsPerComponent[0],
                tileSize: initTileSize
                },
            description: 'same number of resolution levels per component, different precinct width'
        },
        {
            isSupported: false,
            tileParams: {
                isPacketHeadersNearData: true,
                isStartOfPacketMarkerAllowed: false,
                isEndPacketHeaderMarkerAllowed: false,

                paramsPerComponent: nonUniformPrecinctHeightParamsPerComponent,
                defaultComponentParams: nonUniformPrecinctHeightParamsPerComponent[0],
                tileSize: initTileSize
                },
            description: 'same number of resolution levels per component, different precinct height'
        },
        {
            isSupported: isNonUniformLevelsSupported,
            tileParams: supportedNonUniformPrecinctsXParams,
            description: 'non uniform precinct x count'
        },
        {
            isSupported: isNonUniformLevelsSupported,
            tileParams: supportedNonUniformPrecinctsYParams,
            description: 'non uniform precinct y count'
        }
        ];
    
    return paramsPerComponentArray;
}

function calculateLevelsAndPrecinctCounts(paramsPerComponent) {
    var numPrecinctsPerComponentPerLevel = [];
    var maxNumResolutionLevels = 0;
    var maxPrecinctsX = 0;
    var maxPrecinctsY = 0;
    for (var c = 0; c < paramsPerComponent.length; ++c) {
        var componentParams = paramsPerComponent[c];
        
        maxNumResolutionLevels = Math.max(maxNumResolutionLevels, componentParams.numResolutionLevels);
        
        for (var r = componentParams.numResolutionLevels - 1; r >= 0; --r) {
            maxPrecinctsX = Math.max(maxPrecinctsX, componentParams.precinctWidthPerLevel[r]);
            maxPrecinctsY = Math.max(maxPrecinctsY, componentParams.precinctHeightPerLevel[r]);
        }
        
        numPrecinctsPerComponentPerLevel[c] = calculatePrecinctsCount(componentParams);
    }
    
    var result = {
        numPrecinctsPerComponentPerLevel: numPrecinctsPerComponentPerLevel,
        numComponents: paramsPerComponent.length,
        maxNumResolutionLevels: maxNumResolutionLevels,
        maxPrecinctsX: maxPrecinctsX,
        maxPrecinctsY: maxPrecinctsY
        };
    return result;
}

function calculatePrecinctsCount(componentParams) {
    var tileWidthInResolution = codestreamStructureStubForTileStructureTest.getTileWidth();
    var tileHeightInResolution = codestreamStructureStubForTileStructureTest.getTileHeight();
    
    var numPrecinctsX = [];
    var numPrecinctsY = [];
    
    for (var r = componentParams.numResolutionLevels - 1; r >= 0; --r) {
        numPrecinctsX[r] = Math.ceil(tileWidthInResolution / componentParams.precinctWidthPerLevel[r]);
        numPrecinctsY[r] = Math.ceil(tileHeightInResolution / componentParams.precinctHeightPerLevel[r]);
        
        tileWidthInResolution >>>= 1;
        tileHeightInResolution >>>= 1;
    }
    
    var result = {
        x: numPrecinctsX,
        y: numPrecinctsY
    };
    
    return result;
}

function testProgressionOrder(
    progressionOrder,
    advanceExpectedPositionFunction,
    sizeParams,
    testNameSuffix,
    numResolutionLevelsToCut) {
    
    QUnit.test(
        progressionOrder + ' progression order, codestreamPart = all tile, ' +
            testNameSuffix,
        function(assert) {
            var index = 0;
            var precinctPositionToIterateManually = createFirstPrecinctPosition();
            
            var tileStructureForProgressionOrder = createTileStructure(
                progressionOrder, sizeParams);

            var allTileCodestreamPart = {
                numResolutionLevelsToCut: numResolutionLevelsToCut,
                minX: codestreamStructureStubForTileStructureTest.getTileLeft(),
                minY: codestreamStructureStubForTileStructureTest.getTileTop(),
                maxXExclusive: codestreamStructureStubForTileStructureTest.getTileLeft() + sizeParams.tileSize[0],
                maxYExclusive: codestreamStructureStubForTileStructureTest.getTileTop() + sizeParams.tileSize[1]
                };

            var iterator = tileStructureForProgressionOrder.getPrecinctIterator(
                precinctPositionToIterateManually.tileIndex,
                allTileCodestreamPart);
            
            function performProgressionOrderCheck(sequenceNumber, precinctPositionExpected) {
                if (sequenceNumber !== index++) {
                    throw 'Unexpected sequence number in progression order test. Fix test';
                }
                
                if (sequenceNumber > 0) {
                    if (!iterator.tryAdvance()) {
                        throw 'End precinct has been reached too early';
                    }
                }
                
                var result = {
                    actual: iterator,
                    expected: precinctPositionExpected
                    };
                
                return result;
            };
            
            var membersToCompare = ['tileIndex', 'component', 'precinctX', 'precinctY', 'resolutionLevel'];
            var performSingleCheck = getPerformCheckFunctionByMembersToCompare(
                membersToCompare, performProgressionOrderCheck);
            
            //var advanceFunction = advanceExpectedPositionFunction;
            //if (numResolutionLevels === undefined) {
            //    advanceFunction = getAdvanceFunctionSkipHighLevels(
            //        advanceExpectedPositionFunction,
            //        numResolutionLevels);
            //}
        
            checkMultiplePositionsInOneAssert(
                precinctPositionToIterateManually,
                advanceExpectedPositionFunction,
                performSingleCheck,
                assert);
                
            var isLastPrecinct = !iterator.tryAdvance();
            assert.ok(isLastPrecinct, 'tryAdvance expected to return false at the end');
        }
    );
};

function createTileStructure(progressionOrder, tileParams) {
    if (progressionOrder === undefined) {
        progressionOrder = 'RPCL';
    }
    
    if (tileParams === undefined) {
        tileParams = initTileParams;
    }

    var jpipMockFactoryForTileStructureTest = Object.create(jpipMockFactory);
    
    jpipMockFactoryForTileStructureTest.createComponentStructure = function(componentParams, tileStructure) {
        var result = new JpipComponentStructureStub(componentParams);
        
        var precinctsCount = calculatePrecinctsCount(componentParams);
        
        result.getNumPrecinctsX = function(resolutionLevel) {
            return precinctsCount.x[resolutionLevel];
        };
        
        result.getNumPrecinctsY = function(resolutionLevel) {
            return precinctsCount.y[resolutionLevel];
        };
        
        return result;
    };

    var result = new JpipTileStructure(tileParams, codestreamStructureStubForTileStructureTest, jpipMockFactoryForTileStructureTest, progressionOrder);
    
    return result;
};

function createFirstPrecinctPosition() {
    var result = {
        tileIndex: 0,
        component: 0,
        
        precinctX: 0,
        precinctY: 0,
        resolutionLevel: 0
        };
    
    return result;
};

function createEndPrecinctPosition() {
    var result = {
        tileIndex: codestreamStructureStubForTileStructureTest.getNumTilesX() * codestreamStructureStubForTileStructureTest.getNumTilesY(),
        component: codestreamStructureStubForTileStructureTest.getNumComponents(),
        
        precinctX: numPrecinctsX,
        precinctY: numPrecinctsY,
        resolutionLevel: initNumResolutionLevels
        };
    
    return result;
};