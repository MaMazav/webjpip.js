'use strict';

var CanvasImageryProvider = (function CanvasImageryProviderClosure() {

        /**
         * Provides a Single Canvas imagery tile.  The image is assumed to use a
         * {@link GeographicTilingScheme}.
         *
         * @alias CanvasImageryProvider
         * @constructor
         *
         * @param {canvas} Canvas for the tile.
         * @param {Object} options Object with the following properties:
         * @param {Credit|String} [options.credit] A credit for the data source, which is displayed on the canvas.
     *
         * @see ArcGisMapServerImageryProvider
         * @see BingMapsImageryProvider
         * @see GoogleEarthImageryProvider
         * @see OpenStreetMapImageryProvider
         * @see TileMapServiceImageryProvider
         * @see WebMapServiceImageryProvider
         */
        var CanvasImageryProvider = function(canvas, options) {
            if (options === undefined) {
                options = {};
        }
        
                //>>includeStart('debug', pragmas.debug);
                if (canvas === undefined) {
                        throw new DeveloperError('canvas is required.');
                }
                //>>includeEnd('debug');

        this._canvas = canvas;

                this._errorEvent = new Event('CanvasImageryProviderStatus');

                this._ready = false;
        
                var credit = options.credit;
                if (typeof credit === 'string') {
                        credit = new Credit(credit);
                }
                this._credit = credit;
        };

        CanvasImageryProvider.prototype = {
                /**
                 * Gets the width of each tile, in pixels. This function should
                 * not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
                 * @type {Number}
                 * @readonly
                 */
                get tileWidth() {
                        //>>includeStart('debug', pragmas.debug);
                        if (!this._ready) {
                                throw new DeveloperError('tileWidth must not be called before the imagery provider is ready.');
                        }
                        //>>includeEnd('debug');

                        return this._canvas.width;
                },

                /**
                 * Gets the height of each tile, in pixels.  This function should
                 * not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
                 * @type {Number}
                 * @readonly
                 */
                get tileHeight() {
                        //>>includeStart('debug', pragmas.debug);
                        if (!this._ready) {
                                throw new DeveloperError('tileHeight must not be called before the imagery provider is ready.');
                        }
                        //>>includeEnd('debug');

                        return this._canvas.height;
                },

                /**
                 * Gets the maximum level-of-detail that can be requested.  This function should
                 * not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
                 * @type {Number}
                 * @readonly
                 */
                get maximumLevel() {
                        //>>includeStart('debug', pragmas.debug);
                        if (!this._ready) {
                                throw new DeveloperError('maximumLevel must not be called before the imagery provider is ready.');
                        }
                        //>>includeEnd('debug');

                        return 0;
                },

                /**
                 * Gets the minimum level-of-detail that can be requested.  This function should
                 * not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
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
                 * not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
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
                 * not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
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
                 * not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
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
                 * @memberof CanvasImageryProvider.prototype
                 * @type {Event}
                 * @readonly
                 */
                get errorEvent() {
                        return this._errorEvent;
                },

                /**
                 * Gets a value indicating whether or not the provider is ready for use.
                 * @memberof CanvasImageryProvider.prototype
                 * @type {Boolean}
                 * @readonly
                 */
                get ready() {
                        return this._ready;
                },

                /**
                 * Gets the credit to display when this imagery provider is active.  Typically this is used to credit
                 * the source of the imagery.  This function should not be called before {@link CanvasImageryProvider#ready} returns true.
                 * @memberof CanvasImageryProvider.prototype
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
                 * @memberof CanvasImageryProvider.prototype
                 * @type {Boolean}
                 * @readonly
                 */
                get hasAlphaChannel() {
                        return true;
                }
        };
    
    CanvasImageryProvider.prototype.setRectangle =
        function setRectangle(rectangle) {
        
        this._tilingScheme = new Cesium.GeographicTilingScheme({
            rectangle: rectangle,
            numberOfLevelZeroTilesX: 1,
            numberOfLevelZeroTilesY: 1
        });
        
        if (!this._ready) {
            this._ready = true;
            Cesium.TileProviderError.handleSuccess(this._errorEvent);
        }
    },
    
    CanvasImageryProvider.prototype.getTileWidth = function getTileWidth() {
        return this.tileWidth;
    };
    
    CanvasImageryProvider.prototype.getTileHeight = function getTileHeight() {
        return this.tileHeight;
    };
    
    CanvasImageryProvider.prototype.getMaximumLevel = function getMaximumLevel() {
        return this.maximumLevel;
    };
    
    CanvasImageryProvider.prototype.getMinimumLevel = function getMinimumLevel() {
        return this.minimumLevel;
    };
    
    CanvasImageryProvider.prototype.isReady = function isReady() {
        return this.ready;
    };
    
    CanvasImageryProvider.prototype.getCredit = function getCredit() {
        return this.credit;
    };
    
    CanvasImageryProvider.prototype.getRectangle = function getRectangle() {
        return this.tilingScheme.rectangle;
    };

    CanvasImageryProvider.prototype.getTilingScheme = function getTilingScheme() {
        return this.tilingScheme;
    };

    CanvasImageryProvider.prototype.getTileDiscardPolicy = function getTileDiscardPolicy() {
        return this.tileDiscardPolicy;
    };
    
    CanvasImageryProvider.prototype.getErrorEvent = function getErrorEvent() {
        return this.errorEvent;
    };
    
    CanvasImageryProvider.prototype.getHasAlphaChannel = function getHasAlphaChannel() {
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
        CanvasImageryProvider.prototype.getTileCredits = function(x, y, level) {
                return undefined;
        };

        /**
         * Requests the image for a given tile.  This function should
         * not be called before {@link CanvasImageryProvider#ready} returns true.
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
        CanvasImageryProvider.prototype.requestImage = function(x, y, level) {
                //>>includeStart('debug', pragmas.debug);
                if (!this._ready) {
                        throw new DeveloperError('requestImage must not be called before the imagery provider is ready.');
                }
                //>>includeEnd('debug');
        
        return this._canvas;
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
        CanvasImageryProvider.prototype.pickFeatures = function() {
                return undefined;
        };
    
        return CanvasImageryProvider;
})();