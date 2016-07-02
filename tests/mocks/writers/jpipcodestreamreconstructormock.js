'use strict';

var jpipCodestreamReconstructorMock = {
    lastCreateCodestreamForTileArgs: null,
    
    exceptionOnNextCreateCodestreamForTest: null,
    
    clearForTest: function() {
        jpipCodestreamReconstructorMock.lastCreateCodestreamForTileArgs = null;
        jpipCodestreamReconstructorMock
            .exceptionOnNextCreateCodestreamForTest = null;
    },
    
    getLastCreateCodestreamForTileArgs: function() {
        var result =
            jpipCodestreamReconstructorMock.lastCreateCodestreamForTileArgs;
        jpipCodestreamReconstructorMock.lastCreateCodestreamForTileArgs = null;
        return result;
    },
    
    resultForTest: 'dummy createCodestreamForTile result',
    
    createCodestreamForTile: function(tileIndex, level) {
        if (jpipCodestreamReconstructorMock.lastCreateCodestreamForTileArgs !== null) {
            throw 'Two calls for reconstructor without ' +
                'getLastCreateCodestreamForTileArgs meanwhile. ' +
                'Fix test or implementation';
        }
        
        jpipCodestreamReconstructorMock.lastCreateCodestreamForTileArgs = {
            tileIndex: tileIndex,
            level: level
            };
            
        var exception = jpipCodestreamReconstructorMock
            .exceptionOnNextCreateCodestreamForTest;
        
        if (exception !== null) {
            jpipCodestreamReconstructorMock
                .exceptionOnNextCreateCodestreamForTest = null;
            
            throw exception;
        }
        
        return jpipCodestreamReconstructorMock.resultForTest;
    }
};