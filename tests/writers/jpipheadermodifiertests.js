'use strict';

function getArrayOfLengthForModifierTest(length) {
    var result = new Array(length);
    for (var i = 0; i < length; ++i) {
        result[i] = i;
    }
    
    return result;
}

function getModifiedImageSizeExpected() {
    var result = [
        0, 1, 2, 3, 4, 5, 6, 7,
        0, 0, 0x4, 0xF9, // Reference grid width overwritten
        0, 0, 0, 15, // Reference grid height overwritten
        0, 0, 0, 0, // X offset overwritten
        0, 0, 0, 0, // Y offset overwritten
        0, 0, 0, 239, // Tile width overwritten
        0, 0, 0x05, 0x6B, // Tile height overwritten
        0, 0, 0, 0, // First tile X offset overwritten
        0, 0, 0, 0, // First tile Y offset overwritten
        40, 41, 42, 43, 44, 45, 46, 47, 48, 49
        ];
        
    return result;
}

function createModifierForTest(progressionOrder, mainHeaderDatabin) {
    if (progressionOrder === undefined) {
        progressionOrder = 'RPCL';
    }
    
    if (mainHeaderDatabin === undefined) {
        mainHeaderDatabin = databinStubs.mainHeaderDatabinStub;
    }
    
    var offsetsCalculator = new JpipOffsetsCalculatorStub(mainHeaderDatabin);

    var result = new jpipExports.JpipHeaderModifier(
        offsetsCalculator,
        progressionOrder);
    
    return result;
}

function testModifyHeader(testName, databin, level) {
    QUnit.test(testName, function(assert) {
        var arbitraryArrayPrefix = [ 15 ];
        var array = arbitraryArrayPrefix.concat(databin.buffer);
        
        var bytesRemovedExpected;
        var expectedArray;
        
        var levelsToCut = level;
        if (levelsToCut === undefined) {
            levelsToCut = 0;
        }
        
        var rangesToCut = 
            levelsToCut === 0 ?
            [] :
            databin.buffer.rangesOfBestResolutionLevelsData.rangesPerLevelsToCut[
                level];
        
        if (rangesToCut.length > 0) {
            expectedArray = [];
            var bytesRemovedExpected = 0;
            var nextPartBegin = 0;
                
            for (var i = 0; i < rangesToCut.length; ++i) {
                var currentPartOffsetFromOriginal = bytesRemovedExpected;

                bytesRemovedExpected += rangesToCut[i].length;
                
                var currentPartBegin = nextPartBegin;
                var currentPartEnd = rangesToCut[i].start;
                
                var currentPart = databin.buffer.slice(currentPartBegin, currentPartEnd);
                expectedArray = expectedArray.concat(currentPart);
                
                nextPartBegin = rangesToCut[i].start + rangesToCut[i].length;
                
                var segmentLengthOffset = rangesToCut[i].markerSegmentLengthOffset + 1;
                if (segmentLengthOffset < currentPartBegin ||
                    segmentLengthOffset >= currentPartEnd) {
                    throw 'Changing segment length which is not in current part is not supported. Fix test';
                }
                
                expectedArray[segmentLengthOffset - currentPartOffsetFromOriginal] -=
                    rangesToCut[i].length;
            }
            
            var lastRange = rangesToCut[rangesToCut.length - 1];
            var lastPartBegin = nextPartBegin;
            var lastPart = databin.buffer.slice(lastPartBegin);
            
            expectedArray = expectedArray.concat(lastPart);
        } else {
            expectedArray = databin.buffer.slice();
            bytesRemovedExpected = 0;
        }
        
        var resolutionOffset =
            databin.buffer.rangesOfBestResolutionLevelsData.numDecompositionLevelsOffset;
        expectedArray[resolutionOffset] -= levelsToCut;
        
        if (databin.buffer.markerOffsets.COD !== null) {
            var progressionOrderOffset = databin.buffer.markerOffsets.COD + 5;
            expectedArray[progressionOrderOffset] = 2;
        }
        
        var expectedArray = arbitraryArrayPrefix.concat(expectedArray);
        
        var workingBuffer = arbitraryArrayPrefix.concat(databin.buffer.slice());
        var modifier = createModifierForTest();
        var databinOffsetInResult = arbitraryArrayPrefix.length;
        
        var bytesAddedActual = modifier.modifyMainOrTileHeader(
            workingBuffer, databin, databinOffsetInResult, level);
        
        var bytesRemovedActual = -bytesAddedActual;
        var actualArray = workingBuffer.slice(0, workingBuffer.length - bytesRemovedExpected);
            
        assert.deepEqual(bytesRemovedActual, bytesRemovedExpected, 'Correctness of number of bytes removed');
        
        assert.deepEqual(actualArray, expectedArray, 'Correctness of range removal');
        });
}

