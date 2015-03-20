'use strict';

function JpipChannelMock(targetId) {
    var mock = new MockHelper(this);
    
    mock.addFunction(
        'requestData',
        ['codestreamPartParams', 'callback', 'failureCallback', 'numQualityLayers'],
        /*allowNotReturnValue=*/true);
        
    mock.addFunction(
        'sendMinimalRequest', ['callback'], /*allowNotReturnValue=*/true);
    
    mock.addFunction('getIsDedicatedForMovableRequest');
    
    mock.addFunction('getChannelId');
    
    mock.addFunction('getRequestsWaitingForResponse');
    
    mock.addFunction('getAllQueuedRequestCount');
    
    mock.addFunction(
        'dedicateForMovableRequest', [], /*allowNotReturnValue=*/true);
}