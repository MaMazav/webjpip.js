'use strict';

function createCalculatorForTest(mainHeaderDatabin) {
    if (mainHeaderDatabin === undefined) {
        mainHeaderDatabin = databinStubs.mainHeaderDatabinStub;
    }
    
    var result = new JpipOffsetsCalculator(mainHeaderDatabin, jpipMarkersParserStub);
    return result;
}

function testCodingStyleOffset(databin, databinDescription) {
    QUnit.test(
        'Coding style default offset (' + databinDescription + ')',
        function(assert) {
            var calculator = createCalculatorForTest();

            var codOffsetActual = calculator.getCodingStyleOffset(
                databin);
                
            var codOffsetExpected = databin.buffer.markerOffsets.COD;
            
            assert.deepEqual(
                codOffsetActual,
                codOffsetExpected,
                'Correctness of getCodingStyleOffset');
        });
}

function testCodingStyleBaseParams(databin, databinDescription) {
    QUnit.test(
        'getCodingStyleBaseParams (' + databinDescription + ')',
        function(assert) {
            var calculator = createCalculatorForTest();

            function checkCodParamsCorrectness(isMandatory) {
                var codParamsActual = calculator.getCodingStyleBaseParams (
                    databin, /*isMandatory=*/false);
                    
                var codParamsExpected = databin.buffer.codingStyleBaseParams;
                
                assert.deepEqual(
                    codParamsActual,
                    codParamsExpected,
                    'Correctness of getCodingStyleOffset (isMandatory = ' + isMandatory + ')');
            }
            
            checkCodParamsCorrectness(/*isMandatory=*/false);
            
            if (databin.buffer.codingStyleBaseParams !== null) {
                checkCodParamsCorrectness(/*isMandatory=*/true);
                return;
            }
            
            assert.throws(
                function() {
                    calculator.getCodingStyleBaseParams(
                        databin, /*isMandatory=*/true);
                },
                j2kExceptions.IllegalDataException,
                'getCodingStyleBaseParams should throw exception on non-exist COD marker');
        });
}

function testSizMarkerOffset(databin, databinDescription) {
    QUnit.test(
        'Image and tile size offset (' + databinDescription + ')',
        function(assert) {
            var calculator = createCalculatorForTest();

            var sizOffsetActual = calculator.getImageAndTileSizeOffset (
                databin);
                
            var sizOffsetExpected = databin.buffer.markerOffsets.SIZ;
            
            assert.deepEqual(
                sizOffsetActual,
                sizOffsetExpected,
                'Correctness of getImageAndTileSizeOffset ');
        });
}

function testRangesOfBestResolutionLevels(databin, databinDescription) {
    QUnit.test(
        'getRangesOfBestResolutionLevelsData (' + databinDescription + ')',
        function(assert) {
            var calculator = createCalculatorForTest();
            
            var rangesActual = calculator.getRangesOfBestResolutionLevelsData(
                databin,
                /*numResolutionLevels=*/1);
                
            var rangesExpected = {
                numDecompositionLevelsOffset: databin.buffer
                    .rangesOfBestResolutionLevelsData.numDecompositionLevelsOffset,
                ranges: databin.buffer.rangesOfBestResolutionLevelsData
                    .rangesPerLevelsToCut[1]
                };
            
            assert.deepEqual(
                rangesActual,
                rangesExpected,
                'Correctness of getRangesOfBestResolutionLevelsData');
        }
    );
}
    
QUnit.module('JpipOffsetsCalculator');

QUnit.test('InternalErrorException', function(assert) {
    var calculator = createCalculatorForTest(
        databinStubs.mainHeaderWithSameIdAsEmptyDatabinStub);
    
    assert.throws(
        function() {
            calculator.getCodingStyleBaseParams(
                databinStubs.notRecievedCodingStyleSegmentContentDatabinStub,
                /*isMandatory=*/false);
        },
        jpipExceptions.InternalErrorException,
        'getCodingStyleBaseParams (part of content recieved, exception is expected)');
    });

QUnit.test(
    'getCodingStyleOffset UnsupportedFeatureException (COC in main header)',
    function(assert) {
        var calculatorWithCOCInMainHeader = createCalculatorForTest(
            databinStubs.mainHeaderWithCOCDatabinStub);
        
        assert.throws(
            function() {
                calculatorWithCOCInMainHeader.getCodingStyleOffset(
                    databinStubs.mainHeaderWithCOCDatabinStub, /*isMandatory=*/true);
            },
            j2kExceptions.UnsupportedFeatureException,
            'getCodingStyleOffset with COC expected to throw unsupported excetion');
    });
            
