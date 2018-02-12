'use strict';

var DatabinPartsStub = (function DatabinPartsStubClosure() {
    var uniqueDatabinNumber = 0;

    function DatabinPartsStub(buffer) {
        var classId = (++uniqueDatabinNumber).toString();
        var inClassId = classId;
        
        this.buffer = buffer;
        this.cachedData = {};

        this.getClassId = function() {
            return classId;
        };
        
        this.getInClassId = function() {
            return inClassId;
        };
        
        this.setClassIdForTesting = function(newUniqueId) {
            classId = newUniqueId;
        };

        this.setInClassIdForTesting = function(newUniqueId) {
            inClassId = newUniqueId;
        };
    }
    
    DatabinPartsStub.prototype.getCachedData = function getCachedData(key) {
        var result = this.cachedData[key];
        
        if (result === undefined) {
            result = {};
            this.cachedData[key] = result;
        }
        
        return result;
    };
    
    DatabinPartsStub.prototype.clearCacheForTest = function clearCacheForTest() {
        this.cachedData = {};
    };
    
    DatabinPartsStub.prototype.getDatabinLengthIfKnown = function() {
        return this.buffer.length;
    };
    
    DatabinPartsStub.prototype.getLoadedBytes = function getLoadedBytes() {
        return this.buffer.length;
    };
    
    DatabinPartsStub.prototype.isAllDatabinLoaded = function() {
        return true;
    };
    
    DatabinPartsStub.prototype.getExistingRanges = function() {
        if (this.buffer.length > 0) {
            return [ { start: 0, length: this.buffer.length } ];
        }
        
        return [];
    };
    
    DatabinPartsStub.prototype.copyBytes =
        function(result, resultStartOffset, rangeOptions) {
        
        var databinStartOffset = 0;
        var bytesToCopy = this.buffer.length;
        if (rangeOptions !== undefined) {
            if (rangeOptions.databinStartOffset !== undefined) {
                databinStartOffset = rangeOptions.databinStartOffset;
                bytesToCopy -= databinStartOffset;
            }
            
            if (rangeOptions.forceCopyAllRange && bytesToCopy < rangeOptions.maxLengthToCopy) {
                return null;
            }
            
            if (rangeOptions.maxLengthToCopy !== undefined) {
                bytesToCopy = Math.min(bytesToCopy, rangeOptions.maxLengthToCopy);
            }
        }
        
        if (!result.isDummyBufferForLengthCalculation) {
            for (var i = 0; i < bytesToCopy; ++i) {
                if (this.skipOffset(databinStartOffset + i)) {
                    continue;
                }
                result[resultStartOffset + i] = this.buffer[databinStartOffset + i];
            }
            
            result.sourceBuffer = this.buffer;
            result.offsetInSourceBuffer = databinStartOffset - resultStartOffset;
        }
        
        return bytesToCopy;
    };
    
    DatabinPartsStub.prototype.skipOffset = function(offset) {
        return false;
    };

    DatabinPartsStub.prototype.skipOffset = function(offset) {
        return false;
    };
    
    return DatabinPartsStub;
})();

var NotRecievedRangeDatabinPartsStub = (function() {
    function NotRecievedRangeDatabinPartsStub(buffer, notRecievedRange) {
        DatabinPartsStub.call(this, buffer);
        this.notRecievedRange = notRecievedRange;
    }
    
    NotRecievedRangeDatabinPartsStub.prototype = Object.create(DatabinPartsStub.prototype);
    
    NotRecievedRangeDatabinPartsStub.prototype.copyBytes =
        function(result, resultStartOffset, rangeOptions) {
        
        if (rangeOptions !== undefined && rangeOptions.forceCopyAllRange) {
            var endNotRecieved = this.notRecievedRange.start + this.notRecievedRange.length;
            
            var databinStartOffset =
                rangeOptions.databinStartOffset === undefined ?
                    0: rangeOptions.databinStartOffset;
            
            var endToCopy =
                rangeOptions.maxLengthToCopy === undefined ?
                    this.buffer.length :
                    databinStartOffset + rangeOptions.maxLengthToCopy;
            
            if (databinStartOffset < endNotRecieved &&
                endToCopy > this.notRecievedRange.start) {
                
                return null;
            }
        }
        
        var maxLengthCopied = DatabinPartsStub.prototype.copyBytes.call(
            this, result, resultStartOffset, rangeOptions);
        
        return maxLengthCopied;
    };
    
    NotRecievedRangeDatabinPartsStub.prototype.skipOffset = function(offset) {
        if (offset >= this.notRecievedRange.start &&
            offset < this.notRecievedRange.start + this.notRecievedRange.length) {
            
            return true;
        }
    };
    
    NotRecievedRangeDatabinPartsStub.prototype.getLoadedBytes = function getLoadedBytes() {
        return this.buffer.length - this.notRecievedRange.length;
    };
    
    NotRecievedRangeDatabinPartsStub.prototype.isAllDatabinLoaded = function() {
        return false;
    };
    
    NotRecievedRangeDatabinPartsStub.prototype.setAllDataRecievedForTest =
        function setAllDataRecievedForTest() {
        
        this.__proto__ = DatabinPartsStub.prototype;
    };
    
    return NotRecievedRangeDatabinPartsStub;
})();

var notRecievedAnythingDatabinPartsStub = {
    buffer: [],

    getClassId: function() {
        return 0;
    },
    
    getInClassId: function() {
        return 0;
    },
    
    copyBytes: function(result, resultStartOffset, rangeOptions) {
        if (rangeOptions === undefined ||
            !rangeOptions.forceCopyAllRange) {
            return 0;
        }
        
        return null;
    },
    
    getDatabinLengthIfKnown: function() {
        return null;
    },
    
    getLoadedBytes: function getLoadedBytes() {
        return 0;
    },
    
    isAllDatabinLoaded: function() {
        return false;
    },
    
    getCachedData: function getCachedData(key) {
        var result = this.cachedData[key];
        
        if (result === undefined) {
            result = {};
            this.cachedData[key] = result;
        }
        
        return result;
    },
    
    clearCacheForTest: function clearCacheForTest() {
        this.cachedData = {};
    }
};

notRecievedAnythingDatabinPartsStub.buffer.packetLengths =
    [ { endOffset: 0, numQualityLayers: 0 } ];