'use strict';

function clearForChannelTest() {
    mockFactoryForProtocolTest.clearForTest();
}

function createChannel(options) {
    options = options || {};

    var url = options.url || 'http://www.dummy.com/jpipserver?param=value';
    var targetId = options.targetId || 'dummy targetID';
    var maxRequestsWaitingForResponseInChannel =
        options.maxRequestsWaitingForResponseInChannel || 2;
    
    var levelSizes = options.levelSizes || [[10, 20]];
        
    var sessionHelper = new JpipSessionHelperMock();
    sessionHelper.resultByFunctionForTest['getDataRequestUrl'] = url;
    sessionHelper.resultByFunctionForTest['getTargetId'] = targetId;
    sessionHelper.resultByFunctionForTest['getCodestreamStructure'] =
        new JpipCodestreamStructureStub(null, null, levelSizes);
    
    var channel = new JpipChannel(
        maxRequestsWaitingForResponseInChannel,
        sessionHelper,
        mockFactoryForProtocolTest);
    
    return {
        channel: channel,
        sessionHelper: sessionHelper
        };
}

function requestData(createdChannel) {
    var request = new JpipRequestMock();
    
    mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
        request;
    
    var codestreamPartParams = {};
    
    createdChannel.channel.requestData(
        codestreamPartParams,
        'dummyCallback',
        'dummyFailureCallback');
    
    return request;
}

function testUrl(
    testName, numQualityLayers, targetId, urlSuffix, operationBefore) {
    
    QUnit.test(testName, function(assert) {
        clearForChannelTest();
        
        var dummyRequest = new JpipRequestMock();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            dummyRequest;
            
        var baseUrl = 'http://dummy.base.url.com/path?dummyKey=dummyValue';
        
        var levelWidth = 63;
        var levelHeight = 41;
        var level = 2;
        var levelSizes = [];
        levelSizes[level] = [levelWidth, levelHeight];
        
        var created = createChannel({
            url: baseUrl,
            levelSizes: levelSizes,
            targetId: targetId || '0'
            });
        
        var minX = 15;
        var minY = 92;
        var width = 53;
        var height = 923;
        var codestreamPartParams = {
            minX: minX,
            minY: minY,
            maxXExclusive: minX + width,
            maxYExclusive: minY + height,
            numResolutionLevelsToCut: level
            };
        var dummyCallback = 'dummy callback';
        var dummyFailureCallback = 'dummy failure callback';
        
        // Act
        
        if (operationBefore !== undefined) {
            operationBefore(created.channel);
        }
        
        created.channel.requestData(
            codestreamPartParams,
            dummyCallback,
            dummyFailureCallback,
            numQualityLayers);
        
        // Assert
        
        var urlExpected = baseUrl +
            '&fsiz=' + levelWidth + ',' + levelHeight + ',closest' +
            '&rsiz=' + width + ',' + height +
            '&roff=' + minX + ',' + minY;
        
        if (urlSuffix !== undefined) {
            urlExpected += urlSuffix;
        }
        
        var callsLog = mockFactoryForProtocolTest.
            namedArgsLogByFunctionForTest['createRequest'];
        var urlActual = callsLog[callsLog.length - 1].requestUrl;

        var parsedUrlExpected = ajaxHelperMock.getRequestFromUrlForTest(
            urlExpected);
        var parsedUrlActual = ajaxHelperMock.getRequestFromUrlForTest(
            urlActual);
        assert.deepEqual(
            parsedUrlActual, parsedUrlExpected, 'Correctness of url argument');
        
        clearForChannelTest();
    });
}

function testMinimalRequestUrl(
    testName, targetId, urlSuffix, operationBefore) {
    
    QUnit.test(testName, function(assert) {
        clearForChannelTest();
        
        var dummyRequest = new JpipRequestMock();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            dummyRequest;
            
        var baseUrl = 'http://dummy.base.url.com/path?dummyKey=dummyValue';
        
        var created = createChannel({
            url: baseUrl,
            targetId: targetId || '0'
            });
            
        var dummyCallback = 'dummy callback';
        
        // Act
        
        if (operationBefore !== undefined) {
            operationBefore(created.channel);
        }
        
        created.channel.sendMinimalRequest(dummyCallback);
        
        // Assert
        
        var urlExpected = baseUrl;
        
        if (urlSuffix !== undefined) {
            urlExpected += urlSuffix;
        }
        
        var callsLog = mockFactoryForProtocolTest.
            namedArgsLogByFunctionForTest['createRequest'];
        var urlActual = callsLog[callsLog.length - 1].requestUrl;

        var parsedUrlExpected = ajaxHelperMock.getRequestFromUrlForTest(
            urlExpected);
        var parsedUrlActual = ajaxHelperMock.getRequestFromUrlForTest(
            urlActual);
        assert.deepEqual(
            parsedUrlActual, parsedUrlExpected, 'Correctness of url argument');
        
        clearForChannelTest();
    });
}

