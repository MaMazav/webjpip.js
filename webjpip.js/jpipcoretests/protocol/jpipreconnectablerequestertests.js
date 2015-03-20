'use strict';

var databinsSaverMockForReconnectableRequesterTest = {
    cleanupCallsForTest: 0,
    
    loadedBytesForTest: 0,
    
    cleanupUnregisteredDatabins: function cleanupUnregisteredDatabins() {
        ++databinsSaverMockForReconnectableRequesterTest.cleanupCallsForTest;
    },
    
    getLoadedBytes: function getLoadedBytes() {
        return
            databinsSaverMockForReconnectableRequesterTest.loadedBytesForTest;
    }
    };

function clearForReconnectableRequesterTest() {
    mockFactoryForReconnectableRequesterTest.clearForTest();
    databinsSaverMockForReconnectableRequesterTest.cleanupCallsForTest = 0;
    databinsSaverMockForReconnectableRequesterTest.loadedBytesForTest = 0;
}

var optionsForSessionCtorTest = {
    maxChannelsInSession: 'dummy maxChannels',
    maxRequestsWaitingForResponseInChannel: 'dummy maxRequests',
    codestreamStructure: 'dummy structure',
    databinsSaver: databinsSaverMockForReconnectableRequesterTest
    };

function createReconnectableRequesterForTest(options) {
    options = options || {};
    var codestreamStructure = options.codestreamStructure || 'dummy structure';
    var maxChannelsInSession = options.maxChannelsInSession || 1;
    var maxRequestsWaitingForResponseInChannel =
        options.maxRequestsWaitingForResponseInChannel || 1;
    
    return new JpipReconnectableRequester(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaverMockForReconnectableRequesterTest,
        mockFactoryForReconnectableRequesterTest);
}

function createRequesterAndOpenForTest(options) {
    options = options || {};
    var requester = createReconnectableRequesterForTest(options);
    
    var session = new JpipSessionMock(options.targetId);
    mockFactoryForReconnectableRequesterTest.sessionToReturn = session;
    requester.open(options.url || 'DummyURL');
    
    session.resultByFunctionForTest['getIsReady'] = true;
    session.statusCallbackForTest({ isReady: true, exception: null });

    return {
        session: session,
        requester: requester
        };
}

function performReconnect(opened) {
    var requester = opened.requester;
    var firstSession = opened.session;
    
    var secondSession = new JpipSessionMock();
    mockFactoryForReconnectableRequesterTest.sessionToReturn = secondSession;
    requester.reconnect();
    
    firstSession.resultByFunctionForTest['hasActiveRequests'] = false;
    secondSession.resultByFunctionForTest['getIsReady'] = true;
    secondSession.statusCallbackForTest({ isReady: true, exception: null });
    
    return secondSession;
}

function checkSessionCtorParams(assert, session, targetIdExpected) {
    var maxChannelsInSessionActual = session.params.maxChannelsInSession;
    var maxChannelsInSessionExpected = optionsForSessionCtorTest.maxChannelsInSession;
    assert.deepEqual(
        maxChannelsInSessionActual,
        maxChannelsInSessionExpected,
        'maxChannelsInSession parameter correctness');
        
    var maxRequestsWaitingForResponseInChannelActual =
        session.params.maxRequestsWaitingForResponseInChannel;
    var maxRequestsWaitingForResponseInChannelExpected =
        optionsForSessionCtorTest.maxRequestsWaitingForResponseInChannel;
    assert.deepEqual(
        maxRequestsWaitingForResponseInChannelActual,
        maxRequestsWaitingForResponseInChannelExpected,
        'maxRequestsWaitingForResponseInChannelActual parameter correctness');
        
    var codestreamStructureActual = session.params.codestreamStructure;
    var codestreamStructureExpected = optionsForSessionCtorTest.codestreamStructure;
    assert.deepEqual(
        codestreamStructureActual,
        codestreamStructureExpected,
        'codestreamStructureActual parameter correctness');
        
    var databinsSaverActual = session.params.databinsSaver;
    var databinsSaverExpected = optionsForSessionCtorTest.databinsSaver;
    assert.deepEqual(
        databinsSaverActual,
        databinsSaverExpected,
        'databinsSaver parameter correctness');
    
    var targetIdActual = session.params.targetId;
    assert.deepEqual(targetIdActual, targetIdExpected, 'No targetId expected');
}

