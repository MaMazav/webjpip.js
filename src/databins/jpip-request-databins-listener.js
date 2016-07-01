'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipRequestDatabinsListener = function JpipRequestDatabinsListener(
    codestreamPartParams,
    qualityLayerReachedCallback,
    codestreamStructure,
    databinsSaver,
    qualityLayersCache,
    jpipFactory) {
    
    var numQualityLayersToWaitFor;
    var tileHeadersNotLoaded = 0;
    var minNumQualityLayersReached = 0;
    var unregistered = false;
    
    var registeredTileHeaderDatabins = [];
    var registeredPrecinctDatabins = [];
    var accumulatedDataPerDatabin = jpipFactory.createObjectPoolByDatabin();
    var precinctCountByReachedQualityLayer = [];
    
    register();
    
    this.unregister = function unregister() {
        if (unregistered) {
            return;
        }
    
        for (var i = 0; i < registeredTileHeaderDatabins.length; ++i) {
            databinsSaver.removeEventListener(
                registeredTileHeaderDatabins[i],
                'dataArrived',
                tileHeaderDataArrived);
        }
        
        for (var j = 0; j < registeredPrecinctDatabins.length; ++j) {
            databinsSaver.removeEventListener(
                registeredPrecinctDatabins[j],
                'dataArrived',
                precinctDataArrived);
        }
        
        unregistered = true;
    };
    
    function register() {
        ++tileHeadersNotLoaded;
        
        var tileIterator = codestreamStructure.getTilesIterator(codestreamPartParams);
        do {
            var tileIndex = tileIterator.tileIndex;
            var databin = databinsSaver.getTileHeaderDatabin(tileIndex);
            registeredTileHeaderDatabins.push(databin);
            
            databinsSaver.addEventListener(
                databin, 'dataArrived', tileHeaderDataArrived);
                
            ++tileHeadersNotLoaded;
            tileHeaderDataArrived(databin);
        } while (tileIterator.tryAdvance());
        
        --tileHeadersNotLoaded;
        tryAdvanceQualityLayersReached();
    }
    
    function tileHeaderDataArrived(tileHeaderDatabin) {
        if (!tileHeaderDatabin.isAllDatabinLoaded()) {
            return;
        }
        
        var tileAccumulatedData = accumulatedDataPerDatabin.getObject(
            tileHeaderDatabin);
        
        if (tileAccumulatedData.isAlreadyLoaded) {
            return;
        }
        
        tileAccumulatedData.isAlreadyLoaded = true;
        --tileHeadersNotLoaded;
        
        var tileIndex = tileHeaderDatabin.getInClassId();
        var tileStructure = codestreamStructure.getTileStructure(tileIndex);
        var qualityInTile = tileStructure.getNumQualityLayers();
        
        var precinctIterator = tileStructure.getPrecinctIterator(
            tileIndex, codestreamPartParams);

        do {
            if (!precinctIterator.isInCodestreamPart) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected precinct not in codestream part');
            }
            
            var inClassId = tileStructure.precinctPositionToInClassIndex(
                precinctIterator);
                
            var precinctDatabin = databinsSaver.getPrecinctDatabin(inClassId);
            registeredPrecinctDatabins.push(precinctDatabin);
            var accumulatedData = accumulatedDataPerDatabin.getObject(
                precinctDatabin);
            
            if (accumulatedData.qualityInTile !== undefined) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Tile was ' +
                    'iterated twice in codestream part');
            }
            
            accumulatedData.qualityInTile = qualityInTile;
            incrementPrecinctQualityLayers(
                precinctDatabin, accumulatedData, precinctIterator);
            
            databinsSaver.addEventListener(
                precinctDatabin, 'dataArrived', precinctDataArrived);
        } while (precinctIterator.tryAdvance());
        
        tryAdvanceQualityLayersReached();
    }
    
    function precinctDataArrived(precinctDatabin) {
        var accumulatedData = accumulatedDataPerDatabin.getObject(
            precinctDatabin);

        var oldQualityLayersReached = accumulatedData.numQualityLayersReached;
        var qualityInTile =
            accumulatedData.qualityInTile;

        if (oldQualityLayersReached === qualityInTile) {
            return;
        }
        
        --precinctCountByReachedQualityLayer[oldQualityLayersReached];
        incrementPrecinctQualityLayers(precinctDatabin, accumulatedData);
        
        tryAdvanceQualityLayersReached();
    }
    
    function incrementPrecinctQualityLayers(
        precinctDatabin, accumulatedData, precinctIteratorOptional) {
        
        var qualityLayers = qualityLayersCache.getQualityLayerOffset(
            precinctDatabin,
            codestreamPartParams.quality,
            precinctIteratorOptional);

        var numQualityLayersReached = qualityLayers.numQualityLayers;
        accumulatedData.numQualityLayersReached = numQualityLayersReached;

        var qualityInTile =
            accumulatedData.qualityInTile;

        if (numQualityLayersReached === qualityInTile) {
            return;
        }
        
        var prevCount =
            precinctCountByReachedQualityLayer[numQualityLayersReached] || 0;
        
        precinctCountByReachedQualityLayer[numQualityLayersReached] =
            prevCount + 1;
    }
    
    function tryAdvanceQualityLayersReached() {
        if (precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0 ||
            minNumQualityLayersReached === 'max' ||
            minNumQualityLayersReached >= numQualityLayersToWaitFor ||
            tileHeadersNotLoaded > 0) {
            
            return;
        }
        
        var hasPrecinctsInQualityLayer;
        var maxQualityLayers = precinctCountByReachedQualityLayer.length;
        
        do {
            ++minNumQualityLayersReached;
            
            if (minNumQualityLayersReached >= maxQualityLayers) {
                minNumQualityLayersReached = 'max';
                break;
            }
            
            hasPrecinctsInQualityLayer =
                precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0;
        } while (!hasPrecinctsInQualityLayer);
        
        qualityLayerReachedCallback(minNumQualityLayersReached);
    }
    
    function ensureQualityLayersStatisticsForDebug() {
        var precinctCountByReachedQualityLayerExpected = [];
        
        for (var i = 0; i < registeredPrecinctDatabins.length; ++i) {
            var accumulatedData = accumulatedDataPerDatabin.getObject(
                registeredPrecinctDatabins[i]);
            
            var qualityInTile =
                accumulatedData.qualityInTile;
                
            if (qualityInTile === undefined) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'No information of qualityInTile in ' +
                    'JpipRequestDatabinsListener');
            }
            
            var qualityLayers = qualityLayersCache.getQualityLayerOffset(
                registeredPrecinctDatabins[i],
                codestreamPartParams.quality);
            
            if (qualityLayers.numQualityLayers === qualityInTile) {
                continue;
            }
            
            var oldValue = precinctCountByReachedQualityLayerExpected[
                qualityLayers.numQualityLayers];
            
            precinctCountByReachedQualityLayerExpected[
                qualityLayers.numQualityLayers] = (oldValue || 0) + 1;
        }
        
        var length = Math.max(
            precinctCountByReachedQualityLayerExpected.length,
            precinctCountByReachedQualityLayer.length);
            
        var minNumQualityLayersReachedExpected = 'max';
        
        for (var j = 0; j < length; ++j) {
            var isExpectedZero = (precinctCountByReachedQualityLayerExpected[j] || 0) === 0;
            var isActualZero = (precinctCountByReachedQualityLayer[j] || 0) === 0;
            
            if (isExpectedZero !== isActualZero) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Wrong accumulated statistics in JpipRequestDatabinsListener');
            }
            
            if (isExpectedZero) {
                continue;
            }
            
            if (precinctCountByReachedQualityLayer[j] !==
                precinctCountByReachedQualityLayerExpected[j]) {
                
                throw new jGlobals.jpipExceptions.InternalErrorException('Wrong ' +
                    'accumulated statistics in JpipRequestDatabinsListener');
            }
            
            if (minNumQualityLayersReachedExpected === 'max') {
                minNumQualityLayersReachedExpected = j;
            }
        }
        
        if (minNumQualityLayersReached !== minNumQualityLayersReachedExpected) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Wrong minNumQualityLayersReached in JpipRequestDatabinsListener');
        }
    }
};