function testExceptionOnTooManyRequests(testName, operationBefore) {
    QUnit.test(testName, function(assert) {
        clearForChannelTest();
        
        var created = createChannel({
            maxRequestsWaitingForResponseInChannel: 2
            });
            
        if (operationBefore !== undefined) {
            operationBefore(created.channel);
        }
            
        var codestreamPartParams = {};
        
        requestData(created);
        requestData(created);
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            new JpipRequestMock();

        assert.throws(
            function() {
                created.channel.requestData(
                    codestreamPartParams,
                    'dummyCallback',
                    'dummyFailureCallback');
            },
            jpipExceptions.InternalErrorException,
            'Expected exception when too many requests waiting for channel ' +
                'creation');
        
        clearForChannelTest();
        });
}

function testSingleRequestBeforeSetChannelId(
    testName, beforeOperation, isRequestsCanBeLost) {
    
    // When isRequestsCanBeLost = true, the third request below is overriden
    // by the fourth one. Thus the third request will not be started at all
    // and the fourth request will start right after the second has ended
    
    QUnit.test(testName, function(assert) {
        clearForChannelTest();
        
        var created = createChannel({
            maxRequestsWaitingForResponseInChannel: 3
            });
            
        if (beforeOperation !== undefined) {
            beforeOperation(created.channel);
        }
    
        // Act
        
        var firstRequest = requestData(created);
        var secondRequest = requestData(created);
        
        var startSecondRequestCallsBeforeFirstAnsweredActual =
            secondRequest.namedArgsLogByFunctionForTest['startRequest'].length;
            
        var ajaxResponse = 'Dummy AJAX response';
        created.channel.requestEnded(ajaxResponse, firstRequest);
        
        var startSecondRequestCallsAfterFirstAnsweredActual =
            secondRequest.namedArgsLogByFunctionForTest['startRequest'].length;
            
        var thirdRequest = requestData(created);
        var fourthRequest = requestData(created);
        
        var startThirdRequestCallsBeforeSecondAnsweredActual =
            thirdRequest.namedArgsLogByFunctionForTest['startRequest'].length;
        var startFourthRequestCallsBeforeSecondAnsweredActual =
            fourthRequest.namedArgsLogByFunctionForTest['startRequest'].length;
            
        created.channel.requestEnded(ajaxResponse, secondRequest);
        
        var startThirdRequestCallsAfterSecondAnsweredActual =
            thirdRequest.namedArgsLogByFunctionForTest['startRequest'].length;
        var startFourthRequestCallsBeforeThirdAnsweredActual =
            fourthRequest.namedArgsLogByFunctionForTest['startRequest'].length;

        if (!isRequestsCanBeLost) {
            created.channel.requestEnded(ajaxResponse, thirdRequest);
        }
        
        var startFourthRequestCallsAfterThirdAnsweredActual =
            fourthRequest.namedArgsLogByFunctionForTest['startRequest'].length;
            
        // Assert
        
        var startSecondRequestCallsBeforeFirstAnsweredExpected = 0;
        assert.deepEqual(
            startSecondRequestCallsBeforeFirstAnsweredActual,
            startSecondRequestCallsBeforeFirstAnsweredExpected,
            '2nd request should NOT be started BEFORE 1st answered');
            
        var startSecondRequestCallsAfterFirstAnsweredExpected = 1;
        assert.deepEqual(
            startSecondRequestCallsAfterFirstAnsweredActual,
            startSecondRequestCallsAfterFirstAnsweredExpected,
            '2nd request SHOULD be started AFTER 1st answered');
            
        var startThirdRequestCallsBeforeSecondAnsweredExpected = 0;
        assert.deepEqual(
            startThirdRequestCallsBeforeSecondAnsweredActual,
            startThirdRequestCallsBeforeSecondAnsweredExpected,
            '3rd request should NOT be started BEFORE 2nd answered');
            
        var startThirdRequestCallsAfterSecondAnsweredExpected = 
            isRequestsCanBeLost ? 0 : 1;
        assert.deepEqual(
            startThirdRequestCallsAfterSecondAnsweredActual,
            startThirdRequestCallsAfterSecondAnsweredExpected,
            '3rd request SHOULD be started AFTER 2nd answered');
            
        var startFourthRequestCallsBeforeSecondAnsweredExpected = 0;
        assert.deepEqual(
            startFourthRequestCallsBeforeSecondAnsweredActual,
            startFourthRequestCallsBeforeSecondAnsweredExpected,
            '4th request should NOT be started BEFORE 2nd answered');
            
        var startFourthRequestCallsBeforeThirdAnsweredExpected = 
            isRequestsCanBeLost ? 1 : 0;
        assert.deepEqual(
            startFourthRequestCallsBeforeThirdAnsweredActual,
            startFourthRequestCallsBeforeThirdAnsweredExpected,
            '4th request should NOT be started BEFORE 3rd answered');

        var startFourthRequestCallsAfterThirdAnsweredExpected = 1;
        assert.deepEqual(
            startFourthRequestCallsAfterThirdAnsweredActual,
            startFourthRequestCallsAfterThirdAnsweredExpected,
            '4th request SHOULD be started AFTER 3rd answered');

        clearForChannelTest();
    });
}

