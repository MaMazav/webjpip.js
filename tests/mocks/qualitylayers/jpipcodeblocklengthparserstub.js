'use strict';

var JpipCodeblockLengthParserStub = (function JpipCodeblockLengthParserStubClosure() {
    var incrementalId = 0;
    
    function JpipCodeblockLengthParserStub(bitstreamReader, transactionHelper) {
        var id = ++incrementalId;
        
        this.parse = function parse(codingPassesNumber) {
            qualityLayersCallsLog.log('codeblockLengthParser', id, {
                    functionName: 'parse',
                    codingPassesNumber: codingPassesNumber
                });

            var result = stubParseFromBitstream(bitstreamReader, 'codeblockLength');
            
            return result;
        };
    }
    
    return JpipCodeblockLengthParserStub;
})();