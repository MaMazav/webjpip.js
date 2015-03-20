'use strict';

function clearForSessionTest() {
    mockFactoryForProtocolTest.clearForTest();
}

function createSessionForTest(options) {
    if (options === undefined) {
        options = {};
    }
    
    if (options.mainHeaderDatabin === undefined) {
        options.mainHeaderDatabin = databinStubs.mainHeaderDatabinStub;
    }
    
    var codestreamStructure = 'Dummy codestreamStructure for JpipSession test';
    
    var databinsSaver = new JpipDatabinsSaverStub(options.mainHeaderDatabin);
    if (options.isJptStream) {
        databinsSaver.getIsJpipTilePartStream = function() { return true; };
    }
    
    var maxChannelsInSession = options.maxChannelsInSession || 5;
    var maxRequestsWaitingForResponseInChannel = options.maxRequestsWaitingForResponseInChannel || 3;
    var knownTargetId = 'Dummy knownTargetId';
    var setIntervalStub = options.setInterval || stubFunction;
    var clearIntervalStub = options.clearInterval || stubFunction;
    
    var session = new JpipSession(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        knownTargetId,
        codestreamStructure,
        databinsSaver,
        setIntervalStub,
        clearIntervalStub,
        mockFactoryForProtocolTest);
    
    var result = {};
    
    if (!options.disableOpen) {
        result = openSession(session, options);
    }
    
    result.session = session;
    result.maxChannelsInSession = maxChannelsInSession;
    result.maxRequestsWaitingForResponseInChannel = maxRequestsWaitingForResponseInChannel;
    result.knownTargetId = knownTargetId;
    result.databinsSaver = databinsSaver;
    result.codestreamStructure = codestreamStructure;
    
    return result;
}

function openSession(session, options) {
    options = options || {};
    
    var sessionHelper = new JpipSessionHelperMock();
    mockFactoryForProtocolTest.resultByFunctionForTest['createSessionHelper'] =
        sessionHelper;
    
    var channel = new JpipChannelMock();
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] =
        channel;
    
    var url = options.url || 'http://dummy.jpip.server.com/target_name';
    session.open(url);
    
    var channelId = options.channelId || 'Dummy channel ID for JpipSession test';
    sessionHelper.resultByFunctionForTest['getFirstChannel'] = channel;
    channel.resultByFunctionForTest['getChannelId'] = channelId;

    if (!options.disableFirstResponseCallback) {
        var callback = channel.namedArgsLogByFunctionForTest.sendMinimalRequest[0].callback;
        callback();
    }
    
    return {
        sessionHelper: sessionHelper,
        channel: channel,
        url: url,
        channelId: channelId
        };
}

function stubFunction() {
}

QUnit.module('JpipSession');

QUnit.test('open(): createSessionHelper arguments correctness', function(assert) {
    clearForSessionTest();
    
    // Act
    var created = createSessionForTest();
    
    // Assert
    
    var args = mockFactoryForProtocolTest.namedArgsLogByFunctionForTest[
        'createSessionHelper'][0];
    
    var urlRequestActual = ajaxHelperMock.getRequestFromUrlForTest(
        args.dataRequestUrl);
    var urlRequestExpected = ajaxHelperMock.getRequestFromUrlForTest(
        created.url + '?type=jpp-stream&stream=0');
    assert.deepEqual(
        urlRequestActual,
        urlRequestExpected,
        'Correctness of dataRequestUrl argument');
    
    var knownTargetIdActual = args.knownTargetId;
    var knownTargetIdExpected = created.knownTargetId;
    assert.deepEqual(
        knownTargetIdActual,
        knownTargetIdExpected,
        'Correctness of knownTargetId argument');
    
    var codestreamStructureActual = args.codestreamStructure;
    var codestreamStructureExpected = created.codestreamStructure;
    assert.deepEqual(
        codestreamStructureActual,
        codestreamStructureExpected,
        'Correctness of codestreamStructure argument');
    
    var databinsSaverActual = args.databinsSaver;
    var databinsSaverExpected = created.databinsSaver;
    assert.deepEqual(
        databinsSaverActual,
        databinsSaverExpected,
        'Correctness of databinsSaver argument');
    
    clearForSessionTest();
    });