function checkTwoSessionsClose(
    assert, firstSession, secondSession, requester, isFirstSessionAlreadyClosed) {
    
    // Act
    
    var firstSessionCloseCallsBeforeRequesterCloseActual = firstSession.namedArgsLogByFunctionForTest['close'].length;
    var secondSessionCloseCallsBeforeRequesterCloseActual = secondSession.namedArgsLogByFunctionForTest['close'].length;
    
    requester.close();
    
    var firstSessionCloseCallsAfterRequesterCloseActual = firstSession.namedArgsLogByFunctionForTest['close'].length;
    var secondSessionCloseCallsAfterRequesterCloseActual = secondSession.namedArgsLogByFunctionForTest['close'].length;
    
    // Assert
    
    var firstSessionCloseCallsBeforeRequesterCloseExpected = isFirstSessionAlreadyClosed ? 1 : 0;
    assert.deepEqual(
        firstSessionCloseCallsBeforeRequesterCloseActual,
        firstSessionCloseCallsBeforeRequesterCloseExpected,
        'No calls to first session.close() before requester.close()');

    var firstSessionCloseCallsAfterRequesterCloseExpected = 1;
    assert.deepEqual(
        firstSessionCloseCallsAfterRequesterCloseActual,
        firstSessionCloseCallsAfterRequesterCloseExpected,
        'Single call to first session.close() on requester.close()');

    var secondSessionCloseCallsBeforeRequesterCloseExpected = 0;
    assert.deepEqual(
        secondSessionCloseCallsBeforeRequesterCloseActual,
        secondSessionCloseCallsBeforeRequesterCloseExpected,
        'No calls to second session.close() before requester.close()');

    var secondSessionCloseCallsAfterRequesterCloseExpected = 1;
    assert.deepEqual(
        secondSessionCloseCallsAfterRequesterCloseActual,
        secondSessionCloseCallsAfterRequesterCloseExpected,
        'Single call to second session.close() on requester.close()');
}

function checkRequestData(assert, requester, session) {
    var codestreamPartParams = 'Dummy codestream part 921';
    var callback = 'Dummy callback 312';
    var failureCallback = 'Dummy failureCallback 741';
    var numQualityLayers = 'Dummy numQualityLayers 512';
    
    var channel = new JpipChannelMock();

    channel.resultByFunctionForTest.requestData = 'Dummy request 762';
    channel.resultByFunctionForTest.getIsDedicatedForMovableRequest = false;
    session.resultByFunctionForTest.tryGetChannel = channel;
    
    // Act
    
    requester.requestData(
        codestreamPartParams, callback, failureCallback, numQualityLayers);
    
    var args = channel.namedArgsLogByFunctionForTest.requestData[0];
    
    // Assert
    
    var requestDataCallsExpected = 1;
    var requestDataCallsActual =
        channel.namedArgsLogByFunctionForTest.requestData.length;
    assert.deepEqual(
        requestDataCallsExpected,
        requestDataCallsActual,
        'Expected single call to channel.requestData');
    
    var codestreamPartParamsActual = args.codestreamPartParams;
    var codestreamPartParamsExpected = codestreamPartParams;
    assert.deepEqual(
        codestreamPartParamsActual,
        codestreamPartParamsExpected,
        'Correctness of codestreamPartParams parameter');
    
    var callbackActual = args.callback;
    var callbackExpected = callback;
    assert.deepEqual(
        callbackActual,
        callbackExpected,
        'Correctness of callback parameter');

    var failureCallbackActual = args.failureCallback;
    var failureCallbackExpected = failureCallback;
    assert.deepEqual(
        failureCallbackActual,
        failureCallbackExpected,
        'Correctness of failureCallback parameter');

    var numQualityLayersActual = args.numQualityLayers;
    var numQualityLayersExpected = numQualityLayers;
    assert.deepEqual(
        numQualityLayersActual,
        numQualityLayersExpected,
        'Correctness of numQualityLayers parameter');
}

