'use strict';

var simpleAjaxHelper                 = require('simple-ajax-helper.js'                 ).simpleAjaxHelper;
var mutualExclusiveTransactionHelper = require('mutual-exclusive-transaction-helper.js').mutualExclusiveTransactionHelper;

var jpipCodingPassesNumberParser = require('jpip-coding-passes-number-parser.js').jpipCodingPassesNumberParser;
var jpipMessageHeaderParser      = require('jpip-message-header-parser.js'      ).jpipMessageHeaderParser;

var JpipChannel                               = require('jpip-channel.js'                                   ).JpipChannel;
var JpipCodestreamReconstructor               = require('jpip-codestream-reconstructor.js'                  ).JpipCodestreamReconstructor;
var JpipCodestreamSizesCalculator             = require('jpip-codestream-sizes-calculator.js'               ).JpipCodestreamSizesCalculator;
var JpipCodestreamStructure                   = require('jpip-codestream-structure.js'                      ).JpipCodestreamStructure;
var JpipComponentStructure                    = require('jpip-component-structure.js'                       ).JpipComponentStructure;
var CompositeArray                            = require('composite-array.js'                                ).CompositeArray;
var JpipDatabinParts                          = require('jpip-databin-parts.js'                             ).JpipDatabinParts;
var JpipDatabinsSaver                         = require('jpip-databins-saver.js'                            ).JpipDatabinsSaver;
var JpipFetchHandle                           = require('jpip-fetch-handle.js'                              ).JpipFetchHandle;
var JpipHeaderModifier                        = require('jpip-header-modifier.js'                           ).JpipHeaderModifier;
var JpipImageDataContext                      = require('jpip-image-data-context.js'                        ).JpipImageDataContext;
var JpipMarkersParser                         = require('jpip-markers-parser.js'                            ).JpipMarkersParser;
var JpipObjectPoolByDatabin                   = require('jpip-object-pool-by-databin.js'                    ).JpipObjectPoolByDatabin;
var JpipOffsetsCalculator                     = require('jpip-offsets-calculator.js'                        ).JpipOffsetsCalculator;
var JpipPacketsDataCollector                  = require('jpip-packets-data-collector.js'                    ).JpipPacketsDataCollector;
var JpipRequestDatabinsListener               = require('jpip-request-databins-listener.js'                 ).JpipRequestDatabinsListener;
var JpipRequest                               = require('jpip-request.js'                                   ).JpipRequest;
var JpipSessionHelper                         = require('jpip-session-helper.js'                            ).JpipSessionHelper;
var JpipSession                               = require('jpip-session.js'                                   ).JpipSession;
var JpipReconnectableRequester                = require('jpip-reconnectable-requester.js'                   ).JpipReconnectableRequester;
var JpipStructureParser                       = require('jpip-structure-parser.js'                          ).JpipStructureParser;
var JpipTileStructure                         = require('jpip-tile-structure.js'                            ).JpipTileStructure;
var JpipBitstreamReader                       = require('jpip-bitstream-reader.js'                          ).JpipBitstreamReader;
var JpipTagTree                               = require('jpip-tag-tree.js'                                  ).JpipTagTree;
var JpipCodeblockLengthParser                 = require('jpip-codeblock-length-parser.js'                   ).JpipCodeblockLengthParser;
var JpipSubbandLengthInPacketHeaderCalculator = require('jpip-subband-length-in-packet-header-calculator.js').JpipSubbandLengthInPacketHeaderCalculator;
var JpipPacketLengthCalculator                = require('jpip-packet-length-calculator.js'                  ).JpipPacketLengthCalculator;
var JpipQualityLayersCache                    = require('jpip-quality-layers-cache.js'                      ).JpipQualityLayersCache;