QUnit.test('open(): createChannel arguments correctness', function(assert) {
    clearForSessionTest();
    
    // Act
    var created = createSessionForTest();
    
    // Assert
    
    var args = mockFactoryForProtocolTest.namedArgsLogByFunctionForTest[
        'createChannel'][0];
    
    var maxRequestsWaitingForResponseInChannelActual = args.maxRequestsWaitingForResponseInChannel;
    var maxRequestsWaitingForResponseInChannelExpected = created.maxRequestsWaitingForResponseInChannel;
    assert.deepEqual(
        maxRequestsWaitingForResponseInChannelActual,
        maxRequestsWaitingForResponseInChannelExpected,
        'Correctness of maxRequestsWaitingForResponseInChannel argument');
    
    var sessionHelperActual = args.sessionHelper;
    var sessionHelperExpected = created.sessionHelper;
    assert.deepEqual(
        sessionHelperActual,
        sessionHelperExpected,
        'Correctness of sessionHelper argument');
    });

QUnit.test('open(): createSessionHelper() URL argument correctness in JPP stream', function(assert) {
    clearForSessionTest();
    
    // Act
    var created = createSessionForTest({ isJptStream: false });
    
    // Assert
    
    var args = mockFactoryForProtocolTest.namedArgsLogByFunctionForTest[
        'createSessionHelper'][0];
    
    var urlRequestActual = ajaxHelperMock.getRequestFromUrlForTest(
        args.dataRequestUrl);
    var urlRequestExpected = ajaxHelperMock.getRequestFromUrlForTest(
        created.url + '?type=jpp-stream&stream=0');
    assert.deepEqual(
        urlRequestActual,
        urlRequestExpected,
        'Correctness of dataRequestUrl argument');
    });

QUnit.test('open(): createSessionHelper() URL argument correctness in JPT stream', function(assert) {
    clearForSessionTest();
    
    // Act
    var created = createSessionForTest({ isJptStream: true });
    
    // Assert
    
    var args = mockFactoryForProtocolTest.namedArgsLogByFunctionForTest[
        'createSessionHelper'][0];
    
    var urlRequestActual = ajaxHelperMock.getRequestFromUrlForTest(
        args.dataRequestUrl);
    var urlRequestExpected = ajaxHelperMock.getRequestFromUrlForTest(
        created.url + '?type=jpt-stream&stream=0');
    assert.deepEqual(
        urlRequestActual,
        urlRequestExpected,
        'Correctness of dataRequestUrl argument');
    });

QUnit.test('open(): sendMinimalRequest() was called', function(assert) {
    clearForSessionTest();
    
    // Act
    var created = createSessionForTest({ disableFirstResponseCallback: true });

    // Assert
    
    var sendMinimalRequestCallsActual = created.channel.namedArgsLogByFunctionForTest.sendMinimalRequest.length;
    var sendMinimalRequestCallsExpected = 1;
    assert.deepEqual(
        sendMinimalRequestCallsActual,
        sendMinimalRequestCallsExpected,
        'sendMinimalRequest() called once');
    });

QUnit.test('open() twice expected to throw exception', function(assert) {
    clearForSessionTest();
    
    // Act
    var created = createSessionForTest();

    // Assert
    
    assert.throws(
        function secondCallOpen() {
            created.session.open('Dummy URL');
        },
        jpipExceptions.InternalErrorException,
        'Expected exception on second call to open()');
    });

QUnit.test('setStatusCallback() after open() correctness', function(assert) {
    clearForSessionTest();
    
    var status;
    
    function statusCallbackMock(status_) {
        status = status_;
    }
    
    // Act
    
    var created = createSessionForTest();
    created.session.setStatusCallback(statusCallbackMock);
    
    var dummyStatus = 'Dummy status 1534';
    created.sessionHelper.statusCallbackForTest(dummyStatus);
    
    // Assert
    
    var statusActual = status;
    var statusExpected = dummyStatus
    assert.deepEqual(
        statusActual,
        statusExpected,
        'Correctness of status passed to statusCallback');
    });

QUnit.test('setStatusCallback() before open() correctness', function(assert) {
    clearForSessionTest();
    
    var status;
    
    function statusCallbackMock(status_) {
        status = status_;
    }
    
    // Act
    
    var created = createSessionForTest({ disableOpen: true });
    
    created.session.setStatusCallback(statusCallbackMock);
    var opened = openSession(created.session);
    
    var dummyStatus = 'Dummy status 834';
    opened.sessionHelper.statusCallbackForTest(dummyStatus);
    
    // Assert
    
    var statusActual = status;
    var statusExpected = dummyStatus
    assert.deepEqual(
        statusActual,
        statusExpected,
        'Correctness of status passed to statusCallback');
    });

