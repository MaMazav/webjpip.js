'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipDatabinsSaver(isJpipTilePartStream, jpipFactory) {
    var PRECINCT_NO_AUX_CLASS = 0;
    var PRECINCT_WITH_AUX_CLASS = 1;
    var TILE_HEADER_CLASS = 2;
    var TILE_NO_AUX_CLASS = 4;
    var TILE_WITH_AUX_CLASS = 5;

    var databinsByClass = [];
    var forbiddenInJpp = [];
    var forbiddenInJpt = [];
    
    var loadedBytes = 0;
    var loadedBytesInRegisteredDatabins = 0;

    // Valid only if isJpipTilePartStream = false
    
    databinsByClass[TILE_HEADER_CLASS] = createDatabinsArray();
    databinsByClass[PRECINCT_NO_AUX_CLASS] = createDatabinsArray();
    databinsByClass[PRECINCT_WITH_AUX_CLASS] = databinsByClass[
        PRECINCT_NO_AUX_CLASS];
    
    forbiddenInJpt[TILE_HEADER_CLASS] = true;
    forbiddenInJpt[PRECINCT_NO_AUX_CLASS] = true;
    forbiddenInJpt[PRECINCT_WITH_AUX_CLASS] = true;
    
    // Valid only if isJpipTilePartStream = true

    databinsByClass[TILE_NO_AUX_CLASS] = createDatabinsArray();
    databinsByClass[TILE_WITH_AUX_CLASS] = databinsByClass[
        TILE_NO_AUX_CLASS];
    
    forbiddenInJpp[TILE_NO_AUX_CLASS] = true;
    forbiddenInJpp[TILE_WITH_AUX_CLASS] = true;
    
    var mainHeaderDatabin = jpipFactory.createDatabinParts(6, 0);
    
    this.getIsJpipTilePartStream = function() {
        return isJpipTilePartStream;
    };
    
    this.getLoadedBytes = function getLoadedBytes() {
        return loadedBytes;
    };

    this.getMainHeaderDatabin = function () {
        return mainHeaderDatabin;
    };
    
    this.getTileHeaderDatabin = function(inClassIndex) {
        var databin = getDatabinFromArray(
            databinsByClass[TILE_HEADER_CLASS],
            TILE_HEADER_CLASS,
            inClassIndex,
            /*isJpipTilePartStreamExpected=*/false,
            'tileHeader');
        
        return databin;
    };
    
    this.getPrecinctDatabin = function(inClassIndex) {
        var databin = getDatabinFromArray(
            databinsByClass[PRECINCT_NO_AUX_CLASS],
            PRECINCT_NO_AUX_CLASS,
            inClassIndex,
            /*isJpipTilePartStreamExpected=*/false,
            'precinct');
        
        return databin;
    };
    
    this.getTileDatabin = function(inClassIndex) {
        var databin = getDatabinFromArray(
            databinsByClass[TILE_NO_AUX_CLASS],
            TILE_NO_AUX_CLASS,
            inClassIndex,
            /*isJpipTilePartStreamExpected=*/true,
            'tilePart');
        
        return databin;
    };
    
    this.addEventListener = function addEventListener(
        databin, event, listener, listenerThis) {
        
        if (event !== 'dataArrived') {
            throw new jGlobals.jpipExceptions.InternalErrorException('Unsupported event: ' +
                event);
        }
        
        var classId = databin.getClassId();
        var inClassId = databin.getInClassId();
        var databinsArray = databinsByClass[classId];
        
        if (databin !== databinsArray.databins[inClassId]) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Unmatched databin ' +
                'with class-ID=' + classId + ' and in-class-ID=' + inClassId);
        }
        
        if (databinsArray.listeners[inClassId] === undefined) {
            databinsArray.listeners[inClassId] = [];
        }
        
        if (databinsArray.listeners[inClassId].length === 0) {
            loadedBytesInRegisteredDatabins += databin.getLoadedBytes();
        }
        
        databinsArray.listeners[inClassId].push({
            listener: listener,
            listenerThis: listenerThis,
            isRegistered: true
            });
        
        databinsArray.databinsWithListeners[inClassId] = databin;
    };
    
    this.removeEventListener = function removeEventListener(
        databin, event, listener) {
        
        if (event !== 'dataArrived') {
            throw new jGlobals.jpipExceptions.InternalErrorException('Unsupported event: ' +
                event);
        }

        var classId = databin.getClassId();
        var inClassId = databin.getInClassId();
        var databinsArray = databinsByClass[classId];
        var listeners = databinsArray.listeners[inClassId];
        
        if (databin !== databinsArray.databins[inClassId] ||
            databin !== databinsArray.databinsWithListeners[inClassId]) {
            
            throw new jGlobals.jpipExceptions.InternalErrorException('Unmatched databin ' +
                'with class-ID=' + classId + ' and in-class-ID=' + inClassId);
        }
        
        for (var i = 0; i < listeners.length; ++i) {
            if (listeners[i].listener === listener) {
                listeners[i].isRegistered = true;
                listeners[i] = listeners[listeners.length - 1];
                listeners.length -= 1;
                
                if (listeners.length === 0) {
                    delete databinsArray.databinsWithListeners[inClassId];
                    loadedBytesInRegisteredDatabins -= databin.getLoadedBytes();
                }
                
                return;
            }
        }
        
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not unregister listener from databin');
    };
    
    this.cleanupUnregisteredDatabins = function cleanupUnregisteredDatabins() {
        for (var i = 0; i < databinsByClass.length; ++i) {
            if (databinsByClass[i] === undefined) {
                continue;
            }
            
            var databins = databinsByClass[i].databinsWithListeners;
            databinsByClass[i].databins = databins.slice();
        }
        
        loadedBytes = loadedBytesInRegisteredDatabins;
    };

    this.saveData = function (header, message) {
        // A.2.2
        
        if (header.codestreamIndex !== 0) {
            throw new jGlobals.jpipExceptions.UnsupportedFeatureException(
                'Non zero Csn (Code Stream Index)', 'A.2.2');
        }
        
        switch (header.classId) {
            case 6:
                saveMainHeader(header, message);
                break;
                
            case 8:
                saveMetadata(header, message);
                break;
            
            default:
                // A.3.2, A.3.3, A.3.4
                
                var databinsArray = databinsByClass[header.classId];
                if (databinsArray === undefined) {
                    break; // A.2.2
                }
                
                var isJptExpected = !!forbiddenInJpp[header.classId];
                var databin = getDatabinFromArray(
                    databinsArray,
                    header.classId,
                    header.inClassId,
                    isJptExpected,
                    '<class ID ' + header.classId + '>');
                
                var bytesBefore = databin.getLoadedBytes();
                databin.addData(header, message);
                var bytesDifference = databin.getLoadedBytes() - bytesBefore;
                loadedBytes += bytesDifference;
                
                var listeners = databinsArray.listeners;
                var databinListeners = listeners[header.inClassId];
                
                if (databinListeners !== undefined && databinListeners.length > 0) {
                    loadedBytesInRegisteredDatabins += bytesDifference;
                    
                    var localListeners = databinListeners.slice();
                    
                    for (var i = 0; i < localListeners.length; ++i) {
                        var listener = localListeners[i];
                        if (listener.isRegistered) {
                            listener.listener.call(listener.listenerThis, databin);
                        }
                    }
                }
                
                break;
        }
    };
    
    function saveMainHeader(header, message) {
        // A.3.5
        
        if (header.inClassId !== 0) {
            throw new jGlobals.jpipExceptions.IllegalDataException('Main header data-bin with ' +
                'in-class index other than zero is not valid', 'A.3.5');
        }
        
        var bytesBefore = mainHeaderDatabin.getLoadedBytes();
        mainHeaderDatabin.addData(header, message);
        var bytesDifference = mainHeaderDatabin.getLoadedBytes() - bytesBefore;
        
        loadedBytes += bytesDifference;
        loadedBytesInRegisteredDatabins += bytesDifference;
    }
    
    function saveMetadata(header, message) {
        // A.3.6
        
        // throw new jGlobals.jpipExceptions.UnsupportedFeatureException('recieve metadata-bin', 'A.3.6');
        
        // ignore unused metadata (legal according to A.2.2).
    }
    
    function getDatabinFromArray(
        databinsArray,
        classId,
        inClassId,
        isJpipTilePartStreamExpected,
        databinTypeDescription) {
        
        if (isJpipTilePartStreamExpected !== isJpipTilePartStream) {
            throw new jGlobals.jpipExceptions.WrongStreamException('databin of type ' +
                databinTypeDescription, isJpipTilePartStream);
        }
        
        var databin = databinsArray.databins[inClassId];
        if (!databin) {
            databin = jpipFactory.createDatabinParts(classId, inClassId);
            databinsArray.databins[inClassId] = databin;
        }
        
        return databin;
    }
    
    function createDatabinsArray() {
        return {
            databins: [],
            listeners: [],
            databinsWithListeners: []
            };
    }
    
    return this;
};