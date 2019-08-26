'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipPrecinctsIteratorWaiter(
    codestreamPart,
    codestreamStructure,
    databinsSaver,
    iteratePrecinctCallback,
    jpipFactory) {
    
    var tileHeadersNotLoaded = 0;
    var isRegistered = false;
    var isUnregistered = false;
    
    var registeredTileHeaderDatabins = [];
    var accumulatedDataPerDatabin = [];
    
    this.isAllTileHeadersLoaded = function isAllTileHeadersLoaded() {
        return tileHeadersNotLoaded === 0;
    };
    
    this.register = function register() {
        if (isRegistered) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'JpipQualityWaiter already registered');
        }
        
        isRegistered = true;

        ++tileHeadersNotLoaded;

        var tileIterator = codestreamPart.getTileIterator();
        while (tileIterator.tryAdvance()) {
            var tileIndex = tileIterator.tileIndex;
            var databin = databinsSaver.getTileHeaderDatabin(tileIndex);

            var inClassId = databin.getInClassId();
            accumulatedDataPerDatabin[inClassId] = {
                precinctIterator: tileIterator.createPrecinctIterator(),
                isAlreadyLoaded: false
            };
            
            var handle = databinsSaver.addEventListener(
                databin, 'dataArrived', tileHeaderDataArrived);
            registeredTileHeaderDatabins.push(handle);
                
            ++tileHeadersNotLoaded;
            tileHeaderDataArrived(databin);
        }
        
        --tileHeadersNotLoaded;
    };
    
    this.unregister = function unregister() {
        if (!isRegistered) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'JpipQualityWaiter not registered');
        }
        if (isUnregistered) {
            return;
        }
        
        isUnregistered = true;

        for (var j = 0; j < registeredTileHeaderDatabins.length; ++j) {
            databinsSaver.removeEventListener(registeredTileHeaderDatabins[j]);
        }
    };
    
    function tileHeaderDataArrived(tileHeaderDatabin) {
        if (!tileHeaderDatabin.isAllDatabinLoaded()) {
            return;
        }
        
        var inClassId = tileHeaderDatabin.getInClassId();
        var tileAccumulatedData = accumulatedDataPerDatabin[inClassId];
        
        if (tileAccumulatedData.isAlreadyLoaded) {
            return;
        }
        
        tileAccumulatedData.isAlreadyLoaded = true;
        --tileHeadersNotLoaded;
        
        var tileIndex = inClassId; // Seems correct, but can be prettier
        var tileStructure = codestreamStructure.getTileStructure(tileIndex);
        
        var precinctIterator = tileAccumulatedData.precinctIterator;

        while (precinctIterator.tryAdvance()) {
            if (!precinctIterator.isInCodestreamPart) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected precinct not in codestream part');
            }
            
            iteratePrecinctCallback(precinctIterator, tileStructure);
        }
    }
};