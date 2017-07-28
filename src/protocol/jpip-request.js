'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipRequest(
    sessionHelper,
    messageHeaderParser,
    channel,
    requestUrl,
    callback,
    failureCallback) {
    
    var KB = 1024;
    var PROGRESSIVENESS_MIN_LENGTH_BYTES = 10 * KB;

    var RESPONSE_ENDED_SUCCESS = 1;
    var RESPONSE_ENDED_ABORTED = 2;
    var RESPONSE_ENDED_SENT_ANOTHER_MESSAGE = 3;
    
    var self = this;
    var isActive = false;
    var endedByUser = false;
    var lastRequestId;
    var responseLength = PROGRESSIVENESS_MIN_LENGTH_BYTES;
    
    this.startRequest = function startRequest() {
        if (isActive) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'startRequest called twice');
        } else if (endedByUser) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'request was already stopped');
        }
        
        isActive = true;
        sessionHelper.requestStarted();
        
        sendMessageOfDataRequest();
    };

    this.stopRequestAsync = function stopRequestAsync(request) {
        endedByUser = true;
    };
    
    this.getLastRequestId = function getLastRequestId() {
        if (!isActive) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Unexpected call to getLastRequestId on inactive request');
        }
        
        return lastRequestId;
    };
    
    this.callCallbackAfterConcurrentRequestsFinished =
        function callCallbackAfterConcurrentRequestsFinished() {
        
        callback(self, /*isResponseDone=*/true);
    };
    
    function internalSuccessCallback(ajaxResponse, isResponseDone) {
        var failed = false;

        try {
            var endedReason = processAjaxResponse(ajaxResponse, isResponseDone);
            
            if (endedReason === RESPONSE_ENDED_SENT_ANOTHER_MESSAGE) {
                return;
            }
            
            failed = endedReason === RESPONSE_ENDED_ABORTED;
        } catch (e) {
            failed = true;
            sessionHelper.onException(e);
        }
        
        try {
            if (!failed) {
                sessionHelper.waitForConcurrentRequestsToEnd(self);
            }
            
            channel.requestEnded(ajaxResponse, self);

            if (failed && !endedByUser && failureCallback !== undefined) {
                failureCallback();
            }
            
            sessionHelper.checkConcurrentRequestsFinished();
        } catch (e) {
            sessionHelper.onException(e);
        }
    }
    
    function internalFailureCallback(ajaxResponse) {
        channel.requestEnded(ajaxResponse, self);
        sessionHelper.checkConcurrentRequestsFinished();
        
        if (failureCallback !== undefined) {
            failureCallback();
        }
    }
    
    function processAjaxResponse(ajaxResponse, isResponseDone) {
        if (!isResponseDone) {
            throw new jGlobals.jpipExceptions.InternalErrorException('AJAX ' +
                'callback called although response is not done yet ' +
                'and chunked encoding is not enabled');
        }
                
        var createdChannel = sessionHelper.getCreatedChannelId(
            ajaxResponse);
        
        if (createdChannel !== null) {
            if (channel.getChannelId() !== null) {
                sessionHelper.onException(
                    new jGlobals.jpipExceptions.IllegalDataException(
                        'Channel created although was not requested', 'D.2.3'));
            } else {
                channel.setChannelId(createdChannel);
            }
        } else if (channel.getChannelId() === null) {
            sessionHelper.onException(
                new jGlobals.jpipExceptions.IllegalDataException(
                    'Cannot extract cid from cnew response', 'D.2.3'));
        }
        
        var endOffset = saveToDatabinsFromOffset(ajaxResponse);
        
        if (endOffset === null) {
            return RESPONSE_ENDED_ABORTED;
        }
        
        var endedReason = parseEndOfResponse(ajaxResponse, endOffset);
        return endedReason;
    }
    
    function sendMessageOfDataRequest() {
        lastRequestId = channel.nextRequestId();
        
        var url = requestUrl +
            '&len=' + responseLength +
            '&qid=' + lastRequestId;
        
        responseLength *= 2;
        
        var shouldCreateChannel = channel.getChannelId() === null;
        if (shouldCreateChannel) {
            url += '&cnew=http';
            
            var existChannelInSession = sessionHelper.getFirstChannel();
                
            if (existChannelInSession !== null) {
                url += '&cid=' + existChannelInSession.getChannelId();
            }
            
            // NOTE: If existChannelInSession, maybe should remove "&stream=0"
        } else {
            url += '&cid=' + channel.getChannelId();
        }
        
        sessionHelper.sendAjax(
            url,
            internalSuccessCallback,
            internalFailureCallback);
    }
    
    function parseEndOfResponse(ajaxResponse, offset) {
        var endResponseResult = RESPONSE_ENDED_ABORTED;
        var bytes = new Uint8Array(ajaxResponse.response);
        
        if (offset > bytes.length - 2 ||
            bytes[offset] !== 0) {
            
            throw new jGlobals.jpipExceptions.IllegalDataException('Could not find ' +
                'End Of Response (EOR) code at the end of response', 'D.3');
        }
        
        switch (bytes[offset + 1]) {
            case jGlobals.jpipEndOfResponseReasons.IMAGE_DONE:
            case jGlobals.jpipEndOfResponseReasons.WINDOW_DONE:
            case jGlobals.jpipEndOfResponseReasons.QUALITY_LIMIT:
                endResponseResult = RESPONSE_ENDED_SUCCESS;
                break;
            
            case jGlobals.jpipEndOfResponseReasons.WINDOW_CHANGE:
                if (!endedByUser) {
                    throw new jGlobals.jpipExceptions.IllegalOperationException(
                        'Server response was terminated due to newer ' +
                        'request issued on same channel. That may be an ' +
                        'internal webjpip.js error - Check that movable ' +
                        'requests are well maintained');
                }
                break;
            
            case jGlobals.jpipEndOfResponseReasons.BYTE_LIMIT:
            case jGlobals.jpipEndOfResponseReasons.RESPONSE_LIMIT:
                if (!endedByUser) {
                    sendMessageOfDataRequest();
                    endResponseResult = RESPONSE_ENDED_SENT_ANOTHER_MESSAGE;
                }
                
                break;
            
            case jGlobals.jpipEndOfResponseReasons.SESSION_LIMIT:
                sessionHelper.onException(
                    new jGlobals.jpipExceptions.IllegalOperationException(
                        'Server resources associated with the session is ' +
                        'limitted, no further requests should be issued to ' +
                        'this session'));
                break;
            
            case jGlobals.jpipEndOfResponseReasons.NON_SPECIFIED:
                sessionHelper.onException(new jGlobals.jpipExceptions.IllegalOperationException(
                    'Server error terminated response with no reason specified'));
                break;
                    
            default:
                sessionHelper.onException(
                    new jGlobals.jpipExceptions.IllegalDataException(
                        'Server responded with illegal End Of Response ' +
                        '(EOR) code: ' + bytes[offset + 1]));
                break;
        }
        
        return endResponseResult;
    }
    
    function saveToDatabinsFromOffset(ajaxResponse) {
        try {
            var bytes = new Uint8Array(ajaxResponse.response);
            
            var offset = 0;
            var previousHeader;
            
            while (offset < bytes.length) {
                if (bytes[offset] === 0) {
                    // End Of Response (EOR)
                    break;
                }
                
                var header = messageHeaderParser.parseMessageHeader(
                    bytes, offset, previousHeader);
                
                if (header.bodyStart + header.messageBodyLength > bytes.length) {
                    return offset;
                }
                
                sessionHelper.getDatabinsSaver().saveData(header, bytes);
                
                offset = header.bodyStart + header.messageBodyLength;
                previousHeader = header;
            }
            
            return offset;
        } catch (e) {
            sessionHelper.onException(e);
            
            return null;
        }
    }
};