QUnit.test('setRequestEndedCallback() after open() correctness', function(assert) {
    clearForSessionTest();
    
    var channel;
    
    function requestEndedCallbackMock(channel_) {
        channel = channel_;
    }
    
    // Act
    
    var created = createSessionForTest({ disableFirstResponseCallback: true });
    created.session.setRequestEndedCallback(requestEndedCallbackMock);

    var callback = created.channel.namedArgsLogByFunctionForTest.sendMinimalRequest[0].callback;
    callback();
    
    created.sessionHelper.requestEndedCallbackForTest(created.channel);
    
    // Assert
    
    var channelActual = channel;
    var channelExpected = created.channel;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'Correctness of channel passed to requestEndedCallback');
    });

QUnit.test('setRequestEndedCallback() before open() correctness', function(assert) {
    clearForSessionTest();
    
    var channel;
    
    function requestEndedCallbackMock(channel_) {
        channel = channel_;
    }
    
    // Act
    
    var created = createSessionForTest({ disableOpen: true });
    created.session.setRequestEndedCallback(requestEndedCallbackMock);
    
    var opened = openSession(created.session);
    
    opened.sessionHelper.requestEndedCallbackForTest(created.channel);
    
    // Assert
    
    var channelActual = channel;
    var channelExpected = created.channel;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'Correctness of channel passed to requestEndedCallback');
    });

QUnit.test('getTargetId() correctness', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var targetId = 'Dummy target ID 524';
    var created = createSessionForTest();
    created.sessionHelper.resultByFunctionForTest['getTargetId'] = targetId;
    
    // Assert
    
    var targetIdActual = created.session.getTargetId();
    var targetIdExpected = targetId;
    assert.deepEqual(
        targetIdActual,
        targetIdExpected,
        'Correctness of getTargetId returned value');
    });

QUnit.test('getTargetId(): exception when not ready', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({ disableFirstResponseCallback: true });
    
    // Assert
    
    assert.throws(
        function callGetTargetIdBeforeOpen() {
            created.session.getTargetId();
        },
        jpipExceptions.InternalErrorException,
        'Exception expected on getTargetId() before server responded');
    });

QUnit.test('getIsReady() before open()', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({ disableOpen: true });
    
    // Assert
    
    var isReadyActual = created.session.getIsReady();
    var isReadyExpected = false;
    assert.deepEqual(
        isReadyActual,
        isReadyExpected,
        'getIsReady expected to return false');
    });

QUnit.test('getIsReady() after open() before server responded', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({ disableFirstResponseCallback: true });
    
    // Assert
    
    var isReadyActual = created.session.getIsReady();
    var isReadyExpected = false;
    assert.deepEqual(
        isReadyActual,
        isReadyExpected,
        'getIsReady expected to return false');
        
    var setIsReadyArgumentToSessionHelperActual = created.sessionHelper.getIsReady();
    var setIsReadyArgumentToSessionHelperExpected = false;
    assert.deepEqual(
        setIsReadyArgumentToSessionHelperActual,
        setIsReadyArgumentToSessionHelperExpected,
        'sessionHelper.setIsReady should be called with correct isReady value');
    });

QUnit.test('getIsReady() after server responded', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest();
    
    // Assert
    
    var isReadyActual = created.session.getIsReady();
    var isReadyExpected = true;
    assert.deepEqual(
        isReadyActual,
        isReadyExpected,
        'getIsReady expected to return false');

    var setIsReadyArgumentToSessionHelperActual = created.sessionHelper.getIsReady();
    var setIsReadyArgumentToSessionHelperExpected = true;
    assert.deepEqual(
        setIsReadyArgumentToSessionHelperActual,
        setIsReadyArgumentToSessionHelperExpected,
        'sessionHelper.setIsReady should be called with correct isReady value');
    });

