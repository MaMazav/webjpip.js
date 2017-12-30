'use strict';

function clearForCodestreamClientTest() {
    mockFactoryForCodestreamClientTest.reconnectableRequester.clearForTest();
    //mockFactoryForCodestreamTest.codestreamReconstructor.clearForTest();
}

function createCodestreamForTest(options) {
    var client = new jpipExports.JpipImage(options);
    return client;
}

//function testGetCodestreamForTile(
//    assert,
//    codestreamForTileActual,
//    tileX,
//    tileY,
//    level,
//    requesterNotCalled,
//    reconstructorNotCalled) {
//    
//    if (level !== undefined) {
//        level = +level;
//    }
//    
//    var factory = mockFactoryForCodestreamTest;
//
//    var requestTileArgsActual = factory.requester.requestTileArgsForTest;
//    var createCodestreamArgsActual =
//        factory.codestreamReconstructor.lastCreateCodestreamForTileArgs;
//    
//    var codestreamForTileExpected;
//    var createCodestreamArgsExpected;
//    var requestTileArgsExpected;
//    
//    if (reconstructorNotCalled) {
//        codestreamForTileExpected = undefined; // No parameter for callback
//        createCodestreamArgsExpected = null;
//    } else {
//        codestreamForTileExpected = factory.codestreamReconstructor.resultForTest;
//        createCodestreamArgsExpected = {
//            tileIndex: (+tileX) + (+tileY) * factory.codestreamStructure.getNumTilesX(),
//            level: level
//        };
//    }
//    
//    if (requesterNotCalled) {
//        requestTileArgsExpected = null;
//    } else {
//        requestTileArgsExpected = {
//            tileParams: {
//                minTileX: +tileX,
//                minTileY: +tileY,
//                maxTileXExclusive: +tileX + 1,
//                maxTileYExclusive: +tileY + 1,
//                level: level,
//                quality: undefined
//            }
//            };
//    }
//    
//    assert.deepEqual(
//        codestreamForTileActual,
//        codestreamForTileExpected,
//        'Returns correct codestream result');
//    
//    assert.deepEqual(
//        createCodestreamArgsActual,
//        createCodestreamArgsExpected,
//        'Correctness of arguments passed to codestreamReconstructor');
//    
//    assert.propEqual(
//        requestTileArgsActual,
//        requestTileArgsExpected,
//        'Correctness of arguments passed to requester');
//}

//function testSynchronousOperations(
//    tileX, tileY, level, testNameSuffix) {
//    
//    if (testNameSuffix === undefined) {
//        testNameSuffix = '';
//    }
//    
//    QUnit.test('getCodestreamForTile synchronously' + testNameSuffix, function(assert) {
//        clearForCodestreamClientTest();
//        var client = createCodestreamForTest();
//        
//        var codestreamForTileActual = client.getCodestreamForTile(
//            tileX, tileY, level);
//
//        testGetCodestreamForTile(
//            assert, codestreamForTileActual, tileX, tileY, level);
//        
//        var pendingCallbackActual =
//            mockFactoryForCodestreamTest.requester.requestTileCallbackForTest;
//        var pendingCallbackExpected = null;
//        assert.deepEqual(
//            pendingCallbackActual,
//            pendingCallbackExpected,
//            'no callback should be passed to requester');
//
//        clearForCodestreamClientTest();
//        });
//
//    QUnit.test('onlyRequestTile synchronously' + testNameSuffix, function(assert) {
//        clearForCodestreamClientTest();
//
//        var client = createCodestreamForTest();
//        
//        var codestreamForTileActual = client.onlyRequestTile({
//            minTileX: tileX,
//            minTileY: tileY,
//            level: level
//            });
//
//        testGetCodestreamForTile(
//            assert,
//            codestreamForTileActual,
//            tileX,
//            tileY,
//            level,
//            /*requesterNotCalled=*/false,
//            /*reconstructorNotCalled=*/true);
//        
//        var pendingCallbackActual =
//            mockFactoryForCodestreamTest.requester.requestTileCallbackForTest;
//        var pendingCallbackExpected = null;
//        assert.deepEqual(
//            pendingCallbackActual,
//            pendingCallbackExpected,
//            'no callback should be passed to requester');
//
//        clearForCodestreamClientTest();
//        });
//
//    QUnit.test('onlyCreateCodestreamForTile correctness' + testNameSuffix, function(assert) {
//        clearForCodestreamClientTest();
//        var client = createCodestreamForTest();
//        
//        var codestreamForTileActual = client.onlyCreateCodestreamForTile(
//            tileX, tileY, level);
//
//        testGetCodestreamForTile(
//            assert,
//            codestreamForTileActual,
//            tileX,
//            tileY,
//            level,
//            /*requesterNotCalled=*/true,
//            /*reconstructorNotCalled=*/false);
//        
//        var pendingCallbackActual =
//            mockFactoryForCodestreamTest.requester.requestTileCallbackForTest;
//        var pendingCallbackExpected = null;
//        assert.deepEqual(
//            pendingCallbackActual,
//            pendingCallbackExpected,
//            'no callback should be passed to requester');
//
//        clearForCodestreamClientTest();
//        });
//}

