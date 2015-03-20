'use strict';

var AjaxResponseStub = (function AjaxResponseStubClosure() {
    var idCounter = 0;
    
    function AjaxResponseStub(createChannel, createTarget, cnewHeader) {
        if (createChannel) {
            this.channelId = 'Channel#' + (++idCounter);
            this.cnewHeader =
                'DummyKey1=DummyValue1,cid=' + this.channelId + ',DummyKey2=DummyValue2';
                
            if (cnewHeader) {
                throw 'Cannot create channel with cnewHeader given. Fix test';
            }
        } else {
            this.channelId = null;
            this.cnewHeader = cnewHeader;
        }
        
        if (createTarget) {
            this.targetId = 'Target#' + (++idCounter);
            this.tidHeader = this.targetId;
        } else {
            this.targetId = null;
            this.tidHeader = '';
        }
    };
    
    AjaxResponseStub.prototype.getResponseHeader = function getResponseHeader(header) {
        switch (header) {
            case 'JPIP-tid':
                return this.tidHeader;
            case 'JPIP-cnew':
                return this.cnewHeader;
            default:
                throw 'Unexpected requested header in ajax stub ' +
                    header + '. Fix test';
        }
    };
    
    return AjaxResponseStub;
})();