function testProxyFunctionCallsForEachActiveSession(
    functionName,
    args) {
    
    QUnit.test(
        functionName + '() should be called on active session',
        function(assert) {
            clearForReconnectableRequesterTest();

            var opened = createRequesterAndOpenForTest();
            
            // Act
            opened.requester[functionName].apply(opened.requester, args);
            
            // Assert
            
            var allArgsHistoryOfFunction =
                opened.session.enumeratedArgsLogByFunctionForTest[functionName];
            var argsActual = allArgsHistoryOfFunction[
                allArgsHistoryOfFunction.length - 1];
            
            var argsExpected = args;

            assert.deepEqual(
                argsActual,
                argsExpected,
                'Correctness of arguments passed to session.' + functionName);

            clearForReconnectableRequesterTest();
        });

    QUnit.test(
        functionName + '() should be called when session is reconnected',
        function(assert) {
            clearForReconnectableRequesterTest();

            var opened = createRequesterAndOpenForTest();
            
            // Act
            opened.requester[functionName].apply(opened.requester, args);

            var secondSession = performReconnect(opened);
            
            // Assert
            var argsExpected = args;
            var allArgsHistoryOfFunction =
                secondSession.enumeratedArgsLogByFunctionForTest[functionName];
            var argsActual = allArgsHistoryOfFunction[
                allArgsHistoryOfFunction.length - 1];
            
            assert.deepEqual(
                argsActual,
                argsExpected,
                'Correctness of arguments passed to session.' + functionName);

            clearForReconnectableRequesterTest();
        });
}

QUnit.module('JpipReconnectableRequester');

testProxyFunctionCallsForEachActiveSession(
    'setStatusCallback', [ function dummyStatusCallback() {} ]);

//testProxyFunctionCallsForEachActiveSession(
//    'dedicateChannelForMovableRequest', []);

//testProxyFunctionCallsForEachActiveSession(
//    'requestData',
//    /*args=*/[
//        'Dummy codestream part 92',
//        'Dummy callback 43',
//        'Dummy failure callback 132',
//        'Dummy quality layers 921'
//    ],
//    function beforeOperation(opened) {
//        // TODO
//    },
//    /*channelToAddInBeginningOfExpectedSessionArgs=*/TODO);

var channelNameForMoveDedicatedChannelRequestTest =
    'dummy channel for moveDedicatedChannelRequest test';
    
QUnit.test(
    'requestData() with dedicated channel should call to channel.requestData()',
    function(assert) {
        clearForReconnectableRequesterTest();

        var codestreamPartParams = 'Dummy codestreamPartParams 154';
        var callback = 'Dummy callback 936';
        var failureCallback = 'Dummy failureCallback 394';
        var numQualityLayers = 'Dummy numQualityLayers 632';
        
        var opened = createRequesterAndOpenForTest();
        
        var channel = new JpipChannelMock();
        channel.resultByFunctionForTest['getIsDedicatedForMovableRequest'] = true;
        opened.session.resultByFunctionForTest.tryGetChannel = channel;
        
        // Act
        
        var requesterChannel = opened.requester.dedicateChannelForMovableRequest();
        
        opened.requester.requestData(
            codestreamPartParams,
            callback,
            failureCallback,
            numQualityLayers,
            requesterChannel);
        
        // Assert
        
        var callsCountExpected = 1;
        var callsCountActual =
            channel.namedArgsLogByFunctionForTest['requestData'].length;
        assert.deepEqual(
            callsCountActual,
            callsCountExpected,
            'Expected single call to session.requestData');
        
        var actualArgs = channel.namedArgsLogByFunctionForTest['requestData'][0];
        var expectedArgs = {
            codestreamPartParams: codestreamPartParams,
            callback: callback,
            failureCallback: failureCallback,
            numQualityLayers: numQualityLayers
        };
        
        assert.deepEqual(
            actualArgs,
            expectedArgs,
            'Correctness of arguments passed to channel.requestData');
        
        clearForReconnectableRequesterTest();
    });