function testCreateRequestArgs(
    testName, callRequest, isFailureCallbackAndReturnRequest) {
    
    QUnit.test(testName, function(assert) {
        clearForChannelTest();
        
        var dummyRequest = new JpipRequestMock();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            dummyRequest;
            
        var created = createChannel();
        
        var dummyCallback = 'dummy callback';
        var dummyFailureCallback = 'dummy failure callback';
        
        // Act
        
        var requestActual = callRequest(
            created.channel,
            dummyCallback,
            dummyFailureCallback);
        
        // Assert
        
        var callsLog = mockFactoryForProtocolTest.
            namedArgsLogByFunctionForTest['createRequest'];
        var callsCountExpected = 1;
        var callsCountActual = callsLog.length;
        assert.deepEqual(
            callsCountActual,
            callsCountExpected,
            'Single call to createRequest() is expected');
        
        var callArgs = callsLog[0];
            
        var sessionHelperActual = callArgs.sessionHelper;
        var sessionHelperExpected = created.sessionHelper;
        assert.deepEqual(
            sessionHelperActual,
            sessionHelperExpected,
            'Correctness of sessionHelper argument passed to createRequest');
        
        var channelActual = callArgs.channel;
        var channelExpected = created.channel;
        assert.deepEqual(
            channelActual,
            channelExpected,
            'Correctness of channel argument passed to createRequest');
        
        var callbackActual = callArgs.callback;
        var callbackExpected = dummyCallback;
        assert.deepEqual(
            callbackActual,
            callbackExpected,
            'Correctness of callback argument passed to createRequest');
        
        var urlPrefixExpected = created.sessionHelper.getDataRequestUrl();
        var urlActual = callArgs.requestUrl;
        var urlPrefixActual = urlActual.substring(0, urlPrefixExpected.length);
        assert.deepEqual(
            urlPrefixActual,
            urlPrefixExpected,
            'Correctness of url argument passed to createRequest ' +
                '(check prefix only)');
        
        if (isFailureCallbackAndReturnRequest) {
            var requestExpected = dummyRequest;
            assert.deepEqual(
                requestActual,
                requestExpected,
                'Correctness of returned request');
            
            var failureCallbackActual = callArgs.failureCallback;
            var failureCallbackExpected = dummyFailureCallback;
            assert.deepEqual(
                failureCallbackActual,
                failureCallbackExpected,
                'Correctness of failureCallback argument passed to ' +
                    'createRequest');
        }
        
        clearForChannelTest();
        });
}

QUnit.module('JpipChannel');

testCreateRequestArgs(
    'requestData: check createRequest() call',
    function callRequest(channel, callback, failureCallback) {
        
        var codestreamPartParams = {};

        return channel.requestData(
            codestreamPartParams, callback, failureCallback);
    },
    /*isFailureCallbackAndReturnRequest=*/true);