QUnit.test('getIsReady() after close', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest();
    created.session.close();
    
    // Assert
    
    var isReadyActual = created.session.getIsReady();
    var isReadyExpected = false;
    assert.deepEqual(
        isReadyActual,
        isReadyExpected,
        'getIsReady expected to return false');
        
    var setIsReadyArgumentToSessionHelperActual = created.sessionHelper.getIsReady();
    var setIsReadyArgumentToSessionHelperExpected = false;
    assert.deepEqual(
        setIsReadyArgumentToSessionHelperActual,
        setIsReadyArgumentToSessionHelperExpected,
        'sessionHelper.setIsReady should be called with correct isReady value');
    });

QUnit.test('hasActiveRequests(): exception when not ready', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({ disableFirstResponseCallback: true });
    
    // Assert
    
    assert.throws(
        function callGetTargetIdBeforeOpen() {
            created.session.hasActiveRequests();
        },
        jpipExceptions.InternalErrorException,
        'Exception expected on hasActiveRequests() before server responded');
    });

QUnit.test('hasActiveRequests() when no active requests', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest();
    created.sessionHelper.resultByFunctionForTest['getActiveRequestsCount'] = 0;
    
    // Assert
    
    var hasActiveRequestsActual = created.session.hasActiveRequests();
    var hasActiveRequestsExpected = false;
    assert.deepEqual(
        hasActiveRequestsActual,
        hasActiveRequestsExpected,
        'hasActiveRequests() should return false');
    });

QUnit.test('hasActiveRequests() when no active requests', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest();
    created.sessionHelper.resultByFunctionForTest['getActiveRequestsCount'] = 15;
    
    // Assert
    
    var hasActiveRequestsActual = created.session.hasActiveRequests();
    var hasActiveRequestsExpected = true;
    assert.deepEqual(
        hasActiveRequestsActual,
        hasActiveRequestsExpected,
        'hasActiveRequests() should return false');
    });

QUnit.test('tryGetChannel(): exception when not ready', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({ disableFirstResponseCallback: true });
    
    // Assert
    
    assert.throws(
        function callGetTargetIdBeforeOpen() {
            created.session.tryGetChannel();
        },
        jpipExceptions.InternalErrorException,
        'Exception expected on tryGetChannel() before server responded');
    });

QUnit.test('tryGetChannel() when a single channel is ready', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest();
    
    created.channel.resultByFunctionForTest['getAllQueuedRequestCount'] = 0;
    
    // Assert
    
    var channelActual = created.session.tryGetChannel();
    var channelExpected = created.channel;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'tryGetChannel() should return the single active channel');
    });

QUnit.test('tryGetChannel() when no channel with empty request queue', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest();
    
    created.channel.resultByFunctionForTest['getAllQueuedRequestCount'] = 1;
    
    var newChannel = new JpipChannelMock();
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = newChannel;
    
    // Assert
    
    var channelActual = created.session.tryGetChannel();
    var channelExpected = newChannel;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'tryGetChannel() should return a new created channel');
    });

QUnit.test('tryGetChannel() when no channel with empty request queue and maximum channels count exceeds', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({ maxChannelsInSession: 2 });
    
    var channelWithSmallerNumberOfRequests = created.channel;
    channelWithSmallerNumberOfRequests.resultByFunctionForTest['getAllQueuedRequestCount'] = 1;
    channelWithSmallerNumberOfRequests.channelNameForTest = 'First channel with 1 requests';
    
    var channelWithLargerNumberOfRequests = new JpipChannelMock();
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = channelWithLargerNumberOfRequests;
    channelWithLargerNumberOfRequests.resultByFunctionForTest['getAllQueuedRequestCount'] = 2;
    channelWithLargerNumberOfRequests.channelNameForTest = 'Second channel with 2 requests';

    created.session.tryGetChannel();
    
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = null;
    
    // Assert
    
    var channelActual = created.session.tryGetChannel();
    var channelExpected = channelWithSmallerNumberOfRequests;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'tryGetChannel() should return the channel with minimal number of requests');
    });

