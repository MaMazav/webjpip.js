'use strict';

var JpipRegionLayer = L.Class.extend({
    initialize: function initialize(options) {
        this._options = Object.create(options);
        
        if (options.latLngBounds !== undefined) {
            this._options.cartographicBounds = {
                west: options.latLngBounds.getWest(),
                east: options.latLngBounds.getEast(),
                south: options.latLngBounds.getSouth(),
                north: options.latLngBounds.getNorth()
            };
        }
        
        this._targetCanvas = null;
        this._canvasPosition = null;
        this._canvasUpdatedCallbackBound = this._canvasUpdatedCallback.bind(this);
        this._image = null;
        this._exceptionCallback = null;
    },
    
    setExceptionCallback: function setExceptionCallback(exceptionCallback) {
        this._exceptionCallback = exceptionCallback;
        if (this._image !== null) {
            this._image.setExceptionCallback(exceptionCallback);
        }
    },
    
    _createImage: function createImage() {
        if (this._image === null) {
            this._image = new ViewerJpipImage(
                this._canvasUpdatedCallbackBound,
                this._options);
            
            if (this._exceptionCallback !== null) {
                this._image.setExceptionCallback(exceptionCallback);
            }
            
            this._image.open(this._options.url);
        }
    },

    onAdd: function onAdd(map) {
        if (this._map !== undefined) {
            throw 'Cannot add this layer to two maps';
        }
        
        this._map = map;
        this._createImage();

        // create a DOM element and put it into one of the map panes
        this._targetCanvas = L.DomUtil.create(
            'canvas', 'jpip-layer-canvas leaflet-zoom-animated');
        
        this._image.setTargetCanvas(this._targetCanvas);
        
        this._canvasPosition = null;
            
        map.getPanes().mapPane.appendChild(this._targetCanvas);

        // add a viewreset event listener for updating layer's position, do the latter
        map.on('viewreset', this._moved, this);
        map.on('move', this._moved, this);

        if (L.Browser.any3d) {
            map.on('zoomanim', this._animateZoom, this);
        }

        this._moved();
    },

    onRemove: function onRemove(map) {
        if (map !== this._map) {
            throw 'Removed from wrong map';
        }
        
        map.off('viewreset', this._moved, this);
        map.off('move', this._moved, this);
        map.off('zoomanim', this._animateZoom, this);
        
        // remove layer's DOM elements and listeners
        map.getPanes().mapPane.removeChild(this._targetCanvas);
        this._targetCanvas = null;
        this._canvasPosition = null;

        this._map = undefined;
        
        this._image.close();
        this._image = null;
    },
    
    _moved: function () {
        this._moveCanvases();

        var frustumData = LeafletFrustumCalculator.calculateFrustum(this._map);
        
        this._image.updateViewArea(frustumData);
    },
    
    _canvasUpdatedCallback: function canvasUpdatedCallback(newPosition) {
        if (newPosition !== null) {
            this._canvasPosition = newPosition;
            this._moveCanvases();
        }
    },
    
    _moveCanvases: function moveCanvases() {
        if (this._canvasPosition === null) {
            return;
        }
    
        // update layer's position
        var west = this._canvasPosition.west;
        var east = this._canvasPosition.east;
        var south = this._canvasPosition.south;
        var north = this._canvasPosition.north;
        
        var topLeft = this._map.latLngToLayerPoint([north, west]);
        var bottomRight = this._map.latLngToLayerPoint([south, east]);
        var size = bottomRight.subtract(topLeft);
        
        L.DomUtil.setPosition(this._targetCanvas, topLeft);
        this._targetCanvas.style.width = size.x + 'px';
        this._targetCanvas.style.height = size.y + 'px';
    },
    
    _animateZoom: function animateZoom(options) {
        // NOTE: All method (including using of private method
        // _latLngToNewLayerPoint) was copied from ImageOverlay,
        // as Leaflet documentation recommends.
        
        var west =  this._canvasPosition.west;
        var east =  this._canvasPosition.east;
        var south = this._canvasPosition.south;
        var north = this._canvasPosition.north;

        var topLeft = this._map._latLngToNewLayerPoint(
            [north, west], options.zoom, options.center);
        var bottomRight = this._map._latLngToNewLayerPoint(
            [south, east], options.zoom, options.center);
        
        var scale = this._map.getZoomScale(options.zoom);
        var size = bottomRight.subtract(topLeft);
        var sizeScaled = size.multiplyBy((1 / 2) * (1 - 1 / scale));
        var origin = topLeft.add(sizeScaled);
        
        this._targetCanvas.style[L.DomUtil.TRANSFORM] =
            L.DomUtil.getTranslateString(origin) + ' scale(' + scale + ') ';
    }
});