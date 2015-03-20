'use strict';

var JpipTileLayer = L.Class.extend({
    initialize: function initialize(options) {
        this._options = options || {};
        this._tileSize = this._options.tileSize || 256;
        this._exceptionCallback = null;
        this._overviewLayer = null;
        this._tileLayer = null;
    },
    
    setExceptionCallback: function setExceptionCallback(exceptionCallback) {
        this._exceptionCallback = exceptionCallback;
    },
    
    _createImage: function createImage() {
        if (this._image === undefined) {
            var imageType = this._options.isMainImageOnUi ?
                JpxJpipImage: WorkerProxyJpxJpipImage;
                
            this._image = new imageType({
                tileWidth: this._tileSize,
                tileHeight: this._tileSize,
                serverRequestPrioritizer: 'frustum',
                decodePrioritizer: 'frustum',
                showLog: this._options.showLog
            });
            
            this._image.setStatusCallback(this._statusCallback.bind(this));
            
            this._image.open(this._options.url);
        }
    },

    onAdd: function onAdd(map) {
        if (this._map !== undefined) {
            throw 'Cannot add this layer to two maps';
        }
        
        this._map = map;
        
        if (this._isReady) {
            this._addInternalTileLayer();
        } else {
            this._createImage();
        }
    },
    
    onRemove: function onRemove(map) {
        if (map !== this._map) {
            throw 'Removed from wrong map';
        }
        
        if (this._overviewLayer !== null) {
            map.removeLayer(this._overviewLayer);
            this._overviewLayer = null;
        }
        
        if (this._tileLayer !== null) {
            map.removeLayer(this._tileLayer);
            this._tileLayer = null;
        }
        
        this._map = undefined;
        this._isReady = false;
        
        this._image.close();
        this._image = undefined;
    },

    _statusCallback: function statusCallback(status) {
        if (this._exceptionCallback !== null && status.exception !== null) {
            this._exceptionCallback(status.exception);
        }

        if (this._isReady || !status.isReady) {
            return;
        }
        
        this._isReady = true;
        
        if (this._options.bounds !== undefined) {
            var bounds = {
                west: this._options.latLngBounds.getWest(),
                east: this._options.latLngBounds.getEast(),
                south: this._options.latLngBounds.getSouth(),
                north: this._options.latLngBounds.getNorth()
            };
            
            jpipImageHelperFunctions.fixBounds(
                bounds, this._image, this._options.adaptProportions);
            
            this._optionsWithFixedBounds = Object.create(this._options);
            this._optionsWithFixedBounds.bounds = L.latLngBounds(
                L.latLng(bounds.south, bounds.west),
                L.latLng(bounds.north, bounds.east));
        } else {
            this._optionsWithFixedBounds = this._options;
        }
        
        //var imageUrl = overviewCanvas.toDataURL();
        //this._overviewLayer = L.imageOverlay(imageUrl, this._options.bounds);
        
        this._overviewLayer = new JpipOverviewTileLayer(
            this._image, this._optionsWithFixedBounds);
            
        this._addInternalTileLayer();
    },
    
    _addInternalTileLayer: function addInternalTileLayer() {
        this._tileLayer = new JpipInternalTileLayer(this._image, this._options);
        
        if (this._isReady && this._map !== undefined) {
            this._map.addLayer(this._tileLayer);
            this._map.addLayer(this._overviewLayer);
        }
    }
});

