'use strict';

function deepCloneDatabinContent(content) {
    var cloned = content.slice();
    
    function cloneMember(member) {
        if (content[member] !== undefined) {
            var str = JSON.stringify(content[member]);
            var clonedMember = JSON.parse(str);
            
            cloned[member] = clonedMember;
        }
    }
    
    cloneMember('markerOffsets');
    cloneMember('ints');
    cloneMember('rangesOfBestResolutionLevelsData');
    cloneMember('codingStyleBaseParams');
    
    return cloned;
}

// COD = Coding style Default
// COC = Coding style Component
// QCD = Quantization Default

var databinStubs = {};

databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD = [
    0xFF, 0x52, // COD
    0x00, 0x0F, 0x01, 0x00, 0x00, 0x01, 0x01, 0x02, 0x05, 0x03, 0x00, 0x00, 0x56, 0x67, 0x67,
    0xFF, 0x5C, // QCD
    0x00, 0x11, 0x22, 0x5F, 0x86, 0x50, 0x03, 0x50, 0x03, 0x50, 0x45, 0x57, 0xD2, 0x57, 0xD2, 0x57, 0x61
    ];
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD.ints = [];
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD.ints[16] = [];
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD.ints[16][2] = 0x000F;
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD.ints[16][6] = 0x0001;
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD.ints[16][19] = 0x0011;
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD
    .markerOffsets = {
        SIZ: null,
        COD: 0,
        COC: null,
        QCD: 17,
        PPM: null,
        PPT: null
        };
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD
    .rangesOfBestResolutionLevelsData = {
        numDecompositionLevelsOffset: 9,
        rangesPerLevelsToCut: []
        };
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD
    .rangesOfBestResolutionLevelsData.rangesPerLevelsToCut[1] = [
        { start: 16, length: 1, markerSegmentLengthOffset: 2  },
        { start: 30, length: 6, markerSegmentLengthOffset: 19 }
        ];
databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD
    .codingStyleBaseParams = {
        codingStyleDefaultOffset: 0,
        isDefaultPrecinctSize: false,
        isStartOfPacketMarkerAllowed: false,
        isEndPacketHeaderMarkerAllowed: false,
        numResolutionLevels: 3,
        precinctSizesOffset: 14,
        numDecompositionLevelsOffset: 9
    };

databinStubs.tileHeaderContentWithIllegalQCD =
    deepCloneDatabinContent(
        databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD);
databinStubs.tileHeaderContentWithIllegalQCD[21] = 0x25;

databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndDerivedQCD =
    deepCloneDatabinContent(
        databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD);
databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndDerivedQCD[21] =
    0x21;
databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndDerivedQCD
    .rangesOfBestResolutionLevelsData.rangesPerLevelsToCut[1].length = 1;

databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndNoQuantizationQCD =
    deepCloneDatabinContent(
        databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD);
databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndNoQuantizationQCD[21] =
    0x20;
databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndNoQuantizationQCD
    .rangesOfBestResolutionLevelsData.rangesPerLevelsToCut[1][1] =
        { start: 26, length: 3, markerSegmentLengthOffset: 19 };

databinStubs.tileHeaderWithoutResolutionLevelsToCut =
    deepCloneDatabinContent(
        databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndDerivedQCD);
databinStubs.tileHeaderWithoutResolutionLevelsToCut[4] =
    0x00;
databinStubs.tileHeaderWithoutResolutionLevelsToCut
    .rangesOfBestResolutionLevelsData.rangesPerLevelsToCut[1].length = 0;

databinStubs.tileHeaderContentWithCOD =
    databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD;

databinStubs.tileHeaderContentWithScalarQCDAndExplicitPrecinctSizes =
    databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD;
    
databinStubs.tileHeaderWithStartOfData = databinStubs.tileHeaderContentWithCOD.concat(
    [0xFF, 0x93]);
databinStubs.tileHeaderWithStartOfData.markerOffsets = Object.create(
    databinStubs.tileHeaderContentWithCOD.markerOffsets);
databinStubs.tileHeaderWithStartOfData.ints = Object.create(
    databinStubs.tileHeaderContentWithCOD.ints);

databinStubs.tileHeaderContentWithCOC = [
    0xFF, 0x53, // COC
    0x00, 0x09, 0x00, 0x00, 0x02, 0x04, 0x04, 0x00, 0x00
    ];
databinStubs.tileHeaderContentWithCOC.ints = [];
databinStubs.tileHeaderContentWithCOC.ints[16] = [];
databinStubs.tileHeaderContentWithCOC.ints[16][2] = 0x0009;
databinStubs.tileHeaderContentWithCOC.markerOffsets = {
    SIZ: null,
    COD: null,
    COC: 0,
    QCD: null,
    PPM: null,
    PPT: null
    };