QUnit.test('tryGetChannel() when no channel with empty request queue and maximum channels count exceeds and requests count in each channel exceeds', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({
        maxChannelsInSession: 2,
        maxRequestsWaitingForResponseInChannel: 1
        });
    
    var channelWithSmallerNumberOfRequests = created.channel;
    channelWithSmallerNumberOfRequests.resultByFunctionForTest['getAllQueuedRequestCount'] = 1;
    channelWithSmallerNumberOfRequests.channelNameForTest = 'First channel with 1 requests';
    
    var channelWithLargerNumberOfRequests = new JpipChannelMock();
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = channelWithLargerNumberOfRequests;
    channelWithLargerNumberOfRequests.resultByFunctionForTest['getAllQueuedRequestCount'] = 1;
    channelWithLargerNumberOfRequests.channelNameForTest = 'Second channel with 2 requests';

    created.session.tryGetChannel();
    
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = null;
    
    // Assert
    
    var channelActual = created.session.tryGetChannel();
    var channelExpected = null;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'tryGetChannel() should return no channel');
    });

QUnit.test(
    'tryGetChannel(dedicateForMovableRequest=true) when a single channel is ready',
    function(assert) {
        clearForSessionTest();
        
        // Act
        
        var created = createSessionForTest();
        
        created.channel.resultByFunctionForTest['getAllQueuedRequestCount'] = 0;
        
        // Assert
        
        var channelActual = created.session.tryGetChannel(/*dedicate=*/true);
        var channelExpected = created.channel;
        assert.deepEqual(
            channelActual,
            channelExpected,
            'tryGetChannel() should return the single active channel');
            
        var dedicateCallsCountActual = created.channel
            .namedArgsLogByFunctionForTest['dedicateForMovableRequest'].length;
        var dedicateCallsCountExpected = 1;
        assert.deepEqual(
            dedicateCallsCountActual,
            dedicateCallsCountExpected,
            'Expected single call to channel.dedicateForMovableRequest');
    });
    
QUnit.test(
    'tryGetChannel(dedicateForMovableRequest=true) when a single channel ' +
        'is ready but has active requests',
    function(assert) {
        var created = createSessionForTest();
        
        created.channel.resultByFunctionForTest['getAllQueuedRequestCount'] = 1;
        
        var newChannel = new JpipChannelMock();
        mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = newChannel;
        
        // Assert
        
        var channelActual = created.session.tryGetChannel(/*dedicate=*/true);
        var channelExpected = newChannel;
        assert.deepEqual(
            channelActual,
            channelExpected,
            'tryGetChannel() should return a new created channel');
            
        var dedicateCallsCountActual = newChannel.namedArgsLogByFunctionForTest[
            'dedicateForMovableRequest'].length;
        var dedicateCallsCountExpected = 1;
        assert.deepEqual(
            dedicateCallsCountActual,
            dedicateCallsCountExpected,
            'Expected single call to channel.dedicateForMovableRequest');
    });

QUnit.test('tryGetChannel() not returns previously dedicated channel', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest();
    
    created.channel.resultByFunctionForTest['getAllQueuedRequestCount'] = 0;
    created.session.tryGetChannel(/*dedicateForMovableRequest=*/true);
    
    var newChannel = new JpipChannelMock();
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = newChannel;
    
    // Assert
    
    var channelActual = created.session.tryGetChannel();
    var channelExpected = newChannel;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'tryGetChannel() should return a new created channel');
    });

QUnit.test('tryGetChannel() when all channels already dedicated', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({
        maxChannelsInSession: 2
        });
    
    var channel1 = created.channel;
    channel1.resultByFunctionForTest['getAllQueuedRequestCount'] = 0;
    channel1.channelNameForTest = 'First channel with 1 requests';
    
    var channel2 = new JpipChannelMock();
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = channel2;
    channel2.resultByFunctionForTest['getAllQueuedRequestCount'] = 0;
    channel2.channelNameForTest = 'Second channel with 2 requests';

    created.session.tryGetChannel(/*dedicate=*/true);
    created.session.tryGetChannel(/*dedicate=*/true);
    
    mockFactoryForProtocolTest.resultByFunctionForTest['createChannel'] = null;
    
    // Assert
    
    var channelActual = created.session.tryGetChannel();
    var channelExpected = null;
    assert.deepEqual(
        channelActual,
        channelExpected,
        'tryGetChannel() should return no channel');
    });

QUnit.test('close(): exception before open()', function(assert) {
    clearForSessionTest();
    
    // Act
    
    var created = createSessionForTest({ disableOpen: true });
    
    // Assert
    
    assert.throws(
        function callGetTargetIdBeforeOpen() {
            created.session.close();
        },
        jpipExceptions.InternalErrorException,
        'Exception expected on close() before open() called');
    });

