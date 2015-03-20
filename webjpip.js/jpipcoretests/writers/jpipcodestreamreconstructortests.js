'use strict';

QUnit.module('JpipCodestreamReconstructor');

QUnit.test('reconstructCodestream (main header data not recieved)', function(assert) {
    var noMainHeaderDatabinsSaver = createDatabinsSaverMockForReconstructorTest(
        databinStubs.notRecievedAnythingDatabinStub);
    var noMainHeaderReconstructor = createReconstructorForTest(
        noMainHeaderDatabinsSaver);

    var noMainHeaderReconstructedActual = noMainHeaderReconstructor.reconstructCodestream();
    var noMainHeaderReconstructedExpected = null;
    assert.deepEqual(
        noMainHeaderReconstructedActual,
        noMainHeaderReconstructedExpected,
        'No main header - reconstruction should fail'
        );
    });

QUnit.test('reconstructCodestream (tile header data not recieved)', function(assert) {
    var noTileHeaderDatabinsSaver = createDatabinsSaverMockForReconstructorTest();
    noTileHeaderDatabinsSaver.addTileHeaderDatabinForTest(
        1, databinStubs.notRecievedAnythingDatabinStub);
        
    var noTileHeaderReconstructor = createReconstructorForTest(
        noTileHeaderDatabinsSaver);

    var noTileHeaderReconstructedActual =
        noTileHeaderReconstructor.reconstructCodestream();
        
    var noTileHeaderReconstructedExpected = null;
    
    assert.deepEqual(
        noTileHeaderReconstructedActual,
        noTileHeaderReconstructedExpected,
        'No tile header - reconstruction should fail'
        );
    });

QUnit.test('createCodestreamForTile (main header data not recieved)', function(assert) {
    var noMainHeaderDatabinsSaver = createDatabinsSaverMockForReconstructorTest(
        databinStubs.notRecievedAnythingDatabinStub);
    var noMainHeaderReconstructor = createReconstructorForTest(
        noMainHeaderDatabinsSaver);

    var noMainHeaderReconstructedActual =
        noMainHeaderReconstructor.createCodestreamForTile(1);
        
    var noMainHeaderReconstructedExpected = null;
    
    assert.deepEqual(
        noMainHeaderReconstructedActual,
        noMainHeaderReconstructedExpected,
        'No main header - reconstruction should fail'
        );
    });

QUnit.test('createCodestreamForTile (tile header data not recieved)', function(assert) {
    var noTileHeaderDatabinsSaver = createDatabinsSaverStub(
        databinStubs.mainHeaderDatabinStub);
    var noTileHeaderReconstructor = createReconstructorForTest(
        noTileHeaderDatabinsSaver);

    var noTileHeaderReconstructedActual =
        noTileHeaderReconstructor.createCodestreamForTile(
            databinStubs.indices.tileHeaderNotRecievedMarker);
        
    var noTileHeaderReconstructedExpected = null;
    
    assert.deepEqual(
        noTileHeaderReconstructedActual,
        noTileHeaderReconstructedExpected,
        'No tile header - reconstruction should fail'
        );
    });

QUnit.test('reconstructCodestream (JPP not supported)', function(assert) {
    var databinsSaverJPT = {
        getIsJpipTilePartStream: function() { return true; },
        getMainHeaderDatabin: function() { return databinStubs.mainHeaderDatabinStub; },
        getTileHeaderDatabin: function() { return databinStubs.emptyDatabinStub; }
        };
    var reconstructorJPT = createReconstructorForTest(databinsSaverJPT);
    
    assert.throws(
        function() { reconstructorJPT.reconstructCodestream(); },
        jpipExceptions.UnsupportedFeatureException,
        'JPT throws a not supported exception'
        );
    });

QUnit.test('reconstructCodestream (simple reconstruction)', function(assert) {
    var reconstructor = createReconstructorForTest();
        
    var fullReconstructedExpected = getFullReconstructedExpected();
    var fullReconstructedActual = reconstructor.reconstructCodestream();
    assert.deepEqual(
        fullReconstructedActual, fullReconstructedExpected, 'reconstructCodestream');
    });
    
QUnit.test('createCodestreamForTile (simple reconstruction)', function(assert) {
    var reconstructor = createReconstructorForTest();
        
    var singleTileReconstructedExpected = getSingleTileReconstructedExpected();
    var tileReconstructedActual = reconstructor.createCodestreamForTile(1);
    assert.deepEqual(
        tileReconstructedActual, singleTileReconstructedExpected, 'createCodestreamForTile');
    });

QUnit.test('createCodestreamForTile (with resolution levels to cut)', function(assert) {
    var dummyProgressionOrder = 'Dummy progression order';
    var databinsSaverMock = createDatabinsSaverMockForReconstructorTest();
    var codestreamStructureMock = createCodestreamStructureMockForReconstructorTest(
        dummyProgressionOrder);
    var modifier = createModifierForReconstructorTest(databinsSaverMock);
    var layersManagerStub = createLayersManagerStubForReconstructorTest(
        codestreamStructureMock, databinsSaverMock);
    
    var reconstructor = new JpipCodestreamReconstructor(
        codestreamStructureMock,
        databinsSaverMock,
        modifier,
        layersManagerStub);
        
    var numResolutionLevels = 2;

    var singleTileReconstructedExpected = getSingleTileReconstructedExpected();
    var tileReconstructedActual = reconstructor.createCodestreamForTile(
        1, numResolutionLevels);
    assert.deepEqual(
        tileReconstructedActual, singleTileReconstructedExpected, 'createCodestreamForTile');
        
    var numResolutionLevelsToCutExpected = numResolutionLevels;
    var numResolutionLevelsToCutActual = modifier.numResolutionLevelsToCutArgumentForTest;
    assert.deepEqual(
        numResolutionLevelsToCutActual,
        numResolutionLevelsToCutExpected,
        'Correctness of numResolutionLevelsToCut argument passed to modifier');
    });

QUnit.test('reconstructCodestream (precinct data not recieved)', function(assert) {
    var noPrecinctDatabinsSaver = createDatabinsSaverMockForReconstructorTest();
    noPrecinctDatabinsSaver.addPrecinctDatabinForTest(
        1, databinStubs.notRecievedAnythingDatabinStub);
        
    var noPrecinctReconstructor = createReconstructorForTest(
        noPrecinctDatabinsSaver);
                    
    var noPrecinctReconstructedActual =
        noPrecinctReconstructor.reconstructCodestream(/*minNumQualityLayers=*/0);
            
    var noPrecinctReconstructedExpected =
        getFullReconstructedExpectedWithEmptyPrecinctExpected();
    
    assert.deepEqual(
        noPrecinctReconstructedActual,
        noPrecinctReconstructedExpected,
        'No precinct data - reconstruction should succeed with empty packets'
        );
    });

QUnit.test('createCodestreamForTile (precinct data not recieved)', function(assert) {
    var noPrecinctDatabinsSaver = createDatabinsSaverMockForReconstructorTest();
    noPrecinctDatabinsSaver.addPrecinctDatabinForTest(
        1, databinStubs.notRecievedAnythingDatabinStub);
    
    var noPrecinctReconstructor = createReconstructorForTest(
        noPrecinctDatabinsSaver);

    var noPrecinctReconstructedActual =
        noPrecinctReconstructor.createCodestreamForTile(1);
        
    var noPrecinctReconstructedExpected =
        getSingleTileReconstructedWithEmptyPrecinctExpected();
    
    assert.deepEqual(
        noPrecinctReconstructedActual,
        noPrecinctReconstructedExpected,
        'Missing precinct - empty precinct should be added'
        );
    });