'use strict';

function getSingleTileReconstructedExpected() {
    var singleTileReconstructedExpected = [
        // Main header
        0xEE, 0, 5,
        0xBB, // Modified by modifier stub
        15, 20, 25,
        0x12, // Modified by modifier stub
        35, 40, 45, 50,
        // Two bytes removed here by modifier stub
        65, 70,
        0xFF, 0x64, 0x00, 0x09, 77, 97, 109, 97, 122, 97, 118, // Comment ('Mamazav' in ASCII)
        
        // Start Of Tile (SOT) marker segment
        0xFF, 0x90, 0, 10,
        0, 0, // Tile index overwritten
        0, 0, 0, 50, // Length including data
        0, // Tile-part index
        1, // Number of Tile-parts
        
        // Tile header data-bin
        0xEE, 0, 2, 4,
        0x40, // Progression order overwritten
        // A byte was removed here by modifier stub
        0xA,
        
        // Start Of Data (SOD) marker
        0xFF, 0x93,
        
        // bitstream
        0xEE,
        0xEE, 0, 3, 6, 9, 12, 15, 18, 21, 24,
        0xEE, 0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102,

        
        // End Of Codestream (EOC) marker
        0xFF, 0xD9
        ];

    return singleTileReconstructedExpected;
}

function getFullReconstructedExpected() {
    var fullReconstructedExpected = [
        // Main header
        0xEE, 0, 5, 10, 15, 20, 25,
        0x12, // Modified by modifier stub
        35, 40, 45, 50,
        // Two bytes removed here by modifier stub
        65, 70,
        0xFF, 0x64, 0x00, 0x09, 77, 97, 109, 97, 122, 97, 118, // Comment ('Mamazav' in ASCII)
        
        // Tile: 0
        
        // Start Of Tile (SOT) marker segment
        0xFF, 0x90, 0, 10,
        0, 0, // Tile index
        0, 0, 0, 47, // Length including data
        0, // Tile-part index
        1, // Number of Tile-parts
        
        // Tile header data-bin
        0xEE,
        0xFF, 0xCC,
        
        // Start Of Data (SOD) marker
        0xFF, 0x93,
        
        // bitstream
        0xEE,
        0xEE, 0, 3, 6, 9, 12, 15, 18, 21, 24,
        0xEE, 0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102,

        // Tile: 1
        
        // Start Of Tile (SOT) marker segment
        0xFF, 0x90, 0, 10,
        0, 1, // Tile index
        0, 0, 0, 50, // Length including data
        0, // Tile-part index
        1, // Number of Tile-parts
        
        // Tile header data-bin
        0xEE, 0, 2, 4,
        0x40, // Progression order overwritten
        // A byte was removed here by modifier stub
        0xA,
        
        // Start Of Data (SOD) marker
        0xFF, 0x93,
        
        // bitstream
        0xEE,
        0xEE, 0, 3, 6, 9, 12, 15, 18, 21, 24,
        0xEE, 0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102,

        // Tile: 2
        
        // Start Of Tile (SOT) marker segment
        0xFF, 0x90, 0, 10,
        0, 2, // Tile index
        0, 0, 0, 57, // Length including data
        0, // Tile-part index
        1, // Number of Tile-parts
        
        // Tile header data-bin
        0xEE, 0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44,
        
        // Start Of Data (SOD) marker
        0xFF, 0x93,
        
        // bitstream
        0xEE,
        0xEE, 0, 3, 6, 9, 12, 15, 18, 21, 24,
        0xEE, 0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102,
        
        // End Of Codestream (EOC) marker
        0xFF, 0xD9
        ];
    
    return fullReconstructedExpected;
}

function getSingleTileReconstructedWithEmptyPrecinctExpected() {
    var noEmptyPrecincts = getSingleTileReconstructedExpected();
    var emptyPrecinct = [0, 0, 0, 0, 0]; // 5 quality layers
    
    var codestreamWithEmptyPrecincts =
        noEmptyPrecincts.slice(0, 46)
        .concat(emptyPrecinct)
        .concat(noEmptyPrecincts.slice(56));
    
    codestreamWithEmptyPrecincts[34] = 45; // Reduce bitstream length
    
    return codestreamWithEmptyPrecincts;
}

function getFullReconstructedExpectedWithEmptyPrecinctExpected() {
    var noEmptyPrecincts = getFullReconstructedExpected();
    var emptyPrecinct = [0, 0, 0, 0, 0]; // 5 quality layers
    
    var codestreamWithEmptyPrecincts =
        noEmptyPrecincts.slice(0, 43)
        .concat(emptyPrecinct)
        .concat(noEmptyPrecincts.slice(53, 93))
        .concat(emptyPrecinct)
        .concat(noEmptyPrecincts.slice(103, 150))
        .concat(emptyPrecinct)
        .concat(noEmptyPrecincts.slice(160));
    
    // Reduce bitstream lengths
    codestreamWithEmptyPrecincts[34] = 42;
    codestreamWithEmptyPrecincts[76] = 45;
    codestreamWithEmptyPrecincts[121] = 52;
    
    return codestreamWithEmptyPrecincts;
}

