'use strict';

QUnit.module('JpipCodestreamReconstructor');

QUnit.test('createCodestream (some tiles, main header data not recieved)', function(assert) {
    var noMainHeaderDatabinsSaver = createDatabinsSaverMockForReconstructorTest(
        databinStubs.notRecievedAnythingDatabinStub);
    var noMainHeaderReconstructor = createReconstructorForTest(
        noMainHeaderDatabinsSaver);
    var codestreamPartStub = new JpipCodestreamPartStub([0, 1, 2]);

    var noMainHeaderReconstructedActual =
        noMainHeaderReconstructor.createCodestream(
            codestreamPartStub);
    var noMainHeaderReconstructedExpected = null;
    assert.deepEqual(
        noMainHeaderReconstructedActual,
        noMainHeaderReconstructedExpected,
        'No main header - reconstruction should fail'
        );
    });

QUnit.test('createCodestream (some tiles, one tile header data not recieved)', function(assert) {
    var noTileHeaderDatabinsSaver = createDatabinsSaverMockForReconstructorTest();
    noTileHeaderDatabinsSaver.addTileHeaderDatabinForTest(
        1, databinStubs.notRecievedAnythingDatabinStub);
        
    var noTileHeaderReconstructor = createReconstructorForTest(
        noTileHeaderDatabinsSaver);
    var codestreamPartStub = new JpipCodestreamPartStub([0, 1, 2]);

    var noTileHeaderReconstructedActual =
        noTileHeaderReconstructor.createCodestream(codestreamPartStub);
        
    var noTileHeaderReconstructedExpected = null;
    
    assert.deepEqual(
        noTileHeaderReconstructedActual,
        noTileHeaderReconstructedExpected,
        'No tile header - reconstruction should fail'
        );
    });

QUnit.test('createCodestream (single tile, main header data not recieved)', function(assert) {
    var noMainHeaderDatabinsSaver = createDatabinsSaverMockForReconstructorTest(
        databinStubs.notRecievedAnythingDatabinStub);
    var noMainHeaderReconstructor = createReconstructorForTest(
        noMainHeaderDatabinsSaver);
    var codestreamPartStub = new JpipCodestreamPartStub([1]);

    var noMainHeaderReconstructedActual =
        noMainHeaderReconstructor.createCodestream(codestreamPartStub);
        
    var noMainHeaderReconstructedExpected = null;
    
    assert.deepEqual(
        noMainHeaderReconstructedActual,
        noMainHeaderReconstructedExpected,
        'No main header - reconstruction should fail'
        );
    });

QUnit.test('createCodestream (single tile, tile header data not recieved)', function(assert) {
    var noTileHeaderDatabinsSaver = createDatabinsSaverStub(
        databinStubs.mainHeaderDatabinStub);
    var noTileHeaderReconstructor = createReconstructorForTest(
        noTileHeaderDatabinsSaver);
    var codestreamPartStub = new JpipCodestreamPartStub([
        databinStubs.indices.tileHeaderNotRecievedMarker]);

        var noTileHeaderReconstructedActual =
        noTileHeaderReconstructor.createCodestream(
            codestreamPartStub);
        
    var noTileHeaderReconstructedExpected = null;
    
    assert.deepEqual(
        noTileHeaderReconstructedActual,
        noTileHeaderReconstructedExpected,
        'No tile header - reconstruction should fail'
        );
    });

QUnit.test('createCodestream (JPP not supported)', function(assert) {
    var databinsSaverJPT = {
        getIsJpipTilePartStream: function() { return true; },
        getMainHeaderDatabin: function() { return databinStubs.mainHeaderDatabinStub; },
        getTileHeaderDatabin: function() { return databinStubs.emptyDatabinStub; }
        };
    var reconstructorJPT = createReconstructorForTest(databinsSaverJPT);
    var codestreamPartStub = { level: 0 };
    
    assert.throws(
        function() { reconstructorJPT.createCodestream(codestreamPartStub); },
        _jGlobals.jpipExceptions.UnsupportedFeatureException,
        'JPT throws a not supported exception'
        );
    });

QUnit.test('createCodestream (some tiles, simple reconstruction)', function(assert) {
    var reconstructor = createReconstructorForTest();
        
    var fullReconstructedExpected = getFullReconstructedExpected();
    var codestreamPartStub = new JpipCodestreamPartStub([0, 1, 2]);
    var fullReconstructedActual = reconstructor.createCodestream(codestreamPartStub);
    var fullReconstructedActualAsArray = Array.from(fullReconstructedActual);
    assert.deepEqual(
        fullReconstructedActualAsArray, fullReconstructedExpected, 'createCodestream');
    });
    
