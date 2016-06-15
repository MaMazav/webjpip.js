/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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

'use strict';

/* This class implements the QM Coder decoding as defined in
 *   JPEG 2000 Part I Final Committee Draft Version 1.0
 *   Annex C.3 Arithmetic decoding procedure 
 * available at http://www.jpeg.org/public/fcd15444-1.pdf
 * 
 * The arithmetic decoder is used in conjunction with context models to decode
 * JPEG2000 and JBIG2 streams.
 */
var ArithmeticDecoder = (function ArithmeticDecoderClosure() {
  // Table C-2
  var QeTable = [
    {qe: 0x5601, nmps: 1, nlps: 1, switchFlag: 1},
    {qe: 0x3401, nmps: 2, nlps: 6, switchFlag: 0},
    {qe: 0x1801, nmps: 3, nlps: 9, switchFlag: 0},
    {qe: 0x0AC1, nmps: 4, nlps: 12, switchFlag: 0},
    {qe: 0x0521, nmps: 5, nlps: 29, switchFlag: 0},
    {qe: 0x0221, nmps: 38, nlps: 33, switchFlag: 0},
    {qe: 0x5601, nmps: 7, nlps: 6, switchFlag: 1},
    {qe: 0x5401, nmps: 8, nlps: 14, switchFlag: 0},
    {qe: 0x4801, nmps: 9, nlps: 14, switchFlag: 0},
    {qe: 0x3801, nmps: 10, nlps: 14, switchFlag: 0},
    {qe: 0x3001, nmps: 11, nlps: 17, switchFlag: 0},
    {qe: 0x2401, nmps: 12, nlps: 18, switchFlag: 0},
    {qe: 0x1C01, nmps: 13, nlps: 20, switchFlag: 0},
    {qe: 0x1601, nmps: 29, nlps: 21, switchFlag: 0},
    {qe: 0x5601, nmps: 15, nlps: 14, switchFlag: 1},
    {qe: 0x5401, nmps: 16, nlps: 14, switchFlag: 0},
    {qe: 0x5101, nmps: 17, nlps: 15, switchFlag: 0},
    {qe: 0x4801, nmps: 18, nlps: 16, switchFlag: 0},
    {qe: 0x3801, nmps: 19, nlps: 17, switchFlag: 0},
    {qe: 0x3401, nmps: 20, nlps: 18, switchFlag: 0},
    {qe: 0x3001, nmps: 21, nlps: 19, switchFlag: 0},
    {qe: 0x2801, nmps: 22, nlps: 19, switchFlag: 0},
    {qe: 0x2401, nmps: 23, nlps: 20, switchFlag: 0},
    {qe: 0x2201, nmps: 24, nlps: 21, switchFlag: 0},
    {qe: 0x1C01, nmps: 25, nlps: 22, switchFlag: 0},
    {qe: 0x1801, nmps: 26, nlps: 23, switchFlag: 0},
    {qe: 0x1601, nmps: 27, nlps: 24, switchFlag: 0},
    {qe: 0x1401, nmps: 28, nlps: 25, switchFlag: 0},
    {qe: 0x1201, nmps: 29, nlps: 26, switchFlag: 0},
    {qe: 0x1101, nmps: 30, nlps: 27, switchFlag: 0},
    {qe: 0x0AC1, nmps: 31, nlps: 28, switchFlag: 0},
    {qe: 0x09C1, nmps: 32, nlps: 29, switchFlag: 0},
    {qe: 0x08A1, nmps: 33, nlps: 30, switchFlag: 0},
    {qe: 0x0521, nmps: 34, nlps: 31, switchFlag: 0},
    {qe: 0x0441, nmps: 35, nlps: 32, switchFlag: 0},
    {qe: 0x02A1, nmps: 36, nlps: 33, switchFlag: 0},
    {qe: 0x0221, nmps: 37, nlps: 34, switchFlag: 0},
    {qe: 0x0141, nmps: 38, nlps: 35, switchFlag: 0},
    {qe: 0x0111, nmps: 39, nlps: 36, switchFlag: 0},
    {qe: 0x0085, nmps: 40, nlps: 37, switchFlag: 0},
    {qe: 0x0049, nmps: 41, nlps: 38, switchFlag: 0},
    {qe: 0x0025, nmps: 42, nlps: 39, switchFlag: 0},
    {qe: 0x0015, nmps: 43, nlps: 40, switchFlag: 0},
    {qe: 0x0009, nmps: 44, nlps: 41, switchFlag: 0},
    {qe: 0x0005, nmps: 45, nlps: 42, switchFlag: 0},
    {qe: 0x0001, nmps: 45, nlps: 43, switchFlag: 0},
    {qe: 0x5601, nmps: 46, nlps: 46, switchFlag: 0}
  ];

  // C.3.5 Initialisation of the decoder (INITDEC)
  function ArithmeticDecoder(data, start, end) {
    this.data = data;
    this.bp = start;
    this.dataEnd = end;

    this.chigh = data[start];
    this.clow = 0;

    this.byteIn();

    this.chigh = ((this.chigh << 7) & 0xFFFF) | ((this.clow >> 9) & 0x7F);
    this.clow = (this.clow << 7) & 0xFFFF;
    this.ct -= 7;
    this.a = 0x8000;
  }

  ArithmeticDecoder.prototype = {
    // C.3.4 Compressed data input (BYTEIN)
    byteIn: function ArithmeticDecoder_byteIn() {
      var data = this.data;
      var bp = this.bp;
      if (data[bp] === 0xFF) {
        var b1 = data[bp + 1];
        if (b1 > 0x8F) {
          this.clow += 0xFF00;
          this.ct = 8;
        } else {
          bp++;
          this.clow += (data[bp] << 9);
          this.ct = 7;
          this.bp = bp;
        }
      } else {
        bp++;
        this.clow += bp < this.dataEnd ? (data[bp] << 8) : 0xFF00;
        this.ct = 8;
        this.bp = bp;
      }
      if (this.clow > 0xFFFF) {
        this.chigh += (this.clow >> 16);
        this.clow &= 0xFFFF;
      }
    },
    // C.3.2 Decoding a decision (DECODE)
    readBit: function ArithmeticDecoder_readBit(contexts, pos) {
      // contexts are packed into 1 byte:
      // highest 7 bits carry cx.index, lowest bit carries cx.mps
      var cx_index = contexts[pos] >> 1, cx_mps = contexts[pos] & 1;
      var qeTableIcx = QeTable[cx_index];
      var qeIcx = qeTableIcx.qe;
      var d;
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
        this.chigh = ((this.chigh << 1) & 0xFFFF) | ((this.clow >> 15) & 1);
        this.clow = (this.clow << 1) & 0xFFFF;
        this.ct--;
      } while ((a & 0x8000) === 0);
      this.a = a;

      contexts[pos] = cx_index << 1 | cx_mps;
      return d;
    }
  };

  return ArithmeticDecoder;
})();

'use strict';

function AsyncJpxImage() {
}

AsyncJpxImage.prototype = Object.create(JpxImage.prototype);

AsyncJpxImage.prototype.parseCodestreamAsync = function parseCodestreamAsync(
	callback, data, start, end, options) {
	
	this._currentContext = this.parseCodestream(data, start, end, options);
	
	if (options !== undefined && options.isOnlyParseHeaders) {
		callback(null);
		return;
	}
	
	this._getPixels(callback, options);
};

AsyncJpxImage.prototype.addPacketsDataToCurrentContext =
	function addPacketsDataToCurrentContext(packetsData) {
	
	this.addPacketsData(this._currentContext, packetsData);
};

AsyncJpxImage.prototype.decodeCurrentContextAsync =
	function decodeCurrentContextAsync(callback, options) {
	
	this.decode(this._currentContext, options);
	this._getPixels(callback, options);
};

AsyncJpxImage.prototype._getPixels = function getPixels(callback, options) {
	var region;
	if (options !== undefined && options.regionToParse !== undefined) {
		region = options.regionToParse;
	} else {
		region = {
			left : 0,
			top : 0,
			right : this.width,
			bottom : this.height
		};
	}
	
	var result = copyTilesPixelsToOnePixelsArray(this.tiles, region, this.componentsCount);
	callback(result);
};
/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals ArithmeticDecoder, globalScope, log2, readUint16, readUint32,
           info, warn */

'use strict';

