'use strict';

var jpipReconnectableRequesterMock = {
    statusCallbackForTest: null,
    
    closeCallsForTest: 0,
    
    isReadyForTest: true,
    
    requestTileArgsForTest: null,
    
    requestTileCallbackForTest: null,
    
    clearForTest: function() {
        jpipReconnectableRequesterMock.statusCallbackForTest = null;
        jpipReconnectableRequesterMock.closeCallsForTest = 0;
        jpipReconnectableRequesterMock.isReadyForTest = true;
        jpipReconnectableRequesterMock.requestTileArgsForTest = null;
        jpipReconnectableRequesterMock.requestTileCallbackForTest = null;
    },
    
    callStatusCallbackForTest: function(isReady, exception) {
        if (jpipReconnectableRequesterMock.statusCallbackForTest === null) {
            return;
        }
        
        var status = {
            isReady: isReady,
            exception: exception
            };
        
        jpipReconnectableRequesterMock.statusCallbackForTest(status);
    },
    
    callRequestTileCallbackForTest: function() {
        if (jpipReconnectableRequesterMock.requestTileCallbackForTest === null) {
            throw 'No requestTile callback to call. Fix test or implementation';
        }
        
        var callback = jpipReconnectableRequesterMock.requestTileCallbackForTest;
        jpipReconnectableRequesterMock.requestTileCallbackForTest = null;
        
        callback();
    },
    
    setStatusCallback: function(callback) {
        jpipReconnectableRequesterMock.statusCallbackForTest = callback;
    },
    
    close: function() {
        ++jpipReconnectableRequesterMock.closeCallsForTest;
    },
    
    getIsReady: function() {
        return jpipReconnectableRequesterMock.isReadyForTest;
    },
    
    requestTile: function(tileParams, callback) {
        jpipReconnectableRequesterMock.requestTileArgsForTest = {
            tileParams: tileParams
            };
        
        if (jpipReconnectableRequesterMock.requestTileCallbackForTest !== null) {
            'throw double call to requestTile without calling callback ' +
            'between them. Fix implementation or test';
        }
        
        if (callback !== undefined) {
            jpipReconnectableRequesterMock.requestTileCallbackForTest = callback;
        }
    }
};