'use strict';

module.exports = PdfjsJpxCoefficientsDecoder;

var PdfjsJpxContextPool = require('pdfjs-jpx-context-pool.js');

function PdfjsJpxCoefficientsDecoder() {
    this._contextPool = new PdfjsJpxContextPool();
}

PdfjsJpxCoefficientsDecoder.prototype.start = function start(data, key) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var image = self._contextPool.image;
        var currentContext = self._contextPool.getContext(data.headersCodestream);
        if (data.codeblocksData) {
            image.addPacketsData(currentContext, data.codeblocksData);
        }
        if (data.precinctCoefficients) {
            // NOTE: Apparently dead code that can be removed
            for (var j = 0; j < data.precinctCoefficients.length; ++j) {
                var precinct = data.precinctCoefficients[j];
                image.setPrecinctCoefficients(
                    currentContext, precinct.coefficients, precinct.tileIndex,
                    precinct.c, precinct.r, precinct.p);
            }
        }
        
        var coefficients = image.decodePrecinctCoefficients(
            currentContext,
            /*tileIndex=*/0,
            key.component,
            key.resolutionLevel,
            key.precinctIndexInComponentResolution);

        resolve({
            key: key,
            coefficients: coefficients,
            minQuality: data.minQuality
        });
    });
};