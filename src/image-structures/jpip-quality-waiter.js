'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipQualityWaiter(
    codestreamPart,
    progressiveness,
    maxQuality,
    qualityLayerReachedCallback,
    codestreamStructure,
    databinsSaver,
    startTrackPrecinctCallback,
    jpipFactory) {

    // NOTE: (performance) Toggled between int and string ('max')
    var minNumQualityLayersReached = 0;
    var progressiveStagesFinished = 0;
    var isRegistered = false;
    var isRequestDone = false;

    var accumulatedDataPerPrecinct = [];
    var precinctCountByReachedQualityLayer = [];

    var precinctsWaiter = jpipFactory.createPrecinctsIteratorWaiter(
        codestreamPart,
        codestreamStructure,
        databinsSaver,
        iteratePrecinctCallback);
    
    this.register = function register() {
        precinctsWaiter.register();
        isRegistered = true;
        tryAdvanceQualityLayersReached();
    };
    
    this.unregister = function unregister() {
        precinctsWaiter.unregister();
    };
    
    this.precinctQualityLayerReached = function precinctQualityLayerReached(
        precinctInClassId, qualityReached) {

        var accumulatedData = updatePrecinctData(
            precinctInClassId, qualityReached);

        if (accumulatedData.isUpdated) {
            accumulatedData.isUpdated = false;
            tryAdvanceQualityLayersReached();
        }
    };
    
    this.getProgressiveStagesFinished = function getProgressiveStagesFinished() {
        return progressiveStagesFinished;
    };
    
    this.isDone = function isDone() {
        return isRequestDone;
    };

    this.getQualityReached = function getQualityReached() {
        if (progressiveStagesFinished === 0) {
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Cannot create codestream before first progressiveness ' +
                'stage has been reached');
        }
        
        var qualityReached =
            progressiveness[progressiveStagesFinished - 1].minNumQualityLayers;
        
        return qualityReached;
    };

    function iteratePrecinctCallback(precinctIterator, tileStructure) {
        var inClassIndex = tileStructure.precinctPositionToInClassIndex(
            precinctIterator);
        var precinctDatabin = databinsSaver.getPrecinctDatabin(
            inClassIndex);
        
        var accumulatedData = updatePrecinctData(
            inClassIndex, /*qualityReached=*/0);
        
        if (accumulatedData.qualityInTile !== undefined) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Precinct was iterated twice in codestream part');
        }
        
        var qualityInTile = tileStructure.getNumQualityLayers();
        accumulatedData.qualityInTile = qualityInTile;
        
        startTrackPrecinctCallback(
            precinctDatabin,
            qualityInTile,
            precinctIterator,
            inClassIndex,
            tileStructure);
            
        if (isRegistered) {
            tryAdvanceQualityLayersReached();
        }
    }
    
    function updatePrecinctData(precinctInClassId, qualityReached) {
        var accumulatedData = accumulatedDataPerPrecinct[precinctInClassId];
        if (accumulatedData) {
            --precinctCountByReachedQualityLayer[accumulatedData.qualityReached];
            accumulatedData.isUpdated =
                accumulatedData.qualityReached !== qualityReached;
            accumulatedData.qualityReached = qualityReached;
        } else {
            accumulatedData = {
                qualityReached: qualityReached,
                isUpdated: qualityReached > 0
            };
            accumulatedDataPerPrecinct[precinctInClassId] = accumulatedData;
        }

        var count = precinctCountByReachedQualityLayer[qualityReached] || 0;
        precinctCountByReachedQualityLayer[qualityReached] = count + 1;
        
        return accumulatedData;
    }
    
    function tryAdvanceQualityLayersReached() {
        if (precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0 ||
            minNumQualityLayersReached === 'max' ||
            progressiveStagesFinished >= progressiveness.length ||
            !precinctsWaiter.isAllTileHeadersLoaded()) {
            
            return;
        }
        
        if (isRequestDone) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Request already done but callback is called');
        }
        
        var hasPrecinctsInQualityLayer;
        var maxQualityLayersReached = precinctCountByReachedQualityLayer.length;
        
        do {
            ++minNumQualityLayersReached;
            
            if (minNumQualityLayersReached >= maxQualityLayersReached) {
                minNumQualityLayersReached = 'max';
                break;
            }
            
            hasPrecinctsInQualityLayer = precinctCountByReachedQualityLayer[
                minNumQualityLayersReached] > 0;
        } while (!hasPrecinctsInQualityLayer);
        
        var numQualityLayersToWait = progressiveness[
            progressiveStagesFinished].minNumQualityLayers;

        if (minNumQualityLayersReached < numQualityLayersToWait) {
            return;
        }
        
        if (minNumQualityLayersReached === 'max') {
            progressiveStagesFinished = progressiveness.length;
        }
        
        while (progressiveStagesFinished < progressiveness.length) {
            var qualityLayersRequired = progressiveness[
                progressiveStagesFinished].minNumQualityLayers;
            
            if (qualityLayersRequired === 'max' ||
                qualityLayersRequired > minNumQualityLayersReached) {
                
                break;
            }
            
            ++progressiveStagesFinished;
        }
        
        isRequestDone = progressiveStagesFinished === progressiveness.length;

        qualityLayerReachedCallback();
    }
};