databinStubs.tileHeaderContentWithCODAndCOC = [
    0xFF, 0x52, // COD
    0x00, 0x0C, 0x00, 0x00, 0x00, 0x01, 0x01, 0x03, 0x04, 0x04, 0x00, 0x00,
    0xFF, 0x53, // COC
    0x00, 0x09, 0x00, 0x00, 0x02, 0x04, 0x04, 0x00, 0x00
    ];
databinStubs.tileHeaderContentWithCODAndCOC.ints = [];
databinStubs.tileHeaderContentWithCODAndCOC.ints[16] = [];
databinStubs.tileHeaderContentWithCODAndCOC.ints[16][2] = 0x000C;
databinStubs.tileHeaderContentWithCODAndCOC.ints[16][16] = 0x0009;
databinStubs.tileHeaderContentWithCODAndCOC.markerOffsets = {
    SIZ: null,
    COD: 0,
    COC: 14,
    QCD: null,
    PPM: null,
    PPT: null
    };
databinStubs.tileHeaderContentWithCODAndCOC.codingStyleBaseParams = {
    codingStyleDefaultOffset: 0,
    isDefaultPrecinctSize: true,
    isStartOfPacketMarkerAllowed: false,
    isEndPacketHeaderMarkerAllowed: false,
    numResolutionLevels: 4,
    precinctSizesOffset: null,
    numDecompositionLevelsOffset: 9
    };

databinStubs.tileHeaderContentWithPptMarker =
    deepCloneDatabinContent(databinStubs.tileHeaderContentWithCOD);
databinStubs.tileHeaderContentWithPptMarker.markerOffsets.PPT = 'Non null dummy offset';

databinStubs.mainHeaderContent = [
    0xFF, 0x4F, // SOC
    0xFF, 0x64, // COM
    0x00, 0x09,
    77, 97, 109, 97, 122, 97, 118, // Mamazav in ASCII
    0xFF, 0x51, // SIZ
    0x00, 0x2F, 0x00, 0x00, 0x00, 0x00, 0x15, 0x4F, 0x00, 0x00, 0x0E, 0x31,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80,
    0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x0A,
    0x00, 0x03, 0x07, 0x01, 0x01, 0x07, 0x01, 0x01, 0x07, 0x01, 0x01,
    0xFF, 0x52, // COD
    0x00, 0x0C, 0x00, 0x02, 0x00, 0x0A, 0x01, 0x05, 0x04, 0x04, 0x00, 0x00
    ];
databinStubs.mainHeaderContent.codingStyleBaseParams = {
    codingStyleDefaultOffset: 62,
    isDefaultPrecinctSize: true,
    isStartOfPacketMarkerAllowed: false,
    isEndPacketHeaderMarkerAllowed: false,
    numResolutionLevels: 6,
    precinctSizesOffset: null,
    numDecompositionLevelsOffset: 71
    };
databinStubs.mainHeaderContent.markerOffsets = {
    SIZ: 13,
    COD: 62,
    COC: null,
    QCD: null,
    PPM: null,
    PPT: null
    };
databinStubs.mainHeaderContent.rangesOfBestResolutionLevelsData = {
    numDecompositionLevelsOffset: 71,
    rangesPerLevelsToCut: []
    };
databinStubs.mainHeaderContent.rangesOfBestResolutionLevelsData
    .rangesPerLevelsToCut[1] = [];
databinStubs.mainHeaderContent.ints = [];
databinStubs.mainHeaderContent.ints[16] = [];
databinStubs.mainHeaderContent.ints[16][4] = 0x0009;
databinStubs.mainHeaderContent.ints[16][15] = 0x002F;
databinStubs.mainHeaderContent.ints[16][51] = 0x3;
databinStubs.mainHeaderContent.ints[16][64] = 0x000C;
databinStubs.mainHeaderContent.ints[16][68] = 0xA;
databinStubs.mainHeaderContent.ints[32] = [];
databinStubs.mainHeaderContent.ints[32][4] = 0x0009;
databinStubs.mainHeaderContent.ints[32][15] = 0x002F;
databinStubs.mainHeaderContent.ints[32][19] = 0x154F;
databinStubs.mainHeaderContent.ints[32][23] = 0xE31;
databinStubs.mainHeaderContent.ints[32][27] = 0;
databinStubs.mainHeaderContent.ints[32][31] = 0;
databinStubs.mainHeaderContent.ints[32][35] = 0x80;
databinStubs.mainHeaderContent.ints[32][39] = 0x200;
databinStubs.mainHeaderContent.ints[32][43] = 0x5;
databinStubs.mainHeaderContent.ints[32][47] = 0xA;

