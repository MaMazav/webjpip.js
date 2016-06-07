'use strict';

var mockFactoryForDatabinPartsTest = Object.create(jpipMockFactory);
mockFactoryForDatabinPartsTest.createCompositeArray =
    function createCompositeArray(offset) {
    
    var compositeArray = {};
    
    compositeArray.offset = offset;
    compositeArray.length = 0;
    
    compositeArray.getOffset = function getOffset() {
        return compositeArray.offset;
    }
    
    compositeArray.getLength = function getLength() {
        return compositeArray.length;
    };
    
    compositeArray.pushSubArray = function pushSubArray(subArray) {
        for (var i = 0; i < subArray.length; ++i) {
            if (subArray[i] !== databinTestArray[offset + i]) {
                throw 'JpipDatabinParts called to compositeArray.pushSubArray ' +
                    'with wrong subarray content in offset ' + (offset + i);
            }
        }
        
        compositeArray.length += subArray.length;
    };
    
    compositeArray.copyToArray = function copyToArray(
        resultArray, resultArrayOffset, minOffset, maxOffset) {
        
        var begin = Math.max(minOffset, offset);
        var end = Math.min(maxOffset, offset + compositeArray.length);
        for (var i = begin; i < end; ++i) {
            resultArray[i - resultArrayOffset] = databinTestArray[i];
        }
    };
    
    compositeArray.copyToOther = function copyToOther(other) {
        if (offset < other.offset) {
            throw 'JpipDatabinParts tried to copy CompositeArray into ' +
                'another one in wrong order (source.offset < other.offset, ' +
                'while source.offset should be >= other.offset)';
        }
        
        other.length = Math.max(other.length, offset + compositeArray.length - other.offset);
    };
    
    return compositeArray;
};