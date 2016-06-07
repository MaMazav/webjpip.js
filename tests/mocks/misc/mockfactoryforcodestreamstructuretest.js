'use strict';

var mockFactoryForCodestreamStructureTest = Object.create(jpipMockFactory);

mockFactoryForCodestreamStructureTest.createTileStructure =
    function(tileParams, codestreamStructure, progressionOrder) {
        function createComponentStructure(componentStructure) {
            return new JpipComponentStructureStub(componentStructure);
        };
        
        var result = new JpipTileStructureStub(tileParams, codestreamStructure, progressionOrder);

        result.getComponentStructure = function(component) {
            return createComponentStructure(tileParams.paramsPerComponent[component]);
        };

        result.getDefaultComponentStructure = function() {
            return createComponentStructure(tileParams.defaultComponentParams);
        };
        
        return result;
    };