'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipReconnectableRequester(
    maxChannelsInSession,
    maxRequestsWaitingForResponseInChannel, 
    codestreamStructure,
    databinsSaver,
    jpipFactory,
    // NOTE: Move parameter to beginning and expose in CodestreamClient
    maxJpipCacheSizeConfig) {
    
    var MB = 1048576;
    var maxJpipCacheSize = maxJpipCacheSizeConfig || (10 * MB);
    
    var sessionWaitingForReady;
    var activeSession = null;
    var sessionWaitingForDisconnect = null;
    
    var url = null;
    var waitingForCloseSessions = 0;
    
    var nonDedicatedRequestsWaitingForSend = [];
    var dedicatedChannels = [];
    
    var statusCallback = null;
    var lastClosedCallback = null;
    
    this.getIsReady = function getIsReady() {
        return activeSession !== null && activeSession.getIsReady();
    };
    
    this.open = function open(baseUrl) {
        if (baseUrl === undefined || baseUrl === null) {
            throw new jGlobals.jpipExceptions.ArgumentException('baseUrl', baseUrl);
        }
        
        if (url !== null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Image was already opened');
        }
        
        url = baseUrl;
        createInternalSession();
    };
    
    this.close = function close(closedCallback) {
        if (lastClosedCallback !== null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('closed twice');
        }
        
        lastClosedCallback = closedCallback;
        waitingForCloseSessions = 1;
        
        closeInternalSession(activeSession);
        closeInternalSession(sessionWaitingForReady);
        closeInternalSession(sessionWaitingForDisconnect);
        
        checkIfAllSessionsClosedAfterSessionClosed();
    };

    this.setStatusCallback = function setStatusCallback(newStatusCallback) {
        statusCallback = newStatusCallback;
        
        if (activeSession !== null) {
            activeSession.setStatusCallback(newStatusCallback);
        }
    };
    
    this.dedicateChannelForMovableRequest =
        function dedicateChannelForMovableRequest() {

        checkReady();
        
        var dedicatedChannelHandle = { internalDedicatedChannel: null };
        dedicatedChannels.push(dedicatedChannelHandle);
        createInternalDedicatedChannel(dedicatedChannelHandle);
        
        return dedicatedChannelHandle;
    };
    
    this.requestData = function requestData(
        codestreamPartParams,
        callback,
        failureCallback,
        numQualityLayers,
        dedicatedChannelHandleToMove) {

        checkReady();
        
        var request = {
            isEnded: false,
            internalRequest: null,
            
            codestreamPartParams: codestreamPartParams,
            callback: callback,
            failureCallback: failureCallback,
            numQualityLayers: numQualityLayers
            };
        
        var channel;
        var moveDedicatedChannel = !!dedicatedChannelHandleToMove;
        
        if (moveDedicatedChannel) {
            channel = dedicatedChannelHandleToMove.internalDedicatedChannel;
        } else {
            channel = activeSession.tryGetChannel();
            
            if (channel === null) {
                nonDedicatedRequestsWaitingForSend.push(request);
                return request;
            } else if (channel.getIsDedicatedForMovableRequest()) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Expected non-movable channel');
            }
        }
        
        if (channel.getIsDedicatedForMovableRequest() !== moveDedicatedChannel) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'getIsDedicatedForMovableRequest inconsistency');
        }

        request.internalRequest = channel.requestData(
            codestreamPartParams,
            callback,
            failureCallback,
            numQualityLayers);

        return request;
    };
    
    this.stopRequestAsync = function stopRequestAsync(request) {
        request.isEnded = true;
        
        if (request.internalRequest !== null) {
            request.internalRequest.stopRequestAsync();
        }
    };
    
    this.reconnect = reconnect;
    
    function reconnect() {
        if (sessionWaitingForReady !== null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Previous session still not established');
        }
        
        if (sessionWaitingForDisconnect !== null) {
            if (statusCallback !== null) {
                statusCallback({
                    isReady: true,
                    exception: //jpipExceptions.IllegalOperationException(
                        'Previous session that should be closed still alive.' +
                        'Maybe old requestContexts have not beed closed. ' +
                        'Reconnect will not be done' //);
                    });
            }
            
            return;
        }
        
        databinsSaver.cleanupUnregisteredDatabins();
        createInternalSession();
    }
    
    function createInternalSession() {
        var targetId;
        if (activeSession !== null) {
            targetId = activeSession.getTargetId();
        }
        
        sessionWaitingForReady = jpipFactory.createSession(
            maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel,
            targetId,
            codestreamStructure,
            databinsSaver);
            
        sessionWaitingForReady.setStatusCallback(waitingForReadyCallback);
        
        sessionWaitingForReady.open(url);
    }
    
    function createInternalDedicatedChannel(dedicatedChannelHandle) {
        var channel = activeSession.tryGetChannel(
            /*dedicateForMovableRequest=*/true);
        
        if (channel === null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Too many concurrent requests. Limit the use of dedicated ' +
                '(movable) requests, enlarge maxChannelsInSession or wait ' +
                'for requests to finish and avoid create new ones');
        }
        
        if (!channel.getIsDedicatedForMovableRequest()) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'getIsDedicatedForMovableRequest inconsistency');
        }

        dedicatedChannelHandle.internalDedicatedChannel = channel;
    }
    
    function waitingForReadyCallback(status) {
        if (sessionWaitingForReady === null ||
            status.isReady !== sessionWaitingForReady.getIsReady()) {
            
            throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected ' +
                'statusCallback when not registered to session or ' +
                'inconsistent isReady');
        }
        
        if (status.isReady) {
            if (sessionWaitingForDisconnect !== null) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'sessionWaitingForDisconnect should be null');
            }
            
            sessionWaitingForDisconnect = activeSession;
            activeSession = sessionWaitingForReady;
            sessionWaitingForReady = null;
            
            if (sessionWaitingForDisconnect !== null) {
                sessionWaitingForDisconnect.setStatusCallback(null);
                if (!tryDisconnectWaitingSession()) {
                    sessionWaitingForDisconnect.setRequestEndedCallback(
                        tryDisconnectWaitingSession);
                }
            }
            
            activeSession.setStatusCallback(statusCallback);
            activeSession.setRequestEndedCallback(activeSessionRequestEndedCallback);
            
            for (var i = 0; i < dedicatedChannels.length; ++i) {
                createInternalDedicatedChannel(dedicatedChannels[i]);
            }
        }
        
        if (statusCallback !== null) {
            statusCallback(status);
        }
    }
    
    function closeInternalSession(session) {
        if (session !== null) {
            ++waitingForCloseSessions;
            session.close(checkIfAllSessionsClosedAfterSessionClosed);
        }
    }
    
    function checkIfAllSessionsClosedAfterSessionClosed() {
        --waitingForCloseSessions;
        
        if (waitingForCloseSessions === 0 && lastClosedCallback !== undefined) {
            lastClosedCallback();
        }
    }
    
    function checkReady() {
        if (activeSession === null) {
            throw new jGlobals.jpipExceptions.InternalErrorException('This operation ' +
                'is forbidden when session is not ready');
        }
    }
    
    function activeSessionRequestEndedCallback(channelFreed) {
        var request = null;
        
        if (databinsSaver.getLoadedBytes() > maxJpipCacheSize) {
            reconnect();
        }
        
        if (channelFreed === null) {
            return;
        }
        
        if (channelFreed.getIsDedicatedForMovableRequest()) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Expected non-movable channel as channelFreed');
        }
        
        do {
            if (nonDedicatedRequestsWaitingForSend.length === 0) {
                request = null;
                break;
            }
            
            request = nonDedicatedRequestsWaitingForSend.shift();
            if (request.internalRequest !== null) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Request was ' +
                    'already sent but still in queue');
            }
        } while (request.isEnded);
        
        if (request !== null) {
            request.internalRequest = channelFreed.requestData(
                request.codestreamPartParams,
                request.callback,
                request.failureCallback,
                request.numQualityLayers);
        }
    }
    
    function tryDisconnectWaitingSession() {
        var canCloseSession = !sessionWaitingForDisconnect.hasActiveRequests();
        
        if (canCloseSession) {
            sessionWaitingForDisconnect.close();
            sessionWaitingForDisconnect = null;
        }
        
        return canCloseSession;
    }
};