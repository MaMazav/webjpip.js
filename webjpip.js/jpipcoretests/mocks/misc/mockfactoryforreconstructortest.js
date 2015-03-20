'use strict';

var mockFactoryForReconstructorTest = Object.create(jpipMockFactory);

mockFactoryForReconstructorTest.createPacketLengthCalculator =
    function createPacketLengthCalculator(
        tileStructure,
        componentStructure,
        databin,
        startOffsetInDatabin,
        precinct) {

    var result = new JpipPacketLengthCalculatorStub(
        tileStructure,
        componentStructure,
        databin,
        startOffsetInDatabin,
        precinct);

    return result;
};