databinStubs.mainHeaderWithCOCContent = [
    0xFF, 0x4F, // SOC
    0xFF, 0x51, // SIZ
    0x00, 0x2F, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x03, 0x07, 0x01, 0x01, 0x07, 0x01, 0x01, 0x07, 0x01, 0x01,
    0xFF, 0x52, // COD
    0x00, 0x0C, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x04, 0x04, 0x00, 0x00,
    0xFF, 0x53, // COC
    0x00, 0x09, 0x00, 0x00, 0x02, 0x04, 0x04, 0x00, 0x00
    ];
databinStubs.mainHeaderWithCOCContent.markerOffsets = {
    SIZ: 2,
    COD: 51,
    COC: 65,
    QCD: null,
    PPM: null,
    PPT: null
    };
databinStubs.mainHeaderWithCOCContent.codingStyleBaseParams = {
    codingStyleDefaultOffset: 51,
    isDefaultPrecinctSize: true,
    isStartOfPacketMarkerAllowed: false,
    isEndPacketHeaderMarkerAllowed: false,
    numResolutionLevels: 2,
    precinctSizesOffset: null,
    numDecompositionLevelsOffset: 58
    };
databinStubs.mainHeaderWithCOCContent.ints = [];
databinStubs.mainHeaderWithCOCContent.ints[16] = [];
databinStubs.mainHeaderWithCOCContent.ints[16][4] = 0x002F;
databinStubs.mainHeaderWithCOCContent.ints[16][53] = 0x000C;
databinStubs.mainHeaderWithCOCContent.ints[16][67] = 0x0009;
databinStubs.mainHeaderWithCOCContent.ints[32] = [];
databinStubs.mainHeaderWithCOCContent.ints[32][8] = 0x200;
databinStubs.mainHeaderWithCOCContent.ints[32][12] = 0x200;
databinStubs.mainHeaderWithCOCContent.ints[32][16] = 0;
databinStubs.mainHeaderWithCOCContent.ints[32][20] = 0;
databinStubs.mainHeaderWithCOCContent.ints[32][24] = 0x200;
databinStubs.mainHeaderWithCOCContent.ints[32][28] = 0x200;
databinStubs.mainHeaderWithCOCContent.ints[32][32] = 0;
databinStubs.mainHeaderWithCOCContent.ints[32][36] = 0;
databinStubs.mainHeaderWithCOCContent.ints[16][40] = 0x3;

databinStubs.emptyContent = [];
databinStubs.emptyContent.codingStyleBaseParams = null;
databinStubs.emptyContent.markerOffsets = {
    SIZ: null,
    COD: null,
    COC: null,
    QCD: null,
    PPM: null,
    PPT: null
    };

databinStubs.startOfDataOnlyContent = [0xFF, 0x93]; // SOD
databinStubs.startOfDataOnlyContent.markerOffsets = {
    SIZ: null,
    COD: null,
    COC: null,
    QCD: null,
    PPM: null,
    PPT: null
    };
databinStubs.startOfDataOnlyContent.rangesOfBestResolutionLevelsData = {
        numDecompositionLevelsOffset: null,
        rangesPerLevelsToCut: []
        };
databinStubs.startOfDataOnlyContent.rangesOfBestResolutionLevelsData
    .rangesPerLevelsToCut[1] = [];
databinStubs.startOfDataOnlyContent.codingStyleBaseParams = null;

databinStubs.mainHeaderWithoutSOCContent = databinStubs.mainHeaderContent.slice(2);

databinStubs.mainHeaderDatabinStub =
    new DatabinPartsStub(databinStubs.mainHeaderContent);

databinStubs.mainHeaderWithoutSOCMarkerDatabinStub =
    new DatabinPartsStub(databinStubs.mainHeaderWithoutSOCContent);

databinStubs.mainHeaderWithCOCDatabinStub =
    new DatabinPartsStub(databinStubs.mainHeaderWithCOCContent);

databinStubs.notRecievedAnythingDatabinStub = notRecievedAnythingDatabinPartsStub;

databinStubs.emptyDatabinStub = new DatabinPartsStub(databinStubs.emptyContent);

databinStubs.tileHeaderWithCodingStyleDatabinStub =
    new DatabinPartsStub(databinStubs.tileHeaderContentWithCOD);

databinStubs.tileHeaderWithStartOfDataDatabinStub =
    new DatabinPartsStub(databinStubs.tileHeaderWithStartOfData);

