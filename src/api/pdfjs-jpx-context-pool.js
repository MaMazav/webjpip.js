'use strict';

module.exports = PdfjsJpxContextPool;

import { JpxImage } from 'jpx.js';

function PdfjsJpxContextPool() {
    this._image = new JpxImage();
    this._cachedContexts = [];
}

Object.defineProperty(PdfjsJpxContextPool.prototype, 'image', { get : function() {
    return this._image;
} });

PdfjsJpxContextPool.prototype.getContext = function getContext(headersCodestream) {
    var contextsOfSameLength = this._cachedContexts[headersCodestream.length];
    if (!contextsOfSameLength) {
        contextsOfSameLength = [];
        this._cachedContexts[headersCodestream.length] = contextsOfSameLength;
    }
    
    var contextIndex = 0;
    var isMatchingContext = false;
    while (contextIndex < contextsOfSameLength.length && !isMatchingContext) {
        var codestream = contextsOfSameLength[contextIndex].codestream;
        var i = 0;
        while (i < codestream.length && codestream[i] === headersCodestream[i]) {
            ++i;
        }
        
        isMatchingContext = i === codestream.length;
        ++contextIndex;
    }
    
    var currentContext;
    if (isMatchingContext) {
        currentContext = contextsOfSameLength[contextIndex - 1].context;
        this._image.invalidateData(currentContext);
    } else {
        currentContext = this._image.parseCodestream(
            headersCodestream,
            0,
            headersCodestream.length,
            { isOnlyParseHeaders: true });
        contextsOfSameLength.push({
            codestream: headersCodestream,
            context: currentContext
        });
    }
    
    return currentContext;
};