function createCodestreamStructureMockForReconstructorTest(dummyProgressionOrder) {
    var tileParams = {
        tileSize: [240, 1387],
        numQualityLayers: 5
        };
        
    var componentParams = null;
    var componentStructure = new JpipComponentStructureStub(componentParams);
    
    var tileStructure = new JpipTileStructureStub(
        tileParams,
        /*codestreamStructure=*/null, // No need for that
        dummyProgressionOrder,
        componentStructure);
        
    var codestreamStructure = new JpipCodestreamStructureStub(tileStructure);
    
    return codestreamStructure;
}

function createOffsetsCalculatorStubForReconstructorTest(mainHeaderDatabin) {
    return new JpipOffsetsCalculatorStub(mainHeaderDatabin);
}

function createDatabinPartsStubForReconstructorTest(
    inputNumber, classId, inClassId, suffix) {
    
    // No smart logic, just a short code to create various
    // of different data-bins (depending on inputNumber)

    var buffer = new Array(inputNumber * 3 + 1);
    
    buffer[0] = 0xEE;

    for (var i = 0; i < inputNumber * 3; ++i) {
        buffer[i + 1] = i * inputNumber;
    }
    
    if (suffix) {
        var position = inputNumber * 3;
        for (var i = 0; i < suffix.length; ++i) {
            buffer[++position] = suffix[i];
        }
    }
    
    var databinParts = new DatabinPartsStub(buffer);
    
    databinParts.getInputNumberForTest = function() {
        return inputNumber;
    };
    
    databinParts.setClassIdForTesting(classId);
    databinParts.setInClassIdForTesting(inClassId);

    return databinParts;
};
    
function createDatabinsSaverMockForReconstructorTest(mainHeader) {
    if (mainHeader === undefined) {
        var mainHeader = createDatabinPartsStubForReconstructorTest(
            /*someNumber=*/5,
            /*classId=*/6,
            /*inClassId=*/0);
        mainHeader.markerOffsets = {};
        mainHeader.markerOffsets.COD = 5;
    }

    var databinsSaverMock = new JpipDatabinsSaverStub(mainHeader);
        
    for (var tile = 0; tile < 3; ++tile) {
        var suffix
        // SOD marker is optional at the end of the tile header.
        // Check all variations of SOD existance.
        
        switch (tile) {
            case 0:
                // Non existance of SOD (0xFF at the end, just for code coverage)
                suffix = [0xFF, 0xCC];
                break;
                
            case 2:
                // Existance of SOD
                suffix = [0xFF, 0x93];
                break;
                
            default:
                // Non existance of SOD
                suffix = undefined;
                break;
        }
        
        var databin = createDatabinPartsStubForReconstructorTest(
            /*someNumber=*/2 * tile,
            /*classId=*/2,
            /*inClassId=*/tile,
            suffix);
        databin.markerOffsets = {};
        databin.markerOffsets.COD = tile === 1 ? 3 : null;
        
        databinsSaverMock.addTileHeaderDatabinForTest(tile, databin);
    }
        
    for (var precinct = 0; precinct < 3; ++precinct) {
        var databin = createDatabinPartsStubForReconstructorTest(
            /*someNumber=*/3 * precinct,
            /*classId=*/0,
            /*inClassId=*/precinct);
        
        databinsSaverMock.addPrecinctDatabinForTest(precinct, databin);
    };
    
    return databinsSaverMock;
}

function createModifierForReconstructorTest(databinsSaver) {
    var modifier = new JpipHeaderModifierStubForReconstructorTest();
    
    // Add dummy progression order modifying and dummy bytes removal
    
    modifier.addDatabinOverrideDataForTest(
        databinsSaver.getMainHeaderDatabin(),
        7,
        0x12,
        /*bytesToRemove=*/ { start: 12, length: 2 });
    
    modifier.addDatabinOverrideDataForTest(
        databinsSaver.getTileHeaderDatabin(1),
        4,
        0x40,
        /*bytesToRemove=*/ { start: 5, length: 1 });
    
    return modifier;
}

function createLayersManagerStubForReconstructorTest(codestreamStructure, databinsSaver) {
    var manager = new JpipQualityLayersCacheStub(
        codestreamStructure, databinsSaver);
    
    return manager;
}

function createReconstructorForTest(databinsSaver) {
    if (databinsSaver === undefined) {
        databinsSaver = createDatabinsSaverMockForReconstructorTest();
    }

    var dummyProgressionOrder = 'Dummy progression order';
    var codestreamStructureMock = createCodestreamStructureMockForReconstructorTest(
        dummyProgressionOrder);
    var modifier = createModifierForReconstructorTest(databinsSaver);
    var layersManagerStub = createLayersManagerStubForReconstructorTest(
        codestreamStructureMock, databinsSaver);
    
    var reconstructor = new JpipCodestreamReconstructor(
        codestreamStructureMock,
        databinsSaver,
        modifier,
        layersManagerStub);
    
    return reconstructor;
}