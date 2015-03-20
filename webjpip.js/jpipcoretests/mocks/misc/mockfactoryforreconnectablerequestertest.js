'use strict';

var mockFactoryForReconnectableRequesterTest = Object.create(jpipMockFactory);

mockFactoryForReconnectableRequesterTest.sessionToReturn = null;
    
mockFactoryForReconnectableRequesterTest.clearForTest = function clearForTest() {
    mockFactoryForReconnectableRequesterTest.sessionToReturn = null;
};
    
mockFactoryForReconnectableRequesterTest.createSession = function createSession(
    maxChannelsInSession,
    maxRequestsWaitingForResponseInChannel,
    targetId,
    codestreamStructure,
    databinsSaver) {
    
    var session =
        mockFactoryForReconnectableRequesterTest.sessionToReturn;
    
    if (session !== null) {
        mockFactoryForReconnectableRequesterTest.sessionToReturn = null;
        
        session.params = {
            maxChannelsInSession: maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel: maxRequestsWaitingForResponseInChannel,
            targetId: targetId,
            codestreamStructure: codestreamStructure,
            databinsSaver: databinsSaver
            };
        
        return session;
    }
    
    throw 'mockFactoryForReconnectableRequesterTest.sessionToReturn ' +
        'not set. Fix test';
};