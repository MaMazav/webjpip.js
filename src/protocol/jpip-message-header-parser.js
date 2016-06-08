'use strict';

var jGlobals = require('j2k-jpip-globals.js');

var jpipMessageHeaderParser = {
        
    LSB_MASK: 0x1,
    BIT_4_MASK: 0x10,
    BITS_56_MASK: 0x60,
    MSB_MASK: 0x80,

    LSB_7_MASK: 0x7F,

    // A.2.1
    parseNumberInVbas: function parseNumberInVbasClosure(
        message, startOffset, bitsToTakeInFirstByte) {
        
        var self = jpipMessageHeaderParser;
        var currentOffset = startOffset;
        
        var result;
        if (bitsToTakeInFirstByte) {
            var maskFirstByte = (1 << bitsToTakeInFirstByte) - 1;
            result = message[currentOffset] & maskFirstByte;
        }
        else {
            result = message[currentOffset] & self.LSB_7_MASK;
        }
        
        while ( !!(message[currentOffset] & self.MSB_MASK) ) {
            ++currentOffset;

            result <<= 7;
            result |= message[currentOffset] & self.LSB_7_MASK;
        }
        
        return {
            endOffset: currentOffset + 1,
            number: result
        };
    },
    
    // A.2
    parseMessageHeader: function parseMessageHeaderClosure(
        message, startOffset, previousMessageHeader) {
        
        var self = jpipMessageHeaderParser;
        
        // A.2.1
        
        // First Vbas: Bin-ID
        
        var classAndCsnPrecense = (message[startOffset] & self.BITS_56_MASK) >>> 5;
        
        if (classAndCsnPrecense === 0) {
            throw new jGlobals.jpipExceptions.ParseException('Failed parsing message header ' +
                '(A.2.1): prohibited existance class and csn bits 00');
        }
        
        var hasClassVbas = !!(classAndCsnPrecense & 0x2);
        var hasCodeStreamIndexVbas = classAndCsnPrecense === 3;
        
        var isLastByteInDatabin = !!(message[startOffset] & self.BIT_4_MASK);
        
        // A.2.3
        var parsedInClassId = self.parseNumberInVbas(
            message, startOffset, /*bitsToTakeInFirstByte=*/4);
        var inClassId = parsedInClassId.number;
        var currentOffset = parsedInClassId.endOffset;
        
        // Second optional Vbas: Class ID
        
        var classId = 0;
        if (hasClassVbas) {
            var parsedClassId = self.parseNumberInVbas(message, currentOffset);
            classId = parsedClassId.number;
            currentOffset = parsedClassId.endOffset;
        }
        else if (previousMessageHeader) {
            classId = previousMessageHeader.classId;
        }
        
        // Third optional Vbas: Code Stream Index (Csn)
        
        var codestreamIndex = 0;
        if (hasCodeStreamIndexVbas) {
            var parsedCsn = self.parseNumberInVbas(message, currentOffset);
            codestreamIndex = parsedCsn.number;
            currentOffset = parsedCsn.endOffset;
        }
        else if (previousMessageHeader) {
            codestreamIndex = previousMessageHeader.codestreamIndex;
        }
        
        // 4th Vbas: Message offset
        
        var parsedOffset = self.parseNumberInVbas(message, currentOffset);
        var messageOffsetFromDatabinStart = parsedOffset.number;
        currentOffset = parsedOffset.endOffset;
        
        // 5th Vbas: Message length

        var parsedLength = self.parseNumberInVbas(message, currentOffset);
        var messageBodyLength = parsedLength.number;
        currentOffset = parsedLength.endOffset;
        
        // 6th optional Vbas: Aux
        
        // A.2.2
        var hasAuxVbas = !!(classId & self.LSB_MASK);
        
        var aux;
        if (hasAuxVbas) {
            var parsedAux = self.parseNumberInVbas(message, currentOffset);
            aux = parsedAux.number;
            currentOffset = parsedAux.endOffset;
        }
        
        // Return
        
        var result = {
            isLastByteInDatabin: isLastByteInDatabin,
            inClassId: inClassId,
            bodyStart: currentOffset,
            classId: classId,
            codestreamIndex: codestreamIndex,
            messageOffsetFromDatabinStart: messageOffsetFromDatabinStart,
            messageBodyLength: messageBodyLength
        };
        
        if (hasAuxVbas) {
            result.aux = aux;
        }
        
        return result;
    },
    
    getInt32: function getInt32Closure(data, offset) {
        var msb = data[offset] * Math.pow(2, 24); // Avoid negative result due to signed calculation
        var byte2 = data[offset + 1] << 16;
        var byte1 = data[offset + 2] << 8;
        var lsb = data[offset + 3];
        
        var result = msb + byte2 + byte1 + lsb;
        return result;
    },
    
    getInt16: function getInt16Closure(data, offset) {
        var msb = data[offset] << 8;
        var lsb = data[offset + 1];
        
        var result = msb + lsb;
        return result;
    }
};

module.exports.jpipMessageHeaderParser = jpipMessageHeaderParser;