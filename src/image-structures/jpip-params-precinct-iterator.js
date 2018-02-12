'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipParamsPrecinctIterator(
    codestreamStructure,
    tileIndex,
    codestreamPartParams,
    isIteratePrecinctsNotInCodestreamPart) {
    
    var isInitialized = false;
    var component = 0;
    var precinctX = precinctX;
    var precinctY = precinctY;
    var resolutionLevel = 0;
    var isInCodestreamPart = true;
    var precinctIndexInComponentResolution = -1;
    var inClassIndex = -1;
    var progressionOrder;
    var precinctsInCodestreamPartPerLevelPerComponent = null;
    var tileStructure;
    
    // TODO: Ensure that strings property name doesn't break on uglify

    // A.6.1 in part 1: Core Coding System
    
    Object.defineProperty(this, 'tileIndex', { get: function() {
        return tileIndex;
    }});   
    Object.defineProperty(this, 'component', { get: function() {
        return component;
    }});
    Object.defineProperty(this, 'precinctX', { get: function() {
        return precinctX;
    }});
    Object.defineProperty(this, 'precinctY', { get: function() {
        return precinctY;
    }});
    Object.defineProperty(this, 'resolutionLevel', { get: function() {
        return resolutionLevel;
    }});
    Object.defineProperty(this, 'isInCodestreamPart', { get: function() {
        return isInCodestreamPart;
    }});
    
    this.tryAdvance = function tryAdvance() {
        if (!isInitialized) {
            initialize();
            isInitialized = true;
            return true;
        }
        
        var needAdvanceNextMember = true;
        var precinctsRangeHash = isIteratePrecinctsNotInCodestreamPart ?
            null: precinctsInCodestreamPartPerLevelPerComponent;
        
        var needResetPrecinctToMinimalInCodestreamPart = false;
        
        precinctIndexInComponentResolution = -1;
        inClassIndex = -1;

        for (var i = 2; i >= 0; --i) {
            var newValue = advanceProgressionOrderMember(i,precinctsRangeHash);
            
            needAdvanceNextMember = newValue === 0;
            if (!needAdvanceNextMember) {
                break;
            }
            
            if (progressionOrder[i] === 'P' &&
                !isIteratePrecinctsNotInCodestreamPart) {
                
                needResetPrecinctToMinimalInCodestreamPart = true;
            }
        }
        
        if (needAdvanceNextMember) {
            // If we are here, the last precinct has been reached
            return false;
        }
        
        if (precinctsInCodestreamPartPerLevelPerComponent === null) {
            isInCodestreamPart = true;
            return true;
        }
        
        var rangePerLevel =
            precinctsInCodestreamPartPerLevelPerComponent[component];
        var precinctsRange = rangePerLevel[resolutionLevel];
        
        if (needResetPrecinctToMinimalInCodestreamPart) {
            precinctX = precinctsRange.minPrecinctX;
            precinctY = precinctsRange.minPrecinctY;
        }
        
        isInCodestreamPart =
            precinctX >= precinctsRange.minPrecinctX &&
            precinctY >= precinctsRange.minPrecinctY &&
            precinctX < precinctsRange.maxPrecinctXExclusive &&
            precinctY < precinctsRange.maxPrecinctYExclusive;
        
        return true;
    };
    
    Object.defineProperty(this, 'precinctIndexInComponentResolution', {
        get: function() {
            if (precinctIndexInComponentResolution < 0) {
                precinctIndexInComponentResolution =
                    tileStructure.precinctPositionToIndexInComponentResolution(
                        this);
            }

            return precinctIndexInComponentResolution;
        }
    });

    Object.defineProperty(this, 'inClassIndex', {
        get: function() {
            if (inClassIndex < 0) {
                inClassIndex = tileStructure.precinctPositionToInClassIndex(
                    this);
            }
            
            return inClassIndex;
        }
    });
    
    function initialize() {
        tileStructure = codestreamStructure.getTileStructure(tileIndex);

        if ((!!codestreamPartParams) &&
            codestreamPartParams.level !== undefined) {
            
            var minNumResolutionLevels =
                tileStructure.getMinNumResolutionLevelsOverComponents();
            
            if (minNumResolutionLevels <= codestreamPartParams.level) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot advance resolution: level=' +
                    codestreamPartParams.level +
                    ' but should be smaller than ' + minNumResolutionLevels);
            }
        }

        precinctsInCodestreamPartPerLevelPerComponent =
            getPrecinctsInCodestreamPartPerLevelPerComponent();
                
        if (!isIteratePrecinctsNotInCodestreamPart &&
            precinctsInCodestreamPartPerLevelPerComponent !== null) {
            
            var firstPrecinctsRange =
                precinctsInCodestreamPartPerLevelPerComponent[0][0];
            precinctX = firstPrecinctsRange.minPrecinctX;
            precinctY = firstPrecinctsRange.minPrecinctY;
        }
        
        progressionOrder = tileStructure.getProgressionOrder();
    }
    
    function getPrecinctsInCodestreamPartPerLevelPerComponent() {
        if (!codestreamPartParams) {
            return null;
        }
        
        var components = codestreamStructure.getNumComponents();
        var perComponentResult = new Array(components);
        var minLevel =
            codestreamPartParams.level || 0;
        
        var tileLeftInLevel = codestreamStructure.getTileLeft(
            tileIndex, minLevel);
        var tileTopInLevel = codestreamStructure.getTileTop(
            tileIndex, minLevel);
        
        var minXInTile =
            codestreamPartParams.minX - tileLeftInLevel;
        var minYInTile =
            codestreamPartParams.minY - tileTopInLevel;
        var maxXInTile =
            codestreamPartParams.maxXExclusive - tileLeftInLevel;
        var maxYInTile =
            codestreamPartParams.maxYExclusive - tileTopInLevel;

        for (var component = 0; component < components; ++component) {
            var componentStructure = tileStructure.getComponentStructure(component);
            var levels = componentStructure.getNumResolutionLevels();
            var levelsInCodestreamPart = levels - minLevel;
            var numResolutionLevels = componentStructure.getNumResolutionLevels();
            var perLevelResult = new Array(levels);
        
            for (var level = 0; level < levelsInCodestreamPart; ++level) {
                var componentScaleX = componentStructure.getComponentScaleX();
                var componentScaleY = componentStructure.getComponentScaleY();
                var levelInCodestreamPart = levelsInCodestreamPart - level - 1;
                var levelScaleX = componentScaleX << levelInCodestreamPart;
                var levelScaleY = componentScaleY << levelInCodestreamPart;
                
                var redundant = 4; // Redundant pixels for wavelet 9-7 convolution
                var minXInLevel = Math.floor(minXInTile / levelScaleX) - redundant;
                var minYInLevel = Math.floor(minYInTile / levelScaleY) - redundant;
                var maxXInLevel = Math.ceil(maxXInTile / levelScaleX) + redundant;
                var maxYInLevel = Math.ceil(maxYInTile / levelScaleY) + redundant;
                
                var precinctWidth =
                    componentStructure.getPrecinctWidth(level) * componentScaleX;
                var precinctHeight =
                    componentStructure.getPrecinctHeight(level) * componentScaleY;
                
                var minPrecinctX = Math.floor(minXInLevel / precinctWidth);
                var minPrecinctY = Math.floor(minYInLevel / precinctHeight);
                var maxPrecinctX = Math.ceil(maxXInLevel / precinctWidth);
                var maxPrecinctY = Math.ceil(maxYInLevel / precinctHeight);
                
                var precinctsX = componentStructure.getNumPrecinctsX(level);
                var precinctsY = componentStructure.getNumPrecinctsY(level);
                
                perLevelResult[level] = {
                    minPrecinctX: Math.max(0, minPrecinctX),
                    minPrecinctY: Math.max(0, minPrecinctY),
                    maxPrecinctXExclusive: Math.min(maxPrecinctX, precinctsX),
                    maxPrecinctYExclusive: Math.min(maxPrecinctY, precinctsY)
                    };
            }
            
            perComponentResult[component] = perLevelResult;
        }
        
        return perComponentResult;
    }
    
    function advanceProgressionOrderMember(memberIndex, precinctsRange) {
        var componentStructure = tileStructure.getComponentStructure(component);
        
        switch (progressionOrder[memberIndex]) {
            case 'R':
                var numResolutionLevels =
                    componentStructure.getNumResolutionLevels();
                if ((!!codestreamPartParams) && codestreamPartParams.level) {
                    numResolutionLevels -= codestreamPartParams.level;
                }
                
                ++resolutionLevel;
                resolutionLevel %= numResolutionLevels;
                return resolutionLevel;
            
            case 'C':
                ++component;
                component %= codestreamStructure.getNumComponents();
                return component;
            
            case 'P':
                var minX, minY, maxX, maxY;
                if (precinctsRange !== null) {
                    var precinctsRangePerLevel = precinctsRange[component];
                    var precinctsRangeInLevelComponent = precinctsRangePerLevel[
                        resolutionLevel];
                    
                    minX = precinctsRangeInLevelComponent.minPrecinctX;
                    minY = precinctsRangeInLevelComponent.minPrecinctY;
                    maxX = precinctsRangeInLevelComponent.maxPrecinctXExclusive;
                    maxY = precinctsRangeInLevelComponent.maxPrecinctYExclusive;
                } else {
                    minX = 0;
                    minY = 0;
                    maxX = componentStructure.getNumPrecinctsX(resolutionLevel);
                    maxY = componentStructure.getNumPrecinctsY(resolutionLevel);
                }
                
                precinctX -= (minX - 1);
                precinctX %= (maxX - minX);
                precinctX += minX;
                
                if (precinctX != minX) {
                    return precinctX - minX;
                }
                
                precinctY -= (minY - 1);
                precinctY %= (maxY - minY);
                precinctY += minY;

                return precinctY - minY;
            
            case 'L' :
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Advancing L is not supported in JPIP');
            
            default:
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected letter in progression order: ' +
                    progressionOrder[memberIndex]);
        }
    }
    
    return this;
};