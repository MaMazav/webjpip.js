'use strict';

var JpxImage = require('jpx.js');

function AsyncJpxImage() {
}

AsyncJpxImage.prototype = Object.create(JpxImage.prototype);

AsyncJpxImage.prototype.parseCodestreamAsync = function parseCodestreamAsync(
	callback, data, start, end, options) {
	
	this._currentContext = this.parseCodestream(data, start, end, options);
	
	if (options !== undefined && options.isOnlyParseHeaders) {
		callback(null);
		return;
	}
	
	this._getPixels(callback, options);
};

AsyncJpxImage.prototype.addPacketsDataToCurrentContext =
	function addPacketsDataToCurrentContext(packetsData) {
	
	this.addPacketsData(this._currentContext, packetsData);
};

AsyncJpxImage.prototype.decodeCurrentContextAsync =
	function decodeCurrentContextAsync(callback, options) {
	
	this.decode(this._currentContext, options);
	this._getPixels(callback, options);
};

AsyncJpxImage.prototype._getPixels = function getPixels(callback, options) {
	var region;
	if (options !== undefined && options.regionToParse !== undefined) {
		region = options.regionToParse;
	} else {
		region = {
			left : 0,
			top : 0,
			right : this.width,
			bottom : this.height
		};
	}
	
	var result = copyTilesPixelsToOnePixelsArray(this.tiles, region, this.componentsCount);
	callback(result);
};