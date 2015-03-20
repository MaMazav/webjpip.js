'use strict';

var LeafletFrustumCalculator = {
    calculateFrustum: function calculateFrustum(leafletMap) {
        var screenSize = leafletMap.getSize();
        var bounds = leafletMap.getBounds();

        var cartographicBounds = {
            west: bounds.getWest(),
            east: bounds.getEast(),
            south: bounds.getSouth(),
            north: bounds.getNorth()
        };
        
        var frustumData = jpipImageHelperFunctions.calculateFrustum2DFromBounds(
            cartographicBounds, screenSize);

        return frustumData;
    }
};