QUnit.test(
    'getCodingStyleOffset UnsupportedFeatureException (COC in tile header)',
    function(assert) {
        var calculator = createCalculatorForTest();
        
        assert.throws(
            function() {
                calculator.getCodingStyleOffset(
                    databinStubs.tileHeaderWithCodingStyleComponentDatabinStub);
            },
            j2kExceptions.UnsupportedFeatureException,
            'getCodingStyleOffset (COC in tile header, expected unsupported exception)');
    });
            
QUnit.test(
    'getCodingStyleOffset UnsupportedFeatureException (COC besides COD in header)',
    function(assert) {
        var calculator = createCalculatorForTest();
        
        assert.throws(
            function() {
                calculator.getCodingStyleOffset(
                    databinStubs.tileHeaderWithCodingStyleDefaultAndComponentDatabinStub);
            },
            j2kExceptions.UnsupportedFeatureException,
            'getCodingStyleOffset (COD and COC in tile header, expected unsupported exception)');
    });
            
QUnit.test(
    'getCodingStyleOffset InternalErrorException (COC besides COD in header)',
    function(assert) {
        var calculator = createCalculatorForTest();
        
        assert.throws(
            function() {
                calculator.getCodingStyleOffset(
                    databinStubs.tileHeaderWithCodingStyleDefaultAndComponentDatabinStub);
            },
            j2kExceptions.UnsupportedFeatureException,
            'getCodingStyleOffset (COD and COC in tile header, expected unsupported exception)');
    });
            
QUnit.test(
    'getRangesOfBestResolutionLevelsData InternalErrorException ' +
    '(too much levels to cut)',
    function(assert) {
        var calculator = createCalculatorForTest();
        
        assert.throws(
            function() {
                var numResolutionLevelsToCut = 6;
                calculator.getRangesOfBestResolutionLevelsData(
                    databinStubs.mainHeaderDatabinStub, numResolutionLevelsToCut);
            },
            j2kExceptions.InternalErrorException,
            'getRangesOfBestResolutionLevelsData (too much levels to ' +
                'cut, expected unspported exception)');
    });
            
QUnit.test(
    'getRangesOfBestResolutionLevelsData IllegalDataException ' +
    '(illegal quantization type)',
    function(assert) {
        var calculator = createCalculatorForTest();
        
        assert.throws(
            function() {
                calculator.getRangesOfBestResolutionLevelsData(
                    databinStubs.tileHeaderWithIllegalQCD, 1);
            },
            j2kExceptions.InternalErrorException,
            'getRangesOfBestResolutionLevelsData (illegal quantization type)');
    });
    
// Expected 62
testCodingStyleOffset(
    databinStubs.mainHeaderDatabinStub,
    'Main header, when COD right after SOC and SIZ');

// Expected null
testCodingStyleOffset(
    databinStubs.emptyDatabinStub,
    'Tile header, no COD in tile header');

testCodingStyleOffset(
    databinStubs.mainHeaderDatabinStub,
    'Main header, when COD right after SOC and SIZ');

// Expected null
testCodingStyleOffset(
    databinStubs.emptyDatabinStub,
    'Tile header, no COD in tile header');

testRangesOfBestResolutionLevels(
    databinStubs.tileHeaderWithScalarQuantizationAndExplicitPrecinctSizesDatabinStub,
    'with scalar quantization and explicit precinct sizes');

testRangesOfBestResolutionLevels(
    databinStubs.headerWithPrecinctSizesAndNoQuantizationQCDToRemoveOnResolutionCut,
    'with no quantization and explicit precinct sizes');

testRangesOfBestResolutionLevels(
    databinStubs.headerWithPrecinctSizesRangeToRemoveOnResolutionCut,
    'with derived quantization and explicit precinct sizes');

testRangesOfBestResolutionLevels(
    databinStubs.mainHeaderDatabinStub,
    'without scalar quantization and default precinct sizes');
    
testRangesOfBestResolutionLevels(
    databinStubs.tileHeaderWithStartOfDataMarkerOnly,
    'Tile header, neither COD nor QCD exist');
    
testSizMarkerOffset(
    databinStubs.mainHeaderDatabinStub,
    'main header');