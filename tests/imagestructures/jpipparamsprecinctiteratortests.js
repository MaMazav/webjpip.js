'use strict'

QUnit.module('JpipParamsPrecinctIterator');

QUnit.test(
    'Create JpipParamsPrecinctIterator InternalErrorException on illegal level',
    function(assert) {
        var tileStructure = createTileStructure(initProgressionOrder);
        
        assert.throws(
            function() {
                var iterator = createParamsPrecinctIterator(
                    /*tileIndex=*/0,
                    /*codestreamPartParams=*/ { level: initNumResolutionLevels },
                    initProgressionOrder);
                
                iterator.tryAdvance();
            },
            _jGlobals.jpipExceptions.InternalErrorException,
            'Too large level, exception is expected');
    });

testProgressionOrderForUniformPrecinctCount(
    ['component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL');

testProgressionOrderForUniformPrecinctCount(
    ['component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL',
    /*level=*/1);

//testProgressionOrderForUniformPrecinctCount(
//    ['tileIndex', 'resolutionLevel', 'component', 'precinctX', 'precinctY'],
//    'PCRL');

//testProgressionOrderForUniformPrecinctCount(
//    ['tileIndex', 'resolutionLevel', 'precinctX', 'precinctY', 'component'],
//    'CPRL');

testProgressionOrderForNonUniformStructure(
    ['component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL');

testProgressionOrderForNonUniformStructure(
    ['component', 'precinctX', 'precinctY', 'resolutionLevel'],
    'RPCL',
    /*level=*/1);

//testProgressionOrderForNonUniformStructure(
//    ['tileIndex', 'resolutionLevel', 'component', 'precinctX', 'precinctY'],
//    'PCRL');

//testProgressionOrderForNonUniformStructure(
//    ['tileIndex', 'resolutionLevel', 'precinctX', 'precinctY', 'component'],
//    'CPRL');

function testProgressionOrderForNonUniformStructure(
    positionStructureOrderedMembers, progressionOrder, level) {
    
    var tileParamsArray = prepareCreationParamsForNonUniformTest(progressionOrder);
        
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
            
        if (level !== undefined) {
            endPrecinctInTile.resolutionLevel -= level;
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
            level);
        
        levelsAndPrecinctCounts = null;
    }
}

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
    positionStructureOrderedMembers, progressionOrder, level) {
    
    var endPrecinctInTile = createEndPrecinctPosition();
    endPrecinctInTile.tileIndex = 1;
    if (level !== undefined) {
        endPrecinctInTile.resolutionLevel -= level;
    }

    var advanceExpectedPositionFunction = getAdvancePositionFunctionByMembers(
        positionStructureOrderedMembers, endPrecinctInTile);
    
    testProgressionOrder(
        progressionOrder,
        advanceExpectedPositionFunction,
        initTileParams,
        'uniform precinct count',
        level);
}

function testProgressionOrder(
    progressionOrder,
    advanceExpectedPositionFunction,
    sizeParams,
    testNameSuffix,
    level) {
    
    QUnit.test(
        progressionOrder + ' progression order, codestreamPart = all tile, ' +
            testNameSuffix,
        function(assert) {
            var index = 0;
            var precinctPositionToIterateManually = createFirstPrecinctPosition();
            
            var allTileCodestreamPartParams = {
                level: level,
                minX: codestreamStructureStubForTileStructureTest.getTileLeft(),
                minY: codestreamStructureStubForTileStructureTest.getTileTop(),
                maxXExclusive: codestreamStructureStubForTileStructureTest.getTileLeft() + sizeParams.tileSize[0],
                maxYExclusive: codestreamStructureStubForTileStructureTest.getTileTop() + sizeParams.tileSize[1]
                };

            var iterator = createParamsPrecinctIterator(
                precinctPositionToIterateManually.tileIndex,
                allTileCodestreamPartParams,
                progressionOrder,
                sizeParams);
            
            function performProgressionOrderCheck(sequenceNumber, precinctPositionExpected) {
                if (sequenceNumber !== index++) {
                    throw 'Unexpected sequence number in progression order test. Fix test';
                }
                
                if (!iterator.tryAdvance()) {
                    throw 'End precinct has been reached too early';
                }
                
                var result = {
                    actual: {
                        component: iterator.component,
                        precinctX: iterator.precinctX,
                        precinctY: iterator.precinctY,
                        resolutionLevel: iterator.resolutionLevel,
                    },
                    expected: precinctPositionExpected
                    };
                
                return result;
            };
            
            var membersToCompare = ['component', 'precinctX', 'precinctY', 'resolutionLevel'];
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
}

function createFirstPrecinctPosition() {
    var result = {
        component: 0,
        
        precinctX: 0,
        precinctY: 0,
        resolutionLevel: 0
        };
    
    return result;
}

function createParamsPrecinctIterator(
    tileIndex,
    codestreamPartParams,
    progressionOrder,
    tileParams,
    isIteratePrecinctsNotInCodestreamPart) {
    
    progressionOrder = progressionOrder || 'RPCL';
    tileParams = tileParams || initTileParams;
   
    var tileStructure = new JpipTileStructureStub(
        tileParams,
        codestreamStructureStubForTileStructureTest,
        progressionOrder);
        
    var iterator = new jpipExports.JpipParamsPrecinctIterator(
        codestreamStructureStubForTileStructureTest,
        tileStructure,
        tileIndex,
        codestreamPartParams,
        isIteratePrecinctsNotInCodestreamPart);

    return iterator;
}