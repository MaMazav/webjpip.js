'use strict';

self.onmessage = function(event) {  
    importScripts('../../../jpx.js/util.js');
    importScripts('../../../jpx.js/arithmetic_decoder.js');
    importScripts('../../../jpx.js/jpx.js');
    importScripts('../../jpxjpipimage/jpxjpipimagehelpers/copyTilesPixelsToOnePixelsArray.js');
    
    var codestream = new Uint8Array(event.data.codestream);
    var decodeOptions = event.data.decodeOptions;
    
    var jpxImg = new JpxImage();
    jpxImg.parseCodestream(codestream, 0, codestream.length, decodeOptions);
    
    var decodedRegion = decodeOptions.regionToParse;
    var result = copyTilesPixelsToOnePixelsArray(
    jpxImg.tiles, decodedRegion, jpxImg.componentsCount);

    var transferables = [result.pixels.buffer]; // Avoid copying heavy array
    self.postMessage(result, transferables);
};