QUnit.module('JpipHeaderModifier');

testModifyHeader(
    'Removal of resolution level information (No resolution levels to cut)',
    databinStubs.headerWithPrecinctSizesAndScalarQCDToRemoveOnResolutionCut);

testModifyHeader(
    'Removal of resolution level information (Derived in QCD and default precinct size)',
    databinStubs.headerWithoutResolutionLevelsToCut,
    /*level=*/1);

testModifyHeader(
    'Removal of resolution level information (No Coding style segment)',
    databinStubs.tileHeaderWithStartOfDataMarkerOnly,
    /*level=*/1);

testModifyHeader(
    'Removal of resolution level information (Scalar in QCD and explicit precinct size)',
    databinStubs.headerWithPrecinctSizesAndScalarQCDToRemoveOnResolutionCut,
    /*level=*/1);

testModifyHeader(
    'Removal of resolution level information (Derived in QCD and explicit precinct size)',
    databinStubs.headerWithPrecinctSizesRangeToRemoveOnResolutionCut,
    /*level=*/1);

testModifyHeader(
    'Removal of resolution level information (No quantization in QCD and explicit precinct size)',
    databinStubs.headerWithPrecinctSizesAndNoQuantizationQCDToRemoveOnResolutionCut,
    /*level=*/1);

QUnit.test('IllegalDataException', function(assert) {
    assert.throws(
        function() {
            createModifierForTest('CLPR');
        },
        _jGlobals.j2kExceptions.IllegalDataException,
        'encodeProgressionOrder(illegal CLPR order)');

    assert.throws(
        function() {
            createModifierForTest('Gibrish');
        },
        _jGlobals.j2kExceptions.IllegalDataException,
        'encodeProgressionOrder(illegal Gibrish order)');
    });

QUnit.test('modifyImageSize', function(assert) {
    var fictiveMainHeaderContent = []; // No need for content, but only for offsets
    fictiveMainHeaderContent.markerOffsets = {};
    fictiveMainHeaderContent.markerOffsets.SIZ = 2;
    var fictiveMainHeaderDatabin = new DatabinPartsStub(fictiveMainHeaderContent);

    var modifier = createModifierForTest(
        'RPCL', fictiveMainHeaderDatabin);
    
    var modifiedHeaderExpected = getModifiedImageSizeExpected();
        
    var modifiedHeaderActual = getArrayOfLengthForModifierTest(50);
    modifier.modifyImageSize(modifiedHeaderActual, {
        regionWidth: 0x4F9,
        regionHeight: 15,
        tileWidth: 239,
        tileHeight: 0x56B
        });
    
    assert.deepEqual(
        modifiedHeaderActual,
        modifiedHeaderExpected,
        'Image size changes correctness');
    });

QUnit.test('modifyMainOrTileHeader (progression order modification)', function(assert) {
    var progressionOrderCodes = [0, 1, 2, 3, 4];
    var progressionOrderStrings = ['LRCP', 'RLCP', 'RPCL', 'PCRL', 'CPRL'];
    
    for (var i = 0; i < progressionOrderCodes.length; ++i) {
        var headerToModify = Object.create(databinStubs.mainHeaderContent);
        var progressionOrderOffset =
            headerToModify.markerOffsets.COD + 5;

        var modifier = createModifierForTest(progressionOrderStrings[i]);
        var str = progressionOrderStrings[i];
        
        modifier.modifyMainOrTileHeader(
            headerToModify,
            /*originalDatabin=*/databinStubs.mainHeaderDatabinStub,
            /*databinOffsetInResult=*/0,
            /*level=*/0);

        var codeActual = headerToModify[progressionOrderOffset];
        var codeExpected = progressionOrderCodes[i];
        assert.deepEqual(codeActual, codeExpected, str);
    }
    });