function testStatusCallback(
    exceptionGenerator, performChangeStatusOperation, expectedStatus) {
    
    QUnit.test('Status callback on ' + exceptionGenerator, function(assert) {
        clearForCodestreamClientTest();

        var client = createCodestreamForTest();
        
        var lastStatus = status;
        var callbackCallsCount = 0;
        
        var callbackMock = function callbackMock(status) {
            ++callbackCallsCount;
            lastStatus = status;
        };
            
        client.setStatusCallback(callbackMock);
        
        performChangeStatusOperation(client, assert);

        var callbackCallsCountActual = callbackCallsCount;
        var callbackCallsCountExpected = 1;
        assert.deepEqual(
            callbackCallsCountActual,
            callbackCallsCountExpected,
            'callback calls count after status change');
        
        var lastStatusActual = lastStatus;
        var lastStatusExpected = expectedStatus;
        assert.deepEqual(
            lastStatusActual, lastStatusExpected, 'status value given by callback');
        
        client.setStatusCallback(null);
        
        performChangeStatusOperation(client, assert);
        
        var callbackCallsCountAfterRemoveCallbackActual = callbackCallsCount;
        var callbackCallsCountAfterRemoveCallbackExpected = callbackCallsCountExpected;
        assert.deepEqual(
            callbackCallsCountAfterRemoveCallbackActual,
            callbackCallsCountAfterRemoveCallbackExpected,
            'No callback call is expected after removing callback');

        clearForCodestreamClientTest();
        });
}

function testNaNParams(params, progressiveness) {
    QUnit.test(
        'NaN parameters exception (minX=' + params.minX + ', minY=' + params.minY +
            'maxXExclusive=' + params.maxXExclusive + ', maxYExclusive=' +
            params.maxYExclusive + ', level=' +
            params.level + ', quality=' +
            params.quality + ', progressiveness=' + progressiveness,
        function(assert) {
            var client = createCodestreamForTest();
            
            assert.throws(
                function createIllegalParamsCall() {
                    client.createImageDataContext(params);
                },
                _jGlobals.jpipExceptions.ArgumentException,
                'createImageDataContext expected to throw exception');
        });
}

var dummyExceptionForCodestreamClientTest =
    'Dummy reconstruction exception, should be internally caught ' +
    'codestreamClient implementation. Fix implementation';

