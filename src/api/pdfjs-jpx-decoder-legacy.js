'use strict';

module.exports = PdfjsJpxDecoderLegacy;

var jGlobals = require('j2k-jpip-globals.js');

import { JpxImage } from 'jpx.js';

function PdfjsJpxDecoderLegacy() {
    this._image = new JpxImage();
}

PdfjsJpxDecoderLegacy.prototype.start = function start(data) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var regionToParse = {
            left  : data.offsetInRegion.offsetX,
            top   : data.offsetInRegion.offsetY,
            right : data.offsetInRegion.offsetX + data.offsetInRegion.width,
            bottom: data.offsetInRegion.offsetY + data.offsetInRegion.height
        };
        
        var currentContext = self._image.parseCodestream(
            data.headersCodestream,
            0,
            data.headersCodestream.length,
            { isOnlyParseHeaders: true });
        
        if (data.codeblocksData) {
            self._image.addPacketsData(currentContext, data.codeblocksData);
        }
        if (data.precinctCoefficients) {
            for (var i = 0; i < data.precinctCoefficients.length; ++i) {
                var precinct = data.precinctCoefficients[i];
                self._image.setPrecinctCoefficients(
                    currentContext, precinct.coefficients, precinct.tileIndex,
                    precinct.c, precinct.r, precinct.p);
            }
        }
        
        self._image.decode(currentContext, { regionToParse: regionToParse });

        var pixels = self._copyTilesPixelsToOnePixelsArray(self._image.tiles, regionToParse, self._image.componentsCount);
        resolve(pixels);
    });
};

PdfjsJpxDecoderLegacy.prototype._copyTilesPixelsToOnePixelsArray =
    function copyTilesPixelsToOnePixelsArray(tiles, resultRegion, componentsCount) {
        
    var firstTile = tiles[0];
    var width = resultRegion.right - resultRegion.left;
    var height = resultRegion.bottom - resultRegion.top;
    
    //if (firstTile.left === resultRegion.left &&
    //    firstTile.top === resultRegion.top &&
    //    firstTile.width === width &&
    //    firstTile.height === height &&
    //    componentsCount === 4) {
    //    
    //    return firstTile;
    //}
    
    var result = new ImageData(width, height);
      
    var bytesPerPixel = 4;
    var rgbaImageStride = width * bytesPerPixel;
    
    var tileIndex = 0;
    
    //for (var x = 0; x < numTilesX; ++x) {

    for (var i = 0; i < tiles.length; ++i) {
        var tileRight = tiles[i].left + tiles[i].width;
        var tileBottom = tiles[i].top + tiles[i].height;
        
        var intersectionLeft = Math.max(resultRegion.left, tiles[i].left);
        var intersectionTop = Math.max(resultRegion.top, tiles[i].top);
        var intersectionRight = Math.min(resultRegion.right, tileRight);
        var intersectionBottom = Math.min(resultRegion.bottom, tileBottom);
        
        var intersectionWidth = intersectionRight - intersectionLeft;
        var intersectionHeight = intersectionBottom - intersectionTop;
        
        if (intersectionLeft !== tiles[i].left ||
            intersectionTop !== tiles[i].top ||
            intersectionWidth !== tiles[i].width ||
            intersectionHeight !== tiles[i].height) {
            
            throw 'Unsupported tiles to copy';
        }
        
        var tileOffsetXPixels = intersectionLeft - resultRegion.left;
        var tileOffsetYPixels = intersectionTop - resultRegion.top;
            
        var tileOffsetBytes =
            tileOffsetXPixels * bytesPerPixel +
            tileOffsetYPixels * rgbaImageStride;

        this._copyTile(
            result.data, tiles[i], tileOffsetBytes, rgbaImageStride, componentsCount);
    }
    
    return result;
};

PdfjsJpxDecoderLegacy.prototype._copyTile = function copyTile(
    targetImage, tile, targetImageStartOffset, targetImageStride, componentsCount) {
    
    var rOffset = 0;
    var gOffset = 1;
    var bOffset = 2;
    var pixelsOffset = 1;
    
    var pixels = tile.pixels || tile.items;
    
    if (componentsCount === undefined) {
        componentsCount = pixels.length / (tile.width * tile.height);
    }
    
    switch (componentsCount) {
        case 1:
            gOffset = 0;
            bOffset = 0;
            break;
        
        case 3:
            pixelsOffset = 3;
            break;
            
        case 4:
            pixelsOffset = 4;
            break;
            
        default:
            throw 'Unsupported components count ' + componentsCount;
    }
    
    var targetImageIndex = targetImageStartOffset;
    var pixel = 0;
    for (var y = 0; y < tile.height; ++y) {
        var targetImageStartLine = targetImageIndex;
        
        for (var x = 0; x < tile.width; ++x) {
            targetImage[targetImageIndex + 0] = pixels[pixel + rOffset];
            targetImage[targetImageIndex + 1] = pixels[pixel + gOffset];
            targetImage[targetImageIndex + 2] = pixels[pixel + bOffset];
            targetImage[targetImageIndex + 3] = 255;
            
            pixel += pixelsOffset;
            targetImageIndex += 4;
        }
        
        targetImageIndex = targetImageStartLine + targetImageStride;
    }
};