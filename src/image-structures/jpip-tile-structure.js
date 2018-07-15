'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipTileStructure(
    sizeParams,
    codestreamStructure,
    jpipFactory,
    progressionOrder
    ) {
    
    var defaultComponentStructure;
    var componentStructures;
    var componentToInClassLevelStartIndex;
    var minNumResolutionLevels;

    this.getProgressionOrder = function() {
        return progressionOrder;
    };
    
    this.getDefaultComponentStructure = function getDefaultComponentStructure(component) {
        return defaultComponentStructure;
    };
    
    this.getComponentStructure = function getComponentStructure(component) {
        return componentStructures[component];
    };
    
    this.getTileWidth = function getTileWidthClosure() {
        return sizeParams.tileSize.width;
    };
    
    this.getTileHeight = function getTileHeightClosure() {
        return sizeParams.tileSize.height;
    };
    
    this.getNumQualityLayers = function getNumQualityLayers() {
        return sizeParams.numQualityLayers;
    };
    
    this.getIsPacketHeaderNearData = function getIsPacketHeaderNearData() {
        return sizeParams.isPacketHeadersNearData;
    };
    
    this.getIsStartOfPacketMarkerAllowed = function getIsStartOfPacketMarkerAllowed() {
        return sizeParams.isStartOfPacketMarkerAllowed;
    };
    
    this.getIsEndPacketHeaderMarkerAllowed =
        function getIsEndPacketHeaderMarkerAllowed() {
        
        return sizeParams.isEndPacketHeaderMarkerAllowed;
    };
    
    this.getMinNumResolutionLevelsOverComponents = function() {
        return minNumResolutionLevels;
    };
    
    this.precinctInClassIndexToPosition = function(inClassIndex) {
        // A.3.2
        
        if (inClassIndex < 0) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                'inClassIndex',
                inClassIndex,
                'Invalid negative in-class index of precinct');
        }
        
        var numTiles = codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        var numComponents = codestreamStructure.getNumComponents();

        var tileIndex = inClassIndex % numTiles;
        var inClassIndexWithoutTile = (inClassIndex - tileIndex) / numTiles;
        
        var component = inClassIndexWithoutTile % numComponents;
        var componentStructure = componentStructures[component];
        
        var numResolutionLevels = componentStructure.getNumResolutionLevels();
        var precinctIndex = (inClassIndexWithoutTile - component) / numComponents;
        
        var resolutionLevel;
        var levelStartIndex = 0;
        for (resolutionLevel = 1; resolutionLevel < numResolutionLevels; ++resolutionLevel) {
            var nextLevelStartIndex =
                componentToInClassLevelStartIndex[component][resolutionLevel];
            
            if (nextLevelStartIndex > precinctIndex) {
                break;
            }
            
            levelStartIndex = nextLevelStartIndex;
        }
        
        --resolutionLevel;
        var precinctIndexInLevel = precinctIndex - levelStartIndex;
        
        var precinctsX = componentStructure.getNumPrecinctsX(resolutionLevel);
        var precinctsY = componentStructure.getNumPrecinctsY(resolutionLevel);

        var precinctX = precinctIndexInLevel % precinctsX;
        var precinctY = (precinctIndexInLevel - precinctX) / precinctsX;
        
        if (precinctY >= precinctsY) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                'inClassIndex',
                inClassIndex,
                'Invalid in-class index of precinct');
        }
        
        var result = {
            tileIndex: tileIndex,
            component: component,
            
            precinctX: precinctX,
            precinctY: precinctY,
            resolutionLevel: resolutionLevel
            };
        
        return result;
    };
    
    this.precinctPositionToInClassIndex = function(precinctPosition) {
        // A.3.2

        var numComponents = codestreamStructure.getNumComponents();
        validateArgumentInRange(
            'precinctPosition.component', precinctPosition.component, numComponents);

        var componentStructure = componentStructures[precinctPosition.component];

        var numResolutionLevels = componentStructure.getNumResolutionLevels();
        validateArgumentInRange(
            'precinctPosition.resolutionLevel', precinctPosition.resolutionLevel, numResolutionLevels);

        var numTiles = codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        var precinctsX = componentStructure.getNumPrecinctsX(precinctPosition.resolutionLevel);
        var precinctsY = componentStructure.getNumPrecinctsY(precinctPosition.resolutionLevel);

        validateArgumentInRange(
            'precinctPosition.precinctX', precinctPosition.precinctX, precinctsX);
        validateArgumentInRange(
            'precinctPosition.precinctY', precinctPosition.precinctY, precinctsY);
        validateArgumentInRange(
            'precinctPosition.tileIndex', precinctPosition.tileIndex, numTiles);

        var precinctIndexInLevel = precinctPosition.precinctX +
            precinctPosition.precinctY * precinctsX;

        var levelStartIndex = componentToInClassLevelStartIndex[precinctPosition.component][precinctPosition.resolutionLevel];

        var precinctIndex = precinctIndexInLevel + levelStartIndex;

        var inClassIndexWithoutTile =
            precinctPosition.component + precinctIndex * codestreamStructure.getNumComponents();

        var inClassIndex = precinctPosition.tileIndex +
            inClassIndexWithoutTile * codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();

        return inClassIndex;
    };
    
    this.precinctPositionToIndexInComponentResolution = function(precinctPosition) {
        var componentStructure = componentStructures[
            precinctPosition.component];
        
        var precinctsX = componentStructure.getNumPrecinctsX(
            precinctPosition.resolutionLevel);
        var precinctIndexInComponentResolution =
            precinctPosition.precinctX +
            precinctPosition.precinctY * precinctsX;

        return precinctIndexInComponentResolution;
    };

    function validateArgumentInRange(paramName, paramValue, suprimumParamValue) {
        if (paramValue < 0 || paramValue >= suprimumParamValue) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                paramName,
                paramValue,
                paramName + ' is expected to be between 0 and ' + suprimumParamValue - 1);
        }
    }
    
    function validateTargetProgressionOrder(progressionOrder) {
        if (progressionOrder.length !== 4) {
            throw new jGlobals.j2kExceptions.IllegalDataException('Illegal progression order ' + progressionOrder + ': unexpected length');
        }
        
        if (progressionOrder[3] !== 'L') {
            throw new jGlobals.jpipExceptions.IllegalDataException('Illegal target progression order of ' + progressionOrder, 'A.3.2.1');
        }
        
        var hasP = progressionOrder.indexOf('P') >= 0;
        var hasC = progressionOrder.indexOf('C') >= 0;
        var hasR = progressionOrder.indexOf('R') >= 0;
        if (!hasP || !hasC || !hasR) {
            throw new jGlobals.j2kExceptions.IllegalDataException('Illegal progression order ' + progressionOrder + ': missing letter');
        }
        
        if (progressionOrder !== 'RPCL') {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException('Progression order of ' + progressionOrder, 'A.6.1');
        }
    }
    
    function preprocessParams() {
        componentToInClassLevelStartIndex = new Array(components);

        var components = codestreamStructure.getNumComponents();
        
        var defaultComponent = sizeParams.defaultComponentParams;
        minNumResolutionLevels = defaultComponent.numResolutionLevels;
        var isComponentsIdenticalSize = true;
        var isPrecinctPartitionFitsToTilePartition = true;

        for (var c = 0; c < components; ++c) {
            var size = sizeParams.paramsPerComponent[c];
            minNumResolutionLevels = Math.min(
                minNumResolutionLevels, size.numResolutionLevels);
                
            componentToInClassLevelStartIndex[c] = new Array(size.numResolutionLevels);
            var componentStructure = componentStructures[c];
            
            var accumulatedOffset = 0;
            var firstLevelPrecinctsX = componentStructure.getNumPrecinctsX(c);
            var firstLevelPrecinctsY = componentStructure.getNumPrecinctsY(c);
            
            for (var r = 0; r < size.numResolutionLevels; ++r) {
                componentToInClassLevelStartIndex[c][r] = accumulatedOffset;
                var precinctsXInLevel = componentStructure.getNumPrecinctsX(r);
                var precinctsYInLevel = componentStructure.getNumPrecinctsY(r);
                accumulatedOffset += precinctsXInLevel * precinctsYInLevel;
            
                if (defaultComponent.precinctWidthPerLevel[r] !==
                        size.precinctWidthPerLevel[r] ||
                    defaultComponent.precinctHeightPerLevel[r] !==
                        size.precinctHeightPerLevel[r]) {
                    
                    isComponentsIdenticalSize = false;
                }
                
                var isHorizontalPartitionSupported =
                    checkIfPrecinctPartitionStartsInTileTopLeft(
                        r,
                        size.numResolutionLevels,
                        componentStructure.getPrecinctWidth,
                        codestreamStructure.getLevelWidth,
                        codestreamStructure.getTileWidth);
                        
                var isVerticalPartitionSupported =
                    checkIfPrecinctPartitionStartsInTileTopLeft(
                        r,
                        size.numResolutionLevels,
                        componentStructure.getPrecinctWidth,
                        codestreamStructure.getLevelWidth,
                        codestreamStructure.getTileWidth);
                        
                isPrecinctPartitionFitsToTilePartition &=
                    isHorizontalPartitionSupported &&
                    isVerticalPartitionSupported;
            }
        }

        if (!isComponentsIdenticalSize) {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException(
                'Special Coding Style for Component (COC)', 'A.6.2');
        }
        
        if (!isPrecinctPartitionFitsToTilePartition) {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException(
                'Precinct TopLeft which is not matched to tile TopLeft', 'B.6');
        }
    }
    
    function checkIfPrecinctPartitionStartsInTileTopLeft(
        resolutionLevel,
        numResolutionLevels,
        getPrecinctSizeFunction,
        getLevelSizeFunction,
        getTileSize1DFunction) {
        
        // Jpeg2000 standard allows partition of tiles which does not fit
        // exactly the precincts partition (i.e. the first precincts "virtually"
        // starts before the tile, thus is smaller than other).
        // This is not supported now in the code, this function should check
        // that this is not the situation.
        
        // The function assumes that firstTileOffset is zero and componentScale
        // is one (UnsupportedExceptions are thrown in ComponentStructure and
        // CodestreamStructure classes).
        
        var precinctSize = getPrecinctSizeFunction(resolutionLevel);
        var levelSize = getLevelSizeFunction(resolutionLevel);
        var tileSize1D = getTileSize1DFunction(resolutionLevel);
        
        if (precinctSize >= levelSize || tileSize1D >= levelSize) {
            // precinctSize >= levelSize ==> Precinct is larger than image thus
            // anyway tile has a single precinct
            // tileSize1D >= levelSize ==> Level has only single tile thus no
            // chances for tile top-left to not match first precinct top-left
            
            return true;
        }
        
        var isPrecinctPartitionFitsToTilePartition =
            precinctSize % tileSize1D === 0 ||
            tileSize1D % precinctSize === 0;
        
        return isPrecinctPartitionFitsToTilePartition;
    }
    
    defaultComponentStructure = jpipFactory.createComponentStructure(
        sizeParams.defaultComponentParams, this);
        
    componentStructures = new Array(codestreamStructure.getNumComponents());
    for (var i = 0; i < codestreamStructure.getNumComponents(); ++i) {
        componentStructures[i] = jpipFactory.createComponentStructure(
            sizeParams.paramsPerComponent[i], this);
    }
    
    preprocessParams();
    
    validateTargetProgressionOrder(progressionOrder);

    return this;
};