function testCreateImageDataContext(
    testName,
    codestreamPartParams,
    useCachedDataOnly,
    expectedCodestreamPartParamsAfterModify,
    expectedProgressivenessAfterModify) {
    
    QUnit.test('createImageDataContext: ' + testName, function(assert) {
        clearForCodestreamClientTest();
        
        var callback = 'dummy callback';
        var userContextVars = 'dummy user context vars';
        
        var jpipObjects = {
            requester: mockFactoryForCodestreamClientTest.reconnectableRequester,
            reconstructor: dummyObjectsForCodestreamTest.codestreamReconstructor,
            packetsDataCollector: dummyObjectsForCodestreamTest.packetsDataCollector,
            qualityLayersCache: dummyObjectsForCodestreamTest.qualityLayersCache,
            };
        
        mockFactoryForCodestreamClientTest.createImageDataContext(
            jpipObjects,
            expectedCodestreamPartParamsAfterModify,
            //callback,
            expectedProgressivenessAfterModify);
            //{
            //    useCachedDataOnly: useCachedDataOnly,
            //    isMovable: false,
            //    userContextVars: userContextVars
            //});
        
        var imageDataContextExpected = mockFactoryForCodestreamClientTest.imageDataContext;
        var imageDataContextArgsExpected =
            mockFactoryForCodestreamClientTest.imageDataContextArgs;
        
        mockFactoryForCodestreamClientTest.imageDataContextArgs = null;
        
        var client = createCodestreamForTest();

        // Act
        
        var imageDataContextActual = client.createImageDataContext(
            codestreamPartParams, {
                useCachedDataOnly: useCachedDataOnly,
                disableProgressiveness: true
            });
            
        var imageDataContextArgsActual =
            mockFactoryForCodestreamClientTest.imageDataContextArgs;
        
        // Assert
        
        assert.deepEqual(
            imageDataContextActual,
            imageDataContextExpected,
            'Correctness of returned imageDataContext object');
        
        assert.deepEqual(
            imageDataContextArgsActual,
            imageDataContextArgsExpected,
            'Correctness of arguments passed to imageDataContext c`tor');

        clearForCodestreamClientTest();
    });
}

QUnit.module('JpipCodestreamClient');

var simpleCodestreamPart = {
    minX: 120, maxXExclusive: 141,
    minY: 101, maxYExclusive: 189,
    level: 3
    };

var expectedModifiedSimpleCodestreamPart = JSON.parse(JSON.stringify(
    simpleCodestreamPart));
//expectedModifiedSimpleCodestreamPart.level = undefined;
expectedModifiedSimpleCodestreamPart.quality = undefined;

var expectedSimpleProgressiveness = [ { minNumQualityLayers: 'max' } ];

testCreateImageDataContext(
    'Simple codestreamPartParams and progressiveness',
    simpleCodestreamPart,
    /*useCachedDataOnly=*/false,
    expectedModifiedSimpleCodestreamPart,
    expectedSimpleProgressiveness);

var codestreamPartWithUndefinedLevels = JSON.parse(
    JSON.stringify(simpleCodestreamPart));
codestreamPartWithUndefinedLevels.level =
    undefined;

var expectedModifiedCodestreamPartWithUndefinedLevels =
    JSON.parse(JSON.stringify(expectedModifiedSimpleCodestreamPart));
expectedModifiedCodestreamPartWithUndefinedLevels.level =
    undefined;
expectedModifiedCodestreamPartWithUndefinedLevels.quality =
    undefined;

testCreateImageDataContext(
    'level = undefined',
    codestreamPartWithUndefinedLevels,
    /*useCachedDataOnly=*/false,
    expectedModifiedCodestreamPartWithUndefinedLevels,
    expectedSimpleProgressiveness);

var codestreamPartStrings = {
    minX: '120', maxXExclusive: '141',
    minY: '101', maxYExclusive: '189',
    level: '3'
    };

testCreateImageDataContext(
    'codestreamPartParams\' properties are strings',
    codestreamPartStrings,
    /*useCachedDataOnly=*/false,
    expectedModifiedSimpleCodestreamPart,
    expectedSimpleProgressiveness);

testStatusCallback(
    'requester status change',
    function(client, assert) {
        mockFactoryForCodestreamClientTest.reconnectableRequester.callStatusCallbackForTest(
            'dummy isReady', dummyExceptionForCodestreamClientTest);
    },
    /*expectedStatus=*/ {
        isReady: 'dummy isReady',
        exception: dummyExceptionForCodestreamClientTest
    });