QUnit.test(
    'requestData() with dedicated channel should call requestData() of correct session after reconnect',
    function(assert) {
        clearForReconnectableRequesterTest();

        var codestreamPartParams = 'Dummy codestreamPartParams 154';
        var callback = 'Dummy callback 936';
        var failureCallback = 'Dummy failureCallback 394';
        var numQualityLayers = 'Dummy numQualityLayers 632';
        
        var opened = createRequesterAndOpenForTest();
        var firstSession = opened.session;
        
        var firstChannel = new JpipChannelMock();
        firstChannel.resultByFunctionForTest['getIsDedicatedForMovableRequest'] = true;
        opened.session.resultByFunctionForTest.tryGetChannel = firstChannel;
        
        // Act
        
        var requesterChannel =
            opened.requester.dedicateChannelForMovableRequest();
        
        var secondSession = new JpipSessionMock();
        mockFactoryForReconnectableRequesterTest.sessionToReturn = secondSession;
        opened.requester.reconnect();
        
        var secondChannel = new JpipChannelMock();
        secondChannel.resultByFunctionForTest['getIsDedicatedForMovableRequest'] = true;
        secondSession.resultByFunctionForTest.tryGetChannel = secondChannel;
        
        firstSession.resultByFunctionForTest['hasActiveRequests'] = false;
        secondSession.resultByFunctionForTest['getIsReady'] = true;
        secondSession.statusCallbackForTest({ isReady: true, exception: null });
        
        opened.requester.requestData(
            codestreamPartParams,
            callback,
            failureCallback,
            numQualityLayers,
            requesterChannel);
        
        // Assert
        
        var firstChannelCallsCountExpected = 0;
        var firstChannelCallsCountActual =
            firstChannel.namedArgsLogByFunctionForTest['requestData'].length;
        assert.deepEqual(
            firstChannelCallsCountActual,
            firstChannelCallsCountExpected,
            'Expected no calls to firstChannel.requestData');
        
        var secondChannelCallsCountExpected = 1;
        var secondChannelCallsCountActual =
            secondChannel.namedArgsLogByFunctionForTest['requestData'].length;
        assert.deepEqual(
            secondChannelCallsCountActual,
            secondChannelCallsCountExpected,
            'Expected single call to secondChannel.requestData');
        
        var actualArgs = secondChannel.namedArgsLogByFunctionForTest['requestData'][0];
        var expectedArgs = {
            codestreamPartParams: codestreamPartParams,
            callback: callback,
            failureCallback: failureCallback,
            numQualityLayers: numQualityLayers
        };
        
        assert.deepEqual(
            actualArgs,
            expectedArgs,
            'Correctness of arguments passed to secondChannel.requestData');
    });

QUnit.test('getIsReady should return false before open', function(assert) {
    clearForReconnectableRequesterTest();

    var requester = createReconnectableRequesterForTest();
    var isReadyActual = requester.getIsReady();
    var isReadyExpected = false;
    assert.deepEqual(
        isReadyActual, isReadyExpected, 'getIsReady should return false');

    clearForReconnectableRequesterTest();
    });

QUnit.test('open() with undefined URL should throw exception', function (assert) {
    clearForReconnectableRequesterTest();

    var requester = createReconnectableRequesterForTest();
    
    assert.throws(
        function openWithUndefinedURL() {
            requester.open(undefined);
        },
        jpipExceptions.ArgumentException,
        'Expected ArgumentException on open()');

    clearForReconnectableRequesterTest();
});

QUnit.test('open() with null URL should throw exception', function (assert) {
    clearForReconnectableRequesterTest();

    var requester = createReconnectableRequesterForTest();
    
    assert.throws(
        function openWithNullURL() {
            requester.open(null);
        },
        jpipExceptions.ArgumentException,
        'Expected ArgumentException on open()');

    clearForReconnectableRequesterTest();
});

