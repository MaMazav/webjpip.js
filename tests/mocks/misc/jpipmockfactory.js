'use strict';

var jpipMockFactory = {
    createChannel: function createChannel(
        maxRequestsWaitingForResponseInChannel, sessionHelper) {
        
        throw 'Unexpected call to createChannel. Fix test';
    },
    
    createCodestreamReconstructor: function(
        codestreamStructure, databinsSaver, headerModifier, qualityLayersCache) {
        
        throw 'Unexpected call to createCodestreamReconstructor. Fix test';
    },
    
    createLevelCalculator: function(params) {
        throw 'Unexpected call to createLevelCalculator. Fix test';
    },
    
    createCodestreamStructure: function(structureParser, progressionOrder) {
        throw 'Unexpected call to createCodestreamStructure. Fix test';
    },
    
    createComponentStructure: function(params, tileStructure) {
        throw 'Unexpected call to createComponentStructure. Fix test';
    },
    
    createCompositeArray: function(offset) {
        throw 'Unexpected call to createCompositeArray. Fix test';
    },
    
    createDatabinParts: function(classId, inClassId) {
        throw 'Unexpected call to createDatabinParts. Fix test';
    },
    
    createDatabinsSaver: function(isJpipTilepartStream) {
        throw 'Unexpected call to createDatabinsSaver. Fix test';
    },
    
    createFetcher: function(
        requester, imageDataContext, dedicatedChannelHandle) {
            
        throw 'Unexpected call to createFetcher. Fix test';
    },
    
    createHeaderModifier: function(
        codestreamStructure, offsetsCalculator, progressionOrder) {
        
        throw 'Unexpected call to createHeaderModifier. Fix test';
    },
    
    createImageDataContext: function(
        jpipObjects, codestreamPartParams, progressiveness) {
        
        throw 'Unexpected call to createImageDataContext. Fix test';
    },
    
    createMarkersParser: function(mainHeaderDatabin) {
        throw 'Unexpected call to createMarkersParser. Fix test';
    },
    
    createObjectPoolByDatabin: function() {
        throw 'Unexpected call to createObjectPoolByDatabin. Fix test';
    },
    
    createOffsetsCalculator: function(mainHeaderDatabin, markersParser) {
        throw 'Unexpected call to createOffsetsCalculator. Fix test';
    },
    
    createPacketsDataCollector: function(
        codestreamStructure, databinsSaver, qualityLayersCache) {
        
        throw 'Unexpected call to createPacketsDataCollector. Fix test';
    },
    
    createRequestDatabinsListener: function createRequestDatabinsListener(
        codestreamPartParams,
        qualityLayerReachedCallback,
        codestreamStructure,
        databinsSaver,
        qualityLayersCache) {
        
        throw 'Unexpected call to createRequestDatabinsListener. Fix test';
    },
    
    createRequestParamsModifier: function createRequestParamsModifier(
        codestreamStructure) {
        
        throw 'Unexpected call to createRequestParamsModifier. Fix test';
    },
    
    createRequest: function createRequest(
        sessionHelper, channel, requestUrl, callback, failureCallback) {
        
        throw 'Unexpected call to createSessionHelper. Fix test';
    },
    
    createSessionHelper: function createSessionHelper(
        dataRequestUrl, knownTargetId, codestreamStructure, databinsSaver) {
        
        throw 'Unexpected call to createSessionHelper. Fix test';
    },
    
    createSession: function(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        targetId,
        codestreamStructure,
        databinsSaver) {
        
        throw 'Unexpected call to createSession. Fix test';
    },
        
    createReconnectableRequester: function(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaver) {
        
        throw 'Unexpected call to createReconnectableRequester. Fix test';
    },
    
    createStructureParser: function(databinsSaver, markersParser, offsetsCalculator) {
        throw 'Unexpected call to createStructureParser. Fix test';
    },
    
    createTileStructure: function(
        sizeParams, codestreamStructure, progressionOrder) {
        
        throw 'Unexpected call to createTileStructure. Fix test';
    },
    
    createBitstreamReader: function createBitstreamReader(databin) {
        throw 'Unexpected call to createBitstreamReader. Fix test';
    },
    
    createTagTree: function createTagTree(bitstreamReader, width, height) {
        throw 'Unexpected call to createTagTree. Fix test';
    },
    
    createCodeblockLengthParser: function createCodeblockLengthParser(
        bitstreamReader, transactionHelper) {
        
        throw 'Unexpected call to createCodeblockLengthParser. Fix test';
    },
    
    createSubbandLengthInPacketHeaderCalculator :
        function createSubbandLengthInPacketHeaderCalculator(
            bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband) {
        
        throw 'Unexpected call to ' +
            'createSubbandLengthInPacketHeaderCalculator. Fix test';
    },
    
    createPacketLengthCalculator: function createPacketLengthCalculator(
        tileStructure,
        componentStructure,
        databin,
        startOffsetInDatabin,
        precinct) {
        
        throw 'Unexpected call to createPacketLengthCalculator. Fix test';
    },

    createQualityLayersCache: function createQualityLayersCache(
        codestreamStructure) {
        
        throw 'Unexpected call to createQualityLayersCache. Fix test';
    }
};