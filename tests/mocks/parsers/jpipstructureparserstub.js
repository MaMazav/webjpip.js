'use strict';

function JpipStructureParserStub(imageParams) {
    var overriden = [];

    this.isOverrideHorizontalAndVerticalEdge = false;
    
    this.overrideTileParamsForTest = function(tileId, tileParams) {
        overriden[tileId] = tileParams;
    };
    
    this.parseCodestreamStructure = function() {
        return imageParams;
    };

    this.parseDefaultTileParams = function() {
        return defaultTileParams;
    };
    
    this.parseOverridenTileParams = function(tileId) {
        if (tileId in overriden) {
            return overriden[tileId];
        }
        
        return null;
    };
    };