QUnit.test('open() twice should throw exception', function (assert) {
    clearForReconnectableRequesterTest();

    var opened = createRequesterAndOpenForTest();
    
    assert.throws(
        function openSecondTime() {
            opened.requester.open('Another URL');
        },
        jpipExceptions.IllegalOperationException,
        'Expected IllegalOperationException on second open()');

    clearForReconnectableRequesterTest();
});

QUnit.test('parameters passed to first session constructor', function(assert) {
    clearForReconnectableRequesterTest();
    
    // Act
    var opened = createRequesterAndOpenForTest(optionsForSessionCtorTest);
    
    // Assert
    checkSessionCtorParams(
        assert, opened.session, /*targetIdExpected=*/undefined);
    
    clearForReconnectableRequesterTest();
});

QUnit.test('parameters passed to second session constructor', function(assert) {
    clearForReconnectableRequesterTest();
    
    var targetId = 'Dummy target ID';

    var options = Object.create(optionsForSessionCtorTest);
    options.targetId = targetId;
    var opened = createRequesterAndOpenForTest(options);
    var firstSession = opened.session;
    
    // Act
    
    var secondSession = new JpipSessionMock(targetId);
    mockFactoryForReconnectableRequesterTest.sessionToReturn = secondSession;
    opened.requester.reconnect();
    
    // Assert
    checkSessionCtorParams(assert, secondSession, targetId);
    
    clearForReconnectableRequesterTest();
});

QUnit.test('URL passed to session.open()', function(assert) {
    clearForReconnectableRequesterTest();

    var url = 'http://www.dummy.URL/for/test';
    var options = Object.create(optionsForSessionCtorTest);
    options.url = url;
    var opened = createRequesterAndOpenForTest(options);

    var urlExpected = url;
    var urlActual = opened.session.namedArgsLogByFunctionForTest['open'][0].url;
    assert.deepEqual(urlActual, urlExpected, 'Correctness of URL parameter');
    
    var openCallsExpected = 1;
    var openCallsActual = opened.session.namedArgsLogByFunctionForTest['open'].length;
    assert.deepEqual(
        openCallsActual,
        openCallsExpected,
        'Single call to session.open() is expected');

    clearForReconnectableRequesterTest();
});

QUnit.test('session.close() called on close before ready', function(assert) {
    clearForReconnectableRequesterTest();

    var requester = createReconnectableRequesterForTest();
    
    // Act
    
    var session = new JpipSessionMock();
    mockFactoryForReconnectableRequesterTest.sessionToReturn = session;
    requester.open('DummyURL 2');
    
    var sessionCloseCallsBeforeRequesterCloseActual = session.namedArgsLogByFunctionForTest['close'].length;
    requester.close();
    var sessionCloseCallsAfterRequesterCloseActual = session.namedArgsLogByFunctionForTest['close'].length;
    
    var sessionCloseCallsBeforeRequesterCloseExpected = 0;
    assert.deepEqual(
        sessionCloseCallsBeforeRequesterCloseActual,
        sessionCloseCallsBeforeRequesterCloseExpected,
        'No calls to session.close() before requester.close()');

    var sessionCloseCallsAfterRequesterCloseExpected = 1;
    assert.deepEqual(
        sessionCloseCallsAfterRequesterCloseActual,
        sessionCloseCallsAfterRequesterCloseExpected,
        'Single call to session.close() on requester.close()');

    clearForReconnectableRequesterTest();
});

QUnit.test('session.close() called on close after ready', function(assert) {
    clearForReconnectableRequesterTest();

    var opened = createRequesterAndOpenForTest();
    
    // Act
    
    var sessionCloseCallsBeforeRequesterCloseActual = opened.session.namedArgsLogByFunctionForTest['close'].length;
    opened.requester.close();
    var sessionCloseCallsAfterRequesterCloseActual = opened.session.namedArgsLogByFunctionForTest['close'].length;
    
    // Assert
    
    var sessionCloseCallsBeforeRequesterCloseExpected = 0;
    assert.deepEqual(
        sessionCloseCallsBeforeRequesterCloseActual,
        sessionCloseCallsBeforeRequesterCloseExpected,
        'No calls to session.close() before requester.close()');

    var sessionCloseCallsAfterRequesterCloseExpected = 1;
    assert.deepEqual(
        sessionCloseCallsAfterRequesterCloseActual,
        sessionCloseCallsAfterRequesterCloseExpected,
        'Single call to session.close() on requester.close()');

    clearForReconnectableRequesterTest();
});