//testStatusCallback(
//    'exception on reconstruction',
//    
//    function(client, assert) {
//        jpipCodestreamReconstructorMock.exceptionOnNextCreateCodestreamForTest =
//            dummyExceptionForCodestreamClientTest;
//        
//        var isMockCallbackCalled = false;
//        function mockCallback() {
//            isMockCallbackCalled = true;
//        }
//        
//        client.getCodestreamForTile(1, 0, 2, 3, mockCallback);
//        
//        mockFactoryForCodestreamTest.requester.callRequestTileCallbackForTest();
//        
//        assert.ok(!isMockCallbackCalled, 'Callback should not be called on exception');
//    },
//    /*expectedStatus=*/ {
//        isReady: true,
//        exception: dummyExceptionForCodestreamClientTest
//        }
//    );

//testSynchronousOperations(
//    /*tileX=*/2,
//    /*tileY=*/0,
//    /*level=*/2);
//
//testSynchronousOperations(
//    /*tileX=*/'2',
//    /*tileY=*/'0',
//    /*level=*/'2',
//    ' (string parameters)');
//
//testSynchronousOperations(
//    /*tileX=*/'2',
//    /*tileY=*/'0',
//    /*level=*/undefined,
//    ' (string parameters and undefined level)');

testNaNParams({
    minX: 2, maxXExclusive: 4,
    minY: 5, maxYExclusive: 6,
    level: NaN
    });

testNaNParams({
    minX: NaN, maxXExclusive: 4,
    minY: 10, maxYExclusive: 20,
    level: 1
    });

testNaNParams({
    minX: 2, maxXExclusive: 4,
    minY: NaN, maxYExclusive: 20,
    level: 1
    });

testNaNParams({
    minX: 2, maxXExclusive: 4,
    minY: 5, maxYExclusive: 20,
    level: 'dummy'
    });

testNaNParams({
    minX: 'dummy', maxXExclusive: 4,
    minY: 5, maxYExclusive: 20,
    level: 0
    });

testNaNParams({
    minX: 2, maxXExclusive: 4,
    minY: 'dummy', maxYExclusive: 20,
    level: 1
    });

testNaNParams({
    minX: undefined, maxXExclusive: 4,
    minY: 5, maxYExclusive: 20,
    level: 2
    });

testNaNParams({
    minX: 2, maxXExclusive: 4,
    minY: undefined, maxYExclusive: 20,
    level: 3
    });

