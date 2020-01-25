var webjpip =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 4);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports.j2kMarkers = {
    StartOfCodestream: [0xFF, 0x4F], // SOC
    ImageAndTileSize: [0xFF, 0x51], // SIZ
    CodingStyleDefault: [0xFF, 0x52], // COD
    CodingStyleComponent: [0xFF, 0x53], // COC
    QuantizationDefault: [0xFF, 0x5C], // QCD
    ProgressionOrderChange: [0xFF, 0x5F], // POC
    PackedPacketHeadersInMainHeader: [0xFF, 0x60], // PPM
    PackedPacketHeadersInTileHeader: [0xFF, 0x61], // PPT
    StartOfTile: [0xFF, 0x90], // SOT
    StartOfData: [0xFF, 0x93], // SOD
    EndOfCodestream: [0xFF, 0xD9], // EOC
    Comment: [0xFF, 0x64] // COM
};

module.exports.j2kOffsets = {
    MARKER_SIZE: 2,
    LENGTH_FIELD_SIZE: 2,

    NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER: 38,
    REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER: 6

};

module.exports.jpipEndOfResponseReasons = {
    IMAGE_DONE: 1,
    WINDOW_DONE: 2,
    WINDOW_CHANGE: 3,
    BYTE_LIMIT: 4,
    QUALITY_LIMIT: 5,
    SESSION_LIMIT: 6,
    RESPONSE_LIMIT: 7,
    NON_SPECIFIED: 8
};

module.exports.j2kExceptions = {
    UnsupportedFeatureException: function UnsupportedFeatureException(feature, standardSection) {
        this.description = feature;
        if (standardSection) {
            this.description += ' (specified in section ' + standardSection + ' of part 1: Core Coding System standard) is not supported yet';
        }

        this.toString = function () {
            return 'J2k UnsupportedFeatureException: ' + this.description;
        };

        return this;
    },

    ParseException: function ParseException(description) {
        this.description = description;

        this.toString = function () {
            return 'J2k ParseException: ' + this.description;
        };

        return this;
    },

    IllegalDataException: function IllegalDataException(illegalDataDescription, standardSection) {
        this.description = illegalDataDescription + ' (see section ' + standardSection + ' of part 9: Interactivity tools, APIs and Protocols)';

        this.toString = function () {
            return 'J2k IllegalDataException: ' + this.description;
        };

        return this;
    }
};

module.exports.jpipExceptions = {
    UnsupportedFeatureException: function UnsupportedFeatureException(feature, standardSection) {
        this.description = feature;
        if (standardSection) {
            this.description += ' (specified in section ' + standardSection + ' of part 9: Interactivity tools, APIs and Protocols) is not supported yet';
        }

        this.toString = function () {
            return 'Jpip UnsupportedFeatureException: ' + this.description;
        };

        return this;
    },

    ParseException: function ParseException(description) {
        this.description = description;

        this.toString = function () {
            return 'Jpip ParseException: ' + this.description;
        };

        return this;
    },

    IllegalDataException: function IllegalDataException(illegalDataDescription, standardSection) {
        this.description = illegalDataDescription + ' (see section ' + standardSection + ' of part 9: Interactivity tools, APIs and Protocols)';

        this.toString = function () {
            return 'Jpip IllegalDataException: ' + this.description;
        };

        return this;
    },

    IllegalOperationException: function IllegalOperationException(description) {
        this.description = description;

        this.toString = function () {
            return 'Jpip IllegalOperationException: ' + this.description;
        };

        return this;
    },

    ArgumentException: function ArgumentException(argumentName, argumentValue, description) {
        this.description = 'Argument ' + argumentName + ' has invalid value ' + argumentValue + (description !== undefined ? ' :' + description : '');

        this.toString = function () {
            return 'Jpip ArgumentException: ' + this.description;
        };

        return this;
    },

    WrongStreamException: function WrongStreamException(requestedOperation, isJPT) {
        var correctStream = 'JPP (JPIP Precinct)';
        var wrongStream = 'JPT (JPIP Tile-part)';

        if (isJPT) {
            var swap = correctStream;
            correctStream = wrongStream;
            wrongStream = swap;
        }

        this.description = 'Stream type is ' + wrongStream + ', but ' + requestedOperation + ' is allowed only in ' + correctStream + ' stream';

        this.toString = function () {
            return 'Jpip WrongStreamException: ' + this.description;
        };

        return this;
    },

    InternalErrorException: function InternalErrorException(description) {
        this.description = description;

        this.toString = function () {
            return 'Jpip InternalErrorException: ' + this.description;
        };

        return this;
    }
};

module.exports.j2kExceptions.UnsupportedFeatureException.Name = 'j2kExceptions.UnsupportedFeatureException';
module.exports.j2kExceptions.ParseException.Name = 'j2kExceptions.ParseException';
module.exports.j2kExceptions.IllegalDataException.Name = 'j2kExceptions.IllegalDataException';

module.exports.jpipExceptions.UnsupportedFeatureException.Name = 'jpipExceptions.UnsupportedFeatureException';
module.exports.jpipExceptions.ParseException.Name = 'jpipExceptions.ParseException';
module.exports.jpipExceptions.IllegalDataException.Name = 'jpipExceptions.IllegalDataException';
module.exports.jpipExceptions.IllegalOperationException.Name = 'jpipExceptions.IllegalOperationException';
module.exports.jpipExceptions.ArgumentException.Name = 'jpipExceptions.ArgumentException';
module.exports.jpipExceptions.WrongStreamException.Name = 'jpipExceptions.WrongStreamException';
module.exports.jpipExceptions.InternalErrorException.Name = 'jpipExceptions.InternalErrorException';

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var simpleAjaxHelper = __webpack_require__(6);
var mutualExclusiveTransactionHelper = __webpack_require__(7);

var jpipCodingPassesNumberParser = __webpack_require__(8);
var jpipMessageHeaderParser = __webpack_require__(9);

var JpipChannel = __webpack_require__(10);
var JpipCodestreamReconstructor = __webpack_require__(11);
var JpipCodestreamStructure = __webpack_require__(12);
var JpipComponentStructure = __webpack_require__(13);
var CompositeArray = __webpack_require__(14);
var JpipDatabinParts = __webpack_require__(15);
var JpipDatabinsSaver = __webpack_require__(16);
var JpipFetch = __webpack_require__(17);
var JpipFetcher = __webpack_require__(18);
var JpipHeaderModifier = __webpack_require__(19);
var JpipImageDataContext = __webpack_require__(20);
var JpipLevelCalculator = __webpack_require__(21);
var JpipMarkersParser = __webpack_require__(22);
var JpipOffsetsCalculator = __webpack_require__(23);
var JpipPacketsDataCollector = __webpack_require__(24);
var JpipParamsCodestreamPart = __webpack_require__(25);
var JpipParamsPrecinctIterator = __webpack_require__(26);
var JpipPrecinctCodestreamPart = __webpack_require__(27);
var JpipPrecinctsIteratorWaiter = __webpack_require__(28);
var JpipQualityWaiter = __webpack_require__(29);
var JpipRequestParamsModifier = __webpack_require__(30);
var JpipRequest = __webpack_require__(31);
var JpipSessionHelper = __webpack_require__(32);
var JpipSession = __webpack_require__(33);
var JpipReconnectableRequester = __webpack_require__(34);
var JpipStructureParser = __webpack_require__(35);
var JpipTileStructure = __webpack_require__(36);
var JpipBitstreamReader = __webpack_require__(37);
var JpipTagTree = __webpack_require__(38);
var JpipCodeblockLengthParser = __webpack_require__(39);
var JpipSubbandLengthInPacketHeaderCalculator = __webpack_require__(40);
var JpipPacketLengthCalculator = __webpack_require__(41);
var JpipQualityLayersCache = __webpack_require__(42);

var jpipRuntimeFactory = {
    createChannel: function createChannel(maxRequestsWaitingForResponseInChannel, sessionHelper) {

        return new JpipChannel(maxRequestsWaitingForResponseInChannel, sessionHelper, jpipRuntimeFactory);
    },

    createCodestreamReconstructor: function createCodestreamReconstructor(databinsSaver, headerModifier, qualityLayersCache) {

        return new JpipCodestreamReconstructor(databinsSaver, headerModifier, qualityLayersCache);
    },

    createLevelCalculator: function createLevelCalculator(params) {
        return new JpipLevelCalculator(params);
    },

    createCodestreamStructure: function createCodestreamStructure(structureParser, progressionOrder) {
        return new JpipCodestreamStructure(structureParser, jpipRuntimeFactory, progressionOrder);
    },

    createComponentStructure: function createComponentStructure(params, tileStructure) {
        return new JpipComponentStructure(params, tileStructure);
    },

    createCompositeArray: function createCompositeArray(offset) {
        return new CompositeArray(offset);
    },

    createDatabinParts: function createDatabinParts(classId, inClassId) {
        return new JpipDatabinParts(classId, inClassId, jpipRuntimeFactory);
    },

    createDatabinsSaver: function createDatabinsSaver(isJpipTilepartStream) {
        return new JpipDatabinsSaver(isJpipTilepartStream, jpipRuntimeFactory);
    },

    createFetcher: function createFetcher(databinsSaver, fetcherSharedObjects, options) {
        return new JpipFetcher(databinsSaver, fetcherSharedObjects, options, jpipRuntimeFactory);
    },

    createFetch: function createFetch(fetchContext, requester, progressiveness) {
        return new JpipFetch(fetchContext, requester, progressiveness);
    },

    createHeaderModifier: function createHeaderModifier(offsetsCalculator, progressionOrder) {

        return new JpipHeaderModifier(offsetsCalculator, progressionOrder);
    },

    createImageDataContext: function createImageDataContext(jpipObjects, codestreamPartParams, maxQuality, progressiveness) {

        return new JpipImageDataContext(jpipObjects, codestreamPartParams, maxQuality, progressiveness);
    },

    createMarkersParser: function createMarkersParser(mainHeaderDatabin) {
        return new JpipMarkersParser(mainHeaderDatabin, jpipMessageHeaderParser, jpipRuntimeFactory);
    },

    createOffsetsCalculator: function createOffsetsCalculator(mainHeaderDatabin, markersParser) {
        return new JpipOffsetsCalculator(mainHeaderDatabin, markersParser);
    },

    createPacketsDataCollector: function createPacketsDataCollector(databinsSaver, qualityLayersCache) {

        return new JpipPacketsDataCollector(databinsSaver, qualityLayersCache, jpipRuntimeFactory);
    },

    createParamsCodestreamPart: function createParamsCodestreamPart(codestreamPartParams, codestreamStructure) {

        return new JpipParamsCodestreamPart(codestreamPartParams, codestreamStructure, jpipRuntimeFactory);
    },

    createParamsPrecinctIterator: function createParamsPrecinctIterator(codestreamStructure, idx, codestreamPartParams, isIteratePrecinctsNotInCodestreamPart) {

        return new JpipParamsPrecinctIterator(codestreamStructure, idx, codestreamPartParams, isIteratePrecinctsNotInCodestreamPart);
    },

    createPrecinctCodestreamPart: function createPrecinctCodestreamPart(sizesCalculator, tileStructure, tileIndex, component, level, precinctX, precinctY) {

        return new JpipPrecinctCodestreamPart(sizesCalculator, tileStructure, tileIndex, component, level, precinctX, precinctY);
    },

    createPrecinctsIteratorWaiter: function createPrecinctsIteratorWaiter(codestreamPart, codestreamStructure, databinsSaver, iteratePrecinctCallback) {

        return new JpipPrecinctsIteratorWaiter(codestreamPart, codestreamStructure, databinsSaver, iteratePrecinctCallback, jpipRuntimeFactory);
    },

    createQualityWaiter: function createQualityWaiter(codestreamPart, progressiveness, maxQuality, qualityLayerReachedCallback, codestreamStructure, databinsSaver, startTrackPrecinct, callbacksThis) {

        return new JpipQualityWaiter(codestreamPart, progressiveness, maxQuality, qualityLayerReachedCallback, codestreamStructure, databinsSaver, startTrackPrecinct, callbacksThis, jpipRuntimeFactory);
    },

    createRequestParamsModifier: function createRequestParamsModifier(codestreamStructure) {

        return new JpipRequestParamsModifier(codestreamStructure);
    },

    createRequest: function createRequest(sessionHelper, channel, requestUrl, callback, failureCallback) {

        return new JpipRequest(sessionHelper, jpipMessageHeaderParser, channel, requestUrl, callback, failureCallback);
    },

    createSessionHelper: function createSessionHelper(dataRequestUrl, knownTargetId, codestreamStructure, databinsSaver) {

        return new JpipSessionHelper(dataRequestUrl, knownTargetId, codestreamStructure, databinsSaver, simpleAjaxHelper);
    },

    createSession: function createSession(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, targetId, codestreamStructure, databinsSaver) {

        return new JpipSession(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, targetId, codestreamStructure, databinsSaver, setInterval, clearInterval, jpipRuntimeFactory);
    },

    createReconnectableRequester: function createReconnectableRequester(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, codestreamStructure, databinsSaver) {

        return new JpipReconnectableRequester(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, codestreamStructure, databinsSaver, jpipRuntimeFactory);
    },

    createStructureParser: function createStructureParser(databinsSaver, markersParser, offsetsCalculator) {
        return new JpipStructureParser(databinsSaver, markersParser, jpipMessageHeaderParser, offsetsCalculator);
    },

    createTileStructure: function createTileStructure(sizeParams, codestreamStructure, progressionOrder) {
        return new JpipTileStructure(sizeParams, codestreamStructure, jpipRuntimeFactory, progressionOrder);
    },

    createBitstreamReader: function createBitstreamReader(databin) {
        return new JpipBitstreamReader(databin, mutualExclusiveTransactionHelper);
    },

    createTagTree: function createTagTree(bitstreamReader, width, height) {
        return new JpipTagTree(bitstreamReader, width, height, mutualExclusiveTransactionHelper);
    },

    createCodeblockLengthParser: function createCodeblockLengthParser(bitstreamReader, transactionHelper) {

        return new JpipCodeblockLengthParser(bitstreamReader, mutualExclusiveTransactionHelper);
    },

    createSubbandLengthInPacketHeaderCalculator: function createSubbandLengthInPacketHeaderCalculator(bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband) {

        return new JpipSubbandLengthInPacketHeaderCalculator(bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband, jpipCodingPassesNumberParser, mutualExclusiveTransactionHelper, jpipRuntimeFactory);
    },

    createPacketLengthCalculator: function createPacketLengthCalculator(tileStructure, componentStructure, databin, startOffsetInDatabin, precinct) {

        return new JpipPacketLengthCalculator(tileStructure, componentStructure, databin, startOffsetInDatabin, precinct, jpipRuntimeFactory);
    },

    createQualityLayersCache: function createQualityLayersCache(codestreamStructure) {

        return new JpipQualityLayersCache(codestreamStructure, jpipRuntimeFactory);
    }
};

module.exports = jpipRuntimeFactory;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.JpxImage = undefined;

var _util = __webpack_require__(44);

var _arithmetic_decoder = __webpack_require__(45);

/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var JpxError = function JpxErrorClosure() {
  function JpxError(msg) {
    this.message = 'JPX error: ' + msg;
  }

  JpxError.prototype = new Error();
  JpxError.prototype.name = 'JpxError';
  JpxError.constructor = JpxError;

  return JpxError;
}();

var JpxImage = function JpxImageClosure() {
  // Table E.1
  var SubbandsGainLog2 = {
    'LL': 0,
    'LH': 1,
    'HL': 1,
    'HH': 2
  };
  function JpxImage() {
    this.failOnCorruptedImage = false;
  }
  JpxImage.prototype = {
    parse: function JpxImage_parse(data) {

      var head = (0, _util.readUint16)(data, 0);
      // No box header, immediate start of codestream (SOC)
      if (head === 0xFF4F) {
        this.parseCodestream(data, 0, data.length);
        return;
      }

      var position = 0,
          length = data.length;
      while (position < length) {
        var headerSize = 8;
        var lbox = (0, _util.readUint32)(data, position);
        var tbox = (0, _util.readUint32)(data, position + 4);
        position += headerSize;
        if (lbox === 1) {
          // XLBox: read UInt64 according to spec.
          // JavaScript's int precision of 53 bit should be sufficient here.
          lbox = (0, _util.readUint32)(data, position) * 4294967296 + (0, _util.readUint32)(data, position + 4);
          position += 8;
          headerSize += 8;
        }
        if (lbox === 0) {
          lbox = length - position + headerSize;
        }
        if (lbox < headerSize) {
          throw new JpxError('Invalid box field size');
        }
        var dataLength = lbox - headerSize;
        var jumpDataLength = true;
        switch (tbox) {
          case 0x6A703268:
            // 'jp2h'
            jumpDataLength = false; // parsing child boxes
            break;
          case 0x636F6C72:
            // 'colr'
            // Colorspaces are not used, the CS from the PDF is used.
            var method = data[position];
            if (method === 1) {
              // enumerated colorspace
              var colorspace = (0, _util.readUint32)(data, position + 3);
              switch (colorspace) {
                case 16: // this indicates a sRGB colorspace
                case 17: // this indicates a grayscale colorspace
                case 18:
                  // this indicates a YUV colorspace
                  break;
                default:
                  (0, _util.warn)('Unknown colorspace ' + colorspace);
                  break;
              }
            } else if (method === 2) {
              (0, _util.info)('ICC profile not supported');
            }
            break;
          case 0x6A703263:
            // 'jp2c'
            this.parseCodestream(data, position, position + dataLength);
            break;
          case 0x6A502020:
            // 'jP\024\024'
            if ((0, _util.readUint32)(data, position) !== 0x0d0a870a) {
              (0, _util.warn)('Invalid JP2 signature');
            }
            break;
          // The following header types are valid but currently not used:
          case 0x6A501A1A: // 'jP\032\032'
          case 0x66747970: // 'ftyp'
          case 0x72726571: // 'rreq'
          case 0x72657320: // 'res '
          case 0x69686472:
            // 'ihdr'
            break;
          default:
            var headerType = String.fromCharCode(tbox >> 24 & 0xFF, tbox >> 16 & 0xFF, tbox >> 8 & 0xFF, tbox & 0xFF);
            (0, _util.warn)('Unsupported header type ' + tbox + ' (' + headerType + ')');
            break;
        }
        if (jumpDataLength) {
          position += dataLength;
        }
      }
    },
    parseImageProperties: function JpxImage_parseImageProperties(stream) {
      var newByte = stream.getByte();
      while (newByte >= 0) {
        var oldByte = newByte;
        newByte = stream.getByte();
        var code = oldByte << 8 | newByte;
        // Image and tile size (SIZ)
        if (code === 0xFF51) {
          stream.skip(4);
          var Xsiz = stream.getInt32() >>> 0; // Byte 4
          var Ysiz = stream.getInt32() >>> 0; // Byte 8
          var XOsiz = stream.getInt32() >>> 0; // Byte 12
          var YOsiz = stream.getInt32() >>> 0; // Byte 16
          stream.skip(16);
          var Csiz = stream.getUint16(); // Byte 36
          this.width = Xsiz - XOsiz;
          this.height = Ysiz - YOsiz;
          this.componentsCount = Csiz;
          // Results are always returned as `Uint8ClampedArray`s.
          this.bitsPerComponent = 8;
          return;
        }
      }
      throw new JpxError('No size marker found in JPX stream');
    },
    parseCodestream: function JpxImage_parseCodestream(data, start, end, options) {
      var context = {};
      options = options || {};
      var isOnlyParseHeaders = !!options.isOnlyParseHeaders;
      var regionToParse = options.regionToParse;
      if (regionToParse !== undefined && isOnlyParseHeaders) {
        throw 'JPX Error: options.regionToParse is uneffective if ' + 'options.isOnlyParseHeaders = true';
      }

      var doNotRecover = false;
      try {
        var position = start;
        while (position + 1 < end) {
          var code = (0, _util.readUint16)(data, position);
          position += 2;

          var length = 0,
              j,
              sqcd,
              spqcds,
              spqcdSize,
              scalarExpounded,
              tile;
          switch (code) {
            case 0xFF4F:
              // Start of codestream (SOC)
              context.mainHeader = true;
              break;
            case 0xFFD9:
              // End of codestream (EOC)
              break;
            case 0xFF51:
              // Image and tile size (SIZ)
              length = (0, _util.readUint16)(data, position);
              var siz = {};
              siz.Xsiz = (0, _util.readUint32)(data, position + 4);
              siz.Ysiz = (0, _util.readUint32)(data, position + 8);
              siz.XOsiz = (0, _util.readUint32)(data, position + 12);
              siz.YOsiz = (0, _util.readUint32)(data, position + 16);
              siz.XTsiz = (0, _util.readUint32)(data, position + 20);
              siz.YTsiz = (0, _util.readUint32)(data, position + 24);
              siz.XTOsiz = (0, _util.readUint32)(data, position + 28);
              siz.YTOsiz = (0, _util.readUint32)(data, position + 32);
              var componentsCount = (0, _util.readUint16)(data, position + 36);
              siz.Csiz = componentsCount;
              var components = [];
              var isComponentSizesSupported = true;
              j = position + 38;
              for (var i = 0; i < componentsCount; i++) {
                var component = {
                  precision: (data[j] & 0x7F) + 1,
                  isSigned: !!(data[j] & 0x80),
                  XRsiz: data[j + 1],
                  YRsiz: data[j + 2]
                };
                j += 3;
                calculateComponentDimensions(component, siz);
                components.push(component);

                if (regionToParse !== undefined) {
                  isComponentSizesSupported &= component.XRsiz === 1 && component.YRsiz === 1;
                }
              }
              context.SIZ = siz;
              context.components = components;
              calculateTileGrids(context, components);
              context.QCC = [];
              context.COC = [];

              if (!isComponentSizesSupported) {
                throw new Error('JPX Error: When regionToParse is used, ' + 'component size other than 1 is not supported');
              }
              break;
            case 0xFF5C:
              // Quantization default (QCD)
              length = (0, _util.readUint16)(data, position);
              var qcd = {};
              j = position + 2;
              sqcd = data[j++];
              switch (sqcd & 0x1F) {
                case 0:
                  spqcdSize = 8;
                  scalarExpounded = true;
                  break;
                case 1:
                  spqcdSize = 16;
                  scalarExpounded = false;
                  break;
                case 2:
                  spqcdSize = 16;
                  scalarExpounded = true;
                  break;
                default:
                  throw new Error('Invalid SQcd value ' + sqcd);
              }
              qcd.noQuantization = spqcdSize === 8;
              qcd.scalarExpounded = scalarExpounded;
              qcd.guardBits = sqcd >> 5;
              spqcds = [];
              while (j < length + position) {
                var spqcd = {};
                if (spqcdSize === 8) {
                  spqcd.epsilon = data[j++] >> 3;
                  spqcd.mu = 0;
                } else {
                  spqcd.epsilon = data[j] >> 3;
                  spqcd.mu = (data[j] & 0x7) << 8 | data[j + 1];
                  j += 2;
                }
                spqcds.push(spqcd);
              }
              qcd.SPqcds = spqcds;
              if (context.mainHeader) {
                context.QCD = qcd;
              } else {
                context.currentTile.QCD = qcd;
                context.currentTile.QCC = [];
              }
              break;
            case 0xFF5D:
              // Quantization component (QCC)
              length = (0, _util.readUint16)(data, position);
              var qcc = {};
              j = position + 2;
              var cqcc;
              if (context.SIZ.Csiz < 257) {
                cqcc = data[j++];
              } else {
                cqcc = (0, _util.readUint16)(data, j);
                j += 2;
              }
              sqcd = data[j++];
              switch (sqcd & 0x1F) {
                case 0:
                  spqcdSize = 8;
                  scalarExpounded = true;
                  break;
                case 1:
                  spqcdSize = 16;
                  scalarExpounded = false;
                  break;
                case 2:
                  spqcdSize = 16;
                  scalarExpounded = true;
                  break;
                default:
                  throw new Error('Invalid SQcd value ' + sqcd);
              }
              qcc.noQuantization = spqcdSize === 8;
              qcc.scalarExpounded = scalarExpounded;
              qcc.guardBits = sqcd >> 5;
              spqcds = [];
              while (j < length + position) {
                spqcd = {};
                if (spqcdSize === 8) {
                  spqcd.epsilon = data[j++] >> 3;
                  spqcd.mu = 0;
                } else {
                  spqcd.epsilon = data[j] >> 3;
                  spqcd.mu = (data[j] & 0x7) << 8 | data[j + 1];
                  j += 2;
                }
                spqcds.push(spqcd);
              }
              qcc.SPqcds = spqcds;
              if (context.mainHeader) {
                context.QCC[cqcc] = qcc;
              } else {
                context.currentTile.QCC[cqcc] = qcc;
              }
              break;
            case 0xFF52:
              // Coding style default (COD)
              length = (0, _util.readUint16)(data, position);
              var cod = {};
              j = position + 2;
              var scod = data[j++];
              cod.entropyCoderWithCustomPrecincts = !!(scod & 1);
              cod.sopMarkerUsed = !!(scod & 2);
              cod.ephMarkerUsed = !!(scod & 4);
              cod.progressionOrder = data[j++];
              cod.layersCount = (0, _util.readUint16)(data, j);
              j += 2;
              cod.multipleComponentTransform = data[j++];

              cod.decompositionLevelsCount = data[j++];
              cod.xcb = (data[j++] & 0xF) + 2;
              cod.ycb = (data[j++] & 0xF) + 2;
              var blockStyle = data[j++];
              cod.selectiveArithmeticCodingBypass = !!(blockStyle & 1);
              cod.resetContextProbabilities = !!(blockStyle & 2);
              cod.terminationOnEachCodingPass = !!(blockStyle & 4);
              cod.verticallyStripe = !!(blockStyle & 8);
              cod.predictableTermination = !!(blockStyle & 16);
              cod.segmentationSymbolUsed = !!(blockStyle & 32);
              cod.reversibleTransformation = data[j++];
              if (cod.entropyCoderWithCustomPrecincts) {
                var precinctsSizes = [];
                while (j < length + position) {
                  var precinctsSize = data[j++];
                  precinctsSizes.push({
                    PPx: precinctsSize & 0xF,
                    PPy: precinctsSize >> 4
                  });
                }
                cod.precinctsSizes = precinctsSizes;
              }
              var unsupported = [];
              if (cod.selectiveArithmeticCodingBypass) {
                unsupported.push('selectiveArithmeticCodingBypass');
              }
              if (cod.resetContextProbabilities) {
                unsupported.push('resetContextProbabilities');
              }
              if (cod.terminationOnEachCodingPass) {
                unsupported.push('terminationOnEachCodingPass');
              }
              if (cod.verticallyStripe) {
                unsupported.push('verticallyStripe');
              }
              if (cod.predictableTermination) {
                unsupported.push('predictableTermination');
              }
              if (unsupported.length > 0) {
                doNotRecover = true;
                throw new Error('Unsupported COD options (' + unsupported.join(', ') + ')');
              }
              if (context.mainHeader) {
                context.COD = cod;
              } else {
                context.currentTile.COD = cod;
                context.currentTile.COC = [];
              }
              break;
            case 0xFF90:
              // Start of tile-part (SOT)
              length = (0, _util.readUint16)(data, position);
              tile = {};
              tile.index = (0, _util.readUint16)(data, position + 2);
              tile.length = (0, _util.readUint32)(data, position + 4);
              tile.dataEnd = tile.length + position - 2;
              tile.partIndex = data[position + 8];
              tile.partsCount = data[position + 9];

              context.mainHeader = false;
              if (tile.partIndex === 0) {
                // reset component specific settings
                tile.COD = context.COD;
                tile.COC = context.COC.slice(0); // clone of the global COC
                tile.QCD = context.QCD;
                tile.QCC = context.QCC.slice(0); // clone of the global COC
              }
              context.currentTile = tile;
              break;
            case 0xFF93:
              // Start of data (SOD)
              tile = context.currentTile;
              if (tile.partIndex === 0) {
                initializeTile(context, tile.index);
                buildPackets(context);
              }

              // moving to the end of the data
              length = tile.dataEnd - position;
              if (!isOnlyParseHeaders) {
                parseTilePackets(context, data, position, length);
              }

              break;
            case 0xFF55: // Tile-part lengths, main header (TLM)
            case 0xFF57: // Packet length, main header (PLM)
            case 0xFF58: // Packet length, tile-part header (PLT)
            case 0xFF64:
              // Comment (COM)
              length = (0, _util.readUint16)(data, position);
              // skipping content
              break;
            case 0xFF53:
              // Coding style component (COC)
              throw new Error('Codestream code 0xFF53 (COC) is ' + 'not implemented');
            default:
              throw new Error('Unknown codestream code: ' + code.toString(16));
          }
          position += length;
        }
      } catch (e) {
        if (doNotRecover || this.failOnCorruptedImage) {
          throw new JpxError(e.message);
        } else {
          (0, _util.warn)('JPX: Trying to recover from: ' + e.message);
        }
      }
      if (!isOnlyParseHeaders) {
        this.decode(context, options);
      }
      this.width = context.SIZ.Xsiz - context.SIZ.XOsiz;
      this.height = context.SIZ.Ysiz - context.SIZ.YOsiz;
      this.componentsCount = context.SIZ.Csiz;
      return context;
    },
    invalidateData: function JpxImage_invalidateData(context) {
      context.dataInvalidationId = (context.dataInvalidationId || 0) + 1;
    },
    addPacketsData: function JpxImage_addPacketData(context, packetsData) {
      for (var j = 0; j < packetsData.packetDataOffsets.length; ++j) {
        var packetOffsets = packetsData.packetDataOffsets[j];
        var tile = context.tiles[packetOffsets.tileIndex];
        var component = tile.components[packetOffsets.c];
        var resolution = component.resolutions[packetOffsets.r];
        var p = packetOffsets.p;
        var pixelsPrecinct = resolution.pixelsPrecincts[p];
        var codeblocks = pixelsPrecinct.codeblocks;
        pixelsPrecinct.hasData = true;
        for (var i = 0; i < packetOffsets.codeblockOffsets.length; ++i) {
          var codeblockOffsets = packetOffsets.codeblockOffsets[i];
          var isNoData = codeblockOffsets.start === codeblockOffsets.end;
          if (isNoData) {
            continue;
          }
          var codeblock = codeblocks[i];
          if (codeblock.dataInvalidationId !== context.dataInvalidationId) {
            codeblock.dataInvalidationId = context.dataInvalidationId;
            codeblock.data = undefined;
            codeblock.zeroBitPlanes = undefined;
            var subbandDataId = codeblock.parentSubband.dataInvalidationId;
            if (subbandDataId !== context.dataInvalidationId) {
              subbandDataId = context.dataInvalidationId;
              codeblock.parentSubband.dataInvalidationId = subbandDataId;
              codeblock.parentSubband.codeblocksWithData = [];
            }
          }
          if (codeblock['data'] === undefined) {
            codeblock.data = [];
            codeblock.parentSubband.codeblocksWithData.push(codeblock);
          }
          if (codeblockOffsets.zeroBitPlanes !== undefined) {
            if (codeblock.zeroBitPlanes === undefined) {
              codeblock.zeroBitPlanes = codeblockOffsets.zeroBitPlanes;
            }
            if (codeblock.zeroBitPlanes !== codeblockOffsets.zeroBitPlanes) {
              throw 'JPX Error: Unmatched zero bit planes';
            }
          } else if (codeblock.zeroBitPlanes === undefined) {
            throw 'JPX Error: zeroBitPlanes is unknown';
          }
          codeblock.included = true;
          codeblock.data.push({
            data: packetsData.data,
            start: codeblockOffsets.start,
            end: codeblockOffsets.end,
            codingpasses: codeblockOffsets.codingpasses
          });
        }
      }
    },
    decodePrecinctCoefficients: function JpxImage_decodeCodeblockCoefficients(context, tileIdx, componentIdx, resolutionIdx, precinctIdx) {
      var tile = context.tiles[tileIdx];
      var component = tile.components[componentIdx];
      var resolution = component.resolutions[resolutionIdx];
      var pixelsPrecinct = resolution.pixelsPrecincts[precinctIdx];

      var codingStyleParameters = component.codingStyleParameters;
      var quantizationParameters = component.quantizationParameters;
      var spqcds = quantizationParameters.SPqcds;
      var scalarExpounded = quantizationParameters.scalarExpounded;
      var guardBits = quantizationParameters.guardBits;
      var segmentationSymbolUsed = codingStyleParameters.segmentationSymbolUsed;
      var precision = context.components[componentIdx].precision;
      var reversible = codingStyleParameters.reversibleTransformation;

      var regionInLevel = calculateRegionInLevelOfPixelsPrecinct(pixelsPrecinct, resolution);
      var coefficients = getCoefficientsOfResolution(resolution, spqcds, scalarExpounded, precision, guardBits, reversible, segmentationSymbolUsed, regionInLevel, context.dataInvalidationId);

      return coefficients;
    },
    setPrecinctCoefficients: function JpxImage_addPrecinctCoefficients(context, coefficients, tileIdx, componentIdx, resolutionIdx, precinctIdx) {
      var tile = context.tiles[tileIdx];
      var component = tile.components[componentIdx];
      var resolution = component.resolutions[resolutionIdx];
      var pixelsPrecinct = resolution.pixelsPrecincts[precinctIdx];

      if (resolution.dataInvalidationId !== context.dataInvalidationId) {
        resolution.dataInvalidationId = context.dataInvalidationId;
        resolution.pixelsPrecinctsWithDecodedCoefficients = [];
      }
      if (!pixelsPrecinct.hasDecodedCoefficients) {
        resolution.pixelsPrecinctsWithDecodedCoefficients.push(pixelsPrecinct);
      }
      pixelsPrecinct.decodedCoefficients = coefficients;
      resolution.hasDecodedCoefficients = true;
      pixelsPrecinct.dataInvalidationId = context.dataInvalidationId;
    },
    decode: function JpxImage_decode(context, options) {
      if (options !== undefined && options.regionToParse !== undefined) {
        var region = options.regionToParse;
        if (region.top === undefined || region.left === undefined || region.right === undefined || region.bottom === undefined) {
          throw new Error('JPX Error: Either left, top, right or ' + 'bottom are undefined in regionToParse');
        }
        context.regionToParse = region;
      }
      this.tiles = transformComponents(context);
      context.regionToParse = undefined;
    }
  };
  function calculateRegionInLevelOfPixelsPrecinct(pixelsPrecincts, resolution) {
    var regionInLevel;
    var subbands = resolution.subbands;
    for (var i = 0; i < pixelsPrecincts.subbandPrecincts.length; ++i) {
      var interleave = resolution.subbands[i].type !== 'LL';
      var x0 = pixelsPrecincts.subbandPrecincts[i].tbxMin_;
      var y0 = pixelsPrecincts.subbandPrecincts[i].tbyMin_;
      var x1 = pixelsPrecincts.subbandPrecincts[i].tbxMax_;
      var y1 = pixelsPrecincts.subbandPrecincts[i].tbyMax_;
      if (interleave) {
        x0 = (x0 - resolution.subbands[i].tbx0) * 2 + resolution.trx0;
        y0 = (y0 - resolution.subbands[i].tby0) * 2 + resolution.try0;
        x1 = (x1 - resolution.subbands[i].tbx0) * 2 + resolution.trx0;
        y1 = (y1 - resolution.subbands[i].tby0) * 2 + resolution.try0;
      }
      if (i === 0) {
        regionInLevel = { x0: x0, y0: y0, x1: x1, y1: y1 };
      } else {
        regionInLevel.x0 = Math.min(regionInLevel.x0, x0);
        regionInLevel.y0 = Math.min(regionInLevel.y0, y0);
        regionInLevel.x1 = Math.max(regionInLevel.x1, x1);
        regionInLevel.y1 = Math.max(regionInLevel.y1, y1);
      }
    }
    return regionInLevel;
  }
  function calculateComponentDimensions(component, siz) {
    // Section B.2 Component mapping
    component.x0 = Math.ceil(siz.XOsiz / component.XRsiz);
    component.x1 = Math.ceil(siz.Xsiz / component.XRsiz);
    component.y0 = Math.ceil(siz.YOsiz / component.YRsiz);
    component.y1 = Math.ceil(siz.Ysiz / component.YRsiz);
    component.width = component.x1 - component.x0;
    component.height = component.y1 - component.y0;
  }
  function calculateTileGrids(context, components) {
    var siz = context.SIZ;
    // Section B.3 Division into tile and tile-components
    var tile,
        tiles = [];
    var numXtiles = Math.ceil((siz.Xsiz - siz.XTOsiz) / siz.XTsiz);
    var numYtiles = Math.ceil((siz.Ysiz - siz.YTOsiz) / siz.YTsiz);
    for (var q = 0; q < numYtiles; q++) {
      for (var p = 0; p < numXtiles; p++) {
        tile = {};
        tile.tx0 = Math.max(siz.XTOsiz + p * siz.XTsiz, siz.XOsiz);
        tile.ty0 = Math.max(siz.YTOsiz + q * siz.YTsiz, siz.YOsiz);
        tile.tx1 = Math.min(siz.XTOsiz + (p + 1) * siz.XTsiz, siz.Xsiz);
        tile.ty1 = Math.min(siz.YTOsiz + (q + 1) * siz.YTsiz, siz.Ysiz);
        tile.width = tile.tx1 - tile.tx0;
        tile.height = tile.ty1 - tile.ty0;
        tile.components = [];
        tiles.push(tile);
      }
    }
    context.tiles = tiles;

    var componentsCount = siz.Csiz;
    for (var i = 0, ii = componentsCount; i < ii; i++) {
      var component = components[i];
      for (var j = 0, jj = tiles.length; j < jj; j++) {
        var tileComponent = {};
        tile = tiles[j];
        tileComponent.tcx0 = Math.ceil(tile.tx0 / component.XRsiz);
        tileComponent.tcy0 = Math.ceil(tile.ty0 / component.YRsiz);
        tileComponent.tcx1 = Math.ceil(tile.tx1 / component.XRsiz);
        tileComponent.tcy1 = Math.ceil(tile.ty1 / component.YRsiz);
        tileComponent.width = tileComponent.tcx1 - tileComponent.tcx0;
        tileComponent.height = tileComponent.tcy1 - tileComponent.tcy0;
        tile.components[i] = tileComponent;
      }
    }
  }
  function getBlocksDimensions(context, component, r) {
    var codOrCoc = component.codingStyleParameters;
    var result = {};
    if (!codOrCoc.entropyCoderWithCustomPrecincts) {
      result.PPx = 15;
      result.PPy = 15;
    } else {
      result.PPx = codOrCoc.precinctsSizes[r].PPx;
      result.PPy = codOrCoc.precinctsSizes[r].PPy;
    }
    // calculate codeblock size as described in section B.7
    result.xcb_ = r > 0 ? Math.min(codOrCoc.xcb, result.PPx - 1) : Math.min(codOrCoc.xcb, result.PPx);
    result.ycb_ = r > 0 ? Math.min(codOrCoc.ycb, result.PPy - 1) : Math.min(codOrCoc.ycb, result.PPy);
    return result;
  }
  function buildPrecincts(context, resolution, dimensions) {
    // Section B.6 Division resolution to precincts
    var precinctWidth = 1 << dimensions.PPx;
    var precinctHeight = 1 << dimensions.PPy;
    // Jasper introduces codeblock groups for mapping each subband codeblocks
    // to precincts. Precinct partition divides a resolution according to width
    // and height parameters. The subband that belongs to the resolution level
    // has a different size than the level, unless it is the zero resolution.

    // From Jasper documentation: jpeg2000.pdf, section K: Tier-2 coding:
    // The precinct partitioning for a particular subband is derived from a
    // partitioning of its parent LL band (i.e., the LL band at the next higher
    // resolution level)... The LL band associated with each resolution level is
    // divided into precincts... Each of the resulting precinct regions is then
    // mapped into its child subbands (if any) at the next lower resolution
    // level. This is accomplished by using the coordinate transformation
    // (u, v) = (ceil(x/2), ceil(y/2)) where (x, y) and (u, v) are the
    // coordinates of a point in the LL band and child subband, respectively.
    var isZeroRes = resolution.resLevel === 0;
    var precinctWidthInSubband = 1 << dimensions.PPx + (isZeroRes ? 0 : -1);
    var precinctHeightInSubband = 1 << dimensions.PPy + (isZeroRes ? 0 : -1);
    var numprecinctswide = resolution.trx1 > resolution.trx0 ? Math.ceil(resolution.trx1 / precinctWidth) - Math.floor(resolution.trx0 / precinctWidth) : 0;
    var numprecinctshigh = resolution.try1 > resolution.try0 ? Math.ceil(resolution.try1 / precinctHeight) - Math.floor(resolution.try0 / precinctHeight) : 0;
    var numprecincts = numprecinctswide * numprecinctshigh;

    resolution.precinctParameters = {
      precinctWidth: precinctWidth,
      precinctHeight: precinctHeight,
      numprecinctswide: numprecinctswide,
      numprecinctshigh: numprecinctshigh,
      numprecincts: numprecincts,
      precinctWidthInSubband: precinctWidthInSubband,
      precinctHeightInSubband: precinctHeightInSubband
    };
  }
  function buildCodeblocks(context, subband, dimensions, index) {
    // Section B.7 Division sub-band into code-blocks
    var xcb_ = dimensions.xcb_;
    var ycb_ = dimensions.ycb_;
    var codeblockWidth = 1 << xcb_;
    var codeblockHeight = 1 << ycb_;
    var cbx0 = subband.tbx0 >> xcb_;
    var cby0 = subband.tby0 >> ycb_;
    var cbx1 = subband.tbx1 + codeblockWidth - 1 >> xcb_;
    var cby1 = subband.tby1 + codeblockHeight - 1 >> ycb_;
    var precinctParameters = subband.resolution.precinctParameters;
    var codeblocks = [];
    var precincts = [];
    var i, j, codeblock, precinctNumber;
    for (j = cby0; j < cby1; j++) {
      for (i = cbx0; i < cbx1; i++) {
        codeblock = {
          cbx: i,
          cby: j,
          tbx0: codeblockWidth * i,
          tby0: codeblockHeight * j,
          tbx1: codeblockWidth * (i + 1),
          tby1: codeblockHeight * (j + 1),
          parentSubband: subband
        };

        codeblock.tbx0_ = Math.max(subband.tbx0, codeblock.tbx0);
        codeblock.tby0_ = Math.max(subband.tby0, codeblock.tby0);
        codeblock.tbx1_ = Math.min(subband.tbx1, codeblock.tbx1);
        codeblock.tby1_ = Math.min(subband.tby1, codeblock.tby1);

        // Calculate precinct number for this codeblock, codeblock position
        // should be relative to its subband, use actual dimension and position
        // See comment about codeblock group width and height
        var pi = Math.floor((codeblock.tbx0_ - subband.tbx0) / precinctParameters.precinctWidthInSubband);
        var pj = Math.floor((codeblock.tby0_ - subband.tby0) / precinctParameters.precinctHeightInSubband);
        precinctNumber = pi + pj * precinctParameters.numprecinctswide;

        codeblock.precinctNumber = precinctNumber;
        codeblock.subbandType = subband.type;
        codeblock.Lblock = 3;

        if (codeblock.tbx1_ <= codeblock.tbx0_ || codeblock.tby1_ <= codeblock.tby0_) {
          continue;
        }
        codeblocks.push(codeblock);
        // building precinct for the sub-band
        var precinct = precincts[precinctNumber];
        if (precinct !== undefined) {
          if (i < precinct.cbxMin) {
            precinct.cbxMin = i;
            precinct.tbxMin_ = codeblock.tbx0_;
          } else if (i > precinct.cbxMax) {
            precinct.cbxMax = i;
            precinct.tbxMax_ = codeblock.tbx1_;
          }
          if (j < precinct.cbyMin) {
            precinct.cbyMin = j;
            precinct.tbyMin_ = codeblock.tby0_;
          } else if (j > precinct.cbyMax) {
            precinct.cbyMax = j;
            precinct.tbyMax_ = codeblock.tby1_;
          }
        } else {
          precincts[precinctNumber] = precinct = {
            cbxMin: i,
            cbyMin: j,
            cbxMax: i,
            cbyMax: j,
            tbxMin_: codeblock.tbx0_,
            tbxMax_: codeblock.tbx1_,
            tbyMin_: codeblock.tby0_,
            tbyMax_: codeblock.tby1_,
            pixelsPrecinct: subband.resolution.pixelsPrecincts[precinctNumber]
          };
        }
        if (precinct['pixelsPrecinct'] === undefined) {
          precinct.pixelsPrecinct = {
            codeblocks: [],
            subbandPrecincts: [],
            hasData: false
          };
          subband.resolution.pixelsPrecincts[precinctNumber] = precinct.pixelsPrecinct;
        }
        codeblock.precinct = precinct;
        var pixelsPrecinct = precinct.pixelsPrecinct;
        pixelsPrecinct.codeblocks.push(codeblock);
        if (pixelsPrecinct.subbandPrecincts[index] === undefined) {
          pixelsPrecinct.subbandPrecincts[index] = precinct;
        }
      }
    }
    subband.codeblockParameters = {
      codeblockWidth: xcb_,
      codeblockHeight: ycb_,
      numcodeblockwide: cbx1 - cbx0 + 1,
      numcodeblockhigh: cby1 - cby0 + 1
    };
    subband.codeblocks = codeblocks;
    subband.subbandPrecincts = precincts;
    subband.codeblocksWithData = [];
  }
  function createPacket(resolution, precinctNumber, layerNumber) {
    // Section B.10.8 Order of info in packet
    // sub-bands already ordered in 'LL', 'HL', 'LH', and 'HH' sequence
    return {
      layerNumber: layerNumber,
      codeblocks: resolution.pixelsPrecincts[precinctNumber].codeblocks
    };
  }
  function LayerResolutionComponentPositionIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var maxDecompositionLevelsCount = 0;
    for (var q = 0; q < componentsCount; q++) {
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
    }

    var l = 0,
        r = 0,
        i = 0,
        k = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.1 Layer-resolution-component-position
      for (; l < layersCount; l++) {
        for (; r <= maxDecompositionLevelsCount; r++) {
          for (; i < componentsCount; i++) {
            var component = tile.components[i];
            if (r > component.codingStyleParameters.decompositionLevelsCount) {
              continue;
            }

            var resolution = component.resolutions[r];
            var numprecincts = resolution.precinctParameters.numprecincts;
            for (; k < numprecincts;) {
              var packet = createPacket(resolution, k, l);
              k++;
              return packet;
            }
            k = 0;
          }
          i = 0;
        }
        r = 0;
      }
      throw new JpxError('Out of packets');
    };
  }
  function ResolutionLayerComponentPositionIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var maxDecompositionLevelsCount = 0;
    for (var q = 0; q < componentsCount; q++) {
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, tile.components[q].codingStyleParameters.decompositionLevelsCount);
    }

    var r = 0,
        l = 0,
        i = 0,
        k = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.2 Resolution-layer-component-position
      for (; r <= maxDecompositionLevelsCount; r++) {
        for (; l < layersCount; l++) {
          for (; i < componentsCount; i++) {
            var component = tile.components[i];
            if (r > component.codingStyleParameters.decompositionLevelsCount) {
              continue;
            }

            var resolution = component.resolutions[r];
            var numprecincts = resolution.precinctParameters.numprecincts;
            for (; k < numprecincts;) {
              var packet = createPacket(resolution, k, l);
              k++;
              return packet;
            }
            k = 0;
          }
          i = 0;
        }
        l = 0;
      }
      throw new JpxError('Out of packets');
    };
  }
  function ResolutionPositionComponentLayerIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var l, r, c, p;
    var maxDecompositionLevelsCount = 0;
    for (c = 0; c < componentsCount; c++) {
      var component = tile.components[c];
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount, component.codingStyleParameters.decompositionLevelsCount);
    }
    var maxNumPrecinctsInLevel = new Int32Array(maxDecompositionLevelsCount + 1);
    for (r = 0; r <= maxDecompositionLevelsCount; ++r) {
      var maxNumPrecincts = 0;
      for (c = 0; c < componentsCount; ++c) {
        var resolutions = tile.components[c].resolutions;
        if (r < resolutions.length) {
          maxNumPrecincts = Math.max(maxNumPrecincts, resolutions[r].precinctParameters.numprecincts);
        }
      }
      maxNumPrecinctsInLevel[r] = maxNumPrecincts;
    }
    l = 0;
    r = 0;
    c = 0;
    p = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.3 Resolution-position-component-layer
      for (; r <= maxDecompositionLevelsCount; r++) {
        for (; p < maxNumPrecinctsInLevel[r]; p++) {
          for (; c < componentsCount; c++) {
            var component = tile.components[c];
            if (r > component.codingStyleParameters.decompositionLevelsCount) {
              continue;
            }
            var resolution = component.resolutions[r];
            var numprecincts = resolution.precinctParameters.numprecincts;
            if (p >= numprecincts) {
              continue;
            }
            for (; l < layersCount;) {
              var packet = createPacket(resolution, p, l);
              l++;
              return packet;
            }
            l = 0;
          }
          c = 0;
        }
        p = 0;
      }
      throw new JpxError('Out of packets');
    };
  }
  function PositionComponentResolutionLayerIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var precinctsSizes = getPrecinctSizesInImageScale(tile);
    var precinctsIterationSizes = precinctsSizes;
    var l = 0,
        r = 0,
        c = 0,
        px = 0,
        py = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.4 Position-component-resolution-layer
      for (; py < precinctsIterationSizes.maxNumHigh; py++) {
        for (; px < precinctsIterationSizes.maxNumWide; px++) {
          for (; c < componentsCount; c++) {
            var component = tile.components[c];
            var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
            for (; r <= decompositionLevelsCount; r++) {
              var resolution = component.resolutions[r];
              var sizeInImageScale = precinctsSizes.components[c].resolutions[r];
              var k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
              if (k === null) {
                continue;
              }
              for (; l < layersCount;) {
                var packet = createPacket(resolution, k, l);
                l++;
                return packet;
              }
              l = 0;
            }
            r = 0;
          }
          c = 0;
        }
        px = 0;
      }
      throw new JpxError('Out of packets');
    };
  }
  function ComponentPositionResolutionLayerIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var precinctsSizes = getPrecinctSizesInImageScale(tile);
    var l = 0,
        r = 0,
        c = 0,
        px = 0,
        py = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.5 Component-position-resolution-layer
      for (; c < componentsCount; ++c) {
        var component = tile.components[c];
        var precinctsIterationSizes = precinctsSizes.components[c];
        var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
        for (; py < precinctsIterationSizes.maxNumHigh; py++) {
          for (; px < precinctsIterationSizes.maxNumWide; px++) {
            for (; r <= decompositionLevelsCount; r++) {
              var resolution = component.resolutions[r];
              var sizeInImageScale = precinctsIterationSizes.resolutions[r];
              var k = getPrecinctIndexIfExist(px, py, sizeInImageScale, precinctsIterationSizes, resolution);
              if (k === null) {
                continue;
              }
              for (; l < layersCount;) {
                var packet = createPacket(resolution, k, l);
                l++;
                return packet;
              }
              l = 0;
            }
            r = 0;
          }
          px = 0;
        }
        py = 0;
      }
      throw new JpxError('Out of packets');
    };
  }
  function getPrecinctIndexIfExist(pxIndex, pyIndex, sizeInImageScale, precinctIterationSizes, resolution) {
    var posX = pxIndex * precinctIterationSizes.minWidth;
    var posY = pyIndex * precinctIterationSizes.minHeight;
    if (posX % sizeInImageScale.width !== 0 || posY % sizeInImageScale.height !== 0) {
      return null;
    }
    var startPrecinctRowIndex = posY / sizeInImageScale.width * resolution.precinctParameters.numprecinctswide;
    return posX / sizeInImageScale.height + startPrecinctRowIndex;
  }
  function getPrecinctSizesInImageScale(tile) {
    var componentsCount = tile.components.length;
    var minWidth = Number.MAX_VALUE;
    var minHeight = Number.MAX_VALUE;
    var maxNumWide = 0;
    var maxNumHigh = 0;
    var sizePerComponent = new Array(componentsCount);
    for (var c = 0; c < componentsCount; c++) {
      var component = tile.components[c];
      var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
      var sizePerResolution = new Array(decompositionLevelsCount + 1);
      var minWidthCurrentComponent = Number.MAX_VALUE;
      var minHeightCurrentComponent = Number.MAX_VALUE;
      var maxNumWideCurrentComponent = 0;
      var maxNumHighCurrentComponent = 0;
      var scale = 1;
      for (var r = decompositionLevelsCount; r >= 0; --r) {
        var resolution = component.resolutions[r];
        var widthCurrentResolution = scale * resolution.precinctParameters.precinctWidth;
        var heightCurrentResolution = scale * resolution.precinctParameters.precinctHeight;
        minWidthCurrentComponent = Math.min(minWidthCurrentComponent, widthCurrentResolution);
        minHeightCurrentComponent = Math.min(minHeightCurrentComponent, heightCurrentResolution);
        maxNumWideCurrentComponent = Math.max(maxNumWideCurrentComponent, resolution.precinctParameters.numprecinctswide);
        maxNumHighCurrentComponent = Math.max(maxNumHighCurrentComponent, resolution.precinctParameters.numprecinctshigh);
        sizePerResolution[r] = {
          width: widthCurrentResolution,
          height: heightCurrentResolution
        };
        scale <<= 1;
      }
      minWidth = Math.min(minWidth, minWidthCurrentComponent);
      minHeight = Math.min(minHeight, minHeightCurrentComponent);
      maxNumWide = Math.max(maxNumWide, maxNumWideCurrentComponent);
      maxNumHigh = Math.max(maxNumHigh, maxNumHighCurrentComponent);
      sizePerComponent[c] = {
        resolutions: sizePerResolution,
        minWidth: minWidthCurrentComponent,
        minHeight: minHeightCurrentComponent,
        maxNumWide: maxNumWideCurrentComponent,
        maxNumHigh: maxNumHighCurrentComponent
      };
    }
    return {
      components: sizePerComponent,
      minWidth: minWidth,
      minHeight: minHeight,
      maxNumWide: maxNumWide,
      maxNumHigh: maxNumHigh
    };
  }
  function buildPackets(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var componentsCount = siz.Csiz;
    // Creating resolutions and sub-bands for each component
    for (var c = 0; c < componentsCount; c++) {
      var component = tile.components[c];
      var decompositionLevelsCount = component.codingStyleParameters.decompositionLevelsCount;
      // Section B.5 Resolution levels and sub-bands
      var resolutions = [];
      var subbands = [];
      var indexInTileComponent = 0;
      for (var r = 0; r <= decompositionLevelsCount; r++) {
        var blocksDimensions = getBlocksDimensions(context, component, r);
        var resolution = {};
        var scale = 1 << decompositionLevelsCount - r;
        resolution.trx0 = Math.ceil(component.tcx0 / scale);
        resolution.try0 = Math.ceil(component.tcy0 / scale);
        resolution.trx1 = Math.ceil(component.tcx1 / scale);
        resolution.try1 = Math.ceil(component.tcy1 / scale);
        resolution.resLevel = r;
        resolution.pixelsPrecincts = [];
        resolution.pixelsPrecinctsWithDecodedCoefficients = [];
        buildPrecincts(context, resolution, blocksDimensions);
        resolutions.push(resolution);

        var subband;
        if (r === 0) {
          // one sub-band (LL) with last decomposition
          subband = {};
          subband.type = 'LL';
          subband.tbx0 = Math.ceil(component.tcx0 / scale);
          subband.tby0 = Math.ceil(component.tcy0 / scale);
          subband.tbx1 = Math.ceil(component.tcx1 / scale);
          subband.tby1 = Math.ceil(component.tcy1 / scale);
          subband.resolution = resolution;
          subband.indexInTileComponent = indexInTileComponent++;
          buildCodeblocks(context, subband, blocksDimensions, 0);
          subbands.push(subband);
          resolution.subbands = [subband];
        } else {
          var bscale = 1 << decompositionLevelsCount - r + 1;
          var resolutionSubbands = [];
          // three sub-bands (HL, LH and HH) with rest of decompositions
          subband = {};
          subband.type = 'HL';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
          subband.tby0 = Math.ceil(component.tcy0 / bscale);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
          subband.tby1 = Math.ceil(component.tcy1 / bscale);
          subband.resolution = resolution;
          subband.indexInTileComponent = indexInTileComponent++;
          buildCodeblocks(context, subband, blocksDimensions, 0);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          subband = {};
          subband.type = 'LH';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale);
          subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale);
          subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
          subband.resolution = resolution;
          subband.indexInTileComponent = indexInTileComponent++;
          buildCodeblocks(context, subband, blocksDimensions, 1);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          subband = {};
          subband.type = 'HH';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
          subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
          subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
          subband.resolution = resolution;
          subband.indexInTileComponent = indexInTileComponent++;
          buildCodeblocks(context, subband, blocksDimensions, 2);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          resolution.subbands = resolutionSubbands;
        }
      }
      component.resolutions = resolutions;
      component.subbands = subbands;
    }
    // Generate the packets sequence
    var progressionOrder = tile.codingStyleDefaultParameters.progressionOrder;
    switch (progressionOrder) {
      case 0:
        tile.packetsIterator = new LayerResolutionComponentPositionIterator(context);
        break;
      case 1:
        tile.packetsIterator = new ResolutionLayerComponentPositionIterator(context);
        break;
      case 2:
        tile.packetsIterator = new ResolutionPositionComponentLayerIterator(context);
        break;
      case 3:
        tile.packetsIterator = new PositionComponentResolutionLayerIterator(context);
        break;
      case 4:
        tile.packetsIterator = new ComponentPositionResolutionLayerIterator(context);
        break;
      default:
        throw new JpxError('Unsupported progression order ' + progressionOrder);
    }
  }
  function parseTilePackets(context, data, offset, dataLength) {
    var position = 0;
    var buffer,
        bufferSize = 0,
        skipNextBit = false;
    function readBits(count) {
      while (bufferSize < count) {
        var b = data[offset + position];
        position++;
        if (skipNextBit) {
          buffer = buffer << 7 | b;
          bufferSize += 7;
          skipNextBit = false;
        } else {
          buffer = buffer << 8 | b;
          bufferSize += 8;
        }
        if (b === 0xFF) {
          skipNextBit = true;
        }
      }
      bufferSize -= count;
      return buffer >>> bufferSize & (1 << count) - 1;
    }
    function skipMarkerIfEqual(value) {
      if (data[offset + position - 1] === 0xFF && data[offset + position] === value) {
        skipBytes(1);
        return true;
      } else if (data[offset + position] === 0xFF && data[offset + position + 1] === value) {
        skipBytes(2);
        return true;
      }
      return false;
    }
    function skipBytes(count) {
      position += count;
    }
    function alignToByte() {
      bufferSize = 0;
      if (skipNextBit) {
        position++;
        skipNextBit = false;
      }
    }
    function readCodingpasses() {
      if (readBits(1) === 0) {
        return 1;
      }
      if (readBits(1) === 0) {
        return 2;
      }
      var value = readBits(2);
      if (value < 3) {
        return value + 3;
      }
      value = readBits(5);
      if (value < 31) {
        return value + 6;
      }
      value = readBits(7);
      return value + 37;
    }
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var sopMarkerUsed = context.COD.sopMarkerUsed;
    var ephMarkerUsed = context.COD.ephMarkerUsed;
    var packetsIterator = tile.packetsIterator;
    while (position < dataLength) {
      alignToByte();
      if (sopMarkerUsed && skipMarkerIfEqual(0x91)) {
        // Skip also marker segment length and packet sequence ID
        skipBytes(4);
      }
      var packet = packetsIterator.nextPacket();
      if (!readBits(1)) {
        continue;
      }
      var layerNumber = packet.layerNumber;
      var queue = [],
          codeblock;
      for (var i = 0, ii = packet.codeblocks.length; i < ii; i++) {
        codeblock = packet.codeblocks[i];
        var precinct = codeblock.precinct;
        var codeblockColumn = codeblock.cbx - precinct.cbxMin;
        var codeblockRow = codeblock.cby - precinct.cbyMin;
        var codeblockIncluded = false;
        var firstTimeInclusion = false;
        var valueReady;
        if (codeblock['included'] !== undefined) {
          codeblockIncluded = !!readBits(1);
        } else {
          // reading inclusion tree
          precinct = codeblock.precinct;
          var inclusionTree, zeroBitPlanesTree;
          if (precinct['inclusionTree'] !== undefined) {
            inclusionTree = precinct.inclusionTree;
          } else {
            // building inclusion and zero bit-planes trees
            var width = precinct.cbxMax - precinct.cbxMin + 1;
            var height = precinct.cbyMax - precinct.cbyMin + 1;
            inclusionTree = new InclusionTree(width, height, layerNumber);
            zeroBitPlanesTree = new TagTree(width, height);
            precinct.inclusionTree = inclusionTree;
            precinct.zeroBitPlanesTree = zeroBitPlanesTree;
          }

          if (inclusionTree.reset(codeblockColumn, codeblockRow, layerNumber)) {
            while (true) {
              if (readBits(1)) {
                valueReady = !inclusionTree.nextLevel();
                if (valueReady) {
                  codeblock.included = true;
                  codeblockIncluded = firstTimeInclusion = true;
                  break;
                }
              } else {
                inclusionTree.incrementValue(layerNumber);
                break;
              }
            }
          }
        }
        if (!codeblockIncluded) {
          continue;
        }
        if (firstTimeInclusion) {
          zeroBitPlanesTree = precinct.zeroBitPlanesTree;
          zeroBitPlanesTree.reset(codeblockColumn, codeblockRow);
          while (true) {
            if (readBits(1)) {
              valueReady = !zeroBitPlanesTree.nextLevel();
              if (valueReady) {
                break;
              }
            } else {
              zeroBitPlanesTree.incrementValue();
            }
          }
          codeblock.zeroBitPlanes = zeroBitPlanesTree.value;
        }
        var codingpasses = readCodingpasses();
        while (readBits(1)) {
          codeblock.Lblock++;
        }
        var codingpassesLog2 = (0, _util.log2)(codingpasses);
        // rounding down log2
        var bits = (codingpasses < 1 << codingpassesLog2 ? codingpassesLog2 - 1 : codingpassesLog2) + codeblock.Lblock;
        var codedDataLength = readBits(bits);
        queue.push({
          codeblock: codeblock,
          codingpasses: codingpasses,
          dataLength: codedDataLength
        });
      }
      alignToByte();
      if (ephMarkerUsed) {
        skipMarkerIfEqual(0x92);
      }
      while (queue.length > 0) {
        var packetItem = queue.shift();
        codeblock = packetItem.codeblock;
        if (codeblock['data'] === undefined || codeblock.dataInvalidationId !== context.dataInvalidationId) {
          codeblock.data = [];
          codeblock.parentSubband.codeblocksWithData.push(codeblock);
          codeblock.parentSubband.dataInvalidationId = context.dataInvalidationId;
          codeblock.dataInvalidationId = context.dataInvalidationId;
        }
        codeblock.data.push({
          data: data,
          start: offset + position,
          end: offset + position + packetItem.dataLength,
          codingpasses: packetItem.codingpasses
        });
        codeblock.precinct.pixelsPrecinct.hasData = true;
        position += packetItem.dataLength;
      }
    }
    return position;
  }
  function getCoefficientsOfResolution(resolution, spqcds, scalarExpounded, precision, guardBits, reversible, segmentationSymbolUsed, regionInLevel, dataInvalidationId) {
    // Allocate space for the whole sublevel.
    var arrayWidth = regionInLevel.x1 - regionInLevel.x0;
    var arrayHeight = regionInLevel.y1 - regionInLevel.y0;
    var coefficients = new Float32Array(arrayWidth * arrayHeight);
    var regionInSubband;
    var regionTmp = { x0: 0, x1: 0, y0: 0, y1: 1 };

    if (resolution.hasDecodedCoefficients && resolution.dataInvalidationId === dataInvalidationId) {

      var isAllCoefficientsCopied = copyDecodedCoefficients(resolution, regionInLevel, coefficients, arrayWidth, dataInvalidationId);

      if (isAllCoefficientsCopied) {
        return coefficients;
      }
    }

    for (var s = 0, ss = resolution.subbands.length; s < ss; s++) {
      var subband = resolution.subbands[s];
      if (subband.dataInvalidationId !== dataInvalidationId) {
        continue;
      }

      var interleave = subband.type !== 'LL';
      var regionInSubband;
      if (!interleave) {
        regionInSubband = regionInLevel;
      } else {
        regionTmp.x0 = (regionInLevel.x0 - resolution.trx0) / 2 + subband.tbx0;
        regionTmp.y0 = (regionInLevel.y0 - resolution.try0) / 2 + subband.tby0;
        regionTmp.x1 = (regionInLevel.x1 - resolution.trx0) / 2 + subband.tbx0;
        regionTmp.y1 = (regionInLevel.y1 - resolution.try0) / 2 + subband.tby0;
        regionInSubband = regionTmp;
      }

      // In the first resolution level, copyCoefficients will fill the
      // whole array with coefficients. In the succeeding passes,
      // copyCoefficients will consecutively fill in the values that belong
      // to the interleaved positions of the HL, LH, and HH coefficients.
      // The LL coefficients will then be interleaved in Transform.iterate().

      var x0 = subband.tbx0;
      var y0 = subband.tby0;
      var width = subband.tbx1 - subband.tbx0;
      var codeblocks = subband.codeblocksWithData;
      var right = subband.type.charAt(0) === 'H' ? 1 : 0;
      var bottom = subband.type.charAt(1) === 'H' ? arrayWidth : 0;
      var interleaveOffset = right + bottom;
      var interleave = subband.type !== 'LL';
      var targetStep = interleave ? 2 : 1;
      var targetRowStep = arrayWidth * targetStep;

      var regionInCodeblock = {
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0
      };

      var mu, epsilon;
      if (!scalarExpounded) {
        // formula E-5
        mu = spqcds[0].mu;
        var r = subband.resolution.resLevel;
        epsilon = spqcds[0].epsilon + (r > 0 ? 1 - r : 0);
      } else {
        var indexInTileComponent = subband.indexInTileComponent;
        mu = spqcds[indexInTileComponent].mu;
        epsilon = spqcds[indexInTileComponent].epsilon;
      }

      var gainLog2 = SubbandsGainLog2[subband.type];

      // calculate quantization coefficient (Section E.1.1.1)
      var delta = reversible ? 1 : Math.pow(2, precision + gainLog2 - epsilon) * (1 + mu / 2048);
      var mb = guardBits + epsilon - 1;

      for (var i = 0, ii = codeblocks.length; i < ii; ++i) {
        var codeblock = codeblocks[i];
        if (codeblock.precinct.pixelsPrecinct.decodedCoefficients && codeblock.dataInvalidationId === dataInvalidationId) {
          continue;
        }

        regionInCodeblock.x0 = Math.max(codeblock.tbx0_, regionInSubband.x0);
        regionInCodeblock.y0 = Math.max(codeblock.tby0_, regionInSubband.y0);
        regionInCodeblock.x1 = Math.min(codeblock.tbx1_, regionInSubband.x1);
        regionInCodeblock.y1 = Math.min(codeblock.tby1_, regionInSubband.y1);
        if (regionInCodeblock.x0 >= regionInCodeblock.x1 || regionInCodeblock.y0 >= regionInCodeblock.y1) {
          continue;
        }

        var targetStartOffset = (regionInCodeblock.x0 - regionInSubband.x0) * targetStep + (regionInCodeblock.y0 - regionInSubband.y0) * targetRowStep + interleaveOffset;

        var blockWidth = codeblock.tbx1_ - codeblock.tbx0_;
        var blockHeight = codeblock.tby1_ - codeblock.tby0_;
        var bitModel, currentCodingpassType;
        bitModel = new BitModel(blockWidth, blockHeight, codeblock.subbandType, codeblock.zeroBitPlanes, mb);
        currentCodingpassType = 2; // first bit plane starts from cleanup

        // collect data
        var data = codeblock.data,
            totalLength = 0,
            codingpasses = 0;
        var j, jj, dataItem;
        for (j = 0, jj = data.length; j < jj; j++) {
          dataItem = data[j];
          totalLength += dataItem.end - dataItem.start;
          codingpasses += dataItem.codingpasses;
        }
        var encodedData = new Uint8Array(totalLength);
        var position = 0;
        for (j = 0, jj = data.length; j < jj; j++) {
          dataItem = data[j];
          var chunk = dataItem.data.subarray(dataItem.start, dataItem.end);
          encodedData.set(chunk, position);
          position += chunk.length;
        }
        // decoding the item
        var decoder = new _arithmetic_decoder.ArithmeticDecoder(encodedData, 0, totalLength);
        bitModel.setDecoder(decoder);

        for (j = 0; j < codingpasses; j++) {
          switch (currentCodingpassType) {
            case 0:
              bitModel.runSignificancePropagationPass();
              break;
            case 1:
              bitModel.runMagnitudeRefinementPass();
              break;
            case 2:
              bitModel.runCleanupPass();
              if (segmentationSymbolUsed) {
                bitModel.checkSegmentationSymbol();
              }
              break;
          }
          currentCodingpassType = (currentCodingpassType + 1) % 3;
        }

        var offset = codeblock.tbx0_ - x0 + (codeblock.tby0_ - y0) * width;
        var sign = bitModel.coefficentsSign;
        var magnitude = bitModel.coefficentsMagnitude;
        var bitsDecoded = bitModel.bitsDecoded;
        var magnitudeCorrection = reversible ? 0 : 0.5;
        var k, n, nb;
        var codeblockRowStart = regionInCodeblock.x0 - codeblock.tbx0_ + (regionInCodeblock.y0 - codeblock.tby0_) * blockWidth;
        var targetRowStart = targetStartOffset;
        // Do the interleaving of Section F.3.3 here, so we do not need
        // to copy later. LL level is not interleaved, just copied.
        for (var j = regionInCodeblock.y0; j < regionInCodeblock.y1; j++) {
          var position = codeblockRowStart;
          var pos = targetRowStart;
          codeblockRowStart += blockWidth;
          targetRowStart += targetRowStep;

          for (k = regionInCodeblock.x0; k < regionInCodeblock.x1; k++) {
            n = magnitude[position];
            if (n !== 0) {
              n = (n + magnitudeCorrection) * delta;
              if (sign[position] !== 0) {
                n = -n;
              }
              nb = bitsDecoded[position];
              if (reversible && nb >= mb) {
                coefficients[pos] = n;
              } else {
                coefficients[pos] = n * (1 << mb - nb);
              }
            }
            offset++;
            position++;
            pos += targetStep;
          }
          offset += width - blockWidth;
        }
      }
    }
    return coefficients;
  }
  function copyDecodedCoefficients(resolution, regionInLevel, coefficients, arrayWidth, dataInvalidationId) {
    var isAllCoefficientsCopied = true;
    var subbands = resolution.subbands;
    var interleave = subbands[0].type !== 'LL';

    var kk = resolution.pixelsPrecinctsWithDecodedCoefficients.length;
    for (var k = 0; k < kk; ++k) {
      var pixelsPrecinct = resolution.pixelsPrecinctsWithDecodedCoefficients[k];
      var precinctRegionInLevel = calculateRegionInLevelOfPixelsPrecinct(pixelsPrecinct, resolution);
      var x0 = Math.max(precinctRegionInLevel.x0, regionInLevel.x0);
      var y0 = Math.max(precinctRegionInLevel.y0, regionInLevel.y0);
      var x1 = Math.min(precinctRegionInLevel.x1, regionInLevel.x1);
      var y1 = Math.min(precinctRegionInLevel.y1, regionInLevel.y1);
      if (x0 >= x1 || y0 >= y1) {
        continue;
      }
      if (pixelsPrecinct.dataInvalidationId !== dataInvalidationId) {
        continue;
      }
      if (!pixelsPrecinct['decodedCoefficients']) {
        if (pixelsPrecinct.hasData) {
          isAllCoefficientsCopied = false;
        }
        continue;
      }
      var decoded = pixelsPrecinct.decodedCoefficients;
      var width = x1 - x0;
      var sourceWidth = precinctRegionInLevel.x1 - precinctRegionInLevel.x0;
      var targetWidth = arrayWidth;
      var source = x0 - precinctRegionInLevel.x0 + (y0 - precinctRegionInLevel.y0) * sourceWidth;
      var target = x0 - regionInLevel.x0 + (y0 - regionInLevel.y0) * targetWidth;

      for (var row = y0; row < y1; ++row) {
        coefficients.set(decoded.subarray(source, source + width), target);
        source += sourceWidth;
        target += targetWidth;
      }
    }

    return isAllCoefficientsCopied;
  }
  function transformTile(context, tile, c) {
    var component = tile.components[c];
    var codingStyleParameters = component.codingStyleParameters;

    var quantizationParameters = component.quantizationParameters;
    var decompositionLevelsCount = codingStyleParameters.decompositionLevelsCount;
    var spqcds = quantizationParameters.SPqcds;
    var scalarExpounded = quantizationParameters.scalarExpounded;
    var guardBits = quantizationParameters.guardBits;
    var segmentationSymbolUsed = codingStyleParameters.segmentationSymbolUsed;
    var precision = context.components[c].precision;

    var reversible = codingStyleParameters.reversibleTransformation;
    var transform = reversible ? new ReversibleTransform() : new IrreversibleTransform();

    var relativeRegionInTile;
    if (context.regionToParse !== undefined) {
      var x1 = Math.min(component.tcx1, context.regionToParse.right);
      var y1 = Math.min(component.tcy1, context.regionToParse.bottom);
      relativeRegionInTile = {
        x0: Math.max(0, context.regionToParse.left - component.tcx0),
        y0: Math.max(0, context.regionToParse.top - component.tcy0),
        x1: x1 - component.tcx0,
        y1: y1 - component.tcy0
      };
    }

    var subbandCoefficients = [];
    var regionInLevel = { x0: 0, y0: 0, x1: 0, y1: 0 };
    var region = { x0: 0, y0: 0, x1: 0, y1: 0 };

    for (var i = 0; i <= decompositionLevelsCount; i++) {
      var resolution = component.resolutions[i];

      var levelWidth = resolution.trx1 - resolution.trx0;
      var levelHeight = resolution.try1 - resolution.try0;

      var regionInLevel;
      if (relativeRegionInTile === undefined) {
        regionInLevel.x0 = resolution.trx0;
        regionInLevel.y0 = resolution.try0;
        regionInLevel.x1 = resolution.trx1;
        regionInLevel.y1 = resolution.try1;
      } else {
        var scale = 1 << decompositionLevelsCount - i;
        var redundantCoeffs = 4;
        regionInLevel.x0 = Math.ceil(relativeRegionInTile.x0 / scale) - redundantCoeffs;
        regionInLevel.y0 = Math.ceil(relativeRegionInTile.y0 / scale) - redundantCoeffs;
        regionInLevel.x1 = Math.ceil(relativeRegionInTile.x1 / scale) + redundantCoeffs;
        regionInLevel.y1 = Math.ceil(relativeRegionInTile.y1 / scale) + redundantCoeffs;

        regionInLevel.x0 = 2 * Math.floor(regionInLevel.x0 / 2) + resolution.trx0;
        regionInLevel.y0 = 2 * Math.floor(regionInLevel.y0 / 2) + resolution.try0;
        regionInLevel.x1 = 2 * Math.floor(regionInLevel.x1 / 2) + resolution.trx0;
        regionInLevel.y1 = 2 * Math.floor(regionInLevel.y1 / 2) + resolution.try0;

        regionInLevel.x0 = Math.max(regionInLevel.x0, resolution.trx0);
        regionInLevel.y0 = Math.max(regionInLevel.y0, resolution.try0);
        regionInLevel.x1 = Math.min(regionInLevel.x1, resolution.trx1);
        regionInLevel.y1 = Math.min(regionInLevel.y1, resolution.try1);
      }

      var coefficients = getCoefficientsOfResolution(resolution, spqcds, scalarExpounded, precision, guardBits, reversible, segmentationSymbolUsed, regionInLevel, context.dataInvalidationId);

      var relativeRegionInLevel = {
        x0: regionInLevel.x0 - resolution.trx0,
        y0: regionInLevel.y0 - resolution.try0,
        x1: regionInLevel.x1 - resolution.trx0,
        y1: regionInLevel.y1 - resolution.try0
      };
      subbandCoefficients.push({
        levelWidth: levelWidth,
        levelHeight: levelHeight,
        items: coefficients,
        relativeRegionInLevel: relativeRegionInLevel
      });
    }
    var result = transform.calculate(subbandCoefficients, component.tcx0, component.tcy0);
    var relativeRegionInLevel = result.relativeRegionInLevel;

    if (context.regionToParse !== undefined) {
      var needCropTile = relativeRegionInTile.x0 !== relativeRegionInLevel.x0 || relativeRegionInTile.y0 !== relativeRegionInLevel.y0 || relativeRegionInTile.x1 !== relativeRegionInLevel.x1 || relativeRegionInTile.y1 !== relativeRegionInLevel.y1;
      if (needCropTile) {
        var croppedItems = cropTile(relativeRegionInTile, relativeRegionInLevel, result.items);
        return {
          left: component.tcx0 + relativeRegionInTile.x0,
          top: component.tcy0 + relativeRegionInTile.y0,
          width: relativeRegionInTile.x1 - relativeRegionInTile.x0,
          height: relativeRegionInTile.y1 - relativeRegionInTile.y0,
          items: croppedItems
        };
      }
    }
    return {
      left: component.tcx0,
      top: component.tcy0,
      width: relativeRegionInLevel.x1 - relativeRegionInLevel.x0,
      height: relativeRegionInLevel.y1 - relativeRegionInLevel.y0,
      items: result.items
    };
  }
  function cropTile(relativeRegionInTile, relativeRegionInLevel, items) {
    // Crop the 4 redundant pixels used for the DWT

    var width = relativeRegionInTile.x1 - relativeRegionInTile.x0;
    var height = relativeRegionInTile.y1 - relativeRegionInTile.y0;
    var sourceWidth = relativeRegionInLevel.x1 - relativeRegionInLevel.x0;

    var result = new Float32Array(width * height);

    var redundantRowsTop = relativeRegionInTile.y0 - relativeRegionInLevel.y0;
    var redundantColumnsLeft = relativeRegionInTile.x0 - relativeRegionInLevel.x0;

    var targetOffset = 0;
    var sourceOffset = redundantColumnsLeft + sourceWidth * redundantRowsTop;
    for (var i = 0; i < height; ++i) {
      var sourceEnd = sourceOffset + width;

      result.set(items.subarray(sourceOffset, sourceEnd), targetOffset);

      sourceOffset += sourceWidth;
      targetOffset += width;
    }

    return result;
  }
  function transformComponents(context) {
    var siz = context.SIZ;
    var components = context.components;
    var componentsCount = siz.Csiz;
    var resultImages = [];
    for (var i = 0, ii = context.tiles.length; i < ii; i++) {
      var tile = context.tiles[i];

      if (context.regionToParse !== undefined) {
        if (context.regionToParse.left >= tile.tx1 || context.regionToParse.top >= tile.ty1 || context.regionToParse.right <= tile.tx0 || context.regionToParse.bottom <= tile.ty0) {
          continue;
        }
      }

      var transformedTiles = [];
      var c;
      for (c = 0; c < componentsCount; c++) {
        transformedTiles[c] = transformTile(context, tile, c);
      }
      var tile0 = transformedTiles[0];
      var out = new Uint8ClampedArray(tile0.items.length * componentsCount);
      var result = {
        left: tile0.left,
        top: tile0.top,
        width: tile0.width,
        height: tile0.height,
        items: out
      };

      // Section G.2.2 Inverse multi component transform
      var shift, offset;
      var pos = 0,
          j,
          jj,
          y0,
          y1,
          y2;
      if (tile.codingStyleDefaultParameters.multipleComponentTransform) {
        var fourComponents = componentsCount === 4;
        var y0items = transformedTiles[0].items;
        var y1items = transformedTiles[1].items;
        var y2items = transformedTiles[2].items;
        var y3items = fourComponents ? transformedTiles[3].items : null;

        // HACK: The multiple component transform formulas below assume that
        // all components have the same precision. With this in mind, we
        // compute shift and offset only once.
        shift = components[0].precision - 8;
        offset = (128 << shift) + 0.5;

        var component0 = tile.components[0];
        var alpha01 = componentsCount - 3;
        jj = y0items.length;
        if (!component0.codingStyleParameters.reversibleTransformation) {
          // inverse irreversible multiple component transform
          for (j = 0; j < jj; j++, pos += alpha01) {
            y0 = y0items[j] + offset;
            y1 = y1items[j];
            y2 = y2items[j];
            out[pos++] = y0 + 1.402 * y2 >> shift;
            out[pos++] = y0 - 0.34413 * y1 - 0.71414 * y2 >> shift;
            out[pos++] = y0 + 1.772 * y1 >> shift;
          }
        } else {
          // inverse reversible multiple component transform
          for (j = 0; j < jj; j++, pos += alpha01) {
            y0 = y0items[j] + offset;
            y1 = y1items[j];
            y2 = y2items[j];
            var g = y0 - (y2 + y1 >> 2);

            out[pos++] = g + y2 >> shift;
            out[pos++] = g >> shift;
            out[pos++] = g + y1 >> shift;
          }
        }
        if (fourComponents) {
          for (j = 0, pos = 3; j < jj; j++, pos += 4) {
            out[pos] = y3items[j] + offset >> shift;
          }
        }
      } else {
        // no multi-component transform
        for (c = 0; c < componentsCount; c++) {
          var items = transformedTiles[c].items;
          shift = components[c].precision - 8;
          offset = (128 << shift) + 0.5;
          for (pos = c, j = 0, jj = items.length; j < jj; j++) {
            out[pos] = items[j] + offset >> shift;
            pos += componentsCount;
          }
        }
      }
      resultImages.push(result);
    }
    return resultImages;
  }
  function initializeTile(context, tileIndex) {
    var siz = context.SIZ;
    var componentsCount = siz.Csiz;
    var tile = context.tiles[tileIndex];
    for (var c = 0; c < componentsCount; c++) {
      var component = tile.components[c];
      var qcdOrQcc = context.currentTile.QCC[c] !== undefined ? context.currentTile.QCC[c] : context.currentTile.QCD;
      component.quantizationParameters = qcdOrQcc;
      var codOrCoc = context.currentTile.COC[c] !== undefined ? context.currentTile.COC[c] : context.currentTile.COD;
      component.codingStyleParameters = codOrCoc;
    }
    tile.codingStyleDefaultParameters = context.currentTile.COD;
  }

  // Section B.10.2 Tag trees
  var TagTree = function TagTreeClosure() {
    function TagTree(width, height) {
      var levelsLength = (0, _util.log2)(Math.max(width, height)) + 1;
      this.levels = [];
      for (var i = 0; i < levelsLength; i++) {
        var level = {
          width: width,
          height: height,
          items: []
        };
        this.levels.push(level);
        width = Math.ceil(width / 2);
        height = Math.ceil(height / 2);
      }
    }
    TagTree.prototype = {
      reset: function TagTree_reset(i, j) {
        var currentLevel = 0,
            value = 0,
            level;
        while (currentLevel < this.levels.length) {
          level = this.levels[currentLevel];
          var index = i + j * level.width;
          if (level.items[index] !== undefined) {
            value = level.items[index];
            break;
          }
          level.index = index;
          i >>= 1;
          j >>= 1;
          currentLevel++;
        }
        currentLevel--;
        level = this.levels[currentLevel];
        level.items[level.index] = value;
        this.currentLevel = currentLevel;
        delete this.value;
      },
      incrementValue: function TagTree_incrementValue() {
        var level = this.levels[this.currentLevel];
        level.items[level.index]++;
      },
      nextLevel: function TagTree_nextLevel() {
        var currentLevel = this.currentLevel;
        var level = this.levels[currentLevel];
        var value = level.items[level.index];
        currentLevel--;
        if (currentLevel < 0) {
          this.value = value;
          return false;
        }

        this.currentLevel = currentLevel;
        level = this.levels[currentLevel];
        level.items[level.index] = value;
        return true;
      }
    };
    return TagTree;
  }();

  var InclusionTree = function InclusionTreeClosure() {
    function InclusionTree(width, height, defaultValue) {
      var levelsLength = (0, _util.log2)(Math.max(width, height)) + 1;
      this.levels = [];
      for (var i = 0; i < levelsLength; i++) {
        var items = new Uint8Array(width * height);
        for (var j = 0, jj = items.length; j < jj; j++) {
          items[j] = defaultValue;
        }

        var level = {
          width: width,
          height: height,
          items: items
        };
        this.levels.push(level);

        width = Math.ceil(width / 2);
        height = Math.ceil(height / 2);
      }
    }
    InclusionTree.prototype = {
      reset: function InclusionTree_reset(i, j, stopValue) {
        var currentLevel = 0;
        while (currentLevel < this.levels.length) {
          var level = this.levels[currentLevel];
          var index = i + j * level.width;
          level.index = index;
          var value = level.items[index];

          if (value === 0xFF) {
            break;
          }

          if (value > stopValue) {
            this.currentLevel = currentLevel;
            // already know about this one, propagating the value to top levels
            this.propagateValues();
            return false;
          }

          i >>= 1;
          j >>= 1;
          currentLevel++;
        }
        this.currentLevel = currentLevel - 1;
        return true;
      },
      incrementValue: function InclusionTree_incrementValue(stopValue) {
        var level = this.levels[this.currentLevel];
        level.items[level.index] = stopValue + 1;
        this.propagateValues();
      },
      propagateValues: function InclusionTree_propagateValues() {
        var levelIndex = this.currentLevel;
        var level = this.levels[levelIndex];
        var currentValue = level.items[level.index];
        while (--levelIndex >= 0) {
          level = this.levels[levelIndex];
          level.items[level.index] = currentValue;
        }
      },
      nextLevel: function InclusionTree_nextLevel() {
        var currentLevel = this.currentLevel;
        var level = this.levels[currentLevel];
        var value = level.items[level.index];
        level.items[level.index] = 0xFF;
        currentLevel--;
        if (currentLevel < 0) {
          return false;
        }

        this.currentLevel = currentLevel;
        level = this.levels[currentLevel];
        level.items[level.index] = value;
        return true;
      }
    };
    return InclusionTree;
  }();

  // Section D. Coefficient bit modeling
  var BitModel = function BitModelClosure() {
    var UNIFORM_CONTEXT = 17;
    var RUNLENGTH_CONTEXT = 18;
    // Table D-1
    // The index is binary presentation: 0dddvvhh, ddd - sum of Di (0..4),
    // vv - sum of Vi (0..2), and hh - sum of Hi (0..2)
    var LLAndLHContextsLabel = new Uint8Array([0, 5, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 1, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8]);
    var HLContextLabel = new Uint8Array([0, 3, 4, 0, 5, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 1, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8]);
    var HHContextLabel = new Uint8Array([0, 1, 2, 0, 1, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 0, 3, 4, 5, 0, 4, 5, 5, 0, 5, 5, 5, 0, 0, 0, 0, 0, 6, 7, 7, 0, 7, 7, 7, 0, 7, 7, 7, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8]);

    function BitModel(width, height, subband, zeroBitPlanes, mb) {
      this.width = width;
      this.height = height;

      this.contextLabelTable = subband === 'HH' ? HHContextLabel : subband === 'HL' ? HLContextLabel : LLAndLHContextsLabel;

      var coefficientCount = width * height;

      // coefficients outside the encoding region treated as insignificant
      // add border state cells for significanceState
      this.neighborsSignificance = new Uint8Array(coefficientCount);
      this.coefficentsSign = new Uint8Array(coefficientCount);
      this.coefficentsMagnitude = mb > 14 ? new Uint32Array(coefficientCount) : mb > 6 ? new Uint16Array(coefficientCount) : new Uint8Array(coefficientCount);
      this.processingFlags = new Uint8Array(coefficientCount);

      var bitsDecoded = new Uint8Array(coefficientCount);
      if (zeroBitPlanes !== 0) {
        for (var i = 0; i < coefficientCount; i++) {
          bitsDecoded[i] = zeroBitPlanes;
        }
      }
      this.bitsDecoded = bitsDecoded;

      this.reset();
    }

    BitModel.prototype = {
      setDecoder: function BitModel_setDecoder(decoder) {
        this.decoder = decoder;
      },
      reset: function BitModel_reset() {
        // We have 17 contexts that are accessed via context labels,
        // plus the uniform and runlength context.
        this.contexts = new Int8Array(19);

        // Contexts are packed into 1 byte:
        // highest 7 bits carry the index, lowest bit carries mps
        this.contexts[0] = 4 << 1 | 0;
        this.contexts[UNIFORM_CONTEXT] = 46 << 1 | 0;
        this.contexts[RUNLENGTH_CONTEXT] = 3 << 1 | 0;
      },
      setNeighborsSignificance: function BitModel_setNeighborsSignificance(row, column, index) {
        var neighborsSignificance = this.neighborsSignificance;
        var width = this.width,
            height = this.height;
        var left = column > 0;
        var right = column + 1 < width;
        var i;

        if (row > 0) {
          i = index - width;
          if (left) {
            neighborsSignificance[i - 1] += 0x10;
          }
          if (right) {
            neighborsSignificance[i + 1] += 0x10;
          }
          neighborsSignificance[i] += 0x04;
        }

        if (row + 1 < height) {
          i = index + width;
          if (left) {
            neighborsSignificance[i - 1] += 0x10;
          }
          if (right) {
            neighborsSignificance[i + 1] += 0x10;
          }
          neighborsSignificance[i] += 0x04;
        }

        if (left) {
          neighborsSignificance[index - 1] += 0x01;
        }
        if (right) {
          neighborsSignificance[index + 1] += 0x01;
        }
        neighborsSignificance[index] |= 0x80;
      },
      runSignificancePropagationPass: function BitModel_runSignificancePropagationPass() {
        var decoder = this.decoder;
        var width = this.width,
            height = this.height;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var coefficentsSign = this.coefficentsSign;
        var neighborsSignificance = this.neighborsSignificance;
        var processingFlags = this.processingFlags;
        var contexts = this.contexts;
        var labels = this.contextLabelTable;
        var bitsDecoded = this.bitsDecoded;
        var processedInverseMask = ~1;
        var processedMask = 1;
        var firstMagnitudeBitMask = 2;

        for (var i0 = 0; i0 < height; i0 += 4) {
          for (var j = 0; j < width; j++) {
            var index = i0 * width + j;
            for (var i1 = 0; i1 < 4; i1++, index += width) {
              var i = i0 + i1;
              if (i >= height) {
                break;
              }
              // clear processed flag first
              processingFlags[index] &= processedInverseMask;

              if (coefficentsMagnitude[index] || !neighborsSignificance[index]) {
                continue;
              }

              var contextLabel = labels[neighborsSignificance[index]];
              var decision = decoder.readBit(contexts, contextLabel);
              if (decision) {
                var sign = this.decodeSignBit(i, j, index);
                coefficentsSign[index] = sign;
                coefficentsMagnitude[index] = 1;
                this.setNeighborsSignificance(i, j, index);
                processingFlags[index] |= firstMagnitudeBitMask;
              }
              bitsDecoded[index]++;
              processingFlags[index] |= processedMask;
            }
          }
        }
      },
      decodeSignBit: function BitModel_decodeSignBit(row, column, index) {
        var width = this.width,
            height = this.height;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var coefficentsSign = this.coefficentsSign;
        var contribution, sign0, sign1, significance1;
        var contextLabel, decoded;

        // calculate horizontal contribution
        significance1 = column > 0 && coefficentsMagnitude[index - 1] !== 0;
        if (column + 1 < width && coefficentsMagnitude[index + 1] !== 0) {
          sign1 = coefficentsSign[index + 1];
          if (significance1) {
            sign0 = coefficentsSign[index - 1];
            contribution = 1 - sign1 - sign0;
          } else {
            contribution = 1 - sign1 - sign1;
          }
        } else if (significance1) {
          sign0 = coefficentsSign[index - 1];
          contribution = 1 - sign0 - sign0;
        } else {
          contribution = 0;
        }
        var horizontalContribution = 3 * contribution;

        // calculate vertical contribution and combine with the horizontal
        significance1 = row > 0 && coefficentsMagnitude[index - width] !== 0;
        if (row + 1 < height && coefficentsMagnitude[index + width] !== 0) {
          sign1 = coefficentsSign[index + width];
          if (significance1) {
            sign0 = coefficentsSign[index - width];
            contribution = 1 - sign1 - sign0 + horizontalContribution;
          } else {
            contribution = 1 - sign1 - sign1 + horizontalContribution;
          }
        } else if (significance1) {
          sign0 = coefficentsSign[index - width];
          contribution = 1 - sign0 - sign0 + horizontalContribution;
        } else {
          contribution = horizontalContribution;
        }

        if (contribution >= 0) {
          contextLabel = 9 + contribution;
          decoded = this.decoder.readBit(this.contexts, contextLabel);
        } else {
          contextLabel = 9 - contribution;
          decoded = this.decoder.readBit(this.contexts, contextLabel) ^ 1;
        }
        return decoded;
      },
      runMagnitudeRefinementPass: function BitModel_runMagnitudeRefinementPass() {
        var decoder = this.decoder;
        var width = this.width,
            height = this.height;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var neighborsSignificance = this.neighborsSignificance;
        var contexts = this.contexts;
        var bitsDecoded = this.bitsDecoded;
        var processingFlags = this.processingFlags;
        var processedMask = 1;
        var firstMagnitudeBitMask = 2;
        var length = width * height;
        var width4 = width * 4;

        for (var index0 = 0, indexNext; index0 < length; index0 = indexNext) {
          indexNext = Math.min(length, index0 + width4);
          for (var j = 0; j < width; j++) {
            for (var index = index0 + j; index < indexNext; index += width) {

              // significant but not those that have just become
              if (!coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
                continue;
              }

              var contextLabel = 16;
              if ((processingFlags[index] & firstMagnitudeBitMask) !== 0) {
                processingFlags[index] ^= firstMagnitudeBitMask;
                // first refinement
                var significance = neighborsSignificance[index] & 127;
                contextLabel = significance === 0 ? 15 : 14;
              }

              var bit = decoder.readBit(contexts, contextLabel);
              coefficentsMagnitude[index] = coefficentsMagnitude[index] << 1 | bit;
              bitsDecoded[index]++;
              processingFlags[index] |= processedMask;
            }
          }
        }
      },
      runCleanupPass: function BitModel_runCleanupPass() {
        var decoder = this.decoder;
        var width = this.width,
            height = this.height;
        var neighborsSignificance = this.neighborsSignificance;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var coefficentsSign = this.coefficentsSign;
        var contexts = this.contexts;
        var labels = this.contextLabelTable;
        var bitsDecoded = this.bitsDecoded;
        var processingFlags = this.processingFlags;
        var processedMask = 1;
        var firstMagnitudeBitMask = 2;
        var oneRowDown = width;
        var twoRowsDown = width * 2;
        var threeRowsDown = width * 3;
        var iNext;
        for (var i0 = 0; i0 < height; i0 = iNext) {
          iNext = Math.min(i0 + 4, height);
          var indexBase = i0 * width;
          var checkAllEmpty = i0 + 3 < height;
          for (var j = 0; j < width; j++) {
            var index0 = indexBase + j;
            // using the property: labels[neighborsSignificance[index]] === 0
            // when neighborsSignificance[index] === 0
            var allEmpty = checkAllEmpty && processingFlags[index0] === 0 && processingFlags[index0 + oneRowDown] === 0 && processingFlags[index0 + twoRowsDown] === 0 && processingFlags[index0 + threeRowsDown] === 0 && neighborsSignificance[index0] === 0 && neighborsSignificance[index0 + oneRowDown] === 0 && neighborsSignificance[index0 + twoRowsDown] === 0 && neighborsSignificance[index0 + threeRowsDown] === 0;
            var i1 = 0,
                index = index0;
            var i = i0,
                sign;
            if (allEmpty) {
              var hasSignificantCoefficent = decoder.readBit(contexts, RUNLENGTH_CONTEXT);
              if (!hasSignificantCoefficent) {
                bitsDecoded[index0]++;
                bitsDecoded[index0 + oneRowDown]++;
                bitsDecoded[index0 + twoRowsDown]++;
                bitsDecoded[index0 + threeRowsDown]++;
                continue; // next column
              }
              i1 = decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
              if (i1 !== 0) {
                i = i0 + i1;
                index += i1 * width;
              }

              sign = this.decodeSignBit(i, j, index);
              coefficentsSign[index] = sign;
              coefficentsMagnitude[index] = 1;
              this.setNeighborsSignificance(i, j, index);
              processingFlags[index] |= firstMagnitudeBitMask;

              index = index0;
              for (var i2 = i0; i2 <= i; i2++, index += width) {
                bitsDecoded[index]++;
              }

              i1++;
            }
            for (i = i0 + i1; i < iNext; i++, index += width) {
              if (coefficentsMagnitude[index] || (processingFlags[index] & processedMask) !== 0) {
                continue;
              }

              var contextLabel = labels[neighborsSignificance[index]];
              var decision = decoder.readBit(contexts, contextLabel);
              if (decision === 1) {
                sign = this.decodeSignBit(i, j, index);
                coefficentsSign[index] = sign;
                coefficentsMagnitude[index] = 1;
                this.setNeighborsSignificance(i, j, index);
                processingFlags[index] |= firstMagnitudeBitMask;
              }
              bitsDecoded[index]++;
            }
          }
        }
      },
      checkSegmentationSymbol: function BitModel_checkSegmentationSymbol() {
        var decoder = this.decoder;
        var contexts = this.contexts;
        var symbol = decoder.readBit(contexts, UNIFORM_CONTEXT) << 3 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 2 | decoder.readBit(contexts, UNIFORM_CONTEXT) << 1 | decoder.readBit(contexts, UNIFORM_CONTEXT);
        if (symbol !== 0xA) {
          throw new JpxError('Invalid segmentation symbol');
        }
      }
    };

    return BitModel;
  }();

  // Section F, Discrete wavelet transformation
  var Transform = function TransformClosure() {
    function Transform() {}

    Transform.prototype.calculate = function transformCalculate(subbands, u0, v0) {
      var ll = subbands[0];
      for (var i = 1, ii = subbands.length; i < ii; i++) {
        ll = this.iterate(ll, subbands[i], u0, v0);
      }
      return ll;
    };
    Transform.prototype.extend = function extend(buffer, offset, size) {
      // Section F.3.7 extending... using max extension of 4
      var i1 = offset - 1,
          j1 = offset + 1;
      var i2 = offset + size - 2,
          j2 = offset + size;
      buffer[i1--] = buffer[j1++];
      buffer[j2++] = buffer[i2--];
      buffer[i1--] = buffer[j1++];
      buffer[j2++] = buffer[i2--];
      buffer[i1--] = buffer[j1++];
      buffer[j2++] = buffer[i2--];
      buffer[i1] = buffer[j1];
      buffer[j2] = buffer[i2];
    };
    Transform.prototype.iterate = function Transform_iterate(ll, hl_lh_hh, u0, v0) {
      var levelRegion = hl_lh_hh.relativeRegionInLevel;
      if (ll.relativeRegionInLevel.x0 * 2 > levelRegion.x0 || ll.relativeRegionInLevel.y0 * 2 > levelRegion.y0 || ll.relativeRegionInLevel.x1 * 2 < levelRegion.x1 || ll.relativeRegionInLevel.y1 * 2 < levelRegion.y1) {
        throw new Error('JPX Error: region in LL is smaller than region in ' + 'higher resolution level');
      }
      if (levelRegion.x0 % 2 !== 0 || levelRegion.y0 % 2 !== 0) {
        throw new Error('JPX Error: region in HL/LH/HH subbands begins in ' + 'odd coefficients');
      }
      var llItems = ll.items;
      var width = levelRegion.x1 - levelRegion.x0;
      var height = levelRegion.y1 - levelRegion.y0;
      var llWidth = ll.relativeRegionInLevel.x1 - ll.relativeRegionInLevel.x0;
      var llOffsetX = levelRegion.x0 / 2 - ll.relativeRegionInLevel.x0;
      var llOffsetY = levelRegion.y0 / 2 - ll.relativeRegionInLevel.y0;
      var llOffset = llOffsetX + llOffsetY * llWidth;
      var items = hl_lh_hh.items;
      var i, j, k, l, u, v;

      // Interleave LL according to Section F.3.3
      for (i = 0; i < height; i += 2) {
        l = i * width;
        k = llOffset + llWidth * i / 2;
        for (j = 0; j < width; j += 2, k++, l += 2) {
          items[l] = llItems[k];
        }
      }
      // The LL band is not needed anymore.
      llItems = ll.items = null;

      var bufferPadding = 4;
      var rowBuffer = new Float32Array(width + 2 * bufferPadding);

      // Section F.3.4 HOR_SR
      if (width === 1) {
        // if width = 1, when u0 even keep items as is, when odd divide by 2
        if ((u0 & 1) !== 0) {
          for (v = 0, k = 0; v < height; v++, k += width) {
            items[k] *= 0.5;
          }
        }
      } else {
        for (v = 0, k = 0; v < height; v++, k += width) {
          rowBuffer.set(items.subarray(k, k + width), bufferPadding);

          this.extend(rowBuffer, bufferPadding, width);
          this.filter(rowBuffer, bufferPadding, width);

          items.set(rowBuffer.subarray(bufferPadding, bufferPadding + width), k);
        }
      }

      // Accesses to the items array can take long, because it may not fit into
      // CPU cache and has to be fetched from main memory. Since subsequent
      // accesses to the items array are not local when reading columns, we
      // have a cache miss every time. To reduce cache misses, get up to
      // 'numBuffers' items at a time and store them into the individual
      // buffers. The colBuffers should be small enough to fit into CPU cache.
      var numBuffers = 16;
      var colBuffers = [];
      for (i = 0; i < numBuffers; i++) {
        colBuffers.push(new Float32Array(height + 2 * bufferPadding));
      }
      var b,
          currentBuffer = 0;
      ll = bufferPadding + height;

      // Section F.3.5 VER_SR
      if (height === 1) {
        // if height = 1, when v0 even keep items as is, when odd divide by 2
        if ((v0 & 1) !== 0) {
          for (u = 0; u < width; u++) {
            items[u] *= 0.5;
          }
        }
      } else {
        for (u = 0; u < width; u++) {
          // if we ran out of buffers, copy several image columns at once
          if (currentBuffer === 0) {
            numBuffers = Math.min(width - u, numBuffers);
            for (k = u, l = bufferPadding; l < ll; k += width, l++) {
              for (b = 0; b < numBuffers; b++) {
                colBuffers[b][l] = items[k + b];
              }
            }
            currentBuffer = numBuffers;
          }

          currentBuffer--;
          var buffer = colBuffers[currentBuffer];
          this.extend(buffer, bufferPadding, height);
          this.filter(buffer, bufferPadding, height);

          // If this is last buffer in this group of buffers, flush all buffers.
          if (currentBuffer === 0) {
            k = u - numBuffers + 1;
            for (l = bufferPadding; l < ll; k += width, l++) {
              for (b = 0; b < numBuffers; b++) {
                items[k + b] = colBuffers[b][l];
              }
            }
          }
        }
      }

      return {
        relativeRegionInLevel: levelRegion,
        width: width,
        height: height,
        items: items
      };
    };
    return Transform;
  }();

  // Section 3.8.2 Irreversible 9-7 filter
  var IrreversibleTransform = function IrreversibleTransformClosure() {
    function IrreversibleTransform() {
      Transform.call(this);
    }

    IrreversibleTransform.prototype = Object.create(Transform.prototype);
    IrreversibleTransform.prototype.filter = function irreversibleTransformFilter(x, offset, length) {
      var len = length >> 1;
      offset = offset | 0;
      var j, n, current, next;

      var alpha = -1.586134342059924;
      var beta = -0.052980118572961;
      var gamma = 0.882911075530934;
      var delta = 0.443506852043971;
      var K = 1.230174104914001;
      var K_ = 1 / K;

      // step 1 is combined with step 3

      // step 2
      j = offset - 3;
      for (n = len + 4; n--; j += 2) {
        x[j] *= K_;
      }

      // step 1 & 3
      j = offset - 2;
      current = delta * x[j - 1];
      for (n = len + 3; n--; j += 2) {
        next = delta * x[j + 1];
        x[j] = K * x[j] - current - next;
        if (n--) {
          j += 2;
          current = delta * x[j + 1];
          x[j] = K * x[j] - current - next;
        } else {
          break;
        }
      }

      // step 4
      j = offset - 1;
      current = gamma * x[j - 1];
      for (n = len + 2; n--; j += 2) {
        next = gamma * x[j + 1];
        x[j] -= current + next;
        if (n--) {
          j += 2;
          current = gamma * x[j + 1];
          x[j] -= current + next;
        } else {
          break;
        }
      }

      // step 5
      j = offset;
      current = beta * x[j - 1];
      for (n = len + 1; n--; j += 2) {
        next = beta * x[j + 1];
        x[j] -= current + next;
        if (n--) {
          j += 2;
          current = beta * x[j + 1];
          x[j] -= current + next;
        } else {
          break;
        }
      }

      // step 6
      if (len !== 0) {
        j = offset + 1;
        current = alpha * x[j - 1];
        for (n = len; n--; j += 2) {
          next = alpha * x[j + 1];
          x[j] -= current + next;
          if (n--) {
            j += 2;
            current = alpha * x[j + 1];
            x[j] -= current + next;
          } else {
            break;
          }
        }
      }
    };

    return IrreversibleTransform;
  }();

  // Section 3.8.1 Reversible 5-3 filter
  var ReversibleTransform = function ReversibleTransformClosure() {
    function ReversibleTransform() {
      Transform.call(this);
    }

    ReversibleTransform.prototype = Object.create(Transform.prototype);
    ReversibleTransform.prototype.filter = function reversibleTransformFilter(x, offset, length) {
      var len = length >> 1;
      offset = offset | 0;
      var j, n;

      for (j = offset, n = len + 1; n--; j += 2) {
        x[j] -= x[j - 1] + x[j + 1] + 2 >> 2;
      }

      for (j = offset + 1, n = len; n--; j += 2) {
        x[j] += x[j - 1] + x[j + 1] >> 1;
      }
    };

    return ReversibleTransform;
  }();

  return JpxImage;
}();

exports.JpxImage = JpxImage;

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _jpx = __webpack_require__(2);

module.exports = PdfjsJpxContextPool;

function PdfjsJpxContextPool() {
    this._image = new _jpx.JpxImage();
    this._cachedContexts = [];
}

Object.defineProperty(PdfjsJpxContextPool.prototype, 'image', { get: function get() {
        return this._image;
    } });

PdfjsJpxContextPool.prototype.getContext = function getContext(headersCodestream) {
    var contextsOfSameLength = this._cachedContexts[headersCodestream.length];
    if (!contextsOfSameLength) {
        contextsOfSameLength = [];
        this._cachedContexts[headersCodestream.length] = contextsOfSameLength;
    }

    var contextIndex = 0;
    var isMatchingContext = false;
    while (contextIndex < contextsOfSameLength.length && !isMatchingContext) {
        var codestream = contextsOfSameLength[contextIndex].codestream;
        var i = 0;
        while (i < codestream.length && codestream[i] === headersCodestream[i]) {
            ++i;
        }

        isMatchingContext = i === codestream.length;
        ++contextIndex;
    }

    var currentContext;
    if (isMatchingContext) {
        currentContext = contextsOfSameLength[contextIndex - 1].context;
        this._image.invalidateData(currentContext);
    } else {
        currentContext = this._image.parseCodestream(headersCodestream, 0, headersCodestream.length, { isOnlyParseHeaders: true });
        contextsOfSameLength.push({
            codestream: headersCodestream,
            context: currentContext
        });
    }

    return currentContext;
};

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports.JpipImage = __webpack_require__(5);
module.exports.j2kExceptions = jGlobals.j2kExceptions;
module.exports.jpipExceptions = jGlobals.jpipExceptions;
module.exports.Internals = {
    PdfjsJpxDecoderLegacy: __webpack_require__(43),
    PdfjsJpxPixelsDecoder: __webpack_require__(46),
    PdfjsJpxCoefficientsDecoder: __webpack_require__(47),
    jpipRuntimeFactory: __webpack_require__(1),
    jGlobals: jGlobals
};

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jpipFactory = __webpack_require__(1);
var jGlobals = __webpack_require__(0);

module.exports = JpipImage;

var WORKER_TYPE_PIXELS = 1;
var WORKER_TYPE_COEFFS = 2;

var TASK_ABORTED_RESULT_PLACEHOLDER = 'aborted';

function JpipImage(arg, progressiveness) {
    var jpipObjects;
    if (arg && arg.jpipFactory) {
        jpipObjects = arg;
    } else {
        if (!arg || !arg.url) {
            throw new jGlobals.jpipExceptions.ArgumentException('options.url', undefined);
        }
        jpipObjects = createJpipObjects( /*fetcherOptionsArg=*/arg);
    }

    var progressivenessModified;

    var imageParams = null;
    var levelCalculator = null;

    // NOTE: Proxying fetcher to web worker might boost performance
    var fetcher = jpipFactory.createFetcher(jpipObjects.databinsSaver, jpipObjects.fetcherSharedObjects, jpipObjects.fetcherOptions);

    this.nonProgressive = function nonProgressive(quality) {
        var qualityModified = quality || 'max';
        return this.customProgressive([{
            minNumQualityLayers: qualityModified,
            forceMaxQuality: 'force'
        }]);
    };

    this.autoProgressive = function autoProgressive(maxQuality) {
        var autoProgressiveness = this.getAutomaticProgressiveness(maxQuality);
        return this.customProgressive(autoProgressiveness);
    };

    this.customProgressive = function customProgressive(customProgressiveness) {
        var customProgressivenessModified = jpipObjects.paramsModifier.modifyCustomProgressiveness(customProgressiveness);
        return new JpipImage(jpipObjects, customProgressivenessModified);
    };

    this.opened = function opened(imageDecoder) {
        imageParams = imageDecoder.getImageParams();
    };

    this.getLevelCalculator = getLevelCalculator;

    this.getDecoderWorkersInputRetreiver = function getDecoderWorkersInputRetreiver() {
        return this;
    };

    this.getFetcher = function getFetcher() {
        return fetcher;
    };

    this.getWorkerTypeOptions = function getWorkerTypeOptions(workerType) {
        switch (workerType) {
            case WORKER_TYPE_PIXELS:
                return {
                    ctorName: 'webjpip.Internals.PdfjsJpxPixelsDecoder',
                    ctorArgs: [],
                    scriptsToImport: [getScriptName(new Error())],
                    pathToTransferablesInPromiseResult: [[0, 'data', 'buffer']]
                };
            case WORKER_TYPE_COEFFS:
                var codestreamTransferable = [0, 'headersCodestream', 'buffer'];
                var codeblockTransferable = [0, 'codeblocksData', 'data', 'buffer'];
                return {
                    ctorName: 'webjpip.Internals.PdfjsJpxCoefficientsDecoder',
                    ctorArgs: [],
                    scriptsToImport: [getScriptName(new Error())],
                    transferables: [codestreamTransferable, codeblockTransferable],
                    pathToTransferablesInPromiseResult: [[0, 'coefficients', 'buffer']]
                };
            default:
                throw new jGlobals.jpipExceptions.InternalErrorException('webjpip error: Unexpected worker type in ' + 'getWorkerTypeOptions ' + workerType);
        }
    };

    this.getKeyAsString = function getKeyAsString(key) {
        if (key.taskType === 'COEFFS') {
            return 'C:' + key.inClassIndex;
        } else {
            var partParams = jpipObjects.paramsModifier.modifyCodestreamPartParams( /*codestreamTaskParams=*/key);
            return 'P:xmin' + partParams.minX + 'ymin' + partParams.minY + 'xmax' + partParams.maxXExclusive + 'ymax' + partParams.maxYExclusive + 'r' + partParams.level;
        }
    };

    this.taskStarted = function taskStarted(task) {
        validateProgressiveness();
        if (task.key.taskType === 'COEFFS') {
            startCoefficientsTask(task);
        } else {
            startPixelsTask(task);
        }
    };

    function createJpipObjects(fetcherOptionsArg) {
        var databinsSaver = jpipFactory.createDatabinsSaver( /*isJpipTilepartStream=*/false);
        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var markersParser = jpipFactory.createMarkersParser(mainHeaderDatabin);
        var offsetsCalculator = jpipFactory.createOffsetsCalculator(mainHeaderDatabin, markersParser);
        var structureParser = jpipFactory.createStructureParser(databinsSaver, markersParser, offsetsCalculator);

        var progressionOrder = 'RPCL';
        var codestreamStructure = jpipFactory.createCodestreamStructure(structureParser, progressionOrder);

        var qualityLayersCache = jpipFactory.createQualityLayersCache(codestreamStructure);

        var headerModifier = jpipFactory.createHeaderModifier(offsetsCalculator, progressionOrder);
        var reconstructor = jpipFactory.createCodestreamReconstructor(databinsSaver, headerModifier, qualityLayersCache);
        var packetsDataCollector = jpipFactory.createPacketsDataCollector(databinsSaver, qualityLayersCache);

        var paramsModifier = jpipFactory.createRequestParamsModifier(codestreamStructure);

        return {
            reconstructor: reconstructor,
            packetsDataCollector: packetsDataCollector,
            qualityLayersCache: qualityLayersCache,
            codestreamStructure: codestreamStructure,
            databinsSaver: databinsSaver,
            paramsModifier: paramsModifier,
            fetcherSharedObjects: {},
            fetcherOptions: fetcherOptionsArg,
            jpipFactory: jpipFactory
        };
    }

    function validateProgressiveness() {
        if (!progressivenessModified) {
            progressivenessModified = progressiveness ? jpipObjects.paramsModifier.modifyCustomProgressiveness(progressiveness) : jpipObjects.paramsModifier.getAutomaticProgressiveness();

            fetcher.setProgressiveness(progressivenessModified);
        }
    }

    function startPixelsTask(task) {
        var params = jpipObjects.paramsModifier.modifyCodestreamPartParams( /*codestreamTaskParams=*/task.key);
        var codestreamPart = jpipFactory.createParamsCodestreamPart(params, jpipObjects.codestreamStructure);

        var qualityWaiter;
        var dependencies = 0;
        var dependencyIndexByInClassIndex = [];

        task.on('dependencyTaskData', function (data, dependencyKey) {
            var index = dependencyIndexByInClassIndex[dependencyKey.inClassIndex];
            qualityWaiter.precinctQualityLayerReached(dependencyKey.inClassIndex, data.minQuality);
        });

        var isEnded = false;
        task.on('statusUpdated', function (status) {
            if (!isEnded && !status.isWaitingForWorkerResult && status.terminatedDependsTasks === status.dependsTasks) {

                throw new jGlobals.jpipExceptions.InternalErrorException('jpip error: Unexpected unended task without pending depend tasks');
            }
        });

        task.on('custom', function (customEventName) {
            if (customEventName === 'aborting') {
                taskEnded();
            }
        });

        qualityWaiter = jpipFactory.createQualityWaiter(codestreamPart, progressivenessModified,
        /*maxQuality=*/0, // TODO: Eliminate this unused argument
        qualityLayerReachedCallback, jpipObjects.codestreamStructure, jpipObjects.databinsSaver, startTrackPrecinctCallback);

        qualityWaiter.register();

        function startTrackPrecinctCallback(precinctDatabin, qualityInTile, precinctIterator, inClassIndex, tileStructure) {

            dependencyIndexByInClassIndex[inClassIndex] = dependencies++;

            var precinctIndex = tileStructure.precinctPositionToIndexInComponentResolution(precinctIterator);

            // Depends on precincts tasks
            task.registerTaskDependency({
                taskType: 'COEFFS',
                tileIndex: precinctIterator.tileIndex,
                resolutionLevel: precinctIterator.resolutionLevel,
                precinctX: precinctIterator.precinctX,
                precinctY: precinctIterator.precinctY,
                component: precinctIterator.component,
                inClassIndex: inClassIndex,
                precinctIndexInComponentResolution: precinctIndex
            });
        }

        var headersCodestream = null;
        var offsetInRegion = null;
        var imageTilesX;
        var tilesBounds;

        function qualityLayerReachedCallback() {
            if (headersCodestream === null) {
                headersCodestream = jpipObjects.reconstructor.createHeadersCodestream(codestreamPart);
                offsetInRegion = getOffsetInRegion(codestreamPart, params);
                imageTilesX = jpipObjects.codestreamStructure.getNumTilesX();
                tilesBounds = codestreamPart.tilesBounds;
            }

            // TODO: Aggregate results to support 'forceAll'
            var stage = qualityWaiter.getProgressiveStagesFinished();
            var canSkip = progressivenessModified[stage - 1].force === 'force' || progressivenessModified[stage - 1].force === 'forceAll';
            task.dataReady({
                headersCodestream: headersCodestream,
                offsetInRegion: offsetInRegion,
                imageTilesX: imageTilesX,
                tilesBounds: tilesBounds,
                precinctCoefficients: task.dependTaskResults // NOTE: dependTaskResults might be changed while work (passed by ref)
            }, WORKER_TYPE_PIXELS, canSkip);

            if (qualityWaiter.isDone()) {
                taskEnded();
                task.terminate();
            }
        }

        function taskEnded() {
            if (!isEnded) {
                isEnded = true;
                qualityWaiter.unregister();
            }
        }
    }

    function startCoefficientsTask(task) {
        var codestreamPart = jpipFactory.createPrecinctCodestreamPart(getLevelCalculator(), jpipObjects.codestreamStructure.getTileStructure(task.key.tileIndex), task.key.tileIndex, task.key.component, task.key.resolutionLevel, task.key.precinctX, task.key.precinctY);

        task.on('custom', function (customEventName) {
            if (customEventName === 'aborting') {
                taskEnded();
            }
        });

        var context = jpipFactory.createImageDataContext(jpipObjects, codestreamPart, task.key.maxQuality, // TODO: Eliminate this unused argument
        progressivenessModified);

        var hadData = false;
        var isTerminated = false;

        context.on('data', onData);
        if (context.getProgressiveStagesFinished() > 0) {
            onData(context);
        }

        function onData(context_) {
            if (context !== context_) {
                throw new jGlobals.jpipExceptions.InternalErrorException('webjpip error: Unexpected context in data event');
            }

            hadData = true;

            var quality;
            var stage = context.getProgressiveStagesFinished();
            var canSkip = progressivenessModified[stage - 1].force !== 'force' && progressivenessModified[stage - 1].force !== 'forceAll';
            if (!canSkip) {
                quality = progressivenessModified[stage - 1].minNumQualityLayers;
            }

            var data = context.getFetchedData(quality);
            task.dataReady(data, WORKER_TYPE_COEFFS, canSkip);

            if (context.isDone()) {
                if (!hadData) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('webjpip error: Coefficients task without data');
                }
                taskEnded();
                task.terminate();
            }
        }

        function taskEnded() {
            if (!isTerminated) {
                isTerminated = true;
                context.dispose();
            }
        }
    }

    // TODO: Remove
    if (!JpipImage.useLegacy) {
        return;
    }
    //*
    this.getWorkerTypeOptions = function getWorkerTypeOptions(taskType) {
        var codestreamTransferable = [0, 'headersCodestream', 'buffer'];
        var codeblockTransferable = [0, 'codeblocksData', 'data', 'buffer'];
        return {
            ctorName: 'webjpip.Internals.PdfjsJpxDecoderLegacy',
            ctorArgs: [],
            scriptsToImport: [getScriptName(new Error())],
            transferables: [codestreamTransferable, codeblockTransferable],
            pathToTransferablesInPromiseResult: [[]]
        };
    };

    this.getKeyAsString = function getKeyAsString(key) {
        return JSON.stringify(key);
    };

    this.taskStarted = function taskStarted(task) {
        validateProgressiveness();
        var params = jpipObjects.paramsModifier.modifyCodestreamPartParams( /*codestreamTaskParams=*/task.key);
        var codestreamPart = jpipFactory.createParamsCodestreamPart(params, jpipObjects.codestreamStructure);

        var context = jpipFactory.createImageDataContext(jpipObjects, codestreamPart, params.quality, progressivenessModified);

        var offsetInRegion = getOffsetInRegion(codestreamPart, params);

        context.on('data', onData);
        if (context.hasData()) {
            onData(context);
        }

        function onData(context_) {
            if (context !== context_) {
                throw new jGlobals.jpipExceptions.InternalErrorException('webjpip error: Unexpected context in data event');
            }

            var data = context.getFetchedData();
            data.offsetInRegion = offsetInRegion;
            task.dataReady(data, /*canSkip=*/true);

            if (context.isDone()) {
                task.terminate();
                context.dispose();
            }
        }
    };
    //*/

    function getOffsetInRegion(codestreamPart, codestreamPartParams) {
        if (codestreamPartParams) {
            var tileIterator = codestreamPart.getTileIterator();
            if (!tileIterator.tryAdvance()) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Empty codestreamPart in JpipImageDataContext');
            }
            var firstTileId = tileIterator.tileIndex;

            var firstTileLeft = jpipObjects.codestreamStructure.getTileLeft(firstTileId, codestreamPart.level);
            var firstTileTop = jpipObjects.codestreamStructure.getTileTop(firstTileId, codestreamPart.level);

            return {
                offsetX: codestreamPartParams.minX - firstTileLeft,
                offsetY: codestreamPartParams.minY - firstTileTop,
                width: codestreamPartParams.maxXExclusive - codestreamPartParams.minX,
                height: codestreamPartParams.maxYExclusive - codestreamPartParams.minY
            };
        } else {
            return {
                offsetX: 0,
                offsetY: 0,
                width: jpipObjects.codestreamStructure.getImageWidth(),
                height: jpipObjects.codestreamStructure.getImageHeight()
            };
        }
    }

    function getLevelCalculator() {
        if (levelCalculator === null) {
            levelCalculator = jpipFactory.createLevelCalculator(imageParams);
        }
        return levelCalculator;
    }
}

JpipImage.toggleLegacy = function () {
    JpipImage.useLegacy = !JpipImage.useLegacy;
};

var currentStackFrameRegex = /at (|[^ ]+ \()([^ ]+):\d+:\d+/;
var lastStackFrameRegexWithStrudel = new RegExp(/.+@(.*?):\d+:\d+/);
var lastStackFrameRegex = new RegExp(/.+\/(.*?):\d+(:\d+)*$/);

function getScriptName(errorWithStackTrace) {
    var stack = errorWithStackTrace.stack.trim();

    var source = currentStackFrameRegex.exec(stack);
    if (source && source[2] !== "") {
        return source[2];
    }

    source = lastStackFrameRegexWithStrudel.exec(stack);
    if (source && source[1] !== "") {
        return source[1];
    }

    source = lastStackFrameRegex.exec(stack);
    if (source && source[1] !== "") {
        return source[1];
    }

    if (errorWithStackTrace.fileName !== undefined) {
        return errorWithStackTrace.fileName;
    }

    throw new jGlobals.jpipExceptions.InternalErrorException('webjpip.js: Could not get current script URL');
}

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = {
    request: function request(url, callbackForAsynchronousRequest, failureCallbackForAsynchronousRequest, progressiveRequestQuantBytes) {

        var ajaxResponse = new XMLHttpRequest();
        var isSynchronous = callbackForAsynchronousRequest === undefined;

        var isFinishedRequest = false;
        var bytesRecievedOnLastQuant = 0;

        function internalAjaxCallback(e) {
            if (isFinishedRequest) {
                return;
            }

            if (ajaxResponse.readyState !== 4) {
                if (progressiveRequestQuantBytes === undefined || ajaxResponse.response === null || ajaxResponse.readyState < 3) {

                    return;
                }

                var bytesRecieved = ajaxResponse.response.byteLength;
                var bytesTillLastQuant = bytesRecieved - bytesRecievedOnLastQuant;

                if (bytesTillLastQuant < progressiveRequestQuantBytes) {
                    return;
                }

                bytesRecievedOnLastQuant = bytesRecieved;
            } else {
                isFinishedRequest = true;

                if (ajaxResponse.status !== 200 || ajaxResponse.response === null) {

                    failureCallbackForAsynchronousRequest(ajaxResponse);
                    return;
                }
            }

            if (!isSynchronous) {
                callbackForAsynchronousRequest(ajaxResponse, isFinishedRequest);
            }
        }

        ajaxResponse.open('GET', url, !isSynchronous);
        ajaxResponse.onreadystatechange = internalAjaxCallback;

        if (!isSynchronous) {
            // Not supported for synchronous requests
            ajaxResponse.mozResponseType = ajaxResponse.responseType = 'arraybuffer';
        }

        if (progressiveRequestQuantBytes !== undefined) {
            ajaxResponse.setRequestHeader('X-Content-Type-Options', 'nosniff');
            ajaxResponse.onprogress = internalAjaxCallback;
        }

        ajaxResponse.send(null);

        if (isSynchronous && !isFinishedRequest) {
            throw new jGlobals.jpipExceptions.InternalErrorException('synchronous ajax call was not finished synchronously');
        }

        return ajaxResponse;
    }
};

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = {
    createTransaction: function createTransaction() {
        // This code is executed a LOT. For optimization, state is represented
        // directly as numbers (I couldn't think about more readable way which
        // is performance-equivalent).

        // state = 1 ==> Transaction is active
        // state = 2 ==> Transaction has committed successfully
        // state = 3 ==> Transaction has been aborted

        var state = 1;

        var transaction = {
            get isAborted() {
                return state === 3;
            },

            get isActive() {
                return state === 1;
            },

            commit: function commit() {
                terminate(true);
            },

            abort: function abort() {
                terminate(false);
            }
        };

        function terminate(isSuccessful_) {
            if (!transaction.isActive) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Cannot terminate an already terminated transaction');
            }
            state = isSuccessful_ ? 2 : 3;
        }

        return transaction;
    },

    createTransactionalObject: function createTransactionalObject(initialValue, clone) {

        var value = null;
        var prevValue = initialValue;
        var lastAccessedTransaction = {
            isActive: false,
            isAborted: true
        };

        var transactionalObject = {
            getValue: function getValue(activeTransaction) {
                ensureAllowedAccess(activeTransaction);

                if (lastAccessedTransaction === activeTransaction) {
                    return value;
                }

                if (lastAccessedTransaction.isAborted) {
                    value = clone(prevValue);
                } else {
                    prevValue = clone(value);
                }

                lastAccessedTransaction = activeTransaction;
                return value;
            },

            setValue: function setValue(activeTransaction, newValue) {
                ensureAllowedAccess(activeTransaction);

                if (lastAccessedTransaction === activeTransaction) {
                    value = newValue;
                    return;
                }

                if (!lastAccessedTransaction.isAborted) {
                    prevValue = clone(value);
                }

                lastAccessedTransaction = activeTransaction;
                value = newValue;
            }
        };

        function ensureAllowedAccess(activeTransaction) {
            if (!activeTransaction.isActive) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Cannot use terminated transaction to access objects');
            }

            if (activeTransaction !== lastAccessedTransaction && lastAccessedTransaction.isActive) {

                throw new jGlobals.jpipExceptions.InternalErrorException('Cannot simultanously access transactional object ' + 'from two active transactions');
            }
        }

        return transactionalObject;
    }
};

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = function JpipCodingPassesNumberParserClosure() {
    // Table B.4 in part 1 of the Jpeg2000 standard shows 7 cases
    // of values. The algorithm shown here separates those cases
    // into 16 cases, depends on the number of ones in the prefix
    // of the coded number until the first zero.
    // The parsing is done in two stages: first we count the ones until
    // the first zero, later we parse the other bits.

    // For example, the case of 1101 (which represents 4 according to
    // table B.4) is parsed in two stages. First we count the ones in
    // the beginning until the first zero, the result is 2 ('110'). Then we
    // parse the other bits ('1').

    // After the first parsing stage (count of ones), we know two things:
    // - How many bits we need to take after the first zero (single bit in
    //   the above case of '110' prefix).
    // - How much we need to add to the result of parsing the other bits (3
    //     in the above case of '110' prefix).

    // Actually the 16 cases were extracted from the table without any formula,
    // so we can refer the number of ones as 'keywords' only.

    var bitsNeededAfterCountOfOnes = createBitsNeededAfterCountOfOnesMap();
    var addToResultAfterCountOfOnes = createAddToResultAfterCountOfOnesMap();

    var jpipCodingPassesNumberParser = {
        parse: function parse(bitstreamReader) {

            var onesCount = bitstreamReader.countOnesAndShiftUntilFirstZeroBit(
            /*maxBitsToShift=*/16);

            if (onesCount === null) {
                return null;
            }

            var moreBitsNeeded = bitsNeededAfterCountOfOnes[onesCount];
            var moreBits = bitstreamReader.shiftBits(moreBitsNeeded);

            if (moreBits === null) {
                return null;
            }

            var addToResult = addToResultAfterCountOfOnes[onesCount];
            var result = moreBits + addToResult;

            return result;
        }
    };

    function createBitsNeededAfterCountOfOnesMap() {
        var result = new Array(17);

        // The case of '0': After 0 ones and single zero, needs no more bits
        result[0] = 0;

        // The case of '10': After 1 ones and single zero, needs no more bits
        result[1] = 0;

        // The cases of '110x': After 2 ones and single zero, needs another bit
        result[2] = 1;

        // The case of '1110': After 3 ones and single zero, needs no more bits
        result[3] = 0;

        // The cases of '1111 0000 0' to '1111 1111 0':
        // After 4 to 8 ones and single zero, needs bits to complete to 9 bits
        result[4] = 4;
        result[5] = 3;
        result[6] = 2;
        result[7] = 1;
        result[8] = 0;

        // The cases of '1111 11111 ...'
        // After at least 9 ones and single zero, needs bits to complete to 16 bits
        result[9] = 6;
        result[10] = 5;
        result[11] = 4;
        result[12] = 3;
        result[13] = 2;
        result[14] = 1;
        result[15] = 0;

        // The case of '1111 11111 1111 111'
        result[16] = 0;

        return result;
    }

    function createAddToResultAfterCountOfOnesMap() {
        var result = new Array(17);

        // The case of '0' (codeword for 1):
        // After 0 ones and single zero, add 1 to other 0 bits value
        result[0] = 1;

        // The case of '10' (codeword for 2):
        // After 1 ones and single zero, add 2 to other 0 bits value
        result[1] = 2;

        // The cases of '110x' (codewords for 3 and 4):
        // After 2 ones and single zero, add 3 to other single bit value
        result[2] = 3;

        // The case of '1110' (codeword for 5):
        // After 3 ones and single zero, add 5 to other 0 bits value
        result[3] = 5;

        // The cases of '1111 0000 0' to '1111 1111 0' (codewords for 6 to 36):
        // After 4 ones and single zero, add 6 to other 0/1/2/3/4 bits value
        result[4] = 6 + 0x00; // b00000
        result[5] = 6 + 0x10; // b10000
        result[6] = 6 + 0x18; // b11000
        result[7] = 6 + 0x1C; // b11100
        result[8] = 6 + 0x1E; // b11110

        // The cases of '1111 11111 ...' (codewords for 37 to 164):
        // After 9 ones and single zero, add 37 to other 0/1/2/3/4/5/6 bits value
        result[9] = 37 + 0x00; // b000000
        result[10] = 37 + 0x40; // b100000
        result[11] = 37 + 0x60; // b110000
        result[12] = 37 + 0x70; // b111000
        result[13] = 37 + 0x78; // b111100
        result[14] = 37 + 0x7C; // b111110
        result[15] = 37 + 0x7E; // b111111
        result[16] = 37 + 0x7F; // b111111

        return result;
    }

    return jpipCodingPassesNumberParser;
}();

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

var jpipMessageHeaderParser = {

    LSB_MASK: 0x1,
    BIT_4_MASK: 0x10,
    BITS_56_MASK: 0x60,
    MSB_MASK: 0x80,

    LSB_7_MASK: 0x7F,

    // A.2.1
    parseNumberInVbas: function parseNumberInVbasClosure(message, startOffset, bitsToTakeInFirstByte) {

        var self = jpipMessageHeaderParser;
        var currentOffset = startOffset;

        var result;
        if (bitsToTakeInFirstByte) {
            var maskFirstByte = (1 << bitsToTakeInFirstByte) - 1;
            result = message[currentOffset] & maskFirstByte;
        } else {
            result = message[currentOffset] & self.LSB_7_MASK;
        }

        while (!!(message[currentOffset] & self.MSB_MASK)) {
            ++currentOffset;

            result <<= 7;
            result |= message[currentOffset] & self.LSB_7_MASK;
        }

        return {
            endOffset: currentOffset + 1,
            number: result
        };
    },

    // A.2
    parseMessageHeader: function parseMessageHeaderClosure(message, startOffset, previousMessageHeader) {

        var self = jpipMessageHeaderParser;

        // A.2.1

        // First Vbas: Bin-ID

        var classAndCsnPrecense = (message[startOffset] & self.BITS_56_MASK) >>> 5;

        if (classAndCsnPrecense === 0) {
            throw new jGlobals.jpipExceptions.ParseException('Failed parsing message header ' + '(A.2.1): prohibited existance class and csn bits 00');
        }

        var hasClassVbas = !!(classAndCsnPrecense & 0x2);
        var hasCodeStreamIndexVbas = classAndCsnPrecense === 3;

        var isLastByteInDatabin = !!(message[startOffset] & self.BIT_4_MASK);

        // A.2.3
        var parsedInClassId = self.parseNumberInVbas(message, startOffset, /*bitsToTakeInFirstByte=*/4);
        var inClassId = parsedInClassId.number;
        var currentOffset = parsedInClassId.endOffset;

        // Second optional Vbas: Class ID

        var classId = 0;
        if (hasClassVbas) {
            var parsedClassId = self.parseNumberInVbas(message, currentOffset);
            classId = parsedClassId.number;
            currentOffset = parsedClassId.endOffset;
        } else if (previousMessageHeader) {
            classId = previousMessageHeader.classId;
        }

        // Third optional Vbas: Code Stream Index (Csn)

        var codestreamIndex = 0;
        if (hasCodeStreamIndexVbas) {
            var parsedCsn = self.parseNumberInVbas(message, currentOffset);
            codestreamIndex = parsedCsn.number;
            currentOffset = parsedCsn.endOffset;
        } else if (previousMessageHeader) {
            codestreamIndex = previousMessageHeader.codestreamIndex;
        }

        // 4th Vbas: Message offset

        var parsedOffset = self.parseNumberInVbas(message, currentOffset);
        var messageOffsetFromDatabinStart = parsedOffset.number;
        currentOffset = parsedOffset.endOffset;

        // 5th Vbas: Message length

        var parsedLength = self.parseNumberInVbas(message, currentOffset);
        var messageBodyLength = parsedLength.number;
        currentOffset = parsedLength.endOffset;

        // 6th optional Vbas: Aux

        // A.2.2
        var hasAuxVbas = !!(classId & self.LSB_MASK);

        var aux;
        if (hasAuxVbas) {
            var parsedAux = self.parseNumberInVbas(message, currentOffset);
            aux = parsedAux.number;
            currentOffset = parsedAux.endOffset;
        }

        // Return

        var result = {
            isLastByteInDatabin: isLastByteInDatabin,
            inClassId: inClassId,
            bodyStart: currentOffset,
            classId: classId,
            codestreamIndex: codestreamIndex,
            messageOffsetFromDatabinStart: messageOffsetFromDatabinStart,
            messageBodyLength: messageBodyLength
        };

        if (hasAuxVbas) {
            result.aux = aux;
        }

        return result;
    },

    getInt32: function getInt32Closure(data, offset) {
        var msb = data[offset] * Math.pow(2, 24); // Avoid negative result due to signed calculation
        var byte2 = data[offset + 1] << 16;
        var byte1 = data[offset + 2] << 8;
        var lsb = data[offset + 3];

        var result = msb + byte2 + byte1 + lsb;
        return result;
    },

    getInt16: function getInt16Closure(data, offset) {
        var msb = data[offset] << 8;
        var lsb = data[offset + 1];

        var result = msb + lsb;
        return result;
    }
};

module.exports = jpipMessageHeaderParser;

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipChannel(maxRequestsWaitingForResponseInChannel, sessionHelper, jpipFactory) {

    var self = this;
    var channelId = null;
    var requestId = 0;
    var requestsWaitingForChannelCreation = [];
    var requestsWaitingForResponse = [];
    var isDedicatedForMovableRequest = false;

    this.requestData = function requestData(codestreamPartParams, callback, failureCallback, numQualityLayers) {

        if (!isDedicatedForMovableRequest) {
            // No need to check if there are too many concurrent requests
            // if channel was dedicated for movable request. The reason is
            // that any request in dedicated channel cancel the previous one.

            var allWaitingRequests = getAllQueuedRequestCount();

            if (allWaitingRequests >= maxRequestsWaitingForResponseInChannel) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Channel has too many requests not responded yet');
            }
        }

        var url = createRequestUrl(codestreamPartParams, numQualityLayers);
        var request = jpipFactory.createRequest(sessionHelper, self, url, callback, failureCallback);

        if (channelId !== null || requestsWaitingForResponse.length === 0) {
            requestsWaitingForResponse.push(request);
            request.startRequest();
        } else if (isDedicatedForMovableRequest) {
            // Those requests cancel all previous requests in channel, so no
            // need to log old requests
            requestsWaitingForChannelCreation = [request];
        } else {
            requestsWaitingForChannelCreation.push(request);
        }

        return request;
    };

    this.sendMinimalRequest = function sendMinimalRequest(callback) {
        if (channelId === null && requestsWaitingForResponse.length > 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Minimal requests should be used for first request or keep ' + 'alive message. Keep alive requires an already initialized ' + 'channel, and first request requires to not have any ' + 'previous request');
        }

        var url = createMinimalRequestUrl();
        var request = jpipFactory.createRequest(sessionHelper, self, url, callback);

        requestsWaitingForResponse.push(request);
        request.startRequest();
    };

    this.getIsDedicatedForMovableRequest = function getIsDedicatedForMovableRequest() {

        return isDedicatedForMovableRequest;
    };

    this.dedicateForMovableRequest = function dedicateForMovableRequest() {
        if (isDedicatedForMovableRequest) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Channel already dedicated for movable request');
        }

        isDedicatedForMovableRequest = true;
    };

    this.getChannelId = function getChannelId() {
        return channelId;
    };

    this.setChannelId = function setChannelId(newChannelId) {
        if (newChannelId === null) {
            return;
        }

        channelId = newChannelId;

        var requestsToSend = requestsWaitingForChannelCreation;
        requestsWaitingForChannelCreation = [];

        for (var i = 0; i < requestsToSend.length; ++i) {
            requestsWaitingForResponse.push(requestsToSend[i]);
            requestsToSend[i].startRequest();
        }
    };

    this.nextRequestId = function nextRequestId() {
        return ++requestId;
    };

    this.getRequestsWaitingForResponse = function getRequestsWaitingForResponse() {

        return requestsWaitingForResponse;
    };

    this.getAllQueuedRequestCount = getAllQueuedRequestCount;

    this.requestEnded = function requestEnded(ajaxResponse, request) {
        var requests = requestsWaitingForResponse;
        var isFound = false;
        for (var i = 0; i < requests.length; ++i) {
            if (requests[i] === request) {
                requests[i] = requests[requests.length - 1];
                requests.length -= 1;
                isFound = true;
                break;
            }
        }

        if (!isFound) {
            throw new jGlobals.jpipExceptions.InternalErrorException('channel.requestsWaitingForResponse inconsistency');
        }

        sessionHelper.requestEnded(ajaxResponse, self);

        if (channelId === null && requestsWaitingForChannelCreation.length > 0) {
            // If not succeeded to create a channel ID yet,
            // perform an additional request

            var nextRequest = requestsWaitingForChannelCreation.shift();

            requestsWaitingForResponse.push(nextRequest);
            nextRequest.startRequest();
        }
    };

    this.isAllOldRequestsEnded = function isAllOldRequestsEnded(priorToId) {
        for (var i = 0; i < requestsWaitingForResponse.length; ++i) {
            if (requestsWaitingForResponse[i].lastRequestId <= priorToId) {
                return false;
            }
        }

        return true;
    };

    function getAllQueuedRequestCount() {
        var allWaitingRequests = requestsWaitingForResponse.length + requestsWaitingForChannelCreation.length;

        return allWaitingRequests;
    }

    function createMinimalRequestUrl(allowStopPreviousRequestsInChannel) {
        var requestUrl = sessionHelper.getDataRequestUrl();
        var targetId = sessionHelper.getTargetId();

        if (targetId !== '0') {
            requestUrl += '&tid=' + targetId;
        }

        var alreadySentMessagesOnChannel = channelId !== null;

        if (alreadySentMessagesOnChannel) {
            var isStopPrevious = isDedicatedForMovableRequest && allowStopPreviousRequestsInChannel;

            if (isStopPrevious) {
                requestUrl += '&wait=no';
            } else {
                requestUrl += '&wait=yes';
            }
        }

        return requestUrl;
    }

    function createRequestUrl(codestreamPartParams, numQualityLayers) {
        var requestUrl = createMinimalRequestUrl(
        /*allowStopPreviousRequestsInChannel=*/true);

        var codestreamStructure = sessionHelper.getCodestreamStructure();

        var frameWidth = codestreamStructure.getLevelWidth(codestreamPartParams.level);
        var frameHeight = codestreamStructure.getLevelHeight(codestreamPartParams.level);

        var regionWidth = codestreamPartParams.maxXExclusive - codestreamPartParams.minX;
        var regionHeight = codestreamPartParams.maxYExclusive - codestreamPartParams.minY;

        requestUrl += '&fsiz=' + frameWidth + ',' + frameHeight + ',closest' + '&rsiz=' + regionWidth + ',' + regionHeight + '&roff=' + codestreamPartParams.minX + ',' + codestreamPartParams.minY;

        if (numQualityLayers !== 'max') {
            requestUrl += '&layers=' + numQualityLayers;
        }

        return requestUrl;
    }
};

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipCodestreamReconstructor(databinsSaver, headerModifier, qualityLayersCache) {

    var dummyBufferForLengthCalculation = { isDummyBufferForLengthCalculation: true };

    this.createCodestream = function createCodestream(codestreamPart, minQuality, maxQuality) {

        return createCodestreamInternal(codestreamPart, minQuality, maxQuality);
    };

    this.createHeadersCodestream = function createHeadersCodestream(codestreamPart) {
        var dummyQuality = 1;
        var isOnlyHeaders = true;
        return createCodestreamInternal(codestreamPart, dummyQuality, dummyQuality, isOnlyHeaders);
    };

    function createCodestreamInternal(codestreamPart, minQuality, maxQuality, isOnlyHeadersWithoutBitstream) {

        var calculatedLength = createCodestreamOrCalculateLength(dummyBufferForLengthCalculation, codestreamPart, minQuality, maxQuality, isOnlyHeadersWithoutBitstream);

        if (calculatedLength === null) {
            return null;
        }

        var result = new Uint8Array(calculatedLength);
        var actualLength = createCodestreamOrCalculateLength(result, codestreamPart, minQuality, maxQuality, isOnlyHeadersWithoutBitstream);

        if (actualLength === calculatedLength) {
            return result;
        } else if (actualLength === null) {
            return null;
        }

        throw new jGlobals.jpipExceptions.InternalErrorException('JpipCodestreamReconstructor: Unmatched actualLength ' + actualLength + ' and calculatedLength ' + calculatedLength);
    }

    function createCodestreamOrCalculateLength(result, codestreamPart, minQuality, maxQuality, isOnlyHeadersWithoutBitstream) {

        var currentOffset = createMainHeader(result, codestreamPart.level);

        if (currentOffset === null) {
            return null;
        }

        var tileIdToWrite = 0;
        var tileIterator = codestreamPart.getTileIterator();
        while (tileIterator.tryAdvance()) {
            var tileIdOriginal = tileIterator.tileIndex;

            var tileBytesCopied = createTile(result, currentOffset, tileIdToWrite++, tileIterator, codestreamPart.level, minQuality, maxQuality, isOnlyHeadersWithoutBitstream);

            currentOffset += tileBytesCopied;

            if (tileBytesCopied === null) {
                return null;
            }
        }

        var markerBytesCopied = copyBytes(result, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;

        headerModifier.modifyImageSize(result, codestreamPart.fullTilesSize);

        if (result === null) {
            return null;
        }

        return currentOffset;
    }

    function createMainHeader(result, level) {
        if (databinsSaver.getIsJpipTilePartStream()) {
            throw new jGlobals.jpipExceptions.UnsupportedFeatureException('reconstruction of codestream from JPT (Jpip Tile-part) stream', 'A.3.4');
        }

        var mainHeader = databinsSaver.getMainHeaderDatabin();
        var currentOffset = mainHeader.copyBytes(result, /*startOffset=*/0, {
            forceCopyAllRange: true
        });

        if (currentOffset === null) {
            return null;
        }

        var bytesAdded = headerModifier.modifyMainOrTileHeader(result, mainHeader, /*offset=*/0, level);

        currentOffset += bytesAdded;

        bytesAdded = addMamazavComment(result, currentOffset);
        currentOffset += bytesAdded;

        return currentOffset;
    }

    function createTile(result, currentOffset, tileIdToWrite, tileIterator, level, minNumQualityLayers, maxNumQualityLayers, isOnlyHeadersWithoutBitstream) {

        var tileIdOriginal = tileIterator.tileIndex;

        var startTileOffset = currentOffset;
        var tileHeaderDatabin = databinsSaver.getTileHeaderDatabin(tileIdOriginal);

        var tileHeaderOffsets = createTileHeaderAndGetOffsets(result, currentOffset, tileHeaderDatabin, tileIdToWrite, level);

        if (tileHeaderOffsets === null) {
            return null;
        }

        currentOffset = tileHeaderOffsets.endTileHeaderOffset;

        if (!isOnlyHeadersWithoutBitstream) {
            var tileBytesCopied = createTileBitstream(result, currentOffset, tileIterator, minNumQualityLayers, maxNumQualityLayers);

            currentOffset += tileBytesCopied;

            if (tileBytesCopied === null) {
                return null;
            }
        }

        var endTileOffset = currentOffset;

        var headerAndDataLength = endTileOffset - tileHeaderOffsets.startOfTileHeaderOffset;

        headerModifier.modifyInt32(result, tileHeaderOffsets.headerAndDataLengthPlaceholderOffset, headerAndDataLength);

        var bytesCopied = endTileOffset - startTileOffset;
        return bytesCopied;
    }

    function createTileHeaderAndGetOffsets(result, currentOffset, tileHeaderDatabin, tileIdToWrite, level) {

        var startOfTileHeaderOffset = currentOffset;

        var bytesCopied = copyBytes(result, currentOffset, jGlobals.j2kMarkers.StartOfTile);
        currentOffset += bytesCopied;

        // A.4.2

        var startOfTileSegmentLength = [0, 10]; // Lsot
        bytesCopied = copyBytes(result, currentOffset, startOfTileSegmentLength);
        currentOffset += bytesCopied;

        var tileIndex = [tileIdToWrite >>> 8, tileIdToWrite & 0xFF]; // Isot
        bytesCopied = copyBytes(result, currentOffset, tileIndex);
        currentOffset += bytesCopied;

        var headerAndDataLengthPlaceholderOffset = currentOffset;
        var headerAndDataLengthPlaceholder = [0, 0, 0, 0]; // Psot
        bytesCopied = copyBytes(result, currentOffset, headerAndDataLengthPlaceholder);
        currentOffset += bytesCopied;

        var tilePartIndex = [0]; // TPsot
        bytesCopied = copyBytes(result, currentOffset, tilePartIndex);
        currentOffset += bytesCopied;

        var numberOfTileparts = [1]; // TNsot
        bytesCopied = copyBytes(result, currentOffset, numberOfTileparts);
        currentOffset += bytesCopied;

        var afterStartOfTileSegmentOffset = currentOffset;
        bytesCopied = tileHeaderDatabin.copyBytes(result, currentOffset, {
            forceCopyAllRange: true
        });
        currentOffset += bytesCopied;

        if (bytesCopied === null) {
            // NOTE: Can create empty tile
            return null;
        }

        var optionalMarker = new Array(2);
        var databinLength = tileHeaderDatabin.getDatabinLengthIfKnown();
        tileHeaderDatabin.copyBytes(optionalMarker, 0, {
            databinStartOffset: databinLength - 2
        });

        var isEndedWithStartOfDataMarker = optionalMarker[0] === jGlobals.j2kMarkers.StartOfData[0] && optionalMarker[1] === jGlobals.j2kMarkers.StartOfData[1];

        if (!isEndedWithStartOfDataMarker) {
            bytesCopied = copyBytes(result, currentOffset, jGlobals.j2kMarkers.StartOfData);
            currentOffset += bytesCopied;
        }

        var bytesAdded = headerModifier.modifyMainOrTileHeader(result, tileHeaderDatabin, afterStartOfTileSegmentOffset, level);

        currentOffset += bytesAdded;

        var offsets = {
            startOfTileHeaderOffset: startOfTileHeaderOffset,
            headerAndDataLengthPlaceholderOffset: headerAndDataLengthPlaceholderOffset,
            endTileHeaderOffset: currentOffset
        };

        return offsets;
    }

    function createTileBitstream(result, currentOffset, tileIterator, minNumQualityLayers, maxNumQualityLayers) {

        var numQualityLayersInTile = tileIterator.tileStructure.getNumQualityLayers();

        var allBytesCopied = 0;
        var hasMorePackets;

        if (minNumQualityLayers === 'max') {
            minNumQualityLayers = numQualityLayersInTile;
        }

        var precinctIterator = tileIterator.createPrecinctIterator(
        /*isIteratePrecinctsNotInCodestreamPart=*/true);

        while (precinctIterator.tryAdvance()) {
            var emptyPacketsToPush = numQualityLayersInTile;

            if (precinctIterator.isInCodestreamPart) {
                var inClassIndex = tileIterator.tileStructure.precinctPositionToInClassIndex(precinctIterator);
                var precinctDatabin = databinsSaver.getPrecinctDatabin(inClassIndex);

                var qualityLayerOffset = qualityLayersCache.getQualityLayerOffset(precinctDatabin, maxNumQualityLayers, precinctIterator);

                var bytesToCopy = qualityLayerOffset.endOffset;
                emptyPacketsToPush = numQualityLayersInTile - qualityLayerOffset.numQualityLayers;

                if (qualityLayerOffset.numQualityLayers < minNumQualityLayers) {
                    return null;
                }

                var bytesCopied = precinctDatabin.copyBytes(result, currentOffset, {
                    forceCopyAllRange: true,
                    maxLengthToCopy: bytesToCopy
                });

                if (bytesCopied === null) {
                    bytesCopied = 0;
                    emptyPacketsToPush = numQualityLayersInTile;
                }

                allBytesCopied += bytesCopied;
                currentOffset += bytesCopied;
            }

            if (!result.isDummyBufferForLengthCalculation) {
                for (var i = 0; i < emptyPacketsToPush; ++i) {
                    result[currentOffset++] = 0;
                }
            }
            allBytesCopied += emptyPacketsToPush;
        }

        return allBytesCopied;
    }

    function addMamazavComment(result, currentOffset) {
        var startOffset = currentOffset;

        putByte(result, currentOffset++, 0xFF);
        putByte(result, currentOffset++, 0x64);
        putByte(result, currentOffset++, 0x00);
        putByte(result, currentOffset++, 0x09);
        putByte(result, currentOffset++, 77);
        putByte(result, currentOffset++, 97);
        putByte(result, currentOffset++, 109);
        putByte(result, currentOffset++, 97);
        putByte(result, currentOffset++, 122);
        putByte(result, currentOffset++, 97);
        putByte(result, currentOffset++, 118);

        var bytesAdded = currentOffset - startOffset;
        return bytesAdded;
    }

    function copyBytes(result, resultStartOffset, bytesToCopy) {
        if (!result.isDummyBufferForLengthCalculation) {
            for (var i = 0; i < bytesToCopy.length; ++i) {
                result[i + resultStartOffset] = bytesToCopy[i];
            }
        }

        return bytesToCopy.length;
    }

    function putByte(result, offset, value) {
        if (!result.isDummyBufferForLengthCalculation) {
            result[offset] = value;
        }
    }
};

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipCodestreamStructure(jpipStructureParser, jpipFactory, progressionOrder) {

    var self = this;
    var params;
    var sizesCalculator;

    var defaultTileStructureByEdgeType;

    var cachedTileStructures = [];

    this.getSizesParams = function getSizesParams() {
        validateParams();
        return params;
    };

    this.getNumTilesX = function getNumTilesX() {
        validateParams();

        var numTiles = sizesCalculator.getNumTilesX();
        return numTiles;
    };

    this.getNumTilesY = function getNumTilesY() {
        validateParams();

        var numTiles = sizesCalculator.getNumTilesY();
        return numTiles;
    };

    this.getNumComponents = function () {
        validateParams();
        return params.numComponents;
    };

    this.getImageWidth = function () {
        validateParams();

        var size = sizesCalculator.getLevelWidth();
        return size;
    };

    this.getImageHeight = function () {
        validateParams();

        var size = sizesCalculator.getLevelHeight();
        return size;
    };

    this.getLevelWidth = function (level) {
        validateParams();

        var size = sizesCalculator.getLevelWidth(level);
        return size;
    };

    this.getLevelHeight = function (level) {
        validateParams();

        var size = sizesCalculator.getLevelHeight(level);
        return size;
    };

    this.getTileWidth = function (level) {
        validateParams();

        var size = sizesCalculator.getTileWidth(level);
        return size;
    };

    this.getTileHeight = function (level) {
        validateParams();

        var size = sizesCalculator.getTileHeight(level);
        return size;
    };

    this.getFirstTileOffsetX = function () {
        validateParams();

        var offset = sizesCalculator.getFirstTileOffsetX();
        return offset;
    };

    this.getFirstTileOffsetY = function () {
        validateParams();

        var offset = sizesCalculator.getFirstTileOffsetY();
        return offset;
    };

    this.getTileLeft = function getTileLeft(tileIndex, level) {

        validateParams();

        var tileX = tileIndex % sizesCalculator.getNumTilesX();
        if (tileX === 0) {
            return 0;
        }

        var tileLeft = (tileX - 1) * sizesCalculator.getTileWidth(level) + sizesCalculator.getFirstTileWidth(level);

        return tileLeft;
    };

    this.getTileTop = function getTileTop(tileIndex, level) {
        validateParams();

        var tileY = Math.floor(tileIndex / sizesCalculator.getNumTilesX());
        if (tileY === 0) {
            return 0;
        }

        var tileTop = (tileY - 1) * sizesCalculator.getTileHeight(level) + sizesCalculator.getFirstTileHeight(level);

        return tileTop;
    };

    this.getDefaultTileStructure = function getDefaultTileStructure() {
        validateParams();
        var result = getDefaultTileStructureInternal({
            horizontalEdgeType: sizesCalculator.EDGE_TYPE_NO_EDGE,
            verticalEdgeType: sizesCalculator.EDGE_TYPE_NO_EDGE
        });

        return result;
    };

    this.getTileStructure = getTileStructure;

    this.tilePositionToInClassIndex = function (tilePosition) {
        validateParams();
        var tilesX = sizesCalculator.getNumTilesX();
        var tilesY = sizesCalculator.getNumTilesY();

        validateArgumentInRange('tilePosition.tileX', tilePosition.tileX, tilesX);
        validateArgumentInRange('tilePosition.tileY', tilePosition.tileY, tilesY);

        var inClassIndex = tilePosition.tileX + tilePosition.tileY * tilesX;

        return inClassIndex;
    };

    this.tileInClassIndexToPosition = function (inClassIndex) {
        validateParams();
        var tilesX = sizesCalculator.getNumTilesX();
        var tilesY = sizesCalculator.getNumTilesY();
        var numTiles = tilesX * tilesY;

        validateArgumentInRange('inClassIndex', inClassIndex, tilesX * tilesY);

        var tileX = inClassIndex % tilesX;
        var tileY = (inClassIndex - tileX) / tilesX;

        var result = {
            tileX: tileX,
            tileY: tileY
        };

        return result;
    };

    this.getTilesFromPixels = function getTilesFromPixels(codestreamPartParams) {

        validateParams();

        return sizesCalculator.getTilesFromPixels(codestreamPartParams);
    };

    this.getSizeOfTiles = function getSizeOfTiles(tileBounds) {
        validateParams();

        var size = sizesCalculator.getSizeOfTiles(tileBounds);
        return size;
    };

    function getTileStructure(tileId) {
        validateParams();

        var maxTileId = sizesCalculator.getNumTilesX() * sizesCalculator.getNumTilesY() - 1;

        if (tileId < 0 || tileId > maxTileId) {
            throw new jGlobals.jpipExceptions.ArgumentException('tileId', tileId, 'Expected value between 0 and ' + maxTileId);
        }

        var isEdge = sizesCalculator.isEdgeTileId(tileId);

        if (cachedTileStructures[tileId] === undefined) {
            var tileParams = jpipStructureParser.parseOverridenTileParams(tileId);

            if (!!tileParams) {
                cachedTileStructures[tileId] = createTileStructure(tileParams, isEdge);
            } else {
                cachedTileStructures[tileId] = null;
            }
        }

        if (cachedTileStructures[tileId]) {
            return cachedTileStructures[tileId];
        }

        var result = getDefaultTileStructureInternal(isEdge);
        return result;
    }

    function validateArgumentInRange(paramName, paramValue, suprimumParamValue) {
        if (paramValue < 0 || paramValue >= suprimumParamValue) {
            throw new jGlobals.jpipExceptions.ArgumentException(paramName, paramValue, paramName + ' is expected to be between 0 and ' + suprimumParamValue - 1);
        }
    }

    function getDefaultTileStructureInternal(edgeType) {
        if (!defaultTileStructureByEdgeType) {
            var defaultTileParams = jpipStructureParser.parseDefaultTileParams();

            defaultTileStructureByEdgeType = new Array(3);

            for (var horizontalEdge = 0; horizontalEdge < 3; ++horizontalEdge) {
                defaultTileStructureByEdgeType[horizontalEdge] = new Array(3);

                for (var verticalEdge = 0; verticalEdge < 3; ++verticalEdge) {
                    var edge = {
                        horizontalEdgeType: horizontalEdge,
                        verticalEdgeType: verticalEdge
                    };

                    defaultTileStructureByEdgeType[horizontalEdge][verticalEdge] = createTileStructure(defaultTileParams, edge);
                }
            }
        }

        var structureByVerticalType = defaultTileStructureByEdgeType[edgeType.horizontalEdgeType];

        var tileStructure = structureByVerticalType[edgeType.verticalEdgeType];

        return tileStructure;
    }

    function createTileStructure(tileParams, edgeType) {
        validateParams();

        var sizeParams = JSON.parse(JSON.stringify(tileParams));

        sizeParams.tileSize = sizesCalculator.getTileSize(edgeType);

        sizeParams.defaultComponentParams.scaleX = 1;
        sizeParams.defaultComponentParams.scaleY = 1;

        for (var i = 0; i < sizeParams.paramsPerComponent.length; ++i) {
            sizeParams.paramsPerComponent[i].scaleX = params.componentsScaleX[i];
            sizeParams.paramsPerComponent[i].scaleY = params.componentsScaleY[i];
        }

        var tileStructure = jpipFactory.createTileStructure(sizeParams, self, progressionOrder);

        return tileStructure;
    }

    function validateParams(self) {
        if (!params) {
            params = jpipStructureParser.parseCodestreamStructure();
            sizesCalculator = jpipFactory.createLevelCalculator(params);
        }
    }

    return this;
};

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipComponentStructure(params, tileStructure) {

    var tileWidthLevel0;
    var tileHeightLevel0;

    initialize();

    this.getComponentScaleX = function getComponentScaleX() {
        return params.scaleX;
    };

    this.getComponentScaleY = function getComponentScaleY() {
        return params.scaleY;
    };

    this.getNumResolutionLevels = function () {
        return params.numResolutionLevels;
    };

    this.getPrecinctWidth = function (resolutionLevel) {
        var width = params.precinctWidthPerLevel[resolutionLevel];

        return width;
    };

    this.getPrecinctHeight = function (resolutionLevel) {
        var height = params.precinctHeightPerLevel[resolutionLevel];

        return height;
    };

    this.getMaxCodeblockWidth = function getMaxCodeblockWidth() {
        var width = params.maxCodeblockWidth;

        return width;
    };

    this.getMaxCodeblockHeight = function getMaxCodeblockHeight() {
        var height = params.maxCodeblockHeight;

        return height;
    };

    this.getNumCodeblocksXInPrecinct = function getNumCodeblocksX(precinct) {

        var numCodeblocksX = calculateNumCodeblocks(precinct, precinct.precinctX, params.maxCodeblockWidth, params.precinctWidthPerLevel, tileWidthLevel0);

        return numCodeblocksX;
    };

    this.getNumCodeblocksYInPrecinct = function getNumCodeblocksY(precinct) {

        var numCodeblocksY = calculateNumCodeblocks(precinct, precinct.precinctY, params.maxCodeblockHeight, params.precinctHeightPerLevel, tileHeightLevel0);

        return numCodeblocksY;
    };

    this.getNumPrecinctsX = function (resolutionLevel) {
        var precinctsX = calculateNumPrecincts(tileWidthLevel0, params.precinctWidthPerLevel, resolutionLevel);

        return precinctsX;
    };

    this.getNumPrecinctsY = function (resolutionLevel) {
        var precinctsY = calculateNumPrecincts(tileHeightLevel0, params.precinctHeightPerLevel, resolutionLevel);

        return precinctsY;
    };

    function calculateNumPrecincts(tileSizeLevel0, precinctSizePerLevel, resolutionLevel) {

        var resolutionFactor = getResolutionFactor(resolutionLevel);
        var tileSizeInLevel = tileSizeLevel0 / resolutionFactor;

        var precinctSizeInLevel = precinctSizePerLevel[resolutionLevel];

        var numPrecincts = Math.ceil(tileSizeInLevel / precinctSizeInLevel);
        return numPrecincts;
    }

    function calculateNumCodeblocks(precinct, precinctIndex, maxCodeblockSize, precinctSizePerLevel, tileSizeLevel0) {

        var resolutionFactor = getResolutionFactor(precinct.resolutionLevel);
        var tileSizeInLevel = Math.ceil(tileSizeLevel0 / resolutionFactor);

        var precinctBeginPixel = precinctIndex * precinctSizePerLevel[precinct.resolutionLevel];

        var precinctSize = Math.min(precinctSizePerLevel[precinct.resolutionLevel], tileSizeInLevel - precinctBeginPixel);

        var subbandTypeFactor = precinct.resolutionLevel === 0 ? 1 : 2;
        var subbandOfPrecinctSize = Math.ceil(precinctSize / subbandTypeFactor);

        var numCodeblocks = subbandTypeFactor * Math.ceil(subbandOfPrecinctSize / maxCodeblockSize);

        if (precinctSize % maxCodeblockSize === 1 && precinct.resolutionLevel > 0) {

            --numCodeblocks;
        }

        return numCodeblocks;
    }

    function getResolutionFactor(resolutionLevel) {
        var differenceFromBestLevel = params.numResolutionLevels - resolutionLevel - 1;

        var factor = 1 << differenceFromBestLevel;

        return factor;
    }

    function initialize() {
        if (params.scaleX !== 1 || params.scaleY !== 1) {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException('Non 1 component scale', 'A.5.1');
        }

        tileWidthLevel0 = Math.floor(tileStructure.getTileWidth() / params.scaleX);
        tileHeightLevel0 = Math.floor(tileStructure.getTileHeight() / params.scaleY);
    }
};

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function CompositeArray(offset) {
    var length = 0;
    var internalParts = [];

    this.getLength = function getLength() {
        return length;
    };

    this.getOffset = function getOffset() {
        return offset;
    };

    this.pushSubArray = function pushSubArray(subArray) {
        internalParts.push(subArray);
        length += subArray.length;
    };

    this.copyToOtherAtTheEnd = function copyToOtherAtTheEnd(result, minOffset, maxOffset) {
        checkOffsetsToCopy(minOffset, maxOffset);

        var iterator = getInternalPartsIterator(minOffset, maxOffset);

        // NOTE: What if data not in first part?

        while (tryAdvanceIterator(iterator)) {
            result.pushSubArray(iterator.subArray);
        }
    };

    this.copyToTypedArray = function copyToTypedArray(resultArray, resultArrayOffset, minOffset, maxOffset) {

        checkOffsetsToCopy(minOffset, maxOffset);

        var iterator = getInternalPartsIterator(minOffset, maxOffset);

        // NOTE: What if data not in first part?

        while (tryAdvanceIterator(iterator)) {
            var offsetInResult = iterator.offset - resultArrayOffset;

            resultArray.set(iterator.subArray, offsetInResult);
        }
    };

    this.copyToArray = function copyToArray(resultArray, resultArrayOffset, minOffset, maxOffset) {

        checkOffsetsToCopy(minOffset, maxOffset);

        var iterator = getInternalPartsIterator(minOffset, maxOffset);

        // NOTE: What if data not in first part?

        while (tryAdvanceIterator(iterator)) {
            var offsetInResult = iterator.offset - resultArrayOffset;

            for (var j = 0; j < iterator.subArray.length; ++j) {
                resultArray[offsetInResult++] = iterator.subArray[j];
            }
        }
    };

    this.copyToOther = function copyToOther(other) {
        if (other.getOffset() > offset) {
            throw new jGlobals.jpipExceptions.InternalErrorException('CompositeArray: Trying to copy part into a latter part');
        }

        var otherEndOffset = other.getOffset() + other.getLength();
        var isOtherContainsThis = offset + length <= otherEndOffset;
        if (isOtherContainsThis) {
            return;
        }

        // Do not override already exist data (for efficiency)
        var minOffset = otherEndOffset;

        var iterator = getInternalPartsIterator(minOffset);

        if (!tryAdvanceIterator(iterator)) {
            throw new jGlobals.jpipExceptions.InternalErrorException('CompositeArray: Could not merge parts');
        }

        var expectedOffsetValue = minOffset;

        do {
            if (iterator.offset !== expectedOffsetValue) {
                throw new jGlobals.jpipExceptions.InternalErrorException('CompositeArray: Non-continuous value of ' + 'rangeToCopy.offset. Expected: ' + expectedOffsetValue + ', Actual: ' + iterator.offset);
            }

            other.pushSubArray(iterator.subArray);
            expectedOffsetValue += iterator.subArray.length;
        } while (tryAdvanceIterator(iterator));
    };

    function checkOffsetsToCopy(minOffset, maxOffset) {
        if (minOffset === undefined || maxOffset === undefined) {
            throw new jGlobals.jpipExceptions.InternalErrorException('minOffset or maxOffset is undefined for CompositeArray.copyToArray');
        }

        if (minOffset < offset) {
            throw new jGlobals.jpipExceptions.InternalErrorException('minOffset (' + minOffset + ') must be smaller than ' + 'CompositeArray offset (' + offset + ')');
        }

        if (maxOffset > offset + length) {
            throw new jGlobals.jpipExceptions.InternalErrorException('maxOffset (' + maxOffset + ') must be larger than ' + 'CompositeArray end offset (' + offset + length + ')');
        }
    }

    function getInternalPartsIterator(minOffset, maxOffset) {
        var start = Math.max(offset, minOffset);

        var end = offset + length;
        if (maxOffset !== undefined) {
            end = Math.min(end, maxOffset);
        }

        if (start >= end) {
            var emptyIterator = {
                internalIteratorData: { isEndOfRange: true }
            };

            return emptyIterator;
        }

        var iterator = {
            subArray: null,
            offset: -1,

            internalIteratorData: {
                end: end,
                currentSubArray: null,
                currentInternalPartOffset: null,
                nextInternalPartOffset: offset,
                currentInternalPartIndex: -1,
                isEndOfRange: false
            }
        };

        var alreadyReachedToTheEnd = false;
        do {
            if (alreadyReachedToTheEnd) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Iterator reached ' + 'to the end although no data has been iterated');
            }

            alreadyReachedToTheEnd = !tryAdvanceIterator(iterator);
        } while (start >= iterator.internalIteratorData.nextInternalPartOffset);

        var cutFirstSubArray = start - iterator.internalIteratorData.currentInternalPartOffset;
        iterator.internalIteratorData.currentSubArray = iterator.internalIteratorData.currentSubArray.subarray(cutFirstSubArray);
        iterator.internalIteratorData.currentInternalPartOffset = start;

        return iterator;
    }

    function tryAdvanceIterator(iterator) {
        var internalIteratorData = iterator.internalIteratorData;

        if (internalIteratorData.isEndOfRange) {
            return false;
        }

        iterator.subArray = internalIteratorData.currentSubArray;
        iterator.offset = internalIteratorData.currentInternalPartOffset;

        ++internalIteratorData.currentInternalPartIndex;

        if (internalIteratorData.nextInternalPartOffset >= internalIteratorData.end) {
            internalIteratorData.isEndOfRange = true;

            return true;
        }

        ensureNoEndOfArrayReached(internalIteratorData.currentInternalPartIndex);

        internalIteratorData.currentSubArray = internalParts[internalIteratorData.currentInternalPartIndex];
        internalIteratorData.currentInternalPartOffset = internalIteratorData.nextInternalPartOffset;
        var currentInternalPartLength = internalParts[internalIteratorData.currentInternalPartIndex].length;

        internalIteratorData.nextInternalPartOffset = internalIteratorData.currentInternalPartOffset + currentInternalPartLength;

        var cutLastSubArray = internalIteratorData.end - internalIteratorData.currentInternalPartOffset;
        var isLastSubArray = cutLastSubArray < internalIteratorData.currentSubArray.length;

        if (isLastSubArray) {
            internalIteratorData.currentSubArray = internalIteratorData.currentSubArray.subarray(0, cutLastSubArray);
        }

        return true;
    }

    function ensureNoEndOfArrayReached(currentInternalPartIndex) {
        if (currentInternalPartIndex >= internalParts.length) {
            throw new jGlobals.jpipExceptions.InternalErrorException('CompositeArray: end of part has reached. Check end calculation');
        }
    }
};

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// A.2.1.

module.exports = function JpipDatabinParts(classId, inClassId, jpipFactory) {

    var self = this;

    var parts = [];
    var databinLengthIfKnown = null;
    var loadedBytes = 0;

    var cachedData = [];

    this.getDatabinLengthIfKnown = function () {
        return databinLengthIfKnown;
    };

    this.getLoadedBytes = function getLoadedBytes() {
        return loadedBytes;
    };

    this.isAllDatabinLoaded = function isAllDatabinLoaded() {
        var result;

        switch (parts.length) {
            case 0:
                result = databinLengthIfKnown === 0;
                break;

            case 1:
                result = parts[0].getOffset() === 0 && parts[0].getLength() === databinLengthIfKnown;
                break;

            default:
                result = false;
                break;
        }

        return result;
    };

    this.getCachedData = function getCachedData(key) {
        var obj = cachedData[key];
        if (obj === undefined) {
            obj = {};
            cachedData[key] = obj;
        }

        return obj;
    };

    this.getClassId = function getClassId() {
        return classId;
    };

    this.getInClassId = function getInClassId() {
        return inClassId;
    };

    this.copyToCompositeArray = function copyToCompositeArray(result, rangeOptions) {
        var dummyResultStartOffset = 0;
        var params = getParamsForCopyBytes(dummyResultStartOffset, rangeOptions);

        if (params.resultWithoutCopy !== undefined) {
            return params.resultWithoutCopy;
        }

        var maxLengthCopied = iterateRange(params.databinStartOffset, params.maxLengthToCopy, function addPartToResultInCopyToCompositeArray(part, minOffsetInPart, maxOffsetInPart) {
            part.copyToOtherAtTheEnd(result, minOffsetInPart, maxOffsetInPart);
        });

        return maxLengthCopied;
    };

    this.copyBytes = function (resultArray, resultStartOffset, rangeOptions) {
        var params = getParamsForCopyBytes(resultStartOffset, rangeOptions);

        if (params.resultWithoutCopy !== undefined) {
            return params.resultWithoutCopy;
        }

        var resultArrayOffsetInDatabin = params.databinStartOffset - params.resultStartOffset;

        var actualCopyBytes = resultArray.isDummyBufferForLengthCalculation ? function () {} : function addPartToResultInCopyBytes(part, minOffsetInPart, maxOffsetInPart) {
            part.copyToArray(resultArray, resultArrayOffsetInDatabin, minOffsetInPart, maxOffsetInPart);
        };

        var maxLengthCopied = iterateRange(params.databinStartOffset, params.maxLengthToCopy, actualCopyBytes);

        return maxLengthCopied;
    };

    this.getExistingRanges = function () {
        var result = new Array(parts.length);

        for (var i = 0; i < parts.length; ++i) {
            result[i] = {
                start: parts[i].getOffset(),
                length: parts[i].getLength()
            };
        }

        return result;
    };

    this.addData = function (header, message) {
        if (header.isLastByteInDatabin) {
            databinLengthIfKnown = header.messageOffsetFromDatabinStart + header.messageBodyLength;
        }

        if (header.messageBodyLength === 0) {
            return;
        }

        var newPart = jpipFactory.createCompositeArray(header.messageOffsetFromDatabinStart);

        var endOffsetInMessage = header.bodyStart + header.messageBodyLength;
        newPart.pushSubArray(message.subarray(header.bodyStart, endOffsetInMessage));

        // Find where to push the new message

        var indexFirstPartAfter = findFirstPartAfterOffset(header.messageOffsetFromDatabinStart);
        var indexFirstPartNearOrAfter = indexFirstPartAfter;

        if (indexFirstPartAfter > 0) {
            var previousPart = parts[indexFirstPartAfter - 1];
            var previousPartEndOffset = previousPart.getOffset() + previousPart.getLength();

            if (previousPartEndOffset === header.messageOffsetFromDatabinStart) {
                // Can merge also previous part
                --indexFirstPartNearOrAfter;
            }
        }

        if (indexFirstPartNearOrAfter >= parts.length) {
            parts.push(newPart);
            loadedBytes += header.messageBodyLength;

            return;
        }

        var firstPartNearOrAfter = parts[indexFirstPartNearOrAfter];
        var endOffsetInDatabin = header.messageOffsetFromDatabinStart + header.messageBodyLength;
        if (firstPartNearOrAfter.getOffset() > endOffsetInDatabin) {
            // Not found an overlapping part, push a new
            // part in the middle of the parts array

            for (var i = parts.length; i > indexFirstPartNearOrAfter; --i) {
                parts[i] = parts[i - 1];
            }

            parts[indexFirstPartNearOrAfter] = newPart;
            loadedBytes += header.messageBodyLength;

            return;
        }

        // Merge first and last overlapping parts - all the rest (if any) are in the middle of the new part

        var bytesAlreadySaved = firstPartNearOrAfter.getLength();

        var shouldSwap = firstPartNearOrAfter.getOffset() > header.messageOffsetFromDatabinStart;
        if (shouldSwap) {
            parts[indexFirstPartNearOrAfter] = newPart;
            newPart = firstPartNearOrAfter;

            firstPartNearOrAfter = parts[indexFirstPartNearOrAfter];
        }

        newPart.copyToOther(firstPartNearOrAfter);

        var endOffset = firstPartNearOrAfter.getOffset() + firstPartNearOrAfter.getLength();

        var partToMergeIndex;
        for (partToMergeIndex = indexFirstPartNearOrAfter; partToMergeIndex < parts.length - 1; ++partToMergeIndex) {

            if (endOffset < parts[partToMergeIndex + 1].getOffset()) {
                break;
            }

            bytesAlreadySaved += parts[partToMergeIndex + 1].getLength();
        }

        var partsToDelete = partToMergeIndex - indexFirstPartNearOrAfter;
        if (partsToDelete > 0) {
            parts[partToMergeIndex].copyToOther(firstPartNearOrAfter);

            // Delete all middle and merged parts except 1

            for (var j = indexFirstPartNearOrAfter + 1; j < parts.length - partsToDelete; ++j) {
                parts[j] = parts[j + partsToDelete];
            }

            parts.length -= partsToDelete;
        }

        loadedBytes += firstPartNearOrAfter.getLength() - bytesAlreadySaved;
    };

    function getParamsForCopyBytes(resultStartOffset, rangeOptions) {
        var forceCopyAllRange = false;
        var databinStartOffset = 0;
        var maxLengthToCopy;

        if (rangeOptions !== undefined) {
            forceCopyAllRange = !!rangeOptions.forceCopyAllRange;
            databinStartOffset = rangeOptions.databinStartOffset;
            maxLengthToCopy = rangeOptions.maxLengthToCopy;

            if (databinStartOffset === undefined) {
                databinStartOffset = 0;
            }
        }

        if (resultStartOffset === undefined) {
            resultStartOffset = 0;
        }

        if (maxLengthToCopy === 0) {
            return { resultWithoutCopy: 0 };
        }

        if (databinLengthIfKnown !== null && databinStartOffset >= databinLengthIfKnown) {
            return { resultWithoutCopy: !!maxLengthToCopy && forceCopyAllRange ? null : 0 };
        }

        var firstRelevantPartIndex = findFirstPartAfterOffset(databinStartOffset);

        if (firstRelevantPartIndex === parts.length) {
            return { resultWithoutCopy: forceCopyAllRange ? null : 0 };
        }

        if (forceCopyAllRange) {
            var isAllRequestedRangeExist = isAllRangeExist(databinStartOffset, maxLengthToCopy, firstRelevantPartIndex);

            if (!isAllRequestedRangeExist) {
                return { resultWithoutCopy: null };
            }
        }

        var params = {
            databinStartOffset: databinStartOffset,
            maxLengthToCopy: maxLengthToCopy,
            resultStartOffset: resultStartOffset
        };

        return params;
    }

    function isAllRangeExist(databinStartOffset, maxLengthToCopy, firstRelevantPartIndex) {

        if (parts[firstRelevantPartIndex].getOffset() > databinStartOffset) {
            return false;
        }

        if (maxLengthToCopy) {
            var unusedElements = databinStartOffset - parts[firstRelevantPartIndex].getOffset();
            var availableLength = parts[firstRelevantPartIndex].getLength() - unusedElements;

            var isUntilMaxLengthExist = availableLength >= maxLengthToCopy;
            return isUntilMaxLengthExist;
        }

        if (databinLengthIfKnown === null || firstRelevantPartIndex < parts.length - 1) {

            return false;
        }

        var lastPart = parts[parts.length - 1];
        var endOffsetRecieved = lastPart.getOffset() + lastPart.getLength();

        var isUntilEndOfDatabinExist = endOffsetRecieved === databinLengthIfKnown;
        return isUntilEndOfDatabinExist;
    }

    function iterateRange(databinStartOffset, maxLengthToCopy, addSubPartToResult) {

        var minOffsetInDatabinToCopy = databinStartOffset;

        var maxOffsetInDatabinToCopy;
        if (maxLengthToCopy !== undefined) {
            maxOffsetInDatabinToCopy = databinStartOffset + maxLengthToCopy;
        } else {
            var lastPart = parts[parts.length - 1];
            maxOffsetInDatabinToCopy = lastPart.getOffset() + lastPart.getLength();
        }

        var lastCopiedPart = null;

        for (var i = 0; i < parts.length; ++i) {
            if (parts[i].getOffset() >= maxOffsetInDatabinToCopy) {
                break;
            }

            var currentMinOffsetInDatabinToCopy = Math.max(minOffsetInDatabinToCopy, parts[i].getOffset());
            var currentMaxOffsetInDatabinToCopy = Math.min(maxOffsetInDatabinToCopy, parts[i].getOffset() + parts[i].getLength());

            addSubPartToResult(parts[i], currentMinOffsetInDatabinToCopy, currentMaxOffsetInDatabinToCopy);

            lastCopiedPart = parts[i];
        }

        if (lastCopiedPart === null) {
            return 0;
        }

        var lastOffsetCopied = Math.min(lastCopiedPart.getOffset() + lastCopiedPart.getLength(), maxOffsetInDatabinToCopy);

        var maxLengthCopied = lastOffsetCopied - databinStartOffset;
        return maxLengthCopied;
    }

    function findFirstPartAfterOffset(offset) {
        var index;
        for (index = 0; index < parts.length; ++index) {
            if (parts[index].getOffset() + parts[index].getLength() > offset) {
                break;
            }
        }

        return index;
    }

    return this;
};

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

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
    databinsByClass[PRECINCT_WITH_AUX_CLASS] = databinsByClass[PRECINCT_NO_AUX_CLASS];

    forbiddenInJpt[TILE_HEADER_CLASS] = true;
    forbiddenInJpt[PRECINCT_NO_AUX_CLASS] = true;
    forbiddenInJpt[PRECINCT_WITH_AUX_CLASS] = true;

    // Valid only if isJpipTilePartStream = true

    databinsByClass[TILE_NO_AUX_CLASS] = createDatabinsArray();
    databinsByClass[TILE_WITH_AUX_CLASS] = databinsByClass[TILE_NO_AUX_CLASS];

    forbiddenInJpp[TILE_NO_AUX_CLASS] = true;
    forbiddenInJpp[TILE_WITH_AUX_CLASS] = true;

    var mainHeaderDatabin = jpipFactory.createDatabinParts(6, 0);

    this.getIsJpipTilePartStream = function () {
        return isJpipTilePartStream;
    };

    this.getLoadedBytes = function getLoadedBytes() {
        return loadedBytes;
    };

    this.getMainHeaderDatabin = function () {
        return mainHeaderDatabin;
    };

    this.getTileHeaderDatabin = function (inClassIndex) {
        var databin = getDatabinFromArray(databinsByClass[TILE_HEADER_CLASS], TILE_HEADER_CLASS, inClassIndex,
        /*isJpipTilePartStreamExpected=*/false, 'tileHeader');

        return databin;
    };

    this.getPrecinctDatabin = function (inClassIndex) {
        var databin = getDatabinFromArray(databinsByClass[PRECINCT_NO_AUX_CLASS], PRECINCT_NO_AUX_CLASS, inClassIndex,
        /*isJpipTilePartStreamExpected=*/false, 'precinct');

        return databin;
    };

    this.getTileDatabin = function (inClassIndex) {
        var databin = getDatabinFromArray(databinsByClass[TILE_NO_AUX_CLASS], TILE_NO_AUX_CLASS, inClassIndex,
        /*isJpipTilePartStreamExpected=*/true, 'tilePart');

        return databin;
    };

    this.addEventListener = function addEventListener(databin, event, listener, listenerThis) {

        if (event !== 'dataArrived') {
            throw new jGlobals.jpipExceptions.InternalErrorException('Unsupported event: ' + event);
        }

        var classId = databin.getClassId();
        var inClassId = databin.getInClassId();
        var databinsArray = databinsByClass[classId];

        if (databin !== databinsArray.databins[inClassId]) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Unmatched databin ' + 'with class-ID=' + classId + ' and in-class-ID=' + inClassId);
        }

        if (databinsArray.listeners[inClassId] === undefined) {
            databinsArray.listeners[inClassId] = [];
        }

        if (databinsArray.listeners[inClassId].length === 0) {
            loadedBytesInRegisteredDatabins += databin.getLoadedBytes();
        }

        var handle = {
            listener: listener,
            listenerThis: listenerThis,
            databin: databin,
            isRegistered: true,
            index: databinsArray.listeners[inClassId].length
        };
        databinsArray.listeners[inClassId].push(handle);

        databinsArray.databinsWithListeners[inClassId] = databin;
        return handle;
    };

    this.removeEventListener = function removeEventListener(handle) {
        var classId = handle.databin.getClassId();
        var inClassId = handle.databin.getInClassId();
        var databinsArray = databinsByClass[classId];
        var listeners = databinsArray.listeners[inClassId];

        if (handle.databin !== databinsArray.databins[inClassId] || handle.databin !== databinsArray.databinsWithListeners[inClassId]) {

            throw new jGlobals.jpipExceptions.InternalErrorException('Unmatched databin ' + 'with class-ID=' + classId + ' and in-class-ID=' + inClassId);
        }

        if (handle !== listeners[handle.index]) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Incosnsitency in ' + 'databin listeners indices');
        }

        listeners[handle.index].isRegistered = false;
        listeners[handle.index] = listeners[listeners.length - 1];
        listeners[listeners.length - 1].index = handle.index;
        listeners.length -= 1;

        if (listeners.length === 0) {
            delete databinsArray.databinsWithListeners[inClassId];
            loadedBytesInRegisteredDatabins -= handle.databin.getLoadedBytes();
        }
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
            throw new jGlobals.jpipExceptions.UnsupportedFeatureException('Non zero Csn (Code Stream Index)', 'A.2.2');
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
                var databin = getDatabinFromArray(databinsArray, header.classId, header.inClassId, isJptExpected, '<class ID ' + header.classId + '>');

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
            throw new jGlobals.jpipExceptions.IllegalDataException('Main header data-bin with ' + 'in-class index other than zero is not valid', 'A.3.5');
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

    function getDatabinFromArray(databinsArray, classId, inClassId, isJpipTilePartStreamExpected, databinTypeDescription) {

        if (isJpipTilePartStreamExpected !== isJpipTilePartStream) {
            throw new jGlobals.jpipExceptions.WrongStreamException('databin of type ' + databinTypeDescription, isJpipTilePartStream);
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

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = JpipFetch;

var jGlobals = __webpack_require__(0);

function JpipFetch(fetchContext, requester, progressiveness) {
    var codestreamPartParams = null;
    var dedicatedChannelHandle = null;
    var serverRequest = null;
    var isFailure = false;
    var isTerminated = false;
    var isProgressive = false;
    //var isDone = false;
    var requestedProgressiveStage = 0;
    //var reachedQualityLayer = 0;
    var nextProgressiveStage = 0;

    this.setDedicatedChannelHandle = function setDedicatedChannelHandle(dedicatedChannelHandle_) {

        dedicatedChannelHandle = dedicatedChannelHandle_;
    };

    this.move = function move(codestreamPartParams_) {
        if (dedicatedChannelHandle === null && codestreamPartParams !== null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot move non movable fetch');
        }
        codestreamPartParams = codestreamPartParams_;
        requestData();
    };

    this.resume = function resume() {
        requestData();
    };

    this.stop = function stop() {
        if (serverRequest === null) {
            if (isTerminated /* || isDone*/) {
                    throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot stop already terminated fetch');
                }
            throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot stop already stopped fetch');
        }

        if (!dedicatedChannelHandle) {
            requester.stopRequestAsync(serverRequest);
            serverRequest = null;
        }

        // NOTE: Send a stop request within JpipRequest and resolve the Promise
        // only after server response (This is only performance issue, no
        // functional problem: a new fetch will trigger a JPIP request with
        // wait=no, and the old request will be actually stopped).
        return fetchContext.stopped();
    };

    this.terminate = function terminate() {
        if (dedicatedChannelHandle) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Unexpected terminate event on movable fetch');
        }
        if (isTerminated) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Double terminate event');
        }

        serverRequest = null;
        isTerminated = true;
    };

    this.isProgressiveChanged = function isProgressiveChanged(isProgressive_) {
        isProgressive = isProgressive_;
        if (dedicatedChannelHandle && serverRequest !== null) {
            serverRequest = null;
            requestData();
        }
    };

    function requestData() {
        if (nextProgressiveStage >= progressiveness.length) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Unexpected requestData() after fetch done');
        }
        if (serverRequest !== null && dedicatedChannelHandle === null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot resume already-active-fetch');
        }

        if (isTerminated) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot resume already-terminated-fetch');
        }

        setTimeout(function () {
            if (nextProgressiveStage >= progressiveness.length || serverRequest !== null || isTerminated) {

                return;
            }

            //if (isDone) {
            //    return;
            //}

            requestedProgressiveStage = isProgressive ? nextProgressiveStage : progressiveness.length - 1;

            serverRequest = requester.requestData(codestreamPartParams, requesterCallbackOnAllDataRecieved, requesterCallbackOnFailure, progressiveness[requestedProgressiveStage].minNumQualityLayers, dedicatedChannelHandle);
        });
    }

    function requesterCallbackOnAllDataRecieved(request, isResponseDone) {
        serverRequest = null;
        if (!isResponseDone) {
            return;
        }

        //if (isTerminated && requestedQualityLayer > reachedQualityLayer) {
        //    throw new jGlobals.jpipExceptions.IllegalDataException(
        //        'JPIP server not returned all data', 'D.3');
        //}
        nextProgressiveStage = requestedProgressiveStage;
        if (nextProgressiveStage >= progressiveness.length) {
            fetchContext.done();
        }
    }

    function requesterCallbackOnFailure() {
        //updateStatus(STATUS_ENDED, 'endAsync()');

        //if (failureCallback !== undefined) {
        //    failureCallback(self, userContextVars);
        //} else {
        //    isFailure = true;
        //}
        isFailure = true;

        //if (isMoved) {
        //    throw new jGlobals.jpipExceptions.InternalErrorException(
        //        'Failure callback to an old fetch which has been already moved');
        //}
    }
}

//function JpipFetchHandle(requester, imageDataContext, dedicatedChannelHandle) {
//    this._requester = requester;
//    this._imageDataContext = imageDataContext;
//    this._serverRequest = null;
//    this._dedicatedChannelHandle = dedicatedChannelHandle;
//    this._isFailure = false;
//    this._isMoved = false;
//    this._requestedQualityLayer = 0;
//    this._reachedQualityLayer = 0;
//    this._requesterCallbackOnFailureBound = this._requesterCallbackOnFailure.bind(this);
//    
//    if (imageDataContext.isDisposed()) {
//        throw new jGlobals.jpipExceptions.IllegalOperationException(
//            'Cannot initialize JpipFetchHandle with disposed ImageDataContext');
//    }
//    imageDataContext.on('data', this._onData.bind(this));
//}
//
//JpipFetchHandle.prototype.resume = function resume() {
//    if (this._serverRequest !== null) {
//        throw new jGlobals.jpipExceptions.IllegalOperationException(
//            'Cannot resume already-active-fetch');
//    }
//    
//    if (this._imageDataContext.isDisposed()) {
//        throw new jGlobals.jpipExceptions.IllegalOperationException(
//            'Cannot fetch data with disposed imageDataContext');
//    }
//    
//    if (this._isMoved) {
//        throw new jGlobals.jpipExceptions.IllegalOperationException(
//            'Cannot resume movable fetch which has been already moved; Should' +
//            ' start a new fetch with same dedicatedChannelHandle instead');
//    }
//    
//    this._requestData();
//};
//
//JpipFetchHandle.prototype.stopAsync = function stopAsync() {
//    if (this._serverRequest === null) {
//        if (this._imageDataContext.isDisposed() || this._imageDataContext.isDone()) {
//            return;
//        }
//        throw new jGlobals.jpipExceptions.IllegalOperationException(
//            'Cannot stop already stopped fetch');
//    }
//    
//    if (this._dedicatedChannelHandle) {
//        this._isMoved = true;
//    } else {
//        this._requester.stopRequestAsync(this._serverRequest);
//        this._serverRequest = null;
//    }
//    
//    return new Promise(function(resolve, reject) {
//        // NOTE: Send a stop request within JpipRequest and resolve the Promise
//        // only after server response (This is only performance issue, no
//        // functional problem: a new fetch will trigger a JPIP request with
//        // wait=no, and the old request will be actually stopped).
//        resolve();
//    });
//};
//
//JpipFetchHandle.prototype._requesterCallbackOnAllDataRecieved =
//    function (request, isResponseDone, requestedQualityLayer) {
//    
//    if (isResponseDone &&
//        !this._isMoved &&
//        !this._imageDataContext.isDisposed() &&
//        requestedQualityLayer > this._reachedQualityLayer) {
//            
//        throw new jGlobals.jpipExceptions.IllegalDataException(
//            'JPIP server not returned all data', 'D.3');
//    }
//};
//
//JpipFetchHandle.prototype._requesterCallbackOnFailure =
//    function requesterCallbackOnFailure() {
//        
//    //updateStatus(STATUS_ENDED, 'endAsync()');
//    
//    //if (failureCallback !== undefined) {
//    //    failureCallback(self, userContextVars);
//    //} else {
//    //    isFailure = true;
//    //}
//    this._isFailure = true;
//
//    if (this._isMoved) {
//        throw new jGlobals.jpipExceptions.InternalErrorException(
//            'Failure callback to an old fetch which has been already moved');
//    }
//};
//
//JpipFetchHandle.prototype._onData = function onData(imageDataContext) {
//    this._reachedQualityLayer = this._requestedQualityLayer;
//    
//    if (imageDataContext !== this._imageDataContext) {
//        throw new jGlobals.jpipExceptions.InternalErrorException(
//            'Unexpected ImageDataContext in FetchHandle event');
//    }
//    
//    if (!this._isMoved &&
//        !this._imageDataContext.isDisposed() &&
//        this._serverRequest !== null) {
//        
//        this._requestData();
//    }
//};
//
//JpipFetchHandle.prototype._requestData = function requestData() {
//    if (this._imageDataContext.isDone()) {
//        return;
//    }
//    
//    var self = this;
//    var numQualityLayersToWait = this._imageDataContext.getNextQualityLayer();
//    this._requestedQualityLayer = numQualityLayersToWait;
//        
//    this._serverRequest = this._requester.requestData(
//        this._imageDataContext.getCodestreamPartParams(),
//        function allDataRecieved(request, isResponseDone) {
//            self._requesterCallbackOnAllDataRecieved(
//                request, isResponseDone, numQualityLayersToWait);
//        },
//        this._requesterCallbackOnFailureBound,
//        numQualityLayersToWait,
//        this._dedicatedChannelHandle);
//};

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = JpipFetcher;

/* global console: false */

function JpipFetcher(databinsSaver, fetcherSharedObjects, options, jpipFactory) {
    options = options || {};

    var isOpenCalled = false;
    var isCloseCalled = false;

    var resolveOpen = null;
    var rejectOpen = null;

    var url = options.url;
    var progressiveness;

    this.setProgressiveness = function setProgressiveness(progressiveness_) {
        progressiveness = progressiveness_;
    };

    this.open = function open() {
        if (isOpenCalled) {
            throw 'webJpip error: Cannot call JpipFetcher.open() twice';
        }
        isOpenCalled = true;

        if (fetcherSharedObjects.openedCount) {
            ++fetcherSharedObjects.openedCount;
            return fetcherSharedObjects.openPromise;
        }

        var progressionOrder = 'RPCL';
        var maxChannelsInSession = options.maxChannelsInSession || 1;
        var maxRequestsWaitingForResponseInChannel = options.maxRequestsWaitingForResponseInChannel || 1;

        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var markersParser = jpipFactory.createMarkersParser(mainHeaderDatabin);
        var offsetsCalculator = jpipFactory.createOffsetsCalculator(mainHeaderDatabin, markersParser);
        var structureParser = jpipFactory.createStructureParser(databinsSaver, markersParser, offsetsCalculator);

        fetcherSharedObjects.codestreamStructure = jpipFactory.createCodestreamStructure(structureParser, progressionOrder);
        fetcherSharedObjects.paramsModifier = jpipFactory.createRequestParamsModifier(fetcherSharedObjects.codestreamStructure);

        fetcherSharedObjects.requester = jpipFactory.createReconnectableRequester(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, fetcherSharedObjects.codestreamStructure, databinsSaver);

        fetcherSharedObjects.requester.setStatusCallback(requesterStatusCallback);

        fetcherSharedObjects.isOpenCalledBeforePromiseInitialized = false;
        fetcherSharedObjects.openedCount = 1;
        fetcherSharedObjects.openPromise = new Promise(function (resolve, reject) {
            resolveOpen = resolve;
            rejectOpen = reject;
            fetcherSharedObjects.requester.open(url);
        });

        return fetcherSharedObjects.openPromise;
    };

    this.close = function close() {
        return new Promise(function (resolve, reject) {
            if (isCloseCalled) {
                reject('Already closed');
                return;
            }
            if (!isOpenCalled) {
                reject('Not opened');
                return;
            }
            isCloseCalled = true;

            var opened = --fetcherSharedObjects.openedCount;
            if (opened < 0) {
                reject('Inconsistency in openedCount');
            }
            if (opened === 0) {
                fetcherSharedObjects.requester.close(resolve);
            }
        });
    };

    this.on = function on() {
        // Required for all imageDecoderFramework fetcher instances
    };

    this.startFetch = function startFetch(fetchContext, codestreamPartParams) {
        var paramsModified = fetcherSharedObjects.paramsModifier.modifyCodestreamPartParams(codestreamPartParams);
        var fetch = createFetch(fetchContext);

        fetch.move(paramsModified);
    };

    this.startMovableFetch = function startMovableFetch(fetchContext, codestreamPartParams) {
        var paramsModified = fetcherSharedObjects.paramsModifier.modifyCodestreamPartParams(codestreamPartParams);
        var fetch = createFetch(fetchContext);

        var dedicatedChannelHandle = fetcherSharedObjects.requester.dedicateChannelForMovableRequest();
        fetch.setDedicatedChannelHandle(dedicatedChannelHandle);
        fetchContext.on('move', fetch.move);

        fetch.move(paramsModified);
    };

    function createFetch(fetchContext) {
        //var imageDataContext = jpipFactory.createImageDataContext(
        //    jpipObjectsForRequestContext,
        //    codestreamPartParamsModified,
        //    progressivenessModified);
        //    //{
        //    //    disableServerRequests: !!options.isOnlyWaitForData,
        //    //    isMovable: false,
        //    //    userContextVars: userContextVars,
        //    //    failureCallback: options.failureCallback
        //    //});

        var fetch = jpipFactory.createFetch(fetchContext, fetcherSharedObjects.requester, progressiveness);

        fetchContext.on('isProgressiveChanged', fetch.isProgressiveChanged);
        fetchContext.on('terminate', fetch.terminate);
        fetchContext.on('stop', fetch.stop);
        fetchContext.on('resume', fetch.resum);

        return fetch;
    }

    //this.startMovableFetch = function startMovableFetch(imageDataContext, movableFetchState) {
    //    movableFetchState.dedicatedChannelHandle =
    //        requester.dedicateChannelForMovableRequest();
    //    movableFetchState.fetchHandle = jpipFactory.createFetchHandle(
    //        requester, imageDataContext, movableFetchState.dedicatedChannelHandle);
    //    movableFetchState.fetchHandle.resume();
    //};
    //
    //this.moveFetch = function moveFetch(imageDataContext, movableFetchState) {
    //    movableFetchState.fetchHandle.stopAsync();
    //    movableFetchState.fetchHandle = jpipFactory.createFetchHandle(
    //        requester, imageDataContext, movableFetchState.dedicatedChannelHandle);
    //    movableFetchState.fetchHandle.resume();
    //};

    this.reconnect = function reconnect() {
        fetcherSharedObjects.requester.reconnect();
    };

    function requesterStatusCallback(requesterStatus) {
        var serializableException = null;
        if (requesterStatus.exception !== null) {
            serializableException = requesterStatus.exception.toString();
        }

        var status = {
            isReady: requesterStatus.isReady,
            exception: serializableException
        };

        if (!resolveOpen || !status.isReady && !status.exception) {
            if (status.exception) {
                try {
                    // TODO: Nicer way to propagate errors from here is required
                    console.error('JpipFetcher.requesterStatusCallback got ' + 'unexpected exception: ' + status.exception);
                } catch (e) {
                    // Old IE not support console.log
                }
            }

            return;
        }

        var localResolve = resolveOpen;
        var localReject = rejectOpen;
        resolveOpen = null;
        rejectOpen = null;

        if (!status.isReady) {
            localReject(status.exception);
            return;
        }

        var params = fetcherSharedObjects.codestreamStructure.getSizesParams();
        var clonedParams = JSON.parse(JSON.stringify(params));

        var tile = fetcherSharedObjects.codestreamStructure.getDefaultTileStructure();
        var component = tile.getDefaultComponentStructure();

        clonedParams.imageLevel = 0;
        clonedParams.lowestQuality = 1;
        clonedParams.highestQuality = tile.getNumQualityLayers();
        clonedParams.numResolutionLevelsForLimittedViewer = component.getNumResolutionLevels();

        localResolve(clonedParams);
    }

    return this;
}

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipHeaderModifier(offsetsCalculator, progressionOrder) {

    var encodedProgressionOrder = encodeProgressionOrder(progressionOrder);

    this.modifyMainOrTileHeader = function modifyMainOrTileHeader(result, originalDatabin, databinOffsetInResult, level) {

        if (!result.isDummyBufferForLengthCalculation) {
            modifyProgressionOrder(result, originalDatabin, databinOffsetInResult);
        }

        if (level === undefined) {
            return 0;
        }

        var bestResolutionLevelsRanges = offsetsCalculator.getRangesOfBestResolutionLevelsData(originalDatabin, level);

        if (bestResolutionLevelsRanges.numDecompositionLevelsOffset !== null && !result.isDummyBufferForLengthCalculation) {
            var offset = databinOffsetInResult + bestResolutionLevelsRanges.numDecompositionLevelsOffset;

            result[offset] -= level;
        }

        var bytesRemoved = removeRanges(result, bestResolutionLevelsRanges.ranges, databinOffsetInResult);

        var bytesAdded = -bytesRemoved;
        return bytesAdded;
    };

    this.modifyImageSize = function modifyImageSize(result, newReferenceGridSize) {

        if (result.isDummyBufferForLengthCalculation) {
            return;
        }

        var sizMarkerOffset = offsetsCalculator.getImageAndTileSizeOffset();

        var referenceGridSizeOffset = sizMarkerOffset + jGlobals.j2kOffsets.REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER;

        var imageOffsetBytesOffset = referenceGridSizeOffset + 8;
        var tileSizeBytesOffset = referenceGridSizeOffset + 16;
        var firstTileOffsetBytesOffset = referenceGridSizeOffset + 24;

        modifyInt32(result, referenceGridSizeOffset, newReferenceGridSize.regionWidth);
        modifyInt32(result, referenceGridSizeOffset + 4, newReferenceGridSize.regionHeight);

        modifyInt32(result, tileSizeBytesOffset, newReferenceGridSize.tileWidth);
        modifyInt32(result, tileSizeBytesOffset + 4, newReferenceGridSize.tileHeight);

        modifyInt32(result, imageOffsetBytesOffset, 0);
        modifyInt32(result, imageOffsetBytesOffset + 4, 0);

        modifyInt32(result, firstTileOffsetBytesOffset, 0);
        modifyInt32(result, firstTileOffsetBytesOffset + 4, 0);
    };

    this.modifyInt32 = modifyInt32;

    function modifyProgressionOrder(result, originalDatabin, databinOffsetInResult) {
        var codingStyleOffset = offsetsCalculator.getCodingStyleOffset(originalDatabin);

        if (codingStyleOffset !== null) {
            var progressionOrderOffset = databinOffsetInResult + codingStyleOffset + 5;

            result[progressionOrderOffset] = encodedProgressionOrder;
        }
    }

    function removeRanges(result, rangesToRemove, addOffset) {
        if (rangesToRemove.length === 0) {
            return 0; // zero bytes removed
        }

        if (!result.isDummyBufferForLengthCalculation) {
            for (var i = 0; i < rangesToRemove.length; ++i) {
                var offset = addOffset + rangesToRemove[i].markerSegmentLengthOffset;

                var originalMarkerSegmentLength = (result[offset] << 8) + result[offset + 1];

                var newMarkerSegmentLength = originalMarkerSegmentLength - rangesToRemove[i].length;

                result[offset] = newMarkerSegmentLength >>> 8;
                result[offset + 1] = newMarkerSegmentLength & 0xFF;
            }
        }

        var offsetTarget = addOffset + rangesToRemove[0].start;
        var offsetSource = offsetTarget;
        for (var j = 0; j < rangesToRemove.length; ++j) {
            offsetSource += rangesToRemove[j].length;

            var nextRangeOffset = j + 1 < rangesToRemove.length ? addOffset + rangesToRemove[j + 1].start : result.length;

            for (; offsetSource < nextRangeOffset; ++offsetSource) {
                result[offsetTarget] = result[offsetSource];
                ++offsetTarget;
            }
        }

        var bytesRemoved = offsetSource - offsetTarget;

        return bytesRemoved;
    }

    function modifyInt32(bytes, offset, newValue) {
        if (bytes.isDummyBufferForLengthCalculation) {
            return;
        }

        bytes[offset++] = newValue >>> 24;
        bytes[offset++] = newValue >>> 16 & 0xFF;
        bytes[offset++] = newValue >>> 8 & 0xFF;
        bytes[offset++] = newValue & 0xFF;
    }

    function encodeProgressionOrder(progressionOrder) {
        // A.6.1

        // Table A.16

        switch (progressionOrder) {
            case 'LRCP':
                return 0;

            case 'RLCP':
                return 1;

            case 'RPCL':
                return 2;

            case 'PCRL':
                return 3;

            case 'CPRL':
                return 4;

            default:
                throw new jGlobals.j2kExceptions.IllegalDataException('Progression order of ' + progressionOrder, 'A.6.1, table A.16');
        }
    }
};

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = JpipImageDataContext;

function JpipImageDataContext(jpipObjects, codestreamPart, maxQuality, progressiveness) {
    this._codestreamPart = codestreamPart;
    this._reconstructor = jpipObjects.reconstructor;
    this._packetsDataCollector = jpipObjects.packetsDataCollector;
    this._qualityLayersCache = jpipObjects.qualityLayersCache;
    this._codestreamStructure = jpipObjects.codestreamStructure;
    this._databinsSaver = jpipObjects.databinsSaver;
    this._jpipFactory = jpipObjects.jpipFactory;

    this._maxQualityPerPrecinct = [];
    this._registeredPrecinctDatabins = [];
    this._dataListeners = [];
    this._isDisposed = false;
    this._isProgressive = true;

    this._listener = this._jpipFactory.createQualityWaiter(this._codestreamPart, progressiveness, maxQuality, this._qualityLayerReachedCallback, this._codestreamStructure, this._databinsSaver, this._startTrackPrecinct, this);

    this._listener.register();
}

JpipImageDataContext.prototype.getProgressiveStagesFinished = function getProgressiveStagesFinished() {
    //ensureNoFailure();
    this._ensureNotDisposed();
    return this._listener.getProgressiveStagesFinished();
};

JpipImageDataContext.prototype.getFetchedData = function getFetchedData(quality) {
    this._ensureNotDisposed();
    if (this.getProgressiveStagesFinished() === 0) {
        throw 'JpipImageDataContext error: cannot call getFetchedData before getProgressiveStagesFinished() > 0';
    }

    //ensureNoFailure();
    var minQuality = this._listener.getQualityReached();
    if (quality) {
        if (quality > minQuality) {
            throw 'JpipImageDataContext error: getFetchedData called ' + 'with quality higher than already reached';
        }
        minQuality = quality;
    }
    var codeblocks = this._packetsDataCollector.getAllCodeblocksData(this._codestreamPart, minQuality, quality);

    var headersCodestream = this._getCodestream( /*isOnlyHeadersWithoutBitstream=*/true);

    if (codeblocks.codeblocksData === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException('Could not collect codeblocks although progressiveness ' + 'stage has been reached');
    }

    if (headersCodestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException('Could not reconstruct codestream although ' + 'progressiveness stage has been reached');
    }

    //alreadyReturnedCodeblocks = codeblocks.alreadyReturnedCodeblocks;
    return {
        headersCodestream: headersCodestream,
        codeblocksData: codeblocks.codeblocksData,
        minQuality: minQuality
    };
};

JpipImageDataContext.prototype.getFetchedDataAsCodestream = function getFetchedDataAsCodestream() {
    return this._getCodestream( /*isOnlyHeadersWithoutBitstream=*/false);
};

JpipImageDataContext.prototype.on = function on(event, listener) {
    this._ensureNotDisposed();
    if (event !== 'data') {
        throw 'JpipImageDataContext error: Unexpected event ' + event;
    }

    this._dataListeners.push(listener);
};

JpipImageDataContext.prototype.isDone = function isDone() {
    this._ensureNotDisposed();
    return this._listener.isDone();
};

JpipImageDataContext.prototype.dispose = function dispose() {
    this._ensureNotDisposed();
    this._isDisposed = true;
    this._listener.unregister();
    this._listener = null;
    for (var i = 0; i < this._registeredPrecinctDatabins.length; ++i) {
        var databinListenerHandle = this._registeredPrecinctDatabins[i];
        this._databinsSaver.removeEventListener(databinListenerHandle);
    }
};

JpipImageDataContext.prototype.setIsProgressive = function setIsProgressive(isProgressive) {
    this._ensureNotDisposed();
    var oldIsProgressive = this._isProgressive;
    this._isProgressive = isProgressive;
    if (!oldIsProgressive && isProgressive && this.getProgressiveStagesFinished() > 0) {
        for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i](this);
        }
    }
};

// Private methods

JpipImageDataContext.prototype._getCodestream = function getCodestream(isOnlyHeadersWithoutBitstream) {

    this._ensureNotDisposed();
    //ensureNoFailure();

    var qualityReached = this._listener.getQualityReached();

    var codestream;
    if (isOnlyHeadersWithoutBitstream) {
        codestream = this._reconstructor.createHeadersCodestream(this._codestreamPart);
    } else {
        codestream = this._reconstructor.createCodestream(this._codestreamPart, qualityReached);
    }

    if (codestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException('Could not reconstruct codestream although ' + 'progressiveness stage has been reached');
    }

    return codestream;
};

JpipImageDataContext.prototype._startTrackPrecinct = function startTrackPrecinct(precinctDatabin, maxQuality, precinctIterator, precinctHandle) {

    var inClassIndex = precinctDatabin.getInClassId();
    this._maxQualityPerPrecinct[inClassIndex] = maxQuality;
    var handle = this._databinsSaver.addEventListener(precinctDatabin, 'dataArrived', this._precinctDataArrived, this);
    this._registeredPrecinctDatabins.push(handle);

    this._precinctDataArrived(precinctDatabin, precinctIterator);
};

JpipImageDataContext.prototype._precinctDataArrived = function precinctDataArrived(precinctDatabin, precinctIteratorOptional) {
    var inClassIndex = precinctDatabin.getInClassId();
    var maxQuality = this._maxQualityPerPrecinct[inClassIndex];
    var qualityLayers = this._qualityLayersCache.getQualityLayerOffset(precinctDatabin, maxQuality, precinctIteratorOptional);

    this._listener.precinctQualityLayerReached(inClassIndex, qualityLayers.numQualityLayers);
};

JpipImageDataContext.prototype._qualityLayerReachedCallback = function qualityLayerReachedCallback() {
    if (!this._isProgressive && !this._listener.isDone()) {
        return;
    }

    for (var i = 0; i < this._dataListeners.length; ++i) {
        this._dataListeners[i](this);
    }
};

JpipImageDataContext.prototype._ensureNotDisposed = function ensureNotDisposed() {
    if (this._isDisposed) {
        throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot use ImageDataContext after disposed');
    }
};

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);
var LOG2 = Math.log(2);

/* TODO: Need to separate this class into two functionalities:
 * - Internal sizes calculator in jpip structure (refered as sizesCalculator)
 * - Interface for image-decoder-framework.js (implements LevelCalculator)
 * Also, some of the methods here are actually accessed from
 * codestreamStructure, which only delegates the call to here.
 */

module.exports = function JpipLevelCalculator(params) {

    var EDGE_TYPE_NO_EDGE = 0;
    var EDGE_TYPE_FIRST = 1;
    var EDGE_TYPE_LAST = 2;

    this.EDGE_TYPE_NO_EDGE = EDGE_TYPE_NO_EDGE;
    this.EDGE_TYPE_FIRST = EDGE_TYPE_FIRST;
    this.EDGE_TYPE_LAST = EDGE_TYPE_LAST;

    this.getTilesFromPixels = getTilesFromPixels;

    this.getNumTilesX = getNumTilesX;

    this.getNumTilesY = getNumTilesY;

    this.getTileWidth = getTileWidth;

    this.getTileHeight = getTileHeight;

    this.getFirstTileOffsetX = getFirstTileOffsetX;

    this.getFirstTileOffsetY = getFirstTileOffsetY;

    this.getFirstTileWidth = getFirstTileWidth;

    this.getFirstTileHeight = getFirstTileHeight;

    this.isEdgeTileId = isEdgeTileId;

    this.getTileSize = getTileSize;

    // Public methods for imageDecoderFramework.js

    this.getLevelWidth = getLevelWidth;

    this.getLevelHeight = getLevelHeight;

    this.getImageLevel = function getImageLevel() {
        return 0;
    };

    this.getLevel = function getLevel(regionImageLevel) {
        if (params.numResolutionLevelsForLimittedViewer === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' + 'is created from params returned by jpipCodestreamClient. ' + 'It shall be used for JPIP API purposes only';
        }

        var levelX = Math.log((regionImageLevel.maxXExclusive - regionImageLevel.minX) / regionImageLevel.screenWidth) / LOG2;
        var levelY = Math.log((regionImageLevel.maxYExclusive - regionImageLevel.minY) / regionImageLevel.screenHeight) / LOG2;
        var level = Math.ceil(Math.max(levelX, levelY));
        level = Math.max(0, Math.min(params.numResolutionLevelsForLimittedViewer - 1, level));
        return level;
    };

    this.getNumResolutionLevelsForLimittedViewer = function getNumResolutionLevelsForLimittedViewer() {

        if (params.numResolutionLevelsForLimittedViewer === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' + 'is created from params returned by jpipCodestreamClient. ' + 'It shall be used for JPIP API purposes only';
        }

        return params.numResolutionLevelsForLimittedViewer;
    };

    this.getLowestQuality = function getLowestQuality() {
        return 1;
    };

    this.getHighestQuality = function getHighestQuality() {
        if (params.highestQuality === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' + 'is created from params returned by jpipCodestreamClient. ' + 'It shall be used for JPIP API purposes only';
        }

        return params.highestQuality;
    };

    this.getSizeOfTiles = getSizeOfTiles;

    // Private methods

    function getSizeOfTiles(tileBounds) {
        var level = tileBounds.level;
        var tileWidth = getTileWidth(level);
        var tileHeight = getTileHeight(level);

        var firstTileIndex = tileBounds.minTileX + tileBounds.minTileY * getNumTilesX();

        var lastTileIndex = tileBounds.maxTileXExclusive - 1 + (tileBounds.maxTileYExclusive - 1) * getNumTilesX();

        var firstEdgeType = isEdgeTileId(firstTileIndex);
        var lastEdgeType = isEdgeTileId(lastTileIndex);
        var firstSize = getTileSize(firstEdgeType, level);
        var lastSize = getTileSize(lastEdgeType, level);

        var width = firstSize.width;
        var height = firstSize.height;

        var tilesX = tileBounds.maxTileXExclusive - tileBounds.minTileX;
        var tilesY = tileBounds.maxTileYExclusive - tileBounds.minTileY;

        if (tilesX > 1) {
            width += lastSize.width;
            width += tileWidth * (tilesX - 2);
        }

        if (tilesY > 1) {
            height += lastSize.height;
            height += tileHeight * (tilesY - 2);
        }

        return {
            regionWidth: width,
            regionHeight: height,
            tileWidth: tileWidth,
            tileHeight: tileHeight
        };
    }

    function getTilesFromPixels(codestreamPartParams) {
        var level = codestreamPartParams.level;

        var tileWidth = getTileWidth(level);
        var tileHeight = getTileHeight(level);

        var firstTileWidth = getFirstTileWidth(level);
        var firstTileHeight = getFirstTileHeight(level);

        var minX = codestreamPartParams.minX;
        var minY = codestreamPartParams.minY;
        var maxX = codestreamPartParams.maxXExclusive;
        var maxY = codestreamPartParams.maxYExclusive;
        var startXNoFirst = (minX - firstTileWidth) / tileWidth;
        var startYNoFirst = (minY - firstTileHeight) / tileHeight;
        var endXNoFirst = (maxX - firstTileWidth) / tileWidth;
        var endYNoFirst = (maxY - firstTileHeight) / tileHeight;

        var minTileX = Math.max(0, 1 + startXNoFirst);
        var minTileY = Math.max(0, 1 + startYNoFirst);
        var maxTileX = Math.min(getNumTilesX(), 1 + endXNoFirst);
        var maxTileY = Math.min(getNumTilesY(), 1 + endYNoFirst);

        var bounds = {
            level: level,
            minTileX: Math.floor(minTileX),
            minTileY: Math.floor(minTileY),
            maxTileXExclusive: Math.ceil(maxTileX),
            maxTileYExclusive: Math.ceil(maxTileY)
        };

        return bounds;
    }

    function getTileSize(edgeType, level) {
        var tileWidth = getTileDimensionSize(edgeType.horizontalEdgeType, getFirstTileWidth, getLevelWidth, getTileWidth);

        var tileHeight = getTileDimensionSize(edgeType.verticalEdgeType, getFirstTileHeight, getLevelHeight, getTileHeight);

        if (level !== undefined) {
            var scale = 1 << level;
            tileWidth = Math.ceil(tileWidth / scale);
            tileHeight = Math.ceil(tileHeight / scale);
        }

        return {
            width: tileWidth,
            height: tileHeight
        };
    }

    function getTileDimensionSize(edgeType, getFirstTileSize, getLevelSize, getNonEdgeTileSize) {

        var result;

        switch (edgeType) {
            case EDGE_TYPE_FIRST:
                result = getFirstTileSize();
                break;

            case EDGE_TYPE_LAST:
                var nonEdgeTileSize = getNonEdgeTileSize();
                var widthWithoutFirst = getLevelSize() - getFirstTileSize();
                result = widthWithoutFirst % nonEdgeTileSize;

                if (result === 0) {
                    result = nonEdgeTileSize;
                }

                break;

            case EDGE_TYPE_NO_EDGE:
                result = getNonEdgeTileSize();
                break;

            default:
                throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected edge type: ' + edgeType);
        }

        return result;
    }
    function isEdgeTileId(tileId) {
        var numTilesX = getNumTilesX();
        var numTilesY = getNumTilesY();

        var tileX = tileId % numTilesX;
        var tileY = Math.floor(tileId / numTilesX);

        if (tileY > numTilesY || tileX < 0 || tileY < 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Tile index ' + tileId + ' is not in range');
        }

        var horizontalEdge = tileX === 0 ? EDGE_TYPE_FIRST : tileX === numTilesX - 1 ? EDGE_TYPE_LAST : EDGE_TYPE_NO_EDGE;

        var verticalEdge = tileY === 0 ? EDGE_TYPE_FIRST : tileY === numTilesY - 1 ? EDGE_TYPE_LAST : EDGE_TYPE_NO_EDGE;

        var result = {
            horizontalEdgeType: horizontalEdge,
            verticalEdgeType: verticalEdge
        };

        return result;
    }

    function getNumTilesX() {
        var numTilesX = Math.ceil(params.imageWidth / params.tileWidth);
        return numTilesX;
    }

    function getNumTilesY() {
        var numTilesY = Math.ceil(params.imageHeight / params.tileHeight);
        return numTilesY;
    }

    function getLevelWidth(level) {
        if (level === undefined) {
            return params.imageWidth;
        }

        var size = getSizeOfTiles({
            minTileX: 0,
            maxTileXExclusive: getNumTilesX(),
            minTileY: 0,
            maxTileYExclusive: 1,
            level: level
        });

        return size.regionWidth;
    }

    function getLevelHeight(level) {
        if (level === undefined) {
            return params.imageHeight;
        }

        var size = getSizeOfTiles({
            minTileX: 0,
            maxTileXExclusive: 1,
            minTileY: 0,
            maxTileYExclusive: getNumTilesY(),
            level: level
        });

        return size.regionHeight;
    }

    function getTileWidth(level) {
        if (level === undefined) {
            return params.tileWidth;
        }

        var scale = 1 << level;
        var width = Math.ceil(params.tileWidth / scale);
        return width;
    }

    function getTileHeight(level) {
        if (level === undefined) {
            return params.tileHeight;
        }

        var scale = 1 << level;
        var height = Math.ceil(params.tileHeight / scale);
        return height;
    }

    function getFirstTileOffsetX() {
        return params.firstTileOffsetX;
    }

    function getFirstTileOffsetY() {
        return params.firstTileOffsetY;
    }

    function getFirstTileWidth(level) {
        var firstTileWidthBestLevel = getTileWidth() - getFirstTileOffsetX();

        var imageWidth = getLevelWidth();
        if (firstTileWidthBestLevel > imageWidth) {
            firstTileWidthBestLevel = imageWidth;
        }

        var scale = 1 << level;
        var firstTileWidth = Math.ceil(firstTileWidthBestLevel / scale);

        return firstTileWidth;
    }

    function getFirstTileHeight(level) {
        var firstTileHeightBestLevel = getTileHeight() - getFirstTileOffsetY();

        var imageHeight = getLevelHeight();
        if (firstTileHeightBestLevel > imageHeight) {
            firstTileHeightBestLevel = imageHeight;
        }

        var scale = 1 << level;
        var firstTileHeight = Math.ceil(firstTileHeightBestLevel / scale);

        return firstTileHeight;
    }

    return this;
};

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipMarkersParser(mainHeaderDatabin, messageHeaderParser, jpipFactory) {

    var CACHE_KEY = 'markers';

    this.getMandatoryMarkerOffsetInDatabin = function getMandatoryMarkerOffsetInDatabinClosure(databin, marker, markerName, standardSection) {

        var offset = getMarkerOffsetInDatabin(databin, marker);

        if (offset === null) {
            throw new jGlobals.j2kExceptions.IllegalDataException(markerName + ' is not found where expected to be', standardSection);
        }

        return offset;
    };

    this.checkSupportedMarkers = function checkSupportedMarkersClosure(databin, markers, isMarkersSupported) {

        isMarkersSupported = !!isMarkersSupported;

        var databinMarkers = getDatabinMarkers(databin, /*forceAllMarkersParsed=*/true);

        var markersAsProperties = {};
        for (var i = 0; i < markers.length; ++i) {
            var marker = getMarkerAsPropertyName(markers[i], 'jpipMarkersParser.supportedMarkers[' + i + ']');
            markersAsProperties[marker] = true;
        }

        for (var existingMarker in databinMarkers.markerToOffset) {
            var isMarkerInList = !!markersAsProperties[existingMarker];
            if (isMarkerInList !== isMarkersSupported) {
                throw new jGlobals.j2kExceptions.UnsupportedFeatureException('Unsupported marker found: ' + existingMarker, 'unknown');
            }
        }
    };

    this.getMarkerOffsetInDatabin = getMarkerOffsetInDatabin;

    this.isMarker = isMarker;

    function isMarker(data, marker, offset) {
        var result = data[offset] === marker[0] && data[offset + 1] === marker[1];

        return result;
    }

    function getMarkerOffsetInDatabin(databin, marker) {
        var databinMarkers = getDatabinMarkers(databin, /*forceAllMarkersParsed=*/true);

        var strMarker = getMarkerAsPropertyName(marker, 'Predefined marker in jGlobals.j2kMarkers');
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
                throw new jGlobals.j2kExceptions.IllegalDataException('SOC (Start Of Codestream) ' + 'is not found where expected to be', 'A.4.1');
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
            var marker = getMarkerAsPropertyName(bytes, 'offset ' + offset + ' of databin with class ID = ' + databinMarkers.databin.getClassId() + ' and in class ID = ' + databinMarkers.databin.getInClassId());
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

            if (bytesCopied !== null && isMarker(bytes, 0, jGlobals.j2kMarkers.StartOfData)) {

                databinMarkers.lastOffsetParsed += jGlobals.j2kOffsets.MARKER_SIZE;
                databinMarkers.isParsedAllMarkers = true;
            }
        }

        if (forceAllMarkersParsed && !databinMarkers.isParsedAllMarkers) {
            throw new jGlobals.jpipExceptions.InternalErrorException('data-bin with class ID = ' + databinMarkers.databin.getClassId() + ' and in class ID = ' + databinMarkers.databin.getInClassId() + ' was not recieved yet');
        }
    }

    function getMarkerAsPropertyName(bytes, markerPositionDescription) {
        if (bytes[0] !== 0xFF) {
            throw new jGlobals.j2kExceptions.IllegalDataException('Expected marker in ' + markerPositionDescription, 'A');
        }

        var marker = bytes[1].toString(16);
        return marker;
    }
};

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipOffsetsCalculator(mainHeaderDatabin, markersParser) {

    var supportedMarkers = [jGlobals.j2kMarkers.ImageAndTileSize, jGlobals.j2kMarkers.CodingStyleDefault, jGlobals.j2kMarkers.QuantizationDefault, jGlobals.j2kMarkers.Comment];

    this.getCodingStyleOffset = getCodingStyleOffset;

    this.getCodingStyleBaseParams = getCodingStyleBaseParams;

    this.getImageAndTileSizeOffset = function getImageAndTileSizeOffset() {
        // A.5.1 (Image and tile size marker segment)

        var sizMarkerOffset = markersParser.getMandatoryMarkerOffsetInDatabin(mainHeaderDatabin, jGlobals.j2kMarkers.ImageAndTileSize, 'Image and Tile Size (SIZ)', 'A.5.1');

        return sizMarkerOffset;
    };

    this.getRangesOfBestResolutionLevelsData = function getRangesWithDataOfResolutionLevelsClosure(databin, numResolutionLevels) {

        markersParser.checkSupportedMarkers(databin, supportedMarkers, /*isMarkersSupported=*/true);

        var numDecompositionLevelsOffset = null;

        var databinCodingStyleDefaultBaseParams = getCodingStyleBaseParams(databin, /*isMandatory=*/false);

        var databinOrMainHeaderCodingStyleBaseParams = databinCodingStyleDefaultBaseParams;
        if (databinCodingStyleDefaultBaseParams === null) {
            databinOrMainHeaderCodingStyleBaseParams = getCodingStyleBaseParams(mainHeaderDatabin, /*isMandatory=*/true);
        } else {
            numDecompositionLevelsOffset = databinCodingStyleDefaultBaseParams.numDecompositionLevelsOffset;
        }

        var codingStyleNumResolutionLevels = databinOrMainHeaderCodingStyleBaseParams.numResolutionLevels;

        if (codingStyleNumResolutionLevels <= numResolutionLevels) {
            throw new jGlobals.jpipExceptions.InternalErrorException('numResolutionLevels (' + numResolutionLevels + ') <= COD.' + 'numResolutionLevels (' + codingStyleNumResolutionLevels + ')');
        }

        var ranges = [];

        addRangeOfBestResolutionLevelsInCodingStyle(ranges, databinCodingStyleDefaultBaseParams, numResolutionLevels);

        addRangeOfBestResolutionLevelsInQuantization(ranges, databin, databinOrMainHeaderCodingStyleBaseParams, numResolutionLevels);

        var result = {
            ranges: ranges,
            numDecompositionLevelsOffset: numDecompositionLevelsOffset
        };

        return result;
    };

    function getCodingStyleBaseParams(databin, isMandatory) {

        var codingStyleDefaultOffset = getCodingStyleOffset(databin, isMandatory);

        if (codingStyleDefaultOffset === null) {
            return null;
        }

        var numBytes = 8;
        var bytesOffset = codingStyleDefaultOffset + jGlobals.j2kOffsets.MARKER_SIZE;
        var bytes = getBytes(databin, numBytes, bytesOffset);

        var codingStyleFlagsForAllComponentsOffset = 2; // Scod
        var codingStyleFlagsForAllComponents = bytes[codingStyleFlagsForAllComponentsOffset];

        var isDefaultPrecinctSize = !(codingStyleFlagsForAllComponents & 0x1);
        var isStartOfPacketMarkerAllowed = !!(codingStyleFlagsForAllComponents & 0x2);
        var isEndPacketHeaderMarkerAllowed = !!(codingStyleFlagsForAllComponents & 0x4);

        var numDecompositionLevelsOffsetInBytes = 7; // SPcod, 1st byte
        var numDecompositionLevels = bytes[numDecompositionLevelsOffsetInBytes];
        var numResolutionLevels = numDecompositionLevels + 1;

        var numDecompositionLevelsOffset = bytesOffset + numDecompositionLevelsOffsetInBytes;

        var precinctSizesOffset = isDefaultPrecinctSize ? null : codingStyleDefaultOffset + 14;

        var result = {
            codingStyleDefaultOffset: codingStyleDefaultOffset,

            isDefaultPrecinctSize: isDefaultPrecinctSize,
            isStartOfPacketMarkerAllowed: isStartOfPacketMarkerAllowed,
            isEndPacketHeaderMarkerAllowed: isEndPacketHeaderMarkerAllowed,

            numResolutionLevels: numResolutionLevels,
            precinctSizesOffset: precinctSizesOffset,
            numDecompositionLevelsOffset: numDecompositionLevelsOffset
        };

        return result;
    }

    function addRangeOfBestResolutionLevelsInCodingStyle(ranges, codingStyleDefaultBaseParams, numResolutionLevels) {

        if (codingStyleDefaultBaseParams === null || codingStyleDefaultBaseParams.isDefaultPrecinctSize) {

            return;
        }

        var levelsNotInRange = codingStyleDefaultBaseParams.numResolutionLevels - numResolutionLevels;

        var firstOffsetInRange = codingStyleDefaultBaseParams.precinctSizesOffset + levelsNotInRange;

        var markerLengthOffset = codingStyleDefaultBaseParams.codingStyleDefaultOffset + jGlobals.j2kOffsets.MARKER_SIZE;

        var precinctSizesRange = {
            markerSegmentLengthOffset: markerLengthOffset,
            start: firstOffsetInRange,
            length: numResolutionLevels
        };

        ranges.push(precinctSizesRange);
    }

    function getQuantizationDataBytesPerSubband(databin, quantizationStyleOffset) {
        var sqcdOffset = quantizationStyleOffset + 4; // Sqcd
        var bytes = getBytes(databin, /*numBytes=*/1, sqcdOffset);
        var quantizationStyle = bytes[0] & 0x1F;

        var bytesPerSubband;
        switch (quantizationStyle) {
            case 0:
                bytesPerSubband = 1;
                break;
            case 1:
                bytesPerSubband = 0;
                break;
            case 2:
                bytesPerSubband = 2;
                break;
            default:
                throw new jGlobals.j2kExceptions.IllegalDataException('Quantization style of ' + quantizationStyle, 'A.6.4');
        }

        return bytesPerSubband;
    }

    function addRangeOfBestResolutionLevelsInQuantization(ranges, databin, codingStyleDefaultBaseParams, numResolutionLevels) {

        var qcdMarkerOffset = markersParser.getMarkerOffsetInDatabin(databin, jGlobals.j2kMarkers.QuantizationDefault);

        if (qcdMarkerOffset === null) {
            return;
        }

        var bytesPerSubband = getQuantizationDataBytesPerSubband(databin, qcdMarkerOffset);

        if (bytesPerSubband === 0) {
            return;
        }

        var levelsNotInRange = codingStyleDefaultBaseParams.numResolutionLevels - numResolutionLevels;

        var subbandsNotInRange = 1 + 3 * (levelsNotInRange - 1);
        var subbandsInRange = 3 * numResolutionLevels;

        var firstOffsetInRange = qcdMarkerOffset + 5 + subbandsNotInRange * bytesPerSubband;

        var rangeLength = subbandsInRange * bytesPerSubband;

        var markerLengthOffset = qcdMarkerOffset + jGlobals.j2kOffsets.MARKER_SIZE;

        var quantizationsRange = {
            markerSegmentLengthOffset: markerLengthOffset,
            start: firstOffsetInRange,
            length: rangeLength
        };

        ranges.push(quantizationsRange);
    }

    function expectNoCodingStyleComponent(databin) {
        var cocOffset = markersParser.getMarkerOffsetInDatabin(databin, jGlobals.j2kMarkers.CodingStyleComponent);

        if (cocOffset !== null) {
            // A.6.2
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException('COC Marker (Coding Style Component)', 'A.6.2');
        }
    }

    function getCodingStyleOffset(databin, isMandatory) {
        expectNoCodingStyleComponent(databin);

        var offset;
        if (isMandatory) {
            offset = markersParser.getMandatoryMarkerOffsetInDatabin(databin, jGlobals.j2kMarkers.CodingStyleDefault, 'COD (Coding style Default)', 'A.6.1');
        } else {
            offset = markersParser.getMarkerOffsetInDatabin(databin, jGlobals.j2kMarkers.CodingStyleDefault);
        }

        return offset;
    }

    function getBytes(databin, numBytes, databinStartOffset, allowEndOfRange) {
        var bytes = [];

        var rangeOptions = {
            forceCopyAllRange: true,
            maxLengthToCopy: numBytes,
            databinStartOffset: databinStartOffset
        };

        var bytesCopied = databin.copyBytes(bytes, /*startOffset=*/0, rangeOptions);
        if (bytesCopied === null) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Header data-bin has not yet recieved ' + numBytes + ' bytes starting from offset ' + databinStartOffset);
        }

        return bytes;
    }
};

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipPacketsDataCollector(databinsSaver, qualityLayersCache, jpipFactory) {

    this.getAllCodeblocksData = function getAllCodeblocksData(codestreamPart, minQuality, maxQuality) {

        var alreadyReturnedCodeblocks = [];
        var codeblocksData = getNewCodeblocksDataAndUpdateReturnedCodeblocks(codestreamPart, minQuality, maxQuality, alreadyReturnedCodeblocks);

        return {
            codeblocksData: codeblocksData,
            alreadyReturnedCodeblocks: alreadyReturnedCodeblocks
        };
    };

    function getNewCodeblocksDataAndUpdateReturnedCodeblocks(codestreamPart, minQuality, maxQuality, alreadyReturnedCodeblocks) {

        var tileIndexInCodestreamPart = 0;
        var dummyOffset = 0;
        var tileIterator = codestreamPart.getTileIterator();
        var result = {
            packetDataOffsets: [],
            data: jpipFactory.createCompositeArray(dummyOffset),
            allRelevantBytesLoaded: 0
        };

        while (tileIterator.tryAdvance()) {
            var precinctIterator = tileIterator.createPrecinctIterator();

            var quality = tileIterator.tileStructure.getNumQualityLayers();

            if (maxQuality !== undefined && maxQuality !== 'max') {
                quality = Math.min(quality, maxQuality);
            }

            if (minQuality === 'max') {
                codestreamPart.minNumQualityLayers = quality;
            } else if (minQuality > quality) {
                throw new jGlobals.jpipExceptions.InternalErrorException('minQuality is larger than quality');
            }

            while (precinctIterator.tryAdvance()) {
                if (!precinctIterator.isInCodestreamPart) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected precinct not in codestream part');
                }

                var inClassIndex = tileIterator.tileStructure.precinctPositionToInClassIndex(precinctIterator);
                var precinctDatabin = databinsSaver.getPrecinctDatabin(inClassIndex);

                var returnedInPrecinct = alreadyReturnedCodeblocks[inClassIndex];
                if (returnedInPrecinct === undefined) {
                    returnedInPrecinct = { layerPerCodeblock: [] };
                    alreadyReturnedCodeblocks[inClassIndex] = returnedInPrecinct;
                }

                var layerReached = pushPackets(result, tileIndexInCodestreamPart, tileIterator.tileStructure, precinctIterator, precinctDatabin, returnedInPrecinct, quality);

                if (layerReached < minQuality) {
                    // NOTE: alreadyReturnedCodeblocks is wrong in this stage,
                    // because it was updated with a data which will not be
                    // returned. I don't care about it now because returning
                    // null here means something bad happened (an exception is
                    // thrown in RequestContext when this happens).
                    // If some day the consistency of alreadyReturnedCodeblocks
                    // is important then a new object should be returned on each
                    // call to this function, or a transactional style should be
                    // used here to abort all non-returned data.

                    return null;
                }
            }

            ++tileIndexInCodestreamPart;
        }

        var dataAsUint8 = new Uint8Array(result.data.getLength());
        result.data.copyToTypedArray(dataAsUint8, 0, 0, result.data.getLength());
        result.data = dataAsUint8;

        return result;
    }

    function pushPackets(result, tileIndexInCodestreamPart, tileStructure, precinctIterator, precinctDatabin, returnedCodeblocksInPrecinct, quality) {

        var layer;
        var offsetInPrecinctDatabin;

        for (layer = 0; layer < quality; ++layer) {
            var codeblockOffsetsInDatabin = qualityLayersCache.getPacketOffsetsByCodeblockIndex(precinctDatabin, layer, precinctIterator);

            if (codeblockOffsetsInDatabin === null) {
                break;
            }

            offsetInPrecinctDatabin = codeblockOffsetsInDatabin.headerStartOffset + codeblockOffsetsInDatabin.headerLength;

            var numCodeblocks = codeblockOffsetsInDatabin.codeblockBodyLengthByIndex.length;
            var codeblockOffsetsInResult = new Array(numCodeblocks);

            var isIncompletePacket = false;

            for (var i = 0; i < numCodeblocks; ++i) {
                var returned = returnedCodeblocksInPrecinct.layerPerCodeblock[i];
                if (returned === undefined) {
                    returned = { layer: -1 };
                    returnedCodeblocksInPrecinct.layerPerCodeblock[i] = returned;
                } else if (returned.layer >= layer) {
                    continue;
                }

                var codeblock = codeblockOffsetsInDatabin.codeblockBodyLengthByIndex[i];

                var offsetInResultArray = result.data.getLength();

                var bytesCopied = precinctDatabin.copyToCompositeArray(result.data, {
                    databinStartOffset: offsetInPrecinctDatabin,
                    maxLengthToCopy: codeblock.codeblockBodyLengthBytes,
                    forceCopyAllRange: true
                });

                if (bytesCopied !== codeblock.codeblockBodyLengthBytes) {
                    codeblockOffsetsInResult.length = i;
                    isIncompletePacket = true;
                    break;
                }

                returned.layer = layer;
                codeblockOffsetsInResult[i] = {
                    start: offsetInResultArray,
                    end: offsetInResultArray + codeblock.codeblockBodyLengthBytes,
                    codingpasses: codeblock.codingPasses,
                    zeroBitPlanes: codeblock.zeroBitPlanes
                };

                offsetInPrecinctDatabin += codeblock.codeblockBodyLengthBytes;
            }

            var precinctIndex = tileStructure.precinctPositionToIndexInComponentResolution(precinctIterator);
            var packet = {
                tileIndex: tileIndexInCodestreamPart,
                r: precinctIterator.resolutionLevel,
                p: precinctIndex,
                c: precinctIterator.component,
                l: layer,
                codeblockOffsets: codeblockOffsetsInResult
            };

            result.packetDataOffsets.push(packet);

            if (isIncompletePacket) {
                break;
            }
        }

        result.allRelevantBytesLoaded += offsetInPrecinctDatabin;
        return layer;
    }
};

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipParamsCodestreamPart(codestreamPartParams, codestreamStructure, jpipFactory) {

    var tilesBounds = null;
    var fullTilesSize = null;

    Object.defineProperty(this, 'level', { get: function get() {
            return codestreamPartParams ? codestreamPartParams.level : 0;
        } });

    Object.defineProperty(this, 'fullTilesSize', { get: function get() {
            if (fullTilesSize === null) {
                validateTilesBounds();
                fullTilesSize = codestreamStructure.getSizeOfTiles(tilesBounds);
            }
            return fullTilesSize;
        } });

    Object.defineProperty(this, 'tilesBounds', { get: function get() {
            validateTilesBounds();
            return tilesBounds;
        } });

    this.getTileIterator = function () {
        var setableIterator = {
            isStarted: false,
            currentX: -1,
            currentY: -1
        };

        var iterator = {
            get tileIndex() {
                if (!setableIterator.isStarted) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('iterator.tileIndex accessed before tryAdvance()');
                }

                var tilesInRow = codestreamStructure.getNumTilesX();
                var firstInRow = setableIterator.currentY * tilesInRow;
                var index = firstInRow + setableIterator.currentX;

                return index;
            },

            get tileStructure() {
                if (!setableIterator.isStarted) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('iterator.tileIndex accessed before tryAdvance()');
                }
                var idx = iterator.tileIndex;
                var tileStructure = codestreamStructure.getTileStructure(idx);
                return tileStructure;
            },

            createPrecinctIterator: function createPrecinctIterator(isIteratePrecinctsNotInCodestreamPart) {

                if (!setableIterator.isStarted) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('iterator.tileIndex accessed before tryAdvance()');
                }
                var idx = iterator.tileIndex;
                return jpipFactory.createParamsPrecinctIterator(codestreamStructure, idx, codestreamPartParams, isIteratePrecinctsNotInCodestreamPart);
            },

            tryAdvance: function tryAdvance() {
                var result = tryAdvanceTileIterator(setableIterator);
                return result;
            }
        };

        return iterator;
    };

    function tryAdvanceTileIterator(setableIterator) {
        if (!setableIterator.isStarted) {
            validateTilesBounds();
            setableIterator.isStarted = true;
            setableIterator.currentX = tilesBounds.minTileX;
            setableIterator.currentY = tilesBounds.minTileY;

            return true;
        }

        if (setableIterator.currentY >= tilesBounds.maxTileYExclusive) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot advance tile iterator after end');
        }

        ++setableIterator.currentX;
        if (setableIterator.currentX < tilesBounds.maxTileXExclusive) {
            return true;
        }

        setableIterator.currentX = tilesBounds.minTileX;
        ++setableIterator.currentY;

        var isMoreTilesAvailable = setableIterator.currentY < tilesBounds.maxTileYExclusive;

        return isMoreTilesAvailable;
    }

    function validateTilesBounds() {
        if (tilesBounds !== null) {
            return;
        }
        if (!codestreamPartParams) {
            tilesBounds = {
                level: 0,
                minTileX: 0,
                minTileY: 0,
                maxTileXExclusive: codestreamStructure.getNumTilesX(),
                maxTileYExclusive: codestreamStructure.getNumTilesY()
            };
        } else {
            tilesBounds = codestreamStructure.getTilesFromPixels(codestreamPartParams);
        }
    }
};

/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipParamsPrecinctIterator(codestreamStructure, tileIndex, codestreamPartParams, isIteratePrecinctsNotInCodestreamPart) {

    var isInitialized = false;
    var component = 0;
    var precinctX = precinctX;
    var precinctY = precinctY;
    var resolutionLevel = 0;
    var isInCodestreamPart = true;
    var precinctIndexInComponentResolution = -1;
    var inClassIndex = -1;
    var progressionOrder;
    var precinctsInCodestreamPartPerLevelPerComponent = null;
    var tileStructure;

    // A.6.1 in part 1: Core Coding System

    Object.defineProperty(this, 'tileIndex', { get: function get() {
            return tileIndex;
        } });
    Object.defineProperty(this, 'component', { get: function get() {
            return component;
        } });
    Object.defineProperty(this, 'precinctX', { get: function get() {
            return precinctX;
        } });
    Object.defineProperty(this, 'precinctY', { get: function get() {
            return precinctY;
        } });
    Object.defineProperty(this, 'resolutionLevel', { get: function get() {
            return resolutionLevel;
        } });
    Object.defineProperty(this, 'isInCodestreamPart', { get: function get() {
            return isInCodestreamPart;
        } });

    this.tryAdvance = function tryAdvance() {
        if (!isInitialized) {
            initialize();
            isInitialized = true;
            return true;
        }

        var needAdvanceNextMember = true;
        var precinctsRangeHash = isIteratePrecinctsNotInCodestreamPart ? null : precinctsInCodestreamPartPerLevelPerComponent;

        var needResetPrecinctToMinimalInCodestreamPart = false;

        precinctIndexInComponentResolution = -1;
        inClassIndex = -1;

        for (var i = 2; i >= 0; --i) {
            var newValue = advanceProgressionOrderMember(i, precinctsRangeHash);

            needAdvanceNextMember = newValue === 0;
            if (!needAdvanceNextMember) {
                break;
            }

            if (progressionOrder[i] === 'P' && !isIteratePrecinctsNotInCodestreamPart) {

                needResetPrecinctToMinimalInCodestreamPart = true;
            }
        }

        if (needAdvanceNextMember) {
            // If we are here, the last precinct has been reached
            return false;
        }

        if (precinctsInCodestreamPartPerLevelPerComponent === null) {
            isInCodestreamPart = true;
            return true;
        }

        var rangePerLevel = precinctsInCodestreamPartPerLevelPerComponent[component];
        var precinctsRange = rangePerLevel[resolutionLevel];

        if (needResetPrecinctToMinimalInCodestreamPart) {
            precinctX = precinctsRange.minPrecinctX;
            precinctY = precinctsRange.minPrecinctY;
        }

        isInCodestreamPart = precinctX >= precinctsRange.minPrecinctX && precinctY >= precinctsRange.minPrecinctY && precinctX < precinctsRange.maxPrecinctXExclusive && precinctY < precinctsRange.maxPrecinctYExclusive;

        return true;
    };

    function initialize() {
        tileStructure = codestreamStructure.getTileStructure(tileIndex);

        if (!!codestreamPartParams && codestreamPartParams.level !== undefined) {

            var minNumResolutionLevels = tileStructure.getMinNumResolutionLevelsOverComponents();

            if (minNumResolutionLevels <= codestreamPartParams.level) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Cannot advance resolution: level=' + codestreamPartParams.level + ' but should be smaller than ' + minNumResolutionLevels);
            }
        }

        precinctsInCodestreamPartPerLevelPerComponent = getPrecinctsInCodestreamPartPerLevelPerComponent();

        if (!isIteratePrecinctsNotInCodestreamPart && precinctsInCodestreamPartPerLevelPerComponent !== null) {

            var firstPrecinctsRange = precinctsInCodestreamPartPerLevelPerComponent[0][0];
            precinctX = firstPrecinctsRange.minPrecinctX;
            precinctY = firstPrecinctsRange.minPrecinctY;
        }

        progressionOrder = tileStructure.getProgressionOrder();
    }

    function getPrecinctsInCodestreamPartPerLevelPerComponent() {
        if (!codestreamPartParams) {
            return null;
        }

        var components = codestreamStructure.getNumComponents();
        var perComponentResult = new Array(components);
        var minLevel = codestreamPartParams.level || 0;

        var tileLeftInLevel = codestreamStructure.getTileLeft(tileIndex, minLevel);
        var tileTopInLevel = codestreamStructure.getTileTop(tileIndex, minLevel);

        var minXInTile = codestreamPartParams.minX - tileLeftInLevel;
        var minYInTile = codestreamPartParams.minY - tileTopInLevel;
        var maxXInTile = codestreamPartParams.maxXExclusive - tileLeftInLevel;
        var maxYInTile = codestreamPartParams.maxYExclusive - tileTopInLevel;

        for (var component = 0; component < components; ++component) {
            var componentStructure = tileStructure.getComponentStructure(component);
            var levels = componentStructure.getNumResolutionLevels();
            var levelsInCodestreamPart = levels - minLevel;
            var numResolutionLevels = componentStructure.getNumResolutionLevels();
            var perLevelResult = new Array(levels);

            for (var level = 0; level < levelsInCodestreamPart; ++level) {
                var componentScaleX = componentStructure.getComponentScaleX();
                var componentScaleY = componentStructure.getComponentScaleY();
                var levelInCodestreamPart = levelsInCodestreamPart - level - 1;
                var levelScaleX = componentScaleX << levelInCodestreamPart;
                var levelScaleY = componentScaleY << levelInCodestreamPart;

                var redundant = 4; // Redundant pixels for wavelet 9-7 convolution
                var minXInLevel = Math.floor(minXInTile / levelScaleX) - redundant;
                var minYInLevel = Math.floor(minYInTile / levelScaleY) - redundant;
                var maxXInLevel = Math.ceil(maxXInTile / levelScaleX) + redundant;
                var maxYInLevel = Math.ceil(maxYInTile / levelScaleY) + redundant;

                var precinctWidth = componentStructure.getPrecinctWidth(level) * componentScaleX;
                var precinctHeight = componentStructure.getPrecinctHeight(level) * componentScaleY;

                var minPrecinctX = Math.floor(minXInLevel / precinctWidth);
                var minPrecinctY = Math.floor(minYInLevel / precinctHeight);
                var maxPrecinctX = Math.ceil(maxXInLevel / precinctWidth);
                var maxPrecinctY = Math.ceil(maxYInLevel / precinctHeight);

                var precinctsX = componentStructure.getNumPrecinctsX(level);
                var precinctsY = componentStructure.getNumPrecinctsY(level);

                perLevelResult[level] = {
                    minPrecinctX: Math.max(0, minPrecinctX),
                    minPrecinctY: Math.max(0, minPrecinctY),
                    maxPrecinctXExclusive: Math.min(maxPrecinctX, precinctsX),
                    maxPrecinctYExclusive: Math.min(maxPrecinctY, precinctsY)
                };
            }

            perComponentResult[component] = perLevelResult;
        }

        return perComponentResult;
    }

    function advanceProgressionOrderMember(memberIndex, precinctsRange) {
        var componentStructure = tileStructure.getComponentStructure(component);

        switch (progressionOrder[memberIndex]) {
            case 'R':
                var numResolutionLevels = componentStructure.getNumResolutionLevels();
                if (!!codestreamPartParams && codestreamPartParams.level) {
                    numResolutionLevels -= codestreamPartParams.level;
                }

                ++resolutionLevel;
                resolutionLevel %= numResolutionLevels;
                return resolutionLevel;

            case 'C':
                ++component;
                component %= codestreamStructure.getNumComponents();
                return component;

            case 'P':
                var minX, minY, maxX, maxY;
                if (precinctsRange !== null) {
                    var precinctsRangePerLevel = precinctsRange[component];
                    var precinctsRangeInLevelComponent = precinctsRangePerLevel[resolutionLevel];

                    minX = precinctsRangeInLevelComponent.minPrecinctX;
                    minY = precinctsRangeInLevelComponent.minPrecinctY;
                    maxX = precinctsRangeInLevelComponent.maxPrecinctXExclusive;
                    maxY = precinctsRangeInLevelComponent.maxPrecinctYExclusive;
                } else {
                    minX = 0;
                    minY = 0;
                    maxX = componentStructure.getNumPrecinctsX(resolutionLevel);
                    maxY = componentStructure.getNumPrecinctsY(resolutionLevel);
                }

                precinctX -= minX - 1;
                precinctX %= maxX - minX;
                precinctX += minX;

                if (precinctX != minX) {
                    return precinctX - minX;
                }

                precinctY -= minY - 1;
                precinctY %= maxY - minY;
                precinctY += minY;

                return precinctY - minY;

            case 'L':
                throw new jGlobals.jpipExceptions.InternalErrorException('Advancing L is not supported in JPIP');

            default:
                throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected letter in progression order: ' + progressionOrder[memberIndex]);
        }
    }

    return this;
};

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipPrecinctCodestreamPart(sizesCalculator, tileStructure, tileIndex, component, levelIndex, precinctX, precinctY) {

    var fullTilesSize = null;
    var tilesBounds = null;
    var level = calculateLevel();

    Object.defineProperty(this, 'level', { get: function get() {
            return level;
        } });

    Object.defineProperty(this, 'fullTilesSize', { get: function get() {
            if (fullTilesSize === null) {
                var tileBounds = this.tilesBounds;
                fullTilesSize = sizesCalculator.getSizeOfTiles(tileBounds);
            }
            return fullTilesSize;
        } });

    Object.defineProperty(this, 'tilesBounds', { get: function get() {
            if (tilesBounds === null) {
                var numTilesX = sizesCalculator.getNumTilesX();
                var x = tileIndex % numTilesX;
                var y = Math.floor(tileIndex / numTilesX);
                tilesBounds = {
                    level: level,
                    minTileX: x,
                    minTileY: y,
                    maxTileXExclusive: x + 1,
                    maxTileYExclusive: y + 1
                };
            }
            return tilesBounds;
        } });

    this.getTileIterator = function () {
        var tryAdvanceTileCalls = 0;

        return {
            get tileIndex() {
                checkValidTileIterator('tile', tryAdvanceTileCalls);
                return tileIndex;
            },

            get tileStructure() {
                checkValidTileIterator('tile', tryAdvanceTileCalls);
                return tileStructure;
            },

            tryAdvance: function tryAdvance() {
                if (tryAdvanceTileCalls > 2) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('Cannot advance tile iterator after ended');
                }
                ++tryAdvanceTileCalls;
                return tryAdvanceTileCalls < 2;
            },

            createPrecinctIterator: function createPrecinctIterator(isIteratePrecinctsNotInCodestreamPart) {

                checkValidTileIterator('tile', tryAdvanceTileCalls);

                if (isIteratePrecinctsNotInCodestreamPart) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('Precinct iterator of single precinct part cannot ' + 'iterate precincts out of part');
                }

                var tryAdvanceCalls = 0;

                return {
                    get tileIndex() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return tileIndex;
                    },
                    get component() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return component;
                    },
                    get precinctX() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return precinctX;
                    },
                    get precinctY() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return precinctY;
                    },
                    get resolutionLevel() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return levelIndex;
                    },
                    get isInCodestreamPart() {
                        checkValidTileIterator('precinct', tryAdvanceCalls);
                        return true;
                    },
                    tryAdvance: function tryAdvance() {
                        if (tryAdvanceCalls > 1) {
                            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot advance precinct iterator after ended');
                        }
                        ++tryAdvanceCalls;
                        return tryAdvanceCalls < 2;
                    }
                };
            }
        };
    };

    function checkValidTileIterator(iteratorType, tryAdvanceCalls) {
        if (tryAdvanceCalls === 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot use ' + iteratorType + ' iterator before started');
        } else if (tryAdvanceCalls > 1) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot use ' + iteratorType + ' iterator after ended');
        }
    }

    function calculateLevel() {
        var componentStructure = tileStructure.getComponentStructure(component);
        var numResolutionLevelsInComponent = componentStructure.getNumResolutionLevels();
        return numResolutionLevelsInComponent - levelIndex - 1;
    }
};

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipPrecinctsIteratorWaiter(codestreamPart, codestreamStructure, databinsSaver, iteratePrecinctCallback, jpipFactory) {

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
            throw new jGlobals.jpipExceptions.InternalErrorException('JpipQualityWaiter already registered');
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

            var handle = databinsSaver.addEventListener(databin, 'dataArrived', tileHeaderDataArrived);
            registeredTileHeaderDatabins.push(handle);

            ++tileHeadersNotLoaded;
            tileHeaderDataArrived(databin);
        }

        --tileHeadersNotLoaded;
    };

    this.unregister = function unregister() {
        if (!isRegistered) {
            throw new jGlobals.jpipExceptions.InternalErrorException('JpipQualityWaiter not registered');
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
                throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected precinct not in codestream part');
            }

            iteratePrecinctCallback(precinctIterator, tileStructure);
        }
    }
};

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipQualityWaiter(codestreamPart, progressiveness, maxQuality, qualityLayerReachedCallback, codestreamStructure, databinsSaver, startTrackPrecinctCallback, callbacksThis, jpipFactory) {

    // NOTE: (performance) Toggled between int and string ('max')
    var minNumQualityLayersReached = 0;
    var progressiveStagesFinished = 0;
    var isRegistered = false;
    var isRequestDone = false;

    var accumulatedDataPerPrecinct = [];
    var precinctCountByReachedQualityLayer = [0];
    var precinctCountInMaxQualityLayer = 0;
    var precinctCount = 0;
    var pendingPrecinctUpdate = [];

    var defaultTileStructure = codestreamStructure.getDefaultTileStructure();
    var defaultNumQualityLayers = defaultTileStructure.getNumQualityLayers();

    var precinctsWaiter = jpipFactory.createPrecinctsIteratorWaiter(codestreamPart, codestreamStructure, databinsSaver, iteratePrecinctCallback);

    this.register = function register() {
        precinctsWaiter.register();
        isRegistered = true;
        tryAdvanceQualityLayersReached();
    };

    this.unregister = function unregister() {
        precinctsWaiter.unregister();
    };

    this.precinctQualityLayerReached = function precinctQualityLayerReached(precinctInClassId, qualityReached) {

        var accumulatedData = updatePrecinctData(precinctInClassId, qualityReached);

        if (accumulatedData.isUpdated && accumulatedData.qualityInTile) {
            accumulatedData.isUpdated = false;
            tryAdvanceQualityLayersReached();
        }
    };

    this.getProgressiveStagesFinished = function getProgressiveStagesFinished() {
        return progressiveStagesFinished;
    };

    this.isDone = function isDone() {
        return isRequestDone;
    };

    this.getQualityReached = function getQualityReached() {
        if (progressiveStagesFinished === 0) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot create codestream before first progressiveness ' + 'stage has been reached');
        }

        var qualityReached = progressiveness[progressiveStagesFinished - 1].minNumQualityLayers;

        return qualityReached;
    };

    function iteratePrecinctCallback(precinctIterator, tileStructure) {
        var inClassIndex = tileStructure.precinctPositionToInClassIndex(precinctIterator);
        var precinctDatabin = databinsSaver.getPrecinctDatabin(inClassIndex);

        if (accumulatedDataPerPrecinct[inClassIndex]) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Precinct was iterated twice in codestream part');
        }

        ++precinctCountByReachedQualityLayer[0];
        ++precinctCount;
        var qualityInTile = tileStructure.getNumQualityLayers();
        accumulatedDataPerPrecinct[inClassIndex] = {
            qualityReached: 0,
            isUpdated: false,
            isMaxQuality: false,
            qualityInTile: qualityInTile
        };

        var pendingQualityReached = pendingPrecinctUpdate[inClassIndex];
        if (pendingQualityReached) {
            delete pendingPrecinctUpdate[inClassIndex];
            updatePrecinctData(inClassIndex, pendingQualityReached);
        }

        startTrackPrecinctCallback.call(callbacksThis, precinctDatabin, qualityInTile, precinctIterator, inClassIndex, tileStructure);

        if (isRegistered) {
            tryAdvanceQualityLayersReached();
        }
    }

    function updatePrecinctData(precinctInClassId, qualityReached) {
        var accumulatedData = accumulatedDataPerPrecinct[precinctInClassId];
        if (!accumulatedData) {
            pendingPrecinctUpdate[precinctInClassId] = qualityReached;
            return;
        }

        --precinctCountByReachedQualityLayer[accumulatedData.qualityReached];
        if (accumulatedData.isMaxQuality) {
            --precinctCountInMaxQualityLayer;
            accumulatedData.isMaxQuality = false;
        }

        // qualityReached in last quality might arrive either as 'max' or number. Normalize both cases to number
        var qualityReachedNumeric = qualityReached === 'max' ? accumulatedData.qualityInTile : qualityReached;
        accumulatedData.isUpdated = accumulatedData.qualityReached !== qualityReachedNumeric;
        accumulatedData.qualityReached = qualityReachedNumeric;

        if (qualityReachedNumeric === accumulatedData.qualityInTile) {
            ++precinctCountInMaxQualityLayer;
            accumulatedData.isMaxQuality = true;
        }

        var count = precinctCountByReachedQualityLayer[qualityReachedNumeric] || 0;
        precinctCountByReachedQualityLayer[qualityReachedNumeric] = count + 1;

        return accumulatedData;
    }

    function tryAdvanceQualityLayersReached() {
        if (precinctCountByReachedQualityLayer.length === 0 || precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0 || minNumQualityLayersReached === 'max' || progressiveStagesFinished >= progressiveness.length || !precinctsWaiter.isAllTileHeadersLoaded()) {

            return;
        }

        if (isRequestDone) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Request already done but callback is called');
        }

        var hasPrecinctsInQualityLayer;

        do {
            ++minNumQualityLayersReached;

            if (minNumQualityLayersReached >= precinctCountByReachedQualityLayer.length) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Advancing progressiveness rolled out of array of precincts counts by quality');
            }

            hasPrecinctsInQualityLayer = precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0;
        } while (!hasPrecinctsInQualityLayer);

        var numQualityLayersToWait = progressiveness[progressiveStagesFinished].minNumQualityLayers;

        if (minNumQualityLayersReached < numQualityLayersToWait) {
            return;
        }

        var isFirst = true;
        while (progressiveStagesFinished < progressiveness.length) {
            var qualityLayersRequired = progressiveness[progressiveStagesFinished].minNumQualityLayers;

            if (qualityLayersRequired === 'max' && precinctCountInMaxQualityLayer !== precinctCount || qualityLayersRequired > minNumQualityLayersReached) {

                break;
            }

            var forceCurrentStage = progressiveness[progressiveStagesFinished].forceMaxQuality === 'force' || progressiveness[progressiveStagesFinished].forceMaxQuality === 'forceAll';

            var skipForceCheck = true;
            if (progressiveStagesFinished < progressiveness.length - 1) {
                /*
                    This check captures the following common case of progressiveness:
                    [{ minNumQualityLayers: 1, forceMaxQuality: 'force' },
                     { minNumQualityLayers: 'max', forceMaxQuality: 'no' }]
                    This is the automatic progressiveness for an image with single quality layer.
                    The check here tries to avoid calling the callback twice in case that all precincts
                    have only single quality layer, which makes both stages identical.
                    Handling this situation by eliminating the first stage when calculating the automatic
                    progressiveness is wrong in case that there are tiles with non-default count of quality
                    layers that is bigger than 1, thus it should be handled here.
                 */
                skipForceCheck = precinctCountInMaxQualityLayer === precinctCount && progressiveness[progressiveStagesFinished + 1].minNumQualityLayers === 'max';
            }

            ++progressiveStagesFinished;

            if (!isFirst && !skipForceCheck && forceCurrentStage) {
                qualityLayerReachedCallback.call(callbacksThis);
            }

            isFirst = false;
        }

        isRequestDone = progressiveStagesFinished === progressiveness.length;

        qualityLayerReachedCallback.call(callbacksThis);
    }
};

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = JpipRequestParamsModifier;

function JpipRequestParamsModifier(codestreamStructure) {
    this.modifyCodestreamPartParams = function modifyCodestreamPartParams(codestreamPartParams) {
        var codestreamPartParamsModified = castCodestreamPartParams(codestreamPartParams);
        return codestreamPartParamsModified;
    };

    this.modifyCustomProgressiveness = function modifyCustomProgressiveness(progressiveness) {
        if (!progressiveness || !progressiveness.length) {
            throw new jGlobals.jpipExceptions.ArgumentException('progressiveness', progressiveness, 'custom progressiveness argument should be non empty array');
        }

        // Ensure than minNumQualityLayers is given for all items

        var result = new Array(progressiveness.length);

        for (var i = 0; i < progressiveness.length; ++i) {
            var minNumQualityLayers = progressiveness[i].minNumQualityLayers;

            if (minNumQualityLayers !== 'max') {
                minNumQualityLayers = validateNumericParam(minNumQualityLayers, 'progressiveness[' + i + '].minNumQualityLayers');
            }

            var forceMaxQuality = 'no';
            if (progressiveness[i].forceMaxQuality) {
                forceMaxQuality = progressiveness[i].forceMaxQuality;
                if (forceMaxQuality !== 'no' && forceMaxQuality !== 'force' && forceMaxQuality !== 'forceAll') {

                    throw new jGlobals.jpipExceptions.ArgumentException('progressiveness[' + i + '].forceMaxQuality', forceMaxQuality, 'forceMaxQuality should be "no", "force" or "forceAll"');
                }

                if (forceMaxQuality === 'forceAll') {
                    throw new jGlobals.jpipExceptions.UnsupportedFeatureException('"forceAll" value for forceMaxQuality in progressiveness');
                }
            }

            result[i] = {
                minNumQualityLayers: minNumQualityLayers,
                forceMaxQuality: forceMaxQuality
            };
        }

        return result;
    };

    this.getAutomaticProgressiveness = function getAutomaticProgressiveness(maxQuality) {
        // Create progressiveness of (1, 2, 3, (#max-quality/2), (#max-quality))

        var progressiveness = [];

        // No progressiveness, wait for all quality layers to be fetched
        var tileStructure = codestreamStructure.getDefaultTileStructure();
        var numQualityLayersNumeric = tileStructure.getNumQualityLayers();
        var qualityNumericOrMax = 'max';

        if (maxQuality !== undefined && maxQuality !== 'max') {
            numQualityLayersNumeric = Math.min(numQualityLayersNumeric, maxQuality);
            qualityNumericOrMax = numQualityLayersNumeric;
        }

        var firstQualityLayersCount = numQualityLayersNumeric < 4 ? numQualityLayersNumeric - 1 : 3;

        for (var i = 1; i < firstQualityLayersCount; ++i) {
            progressiveness.push({
                minNumQualityLayers: i,
                forceMaxQuality: 'no'
            });
        }

        var middleQuality = Math.round(numQualityLayersNumeric / 2);
        if (middleQuality > firstQualityLayersCount && (qualityNumericOrMax === 'max' || middleQuality < qualityNumericOrMax)) {
            progressiveness.push({
                minNumQualityLayers: middleQuality,
                forceMaxQuality: 'no'
            });
        }

        progressiveness.push({
            minNumQualityLayers: qualityNumericOrMax,
            forceMaxQuality: 'no'
        });

        // Force decoding only first quality layers for quicker show-up
        progressiveness[0].forceMaxQuality = 'force';

        return progressiveness;
    };

    function castCodestreamPartParams(codestreamPartParams) {
        var level = validateNumericParam(codestreamPartParams.level, 'level',
        /*defaultValue=*/undefined,
        /*allowUndefiend=*/true);

        var minX = validateNumericParam(codestreamPartParams.minX, 'minX');
        var minY = validateNumericParam(codestreamPartParams.minY, 'minY');

        var maxX = validateNumericParam(codestreamPartParams.maxXExclusive, 'maxXExclusive');

        var maxY = validateNumericParam(codestreamPartParams.maxYExclusive, 'maxYExclusive');

        var levelWidth = codestreamStructure.getLevelWidth(level);
        var levelHeight = codestreamStructure.getLevelHeight(level);

        if (minX < 0 || maxX > levelWidth || minY < 0 || maxY > levelHeight || minX >= maxX || minY >= maxY) {

            throw new jGlobals.jpipExceptions.ArgumentException('codestreamPartParams', codestreamPartParams);
        }

        var result = {
            minX: minX,
            minY: minY,
            maxXExclusive: maxX,
            maxYExclusive: maxY,
            level: level
        };

        return result;
    }

    function validateNumericParam(inputValue, propertyName, defaultValue, allowUndefined) {

        if (inputValue === undefined && (defaultValue !== undefined || allowUndefined)) {

            return defaultValue;
        }

        var result = +inputValue;
        if (isNaN(result) || result !== Math.floor(result)) {
            throw new jGlobals.jpipExceptions.ArgumentException(propertyName, inputValue);
        }

        return result;
    }
}

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipRequest(sessionHelper, messageHeaderParser, channel, requestUrl, callback, failureCallback) {

    var KB = 1024;
    var PROGRESSIVENESS_MIN_LENGTH_BYTES = 10 * KB;

    var RESPONSE_ENDED_SUCCESS = 1;
    var RESPONSE_ENDED_ABORTED = 2;
    var RESPONSE_ENDED_SENT_ANOTHER_MESSAGE = 3;

    var self = this;
    var isActive = false;
    var endedByUser = false;
    var lastRequestId;
    var responseLength = PROGRESSIVENESS_MIN_LENGTH_BYTES;

    this.startRequest = function startRequest() {
        if (isActive) {
            throw new jGlobals.jpipExceptions.InternalErrorException('startRequest called twice');
        } else if (endedByUser) {
            throw new jGlobals.jpipExceptions.InternalErrorException('request was already stopped');
        }

        isActive = true;
        sessionHelper.requestStarted();

        sendMessageOfDataRequest();
    };

    this.stopRequestAsync = function stopRequestAsync(request) {
        endedByUser = true;
    };

    this.getLastRequestId = function getLastRequestId() {
        if (!isActive) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected call to getLastRequestId on inactive request');
        }

        return lastRequestId;
    };

    this.callCallbackAfterConcurrentRequestsFinished = function callCallbackAfterConcurrentRequestsFinished() {

        callback(self, /*isResponseDone=*/true);
    };

    function internalSuccessCallback(ajaxResponse, isResponseDone) {
        var failed = false;

        try {
            var endedReason = processAjaxResponse(ajaxResponse, isResponseDone);

            if (endedReason === RESPONSE_ENDED_SENT_ANOTHER_MESSAGE) {
                return;
            }

            failed = endedReason === RESPONSE_ENDED_ABORTED;
        } catch (e) {
            failed = true;
            sessionHelper.onException(e);
        }

        try {
            if (!failed) {
                sessionHelper.waitForConcurrentRequestsToEnd(self);
            }

            channel.requestEnded(ajaxResponse, self);

            if (failed && !endedByUser && failureCallback !== undefined) {
                failureCallback();
            }

            sessionHelper.checkConcurrentRequestsFinished();
        } catch (e) {
            sessionHelper.onException(e);
        }
    }

    function internalFailureCallback(ajaxResponse) {
        channel.requestEnded(ajaxResponse, self);
        sessionHelper.checkConcurrentRequestsFinished();

        if (failureCallback !== undefined) {
            failureCallback();
        }
    }

    function processAjaxResponse(ajaxResponse, isResponseDone) {
        if (!isResponseDone) {
            throw new jGlobals.jpipExceptions.InternalErrorException('AJAX ' + 'callback called although response is not done yet ' + 'and chunked encoding is not enabled');
        }

        var createdChannel = sessionHelper.getCreatedChannelId(ajaxResponse);

        if (createdChannel !== null) {
            if (channel.getChannelId() !== null) {
                sessionHelper.onException(new jGlobals.jpipExceptions.IllegalDataException('Channel created although was not requested', 'D.2.3'));
            } else {
                channel.setChannelId(createdChannel);
            }
        } else if (channel.getChannelId() === null) {
            sessionHelper.onException(new jGlobals.jpipExceptions.IllegalDataException('Cannot extract cid from cnew response', 'D.2.3'));
        }

        var endOffset = saveToDatabinsFromOffset(ajaxResponse);

        if (endOffset === null) {
            return RESPONSE_ENDED_ABORTED;
        }

        var endedReason = parseEndOfResponse(ajaxResponse, endOffset);
        return endedReason;
    }

    function sendMessageOfDataRequest() {
        lastRequestId = channel.nextRequestId();

        var url = requestUrl + '&len=' + responseLength + '&qid=' + lastRequestId;

        responseLength *= 2;

        var shouldCreateChannel = channel.getChannelId() === null;
        if (shouldCreateChannel) {
            url += '&cnew=http';

            var existChannelInSession = sessionHelper.getFirstChannel();

            if (existChannelInSession !== null) {
                url += '&cid=' + existChannelInSession.getChannelId();
            }

            // NOTE: If existChannelInSession, maybe should remove "&stream=0"
        } else {
            url += '&cid=' + channel.getChannelId();
        }

        sessionHelper.sendAjax(url, internalSuccessCallback, internalFailureCallback);
    }

    function parseEndOfResponse(ajaxResponse, offset) {
        var endResponseResult = RESPONSE_ENDED_ABORTED;
        var bytes = new Uint8Array(ajaxResponse.response);

        if (offset > bytes.length - 2 || bytes[offset] !== 0) {

            throw new jGlobals.jpipExceptions.IllegalDataException('Could not find ' + 'End Of Response (EOR) code at the end of response', 'D.3');
        }

        switch (bytes[offset + 1]) {
            case jGlobals.jpipEndOfResponseReasons.IMAGE_DONE:
            case jGlobals.jpipEndOfResponseReasons.WINDOW_DONE:
            case jGlobals.jpipEndOfResponseReasons.QUALITY_LIMIT:
                endResponseResult = RESPONSE_ENDED_SUCCESS;
                break;

            case jGlobals.jpipEndOfResponseReasons.WINDOW_CHANGE:
                if (!endedByUser) {
                    throw new jGlobals.jpipExceptions.IllegalOperationException('Server response was terminated due to newer ' + 'request issued on same channel. That may be an ' + 'internal webjpip.js error - Check that movable ' + 'requests are well maintained');
                }
                break;

            case jGlobals.jpipEndOfResponseReasons.BYTE_LIMIT:
            case jGlobals.jpipEndOfResponseReasons.RESPONSE_LIMIT:
                if (!endedByUser) {
                    sendMessageOfDataRequest();
                    endResponseResult = RESPONSE_ENDED_SENT_ANOTHER_MESSAGE;
                }

                break;

            case jGlobals.jpipEndOfResponseReasons.SESSION_LIMIT:
                sessionHelper.onException(new jGlobals.jpipExceptions.IllegalOperationException('Server resources associated with the session is ' + 'limitted, no further requests should be issued to ' + 'this session'));
                break;

            case jGlobals.jpipEndOfResponseReasons.NON_SPECIFIED:
                sessionHelper.onException(new jGlobals.jpipExceptions.IllegalOperationException('Server error terminated response with no reason specified'));
                break;

            default:
                sessionHelper.onException(new jGlobals.jpipExceptions.IllegalDataException('Server responded with illegal End Of Response ' + '(EOR) code: ' + bytes[offset + 1]));
                break;
        }

        return endResponseResult;
    }

    function saveToDatabinsFromOffset(ajaxResponse) {
        try {
            var bytes = new Uint8Array(ajaxResponse.response);

            var offset = 0;
            var previousHeader;

            while (offset < bytes.length) {
                if (bytes[offset] === 0) {
                    // End Of Response (EOR)
                    break;
                }

                var header = messageHeaderParser.parseMessageHeader(bytes, offset, previousHeader);

                if (header.bodyStart + header.messageBodyLength > bytes.length) {
                    return offset;
                }

                sessionHelper.getDatabinsSaver().saveData(header, bytes);

                offset = header.bodyStart + header.messageBodyLength;
                previousHeader = header;
            }

            return offset;
        } catch (e) {
            sessionHelper.onException(e);

            return null;
        }
    }
};

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipSessionHelper(dataRequestUrl, knownTargetId, codestreamStructure, databinsSaver, ajaxHelper) {

    var statusCallback = null;
    var requestEndedCallback = null;

    var channels = [];
    var firstChannel = null;

    var activeRequests = 0;
    var waitingForConcurrentRequests = [];

    var isReady = false;
    var targetId = knownTargetId || '0';

    this.onException = function onException(exception) {
        onStatusChange(exception);
    };

    this.getIsReady = function getIsReady() {
        return isReady;
    };

    this.setIsReady = function setIsReady(isReady_) {
        isReady = isReady_;
        onStatusChange();
    };

    this.getCodestreamStructure = function getCodestreamStructure() {
        return codestreamStructure;
    };

    this.getDatabinsSaver = function getDatabinsSaver() {
        return databinsSaver;
    };

    this.getDataRequestUrl = function getDataRequestUrl() {
        return dataRequestUrl;
    };

    this.getTargetId = function getTargetId() {
        return targetId;
    };

    this.getFirstChannel = function getFirstChannel() {
        return firstChannel;
    };

    this.setStatusCallback = function setStatusCallback(statusCallback_) {
        statusCallback = statusCallback_;
    };

    this.setRequestEndedCallback = function setRequestEndedCallback(requestEndedCallback_) {

        requestEndedCallback = requestEndedCallback_;
    };

    this.requestStarted = function requestStarted() {
        ++activeRequests;
    };

    this.requestEnded = function requestEnded(ajaxResponse, channel) {
        --activeRequests;

        var targetIdFromServer = ajaxResponse.getResponseHeader('JPIP-tid');
        if (targetIdFromServer !== '' && targetIdFromServer !== null) {
            if (targetId === '0') {
                targetId = targetIdFromServer;
            } else if (targetId !== targetIdFromServer) {
                throw new jGlobals.jpipExceptions.IllegalDataException('Server returned unmatched target ID');
            }
        }

        if (firstChannel === null) {
            firstChannel = channel;
        }

        var channelFreed = channel.getIsDedicatedForMovableRequest() ? null : channel;

        if (requestEndedCallback !== null) {
            requestEndedCallback(channelFreed);
        }
    };

    this.getActiveRequestsCount = function getActiveRequestsCount() {
        return activeRequests;
    };

    this.channelCreated = function channelCreated(channel) {
        channels.push(channel);
    };

    this.getCreatedChannelId = function getCreatedChannelId(ajaxResponse) {
        var cnewResponse = ajaxResponse.getResponseHeader('JPIP-cnew');
        if (!cnewResponse) {
            return null;
        }

        var keyValuePairsInResponse = cnewResponse.split(',');

        for (var i = 0; i < keyValuePairsInResponse.length; ++i) {
            var keyAndValue = keyValuePairsInResponse[i].split('=');

            if (keyAndValue[0] === 'cid') {
                return keyAndValue[1];
            }
        }

        return null;
    };

    this.waitForConcurrentRequestsToEnd = function waitForConcurrentRequestsToEnd(request) {

        var concurrentRequests = [];

        for (var i = 0; i < channels.length; ++i) {
            var requests = channels[i].getRequestsWaitingForResponse();
            var numRequests = requests.length;
            if (numRequests === 0) {
                continue;
            }

            var lastRequestId = requests[0].getLastRequestId();
            for (var j = 1; j < requests.length; ++j) {
                lastRequestId = Math.max(lastRequestId, requests[j].getLastRequestId());
            }

            concurrentRequests.push({
                channel: channels[i],
                requestId: lastRequestId
            });
        }

        waitingForConcurrentRequests.push({
            request: request,
            concurrentRequests: concurrentRequests
        });
    };

    this.checkConcurrentRequestsFinished = function checkConcurrentRequestsFinished() {

        for (var i = waitingForConcurrentRequests.length - 1; i >= 0; --i) {
            var isAllConcurrentRequestsFinished = false;
            var concurrentRequests = waitingForConcurrentRequests[i].concurrentRequests;

            for (var j = concurrentRequests.length - 1; j >= 0; --j) {
                var waiting = concurrentRequests[j];

                if (waiting.channel.isAllOldRequestsEnded(waiting.requestId)) {
                    concurrentRequests[j] = concurrentRequests[concurrentRequests.length - 1];
                    concurrentRequests.length -= 1;
                }
            }

            if (concurrentRequests.length > 0) {
                continue;
            }

            var request = waitingForConcurrentRequests[i].request;
            var callback = request.callback;

            waitingForConcurrentRequests[i] = waitingForConcurrentRequests[waitingForConcurrentRequests.length - 1];
            waitingForConcurrentRequests.length -= 1;

            request.callCallbackAfterConcurrentRequestsFinished();
        }
    };

    this.sendAjax = function sendAjax(url, callback, failureCallback) {

        var forkedFailureCallback;

        if (failureCallback) {
            forkedFailureCallback = function forkFailureCallback(ajaxResponse) {
                generalFailureCallback(ajaxResponse);
                failureCallback(ajaxResponse);
            };
        } else {
            forkedFailureCallback = generalFailureCallback;
        }

        ajaxHelper.request(url, callback, forkedFailureCallback);
    };

    function generalFailureCallback(ajaxResponse) {
        var exception = new jGlobals.jpipExceptions.InternalErrorException('Bad jpip server response (status = ' + ajaxResponse.status + ')');

        onStatusChange(exception);
    }

    function onStatusChange(exception) {
        if (exception === undefined) {
            exception = null;
        }

        if (statusCallback !== null) {
            statusCallback({
                isReady: isReady,
                exception: exception
            });
        }
    }
};

/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipSession(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, knownTargetId, codestreamStructure, databinsSaver, setIntervalFunction, clearIntervalFunction, jpipFactory) {

    var SECOND = 1000;
    var KEEP_ALIVE_INTERVAL = 30 * SECOND;

    var channelManagementUrl;
    var dataRequestUrl;
    var closeSessionUrl;

    var isCloseCalled = false;
    var closeCallbackPending = null;

    var sessionHelper = null;
    var statusCallback = null;
    var requestEndedCallback = null;

    var nonDedicatedChannels = [];
    var channelsCreated = 0;
    var keepAliveIntervalHandle = null;

    this.open = function open(baseUrl) {
        if (sessionHelper !== null) {
            throw new jGlobals.jpipExceptions.InternalErrorException('session.open() should be called only once');
        }

        var queryParamsDelimiter = baseUrl.indexOf('?') < 0 ? '?' : '&';
        channelManagementUrl = baseUrl + queryParamsDelimiter + 'type=' + (databinsSaver.getIsJpipTilePartStream() ? 'jpt-stream' : 'jpp-stream');
        dataRequestUrl = channelManagementUrl + '&stream=0';

        sessionHelper = jpipFactory.createSessionHelper(dataRequestUrl, knownTargetId, codestreamStructure, databinsSaver);

        if (statusCallback !== null) {
            sessionHelper.setStatusCallback(statusCallback);
        }

        if (requestEndedCallback !== null) {
            sessionHelper.setRequestEndedCallback(requestEndedCallback);
        }

        var channel = createChannel();

        channel.sendMinimalRequest(sessionReadyCallback);
    };

    this.getTargetId = function getTargetId() {
        ensureReady();
        return sessionHelper.getTargetId();
    };

    this.getIsReady = function getIsReady() {
        var isReady = sessionHelper !== null && sessionHelper.getIsReady();
        return isReady;
    };

    this.setStatusCallback = function setStatusCallback(statusCallback_) {
        statusCallback = statusCallback_;

        if (sessionHelper !== null) {
            sessionHelper.setStatusCallback(statusCallback_);
        }
    };

    this.setRequestEndedCallback = function setRequestEndedCallback(requestEndedCallback_) {

        requestEndedCallback = requestEndedCallback_;

        if (sessionHelper !== null) {
            sessionHelper.setRequestEndedCallback(requestEndedCallback_);
        }
    };

    this.hasActiveRequests = function hasActiveRequests() {
        ensureReady();

        var isActiveRequests = sessionHelper.getActiveRequestsCount() > 0;
        return isActiveRequests;
    };

    this.tryGetChannel = function tryGetChannel(dedicateForMovableRequest) {
        ensureReady();

        var canCreateNewChannel = channelsCreated < maxChannelsInSession;
        var searchOnlyChannelWithEmptyQueue = canCreateNewChannel || dedicateForMovableRequest;

        var maxRequestsInChannel = searchOnlyChannelWithEmptyQueue ? 0 : maxRequestsWaitingForResponseInChannel - 1;

        var channel = getChannelWithMinimalWaitingRequests(maxRequestsInChannel,
        /*isExtractFromNonDedicatedList=*/dedicateForMovableRequest);

        if (channel === null && canCreateNewChannel) {
            channel = createChannel(dedicateForMovableRequest);
        }

        if (dedicateForMovableRequest && channel !== null) {
            channel.dedicateForMovableRequest();
        }

        return channel;
    };

    this.close = function close(closedCallback) {
        if (channelsCreated === 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot close session before open');
        }

        if (isCloseCalled) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot close session twice');
        }

        isCloseCalled = true;
        closeCallbackPending = closedCallback;

        if (closeSessionUrl !== undefined) {
            closeInternal();
        }
    };

    function closeInternal() {
        if (keepAliveIntervalHandle !== null) {
            clearIntervalFunction(keepAliveIntervalHandle);
        }

        sessionHelper.setIsReady(false);
        sessionHelper.sendAjax(closeSessionUrl, closeCallbackPending);
    }

    function createChannel(isDedicatedForMovableRequest) {
        ++channelsCreated;
        var channel = jpipFactory.createChannel(maxRequestsWaitingForResponseInChannel, sessionHelper);

        sessionHelper.channelCreated(channel);

        if (!isDedicatedForMovableRequest) {
            nonDedicatedChannels.push(channel);
        }

        return channel;
    }

    function getChannelWithMinimalWaitingRequests(maxRequestsInChannel, isExtractFromNonDedicatedList) {

        var channel = null;
        var index;
        var minimalWaitingRequests = maxRequestsInChannel + 1;

        for (var i = 0; i < nonDedicatedChannels.length; ++i) {
            var waitingRequests = nonDedicatedChannels[i].getAllQueuedRequestCount();

            if (waitingRequests < minimalWaitingRequests) {
                channel = nonDedicatedChannels[i];
                index = i;
                minimalWaitingRequests = waitingRequests;
            }

            if (waitingRequests === 0) {
                break;
            }
        }

        if (!isExtractFromNonDedicatedList || channel === null) {
            return channel;
        }

        nonDedicatedChannels[index] = nonDedicatedChannels[nonDedicatedChannels.length - 1];
        nonDedicatedChannels.length -= 1;

        return channel;
    }

    function sessionReadyCallback() {
        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();
        if (!mainHeaderDatabin.isAllDatabinLoaded()) {
            throw new jGlobals.jpipExceptions.IllegalDataException('Main header was not loaded on session creation');
        }

        var arbitraryChannel = sessionHelper.getFirstChannel();
        var arbitraryChannelId = arbitraryChannel.getChannelId();
        closeSessionUrl = channelManagementUrl + '&cclose=*' + '&cid=' + arbitraryChannelId;

        if (isCloseCalled) {
            closeInternal();
            return;
        }

        if (arbitraryChannelId === null) {
            return; // Failure indication already returned in JpipRequest
        }

        keepAliveIntervalHandle = setIntervalFunction(keepAliveHandler, KEEP_ALIVE_INTERVAL);

        sessionHelper.setIsReady(true);
    }

    function keepAliveHandler() {
        if (sessionHelper.getActiveRequestsCount() > 0) {
            return;
        }

        var arbitraryChannel = sessionHelper.getFirstChannel();
        arbitraryChannel.sendMinimalRequest(function dummyCallback() {});
    }

    function ensureReady() {
        if (sessionHelper === null || !sessionHelper.getIsReady()) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot perform ' + 'this operation when the session is not ready');
        }
    }
};

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipReconnectableRequester(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, codestreamStructure, databinsSaver, jpipFactory,
// NOTE: Move parameter to beginning and expose in CodestreamClient
maxJpipCacheSizeConfig) {

    var MB = 1048576;
    var maxJpipCacheSize = maxJpipCacheSizeConfig || 10 * MB;

    var sessionWaitingForReady;
    var activeSession = null;
    var sessionWaitingForDisconnect = null;

    var url = null;
    var waitingForCloseSessions = 0;

    var nonDedicatedRequestsWaitingForSend = [];
    var dedicatedChannels = [];

    var statusCallback = null;
    var lastClosedCallback = null;

    this.getIsReady = function getIsReady() {
        return activeSession !== null && activeSession.getIsReady();
    };

    this.open = function open(baseUrl) {
        if (baseUrl === undefined || baseUrl === null) {
            throw new jGlobals.jpipExceptions.ArgumentException('baseUrl', baseUrl);
        }

        if (url !== null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Image was already opened');
        }

        url = baseUrl;
        createInternalSession();
    };

    this.close = function close(closedCallback) {
        if (lastClosedCallback !== null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('closed twice');
        }

        lastClosedCallback = closedCallback;
        waitingForCloseSessions = 1;

        closeInternalSession(activeSession);
        closeInternalSession(sessionWaitingForReady);
        closeInternalSession(sessionWaitingForDisconnect);

        checkIfAllSessionsClosedAfterSessionClosed();
    };

    this.setStatusCallback = function setStatusCallback(newStatusCallback) {
        statusCallback = newStatusCallback;

        if (activeSession !== null) {
            activeSession.setStatusCallback(newStatusCallback);
        }
    };

    this.dedicateChannelForMovableRequest = function dedicateChannelForMovableRequest() {

        checkReady();

        var dedicatedChannelHandle = { internalDedicatedChannel: null };
        dedicatedChannels.push(dedicatedChannelHandle);
        createInternalDedicatedChannel(dedicatedChannelHandle);

        return dedicatedChannelHandle;
    };

    this.requestData = function requestData(codestreamPartParams, callback, failureCallback, numQualityLayers, dedicatedChannelHandleToMove) {

        checkReady();

        var request = {
            isEnded: false,
            internalRequest: null,

            codestreamPartParams: codestreamPartParams,
            callback: callback,
            failureCallback: failureCallback,
            numQualityLayers: numQualityLayers
        };

        var channel;
        var moveDedicatedChannel = !!dedicatedChannelHandleToMove;

        if (moveDedicatedChannel) {
            channel = dedicatedChannelHandleToMove.internalDedicatedChannel;
        } else {
            channel = activeSession.tryGetChannel();

            if (channel === null) {
                nonDedicatedRequestsWaitingForSend.push(request);
                return request;
            } else if (channel.getIsDedicatedForMovableRequest()) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Expected non-movable channel');
            }
        }

        if (channel.getIsDedicatedForMovableRequest() !== moveDedicatedChannel) {
            throw new jGlobals.jpipExceptions.InternalErrorException('getIsDedicatedForMovableRequest inconsistency');
        }

        request.internalRequest = channel.requestData(codestreamPartParams, callback, failureCallback, numQualityLayers);

        return request;
    };

    this.stopRequestAsync = function stopRequestAsync(request) {
        request.isEnded = true;

        if (request.internalRequest !== null) {
            request.internalRequest.stopRequestAsync();
        }
    };

    this.reconnect = reconnect;

    function reconnect() {
        if (sessionWaitingForReady !== null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Previous session still not established');
        }

        if (sessionWaitingForDisconnect !== null) {
            if (statusCallback !== null) {
                statusCallback({
                    isReady: true,
                    exception: //jpipExceptions.IllegalOperationException(
                    'Previous session that should be closed still alive.' + 'Maybe old requestContexts have not beed closed. ' + 'Reconnect will not be done' //);
                });
            }

            return;
        }

        databinsSaver.cleanupUnregisteredDatabins();
        createInternalSession();
    }

    function createInternalSession() {
        var targetId;
        if (activeSession !== null) {
            targetId = activeSession.getTargetId();
        }

        sessionWaitingForReady = jpipFactory.createSession(maxChannelsInSession, maxRequestsWaitingForResponseInChannel, targetId, codestreamStructure, databinsSaver);

        sessionWaitingForReady.setStatusCallback(waitingForReadyCallback);

        sessionWaitingForReady.open(url);
    }

    function createInternalDedicatedChannel(dedicatedChannelHandle) {
        var channel = activeSession.tryGetChannel(
        /*dedicateForMovableRequest=*/true);

        if (channel === null) {
            throw new jGlobals.jpipExceptions.IllegalOperationException('Too many concurrent requests. Limit the use of dedicated ' + '(movable) requests, enlarge maxChannelsInSession or wait ' + 'for requests to finish and avoid create new ones');
        }

        if (!channel.getIsDedicatedForMovableRequest()) {
            throw new jGlobals.jpipExceptions.InternalErrorException('getIsDedicatedForMovableRequest inconsistency');
        }

        dedicatedChannelHandle.internalDedicatedChannel = channel;
    }

    function waitingForReadyCallback(status) {
        if (sessionWaitingForReady === null || status.isReady !== sessionWaitingForReady.getIsReady()) {

            throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected ' + 'statusCallback when not registered to session or ' + 'inconsistent isReady');
        }

        if (status.isReady) {
            if (sessionWaitingForDisconnect !== null) {
                throw new jGlobals.jpipExceptions.InternalErrorException('sessionWaitingForDisconnect should be null');
            }

            sessionWaitingForDisconnect = activeSession;
            activeSession = sessionWaitingForReady;
            sessionWaitingForReady = null;

            if (sessionWaitingForDisconnect !== null) {
                sessionWaitingForDisconnect.setStatusCallback(null);
                if (!tryDisconnectWaitingSession()) {
                    sessionWaitingForDisconnect.setRequestEndedCallback(tryDisconnectWaitingSession);
                }
            }

            activeSession.setStatusCallback(statusCallback);
            activeSession.setRequestEndedCallback(activeSessionRequestEndedCallback);

            for (var i = 0; i < dedicatedChannels.length; ++i) {
                createInternalDedicatedChannel(dedicatedChannels[i]);
            }
        }

        if (statusCallback !== null) {
            statusCallback(status);
        }
    }

    function closeInternalSession(session) {
        if (session !== null) {
            ++waitingForCloseSessions;
            session.close(checkIfAllSessionsClosedAfterSessionClosed);
        }
    }

    function checkIfAllSessionsClosedAfterSessionClosed() {
        --waitingForCloseSessions;

        if (waitingForCloseSessions === 0 && lastClosedCallback !== undefined) {
            lastClosedCallback();
        }
    }

    function checkReady() {
        if (activeSession === null) {
            throw new jGlobals.jpipExceptions.InternalErrorException('This operation ' + 'is forbidden when session is not ready');
        }
    }

    function activeSessionRequestEndedCallback(channelFreed) {
        var request = null;

        if (databinsSaver.getLoadedBytes() > maxJpipCacheSize) {
            reconnect();
        }

        if (channelFreed === null) {
            return;
        }

        if (channelFreed.getIsDedicatedForMovableRequest()) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Expected non-movable channel as channelFreed');
        }

        do {
            if (nonDedicatedRequestsWaitingForSend.length === 0) {
                request = null;
                break;
            }

            request = nonDedicatedRequestsWaitingForSend.shift();
            if (request.internalRequest !== null) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Request was ' + 'already sent but still in queue');
            }
        } while (request.isEnded);

        if (request !== null) {
            request.internalRequest = channelFreed.requestData(request.codestreamPartParams, request.callback, request.failureCallback, request.numQualityLayers);
        }
    }

    function tryDisconnectWaitingSession() {
        var canCloseSession = !sessionWaitingForDisconnect.hasActiveRequests();

        if (canCloseSession) {
            sessionWaitingForDisconnect.close();
            sessionWaitingForDisconnect = null;
        }

        return canCloseSession;
    }
};

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipStructureParser(databinsSaver, markersParser, messageHeaderParser, offsetsCalculator) {

    this.parseCodestreamStructure = function parseCodestreamStructure() {
        // A.5.1 (Image and Tile Size)

        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var sizMarkerOffset = offsetsCalculator.getImageAndTileSizeOffset();

        var bytes = getBytes(mainHeaderDatabin,
        /*numBytes=*/38, sizMarkerOffset + jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE);

        var referenceGridSizeOffset = jGlobals.j2kOffsets.REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER - (jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE);
        var numComponentsOffset = jGlobals.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER - (jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE);

        var referenceGridSizeX = messageHeaderParser.getInt32(bytes, referenceGridSizeOffset); // XSiz
        var referenceGridSizeY = messageHeaderParser.getInt32(bytes, referenceGridSizeOffset + 4); // YSiz

        var imageOffsetX = messageHeaderParser.getInt32(bytes, 10); // XOSiz
        var imageOffsetY = messageHeaderParser.getInt32(bytes, 14); // YOSiz
        var tileSizeX = messageHeaderParser.getInt32(bytes, 18); // XTSiz
        var tileSizeY = messageHeaderParser.getInt32(bytes, 22); // YTSiz
        var firstTileOffsetX = messageHeaderParser.getInt32(bytes, 26); // XTOSiz
        var firstTileOffsetY = messageHeaderParser.getInt32(bytes, 30); // YTOSiz

        var numComponents = messageHeaderParser.getInt16(bytes, numComponentsOffset); // CSiz

        var componentsDataOffset = sizMarkerOffset + jGlobals.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER + 2;
        var componentsDataLength = numComponents * 3;

        var componentsDataBytes = getBytes(mainHeaderDatabin, componentsDataLength, componentsDataOffset);

        var componentsScaleX = new Array(numComponents);
        var componentsScaleY = new Array(numComponents);
        for (var i = 0; i < numComponents; ++i) {
            componentsScaleX[i] = componentsDataBytes[i * 3 + 1];
            componentsScaleY[i] = componentsDataBytes[i * 3 + 2];
        }

        var result = {
            numComponents: numComponents,
            componentsScaleX: componentsScaleX,
            componentsScaleY: componentsScaleY,
            imageWidth: referenceGridSizeX - firstTileOffsetX,
            imageHeight: referenceGridSizeY - firstTileOffsetY,
            tileWidth: tileSizeX,
            tileHeight: tileSizeY,
            firstTileOffsetX: firstTileOffsetX,
            firstTileOffsetY: firstTileOffsetY
        };
        return result;
    };

    this.parseDefaultTileParams = function () {
        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var tileParams = parseCodingStyle(mainHeaderDatabin, /*isMandatory=*/true);
        return tileParams;
    };

    this.parseOverridenTileParams = function (tileIndex) {
        var tileHeaderDatabin = databinsSaver.getTileHeaderDatabin(tileIndex);

        // A.4.2 (Start Of Tile-part)

        var tileParams = parseCodingStyle(tileHeaderDatabin, /*isMandatory=*/false);
        return tileParams;
    };

    function parseCodingStyle(databin, isMandatory) {
        // A.5.1 (Image and Tile Size)

        var baseParams = offsetsCalculator.getCodingStyleBaseParams(databin, isMandatory);

        if (baseParams === null) {
            return null;
        }

        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var sizMarkerOffset = offsetsCalculator.getImageAndTileSizeOffset();

        var numComponentsOffset = sizMarkerOffset + jGlobals.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER;

        var numComponentsBytes = getBytes(mainHeaderDatabin,
        /*numBytes=*/2,
        /*startOffset=*/numComponentsOffset);
        var numComponents = messageHeaderParser.getInt16(numComponentsBytes, 0);

        var packedPacketHeadersMarkerInTileHeader = markersParser.getMarkerOffsetInDatabin(databin, jGlobals.j2kMarkers.PackedPacketHeadersInTileHeader);

        var packedPacketHeadersMarkerInMainHeader = markersParser.getMarkerOffsetInDatabin(mainHeaderDatabin, jGlobals.j2kMarkers.PackedPacketHeadersInMainHeader);

        var isPacketHeadersNearData = packedPacketHeadersMarkerInTileHeader === null && packedPacketHeadersMarkerInMainHeader === null;

        var codingStyleMoreDataOffset = baseParams.codingStyleDefaultOffset + 6;
        var codingStyleMoreDataBytes = getBytes(databin,
        /*numBytes=*/6,
        /*startOffset=*/codingStyleMoreDataOffset);
        var numQualityLayers = messageHeaderParser.getInt16(codingStyleMoreDataBytes, 0);

        var codeblockWidth = parseCodeblockSize(codingStyleMoreDataBytes, 4);
        var codeblockHeight = parseCodeblockSize(codingStyleMoreDataBytes, 5);

        var precinctWidths = new Array(baseParams.numResolutionLevels);
        var precinctHeights = new Array(baseParams.numResolutionLevels);

        var precinctSizesBytes = null;
        if (!baseParams.isDefaultPrecinctSize) {
            var precinctSizesBytesNeeded = baseParams.numResolutionLevels;

            precinctSizesBytes = getBytes(databin, precinctSizesBytesNeeded, baseParams.precinctSizesOffset);
        }

        var defaultSize = 1 << 15;
        for (var i = 0; i < baseParams.numResolutionLevels; ++i) {
            if (baseParams.isDefaultPrecinctSize) {
                precinctWidths[i] = defaultSize;
                precinctHeights[i] = defaultSize;
                continue;
            }

            var precinctSizeOffset = i;
            var sizeExponents = precinctSizesBytes[precinctSizeOffset];
            var ppx = sizeExponents & 0x0F;
            var ppy = sizeExponents >>> 4;

            precinctWidths[i] = 1 * Math.pow(2, ppx); // Avoid negative result due to signed calculation
            precinctHeights[i] = 1 * Math.pow(2, ppy); // Avoid negative result due to signed calculation
        }

        var paramsPerComponent = new Array(numComponents);
        for (var j = 0; j < numComponents; ++j) {
            paramsPerComponent[j] = {
                maxCodeblockWidth: codeblockWidth,
                maxCodeblockHeight: codeblockHeight,

                numResolutionLevels: baseParams.numResolutionLevels,

                precinctWidthPerLevel: precinctWidths,
                precinctHeightPerLevel: precinctHeights
            };
        }

        var defaultComponentParams = {
            maxCodeblockWidth: codeblockWidth,
            maxCodeblockHeight: codeblockHeight,

            numResolutionLevels: baseParams.numResolutionLevels,

            precinctWidthPerLevel: precinctWidths,
            precinctHeightPerLevel: precinctHeights
        };

        var tileParams = {
            numQualityLayers: numQualityLayers,

            isPacketHeadersNearData: isPacketHeadersNearData,
            isStartOfPacketMarkerAllowed: baseParams.isStartOfPacketMarkerAllowed,
            isEndPacketHeaderMarkerAllowed: baseParams.isEndPacketHeaderMarkerAllowed,

            paramsPerComponent: paramsPerComponent,
            defaultComponentParams: defaultComponentParams
        };

        return tileParams;
    }

    function parseCodeblockSize(bytes, offset) {
        var codeblockSizeExponentMinus2 = bytes[offset];
        var codeblockSizeExponent = 2 + (codeblockSizeExponentMinus2 & 0x0F);

        if (codeblockSizeExponent > 10) {
            throw new jGlobals.j2kExceptions.IllegalDataException('Illegal codeblock width exponent ' + codeblockSizeExponent, 'A.6.1, Table A.18');
        }

        var size = 1 << codeblockSizeExponent;
        return size;
    }

    function getBytes(databin, numBytes, databinStartOffset, allowEndOfRange) {
        var bytes = [];

        var rangeOptions = {
            forceCopyAllRange: true,
            maxLengthToCopy: numBytes,
            databinStartOffset: databinStartOffset
        };

        var bytesCopied = databin.copyBytes(bytes, /*startOffset=*/0, rangeOptions);
        if (bytesCopied === null) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Header data-bin has not yet recieved ' + numBytes + ' bytes starting from offset ' + databinStartOffset);
        }

        return bytes;
    }
};

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipTileStructure(sizeParams, codestreamStructure, jpipFactory, progressionOrder) {

    var defaultComponentStructure;
    var componentStructures;
    var componentToInClassLevelStartIndex;
    var minNumResolutionLevels;

    this.getProgressionOrder = function () {
        return progressionOrder;
    };

    this.getDefaultComponentStructure = function getDefaultComponentStructure(component) {
        return defaultComponentStructure;
    };

    this.getComponentStructure = function getComponentStructure(component) {
        return componentStructures[component];
    };

    this.getTileWidth = function getTileWidthClosure() {
        return sizeParams.tileSize.width;
    };

    this.getTileHeight = function getTileHeightClosure() {
        return sizeParams.tileSize.height;
    };

    this.getNumQualityLayers = function getNumQualityLayers() {
        return sizeParams.numQualityLayers;
    };

    this.getIsPacketHeaderNearData = function getIsPacketHeaderNearData() {
        return sizeParams.isPacketHeadersNearData;
    };

    this.getIsStartOfPacketMarkerAllowed = function getIsStartOfPacketMarkerAllowed() {
        return sizeParams.isStartOfPacketMarkerAllowed;
    };

    this.getIsEndPacketHeaderMarkerAllowed = function getIsEndPacketHeaderMarkerAllowed() {

        return sizeParams.isEndPacketHeaderMarkerAllowed;
    };

    this.getMinNumResolutionLevelsOverComponents = function () {
        return minNumResolutionLevels;
    };

    this.precinctInClassIndexToPosition = function (inClassIndex) {
        // A.3.2

        if (inClassIndex < 0) {
            throw new jGlobals.jpipExceptions.ArgumentException('inClassIndex', inClassIndex, 'Invalid negative in-class index of precinct');
        }

        var numTiles = codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        var numComponents = codestreamStructure.getNumComponents();

        var tileIndex = inClassIndex % numTiles;
        var inClassIndexWithoutTile = (inClassIndex - tileIndex) / numTiles;

        var component = inClassIndexWithoutTile % numComponents;
        var componentStructure = componentStructures[component];

        var numResolutionLevels = componentStructure.getNumResolutionLevels();
        var precinctIndex = (inClassIndexWithoutTile - component) / numComponents;

        var resolutionLevel;
        var levelStartIndex = 0;
        for (resolutionLevel = 1; resolutionLevel < numResolutionLevels; ++resolutionLevel) {
            var nextLevelStartIndex = componentToInClassLevelStartIndex[component][resolutionLevel];

            if (nextLevelStartIndex > precinctIndex) {
                break;
            }

            levelStartIndex = nextLevelStartIndex;
        }

        --resolutionLevel;
        var precinctIndexInLevel = precinctIndex - levelStartIndex;

        var precinctsX = componentStructure.getNumPrecinctsX(resolutionLevel);
        var precinctsY = componentStructure.getNumPrecinctsY(resolutionLevel);

        var precinctX = precinctIndexInLevel % precinctsX;
        var precinctY = (precinctIndexInLevel - precinctX) / precinctsX;

        if (precinctY >= precinctsY) {
            throw new jGlobals.jpipExceptions.ArgumentException('inClassIndex', inClassIndex, 'Invalid in-class index of precinct');
        }

        var result = {
            tileIndex: tileIndex,
            component: component,

            precinctX: precinctX,
            precinctY: precinctY,
            resolutionLevel: resolutionLevel
        };

        return result;
    };

    this.precinctPositionToInClassIndex = function (precinctPosition) {
        // A.3.2

        var numComponents = codestreamStructure.getNumComponents();
        validateArgumentInRange('precinctPosition.component', precinctPosition.component, numComponents);

        var componentStructure = componentStructures[precinctPosition.component];

        var numResolutionLevels = componentStructure.getNumResolutionLevels();
        validateArgumentInRange('precinctPosition.resolutionLevel', precinctPosition.resolutionLevel, numResolutionLevels);

        var numTiles = codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        var precinctsX = componentStructure.getNumPrecinctsX(precinctPosition.resolutionLevel);
        var precinctsY = componentStructure.getNumPrecinctsY(precinctPosition.resolutionLevel);

        validateArgumentInRange('precinctPosition.precinctX', precinctPosition.precinctX, precinctsX);
        validateArgumentInRange('precinctPosition.precinctY', precinctPosition.precinctY, precinctsY);
        validateArgumentInRange('precinctPosition.tileIndex', precinctPosition.tileIndex, numTiles);

        var precinctIndexInLevel = precinctPosition.precinctX + precinctPosition.precinctY * precinctsX;

        var levelStartIndex = componentToInClassLevelStartIndex[precinctPosition.component][precinctPosition.resolutionLevel];

        var precinctIndex = precinctIndexInLevel + levelStartIndex;

        var inClassIndexWithoutTile = precinctPosition.component + precinctIndex * codestreamStructure.getNumComponents();

        var inClassIndex = precinctPosition.tileIndex + inClassIndexWithoutTile * codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();

        return inClassIndex;
    };

    this.precinctPositionToIndexInComponentResolution = function (precinctPosition) {
        var componentStructure = componentStructures[precinctPosition.component];

        var precinctsX = componentStructure.getNumPrecinctsX(precinctPosition.resolutionLevel);
        var precinctIndexInComponentResolution = precinctPosition.precinctX + precinctPosition.precinctY * precinctsX;

        return precinctIndexInComponentResolution;
    };

    function validateArgumentInRange(paramName, paramValue, suprimumParamValue) {
        if (paramValue < 0 || paramValue >= suprimumParamValue) {
            throw new jGlobals.jpipExceptions.ArgumentException(paramName, paramValue, paramName + ' is expected to be between 0 and ' + suprimumParamValue - 1);
        }
    }

    function validateTargetProgressionOrder(progressionOrder) {
        if (progressionOrder.length !== 4) {
            throw new jGlobals.j2kExceptions.IllegalDataException('Illegal progression order ' + progressionOrder + ': unexpected length');
        }

        if (progressionOrder[3] !== 'L') {
            throw new jGlobals.jpipExceptions.IllegalDataException('Illegal target progression order of ' + progressionOrder, 'A.3.2.1');
        }

        var hasP = progressionOrder.indexOf('P') >= 0;
        var hasC = progressionOrder.indexOf('C') >= 0;
        var hasR = progressionOrder.indexOf('R') >= 0;
        if (!hasP || !hasC || !hasR) {
            throw new jGlobals.j2kExceptions.IllegalDataException('Illegal progression order ' + progressionOrder + ': missing letter');
        }

        if (progressionOrder !== 'RPCL') {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException('Progression order of ' + progressionOrder, 'A.6.1');
        }
    }

    function preprocessParams() {
        componentToInClassLevelStartIndex = new Array(components);

        var components = codestreamStructure.getNumComponents();

        var defaultComponent = sizeParams.defaultComponentParams;
        minNumResolutionLevels = defaultComponent.numResolutionLevels;
        var isComponentsIdenticalSize = true;
        var isPrecinctPartitionFitsToTilePartition = true;

        for (var c = 0; c < components; ++c) {
            var size = sizeParams.paramsPerComponent[c];
            minNumResolutionLevels = Math.min(minNumResolutionLevels, size.numResolutionLevels);

            componentToInClassLevelStartIndex[c] = new Array(size.numResolutionLevels);
            var componentStructure = componentStructures[c];

            var accumulatedOffset = 0;
            var firstLevelPrecinctsX = componentStructure.getNumPrecinctsX(c);
            var firstLevelPrecinctsY = componentStructure.getNumPrecinctsY(c);

            for (var r = 0; r < size.numResolutionLevels; ++r) {
                componentToInClassLevelStartIndex[c][r] = accumulatedOffset;
                var precinctsXInLevel = componentStructure.getNumPrecinctsX(r);
                var precinctsYInLevel = componentStructure.getNumPrecinctsY(r);
                accumulatedOffset += precinctsXInLevel * precinctsYInLevel;

                if (defaultComponent.precinctWidthPerLevel[r] !== size.precinctWidthPerLevel[r] || defaultComponent.precinctHeightPerLevel[r] !== size.precinctHeightPerLevel[r]) {

                    isComponentsIdenticalSize = false;
                }

                var isHorizontalPartitionSupported = checkIfPrecinctPartitionStartsInTileTopLeft(r, size.numResolutionLevels, componentStructure.getPrecinctWidth, codestreamStructure.getLevelWidth, codestreamStructure.getTileWidth);

                var isVerticalPartitionSupported = checkIfPrecinctPartitionStartsInTileTopLeft(r, size.numResolutionLevels, componentStructure.getPrecinctWidth, codestreamStructure.getLevelWidth, codestreamStructure.getTileWidth);

                isPrecinctPartitionFitsToTilePartition &= isHorizontalPartitionSupported && isVerticalPartitionSupported;
            }
        }

        if (!isComponentsIdenticalSize) {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException('Special Coding Style for Component (COC)', 'A.6.2');
        }

        if (!isPrecinctPartitionFitsToTilePartition) {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException('Precinct TopLeft which is not matched to tile TopLeft', 'B.6');
        }
    }

    function checkIfPrecinctPartitionStartsInTileTopLeft(resolutionLevel, numResolutionLevels, getPrecinctSizeFunction, getLevelSizeFunction, getTileSize1DFunction) {

        // Jpeg2000 standard allows partition of tiles which does not fit
        // exactly the precincts partition (i.e. the first precincts "virtually"
        // starts before the tile, thus is smaller than other).
        // This is not supported now in the code, this function should check
        // that this is not the situation.

        // The function assumes that firstTileOffset is zero and componentScale
        // is one (UnsupportedExceptions are thrown in ComponentStructure and
        // CodestreamStructure classes).

        var precinctSize = getPrecinctSizeFunction(resolutionLevel);
        var levelSize = getLevelSizeFunction(resolutionLevel);
        var tileSize1D = getTileSize1DFunction(resolutionLevel);

        if (precinctSize >= levelSize || tileSize1D >= levelSize) {
            // precinctSize >= levelSize ==> Precinct is larger than image thus
            // anyway tile has a single precinct
            // tileSize1D >= levelSize ==> Level has only single tile thus no
            // chances for tile top-left to not match first precinct top-left

            return true;
        }

        var isPrecinctPartitionFitsToTilePartition = precinctSize % tileSize1D === 0 || tileSize1D % precinctSize === 0;

        return isPrecinctPartitionFitsToTilePartition;
    }

    defaultComponentStructure = jpipFactory.createComponentStructure(sizeParams.defaultComponentParams, this);

    componentStructures = new Array(codestreamStructure.getNumComponents());
    for (var i = 0; i < codestreamStructure.getNumComponents(); ++i) {
        componentStructures[i] = jpipFactory.createComponentStructure(sizeParams.paramsPerComponent[i], this);
    }

    preprocessParams();

    validateTargetProgressionOrder(progressionOrder);

    return this;
};

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipBitstreamReaderClosure() {
    var NULL_BYTE = -1; // Using js' null and number in same property degrades performance
    var zeroBitsUntilFirstOneBitMap = createZeroBitsUntilFirstOneBitMap();

    function JpipBitstreamReader(databin, transactionHelper) {
        var initialState = {
            nextOffsetToParse: 0,
            validBitsInCurrentByte: 0,
            originalByteWithoutShift: NULL_BYTE,
            currentByte: NULL_BYTE,
            isSkipNextByte: false
        };

        var streamState = transactionHelper.createTransactionalObject(initialState, function cloneState(state) {
            return {
                nextOffsetToParse: state.nextOffsetToParse,
                validBitsInCurrentByte: state.validBitsInCurrentByte,
                originalByteWithoutShift: state.originalByteWithoutShift,
                currentByte: state.currentByte,
                isSkipNextByte: state.isSkipNextByte
            };
        });
        var activeTransaction = null;

        Object.defineProperty(this, 'activeTransaction', {
            get: function getActiveTransaction() {
                if (activeTransaction === null || !activeTransaction.isActive) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('No active transaction in bitstreamReader');
                }

                return activeTransaction;
            }
        });

        Object.defineProperty(this, 'bitsCounter', {
            get: function getBitsCounter() {
                var state = streamState.getValue(activeTransaction);

                tryValidateCurrentByte(databin, state);
                if (state.isSkipNextByte) {
                    throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected state of bitstreamReader: ' + 'When 0xFF encountered, tryValidateCurrentByte ' + 'should skip the whole byte  after ' + 'shiftRemainingBitsInByte and clear isSkipNextByte. ' + 'However the flag is still set');
                }

                var result = state.nextOffsetToParse * 8 - state.validBitsInCurrentByte;

                return result;
            }
        });

        Object.defineProperty(this, 'databinOffset', {
            get: function getDatabinOffset() {
                var state = streamState.getValue(activeTransaction);

                if (state.isSkipNextByte) {
                    return state.nextOffsetToParse + 1;
                }

                if (state.validBitsInCurrentByte % 8 !== 0 || state.originalByteWithoutShift === 0xFF) {

                    throw new jGlobals.jpipExceptions.InternalErrorException('Cannot calculate databin offset when bitstreamReader ' + ' is in the middle of the byte');
                }

                return state.nextOffsetToParse - state.validBitsInCurrentByte / 8;
            },

            set: function setDatabinOffset(offsetInBytes) {
                var state = streamState.getValue(activeTransaction);
                state.validBitsInCurrentByte = 0;
                state.isSkipNextByte = false;
                state.originalByteWithoutShift = NULL_BYTE;
                state.nextOffsetToParse = offsetInBytes;
            }
        });

        this.startNewTransaction = function startNewTransaction() {
            if (activeTransaction !== null && activeTransaction.isActive) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Cannot start new transaction in bitstreamReader ' + 'while another transaction is active');
            }

            activeTransaction = transactionHelper.createTransaction();
        };

        this.shiftRemainingBitsInByte = function shiftRemainingBitsInByte() {
            var state = streamState.getValue(activeTransaction);

            state.isSkipNextByte = state.originalByteWithoutShift === 0xFF;
            state.validBitsInCurrentByte = Math.floor(state.validBitsInCurrentByte / 8);
        };

        this.shiftBit = function shiftBit() {
            var state = streamState.getValue(activeTransaction);
            if (!tryValidateCurrentByte(databin, state)) {
                return null;
            }

            var onesCount = countAndShiftBits(databin, state,
            /*isUntilZeroBit=*/true,
            /*maxBitsToShift=*/1);

            return onesCount;
        };

        this.countZerosAndShiftUntilFirstOneBit = function countZerosAndShiftUntilFirstOneBit(maxBitsToShift) {
            var state = streamState.getValue(activeTransaction);
            var result = countAndShiftBits(databin, state, /*isUntilZeroBit=*/false, maxBitsToShift);
            return result;
        };

        this.countOnesAndShiftUntilFirstZeroBit = function countOnesAndShiftUntilFirstZeroBit(maxBitsToShift) {
            var state = streamState.getValue(activeTransaction);
            var result = countAndShiftBits(databin, state, /*isUntilZeroBit=*/true, maxBitsToShift);
            return result;
        };

        this.shiftBits = function shiftBits(bitsCount) {
            var result = 0;
            var state = streamState.getValue(activeTransaction);
            var remainingBits = bitsCount;

            while (remainingBits > 0) {
                if (!tryValidateCurrentByte(databin, state)) {
                    return null;
                }

                var bitsToTake = Math.min(state.validBitsInCurrentByte, remainingBits);

                var addToResult = state.currentByte >> 8 - bitsToTake;
                result = (result << bitsToTake) + addToResult;

                removeBitsFromByte(state, bitsToTake);
                remainingBits -= bitsToTake;
            }

            return result;
        };
    }

    function countAndShiftBits(databin, state, isUntilZeroBit, maxBitsToShift) {
        var countedBits = 0;
        var foundTerminatingBit;
        var remainingBits = maxBitsToShift;

        do {
            if (!tryValidateCurrentByte(databin, state)) {
                return null;
            }

            var byteValue = isUntilZeroBit ? ~state.currentByte : state.currentByte;
            var bitsCountIncludingTerminatingBit = Math.min(zeroBitsUntilFirstOneBitMap[byteValue], state.validBitsInCurrentByte + 1);

            var bitsCountNotIncludingTerminatingBit = bitsCountIncludingTerminatingBit - 1;

            if (remainingBits !== undefined) {
                if (bitsCountIncludingTerminatingBit > remainingBits) {
                    removeBitsFromByte(state, remainingBits);
                    countedBits += remainingBits;
                    break;
                }

                remainingBits -= bitsCountNotIncludingTerminatingBit;
            }

            countedBits += bitsCountNotIncludingTerminatingBit;

            foundTerminatingBit = bitsCountIncludingTerminatingBit <= state.validBitsInCurrentByte;

            if (foundTerminatingBit) {
                removeBitsFromByte(state, bitsCountIncludingTerminatingBit);
            } else {
                state.validBitsInCurrentByte = 0;
            }
        } while (!foundTerminatingBit);

        return countedBits;
    }

    function removeBitsFromByte(state, bitsCount) {
        state.validBitsInCurrentByte -= bitsCount;
        if (state.validBitsInCurrentByte > 0) {
            state.currentByte = state.currentByte << bitsCount & 0xFF;
        }
    }

    function tryValidateCurrentByte(databin, state) {
        if (state.validBitsInCurrentByte > 0) {
            return true;
        }

        var bytesNeeded = state.isSkipNextByte ? 2 : 1;

        var resultArray = [];
        var bytesCopied = databin.copyBytes(resultArray, /*resultStartOffset=*/0, {
            forceCopyAllRange: true,
            databinStartOffset: state.nextOffsetToParse,
            maxLengthToCopy: bytesNeeded
        });

        if (bytesCopied !== bytesNeeded) {
            return false;
        }

        var prevByte = state.originalByteWithoutShift;

        state.currentByte = resultArray[bytesNeeded - 1];
        state.validBitsInCurrentByte = 8;
        state.originalByteWithoutShift = state.currentByte;

        if (prevByte === 0xFF) {
            if ((resultArray[0] & 0x80) !== 0) {
                throw new jGlobals.j2kExceptions.IllegalDataException('Expected 0 bit after 0xFF byte', 'B.10.1');
            }

            // No need to skip another bit if already skip the whole byte
            if (!state.isSkipNextByte) {
                state.currentByte <<= 1;
                state.validBitsInCurrentByte = 7;
            }
        }

        state.isSkipNextByte = false;
        state.nextOffsetToParse += bytesNeeded;

        return true;
    }

    function createZeroBitsUntilFirstOneBitMap() {
        var arrayMap = new Array(255);

        arrayMap[0x00] = 9;
        arrayMap[0x01] = 8;
        arrayMap[0x02] = 7;
        arrayMap[0x03] = 7;

        var i;

        for (i = 0x04; i <= 0x07; ++i) {
            arrayMap[i] = 6;
        }

        for (i = 0x08; i <= 0x0F; ++i) {
            arrayMap[i] = 5;
        }

        for (i = 0x10; i <= 0x1F; ++i) {
            arrayMap[i] = 4;
        }

        for (i = 0x20; i <= 0x3F; ++i) {
            arrayMap[i] = 3;
        }

        for (i = 0x40; i <= 0x7F; ++i) {
            arrayMap[i] = 2;
        }

        for (i = 0x80; i <= 0xFF; ++i) {
            arrayMap[i] = 1;
        }

        // Avoid two's complement problems
        for (i = 0; i <= 0xFF; ++i) {
            arrayMap[i - 0x100] = arrayMap[i];
        }

        return arrayMap;
    }

    return JpipBitstreamReader;
}();

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipTagTree(bitstreamReader, width, height, transactionHelper) {

    var isAlreadyReadBitsTransactionalObject = transactionHelper.createTransactionalObject(false, function cloneBoolean(old) {
        return old;
    });
    var levels;

    createLevelsArray();

    this.setMinimalValueIfNotReadBits = function setMinimalValueIfNotReadBits(minimalValue) {

        if (isAlreadyReadBits()) {
            return;
        }

        var transactionalObject = levels[0].content[0];
        var node = transactionalObject.getValue(bitstreamReader.activeTransaction);

        node.minimalPossibleValue = minimalValue;
    };

    this.isSmallerThanOrEqualsTo = function isSmallerThanOrEqualsTo(x, y, value) {

        setAlreadyReadBits();

        var getNextNode = getRootToLeafIterator(x, y);
        var currentNode = getNextNode();
        var lastNode;

        while (currentNode !== null) {
            if (currentNode.minimalPossibleValue > value) {
                return false;
            }

            if (!currentNode.isFinalValue) {
                var maxBitsToShift = value - currentNode.minimalPossibleValue + 1;
                var addToValue = bitstreamReader.countZerosAndShiftUntilFirstOneBit(maxBitsToShift);

                if (addToValue === null) {
                    return null;
                }

                currentNode.minimalPossibleValue += addToValue;

                if (addToValue < maxBitsToShift) {
                    currentNode.isFinalValue = true;
                }
            }

            lastNode = currentNode;
            currentNode = getNextNode();
        }

        var result = lastNode.minimalPossibleValue <= value;
        if (result && !lastNode.isFinalValue) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Wrong parsing in TagTree.isSmallerThanOrEqualsTo: ' + 'not sure if value is smaller than asked');
        }

        return result;
    };

    this.getValue = function getValue(x, y) {
        var getNextNode = getRootToLeafIterator(x, y);
        var currentNode = getNextNode();
        var leaf;

        setAlreadyReadBits();

        while (currentNode !== null) {
            if (!currentNode.isFinalValue) {
                var addToValue = bitstreamReader.countZerosAndShiftUntilFirstOneBit();

                if (addToValue === null) {
                    return null;
                }

                currentNode.minimalPossibleValue += addToValue;
                currentNode.isFinalValue = true;
            }

            leaf = currentNode;
            currentNode = getNextNode();
        }

        return leaf.minimalPossibleValue;
    };

    function createLevelsArray() {
        levels = [];
        var levelWidth = width;
        var levelHeight = height;

        while (levelWidth >= 1 || levelHeight >= 1) {
            levelWidth = Math.ceil(levelWidth);
            levelHeight = Math.ceil(levelHeight);

            var elementCount = levelWidth * levelHeight;
            levels.unshift({
                width: levelWidth,
                height: levelHeight,
                content: new Array(elementCount)
            });

            levelWidth /= 2;
            levelHeight /= 2;
        }

        initNode(0, 0);
    }

    function getRootToLeafIterator(x, y) {
        var level = 0;
        var prevIteratedNode = null;

        function getNext() {
            if (level === null) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Iterated too deep in tag tree');
            }

            if (level === levels.length) {
                level = null;
                return null;
            }

            var shiftFactor = levels.length - level - 1;
            var currentX = Math.floor(x >> shiftFactor);
            var currentY = Math.floor(y >> shiftFactor);

            var indexInLevel = levels[level].width * currentY + currentX;

            var transactionalObject = levels[level].content[indexInLevel];

            if (transactionalObject === undefined) {
                transactionalObject = initNode(level, indexInLevel);
            }

            var result = transactionalObject.getValue(bitstreamReader.activeTransaction);

            if (prevIteratedNode !== null && prevIteratedNode.minimalPossibleValue > result.minimalPossibleValue) {

                result.minimalPossibleValue = prevIteratedNode.minimalPossibleValue;
            }

            prevIteratedNode = result;
            ++level;
            return result;
        }

        return getNext;
    }

    function initNode(level, indexInLevel) {
        var objectValue = {
            minimalPossibleValue: 0,
            isFinalValue: false
        };

        var transactionalObject = transactionHelper.createTransactionalObject(objectValue, function cloneNodeValue(nodeValue) {
            return {
                minimalPossibleValue: nodeValue.minimalPossibleValue,
                isFinalValue: nodeValue.isFinalValue
            };
        });

        levels[level].content[indexInLevel] = transactionalObject;
        return transactionalObject;
    }

    function isAlreadyReadBits() {
        var isAlreadyReadBitsTransactionalValue = isAlreadyReadBitsTransactionalObject.getValue(bitstreamReader.activeTransaction);

        return isAlreadyReadBitsTransactionalValue;
    }

    function setAlreadyReadBits() {
        isAlreadyReadBitsTransactionalObject.setValue(bitstreamReader.activeTransaction, true);
    }
};

/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipCodeblockLengthParserClosure() {
    // B.10.7.

    var exactLog2Table = createExactLog2Table();

    function JpipCodeblockLengthParser(bitstreamReader, transactionHelper) {
        var lBlock = transactionHelper.createTransactionalObject({ lBlockValue: 3 }, function cloneLBlock(oldLBlock) {
            return { lBlockValue: oldLBlock.lBlockValue };
        });

        this.parse = function parse(codingPasses) {
            var addToLBlock = bitstreamReader.countOnesAndShiftUntilFirstZeroBit();
            if (addToLBlock === null) {
                return null;
            }

            var lBlockState = lBlock.getValue(bitstreamReader.activeTransaction);
            lBlockState.lBlockValue += addToLBlock;

            var codingPassesLog2 = exactLog2Table[codingPasses];
            if (codingPassesLog2 === undefined) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected value of coding passes ' + codingPasses + '. Expected positive integer <= 164');
            }

            var bitsCount = lBlockState.lBlockValue + codingPassesLog2;
            var length = bitstreamReader.shiftBits(bitsCount);

            return length;
        };
    }

    function createExactLog2Table() {
        var maxCodingPassesPossible = 164;
        var result = new Array(maxCodingPassesPossible);

        var inputValueLowerBound = 1;
        var inputValueUpperBound = 2;
        var log2Result = 0;

        while (inputValueLowerBound <= maxCodingPassesPossible) {
            for (var i = inputValueLowerBound; i < inputValueUpperBound; ++i) {
                result[i] = log2Result;
            }

            inputValueLowerBound *= 2;
            inputValueUpperBound *= 2;
            ++log2Result;
        }

        return result;
    }

    return JpipCodeblockLengthParser;
}();

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipSubbandLengthInPacketHeaderCalculator(bitstreamReader, numCodeblocksX, numCodeblocksY, codingPassesNumberParser, transactionHelper, jpipFactory) {

    var codeblockLengthParsers = null;
    var isCodeblocksIncluded = null;
    var parsedQualityLayers = transactionHelper.createTransactionalObject(0, function cloneLayers(layers) {
        return layers;
    });

    var inclusionTree = jpipFactory.createTagTree(bitstreamReader, numCodeblocksX, numCodeblocksY);

    var zeroBitPlanesTree = jpipFactory.createTagTree(bitstreamReader, numCodeblocksX, numCodeblocksY);

    this.calculateSubbandLength = function calcualteSubbandLength(qualityLayer) {
        ensureQualityLayerNotParsedYet(qualityLayer);

        lazyInitArrays();

        inclusionTree.setMinimalValueIfNotReadBits(qualityLayer);

        var accumulatedBodyLengthBytes = 0;
        var codeblockIndex = 0;
        var codeblockLengthByIndex = new Array(numCodeblocksX * numCodeblocksY);

        for (var y = 0; y < numCodeblocksY; ++y) {
            for (var x = 0; x < numCodeblocksX; ++x) {
                var codeblockBodyLength = getNextCodeblockLength(x, y, qualityLayer);
                if (codeblockBodyLength === null) {
                    return null;
                }

                codeblockLengthByIndex[codeblockIndex++] = codeblockBodyLength;

                accumulatedBodyLengthBytes += codeblockBodyLength.codeblockBodyLengthBytes;
            }
        }

        parsedQualityLayers.setValue(bitstreamReader.activeTransaction, qualityLayer + 1);

        return {
            codeblockBodyLengthByIndex: codeblockLengthByIndex,
            overallBodyLengthBytes: accumulatedBodyLengthBytes
        };
    };

    function ensureQualityLayerNotParsedYet(qualityLayer) {
        var parsedQualityLayersValue = parsedQualityLayers.getValue(bitstreamReader.activeTransaction);

        if (parsedQualityLayersValue >= qualityLayer + 1) {
            throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected quality layer to parse');
        }
    }

    function lazyInitArrays() {
        if (codeblockLengthParsers !== null) {
            return;
        }

        codeblockLengthParsers = new Array(numCodeblocksX);
        isCodeblocksIncluded = new Array(numCodeblocksX);

        for (var x = 0; x < numCodeblocksX; ++x) {
            codeblockLengthParsers[x] = new Array(numCodeblocksY);
            isCodeblocksIncluded[x] = new Array(numCodeblocksY);

            for (var y = 0; y < numCodeblocksY; ++y) {
                codeblockLengthParsers[x][y] = jpipFactory.createCodeblockLengthParser(bitstreamReader, transactionHelper);

                isCodeblocksIncluded[x][y] = transactionHelper.createTransactionalObject({ isIncluded: false }, function cloneIsIncluded(old) {
                    return { isIncluded: old.isIncluded };
                });
            }
        }
    }

    function getNextCodeblockLength(x, y, qualityLayer) {
        var isCodeblockAlreadyIncluded = isCodeblocksIncluded[x][y].getValue(bitstreamReader.activeTransaction);

        var isCodeblockIncludedNow;
        if (isCodeblockAlreadyIncluded.isIncluded) {
            isCodeblockIncludedNow = bitstreamReader.shiftBit();
        } else {
            isCodeblockIncludedNow = inclusionTree.isSmallerThanOrEqualsTo(x, y, qualityLayer);
        }

        if (isCodeblockIncludedNow === null) {
            return null;
        } else if (!isCodeblockIncludedNow) {
            return {
                codeblockBodyLengthBytes: 0,
                codingPasses: 0
            };
        }

        var zeroBitPlanes = null;
        if (!isCodeblockAlreadyIncluded.isIncluded) {
            zeroBitPlanes = zeroBitPlanesTree.getValue(x, y);
            if (zeroBitPlanes === null) {
                return null;
            }
        }

        var codingPasses = codingPassesNumberParser.parse(bitstreamReader);
        if (codingPasses === null) {
            return null;
        }

        var lengthParser = codeblockLengthParsers[x][y];
        var bodyLengthBytes = lengthParser.parse(codingPasses);

        if (bodyLengthBytes === null) {
            return null;
        }

        isCodeblockAlreadyIncluded.isIncluded = true;

        var result = {
            codeblockBodyLengthBytes: bodyLengthBytes,
            codingPasses: codingPasses
        };

        if (zeroBitPlanes !== null) {
            result.zeroBitPlanes = zeroBitPlanes;
        }

        return result;
    }
};

/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipPacketLengthCalculator(tileStructure, componentStructure, databin, startOffsetInDatabin, precinct, jpipFactory) {

    var calculatedLengths = [];

    var bitstreamReader = jpipFactory.createBitstreamReader(databin);

    var numCodeblocksX = componentStructure.getNumCodeblocksXInPrecinct(precinct);
    var numCodeblocksY = componentStructure.getNumCodeblocksYInPrecinct(precinct);

    var numQualityLayersInTile = tileStructure.getNumQualityLayers();
    var isPacketHeaderNearData = tileStructure.getIsPacketHeaderNearData();
    var isStartOfPacketMarkerAllowed = tileStructure.getIsStartOfPacketMarkerAllowed();
    var isEndPacketHeaderMarkerAllowed = tileStructure.getIsEndPacketHeaderMarkerAllowed();

    var subbandParsers = initSubbandParsers();

    this.calculateEndOffsetOfLastFullPacket = function calculateFullPacketsAvailableOffsets(quality) {

        var isAllowedFullQuality = quality === undefined || quality >= numQualityLayersInTile;

        var numQualityLayersToParse;
        if (!isAllowedFullQuality) {
            numQualityLayersToParse = quality;
        } else if (!databin.isAllDatabinLoaded()) {
            numQualityLayersToParse = numQualityLayersInTile;
        } else {
            var endOffset = databin.getDatabinLengthIfKnown();

            return {
                endOffset: endOffset,
                numQualityLayers: numQualityLayersInTile
            };
        }

        checkSupportedStructure();

        tryValidatePackets(numQualityLayersToParse);
        var result = getFullQualityLayersEndOffset(numQualityLayersToParse);

        return result;
    };

    this.getPacketOffsetsByCodeblockIndex = function getPacketOffsetsByCodeblockIndex(qualityLayer) {

        checkSupportedStructure();
        tryValidatePackets(qualityLayer + 1);

        if (calculatedLengths.length <= qualityLayer) {
            return null;
        }

        return calculatedLengths[qualityLayer];
    };

    function tryValidatePackets(qualityLayers) {
        while (calculatedLengths.length < qualityLayers) {
            bitstreamReader.startNewTransaction();

            var nextPacket = tryCalculateNextPacketLength(calculatedLengths.length);

            if (nextPacket === null) {
                bitstreamReader.activeTransaction.abort();
                return;
            }

            calculatedLengths.push(nextPacket);
            bitstreamReader.activeTransaction.commit();
        }
    }

    function tryCalculateNextPacketLength(qualityLayer) {
        var headerStartOffset;
        if (qualityLayer > 0) {
            var last = calculatedLengths[qualityLayer - 1];
            headerStartOffset = last.headerStartOffset + last.headerLength + last.overallBodyLengthBytes;
        } else {
            headerStartOffset = startOffsetInDatabin;
        }

        bitstreamReader.databinOffset = headerStartOffset;

        if (isPacketHeaderNearData && isStartOfPacketMarkerAllowed) {
            var isMarker = isMarkerHere(0x91);

            if (isMarker === null) {
                return null;
            } else if (isMarker) {
                var startOfPacketSegmentLength = 6;
                bitstreamReader.databinOffset += startOfPacketSegmentLength;
            }
        }

        var isPacketExistInQualityLayer = bitstreamReader.shiftBit();
        if (isPacketExistInQualityLayer === null) {
            return null;
        }

        if (!isPacketExistInQualityLayer) {
            bitstreamReader.shiftRemainingBitsInByte();

            return {
                headerStartOffset: headerStartOffset,
                headerLength: 1,
                codeblockBodyLengthByIndex: [],
                overallBodyLengthBytes: 0
            };
        }

        var bodyLength = actualCalculatePacketLengthAfterZeroLengthBit(qualityLayer);
        if (bodyLength === null) {
            return null;
        }

        var headerEndOffset = bitstreamReader.databinOffset;
        bodyLength.headerLength = headerEndOffset - headerStartOffset;

        bodyLength.headerStartOffset = headerStartOffset;

        return bodyLength;
    }

    function actualCalculatePacketLengthAfterZeroLengthBit(qualityLayer) {
        var bodyBytes = 0;
        var codeblockBodyLengthByIndex = null;

        for (var subband = 0; subband < subbandParsers.length; ++subband) {
            var parser = subbandParsers[subband];
            var subbandBodyLength = parser.calculateSubbandLength(qualityLayer);

            if (subbandBodyLength === null) {
                return null;
            }

            if (codeblockBodyLengthByIndex === null) {
                codeblockBodyLengthByIndex = subbandBodyLength.codeblockBodyLengthByIndex;
            } else {
                codeblockBodyLengthByIndex = codeblockBodyLengthByIndex.concat(subbandBodyLength.codeblockBodyLengthByIndex);
            }

            bodyBytes += subbandBodyLength.overallBodyLengthBytes;
        }

        bitstreamReader.shiftRemainingBitsInByte();

        if (isEndPacketHeaderMarkerAllowed) {
            var isMarker = isMarkerHere(0x92);

            if (isMarker === null) {
                return null;
            } else if (isMarker) {
                var endPacketHeaderMarkerLength = 2;
                bitstreamReader.databinOffset += endPacketHeaderMarkerLength;
            }
        }

        return {
            codeblockBodyLengthByIndex: codeblockBodyLengthByIndex,
            overallBodyLengthBytes: bodyBytes
        };
    }

    function getFullQualityLayersEndOffset(quality) {
        var numParsedQualityLayer = Math.min(quality, calculatedLengths.length);

        if (numParsedQualityLayer === 0) {
            return {
                endOffset: startOffsetInDatabin,
                numQualityLayers: 0
            };
        }

        var lastPacket = calculatedLengths[numParsedQualityLayer - 1];
        var endOffset = lastPacket.headerStartOffset + lastPacket.headerLength + lastPacket.overallBodyLengthBytes;

        var result = {
            endOffset: endOffset,
            numQualityLayers: numParsedQualityLayer
        };

        return result;
    }

    function initSubbandParsers() {
        var numSubbands = precinct.resolutionLevel === 0 ? 1 : 3;
        var result = [];

        for (var i = 0; i < numSubbands; ++i) {
            var numCodeblocksXInSubband;
            var numCodeblocksYInSubband;
            if (precinct.resolutionLevel === 0) {
                numCodeblocksXInSubband = numCodeblocksX;
                numCodeblocksYInSubband = numCodeblocksY;
            } else {
                // Treat the edge case of single redundant pixels column
                // (In other cases, numCodeblocksX is full duplication of 2.
                // See JpipComponentStructure implementation).
                if (i === 1) {
                    // LH
                    numCodeblocksXInSubband = Math.ceil(numCodeblocksX / 2);
                } else {
                    // HL or HH
                    numCodeblocksXInSubband = Math.floor(numCodeblocksX / 2);
                }

                // Treat the edge case of single redundant pixels row
                // (In other cases, numCodeblocksY is full duplication of 2.
                // See JpipComponentStructure implementation).
                if (i === 0) {
                    // HL
                    numCodeblocksYInSubband = Math.ceil(numCodeblocksY / 2);
                } else {
                    // LH or HH
                    numCodeblocksYInSubband = Math.floor(numCodeblocksY / 2);
                }
            }

            if (numCodeblocksXInSubband === 0 || numCodeblocksYInSubband === 0) {
                continue;
            }

            result.push(jpipFactory.createSubbandLengthInPacketHeaderCalculator(bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband));
        }

        return result;
    }

    function isMarkerHere(markerSecondByte) {
        var possibleMarker = new Array(2);
        var bytesCopied = databin.copyBytes(possibleMarker,
        /*resultStartOffset=*/0, {
            databinStartOffset: bitstreamReader.databinOffset,
            maxLengthToCopy: 2,
            forceCopyAllRange: false
        });

        switch (bytesCopied) {
            case 2:
                var isMarker = possibleMarker[0] === 0xFF && possibleMarker[1] === markerSecondByte;

                return isMarker;

            case 1:
                if (possibleMarker[0] === 0xFF) {
                    return null;
                }

                return false;

            default:
                return null;
        }
    }

    function checkSupportedStructure() {
        if (!isPacketHeaderNearData) {
            throw new jGlobals.jpipExceptions.UnsupportedFeatureException('PPM or PPT', 'A.7.4 and A.7.5');
        }
    }
};

/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var jGlobals = __webpack_require__(0);

module.exports = function JpipQualityLayersCache(codestreamStructure, jpipFactory) {

    var CACHE_KEY = 'packetLengthCalculator';

    this.getPacketOffsetsByCodeblockIndex = function getPacketOffsetsByCodeblockIndex(precinctDatabin, qualityLayer, precinctPosition) {

        var packetLengthCalculator = getPacketParser(precinctDatabin, precinctPosition);

        var result = packetLengthCalculator.getPacketOffsetsByCodeblockIndex(qualityLayer);

        return result;
    };

    this.getQualityLayerOffset = function getQualityLayerOffset(precinctDatabin, quality, precinctPosition) {

        var loadedRanges = precinctDatabin.getExistingRanges();
        var endOffsetLoaded;

        var packetLengthCalculator = getPacketParser(precinctDatabin, precinctPosition);

        if (loadedRanges.length < 1 || loadedRanges[0].start > 0) {
            endOffsetLoaded = 0;
            quality = 0;
        } else {
            endOffsetLoaded = loadedRanges[0].start + loadedRanges[0].length;
        }

        var layersInPrecinct = packetLengthCalculator.calculateEndOffsetOfLastFullPacket(quality);

        while (endOffsetLoaded < layersInPrecinct.endOffset) {
            var reducedLayersToSearch = layersInPrecinct.numQualityLayers - 1;
            layersInPrecinct = packetLengthCalculator.calculateEndOffsetOfLastFullPacket(reducedLayersToSearch);
        }

        return layersInPrecinct;
    };

    function getPacketParser(precinctDatabin, precinctPosition) {
        var packetLengthCalculatorContainer = precinctDatabin.getCachedData(CACHE_KEY);

        if (packetLengthCalculatorContainer.calculator !== undefined) {
            return packetLengthCalculatorContainer.calculator;
        }

        if (precinctPosition === undefined) {
            throw new jGlobals.jpipExceptions.InternalErrorException('precinctPosition ' + 'should be given on the first time of using QualityLayersCache ' + 'on this precinct');
        }

        var tileStructure = codestreamStructure.getTileStructure(precinctPosition.tileIndex);

        var componentStructure = tileStructure.getComponentStructure(precinctPosition.component);

        packetLengthCalculatorContainer.calculator = jpipFactory.createPacketLengthCalculator(tileStructure, componentStructure, precinctDatabin,
        /*startOffsetInDatabin=*/0, precinctPosition);

        return packetLengthCalculatorContainer.calculator;
    }
};

/***/ }),
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _jpx = __webpack_require__(2);

module.exports = PdfjsJpxDecoderLegacy;

var jGlobals = __webpack_require__(0);

function PdfjsJpxDecoderLegacy() {
    this._image = new _jpx.JpxImage();
}

PdfjsJpxDecoderLegacy.prototype.start = function start(data) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var regionToParse = {
            left: data.offsetInRegion.offsetX,
            top: data.offsetInRegion.offsetY,
            right: data.offsetInRegion.offsetX + data.offsetInRegion.width,
            bottom: data.offsetInRegion.offsetY + data.offsetInRegion.height
        };

        var currentContext = self._image.parseCodestream(data.headersCodestream, 0, data.headersCodestream.length, { isOnlyParseHeaders: true });

        if (data.codeblocksData) {
            self._image.addPacketsData(currentContext, data.codeblocksData);
        }
        if (data.precinctCoefficients) {
            for (var i = 0; i < data.precinctCoefficients.length; ++i) {
                var precinct = data.precinctCoefficients[i];
                self._image.setPrecinctCoefficients(currentContext, precinct.coefficients, precinct.tileIndex, precinct.c, precinct.r, precinct.p);
            }
        }

        self._image.decode(currentContext, { regionToParse: regionToParse });

        var pixels = self._copyTilesPixelsToOnePixelsArray(self._image.tiles, regionToParse, self._image.componentsCount);
        resolve(pixels);
    });
};

PdfjsJpxDecoderLegacy.prototype._copyTilesPixelsToOnePixelsArray = function copyTilesPixelsToOnePixelsArray(tiles, resultRegion, componentsCount) {

    var firstTile = tiles[0];
    var width = resultRegion.right - resultRegion.left;
    var height = resultRegion.bottom - resultRegion.top;

    //if (firstTile.left === resultRegion.left &&
    //    firstTile.top === resultRegion.top &&
    //    firstTile.width === width &&
    //    firstTile.height === height &&
    //    componentsCount === 4) {
    //    
    //    return firstTile;
    //}

    var result = new ImageData(width, height);

    var bytesPerPixel = 4;
    var rgbaImageStride = width * bytesPerPixel;

    var tileIndex = 0;

    //for (var x = 0; x < numTilesX; ++x) {

    for (var i = 0; i < tiles.length; ++i) {
        var tileRight = tiles[i].left + tiles[i].width;
        var tileBottom = tiles[i].top + tiles[i].height;

        var intersectionLeft = Math.max(resultRegion.left, tiles[i].left);
        var intersectionTop = Math.max(resultRegion.top, tiles[i].top);
        var intersectionRight = Math.min(resultRegion.right, tileRight);
        var intersectionBottom = Math.min(resultRegion.bottom, tileBottom);

        var intersectionWidth = intersectionRight - intersectionLeft;
        var intersectionHeight = intersectionBottom - intersectionTop;

        if (intersectionLeft !== tiles[i].left || intersectionTop !== tiles[i].top || intersectionWidth !== tiles[i].width || intersectionHeight !== tiles[i].height) {

            throw 'Unsupported tiles to copy';
        }

        var tileOffsetXPixels = intersectionLeft - resultRegion.left;
        var tileOffsetYPixels = intersectionTop - resultRegion.top;

        var tileOffsetBytes = tileOffsetXPixels * bytesPerPixel + tileOffsetYPixels * rgbaImageStride;

        this._copyTile(result.data, tiles[i], tileOffsetBytes, rgbaImageStride, componentsCount);
    }

    return result;
};

PdfjsJpxDecoderLegacy.prototype._copyTile = function copyTile(targetImage, tile, targetImageStartOffset, targetImageStride, componentsCount) {

    var rOffset = 0;
    var gOffset = 1;
    var bOffset = 2;
    var pixelsOffset = 1;

    var pixels = tile.pixels || tile.items;

    if (componentsCount === undefined) {
        componentsCount = pixels.length / (tile.width * tile.height);
    }

    switch (componentsCount) {
        case 1:
            gOffset = 0;
            bOffset = 0;
            break;

        case 3:
            pixelsOffset = 3;
            break;

        case 4:
            pixelsOffset = 4;
            break;

        default:
            throw 'Unsupported components count ' + componentsCount;
    }

    var targetImageIndex = targetImageStartOffset;
    var pixel = 0;
    for (var y = 0; y < tile.height; ++y) {
        var targetImageStartLine = targetImageIndex;

        for (var x = 0; x < tile.width; ++x) {
            targetImage[targetImageIndex + 0] = pixels[pixel + rOffset];
            targetImage[targetImageIndex + 1] = pixels[pixel + gOffset];
            targetImage[targetImageIndex + 2] = pixels[pixel + bOffset];
            targetImage[targetImageIndex + 3] = 255;

            pixel += pixelsOffset;
            targetImageIndex += 4;
        }

        targetImageIndex = targetImageStartLine + targetImageStride;
    }
};

/***/ }),
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint no-var: error */

// import './compatibility';
// import { ReadableStream } from './streams_polyfill';
// import { URL } from './url_polyfill';

var IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];
var FONT_IDENTITY_MATRIX = [0.001, 0, 0, 0.001, 0, 0];

var NativeImageDecoding = {
  NONE: 'none',
  DECODE: 'decode',
  DISPLAY: 'display'
};

// Permission flags from Table 22, Section 7.6.3.2 of the PDF specification.
var PermissionFlag = {
  PRINT: 0x04,
  MODIFY_CONTENTS: 0x08,
  COPY: 0x10,
  MODIFY_ANNOTATIONS: 0x20,
  FILL_INTERACTIVE_FORMS: 0x100,
  COPY_FOR_ACCESSIBILITY: 0x200,
  ASSEMBLE: 0x400,
  PRINT_HIGH_QUALITY: 0x800
};

var TextRenderingMode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_ADD_TO_PATH: 6,
  ADD_TO_PATH: 7,
  FILL_STROKE_MASK: 3,
  ADD_TO_PATH_FLAG: 4
};

var ImageKind = {
  GRAYSCALE_1BPP: 1,
  RGB_24BPP: 2,
  RGBA_32BPP: 3
};

var AnnotationType = {
  TEXT: 1,
  LINK: 2,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  POLYGON: 7,
  POLYLINE: 8,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  CARET: 14,
  INK: 15,
  POPUP: 16,
  FILEATTACHMENT: 17,
  SOUND: 18,
  MOVIE: 19,
  WIDGET: 20,
  SCREEN: 21,
  PRINTERMARK: 22,
  TRAPNET: 23,
  WATERMARK: 24,
  THREED: 25,
  REDACT: 26
};

var AnnotationStateModelType = {
  MARKED: 'Marked',
  REVIEW: 'Review'
};

var AnnotationMarkedState = {
  MARKED: 'Marked',
  UNMARKED: 'Unmarked'
};

var AnnotationReviewState = {
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  NONE: 'None'
};

var AnnotationReplyType = {
  GROUP: 'Group',
  REPLY: 'R'
};

var AnnotationFlag = {
  INVISIBLE: 0x01,
  HIDDEN: 0x02,
  PRINT: 0x04,
  NOZOOM: 0x08,
  NOROTATE: 0x10,
  NOVIEW: 0x20,
  READONLY: 0x40,
  LOCKED: 0x80,
  TOGGLENOVIEW: 0x100,
  LOCKEDCONTENTS: 0x200
};

var AnnotationFieldFlag = {
  READONLY: 0x0000001,
  REQUIRED: 0x0000002,
  NOEXPORT: 0x0000004,
  MULTILINE: 0x0001000,
  PASSWORD: 0x0002000,
  NOTOGGLETOOFF: 0x0004000,
  RADIO: 0x0008000,
  PUSHBUTTON: 0x0010000,
  COMBO: 0x0020000,
  EDIT: 0x0040000,
  SORT: 0x0080000,
  FILESELECT: 0x0100000,
  MULTISELECT: 0x0200000,
  DONOTSPELLCHECK: 0x0400000,
  DONOTSCROLL: 0x0800000,
  COMB: 0x1000000,
  RICHTEXT: 0x2000000,
  RADIOSINUNISON: 0x2000000,
  COMMITONSELCHANGE: 0x4000000
};

var AnnotationBorderStyleType = {
  SOLID: 1,
  DASHED: 2,
  BEVELED: 3,
  INSET: 4,
  UNDERLINE: 5
};

var StreamType = {
  UNKNOWN: 'UNKNOWN',
  FLATE: 'FLATE',
  LZW: 'LZW',
  DCT: 'DCT',
  JPX: 'JPX',
  JBIG: 'JBIG',
  A85: 'A85',
  AHX: 'AHX',
  CCF: 'CCF',
  RLX: 'RLX' // PDF short name is 'RL', but telemetry requires three chars.
};

var FontType = {
  UNKNOWN: 'UNKNOWN',
  TYPE1: 'TYPE1',
  TYPE1C: 'TYPE1C',
  CIDFONTTYPE0: 'CIDFONTTYPE0',
  CIDFONTTYPE0C: 'CIDFONTTYPE0C',
  TRUETYPE: 'TRUETYPE',
  CIDFONTTYPE2: 'CIDFONTTYPE2',
  TYPE3: 'TYPE3',
  OPENTYPE: 'OPENTYPE',
  TYPE0: 'TYPE0',
  MMTYPE1: 'MMTYPE1'
};

var VerbosityLevel = {
  ERRORS: 0,
  WARNINGS: 1,
  INFOS: 5
};

var CMapCompressionType = {
  NONE: 0,
  BINARY: 1,
  STREAM: 2
};

// All the possible operations for an operator list.
var OPS = {
  // Intentionally start from 1 so it is easy to spot bad operators that will be
  // 0's.
  dependency: 1,
  setLineWidth: 2,
  setLineCap: 3,
  setLineJoin: 4,
  setMiterLimit: 5,
  setDash: 6,
  setRenderingIntent: 7,
  setFlatness: 8,
  setGState: 9,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  clip: 29,
  eoClip: 30,
  beginText: 31,
  endText: 32,
  setCharSpacing: 33,
  setWordSpacing: 34,
  setHScale: 35,
  setLeading: 36,
  setFont: 37,
  setTextRenderingMode: 38,
  setTextRise: 39,
  moveText: 40,
  setLeadingMoveText: 41,
  setTextMatrix: 42,
  nextLine: 43,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setCharWidth: 48,
  setCharWidthAndBounds: 49,
  setStrokeColorSpace: 50,
  setFillColorSpace: 51,
  setStrokeColor: 52,
  setStrokeColorN: 53,
  setFillColor: 54,
  setFillColorN: 55,
  setStrokeGray: 56,
  setFillGray: 57,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setStrokeCMYKColor: 60,
  setFillCMYKColor: 61,
  shadingFill: 62,
  beginInlineImage: 63,
  beginImageData: 64,
  endInlineImage: 65,
  paintXObject: 66,
  markPoint: 67,
  markPointProps: 68,
  beginMarkedContent: 69,
  beginMarkedContentProps: 70,
  endMarkedContent: 71,
  beginCompat: 72,
  endCompat: 73,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  beginAnnotations: 78,
  endAnnotations: 79,
  beginAnnotation: 80,
  endAnnotation: 81,
  paintJpegXObject: 82,
  paintImageMaskXObject: 83,
  paintImageMaskXObjectGroup: 84,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintInlineImageXObjectGroup: 87,
  paintImageXObjectRepeat: 88,
  paintImageMaskXObjectRepeat: 89,
  paintSolidColorImageMask: 90,
  constructPath: 91
};

var UNSUPPORTED_FEATURES = {
  unknown: 'unknown',
  forms: 'forms',
  javaScript: 'javaScript',
  smask: 'smask',
  shadingPattern: 'shadingPattern',
  font: 'font'
};

var PasswordResponses = {
  NEED_PASSWORD: 1,
  INCORRECT_PASSWORD: 2
};

var verbosity = VerbosityLevel.WARNINGS;

function setVerbosityLevel(level) {
  if (Number.isInteger(level)) {
    verbosity = level;
  }
}

function getVerbosityLevel() {
  return verbosity;
}

// A notice for devs. These are good for things that are helpful to devs, such
// as warning that Workers were disabled, which is important to devs but not
// end users.
function info(msg) {
  if (verbosity >= VerbosityLevel.INFOS) {
    console.log('Info: ' + msg);
  }
}

// Non-fatal warnings.
function warn(msg) {
  if (verbosity >= VerbosityLevel.WARNINGS) {
    console.log('Warning: ' + msg);
  }
}

function unreachable(msg) {
  throw new Error(msg);
}

function assert(cond, msg) {
  if (!cond) {
    unreachable(msg);
  }
}

// Checks if URLs have the same origin. For non-HTTP based URLs, returns false.
function isSameOrigin(baseUrl, otherUrl) {
  var base = void 0;
  try {
    base = new URL(baseUrl);
    if (!base.origin || base.origin === 'null') {
      return false; // non-HTTP url
    }
  } catch (e) {
    return false;
  }

  var other = new URL(otherUrl, base);
  return base.origin === other.origin;
}

// Checks if URLs use one of the whitelisted protocols, e.g. to avoid XSS.
function _isValidProtocol(url) {
  if (!url) {
    return false;
  }
  switch (url.protocol) {
    case 'http:':
    case 'https:':
    case 'ftp:':
    case 'mailto:':
    case 'tel:':
      return true;
    default:
      return false;
  }
}

/**
 * Attempts to create a valid absolute URL.
 *
 * @param {URL|string} url - An absolute, or relative, URL.
 * @param {URL|string} baseUrl - An absolute URL.
 * @returns Either a valid {URL}, or `null` otherwise.
 */
function createValidAbsoluteUrl(url, baseUrl) {
  if (!url) {
    return null;
  }
  try {
    var absoluteUrl = baseUrl ? new URL(url, baseUrl) : new URL(url);
    if (_isValidProtocol(absoluteUrl)) {
      return absoluteUrl;
    }
  } catch (ex) {/* `new URL()` will throw on incorrect data. */}
  return null;
}

function shadow(obj, prop, value) {
  Object.defineProperty(obj, prop, { value: value,
    enumerable: true,
    configurable: true,
    writable: false });
  return value;
}

var PasswordException = function PasswordExceptionClosure() {
  function PasswordException(msg, code) {
    this.name = 'PasswordException';
    this.message = msg;
    this.code = code;
  }

  PasswordException.prototype = new Error();
  PasswordException.constructor = PasswordException;

  return PasswordException;
}();

var UnknownErrorException = function UnknownErrorExceptionClosure() {
  function UnknownErrorException(msg, details) {
    this.name = 'UnknownErrorException';
    this.message = msg;
    this.details = details;
  }

  UnknownErrorException.prototype = new Error();
  UnknownErrorException.constructor = UnknownErrorException;

  return UnknownErrorException;
}();

var InvalidPDFException = function InvalidPDFExceptionClosure() {
  function InvalidPDFException(msg) {
    this.name = 'InvalidPDFException';
    this.message = msg;
  }

  InvalidPDFException.prototype = new Error();
  InvalidPDFException.constructor = InvalidPDFException;

  return InvalidPDFException;
}();

var MissingPDFException = function MissingPDFExceptionClosure() {
  function MissingPDFException(msg) {
    this.name = 'MissingPDFException';
    this.message = msg;
  }

  MissingPDFException.prototype = new Error();
  MissingPDFException.constructor = MissingPDFException;

  return MissingPDFException;
}();

var UnexpectedResponseException = function UnexpectedResponseExceptionClosure() {
  function UnexpectedResponseException(msg, status) {
    this.name = 'UnexpectedResponseException';
    this.message = msg;
    this.status = status;
  }

  UnexpectedResponseException.prototype = new Error();
  UnexpectedResponseException.constructor = UnexpectedResponseException;

  return UnexpectedResponseException;
}();

/**
 * Error caused during parsing PDF data.
 */
var FormatError = function FormatErrorClosure() {
  function FormatError(msg) {
    this.message = msg;
  }

  FormatError.prototype = new Error();
  FormatError.prototype.name = 'FormatError';
  FormatError.constructor = FormatError;

  return FormatError;
}();

/**
 * Error used to indicate task cancellation.
 */
var AbortException = function AbortExceptionClosure() {
  function AbortException(msg) {
    this.name = 'AbortException';
    this.message = msg;
  }

  AbortException.prototype = new Error();
  AbortException.constructor = AbortException;

  return AbortException;
}();

var NullCharactersRegExp = /\x00/g;

function removeNullCharacters(str) {
  if (typeof str !== 'string') {
    warn('The argument for removeNullCharacters must be a string.');
    return str;
  }
  return str.replace(NullCharactersRegExp, '');
}

function bytesToString(bytes) {
  assert(bytes !== null && (typeof bytes === 'undefined' ? 'undefined' : _typeof(bytes)) === 'object' && bytes.length !== undefined, 'Invalid argument for bytesToString');
  var length = bytes.length;
  var MAX_ARGUMENT_COUNT = 8192;
  if (length < MAX_ARGUMENT_COUNT) {
    return String.fromCharCode.apply(null, bytes);
  }
  var strBuf = [];
  for (var i = 0; i < length; i += MAX_ARGUMENT_COUNT) {
    var chunkEnd = Math.min(i + MAX_ARGUMENT_COUNT, length);
    var chunk = bytes.subarray(i, chunkEnd);
    strBuf.push(String.fromCharCode.apply(null, chunk));
  }
  return strBuf.join('');
}

function stringToBytes(str) {
  assert(typeof str === 'string', 'Invalid argument for stringToBytes');
  var length = str.length;
  var bytes = new Uint8Array(length);
  for (var i = 0; i < length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xFF;
  }
  return bytes;
}

/**
 * Gets length of the array (Array, Uint8Array, or string) in bytes.
 * @param {Array|Uint8Array|string} arr
 * @returns {number}
 */
function arrayByteLength(arr) {
  if (arr.length !== undefined) {
    return arr.length;
  }
  assert(arr.byteLength !== undefined);
  return arr.byteLength;
}

/**
 * Combines array items (arrays) into single Uint8Array object.
 * @param {Array} arr - the array of the arrays (Array, Uint8Array, or string).
 * @returns {Uint8Array}
 */
function arraysToBytes(arr) {
  var length = arr.length;
  // Shortcut: if first and only item is Uint8Array, return it.
  if (length === 1 && arr[0] instanceof Uint8Array) {
    return arr[0];
  }
  var resultLength = 0;
  for (var i = 0; i < length; i++) {
    resultLength += arrayByteLength(arr[i]);
  }
  var pos = 0;
  var data = new Uint8Array(resultLength);
  for (var _i = 0; _i < length; _i++) {
    var item = arr[_i];
    if (!(item instanceof Uint8Array)) {
      if (typeof item === 'string') {
        item = stringToBytes(item);
      } else {
        item = new Uint8Array(item);
      }
    }
    var itemLength = item.byteLength;
    data.set(item, pos);
    pos += itemLength;
  }
  return data;
}

function string32(value) {
  return String.fromCharCode(value >> 24 & 0xff, value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff);
}

// Calculate the base 2 logarithm of the number `x`. This differs from the
// native function in the sense that it returns the ceiling value and that it
// returns 0 instead of `Infinity`/`NaN` for `x` values smaller than/equal to 0.
function log2(x) {
  if (x <= 0) {
    return 0;
  }
  return Math.ceil(Math.log2(x));
}

function readInt8(data, start) {
  return data[start] << 24 >> 24;
}

function readUint16(data, offset) {
  return data[offset] << 8 | data[offset + 1];
}

function readUint32(data, offset) {
  return (data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]) >>> 0;
}

// Lazy test the endianness of the platform
// NOTE: This will be 'true' for simulated TypedArrays
function isLittleEndian() {
  var buffer8 = new Uint8Array(4);
  buffer8[0] = 1;
  var view32 = new Uint32Array(buffer8.buffer, 0, 1);
  return view32[0] === 1;
}

// Checks if it's possible to eval JS expressions.
function isEvalSupported() {
  try {
    new Function(''); // eslint-disable-line no-new, no-new-func
    return true;
  } catch (e) {
    return false;
  }
}

var rgbBuf = ['rgb(', 0, ',', 0, ',', 0, ')'];

var Util = function () {
  function Util() {
    _classCallCheck(this, Util);
  }

  _createClass(Util, null, [{
    key: 'makeCssRgb',

    // makeCssRgb() can be called thousands of times. Using ´rgbBuf` avoids
    // creating many intermediate strings.
    value: function makeCssRgb(r, g, b) {
      rgbBuf[1] = r;
      rgbBuf[3] = g;
      rgbBuf[5] = b;
      return rgbBuf.join('');
    }

    // Concatenates two transformation matrices together and returns the result.

  }, {
    key: 'transform',
    value: function transform(m1, m2) {
      return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
    }

    // For 2d affine transforms

  }, {
    key: 'applyTransform',
    value: function applyTransform(p, m) {
      var xt = p[0] * m[0] + p[1] * m[2] + m[4];
      var yt = p[0] * m[1] + p[1] * m[3] + m[5];
      return [xt, yt];
    }
  }, {
    key: 'applyInverseTransform',
    value: function applyInverseTransform(p, m) {
      var d = m[0] * m[3] - m[1] * m[2];
      var xt = (p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
      var yt = (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[5] * m[0]) / d;
      return [xt, yt];
    }

    // Applies the transform to the rectangle and finds the minimum axially
    // aligned bounding box.

  }, {
    key: 'getAxialAlignedBoundingBox',
    value: function getAxialAlignedBoundingBox(r, m) {
      var p1 = Util.applyTransform(r, m);
      var p2 = Util.applyTransform(r.slice(2, 4), m);
      var p3 = Util.applyTransform([r[0], r[3]], m);
      var p4 = Util.applyTransform([r[2], r[1]], m);
      return [Math.min(p1[0], p2[0], p3[0], p4[0]), Math.min(p1[1], p2[1], p3[1], p4[1]), Math.max(p1[0], p2[0], p3[0], p4[0]), Math.max(p1[1], p2[1], p3[1], p4[1])];
    }
  }, {
    key: 'inverseTransform',
    value: function inverseTransform(m) {
      var d = m[0] * m[3] - m[1] * m[2];
      return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[4] * m[3]) / d, (m[4] * m[1] - m[5] * m[0]) / d];
    }

    // Apply a generic 3d matrix M on a 3-vector v:
    //   | a b c |   | X |
    //   | d e f | x | Y |
    //   | g h i |   | Z |
    // M is assumed to be serialized as [a,b,c,d,e,f,g,h,i],
    // with v as [X,Y,Z]

  }, {
    key: 'apply3dTransform',
    value: function apply3dTransform(m, v) {
      return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
    }

    // This calculation uses Singular Value Decomposition.
    // The SVD can be represented with formula A = USV. We are interested in the
    // matrix S here because it represents the scale values.

  }, {
    key: 'singularValueDecompose2dScale',
    value: function singularValueDecompose2dScale(m) {
      var transpose = [m[0], m[2], m[1], m[3]];

      // Multiply matrix m with its transpose.
      var a = m[0] * transpose[0] + m[1] * transpose[2];
      var b = m[0] * transpose[1] + m[1] * transpose[3];
      var c = m[2] * transpose[0] + m[3] * transpose[2];
      var d = m[2] * transpose[1] + m[3] * transpose[3];

      // Solve the second degree polynomial to get roots.
      var first = (a + d) / 2;
      var second = Math.sqrt((a + d) * (a + d) - 4 * (a * d - c * b)) / 2;
      var sx = first + second || 1;
      var sy = first - second || 1;

      // Scale values are the square roots of the eigenvalues.
      return [Math.sqrt(sx), Math.sqrt(sy)];
    }

    // Normalize rectangle rect=[x1, y1, x2, y2] so that (x1,y1) < (x2,y2)
    // For coordinate systems whose origin lies in the bottom-left, this
    // means normalization to (BL,TR) ordering. For systems with origin in the
    // top-left, this means (TL,BR) ordering.

  }, {
    key: 'normalizeRect',
    value: function normalizeRect(rect) {
      var r = rect.slice(0); // clone rect
      if (rect[0] > rect[2]) {
        r[0] = rect[2];
        r[2] = rect[0];
      }
      if (rect[1] > rect[3]) {
        r[1] = rect[3];
        r[3] = rect[1];
      }
      return r;
    }

    // Returns a rectangle [x1, y1, x2, y2] corresponding to the
    // intersection of rect1 and rect2. If no intersection, returns 'false'
    // The rectangle coordinates of rect1, rect2 should be [x1, y1, x2, y2]

  }, {
    key: 'intersect',
    value: function intersect(rect1, rect2) {
      function compare(a, b) {
        return a - b;
      }

      // Order points along the axes
      var orderedX = [rect1[0], rect1[2], rect2[0], rect2[2]].sort(compare);
      var orderedY = [rect1[1], rect1[3], rect2[1], rect2[3]].sort(compare);
      var result = [];

      rect1 = Util.normalizeRect(rect1);
      rect2 = Util.normalizeRect(rect2);

      // X: first and second points belong to different rectangles?
      if (orderedX[0] === rect1[0] && orderedX[1] === rect2[0] || orderedX[0] === rect2[0] && orderedX[1] === rect1[0]) {
        // Intersection must be between second and third points
        result[0] = orderedX[1];
        result[2] = orderedX[2];
      } else {
        return null;
      }

      // Y: first and second points belong to different rectangles?
      if (orderedY[0] === rect1[1] && orderedY[1] === rect2[1] || orderedY[0] === rect2[1] && orderedY[1] === rect1[1]) {
        // Intersection must be between second and third points
        result[1] = orderedY[1];
        result[3] = orderedY[2];
      } else {
        return null;
      }

      return result;
    }
  }]);

  return Util;
}();

var PDFStringTranslateTable = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2D8, 0x2C7, 0x2C6, 0x2D9, 0x2DD, 0x2DB, 0x2DA, 0x2DC, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x192, 0x2044, 0x2039, 0x203A, 0x2212, 0x2030, 0x201E, 0x201C, 0x201D, 0x2018, 0x2019, 0x201A, 0x2122, 0xFB01, 0xFB02, 0x141, 0x152, 0x160, 0x178, 0x17D, 0x131, 0x142, 0x153, 0x161, 0x17E, 0, 0x20AC];

function stringToPDFString(str) {
  var length = str.length,
      strBuf = [];
  if (str[0] === '\xFE' && str[1] === '\xFF') {
    // UTF16BE BOM
    for (var i = 2; i < length; i += 2) {
      strBuf.push(String.fromCharCode(str.charCodeAt(i) << 8 | str.charCodeAt(i + 1)));
    }
  } else {
    for (var _i2 = 0; _i2 < length; ++_i2) {
      var code = PDFStringTranslateTable[str.charCodeAt(_i2)];
      strBuf.push(code ? String.fromCharCode(code) : str.charAt(_i2));
    }
  }
  return strBuf.join('');
}

function stringToUTF8String(str) {
  return decodeURIComponent(escape(str));
}

function utf8StringToString(str) {
  return unescape(encodeURIComponent(str));
}

function isEmptyObj(obj) {
  for (var key in obj) {
    return false;
  }
  return true;
}

function isBool(v) {
  return typeof v === 'boolean';
}

function isNum(v) {
  return typeof v === 'number';
}

function isString(v) {
  return typeof v === 'string';
}

function isArrayBuffer(v) {
  return (typeof v === 'undefined' ? 'undefined' : _typeof(v)) === 'object' && v !== null && v.byteLength !== undefined;
}

function isArrayEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }
  return arr1.every(function (element, index) {
    return element === arr2[index];
  });
}

// Checks if ch is one of the following characters: SPACE, TAB, CR or LF.
function isSpace(ch) {
  return ch === 0x20 || ch === 0x09 || ch === 0x0D || ch === 0x0A;
}

/**
 * Promise Capability object.
 *
 * @typedef {Object} PromiseCapability
 * @property {Promise} promise - A Promise object.
 * @property {boolean} settled - If the Promise has been fulfilled/rejected.
 * @property {function} resolve - Fulfills the Promise.
 * @property {function} reject - Rejects the Promise.
 */

/**
 * Creates a promise capability object.
 * @alias createPromiseCapability
 *
 * @return {PromiseCapability}
 */
function createPromiseCapability() {
  var capability = Object.create(null);
  var isSettled = false;

  Object.defineProperty(capability, 'settled', {
    get: function get() {
      return isSettled;
    }
  });
  capability.promise = new Promise(function (resolve, reject) {
    capability.resolve = function (data) {
      isSettled = true;
      resolve(data);
    };
    capability.reject = function (reason) {
      isSettled = true;
      reject(reason);
    };
  });
  return capability;
}

var createObjectURL = function createObjectURLClosure() {
  // Blob/createObjectURL is not available, falling back to data schema.
  var digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  return function createObjectURL(data, contentType) {
    var forceDataSchema = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    if (!forceDataSchema && URL.createObjectURL) {
      var blob = new Blob([data], { type: contentType });
      return URL.createObjectURL(blob);
    }

    var buffer = 'data:' + contentType + ';base64,';
    for (var i = 0, ii = data.length; i < ii; i += 3) {
      var b1 = data[i] & 0xFF;
      var b2 = data[i + 1] & 0xFF;
      var b3 = data[i + 2] & 0xFF;
      var d1 = b1 >> 2,
          d2 = (b1 & 3) << 4 | b2 >> 4;
      var d3 = i + 1 < ii ? (b2 & 0xF) << 2 | b3 >> 6 : 64;
      var d4 = i + 2 < ii ? b3 & 0x3F : 64;
      buffer += digits[d1] + digits[d2] + digits[d3] + digits[d4];
    }
    return buffer;
  };
}();

exports.FONT_IDENTITY_MATRIX = FONT_IDENTITY_MATRIX;
exports.IDENTITY_MATRIX = IDENTITY_MATRIX;
exports.OPS = OPS;
exports.VerbosityLevel = VerbosityLevel;
exports.UNSUPPORTED_FEATURES = UNSUPPORTED_FEATURES;
exports.AnnotationBorderStyleType = AnnotationBorderStyleType;
exports.AnnotationFieldFlag = AnnotationFieldFlag;
exports.AnnotationFlag = AnnotationFlag;
exports.AnnotationMarkedState = AnnotationMarkedState;
exports.AnnotationReplyType = AnnotationReplyType;
exports.AnnotationReviewState = AnnotationReviewState;
exports.AnnotationStateModelType = AnnotationStateModelType;
exports.AnnotationType = AnnotationType;
exports.FontType = FontType;
exports.ImageKind = ImageKind;
exports.CMapCompressionType = CMapCompressionType;
exports.AbortException = AbortException;
exports.InvalidPDFException = InvalidPDFException;
exports.MissingPDFException = MissingPDFException;
exports.NativeImageDecoding = NativeImageDecoding;
exports.PasswordException = PasswordException;
exports.PasswordResponses = PasswordResponses;
exports.PermissionFlag = PermissionFlag;
exports.StreamType = StreamType;
exports.TextRenderingMode = TextRenderingMode;
exports.UnexpectedResponseException = UnexpectedResponseException;
exports.UnknownErrorException = UnknownErrorException;
exports.Util = Util;
exports.FormatError = FormatError;
exports.arrayByteLength = arrayByteLength;
exports.arraysToBytes = arraysToBytes;
exports.assert = assert;
exports.bytesToString = bytesToString;
exports.createPromiseCapability = createPromiseCapability;
exports.createObjectURL = createObjectURL;
exports.getVerbosityLevel = getVerbosityLevel;
exports.info = info;
exports.isArrayBuffer = isArrayBuffer;
exports.isArrayEqual = isArrayEqual;
exports.isBool = isBool;
exports.isEmptyObj = isEmptyObj;
exports.isNum = isNum;
exports.isString = isString;
exports.isSpace = isSpace;
exports.isSameOrigin = isSameOrigin;
exports.createValidAbsoluteUrl = createValidAbsoluteUrl;
exports.isLittleEndian = isLittleEndian;
exports.isEvalSupported = isEvalSupported;
exports.log2 = log2;
exports.readInt8 = readInt8;
exports.readUint16 = readUint16;
exports.readUint32 = readUint32;
exports.removeNullCharacters = removeNullCharacters;
exports.ReadableStream = ReadableStream;
exports.URL = URL;
exports.setVerbosityLevel = setVerbosityLevel;
exports.shadow = shadow;
exports.string32 = string32;
exports.stringToBytes = stringToBytes;
exports.stringToPDFString = stringToPDFString;
exports.stringToUTF8String = stringToUTF8String;
exports.utf8StringToString = utf8StringToString;
exports.warn = warn;
exports.unreachable = unreachable;

/***/ }),
/* 45 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint no-var: error */

// Table C-2
var QeTable = [{ qe: 0x5601, nmps: 1, nlps: 1, switchFlag: 1 }, { qe: 0x3401, nmps: 2, nlps: 6, switchFlag: 0 }, { qe: 0x1801, nmps: 3, nlps: 9, switchFlag: 0 }, { qe: 0x0AC1, nmps: 4, nlps: 12, switchFlag: 0 }, { qe: 0x0521, nmps: 5, nlps: 29, switchFlag: 0 }, { qe: 0x0221, nmps: 38, nlps: 33, switchFlag: 0 }, { qe: 0x5601, nmps: 7, nlps: 6, switchFlag: 1 }, { qe: 0x5401, nmps: 8, nlps: 14, switchFlag: 0 }, { qe: 0x4801, nmps: 9, nlps: 14, switchFlag: 0 }, { qe: 0x3801, nmps: 10, nlps: 14, switchFlag: 0 }, { qe: 0x3001, nmps: 11, nlps: 17, switchFlag: 0 }, { qe: 0x2401, nmps: 12, nlps: 18, switchFlag: 0 }, { qe: 0x1C01, nmps: 13, nlps: 20, switchFlag: 0 }, { qe: 0x1601, nmps: 29, nlps: 21, switchFlag: 0 }, { qe: 0x5601, nmps: 15, nlps: 14, switchFlag: 1 }, { qe: 0x5401, nmps: 16, nlps: 14, switchFlag: 0 }, { qe: 0x5101, nmps: 17, nlps: 15, switchFlag: 0 }, { qe: 0x4801, nmps: 18, nlps: 16, switchFlag: 0 }, { qe: 0x3801, nmps: 19, nlps: 17, switchFlag: 0 }, { qe: 0x3401, nmps: 20, nlps: 18, switchFlag: 0 }, { qe: 0x3001, nmps: 21, nlps: 19, switchFlag: 0 }, { qe: 0x2801, nmps: 22, nlps: 19, switchFlag: 0 }, { qe: 0x2401, nmps: 23, nlps: 20, switchFlag: 0 }, { qe: 0x2201, nmps: 24, nlps: 21, switchFlag: 0 }, { qe: 0x1C01, nmps: 25, nlps: 22, switchFlag: 0 }, { qe: 0x1801, nmps: 26, nlps: 23, switchFlag: 0 }, { qe: 0x1601, nmps: 27, nlps: 24, switchFlag: 0 }, { qe: 0x1401, nmps: 28, nlps: 25, switchFlag: 0 }, { qe: 0x1201, nmps: 29, nlps: 26, switchFlag: 0 }, { qe: 0x1101, nmps: 30, nlps: 27, switchFlag: 0 }, { qe: 0x0AC1, nmps: 31, nlps: 28, switchFlag: 0 }, { qe: 0x09C1, nmps: 32, nlps: 29, switchFlag: 0 }, { qe: 0x08A1, nmps: 33, nlps: 30, switchFlag: 0 }, { qe: 0x0521, nmps: 34, nlps: 31, switchFlag: 0 }, { qe: 0x0441, nmps: 35, nlps: 32, switchFlag: 0 }, { qe: 0x02A1, nmps: 36, nlps: 33, switchFlag: 0 }, { qe: 0x0221, nmps: 37, nlps: 34, switchFlag: 0 }, { qe: 0x0141, nmps: 38, nlps: 35, switchFlag: 0 }, { qe: 0x0111, nmps: 39, nlps: 36, switchFlag: 0 }, { qe: 0x0085, nmps: 40, nlps: 37, switchFlag: 0 }, { qe: 0x0049, nmps: 41, nlps: 38, switchFlag: 0 }, { qe: 0x0025, nmps: 42, nlps: 39, switchFlag: 0 }, { qe: 0x0015, nmps: 43, nlps: 40, switchFlag: 0 }, { qe: 0x0009, nmps: 44, nlps: 41, switchFlag: 0 }, { qe: 0x0005, nmps: 45, nlps: 42, switchFlag: 0 }, { qe: 0x0001, nmps: 45, nlps: 43, switchFlag: 0 }, { qe: 0x5601, nmps: 46, nlps: 46, switchFlag: 0 }];

/**
 * This class implements the QM Coder decoding as defined in
 *   JPEG 2000 Part I Final Committee Draft Version 1.0
 *   Annex C.3 Arithmetic decoding procedure
 * available at http://www.jpeg.org/public/fcd15444-1.pdf
 *
 * The arithmetic decoder is used in conjunction with context models to decode
 * JPEG2000 and JBIG2 streams.
 */

var ArithmeticDecoder = function () {
  // C.3.5 Initialisation of the decoder (INITDEC)
  function ArithmeticDecoder(data, start, end) {
    _classCallCheck(this, ArithmeticDecoder);

    this.data = data;
    this.bp = start;
    this.dataEnd = end;

    this.chigh = data[start];
    this.clow = 0;

    this.byteIn();

    this.chigh = this.chigh << 7 & 0xFFFF | this.clow >> 9 & 0x7F;
    this.clow = this.clow << 7 & 0xFFFF;
    this.ct -= 7;
    this.a = 0x8000;
  }

  // C.3.4 Compressed data input (BYTEIN)


  _createClass(ArithmeticDecoder, [{
    key: "byteIn",
    value: function byteIn() {
      var data = this.data;
      var bp = this.bp;

      if (data[bp] === 0xFF) {
        if (data[bp + 1] > 0x8F) {
          this.clow += 0xFF00;
          this.ct = 8;
        } else {
          bp++;
          this.clow += data[bp] << 9;
          this.ct = 7;
          this.bp = bp;
        }
      } else {
        bp++;
        this.clow += bp < this.dataEnd ? data[bp] << 8 : 0xFF00;
        this.ct = 8;
        this.bp = bp;
      }
      if (this.clow > 0xFFFF) {
        this.chigh += this.clow >> 16;
        this.clow &= 0xFFFF;
      }
    }

    // C.3.2 Decoding a decision (DECODE)

  }, {
    key: "readBit",
    value: function readBit(contexts, pos) {
      // Contexts are packed into 1 byte:
      // highest 7 bits carry cx.index, lowest bit carries cx.mps
      var cx_index = contexts[pos] >> 1,
          cx_mps = contexts[pos] & 1;
      var qeTableIcx = QeTable[cx_index];
      var qeIcx = qeTableIcx.qe;
      var d = void 0;
      var a = this.a - qeIcx;

      if (this.chigh < qeIcx) {
        // exchangeLps
        if (a < qeIcx) {
          a = qeIcx;
          d = cx_mps;
          cx_index = qeTableIcx.nmps;
        } else {
          a = qeIcx;
          d = 1 ^ cx_mps;
          if (qeTableIcx.switchFlag === 1) {
            cx_mps = d;
          }
          cx_index = qeTableIcx.nlps;
        }
      } else {
        this.chigh -= qeIcx;
        if ((a & 0x8000) !== 0) {
          this.a = a;
          return cx_mps;
        }
        // exchangeMps
        if (a < qeIcx) {
          d = 1 ^ cx_mps;
          if (qeTableIcx.switchFlag === 1) {
            cx_mps = d;
          }
          cx_index = qeTableIcx.nlps;
        } else {
          d = cx_mps;
          cx_index = qeTableIcx.nmps;
        }
      }
      // C.3.3 renormD;
      do {
        if (this.ct === 0) {
          this.byteIn();
        }

        a <<= 1;
        this.chigh = this.chigh << 1 & 0xFFFF | this.clow >> 15 & 1;
        this.clow = this.clow << 1 & 0xFFFF;
        this.ct--;
      } while ((a & 0x8000) === 0);
      this.a = a;

      contexts[pos] = cx_index << 1 | cx_mps;
      return d;
    }
  }]);

  return ArithmeticDecoder;
}();

exports.ArithmeticDecoder = ArithmeticDecoder;

/***/ }),
/* 46 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = PdfjsJpxPixelsDecoder;

var PdfjsJpxContextPool = __webpack_require__(3);

function PdfjsJpxPixelsDecoder() {
    this._contextPool = new PdfjsJpxContextPool();
}

PdfjsJpxPixelsDecoder.prototype.start = function start(data) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var image = self._contextPool.image;
        var currentContext = self._contextPool.getContext(data.headersCodestream);

        var regionToParse = {
            left: data.offsetInRegion.offsetX,
            top: data.offsetInRegion.offsetY,
            right: data.offsetInRegion.offsetX + data.offsetInRegion.width,
            bottom: data.offsetInRegion.offsetY + data.offsetInRegion.height
        };

        var imageTilesX = data.imageTilesX;
        var boundsTilesX = data.tilesBounds.maxTileXExclusive - data.tilesBounds.minTileX;
        var minTileX = data.tilesBounds.minTileX;
        var minTileY = data.tilesBounds.minTileY;

        for (var i = 0; i < data.precinctCoefficients.length; ++i) {
            var coeffs = data.precinctCoefficients[i];

            var imageTileIndex = coeffs.key.tileIndex;
            var imageTileX = imageTileIndex % imageTilesX;
            var imageTileY = Math.floor(imageTileIndex / imageTilesX);
            var inBoundsTileX = imageTileX - minTileX;
            var inBoundsTileY = imageTileY - minTileY;
            var inBoundsTileIndex = inBoundsTileX + inBoundsTileY * boundsTilesX;

            image.setPrecinctCoefficients(currentContext, coeffs.coefficients, inBoundsTileIndex, coeffs.key.component, coeffs.key.resolutionLevel, coeffs.key.precinctIndexInComponentResolution);
        }

        image.decode(currentContext, { regionToParse: regionToParse });

        var result = self._copyTilesPixelsToOnePixelsArray(image.tiles, regionToParse, image.componentsCount);
        resolve(result);
    });
};

PdfjsJpxPixelsDecoder.prototype._copyTilesPixelsToOnePixelsArray = function copyTilesPixelsToOnePixelsArray(tiles, resultRegion, componentsCount) {

    var firstTile = tiles[0];
    var width = resultRegion.right - resultRegion.left;
    var height = resultRegion.bottom - resultRegion.top;

    //if (firstTile.left === resultRegion.left &&
    //    firstTile.top === resultRegion.top &&
    //    firstTile.width === width &&
    //    firstTile.height === height &&
    //    componentsCount === 4) {
    //    
    //    return firstTile;
    //}

    var result = new ImageData(width, height);

    var bytesPerPixel = 4;
    var rgbaImageStride = width * bytesPerPixel;

    var tileIndex = 0;

    //for (var x = 0; x < numTilesX; ++x) {

    for (var i = 0; i < tiles.length; ++i) {
        var tileRight = tiles[i].left + tiles[i].width;
        var tileBottom = tiles[i].top + tiles[i].height;

        var intersectionLeft = Math.max(resultRegion.left, tiles[i].left);
        var intersectionTop = Math.max(resultRegion.top, tiles[i].top);
        var intersectionRight = Math.min(resultRegion.right, tileRight);
        var intersectionBottom = Math.min(resultRegion.bottom, tileBottom);

        var intersectionWidth = intersectionRight - intersectionLeft;
        var intersectionHeight = intersectionBottom - intersectionTop;

        if (intersectionLeft !== tiles[i].left || intersectionTop !== tiles[i].top || intersectionWidth !== tiles[i].width || intersectionHeight !== tiles[i].height) {

            throw 'Unsupported tiles to copy';
        }

        var tileOffsetXPixels = intersectionLeft - resultRegion.left;
        var tileOffsetYPixels = intersectionTop - resultRegion.top;

        var tileOffsetBytes = tileOffsetXPixels * bytesPerPixel + tileOffsetYPixels * rgbaImageStride;

        this._copyTile(result.data, tiles[i], tileOffsetBytes, rgbaImageStride, componentsCount);
    }

    return result;
};

PdfjsJpxPixelsDecoder.prototype._copyTile = function copyTile(targetImage, tile, targetImageStartOffset, targetImageStride, componentsCount) {

    var rOffset = 0;
    var gOffset = 1;
    var bOffset = 2;
    var pixelsOffset = 1;

    var pixels = tile.pixels || tile.items;

    if (componentsCount === undefined) {
        componentsCount = pixels.length / (tile.width * tile.height);
    }

    switch (componentsCount) {
        case 1:
            gOffset = 0;
            bOffset = 0;
            break;

        case 3:
            pixelsOffset = 3;
            break;

        case 4:
            pixelsOffset = 4;
            break;

        default:
            throw 'Unsupported components count ' + componentsCount;
    }

    var targetImageIndex = targetImageStartOffset;
    var pixel = 0;
    for (var y = 0; y < tile.height; ++y) {
        var targetImageStartLine = targetImageIndex;

        for (var x = 0; x < tile.width; ++x) {
            targetImage[targetImageIndex + 0] = pixels[pixel + rOffset];
            targetImage[targetImageIndex + 1] = pixels[pixel + gOffset];
            targetImage[targetImageIndex + 2] = pixels[pixel + bOffset];
            targetImage[targetImageIndex + 3] = 255;

            pixel += pixelsOffset;
            targetImageIndex += 4;
        }

        targetImageIndex = targetImageStartLine + targetImageStride;
    }
};

/***/ }),
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = PdfjsJpxCoefficientsDecoder;

var PdfjsJpxContextPool = __webpack_require__(3);

function PdfjsJpxCoefficientsDecoder() {
    this._contextPool = new PdfjsJpxContextPool();
}

PdfjsJpxCoefficientsDecoder.prototype.start = function start(data, key) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var image = self._contextPool.image;
        var currentContext = self._contextPool.getContext(data.headersCodestream);
        if (data.codeblocksData) {
            image.addPacketsData(currentContext, data.codeblocksData);
        }
        if (data.precinctCoefficients) {
            // NOTE: Apparently dead code that can be removed
            for (var j = 0; j < data.precinctCoefficients.length; ++j) {
                var precinct = data.precinctCoefficients[j];
                image.setPrecinctCoefficients(currentContext, precinct.coefficients, precinct.tileIndex, precinct.c, precinct.r, precinct.p);
            }
        }

        var coefficients = image.decodePrecinctCoefficients(currentContext,
        /*tileIndex=*/0, key.component, key.resolutionLevel, key.precinctIndexInComponentResolution);

        resolve({
            key: key,
            coefficients: coefficients,
            minQuality: data.minQuality
        });
    });
};

/***/ })
/******/ ]);