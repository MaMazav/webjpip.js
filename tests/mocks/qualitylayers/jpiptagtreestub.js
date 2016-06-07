'use strict';

var JpipTagTreeStub = (function JpipTagTreeStubClosure() {
    var incrementalId = 0;
    
    function JpipTagTreeStub(bitstreamReader, width, height) {
        var id = ++incrementalId;
        
        this.setMinimalValueIfNotReadBits =
            function setMinimalValueIfNotReadBits(value) {

            qualityLayersCallsLog.log(
                'tagTree',
                /*instanceId=*/id,
                /*details=*/{
                    functionName: 'setMinimalValueIfNotReadBits',
                    value: value
                });
        };
        
        this.isSmallerThanOrEqualsTo =
            function isSmallerThanOrEqualsTo(x, y, value) {
            
            qualityLayersCallsLog.log(
                'tagTree',
                /*instanceId=*/id,
                /*details=*/{
                    functionName: 'isSmallerThanOrEqualsTo',
                    x: x,
                    y: y,
                    value: value
                });
            
            var result = stubParseFromBitstream(
                bitstreamReader, 'tagTreeIsSmallerOrEquals');
            
            return result;
        };
        
        this.getValue = function getValue(x, y) {
            qualityLayersCallsLog.log('tagTree', id, {
                    functionName: 'getValue',
                    x: x,
                    y: y
                });
                
            var result = stubParseFromBitstream(
                bitstreamReader, 'tagTreeGetValue');
            
            return result;
        };
    }
    
    return JpipTagTreeStub;
})();