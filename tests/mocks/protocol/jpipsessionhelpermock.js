'use strict';

function JpipSessionHelperMock() {
    var mock = new MockHelper(this);
    
    var isReady = false;
    
    mock.addFunction(
        'setStatusCallback',
        ['statusCallback'],
        /*allowNotReturnValue=*/true);
    
    mock.addFunction(
        'setRequestEndedCallback',
        ['requestEndedCallback'],
        /*allowNotReturnValue=*/true);
    
    mock.addFunction(
        'channelCreated',
        ['channel'],
        /*allowNotReturnValue=*/true);
    
    mock.addFunction('getFirstChannel');
    
    mock.addFunction('getTargetId');
    
    mock.addFunction('getDataRequestUrl');
    
    mock.addFunction('getCodestreamStructure');
    
    mock.addFunction('getActiveRequestsCount');
    
    mock.addFunction('setIsReady', ['isReady'], /*allowNotReturnValue=*/true);
    
    mock.addFunction(
        'sendAjax',
        ['url', 'callback', 'failureCallback'],
        /*allowNotReturnValue=*/true);
    
    mock.addFunction(
        'requestEnded',
        ['ajaxResponse', 'channel'],
        /*allowNotReturnValue=*/true);
    
    mock.defineGetterOfLastCall(
        'statusCallbackForTest', 'setStatusCallback', 'statusCallback');
    
    mock.defineGetterOfLastCall(
        'requestEndedCallbackForTest',
        'setRequestEndedCallback',
        'requestEndedCallback');
        
    this.getIsReady = function getIsReady() {
        return isReady;
    };
    
    this.setIsReady = function setIsReady(isReady_) {
        isReady = isReady_;
    };
}