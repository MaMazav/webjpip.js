'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.CompositeArray = function CompositeArray(offset) {
    var length = 0;
    var internalParts = [];
    
    this.getLength = function getLength() {
        return length;
    };

    this.getOffset = function getOffset() {
        return offset;
    };
        
    this.pushSubArray = function pushSubArray(subArray) {
        internalParts.push(subArray);
        length += subArray.length;
    };
    
    this.copyToOtherAtTheEnd = function copyToOtherAtTheEnd(result, minOffset, maxOffset) {
        checkOffsetsToCopy(minOffset, maxOffset);
        
        var iterator = getInternalPartsIterator(minOffset, maxOffset);
        
        // NOTE: What if data not in first part?
        
        while (tryAdvanceIterator(iterator)) {
            result.pushSubArray(iterator.subArray);
        }
    };

    this.copyToTypedArray = function copyToTypedArray(
        resultArray, resultArrayOffset, minOffset, maxOffset) {
        
        checkOffsetsToCopy(minOffset, maxOffset);
        
        var iterator = getInternalPartsIterator(minOffset, maxOffset);
        
        // NOTE: What if data not in first part?
        
        while (tryAdvanceIterator(iterator)) {
            var offsetInResult =
                iterator.offset - resultArrayOffset;
            
            resultArray.set(iterator.subArray, offsetInResult);
        }
    };

    this.copyToArray = function copyToArray(
        resultArray, resultArrayOffset, minOffset, maxOffset) {
        
        checkOffsetsToCopy(minOffset, maxOffset);
        
        var iterator = getInternalPartsIterator(minOffset, maxOffset);
        
        // NOTE: What if data not in first part?
        
        while (tryAdvanceIterator(iterator)) {
            var offsetInResult =
                iterator.offset - resultArrayOffset;
            
            for (var j = 0; j < iterator.subArray.length; ++j) {
                resultArray[offsetInResult++] = iterator.subArray[j];
            }
        }
    };
    
    this.copyToOther = function copyToOther(other) {
        if (other.getOffset() > offset) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'CompositeArray: Trying to copy part into a latter part');
        }
        
        var otherEndOffset = other.getOffset() + other.getLength();
        var isOtherContainsThis = offset + length <= otherEndOffset;
        if (isOtherContainsThis) {
            return;
        }
    
        // Do not override already exist data (for efficiency)
        var minOffset = otherEndOffset;
        
        var iterator = getInternalPartsIterator(minOffset);
        
        if (!tryAdvanceIterator(iterator)) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'CompositeArray: Could not merge parts');
        }
        
        var expectedOffsetValue = minOffset;

        do {
            if (iterator.offset !== expectedOffsetValue) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'CompositeArray: Non-continuous value of ' +
                    'rangeToCopy.offset. Expected: ' + expectedOffsetValue +
                     ', Actual: ' + iterator.offset);
            }
            
            other.pushSubArray(iterator.subArray);
            expectedOffsetValue += iterator.subArray.length;
        } while (tryAdvanceIterator(iterator));
    };
    
    function checkOffsetsToCopy(minOffset, maxOffset) {
        if (minOffset === undefined || maxOffset === undefined) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'minOffset or maxOffset is undefined for CompositeArray.copyToArray');
        }
        
        if (minOffset < offset) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'minOffset (' + minOffset + ') must be smaller than ' +
                'CompositeArray offset (' + offset + ')');
        }
        
        if (maxOffset > offset + length) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'maxOffset (' + maxOffset + ') must be larger than ' +
                'CompositeArray end offset (' + offset + length + ')');
        }
    }
    
    function getInternalPartsIterator(minOffset, maxOffset) {
        var start = Math.max(offset, minOffset);

        var end = offset + length;
        if (maxOffset !== undefined) {
            end = Math.min(end, maxOffset);
        }
        
        if (start >= end) {
            var emptyIterator = {
                internalIteratorData: { isEndOfRange: true }
            };
            
            return emptyIterator;
        }
        
        var iterator = {
            subArray: null,
            offset: -1,
            
            internalIteratorData: {
                end: end,
                currentSubArray: null,
                currentInternalPartOffset: null,
                nextInternalPartOffset: offset,
                currentInternalPartIndex: -1,
                isEndOfRange: false
            }
        };
        
        var alreadyReachedToTheEnd = false;
        do {
            if (alreadyReachedToTheEnd) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Iterator reached ' +
                    'to the end although no data has been iterated');
            }
            
            alreadyReachedToTheEnd = !tryAdvanceIterator(iterator);
        } while (start >= iterator.internalIteratorData.nextInternalPartOffset);
        
        var cutFirstSubArray =
            start - iterator.internalIteratorData.currentInternalPartOffset;
        iterator.internalIteratorData.currentSubArray =
            iterator.internalIteratorData.currentSubArray.subarray(cutFirstSubArray);
        iterator.internalIteratorData.currentInternalPartOffset = start;
        
        return iterator;
    }
    
    function tryAdvanceIterator(iterator) {
        var internalIteratorData = iterator.internalIteratorData;
        
        if (internalIteratorData.isEndOfRange) {
            return false;
        }
        
        iterator.subArray = internalIteratorData.currentSubArray;
        iterator.offset = internalIteratorData.currentInternalPartOffset;
        
        ++internalIteratorData.currentInternalPartIndex;
        
        if (internalIteratorData.nextInternalPartOffset >= internalIteratorData.end) {
            internalIteratorData.isEndOfRange = true;

            return true;
        }
        
        ensureNoEndOfArrayReached(internalIteratorData.currentInternalPartIndex);
        
        internalIteratorData.currentSubArray = internalParts[
            internalIteratorData.currentInternalPartIndex];
        internalIteratorData.currentInternalPartOffset =
            internalIteratorData.nextInternalPartOffset;
        var currentInternalPartLength =
            internalParts[internalIteratorData.currentInternalPartIndex].length;
        
        internalIteratorData.nextInternalPartOffset =
            internalIteratorData.currentInternalPartOffset + currentInternalPartLength;

        var cutLastSubArray =
            internalIteratorData.end - internalIteratorData.currentInternalPartOffset;
        var isLastSubArray =
            cutLastSubArray < internalIteratorData.currentSubArray.length;
        
        if (isLastSubArray) {
            internalIteratorData.currentSubArray = internalIteratorData
                .currentSubArray.subarray(0, cutLastSubArray);
        }
        
        return true;
    }
    
    function ensureNoEndOfArrayReached(currentInternalPartIndex) {
        if (currentInternalPartIndex >= internalParts.length) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'CompositeArray: end of part has reached. Check end calculation');
        }
    }
};