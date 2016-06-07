'use strict';

var mockFactoryForQualityLayersTest = Object.create(jpipMockFactory);

mockFactoryForQualityLayersTest.createSubbandLengthInPacketHeaderCalculator =
    function createSubbandLengthInPacketHeaderCalculator(
        bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband) {
    
    var result = new JpipSubbandLengthInPacketHeaderCalculatorStub(
        bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband);
    return result;
};

mockFactoryForQualityLayersTest.createBitstreamReader =
    function createBitstreamReader(databin) {
    
    var bits = databin.bitsForBitstreamReaderStub;
    var result = new JpipBitstreamReaderStub(bits);
    
    return result;
};

mockFactoryForQualityLayersTest.createTagTree =
    function createTagTree(bitstreamReader, width, height) {
    
    var result = new JpipTagTreeStub(bitstreamReader, width, height);
    return result;
};

mockFactoryForQualityLayersTest.createCodeblockLengthParser =
    function createCodeblockLengthParser(bitstreamReader, transactionHelper) {
    
    var result = new JpipCodeblockLengthParserStub(bitstreamReader, transactionHelper);
    return result;
};