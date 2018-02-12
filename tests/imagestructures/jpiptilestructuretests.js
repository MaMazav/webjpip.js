'use strict'

QUnit.module('JpipTileStructure');

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

testAllInClassPositionsInStructure(
    ['tileIndex', 'component', 'precinctX', 'precinctY', 'resolutionLevel'],
    createEndPrecinctPosition(),
    createTileStructure,
    function (tileStructure) { return tileStructure.precinctInClassIndexToPosition; },
    function (tileStructure) { return tileStructure.precinctPositionToInClassIndex; },
    'Precinct');

QUnit.test('Illegal & unsupported progression orders', function(assert) {
    assert.throws(
        function() { createTileStructure('LRCP') },
        _jGlobals.jpipExceptions.IllegalDataException,
        'LRCP');
    
    assert.throws(
        function(assert) { createTileStructure('RLCP'); },
        _jGlobals.jpipExceptions.IllegalDataException,
        'RLCP'); 

    assert.throws(
        function() { createTileStructure('CPRL') },
        _jGlobals.j2kExceptions.UnsupportedFeatureException,
        'CPRL');
    
    assert.throws(
        function() { createTileStructure('PCRL') },
        _jGlobals.j2kExceptions.UnsupportedFeatureException,
        'PCRL');
    
    assert.throws(
        function(assert) { createTileStructure('More than 4 letters'); },
        _jGlobals.j2kExceptions.IllegalDataException,
        'Non 4-length letters'); 

    assert.throws(
        function(assert) { createTileStructure('RPPL'); },
        _jGlobals.j2kExceptions.IllegalDataException,
        'No C'); 

    assert.throws(
        function(assert) { createTileStructure('CCRL'); },
        _jGlobals.j2kExceptions.IllegalDataException,
        'No P');
        
    assert.throws(
        function(assert) { createTileStructure('PPCL'); },
        _jGlobals.j2kExceptions.IllegalDataException,
        'No R'); 
        
    assert.throws(
        function(assert) { createTileStructure('RPCC'); },
        _jGlobals.jpipExceptions.IllegalDataException,
        'No L'); 
    });

testExceptionOnUnsupportedTileParams('RPCL');

//testExceptionOnUnsupportedTileParams('PCRL');

//testExceptionOnUnsupportedTileParams('CPRL');

function testExceptionOnUnsupportedTileParams(progressionOrder) {
    
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
                _jGlobals.j2kExceptions.UnsupportedFeatureException,
                assertName);
        }
    });
}
        
function createTileStructure(progressionOrder, tileParams) {
    progressionOrder = progressionOrder || 'RPCL';
    tileParams = tileParams || initTileParams;
    
    var result = new jpipExports.JpipTileStructure(
        tileParams,
        codestreamStructureStubForTileStructureTest,
        mockFactoryForCodestreamStructureTest,
        progressionOrder);
    
    return result;
}