QUnit.test(
    'session.close() called for both opened sessions on close after only first session ready',
    function(assert) {
        clearForReconnectableRequesterTest();

        var opened = createRequesterAndOpenForTest();
        var firstSession = opened.session;
        
        var secondSession = new JpipSessionMock();
        mockFactoryForReconnectableRequesterTest.sessionToReturn = secondSession;
        opened.requester.reconnect();

        checkTwoSessionsClose(assert, firstSession, secondSession, opened.requester);

        clearForReconnectableRequesterTest();
    });

QUnit.test(
    'session.close() called for both opened sessions on close after second session ready',
    function(assert) {
        clearForReconnectableRequesterTest();

        var opened = createRequesterAndOpenForTest();
        var firstSession = opened.session;
        
        var secondSession = new JpipSessionMock();
        mockFactoryForReconnectableRequesterTest.sessionToReturn = secondSession;
        opened.requester.reconnect();

        firstSession.resultByFunctionForTest['hasActiveRequests'] = true;
        secondSession.resultByFunctionForTest['getIsReady'] = true;
        secondSession.statusCallbackForTest({ isReady: true, exception: null });

        checkTwoSessionsClose(assert, firstSession, secondSession, opened.requester);

        clearForReconnectableRequesterTest();
    });

QUnit.test(
    'session.close() called for only last session on close after first session already tried to be closed',
    function(assert) {
        clearForReconnectableRequesterTest();

        var opened = createRequesterAndOpenForTest();
        var firstSession = opened.session;
        
        // Act
        
        var secondSession = performReconnect(opened);
        
        checkTwoSessionsClose(
            assert,
            firstSession,
            secondSession,
            opened.requester,
            /*isFirstSessionAlreadyClosed=*/true);

        clearForReconnectableRequesterTest();
    });
    
QUnit.test(
    'session.close() correctness on requester.reconnect()',
    function(assert) {
        clearForReconnectableRequesterTest();

        var opened = createRequesterAndOpenForTest();
        var firstSession = opened.session;
        
        // Act
        
        var secondSession = new JpipSessionMock();
        mockFactoryForReconnectableRequesterTest.sessionToReturn = secondSession;
        opened.requester.reconnect();
        
        firstSession.resultByFunctionForTest['hasActiveRequests'] = true;
        secondSession.resultByFunctionForTest['getIsReady'] = true;
        secondSession.statusCallbackForTest({ isReady: true, exception: null });
        
        firstSession.resultByFunctionForTest['hasActiveRequests'] = true;
        firstSession.requestEndedCallbackForTest('Dummy channel');
        firstSession.resultByFunctionForTest['hasActiveRequests'] = true;
        firstSession.requestEndedCallbackForTest('Dummy channel');
        firstSession.resultByFunctionForTest['hasActiveRequests'] = true;
        firstSession.requestEndedCallbackForTest('Dummy channel');
        
        var sessionCloseCallsBeforeNoActiveRequestActual = firstSession.namedArgsLogByFunctionForTest['close'].length;
        
        firstSession.resultByFunctionForTest['hasActiveRequests'] = false;
        firstSession.requestEndedCallbackForTest('Dummy channel');
        
        var sessionCloseCallsAfterNoActiveRequestActual = firstSession.namedArgsLogByFunctionForTest['close'].length;
        
        // Assert
        
        var sessionCloseCallsBeforeNoActiveRequestExpected = 0;
        assert.deepEqual(
            sessionCloseCallsBeforeNoActiveRequestActual,
            sessionCloseCallsBeforeNoActiveRequestExpected,
            'No session.close() calls expected when session.hasActiveRequests() is true');

        var sessionCloseCallsAfterNoActiveRequestExpected = 1;
        assert.deepEqual(
            sessionCloseCallsAfterNoActiveRequestActual,
            sessionCloseCallsAfterNoActiveRequestExpected,
            'session.close() call expected when session.hasActiveRequests() is false');
    });