QUnit.test('Objects creation arguments', function(assert) {
    clearForCodestreamClientTest();

    var factory = mockFactoryForCodestreamClientTest;
    
    //var codestreamReconstructor = factory.codestreamReconstructor;
    var codestreamStructure = factory.codestreamStructure;
    var databinsSaver = factory.databinsSaver;
    
    var progressionOrder = 'RPCL';
    var isJpipTilepartStream = false;
    
    var dummy = dummyObjectsForCodestreamTest;
    var options = {
        maxChannelsInSession: 'dummyMaxChannels',
        maxRequestsWaitingForResponseInChannel: 'maxWaitingRequests'
    };
    
    factory.createReconnectableRequester(
        options.maxChannelsInSession,
        options.maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaver);
    factory.createCodestreamReconstructor(
        codestreamStructure,
        databinsSaver,
        dummy.headerModifier,
        dummy.qualityLayersCache);
    factory.createCodestreamStructure(dummy.structureParser, progressionOrder);
    factory.createDatabinsSaver(isJpipTilepartStream);
    factory.createHeaderModifier(
        codestreamStructure, dummy.offsetsCalculator, progressionOrder);
    factory.createMarkersParser(dummy.mainHeaderDatabin);
    factory.createOffsetsCalculator(dummy.mainHeaderDatabin, dummy.markersParser);
    factory.createStructureParser(
        databinsSaver, dummy.markersParser, dummy.offsetsCalculator);
    factory.createQualityLayersCache(codestreamStructure);
    factory.createPacketsDataCollector(
        codestreamStructure, databinsSaver, dummy.qualityLayersCache);
    
    var reconnectableRequesterArgsExpected = factory.reconnectableRequesterArgs;
    var codestreamReconstructorArgsExpected = factory.codestreamReconstructorArgs;
    var codestreamStructureArgsExpected = factory.codestreamStructureArgs;
    var databinsSaverArgsExpected = factory.databinsSaverArgs;
    var headerModifierArgsExpected = factory.headerModifierArgs;
    var markersParserArgsExpected = factory.markersParserArgs;
    var offsetsCalculatorArgsExpected = factory.offsetsCalculatorArgs;
    var structureParserArgsExpected = factory.structureParserArgs;
    var qualityLayersCacheArgsExpected = factory.qualityLayersCacheArgs;
    var packetsDataCollectorArgsExpected = factory.packetsDataCollectorArgs;

    createCodestreamForTest(options);
    
    var reconnectableRequesterArgsActual = factory.reconnectableRequesterArgs;
    var codestreamReconstructorArgsActual = factory.codestreamReconstructorArgs;
    var codestreamStructureArgsActual = factory.codestreamStructureArgs;
    var databinsSaverArgsActual = factory.databinsSaverArgs;
    var headerModifierArgsActual = factory.headerModifierArgs;
    var markersParserArgsActual = factory.markersParserArgs;
    var offsetsCalculatorArgsActual = factory.offsetsCalculatorArgs;
    var structureParserArgsActual = factory.structureParserArgs;
    var qualityLayersCacheArgsActual = factory.qualityLayersCacheArgs;
    var packetsDataCollectorArgsActual = factory.packetsDataCollectorArgs;

    assert.deepEqual(
        reconnectableRequesterArgsActual,
        reconnectableRequesterArgsExpected,
        'reconnectableRequester arguments');
    
    assert.deepEqual(
        codestreamReconstructorArgsActual,
        codestreamReconstructorArgsExpected,
        'codestreamReconstructor arguments');

    assert.deepEqual(
        codestreamStructureArgsActual,
        codestreamStructureArgsExpected,
        'codestreamStructure arguments');

    assert.deepEqual(
        databinsSaverArgsActual,
        databinsSaverArgsExpected,
        'databinsSaver arguments');

    assert.deepEqual(
        headerModifierArgsActual,
        headerModifierArgsExpected,
        'headerModifier arguments');

    assert.deepEqual(
        markersParserArgsActual,
        markersParserArgsExpected,
        'markersParser arguments');

    assert.deepEqual(
        offsetsCalculatorArgsActual,
        offsetsCalculatorArgsExpected,
        'offsetsCalculator arguments');

    assert.deepEqual(
        structureParserArgsActual,
        structureParserArgsExpected,
        'structureParser arguments');

    assert.deepEqual(
        qualityLayersCacheArgsActual,
        qualityLayersCacheArgsExpected,
        'qualityLayersCache arguments');

    assert.deepEqual(
        packetsDataCollectorArgsActual,
        packetsDataCollectorArgsExpected,
        'packetsDataCollector arguments');

    clearForCodestreamClientTest();
    });

QUnit.test('close', function(assert) {
    clearForCodestreamClientTest();

    var client = createCodestreamForTest();
    client.close();
    
    var closeCallsExpected = 1;
    var closeCallsActual = mockFactoryForCodestreamClientTest.reconnectableRequester.closeCallsForTest;
    assert.deepEqual(
        closeCallsActual, closeCallsExpected, 'Count of reconnectableRequester.close calls');

    clearForCodestreamClientTest();
    });

QUnit.test('getSizesParams before reconnectableRequester ready', function(assert) {
    clearForCodestreamClientTest();

    mockFactoryForCodestreamClientTest.reconnectableRequester.isReadyForTest = false;
    var client = createCodestreamForTest();
    
    assert.throws(
        function () {
            client.getSizesParams();
        },
        _jGlobals.jpipExceptions.IllegalOperationException,
        'exception is expected before reconnectableRequester is ready');
        
    clearForCodestreamClientTest();
    });