databinStubs.tileHeaderWithIllegalQCD =
    new DatabinPartsStub(databinStubs.tileHeaderContentWithIllegalQCD);
    
databinStubs.headerWithPrecinctSizesAndScalarQCDToRemoveOnResolutionCut =
    new DatabinPartsStub(
        databinStubs.tileHeaderContentWithCODAndExplicitPrecinctSizesAndScalarQCD);

databinStubs.headerWithPrecinctSizesRangeToRemoveOnResolutionCut =
    new DatabinPartsStub(
        databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndDerivedQCD);

databinStubs.headerWithPrecinctSizesAndNoQuantizationQCDToRemoveOnResolutionCut =
    new DatabinPartsStub(
        databinStubs.tileHeaderContentWithExplicitPrecinctSizesAndNoQuantizationQCD);

databinStubs
    .tileHeaderWithScalarQuantizationAndExplicitPrecinctSizesDatabinStub =
        new DatabinPartsStub(databinStubs
            .tileHeaderContentWithScalarQCDAndExplicitPrecinctSizes);

databinStubs.headerWithoutResolutionLevelsToCut =
    new DatabinPartsStub(databinStubs.tileHeaderWithoutResolutionLevelsToCut);

databinStubs.mainHeaderWithSameIdAsEmptyDatabinStub =
    new DatabinPartsStub(databinStubs.mainHeaderContent);
databinStubs.mainHeaderWithSameIdAsEmptyDatabinStub
    .setClassIdForTesting(databinStubs.emptyDatabinStub.getClassId());
databinStubs.mainHeaderWithSameIdAsEmptyDatabinStub
    .setInClassIdForTesting(databinStubs.emptyDatabinStub.getInClassId());

databinStubs.tileHeaderWithSameIdAsTileHeaderWithCODDatabinStub =
    new DatabinPartsStub(databinStubs.tileHeaderContentWithCOD);
databinStubs.tileHeaderWithSameIdAsTileHeaderWithCODDatabinStub
    .setClassIdForTesting(databinStubs.tileHeaderWithCodingStyleDatabinStub.getClassId());
databinStubs.tileHeaderWithSameIdAsTileHeaderWithCODDatabinStub
    .setInClassIdForTesting(databinStubs.tileHeaderWithCodingStyleDatabinStub.getInClassId());

databinStubs.tileHeaderWithCodingStyleComponentDatabinStub =
    new DatabinPartsStub(databinStubs.tileHeaderContentWithCOC);

databinStubs.tileHeaderWithCodingStyleDefaultAndComponentDatabinStub =
    new DatabinPartsStub(databinStubs.tileHeaderContentWithCODAndCOC);

databinStubs.notRecievedSizContentInMainHeaderDatabinStub = new NotRecievedRangeDatabinPartsStub(
    databinStubs.mainHeaderContent,
    { start: 15, length: 47 });

databinStubs.notRecievedCodContentInMainHeaderDatabinStub = new NotRecievedRangeDatabinPartsStub(
    databinStubs.mainHeaderContent,
    { start: 64, length: 12 });
    
databinStubs.notRecievedCodContentInTileHeaderDatabinStub = new NotRecievedRangeDatabinPartsStub(
    databinStubs.tileHeaderContentWithCOD,
    { start: 2, length: 15 });
    
databinStubs.notRecievedMarkerDatabinStub =
    new NotRecievedRangeDatabinPartsStub(
        databinStubs.tileHeaderContentWithCOD,
        /*notRecievedRange=*/ { start: 0, length: 2 });

databinStubs.notRecievedCodingStyleSegmentContentDatabinStub =
    new NotRecievedRangeDatabinPartsStub(
        databinStubs.tileHeaderContentWithCOD,
        /*notRecievedRange=*/ { start: 4, length: 3 } );

databinStubs.tileHeaderWithStartOfDataMarkerOnly =
    new DatabinPartsStub(databinStubs.startOfDataOnlyContent);

databinStubs.tileHeaderWithPpt = new DatabinPartsStub(
    databinStubs.tileHeaderContentWithPptMarker);

databinStubs.indices = {
    tileWithCodingStyle: 1,
    tileWithStartOfDataMarker: 2,
    tileHeaderNotRecievedCodingStyleSegmentContent: 3,
    tileHeaderNotRecievedMarker: 4,
    tileWithCodingStyleComponent: 5,
    tileWithCodingStyleDefaultAndComponent: 6,
    tileWithScalarQuantizationAndExplicitPrecinctSizes: 7,
    tileHeaderWithSameIdAsTileHeaderWithCodingStyle: 8,
    tileWithPpt: 9,
    tileWithEmptyDatabin: 15
    };