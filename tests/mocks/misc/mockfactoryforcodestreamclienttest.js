'use strict';

var dummyObjectsForCodestreamTest = {
    codestreamReconstructor: 'codestreamReconstructor',
    fetcher: 'fetcher',
    headerModifier: 'headerModifier',
    mainHeaderDatabin: { name: 'mainHeaderDatabin', clearCacheForTest: function() {} },
    markersParser: 'markersParser',
    offsetsCalculator: 'offsetsCalculator',
    packetsDataCollector: 'packetsDataCollector',
    qualityLayersCache: 'qualityLayersCache',
    structureParser: 'structureParser'
};

var mockFactoryForCodestreamClientTest = Object.create(jpipMockFactory);

mockFactoryForCodestreamClientTest.reconnectableRequester = jpipReconnectableRequesterMock;

//mockFactoryForCodestreamClientTest.codestreamReconstructor =
//    jpipCodestreamReconstructorMock;

mockFactoryForCodestreamClientTest.codestreamStructure =
    new JpipCodestreamStructureStub(
        new JpipTileStructureStub(
            /*tileParams=*/{ numQualityLayers: 'dummyNumQualityLayers' },
            /*codestreamStructure=*/null,
            /*progressionOrder=*/null,
            new JpipComponentStructureStub(
                { numResolutionLevels: 'Dummy levels' } )),
        /*sizeOfPartResult=*/undefined,
        /*levelSizesResult=*/[ [ 1200, 1500 ] , [600, 750] , [300, 375] , [150, 190] ]);

mockFactoryForCodestreamClientTest.databinsSaver =
    new JpipDatabinsSaverStub(dummyObjectsForCodestreamTest.mainHeaderDatabin);
    
mockFactoryForCodestreamClientTest.imageDataContext = {
    //tryContinueRequest: function() { return true; }
};

mockFactoryForCodestreamClientTest.createReconnectableRequester = function createReconnectableRequester(
    maxChannelsInSession,
    maxRequestsWaitingForResponseInChannel,
    codestreamStructure,
    databinsSaver) {
    
    mockFactoryForCodestreamClientTest.reconnectableRequesterArgs = {
        maxChannelsInSession: maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel: maxRequestsWaitingForResponseInChannel,
        codestreamStructure: codestreamStructure,
        databinsSaver: databinsSaver
        };
        
    return mockFactoryForCodestreamClientTest.reconnectableRequester;
};
    
mockFactoryForCodestreamClientTest.createCodestreamReconstructor = function(
        codestreamStructure, databinsSaver, headerModifier, qualityLayersCache) {
    
    mockFactoryForCodestreamClientTest.codestreamReconstructorArgs = {
        codestreamStructure: codestreamStructure,
        databinsSaver: databinsSaver,
        headerModifier: headerModifier,
        qualityLayersCache: qualityLayersCache
        };
        
    return dummyObjectsForCodestreamTest.codestreamReconstructor;
};

mockFactoryForCodestreamClientTest.createCodestreamStructure =
    function(structureParser, progressionOrder) {
    
    mockFactoryForCodestreamClientTest.codestreamStructureArgs = {
        structureParser: structureParser,
        progressionOrder: progressionOrder
        };
        
    return mockFactoryForCodestreamClientTest.codestreamStructure;
};

mockFactoryForCodestreamClientTest.createDatabinsSaver = function(isJpipTilepartStream) {
    mockFactoryForCodestreamClientTest.databinsSaverArgs = {
        isJpipTilepartStream: isJpipTilepartStream
        };
        
    return mockFactoryForCodestreamClientTest.databinsSaver;
};

mockFactoryForCodestreamClientTest.createFetcher = function(databinsSaver, options) {
    mockFactoryForCodestreamClientTest.fetcherArgs = {
        databinsSaver: databinsSaver,
        options: options
        };
    
    return mockFactoryForCodestreamClientTest.fetcher;
};

mockFactoryForCodestreamClientTest.createHeaderModifier =
    function(codestreamStructure, offsetsCalculator, progressionOrder) {
    
    mockFactoryForCodestreamClientTest.headerModifierArgs = {
        codestreamStructure: codestreamStructure,
        offsetsCalculator: offsetsCalculator,
        progressionOrder: progressionOrder
        };
        
    return dummyObjectsForCodestreamTest.headerModifier;
};

mockFactoryForCodestreamClientTest.createMarkersParser = function(mainHeaderDatabin) {
    mockFactoryForCodestreamClientTest.markersParserArgs = {
        mainHeaderDatabin: mainHeaderDatabin
        };
        
    return dummyObjectsForCodestreamTest.markersParser;
};

mockFactoryForCodestreamClientTest.createOffsetsCalculator = function(mainHeaderDatabin, markersParser) {
    mockFactoryForCodestreamClientTest.offsetsCalculatorArgs = {
        mainHeaderDatabin: mainHeaderDatabin,
        markersParser: markersParser
        };
        
    return dummyObjectsForCodestreamTest.offsetsCalculator;
};

mockFactoryForCodestreamClientTest.createPacketsDataCollector = function(
    codestreamStructure, databinsSaver, qualityLayersCache) {
    
    mockFactoryForCodestreamClientTest.packetsDataCollectorArgs = {
        codestreamStructure: codestreamStructure,
        databinsSaver: databinsSaver,
        qualityLayersCache: qualityLayersCache
        };
    
    return dummyObjectsForCodestreamTest.packetsDataCollector;
};

mockFactoryForCodestreamClientTest.createImageDataContext = function createImageDataContext(
    jpipObjects,
    codestreamPartParams,
    progressiveness) {
    
    mockFactoryForCodestreamClientTest.imageDataContextArgs = {
        reconnectableRequester: jpipObjects.reconnectableRequester,
        reconstructor: jpipObjects.reconstructor,
        packetsDataCollector: jpipObjects.packetsDataCollector,
        qualityLayersCache: jpipObjects.qualityLayersCache,
        codestreamPartParams: codestreamPartParams,
        //callback: callback,
        progressiveness: progressiveness
        //disableServerRequests: !!options.disableServerRequests,
        //isMovable: !!options.isMovable,
        //userContextVars: options.userContextVars
        };
        
    return mockFactoryForCodestreamClientTest.imageDataContext;
};

mockFactoryForCodestreamClientTest.createRequestParamsModifier = function createRequestParamsModifier(
        codestreamStructure) {
    
    // NOTE: Currently JpipImage and JpipRequestParamsModifier are tested together. Should be separated
    return new jpipExports.JpipRequestParamsModifier(codestreamStructure);
};

mockFactoryForCodestreamClientTest.createStructureParser = function(databinsSaver, markersParser, offsetsCalculator) {
    mockFactoryForCodestreamClientTest.structureParserArgs = {
        databinsSaver: databinsSaver,
        markersParser: markersParser,
        offsetsCalculator: offsetsCalculator
        };
        
    return dummyObjectsForCodestreamTest.structureParser;
};

mockFactoryForCodestreamClientTest.createQualityLayersCache = function(codestreamStructure, databinsSaver) {
    mockFactoryForCodestreamClientTest.qualityLayersCacheArgs = {
        codestreamStructure: codestreamStructure
        };
        
    return dummyObjectsForCodestreamTest.qualityLayersCache;
};