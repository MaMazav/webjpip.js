'use strict';

var ajaxHelperMock = {
    lastRequestForTest: [],
    
    callbacks: [],
    
    toggledSuccessOrFailureCallback: [],
    
    allowMoreThanLastRequest: false,
    
    clearForTest: function clearForTest() {
        ajaxHelperMock.lastRequestForTest = [];
        ajaxHelperMock.callbacks = [];
        ajaxHelperMock.toggledSuccessOrFailureCallback = [];
        ajaxHelperMock.allowMoreThanLastRequest = false;
        ajaxHelperMock.response = '';
        ajaxHelperMock.request = ajaxHelperMock.requestOriginal;
    },
    
    getLastRequestForTest: function getLastSplittedUrlForTest() {
        if (ajaxHelperMock.lastRequestForTest.length === 0) {
            return null;
        }
        
        var result = ajaxHelperMock.lastRequestForTest[0];
        ajaxHelperMock.lastRequestForTest =
            ajaxHelperMock.lastRequestForTest.slice(1);
        
        return result;
    },
    
    getLastCallbackForTest: function getLastCallbackForTest() {
        var result = ajaxHelperMock.callbacks[0];
        
        if (!result) {
            throw 'No callback. Fix test or implementation';
        }
        
        ajaxHelperMock.toggledSuccessOrFailureCallback.shift();
        ajaxHelperMock.callbacks.shift();
        
        return result;
    },
    
    toggleLastRequestFailedForTest: function toggle() {
        var swap = ajaxHelperMock.callbacks[0];

        if (!swap) {
            throw 'No pending request. Fix test or implementation';
        }
        
        ajaxHelperMock.callbacks[0] =
            ajaxHelperMock.toggledSuccessOrFailureCallback[0];
        ajaxHelperMock.toggledSuccessOrFailureCallback[0] = swap;
    },
    
    getRequestFromUrlForTest: function getRequestFromUrlForTest(url) {
        var urlAndQuery = url.split('?');
        if (urlAndQuery.length !== 2) {
            throw 'Could not split URL ' + url +
                ' into base URL and query string. Fix test';
        }
        
        var result = {
            baseUrl: urlAndQuery[0]
            };
        
        var urlParams = urlAndQuery[1].split('&');
        
        for (var i = 0; i < urlParams.length; ++i) {
            var keyAndValue = urlParams[i].split('=');
            if (keyAndValue.length !== 2) {
                throw 'Could not split URL parameter ' + urlParams[i] +
                    ' into key and value. Fix test';
            }
            
            result[keyAndValue[0]] = keyAndValue[1];
        }
        
        return result;
    },
    
    response: '',
    
    requestOriginal: function request(
        url,
        callbackForAsynchronousRequest,
        failureCallbackForAsynchronousRequest) {
        
        if (ajaxHelperMock.lastRequestForTest.length > 0 &&
            !ajaxHelperMock.allowMoreThanLastRequest) {
            
            throw 'request() was changed twice without ' +
                'getLastRequestForTest. Fix test';
        }
        
        var request = ajaxHelperMock.getRequestFromUrlForTest(url);
        
        var newIndex = ajaxHelperMock.lastRequestForTest.length;
        ajaxHelperMock.lastRequestForTest[newIndex] = request;
        
        ajaxHelperMock.callbacks[newIndex] =
            callbackForAsynchronousRequest;
        ajaxHelperMock.toggledSuccessOrFailureCallback[newIndex] =
            failureCallbackForAsynchronousRequest;
        
        return 'Dummy AJAX handle';
    }
};