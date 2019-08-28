'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = (function JpipBitstreamReaderClosure() {
    var NULL_BYTE = -1; // Using js' null and number in same property degrades performance
    var zeroBitsUntilFirstOneBitMap = createZeroBitsUntilFirstOneBitMap();

    function JpipBitstreamReader(databin, transactionHelper) {
        var initialState = {
            nextOffsetToParse: 0,
            validBitsInCurrentByte: 0,
            originalByteWithoutShift: NULL_BYTE,
            currentByte: NULL_BYTE,
            isSkipNextByte: false
            };

        var streamState = transactionHelper.createTransactionalObject(initialState, function cloneState(state) {
            return {
                nextOffsetToParse: state.nextOffsetToParse,
                validBitsInCurrentByte: state.validBitsInCurrentByte,
                originalByteWithoutShift: state.originalByteWithoutShift,
                currentByte: state.currentByte,
                isSkipNextByte: state.isSkipNextByte
            };
        });
        var activeTransaction = null;
        
        Object.defineProperty(this, 'activeTransaction', {
            get: function getActiveTransaction() {
                if (activeTransaction === null ||
                    !activeTransaction.isActive) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'No active transaction in bitstreamReader');
                }
                
                return activeTransaction;
            }
        });
        
        Object.defineProperty(this, 'bitsCounter', {
            get: function getBitsCounter() {
                var state = streamState.getValue(activeTransaction);
                
                tryValidateCurrentByte(databin, state);
                if (state.isSkipNextByte) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Unexpected state of bitstreamReader: ' +
                        'When 0xFF encountered, tryValidateCurrentByte ' +
                        'should skip the whole byte  after ' +
                        'shiftRemainingBitsInByte and clear isSkipNextByte. ' +
                        'However the flag is still set');
                }
                
                var result = state.nextOffsetToParse * 8 - state.validBitsInCurrentByte;
                
                return result;
            }
        });
        
        Object.defineProperty(this, 'databinOffset', {
            get: function getDatabinOffset() {
                var state = streamState.getValue(activeTransaction);
                
                if (state.isSkipNextByte) {
                    return state.nextOffsetToParse + 1;
                }
                
                if (state.validBitsInCurrentByte % 8 !== 0 ||
                    state.originalByteWithoutShift === 0xFF) {
                    
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Cannot calculate databin offset when bitstreamReader ' +
                        ' is in the middle of the byte');
                }
                
                return state.nextOffsetToParse - state.validBitsInCurrentByte / 8;
            },
            
            set: function setDatabinOffset(offsetInBytes) {
                var state = streamState.getValue(activeTransaction);
                state.validBitsInCurrentByte = 0;
                state.isSkipNextByte = false;
                state.originalByteWithoutShift = NULL_BYTE;
                state.nextOffsetToParse = offsetInBytes;
            }
        });
        
        this.startNewTransaction = function startNewTransaction() {
            if (activeTransaction !== null && activeTransaction.isActive) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot start new transaction in bitstreamReader ' +
                    'while another transaction is active');
            }
            
            activeTransaction = transactionHelper.createTransaction();
        };
        
        this.shiftRemainingBitsInByte = function shiftRemainingBitsInByte() {
            var state = streamState.getValue(activeTransaction);

            state.isSkipNextByte = state.originalByteWithoutShift === 0xFF;
            state.validBitsInCurrentByte = Math.floor(
                state.validBitsInCurrentByte / 8);
        };
        
        this.shiftBit = function shiftBit() {
            var state = streamState.getValue(activeTransaction);
            if (!tryValidateCurrentByte(databin, state)) {
                return null;
            }
            
            var onesCount = countAndShiftBits(
                databin,
                state,
                /*isUntilZeroBit=*/true,
                /*maxBitsToShift=*/1);
            
            return onesCount;
        };
        
        this.countZerosAndShiftUntilFirstOneBit =
            function countZerosAndShiftUntilFirstOneBit(maxBitsToShift) {
                var state = streamState.getValue(activeTransaction);
                var result = countAndShiftBits(
                    databin, state, /*isUntilZeroBit=*/false, maxBitsToShift);
                return result;
        };
        
        this.countOnesAndShiftUntilFirstZeroBit =
            function countOnesAndShiftUntilFirstZeroBit(maxBitsToShift) {
                var state = streamState.getValue(activeTransaction);
                var result = countAndShiftBits(
                    databin, state, /*isUntilZeroBit=*/true, maxBitsToShift);
                return result;
        };
        
        this.shiftBits = function shiftBits(bitsCount) {
            var result = 0;
            var state = streamState.getValue(activeTransaction);
            var remainingBits = bitsCount;
            
            while (remainingBits > 0) {
                if (!tryValidateCurrentByte(databin, state)) {
                    return null;
                }
                
                var bitsToTake = Math.min(
                    state.validBitsInCurrentByte, remainingBits);
                
                var addToResult = state.currentByte >> (8 - bitsToTake);
                result = (result << bitsToTake) + addToResult;
                
                removeBitsFromByte(state, bitsToTake);
                remainingBits -= bitsToTake;
            }
            
            return result;
        };
    }
    
    function countAndShiftBits(databin, state, isUntilZeroBit, maxBitsToShift) {
        var countedBits = 0;
        var foundTerminatingBit;
        var remainingBits = maxBitsToShift;
        
        do {
            if (!tryValidateCurrentByte(databin, state)) {
                return null;
            }
            
            var byteValue = isUntilZeroBit ? ~state.currentByte : state.currentByte;
            var bitsCountIncludingTerminatingBit = Math.min(
                zeroBitsUntilFirstOneBitMap[byteValue],
                state.validBitsInCurrentByte + 1);
            
            var bitsCountNotIncludingTerminatingBit =
                bitsCountIncludingTerminatingBit - 1;
            
            if (remainingBits !== undefined) {
                if (bitsCountIncludingTerminatingBit > remainingBits) {
                    removeBitsFromByte(state, remainingBits);
                    countedBits += remainingBits;
                    break;
                }
                
                remainingBits -= bitsCountNotIncludingTerminatingBit;
            }
            
            countedBits += bitsCountNotIncludingTerminatingBit;
            
            foundTerminatingBit =
                bitsCountIncludingTerminatingBit <= state.validBitsInCurrentByte;

            if (foundTerminatingBit) {
                removeBitsFromByte(state, bitsCountIncludingTerminatingBit);
            } else {
                state.validBitsInCurrentByte = 0;
            }
        } while (!foundTerminatingBit);
        
        return countedBits;
    }
    
    function removeBitsFromByte(state, bitsCount) {
        state.validBitsInCurrentByte -= bitsCount;
        if (state.validBitsInCurrentByte > 0) {
            state.currentByte = (state.currentByte << bitsCount) & 0xFF;
        }
    }

    function tryValidateCurrentByte(databin, state) {
        if (state.validBitsInCurrentByte > 0) {
            return true;
        }
        
        var bytesNeeded = state.isSkipNextByte ? 2 : 1;
        
        var resultArray = [];
        var bytesCopied = databin.copyBytes(resultArray, /*resultStartOffset=*/0, {
            forceCopyAllRange: true,
            databinStartOffset: state.nextOffsetToParse,
            maxLengthToCopy: bytesNeeded
            });
        
        if (bytesCopied !== bytesNeeded) {
            return false;
        }

        var prevByte = state.originalByteWithoutShift;

        state.currentByte = resultArray[bytesNeeded - 1];
        state.validBitsInCurrentByte = 8;
        state.originalByteWithoutShift = state.currentByte;
        
        if (prevByte === 0xFF) {
            if ((resultArray[0] & 0x80) !== 0) {
                throw new jGlobals.j2kExceptions.IllegalDataException(
                    'Expected 0 bit after 0xFF byte', 'B.10.1');
            }
            
            // No need to skip another bit if already skip the whole byte
            if (!state.isSkipNextByte) {
                state.currentByte <<= 1;
                state.validBitsInCurrentByte = 7;
            }
        }
        
        state.isSkipNextByte = false;
        state.nextOffsetToParse += bytesNeeded;
        
        return true;
    }

    function createZeroBitsUntilFirstOneBitMap() {
        var arrayMap = new Array(255);
        
        arrayMap[0x00] = 9;
        arrayMap[0x01] = 8;
        arrayMap[0x02] = 7;
        arrayMap[0x03] = 7;
        
        var i;
        
        for (i = 0x04; i <= 0x07; ++i) {
            arrayMap[i] = 6;
        }
        
        for (i = 0x08; i <= 0x0F; ++i) {
            arrayMap[i] = 5;
        }

        for (i = 0x10; i <= 0x1F; ++i) {
            arrayMap[i] = 4;
        }

        for (i = 0x20; i <= 0x3F; ++i) {
            arrayMap[i] = 3;
        }
        
        for (i = 0x40; i <= 0x7F; ++i) {
            arrayMap[i] = 2;
        }
        
        for (i = 0x80; i <= 0xFF; ++i) {
            arrayMap[i] = 1;
        }
        
        // Avoid two's complement problems
        for (i = 0; i <= 0xFF; ++i) {
            arrayMap[i - 0x100] = arrayMap[i];
        }
        
        return arrayMap;
    }
    
    return JpipBitstreamReader;
})();