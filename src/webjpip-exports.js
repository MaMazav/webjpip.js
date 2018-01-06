'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipImage = require('jpip-image.js');
module.exports.PdfjsJpxDecoder = require('pdfjs-jpx-decoder.js');
module.exports.j2kExceptions = jGlobals.j2kExceptions;
module.exports.jpipExceptions = jGlobals.jpipExceptions;
module.exports.Internals = {
    jpipRuntimeFactory: require('jpip-runtime-factory.js'),
    jGlobals: jGlobals
};