QUnit.test('createCodestream (single tile, simple reconstruction)', function(assert) {
    var reconstructor = createReconstructorForTest();
        
    var singleTileReconstructedExpected = getSingleTileReconstructedExpected();
    var codestreamPartStub = new JpipCodestreamPartStub([1]);
    var tileReconstructedActual = reconstructor.createCodestream(codestreamPartStub);
    var tileReconstructedActualAsArray = Array.from(tileReconstructedActual);
    assert.deepEqual(
        tileReconstructedActualAsArray, singleTileReconstructedExpected, 'createCodestream');
    });

QUnit.test('createCodestream (single tile, with resolution levels to cut)', function(assert) {
    var dummyProgressionOrder = 'Dummy progression order';
    var databinsSaverMock = createDatabinsSaverMockForReconstructorTest();
    var codestreamStructureMock = createCodestreamStructureMockForReconstructorTest(
        dummyProgressionOrder);
    var modifier = createModifierForReconstructorTest(databinsSaverMock);
    var layersManagerStub = createLayersManagerStubForReconstructorTest(
        codestreamStructureMock, databinsSaverMock);
    
    var reconstructor = new jpipExports.JpipCodestreamReconstructor(
        databinsSaverMock,
        modifier,
        layersManagerStub);
        
    var numResolutionLevels = 2;

    var singleTileReconstructedExpected = getSingleTileReconstructedExpected();
    var codestreamPartStub = new JpipCodestreamPartStub([1], numResolutionLevels);
    var tileReconstructedActual = reconstructor.createCodestream(
        codestreamPartStub);
    var tileReconstructedActualAsArray = Array.from(tileReconstructedActual);
    assert.deepEqual(
        tileReconstructedActualAsArray, singleTileReconstructedExpected, 'createCodestream');
        
    var levelExpected = numResolutionLevels;
    var levelActual = modifier.levelArgumentForTest;
    assert.deepEqual(
        levelActual,
        levelExpected,
        'Correctness of level argument passed to modifier');
    });

QUnit.test('createCodestream (some tiles, precinct data not recieved)', function(assert) {
    var noPrecinctDatabinsSaver = createDatabinsSaverMockForReconstructorTest();
    noPrecinctDatabinsSaver.addPrecinctDatabinForTest(
        1, databinStubs.notRecievedAnythingDatabinStub);
        
    var noPrecinctReconstructor = createReconstructorForTest(
        noPrecinctDatabinsSaver);
    var codestreamPartStub = new JpipCodestreamPartStub([0, 1, 2], 0, /*minNumQualityLayers=*/0);

    var noPrecinctReconstructedActual =
        noPrecinctReconstructor.createCodestream(codestreamPartStub);
            
    var noPrecinctReconstructedExpected =
        getFullReconstructedExpectedWithEmptyPrecinctExpected();
    
    var noPrecinctReconstructedActualAsArray =
        Array.from(noPrecinctReconstructedActual);
    
    assert.deepEqual(
        noPrecinctReconstructedActualAsArray,
        noPrecinctReconstructedExpected,
        'No precinct data - reconstruction should succeed with empty packets'
        );
    });

QUnit.test('createCodestream (single tile, precinct data not recieved)', function(assert) {
    var noPrecinctDatabinsSaver = createDatabinsSaverMockForReconstructorTest();
    noPrecinctDatabinsSaver.addPrecinctDatabinForTest(
        1, databinStubs.notRecievedAnythingDatabinStub);
    
    var noPrecinctReconstructor = createReconstructorForTest(
        noPrecinctDatabinsSaver);
    var codestreamPartStub = new JpipCodestreamPartStub([1], 0, /*minNumQualityLayers=*/0);

    var noPrecinctReconstructedActual =
        noPrecinctReconstructor.createCodestream(codestreamPartStub);
        
    var noPrecinctReconstructedExpected =
        getSingleTileReconstructedWithEmptyPrecinctExpected();
    
    var noPrecinctReconstructedActualAsArray =
        Array.from(noPrecinctReconstructedActual);
    
    assert.deepEqual(
        noPrecinctReconstructedActualAsArray,
        noPrecinctReconstructedExpected,
        'Missing precinct - empty precinct should be added'
        );
    });