testCreateRequestArgs(
    'sendMinimalRequest: check createRequest() call',
    function callRequest(channel, callback, failureCallback) {
        channel.sendMinimalRequest(callback);
    },
    /*isFailureCallbackAndReturnRequest=*/false);
    
testUrl(
    'requestData: URL correctness when numQualityLayers = \'max\'',
    /*numQualityLayers=*/'max');

testUrl(
    'requestData: URL correctness when numQualityLayers != \'max\'',
    /*numQualityLayers=*/'dummyNumQualityLayers',
    /*targetId=*/undefined,
    '&layers=dummyNumQualityLayers');

testUrl(
    'requestData: URL correctness with given targetId',
    /*numQualityLayers=*/'max',
    /*targetId=*/'dummy_targetId_834',
    '&tid=dummy_targetId_834');

testUrl(
    'requestData: URL correctness after channel ID allocated (wait=yes ' +
        'required)',
    /*numQualityLayers=*/'max',
    /*targetId=*/undefined,
    '&wait=yes',
    function performBeforeOperation(channel) {
        channel.setChannelId('dummyChannelId');
    });

testUrl(
    'requestData: URL correctness after channel ID allocated and dedicated ' +
        'for movable request (wait=no required)',
    /*numQualityLayers=*/'max',
    /*targetId=*/undefined,
    '&wait=no',
    function performBeforeOperation(channel) {
        channel.setChannelId('dummyChannelId');
        channel.dedicateForMovableRequest();
    });

testMinimalRequestUrl(
    'sendMinimalRequest: URL correctness without targetId or channel ID ' +
        'allocated');

testMinimalRequestUrl(
    'sendMinimalRequest: URL correctness with given targetId',
    /*targetId=*/'dummy_target_ID_923',
    '&tid=dummy_target_ID_923');

testMinimalRequestUrl(
    'sendMinimalRequest: URL correctness after channel ID allocated and ' +
        'channel dedicated for movable request',
    /*targetId=*/undefined,
    '&wait=yes',
    function performBeforeOperation(channel) {
        channel.setChannelId('dummyChannelId');
        channel.dedicateForMovableRequest();
    });

testMinimalRequestUrl(
    'sendMinimalRequest: URL correctness after channel ID allocated',
    /*targetId=*/undefined,
    '&wait=yes',
    function performBeforeOperation(channel) {
        channel.setChannelId('dummyChannelId');
    });

testSingleRequestBeforeSetChannelId(
    'Single request allowed before channel ID allocated (channel not ' +
        'dedicated for movable request, all requests should be performed)');

testSingleRequestBeforeSetChannelId(
    'Single request allowed before channel ID allocated (channel is ' +
        'dedicated for movable request, requests may be lost)',
    function beforeOperation(channel) {
        channel.dedicateForMovableRequest();
    },
    /*isRequestsCanBeLost=*/true);
    
    
testExceptionOnTooManyRequests(
    'requestData: Too many requests before channel created');

testExceptionOnTooManyRequests(
    'requestData: Too many requests after channel created',
    function beforeOperation(channel) {
        channel.setChannelId('Dummy channel ID');
    });
    
QUnit.test(
    'sendMinimalRequest: request.sendRequest() should be called',
    function(assert) {
        clearForChannelTest();
        
        var dummyRequest = new JpipRequestMock();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            dummyRequest;
            
        var created = createChannel();
        
        // Act
        
        created.channel.sendMinimalRequest();
        
        // Assert
        
        var callsLog = dummyRequest.namedArgsLogByFunctionForTest['startRequest'];
        
        var callsActual = callsLog.length;
        var callsExpected = 1;
        assert.deepEqual(
            callsActual, callsExpected, 'Expected single call to startRequest');
        
        clearForChannelTest();
});
    
QUnit.test(
    'sendMinimalRequest: should fail if active request exist',
    function(assert) {
        clearForChannelTest();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            new JpipRequestMock();

        var created = createChannel();
        created.channel.sendMinimalRequest();
        
        // Assert
        
        assert.throws(
            function() {
                created.channel.sendMinimalRequest();
            },
            jpipExceptions.InternalErrorException,
            'Expected exception if active request exist');

        clearForChannelTest();
});
    