var jpipRuntimeFactory = {
    createChannel: function createChannel(
        maxRequestsWaitingForResponseInChannel, sessionHelper) {
        
        return new JpipChannel(
            maxRequestsWaitingForResponseInChannel,
            sessionHelper,
            jpipRuntimeFactory);
    },
    
    createCodestreamReconstructor: function(
        codestreamStructure, databinsSaver, headerModifier, qualityLayersCache) {
        
        return new JpipCodestreamReconstructor(
            codestreamStructure,
            databinsSaver,
            headerModifier,
            qualityLayersCache);
    },
    
    createCodestreamSizesCalculator: function(params) {
        return new JpipCodestreamSizesCalculator(params);
    },
    
    createCodestreamStructure: function(structureParser, progressionOrder) {
        return new JpipCodestreamStructure(
            structureParser, jpipRuntimeFactory, progressionOrder);
    },
    
    createComponentStructure: function(params, tileStructure) {
        return new JpipComponentStructure(params, tileStructure);
    },
    
    createCompositeArray: function(offset) {
        return new CompositeArray(offset);
    },
    
    createDatabinParts: function(classId, inClassId) {
        return new JpipDatabinParts(classId, inClassId, jpipRuntimeFactory);
    },
    
    createDatabinsSaver: function(isJpipTilepartStream) {
        return new JpipDatabinsSaver(isJpipTilepartStream, jpipRuntimeFactory);
    },
    
    createFetchHandle: function(
        requester, imageDataContext, dedicatedChannelHandle) {
            
        return new JpipFetchHandle(
            requester, imageDataContext, dedicatedChannelHandle);
    },
    
    createHeaderModifier: function(
        codestreamStructure, offsetsCalculator, progressionOrder) {
        
        return new JpipHeaderModifier(
            codestreamStructure, offsetsCalculator, progressionOrder);
    },
    
    createImageDataContext: function(
        jpipObjects, codestreamPartParams, progressiveness) {
        
        return new JpipImageDataContext(
            jpipObjects, codestreamPartParams, progressiveness);
    },
    
    createMarkersParser: function(mainHeaderDatabin) {
        return new JpipMarkersParser(
            mainHeaderDatabin, jpipMessageHeaderParser, jpipRuntimeFactory);
    },
    
    createObjectPoolByDatabin: function() {
        return new JpipObjectPoolByDatabin();
    },
    
    createOffsetsCalculator: function(mainHeaderDatabin, markersParser) {
        return new JpipOffsetsCalculator(mainHeaderDatabin, markersParser);
    },
    
    createPacketsDataCollector: function(
        codestreamStructure, databinsSaver, qualityLayersCache) {
        
        return new JpipPacketsDataCollector(
            codestreamStructure,
            databinsSaver,
            qualityLayersCache,
            jpipRuntimeFactory);
    },
    
    createRequestDatabinsListener: function createRequestDatabinsListener(
        codestreamPartParams,
        qualityLayerReachedCallback,
        codestreamStructure,
        databinsSaver,
        qualityLayersCache) {
        
        return new JpipRequestDatabinsListener(
            codestreamPartParams,
            qualityLayerReachedCallback,
            codestreamStructure,
            databinsSaver,
            qualityLayersCache,
            jpipRuntimeFactory);
    },
    
    createRequest: function createRequest(
        sessionHelper, channel, requestUrl, callback, failureCallback) {
        
        return new JpipRequest(
            sessionHelper,
            jpipMessageHeaderParser,
            channel,
            requestUrl,
            callback,
            failureCallback);
    },
    
    createSessionHelper: function createSessionHelper(
        dataRequestUrl,
        knownTargetId,
        codestreamStructure,
        databinsSaver) {
        
        return new JpipSessionHelper(
            dataRequestUrl,
            knownTargetId,
            codestreamStructure,
            databinsSaver,
            simpleAjaxHelper);
    },
    
    createSession: function createSession(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        targetId,
        codestreamStructure,
        databinsSaver) {
        
        return new JpipSession(
            maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel,
            targetId,
            codestreamStructure,
            databinsSaver,
            setInterval,
            clearInterval,
            jpipRuntimeFactory);
    },
    
    createReconnectableRequester: function(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaver) {
        
        return new JpipReconnectableRequester(
            maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel,
            codestreamStructure,
            databinsSaver,
            jpipRuntimeFactory);
    },
    
    createStructureParser: function(databinsSaver, markersParser, offsetsCalculator) {
        return new JpipStructureParser(
            databinsSaver, markersParser, jpipMessageHeaderParser, offsetsCalculator);
    },
    
    createTileStructure: function(
        sizeParams, codestreamStructure, progressionOrder) {
        return new JpipTileStructure(
            sizeParams, codestreamStructure, jpipRuntimeFactory, progressionOrder);
    },
    
    createBitstreamReader: function createBitstreamReader(databin) {
        return new JpipBitstreamReader(
            databin, mutualExclusiveTransactionHelper);
    },
    
    createTagTree: function createTagTree(bitstreamReader, width, height) {
        return new JpipTagTree(
            bitstreamReader, width, height, mutualExclusiveTransactionHelper);
    },
    
    createCodeblockLengthParser: function createCodeblockLengthParser(
        bitstreamReader, transactionHelper) {
        
        return new JpipCodeblockLengthParser(
            bitstreamReader, mutualExclusiveTransactionHelper);
    },
    
    createSubbandLengthInPacketHeaderCalculator :
        function createSubbandLengthInPacketHeaderCalculator(
            bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband) {
        
        return new JpipSubbandLengthInPacketHeaderCalculator(
            bitstreamReader,
            numCodeblocksXInSubband,
            numCodeblocksYInSubband,
            jpipCodingPassesNumberParser,
            mutualExclusiveTransactionHelper,
            jpipRuntimeFactory);
    },
    
    createPacketLengthCalculator: function createPacketLengthCalculator(
        tileStructure,
        componentStructure,
        databin,
        startOffsetInDatabin,
        precinct) {
        
        return new JpipPacketLengthCalculator(
            tileStructure,
            componentStructure,
            databin,
            startOffsetInDatabin,
            precinct,
            jpipRuntimeFactory);
    },
    
    createQualityLayersCache: function createQualityLayersCache(
        codestreamStructure) {
        
        return new JpipQualityLayersCache(
            codestreamStructure,
            jpipRuntimeFactory);
    }
};

module.exports.jpipRuntimeFactory = jpipRuntimeFactory;