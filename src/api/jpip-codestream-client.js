'use strict';

var jGlobals = require('j2k-jpip-globals.js');
var jpipRuntimeFactory = require('jpip-runtime-factory.js'); 

module.exports.JpipCodestreamClient = function JpipCodestreamClient(options) {
    options = options || {};
    var jpipFactory = jpipRuntimeFactory;

    var databinsSaver = jpipFactory.createDatabinsSaver(/*isJpipTilepartStream=*/false);
    var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

    var markersParser = jpipFactory.createMarkersParser(mainHeaderDatabin);
    var offsetsCalculator = jpipFactory.createOffsetsCalculator(
        mainHeaderDatabin, markersParser);
    var structureParser = jpipFactory.createStructureParser(
        databinsSaver, markersParser, offsetsCalculator);
    
    var progressionOrder = 'RPCL';
    var codestreamStructure = jpipFactory.createCodestreamStructure(
        structureParser, progressionOrder);
    
    var qualityLayersCache = jpipFactory.createQualityLayersCache(
        codestreamStructure);
        
    var headerModifier = jpipFactory.createHeaderModifier(
        codestreamStructure, offsetsCalculator, progressionOrder);
    var reconstructor = jpipFactory.createCodestreamReconstructor(
        codestreamStructure, databinsSaver, headerModifier, qualityLayersCache);
    var packetsDataCollector = jpipFactory.createPacketsDataCollector(
        codestreamStructure, databinsSaver, qualityLayersCache);
    
    var maxChannelsInSession = options.maxChannelsInSession || 1;
    var maxRequestsWaitingForResponseInChannel =
        options.maxRequestsWaitingForResponseInChannel || 1;
        
    var requester = jpipFactory.createReconnectableRequester(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaver);
    
    var jpipObjectsForRequestContext = {
        requester: requester,
        reconstructor: reconstructor,
        packetsDataCollector: packetsDataCollector,
        qualityLayersCache: qualityLayersCache,
        codestreamStructure: codestreamStructure,
        databinsSaver: databinsSaver,
        jpipFactory: jpipFactory
        };
    
    var statusCallback = null;
    
    this.setStatusCallback = function setStatusCallbackClosure(callback) {
        statusCallback = callback;
        
        if (callback !== null) {
            requester.setStatusCallback(requesterStatusCallback);
        } else {
            requester.setStatusCallback(null);
        }
    };
    
    this.open = function open(baseUrl) {
        requester.open(baseUrl);
    };
    
    this.close = function close(closedCallback) {
        requester.close(closedCallback);
    };
    
    this.getSizesParams = function getSizesParams() {
        if (!requester.getIsReady()) {
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Cannot get codestream structure before image is ready');
        }
        
        var params = codestreamStructure.getSizesParams();
        var clonedParams = JSON.parse(JSON.stringify(params));
        
        var tile = codestreamStructure.getDefaultTileStructure();
        var component = tile.getDefaultComponentStructure();

        clonedParams.defaultNumQualityLayers =
            tile.getNumQualityLayers();
        clonedParams.defaultNumResolutionLevels =
            component.getNumResolutionLevels();
        
        return clonedParams;
    };
    
    this.createImageDataContext = function createImageDataContext(
        codestreamPartParams, options) {
            
        options = options || {};

        var codestreamPartParamsModified = castCodestreamPartParams(
            codestreamPartParams);
        
        var progressivenessModified;
        if (options.progressiveness !== undefined) {
            if (options['useCachedDataOnly'] || options['disableProgressiveness']) {
                throw new jGlobals.jpipExceptions.ArgumentException(
                    'options.progressiveness',
                    options.progressiveness,
                    'options contradiction: cannot accept both progressiveness' +
                    'and useCachedDataOnly/disableProgressiveness options');
            }
            progressivenessModified = castProgressivenessParams(
                options.progressiveness,
                codestreamPartParamsModified.maxNumQualityLayers,
                'maxNumQualityLayers');
        } else  if (options['useCachedDataOnly']) {
            progressivenessModified = [ { minNumQualityLayers: 0 } ];
        } else if (options['disableProgressiveness']) {
            var maxNumQualityLayers = codestreamPartParams.maxNumQualityLayers;
            var minNumQualityLayers =
                maxNumQualityLayers === undefined ? 'max' : maxNumQualityLayers;
            
            progressivenessModified = [ { minNumQualityLayers: minNumQualityLayers } ];
        } else {
            progressivenessModified = getAutomaticProgressivenessStages(
                codestreamPartParamsModified.maxNumQualityLayers);
        }
        
        var imageDataContext = jpipFactory.createImageDataContext(
            jpipObjectsForRequestContext,
            codestreamPartParamsModified,
            progressivenessModified);
            //{
            //    disableServerRequests: !!options.isOnlyWaitForData,
            //    isMovable: false,
            //    userContextVars: userContextVars,
            //    failureCallback: options.failureCallback
            //});
        
        return imageDataContext;
    };
    
    //this.createDataRequest = function createDataRequest(
    //    codestreamPartParams, callback, userContextVars, options) {
    //    
    //    options = options || {};
    //    if (options.isOnlyWaitForData !== undefined) {
    //        throw new jGlobals.jpipExceptions.ArgumentException(
    //            'options.isOnlyWaitForData',
    //            options.isOnlyWaitForData,
    //            'isOnlyWaitForData is supported only for progressive request');
    //    }
    //    
    //    var codestreamPartParamsModified = castCodestreamPartParams(
    //        codestreamPartParams);
    //    
    //    var progressiveness;
    //    if (options.useCachedDataOnly) {
    //        progressiveness = [ { minNumQualityLayers: 0 } ];
    //    } else {
    //        var maxNumQualityLayers = codestreamPartParams.maxNumQualityLayers;
    //        var minNumQualityLayers =
    //            maxNumQualityLayers === undefined ? 'max' : maxNumQualityLayers;
    //        
    //        progressiveness = [ { minNumQualityLayers: minNumQualityLayers } ];
    //    }
    //    
    //    var requestContext = jpipFactory.createRequestContext(
    //        jpipObjectsForRequestContext,
    //        codestreamPartParamsModified,
    //        callback,
    //        progressiveness,
    //        {
    //            disableServerRequests: !!options.useCachedDataOnly,
    //            isMovable: false,
    //            userContextVars: userContextVars,
    //            failureCallback: options.failureCallback
    //        });
    //    
    //    return requestContext;
    //};
    //
    //this.createProgressiveDataRequest = function createProgressiveDataRequest(
    //    codestreamPartParams,
    //    callback,
    //    userContextVars,
    //    options,
    //    progressiveness) {
    //    
    //    options = options || {};
    //    if (options.useCachedDataOnly !== undefined) {
    //        throw new jGlobals.jpipExceptions.ArgumentException(
    //            'options.useCachedDataOnly',
    //            options.useCachedDataOnly,
    //            'useCachedDataOnly is not supported for progressive request');
    //    }
    //    
    //    var codestreamPartParamsModified = castCodestreamPartParams(
    //        codestreamPartParams);
    //    
    //    var progressivenessModified;
    //    if (progressiveness === undefined) {
    //        progressivenessModified = getAutomaticProgressivenessStages(
    //            codestreamPartParamsModified.maxNumQualityLayers);
    //    } else {
    //        progressivenessModified = castProgressivenessParams(
    //            progressiveness, codestreamPartParamsModified.maxNumQualityLayers, 'maxNumQualityLayers');
    //    }
    //    
    //    var requestContext = jpipFactory.createRequestContext(
    //        jpipObjectsForRequestContext,
    //        codestreamPartParamsModified,
    //        callback,
    //        progressivenessModified,
    //        {
    //            disableServerRequests: !!options.isOnlyWaitForData,
    //            isMovable: false,
    //            userContextVars: userContextVars,
    //            failureCallback: options.failureCallback
    //        });
    //    
    //    return requestContext;
    //};
    
    //this.createMovableRequest = function createMovableRequest(
    //    callback, userContextVars) {
    //    
    //    // NOTE: Think of the correct API of progressiveness in movable requests
    //    
    //    var zombieCodestreamPartParams = null;
    //    var progressiveness = getAutomaticProgressivenessStages();
    //    
    //    var requestContext = jpipFactory.createRequestContext(
    //        jpipObjectsForRequestContext,
    //        zombieCodestreamPartParams,
    //        callback,
    //        progressiveness,
    //        {
    //            disableServerRequests: false,
    //            isMovable: true,
    //            userContextVars: userContextVars
    //        });
    //        
    //    return requestContext;
    //};
    
    this.reconnect = function reconnect() {
        requester.reconnect();
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
        
        statusCallback(status);
    }
    
    function castProgressivenessParams(progressiveness, maxNumQualityLayers, propertyName) {
        // Ensure than minNumQualityLayers is given for all items
        
        var result = new Array(progressiveness.length);

        for (var i = 0; i < progressiveness.length; ++i) {
            var minNumQualityLayers = progressiveness[i].minNumQualityLayers;
            
            if (minNumQualityLayers !== 'max') {
                if (maxNumQualityLayers !== undefined &&
                    minNumQualityLayers > maxNumQualityLayers) {
                    
                    throw new jGlobals.jpipExceptions.ArgumentException(
                        'progressiveness[' + i + '].minNumQualityLayers',
                        minNumQualityLayers,
                        'minNumQualityLayers is bigger than ' +
                            'fetchParams.maxNumQualityLayers');
                }
                
                minNumQualityLayers = validateNumericParam(
                    minNumQualityLayers,
                    propertyName,
                    'progressiveness[' + i + '].minNumQualityLayers');
            }
            
            result[i] = { minNumQualityLayers: minNumQualityLayers };
        }
        
        return result;
    }
    
    function getAutomaticProgressivenessStages(maxNumQualityLayers) {
        // Create progressiveness of (1, 2, 3, (#max-quality/2), (#max-quality))

        var progressiveness = [];

        // No progressiveness, wait for all quality layers to be fetched
        var tileStructure = codestreamStructure.getDefaultTileStructure();
        var numQualityLayersNumeric = tileStructure.getNumQualityLayers();
        var maxNumQualityLayersNumericOrMax = 'max';
        
        if (maxNumQualityLayers !== undefined) {
            numQualityLayersNumeric = Math.min(
                numQualityLayersNumeric, maxNumQualityLayers);
            maxNumQualityLayersNumericOrMax = numQualityLayersNumeric;
        }
        
        var firstQualityLayersCount = numQualityLayersNumeric < 4 ?
            numQualityLayersNumeric - 1: 3;
        
        for (var i = 1; i < firstQualityLayersCount; ++i) {
            progressiveness.push({ minNumQualityLayers: i });
        }
        
        var middleQuality = Math.round(numQualityLayersNumeric / 2);
        if (middleQuality > firstQualityLayersCount) {
            progressiveness.push({ minNumQualityLayers: middleQuality });
        }
        
        progressiveness.push({
            minNumQualityLayers: maxNumQualityLayersNumericOrMax
            });
        
        return progressiveness;
    }
    
    function castCodestreamPartParams(codestreamPartParams) {
        var numResolutionLevelsToCut = validateNumericParam(
            codestreamPartParams.numResolutionLevelsToCut,
            'numResolutionLevelsToCut',
            /*defaultValue=*/undefined,
            /*allowUndefiend=*/true);

        var maxNumQualityLayers = validateNumericParam(
            codestreamPartParams.maxNumQualityLayers,
            'maxNumQualityLayers',
            /*defaultValue=*/undefined,
            /*allowUndefiend=*/true);
        
        var minX = validateNumericParam(codestreamPartParams.minX, 'minX');
        var minY = validateNumericParam(codestreamPartParams.minY, 'minY');
        
        var maxX = validateNumericParam(
            codestreamPartParams.maxXExclusive, 'maxXExclusive');
        
        var maxY = validateNumericParam(
            codestreamPartParams.maxYExclusive, 'maxYExclusive');
        
        var levelWidth = codestreamStructure.getLevelWidth(numResolutionLevelsToCut);
        var levelHeight = codestreamStructure.getLevelHeight(numResolutionLevelsToCut);
        
        if (minX < 0 || maxX > levelWidth ||
            minY < 0 || maxY > levelHeight ||
            minX >= maxX || minY >= maxY) {
            
            throw new jGlobals.jpipExceptions.ArgumentException(
                'codestreamPartParams', codestreamPartParams);
        }
        
        var result = {
            minX: minX,
            minY: minY,
            maxXExclusive: maxX,
            maxYExclusive: maxY,
            
            numResolutionLevelsToCut: numResolutionLevelsToCut,
            maxNumQualityLayers: maxNumQualityLayers
            };
        
        return result;
    }
    
    function validateNumericParam(
        inputValue, propertyName, defaultValue, allowUndefined) {
        
        if (inputValue === undefined &&
            (defaultValue !== undefined || allowUndefined)) {
            
            return defaultValue;
        }
        
        var result = +inputValue;
        if (isNaN(result) || result !== Math.floor(result)) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                propertyName, inputValue);
        }
        
        return result;
    }
    
    return this;
};