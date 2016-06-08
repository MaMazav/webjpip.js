'use strict';

function testGetPacketOffsetsByCodeblockIndex(expectedResult, testName) {
    var qualityLayer = 'Dummy qualityLayer 143';
    
    testQualityLayersCacheFunction(
        expectedResult,
        /*existingRangesInDatabin=*/[],
        qualityLayer,
        /*qualityLayersOffsets=*/[],
        testName,
        'getPacketOffsetsByCodeblockIndex');
}

function testGetQualityLayersOffset(
    expectedResult,
    maxNumQualityLayers,
    qualityLayersOffsets,
    testName,
    existingRangesInDatabin) {
    
    QUnit.test(testName, function(assert) {
        var packetLengthCalculator =
            createPacketLengthCalculatorForQualityLayersCacheTest(
                qualityLayersOffsets);
        
        checkQualityLayersCacheFunction(
            assert,
            expectedResult,
            maxNumQualityLayers,
            packetLengthCalculator,
            'getQualityLayerOffset',
            existingRangesInDatabin);
    });
}

function checkQualityLayersCacheFunction(
    assert,
    expectedResult,
    maxNumQualityLayers,
    packetLengthCalculator,
    functionName,
    existingRangesInDatabin) {
    
    var tileStructure = { getComponentStructure: function() { } };
    var codestreamStructure = new JpipCodestreamStructureStub(tileStructure);
    
    var precinctDatabin = createDatabinForQualityLayersCacheTest(
        existingRangesInDatabin);
    
    var calculatorToReturnFromFactory = packetLengthCalculator;
    
    var factory = Object.create(jpipMockFactory);
    factory.createPacketLengthCalculator =
        function createPacketLengthCalculator(
            tileStructure,
            componentStructure,
            databin,
            startOffsetInDatabin,
            precinctPosition) {
        
        return calculatorToReturnFromFactory;
    }
    
    var precinctPosition = 'Dummy precinct position';
    
    var qualityLayersCache = new jpipExports.JpipQualityLayersCache(
        codestreamStructure, factory);
    
    var functionToTest = qualityLayersCache[functionName];
    
    assert.throws(
        function() {
            functionToTest(precinctDatabin, maxNumQualityLayers);
        },
        _jGlobals.jpipExceptions.InternalErrorException,
        'Expected exception when calling ' + functionName +
            'without precinctPosition argument on the first time');
    
    var actualResult = functionToTest(
        precinctDatabin, maxNumQualityLayers, precinctPosition);
    
    calculatorToReturnFromFactory =
        wrongNonCachedPacketLengthCalculatorForQualityLayersCacheTest;
    
    var actualResultFromCacheOnSecondTime =
        functionToTest(
            precinctDatabin, maxNumQualityLayers, precinctPosition);
    
    var actualResultFromCacheOnThirdTimeWithoutPrecinctPosition =
        functionToTest(
            precinctDatabin, maxNumQualityLayers);
    
    assert.deepEqual(
        actualResult,
        expectedResult,
        'Correctness of result');
    
    assert.deepEqual(
        actualResultFromCacheOnSecondTime,
        expectedResult,
        'Correctness of result on second time (from cache)');

    assert.deepEqual(
        actualResultFromCacheOnThirdTimeWithoutPrecinctPosition,
        expectedResult,
        'Correctness of result on third time (from cache, no ' +
            'precinctPosition argument)');
}

