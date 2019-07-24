'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipImage = require('jpip-image.js');
module.exports.j2kExceptions = jGlobals.j2kExceptions;
module.exports.jpipExceptions = jGlobals.jpipExceptions;
module.exports.Internals = {
    PdfjsJpxDecoderLegacy: require('pdfjs-jpx-decoder-legacy.js'),
    PdfjsJpxPixelsDecoder: require('pdfjs-jpx-pixels-decoder.js'),
    PdfjsJpxCoefficientsDecoder: require('pdfjs-jpx-coefficients-decoder.js'),
    jpipRuntimeFactory: require('jpip-runtime-factory.js'),
    jGlobals: jGlobals
};