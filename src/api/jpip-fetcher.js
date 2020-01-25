'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipFetcher;

/* global console: false */

function JpipFetcher(databinsSaver, fetcherSharedObjects, options, jpipFactory) {
    options = options || {};

    var isOpenCalled = false;
    var isCloseCalled = false;
    
    var resolveOpen = null;
    var rejectOpen = null;

    var url = options.url;
    var progressiveness;
    
    this.setProgressiveness = function setProgressiveness(progressiveness_) {
        progressiveness = progressiveness_;
    };
    
    this.open = function open() {
        if (isOpenCalled) {
            throw 'webJpip error: Cannot call JpipFetcher.open() twice';
        }
        isOpenCalled = true;
        
        if (fetcherSharedObjects.openedCount) {
            ++fetcherSharedObjects.openedCount;
            return fetcherSharedObjects.openPromise;
        }
        
        var progressionOrder = 'RPCL';
        var maxChannelsInSession = options.maxChannelsInSession || 1;
        var maxRequestsWaitingForResponseInChannel =
            options.maxRequestsWaitingForResponseInChannel || 1;

        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var markersParser = jpipFactory.createMarkersParser(mainHeaderDatabin);
        var offsetsCalculator = jpipFactory.createOffsetsCalculator(
            mainHeaderDatabin, markersParser);
        var structureParser = jpipFactory.createStructureParser(
            databinsSaver, markersParser, offsetsCalculator);
        
        fetcherSharedObjects.codestreamStructure = jpipFactory.createCodestreamStructure(
            structureParser, progressionOrder);
        fetcherSharedObjects.paramsModifier = jpipFactory.createRequestParamsModifier(
            fetcherSharedObjects.codestreamStructure);

        fetcherSharedObjects.requester = jpipFactory.createReconnectableRequester(
            maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel,
            fetcherSharedObjects.codestreamStructure,
            databinsSaver);
        
        fetcherSharedObjects.requester.setStatusCallback(requesterStatusCallback);
        
        fetcherSharedObjects.isOpenCalledBeforePromiseInitialized = false;
        fetcherSharedObjects.openedCount = 1;
        fetcherSharedObjects.openPromise = new Promise(function(resolve, reject) {
            resolveOpen = resolve;
            rejectOpen = reject;
            fetcherSharedObjects.requester.open(url);
        });
        
        return fetcherSharedObjects.openPromise;
    };
    
    this.close = function close() {
        return new Promise(function(resolve, reject) {
            if (isCloseCalled) {
                reject('Already closed');
                return;
            }
            if (!isOpenCalled) {
                reject('Not opened');
                return;
            }
            isCloseCalled = true;
            
            var opened = --fetcherSharedObjects.openedCount;
            if (opened < 0) {
                reject('Inconsistency in openedCount');
            }
            if (opened === 0) {
                fetcherSharedObjects.requester.close(resolve);
            }
        });
    };
    
    this.on = function on() {
        // Required for all imageDecoderFramework fetcher instances
    };

    this.startFetch = function startFetch(fetchContext, codestreamPartParams) {
        var paramsModified = fetcherSharedObjects.paramsModifier.modifyCodestreamPartParams(codestreamPartParams);
        var fetch = createFetch(fetchContext);
        
        fetch.move(paramsModified);
    };

    this.startMovableFetch = function startMovableFetch(fetchContext, codestreamPartParams) {
        var paramsModified = fetcherSharedObjects.paramsModifier.modifyCodestreamPartParams(codestreamPartParams);
        var fetch = createFetch(fetchContext);

        var dedicatedChannelHandle = fetcherSharedObjects.requester.dedicateChannelForMovableRequest();
        fetch.setDedicatedChannelHandle(dedicatedChannelHandle);
        fetchContext.on('move', fetch.move);

        fetch.move(paramsModified);
    };
    
    function createFetch(fetchContext) {
        //var imageDataContext = jpipFactory.createImageDataContext(
        //    jpipObjectsForRequestContext,
        //    codestreamPartParamsModified,
        //    progressivenessModified);
        //    //{
        //    //    disableServerRequests: !!options.isOnlyWaitForData,
        //    //    isMovable: false,
        //    //    userContextVars: userContextVars,
        //    //    failureCallback: options.failureCallback
        //    //});
        
        var fetch = jpipFactory.createFetch(fetchContext, fetcherSharedObjects.requester, progressiveness);

        fetchContext.on('isProgressiveChanged', fetch.isProgressiveChanged);
        fetchContext.on('terminate', fetch.terminate);
        fetchContext.on('stop', fetch.stop);
        fetchContext.on('resume', fetch.resum);
        
        return fetch;
    }
    
    //this.startMovableFetch = function startMovableFetch(imageDataContext, movableFetchState) {
    //    movableFetchState.dedicatedChannelHandle =
    //        requester.dedicateChannelForMovableRequest();
    //    movableFetchState.fetchHandle = jpipFactory.createFetchHandle(
    //        requester, imageDataContext, movableFetchState.dedicatedChannelHandle);
    //    movableFetchState.fetchHandle.resume();
    //};
    //
    //this.moveFetch = function moveFetch(imageDataContext, movableFetchState) {
    //    movableFetchState.fetchHandle.stopAsync();
    //    movableFetchState.fetchHandle = jpipFactory.createFetchHandle(
    //        requester, imageDataContext, movableFetchState.dedicatedChannelHandle);
    //    movableFetchState.fetchHandle.resume();
    //};
    
    this.reconnect = function reconnect() {
        fetcherSharedObjects.requester.reconnect();
    };
    
    function requesterStatusCallback(requesterStatus) {
        var serializableException = null;
        if (requesterStatus.exception !== null) {
            serializableException = requesterStatus.exception.toString();
        }
        
        var status = {
            isReady: requesterStatus.isReady,
            exception: serializableException
            };
        
        if (!resolveOpen || (!status.isReady && !status.exception)) {
            if (status.exception) {
                try {
                    // TODO: Nicer way to propagate errors from here is required
                    console.error('JpipFetcher.requesterStatusCallback got ' +
                        'unexpected exception: ' + status.exception);
                } catch(e) {
                    // Old IE not support console.log
                }
            }
            
            return;
        }
        
        var localResolve = resolveOpen;
        var localReject = rejectOpen;
        resolveOpen = null;
        rejectOpen = null;

        if (!status.isReady) {
            localReject(status.exception);
            return;
        }
        
        var params = fetcherSharedObjects.codestreamStructure.getSizesParams();
        var clonedParams = JSON.parse(JSON.stringify(params));
        
        var tile = fetcherSharedObjects.codestreamStructure.getDefaultTileStructure();
        var component = tile.getDefaultComponentStructure();

        clonedParams.imageLevel = 0;
        clonedParams.lowestQuality = 1;
        clonedParams.highestQuality = tile.getNumQualityLayers();
        clonedParams.numResolutionLevelsForLimittedViewer =
            component.getNumResolutionLevels();
        
        localResolve(clonedParams);
    }
    
    return this;
}