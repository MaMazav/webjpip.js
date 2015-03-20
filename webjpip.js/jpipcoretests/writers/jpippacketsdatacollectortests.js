'use strict';

QUnit.module('JpipPacketsDataCollector');

function createPacketsDataCollectorForTest() {
    var databinsSaver = new JpipDatabinsSaverStub();
    
    var precinct30Content = [0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x7, 0x8, 0x9];
    var precinct31Content = [0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8];
    var precinct32Content = [0xB1, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7];
    
    var precinctDatabin30 = new JpipDatabinPartsStub(precinct30Content);
    var precinctDatabin31 = new JpipDatabinPartsStub(precinct31Content);
    var precinctDatabin32 = new JpipDatabinPartsStub(precinct32Content);
    
    var tileStructureStub = new JpipTileStructureStub({ numQualityLayers: 3 });
    var codestreamStructureStub = new JpipCodestreamStructureStub();
}