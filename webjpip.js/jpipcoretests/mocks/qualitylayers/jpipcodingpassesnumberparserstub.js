'use strict';

var jpipCodingPassesNumberParserStub = {
    parse: function parse(bitstreamReader) {
        qualityLayersCallsLog.log(
            'codingPassesNumberParser',
            /*instanceId=*/null,
            {
                functionName: 'parse',
                bitstreamReader: bitstreamReader.placeholder
            });
                
        var result = stubParseFromBitstream(bitstreamReader, 'codingPassesNumber');
        return result;
    }
};