QUnit.test(
    'sendMinimalRequest: should not fail when has channel ID even if active ' +
        'request exist (keep-alive message)',
    function(assert) {
        clearForChannelTest();
        
        var firstDummyRequest = new JpipRequestMock();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            firstDummyRequest;
            
        var created = createChannel();
        created.channel.sendMinimalRequest();
        created.channel.setChannelId('dummy channelID');

        var secondDummyRequest = new JpipRequestMock();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            secondDummyRequest;
        
        // Act
        
        created.channel.sendMinimalRequest();
        
        // Assert
        
        var callsLog = secondDummyRequest.namedArgsLogByFunctionForTest[
            'startRequest'];
        
        var callsActual = callsLog.length;
        var callsExpected = 1;
        assert.deepEqual(
            callsActual, callsExpected, 'Expected single call to startRequest');
        
        clearForChannelTest();
});
    
QUnit.test(
    'sendMinimalRequest: should not fail when no active request exist even ' +
        'if channel ID not set (request main header)',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();

        var dummyRequest = new JpipRequestMock();
        
        mockFactoryForProtocolTest.resultByFunctionForTest['createRequest'] =
            dummyRequest;
        
        // Act
        
        created.channel.sendMinimalRequest();
        
        // Assert
        
        var callsLog = dummyRequest.namedArgsLogByFunctionForTest[
            'startRequest'];
        
        var callsActual = callsLog.length;
        var callsExpected = 1;
        assert.deepEqual(
            callsActual, callsExpected, 'Expected single call to startRequest');
        
        clearForChannelTest();
});
    
QUnit.test(
    'getIsDedicatedForMovableRequest: should be false by default',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();
        
        var resultActual = created.channel.getIsDedicatedForMovableRequest();
        var resultExpected = false;
        assert.deepEqual(
            resultActual,
            resultExpected,
            'getIsDedicatedForMovableRequest should return false');
        
        clearForChannelTest();
});
    
QUnit.test(
    'getIsDedicatedForMovableRequest: should be true if dedicated',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();
        created.channel.dedicateForMovableRequest();
        
        var resultActual = created.channel.getIsDedicatedForMovableRequest();
        var resultExpected = true;
        assert.deepEqual(
            resultActual,
            resultExpected,
            'getIsDedicatedForMovableRequest should return true');
        
        clearForChannelTest();
});
    
QUnit.test(
    'dedicateForMovableRequest: should fail if called more than once',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();
        created.channel.dedicateForMovableRequest();
        
        assert.throws(
            function() {
                created.channel.dedicateForMovableRequest();
            },
            jpipExceptions.InternalErrorException,
            'Second dedicateForMovableRequest call should throw exception');
        
        clearForChannelTest();
});

QUnit.test(
    'getChannelId: should return null before setChannelId',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();
        
        var channelIdActual = created.channel.getChannelId();
        var channelIdExpected = null;
        assert.deepEqual(
            channelIdActual,
            channelIdExpected,
            'Expected getChannelId() === null');
            
        clearForChannelTest();
});

QUnit.test(
    'getChannelId & setChannelId: getChannelId should return value set by ' +
        'setChannelId',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();
        var channelId = 'dummy channel ID 653';
        
        created.channel.setChannelId(channelId);
        
        var channelIdActual = created.channel.getChannelId();
        var channelIdExpected = channelId;
        assert.deepEqual(
            channelIdActual,
            channelIdExpected,
            'Expected getChannelId() === null');
            
        clearForChannelTest();
});

QUnit.test(
    'setChannelId: setChannelId should succeed on second call if passed ' +
        'null to first call',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();
        var channelId = 'dummy channel ID 847';
        
        created.channel.setChannelId(null);
        created.channel.setChannelId(channelId);
        
        var channelIdActual = created.channel.getChannelId();
        var channelIdExpected = channelId;
        assert.deepEqual(
            channelIdActual,
            channelIdExpected,
            'Expected getChannelId() === null');
            
        clearForChannelTest();
});

QUnit.test(
    'setChannelId: pending requests should be sent',
    function(assert) {
        clearForChannelTest();
            
        var created = createChannel();
        
        created.channel.setChannelId('dummy channel ID 584');
        
        assert.ok(false);
            
        clearForChannelTest();
});