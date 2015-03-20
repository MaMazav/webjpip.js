'use strict';

var JpipDatabinsSaverStub = function(mainHeaderDatabin) {
    var idToDatabins = [];
    var self = this;
    
    this.loggedSaveDataArgsForTest = [];
    
    if (mainHeaderDatabin !== null) {
        mainHeaderDatabin.clearCacheForTest();
    }
    
    this.saveData = function saveData(header, bytes) {
        self.loggedSaveDataArgsForTest.push({
            header: header,
            bytes: bytes
            });
    };

    this.getIsJpipTilePartStream = function() {
        return false;
    };

    this.getMainHeaderDatabin = function() {
        return mainHeaderDatabin;
    };
    
    this.addTileHeaderDatabinForTest = function(tileInClassId, databin) {
        getDatabinsOfInClassId(tileInClassId, /*isCreate=*/true)
            .tileHeader = databin;
        
        databin.clearCacheForTest();
    };
    
    this.addPrecinctDatabinForTest = function(precinctInClassId, databin) {
        getDatabinsOfInClassId(precinctInClassId, /*isCreate=*/true)
            .precinct = databin;

        databin.clearCacheForTest();
    };
    
    this.getTileHeaderDatabin = function(tileInClassId) {
        return getDatabinsOfInClassId(tileInClassId).tileHeader;
    };
    
    this.getPrecinctDatabin = function(tileInClassId) {
        return getDatabinsOfInClassId(tileInClassId).precinct;
    };
    
    function getDatabinsOfInClassId(inClassId, isCreate) {
        var result = idToDatabins[inClassId];
        
        if (result !== undefined) {
            return result;
        }
        
        if (!isCreate) {
            throw 'Unexpected in-class index of data-bin. Fix test';
        }
        
        result = {};
        idToDatabins[inClassId] = result;
        return result;
    }
};

function createDatabinsSaverStub(mainHeaderDatabin) {
    if (mainHeaderDatabin === undefined) {
        mainHeaderDatabin = databinStubs.mainHeaderDatabinStub;
    }
    
    var databinsSaver = new JpipDatabinsSaverStub(mainHeaderDatabin);
    
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileWithCodingStyle,
        databinStubs.tileHeaderWithCodingStyleDatabinStub);
        
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileWithStartOfDataMarker,
        databinStubs.tileHeaderWithStartOfDataMarkerOnly);
        
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileHeaderNotRecievedCodingStyleSegmentContent,
        databinStubs.notRecievedCodingStyleSegmentContentDatabinStub);
        
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileHeaderNotRecievedMarker,
        databinStubs.notRecievedMarkerDatabinStub);
        
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileWithCodingStyleComponent,
        databinStubs.tileHeaderWithCodingStyleComponentDatabinStub);
        
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileWithCodingStyleDefaultAndComponent,
        databinStubs.tileHeaderWithCodingStyleDefaultAndComponentDatabinStub);
        
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileWithScalarQuantizationAndExplicitPrecinctSizes,
        databinStubs.tileHeaderWithScalarQuantizationAndExplicitPrecinctSizesDatabinStub);
        
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileWithPpt,
        databinStubs.tileHeaderWithPpt);
    
    databinsSaver.addTileHeaderDatabinForTest(
        databinStubs.indices.tileWithEmptyDatabin,
        databinStubs.emptyDatabinStub);
        
    return databinsSaver;
}