QUnit.test('getSizesParams after reconnectableRequester ready', function(assert) {
    clearForCodestreamClientTest();
    var client = createCodestreamForTest();
    
    var paramsActual = client.getSizesParams();
    
    var paramsExpected = mockFactoryForCodestreamClientTest.codestreamStructure.getSizesParams();
    
    var defaultTileStructure =
        mockFactoryForCodestreamClientTest.codestreamStructure.getDefaultTileStructure();
    var defaultComponentStructure =
        defaultTileStructure.getDefaultComponentStructure();
    
    paramsExpected = Object.create(paramsExpected);
    
    paramsExpected.defaultNumResolutionLevels =
        defaultComponentStructure.getNumResolutionLevels();
    paramsExpected.defaultNumQualityLayers =
        defaultTileStructure.getNumQualityLayers();
    
    assert.deepEqual(
        paramsActual,
        paramsExpected,
        'Returns correct sizes parameters');

    clearForCodestreamClientTest();
    });

//QUnit.test('getCodestreamForTile asynchronously', function(assert) {
//    clearForCodestreamClientTest();
//
//    var factory = mockFactoryForCodestreamTest;
//    var client = createCodestreamForTest();
//    
//    var tileX = 2;
//    var tileY = 0;
//    var quality = undefined;
//    var level = 7;
//    
//    var asynchronousResultActual;
//    var callbackMock = function callbackMock(createdCodestream) {
//        asynchronousResultActual = createdCodestream;
//    }
//    
//    var synchronousResultExpected = undefined;
//    var synchronousResultActual = client.getCodestreamForTile(
//        tileX, tileY, level, quality, callbackMock);
//
//    assert.strictEqual(
//        synchronousResultActual,
//        synchronousResultExpected,
//        'No synchronous result should be returned when using asynchronous call');
//    
//    var createCodestreamArgsExpected = null;
//    var createCodestreamArgsActual =
//        factory.codestreamReconstructor.lastCreateCodestreamForTileArgs;
//    assert.strictEqual(
//        createCodestreamArgsActual,
//        createCodestreamArgsExpected,
//        'no call for codestreamReconstructor before requester asynchronous call was done');
//    
//    factory.requester.callRequestTileCallbackForTest();
//
//    testGetCodestreamForTile(
//        assert, asynchronousResultActual, tileX, tileY, level);
//
//    clearForCodestreamClientTest();
//    });
//
//QUnit.test('onlyRequestTile asynchronously', function(assert) {
//    clearForCodestreamClientTest();
//
//    var factory = mockFactoryForCodestreamTest;
//    var client = createCodestreamForTest();
//    
//    var tileX = 2;
//    var tileY = 0;
//    var level = 7;
//    
//    var asynchronousResultActual;
//    var callbackMock = function callbackMock(createdCodestream) {
//        asynchronousResultActual = createdCodestream;
//    }
//    
//    var synchronousResultActual = client.onlyRequestTile(
//        {
//            minTileX: tileX,
//            minTileY: tileY,
//            level: level
//        },
//        callbackMock);
//    var synchronousResultExpected = undefined;
//    assert.strictEqual(
//        synchronousResultActual,
//        synchronousResultExpected,
//        'No synchronous result should be returned when using asynchronous call');
//    
//    var createCodestreamArgsExpected = null;
//    var createCodestreamArgsActual =
//        factory.codestreamReconstructor.lastCreateCodestreamForTileArgs;
//    assert.strictEqual(
//        createCodestreamArgsActual,
//        createCodestreamArgsExpected,
//        'no call for codestreamReconstructor before requester asynchronous call was done');
//    
//    factory.requester.callRequestTileCallbackForTest();
//
//    testGetCodestreamForTile(
//        assert,
//        asynchronousResultActual,
//        tileX,
//        tileY,
//        level,
//        /*requesterNotCalled=*/false,
//        /*reconstructorNotCalled=*/true);
//
//    clearForCodestreamClientTest();
//    });