'use strict';

var JpipSubbandLengthInPacketHeaderCalculatorStub = (
    function JpipSubbandLengthInPacketHeaderCalculatorStub() {
    
    var incrementalId = 0;
    
    function JpipTagTreeStub(bitstreamReader, numCodeblocksX, numCodeblocksY) {
        var id = ++incrementalId;
        
        this.calculateSubbandLength = function calculateSubbandLength(qualityLayer) {
            qualityLayersCallsLog.log(
                'subbandLengthCalculator',
                /*instanceId=*/id,
                /*details=*/{
                    functionName: 'calculateSubbandLength',
                    qualityLayer: qualityLayer
                });

            var result = stubParseFromBitstream(
                bitstreamReader, 'calculateSubbandLength');
            
            return result;
        };
    };
    
    return JpipTagTreeStub;
})();