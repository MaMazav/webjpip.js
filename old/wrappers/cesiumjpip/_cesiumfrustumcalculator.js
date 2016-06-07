'use strict';

var CesiumFrustumCalculator = {
    calculateFrustum: function calculateFrustum(cesiumWidget) {
        var screenSize = {
            x: cesiumWidget.scene.canvas.width,
            y: cesiumWidget.scene.canvas.height
        };
        
        var points = [];
        CesiumFrustumCalculator._searchBoundingPoints(
            0, 0, screenSize.x, screenSize.y, points, cesiumWidget, /*recursive=*/0);

        var frustumRectangle = Cesium.Rectangle.fromCartographicArray(points);

        var frustumData = jpipImageHelperFunctions.calculateFrustum2DFromBounds(
            frustumRectangle, screenSize);
                    
        return frustumData;
    },
    
    _searchBoundingPoints: function searchBoundingPoints(
        minX, minY, maxX, maxY, points, cesiumWidget, recursiveLevel) {
        
        var transformedPoints = 0;
        transformedPoints += CesiumFrustumCalculator._transformAndAddPoint(
            minX, minY, cesiumWidget, points);
        transformedPoints += CesiumFrustumCalculator._transformAndAddPoint(
            maxX, minY, cesiumWidget, points);
        transformedPoints += CesiumFrustumCalculator._transformAndAddPoint(
            minX, maxY, cesiumWidget, points);
        transformedPoints += CesiumFrustumCalculator._transformAndAddPoint(
            maxX, maxY, cesiumWidget, points);

        var maxLevel =
            CesiumFrustumCalculator._MAX_RECURSIVE_LEVEL_ON_FAILED_TRANSFORM;
        
        if (transformedPoints === 4 || recursiveLevel >= maxLevel) {
            return;
        }
        
        ++recursiveLevel;
        
        var middleX = (minX + maxX) / 2;
        var middleY = (minY + maxY) / 2;
        
        this._searchBoundingPoints(
            minX, minY, middleX, middleY, points, cesiumWidget, recursiveLevel);

        this._searchBoundingPoints(
            minX, middleY, middleX, maxY, points, cesiumWidget, recursiveLevel);

        this._searchBoundingPoints(
            middleX, minY, maxX, middleY, points, cesiumWidget, recursiveLevel);

        this._searchBoundingPoints(
            middleX, middleY, maxX, maxY, points, cesiumWidget, recursiveLevel);
    },

    _transformAndAddPoint: function _transformAndAddPoint(
        x, y, cesiumWidget, points) {
        
        var screenPoint = new Cesium.Cartesian2(x, y);
        var ellipsoid = cesiumWidget.scene.mapProjection.ellipsoid;
        var point3D = cesiumWidget.scene.camera.pickEllipsoid(screenPoint, ellipsoid);
        
        if (point3D === undefined) {
            return 0;
        }

        var cartesian = ellipsoid.cartesianToCartographic(point3D);
        if (cartesian === undefined) {
            return 0;
        }
        
        points.push(cartesian);
        return 1;
    },
    
    _MAX_RECURSIVE_LEVEL_ON_FAILED_TRANSFORM: 4
};