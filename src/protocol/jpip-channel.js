'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipChannel = function JpipChannel(
    maxRequestsWaitingForResponseInChannel, sessionHelper, jpipFactory) {
    
    var self = this;
    var channelId = null;
    var requestId = 0;
    var requestsWaitingForChannelCreation = [];
    var requestsWaitingForResponse = [];
    var isDedicatedForMovableRequest = false;
    
    this.requestData = function requestData(
        codestreamPartParams,
        callback,
        failureCallback,
        numQualityLayers) {
        
        if (!isDedicatedForMovableRequest) {
            // No need to check if there are too many concurrent requests
            // if channel was dedicated for movable request. The reason is
            // that any request in dedicated channel cancel the previous one.
            
            var allWaitingRequests = getAllQueuedRequestCount();
            
            if (allWaitingRequests >= maxRequestsWaitingForResponseInChannel) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Channel has too many requests not responded yet');
            }
        }

        var url = createRequestUrl(codestreamPartParams, numQualityLayers);
        var request = jpipFactory.createRequest(
            sessionHelper,
            self,
            url,
            callback,
            failureCallback);
        
        if (channelId !== null || requestsWaitingForResponse.length === 0) {
            requestsWaitingForResponse.push(request);
            request.startRequest();
        } else if (isDedicatedForMovableRequest) {
            // Those requests cancel all previous requests in channel, so no
            // need to log old requests
            requestsWaitingForChannelCreation = [request];
        } else {
            requestsWaitingForChannelCreation.push(request);
        }
        
        return request;
    };
    
    this.sendMinimalRequest = function sendMinimalRequest(callback) {
        if (channelId === null && requestsWaitingForResponse.length > 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Minimal requests should be used for first request or keep ' +
                'alive message. Keep alive requires an already initialized ' +
                'channel, and first request requires to not have any ' +
                'previous request');
        }
        
        var url = createMinimalRequestUrl();
        var request = jpipFactory.createRequest(
            sessionHelper, self, url, callback);
        
        requestsWaitingForResponse.push(request);
        request.startRequest();
    };
    
    this.getIsDedicatedForMovableRequest =
        function getIsDedicatedForMovableRequest() {
        
        return isDedicatedForMovableRequest;
    };
    
    this.dedicateForMovableRequest = function dedicateForMovableRequest() {
        if (isDedicatedForMovableRequest) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Channel already dedicated for movable request');
        }
        
        isDedicatedForMovableRequest = true;
    };
    
    this.getChannelId = function getChannelId() {
        return channelId;
    };
    
    this.setChannelId = function setChannelId(newChannelId) {
        if (newChannelId === null) {
            return;
        }
        
        channelId = newChannelId;
        
        var requestsToSend = requestsWaitingForChannelCreation;
        requestsWaitingForChannelCreation = [];
        
        for (var i = 0; i < requestsToSend.length; ++i) {
            requestsWaitingForResponse.push(requestsToSend[i]);
            requestsToSend[i].startRequest();
        }
    };
    
    this.nextRequestId = function nextRequestId() {
        return ++requestId;
    };
    
    this.getRequestsWaitingForResponse =
        function getRequestsWaitingForResponse() {
        
        return requestsWaitingForResponse;
    };
    
    this.getAllQueuedRequestCount = getAllQueuedRequestCount;
    
    this.requestEnded = function requestEnded(ajaxResponse, request) {
        var requests = requestsWaitingForResponse;
        var isFound = false;
        for (var i = 0; i < requests.length; ++i) {
            if (requests[i] === request) {
                requests[i] = requests[requests.length - 1];
                requests.length -= 1;
                isFound = true;
                break;
            }
        }
        
        if (!isFound) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'channel.requestsWaitingForResponse inconsistency');
        }
        
        sessionHelper.requestEnded(ajaxResponse, self);
        
        if (channelId === null && requestsWaitingForChannelCreation.length > 0) {
            // If not succeeded to create a channel ID yet,
            // perform an additional request
            
            var nextRequest = requestsWaitingForChannelCreation.shift();
            
            requestsWaitingForResponse.push(nextRequest);
            nextRequest.startRequest();
        }
    };
    
    this.isAllOldRequestsEnded = function isAllOldRequestsEnded(priorToId) {
        for (var i = 0; i < requestsWaitingForResponse.length; ++i) {
            if (requestsWaitingForResponse[i].lastRequestId <= priorToId) {
                return false;
            }
        }
        
        return true;
    };
    
    function getAllQueuedRequestCount() {
        var allWaitingRequests =
            requestsWaitingForResponse.length +
            requestsWaitingForChannelCreation.length;
        
        return allWaitingRequests;
    }
    
    function createMinimalRequestUrl(allowStopPreviousRequestsInChannel) {
        var requestUrl = sessionHelper.getDataRequestUrl();
        var targetId = sessionHelper.getTargetId();
        
        if (targetId !== '0') {
            requestUrl += '&tid=' + targetId;
        }
        
        var alreadySentMessagesOnChannel = channelId !== null;
        
        if (alreadySentMessagesOnChannel) {
            var isStopPrevious =
                isDedicatedForMovableRequest &&
                allowStopPreviousRequestsInChannel;
            
            if (isStopPrevious) {
                requestUrl += '&wait=no';
            } else {
                requestUrl += '&wait=yes';
            }
        }
        
        return requestUrl;
    }
        
    function createRequestUrl(codestreamPartParams, numQualityLayers) {
        var requestUrl = createMinimalRequestUrl(
            /*allowStopPreviousRequestsInChannel=*/true);
        
        var codestreamStructure = sessionHelper.getCodestreamStructure();
        
        var frameWidth = codestreamStructure.getLevelWidth(
            codestreamPartParams.level);
        var frameHeight = codestreamStructure.getLevelHeight(
            codestreamPartParams.level);
        
        var regionWidth =
            codestreamPartParams.maxXExclusive - codestreamPartParams.minX;
        var regionHeight =
            codestreamPartParams.maxYExclusive - codestreamPartParams.minY;
        
        requestUrl +=
            '&fsiz=' + frameWidth + ',' + frameHeight + ',closest' +
            '&rsiz=' + regionWidth + ',' + regionHeight +
            '&roff=' + codestreamPartParams.minX + ',' + codestreamPartParams.minY;
            
        if (numQualityLayers !== 'max') {
            requestUrl += '&layers=' + numQualityLayers;
        }
        
        return requestUrl;
    }
};