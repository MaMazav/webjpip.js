'use strict';

var JpipComponentStructureStub = function(componentParams) {
    this.getComponentScaleX = function getComponentScaleX() {
        return 1;
    };
    
    this.getComponentScaleY = function getComponentScaleY() {
        return 1;
    };
    
    this.getPrecinctWidth = function(resolutionLevel) {
        return componentParams.precinctWidthPerLevel[resolutionLevel];
    };
    
    this.getPrecinctHeight = function(resolutionLevel) {
        return componentParams.precinctHeightPerLevel[resolutionLevel];
    };
    
    this.getNumResolutionLevels = function() {
        return componentParams.numResolutionLevels;
    };
    
    this.getMaxCodeblockWidth = function getMaxCodeblockWidth() {
        return componentParams.maxCodeblockWidth;
    };
    
    this.getMaxCodeblockHeight = function getMaxCodeblockHeight() {
        return componentParams.maxCodeblockHeight;
    };
};