'use strict';

var mockFactoryForProtocolTest = Object.create(jpipMockFactory);

var mockHelperForMockFactoryForProtocolTest = new MockHelper(mockFactoryForProtocolTest);

mockFactoryForProtocolTest.clearForTest = function clearForTest() {
    mockHelperForMockFactoryForProtocolTest.clearForTest();
};

mockHelperForMockFactoryForProtocolTest.addFunction(
    'createChannel',
    ['maxRequestsWaitingForResponseInChannel', 'sessionHelper']);

mockHelperForMockFactoryForProtocolTest.addFunction('createSessionHelper', [
    'dataRequestUrl',
    'knownTargetId',
    'codestreamStructure',
    'databinsSaver']);

mockHelperForMockFactoryForProtocolTest.addFunction(
    'createRequest',
    ['sessionHelper', 'channel', 'requestUrl', 'callback', 'failureCallback']);