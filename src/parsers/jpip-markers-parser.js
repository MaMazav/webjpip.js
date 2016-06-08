'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipMarkersParser = function JpipMarkersParser(
    mainHeaderDatabin, messageHeaderParser, jpipFactory) {
    
    var CACHE_KEY = 'markers';
    
    this.getMandatoryMarkerOffsetInDatabin =
        function getMandatoryMarkerOffsetInDatabinClosure(
            databin, marker, markerName, standardSection) {
        
        var offset = getMarkerOffsetInDatabin(databin, marker);
        
        if (offset === null) {
            throw new jGlobals.j2kExceptions.IllegalDataException(
                markerName + ' is not found where expected to be',
                standardSection);
        }
        
        return offset;
    };
    
    this.checkSupportedMarkers = function checkSupportedMarkersClosure(
        databin, markers, isMarkersSupported) {
        
        isMarkersSupported = !!isMarkersSupported;
        
        var databinMarkers = getDatabinMarkers(
            databin, /*forceAllMarkersParsed=*/true);
        
        var markersAsProperties = {};
        for (var i = 0; i < markers.length; ++i) {
            var marker = getMarkerAsPropertyName(
                markers[i], 'jpipMarkersParser.supportedMarkers[' + i + ']');
            markersAsProperties[marker] = true;
        }
        
        for (var existingMarker in databinMarkers.markerToOffset) {
            var isMarkerInList = !!markersAsProperties[existingMarker];
            if (isMarkerInList !== isMarkersSupported) {
                throw new jGlobals.j2kExceptions.UnsupportedFeatureException(
                    'Unsupported marker found: ' + existingMarker, 'unknown');
            }
        }
    };
    
    this.getMarkerOffsetInDatabin = getMarkerOffsetInDatabin;
    
    this.isMarker = isMarker;
    
    function isMarker(data, marker, offset) {
        var result = (data[offset] === marker[0]) && (data[offset + 1] === marker[1]);
        
        return result;
    }

    function getMarkerOffsetInDatabin(databin, marker) {
        var databinMarkers = getDatabinMarkers(
            databin, /*forceAllMarkersParsed=*/true);
        
        var strMarker = getMarkerAsPropertyName(
            marker, 'Predefined marker in jGlobals.j2kMarkers');
        var offset = databinMarkers.markerToOffset[strMarker];
        
        if (offset === undefined) {
            return null;
        }
        
        return offset;
    }

    function getDatabinMarkers(databin, forceAllMarkersParsed) {
        var databinMarkers = databin.getCachedData(CACHE_KEY);
        
        if (databinMarkers.markerToOffset === undefined) {
            databinMarkers.isParsedAllMarkers = false;
            databinMarkers.lastOffsetParsed = 0;
            databinMarkers.markerToOffset = {};
            databinMarkers.databin = databin;
        }
        
        if (databinMarkers.isParsedAllMarkers) {
            return databinMarkers;
        }
        
        var startOffset = 0;
        var bytes = [];
        var canParse = true;

        if (databin === mainHeaderDatabin && databinMarkers.lastOffsetParsed === 0) {
            var bytesCopied = databin.copyBytes(bytes, /*startOffset=*/0, {
                forceCopyAllRange: true,
                maxLengthToCopy: jGlobals.j2kOffsets.MARKER_SIZE
                });
            
            if (bytesCopied === null) {
                canParse = false;
            } else if (!isMarker(bytes, jGlobals.j2kMarkers.StartOfCodestream, /*offset=*/0)) {
                throw new jGlobals.j2kExceptions.IllegalDataException(
                    'SOC (Start Of Codestream) ' +
                    'is not found where expected to be',
                    'A.4.1');
            }
            
            databinMarkers.lastOffsetParsed = 2;
        }

        if (canParse) {
            actualParseMarkers(databinMarkers);
        }
        
        afterParseMarkers(databinMarkers, forceAllMarkersParsed);
        
        return databinMarkers;
    }
    
    function actualParseMarkers(databinMarkers) {
        var offset = databinMarkers.lastOffsetParsed;
        
        var bytes = [];
        var bytesCopied = databinMarkers.databin.copyBytes(bytes, /*startOffset=*/0, {
                forceCopyAllRange: true,
                maxLengthToCopy: jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE,
                databinStartOffset: offset
                });
        
        while (bytesCopied !== null) {
            var marker = getMarkerAsPropertyName(
                bytes,
                'offset ' + offset + ' of databin with class ID = ' +
                    databinMarkers.databin.getClassId() + ' and in class ID = ' +
                    databinMarkers.databin.getInClassId());
            databinMarkers.markerToOffset[marker.toString()] = offset;
                
            var length = messageHeaderParser.getInt16(bytes, jGlobals.j2kOffsets.MARKER_SIZE);
            offset += length + jGlobals.j2kOffsets.MARKER_SIZE;
            
            bytesCopied = databinMarkers.databin.copyBytes(bytes, /*startOffset=*/0, {
                forceCopyAllRange: true,
                maxLengthToCopy: jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE,
                databinStartOffset: offset
                });
        }

        databinMarkers.lastOffsetParsed = offset;
    }
    
    function afterParseMarkers(databinMarkers, forceAllMarkersParsed) {
        var databinLength = databinMarkers.databin.getDatabinLengthIfKnown();
        databinMarkers.isParsedAllMarkers = databinMarkers.lastOffsetParsed === databinLength;
        
        if (!databinMarkers.isParsedAllMarkers && databinMarkers.databin !== mainHeaderDatabin) {
            var bytes = [];
            var bytesCopied = databinMarkers.databin.copyBytes(bytes, /*startOffset=*/0, {
                forceCopyAllRange: true,
                maxLengthToCopy: jGlobals.j2kOffsets.MARKER_SIZE,
                databinStartOffset: databinMarkers.lastOffsetParsed
                });
            
            if (bytesCopied !== null &&
                isMarker(bytes, 0, jGlobals.j2kMarkers.StartOfData)) {
                
                databinMarkers.lastOffsetParsed += jGlobals.j2kOffsets.MARKER_SIZE;
                databinMarkers.isParsedAllMarkers = true;
            }
        }
        
        if (forceAllMarkersParsed && !databinMarkers.isParsedAllMarkers) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'data-bin with class ID = ' +
                databinMarkers.databin.getClassId() + ' and in class ID = ' +
                databinMarkers.databin.getInClassId() +
                ' was not recieved yet');
        }
    }
    
    function getMarkerAsPropertyName(bytes, markerPositionDescription) {
        if (bytes[0] !== 0xFF) {
            throw new jGlobals.j2kExceptions.IllegalDataException(
                'Expected marker in ' + markerPositionDescription, 'A');
        }
        
        var marker = bytes[1].toString(16);
        return marker;
    }
};