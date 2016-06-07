'use strict';

var bitstreamReaderStubPlaceholder = 'bitstreamReaderPlaceholder'; // For calls log

var JpipBitstreamReaderStub = function JpipBitstreamReaderStubClosure(bits) {
    var offset = 0;
    
    var activeTransaction = {
        abort: function abort() {
            qualityLayersCallsLog.log(
                'bitstreamReader',
                /*instanceId=*/null,
                /*details=*/{ functionName: 'activeTransaction.abort' });
        },
        commit: function commit() {
            qualityLayersCallsLog.log(
                'bitstreamReader',
                /*instanceId=*/null,
                /*details=*/{ functionName: 'activeTransaction.commit' });
        }
    };
    
    this.placeholder = bitstreamReaderStubPlaceholder;
    
    this.setOffsetForTest = function setOffsetForTest(newOffset) {
        offset = newOffset;
    };
    
    Object.defineProperty(this, 'internalBufferForTest', {
        get: function getInternalBufferForTest() {
            return bits;
        }
    });
    
    Object.defineProperty(this, 'activeTransaction', {
        get: function getActiveTransaction() {
            return activeTransaction;
        },
        set: function setActiveTransaction(dummyActiveTransactionForTest) {
            activeTransaction = dummyActiveTransactionForTest;
        }
    });
    
    Object.defineProperty(this, 'bitsCounter', {
        get: function getBitsCounter() {
            shiftIfLastByteFF(1);
            return offset;
        }
    });
    
    Object.defineProperty(this, 'databinOffset', {
        get: function getDatabinOffset() {
            qualityLayersCallsLog.log(
                'bitstreamReader',
                /*instanceId=*/null,
                /*details=*/{ functionName: 'get databinOffset' });

            shiftIfLastByteFF(1);
            if (offset % 8 !== 0) {
                throw 'databinOffset is in the middle of the byte. ' +
                    'Fix test or implementation';
            }
            return offset / 8;
        },
        
        set: function setDatabinOffset(value) {
            qualityLayersCallsLog.log(
                'bitstreamReader',
                /*instanceId=*/null,
                /*details=*/{ functionName: 'set databinOffset', offset: value });

            offset = value * 8;
        }
    });
    
    this.startNewTransaction = function startNewTransaction() {
        qualityLayersCallsLog.log(
            'bitstreamReader',
            /*instanceId=*/null,
            /*details=*/{ functionName: 'startNewTransaction' });
    };
    
    this.shiftRemainingBitsInByte = function shiftRemainingBitsInByte() {
        qualityLayersCallsLog.log(
            'bitstreamReader',
            /*instanceId=*/null,
            /*details=*/{ functionName: 'shiftRemainingBitsInByte' });

        offset = Math.ceil(offset / 8) * 8;
        shiftIfLastByteFF(8);
    };
    
    this.shiftBit = function shiftBit() {
        qualityLayersCallsLog.log(
            'bitstreamReader',
            /*instanceId=*/null,
            /*details=*/{ functionName: 'shiftBit' });
        
        var result = shiftBitInternal();
        return result;
    };
    
    this.shiftBits = function shiftBits(bitsCount) {
        var result = shiftBitsInternal(bitsCount);
        return result;
    }
    
    this.shiftBitsFFIgnoreForTest = function shiftBitsFFIgnoreForTest(bitsCount) {
        var result = shiftBitsInternal(bitsCount, /*ignoreFF=*/true);
        return result;
    };
    
    this.countOnesAndShiftUntilFirstZeroBit =
        function countOnesAndShiftUntilFirstZeroBit(maxBitsToShift) {
        
        var result = countBits(1, maxBitsToShift);
        return result;
    };
    
    this.countZerosAndShiftUntilFirstOneBit =
        function countZerosAndShiftUntilFirstOneBit(maxBitsToShift) {
        
        var result = countBits(0, maxBitsToShift);
        return result;
    };
    
    function shiftBitsInternal(bitsCount, ignoreFF) {
        var originalOffset = offset;
        var result = 0;
        
        for (var i = 0; i < bitsCount; ++i) {
            result <<= 1;
            
            var currentBit;
            if (ignoreFF) {
                currentBit = getBit(offset++);
            } else {
                currentBit = shiftBitInternal();
            }
            
            if (currentBit === null) {
                offset = originalOffset;
                return null;
            }
            
            result += currentBit;
        }
        
        return result;
    }
    
    function countBits(valueToCount, maxBitsToShift) {
        var originalOffset = offset;
        var result = 0;
        
        if (maxBitsToShift === 0) {
            return 0;
        }
        
        var bit = shiftBitInternal();
        while (bit === valueToCount) {
            ++result;
            
            if (result >= maxBitsToShift) {
                break;
            }
            
            bit = shiftBitInternal();
        }
        
        if (bit === null) {
            offset = originalOffset;
            return null;
        }
        
        return result;
    };
    
    function shiftBitInternal() {
        shiftIfLastByteFF(1);
        var result = getBit(offset++);
        return result;
    };
    
    function getBit(bitOffset) {
        var result = bits[bitOffset];
        
        if (result !== 0 && result !== 1 && result !== null) {
            throw 'Illegal value of bit in bitstream: ' + result + ' at offset ' +
                bitOffset + '. Expected 0 or 1. Maybe end of stream was ' +
                'reached. Fix implementation or test';
        }
        
        return result;
    };
    
    function shiftIfLastByteFF(bitsToShift) {
        if (offset < 8 || offset % 8 > 0) {
            return;
        }
        
        for (var i = offset - 8; i < offset; ++i) {
            if (!getBit(i)) {
                return;
            }
        }
        
        offset += bitsToShift;
    }
};