function testParametersPassedToFactory(testName, doSomeOperation) {
    QUnit.test(
        testName,
        function(assert) {
            var componentStructure = 'Dummy componentStructure';
            var tileStructure = { getComponentStructure: function() {
                return componentStructure;
                } };
            var codestreamStructure = new JpipCodestreamStructureStub(tileStructure);
            var databin = createDatabinForQualityLayersCacheTest(
                /*existingRangesInDatabin=*/[]);
            
            var precinctPosition = 'Dummy precinct position';
            
            var packetLengthCalculator =
                createPacketLengthCalculatorForQualityLayersCacheTest(
                    /*qualityLayersOffsets=*/[],
                    /*codeblockOffsets=*/['Dummy codeblock offsets']);
            
            var tileStructureArgumentActual = null;
            var componentStructureArgumentActual = null;
            var databinArgumentActual = null;
            var startOffsetInDatabinArgumentActual = null;
            var precinctPositionArgumentActual = null;
            
            var factory = Object.create(jpipMockFactory);
            factory.createPacketLengthCalculator =
                function createPacketLengthCalculator(
                    tileStructure,
                    componentStructure,
                    databin,
                    startOffsetInDatabin,
                    precinctPosition) {
                
                tileStructureArgumentActual = tileStructure;
                componentStructureArgumentActual = componentStructure;
                databinArgumentActual = databin;
                startOffsetInDatabinArgumentActual = startOffsetInDatabin;
                precinctPositionArgumentActual = precinctPosition;
                
                return packetLengthCalculator;
            }
            
            var qualityLayersCache = new jpipExports.JpipQualityLayersCache(
                codestreamStructure, factory);
            
            // Act
            
            doSomeOperation(qualityLayersCache, databin, precinctPosition);
            
            // Assert
            
            var tileStructureArgumentExpected = tileStructure;
            assert.deepEqual(
                tileStructureArgumentActual,
                tileStructureArgumentExpected,
                'Correctness of tileStructure argument');
                
            var componentStructureArgumentExpected = componentStructure;
            assert.deepEqual(
                componentStructureArgumentActual,
                componentStructureArgumentExpected,
                'Correctness of componentStructure argument');
                
            var databinArgumentExpected = databin;
            assert.deepEqual(
                databinArgumentActual,
                databinArgumentExpected,
                'Correctness of databin argument');
                
            var startOffsetInDatabinArgumentExpected = 0;
            assert.deepEqual(
                startOffsetInDatabinArgumentActual,
                startOffsetInDatabinArgumentExpected,
                'Correctness of startOffsetInDatabin argument');
                
            var precinctPositionArgumentExpected = precinctPosition;
            assert.deepEqual(
                precinctPositionArgumentActual,
                precinctPositionArgumentExpected,
                'Correctness of precinctPosition argument');
        }
    );
}

function createDatabinForQualityLayersCacheTest(existingRangesInDatabin) {
    var cachedData = {};
    
    var databin = {
        getExistingRanges: function getExistingRanges() {
            return existingRangesInDatabin;
        },
        
        getCachedData: function getCachedData(key) {
            return cachedData;
        }
    };
    
    return databin;
}

function createPacketLengthCalculatorForQualityLayersCacheTest(
    qualityLayersOffsets, codeblockOffsets) {
    
    var packetLengthCalculator = {
        getPacketOffsetsByCodeblockIndex:
            function getPacketOffsetsByCodeblockIndex(qualityLayer) {
            
            if (codeblockOffsets === undefined) {
                throw 'No codeblockOffsets information in ' +
                    'packetLengthCalculator stub of qualityLayersCache test.' +
                    ' Fix test';
            }
            
            if (codeblockOffsets[qualityLayer] === undefined) {
                throw 'No codeblockOffsets information for quality layer ' +
                    qualityLayer + 'in packetLengthCalculator stub of ' +
                    'qualityLayersCache test. Fix test';
            }
            
            return codeblockOffsets[qualityLayer];
        },
        
        calculateEndOffsetOfLastFullPacket:
            function calculateEndOffsetOfLastFullPacket(maxNumQualityLayers) {
            
            if (maxNumQualityLayers === 0 || qualityLayersOffsets.length === 0) {
                return {
                    endOffset: 0,
                    numQualityLayers: 0
                    };
            }
            
            var numQualityLayers;
            
            if (maxNumQualityLayers === undefined) {
                numQualityLayers = qualityLayersOffsets.length;
            } else {
                if (qualityLayersOffsets.length > maxNumQualityLayers &&
                    qualityLayersOffsets[maxNumQualityLayers] === undefined) {

                    throw 'Missing qualityLayersOffset data in ' +
                        'packetLengthCalculator stub. Fix test';
                }
                
                var numQualityLayers = Math.min(
                    qualityLayersOffsets.length, maxNumQualityLayers);
            }
            
            var result = {
                numQualityLayers: numQualityLayers,
                endOffset: qualityLayersOffsets[numQualityLayers - 1]
            };
            
            return result;
        }
    };
    
    return packetLengthCalculator;
}

var wrongNonCachedPacketLengthCalculatorForQualityLayersCacheTest = {
    calculateEndOffsetOfLastFullPacket:
        function calculateEndOffsetOfLastFullPacket() {
        
        return -1000;
    }
};