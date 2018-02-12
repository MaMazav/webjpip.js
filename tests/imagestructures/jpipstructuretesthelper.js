'use strict';

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
    getLevelWidth: function getLevelWidth(level) {
        var result = 16384;
        if (level !== undefined) {
            result /= (1 << level);
        }
        
        return result;
    },
    getLevelHeight: function getLevelHeight(level) {
        var result = 65536;
        if (level !== undefined) {
            result /= (1 << level);
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

function checkMultiplePositionsInOneAssert(
    positionToIterate,
    advancePositionFunction,
    performCheck,
    assert) {

    var failedTest = false;
    var seqNumber = 0;
    
    do {
        var checkResult = performCheck(seqNumber, positionToIterate);
        
        if (!failedTest && !checkResult.isPassed) {
            assert.deepEqual(checkResult.actual, checkResult.expected,
                '(failed index/position calculation, sequence number is ' + seqNumber + ')');
            failedTest = true;
            
            // Do not break: Callers assumes the position was iterated until the end anyway
        }

        //if (!failedTest && checkResult.actual !== checkResult.expected) {
        //    assert.deepEqual(checkResult.actual, checkResult.expected, '(failed position calculation, sequence number is ' + inClassId + ')');
        //    failedTest = true;
        //}
        ++seqNumber;
    } while (advancePositionFunction(positionToIterate));

    if (!failedTest) {
        assert.ok(true, '(all ' + seqNumber + ' checks)');
    }
}

function getPerformCheckFunctionByMembersToCompare(members, getExpectedAndActual) {
    function resultFunction(index, position) {
        var result = getExpectedAndActual(index, position);
        
        var isPassed = true;
        for (var i = 0; i < members.length; ++i) {
            var member = members[i];
            
            if (result.actual[member] !== result.expected[member]) {
                isPassed = false;
                break;
            }
        }
        
        result.isPassed = isPassed;
        return result;
    };
    
    return resultFunction;
}

function getZeroedPositionByMembers(members) {
    var position = {};

    for (var i = 0; i < members.length; ++i) {
        var member = members[i];
        position[member] = 0;
    }
    
    return position;
}

function getNumPositionsByMembers(members, endPosition) {
    var numPositions = 1;

    for (var i = 0; i < members.length; ++i) {
        var member = members[i];
        numPositions *= endPosition[member];
    }
    
    return numPositions;
}

function getAdvancePositionFunctionByMembers(positionStructureOrderedMembers, endPosition) {
    function advancePosition(position) {
        for (var i = 0; i < positionStructureOrderedMembers.length; ++i) {
            var member = positionStructureOrderedMembers[i];
            var newValue = ++position[member];
            
            if (newValue < endPosition[member]) {
                return true;
            }
            
            position[member] = 0;
        }
        
        return false;
    };
    
    return advancePosition;
}

function testAllPositionsInStructure(
    positionStructureOrderedMembers,
    endPosition,
    getExpectedAndActual,
    assert) {
    
    // Initialization
    
    var position = getZeroedPositionByMembers(positionStructureOrderedMembers);
    
    var firstPosition = Object.create(position);
    
    var advancePosition = getAdvancePositionFunctionByMembers(
        positionStructureOrderedMembers, endPosition);
    
    var performCheck = getPerformCheckFunctionByMembersToCompare(
        positionStructureOrderedMembers, getExpectedAndActual);
    
    // Test valid positions
    
    checkMultiplePositionsInOneAssert(position, advancePosition, performCheck, assert);

    // Test invalid positions

    var negativeIndex = -1;
    var tooBigIndex = getNumPositionsByMembers(positionStructureOrderedMembers, endPosition);
    
    for (var i = 0; i < positionStructureOrderedMembers.length; ++i) {
        var illegalMember = positionStructureOrderedMembers[i];

        var negativePosition = getZeroedPositionByMembers(positionStructureOrderedMembers);
        negativePosition[illegalMember] = -1;
        
        assert.throws(
            function() { getExpectedAndActual(negativeIndex, negativePosition) },
            _jGlobals.jpipExceptions.ArgumentException,
            'Exception is expected when ' + illegalMember + ' is negative');
        
        var tooBigPosition = Object.create(endPosition);
        tooBigPosition[illegalMember] = endPosition[illegalMember];
        
        assert.throws(
            function() { getExpectedAndActual(tooBigIndex, tooBigPosition) },
            _jGlobals.jpipExceptions.ArgumentException,
            'Exception is expected when ' + illegalMember + ' is too big');
    }
}

function testAllInClassPositionsInStructure(
        positionStructureOrderedMembers,
        endPosition,
        createStructureObject,
        getInClassToPositionFunction,
        getPositionToInClassFunction,
        testedElementName) {
    QUnit.test(testedElementName + ' In-class ID to Position calculation', function(assert) {
        var structureObject = createStructureObject();
        var inClassToPosition = getInClassToPositionFunction(structureObject);
        
        function performInClassToPositionTest(inClassId, position) {
            var positionActual = inClassToPosition.call(structureObject, inClassId);
            var positionExpected = position;
            
            return {
                actual: positionActual,
                expected: positionExpected
                };
        };
        
        testAllPositionsInStructure(
            positionStructureOrderedMembers,
            endPosition,
            performInClassToPositionTest,
            assert);
        });
        
    QUnit.test(testedElementName + ' Position to In-class ID calculation', function(assert) {
        var structureObject = createStructureObject();
        var positionToInClass = getPositionToInClassFunction(structureObject);

        var performPositionToInClassTest = function(inClassId, position) {
            var inClassActual = positionToInClass.call(structureObject, position);
            var inClassExpected = inClassId;
            
            return {
                actual: inClassActual,
                expected: inClassExpected
                };
        };
        
        testAllPositionsInStructure(
            positionStructureOrderedMembers,
            endPosition,
            performPositionToInClassTest,
            assert);
        });
}

function testTileStructureSimpleAccessors(
    assert,
    tileStructure,
    //tileSizeExpected,
    paramsPerComponentExpected,
    progressionOrderExpected,
    numComponents,
    assertName) {
    
    var paramsPerComponentActual = extractTileParamsFromStructure(
        tileStructure, numComponents);
        
    assert.deepEqual(
        paramsPerComponentActual,
        paramsPerComponentExpected,
        assertName + ' (sizes per component)');
    
    var progressionOrderActual = tileStructure.getProgressionOrder();
    
    assert.deepEqual(
        progressionOrderActual,
        progressionOrderExpected,
        assertName + ' progression order');
}

function extractComponentParamsFromStructure(componentStructure) {
    var numResolutionLevels = componentStructure.getNumResolutionLevels();
    var maxCodeblockWidth = componentStructure.getMaxCodeblockWidth();
    var maxCodeblockHeight = componentStructure.getMaxCodeblockHeight();

    var precinctWidthPerLevel = new Array(numResolutionLevels);
    var precinctHeightPerLevel = new Array(numResolutionLevels);

    for (var level = 0; level < numResolutionLevels; ++level) {
        precinctWidthPerLevel[level] = componentStructure.getPrecinctWidth(level);
        precinctHeightPerLevel[level] = componentStructure.getPrecinctHeight(level);
    }
    
    var componentParams = {
        maxCodeblockWidth: maxCodeblockWidth,
        maxCodeblockHeight: maxCodeblockHeight,
        
        numResolutionLevels: numResolutionLevels,
        
        precinctWidthPerLevel: precinctWidthPerLevel,
        precinctHeightPerLevel: precinctHeightPerLevel
        };
    
    return componentParams;
}

function extractTileParamsFromStructure(tileStructure, numComponents) {
    var paramsPerComponent = new Array(numComponents);
    
    for (var component = 0; component < numComponents; ++component) {
        var componentStructure = tileStructure.getComponentStructure(component);
        var componentParams = extractComponentParamsFromStructure(componentStructure);
        paramsPerComponent[component] = componentParams;
    }
    
    var tileSize = [tileStructure.getTileWidth(), tileStructure.getTileHeight()];
    
    var isPacketHeadersNearData = tileStructure.getIsPacketHeaderNearData();
    var isStartOfPacketMarkerAllowed =
        tileStructure.getIsStartOfPacketMarkerAllowed();
    var isEndPacketHeaderMarkerAllowed =
        tileStructure.getIsEndPacketHeaderMarkerAllowed();

    var numQualityLayers = tileStructure.getNumQualityLayers();
    
    var defaultComponentStructure = tileStructure.getDefaultComponentStructure();
    var defaultComponentParams = extractComponentParamsFromStructure(defaultComponentStructure);
    
    var result = {
        isPacketHeadersNearData: isPacketHeadersNearData,
        isStartOfPacketMarkerAllowed: isStartOfPacketMarkerAllowed,
        isEndPacketHeaderMarkerAllowed: isEndPacketHeaderMarkerAllowed,
        
        numQualityLayers: numQualityLayers,

        defaultComponentParams: defaultComponentParams,
        tileSize: tileSize,
        paramsPerComponent: paramsPerComponent
        };
    
    return result;
}

function createTileParams(
    tileSize,
    numComponents,
    numResolutionLevels,
    precinctWidthLevel0,
    precinctHeightLevel0,
    numQualityLayers,
    maxCodeblockWidth,
    maxCodeblockHeight,
    componentScaleX,
    componentScaleY,
    getNextLevelSize) {
    
    maxCodeblockWidth = maxCodeblockWidth || 64;
    maxCodeblockHeight = maxCodeblockHeight || 64;
    
    var precinctWidthPerLevel = new Array(numResolutionLevels);
    var precinctHeightPerLevel = new Array(numResolutionLevels);
    
    var precinctWidth = precinctWidthLevel0;
    var precinctHeight = precinctHeightLevel0;
    
    for (var i = numResolutionLevels - 1; i >= 0; --i) {
        precinctWidthPerLevel[i] = precinctWidth;
        precinctHeightPerLevel[i] = precinctHeight;
        
        precinctWidth = getNextLevelSize(precinctWidth);
        precinctHeight = getNextLevelSize(precinctHeight);
    }
    
    var componentParams = {
        maxCodeblockWidth: maxCodeblockWidth,
        maxCodeblockHeight: maxCodeblockHeight,
        
        numResolutionLevels: precinctWidthPerLevel.length,
        
        precinctWidthPerLevel: precinctWidthPerLevel,
        precinctHeightPerLevel: precinctHeightPerLevel
        };
    
    if (componentScaleX !== undefined) {
        componentParams.scaleX = componentScaleX;
        componentParams.scaleY = componentScaleY;
    }
    
    var paramsPerComponent = new Array(numComponents);
    
    for (var i = 0; i < numComponents; ++i) {
        paramsPerComponent[i] = componentParams;
    }
    
    var result = {
        numQualityLayers: numQualityLayers,
        
        isPacketHeadersNearData: true,
        isStartOfPacketMarkerAllowed: false,
        isEndPacketHeaderMarkerAllowed: false,
        
        defaultComponentParams: componentParams,
        paramsPerComponent: paramsPerComponent,
        };
    
    if (tileSize !== null) {
        result.tileSize = tileSize;
    }
    
    return result;
}

function createUniformPrecinctCountTileParams(
    tileSize,
    numComponents,
    numResolutionLevels,
    precinctWidthLevel0,
    precinctHeightLevel0,
    numQualityLayers,
    maxCodeblockWidth,
    maxCodeblockHeight,
    componentScaleX,
    componentScaleY) {
    
    var result = createTileParams(
        tileSize,
        numComponents,
        numResolutionLevels,
        precinctWidthLevel0,
        precinctHeightLevel0,
        numQualityLayers,
        maxCodeblockWidth,
        maxCodeblockHeight,
        componentScaleX,
        componentScaleY,
        function(betterLevelPrecinctSize) { return betterLevelPrecinctSize >>> 1; }
        );
    
    return result;
}

function createUniformPrecinctSizeTileParams(
    tileSize,
    numComponents,
    numResolutionLevels,
    precinctWidthLevel0,
    precinctHeightLevel0,
    numQualityLayers,
    maxCodeblockWidth,
    maxCodeblockHeight,
    componentScaleX,
    componentScaleY) {
    
    var result = createTileParams(
        tileSize,
        numComponents,
        numResolutionLevels,
        precinctWidthLevel0,
        precinctHeightLevel0,
        numQualityLayers,
        maxCodeblockWidth,
        maxCodeblockHeight,
        componentScaleX,
        componentScaleY,
        function(betterLevelPrecinctSize) { return betterLevelPrecinctSize; }
        );
    
    return result;
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

function createEndPrecinctPosition() {
    var result = {
        tileIndex: codestreamStructureStubForTileStructureTest.getNumTilesX() * codestreamStructureStubForTileStructureTest.getNumTilesY(),
        component: codestreamStructureStubForTileStructureTest.getNumComponents(),
        
        precinctX: numPrecinctsX,
        precinctY: numPrecinctsY,
        resolutionLevel: initNumResolutionLevels
        };
    
    return result;
}