QUnit.test(
    'stopRequestAsync() of non movable request should call request.stopRequestAsync()',
    function(assert) {
        clearForReconnectableRequesterTest();
        
        var opened = createRequesterAndOpenForTest();
        
        var channel = new JpipChannelMock();
        opened.session.resultByFunctionForTest['tryGetChannel'] = channel;
        
        var request = new JpipRequestMock();
        channel.resultByFunctionForTest['requestData'] = request;
        channel.resultByFunctionForTest['getIsDedicatedForMovableRequest'] = false;
        
        // Act
        
        var requestHandle = opened.requester.requestData();
        
        channel.resultByFunctionForTest['getIsDedicatedForMovableRequest'] = false;
        opened.requester.stopRequestAsync(requestHandle);
        
        // Assert
        
        var callsActual = request.namedArgsLogByFunctionForTest['stopRequestAsync'].length;
        var callsExpected = 1;
        assert.deepEqual(
            callsActual,
            callsExpected,
            'Single call to request.stopRequestAsync() is expected');

        clearForReconnectableRequesterTest();
    });

QUnit.test(
    'stopRequestAsync() of movable request should call request.stopRequestAsync()',
    function(assert) {
        clearForReconnectableRequesterTest();
        
        var opened = createRequesterAndOpenForTest();
        
        var channel = new JpipChannelMock();
        opened.session.resultByFunctionForTest['tryGetChannel'] = channel;
        
        var request = new JpipRequestMock();
        channel.resultByFunctionForTest['requestData'] = request;
        channel.resultByFunctionForTest['getIsDedicatedForMovableRequest'] = true;
        
        // Act
        
        var dedicatedChannelHandle = opened.requester.dedicateChannelForMovableRequest();
        var requestHandle = opened.requester.requestData(
            null, null, null, null, dedicatedChannelHandle);
        
        opened.requester.stopRequestAsync(requestHandle);
        
        // Assert
        
        var callsActual = request.namedArgsLogByFunctionForTest['stopRequestAsync'].length;
        var callsExpected = 1;
        assert.deepEqual(
            callsActual,
            callsExpected,
            'Single call to request.stopRequestAsync() is expected');

        clearForReconnectableRequesterTest();
    });

QUnit.test(
    'reconnect() should call to databinsSaver.cleanupUnregisteredDatabins()',
    function(assert) {
        clearForReconnectableRequesterTest();

        var opened = createRequesterAndOpenForTest();
        
        // Act

        var cleanupCallsBeforeReconnectActual =
            databinsSaverMockForReconnectableRequesterTest.cleanupCallsForTest;

        performReconnect(opened);
        
        var cleanupCallsAfterReconnectActual =
            databinsSaverMockForReconnectableRequesterTest.cleanupCallsForTest;
        
        // Assert
        
        var cleanupCallsBeforeReconnectExpected = 0;
        assert.deepEqual(
            cleanupCallsBeforeReconnectActual,
            cleanupCallsBeforeReconnectExpected,
            'No cleanup expected before reconnect');
            
        var cleanupCallsAfterReconnectExpected = 1;
        assert.deepEqual(
            cleanupCallsAfterReconnectActual,
            cleanupCallsAfterReconnectExpected,
            'Single cleanup expected after reconnect');

        clearForReconnectableRequesterTest();
    });

QUnit.test(
    'requestData() without dedicated channel should call to channel.requestData()',
    function(assert) {
        clearForReconnectableRequesterTest();
        
        var opened = createRequesterAndOpenForTest();
        
        checkRequestData(assert, opened.requester, opened.session);
        
        clearForReconnectableRequesterTest();
    });

QUnit.test(
    'requestData() without dedicated channel should call to correct channel.requestData() after reconnect',
    function(assert) {
        clearForReconnectableRequesterTest();
        
        var opened = createRequesterAndOpenForTest();
        
        var secondSession = performReconnect(opened);
        
        checkRequestData(assert, opened.requester, secondSession);
        
        clearForReconnectableRequesterTest();
    });