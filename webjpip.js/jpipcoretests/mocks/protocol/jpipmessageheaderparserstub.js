'use strict';

var jpipMessageHeaderParserStub = {
    messageParseResultForTest: [],
    
    currentMessageIndexForTest: 0,
    
    loggedParseArgsForTest: [],
    
    clearForTest: function clearForTest() {
        jpipMessageHeaderParserStub.currentMessageIndexForTest = 0;
        jpipMessageHeaderParserStub.loggedParseArgsForTest = [];
        jpipMessageHeaderParserStub.messageParseResultForTest = [];
        jpipMessageHeaderParserStub.parseMessageHeader = 
            jpipMessageHeaderParserStub.parseMessageHeaderOriginal;
    },
    
    getInt32: function(data, offset) {
        return getIntFromStructureParserTestStub(data, offset, 32);
    },
    
    getInt16: function(data, offset) {
        return getIntFromStructureParserTestStub(data, offset, 16);
    },
    
    parseMessageHeaderOriginal: function(data, offset, previousHeader) {
        var index = jpipMessageHeaderParserStub.currentMessageIndexForTest;
        
        if (index >= jpipMessageHeaderParserStub.messageParseResultForTest.length) {
            throw 'Not enough parse results in loggedPreviousHeaders. ' +
                'Fix implementation or test';
        }
        
        jpipMessageHeaderParserStub.loggedParseArgsForTest.push({
            data: data,
            offset: offset,
            previousHeader: previousHeader
            });
        
        ++jpipMessageHeaderParserStub.currentMessageIndexForTest;
        
        var result = jpipMessageHeaderParserStub.messageParseResultForTest[index];
        return result;
    }
    };

function getIntFromStructureParserTestStub(data, offset, bits) {
    if (data.sourceBuffer === undefined || data.offsetInSourceBuffer === undefined) {
        throw 'DatabinPartsStub is expected to create properties sourceBuffer ' +
            'and offsetInSourceBuffer, but they are not exist. Fix test';
    }
    
    if (data.sourceBuffer.ints === undefined) {
        throw 'Returned buffer does not contain property ints ' +
            'thus messageHeaderParser stub cannot "parse" the int. Fix test';
    }
    
    var result = data.sourceBuffer.ints[bits][data.offsetInSourceBuffer + offset];
    if (result === undefined) {
        throw 'Not found appropriate int in ints array, thus '+
            'messageHeaderParser stub cannot "parse" the int. Fix test';
    }
    
    return result;
}