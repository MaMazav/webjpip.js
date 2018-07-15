'use strict';

module.exports = PdfjsJpxCoefficientsDecoder;

var jGlobals = require('j2k-jpip-globals.js');

import { JpxImage } from 'jpx.js';

function PdfjsJpxCoefficientsDecoder() {
    this._image = new JpxImage();
}

PdfjsJpxCoefficientsDecoder.prototype.start = function start(data, key) {
    var self = this;
    return new Promise(function(resolve, reject) {
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
        
        var coefficients = self._image.decodePrecinctCoefficients(
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