QUnit.test('close(): exception on close twice', function(assert) {
    clearForSessionTest();
    
    var created = createSessionForTest();
    created.session.close();
    
    // Assert
    
    assert.throws(
        function callGetTargetIdBeforeOpen() {
            created.session.close();
        },
        jpipExceptions.InternalErrorException,
        'Exception expected on second close');
    });

QUnit.test(
    'close() should be deferred if server still didn\'t respond to open session request',
    function(assert) {
        clearForSessionTest();
        
        var closedCallbackCalls = 0;
        
        function closedCallbackMock() {
            ++closedCallbackCalls;
        }
        
        // Act
        
        var created = createSessionForTest({ disableFirstResponseCallback: true });
        created.session.close(closedCallbackMock);
        
        var createSessionCallback = created.channel.namedArgsLogByFunctionForTest
            ['sendMinimalRequest'][0].callback;
        createSessionCallback();
        
        var closedCallbackCallsBeforeSessionCreatedActual = closedCallbackCalls;
        
        var closeSessionCallback = created.sessionHelper
            .namedArgsLogByFunctionForTest['sendAjax'][0].callback;
        closeSessionCallback();
        
        var closedCallbackCallsAfterSessionCreatedActual = closedCallbackCalls;
        
        // Assert
        
        var closedCallbackCallsBeforeSessionCreatedExpected = 0;
        assert.deepEqual(
            closedCallbackCallsBeforeSessionCreatedActual,
            closedCallbackCallsBeforeSessionCreatedExpected,
            'No closedCallback call expected before server closed session');
    });

QUnit.test('close(): URL argument correctness', function(assert) {
    clearForSessionTest();
    
    // Act
    var created = createSessionForTest();
    created.session.close();
    
    var url = created.sessionHelper
        .namedArgsLogByFunctionForTest['sendAjax'][0].url;
    
    // Assert
    
    var urlRequestActual = ajaxHelperMock.getRequestFromUrlForTest(
        url);
    var urlRequestExpected = ajaxHelperMock.getRequestFromUrlForTest(
        created.url + '?type=jpp-stream&cclose=*&cid=' + created.channelId);
    assert.deepEqual(
        urlRequestActual,
        urlRequestExpected,
        'Correctness of URL argument');
    });

QUnit.test('keepAlive: Call to setInterval performed after session opened', function(assert) {
    clearForSessionTest();
    
    var setIntervalCalls = 0;
    
    function setIntervalMock(func, interval) {
        ++setIntervalCalls;
    }
    
    // Act
    var created = createSessionForTest({
        disableFirstResponseCallback: true,
        setInterval: setIntervalMock
        });
    
    var setIntervalCallsBeforeSessionOpenedActual = setIntervalCalls;
    
    var callback = created.channel.namedArgsLogByFunctionForTest.sendMinimalRequest[0].callback;
    callback();
    
    var setIntervalCallsAfterSessionOpenedActual = setIntervalCalls;
    
    // Assert
    
    var setIntervalCallsBeforeSessionOpenedExpected = 0;
    assert.deepEqual(
        setIntervalCallsBeforeSessionOpenedActual,
        setIntervalCallsBeforeSessionOpenedExpected,
        'No call to setInterval is expected before session is opened');
    
    var setIntervalCallsAfterSessionOpenedExpected = 1;
    assert.deepEqual(
        setIntervalCallsAfterSessionOpenedActual,
        setIntervalCallsAfterSessionOpenedExpected,
        'Single call to setInterval is expected when session is opened');
    });

QUnit.test('keepAlive: clearInterval call on close', function(assert) {
    clearForSessionTest();
    
    var correctIntervalHandle = 'Dummy interval handle 1543';
    var intervalHandle = correctIntervalHandle;
    var closedIntervalHandle = null;
    
    function setIntervalMock(func, interval) {
        var result = intervalHandle;
        intervalHandle = 'Wrong handle';
        
        return result;
    }
    
    function clearIntervalMock(intervalHandleToClose) {
        closedIntervalHandle = intervalHandleToClose;
    }
    
    // Act
    var created = createSessionForTest({
        setInterval: setIntervalMock,
        clearInterval: clearIntervalMock
        });
    created.session.close();
    
    // Assert
    
    var intervalHandleActual = closedIntervalHandle
    var intervalHandleExpected = correctIntervalHandle;
    assert.deepEqual(
        intervalHandleActual,
        intervalHandleExpected,
        'Correctness of handle argument');
    });