var JpxImage = (function JpxImageClosure() {
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

      var head = readUint16(data, 0);
      // No box header, immediate start of codestream (SOC)
      if (head === 0xFF4F) {
        this.parseCodestream(data, 0, data.length);
        return;
      }

      var position = 0, length = data.length;
      while (position < length) {
        var headerSize = 8;
        var lbox = readUint32(data, position);
        var tbox = readUint32(data, position + 4);
        position += headerSize;
        if (lbox === 1) {
          // XLBox: read UInt64 according to spec.
          // JavaScript's int precision of 53 bit should be sufficient here.
          lbox = readUint32(data, position) * 4294967296 +
                 readUint32(data, position + 4);
          position += 8;
          headerSize += 8;
        }
        if (lbox === 0) {
          lbox = length - position + headerSize;
        }
        if (lbox < headerSize) {
          throw new Error('JPX Error: Invalid box field size');
        }
        var dataLength = lbox - headerSize;
        var jumpDataLength = true;
        switch (tbox) {
          case 0x6A703268: // 'jp2h'
            jumpDataLength = false; // parsing child boxes
            break;
          case 0x636F6C72: // 'colr'
            // Colorspaces are not used, the CS from the PDF is used.
            var method = data[position];
            var precedence = data[position + 1];
            var approximation = data[position + 2];
            if (method === 1) {
              // enumerated colorspace
              var colorspace = readUint32(data, position + 3);
              switch (colorspace) {
                case 16: // this indicates a sRGB colorspace
                case 17: // this indicates a grayscale colorspace
                case 18: // this indicates a YUV colorspace
                  break;
                default:
                  warn('Unknown colorspace ' + colorspace);
                  break;
              }
            } else if (method === 2) {
              info('ICC profile not supported');
            }
            break;
          case 0x6A703263: // 'jp2c'
            this.parseCodestream(data, position, position + dataLength);
            break;
          case 0x6A502020: // 'jP\024\024'
            if (0x0d0a870a !== readUint32(data, position)) {
              warn('Invalid JP2 signature');
            }
            break;
          // The following header types are valid but currently not used:
          case 0x6A501A1A: // 'jP\032\032'
          case 0x66747970: // 'ftyp'
          case 0x72726571: // 'rreq'
          case 0x72657320: // 'res '
          case 0x69686472: // 'ihdr'
            break;
          default:
            var headerType = String.fromCharCode((tbox >> 24) & 0xFF,
                                                 (tbox >> 16) & 0xFF,
                                                 (tbox >> 8) & 0xFF,
                                                 tbox & 0xFF);
            warn('Unsupported header type ' + tbox + ' (' + headerType + ')');
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
        var code = (oldByte << 8) | newByte;
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
          // Results are always returned as Uint8Arrays
          this.bitsPerComponent = 8;
          return;
        }
      }
      throw new Error('JPX Error: No size marker found in JPX stream');
    },
    parseCodestream: function JpxImage_parseCodestream(
      data, start, end, options) {
      var context = {};
      options = options || {};
      var isOnlyParseHeaders = !!options.isOnlyParseHeaders;
      var regionToParse = options.regionToParse;
      if (regionToParse !== undefined && isOnlyParseHeaders) {
        throw 'JPX Error: options.regionToParse is uneffective if ' +
          'options.isOnlyParseHeaders = true';
      }
      
      try {
        var doNotRecover = false;
        var position = start;
        while (position + 1 < end) {
          var code = readUint16(data, position);
          position += 2;

          var length = 0, j, sqcd, spqcds, spqcdSize, scalarExpounded, tile;
          switch (code) {
            case 0xFF4F: // Start of codestream (SOC)
              context.mainHeader = true;
              break;
            case 0xFFD9: // End of codestream (EOC)
              break;
            case 0xFF51: // Image and tile size (SIZ)
              length = readUint16(data, position);
              var siz = {};
              siz.Xsiz = readUint32(data, position + 4);
              siz.Ysiz = readUint32(data, position + 8);
              siz.XOsiz = readUint32(data, position + 12);
              siz.YOsiz = readUint32(data, position + 16);
              siz.XTsiz = readUint32(data, position + 20);
              siz.YTsiz = readUint32(data, position + 24);
              siz.XTOsiz = readUint32(data, position + 28);
              siz.YTOsiz = readUint32(data, position + 32);
              var componentsCount = readUint16(data, position + 36);
              siz.Csiz = componentsCount;
              var components = [];
              var isComponentSizesSupported = true;
              j = position + 38;
              for (var i = 0; i < componentsCount; i++) {
                var component = {
                  precision: (data[j] & 0x7F) + 1,
                  isSigned: !!(data[j] & 0x80),
                  XRsiz: data[j + 1],
                  YRsiz: data[j + 1]
                };
                calculateComponentDimensions(component, siz);
                components.push(component);
                
                if (regionToParse !== undefined) {
                  isComponentSizesSupported &=
                    component.XRsiz === 1 && component.YRsiz === 1;
                }
              }
              context.SIZ = siz;
              context.components = components;
              calculateTileGrids(context, components);
              context.QCC = [];
              context.COC = [];
              
              if (!isComponentSizesSupported) {
                throw new Error('JPX Error: When regionToParse is used, ' +
                  'component size other than 1 is not supported');
              }
              break;
            case 0xFF55: // Tile-part lengths, main header (TLM)
              var Ltlm = readUint16(data, position); // Marker segment length
              // Skip tile length markers
              position += Ltlm;
              break;
            case 0xFF58: // Packet lengths, tile header (PLT): MAMAZAV
              var Lplt = readUint16(data, position); // Marker segment length
              // Skip tile length markers
              position += Lplt;
              break;
            case 0xFF5C: // Quantization default (QCD)
              length = readUint16(data, position);
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
                  throw new Error('JPX Error: Invalid SQcd value ' + sqcd);
              }
              qcd.noQuantization = (spqcdSize === 8);
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
                  spqcd.mu = ((data[j] & 0x7) << 8) | data[j + 1];
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
            case 0xFF5D: // Quantization component (QCC)
              length = readUint16(data, position);
              var qcc = {};
              j = position + 2;
              var cqcc;
              if (context.SIZ.Csiz < 257) {
                cqcc = data[j++];
              } else {
                cqcc = readUint16(data, j);
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
                  throw new Error('JPX Error: Invalid SQcd value ' + sqcd);
              }
              qcc.noQuantization = (spqcdSize === 8);
              qcc.scalarExpounded = scalarExpounded;
              qcc.guardBits = sqcd >> 5;
              spqcds = [];
              while (j < (length + position)) {
                spqcd = {};
                if (spqcdSize === 8) {
                  spqcd.epsilon = data[j++] >> 3;
                  spqcd.mu = 0;
                } else {
                  spqcd.epsilon = data[j] >> 3;
                  spqcd.mu = ((data[j] & 0x7) << 8) | data[j + 1];
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
            case 0xFF52: // Coding style default (COD)
              length = readUint16(data, position);
              var cod = {};
              j = position + 2;
              var scod = data[j++];
              cod.entropyCoderWithCustomPrecincts = !!(scod & 1);
              cod.sopMarkerUsed = !!(scod & 2);
              cod.ephMarkerUsed = !!(scod & 4);
              cod.progressionOrder = data[j++];
              cod.layersCount = readUint16(data, j);
              j += 2;
              cod.multipleComponentTransform = data[j++];

              cod.decompositionLevelsCount = data[j++];
              cod.xcb = (data[j++] & 0xF) + 2;
              cod.ycb = (data[j++] & 0xF) + 2;
              var blockStyle = data[j++];
              cod.selectiveArithmeticCodingBypass = !!(blockStyle & 1);
              cod.resetContextProbabilities = !!(blockStyle & 2);
              cod.terminationOnEachCodingPass = !!(blockStyle & 4);
              cod.verticalyStripe = !!(blockStyle & 8);
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
              if (cod.verticalyStripe) {
                unsupported.push('verticalyStripe');
              }
              if (cod.predictableTermination) {
                unsupported.push('predictableTermination');
              }
              if (unsupported.length > 0) {
                doNotRecover = true;
                throw new Error('JPX Error: Unsupported COD options (' +
                                unsupported.join(', ') + ')');
              }
              if (context.mainHeader) {
                context.COD = cod;
              } else {
                context.currentTile.COD = cod;
                context.currentTile.COC = [];
              }
              break;
            case 0xFF90: // Start of tile-part (SOT)
              length = readUint16(data, position);
              tile = {};
              tile.index = readUint16(data, position + 2);
              tile.length = readUint32(data, position + 4);
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
            case 0xFF93: // Start of data (SOD)
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
            case 0xFF64: // Comment (COM)
              length = readUint16(data, position);
              // skipping content
              break;
            case 0xFF53: // Coding style component (COC)
              throw new Error('JPX Error: Codestream code 0xFF53 (COC) is ' +
                              'not implemented');
            default:
              throw new Error('JPX Error: Unknown codestream code: ' +
                              code.toString(16));
          }
          position += length;
        }
      } catch (e) {
        if (doNotRecover || this.failOnCorruptedImage) {
          throw e;
        } else {
          warn('Trying to recover from ' + e.message);
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
    addPacketsData: function JpxImage_addPacketData(context, packetsData) {
      for (var j = 0; j < packetsData.packetDataOffsets.length; ++j) {
        var packetOffsets = packetsData.packetDataOffsets[j];
        var tile = context.tiles[packetOffsets.tileIndex];
        var component = tile.components[packetOffsets.c];
        var resolution = component.resolutions[packetOffsets.r];
        var p = packetOffsets.p;
        var l = packetOffsets.l;
        var packet = createPacket(resolution, p, l);
        for (var i = 0; i < packetOffsets.codeblockOffsets.length; ++i) {
          var codeblockOffsets = packetOffsets.codeblockOffsets[i];
          var isNoData = codeblockOffsets.start === codeblockOffsets.end;
          if (isNoData) {
            continue;
          }
          var codeblock = packet.codeblocks[i];
          if (codeblock['data'] === undefined) {
            codeblock.data = [];
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
    decode: function JpxImage_decode(context, options) {
      if (options !== undefined && options.regionToParse !== undefined) {
        var region = options.regionToParse;
        if (region.top === undefined ||
            region.left === undefined ||
            region.right === undefined ||
            region.bottom === undefined) {
          throw new Error('JPX Error: Either left, top, right or ' +
            'bottom are undefined in regionToParse');
        }
        context.regionToParse = region;
      }
      this.tiles = transformComponents(context);
      context.regionToParse = undefined;
    }
  };
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
    var tile, tiles = [];
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
    result.xcb_ = (r > 0 ? Math.min(codOrCoc.xcb, result.PPx - 1) :
                   Math.min(codOrCoc.xcb, result.PPx));
    result.ycb_ = (r > 0 ? Math.min(codOrCoc.ycb, result.PPy - 1) :
                   Math.min(codOrCoc.ycb, result.PPy));
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
    var precinctWidthInSubband = 1 << (dimensions.PPx + (isZeroRes ? 0 : -1));
    var precinctHeightInSubband = 1 << (dimensions.PPy + (isZeroRes ? 0 : -1));
    var numprecinctswide = (resolution.trx1 > resolution.trx0 ?
      Math.ceil(resolution.trx1 / precinctWidth) -
      Math.floor(resolution.trx0 / precinctWidth) : 0);
    var numprecinctshigh = (resolution.try1 > resolution.try0 ?
      Math.ceil(resolution.try1 / precinctHeight) -
      Math.floor(resolution.try0 / precinctHeight) : 0);
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
  function buildCodeblocks(context, subband, dimensions) {
    // Section B.7 Division sub-band into code-blocks
    var xcb_ = dimensions.xcb_;
    var ycb_ = dimensions.ycb_;
    var codeblockWidth = 1 << xcb_;
    var codeblockHeight = 1 << ycb_;
    var cbx0 = subband.tbx0 >> xcb_;
    var cby0 = subband.tby0 >> ycb_;
    var cbx1 = (subband.tbx1 + codeblockWidth - 1) >> xcb_;
    var cby1 = (subband.tby1 + codeblockHeight - 1) >> ycb_;
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
          tby1: codeblockHeight * (j + 1)
        };

        codeblock.tbx0_ = Math.max(subband.tbx0, codeblock.tbx0);
        codeblock.tby0_ = Math.max(subband.tby0, codeblock.tby0);
        codeblock.tbx1_ = Math.min(subband.tbx1, codeblock.tbx1);
        codeblock.tby1_ = Math.min(subband.tby1, codeblock.tby1);

        // Calculate precinct number for this codeblock, codeblock position
        // should be relative to its subband, use actual dimension and position
        // See comment about codeblock group width and height
        var pi = Math.floor((codeblock.tbx0_ - subband.tbx0) /
          precinctParameters.precinctWidthInSubband);
        var pj = Math.floor((codeblock.tby0_ - subband.tby0) /
          precinctParameters.precinctHeightInSubband);
        precinctNumber = pi + (pj * precinctParameters.numprecinctswide);

        codeblock.precinctNumber = precinctNumber;
        codeblock.subbandType = subband.type;
        codeblock.Lblock = 3;

        if (codeblock.tbx1_ <= codeblock.tbx0_ ||
            codeblock.tby1_ <= codeblock.tby0_) {
          continue;
        }
        codeblocks.push(codeblock);
        // building precinct for the sub-band
        var precinct = precincts[precinctNumber];
        if (precinct !== undefined) {
          if (i < precinct.cbxMin) {
            precinct.cbxMin = i;
          } else if (i > precinct.cbxMax) {
            precinct.cbxMax = i;
          }
          if (j < precinct.cbyMin) {
            precinct.cbxMin = j;
          } else if (j > precinct.cbyMax) {
            precinct.cbyMax = j;
          }
        } else {
          precincts[precinctNumber] = precinct = {
            cbxMin: i,
            cbyMin: j,
            cbxMax: i,
            cbyMax: j
          };
        }
        codeblock.precinct = precinct;
      }
    }
    subband.codeblockParameters = {
      codeblockWidth: xcb_,
      codeblockHeight: ycb_,
      numcodeblockwide: cbx1 - cbx0 + 1,
      numcodeblockhigh: cby1 - cby0 + 1
    };
    subband.codeblocks = codeblocks;
    subband.precincts = precincts;
  }
  function createPacket(resolution, precinctNumber, layerNumber) {
    var precinctCodeblocks = [];
    // Section B.10.8 Order of info in packet
    var subbands = resolution.subbands;
    // sub-bands already ordered in 'LL', 'HL', 'LH', and 'HH' sequence
    for (var i = 0, ii = subbands.length; i < ii; i++) {
      var subband = subbands[i];
      var codeblocks = subband.codeblocks;
      for (var j = 0, jj = codeblocks.length; j < jj; j++) {
        var codeblock = codeblocks[j];
        if (codeblock.precinctNumber !== precinctNumber) {
          continue;
        }
        precinctCodeblocks.push(codeblock);
      }
    }
    return {
      layerNumber: layerNumber,
      codeblocks: precinctCodeblocks
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
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount,
        tile.components[q].codingStyleParameters.decompositionLevelsCount);
    }

    var l = 0, r = 0, i = 0, k = 0;

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
      throw new Error('JPX Error: Out of packets');
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
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount,
        tile.components[q].codingStyleParameters.decompositionLevelsCount);
    }

    var r = 0, l = 0, i = 0, k = 0;

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
      throw new Error('JPX Error: Out of packets');
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
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount,
        component.codingStyleParameters.decompositionLevelsCount);
    }
    var maxNumPrecinctsInLevel = new Int32Array(
      maxDecompositionLevelsCount + 1);
    for (r = 0; r <= maxDecompositionLevelsCount; ++r) {
      var maxNumPrecincts = 0;
      for (c = 0; c < componentsCount; ++c) {
        var resolutions = tile.components[c].resolutions;
        if (r < resolutions.length) {
          maxNumPrecincts = Math.max(maxNumPrecincts,
            resolutions[r].precinctParameters.numprecincts);
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
      throw new Error('JPX Error: Out of packets');
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
    var l = 0, r = 0, c = 0, px = 0, py = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.4 Position-component-resolution-layer
      for (; py < precinctsIterationSizes.maxNumHigh; py++) {
        for (; px < precinctsIterationSizes.maxNumWide; px++) {
          for (; c < componentsCount; c++) {
            var component = tile.components[c];
            var decompositionLevelsCount =
              component.codingStyleParameters.decompositionLevelsCount;
            for (; r <= decompositionLevelsCount; r++) {
              var resolution = component.resolutions[r];
              var sizeInImageScale =
                precinctsSizes.components[c].resolutions[r];
              var k = getPrecinctIndexIfExist(
                px,
                py,
                sizeInImageScale,
                precinctsIterationSizes,
                resolution);
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
      throw new Error('JPX Error: Out of packets');
    };
  }
  function ComponentPositionResolutionLayerIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var precinctsSizes = getPrecinctSizesInImageScale(tile);
    var l = 0, r = 0, c = 0, px = 0, py = 0;
    
    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.5 Component-position-resolution-layer
      for (; c < componentsCount; ++c) {
        var component = tile.components[c];
        var precinctsIterationSizes = precinctsSizes.components[c];
        var decompositionLevelsCount =
          component.codingStyleParameters.decompositionLevelsCount;
        for (; py < precinctsIterationSizes.maxNumHigh; py++) {
          for (; px < precinctsIterationSizes.maxNumWide; px++) {
            for (; r <= decompositionLevelsCount; r++) {
              var resolution = component.resolutions[r];
              var sizeInImageScale = precinctsIterationSizes.resolutions[r];
              var k = getPrecinctIndexIfExist(
                px,
                py,
                sizeInImageScale,
                precinctsIterationSizes,
                resolution);
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
      throw new Error('JPX Error: Out of packets');
    };
  }
  function getPrecinctIndexIfExist(
    pxIndex, pyIndex, sizeInImageScale, precinctIterationSizes, resolution) {
    var posX = pxIndex * precinctIterationSizes.minWidth;
    var posY = pyIndex * precinctIterationSizes.minHeight;
    if (posX % sizeInImageScale.width !== 0 ||
        posY % sizeInImageScale.height !== 0) {
      return null;
    }
    var startPrecinctRowIndex =
      (posY / sizeInImageScale.width) *
      resolution.precinctParameters.numprecinctswide;
    return (posX / sizeInImageScale.height) + startPrecinctRowIndex;
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
      var decompositionLevelsCount =
        component.codingStyleParameters.decompositionLevelsCount;
      var sizePerResolution = new Array(decompositionLevelsCount + 1);
      var minWidthCurrentComponent = Number.MAX_VALUE;
      var minHeightCurrentComponent = Number.MAX_VALUE;
      var maxNumWideCurrentComponent = 0;
      var maxNumHighCurrentComponent = 0;
      var scale = 1;
      for (var r = decompositionLevelsCount; r >= 0; --r) {
        var resolution = component.resolutions[r];
        var widthCurrentResolution =
          scale * resolution.precinctParameters.precinctWidth;
        var heightCurrentResolution =
          scale * resolution.precinctParameters.precinctHeight;
        minWidthCurrentComponent = Math.min(
          minWidthCurrentComponent,
          widthCurrentResolution);
        minHeightCurrentComponent = Math.min(
          minHeightCurrentComponent,
          heightCurrentResolution);
        maxNumWideCurrentComponent = Math.max(maxNumWideCurrentComponent,
          resolution.precinctParameters.numprecinctswide);
        maxNumHighCurrentComponent = Math.max(maxNumHighCurrentComponent,
          resolution.precinctParameters.numprecinctshigh);
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
      var decompositionLevelsCount =
        component.codingStyleParameters.decompositionLevelsCount;
      // Section B.5 Resolution levels and sub-bands
      var resolutions = [];
      var subbands = [];
      for (var r = 0; r <= decompositionLevelsCount; r++) {
        var blocksDimensions = getBlocksDimensions(context, component, r);
        var resolution = {};
        var scale = 1 << (decompositionLevelsCount - r);
        resolution.trx0 = Math.ceil(component.tcx0 / scale);
        resolution.try0 = Math.ceil(component.tcy0 / scale);
        resolution.trx1 = Math.ceil(component.tcx1 / scale);
        resolution.try1 = Math.ceil(component.tcy1 / scale);
        resolution.resLevel = r;
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
          buildCodeblocks(context, subband, blocksDimensions);
          subbands.push(subband);
          resolution.subbands = [subband];
        } else {
          var bscale = 1 << (decompositionLevelsCount - r + 1);
          var resolutionSubbands = [];
          // three sub-bands (HL, LH and HH) with rest of decompositions
          subband = {};
          subband.type = 'HL';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
          subband.tby0 = Math.ceil(component.tcy0 / bscale);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
          subband.tby1 = Math.ceil(component.tcy1 / bscale);
          subband.resolution = resolution;
          buildCodeblocks(context, subband, blocksDimensions);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          subband = {};
          subband.type = 'LH';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale);
          subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale);
          subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
          subband.resolution = resolution;
          buildCodeblocks(context, subband, blocksDimensions);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          subband = {};
          subband.type = 'HH';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
          subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
          subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
          subband.resolution = resolution;
          buildCodeblocks(context, subband, blocksDimensions);
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
        tile.packetsIterator =
          new LayerResolutionComponentPositionIterator(context);
        break;
      case 1:
        tile.packetsIterator =
          new ResolutionLayerComponentPositionIterator(context);
        break;
      case 2:
        tile.packetsIterator =
          new ResolutionPositionComponentLayerIterator(context);
        break;
      case 3:
        tile.packetsIterator =
          new PositionComponentResolutionLayerIterator(context);
        break;
      case 4:
        tile.packetsIterator =
          new ComponentPositionResolutionLayerIterator(context);
        break;
      default:
        throw new Error('JPX Error: Unsupported progression order ' +
                        progressionOrder);
    }
  }
  function parseTilePackets(context, data, offset, dataLength) {
    var position = 0;
    var buffer, bufferSize = 0, skipNextBit = false;
    function readBits(count) {
      while (bufferSize < count) {
        var b = data[offset + position];
        position++;
        if (skipNextBit) {
          buffer = (buffer << 7) | b;
          bufferSize += 7;
          skipNextBit = false;
        } else {
          buffer = (buffer << 8) | b;
          bufferSize += 8;
        }
        if (b === 0xFF) {
          skipNextBit = true;
        }
      }
      bufferSize -= count;
      return (buffer >>> bufferSize) & ((1 << count) - 1);
    }
    function skipMarkerIfEqual(value) {
      if (data[offset + position - 1] === 0xFF &&
          data[offset + position] === value) {
        skipBytes(1);
        return true;
      } else if (data[offset + position] === 0xFF &&
                 data[offset + position + 1] === value) {
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
      var queue = [], codeblock;
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
        var codingpassesLog2 = log2(codingpasses);
        // rounding down log2
        var bits = ((codingpasses < (1 << codingpassesLog2)) ?
          codingpassesLog2 - 1 : codingpassesLog2) + codeblock.Lblock;
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
        if (codeblock['data'] === undefined) {
          codeblock.data = [];
        }
        codeblock.data.push({
          data: data,
          start: offset + position,
          end: offset + position + packetItem.dataLength,
          codingpasses: packetItem.codingpasses
        });
        position += packetItem.dataLength;
      }
    }
    return position;
  }
  function copyCoefficients(coefficients, targetArrayWidth, targetArrayHeight,
                            subband,delta, mb, reversible,
                            segmentationSymbolUsed, regionInLevel) {
    var x0 = subband.tbx0;
    var y0 = subband.tby0;
    var codeblocks = subband.codeblocks;
    var right = subband.type.charAt(0) === 'H' ? 1 : 0;
    var bottom = subband.type.charAt(1) === 'H' ? targetArrayWidth : 0;
    var resolution = subband.resolution;
    var interleave = (subband.type !== 'LL');
    var regionInSubband;
    if (!interleave) {
      regionInSubband = regionInLevel;
    } else {
      regionInSubband = {
        x0: (regionInLevel.x0 - resolution.trx0) / 2 + subband.tbx0,
        y0: (regionInLevel.y0 - resolution.try0) / 2 + subband.tby0,
        x1: (regionInLevel.x1 - resolution.trx0) / 2 + subband.tbx0,
        y1: (regionInLevel.y1 - resolution.try0) / 2 + subband.tby0
      };
    }
    var targetArrayStep = interleave ? 2 : 1;

    for (var i = 0, ii = codeblocks.length; i < ii; ++i) {
      var codeblock = codeblocks[i];
      var blockWidth = codeblock.tbx1_ - codeblock.tbx0_;
      var blockHeight = codeblock.tby1_ - codeblock.tby0_;
      if (blockWidth === 0 || blockHeight === 0) {
        continue;
      }
      if (codeblock['data'] === undefined) {
        continue;
      }
      
      var regionInCodeblock = {
        x0: Math.max(codeblock.tbx0_, regionInSubband.x0),
        y0: Math.max(codeblock.tby0_, regionInSubband.y0),
        x1: Math.min(codeblock.tbx1_, regionInSubband.x1),
        y1: Math.min(codeblock.tby1_, regionInSubband.y1)
      };
      if (regionInCodeblock.x0 >= regionInCodeblock.x1 ||
          regionInCodeblock.y0 >= regionInCodeblock.y1) {
        continue;
      }

      var bitModel, currentCodingpassType;
      bitModel = new BitModel(blockWidth, blockHeight, codeblock.subbandType,
                              codeblock.zeroBitPlanes, mb);
      currentCodingpassType = 2; // first bit plane starts from cleanup

      // collect data
      var data = codeblock.data, totalLength = 0, codingpasses = 0;
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
      var decoder = new ArithmeticDecoder(encodedData, 0, totalLength);
      bitModel.setDecoder(decoder);

      for (j = 0; j < codingpasses; j++) {
        switch (currentCodingpassType) {
          case 0:
            bitModel.runSignificancePropogationPass();
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

      var sign = bitModel.coefficentsSign;
      var magnitude = bitModel.coefficentsMagnitude;
      var bitsDecoded = bitModel.bitsDecoded;
      var magnitudeCorrection = reversible ? 0 : 0.5;
      var k, n, nb;
      var regionInCodeblockWidth = regionInCodeblock.x1 - regionInCodeblock.x0;
      // Do the interleaving of Section F.3.3 here, so we do not need
      // to copy later. LL level is not interleaved, just copied.
      for (var row = regionInCodeblock.y0; row < regionInCodeblock.y1; ++row) {
        var codeblockOffset =
          (regionInCodeblock.x0 - codeblock.tbx0_) +
          (row - codeblock.tby0_) * blockWidth;
        var targetOffset =
          (regionInCodeblock.x0 - regionInSubband.x0) * targetArrayStep +
          (row - regionInSubband.y0) * targetArrayWidth * targetArrayStep +
          right + bottom;
          
        for (k = regionInCodeblock.x0; k < regionInCodeblock.x1; k++) {
          n = magnitude[codeblockOffset];
          if (n !== 0) {
            n = (n + magnitudeCorrection) * delta;
            if (sign[codeblockOffset] !== 0) {
              n = -n;
            }
            nb = bitsDecoded[codeblockOffset];
            if (reversible && (nb >= mb)) {
              coefficients[targetOffset] = n;
            } else {
              coefficients[targetOffset] = n * (1 << (mb - nb));
            }
          }
          targetOffset += targetArrayStep;
          ++codeblockOffset;
        }
      }
    }
  }
  function transformTile(context, tile, c) {
    var component = tile.components[c];
    var codingStyleParameters = component.codingStyleParameters;
    var quantizationParameters = component.quantizationParameters;
    var decompositionLevelsCount =
      codingStyleParameters.decompositionLevelsCount;
    var spqcds = quantizationParameters.SPqcds;
    var scalarExpounded = quantizationParameters.scalarExpounded;
    var guardBits = quantizationParameters.guardBits;
    var segmentationSymbolUsed = codingStyleParameters.segmentationSymbolUsed;
    var precision = context.components[c].precision;
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

    var reversible = codingStyleParameters.reversibleTransformation;
    var transform = (reversible ? new ReversibleTransform() :
                                  new IrreversibleTransform());

    var subbandCoefficients = [];
    var b = 0;
    for (var i = 0; i <= decompositionLevelsCount; i++) {
      var resolution = component.resolutions[i];

      var width = resolution.trx1 - resolution.trx0;
      var height = resolution.try1 - resolution.try0;
      
      var regionInLevel, arrayWidth, arrayHeight;
      if (relativeRegionInTile === undefined) {
        arrayWidth = width;
        arrayHeight = height;
        regionInLevel = {
          x0: resolution.trx0,
          y0: resolution.try0,
          x1: resolution.trx1,
          y1: resolution.try1
        };
      } else {
        var scale = 1 << (decompositionLevelsCount - i);
        var redundantCoeffs = 4;
        regionInLevel = {
          x0: Math.ceil(relativeRegionInTile.x0 / scale) - redundantCoeffs,
          y0: Math.ceil(relativeRegionInTile.y0 / scale) - redundantCoeffs,
          x1: Math.ceil(relativeRegionInTile.x1 / scale) + redundantCoeffs,
          y1: Math.ceil(relativeRegionInTile.y1 / scale) + redundantCoeffs
        };
        regionInLevel.x0 = 2 * Math.floor(regionInLevel.x0 / 2) +
          resolution.trx0;
        regionInLevel.y0 = 2 * Math.floor(regionInLevel.y0 / 2) +
          resolution.try0;
        regionInLevel.x1 = 2 * Math.floor(regionInLevel.x1 / 2) +
          resolution.trx0;
        regionInLevel.y1 = 2 * Math.floor(regionInLevel.y1 / 2) +
          resolution.try0;
        
        regionInLevel.x0 = Math.max(regionInLevel.x0, resolution.trx0);
        regionInLevel.y0 = Math.max(regionInLevel.y0, resolution.try0);
        regionInLevel.x1 = Math.min(regionInLevel.x1, resolution.trx1);
        regionInLevel.y1 = Math.min(regionInLevel.y1, resolution.try1);
        
        arrayWidth = regionInLevel.x1 - regionInLevel.x0;
        arrayHeight = regionInLevel.y1 - regionInLevel.y0;
      }
      
      // Allocate space for the whole sublevel.
      var coefficients = new Float32Array(arrayWidth * arrayHeight);

      for (var j = 0, jj = resolution.subbands.length; j < jj; j++) {
        var mu, epsilon;
        if (!scalarExpounded) {
          // formula E-5
          mu = spqcds[0].mu;
          epsilon = spqcds[0].epsilon + (i > 0 ? 1 - i : 0);
        } else {
          mu = spqcds[b].mu;
          epsilon = spqcds[b].epsilon;
          b++;
        }

        var subband = resolution.subbands[j];
        var gainLog2 = SubbandsGainLog2[subband.type];

        // calulate quantization coefficient (Section E.1.1.1)
        var delta = (reversible ? 1 :
          Math.pow(2, precision + gainLog2 - epsilon) * (1 + mu / 2048));
        var mb = (guardBits + epsilon - 1);

        // In the first resolution level, copyCoefficients will fill the
        // whole array with coefficients. In the succeding passes,
        // copyCoefficients will consecutively fill in the values that belong
        // to the interleaved positions of the HL, LH, and HH coefficients.
        // The LL coefficients will then be interleaved in Transform.iterate().
        copyCoefficients(coefficients, arrayWidth, arrayHeight, subband, delta,
                         mb, reversible, segmentationSymbolUsed,
                         regionInLevel);
      }
      
      var relativeRegionInLevel = {
        x0: regionInLevel.x0 - resolution.trx0,
        y0: regionInLevel.y0 - resolution.try0,
        x1: regionInLevel.x1 - resolution.trx0,
        y1: regionInLevel.y1 - resolution.try0
      };
      subbandCoefficients.push({
        items: coefficients,
        relativeRegionInLevel: relativeRegionInLevel
      });
    }

    var result = transform.calculate(subbandCoefficients,
                                     component.tcx0, component.tcy0);
    var transformedRegion = result.relativeRegionInLevel;
    var transformedWidth = transformedRegion.x1 - transformedRegion.x0;
    
    var needCropTile = false;
    if (context.regionToParse !== undefined) {
      needCropTile =
        relativeRegionInTile.x0 !== transformedRegion.x0 ||
        relativeRegionInTile.y0 !== transformedRegion.y0 ||
        relativeRegionInTile.x1 !== transformedRegion.x1 ||
        relativeRegionInTile.y1 !== transformedRegion.y1;
    }
    if (!needCropTile) {
      var transformedHeight = transformedRegion.y1 - transformedRegion.y0;
      return {
        left: component.tcx0,
        top: component.tcy0,
        width: transformedWidth,
        height: transformedHeight,
        items: result.items
      };
    }
    
    // Crop the 4 redundant pixels used for the DWT
    
    var width = relativeRegionInTile.x1 - relativeRegionInTile.x0;
    var height = relativeRegionInTile.y1 - relativeRegionInTile.y0;
    
    var itemsWithRedundantPixels = result.items;
    var items = new Float32Array(width * height);
    
    var redundantRowsTop =
      relativeRegionInTile.y0 - transformedRegion.y0;
    var redundantColumnsLeft =
      relativeRegionInTile.x0 - transformedRegion.x0;
      
    var targetOffset = 0;
    var sourceOffset =
      redundantColumnsLeft + transformedWidth * redundantRowsTop;
    for (var i = 0; i < height; ++i) {
      var sourceEnd = sourceOffset + width;
      
      items.set(
        itemsWithRedundantPixels.subarray(sourceOffset, sourceEnd),
        targetOffset);
      
      sourceOffset += transformedWidth;
      targetOffset += width;
    }
    
    return {
      left: component.tcx0 + relativeRegionInTile.x0,
      top: component.tcy0 + relativeRegionInTile.y0,
      width: width,
      height: height,
      items: items
    };
  }
  function transformComponents(context) {
    var siz = context.SIZ;
    var components = context.components;
    var componentsCount = siz.Csiz;
    var resultImages = [];
    for (var i = 0, ii = context.tiles.length; i < ii; i++) {
      var tile = context.tiles[i];
      
      if (context.regionToParse !== undefined) {
        if (context.regionToParse.left >= tile.tx1 ||
            context.regionToParse.top >= tile.ty1 ||
            context.regionToParse.right <= tile.tx0 ||
            context.regionToParse.bottom <= tile.ty0) {
          continue;
        }
      }
      
      var transformedTiles = [];
      var c;
      for (c = 0; c < componentsCount; c++) {
        transformedTiles[c] = transformTile(context, tile, c);
      }
      var tile0 = transformedTiles[0];
      var out = new Uint8Array(tile0.items.length * componentsCount);
      var result = {
        left: tile0.left,
        top: tile0.top,
        width: tile0.width,
        height: tile0.height,
        items: out
      };

      // Section G.2.2 Inverse multi component transform
      var shift, offset, max, min, maxK;
      var pos = 0, j, jj, y0, y1, y2, r, g, b, k, val;
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
        max = 255 * (1 << shift);
        maxK = max * 0.5;
        min = -maxK;

        var component0 = tile.components[0];
        var alpha01 = componentsCount - 3;
        jj = y0items.length;
        if (!component0.codingStyleParameters.reversibleTransformation) {
          // inverse irreversible multiple component transform
          for (j = 0; j < jj; j++, pos += alpha01) {
            y0 = y0items[j] + offset;
            y1 = y1items[j];
            y2 = y2items[j];
            r = y0 + 1.402 * y2;
            g = y0 - 0.34413 * y1 - 0.71414 * y2;
            b = y0 + 1.772 * y1;
            out[pos++] = r <= 0 ? 0 : r >= max ? 255 : r >> shift;
            out[pos++] = g <= 0 ? 0 : g >= max ? 255 : g >> shift;
            out[pos++] = b <= 0 ? 0 : b >= max ? 255 : b >> shift;
          }
        } else {
          // inverse reversible multiple component transform
          for (j = 0; j < jj; j++, pos += alpha01) {
            y0 = y0items[j] + offset;
            y1 = y1items[j];
            y2 = y2items[j];
            g = y0 - ((y2 + y1) >> 2);
            r = g + y2;
            b = g + y1;
            out[pos++] = r <= 0 ? 0 : r >= max ? 255 : r >> shift;
            out[pos++] = g <= 0 ? 0 : g >= max ? 255 : g >> shift;
            out[pos++] = b <= 0 ? 0 : b >= max ? 255 : b >> shift;
          }
        }
        if (fourComponents) {
          for (j = 0, pos = 3; j < jj; j++, pos += 4) {
            k = y3items[j];
            out[pos] = k <= min ? 0 : k >= maxK ? 255 : (k + offset) >> shift;
          }
        }
      } else { // no multi-component transform
        for (c = 0; c < componentsCount; c++) {
          var items = transformedTiles[c].items;
          shift = components[c].precision - 8;
          offset = (128 << shift) + 0.5;
          max = (127.5 * (1 << shift));
          min = -max;
          for (pos = c, j = 0, jj = items.length; j < jj; j++) {
            val = items[j];
            out[pos] = val <= min ? 0 :
                       val >= max ? 255 : (val + offset) >> shift;
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
      var qcdOrQcc = (context.currentTile.QCC[c] !== undefined ?
        context.currentTile.QCC[c] : context.currentTile.QCD);
      component.quantizationParameters = qcdOrQcc;
      var codOrCoc = (context.currentTile.COC[c] !== undefined  ?
        context.currentTile.COC[c] : context.currentTile.COD);
      component.codingStyleParameters = codOrCoc;
    }
    tile.codingStyleDefaultParameters = context.currentTile.COD;
  }

  // Section B.10.2 Tag trees
  var TagTree = (function TagTreeClosure() {
    function TagTree(width, height) {
      var levelsLength = log2(Math.max(width, height)) + 1;
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
        var currentLevel = 0, value = 0, level;
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
  })();

  var InclusionTree = (function InclusionTreeClosure() {
    function InclusionTree(width, height,  defaultValue) {
      var levelsLength = log2(Math.max(width, height)) + 1;
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
  })();

  // Section D. Coefficient bit modeling
  var BitModel = (function BitModelClosure() {
    var UNIFORM_CONTEXT = 17;
    var RUNLENGTH_CONTEXT = 18;
    // Table D-1
    // The index is binary presentation: 0dddvvhh, ddd - sum of Di (0..4),
    // vv - sum of Vi (0..2), and hh - sum of Hi (0..2)
    var LLAndLHContextsLabel = new Uint8Array([
      0, 5, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 1, 6, 8, 0, 3, 7, 8, 0, 4,
      7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6,
      8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8
    ]);
    var HLContextLabel = new Uint8Array([
      0, 3, 4, 0, 5, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 1, 3, 4, 0, 6, 7, 7, 0, 8,
      8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3,
      4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8
    ]);
    var HHContextLabel = new Uint8Array([
      0, 1, 2, 0, 1, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 0, 3, 4, 5, 0, 4, 5, 5, 0, 5,
      5, 5, 0, 0, 0, 0, 0, 6, 7, 7, 0, 7, 7, 7, 0, 7, 7, 7, 0, 0, 0, 0, 0, 8, 8,
      8, 0, 8, 8, 8, 0, 8, 8, 8, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8
    ]);

    function BitModel(width, height, subband, zeroBitPlanes, mb) {
      this.width = width;
      this.height = height;

      this.contextLabelTable = (subband === 'HH' ? HHContextLabel :
        (subband === 'HL' ? HLContextLabel : LLAndLHContextsLabel));

      var coefficientCount = width * height;

      // coefficients outside the encoding region treated as insignificant
      // add border state cells for significanceState
      this.neighborsSignificance = new Uint8Array(coefficientCount);
      this.coefficentsSign = new Uint8Array(coefficientCount);
      this.coefficentsMagnitude = mb > 14 ? new Uint32Array(coefficientCount) :
                                  mb > 6 ? new Uint16Array(coefficientCount) :
                                  new Uint8Array(coefficientCount);
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
        this.contexts[0] = (4 << 1) | 0;
        this.contexts[UNIFORM_CONTEXT] = (46 << 1) | 0;
        this.contexts[RUNLENGTH_CONTEXT] = (3 << 1) | 0;
      },
      setNeighborsSignificance:
        function BitModel_setNeighborsSignificance(row, column, index) {
        var neighborsSignificance = this.neighborsSignificance;
        var width = this.width, height = this.height;
        var left = (column > 0);
        var right = (column + 1 < width);
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
      runSignificancePropogationPass:
        function BitModel_runSignificancePropogationPass() {
        var decoder = this.decoder;
        var width = this.width, height = this.height;
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

              if (coefficentsMagnitude[index] ||
                  !neighborsSignificance[index]) {
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
        var width = this.width, height = this.height;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var coefficentsSign = this.coefficentsSign;
        var contribution, sign0, sign1, significance1;
        var contextLabel, decoded;

        // calculate horizontal contribution
        significance1 = (column > 0 && coefficentsMagnitude[index - 1] !== 0);
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
        significance1 = (row > 0 && coefficentsMagnitude[index - width] !== 0);
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
      runMagnitudeRefinementPass:
        function BitModel_runMagnitudeRefinementPass() {
        var decoder = this.decoder;
        var width = this.width, height = this.height;
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
              if (!coefficentsMagnitude[index] ||
                (processingFlags[index] & processedMask) !== 0) {
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
              coefficentsMagnitude[index] =
                (coefficentsMagnitude[index] << 1) | bit;
              bitsDecoded[index]++;
              processingFlags[index] |= processedMask;
            }
          }
        }
      },
      runCleanupPass: function BitModel_runCleanupPass() {
        var decoder = this.decoder;
        var width = this.width, height = this.height;
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
            var allEmpty = (checkAllEmpty &&
              processingFlags[index0] === 0 &&
              processingFlags[index0 + oneRowDown] === 0 &&
              processingFlags[index0 + twoRowsDown] === 0 &&
              processingFlags[index0 + threeRowsDown] === 0 &&
              neighborsSignificance[index0] === 0 &&
              neighborsSignificance[index0 + oneRowDown] === 0 &&
              neighborsSignificance[index0 + twoRowsDown] === 0 &&
              neighborsSignificance[index0 + threeRowsDown] === 0);
            var i1 = 0, index = index0;
            var i = i0, sign;
            if (allEmpty) {
              var hasSignificantCoefficent =
                decoder.readBit(contexts, RUNLENGTH_CONTEXT);
              if (!hasSignificantCoefficent) {
                bitsDecoded[index0]++;
                bitsDecoded[index0 + oneRowDown]++;
                bitsDecoded[index0 + twoRowsDown]++;
                bitsDecoded[index0 + threeRowsDown]++;
                continue; // next column
              }
              i1 = (decoder.readBit(contexts, UNIFORM_CONTEXT) << 1) |
                    decoder.readBit(contexts, UNIFORM_CONTEXT);
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
              if (coefficentsMagnitude[index] ||
                (processingFlags[index] & processedMask) !== 0) {
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
        var symbol = (decoder.readBit(contexts, UNIFORM_CONTEXT) << 3) |
                     (decoder.readBit(contexts, UNIFORM_CONTEXT) << 2) |
                     (decoder.readBit(contexts, UNIFORM_CONTEXT) << 1) |
                      decoder.readBit(contexts, UNIFORM_CONTEXT);
        if (symbol !== 0xA) {
          throw new Error('JPX Error: Invalid segmentation symbol');
        }
      }
    };

    return BitModel;
  })();

  // Section F, Discrete wavelet transformation
  var Transform = (function TransformClosure() {
    function Transform() {}

    Transform.prototype.calculate =
      function transformCalculate(subbands, u0, v0) {
      var ll = subbands[0];
      for (var i = 1, ii = subbands.length; i < ii; i++) {
        ll = this.iterate(ll, subbands[i], u0, v0);
      }
      return ll;
    };
    Transform.prototype.extend = function extend(buffer, offset, size) {
      // Section F.3.7 extending... using max extension of 4
      var i1 = offset - 1, j1 = offset + 1;
      var i2 = offset + size - 2, j2 = offset + size;
      buffer[i1--] = buffer[j1++];
      buffer[j2++] = buffer[i2--];
      buffer[i1--] = buffer[j1++];
      buffer[j2++] = buffer[i2--];
      buffer[i1--] = buffer[j1++];
      buffer[j2++] = buffer[i2--];
      buffer[i1] = buffer[j1];
      buffer[j2] = buffer[i2];
    };
    Transform.prototype.iterate = function Transform_iterate(ll, hl_lh_hh,
                                                             u0, v0) {
      var levelRegion = hl_lh_hh.relativeRegionInLevel;
      if (ll.relativeRegionInLevel.x0 * 2 > levelRegion.x0 ||
          ll.relativeRegionInLevel.y0 * 2 > levelRegion.y0 ||
          ll.relativeRegionInLevel.x1 * 2 < levelRegion.x1 ||
          ll.relativeRegionInLevel.y1 * 2 < levelRegion.y1) {
        throw new Error('JPX Error: region in LL is smaller than region in ' +
          'higher resolution level');
      }
      if (levelRegion.x0 % 2 !== 0 || levelRegion.y0 % 2 !== 0) {
        throw new Error('JPX Error: region in HL/LH/HH subbands begins in ' +
          'odd coefficients');
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
        k = llOffset + (llWidth * i / 2);
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

          items.set(
            rowBuffer.subarray(bufferPadding, bufferPadding + width),
            k);
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
      var b, currentBuffer = 0;
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
        items: items
      };
    };
    return Transform;
  })();

  // Section 3.8.2 Irreversible 9-7 filter
  var IrreversibleTransform = (function IrreversibleTransformClosure() {
    function IrreversibleTransform() {
      Transform.call(this);
    }

    IrreversibleTransform.prototype = Object.create(Transform.prototype);
    IrreversibleTransform.prototype.filter =
      function irreversibleTransformFilter(x, offset, length) {
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
      current = delta * x[j -1];
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
  })();

  // Section 3.8.1 Reversible 5-3 filter
  var ReversibleTransform = (function ReversibleTransformClosure() {
    function ReversibleTransform() {
      Transform.call(this);
    }

    ReversibleTransform.prototype = Object.create(Transform.prototype);
    ReversibleTransform.prototype.filter =
      function reversibleTransformFilter(x, offset, length) {
      var len = length >> 1;
      offset = offset | 0;
      var j, n;

      for (j = offset, n = len + 1; n--; j += 2) {
        x[j] -= (x[j - 1] + x[j + 1] + 2) >> 2;
      }

      for (j = offset + 1, n = len; n--; j += 2) {
        x[j] += (x[j - 1] + x[j + 1]) >> 1;
      }
    };

    return ReversibleTransform;
  })();

  return JpxImage;
})();


/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals Cmd, ColorSpace, Dict, MozBlobBuilder, Name, PDFJS, Ref, URL,
           Promise */

'use strict';

var globalScope = (typeof window === 'undefined') ? this : window;

var isWorker = (typeof window === 'undefined');

var FONT_IDENTITY_MATRIX = [0.001, 0, 0, 0.001, 0, 0];

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
  WIDGET: 1,
  TEXT: 2,
  LINK: 3
};

var StreamType = {
  UNKNOWN: 0,
  FLATE: 1,
  LZW: 2,
  DCT: 3,
  JPX: 4,
  JBIG: 5,
  A85: 6,
  AHX: 7,
  CCF: 8,
  RL: 9
};

var FontType = {
  UNKNOWN: 0,
  TYPE1: 1,
  TYPE1C: 2,
  CIDFONTTYPE0: 3,
  CIDFONTTYPE0C: 4,
  TRUETYPE: 5,
  CIDFONTTYPE2: 6,
  TYPE3: 7,
  OPENTYPE: 8,
  TYPE0: 9,
  MMTYPE1: 10
};

// The global PDFJS object exposes the API
// In production, it will be declared outside a global wrapper
// In development, it will be declared here
if (!globalScope.PDFJS) {
  globalScope.PDFJS = {};
}

globalScope.PDFJS.pdfBug = false;

PDFJS.VERBOSITY_LEVELS = {
  errors: 0,
  warnings: 1,
  infos: 5
};

// All the possible operations for an operator list.
var OPS = PDFJS.OPS = {
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

// A notice for devs. These are good for things that are helpful to devs, such
// as warning that Workers were disabled, which is important to devs but not
// end users.
function info(msg) {
  if (PDFJS.verbosity >= PDFJS.VERBOSITY_LEVELS.infos) {
    console.log('Info: ' + msg);
  }
}

// Non-fatal warnings.
function warn(msg) {
  if (PDFJS.verbosity >= PDFJS.VERBOSITY_LEVELS.warnings) {
    console.log('Warning: ' + msg);
  }
}

// Fatal errors that should trigger the fallback UI and halt execution by
// throwing an exception.
function error(msg) {
  // If multiple arguments were passed, pass them all to the log function.
  if (arguments.length > 1) {
    var logArguments = ['Error:'];
    logArguments.push.apply(logArguments, arguments);
    console.log.apply(console, logArguments);
    // Join the arguments into a single string for the lines below.
    msg = [].join.call(arguments, ' ');
  } else {
    console.log('Error: ' + msg);
  }
  console.log(backtrace());
  UnsupportedManager.notify(UNSUPPORTED_FEATURES.unknown);
  throw new Error(msg);
}

function backtrace() {
  try {
    throw new Error();
  } catch (e) {
    return e.stack ? e.stack.split('\n').slice(2).join('\n') : '';
  }
}

function assert(cond, msg) {
  if (!cond) {
    error(msg);
  }
}

var UNSUPPORTED_FEATURES = PDFJS.UNSUPPORTED_FEATURES = {
  unknown: 'unknown',
  forms: 'forms',
  javaScript: 'javaScript',
  smask: 'smask',
  shadingPattern: 'shadingPattern',
  font: 'font'
};

var UnsupportedManager = PDFJS.UnsupportedManager =
  (function UnsupportedManagerClosure() {
  var listeners = [];
  return {
    listen: function (cb) {
      listeners.push(cb);
    },
    notify: function (featureId) {
      warn('Unsupported feature "' + featureId + '"');
      for (var i = 0, ii = listeners.length; i < ii; i++) {
        listeners[i](featureId);
      }
    }
  };
})();

// Combines two URLs. The baseUrl shall be absolute URL. If the url is an
// absolute URL, it will be returned as is.
function combineUrl(baseUrl, url) {
  if (!url) {
    return baseUrl;
  }
  if (/^[a-z][a-z0-9+\-.]*:/i.test(url)) {
    return url;
  }
  var i;
  if (url.charAt(0) === '/') {
    // absolute path
    i = baseUrl.indexOf('://');
    if (url.charAt(1) === '/') {
      ++i;
    } else {
      i = baseUrl.indexOf('/', i + 3);
    }
    return baseUrl.substring(0, i) + url;
  } else {
    // relative path
    var pathLength = baseUrl.length;
    i = baseUrl.lastIndexOf('#');
    pathLength = i >= 0 ? i : pathLength;
    i = baseUrl.lastIndexOf('?', pathLength);
    pathLength = i >= 0 ? i : pathLength;
    var prefixLength = baseUrl.lastIndexOf('/', pathLength);
    return baseUrl.substring(0, prefixLength + 1) + url;
  }
}

// Validates if URL is safe and allowed, e.g. to avoid XSS.
function isValidUrl(url, allowRelative) {
  if (!url) {
    return false;
  }
  // RFC 3986 (http://tools.ietf.org/html/rfc3986#section-3.1)
  // scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
  var protocol = /^[a-z][a-z0-9+\-.]*(?=:)/i.exec(url);
  if (!protocol) {
    return allowRelative;
  }
  protocol = protocol[0].toLowerCase();
  switch (protocol) {
    case 'http':
    case 'https':
    case 'ftp':
    case 'mailto':
      return true;
    default:
      return false;
  }
}
PDFJS.isValidUrl = isValidUrl;

function shadow(obj, prop, value) {
  Object.defineProperty(obj, prop, { value: value,
                                     enumerable: true,
                                     configurable: true,
                                     writable: false });
  return value;
}

var PasswordResponses = PDFJS.PasswordResponses = {
  NEED_PASSWORD: 1,
  INCORRECT_PASSWORD: 2
};

var PasswordException = (function PasswordExceptionClosure() {
  function PasswordException(msg, code) {
    this.name = 'PasswordException';
    this.message = msg;
    this.code = code;
  }

  PasswordException.prototype = new Error();
  PasswordException.constructor = PasswordException;

  return PasswordException;
})();
PDFJS.PasswordException = PasswordException;

var UnknownErrorException = (function UnknownErrorExceptionClosure() {
  function UnknownErrorException(msg, details) {
    this.name = 'UnknownErrorException';
    this.message = msg;
    this.details = details;
  }

  UnknownErrorException.prototype = new Error();
  UnknownErrorException.constructor = UnknownErrorException;

  return UnknownErrorException;
})();
PDFJS.UnknownErrorException = UnknownErrorException;

var InvalidPDFException = (function InvalidPDFExceptionClosure() {
  function InvalidPDFException(msg) {
    this.name = 'InvalidPDFException';
    this.message = msg;
  }

  InvalidPDFException.prototype = new Error();
  InvalidPDFException.constructor = InvalidPDFException;

  return InvalidPDFException;
})();
PDFJS.InvalidPDFException = InvalidPDFException;

var MissingPDFException = (function MissingPDFExceptionClosure() {
  function MissingPDFException(msg) {
    this.name = 'MissingPDFException';
    this.message = msg;
  }

  MissingPDFException.prototype = new Error();
  MissingPDFException.constructor = MissingPDFException;

  return MissingPDFException;
})();
PDFJS.MissingPDFException = MissingPDFException;

var UnexpectedResponseException =
    (function UnexpectedResponseExceptionClosure() {
  function UnexpectedResponseException(msg, status) {
    this.name = 'UnexpectedResponseException';
    this.message = msg;
    this.status = status;
  }

  UnexpectedResponseException.prototype = new Error();
  UnexpectedResponseException.constructor = UnexpectedResponseException;

  return UnexpectedResponseException;
})();
PDFJS.UnexpectedResponseException = UnexpectedResponseException;

var NotImplementedException = (function NotImplementedExceptionClosure() {
  function NotImplementedException(msg) {
    this.message = msg;
  }

  NotImplementedException.prototype = new Error();
  NotImplementedException.prototype.name = 'NotImplementedException';
  NotImplementedException.constructor = NotImplementedException;

  return NotImplementedException;
})();

var MissingDataException = (function MissingDataExceptionClosure() {
  function MissingDataException(begin, end) {
    this.begin = begin;
    this.end = end;
    this.message = 'Missing data [' + begin + ', ' + end + ')';
  }

  MissingDataException.prototype = new Error();
  MissingDataException.prototype.name = 'MissingDataException';
  MissingDataException.constructor = MissingDataException;

  return MissingDataException;
})();

var XRefParseException = (function XRefParseExceptionClosure() {
  function XRefParseException(msg) {
    this.message = msg;
  }

  XRefParseException.prototype = new Error();
  XRefParseException.prototype.name = 'XRefParseException';
  XRefParseException.constructor = XRefParseException;

  return XRefParseException;
})();


function bytesToString(bytes) {
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
  var length = str.length;
  var bytes = new Uint8Array(length);
  for (var i = 0; i < length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xFF;
  }
  return bytes;
}

function string32(value) {
  return String.fromCharCode((value >> 24) & 0xff, (value >> 16) & 0xff,
                             (value >> 8) & 0xff, value & 0xff);
}

function log2(x) {
  var n = 1, i = 0;
  while (x > n) {
    n <<= 1;
    i++;
  }
  return i;
}

function readInt8(data, start) {
  return (data[start] << 24) >> 24;
}

function readUint16(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) |
         (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

// Lazy test the endianness of the platform
// NOTE: This will be 'true' for simulated TypedArrays
function isLittleEndian() {
  var buffer8 = new Uint8Array(2);
  buffer8[0] = 1;
  var buffer16 = new Uint16Array(buffer8.buffer);
  return (buffer16[0] === 1);
}

Object.defineProperty(PDFJS, 'isLittleEndian', {
  configurable: true,
  get: function PDFJS_isLittleEndian() {
    return shadow(PDFJS, 'isLittleEndian', isLittleEndian());
  }
});

//#if !(FIREFOX || MOZCENTRAL || B2G || CHROME)
//// Lazy test if the userAgant support CanvasTypedArrays
function hasCanvasTypedArrays() {
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(1, 1);
  return (typeof imageData.data.buffer !== 'undefined');
}

Object.defineProperty(PDFJS, 'hasCanvasTypedArrays', {
  configurable: true,
  get: function PDFJS_hasCanvasTypedArrays() {
    return shadow(PDFJS, 'hasCanvasTypedArrays', hasCanvasTypedArrays());
  }
});

var Uint32ArrayView = (function Uint32ArrayViewClosure() {

  function Uint32ArrayView(buffer, length) {
    this.buffer = buffer;
    this.byteLength = buffer.length;
    this.length = length === undefined ? (this.byteLength >> 2) : length;
    ensureUint32ArrayViewProps(this.length);
  }
  Uint32ArrayView.prototype = Object.create(null);

  var uint32ArrayViewSetters = 0;
  function createUint32ArrayProp(index) {
    return {
      get: function () {
        var buffer = this.buffer, offset = index << 2;
        return (buffer[offset] | (buffer[offset + 1] << 8) |
          (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
      },
      set: function (value) {
        var buffer = this.buffer, offset = index << 2;
        buffer[offset] = value & 255;
        buffer[offset + 1] = (value >> 8) & 255;
        buffer[offset + 2] = (value >> 16) & 255;
        buffer[offset + 3] = (value >>> 24) & 255;
      }
    };
  }

  function ensureUint32ArrayViewProps(length) {
    while (uint32ArrayViewSetters < length) {
      Object.defineProperty(Uint32ArrayView.prototype,
        uint32ArrayViewSetters,
        createUint32ArrayProp(uint32ArrayViewSetters));
      uint32ArrayViewSetters++;
    }
  }

  return Uint32ArrayView;
})();
//#else
//PDFJS.hasCanvasTypedArrays = true;
//#endif

var IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];

var Util = PDFJS.Util = (function UtilClosure() {
  function Util() {}

  var rgbBuf = ['rgb(', 0, ',', 0, ',', 0, ')'];

  // makeCssRgb() can be called thousands of times. Using |rgbBuf| avoids
  // creating many intermediate strings.
  Util.makeCssRgb = function Util_makeCssRgb(rgb) {
    rgbBuf[1] = rgb[0];
    rgbBuf[3] = rgb[1];
    rgbBuf[5] = rgb[2];
    return rgbBuf.join('');
  };

  // Concatenates two transformation matrices together and returns the result.
  Util.transform = function Util_transform(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  };

  // For 2d affine transforms
  Util.applyTransform = function Util_applyTransform(p, m) {
    var xt = p[0] * m[0] + p[1] * m[2] + m[4];
    var yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  };

  Util.applyInverseTransform = function Util_applyInverseTransform(p, m) {
    var d = m[0] * m[3] - m[1] * m[2];
    var xt = (p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
    var yt = (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[5] * m[0]) / d;
    return [xt, yt];
  };

  // Applies the transform to the rectangle and finds the minimum axially
  // aligned bounding box.
  Util.getAxialAlignedBoundingBox =
    function Util_getAxialAlignedBoundingBox(r, m) {

    var p1 = Util.applyTransform(r, m);
    var p2 = Util.applyTransform(r.slice(2, 4), m);
    var p3 = Util.applyTransform([r[0], r[3]], m);
    var p4 = Util.applyTransform([r[2], r[1]], m);
    return [
      Math.min(p1[0], p2[0], p3[0], p4[0]),
      Math.min(p1[1], p2[1], p3[1], p4[1]),
      Math.max(p1[0], p2[0], p3[0], p4[0]),
      Math.max(p1[1], p2[1], p3[1], p4[1])
    ];
  };

  Util.inverseTransform = function Util_inverseTransform(m) {
    var d = m[0] * m[3] - m[1] * m[2];
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d,
      (m[2] * m[5] - m[4] * m[3]) / d, (m[4] * m[1] - m[5] * m[0]) / d];
  };

  // Apply a generic 3d matrix M on a 3-vector v:
  //   | a b c |   | X |
  //   | d e f | x | Y |
  //   | g h i |   | Z |
  // M is assumed to be serialized as [a,b,c,d,e,f,g,h,i],
  // with v as [X,Y,Z]
  Util.apply3dTransform = function Util_apply3dTransform(m, v) {
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
  };

  // This calculation uses Singular Value Decomposition.
  // The SVD can be represented with formula A = USV. We are interested in the
  // matrix S here because it represents the scale values.
  Util.singularValueDecompose2dScale =
    function Util_singularValueDecompose2dScale(m) {

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
  };

  // Normalize rectangle rect=[x1, y1, x2, y2] so that (x1,y1) < (x2,y2)
  // For coordinate systems whose origin lies in the bottom-left, this
  // means normalization to (BL,TR) ordering. For systems with origin in the
  // top-left, this means (TL,BR) ordering.
  Util.normalizeRect = function Util_normalizeRect(rect) {
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
  };

  // Returns a rectangle [x1, y1, x2, y2] corresponding to the
  // intersection of rect1 and rect2. If no intersection, returns 'false'
  // The rectangle coordinates of rect1, rect2 should be [x1, y1, x2, y2]
  Util.intersect = function Util_intersect(rect1, rect2) {
    function compare(a, b) {
      return a - b;
    }

    // Order points along the axes
    var orderedX = [rect1[0], rect1[2], rect2[0], rect2[2]].sort(compare),
        orderedY = [rect1[1], rect1[3], rect2[1], rect2[3]].sort(compare),
        result = [];

    rect1 = Util.normalizeRect(rect1);
    rect2 = Util.normalizeRect(rect2);

    // X: first and second points belong to different rectangles?
    if ((orderedX[0] === rect1[0] && orderedX[1] === rect2[0]) ||
        (orderedX[0] === rect2[0] && orderedX[1] === rect1[0])) {
      // Intersection must be between second and third points
      result[0] = orderedX[1];
      result[2] = orderedX[2];
    } else {
      return false;
    }

    // Y: first and second points belong to different rectangles?
    if ((orderedY[0] === rect1[1] && orderedY[1] === rect2[1]) ||
        (orderedY[0] === rect2[1] && orderedY[1] === rect1[1])) {
      // Intersection must be between second and third points
      result[1] = orderedY[1];
      result[3] = orderedY[2];
    } else {
      return false;
    }

    return result;
  };

  Util.sign = function Util_sign(num) {
    return num < 0 ? -1 : 1;
  };

  Util.appendToArray = function Util_appendToArray(arr1, arr2) {
    Array.prototype.push.apply(arr1, arr2);
  };

  Util.prependToArray = function Util_prependToArray(arr1, arr2) {
    Array.prototype.unshift.apply(arr1, arr2);
  };

  Util.extendObj = function extendObj(obj1, obj2) {
    for (var key in obj2) {
      obj1[key] = obj2[key];
    }
  };

  Util.getInheritableProperty = function Util_getInheritableProperty(dict,
                                                                     name) {
    while (dict && !dict.has(name)) {
      dict = dict.get('Parent');
    }
    if (!dict) {
      return null;
    }
    return dict.get(name);
  };

  Util.inherit = function Util_inherit(sub, base, prototype) {
    sub.prototype = Object.create(base.prototype);
    sub.prototype.constructor = sub;
    for (var prop in prototype) {
      sub.prototype[prop] = prototype[prop];
    }
  };

  Util.loadScript = function Util_loadScript(src, callback) {
    var script = document.createElement('script');
    var loaded = false;
    script.setAttribute('src', src);
    if (callback) {
      script.onload = function() {
        if (!loaded) {
          callback();
        }
        loaded = true;
      };
    }
    document.getElementsByTagName('head')[0].appendChild(script);
  };

  return Util;
})();

/**
 * PDF page viewport created based on scale, rotation and offset.
 * @class
 * @alias PDFJS.PageViewport
 */
var PageViewport = PDFJS.PageViewport = (function PageViewportClosure() {
  /**
   * @constructor
   * @private
   * @param viewBox {Array} xMin, yMin, xMax and yMax coordinates.
   * @param scale {number} scale of the viewport.
   * @param rotation {number} rotations of the viewport in degrees.
   * @param offsetX {number} offset X
   * @param offsetY {number} offset Y
   * @param dontFlip {boolean} if true, axis Y will not be flipped.
   */
  function PageViewport(viewBox, scale, rotation, offsetX, offsetY, dontFlip) {
    this.viewBox = viewBox;
    this.scale = scale;
    this.rotation = rotation;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    // creating transform to convert pdf coordinate system to the normal
    // canvas like coordinates taking in account scale and rotation
    var centerX = (viewBox[2] + viewBox[0]) / 2;
    var centerY = (viewBox[3] + viewBox[1]) / 2;
    var rotateA, rotateB, rotateC, rotateD;
    rotation = rotation % 360;
    rotation = rotation < 0 ? rotation + 360 : rotation;
    switch (rotation) {
      case 180:
        rotateA = -1; rotateB = 0; rotateC = 0; rotateD = 1;
        break;
      case 90:
        rotateA = 0; rotateB = 1; rotateC = 1; rotateD = 0;
        break;
      case 270:
        rotateA = 0; rotateB = -1; rotateC = -1; rotateD = 0;
        break;
      //case 0:
      default:
        rotateA = 1; rotateB = 0; rotateC = 0; rotateD = -1;
        break;
    }

    if (dontFlip) {
      rotateC = -rotateC; rotateD = -rotateD;
    }

    var offsetCanvasX, offsetCanvasY;
    var width, height;
    if (rotateA === 0) {
      offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
      width = Math.abs(viewBox[3] - viewBox[1]) * scale;
      height = Math.abs(viewBox[2] - viewBox[0]) * scale;
    } else {
      offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
      width = Math.abs(viewBox[2] - viewBox[0]) * scale;
      height = Math.abs(viewBox[3] - viewBox[1]) * scale;
    }
    // creating transform for the following operations:
    // translate(-centerX, -centerY), rotate and flip vertically,
    // scale, and translate(offsetCanvasX, offsetCanvasY)
    this.transform = [
      rotateA * scale,
      rotateB * scale,
      rotateC * scale,
      rotateD * scale,
      offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
      offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY
    ];

    this.width = width;
    this.height = height;
    this.fontScale = scale;
  }
  PageViewport.prototype = /** @lends PDFJS.PageViewport.prototype */ {
    /**
     * Clones viewport with additional properties.
     * @param args {Object} (optional) If specified, may contain the 'scale' or
     * 'rotation' properties to override the corresponding properties in
     * the cloned viewport.
     * @returns {PDFJS.PageViewport} Cloned viewport.
     */
    clone: function PageViewPort_clone(args) {
      args = args || {};
      var scale = 'scale' in args ? args.scale : this.scale;
      var rotation = 'rotation' in args ? args.rotation : this.rotation;
      return new PageViewport(this.viewBox.slice(), scale, rotation,
                              this.offsetX, this.offsetY, args.dontFlip);
    },
    /**
     * Converts PDF point to the viewport coordinates. For examples, useful for
     * converting PDF location into canvas pixel coordinates.
     * @param x {number} X coordinate.
     * @param y {number} Y coordinate.
     * @returns {Object} Object that contains 'x' and 'y' properties of the
     * point in the viewport coordinate space.
     * @see {@link convertToPdfPoint}
     * @see {@link convertToViewportRectangle}
     */
    convertToViewportPoint: function PageViewport_convertToViewportPoint(x, y) {
      return Util.applyTransform([x, y], this.transform);
    },
    /**
     * Converts PDF rectangle to the viewport coordinates.
     * @param rect {Array} xMin, yMin, xMax and yMax coordinates.
     * @returns {Array} Contains corresponding coordinates of the rectangle
     * in the viewport coordinate space.
     * @see {@link convertToViewportPoint}
     */
    convertToViewportRectangle:
      function PageViewport_convertToViewportRectangle(rect) {
      var tl = Util.applyTransform([rect[0], rect[1]], this.transform);
      var br = Util.applyTransform([rect[2], rect[3]], this.transform);
      return [tl[0], tl[1], br[0], br[1]];
    },
    /**
     * Converts viewport coordinates to the PDF location. For examples, useful
     * for converting canvas pixel location into PDF one.
     * @param x {number} X coordinate.
     * @param y {number} Y coordinate.
     * @returns {Object} Object that contains 'x' and 'y' properties of the
     * point in the PDF coordinate space.
     * @see {@link convertToViewportPoint}
     */
    convertToPdfPoint: function PageViewport_convertToPdfPoint(x, y) {
      return Util.applyInverseTransform([x, y], this.transform);
    }
  };
  return PageViewport;
})();

var PDFStringTranslateTable = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0x2D8, 0x2C7, 0x2C6, 0x2D9, 0x2DD, 0x2DB, 0x2DA, 0x2DC, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2022, 0x2020, 0x2021, 0x2026, 0x2014,
  0x2013, 0x192, 0x2044, 0x2039, 0x203A, 0x2212, 0x2030, 0x201E, 0x201C,
  0x201D, 0x2018, 0x2019, 0x201A, 0x2122, 0xFB01, 0xFB02, 0x141, 0x152, 0x160,
  0x178, 0x17D, 0x131, 0x142, 0x153, 0x161, 0x17E, 0, 0x20AC
];

function stringToPDFString(str) {
  var i, n = str.length, strBuf = [];
  if (str[0] === '\xFE' && str[1] === '\xFF') {
    // UTF16BE BOM
    for (i = 2; i < n; i += 2) {
      strBuf.push(String.fromCharCode(
        (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1)));
    }
  } else {
    for (i = 0; i < n; ++i) {
      var code = PDFStringTranslateTable[str.charCodeAt(i)];
      strBuf.push(code ? String.fromCharCode(code) : str.charAt(i));
    }
  }
  return strBuf.join('');
}

function stringToUTF8String(str) {
  return decodeURIComponent(escape(str));
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

function isInt(v) {
  return typeof v === 'number' && ((v | 0) === v);
}

function isNum(v) {
  return typeof v === 'number';
}

function isString(v) {
  return typeof v === 'string';
}

function isNull(v) {
  return v === null;
}

function isName(v) {
  return v instanceof Name;
}

function isCmd(v, cmd) {
  return v instanceof Cmd && (cmd === undefined || v.cmd === cmd);
}

function isDict(v, type) {
  if (!(v instanceof Dict)) {
    return false;
  }
  if (!type) {
    return true;
  }
  var dictType = v.get('Type');
  return isName(dictType) && dictType.name === type;
}

function isArray(v) {
  return v instanceof Array;
}

function isStream(v) {
  return typeof v === 'object' && v !== null && v.getBytes !== undefined;
}

function isArrayBuffer(v) {
  return typeof v === 'object' && v !== null && v.byteLength !== undefined;
}

function isRef(v) {
  return v instanceof Ref;
}

/**
 * Promise Capability object.
 *
 * @typedef {Object} PromiseCapability
 * @property {Promise} promise - A promise object.
 * @property {function} resolve - Fullfills the promise.
 * @property {function} reject - Rejects the promise.
 */

/**
 * Creates a promise capability object.
 * @alias PDFJS.createPromiseCapability
 *
 * @return {PromiseCapability} A capability object contains:
 * - a Promise, resolve and reject methods.
 */
function createPromiseCapability() {
  var capability = {};
  capability.promise = new Promise(function (resolve, reject) {
    capability.resolve = resolve;
    capability.reject = reject;
  });
  return capability;
}

PDFJS.createPromiseCapability = createPromiseCapability;

/**
 * Polyfill for Promises:
 * The following promise implementation tries to generally implement the
 * Promise/A+ spec. Some notable differences from other promise libaries are:
 * - There currently isn't a seperate deferred and promise object.
 * - Unhandled rejections eventually show an error if they aren't handled.
 *
 * Based off of the work in:
 * https://bugzilla.mozilla.org/show_bug.cgi?id=810490
 */
(function PromiseClosure() {
  if (globalScope.Promise) {
    // Promises existing in the DOM/Worker, checking presence of all/resolve
    if (typeof globalScope.Promise.all !== 'function') {
      globalScope.Promise.all = function (iterable) {
        var count = 0, results = [], resolve, reject;
        var promise = new globalScope.Promise(function (resolve_, reject_) {
          resolve = resolve_;
          reject = reject_;
        });
        iterable.forEach(function (p, i) {
          count++;
          p.then(function (result) {
            results[i] = result;
            count--;
            if (count === 0) {
              resolve(results);
            }
          }, reject);
        });
        if (count === 0) {
          resolve(results);
        }
        return promise;
      };
    }
    if (typeof globalScope.Promise.resolve !== 'function') {
      globalScope.Promise.resolve = function (value) {
        return new globalScope.Promise(function (resolve) { resolve(value); });
      };
    }
    if (typeof globalScope.Promise.reject !== 'function') {
      globalScope.Promise.reject = function (reason) {
        return new globalScope.Promise(function (resolve, reject) {
          reject(reason);
        });
      };
    }
    if (typeof globalScope.Promise.prototype.catch !== 'function') {
      globalScope.Promise.prototype.catch = function (onReject) {
        return globalScope.Promise.prototype.then(undefined, onReject);
      };
    }
    return;
  }
//#if !MOZCENTRAL
  var STATUS_PENDING = 0;
  var STATUS_RESOLVED = 1;
  var STATUS_REJECTED = 2;

  // In an attempt to avoid silent exceptions, unhandled rejections are
  // tracked and if they aren't handled in a certain amount of time an
  // error is logged.
  var REJECTION_TIMEOUT = 500;

  var HandlerManager = {
    handlers: [],
    running: false,
    unhandledRejections: [],
    pendingRejectionCheck: false,

    scheduleHandlers: function scheduleHandlers(promise) {
      if (promise._status === STATUS_PENDING) {
        return;
      }

      this.handlers = this.handlers.concat(promise._handlers);
      promise._handlers = [];

      if (this.running) {
        return;
      }
      this.running = true;

      setTimeout(this.runHandlers.bind(this), 0);
    },

    runHandlers: function runHandlers() {
      var RUN_TIMEOUT = 1; // ms
      var timeoutAt = Date.now() + RUN_TIMEOUT;
      while (this.handlers.length > 0) {
        var handler = this.handlers.shift();

        var nextStatus = handler.thisPromise._status;
        var nextValue = handler.thisPromise._value;

        try {
          if (nextStatus === STATUS_RESOLVED) {
            if (typeof handler.onResolve === 'function') {
              nextValue = handler.onResolve(nextValue);
            }
          } else if (typeof handler.onReject === 'function') {
              nextValue = handler.onReject(nextValue);
              nextStatus = STATUS_RESOLVED;

              if (handler.thisPromise._unhandledRejection) {
                this.removeUnhandeledRejection(handler.thisPromise);
              }
          }
        } catch (ex) {
          nextStatus = STATUS_REJECTED;
          nextValue = ex;
        }

        handler.nextPromise._updateStatus(nextStatus, nextValue);
        if (Date.now() >= timeoutAt) {
          break;
        }
      }

      if (this.handlers.length > 0) {
        setTimeout(this.runHandlers.bind(this), 0);
        return;
      }

      this.running = false;
    },

    addUnhandledRejection: function addUnhandledRejection(promise) {
      this.unhandledRejections.push({
        promise: promise,
        time: Date.now()
      });
      this.scheduleRejectionCheck();
    },

    removeUnhandeledRejection: function removeUnhandeledRejection(promise) {
      promise._unhandledRejection = false;
      for (var i = 0; i < this.unhandledRejections.length; i++) {
        if (this.unhandledRejections[i].promise === promise) {
          this.unhandledRejections.splice(i);
          i--;
        }
      }
    },

    scheduleRejectionCheck: function scheduleRejectionCheck() {
      if (this.pendingRejectionCheck) {
        return;
      }
      this.pendingRejectionCheck = true;
      setTimeout(function rejectionCheck() {
        this.pendingRejectionCheck = false;
        var now = Date.now();
        for (var i = 0; i < this.unhandledRejections.length; i++) {
          if (now - this.unhandledRejections[i].time > REJECTION_TIMEOUT) {
            var unhandled = this.unhandledRejections[i].promise._value;
            var msg = 'Unhandled rejection: ' + unhandled;
            if (unhandled.stack) {
              msg += '\n' + unhandled.stack;
            }
            warn(msg);
            this.unhandledRejections.splice(i);
            i--;
          }
        }
        if (this.unhandledRejections.length) {
          this.scheduleRejectionCheck();
        }
      }.bind(this), REJECTION_TIMEOUT);
    }
  };

  function Promise(resolver) {
    this._status = STATUS_PENDING;
    this._handlers = [];
    try {
      resolver.call(this, this._resolve.bind(this), this._reject.bind(this));
    } catch (e) {
      this._reject(e);
    }
  }
  /**
   * Builds a promise that is resolved when all the passed in promises are
   * resolved.
   * @param {array} array of data and/or promises to wait for.
   * @return {Promise} New dependant promise.
   */
  Promise.all = function Promise_all(promises) {
    var resolveAll, rejectAll;
    var deferred = new Promise(function (resolve, reject) {
      resolveAll = resolve;
      rejectAll = reject;
    });
    var unresolved = promises.length;
    var results = [];
    if (unresolved === 0) {
      resolveAll(results);
      return deferred;
    }
    function reject(reason) {
      if (deferred._status === STATUS_REJECTED) {
        return;
      }
      results = [];
      rejectAll(reason);
    }
    for (var i = 0, ii = promises.length; i < ii; ++i) {
      var promise = promises[i];
      var resolve = (function(i) {
        return function(value) {
          if (deferred._status === STATUS_REJECTED) {
            return;
          }
          results[i] = value;
          unresolved--;
          if (unresolved === 0) {
            resolveAll(results);
          }
        };
      })(i);
      if (Promise.isPromise(promise)) {
        promise.then(resolve, reject);
      } else {
        resolve(promise);
      }
    }
    return deferred;
  };

  /**
   * Checks if the value is likely a promise (has a 'then' function).
   * @return {boolean} true if value is thenable
   */
  Promise.isPromise = function Promise_isPromise(value) {
    return value && typeof value.then === 'function';
  };

  /**
   * Creates resolved promise
   * @param value resolve value
   * @returns {Promise}
   */
  Promise.resolve = function Promise_resolve(value) {
    return new Promise(function (resolve) { resolve(value); });
  };

  /**
   * Creates rejected promise
   * @param reason rejection value
   * @returns {Promise}
   */
  Promise.reject = function Promise_reject(reason) {
    return new Promise(function (resolve, reject) { reject(reason); });
  };

  Promise.prototype = {
    _status: null,
    _value: null,
    _handlers: null,
    _unhandledRejection: null,

    _updateStatus: function Promise__updateStatus(status, value) {
      if (this._status === STATUS_RESOLVED ||
          this._status === STATUS_REJECTED) {
        return;
      }

      if (status === STATUS_RESOLVED &&
          Promise.isPromise(value)) {
        value.then(this._updateStatus.bind(this, STATUS_RESOLVED),
                   this._updateStatus.bind(this, STATUS_REJECTED));
        return;
      }

      this._status = status;
      this._value = value;

      if (status === STATUS_REJECTED && this._handlers.length === 0) {
        this._unhandledRejection = true;
        HandlerManager.addUnhandledRejection(this);
      }

      HandlerManager.scheduleHandlers(this);
    },

    _resolve: function Promise_resolve(value) {
      this._updateStatus(STATUS_RESOLVED, value);
    },

    _reject: function Promise_reject(reason) {
      this._updateStatus(STATUS_REJECTED, reason);
    },

    then: function Promise_then(onResolve, onReject) {
      var nextPromise = new Promise(function (resolve, reject) {
        this.resolve = resolve;
        this.reject = reject;
      });
      this._handlers.push({
        thisPromise: this,
        onResolve: onResolve,
        onReject: onReject,
        nextPromise: nextPromise
      });
      HandlerManager.scheduleHandlers(this);
      return nextPromise;
    },

    catch: function Promise_catch(onReject) {
      return this.then(undefined, onReject);
    }
  };

  globalScope.Promise = Promise;
//#else
//throw new Error('DOM Promise is not present');
//#endif
})();

var StatTimer = (function StatTimerClosure() {
  function rpad(str, pad, length) {
    while (str.length < length) {
      str += pad;
    }
    return str;
  }
  function StatTimer() {
    this.started = {};
    this.times = [];
    this.enabled = true;
  }
  StatTimer.prototype = {
    time: function StatTimer_time(name) {
      if (!this.enabled) {
        return;
      }
      if (name in this.started) {
        warn('Timer is already running for ' + name);
      }
      this.started[name] = Date.now();
    },
    timeEnd: function StatTimer_timeEnd(name) {
      if (!this.enabled) {
        return;
      }
      if (!(name in this.started)) {
        warn('Timer has not been started for ' + name);
      }
      this.times.push({
        'name': name,
        'start': this.started[name],
        'end': Date.now()
      });
      // Remove timer from started so it can be called again.
      delete this.started[name];
    },
    toString: function StatTimer_toString() {
      var i, ii;
      var times = this.times;
      var out = '';
      // Find the longest name for padding purposes.
      var longest = 0;
      for (i = 0, ii = times.length; i < ii; ++i) {
        var name = times[i]['name'];
        if (name.length > longest) {
          longest = name.length;
        }
      }
      for (i = 0, ii = times.length; i < ii; ++i) {
        var span = times[i];
        var duration = span.end - span.start;
        out += rpad(span['name'], ' ', longest) + ' ' + duration + 'ms\n';
      }
      return out;
    }
  };
  return StatTimer;
})();

PDFJS.createBlob = function createBlob(data, contentType) {
  if (typeof Blob !== 'undefined') {
    return new Blob([data], { type: contentType });
  }
  // Blob builder is deprecated in FF14 and removed in FF18.
  var bb = new MozBlobBuilder();
  bb.append(data);
  return bb.getBlob(contentType);
};

PDFJS.createObjectURL = (function createObjectURLClosure() {
  // Blob/createObjectURL is not available, falling back to data schema.
  var digits =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  return function createObjectURL(data, contentType) {
    if (!PDFJS.disableCreateObjectURL &&
        typeof URL !== 'undefined' && URL.createObjectURL) {
      var blob = PDFJS.createBlob(data, contentType);
      return URL.createObjectURL(blob);
    }

    var buffer = 'data:' + contentType + ';base64,';
    for (var i = 0, ii = data.length; i < ii; i += 3) {
      var b1 = data[i] & 0xFF;
      var b2 = data[i + 1] & 0xFF;
      var b3 = data[i + 2] & 0xFF;
      var d1 = b1 >> 2, d2 = ((b1 & 3) << 4) | (b2 >> 4);
      var d3 = i + 1 < ii ? ((b2 & 0xF) << 2) | (b3 >> 6) : 64;
      var d4 = i + 2 < ii ? (b3 & 0x3F) : 64;
      buffer += digits[d1] + digits[d2] + digits[d3] + digits[d4];
    }
    return buffer;
  };
})();

function MessageHandler(name, comObj) {
  this.name = name;
  this.comObj = comObj;
  this.callbackIndex = 1;
  this.postMessageTransfers = true;
  var callbacksCapabilities = this.callbacksCapabilities = {};
  var ah = this.actionHandler = {};

  ah['console_log'] = [function ahConsoleLog(data) {
    console.log.apply(console, data);
  }];
  ah['console_error'] = [function ahConsoleError(data) {
    console.error.apply(console, data);
  }];
  ah['_unsupported_feature'] = [function ah_unsupportedFeature(data) {
    UnsupportedManager.notify(data);
  }];

  comObj.onmessage = function messageHandlerComObjOnMessage(event) {
    var data = event.data;
    if (data.isReply) {
      var callbackId = data.callbackId;
      if (data.callbackId in callbacksCapabilities) {
        var callback = callbacksCapabilities[callbackId];
        delete callbacksCapabilities[callbackId];
        if ('error' in data) {
          callback.reject(data.error);
        } else {
          callback.resolve(data.data);
        }
      } else {
        error('Cannot resolve callback ' + callbackId);
      }
    } else if (data.action in ah) {
      var action = ah[data.action];
      if (data.callbackId) {
        Promise.resolve().then(function () {
          return action[0].call(action[1], data.data);
        }).then(function (result) {
          comObj.postMessage({
            isReply: true,
            callbackId: data.callbackId,
            data: result
          });
        }, function (reason) {
          comObj.postMessage({
            isReply: true,
            callbackId: data.callbackId,
            error: reason
          });
        });
      } else {
        action[0].call(action[1], data.data);
      }
    } else {
      error('Unknown action from worker: ' + data.action);
    }
  };
}

MessageHandler.prototype = {
  on: function messageHandlerOn(actionName, handler, scope) {
    var ah = this.actionHandler;
    if (ah[actionName]) {
      error('There is already an actionName called "' + actionName + '"');
    }
    ah[actionName] = [handler, scope];
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * @param {String} actionName Action to call.
   * @param {JSON} data JSON data to send.
   * @param {Array} [transfers] Optional list of transfers/ArrayBuffers
   */
  send: function messageHandlerSend(actionName, data, transfers) {
    var message = {
      action: actionName,
      data: data
    };
    this.postMessage(message, transfers);
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * Expects that other side will callback with the response.
   * @param {String} actionName Action to call.
   * @param {JSON} data JSON data to send.
   * @param {Array} [transfers] Optional list of transfers/ArrayBuffers.
   * @returns {Promise} Promise to be resolved with response data.
   */
  sendWithPromise:
    function messageHandlerSendWithPromise(actionName, data, transfers) {
    var callbackId = this.callbackIndex++;
    var message = {
      action: actionName,
      data: data,
      callbackId: callbackId
    };
    var capability = createPromiseCapability();
    this.callbacksCapabilities[callbackId] = capability;
    try {
      this.postMessage(message, transfers);
    } catch (e) {
      capability.reject(e);
    }
    return capability.promise;
  },
  /**
   * Sends raw message to the comObj.
   * @private
   * @param message {Object} Raw message.
   * @param transfers List of transfers/ArrayBuffers, or undefined.
   */
  postMessage: function (message, transfers) {
    if (transfers && this.postMessageTransfers) {
      this.comObj.postMessage(message, transfers);
    } else {
      this.comObj.postMessage(message);
    }
  }
};

function loadJpegStream(id, imageUrl, objs) {
  var img = new Image();
  img.onload = (function loadJpegStream_onloadClosure() {
    objs.resolve(id, img);
  });
  img.onerror = (function loadJpegStream_onerrorClosure() {
    objs.resolve(id, null);
    warn('Error during JPEG image loading');
  });
  img.src = imageUrl;
}

var w=v();self.asyncProxyScriptBlob=new w;
function v(){function b(){this.b=["'use strict';"];this.v=this.h=null;this.g(v,"BlobScriptGenerator");this.l("var asyncProxyScriptBlob = new BlobScriptGenerator();")}b.prototype.g=function(b,e){if(this.h)throw Error("Cannot add member to AsyncProxyScriptBlob after blob was used");e&&(this.b.push("var "),this.b.push(e),this.b.push(" = "));this.b.push("(");this.b.push(b.toString());this.b.push(")();")};b.prototype.l=function(b){if(this.h)throw Error("Cannot add statement to AsyncProxyScriptBlob after blob was used");this.b.push(b)};
b.prototype.getBlob=function(){this.h||(this.h=new Blob(this.b,{type:"application/javascript"}));return this.h};b.prototype.X=function(){this.v||(this.v=URL.createObjectURL(this.getBlob()));return this.v};return b};function x(){function b(b){if(null===e)throw"AsyncProxy internal error: SubWorkerEmulationForChrome not initialized";this.s=++d;e[this.s]=this;self.postMessage({type:"subWorkerCtor",f:this.s,da:b})}var d=0,e=null;b.Z=function(b){e=b};b.prototype.postMessage=function(b,d){self.postMessage({type:"subWorkerPostMessage",f:this.s,data:b},d)};b.prototype.terminate=function(b,d){self.postMessage({type:"subWorkerTerminate",f:this.s},d)};self.asyncProxyScriptBlob.g(x,"SubWorkerEmulationForChrome");return b}
var y=x();function z(){function b(a,g,c,u){var l=this;u=u||{};var f=d.toString(),f=f.replace("SCRIPT_PLACEHOLDER",m.X()),f=URL.createObjectURL(new Blob(["(",f,")()"],{type:"application/javascript"}));l.m=[];l.i=[];l.C=[];l.D=[];l.u=new Worker(f);l.u.onmessage=function(a){e(l,a)};l.F=null;l.o=0;l.I=u.functionsBufferSize||5;l.A=[];l.u.postMessage({G:"ctor",ea:a,W:g,c:c,a:++r,M:!1,ba:b.L()})}function d(){importScripts("SCRIPT_PLACEHOLDER");AsyncProxy.AsyncProxySlave=self.AsyncProxy.AsyncProxySlaveSingleton;AsyncProxy.AsyncProxySlave.R()}
function e(a,g){var c=g.data.a;switch(g.data.type){case "functionCalled":--a.o;n(a);break;case "promiseResult":var b=a.i[c];delete a.i[c];b.resolve(g.data.result);break;case "promiseFailure":b=a.i[c];delete a.i[c];b.reject(g.data.reason);break;case "userData":null!==a.F&&a.F(g.data.ka);break;case "callback":c=a.m[g.data.a];if(void 0===c)throw"Unexpected message from SlaveWorker of callback ID: "+g.data.a+". Maybe should indicate isMultipleTimesCallback = true on creation?";c.H||a.K(a.m[g.data.a]);
null!==c.J&&c.J.apply(null,g.data.c);break;case "subWorkerCtor":var c=new Worker(g.data.da),d=g.data.f;a.C[d]=c;a.D.push(c);c.onmessage=function(c){f(a,c.ports,!1,{G:"subWorkerOnMessage",f:d,data:c.data})};break;case "subWorkerPostMessage":c=a.C[g.data.f];c.postMessage(g.data.data);break;case "subWorkerTerminate":c=a.C[g.data.f];c.terminate();break;default:throw"Unknown message from AsyncProxySlave of type: "+g.data.type;}}function f(a,g,c,b){a.o>=a.I?a.A.push({ja:g,$:c,message:b}):k(a,g,c,b)}function k(a,
g,c,b){c&&++a.o;a.u.postMessage(b,g)}function n(a){for(;a.o<a.I&&0<a.A.length;){var b=a.A.shift();k(a,b.ja,b.$,b.message)}}var m=self.asyncProxyScriptBlob,r=0,t=!1,p=function(){var a=location.href,b=a.lastIndexOf("/");0<=b&&(a=a.substring(0,b));return a}();b.prototype.ia=function(a){this.F=a};b.prototype.terminate=function(){this.u.terminate();for(var a=0;a<this.D.length;++a)this.D[a].terminate()};b.prototype.U=function(a,b,c){c=c||{};var d=!!c.isReturnPromise,e=c.transferables,m=c.pathsToTransferablesInPromiseResult,
h=++r,q=null,p=this;d&&(q=new Promise(function(a,c){p.i[h]={resolve:a,reject:c}}));(c.isSendImmediately?k:f)(this,e,!0,{G:a,c:b||[],a:h,M:d,ca:m});if(d)return q};b.prototype.la=function(a,b,c){c=c||{};var d=++r;b={aa:!0,H:!!c.isMultipleTimeCallback,a:d,V:b,N:c.pathsToTransferables};this.m[d]={H:!!c.isMultipleTimeCallback,a:d,J:a,N:c.pathsToTransferables};return b};b.prototype.K=function(a){delete this.m[a.a]};b.L=function(){t=!0;return p};b.S=function(a){if(p!==a&&t)throw"Previous values returned from getMasterEntryUrl is wrong. Avoid calling it within the slave c`tor";
p=a};m.g(z,"AsyncProxyMaster");return b}var A=z();function B(){function b(){for(var a=t.split("."),b=self,c=0;c<a.length;++c)b=b[a[c]];a=b;b=[null].concat(f(arguments));return new (Function.prototype.bind.apply(a,b))}function d(a,b){if(void 0!==a){for(var c=Array(a.length),d=0;d<a.length;++d){for(var e=a[d],f=b,h=0;h<e.length;++h)f=f[e[h]];c[d]=f}return c}}function e(a){var d=a.data.G,c=a.data.c,e=a.data.a,f=a.data.M,p=a.data.ca;switch(d){case "ctor":self.AsyncProxy.AsyncProxyMaster.S(a.data.ba);e=a.data.ea;t=a.data.W;for(var h=0;h<e.length;++h)importScripts(e[h]);
m=b.apply(null,c);return;case "subWorkerOnMessage":r[a.data.f].onmessage({data:a.data.data});return}c=Array(a.data.c.length);for(h=0;h<a.data.c.length;++h){var q=a.data.c[h];void 0!==q&&null!==q&&q.aa&&(q=k.O(q));c[h]=q}for(var h=m,n;h&&!(n=m[d]);)h=h.__proto__;if(!n)throw"AsyncProxy error: could not find function "+n;c=n.apply(m,c);f&&k.P(e,c,p);self.postMessage({type:"functionCalled",a:a.data.a,result:null})}function f(a){for(var b=Array(a.length),c=0;c<a.length;++c)b[c]=a[c];return b}var k={},
n=null,m,r={},t;k.R=function(){self.onmessage=e};k.ha=function(a){b=a};k.ga=function(a){n=a};k.fa=function(a){self.postMessage({type:"userData",ka:a})};k.P=function(a,b,c){b.then(function(b){var e=d(c,b);self.postMessage({type:"promiseResult",a:a,result:b},e)})["catch"](function(b){self.postMessage({type:"promiseFailure",a:a,reason:b})})};k.O=function(a){var b=!1;return function(){if(b)throw"Callback is called twice but isMultipleTimeCallback = false";var c=f(arguments);if(null!==n)try{n.call(m,"callback",
a.V,c)}catch(e){console.log("AsyncProxySlave.beforeOperationListener has thrown an exception: "+e)}var k=d(a.N,c);self.postMessage({type:"callback",a:a.a,c:c},k);a.H||(b=!0)}};k.w=function(){return C.w(Error())};if(void 0===self.Worker){var p=self.SubWorkerEmulationForChrome;p.Z(r);self.Worker=p}self.asyncProxyScriptBlob.g(B,"AsyncProxySlaveSingleton");return k}var D=B();function E(){function b(){this.B={};this.j=null}b.prototype.T=function(d){d=b.w(d);this.B[d]||(this.B[d]=!0,this.j=null)};b.prototype.Y=function(){if(null===this.j){this.j=[];for(var b in this.B)this.j.push(b)}return this.j};b.w=function(b){var e=b.stack.trim(),f=/at (|[^ ]+ \()([^ ]+):\d+:\d+/.exec(e);if(f&&""!==f[2])return f[2];if((f=(new RegExp(/.+\/(.*?):\d+(:\d+)*$/)).exec(e))&&""!==f[1])return f[1];if(void 0!=b.fileName)return b.fileName;throw"ImageDecoderFramework.js: Could not get current script URL";
};self.asyncProxyScriptBlob.g(E,"ScriptsToImportPool");return b}var C=E();function F(){asyncProxyScriptBlob.g(F,"ExportAsyncProxySymbols");asyncProxyScriptBlob.l("ExportAsyncProxySymbols(SubWorkerEmulationForChrome, AsyncProxySlaveSingleton, AsyncProxyMaster, ScriptsToImportPool);");asyncProxyScriptBlob.l("self['AsyncProxy']['AsyncProxySlaveSingleton'] = AsyncProxySlaveSingleton;");asyncProxyScriptBlob.l("self['AsyncProxy']['AsyncProxyMaster'] = AsyncProxyMaster;");asyncProxyScriptBlob.l("self['AsyncProxy']['ScriptsToImportPool'] = ScriptsToImportPool;");return function(b,
d,e,f){self.AsyncProxy=self.AsyncProxy||{};b.prototype.postMessage=b.prototype.postMessage;b.prototype.terminate=b.prototype.terminate;d.setSlaveSideCreator=d.ha;d.setBeforeOperationListener=d.ga;d.sendUserDataToMaster=d.fa;d.wrapPromiseFromSlaveSide=d.P;d.wrapCallbackFromSlaveSide=d.O;e.prototype.setUserDataHandler=e.prototype.ia;e.prototype.terminate=e.prototype.terminate;e.prototype.callFunction=e.prototype.U;e.prototype.wrapCallback=e.prototype.la;e.prototype.freeCallback=e.prototype.K;e.getEntryUrl=
e.L;f.prototype.addScriptFromErrorWithStackTrace=f.prototype.T;f.prototype.getScriptsForWorkerImport=f.prototype.Y}}F()(y,D,A,C);self.AsyncProxy.AsyncProxySlaveSingleton=D;self.AsyncProxy.AsyncProxyMaster=A;self.AsyncProxy.ScriptsToImportPool=C;

var n=function(){function b(e,g){this.w=e;this.d=this.m=g;this.l=Array(this.m);this.v=[]}b.prototype={B:function(e,g){if(0<this.d){--this.d;var b=this.l.pop();void 0===b&&(b=this.w());e(b,g)}else this.v.push({t:e,f:g})},F:function(e){if(0<this.v.length){var b=this.v.pop();b.t(e,b.f)}else this.l.push(e),++this.d},G:function(){return!1}};return b}();var p=function(){function b(){this.p={g:null,q:this};this.n={i:null,q:this};this.h=0;this.n.g=this.p;this.p.i=this.n}b.prototype.add=function(e,b){if(null===b||void 0===b)b=this.n;this.o(b);++this.h;var l={K:e,i:b,g:b.g,q:this};l.g.i=l;return b.g=l};b.prototype.remove=function(e){this.o(e);--this.h;e.g.i=e.i;e.i.g=e.g;e.q=null};b.prototype.D=function(e){this.o(e);return e.K};b.prototype.C=function(){return this.r(this.p)};b.prototype.L=function(){return this.M(this.n)};b.prototype.r=function(e){this.o(e);
return e.i===this.n?null:e.i};b.prototype.M=function(e){this.o(e);return e.g===this.p?null:e.g};b.prototype.o=function(e){if(e.q!==this)throw"iterator must be of the current LinkedList";};return b}();var u=function(){function b(a,h,c,d){d=d||{};this.w=a;this.m=h;this.k=c;this.e=d.showLog;this.c=d.schedulerName;this.u=d.numNewJobs||20;this.J=d.numJobsBeforeRerankOldPriorities||20;this.d=this.m;this.l=Array(this.m);this.H=d.resourcesGuaranteedForHighPriority||0;this.j=0;this.b=[];this.a=new p;this.A=0}function e(a,h){for(var c=null,d=h,e=[],f=a.a.C();null!==f;){var b=a.a.r(f),m=a.a.D(f),g=a.k.getPriority(m.f);if(0>g)q(a,f),--a.j,m.s(m.f);else{if(void 0===d||g>d)d=g,c=f;a.e&&(void 0===e[g]?e[g]=
1:++e[g])}f=b}f=null;null!==c&&(f=q(a,c),--a.j);if(a.e){b=c="";void 0!==a.c&&(c=a.c+"'s ",b=a.c+"'s ");c+="Jobs list:";for(m=0;m<e.length;++m)void 0!==e[m]&&(c+=e[m]+" jobs of priority "+m+";");console.log(c);null!==f&&console.log(b+(" dequeued new job of priority "+d))}k(a);return f}function g(a,h,c){++a.j;var d=a.a.C();a.a.add(h,d);t(a);a.e&&(h="",void 0!==a.c&&(h=a.c+"'s "),console.log(h+(" enqueued job of priority "+c)));a.a.h<=a.u||(c=a.a.L(),c=q(a,c),l(a,c));k(a)}function l(a,h){var c=a.k.getPriority(h.f);
0>c?(--a.j,h.s(h.f)):(void 0===a.b[c]&&(a.b[c]=[]),a.b[c].push(h))}function v(a,h){++a.d;var c=a.d<=a.H?a.I:0;--a.d;c=e(a,c);if(null!==c)k(a),r(a,c,h);else if(a.j>a.a.h)a.l.push(h),++a.d;else{for(var d,b=a.b.length-1;0<=b;--b){var f=a.b[b];if(void 0!==f&&0!==f.length){for(var g=f.length-1;0<=g;--g){c=f[g];d=a.k.getPriority(c.f);if(d>=b){f.length=g;break}else 0>d?(--a.j,c.s(c.f)):(void 0===a.b[d]&&(a.b[d]=[]),a.b[d].push(c));c=null}if(null!==c)break;f.length=0}}null===c?(a.l.push(h),++a.d):(a.e&&(b=
"",void 0!==a.c&&(b=a.c+"'s "),console.log(b+(" dequeued old job of priority "+d))),--a.j,k(a),r(a,c,h))}k(a)}function r(a,h,c){++a.A;if(a.A>=a.J){a.A=0;var d=a.b,b=a.a;if(0!==d.length){a.b=[];a.a=new p;for(var f=0;f<d.length;++f)if(void 0!==d[f])for(var e=0;e<d[f].length;++e)l(a,d[f][e]);for(f=b.C();null!==f;)d=b.D(f),l(a,d),f=b.r(f);b="";void 0!==a.c&&(b=a.c+"'s ");b+="rerank: ";for(f=a.b.length-1;0<=f;--f)if(d=a.b[f],void 0!==d){for(a.e&&(b+=d.length+" jobs in priority "+f+";");0<d.length&&a.a.h<
a.u;){var e=d.pop(),g=a;g.a.add(e,void 0);t(g)}if(a.a.h>=a.u&&!a.e)break}a.e&&console.log(b);k(a)}}a.e&&(f="",void 0!==a.c&&(f=a.c+"'s "),a=a.k.getPriority(h.f),console.log(f+(" scheduled job of priority "+a)));h.t(c,h.f)}function q(a,b){var c=a.a.D(b);a.a.remove(b);t(a);return c}function t(a){if(a.e){for(var b=a.a.N(),c=0;null!==b;)++c,b=a.a.r(b);if(c!==a.a.h)throw"Unexpected count of new jobs";}}function k(a){if(a.e){for(var b=0,c=0;c<a.b.length;++c){var d=a.b[c];void 0!==d&&(b+=d.length)}if(b+
a.a.h!==a.j)throw"Unexpected count of jobs";}}b.prototype={B:function(a,b,c){var d=this.k.getPriority(b);0>d?c(b):(a={t:a,s:c,f:b},b=null,d>=(self.d<=self.H?self.I:0)&&(0===this.d?b=null:(--this.d,b=this.l.pop(),void 0===b&&(b=this.w()),k(this))),null!==b?r(this,a,b):(g(this,a,d),k(self)))},F:function(a,b){if(this.e){var c="";void 0!==this.c&&(c=this.c+"'s ");var d=this.k.getPriority(b);console.log(c+(" job done of priority "+d))}v(this,a);k(self)},G:function(a,b,c,d,l){var f=this.k.getPriority(b);
if(0>f)return c(b),v(this,l),!0;var q=e(this,f);k(self);if(null===q)return!1;d(b);g(this,{t:a,s:c,f:b},f);k(self);r(this,q,l);k(self);return!0}};return b}();self.ResourceScheduler={};self.ResourceScheduler.PriorityScheduler=u;self.ResourceScheduler.LifoScheduler=n;u.prototype.enqueueJob=u.prototype.B;u.prototype.tryYield=u.prototype.G;u.prototype.jobDone=u.prototype.F;n.prototype.enqueueJob=n.prototype.B;n.prototype.tryYield=n.prototype.G;n.prototype.jobDone=n.prototype.F;

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var t;t="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this,t.imageDecoderFramework=e()}}(function(){return function e(t,i,r){function s(n,o){if(!i[n]){if(!t[n]){var h="function"==typeof require&&require;if(!o&&h)return h(n,!0);if(a)return a(n,!0);var l=new Error("Cannot find module '"+n+"'");throw l.code="MODULE_NOT_FOUND",l}var c=i[n]={exports:{}};t[n][0].call(c.exports,function(e){var i=t[n][1][e];return s(i?i:e)},c,c.exports,e,t,i,r)}return i[n].exports}for(var a="function"==typeof require&&require,n=0;n<r.length;n++)s(r[n]);return s}({1:[function(e,t,i){"use strict";function r(e){var t={x:e.scene.canvas.width,y:e.scene.canvas.height},i=[];s(0,0,t.x,t.y,i,e,0);var r=Cesium.Rectangle.fromCartographicArray(i);(r.east<r.west||r.north<r.south)&&(r={east:Math.max(r.east,r.west),west:Math.min(r.east,r.west),north:Math.max(r.north,r.south),south:Math.min(r.north,r.south)});var a=n.calculateFrustum2DFromBounds(r,t);return a}function s(e,t,i,r,n,h,l){var c=0;c+=a(e,t,h,n),c+=a(i,t,h,n),c+=a(e,r,h,n),c+=a(i,r,h,n);var u=o;if(!(4===c||l>=u)){++l;var d=(e+i)/2,_=(t+r)/2;s(e,t,d,_,n,h,l),s(e,_,d,r,n,h,l),s(d,t,i,_,n,h,l),s(d,_,i,r,n,h,l)}}function a(e,t,i,r){var s=new Cesium.Cartesian2(e,t),a=i.scene.mapProjection.ellipsoid,n=i.scene.camera.pickEllipsoid(s,a);if(void 0===n)return 0;var o=a.cartesianToCartographic(n);return void 0===o?0:(r.push(o),1)}t.exports=r;var n=e("imagehelperfunctions.js"),o=4},{"imagehelperfunctions.js":12}],2:[function(e,t,i){"use strict";function r(e,t){this._options=t||{},void 0!==this._options.rectangle&&(this._options=JSON.parse(JSON.stringify(t)),this._options.cartographicBounds={west:t.rectangle.west,east:t.rectangle.east,south:t.rectangle.south,north:t.rectangle.north}),this._options.minFunctionCallIntervalMilliseconds=t.minFunctionCallIntervalMilliseconds||100,this._url=t.url,this._targetCanvas=document.createElement("canvas"),this._imageryProviders=[new s(this._targetCanvas),new s(this._targetCanvas)],this._imageryLayerShown=new Cesium.ImageryLayer(this._imageryProviders[0]),this._imageryLayerPending=new Cesium.ImageryLayer(this._imageryProviders[1]),this._canvasUpdatedCallbackBound=this._canvasUpdatedCallback.bind(this),this._isPendingUpdateCallback=!1,this._isWhileReplaceLayerShown=!1,this._pendingPositionRectangle=null,this._image=new a(e,this._canvasUpdatedCallbackBound,this._options),this._image.setTargetCanvas(this._targetCanvas),this._updateFrustumBound=this._updateFrustum.bind(this),this._postRenderBound=this._postRender.bind(this)}t.exports=r;var s=e("canvasimageryprovider.js"),a=e("viewerimagedecoder.js"),n=e("_cesiumfrustumcalculator.js");r.prototype.setExceptionCallback=function(e){this._image.setExceptionCallback(e)},r.prototype.open=function(e){this._widget=e,this._layers=e.scene.imageryLayers,e.scene.postRender.addEventListener(this._postRenderBound),this._image.open(this._url),this._layers.add(this._imageryLayerShown),this._intervalHandle=setInterval(this._updateFrustumBound,500)},r.prototype.close=function(){this._image.close(),clearInterval(this._intervalHandle),this._layers.remove(this._imageryLayerShown),this._widget.removeEventListener(this._postRenderBound),this._isWhileReplaceLayerShown&&(this._isWhileReplaceLayerShown=!1,this._isPendingUpdateCallback=!1,this._layers.remove(this._imageryLayerPending))},r.prototype.getImageryLayers=function(){return[this._imageryLayerShown,this._imageryLayerPending]},r.prototype._updateFrustum=function(){var e=n(this._widget);null!==e&&this._image.updateViewArea(e)},r.prototype._canvasUpdatedCallback=function(e){if(this._isWhileReplaceLayerShown&&(this._isPendingUpdateCallback=!0,this._pendingPositionRectangle=e),null!==e){var t=new Cesium.Rectangle(e.west,e.south,e.east,e.north);this._imageryProviders[0].setRectangle(t),this._imageryProviders[1].setRectangle(t)}this._removeAndReAddLayer()},r.prototype._removeAndReAddLayer=function(){var e=this._layers.indexOf(this._imageryLayerShown);if(0>e)throw"Layer was removed from viewer's layers  without closing layer manager. Use CesiumImageDecoderLayerManager.close() instead";this._isWhileReplaceLayerShown=!0,this._layers.add(this._imageryLayerPending,e)},r.prototype._postRender=function(){if(this._isWhileReplaceLayerShown){this._isWhileReplaceLayerShown=!1,this._layers.remove(this._imageryLayerShown,!1);var e=this._imageryLayerShown;this._imageryLayerShown=this._imageryLayerPending,this._imageryLayerPending=e,this._isPendingUpdateCallback&&(this._isPendingUpdateCallback=!1,this._canvasUpdatedCallback(this._pendingPositionRectangle))}}},{"_cesiumfrustumcalculator.js":1,"canvasimageryprovider.js":3,"viewerimagedecoder.js":20}],3:[function(e,t,i){"use strict";function r(e,t){if(void 0===t&&(t={}),void 0===e)throw new DeveloperError("canvas is required.");this._canvas=e,this._errorEvent=new Event("CanvasImageryProviderStatus"),this._ready=!1;var i=t.credit;"string"==typeof i&&(i=new Credit(i)),this._credit=i}t.exports=r,r.prototype={get tileWidth(){if(!this._ready)throw new DeveloperError("tileWidth must not be called before the imagery provider is ready.");return this._canvas.width},get tileHeight(){if(!this._ready)throw new DeveloperError("tileHeight must not be called before the imagery provider is ready.");return this._canvas.height},get maximumLevel(){if(!this._ready)throw new DeveloperError("maximumLevel must not be called before the imagery provider is ready.");return 0},get minimumLevel(){if(!this._ready)throw new DeveloperError("minimumLevel must not be called before the imagery provider is ready.");return 0},get tilingScheme(){if(!this._ready)throw new DeveloperError("tilingScheme must not be called before the imagery provider is ready.");return this._tilingScheme},get rectangle(){return this._tilingScheme.rectangle},get tileDiscardPolicy(){if(!this._ready)throw new DeveloperError("tileDiscardPolicy must not be called before the imagery provider is ready.")},get errorEvent(){return this._errorEvent},get ready(){return this._ready},get credit(){return this._credit},get hasAlphaChannel(){return!0}},r.prototype.setRectangle=function(e){this._tilingScheme=new Cesium.GeographicTilingScheme({rectangle:e,numberOfLevelZeroTilesX:1,numberOfLevelZeroTilesY:1}),this._ready||(this._ready=!0,Cesium.TileProviderError.handleSuccess(this._errorEvent))},r.prototype.getTileWidth=function(){return this.tileWidth},r.prototype.getTileHeight=function(){return this.tileHeight},r.prototype.getMaximumLevel=function(){return this.maximumLevel},r.prototype.getMinimumLevel=function(){return this.minimumLevel},r.prototype.isReady=function(){return this.ready},r.prototype.getCredit=function(){return this.credit},r.prototype.getRectangle=function(){return this.tilingScheme.rectangle},r.prototype.getTilingScheme=function(){return this.tilingScheme},r.prototype.getTileDiscardPolicy=function(){return this.tileDiscardPolicy},r.prototype.getErrorEvent=function(){return this.errorEvent},r.prototype.getHasAlphaChannel=function(){return this.hasAlphaChannel},r.prototype.getTileCredits=function(e,t,i){},r.prototype.requestImage=function(e,t,i){if(!this._ready)throw new DeveloperError("requestImage must not be called before the imagery provider is ready.");return this._canvas},r.prototype.pickFeatures=function(){}},{}],4:[function(e,t,i){"use strict";function r(e,t){var i=t.url;if(this._adaptProportions=t.adaptProportions,this._rectangle=t.rectangle,this._proxy=t.proxy,this._updateFrustumInterval=1e3,this._credit=t.credit,"string"==typeof this._credit&&(this._credit=new Credit(this._credit)),void 0===this._rectangle&&(this._rectangle=Cesium.Rectangle.fromDegrees(-180,-90,180,90)),void 0===this._adaptProportions&&(this._adaptProportions=!0),t=JSON.parse(JSON.stringify(t||{})),t.cartographicBounds={west:this._rectangle.west,east:this._rectangle.east,south:this._rectangle.south,north:this._rectangle.north},void 0===i)throw new DeveloperError("url is required.");this._url=i,this._tilingScheme=void 0,this._tileWidth=0,this._tileHeight=0,this._errorEvent=new Event("ImageDecoderImageryProviderStatus"),this._ready=!1,this._exceptionCallback=null,this._cesiumWidget=null,this._updateFrustumIntervalHandle=null;var r=i;void 0!==this._proxy&&(r=this._proxy.getURL(r)),this._image=new a(e,{serverRequestPrioritizer:"frustum",decodePrioritizer:"frustum"}),this._url=r}function s(e){var t=new Cesium.Rectangle(e.west,e.south,e.east,e.north),i=new Cesium.GeographicTilingScheme({rectangle:t,numberOfLevelZeroTilesX:e.levelZeroTilesX,numberOfLevelZeroTilesY:e.levelZeroTilesY});return i}t.exports=r;var a=e("workerproxyimagedecoder.js"),n=e("_cesiumfrustumcalculator.js"),o=e("imagehelperfunctions.js");r.prototype={get url(){return this._url},get proxy(){return this._proxy},get tileWidth(){if(!this._ready)throw new DeveloperError("tileWidth must not be called before the imagery provider is ready.");return this._tileWidth},get tileHeight(){if(!this._ready)throw new DeveloperError("tileHeight must not be called before the imagery provider is ready.");return this._tileHeight},get maximumLevel(){if(!this._ready)throw new DeveloperError("maximumLevel must not be called before the imagery provider is ready.");return this._numResolutionLevels-1},get minimumLevel(){if(!this._ready)throw new DeveloperError("minimumLevel must not be called before the imagery provider is ready.");return 0},get tilingScheme(){if(!this._ready)throw new DeveloperError("tilingScheme must not be called before the imagery provider is ready.");return this._tilingScheme},get rectangle(){return this._tilingScheme.rectangle},get tileDiscardPolicy(){if(!this._ready)throw new DeveloperError("tileDiscardPolicy must not be called before the imagery provider is ready.")},get errorEvent(){return this._errorEvent},get ready(){return this._ready},get credit(){return this._credit},get hasAlphaChannel(){return!0}},r.prototype.setExceptionCallback=function(e){this._exceptionCallback=e},r.prototype.open=function(e){if(null!==this._updateFrustumIntervalHandle)throw new DeveloperError("Cannot set two parent viewers.");if(void 0===e)throw new DeveloperError("widgetOrViewer should be given. It is needed for frustum calculation for the priority mechanism");this._image.open(this._url).then(this._opened.bind(this))["catch"](this._onException.bind(this)),this._cesiumWidget=e,this._updateFrustumIntervalHandle=setInterval(this._setPriorityByFrustum.bind(this),this._updateFrustumInterval)},r.prototype.close=function(){clearInterval(this._updateFrustumIntervalHandle),this._image.close()},r.prototype.getTileWidth=function(){return this.tileWidth},r.prototype.getTileHeight=function(){return this.tileHeight},r.prototype.getMaximumLevel=function(){return this.maximumLevel},r.prototype.getMinimumLevel=function(){return this.minimumLevel},r.prototype.getUrl=function(){return this.url},r.prototype.getProxy=function(){return this.proxy},r.prototype.isReady=function(){return this.ready},r.prototype.getCredit=function(){return this.credit},r.prototype.getRectangle=function(){return this.tilingScheme.rectangle},r.prototype.getTilingScheme=function(){return this.tilingScheme},r.prototype.getTileDiscardPolicy=function(){return this.tileDiscardPolicy},r.prototype.getErrorEvent=function(){return this.errorEvent},r.prototype.getHasAlphaChannel=function(){return this.hasAlphaChannel},r.prototype.getTileCredits=function(e,t,i){},r.prototype.requestImage=function(e,t,i){function r(e){var t=e.imageData.width,i=e.imageData.height;t>0&&i>0&&y.putImageData(e.imageData,e.xInOriginalRequest,e.yInOriginalRequest)}function s(e){e?P("Fetch request or decode aborted"):(p.drawImage(f,0,0,g,v,d.croppedScreen.minX,d.croppedScreen.minY,d.croppedScreen.maxXExclusive,d.croppedScreen.maxYExclusive),b(m))}if(!this._ready)throw new DeveloperError("requestImage must not be called before the imagery provider is ready.");var a=this,n=Math.pow(2,this._numResolutionLevels-i-1),h=e*this._tileWidth*n,l=t*this._tileHeight*n,c=(e+1)*this._tileWidth*n,u=(t+1)*this._tileHeight*n,d=o.alignParamsToTilesAndLevel({minX:h,minY:l,maxXExclusive:c,maxYExclusive:u,screenWidth:this._tileWidth,screenHeight:this._tileHeight},this._image),_=d.imagePartParams.level,m=(this._image.getLevelWidth(_),this._image.getLevelHeight(_),document.createElement("canvas"));m.width=this._tileWidth,m.height=this._tileHeight;var p=m.getContext("2d");p.clearRect(0,0,this._tileWidth,this._tileHeight);var g=d.imagePartParams.maxXExclusive-d.imagePartParams.minX,v=d.imagePartParams.maxYExclusive-d.imagePartParams.minY;if(0>=g||0>=v)return m;var f=document.createElement("canvas");f.width=g,f.height=v;var y=f.getContext("2d");y.clearRect(0,0,g,v),d.imagePartParams.quality=this._quality,d.imagePartParams.requestPriorityData={imageRectangle:this._rectangle};var b,P,x=new Promise(function(e,t){b=e,P=t,a._image.requestPixelsProgressive(d.imagePartParams,r,s)});return x},r.prototype._setPriorityByFrustum=function(){if(this._ready){var e=n(this._cesiumWidget,this);null!==e&&(e.imageRectangle=this.getRectangle(),e.exactlevel=null,this._image.setServerRequestPrioritizerData(e),this._image.setDecodePrioritizerData(e))}},r.prototype.pickFeatures=function(){},r.prototype._onException=function(e){null!==this._exceptionCallback&&this._exceptionCallback(e)},r.prototype._opened=function(){if(this._ready)throw"ImageDecoderImageryProvider error: opened() was called more than once!";this._ready=!0,this._numResolutionLevels=this._image.getNumResolutionLevelsForLimittedViewer(),this._quality=this._image.getHighestQuality();var e=this._numResolutionLevels-1;this._tileWidth=this._image.getTileWidth(),this._tileHeight=this._image.getTileHeight();var t=this._image.getImageLevel(),i=this._image.getLevelWidth(t),r=this._image.getLevelHeight(t),a=Math.ceil(i/this._tileWidth)>>e,n=Math.ceil(r/this._tileHeight)>>e;o.fixBounds(this._rectangle,this._image,this._adaptProportions);var h=this._rectangle.east-this._rectangle.west,l=this._rectangle.north-this._rectangle.south,c=1<<e,u=this._tileWidth*a*c,d=this._tileHeight*n*c,_=h*u/i,m=l*d/r,p=this._rectangle.west+_,g=this._rectangle.north-m;this._tilingSchemeParams={west:this._rectangle.west,east:p,south:g,north:this._rectangle.north,levelZeroTilesX:a,levelZeroTilesY:n,maximumLevel:e},this._tilingScheme=s(this._tilingSchemeParams),Cesium.TileProviderError.handleSuccess(this._errorEvent)}},{"_cesiumfrustumcalculator.js":1,"imagehelperfunctions.js":12,"workerproxyimagedecoder.js":18}],5:[function(e,t,i){"use strict";function r(e,t){l.call(this,e),this._options=t||{},this._optionsWebWorkers=n.createInternalOptions(e,this._options);var i=this._options.workersLimit||5;this._tileWidth=this._options.tileWidth||256,this._tileHeight=this._options.tileHeight||256,this._showLog=!!this._options.showLog,this._channelStates=[],this._decoders=[],this._fetchManager=new a(this._optionsWebWorkers);var r=n.createScheduler(this._showLog,this._options.decodePrioritizer,"decode",this._createDecoder.bind(this),i);this._decodePrioritizer=r.prioritizer,this._requestsDecodeJobsPool=new o(this._fetchManager,r.scheduler,this._tileWidth,this._tileHeight,!1),this._channelsDecodeJobsPool=new o(this._fetchManager,r.scheduler,this._tileWidth,this._tileHeight,!0)}function s(e,t){var i=4,r=e.width*i,s=e.originalRequestWidth*i;if(void 0===t.pixels){var a=s*e.originalRequestHeight;t.pixels=new Uint8Array(a),t.xInOriginalRequest=0,t.yInOriginalRequest=0;var n=e.originalRequestWidth;t.originalRequestWidth=n,t.width=n;var o=e.originalRequestHeight;t.originalRequestHeight=o,t.height=o}t.allRelevantBytesLoaded=e.allRelevantBytesLoaded;for(var h=0,l=e.xInOriginalRequest*i+e.yInOriginalRequest*s,c=0;c<e.height;++c){var u=e.pixels.subarray(h,h+r);t.pixels.set(u,l),h+=r,l+=s}}t.exports=r;var a=e("workerproxyfetchmanager.js"),n=e("imageHelperFunctions.js"),o=e("decodejobspool.js"),h=e("workerproxypixelsdecoder.js"),l=e("imageparamsretrieverproxy.js");r.prototype=Object.create(l.prototype),r.prototype.getTileWidth=function(){return this._validateSizesCalculator(),this._tileWidth},r.prototype.getTileHeight=function(){return this._validateSizesCalculator(),this._tileHeight},r.prototype.setServerRequestPrioritizerData=function(e){this._fetchManager.setServerRequestPrioritizerData(e)},r.prototype.setDecodePrioritizerData=function(e){if(null===this._decodePrioritizer)throw"No decode prioritizer has been set";this._showLog&&console.log("setDecodePrioritizerData("+e+")");var t=Object.create(e);t.image=this,this._decodePrioritizer.setPrioritizerData(t)},r.prototype.open=function(e){var t=this;return this._fetchManager.open(e).then(function(e){return t._internalSizesParams=e,{sizesParams:e,applicativeTileWidth:t.getTileWidth(),applicativeTileHeight:t.getTileHeight()}})},r.prototype.close=function(){for(var e=0;e<this._decoders.length;++e)this._decoders[e].terminate();return this._fetchManager.close()},r.prototype.createChannel=function(e){function t(t){i._channelStates[t]={decodeJobsListenerHandle:null},e(t)}this._validateSizesCalculator();var i=this;this._fetchManager.createChannel(t)},r.prototype.requestPixels=function(e){function t(t,s){a=t,n=s,u._requestsDecodeJobsPool.forkDecodeJobs(e,i,r,h,l,!1)}function i(e){s(e,c)}function r(e){e?n("Request was aborted due to failure or priority"):a(c)}this._validateSizesCalculator();var a,n,o=e.level,h=this._sizesCalculator.getLevelWidth(o),l=this._sizesCalculator.getLevelHeight(o),c={},u=this,d=new Promise(t);return d},r.prototype.requestPixelsProgressive=function(e,t,i,r,s){this._validateSizesCalculator();var a,n=e.level,o=this._sizesCalculator.getLevelWidth(n),h=this._sizesCalculator.getLevelHeight(n),l=null;if(void 0===s)a=this._requestsDecodeJobsPool;else if(a=this._channelsDecodeJobsPool,l=this._channelStates[s],void 0===l)throw"Channel handle does not exist";var c=a.forkDecodeJobs(e,t,i,o,h,!0,r);void 0!==s&&(null!==l.decodeJobsListenerHandle&&a.unregisterForkedJobs(l.decodeJobsListenerHandle),l.decodeJobsListenerHandle=c,this._fetchManager.moveChannel(s,e))},r.prototype.reconnect=function(){this._fetchManager.reconnect()},r.prototype.alignParamsToTilesAndLevel=function(e){return n.alignParamsToTilesAndLevel(e,this)},r.prototype._getSizesParamsInternal=function(){return this._internalSizesParams},r.prototype._createDecoder=function(){var e=new h(this._optionsWebWorkers);return this._decoders.push(e),e}},{"decodejobspool.js":7,"imageHelperFunctions.js":12,"imageparamsretrieverproxy.js":15,"workerproxyfetchmanager.js":17,"workerproxypixelsdecoder.js":19}],6:[function(e,t,i){"use strict";function r(e,t,i,r){this._isAborted=!1,this._isTerminated=!1,this._isFetchRequestTerminated=!1,this._isFirstStage=!0,this._isManuallyAborted=!1,this._firstDecodeInput=null,this._pendingDecodeInput=null,this._activeSubJobs=1,this._imagePartParams=e,this._decodeScheduler=i,this._jobSequenceId=0,this._lastFinishedJobSequenceId=-1,this._progressiveStagesDone=0,this._listenersLinkedList=new s,this._progressiveListenersCount=0,this._requestId=++a,this._allRelevantBytesLoaded=0,this._fetchManager=t,this._startDecodeBound=this._startDecode.bind(this),this._decodeAbortedBound=this._decodeAborted.bind(this),t.createRequest(e,this,this._dataReadyForDecode,this._fetchTerminated,r,this._requestId)}t.exports=r;var s=e("linkedlist.js"),a=0;r.prototype.registerListener=function(e){var t=this._listenersLinkedList.add(e);e.isProgressive&&(++this._progressiveListenersCount,1===this._progressiveListenersCount&&this._fetchManager.setIsProgressiveRequest(this._requestId,!0));var i=t;return i},r.prototype.unregisterListener=function(e){var t=e,i=this._listenersLinkedList.getValue(t);this._listenersLinkedList.remove(e),i.isProgressive&&--this._progressiveListenersCount,0===this._listenersLinkedList.getCount()?(this._fetchManager.manualAbortRequest(this._requestId),this._isAborted=!0,this._isTerminated=!0,this._isFetchRequestTerminated=!0,this._isManuallyAborted=!0):0===this._progressiveListenersCount&&this._fetchManager.setIsProgressiveRequest(this._requestId,!1)},r.prototype.getIsTerminated=function(){return this._isTerminated},r.prototype._dataReadyForDecode=function(e){if(!this._isAbortedNoTermination()&&0!==this._listenersLinkedList.getCount()){if(this._isFirstStage)this._firstDecodeInput={dataForDecode:e};else{if(this._pendingDecodeInput={dataForDecode:e},this._isAlreadyScheduledNonFirstJob)return;this._isAlreadyScheduledNonFirstJob=!0}if(this._isTerminated)throw"Job has already been terminated";this._isFirstStage=!1,++this._activeSubJobs;var t={self:this,imagePartParams:this._imagePartParams,progressiveStagesDone:this._progressiveStagesDone};this._decodeScheduler.enqueueJob(this._startDecodeBound,t,this._decodeAbortedBound)}},r.prototype._startDecode=function(e,t){function i(i){n._pixelsDecodedCallback(e,i,s,t),n=null}var r;if(null!==this._firstDecodeInput?(r=this._firstDecodeInput,this._firstDecodeInput=null):(r=this._pendingDecodeInput,this._pendingDecodeInput=null,this._isAlreadyScheduledNonFirstJob=!1),t.allRelevantBytesLoaded=r.dataForDecode.allRelevantBytesLoaded,this._isAbortedNoTermination())return--this._activeSubJobs,this._decodeScheduler.jobDone(e,t),void this._checkIfAllTerminated();var s=++this._jobSequenceId,a=this._imagePartParams;a.maxXExclusive-a.minX,a.maxYExclusive-a.minY;e.decode(r.dataForDecode).then(i);var n=this},r.prototype._pixelsDecodedCallback=function(e,t,i,r){this._decodeScheduler.jobDone(e,r),--this._activeSubJobs;var s=r.allRelevantBytesLoaded-this._allRelevantBytesLoaded;if(this._allRelevantBytesLoaded=r.allRelevantBytesLoaded,this._isAbortedNoTermination())return void this._checkIfAllTerminated();var a=this._lastFinishedJobSequenceId;if(a>i)return void this._checkIfAllTerminated();this._lastFinishedJobSequenceId=i;for(var n=this._imagePartParams,o=this._listenersLinkedList.getFirstIterator();null!==o;){var h=this._listenersLinkedList.getValue(o),l=h.imagePartParams,c=n.minX-l.minX,u=n.minY-l.minY,d=l.maxXExclusive-l.minX,_=l.maxYExclusive-l.minY;h.allRelevantBytesLoaded+=s;var m={originalRequestWidth:d,originalRequestHeight:_,xInOriginalRequest:c,yInOriginalRequest:u,imageData:t,allRelevantBytesLoaded:h.allRelevantBytesLoaded};h.callback(m),o=this._listenersLinkedList.getNextIterator(o)}this._checkIfAllTerminated()},r.prototype._fetchTerminated=function(e){if(!this._isManuallyAborted){if(this._isFetchRequestTerminated)throw"Double termination of fetch request";this._isFetchRequestTerminated=!0,--this._activeSubJobs,this._isAborted|=e,this._checkIfAllTerminated()}},r.prototype._decodeAborted=function(e){this._isAborted=!0,null!==this._firstDecodeInput?this._firstDecodeInput=null:(this._pendingDecodeInput=null,this._isAlreadyScheduledNonFirstJob=!1),--this._activeSubJobs,this._checkIfAllTerminated()},r.prototype._isAbortedNoTermination=function(){if(!this._isManuallyAborted){if(this._isTerminated)throw"Unexpected job state of terminated: Still runnin sub-jobs";return this._isAborted}},r.prototype._checkIfAllTerminated=function(){if(this._activeSubJobs<0)throw"Inconsistent number of decode jobs";if(!(this._activeSubJobs>0)){if(this._isAlreadyScheduledNonFirstJob)throw"Inconsistent isAlreadyScheduledNonFirstJob flag";this._isTerminated=!0;var e=this._listenersLinkedList;this._listenersLinkedList=null;for(var t=e.getFirstIterator();null!==t;){var i=e.getValue(t);i.isAnyDecoderAborted|=this._isAborted;var r=--i.remainingDecodeJobs;if(0>r)throw"Inconsistent number of done requests";var s=0===r;s&&(i.isTerminatedCallbackCalled=!0,i.terminatedCallback(i.isAnyDecoderAborted)),t=e.getNextIterator(t)}}}},{"linkedlist.js":13}],7:[function(e,t,i){"use strict";function r(e,t,i,r,s){this._tileWidth=i,this._tileHeight=r,this._activeRequests=[],this._onlyWaitForDataAndDecode=s,this._fetchManager=e,this._decodeScheduler=t}function s(e,t,i,r,s){if(void 0===s)return!1;for(var a=0;a<s.length;++a){var n=s[a],o=e>=n.minX&&i<=n.maxXExclusive,h=t>=n.minY&&r<=n.maxYExclusive;if(o&&h)return!0}return!1}function a(e,t,i){var r=e[t];return void 0===r&&(r=i,e[t]=r),r}t.exports=r;var n=e("decodejob.js");r.prototype.forkDecodeJobs=function(e,t,i,r,o,h,l){var c=e.minX,u=e.minY,d=e.maxXExclusive,_=e.maxYExclusive,m=e.level||0,p=e.quality,g=e.requestPriorityData,v=c%this._tileWidth===0&&u%this._tileHeight===0,f=d%this._tileWidth===0||d===r,y=_%this._tileHeight===0||_===o,b=d>c&&_>u;if(!(v&&f&&y&&b))throw"imagePartParams for decoders is not aligned to tile size or not in valid order";for(var P=a(this._activeRequests,m,[]),x=a(P,e.quality,[]),w=Math.ceil((d-c)/this._tileWidth),C=Math.ceil((_-u)/this._tileHeight),I={imagePartParams:e,callback:t,terminatedCallback:i,remainingDecodeJobs:w*C,isProgressive:h,isAnyDecoderAborted:!1,isTerminatedCallbackCalled:!1,allRelevantBytesLoaded:0,unregisterHandles:[]},L=c;d>L;L+=this._tileWidth)for(var D=a(x,L,[]),S=Math.min(L+this._tileWidth,r),k=u;_>k;k+=this._tileHeight){var T=Math.min(k+this._tileHeight,o),R=s(L,k,S,T,l);if(R)--I.remainingDecodeJobs;else{var H=a(D,k,{});if(void 0===H.job||H.job.getIsTerminated()){var j={minX:L,minY:k,maxXExclusive:S,maxYExclusive:T,level:m,quality:p,requestPriorityData:g};H.job=new n(j,this._fetchManager,this._decodeScheduler,this._onlyWaitForDataAndDecode)}var F=H.job.registerListener(I);I.unregisterHandles.push({unregisterHandle:F,job:H.job})}}return I.isTerminatedCallbackCalled||0!==I.remainingDecodeJobs||(I.isTerminatedCallbackCalled=!0,I.terminatedCallback(I.isAnyDecoderAborted)),I},r.prototype.unregisterForkedJobs=function(e){if(0!==e.remainingDecodeJobs)for(var t=0;t<e.unregisterHandles.length;++t){var i=e.unregisterHandles[t];i.job.getIsTerminated()||i.job.unregisterListener(i.unregisterHandle)}}},{"decodejob.js":6}],8:[function(e,t,i){"use strict";function r(e,t,i,s){this._fetcher=e,this._scheduler=t,this._dataListeners=[],this._terminatedListeners=[],this._imagePartParams=null,this._progressiveStagesDone=0,this._isYielded=!1,this._isFailure=!1,this._isTerminated=!1,this._isManuallyAborted=!1,this._isChannel=i===r.FETCH_TYPE_CHANNEL,this._isChannelStartedFetch=!1,this._contextVars=s,this._isOnlyWaitForData=i===r.FETCH_TYPE_ONLY_WAIT_FOR_DATA,this._useScheduler=i===r.FETCH_TYPE_REQUEST,this._imageDataContext=null,this._resource=null,this._abortedBound=this._aborted.bind(this),this._fetchHandle=null,i===r.FETCH_TYPE_CHANNEL?this._movableFetchState={}:this._movableFetchState=null}function s(e,t){if(null!==t._imageDataContext)throw"Unexpected restart of already started request";return t._isManuallyAborted?void(null!==e&&t._scheduler.jobDone(e,t)):(t._resource=e,void t._startFetch())}function a(e,t){if(t._isManuallyAborted||t._isFailure)return void t._scheduler.jobDone(t._resource,t);if(!t.isYielded||t.isTerminated)throw"Unexpected request state on continue";t.isYielded=!1,t.resource=e,t._continueFetch()}function n(e){if(e._isYielded||e._isTerminated)throw"Unexpected request state on yield";e._isYielded=!0,e._resource=null}function o(e){e._isYielded=!1,e._resource=null,e._fetchTerminated(!0)}t.exports=r,r.FETCH_TYPE_REQUEST=1,r.FETCH_TYPE_CHANNEL=2,r.FETCH_TYPE_ONLY_WAIT_FOR_DATA=3,r.prototype.fetch=function(e){if(this._isChannel)return null!==this._imageDataContext&&this._imageDataContext.dispose(),this._imagePartParams=e,void this._startFetch();if(null!==this._imagePartParams)throw'Cannot fetch twice on fetch type of "request"';return this._imagePartParams=e,this._useScheduler?void this._scheduler.enqueueJob(s,this,o):void s(null,this)},r.prototype.manualAbortRequest=function(){this._isManuallyAborted=!0,this._isTerminated=!0,null!==this._fetchHandle?this._fetchHandle.abortAsync().then(this._abortedBound):this._imageDataContext.dispose()},r.prototype.getContextVars=function(e){return this._contextVars},r.prototype.on=function(e,t){switch(e){case"data":this._dataListeners.push(t);break;case"terminated":this._terminatedListeners.push(t);break;default:throw"Unexpected event "+e}},r.prototype.setIsProgressive=function(e){this._isProgressive=e,null!==this._imageDataContext&&this._imageDataContext.setIsProgressive(e)},r.prototype.getIsProgressive=function(){return this._isProgressive},r.prototype._startFetch=function(){var e=this._fetcher.createImageDataContext(this._imagePartParams);if(this._imageDataContext=e,this._imageDataContext.setIsProgressive(this._isProgressive),e.isDone()){for(var t=0;t<this._dataListeners.length;++t)this._dataListeners[t].call(this,this._contextVars,e);return void this._fetchTerminated(!1)}if(e.hasData())for(var i=0;i<this._dataListeners.length;++i)this._dataListeners[i].call(this,this._contextVars,e);var r=this;e.on("data",function(){r._dataCallback(e)}),this._isOnlyWaitForData||(this._isChannel?this._isChannelStartedFetch?this._fetcher.moveFetch(e,this._movableFetchState):(this._fetcher.startMovableFetch(e,this._movableFetchState),this._isChannelStartedFetch=!0):this._fetchHandle=this._fetcher.fetch(e))},r.prototype._fetchTerminated=function(e){if(this._isYielded||this._isTerminated)throw"Unexpected request state on terminated";if(null!==this._resource){if(e)throw"Unexpected request termination without resource allocated";this._scheduler.jobDone(this._resource,this),this._resource=null}else if(!e&&this._useScheduler)throw"Job expected to have resource on successful termination";if(!this._isChannel){this._isTerminated=!0;for(var t=0;t<this._terminatedListeners.length;++t)this._terminatedListeners[t](this._contextVars,this._imageDataContext,e)}null===this._imageDataContext||this._isFailure||this._imageDataContext.dispose()},r.prototype._continueFetch=function(){if(this.isChannel)throw"Unexpected call to continueFetch on channel";this._fetchHandle=this._fetcher.fetch(this._imageDataContext)},r.prototype._dataCallback=function(e){try{if(this._isYielded||this._isTerminated)throw"Unexpected request state on fetch callback";if(e!==this._imageDataContext)throw"Unexpected imageDataContext";++this._progressiveStagesDone;for(var t=0;t<this._dataListeners.length;++t)this._dataListeners[t].call(this,this._contextVars,e);if(e.isDone())return void this._fetchTerminated(!1);if(this._useScheduler){if(null===this._resource)throw"No resource allocated but fetch callback called";var i=this._scheduler.tryYield(a,this,o,n,this._resource);i&&this._fetchHandle.abortAsync().then(this._abortedBound)}}catch(r){this._isFailure=!0,o(this)}},r.prototype._aborted=function(){if(this._isYielded||null===this._resource)throw"Unexpected request state on stopped";if(this._isOnlyWaitForData||null===this._fetchHandle)throw"Unexpected request type on stopped";var e=this._scheduler,t=e.tryYield(a,this,o,n,this._resource);return t||this._isTerminated?(this._fetchHandle=null,void e.jobDone(this._resource,this)):void this._continueFetch()},Object.defineProperty(r.prototype,"imagePartParams",{get:function(){return this._imagePartParams}}),Object.defineProperty(r.prototype,"progressiveStagesDone",{get:function(){return this._progressiveStagesDone}})},{}],9:[function(e,t,i){"use strict";function r(e){c.call(this,e.imageImplementationClassName);var t=e.serverRequestsLimit||5;if(this._fetcher=null,this._internalSizesParams=null,this._showLog=e.showLog,this._showLog)throw"showLog is not supported on this browser";var i=h.createScheduler(e.showLog,e.serverRequestPrioritizer,"serverRequest",o,t);this._serverRequestPrioritizer=i.prioritizer,this._scheduler=i.scheduler,this._channelHandleCounter=0,this._channelHandles=[],this._requestById=[]}function s(e,t){var i=e.fetchJob.getIsProgressive(),r=0===e.progressiveStagesDone;if(e.isLastCallbackCalledWithoutLowQualityLimit|=i&&!r,i){var s=r?e.self.getLowestQuality():void 0;++e.progressiveStagesDone,n(e,t,s)}}function a(e,t,i){e.isLastCallbackCalledWithoutLowQualityLimit||n(e,t),e.terminatedCallback.call(e.callbackThis,i),delete e.self._requestById[e.requestId]}function n(e,t,i){var r=t.getFetchedData(i);e.callback.call(e.callbackThis,r)}function o(){return{}}t.exports=r;var h=e("imagehelperfunctions.js"),l=e("fetchjob.js"),c=e("imageparamsretrieverproxy.js");
r.prototype=Object.create(c.prototype),r.prototype.open=function(e){var t=this._imageImplementation.createFetcher(e,{isReturnPromise:!0}),i=this;return t.then(function(e){return i._fetcher=e.fetcher,i._internalSizesParams=e.sizesParams,e.sizesParams})},r.prototype.close=function(){return this._fetcher.close({isReturnPromise:!0})},r.prototype.setIsProgressiveRequest=function(e,t){var i=this._requestById[e];return void 0===i?null:void i.setIsProgressive(t)},r.prototype.createChannel=function(e){var t=++this._channelHandleCounter;this._channelHandles[t]=new l(this._fetcher,this._scheduler,l.FETCH_TYPE_CHANNEL,null),e(t)},r.prototype.moveChannel=function(e,t){var i=this._channelHandles[e];i.fetch(t)},r.prototype.createRequest=function(e,t,i,r,n,o){var h={progressiveStagesDone:0,isLastCallbackCalledWithoutLowQualityLimit:!1,callbackThis:t,callback:i,terminatedCallback:r,requestId:o,fetchJob:null,self:this},c=n?l.FETCH_TYPE_ONLY_WAIT_FOR_DATA:l.FETCH_TYPE_REQUEST,u=new l(this._fetcher,this._scheduler,c,h);if(h.fetchJob=u,void 0!==this._requestById[o])throw"Duplication of requestId "+o;void 0!==o&&(this._requestById[o]=u),u.on("data",s),u.on("terminated",a),u.fetch(e)},r.prototype.manualAbortRequest=function(e){var t=this._requestById[e];void 0!==t&&(t.manualAbortRequest(),delete this._requestById[e])},r.prototype.reconnect=function(){this._fetcher.reconnect()},r.prototype.setServerRequestPrioritizerData=function(e){if(null===this._serverRequestPrioritizer)throw"No serverRequest prioritizer has been set";this._showLog&&console.log("setServerRequestPrioritizerData("+e+")"),e.image=this,this._serverRequestPrioritizer.setPrioritizerData(e)},r.prototype._getSizesParamsInternal=function(){return this._internalSizesParams}},{"fetchjob.js":8,"imagehelperfunctions.js":12,"imageparamsretrieverproxy.js":15}],10:[function(e,t,i){"use strict";function r(e,t){this._frustumData=null,this._isAbortRequestsNotInFrustum=e,this._isPrioritizeLowProgressiveStage=t}t.exports=r;var s=-1,a=0,n=1,o=2,h=3,l=4,c=5,u=6,d=7,_=5,m=13;Math.log(2);Object.defineProperty(r.prototype,"minimalLowQualityPriority",{get:function(){return l+_}}),r.prototype.setPrioritizerData=function(e){this._frustumData=e},r.prototype.getPriority=function(e){var t=e.imagePartParams;if(t.requestPriorityData.overrideHighestPriority)return m;var i=this._getPriorityInternal(t),r=i>=l;if(this._isAbortRequestsNotInFrustum&&!r)return s;var a=0;if(this._isPrioritizeLowProgressiveStage&&r){if(void 0===e.progressiveStagesDone)throw"Missing progressive stage information";a=0===e.progressiveStagesDone?_:1===e.progressiveStagesDone?1:0}return i+a},r.prototype._getPriorityInternal=function(e){if(null===this._frustumData)return a;if(void 0===this._frustumData.imageRectangle)throw"No imageRectangle information passed in setPrioritizerData";var t=this._frustumData.exactlevel;if(void 0===this._frustumData.exactlevel)throw"No exactlevel information passed in setPrioritizerData. Use null if unknown";var i,r=this._pixelToCartographicX(e.minX,e),s=this._pixelToCartographicX(e.maxXExclusive,e),_=this._pixelToCartographicY(e.minY,e),m=this._pixelToCartographicY(e.maxYExclusive,e),p=e.maxXExclusive-e.minX,g=e.maxYExclusive-e.minY,v=e.level||0;if(null===t){var f=p/(s-r),y=g/(_-m),b=Math.max(f,y),P=this._frustumData.resolution;if(i=b/P,i>2)return n}else if(t>v)return n;var x=this._frustumData.rectangle,w=Math.max(x.west,r),C=Math.min(x.east,s),I=Math.max(x.south,m),L=Math.min(x.north,_),D=C-w,S=L-I;if(0>D||0>S)return o;if(null!==t){if(v>t)return h}else if(v>0&&.25>i)return h;var k=D*S,T=(s-r)*(_-m),R=k/T;return R>.99?d:R>.7?u:R>.3?c:l},r.prototype._pixelToCartographicX=function(e,t){var i=e/this._frustumData.image.getLevelWidth(t.level),r=this._frustumData.imageRectangle,s=r.east-r.west,a=r.west+i*s;return a},r.prototype._pixelToCartographicY=function(e,t,i){var r=e/this._frustumData.image.getLevelHeight(t.level),s=this._frustumData.imageRectangle,a=s.north-s.south,n=s.north-r*a;return n}},{}],11:[function(e,t,i){"use strict";function r(e){this._byKey=[],this._hasher=e}t.exports=r;var s=e("linkedlist.js");r.prototype.getFromKey=function(e){var t=this._hasher.getHashCode(e),i=this._byKey[t];if(!i)return null;for(var r=i.getFirstIterator();null!==r;){var s=i.getValue(r);if(this._hasher.isEqual(s.key,e))return s.value;r=i.getNextIterator(r)}return null},r.prototype.getFromIterator=function(e){return e._hashElements.getValue(e._internalIterator).value},r.prototype.tryAdd=function(e,t){var i=this._hasher.getHashCode(e),r=this._byKey[i];r||(r=new s,this._byKey[i]=r);var a={_hashCode:i,_hashElements:r,_internalIterator:null};for(a._internalIterator=r.getFirstIterator();null!==a._internalIterator;){var n=r.getValue(a._internalIterator);if(this._hasher.isEqual(n.key,e))return{iterator:a,isNew:!1,value:n.value};a._internalIterator=r.getNextIterator(a._internalIterator)}var o=t();return a._internalIterator=r.add({key:e,value:o}),{iterator:a,isNew:!0,value:o}},r.prototype.remove=function(e){e._hashElements.remove(e._internalIterator),0===e._hashElements.getCount()&&delete this._byKey[e._hashCode]}},{"linkedlist.js":13}],12:[function(e,t,i){"use strict";function r(e,t){var i=t.x*t.x+t.y*t.y,r=e.east-e.west,s=e.north-e.south,a=r*r+s*s,n=Math.sqrt(i/a),o={resolution:n,rectangle:e,screenSize:t};return o}function s(e,t,i,r,s){var a,n;if(void 0===t)a=null,n=new ResourceScheduler.LifoScheduler(r,s);else{var o=!1;"frustum"===t?(o=!0,a=new c):"frustumOnly"===t?(o=!0,a=new c(!0,!0)):a=t;var h={schedulerName:i,showLog:e};o&&(h.resourceGuaranteedForHighPriority=s-2,h.highPriorityToGuaranteeResource=a.minimalLowQualityPriority),n=new ResourceScheduler.PriorityScheduler(r,s,a,h)}return{prioritizer:a,scheduler:n}}function a(e,t,i){if(i){var r=e.east-e.west,s=e.north-e.south,a=t.getImageLevel(),n=t.getLevelWidth(a)/t.getLevelHeight(a),o=r/s;if(o>n){var h=r;r=s*n;var l=h-r;e.east-=l/2,e.west+=l/2}else{var c=s;s=r/n;var u=c-s;e.north-=u/2,e.south+=u/2}}}function n(e,t){var i=t._getSizesCalculator(),r=t.getTileWidth(),s=t.getTileHeight(),a=e.minX,n=e.minY,o=e.maxXExclusive,h=e.maxYExclusive,l=e.screenWidth,c=e.screenHeight,u=o>a&&h>n;if(!u)throw"Parameters order is invalid";var d=i.getImageLevel(),_=i.getLevelWidth(d),m=i.getLevelHeight(d);if(0>o||a>=_||0>h||n>=m)return null;var p=i.getLevel(e),g=i.getLevelWidth(p),v=i.getLevelHeight(p),f=_/g,y=m/v,b=Math.floor(a/(f*r)),P=Math.floor(n/(y*s)),x=Math.ceil(o/(f*r)),w=Math.ceil(h/(y*s)),C=b*r,I=P*s,L=x*r,D=w*s,S=Math.max(0,Math.min(g,C)),k=Math.max(0,Math.min(v,I)),T=Math.max(0,Math.min(g,L)),R=Math.max(0,Math.min(v,D)),H=l/(L-C),j=c/(D-I),F={minX:S,minY:k,maxXExclusive:T,maxYExclusive:R,level:p},E={minX:S*f,minY:k*y,maxXExclusive:T*f,maxYExclusive:R*y},q={minX:Math.floor((S-C)*H),minY:Math.floor((k-I)*j),maxXExclusive:Math.ceil((T-C)*H),maxYExclusive:Math.ceil((R-I)*j)};return{imagePartParams:F,positionInImage:E,croppedScreen:q}}function o(e){try{return window&&window[e]}catch(t){}try{return globals&&globals[e]}catch(t){}try{return self&&self[e]}catch(t){}}function h(e,t){return d.concat(e.getScriptsToImport())}function l(e,t){if(t=t||{},t.imageImplementationClassName&&t.scriptsToImport)return t;var i=o(e),r=JSON.parse(JSON.stringify(t));return r.imageImplementationClassName=t.imageImplementationClassName||e,r.scriptsToImport=t.scriptsToImport||h(i,t),r}var c=e("frustumrequestsprioritizer.js");t.exports={calculateFrustum2DFromBounds:r,createScheduler:s,fixBounds:a,alignParamsToTilesAndLevel:n,getImageImplementation:o,getScriptsForWorkerImport:h,createInternalOptions:l};var u=new AsyncProxy.ScriptsToImportPool;u.addScriptFromErrorWithStackTrace(new Error);var d=u.getScriptsForWorkerImport()},{"frustumrequestsprioritizer.js":10}],13:[function(e,t,i){"use strict";function r(){this._first={_prev:null,_parent:this},this._last={_next:null,_parent:this},this._count=0,this._last._prev=this._first,this._first._next=this._last}t.exports=r,r.prototype.add=function(e,t){null!==t&&void 0!==t||(t=this._last),this._validateIteratorOfThis(t),++this._count;var i={_value:e,_next:t,_prev:t._prev,_parent:this};return i._prev._next=i,t._prev=i,i},r.prototype.remove=function(e){this._validateIteratorOfThis(e),--this._count,e._prev._next=e._next,e._next._prev=e._prev,e._parent=null},r.prototype.getValue=function(e){return this._validateIteratorOfThis(e),e._value},r.prototype.getFirstIterator=function(){var e=this.getNextIterator(this._first);return e},r.prototype.getLastIterator=function(){var e=this.getPrevIterator(this._last);return e},r.prototype.getNextIterator=function(e){return this._validateIteratorOfThis(e),e._next===this._last?null:e._next},r.prototype.getPrevIterator=function(e){return this._validateIteratorOfThis(e),e._prev===this._first?null:e._prev},r.prototype.getCount=function(){return this._count},r.prototype._validateIteratorOfThis=function(e){if(e._parent!==this)throw"iterator must be of the current LinkedList"}},{}],14:[function(e,t,i){"use strict";function r(){AsyncProxy.AsyncProxySlave.setSlaveSideCreator(function(){var e=new Array(arguments.length+1);e[0]=null;for(var t=0;t<arguments.length;++t)e[t+1]=arguments[t];var i=new(Function.prototype.bind.apply(imageDecoderFramework.ImageDecoder,e));return i})}e("imagedecoder.js");t.exports.getScriptUrl=function(){return a};var s=new Blob(["(",r.toString(),")()"],{type:"application/javascript"}),a=URL.createObjectURL(s)},{"imagedecoder.js":5}],15:[function(e,t,i){"use strict";function r(e){this._imageImplementation=s.getImageImplementation(e),this._sizesParams=null,this._sizesCalculator=null}t.exports=r;var s=e("imagehelperfunctions.js");r.prototype.getImageLevel=function(){this._validateSizesCalculator();var e=this._sizesCalculator.getImageLevel();return e},r.prototype.getNumResolutionLevelsForLimittedViewer=function(){this._validateSizesCalculator();var e=this._sizesCalculator.getNumResolutionLevelsForLimittedViewer();return e},r.prototype.getLevelWidth=function(e){this._validateSizesCalculator();var t=this._sizesCalculator.getLevelWidth(e);return t},r.prototype.getLevelHeight=function(e){this._validateSizesCalculator();var t=this._sizesCalculator.getLevelHeight(e);return t},r.prototype.getLevel=function(e){this._validateSizesCalculator();var t=this._sizesCalculator.getLevel(e);return t},r.prototype.getLowestQuality=function(){this._validateSizesCalculator();var e=this._sizesCalculator.getLowestQuality();return e},r.prototype.getHighestQuality=function(){this._validateSizesCalculator();var e=this._sizesCalculator.getHighestQuality();return e},r.prototype._getSizesCalculator=function(){return this._validateSizesCalculator(this),this._sizesCalculator},r.prototype._getSizesParams=function(){if(!this._sizesParams&&(this._sizesParams=this._getSizesParamsInternal(),!this._sizesParams))throw"getSizesParams() return falsy value; Maybe image not ready yet?";return this._sizesParams},r.prototype._getSizesParamsInternal=function(){throw"ImageParamsRetrieverProxy implemented did not implement _getSizesParamsInternal()"},r.prototype._validateSizesCalculator=function(){if(null===this._sizesCalculator){var e=this._getSizesParams();this._sizesCalculator=this._imageImplementation.createImageParamsRetriever(e)}}},{"imagehelperfunctions.js":12}],16:[function(e,t,i){"use strict";function r(){function e(e,i,r){if("callback"===e&&"statusCallback"===i){if(t||!r[0].isReady)return null;var s={sizesParams:this._getSizesParams()};this.getTileWidth&&(s.applicativeTileWidth=this.getTileWidth()),this.getTileHeight&&(s.applicativeTileHeight=this.getTileHeight()),AsyncProxy.AsyncProxySlave.sendUserDataToMaster(s),t=!0}}var t=!1;AsyncProxy.AsyncProxySlave.setBeforeOperationListener(e)}t.exports.getScriptUrl=function(){return a};var s=new Blob(["(",r.toString(),")()"],{type:"application/javascript"}),a=URL.createObjectURL(s)},{}],17:[function(e,t,i){"use strict";function r(e){a.call(this,e.imageImplementationClassName),this._imageWidth=null,this._imageHeight=null,this._internalSizesParams=null,this._options=e;var t=[e],i=e.scriptsToImport.concat([s.getScriptUrl()]);this._workerHelper=new AsyncProxy.AsyncProxyMaster(i,"imageDecoderFramework.Internals.FetchManager",t);var r=this._userDataHandler.bind(this);this._workerHelper.setUserDataHandler(r)}t.exports=r;var s=(e("imagehelperfunctions.js"),e("sendimageparameterstomaster.js")),a=e("imageparamsretrieverproxy.js");r.prototype=Object.create(a.prototype),r.prototype.open=function(e){return this._workerHelper.callFunction("open",[e],{isReturnPromise:!0})},r.prototype.close=function(){var e=this;return this._workerHelper.callFunction("close",[],{isReturnPromise:!0}).then(function(){e._workerHelper.terminate()})},r.prototype.createChannel=function(e){var t=this._workerHelper.wrapCallback(e,"FetchManager_createChannelCallback"),i=[t];this._workerHelper.callFunction("createChannel",i)},r.prototype.moveChannel=function(e,t){var i=[e,t];this._workerHelper.callFunction("moveChannel",i)},r.prototype.createRequest=function(e,t,i,r,s,a){function n(e){u._workerHelper.freeCallback(h),r.call(t,e)}var o=this._options.transferablePathsOfRequestCallback,h=this._workerHelper.wrapCallback(i.bind(t),"requestTilesProgressiveCallback",{isMultipleTimeCallback:!0,pathsToTransferables:o}),l=this._workerHelper.wrapCallback(n,"requestTilesProgressiveTerminatedCallback",{isMultipleTimeCallback:!1}),c=[e,{dummyThis:"dummyThis"},h,l,s,a],u=this;this._workerHelper.callFunction("createRequest",c)},r.prototype.manualAbortRequest=function(e){var t=[e];this._workerHelper.callFunction("manualAbortRequest",t)},r.prototype.setIsProgressiveRequest=function(e,t){var i=[e,t];this._workerHelper.callFunction("setIsProgressiveRequest",i)},r.prototype.setServerRequestPrioritizerData=function(e){this._workerHelper.callFunction("setServerRequestPrioritizerData",[e],{isSendImmediately:!0})},r.prototype.reconnect=function(){this._workerHelper.callFunction("reconnect")},r.prototype._getSizesParamsInternal=function(){return this._internalSizesParams},r.prototype._userDataHandler=function(e){this._internalSizesParams=e.sizesParams}},{"imagehelperfunctions.js":12,"imageparamsretrieverproxy.js":15,"sendimageparameterstomaster.js":16}],18:[function(e,t,i){"use strict";function r(e,t){o.call(this,e),this._imageWidth=null,this._imageHeight=null,this._tileWidth=0,this._tileHeight=0,this._sizesCalculator=null;var i=s.createInternalOptions(e,t),r=[e,i],h=s.getScriptsForWorkerImport(this._imageImplementation,t);h=h.concat([a.getScriptUrl(),n.getScriptUrl()]),this._workerHelper=new AsyncProxy.AsyncProxyMaster(h,"imageDecoderFramework.ImageDecoder",r);var l=this._imageOpened.bind(this);this._workerHelper.setUserDataHandler(l)}t.exports=r;var s=e("imagehelperfunctions.js"),a=e("sendimageparameterstomaster.js"),n=e("createimagedecoderonslaveside.js"),o=e("imageparamsretrieverproxy.js");r.prototype=Object.create(o.prototype),r.prototype.getTileWidth=function(){return this._validateSizesCalculator(),this._tileWidth},r.prototype.getTileHeight=function(){return this._validateSizesCalculator(),this._tileHeight},r.prototype.open=function(e){var t=this;return this._workerHelper.callFunction("open",[e],{isReturnPromise:!0}).then(function(e){return t._imageOpened(e),e})},r.prototype.close=function(){return this._workerHelper.callFunction("close",[],{isReturnPromise:!0})},r.prototype.createChannel=function(e){var t=this._workerHelper.wrapCallback(e,"ImageDecoder_createChannelCallback"),i=[t];this._workerHelper.callFunction("createChannel",i)},r.prototype.requestPixels=function(e){var t=["data","buffer"],i=[t],r=[e];this._workerHelper.callFunction("requestPixels",r,{isReturnPromise:!0,pathsToTransferablesInPromiseResult:i})},r.prototype.requestPixelsProgressive=function(e,t,i,r,s){function a(e){c._workerHelper.freeCallback(o),i(e)}var n,o=this._workerHelper.wrapCallback(t,"requestPixelsProgressiveCallback",{isMultipleTimeCallback:!0,pathsToTransferables:n}),h=this._workerHelper.wrapCallback(a,"requestPixelsProgressiveTerminatedCallback",{isMultipleTimeCallback:!1}),l=[e,o,h,r,s];this._workerHelper.callFunction("requestPixelsProgressive",l);var c=this},r.prototype.setServerRequestPrioritizerData=function(e){this._workerHelper.callFunction("setServerRequestPrioritizerData",[e],{isSendImmediately:!0})},r.prototype.setDecodePrioritizerData=function(e){this._workerHelper.callFunction("setDecodePrioritizerData",[e],{isSendImmediately:!0})},r.prototype.reconnect=function(){this._workerHelper.callFunction("reconnect")},r.prototype.alignParamsToTilesAndLevel=function(e){return s.alignParamsToTilesAndLevel(e,this)},r.prototype._imageOpened=function(e){this._internalSizesParams=e.sizesParams,this._tileWidth=e.applicativeTileWidth,this._tileHeight=e.applicativeTileHeight,this._validateSizesCalculator()},r.prototype._getSizesParamsInternal=function(){return this._internalSizesParams}},{"createimagedecoderonslaveside.js":14,"imagehelperfunctions.js":12,"imageparamsretrieverproxy.js":15,"sendimageparameterstomaster.js":16}],19:[function(e,t,i){"use strict";function r(e){this._options=e||{},this._imageImplementation=a.getImageImplementation(e.imageImplementationClassName);var t=(this._options.scriptsToImport||[]).concat([o]),i=[this._options];this._workerHelper=new AsyncProxy.AsyncProxyMaster(t,"ArbitraryClassName",i)}function s(){AsyncProxy.AsyncProxySlave.setSlaveSideCreator(function(e){var t=self[e.imageImplementationClassName];return t.createPixelsDecoder()})}t.exports=r;var a=e("imagehelperfunctions.js"),n=new Blob(["(",s.toString(),")()"],{type:"application/javascript"}),o=URL.createObjectURL(n);r.prototype.decode=function(e){var t=[["data","buffer"]],i=[e],r={pathsToTransferablesInPromiseResult:t,isReturnPromise:!0};return this._workerHelper.callFunction("decode",i,r)},r.prototype.terminate=function(){this._workerHelper.terminate()}},{"imagehelperfunctions.js":12}],20:[function(e,t,i){"use strict";function r(e,t,i){this._imageImplementationClassName=e,this._canvasUpdatedCallback=t,this._adaptProportions=i.adaptProportions,this._cartographicBounds=i.cartographicBounds,this._isMainImageOnUi=i.isMainImageOnUi,this._showLog=i.showLog,this._allowMultipleChannelsInSession=i.allowMultipleChannelsInSession,this._minFunctionCallIntervalMilliseconds=i.minFunctionCallIntervalMilliseconds,this._overviewResolutionX=i.overviewResolutionX||100,this._overviewResolutionY=i.overviewResolutionY||100,this._workersLimit=i.workersLimit,this._lastRequestIndex=0,this._pendingUpdateViewArea=null,this._regions=[],this._targetCanvas=null,this._callPendingCallbacksBound=this._callPendingCallbacks.bind(this),this._createdChannelBound=this._createdChannel.bind(this),this._pendingCallbacksIntervalHandle=0,this._pendingCallbackCalls=[],this._canShowDynamicRegion=!1,void 0===this._cartographicBounds&&(this._cartographicBounds={west:-175,east:175,south:-85,north:85}),void 0===this._adaptProportions&&(this._adaptProportions=!0);var r=this._isMainImageOnUi?s:a;this._image=new r(e,{serverRequestPrioritizer:"frustumOnly",decodePrioritizer:"frustumOnly",showLog:this._showLog,workersLimit:this._workersLimit})}t.exports=r;var s=e("imagedecoder.js"),a=e("workerproxyimagedecoder.js"),n=e("imagehelperfunctions.js"),o=1,h=2,l=0,c=1;r.prototype.setExceptionCallback=function(e){this._exceptionCallback=e},r.prototype.open=function(e){return this._image.open(e).then(this._opened.bind(this))["catch"](this._exceptionCallback)},r.prototype.close=function(){var e=this._image.close();return e["catch"](this._exceptionCallback),this._isReady=!1,this._canShowDynamicRegion=!1,this._targetCanvas=null,e},r.prototype.setTargetCanvas=function(e){this._targetCanvas=e},r.prototype.updateViewArea=function(e){if(null===this._targetCanvas)throw"Cannot update dynamic region before setTargetCanvas()";if(!this._canShowDynamicRegion)return void(this._pendingUpdateViewArea=e);var t=e.rectangle,i=e.screenSize,r={minX:t.west*this._scaleX+this._translateX,minY:t.north*this._scaleY+this._translateY,maxXExclusive:t.east*this._scaleX+this._translateX,maxYExclusive:t.south*this._scaleY+this._translateY,screenWidth:i.x,screenHeight:i.y},s=n.alignParamsToTilesAndLevel(r,this._image),a=null===s;if(!a){s.imagePartParams.quality=this._quality;var o=void 0!==this._dynamicFetchParams&&this._isImagePartsEqual(s.imagePartParams,this._dynamicFetchParams.imagePartParams);if(!o){e.imageRectangle=this._cartographicBoundsFixed,e.exactlevel=s.imagePartParams.level,this._image.setDecodePrioritizerData(e),this._image.setServerRequestPrioritizerData(e),this._dynamicFetchParams=s;var h=!1,l=!this._allowMultipleChannelsInSession;this._fetch(c,s,h,l)}}},r.prototype.getBounds=function(){if(!this._isReady)throw"ViewerImageDecoder error: Image is not ready yet";return this._cartographicBoundsFixed},r.prototype._isImagePartsEqual=function(e,t){var i=void 0!==this._dynamicFetchParams&&e.minX===t.minX&&e.minY===t.minY&&e.maxXExclusive===t.maxXExclusive&&e.maxYExclusive===t.maxYExclusive&&e.level===t.level;return i},r.prototype._fetch=function(e,t,i,r){function s(i){C._tilesDecodedCallback(e,t,f,i)}function a(r){r&&o.requestPriorityData.overrideHighestPriority&&C._image.requestPixelsProgressive(t.imagePartParams,s,a,h),C._fetchTerminatedCallback(e,t.imagePartParams.requestPriorityData,r,i)}var n=++this._lastRequestIndex,o=t.imagePartParams;o.requestPriorityData=o.requestPriorityData||{},o.requestPriorityData.requestIndex=n;var h,c=t.positionInImage.minX,u=t.positionInImage.minY,d=t.positionInImage.maxXExclusive,_=t.positionInImage.maxYExclusive,m=(c-this._translateX)/this._scaleX,p=(d-this._translateX)/this._scaleX,g=(u-this._translateY)/this._scaleY,v=(_-this._translateY)/this._scaleY,f={west:m,east:p,north:g,south:v},y=!1,b=this._regions[e];if(void 0!==b){var P=o.level,x=b.imagePartParams.level;if(y=P===x,y&&b.donePartParams&&(h=[b.donePartParams]),e!==l){var w=this._checkIfRepositionNeeded(b,o,f);w&&this._notifyNewPendingCalls()}}var C=this,I=r?this._channelHandle:void 0;this._image.requestPixelsProgressive(t.imagePartParams,s,a,h,I)},r.prototype._fetchTerminatedCallback=function(e,t,i,r){var s=this._regions[e];void 0!==s&&(t.overrideHighestPriority||t.requestIndex===this._lastRequestIndex)&&(s.isDone=!i&&this._isReady,s.isDone&&(s.donePartParams=s.imagePartParams),r&&this._image.createChannel(this._createdChannelBound))},r.prototype._createdChannel=function(e){this._channelHandle=e,this._startShowingDynamicRegion()},r.prototype._startShowingDynamicRegion=function(){this._canShowDynamicRegion=!0,null!==this._pendingUpdateViewArea&&(this.updateViewArea(this._pendingUpdateViewArea),this._pendingUpdateViewArea=null)},r.prototype._tilesDecodedCallback=function(e,t,i,r){if(this._isReady){var s=this._regions[e];if(void 0===s)switch(s={},this._regions[e]=s,e){case c:s.canvas=this._targetCanvas;break;case l:s.canvas=document.createElement("canvas");break;default:throw"Unexpected regionId "+e}var a=t.imagePartParams;!a.requestPriorityData.overrideHighestPriority&&a.requestPriorityData.requestIndex<s.currentDisplayRequestIndex||(this._checkIfRepositionNeeded(s,a,i),this._pendingCallbackCalls.push({type:o,region:s,decoded:r}),this._notifyNewPendingCalls())}},r.prototype._checkIfRepositionNeeded=function(e,t,i){var r=e.imagePartParams,s=e.donePartParams,a=t.level,n=void 0===r||r.minX!==t.minX||r.minY!==t.minY||r.maxXExclusive!==t.maxXExclusive||r.maxYExclusive!==t.maxYExclusive||r.level!==a;if(!n)return!1;var o,l,c,u,d,_=!1;void 0!==r&&(u=this._image.getLevelWidth(a)/this._image.getLevelWidth(r.level),d=this._image.getLevelHeight(a)/this._image.getLevelHeight(r.level),l={minX:Math.max(r.minX*u,t.minX),minY:Math.max(r.minY*d,t.minY),maxX:Math.min(r.maxXExclusive*u,t.maxXExclusive),maxY:Math.min(r.maxYExclusive*d,t.maxYExclusive)},_=l.maxX>l.minX&&l.maxY>l.minY),_&&(o={fromX:l.minX/u-r.minX,fromY:l.minY/d-r.minY,fromWidth:(l.maxX-l.minX)/u,fromHeight:(l.maxY-l.minY)/d,toX:l.minX-t.minX,toY:l.minY-t.minY,toWidth:l.maxX-l.minX,toHeight:l.maxY-l.minY},s&&r.level===a&&(c={minX:Math.max(s.minX,t.minX),minY:Math.max(s.minY,t.minY),maxXExclusive:Math.min(s.maxXExclusive,t.maxXExclusive),maxYExclusive:Math.min(s.maxYExclusive,t.maxYExclusive)})),e.imagePartParams=t,e.isDone=!1,e.currentDisplayRequestIndex=t.requestPriorityData.requestIndex;var m={type:h,region:e,position:i,donePartParams:c,copyData:o,pixelsWidth:t.maxXExclusive-t.minX,pixelsHeight:t.maxYExclusive-t.minY};return this._pendingCallbackCalls.push(m),!0},r.prototype._notifyNewPendingCalls=function(){this._isNearCallbackCalled||this._callPendingCallbacks()},r.prototype._callPendingCallbacks=function(){if(0===this._pendingCallbackCalls.length||!this._isReady)return void(this._isNearCallbackCalled=!1);this._isNearCallbackCalled&&clearTimeout(this._pendingCallbacksIntervalHandle),void 0!==this._minFunctionCallIntervalMilliseconds&&(this._pendingCallbacksIntervalHandle=setTimeout(this._callPendingCallbacksBound,this._minFunctionCallIntervalMilliseconds),this._isNearCallbackCalled=!0);for(var e=null,t=0;t<this._pendingCallbackCalls.length;++t){var i=this._pendingCallbackCalls[t];if(i.type===h)this._repositionCanvas(i),e=i.position;else{if(i.type!==o)throw"Internal ViewerImageDecoder Error: Unexpected call type "+i.type;this._pixelsUpdated(i)}}this._pendingCallbackCalls.length=0,this._canvasUpdatedCallback(e)},r.prototype._pixelsUpdated=function(e){var t=e.region,i=e.decoded;if(0!==i.imageData.width&&0!==i.imageData.height){var r=i.xInOriginalRequest,s=i.yInOriginalRequest,a=t.canvas.getContext("2d");a.putImageData(i.imageData,r,s)}},r.prototype._repositionCanvas=function(e){var t,i=e.region,r=e.position,s=e.donePartParams,a=e.copyData,n=e.pixelsWidth,o=e.pixelsHeight,h=i.canvas.getContext("2d");void 0!==a&&(a.fromWidth===a.toWidth&&a.fromHeight===a.toHeight?t=h.getImageData(a.fromX,a.fromY,a.fromWidth,a.fromHeight):(this._tmpCanvas||(this._tmpCanvas=document.createElement("canvas"),this._tmpCanvasContext=this._tmpCanvas.getContext("2d")),this._tmpCanvas.width=a.toWidth,this._tmpCanvas.height=a.toHeight,this._tmpCanvasContext.drawImage(i.canvas,a.fromX,a.fromY,a.fromWidth,a.fromHeight,0,0,a.toWidth,a.toHeight),t=this._tmpCanvasContext.getImageData(0,0,a.toWidth,a.toHeight))),i.canvas.width=n,i.canvas.height=o,i!==this._regions[l]&&this._copyOverviewToCanvas(h,r,n,o),void 0!==a&&h.putImageData(t,a.toX,a.toY),i.position=r,i.donePartParams=s},r.prototype._copyOverviewToCanvas=function(e,t,i,r){var s=this._regions[l].position,a=this._regions[l].imagePartParams,n=a.maxXExclusive-a.minX,o=a.maxYExclusive-a.minY,h=s.east-s.west,c=s.north-s.south,u=n/h,d=o/c,_=t.east-t.west,m=t.north-t.south,p=_*u,g=m*d,v=t.west-s.west,f=s.north-t.north,y=v*u,b=f*d;e.drawImage(this._regions[l].canvas,y,b,p,g,0,0,i,r)},r.prototype._opened=function(){this._isReady=!0;var e={west:this._cartographicBounds.west,east:this._cartographicBounds.east,south:this._cartographicBounds.south,north:this._cartographicBounds.north};n.fixBounds(e,this._image,this._adaptProportions),this._cartographicBoundsFixed=e;var t=this._image.getImageLevel(),i=this._image.getLevelWidth(t),r=this._image.getLevelHeight(t);this._quality=this._image.getHighestQuality();var s=e.east-e.west,a=e.north-e.south;this._scaleX=i/s,this._scaleY=-r/a,this._translateX=-e.west*this._scaleX,this._translateY=-e.north*this._scaleY;var o={minX:0,minY:0,maxXExclusive:i,maxYExclusive:r,screenWidth:this._overviewResolutionX,screenHeight:this._overviewResolutionY},h=n.alignParamsToTilesAndLevel(o,this._image);h.imagePartParams.requestPriorityData=h.imagePartParams.requestPriorityData||{},h.imagePartParams.requestPriorityData.overrideHighestPriority=!0,h.imagePartParams.quality=this._image.getLowestQuality();var c=!this._allowMultipleChannelsInSession;this._fetch(l,h,c),this._allowMultipleChannelsInSession&&this._startShowingDynamicRegion()}},{"imagedecoder.js":5,"imagehelperfunctions.js":12,"workerproxyimagedecoder.js":18}],21:[function(e,t,i){"use strict";t.exports.ViewerImageDecoder=e("viewerimagedecoder.js"),t.exports.ImageDecoder=e("imagedecoder.js"),t.exports.SimpleFetcher=e("simplefetcher.js"),t.exports.SimplePixelsDecoderBase=e("simplepixelsdecoderbase.js"),t.exports.CesiumImageDecoderLayerManager=e("_cesiumimagedecoderlayermanager.js"),t.exports.ImageDecoderImageryProvider=e("imagedecoderimageryprovider.js"),t.exports.ImageDecoderRegionLayer=e("imagedecoderregionlayer.js"),t.exports.Internals={FetchManager:e("fetchmanager.js")}},{"_cesiumimagedecoderlayermanager.js":2,"fetchmanager.js":9,"imagedecoder.js":5,"imagedecoderimageryprovider.js":4,"imagedecoderregionlayer.js":22,"simplefetcher.js":25,"simplepixelsdecoderbase.js":28,"viewerimagedecoder.js":20}],22:[function(e,t,i){"use strict";function r(){return{initialize:function(e){this._options=e||{},void 0!==this._options.latLngBounds&&(this._options=JSON.parse(JSON.stringify(e)),this._options.cartographicBounds={west:e.latLngBounds.getWest(),east:e.latLngBounds.getEast(),south:e.latLngBounds.getSouth(),north:e.latLngBounds.getNorth()}),this._targetCanvas=null,this._canvasPosition=null,this._canvasUpdatedCallbackBound=this._canvasUpdatedCallback.bind(this),this._image=null,this._exceptionCallback=null},setExceptionCallback:function(e){this._exceptionCallback=e,null!==this._image&&this._image.setExceptionCallback(e)},_createImage:function(){null===this._image&&(this._image=new s(this._options.imageImplementationClassName,this._canvasUpdatedCallbackBound,this._options),null!==this._exceptionCallback&&this._image.setExceptionCallback(this._exceptionCallback),this._image.open(this._options.url))},onAdd:function(e){if(void 0!==this._map)throw"Cannot add this layer to two maps";this._map=e,this._createImage(),this._targetCanvas=L.DomUtil.create("canvas","image-decoder-layer-canvas leaflet-zoom-animated"),this._image.setTargetCanvas(this._targetCanvas),this._canvasPosition=null,e.getPanes().mapPane.appendChild(this._targetCanvas),e.on("viewreset",this._moved,this),e.on("move",this._moved,this),L.Browser.any3d&&e.on("zoomanim",this._animateZoom,this),this._moved()},onRemove:function(e){if(e!==this._map)throw"Removed from wrong map";e.off("viewreset",this._moved,this),e.off("move",this._moved,this),e.off("zoomanim",this._animateZoom,this),e.getPanes().mapPane.removeChild(this._targetCanvas),this._targetCanvas=null,this._canvasPosition=null,this._map=void 0,this._image.close(),this._image=null},_moved:function(){this._moveCanvases();var e=a(this._map);this._image.updateViewArea(e)},_canvasUpdatedCallback:function(e){null!==e&&(this._canvasPosition=e,this._moveCanvases())},_moveCanvases:function(){if(null!==this._canvasPosition){var e=this._canvasPosition.west,t=this._canvasPosition.east,i=this._canvasPosition.south,r=this._canvasPosition.north,s=this._map.latLngToLayerPoint([r,e]),a=this._map.latLngToLayerPoint([i,t]),n=a.subtract(s);L.DomUtil.setPosition(this._targetCanvas,s),this._targetCanvas.style.width=n.x+"px",this._targetCanvas.style.height=n.y+"px"}},_animateZoom:function(e){var t=this._canvasPosition.west,i=this._canvasPosition.east,r=this._canvasPosition.south,s=this._canvasPosition.north,a=this._map._latLngToNewLayerPoint([s,t],e.zoom,e.center),n=this._map._latLngToNewLayerPoint([r,i],e.zoom,e.center),o=this._map.getZoomScale(e.zoom),h=n.subtract(a),l=h.multiplyBy(.5*(1-1/o)),c=a.add(l);this._targetCanvas.style[L.DomUtil.TRANSFORM]=L.DomUtil.getTranslateString(c)+" scale("+o+") "}}}var s=e("viewerimagedecoder.js"),a=e("leafletfrustumcalculator.js");self.L?t.exports=L.Class.extend(r()):t.exports=function(){throw new Error("Cannot instantiate ImageDecoderRegionLayer: No Leaflet namespace in scope")}},{"leafletfrustumcalculator.js":23,"viewerimagedecoder.js":20}],23:[function(e,t,i){"use strict";var r=e("imagehelperfunctions.js");t.exports=function(e){var t=e.getSize(),i=e.getBounds(),s={west:i.getWest(),east:i.getEast(),south:i.getSouth(),north:i.getNorth()},a=r.calculateFrustum2DFromBounds(s,t);return a}},{"imagehelperfunctions.js":12}],24:[function(e,t,i){"use strict";function r(e){this._subscribersByKey=new a(e)}t.exports=r;var s=e("linkedlist.js"),a=e("hashmap.js");
r.prototype.publish=function(e,t,i){var r=this._subscribersByKey.getFromKey(e);if(r){for(var s=r.subscribersList.getFirstIterator(),a=[];null!==s;){var n=r.subscribersList.getValue(s);n.isEnded||(a.push(n.listener),i&&(--r.subscribersNotEndedCount,n.isEnded=!0)),s=r.subscribersList.getNextIterator(s)}for(var o=0;o<a.length;++o)a[o].call(this,e,t,i)}},r.prototype.subscribe=function(e,t){var i=this._subscribersByKey.tryAdd(e,function(){return{subscribersList:new s,subscribersNotEndedCount:0}});++i.value.subscribersNotEndedCount;var r=i.value.subscribersList.add({listener:t,isEnded:!1}),a={_listIterator:r,_hashIterator:i.iterator};return a},r.prototype.unsubscribe=function(e){var t=this._subscribersByKey.getFromIterator(e._hashIterator),i=t.subscribersList.getValue(e._listIterator);t.subscribersList.remove(e._listIterator),0===t.subscribersList.getCount()?this._subscribersByKey.remove(e._hashIterator):i.isEnded||(--t.subscribersNotEndedCount,i.isEnded=!0)},r.prototype.isKeyNeedFetch=function(e){var t=this._subscribersByKey.getFromKey(e);return!!t&&t.subscribersNotEndedCount>0}},{"hashmap.js":11,"linkedlist.js":13}],25:[function(e,t,i){"use strict";function r(e,t){if(this._url=null,this._fetcherMethods=e,this._options=t||{},this._isReady=!0,!this._fetcherMethods.getDataKeys)throw"SimpleFetcher error: getDataKeys is not implemented";if(!this._fetcherMethods.fetch&&!this._fetcherMethods.fetchProgressive)throw"SimpleFetcher error: Neither fetch nor fetchProgressive methods are implemented";if(!this._fetcherMethods.getHashCode)throw"SimpleFetcher error: getHashCode is not implemented";if(!this._fetcherMethods.isEqual)throw"SimpleFetcher error: isEqual is not implemented";this._hasher={_fetcherMethods:this._fetcherMethods,getHashCode:function(e){return this._fetcherMethods.getHashCode(e)},isEqual:function(e,t){return e.maxQuality!==t.maxQuality?!1:this._fetcherMethods.isEqual(e.dataKey,t.dataKey)}},this._fetcherMethods.createDataPublisher?this._dataPublisher=this.fetcherMethods.createDataPublisher(this._hasher):this._dataPublisher=new n(this._hasher)}t.exports=r;var s=e("simpleimagedatacontext.js"),a=e("simplenonprogressivefetchhandle.js"),n=e("datapublisher.js");r.prototype.fetchProgressive=function(e,t,i,r,s){if(this._ensureReady(),!this._fetcherMethods.fetchProgressive){var n=new a(this._fetcherMethods,i,r,this._options);return n.fetch(t),n}return this._fetcherMethods.fetchProgressive(e,t,i,r,s)},r.prototype.reconnect=function(){if(this._ensureReady(),!this._fetcherMethods.reconnect)throw"SimpleFetcher error: reconnect is not implemented";this._fetcherMethods.reconnect()},r.prototype.createImageDataContext=function(e){this._ensureReady();var t=this._fetcherMethods.getDataKeys(e);return new s(t,e,this._dataPublisher,this._hasher)},r.prototype.fetch=function(e){function t(e,t,i){var a={dataKey:e,maxQuality:r};s._dataPublisher.publish(a,t,i)}function i(e){var t={dataKey:e,maxQuality:r};return s._dataPublisher.isKeyNeedFetch(t)}var r=e.getMaxQuality(),s=this;return this.fetchProgressive(e.getImagePartParams(),e.getDataKeys(),t,i,r)},r.prototype.startMovableFetch=function(e,t){t.fetchHandle=this.fetch(e)},r.prototype.moveFetch=function(e,t){t.fetchHandle.abortAsync(),t.fetchHandle=this.fetch(e)},r.prototype.close=function(e){return this._ensureReady(),this._isReady=!1,new Promise(function(e,t){e()})},r.prototype._ensureReady=function(){if(!this._isReady)throw"SimpleFetcher error: fetch client is not opened"}},{"datapublisher.js":24,"simpleimagedatacontext.js":26,"simplenonprogressivefetchhandle.js":27}],26:[function(e,t,i){"use strict";function r(e,t,i,r){this._dataByKey=new s(r),this._dataToReturn={imagePartParams:JSON.parse(JSON.stringify(t)),fetchedItems:[]},this._maxQuality=t.quality,this._fetchEndedCount=0,this._fetchedLowQualityCount=0,this._dataListeners=[],this._dataKeys=e,this._imagePartParams=t,this._dataPublisher=i,this._isProgressive=!1,this._isDisposed=!1,this._subscribeHandles=[];for(var a=this._dataFetched.bind(this),n=0;n<e.length;++n){var o=this._dataPublisher.subscribe({dataKey:e[n],maxQuality:this._maxQuality},a);this._subscribeHandles.push(o)}}t.exports=r;var s=e("hashmap.js");r.prototype.getMaxQuality=function(){return this._maxQuality},r.prototype.getDataKeys=function(){return this._dataKeys},r.prototype.getImagePartParams=function(){return this._imagePartParams},r.prototype.hasData=function(){return this._fetchedLowQualityCount==this._dataKeys.length},r.prototype.getFetchedData=function(){if(!this.hasData())throw"SimpleImageDataContext error: cannot call getFetchedData before hasData = true";return this._dataToReturn},r.prototype.on=function(e,t){if(this._isDisposed)throw"Cannot register to event on disposed ImageDataContext";if("data"!==e)throw"SimpleImageDataContext error: Unexpected event "+e;this._dataListeners.push(t)},r.prototype.isDone=function(){return this._fetchEndedCount===this._dataKeys.length},r.prototype.dispose=function(){this._isDisposed=!0;for(var e=0;e<this._subscribeHandles.length;++e)this._dataPublisher.unsubscribe(this._subscribeHandles[e]);this._subscribeHandles=[],this._dataListeners=[]},r.prototype.setIsProgressive=function(e){var t=this._isProgressive;if(this._isProgressive=e,!t&&e&&this.hasData())for(var i=0;i<this._dataListeners.length;++i)this._dataListeners[i](this)},r.prototype._dataFetched=function(e,t,i){if(this._isDisposed)throw"Unexpected dataFetched listener call on disposed ImageDataContext";var r=this,s=this._dataByKey.tryAdd(e,function(){return r._dataToReturn.fetchedItems.push({key:e.dataKey,data:t}),++r._fetchedLowQualityCount,{fetchEnded:!1,fetchedItemsOffset:r._dataToReturn.fetchedItems.length-1}});if(!s.value.fetchEnded&&(this._dataToReturn.fetchedItems[s.value.fetchedItemsOffset].data=t,i&&(s.value.fetchEnded=!0,++this._fetchEndedCount),this.isDone()||this.hasData()&&this._isProgressive))for(var a=0;a<this._dataListeners.length;++a)this._dataListeners[a](this)}},{"hashmap.js":11}],27:[function(e,t,i){"use strict";function r(e,t,i,r){this._fetchMethods=e,this._dataCallback=t,this._queryIsKeyNeedFetch=i,this._fetchLimit=(r||{}).fetchLimitPerFetcher||2,this._keysToFetch=null,this._nextKeyToFetch=0,this._activeFetches={},this._activeFetchesCount=0,this._isAborted=!1,this._isStoppedCalled=!1,this._resolveAbort=null}t.exports=r,r.prototype.fetch=function(e){if(null!==this._keysToFetch)throw"SimpleNonProgressiveFetchHandle error: Request fetcher can fetch only one region";for(this._keysToFetch=e,this._nextKeyToFetch=0;this._activeFetchesCount<this._fetchLimit&&this._fetchSingleKey(););},r.prototype.abortAsync=function(){var e=this;return new Promise(function(t,i){0===e._activeFetchesCount?t():this._resolveAbort=t})},r.prototype._fetchSingleKey=function(){var e;do{if(this._nextKeyToFetch>=this._keysToFetch.length)return!1;e=this._keysToFetch[this._nextKeyToFetch++]}while(!this._queryIsKeyNeedFetch(e));var t=this;return this._activeFetches[e]=!0,++this._activeFetchesCount,this._fetchMethods.fetch(e).then(function(i){t._dataCallback(e,i,!0),t._fetchEnded(null,e,i)})["catch"](function(i){t._fetchEnded(i,e)}),!0},r.prototype._fetchEnded=function(e,t,i){delete this._activeFetches[t],--this._activeFetchesCount,this._resolveAbort?0===this._activeFetchesCount&&(this._resolveAbort(),this._resolveAbort=null):this._fetchSingleKey()}},{}],28:[function(e,t,i){"use strict";function r(){r.prototype.decode=function(e){for(var t=e.imagePartParams,i=t.maxXExclusive-t.minX,r=t.maxYExclusive-t.minY,s=new ImageData(i,r),a=[],n=0;n<e.fetchedItems.length;++n)a.push(this.decodeRegion(s,t.minX,t.minY,e.fetchedItems[n].key,e.fetchedItems[n].data));return Promise.all(a).then(function(){return s})},r.prototype.decodeRegion=function(e,t,i,r){throw"SimplePixelsDecoderBase error: decodeRegion is not implemented"}}t.exports=r},{}]},{},[21])(21)});
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var t;t="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this,t.webjpip=e()}}(function(){return function e(t,n,r){function i(s,o){if(!n[s]){if(!t[s]){var l="function"==typeof require&&require;if(!o&&l)return l(s,!0);if(a)return a(s,!0);var u=new Error("Cannot find module '"+s+"'");throw u.code="MODULE_NOT_FOUND",u}var c=n[s]={exports:{}};t[s][0].call(c.exports,function(e){var n=t[s][1][e];return i(n?n:e)},c,c.exports,e,t,n,r)}return n[s].exports}for(var a="function"==typeof require&&require,s=0;s<r.length;s++)i(r[s]);return i}({1:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js"),i=e("jpip-runtime-factory.js");t.exports.JpipCodestreamClient=function(e){function t(e){var t=null;null!==e.exception&&(t=e.exception.toString());var n={isReady:e.isReady,exception:t};C(n)}function n(e,t,n){for(var i=new Array(e.length),a=0;a<e.length;++a){var s=e[a].minNumQualityLayers;if("max"!==s){if(void 0!==t&&s>t)throw new r.jpipExceptions.ArgumentException("progressiveness["+a+"].minNumQualityLayers",s,"minNumQualityLayers is bigger than fetchParams.maxNumQualityLayers");s=o(s,n,"progressiveness["+a+"].minNumQualityLayers")}i[a]={minNumQualityLayers:s}}return i}function a(e){var t=[],n=g.getDefaultTileStructure(),r=n.getNumQualityLayers(),i="max";void 0!==e&&(r=Math.min(r,e),i=r);for(var a=4>r?r-1:3,s=1;a>s;++s)t.push({minNumQualityLayers:s});var o=Math.round(r/2);return o>a&&t.push({minNumQualityLayers:o}),t.push({minNumQualityLayers:i}),t}function s(e){var t=o(e.numResolutionLevelsToCut,"numResolutionLevelsToCut",void 0,!0),n=o(e.maxNumQualityLayers,"maxNumQualityLayers",void 0,!0),i=o(e.minX,"minX"),a=o(e.minY,"minY"),s=o(e.maxXExclusive,"maxXExclusive"),l=o(e.maxYExclusive,"maxYExclusive"),u=g.getLevelWidth(t),c=g.getLevelHeight(t);if(0>i||s>u||0>a||l>c||i>=s||a>=l)throw new r.jpipExceptions.ArgumentException("codestreamPartParams",e);var p={minX:i,minY:a,maxXExclusive:s,maxYExclusive:l,numResolutionLevelsToCut:t,maxNumQualityLayers:n};return p}function o(e,t,n,i){if(void 0===e&&(void 0!==n||i))return n;var a=+e;if(isNaN(a)||a!==Math.floor(a))throw new r.jpipExceptions.ArgumentException(t,e);return a}e=e||{};var l=i,u=l.createDatabinsSaver(!1),c=u.getMainHeaderDatabin(),p=l.createMarkersParser(c),f=l.createOffsetsCalculator(c,p),d=l.createStructureParser(u,p,f),h="RPCL",g=l.createCodestreamStructure(d,h),v=l.createQualityLayersCache(g),m=l.createHeaderModifier(g,f,h),x=l.createCodestreamReconstructor(g,u,m,v),E=l.createPacketsDataCollector(g,u,v),y=e.maxChannelsInSession||1,j=e.maxRequestsWaitingForResponseInChannel||1,b=l.createReconnectableRequester(y,j,g,u),I={requester:b,reconstructor:x,packetsDataCollector:E,qualityLayersCache:v,codestreamStructure:g,databinsSaver:u,jpipFactory:l},C=null;return this.setStatusCallback=function(e){C=e,null!==e?b.setStatusCallback(t):b.setStatusCallback(null)},this.open=function(e){b.open(e)},this.close=function(e){b.close(e)},this.getSizesParams=function(){if(!b.getIsReady())throw new r.jpipExceptions.IllegalOperationException("Cannot get codestream structure before image is ready");var e=g.getSizesParams(),t=JSON.parse(JSON.stringify(e)),n=g.getDefaultTileStructure(),i=n.getDefaultComponentStructure();return t.defaultNumQualityLayers=n.getNumQualityLayers(),t.defaultNumResolutionLevels=i.getNumResolutionLevels(),t},this.createDataRequest=function(e,t,n,i){if(i=i||{},void 0!==i.isOnlyWaitForData)throw new r.jpipExceptions.ArgumentException("options.isOnlyWaitForData",i.isOnlyWaitForData,"isOnlyWaitForData is supported only for progressive request");var a,o=s(e);if(i.useCachedDataOnly)a=[{minNumQualityLayers:0}];else{var u=e.maxNumQualityLayers,c=void 0===u?"max":u;a=[{minNumQualityLayers:c}]}var p=l.createRequestContext(I,o,t,a,{disableServerRequests:!!i.useCachedDataOnly,isMovable:!1,userContextVars:n,failureCallback:i.failureCallback});return p},this.createProgressiveDataRequest=function(e,t,i,o,u){if(o=o||{},void 0!==o.useCachedDataOnly)throw new r.jpipExceptions.ArgumentException("options.useCachedDataOnly",o.useCachedDataOnly,"useCachedDataOnly is not supported for progressive request");var c,p=s(e);c=void 0===u?a(p.maxNumQualityLayers):n(u,p.maxNumQualityLayers,"maxNumQualityLayers");var f=l.createRequestContext(I,p,t,c,{disableServerRequests:!!o.isOnlyWaitForData,isMovable:!1,userContextVars:i,failureCallback:o.failureCallback});return f},this.createMovableRequest=function(e,t){var n=null,r=a(),i=l.createRequestContext(I,n,e,r,{disableServerRequests:!1,isMovable:!0,userContextVars:t});return i},this.reconnect=function(){b.reconnect()},this}},{"j2k-jpip-globals.js":12,"jpip-runtime-factory.js":13}],2:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipCodestreamSizesCalculator=function(e){function t(e){var t=e.numResolutionLevelsToCut,r=p(t),a=f(t),l=n(e),u=l.minTileX+l.minTileY*o(),c=l.maxTileXExclusive-1+(l.maxTileYExclusive-1)*o(),d=s(u),h=s(c),g=i(d,t),v=i(h,t),m=g[0],x=g[1],E=l.maxTileXExclusive-l.minTileX,y=l.maxTileYExclusive-l.minTileY;return E>1&&(m+=v[0],m+=r*(E-2)),y>1&&(x+=v[1],x+=a*(y-2)),{width:m,height:x}}function n(e){var t=e.numResolutionLevelsToCut,n=p(t),r=f(t),i=g(t),a=v(t),s=(e.minX-i)/n,u=(e.minY-a)/r,c=(e.maxXExclusive-i)/n,d=(e.maxYExclusive-a)/r,h=Math.max(0,1+s),m=Math.max(0,1+u),x=Math.min(o(),1+c),E=Math.min(l(),1+d),y={minTileX:Math.floor(h),minTileY:Math.floor(m),maxTileXExclusive:Math.ceil(x),maxTileYExclusive:Math.ceil(E)};return y}function i(e,t){var n=a(e.horizontalEdgeType,g,u,p),r=a(e.verticalEdgeType,v,c,f);if(void 0!==t){var i=1<<t;n=Math.ceil(n/i),r=Math.ceil(r/i)}return[n,r]}function a(e,t,n,i){var a;switch(e){case x:a=t();break;case E:var s=i(),o=n()-t();a=o%s,0===a&&(a=s);break;case m:a=i();break;default:throw new r.jpipExceptions.InternalErrorException("Unexpected edge type: "+e)}return a}function s(e){var t=o(),n=l(),i=e%t,a=Math.floor(e/t);if(a>n||0>i||0>a)throw new r.jpipExceptions.InternalErrorException("Tile index "+e+" is not in range");var s=0===i?x:i===t-1?E:m,u=0===a?x:a===n-1?E:m,c={horizontalEdgeType:s,verticalEdgeType:u};return c}function o(){var t=Math.ceil(e.imageWidth/e.tileWidth);return t}function l(){var t=Math.ceil(e.imageHeight/e.tileHeight);return t}function u(n){if(void 0===n)return e.imageWidth;var r=t({minX:0,maxXExclusive:e.imageWidth,minY:0,maxYExclusive:e.imageHeight,numResolutionLevelsToCut:n});return r.width}function c(n){if(void 0===n)return e.imageHeight;var r=t({minX:0,maxXExclusive:e.imageWidth,minY:0,maxYExclusive:e.imageHeight,numResolutionLevelsToCut:n});return r.height}function p(t){if(void 0===t)return e.tileWidth;var n=1<<t,r=Math.ceil(e.tileWidth/n);return r}function f(t){if(void 0===t)return e.tileHeight;var n=1<<t,r=Math.ceil(e.tileHeight/n);return r}function d(){return e.firstTileOffsetX}function h(){return e.firstTileOffsetY}function g(e){var t=p()-d(),n=u();t>n&&(t=n);var r=1<<e,i=Math.ceil(t/r);return i}function v(e){var t=f()-h(),n=c();t>n&&(t=n);var r=1<<e,i=Math.ceil(t/r);return i}var m=0,x=1,E=2;return this.EDGE_TYPE_NO_EDGE=m,this.EDGE_TYPE_FIRST=x,this.EDGE_TYPE_LAST=E,this.getSizeOfPart=t,this.getTilesFromPixels=n,this.getNumTilesX=o,this.getNumTilesY=l,this.getLevelWidth=u,this.getLevelHeight=c,this.getTileWidth=p,this.getTileHeight=f,this.getFirstTileOffsetX=d,this.getFirstTileOffsetY=h,this.getFirstTileWidth=g,this.getFirstTileHeight=v,this.isEdgeTileId=s,this.getTileSize=i,this.getDefaultNumResolutionLevels=function(){if(void 0===e.defaultNumResolutionLevels)throw"This method is available only when jpipSizesCalculator is created from params returned by jpipCodestreamClient. It shall be used for JPIP API purposes only";return e.defaultNumResolutionLevels},this.getDefaultNumQualityLayers=function(){if(void 0===e.defaultNumQualityLayers)throw"This method is available only when jpipSizesCalculator is created from params returned by jpipCodestreamClient. It shall be used for JPIP API purposes only";return e.defaultNumQualityLayers},this}},{"j2k-jpip-globals.js":12}],3:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipRequestContext=function i(){function i(n,d,h,g,v){function m(e){w();var t=I(e),n=D.getAllCodeblocksData(t.codestreamPartParams,t.minNumQualityLayers);if(null===n.codeblocksData)throw new r.jpipExceptions.InternalErrorException("Could not collect codeblocks although progressiveness stage has been reached");return X=n.alreadyReturnedCodeblocks,n.codeblocksData}function x(){if(w(),e(W),null===F&&(F=q.createRequestDatabinsListener(d,j,N,B,M),b(),U=_===g.length),z){if(C(s,"tryContinueRequest(): isWaitingForServer"),U)throw new r.jpipExceptions.InternalErrorException("Inconsistent state: isWaitingForServer=true, needMoreRequests=false");return!U}if(U)return C(T,"tryContinueRequest(): !needMoreRequests"),!U;Q=!0;var t=U?T:s;if(C(t,"tryContinueRequest(): end function"),z||k)return!U;null!==R&&S.stopRequestAsync(R),z=!0;var n=g[_].minNumQualityLayers;return O&&void 0===V&&(V=S.dedicateChannelForMovableRequest()),R=S.requestData(d,E,y,n,V),!U}function E(e,t){if(t&&e===R)throw new r.jpipExceptions.IllegalDataException("JPIP server not returned all data","D.3")}function y(){C(u,"endAsync()"),void 0!==P?P(H,L):J=!0}function j(e){if(Y=e,W===u)throw new r.jpipExcpetions.InternalErrorException("Callback from requestDatabinsListener after request ended");if(Q){if(b()&&(Q=!1,z=!1),C(o,"qualityLayerReachedCallback"),U)throw new r.jpipExceptions.InternalErrorException("Request already done but callback is called");U=_===g.length,h(H,L,U),t(W)}}function b(){var e=g[_].minNumQualityLayers;if(e>Y)return!1;for("max"===Y&&(_=g.length);_<g.length;){var t=g[_].minNumQualityLayers;if("max"===t||t>Y)break;++_}return!0}function I(n){if(e(W,!0),null===d)throw new r.jpipExceptions.InvalidOperationException("Cannot get data of zombie request with no codestreamPartParams");var i=_===g.length;if(i||t(W),0===_)throw new r.jpipExceptions.IllegalOperationException("Cannot create codestream before first progressiveness stage has been reached");var a=g[_-1].minNumQualityLayers,s=d;return void 0!==n&&(s=Object.create(d),s.maxNumQualityLayers=n,"max"!==a&&(a=Math.min(a,n))),{codestreamPartParams:s,minNumQualityLayers:a}}function C(e,t){f&&console.log("Request "+Z+" status changed: "+W+" -> "+e+" ("+t+")"),null!==F&&e===u&&(F.unregister(),F=null),W=e,e!==l&&e!==u||null!==R&&(S.stopRequestAsync(R),R=null)}function w(){if(J)throw new r.jpipExceptions.InternalErrorException("An error occurred while previous request from server. Use ignorePreviousFailure() to ignore and continue")}var k=v.disableServerRequests,O=v.isMovable,L=v.userContextVars,P=v.failureCallback,R=null,T=O?c:o,S=n.requester,A=n.reconstructor,D=n.packetsDataCollector,M=n.qualityLayersCache,N=n.codestreamStructure,B=n.databinsSaver,q=n.jpipFactory,F=null,H=this,_=0,X=null,Y=0,W=a(d,O),J=!1,Q=!1,z=!1,U=!1,V=v.dedicatedChannelHandle,Z=++p;this.getRequestId=function(){return Z},this.createMovedRequest=function(e,t){if(!O)throw new r.jpipExceptions.InvalidOperationException("createMovedRequest() is supported only for movable requests. Create the request with options.isMovable = true");w(),C(u,"createMovedRequest()");var a=v;void 0===v.dedicatedChannelHandle&&void 0!==V&&(a=Object.create(v),a.dedicatedChannelHandle=V);var s=new i(n,e||d,h,t||g,a);return s},this.ignorePreviousFailure=function(){J=!1},this.createCodestream=function(e,t){w();var n=I(t),i=A.createCodestreamForRegion(n.codestreamPartParams,n.minNumQualityLayers,e);if(null===i)throw new r.jpipExceptions.InternalErrorException("Could not reconstruct codestream although progressiveness stage has been reached");return i},this.getNewCodeblocksData=function(e){if(w(),null===X){var t=m();return t}var n=I(e),i=D.getNewCodeblocksDataAndUpdateReturnedCodeblocks(n.codestreamPartParams,n.minNumQualityLayers,X);if(null===i)throw new r.jpipExceptions.InternalErrorException("Could not collect codeblocks although progressiveness stage has been reached");return i},this.endAsync=function(){if(O)throw new r.jpipExceptions.InvalidOperationException("endAsync() is not supported for movable requests");w(),e(W),C(u,"endAsync()")},this.pauseAsync=function(){w(),e(W),C(l,"pauseAsync()")},this.hasData=function(){return w(),_>0},this.getAllCodeblocksData=m,this.tryContinueRequest=x}function e(e,t){var r="Cannot perform this operation after request ended";if(n(e,u,r),!t){var i="Cannot perform this operation on zombie request (= request with codestreamPartParams = null, used as the first request of movable request";n(e,c,i)}}function t(e){var t="Call for endAsync(), pauseAsync() or tryContinueRequest() has not been performed";n(e,o,t)}function n(e,t,n){if(e===t)throw new r.jpipExceptions.IllegalOperationException(n)}function a(e,t){if(null!==e)return l;if(t)return c;throw new r.jpipExceptions.ArgumentException("codestreamPartParams",e,"Non movable request must  have codestreamPartParams !== null")}var s=1,o=2,l=3,u=4,c=5,p=0,f=!1;return i}()},{"j2k-jpip-globals.js":12}],4:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.CompositeArray=function(e){function t(t,n){if(void 0===t||void 0===n)throw new r.jpipExceptions.InternalErrorException("minOffset or maxOffset is undefined for CompositeArray.copyToArray");if(e>t)throw new r.jpipExceptions.InternalErrorException("minOffset ("+t+") must be smaller than CompositeArray offset ("+e+")");if(n>e+s)throw new r.jpipExceptions.InternalErrorException("maxOffset ("+n+") must be larger than CompositeArray end offset ("+e+s+")")}function n(t,n){var a=Math.max(e,t),o=e+s;if(void 0!==n&&(o=Math.min(o,n)),a>=o){var l={internalIteratorData:{isEndOfRange:!0}};return l}var u={subArray:null,offset:-1,internalIteratorData:{end:o,currentSubArray:null,currentInternalPartOffset:null,nextInternalPartOffset:e,currentInternalPartIndex:-1,isEndOfRange:!1}},c=!1;do{if(c)throw new r.jpipExceptions.InternalErrorException("Iterator reached to the end although no data has been iterated");c=!i(u)}while(a>=u.internalIteratorData.nextInternalPartOffset);var p=a-u.internalIteratorData.currentInternalPartOffset;return u.internalIteratorData.currentSubArray=u.internalIteratorData.currentSubArray.subarray(p),u.internalIteratorData.currentInternalPartOffset=a,u}function i(e){var t=e.internalIteratorData;if(t.isEndOfRange)return!1;if(e.subArray=t.currentSubArray,e.offset=t.currentInternalPartOffset,++t.currentInternalPartIndex,t.nextInternalPartOffset>=t.end)return t.isEndOfRange=!0,!0;a(t.currentInternalPartIndex),t.currentSubArray=o[t.currentInternalPartIndex],t.currentInternalPartOffset=t.nextInternalPartOffset;var n=o[t.currentInternalPartIndex].length;t.nextInternalPartOffset=t.currentInternalPartOffset+n;var r=t.end-t.currentInternalPartOffset,i=r<t.currentSubArray.length;return i&&(t.currentSubArray=t.currentSubArray.subarray(0,r)),!0}function a(e){if(e>=o.length)throw new r.jpipExceptions.InternalErrorException("CompositeArray: end of part has reached. Check end calculation")}var s=0,o=[];this.getLength=function(){return s},this.getOffset=function(){return e},this.pushSubArray=function(e){o.push(e),s+=e.length},this.copyToOtherAtTheEnd=function(e,r,a){t(r,a);for(var s=n(r,a);i(s);)e.pushSubArray(s.subArray)},this.copyToTypedArray=function(e,r,a,s){t(a,s);for(var o=n(a,s);i(o);){var l=o.offset-r;e.set(o.subArray,l)}},this.copyToArray=function(e,r,a,s){t(a,s);for(var o=n(a,s);i(o);)for(var l=o.offset-r,u=0;u<o.subArray.length;++u)e[l++]=o.subArray[u]},this.copyToOther=function(t){if(t.getOffset()>e)throw new r.jpipExceptions.InternalErrorException("CompositeArray: Trying to copy part into a latter part");var a=t.getOffset()+t.getLength(),o=a>=e+s;if(!o){var l=a,u=n(l);if(!i(u))throw new r.jpipExceptions.InternalErrorException("CompositeArray: Could not merge parts");var c=l;do{if(u.offset!==c)throw new r.jpipExceptions.InternalErrorException("CompositeArray: Non-continuous value of rangeToCopy.offset. Expected: "+c+", Actual: "+u.offset);t.pushSubArray(u.subArray),c+=u.subArray.length}while(i(u))}}}},{"j2k-jpip-globals.js":12}],5:[function(e,t,n){"use strict";t.exports.JpipDatabinParts=function(e,t,n){function r(e,t){var n,r=!1,a=0;if(void 0!==t&&(r=!!t.forceCopyAllRange,a=t.databinStartOffset,n=t.maxLengthToCopy,void 0===a&&(a=0)),void 0===e&&(e=0),0===n)return{resultWithoutCopy:0};if(null!==l&&a>=l)return{resultWithoutCopy:n&&r?null:0};var u=s(a);if(u===o.length)return{resultWithoutCopy:r?null:0};if(r){var c=i(a,n,u);if(!c)return{resultWithoutCopy:null}}var p={databinStartOffset:a,maxLengthToCopy:n,resultStartOffset:e};return p}function i(e,t,n){if(o[n].getOffset()>e)return!1;if(t){var r=e-o[n].getOffset(),i=o[n].getLength()-r,a=i>=t;return a}if(null===l||n<o.length-1)return!1;var s=o[o.length-1],u=s.getOffset()+s.getLength(),c=u===l;return c}function a(e,t,n){var r,i=e;if(void 0!==t)r=e+t;else{var a=o[o.length-1];r=a.getOffset()+a.getLength()}for(var s=null,l=0;l<o.length&&!(o[l].getOffset()>=r);++l){var u=Math.max(i,o[l].getOffset()),c=Math.min(r,o[l].getOffset()+o[l].getLength());n(o[l],u,c),s=o[l]}if(null===s)return 0;var p=Math.min(s.getOffset()+s.getLength(),r),f=p-e;return f}function s(e){var t;for(t=0;t<o.length&&!(o[t].getOffset()+o[t].getLength()>e);++t);return t}var o=[],l=null,u=0,c=[];return this.getDatabinLengthIfKnown=function(){return l},this.getLoadedBytes=function(){return u},this.isAllDatabinLoaded=function(){var e;switch(o.length){case 0:e=0===l;break;case 1:e=0===o[0].getOffset()&&o[0].getLength()===l;break;default:e=!1}return e},this.getCachedData=function(e){var t=c[e];return void 0===t&&(t={},c[e]=t),t},this.getClassId=function(){return e},this.getInClassId=function(){return t},this.copyToCompositeArray=function(e,t){var n=0,i=r(n,t);if(void 0!==i.resultWithoutCopy)return i.resultWithoutCopy;var s=a(i.databinStartOffset,i.maxLengthToCopy,function(t,n,r){t.copyToOtherAtTheEnd(e,n,r)});return s},this.copyBytes=function(e,t,n){var i=r(t,n);if(void 0!==i.resultWithoutCopy)return i.resultWithoutCopy;var s=i.databinStartOffset-i.resultStartOffset,o=a(i.databinStartOffset,i.maxLengthToCopy,function(t,n,r){t.copyToArray(e,s,n,r)});return o},this.getExistingRanges=function(){for(var e=new Array(o.length),t=0;t<o.length;++t)e[t]={start:o[t].getOffset(),length:o[t].getLength()};return e},this.addData=function(e,t){if(e.isLastByteInDatabin&&(l=e.messageOffsetFromDatabinStart+e.messageBodyLength),0!==e.messageBodyLength){var r=n.createCompositeArray(e.messageOffsetFromDatabinStart),i=e.bodyStart+e.messageBodyLength;r.pushSubArray(t.subarray(e.bodyStart,i));var a=s(e.messageOffsetFromDatabinStart),c=a;if(a>0){var p=o[a-1],f=p.getOffset()+p.getLength();f===e.messageOffsetFromDatabinStart&&--c}if(c>=o.length)return o.push(r),void(u+=e.messageBodyLength);var d=o[c],h=e.messageOffsetFromDatabinStart+e.messageBodyLength;if(d.getOffset()>h){for(var g=o.length;g>c;--g)o[g]=o[g-1];return o[c]=r,void(u+=e.messageBodyLength)}var v=d.getLength(),m=d.getOffset()>e.messageOffsetFromDatabinStart;m&&(o[c]=r,r=d,d=o[c]),r.copyToOther(d);var x,E=d.getOffset()+d.getLength();for(x=c;x<o.length-1&&!(E<o[x+1].getOffset());++x)v+=o[x+1].getLength();var y=x-c;if(y>0){o[x].copyToOther(d);for(var j=c+1;j<o.length-y;++j)o[j]=o[j+y];o.length-=y}u+=d.getLength()-v}},this}},{}],6:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipDatabinsSaver=function(e,t){function n(e,t){if(0!==e.inClassId)throw new r.jpipExceptions.IllegalDataException("Main header data-bin with in-class index other than zero is not valid","A.3.5");var n=m.getLoadedBytes();m.addData(e,t);var i=m.getLoadedBytes()-n;g+=i,v+=i}function i(e,t){}function a(n,i,a,s,o){if(s!==e)throw new r.jpipExceptions.WrongStreamException("databin of type "+o,e);var l=n.databins[a];return l||(l=t.createDatabinParts(i,a),n.databins[a]=l),l}function s(){return{databins:[],listeners:[],databinsWithListeners:[]}}var o=0,l=1,u=2,c=4,p=5,f=[],d=[],h=[],g=0,v=0;f[u]=s(),f[o]=s(),f[l]=f[o],h[u]=!0,h[o]=!0,h[l]=!0,f[c]=s(),f[p]=f[c],d[c]=!0,d[p]=!0;var m=t.createDatabinParts(6,0);return this.getIsJpipTilePartStream=function(){return e},this.getLoadedBytes=function(){return g},this.getMainHeaderDatabin=function(){return m},this.getTileHeaderDatabin=function(e){var t=a(f[u],u,e,!1,"tileHeader");return t},this.getPrecinctDatabin=function(e){var t=a(f[o],o,e,!1,"precinct");return t},this.getTileDatabin=function(e){var t=a(f[c],c,e,!0,"tilePart");return t},this.addEventListener=function(e,t,n,i){if("dataArrived"!==t)throw new r.jpipExceptions.InternalErrorException("Unsupported event: "+t);var a=e.getClassId(),s=e.getInClassId(),o=f[a];if(e!==o.databins[s])throw new r.jpipExceptions.InternalErrorException("Unmatched databin with class-ID="+a+" and in-class-ID="+s);void 0===o.listeners[s]&&(o.listeners[s]=[]),0===o.listeners[s].length&&(v+=e.getLoadedBytes()),o.listeners[s].push({listener:n,listenerThis:i}),o.databinsWithListeners[s]=e},this.removeEventListener=function(e,t,n){if("dataArrived"!==t)throw new r.jpipExceptions.InternalErrorException("Unsupported event: "+t);var i=e.getClassId(),a=e.getInClassId(),s=f[i],o=s.listeners[a];if(e!==s.databins[a]||e!==s.databinsWithListeners[a])throw new r.jpipExceptions.InternalErrorException("Unmatched databin with class-ID="+i+" and in-class-ID="+a);for(var l=0;l<o.length;++l)if(o[l].listener===n)return o[l]=o[o.length-1],o.length-=1,void(0===o.length&&(delete s.databinsWithListeners[a],v-=e.getLoadedBytes()));throw new r.jpipExceptions.InternalErrorException("Could not unregister listener from databin")},this.cleanupUnregisteredDatabins=function(){for(var e=0;e<f.length;++e)if(void 0!==f[e]){var t=f[e].databinsWithListeners;f[e].databins=t.slice()}g=v},this.saveData=function(e,t){if(0!==e.codestreamIndex)throw new r.jpipExceptions.UnsupportedFeatureException("Non zero Csn (Code Stream Index)","A.2.2");switch(e.classId){case 6:n(e,t);break;case 8:i(e,t);break;default:var s=f[e.classId];if(void 0===s)break;var o=!!d[e.classId],l=a(s,e.classId,e.inClassId,o,"<class ID "+e.classId+">"),u=l.getLoadedBytes();l.addData(e,t);var c=l.getLoadedBytes()-u;g+=c;var p=s.listeners,h=p[e.inClassId];if(void 0!==h&&h.length>0){v+=c;for(var m=h.slice(),x=0;x<m.length;++x){var E=m[x];E.listener.call(E.listenerThis,l)}}}},this}},{"j2k-jpip-globals.js":12}],7:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipObjectPoolByDatabin=function(){var e=[];this.getObject=function(t){var n=t.getClassId(),i=e[n];void 0===i&&(i=[],e[n]=i);var a=t.getInClassId(),s=i[a];if(void 0===s)s={},s.databin=t,i[a]=s;else if(s.databin!==t)throw new r.jpipExceptions.InternalErrorException("Databin IDs are not unique");return s}}},{"j2k-jpip-globals.js":12}],8:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipRequestDatabinsListener=function(e,t,n,i,a,s){function o(){++d;var t=n.getTilesIterator(e);do{var r=t.tileIndex,a=i.getTileHeaderDatabin(r);v.push(a),i.addEventListener(a,"dataArrived",l),++d,l(a)}while(t.tryAdvance());--d,p()}function l(t){if(t.isAllDatabinLoaded()){var a=x.getObject(t);if(!a.isAlreadyLoaded){a.isAlreadyLoaded=!0,--d;var s=t.getInClassId(),o=n.getTileStructure(s),l=o.getNumQualityLayers(),f=o.getPrecinctIterator(s,e);do{if(!f.isInCodestreamPart)throw new r.jpipExceptions.InternalErrorException("Unexpected precinct not in codestream part");var h=o.precinctPositionToInClassIndex(f),g=i.getPrecinctDatabin(h);m.push(g);var v=x.getObject(g);if(void 0!==v.maxNumQualityLayersInTile)throw new r.jpipExceptions.InternalErrorException("Tile was iterated twice in codestream part");v.maxNumQualityLayersInTile=l,c(g,v,f),i.addEventListener(g,"dataArrived",u)}while(f.tryAdvance());p()}}}function u(e){var t=x.getObject(e),n=t.numQualityLayersReached,r=t.maxNumQualityLayersInTile;n!==r&&(--E[n],c(e,t),p())}function c(t,n,r){var i=a.getQualityLayerOffset(t,e.maxNumQualityLayers,r),s=i.numQualityLayers;n.numQualityLayersReached=s;var o=n.maxNumQualityLayersInTile;if(s!==o){var l=E[s]||0;E[s]=l+1}}function p(){if(!(E[h]>0||"max"===h||h>=f||d>0)){var e,n=E.length;do{if(++h,h>=n){h="max";break}e=E[h]>0}while(!e);t(h)}}var f,d=0,h=0,g=!1,v=[],m=[],x=s.createObjectPoolByDatabin(),E=[];o(),this.unregister=function(){if(!g){for(var e=0;e<v.length;++e)i.removeEventListener(v[e],"dataArrived",l);for(var t=0;t<m.length;++t)i.removeEventListener(m[t],"dataArrived",u);g=!0}}}},{"j2k-jpip-globals.js":12}],9:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipCodestreamStructure=function(e,t,n){function i(e,t){if(e.currentY>=t.maxTileYExclusive)throw new r.jpipExceptions.InternalErrorException("Cannot advance tile iterator after end");if(++e.currentX,e.currentX<t.maxTileXExclusive)return!0;e.currentX=t.minTileX,++e.currentY;var n=e.currentY<t.maxTileYExclusive;return n}function a(t){u();var n=p.getNumTilesX()*p.getNumTilesY()-1;if(0>t||t>n)throw new r.jpipExceptions.ArgumentException("tileId",t,"Expected value between 0 and "+n);var i=p.isEdgeTileId(t);if(void 0===h[t]){var a=e.parseOverridenTileParams(t);a?h[t]=l(a,i):h[t]=null}if(h[t])return h[t];var s=o(i);return s}function s(e,t,n){if(0>t||t>=n)throw new r.jpipExceptions.ArgumentException(e,t,e+" is expected to be between 0 and "+n-1)}function o(t){if(!f){var n=e.parseDefaultTileParams();f=new Array(3);for(var r=0;3>r;++r){f[r]=new Array(3);for(var i=0;3>i;++i){var a={horizontalEdgeType:r,verticalEdgeType:i};f[r][i]=l(n,a)}}}var s=f[t.horizontalEdgeType],o=s[t.verticalEdgeType];return o}function l(e,r){u();var i=JSON.parse(JSON.stringify(e));i.tileSize=p.getTileSize(r),i.defaultComponentParams.scaleX=1,i.defaultComponentParams.scaleY=1;for(var a=0;a<i.paramsPerComponent.length;++a)i.paramsPerComponent[a].scaleX=c.componentsScaleX[a],i.paramsPerComponent[a].scaleY=c.componentsScaleY[a];var s=t.createTileStructure(i,d,n);return s}function u(n){c||(c=e.parseCodestreamStructure(),p=t.createCodestreamSizesCalculator(c))}var c,p,f,d=this,h=[];return this.getSizesParams=function(){return u(),c},this.getNumTilesX=function(){u();var e=p.getNumTilesX();return e},this.getNumTilesY=function(){u();var e=p.getNumTilesY();return e},this.getNumComponents=function(){return u(),c.numComponents},this.getImageWidth=function(){u();var e=p.getLevelWidth();return e},this.getImageHeight=function(){u();var e=p.getLevelHeight();return e},this.getLevelWidth=function(e){u();var t=p.getLevelWidth(e);return t},this.getLevelHeight=function(e){u();var t=p.getLevelHeight(e);return t},this.getTileWidth=function(e){u();var t=p.getTileWidth(e);return t},this.getTileHeight=function(e){u();var t=p.getTileHeight(e);return t},this.getFirstTileOffsetX=function(){u();var e=p.getFirstTileOffsetX();return e},this.getFirstTileOffsetY=function(){u();var e=p.getFirstTileOffsetY();return e},this.getTileLeft=function(e,t){u();var n=e%p.getNumTilesX();if(0===n)return 0;var r=(n-1)*p.getTileWidth(t)+p.getFirstTileWidth(t);return r},this.getTileTop=function(e,t){u();var n=Math.floor(e/p.getNumTilesX());if(0===n)return 0;var r=(n-1)*p.getTileHeight(t)+p.getFirstTileHeight(t);return r},this.getDefaultTileStructure=function(){u();var e=o({horizontalEdgeType:p.EDGE_TYPE_NO_EDGE,verticalEdgeType:p.EDGE_TYPE_NO_EDGE});return e},this.getTileStructure=a,this.tilePositionToInClassIndex=function(e){u();var t=p.getNumTilesX(),n=p.getNumTilesY();s("tilePosition.tileX",e.tileX,t),s("tilePosition.tileY",e.tileY,n);var r=e.tileX+e.tileY*t;return r},this.tileInClassIndexToPosition=function(e){u();var t=p.getNumTilesX(),n=p.getNumTilesY();s("inClassIndex",e,t*n);var r=e%t,i=(e-r)/t,a={tileX:r,tileY:i};return a},this.getTilesIterator=function(e){u();var t=p.getTilesFromPixels(e),n={currentX:t.minTileX,currentY:t.minTileY},r={get tileIndex(){var e=n.currentY*p.getNumTilesX(),t=e+n.currentX;return t},tryAdvance:function(){var e=i(n,t);return e}};return r},this.getSizeOfPart=function(e){u();var t=p.getSizeOfPart(e);return t},this}},{"j2k-jpip-globals.js":12}],10:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipComponentStructure=function(e,t){function n(e,t,n){var r=a(n),i=e/r,s=t[n],o=Math.ceil(i/s);return o}function i(e,t,n,r,i){var s=a(e.resolutionLevel),o=Math.ceil(i/s),l=t*r[e.resolutionLevel],u=Math.min(r[e.resolutionLevel],o-l),c=0===e.resolutionLevel?1:2,p=Math.ceil(u/c),f=c*Math.ceil(p/n);return u%n===1&&e.resolutionLevel>0&&--f,f}function a(t){var n=e.numResolutionLevels-t-1,r=1<<n;return r}function s(){if(1!==e.scaleX||1!==e.scaleY)throw new r.j2kExceptions.UnsupportedFeatureException("Non 1 component scale","A.5.1");o=Math.floor(t.getTileWidth()/e.scaleX),l=Math.floor(t.getTileHeight()/e.scaleY)}var o,l;s(),this.getComponentScaleX=function(){return e.scaleX},this.getComponentScaleY=function(){return e.scaleY},this.getNumResolutionLevels=function(){return e.numResolutionLevels},this.getPrecinctWidth=function(t){var n=e.precinctWidthPerLevel[t];return n},this.getPrecinctHeight=function(t){var n=e.precinctHeightPerLevel[t];return n},this.getMaxCodeblockWidth=function(){var t=e.maxCodeblockWidth;return t},this.getMaxCodeblockHeight=function(){var t=e.maxCodeblockHeight;return t},this.getNumCodeblocksXInPrecinct=function(t){var n=i(t,t.precinctX,e.maxCodeblockWidth,e.precinctWidthPerLevel,o);return n},this.getNumCodeblocksYInPrecinct=function(t){var n=i(t,t.precinctY,e.maxCodeblockHeight,e.precinctHeightPerLevel,l);return n},this.getNumPrecinctsX=function(t){var r=n(o,e.precinctWidthPerLevel,t);return r},this.getNumPrecinctsY=function(t){var r=n(l,e.precinctHeightPerLevel,t);return r}}},{"j2k-jpip-globals.js":12}],11:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipTileStructure=function(e,t,n,i){function a(e,t,n){if(0>t||t>=n)throw new r.jpipExceptions.ArgumentException(e,t,e+" is expected to be between 0 and "+n-1)}function s(e){if(4!==e.length)throw new r.j2kExceptions.IllegalDataException("Illegal progression order "+e+": unexpected length");if("L"!==e[3])throw new r.jpipExceptions.IllegalDataException("Illegal target progression order of "+e,"A.3.2.1");var t=e.indexOf("P")>=0,n=e.indexOf("C")>=0,i=e.indexOf("R")>=0;if(!t||!n||!i)throw new r.j2kExceptions.IllegalDataException("Illegal progression order "+e+": missing letter");if("RPCL"!==e)throw new r.j2kExceptions.UnsupportedFeatureException("Progression order of "+e,"A.6.1")}function o(){h=new Array(n);var n=t.getNumComponents(),i=e.defaultComponentParams;g=i.numResolutionLevels;for(var a=!0,s=!0,o=0;n>o;++o){var u=e.paramsPerComponent[o];g=Math.min(g,u.numResolutionLevels),h[o]=new Array(u.numResolutionLevels);for(var c=d[o],p=0,f=(c.getNumPrecinctsX(o),c.getNumPrecinctsY(o),0);f<u.numResolutionLevels;++f){h[o][f]=p;var v=c.getNumPrecinctsX(f),m=c.getNumPrecinctsY(f);p+=v*m,i.precinctWidthPerLevel[f]===u.precinctWidthPerLevel[f]&&i.precinctHeightPerLevel[f]===u.precinctHeightPerLevel[f]||(a=!1);var x=l(f,u.numResolutionLevels,c.getPrecinctWidth,t.getLevelWidth,t.getTileWidth),E=l(f,u.numResolutionLevels,c.getPrecinctWidth,t.getLevelWidth,t.getTileWidth);s&=x&&E}}if(!a)throw new r.j2kExceptions.UnsupportedFeatureException("Special Coding Style for Component (COC)","A.6.2");if(!s)throw new r.j2kExceptions.UnsupportedFeatureException("Precinct TopLeft which is not matched to tile TopLeft","B.6")}function l(e,t,n,r,i){var a=n(e),s=r(e);if(a>s)return!0;var o=i(e),l=a%o===0||o%a===0;return l}function u(e,n){if(void 0===n)return null;for(var r=t.getNumComponents(),i=new Array(r),a=n.numResolutionLevelsToCut||0,s=t.getTileLeft(e,a),o=t.getTileTop(e,a),l=n.minX-s,u=n.minY-o,c=n.maxXExclusive-s,p=n.maxYExclusive-o,f=(t.getLevelWidth(a),t.getLevelHeight(a),0);r>f;++f){for(var h=d[f],g=h.getNumResolutionLevels(),v=g-a,m=(h.getNumResolutionLevels(),new Array(g)),x=0;v>x;++x){var E=h.getComponentScaleX(),y=h.getComponentScaleY(),j=v-x-1,b=E<<j,I=y<<j,C=4,w=Math.floor(l/b)-C,k=Math.floor(u/I)-C,O=Math.ceil(c/b)+C,L=Math.ceil(p/I)+C,P=h.getPrecinctWidth(x)*E,R=h.getPrecinctHeight(x)*y,T=Math.floor(w/P),S=Math.floor(k/R),A=Math.ceil(O/P),D=Math.ceil(L/R),M=h.getNumPrecinctsX(x),N=h.getNumPrecinctsY(x);
m[x]={minPrecinctX:Math.max(0,T),minPrecinctY:Math.max(0,S),maxPrecinctXExclusive:Math.min(A,M),maxPrecinctYExclusive:Math.min(D,N)}}i[f]=m}return i}function c(e,t,n,r){for(var a=!0,s=r?null:n,o=!1,l=2;l>=0;--l){var u=p(e,l,t,s);if(a=0===u,!a)break;"P"!==i[l]||r||(o=!0)}if(a)return!1;var c=d[e.component],f=c.getNumPrecinctsX(e.resolutionLevel);if(e.precinctIndexInComponentResolution=e.precinctX+e.precinctY*f,null===n)return e.isInCodestreamPart=!0,!0;var h=n[e.component],g=h[e.resolutionLevel];return o&&(e.precinctX=g.minPrecinctX,e.precinctY=g.minPrecinctY,e.precinctIndexInComponentResolution=e.precinctX+e.precinctY*f),e.isInCodestreamPart=e.precinctX>=g.minPrecinctX&&e.precinctY>=g.minPrecinctY&&e.precinctX<g.maxPrecinctXExclusive&&e.precinctY<g.maxPrecinctYExclusive,!0}function p(e,n,a,s){var o=d[e.component];switch(i[n]){case"R":var l=o.getNumResolutionLevels()-a;return++e.resolutionLevel,e.resolutionLevel%=l,e.resolutionLevel;case"C":return++e.component,e.component%=t.getNumComponents(),e.component;case"P":var u,c,p,f;if(null!==s){var h=s[e.component],g=h[e.resolutionLevel];u=g.minPrecinctX,c=g.minPrecinctY,p=g.maxPrecinctXExclusive,f=g.maxPrecinctYExclusive}else u=0,c=0,p=o.getNumPrecinctsX(e.resolutionLevel),f=o.getNumPrecinctsY(e.resolutionLevel);return e.precinctX-=u-1,e.precinctX%=p-u,e.precinctX+=u,e.precinctX!=u?e.precinctX-u:(e.precinctY-=c-1,e.precinctY%=f-c,e.precinctY+=c,e.precinctY-c);case"L":throw new r.jpipExceptions.InternalErrorException("Advancing L is not supported in JPIP");default:throw new r.jpipExceptions.InternalErrorException("Unexpected letter in progression order: "+i[n])}}var f,d,h,g;this.getProgressionOrder=function(){return i},this.getDefaultComponentStructure=function(e){return f},this.getComponentStructure=function(e){return d[e]},this.getTileWidth=function(){return e.tileSize[0]},this.getTileHeight=function(){return e.tileSize[1]},this.getNumQualityLayers=function(){return e.numQualityLayers},this.getIsPacketHeaderNearData=function(){return e.isPacketHeadersNearData},this.getIsStartOfPacketMarkerAllowed=function(){return e.isStartOfPacketMarkerAllowed},this.getIsEndPacketHeaderMarkerAllowed=function(){return e.isEndPacketHeaderMarkerAllowed},this.precinctInClassIndexToPosition=function(e){if(0>e)throw new r.jpipExceptions.ArgumentException("inClassIndex",e,"Invalid negative in-class index of precinct");var n,i=t.getNumTilesX()*t.getNumTilesY(),a=t.getNumComponents(),s=e%i,o=(e-s)/i,l=o%a,u=d[l],c=u.getNumResolutionLevels(),p=(o-l)/a,f=0;for(n=1;c>n;++n){var g=h[l][n];if(g>p)break;f=g}--n;var v=p-f,m=u.getNumPrecinctsX(n),x=u.getNumPrecinctsY(n),E=v%m,y=(v-E)/m;if(y>=x)throw new r.jpipExceptions.ArgumentException("inClassIndex",e,"Invalid in-class index of precinct");var j={tileIndex:s,component:l,precinctX:E,precinctY:y,resolutionLevel:n};return j},this.precinctPositionToInClassIndex=function(e){var n=t.getNumComponents();a("precinctPosition.component",e.component,n);var r=d[e.component],i=r.getNumResolutionLevels();a("precinctPosition.resolutionLevel",e.resolutionLevel,i);var s=t.getNumTilesX()*t.getNumTilesY(),o=r.getNumPrecinctsX(e.resolutionLevel),l=r.getNumPrecinctsY(e.resolutionLevel);a("precinctPosition.precinctX",e.precinctX,o),a("precinctPosition.precinctY",e.precinctY,l),a("precinctPosition.tileIndex",e.tileIndex,s);var u=e.precinctX+e.precinctY*o,c=h[e.component][e.resolutionLevel],p=u+c,f=e.component+p*t.getNumComponents(),g=e.tileIndex+f*t.getNumTilesX()*t.getNumTilesY();return g},this.getPrecinctIterator=function(e,t,n){var i=0;if(void 0!==t&&void 0!==t.numResolutionLevelsToCut&&(i=t.numResolutionLevelsToCut,i>=g))throw new r.jpipExceptions.InternalErrorException("Cannot advance resolution: numResolutionLevelsToCut="+t.numResolutionLevelsToCut+" but should be smaller than "+g);var a=u(e,t),s=0,o=0;if(n&&null!==a){var l=a[0][0];s=l.minPrecinctX,o=l.minPrecinctY}var p={precinctIndexInComponentResolution:0,component:0,precinctX:s,precinctY:o,resolutionLevel:0,isInCodestreamPart:!0},f={get tileIndex(){return e},get component(){return p.component},get precinctIndexInComponentResolution(){return p.precinctIndexInComponentResolution},get precinctX(){return p.precinctX},get precinctY(){return p.precinctY},get resolutionLevel(){return p.resolutionLevel},get isInCodestreamPart(){return p.isInCodestreamPart}};return f.tryAdvance=function(){var e=c(p,i,a,n);return e},f},f=n.createComponentStructure(e.defaultComponentParams,this),d=new Array(t.getNumComponents());for(var v=0;v<t.getNumComponents();++v)d[v]=n.createComponentStructure(e.paramsPerComponent[v],this);return o(),s(i),this}},{"j2k-jpip-globals.js":12}],12:[function(e,t,n){"use strict";t.exports.j2kMarkers={StartOfCodestream:[255,79],ImageAndTileSize:[255,81],CodingStyleDefault:[255,82],CodingStyleComponent:[255,83],QuantizationDefault:[255,92],ProgressionOrderChange:[255,95],PackedPacketHeadersInMainHeader:[255,96],PackedPacketHeadersInTileHeader:[255,97],StartOfTile:[255,144],StartOfData:[255,147],EndOfCodestream:[255,217],Comment:[255,100]},t.exports.j2kOffsets={MARKER_SIZE:2,LENGTH_FIELD_SIZE:2,NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER:38,REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER:6},t.exports.jpipEndOfResponseReasons={IMAGE_DONE:1,WINDOW_DONE:2,WINDOW_CHANGE:3,BYTE_LIMIT:4,QUALITY_LIMIT:5,SESSION_LIMIT:6,RESPONSE_LIMIT:7,NON_SPECIFIED:8},t.exports.j2kExceptions={UnsupportedFeatureException:function(e,t){return this.description=e+" (specified in section "+t+" of part 1: Core Coding System standard) is not supported yet",this.toString=function(){return"J2k UnsupportedFeatureException: "+this.description},this},ParseException:function(e){return this.description=e,this.toString=function(){return"J2k ParseException: "+this.description},this},IllegalDataException:function(e,t){return this.description=e+" (see section "+t+" of part 9: Interactivity tools, APIs and Protocols)",this.toString=function(){return"J2k IllegalDataException: "+this.description},this}},t.exports.jpipExceptions={UnsupportedFeatureException:function(e,t){return this.description=e+" (specified in section "+t+" of part 9: Interactivity tools, APIs and Protocols) is not supported yet",this.toString=function(){return"Jpip UnsupportedFeatureException: "+this.description},this},ParseException:function(e){return this.description=e,this.toString=function(){return"Jpip ParseException: "+this.description},this},IllegalDataException:function(e,t){return this.description=e+" (see section "+t+" of part 9: Interactivity tools, APIs and Protocols)",this.toString=function(){return"Jpip IllegalDataException: "+this.description},this},IllegalOperationException:function(e){return this.description=e,this.toString=function(){return"Jpip IllegalOperationException: "+this.description},this},ArgumentException:function(e,t,n){return this.description="Argument "+e+" has invalid value "+t+(void 0!==n?" :"+n:""),this.toString=function(){return"Jpip ArgumentException: "+this.description},this},WrongStreamException:function(e,t){var n="JPP (JPIP Precinct)",r="JPT (JPIP Tile-part)";if(t){var i=n;n=r,r=i}return this.description="Stream type is "+r+", but "+e+" is allowed only in "+n+" stream",this.toString=function(){return"Jpip WrongStreamException: "+this.description},this},InternalErrorException:function(e){return this.description=e,this.toString=function(){return"Jpip InternalErrorException: "+this.description},this}},t.exports.j2kExceptions.UnsupportedFeatureException.Name="j2kExceptions.UnsupportedFeatureException",t.exports.j2kExceptions.ParseException.Name="j2kExceptions.ParseException",t.exports.j2kExceptions.IllegalDataException.Name="j2kExceptions.IllegalDataException",t.exports.jpipExceptions.UnsupportedFeatureException.Name="jpipExceptions.UnsupportedFeatureException",t.exports.jpipExceptions.ParseException.Name="jpipExceptions.ParseException",t.exports.jpipExceptions.IllegalDataException.Name="jpipExceptions.IllegalDataException",t.exports.jpipExceptions.IllegalOperationException.Name="jpipExceptions.IllegalOperationException",t.exports.jpipExceptions.ArgumentException.Name="jpipExceptions.ArgumentException",t.exports.jpipExceptions.WrongStreamException.Name="jpipExceptions.WrongStreamException",t.exports.jpipExceptions.InternalErrorException.Name="jpipExceptions.InternalErrorException"},{}],13:[function(e,t,n){"use strict";var r=e("simple-ajax-helper.js").simpleAjaxHelper,i=e("mutual-exclusive-transaction-helper.js").mutualExclusiveTransactionHelper,a=e("jpip-coding-passes-number-parser.js").jpipCodingPassesNumberParser,s=e("jpip-message-header-parser.js").jpipMessageHeaderParser,o=e("jpip-channel.js").JpipChannel,l=e("jpip-codestream-reconstructor.js").JpipCodestreamReconstructor,u=e("jpip-codestream-sizes-calculator.js").JpipCodestreamSizesCalculator,c=e("jpip-codestream-structure.js").JpipCodestreamStructure,p=e("jpip-component-structure.js").JpipComponentStructure,f=e("composite-array.js").CompositeArray,d=e("jpip-databin-parts.js").JpipDatabinParts,h=e("jpip-databins-saver.js").JpipDatabinsSaver,g=e("jpip-header-modifier.js").JpipHeaderModifier,v=e("jpip-markers-parser.js").JpipMarkersParser,m=e("jpip-object-pool-by-databin.js").JpipObjectPoolByDatabin,x=e("jpip-offsets-calculator.js").JpipOffsetsCalculator,E=e("jpip-packets-data-collector.js").JpipPacketsDataCollector,y=e("jpip-request-context.js").JpipRequestContext,j=e("jpip-request-databins-listener.js").JpipRequestDatabinsListener,b=e("jpip-request.js").JpipRequest,I=e("jpip-session-helper.js").JpipSessionHelper,C=e("jpip-session.js").JpipSession,w=e("jpip-reconnectable-requester.js").JpipReconnectableRequester,k=e("jpip-structure-parser.js").JpipStructureParser,O=e("jpip-tile-structure.js").JpipTileStructure,L=e("jpip-bitstream-reader.js").JpipBitstreamReader,P=e("jpip-tag-tree.js").JpipTagTree,R=e("jpip-codeblock-length-parser.js").JpipCodeblockLengthParser,T=e("jpip-subband-length-in-packet-header-calculator.js").JpipSubbandLengthInPacketHeaderCalculator,S=e("jpip-packet-length-calculator.js").JpipPacketLengthCalculator,A=e("jpip-quality-layers-cache.js").JpipQualityLayersCache,D={createChannel:function(e,t){return new o(e,t,D)},createCodestreamReconstructor:function(e,t,n,r){return new l(e,t,n,r)},createCodestreamSizesCalculator:function(e){return new u(e)},createCodestreamStructure:function(e,t){return new c(e,D,t)},createComponentStructure:function(e,t){return new p(e,t)},createCompositeArray:function(e){return new f(e)},createDatabinParts:function(e,t){return new d(e,t,D)},createDatabinsSaver:function(e){return new h(e,D)},createHeaderModifier:function(e,t,n){return new g(e,t,n)},createMarkersParser:function(e){return new v(e,s,D)},createObjectPoolByDatabin:function(){return new m},createOffsetsCalculator:function(e,t){return new x(e,t)},createPacketsDataCollector:function(e,t,n){return new E(e,t,n,D)},createRequestContext:function(e,t,n,r,i){return new y(e,t,n,r,i)},createRequestDatabinsListener:function(e,t,n,r,i){return new j(e,t,n,r,i,D)},createRequest:function(e,t,n,r,i){return new b(e,s,t,n,r,i)},createSessionHelper:function(e,t,n,i){return new I(e,t,n,i,r)},createSession:function(e,t,n,r,i){return new C(e,t,n,r,i,setInterval,clearInterval,D)},createReconnectableRequester:function(e,t,n,r){return new w(e,t,n,r,D)},createStructureParser:function(e,t,n){return new k(e,t,s,n)},createTileStructure:function(e,t,n){return new O(e,t,D,n)},createBitstreamReader:function(e){return new L(e,i)},createTagTree:function(e,t,n){return new P(e,t,n,i)},createCodeblockLengthParser:function(e,t){return new R(e,i)},createSubbandLengthInPacketHeaderCalculator:function(e,t,n){return new T(e,t,n,a,i,D)},createPacketLengthCalculator:function(e,t,n,r,i){return new S(e,t,n,r,i,D)},createQualityLayersCache:function(e){return new A(e,D)}};t.exports.jpipRuntimeFactory=D},{"composite-array.js":4,"jpip-bitstream-reader.js":24,"jpip-channel.js":18,"jpip-codeblock-length-parser.js":25,"jpip-codestream-reconstructor.js":33,"jpip-codestream-sizes-calculator.js":2,"jpip-codestream-structure.js":9,"jpip-coding-passes-number-parser.js":26,"jpip-component-structure.js":10,"jpip-databin-parts.js":5,"jpip-databins-saver.js":6,"jpip-header-modifier.js":34,"jpip-markers-parser.js":15,"jpip-message-header-parser.js":19,"jpip-object-pool-by-databin.js":7,"jpip-offsets-calculator.js":16,"jpip-packet-length-calculator.js":27,"jpip-packets-data-collector.js":35,"jpip-quality-layers-cache.js":28,"jpip-reconnectable-requester.js":20,"jpip-request-context.js":3,"jpip-request-databins-listener.js":8,"jpip-request.js":21,"jpip-session-helper.js":22,"jpip-session.js":23,"jpip-structure-parser.js":17,"jpip-subband-length-in-packet-header-calculator.js":29,"jpip-tag-tree.js":30,"jpip-tile-structure.js":11,"mutual-exclusive-transaction-helper.js":31,"simple-ajax-helper.js":14}],14:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.simpleAjaxHelper={request:function(e,t,n,i){function a(e){if(!l){if(4!==s.readyState){if(void 0===i||null===s.response||s.readyState<3)return;var r=s.response.byteLength,a=r-u;if(i>a)return;u=r}else if(l=!0,200!==s.status||null===s.response)return void n(s);o||t(s,l)}}var s=new XMLHttpRequest,o=void 0===t,l=!1,u=0;if(s.open("GET",e,!o),s.onreadystatechange=a,o||(s.mozResponseType=s.responseType="arraybuffer"),void 0!==i&&(s.setRequestHeader("X-Content-Type-Options","nosniff"),s.onprogress=a),s.send(null),o&&!l)throw new r.jpipExceptions.InternalErrorException("synchronous ajax call was not finished synchronously");return s}}},{"j2k-jpip-globals.js":12}],15:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipMarkersParser=function(e,t,n){function i(e,t,n){var r=e[n]===t[0]&&e[n+1]===t[1];return r}function a(e,t){var n=s(e,!0),r=u(t,"Predefined marker in jGlobals.j2kMarkers"),i=n.markerToOffset[r];return void 0===i?null:i}function s(t,n){var a=t.getCachedData(c);if(void 0===a.markerToOffset&&(a.isParsedAllMarkers=!1,a.lastOffsetParsed=0,a.markerToOffset={},a.databin=t),a.isParsedAllMarkers)return a;var s=[],u=!0;if(t===e&&0===a.lastOffsetParsed){var p=t.copyBytes(s,0,{forceCopyAllRange:!0,maxLengthToCopy:r.j2kOffsets.MARKER_SIZE});if(null===p)u=!1;else if(!i(s,r.j2kMarkers.StartOfCodestream,0))throw new r.j2kExceptions.IllegalDataException("SOC (Start Of Codestream) is not found where expected to be","A.4.1");a.lastOffsetParsed=2}return u&&o(a),l(a,n),a}function o(e){for(var n=e.lastOffsetParsed,i=[],a=e.databin.copyBytes(i,0,{forceCopyAllRange:!0,maxLengthToCopy:r.j2kOffsets.MARKER_SIZE+r.j2kOffsets.LENGTH_FIELD_SIZE,databinStartOffset:n});null!==a;){var s=u(i,"offset "+n+" of databin with class ID = "+e.databin.getClassId()+" and in class ID = "+e.databin.getInClassId());e.markerToOffset[s.toString()]=n;var o=t.getInt16(i,r.j2kOffsets.MARKER_SIZE);n+=o+r.j2kOffsets.MARKER_SIZE,a=e.databin.copyBytes(i,0,{forceCopyAllRange:!0,maxLengthToCopy:r.j2kOffsets.MARKER_SIZE+r.j2kOffsets.LENGTH_FIELD_SIZE,databinStartOffset:n})}e.lastOffsetParsed=n}function l(t,n){var a=t.databin.getDatabinLengthIfKnown();if(t.isParsedAllMarkers=t.lastOffsetParsed===a,!t.isParsedAllMarkers&&t.databin!==e){var s=[],o=t.databin.copyBytes(s,0,{forceCopyAllRange:!0,maxLengthToCopy:r.j2kOffsets.MARKER_SIZE,databinStartOffset:t.lastOffsetParsed});null!==o&&i(s,0,r.j2kMarkers.StartOfData)&&(t.lastOffsetParsed+=r.j2kOffsets.MARKER_SIZE,t.isParsedAllMarkers=!0)}if(n&&!t.isParsedAllMarkers)throw new r.jpipExceptions.InternalErrorException("data-bin with class ID = "+t.databin.getClassId()+" and in class ID = "+t.databin.getInClassId()+" was not recieved yet")}function u(e,t){if(255!==e[0])throw new r.j2kExceptions.IllegalDataException("Expected marker in "+t,"A");var n=e[1].toString(16);return n}var c="markers";this.getMandatoryMarkerOffsetInDatabin=function(e,t,n,i){var s=a(e,t);if(null===s)throw new r.j2kExceptions.IllegalDataException(n+" is not found where expected to be",i);return s},this.checkSupportedMarkers=function(e,t,n){n=!!n;for(var i=s(e,!0),a={},o=0;o<t.length;++o){var l=u(t[o],"jpipMarkersParser.supportedMarkers["+o+"]");a[l]=!0}for(var c in i.markerToOffset){var p=!!a[c];if(p!==n)throw new r.j2kExceptions.UnsupportedFeatureException("Unsupported marker found: "+c,"unknown")}},this.getMarkerOffsetInDatabin=a,this.isMarker=i}},{"j2k-jpip-globals.js":12}],16:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipOffsetsCalculator=function(e,t){function n(e,t){var n=l(e,t);if(null===n)return null;var i=8,a=n+r.j2kOffsets.MARKER_SIZE,s=u(e,i,a),o=2,c=s[o],p=!(1&c),f=!!(2&c),d=!!(4&c),h=7,g=s[h],v=g+1,m=a+h,x=p?null:n+14,E={codingStyleDefaultOffset:n,isDefaultPrecinctSize:p,isStartOfPacketMarkerAllowed:f,isEndPacketHeaderMarkerAllowed:d,numResolutionLevels:v,precinctSizesOffset:x,numDecompositionLevelsOffset:m};return E}function i(e,t,n){if(null!==t&&!t.isDefaultPrecinctSize){var i=t.numResolutionLevels-n,a=t.precinctSizesOffset+i,s=t.codingStyleDefaultOffset+r.j2kOffsets.MARKER_SIZE,o={markerSegmentLengthOffset:s,start:a,length:n};e.push(o)}}function a(e,t){var n,i=t+4,a=u(e,1,i),s=31&a[0];switch(s){case 0:n=1;break;case 1:n=0;break;case 2:n=2;break;default:throw new r.j2kExceptions.IllegalDataException("Quantization style of "+s,"A.6.4")}return n}function s(e,n,i,s){var o=t.getMarkerOffsetInDatabin(n,r.j2kMarkers.QuantizationDefault);if(null!==o){var l=a(n,o);if(0!==l){var u=i.numResolutionLevels-s,c=1+3*(u-1),p=3*s,f=o+5+c*l,d=p*l,h=o+r.j2kOffsets.MARKER_SIZE,g={markerSegmentLengthOffset:h,start:f,length:d};e.push(g)}}}function o(e){var n=t.getMarkerOffsetInDatabin(e,r.j2kMarkers.CodingStyleComponent);if(null!==n)throw new r.j2kExceptions.UnsupportedFeatureException("COC Marker (Coding Style Component)","A.6.2")}function l(e,n){o(e);var i;return i=n?t.getMandatoryMarkerOffsetInDatabin(e,r.j2kMarkers.CodingStyleDefault,"COD (Coding style Default)","A.6.1"):t.getMarkerOffsetInDatabin(e,r.j2kMarkers.CodingStyleDefault)}function u(e,t,n,i){var a=[],s={forceCopyAllRange:!0,maxLengthToCopy:t,databinStartOffset:n},o=e.copyBytes(a,0,s);if(null===o)throw new r.jpipExceptions.InternalErrorException("Header data-bin has not yet recieved "+t+" bytes starting from offset "+n);return a}var c=[r.j2kMarkers.ImageAndTileSize,r.j2kMarkers.CodingStyleDefault,r.j2kMarkers.QuantizationDefault,r.j2kMarkers.Comment];this.getCodingStyleOffset=l,this.getCodingStyleBaseParams=n,this.getImageAndTileSizeOffset=function(){var n=t.getMandatoryMarkerOffsetInDatabin(e,r.j2kMarkers.ImageAndTileSize,"Image and Tile Size (SIZ)","A.5.1");return n},this.getRangesOfBestResolutionLevelsData=function(a,o){t.checkSupportedMarkers(a,c,!0);var l=null,u=n(a,!1),p=u;null===u?p=n(e,!0):l=u.numDecompositionLevelsOffset;var f=p.numResolutionLevels;if(o>=f)throw new r.jpipExceptions.InternalErrorException("numResolutionLevels ("+o+") <= COD.numResolutionLevels ("+f+")");var d=[];i(d,u,o),s(d,a,p,o);var h={ranges:d,numDecompositionLevelsOffset:l};return h}}},{"j2k-jpip-globals.js":12}],17:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipStructureParser=function(e,t,n,i){function a(a,l){var u=i.getCodingStyleBaseParams(a,l);if(null===u)return null;var c=e.getMainHeaderDatabin(),p=i.getImageAndTileSizeOffset(),f=p+r.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER,d=o(c,2,f),h=n.getInt16(d,0),g=t.getMarkerOffsetInDatabin(a,r.j2kMarkers.PackedPacketHeadersInTileHeader),v=t.getMarkerOffsetInDatabin(c,r.j2kMarkers.PackedPacketHeadersInMainHeader),m=null===g&&null===v,x=u.codingStyleDefaultOffset+6,E=o(a,6,x),y=n.getInt16(E,0),j=s(E,4),b=s(E,5),I=new Array(u.numResolutionLevels),C=new Array(u.numResolutionLevels),w=null;if(!u.isDefaultPrecinctSize){var k=u.numResolutionLevels;w=o(a,k,u.precinctSizesOffset)}for(var O=32768,L=0;L<u.numResolutionLevels;++L)if(u.isDefaultPrecinctSize)I[L]=O,C[L]=O;else{var P=L,R=w[P],T=15&R,S=R>>>4;I[L]=1*Math.pow(2,T),C[L]=1*Math.pow(2,S)}for(var A=new Array(h),D=0;h>D;++D)A[D]={maxCodeblockWidth:j,maxCodeblockHeight:b,numResolutionLevels:u.numResolutionLevels,precinctWidthPerLevel:I,precinctHeightPerLevel:C};var M={maxCodeblockWidth:j,maxCodeblockHeight:b,numResolutionLevels:u.numResolutionLevels,precinctWidthPerLevel:I,precinctHeightPerLevel:C},N={numQualityLayers:y,isPacketHeadersNearData:m,isStartOfPacketMarkerAllowed:u.isStartOfPacketMarkerAllowed,isEndPacketHeaderMarkerAllowed:u.isEndPacketHeaderMarkerAllowed,paramsPerComponent:A,defaultComponentParams:M};return N}function s(e,t){var n=e[t],i=2+(15&n);if(i>10)throw new r.j2kExceptions.IllegalDataException("Illegal codeblock width exponent "+i,"A.6.1, Table A.18");var a=1<<i;return a}function o(e,t,n,i){var a=[],s={forceCopyAllRange:!0,maxLengthToCopy:t,databinStartOffset:n},o=e.copyBytes(a,0,s);if(null===o)throw new r.jpipExceptions.InternalErrorException("Header data-bin has not yet recieved "+t+" bytes starting from offset "+n);return a}this.parseCodestreamStructure=function(){for(var t=e.getMainHeaderDatabin(),a=i.getImageAndTileSizeOffset(),s=o(t,38,a+r.j2kOffsets.MARKER_SIZE+r.j2kOffsets.LENGTH_FIELD_SIZE),l=r.j2kOffsets.REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER-(r.j2kOffsets.MARKER_SIZE+r.j2kOffsets.LENGTH_FIELD_SIZE),u=r.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER-(r.j2kOffsets.MARKER_SIZE+r.j2kOffsets.LENGTH_FIELD_SIZE),c=n.getInt32(s,l),p=n.getInt32(s,l+4),f=(n.getInt32(s,10),n.getInt32(s,14),n.getInt32(s,18)),d=n.getInt32(s,22),h=n.getInt32(s,26),g=n.getInt32(s,30),v=n.getInt16(s,u),m=a+r.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER+2,x=3*v,E=o(t,x,m),y=new Array(v),j=new Array(v),b=0;v>b;++b)y[b]=E[3*b+1],j[b]=E[3*b+2];var I={numComponents:v,componentsScaleX:y,componentsScaleY:j,imageWidth:c-h,imageHeight:p-g,tileWidth:f,tileHeight:d,firstTileOffsetX:h,firstTileOffsetY:g};return I},this.parseDefaultTileParams=function(){var t=e.getMainHeaderDatabin(),n=a(t,!0);return n},this.parseOverridenTileParams=function(t){var n=e.getTileHeaderDatabin(t),r=a(n,!1);return r}}},{"j2k-jpip-globals.js":12}],18:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipChannel=function(e,t,n){function i(){var e=p.length+c.length;return e}function a(e){var n=t.getDataRequestUrl(),r=t.getTargetId();"0"!==r&&(n+="&tid="+r);var i=null!==l;if(i){var a=f&&e;n+=a?"&wait=no":"&wait=yes"}return n}function s(e,n){var r=a(!0),i=t.getCodestreamStructure(),s=i.getLevelWidth(e.numResolutionLevelsToCut),o=i.getLevelHeight(e.numResolutionLevelsToCut),l=e.maxXExclusive-e.minX,u=e.maxYExclusive-e.minY;return r+="&fsiz="+s+","+o+",closest&rsiz="+l+","+u+"&roff="+e.minX+","+e.minY,"max"!==n&&(r+="&layers="+n),r}var o=this,l=null,u=0,c=[],p=[],f=!1;this.requestData=function(a,u,d,h){if(!f){var g=i();if(g>=e)throw new r.jpipExceptions.InternalErrorException("Channel has too many requests not responded yet")}var v=s(a,h),m=n.createRequest(t,o,v,u,d);return null!==l||0===p.length?(p.push(m),m.startRequest()):f?c=[m]:c.push(m),m},this.sendMinimalRequest=function(e){if(null===l&&p.length>0)throw new r.jpipExceptions.InternalErrorException("Minimal requests should be used for first request or keep alive message. Keep alive requires an already initialized channel, and first request requires to not have any previous request");var i=a(),s=n.createRequest(t,o,i,e);p.push(s),s.startRequest()},this.getIsDedicatedForMovableRequest=function(){return f},this.dedicateForMovableRequest=function(){if(f)throw new r.jpipExceptions.InternalErrorException("Channel already dedicated for movable request");f=!0},this.getChannelId=function(){return l},this.setChannelId=function(e){if(null!==e){l=e;var t=c;c=[];for(var n=0;n<t.length;++n)p.push(t[n]),t[n].startRequest()}},this.nextRequestId=function(){return++u},this.getRequestsWaitingForResponse=function(){return p},this.getAllQueuedRequestCount=i,this.requestEnded=function(e,n){for(var i=p,a=!1,s=0;s<i.length;++s)if(i[s]===n){i[s]=i[i.length-1],i.length-=1,a=!0;break}if(!a)throw new r.jpipExceptions.InternalErrorException("channel.requestsWaitingForResponse inconsistency");if(t.requestEnded(e,o),null===l&&c.length>0){var u=c.shift();p.push(u),u.startRequest()}},this.isAllOldRequestsEnded=function(e){for(var t=0;t<p.length;++t)if(p[t].lastRequestId<=e)return!1;return!0}}},{"j2k-jpip-globals.js":12}],19:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js"),i={LSB_MASK:1,BIT_4_MASK:16,BITS_56_MASK:96,MSB_MASK:128,LSB_7_MASK:127,parseNumberInVbas:function(e,t,n){var r,a=i,s=t;if(n){var o=(1<<n)-1;r=e[s]&o}else r=e[s]&a.LSB_7_MASK;for(;e[s]&a.MSB_MASK;)++s,r<<=7,r|=e[s]&a.LSB_7_MASK;return{endOffset:s+1,number:r}},parseMessageHeader:function(e,t,n){var a=i,s=(e[t]&a.BITS_56_MASK)>>>5;if(0===s)throw new r.jpipExceptions.ParseException("Failed parsing message header (A.2.1): prohibited existance class and csn bits 00");var o=!!(2&s),l=3===s,u=!!(e[t]&a.BIT_4_MASK),c=a.parseNumberInVbas(e,t,4),p=c.number,f=c.endOffset,d=0;if(o){var h=a.parseNumberInVbas(e,f);d=h.number,f=h.endOffset}else n&&(d=n.classId);var g=0;if(l){var v=a.parseNumberInVbas(e,f);g=v.number,f=v.endOffset}else n&&(g=n.codestreamIndex);var m=a.parseNumberInVbas(e,f),x=m.number;f=m.endOffset;var E=a.parseNumberInVbas(e,f),y=E.number;f=E.endOffset;var j,b=!!(d&a.LSB_MASK);if(b){var I=a.parseNumberInVbas(e,f);j=I.number,f=I.endOffset}var C={isLastByteInDatabin:u,inClassId:p,bodyStart:f,classId:d,codestreamIndex:g,messageOffsetFromDatabinStart:x,messageBodyLength:y};return b&&(C.aux=j),C},getInt32:function(e,t){var n=e[t]*Math.pow(2,24),r=e[t+1]<<16,i=e[t+2]<<8,a=e[t+3],s=n+r+i+a;return s},getInt16:function(e,t){var n=e[t]<<8,r=e[t+1],i=n+r;return i}};t.exports.jpipMessageHeaderParser=i},{"j2k-jpip-globals.js":12}],20:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipReconnectableRequester=function(e,t,n,i,a,s){function o(){if(null!==v)throw new r.jpipExceptions.IllegalOperationException("Previous session still not established");return null!==y?void(null!==w&&w({isReady:!0,exception:"Previous session that should be closed still alive.Maybe old requestContexts have not beed closed. Reconnect will not be done"})):(i.cleanupUnregisteredDatabins(),void l())}function l(){var r;null!==E&&(r=E.getTargetId()),v=a.createSession(e,t,r,n,i),v.setStatusCallback(c),v.open(j)}function u(e){var t=E.tryGetChannel(!0);if(null===t)throw new r.jpipExceptions.InvalidOperationException("Too many concurrent requests. Limit the use of dedicated (movable) requests, enlarge maxChannelsInSession or wait for requests to finish and avoid create new ones");if(!t.getIsDedicatedForMovableRequest())throw new r.jpipExceptions.InternalErrorException("getIsDedicatedForMovableRequest inconsistency");e.internalDedicatedChannel=t}function c(e){if(null===v||e.isReady!==v.getIsReady())throw new r.jpipExceptions.InternalErrorException("Unexpected statusCallback when not registered to session or inconsistent isReady");if(e.isReady){if(null!==y)throw new r.jpipExceptions.InternalErrorException("sessionWaitingForDisconnect should be null");y=E,E=v,v=null,null!==y&&(y.setStatusCallback(null),g()||y.setRequestEndedCallback(g)),E.setStatusCallback(w),E.setRequestEndedCallback(h);for(var t=0;t<C.length;++t)u(C[t])}null!==w&&w(e)}function p(e){null!==e&&(++b,e.close(f))}function f(){--b,0===b&&void 0!==k&&k()}function d(){if(null===E)throw new r.jpipExceptions.InternalErrorException("This operation is forbidden when session is not ready")}function h(e){var t=null;if(i.getLoadedBytes()>x&&o(),null!==e){if(e.getIsDedicatedForMovableRequest())throw new r.jpipExceptions.InternalErrorException("Expected non-movable channel as channelFreed");do{if(0===I.length){t=null;break}if(t=I.shift(),null!==t.internalRequest)throw new r.jpipExceptions.InternalErrorException("Request was already sent but still in queue")}while(t.isEnded);null!==t&&(t.internalRequest=e.requestData(t.codestreamPartParams,t.callback,t.failureCallback,t.numQualityLayers))}}function g(){var e=!y.hasActiveRequests();return e&&(y.close(),y=null),e}var v,m=1048576,x=s||10*m,E=null,y=null,j=null,b=0,I=[],C=[],w=null,k=null;this.getIsReady=function(){return null!==E&&E.getIsReady()},this.open=function(e){if(void 0===e||null===e)throw new r.jpipExceptions.ArgumentException("baseUrl",e);if(null!==j)throw new r.jpipExceptions.IllegalOperationException("Image was already opened");j=e,l()},this.close=function(e){if(null!==k)throw new r.jpipExceptions.IllegalOperationException("closed twice");k=e,b=1,p(E),p(v),p(y),f()},this.setStatusCallback=function(e){w=e,null!==E&&E.setStatusCallback(e)},this.dedicateChannelForMovableRequest=function(){d();var e={internalDedicatedChannel:null};return C.push(e),u(e),e},this.requestData=function(e,t,n,i,a){d();var s,o={isEnded:!1,internalRequest:null,codestreamPartParams:e,callback:t,failureCallback:n,numQualityLayers:i},l=void 0!==a;if(l)s=a.internalDedicatedChannel;else{if(s=E.tryGetChannel(),null===s)return I.push(o),o;if(s.getIsDedicatedForMovableRequest())throw new r.jpipExceptions.InternalErrorException("Expected non-movable channel")}if(s.getIsDedicatedForMovableRequest()!==l)throw new r.jpipExceptions.InternalErrorException("getIsDedicatedForMovableRequest inconsistency");return o.internalRequest=s.requestData(e,t,n,i),o},this.stopRequestAsync=function(e){e.isEnded=!0,null!==e.internalRequest&&e.internalRequest.stopRequestAsync()},this.reconnect=o}},{"j2k-jpip-globals.js":12}],21:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipRequest=function(e,t,n,i,a,s){function o(t,r){var i=!1;try{var a=u(t,r);if(a===x)return;i=a===m}catch(o){i=!0,e.onException(o)}try{i||e.waitForConcurrentRequestsToEnd(E),n.requestEnded(t,E),i&&!j&&void 0!==s&&s(),e.checkConcurrentRequestsFinished()}catch(o){e.onException(o)}}function l(t){n.requestEnded(t,E),e.checkConcurrentRequestsFinished(),void 0!==s&&s()}function u(t,i){if(!i)throw new r.jpipExceptions.InternalErrorException("AJAX callback called although response is not done yet and chunked encoding is not enabled");var a=e.getCreatedChannelId(t);null!==a?null!==n.getChannelId()?e.onException(new r.jpipExceptions.IllegalDataException("Channel created although was not requested","D.2.3")):n.setChannelId(a):null===n.getChannelId()&&e.onException(new r.jpipExceptions.IllegalDataException("Cannot extract cid from cnew response","D.2.3"));var s=f(t);if(null===s)return m;var o=p(t,s);return o}function c(){d=n.nextRequestId();var t=i+"&len="+b+"&qid="+d;b*=2;var r=null===n.getChannelId();if(r){t+="&cnew=http";var a=e.getFirstChannel();null!==a&&(t+="&cid="+a.getChannelId())}else t+="&cid="+n.getChannelId();e.sendAjax(t,o,l)}function p(t,n){var i=m,a=new Uint8Array(t.response);if(n>a.length-2||0!==a[n])throw new r.jpipExceptions.IllegalDataException("Could not find End Of Response (EOR) code at the end of response","D.3");switch(a[n+1]){case r.jpipEndOfResponseReasons.IMAGE_DONE:case r.jpipEndOfResponseReasons.WINDOW_DONE:case r.jpipEndOfResponseReasons.QUALITY_LIMIT:i=v;break;case r.jpipEndOfResponseReasons.WINDOW_CHANGE:if(!j)throw new r.jpipExceptions.IllegalOperationException("Server response was terminated due to newer request issued on same channel. That may be an internal webjpip.js error - Check that movable requests are well maintained");break;case r.jpipEndOfResponseReasons.BYTE_LIMIT:case r.jpipEndOfResponseReasons.RESPONSE_LIMIT:j||(c(),i=x);break;case r.jpipEndOfResponseReasons.SESSION_LIMIT:e.onException(new r.jpipExceptions.IllegalOperationException("Server resources associated with the session is limitted, no further requests should be issued to this session"));break;case r.jpipEndOfResponseReasons.NON_SPECIFIED:e.onException(new r.jpipExceptions.IllegalOperationException("Server error terminated response with no reason specified"));break;default:e.onException(new r.jpipExceptions.IllegalDataException("Server responded with illegal End Of Response (EOR) code: "+a[n+1]))}return i}function f(n){try{for(var r,i=new Uint8Array(n.response),a=0;a<i.length&&0!==i[a];){var s=t.parseMessageHeader(i,a,r);if(s.bodyStart+s.messageBodyLength>i.length)return a;e.getDatabinsSaver().saveData(s,i),
a=s.bodyStart+s.messageBodyLength,r=s}return a}catch(o){return e.onException(o),null}}var d,h=1024,g=10*h,v=1,m=2,x=3,E=this,y=!1,j=!1,b=g;this.startRequest=function(){if(y)throw new r.jpipExceptions.InternalErrorException("startRequest called twice");if(j)throw new r.jpipExceptions.InternalErrorException("request was already stopped");y=!0,e.requestStarted(),c()},this.stopRequestAsync=function(e){j=!0},this.getLastRequestId=function(){if(!y)throw new r.jpipExceptions.InternalErrorException("Unexpected call to getLastRequestId on inactive request");return d},this.callCallbackAfterConcurrentRequestsFinished=function(){a(E,!0)}}},{"j2k-jpip-globals.js":12}],22:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipSessionHelper=function(e,t,n,i,a){function s(e){var t=new r.jpipExceptions.InternalErrorException("Bad jpip server response (status = "+e.status+")");o(t)}function o(e){void 0===e&&(e=null),null!==l&&l({isReady:h,exception:e})}var l=null,u=null,c=[],p=null,f=0,d=[],h=!1,g=t||"0";this.onException=function(e){o(e)},this.getIsReady=function(){return h},this.setIsReady=function(e){h=e,o()},this.getCodestreamStructure=function(){return n},this.getDatabinsSaver=function(){return i},this.getDataRequestUrl=function(){return e},this.getTargetId=function(){return g},this.getFirstChannel=function(){return p},this.setStatusCallback=function(e){l=e},this.setRequestEndedCallback=function(e){u=e},this.requestStarted=function(){++f},this.requestEnded=function(e,t){--f;var n=e.getResponseHeader("JPIP-tid");if(""!==n&&null!==n)if("0"===g)g=n;else if(g!==n)throw new r.jpipExceptions.IllegalDataException("Server returned unmatched target ID");null===p&&(p=t);var i=t.getIsDedicatedForMovableRequest()?null:t;null!==u&&u(i)},this.getActiveRequestsCount=function(){return f},this.channelCreated=function(e){c.push(e)},this.getCreatedChannelId=function(e){var t=e.getResponseHeader("JPIP-cnew");if(!t)return null;for(var n=t.split(","),r=0;r<n.length;++r){var i=n[r].split("=");if("cid"===i[0])return i[1]}return null},this.waitForConcurrentRequestsToEnd=function(e){for(var t=[],n=0;n<c.length;++n){var r=c[n].getRequestsWaitingForResponse(),i=r.length;if(0!==i){for(var a=r[0].getLastRequestId(),s=1;s<r.length;++s)a=Math.max(a,r[s].getLastRequestId());t.push({channel:c[n],requestId:a})}}d.push({request:e,concurrentRequests:t})},this.checkConcurrentRequestsFinished=function(){for(var e=d.length-1;e>=0;--e){for(var t=d[e].concurrentRequests,n=t.length-1;n>=0;--n){var r=t[n];r.channel.isAllOldRequestsEnded(r.requestId)&&(t[n]=t[t.length-1],t.length-=1)}if(!(t.length>0)){var i=d[e].request;i.callback;d[e]=d[d.length-1],d.length-=1,i.callCallbackAfterConcurrentRequestsFinished()}}},this.sendAjax=function(e,t,n){var r;r=n?function(e){s(e),n(e)}:s,a.request(e,t,r)}}},{"j2k-jpip-globals.js":12}],23:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipSession=function(e,t,n,i,a,s,o,l){function u(){null!==O&&o(O),b.setIsReady(!1),b.sendAjax(m,j)}function c(e){++k;var n=l.createChannel(t,b);return b.channelCreated(n),e||w.push(n),n}function p(e,t){for(var n,r=null,i=e+1,a=0;a<w.length;++a){var s=w[a].getAllQueuedRequestCount();if(i>s&&(r=w[a],n=a,i=s),0===s)break}return t&&null!==r?(w[n]=w[w.length-1],w.length-=1,r):r}function f(){var e=a.getMainHeaderDatabin();if(!e.isAllDatabinLoaded())throw new r.jpipExceptions.IllegalDataException("Main header was not loaded on session creation");var t=b.getFirstChannel(),n=t.getChannelId();return m=g+"&cclose=*&cid="+n,y?void u():(O=s(d,E),void b.setIsReady(!0))}function d(){if(!(b.getActiveRequestsCount()>0)){var e=b.getFirstChannel();e.sendMinimalRequest(function(){})}}function h(){if(null===b||!b.getIsReady())throw new r.jpipExceptions.InternalErrorException("Cannot perform this operation when the session is not ready")}var g,v,m,x=1e3,E=30*x,y=!1,j=null,b=null,I=null,C=null,w=[],k=0,O=null;this.open=function(e){if(null!==b)throw new r.jpipExceptions.InternalErrorException("session.open() should be called only once");var t=e.indexOf("?")<0?"?":"&";g=e+t+"type="+(a.getIsJpipTilePartStream()?"jpt-stream":"jpp-stream"),v=g+"&stream=0",b=l.createSessionHelper(v,n,i,a),null!==I&&b.setStatusCallback(I),null!==C&&b.setRequestEndedCallback(C);var s=c();s.sendMinimalRequest(f)},this.getTargetId=function(){return h(),b.getTargetId()},this.getIsReady=function(){var e=null!==b&&b.getIsReady();return e},this.setStatusCallback=function(e){I=e,null!==b&&b.setStatusCallback(e)},this.setRequestEndedCallback=function(e){C=e,null!==b&&b.setRequestEndedCallback(e)},this.hasActiveRequests=function(){h();var e=b.getActiveRequestsCount()>0;return e},this.tryGetChannel=function(n){h();var r=e>k,i=r||n,a=i?0:t-1,s=p(a,n);return null===s&&r&&(s=c(n)),n&&null!==s&&s.dedicateForMovableRequest(),s},this.close=function(e){if(0===k)throw new r.jpipExceptions.InternalErrorException("Cannot close session before open");if(y)throw new r.jpipExceptions.InternalErrorException("Cannot close session twice");y=!0,j=e,void 0!==m&&u()}}},{"j2k-jpip-globals.js":12}],24:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipBitstreamReader=function(){function e(e,a){var s={nextOffsetToParse:0,validBitsInCurrentByte:0,originalByteWithoutShift:null,currentByte:null,isSkipNextByte:!1},o=a.createTransactionalObject(s),l=null;Object.defineProperty(this,"activeTransaction",{get:function(){if(null===l||!l.isActive)throw new r.jpipExceptions.InternalErrorException("No active transaction in bitstreamReader");return l}}),Object.defineProperty(this,"bitsCounter",{get:function(){var t=o.getValue(l);if(i(e,t),t.isSkipNextByte)throw new r.jpipExceptions.InternalErrorException("Unexpected state of bitstreamReader: When 0xFF encountered, tryValidateCurrentByte should skip the whole byte  after shiftRemainingBitsInByte and clear isSkipNextByte. However the flag is still set");var n=8*t.nextOffsetToParse-t.validBitsInCurrentByte;return n}}),Object.defineProperty(this,"databinOffset",{get:function(){var e=o.getValue(l);if(e.isSkipNextByte)return e.nextOffsetToParse+1;if(e.validBitsInCurrentByte%8!==0||255===e.originalByteWithoutShift)throw new r.jpipExceptions.InternalErrorException("Cannot calculate databin offset when bitstreamReader  is in the middle of the byte");return e.nextOffsetToParse-e.validBitsInCurrentByte/8},set:function(e){var t=o.getValue(l);t.validBitsInCurrentByte=0,t.isSkipNextByte=!1,t.originalByteWithoutShift=null,t.nextOffsetToParse=e}}),this.startNewTransaction=function(){if(null!==l&&l.isActive)throw new r.jpipExceptions.InternalErrorException("Cannot start new transaction in bitstreamReader while another transaction is active");l=a.createTransaction()},this.shiftRemainingBitsInByte=function(){var e=o.getValue(l);e.isSkipNextByte=255===e.originalByteWithoutShift,e.validBitsInCurrentByte=Math.floor(e.validBitsInCurrentByte/8)},this.shiftBit=function(){var n=o.getValue(l);if(!i(e,n))return null;var r=t(e,n,!0,1);return r},this.countZerosAndShiftUntilFirstOneBit=function(n){var r=o.getValue(l),i=t(e,r,!1,n);return i},this.countOnesAndShiftUntilFirstZeroBit=function(n){var r=o.getValue(l),i=t(e,r,!0,n);return i},this.shiftBits=function(t){for(var r=0,a=o.getValue(l),s=t;s>0;){if(!i(e,a))return null;var u=Math.min(a.validBitsInCurrentByte,s),c=a.currentByte>>8-u;r=(r<<u)+c,n(a,u),s-=u}return r}}function t(e,t,r,a){var o,l=0,u=a;do{if(!i(e,t))return null;var c=r?~t.currentByte:t.currentByte,p=Math.min(s[c],t.validBitsInCurrentByte+1),f=p-1;if(void 0!==u){if(p>u){n(t,u),l+=u;break}u-=f}l+=f,o=p<=t.validBitsInCurrentByte,o?n(t,p):t.validBitsInCurrentByte=0}while(!o);return l}function n(e,t){e.validBitsInCurrentByte-=t,e.validBitsInCurrentByte>0&&(e.currentByte=e.currentByte<<t&255)}function i(e,t){if(t.validBitsInCurrentByte>0)return!0;var n=t.isSkipNextByte?2:1,i=[],a=e.copyBytes(i,0,{forceCopyAllRange:!0,databinStartOffset:t.nextOffsetToParse,maxLengthToCopy:n});if(a!==n)return!1;var s=t.originalByteWithoutShift;if(t.currentByte=i[n-1],t.validBitsInCurrentByte=8,t.originalByteWithoutShift=t.currentByte,255===s){if(0!==(128&i[0]))throw new r.j2kExceptions.IllegalDataException("Expected 0 bit after 0xFF byte","B.10.1");t.isSkipNextByte||(t.currentByte<<=1,t.validBitsInCurrentByte=7)}return t.isSkipNextByte=!1,t.nextOffsetToParse+=n,!0}function a(){var e=new Array(255);e[0]=9,e[1]=8,e[2]=7,e[3]=7;var t;for(t=4;7>=t;++t)e[t]=6;for(t=8;15>=t;++t)e[t]=5;for(t=16;31>=t;++t)e[t]=4;for(t=32;63>=t;++t)e[t]=3;for(t=64;127>=t;++t)e[t]=2;for(t=128;255>=t;++t)e[t]=1;for(t=0;255>=t;++t)e[t-256]=e[t];return e}var s=a();return e}()},{"j2k-jpip-globals.js":12}],25:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipCodeblockLengthParser=function(){function e(e,t){var i=t.createTransactionalObject({lBlockValue:3});this.parse=function(t){var a=e.countOnesAndShiftUntilFirstZeroBit();if(null===a)return null;var s=i.getValue(e.activeTransaction);s.lBlockValue+=a;var o=n[t];if(void 0===o)throw new r.jpipExceptions.InternalErrorException("Unexpected value of coding passes "+t+". Expected positive integer <= 164");var l=s.lBlockValue+o,u=e.shiftBits(l);return u}}function t(){for(var e=164,t=new Array(e),n=1,r=2,i=0;e>=n;){for(var a=n;r>a;++a)t[a]=i;n*=2,r*=2,++i}return t}var n=t();return e}()},{"j2k-jpip-globals.js":12}],26:[function(e,t,n){"use strict";t.exports.JpipCodingPassesNumberParser=function(){function e(){var e=new Array(17);return e[0]=0,e[1]=0,e[2]=1,e[3]=0,e[4]=4,e[5]=3,e[6]=2,e[7]=1,e[8]=0,e[9]=6,e[10]=5,e[11]=4,e[12]=3,e[13]=2,e[14]=1,e[15]=0,e[16]=0,e}function t(){var e=new Array(17);return e[0]=1,e[1]=2,e[2]=3,e[3]=5,e[4]=6,e[5]=22,e[6]=30,e[7]=34,e[8]=36,e[9]=37,e[10]=101,e[11]=133,e[12]=149,e[13]=157,e[14]=161,e[15]=163,e[16]=164,e}var n=e(),r=t(),i={parse:function(e){var t=e.countOnesAndShiftUntilFirstZeroBit(16);if(null===t)return null;var i=n[t],a=e.shiftBits(i);if(null===a)return null;var s=r[t],o=a+s;return o}};return i}()},{}],27:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipPacketLengthCalculator=function(e,t,n,i,a,s){function o(e){for(;h.length<e;){g.startNewTransaction();var t=l(h.length);if(null===t)return void g.activeTransaction.abort();h.push(t),g.activeTransaction.commit()}}function l(e){var t;if(e>0){var n=h[e-1];t=n.headerStartOffset+n.headerLength+n.overallBodyLengthBytes}else t=i;if(g.databinOffset=t,E&&y){var r=f(145);if(null===r)return null;if(r){var a=6;g.databinOffset+=a}}var s=g.shiftBit();if(null===s)return null;if(!s)return g.shiftRemainingBitsInByte(),{headerStartOffset:t,headerLength:1,codeblockBodyLengthByIndex:[],overallBodyLengthBytes:0};var o=u(e);if(null===o)return null;var l=g.databinOffset;return o.headerLength=l-t,o.headerStartOffset=t,o}function u(e){for(var t=0,n=null,r=0;r<b.length;++r){var i=b[r],a=i.calculateSubbandLength(e);if(null===a)return null;n=null===n?a.codeblockBodyLengthByIndex:n.concat(a.codeblockBodyLengthByIndex),t+=a.overallBodyLengthBytes}if(g.shiftRemainingBitsInByte(),j){var s=f(146);if(null===s)return null;if(s){var o=2;g.databinOffset+=o}}return{codeblockBodyLengthByIndex:n,overallBodyLengthBytes:t}}function c(e){var t=Math.min(e,h.length);if(0===t)return{endOffset:i,numQualityLayers:0};var n=h[t-1],r=n.headerStartOffset+n.headerLength+n.overallBodyLengthBytes,a={endOffset:r,numQualityLayers:t};return a}function p(){for(var e=0===a.resolutionLevel?1:3,t=[],n=0;e>n;++n){var r,i;0===a.resolutionLevel?(r=v,i=m):(r=1===n?Math.ceil(v/2):Math.floor(v/2),i=0===n?Math.ceil(m/2):Math.floor(m/2)),0!==r&&0!==i&&t.push(s.createSubbandLengthInPacketHeaderCalculator(g,r,i))}return t}function f(e){var t=new Array(2),r=n.copyBytes(t,0,{databinStartOffset:g.databinOffset,maxLengthToCopy:2,forceCopyAllRange:!1});switch(r){case 2:var i=255===t[0]&&t[1]===e;return i;case 1:return 255===t[0]?null:!1;default:return null}}function d(){if(!E)throw new r.jpipExceptions.UnsupportedFeatureException("PPM or PPT","A.7.4 and A.7.5")}var h=[],g=s.createBitstreamReader(n),v=t.getNumCodeblocksXInPrecinct(a),m=t.getNumCodeblocksYInPrecinct(a),x=e.getNumQualityLayers(),E=e.getIsPacketHeaderNearData(),y=e.getIsStartOfPacketMarkerAllowed(),j=e.getIsEndPacketHeaderMarkerAllowed(),b=p();this.calculateEndOffsetOfLastFullPacket=function(e){var t,r=void 0===e||e>=x;if(r){if(n.isAllDatabinLoaded()){var i=n.getDatabinLengthIfKnown();return{endOffset:i,numQualityLayers:x}}t=x}else t=e;d(),o(t);var a=c(t);return a},this.getPacketOffsetsByCodeblockIndex=function(e){return d(),o(e+1),h.length<=e?null:h[e]}}},{"j2k-jpip-globals.js":12}],28:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipQualityLayersCache=function(e,t){function n(n,a){var s=n.getCachedData(i);if(void 0!==s.calculator)return s.calculator;if(void 0===a)throw new r.jpipExceptions.InternalErrorException("precinctPosition should be given on the first time of using QualityLayersCache on this precinct");var o=e.getTileStructure(a.tileIndex),l=o.getComponentStructure(a.component);return s.calculator=t.createPacketLengthCalculator(o,l,n,0,a),s.calculator}var i="packetLengthCalculator";this.getPacketOffsetsByCodeblockIndex=function(e,t,r){var i=n(e,r),a=i.getPacketOffsetsByCodeblockIndex(t);return a},this.getQualityLayerOffset=function(e,t,r){var i,a=e.getExistingRanges(),s=n(e,r);a.length<1||a[0].start>0?(i=0,t=0):i=a[0].start+a[0].length;for(var o=s.calculateEndOffsetOfLastFullPacket(t);i<o.endOffset;){var l=o.numQualityLayers-1;o=s.calculateEndOffsetOfLastFullPacket(l)}return o}}},{"j2k-jpip-globals.js":12}],29:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipSubbandLengthInPacketHeaderCalculator=function(e,t,n,i,a,s){function o(t){var n=f.getValue(e.activeTransaction);if(n>=t+1)throw new r.jpipExceptions.InternalErrorException("Unexpected quality layer to parse")}function l(){if(null===c){c=new Array(t),p=new Array(t);for(var r=0;t>r;++r){c[r]=new Array(n),p[r]=new Array(n);for(var i=0;n>i;++i)c[r][i]=s.createCodeblockLengthParser(e,a),p[r][i]=a.createTransactionalObject({isIncluded:!1})}}}function u(t,n,r){var a,s=p[t][n].getValue(e.activeTransaction);if(a=s.isIncluded?e.shiftBit():d.isSmallerThanOrEqualsTo(t,n,r),null===a)return null;if(!a)return{codeblockBodyLengthBytes:0,codingPasses:0};var o=null;if(!s.isIncluded&&(o=h.getValue(t,n),null===o))return null;var l=i.parse(e);if(null===l)return null;var u=c[t][n],f=u.parse(l);if(null===f)return null;s.isIncluded=!0;var g={codeblockBodyLengthBytes:f,codingPasses:l};return null!==o&&(g.zeroBitPlanes=o),g}var c=null,p=null,f=a.createTransactionalObject(0,!0),d=s.createTagTree(e,t,n),h=s.createTagTree(e,t,n);this.calculateSubbandLength=function(r){o(r),l(),d.setMinimalValueIfNotReadBits(r);for(var i=0,a=0,s=new Array(t*n),c=0;n>c;++c)for(var p=0;t>p;++p){var h=u(p,c,r);if(null===h)return null;s[a++]=h,i+=h.codeblockBodyLengthBytes}return f.setValue(e.activeTransaction,r+1),{codeblockBodyLengthByIndex:s,overallBodyLengthBytes:i}}}},{"j2k-jpip-globals.js":12}],30:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipTagTree=function(e,t,n,i){function a(){c=[];for(var e=t,r=n;e>=1||r>=1;){e=Math.ceil(e),r=Math.ceil(r);var i=e*r;c.unshift({width:e,height:r,content:new Array(i)}),e/=2,r/=2}o(0,0)}function s(t,n){function i(){if(null===a)throw new r.jpipExceptions.InternalErrorException("Iterated too deep in tag tree");if(a===c.length)return a=null,null;var i=c.length-a-1,l=Math.floor(t>>i),u=Math.floor(n>>i),p=c[a].width*u+l,f=c[a].content[p];void 0===f&&(f=o(a,p));var d=f.getValue(e.activeTransaction);return null!==s&&s.minimalPossibleValue>d.minimalPossibleValue&&(d.minimalPossibleValue=s.minimalPossibleValue),s=d,++a,d}var a=0,s=null;return i}function o(e,t){var n={minimalPossibleValue:0,isFinalValue:!1},r=i.createTransactionalObject(n);return c[e].content[t]=r,r}function l(){var t=p.getValue(e.activeTransaction);return t}function u(){p.setValue(e.activeTransaction,!0)}var c,p=i.createTransactionalObject(!1,!0);a(),this.setMinimalValueIfNotReadBits=function(t){if(!l()){var n=c[0].content[0],r=n.getValue(e.activeTransaction);r.minimalPossibleValue=t}},this.isSmallerThanOrEqualsTo=function(t,n,i){u();for(var a,o=s(t,n),l=o();null!==l;){if(l.minimalPossibleValue>i)return!1;if(!l.isFinalValue){var c=i-l.minimalPossibleValue+1,p=e.countZerosAndShiftUntilFirstOneBit(c);if(null===p)return null;l.minimalPossibleValue+=p,c>p&&(l.isFinalValue=!0)}a=l,l=o()}var f=a.minimalPossibleValue<=i;if(f&&!a.isFinalValue)throw new r.jpipExceptions.InternalErrorException("Wrong parsing in TagTree.isSmallerThanOrEqualsTo: not sure if value is smaller than asked");return f},this.getValue=function(t,n){var r,i=s(t,n),a=i();for(u();null!==a;){if(!a.isFinalValue){var o=e.countZerosAndShiftUntilFirstOneBit();if(null===o)return null;a.minimalPossibleValue+=o,a.isFinalValue=!0}r=a,a=i()}return r.minimalPossibleValue}}},{"j2k-jpip-globals.js":12}],31:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.mutualExclusiveTransactionHelper={createTransaction:function(){function e(e){if(!n.isActive)throw new r.jpipExceptions.InternalErrorException("Cannot terminate an already terminated transaction");t=e?2:3}var t=1,n={get isAborted(){return 3===t},get isActive(){return 1===t},commit:function(){e(!0)},abort:function(){e(!1)}};return n},createTransactionalObject:function(e,t){function n(e){if(!e.isActive)throw new r.jpipExceptions.InternalErrorException("Cannot use terminated transaction to access objects");if(e!==l&&l.isActive)throw new r.jpipExceptions.InternalErrorException("Cannot simultanously access transactional object from two active transactions")}function i(e){return e}function a(e){var t=JSON.parse(JSON.stringify(e));return t}var s=null,o=e,l={isActive:!1,isAborted:!0},u=t?i:a,c={getValue:function(e){return n(e),l===e?s:(l.isAborted?s=u(o):o=u(s),l=e,s)},setValue:function(e,t){return n(e),l===e?void(s=t):(l.isAborted||(o=u(s)),l=e,void(s=t))}};return c}}},{"j2k-jpip-globals.js":12}],32:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipCodestreamClient=e("jpip-codestream-client.js"),t.exports.JpipCodestreamSizesCalculator=e("jpip-codestream-sizes-calculator.js"),t.exports.j2kExceptions=r.j2kExceptions,t.exports.jpipExceptions=r.jpipExceptions,t.exports.Internals={jpipRuntimeFactory:e("jpip-runtime-factory.js"),jGlobals:r}},{"j2k-jpip-globals.js":12,"jpip-codestream-client.js":1,"jpip-codestream-sizes-calculator.js":2,"jpip-runtime-factory.js":13}],33:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipCodestreamReconstructor=function(e,t,n,i){function a(e,i){if(t.getIsJpipTilePartStream())throw new r.jpipExceptions.UnsupportedFeatureException("reconstruction of codestream from JPT (Jpip Tile-part) stream","A.3.4");var a=t.getMainHeaderDatabin(),s=a.copyBytes(e,0,{forceCopyAllRange:!0});if(null===s)return null;var o=n.modifyMainOrTileHeader(e,a,0,i);return s+=o,o=u(e,s),s+=o}function s(r,i,a,s,u,c,p){var f,d=e.getTileStructure(s),h=i,g=t.getTileHeaderDatabin(s);void 0!==u&&(f=u.numResolutionLevelsToCut);var v=o(r,i,g,a,f);if(null===v)return null;if(i=v.endTileHeaderOffset,!p){var m=l(r,i,d,s,u,c);if(i+=m,null===m)return null}var x=i,E=x-v.startOfTileHeaderOffset;n.modifyInt32(r,v.headerAndDataLengthPlaceholderOffset,E);var y=x-h;return y}function o(e,t,i,a,s){var o=t,l=c(e,t,r.j2kMarkers.StartOfTile);t+=l;var u=[0,10];l=c(e,t,u),t+=l;var p=[a>>>8,255&a];l=c(e,t,p),t+=l;var f=t,d=[0,0,0,0];l=c(e,t,d),t+=l;var h=[0];l=c(e,t,h),t+=l;var g=[1];l=c(e,t,g),t+=l;var v=t;if(l=i.copyBytes(e,t,{forceCopyAllRange:!0}),t+=l,null===l)return null;var m=e[t-2]===r.j2kMarkers.StartOfData[0]&&e[t-1]===r.j2kMarkers.StartOfData[1];m||(l=c(e,t,r.j2kMarkers.StartOfData),t+=l);var x=n.modifyMainOrTileHeader(e,i,v,s);t+=x;var E={startOfTileHeaderOffset:o,headerAndDataLengthPlaceholderOffset:f,endTileHeaderOffset:t};return E}function l(e,n,r,a,s,o){var l,u=r.getNumQualityLayers(),c=r.getPrecinctIterator(a,s,!0),p=0;void 0!==s&&(l=s.maxNumQualityLayers),"max"===o&&(o=u);do{var f=u;if(c.isInCodestreamPart){var d=r.precinctPositionToInClassIndex(c),h=t.getPrecinctDatabin(d),g=i.getQualityLayerOffset(h,l,c),v=g.endOffset;if(f=u-g.numQualityLayers,g.numQualityLayers<o)return null;var m=h.copyBytes(e,n,{forceCopyAllRange:!0,maxLengthToCopy:v});null===m&&(m=0,f=u),p+=m,n+=m}for(var x=0;f>x;++x)e[n++]=0;p+=f}while(c.tryAdvance());return p}function u(e,t){var n=t;e[t++]=255,e[t++]=100,e[t++]=0,e[t++]=9,e[t++]=77,e[t++]=97,e[t++]=109,e[t++]=97,e[t++]=122,e[t++]=97,e[t++]=118;var r=t-n;return r}function c(e,t,n){for(var r=0;r<n.length;++r)e[r+t]=n[r];return n.length}this.reconstructCodestream=function(t){var n=[],i=a(n);if(null===i)return null;var o,l=e.getNumTilesX()*e.getNumTilesY();void 0===t&&(t="max");for(var u=0;l>u;++u){var p=s(n,i,u,u,o,t);if(i+=p,null===p)return null}var f=c(n,i,r.j2kMarkers.EndOfCodestream);return i+=f,n.length=i,n},this.createCodestreamForRegion=function(t,i,o){var l=[],u=a(l,t.numResolutionLevelsToCut);if(null===u)return null;var p=0,f=e.getTilesIterator(t),d=f.tileIndex,h=e.getTileLeft(d,t.numResolutionLevelsToCut),g=e.getTileTop(d,t.numResolutionLevelsToCut),v=t.minX-h,m=t.minY-g;do{var x=f.tileIndex,E=s(l,u,p++,x,t,i,o);if(u+=E,null===E)return null}while(f.tryAdvance());var y=c(l,u,r.j2kMarkers.EndOfCodestream);return u+=y,n.modifyImageSize(l,t),null===l?null:(l.length=u,{codestream:l,offsetX:v,offsetY:m})},this.createCodestreamForTile=function(t,i,o,l){var u=[],p=a(u,i);if(null===p)return null;var f={numResolutionLevelsToCut:i,maxNumQualityLayers:l},d=s(u,p,0,t,f,o);if(p+=d,null===d)return null;var h=c(u,p,r.j2kMarkers.EndOfCodestream);p+=h;var g=e.getNumTilesX(),v=t%g,m=Math.floor(t/g);return n.modifyImageSize(u,{numResolutionLevelsToCut:i,minTileX:v,maxTileXExclusive:v+1,minTileY:m,maxTileYExclusive:m+1}),u.length=p,u}}},{"j2k-jpip-globals.js":12}],34:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipHeaderModifier=function(e,t,n){function i(e,n,r){var i=t.getCodingStyleOffset(n);if(null!==i){var a=r+i+5;e[a]=l}}function a(e,t,n){if(0===t.length)return 0;for(var r=0;r<t.length;++r){var i=n+t[r].markerSegmentLengthOffset,a=(e[i]<<8)+e[i+1],s=a-t[r].length;e[i]=s>>>8,e[i+1]=255&s}for(var o=n+t[0].start,l=o,u=0;u<t.length;++u){l+=t[u].length;for(var c=u+1<t.length?n+t[u+1].start:e.length;c>l;++l)e[o]=e[l],++o}var p=l-o;return p}function s(e,t,n){e[t++]=n>>>24,e[t++]=n>>>16&255,e[t++]=n>>>8&255,e[t++]=255&n}function o(e){switch(e){case"LRCP":return 0;case"RLCP":return 1;case"RPCL":return 2;case"PCRL":return 3;case"CPRL":return 4;default:throw new r.j2kExceptions.IllegalDataException("Progression order of "+e,"A.6.1, table A.16")}}var l=o(n);this.modifyMainOrTileHeader=function(e,n,r,s){if(i(e,n,r),void 0===s)return 0;var o=t.getRangesOfBestResolutionLevelsData(n,s);if(null!==o.numDecompositionLevelsOffset){var l=r+o.numDecompositionLevelsOffset;e[l]-=s}var u=a(e,o.ranges,r),c=-u;return c},this.modifyImageSize=function(n,i){var a=e.getTileWidth(i.numResolutionLevelsToCut),o=e.getTileHeight(i.numResolutionLevelsToCut),l=e.getSizeOfPart(i),u=t.getImageAndTileSizeOffset(),c=u+r.j2kOffsets.REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER,p=c+8,f=c+16,d=c+24;s(n,c,l.width),s(n,c+4,l.height),s(n,f,a),s(n,f+4,o),s(n,p,0),s(n,p+4,0),s(n,d,0),s(n,d+4,0)},this.modifyInt32=s}},{"j2k-jpip-globals.js":12}],35:[function(e,t,n){"use strict";var r=e("j2k-jpip-globals.js");t.exports.JpipPacketsDataCollector=function(e,t,n,i){function a(n,a,o){var l=e.getTilesIterator(n),u=0,c=0,p={packetDataOffsets:[],data:i.createCompositeArray(c),allRelevantBytesLoaded:0};do{var f=e.getTileStructure(l.tileIndex),d=f.getPrecinctIterator(l.tileIndex,n),h=f.getNumQualityLayers();if(void 0!==n.maxNumQualityLayers&&(h=Math.min(h,n.maxNumQualityLayers)),"max"===a)a=h;else if(a>h)throw new r.jpipExceptions.InternalErrorException("minNumQualityLayers is larger than maxNumQualityLayers");do{if(!d.isInCodestreamPart)throw new r.jpipExceptions.InternalErrorException("Unexpected precinct not in codestream part");var g=f.precinctPositionToInClassIndex(d),v=t.getPrecinctDatabin(g),m=o.getObject(v);void 0===m.layerPerCodeblock&&(m.layerPerCodeblock=[]);var x=s(p,u,d,v,m,h);if(a>x)return null}while(d.tryAdvance());++u}while(l.tryAdvance());var E=new Uint8Array(p.data.getLength());return p.data.copyToTypedArray(E,0,0,p.data.getLength()),p.data=E,p}function s(e,t,r,i,a,s){var o,l;for(o=0;s>o;++o){var u=n.getPacketOffsetsByCodeblockIndex(i,o,r);if(null===u)break;l=u.headerStartOffset+u.headerLength;for(var c=u.codeblockBodyLengthByIndex.length,p=new Array(c),f=!1,d=0;c>d;++d){var h=a.layerPerCodeblock[d];if(void 0===h)h={layer:-1},a.layerPerCodeblock[d]=h;else if(h.layer>=o)continue;var g=u.codeblockBodyLengthByIndex[d],v=e.data.getLength(),m=i.copyToCompositeArray(e.data,{databinStartOffset:l,maxLengthToCopy:g.codeblockBodyLengthBytes,forceCopyAllRange:!0});if(m!==g.codeblockBodyLengthBytes){p.length=d,f=!0;break}h.layer=o,p[d]={start:v,end:v+g.codeblockBodyLengthBytes,codingpasses:g.codingPasses,zeroBitPlanes:g.zeroBitPlanes},l+=g.codeblockBodyLengthBytes}var x={tileIndex:t,r:r.resolutionLevel,p:r.precinctIndexInComponentResolution,c:r.component,l:o,codeblockOffsets:p};if(e.packetDataOffsets.push(x),f)break}return e.allRelevantBytesLoaded+=l,o}this.getAllCodeblocksData=function(e,t){var n=i.createObjectPoolByDatabin(),r=a(e,t,n);return{codeblocksData:r,alreadyReturnedCodeblocks:n}},this.getNewCodeblocksDataAndUpdateReturnedCodeblocks=a}},{"j2k-jpip-globals.js":12}]},{},[32])(32)});