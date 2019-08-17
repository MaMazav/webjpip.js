'use strict';

var simpleAjaxHelper                 = require('simple-ajax-helper.js'                 );
var mutualExclusiveTransactionHelper = require('mutual-exclusive-transaction-helper.js');

var jpipCodingPassesNumberParser = require('jpip-coding-passes-number-parser.js');
var jpipMessageHeaderParser      = require('jpip-message-header-parser.js'      );

var JpipChannel                               = require('jpip-channel.js'                                   );
var JpipCodestreamReconstructor               = require('jpip-codestream-reconstructor.js'                  );
var JpipCodestreamStructure                   = require('jpip-codestream-structure.js'                      );
var JpipComponentStructure                    = require('jpip-component-structure.js'                       );
var CompositeArray                            = require('composite-array.js'                                );
var JpipDatabinParts                          = require('jpip-databin-parts.js'                             );
var JpipDatabinsSaver                         = require('jpip-databins-saver.js'                            );
var JpipFetch                                 = require('jpip-fetch.js'                                     );
var JpipFetcher                               = require('jpip-fetcher.js'                                   );
var JpipHeaderModifier                        = require('jpip-header-modifier.js'                           );
var JpipImageDataContext                      = require('jpip-image-data-context.js'                        );
var JpipLevelCalculator                       = require('jpip-level-calculator.js'                          );
var JpipMarkersParser                         = require('jpip-markers-parser.js'                            );
var JpipOffsetsCalculator                     = require('jpip-offsets-calculator.js'                        );
var JpipPacketsDataCollector                  = require('jpip-packets-data-collector.js'                    );
var JpipParamsCodestreamPart                  = require('jpip-params-codestream-part.js'                    );
var JpipParamsPrecinctIterator                = require('jpip-params-precinct-iterator.js'                  );
var JpipPrecinctCodestreamPart                = require('jpip-precinct-codestream-part.js'                  );
var JpipPrecinctsIteratorWaiter               = require('jpip-precincts-iterator-waiter.js'                 );
var JpipQualityWaiter                         = require('jpip-quality-waiter.js'                            );
var JpipRequestParamsModifier                 = require('jpip-request-params-modifier.js'                   );
var JpipRequest                               = require('jpip-request.js'                                   );
var JpipSessionHelper                         = require('jpip-session-helper.js'                            );
var JpipSession                               = require('jpip-session.js'                                   );
var JpipReconnectableRequester                = require('jpip-reconnectable-requester.js'                   );
var JpipStructureParser                       = require('jpip-structure-parser.js'                          );
var JpipTileStructure                         = require('jpip-tile-structure.js'                            );
var JpipBitstreamReader                       = require('jpip-bitstream-reader.js'                          );
var JpipTagTree                               = require('jpip-tag-tree.js'                                  );
var JpipCodeblockLengthParser                 = require('jpip-codeblock-length-parser.js'                   );
var JpipSubbandLengthInPacketHeaderCalculator = require('jpip-subband-length-in-packet-header-calculator.js');
var JpipPacketLengthCalculator                = require('jpip-packet-length-calculator.js'                  );
var JpipQualityLayersCache                    = require('jpip-quality-layers-cache.js'                      );

var jpipRuntimeFactory = {
    createChannel: function createChannel(
        maxRequestsWaitingForResponseInChannel, sessionHelper) {
        
        return new JpipChannel(
            maxRequestsWaitingForResponseInChannel,
            sessionHelper,
            jpipRuntimeFactory);
    },
    
    createCodestreamReconstructor: function(
        databinsSaver, headerModifier, qualityLayersCache) {
        
        return new JpipCodestreamReconstructor(
            databinsSaver,
            headerModifier,
            qualityLayersCache);
    },
    
    createLevelCalculator: function(params) {
        return new JpipLevelCalculator(params);
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
    
    createFetcher: function(databinsSaver, options) {
        return new JpipFetcher(databinsSaver, options, jpipRuntimeFactory);
    },
    
    createFetch: function(fetchContext, requester, progressiveness) {
        return new JpipFetch(fetchContext, requester, progressiveness);
    },
    
    createHeaderModifier: function(
        offsetsCalculator, progressionOrder) {
        
        return new JpipHeaderModifier(
            offsetsCalculator, progressionOrder);
    },
    
    createImageDataContext: function(
        jpipObjects, codestreamPartParams, maxQuality, progressiveness) {
        
        return new JpipImageDataContext(
            jpipObjects, codestreamPartParams, maxQuality, progressiveness);
    },
    
    createMarkersParser: function(mainHeaderDatabin) {
        return new JpipMarkersParser(
            mainHeaderDatabin, jpipMessageHeaderParser, jpipRuntimeFactory);
    },
    
    createOffsetsCalculator: function(mainHeaderDatabin, markersParser) {
        return new JpipOffsetsCalculator(mainHeaderDatabin, markersParser);
    },
    
    createPacketsDataCollector: function(databinsSaver, qualityLayersCache) {
        
        return new JpipPacketsDataCollector(
            databinsSaver,
            qualityLayersCache,
            jpipRuntimeFactory);
    },
    
    createParamsCodestreamPart: function(
        codestreamPartParams, codestreamStructure) {
        
        return new JpipParamsCodestreamPart(
            codestreamPartParams, codestreamStructure, jpipRuntimeFactory);
    },
    
    createParamsPrecinctIterator: function createParamsPrecinctIterator(
        codestreamStructure,
        idx,
        codestreamPartParams,
        isIteratePrecinctsNotInCodestreamPart) {
        
        return new JpipParamsPrecinctIterator(
            codestreamStructure,
            idx,
            codestreamPartParams,
            isIteratePrecinctsNotInCodestreamPart);
    },
    
    createPrecinctCodestreamPart: function createPrecinctCodestreamPart(
        sizesCalculator,
        tileStructure,
        tileIndex,
        component,
        level,
        precinctX,
        precinctY) {
        
        return new JpipPrecinctCodestreamPart(
            sizesCalculator,
            tileStructure,
            tileIndex,
            component,
            level,
            precinctX,
            precinctY);
    },
    
    createPrecinctsIteratorWaiter: function createPrecinctsIteratorWaiter(
        codestreamPart,
        codestreamStructure,
        databinsSaver,
        iteratePrecinctCallback) {
        
        return new JpipPrecinctsIteratorWaiter(
            codestreamPart,
            codestreamStructure,
            databinsSaver,
            iteratePrecinctCallback,
            jpipRuntimeFactory);
    },
    
    createQualityWaiter: function createQualityWaiter(
        codestreamPart,
        progressiveness,
        maxQuality,
        qualityLayerReachedCallback,
        codestreamStructure,
        databinsSaver,
        startTrackPrecinct) {
        
        return new JpipQualityWaiter(
            codestreamPart,
            progressiveness,
            maxQuality,
            qualityLayerReachedCallback,
            codestreamStructure,
            databinsSaver,
            startTrackPrecinct,
            jpipRuntimeFactory);
    },
    
    createRequestParamsModifier: function createRequestParamsModifier(
        codestreamStructure) {
        
        return new JpipRequestParamsModifier(codestreamStructure);
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

module.exports = jpipRuntimeFactory;