var JpipOverviewTileLayer = L.Class.extend({
    initialize: function initialize(jpxJpipImage, options) {
        this._image = jpxJpipImage;
        
        var overviewLevel = this._image.getDefaultNumResolutionLevels() - 1;
        this._overviewParams = {
            minX: 0,
            minY: 0,
            maxXExclusive: this._image.getLevelWidth(overviewLevel),
            maxYExclusive: this._image.getLevelHeight(overviewLevel),
            numResolutionLevelsToCut: overviewLevel,
            maxNumQualityLayers: 1,
            requestPriorityData: { overrideHighestPriority: true }
        };

        var overviewSize = Math.max(
            this._overviewParams.maxXExclusive,
            this._overviewParams.maxYExclusive);
        
        L.setOptions(this, options);
        
        this._isAlreadyRetried = false;
        
                this._overviewCanvas = L.DomUtil.create(
            'canvas', 'jpip-layer-overview-canvas leaflet-zoom-animated');

        this._decodedOverviewCallbackBound =
            this._decodedOverviewCallback.bind(this);
            
        this._terminatedOverviewCallbackBound =
            this._terminatedOverviewCallback.bind(this);
        
        this._image.requestPixelsProgressive(
            this._overviewParams,
            this._decodedOverviewCallbackBound,
            this._terminatedOverviewCallbackBound);
    },
    
    onAdd: function onAdd(map) {
        if (this._map !== undefined) {
            throw 'Cannot add this layer to two maps';
        }
        
        this._map = map;

        map.getPanes().mapPane.appendChild(this._overviewCanvas);

        map.on('viewreset', this._moved, this);
        map.on('moveend', this._moved, this);

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
        map.off('moveend', this._moved, this);
        map.off('zoomanim', this._animateZoom, this);
        
        map.getPanes().mapPane.removeChild(this._overviewCanvas);

        this._map = undefined;
    },
    
    _moved: function moved() {
        var bounds = this.options.bounds;
        var topLeft = this._map.latLngToLayerPoint(bounds.getNorthWest());
        var bottomRight = this._map.latLngToLayerPoint(bounds.getSouthEast());
        var size = bottomRight.subtract(topLeft);
        
        L.DomUtil.setPosition(this._overviewCanvas, topLeft);
        this._overviewCanvas.style.width = size.x + 'px';
        this._overviewCanvas.style.height = size.y + 'px';
    },
    
    _animateZoom: function animateZoom(options) {
        var bounds = this.options.bounds;
        var topLeft = this._map._latLngToNewLayerPoint(
            bounds.getNorthWest(), options.zoom, options.center);
        var bottomRight = this._map._latLngToNewLayerPoint(
            bounds.getSouthEast(), options.zoom, options.center);

        var scale = this._map.getZoomScale(options.zoom);
        var size = bottomRight.subtract(topLeft);
        var sizeScaled = size.multiplyBy((1 / 2) * (1 - 1 / scale));
        var origin = topLeft.add(sizeScaled);
        
        this._overviewCanvas.style[L.DomUtil.TRANSFORM] =
            L.DomUtil.getTranslateString(origin) + ' scale(' + scale + ') ';
    },
    
    _decodedOverviewCallback: function decodedOverviewCallback(decoded) {
        var x = decoded.xInOriginalRequest;
        var y = decoded.yInOriginalRequest;
        
        var context = this._overviewCanvas.getContext('2d');
        var imageData = context.createImageData(decoded.width, decoded.height);
        imageData.data.set(decoded.pixels);
        context.putImageData(imageData, x, y);
    },
    
    _terminatedOverviewCallback: function terminatedOverviewCallback(
        isAborted) {
        
        if (!isAborted) {
            return;
        }
        if (this._isAlreadyRetried) {
            throw 'Aborted overview fetch twice';
        }
        this._isAlreadyRetried = true;
        
        // NOTE: Bug in kdu_server causes first request to be sent wrongly.
        // Then Chrome raises ERR_INVALID_CHUNKED_ENCODING and the request
        // never returns. Thus perform second request.
        
        this._image.requestPixelsProgressive(
            this._overviewParams,
            this._decodedOverviewCallbackBound,
            this._terminatedOverviewCallbackBound);
    }
});

var JpipInternalTileLayer = L.TileLayer.Canvas.extend({
    initialize: function initialize(jpxJpipImage, options) {
        var tileSize = jpxJpipImage.getTileWidth();
        if (jpxJpipImage.getTileHeight() !== tileSize) {
            throw 'Non square tile size is not supported';
        }
        
        var modifiedOptions = Object.create(options || {});
        modifiedOptions.tileSize = tileSize;
        modifiedOptions.zoomReverse = true;
        modifiedOptions.minZoom = 0;
        modifiedOptions.maxNativeZoom =
            jpxJpipImage.getDefaultNumResolutionLevels() - 1;
        
        modifiedOptions.maxZoom = modifiedOptions.maxNativeZoom - 1;
        var isSingleTileInLevel = false;
        while (!isSingleTileInLevel) {
            ++modifiedOptions.maxZoom;
            var levelWidth = jpxJpipImage.getLevelWidth(modifiedOptions.maxZoom);
            var levelHeight = jpxJpipImage.getLevelHeight(modifiedOptions.maxZoom);
            
            isSingleTileInLevel = levelWidth <= tileSize && levelHeight <= tileSize;
        }
        
        L.setOptions(this, modifiedOptions);
        
        this._image = jpxJpipImage;
        this._maxZoom = modifiedOptions.maxZoom;
        this._tileSize = tileSize;
        this._maxNumQualityLayers = options.maxNumQualityLayers;
    },
    
    drawTile: function(canvas, tilePoint, zoom) {
        var minX = tilePoint.x * this._tileSize;
        var minY = tilePoint.y * this._tileSize;
        var level = this._maxZoom - zoom;
        
        if (minX >= this._image.getLevelWidth(level) ||
            minY >= this._image.getLevelHeight(level)) {
            
            this.tileDrawn(canvas);
            return;
        }
        
        var codestreamPartParams = {
            minX: minX,
            minY: minY,
            maxXExclusive: minX + this._tileSize,
            maxYExclusive: minY + this._tileSize,
            maxNumResolutionLevels: level,
            maxNumQualityLayers: this._maxNumQualityLayers,
            requestPriorityData: {}
        };
        
        var self = this;
        
        this._image.requestPixelsProgressive(
            codestreamPartParams,
            decodedCallback,
            terminatedCallback);
        
        function decodedCallback(decoded) {
            var x = decoded.xInOriginalRequest;
            var y = decoded.yInOriginalRequest;
            
            var context = canvas.getContext('2d');
            var imageData = context.createImageData(decoded.width, decoded.height);
            imageData.data.set(decoded.pixels);
            context.putImageData(imageData, x, y);
            
            self.tileDrawn(canvas);
        }
        
        function terminatedCallback(isAborted) {
        }
    }
});