'use strict';

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
            jpipExceptions.ArgumentException,
            'Exception is expected when ' + illegalMember + ' is negative');
        
        var tooBigPosition = Object.create(endPosition);
        tooBigPosition[illegalMember] = endPosition[illegalMember];
        
        assert.throws(
            function() { getExpectedAndActual(tooBigIndex, tooBigPosition) },
            jpipExceptions.ArgumentException,
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