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
    callbacksThis,
    jpipFactory) {

    // NOTE: (performance) Toggled between int and string ('max')
    var minNumQualityLayersReached = 0;
    var progressiveStagesFinished = 0;
    var isRegistered = false;
    var isRequestDone = false;

    var accumulatedDataPerPrecinct = [];
    var precinctCountByReachedQualityLayer = [0];
    var precinctCountInMaxQualityLayer = 0;
    var precinctCount = 0;
    var pendingPrecinctUpdate = [];

    var defaultTileStructure = codestreamStructure.getDefaultTileStructure();
    var defaultNumQualityLayers = defaultTileStructure.getNumQualityLayers();

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

        if (accumulatedData.isUpdated && accumulatedData.qualityInTile) {
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
        
        if (accumulatedDataPerPrecinct[inClassIndex]) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Precinct was iterated twice in codestream part');
        }
        
        ++precinctCountByReachedQualityLayer[0];
        ++precinctCount;
        var qualityInTile = tileStructure.getNumQualityLayers();
        accumulatedDataPerPrecinct[inClassIndex] = {
            qualityReached: 0,
            isUpdated: false,
            isMaxQuality: false,
            qualityInTile: qualityInTile
        };

        var pendingQualityReached = pendingPrecinctUpdate[inClassIndex];
        if (pendingQualityReached) {
            delete pendingPrecinctUpdate[inClassIndex];
            updatePrecinctData(inClassIndex, pendingQualityReached);
        }
        
        startTrackPrecinctCallback.call(
            callbacksThis,
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
        if (!accumulatedData) {
            pendingPrecinctUpdate[precinctInClassId] = qualityReached;
            return;
        }
        
        --precinctCountByReachedQualityLayer[accumulatedData.qualityReached];
        if (accumulatedData.isMaxQuality) {
            --precinctCountInMaxQualityLayer;
            accumulatedData.isMaxQuality = false;
        }
        
        // qualityReached in last quality might arrive either as 'max' or number. Normalize both cases to number
        var qualityReachedNumeric = qualityReached === 'max' ? accumulatedData.qualityInTile : qualityReached;
        accumulatedData.isUpdated =
            accumulatedData.qualityReached !== qualityReachedNumeric;
        accumulatedData.qualityReached = qualityReachedNumeric;
        
        if (qualityReachedNumeric === accumulatedData.qualityInTile) {
            ++precinctCountInMaxQualityLayer;
            accumulatedData.isMaxQuality = true;
        }

        var count = precinctCountByReachedQualityLayer[qualityReachedNumeric] || 0;
        precinctCountByReachedQualityLayer[qualityReachedNumeric] = count + 1;
        
        return accumulatedData;
    }
    
    function tryAdvanceQualityLayersReached() {
        if (precinctCountByReachedQualityLayer.length === 0 ||
            precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0 ||
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
        
        do {
            ++minNumQualityLayersReached;
            
            if (minNumQualityLayersReached >= precinctCountByReachedQualityLayer.length) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Advancing progressiveness rolled out of array of precincts counts by quality');
            }
            
            hasPrecinctsInQualityLayer =
                precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0;
        } while (!hasPrecinctsInQualityLayer);
        
        var numQualityLayersToWait = progressiveness[
            progressiveStagesFinished].minNumQualityLayers;

        if (minNumQualityLayersReached < numQualityLayersToWait) {
            return;
        }
        
        var isFirst = true;
        while (progressiveStagesFinished < progressiveness.length) {
            var qualityLayersRequired = progressiveness[
                progressiveStagesFinished].minNumQualityLayers;
            
            if ((qualityLayersRequired === 'max' && precinctCountInMaxQualityLayer !== precinctCount) ||
                qualityLayersRequired > minNumQualityLayersReached) {
                
                break;
            }
            
            var forceCurrentStage = 
                progressiveness[progressiveStagesFinished].forceMaxQuality === 'force' ||
                progressiveness[progressiveStagesFinished].forceMaxQuality === 'forceAll';
            
            var skipForceCheck = true;
            if (progressiveStagesFinished < progressiveness.length - 1) {
                /*
                    This check captures the following common case of progressiveness:
                    [{ minNumQualityLayers: 1, forceMaxQuality: 'force' },
                     { minNumQualityLayers: 'max', forceMaxQuality: 'no' }]
                    This is the automatic progressiveness for an image with single quality layer.
                    The check here tries to avoid calling the callback twice in case that all precincts
                    have only single quality layer, which makes both stages identical.
                    Handling this situation by eliminating the first stage when calculating the automatic
                    progressiveness is wrong in case that there are tiles with non-default count of quality
                    layers that is bigger than 1, thus it should be handled here.
                 */
                skipForceCheck =
                    precinctCountInMaxQualityLayer === precinctCount &&
                    progressiveness[progressiveStagesFinished + 1].minNumQualityLayers === 'max';
            }
                
            ++progressiveStagesFinished;

            if (!isFirst && !skipForceCheck && forceCurrentStage) {
                qualityLayerReachedCallback.call(callbacksThis);
            }
            
            isFirst = false;
        }
        
        isRequestDone = progressiveStagesFinished === progressiveness.length;

        qualityLayerReachedCallback.call(callbacksThis);
    }
};