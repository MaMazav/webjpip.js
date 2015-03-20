'use strict';

var JpipImageryProvider = (function JpipImageryProviderClosure() {
    /**
     * Provides a JPIP client imagery tile.  The image is assumed to use a
     * {@link GeographicTilingScheme}.
     *
     * @alias JpipImageryProvider
     * @constructor
     *
     * @param {Object} options Object with the following properties:
     * @param {String} options.url The url for the tile.
     * @param {Rectangle} [options.rectangle=Rectangle.MAX_VALUE] The rectangle, in radians, covered by the image.
     * @param {Credit|String} [options.credit] A credit for the data source, which is displayed on the canvas.
     * @param {Object} [options.proxy] A proxy to use for requests. This object is expected to have a getURL function which returns the proxied URL, if needed.
     * @param {boolean} [options.adaptProportions] determines if to adapt the proportions of the rectangle provided to the image pixels proportions.
     *
     * @see ArcGisMapServerImageryProvider
     * @see BingMapsImageryProvider
     * @see GoogleEarthImageryProvider
     * @see OpenStreetMapImageryProvider
     * @see TileMapServiceImageryProvider
     * @see WebMapServiceImageryProvider
     */
    var JpipImageryProvider = function(options) {
        if (options === undefined) {
            options = {};
        }

        var url = options.url;
        var adaptProportions = options.adaptProportions;
        this._rectangle = options.rectangle;
        this._proxy = options.proxy;
        this._maxNumQualityLayers = options.maxNumQualityLayers;
        this._updateFrustumInterval = 1000 || options.updateFrustumInterval;
        this._credit = options.credit;
        
        if (typeof credit === 'string') {
            this._credit = new Credit(credit);
        }
        
        if (this._rectangle === undefined) {
            this._rectangle = Cesium.Rectangle.fromDegrees(-180, -90, 180, 90);
        }
        
        if (adaptProportions === undefined) {
            adaptProportions = true;
        }

        //>>includeStart('debug', pragmas.debug);
        if (url === undefined) {
                throw new DeveloperError('url is required.');
        }
        //>>includeEnd('debug');

        this._url = url;

        this._tilingScheme = undefined;

        this._tileWidth = 0;
        this._tileHeight = 0;

        this._errorEvent = new Event('JpipImageryProviderStatus');

        this._ready = false;
        this._statusCallback = null;
        this._cesiumWidget = null;
        this._updateFrustumIntervalHandle = null;
        

        var imageUrl = url;
        if (this._proxy !== undefined) {
            // NOTE: Is that the correct logic?
            imageUrl = this._proxy.getURL(imageUrl);
        }
            
        this._image = new WorkerProxyJpxJpipImage({
            serverRequestPrioritizer: 'frustum',
            decodePrioritizer: 'frustum'
        });

        this._url = imageUrl;
    }

    JpipImageryProvider.prototype = {
        /**
         * Gets the URL of the base JPIP server (including target).
         * @memberof JpipImageryProvider.prototype
         * @type {String}
         * @readonly
         */
        get url() {
            return this._url;
        },

        /**
         * Gets the proxy used by this provider.
         * @memberof JpipImageryProvider.prototype
         * @type {Proxy}
         * @readonly
         */
        get proxy() {
            return this._proxy;
        },

        /**
         * Gets the width of each tile, in pixels. This function should
         * not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {Number}
         * @readonly
         */
        get tileWidth() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('tileWidth must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return this._tileWidth;
        },

        /**
         * Gets the height of each tile, in pixels.  This function should
         * not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {Number}
         * @readonly
         */
        get tileHeight() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('tileHeight must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return this._tileHeight;
        },

        /**
         * Gets the maximum level-of-detail that can be requested.  This function should
         * not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {Number}
         * @readonly
         */
        get maximumLevel() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('maximumLevel must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return this._numResolutionLevels - 1;
        },

        /**
         * Gets the minimum level-of-detail that can be requested.  This function should
         * not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {Number}
         * @readonly
         */
        get minimumLevel() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('minimumLevel must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return 0;
        },

        /**
         * Gets the tiling scheme used by this provider.  This function should
         * not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {TilingScheme}
         * @readonly
         */
        get tilingScheme() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                throw new DeveloperError('tilingScheme must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return this._tilingScheme;
        },

        /**
         * Gets the rectangle, in radians, of the imagery provided by this instance.  This function should
         * not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {Rectangle}
         * @readonly
         */
        get rectangle() {
            return this._tilingScheme.rectangle;
        },

        /**
         * Gets the tile discard policy.  If not undefined, the discard policy is responsible
         * for filtering out "missing" tiles via its shouldDiscardImage function.  If this function
         * returns undefined, no tiles are filtered.  This function should
         * not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {TileDiscardPolicy}
         * @readonly
         */
        get tileDiscardPolicy() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                throw new DeveloperError('tileDiscardPolicy must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return undefined;
        },

        /**
         * Gets an event that is raised when the imagery provider encounters an asynchronous error.  By subscribing
         * to the event, you will be notified of the error and can potentially recover from it.  Event listeners
         * are passed an instance of {@link TileProviderError}.
         * @memberof JpipImageryProvider.prototype
         * @type {Event}
         * @readonly
         */
        get errorEvent() {
            return this._errorEvent;
        },

        /**
         * Gets a value indicating whether or not the provider is ready for use.
         * @memberof JpipImageryProvider.prototype
         * @type {Boolean}
         * @readonly
         */
        get ready() {
            return this._ready;
        },

        /**
         * Gets the credit to display when this imagery provider is active.  Typically this is used to credit
         * the source of the imagery.  This function should not be called before {@link JpipImageryProvider#ready} returns true.
         * @memberof JpipImageryProvider.prototype
         * @type {Credit}
         * @readonly
         */
        get credit() {
            return this._credit;
        },

        /**
         * Gets a value indicating whether or not the images provided by this imagery provider
         * include an alpha channel.  If this property is false, an alpha channel, if present, will
         * be ignored.  If this property is true, any images without an alpha channel will be treated
         * as if their alpha is 1.0 everywhere.  When this property is false, memory usage
         * and texture upload time are reduced.
         * @memberof JpipImageryProvider.prototype
         * @type {Boolean}
         * @readonly
         */
        get hasAlphaChannel() {
            return true;
        }
    };
    
    JpipImageryProvider.prototype.setExceptionCallback =
        function setExceptionCallback(exceptionCallback) {
        
        this._exceptionCallback = exceptionCallback;
    };
    
    JpipImageryProvider.prototype.open = function open(widgetOrViewer) {
        if (this._updateFrustumIntervalHandle !== null) {
            throw new DeveloperError('Cannot set two parent viewers.');
        }
        
        if (widgetOrViewer === undefined) {
            throw new DeveloperError('widgetOrViewer should be given. It is ' +
                'needed for frustum calculation for the priority mechanism');
        }
        
        this._image.setStatusCallback(this._statusCallback.bind(this));
        this._image.open(this._url);
        
        this._cesiumWidget = widgetOrViewer;
        
        this._updateFrustumIntervalHandle = setInterval(
            this._setPriorityByFrustum.bind(this),
            this._updateFrustumInterval);
    },
    
    JpipImageryProvider.prototype.close = function close() {
        clearInterval(this._updateFrustumIntervalHandle);
        this._image.close();
    },
    
    JpipImageryProvider.prototype.getTileWidth = function getTileWidth() {
        return this.tileWidth;
    };
    
    JpipImageryProvider.prototype.getTileHeight = function getTileHeight() {
        return this.tileHeight;
    };
    
    JpipImageryProvider.prototype.getMaximumLevel = function getMaximumLevel() {
        return this.maximumLevel;
    };
    
    JpipImageryProvider.prototype.getMinimumLevel = function getMinimumLevel() {
        return this.minimumLevel;
    };
    
    JpipImageryProvider.prototype.getUrl = function getUrl() {
        return this.url;
    };
    
    JpipImageryProvider.prototype.getProxy = function getProxy() {
        return this.proxy;
    };
    
    JpipImageryProvider.prototype.isReady = function isReady() {
        return this.ready;
    };
    
    JpipImageryProvider.prototype.getCredit = function getCredit() {
        return this.credit;
    };
    
    JpipImageryProvider.prototype.getRectangle = function getRectangle() {
        return this.tilingScheme.rectangle;
    };

    JpipImageryProvider.prototype.getTilingScheme = function getTilingScheme() {
        return this.tilingScheme;
    };

    JpipImageryProvider.prototype.getTileDiscardPolicy = function getTileDiscardPolicy() {
        return this.tileDiscardPolicy;
    };
    
    JpipImageryProvider.prototype.getErrorEvent = function getErrorEvent() {
        return this.errorEvent;
    };
    
    JpipImageryProvider.prototype.getHasAlphaChannel = function getHasAlphaChannel() {
        return this.hasAlphaChannel;
    };
    
    /**
     * Gets the credits to be displayed when a given tile is displayed.
     *
     * @param {Number} x The tile X coordinate.
     * @param {Number} y The tile Y coordinate.
     * @param {Number} level The tile level;
     * @returns {Credit[]} The credits to be displayed when the tile is displayed.
     *
     * @exception {DeveloperError} <code>getTileCredits</code> must not be called before the imagery provider is ready.
     */
    JpipImageryProvider.prototype.getTileCredits = function(x, y, level) {
        return undefined;
    };

    /**
     * Requests the image for a given tile.  This function should
     * not be called before {@link JpipImageryProvider#ready} returns true.
     *
     * @param {Number} x The tile X coordinate.
     * @param {Number} y The tile Y coordinate.
     * @param {Number} level The tile level.
     * @returns {Promise} A promise for the image that will resolve when the image is available, or
     *          undefined if there are too many active requests to the server, and the request
     *          should be retried later.  The resolved image may be either an
     *          Image or a Canvas DOM object.
     *
     * @exception {DeveloperError} <code>requestImage</code> must not be called before the imagery provider is ready.
     */
    JpipImageryProvider.prototype.requestImage = function(x, y, level) {
        //>>includeStart('debug', pragmas.debug);
        if (!this._ready) {
            throw new DeveloperError('requestImage must not be called before the imagery provider is ready.');
        }
        //>>includeEnd('debug');
        
        var self = this;
        
        var numResolutionLevelsToCut = this._numResolutionLevels - level - 1;
        
        var minX = x * this._tileWidth;
        var minY = y * this._tileHeight;
        var maxXExclusive = (x + 1) * this._tileWidth;
        var maxYExclusive = (y + 1) * this._tileHeight;
        
        var levelWidth = this._image.getLevelWidth(numResolutionLevelsToCut);
        var levelHeight = this._image.getLevelHeight(numResolutionLevelsToCut);
        
        var canvas = document.createElement('canvas');
        canvas.width = this._tileWidth;
        canvas.height = this._tileHeight;
        
        var context = canvas.getContext('2d');
        context.clearRect(0, 0, this._tileWidth, this._tileHeight);
        
        if (minX >= levelWidth ||
            minY >= levelHeight ||
            maxXExclusive <= 0 ||
            maxYExclusive <= 0) {
            
            return canvas;
        }
        
        var offsetX = 0;
        var offsetY = 0;
        maxXExclusive = Math.min(maxXExclusive, levelWidth);
        maxYExclusive = Math.min(maxYExclusive, levelHeight);
        
        if (minX < 0) {
            offsetX = -minX;
            minX = 0;
        }
        
        if (minY < 0) {
            offsetY = -minY;
            minY = 0;
        }
        
        var codestreamPartParams = {
            minX: minX,
            minY: minY,
            maxXExclusive: maxXExclusive,
            maxYExclusive: maxYExclusive,
            numResolutionLevelsToCut: numResolutionLevelsToCut,
            maxNumQualityLayers: this._maxNumQualityLayers,
            
            requestPriorityData: {
                imageRectangle: this._rectangle
            }
        };
        
        var resolve, reject;
        var requestPixelsPromise = new Promise(function(resolve_, reject_) {
            resolve = resolve_;
            reject = reject_;
            
            self._image.requestPixelsProgressive(
                codestreamPartParams,
                pixelsDecodedCallback,
                terminatedCallback);
        });
        
        function pixelsDecodedCallback(decoded) {
            var partialTileWidth = decoded.width;
            var partialTileHeight = decoded.height;

            var canvasTargetX = offsetX + decoded.xInOriginalRequest;
            var canvasTargetY = offsetY + decoded.yInOriginalRequest;
            
            if (partialTileWidth > 0 && partialTileHeight > 0) {
                var imageData = context.getImageData(
                    canvasTargetX, canvasTargetY, partialTileWidth, partialTileHeight);
                    
                imageData.data.set(decoded.pixels);
                context.putImageData(imageData, canvasTargetX, canvasTargetY);
            }
        }

        function terminatedCallback(isAborted) {
            if (isAborted) {
                reject('JPIP request or JPX decode aborted');
            } else {
                resolve(canvas);
            }
        }

        return requestPixelsPromise;
    };
    
    JpipImageryProvider.prototype._setPriorityByFrustum =
        function setPriorityByFrustum() {
        
        if (!this._ready) {
            return;
        }
        
        var frustumData = CesiumFrustumCalculator.calculateFrustum(
            this._cesiumWidget, this);
        
        if (frustumData === null) {
            return;
        }
        
        frustumData.imageRectangle = this.getRectangle();
        frustumData.exactNumResolutionLevelsToCut = null;

        this._image.setServerRequestPrioritizerData(frustumData);
        this._image.setDecodePrioritizerData(frustumData);
    };

    /**
     * Picking features is not currently supported by this imagery provider, so this function simply returns
     * undefined.
     *
     * @param {Number} x The tile X coordinate.
     * @param {Number} y The tile Y coordinate.
     * @param {Number} level The tile level.
     * @param {Number} longitude The longitude at which to pick features.
     * @param {Number} latitude  The latitude at which to pick features.
     * @return {Promise} A promise for the picked features that will resolve when the asynchronous
     *                   picking completes.  The resolved value is an array of {@link ImageryLayerFeatureInfo}
     *                   instances.  The array may be empty if no features are found at the given location.
     *                   It may also be undefined if picking is not supported.
     */
    JpipImageryProvider.prototype.pickFeatures = function() {
            return undefined;
    };
    
    JpipImageryProvider.prototype._statusCallback =
        function internalStatusCallback(status) {
        
        if (status.exception !== null && this._exceptionCallback !== null) {
            this._exceptionCallback(status.exception);
        }

        if (!status.isReady || this._ready) {
            return;
        }
        
        this._ready = status.isReady;
        
        // This is wrong if COD or COC exists besides main header COD
        this._numResolutionLevels = this._image.getDefaultNumResolutionLevels();
        this._maxNumQualityLayers = this._maxNumQualityLayers;
        //this._numResolutionLevels = 1;
            
        this._tileWidth = this._image.getTileWidth();
        this._tileHeight = this._image.getTileHeight();
            
        var bestLevel = this._numResolutionLevels - 1;
        var levelZeroWidth = this._image.getLevelWidth(bestLevel);
        var levelZeroHeight = this._image.getLevelHeight(bestLevel);
        
        var levelZeroTilesX = Math.ceil(levelZeroWidth / this._tileWidth);
        var levelZeroTilesY = Math.ceil(levelZeroHeight / this._tileHeight);

        jpipImageHelperFunctions.fixBounds(
            this._rectangle,
            this._image,
            this._adaptProportions);
        var rectangleWidth = this._rectangle.east - this._rectangle.west;
        var rectangleHeight = this._rectangle.north - this._rectangle.south;
        
        var bestLevelScale = 1 << bestLevel;
        var pixelsWidthForCesium = this._tileWidth * levelZeroTilesX * bestLevelScale;
        var pixelsHeightForCesium = this._tileHeight * levelZeroTilesY * bestLevelScale;
        
        // Cesium works with full tiles only, thus fix the geographic bounds so
        // the pixels lies exactly on the original bounds
        
        var geographicWidthForCesium =
            rectangleWidth * pixelsWidthForCesium / this._image.getLevelWidth();
        var geographicHeightForCesium =
            rectangleHeight * pixelsHeightForCesium / this._image.getLevelHeight();
        
        var fixedEast = this._rectangle.west + geographicWidthForCesium;
        var fixedSouth = this._rectangle.north - geographicHeightForCesium;
        
        this._tilingSchemeParams = {
            west: this._rectangle.west,
            east: fixedEast,
            south: fixedSouth,
            north: this._rectangle.north,
            levelZeroTilesX: levelZeroTilesX,
            levelZeroTilesY: levelZeroTilesY,
            maximumLevel: bestLevel
        };
        
        this._tilingScheme = createTilingScheme(this._tilingSchemeParams);
            
        Cesium.TileProviderError.handleSuccess(this._errorEvent);
    };
    
    function createTilingScheme(params) {
        var geographicRectangleForCesium = new Cesium.Rectangle(
            params.west, params.south, params.east, params.north);
        
        var tilingScheme = new Cesium.GeographicTilingScheme({
            rectangle: geographicRectangleForCesium,
            numberOfLevelZeroTilesX: params.levelZeroTilesX,
            numberOfLevelZeroTilesY: params.levelZeroTilesY
        });
        
        return tilingScheme;
    }
    
    return JpipImageryProvider;
})();