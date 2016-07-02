'use strict';

QUnit.module('JpipQualityLayersCache');

testGetQualityLayersOffset(
    /*expectedResult=*/{ numQualityLayers: 0, endOffset: 0 },
    /*quality=*/undefined,
    /*qualityLayersOffsets=*/[],
    'getQualityLayerOffset with empty databin',
    /*existingRangesInDatabin=*/[]);

testGetQualityLayersOffset(
    /*expectedResult=*/{ numQualityLayers: 0, endOffset: 0 },
    /*quality=*/undefined,
    /*qualityLayersOffsets=*/[],
    'getQualityLayerOffset with missing data in the beginning of databin',
    /*existingRangesInDatabin=*/[{ start: 1, length: 15 }]);

testGetQualityLayersOffset(
    /*expectedResult=*/{ numQualityLayers: 3, endOffset: 101 },
    /*quality=*/3,
    /*qualityLayersOffsets=*/[null, null, 101],
    'getQualityLayerOffset with given quality',
    /*existingRangesInDatabin=*/[{ start: 0, length: 101 }]);

testGetQualityLayersOffset(
    /*expectedResult=*/{ numQualityLayers: 2, endOffset: 70 },
    /*quality=*/3,
    /*qualityLayersOffsets=*/[null, 70, 101],
    'getQualityLayerOffset of lower quality layers when not enough bytes ' +
        'for given quality',
    /*existingRangesInDatabin=*/[{ start: 0, length: 100 }]);
        
testGetQualityLayersOffset(
    /*expectedResult=*/{ numQualityLayers: 2, endOffset: 70 },
    /*quality=*/3,
    /*qualityLayersOffsets=*/[null, 70, 101],
    'getQualityLayerOffset of lower quality layers when not enough bytes ' +
        'for given quality (even if later some bytes appear',
    /*existingRangesInDatabin=*/[
        { start: 0, length: 90 },
        { start: 99, length: 200} ]);
        
testGetQualityLayersOffset(
    /*expectedResult=*/{ numQualityLayers: 3, endOffset: 101 },
    /*quality=*/10,
    /*qualityLayersOffsets=*/[null, null, 101],
    'getQualityLayerOffset with quality greater than loaded',
    /*existingRangesInDatabin=*/[{ start: 0, length: 101 }]);

testGetQualityLayersOffset(
    /*expectedResult=*/{ numQualityLayers: 2, endOffset: 70 },
    /*quality=*/undefined,
    /*qualityLayersOffsets=*/[null, 70, 101],
    'getQualityLayerOffset of lower quality layers when not enough bytes ' +
        'for quality',
    /*existingRangesInDatabin=*/[{ start: 0, length: 100 }]);

testParametersPassedToFactory(
    'argument passed to jpipFactory.createPacketLengthCalculator() when ' +
        'calling qualityLayersCache.getQualityLayerOffset()',
    function(qualityLayersCache, precinctDatabin, precinctPosition) {
        qualityLayersCache.getQualityLayerOffset(
            precinctDatabin,
            /*quality=*/undefined,
            precinctPosition);
    });
    
testParametersPassedToFactory(
    'argument passed to jpipFactory.createPacketLengthCalculator() when ' +
        'calling qualityLayersCache.getPacketOffsetsByCodeblockIndex()',
    function(qualityLayersCache, precinctDatabin, precinctPosition) {
        qualityLayersCache.getPacketOffsetsByCodeblockIndex(
            precinctDatabin,
            /*qualityLayer=*/0,
            precinctPosition);
    });

QUnit.test(
    'getPacketOffsetsByCodeblockIndex correctness',
    function(assert) {
        var result = 'Dummy getPacketOffsetsByCodeblockIndex result';
        var qualityLayer = 15;
        
        var codeblockOffsets = [];
        codeblockOffsets[qualityLayer] = result;
        
        var packetLengthCalculator =
            createPacketLengthCalculatorForQualityLayersCacheTest(
                /*qualityLayersOffsets=*/null, codeblockOffsets);
        
        checkQualityLayersCacheFunction(
            assert,
            /*expectedResult=*/result,
            qualityLayer,
            packetLengthCalculator,
            'getPacketOffsetsByCodeblockIndex');
    });