QUnit.test(
    'keepAlive: channel.sendMinimalRequest is called on keepAlive interval handler',
    function(assert) {
        clearForSessionTest();
        
        var intervalHandlerFunc;
        
        function setIntervalMock(func, interval) {
            intervalHandlerFunc = func;
            return 'Dummy interval handle 983';
        }
        
        var created = createSessionForTest({ setInterval: setIntervalMock });
        
        var sendMinimalRequestCallsLog =
            created.channel.namedArgsLogByFunctionForTest['sendMinimalRequest'];
        
        created.sessionHelper.resultByFunctionForTest['getActiveRequestsCount'] = 0;
        
        // Act
        var sendCallsAfterOpened = sendMinimalRequestCallsLog.length;
        
        intervalHandlerFunc();
        var sendCallsAfter1Intervals = sendMinimalRequestCallsLog.length;
        
        intervalHandlerFunc();
        var sendCallsAfter2Intervals = sendMinimalRequestCallsLog.length;
        
        intervalHandlerFunc();
        var sendCallsAfter3Intervals = sendMinimalRequestCallsLog.length;
        
        // Assert
        
        var sendCallsOnIntervalExpected = 1;
        
        var sendCallsOnFirstIntervalActual =
            sendCallsAfter1Intervals - sendCallsAfterOpened;
        assert.deepEqual(
            sendCallsOnFirstIntervalActual,
            sendCallsOnIntervalExpected,
            'Single channel.sendMinimalRequest expected on first interval');
        
        var sendCallsOnSecondIntervalActual =
            sendCallsAfter2Intervals - sendCallsAfter1Intervals;
        assert.deepEqual(
            sendCallsOnSecondIntervalActual,
            sendCallsOnIntervalExpected,
            'Single channel.sendMinimalRequest expected on second interval');
        
        var sendCallsOnThirdIntervalActual =
            sendCallsAfter3Intervals - sendCallsAfter2Intervals;
        assert.deepEqual(
            sendCallsOnThirdIntervalActual,
            sendCallsOnIntervalExpected,
            'Single channel.sendMinimalRequest expected on third interval');
    });

QUnit.test(
    'keepAlive: channel.sendMinimalRequest is NOT called on keepAlive interval handler if another request already active',
    function(assert) {
        clearForSessionTest();
        
        var intervalHandlerFunc;
        
        function setIntervalMock(func, interval) {
            intervalHandlerFunc = func;
            return 'Dummy interval handle 983';
        }
        
        var created = createSessionForTest({ setInterval: setIntervalMock });
        
        var sendMinimalRequestCallsLog =
            created.channel.namedArgsLogByFunctionForTest['sendMinimalRequest'];
        
        created.sessionHelper.resultByFunctionForTest['getActiveRequestsCount'] = 0;
        
        // Act

        intervalHandlerFunc();
        
        created.sessionHelper.resultByFunctionForTest['getActiveRequestsCount'] = 1;
        
        var sendCallsBeforeHasActiveRequests = sendMinimalRequestCallsLog.length;
        intervalHandlerFunc();
        var sendCallsAfterHasActiveRequests = sendMinimalRequestCallsLog.length;
        
        created.sessionHelper.resultByFunctionForTest['getActiveRequestsCount'] = 0;

        intervalHandlerFunc();
        var sendCallsAfterNoActiveRequests = sendMinimalRequestCallsLog.length;
        
        // Assert
        
        var sendCallsWhenHasActiveRequestsActual =
            sendCallsAfterHasActiveRequests - sendCallsBeforeHasActiveRequests;
        var sendCallsWhenHasActiveRequestsExpected = 0;
        assert.deepEqual(
            sendCallsWhenHasActiveRequestsActual,
            sendCallsWhenHasActiveRequestsExpected,
            'No calls to channel.sendMinimalRequest expected when has active requests');
        
        var sendCallsWhenNoActiveRequestsActual =
            sendCallsAfterNoActiveRequests - sendCallsAfterHasActiveRequests;
        var sendCallsWhenNoActiveRequestsExpected = 1;
        assert.deepEqual(
            sendCallsWhenNoActiveRequestsActual,
            sendCallsWhenNoActiveRequestsExpected,
            'Single channel.sendMinimalRequest expected when no active requests again');
    });