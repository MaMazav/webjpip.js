var JpipCodestreamClient = require('jpip-codestream-client.js').JpipCodestreamClient;
var PdfjsJpxDecoder = require('pdfjs-jpx-decoder.js').PdfjsJpxDecoder;
var JpipCodestreamSizesCalculator = require('jpip-codestream-sizes-calculator.js').JpipCodestreamSizesCalculator;

module.exports.JpipImageImplementation = {
	createFetcher: function createFetcher(url) {
        return new Promise(function(resolve, reject) {
            var codestreamClient = new JpipCodestreamClient();
            codestreamClient.setStatusCallback(function(status) {
                if (status.isReady) {
                    resolve({
                        fetcher: codestreamClient,
                        sizesParams: fetcher.getSizesParams()
                    });
                } else if (status.exception) {
                    codestreamClient.setStatusCallback(null);
                    reject(status.exception);
                }
            });
            codestreamClient.open(url);
        });
    },
    
    createPixelsDecoder: function createPixelsDecoder() {
        return new PdfjsJpxDecoder();
    },
    
    createImageParamsRetriever: function createImageParamsRetriever(imageParams) {
		return new JpipCodestreamSizesCalculator(imageParams);
    },
    
    getScriptsToImport: function getScriptsToImport() {
        var errorWithStackTrace = new Error();
        var stack = errorWithStackTrace.stack.trim();
        
        var currentStackFrameRegex = /at (|[^ ]+ \()([^ ]+):\d+:\d+/;
        var source = currentStackFrameRegex.exec(stack);
        if (source && source[2] !== "") {
            return [source[2]];
        }

        var lastStackFrameRegex = new RegExp(/.+\/(.*?):\d+(:\d+)*$/);
        source = lastStackFrameRegex.exec(stack);
        if (source && source[1] !== "") {
            return [source[1]];
        }
        
        if (errorWithStackTrace.fileName !== undefined) {
            return [errorWithStackTrace.fileName];
        }
        
        throw 'JpipImageImplementation: Could not get current script URL';
    }
};