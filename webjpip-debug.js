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

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.webjpip = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');
var jpipRuntimeFactory = require('jpip-runtime-factory.js').jpipRuntimeFactory; 

module.exports.JpipCodestreamClient = function JpipCodestreamClient(options) {
    options = options || {};
    var jpipFactory = jpipRuntimeFactory;

    var databinsSaver = jpipFactory.createDatabinsSaver(/*isJpipTilepartStream=*/false);
    var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

    var markersParser = jpipFactory.createMarkersParser(mainHeaderDatabin);
    var offsetsCalculator = jpipFactory.createOffsetsCalculator(
        mainHeaderDatabin, markersParser);
    var structureParser = jpipFactory.createStructureParser(
        databinsSaver, markersParser, offsetsCalculator);
    
    var progressionOrder = 'RPCL';
    var codestreamStructure = jpipFactory.createCodestreamStructure(
        structureParser, progressionOrder);
    
    var qualityLayersCache = jpipFactory.createQualityLayersCache(
        codestreamStructure);
        
    var headerModifier = jpipFactory.createHeaderModifier(
        codestreamStructure, offsetsCalculator, progressionOrder);
    var reconstructor = jpipFactory.createCodestreamReconstructor(
        codestreamStructure, databinsSaver, headerModifier, qualityLayersCache);
    var packetsDataCollector = jpipFactory.createPacketsDataCollector(
        codestreamStructure, databinsSaver, qualityLayersCache);
    
    var maxChannelsInSession = options.maxChannelsInSession || 1;
    var maxRequestsWaitingForResponseInChannel =
        options.maxRequestsWaitingForResponseInChannel || 1;
        
    var requester = jpipFactory.createReconnectableRequester(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaver);
    
    var jpipObjectsForRequestContext = {
        requester: requester,
        reconstructor: reconstructor,
        packetsDataCollector: packetsDataCollector,
        qualityLayersCache: qualityLayersCache,
        codestreamStructure: codestreamStructure,
        databinsSaver: databinsSaver,
        jpipFactory: jpipFactory
        };
    
    var statusCallback = null;
    
    this.setStatusCallback = function setStatusCallbackClosure(callback) {
        statusCallback = callback;
        
        if (callback !== null) {
            requester.setStatusCallback(requesterStatusCallback);
        } else {
            requester.setStatusCallback(null);
        }
    };
    
    this.open = function open(baseUrl) {
        requester.open(baseUrl);
    };
    
    this.close = function close(closedCallback) {
        requester.close(closedCallback);
    };
    
    this.getSizesParams = function getSizesParams() {
        if (!requester.getIsReady()) {
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Cannot get codestream structure before image is ready');
        }
        
        var params = codestreamStructure.getSizesParams();
        var clonedParams = JSON.parse(JSON.stringify(params));
        
        var tile = codestreamStructure.getDefaultTileStructure();
        var component = tile.getDefaultComponentStructure();

        clonedParams.defaultNumQualityLayers =
            tile.getNumQualityLayers();
        clonedParams.defaultNumResolutionLevels =
            component.getNumResolutionLevels();
        
        return clonedParams;
    };
    
    this.createImageDataContext = function createImageDataContext(
        codestreamPartParams, options) {
            
        options = options || {};
        var useCachedDataOnly = options.useCachedDataOnly;
        var disableProgressiveness = options.disableProgressiveness;

        var codestreamPartParamsModified = castCodestreamPartParams(
            codestreamPartParams);
        
        var progressivenessModified;
        if (options.progressiveness !== undefined) {
            if (useCachedDataOnly || disableProgressiveness) {
                throw new jGlobals.jpipExceptions.ArgumentException(
                    'options.progressiveness',
                    options.progressiveness,
                    'options contradiction: cannot accept both progressiveness' +
                    'and useCachedDataOnly/disableProgressiveness options');
            }
            progressivenessModified = castProgressivenessParams(
                options.progressiveness,
                codestreamPartParamsModified.maxNumQualityLayers,
                'maxNumQualityLayers');
        } else  if (useCachedDataOnly) {
            progressivenessModified = [ { minNumQualityLayers: 0 } ];
        } else if (disableProgressiveness) {
            var maxNumQualityLayers = codestreamPartParams.maxNumQualityLayers;
            var minNumQualityLayers =
                maxNumQualityLayers === undefined ? 'max' : maxNumQualityLayers;
            
            progressivenessModified = [ { minNumQualityLayers: minNumQualityLayers } ];
        } else {
            progressivenessModified = getAutomaticProgressivenessStages(
                codestreamPartParamsModified.maxNumQualityLayers);
        }
        
        var imageDataContext = jpipFactory.createImageDataContext(
            jpipObjectsForRequestContext,
            codestreamPartParamsModified,
            progressivenessModified);
            //{
            //    disableServerRequests: !!options.isOnlyWaitForData,
            //    isMovable: false,
            //    userContextVars: userContextVars,
            //    failureCallback: options.failureCallback
            //});
        
        return imageDataContext;
    };
    
    this.fetch = function fetch(imageDataContext) {
        var fetchHandle = jpipFactory.createFetchHandle(requester, imageDataContext);
        fetchHandle.resume();
        return fetchHandle;
    };
    
    this.startMovableFetch = function startMovableFetch(imageDataContext, movableFetchState) {
        movableFetchState.dedicatedChannelHandle =
            requester.dedicateChannelForMovableRequest();
        movableFetchState.fetchHandle = jpipFactory.createFetchHandle(
            requester, imageDataContext, movableFetchState.dedicatedChannelHandle);
        movableFetchState.resume();
    };
    
    this.moveFetch = function moveFetch(imageDataContext, movableFetchState) {
        movableFetchState.fetchHandle.stopAsync();
        movableFetchState.fetchHandle = jpipFactory.createFetchHandle(
            requester, imageDataContext, movableFetchState.dedicatedChannelHandle);
        movableFetchState.resume();
    };
    
    //this.createDataRequest = function createDataRequest(
    //    codestreamPartParams, callback, userContextVars, options) {
    //    
    //    options = options || {};
    //    if (options.isOnlyWaitForData !== undefined) {
    //        throw new jGlobals.jpipExceptions.ArgumentException(
    //            'options.isOnlyWaitForData',
    //            options.isOnlyWaitForData,
    //            'isOnlyWaitForData is supported only for progressive request');
    //    }
    //    
    //    var codestreamPartParamsModified = castCodestreamPartParams(
    //        codestreamPartParams);
    //    
    //    var progressiveness;
    //    if (options.useCachedDataOnly) {
    //        progressiveness = [ { minNumQualityLayers: 0 } ];
    //    } else {
    //        var maxNumQualityLayers = codestreamPartParams.maxNumQualityLayers;
    //        var minNumQualityLayers =
    //            maxNumQualityLayers === undefined ? 'max' : maxNumQualityLayers;
    //        
    //        progressiveness = [ { minNumQualityLayers: minNumQualityLayers } ];
    //    }
    //    
    //    var requestContext = jpipFactory.createRequestContext(
    //        jpipObjectsForRequestContext,
    //        codestreamPartParamsModified,
    //        callback,
    //        progressiveness,
    //        {
    //            disableServerRequests: !!options.useCachedDataOnly,
    //            isMovable: false,
    //            userContextVars: userContextVars,
    //            failureCallback: options.failureCallback
    //        });
    //    
    //    return requestContext;
    //};
    //
    //this.createProgressiveDataRequest = function createProgressiveDataRequest(
    //    codestreamPartParams,
    //    callback,
    //    userContextVars,
    //    options,
    //    progressiveness) {
    //    
    //    options = options || {};
    //    if (options.useCachedDataOnly !== undefined) {
    //        throw new jGlobals.jpipExceptions.ArgumentException(
    //            'options.useCachedDataOnly',
    //            options.useCachedDataOnly,
    //            'useCachedDataOnly is not supported for progressive request');
    //    }
    //    
    //    var codestreamPartParamsModified = castCodestreamPartParams(
    //        codestreamPartParams);
    //    
    //    var progressivenessModified;
    //    if (progressiveness === undefined) {
    //        progressivenessModified = getAutomaticProgressivenessStages(
    //            codestreamPartParamsModified.maxNumQualityLayers);
    //    } else {
    //        progressivenessModified = castProgressivenessParams(
    //            progressiveness, codestreamPartParamsModified.maxNumQualityLayers, 'maxNumQualityLayers');
    //    }
    //    
    //    var requestContext = jpipFactory.createRequestContext(
    //        jpipObjectsForRequestContext,
    //        codestreamPartParamsModified,
    //        callback,
    //        progressivenessModified,
    //        {
    //            disableServerRequests: !!options.isOnlyWaitForData,
    //            isMovable: false,
    //            userContextVars: userContextVars,
    //            failureCallback: options.failureCallback
    //        });
    //    
    //    return requestContext;
    //};
    
    //this.createMovableRequest = function createMovableRequest(
    //    callback, userContextVars) {
    //    
    //    // NOTE: Think of the correct API of progressiveness in movable requests
    //    
    //    var zombieCodestreamPartParams = null;
    //    var progressiveness = getAutomaticProgressivenessStages();
    //    
    //    var requestContext = jpipFactory.createRequestContext(
    //        jpipObjectsForRequestContext,
    //        zombieCodestreamPartParams,
    //        callback,
    //        progressiveness,
    //        {
    //            disableServerRequests: false,
    //            isMovable: true,
    //            userContextVars: userContextVars
    //        });
    //        
    //    return requestContext;
    //};
    
    this.reconnect = function reconnect() {
        requester.reconnect();
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
        
        statusCallback(status);
    }
    
    function castProgressivenessParams(progressiveness, maxNumQualityLayers, propertyName) {
        // Ensure than minNumQualityLayers is given for all items
        
        var result = new Array(progressiveness.length);

        for (var i = 0; i < progressiveness.length; ++i) {
            var minNumQualityLayers = progressiveness[i].minNumQualityLayers;
            
            if (minNumQualityLayers !== 'max') {
                if (maxNumQualityLayers !== undefined &&
                    minNumQualityLayers > maxNumQualityLayers) {
                    
                    throw new jGlobals.jpipExceptions.ArgumentException(
                        'progressiveness[' + i + '].minNumQualityLayers',
                        minNumQualityLayers,
                        'minNumQualityLayers is bigger than ' +
                            'fetchParams.maxNumQualityLayers');
                }
                
                minNumQualityLayers = validateNumericParam(
                    minNumQualityLayers,
                    propertyName,
                    'progressiveness[' + i + '].minNumQualityLayers');
            }
            
            result[i] = { minNumQualityLayers: minNumQualityLayers };
        }
        
        return result;
    }
    
    function getAutomaticProgressivenessStages(maxNumQualityLayers) {
        // Create progressiveness of (1, 2, 3, (#max-quality/2), (#max-quality))

        var progressiveness = [];

        // No progressiveness, wait for all quality layers to be fetched
        var tileStructure = codestreamStructure.getDefaultTileStructure();
        var numQualityLayersNumeric = tileStructure.getNumQualityLayers();
        var maxNumQualityLayersNumericOrMax = 'max';
        
        if (maxNumQualityLayers !== undefined) {
            numQualityLayersNumeric = Math.min(
                numQualityLayersNumeric, maxNumQualityLayers);
            maxNumQualityLayersNumericOrMax = numQualityLayersNumeric;
        }
        
        var firstQualityLayersCount = numQualityLayersNumeric < 4 ?
            numQualityLayersNumeric - 1: 3;
        
        for (var i = 1; i < firstQualityLayersCount; ++i) {
            progressiveness.push({ minNumQualityLayers: i });
        }
        
        var middleQuality = Math.round(numQualityLayersNumeric / 2);
        if (middleQuality > firstQualityLayersCount) {
            progressiveness.push({ minNumQualityLayers: middleQuality });
        }
        
        progressiveness.push({
            minNumQualityLayers: maxNumQualityLayersNumericOrMax
            });
        
        return progressiveness;
    }
    
    function castCodestreamPartParams(codestreamPartParams) {
        var numResolutionLevelsToCut = validateNumericParam(
            codestreamPartParams.numResolutionLevelsToCut,
            'numResolutionLevelsToCut',
            /*defaultValue=*/undefined,
            /*allowUndefiend=*/true);

        var maxNumQualityLayers = validateNumericParam(
            codestreamPartParams.maxNumQualityLayers,
            'maxNumQualityLayers',
            /*defaultValue=*/undefined,
            /*allowUndefiend=*/true);
        
        var minX = validateNumericParam(codestreamPartParams.minX, 'minX');
        var minY = validateNumericParam(codestreamPartParams.minY, 'minY');
        
        var maxX = validateNumericParam(
            codestreamPartParams.maxXExclusive, 'maxXExclusive');
        
        var maxY = validateNumericParam(
            codestreamPartParams.maxYExclusive, 'maxYExclusive');
        
        var levelWidth = codestreamStructure.getLevelWidth(numResolutionLevelsToCut);
        var levelHeight = codestreamStructure.getLevelHeight(numResolutionLevelsToCut);
        
        if (minX < 0 || maxX > levelWidth ||
            minY < 0 || maxY > levelHeight ||
            minX >= maxX || minY >= maxY) {
            
            throw new jGlobals.jpipExceptions.ArgumentException(
                'codestreamPartParams', codestreamPartParams);
        }
        
        var result = {
            minX: minX,
            minY: minY,
            maxXExclusive: maxX,
            maxYExclusive: maxY,
            
            numResolutionLevelsToCut: numResolutionLevelsToCut,
            maxNumQualityLayers: maxNumQualityLayers
            };
        
        return result;
    }
    
    function validateNumericParam(
        inputValue, propertyName, defaultValue, allowUndefined) {
        
        if (inputValue === undefined &&
            (defaultValue !== undefined || allowUndefined)) {
            
            return defaultValue;
        }
        
        var result = +inputValue;
        if (isNaN(result) || result !== Math.floor(result)) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                propertyName, inputValue);
        }
        
        return result;
    }
    
    return this;
};
},{"j2k-jpip-globals.js":15,"jpip-runtime-factory.js":16}],2:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipCodestreamSizesCalculator = function JpipCodestreamSizesCalculator(
    params) {
    
    var EDGE_TYPE_NO_EDGE = 0;
    var EDGE_TYPE_FIRST = 1;
    var EDGE_TYPE_LAST = 2;

    this.EDGE_TYPE_NO_EDGE = EDGE_TYPE_NO_EDGE;
    this.EDGE_TYPE_FIRST = EDGE_TYPE_FIRST;
    this.EDGE_TYPE_LAST = EDGE_TYPE_LAST;
    
    this.getSizeOfPart = getSizeOfPart;
    
    this.getTilesFromPixels = getTilesFromPixels;
    
    this.getNumTilesX = getNumTilesX;
    
    this.getNumTilesY = getNumTilesY;
    
    this.getLevelWidth = getLevelWidth;
    
    this.getLevelHeight = getLevelHeight;
    
    this.getTileWidth = getTileWidth;
    
    this.getTileHeight = getTileHeight;
    
    this.getFirstTileOffsetX = getFirstTileOffsetX;
    
    this.getFirstTileOffsetY = getFirstTileOffsetY;
    
    this.getFirstTileWidth = getFirstTileWidth;
    
    this.getFirstTileHeight = getFirstTileHeight;
    
    this.isEdgeTileId = isEdgeTileId;
    
    this.getTileSize = getTileSize;
    
    this.getDefaultNumResolutionLevels =
        function getDefaultNumResolutionLevels() {
        
        if (params.defaultNumResolutionLevels === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
        return params.defaultNumResolutionLevels;
    };
    
    this.getDefaultNumQualityLayers =
        function getDefaultNumQualityLayers() {
        
        if (params.defaultNumQualityLayers === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
        return params.defaultNumQualityLayers;
    };
    
    function getSizeOfPart(codestreamPartParams) {
        var numResolutionLevelsToCut =
            codestreamPartParams.numResolutionLevelsToCut;
        var tileWidth = getTileWidth(numResolutionLevelsToCut);
        var tileHeight = getTileHeight(numResolutionLevelsToCut);
        
        var tileBounds = getTilesFromPixels(codestreamPartParams);
        
        var firstTileIndex =
            tileBounds.minTileX + tileBounds.minTileY * getNumTilesX();
            
        var lastTileIndex =
            (tileBounds.maxTileXExclusive - 1) +
            (tileBounds.maxTileYExclusive - 1) * getNumTilesX();
        
        var firstEdgeType = isEdgeTileId(firstTileIndex);
        var lastEdgeType = isEdgeTileId(lastTileIndex);
        var firstSize = getTileSize(firstEdgeType, numResolutionLevelsToCut);
        var lastSize = getTileSize(lastEdgeType, numResolutionLevelsToCut);
        
        var width = firstSize[0];
        var height = firstSize[1];

        var tilesX = tileBounds.maxTileXExclusive - tileBounds.minTileX;
        var tilesY = tileBounds.maxTileYExclusive - tileBounds.minTileY;
        
        if (tilesX > 1) {
            width += lastSize[0];
            width += tileWidth * (tilesX - 2);
        }
        
        if (tilesY > 1) {
            height += lastSize[1];
            height += tileHeight * (tilesY - 2);
        }
        
        return {
            width: width,
            height: height
            };
    }
    
    function getTilesFromPixels(partParams) {
        var numResolutionLevelsToCut =
            partParams.numResolutionLevelsToCut;

        var tileWidth = getTileWidth(numResolutionLevelsToCut);
        var tileHeight = getTileHeight(numResolutionLevelsToCut);
        
        var firstTileWidth = getFirstTileWidth(numResolutionLevelsToCut);
        var firstTileHeight = getFirstTileHeight(numResolutionLevelsToCut);
        
        var startXNoFirst = (partParams.minX - firstTileWidth) / tileWidth;
        var startYNoFirst = (partParams.minY - firstTileHeight) / tileHeight;
        var endXNoFirst = (partParams.maxXExclusive - firstTileWidth) / tileWidth;
        var endYNoFirst = (partParams.maxYExclusive - firstTileHeight) / tileHeight;
        
        var minTileX = Math.max(0, 1 + startXNoFirst);
        var minTileY = Math.max(0, 1 + startYNoFirst);
        var maxTileX = Math.min(getNumTilesX(), 1 + endXNoFirst);
        var maxTileY = Math.min(getNumTilesY(), 1 + endYNoFirst);

        var bounds = {
            minTileX: Math.floor(minTileX),
            minTileY: Math.floor(minTileY),
            maxTileXExclusive: Math.ceil(maxTileX),
            maxTileYExclusive: Math.ceil(maxTileY)
            };
        
        return bounds;
    }

    function getTileSize(edgeType, numResolutionLevelsToCut) {
        var tileWidth = getTileDimensionSize(
            edgeType.horizontalEdgeType,
            getFirstTileWidth,
            getLevelWidth,
            getTileWidth);
        
        var tileHeight = getTileDimensionSize(
            edgeType.verticalEdgeType,
            getFirstTileHeight,
            getLevelHeight,
            getTileHeight);
        
        if (numResolutionLevelsToCut !== undefined) {
            var scale = 1 << numResolutionLevelsToCut;
            tileWidth = Math.ceil(tileWidth / scale);
            tileHeight = Math.ceil(tileHeight / scale);
        }
        
        return [tileWidth, tileHeight];
    }

    function getTileDimensionSize(
        edgeType, getFirstTileSize, getLevelSize, getNonEdgeTileSize) {
        
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
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected edge type: ' + edgeType);
        }
        
        return result;
    }
    function isEdgeTileId(tileId) {
        var numTilesX = getNumTilesX();
        var numTilesY = getNumTilesY();
        
        var tileX = tileId % numTilesX;
        var tileY = Math.floor(tileId / numTilesX);
        
        if (tileY > numTilesY || tileX < 0 || tileY < 0) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Tile index ' + tileId + ' is not in range');
        }
        
        var horizontalEdge =
            tileX === 0 ? EDGE_TYPE_FIRST :
            tileX === (numTilesX - 1) ? EDGE_TYPE_LAST :
            EDGE_TYPE_NO_EDGE;
        
        var verticalEdge =
            tileY === 0 ? EDGE_TYPE_FIRST :
            tileY === (numTilesY - 1) ? EDGE_TYPE_LAST :
            EDGE_TYPE_NO_EDGE;
        
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
    
    function getLevelWidth(numResolutionLevelsToCut) {
        if (numResolutionLevelsToCut === undefined) {
            return params.imageWidth;
        }
        
        var size = getSizeOfPart({
            minX: 0,
            maxXExclusive: params.imageWidth,
            minY: 0,
            maxYExclusive: params.imageHeight,
            numResolutionLevelsToCut: numResolutionLevelsToCut
            });
        
        return size.width;
    }
    
    function getLevelHeight(numResolutionLevelsToCut) {
        if (numResolutionLevelsToCut === undefined) {
            return params.imageHeight;
        }
        
        var size = getSizeOfPart({
            minX: 0,
            maxXExclusive: params.imageWidth,
            minY: 0,
            maxYExclusive: params.imageHeight,
            numResolutionLevelsToCut: numResolutionLevelsToCut
            });
        
        return size.height;
    }

    function getTileWidth(numResolutionLevelsToCut) {
        if (numResolutionLevelsToCut === undefined) {
            return params.tileWidth;
        }
    
        var scale = 1 << numResolutionLevelsToCut;
        var width = Math.ceil(params.tileWidth / scale);
        return width;
    }
    
    function getTileHeight(numResolutionLevelsToCut) {
        if (numResolutionLevelsToCut === undefined) {
            return params.tileHeight;
        }
    
        var scale = 1 << numResolutionLevelsToCut;
        var height = Math.ceil(params.tileHeight / scale);
        return height;
    }
    
    function getFirstTileOffsetX() {
        return params.firstTileOffsetX;
    }
    
    function getFirstTileOffsetY() {
        return params.firstTileOffsetY;
    }

    function getFirstTileWidth(numResolutionLevelsToCut) {
        var firstTileWidthBestLevel =
            getTileWidth() - getFirstTileOffsetX();
        
        var imageWidth = getLevelWidth();
        if (firstTileWidthBestLevel > imageWidth) {
            firstTileWidthBestLevel = imageWidth;
        }
        
        var scale = 1 << numResolutionLevelsToCut;
        var firstTileWidth = Math.ceil(firstTileWidthBestLevel / scale);
        
        return firstTileWidth;
    }
    
    function getFirstTileHeight(numResolutionLevelsToCut) {
        var firstTileHeightBestLevel =
            getTileHeight() - getFirstTileOffsetY();
        
        var imageHeight = getLevelHeight();
        if (firstTileHeightBestLevel > imageHeight) {
            firstTileHeightBestLevel = imageHeight;
        }
        
        var scale = 1 << numResolutionLevelsToCut;
        var firstTileHeight = Math.ceil(firstTileHeightBestLevel / scale);

        return firstTileHeight;
    }

    return this;
};
},{"j2k-jpip-globals.js":15}],3:[function(require,module,exports){
'use strict';

module.exports.JpipFetchHandle = JpipFetchHandle;

var jGlobals = require('j2k-jpip-globals.js');

function JpipFetchHandle(requester, imageDataContext, dedicatedChannelHandle) {
    this._requester = requester;
    this._imageDataContext = imageDataContext;
    this._serverRequest = null;
    this._dedicatedChannelHandle = dedicatedChannelHandle;
    this._isFailure = false;
    this._isMoved = false;
    this._requesterCallbackOnAllDataRecievedBound = this._requesterCallbackOnAllDataRecieved.bind(this);
    this._requesterCallbackOnFailureBound = this._requesterCallbackOnFailure.bind(this);
}

JpipFetchHandle.prototype.resume = function resume() {
    if (this._serverRequest !== null) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot resume already-active-fetch');
    }
    
    if (this._imageDataContext.isDisposed()) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot fetch data with disposed imageDataContext');
    }
    
    if (this._dedicatedChannelHandle) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot resume movable fetch; Should start a new fetch with same' +
            ' dedicatedChannelHandle instead');
    }
    
    if (this._imageDataContext.isDone()) {
        return;
    }
    
    var numQualityLayersToWait = this._imageDataContext.getNextQualityLayer();
        
    this._serverRequest = this._requester.requestData(
        this._imageDataContext.getCodestreamPartParams(),
        this._requesterCallbackOnAllDataRecievedBound,
        this._requesterCallbackOnFailureBound,
        numQualityLayersToWait,
        this._dedicatedChannelHandle);
};

JpipFetchHandle.prototype.stopAsync = function stopAsync() {
    if (this._serverRequest === null) {
        if (this._imageDataContext.isDisposed() || this._imageDataContext.isDone()) {
            return;
        }
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot stop already stopped fetch');
    }
    
    if (this._dedicatedChannelHandle) {
        this._isMoved = true;
    } else {
        this._requester.stopRequestAsync(this._serverRequest);
        this._serverRequest = null;
    }
    
    return new Promise(function(resolve, reject) {
        // NOTE: Send a stop request within JpipRequest and resolve the Promise
        // only after server response (This is only performance issue, no
        // functional problem: a new fetch will trigger a JPIP request with
        // wait=no, and the old request will be actually stopped).
        resolve();
    });
};

JpipFetchHandle.prototype._requesterCallbackOnAllDataRecieved =
    function requesterCallbackOnAllDataRecieved(request, isResponseDone) {
    
    if (this._isMoved) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Data callback to an old fetch which has been already moved');
    }
    
    if (isResponseDone &&
        !this._imageDataContext.isDisposed() &&
        !this._imageDataContext.isDone()) {
            
        throw new jGlobals.jpipExceptions.IllegalDataException(
            'JPIP server not returned all data', 'D.3');
    }
};

JpipFetchHandle.prototype._requesterCallbackOnFailure =
    function requesterCallbackOnFailure() {
        
    //updateStatus(STATUS_ENDED, 'endAsync()');
    
    //if (failureCallback !== undefined) {
    //    failureCallback(self, userContextVars);
    //} else {
    //    isFailure = true;
    //}
    this._isFailure = true;

    if (this._isMoved) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Failure callback to an old fetch which has been already moved');
    }
};
},{"j2k-jpip-globals.js":15}],4:[function(require,module,exports){
var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipImageDataContext = JpipImageDataContext;

function JpipImageDataContext(jpipObjects, codestreamPartParams, progressiveness) {
    this._codestreamPartParams = codestreamPartParams;
    this._progressiveness      = progressiveness;
    this._reconstructor        = jpipObjects.reconstructor;
    this._packetsDataCollector = jpipObjects.packetsDataCollector;
    this._qualityLayersCache   = jpipObjects.qualityLayersCache;
    this._codestreamStructure  = jpipObjects.codestreamStructure;
    this._databinsSaver        = jpipObjects.databinsSaver;
    this._jpipFactory          = jpipObjects.jpipFactory;

    this._progressiveStagesFinished = 0;
    this._qualityLayersReached = 0;
    
    this._listener = jpipFactory.createRequestDatabinsListener(
        codestreamPartParams,
        this._qualityLayerReachedCallback.bind(this),
        codestreamStructure,
        databinsSaver,
        qualityLayersCache);
    
    this._tryAdvanceProgressiveStage();
}

JpipImageDataContext.prototype.hasData = function hasData() {
    //ensureNoFailure();
    this._ensureNotDisposed();
    return this._progressiveStagesFinished > 0;
};

JpipImageDataContext.prototype.getFetchedData = function getFetchedData(maxNumQualityLayers) {
    this._ensureNotDisposed();
    if (!this.hasData()) {
        throw 'JpipImageDataContext error: cannot call getFetchedData before hasData = true';
    }
    
    ensureNoFailure();
    var params = this._getParamsForDataWriter(maxNumQualityLayers);
    var codeblocks = this._packetsDataCollector.getAllCodeblocksData(
        params.codestreamPartParams,
        params.minNumQualityLayers);
    
    var headersCodestream = this._reconstructor.createCodestreamForRegion(
        params.codestreamPartParams,
        params.minNumQualityLayers,
        /*isOnlyHeadersWithoutBitstream=*/true);
    
    if (codeblocks.codeblocksData === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not collect codeblocks although progressiveness ' +
            'stage has been reached');
    }
    
    if (codestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not reconstruct codestream although ' +
            'progressiveness stage has been reached');
    }
    
    //alreadyReturnedCodeblocks = codeblocks.alreadyReturnedCodeblocks;
    return {
        headersCodestream: headersCodestream,
        codeblocksData: codeblocks.codeblocksData,
        codestreamPartParams: codestreamPartParams
    };
};

JpipImageDataContext.prototype.getFetchedDataAsCodestream = function getFetchedDataAsCodestream(maxNumQualityLayers) {
    this._ensureNotDisposed();
    //ensureNoFailure();
    
    var params = this._getParamsForDataWriter(maxNumQualityLayers);
    
    var codestream = this._reconstructor.createCodestreamForRegion(
        params.codestreamPartParams,
        params.minNumQualityLayers);
    
    if (codestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not reconstruct codestream although ' +
            'progressiveness stage has been reached');
    }
    
    return codestream;
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
    return this._isRequestDone;
};

JpipImageDataContext.prototype.dispose = function dispose() {
    this._ensureNotDisposed();
    this._listener.unregister();
    this._listener = null;
};

JpipImageDataContext.prototype.setIsProgressive = function setIsProgressive(isProgressive) {
    this._ensureNotDisposed();
    var oldIsProgressive = this._isProgressive;
    this._isProgressive = isProgressive;
    if (!oldIsProgressive && isProgressive && this.hasData()) {
        for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i](this);
        }
    }
};

// Methods for JpipFetchHandle

JpipImageDataContext.prototype.isDisposed = function isDisposed() {
    return this._listener !== null;
};

JpipImageDataContext.prototype.getCodestreamPartParams =
    function getCodestreamPartParams() {
        
    return this._codestreamPartParams;
};

JpipImageDataContext.prototype.getNextQualityLayer =
    function getNextQualityLayer() {
        
    return this._progressiveness[this._progressiveStagesFinished].minNumQualityLayers;
};

// Private methods

JpipImageDataContext.prototype._tryAdvanceProgressiveStage = function tryAdvanceProgressiveStage() {
    var numQualityLayersToWait = this._progressiveness[
        this._progressiveStagesFinished].minNumQualityLayers;

    if (this._qualityLayersReached < numQualityLayersToWait) {
        return false;
    }
    
    if (this._qualityLayersReached === 'max') {
        this._progressiveStagesFinished = this._progressiveness.length;
    }
    
    while (this._progressiveStagesFinished < this._progressiveness.length) {
        var qualityLayersRequired = this._progressiveness[
            this._progressiveStagesFinished].minNumQualityLayers;
        
        if (qualityLayersRequired === 'max' ||
            qualityLayersRequired > this._qualityLayersReached) {
            
            break;
        }
        
        ++this._progressiveStagesFinished;
    }
    
    this._isRequestDone = this._progressiveStagesFinished === progressiveness.length;

    return true;
};

JpipImageDataContext.prototype._qualityLayerReachedCallback = function qualityLayerReachedCallback(qualityLayersReached) {
    this._qualityLayersReached = qualityLayersReached;
    
    if (this._isRequestDone) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Request already done but callback is called');
    }
    
    if (!this._tryAdvanceProgressiveStage()) {
        return;
    }
    
    if (!this._isProgressive && !this._isRequestDone) {
        return;
    }
    
    for (var i = 0; i < this._dataListeners.length; ++i) {
        this._dataListeners[i](this);
    }
};

JpipImageDataContext.prototype._getParamsForDataWriter = function getParamsForDataWriter(maxNumQualityLayers) {
    //ensureNotEnded(status, /*allowZombie=*/true);
    
    //if (codestreamPartParams === null) {
    //    throw new jGlobals.jpipExceptions.InvalidOperationException('Cannot ' +
    //        'get data of zombie request with no codestreamPartParams');
    //}
    
    //var isRequestDone = progressiveStagesFinished === progressiveness.length;
    //if (!isRequestDone) {
    //    ensureNotWaitingForUserInput(status);
    //}
    
    if (this._progressiveStagesFinished === 0) {
        throw new jGlobals.jpipExceptions.IllegalOperationException(
            'Cannot create codestream before first progressiveness ' +
            'stage has been reached');
    }
    
    var minNumQualityLayers =
        this._progressiveness[this._progressiveStagesFinished - 1].minNumQualityLayers;
    
    var newParams = this._codestreamPartParams;
    if (maxNumQualityLayers !== undefined) {
        newParams = Object.create(this._codestreamPartParams);
        newParams.maxNumQualityLayers = maxNumQualityLayers;
        
        if (minNumQualityLayers !== 'max') {
            minNumQualityLayers = Math.min(
                minNumQualityLayers, maxNumQualityLayers);
        }
    }
    
    return {
        codestreamPartParams: newParams,
        minNumQualityLayers: minNumQualityLayers
        };
};

JpipImageDataContext.prototype._ensureNotDisposed = function ensureNotDisposed() {
    if (this.isDisposed()) {
        throw new jpipExceptions.IllegalOperationException('Cannot use ImageDataContext after disposed');
    }
};

},{"j2k-jpip-globals.js":15}],5:[function(require,module,exports){
var JpipCodestreamClient = require('jpip-codestream-client.js').JpipCodestreamClient;
var PdfjsJpxDecoder = require('pdfjs-jpx-decoder.js').PdfjsJpxDecoder;
var JpipCodestreamSizesCalculator = require('jpip-codestream-sizes-calculator.js').JpipCodestreamSizesCalculator;

module.exports.JpipImageImplementation = {
	createFetcher: function createFetcher(url) {
        return new Promise(function(resolve, reject) {
            var codestreamClient = new JpipCodestreamClient();
            codestreamClient.setStatusCallback(function(status) {
                if (status.isReady) {
                    resolve({
                        fetcher: codestreamClient,
                        sizesParams: fetcher.getSizesParams()
                    });
                } else if (status.exception) {
                    codestreamClient.setStatusCallback(null);
                    reject(status.exception);
                }
            });
            codestreamClient.open(url);
        });
    },
    
    createPixelsDecoder: function createPixelsDecoder() {
        return new PdfjsJpxDecoder();
    },
    
    createImageParamsRetriever: function createImageParamsRetriever(imageParams) {
		return new JpipCodestreamSizesCalculator(imageParams);
    },
    
    getScriptsToImport: function getScriptsToImport() {
        var errorWithStackTrace = new Error();
        var stack = errorWithStackTrace.stack.trim();
        
        var currentStackFrameRegex = /at (|[^ ]+ \()([^ ]+):\d+:\d+/;
        var source = currentStackFrameRegex.exec(stack);
        if (source && source[2] !== "") {
            return [source[2]];
        }

        var lastStackFrameRegex = new RegExp(/.+\/(.*?):\d+(:\d+)*$/);
        source = lastStackFrameRegex.exec(stack);
        if (source && source[1] !== "") {
            return [source[1]];
        }
        
        if (errorWithStackTrace.fileName !== undefined) {
            return [errorWithStackTrace.fileName];
        }
        
        throw 'JpipImageImplementation: Could not get current script URL';
    }
};
},{"jpip-codestream-client.js":1,"jpip-codestream-sizes-calculator.js":2,"pdfjs-jpx-decoder.js":6}],6:[function(require,module,exports){
'use strict';

module.exports.PdfjsJpxDecoder = PdfjsJpxDecoder;

var jGlobals = require('j2k-jpip-globals.js');

function PdfjsJpxDecoder() {
    this._image = new JpxImage();
}

PdfjsJpxDecoder.prototype.decode = function decode(data) {
    return new Promise(function(resolve, reject) {
        var regionToParse = {
            left  : data.headersCodestream.offsetX,
            top   : data.headersCodestream.offsetY,
            right : data.codestreamPartParams.maxXExclusive - data.codestreamPartParams.minX,
            bottom: data.codestreamPartParams.maxYExclusive - data.codestreamPartParams.minY
        };
        
        var currentContext = this._image.parseCodestream(
            data.headersCodestream.codestream,
            0,
            data.headersCodestream.codestream.length,
            { isOnlyParseHeaders: true });
        
        this._image.addPacketsData(currentContext, data.codeblocksData);
        
        this._image.decode(currentContext, { regionToParse: regionToParse });

        var result = this._copyTilesPixelsToOnePixelsArray(this._image.tiles, regionToParse, this._image.componentsCount);
        resolve(result);
    });
};

PdfjsJpxDecoder.prototype._copyTilesPixelsToOnePixelsArray =
    function copyTilesPixelsToOnePixelsArray(tiles, resultRegion, componentsCount) {
        
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
        
        if (intersectionLeft !== tiles[i].left ||
            intersectionTop !== tiles[i].top ||
            intersectionWidth !== tiles[i].width ||
            intersectionHeight !== tiles[i].height) {
            
            throw 'Unsupported tiles to copy';
        }
        
        var tileOffsetXPixels = intersectionLeft - resultRegion.left;
        var tileOffsetYPixels = intersectionTop - resultRegion.top;
            
        var tileOffsetBytes =
            tileOffsetXPixels * bytesPerPixel +
            tileOffsetYPixels * rgbaImageStride;

        this._copyTile(
            result.data, tiles[i], tileOffsetBytes, rgbaImageStride, componentsCount);
    }
    
    return result;
};

PdfjsJpxDecoder.prototype._copyTile = function copyTile(
    targetImage, tile, targetImageStartOffset, targetImageStride, componentsCount) {
    
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
},{"j2k-jpip-globals.js":15}],7:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.CompositeArray = function CompositeArray(offset) {
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

    this.copyToTypedArray = function copyToTypedArray(
        resultArray, resultArrayOffset, minOffset, maxOffset) {
        
        checkOffsetsToCopy(minOffset, maxOffset);
        
        var iterator = getInternalPartsIterator(minOffset, maxOffset);
        
        // NOTE: What if data not in first part?
        
        while (tryAdvanceIterator(iterator)) {
            var offsetInResult =
                iterator.offset - resultArrayOffset;
            
            resultArray.set(iterator.subArray, offsetInResult);
        }
    };

    this.copyToArray = function copyToArray(
        resultArray, resultArrayOffset, minOffset, maxOffset) {
        
        checkOffsetsToCopy(minOffset, maxOffset);
        
        var iterator = getInternalPartsIterator(minOffset, maxOffset);
        
        // NOTE: What if data not in first part?
        
        while (tryAdvanceIterator(iterator)) {
            var offsetInResult =
                iterator.offset - resultArrayOffset;
            
            for (var j = 0; j < iterator.subArray.length; ++j) {
                resultArray[offsetInResult++] = iterator.subArray[j];
            }
        }
    };
    
    this.copyToOther = function copyToOther(other) {
        if (other.getOffset() > offset) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'CompositeArray: Trying to copy part into a latter part');
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'CompositeArray: Could not merge parts');
        }
        
        var expectedOffsetValue = minOffset;

        do {
            if (iterator.offset !== expectedOffsetValue) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'CompositeArray: Non-continuous value of ' +
                    'rangeToCopy.offset. Expected: ' + expectedOffsetValue +
                     ', Actual: ' + iterator.offset);
            }
            
            other.pushSubArray(iterator.subArray);
            expectedOffsetValue += iterator.subArray.length;
        } while (tryAdvanceIterator(iterator));
    };
    
    function checkOffsetsToCopy(minOffset, maxOffset) {
        if (minOffset === undefined || maxOffset === undefined) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'minOffset or maxOffset is undefined for CompositeArray.copyToArray');
        }
        
        if (minOffset < offset) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'minOffset (' + minOffset + ') must be smaller than ' +
                'CompositeArray offset (' + offset + ')');
        }
        
        if (maxOffset > offset + length) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'maxOffset (' + maxOffset + ') must be larger than ' +
                'CompositeArray end offset (' + offset + length + ')');
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
                throw new jGlobals.jpipExceptions.InternalErrorException('Iterator reached ' +
                    'to the end although no data has been iterated');
            }
            
            alreadyReachedToTheEnd = !tryAdvanceIterator(iterator);
        } while (start >= iterator.internalIteratorData.nextInternalPartOffset);
        
        var cutFirstSubArray =
            start - iterator.internalIteratorData.currentInternalPartOffset;
        iterator.internalIteratorData.currentSubArray =
            iterator.internalIteratorData.currentSubArray.subarray(cutFirstSubArray);
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
        
        internalIteratorData.currentSubArray = internalParts[
            internalIteratorData.currentInternalPartIndex];
        internalIteratorData.currentInternalPartOffset =
            internalIteratorData.nextInternalPartOffset;
        var currentInternalPartLength =
            internalParts[internalIteratorData.currentInternalPartIndex].length;
        
        internalIteratorData.nextInternalPartOffset =
            internalIteratorData.currentInternalPartOffset + currentInternalPartLength;

        var cutLastSubArray =
            internalIteratorData.end - internalIteratorData.currentInternalPartOffset;
        var isLastSubArray =
            cutLastSubArray < internalIteratorData.currentSubArray.length;
        
        if (isLastSubArray) {
            internalIteratorData.currentSubArray = internalIteratorData
                .currentSubArray.subarray(0, cutLastSubArray);
        }
        
        return true;
    }
    
    function ensureNoEndOfArrayReached(currentInternalPartIndex) {
        if (currentInternalPartIndex >= internalParts.length) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'CompositeArray: end of part has reached. Check end calculation');
        }
    }
};
},{"j2k-jpip-globals.js":15}],8:[function(require,module,exports){
'use strict';

// A.2.1.

module.exports.JpipDatabinParts = function JpipDatabinParts(
    classId, inClassId, jpipFactory) {

    var self = this;

    var parts = [];
    var databinLengthIfKnown = null;
    var loadedBytes = 0;
    
    var cachedData = [];
    
    this.getDatabinLengthIfKnown = function() {
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
                result =
                    parts[0].getOffset() === 0 &&
                    parts[0].getLength() === databinLengthIfKnown;
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
        
        var maxLengthCopied = iterateRange(
            params.databinStartOffset,
            params.maxLengthToCopy,
            function addPartToResultInCopyToCompositeArray(part, minOffsetInPart, maxOffsetInPart) {
                part.copyToOtherAtTheEnd(
                    result,
                    minOffsetInPart,
                    maxOffsetInPart);
            });
        
        return maxLengthCopied;
    };
    
    this.copyBytes = function(resultArray, resultStartOffset, rangeOptions) {
        var params = getParamsForCopyBytes(resultStartOffset, rangeOptions);
        
        if (params.resultWithoutCopy !== undefined) {
            return params.resultWithoutCopy;
        }
        
        var resultArrayOffsetInDatabin = params.databinStartOffset - params.resultStartOffset;
        
        var maxLengthCopied = iterateRange(
            params.databinStartOffset,
            params.maxLengthToCopy,
            function addPartToResultInCopyBytes(part, minOffsetInPart, maxOffsetInPart) {
                part.copyToArray(
                    resultArray,
                    resultArrayOffsetInDatabin,
                    minOffsetInPart,
                    maxOffsetInPart);
            });
        
        return maxLengthCopied;
    };
    
    this.getExistingRanges = function() {
        var result = new Array(parts.length);
        
        for (var i = 0; i < parts.length; ++i) {
            result[i] = {
                start: parts[i].getOffset(),
                length: parts[i].getLength()
                };
        }
        
        return result;
    };
    
    this.addData = function(header, message) {
        if (header.isLastByteInDatabin) {
            databinLengthIfKnown = header.messageOffsetFromDatabinStart + header.messageBodyLength;
        }
        
        if (header.messageBodyLength === 0) {
            return;
        }

        var newPart = jpipFactory.createCompositeArray(
            header.messageOffsetFromDatabinStart);

        var endOffsetInMessage = header.bodyStart + header.messageBodyLength;
        newPart.pushSubArray(message.subarray(header.bodyStart, endOffsetInMessage));

        // Find where to push the new message
        
        var indexFirstPartAfter = findFirstPartAfterOffset(header.messageOffsetFromDatabinStart);
        var indexFirstPartNearOrAfter = indexFirstPartAfter;

        if (indexFirstPartAfter > 0) {
            var previousPart = parts[indexFirstPartAfter - 1];
            var previousPartEndOffset =
                previousPart.getOffset() + previousPart.getLength();
            
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
        var endOffsetInDatabin =
            header.messageOffsetFromDatabinStart + header.messageBodyLength;
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

        var shouldSwap =
            firstPartNearOrAfter.getOffset() > header.messageOffsetFromDatabinStart;
        if (shouldSwap) {
            parts[indexFirstPartNearOrAfter] = newPart;
            newPart = firstPartNearOrAfter;
            
            firstPartNearOrAfter = parts[indexFirstPartNearOrAfter];
        }

        newPart.copyToOther(firstPartNearOrAfter);
        
        var endOffset =
            firstPartNearOrAfter.getOffset() + firstPartNearOrAfter.getLength();
        
        var partToMergeIndex;
        for (partToMergeIndex = indexFirstPartNearOrAfter;
            partToMergeIndex < parts.length - 1;
            ++partToMergeIndex) {
            
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
        
        if ((databinLengthIfKnown !== null) && (databinStartOffset >= databinLengthIfKnown)) {
            return { resultWithoutCopy: (!!maxLengthToCopy && forceCopyAllRange ? null : 0) };
        }
        
        var firstRelevantPartIndex = findFirstPartAfterOffset(databinStartOffset);
        
        if (firstRelevantPartIndex === parts.length) {
            return { resultWithoutCopy: (forceCopyAllRange ? null : 0) };
        }
        
        if (forceCopyAllRange) {
            var isAllRequestedRangeExist =
                isAllRangeExist(databinStartOffset, maxLengthToCopy, firstRelevantPartIndex);
            
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
    
    function isAllRangeExist(
        databinStartOffset, maxLengthToCopy, firstRelevantPartIndex) {
        
        if (parts[firstRelevantPartIndex].getOffset() > databinStartOffset) {
            return false;
        }
        
        if (maxLengthToCopy) {
            var unusedElements =
                databinStartOffset - parts[firstRelevantPartIndex].getOffset();
            var availableLength =
                parts[firstRelevantPartIndex].getLength() - unusedElements;
            
            var isUntilMaxLengthExist = availableLength >= maxLengthToCopy;
            return isUntilMaxLengthExist;
        }
        
        if (databinLengthIfKnown === null ||
            firstRelevantPartIndex < parts.length - 1) {
            
            return false;
        }
        
        var lastPart = parts[parts.length - 1];
        var endOffsetRecieved = lastPart.getOffset() + lastPart.getLength();
        
        var isUntilEndOfDatabinExist = endOffsetRecieved === databinLengthIfKnown;
        return isUntilEndOfDatabinExist;
    }
    
    function iterateRange(
            databinStartOffset,
            maxLengthToCopy,
        addSubPartToResult) {
        
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
            
            var currentMinOffsetInDatabinToCopy = Math.max(
                minOffsetInDatabinToCopy, parts[i].getOffset());
            var currentMaxOffsetInDatabinToCopy = Math.min(
                maxOffsetInDatabinToCopy, parts[i].getOffset() + parts[i].getLength());
        
            addSubPartToResult(
                parts[i],
                currentMinOffsetInDatabinToCopy,
                currentMaxOffsetInDatabinToCopy);
            
            lastCopiedPart = parts[i];
        }
        
        if (lastCopiedPart === null) {
            return 0;
        }
        
        var lastOffsetCopied = Math.min(
            lastCopiedPart.getOffset() + lastCopiedPart.getLength(),
            maxOffsetInDatabinToCopy);
        
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
},{}],9:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipDatabinsSaver = function JpipDatabinsSaver(isJpipTilePartStream, jpipFactory) {
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
            listenerThis: listenerThis
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
                        listener.listener.call(listener.listenerThis, databin);
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
},{"j2k-jpip-globals.js":15}],10:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipObjectPoolByDatabin = function JpipObjectPoolByDatabin() {
    var databinIdToObject = [];
    
    this.getObject = function getObject(databin) {
        var classId = databin.getClassId();
        var inClassIdToObject = databinIdToObject[classId];
        
        if (inClassIdToObject === undefined) {
            inClassIdToObject = [];
            databinIdToObject[classId] = inClassIdToObject;
        }
        
        var inClassId = databin.getInClassId();
        var obj = inClassIdToObject[inClassId];
        
        if (obj === undefined) {
            obj = {};
            obj.databin = databin;
            
            inClassIdToObject[inClassId] = obj;
        } else if (obj.databin !== databin) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Databin IDs are not unique');
        }
        
        return obj;
    };
};
},{"j2k-jpip-globals.js":15}],11:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipRequestDatabinsListener = function JpipRequestDatabinsListener(
    codestreamPartParams,
    qualityLayerReachedCallback,
    codestreamStructure,
    databinsSaver,
    qualityLayersCache,
    jpipFactory) {
    
    var numQualityLayersToWaitFor;
    var tileHeadersNotLoaded = 0;
    var minNumQualityLayersReached = 0;
    var unregistered = false;
    
    var registeredTileHeaderDatabins = [];
    var registeredPrecinctDatabins = [];
    var accumulatedDataPerDatabin = jpipFactory.createObjectPoolByDatabin();
    var precinctCountByReachedQualityLayer = [];
    
    register();
    
    this.unregister = function unregister() {
        if (unregistered) {
            return;
        }
    
        for (var i = 0; i < registeredTileHeaderDatabins.length; ++i) {
            databinsSaver.removeEventListener(
                registeredTileHeaderDatabins[i],
                'dataArrived',
                tileHeaderDataArrived);
        }
        
        for (var j = 0; j < registeredPrecinctDatabins.length; ++j) {
            databinsSaver.removeEventListener(
                registeredPrecinctDatabins[j],
                'dataArrived',
                precinctDataArrived);
        }
        
        unregistered = true;
    };
    
    function register() {
        ++tileHeadersNotLoaded;
        
        var tileIterator = codestreamStructure.getTilesIterator(codestreamPartParams);
        do {
            var tileIndex = tileIterator.tileIndex;
            var databin = databinsSaver.getTileHeaderDatabin(tileIndex);
            registeredTileHeaderDatabins.push(databin);
            
            databinsSaver.addEventListener(
                databin, 'dataArrived', tileHeaderDataArrived);
                
            ++tileHeadersNotLoaded;
            tileHeaderDataArrived(databin);
        } while (tileIterator.tryAdvance());
        
        --tileHeadersNotLoaded;
        tryAdvanceQualityLayersReached();
    }
    
    function tileHeaderDataArrived(tileHeaderDatabin) {
        if (!tileHeaderDatabin.isAllDatabinLoaded()) {
            return;
        }
        
        var tileAccumulatedData = accumulatedDataPerDatabin.getObject(
            tileHeaderDatabin);
        
        if (tileAccumulatedData.isAlreadyLoaded) {
            return;
        }
        
        tileAccumulatedData.isAlreadyLoaded = true;
        --tileHeadersNotLoaded;
        
        var tileIndex = tileHeaderDatabin.getInClassId();
        var tileStructure = codestreamStructure.getTileStructure(tileIndex);
        var maxNumQualityLayersInTile = tileStructure.getNumQualityLayers();
        
        var precinctIterator = tileStructure.getPrecinctIterator(
            tileIndex, codestreamPartParams);

        do {
            if (!precinctIterator.isInCodestreamPart) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected precinct not in codestream part');
            }
            
            var inClassId = tileStructure.precinctPositionToInClassIndex(
                precinctIterator);
                
            var precinctDatabin = databinsSaver.getPrecinctDatabin(inClassId);
            registeredPrecinctDatabins.push(precinctDatabin);
            var accumulatedData = accumulatedDataPerDatabin.getObject(
                precinctDatabin);
            
            if (accumulatedData.maxNumQualityLayersInTile !== undefined) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Tile was ' +
                    'iterated twice in codestream part');
            }
            
            accumulatedData.maxNumQualityLayersInTile = maxNumQualityLayersInTile;
            incrementPrecinctQualityLayers(
                precinctDatabin, accumulatedData, precinctIterator);
            
            databinsSaver.addEventListener(
                precinctDatabin, 'dataArrived', precinctDataArrived);
        } while (precinctIterator.tryAdvance());
        
        tryAdvanceQualityLayersReached();
    }
    
    function precinctDataArrived(precinctDatabin) {
        var accumulatedData = accumulatedDataPerDatabin.getObject(
            precinctDatabin);

        var oldQualityLayersReached = accumulatedData.numQualityLayersReached;
        var maxNumQualityLayersInTile =
            accumulatedData.maxNumQualityLayersInTile;

        if (oldQualityLayersReached === maxNumQualityLayersInTile) {
            return;
        }
        
        --precinctCountByReachedQualityLayer[oldQualityLayersReached];
        incrementPrecinctQualityLayers(precinctDatabin, accumulatedData);
        
        tryAdvanceQualityLayersReached();
    }
    
    function incrementPrecinctQualityLayers(
        precinctDatabin, accumulatedData, precinctIteratorOptional) {
        
        var qualityLayers = qualityLayersCache.getQualityLayerOffset(
            precinctDatabin,
            codestreamPartParams.maxNumQualityLayers,
            precinctIteratorOptional);

        var numQualityLayersReached = qualityLayers.numQualityLayers;
        accumulatedData.numQualityLayersReached = numQualityLayersReached;

        var maxNumQualityLayersInTile =
            accumulatedData.maxNumQualityLayersInTile;

        if (numQualityLayersReached === maxNumQualityLayersInTile) {
            return;
        }
        
        var prevCount =
            precinctCountByReachedQualityLayer[numQualityLayersReached] || 0;
        
        precinctCountByReachedQualityLayer[numQualityLayersReached] =
            prevCount + 1;
    }
    
    function tryAdvanceQualityLayersReached() {
        if (precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0 ||
            minNumQualityLayersReached === 'max' ||
            minNumQualityLayersReached >= numQualityLayersToWaitFor ||
            tileHeadersNotLoaded > 0) {
            
            return;
        }
        
        var hasPrecinctsInQualityLayer;
        var maxQualityLayers = precinctCountByReachedQualityLayer.length;
        
        do {
            ++minNumQualityLayersReached;
            
            if (minNumQualityLayersReached >= maxQualityLayers) {
                minNumQualityLayersReached = 'max';
                break;
            }
            
            hasPrecinctsInQualityLayer =
                precinctCountByReachedQualityLayer[minNumQualityLayersReached] > 0;
        } while (!hasPrecinctsInQualityLayer);
        
        qualityLayerReachedCallback(minNumQualityLayersReached);
    }
    
    function ensureQualityLayersStatisticsForDebug() {
        var precinctCountByReachedQualityLayerExpected = [];
        
        for (var i = 0; i < registeredPrecinctDatabins.length; ++i) {
            var accumulatedData = accumulatedDataPerDatabin.getObject(
                registeredPrecinctDatabins[i]);
            
            var maxNumQualityLayersInTile =
                accumulatedData.maxNumQualityLayersInTile;
                
            if (maxNumQualityLayersInTile === undefined) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'No information of maxNumQualityLayersInTile in ' +
                    'JpipRequestDatabinsListener');
            }
            
            var qualityLayers = qualityLayersCache.getQualityLayerOffset(
                registeredPrecinctDatabins[i],
                codestreamPartParams.maxNumQualityLayers);
            
            if (qualityLayers.numQualityLayers === maxNumQualityLayersInTile) {
                continue;
            }
            
            var oldValue = precinctCountByReachedQualityLayerExpected[
                qualityLayers.numQualityLayers];
            
            precinctCountByReachedQualityLayerExpected[
                qualityLayers.numQualityLayers] = (oldValue || 0) + 1;
        }
        
        var length = Math.max(
            precinctCountByReachedQualityLayerExpected.length,
            precinctCountByReachedQualityLayer.length);
            
        var minNumQualityLayersReachedExpected = 'max';
        
        for (var j = 0; j < length; ++j) {
            var isExpectedZero = (precinctCountByReachedQualityLayerExpected[j] || 0) === 0;
            var isActualZero = (precinctCountByReachedQualityLayer[j] || 0) === 0;
            
            if (isExpectedZero !== isActualZero) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Wrong accumulated statistics in JpipRequestDatabinsListener');
            }
            
            if (isExpectedZero) {
                continue;
            }
            
            if (precinctCountByReachedQualityLayer[j] !==
                precinctCountByReachedQualityLayerExpected[j]) {
                
                throw new jGlobals.jpipExceptions.InternalErrorException('Wrong ' +
                    'accumulated statistics in JpipRequestDatabinsListener');
            }
            
            if (minNumQualityLayersReachedExpected === 'max') {
                minNumQualityLayersReachedExpected = j;
            }
        }
        
        if (minNumQualityLayersReached !== minNumQualityLayersReachedExpected) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Wrong minNumQualityLayersReached in JpipRequestDatabinsListener');
        }
    }
};
},{"j2k-jpip-globals.js":15}],12:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipCodestreamStructure = function JpipCodestreamStructure(
    jpipStructureParser,
    jpipFactory,
    progressionOrder) {

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

    this.getNumComponents = function() {
        validateParams();
        return params.numComponents;
    };
    
    this.getImageWidth = function() {
        validateParams();

        var size = sizesCalculator.getLevelWidth();
        return size;
    };
    
    this.getImageHeight = function() {
        validateParams();

        var size = sizesCalculator.getLevelHeight();
        return size;
    };
    
    this.getLevelWidth = function(numResolutionLevelsToCut) {
        validateParams();

        var size = sizesCalculator.getLevelWidth(numResolutionLevelsToCut);
        return size;
    };
    
    this.getLevelHeight = function(numResolutionLevelsToCut) {
        validateParams();

        var size = sizesCalculator.getLevelHeight(numResolutionLevelsToCut);
        return size;
    };
    
    this.getTileWidth = function(numResolutionLevelsToCut) {
        validateParams();

        var size = sizesCalculator.getTileWidth(numResolutionLevelsToCut);
        return size;
    };
    
    this.getTileHeight = function(numResolutionLevelsToCut) {
        validateParams();

        var size = sizesCalculator.getTileHeight(numResolutionLevelsToCut);
        return size;
    };
    
    this.getFirstTileOffsetX = function() {
        validateParams();

        var offset = sizesCalculator.getFirstTileOffsetX();
        return offset;
    };
    
    this.getFirstTileOffsetY = function() {
        validateParams();

        var offset = sizesCalculator.getFirstTileOffsetY();
        return offset;
    };
    
    this.getTileLeft = function getTileLeft(
        tileIndex, numResolutionLevelsToCut) {
        
        validateParams();
        
        var tileX = tileIndex % sizesCalculator.getNumTilesX();
        if (tileX === 0) {
            return 0;
        }
        
        var tileLeft =
            (tileX - 1) * sizesCalculator.getTileWidth(numResolutionLevelsToCut) +
            sizesCalculator.getFirstTileWidth(numResolutionLevelsToCut);
        
        return tileLeft;
    };
    
    this.getTileTop = function getTileTop(tileIndex, numResolutionLevelsToCut) {
        validateParams();
        
        var tileY = Math.floor(tileIndex / sizesCalculator.getNumTilesX());
        if (tileY === 0) {
            return 0;
        }
        
        var tileTop =
            (tileY - 1) * sizesCalculator.getTileHeight(numResolutionLevelsToCut) +
            sizesCalculator.getFirstTileHeight(numResolutionLevelsToCut);
        
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

    this.tilePositionToInClassIndex = function(tilePosition) {
        validateParams();
        var tilesX = sizesCalculator.getNumTilesX();
        var tilesY = sizesCalculator.getNumTilesY();
        
        validateArgumentInRange('tilePosition.tileX', tilePosition.tileX, tilesX);
        validateArgumentInRange('tilePosition.tileY', tilePosition.tileY, tilesY);

        var inClassIndex = tilePosition.tileX + tilePosition.tileY * tilesX;
        
        return inClassIndex;
    };

    this.tileInClassIndexToPosition = function(inClassIndex) {
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
    
    this.getTilesIterator = function getTilesIterator(codestreamPartParams) {
        validateParams();
        var bounds = sizesCalculator.getTilesFromPixels(codestreamPartParams);
        
        var setableIterator = {
            currentX: bounds.minTileX,
            currentY: bounds.minTileY
        };
        
        var iterator = {
            get tileIndex() {
                var firstInRow =
                    setableIterator.currentY * sizesCalculator.getNumTilesX();
                var index = firstInRow + setableIterator.currentX;
                
                return index;
            },
            
            tryAdvance: function tryAdvance() {
                var result = tryAdvanceTileIterator(setableIterator, bounds);
                return result;
            }
        };
        
        return iterator;
    };
    
    this.getSizeOfPart = function getSizeOfPart(codestreamPartParams) {
        validateParams();
        
        var size = sizesCalculator.getSizeOfPart(codestreamPartParams);
        return size;
    };
    
    function tryAdvanceTileIterator(setableIterator, bounds) {
        if (setableIterator.currentY >= bounds.maxTileYExclusive) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Cannot advance tile iterator after end');
        }
        
        ++setableIterator.currentX;
        if (setableIterator.currentX < bounds.maxTileXExclusive) {
            return true;
        }
        
        setableIterator.currentX = bounds.minTileX;
        ++setableIterator.currentY;
        
        var isMoreTilesAvailable =
            setableIterator.currentY < bounds.maxTileYExclusive;
        
        return isMoreTilesAvailable;
    }
    
    function getTileStructure(tileId) {
        validateParams();
        
        var maxTileId =
            sizesCalculator.getNumTilesX() * sizesCalculator.getNumTilesY()- 1;
        
        if (tileId < 0 || tileId > maxTileId) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                'tileId',
                tileId,
                'Expected value between 0 and ' + maxTileId);
        }
        
        var isEdge = sizesCalculator.isEdgeTileId(tileId);
        
        if (cachedTileStructures[tileId] === undefined) {
            var tileParams = jpipStructureParser.parseOverridenTileParams(tileId);
            
            if (!!tileParams) {
                cachedTileStructures[tileId] = createTileStructure(tileParams, isEdge);
            }
            else {
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
            throw new jGlobals.jpipExceptions.ArgumentException(
                paramName,
                paramValue,
                paramName + ' is expected to be between 0 and ' + suprimumParamValue - 1);
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
                    
                    defaultTileStructureByEdgeType[horizontalEdge][verticalEdge] =
                        createTileStructure(defaultTileParams, edge);
                }
            }
        }
        
        var structureByVerticalType =
            defaultTileStructureByEdgeType[edgeType.horizontalEdgeType];
        
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
            sizesCalculator = jpipFactory.createCodestreamSizesCalculator(
                params);
        }
    }
    
    return this;
};
},{"j2k-jpip-globals.js":15}],13:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipComponentStructure = function JpipComponentStructure(
    params, tileStructure) {
    
    var tileWidthLevel0;
    var tileHeightLevel0;
    
    initialize();
    
    this.getComponentScaleX = function getComponentScaleX() {
        return params.scaleX;
    };
    
    this.getComponentScaleY = function getComponentScaleY() {
        return params.scaleY;
    };
    
    this.getNumResolutionLevels = function() {
        return params.numResolutionLevels;
    };
    
    this.getPrecinctWidth = function(resolutionLevel) {
        var width = params.precinctWidthPerLevel[resolutionLevel];
        
        return width;
    };
    
    this.getPrecinctHeight = function(resolutionLevel) {
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
    
    this.getNumCodeblocksXInPrecinct =
        function getNumCodeblocksX(precinct) {
        
        var numCodeblocksX = calculateNumCodeblocks(
            precinct,
            precinct.precinctX,
            params.maxCodeblockWidth,
            params.precinctWidthPerLevel,
            tileWidthLevel0);
        
        return numCodeblocksX;
    };
    
    this.getNumCodeblocksYInPrecinct =
        function getNumCodeblocksY(precinct) {
        
        var numCodeblocksY = calculateNumCodeblocks(
            precinct,
            precinct.precinctY,
            params.maxCodeblockHeight,
            params.precinctHeightPerLevel,
            tileHeightLevel0);
        
        return numCodeblocksY;
    };

    this.getNumPrecinctsX = function(resolutionLevel) {
        var precinctsX = calculateNumPrecincts(
            tileWidthLevel0, params.precinctWidthPerLevel, resolutionLevel);
            
        return precinctsX;
    };
    
    this.getNumPrecinctsY = function(resolutionLevel) {
        var precinctsY = calculateNumPrecincts(
            tileHeightLevel0, params.precinctHeightPerLevel, resolutionLevel);
            
        return precinctsY;
    };
    
    function calculateNumPrecincts(
        tileSizeLevel0, precinctSizePerLevel, resolutionLevel) {
    
        var resolutionFactor = getResolutionFactor(resolutionLevel);
        var tileSizeInLevel = tileSizeLevel0 / resolutionFactor;
        
        var precinctSizeInLevel = precinctSizePerLevel[resolutionLevel];
        
        var numPrecincts = Math.ceil(tileSizeInLevel / precinctSizeInLevel);
        return numPrecincts;
    }
    
    function calculateNumCodeblocks(
        precinct,
        precinctIndex,
        maxCodeblockSize,
        precinctSizePerLevel,
        tileSizeLevel0) {
        
        var resolutionFactor = getResolutionFactor(precinct.resolutionLevel);
        var tileSizeInLevel = Math.ceil(tileSizeLevel0 / resolutionFactor);
        
        var precinctBeginPixel =
            precinctIndex * precinctSizePerLevel[precinct.resolutionLevel];
        
        var precinctSize = Math.min(
            precinctSizePerLevel[precinct.resolutionLevel],
            tileSizeInLevel - precinctBeginPixel);
        
        var subbandTypeFactor = precinct.resolutionLevel === 0 ? 1 : 2;
        var subbandOfPrecinctSize = Math.ceil(precinctSize / subbandTypeFactor);
        
        var numCodeblocks = subbandTypeFactor * Math.ceil(
            subbandOfPrecinctSize / maxCodeblockSize);
        
        if (precinctSize % maxCodeblockSize === 1 &&
            precinct.resolutionLevel > 0) {
            
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
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException(
                'Non 1 component scale', 'A.5.1');
        }
        
        tileWidthLevel0 = Math.floor(
            tileStructure.getTileWidth() / params.scaleX);
        tileHeightLevel0 = Math.floor(
            tileStructure.getTileHeight() / params.scaleY);
    }
};
},{"j2k-jpip-globals.js":15}],14:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipTileStructure = function JpipTileStructure(
    sizeParams,
    codestreamStructure,
    jpipFactory,
    progressionOrder
    ) {
    
    var defaultComponentStructure;
    var componentStructures;
    var componentToInClassLevelStartIndex;
    var minNumResolutionLevels;

    this.getProgressionOrder = function() {
        return progressionOrder;
    };
    
    this.getDefaultComponentStructure = function getDefaultComponentStructure(component) {
        return defaultComponentStructure;
    };
    
    this.getComponentStructure = function getComponentStructure(component) {
        return componentStructures[component];
    };
    
    this.getTileWidth = function getTileWidthClosure() {
        return sizeParams.tileSize[0];
    };
    
    this.getTileHeight = function getTileHeightClosure() {
        return sizeParams.tileSize[1];
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
    
    this.getIsEndPacketHeaderMarkerAllowed =
        function getIsEndPacketHeaderMarkerAllowed() {
        
        return sizeParams.isEndPacketHeaderMarkerAllowed;
    };
    
    this.precinctInClassIndexToPosition = function(inClassIndex) {
        // A.3.2
        
        if (inClassIndex < 0) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                'inClassIndex',
                inClassIndex,
                'Invalid negative in-class index of precinct');
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
            var nextLevelStartIndex =
                componentToInClassLevelStartIndex[component][resolutionLevel];
            
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
            throw new jGlobals.jpipExceptions.ArgumentException(
                'inClassIndex',
                inClassIndex,
                'Invalid in-class index of precinct');
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
    
    this.precinctPositionToInClassIndex = function(precinctPosition) {
        // A.3.2

        var numComponents = codestreamStructure.getNumComponents();
        validateArgumentInRange(
            'precinctPosition.component', precinctPosition.component, numComponents);
        
        var componentStructure = componentStructures[precinctPosition.component];

        var numResolutionLevels = componentStructure.getNumResolutionLevels();
        validateArgumentInRange(
            'precinctPosition.resolutionLevel', precinctPosition.resolutionLevel, numResolutionLevels);

        var numTiles = codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        var precinctsX = componentStructure.getNumPrecinctsX(precinctPosition.resolutionLevel);
        var precinctsY = componentStructure.getNumPrecinctsY(precinctPosition.resolutionLevel);
        
        validateArgumentInRange(
            'precinctPosition.precinctX', precinctPosition.precinctX, precinctsX);
        validateArgumentInRange(
            'precinctPosition.precinctY', precinctPosition.precinctY, precinctsY);
        validateArgumentInRange(
            'precinctPosition.tileIndex', precinctPosition.tileIndex, numTiles);

        var precinctIndexInLevel = precinctPosition.precinctX + 
            precinctPosition.precinctY * precinctsX;
        
        var levelStartIndex = componentToInClassLevelStartIndex[precinctPosition.component][precinctPosition.resolutionLevel];
        
        var precinctIndex = precinctIndexInLevel + levelStartIndex;

        var inClassIndexWithoutTile =
            precinctPosition.component + precinctIndex * codestreamStructure.getNumComponents();

        var inClassIndex = precinctPosition.tileIndex + 
            inClassIndexWithoutTile * codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        
        return inClassIndex;
    };
    
    this.getPrecinctIterator = function getPrecinctIterator(
        tileIndex, codestreamPartParams, isIteratePrecinctsNotInCodestreamPart) {
        
        var numResolutionLevelsToCut = 0;
        if (codestreamPartParams !== undefined &&
            codestreamPartParams.numResolutionLevelsToCut !== undefined) {
            
            numResolutionLevelsToCut = codestreamPartParams.numResolutionLevelsToCut;
            
            if (minNumResolutionLevels <= numResolutionLevelsToCut) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot advance resolution: numResolutionLevelsToCut=' +
                    codestreamPartParams.numResolutionLevelsToCut + ' but should ' +
                    'be smaller than ' + minNumResolutionLevels);
            }
        }

        var precinctsInCodestreamPartPerLevelPerComponent =
            getPrecinctsInCodestreamPartPerLevelPerComponent(
                tileIndex, codestreamPartParams);
                
        var precinctX = 0;
        var precinctY = 0;
        if (isIteratePrecinctsNotInCodestreamPart &&
            precinctsInCodestreamPartPerLevelPerComponent !== null) {
            
            var firstPrecinctsRange =
                precinctsInCodestreamPartPerLevelPerComponent[0][0];
            precinctX = firstPrecinctsRange.minPrecinctX;
            precinctY = firstPrecinctsRange.minPrecinctY;
        }
        
        // A.6.1 in part 1: Core Coding System
        
        var setableIterator = {
            precinctIndexInComponentResolution: 0,
            component: 0,
            precinctX: precinctX,
            precinctY: precinctY,
            resolutionLevel: 0,
            isInCodestreamPart: true
            };

        var iterator = {
            get tileIndex() { return tileIndex; },
                get component() { return setableIterator.component; },
            get precinctIndexInComponentResolution() {
                return setableIterator.precinctIndexInComponentResolution;
            },
                
                get precinctX() { return setableIterator.precinctX; },
                get precinctY() { return setableIterator.precinctY; },
                get resolutionLevel() { return setableIterator.resolutionLevel; },
            get isInCodestreamPart() { return setableIterator.isInCodestreamPart; }
            };
        
        iterator.tryAdvance = function tryAdvance() {
            var isSucceeded = tryAdvancePrecinctIterator(
                setableIterator,
                numResolutionLevelsToCut,
                precinctsInCodestreamPartPerLevelPerComponent,
                isIteratePrecinctsNotInCodestreamPart);
            
            return isSucceeded;
        };
        
        return iterator;
    };
    
    function validateArgumentInRange(paramName, paramValue, suprimumParamValue) {
        if (paramValue < 0 || paramValue >= suprimumParamValue) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                paramName,
                paramValue,
                paramName + ' is expected to be between 0 and ' + suprimumParamValue - 1);
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
            minNumResolutionLevels = Math.min(
                minNumResolutionLevels, size.numResolutionLevels);
                
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
            
                if (defaultComponent.precinctWidthPerLevel[r] !==
                        size.precinctWidthPerLevel[r] ||
                    defaultComponent.precinctHeightPerLevel[r] !==
                        size.precinctHeightPerLevel[r]) {
                    
                    isComponentsIdenticalSize = false;
                }
                
                var isHorizontalPartitionSupported =
                    checkIfPrecinctPartitionStartsInTileTopLeft(
                        r,
                        size.numResolutionLevels,
                        componentStructure.getPrecinctWidth,
                        codestreamStructure.getLevelWidth,
                        codestreamStructure.getTileWidth);
                        
                var isVerticalPartitionSupported =
                    checkIfPrecinctPartitionStartsInTileTopLeft(
                        r,
                        size.numResolutionLevels,
                        componentStructure.getPrecinctWidth,
                        codestreamStructure.getLevelWidth,
                        codestreamStructure.getTileWidth);
                        
                isPrecinctPartitionFitsToTilePartition &=
                    isHorizontalPartitionSupported &&
                    isVerticalPartitionSupported;
            }
        }

        if (!isComponentsIdenticalSize) {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException(
                'Special Coding Style for Component (COC)', 'A.6.2');
        }
        
        if (!isPrecinctPartitionFitsToTilePartition) {
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException(
                'Precinct TopLeft which is not matched to tile TopLeft', 'B.6');
        }
    }
    
    function checkIfPrecinctPartitionStartsInTileTopLeft(
        resolutionLevel,
        numResolutionLevels,
        getPrecinctSizeFunction,
        getLevelSizeFunction,
        getTileSizeFunction) {
        
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
        
        if (precinctSize > levelSize) {
            // Precinct is larger than image thus anyway tile has a single
            // precinct
            
            return true;
        }
        
        var tileSize = getTileSizeFunction(resolutionLevel);
        
        var isPrecinctPartitionFitsToTilePartition =
            precinctSize % tileSize === 0 ||
            tileSize % precinctSize === 0;
        
        return isPrecinctPartitionFitsToTilePartition;
    }
    
    function getPrecinctsInCodestreamPartPerLevelPerComponent(
        tileIndex, codestreamPartParams) {
        
        if (codestreamPartParams === undefined) {
            return null;
        }
        
        var components = codestreamStructure.getNumComponents();
        var perComponentResult = new Array(components);
        var numResolutionLevelsToCut =
            codestreamPartParams.numResolutionLevelsToCut || 0;
        
        var tileLeftInLevel = codestreamStructure.getTileLeft(
            tileIndex, numResolutionLevelsToCut);
        var tileTopInLevel = codestreamStructure.getTileTop(
            tileIndex, numResolutionLevelsToCut);
        
        var minXInTile =
            codestreamPartParams.minX - tileLeftInLevel;
        var minYInTile =
            codestreamPartParams.minY - tileTopInLevel;
        var maxXInTile =
            codestreamPartParams.maxXExclusive - tileLeftInLevel;
        var maxYInTile =
            codestreamPartParams.maxYExclusive - tileTopInLevel;
        
        var codestreamPartLevelWidth = codestreamStructure.getLevelWidth(
            numResolutionLevelsToCut);
        var codestreamPartLevelHeight = codestreamStructure.getLevelHeight(
            numResolutionLevelsToCut);

        for (var component = 0; component < components; ++component) {
            var componentStructure = componentStructures[component];
            var levels = componentStructure.getNumResolutionLevels();
            var levelsInCodestreamPart = levels - numResolutionLevelsToCut;
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
                
                var precinctWidth =
                    componentStructure.getPrecinctWidth(level) * componentScaleX;
                var precinctHeight =
                    componentStructure.getPrecinctHeight(level) * componentScaleY;
                
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
    
    function tryAdvancePrecinctIterator(
        setableIterator,
        numResolutionLevelsToCut,
        precinctsInCodestreamPartPerLevelPerComponent,
        isIteratePrecinctsNotInCodestreamPart) {
        
        var needAdvanceNextMember = true;
        var precinctsRangeHash = isIteratePrecinctsNotInCodestreamPart ?
            null: precinctsInCodestreamPartPerLevelPerComponent;
        
        var needResetPrecinctToMinimalInCodestreamPart = false;
        
        for (var i = 2; i >= 0; --i) {
            var newValue = advanceProgressionOrderMember(
                setableIterator, i, numResolutionLevelsToCut, precinctsRangeHash);
            
            needAdvanceNextMember = newValue === 0;
            if (!needAdvanceNextMember) {
                break;
            }
            
            if (progressionOrder[i] === 'P' &&
                !isIteratePrecinctsNotInCodestreamPart) {
                
                needResetPrecinctToMinimalInCodestreamPart = true;
            }
        }
        
        if (needAdvanceNextMember) {
            // If we are here, the last precinct has been reached
            return false;
        }
        
        var componentStructure = componentStructures[setableIterator.component];
        var precinctsX = componentStructure.getNumPrecinctsX(
            setableIterator.resolutionLevel);
        setableIterator.precinctIndexInComponentResolution =
            setableIterator.precinctX + setableIterator.precinctY * precinctsX;
        
        if (precinctsInCodestreamPartPerLevelPerComponent === null) {
            setableIterator.isInCodestreamPart = true;
            return true;
        }
        
        var rangePerLevel =
            precinctsInCodestreamPartPerLevelPerComponent[setableIterator.component];
        var precinctsRange = rangePerLevel[setableIterator.resolutionLevel];
        
        if (needResetPrecinctToMinimalInCodestreamPart) {
            setableIterator.precinctX = precinctsRange.minPrecinctX;
                setableIterator.precinctY = precinctsRange.minPrecinctY;
            setableIterator.precinctIndexInComponentResolution =
                setableIterator.precinctX + setableIterator.precinctY * precinctsX;
        }
        
        setableIterator.isInCodestreamPart =
            setableIterator.precinctX >= precinctsRange.minPrecinctX &&
            setableIterator.precinctY >= precinctsRange.minPrecinctY &&
            setableIterator.precinctX < precinctsRange.maxPrecinctXExclusive &&
            setableIterator.precinctY < precinctsRange.maxPrecinctYExclusive;
        
        return true;
    }
    
    function advanceProgressionOrderMember(
        precinctPosition,
        memberIndex,
        numResolutionLevelsToCut,
        precinctsRange) {
        
        var componentStructure = componentStructures[precinctPosition.component];
        
        switch (progressionOrder[memberIndex]) {
            case 'R':
                var numResolutionLevels =
                    componentStructure.getNumResolutionLevels() -
                    numResolutionLevelsToCut;
                
                ++precinctPosition.resolutionLevel;
                precinctPosition.resolutionLevel %= numResolutionLevels;
                return precinctPosition.resolutionLevel;
            
            case 'C':
                ++precinctPosition.component;
                precinctPosition.component %= codestreamStructure.getNumComponents();
                return precinctPosition.component;
            
            case 'P':
                var minX, minY, maxX, maxY;
                if (precinctsRange !== null) {
                    var precinctsRangePerLevel = precinctsRange[
                        precinctPosition.component];
                    var precinctsRangeInLevelComponent = precinctsRangePerLevel[
                        precinctPosition.resolutionLevel];
                    
                    minX = precinctsRangeInLevelComponent.minPrecinctX;
                    minY = precinctsRangeInLevelComponent.minPrecinctY;
                    maxX = precinctsRangeInLevelComponent.maxPrecinctXExclusive;
                    maxY = precinctsRangeInLevelComponent.maxPrecinctYExclusive;
                } else {
                    minX = 0;
                    minY = 0;
                    maxX = componentStructure.getNumPrecinctsX(
                        precinctPosition.resolutionLevel);
                    maxY = componentStructure.getNumPrecinctsY(
                        precinctPosition.resolutionLevel);
                }
                
                precinctPosition.precinctX -= (minX - 1);
                precinctPosition.precinctX %= (maxX - minX);
                precinctPosition.precinctX += minX;
                
                if (precinctPosition.precinctX != minX) {
                    return precinctPosition.precinctX - minX;
                }
                
                precinctPosition.precinctY -= (minY - 1);
                precinctPosition.precinctY %= (maxY - minY);
                precinctPosition.precinctY += minY;

                return precinctPosition.precinctY - minY;
            
            case 'L' :
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Advancing L is not supported in JPIP');
            
            default:
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected letter in progression order: ' +
                    progressionOrder[memberIndex]);
        }
    }
    
    defaultComponentStructure = jpipFactory.createComponentStructure(
        sizeParams.defaultComponentParams, this);
        
    componentStructures = new Array(codestreamStructure.getNumComponents());
    for (var i = 0; i < codestreamStructure.getNumComponents(); ++i) {
        componentStructures[i] = jpipFactory.createComponentStructure(
            sizeParams.paramsPerComponent[i], this);
    }
    
    preprocessParams();
    
    validateTargetProgressionOrder(progressionOrder);

    return this;
};
},{"j2k-jpip-globals.js":15}],15:[function(require,module,exports){
'use strict';

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
    IMAGE_DONE : 1,
    WINDOW_DONE : 2,
    WINDOW_CHANGE : 3,
    BYTE_LIMIT : 4,
    QUALITY_LIMIT : 5,
    SESSION_LIMIT : 6,
    RESPONSE_LIMIT : 7,
    NON_SPECIFIED : 8
};

module.exports.j2kExceptions = {
    UnsupportedFeatureException: function(feature, standardSection) {
        this.description = feature + ' (specified in section ' + standardSection + ' of part 1: Core Coding System standard) is not supported yet';
        
        this.toString = function() {
            return 'J2k UnsupportedFeatureException: ' + this.description;
        };
        
        return this;
    },

    ParseException: function(description) {
        this.description = description;
        
        this.toString = function() {
            return 'J2k ParseException: ' + this.description;
        };
        
        return this;
    },

    IllegalDataException: function(illegalDataDescription, standardSection) {
        this.description = illegalDataDescription + ' (see section ' + standardSection + ' of part 9: Interactivity tools, APIs and Protocols)';
        
        this.toString = function() {
            return 'J2k IllegalDataException: ' + this.description;
        };
        
        return this;
    }
};

module.exports.jpipExceptions = {
    UnsupportedFeatureException: function(feature, standardSection) {
        this.description = feature + ' (specified in section ' + standardSection + ' of part 9: Interactivity tools, APIs and Protocols) is not supported yet';
        
        this.toString = function() {
            return 'Jpip UnsupportedFeatureException: ' + this.description;
        };
        
        return this;
    },

    ParseException: function(description) {
        this.description = description;
        
        this.toString = function() {
            return 'Jpip ParseException: ' + this.description;
        };
        
        return this;
    },

    IllegalDataException: function(illegalDataDescription, standardSection) {
        this.description = illegalDataDescription + ' (see section ' + standardSection + ' of part 9: Interactivity tools, APIs and Protocols)';
        
        this.toString = function() {
            return 'Jpip IllegalDataException: ' + this.description;
        };
        
        return this;
    },
    
    IllegalOperationException: function(description) {
        this.description = description;
        
        this.toString = function() {
            return 'Jpip IllegalOperationException: ' + this.description;
        };
        
        return this;
    },
    
    ArgumentException: function(argumentName, argumentValue, description) {
        this.description = 'Argument ' + argumentName + ' has invalid value ' +
            argumentValue + (description !== undefined ? ' :' + description : '');
        
        this.toString = function() {
            return 'Jpip ArgumentException: ' + this.description;
        };
        
        return this;
    },

    WrongStreamException: function(requestedOperation, isJPT) {
        var correctStream = 'JPP (JPIP Precinct)';
        var wrongStream = 'JPT (JPIP Tile-part)';
        
        if (isJPT) {
            var swap = correctStream;
            correctStream = wrongStream;
            wrongStream = swap;
        }
        
        this.description =    'Stream type is ' + wrongStream + ', but ' + requestedOperation +
                            ' is allowed only in ' + correctStream + ' stream';
                            
        this.toString = function() {
            return 'Jpip WrongStreamException: ' + this.description;
        };
        
        return this;
    },

    InternalErrorException: function(description) {
        this.description = description;
        
        this.toString = function() {
            return 'Jpip InternalErrorException: ' + this.description;
        };
        
        return this;
    }
};

module.exports.j2kExceptions.UnsupportedFeatureException.Name =
    'j2kExceptions.UnsupportedFeatureException';
module.exports.j2kExceptions.ParseException.Name =
    'j2kExceptions.ParseException';
module.exports.j2kExceptions.IllegalDataException.Name =
    'j2kExceptions.IllegalDataException';

module.exports.jpipExceptions.UnsupportedFeatureException.Name =
    'jpipExceptions.UnsupportedFeatureException';
module.exports.jpipExceptions.ParseException.Name =
    'jpipExceptions.ParseException';
module.exports.jpipExceptions.IllegalDataException.Name =
    'jpipExceptions.IllegalDataException';
module.exports.jpipExceptions.IllegalOperationException.Name =
    'jpipExceptions.IllegalOperationException';
module.exports.jpipExceptions.ArgumentException.Name =
    'jpipExceptions.ArgumentException';
module.exports.jpipExceptions.WrongStreamException.Name =
    'jpipExceptions.WrongStreamException';
module.exports.jpipExceptions.InternalErrorException.Name =
    'jpipExceptions.InternalErrorException';
},{}],16:[function(require,module,exports){
'use strict';

var simpleAjaxHelper                 = require('simple-ajax-helper.js'                 ).simpleAjaxHelper;
var mutualExclusiveTransactionHelper = require('mutual-exclusive-transaction-helper.js').mutualExclusiveTransactionHelper;

var jpipCodingPassesNumberParser = require('jpip-coding-passes-number-parser.js').jpipCodingPassesNumberParser;
var jpipMessageHeaderParser      = require('jpip-message-header-parser.js'      ).jpipMessageHeaderParser;

var JpipChannel                               = require('jpip-channel.js'                                   ).JpipChannel;
var JpipCodestreamReconstructor               = require('jpip-codestream-reconstructor.js'                  ).JpipCodestreamReconstructor;
var JpipCodestreamSizesCalculator             = require('jpip-codestream-sizes-calculator.js'               ).JpipCodestreamSizesCalculator;
var JpipCodestreamStructure                   = require('jpip-codestream-structure.js'                      ).JpipCodestreamStructure;
var JpipComponentStructure                    = require('jpip-component-structure.js'                       ).JpipComponentStructure;
var CompositeArray                            = require('composite-array.js'                                ).CompositeArray;
var JpipDatabinParts                          = require('jpip-databin-parts.js'                             ).JpipDatabinParts;
var JpipDatabinsSaver                         = require('jpip-databins-saver.js'                            ).JpipDatabinsSaver;
var JpipFetchHandle                           = require('jpip-fetch-handle.js'                              ).JpipFetchHandle;
var JpipHeaderModifier                        = require('jpip-header-modifier.js'                           ).JpipHeaderModifier;
var JpipImageDataContext                      = require('jpip-image-data-context.js'                        ).JpipImageDataContext;
var JpipMarkersParser                         = require('jpip-markers-parser.js'                            ).JpipMarkersParser;
var JpipObjectPoolByDatabin                   = require('jpip-object-pool-by-databin.js'                    ).JpipObjectPoolByDatabin;
var JpipOffsetsCalculator                     = require('jpip-offsets-calculator.js'                        ).JpipOffsetsCalculator;
var JpipPacketsDataCollector                  = require('jpip-packets-data-collector.js'                    ).JpipPacketsDataCollector;
var JpipRequestDatabinsListener               = require('jpip-request-databins-listener.js'                 ).JpipRequestDatabinsListener;
var JpipRequest                               = require('jpip-request.js'                                   ).JpipRequest;
var JpipSessionHelper                         = require('jpip-session-helper.js'                            ).JpipSessionHelper;
var JpipSession                               = require('jpip-session.js'                                   ).JpipSession;
var JpipReconnectableRequester                = require('jpip-reconnectable-requester.js'                   ).JpipReconnectableRequester;
var JpipStructureParser                       = require('jpip-structure-parser.js'                          ).JpipStructureParser;
var JpipTileStructure                         = require('jpip-tile-structure.js'                            ).JpipTileStructure;
var JpipBitstreamReader                       = require('jpip-bitstream-reader.js'                          ).JpipBitstreamReader;
var JpipTagTree                               = require('jpip-tag-tree.js'                                  ).JpipTagTree;
var JpipCodeblockLengthParser                 = require('jpip-codeblock-length-parser.js'                   ).JpipCodeblockLengthParser;
var JpipSubbandLengthInPacketHeaderCalculator = require('jpip-subband-length-in-packet-header-calculator.js').JpipSubbandLengthInPacketHeaderCalculator;
var JpipPacketLengthCalculator                = require('jpip-packet-length-calculator.js'                  ).JpipPacketLengthCalculator;
var JpipQualityLayersCache                    = require('jpip-quality-layers-cache.js'                      ).JpipQualityLayersCache;

var jpipRuntimeFactory = {
    createChannel: function createChannel(
        maxRequestsWaitingForResponseInChannel, sessionHelper) {
        
        return new JpipChannel(
            maxRequestsWaitingForResponseInChannel,
            sessionHelper,
            jpipRuntimeFactory);
    },
    
    createCodestreamReconstructor: function(
        codestreamStructure, databinsSaver, headerModifier, qualityLayersCache) {
        
        return new JpipCodestreamReconstructor(
            codestreamStructure,
            databinsSaver,
            headerModifier,
            qualityLayersCache);
    },
    
    createCodestreamSizesCalculator: function(params) {
        return new JpipCodestreamSizesCalculator(params);
    },
    
    createCodestreamStructure: function(structureParser, progressionOrder) {
        return new JpipCodestreamStructure(
            structureParser, jpipRuntimeFactory, progressionOrder);
    },
    
    createComponentStructure: function(params, tileStructure) {
        return new JpipComponentStructure(params, tileStructure);
    },
    
    createCompositeArray: function(offset) {
        return new CompositeArray(offset);
    },
    
    createDatabinParts: function(classId, inClassId) {
        return new JpipDatabinParts(classId, inClassId, jpipRuntimeFactory);
    },
    
    createDatabinsSaver: function(isJpipTilepartStream) {
        return new JpipDatabinsSaver(isJpipTilepartStream, jpipRuntimeFactory);
    },
    
    createFetchHandle: function(
        requester, imageDataContext, dedicatedChannelHandle) {
            
        return new JpipFetchHandle(
            requester, imageDataContext, dedicatedChannelHandle);
    },
    
    createHeaderModifier: function(
        codestreamStructure, offsetsCalculator, progressionOrder) {
        
        return new JpipHeaderModifier(
            codestreamStructure, offsetsCalculator, progressionOrder);
    },
    
    createImageDataContext: function(
        jpipObjects, codestreamPartParams, progressiveness) {
        
        return new JpipImageDataContext(
            jpipObjects, codestreamPartParams, progressiveness);
    },
    
    createMarkersParser: function(mainHeaderDatabin) {
        return new JpipMarkersParser(
            mainHeaderDatabin, jpipMessageHeaderParser, jpipRuntimeFactory);
    },
    
    createObjectPoolByDatabin: function() {
        return new JpipObjectPoolByDatabin();
    },
    
    createOffsetsCalculator: function(mainHeaderDatabin, markersParser) {
        return new JpipOffsetsCalculator(mainHeaderDatabin, markersParser);
    },
    
    createPacketsDataCollector: function(
        codestreamStructure, databinsSaver, qualityLayersCache) {
        
        return new JpipPacketsDataCollector(
            codestreamStructure,
            databinsSaver,
            qualityLayersCache,
            jpipRuntimeFactory);
    },
    
    createRequestDatabinsListener: function createRequestDatabinsListener(
        codestreamPartParams,
        qualityLayerReachedCallback,
        codestreamStructure,
        databinsSaver,
        qualityLayersCache) {
        
        return new JpipRequestDatabinsListener(
            codestreamPartParams,
            qualityLayerReachedCallback,
            codestreamStructure,
            databinsSaver,
            qualityLayersCache,
            jpipRuntimeFactory);
    },
    
    createRequest: function createRequest(
        sessionHelper, channel, requestUrl, callback, failureCallback) {
        
        return new JpipRequest(
            sessionHelper,
            jpipMessageHeaderParser,
            channel,
            requestUrl,
            callback,
            failureCallback);
    },
    
    createSessionHelper: function createSessionHelper(
        dataRequestUrl,
        knownTargetId,
        codestreamStructure,
        databinsSaver) {
        
        return new JpipSessionHelper(
            dataRequestUrl,
            knownTargetId,
            codestreamStructure,
            databinsSaver,
            simpleAjaxHelper);
    },
    
    createSession: function createSession(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        targetId,
        codestreamStructure,
        databinsSaver) {
        
        return new JpipSession(
            maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel,
            targetId,
            codestreamStructure,
            databinsSaver,
            setInterval,
            clearInterval,
            jpipRuntimeFactory);
    },
    
    createReconnectableRequester: function(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaver) {
        
        return new JpipReconnectableRequester(
            maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel,
            codestreamStructure,
            databinsSaver,
            jpipRuntimeFactory);
    },
    
    createStructureParser: function(databinsSaver, markersParser, offsetsCalculator) {
        return new JpipStructureParser(
            databinsSaver, markersParser, jpipMessageHeaderParser, offsetsCalculator);
    },
    
    createTileStructure: function(
        sizeParams, codestreamStructure, progressionOrder) {
        return new JpipTileStructure(
            sizeParams, codestreamStructure, jpipRuntimeFactory, progressionOrder);
    },
    
    createBitstreamReader: function createBitstreamReader(databin) {
        return new JpipBitstreamReader(
            databin, mutualExclusiveTransactionHelper);
    },
    
    createTagTree: function createTagTree(bitstreamReader, width, height) {
        return new JpipTagTree(
            bitstreamReader, width, height, mutualExclusiveTransactionHelper);
    },
    
    createCodeblockLengthParser: function createCodeblockLengthParser(
        bitstreamReader, transactionHelper) {
        
        return new JpipCodeblockLengthParser(
            bitstreamReader, mutualExclusiveTransactionHelper);
    },
    
    createSubbandLengthInPacketHeaderCalculator :
        function createSubbandLengthInPacketHeaderCalculator(
            bitstreamReader, numCodeblocksXInSubband, numCodeblocksYInSubband) {
        
        return new JpipSubbandLengthInPacketHeaderCalculator(
            bitstreamReader,
            numCodeblocksXInSubband,
            numCodeblocksYInSubband,
            jpipCodingPassesNumberParser,
            mutualExclusiveTransactionHelper,
            jpipRuntimeFactory);
    },
    
    createPacketLengthCalculator: function createPacketLengthCalculator(
        tileStructure,
        componentStructure,
        databin,
        startOffsetInDatabin,
        precinct) {
        
        return new JpipPacketLengthCalculator(
            tileStructure,
            componentStructure,
            databin,
            startOffsetInDatabin,
            precinct,
            jpipRuntimeFactory);
    },
    
    createQualityLayersCache: function createQualityLayersCache(
        codestreamStructure) {
        
        return new JpipQualityLayersCache(
            codestreamStructure,
            jpipRuntimeFactory);
    }
};

module.exports.jpipRuntimeFactory = jpipRuntimeFactory;
},{"composite-array.js":7,"jpip-bitstream-reader.js":27,"jpip-channel.js":21,"jpip-codeblock-length-parser.js":28,"jpip-codestream-reconstructor.js":36,"jpip-codestream-sizes-calculator.js":2,"jpip-codestream-structure.js":12,"jpip-coding-passes-number-parser.js":29,"jpip-component-structure.js":13,"jpip-databin-parts.js":8,"jpip-databins-saver.js":9,"jpip-fetch-handle.js":3,"jpip-header-modifier.js":37,"jpip-image-data-context.js":4,"jpip-markers-parser.js":18,"jpip-message-header-parser.js":22,"jpip-object-pool-by-databin.js":10,"jpip-offsets-calculator.js":19,"jpip-packet-length-calculator.js":30,"jpip-packets-data-collector.js":38,"jpip-quality-layers-cache.js":31,"jpip-reconnectable-requester.js":23,"jpip-request-databins-listener.js":11,"jpip-request.js":24,"jpip-session-helper.js":25,"jpip-session.js":26,"jpip-structure-parser.js":20,"jpip-subband-length-in-packet-header-calculator.js":32,"jpip-tag-tree.js":33,"jpip-tile-structure.js":14,"mutual-exclusive-transaction-helper.js":34,"simple-ajax-helper.js":17}],17:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.simpleAjaxHelper = {
    request: function request(
        url,
        callbackForAsynchronousRequest,
        failureCallbackForAsynchronousRequest,
        progressiveRequestQuantBytes) {
        
        var ajaxResponse = new XMLHttpRequest();
        var isSynchronous = callbackForAsynchronousRequest === undefined;

        var isFinishedRequest = false;
        var bytesRecievedOnLastQuant = 0;
        
        function internalAjaxCallback(e) {
            if (isFinishedRequest) {
                return;
            }
            
            if (ajaxResponse.readyState !== 4) {
                if (progressiveRequestQuantBytes === undefined ||
                    ajaxResponse.response === null ||
                    ajaxResponse.readyState < 3) {
                    
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
                
                if (ajaxResponse.status !== 200 ||
                    ajaxResponse.response === null) {
                    
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'synchronous ajax call was not finished synchronously');
        }
        
        return ajaxResponse;
    }
};
},{"j2k-jpip-globals.js":15}],18:[function(require,module,exports){
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
},{"j2k-jpip-globals.js":15}],19:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipOffsetsCalculator = function JpipOffsetsCalculator(
    mainHeaderDatabin, markersParser) {
    
    var supportedMarkers = [
        jGlobals.j2kMarkers.ImageAndTileSize,
        jGlobals.j2kMarkers.CodingStyleDefault,
        jGlobals.j2kMarkers.QuantizationDefault,
        jGlobals.j2kMarkers.Comment
        ];
    
    this.getCodingStyleOffset = getCodingStyleOffset;
    
    this.getCodingStyleBaseParams = getCodingStyleBaseParams;
    
    this.getImageAndTileSizeOffset = function getImageAndTileSizeOffset() {
        // A.5.1 (Image and tile size marker segment)
        
        var sizMarkerOffset = markersParser.getMandatoryMarkerOffsetInDatabin(
            mainHeaderDatabin,
            jGlobals.j2kMarkers.ImageAndTileSize,
            'Image and Tile Size (SIZ)',
            'A.5.1');
        
        return sizMarkerOffset;
    };
    
    this.getRangesOfBestResolutionLevelsData =
        function getRangesWithDataOfResolutionLevelsClosure(
            databin, numResolutionLevels) {
        
        markersParser.checkSupportedMarkers(
            databin, supportedMarkers, /*isMarkersSupported=*/true);
        
        var numDecompositionLevelsOffset = null;
        
        var databinCodingStyleDefaultBaseParams = getCodingStyleBaseParams(
            databin, /*isMandatory=*/false);
        
        var databinOrMainHeaderCodingStyleBaseParams = databinCodingStyleDefaultBaseParams;
        if (databinCodingStyleDefaultBaseParams === null) {
            databinOrMainHeaderCodingStyleBaseParams = getCodingStyleBaseParams(
                mainHeaderDatabin, /*isMandatory=*/true);
        } else {
            numDecompositionLevelsOffset =
                databinCodingStyleDefaultBaseParams.numDecompositionLevelsOffset;
        }
        
        var codingStyleNumResolutionLevels = 
            databinOrMainHeaderCodingStyleBaseParams.numResolutionLevels;
            
        if (codingStyleNumResolutionLevels <= numResolutionLevels) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'numResolutionLevels (' + numResolutionLevels + ') <= COD.' +
                'numResolutionLevels (' + codingStyleNumResolutionLevels + ')');
        }

        var ranges = [];

        addRangeOfBestResolutionLevelsInCodingStyle(
            ranges, databinCodingStyleDefaultBaseParams, numResolutionLevels);

        addRangeOfBestResolutionLevelsInQuantization(
            ranges,
            databin,
            databinOrMainHeaderCodingStyleBaseParams,
            numResolutionLevels);

        var result = {
            ranges: ranges,
            numDecompositionLevelsOffset: numDecompositionLevelsOffset
            };
        
        return result;
    };
    
    function getCodingStyleBaseParams(
        databin, isMandatory) {
        
        var codingStyleDefaultOffset = getCodingStyleOffset(
            databin, isMandatory);
        
        if (codingStyleDefaultOffset === null) {
            return null;
        }
        
        var numBytes = 8;
        var bytesOffset = codingStyleDefaultOffset + jGlobals.j2kOffsets.MARKER_SIZE;
        var bytes = getBytes(databin, numBytes, bytesOffset);

        var codingStyleFlagsForAllComponentsOffset = 2; // Scod
        var codingStyleFlagsForAllComponents =
            bytes[codingStyleFlagsForAllComponentsOffset];
            
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
    
    function addRangeOfBestResolutionLevelsInCodingStyle(
        ranges, codingStyleDefaultBaseParams, numResolutionLevels) {
        
        if (codingStyleDefaultBaseParams === null ||
            codingStyleDefaultBaseParams.isDefaultPrecinctSize) {
            
            return;
        }
        
        var levelsNotInRange =
            codingStyleDefaultBaseParams.numResolutionLevels - numResolutionLevels;
        
        var firstOffsetInRange =
            codingStyleDefaultBaseParams.precinctSizesOffset + levelsNotInRange;
        
        var markerLengthOffset = 
            codingStyleDefaultBaseParams.codingStyleDefaultOffset + jGlobals.j2kOffsets.MARKER_SIZE;
        
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
                throw new jGlobals.j2kExceptions.IllegalDataException(
                    'Quantization style of ' + quantizationStyle, 'A.6.4');
        }
        
        return bytesPerSubband;
    }
    
    function addRangeOfBestResolutionLevelsInQuantization(
        ranges,
        databin,
        codingStyleDefaultBaseParams,
        numResolutionLevels) {
        
        var qcdMarkerOffset = markersParser.getMarkerOffsetInDatabin(
            databin, jGlobals.j2kMarkers.QuantizationDefault);
        
        if (qcdMarkerOffset === null) {
            return;
        }
        
        var bytesPerSubband = getQuantizationDataBytesPerSubband(
            databin, qcdMarkerOffset);
            
        if (bytesPerSubband === 0) {
            return;
        }
        
        var levelsNotInRange =
            codingStyleDefaultBaseParams.numResolutionLevels - numResolutionLevels;
        
        var subbandsNotInRange = 1 + 3 * (levelsNotInRange - 1);
        var subbandsInRange = 3 * numResolutionLevels;
        
        var firstOffsetInRange =
            qcdMarkerOffset + 5 + subbandsNotInRange * bytesPerSubband;
        
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
        var cocOffset = markersParser.getMarkerOffsetInDatabin(
            databin, jGlobals.j2kMarkers.CodingStyleComponent);
        
        if (cocOffset !== null) {
            // A.6.2
            throw new jGlobals.j2kExceptions.UnsupportedFeatureException(
                'COC Marker (Coding Style Component)', 'A.6.2');
        }
    }
    
    function getCodingStyleOffset(databin, isMandatory) {
        expectNoCodingStyleComponent(databin);

        var offset;
        if (isMandatory) {
            offset = markersParser.getMandatoryMarkerOffsetInDatabin(
                databin,
                jGlobals.j2kMarkers.CodingStyleDefault,
                'COD (Coding style Default)',
                'A.6.1');
        } else {
            offset = markersParser.getMarkerOffsetInDatabin(
                databin, jGlobals.j2kMarkers.CodingStyleDefault);
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Header data-bin has not yet recieved ' + numBytes +
                ' bytes starting from offset ' + databinStartOffset);
        }
        
        return bytes;
    }
};
},{"j2k-jpip-globals.js":15}],20:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipStructureParser = function JpipStructureParser(
    databinsSaver, markersParser, messageHeaderParser, offsetsCalculator) {
    
    this.parseCodestreamStructure = function parseCodestreamStructure() {
        // A.5.1 (Image and Tile Size)
        
        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();
        
        var sizMarkerOffset = offsetsCalculator.getImageAndTileSizeOffset();
        
        var bytes = getBytes(
            mainHeaderDatabin,
            /*numBytes=*/38,
            sizMarkerOffset + jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE);
        
        var referenceGridSizeOffset =
            jGlobals.j2kOffsets.REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER -
            (jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE);
        var numComponentsOffset =
            jGlobals.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER -
            (jGlobals.j2kOffsets.MARKER_SIZE + jGlobals.j2kOffsets.LENGTH_FIELD_SIZE);
            
        var referenceGridSizeX = messageHeaderParser.getInt32(
            bytes, referenceGridSizeOffset); // XSiz
        var referenceGridSizeY = messageHeaderParser.getInt32(
            bytes, referenceGridSizeOffset + 4); // YSiz
            
        var imageOffsetX = messageHeaderParser.getInt32(bytes, 10); // XOSiz
        var imageOffsetY = messageHeaderParser.getInt32(bytes, 14); // YOSiz
        var tileSizeX = messageHeaderParser.getInt32(bytes, 18); // XTSiz
        var tileSizeY = messageHeaderParser.getInt32(bytes, 22); // YTSiz
        var firstTileOffsetX = messageHeaderParser.getInt32(bytes, 26); // XTOSiz
        var firstTileOffsetY = messageHeaderParser.getInt32(bytes, 30); // YTOSiz
        
        var numComponents = messageHeaderParser.getInt16(bytes, numComponentsOffset); // CSiz
        
        var componentsDataOffset =
            sizMarkerOffset + jGlobals.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER + 2;
        var componentsDataLength = numComponents * 3;
        
        var componentsDataBytes = getBytes(
            mainHeaderDatabin, componentsDataLength, componentsDataOffset);
        
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
    
    this.parseDefaultTileParams = function() {
        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var tileParams = parseCodingStyle(mainHeaderDatabin, /*isMandatory=*/true);
        return tileParams;
    };
    
    this.parseOverridenTileParams = function(tileIndex) {
        var tileHeaderDatabin = databinsSaver.getTileHeaderDatabin(tileIndex);
        
        // A.4.2 (Start Of Tile-part)
        
        var tileParams = parseCodingStyle(tileHeaderDatabin, /*isMandatory=*/false);
        return tileParams;
    };

    function parseCodingStyle(databin, isMandatory) {
        // A.5.1 (Image and Tile Size)

        var baseParams = offsetsCalculator.getCodingStyleBaseParams(
            databin, isMandatory);
        
        if (baseParams === null) {
            return null;
        }

        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

        var sizMarkerOffset = offsetsCalculator.getImageAndTileSizeOffset();
        
        var numComponentsOffset =
            sizMarkerOffset + jGlobals.j2kOffsets.NUM_COMPONENTS_OFFSET_AFTER_SIZ_MARKER;

        var numComponentsBytes = getBytes(
            mainHeaderDatabin,
            /*numBytes=*/2,
            /*startOffset=*/numComponentsOffset);
        var numComponents = messageHeaderParser.getInt16(numComponentsBytes, 0);
        
        var packedPacketHeadersMarkerInTileHeader =
            markersParser.getMarkerOffsetInDatabin(
                databin, jGlobals.j2kMarkers.PackedPacketHeadersInTileHeader);
        
        var packedPacketHeadersMarkerInMainHeader =
            markersParser.getMarkerOffsetInDatabin(
                mainHeaderDatabin, jGlobals.j2kMarkers.PackedPacketHeadersInMainHeader);
        
        var isPacketHeadersNearData =
            packedPacketHeadersMarkerInTileHeader === null &&
            packedPacketHeadersMarkerInMainHeader === null;
        
        var codingStyleMoreDataOffset = baseParams.codingStyleDefaultOffset + 6;
        var codingStyleMoreDataBytes = getBytes(
            databin,
            /*numBytes=*/6,
            /*startOffset=*/codingStyleMoreDataOffset);
        var numQualityLayers = messageHeaderParser.getInt16(
            codingStyleMoreDataBytes, 0);

        var codeblockWidth = parseCodeblockSize(
            codingStyleMoreDataBytes, 4);
        var codeblockHeight = parseCodeblockSize(
            codingStyleMoreDataBytes, 5);
        
        var precinctWidths = new Array(baseParams.numResolutionLevels);
        var precinctHeights = new Array(baseParams.numResolutionLevels);
        
        var precinctSizesBytes = null;
        if (!baseParams.isDefaultPrecinctSize) {
            var precinctSizesBytesNeeded = baseParams.numResolutionLevels;
            
            precinctSizesBytes = getBytes(
                databin,
                precinctSizesBytesNeeded,
                baseParams.precinctSizesOffset);
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
            throw new jGlobals.j2kExceptions.IllegalDataException(
                'Illegal codeblock width exponent ' + codeblockSizeExponent,
                'A.6.1, Table A.18');
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Header data-bin has not yet recieved ' + numBytes +
                ' bytes starting from offset ' + databinStartOffset);
        }
        
        return bytes;
    }
};
},{"j2k-jpip-globals.js":15}],21:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipChannel = function JpipChannel(
    maxRequestsWaitingForResponseInChannel, sessionHelper, jpipFactory) {
    
    var self = this;
    var channelId = null;
    var requestId = 0;
    var requestsWaitingForChannelCreation = [];
    var requestsWaitingForResponse = [];
    var isDedicatedForMovableRequest = false;
    
    this.requestData = function requestData(
        codestreamPartParams,
        callback,
        failureCallback,
        numQualityLayers) {
        
        if (!isDedicatedForMovableRequest) {
            // No need to check if there are too many concurrent requests
            // if channel was dedicated for movable request. The reason is
            // that any request in dedicated channel cancel the previous one.
            
            var allWaitingRequests = getAllQueuedRequestCount();
            
            if (allWaitingRequests >= maxRequestsWaitingForResponseInChannel) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Channel has too many requests not responded yet');
            }
        }

        var url = createRequestUrl(codestreamPartParams, numQualityLayers);
        var request = jpipFactory.createRequest(
            sessionHelper,
            self,
            url,
            callback,
            failureCallback);
        
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Minimal requests should be used for first request or keep ' +
                'alive message. Keep alive requires an already initialized ' +
                'channel, and first request requires to not have any ' +
                'previous request');
        }
        
        var url = createMinimalRequestUrl();
        var request = jpipFactory.createRequest(
            sessionHelper, self, url, callback);
        
        requestsWaitingForResponse.push(request);
        request.startRequest();
    };
    
    this.getIsDedicatedForMovableRequest =
        function getIsDedicatedForMovableRequest() {
        
        return isDedicatedForMovableRequest;
    };
    
    this.dedicateForMovableRequest = function dedicateForMovableRequest() {
        if (isDedicatedForMovableRequest) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Channel already dedicated for movable request');
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
    
    this.getRequestsWaitingForResponse =
        function getRequestsWaitingForResponse() {
        
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'channel.requestsWaitingForResponse inconsistency');
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
        var allWaitingRequests =
            requestsWaitingForResponse.length +
            requestsWaitingForChannelCreation.length;
        
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
            var isStopPrevious =
                isDedicatedForMovableRequest &&
                allowStopPreviousRequestsInChannel;
            
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
        
        var frameWidth = codestreamStructure.getLevelWidth(
            codestreamPartParams.numResolutionLevelsToCut);
        var frameHeight = codestreamStructure.getLevelHeight(
            codestreamPartParams.numResolutionLevelsToCut);
        
        var regionWidth =
            codestreamPartParams.maxXExclusive - codestreamPartParams.minX;
        var regionHeight =
            codestreamPartParams.maxYExclusive - codestreamPartParams.minY;
        
        requestUrl +=
            '&fsiz=' + frameWidth + ',' + frameHeight + ',closest' +
            '&rsiz=' + regionWidth + ',' + regionHeight +
            '&roff=' + codestreamPartParams.minX + ',' + codestreamPartParams.minY;
            
        if (numQualityLayers !== 'max') {
            requestUrl += '&layers=' + numQualityLayers;
        }
        
        return requestUrl;
    }
};
},{"j2k-jpip-globals.js":15}],22:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

var jpipMessageHeaderParser = {
        
    LSB_MASK: 0x1,
    BIT_4_MASK: 0x10,
    BITS_56_MASK: 0x60,
    MSB_MASK: 0x80,

    LSB_7_MASK: 0x7F,

    // A.2.1
    parseNumberInVbas: function parseNumberInVbasClosure(
        message, startOffset, bitsToTakeInFirstByte) {
        
        var self = jpipMessageHeaderParser;
        var currentOffset = startOffset;
        
        var result;
        if (bitsToTakeInFirstByte) {
            var maskFirstByte = (1 << bitsToTakeInFirstByte) - 1;
            result = message[currentOffset] & maskFirstByte;
        }
        else {
            result = message[currentOffset] & self.LSB_7_MASK;
        }
        
        while ( !!(message[currentOffset] & self.MSB_MASK) ) {
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
    parseMessageHeader: function parseMessageHeaderClosure(
        message, startOffset, previousMessageHeader) {
        
        var self = jpipMessageHeaderParser;
        
        // A.2.1
        
        // First Vbas: Bin-ID
        
        var classAndCsnPrecense = (message[startOffset] & self.BITS_56_MASK) >>> 5;
        
        if (classAndCsnPrecense === 0) {
            throw new jGlobals.jpipExceptions.ParseException('Failed parsing message header ' +
                '(A.2.1): prohibited existance class and csn bits 00');
        }
        
        var hasClassVbas = !!(classAndCsnPrecense & 0x2);
        var hasCodeStreamIndexVbas = classAndCsnPrecense === 3;
        
        var isLastByteInDatabin = !!(message[startOffset] & self.BIT_4_MASK);
        
        // A.2.3
        var parsedInClassId = self.parseNumberInVbas(
            message, startOffset, /*bitsToTakeInFirstByte=*/4);
        var inClassId = parsedInClassId.number;
        var currentOffset = parsedInClassId.endOffset;
        
        // Second optional Vbas: Class ID
        
        var classId = 0;
        if (hasClassVbas) {
            var parsedClassId = self.parseNumberInVbas(message, currentOffset);
            classId = parsedClassId.number;
            currentOffset = parsedClassId.endOffset;
        }
        else if (previousMessageHeader) {
            classId = previousMessageHeader.classId;
        }
        
        // Third optional Vbas: Code Stream Index (Csn)
        
        var codestreamIndex = 0;
        if (hasCodeStreamIndexVbas) {
            var parsedCsn = self.parseNumberInVbas(message, currentOffset);
            codestreamIndex = parsedCsn.number;
            currentOffset = parsedCsn.endOffset;
        }
        else if (previousMessageHeader) {
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

module.exports.jpipMessageHeaderParser = jpipMessageHeaderParser;
},{"j2k-jpip-globals.js":15}],23:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipReconnectableRequester = function JpipReconnectableRequester(
    maxChannelsInSession,
    maxRequestsWaitingForResponseInChannel, 
    codestreamStructure,
    databinsSaver,
    jpipFactory,
    // NOTE: Move parameter to beginning and expose in CodestreamClient
    maxJpipCacheSizeConfig) {
    
    var MB = 1048576;
    var maxJpipCacheSize = maxJpipCacheSizeConfig || (10 * MB);
    
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
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Image was already opened');
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
    
    this.dedicateChannelForMovableRequest =
        function dedicateChannelForMovableRequest() {

        checkReady();
        
        var dedicatedChannelHandle = { internalDedicatedChannel: null };
        dedicatedChannels.push(dedicatedChannelHandle);
        createInternalDedicatedChannel(dedicatedChannelHandle);
        
        return dedicatedChannelHandle;
    };
    
    this.requestData = function requestData(
        codestreamPartParams,
        callback,
        failureCallback,
        numQualityLayers,
        dedicatedChannelHandleToMove) {

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
        var moveDedicatedChannel = dedicatedChannelHandleToMove !== undefined;
        
        if (moveDedicatedChannel) {
            channel = dedicatedChannelHandleToMove.internalDedicatedChannel;
        } else {
            channel = activeSession.tryGetChannel();
            
            if (channel === null) {
                nonDedicatedRequestsWaitingForSend.push(request);
                return request;
            } else if (channel.getIsDedicatedForMovableRequest()) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Expected non-movable channel');
            }
        }
        
        if (channel.getIsDedicatedForMovableRequest() !== moveDedicatedChannel) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'getIsDedicatedForMovableRequest inconsistency');
        }

        request.internalRequest = channel.requestData(
            codestreamPartParams,
            callback,
            failureCallback,
            numQualityLayers);

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
            throw new jGlobals.jpipExceptions.IllegalOperationException(
                'Previous session still not established');
        }
        
        if (sessionWaitingForDisconnect !== null) {
            if (statusCallback !== null) {
                statusCallback({
                    isReady: true,
                    exception: //jpipExceptions.InvalidOperationException(
                        'Previous session that should be closed still alive.' +
                        'Maybe old requestContexts have not beed closed. ' +
                        'Reconnect will not be done' //);
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
        
        sessionWaitingForReady = jpipFactory.createSession(
            maxChannelsInSession,
            maxRequestsWaitingForResponseInChannel,
            targetId,
            codestreamStructure,
            databinsSaver);
            
        sessionWaitingForReady.setStatusCallback(waitingForReadyCallback);
        
        sessionWaitingForReady.open(url);
    }
    
    function createInternalDedicatedChannel(dedicatedChannelHandle) {
        var channel = activeSession.tryGetChannel(
            /*dedicateForMovableRequest=*/true);
        
        if (channel === null) {
            throw new jGlobals.jpipExceptions.InvalidOperationException(
                'Too many concurrent requests. Limit the use of dedicated ' +
                '(movable) requests, enlarge maxChannelsInSession or wait ' +
                'for requests to finish and avoid create new ones');
        }
        
        if (!channel.getIsDedicatedForMovableRequest()) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'getIsDedicatedForMovableRequest inconsistency');
        }

        dedicatedChannelHandle.internalDedicatedChannel = channel;
    }
    
    function waitingForReadyCallback(status) {
        if (sessionWaitingForReady === null ||
            status.isReady !== sessionWaitingForReady.getIsReady()) {
            
            throw new jGlobals.jpipExceptions.InternalErrorException('Unexpected ' +
                'statusCallback when not registered to session or ' +
                'inconsistent isReady');
        }
        
        if (status.isReady) {
            if (sessionWaitingForDisconnect !== null) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'sessionWaitingForDisconnect should be null');
            }
            
            sessionWaitingForDisconnect = activeSession;
            activeSession = sessionWaitingForReady;
            sessionWaitingForReady = null;
            
            if (sessionWaitingForDisconnect !== null) {
                sessionWaitingForDisconnect.setStatusCallback(null);
                if (!tryDisconnectWaitingSession()) {
                    sessionWaitingForDisconnect.setRequestEndedCallback(
                        tryDisconnectWaitingSession);
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
            throw new jGlobals.jpipExceptions.InternalErrorException('This operation ' +
                'is forbidden when session is not ready');
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Expected non-movable channel as channelFreed');
        }
        
        do {
            if (nonDedicatedRequestsWaitingForSend.length === 0) {
                request = null;
                break;
            }
            
            request = nonDedicatedRequestsWaitingForSend.shift();
            if (request.internalRequest !== null) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Request was ' +
                    'already sent but still in queue');
            }
        } while (request.isEnded);
        
        if (request !== null) {
            request.internalRequest = channelFreed.requestData(
                request.codestreamPartParams,
                request.callback,
                request.failureCallback,
                request.numQualityLayers);
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
},{"j2k-jpip-globals.js":15}],24:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipRequest = function JpipRequest(
    sessionHelper,
    messageHeaderParser,
    channel,
    requestUrl,
    callback,
    failureCallback) {
    
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'startRequest called twice');
        } else if (endedByUser) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'request was already stopped');
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Unexpected call to getLastRequestId on inactive request');
        }
        
        return lastRequestId;
    };
    
    this.callCallbackAfterConcurrentRequestsFinished =
        function callCallbackAfterConcurrentRequestsFinished() {
        
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
            throw new jGlobals.jpipExceptions.InternalErrorException('AJAX ' +
                'callback called although response is not done yet ' +
                'and chunked encoding is not enabled');
        }
                
        var createdChannel = sessionHelper.getCreatedChannelId(
            ajaxResponse);
        
        if (createdChannel !== null) {
            if (channel.getChannelId() !== null) {
                sessionHelper.onException(
                    new jGlobals.jpipExceptions.IllegalDataException(
                        'Channel created although was not requested', 'D.2.3'));
            } else {
                channel.setChannelId(createdChannel);
            }
        } else if (channel.getChannelId() === null) {
            sessionHelper.onException(
                new jGlobals.jpipExceptions.IllegalDataException(
                    'Cannot extract cid from cnew response', 'D.2.3'));
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
        
        var url = requestUrl +
            '&len=' + responseLength +
            '&qid=' + lastRequestId;
        
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
        
        sessionHelper.sendAjax(
            url,
            internalSuccessCallback,
            internalFailureCallback);
    }
    
    function parseEndOfResponse(ajaxResponse, offset) {
        var endResponseResult = RESPONSE_ENDED_ABORTED;
        var bytes = new Uint8Array(ajaxResponse.response);
        
        if (offset > bytes.length - 2 ||
            bytes[offset] !== 0) {
            
            throw new jGlobals.jpipExceptions.IllegalDataException('Could not find ' +
                'End Of Response (EOR) code at the end of response', 'D.3');
        }
        
        switch (bytes[offset + 1]) {
            case jGlobals.jpipEndOfResponseReasons.IMAGE_DONE:
            case jGlobals.jpipEndOfResponseReasons.WINDOW_DONE:
            case jGlobals.jpipEndOfResponseReasons.QUALITY_LIMIT:
                endResponseResult = RESPONSE_ENDED_SUCCESS;
                break;
            
            case jGlobals.jpipEndOfResponseReasons.WINDOW_CHANGE:
                if (!endedByUser) {
                    throw new jGlobals.jpipExceptions.IllegalOperationException(
                        'Server response was terminated due to newer ' +
                        'request issued on same channel. That may be an ' +
                        'internal webjpip.js error - Check that movable ' +
                        'requests are well maintained');
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
                sessionHelper.onException(
                    new jGlobals.jpipExceptions.IllegalOperationException(
                        'Server resources associated with the session is ' +
                        'limitted, no further requests should be issued to ' +
                        'this session'));
                break;
            
            case jGlobals.jpipEndOfResponseReasons.NON_SPECIFIED:
                sessionHelper.onException(new jGlobals.jpipExceptions.IllegalOperationException(
                    'Server error terminated response with no reason specified'));
                break;
                    
            default:
                sessionHelper.onException(
                    new jGlobals.jpipExceptions.IllegalDataException(
                        'Server responded with illegal End Of Response ' +
                        '(EOR) code: ' + bytes[offset + 1]));
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
                
                var header = messageHeaderParser.parseMessageHeader(
                    bytes, offset, previousHeader);
                
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
},{"j2k-jpip-globals.js":15}],25:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipSessionHelper = function JpipSessionHelper(
    dataRequestUrl,
    knownTargetId,
    codestreamStructure,
    databinsSaver,
    ajaxHelper) {
    
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
    
    this.setRequestEndedCallback = function setRequestEndedCallback(
        requestEndedCallback_) {
        
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
                throw new jGlobals.jpipExceptions.IllegalDataException(
                    'Server returned unmatched target ID');
            }
        }
        
        if (firstChannel === null) {
            firstChannel = channel;
        }
        
        var channelFreed = channel.getIsDedicatedForMovableRequest() ?
            null : channel;
        
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
    
    this.waitForConcurrentRequestsToEnd =
        function waitForConcurrentRequestsToEnd(request) {
        
        var concurrentRequests = [];
        
        for (var i = 0; i < channels.length; ++i) {
            var requests = channels[i].getRequestsWaitingForResponse();
            var numRequests = requests.length;
            if (numRequests === 0) {
                continue;
            }
            
            var lastRequestId = requests[0].getLastRequestId();
            for (var j = 1; j < requests.length; ++j) {
                lastRequestId = Math.max(
                    lastRequestId, requests[j].getLastRequestId());
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

    this.checkConcurrentRequestsFinished =
        function checkConcurrentRequestsFinished() {
        
        for (var i = waitingForConcurrentRequests.length - 1; i >= 0; --i) {
            var isAllConcurrentRequestsFinished = false;
            var concurrentRequests =
                waitingForConcurrentRequests[i].concurrentRequests;
            
            for (var j = concurrentRequests.length - 1; j >= 0; --j) {
                var waiting = concurrentRequests[j];
                
                if (waiting.channel.isAllOldRequestsEnded(waiting.requestId)) {
                    concurrentRequests[j] = concurrentRequests[
                        concurrentRequests.length - 1];
                    concurrentRequests.length -= 1;
                }
            }
            
            if (concurrentRequests.length > 0) {
                continue;
            }
            
            var request = waitingForConcurrentRequests[i].request;
            var callback = request.callback;
            
            waitingForConcurrentRequests[i] = waitingForConcurrentRequests[
                waitingForConcurrentRequests.length - 1];
            waitingForConcurrentRequests.length -= 1;
            
            request.callCallbackAfterConcurrentRequestsFinished();
        }
    };
    
    this.sendAjax = function sendAjax(
        url,
        callback,
        failureCallback) {
        
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
        var exception = new jGlobals.jpipExceptions.InternalErrorException(
            'Bad jpip server response (status = ' + ajaxResponse.status + ')');
            
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
},{"j2k-jpip-globals.js":15}],26:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipSession = function JpipSession(
    maxChannelsInSession,
    maxRequestsWaitingForResponseInChannel,
    knownTargetId,
    codestreamStructure,
    databinsSaver,
    setIntervalFunction,
    clearIntervalFunction,
    jpipFactory) {

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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'session.open() should be called only once');
        }
        
        var queryParamsDelimiter = baseUrl.indexOf('?') < 0 ? '?' : '&';
        channelManagementUrl = baseUrl + queryParamsDelimiter + 'type=' + 
            (databinsSaver.getIsJpipTilePartStream() ? 'jpt-stream' : 'jpp-stream');
        dataRequestUrl = channelManagementUrl + '&stream=0';
        
        sessionHelper = jpipFactory.createSessionHelper(
            dataRequestUrl, knownTargetId, codestreamStructure, databinsSaver);
        
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
    
    this.setRequestEndedCallback = function setRequestEndedCallback(
        requestEndedCallback_) {
        
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
        var searchOnlyChannelWithEmptyQueue =
            canCreateNewChannel || dedicateForMovableRequest;
        
        var maxRequestsInChannel = searchOnlyChannelWithEmptyQueue ?
            0 : maxRequestsWaitingForResponseInChannel - 1;

        var channel = getChannelWithMinimalWaitingRequests(
            maxRequestsInChannel,
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Cannot close session before open');
        }

        if (isCloseCalled) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Cannot close session twice');
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
        var channel = jpipFactory.createChannel(
            maxRequestsWaitingForResponseInChannel, sessionHelper);
        
        sessionHelper.channelCreated(channel);
        
        if (!isDedicatedForMovableRequest) {
            nonDedicatedChannels.push(channel);
        }

        return channel;
    }
    
    function getChannelWithMinimalWaitingRequests(
        maxRequestsInChannel, isExtractFromNonDedicatedList) {
        
        var channel = null;
        var index;
        var minimalWaitingRequests = maxRequestsInChannel + 1;
        
        for (var i = 0; i < nonDedicatedChannels.length; ++i) {
            var waitingRequests =
                nonDedicatedChannels[i].getAllQueuedRequestCount();
            
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
        
        nonDedicatedChannels[index] =
            nonDedicatedChannels[nonDedicatedChannels.length - 1];
        nonDedicatedChannels.length -= 1;
        
        return channel;
    }
    
    function sessionReadyCallback() {
        var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();
        if (!mainHeaderDatabin.isAllDatabinLoaded()) {
            throw new jGlobals.jpipExceptions.IllegalDataException(
                'Main header was not loaded on session creation');
        }
        
        var arbitraryChannel = sessionHelper.getFirstChannel();
        var arbitraryChannelId = arbitraryChannel.getChannelId();
        closeSessionUrl = channelManagementUrl +
            '&cclose=*' +
            '&cid=' + arbitraryChannelId;
            
        if (isCloseCalled) {
            closeInternal();
            return;
        }
        
        keepAliveIntervalHandle = setIntervalFunction(
            keepAliveHandler, KEEP_ALIVE_INTERVAL);
        
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
            throw new jGlobals.jpipExceptions.InternalErrorException('Cannot perform ' +
                'this operation when the session is not ready');
        }
    }
};
},{"j2k-jpip-globals.js":15}],27:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipBitstreamReader = (function JpipBitstreamReaderClosure() {
    var zeroBitsUntilFirstOneBitMap = createZeroBitsUntilFirstOneBitMap();

    function JpipBitstreamReader(databin, transactionHelper) {
        var initialState = {
            nextOffsetToParse: 0,
            validBitsInCurrentByte: 0,
            originalByteWithoutShift: null,
            currentByte: null,
            isSkipNextByte: false
            };

        var streamState = transactionHelper.createTransactionalObject(initialState);
        var activeTransaction = null;
        
        Object.defineProperty(this, 'activeTransaction', {
            get: function getActiveTransaction() {
                if (activeTransaction === null ||
                    !activeTransaction.isActive) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'No active transaction in bitstreamReader');
                }
                
                return activeTransaction;
            }
        });
        
        Object.defineProperty(this, 'bitsCounter', {
            get: function getBitsCounter() {
                var state = streamState.getValue(activeTransaction);
                
                tryValidateCurrentByte(databin, state);
                if (state.isSkipNextByte) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Unexpected state of bitstreamReader: ' +
                        'When 0xFF encountered, tryValidateCurrentByte ' +
                        'should skip the whole byte  after ' +
                        'shiftRemainingBitsInByte and clear isSkipNextByte. ' +
                        'However the flag is still set');
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
                
                if (state.validBitsInCurrentByte % 8 !== 0 ||
                    state.originalByteWithoutShift === 0xFF) {
                    
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Cannot calculate databin offset when bitstreamReader ' +
                        ' is in the middle of the byte');
                }
                
                return state.nextOffsetToParse - state.validBitsInCurrentByte / 8;
            },
            
            set: function setDatabinOffset(offsetInBytes) {
                var state = streamState.getValue(activeTransaction);
                state.validBitsInCurrentByte = 0;
                state.isSkipNextByte = false;
                state.originalByteWithoutShift = null;
                state.nextOffsetToParse = offsetInBytes;
            }
        });
        
        this.startNewTransaction = function startNewTransaction() {
            if (activeTransaction !== null && activeTransaction.isActive) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot start new transaction in bitstreamReader ' +
                    'while another transaction is active');
            }
            
            activeTransaction = transactionHelper.createTransaction();
        };
        
        this.shiftRemainingBitsInByte = function shiftRemainingBitsInByte() {
            var state = streamState.getValue(activeTransaction);

            state.isSkipNextByte = state.originalByteWithoutShift === 0xFF;
            state.validBitsInCurrentByte = Math.floor(
                state.validBitsInCurrentByte / 8);
        };
        
        this.shiftBit = function shiftBit() {
            var state = streamState.getValue(activeTransaction);
            if (!tryValidateCurrentByte(databin, state)) {
                return null;
            }
            
            var onesCount = countAndShiftBits(
                databin,
                state,
                /*isUntilZeroBit=*/true,
                /*maxBitsToShift=*/1);
            
            return onesCount;
        };
        
        this.countZerosAndShiftUntilFirstOneBit =
            function countZerosAndShiftUntilFirstOneBit(maxBitsToShift) {
                var state = streamState.getValue(activeTransaction);
                var result = countAndShiftBits(
                    databin, state, /*isUntilZeroBit=*/false, maxBitsToShift);
                return result;
        };
        
        this.countOnesAndShiftUntilFirstZeroBit =
            function countOnesAndShiftUntilFirstZeroBit(maxBitsToShift) {
                var state = streamState.getValue(activeTransaction);
                var result = countAndShiftBits(
                    databin, state, /*isUntilZeroBit=*/true, maxBitsToShift);
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
                
                var bitsToTake = Math.min(
                    state.validBitsInCurrentByte, remainingBits);
                
                var addToResult = state.currentByte >> (8 - bitsToTake);
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
            var bitsCountIncludingTerminatingBit = Math.min(
                zeroBitsUntilFirstOneBitMap[byteValue],
                state.validBitsInCurrentByte + 1);
            
            var bitsCountNotIncludingTerminatingBit =
                bitsCountIncludingTerminatingBit - 1;
            
            if (remainingBits !== undefined) {
                if (bitsCountIncludingTerminatingBit > remainingBits) {
                    removeBitsFromByte(state, remainingBits);
                    countedBits += remainingBits;
                    break;
                }
                
                remainingBits -= bitsCountNotIncludingTerminatingBit;
            }
            
            countedBits += bitsCountNotIncludingTerminatingBit;
            
            foundTerminatingBit =
                bitsCountIncludingTerminatingBit <= state.validBitsInCurrentByte;

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
            state.currentByte = (state.currentByte << bitsCount) & 0xFF;
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
                throw new jGlobals.j2kExceptions.IllegalDataException(
                    'Expected 0 bit after 0xFF byte', 'B.10.1');
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
})();
},{"j2k-jpip-globals.js":15}],28:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipCodeblockLengthParser = (function JpipCodeblockLengthParserClosure() {
    // B.10.7.
    
    var exactLog2Table = createExactLog2Table();
    
    function JpipCodeblockLengthParser(bitstreamReader, transactionHelper) {
        var lBlock = transactionHelper.createTransactionalObject({
            lBlockValue: 3
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
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Unexpected value of coding passes ' + codingPasses +
                    '. Expected positive integer <= 164');
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
})();
},{"j2k-jpip-globals.js":15}],29:[function(require,module,exports){
'use strict';

module.exports.JpipCodingPassesNumberParser = (function JpipCodingPassesNumberParserClosure() {
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
        result[ 9] = 37 + 0x00; // b000000
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
})();
},{}],30:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipPacketLengthCalculator = function JpipPacketLengthCalculator(
    tileStructure,
    componentStructure,
    databin,
    startOffsetInDatabin,
    precinct,
    jpipFactory) {
    
    var calculatedLengths = [];
    
    var bitstreamReader = jpipFactory.createBitstreamReader(databin);
    
    var numCodeblocksX =
        componentStructure.getNumCodeblocksXInPrecinct(precinct);
    var numCodeblocksY =
        componentStructure.getNumCodeblocksYInPrecinct(precinct);
        
    var numQualityLayersInTile = tileStructure.getNumQualityLayers();
    var isPacketHeaderNearData = tileStructure.getIsPacketHeaderNearData();
    var isStartOfPacketMarkerAllowed = tileStructure.getIsStartOfPacketMarkerAllowed();
    var isEndPacketHeaderMarkerAllowed =
        tileStructure.getIsEndPacketHeaderMarkerAllowed();
    
    var subbandParsers = initSubbandParsers();
    
    this.calculateEndOffsetOfLastFullPacket =
        function calculateFullPacketsAvailableOffsets(maxNumQualityLayers) {
        
        var isAllowedFullQuality =
            maxNumQualityLayers === undefined ||
            maxNumQualityLayers >= numQualityLayersInTile;
        
        var numQualityLayersToParse;
        if (!isAllowedFullQuality) {
            numQualityLayersToParse = maxNumQualityLayers;
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
    
    this.getPacketOffsetsByCodeblockIndex = function getPacketOffsetsByCodeblockIndex(
        qualityLayer) {
        
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
            
            var nextPacket = tryCalculateNextPacketLength(
                calculatedLengths.length);
            
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
            headerStartOffset =
                last.headerStartOffset +
                last.headerLength +
                last.overallBodyLengthBytes;
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
        
        var bodyLength = actualCalculatePacketLengthAfterZeroLengthBit(
            qualityLayer);
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
                codeblockBodyLengthByIndex =
                    subbandBodyLength.codeblockBodyLengthByIndex;
            } else {
                codeblockBodyLengthByIndex = codeblockBodyLengthByIndex.concat(
                    subbandBodyLength.codeblockBodyLengthByIndex);
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
    
    function getFullQualityLayersEndOffset(maxNumQualityLayers) {
        var numParsedQualityLayer = Math.min(
            maxNumQualityLayers, calculatedLengths.length);
        
        if (numParsedQualityLayer === 0) {
            return {
                endOffset: startOffsetInDatabin,
                numQualityLayers: 0
                };
        }
        
        var lastPacket = calculatedLengths[numParsedQualityLayer - 1];
        var endOffset =
            lastPacket.headerStartOffset +
            lastPacket.headerLength +
            lastPacket.overallBodyLengthBytes;
        
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
                if (i === 1) { // LH
                    numCodeblocksXInSubband = Math.ceil(numCodeblocksX / 2);
                } else { // HL or HH
                    numCodeblocksXInSubband = Math.floor(numCodeblocksX / 2);
                }
                
                // Treat the edge case of single redundant pixels row
                // (In other cases, numCodeblocksY is full duplication of 2.
                // See JpipComponentStructure implementation).
                if (i === 0) { // HL
                    numCodeblocksYInSubband = Math.ceil(numCodeblocksY / 2);
                } else { // LH or HH
                    numCodeblocksYInSubband = Math.floor(numCodeblocksY / 2);
                }
            }
            
            if (numCodeblocksXInSubband === 0 || numCodeblocksYInSubband === 0) {
                continue;
            }
            
            result.push(jpipFactory.createSubbandLengthInPacketHeaderCalculator(
                bitstreamReader,
                numCodeblocksXInSubband,
                numCodeblocksYInSubband));
        }
        
        return result;
    }
    
    function isMarkerHere(markerSecondByte) {
        var possibleMarker = new Array(2);
        var bytesCopied = databin.copyBytes(
            possibleMarker,
            /*resultStartOffset=*/0,
            {
                databinStartOffset: bitstreamReader.databinOffset,
                maxLengthToCopy: 2,
                forceCopyAllRange: false
            });
        
        switch (bytesCopied) {
            case 2:
                var isMarker =
                    possibleMarker[0] === 0xFF &&
                    possibleMarker[1] === markerSecondByte;
                
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
            throw new jGlobals.jpipExceptions.UnsupportedFeatureException(
                'PPM or PPT', 'A.7.4 and A.7.5');
        }
    }
};
},{"j2k-jpip-globals.js":15}],31:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipQualityLayersCache = function JpipQualityLayersCache(
    codestreamStructure, jpipFactory) {
    
    var CACHE_KEY = 'packetLengthCalculator';
    
    this.getPacketOffsetsByCodeblockIndex =
        function getPacketOffsetsByCodeblockIndex(
            precinctDatabin, qualityLayer, precinctPosition) {
        
        var packetLengthCalculator = getPacketParser(
            precinctDatabin, precinctPosition);
            
        var result = packetLengthCalculator.getPacketOffsetsByCodeblockIndex(
            qualityLayer);
        
        return result;
    };
    
    this.getQualityLayerOffset = function getQualityLayerOffset(
        precinctDatabin, maxNumQualityLayers, precinctPosition) {
        
        var loadedRanges = precinctDatabin.getExistingRanges();
        var endOffsetLoaded;
        
        var packetLengthCalculator = getPacketParser(
            precinctDatabin, precinctPosition);
            
        if (loadedRanges.length < 1 || loadedRanges[0].start > 0) {
            endOffsetLoaded = 0;
            maxNumQualityLayers = 0;
        } else {
            endOffsetLoaded = loadedRanges[0].start + loadedRanges[0].length;
        }
        
        var layersInPrecinct =
            packetLengthCalculator.calculateEndOffsetOfLastFullPacket(
                maxNumQualityLayers);
        
        while (endOffsetLoaded < layersInPrecinct.endOffset) {
            var reducedLayersToSearch = layersInPrecinct.numQualityLayers - 1;
            layersInPrecinct = packetLengthCalculator
                .calculateEndOffsetOfLastFullPacket(reducedLayersToSearch);
        }
        
        return layersInPrecinct;
    };

    function getPacketParser(precinctDatabin, precinctPosition) {
        var packetLengthCalculatorContainer =
            precinctDatabin.getCachedData(CACHE_KEY);
        
        if (packetLengthCalculatorContainer.calculator !== undefined) {
            return packetLengthCalculatorContainer.calculator;
        }
        
        if (precinctPosition === undefined) {
            throw new jGlobals.jpipExceptions.InternalErrorException('precinctPosition ' +
                'should be given on the first time of using QualityLayersCache ' +
                'on this precinct');
        }
        
        var tileStructure = codestreamStructure.getTileStructure(
            precinctPosition.tileIndex);
        
        var componentStructure = tileStructure.getComponentStructure(
            precinctPosition.component);
            
        packetLengthCalculatorContainer.calculator =
            jpipFactory.createPacketLengthCalculator(
                tileStructure,
                componentStructure,
                precinctDatabin,
                /*startOffsetInDatabin=*/0,
                precinctPosition);
        
        return packetLengthCalculatorContainer.calculator;
    }
};
},{"j2k-jpip-globals.js":15}],32:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipSubbandLengthInPacketHeaderCalculator =
    function JpipSubbandLengthInPacketHeaderCalculator(
        bitstreamReader,
        numCodeblocksX,
        numCodeblocksY,
        codingPassesNumberParser,
        transactionHelper,
        jpipFactory) {
    
    var codeblockLengthParsers = null;
    var isCodeblocksIncluded = null;
    var parsedQualityLayers = transactionHelper.createTransactionalObject(
        0, /*isValueType=*/true);
        
    var inclusionTree = jpipFactory.createTagTree(
        bitstreamReader, numCodeblocksX, numCodeblocksY);
    
    var zeroBitPlanesTree = jpipFactory.createTagTree(
        bitstreamReader, numCodeblocksX, numCodeblocksY);
    
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
                
                accumulatedBodyLengthBytes +=
                    codeblockBodyLength.codeblockBodyLengthBytes;
            }
        }
        
        parsedQualityLayers.setValue(
            bitstreamReader.activeTransaction, qualityLayer + 1);
        
        return {
            codeblockBodyLengthByIndex: codeblockLengthByIndex,
            overallBodyLengthBytes: accumulatedBodyLengthBytes
            };
    };
    
    function ensureQualityLayerNotParsedYet(qualityLayer) {
        var parsedQualityLayersValue = parsedQualityLayers.getValue(
            bitstreamReader.activeTransaction);
        
        if (parsedQualityLayersValue >= qualityLayer + 1) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Unexpected quality layer to parse');
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
                codeblockLengthParsers[x][y] =
                    jpipFactory.createCodeblockLengthParser(
                        bitstreamReader, transactionHelper);
                    
                isCodeblocksIncluded[x][y] = transactionHelper
                    .createTransactionalObject({ isIncluded: false });
            }
        }
    }
    
    function getNextCodeblockLength(x, y, qualityLayer) {
        var isCodeblockAlreadyIncluded = isCodeblocksIncluded[x][y].getValue(
            bitstreamReader.activeTransaction);
        
        var isCodeblockIncludedNow;
        if (isCodeblockAlreadyIncluded.isIncluded) {
            isCodeblockIncludedNow = bitstreamReader.shiftBit();
        } else {
            isCodeblockIncludedNow = inclusionTree.isSmallerThanOrEqualsTo(
                x, y, qualityLayer);
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
},{"j2k-jpip-globals.js":15}],33:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipTagTree = function JpipTagTree(
    bitstreamReader, width, height, transactionHelper) {
    
    var isAlreadyReadBitsTransactionalObject =
        transactionHelper.createTransactionalObject(false, /*isValueType=*/true);
    var levels;
    
    createLevelsArray();
        
    this.setMinimalValueIfNotReadBits = function setMinimalValueIfNotReadBits(
        minimalValue) {
    
        if (isAlreadyReadBits()) {
            return;
        }
        
        var transactionalObject = levels[0].content[0];
        var node = transactionalObject.getValue(
            bitstreamReader.activeTransaction);
        
        node.minimalPossibleValue = minimalValue;
    };
    
    this.isSmallerThanOrEqualsTo = function isSmallerThanOrEqualsTo(
        x, y, value) {
        
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
                var addToValue = bitstreamReader.countZerosAndShiftUntilFirstOneBit(
                    maxBitsToShift);
                    
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
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Wrong parsing in TagTree.isSmallerThanOrEqualsTo: ' +
                'not sure if value is smaller than asked');
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
                var addToValue =
                    bitstreamReader.countZerosAndShiftUntilFirstOneBit();
                
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
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Iterated too deep in tag tree');
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
            
            var result = transactionalObject.getValue(
                bitstreamReader.activeTransaction);
            
            if (prevIteratedNode !== null &&
                prevIteratedNode.minimalPossibleValue > result.minimalPossibleValue) {
                
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
            
        var transactionalObject = transactionHelper.createTransactionalObject(
            objectValue);
        
        levels[level].content[indexInLevel] = transactionalObject;
        return transactionalObject;
    }
    
    function isAlreadyReadBits() {
        var isAlreadyReadBitsTransactionalValue =
            isAlreadyReadBitsTransactionalObject.getValue(
                bitstreamReader.activeTransaction);
        
        return isAlreadyReadBitsTransactionalValue;
    }
    
    function setAlreadyReadBits() {
        isAlreadyReadBitsTransactionalObject.setValue(
            bitstreamReader.activeTransaction, true);
    }
};
},{"j2k-jpip-globals.js":15}],34:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.mutualExclusiveTransactionHelper = {
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
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot terminate an already terminated transaction');
            }
            state = isSuccessful_ ? 2 : 3;
        }
            
        return transaction;
    },
    
    createTransactionalObject: function commitTransaction(
        initialValue, isValueType) {
        
        var value = null;
        var prevValue = initialValue;
        var lastAccessedTransaction = {
            isActive: false,
            isAborted: true
            };
        var clone = isValueType ? cloneValueType : cloneByJSON;
        
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
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot use terminated transaction to access objects');
            }
            
            if (activeTransaction !== lastAccessedTransaction &&
                lastAccessedTransaction.isActive) {
                
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot simultanously access transactional object ' +
                    'from two active transactions');
            }
        }
        
        function cloneValueType(value) {
            return value;
        }
        
        function cloneByJSON(value) {
            var newValue = JSON.parse(JSON.stringify(value));
            return newValue;
        }
        
        return transactionalObject;
    }
};
},{"j2k-jpip-globals.js":15}],35:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipImageImplementation = require('jpip-image-implementation.js').JpipImageImplementation;
module.exports.JpipCodestreamClient = require('jpip-codestream-client.js').JpipCodestreamClient;
module.exports.JpipCodestreamSizesCalculator = require('jpip-codestream-sizes-calculator.js').JpipCodestreamSizesCalculator;
module.exports.PdfjsJpxDecoder = require('pdfjs-jpx-decoder.js').PdfjsJpxDecoder;
module.exports.j2kExceptions = jGlobals.j2kExceptions;
module.exports.jpipExceptions = jGlobals.jpipExceptions;
module.exports.Internals = {
    jpipRuntimeFactory: require('jpip-runtime-factory.js'),
    jGlobals: jGlobals
};
},{"j2k-jpip-globals.js":15,"jpip-codestream-client.js":1,"jpip-codestream-sizes-calculator.js":2,"jpip-image-implementation.js":5,"jpip-runtime-factory.js":16,"pdfjs-jpx-decoder.js":6}],36:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipCodestreamReconstructor = function JpipCodestreamReconstructor(
    codestreamStructure,
    databinsSaver,
    headerModifier,
    qualityLayersCache) {
    
    this.reconstructCodestream = function reconstructCodestream(
        minNumQualityLayers) {
        
        var result = [];
        var currentOffset = createMainHeader(result);
        
        if (currentOffset === null) {
            return null;
        }
        
        var numTiles =
            codestreamStructure.getNumTilesX() * codestreamStructure.getNumTilesY();
        
        var codestreamPart;
        
        if (minNumQualityLayers === undefined) {
            minNumQualityLayers = 'max';
        }
        
        for (var tileId = 0; tileId < numTiles; ++tileId) {
            var tileBytesCopied = createTile(
                result,
                currentOffset,
                tileId,
                tileId,
                codestreamPart,
                minNumQualityLayers);
            
            currentOffset += tileBytesCopied;
            
            if (tileBytesCopied === null) {
                return null;
            }
        }
        
        var markerBytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;
        result.length = currentOffset;

        return result;
    };
    
    this.createCodestreamForRegion = function createCodestreamForRegion(
        params, minNumQualityLayers, isOnlyHeadersWithoutBitstream) {
        
        var codestream = [];
        var currentOffset = createMainHeader(
            codestream, params.numResolutionLevelsToCut);
        
        if (currentOffset === null) {
            return null;
        }
        
        var tileIdToWrite = 0;
        var tileIterator = codestreamStructure.getTilesIterator(params);
        
        var firstTileId = tileIterator.tileIndex;
        
        var firstTileLeft = codestreamStructure.getTileLeft(
            firstTileId, params.numResolutionLevelsToCut);
        var firstTileTop = codestreamStructure.getTileTop(
            firstTileId, params.numResolutionLevelsToCut);
            
        var offsetX = params.minX - firstTileLeft;
        var offsetY = params.minY - firstTileTop;
        
        do {
            var tileIdOriginal = tileIterator.tileIndex;
            
            var tileBytesCopied = createTile(
                codestream,
                currentOffset,
                tileIdToWrite++,
                tileIdOriginal,
                params,
                minNumQualityLayers,
                isOnlyHeadersWithoutBitstream);
                
            currentOffset += tileBytesCopied;
        
            if (tileBytesCopied === null) {
                return null;
            }
        } while (tileIterator.tryAdvance());
        
        var markerBytesCopied = copyBytes(
            codestream, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;

        headerModifier.modifyImageSize(codestream, params);
        
        if (codestream === null) {
            return null;
        }
        
        codestream.length = currentOffset;

        return {
            codestream: codestream,
            offsetX: offsetX,
            offsetY: offsetY
            };
    };
    
    this.createCodestreamForTile = function createCodestreamForTile(
        tileId,
        numResolutionLevelsToCut,
        minNumQualityLayers,
        maxNumQualityLayers) {
        
        var result = [];
        var currentOffset = createMainHeader(result, numResolutionLevelsToCut);
        
        if (currentOffset === null) {
            return null;
        }
        
        // TODO: Delete this function and test createCodestreamForRegion instead
        
        var codestreamPartParams = {
            numResolutionLevelsToCut: numResolutionLevelsToCut,
            maxNumQualityLayers: maxNumQualityLayers
            };
        
        var tileBytesCopied = createTile(
            result,
            currentOffset,
            /*tileIdToWrite=*/0,
            /*tileIdOriginal=*/tileId,
            codestreamPartParams,
            minNumQualityLayers);
            
        currentOffset += tileBytesCopied;
        
        if (tileBytesCopied === null) {
            return null;
        }

        var markerBytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.EndOfCodestream);
        currentOffset += markerBytesCopied;
        
        var numTilesX = codestreamStructure.getNumTilesX();
        var tileX = tileId % numTilesX;
        var tileY = Math.floor(tileId / numTilesX);
        
        headerModifier.modifyImageSize(result, {
            numResolutionLevelsToCut: numResolutionLevelsToCut,
            minTileX: tileX,
            maxTileXExclusive: tileX + 1,
            minTileY: tileY,
            maxTileYExclusive: tileY + 1
            });
        
        result.length = currentOffset;
        
        return result;
    };
    
    function createMainHeader(result, numResolutionLevelsToCut) {
        if (databinsSaver.getIsJpipTilePartStream()) {
            throw new jGlobals.jpipExceptions.UnsupportedFeatureException(
                'reconstruction of codestream from JPT (Jpip Tile-part) stream', 'A.3.4');
        }
        
        var mainHeader = databinsSaver.getMainHeaderDatabin();
        var currentOffset = mainHeader.copyBytes(result, /*startOffset=*/0, {
            forceCopyAllRange: true
            });
        
        if (currentOffset === null) {
            return null;
        }
        
        var bytesAdded = headerModifier.modifyMainOrTileHeader(
            result, mainHeader, /*offset=*/0, numResolutionLevelsToCut);
        
        currentOffset += bytesAdded;
        
        bytesAdded = addMamazavComment(result, currentOffset);
        currentOffset += bytesAdded;
        
        return currentOffset;
    }
    
    function createTile(
        result,
        currentOffset,
        tileIdToWrite,
        tileIdOriginal,
        codestreamPartParams,
        minNumQualityLayers,
        isOnlyHeadersWithoutBitstream) {
        
        var tileStructure = codestreamStructure.getTileStructure(
            tileIdOriginal);

        var startTileOffset = currentOffset;
        var tileHeaderDatabin = databinsSaver.getTileHeaderDatabin(
            tileIdOriginal);
        
        var numResolutionLevelsToCut;
        if (codestreamPartParams !== undefined) {
            numResolutionLevelsToCut = codestreamPartParams.numResolutionLevelsToCut;
        }
        
        var tileHeaderOffsets = createTileHeaderAndGetOffsets(
            result,
            currentOffset,
            tileHeaderDatabin,
            tileIdToWrite,
            numResolutionLevelsToCut);
        
        if (tileHeaderOffsets === null) {
            return null;
        }
            
        currentOffset = tileHeaderOffsets.endTileHeaderOffset;
        
        if (!isOnlyHeadersWithoutBitstream) {
            var tileBytesCopied = createTileBitstream(
                result,
                currentOffset,
                tileStructure,
                tileIdOriginal,
                codestreamPartParams,
                minNumQualityLayers);
                
            currentOffset += tileBytesCopied;
            
            if (tileBytesCopied === null) {
                return null;
            }
        }

        var endTileOffset = currentOffset;
        
        var headerAndDataLength =
            endTileOffset - tileHeaderOffsets.startOfTileHeaderOffset;

        headerModifier.modifyInt32(
            result,
            tileHeaderOffsets.headerAndDataLengthPlaceholderOffset,
            headerAndDataLength);

        var bytesCopied = endTileOffset - startTileOffset;
        return bytesCopied;
    }
    
    function createTileHeaderAndGetOffsets(
        result,
        currentOffset,
        tileHeaderDatabin,
        tileIdToWrite,
        numResolutionLevelsToCut) {
        
        var startOfTileHeaderOffset = currentOffset;
    
        var bytesCopied = copyBytes(
            result, currentOffset, jGlobals.j2kMarkers.StartOfTile);
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
        
        var isEndedWithStartOfDataMarker =
            result[currentOffset - 2] === jGlobals.j2kMarkers.StartOfData[0] &&
            result[currentOffset - 1] === jGlobals.j2kMarkers.StartOfData[1];
            
        if (!isEndedWithStartOfDataMarker) {
            bytesCopied = copyBytes(
                result, currentOffset, jGlobals.j2kMarkers.StartOfData);
            currentOffset += bytesCopied;
        }
        
        var bytesAdded = headerModifier.modifyMainOrTileHeader(
            result,
            tileHeaderDatabin,
            afterStartOfTileSegmentOffset,
            numResolutionLevelsToCut);
        
        currentOffset += bytesAdded;

        var offsets = {
            startOfTileHeaderOffset: startOfTileHeaderOffset,
            headerAndDataLengthPlaceholderOffset: headerAndDataLengthPlaceholderOffset,
            endTileHeaderOffset: currentOffset
            };
        
        return offsets;
    }
    
    function createTileBitstream(
        result,
        currentOffset,
        tileStructure,
        tileIdOriginal,
        codestreamPartParams,
        minNumQualityLayers) {
        
        var numQualityLayersInTile = tileStructure.getNumQualityLayers();
        var maxNumQualityLayers;
        var iterator = tileStructure.getPrecinctIterator(
            tileIdOriginal,
            codestreamPartParams,
            /*isIteratePrecinctsNotInCodestreamPart=*/true);

        var allBytesCopied = 0;
        var hasMorePackets;
        
        if (codestreamPartParams !== undefined) {
            maxNumQualityLayers = codestreamPartParams.maxNumQualityLayers;
        }
        
        if (minNumQualityLayers === 'max') {
            minNumQualityLayers = numQualityLayersInTile;
        }
        
        do {
            var emptyPacketsToPush = numQualityLayersInTile;
            
            if (iterator.isInCodestreamPart) {
                var inClassId =
                    tileStructure.precinctPositionToInClassIndex(iterator);
                var precinctDatabin = databinsSaver.getPrecinctDatabin(inClassId);
                
                var qualityLayerOffset = qualityLayersCache.getQualityLayerOffset(
                    precinctDatabin,
                    maxNumQualityLayers,
                    iterator);
                
                var bytesToCopy = qualityLayerOffset.endOffset;
                emptyPacketsToPush =
                    numQualityLayersInTile - qualityLayerOffset.numQualityLayers;
                
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
            
            for (var i = 0; i < emptyPacketsToPush; ++i) {
                result[currentOffset++] = 0;
            }
            allBytesCopied += emptyPacketsToPush;
        }
        while (iterator.tryAdvance());
        
        return allBytesCopied;
    }
    
    function addMamazavComment(result, currentOffset) {
        var startOffset = currentOffset;
    
        result[currentOffset++] = 0xFF;
        result[currentOffset++] = 0x64;
        result[currentOffset++] = 0x00;
        result[currentOffset++] = 0x09;
        result[currentOffset++] = 77;
        result[currentOffset++] = 97;
        result[currentOffset++] = 109;
        result[currentOffset++] = 97;
        result[currentOffset++] = 122;
        result[currentOffset++] = 97;
        result[currentOffset++] = 118;
        
        var bytesAdded = currentOffset - startOffset;
        return bytesAdded;
    }
        
    function copyBytes(result, resultStartOffset, bytesToCopy) {
        for (var i = 0; i < bytesToCopy.length; ++i) {
            result[i + resultStartOffset] = bytesToCopy[i];
        }
        
        return bytesToCopy.length;
    }
};
},{"j2k-jpip-globals.js":15}],37:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipHeaderModifier = function JpipHeaderModifier(
    codestreamStructure, offsetsCalculator, progressionOrder) {

    var encodedProgressionOrder = encodeProgressionOrder(progressionOrder);
        
    this.modifyMainOrTileHeader = function modifyMainOrTileHeader(
        result, originalDatabin, databinOffsetInResult, numResolutionLevelsToCut) {
        
        modifyProgressionOrder(result, originalDatabin, databinOffsetInResult);
        
        if (numResolutionLevelsToCut === undefined) {
            return 0;
        }
        
        var bestResolutionLevelsRanges =
            offsetsCalculator.getRangesOfBestResolutionLevelsData(
                originalDatabin, numResolutionLevelsToCut);
        
        if (bestResolutionLevelsRanges.numDecompositionLevelsOffset !== null) {
            var offset =
                databinOffsetInResult +
                bestResolutionLevelsRanges.numDecompositionLevelsOffset;
                
            result[offset] -= numResolutionLevelsToCut;
        }
        
        var bytesRemoved = removeRanges(
            result, bestResolutionLevelsRanges.ranges, databinOffsetInResult);
        
        var bytesAdded = -bytesRemoved;
        return bytesAdded;
    };
    
    this.modifyImageSize = function modifyImageSize(result, codestreamPartParams) {
        var newTileWidth = codestreamStructure.getTileWidth(
            codestreamPartParams.numResolutionLevelsToCut);
        var newTileHeight = codestreamStructure.getTileHeight(
            codestreamPartParams.numResolutionLevelsToCut);
        
        var newReferenceGridSize = codestreamStructure.getSizeOfPart(
            codestreamPartParams);
        
        var sizMarkerOffset = offsetsCalculator.getImageAndTileSizeOffset();
            
        var referenceGridSizeOffset =
            sizMarkerOffset + jGlobals.j2kOffsets.REFERENCE_GRID_SIZE_OFFSET_AFTER_SIZ_MARKER;

        var imageOffsetBytesOffset = referenceGridSizeOffset + 8;
        var tileSizeBytesOffset = referenceGridSizeOffset + 16;
        var firstTileOffsetBytesOffset = referenceGridSizeOffset + 24;
        
        modifyInt32(result, referenceGridSizeOffset, newReferenceGridSize.width);
        modifyInt32(result, referenceGridSizeOffset + 4, newReferenceGridSize.height);
        
        modifyInt32(result, tileSizeBytesOffset, newTileWidth);
        modifyInt32(result, tileSizeBytesOffset + 4, newTileHeight);
        
        modifyInt32(result, imageOffsetBytesOffset, 0);
        modifyInt32(result, imageOffsetBytesOffset + 4, 0);
                
        modifyInt32(result, firstTileOffsetBytesOffset, 0);
        modifyInt32(result, firstTileOffsetBytesOffset + 4, 0);
    };
    
    this.modifyInt32 = modifyInt32;
    
    function modifyProgressionOrder(result, originalDatabin, databinOffsetInResult) {
        var codingStyleOffset = offsetsCalculator.getCodingStyleOffset(originalDatabin);
        
        if (codingStyleOffset !== null) {
            var progressionOrderOffset =
                databinOffsetInResult + codingStyleOffset + 5;
            
            result[progressionOrderOffset] = encodedProgressionOrder;
        }
    }
    
    function removeRanges(result, rangesToRemove, addOffset) {
        if (rangesToRemove.length === 0) {
            return 0; // zero bytes removed
        }
        
        for (var i = 0; i < rangesToRemove.length; ++i) {
            var offset =
                addOffset +
                rangesToRemove[i].markerSegmentLengthOffset;
                
            var originalMarkerSegmentLength =
                (result[offset] << 8) + result[offset + 1];
            
            var newMarkerSegmentLength =
                originalMarkerSegmentLength - rangesToRemove[i].length;
            
            result[offset] = newMarkerSegmentLength >>> 8;
            result[offset + 1] = newMarkerSegmentLength & 0xFF;
        }
        
        var offsetTarget = addOffset + rangesToRemove[0].start;
        var offsetSource = offsetTarget;
        for (var j = 0; j < rangesToRemove.length; ++j) {
            offsetSource += rangesToRemove[j].length;
            
            var nextRangeOffset =
                j + 1 < rangesToRemove.length ?
                    addOffset + rangesToRemove[j + 1].start :
                    result.length;

            for (; offsetSource < nextRangeOffset; ++offsetSource) {
                result[offsetTarget] = result[offsetSource];
                ++offsetTarget;
            }
        }
        
        var bytesRemoved = offsetSource - offsetTarget;
        
        return bytesRemoved;
    }

    function modifyInt32(bytes, offset, newValue) {
        bytes[offset++] = newValue >>> 24;
        bytes[offset++] = (newValue >>> 16) & 0xFF;
        bytes[offset++] = (newValue >>> 8) & 0xFF;
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
},{"j2k-jpip-globals.js":15}],38:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipPacketsDataCollector = function JpipPacketsDataCollector(
    codestreamStructure,
    databinsSaver,
    qualityLayersCache,
    jpipFactory) {
    
    this.getAllCodeblocksData = function getCodeblocksData(
        codestreamPartParams, minNumQualityLayers) {
        
        var alreadyReturnedCodeblocks = jpipFactory.createObjectPoolByDatabin();
        var codeblocksData = getNewCodeblocksDataAndUpdateReturnedCodeblocks(
            codestreamPartParams, minNumQualityLayers, alreadyReturnedCodeblocks);
        
        return {
            codeblocksData: codeblocksData,
            alreadyReturnedCodeblocks: alreadyReturnedCodeblocks
            };
    };
    
    this.getNewCodeblocksDataAndUpdateReturnedCodeblocks =
        getNewCodeblocksDataAndUpdateReturnedCodeblocks;
        
    function getNewCodeblocksDataAndUpdateReturnedCodeblocks(
        codestreamPartParams, minNumQualityLayers, alreadyReturnedCodeblocks) {
        
        var tileIterator = codestreamStructure.getTilesIterator(
            codestreamPartParams);
        
        var tileIndexInCodestreamPart = 0;
        var dummyOffset = 0;
        var result = {
            packetDataOffsets: [],
            data: jpipFactory.createCompositeArray(dummyOffset),
            allRelevantBytesLoaded: 0
            };
        
        do {
            var tileStructure = codestreamStructure.getTileStructure(
                tileIterator.tileIndex);
            
            var precinctIterator = tileStructure.getPrecinctIterator(
                tileIterator.tileIndex, codestreamPartParams);
            
            var maxNumQualityLayers = tileStructure.getNumQualityLayers();
            
            if (codestreamPartParams.maxNumQualityLayers !== undefined) {
                maxNumQualityLayers = Math.min(
                    maxNumQualityLayers, codestreamPartParams.maxNumQualityLayers);
            }
            
            if (minNumQualityLayers === 'max') {
                minNumQualityLayers = maxNumQualityLayers;
            } else if (minNumQualityLayers > maxNumQualityLayers) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'minNumQualityLayers is larger than maxNumQualityLayers');
            }
            
            do {
                if (!precinctIterator.isInCodestreamPart) {
                    throw new jGlobals.jpipExceptions.InternalErrorException(
                        'Unexpected precinct not in codestream part');
                }
                
                var inClassIndex = tileStructure.precinctPositionToInClassIndex(
                    precinctIterator);
                    
                var precinctDatabin = databinsSaver.getPrecinctDatabin(
                    inClassIndex);
                
                var returnedInPrecinct =
                    alreadyReturnedCodeblocks.getObject(precinctDatabin);
                if (returnedInPrecinct.layerPerCodeblock === undefined) {
                    returnedInPrecinct.layerPerCodeblock = [];
                }
            
                var layerReached = pushPackets(
                    result,
                    tileIndexInCodestreamPart,
                    precinctIterator,
                    precinctDatabin,
                    returnedInPrecinct,
                    maxNumQualityLayers);
                
                if (layerReached < minNumQualityLayers) {
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
            } while (precinctIterator.tryAdvance());
            
            ++tileIndexInCodestreamPart;
        } while (tileIterator.tryAdvance());
        
        var dataAsUint8 = new Uint8Array(result.data.getLength());
        result.data.copyToTypedArray(dataAsUint8, 0, 0, result.data.getLength());
        result.data = dataAsUint8;
        
        return result;
    }

    function pushPackets(
        result,
        tileIndexInCodestreamPart,
        precinctIterator,
        precinctDatabin,
        returnedCodeblocksInPrecinct,
        maxNumQualityLayers) {
        
        var layer;
        var offsetInPrecinctDatabin;
        
        for (layer = 0; layer < maxNumQualityLayers; ++layer) {
            var codeblockOffsetsInDatabin =
                qualityLayersCache.getPacketOffsetsByCodeblockIndex(
                    precinctDatabin, layer, precinctIterator);
            
            if (codeblockOffsetsInDatabin === null) {
                break;
            }
            
            offsetInPrecinctDatabin =
                codeblockOffsetsInDatabin.headerStartOffset +
                codeblockOffsetsInDatabin.headerLength;
            
            var numCodeblocks =
                codeblockOffsetsInDatabin.codeblockBodyLengthByIndex.length;
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
                
                var codeblock =
                    codeblockOffsetsInDatabin.codeblockBodyLengthByIndex[i];
                
                var offsetInResultArray = result.data.getLength();
                
                var bytesCopied = precinctDatabin.copyToCompositeArray(
                    result.data,
                    {
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
            
            var packet = {
                tileIndex: tileIndexInCodestreamPart,
                r: precinctIterator.resolutionLevel,
                p: precinctIterator.precinctIndexInComponentResolution,
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
},{"j2k-jpip-globals.js":15}]},{},[35])(35)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYXBpL2pwaXAtY29kZXN0cmVhbS1jbGllbnQuanMiLCJzcmMvYXBpL2pwaXAtY29kZXN0cmVhbS1zaXplcy1jYWxjdWxhdG9yLmpzIiwic3JjL2FwaS9qcGlwLWZldGNoLWhhbmRsZS5qcyIsInNyYy9hcGkvanBpcC1pbWFnZS1kYXRhLWNvbnRleHQuanMiLCJzcmMvYXBpL2pwaXAtaW1hZ2UtaW1wbGVtZW50YXRpb24uanMiLCJzcmMvYXBpL3BkZmpzLWpweC1kZWNvZGVyLmpzIiwic3JjL2RhdGFiaW5zL2NvbXBvc2l0ZS1hcnJheS5qcyIsInNyYy9kYXRhYmlucy9qcGlwLWRhdGFiaW4tcGFydHMuanMiLCJzcmMvZGF0YWJpbnMvanBpcC1kYXRhYmlucy1zYXZlci5qcyIsInNyYy9kYXRhYmlucy9qcGlwLW9iamVjdC1wb29sLWJ5LWRhdGFiaW4uanMiLCJzcmMvZGF0YWJpbnMvanBpcC1yZXF1ZXN0LWRhdGFiaW5zLWxpc3RlbmVyLmpzIiwic3JjL2ltYWdlLXN0cnVjdHVyZXMvanBpcC1jb2Rlc3RyZWFtLXN0cnVjdHVyZS5qcyIsInNyYy9pbWFnZS1zdHJ1Y3R1cmVzL2pwaXAtY29tcG9uZW50LXN0cnVjdHVyZS5qcyIsInNyYy9pbWFnZS1zdHJ1Y3R1cmVzL2pwaXAtdGlsZS1zdHJ1Y3R1cmUuanMiLCJzcmMvbWlzYy9qMmstanBpcC1nbG9iYWxzLmpzIiwic3JjL21pc2MvanBpcC1ydW50aW1lLWZhY3RvcnkuanMiLCJzcmMvbWlzYy9zaW1wbGUtYWpheC1oZWxwZXIuanMiLCJzcmMvcGFyc2Vycy9qcGlwLW1hcmtlcnMtcGFyc2VyLmpzIiwic3JjL3BhcnNlcnMvanBpcC1vZmZzZXRzLWNhbGN1bGF0b3IuanMiLCJzcmMvcGFyc2Vycy9qcGlwLXN0cnVjdHVyZS1wYXJzZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1jaGFubmVsLmpzIiwic3JjL3Byb3RvY29sL2pwaXAtbWVzc2FnZS1oZWFkZXItcGFyc2VyLmpzIiwic3JjL3Byb3RvY29sL2pwaXAtcmVjb25uZWN0YWJsZS1yZXF1ZXN0ZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1yZXF1ZXN0LmpzIiwic3JjL3Byb3RvY29sL2pwaXAtc2Vzc2lvbi1oZWxwZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1zZXNzaW9uLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtYml0c3RyZWFtLXJlYWRlci5qcyIsInNyYy9xdWFsaXR5LWxheWVycy9qcGlwLWNvZGVibG9jay1sZW5ndGgtcGFyc2VyLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtY29kaW5nLXBhc3Nlcy1udW1iZXItcGFyc2VyLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtcGFja2V0LWxlbmd0aC1jYWxjdWxhdG9yLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtcXVhbGl0eS1sYXllcnMtY2FjaGUuanMiLCJzcmMvcXVhbGl0eS1sYXllcnMvanBpcC1zdWJiYW5kLWxlbmd0aC1pbi1wYWNrZXQtaGVhZGVyLWNhbGN1bGF0b3IuanMiLCJzcmMvcXVhbGl0eS1sYXllcnMvanBpcC10YWctdHJlZS5qcyIsInNyYy9xdWFsaXR5LWxheWVycy9tdXR1YWwtZXhjbHVzaXZlLXRyYW5zYWN0aW9uLWhlbHBlci5qcyIsInNyYy93ZWJqcGlwLWV4cG9ydHMuanMiLCJzcmMvd3JpdGVycy9qcGlwLWNvZGVzdHJlYW0tcmVjb25zdHJ1Y3Rvci5qcyIsInNyYy93cml0ZXJzL2pwaXAtaGVhZGVyLW1vZGlmaWVyLmpzIiwic3JjL3dyaXRlcnMvanBpcC1wYWNrZXRzLWRhdGEtY29sbGVjdG9yLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMWtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDblFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvYUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxudmFyIGpwaXBSdW50aW1lRmFjdG9yeSA9IHJlcXVpcmUoJ2pwaXAtcnVudGltZS1mYWN0b3J5LmpzJykuanBpcFJ1bnRpbWVGYWN0b3J5OyBcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBDb2Rlc3RyZWFtQ2xpZW50ID0gZnVuY3Rpb24gSnBpcENvZGVzdHJlYW1DbGllbnQob3B0aW9ucykge1xyXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgICB2YXIganBpcEZhY3RvcnkgPSBqcGlwUnVudGltZUZhY3Rvcnk7XHJcblxyXG4gICAgdmFyIGRhdGFiaW5zU2F2ZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVEYXRhYmluc1NhdmVyKC8qaXNKcGlwVGlsZXBhcnRTdHJlYW09Ki9mYWxzZSk7XHJcbiAgICB2YXIgbWFpbkhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldE1haW5IZWFkZXJEYXRhYmluKCk7XHJcblxyXG4gICAgdmFyIG1hcmtlcnNQYXJzZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVNYXJrZXJzUGFyc2VyKG1haW5IZWFkZXJEYXRhYmluKTtcclxuICAgIHZhciBvZmZzZXRzQ2FsY3VsYXRvciA9IGpwaXBGYWN0b3J5LmNyZWF0ZU9mZnNldHNDYWxjdWxhdG9yKFxyXG4gICAgICAgIG1haW5IZWFkZXJEYXRhYmluLCBtYXJrZXJzUGFyc2VyKTtcclxuICAgIHZhciBzdHJ1Y3R1cmVQYXJzZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVTdHJ1Y3R1cmVQYXJzZXIoXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlciwgbWFya2Vyc1BhcnNlciwgb2Zmc2V0c0NhbGN1bGF0b3IpO1xyXG4gICAgXHJcbiAgICB2YXIgcHJvZ3Jlc3Npb25PcmRlciA9ICdSUENMJztcclxuICAgIHZhciBjb2Rlc3RyZWFtU3RydWN0dXJlID0ganBpcEZhY3RvcnkuY3JlYXRlQ29kZXN0cmVhbVN0cnVjdHVyZShcclxuICAgICAgICBzdHJ1Y3R1cmVQYXJzZXIsIHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgXHJcbiAgICB2YXIgcXVhbGl0eUxheWVyc0NhY2hlID0ganBpcEZhY3RvcnkuY3JlYXRlUXVhbGl0eUxheWVyc0NhY2hlKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUpO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIGhlYWRlck1vZGlmaWVyID0ganBpcEZhY3RvcnkuY3JlYXRlSGVhZGVyTW9kaWZpZXIoXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSwgb2Zmc2V0c0NhbGN1bGF0b3IsIHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgdmFyIHJlY29uc3RydWN0b3IgPSBqcGlwRmFjdG9yeS5jcmVhdGVDb2Rlc3RyZWFtUmVjb25zdHJ1Y3RvcihcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBkYXRhYmluc1NhdmVyLCBoZWFkZXJNb2RpZmllciwgcXVhbGl0eUxheWVyc0NhY2hlKTtcclxuICAgIHZhciBwYWNrZXRzRGF0YUNvbGxlY3RvciA9IGpwaXBGYWN0b3J5LmNyZWF0ZVBhY2tldHNEYXRhQ29sbGVjdG9yKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGRhdGFiaW5zU2F2ZXIsIHF1YWxpdHlMYXllcnNDYWNoZSk7XHJcbiAgICBcclxuICAgIHZhciBtYXhDaGFubmVsc0luU2Vzc2lvbiA9IG9wdGlvbnMubWF4Q2hhbm5lbHNJblNlc3Npb24gfHwgMTtcclxuICAgIHZhciBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCA9XHJcbiAgICAgICAgb3B0aW9ucy5tYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCB8fCAxO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIHJlcXVlc3RlciA9IGpwaXBGYWN0b3J5LmNyZWF0ZVJlY29ubmVjdGFibGVSZXF1ZXN0ZXIoXHJcbiAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyKTtcclxuICAgIFxyXG4gICAgdmFyIGpwaXBPYmplY3RzRm9yUmVxdWVzdENvbnRleHQgPSB7XHJcbiAgICAgICAgcmVxdWVzdGVyOiByZXF1ZXN0ZXIsXHJcbiAgICAgICAgcmVjb25zdHJ1Y3RvcjogcmVjb25zdHJ1Y3RvcixcclxuICAgICAgICBwYWNrZXRzRGF0YUNvbGxlY3RvcjogcGFja2V0c0RhdGFDb2xsZWN0b3IsXHJcbiAgICAgICAgcXVhbGl0eUxheWVyc0NhY2hlOiBxdWFsaXR5TGF5ZXJzQ2FjaGUsXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZTogY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyOiBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgIGpwaXBGYWN0b3J5OiBqcGlwRmFjdG9yeVxyXG4gICAgICAgIH07XHJcbiAgICBcclxuICAgIHZhciBzdGF0dXNDYWxsYmFjayA9IG51bGw7XHJcbiAgICBcclxuICAgIHRoaXMuc2V0U3RhdHVzQ2FsbGJhY2sgPSBmdW5jdGlvbiBzZXRTdGF0dXNDYWxsYmFja0Nsb3N1cmUoY2FsbGJhY2spIHtcclxuICAgICAgICBzdGF0dXNDYWxsYmFjayA9IGNhbGxiYWNrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXF1ZXN0ZXIuc2V0U3RhdHVzQ2FsbGJhY2socmVxdWVzdGVyU3RhdHVzQ2FsbGJhY2spO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3Rlci5zZXRTdGF0dXNDYWxsYmFjayhudWxsKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLm9wZW4gPSBmdW5jdGlvbiBvcGVuKGJhc2VVcmwpIHtcclxuICAgICAgICByZXF1ZXN0ZXIub3BlbihiYXNlVXJsKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2xvc2UgPSBmdW5jdGlvbiBjbG9zZShjbG9zZWRDYWxsYmFjaykge1xyXG4gICAgICAgIHJlcXVlc3Rlci5jbG9zZShjbG9zZWRDYWxsYmFjayk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFNpemVzUGFyYW1zID0gZnVuY3Rpb24gZ2V0U2l6ZXNQYXJhbXMoKSB7XHJcbiAgICAgICAgaWYgKCFyZXF1ZXN0ZXIuZ2V0SXNSZWFkeSgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0Nhbm5vdCBnZXQgY29kZXN0cmVhbSBzdHJ1Y3R1cmUgYmVmb3JlIGltYWdlIGlzIHJlYWR5Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYXJhbXMgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFNpemVzUGFyYW1zKCk7XHJcbiAgICAgICAgdmFyIGNsb25lZFBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldERlZmF1bHRUaWxlU3RydWN0dXJlKCk7XHJcbiAgICAgICAgdmFyIGNvbXBvbmVudCA9IHRpbGUuZ2V0RGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZSgpO1xyXG5cclxuICAgICAgICBjbG9uZWRQYXJhbXMuZGVmYXVsdE51bVF1YWxpdHlMYXllcnMgPVxyXG4gICAgICAgICAgICB0aWxlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuICAgICAgICBjbG9uZWRQYXJhbXMuZGVmYXVsdE51bVJlc29sdXRpb25MZXZlbHMgPVxyXG4gICAgICAgICAgICBjb21wb25lbnQuZ2V0TnVtUmVzb2x1dGlvbkxldmVscygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjbG9uZWRQYXJhbXM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNyZWF0ZUltYWdlRGF0YUNvbnRleHQgPSBmdW5jdGlvbiBjcmVhdGVJbWFnZURhdGFDb250ZXh0KFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG4gICAgICAgIHZhciB1c2VDYWNoZWREYXRhT25seSA9IG9wdGlvbnMudXNlQ2FjaGVkRGF0YU9ubHk7XHJcbiAgICAgICAgdmFyIGRpc2FibGVQcm9ncmVzc2l2ZW5lc3MgPSBvcHRpb25zLmRpc2FibGVQcm9ncmVzc2l2ZW5lc3M7XHJcblxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtUGFydFBhcmFtc01vZGlmaWVkID0gY2FzdENvZGVzdHJlYW1QYXJ0UGFyYW1zKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByb2dyZXNzaXZlbmVzc01vZGlmaWVkO1xyXG4gICAgICAgIGlmIChvcHRpb25zLnByb2dyZXNzaXZlbmVzcyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGlmICh1c2VDYWNoZWREYXRhT25seSB8fCBkaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ29wdGlvbnMucHJvZ3Jlc3NpdmVuZXNzJyxcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnByb2dyZXNzaXZlbmVzcyxcclxuICAgICAgICAgICAgICAgICAgICAnb3B0aW9ucyBjb250cmFkaWN0aW9uOiBjYW5ub3QgYWNjZXB0IGJvdGggcHJvZ3Jlc3NpdmVuZXNzJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2FuZCB1c2VDYWNoZWREYXRhT25seS9kaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzIG9wdGlvbnMnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBwcm9ncmVzc2l2ZW5lc3NNb2RpZmllZCA9IGNhc3RQcm9ncmVzc2l2ZW5lc3NQYXJhbXMoXHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnByb2dyZXNzaXZlbmVzcyxcclxuICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQubWF4TnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICAgICAgICAgICdtYXhOdW1RdWFsaXR5TGF5ZXJzJyk7XHJcbiAgICAgICAgfSBlbHNlICBpZiAodXNlQ2FjaGVkRGF0YU9ubHkpIHtcclxuICAgICAgICAgICAgcHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQgPSBbIHsgbWluTnVtUXVhbGl0eUxheWVyczogMCB9IF07XHJcbiAgICAgICAgfSBlbHNlIGlmIChkaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzKSB7XHJcbiAgICAgICAgICAgIHZhciBtYXhOdW1RdWFsaXR5TGF5ZXJzID0gY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4TnVtUXVhbGl0eUxheWVycztcclxuICAgICAgICAgICAgdmFyIG1pbk51bVF1YWxpdHlMYXllcnMgPVxyXG4gICAgICAgICAgICAgICAgbWF4TnVtUXVhbGl0eUxheWVycyA9PT0gdW5kZWZpbmVkID8gJ21heCcgOiBtYXhOdW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQgPSBbIHsgbWluTnVtUXVhbGl0eUxheWVyczogbWluTnVtUXVhbGl0eUxheWVycyB9IF07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQgPSBnZXRBdXRvbWF0aWNQcm9ncmVzc2l2ZW5lc3NTdGFnZXMoXHJcbiAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtc01vZGlmaWVkLm1heE51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW1hZ2VEYXRhQ29udGV4dCA9IGpwaXBGYWN0b3J5LmNyZWF0ZUltYWdlRGF0YUNvbnRleHQoXHJcbiAgICAgICAgICAgIGpwaXBPYmplY3RzRm9yUmVxdWVzdENvbnRleHQsXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQsXHJcbiAgICAgICAgICAgIHByb2dyZXNzaXZlbmVzc01vZGlmaWVkKTtcclxuICAgICAgICAgICAgLy97XHJcbiAgICAgICAgICAgIC8vICAgIGRpc2FibGVTZXJ2ZXJSZXF1ZXN0czogISFvcHRpb25zLmlzT25seVdhaXRGb3JEYXRhLFxyXG4gICAgICAgICAgICAvLyAgICBpc01vdmFibGU6IGZhbHNlLFxyXG4gICAgICAgICAgICAvLyAgICB1c2VyQ29udGV4dFZhcnM6IHVzZXJDb250ZXh0VmFycyxcclxuICAgICAgICAgICAgLy8gICAgZmFpbHVyZUNhbGxiYWNrOiBvcHRpb25zLmZhaWx1cmVDYWxsYmFja1xyXG4gICAgICAgICAgICAvL30pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBpbWFnZURhdGFDb250ZXh0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5mZXRjaCA9IGZ1bmN0aW9uIGZldGNoKGltYWdlRGF0YUNvbnRleHQpIHtcclxuICAgICAgICB2YXIgZmV0Y2hIYW5kbGUgPSBqcGlwRmFjdG9yeS5jcmVhdGVGZXRjaEhhbmRsZShyZXF1ZXN0ZXIsIGltYWdlRGF0YUNvbnRleHQpO1xyXG4gICAgICAgIGZldGNoSGFuZGxlLnJlc3VtZSgpO1xyXG4gICAgICAgIHJldHVybiBmZXRjaEhhbmRsZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc3RhcnRNb3ZhYmxlRmV0Y2ggPSBmdW5jdGlvbiBzdGFydE1vdmFibGVGZXRjaChpbWFnZURhdGFDb250ZXh0LCBtb3ZhYmxlRmV0Y2hTdGF0ZSkge1xyXG4gICAgICAgIG1vdmFibGVGZXRjaFN0YXRlLmRlZGljYXRlZENoYW5uZWxIYW5kbGUgPVxyXG4gICAgICAgICAgICByZXF1ZXN0ZXIuZGVkaWNhdGVDaGFubmVsRm9yTW92YWJsZVJlcXVlc3QoKTtcclxuICAgICAgICBtb3ZhYmxlRmV0Y2hTdGF0ZS5mZXRjaEhhbmRsZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZUZldGNoSGFuZGxlKFxyXG4gICAgICAgICAgICByZXF1ZXN0ZXIsIGltYWdlRGF0YUNvbnRleHQsIG1vdmFibGVGZXRjaFN0YXRlLmRlZGljYXRlZENoYW5uZWxIYW5kbGUpO1xyXG4gICAgICAgIG1vdmFibGVGZXRjaFN0YXRlLnJlc3VtZSgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5tb3ZlRmV0Y2ggPSBmdW5jdGlvbiBtb3ZlRmV0Y2goaW1hZ2VEYXRhQ29udGV4dCwgbW92YWJsZUZldGNoU3RhdGUpIHtcclxuICAgICAgICBtb3ZhYmxlRmV0Y2hTdGF0ZS5mZXRjaEhhbmRsZS5zdG9wQXN5bmMoKTtcclxuICAgICAgICBtb3ZhYmxlRmV0Y2hTdGF0ZS5mZXRjaEhhbmRsZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZUZldGNoSGFuZGxlKFxyXG4gICAgICAgICAgICByZXF1ZXN0ZXIsIGltYWdlRGF0YUNvbnRleHQsIG1vdmFibGVGZXRjaFN0YXRlLmRlZGljYXRlZENoYW5uZWxIYW5kbGUpO1xyXG4gICAgICAgIG1vdmFibGVGZXRjaFN0YXRlLnJlc3VtZSgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgLy90aGlzLmNyZWF0ZURhdGFSZXF1ZXN0ID0gZnVuY3Rpb24gY3JlYXRlRGF0YVJlcXVlc3QoXHJcbiAgICAvLyAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcywgY2FsbGJhY2ssIHVzZXJDb250ZXh0VmFycywgb3B0aW9ucykge1xyXG4gICAgLy8gICAgXHJcbiAgICAvLyAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcclxuICAgIC8vICAgIGlmIChvcHRpb25zLmlzT25seVdhaXRGb3JEYXRhICE9PSB1bmRlZmluZWQpIHtcclxuICAgIC8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAvLyAgICAgICAgICAgICdvcHRpb25zLmlzT25seVdhaXRGb3JEYXRhJyxcclxuICAgIC8vICAgICAgICAgICAgb3B0aW9ucy5pc09ubHlXYWl0Rm9yRGF0YSxcclxuICAgIC8vICAgICAgICAgICAgJ2lzT25seVdhaXRGb3JEYXRhIGlzIHN1cHBvcnRlZCBvbmx5IGZvciBwcm9ncmVzc2l2ZSByZXF1ZXN0Jyk7XHJcbiAgICAvLyAgICB9XHJcbiAgICAvLyAgICBcclxuICAgIC8vICAgIHZhciBjb2Rlc3RyZWFtUGFydFBhcmFtc01vZGlmaWVkID0gY2FzdENvZGVzdHJlYW1QYXJ0UGFyYW1zKFxyXG4gICAgLy8gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgIC8vICAgIFxyXG4gICAgLy8gICAgdmFyIHByb2dyZXNzaXZlbmVzcztcclxuICAgIC8vICAgIGlmIChvcHRpb25zLnVzZUNhY2hlZERhdGFPbmx5KSB7XHJcbiAgICAvLyAgICAgICAgcHJvZ3Jlc3NpdmVuZXNzID0gWyB7IG1pbk51bVF1YWxpdHlMYXllcnM6IDAgfSBdO1xyXG4gICAgLy8gICAgfSBlbHNlIHtcclxuICAgIC8vICAgICAgICB2YXIgbWF4TnVtUXVhbGl0eUxheWVycyA9IGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heE51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAvLyAgICAgICAgdmFyIG1pbk51bVF1YWxpdHlMYXllcnMgPVxyXG4gICAgLy8gICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzID09PSB1bmRlZmluZWQgPyAnbWF4JyA6IG1heE51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAvLyAgICAgICAgXHJcbiAgICAvLyAgICAgICAgcHJvZ3Jlc3NpdmVuZXNzID0gWyB7IG1pbk51bVF1YWxpdHlMYXllcnM6IG1pbk51bVF1YWxpdHlMYXllcnMgfSBdO1xyXG4gICAgLy8gICAgfVxyXG4gICAgLy8gICAgXHJcbiAgICAvLyAgICB2YXIgcmVxdWVzdENvbnRleHQgPSBqcGlwRmFjdG9yeS5jcmVhdGVSZXF1ZXN0Q29udGV4dChcclxuICAgIC8vICAgICAgICBqcGlwT2JqZWN0c0ZvclJlcXVlc3RDb250ZXh0LFxyXG4gICAgLy8gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQsXHJcbiAgICAvLyAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAvLyAgICAgICAgcHJvZ3Jlc3NpdmVuZXNzLFxyXG4gICAgLy8gICAgICAgIHtcclxuICAgIC8vICAgICAgICAgICAgZGlzYWJsZVNlcnZlclJlcXVlc3RzOiAhIW9wdGlvbnMudXNlQ2FjaGVkRGF0YU9ubHksXHJcbiAgICAvLyAgICAgICAgICAgIGlzTW92YWJsZTogZmFsc2UsXHJcbiAgICAvLyAgICAgICAgICAgIHVzZXJDb250ZXh0VmFyczogdXNlckNvbnRleHRWYXJzLFxyXG4gICAgLy8gICAgICAgICAgICBmYWlsdXJlQ2FsbGJhY2s6IG9wdGlvbnMuZmFpbHVyZUNhbGxiYWNrXHJcbiAgICAvLyAgICAgICAgfSk7XHJcbiAgICAvLyAgICBcclxuICAgIC8vICAgIHJldHVybiByZXF1ZXN0Q29udGV4dDtcclxuICAgIC8vfTtcclxuICAgIC8vXHJcbiAgICAvL3RoaXMuY3JlYXRlUHJvZ3Jlc3NpdmVEYXRhUmVxdWVzdCA9IGZ1bmN0aW9uIGNyZWF0ZVByb2dyZXNzaXZlRGF0YVJlcXVlc3QoXHJcbiAgICAvLyAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgIC8vICAgIGNhbGxiYWNrLFxyXG4gICAgLy8gICAgdXNlckNvbnRleHRWYXJzLFxyXG4gICAgLy8gICAgb3B0aW9ucyxcclxuICAgIC8vICAgIHByb2dyZXNzaXZlbmVzcykge1xyXG4gICAgLy8gICAgXHJcbiAgICAvLyAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcclxuICAgIC8vICAgIGlmIChvcHRpb25zLnVzZUNhY2hlZERhdGFPbmx5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgIC8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAvLyAgICAgICAgICAgICdvcHRpb25zLnVzZUNhY2hlZERhdGFPbmx5JyxcclxuICAgIC8vICAgICAgICAgICAgb3B0aW9ucy51c2VDYWNoZWREYXRhT25seSxcclxuICAgIC8vICAgICAgICAgICAgJ3VzZUNhY2hlZERhdGFPbmx5IGlzIG5vdCBzdXBwb3J0ZWQgZm9yIHByb2dyZXNzaXZlIHJlcXVlc3QnKTtcclxuICAgIC8vICAgIH1cclxuICAgIC8vICAgIFxyXG4gICAgLy8gICAgdmFyIGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQgPSBjYXN0Q29kZXN0cmVhbVBhcnRQYXJhbXMoXHJcbiAgICAvLyAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG4gICAgLy8gICAgXHJcbiAgICAvLyAgICB2YXIgcHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQ7XHJcbiAgICAvLyAgICBpZiAocHJvZ3Jlc3NpdmVuZXNzID09PSB1bmRlZmluZWQpIHtcclxuICAgIC8vICAgICAgICBwcm9ncmVzc2l2ZW5lc3NNb2RpZmllZCA9IGdldEF1dG9tYXRpY1Byb2dyZXNzaXZlbmVzc1N0YWdlcyhcclxuICAgIC8vICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXNNb2RpZmllZC5tYXhOdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgIC8vICAgIH0gZWxzZSB7XHJcbiAgICAvLyAgICAgICAgcHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQgPSBjYXN0UHJvZ3Jlc3NpdmVuZXNzUGFyYW1zKFxyXG4gICAgLy8gICAgICAgICAgICBwcm9ncmVzc2l2ZW5lc3MsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQubWF4TnVtUXVhbGl0eUxheWVycywgJ21heE51bVF1YWxpdHlMYXllcnMnKTtcclxuICAgIC8vICAgIH1cclxuICAgIC8vICAgIFxyXG4gICAgLy8gICAgdmFyIHJlcXVlc3RDb250ZXh0ID0ganBpcEZhY3RvcnkuY3JlYXRlUmVxdWVzdENvbnRleHQoXHJcbiAgICAvLyAgICAgICAganBpcE9iamVjdHNGb3JSZXF1ZXN0Q29udGV4dCxcclxuICAgIC8vICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtc01vZGlmaWVkLFxyXG4gICAgLy8gICAgICAgIGNhbGxiYWNrLFxyXG4gICAgLy8gICAgICAgIHByb2dyZXNzaXZlbmVzc01vZGlmaWVkLFxyXG4gICAgLy8gICAgICAgIHtcclxuICAgIC8vICAgICAgICAgICAgZGlzYWJsZVNlcnZlclJlcXVlc3RzOiAhIW9wdGlvbnMuaXNPbmx5V2FpdEZvckRhdGEsXHJcbiAgICAvLyAgICAgICAgICAgIGlzTW92YWJsZTogZmFsc2UsXHJcbiAgICAvLyAgICAgICAgICAgIHVzZXJDb250ZXh0VmFyczogdXNlckNvbnRleHRWYXJzLFxyXG4gICAgLy8gICAgICAgICAgICBmYWlsdXJlQ2FsbGJhY2s6IG9wdGlvbnMuZmFpbHVyZUNhbGxiYWNrXHJcbiAgICAvLyAgICAgICAgfSk7XHJcbiAgICAvLyAgICBcclxuICAgIC8vICAgIHJldHVybiByZXF1ZXN0Q29udGV4dDtcclxuICAgIC8vfTtcclxuICAgIFxyXG4gICAgLy90aGlzLmNyZWF0ZU1vdmFibGVSZXF1ZXN0ID0gZnVuY3Rpb24gY3JlYXRlTW92YWJsZVJlcXVlc3QoXHJcbiAgICAvLyAgICBjYWxsYmFjaywgdXNlckNvbnRleHRWYXJzKSB7XHJcbiAgICAvLyAgICBcclxuICAgIC8vICAgIC8vIE5PVEU6IFRoaW5rIG9mIHRoZSBjb3JyZWN0IEFQSSBvZiBwcm9ncmVzc2l2ZW5lc3MgaW4gbW92YWJsZSByZXF1ZXN0c1xyXG4gICAgLy8gICAgXHJcbiAgICAvLyAgICB2YXIgem9tYmllQ29kZXN0cmVhbVBhcnRQYXJhbXMgPSBudWxsO1xyXG4gICAgLy8gICAgdmFyIHByb2dyZXNzaXZlbmVzcyA9IGdldEF1dG9tYXRpY1Byb2dyZXNzaXZlbmVzc1N0YWdlcygpO1xyXG4gICAgLy8gICAgXHJcbiAgICAvLyAgICB2YXIgcmVxdWVzdENvbnRleHQgPSBqcGlwRmFjdG9yeS5jcmVhdGVSZXF1ZXN0Q29udGV4dChcclxuICAgIC8vICAgICAgICBqcGlwT2JqZWN0c0ZvclJlcXVlc3RDb250ZXh0LFxyXG4gICAgLy8gICAgICAgIHpvbWJpZUNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgLy8gICAgICAgIGNhbGxiYWNrLFxyXG4gICAgLy8gICAgICAgIHByb2dyZXNzaXZlbmVzcyxcclxuICAgIC8vICAgICAgICB7XHJcbiAgICAvLyAgICAgICAgICAgIGRpc2FibGVTZXJ2ZXJSZXF1ZXN0czogZmFsc2UsXHJcbiAgICAvLyAgICAgICAgICAgIGlzTW92YWJsZTogdHJ1ZSxcclxuICAgIC8vICAgICAgICAgICAgdXNlckNvbnRleHRWYXJzOiB1c2VyQ29udGV4dFZhcnNcclxuICAgIC8vICAgICAgICB9KTtcclxuICAgIC8vICAgICAgICBcclxuICAgIC8vICAgIHJldHVybiByZXF1ZXN0Q29udGV4dDtcclxuICAgIC8vfTtcclxuICAgIFxyXG4gICAgdGhpcy5yZWNvbm5lY3QgPSBmdW5jdGlvbiByZWNvbm5lY3QoKSB7XHJcbiAgICAgICAgcmVxdWVzdGVyLnJlY29ubmVjdCgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gcmVxdWVzdGVyU3RhdHVzQ2FsbGJhY2socmVxdWVzdGVyU3RhdHVzKSB7XHJcbiAgICAgICAgdmFyIHNlcmlhbGl6YWJsZUV4Y2VwdGlvbiA9IG51bGw7XHJcbiAgICAgICAgaWYgKHJlcXVlc3RlclN0YXR1cy5leGNlcHRpb24gIT09IG51bGwpIHtcclxuICAgICAgICAgICAgc2VyaWFsaXphYmxlRXhjZXB0aW9uID0gcmVxdWVzdGVyU3RhdHVzLmV4Y2VwdGlvbi50b1N0cmluZygpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3RhdHVzID0ge1xyXG4gICAgICAgICAgICBpc1JlYWR5OiByZXF1ZXN0ZXJTdGF0dXMuaXNSZWFkeSxcclxuICAgICAgICAgICAgZXhjZXB0aW9uOiBzZXJpYWxpemFibGVFeGNlcHRpb25cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBzdGF0dXNDYWxsYmFjayhzdGF0dXMpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjYXN0UHJvZ3Jlc3NpdmVuZXNzUGFyYW1zKHByb2dyZXNzaXZlbmVzcywgbWF4TnVtUXVhbGl0eUxheWVycywgcHJvcGVydHlOYW1lKSB7XHJcbiAgICAgICAgLy8gRW5zdXJlIHRoYW4gbWluTnVtUXVhbGl0eUxheWVycyBpcyBnaXZlbiBmb3IgYWxsIGl0ZW1zXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShwcm9ncmVzc2l2ZW5lc3MubGVuZ3RoKTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9ncmVzc2l2ZW5lc3MubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIG1pbk51bVF1YWxpdHlMYXllcnMgPSBwcm9ncmVzc2l2ZW5lc3NbaV0ubWluTnVtUXVhbGl0eUxheWVycztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzICE9PSAnbWF4Jykge1xyXG4gICAgICAgICAgICAgICAgaWYgKG1heE51bVF1YWxpdHlMYXllcnMgIT09IHVuZGVmaW5lZCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMgPiBtYXhOdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJvZ3Jlc3NpdmVuZXNzWycgKyBpICsgJ10ubWluTnVtUXVhbGl0eUxheWVycycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdtaW5OdW1RdWFsaXR5TGF5ZXJzIGlzIGJpZ2dlciB0aGFuICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2ZldGNoUGFyYW1zLm1heE51bVF1YWxpdHlMYXllcnMnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyA9IHZhbGlkYXRlTnVtZXJpY1BhcmFtKFxyXG4gICAgICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICdwcm9ncmVzc2l2ZW5lc3NbJyArIGkgKyAnXS5taW5OdW1RdWFsaXR5TGF5ZXJzJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IHsgbWluTnVtUXVhbGl0eUxheWVyczogbWluTnVtUXVhbGl0eUxheWVycyB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRBdXRvbWF0aWNQcm9ncmVzc2l2ZW5lc3NTdGFnZXMobWF4TnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIC8vIENyZWF0ZSBwcm9ncmVzc2l2ZW5lc3Mgb2YgKDEsIDIsIDMsICgjbWF4LXF1YWxpdHkvMiksICgjbWF4LXF1YWxpdHkpKVxyXG5cclxuICAgICAgICB2YXIgcHJvZ3Jlc3NpdmVuZXNzID0gW107XHJcblxyXG4gICAgICAgIC8vIE5vIHByb2dyZXNzaXZlbmVzcywgd2FpdCBmb3IgYWxsIHF1YWxpdHkgbGF5ZXJzIHRvIGJlIGZldGNoZWRcclxuICAgICAgICB2YXIgdGlsZVN0cnVjdHVyZSA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0RGVmYXVsdFRpbGVTdHJ1Y3R1cmUoKTtcclxuICAgICAgICB2YXIgbnVtUXVhbGl0eUxheWVyc051bWVyaWMgPSB0aWxlU3RydWN0dXJlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuICAgICAgICB2YXIgbWF4TnVtUXVhbGl0eUxheWVyc051bWVyaWNPck1heCA9ICdtYXgnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXhOdW1RdWFsaXR5TGF5ZXJzICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyc051bWVyaWMgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnNOdW1lcmljLCBtYXhOdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICAgICAgbWF4TnVtUXVhbGl0eUxheWVyc051bWVyaWNPck1heCA9IG51bVF1YWxpdHlMYXllcnNOdW1lcmljO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RRdWFsaXR5TGF5ZXJzQ291bnQgPSBudW1RdWFsaXR5TGF5ZXJzTnVtZXJpYyA8IDQgP1xyXG4gICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzTnVtZXJpYyAtIDE6IDM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBmaXJzdFF1YWxpdHlMYXllcnNDb3VudDsgKytpKSB7XHJcbiAgICAgICAgICAgIHByb2dyZXNzaXZlbmVzcy5wdXNoKHsgbWluTnVtUXVhbGl0eUxheWVyczogaSB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1pZGRsZVF1YWxpdHkgPSBNYXRoLnJvdW5kKG51bVF1YWxpdHlMYXllcnNOdW1lcmljIC8gMik7XHJcbiAgICAgICAgaWYgKG1pZGRsZVF1YWxpdHkgPiBmaXJzdFF1YWxpdHlMYXllcnNDb3VudCkge1xyXG4gICAgICAgICAgICBwcm9ncmVzc2l2ZW5lc3MucHVzaCh7IG1pbk51bVF1YWxpdHlMYXllcnM6IG1pZGRsZVF1YWxpdHkgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHByb2dyZXNzaXZlbmVzcy5wdXNoKHtcclxuICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVyczogbWF4TnVtUXVhbGl0eUxheWVyc051bWVyaWNPck1heFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcHJvZ3Jlc3NpdmVuZXNzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjYXN0Q29kZXN0cmVhbVBhcnRQYXJhbXMoY29kZXN0cmVhbVBhcnRQYXJhbXMpIHtcclxuICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0ID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNUb0N1dCxcclxuICAgICAgICAgICAgJ251bVJlc29sdXRpb25MZXZlbHNUb0N1dCcsXHJcbiAgICAgICAgICAgIC8qZGVmYXVsdFZhbHVlPSovdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAvKmFsbG93VW5kZWZpZW5kPSovdHJ1ZSk7XHJcblxyXG4gICAgICAgIHZhciBtYXhOdW1RdWFsaXR5TGF5ZXJzID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heE51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgICAgICdtYXhOdW1RdWFsaXR5TGF5ZXJzJyxcclxuICAgICAgICAgICAgLypkZWZhdWx0VmFsdWU9Ki91bmRlZmluZWQsXHJcbiAgICAgICAgICAgIC8qYWxsb3dVbmRlZmllbmQ9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWluWCA9IHZhbGlkYXRlTnVtZXJpY1BhcmFtKGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblgsICdtaW5YJyk7XHJcbiAgICAgICAgdmFyIG1pblkgPSB2YWxpZGF0ZU51bWVyaWNQYXJhbShjb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5ZLCAnbWluWScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhYID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUsICdtYXhYRXhjbHVzaXZlJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1heFkgPSB2YWxpZGF0ZU51bWVyaWNQYXJhbShcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSwgJ21heFlFeGNsdXNpdmUnKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGV2ZWxXaWR0aCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxXaWR0aChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHZhciBsZXZlbEhlaWdodCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxIZWlnaHQobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobWluWCA8IDAgfHwgbWF4WCA+IGxldmVsV2lkdGggfHxcclxuICAgICAgICAgICAgbWluWSA8IDAgfHwgbWF4WSA+IGxldmVsSGVpZ2h0IHx8XHJcbiAgICAgICAgICAgIG1pblggPj0gbWF4WCB8fCBtaW5ZID49IG1heFkpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdjb2Rlc3RyZWFtUGFydFBhcmFtcycsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgbWluWDogbWluWCxcclxuICAgICAgICAgICAgbWluWTogbWluWSxcclxuICAgICAgICAgICAgbWF4WEV4Y2x1c2l2ZTogbWF4WCxcclxuICAgICAgICAgICAgbWF4WUV4Y2x1c2l2ZTogbWF4WSxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dDogbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0LFxyXG4gICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzOiBtYXhOdW1RdWFsaXR5TGF5ZXJzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcbiAgICAgICAgaW5wdXRWYWx1ZSwgcHJvcGVydHlOYW1lLCBkZWZhdWx0VmFsdWUsIGFsbG93VW5kZWZpbmVkKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlucHV0VmFsdWUgPT09IHVuZGVmaW5lZCAmJlxyXG4gICAgICAgICAgICAoZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgfHwgYWxsb3dVbmRlZmluZWQpKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gK2lucHV0VmFsdWU7XHJcbiAgICAgICAgaWYgKGlzTmFOKHJlc3VsdCkgfHwgcmVzdWx0ICE9PSBNYXRoLmZsb29yKHJlc3VsdCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgcHJvcGVydHlOYW1lLCBpbnB1dFZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuSnBpcENvZGVzdHJlYW1TaXplc0NhbGN1bGF0b3IgPSBmdW5jdGlvbiBKcGlwQ29kZXN0cmVhbVNpemVzQ2FsY3VsYXRvcihcclxuICAgIHBhcmFtcykge1xyXG4gICAgXHJcbiAgICB2YXIgRURHRV9UWVBFX05PX0VER0UgPSAwO1xyXG4gICAgdmFyIEVER0VfVFlQRV9GSVJTVCA9IDE7XHJcbiAgICB2YXIgRURHRV9UWVBFX0xBU1QgPSAyO1xyXG5cclxuICAgIHRoaXMuRURHRV9UWVBFX05PX0VER0UgPSBFREdFX1RZUEVfTk9fRURHRTtcclxuICAgIHRoaXMuRURHRV9UWVBFX0ZJUlNUID0gRURHRV9UWVBFX0ZJUlNUO1xyXG4gICAgdGhpcy5FREdFX1RZUEVfTEFTVCA9IEVER0VfVFlQRV9MQVNUO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFNpemVPZlBhcnQgPSBnZXRTaXplT2ZQYXJ0O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVzRnJvbVBpeGVscyA9IGdldFRpbGVzRnJvbVBpeGVscztcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1UaWxlc1ggPSBnZXROdW1UaWxlc1g7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtVGlsZXNZID0gZ2V0TnVtVGlsZXNZO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExldmVsV2lkdGggPSBnZXRMZXZlbFdpZHRoO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExldmVsSGVpZ2h0ID0gZ2V0TGV2ZWxIZWlnaHQ7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZVdpZHRoID0gZ2V0VGlsZVdpZHRoO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVIZWlnaHQgPSBnZXRUaWxlSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZU9mZnNldFggPSBnZXRGaXJzdFRpbGVPZmZzZXRYO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZU9mZnNldFkgPSBnZXRGaXJzdFRpbGVPZmZzZXRZO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZVdpZHRoID0gZ2V0Rmlyc3RUaWxlV2lkdGg7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RUaWxlSGVpZ2h0ID0gZ2V0Rmlyc3RUaWxlSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB0aGlzLmlzRWRnZVRpbGVJZCA9IGlzRWRnZVRpbGVJZDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlU2l6ZSA9IGdldFRpbGVTaXplO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldERlZmF1bHROdW1SZXNvbHV0aW9uTGV2ZWxzID1cclxuICAgICAgICBmdW5jdGlvbiBnZXREZWZhdWx0TnVtUmVzb2x1dGlvbkxldmVscygpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocGFyYW1zLmRlZmF1bHROdW1SZXNvbHV0aW9uTGV2ZWxzID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgJ1RoaXMgbWV0aG9kIGlzIGF2YWlsYWJsZSBvbmx5IHdoZW4ganBpcFNpemVzQ2FsY3VsYXRvciAnICtcclxuICAgICAgICAgICAgICAgICdpcyBjcmVhdGVkIGZyb20gcGFyYW1zIHJldHVybmVkIGJ5IGpwaXBDb2Rlc3RyZWFtQ2xpZW50LiAnICtcclxuICAgICAgICAgICAgICAgICdJdCBzaGFsbCBiZSB1c2VkIGZvciBKUElQIEFQSSBwdXJwb3NlcyBvbmx5JztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5kZWZhdWx0TnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RGVmYXVsdE51bVF1YWxpdHlMYXllcnMgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldERlZmF1bHROdW1RdWFsaXR5TGF5ZXJzKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwYXJhbXMuZGVmYXVsdE51bVF1YWxpdHlMYXllcnMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyAnVGhpcyBtZXRob2QgaXMgYXZhaWxhYmxlIG9ubHkgd2hlbiBqcGlwU2l6ZXNDYWxjdWxhdG9yICcgK1xyXG4gICAgICAgICAgICAgICAgJ2lzIGNyZWF0ZWQgZnJvbSBwYXJhbXMgcmV0dXJuZWQgYnkganBpcENvZGVzdHJlYW1DbGllbnQuICcgK1xyXG4gICAgICAgICAgICAgICAgJ0l0IHNoYWxsIGJlIHVzZWQgZm9yIEpQSVAgQVBJIHB1cnBvc2VzIG9ubHknO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcGFyYW1zLmRlZmF1bHROdW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0U2l6ZU9mUGFydChjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG4gICAgICAgIHZhciBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQ7XHJcbiAgICAgICAgdmFyIHRpbGVXaWR0aCA9IGdldFRpbGVXaWR0aChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHZhciB0aWxlSGVpZ2h0ID0gZ2V0VGlsZUhlaWdodChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlQm91bmRzID0gZ2V0VGlsZXNGcm9tUGl4ZWxzKGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RUaWxlSW5kZXggPVxyXG4gICAgICAgICAgICB0aWxlQm91bmRzLm1pblRpbGVYICsgdGlsZUJvdW5kcy5taW5UaWxlWSAqIGdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgbGFzdFRpbGVJbmRleCA9XHJcbiAgICAgICAgICAgICh0aWxlQm91bmRzLm1heFRpbGVYRXhjbHVzaXZlIC0gMSkgK1xyXG4gICAgICAgICAgICAodGlsZUJvdW5kcy5tYXhUaWxlWUV4Y2x1c2l2ZSAtIDEpICogZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZpcnN0RWRnZVR5cGUgPSBpc0VkZ2VUaWxlSWQoZmlyc3RUaWxlSW5kZXgpO1xyXG4gICAgICAgIHZhciBsYXN0RWRnZVR5cGUgPSBpc0VkZ2VUaWxlSWQobGFzdFRpbGVJbmRleCk7XHJcbiAgICAgICAgdmFyIGZpcnN0U2l6ZSA9IGdldFRpbGVTaXplKGZpcnN0RWRnZVR5cGUsIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgdmFyIGxhc3RTaXplID0gZ2V0VGlsZVNpemUobGFzdEVkZ2VUeXBlLCBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB3aWR0aCA9IGZpcnN0U2l6ZVswXTtcclxuICAgICAgICB2YXIgaGVpZ2h0ID0gZmlyc3RTaXplWzFdO1xyXG5cclxuICAgICAgICB2YXIgdGlsZXNYID0gdGlsZUJvdW5kcy5tYXhUaWxlWEV4Y2x1c2l2ZSAtIHRpbGVCb3VuZHMubWluVGlsZVg7XHJcbiAgICAgICAgdmFyIHRpbGVzWSA9IHRpbGVCb3VuZHMubWF4VGlsZVlFeGNsdXNpdmUgLSB0aWxlQm91bmRzLm1pblRpbGVZO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlc1ggPiAxKSB7XHJcbiAgICAgICAgICAgIHdpZHRoICs9IGxhc3RTaXplWzBdO1xyXG4gICAgICAgICAgICB3aWR0aCArPSB0aWxlV2lkdGggKiAodGlsZXNYIC0gMik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlc1kgPiAxKSB7XHJcbiAgICAgICAgICAgIGhlaWdodCArPSBsYXN0U2l6ZVsxXTtcclxuICAgICAgICAgICAgaGVpZ2h0ICs9IHRpbGVIZWlnaHQgKiAodGlsZXNZIC0gMik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHRcclxuICAgICAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0VGlsZXNGcm9tUGl4ZWxzKHBhcnRQYXJhbXMpIHtcclxuICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0ID1cclxuICAgICAgICAgICAgcGFydFBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQ7XHJcblxyXG4gICAgICAgIHZhciB0aWxlV2lkdGggPSBnZXRUaWxlV2lkdGgobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICB2YXIgdGlsZUhlaWdodCA9IGdldFRpbGVIZWlnaHQobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RUaWxlV2lkdGggPSBnZXRGaXJzdFRpbGVXaWR0aChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHZhciBmaXJzdFRpbGVIZWlnaHQgPSBnZXRGaXJzdFRpbGVIZWlnaHQobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3RhcnRYTm9GaXJzdCA9IChwYXJ0UGFyYW1zLm1pblggLSBmaXJzdFRpbGVXaWR0aCkgLyB0aWxlV2lkdGg7XHJcbiAgICAgICAgdmFyIHN0YXJ0WU5vRmlyc3QgPSAocGFydFBhcmFtcy5taW5ZIC0gZmlyc3RUaWxlSGVpZ2h0KSAvIHRpbGVIZWlnaHQ7XHJcbiAgICAgICAgdmFyIGVuZFhOb0ZpcnN0ID0gKHBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIGZpcnN0VGlsZVdpZHRoKSAvIHRpbGVXaWR0aDtcclxuICAgICAgICB2YXIgZW5kWU5vRmlyc3QgPSAocGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlIC0gZmlyc3RUaWxlSGVpZ2h0KSAvIHRpbGVIZWlnaHQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1pblRpbGVYID0gTWF0aC5tYXgoMCwgMSArIHN0YXJ0WE5vRmlyc3QpO1xyXG4gICAgICAgIHZhciBtaW5UaWxlWSA9IE1hdGgubWF4KDAsIDEgKyBzdGFydFlOb0ZpcnN0KTtcclxuICAgICAgICB2YXIgbWF4VGlsZVggPSBNYXRoLm1pbihnZXROdW1UaWxlc1goKSwgMSArIGVuZFhOb0ZpcnN0KTtcclxuICAgICAgICB2YXIgbWF4VGlsZVkgPSBNYXRoLm1pbihnZXROdW1UaWxlc1koKSwgMSArIGVuZFlOb0ZpcnN0KTtcclxuXHJcbiAgICAgICAgdmFyIGJvdW5kcyA9IHtcclxuICAgICAgICAgICAgbWluVGlsZVg6IE1hdGguZmxvb3IobWluVGlsZVgpLFxyXG4gICAgICAgICAgICBtaW5UaWxlWTogTWF0aC5mbG9vcihtaW5UaWxlWSksXHJcbiAgICAgICAgICAgIG1heFRpbGVYRXhjbHVzaXZlOiBNYXRoLmNlaWwobWF4VGlsZVgpLFxyXG4gICAgICAgICAgICBtYXhUaWxlWUV4Y2x1c2l2ZTogTWF0aC5jZWlsKG1heFRpbGVZKVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBib3VuZHM7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0VGlsZVNpemUoZWRnZVR5cGUsIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgIHZhciB0aWxlV2lkdGggPSBnZXRUaWxlRGltZW5zaW9uU2l6ZShcclxuICAgICAgICAgICAgZWRnZVR5cGUuaG9yaXpvbnRhbEVkZ2VUeXBlLFxyXG4gICAgICAgICAgICBnZXRGaXJzdFRpbGVXaWR0aCxcclxuICAgICAgICAgICAgZ2V0TGV2ZWxXaWR0aCxcclxuICAgICAgICAgICAgZ2V0VGlsZVdpZHRoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUhlaWdodCA9IGdldFRpbGVEaW1lbnNpb25TaXplKFxyXG4gICAgICAgICAgICBlZGdlVHlwZS52ZXJ0aWNhbEVkZ2VUeXBlLFxyXG4gICAgICAgICAgICBnZXRGaXJzdFRpbGVIZWlnaHQsXHJcbiAgICAgICAgICAgIGdldExldmVsSGVpZ2h0LFxyXG4gICAgICAgICAgICBnZXRUaWxlSGVpZ2h0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdmFyIHNjYWxlID0gMSA8PCBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQ7XHJcbiAgICAgICAgICAgIHRpbGVXaWR0aCA9IE1hdGguY2VpbCh0aWxlV2lkdGggLyBzY2FsZSk7XHJcbiAgICAgICAgICAgIHRpbGVIZWlnaHQgPSBNYXRoLmNlaWwodGlsZUhlaWdodCAvIHNjYWxlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIFt0aWxlV2lkdGgsIHRpbGVIZWlnaHRdO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFRpbGVEaW1lbnNpb25TaXplKFxyXG4gICAgICAgIGVkZ2VUeXBlLCBnZXRGaXJzdFRpbGVTaXplLCBnZXRMZXZlbFNpemUsIGdldE5vbkVkZ2VUaWxlU2l6ZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChlZGdlVHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlIEVER0VfVFlQRV9GSVJTVDpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGdldEZpcnN0VGlsZVNpemUoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSBFREdFX1RZUEVfTEFTVDpcclxuICAgICAgICAgICAgICAgIHZhciBub25FZGdlVGlsZVNpemUgPSBnZXROb25FZGdlVGlsZVNpemUoKTtcclxuICAgICAgICAgICAgICAgIHZhciB3aWR0aFdpdGhvdXRGaXJzdCA9IGdldExldmVsU2l6ZSgpIC0gZ2V0Rmlyc3RUaWxlU2l6ZSgpO1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gd2lkdGhXaXRob3V0Rmlyc3QgJSBub25FZGdlVGlsZVNpemU7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBub25FZGdlVGlsZVNpemU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSBFREdFX1RZUEVfTk9fRURHRTpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGdldE5vbkVkZ2VUaWxlU2l6ZSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ1VuZXhwZWN0ZWQgZWRnZSB0eXBlOiAnICsgZWRnZVR5cGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gaXNFZGdlVGlsZUlkKHRpbGVJZCkge1xyXG4gICAgICAgIHZhciBudW1UaWxlc1ggPSBnZXROdW1UaWxlc1goKTtcclxuICAgICAgICB2YXIgbnVtVGlsZXNZID0gZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVYID0gdGlsZUlkICUgbnVtVGlsZXNYO1xyXG4gICAgICAgIHZhciB0aWxlWSA9IE1hdGguZmxvb3IodGlsZUlkIC8gbnVtVGlsZXNYKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGlsZVkgPiBudW1UaWxlc1kgfHwgdGlsZVggPCAwIHx8IHRpbGVZIDwgMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdUaWxlIGluZGV4ICcgKyB0aWxlSWQgKyAnIGlzIG5vdCBpbiByYW5nZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaG9yaXpvbnRhbEVkZ2UgPVxyXG4gICAgICAgICAgICB0aWxlWCA9PT0gMCA/IEVER0VfVFlQRV9GSVJTVCA6XHJcbiAgICAgICAgICAgIHRpbGVYID09PSAobnVtVGlsZXNYIC0gMSkgPyBFREdFX1RZUEVfTEFTVCA6XHJcbiAgICAgICAgICAgIEVER0VfVFlQRV9OT19FREdFO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB2ZXJ0aWNhbEVkZ2UgPVxyXG4gICAgICAgICAgICB0aWxlWSA9PT0gMCA/IEVER0VfVFlQRV9GSVJTVCA6XHJcbiAgICAgICAgICAgIHRpbGVZID09PSAobnVtVGlsZXNZIC0gMSkgPyBFREdFX1RZUEVfTEFTVCA6XHJcbiAgICAgICAgICAgIEVER0VfVFlQRV9OT19FREdFO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIGhvcml6b250YWxFZGdlVHlwZTogaG9yaXpvbnRhbEVkZ2UsXHJcbiAgICAgICAgICAgIHZlcnRpY2FsRWRnZVR5cGU6IHZlcnRpY2FsRWRnZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0TnVtVGlsZXNYKCkge1xyXG4gICAgICAgIHZhciBudW1UaWxlc1ggPSBNYXRoLmNlaWwocGFyYW1zLmltYWdlV2lkdGggLyBwYXJhbXMudGlsZVdpZHRoKTtcclxuICAgICAgICByZXR1cm4gbnVtVGlsZXNYO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXROdW1UaWxlc1koKSB7XHJcbiAgICAgICAgdmFyIG51bVRpbGVzWSA9IE1hdGguY2VpbChwYXJhbXMuaW1hZ2VIZWlnaHQgLyBwYXJhbXMudGlsZUhlaWdodCk7XHJcbiAgICAgICAgcmV0dXJuIG51bVRpbGVzWTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TGV2ZWxXaWR0aChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpIHtcclxuICAgICAgICBpZiAobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcmFtcy5pbWFnZVdpZHRoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6ZSA9IGdldFNpemVPZlBhcnQoe1xyXG4gICAgICAgICAgICBtaW5YOiAwLFxyXG4gICAgICAgICAgICBtYXhYRXhjbHVzaXZlOiBwYXJhbXMuaW1hZ2VXaWR0aCxcclxuICAgICAgICAgICAgbWluWTogMCxcclxuICAgICAgICAgICAgbWF4WUV4Y2x1c2l2ZTogcGFyYW1zLmltYWdlSGVpZ2h0LFxyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQ6IG51bVJlc29sdXRpb25MZXZlbHNUb0N1dFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gc2l6ZS53aWR0aDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TGV2ZWxIZWlnaHQobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KSB7XHJcbiAgICAgICAgaWYgKG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJhbXMuaW1hZ2VIZWlnaHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaXplID0gZ2V0U2l6ZU9mUGFydCh7XHJcbiAgICAgICAgICAgIG1pblg6IDAsXHJcbiAgICAgICAgICAgIG1heFhFeGNsdXNpdmU6IHBhcmFtcy5pbWFnZVdpZHRoLFxyXG4gICAgICAgICAgICBtaW5ZOiAwLFxyXG4gICAgICAgICAgICBtYXhZRXhjbHVzaXZlOiBwYXJhbXMuaW1hZ2VIZWlnaHQsXHJcbiAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dDogbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBzaXplLmhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRUaWxlV2lkdGgobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KSB7XHJcbiAgICAgICAgaWYgKG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJhbXMudGlsZVdpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHZhciBzY2FsZSA9IDEgPDwgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0O1xyXG4gICAgICAgIHZhciB3aWR0aCA9IE1hdGguY2VpbChwYXJhbXMudGlsZVdpZHRoIC8gc2NhbGUpO1xyXG4gICAgICAgIHJldHVybiB3aWR0aDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0VGlsZUhlaWdodChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpIHtcclxuICAgICAgICBpZiAobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcmFtcy50aWxlSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHZhciBzY2FsZSA9IDEgPDwgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0O1xyXG4gICAgICAgIHZhciBoZWlnaHQgPSBNYXRoLmNlaWwocGFyYW1zLnRpbGVIZWlnaHQgLyBzY2FsZSk7XHJcbiAgICAgICAgcmV0dXJuIGhlaWdodDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Rmlyc3RUaWxlT2Zmc2V0WCgpIHtcclxuICAgICAgICByZXR1cm4gcGFyYW1zLmZpcnN0VGlsZU9mZnNldFg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldEZpcnN0VGlsZU9mZnNldFkoKSB7XHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5maXJzdFRpbGVPZmZzZXRZO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldEZpcnN0VGlsZVdpZHRoKG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgIHZhciBmaXJzdFRpbGVXaWR0aEJlc3RMZXZlbCA9XHJcbiAgICAgICAgICAgIGdldFRpbGVXaWR0aCgpIC0gZ2V0Rmlyc3RUaWxlT2Zmc2V0WCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpbWFnZVdpZHRoID0gZ2V0TGV2ZWxXaWR0aCgpO1xyXG4gICAgICAgIGlmIChmaXJzdFRpbGVXaWR0aEJlc3RMZXZlbCA+IGltYWdlV2lkdGgpIHtcclxuICAgICAgICAgICAgZmlyc3RUaWxlV2lkdGhCZXN0TGV2ZWwgPSBpbWFnZVdpZHRoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2NhbGUgPSAxIDw8IG51bVJlc29sdXRpb25MZXZlbHNUb0N1dDtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlV2lkdGggPSBNYXRoLmNlaWwoZmlyc3RUaWxlV2lkdGhCZXN0TGV2ZWwgLyBzY2FsZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGZpcnN0VGlsZVdpZHRoO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRGaXJzdFRpbGVIZWlnaHQobnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KSB7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZUhlaWdodEJlc3RMZXZlbCA9XHJcbiAgICAgICAgICAgIGdldFRpbGVIZWlnaHQoKSAtIGdldEZpcnN0VGlsZU9mZnNldFkoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW1hZ2VIZWlnaHQgPSBnZXRMZXZlbEhlaWdodCgpO1xyXG4gICAgICAgIGlmIChmaXJzdFRpbGVIZWlnaHRCZXN0TGV2ZWwgPiBpbWFnZUhlaWdodCkge1xyXG4gICAgICAgICAgICBmaXJzdFRpbGVIZWlnaHRCZXN0TGV2ZWwgPSBpbWFnZUhlaWdodDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNjYWxlID0gMSA8PCBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQ7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZUhlaWdodCA9IE1hdGguY2VpbChmaXJzdFRpbGVIZWlnaHRCZXN0TGV2ZWwgLyBzY2FsZSk7XHJcblxyXG4gICAgICAgIHJldHVybiBmaXJzdFRpbGVIZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuSnBpcEZldGNoSGFuZGxlID0gSnBpcEZldGNoSGFuZGxlO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxuZnVuY3Rpb24gSnBpcEZldGNoSGFuZGxlKHJlcXVlc3RlciwgaW1hZ2VEYXRhQ29udGV4dCwgZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSkge1xyXG4gICAgdGhpcy5fcmVxdWVzdGVyID0gcmVxdWVzdGVyO1xyXG4gICAgdGhpcy5faW1hZ2VEYXRhQ29udGV4dCA9IGltYWdlRGF0YUNvbnRleHQ7XHJcbiAgICB0aGlzLl9zZXJ2ZXJSZXF1ZXN0ID0gbnVsbDtcclxuICAgIHRoaXMuX2RlZGljYXRlZENoYW5uZWxIYW5kbGUgPSBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlO1xyXG4gICAgdGhpcy5faXNGYWlsdXJlID0gZmFsc2U7XHJcbiAgICB0aGlzLl9pc01vdmVkID0gZmFsc2U7XHJcbiAgICB0aGlzLl9yZXF1ZXN0ZXJDYWxsYmFja09uQWxsRGF0YVJlY2lldmVkQm91bmQgPSB0aGlzLl9yZXF1ZXN0ZXJDYWxsYmFja09uQWxsRGF0YVJlY2lldmVkLmJpbmQodGhpcyk7XHJcbiAgICB0aGlzLl9yZXF1ZXN0ZXJDYWxsYmFja09uRmFpbHVyZUJvdW5kID0gdGhpcy5fcmVxdWVzdGVyQ2FsbGJhY2tPbkZhaWx1cmUuYmluZCh0aGlzKTtcclxufVxyXG5cclxuSnBpcEZldGNoSGFuZGxlLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbiByZXN1bWUoKSB7XHJcbiAgICBpZiAodGhpcy5fc2VydmVyUmVxdWVzdCAhPT0gbnVsbCkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ2Fubm90IHJlc3VtZSBhbHJlYWR5LWFjdGl2ZS1mZXRjaCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0Rpc3Bvc2VkKCkpIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0Nhbm5vdCBmZXRjaCBkYXRhIHdpdGggZGlzcG9zZWQgaW1hZ2VEYXRhQ29udGV4dCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ2Fubm90IHJlc3VtZSBtb3ZhYmxlIGZldGNoOyBTaG91bGQgc3RhcnQgYSBuZXcgZmV0Y2ggd2l0aCBzYW1lJyArXHJcbiAgICAgICAgICAgICcgZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSBpbnN0ZWFkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pbWFnZURhdGFDb250ZXh0LmlzRG9uZSgpKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgbnVtUXVhbGl0eUxheWVyc1RvV2FpdCA9IHRoaXMuX2ltYWdlRGF0YUNvbnRleHQuZ2V0TmV4dFF1YWxpdHlMYXllcigpO1xyXG4gICAgICAgIFxyXG4gICAgdGhpcy5fc2VydmVyUmVxdWVzdCA9IHRoaXMuX3JlcXVlc3Rlci5yZXF1ZXN0RGF0YShcclxuICAgICAgICB0aGlzLl9pbWFnZURhdGFDb250ZXh0LmdldENvZGVzdHJlYW1QYXJ0UGFyYW1zKCksXHJcbiAgICAgICAgdGhpcy5fcmVxdWVzdGVyQ2FsbGJhY2tPbkFsbERhdGFSZWNpZXZlZEJvdW5kLFxyXG4gICAgICAgIHRoaXMuX3JlcXVlc3RlckNhbGxiYWNrT25GYWlsdXJlQm91bmQsXHJcbiAgICAgICAgbnVtUXVhbGl0eUxheWVyc1RvV2FpdCxcclxuICAgICAgICB0aGlzLl9kZWRpY2F0ZWRDaGFubmVsSGFuZGxlKTtcclxufTtcclxuXHJcbkpwaXBGZXRjaEhhbmRsZS5wcm90b3R5cGUuc3RvcEFzeW5jID0gZnVuY3Rpb24gc3RvcEFzeW5jKCkge1xyXG4gICAgaWYgKHRoaXMuX3NlcnZlclJlcXVlc3QgPT09IG51bGwpIHtcclxuICAgICAgICBpZiAodGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0Rpc3Bvc2VkKCkgfHwgdGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0RvbmUoKSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ2Fubm90IHN0b3AgYWxyZWFkeSBzdG9wcGVkIGZldGNoJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9kZWRpY2F0ZWRDaGFubmVsSGFuZGxlKSB7XHJcbiAgICAgICAgdGhpcy5faXNNb3ZlZCA9IHRydWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuX3JlcXVlc3Rlci5zdG9wUmVxdWVzdEFzeW5jKHRoaXMuX3NlcnZlclJlcXVlc3QpO1xyXG4gICAgICAgIHRoaXMuX3NlcnZlclJlcXVlc3QgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgLy8gTk9URTogU2VuZCBhIHN0b3AgcmVxdWVzdCB3aXRoaW4gSnBpcFJlcXVlc3QgYW5kIHJlc29sdmUgdGhlIFByb21pc2VcclxuICAgICAgICAvLyBvbmx5IGFmdGVyIHNlcnZlciByZXNwb25zZSAoVGhpcyBpcyBvbmx5IHBlcmZvcm1hbmNlIGlzc3VlLCBub1xyXG4gICAgICAgIC8vIGZ1bmN0aW9uYWwgcHJvYmxlbTogYSBuZXcgZmV0Y2ggd2lsbCB0cmlnZ2VyIGEgSlBJUCByZXF1ZXN0IHdpdGhcclxuICAgICAgICAvLyB3YWl0PW5vLCBhbmQgdGhlIG9sZCByZXF1ZXN0IHdpbGwgYmUgYWN0dWFsbHkgc3RvcHBlZCkuXHJcbiAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5KcGlwRmV0Y2hIYW5kbGUucHJvdG90eXBlLl9yZXF1ZXN0ZXJDYWxsYmFja09uQWxsRGF0YVJlY2lldmVkID1cclxuICAgIGZ1bmN0aW9uIHJlcXVlc3RlckNhbGxiYWNrT25BbGxEYXRhUmVjaWV2ZWQocmVxdWVzdCwgaXNSZXNwb25zZURvbmUpIHtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2lzTW92ZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0RhdGEgY2FsbGJhY2sgdG8gYW4gb2xkIGZldGNoIHdoaWNoIGhhcyBiZWVuIGFscmVhZHkgbW92ZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGlzUmVzcG9uc2VEb25lICYmXHJcbiAgICAgICAgIXRoaXMuX2ltYWdlRGF0YUNvbnRleHQuaXNEaXNwb3NlZCgpICYmXHJcbiAgICAgICAgIXRoaXMuX2ltYWdlRGF0YUNvbnRleHQuaXNEb25lKCkpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnSlBJUCBzZXJ2ZXIgbm90IHJldHVybmVkIGFsbCBkYXRhJywgJ0QuMycpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuSnBpcEZldGNoSGFuZGxlLnByb3RvdHlwZS5fcmVxdWVzdGVyQ2FsbGJhY2tPbkZhaWx1cmUgPVxyXG4gICAgZnVuY3Rpb24gcmVxdWVzdGVyQ2FsbGJhY2tPbkZhaWx1cmUoKSB7XHJcbiAgICAgICAgXHJcbiAgICAvL3VwZGF0ZVN0YXR1cyhTVEFUVVNfRU5ERUQsICdlbmRBc3luYygpJyk7XHJcbiAgICBcclxuICAgIC8vaWYgKGZhaWx1cmVDYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAvLyAgICBmYWlsdXJlQ2FsbGJhY2soc2VsZiwgdXNlckNvbnRleHRWYXJzKTtcclxuICAgIC8vfSBlbHNlIHtcclxuICAgIC8vICAgIGlzRmFpbHVyZSA9IHRydWU7XHJcbiAgICAvL31cclxuICAgIHRoaXMuX2lzRmFpbHVyZSA9IHRydWU7XHJcblxyXG4gICAgaWYgKHRoaXMuX2lzTW92ZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0ZhaWx1cmUgY2FsbGJhY2sgdG8gYW4gb2xkIGZldGNoIHdoaWNoIGhhcyBiZWVuIGFscmVhZHkgbW92ZWQnKTtcclxuICAgIH1cclxufTsiLCJ2YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwSW1hZ2VEYXRhQ29udGV4dCA9IEpwaXBJbWFnZURhdGFDb250ZXh0O1xyXG5cclxuZnVuY3Rpb24gSnBpcEltYWdlRGF0YUNvbnRleHQoanBpcE9iamVjdHMsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBwcm9ncmVzc2l2ZW5lc3MpIHtcclxuICAgIHRoaXMuX2NvZGVzdHJlYW1QYXJ0UGFyYW1zID0gY29kZXN0cmVhbVBhcnRQYXJhbXM7XHJcbiAgICB0aGlzLl9wcm9ncmVzc2l2ZW5lc3MgICAgICA9IHByb2dyZXNzaXZlbmVzcztcclxuICAgIHRoaXMuX3JlY29uc3RydWN0b3IgICAgICAgID0ganBpcE9iamVjdHMucmVjb25zdHJ1Y3RvcjtcclxuICAgIHRoaXMuX3BhY2tldHNEYXRhQ29sbGVjdG9yID0ganBpcE9iamVjdHMucGFja2V0c0RhdGFDb2xsZWN0b3I7XHJcbiAgICB0aGlzLl9xdWFsaXR5TGF5ZXJzQ2FjaGUgICA9IGpwaXBPYmplY3RzLnF1YWxpdHlMYXllcnNDYWNoZTtcclxuICAgIHRoaXMuX2NvZGVzdHJlYW1TdHJ1Y3R1cmUgID0ganBpcE9iamVjdHMuY29kZXN0cmVhbVN0cnVjdHVyZTtcclxuICAgIHRoaXMuX2RhdGFiaW5zU2F2ZXIgICAgICAgID0ganBpcE9iamVjdHMuZGF0YWJpbnNTYXZlcjtcclxuICAgIHRoaXMuX2pwaXBGYWN0b3J5ICAgICAgICAgID0ganBpcE9iamVjdHMuanBpcEZhY3Rvcnk7XHJcblxyXG4gICAgdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9IDA7XHJcbiAgICB0aGlzLl9xdWFsaXR5TGF5ZXJzUmVhY2hlZCA9IDA7XHJcbiAgICBcclxuICAgIHRoaXMuX2xpc3RlbmVyID0ganBpcEZhY3RvcnkuY3JlYXRlUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgdGhpcy5fcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrLmJpbmQodGhpcyksXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZSk7XHJcbiAgICBcclxuICAgIHRoaXMuX3RyeUFkdmFuY2VQcm9ncmVzc2l2ZVN0YWdlKCk7XHJcbn1cclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5oYXNEYXRhID0gZnVuY3Rpb24gaGFzRGF0YSgpIHtcclxuICAgIC8vZW5zdXJlTm9GYWlsdXJlKCk7XHJcbiAgICB0aGlzLl9lbnN1cmVOb3REaXNwb3NlZCgpO1xyXG4gICAgcmV0dXJuIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWQgPiAwO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmdldEZldGNoZWREYXRhID0gZnVuY3Rpb24gZ2V0RmV0Y2hlZERhdGEobWF4TnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIGlmICghdGhpcy5oYXNEYXRhKCkpIHtcclxuICAgICAgICB0aHJvdyAnSnBpcEltYWdlRGF0YUNvbnRleHQgZXJyb3I6IGNhbm5vdCBjYWxsIGdldEZldGNoZWREYXRhIGJlZm9yZSBoYXNEYXRhID0gdHJ1ZSc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGVuc3VyZU5vRmFpbHVyZSgpO1xyXG4gICAgdmFyIHBhcmFtcyA9IHRoaXMuX2dldFBhcmFtc0ZvckRhdGFXcml0ZXIobWF4TnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICB2YXIgY29kZWJsb2NrcyA9IHRoaXMuX3BhY2tldHNEYXRhQ29sbGVjdG9yLmdldEFsbENvZGVibG9ja3NEYXRhKFxyXG4gICAgICAgIHBhcmFtcy5jb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICBwYXJhbXMubWluTnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICBcclxuICAgIHZhciBoZWFkZXJzQ29kZXN0cmVhbSA9IHRoaXMuX3JlY29uc3RydWN0b3IuY3JlYXRlQ29kZXN0cmVhbUZvclJlZ2lvbihcclxuICAgICAgICBwYXJhbXMuY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgcGFyYW1zLm1pbk51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgLyppc09ubHlIZWFkZXJzV2l0aG91dEJpdHN0cmVhbT0qL3RydWUpO1xyXG4gICAgXHJcbiAgICBpZiAoY29kZWJsb2Nrcy5jb2RlYmxvY2tzRGF0YSA9PT0gbnVsbCkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ291bGQgbm90IGNvbGxlY3QgY29kZWJsb2NrcyBhbHRob3VnaCBwcm9ncmVzc2l2ZW5lc3MgJyArXHJcbiAgICAgICAgICAgICdzdGFnZSBoYXMgYmVlbiByZWFjaGVkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChjb2Rlc3RyZWFtID09PSBudWxsKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICdDb3VsZCBub3QgcmVjb25zdHJ1Y3QgY29kZXN0cmVhbSBhbHRob3VnaCAnICtcclxuICAgICAgICAgICAgJ3Byb2dyZXNzaXZlbmVzcyBzdGFnZSBoYXMgYmVlbiByZWFjaGVkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vYWxyZWFkeVJldHVybmVkQ29kZWJsb2NrcyA9IGNvZGVibG9ja3MuYWxyZWFkeVJldHVybmVkQ29kZWJsb2NrcztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgaGVhZGVyc0NvZGVzdHJlYW06IGhlYWRlcnNDb2Rlc3RyZWFtLFxyXG4gICAgICAgIGNvZGVibG9ja3NEYXRhOiBjb2RlYmxvY2tzLmNvZGVibG9ja3NEYXRhLFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zOiBjb2Rlc3RyZWFtUGFydFBhcmFtc1xyXG4gICAgfTtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5nZXRGZXRjaGVkRGF0YUFzQ29kZXN0cmVhbSA9IGZ1bmN0aW9uIGdldEZldGNoZWREYXRhQXNDb2Rlc3RyZWFtKG1heE51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgIHRoaXMuX2Vuc3VyZU5vdERpc3Bvc2VkKCk7XHJcbiAgICAvL2Vuc3VyZU5vRmFpbHVyZSgpO1xyXG4gICAgXHJcbiAgICB2YXIgcGFyYW1zID0gdGhpcy5fZ2V0UGFyYW1zRm9yRGF0YVdyaXRlcihtYXhOdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgIFxyXG4gICAgdmFyIGNvZGVzdHJlYW0gPSB0aGlzLl9yZWNvbnN0cnVjdG9yLmNyZWF0ZUNvZGVzdHJlYW1Gb3JSZWdpb24oXHJcbiAgICAgICAgcGFyYW1zLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIHBhcmFtcy5taW5OdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgIFxyXG4gICAgaWYgKGNvZGVzdHJlYW0gPT09IG51bGwpIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0NvdWxkIG5vdCByZWNvbnN0cnVjdCBjb2Rlc3RyZWFtIGFsdGhvdWdoICcgK1xyXG4gICAgICAgICAgICAncHJvZ3Jlc3NpdmVuZXNzIHN0YWdlIGhhcyBiZWVuIHJlYWNoZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIGNvZGVzdHJlYW07XHJcbn07XHJcblxyXG5KcGlwSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUub24gPSBmdW5jdGlvbiBvbihldmVudCwgbGlzdGVuZXIpIHtcclxuICAgIHRoaXMuX2Vuc3VyZU5vdERpc3Bvc2VkKCk7XHJcbiAgICBpZiAoZXZlbnQgIT09ICdkYXRhJykge1xyXG4gICAgICAgIHRocm93ICdKcGlwSW1hZ2VEYXRhQ29udGV4dCBlcnJvcjogVW5leHBlY3RlZCBldmVudCAnICsgZXZlbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XHJcbn07XHJcblxyXG5KcGlwSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuaXNEb25lID0gZnVuY3Rpb24gaXNEb25lKCkge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIHJldHVybiB0aGlzLl9pc1JlcXVlc3REb25lO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmRpc3Bvc2UgPSBmdW5jdGlvbiBkaXNwb3NlKCkge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIHRoaXMuX2xpc3RlbmVyLnVucmVnaXN0ZXIoKTtcclxuICAgIHRoaXMuX2xpc3RlbmVyID0gbnVsbDtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5zZXRJc1Byb2dyZXNzaXZlID0gZnVuY3Rpb24gc2V0SXNQcm9ncmVzc2l2ZShpc1Byb2dyZXNzaXZlKSB7XHJcbiAgICB0aGlzLl9lbnN1cmVOb3REaXNwb3NlZCgpO1xyXG4gICAgdmFyIG9sZElzUHJvZ3Jlc3NpdmUgPSB0aGlzLl9pc1Byb2dyZXNzaXZlO1xyXG4gICAgdGhpcy5faXNQcm9ncmVzc2l2ZSA9IGlzUHJvZ3Jlc3NpdmU7XHJcbiAgICBpZiAoIW9sZElzUHJvZ3Jlc3NpdmUgJiYgaXNQcm9ncmVzc2l2ZSAmJiB0aGlzLmhhc0RhdGEoKSkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fZGF0YUxpc3RlbmVycy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB0aGlzLl9kYXRhTGlzdGVuZXJzW2ldKHRoaXMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcbi8vIE1ldGhvZHMgZm9yIEpwaXBGZXRjaEhhbmRsZVxyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmlzRGlzcG9zZWQgPSBmdW5jdGlvbiBpc0Rpc3Bvc2VkKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2xpc3RlbmVyICE9PSBudWxsO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmdldENvZGVzdHJlYW1QYXJ0UGFyYW1zID1cclxuICAgIGZ1bmN0aW9uIGdldENvZGVzdHJlYW1QYXJ0UGFyYW1zKCkge1xyXG4gICAgICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuX2NvZGVzdHJlYW1QYXJ0UGFyYW1zO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmdldE5leHRRdWFsaXR5TGF5ZXIgPVxyXG4gICAgZnVuY3Rpb24gZ2V0TmV4dFF1YWxpdHlMYXllcigpIHtcclxuICAgICAgICBcclxuICAgIHJldHVybiB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZF0ubWluTnVtUXVhbGl0eUxheWVycztcclxufTtcclxuXHJcbi8vIFByaXZhdGUgbWV0aG9kc1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl90cnlBZHZhbmNlUHJvZ3Jlc3NpdmVTdGFnZSA9IGZ1bmN0aW9uIHRyeUFkdmFuY2VQcm9ncmVzc2l2ZVN0YWdlKCkge1xyXG4gICAgdmFyIG51bVF1YWxpdHlMYXllcnNUb1dhaXQgPSB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbXHJcbiAgICAgICAgdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZF0ubWluTnVtUXVhbGl0eUxheWVycztcclxuXHJcbiAgICBpZiAodGhpcy5fcXVhbGl0eUxheWVyc1JlYWNoZWQgPCBudW1RdWFsaXR5TGF5ZXJzVG9XYWl0KSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fcXVhbGl0eUxheWVyc1JlYWNoZWQgPT09ICdtYXgnKSB7XHJcbiAgICAgICAgdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9IHRoaXMuX3Byb2dyZXNzaXZlbmVzcy5sZW5ndGg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHdoaWxlICh0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkIDwgdGhpcy5fcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCkge1xyXG4gICAgICAgIHZhciBxdWFsaXR5TGF5ZXJzUmVxdWlyZWQgPSB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbXHJcbiAgICAgICAgICAgIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWRdLm1pbk51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHF1YWxpdHlMYXllcnNSZXF1aXJlZCA9PT0gJ21heCcgfHxcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyc1JlcXVpcmVkID4gdGhpcy5fcXVhbGl0eUxheWVyc1JlYWNoZWQpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICArK3RoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2lzUmVxdWVzdERvbmUgPSB0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkID09PSBwcm9ncmVzc2l2ZW5lc3MubGVuZ3RoO1xyXG5cclxuICAgIHJldHVybiB0cnVlO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl9xdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2sgPSBmdW5jdGlvbiBxdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2socXVhbGl0eUxheWVyc1JlYWNoZWQpIHtcclxuICAgIHRoaXMuX3F1YWxpdHlMYXllcnNSZWFjaGVkID0gcXVhbGl0eUxheWVyc1JlYWNoZWQ7XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pc1JlcXVlc3REb25lKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICdSZXF1ZXN0IGFscmVhZHkgZG9uZSBidXQgY2FsbGJhY2sgaXMgY2FsbGVkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdGhpcy5fdHJ5QWR2YW5jZVByb2dyZXNzaXZlU3RhZ2UoKSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLl9pc1Byb2dyZXNzaXZlICYmICF0aGlzLl9pc1JlcXVlc3REb25lKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX2RhdGFMaXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICB0aGlzLl9kYXRhTGlzdGVuZXJzW2ldKHRoaXMpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl9nZXRQYXJhbXNGb3JEYXRhV3JpdGVyID0gZnVuY3Rpb24gZ2V0UGFyYW1zRm9yRGF0YVdyaXRlcihtYXhOdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAvL2Vuc3VyZU5vdEVuZGVkKHN0YXR1cywgLyphbGxvd1pvbWJpZT0qL3RydWUpO1xyXG4gICAgXHJcbiAgICAvL2lmIChjb2Rlc3RyZWFtUGFydFBhcmFtcyA9PT0gbnVsbCkge1xyXG4gICAgLy8gICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludmFsaWRPcGVyYXRpb25FeGNlcHRpb24oJ0Nhbm5vdCAnICtcclxuICAgIC8vICAgICAgICAnZ2V0IGRhdGEgb2Ygem9tYmllIHJlcXVlc3Qgd2l0aCBubyBjb2Rlc3RyZWFtUGFydFBhcmFtcycpO1xyXG4gICAgLy99XHJcbiAgICBcclxuICAgIC8vdmFyIGlzUmVxdWVzdERvbmUgPSBwcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkID09PSBwcm9ncmVzc2l2ZW5lc3MubGVuZ3RoO1xyXG4gICAgLy9pZiAoIWlzUmVxdWVzdERvbmUpIHtcclxuICAgIC8vICAgIGVuc3VyZU5vdFdhaXRpbmdGb3JVc2VySW5wdXQoc3RhdHVzKTtcclxuICAgIC8vfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ2Fubm90IGNyZWF0ZSBjb2Rlc3RyZWFtIGJlZm9yZSBmaXJzdCBwcm9ncmVzc2l2ZW5lc3MgJyArXHJcbiAgICAgICAgICAgICdzdGFnZSBoYXMgYmVlbiByZWFjaGVkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBtaW5OdW1RdWFsaXR5TGF5ZXJzID1cclxuICAgICAgICB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCAtIDFdLm1pbk51bVF1YWxpdHlMYXllcnM7XHJcbiAgICBcclxuICAgIHZhciBuZXdQYXJhbXMgPSB0aGlzLl9jb2Rlc3RyZWFtUGFydFBhcmFtcztcclxuICAgIGlmIChtYXhOdW1RdWFsaXR5TGF5ZXJzICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBuZXdQYXJhbXMgPSBPYmplY3QuY3JlYXRlKHRoaXMuX2NvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBuZXdQYXJhbXMubWF4TnVtUXVhbGl0eUxheWVycyA9IG1heE51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnMgIT09ICdtYXgnKSB7XHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMsIG1heE51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtczogbmV3UGFyYW1zLFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnM6IG1pbk51bVF1YWxpdHlMYXllcnNcclxuICAgICAgICB9O1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl9lbnN1cmVOb3REaXNwb3NlZCA9IGZ1bmN0aW9uIGVuc3VyZU5vdERpc3Bvc2VkKCkge1xyXG4gICAgaWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oJ0Nhbm5vdCB1c2UgSW1hZ2VEYXRhQ29udGV4dCBhZnRlciBkaXNwb3NlZCcpO1xyXG4gICAgfVxyXG59O1xyXG4iLCJ2YXIgSnBpcENvZGVzdHJlYW1DbGllbnQgPSByZXF1aXJlKCdqcGlwLWNvZGVzdHJlYW0tY2xpZW50LmpzJykuSnBpcENvZGVzdHJlYW1DbGllbnQ7XHJcbnZhciBQZGZqc0pweERlY29kZXIgPSByZXF1aXJlKCdwZGZqcy1qcHgtZGVjb2Rlci5qcycpLlBkZmpzSnB4RGVjb2RlcjtcclxudmFyIEpwaXBDb2Rlc3RyZWFtU2l6ZXNDYWxjdWxhdG9yID0gcmVxdWlyZSgnanBpcC1jb2Rlc3RyZWFtLXNpemVzLWNhbGN1bGF0b3IuanMnKS5KcGlwQ29kZXN0cmVhbVNpemVzQ2FsY3VsYXRvcjtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBJbWFnZUltcGxlbWVudGF0aW9uID0ge1xyXG5cdGNyZWF0ZUZldGNoZXI6IGZ1bmN0aW9uIGNyZWF0ZUZldGNoZXIodXJsKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICB2YXIgY29kZXN0cmVhbUNsaWVudCA9IG5ldyBKcGlwQ29kZXN0cmVhbUNsaWVudCgpO1xyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtQ2xpZW50LnNldFN0YXR1c0NhbGxiYWNrKGZ1bmN0aW9uKHN0YXR1cykge1xyXG4gICAgICAgICAgICAgICAgaWYgKHN0YXR1cy5pc1JlYWR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZldGNoZXI6IGNvZGVzdHJlYW1DbGllbnQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemVzUGFyYW1zOiBmZXRjaGVyLmdldFNpemVzUGFyYW1zKClcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdHVzLmV4Y2VwdGlvbikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1DbGllbnQuc2V0U3RhdHVzQ2FsbGJhY2sobnVsbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KHN0YXR1cy5leGNlcHRpb24pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY29kZXN0cmVhbUNsaWVudC5vcGVuKHVybCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVQaXhlbHNEZWNvZGVyOiBmdW5jdGlvbiBjcmVhdGVQaXhlbHNEZWNvZGVyKCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgUGRmanNKcHhEZWNvZGVyKCk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVJbWFnZVBhcmFtc1JldHJpZXZlcjogZnVuY3Rpb24gY3JlYXRlSW1hZ2VQYXJhbXNSZXRyaWV2ZXIoaW1hZ2VQYXJhbXMpIHtcclxuXHRcdHJldHVybiBuZXcgSnBpcENvZGVzdHJlYW1TaXplc0NhbGN1bGF0b3IoaW1hZ2VQYXJhbXMpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgZ2V0U2NyaXB0c1RvSW1wb3J0OiBmdW5jdGlvbiBnZXRTY3JpcHRzVG9JbXBvcnQoKSB7XHJcbiAgICAgICAgdmFyIGVycm9yV2l0aFN0YWNrVHJhY2UgPSBuZXcgRXJyb3IoKTtcclxuICAgICAgICB2YXIgc3RhY2sgPSBlcnJvcldpdGhTdGFja1RyYWNlLnN0YWNrLnRyaW0oKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY3VycmVudFN0YWNrRnJhbWVSZWdleCA9IC9hdCAofFteIF0rIFxcKCkoW14gXSspOlxcZCs6XFxkKy87XHJcbiAgICAgICAgdmFyIHNvdXJjZSA9IGN1cnJlbnRTdGFja0ZyYW1lUmVnZXguZXhlYyhzdGFjayk7XHJcbiAgICAgICAgaWYgKHNvdXJjZSAmJiBzb3VyY2VbMl0gIT09IFwiXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtzb3VyY2VbMl1dO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGxhc3RTdGFja0ZyYW1lUmVnZXggPSBuZXcgUmVnRXhwKC8uK1xcLyguKj8pOlxcZCsoOlxcZCspKiQvKTtcclxuICAgICAgICBzb3VyY2UgPSBsYXN0U3RhY2tGcmFtZVJlZ2V4LmV4ZWMoc3RhY2spO1xyXG4gICAgICAgIGlmIChzb3VyY2UgJiYgc291cmNlWzFdICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbc291cmNlWzFdXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGVycm9yV2l0aFN0YWNrVHJhY2UuZmlsZU5hbWUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gW2Vycm9yV2l0aFN0YWNrVHJhY2UuZmlsZU5hbWVdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aHJvdyAnSnBpcEltYWdlSW1wbGVtZW50YXRpb246IENvdWxkIG5vdCBnZXQgY3VycmVudCBzY3JpcHQgVVJMJztcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5QZGZqc0pweERlY29kZXIgPSBQZGZqc0pweERlY29kZXI7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5mdW5jdGlvbiBQZGZqc0pweERlY29kZXIoKSB7XHJcbiAgICB0aGlzLl9pbWFnZSA9IG5ldyBKcHhJbWFnZSgpO1xyXG59XHJcblxyXG5QZGZqc0pweERlY29kZXIucHJvdG90eXBlLmRlY29kZSA9IGZ1bmN0aW9uIGRlY29kZShkYXRhKSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgdmFyIHJlZ2lvblRvUGFyc2UgPSB7XHJcbiAgICAgICAgICAgIGxlZnQgIDogZGF0YS5oZWFkZXJzQ29kZXN0cmVhbS5vZmZzZXRYLFxyXG4gICAgICAgICAgICB0b3AgICA6IGRhdGEuaGVhZGVyc0NvZGVzdHJlYW0ub2Zmc2V0WSxcclxuICAgICAgICAgICAgcmlnaHQgOiBkYXRhLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUgLSBkYXRhLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblgsXHJcbiAgICAgICAgICAgIGJvdHRvbTogZGF0YS5jb2Rlc3RyZWFtUGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlIC0gZGF0YS5jb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5ZXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY3VycmVudENvbnRleHQgPSB0aGlzLl9pbWFnZS5wYXJzZUNvZGVzdHJlYW0oXHJcbiAgICAgICAgICAgIGRhdGEuaGVhZGVyc0NvZGVzdHJlYW0uY29kZXN0cmVhbSxcclxuICAgICAgICAgICAgMCxcclxuICAgICAgICAgICAgZGF0YS5oZWFkZXJzQ29kZXN0cmVhbS5jb2Rlc3RyZWFtLmxlbmd0aCxcclxuICAgICAgICAgICAgeyBpc09ubHlQYXJzZUhlYWRlcnM6IHRydWUgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5faW1hZ2UuYWRkUGFja2V0c0RhdGEoY3VycmVudENvbnRleHQsIGRhdGEuY29kZWJsb2Nrc0RhdGEpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuX2ltYWdlLmRlY29kZShjdXJyZW50Q29udGV4dCwgeyByZWdpb25Ub1BhcnNlOiByZWdpb25Ub1BhcnNlIH0pO1xyXG5cclxuICAgICAgICB2YXIgcmVzdWx0ID0gdGhpcy5fY29weVRpbGVzUGl4ZWxzVG9PbmVQaXhlbHNBcnJheSh0aGlzLl9pbWFnZS50aWxlcywgcmVnaW9uVG9QYXJzZSwgdGhpcy5faW1hZ2UuY29tcG9uZW50c0NvdW50KTtcclxuICAgICAgICByZXNvbHZlKHJlc3VsdCk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcblBkZmpzSnB4RGVjb2Rlci5wcm90b3R5cGUuX2NvcHlUaWxlc1BpeGVsc1RvT25lUGl4ZWxzQXJyYXkgPVxyXG4gICAgZnVuY3Rpb24gY29weVRpbGVzUGl4ZWxzVG9PbmVQaXhlbHNBcnJheSh0aWxlcywgcmVzdWx0UmVnaW9uLCBjb21wb25lbnRzQ291bnQpIHtcclxuICAgICAgICBcclxuICAgIHZhciBmaXJzdFRpbGUgPSB0aWxlc1swXTtcclxuICAgIHZhciB3aWR0aCA9IHJlc3VsdFJlZ2lvbi5yaWdodCAtIHJlc3VsdFJlZ2lvbi5sZWZ0O1xyXG4gICAgdmFyIGhlaWdodCA9IHJlc3VsdFJlZ2lvbi5ib3R0b20gLSByZXN1bHRSZWdpb24udG9wO1xyXG4gICAgXHJcbiAgICAvL2lmIChmaXJzdFRpbGUubGVmdCA9PT0gcmVzdWx0UmVnaW9uLmxlZnQgJiZcclxuICAgIC8vICAgIGZpcnN0VGlsZS50b3AgPT09IHJlc3VsdFJlZ2lvbi50b3AgJiZcclxuICAgIC8vICAgIGZpcnN0VGlsZS53aWR0aCA9PT0gd2lkdGggJiZcclxuICAgIC8vICAgIGZpcnN0VGlsZS5oZWlnaHQgPT09IGhlaWdodCAmJlxyXG4gICAgLy8gICAgY29tcG9uZW50c0NvdW50ID09PSA0KSB7XHJcbiAgICAvLyAgICBcclxuICAgIC8vICAgIHJldHVybiBmaXJzdFRpbGU7XHJcbiAgICAvL31cclxuICAgIFxyXG4gICAgdmFyIHJlc3VsdCA9IG5ldyBJbWFnZURhdGEod2lkdGgsIGhlaWdodCk7XHJcbiAgICAgIFxyXG4gICAgdmFyIGJ5dGVzUGVyUGl4ZWwgPSA0O1xyXG4gICAgdmFyIHJnYmFJbWFnZVN0cmlkZSA9IHdpZHRoICogYnl0ZXNQZXJQaXhlbDtcclxuICAgIFxyXG4gICAgdmFyIHRpbGVJbmRleCA9IDA7XHJcbiAgICBcclxuICAgIC8vZm9yICh2YXIgeCA9IDA7IHggPCBudW1UaWxlc1g7ICsreCkge1xyXG5cclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGlsZXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICB2YXIgdGlsZVJpZ2h0ID0gdGlsZXNbaV0ubGVmdCArIHRpbGVzW2ldLndpZHRoO1xyXG4gICAgICAgIHZhciB0aWxlQm90dG9tID0gdGlsZXNbaV0udG9wICsgdGlsZXNbaV0uaGVpZ2h0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25MZWZ0ID0gTWF0aC5tYXgocmVzdWx0UmVnaW9uLmxlZnQsIHRpbGVzW2ldLmxlZnQpO1xyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25Ub3AgPSBNYXRoLm1heChyZXN1bHRSZWdpb24udG9wLCB0aWxlc1tpXS50b3ApO1xyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25SaWdodCA9IE1hdGgubWluKHJlc3VsdFJlZ2lvbi5yaWdodCwgdGlsZVJpZ2h0KTtcclxuICAgICAgICB2YXIgaW50ZXJzZWN0aW9uQm90dG9tID0gTWF0aC5taW4ocmVzdWx0UmVnaW9uLmJvdHRvbSwgdGlsZUJvdHRvbSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGludGVyc2VjdGlvbldpZHRoID0gaW50ZXJzZWN0aW9uUmlnaHQgLSBpbnRlcnNlY3Rpb25MZWZ0O1xyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25IZWlnaHQgPSBpbnRlcnNlY3Rpb25Cb3R0b20gLSBpbnRlcnNlY3Rpb25Ub3A7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGludGVyc2VjdGlvbkxlZnQgIT09IHRpbGVzW2ldLmxlZnQgfHxcclxuICAgICAgICAgICAgaW50ZXJzZWN0aW9uVG9wICE9PSB0aWxlc1tpXS50b3AgfHxcclxuICAgICAgICAgICAgaW50ZXJzZWN0aW9uV2lkdGggIT09IHRpbGVzW2ldLndpZHRoIHx8XHJcbiAgICAgICAgICAgIGludGVyc2VjdGlvbkhlaWdodCAhPT0gdGlsZXNbaV0uaGVpZ2h0KSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aHJvdyAnVW5zdXBwb3J0ZWQgdGlsZXMgdG8gY29weSc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlT2Zmc2V0WFBpeGVscyA9IGludGVyc2VjdGlvbkxlZnQgLSByZXN1bHRSZWdpb24ubGVmdDtcclxuICAgICAgICB2YXIgdGlsZU9mZnNldFlQaXhlbHMgPSBpbnRlcnNlY3Rpb25Ub3AgLSByZXN1bHRSZWdpb24udG9wO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZU9mZnNldEJ5dGVzID1cclxuICAgICAgICAgICAgdGlsZU9mZnNldFhQaXhlbHMgKiBieXRlc1BlclBpeGVsICtcclxuICAgICAgICAgICAgdGlsZU9mZnNldFlQaXhlbHMgKiByZ2JhSW1hZ2VTdHJpZGU7XHJcblxyXG4gICAgICAgIHRoaXMuX2NvcHlUaWxlKFxyXG4gICAgICAgICAgICByZXN1bHQuZGF0YSwgdGlsZXNbaV0sIHRpbGVPZmZzZXRCeXRlcywgcmdiYUltYWdlU3RyaWRlLCBjb21wb25lbnRzQ291bnQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuUGRmanNKcHhEZWNvZGVyLnByb3RvdHlwZS5fY29weVRpbGUgPSBmdW5jdGlvbiBjb3B5VGlsZShcclxuICAgIHRhcmdldEltYWdlLCB0aWxlLCB0YXJnZXRJbWFnZVN0YXJ0T2Zmc2V0LCB0YXJnZXRJbWFnZVN0cmlkZSwgY29tcG9uZW50c0NvdW50KSB7XHJcbiAgICBcclxuICAgIHZhciByT2Zmc2V0ID0gMDtcclxuICAgIHZhciBnT2Zmc2V0ID0gMTtcclxuICAgIHZhciBiT2Zmc2V0ID0gMjtcclxuICAgIHZhciBwaXhlbHNPZmZzZXQgPSAxO1xyXG4gICAgXHJcbiAgICB2YXIgcGl4ZWxzID0gdGlsZS5waXhlbHMgfHwgdGlsZS5pdGVtcztcclxuICAgIFxyXG4gICAgaWYgKGNvbXBvbmVudHNDb3VudCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgY29tcG9uZW50c0NvdW50ID0gcGl4ZWxzLmxlbmd0aCAvICh0aWxlLndpZHRoICogdGlsZS5oZWlnaHQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBzd2l0Y2ggKGNvbXBvbmVudHNDb3VudCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgZ09mZnNldCA9IDA7XHJcbiAgICAgICAgICAgIGJPZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICAgIHBpeGVsc09mZnNldCA9IDM7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBjYXNlIDQ6XHJcbiAgICAgICAgICAgIHBpeGVsc09mZnNldCA9IDQ7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyAnVW5zdXBwb3J0ZWQgY29tcG9uZW50cyBjb3VudCAnICsgY29tcG9uZW50c0NvdW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgdGFyZ2V0SW1hZ2VJbmRleCA9IHRhcmdldEltYWdlU3RhcnRPZmZzZXQ7XHJcbiAgICB2YXIgcGl4ZWwgPSAwO1xyXG4gICAgZm9yICh2YXIgeSA9IDA7IHkgPCB0aWxlLmhlaWdodDsgKyt5KSB7XHJcbiAgICAgICAgdmFyIHRhcmdldEltYWdlU3RhcnRMaW5lID0gdGFyZ2V0SW1hZ2VJbmRleDtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHRpbGUud2lkdGg7ICsreCkge1xyXG4gICAgICAgICAgICB0YXJnZXRJbWFnZVt0YXJnZXRJbWFnZUluZGV4ICsgMF0gPSBwaXhlbHNbcGl4ZWwgKyByT2Zmc2V0XTtcclxuICAgICAgICAgICAgdGFyZ2V0SW1hZ2VbdGFyZ2V0SW1hZ2VJbmRleCArIDFdID0gcGl4ZWxzW3BpeGVsICsgZ09mZnNldF07XHJcbiAgICAgICAgICAgIHRhcmdldEltYWdlW3RhcmdldEltYWdlSW5kZXggKyAyXSA9IHBpeGVsc1twaXhlbCArIGJPZmZzZXRdO1xyXG4gICAgICAgICAgICB0YXJnZXRJbWFnZVt0YXJnZXRJbWFnZUluZGV4ICsgM10gPSAyNTU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwaXhlbCArPSBwaXhlbHNPZmZzZXQ7XHJcbiAgICAgICAgICAgIHRhcmdldEltYWdlSW5kZXggKz0gNDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGFyZ2V0SW1hZ2VJbmRleCA9IHRhcmdldEltYWdlU3RhcnRMaW5lICsgdGFyZ2V0SW1hZ2VTdHJpZGU7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuQ29tcG9zaXRlQXJyYXkgPSBmdW5jdGlvbiBDb21wb3NpdGVBcnJheShvZmZzZXQpIHtcclxuICAgIHZhciBsZW5ndGggPSAwO1xyXG4gICAgdmFyIGludGVybmFsUGFydHMgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZW5ndGggPSBmdW5jdGlvbiBnZXRMZW5ndGgoKSB7XHJcbiAgICAgICAgcmV0dXJuIGxlbmd0aDtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5nZXRPZmZzZXQgPSBmdW5jdGlvbiBnZXRPZmZzZXQoKSB7XHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH07XHJcbiAgICAgICAgXHJcbiAgICB0aGlzLnB1c2hTdWJBcnJheSA9IGZ1bmN0aW9uIHB1c2hTdWJBcnJheShzdWJBcnJheSkge1xyXG4gICAgICAgIGludGVybmFsUGFydHMucHVzaChzdWJBcnJheSk7XHJcbiAgICAgICAgbGVuZ3RoICs9IHN1YkFycmF5Lmxlbmd0aDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY29weVRvT3RoZXJBdFRoZUVuZCA9IGZ1bmN0aW9uIGNvcHlUb090aGVyQXRUaGVFbmQocmVzdWx0LCBtaW5PZmZzZXQsIG1heE9mZnNldCkge1xyXG4gICAgICAgIGNoZWNrT2Zmc2V0c1RvQ29weShtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gZ2V0SW50ZXJuYWxQYXJ0c0l0ZXJhdG9yKG1pbk9mZnNldCwgbWF4T2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBOT1RFOiBXaGF0IGlmIGRhdGEgbm90IGluIGZpcnN0IHBhcnQ/XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpIHtcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2hTdWJBcnJheShpdGVyYXRvci5zdWJBcnJheSk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmNvcHlUb1R5cGVkQXJyYXkgPSBmdW5jdGlvbiBjb3B5VG9UeXBlZEFycmF5KFxyXG4gICAgICAgIHJlc3VsdEFycmF5LCByZXN1bHRBcnJheU9mZnNldCwgbWluT2Zmc2V0LCBtYXhPZmZzZXQpIHtcclxuICAgICAgICBcclxuICAgICAgICBjaGVja09mZnNldHNUb0NvcHkobWluT2Zmc2V0LCBtYXhPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IGdldEludGVybmFsUGFydHNJdGVyYXRvcihtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTk9URTogV2hhdCBpZiBkYXRhIG5vdCBpbiBmaXJzdCBwYXJ0P1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlICh0cnlBZHZhbmNlSXRlcmF0b3IoaXRlcmF0b3IpKSB7XHJcbiAgICAgICAgICAgIHZhciBvZmZzZXRJblJlc3VsdCA9XHJcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5vZmZzZXQgLSByZXN1bHRBcnJheU9mZnNldDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdEFycmF5LnNldChpdGVyYXRvci5zdWJBcnJheSwgb2Zmc2V0SW5SZXN1bHQpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5jb3B5VG9BcnJheSA9IGZ1bmN0aW9uIGNvcHlUb0FycmF5KFxyXG4gICAgICAgIHJlc3VsdEFycmF5LCByZXN1bHRBcnJheU9mZnNldCwgbWluT2Zmc2V0LCBtYXhPZmZzZXQpIHtcclxuICAgICAgICBcclxuICAgICAgICBjaGVja09mZnNldHNUb0NvcHkobWluT2Zmc2V0LCBtYXhPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IGdldEludGVybmFsUGFydHNJdGVyYXRvcihtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTk9URTogV2hhdCBpZiBkYXRhIG5vdCBpbiBmaXJzdCBwYXJ0P1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlICh0cnlBZHZhbmNlSXRlcmF0b3IoaXRlcmF0b3IpKSB7XHJcbiAgICAgICAgICAgIHZhciBvZmZzZXRJblJlc3VsdCA9XHJcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5vZmZzZXQgLSByZXN1bHRBcnJheU9mZnNldDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaXRlcmF0b3Iuc3ViQXJyYXkubGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdEFycmF5W29mZnNldEluUmVzdWx0KytdID0gaXRlcmF0b3Iuc3ViQXJyYXlbal07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNvcHlUb090aGVyID0gZnVuY3Rpb24gY29weVRvT3RoZXIob3RoZXIpIHtcclxuICAgICAgICBpZiAob3RoZXIuZ2V0T2Zmc2V0KCkgPiBvZmZzZXQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IFRyeWluZyB0byBjb3B5IHBhcnQgaW50byBhIGxhdHRlciBwYXJ0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBvdGhlckVuZE9mZnNldCA9IG90aGVyLmdldE9mZnNldCgpICsgb3RoZXIuZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgdmFyIGlzT3RoZXJDb250YWluc1RoaXMgPSBvZmZzZXQgKyBsZW5ndGggPD0gb3RoZXJFbmRPZmZzZXQ7XHJcbiAgICAgICAgaWYgKGlzT3RoZXJDb250YWluc1RoaXMpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIC8vIERvIG5vdCBvdmVycmlkZSBhbHJlYWR5IGV4aXN0IGRhdGEgKGZvciBlZmZpY2llbmN5KVxyXG4gICAgICAgIHZhciBtaW5PZmZzZXQgPSBvdGhlckVuZE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSBnZXRJbnRlcm5hbFBhcnRzSXRlcmF0b3IobWluT2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIXRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IENvdWxkIG5vdCBtZXJnZSBwYXJ0cycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZXhwZWN0ZWRPZmZzZXRWYWx1ZSA9IG1pbk9mZnNldDtcclxuXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBpZiAoaXRlcmF0b3Iub2Zmc2V0ICE9PSBleHBlY3RlZE9mZnNldFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IE5vbi1jb250aW51b3VzIHZhbHVlIG9mICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdyYW5nZVRvQ29weS5vZmZzZXQuIEV4cGVjdGVkOiAnICsgZXhwZWN0ZWRPZmZzZXRWYWx1ZSArXHJcbiAgICAgICAgICAgICAgICAgICAgICcsIEFjdHVhbDogJyArIGl0ZXJhdG9yLm9mZnNldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIG90aGVyLnB1c2hTdWJBcnJheShpdGVyYXRvci5zdWJBcnJheSk7XHJcbiAgICAgICAgICAgIGV4cGVjdGVkT2Zmc2V0VmFsdWUgKz0gaXRlcmF0b3Iuc3ViQXJyYXkubGVuZ3RoO1xyXG4gICAgICAgIH0gd2hpbGUgKHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tPZmZzZXRzVG9Db3B5KG1pbk9mZnNldCwgbWF4T2Zmc2V0KSB7XHJcbiAgICAgICAgaWYgKG1pbk9mZnNldCA9PT0gdW5kZWZpbmVkIHx8IG1heE9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ21pbk9mZnNldCBvciBtYXhPZmZzZXQgaXMgdW5kZWZpbmVkIGZvciBDb21wb3NpdGVBcnJheS5jb3B5VG9BcnJheScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobWluT2Zmc2V0IDwgb2Zmc2V0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ21pbk9mZnNldCAoJyArIG1pbk9mZnNldCArICcpIG11c3QgYmUgc21hbGxlciB0aGFuICcgK1xyXG4gICAgICAgICAgICAgICAgJ0NvbXBvc2l0ZUFycmF5IG9mZnNldCAoJyArIG9mZnNldCArICcpJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXhPZmZzZXQgPiBvZmZzZXQgKyBsZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnbWF4T2Zmc2V0ICgnICsgbWF4T2Zmc2V0ICsgJykgbXVzdCBiZSBsYXJnZXIgdGhhbiAnICtcclxuICAgICAgICAgICAgICAgICdDb21wb3NpdGVBcnJheSBlbmQgb2Zmc2V0ICgnICsgb2Zmc2V0ICsgbGVuZ3RoICsgJyknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldEludGVybmFsUGFydHNJdGVyYXRvcihtaW5PZmZzZXQsIG1heE9mZnNldCkge1xyXG4gICAgICAgIHZhciBzdGFydCA9IE1hdGgubWF4KG9mZnNldCwgbWluT2Zmc2V0KTtcclxuXHJcbiAgICAgICAgdmFyIGVuZCA9IG9mZnNldCArIGxlbmd0aDtcclxuICAgICAgICBpZiAobWF4T2Zmc2V0ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZW5kID0gTWF0aC5taW4oZW5kLCBtYXhPZmZzZXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoc3RhcnQgPj0gZW5kKSB7XHJcbiAgICAgICAgICAgIHZhciBlbXB0eUl0ZXJhdG9yID0ge1xyXG4gICAgICAgICAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGE6IHsgaXNFbmRPZlJhbmdlOiB0cnVlIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBlbXB0eUl0ZXJhdG9yO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSB7XHJcbiAgICAgICAgICAgIHN1YkFycmF5OiBudWxsLFxyXG4gICAgICAgICAgICBvZmZzZXQ6IC0xLFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGE6IHtcclxuICAgICAgICAgICAgICAgIGVuZDogZW5kLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudFN1YkFycmF5OiBudWxsLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudEludGVybmFsUGFydE9mZnNldDogbnVsbCxcclxuICAgICAgICAgICAgICAgIG5leHRJbnRlcm5hbFBhcnRPZmZzZXQ6IG9mZnNldCxcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJbnRlcm5hbFBhcnRJbmRleDogLTEsXHJcbiAgICAgICAgICAgICAgICBpc0VuZE9mUmFuZ2U6IGZhbHNlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhbHJlYWR5UmVhY2hlZFRvVGhlRW5kID0gZmFsc2U7XHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBpZiAoYWxyZWFkeVJlYWNoZWRUb1RoZUVuZCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ0l0ZXJhdG9yIHJlYWNoZWQgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ3RvIHRoZSBlbmQgYWx0aG91Z2ggbm8gZGF0YSBoYXMgYmVlbiBpdGVyYXRlZCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBhbHJlYWR5UmVhY2hlZFRvVGhlRW5kID0gIXRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcik7XHJcbiAgICAgICAgfSB3aGlsZSAoc3RhcnQgPj0gaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEubmV4dEludGVybmFsUGFydE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGN1dEZpcnN0U3ViQXJyYXkgPVxyXG4gICAgICAgICAgICBzdGFydCAtIGl0ZXJhdG9yLmludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQ7XHJcbiAgICAgICAgaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudFN1YkFycmF5ID1cclxuICAgICAgICAgICAgaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudFN1YkFycmF5LnN1YmFycmF5KGN1dEZpcnN0U3ViQXJyYXkpO1xyXG4gICAgICAgIGl0ZXJhdG9yLmludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQgPSBzdGFydDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXRlcmF0b3I7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikge1xyXG4gICAgICAgIHZhciBpbnRlcm5hbEl0ZXJhdG9yRGF0YSA9IGl0ZXJhdG9yLmludGVybmFsSXRlcmF0b3JEYXRhO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpbnRlcm5hbEl0ZXJhdG9yRGF0YS5pc0VuZE9mUmFuZ2UpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpdGVyYXRvci5zdWJBcnJheSA9IGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRTdWJBcnJheTtcclxuICAgICAgICBpdGVyYXRvci5vZmZzZXQgPSBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgICsraW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydEluZGV4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpbnRlcm5hbEl0ZXJhdG9yRGF0YS5uZXh0SW50ZXJuYWxQYXJ0T2Zmc2V0ID49IGludGVybmFsSXRlcmF0b3JEYXRhLmVuZCkge1xyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5pc0VuZE9mUmFuZ2UgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGVuc3VyZU5vRW5kT2ZBcnJheVJlYWNoZWQoaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydEluZGV4KTtcclxuICAgICAgICBcclxuICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50U3ViQXJyYXkgPSBpbnRlcm5hbFBhcnRzW1xyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXhdO1xyXG4gICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQgPVxyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5uZXh0SW50ZXJuYWxQYXJ0T2Zmc2V0O1xyXG4gICAgICAgIHZhciBjdXJyZW50SW50ZXJuYWxQYXJ0TGVuZ3RoID1cclxuICAgICAgICAgICAgaW50ZXJuYWxQYXJ0c1tpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXhdLmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5uZXh0SW50ZXJuYWxQYXJ0T2Zmc2V0ID1cclxuICAgICAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydE9mZnNldCArIGN1cnJlbnRJbnRlcm5hbFBhcnRMZW5ndGg7XHJcblxyXG4gICAgICAgIHZhciBjdXRMYXN0U3ViQXJyYXkgPVxyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5lbmQgLSBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0T2Zmc2V0O1xyXG4gICAgICAgIHZhciBpc0xhc3RTdWJBcnJheSA9XHJcbiAgICAgICAgICAgIGN1dExhc3RTdWJBcnJheSA8IGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRTdWJBcnJheS5sZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzTGFzdFN1YkFycmF5KSB7XHJcbiAgICAgICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRTdWJBcnJheSA9IGludGVybmFsSXRlcmF0b3JEYXRhXHJcbiAgICAgICAgICAgICAgICAuY3VycmVudFN1YkFycmF5LnN1YmFycmF5KDAsIGN1dExhc3RTdWJBcnJheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBlbnN1cmVOb0VuZE9mQXJyYXlSZWFjaGVkKGN1cnJlbnRJbnRlcm5hbFBhcnRJbmRleCkge1xyXG4gICAgICAgIGlmIChjdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXggPj0gaW50ZXJuYWxQYXJ0cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IGVuZCBvZiBwYXJ0IGhhcyByZWFjaGVkLiBDaGVjayBlbmQgY2FsY3VsYXRpb24nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxuLy8gQS4yLjEuXHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwRGF0YWJpblBhcnRzID0gZnVuY3Rpb24gSnBpcERhdGFiaW5QYXJ0cyhcclxuICAgIGNsYXNzSWQsIGluQ2xhc3NJZCwganBpcEZhY3RvcnkpIHtcclxuXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgdmFyIHBhcnRzID0gW107XHJcbiAgICB2YXIgZGF0YWJpbkxlbmd0aElmS25vd24gPSBudWxsO1xyXG4gICAgdmFyIGxvYWRlZEJ5dGVzID0gMDtcclxuICAgIFxyXG4gICAgdmFyIGNhY2hlZERhdGEgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXREYXRhYmluTGVuZ3RoSWZLbm93biA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBkYXRhYmluTGVuZ3RoSWZLbm93bjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TG9hZGVkQnl0ZXMgPSBmdW5jdGlvbiBnZXRMb2FkZWRCeXRlcygpIHtcclxuICAgICAgICByZXR1cm4gbG9hZGVkQnl0ZXM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmlzQWxsRGF0YWJpbkxvYWRlZCA9IGZ1bmN0aW9uIGlzQWxsRGF0YWJpbkxvYWRlZCgpIHtcclxuICAgICAgICB2YXIgcmVzdWx0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAocGFydHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNhc2UgMDpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGRhdGFiaW5MZW5ndGhJZktub3duID09PSAwO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID1cclxuICAgICAgICAgICAgICAgICAgICBwYXJ0c1swXS5nZXRPZmZzZXQoKSA9PT0gMCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIHBhcnRzWzBdLmdldExlbmd0aCgpID09PSBkYXRhYmluTGVuZ3RoSWZLbm93bjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENhY2hlZERhdGEgPSBmdW5jdGlvbiBnZXRDYWNoZWREYXRhKGtleSkge1xyXG4gICAgICAgIHZhciBvYmogPSBjYWNoZWREYXRhW2tleV07XHJcbiAgICAgICAgaWYgKG9iaiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIG9iaiA9IHt9O1xyXG4gICAgICAgICAgICBjYWNoZWREYXRhW2tleV0gPSBvYmo7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBvYmo7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENsYXNzSWQgPSBmdW5jdGlvbiBnZXRDbGFzc0lkKCkge1xyXG4gICAgICAgIHJldHVybiBjbGFzc0lkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJbkNsYXNzSWQgPSBmdW5jdGlvbiBnZXRJbkNsYXNzSWQoKSB7XHJcbiAgICAgICAgcmV0dXJuIGluQ2xhc3NJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY29weVRvQ29tcG9zaXRlQXJyYXkgPSBmdW5jdGlvbiBjb3B5VG9Db21wb3NpdGVBcnJheShyZXN1bHQsIHJhbmdlT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBkdW1teVJlc3VsdFN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICB2YXIgcGFyYW1zID0gZ2V0UGFyYW1zRm9yQ29weUJ5dGVzKGR1bW15UmVzdWx0U3RhcnRPZmZzZXQsIHJhbmdlT3B0aW9ucyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBhcmFtcy5yZXN1bHRXaXRob3V0Q29weSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJhbXMucmVzdWx0V2l0aG91dENvcHk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhMZW5ndGhDb3BpZWQgPSBpdGVyYXRlUmFuZ2UoXHJcbiAgICAgICAgICAgIHBhcmFtcy5kYXRhYmluU3RhcnRPZmZzZXQsXHJcbiAgICAgICAgICAgIHBhcmFtcy5tYXhMZW5ndGhUb0NvcHksXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIGFkZFBhcnRUb1Jlc3VsdEluQ29weVRvQ29tcG9zaXRlQXJyYXkocGFydCwgbWluT2Zmc2V0SW5QYXJ0LCBtYXhPZmZzZXRJblBhcnQpIHtcclxuICAgICAgICAgICAgICAgIHBhcnQuY29weVRvT3RoZXJBdFRoZUVuZChcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgICAgICAgICAgbWluT2Zmc2V0SW5QYXJ0LFxyXG4gICAgICAgICAgICAgICAgICAgIG1heE9mZnNldEluUGFydCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBtYXhMZW5ndGhDb3BpZWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNvcHlCeXRlcyA9IGZ1bmN0aW9uKHJlc3VsdEFycmF5LCByZXN1bHRTdGFydE9mZnNldCwgcmFuZ2VPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIHBhcmFtcyA9IGdldFBhcmFtc0ZvckNvcHlCeXRlcyhyZXN1bHRTdGFydE9mZnNldCwgcmFuZ2VPcHRpb25zKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocGFyYW1zLnJlc3VsdFdpdGhvdXRDb3B5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcmFtcy5yZXN1bHRXaXRob3V0Q29weTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdEFycmF5T2Zmc2V0SW5EYXRhYmluID0gcGFyYW1zLmRhdGFiaW5TdGFydE9mZnNldCAtIHBhcmFtcy5yZXN1bHRTdGFydE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWF4TGVuZ3RoQ29waWVkID0gaXRlcmF0ZVJhbmdlKFxyXG4gICAgICAgICAgICBwYXJhbXMuZGF0YWJpblN0YXJ0T2Zmc2V0LFxyXG4gICAgICAgICAgICBwYXJhbXMubWF4TGVuZ3RoVG9Db3B5LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiBhZGRQYXJ0VG9SZXN1bHRJbkNvcHlCeXRlcyhwYXJ0LCBtaW5PZmZzZXRJblBhcnQsIG1heE9mZnNldEluUGFydCkge1xyXG4gICAgICAgICAgICAgICAgcGFydC5jb3B5VG9BcnJheShcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHRBcnJheSxcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHRBcnJheU9mZnNldEluRGF0YWJpbixcclxuICAgICAgICAgICAgICAgICAgICBtaW5PZmZzZXRJblBhcnQsXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4T2Zmc2V0SW5QYXJ0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG1heExlbmd0aENvcGllZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RXhpc3RpbmdSYW5nZXMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KHBhcnRzLmxlbmd0aCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICByZXN1bHRbaV0gPSB7XHJcbiAgICAgICAgICAgICAgICBzdGFydDogcGFydHNbaV0uZ2V0T2Zmc2V0KCksXHJcbiAgICAgICAgICAgICAgICBsZW5ndGg6IHBhcnRzW2ldLmdldExlbmd0aCgpXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5hZGREYXRhID0gZnVuY3Rpb24oaGVhZGVyLCBtZXNzYWdlKSB7XHJcbiAgICAgICAgaWYgKGhlYWRlci5pc0xhc3RCeXRlSW5EYXRhYmluKSB7XHJcbiAgICAgICAgICAgIGRhdGFiaW5MZW5ndGhJZktub3duID0gaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0ICsgaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBuZXdQYXJ0ID0ganBpcEZhY3RvcnkuY3JlYXRlQ29tcG9zaXRlQXJyYXkoXHJcbiAgICAgICAgICAgIGhlYWRlci5tZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydCk7XHJcblxyXG4gICAgICAgIHZhciBlbmRPZmZzZXRJbk1lc3NhZ2UgPSBoZWFkZXIuYm9keVN0YXJ0ICsgaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgIG5ld1BhcnQucHVzaFN1YkFycmF5KG1lc3NhZ2Uuc3ViYXJyYXkoaGVhZGVyLmJvZHlTdGFydCwgZW5kT2Zmc2V0SW5NZXNzYWdlKSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgd2hlcmUgdG8gcHVzaCB0aGUgbmV3IG1lc3NhZ2VcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW5kZXhGaXJzdFBhcnRBZnRlciA9IGZpbmRGaXJzdFBhcnRBZnRlck9mZnNldChoZWFkZXIubWVzc2FnZU9mZnNldEZyb21EYXRhYmluU3RhcnQpO1xyXG4gICAgICAgIHZhciBpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyID0gaW5kZXhGaXJzdFBhcnRBZnRlcjtcclxuXHJcbiAgICAgICAgaWYgKGluZGV4Rmlyc3RQYXJ0QWZ0ZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHZhciBwcmV2aW91c1BhcnQgPSBwYXJ0c1tpbmRleEZpcnN0UGFydEFmdGVyIC0gMV07XHJcbiAgICAgICAgICAgIHZhciBwcmV2aW91c1BhcnRFbmRPZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgcHJldmlvdXNQYXJ0LmdldE9mZnNldCgpICsgcHJldmlvdXNQYXJ0LmdldExlbmd0aCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHByZXZpb3VzUGFydEVuZE9mZnNldCA9PT0gaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDYW4gbWVyZ2UgYWxzbyBwcmV2aW91cyBwYXJ0XHJcbiAgICAgICAgICAgICAgICAtLWluZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyID49IHBhcnRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKG5ld1BhcnQpO1xyXG4gICAgICAgICAgICBsb2FkZWRCeXRlcyArPSBoZWFkZXIubWVzc2FnZUJvZHlMZW5ndGg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdFBhcnROZWFyT3JBZnRlciA9IHBhcnRzW2luZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXJdO1xyXG4gICAgICAgIHZhciBlbmRPZmZzZXRJbkRhdGFiaW4gPVxyXG4gICAgICAgICAgICBoZWFkZXIubWVzc2FnZU9mZnNldEZyb21EYXRhYmluU3RhcnQgKyBoZWFkZXIubWVzc2FnZUJvZHlMZW5ndGg7XHJcbiAgICAgICAgaWYgKGZpcnN0UGFydE5lYXJPckFmdGVyLmdldE9mZnNldCgpID4gZW5kT2Zmc2V0SW5EYXRhYmluKSB7XHJcbiAgICAgICAgICAgIC8vIE5vdCBmb3VuZCBhbiBvdmVybGFwcGluZyBwYXJ0LCBwdXNoIGEgbmV3XHJcbiAgICAgICAgICAgIC8vIHBhcnQgaW4gdGhlIG1pZGRsZSBvZiB0aGUgcGFydHMgYXJyYXlcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoOyBpID4gaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlcjsgLS1pKSB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0c1tpXSA9IHBhcnRzW2kgLSAxXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcGFydHNbaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlcl0gPSBuZXdQYXJ0O1xyXG4gICAgICAgICAgICBsb2FkZWRCeXRlcyArPSBoZWFkZXIubWVzc2FnZUJvZHlMZW5ndGg7XHJcblxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1lcmdlIGZpcnN0IGFuZCBsYXN0IG92ZXJsYXBwaW5nIHBhcnRzIC0gYWxsIHRoZSByZXN0IChpZiBhbnkpIGFyZSBpbiB0aGUgbWlkZGxlIG9mIHRoZSBuZXcgcGFydFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0FscmVhZHlTYXZlZCA9IGZpcnN0UGFydE5lYXJPckFmdGVyLmdldExlbmd0aCgpO1xyXG5cclxuICAgICAgICB2YXIgc2hvdWxkU3dhcCA9XHJcbiAgICAgICAgICAgIGZpcnN0UGFydE5lYXJPckFmdGVyLmdldE9mZnNldCgpID4gaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0O1xyXG4gICAgICAgIGlmIChzaG91bGRTd2FwKSB7XHJcbiAgICAgICAgICAgIHBhcnRzW2luZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXJdID0gbmV3UGFydDtcclxuICAgICAgICAgICAgbmV3UGFydCA9IGZpcnN0UGFydE5lYXJPckFmdGVyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZmlyc3RQYXJ0TmVhck9yQWZ0ZXIgPSBwYXJ0c1tpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIG5ld1BhcnQuY29weVRvT3RoZXIoZmlyc3RQYXJ0TmVhck9yQWZ0ZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBlbmRPZmZzZXQgPVxyXG4gICAgICAgICAgICBmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRPZmZzZXQoKSArIGZpcnN0UGFydE5lYXJPckFmdGVyLmdldExlbmd0aCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYXJ0VG9NZXJnZUluZGV4O1xyXG4gICAgICAgIGZvciAocGFydFRvTWVyZ2VJbmRleCA9IGluZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXI7XHJcbiAgICAgICAgICAgIHBhcnRUb01lcmdlSW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxO1xyXG4gICAgICAgICAgICArK3BhcnRUb01lcmdlSW5kZXgpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChlbmRPZmZzZXQgPCBwYXJ0c1twYXJ0VG9NZXJnZUluZGV4ICsgMV0uZ2V0T2Zmc2V0KCkpIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBieXRlc0FscmVhZHlTYXZlZCArPSBwYXJ0c1twYXJ0VG9NZXJnZUluZGV4ICsgMV0uZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYXJ0c1RvRGVsZXRlID0gcGFydFRvTWVyZ2VJbmRleCAtIGluZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXI7XHJcbiAgICAgICAgaWYgKHBhcnRzVG9EZWxldGUgPiAwKSB7XHJcbiAgICAgICAgICAgIHBhcnRzW3BhcnRUb01lcmdlSW5kZXhdLmNvcHlUb090aGVyKGZpcnN0UGFydE5lYXJPckFmdGVyKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIERlbGV0ZSBhbGwgbWlkZGxlIGFuZCBtZXJnZWQgcGFydHMgZXhjZXB0IDFcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyICsgMTsgaiA8IHBhcnRzLmxlbmd0aCAtIHBhcnRzVG9EZWxldGU7ICsraikge1xyXG4gICAgICAgICAgICAgICAgcGFydHNbal0gPSBwYXJ0c1tqICsgcGFydHNUb0RlbGV0ZV07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHBhcnRzLmxlbmd0aCAtPSBwYXJ0c1RvRGVsZXRlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsb2FkZWRCeXRlcyArPSBmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRMZW5ndGgoKSAtIGJ5dGVzQWxyZWFkeVNhdmVkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0UGFyYW1zRm9yQ29weUJ5dGVzKHJlc3VsdFN0YXJ0T2Zmc2V0LCByYW5nZU9wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZm9yY2VDb3B5QWxsUmFuZ2UgPSBmYWxzZTtcclxuICAgICAgICB2YXIgZGF0YWJpblN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICB2YXIgbWF4TGVuZ3RoVG9Db3B5O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyYW5nZU9wdGlvbnMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZSA9ICEhcmFuZ2VPcHRpb25zLmZvcmNlQ29weUFsbFJhbmdlO1xyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQgPSByYW5nZU9wdGlvbnMuZGF0YWJpblN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHkgPSByYW5nZU9wdGlvbnMubWF4TGVuZ3RoVG9Db3B5O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGRhdGFiaW5TdGFydE9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXN1bHRTdGFydE9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdFN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1heExlbmd0aFRvQ29weSA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyByZXN1bHRXaXRob3V0Q29weTogMCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoKGRhdGFiaW5MZW5ndGhJZktub3duICE9PSBudWxsKSAmJiAoZGF0YWJpblN0YXJ0T2Zmc2V0ID49IGRhdGFiaW5MZW5ndGhJZktub3duKSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyByZXN1bHRXaXRob3V0Q29weTogKCEhbWF4TGVuZ3RoVG9Db3B5ICYmIGZvcmNlQ29weUFsbFJhbmdlID8gbnVsbCA6IDApIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdFJlbGV2YW50UGFydEluZGV4ID0gZmluZEZpcnN0UGFydEFmdGVyT2Zmc2V0KGRhdGFiaW5TdGFydE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGZpcnN0UmVsZXZhbnRQYXJ0SW5kZXggPT09IHBhcnRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyByZXN1bHRXaXRob3V0Q29weTogKGZvcmNlQ29weUFsbFJhbmdlID8gbnVsbCA6IDApIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmb3JjZUNvcHlBbGxSYW5nZSkge1xyXG4gICAgICAgICAgICB2YXIgaXNBbGxSZXF1ZXN0ZWRSYW5nZUV4aXN0ID1cclxuICAgICAgICAgICAgICAgIGlzQWxsUmFuZ2VFeGlzdChkYXRhYmluU3RhcnRPZmZzZXQsIG1heExlbmd0aFRvQ29weSwgZmlyc3RSZWxldmFudFBhcnRJbmRleCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWlzQWxsUmVxdWVzdGVkUmFuZ2VFeGlzdCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgcmVzdWx0V2l0aG91dENvcHk6IG51bGwgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGFyYW1zID0ge1xyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGRhdGFiaW5TdGFydE9mZnNldCxcclxuICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBtYXhMZW5ndGhUb0NvcHksXHJcbiAgICAgICAgICAgIHJlc3VsdFN0YXJ0T2Zmc2V0OiByZXN1bHRTdGFydE9mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwYXJhbXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGlzQWxsUmFuZ2VFeGlzdChcclxuICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQsIG1heExlbmd0aFRvQ29weSwgZmlyc3RSZWxldmFudFBhcnRJbmRleCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwYXJ0c1tmaXJzdFJlbGV2YW50UGFydEluZGV4XS5nZXRPZmZzZXQoKSA+IGRhdGFiaW5TdGFydE9mZnNldCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXhMZW5ndGhUb0NvcHkpIHtcclxuICAgICAgICAgICAgdmFyIHVudXNlZEVsZW1lbnRzID1cclxuICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldCAtIHBhcnRzW2ZpcnN0UmVsZXZhbnRQYXJ0SW5kZXhdLmdldE9mZnNldCgpO1xyXG4gICAgICAgICAgICB2YXIgYXZhaWxhYmxlTGVuZ3RoID1cclxuICAgICAgICAgICAgICAgIHBhcnRzW2ZpcnN0UmVsZXZhbnRQYXJ0SW5kZXhdLmdldExlbmd0aCgpIC0gdW51c2VkRWxlbWVudHM7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgaXNVbnRpbE1heExlbmd0aEV4aXN0ID0gYXZhaWxhYmxlTGVuZ3RoID49IG1heExlbmd0aFRvQ29weTtcclxuICAgICAgICAgICAgcmV0dXJuIGlzVW50aWxNYXhMZW5ndGhFeGlzdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5MZW5ndGhJZktub3duID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgIGZpcnN0UmVsZXZhbnRQYXJ0SW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIHZhciBlbmRPZmZzZXRSZWNpZXZlZCA9IGxhc3RQYXJ0LmdldE9mZnNldCgpICsgbGFzdFBhcnQuZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzVW50aWxFbmRPZkRhdGFiaW5FeGlzdCA9IGVuZE9mZnNldFJlY2lldmVkID09PSBkYXRhYmluTGVuZ3RoSWZLbm93bjtcclxuICAgICAgICByZXR1cm4gaXNVbnRpbEVuZE9mRGF0YWJpbkV4aXN0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpdGVyYXRlUmFuZ2UoXHJcbiAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldCxcclxuICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5LFxyXG4gICAgICAgIGFkZFN1YlBhcnRUb1Jlc3VsdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtaW5PZmZzZXRJbkRhdGFiaW5Ub0NvcHkgPSBkYXRhYmluU3RhcnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1heE9mZnNldEluRGF0YWJpblRvQ29weTtcclxuICAgICAgICBpZiAobWF4TGVuZ3RoVG9Db3B5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgbWF4T2Zmc2V0SW5EYXRhYmluVG9Db3B5ID0gZGF0YWJpblN0YXJ0T2Zmc2V0ICsgbWF4TGVuZ3RoVG9Db3B5O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHZhciBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICBtYXhPZmZzZXRJbkRhdGFiaW5Ub0NvcHkgPSBsYXN0UGFydC5nZXRPZmZzZXQoKSArIGxhc3RQYXJ0LmdldExlbmd0aCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBsYXN0Q29waWVkUGFydCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBpZiAocGFydHNbaV0uZ2V0T2Zmc2V0KCkgPj0gbWF4T2Zmc2V0SW5EYXRhYmluVG9Db3B5KSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGN1cnJlbnRNaW5PZmZzZXRJbkRhdGFiaW5Ub0NvcHkgPSBNYXRoLm1heChcclxuICAgICAgICAgICAgICAgIG1pbk9mZnNldEluRGF0YWJpblRvQ29weSwgcGFydHNbaV0uZ2V0T2Zmc2V0KCkpO1xyXG4gICAgICAgICAgICB2YXIgY3VycmVudE1heE9mZnNldEluRGF0YWJpblRvQ29weSA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICAgICAgbWF4T2Zmc2V0SW5EYXRhYmluVG9Db3B5LCBwYXJ0c1tpXS5nZXRPZmZzZXQoKSArIHBhcnRzW2ldLmdldExlbmd0aCgpKTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgYWRkU3ViUGFydFRvUmVzdWx0KFxyXG4gICAgICAgICAgICAgICAgcGFydHNbaV0sXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50TWluT2Zmc2V0SW5EYXRhYmluVG9Db3B5LFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE1heE9mZnNldEluRGF0YWJpblRvQ29weSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsYXN0Q29waWVkUGFydCA9IHBhcnRzW2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobGFzdENvcGllZFBhcnQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsYXN0T2Zmc2V0Q29waWVkID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgIGxhc3RDb3BpZWRQYXJ0LmdldE9mZnNldCgpICsgbGFzdENvcGllZFBhcnQuZ2V0TGVuZ3RoKCksXHJcbiAgICAgICAgICAgIG1heE9mZnNldEluRGF0YWJpblRvQ29weSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1heExlbmd0aENvcGllZCA9IGxhc3RPZmZzZXRDb3BpZWQgLSBkYXRhYmluU3RhcnRPZmZzZXQ7XHJcbiAgICAgICAgcmV0dXJuIG1heExlbmd0aENvcGllZDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBmaW5kRmlyc3RQYXJ0QWZ0ZXJPZmZzZXQob2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIGluZGV4O1xyXG4gICAgICAgIGZvciAoaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aDsgKytpbmRleCkge1xyXG4gICAgICAgICAgICBpZiAocGFydHNbaW5kZXhdLmdldE9mZnNldCgpICsgcGFydHNbaW5kZXhdLmdldExlbmd0aCgpID4gb2Zmc2V0KSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBEYXRhYmluc1NhdmVyID0gZnVuY3Rpb24gSnBpcERhdGFiaW5zU2F2ZXIoaXNKcGlwVGlsZVBhcnRTdHJlYW0sIGpwaXBGYWN0b3J5KSB7XHJcbiAgICB2YXIgUFJFQ0lOQ1RfTk9fQVVYX0NMQVNTID0gMDtcclxuICAgIHZhciBQUkVDSU5DVF9XSVRIX0FVWF9DTEFTUyA9IDE7XHJcbiAgICB2YXIgVElMRV9IRUFERVJfQ0xBU1MgPSAyO1xyXG4gICAgdmFyIFRJTEVfTk9fQVVYX0NMQVNTID0gNDtcclxuICAgIHZhciBUSUxFX1dJVEhfQVVYX0NMQVNTID0gNTtcclxuXHJcbiAgICB2YXIgZGF0YWJpbnNCeUNsYXNzID0gW107XHJcbiAgICB2YXIgZm9yYmlkZGVuSW5KcHAgPSBbXTtcclxuICAgIHZhciBmb3JiaWRkZW5JbkpwdCA9IFtdO1xyXG4gICAgXHJcbiAgICB2YXIgbG9hZGVkQnl0ZXMgPSAwO1xyXG4gICAgdmFyIGxvYWRlZEJ5dGVzSW5SZWdpc3RlcmVkRGF0YWJpbnMgPSAwO1xyXG5cclxuICAgIC8vIFZhbGlkIG9ubHkgaWYgaXNKcGlwVGlsZVBhcnRTdHJlYW0gPSBmYWxzZVxyXG4gICAgXHJcbiAgICBkYXRhYmluc0J5Q2xhc3NbVElMRV9IRUFERVJfQ0xBU1NdID0gY3JlYXRlRGF0YWJpbnNBcnJheSgpO1xyXG4gICAgZGF0YWJpbnNCeUNsYXNzW1BSRUNJTkNUX05PX0FVWF9DTEFTU10gPSBjcmVhdGVEYXRhYmluc0FycmF5KCk7XHJcbiAgICBkYXRhYmluc0J5Q2xhc3NbUFJFQ0lOQ1RfV0lUSF9BVVhfQ0xBU1NdID0gZGF0YWJpbnNCeUNsYXNzW1xyXG4gICAgICAgIFBSRUNJTkNUX05PX0FVWF9DTEFTU107XHJcbiAgICBcclxuICAgIGZvcmJpZGRlbkluSnB0W1RJTEVfSEVBREVSX0NMQVNTXSA9IHRydWU7XHJcbiAgICBmb3JiaWRkZW5JbkpwdFtQUkVDSU5DVF9OT19BVVhfQ0xBU1NdID0gdHJ1ZTtcclxuICAgIGZvcmJpZGRlbkluSnB0W1BSRUNJTkNUX1dJVEhfQVVYX0NMQVNTXSA9IHRydWU7XHJcbiAgICBcclxuICAgIC8vIFZhbGlkIG9ubHkgaWYgaXNKcGlwVGlsZVBhcnRTdHJlYW0gPSB0cnVlXHJcblxyXG4gICAgZGF0YWJpbnNCeUNsYXNzW1RJTEVfTk9fQVVYX0NMQVNTXSA9IGNyZWF0ZURhdGFiaW5zQXJyYXkoKTtcclxuICAgIGRhdGFiaW5zQnlDbGFzc1tUSUxFX1dJVEhfQVVYX0NMQVNTXSA9IGRhdGFiaW5zQnlDbGFzc1tcclxuICAgICAgICBUSUxFX05PX0FVWF9DTEFTU107XHJcbiAgICBcclxuICAgIGZvcmJpZGRlbkluSnBwW1RJTEVfTk9fQVVYX0NMQVNTXSA9IHRydWU7XHJcbiAgICBmb3JiaWRkZW5JbkpwcFtUSUxFX1dJVEhfQVVYX0NMQVNTXSA9IHRydWU7XHJcbiAgICBcclxuICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGpwaXBGYWN0b3J5LmNyZWF0ZURhdGFiaW5QYXJ0cyg2LCAwKTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJc0pwaXBUaWxlUGFydFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBpc0pwaXBUaWxlUGFydFN0cmVhbTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TG9hZGVkQnl0ZXMgPSBmdW5jdGlvbiBnZXRMb2FkZWRCeXRlcygpIHtcclxuICAgICAgICByZXR1cm4gbG9hZGVkQnl0ZXM7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuZ2V0TWFpbkhlYWRlckRhdGFiaW4gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcmV0dXJuIG1haW5IZWFkZXJEYXRhYmluO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlSGVhZGVyRGF0YWJpbiA9IGZ1bmN0aW9uKGluQ2xhc3NJbmRleCkge1xyXG4gICAgICAgIHZhciBkYXRhYmluID0gZ2V0RGF0YWJpbkZyb21BcnJheShcclxuICAgICAgICAgICAgZGF0YWJpbnNCeUNsYXNzW1RJTEVfSEVBREVSX0NMQVNTXSxcclxuICAgICAgICAgICAgVElMRV9IRUFERVJfQ0xBU1MsXHJcbiAgICAgICAgICAgIGluQ2xhc3NJbmRleCxcclxuICAgICAgICAgICAgLyppc0pwaXBUaWxlUGFydFN0cmVhbUV4cGVjdGVkPSovZmFsc2UsXHJcbiAgICAgICAgICAgICd0aWxlSGVhZGVyJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW47XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFByZWNpbmN0RGF0YWJpbiA9IGZ1bmN0aW9uKGluQ2xhc3NJbmRleCkge1xyXG4gICAgICAgIHZhciBkYXRhYmluID0gZ2V0RGF0YWJpbkZyb21BcnJheShcclxuICAgICAgICAgICAgZGF0YWJpbnNCeUNsYXNzW1BSRUNJTkNUX05PX0FVWF9DTEFTU10sXHJcbiAgICAgICAgICAgIFBSRUNJTkNUX05PX0FVWF9DTEFTUyxcclxuICAgICAgICAgICAgaW5DbGFzc0luZGV4LFxyXG4gICAgICAgICAgICAvKmlzSnBpcFRpbGVQYXJ0U3RyZWFtRXhwZWN0ZWQ9Ki9mYWxzZSxcclxuICAgICAgICAgICAgJ3ByZWNpbmN0Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW47XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVEYXRhYmluID0gZnVuY3Rpb24oaW5DbGFzc0luZGV4KSB7XHJcbiAgICAgICAgdmFyIGRhdGFiaW4gPSBnZXREYXRhYmluRnJvbUFycmF5KFxyXG4gICAgICAgICAgICBkYXRhYmluc0J5Q2xhc3NbVElMRV9OT19BVVhfQ0xBU1NdLFxyXG4gICAgICAgICAgICBUSUxFX05PX0FVWF9DTEFTUyxcclxuICAgICAgICAgICAgaW5DbGFzc0luZGV4LFxyXG4gICAgICAgICAgICAvKmlzSnBpcFRpbGVQYXJ0U3RyZWFtRXhwZWN0ZWQ9Ki90cnVlLFxyXG4gICAgICAgICAgICAndGlsZVBhcnQnKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gZGF0YWJpbjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uIGFkZEV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgZGF0YWJpbiwgZXZlbnQsIGxpc3RlbmVyLCBsaXN0ZW5lclRoaXMpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZXZlbnQgIT09ICdkYXRhQXJyaXZlZCcpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ1Vuc3VwcG9ydGVkIGV2ZW50OiAnICtcclxuICAgICAgICAgICAgICAgIGV2ZW50KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNsYXNzSWQgPSBkYXRhYmluLmdldENsYXNzSWQoKTtcclxuICAgICAgICB2YXIgaW5DbGFzc0lkID0gZGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgZGF0YWJpbnNBcnJheSA9IGRhdGFiaW5zQnlDbGFzc1tjbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbiAhPT0gZGF0YWJpbnNBcnJheS5kYXRhYmluc1tpbkNsYXNzSWRdKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdVbm1hdGNoZWQgZGF0YWJpbiAnICtcclxuICAgICAgICAgICAgICAgICd3aXRoIGNsYXNzLUlEPScgKyBjbGFzc0lkICsgJyBhbmQgaW4tY2xhc3MtSUQ9JyArIGluQ2xhc3NJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChkYXRhYmluc0FycmF5Lmxpc3RlbmVyc1tpbkNsYXNzSWRdID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZGF0YWJpbnNBcnJheS5saXN0ZW5lcnNbaW5DbGFzc0lkXSA9IFtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbnNBcnJheS5saXN0ZW5lcnNbaW5DbGFzc0lkXS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgbG9hZGVkQnl0ZXNJblJlZ2lzdGVyZWREYXRhYmlucyArPSBkYXRhYmluLmdldExvYWRlZEJ5dGVzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGRhdGFiaW5zQXJyYXkubGlzdGVuZXJzW2luQ2xhc3NJZF0ucHVzaCh7XHJcbiAgICAgICAgICAgIGxpc3RlbmVyOiBsaXN0ZW5lcixcclxuICAgICAgICAgICAgbGlzdGVuZXJUaGlzOiBsaXN0ZW5lclRoaXNcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZGF0YWJpbnNBcnJheS5kYXRhYmluc1dpdGhMaXN0ZW5lcnNbaW5DbGFzc0lkXSA9IGRhdGFiaW47XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbiByZW1vdmVFdmVudExpc3RlbmVyKFxyXG4gICAgICAgIGRhdGFiaW4sIGV2ZW50LCBsaXN0ZW5lcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChldmVudCAhPT0gJ2RhdGFBcnJpdmVkJykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVW5zdXBwb3J0ZWQgZXZlbnQ6ICcgK1xyXG4gICAgICAgICAgICAgICAgZXZlbnQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGNsYXNzSWQgPSBkYXRhYmluLmdldENsYXNzSWQoKTtcclxuICAgICAgICB2YXIgaW5DbGFzc0lkID0gZGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgZGF0YWJpbnNBcnJheSA9IGRhdGFiaW5zQnlDbGFzc1tjbGFzc0lkXTtcclxuICAgICAgICB2YXIgbGlzdGVuZXJzID0gZGF0YWJpbnNBcnJheS5saXN0ZW5lcnNbaW5DbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbiAhPT0gZGF0YWJpbnNBcnJheS5kYXRhYmluc1tpbkNsYXNzSWRdIHx8XHJcbiAgICAgICAgICAgIGRhdGFiaW4gIT09IGRhdGFiaW5zQXJyYXkuZGF0YWJpbnNXaXRoTGlzdGVuZXJzW2luQ2xhc3NJZF0pIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdVbm1hdGNoZWQgZGF0YWJpbiAnICtcclxuICAgICAgICAgICAgICAgICd3aXRoIGNsYXNzLUlEPScgKyBjbGFzc0lkICsgJyBhbmQgaW4tY2xhc3MtSUQ9JyArIGluQ2xhc3NJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChsaXN0ZW5lcnNbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbaV0gPSBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzLmxlbmd0aCAtPSAxO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXJzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBkYXRhYmluc0FycmF5LmRhdGFiaW5zV2l0aExpc3RlbmVyc1tpbkNsYXNzSWRdO1xyXG4gICAgICAgICAgICAgICAgICAgIGxvYWRlZEJ5dGVzSW5SZWdpc3RlcmVkRGF0YWJpbnMgLT0gZGF0YWJpbi5nZXRMb2FkZWRCeXRlcygpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICdDb3VsZCBub3QgdW5yZWdpc3RlciBsaXN0ZW5lciBmcm9tIGRhdGFiaW4nKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2xlYW51cFVucmVnaXN0ZXJlZERhdGFiaW5zID0gZnVuY3Rpb24gY2xlYW51cFVucmVnaXN0ZXJlZERhdGFiaW5zKCkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YWJpbnNCeUNsYXNzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChkYXRhYmluc0J5Q2xhc3NbaV0gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBkYXRhYmlucyA9IGRhdGFiaW5zQnlDbGFzc1tpXS5kYXRhYmluc1dpdGhMaXN0ZW5lcnM7XHJcbiAgICAgICAgICAgIGRhdGFiaW5zQnlDbGFzc1tpXS5kYXRhYmlucyA9IGRhdGFiaW5zLnNsaWNlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGxvYWRlZEJ5dGVzID0gbG9hZGVkQnl0ZXNJblJlZ2lzdGVyZWREYXRhYmlucztcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5zYXZlRGF0YSA9IGZ1bmN0aW9uIChoZWFkZXIsIG1lc3NhZ2UpIHtcclxuICAgICAgICAvLyBBLjIuMlxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChoZWFkZXIuY29kZXN0cmVhbUluZGV4ICE9PSAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnTm9uIHplcm8gQ3NuIChDb2RlIFN0cmVhbSBJbmRleCknLCAnQS4yLjInKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChoZWFkZXIuY2xhc3NJZCkge1xyXG4gICAgICAgICAgICBjYXNlIDY6XHJcbiAgICAgICAgICAgICAgICBzYXZlTWFpbkhlYWRlcihoZWFkZXIsIG1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSA4OlxyXG4gICAgICAgICAgICAgICAgc2F2ZU1ldGFkYXRhKGhlYWRlciwgbWVzc2FnZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAvLyBBLjMuMiwgQS4zLjMsIEEuMy40XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBkYXRhYmluc0FycmF5ID0gZGF0YWJpbnNCeUNsYXNzW2hlYWRlci5jbGFzc0lkXTtcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhYmluc0FycmF5ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBicmVhazsgLy8gQS4yLjJcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGlzSnB0RXhwZWN0ZWQgPSAhIWZvcmJpZGRlbkluSnBwW2hlYWRlci5jbGFzc0lkXTtcclxuICAgICAgICAgICAgICAgIHZhciBkYXRhYmluID0gZ2V0RGF0YWJpbkZyb21BcnJheShcclxuICAgICAgICAgICAgICAgICAgICBkYXRhYmluc0FycmF5LFxyXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlci5jbGFzc0lkLFxyXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlci5pbkNsYXNzSWQsXHJcbiAgICAgICAgICAgICAgICAgICAgaXNKcHRFeHBlY3RlZCxcclxuICAgICAgICAgICAgICAgICAgICAnPGNsYXNzIElEICcgKyBoZWFkZXIuY2xhc3NJZCArICc+Jyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBieXRlc0JlZm9yZSA9IGRhdGFiaW4uZ2V0TG9hZGVkQnl0ZXMoKTtcclxuICAgICAgICAgICAgICAgIGRhdGFiaW4uYWRkRGF0YShoZWFkZXIsIG1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgdmFyIGJ5dGVzRGlmZmVyZW5jZSA9IGRhdGFiaW4uZ2V0TG9hZGVkQnl0ZXMoKSAtIGJ5dGVzQmVmb3JlO1xyXG4gICAgICAgICAgICAgICAgbG9hZGVkQnl0ZXMgKz0gYnl0ZXNEaWZmZXJlbmNlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZGF0YWJpbnNBcnJheS5saXN0ZW5lcnM7XHJcbiAgICAgICAgICAgICAgICB2YXIgZGF0YWJpbkxpc3RlbmVycyA9IGxpc3RlbmVyc1toZWFkZXIuaW5DbGFzc0lkXTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGRhdGFiaW5MaXN0ZW5lcnMgIT09IHVuZGVmaW5lZCAmJiBkYXRhYmluTGlzdGVuZXJzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBsb2FkZWRCeXRlc0luUmVnaXN0ZXJlZERhdGFiaW5zICs9IGJ5dGVzRGlmZmVyZW5jZTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICB2YXIgbG9jYWxMaXN0ZW5lcnMgPSBkYXRhYmluTGlzdGVuZXJzLnNsaWNlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsb2NhbExpc3RlbmVycy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGlzdGVuZXIgPSBsb2NhbExpc3RlbmVyc1tpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIuY2FsbChsaXN0ZW5lci5saXN0ZW5lclRoaXMsIGRhdGFiaW4pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc2F2ZU1haW5IZWFkZXIoaGVhZGVyLCBtZXNzYWdlKSB7XHJcbiAgICAgICAgLy8gQS4zLjVcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaGVhZGVyLmluQ2xhc3NJZCAhPT0gMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oJ01haW4gaGVhZGVyIGRhdGEtYmluIHdpdGggJyArXHJcbiAgICAgICAgICAgICAgICAnaW4tY2xhc3MgaW5kZXggb3RoZXIgdGhhbiB6ZXJvIGlzIG5vdCB2YWxpZCcsICdBLjMuNScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNCZWZvcmUgPSBtYWluSGVhZGVyRGF0YWJpbi5nZXRMb2FkZWRCeXRlcygpO1xyXG4gICAgICAgIG1haW5IZWFkZXJEYXRhYmluLmFkZERhdGEoaGVhZGVyLCBtZXNzYWdlKTtcclxuICAgICAgICB2YXIgYnl0ZXNEaWZmZXJlbmNlID0gbWFpbkhlYWRlckRhdGFiaW4uZ2V0TG9hZGVkQnl0ZXMoKSAtIGJ5dGVzQmVmb3JlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxvYWRlZEJ5dGVzICs9IGJ5dGVzRGlmZmVyZW5jZTtcclxuICAgICAgICBsb2FkZWRCeXRlc0luUmVnaXN0ZXJlZERhdGFiaW5zICs9IGJ5dGVzRGlmZmVyZW5jZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc2F2ZU1ldGFkYXRhKGhlYWRlciwgbWVzc2FnZSkge1xyXG4gICAgICAgIC8vIEEuMy42XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbigncmVjaWV2ZSBtZXRhZGF0YS1iaW4nLCAnQS4zLjYnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBpZ25vcmUgdW51c2VkIG1ldGFkYXRhIChsZWdhbCBhY2NvcmRpbmcgdG8gQS4yLjIpLlxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXREYXRhYmluRnJvbUFycmF5KFxyXG4gICAgICAgIGRhdGFiaW5zQXJyYXksXHJcbiAgICAgICAgY2xhc3NJZCxcclxuICAgICAgICBpbkNsYXNzSWQsXHJcbiAgICAgICAgaXNKcGlwVGlsZVBhcnRTdHJlYW1FeHBlY3RlZCxcclxuICAgICAgICBkYXRhYmluVHlwZURlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzSnBpcFRpbGVQYXJ0U3RyZWFtRXhwZWN0ZWQgIT09IGlzSnBpcFRpbGVQYXJ0U3RyZWFtKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Xcm9uZ1N0cmVhbUV4Y2VwdGlvbignZGF0YWJpbiBvZiB0eXBlICcgK1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpblR5cGVEZXNjcmlwdGlvbiwgaXNKcGlwVGlsZVBhcnRTdHJlYW0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YWJpbiA9IGRhdGFiaW5zQXJyYXkuZGF0YWJpbnNbaW5DbGFzc0lkXTtcclxuICAgICAgICBpZiAoIWRhdGFiaW4pIHtcclxuICAgICAgICAgICAgZGF0YWJpbiA9IGpwaXBGYWN0b3J5LmNyZWF0ZURhdGFiaW5QYXJ0cyhjbGFzc0lkLCBpbkNsYXNzSWQpO1xyXG4gICAgICAgICAgICBkYXRhYmluc0FycmF5LmRhdGFiaW5zW2luQ2xhc3NJZF0gPSBkYXRhYmluO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gZGF0YWJpbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlRGF0YWJpbnNBcnJheSgpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBkYXRhYmluczogW10sXHJcbiAgICAgICAgICAgIGxpc3RlbmVyczogW10sXHJcbiAgICAgICAgICAgIGRhdGFiaW5zV2l0aExpc3RlbmVyczogW11cclxuICAgICAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuSnBpcE9iamVjdFBvb2xCeURhdGFiaW4gPSBmdW5jdGlvbiBKcGlwT2JqZWN0UG9vbEJ5RGF0YWJpbigpIHtcclxuICAgIHZhciBkYXRhYmluSWRUb09iamVjdCA9IFtdO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE9iamVjdCA9IGZ1bmN0aW9uIGdldE9iamVjdChkYXRhYmluKSB7XHJcbiAgICAgICAgdmFyIGNsYXNzSWQgPSBkYXRhYmluLmdldENsYXNzSWQoKTtcclxuICAgICAgICB2YXIgaW5DbGFzc0lkVG9PYmplY3QgPSBkYXRhYmluSWRUb09iamVjdFtjbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaW5DbGFzc0lkVG9PYmplY3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBpbkNsYXNzSWRUb09iamVjdCA9IFtdO1xyXG4gICAgICAgICAgICBkYXRhYmluSWRUb09iamVjdFtjbGFzc0lkXSA9IGluQ2xhc3NJZFRvT2JqZWN0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW5DbGFzc0lkID0gZGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgb2JqID0gaW5DbGFzc0lkVG9PYmplY3RbaW5DbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAob2JqID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgb2JqID0ge307XHJcbiAgICAgICAgICAgIG9iai5kYXRhYmluID0gZGF0YWJpbjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGluQ2xhc3NJZFRvT2JqZWN0W2luQ2xhc3NJZF0gPSBvYmo7XHJcbiAgICAgICAgfSBlbHNlIGlmIChvYmouZGF0YWJpbiAhPT0gZGF0YWJpbikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdEYXRhYmluIElEcyBhcmUgbm90IHVuaXF1ZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gb2JqO1xyXG4gICAgfTtcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIgPSBmdW5jdGlvbiBKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIoXHJcbiAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgIHF1YWxpdHlMYXllclJlYWNoZWRDYWxsYmFjayxcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgcXVhbGl0eUxheWVyc0NhY2hlLFxyXG4gICAganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdmFyIG51bVF1YWxpdHlMYXllcnNUb1dhaXRGb3I7XHJcbiAgICB2YXIgdGlsZUhlYWRlcnNOb3RMb2FkZWQgPSAwO1xyXG4gICAgdmFyIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkID0gMDtcclxuICAgIHZhciB1bnJlZ2lzdGVyZWQgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgdmFyIHJlZ2lzdGVyZWRUaWxlSGVhZGVyRGF0YWJpbnMgPSBbXTtcclxuICAgIHZhciByZWdpc3RlcmVkUHJlY2luY3REYXRhYmlucyA9IFtdO1xyXG4gICAgdmFyIGFjY3VtdWxhdGVkRGF0YVBlckRhdGFiaW4gPSBqcGlwRmFjdG9yeS5jcmVhdGVPYmplY3RQb29sQnlEYXRhYmluKCk7XHJcbiAgICB2YXIgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllciA9IFtdO1xyXG4gICAgXHJcbiAgICByZWdpc3RlcigpO1xyXG4gICAgXHJcbiAgICB0aGlzLnVucmVnaXN0ZXIgPSBmdW5jdGlvbiB1bnJlZ2lzdGVyKCkge1xyXG4gICAgICAgIGlmICh1bnJlZ2lzdGVyZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0ZXJlZFRpbGVIZWFkZXJEYXRhYmlucy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgICAgICAgICByZWdpc3RlcmVkVGlsZUhlYWRlckRhdGFiaW5zW2ldLFxyXG4gICAgICAgICAgICAgICAgJ2RhdGFBcnJpdmVkJyxcclxuICAgICAgICAgICAgICAgIHRpbGVIZWFkZXJEYXRhQXJyaXZlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmVnaXN0ZXJlZFByZWNpbmN0RGF0YWJpbnMubGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlci5yZW1vdmVFdmVudExpc3RlbmVyKFxyXG4gICAgICAgICAgICAgICAgcmVnaXN0ZXJlZFByZWNpbmN0RGF0YWJpbnNbal0sXHJcbiAgICAgICAgICAgICAgICAnZGF0YUFycml2ZWQnLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3REYXRhQXJyaXZlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHVucmVnaXN0ZXJlZCA9IHRydWU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiByZWdpc3RlcigpIHtcclxuICAgICAgICArK3RpbGVIZWFkZXJzTm90TG9hZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlSXRlcmF0b3IgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVzSXRlcmF0b3IoY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgdmFyIHRpbGVJbmRleCA9IHRpbGVJdGVyYXRvci50aWxlSW5kZXg7XHJcbiAgICAgICAgICAgIHZhciBkYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRUaWxlSGVhZGVyRGF0YWJpbih0aWxlSW5kZXgpO1xyXG4gICAgICAgICAgICByZWdpc3RlcmVkVGlsZUhlYWRlckRhdGFiaW5zLnB1c2goZGF0YWJpbik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLmFkZEV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLCAnZGF0YUFycml2ZWQnLCB0aWxlSGVhZGVyRGF0YUFycml2ZWQpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICsrdGlsZUhlYWRlcnNOb3RMb2FkZWQ7XHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJEYXRhQXJyaXZlZChkYXRhYmluKTtcclxuICAgICAgICB9IHdoaWxlICh0aWxlSXRlcmF0b3IudHJ5QWR2YW5jZSgpKTtcclxuICAgICAgICBcclxuICAgICAgICAtLXRpbGVIZWFkZXJzTm90TG9hZGVkO1xyXG4gICAgICAgIHRyeUFkdmFuY2VRdWFsaXR5TGF5ZXJzUmVhY2hlZCgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0aWxlSGVhZGVyRGF0YUFycml2ZWQodGlsZUhlYWRlckRhdGFiaW4pIHtcclxuICAgICAgICBpZiAoIXRpbGVIZWFkZXJEYXRhYmluLmlzQWxsRGF0YWJpbkxvYWRlZCgpKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVBY2N1bXVsYXRlZERhdGEgPSBhY2N1bXVsYXRlZERhdGFQZXJEYXRhYmluLmdldE9iamVjdChcclxuICAgICAgICAgICAgdGlsZUhlYWRlckRhdGFiaW4pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlQWNjdW11bGF0ZWREYXRhLmlzQWxyZWFkeUxvYWRlZCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRpbGVBY2N1bXVsYXRlZERhdGEuaXNBbHJlYWR5TG9hZGVkID0gdHJ1ZTtcclxuICAgICAgICAtLXRpbGVIZWFkZXJzTm90TG9hZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlSW5kZXggPSB0aWxlSGVhZGVyRGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgdGlsZVN0cnVjdHVyZSA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVN0cnVjdHVyZSh0aWxlSW5kZXgpO1xyXG4gICAgICAgIHZhciBtYXhOdW1RdWFsaXR5TGF5ZXJzSW5UaWxlID0gdGlsZVN0cnVjdHVyZS5nZXROdW1RdWFsaXR5TGF5ZXJzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0SXRlcmF0b3IgPSB0aWxlU3RydWN0dXJlLmdldFByZWNpbmN0SXRlcmF0b3IoXHJcbiAgICAgICAgICAgIHRpbGVJbmRleCwgY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG5cclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIGlmICghcHJlY2luY3RJdGVyYXRvci5pc0luQ29kZXN0cmVhbVBhcnQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIHByZWNpbmN0IG5vdCBpbiBjb2Rlc3RyZWFtIHBhcnQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGluQ2xhc3NJZCA9IHRpbGVTdHJ1Y3R1cmUucHJlY2luY3RQb3NpdGlvblRvSW5DbGFzc0luZGV4KFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RJdGVyYXRvcik7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHByZWNpbmN0RGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0UHJlY2luY3REYXRhYmluKGluQ2xhc3NJZCk7XHJcbiAgICAgICAgICAgIHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zLnB1c2gocHJlY2luY3REYXRhYmluKTtcclxuICAgICAgICAgICAgdmFyIGFjY3VtdWxhdGVkRGF0YSA9IGFjY3VtdWxhdGVkRGF0YVBlckRhdGFiaW4uZ2V0T2JqZWN0KFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhY2N1bXVsYXRlZERhdGEubWF4TnVtUXVhbGl0eUxheWVyc0luVGlsZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVGlsZSB3YXMgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2l0ZXJhdGVkIHR3aWNlIGluIGNvZGVzdHJlYW0gcGFydCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBhY2N1bXVsYXRlZERhdGEubWF4TnVtUXVhbGl0eUxheWVyc0luVGlsZSA9IG1heE51bVF1YWxpdHlMYXllcnNJblRpbGU7XHJcbiAgICAgICAgICAgIGluY3JlbWVudFByZWNpbmN0UXVhbGl0eUxheWVycyhcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgYWNjdW11bGF0ZWREYXRhLCBwcmVjaW5jdEl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIuYWRkRXZlbnRMaXN0ZW5lcihcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgJ2RhdGFBcnJpdmVkJywgcHJlY2luY3REYXRhQXJyaXZlZCk7XHJcbiAgICAgICAgfSB3aGlsZSAocHJlY2luY3RJdGVyYXRvci50cnlBZHZhbmNlKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRyeUFkdmFuY2VRdWFsaXR5TGF5ZXJzUmVhY2hlZCgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwcmVjaW5jdERhdGFBcnJpdmVkKHByZWNpbmN0RGF0YWJpbikge1xyXG4gICAgICAgIHZhciBhY2N1bXVsYXRlZERhdGEgPSBhY2N1bXVsYXRlZERhdGFQZXJEYXRhYmluLmdldE9iamVjdChcclxuICAgICAgICAgICAgcHJlY2luY3REYXRhYmluKTtcclxuXHJcbiAgICAgICAgdmFyIG9sZFF1YWxpdHlMYXllcnNSZWFjaGVkID0gYWNjdW11bGF0ZWREYXRhLm51bVF1YWxpdHlMYXllcnNSZWFjaGVkO1xyXG4gICAgICAgIHZhciBtYXhOdW1RdWFsaXR5TGF5ZXJzSW5UaWxlID1cclxuICAgICAgICAgICAgYWNjdW11bGF0ZWREYXRhLm1heE51bVF1YWxpdHlMYXllcnNJblRpbGU7XHJcblxyXG4gICAgICAgIGlmIChvbGRRdWFsaXR5TGF5ZXJzUmVhY2hlZCA9PT0gbWF4TnVtUXVhbGl0eUxheWVyc0luVGlsZSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC0tcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltvbGRRdWFsaXR5TGF5ZXJzUmVhY2hlZF07XHJcbiAgICAgICAgaW5jcmVtZW50UHJlY2luY3RRdWFsaXR5TGF5ZXJzKHByZWNpbmN0RGF0YWJpbiwgYWNjdW11bGF0ZWREYXRhKTtcclxuICAgICAgICBcclxuICAgICAgICB0cnlBZHZhbmNlUXVhbGl0eUxheWVyc1JlYWNoZWQoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW5jcmVtZW50UHJlY2luY3RRdWFsaXR5TGF5ZXJzKFxyXG4gICAgICAgIHByZWNpbmN0RGF0YWJpbiwgYWNjdW11bGF0ZWREYXRhLCBwcmVjaW5jdEl0ZXJhdG9yT3B0aW9uYWwpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcXVhbGl0eUxheWVycyA9IHF1YWxpdHlMYXllcnNDYWNoZS5nZXRRdWFsaXR5TGF5ZXJPZmZzZXQoXHJcbiAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbixcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4TnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICAgICAgcHJlY2luY3RJdGVyYXRvck9wdGlvbmFsKTtcclxuXHJcbiAgICAgICAgdmFyIG51bVF1YWxpdHlMYXllcnNSZWFjaGVkID0gcXVhbGl0eUxheWVycy5udW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgICAgIGFjY3VtdWxhdGVkRGF0YS5udW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCA9IG51bVF1YWxpdHlMYXllcnNSZWFjaGVkO1xyXG5cclxuICAgICAgICB2YXIgbWF4TnVtUXVhbGl0eUxheWVyc0luVGlsZSA9XHJcbiAgICAgICAgICAgIGFjY3VtdWxhdGVkRGF0YS5tYXhOdW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG5cclxuICAgICAgICBpZiAobnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPT09IG1heE51bVF1YWxpdHlMYXllcnNJblRpbGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJldkNvdW50ID1cclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltudW1RdWFsaXR5TGF5ZXJzUmVhY2hlZF0gfHwgMDtcclxuICAgICAgICBcclxuICAgICAgICBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyW251bVF1YWxpdHlMYXllcnNSZWFjaGVkXSA9XHJcbiAgICAgICAgICAgIHByZXZDb3VudCArIDE7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUFkdmFuY2VRdWFsaXR5TGF5ZXJzUmVhY2hlZCgpIHtcclxuICAgICAgICBpZiAocHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllclttaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZF0gPiAwIHx8XHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkID09PSAnbWF4JyB8fFxyXG4gICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCA+PSBudW1RdWFsaXR5TGF5ZXJzVG9XYWl0Rm9yIHx8XHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJzTm90TG9hZGVkID4gMCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaGFzUHJlY2luY3RzSW5RdWFsaXR5TGF5ZXI7XHJcbiAgICAgICAgdmFyIG1heFF1YWxpdHlMYXllcnMgPSBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyLmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgICsrbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPj0gbWF4UXVhbGl0eUxheWVycykge1xyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPSAnbWF4JztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBoYXNQcmVjaW5jdHNJblF1YWxpdHlMYXllciA9XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyW21pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkXSA+IDA7XHJcbiAgICAgICAgfSB3aGlsZSAoIWhhc1ByZWNpbmN0c0luUXVhbGl0eUxheWVyKTtcclxuICAgICAgICBcclxuICAgICAgICBxdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2sobWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBlbnN1cmVRdWFsaXR5TGF5ZXJzU3RhdGlzdGljc0ZvckRlYnVnKCkge1xyXG4gICAgICAgIHZhciBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyRXhwZWN0ZWQgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHZhciBhY2N1bXVsYXRlZERhdGEgPSBhY2N1bXVsYXRlZERhdGFQZXJEYXRhYmluLmdldE9iamVjdChcclxuICAgICAgICAgICAgICAgIHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zW2ldKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBtYXhOdW1RdWFsaXR5TGF5ZXJzSW5UaWxlID1cclxuICAgICAgICAgICAgICAgIGFjY3VtdWxhdGVkRGF0YS5tYXhOdW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtYXhOdW1RdWFsaXR5TGF5ZXJzSW5UaWxlID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdObyBpbmZvcm1hdGlvbiBvZiBtYXhOdW1RdWFsaXR5TGF5ZXJzSW5UaWxlIGluICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXInKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHF1YWxpdHlMYXllcnMgPSBxdWFsaXR5TGF5ZXJzQ2FjaGUuZ2V0UXVhbGl0eUxheWVyT2Zmc2V0KFxyXG4gICAgICAgICAgICAgICAgcmVnaXN0ZXJlZFByZWNpbmN0RGF0YWJpbnNbaV0sXHJcbiAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5tYXhOdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChxdWFsaXR5TGF5ZXJzLm51bVF1YWxpdHlMYXllcnMgPT09IG1heE51bVF1YWxpdHlMYXllcnNJblRpbGUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb2xkVmFsdWUgPSBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyRXhwZWN0ZWRbXHJcbiAgICAgICAgICAgICAgICBxdWFsaXR5TGF5ZXJzLm51bVF1YWxpdHlMYXllcnNdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllckV4cGVjdGVkW1xyXG4gICAgICAgICAgICAgICAgcXVhbGl0eUxheWVycy5udW1RdWFsaXR5TGF5ZXJzXSA9IChvbGRWYWx1ZSB8fCAwKSArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZW5ndGggPSBNYXRoLm1heChcclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllckV4cGVjdGVkLmxlbmd0aCxcclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllci5sZW5ndGgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWRFeHBlY3RlZCA9ICdtYXgnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgdmFyIGlzRXhwZWN0ZWRaZXJvID0gKHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJFeHBlY3RlZFtqXSB8fCAwKSA9PT0gMDtcclxuICAgICAgICAgICAgdmFyIGlzQWN0dWFsWmVybyA9IChwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyW2pdIHx8IDApID09PSAwO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzRXhwZWN0ZWRaZXJvICE9PSBpc0FjdHVhbFplcm8pIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdXcm9uZyBhY2N1bXVsYXRlZCBzdGF0aXN0aWNzIGluIEpwaXBSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaXNFeHBlY3RlZFplcm8pIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltqXSAhPT1cclxuICAgICAgICAgICAgICAgIHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJFeHBlY3RlZFtqXSkge1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignV3JvbmcgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2FjY3VtdWxhdGVkIHN0YXRpc3RpY3MgaW4gSnBpcFJlcXVlc3REYXRhYmluc0xpc3RlbmVyJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZEV4cGVjdGVkID09PSAnbWF4Jykge1xyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWRFeHBlY3RlZCA9IGo7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkICE9PSBtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZEV4cGVjdGVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ1dyb25nIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkIGluIEpwaXBSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwQ29kZXN0cmVhbVN0cnVjdHVyZSA9IGZ1bmN0aW9uIEpwaXBDb2Rlc3RyZWFtU3RydWN0dXJlKFxyXG4gICAganBpcFN0cnVjdHVyZVBhcnNlcixcclxuICAgIGpwaXBGYWN0b3J5LFxyXG4gICAgcHJvZ3Jlc3Npb25PcmRlcikge1xyXG5cclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHZhciBwYXJhbXM7XHJcbiAgICB2YXIgc2l6ZXNDYWxjdWxhdG9yO1xyXG4gICAgXHJcbiAgICB2YXIgZGVmYXVsdFRpbGVTdHJ1Y3R1cmVCeUVkZ2VUeXBlO1xyXG5cclxuICAgIHZhciBjYWNoZWRUaWxlU3RydWN0dXJlcyA9IFtdO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFNpemVzUGFyYW1zID0gZnVuY3Rpb24gZ2V0U2l6ZXNQYXJhbXMoKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICByZXR1cm4gcGFyYW1zO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1UaWxlc1ggPSBmdW5jdGlvbiBnZXROdW1UaWxlc1goKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtVGlsZXMgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgcmV0dXJuIG51bVRpbGVzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1UaWxlc1kgPSBmdW5jdGlvbiBnZXROdW1UaWxlc1koKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtVGlsZXMgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgcmV0dXJuIG51bVRpbGVzO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmdldE51bUNvbXBvbmVudHMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIHJldHVybiBwYXJhbXMubnVtQ29tcG9uZW50cztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SW1hZ2VXaWR0aCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcblxyXG4gICAgICAgIHZhciBzaXplID0gc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsV2lkdGgoKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SW1hZ2VIZWlnaHQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRMZXZlbEhlaWdodCgpO1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZXZlbFdpZHRoID0gZnVuY3Rpb24obnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIHNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWxXaWR0aChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZXZlbEhlaWdodCA9IGZ1bmN0aW9uKG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcblxyXG4gICAgICAgIHZhciBzaXplID0gc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsSGVpZ2h0KG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgcmV0dXJuIHNpemU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVXaWR0aCA9IGZ1bmN0aW9uKG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcblxyXG4gICAgICAgIHZhciBzaXplID0gc2l6ZXNDYWxjdWxhdG9yLmdldFRpbGVXaWR0aChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlSGVpZ2h0ID0gZnVuY3Rpb24obnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIHNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0VGlsZUhlaWdodChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRGaXJzdFRpbGVPZmZzZXRYID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIG9mZnNldCA9IHNpemVzQ2FsY3VsYXRvci5nZXRGaXJzdFRpbGVPZmZzZXRYKCk7XHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RUaWxlT2Zmc2V0WSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcblxyXG4gICAgICAgIHZhciBvZmZzZXQgPSBzaXplc0NhbGN1bGF0b3IuZ2V0Rmlyc3RUaWxlT2Zmc2V0WSgpO1xyXG4gICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVMZWZ0ID0gZnVuY3Rpb24gZ2V0VGlsZUxlZnQoXHJcbiAgICAgICAgdGlsZUluZGV4LCBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlWCA9IHRpbGVJbmRleCAlIHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1goKTtcclxuICAgICAgICBpZiAodGlsZVggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlTGVmdCA9XHJcbiAgICAgICAgICAgICh0aWxlWCAtIDEpICogc2l6ZXNDYWxjdWxhdG9yLmdldFRpbGVXaWR0aChudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpICtcclxuICAgICAgICAgICAgc2l6ZXNDYWxjdWxhdG9yLmdldEZpcnN0VGlsZVdpZHRoKG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRpbGVMZWZ0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlVG9wID0gZnVuY3Rpb24gZ2V0VGlsZVRvcCh0aWxlSW5kZXgsIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVZID0gTWF0aC5mbG9vcih0aWxlSW5kZXggLyBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCkpO1xyXG4gICAgICAgIGlmICh0aWxlWSA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVUb3AgPVxyXG4gICAgICAgICAgICAodGlsZVkgLSAxKSAqIHNpemVzQ2FsY3VsYXRvci5nZXRUaWxlSGVpZ2h0KG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkgK1xyXG4gICAgICAgICAgICBzaXplc0NhbGN1bGF0b3IuZ2V0Rmlyc3RUaWxlSGVpZ2h0KG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRpbGVUb3A7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldERlZmF1bHRUaWxlU3RydWN0dXJlID0gZnVuY3Rpb24gZ2V0RGVmYXVsdFRpbGVTdHJ1Y3R1cmUoKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gZ2V0RGVmYXVsdFRpbGVTdHJ1Y3R1cmVJbnRlcm5hbCh7XHJcbiAgICAgICAgICAgIGhvcml6b250YWxFZGdlVHlwZTogc2l6ZXNDYWxjdWxhdG9yLkVER0VfVFlQRV9OT19FREdFLFxyXG4gICAgICAgICAgICB2ZXJ0aWNhbEVkZ2VUeXBlOiBzaXplc0NhbGN1bGF0b3IuRURHRV9UWVBFX05PX0VER0VcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVTdHJ1Y3R1cmUgPSBnZXRUaWxlU3RydWN0dXJlO1xyXG5cclxuICAgIHRoaXMudGlsZVBvc2l0aW9uVG9JbkNsYXNzSW5kZXggPSBmdW5jdGlvbih0aWxlUG9zaXRpb24pIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIHZhciB0aWxlc1ggPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgdmFyIHRpbGVzWSA9IHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1koKTtcclxuICAgICAgICBcclxuICAgICAgICB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZSgndGlsZVBvc2l0aW9uLnRpbGVYJywgdGlsZVBvc2l0aW9uLnRpbGVYLCB0aWxlc1gpO1xyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKCd0aWxlUG9zaXRpb24udGlsZVknLCB0aWxlUG9zaXRpb24udGlsZVksIHRpbGVzWSk7XHJcblxyXG4gICAgICAgIHZhciBpbkNsYXNzSW5kZXggPSB0aWxlUG9zaXRpb24udGlsZVggKyB0aWxlUG9zaXRpb24udGlsZVkgKiB0aWxlc1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGluQ2xhc3NJbmRleDtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy50aWxlSW5DbGFzc0luZGV4VG9Qb3NpdGlvbiA9IGZ1bmN0aW9uKGluQ2xhc3NJbmRleCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgdmFyIHRpbGVzWCA9IHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1goKTtcclxuICAgICAgICB2YXIgdGlsZXNZID0gc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIHZhciBudW1UaWxlcyA9IHRpbGVzWCAqIHRpbGVzWTtcclxuXHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoJ2luQ2xhc3NJbmRleCcsIGluQ2xhc3NJbmRleCwgdGlsZXNYICogdGlsZXNZKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVggPSBpbkNsYXNzSW5kZXggJSB0aWxlc1g7XHJcbiAgICAgICAgdmFyIHRpbGVZID0gKGluQ2xhc3NJbmRleCAtIHRpbGVYKSAvIHRpbGVzWDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICB0aWxlWDogdGlsZVgsXHJcbiAgICAgICAgICAgIHRpbGVZOiB0aWxlWVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVzSXRlcmF0b3IgPSBmdW5jdGlvbiBnZXRUaWxlc0l0ZXJhdG9yKGNvZGVzdHJlYW1QYXJ0UGFyYW1zKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICB2YXIgYm91bmRzID0gc2l6ZXNDYWxjdWxhdG9yLmdldFRpbGVzRnJvbVBpeGVscyhjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNldGFibGVJdGVyYXRvciA9IHtcclxuICAgICAgICAgICAgY3VycmVudFg6IGJvdW5kcy5taW5UaWxlWCxcclxuICAgICAgICAgICAgY3VycmVudFk6IGJvdW5kcy5taW5UaWxlWVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0ge1xyXG4gICAgICAgICAgICBnZXQgdGlsZUluZGV4KCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0SW5Sb3cgPVxyXG4gICAgICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5jdXJyZW50WSAqIHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1goKTtcclxuICAgICAgICAgICAgICAgIHZhciBpbmRleCA9IGZpcnN0SW5Sb3cgKyBzZXRhYmxlSXRlcmF0b3IuY3VycmVudFg7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRyeUFkdmFuY2U6IGZ1bmN0aW9uIHRyeUFkdmFuY2UoKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gdHJ5QWR2YW5jZVRpbGVJdGVyYXRvcihzZXRhYmxlSXRlcmF0b3IsIGJvdW5kcyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXRlcmF0b3I7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFNpemVPZlBhcnQgPSBmdW5jdGlvbiBnZXRTaXplT2ZQYXJ0KGNvZGVzdHJlYW1QYXJ0UGFyYW1zKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRTaXplT2ZQYXJ0KGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUFkdmFuY2VUaWxlSXRlcmF0b3Ioc2V0YWJsZUl0ZXJhdG9yLCBib3VuZHMpIHtcclxuICAgICAgICBpZiAoc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRZID49IGJvdW5kcy5tYXhUaWxlWUV4Y2x1c2l2ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdDYW5ub3QgYWR2YW5jZSB0aWxlIGl0ZXJhdG9yIGFmdGVyIGVuZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICArK3NldGFibGVJdGVyYXRvci5jdXJyZW50WDtcclxuICAgICAgICBpZiAoc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRYIDwgYm91bmRzLm1heFRpbGVYRXhjbHVzaXZlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXRhYmxlSXRlcmF0b3IuY3VycmVudFggPSBib3VuZHMubWluVGlsZVg7XHJcbiAgICAgICAgKytzZXRhYmxlSXRlcmF0b3IuY3VycmVudFk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzTW9yZVRpbGVzQXZhaWxhYmxlID1cclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRZIDwgYm91bmRzLm1heFRpbGVZRXhjbHVzaXZlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBpc01vcmVUaWxlc0F2YWlsYWJsZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0VGlsZVN0cnVjdHVyZSh0aWxlSWQpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhUaWxlSWQgPVxyXG4gICAgICAgICAgICBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCkgKiBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNZKCktIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRpbGVJZCA8IDAgfHwgdGlsZUlkID4gbWF4VGlsZUlkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICd0aWxlSWQnLFxyXG4gICAgICAgICAgICAgICAgdGlsZUlkLFxyXG4gICAgICAgICAgICAgICAgJ0V4cGVjdGVkIHZhbHVlIGJldHdlZW4gMCBhbmQgJyArIG1heFRpbGVJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc0VkZ2UgPSBzaXplc0NhbGN1bGF0b3IuaXNFZGdlVGlsZUlkKHRpbGVJZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNhY2hlZFRpbGVTdHJ1Y3R1cmVzW3RpbGVJZF0gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB2YXIgdGlsZVBhcmFtcyA9IGpwaXBTdHJ1Y3R1cmVQYXJzZXIucGFyc2VPdmVycmlkZW5UaWxlUGFyYW1zKHRpbGVJZCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoISF0aWxlUGFyYW1zKSB7XHJcbiAgICAgICAgICAgICAgICBjYWNoZWRUaWxlU3RydWN0dXJlc1t0aWxlSWRdID0gY3JlYXRlVGlsZVN0cnVjdHVyZSh0aWxlUGFyYW1zLCBpc0VkZ2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY2FjaGVkVGlsZVN0cnVjdHVyZXNbdGlsZUlkXSA9IG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNhY2hlZFRpbGVTdHJ1Y3R1cmVzW3RpbGVJZF0pIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFRpbGVTdHJ1Y3R1cmVzW3RpbGVJZF07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSBnZXREZWZhdWx0VGlsZVN0cnVjdHVyZUludGVybmFsKGlzRWRnZSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZShwYXJhbU5hbWUsIHBhcmFtVmFsdWUsIHN1cHJpbXVtUGFyYW1WYWx1ZSkge1xyXG4gICAgICAgIGlmIChwYXJhbVZhbHVlIDwgMCB8fCBwYXJhbVZhbHVlID49IHN1cHJpbXVtUGFyYW1WYWx1ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICBwYXJhbU5hbWUsXHJcbiAgICAgICAgICAgICAgICBwYXJhbVZhbHVlLFxyXG4gICAgICAgICAgICAgICAgcGFyYW1OYW1lICsgJyBpcyBleHBlY3RlZCB0byBiZSBiZXR3ZWVuIDAgYW5kICcgKyBzdXByaW11bVBhcmFtVmFsdWUgLSAxKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldERlZmF1bHRUaWxlU3RydWN0dXJlSW50ZXJuYWwoZWRnZVR5cGUpIHtcclxuICAgICAgICBpZiAoIWRlZmF1bHRUaWxlU3RydWN0dXJlQnlFZGdlVHlwZSkge1xyXG4gICAgICAgICAgICB2YXIgZGVmYXVsdFRpbGVQYXJhbXMgPSBqcGlwU3RydWN0dXJlUGFyc2VyLnBhcnNlRGVmYXVsdFRpbGVQYXJhbXMoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRlZmF1bHRUaWxlU3RydWN0dXJlQnlFZGdlVHlwZSA9IG5ldyBBcnJheSgzKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGhvcml6b250YWxFZGdlID0gMDsgaG9yaXpvbnRhbEVkZ2UgPCAzOyArK2hvcml6b250YWxFZGdlKSB7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0VGlsZVN0cnVjdHVyZUJ5RWRnZVR5cGVbaG9yaXpvbnRhbEVkZ2VdID0gbmV3IEFycmF5KDMpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciB2ZXJ0aWNhbEVkZ2UgPSAwOyB2ZXJ0aWNhbEVkZ2UgPCAzOyArK3ZlcnRpY2FsRWRnZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBlZGdlID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBob3Jpem9udGFsRWRnZVR5cGU6IGhvcml6b250YWxFZGdlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0aWNhbEVkZ2VUeXBlOiB2ZXJ0aWNhbEVkZ2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0VGlsZVN0cnVjdHVyZUJ5RWRnZVR5cGVbaG9yaXpvbnRhbEVkZ2VdW3ZlcnRpY2FsRWRnZV0gPVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjcmVhdGVUaWxlU3RydWN0dXJlKGRlZmF1bHRUaWxlUGFyYW1zLCBlZGdlKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3RydWN0dXJlQnlWZXJ0aWNhbFR5cGUgPVxyXG4gICAgICAgICAgICBkZWZhdWx0VGlsZVN0cnVjdHVyZUJ5RWRnZVR5cGVbZWRnZVR5cGUuaG9yaXpvbnRhbEVkZ2VUeXBlXTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVN0cnVjdHVyZSA9IHN0cnVjdHVyZUJ5VmVydGljYWxUeXBlW2VkZ2VUeXBlLnZlcnRpY2FsRWRnZVR5cGVdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aWxlU3RydWN0dXJlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVUaWxlU3RydWN0dXJlKHRpbGVQYXJhbXMsIGVkZ2VUeXBlKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6ZVBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodGlsZVBhcmFtcykpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNpemVQYXJhbXMudGlsZVNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0VGlsZVNpemUoZWRnZVR5cGUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNpemVQYXJhbXMuZGVmYXVsdENvbXBvbmVudFBhcmFtcy5zY2FsZVggPSAxO1xyXG4gICAgICAgIHNpemVQYXJhbXMuZGVmYXVsdENvbXBvbmVudFBhcmFtcy5zY2FsZVkgPSAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2l6ZVBhcmFtcy5wYXJhbXNQZXJDb21wb25lbnQubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgc2l6ZVBhcmFtcy5wYXJhbXNQZXJDb21wb25lbnRbaV0uc2NhbGVYID0gcGFyYW1zLmNvbXBvbmVudHNTY2FsZVhbaV07XHJcbiAgICAgICAgICAgIHNpemVQYXJhbXMucGFyYW1zUGVyQ29tcG9uZW50W2ldLnNjYWxlWSA9IHBhcmFtcy5jb21wb25lbnRzU2NhbGVZW2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVN0cnVjdHVyZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZVRpbGVTdHJ1Y3R1cmUoc2l6ZVBhcmFtcywgc2VsZiwgcHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRpbGVTdHJ1Y3R1cmU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlUGFyYW1zKHNlbGYpIHtcclxuICAgICAgICBpZiAoIXBhcmFtcykge1xyXG4gICAgICAgICAgICBwYXJhbXMgPSBqcGlwU3RydWN0dXJlUGFyc2VyLnBhcnNlQ29kZXN0cmVhbVN0cnVjdHVyZSgpO1xyXG4gICAgICAgICAgICBzaXplc0NhbGN1bGF0b3IgPSBqcGlwRmFjdG9yeS5jcmVhdGVDb2Rlc3RyZWFtU2l6ZXNDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICAgICAgcGFyYW1zKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBDb21wb25lbnRTdHJ1Y3R1cmUgPSBmdW5jdGlvbiBKcGlwQ29tcG9uZW50U3RydWN0dXJlKFxyXG4gICAgcGFyYW1zLCB0aWxlU3RydWN0dXJlKSB7XHJcbiAgICBcclxuICAgIHZhciB0aWxlV2lkdGhMZXZlbDA7XHJcbiAgICB2YXIgdGlsZUhlaWdodExldmVsMDtcclxuICAgIFxyXG4gICAgaW5pdGlhbGl6ZSgpO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENvbXBvbmVudFNjYWxlWCA9IGZ1bmN0aW9uIGdldENvbXBvbmVudFNjYWxlWCgpIHtcclxuICAgICAgICByZXR1cm4gcGFyYW1zLnNjYWxlWDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q29tcG9uZW50U2NhbGVZID0gZnVuY3Rpb24gZ2V0Q29tcG9uZW50U2NhbGVZKCkge1xyXG4gICAgICAgIHJldHVybiBwYXJhbXMuc2NhbGVZO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQcmVjaW5jdFdpZHRoID0gZnVuY3Rpb24ocmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIHdpZHRoID0gcGFyYW1zLnByZWNpbmN0V2lkdGhQZXJMZXZlbFtyZXNvbHV0aW9uTGV2ZWxdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB3aWR0aDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UHJlY2luY3RIZWlnaHQgPSBmdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpIHtcclxuICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyYW1zLnByZWNpbmN0SGVpZ2h0UGVyTGV2ZWxbcmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaGVpZ2h0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRNYXhDb2RlYmxvY2tXaWR0aCA9IGZ1bmN0aW9uIGdldE1heENvZGVibG9ja1dpZHRoKCkge1xyXG4gICAgICAgIHZhciB3aWR0aCA9IHBhcmFtcy5tYXhDb2RlYmxvY2tXaWR0aDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gd2lkdGg7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE1heENvZGVibG9ja0hlaWdodCA9IGZ1bmN0aW9uIGdldE1heENvZGVibG9ja0hlaWdodCgpIHtcclxuICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyYW1zLm1heENvZGVibG9ja0hlaWdodDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaGVpZ2h0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1Db2RlYmxvY2tzWEluUHJlY2luY3QgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldE51bUNvZGVibG9ja3NYKHByZWNpbmN0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvZGVibG9ja3NYID0gY2FsY3VsYXRlTnVtQ29kZWJsb2NrcyhcclxuICAgICAgICAgICAgcHJlY2luY3QsXHJcbiAgICAgICAgICAgIHByZWNpbmN0LnByZWNpbmN0WCxcclxuICAgICAgICAgICAgcGFyYW1zLm1heENvZGVibG9ja1dpZHRoLFxyXG4gICAgICAgICAgICBwYXJhbXMucHJlY2luY3RXaWR0aFBlckxldmVsLFxyXG4gICAgICAgICAgICB0aWxlV2lkdGhMZXZlbDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudW1Db2RlYmxvY2tzWDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtQ29kZWJsb2Nrc1lJblByZWNpbmN0ID1cclxuICAgICAgICBmdW5jdGlvbiBnZXROdW1Db2RlYmxvY2tzWShwcmVjaW5jdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1Db2RlYmxvY2tzWSA9IGNhbGN1bGF0ZU51bUNvZGVibG9ja3MoXHJcbiAgICAgICAgICAgIHByZWNpbmN0LFxyXG4gICAgICAgICAgICBwcmVjaW5jdC5wcmVjaW5jdFksXHJcbiAgICAgICAgICAgIHBhcmFtcy5tYXhDb2RlYmxvY2tIZWlnaHQsXHJcbiAgICAgICAgICAgIHBhcmFtcy5wcmVjaW5jdEhlaWdodFBlckxldmVsLFxyXG4gICAgICAgICAgICB0aWxlSGVpZ2h0TGV2ZWwwKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVtQ29kZWJsb2Nrc1k7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuZ2V0TnVtUHJlY2luY3RzWCA9IGZ1bmN0aW9uKHJlc29sdXRpb25MZXZlbCkge1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNYID0gY2FsY3VsYXRlTnVtUHJlY2luY3RzKFxyXG4gICAgICAgICAgICB0aWxlV2lkdGhMZXZlbDAsIHBhcmFtcy5wcmVjaW5jdFdpZHRoUGVyTGV2ZWwsIHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwcmVjaW5jdHNYO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1QcmVjaW5jdHNZID0gZnVuY3Rpb24ocmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1kgPSBjYWxjdWxhdGVOdW1QcmVjaW5jdHMoXHJcbiAgICAgICAgICAgIHRpbGVIZWlnaHRMZXZlbDAsIHBhcmFtcy5wcmVjaW5jdEhlaWdodFBlckxldmVsLCByZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gcHJlY2luY3RzWTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNhbGN1bGF0ZU51bVByZWNpbmN0cyhcclxuICAgICAgICB0aWxlU2l6ZUxldmVsMCwgcHJlY2luY3RTaXplUGVyTGV2ZWwsIHJlc29sdXRpb25MZXZlbCkge1xyXG4gICAgXHJcbiAgICAgICAgdmFyIHJlc29sdXRpb25GYWN0b3IgPSBnZXRSZXNvbHV0aW9uRmFjdG9yKHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgdmFyIHRpbGVTaXplSW5MZXZlbCA9IHRpbGVTaXplTGV2ZWwwIC8gcmVzb2x1dGlvbkZhY3RvcjtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RTaXplSW5MZXZlbCA9IHByZWNpbmN0U2l6ZVBlckxldmVsW3Jlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVByZWNpbmN0cyA9IE1hdGguY2VpbCh0aWxlU2l6ZUluTGV2ZWwgLyBwcmVjaW5jdFNpemVJbkxldmVsKTtcclxuICAgICAgICByZXR1cm4gbnVtUHJlY2luY3RzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjYWxjdWxhdGVOdW1Db2RlYmxvY2tzKFxyXG4gICAgICAgIHByZWNpbmN0LFxyXG4gICAgICAgIHByZWNpbmN0SW5kZXgsXHJcbiAgICAgICAgbWF4Q29kZWJsb2NrU2l6ZSxcclxuICAgICAgICBwcmVjaW5jdFNpemVQZXJMZXZlbCxcclxuICAgICAgICB0aWxlU2l6ZUxldmVsMCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXNvbHV0aW9uRmFjdG9yID0gZ2V0UmVzb2x1dGlvbkZhY3RvcihwcmVjaW5jdC5yZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIHZhciB0aWxlU2l6ZUluTGV2ZWwgPSBNYXRoLmNlaWwodGlsZVNpemVMZXZlbDAgLyByZXNvbHV0aW9uRmFjdG9yKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RCZWdpblBpeGVsID1cclxuICAgICAgICAgICAgcHJlY2luY3RJbmRleCAqIHByZWNpbmN0U2l6ZVBlckxldmVsW3ByZWNpbmN0LnJlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0U2l6ZSA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICBwcmVjaW5jdFNpemVQZXJMZXZlbFtwcmVjaW5jdC5yZXNvbHV0aW9uTGV2ZWxdLFxyXG4gICAgICAgICAgICB0aWxlU2l6ZUluTGV2ZWwgLSBwcmVjaW5jdEJlZ2luUGl4ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdWJiYW5kVHlwZUZhY3RvciA9IHByZWNpbmN0LnJlc29sdXRpb25MZXZlbCA9PT0gMCA/IDEgOiAyO1xyXG4gICAgICAgIHZhciBzdWJiYW5kT2ZQcmVjaW5jdFNpemUgPSBNYXRoLmNlaWwocHJlY2luY3RTaXplIC8gc3ViYmFuZFR5cGVGYWN0b3IpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1Db2RlYmxvY2tzID0gc3ViYmFuZFR5cGVGYWN0b3IgKiBNYXRoLmNlaWwoXHJcbiAgICAgICAgICAgIHN1YmJhbmRPZlByZWNpbmN0U2l6ZSAvIG1heENvZGVibG9ja1NpemUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcmVjaW5jdFNpemUgJSBtYXhDb2RlYmxvY2tTaXplID09PSAxICYmXHJcbiAgICAgICAgICAgIHByZWNpbmN0LnJlc29sdXRpb25MZXZlbCA+IDApIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC0tbnVtQ29kZWJsb2NrcztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bUNvZGVibG9ja3M7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFJlc29sdXRpb25GYWN0b3IocmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIGRpZmZlcmVuY2VGcm9tQmVzdExldmVsID0gcGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMgLSByZXNvbHV0aW9uTGV2ZWwgLSAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmYWN0b3IgPSAxIDw8IGRpZmZlcmVuY2VGcm9tQmVzdExldmVsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBmYWN0b3I7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGluaXRpYWxpemUoKSB7XHJcbiAgICAgICAgaWYgKHBhcmFtcy5zY2FsZVggIT09IDEgfHwgcGFyYW1zLnNjYWxlWSAhPT0gMSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnTm9uIDEgY29tcG9uZW50IHNjYWxlJywgJ0EuNS4xJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRpbGVXaWR0aExldmVsMCA9IE1hdGguZmxvb3IoXHJcbiAgICAgICAgICAgIHRpbGVTdHJ1Y3R1cmUuZ2V0VGlsZVdpZHRoKCkgLyBwYXJhbXMuc2NhbGVYKTtcclxuICAgICAgICB0aWxlSGVpZ2h0TGV2ZWwwID0gTWF0aC5mbG9vcihcclxuICAgICAgICAgICAgdGlsZVN0cnVjdHVyZS5nZXRUaWxlSGVpZ2h0KCkgLyBwYXJhbXMuc2NhbGVZKTtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwVGlsZVN0cnVjdHVyZSA9IGZ1bmN0aW9uIEpwaXBUaWxlU3RydWN0dXJlKFxyXG4gICAgc2l6ZVBhcmFtcyxcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBqcGlwRmFjdG9yeSxcclxuICAgIHByb2dyZXNzaW9uT3JkZXJcclxuICAgICkge1xyXG4gICAgXHJcbiAgICB2YXIgZGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZTtcclxuICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmVzO1xyXG4gICAgdmFyIGNvbXBvbmVudFRvSW5DbGFzc0xldmVsU3RhcnRJbmRleDtcclxuICAgIHZhciBtaW5OdW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG5cclxuICAgIHRoaXMuZ2V0UHJvZ3Jlc3Npb25PcmRlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBwcm9ncmVzc2lvbk9yZGVyO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXREZWZhdWx0Q29tcG9uZW50U3RydWN0dXJlID0gZnVuY3Rpb24gZ2V0RGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZShjb21wb25lbnQpIHtcclxuICAgICAgICByZXR1cm4gZGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q29tcG9uZW50U3RydWN0dXJlID0gZnVuY3Rpb24gZ2V0Q29tcG9uZW50U3RydWN0dXJlKGNvbXBvbmVudCkge1xyXG4gICAgICAgIHJldHVybiBjb21wb25lbnRTdHJ1Y3R1cmVzW2NvbXBvbmVudF07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVXaWR0aCA9IGZ1bmN0aW9uIGdldFRpbGVXaWR0aENsb3N1cmUoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpemVQYXJhbXMudGlsZVNpemVbMF07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVIZWlnaHQgPSBmdW5jdGlvbiBnZXRUaWxlSGVpZ2h0Q2xvc3VyZSgpIHtcclxuICAgICAgICByZXR1cm4gc2l6ZVBhcmFtcy50aWxlU2l6ZVsxXTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtUXVhbGl0eUxheWVycyA9IGZ1bmN0aW9uIGdldE51bVF1YWxpdHlMYXllcnMoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpemVQYXJhbXMubnVtUXVhbGl0eUxheWVycztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SXNQYWNrZXRIZWFkZXJOZWFyRGF0YSA9IGZ1bmN0aW9uIGdldElzUGFja2V0SGVhZGVyTmVhckRhdGEoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpemVQYXJhbXMuaXNQYWNrZXRIZWFkZXJzTmVhckRhdGE7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQgPSBmdW5jdGlvbiBnZXRJc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkKCkge1xyXG4gICAgICAgIHJldHVybiBzaXplUGFyYW1zLmlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0SXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBzaXplUGFyYW1zLmlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucHJlY2luY3RJbkNsYXNzSW5kZXhUb1Bvc2l0aW9uID0gZnVuY3Rpb24oaW5DbGFzc0luZGV4KSB7XHJcbiAgICAgICAgLy8gQS4zLjJcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaW5DbGFzc0luZGV4IDwgMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnaW5DbGFzc0luZGV4JyxcclxuICAgICAgICAgICAgICAgIGluQ2xhc3NJbmRleCxcclxuICAgICAgICAgICAgICAgICdJbnZhbGlkIG5lZ2F0aXZlIGluLWNsYXNzIGluZGV4IG9mIHByZWNpbmN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1UaWxlcyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNYKCkgKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIHZhciBudW1Db21wb25lbnRzID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1Db21wb25lbnRzKCk7XHJcblxyXG4gICAgICAgIHZhciB0aWxlSW5kZXggPSBpbkNsYXNzSW5kZXggJSBudW1UaWxlcztcclxuICAgICAgICB2YXIgaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgPSAoaW5DbGFzc0luZGV4IC0gdGlsZUluZGV4KSAvIG51bVRpbGVzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnQgPSBpbkNsYXNzSW5kZXhXaXRob3V0VGlsZSAlIG51bUNvbXBvbmVudHM7XHJcbiAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbY29tcG9uZW50XTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVscyA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0SW5kZXggPSAoaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgLSBjb21wb25lbnQpIC8gbnVtQ29tcG9uZW50cztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzb2x1dGlvbkxldmVsO1xyXG4gICAgICAgIHZhciBsZXZlbFN0YXJ0SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAocmVzb2x1dGlvbkxldmVsID0gMTsgcmVzb2x1dGlvbkxldmVsIDwgbnVtUmVzb2x1dGlvbkxldmVsczsgKytyZXNvbHV0aW9uTGV2ZWwpIHtcclxuICAgICAgICAgICAgdmFyIG5leHRMZXZlbFN0YXJ0SW5kZXggPVxyXG4gICAgICAgICAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4W2NvbXBvbmVudF1bcmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChuZXh0TGV2ZWxTdGFydEluZGV4ID4gcHJlY2luY3RJbmRleCkge1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxldmVsU3RhcnRJbmRleCA9IG5leHRMZXZlbFN0YXJ0SW5kZXg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC0tcmVzb2x1dGlvbkxldmVsO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdEluZGV4SW5MZXZlbCA9IHByZWNpbmN0SW5kZXggLSBsZXZlbFN0YXJ0SW5kZXg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChyZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNZID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1kocmVzb2x1dGlvbkxldmVsKTtcclxuXHJcbiAgICAgICAgdmFyIHByZWNpbmN0WCA9IHByZWNpbmN0SW5kZXhJbkxldmVsICUgcHJlY2luY3RzWDtcclxuICAgICAgICB2YXIgcHJlY2luY3RZID0gKHByZWNpbmN0SW5kZXhJbkxldmVsIC0gcHJlY2luY3RYKSAvIHByZWNpbmN0c1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZWNpbmN0WSA+PSBwcmVjaW5jdHNZKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdpbkNsYXNzSW5kZXgnLFxyXG4gICAgICAgICAgICAgICAgaW5DbGFzc0luZGV4LFxyXG4gICAgICAgICAgICAgICAgJ0ludmFsaWQgaW4tY2xhc3MgaW5kZXggb2YgcHJlY2luY3QnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgdGlsZUluZGV4OiB0aWxlSW5kZXgsXHJcbiAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJlY2luY3RYOiBwcmVjaW5jdFgsXHJcbiAgICAgICAgICAgIHByZWNpbmN0WTogcHJlY2luY3RZLFxyXG4gICAgICAgICAgICByZXNvbHV0aW9uTGV2ZWw6IHJlc29sdXRpb25MZXZlbFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnByZWNpbmN0UG9zaXRpb25Ub0luQ2xhc3NJbmRleCA9IGZ1bmN0aW9uKHByZWNpbmN0UG9zaXRpb24pIHtcclxuICAgICAgICAvLyBBLjMuMlxyXG5cclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50cyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKFxyXG4gICAgICAgICAgICAncHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnQnLCBwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudCwgbnVtQ29tcG9uZW50cyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnRdO1xyXG5cclxuICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVscyA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoXHJcbiAgICAgICAgICAgICdwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCcsIHByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsLCBudW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuXHJcbiAgICAgICAgdmFyIG51bVRpbGVzID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1UaWxlc1goKSAqIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1kgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWShwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoXHJcbiAgICAgICAgICAgICdwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCcsIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RYLCBwcmVjaW5jdHNYKTtcclxuICAgICAgICB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZShcclxuICAgICAgICAgICAgJ3ByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RZJywgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFksIHByZWNpbmN0c1kpO1xyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKFxyXG4gICAgICAgICAgICAncHJlY2luY3RQb3NpdGlvbi50aWxlSW5kZXgnLCBwcmVjaW5jdFBvc2l0aW9uLnRpbGVJbmRleCwgbnVtVGlsZXMpO1xyXG5cclxuICAgICAgICB2YXIgcHJlY2luY3RJbmRleEluTGV2ZWwgPSBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCArIFxyXG4gICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WSAqIHByZWNpbmN0c1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxldmVsU3RhcnRJbmRleCA9IGNvbXBvbmVudFRvSW5DbGFzc0xldmVsU3RhcnRJbmRleFtwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudF1bcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWxdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdEluZGV4ID0gcHJlY2luY3RJbmRleEluTGV2ZWwgKyBsZXZlbFN0YXJ0SW5kZXg7XHJcblxyXG4gICAgICAgIHZhciBpbkNsYXNzSW5kZXhXaXRob3V0VGlsZSA9XHJcbiAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50ICsgcHJlY2luY3RJbmRleCAqIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG5cclxuICAgICAgICB2YXIgaW5DbGFzc0luZGV4ID0gcHJlY2luY3RQb3NpdGlvbi50aWxlSW5kZXggKyBcclxuICAgICAgICAgICAgaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWCgpICogY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1UaWxlc1koKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaW5DbGFzc0luZGV4O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQcmVjaW5jdEl0ZXJhdG9yID0gZnVuY3Rpb24gZ2V0UHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICB0aWxlSW5kZXgsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBpc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCA9IDA7XHJcbiAgICAgICAgaWYgKGNvZGVzdHJlYW1QYXJ0UGFyYW1zICE9PSB1bmRlZmluZWQgJiZcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCA9IGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNUb0N1dDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtaW5OdW1SZXNvbHV0aW9uTGV2ZWxzIDw9IG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0Nhbm5vdCBhZHZhbmNlIHJlc29sdXRpb246IG51bVJlc29sdXRpb25MZXZlbHNUb0N1dD0nICtcclxuICAgICAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQgKyAnIGJ1dCBzaG91bGQgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2JlIHNtYWxsZXIgdGhhbiAnICsgbWluTnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBwcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQgPVxyXG4gICAgICAgICAgICBnZXRQcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQoXHJcbiAgICAgICAgICAgICAgICB0aWxlSW5kZXgsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFggPSAwO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdFkgPSAwO1xyXG4gICAgICAgIGlmIChpc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0ICYmXHJcbiAgICAgICAgICAgIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGZpcnN0UHJlY2luY3RzUmFuZ2UgPVxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RzSW5Db2Rlc3RyZWFtUGFydFBlckxldmVsUGVyQ29tcG9uZW50WzBdWzBdO1xyXG4gICAgICAgICAgICBwcmVjaW5jdFggPSBmaXJzdFByZWNpbmN0c1JhbmdlLm1pblByZWNpbmN0WDtcclxuICAgICAgICAgICAgcHJlY2luY3RZID0gZmlyc3RQcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEEuNi4xIGluIHBhcnQgMTogQ29yZSBDb2RpbmcgU3lzdGVtXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNldGFibGVJdGVyYXRvciA9IHtcclxuICAgICAgICAgICAgcHJlY2luY3RJbmRleEluQ29tcG9uZW50UmVzb2x1dGlvbjogMCxcclxuICAgICAgICAgICAgY29tcG9uZW50OiAwLFxyXG4gICAgICAgICAgICBwcmVjaW5jdFg6IHByZWNpbmN0WCxcclxuICAgICAgICAgICAgcHJlY2luY3RZOiBwcmVjaW5jdFksXHJcbiAgICAgICAgICAgIHJlc29sdXRpb25MZXZlbDogMCxcclxuICAgICAgICAgICAgaXNJbkNvZGVzdHJlYW1QYXJ0OiB0cnVlXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IHtcclxuICAgICAgICAgICAgZ2V0IHRpbGVJbmRleCgpIHsgcmV0dXJuIHRpbGVJbmRleDsgfSxcclxuICAgICAgICAgICAgICAgIGdldCBjb21wb25lbnQoKSB7IHJldHVybiBzZXRhYmxlSXRlcmF0b3IuY29tcG9uZW50OyB9LFxyXG4gICAgICAgICAgICBnZXQgcHJlY2luY3RJbmRleEluQ29tcG9uZW50UmVzb2x1dGlvbigpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RJbmRleEluQ29tcG9uZW50UmVzb2x1dGlvbjtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgZ2V0IHByZWNpbmN0WCgpIHsgcmV0dXJuIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFg7IH0sXHJcbiAgICAgICAgICAgICAgICBnZXQgcHJlY2luY3RZKCkgeyByZXR1cm4gc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WTsgfSxcclxuICAgICAgICAgICAgICAgIGdldCByZXNvbHV0aW9uTGV2ZWwoKSB7IHJldHVybiBzZXRhYmxlSXRlcmF0b3IucmVzb2x1dGlvbkxldmVsOyB9LFxyXG4gICAgICAgICAgICBnZXQgaXNJbkNvZGVzdHJlYW1QYXJ0KCkgeyByZXR1cm4gc2V0YWJsZUl0ZXJhdG9yLmlzSW5Db2Rlc3RyZWFtUGFydDsgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGl0ZXJhdG9yLnRyeUFkdmFuY2UgPSBmdW5jdGlvbiB0cnlBZHZhbmNlKCkge1xyXG4gICAgICAgICAgICB2YXIgaXNTdWNjZWVkZWQgPSB0cnlBZHZhbmNlUHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvcixcclxuICAgICAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCxcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCxcclxuICAgICAgICAgICAgICAgIGlzSXRlcmF0ZVByZWNpbmN0c05vdEluQ29kZXN0cmVhbVBhcnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIGlzU3VjY2VlZGVkO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGl0ZXJhdG9yO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UocGFyYW1OYW1lLCBwYXJhbVZhbHVlLCBzdXByaW11bVBhcmFtVmFsdWUpIHtcclxuICAgICAgICBpZiAocGFyYW1WYWx1ZSA8IDAgfHwgcGFyYW1WYWx1ZSA+PSBzdXByaW11bVBhcmFtVmFsdWUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgcGFyYW1OYW1lLFxyXG4gICAgICAgICAgICAgICAgcGFyYW1WYWx1ZSxcclxuICAgICAgICAgICAgICAgIHBhcmFtTmFtZSArICcgaXMgZXhwZWN0ZWQgdG8gYmUgYmV0d2VlbiAwIGFuZCAnICsgc3VwcmltdW1QYXJhbVZhbHVlIC0gMSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB2YWxpZGF0ZVRhcmdldFByb2dyZXNzaW9uT3JkZXIocHJvZ3Jlc3Npb25PcmRlcikge1xyXG4gICAgICAgIGlmIChwcm9ncmVzc2lvbk9yZGVyLmxlbmd0aCAhPT0gNCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbignSWxsZWdhbCBwcm9ncmVzc2lvbiBvcmRlciAnICsgcHJvZ3Jlc3Npb25PcmRlciArICc6IHVuZXhwZWN0ZWQgbGVuZ3RoJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcm9ncmVzc2lvbk9yZGVyWzNdICE9PSAnTCcpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdJbGxlZ2FsIHRhcmdldCBwcm9ncmVzc2lvbiBvcmRlciBvZiAnICsgcHJvZ3Jlc3Npb25PcmRlciwgJ0EuMy4yLjEnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhhc1AgPSBwcm9ncmVzc2lvbk9yZGVyLmluZGV4T2YoJ1AnKSA+PSAwO1xyXG4gICAgICAgIHZhciBoYXNDID0gcHJvZ3Jlc3Npb25PcmRlci5pbmRleE9mKCdDJykgPj0gMDtcclxuICAgICAgICB2YXIgaGFzUiA9IHByb2dyZXNzaW9uT3JkZXIuaW5kZXhPZignUicpID49IDA7XHJcbiAgICAgICAgaWYgKCFoYXNQIHx8ICFoYXNDIHx8ICFoYXNSKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdJbGxlZ2FsIHByb2dyZXNzaW9uIG9yZGVyICcgKyBwcm9ncmVzc2lvbk9yZGVyICsgJzogbWlzc2luZyBsZXR0ZXInKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByb2dyZXNzaW9uT3JkZXIgIT09ICdSUENMJykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oJ1Byb2dyZXNzaW9uIG9yZGVyIG9mICcgKyBwcm9ncmVzc2lvbk9yZGVyLCAnQS42LjEnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHByZXByb2Nlc3NQYXJhbXMoKSB7XHJcbiAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4ID0gbmV3IEFycmF5KGNvbXBvbmVudHMpO1xyXG5cclxuICAgICAgICB2YXIgY29tcG9uZW50cyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkZWZhdWx0Q29tcG9uZW50ID0gc2l6ZVBhcmFtcy5kZWZhdWx0Q29tcG9uZW50UGFyYW1zO1xyXG4gICAgICAgIG1pbk51bVJlc29sdXRpb25MZXZlbHMgPSBkZWZhdWx0Q29tcG9uZW50Lm51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICAgICAgdmFyIGlzQ29tcG9uZW50c0lkZW50aWNhbFNpemUgPSB0cnVlO1xyXG4gICAgICAgIHZhciBpc1ByZWNpbmN0UGFydGl0aW9uRml0c1RvVGlsZVBhcnRpdGlvbiA9IHRydWU7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGMgPSAwOyBjIDwgY29tcG9uZW50czsgKytjKSB7XHJcbiAgICAgICAgICAgIHZhciBzaXplID0gc2l6ZVBhcmFtcy5wYXJhbXNQZXJDb21wb25lbnRbY107XHJcbiAgICAgICAgICAgIG1pbk51bVJlc29sdXRpb25MZXZlbHMgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgIG1pbk51bVJlc29sdXRpb25MZXZlbHMsIHNpemUubnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4W2NdID0gbmV3IEFycmF5KHNpemUubnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSBjb21wb25lbnRTdHJ1Y3R1cmVzW2NdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGFjY3VtdWxhdGVkT2Zmc2V0ID0gMDtcclxuICAgICAgICAgICAgdmFyIGZpcnN0TGV2ZWxQcmVjaW5jdHNYID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1goYyk7XHJcbiAgICAgICAgICAgIHZhciBmaXJzdExldmVsUHJlY2luY3RzWSA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNZKGMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCBzaXplLm51bVJlc29sdXRpb25MZXZlbHM7ICsrcikge1xyXG4gICAgICAgICAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4W2NdW3JdID0gYWNjdW11bGF0ZWRPZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RzWEluTGV2ZWwgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChyKTtcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdHNZSW5MZXZlbCA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNZKHIpO1xyXG4gICAgICAgICAgICAgICAgYWNjdW11bGF0ZWRPZmZzZXQgKz0gcHJlY2luY3RzWEluTGV2ZWwgKiBwcmVjaW5jdHNZSW5MZXZlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoZGVmYXVsdENvbXBvbmVudC5wcmVjaW5jdFdpZHRoUGVyTGV2ZWxbcl0gIT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemUucHJlY2luY3RXaWR0aFBlckxldmVsW3JdIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdENvbXBvbmVudC5wcmVjaW5jdEhlaWdodFBlckxldmVsW3JdICE9PVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplLnByZWNpbmN0SGVpZ2h0UGVyTGV2ZWxbcl0pIHtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBpc0NvbXBvbmVudHNJZGVudGljYWxTaXplID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBpc0hvcml6b250YWxQYXJ0aXRpb25TdXBwb3J0ZWQgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrSWZQcmVjaW5jdFBhcnRpdGlvblN0YXJ0c0luVGlsZVRvcExlZnQoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemUubnVtUmVzb2x1dGlvbkxldmVscyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldFByZWNpbmN0V2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxXaWR0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlV2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBpc1ZlcnRpY2FsUGFydGl0aW9uU3VwcG9ydGVkID1cclxuICAgICAgICAgICAgICAgICAgICBjaGVja0lmUHJlY2luY3RQYXJ0aXRpb25TdGFydHNJblRpbGVUb3BMZWZ0KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplLm51bVJlc29sdXRpb25MZXZlbHMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZS5nZXRQcmVjaW5jdFdpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldExldmVsV2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVdpZHRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpc1ByZWNpbmN0UGFydGl0aW9uRml0c1RvVGlsZVBhcnRpdGlvbiAmPVxyXG4gICAgICAgICAgICAgICAgICAgIGlzSG9yaXpvbnRhbFBhcnRpdGlvblN1cHBvcnRlZCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIGlzVmVydGljYWxQYXJ0aXRpb25TdXBwb3J0ZWQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghaXNDb21wb25lbnRzSWRlbnRpY2FsU2l6ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnU3BlY2lhbCBDb2RpbmcgU3R5bGUgZm9yIENvbXBvbmVudCAoQ09DKScsICdBLjYuMicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdQcmVjaW5jdCBUb3BMZWZ0IHdoaWNoIGlzIG5vdCBtYXRjaGVkIHRvIHRpbGUgVG9wTGVmdCcsICdCLjYnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNoZWNrSWZQcmVjaW5jdFBhcnRpdGlvblN0YXJ0c0luVGlsZVRvcExlZnQoXHJcbiAgICAgICAgcmVzb2x1dGlvbkxldmVsLFxyXG4gICAgICAgIG51bVJlc29sdXRpb25MZXZlbHMsXHJcbiAgICAgICAgZ2V0UHJlY2luY3RTaXplRnVuY3Rpb24sXHJcbiAgICAgICAgZ2V0TGV2ZWxTaXplRnVuY3Rpb24sXHJcbiAgICAgICAgZ2V0VGlsZVNpemVGdW5jdGlvbikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEpwZWcyMDAwIHN0YW5kYXJkIGFsbG93cyBwYXJ0aXRpb24gb2YgdGlsZXMgd2hpY2ggZG9lcyBub3QgZml0XHJcbiAgICAgICAgLy8gZXhhY3RseSB0aGUgcHJlY2luY3RzIHBhcnRpdGlvbiAoaS5lLiB0aGUgZmlyc3QgcHJlY2luY3RzIFwidmlydHVhbGx5XCJcclxuICAgICAgICAvLyBzdGFydHMgYmVmb3JlIHRoZSB0aWxlLCB0aHVzIGlzIHNtYWxsZXIgdGhhbiBvdGhlcikuXHJcbiAgICAgICAgLy8gVGhpcyBpcyBub3Qgc3VwcG9ydGVkIG5vdyBpbiB0aGUgY29kZSwgdGhpcyBmdW5jdGlvbiBzaG91bGQgY2hlY2tcclxuICAgICAgICAvLyB0aGF0IHRoaXMgaXMgbm90IHRoZSBzaXR1YXRpb24uXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGZ1bmN0aW9uIGFzc3VtZXMgdGhhdCBmaXJzdFRpbGVPZmZzZXQgaXMgemVybyBhbmQgY29tcG9uZW50U2NhbGVcclxuICAgICAgICAvLyBpcyBvbmUgKFVuc3VwcG9ydGVkRXhjZXB0aW9ucyBhcmUgdGhyb3duIGluIENvbXBvbmVudFN0cnVjdHVyZSBhbmRcclxuICAgICAgICAvLyBDb2Rlc3RyZWFtU3RydWN0dXJlIGNsYXNzZXMpLlxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFNpemUgPSBnZXRQcmVjaW5jdFNpemVGdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIHZhciBsZXZlbFNpemUgPSBnZXRMZXZlbFNpemVGdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcmVjaW5jdFNpemUgPiBsZXZlbFNpemUpIHtcclxuICAgICAgICAgICAgLy8gUHJlY2luY3QgaXMgbGFyZ2VyIHRoYW4gaW1hZ2UgdGh1cyBhbnl3YXkgdGlsZSBoYXMgYSBzaW5nbGVcclxuICAgICAgICAgICAgLy8gcHJlY2luY3RcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVNpemUgPSBnZXRUaWxlU2l6ZUZ1bmN0aW9uKHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uID1cclxuICAgICAgICAgICAgcHJlY2luY3RTaXplICUgdGlsZVNpemUgPT09IDAgfHxcclxuICAgICAgICAgICAgdGlsZVNpemUgJSBwcmVjaW5jdFNpemUgPT09IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRQcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQoXHJcbiAgICAgICAgdGlsZUluZGV4LCBjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2Rlc3RyZWFtUGFydFBhcmFtcyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29tcG9uZW50cyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG4gICAgICAgIHZhciBwZXJDb21wb25lbnRSZXN1bHQgPSBuZXcgQXJyYXkoY29tcG9uZW50cyk7XHJcbiAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNUb0N1dCB8fCAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlTGVmdEluTGV2ZWwgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVMZWZ0KFxyXG4gICAgICAgICAgICB0aWxlSW5kZXgsIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgdmFyIHRpbGVUb3BJbkxldmVsID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlVG9wKFxyXG4gICAgICAgICAgICB0aWxlSW5kZXgsIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1pblhJblRpbGUgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5YIC0gdGlsZUxlZnRJbkxldmVsO1xyXG4gICAgICAgIHZhciBtaW5ZSW5UaWxlID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWSAtIHRpbGVUb3BJbkxldmVsO1xyXG4gICAgICAgIHZhciBtYXhYSW5UaWxlID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIHRpbGVMZWZ0SW5MZXZlbDtcclxuICAgICAgICB2YXIgbWF4WUluVGlsZSA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFlFeGNsdXNpdmUgLSB0aWxlVG9wSW5MZXZlbDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kZXN0cmVhbVBhcnRMZXZlbFdpZHRoID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRMZXZlbFdpZHRoKFxyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtUGFydExldmVsSGVpZ2h0ID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRMZXZlbEhlaWdodChcclxuICAgICAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgY29tcG9uZW50ID0gMDsgY29tcG9uZW50IDwgY29tcG9uZW50czsgKytjb21wb25lbnQpIHtcclxuICAgICAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbY29tcG9uZW50XTtcclxuICAgICAgICAgICAgdmFyIGxldmVscyA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgICAgIHZhciBsZXZlbHNJbkNvZGVzdHJlYW1QYXJ0ID0gbGV2ZWxzIC0gbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0O1xyXG4gICAgICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVscyA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgICAgIHZhciBwZXJMZXZlbFJlc3VsdCA9IG5ldyBBcnJheShsZXZlbHMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBsZXZlbCA9IDA7IGxldmVsIDwgbGV2ZWxzSW5Db2Rlc3RyZWFtUGFydDsgKytsZXZlbCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGNvbXBvbmVudFNjYWxlWCA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXRDb21wb25lbnRTY2FsZVgoKTtcclxuICAgICAgICAgICAgICAgIHZhciBjb21wb25lbnRTY2FsZVkgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0Q29tcG9uZW50U2NhbGVZKCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbGV2ZWxJbkNvZGVzdHJlYW1QYXJ0ID0gbGV2ZWxzSW5Db2Rlc3RyZWFtUGFydCAtIGxldmVsIC0gMTtcclxuICAgICAgICAgICAgICAgIHZhciBsZXZlbFNjYWxlWCA9IGNvbXBvbmVudFNjYWxlWCA8PCBsZXZlbEluQ29kZXN0cmVhbVBhcnQ7XHJcbiAgICAgICAgICAgICAgICB2YXIgbGV2ZWxTY2FsZVkgPSBjb21wb25lbnRTY2FsZVkgPDwgbGV2ZWxJbkNvZGVzdHJlYW1QYXJ0O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcmVkdW5kYW50ID0gNDsgLy8gUmVkdW5kYW50IHBpeGVscyBmb3Igd2F2ZWxldCA5LTcgY29udm9sdXRpb25cclxuICAgICAgICAgICAgICAgIHZhciBtaW5YSW5MZXZlbCA9IE1hdGguZmxvb3IobWluWEluVGlsZSAvIGxldmVsU2NhbGVYKSAtIHJlZHVuZGFudDtcclxuICAgICAgICAgICAgICAgIHZhciBtaW5ZSW5MZXZlbCA9IE1hdGguZmxvb3IobWluWUluVGlsZSAvIGxldmVsU2NhbGVZKSAtIHJlZHVuZGFudDtcclxuICAgICAgICAgICAgICAgIHZhciBtYXhYSW5MZXZlbCA9IE1hdGguY2VpbChtYXhYSW5UaWxlIC8gbGV2ZWxTY2FsZVgpICsgcmVkdW5kYW50O1xyXG4gICAgICAgICAgICAgICAgdmFyIG1heFlJbkxldmVsID0gTWF0aC5jZWlsKG1heFlJblRpbGUgLyBsZXZlbFNjYWxlWSkgKyByZWR1bmRhbnQ7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdFdpZHRoID1cclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0UHJlY2luY3RXaWR0aChsZXZlbCkgKiBjb21wb25lbnRTY2FsZVg7XHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RIZWlnaHQgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZS5nZXRQcmVjaW5jdEhlaWdodChsZXZlbCkgKiBjb21wb25lbnRTY2FsZVk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBtaW5QcmVjaW5jdFggPSBNYXRoLmZsb29yKG1pblhJbkxldmVsIC8gcHJlY2luY3RXaWR0aCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWluUHJlY2luY3RZID0gTWF0aC5mbG9vcihtaW5ZSW5MZXZlbCAvIHByZWNpbmN0SGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIHZhciBtYXhQcmVjaW5jdFggPSBNYXRoLmNlaWwobWF4WEluTGV2ZWwgLyBwcmVjaW5jdFdpZHRoKTtcclxuICAgICAgICAgICAgICAgIHZhciBtYXhQcmVjaW5jdFkgPSBNYXRoLmNlaWwobWF4WUluTGV2ZWwgLyBwcmVjaW5jdEhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdHNYID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1gobGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0c1kgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWShsZXZlbCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHBlckxldmVsUmVzdWx0W2xldmVsXSA9IHtcclxuICAgICAgICAgICAgICAgICAgICBtaW5QcmVjaW5jdFg6IE1hdGgubWF4KDAsIG1pblByZWNpbmN0WCksXHJcbiAgICAgICAgICAgICAgICAgICAgbWluUHJlY2luY3RZOiBNYXRoLm1heCgwLCBtaW5QcmVjaW5jdFkpLFxyXG4gICAgICAgICAgICAgICAgICAgIG1heFByZWNpbmN0WEV4Y2x1c2l2ZTogTWF0aC5taW4obWF4UHJlY2luY3RYLCBwcmVjaW5jdHNYKSxcclxuICAgICAgICAgICAgICAgICAgICBtYXhQcmVjaW5jdFlFeGNsdXNpdmU6IE1hdGgubWluKG1heFByZWNpbmN0WSwgcHJlY2luY3RzWSlcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwZXJDb21wb25lbnRSZXN1bHRbY29tcG9uZW50XSA9IHBlckxldmVsUmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcGVyQ29tcG9uZW50UmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0cnlBZHZhbmNlUHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICBzZXRhYmxlSXRlcmF0b3IsXHJcbiAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0LFxyXG4gICAgICAgIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCxcclxuICAgICAgICBpc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG5lZWRBZHZhbmNlTmV4dE1lbWJlciA9IHRydWU7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1JhbmdlSGFzaCA9IGlzSXRlcmF0ZVByZWNpbmN0c05vdEluQ29kZXN0cmVhbVBhcnQgP1xyXG4gICAgICAgICAgICBudWxsOiBwcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG5lZWRSZXNldFByZWNpbmN0VG9NaW5pbWFsSW5Db2Rlc3RyZWFtUGFydCA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAyOyBpID49IDA7IC0taSkge1xyXG4gICAgICAgICAgICB2YXIgbmV3VmFsdWUgPSBhZHZhbmNlUHJvZ3Jlc3Npb25PcmRlck1lbWJlcihcclxuICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvciwgaSwgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0LCBwcmVjaW5jdHNSYW5nZUhhc2gpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbmVlZEFkdmFuY2VOZXh0TWVtYmVyID0gbmV3VmFsdWUgPT09IDA7XHJcbiAgICAgICAgICAgIGlmICghbmVlZEFkdmFuY2VOZXh0TWVtYmVyKSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHByb2dyZXNzaW9uT3JkZXJbaV0gPT09ICdQJyAmJlxyXG4gICAgICAgICAgICAgICAgIWlzSXRlcmF0ZVByZWNpbmN0c05vdEluQ29kZXN0cmVhbVBhcnQpIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbmVlZFJlc2V0UHJlY2luY3RUb01pbmltYWxJbkNvZGVzdHJlYW1QYXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobmVlZEFkdmFuY2VOZXh0TWVtYmVyKSB7XHJcbiAgICAgICAgICAgIC8vIElmIHdlIGFyZSBoZXJlLCB0aGUgbGFzdCBwcmVjaW5jdCBoYXMgYmVlbiByZWFjaGVkXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbc2V0YWJsZUl0ZXJhdG9yLmNvbXBvbmVudF07XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChcclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0SW5kZXhJbkNvbXBvbmVudFJlc29sdXRpb24gPVxyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RYICsgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WSAqIHByZWNpbmN0c1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IuaXNJbkNvZGVzdHJlYW1QYXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByYW5nZVBlckxldmVsID1cclxuICAgICAgICAgICAgcHJlY2luY3RzSW5Db2Rlc3RyZWFtUGFydFBlckxldmVsUGVyQ29tcG9uZW50W3NldGFibGVJdGVyYXRvci5jb21wb25lbnRdO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNSYW5nZSA9IHJhbmdlUGVyTGV2ZWxbc2V0YWJsZUl0ZXJhdG9yLnJlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG5lZWRSZXNldFByZWNpbmN0VG9NaW5pbWFsSW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RYID0gcHJlY2luY3RzUmFuZ2UubWluUHJlY2luY3RYO1xyXG4gICAgICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WSA9IHByZWNpbmN0c1JhbmdlLm1pblByZWNpbmN0WTtcclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0SW5kZXhJbkNvbXBvbmVudFJlc29sdXRpb24gPVxyXG4gICAgICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WCArIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFkgKiBwcmVjaW5jdHNYO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXRhYmxlSXRlcmF0b3IuaXNJbkNvZGVzdHJlYW1QYXJ0ID1cclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WCA+PSBwcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFggJiZcclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WSA+PSBwcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFkgJiZcclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WCA8IHByZWNpbmN0c1JhbmdlLm1heFByZWNpbmN0WEV4Y2x1c2l2ZSAmJlxyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RZIDwgcHJlY2luY3RzUmFuZ2UubWF4UHJlY2luY3RZRXhjbHVzaXZlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhZHZhbmNlUHJvZ3Jlc3Npb25PcmRlck1lbWJlcihcclxuICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLFxyXG4gICAgICAgIG1lbWJlckluZGV4LFxyXG4gICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCxcclxuICAgICAgICBwcmVjaW5jdHNSYW5nZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSBjb21wb25lbnRTdHJ1Y3R1cmVzW3ByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50XTtcclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKHByb2dyZXNzaW9uT3JkZXJbbWVtYmVySW5kZXhdKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ1InOlxyXG4gICAgICAgICAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHMgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCkgLVxyXG4gICAgICAgICAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgKytwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbDtcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsICU9IG51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdDJzpcclxuICAgICAgICAgICAgICAgICsrcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnQ7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudCAlPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bUNvbXBvbmVudHMoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ1AnOlxyXG4gICAgICAgICAgICAgICAgdmFyIG1pblgsIG1pblksIG1heFgsIG1heFk7XHJcbiAgICAgICAgICAgICAgICBpZiAocHJlY2luY3RzUmFuZ2UgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RzUmFuZ2VQZXJMZXZlbCA9IHByZWNpbmN0c1JhbmdlW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudF07XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0c1JhbmdlSW5MZXZlbENvbXBvbmVudCA9IHByZWNpbmN0c1JhbmdlUGVyTGV2ZWxbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBtaW5YID0gcHJlY2luY3RzUmFuZ2VJbkxldmVsQ29tcG9uZW50Lm1pblByZWNpbmN0WDtcclxuICAgICAgICAgICAgICAgICAgICBtaW5ZID0gcHJlY2luY3RzUmFuZ2VJbkxldmVsQ29tcG9uZW50Lm1pblByZWNpbmN0WTtcclxuICAgICAgICAgICAgICAgICAgICBtYXhYID0gcHJlY2luY3RzUmFuZ2VJbkxldmVsQ29tcG9uZW50Lm1heFByZWNpbmN0WEV4Y2x1c2l2ZTtcclxuICAgICAgICAgICAgICAgICAgICBtYXhZID0gcHJlY2luY3RzUmFuZ2VJbkxldmVsQ29tcG9uZW50Lm1heFByZWNpbmN0WUV4Y2x1c2l2ZTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWluWCA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgbWluWSA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF4WCA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNYKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF4WSA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNZKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RYIC09IChtaW5YIC0gMSk7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCAlPSAobWF4WCAtIG1pblgpO1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFggKz0gbWluWDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RYICE9IG1pblgpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFggLSBtaW5YO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WSAtPSAobWluWSAtIDEpO1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFkgJT0gKG1heFkgLSBtaW5ZKTtcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RZICs9IG1pblk7XHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RZIC0gbWluWTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ0wnIDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdBZHZhbmNpbmcgTCBpcyBub3Qgc3VwcG9ydGVkIGluIEpQSVAnKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBsZXR0ZXIgaW4gcHJvZ3Jlc3Npb24gb3JkZXI6ICcgK1xyXG4gICAgICAgICAgICAgICAgICAgIHByb2dyZXNzaW9uT3JkZXJbbWVtYmVySW5kZXhdKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGRlZmF1bHRDb21wb25lbnRTdHJ1Y3R1cmUgPSBqcGlwRmFjdG9yeS5jcmVhdGVDb21wb25lbnRTdHJ1Y3R1cmUoXHJcbiAgICAgICAgc2l6ZVBhcmFtcy5kZWZhdWx0Q29tcG9uZW50UGFyYW1zLCB0aGlzKTtcclxuICAgICAgICBcclxuICAgIGNvbXBvbmVudFN0cnVjdHVyZXMgPSBuZXcgQXJyYXkoY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1Db21wb25lbnRzKCkpO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bUNvbXBvbmVudHMoKTsgKytpKSB7XHJcbiAgICAgICAgY29tcG9uZW50U3RydWN0dXJlc1tpXSA9IGpwaXBGYWN0b3J5LmNyZWF0ZUNvbXBvbmVudFN0cnVjdHVyZShcclxuICAgICAgICAgICAgc2l6ZVBhcmFtcy5wYXJhbXNQZXJDb21wb25lbnRbaV0sIHRoaXMpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcmVwcm9jZXNzUGFyYW1zKCk7XHJcbiAgICBcclxuICAgIHZhbGlkYXRlVGFyZ2V0UHJvZ3Jlc3Npb25PcmRlcihwcm9ncmVzc2lvbk9yZGVyKTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qMmtNYXJrZXJzID0ge1xyXG4gICAgU3RhcnRPZkNvZGVzdHJlYW06IFsweEZGLCAweDRGXSwgLy8gU09DXHJcbiAgICBJbWFnZUFuZFRpbGVTaXplOiBbMHhGRiwgMHg1MV0sIC8vIFNJWlxyXG4gICAgQ29kaW5nU3R5bGVEZWZhdWx0OiBbMHhGRiwgMHg1Ml0sIC8vIENPRFxyXG4gICAgQ29kaW5nU3R5bGVDb21wb25lbnQ6IFsweEZGLCAweDUzXSwgLy8gQ09DXHJcbiAgICBRdWFudGl6YXRpb25EZWZhdWx0OiBbMHhGRiwgMHg1Q10sIC8vIFFDRFxyXG4gICAgUHJvZ3Jlc3Npb25PcmRlckNoYW5nZTogWzB4RkYsIDB4NUZdLCAvLyBQT0NcclxuICAgIFBhY2tlZFBhY2tldEhlYWRlcnNJbk1haW5IZWFkZXI6IFsweEZGLCAweDYwXSwgLy8gUFBNXHJcbiAgICBQYWNrZWRQYWNrZXRIZWFkZXJzSW5UaWxlSGVhZGVyOiBbMHhGRiwgMHg2MV0sIC8vIFBQVFxyXG4gICAgU3RhcnRPZlRpbGU6IFsweEZGLCAweDkwXSwgLy8gU09UXHJcbiAgICBTdGFydE9mRGF0YTogWzB4RkYsIDB4OTNdLCAvLyBTT0RcclxuICAgIEVuZE9mQ29kZXN0cmVhbTogWzB4RkYsIDB4RDldLCAvLyBFT0NcclxuICAgIENvbW1lbnQ6IFsweEZGLCAweDY0XSAvLyBDT01cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmoya09mZnNldHMgPSB7XHJcbiAgICBNQVJLRVJfU0laRTogMixcclxuICAgIExFTkdUSF9GSUVMRF9TSVpFOiAyLFxyXG4gICAgXHJcbiAgICBOVU1fQ09NUE9ORU5UU19PRkZTRVRfQUZURVJfU0laX01BUktFUjogMzgsXHJcbiAgICBSRUZFUkVOQ0VfR1JJRF9TSVpFX09GRlNFVF9BRlRFUl9TSVpfTUFSS0VSOiA2XHJcblxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zID0ge1xyXG4gICAgSU1BR0VfRE9ORSA6IDEsXHJcbiAgICBXSU5ET1dfRE9ORSA6IDIsXHJcbiAgICBXSU5ET1dfQ0hBTkdFIDogMyxcclxuICAgIEJZVEVfTElNSVQgOiA0LFxyXG4gICAgUVVBTElUWV9MSU1JVCA6IDUsXHJcbiAgICBTRVNTSU9OX0xJTUlUIDogNixcclxuICAgIFJFU1BPTlNFX0xJTUlUIDogNyxcclxuICAgIE5PTl9TUEVDSUZJRUQgOiA4XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qMmtFeGNlcHRpb25zID0ge1xyXG4gICAgVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uOiBmdW5jdGlvbihmZWF0dXJlLCBzdGFuZGFyZFNlY3Rpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gZmVhdHVyZSArICcgKHNwZWNpZmllZCBpbiBzZWN0aW9uICcgKyBzdGFuZGFyZFNlY3Rpb24gKyAnIG9mIHBhcnQgMTogQ29yZSBDb2RpbmcgU3lzdGVtIHN0YW5kYXJkKSBpcyBub3Qgc3VwcG9ydGVkIHlldCc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0oyayBVbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG5cclxuICAgIFBhcnNlRXhjZXB0aW9uOiBmdW5jdGlvbihkZXNjcmlwdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSjJrIFBhcnNlRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuXHJcbiAgICBJbGxlZ2FsRGF0YUV4Y2VwdGlvbjogZnVuY3Rpb24oaWxsZWdhbERhdGFEZXNjcmlwdGlvbiwgc3RhbmRhcmRTZWN0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGlsbGVnYWxEYXRhRGVzY3JpcHRpb24gKyAnIChzZWUgc2VjdGlvbiAnICsgc3RhbmRhcmRTZWN0aW9uICsgJyBvZiBwYXJ0IDk6IEludGVyYWN0aXZpdHkgdG9vbHMsIEFQSXMgYW5kIFByb3RvY29scyknO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKMmsgSWxsZWdhbERhdGFFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucyA9IHtcclxuICAgIFVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbjogZnVuY3Rpb24oZmVhdHVyZSwgc3RhbmRhcmRTZWN0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGZlYXR1cmUgKyAnIChzcGVjaWZpZWQgaW4gc2VjdGlvbiAnICsgc3RhbmRhcmRTZWN0aW9uICsgJyBvZiBwYXJ0IDk6IEludGVyYWN0aXZpdHkgdG9vbHMsIEFQSXMgYW5kIFByb3RvY29scykgaXMgbm90IHN1cHBvcnRlZCB5ZXQnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKcGlwIFVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcblxyXG4gICAgUGFyc2VFeGNlcHRpb246IGZ1bmN0aW9uKGRlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKcGlwIFBhcnNlRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuXHJcbiAgICBJbGxlZ2FsRGF0YUV4Y2VwdGlvbjogZnVuY3Rpb24oaWxsZWdhbERhdGFEZXNjcmlwdGlvbiwgc3RhbmRhcmRTZWN0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGlsbGVnYWxEYXRhRGVzY3JpcHRpb24gKyAnIChzZWUgc2VjdGlvbiAnICsgc3RhbmRhcmRTZWN0aW9uICsgJyBvZiBwYXJ0IDk6IEludGVyYWN0aXZpdHkgdG9vbHMsIEFQSXMgYW5kIFByb3RvY29scyknO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKcGlwIElsbGVnYWxEYXRhRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbjogZnVuY3Rpb24oZGVzY3JpcHRpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0pwaXAgSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcbiAgICBcclxuICAgIEFyZ3VtZW50RXhjZXB0aW9uOiBmdW5jdGlvbihhcmd1bWVudE5hbWUsIGFyZ3VtZW50VmFsdWUsIGRlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9ICdBcmd1bWVudCAnICsgYXJndW1lbnROYW1lICsgJyBoYXMgaW52YWxpZCB2YWx1ZSAnICtcclxuICAgICAgICAgICAgYXJndW1lbnRWYWx1ZSArIChkZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkID8gJyA6JyArIGRlc2NyaXB0aW9uIDogJycpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKcGlwIEFyZ3VtZW50RXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuXHJcbiAgICBXcm9uZ1N0cmVhbUV4Y2VwdGlvbjogZnVuY3Rpb24ocmVxdWVzdGVkT3BlcmF0aW9uLCBpc0pQVCkge1xyXG4gICAgICAgIHZhciBjb3JyZWN0U3RyZWFtID0gJ0pQUCAoSlBJUCBQcmVjaW5jdCknO1xyXG4gICAgICAgIHZhciB3cm9uZ1N0cmVhbSA9ICdKUFQgKEpQSVAgVGlsZS1wYXJ0KSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzSlBUKSB7XHJcbiAgICAgICAgICAgIHZhciBzd2FwID0gY29ycmVjdFN0cmVhbTtcclxuICAgICAgICAgICAgY29ycmVjdFN0cmVhbSA9IHdyb25nU3RyZWFtO1xyXG4gICAgICAgICAgICB3cm9uZ1N0cmVhbSA9IHN3YXA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSAgICAnU3RyZWFtIHR5cGUgaXMgJyArIHdyb25nU3RyZWFtICsgJywgYnV0ICcgKyByZXF1ZXN0ZWRPcGVyYXRpb24gK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJyBpcyBhbGxvd2VkIG9ubHkgaW4gJyArIGNvcnJlY3RTdHJlYW0gKyAnIHN0cmVhbSc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSnBpcCBXcm9uZ1N0cmVhbUV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcblxyXG4gICAgSW50ZXJuYWxFcnJvckV4Y2VwdGlvbjogZnVuY3Rpb24oZGVzY3JpcHRpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0pwaXAgSW50ZXJuYWxFcnJvckV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmoya0V4Y2VwdGlvbnMuVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2oya0V4Y2VwdGlvbnMuVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuajJrRXhjZXB0aW9ucy5QYXJzZUV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqMmtFeGNlcHRpb25zLlBhcnNlRXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uJztcclxuXHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqcGlwRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucy5QYXJzZUV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqcGlwRXhjZXB0aW9ucy5QYXJzZUV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2pwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucy5Xcm9uZ1N0cmVhbUV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqcGlwRXhjZXB0aW9ucy5Xcm9uZ1N0cmVhbUV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbic7IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIHNpbXBsZUFqYXhIZWxwZXIgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnc2ltcGxlLWFqYXgtaGVscGVyLmpzJyAgICAgICAgICAgICAgICAgKS5zaW1wbGVBamF4SGVscGVyO1xyXG52YXIgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIgPSByZXF1aXJlKCdtdXR1YWwtZXhjbHVzaXZlLXRyYW5zYWN0aW9uLWhlbHBlci5qcycpLm11dHVhbEV4Y2x1c2l2ZVRyYW5zYWN0aW9uSGVscGVyO1xyXG5cclxudmFyIGpwaXBDb2RpbmdQYXNzZXNOdW1iZXJQYXJzZXIgPSByZXF1aXJlKCdqcGlwLWNvZGluZy1wYXNzZXMtbnVtYmVyLXBhcnNlci5qcycpLmpwaXBDb2RpbmdQYXNzZXNOdW1iZXJQYXJzZXI7XHJcbnZhciBqcGlwTWVzc2FnZUhlYWRlclBhcnNlciAgICAgID0gcmVxdWlyZSgnanBpcC1tZXNzYWdlLWhlYWRlci1wYXJzZXIuanMnICAgICAgKS5qcGlwTWVzc2FnZUhlYWRlclBhcnNlcjtcclxuXHJcbnZhciBKcGlwQ2hhbm5lbCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtY2hhbm5lbC5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICkuSnBpcENoYW5uZWw7XHJcbnZhciBKcGlwQ29kZXN0cmVhbVJlY29uc3RydWN0b3IgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtY29kZXN0cmVhbS1yZWNvbnN0cnVjdG9yLmpzJyAgICAgICAgICAgICAgICAgICkuSnBpcENvZGVzdHJlYW1SZWNvbnN0cnVjdG9yO1xyXG52YXIgSnBpcENvZGVzdHJlYW1TaXplc0NhbGN1bGF0b3IgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNvZGVzdHJlYW0tc2l6ZXMtY2FsY3VsYXRvci5qcycgICAgICAgICAgICAgICApLkpwaXBDb2Rlc3RyZWFtU2l6ZXNDYWxjdWxhdG9yO1xyXG52YXIgSnBpcENvZGVzdHJlYW1TdHJ1Y3R1cmUgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNvZGVzdHJlYW0tc3RydWN0dXJlLmpzJyAgICAgICAgICAgICAgICAgICAgICApLkpwaXBDb2Rlc3RyZWFtU3RydWN0dXJlO1xyXG52YXIgSnBpcENvbXBvbmVudFN0cnVjdHVyZSAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNvbXBvbmVudC1zdHJ1Y3R1cmUuanMnICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBDb21wb25lbnRTdHJ1Y3R1cmU7XHJcbnZhciBDb21wb3NpdGVBcnJheSAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2NvbXBvc2l0ZS1hcnJheS5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICkuQ29tcG9zaXRlQXJyYXk7XHJcbnZhciBKcGlwRGF0YWJpblBhcnRzICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtZGF0YWJpbi1wYXJ0cy5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICkuSnBpcERhdGFiaW5QYXJ0cztcclxudmFyIEpwaXBEYXRhYmluc1NhdmVyICAgICAgICAgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnanBpcC1kYXRhYmlucy1zYXZlci5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgKS5KcGlwRGF0YWJpbnNTYXZlcjtcclxudmFyIEpwaXBGZXRjaEhhbmRsZSAgICAgICAgICAgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnanBpcC1mZXRjaC1oYW5kbGUuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKS5KcGlwRmV0Y2hIYW5kbGU7XHJcbnZhciBKcGlwSGVhZGVyTW9kaWZpZXIgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtaGVhZGVyLW1vZGlmaWVyLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICkuSnBpcEhlYWRlck1vZGlmaWVyO1xyXG52YXIgSnBpcEltYWdlRGF0YUNvbnRleHQgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWltYWdlLWRhdGEtY29udGV4dC5qcycgICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBJbWFnZURhdGFDb250ZXh0O1xyXG52YXIgSnBpcE1hcmtlcnNQYXJzZXIgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLW1hcmtlcnMtcGFyc2VyLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBNYXJrZXJzUGFyc2VyO1xyXG52YXIgSnBpcE9iamVjdFBvb2xCeURhdGFiaW4gICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLW9iamVjdC1wb29sLWJ5LWRhdGFiaW4uanMnICAgICAgICAgICAgICAgICAgICApLkpwaXBPYmplY3RQb29sQnlEYXRhYmluO1xyXG52YXIgSnBpcE9mZnNldHNDYWxjdWxhdG9yICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLW9mZnNldHMtY2FsY3VsYXRvci5qcycgICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBPZmZzZXRzQ2FsY3VsYXRvcjtcclxudmFyIEpwaXBQYWNrZXRzRGF0YUNvbGxlY3RvciAgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnanBpcC1wYWNrZXRzLWRhdGEtY29sbGVjdG9yLmpzJyAgICAgICAgICAgICAgICAgICAgKS5KcGlwUGFja2V0c0RhdGFDb2xsZWN0b3I7XHJcbnZhciBKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcmVxdWVzdC1kYXRhYmlucy1saXN0ZW5lci5qcycgICAgICAgICAgICAgICAgICkuSnBpcFJlcXVlc3REYXRhYmluc0xpc3RlbmVyO1xyXG52YXIgSnBpcFJlcXVlc3QgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXJlcXVlc3QuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBSZXF1ZXN0O1xyXG52YXIgSnBpcFNlc3Npb25IZWxwZXIgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXNlc3Npb24taGVscGVyLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBTZXNzaW9uSGVscGVyO1xyXG52YXIgSnBpcFNlc3Npb24gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXNlc3Npb24uanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBTZXNzaW9uO1xyXG52YXIgSnBpcFJlY29ubmVjdGFibGVSZXF1ZXN0ZXIgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXJlY29ubmVjdGFibGUtcmVxdWVzdGVyLmpzJyAgICAgICAgICAgICAgICAgICApLkpwaXBSZWNvbm5lY3RhYmxlUmVxdWVzdGVyO1xyXG52YXIgSnBpcFN0cnVjdHVyZVBhcnNlciAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXN0cnVjdHVyZS1wYXJzZXIuanMnICAgICAgICAgICAgICAgICAgICAgICAgICApLkpwaXBTdHJ1Y3R1cmVQYXJzZXI7XHJcbnZhciBKcGlwVGlsZVN0cnVjdHVyZSAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtdGlsZS1zdHJ1Y3R1cmUuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICkuSnBpcFRpbGVTdHJ1Y3R1cmU7XHJcbnZhciBKcGlwQml0c3RyZWFtUmVhZGVyICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtYml0c3RyZWFtLXJlYWRlci5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICkuSnBpcEJpdHN0cmVhbVJlYWRlcjtcclxudmFyIEpwaXBUYWdUcmVlICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnanBpcC10YWctdHJlZS5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKS5KcGlwVGFnVHJlZTtcclxudmFyIEpwaXBDb2RlYmxvY2tMZW5ndGhQYXJzZXIgICAgICAgICAgICAgICAgID0gcmVxdWlyZSgnanBpcC1jb2RlYmxvY2stbGVuZ3RoLXBhcnNlci5qcycgICAgICAgICAgICAgICAgICAgKS5KcGlwQ29kZWJsb2NrTGVuZ3RoUGFyc2VyO1xyXG52YXIgSnBpcFN1YmJhbmRMZW5ndGhJblBhY2tldEhlYWRlckNhbGN1bGF0b3IgPSByZXF1aXJlKCdqcGlwLXN1YmJhbmQtbGVuZ3RoLWluLXBhY2tldC1oZWFkZXItY2FsY3VsYXRvci5qcycpLkpwaXBTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yO1xyXG52YXIgSnBpcFBhY2tldExlbmd0aENhbGN1bGF0b3IgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXBhY2tldC1sZW5ndGgtY2FsY3VsYXRvci5qcycgICAgICAgICAgICAgICAgICApLkpwaXBQYWNrZXRMZW5ndGhDYWxjdWxhdG9yO1xyXG52YXIgSnBpcFF1YWxpdHlMYXllcnNDYWNoZSAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXF1YWxpdHktbGF5ZXJzLWNhY2hlLmpzJyAgICAgICAgICAgICAgICAgICAgICApLkpwaXBRdWFsaXR5TGF5ZXJzQ2FjaGU7XHJcblxyXG52YXIganBpcFJ1bnRpbWVGYWN0b3J5ID0ge1xyXG4gICAgY3JlYXRlQ2hhbm5lbDogZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbChcclxuICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCwgc2Vzc2lvbkhlbHBlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcENoYW5uZWwoXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQ29kZXN0cmVhbVJlY29uc3RydWN0b3I6IGZ1bmN0aW9uKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGRhdGFiaW5zU2F2ZXIsIGhlYWRlck1vZGlmaWVyLCBxdWFsaXR5TGF5ZXJzQ2FjaGUpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDb2Rlc3RyZWFtUmVjb25zdHJ1Y3RvcihcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICAgICAgaGVhZGVyTW9kaWZpZXIsXHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVDb2Rlc3RyZWFtU2l6ZXNDYWxjdWxhdG9yOiBmdW5jdGlvbihwYXJhbXMpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDb2Rlc3RyZWFtU2l6ZXNDYWxjdWxhdG9yKHBhcmFtcyk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVDb2Rlc3RyZWFtU3RydWN0dXJlOiBmdW5jdGlvbihzdHJ1Y3R1cmVQYXJzZXIsIHByb2dyZXNzaW9uT3JkZXIpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDb2Rlc3RyZWFtU3RydWN0dXJlKFxyXG4gICAgICAgICAgICBzdHJ1Y3R1cmVQYXJzZXIsIGpwaXBSdW50aW1lRmFjdG9yeSwgcHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVDb21wb25lbnRTdHJ1Y3R1cmU6IGZ1bmN0aW9uKHBhcmFtcywgdGlsZVN0cnVjdHVyZSkge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcENvbXBvbmVudFN0cnVjdHVyZShwYXJhbXMsIHRpbGVTdHJ1Y3R1cmUpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQ29tcG9zaXRlQXJyYXk6IGZ1bmN0aW9uKG9mZnNldCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgQ29tcG9zaXRlQXJyYXkob2Zmc2V0KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZURhdGFiaW5QYXJ0czogZnVuY3Rpb24oY2xhc3NJZCwgaW5DbGFzc0lkKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwRGF0YWJpblBhcnRzKGNsYXNzSWQsIGluQ2xhc3NJZCwganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZURhdGFiaW5zU2F2ZXI6IGZ1bmN0aW9uKGlzSnBpcFRpbGVwYXJ0U3RyZWFtKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwRGF0YWJpbnNTYXZlcihpc0pwaXBUaWxlcGFydFN0cmVhbSwganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUZldGNoSGFuZGxlOiBmdW5jdGlvbihcclxuICAgICAgICByZXF1ZXN0ZXIsIGltYWdlRGF0YUNvbnRleHQsIGRlZGljYXRlZENoYW5uZWxIYW5kbGUpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwRmV0Y2hIYW5kbGUoXHJcbiAgICAgICAgICAgIHJlcXVlc3RlciwgaW1hZ2VEYXRhQ29udGV4dCwgZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVIZWFkZXJNb2RpZmllcjogZnVuY3Rpb24oXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSwgb2Zmc2V0c0NhbGN1bGF0b3IsIHByb2dyZXNzaW9uT3JkZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBIZWFkZXJNb2RpZmllcihcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSwgb2Zmc2V0c0NhbGN1bGF0b3IsIHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlSW1hZ2VEYXRhQ29udGV4dDogZnVuY3Rpb24oXHJcbiAgICAgICAganBpcE9iamVjdHMsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBwcm9ncmVzc2l2ZW5lc3MpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBJbWFnZURhdGFDb250ZXh0KFxyXG4gICAgICAgICAgICBqcGlwT2JqZWN0cywgY29kZXN0cmVhbVBhcnRQYXJhbXMsIHByb2dyZXNzaXZlbmVzcyk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVNYXJrZXJzUGFyc2VyOiBmdW5jdGlvbihtYWluSGVhZGVyRGF0YWJpbikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcE1hcmtlcnNQYXJzZXIoXHJcbiAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLCBqcGlwTWVzc2FnZUhlYWRlclBhcnNlciwganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZU9iamVjdFBvb2xCeURhdGFiaW46IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcE9iamVjdFBvb2xCeURhdGFiaW4oKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZU9mZnNldHNDYWxjdWxhdG9yOiBmdW5jdGlvbihtYWluSGVhZGVyRGF0YWJpbiwgbWFya2Vyc1BhcnNlcikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcE9mZnNldHNDYWxjdWxhdG9yKG1haW5IZWFkZXJEYXRhYmluLCBtYXJrZXJzUGFyc2VyKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVBhY2tldHNEYXRhQ29sbGVjdG9yOiBmdW5jdGlvbihcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBkYXRhYmluc1NhdmVyLCBxdWFsaXR5TGF5ZXJzQ2FjaGUpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBQYWNrZXRzRGF0YUNvbGxlY3RvcihcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyc0NhY2hlLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlUmVxdWVzdERhdGFiaW5zTGlzdGVuZXI6IGZ1bmN0aW9uIGNyZWF0ZVJlcXVlc3REYXRhYmluc0xpc3RlbmVyKFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIHF1YWxpdHlMYXllclJlYWNoZWRDYWxsYmFjayxcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgcXVhbGl0eUxheWVyc0NhY2hlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICBxdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2ssXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZSxcclxuICAgICAgICAgICAganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVJlcXVlc3Q6IGZ1bmN0aW9uIGNyZWF0ZVJlcXVlc3QoXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlciwgY2hhbm5lbCwgcmVxdWVzdFVybCwgY2FsbGJhY2ssIGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFJlcXVlc3QoXHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIsXHJcbiAgICAgICAgICAgIGpwaXBNZXNzYWdlSGVhZGVyUGFyc2VyLFxyXG4gICAgICAgICAgICBjaGFubmVsLFxyXG4gICAgICAgICAgICByZXF1ZXN0VXJsLFxyXG4gICAgICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVNlc3Npb25IZWxwZXI6IGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25IZWxwZXIoXHJcbiAgICAgICAgZGF0YVJlcXVlc3RVcmwsXHJcbiAgICAgICAga25vd25UYXJnZXRJZCxcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBTZXNzaW9uSGVscGVyKFxyXG4gICAgICAgICAgICBkYXRhUmVxdWVzdFVybCxcclxuICAgICAgICAgICAga25vd25UYXJnZXRJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICAgICAgc2ltcGxlQWpheEhlbHBlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVTZXNzaW9uOiBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKFxyXG4gICAgICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgIHRhcmdldElkLFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFNlc3Npb24oXHJcbiAgICAgICAgICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCxcclxuICAgICAgICAgICAgdGFyZ2V0SWQsXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgICAgIHNldEludGVydmFsLFxyXG4gICAgICAgICAgICBjbGVhckludGVydmFsLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlUmVjb25uZWN0YWJsZVJlcXVlc3RlcjogZnVuY3Rpb24oXHJcbiAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwUmVjb25uZWN0YWJsZVJlcXVlc3RlcihcclxuICAgICAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlU3RydWN0dXJlUGFyc2VyOiBmdW5jdGlvbihkYXRhYmluc1NhdmVyLCBtYXJrZXJzUGFyc2VyLCBvZmZzZXRzQ2FsY3VsYXRvcikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFN0cnVjdHVyZVBhcnNlcihcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlciwgbWFya2Vyc1BhcnNlciwganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXIsIG9mZnNldHNDYWxjdWxhdG9yKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVRpbGVTdHJ1Y3R1cmU6IGZ1bmN0aW9uKFxyXG4gICAgICAgIHNpemVQYXJhbXMsIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIHByb2dyZXNzaW9uT3JkZXIpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBUaWxlU3RydWN0dXJlKFxyXG4gICAgICAgICAgICBzaXplUGFyYW1zLCBjb2Rlc3RyZWFtU3RydWN0dXJlLCBqcGlwUnVudGltZUZhY3RvcnksIHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQml0c3RyZWFtUmVhZGVyOiBmdW5jdGlvbiBjcmVhdGVCaXRzdHJlYW1SZWFkZXIoZGF0YWJpbikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcEJpdHN0cmVhbVJlYWRlcihcclxuICAgICAgICAgICAgZGF0YWJpbiwgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlVGFnVHJlZTogZnVuY3Rpb24gY3JlYXRlVGFnVHJlZShiaXRzdHJlYW1SZWFkZXIsIHdpZHRoLCBoZWlnaHQpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBUYWdUcmVlKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsIHdpZHRoLCBoZWlnaHQsIG11dHVhbEV4Y2x1c2l2ZVRyYW5zYWN0aW9uSGVscGVyKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUNvZGVibG9ja0xlbmd0aFBhcnNlcjogZnVuY3Rpb24gY3JlYXRlQ29kZWJsb2NrTGVuZ3RoUGFyc2VyKFxyXG4gICAgICAgIGJpdHN0cmVhbVJlYWRlciwgdHJhbnNhY3Rpb25IZWxwZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDb2RlYmxvY2tMZW5ndGhQYXJzZXIoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlciwgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlU3ViYmFuZExlbmd0aEluUGFja2V0SGVhZGVyQ2FsY3VsYXRvciA6XHJcbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlU3ViYmFuZExlbmd0aEluUGFja2V0SGVhZGVyQ2FsY3VsYXRvcihcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLCBudW1Db2RlYmxvY2tzWEluU3ViYmFuZCwgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsXHJcbiAgICAgICAgICAgIG51bUNvZGVibG9ja3NYSW5TdWJiYW5kLFxyXG4gICAgICAgICAgICBudW1Db2RlYmxvY2tzWUluU3ViYmFuZCxcclxuICAgICAgICAgICAganBpcENvZGluZ1Bhc3Nlc051bWJlclBhcnNlcixcclxuICAgICAgICAgICAgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVQYWNrZXRMZW5ndGhDYWxjdWxhdG9yOiBmdW5jdGlvbiBjcmVhdGVQYWNrZXRMZW5ndGhDYWxjdWxhdG9yKFxyXG4gICAgICAgIHRpbGVTdHJ1Y3R1cmUsXHJcbiAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgc3RhcnRPZmZzZXRJbkRhdGFiaW4sXHJcbiAgICAgICAgcHJlY2luY3QpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBQYWNrZXRMZW5ndGhDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICB0aWxlU3RydWN0dXJlLFxyXG4gICAgICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgICAgIHN0YXJ0T2Zmc2V0SW5EYXRhYmluLFxyXG4gICAgICAgICAgICBwcmVjaW5jdCxcclxuICAgICAgICAgICAganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVF1YWxpdHlMYXllcnNDYWNoZTogZnVuY3Rpb24gY3JlYXRlUXVhbGl0eUxheWVyc0NhY2hlKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBRdWFsaXR5TGF5ZXJzQ2FjaGUoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qcGlwUnVudGltZUZhY3RvcnkgPSBqcGlwUnVudGltZUZhY3Rvcnk7IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuc2ltcGxlQWpheEhlbHBlciA9IHtcclxuICAgIHJlcXVlc3Q6IGZ1bmN0aW9uIHJlcXVlc3QoXHJcbiAgICAgICAgdXJsLFxyXG4gICAgICAgIGNhbGxiYWNrRm9yQXN5bmNocm9ub3VzUmVxdWVzdCxcclxuICAgICAgICBmYWlsdXJlQ2FsbGJhY2tGb3JBc3luY2hyb25vdXNSZXF1ZXN0LFxyXG4gICAgICAgIHByb2dyZXNzaXZlUmVxdWVzdFF1YW50Qnl0ZXMpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYWpheFJlc3BvbnNlID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XHJcbiAgICAgICAgdmFyIGlzU3luY2hyb25vdXMgPSBjYWxsYmFja0ZvckFzeW5jaHJvbm91c1JlcXVlc3QgPT09IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgdmFyIGlzRmluaXNoZWRSZXF1ZXN0ID0gZmFsc2U7XHJcbiAgICAgICAgdmFyIGJ5dGVzUmVjaWV2ZWRPbkxhc3RRdWFudCA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gaW50ZXJuYWxBamF4Q2FsbGJhY2soZSkge1xyXG4gICAgICAgICAgICBpZiAoaXNGaW5pc2hlZFJlcXVlc3QpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFqYXhSZXNwb25zZS5yZWFkeVN0YXRlICE9PSA0KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAocHJvZ3Jlc3NpdmVSZXF1ZXN0UXVhbnRCeXRlcyA9PT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgYWpheFJlc3BvbnNlLnJlc3BvbnNlID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgYWpheFJlc3BvbnNlLnJlYWR5U3RhdGUgPCAzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgYnl0ZXNSZWNpZXZlZCA9IGFqYXhSZXNwb25zZS5yZXNwb25zZS5ieXRlTGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgdmFyIGJ5dGVzVGlsbExhc3RRdWFudCA9IGJ5dGVzUmVjaWV2ZWQgLSBieXRlc1JlY2lldmVkT25MYXN0UXVhbnQ7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChieXRlc1RpbGxMYXN0UXVhbnQgPCBwcm9ncmVzc2l2ZVJlcXVlc3RRdWFudEJ5dGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBieXRlc1JlY2lldmVkT25MYXN0UXVhbnQgPSBieXRlc1JlY2lldmVkO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgaXNGaW5pc2hlZFJlcXVlc3QgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoYWpheFJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgYWpheFJlc3BvbnNlLnJlc3BvbnNlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrRm9yQXN5bmNocm9ub3VzUmVxdWVzdChhamF4UmVzcG9uc2UpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFpc1N5bmNocm9ub3VzKSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsYmFja0ZvckFzeW5jaHJvbm91c1JlcXVlc3QoYWpheFJlc3BvbnNlLCBpc0ZpbmlzaGVkUmVxdWVzdCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWpheFJlc3BvbnNlLm9wZW4oJ0dFVCcsIHVybCwgIWlzU3luY2hyb25vdXMpO1xyXG4gICAgICAgIGFqYXhSZXNwb25zZS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBpbnRlcm5hbEFqYXhDYWxsYmFjaztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzU3luY2hyb25vdXMpIHtcclxuICAgICAgICAgICAgLy8gTm90IHN1cHBvcnRlZCBmb3Igc3luY2hyb25vdXMgcmVxdWVzdHNcclxuICAgICAgICAgICAgYWpheFJlc3BvbnNlLm1velJlc3BvbnNlVHlwZSA9IGFqYXhSZXNwb25zZS5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHByb2dyZXNzaXZlUmVxdWVzdFF1YW50Qnl0ZXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBhamF4UmVzcG9uc2Uuc2V0UmVxdWVzdEhlYWRlcignWC1Db250ZW50LVR5cGUtT3B0aW9ucycsICdub3NuaWZmJyk7XHJcbiAgICAgICAgICAgIGFqYXhSZXNwb25zZS5vbnByb2dyZXNzID0gaW50ZXJuYWxBamF4Q2FsbGJhY2s7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGFqYXhSZXNwb25zZS5zZW5kKG51bGwpO1xyXG5cclxuICAgICAgICBpZiAoaXNTeW5jaHJvbm91cyAmJiAhaXNGaW5pc2hlZFJlcXVlc3QpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnc3luY2hyb25vdXMgYWpheCBjYWxsIHdhcyBub3QgZmluaXNoZWQgc3luY2hyb25vdXNseScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYWpheFJlc3BvbnNlO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBNYXJrZXJzUGFyc2VyID0gZnVuY3Rpb24gSnBpcE1hcmtlcnNQYXJzZXIoXHJcbiAgICBtYWluSGVhZGVyRGF0YWJpbiwgbWVzc2FnZUhlYWRlclBhcnNlciwganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdmFyIENBQ0hFX0tFWSA9ICdtYXJrZXJzJztcclxuICAgIFxyXG4gICAgdGhpcy5nZXRNYW5kYXRvcnlNYXJrZXJPZmZzZXRJbkRhdGFiaW4gPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldE1hbmRhdG9yeU1hcmtlck9mZnNldEluRGF0YWJpbkNsb3N1cmUoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIG1hcmtlciwgbWFya2VyTmFtZSwgc3RhbmRhcmRTZWN0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG9mZnNldCA9IGdldE1hcmtlck9mZnNldEluRGF0YWJpbihkYXRhYmluLCBtYXJrZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICBtYXJrZXJOYW1lICsgJyBpcyBub3QgZm91bmQgd2hlcmUgZXhwZWN0ZWQgdG8gYmUnLFxyXG4gICAgICAgICAgICAgICAgc3RhbmRhcmRTZWN0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2hlY2tTdXBwb3J0ZWRNYXJrZXJzID0gZnVuY3Rpb24gY2hlY2tTdXBwb3J0ZWRNYXJrZXJzQ2xvc3VyZShcclxuICAgICAgICBkYXRhYmluLCBtYXJrZXJzLCBpc01hcmtlcnNTdXBwb3J0ZWQpIHtcclxuICAgICAgICBcclxuICAgICAgICBpc01hcmtlcnNTdXBwb3J0ZWQgPSAhIWlzTWFya2Vyc1N1cHBvcnRlZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YWJpbk1hcmtlcnMgPSBnZXREYXRhYmluTWFya2VycyhcclxuICAgICAgICAgICAgZGF0YWJpbiwgLypmb3JjZUFsbE1hcmtlcnNQYXJzZWQ9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFya2Vyc0FzUHJvcGVydGllcyA9IHt9O1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgbWFya2VyID0gZ2V0TWFya2VyQXNQcm9wZXJ0eU5hbWUoXHJcbiAgICAgICAgICAgICAgICBtYXJrZXJzW2ldLCAnanBpcE1hcmtlcnNQYXJzZXIuc3VwcG9ydGVkTWFya2Vyc1snICsgaSArICddJyk7XHJcbiAgICAgICAgICAgIG1hcmtlcnNBc1Byb3BlcnRpZXNbbWFya2VyXSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGV4aXN0aW5nTWFya2VyIGluIGRhdGFiaW5NYXJrZXJzLm1hcmtlclRvT2Zmc2V0KSB7XHJcbiAgICAgICAgICAgIHZhciBpc01hcmtlckluTGlzdCA9ICEhbWFya2Vyc0FzUHJvcGVydGllc1tleGlzdGluZ01hcmtlcl07XHJcbiAgICAgICAgICAgIGlmIChpc01hcmtlckluTGlzdCAhPT0gaXNNYXJrZXJzU3VwcG9ydGVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ1Vuc3VwcG9ydGVkIG1hcmtlciBmb3VuZDogJyArIGV4aXN0aW5nTWFya2VyLCAndW5rbm93bicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4gPSBnZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW47XHJcbiAgICBcclxuICAgIHRoaXMuaXNNYXJrZXIgPSBpc01hcmtlcjtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaXNNYXJrZXIoZGF0YSwgbWFya2VyLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gKGRhdGFbb2Zmc2V0XSA9PT0gbWFya2VyWzBdKSAmJiAoZGF0YVtvZmZzZXQgKyAxXSA9PT0gbWFya2VyWzFdKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldE1hcmtlck9mZnNldEluRGF0YWJpbihkYXRhYmluLCBtYXJrZXIpIHtcclxuICAgICAgICB2YXIgZGF0YWJpbk1hcmtlcnMgPSBnZXREYXRhYmluTWFya2VycyhcclxuICAgICAgICAgICAgZGF0YWJpbiwgLypmb3JjZUFsbE1hcmtlcnNQYXJzZWQ9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3RyTWFya2VyID0gZ2V0TWFya2VyQXNQcm9wZXJ0eU5hbWUoXHJcbiAgICAgICAgICAgIG1hcmtlciwgJ1ByZWRlZmluZWQgbWFya2VyIGluIGpHbG9iYWxzLmoya01hcmtlcnMnKTtcclxuICAgICAgICB2YXIgb2Zmc2V0ID0gZGF0YWJpbk1hcmtlcnMubWFya2VyVG9PZmZzZXRbc3RyTWFya2VyXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAob2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0RGF0YWJpbk1hcmtlcnMoZGF0YWJpbiwgZm9yY2VBbGxNYXJrZXJzUGFyc2VkKSB7XHJcbiAgICAgICAgdmFyIGRhdGFiaW5NYXJrZXJzID0gZGF0YWJpbi5nZXRDYWNoZWREYXRhKENBQ0hFX0tFWSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5NYXJrZXJzLm1hcmtlclRvT2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuaXNQYXJzZWRBbGxNYXJrZXJzID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWQgPSAwO1xyXG4gICAgICAgICAgICBkYXRhYmluTWFya2Vycy5tYXJrZXJUb09mZnNldCA9IHt9O1xyXG4gICAgICAgICAgICBkYXRhYmluTWFya2Vycy5kYXRhYmluID0gZGF0YWJpbjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5NYXJrZXJzLmlzUGFyc2VkQWxsTWFya2Vycykge1xyXG4gICAgICAgICAgICByZXR1cm4gZGF0YWJpbk1hcmtlcnM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGFydE9mZnNldCA9IDA7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gW107XHJcbiAgICAgICAgdmFyIGNhblBhcnNlID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgaWYgKGRhdGFiaW4gPT09IG1haW5IZWFkZXJEYXRhYmluICYmIGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWQgPT09IDApIHtcclxuICAgICAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gZGF0YWJpbi5jb3B5Qnl0ZXMoYnl0ZXMsIC8qc3RhcnRPZmZzZXQ9Ki8wLCB7XHJcbiAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNhblBhcnNlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzTWFya2VyKGJ5dGVzLCBqR2xvYmFscy5qMmtNYXJrZXJzLlN0YXJ0T2ZDb2Rlc3RyZWFtLCAvKm9mZnNldD0qLzApKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnU09DIChTdGFydCBPZiBDb2Rlc3RyZWFtKSAnICtcclxuICAgICAgICAgICAgICAgICAgICAnaXMgbm90IGZvdW5kIHdoZXJlIGV4cGVjdGVkIHRvIGJlJyxcclxuICAgICAgICAgICAgICAgICAgICAnQS40LjEnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCA9IDI7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoY2FuUGFyc2UpIHtcclxuICAgICAgICAgICAgYWN0dWFsUGFyc2VNYXJrZXJzKGRhdGFiaW5NYXJrZXJzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWZ0ZXJQYXJzZU1hcmtlcnMoZGF0YWJpbk1hcmtlcnMsIGZvcmNlQWxsTWFya2Vyc1BhcnNlZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW5NYXJrZXJzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhY3R1YWxQYXJzZU1hcmtlcnMoZGF0YWJpbk1hcmtlcnMpIHtcclxuICAgICAgICB2YXIgb2Zmc2V0ID0gZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXMgPSBbXTtcclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBkYXRhYmluTWFya2Vycy5kYXRhYmluLmNvcHlCeXRlcyhieXRlcywgLypzdGFydE9mZnNldD0qLzAsIHtcclxuICAgICAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFICsgakdsb2JhbHMuajJrT2Zmc2V0cy5MRU5HVEhfRklFTERfU0laRSxcclxuICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogb2Zmc2V0XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoYnl0ZXNDb3BpZWQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdmFyIG1hcmtlciA9IGdldE1hcmtlckFzUHJvcGVydHlOYW1lKFxyXG4gICAgICAgICAgICAgICAgYnl0ZXMsXHJcbiAgICAgICAgICAgICAgICAnb2Zmc2V0ICcgKyBvZmZzZXQgKyAnIG9mIGRhdGFiaW4gd2l0aCBjbGFzcyBJRCA9ICcgK1xyXG4gICAgICAgICAgICAgICAgICAgIGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uZ2V0Q2xhc3NJZCgpICsgJyBhbmQgaW4gY2xhc3MgSUQgPSAnICtcclxuICAgICAgICAgICAgICAgICAgICBkYXRhYmluTWFya2Vycy5kYXRhYmluLmdldEluQ2xhc3NJZCgpKTtcclxuICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMubWFya2VyVG9PZmZzZXRbbWFya2VyLnRvU3RyaW5nKCldID0gb2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBsZW5ndGggPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDE2KGJ5dGVzLCBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFKTtcclxuICAgICAgICAgICAgb2Zmc2V0ICs9IGxlbmd0aCArIGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBieXRlc0NvcGllZCA9IGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwge1xyXG4gICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUgKyBqR2xvYmFscy5qMmtPZmZzZXRzLkxFTkdUSF9GSUVMRF9TSVpFLFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0OiBvZmZzZXRcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCA9IG9mZnNldDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWZ0ZXJQYXJzZU1hcmtlcnMoZGF0YWJpbk1hcmtlcnMsIGZvcmNlQWxsTWFya2Vyc1BhcnNlZCkge1xyXG4gICAgICAgIHZhciBkYXRhYmluTGVuZ3RoID0gZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5nZXREYXRhYmluTGVuZ3RoSWZLbm93bigpO1xyXG4gICAgICAgIGRhdGFiaW5NYXJrZXJzLmlzUGFyc2VkQWxsTWFya2VycyA9IGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWQgPT09IGRhdGFiaW5MZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFkYXRhYmluTWFya2Vycy5pc1BhcnNlZEFsbE1hcmtlcnMgJiYgZGF0YWJpbk1hcmtlcnMuZGF0YWJpbiAhPT0gbWFpbkhlYWRlckRhdGFiaW4pIHtcclxuICAgICAgICAgICAgdmFyIGJ5dGVzID0gW107XHJcbiAgICAgICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwge1xyXG4gICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUsXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWRcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGJ5dGVzQ29waWVkICE9PSBudWxsICYmXHJcbiAgICAgICAgICAgICAgICBpc01hcmtlcihieXRlcywgMCwgakdsb2JhbHMuajJrTWFya2Vycy5TdGFydE9mRGF0YSkpIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCArPSBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFO1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuaXNQYXJzZWRBbGxNYXJrZXJzID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZm9yY2VBbGxNYXJrZXJzUGFyc2VkICYmICFkYXRhYmluTWFya2Vycy5pc1BhcnNlZEFsbE1hcmtlcnMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnZGF0YS1iaW4gd2l0aCBjbGFzcyBJRCA9ICcgK1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5nZXRDbGFzc0lkKCkgKyAnIGFuZCBpbiBjbGFzcyBJRCA9ICcgK1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5nZXRJbkNsYXNzSWQoKSArXHJcbiAgICAgICAgICAgICAgICAnIHdhcyBub3QgcmVjaWV2ZWQgeWV0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRNYXJrZXJBc1Byb3BlcnR5TmFtZShieXRlcywgbWFya2VyUG9zaXRpb25EZXNjcmlwdGlvbikge1xyXG4gICAgICAgIGlmIChieXRlc1swXSAhPT0gMHhGRikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdFeHBlY3RlZCBtYXJrZXIgaW4gJyArIG1hcmtlclBvc2l0aW9uRGVzY3JpcHRpb24sICdBJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXIgPSBieXRlc1sxXS50b1N0cmluZygxNik7XHJcbiAgICAgICAgcmV0dXJuIG1hcmtlcjtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwT2Zmc2V0c0NhbGN1bGF0b3IgPSBmdW5jdGlvbiBKcGlwT2Zmc2V0c0NhbGN1bGF0b3IoXHJcbiAgICBtYWluSGVhZGVyRGF0YWJpbiwgbWFya2Vyc1BhcnNlcikge1xyXG4gICAgXHJcbiAgICB2YXIgc3VwcG9ydGVkTWFya2VycyA9IFtcclxuICAgICAgICBqR2xvYmFscy5qMmtNYXJrZXJzLkltYWdlQW5kVGlsZVNpemUsXHJcbiAgICAgICAgakdsb2JhbHMuajJrTWFya2Vycy5Db2RpbmdTdHlsZURlZmF1bHQsXHJcbiAgICAgICAgakdsb2JhbHMuajJrTWFya2Vycy5RdWFudGl6YXRpb25EZWZhdWx0LFxyXG4gICAgICAgIGpHbG9iYWxzLmoya01hcmtlcnMuQ29tbWVudFxyXG4gICAgICAgIF07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q29kaW5nU3R5bGVPZmZzZXQgPSBnZXRDb2RpbmdTdHlsZU9mZnNldDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDb2RpbmdTdHlsZUJhc2VQYXJhbXMgPSBnZXRDb2RpbmdTdHlsZUJhc2VQYXJhbXM7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SW1hZ2VBbmRUaWxlU2l6ZU9mZnNldCA9IGZ1bmN0aW9uIGdldEltYWdlQW5kVGlsZVNpemVPZmZzZXQoKSB7XHJcbiAgICAgICAgLy8gQS41LjEgKEltYWdlIGFuZCB0aWxlIHNpemUgbWFya2VyIHNlZ21lbnQpXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNpek1hcmtlck9mZnNldCA9IG1hcmtlcnNQYXJzZXIuZ2V0TWFuZGF0b3J5TWFya2VyT2Zmc2V0SW5EYXRhYmluKFxyXG4gICAgICAgICAgICBtYWluSGVhZGVyRGF0YWJpbixcclxuICAgICAgICAgICAgakdsb2JhbHMuajJrTWFya2Vycy5JbWFnZUFuZFRpbGVTaXplLFxyXG4gICAgICAgICAgICAnSW1hZ2UgYW5kIFRpbGUgU2l6ZSAoU0laKScsXHJcbiAgICAgICAgICAgICdBLjUuMScpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBzaXpNYXJrZXJPZmZzZXQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFJhbmdlc09mQmVzdFJlc29sdXRpb25MZXZlbHNEYXRhID1cclxuICAgICAgICBmdW5jdGlvbiBnZXRSYW5nZXNXaXRoRGF0YU9mUmVzb2x1dGlvbkxldmVsc0Nsb3N1cmUoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIG51bVJlc29sdXRpb25MZXZlbHMpIHtcclxuICAgICAgICBcclxuICAgICAgICBtYXJrZXJzUGFyc2VyLmNoZWNrU3VwcG9ydGVkTWFya2VycyhcclxuICAgICAgICAgICAgZGF0YWJpbiwgc3VwcG9ydGVkTWFya2VycywgLyppc01hcmtlcnNTdXBwb3J0ZWQ9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRhdGFiaW5Db2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zID0gZ2V0Q29kaW5nU3R5bGVCYXNlUGFyYW1zKFxyXG4gICAgICAgICAgICBkYXRhYmluLCAvKmlzTWFuZGF0b3J5PSovZmFsc2UpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkYXRhYmluT3JNYWluSGVhZGVyQ29kaW5nU3R5bGVCYXNlUGFyYW1zID0gZGF0YWJpbkNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXM7XHJcbiAgICAgICAgaWYgKGRhdGFiaW5Db2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGRhdGFiaW5Pck1haW5IZWFkZXJDb2RpbmdTdHlsZUJhc2VQYXJhbXMgPSBnZXRDb2RpbmdTdHlsZUJhc2VQYXJhbXMoXHJcbiAgICAgICAgICAgICAgICBtYWluSGVhZGVyRGF0YWJpbiwgLyppc01hbmRhdG9yeT0qL3RydWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbkNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMubnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlTnVtUmVzb2x1dGlvbkxldmVscyA9IFxyXG4gICAgICAgICAgICBkYXRhYmluT3JNYWluSGVhZGVyQ29kaW5nU3R5bGVCYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChjb2RpbmdTdHlsZU51bVJlc29sdXRpb25MZXZlbHMgPD0gbnVtUmVzb2x1dGlvbkxldmVscykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdudW1SZXNvbHV0aW9uTGV2ZWxzICgnICsgbnVtUmVzb2x1dGlvbkxldmVscyArICcpIDw9IENPRC4nICtcclxuICAgICAgICAgICAgICAgICdudW1SZXNvbHV0aW9uTGV2ZWxzICgnICsgY29kaW5nU3R5bGVOdW1SZXNvbHV0aW9uTGV2ZWxzICsgJyknKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciByYW5nZXMgPSBbXTtcclxuXHJcbiAgICAgICAgYWRkUmFuZ2VPZkJlc3RSZXNvbHV0aW9uTGV2ZWxzSW5Db2RpbmdTdHlsZShcclxuICAgICAgICAgICAgcmFuZ2VzLCBkYXRhYmluQ29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcywgbnVtUmVzb2x1dGlvbkxldmVscyk7XHJcblxyXG4gICAgICAgIGFkZFJhbmdlT2ZCZXN0UmVzb2x1dGlvbkxldmVsc0luUXVhbnRpemF0aW9uKFxyXG4gICAgICAgICAgICByYW5nZXMsXHJcbiAgICAgICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgICAgIGRhdGFiaW5Pck1haW5IZWFkZXJDb2RpbmdTdHlsZUJhc2VQYXJhbXMsXHJcbiAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHMpO1xyXG5cclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICByYW5nZXM6IHJhbmdlcyxcclxuICAgICAgICAgICAgbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldDogbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRDb2RpbmdTdHlsZUJhc2VQYXJhbXMoXHJcbiAgICAgICAgZGF0YWJpbiwgaXNNYW5kYXRvcnkpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0ID0gZ2V0Q29kaW5nU3R5bGVPZmZzZXQoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIGlzTWFuZGF0b3J5KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtQnl0ZXMgPSA4O1xyXG4gICAgICAgIHZhciBieXRlc09mZnNldCA9IGNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCArIGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkU7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gZ2V0Qnl0ZXMoZGF0YWJpbiwgbnVtQnl0ZXMsIGJ5dGVzT2Zmc2V0KTtcclxuXHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlRmxhZ3NGb3JBbGxDb21wb25lbnRzT2Zmc2V0ID0gMjsgLy8gU2NvZFxyXG4gICAgICAgIHZhciBjb2RpbmdTdHlsZUZsYWdzRm9yQWxsQ29tcG9uZW50cyA9XHJcbiAgICAgICAgICAgIGJ5dGVzW2NvZGluZ1N0eWxlRmxhZ3NGb3JBbGxDb21wb25lbnRzT2Zmc2V0XTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzRGVmYXVsdFByZWNpbmN0U2l6ZSA9ICEoY29kaW5nU3R5bGVGbGFnc0ZvckFsbENvbXBvbmVudHMgJiAweDEpO1xyXG4gICAgICAgIHZhciBpc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkID0gISEoY29kaW5nU3R5bGVGbGFnc0ZvckFsbENvbXBvbmVudHMgJiAweDIpO1xyXG4gICAgICAgIHZhciBpc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQgPSAhIShjb2RpbmdTdHlsZUZsYWdzRm9yQWxsQ29tcG9uZW50cyAmIDB4NCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXRJbkJ5dGVzID0gNzsgLy8gU1Bjb2QsIDFzdCBieXRlXHJcbiAgICAgICAgdmFyIG51bURlY29tcG9zaXRpb25MZXZlbHMgPSBieXRlc1tudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0SW5CeXRlc107XHJcbiAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHMgPSBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzICsgMTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldCA9IGJ5dGVzT2Zmc2V0ICsgbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldEluQnl0ZXM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0U2l6ZXNPZmZzZXQgPSBpc0RlZmF1bHRQcmVjaW5jdFNpemUgPyBudWxsIDogY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0ICsgMTQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0OiBjb2RpbmdTdHlsZURlZmF1bHRPZmZzZXQsXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpc0RlZmF1bHRQcmVjaW5jdFNpemU6IGlzRGVmYXVsdFByZWNpbmN0U2l6ZSxcclxuICAgICAgICAgICAgaXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZDogaXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZCxcclxuICAgICAgICAgICAgaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkOiBpc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQsXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzOiBudW1SZXNvbHV0aW9uTGV2ZWxzLFxyXG4gICAgICAgICAgICBwcmVjaW5jdFNpemVzT2Zmc2V0OiBwcmVjaW5jdFNpemVzT2Zmc2V0LFxyXG4gICAgICAgICAgICBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0OiBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWRkUmFuZ2VPZkJlc3RSZXNvbHV0aW9uTGV2ZWxzSW5Db2RpbmdTdHlsZShcclxuICAgICAgICByYW5nZXMsIGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMsIG51bVJlc29sdXRpb25MZXZlbHMpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcyA9PT0gbnVsbCB8fFxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLmlzRGVmYXVsdFByZWNpbmN0U2l6ZSkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGV2ZWxzTm90SW5SYW5nZSA9XHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscyAtIG51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZpcnN0T2Zmc2V0SW5SYW5nZSA9XHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMucHJlY2luY3RTaXplc09mZnNldCArIGxldmVsc05vdEluUmFuZ2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1hcmtlckxlbmd0aE9mZnNldCA9IFxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLmNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCArIGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0U2l6ZXNSYW5nZSA9IHtcclxuICAgICAgICAgICAgbWFya2VyU2VnbWVudExlbmd0aE9mZnNldDogbWFya2VyTGVuZ3RoT2Zmc2V0LFxyXG4gICAgICAgICAgICBzdGFydDogZmlyc3RPZmZzZXRJblJhbmdlLFxyXG4gICAgICAgICAgICBsZW5ndGg6IG51bVJlc29sdXRpb25MZXZlbHNcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuXHJcbiAgICAgICAgcmFuZ2VzLnB1c2gocHJlY2luY3RTaXplc1JhbmdlKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRRdWFudGl6YXRpb25EYXRhQnl0ZXNQZXJTdWJiYW5kKGRhdGFiaW4sIHF1YW50aXphdGlvblN0eWxlT2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIHNxY2RPZmZzZXQgPSBxdWFudGl6YXRpb25TdHlsZU9mZnNldCArIDQ7IC8vIFNxY2RcclxuICAgICAgICB2YXIgYnl0ZXMgPSBnZXRCeXRlcyhkYXRhYmluLCAvKm51bUJ5dGVzPSovMSwgc3FjZE9mZnNldCk7XHJcbiAgICAgICAgdmFyIHF1YW50aXphdGlvblN0eWxlID0gYnl0ZXNbMF0gJiAweDFGO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc1BlclN1YmJhbmQ7XHJcbiAgICAgICAgc3dpdGNoIChxdWFudGl6YXRpb25TdHlsZSkge1xyXG4gICAgICAgICAgICBjYXNlIDA6XHJcbiAgICAgICAgICAgICAgICBieXRlc1BlclN1YmJhbmQgPSAxO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgICAgIGJ5dGVzUGVyU3ViYmFuZCA9IDA7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgICAgICAgYnl0ZXNQZXJTdWJiYW5kID0gMjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ1F1YW50aXphdGlvbiBzdHlsZSBvZiAnICsgcXVhbnRpemF0aW9uU3R5bGUsICdBLjYuNCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYnl0ZXNQZXJTdWJiYW5kO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhZGRSYW5nZU9mQmVzdFJlc29sdXRpb25MZXZlbHNJblF1YW50aXphdGlvbihcclxuICAgICAgICByYW5nZXMsXHJcbiAgICAgICAgZGF0YWJpbixcclxuICAgICAgICBjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLFxyXG4gICAgICAgIG51bVJlc29sdXRpb25MZXZlbHMpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcWNkTWFya2VyT2Zmc2V0ID0gbWFya2Vyc1BhcnNlci5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIGpHbG9iYWxzLmoya01hcmtlcnMuUXVhbnRpemF0aW9uRGVmYXVsdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHFjZE1hcmtlck9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc1BlclN1YmJhbmQgPSBnZXRRdWFudGl6YXRpb25EYXRhQnl0ZXNQZXJTdWJiYW5kKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBxY2RNYXJrZXJPZmZzZXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAoYnl0ZXNQZXJTdWJiYW5kID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxldmVsc05vdEluUmFuZ2UgPVxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMgLSBudW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdWJiYW5kc05vdEluUmFuZ2UgPSAxICsgMyAqIChsZXZlbHNOb3RJblJhbmdlIC0gMSk7XHJcbiAgICAgICAgdmFyIHN1YmJhbmRzSW5SYW5nZSA9IDMgKiBudW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdE9mZnNldEluUmFuZ2UgPVxyXG4gICAgICAgICAgICBxY2RNYXJrZXJPZmZzZXQgKyA1ICsgc3ViYmFuZHNOb3RJblJhbmdlICogYnl0ZXNQZXJTdWJiYW5kO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByYW5nZUxlbmd0aCA9IHN1YmJhbmRzSW5SYW5nZSAqIGJ5dGVzUGVyU3ViYmFuZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFya2VyTGVuZ3RoT2Zmc2V0ID0gcWNkTWFya2VyT2Zmc2V0ICsgakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcXVhbnRpemF0aW9uc1JhbmdlID0ge1xyXG4gICAgICAgICAgICBtYXJrZXJTZWdtZW50TGVuZ3RoT2Zmc2V0OiBtYXJrZXJMZW5ndGhPZmZzZXQsXHJcbiAgICAgICAgICAgIHN0YXJ0OiBmaXJzdE9mZnNldEluUmFuZ2UsXHJcbiAgICAgICAgICAgIGxlbmd0aDogcmFuZ2VMZW5ndGhcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByYW5nZXMucHVzaChxdWFudGl6YXRpb25zUmFuZ2UpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBleHBlY3ROb0NvZGluZ1N0eWxlQ29tcG9uZW50KGRhdGFiaW4pIHtcclxuICAgICAgICB2YXIgY29jT2Zmc2V0ID0gbWFya2Vyc1BhcnNlci5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIGpHbG9iYWxzLmoya01hcmtlcnMuQ29kaW5nU3R5bGVDb21wb25lbnQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2NPZmZzZXQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgLy8gQS42LjJcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0NPQyBNYXJrZXIgKENvZGluZyBTdHlsZSBDb21wb25lbnQpJywgJ0EuNi4yJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRDb2RpbmdTdHlsZU9mZnNldChkYXRhYmluLCBpc01hbmRhdG9yeSkge1xyXG4gICAgICAgIGV4cGVjdE5vQ29kaW5nU3R5bGVDb21wb25lbnQoZGF0YWJpbik7XHJcblxyXG4gICAgICAgIHZhciBvZmZzZXQ7XHJcbiAgICAgICAgaWYgKGlzTWFuZGF0b3J5KSB7XHJcbiAgICAgICAgICAgIG9mZnNldCA9IG1hcmtlcnNQYXJzZXIuZ2V0TWFuZGF0b3J5TWFya2VyT2Zmc2V0SW5EYXRhYmluKFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbixcclxuICAgICAgICAgICAgICAgIGpHbG9iYWxzLmoya01hcmtlcnMuQ29kaW5nU3R5bGVEZWZhdWx0LFxyXG4gICAgICAgICAgICAgICAgJ0NPRCAoQ29kaW5nIHN0eWxlIERlZmF1bHQpJyxcclxuICAgICAgICAgICAgICAgICdBLjYuMScpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG9mZnNldCA9IG1hcmtlcnNQYXJzZXIuZ2V0TWFya2VyT2Zmc2V0SW5EYXRhYmluKFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbiwgakdsb2JhbHMuajJrTWFya2Vycy5Db2RpbmdTdHlsZURlZmF1bHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gb2Zmc2V0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRCeXRlcyhkYXRhYmluLCBudW1CeXRlcywgZGF0YWJpblN0YXJ0T2Zmc2V0LCBhbGxvd0VuZE9mUmFuZ2UpIHtcclxuICAgICAgICB2YXIgYnl0ZXMgPSBbXTtcclxuXHJcbiAgICAgICAgdmFyIHJhbmdlT3B0aW9ucyA9IHtcclxuICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogbnVtQnl0ZXMsXHJcbiAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogZGF0YWJpblN0YXJ0T2Zmc2V0XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gZGF0YWJpbi5jb3B5Qnl0ZXMoYnl0ZXMsIC8qc3RhcnRPZmZzZXQ9Ki8wLCByYW5nZU9wdGlvbnMpO1xyXG4gICAgICAgIGlmIChieXRlc0NvcGllZCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdIZWFkZXIgZGF0YS1iaW4gaGFzIG5vdCB5ZXQgcmVjaWV2ZWQgJyArIG51bUJ5dGVzICtcclxuICAgICAgICAgICAgICAgICcgYnl0ZXMgc3RhcnRpbmcgZnJvbSBvZmZzZXQgJyArIGRhdGFiaW5TdGFydE9mZnNldCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBieXRlcztcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwU3RydWN0dXJlUGFyc2VyID0gZnVuY3Rpb24gSnBpcFN0cnVjdHVyZVBhcnNlcihcclxuICAgIGRhdGFiaW5zU2F2ZXIsIG1hcmtlcnNQYXJzZXIsIG1lc3NhZ2VIZWFkZXJQYXJzZXIsIG9mZnNldHNDYWxjdWxhdG9yKSB7XHJcbiAgICBcclxuICAgIHRoaXMucGFyc2VDb2Rlc3RyZWFtU3RydWN0dXJlID0gZnVuY3Rpb24gcGFyc2VDb2Rlc3RyZWFtU3RydWN0dXJlKCkge1xyXG4gICAgICAgIC8vIEEuNS4xIChJbWFnZSBhbmQgVGlsZSBTaXplKVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6TWFya2VyT2Zmc2V0ID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0SW1hZ2VBbmRUaWxlU2l6ZU9mZnNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlcyA9IGdldEJ5dGVzKFxyXG4gICAgICAgICAgICBtYWluSGVhZGVyRGF0YWJpbixcclxuICAgICAgICAgICAgLypudW1CeXRlcz0qLzM4LFxyXG4gICAgICAgICAgICBzaXpNYXJrZXJPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFICsgakdsb2JhbHMuajJrT2Zmc2V0cy5MRU5HVEhfRklFTERfU0laRSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0ID1cclxuICAgICAgICAgICAgakdsb2JhbHMuajJrT2Zmc2V0cy5SRUZFUkVOQ0VfR1JJRF9TSVpFX09GRlNFVF9BRlRFUl9TSVpfTUFSS0VSIC1cclxuICAgICAgICAgICAgKGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUgKyBqR2xvYmFscy5qMmtPZmZzZXRzLkxFTkdUSF9GSUVMRF9TSVpFKTtcclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50c09mZnNldCA9XHJcbiAgICAgICAgICAgIGpHbG9iYWxzLmoya09mZnNldHMuTlVNX0NPTVBPTkVOVFNfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVIgLVxyXG4gICAgICAgICAgICAoakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRSArIGpHbG9iYWxzLmoya09mZnNldHMuTEVOR1RIX0ZJRUxEX1NJWkUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgcmVmZXJlbmNlR3JpZFNpemVYID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihcclxuICAgICAgICAgICAgYnl0ZXMsIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0KTsgLy8gWFNpelxyXG4gICAgICAgIHZhciByZWZlcmVuY2VHcmlkU2l6ZVkgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKFxyXG4gICAgICAgICAgICBieXRlcywgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgKyA0KTsgLy8gWVNpelxyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgaW1hZ2VPZmZzZXRYID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMTApOyAvLyBYT1NpelxyXG4gICAgICAgIHZhciBpbWFnZU9mZnNldFkgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKGJ5dGVzLCAxNCk7IC8vIFlPU2l6XHJcbiAgICAgICAgdmFyIHRpbGVTaXplWCA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MzIoYnl0ZXMsIDE4KTsgLy8gWFRTaXpcclxuICAgICAgICB2YXIgdGlsZVNpemVZID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMjIpOyAvLyBZVFNpelxyXG4gICAgICAgIHZhciBmaXJzdFRpbGVPZmZzZXRYID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMjYpOyAvLyBYVE9TaXpcclxuICAgICAgICB2YXIgZmlyc3RUaWxlT2Zmc2V0WSA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MzIoYnl0ZXMsIDMwKTsgLy8gWVRPU2l6XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvbXBvbmVudHMgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDE2KGJ5dGVzLCBudW1Db21wb25lbnRzT2Zmc2V0KTsgLy8gQ1NpelxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRzRGF0YU9mZnNldCA9XHJcbiAgICAgICAgICAgIHNpek1hcmtlck9mZnNldCArIGpHbG9iYWxzLmoya09mZnNldHMuTlVNX0NPTVBPTkVOVFNfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVIgKyAyO1xyXG4gICAgICAgIHZhciBjb21wb25lbnRzRGF0YUxlbmd0aCA9IG51bUNvbXBvbmVudHMgKiAzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRzRGF0YUJ5dGVzID0gZ2V0Qnl0ZXMoXHJcbiAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLCBjb21wb25lbnRzRGF0YUxlbmd0aCwgY29tcG9uZW50c0RhdGFPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRzU2NhbGVYID0gbmV3IEFycmF5KG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgIHZhciBjb21wb25lbnRzU2NhbGVZID0gbmV3IEFycmF5KG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtQ29tcG9uZW50czsgKytpKSB7XHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVhbaV0gPSBjb21wb25lbnRzRGF0YUJ5dGVzW2kgKiAzICsgMV07XHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVlbaV0gPSBjb21wb25lbnRzRGF0YUJ5dGVzW2kgKiAzICsgMl07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIG51bUNvbXBvbmVudHM6IG51bUNvbXBvbmVudHMsXHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVg6IGNvbXBvbmVudHNTY2FsZVgsXHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVk6IGNvbXBvbmVudHNTY2FsZVksXHJcbiAgICAgICAgICAgIGltYWdlV2lkdGg6IHJlZmVyZW5jZUdyaWRTaXplWCAtIGZpcnN0VGlsZU9mZnNldFgsXHJcbiAgICAgICAgICAgIGltYWdlSGVpZ2h0OiByZWZlcmVuY2VHcmlkU2l6ZVkgLSBmaXJzdFRpbGVPZmZzZXRZLFxyXG4gICAgICAgICAgICB0aWxlV2lkdGg6IHRpbGVTaXplWCxcclxuICAgICAgICAgICAgdGlsZUhlaWdodDogdGlsZVNpemVZLFxyXG4gICAgICAgICAgICBmaXJzdFRpbGVPZmZzZXRYOiBmaXJzdFRpbGVPZmZzZXRYLFxyXG4gICAgICAgICAgICBmaXJzdFRpbGVPZmZzZXRZOiBmaXJzdFRpbGVPZmZzZXRZXHJcbiAgICAgICAgfTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJzZURlZmF1bHRUaWxlUGFyYW1zID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIG1haW5IZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRNYWluSGVhZGVyRGF0YWJpbigpO1xyXG5cclxuICAgICAgICB2YXIgdGlsZVBhcmFtcyA9IHBhcnNlQ29kaW5nU3R5bGUobWFpbkhlYWRlckRhdGFiaW4sIC8qaXNNYW5kYXRvcnk9Ki90cnVlKTtcclxuICAgICAgICByZXR1cm4gdGlsZVBhcmFtcztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucGFyc2VPdmVycmlkZW5UaWxlUGFyYW1zID0gZnVuY3Rpb24odGlsZUluZGV4KSB7XHJcbiAgICAgICAgdmFyIHRpbGVIZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRUaWxlSGVhZGVyRGF0YWJpbih0aWxlSW5kZXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEEuNC4yIChTdGFydCBPZiBUaWxlLXBhcnQpXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVQYXJhbXMgPSBwYXJzZUNvZGluZ1N0eWxlKHRpbGVIZWFkZXJEYXRhYmluLCAvKmlzTWFuZGF0b3J5PSovZmFsc2UpO1xyXG4gICAgICAgIHJldHVybiB0aWxlUGFyYW1zO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBwYXJzZUNvZGluZ1N0eWxlKGRhdGFiaW4sIGlzTWFuZGF0b3J5KSB7XHJcbiAgICAgICAgLy8gQS41LjEgKEltYWdlIGFuZCBUaWxlIFNpemUpXHJcblxyXG4gICAgICAgIHZhciBiYXNlUGFyYW1zID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0Q29kaW5nU3R5bGVCYXNlUGFyYW1zKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBpc01hbmRhdG9yeSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGJhc2VQYXJhbXMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgbWFpbkhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldE1haW5IZWFkZXJEYXRhYmluKCk7XHJcblxyXG4gICAgICAgIHZhciBzaXpNYXJrZXJPZmZzZXQgPSBvZmZzZXRzQ2FsY3VsYXRvci5nZXRJbWFnZUFuZFRpbGVTaXplT2Zmc2V0KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvbXBvbmVudHNPZmZzZXQgPVxyXG4gICAgICAgICAgICBzaXpNYXJrZXJPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLk5VTV9DT01QT05FTlRTX09GRlNFVF9BRlRFUl9TSVpfTUFSS0VSO1xyXG5cclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50c0J5dGVzID0gZ2V0Qnl0ZXMoXHJcbiAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLFxyXG4gICAgICAgICAgICAvKm51bUJ5dGVzPSovMixcclxuICAgICAgICAgICAgLypzdGFydE9mZnNldD0qL251bUNvbXBvbmVudHNPZmZzZXQpO1xyXG4gICAgICAgIHZhciBudW1Db21wb25lbnRzID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQxNihudW1Db21wb25lbnRzQnl0ZXMsIDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYWNrZWRQYWNrZXRIZWFkZXJzTWFya2VySW5UaWxlSGVhZGVyID1cclxuICAgICAgICAgICAgbWFya2Vyc1BhcnNlci5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLCBqR2xvYmFscy5qMmtNYXJrZXJzLlBhY2tlZFBhY2tldEhlYWRlcnNJblRpbGVIZWFkZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYWNrZWRQYWNrZXRIZWFkZXJzTWFya2VySW5NYWluSGVhZGVyID1cclxuICAgICAgICAgICAgbWFya2Vyc1BhcnNlci5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgICAgICBtYWluSGVhZGVyRGF0YWJpbiwgakdsb2JhbHMuajJrTWFya2Vycy5QYWNrZWRQYWNrZXRIZWFkZXJzSW5NYWluSGVhZGVyKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNQYWNrZXRIZWFkZXJzTmVhckRhdGEgPVxyXG4gICAgICAgICAgICBwYWNrZWRQYWNrZXRIZWFkZXJzTWFya2VySW5UaWxlSGVhZGVyID09PSBudWxsICYmXHJcbiAgICAgICAgICAgIHBhY2tlZFBhY2tldEhlYWRlcnNNYXJrZXJJbk1haW5IZWFkZXIgPT09IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlTW9yZURhdGFPZmZzZXQgPSBiYXNlUGFyYW1zLmNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCArIDY7XHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlTW9yZURhdGFCeXRlcyA9IGdldEJ5dGVzKFxyXG4gICAgICAgICAgICBkYXRhYmluLFxyXG4gICAgICAgICAgICAvKm51bUJ5dGVzPSovNixcclxuICAgICAgICAgICAgLypzdGFydE9mZnNldD0qL2NvZGluZ1N0eWxlTW9yZURhdGFPZmZzZXQpO1xyXG4gICAgICAgIHZhciBudW1RdWFsaXR5TGF5ZXJzID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQxNihcclxuICAgICAgICAgICAgY29kaW5nU3R5bGVNb3JlRGF0YUJ5dGVzLCAwKTtcclxuXHJcbiAgICAgICAgdmFyIGNvZGVibG9ja1dpZHRoID0gcGFyc2VDb2RlYmxvY2tTaXplKFxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZU1vcmVEYXRhQnl0ZXMsIDQpO1xyXG4gICAgICAgIHZhciBjb2RlYmxvY2tIZWlnaHQgPSBwYXJzZUNvZGVibG9ja1NpemUoXHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlTW9yZURhdGFCeXRlcywgNSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0V2lkdGhzID0gbmV3IEFycmF5KGJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0SGVpZ2h0cyA9IG5ldyBBcnJheShiYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFNpemVzQnl0ZXMgPSBudWxsO1xyXG4gICAgICAgIGlmICghYmFzZVBhcmFtcy5pc0RlZmF1bHRQcmVjaW5jdFNpemUpIHtcclxuICAgICAgICAgICAgdmFyIHByZWNpbmN0U2l6ZXNCeXRlc05lZWRlZCA9IGJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHByZWNpbmN0U2l6ZXNCeXRlcyA9IGdldEJ5dGVzKFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbixcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0U2l6ZXNCeXRlc05lZWRlZCxcclxuICAgICAgICAgICAgICAgIGJhc2VQYXJhbXMucHJlY2luY3RTaXplc09mZnNldCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgZGVmYXVsdFNpemUgPSAxIDw8IDE1O1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGJhc2VQYXJhbXMuaXNEZWZhdWx0UHJlY2luY3RTaXplKSB7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFdpZHRoc1tpXSA9IGRlZmF1bHRTaXplO1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RIZWlnaHRzW2ldID0gZGVmYXVsdFNpemU7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHByZWNpbmN0U2l6ZU9mZnNldCA9IGk7XHJcbiAgICAgICAgICAgIHZhciBzaXplRXhwb25lbnRzID0gcHJlY2luY3RTaXplc0J5dGVzW3ByZWNpbmN0U2l6ZU9mZnNldF07XHJcbiAgICAgICAgICAgIHZhciBwcHggPSBzaXplRXhwb25lbnRzICYgMHgwRjtcclxuICAgICAgICAgICAgdmFyIHBweSA9IHNpemVFeHBvbmVudHMgPj4+IDQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwcmVjaW5jdFdpZHRoc1tpXSA9IDEgKiBNYXRoLnBvdygyLCBwcHgpOyAvLyBBdm9pZCBuZWdhdGl2ZSByZXN1bHQgZHVlIHRvIHNpZ25lZCBjYWxjdWxhdGlvblxyXG4gICAgICAgICAgICBwcmVjaW5jdEhlaWdodHNbaV0gPSAxICogTWF0aC5wb3coMiwgcHB5KTsgLy8gQXZvaWQgbmVnYXRpdmUgcmVzdWx0IGR1ZSB0byBzaWduZWQgY2FsY3VsYXRpb25cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhcmFtc1BlckNvbXBvbmVudCA9IG5ldyBBcnJheShudW1Db21wb25lbnRzKTtcclxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG51bUNvbXBvbmVudHM7ICsraikge1xyXG4gICAgICAgICAgICBwYXJhbXNQZXJDb21wb25lbnRbal0gPSB7XHJcbiAgICAgICAgICAgICAgICBtYXhDb2RlYmxvY2tXaWR0aDogY29kZWJsb2NrV2lkdGgsXHJcbiAgICAgICAgICAgICAgICBtYXhDb2RlYmxvY2tIZWlnaHQ6IGNvZGVibG9ja0hlaWdodCxcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsczogYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzLFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFdpZHRoUGVyTGV2ZWw6IHByZWNpbmN0V2lkdGhzLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RIZWlnaHRQZXJMZXZlbDogcHJlY2luY3RIZWlnaHRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkZWZhdWx0Q29tcG9uZW50UGFyYW1zID0ge1xyXG4gICAgICAgICAgICBtYXhDb2RlYmxvY2tXaWR0aDogY29kZWJsb2NrV2lkdGgsXHJcbiAgICAgICAgICAgIG1heENvZGVibG9ja0hlaWdodDogY29kZWJsb2NrSGVpZ2h0LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsczogYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzLFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJlY2luY3RXaWR0aFBlckxldmVsOiBwcmVjaW5jdFdpZHRocyxcclxuICAgICAgICAgICAgcHJlY2luY3RIZWlnaHRQZXJMZXZlbDogcHJlY2luY3RIZWlnaHRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVQYXJhbXMgPSB7XHJcbiAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnM6IG51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpc1BhY2tldEhlYWRlcnNOZWFyRGF0YTogaXNQYWNrZXRIZWFkZXJzTmVhckRhdGEsXHJcbiAgICAgICAgICAgIGlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQ6IGJhc2VQYXJhbXMuaXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZCxcclxuICAgICAgICAgICAgaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkOiBiYXNlUGFyYW1zLmlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCxcclxuXHJcbiAgICAgICAgICAgIHBhcmFtc1BlckNvbXBvbmVudDogcGFyYW1zUGVyQ29tcG9uZW50LFxyXG4gICAgICAgICAgICBkZWZhdWx0Q29tcG9uZW50UGFyYW1zOiBkZWZhdWx0Q29tcG9uZW50UGFyYW1zXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRpbGVQYXJhbXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHBhcnNlQ29kZWJsb2NrU2l6ZShieXRlcywgb2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja1NpemVFeHBvbmVudE1pbnVzMiA9IGJ5dGVzW29mZnNldF07XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja1NpemVFeHBvbmVudCA9IDIgKyAoY29kZWJsb2NrU2l6ZUV4cG9uZW50TWludXMyICYgMHgwRik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGVibG9ja1NpemVFeHBvbmVudCA+IDEwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0lsbGVnYWwgY29kZWJsb2NrIHdpZHRoIGV4cG9uZW50ICcgKyBjb2RlYmxvY2tTaXplRXhwb25lbnQsXHJcbiAgICAgICAgICAgICAgICAnQS42LjEsIFRhYmxlIEEuMTgnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNpemUgPSAxIDw8IGNvZGVibG9ja1NpemVFeHBvbmVudDtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Qnl0ZXMoZGF0YWJpbiwgbnVtQnl0ZXMsIGRhdGFiaW5TdGFydE9mZnNldCwgYWxsb3dFbmRPZlJhbmdlKSB7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gW107XHJcblxyXG4gICAgICAgIHZhciByYW5nZU9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IG51bUJ5dGVzLFxyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGRhdGFiaW5TdGFydE9mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwgcmFuZ2VPcHRpb25zKTtcclxuICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnSGVhZGVyIGRhdGEtYmluIGhhcyBub3QgeWV0IHJlY2lldmVkICcgKyBudW1CeXRlcyArXHJcbiAgICAgICAgICAgICAgICAnIGJ5dGVzIHN0YXJ0aW5nIGZyb20gb2Zmc2V0ICcgKyBkYXRhYmluU3RhcnRPZmZzZXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYnl0ZXM7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuSnBpcENoYW5uZWwgPSBmdW5jdGlvbiBKcGlwQ2hhbm5lbChcclxuICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLCBzZXNzaW9uSGVscGVyLCBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgY2hhbm5lbElkID0gbnVsbDtcclxuICAgIHZhciByZXF1ZXN0SWQgPSAwO1xyXG4gICAgdmFyIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbiA9IFtdO1xyXG4gICAgdmFyIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlID0gW107XHJcbiAgICB2YXIgaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB0aGlzLnJlcXVlc3REYXRhID0gZnVuY3Rpb24gcmVxdWVzdERhdGEoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAgICAgZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgIG51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgLy8gTm8gbmVlZCB0byBjaGVjayBpZiB0aGVyZSBhcmUgdG9vIG1hbnkgY29uY3VycmVudCByZXF1ZXN0c1xyXG4gICAgICAgICAgICAvLyBpZiBjaGFubmVsIHdhcyBkZWRpY2F0ZWQgZm9yIG1vdmFibGUgcmVxdWVzdC4gVGhlIHJlYXNvbiBpc1xyXG4gICAgICAgICAgICAvLyB0aGF0IGFueSByZXF1ZXN0IGluIGRlZGljYXRlZCBjaGFubmVsIGNhbmNlbCB0aGUgcHJldmlvdXMgb25lLlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGFsbFdhaXRpbmdSZXF1ZXN0cyA9IGdldEFsbFF1ZXVlZFJlcXVlc3RDb3VudCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFsbFdhaXRpbmdSZXF1ZXN0cyA+PSBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0NoYW5uZWwgaGFzIHRvbyBtYW55IHJlcXVlc3RzIG5vdCByZXNwb25kZWQgeWV0Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciB1cmwgPSBjcmVhdGVSZXF1ZXN0VXJsKGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBudW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICB2YXIgcmVxdWVzdCA9IGpwaXBGYWN0b3J5LmNyZWF0ZVJlcXVlc3QoXHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIsXHJcbiAgICAgICAgICAgIHNlbGYsXHJcbiAgICAgICAgICAgIHVybCxcclxuICAgICAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAgICAgICAgIGZhaWx1cmVDYWxsYmFjayk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNoYW5uZWxJZCAhPT0gbnVsbCB8fCByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UucHVzaChyZXF1ZXN0KTtcclxuICAgICAgICAgICAgcmVxdWVzdC5zdGFydFJlcXVlc3QoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgLy8gVGhvc2UgcmVxdWVzdHMgY2FuY2VsIGFsbCBwcmV2aW91cyByZXF1ZXN0cyBpbiBjaGFubmVsLCBzbyBub1xyXG4gICAgICAgICAgICAvLyBuZWVkIHRvIGxvZyBvbGQgcmVxdWVzdHNcclxuICAgICAgICAgICAgcmVxdWVzdHNXYWl0aW5nRm9yQ2hhbm5lbENyZWF0aW9uID0gW3JlcXVlc3RdO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbi5wdXNoKHJlcXVlc3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVxdWVzdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2VuZE1pbmltYWxSZXF1ZXN0ID0gZnVuY3Rpb24gc2VuZE1pbmltYWxSZXF1ZXN0KGNhbGxiYWNrKSB7XHJcbiAgICAgICAgaWYgKGNoYW5uZWxJZCA9PT0gbnVsbCAmJiByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ01pbmltYWwgcmVxdWVzdHMgc2hvdWxkIGJlIHVzZWQgZm9yIGZpcnN0IHJlcXVlc3Qgb3Iga2VlcCAnICtcclxuICAgICAgICAgICAgICAgICdhbGl2ZSBtZXNzYWdlLiBLZWVwIGFsaXZlIHJlcXVpcmVzIGFuIGFscmVhZHkgaW5pdGlhbGl6ZWQgJyArXHJcbiAgICAgICAgICAgICAgICAnY2hhbm5lbCwgYW5kIGZpcnN0IHJlcXVlc3QgcmVxdWlyZXMgdG8gbm90IGhhdmUgYW55ICcgK1xyXG4gICAgICAgICAgICAgICAgJ3ByZXZpb3VzIHJlcXVlc3QnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHVybCA9IGNyZWF0ZU1pbmltYWxSZXF1ZXN0VXJsKCk7XHJcbiAgICAgICAgdmFyIHJlcXVlc3QgPSBqcGlwRmFjdG9yeS5jcmVhdGVSZXF1ZXN0KFxyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLCBzZWxmLCB1cmwsIGNhbGxiYWNrKTtcclxuICAgICAgICBcclxuICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5wdXNoKHJlcXVlc3QpO1xyXG4gICAgICAgIHJlcXVlc3Quc3RhcnRSZXF1ZXN0KCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3Q7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3QgPSBmdW5jdGlvbiBkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0KCkge1xyXG4gICAgICAgIGlmIChpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0NoYW5uZWwgYWxyZWFkeSBkZWRpY2F0ZWQgZm9yIG1vdmFibGUgcmVxdWVzdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0ID0gdHJ1ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q2hhbm5lbElkID0gZnVuY3Rpb24gZ2V0Q2hhbm5lbElkKCkge1xyXG4gICAgICAgIHJldHVybiBjaGFubmVsSWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldENoYW5uZWxJZCA9IGZ1bmN0aW9uIHNldENoYW5uZWxJZChuZXdDaGFubmVsSWQpIHtcclxuICAgICAgICBpZiAobmV3Q2hhbm5lbElkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2hhbm5lbElkID0gbmV3Q2hhbm5lbElkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXF1ZXN0c1RvU2VuZCA9IHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbjtcclxuICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JDaGFubmVsQ3JlYXRpb24gPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlcXVlc3RzVG9TZW5kLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLnB1c2gocmVxdWVzdHNUb1NlbmRbaV0pO1xyXG4gICAgICAgICAgICByZXF1ZXN0c1RvU2VuZFtpXS5zdGFydFJlcXVlc3QoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLm5leHRSZXF1ZXN0SWQgPSBmdW5jdGlvbiBuZXh0UmVxdWVzdElkKCkge1xyXG4gICAgICAgIHJldHVybiArK3JlcXVlc3RJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0QWxsUXVldWVkUmVxdWVzdENvdW50ID0gZ2V0QWxsUXVldWVkUmVxdWVzdENvdW50O1xyXG4gICAgXHJcbiAgICB0aGlzLnJlcXVlc3RFbmRlZCA9IGZ1bmN0aW9uIHJlcXVlc3RFbmRlZChhamF4UmVzcG9uc2UsIHJlcXVlc3QpIHtcclxuICAgICAgICB2YXIgcmVxdWVzdHMgPSByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZTtcclxuICAgICAgICB2YXIgaXNGb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVxdWVzdHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKHJlcXVlc3RzW2ldID09PSByZXF1ZXN0KSB7XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0c1tpXSA9IHJlcXVlc3RzW3JlcXVlc3RzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdHMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgICAgICAgICBpc0ZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNGb3VuZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdjaGFubmVsLnJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlIGluY29uc2lzdGVuY3knKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5yZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBzZWxmKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbElkID09PSBudWxsICYmIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIElmIG5vdCBzdWNjZWVkZWQgdG8gY3JlYXRlIGEgY2hhbm5lbCBJRCB5ZXQsXHJcbiAgICAgICAgICAgIC8vIHBlcmZvcm0gYW4gYWRkaXRpb25hbCByZXF1ZXN0XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbmV4dFJlcXVlc3QgPSByZXF1ZXN0c1dhaXRpbmdGb3JDaGFubmVsQ3JlYXRpb24uc2hpZnQoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLnB1c2gobmV4dFJlcXVlc3QpO1xyXG4gICAgICAgICAgICBuZXh0UmVxdWVzdC5zdGFydFJlcXVlc3QoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmlzQWxsT2xkUmVxdWVzdHNFbmRlZCA9IGZ1bmN0aW9uIGlzQWxsT2xkUmVxdWVzdHNFbmRlZChwcmlvclRvSWQpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZVtpXS5sYXN0UmVxdWVzdElkIDw9IHByaW9yVG9JZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0QWxsUXVldWVkUmVxdWVzdENvdW50KCkge1xyXG4gICAgICAgIHZhciBhbGxXYWl0aW5nUmVxdWVzdHMgPVxyXG4gICAgICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5sZW5ndGggK1xyXG4gICAgICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JDaGFubmVsQ3JlYXRpb24ubGVuZ3RoO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBhbGxXYWl0aW5nUmVxdWVzdHM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZU1pbmltYWxSZXF1ZXN0VXJsKGFsbG93U3RvcFByZXZpb3VzUmVxdWVzdHNJbkNoYW5uZWwpIHtcclxuICAgICAgICB2YXIgcmVxdWVzdFVybCA9IHNlc3Npb25IZWxwZXIuZ2V0RGF0YVJlcXVlc3RVcmwoKTtcclxuICAgICAgICB2YXIgdGFyZ2V0SWQgPSBzZXNzaW9uSGVscGVyLmdldFRhcmdldElkKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRhcmdldElkICE9PSAnMCcpIHtcclxuICAgICAgICAgICAgcmVxdWVzdFVybCArPSAnJnRpZD0nICsgdGFyZ2V0SWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhbHJlYWR5U2VudE1lc3NhZ2VzT25DaGFubmVsID0gY2hhbm5lbElkICE9PSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhbHJlYWR5U2VudE1lc3NhZ2VzT25DaGFubmVsKSB7XHJcbiAgICAgICAgICAgIHZhciBpc1N0b3BQcmV2aW91cyA9XHJcbiAgICAgICAgICAgICAgICBpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0ICYmXHJcbiAgICAgICAgICAgICAgICBhbGxvd1N0b3BQcmV2aW91c1JlcXVlc3RzSW5DaGFubmVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzU3RvcFByZXZpb3VzKSB7XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0VXJsICs9ICcmd2FpdD1ubyc7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0VXJsICs9ICcmd2FpdD15ZXMnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0VXJsO1xyXG4gICAgfVxyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlUmVxdWVzdFVybChjb2Rlc3RyZWFtUGFydFBhcmFtcywgbnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIHZhciByZXF1ZXN0VXJsID0gY3JlYXRlTWluaW1hbFJlcXVlc3RVcmwoXHJcbiAgICAgICAgICAgIC8qYWxsb3dTdG9wUHJldmlvdXNSZXF1ZXN0c0luQ2hhbm5lbD0qL3RydWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtU3RydWN0dXJlID0gc2Vzc2lvbkhlbHBlci5nZXRDb2Rlc3RyZWFtU3RydWN0dXJlKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZyYW1lV2lkdGggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldExldmVsV2lkdGgoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgdmFyIGZyYW1lSGVpZ2h0ID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRMZXZlbEhlaWdodChcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVnaW9uV2lkdGggPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlIC0gY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWDtcclxuICAgICAgICB2YXIgcmVnaW9uSGVpZ2h0ID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSAtIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVxdWVzdFVybCArPVxyXG4gICAgICAgICAgICAnJmZzaXo9JyArIGZyYW1lV2lkdGggKyAnLCcgKyBmcmFtZUhlaWdodCArICcsY2xvc2VzdCcgK1xyXG4gICAgICAgICAgICAnJnJzaXo9JyArIHJlZ2lvbldpZHRoICsgJywnICsgcmVnaW9uSGVpZ2h0ICtcclxuICAgICAgICAgICAgJyZyb2ZmPScgKyBjb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5YICsgJywnICsgY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKG51bVF1YWxpdHlMYXllcnMgIT09ICdtYXgnKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RVcmwgKz0gJyZsYXllcnM9JyArIG51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0VXJsO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbnZhciBqcGlwTWVzc2FnZUhlYWRlclBhcnNlciA9IHtcclxuICAgICAgICBcclxuICAgIExTQl9NQVNLOiAweDEsXHJcbiAgICBCSVRfNF9NQVNLOiAweDEwLFxyXG4gICAgQklUU181Nl9NQVNLOiAweDYwLFxyXG4gICAgTVNCX01BU0s6IDB4ODAsXHJcblxyXG4gICAgTFNCXzdfTUFTSzogMHg3RixcclxuXHJcbiAgICAvLyBBLjIuMVxyXG4gICAgcGFyc2VOdW1iZXJJblZiYXM6IGZ1bmN0aW9uIHBhcnNlTnVtYmVySW5WYmFzQ2xvc3VyZShcclxuICAgICAgICBtZXNzYWdlLCBzdGFydE9mZnNldCwgYml0c1RvVGFrZUluRmlyc3RCeXRlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNlbGYgPSBqcGlwTWVzc2FnZUhlYWRlclBhcnNlcjtcclxuICAgICAgICB2YXIgY3VycmVudE9mZnNldCA9IHN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQ7XHJcbiAgICAgICAgaWYgKGJpdHNUb1Rha2VJbkZpcnN0Qnl0ZSkge1xyXG4gICAgICAgICAgICB2YXIgbWFza0ZpcnN0Qnl0ZSA9ICgxIDw8IGJpdHNUb1Rha2VJbkZpcnN0Qnl0ZSkgLSAxO1xyXG4gICAgICAgICAgICByZXN1bHQgPSBtZXNzYWdlW2N1cnJlbnRPZmZzZXRdICYgbWFza0ZpcnN0Qnl0ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdCA9IG1lc3NhZ2VbY3VycmVudE9mZnNldF0gJiBzZWxmLkxTQl83X01BU0s7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlICggISEobWVzc2FnZVtjdXJyZW50T2Zmc2V0XSAmIHNlbGYuTVNCX01BU0spICkge1xyXG4gICAgICAgICAgICArK2N1cnJlbnRPZmZzZXQ7XHJcblxyXG4gICAgICAgICAgICByZXN1bHQgPDw9IDc7XHJcbiAgICAgICAgICAgIHJlc3VsdCB8PSBtZXNzYWdlW2N1cnJlbnRPZmZzZXRdICYgc2VsZi5MU0JfN19NQVNLO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBlbmRPZmZzZXQ6IGN1cnJlbnRPZmZzZXQgKyAxLFxyXG4gICAgICAgICAgICBudW1iZXI6IHJlc3VsdFxyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICAvLyBBLjJcclxuICAgIHBhcnNlTWVzc2FnZUhlYWRlcjogZnVuY3Rpb24gcGFyc2VNZXNzYWdlSGVhZGVyQ2xvc3VyZShcclxuICAgICAgICBtZXNzYWdlLCBzdGFydE9mZnNldCwgcHJldmlvdXNNZXNzYWdlSGVhZGVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNlbGYgPSBqcGlwTWVzc2FnZUhlYWRlclBhcnNlcjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBLjIuMVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpcnN0IFZiYXM6IEJpbi1JRFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjbGFzc0FuZENzblByZWNlbnNlID0gKG1lc3NhZ2Vbc3RhcnRPZmZzZXRdICYgc2VsZi5CSVRTXzU2X01BU0spID4+PiA1O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjbGFzc0FuZENzblByZWNlbnNlID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5QYXJzZUV4Y2VwdGlvbignRmFpbGVkIHBhcnNpbmcgbWVzc2FnZSBoZWFkZXIgJyArXHJcbiAgICAgICAgICAgICAgICAnKEEuMi4xKTogcHJvaGliaXRlZCBleGlzdGFuY2UgY2xhc3MgYW5kIGNzbiBiaXRzIDAwJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBoYXNDbGFzc1ZiYXMgPSAhIShjbGFzc0FuZENzblByZWNlbnNlICYgMHgyKTtcclxuICAgICAgICB2YXIgaGFzQ29kZVN0cmVhbUluZGV4VmJhcyA9IGNsYXNzQW5kQ3NuUHJlY2Vuc2UgPT09IDM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzTGFzdEJ5dGVJbkRhdGFiaW4gPSAhIShtZXNzYWdlW3N0YXJ0T2Zmc2V0XSAmIHNlbGYuQklUXzRfTUFTSyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQS4yLjNcclxuICAgICAgICB2YXIgcGFyc2VkSW5DbGFzc0lkID0gc2VsZi5wYXJzZU51bWJlckluVmJhcyhcclxuICAgICAgICAgICAgbWVzc2FnZSwgc3RhcnRPZmZzZXQsIC8qYml0c1RvVGFrZUluRmlyc3RCeXRlPSovNCk7XHJcbiAgICAgICAgdmFyIGluQ2xhc3NJZCA9IHBhcnNlZEluQ2xhc3NJZC5udW1iZXI7XHJcbiAgICAgICAgdmFyIGN1cnJlbnRPZmZzZXQgPSBwYXJzZWRJbkNsYXNzSWQuZW5kT2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNlY29uZCBvcHRpb25hbCBWYmFzOiBDbGFzcyBJRFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjbGFzc0lkID0gMDtcclxuICAgICAgICBpZiAoaGFzQ2xhc3NWYmFzKSB7XHJcbiAgICAgICAgICAgIHZhciBwYXJzZWRDbGFzc0lkID0gc2VsZi5wYXJzZU51bWJlckluVmJhcyhtZXNzYWdlLCBjdXJyZW50T2Zmc2V0KTtcclxuICAgICAgICAgICAgY2xhc3NJZCA9IHBhcnNlZENsYXNzSWQubnVtYmVyO1xyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkQ2xhc3NJZC5lbmRPZmZzZXQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKHByZXZpb3VzTWVzc2FnZUhlYWRlcikge1xyXG4gICAgICAgICAgICBjbGFzc0lkID0gcHJldmlvdXNNZXNzYWdlSGVhZGVyLmNsYXNzSWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoaXJkIG9wdGlvbmFsIFZiYXM6IENvZGUgU3RyZWFtIEluZGV4IChDc24pXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGVzdHJlYW1JbmRleCA9IDA7XHJcbiAgICAgICAgaWYgKGhhc0NvZGVTdHJlYW1JbmRleFZiYXMpIHtcclxuICAgICAgICAgICAgdmFyIHBhcnNlZENzbiA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMobWVzc2FnZSwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1JbmRleCA9IHBhcnNlZENzbi5udW1iZXI7XHJcbiAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQgPSBwYXJzZWRDc24uZW5kT2Zmc2V0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChwcmV2aW91c01lc3NhZ2VIZWFkZXIpIHtcclxuICAgICAgICAgICAgY29kZXN0cmVhbUluZGV4ID0gcHJldmlvdXNNZXNzYWdlSGVhZGVyLmNvZGVzdHJlYW1JbmRleDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gNHRoIFZiYXM6IE1lc3NhZ2Ugb2Zmc2V0XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhcnNlZE9mZnNldCA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMobWVzc2FnZSwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgdmFyIG1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0ID0gcGFyc2VkT2Zmc2V0Lm51bWJlcjtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkT2Zmc2V0LmVuZE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICAvLyA1dGggVmJhczogTWVzc2FnZSBsZW5ndGhcclxuXHJcbiAgICAgICAgdmFyIHBhcnNlZExlbmd0aCA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMobWVzc2FnZSwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgdmFyIG1lc3NhZ2VCb2R5TGVuZ3RoID0gcGFyc2VkTGVuZ3RoLm51bWJlcjtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkTGVuZ3RoLmVuZE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICAvLyA2dGggb3B0aW9uYWwgVmJhczogQXV4XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQS4yLjJcclxuICAgICAgICB2YXIgaGFzQXV4VmJhcyA9ICEhKGNsYXNzSWQgJiBzZWxmLkxTQl9NQVNLKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYXV4O1xyXG4gICAgICAgIGlmIChoYXNBdXhWYmFzKSB7XHJcbiAgICAgICAgICAgIHZhciBwYXJzZWRBdXggPSBzZWxmLnBhcnNlTnVtYmVySW5WYmFzKG1lc3NhZ2UsIGN1cnJlbnRPZmZzZXQpO1xyXG4gICAgICAgICAgICBhdXggPSBwYXJzZWRBdXgubnVtYmVyO1xyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkQXV4LmVuZE9mZnNldDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUmV0dXJuXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgaXNMYXN0Qnl0ZUluRGF0YWJpbjogaXNMYXN0Qnl0ZUluRGF0YWJpbixcclxuICAgICAgICAgICAgaW5DbGFzc0lkOiBpbkNsYXNzSWQsXHJcbiAgICAgICAgICAgIGJvZHlTdGFydDogY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgY2xhc3NJZDogY2xhc3NJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbUluZGV4OiBjb2Rlc3RyZWFtSW5kZXgsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0OiBtZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydCxcclxuICAgICAgICAgICAgbWVzc2FnZUJvZHlMZW5ndGg6IG1lc3NhZ2VCb2R5TGVuZ3RoXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaGFzQXV4VmJhcykge1xyXG4gICAgICAgICAgICByZXN1bHQuYXV4ID0gYXV4O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgZ2V0SW50MzI6IGZ1bmN0aW9uIGdldEludDMyQ2xvc3VyZShkYXRhLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgbXNiID0gZGF0YVtvZmZzZXRdICogTWF0aC5wb3coMiwgMjQpOyAvLyBBdm9pZCBuZWdhdGl2ZSByZXN1bHQgZHVlIHRvIHNpZ25lZCBjYWxjdWxhdGlvblxyXG4gICAgICAgIHZhciBieXRlMiA9IGRhdGFbb2Zmc2V0ICsgMV0gPDwgMTY7XHJcbiAgICAgICAgdmFyIGJ5dGUxID0gZGF0YVtvZmZzZXQgKyAyXSA8PCA4O1xyXG4gICAgICAgIHZhciBsc2IgPSBkYXRhW29mZnNldCArIDNdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSBtc2IgKyBieXRlMiArIGJ5dGUxICsgbHNiO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBnZXRJbnQxNjogZnVuY3Rpb24gZ2V0SW50MTZDbG9zdXJlKGRhdGEsIG9mZnNldCkge1xyXG4gICAgICAgIHZhciBtc2IgPSBkYXRhW29mZnNldF0gPDwgODtcclxuICAgICAgICB2YXIgbHNiID0gZGF0YVtvZmZzZXQgKyAxXTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbXNiICsgbHNiO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qcGlwTWVzc2FnZUhlYWRlclBhcnNlciA9IGpwaXBNZXNzYWdlSGVhZGVyUGFyc2VyOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBSZWNvbm5lY3RhYmxlUmVxdWVzdGVyID0gZnVuY3Rpb24gSnBpcFJlY29ubmVjdGFibGVSZXF1ZXN0ZXIoXHJcbiAgICBtYXhDaGFubmVsc0luU2Vzc2lvbixcclxuICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLCBcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAganBpcEZhY3RvcnksXHJcbiAgICAvLyBOT1RFOiBNb3ZlIHBhcmFtZXRlciB0byBiZWdpbm5pbmcgYW5kIGV4cG9zZSBpbiBDb2Rlc3RyZWFtQ2xpZW50XHJcbiAgICBtYXhKcGlwQ2FjaGVTaXplQ29uZmlnKSB7XHJcbiAgICBcclxuICAgIHZhciBNQiA9IDEwNDg1NzY7XHJcbiAgICB2YXIgbWF4SnBpcENhY2hlU2l6ZSA9IG1heEpwaXBDYWNoZVNpemVDb25maWcgfHwgKDEwICogTUIpO1xyXG4gICAgXHJcbiAgICB2YXIgc2Vzc2lvbldhaXRpbmdGb3JSZWFkeTtcclxuICAgIHZhciBhY3RpdmVTZXNzaW9uID0gbnVsbDtcclxuICAgIHZhciBzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QgPSBudWxsO1xyXG4gICAgXHJcbiAgICB2YXIgdXJsID0gbnVsbDtcclxuICAgIHZhciB3YWl0aW5nRm9yQ2xvc2VTZXNzaW9ucyA9IDA7XHJcbiAgICBcclxuICAgIHZhciBub25EZWRpY2F0ZWRSZXF1ZXN0c1dhaXRpbmdGb3JTZW5kID0gW107XHJcbiAgICB2YXIgZGVkaWNhdGVkQ2hhbm5lbHMgPSBbXTtcclxuICAgIFxyXG4gICAgdmFyIHN0YXR1c0NhbGxiYWNrID0gbnVsbDtcclxuICAgIHZhciBsYXN0Q2xvc2VkQ2FsbGJhY2sgPSBudWxsO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzUmVhZHkgPSBmdW5jdGlvbiBnZXRJc1JlYWR5KCkge1xyXG4gICAgICAgIHJldHVybiBhY3RpdmVTZXNzaW9uICE9PSBudWxsICYmIGFjdGl2ZVNlc3Npb24uZ2V0SXNSZWFkeSgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5vcGVuID0gZnVuY3Rpb24gb3BlbihiYXNlVXJsKSB7XHJcbiAgICAgICAgaWYgKGJhc2VVcmwgPT09IHVuZGVmaW5lZCB8fCBiYXNlVXJsID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbignYmFzZVVybCcsIGJhc2VVcmwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodXJsICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0ltYWdlIHdhcyBhbHJlYWR5IG9wZW5lZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB1cmwgPSBiYXNlVXJsO1xyXG4gICAgICAgIGNyZWF0ZUludGVybmFsU2Vzc2lvbigpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5jbG9zZSA9IGZ1bmN0aW9uIGNsb3NlKGNsb3NlZENhbGxiYWNrKSB7XHJcbiAgICAgICAgaWYgKGxhc3RDbG9zZWRDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbignY2xvc2VkIHR3aWNlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGxhc3RDbG9zZWRDYWxsYmFjayA9IGNsb3NlZENhbGxiYWNrO1xyXG4gICAgICAgIHdhaXRpbmdGb3JDbG9zZVNlc3Npb25zID0gMTtcclxuICAgICAgICBcclxuICAgICAgICBjbG9zZUludGVybmFsU2Vzc2lvbihhY3RpdmVTZXNzaW9uKTtcclxuICAgICAgICBjbG9zZUludGVybmFsU2Vzc2lvbihzZXNzaW9uV2FpdGluZ0ZvclJlYWR5KTtcclxuICAgICAgICBjbG9zZUludGVybmFsU2Vzc2lvbihzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNoZWNrSWZBbGxTZXNzaW9uc0Nsb3NlZEFmdGVyU2Vzc2lvbkNsb3NlZCgpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNldFN0YXR1c0NhbGxiYWNrID0gZnVuY3Rpb24gc2V0U3RhdHVzQ2FsbGJhY2sobmV3U3RhdHVzQ2FsbGJhY2spIHtcclxuICAgICAgICBzdGF0dXNDYWxsYmFjayA9IG5ld1N0YXR1c0NhbGxiYWNrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhY3RpdmVTZXNzaW9uICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGFjdGl2ZVNlc3Npb24uc2V0U3RhdHVzQ2FsbGJhY2sobmV3U3RhdHVzQ2FsbGJhY2spO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZGVkaWNhdGVDaGFubmVsRm9yTW92YWJsZVJlcXVlc3QgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGRlZGljYXRlQ2hhbm5lbEZvck1vdmFibGVSZXF1ZXN0KCkge1xyXG5cclxuICAgICAgICBjaGVja1JlYWR5KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPSB7IGludGVybmFsRGVkaWNhdGVkQ2hhbm5lbDogbnVsbCB9O1xyXG4gICAgICAgIGRlZGljYXRlZENoYW5uZWxzLnB1c2goZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSk7XHJcbiAgICAgICAgY3JlYXRlSW50ZXJuYWxEZWRpY2F0ZWRDaGFubmVsKGRlZGljYXRlZENoYW5uZWxIYW5kbGUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5yZXF1ZXN0RGF0YSA9IGZ1bmN0aW9uIHJlcXVlc3REYXRhKFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIGNhbGxiYWNrLFxyXG4gICAgICAgIGZhaWx1cmVDYWxsYmFjayxcclxuICAgICAgICBudW1RdWFsaXR5TGF5ZXJzLFxyXG4gICAgICAgIGRlZGljYXRlZENoYW5uZWxIYW5kbGVUb01vdmUpIHtcclxuXHJcbiAgICAgICAgY2hlY2tSZWFkeSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXF1ZXN0ID0ge1xyXG4gICAgICAgICAgICBpc0VuZGVkOiBmYWxzZSxcclxuICAgICAgICAgICAgaW50ZXJuYWxSZXF1ZXN0OiBudWxsLFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXM6IGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICBjYWxsYmFjazogY2FsbGJhY2ssXHJcbiAgICAgICAgICAgIGZhaWx1cmVDYWxsYmFjazogZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzOiBudW1RdWFsaXR5TGF5ZXJzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNoYW5uZWw7XHJcbiAgICAgICAgdmFyIG1vdmVEZWRpY2F0ZWRDaGFubmVsID0gZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZVRvTW92ZSAhPT0gdW5kZWZpbmVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtb3ZlRGVkaWNhdGVkQ2hhbm5lbCkge1xyXG4gICAgICAgICAgICBjaGFubmVsID0gZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZVRvTW92ZS5pbnRlcm5hbERlZGljYXRlZENoYW5uZWw7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY2hhbm5lbCA9IGFjdGl2ZVNlc3Npb24udHJ5R2V0Q2hhbm5lbCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGNoYW5uZWwgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIG5vbkRlZGljYXRlZFJlcXVlc3RzV2FpdGluZ0ZvclNlbmQucHVzaChyZXF1ZXN0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXF1ZXN0O1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoYW5uZWwuZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCgpKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnRXhwZWN0ZWQgbm9uLW1vdmFibGUgY2hhbm5lbCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjaGFubmVsLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSAhPT0gbW92ZURlZGljYXRlZENoYW5uZWwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCBpbmNvbnNpc3RlbmN5Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXF1ZXN0LmludGVybmFsUmVxdWVzdCA9IGNoYW5uZWwucmVxdWVzdERhdGEoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlcXVlc3Q7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnN0b3BSZXF1ZXN0QXN5bmMgPSBmdW5jdGlvbiBzdG9wUmVxdWVzdEFzeW5jKHJlcXVlc3QpIHtcclxuICAgICAgICByZXF1ZXN0LmlzRW5kZWQgPSB0cnVlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXF1ZXN0LmludGVybmFsUmVxdWVzdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXF1ZXN0LmludGVybmFsUmVxdWVzdC5zdG9wUmVxdWVzdEFzeW5jKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5yZWNvbm5lY3QgPSByZWNvbm5lY3Q7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHJlY29ubmVjdCgpIHtcclxuICAgICAgICBpZiAoc2Vzc2lvbldhaXRpbmdGb3JSZWFkeSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdQcmV2aW91cyBzZXNzaW9uIHN0aWxsIG5vdCBlc3RhYmxpc2hlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGlmIChzdGF0dXNDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgc3RhdHVzQ2FsbGJhY2soe1xyXG4gICAgICAgICAgICAgICAgICAgIGlzUmVhZHk6IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZXhjZXB0aW9uOiAvL2pwaXBFeGNlcHRpb25zLkludmFsaWRPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdQcmV2aW91cyBzZXNzaW9uIHRoYXQgc2hvdWxkIGJlIGNsb3NlZCBzdGlsbCBhbGl2ZS4nICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ01heWJlIG9sZCByZXF1ZXN0Q29udGV4dHMgaGF2ZSBub3QgYmVlZCBjbG9zZWQuICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnUmVjb25uZWN0IHdpbGwgbm90IGJlIGRvbmUnIC8vKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBkYXRhYmluc1NhdmVyLmNsZWFudXBVbnJlZ2lzdGVyZWREYXRhYmlucygpO1xyXG4gICAgICAgIGNyZWF0ZUludGVybmFsU2Vzc2lvbigpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVJbnRlcm5hbFNlc3Npb24oKSB7XHJcbiAgICAgICAgdmFyIHRhcmdldElkO1xyXG4gICAgICAgIGlmIChhY3RpdmVTZXNzaW9uICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRhcmdldElkID0gYWN0aXZlU2Vzc2lvbi5nZXRUYXJnZXRJZCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uV2FpdGluZ0ZvclJlYWR5ID0ganBpcEZhY3RvcnkuY3JlYXRlU2Vzc2lvbihcclxuICAgICAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgICAgICB0YXJnZXRJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHNlc3Npb25XYWl0aW5nRm9yUmVhZHkuc2V0U3RhdHVzQ2FsbGJhY2sod2FpdGluZ0ZvclJlYWR5Q2FsbGJhY2spO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlc3Npb25XYWl0aW5nRm9yUmVhZHkub3Blbih1cmwpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVJbnRlcm5hbERlZGljYXRlZENoYW5uZWwoZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSkge1xyXG4gICAgICAgIHZhciBjaGFubmVsID0gYWN0aXZlU2Vzc2lvbi50cnlHZXRDaGFubmVsKFxyXG4gICAgICAgICAgICAvKmRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3Q9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW52YWxpZE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdUb28gbWFueSBjb25jdXJyZW50IHJlcXVlc3RzLiBMaW1pdCB0aGUgdXNlIG9mIGRlZGljYXRlZCAnICtcclxuICAgICAgICAgICAgICAgICcobW92YWJsZSkgcmVxdWVzdHMsIGVubGFyZ2UgbWF4Q2hhbm5lbHNJblNlc3Npb24gb3Igd2FpdCAnICtcclxuICAgICAgICAgICAgICAgICdmb3IgcmVxdWVzdHMgdG8gZmluaXNoIGFuZCBhdm9pZCBjcmVhdGUgbmV3IG9uZXMnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjaGFubmVsLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdnZXRJc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0IGluY29uc2lzdGVuY3knKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRlZGljYXRlZENoYW5uZWxIYW5kbGUuaW50ZXJuYWxEZWRpY2F0ZWRDaGFubmVsID0gY2hhbm5lbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gd2FpdGluZ0ZvclJlYWR5Q2FsbGJhY2soc3RhdHVzKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb25XYWl0aW5nRm9yUmVhZHkgPT09IG51bGwgfHxcclxuICAgICAgICAgICAgc3RhdHVzLmlzUmVhZHkgIT09IHNlc3Npb25XYWl0aW5nRm9yUmVhZHkuZ2V0SXNSZWFkeSgpKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVW5leHBlY3RlZCAnICtcclxuICAgICAgICAgICAgICAgICdzdGF0dXNDYWxsYmFjayB3aGVuIG5vdCByZWdpc3RlcmVkIHRvIHNlc3Npb24gb3IgJyArXHJcbiAgICAgICAgICAgICAgICAnaW5jb25zaXN0ZW50IGlzUmVhZHknKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHN0YXR1cy5pc1JlYWR5KSB7XHJcbiAgICAgICAgICAgIGlmIChzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3Qgc2hvdWxkIGJlIG51bGwnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0ID0gYWN0aXZlU2Vzc2lvbjtcclxuICAgICAgICAgICAgYWN0aXZlU2Vzc2lvbiA9IHNlc3Npb25XYWl0aW5nRm9yUmVhZHk7XHJcbiAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yUmVhZHkgPSBudWxsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0LnNldFN0YXR1c0NhbGxiYWNrKG51bGwpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0cnlEaXNjb25uZWN0V2FpdGluZ1Nlc3Npb24oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdC5zZXRSZXF1ZXN0RW5kZWRDYWxsYmFjayhcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5RGlzY29ubmVjdFdhaXRpbmdTZXNzaW9uKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYWN0aXZlU2Vzc2lvbi5zZXRTdGF0dXNDYWxsYmFjayhzdGF0dXNDYWxsYmFjayk7XHJcbiAgICAgICAgICAgIGFjdGl2ZVNlc3Npb24uc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2soYWN0aXZlU2Vzc2lvblJlcXVlc3RFbmRlZENhbGxiYWNrKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVkaWNhdGVkQ2hhbm5lbHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGNyZWF0ZUludGVybmFsRGVkaWNhdGVkQ2hhbm5lbChkZWRpY2F0ZWRDaGFubmVsc1tpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHN0YXR1c0NhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHN0YXR1c0NhbGxiYWNrKHN0YXR1cyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjbG9zZUludGVybmFsU2Vzc2lvbihzZXNzaW9uKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb24gIT09IG51bGwpIHtcclxuICAgICAgICAgICAgKyt3YWl0aW5nRm9yQ2xvc2VTZXNzaW9ucztcclxuICAgICAgICAgICAgc2Vzc2lvbi5jbG9zZShjaGVja0lmQWxsU2Vzc2lvbnNDbG9zZWRBZnRlclNlc3Npb25DbG9zZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tJZkFsbFNlc3Npb25zQ2xvc2VkQWZ0ZXJTZXNzaW9uQ2xvc2VkKCkge1xyXG4gICAgICAgIC0td2FpdGluZ0ZvckNsb3NlU2Vzc2lvbnM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHdhaXRpbmdGb3JDbG9zZVNlc3Npb25zID09PSAwICYmIGxhc3RDbG9zZWRDYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGxhc3RDbG9zZWRDYWxsYmFjaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tSZWFkeSgpIHtcclxuICAgICAgICBpZiAoYWN0aXZlU2Vzc2lvbiA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVGhpcyBvcGVyYXRpb24gJyArXHJcbiAgICAgICAgICAgICAgICAnaXMgZm9yYmlkZGVuIHdoZW4gc2Vzc2lvbiBpcyBub3QgcmVhZHknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGFjdGl2ZVNlc3Npb25SZXF1ZXN0RW5kZWRDYWxsYmFjayhjaGFubmVsRnJlZWQpIHtcclxuICAgICAgICB2YXIgcmVxdWVzdCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5zU2F2ZXIuZ2V0TG9hZGVkQnl0ZXMoKSA+IG1heEpwaXBDYWNoZVNpemUpIHtcclxuICAgICAgICAgICAgcmVjb25uZWN0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjaGFubmVsRnJlZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbEZyZWVkLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdFeHBlY3RlZCBub24tbW92YWJsZSBjaGFubmVsIGFzIGNoYW5uZWxGcmVlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIGlmIChub25EZWRpY2F0ZWRSZXF1ZXN0c1dhaXRpbmdGb3JTZW5kLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVxdWVzdCA9IG5vbkRlZGljYXRlZFJlcXVlc3RzV2FpdGluZ0ZvclNlbmQuc2hpZnQoKTtcclxuICAgICAgICAgICAgaWYgKHJlcXVlc3QuaW50ZXJuYWxSZXF1ZXN0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignUmVxdWVzdCB3YXMgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2FscmVhZHkgc2VudCBidXQgc3RpbGwgaW4gcXVldWUnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gd2hpbGUgKHJlcXVlc3QuaXNFbmRlZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHJlcXVlc3QgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmVxdWVzdC5pbnRlcm5hbFJlcXVlc3QgPSBjaGFubmVsRnJlZWQucmVxdWVzdERhdGEoXHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0LmNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICAgICAgcmVxdWVzdC5jYWxsYmFjayxcclxuICAgICAgICAgICAgICAgIHJlcXVlc3QuZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgICAgICAgICAgcmVxdWVzdC5udW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeURpc2Nvbm5lY3RXYWl0aW5nU2Vzc2lvbigpIHtcclxuICAgICAgICB2YXIgY2FuQ2xvc2VTZXNzaW9uID0gIXNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdC5oYXNBY3RpdmVSZXF1ZXN0cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYW5DbG9zZVNlc3Npb24pIHtcclxuICAgICAgICAgICAgc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0LmNsb3NlKCk7XHJcbiAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjYW5DbG9zZVNlc3Npb247XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuSnBpcFJlcXVlc3QgPSBmdW5jdGlvbiBKcGlwUmVxdWVzdChcclxuICAgIHNlc3Npb25IZWxwZXIsXHJcbiAgICBtZXNzYWdlSGVhZGVyUGFyc2VyLFxyXG4gICAgY2hhbm5lbCxcclxuICAgIHJlcXVlc3RVcmwsXHJcbiAgICBjYWxsYmFjayxcclxuICAgIGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgXHJcbiAgICB2YXIgS0IgPSAxMDI0O1xyXG4gICAgdmFyIFBST0dSRVNTSVZFTkVTU19NSU5fTEVOR1RIX0JZVEVTID0gMTAgKiBLQjtcclxuXHJcbiAgICB2YXIgUkVTUE9OU0VfRU5ERURfU1VDQ0VTUyA9IDE7XHJcbiAgICB2YXIgUkVTUE9OU0VfRU5ERURfQUJPUlRFRCA9IDI7XHJcbiAgICB2YXIgUkVTUE9OU0VfRU5ERURfU0VOVF9BTk9USEVSX01FU1NBR0UgPSAzO1xyXG4gICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgaXNBY3RpdmUgPSBmYWxzZTtcclxuICAgIHZhciBlbmRlZEJ5VXNlciA9IGZhbHNlO1xyXG4gICAgdmFyIGxhc3RSZXF1ZXN0SWQ7XHJcbiAgICB2YXIgcmVzcG9uc2VMZW5ndGggPSBQUk9HUkVTU0lWRU5FU1NfTUlOX0xFTkdUSF9CWVRFUztcclxuICAgIFxyXG4gICAgdGhpcy5zdGFydFJlcXVlc3QgPSBmdW5jdGlvbiBzdGFydFJlcXVlc3QoKSB7XHJcbiAgICAgICAgaWYgKGlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ3N0YXJ0UmVxdWVzdCBjYWxsZWQgdHdpY2UnKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGVuZGVkQnlVc2VyKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ3JlcXVlc3Qgd2FzIGFscmVhZHkgc3RvcHBlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpc0FjdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5yZXF1ZXN0U3RhcnRlZCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlbmRNZXNzYWdlT2ZEYXRhUmVxdWVzdCgpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnN0b3BSZXF1ZXN0QXN5bmMgPSBmdW5jdGlvbiBzdG9wUmVxdWVzdEFzeW5jKHJlcXVlc3QpIHtcclxuICAgICAgICBlbmRlZEJ5VXNlciA9IHRydWU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExhc3RSZXF1ZXN0SWQgPSBmdW5jdGlvbiBnZXRMYXN0UmVxdWVzdElkKCkge1xyXG4gICAgICAgIGlmICghaXNBY3RpdmUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBjYWxsIHRvIGdldExhc3RSZXF1ZXN0SWQgb24gaW5hY3RpdmUgcmVxdWVzdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbGFzdFJlcXVlc3RJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2FsbENhbGxiYWNrQWZ0ZXJDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCA9XHJcbiAgICAgICAgZnVuY3Rpb24gY2FsbENhbGxiYWNrQWZ0ZXJDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCgpIHtcclxuICAgICAgICBcclxuICAgICAgICBjYWxsYmFjayhzZWxmLCAvKmlzUmVzcG9uc2VEb25lPSovdHJ1ZSk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpbnRlcm5hbFN1Y2Nlc3NDYWxsYmFjayhhamF4UmVzcG9uc2UsIGlzUmVzcG9uc2VEb25lKSB7XHJcbiAgICAgICAgdmFyIGZhaWxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB2YXIgZW5kZWRSZWFzb24gPSBwcm9jZXNzQWpheFJlc3BvbnNlKGFqYXhSZXNwb25zZSwgaXNSZXNwb25zZURvbmUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGVuZGVkUmVhc29uID09PSBSRVNQT05TRV9FTkRFRF9TRU5UX0FOT1RIRVJfTUVTU0FHRSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmYWlsZWQgPSBlbmRlZFJlYXNvbiA9PT0gUkVTUE9OU0VfRU5ERURfQUJPUlRFRDtcclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGZhaWxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIub25FeGNlcHRpb24oZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmICghZmFpbGVkKSB7XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLndhaXRGb3JDb25jdXJyZW50UmVxdWVzdHNUb0VuZChzZWxmKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2hhbm5lbC5yZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBzZWxmKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChmYWlsZWQgJiYgIWVuZGVkQnlVc2VyICYmIGZhaWx1cmVDYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBmYWlsdXJlQ2FsbGJhY2soKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5jaGVja0NvbmN1cnJlbnRSZXF1ZXN0c0ZpbmlzaGVkKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW50ZXJuYWxGYWlsdXJlQ2FsbGJhY2soYWpheFJlc3BvbnNlKSB7XHJcbiAgICAgICAgY2hhbm5lbC5yZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBzZWxmKTtcclxuICAgICAgICBzZXNzaW9uSGVscGVyLmNoZWNrQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZmFpbHVyZUNhbGxiYWNrICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwcm9jZXNzQWpheFJlc3BvbnNlKGFqYXhSZXNwb25zZSwgaXNSZXNwb25zZURvbmUpIHtcclxuICAgICAgICBpZiAoIWlzUmVzcG9uc2VEb25lKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdBSkFYICcgK1xyXG4gICAgICAgICAgICAgICAgJ2NhbGxiYWNrIGNhbGxlZCBhbHRob3VnaCByZXNwb25zZSBpcyBub3QgZG9uZSB5ZXQgJyArXHJcbiAgICAgICAgICAgICAgICAnYW5kIGNodW5rZWQgZW5jb2RpbmcgaXMgbm90IGVuYWJsZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICB2YXIgY3JlYXRlZENoYW5uZWwgPSBzZXNzaW9uSGVscGVyLmdldENyZWF0ZWRDaGFubmVsSWQoXHJcbiAgICAgICAgICAgIGFqYXhSZXNwb25zZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNyZWF0ZWRDaGFubmVsICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGlmIChjaGFubmVsLmdldENoYW5uZWxJZCgpICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0NoYW5uZWwgY3JlYXRlZCBhbHRob3VnaCB3YXMgbm90IHJlcXVlc3RlZCcsICdELjIuMycpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNoYW5uZWwuc2V0Q2hhbm5lbElkKGNyZWF0ZWRDaGFubmVsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAoY2hhbm5lbC5nZXRDaGFubmVsSWQoKSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDYW5ub3QgZXh0cmFjdCBjaWQgZnJvbSBjbmV3IHJlc3BvbnNlJywgJ0QuMi4zJykpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZW5kT2Zmc2V0ID0gc2F2ZVRvRGF0YWJpbnNGcm9tT2Zmc2V0KGFqYXhSZXNwb25zZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGVuZE9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gUkVTUE9OU0VfRU5ERURfQUJPUlRFRDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGVuZGVkUmVhc29uID0gcGFyc2VFbmRPZlJlc3BvbnNlKGFqYXhSZXNwb25zZSwgZW5kT2Zmc2V0KTtcclxuICAgICAgICByZXR1cm4gZW5kZWRSZWFzb247XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNlbmRNZXNzYWdlT2ZEYXRhUmVxdWVzdCgpIHtcclxuICAgICAgICBsYXN0UmVxdWVzdElkID0gY2hhbm5lbC5uZXh0UmVxdWVzdElkKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHVybCA9IHJlcXVlc3RVcmwgK1xyXG4gICAgICAgICAgICAnJmxlbj0nICsgcmVzcG9uc2VMZW5ndGggK1xyXG4gICAgICAgICAgICAnJnFpZD0nICsgbGFzdFJlcXVlc3RJZDtcclxuICAgICAgICBcclxuICAgICAgICByZXNwb25zZUxlbmd0aCAqPSAyO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaG91bGRDcmVhdGVDaGFubmVsID0gY2hhbm5lbC5nZXRDaGFubmVsSWQoKSA9PT0gbnVsbDtcclxuICAgICAgICBpZiAoc2hvdWxkQ3JlYXRlQ2hhbm5lbCkge1xyXG4gICAgICAgICAgICB1cmwgKz0gJyZjbmV3PWh0dHAnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGV4aXN0Q2hhbm5lbEluU2Vzc2lvbiA9IHNlc3Npb25IZWxwZXIuZ2V0Rmlyc3RDaGFubmVsKCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGV4aXN0Q2hhbm5lbEluU2Vzc2lvbiAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgdXJsICs9ICcmY2lkPScgKyBleGlzdENoYW5uZWxJblNlc3Npb24uZ2V0Q2hhbm5lbElkKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIE5PVEU6IElmIGV4aXN0Q2hhbm5lbEluU2Vzc2lvbiwgbWF5YmUgc2hvdWxkIHJlbW92ZSBcIiZzdHJlYW09MFwiXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdXJsICs9ICcmY2lkPScgKyBjaGFubmVsLmdldENoYW5uZWxJZCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyLnNlbmRBamF4KFxyXG4gICAgICAgICAgICB1cmwsXHJcbiAgICAgICAgICAgIGludGVybmFsU3VjY2Vzc0NhbGxiYWNrLFxyXG4gICAgICAgICAgICBpbnRlcm5hbEZhaWx1cmVDYWxsYmFjayk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHBhcnNlRW5kT2ZSZXNwb25zZShhamF4UmVzcG9uc2UsIG9mZnNldCkge1xyXG4gICAgICAgIHZhciBlbmRSZXNwb25zZVJlc3VsdCA9IFJFU1BPTlNFX0VOREVEX0FCT1JURUQ7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYWpheFJlc3BvbnNlLnJlc3BvbnNlKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAob2Zmc2V0ID4gYnl0ZXMubGVuZ3RoIC0gMiB8fFxyXG4gICAgICAgICAgICBieXRlc1tvZmZzZXRdICE9PSAwKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oJ0NvdWxkIG5vdCBmaW5kICcgK1xyXG4gICAgICAgICAgICAgICAgJ0VuZCBPZiBSZXNwb25zZSAoRU9SKSBjb2RlIGF0IHRoZSBlbmQgb2YgcmVzcG9uc2UnLCAnRC4zJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoYnl0ZXNbb2Zmc2V0ICsgMV0pIHtcclxuICAgICAgICAgICAgY2FzZSBqR2xvYmFscy5qcGlwRW5kT2ZSZXNwb25zZVJlYXNvbnMuSU1BR0VfRE9ORTpcclxuICAgICAgICAgICAgY2FzZSBqR2xvYmFscy5qcGlwRW5kT2ZSZXNwb25zZVJlYXNvbnMuV0lORE9XX0RPTkU6XHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLlFVQUxJVFlfTElNSVQ6XHJcbiAgICAgICAgICAgICAgICBlbmRSZXNwb25zZVJlc3VsdCA9IFJFU1BPTlNFX0VOREVEX1NVQ0NFU1M7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLldJTkRPV19DSEFOR0U6XHJcbiAgICAgICAgICAgICAgICBpZiAoIWVuZGVkQnlVc2VyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgcmVzcG9uc2Ugd2FzIHRlcm1pbmF0ZWQgZHVlIHRvIG5ld2VyICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAncmVxdWVzdCBpc3N1ZWQgb24gc2FtZSBjaGFubmVsLiBUaGF0IG1heSBiZSBhbiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2ludGVybmFsIHdlYmpwaXAuanMgZXJyb3IgLSBDaGVjayB0aGF0IG1vdmFibGUgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdyZXF1ZXN0cyBhcmUgd2VsbCBtYWludGFpbmVkJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLkJZVEVfTElNSVQ6XHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLlJFU1BPTlNFX0xJTUlUOlxyXG4gICAgICAgICAgICAgICAgaWYgKCFlbmRlZEJ5VXNlcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRNZXNzYWdlT2ZEYXRhUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGVuZFJlc3BvbnNlUmVzdWx0ID0gUkVTUE9OU0VfRU5ERURfU0VOVF9BTk9USEVSX01FU1NBR0U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSBqR2xvYmFscy5qcGlwRW5kT2ZSZXNwb25zZVJlYXNvbnMuU0VTU0lPTl9MSU1JVDpcclxuICAgICAgICAgICAgICAgIHNlc3Npb25IZWxwZXIub25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgcmVzb3VyY2VzIGFzc29jaWF0ZWQgd2l0aCB0aGUgc2Vzc2lvbiBpcyAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2xpbWl0dGVkLCBubyBmdXJ0aGVyIHJlcXVlc3RzIHNob3VsZCBiZSBpc3N1ZWQgdG8gJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICd0aGlzIHNlc3Npb24nKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLk5PTl9TUEVDSUZJRUQ6XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgZXJyb3IgdGVybWluYXRlZCByZXNwb25zZSB3aXRoIG5vIHJlYXNvbiBzcGVjaWZpZWQnKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHNlc3Npb25IZWxwZXIub25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnU2VydmVyIHJlc3BvbmRlZCB3aXRoIGlsbGVnYWwgRW5kIE9mIFJlc3BvbnNlICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnKEVPUikgY29kZTogJyArIGJ5dGVzW29mZnNldCArIDFdKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGVuZFJlc3BvbnNlUmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBzYXZlVG9EYXRhYmluc0Zyb21PZmZzZXQoYWpheFJlc3BvbnNlKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYWpheFJlc3BvbnNlLnJlc3BvbnNlKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICB2YXIgcHJldmlvdXNIZWFkZXI7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB3aGlsZSAob2Zmc2V0IDwgYnl0ZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYnl0ZXNbb2Zmc2V0XSA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIEVuZCBPZiBSZXNwb25zZSAoRU9SKVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgaGVhZGVyID0gbWVzc2FnZUhlYWRlclBhcnNlci5wYXJzZU1lc3NhZ2VIZWFkZXIoXHJcbiAgICAgICAgICAgICAgICAgICAgYnl0ZXMsIG9mZnNldCwgcHJldmlvdXNIZWFkZXIpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoaGVhZGVyLmJvZHlTdGFydCArIGhlYWRlci5tZXNzYWdlQm9keUxlbmd0aCA+IGJ5dGVzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHNlc3Npb25IZWxwZXIuZ2V0RGF0YWJpbnNTYXZlcigpLnNhdmVEYXRhKGhlYWRlciwgYnl0ZXMpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBvZmZzZXQgPSBoZWFkZXIuYm9keVN0YXJ0ICsgaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgcHJldmlvdXNIZWFkZXIgPSBoZWFkZXI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKGUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBTZXNzaW9uSGVscGVyID0gZnVuY3Rpb24gSnBpcFNlc3Npb25IZWxwZXIoXHJcbiAgICBkYXRhUmVxdWVzdFVybCxcclxuICAgIGtub3duVGFyZ2V0SWQsXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgZGF0YWJpbnNTYXZlcixcclxuICAgIGFqYXhIZWxwZXIpIHtcclxuICAgIFxyXG4gICAgdmFyIHN0YXR1c0NhbGxiYWNrID0gbnVsbDtcclxuICAgIHZhciByZXF1ZXN0RW5kZWRDYWxsYmFjayA9IG51bGw7XHJcbiAgICBcclxuICAgIHZhciBjaGFubmVscyA9IFtdO1xyXG4gICAgdmFyIGZpcnN0Q2hhbm5lbCA9IG51bGw7XHJcblxyXG4gICAgdmFyIGFjdGl2ZVJlcXVlc3RzID0gMDtcclxuICAgIHZhciB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzID0gW107XHJcblxyXG4gICAgdmFyIGlzUmVhZHkgPSBmYWxzZTtcclxuICAgIHZhciB0YXJnZXRJZCA9IGtub3duVGFyZ2V0SWQgfHwgJzAnO1xyXG4gICAgXHJcbiAgICB0aGlzLm9uRXhjZXB0aW9uID0gZnVuY3Rpb24gb25FeGNlcHRpb24oZXhjZXB0aW9uKSB7XHJcbiAgICAgICAgb25TdGF0dXNDaGFuZ2UoZXhjZXB0aW9uKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SXNSZWFkeSA9IGZ1bmN0aW9uIGdldElzUmVhZHkoKSB7XHJcbiAgICAgICAgcmV0dXJuIGlzUmVhZHk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldElzUmVhZHkgPSBmdW5jdGlvbiBzZXRJc1JlYWR5KGlzUmVhZHlfKSB7XHJcbiAgICAgICAgaXNSZWFkeSA9IGlzUmVhZHlfO1xyXG4gICAgICAgIG9uU3RhdHVzQ2hhbmdlKCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENvZGVzdHJlYW1TdHJ1Y3R1cmUgPSBmdW5jdGlvbiBnZXRDb2Rlc3RyZWFtU3RydWN0dXJlKCkge1xyXG4gICAgICAgIHJldHVybiBjb2Rlc3RyZWFtU3RydWN0dXJlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXREYXRhYmluc1NhdmVyID0gZnVuY3Rpb24gZ2V0RGF0YWJpbnNTYXZlcigpIHtcclxuICAgICAgICByZXR1cm4gZGF0YWJpbnNTYXZlcjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RGF0YVJlcXVlc3RVcmwgPSBmdW5jdGlvbiBnZXREYXRhUmVxdWVzdFVybCgpIHtcclxuICAgICAgICByZXR1cm4gZGF0YVJlcXVlc3RVcmw7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRhcmdldElkID0gZnVuY3Rpb24gZ2V0VGFyZ2V0SWQoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldElkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRGaXJzdENoYW5uZWwgPSBmdW5jdGlvbiBnZXRGaXJzdENoYW5uZWwoKSB7XHJcbiAgICAgICAgcmV0dXJuIGZpcnN0Q2hhbm5lbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2V0U3RhdHVzQ2FsbGJhY2sgPSBmdW5jdGlvbiBzZXRTdGF0dXNDYWxsYmFjayhzdGF0dXNDYWxsYmFja18pIHtcclxuICAgICAgICBzdGF0dXNDYWxsYmFjayA9IHN0YXR1c0NhbGxiYWNrXztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSBmdW5jdGlvbiBzZXRSZXF1ZXN0RW5kZWRDYWxsYmFjayhcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFja18pIHtcclxuICAgICAgICBcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFjayA9IHJlcXVlc3RFbmRlZENhbGxiYWNrXztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucmVxdWVzdFN0YXJ0ZWQgPSBmdW5jdGlvbiByZXF1ZXN0U3RhcnRlZCgpIHtcclxuICAgICAgICArK2FjdGl2ZVJlcXVlc3RzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5yZXF1ZXN0RW5kZWQgPSBmdW5jdGlvbiByZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBjaGFubmVsKSB7XHJcbiAgICAgICAgLS1hY3RpdmVSZXF1ZXN0cztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGFyZ2V0SWRGcm9tU2VydmVyID0gYWpheFJlc3BvbnNlLmdldFJlc3BvbnNlSGVhZGVyKCdKUElQLXRpZCcpO1xyXG4gICAgICAgIGlmICh0YXJnZXRJZEZyb21TZXJ2ZXIgIT09ICcnICYmIHRhcmdldElkRnJvbVNlcnZlciAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBpZiAodGFyZ2V0SWQgPT09ICcwJykge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0SWQgPSB0YXJnZXRJZEZyb21TZXJ2ZXI7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0SWQgIT09IHRhcmdldElkRnJvbVNlcnZlcikge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgcmV0dXJuZWQgdW5tYXRjaGVkIHRhcmdldCBJRCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmaXJzdENoYW5uZWwgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgZmlyc3RDaGFubmVsID0gY2hhbm5lbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNoYW5uZWxGcmVlZCA9IGNoYW5uZWwuZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCgpID9cclxuICAgICAgICAgICAgbnVsbCA6IGNoYW5uZWw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHJlcXVlc3RFbmRlZENhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RFbmRlZENhbGxiYWNrKGNoYW5uZWxGcmVlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRBY3RpdmVSZXF1ZXN0c0NvdW50ID0gZnVuY3Rpb24gZ2V0QWN0aXZlUmVxdWVzdHNDb3VudCgpIHtcclxuICAgICAgICByZXR1cm4gYWN0aXZlUmVxdWVzdHM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNoYW5uZWxDcmVhdGVkID0gZnVuY3Rpb24gY2hhbm5lbENyZWF0ZWQoY2hhbm5lbCkge1xyXG4gICAgICAgIGNoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENyZWF0ZWRDaGFubmVsSWQgPSBmdW5jdGlvbiBnZXRDcmVhdGVkQ2hhbm5lbElkKGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgIHZhciBjbmV3UmVzcG9uc2UgPSBhamF4UmVzcG9uc2UuZ2V0UmVzcG9uc2VIZWFkZXIoJ0pQSVAtY25ldycpO1xyXG4gICAgICAgIGlmICghY25ld1Jlc3BvbnNlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIga2V5VmFsdWVQYWlyc0luUmVzcG9uc2UgPSBjbmV3UmVzcG9uc2Uuc3BsaXQoJywnKTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlWYWx1ZVBhaXJzSW5SZXNwb25zZS5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIga2V5QW5kVmFsdWUgPSBrZXlWYWx1ZVBhaXJzSW5SZXNwb25zZVtpXS5zcGxpdCgnPScpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGtleUFuZFZhbHVlWzBdID09PSAnY2lkJykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleUFuZFZhbHVlWzFdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy53YWl0Rm9yQ29uY3VycmVudFJlcXVlc3RzVG9FbmQgPVxyXG4gICAgICAgIGZ1bmN0aW9uIHdhaXRGb3JDb25jdXJyZW50UmVxdWVzdHNUb0VuZChyZXF1ZXN0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbmN1cnJlbnRSZXF1ZXN0cyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhbm5lbHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIHJlcXVlc3RzID0gY2hhbm5lbHNbaV0uZ2V0UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UoKTtcclxuICAgICAgICAgICAgdmFyIG51bVJlcXVlc3RzID0gcmVxdWVzdHMubGVuZ3RoO1xyXG4gICAgICAgICAgICBpZiAobnVtUmVxdWVzdHMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbGFzdFJlcXVlc3RJZCA9IHJlcXVlc3RzWzBdLmdldExhc3RSZXF1ZXN0SWQoKTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDE7IGogPCByZXF1ZXN0cy5sZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICAgICAgbGFzdFJlcXVlc3RJZCA9IE1hdGgubWF4KFxyXG4gICAgICAgICAgICAgICAgICAgIGxhc3RSZXF1ZXN0SWQsIHJlcXVlc3RzW2pdLmdldExhc3RSZXF1ZXN0SWQoKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIGNoYW5uZWw6IGNoYW5uZWxzW2ldLFxyXG4gICAgICAgICAgICAgICAgcmVxdWVzdElkOiBsYXN0UmVxdWVzdElkXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0cy5wdXNoKHtcclxuICAgICAgICAgICAgcmVxdWVzdDogcmVxdWVzdCxcclxuICAgICAgICAgICAgY29uY3VycmVudFJlcXVlc3RzOiBjb25jdXJyZW50UmVxdWVzdHNcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuY2hlY2tDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCA9XHJcbiAgICAgICAgZnVuY3Rpb24gY2hlY2tDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCgpIHtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xyXG4gICAgICAgICAgICB2YXIgaXNBbGxDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB2YXIgY29uY3VycmVudFJlcXVlc3RzID1cclxuICAgICAgICAgICAgICAgIHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHNbaV0uY29uY3VycmVudFJlcXVlc3RzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IGNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggLSAxOyBqID49IDA7IC0taikge1xyXG4gICAgICAgICAgICAgICAgdmFyIHdhaXRpbmcgPSBjb25jdXJyZW50UmVxdWVzdHNbal07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmICh3YWl0aW5nLmNoYW5uZWwuaXNBbGxPbGRSZXF1ZXN0c0VuZGVkKHdhaXRpbmcucmVxdWVzdElkKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0c1tqXSA9IGNvbmN1cnJlbnRSZXF1ZXN0c1tcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uY3VycmVudFJlcXVlc3RzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggLT0gMTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHJlcXVlc3QgPSB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzW2ldLnJlcXVlc3Q7XHJcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IHJlcXVlc3QuY2FsbGJhY2s7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzW2ldID0gd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0c1tcclxuICAgICAgICAgICAgICAgIHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgIHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXF1ZXN0LmNhbGxDYWxsYmFja0FmdGVyQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNlbmRBamF4ID0gZnVuY3Rpb24gc2VuZEFqYXgoXHJcbiAgICAgICAgdXJsLFxyXG4gICAgICAgIGNhbGxiYWNrLFxyXG4gICAgICAgIGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmb3JrZWRGYWlsdXJlQ2FsbGJhY2s7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgICAgICAgICBmb3JrZWRGYWlsdXJlQ2FsbGJhY2sgPSBmdW5jdGlvbiBmb3JrRmFpbHVyZUNhbGxiYWNrKGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgICAgICAgICAgZ2VuZXJhbEZhaWx1cmVDYWxsYmFjayhhamF4UmVzcG9uc2UpO1xyXG4gICAgICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKGFqYXhSZXNwb25zZSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZm9ya2VkRmFpbHVyZUNhbGxiYWNrID0gZ2VuZXJhbEZhaWx1cmVDYWxsYmFjaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWpheEhlbHBlci5yZXF1ZXN0KHVybCwgY2FsbGJhY2ssIGZvcmtlZEZhaWx1cmVDYWxsYmFjayk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZW5lcmFsRmFpbHVyZUNhbGxiYWNrKGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgIHZhciBleGNlcHRpb24gPSBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0JhZCBqcGlwIHNlcnZlciByZXNwb25zZSAoc3RhdHVzID0gJyArIGFqYXhSZXNwb25zZS5zdGF0dXMgKyAnKScpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBvblN0YXR1c0NoYW5nZShleGNlcHRpb24pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBvblN0YXR1c0NoYW5nZShleGNlcHRpb24pIHtcclxuICAgICAgICBpZiAoZXhjZXB0aW9uID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZXhjZXB0aW9uID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHN0YXR1c0NhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHN0YXR1c0NhbGxiYWNrKHtcclxuICAgICAgICAgICAgICAgIGlzUmVhZHk6IGlzUmVhZHksXHJcbiAgICAgICAgICAgICAgICBleGNlcHRpb246IGV4Y2VwdGlvblxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuSnBpcFNlc3Npb24gPSBmdW5jdGlvbiBKcGlwU2Vzc2lvbihcclxuICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsXHJcbiAgICBrbm93blRhcmdldElkLFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICBzZXRJbnRlcnZhbEZ1bmN0aW9uLFxyXG4gICAgY2xlYXJJbnRlcnZhbEZ1bmN0aW9uLFxyXG4gICAganBpcEZhY3RvcnkpIHtcclxuXHJcbiAgICB2YXIgU0VDT05EID0gMTAwMDtcclxuICAgIHZhciBLRUVQX0FMSVZFX0lOVEVSVkFMID0gMzAgKiBTRUNPTkQ7XHJcbiAgICBcclxuICAgIHZhciBjaGFubmVsTWFuYWdlbWVudFVybDtcclxuICAgIHZhciBkYXRhUmVxdWVzdFVybDtcclxuICAgIHZhciBjbG9zZVNlc3Npb25Vcmw7XHJcbiAgICBcclxuICAgIHZhciBpc0Nsb3NlQ2FsbGVkID0gZmFsc2U7XHJcbiAgICB2YXIgY2xvc2VDYWxsYmFja1BlbmRpbmcgPSBudWxsO1xyXG5cclxuICAgIHZhciBzZXNzaW9uSGVscGVyID0gbnVsbDtcclxuICAgIHZhciBzdGF0dXNDYWxsYmFjayA9IG51bGw7XHJcbiAgICB2YXIgcmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSBudWxsO1xyXG5cclxuICAgIHZhciBub25EZWRpY2F0ZWRDaGFubmVscyA9IFtdO1xyXG4gICAgdmFyIGNoYW5uZWxzQ3JlYXRlZCA9IDA7XHJcbiAgICB2YXIga2VlcEFsaXZlSW50ZXJ2YWxIYW5kbGUgPSBudWxsO1xyXG4gICAgXHJcbiAgICB0aGlzLm9wZW4gPSBmdW5jdGlvbiBvcGVuKGJhc2VVcmwpIHtcclxuICAgICAgICBpZiAoc2Vzc2lvbkhlbHBlciAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdzZXNzaW9uLm9wZW4oKSBzaG91bGQgYmUgY2FsbGVkIG9ubHkgb25jZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcXVlcnlQYXJhbXNEZWxpbWl0ZXIgPSBiYXNlVXJsLmluZGV4T2YoJz8nKSA8IDAgPyAnPycgOiAnJic7XHJcbiAgICAgICAgY2hhbm5lbE1hbmFnZW1lbnRVcmwgPSBiYXNlVXJsICsgcXVlcnlQYXJhbXNEZWxpbWl0ZXIgKyAndHlwZT0nICsgXHJcbiAgICAgICAgICAgIChkYXRhYmluc1NhdmVyLmdldElzSnBpcFRpbGVQYXJ0U3RyZWFtKCkgPyAnanB0LXN0cmVhbScgOiAnanBwLXN0cmVhbScpO1xyXG4gICAgICAgIGRhdGFSZXF1ZXN0VXJsID0gY2hhbm5lbE1hbmFnZW1lbnRVcmwgKyAnJnN0cmVhbT0wJztcclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyID0ganBpcEZhY3RvcnkuY3JlYXRlU2Vzc2lvbkhlbHBlcihcclxuICAgICAgICAgICAgZGF0YVJlcXVlc3RVcmwsIGtub3duVGFyZ2V0SWQsIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGRhdGFiaW5zU2F2ZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzdGF0dXNDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLnNldFN0YXR1c0NhbGxiYWNrKHN0YXR1c0NhbGxiYWNrKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHJlcXVlc3RFbmRlZENhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIuc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2socmVxdWVzdEVuZGVkQ2FsbGJhY2spO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2hhbm5lbCA9IGNyZWF0ZUNoYW5uZWwoKTtcclxuICAgICAgICBcclxuICAgICAgICBjaGFubmVsLnNlbmRNaW5pbWFsUmVxdWVzdChzZXNzaW9uUmVhZHlDYWxsYmFjayk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRhcmdldElkID0gZnVuY3Rpb24gZ2V0VGFyZ2V0SWQoKSB7XHJcbiAgICAgICAgZW5zdXJlUmVhZHkoKTtcclxuICAgICAgICByZXR1cm4gc2Vzc2lvbkhlbHBlci5nZXRUYXJnZXRJZCgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJc1JlYWR5ID0gZnVuY3Rpb24gZ2V0SXNSZWFkeSgpIHtcclxuICAgICAgICB2YXIgaXNSZWFkeSA9IHNlc3Npb25IZWxwZXIgIT09IG51bGwgJiYgc2Vzc2lvbkhlbHBlci5nZXRJc1JlYWR5KCk7XHJcbiAgICAgICAgcmV0dXJuIGlzUmVhZHk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldFN0YXR1c0NhbGxiYWNrID0gZnVuY3Rpb24gc2V0U3RhdHVzQ2FsbGJhY2soc3RhdHVzQ2FsbGJhY2tfKSB7XHJcbiAgICAgICAgc3RhdHVzQ2FsbGJhY2sgPSBzdGF0dXNDYWxsYmFja187XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHNlc3Npb25IZWxwZXIgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5zZXRTdGF0dXNDYWxsYmFjayhzdGF0dXNDYWxsYmFja18pO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSBmdW5jdGlvbiBzZXRSZXF1ZXN0RW5kZWRDYWxsYmFjayhcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFja18pIHtcclxuICAgICAgICBcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFjayA9IHJlcXVlc3RFbmRlZENhbGxiYWNrXztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoc2Vzc2lvbkhlbHBlciAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLnNldFJlcXVlc3RFbmRlZENhbGxiYWNrKHJlcXVlc3RFbmRlZENhbGxiYWNrXyk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5oYXNBY3RpdmVSZXF1ZXN0cyA9IGZ1bmN0aW9uIGhhc0FjdGl2ZVJlcXVlc3RzKCkge1xyXG4gICAgICAgIGVuc3VyZVJlYWR5KCk7XHJcblxyXG4gICAgICAgIHZhciBpc0FjdGl2ZVJlcXVlc3RzID0gc2Vzc2lvbkhlbHBlci5nZXRBY3RpdmVSZXF1ZXN0c0NvdW50KCkgPiAwO1xyXG4gICAgICAgIHJldHVybiBpc0FjdGl2ZVJlcXVlc3RzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy50cnlHZXRDaGFubmVsID0gZnVuY3Rpb24gdHJ5R2V0Q2hhbm5lbChkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0KSB7XHJcbiAgICAgICAgZW5zdXJlUmVhZHkoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2FuQ3JlYXRlTmV3Q2hhbm5lbCA9IGNoYW5uZWxzQ3JlYXRlZCA8IG1heENoYW5uZWxzSW5TZXNzaW9uO1xyXG4gICAgICAgIHZhciBzZWFyY2hPbmx5Q2hhbm5lbFdpdGhFbXB0eVF1ZXVlID1cclxuICAgICAgICAgICAgY2FuQ3JlYXRlTmV3Q2hhbm5lbCB8fCBkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhSZXF1ZXN0c0luQ2hhbm5lbCA9IHNlYXJjaE9ubHlDaGFubmVsV2l0aEVtcHR5UXVldWUgP1xyXG4gICAgICAgICAgICAwIDogbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwgLSAxO1xyXG5cclxuICAgICAgICB2YXIgY2hhbm5lbCA9IGdldENoYW5uZWxXaXRoTWluaW1hbFdhaXRpbmdSZXF1ZXN0cyhcclxuICAgICAgICAgICAgbWF4UmVxdWVzdHNJbkNoYW5uZWwsXHJcbiAgICAgICAgICAgIC8qaXNFeHRyYWN0RnJvbU5vbkRlZGljYXRlZExpc3Q9Ki9kZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbCA9PT0gbnVsbCAmJiBjYW5DcmVhdGVOZXdDaGFubmVsKSB7XHJcbiAgICAgICAgICAgIGNoYW5uZWwgPSBjcmVhdGVDaGFubmVsKGRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdCAmJiBjaGFubmVsICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGNoYW5uZWwuZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY2hhbm5lbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2xvc2UgPSBmdW5jdGlvbiBjbG9zZShjbG9zZWRDYWxsYmFjaykge1xyXG4gICAgICAgIGlmIChjaGFubmVsc0NyZWF0ZWQgPT09IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ2Fubm90IGNsb3NlIHNlc3Npb24gYmVmb3JlIG9wZW4nKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChpc0Nsb3NlQ2FsbGVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0Nhbm5vdCBjbG9zZSBzZXNzaW9uIHR3aWNlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlzQ2xvc2VDYWxsZWQgPSB0cnVlO1xyXG4gICAgICAgIGNsb3NlQ2FsbGJhY2tQZW5kaW5nID0gY2xvc2VkQ2FsbGJhY2s7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNsb3NlU2Vzc2lvblVybCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGNsb3NlSW50ZXJuYWwoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjbG9zZUludGVybmFsKCkge1xyXG4gICAgICAgIGlmIChrZWVwQWxpdmVJbnRlcnZhbEhhbmRsZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjbGVhckludGVydmFsRnVuY3Rpb24oa2VlcEFsaXZlSW50ZXJ2YWxIYW5kbGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyLnNldElzUmVhZHkoZmFsc2UpO1xyXG4gICAgICAgIHNlc3Npb25IZWxwZXIuc2VuZEFqYXgoY2xvc2VTZXNzaW9uVXJsLCBjbG9zZUNhbGxiYWNrUGVuZGluZyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwoaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCkge1xyXG4gICAgICAgICsrY2hhbm5lbHNDcmVhdGVkO1xyXG4gICAgICAgIHZhciBjaGFubmVsID0ganBpcEZhY3RvcnkuY3JlYXRlQ2hhbm5lbChcclxuICAgICAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsIHNlc3Npb25IZWxwZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlc3Npb25IZWxwZXIuY2hhbm5lbENyZWF0ZWQoY2hhbm5lbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0KSB7XHJcbiAgICAgICAgICAgIG5vbkRlZGljYXRlZENoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gY2hhbm5lbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Q2hhbm5lbFdpdGhNaW5pbWFsV2FpdGluZ1JlcXVlc3RzKFxyXG4gICAgICAgIG1heFJlcXVlc3RzSW5DaGFubmVsLCBpc0V4dHJhY3RGcm9tTm9uRGVkaWNhdGVkTGlzdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjaGFubmVsID0gbnVsbDtcclxuICAgICAgICB2YXIgaW5kZXg7XHJcbiAgICAgICAgdmFyIG1pbmltYWxXYWl0aW5nUmVxdWVzdHMgPSBtYXhSZXF1ZXN0c0luQ2hhbm5lbCArIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBub25EZWRpY2F0ZWRDaGFubmVscy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgd2FpdGluZ1JlcXVlc3RzID1cclxuICAgICAgICAgICAgICAgIG5vbkRlZGljYXRlZENoYW5uZWxzW2ldLmdldEFsbFF1ZXVlZFJlcXVlc3RDb3VudCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHdhaXRpbmdSZXF1ZXN0cyA8IG1pbmltYWxXYWl0aW5nUmVxdWVzdHMpIHtcclxuICAgICAgICAgICAgICAgIGNoYW5uZWwgPSBub25EZWRpY2F0ZWRDaGFubmVsc1tpXTtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gaTtcclxuICAgICAgICAgICAgICAgIG1pbmltYWxXYWl0aW5nUmVxdWVzdHMgPSB3YWl0aW5nUmVxdWVzdHM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh3YWl0aW5nUmVxdWVzdHMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNFeHRyYWN0RnJvbU5vbkRlZGljYXRlZExpc3QgfHwgY2hhbm5lbCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2hhbm5lbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbm9uRGVkaWNhdGVkQ2hhbm5lbHNbaW5kZXhdID1cclxuICAgICAgICAgICAgbm9uRGVkaWNhdGVkQ2hhbm5lbHNbbm9uRGVkaWNhdGVkQ2hhbm5lbHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgbm9uRGVkaWNhdGVkQ2hhbm5lbHMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNoYW5uZWw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNlc3Npb25SZWFkeUNhbGxiYWNrKCkge1xyXG4gICAgICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuICAgICAgICBpZiAoIW1haW5IZWFkZXJEYXRhYmluLmlzQWxsRGF0YWJpbkxvYWRlZCgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdNYWluIGhlYWRlciB3YXMgbm90IGxvYWRlZCBvbiBzZXNzaW9uIGNyZWF0aW9uJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhcmJpdHJhcnlDaGFubmVsID0gc2Vzc2lvbkhlbHBlci5nZXRGaXJzdENoYW5uZWwoKTtcclxuICAgICAgICB2YXIgYXJiaXRyYXJ5Q2hhbm5lbElkID0gYXJiaXRyYXJ5Q2hhbm5lbC5nZXRDaGFubmVsSWQoKTtcclxuICAgICAgICBjbG9zZVNlc3Npb25VcmwgPSBjaGFubmVsTWFuYWdlbWVudFVybCArXHJcbiAgICAgICAgICAgICcmY2Nsb3NlPSonICtcclxuICAgICAgICAgICAgJyZjaWQ9JyArIGFyYml0cmFyeUNoYW5uZWxJZDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzQ2xvc2VDYWxsZWQpIHtcclxuICAgICAgICAgICAgY2xvc2VJbnRlcm5hbCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGtlZXBBbGl2ZUludGVydmFsSGFuZGxlID0gc2V0SW50ZXJ2YWxGdW5jdGlvbihcclxuICAgICAgICAgICAga2VlcEFsaXZlSGFuZGxlciwgS0VFUF9BTElWRV9JTlRFUlZBTCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5zZXRJc1JlYWR5KHRydWUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBrZWVwQWxpdmVIYW5kbGVyKCkge1xyXG4gICAgICAgIGlmIChzZXNzaW9uSGVscGVyLmdldEFjdGl2ZVJlcXVlc3RzQ291bnQoKSA+IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYXJiaXRyYXJ5Q2hhbm5lbCA9IHNlc3Npb25IZWxwZXIuZ2V0Rmlyc3RDaGFubmVsKCk7XHJcbiAgICAgICAgYXJiaXRyYXJ5Q2hhbm5lbC5zZW5kTWluaW1hbFJlcXVlc3QoZnVuY3Rpb24gZHVtbXlDYWxsYmFjaygpIHt9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZW5zdXJlUmVhZHkoKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb25IZWxwZXIgPT09IG51bGwgfHwgIXNlc3Npb25IZWxwZXIuZ2V0SXNSZWFkeSgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdDYW5ub3QgcGVyZm9ybSAnICtcclxuICAgICAgICAgICAgICAgICd0aGlzIG9wZXJhdGlvbiB3aGVuIHRoZSBzZXNzaW9uIGlzIG5vdCByZWFkeScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwQml0c3RyZWFtUmVhZGVyID0gKGZ1bmN0aW9uIEpwaXBCaXRzdHJlYW1SZWFkZXJDbG9zdXJlKCkge1xyXG4gICAgdmFyIHplcm9CaXRzVW50aWxGaXJzdE9uZUJpdE1hcCA9IGNyZWF0ZVplcm9CaXRzVW50aWxGaXJzdE9uZUJpdE1hcCgpO1xyXG5cclxuICAgIGZ1bmN0aW9uIEpwaXBCaXRzdHJlYW1SZWFkZXIoZGF0YWJpbiwgdHJhbnNhY3Rpb25IZWxwZXIpIHtcclxuICAgICAgICB2YXIgaW5pdGlhbFN0YXRlID0ge1xyXG4gICAgICAgICAgICBuZXh0T2Zmc2V0VG9QYXJzZTogMCxcclxuICAgICAgICAgICAgdmFsaWRCaXRzSW5DdXJyZW50Qnl0ZTogMCxcclxuICAgICAgICAgICAgb3JpZ2luYWxCeXRlV2l0aG91dFNoaWZ0OiBudWxsLFxyXG4gICAgICAgICAgICBjdXJyZW50Qnl0ZTogbnVsbCxcclxuICAgICAgICAgICAgaXNTa2lwTmV4dEJ5dGU6IGZhbHNlXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgIHZhciBzdHJlYW1TdGF0ZSA9IHRyYW5zYWN0aW9uSGVscGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxPYmplY3QoaW5pdGlhbFN0YXRlKTtcclxuICAgICAgICB2YXIgYWN0aXZlVHJhbnNhY3Rpb24gPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnYWN0aXZlVHJhbnNhY3Rpb24nLCB7XHJcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gZ2V0QWN0aXZlVHJhbnNhY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYWN0aXZlVHJhbnNhY3Rpb24gPT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICAhYWN0aXZlVHJhbnNhY3Rpb24uaXNBY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ05vIGFjdGl2ZSB0cmFuc2FjdGlvbiBpbiBiaXRzdHJlYW1SZWFkZXInKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdGl2ZVRyYW5zYWN0aW9uO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdiaXRzQ291bnRlcicsIHtcclxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiBnZXRCaXRzQ291bnRlcigpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdHJ5VmFsaWRhdGVDdXJyZW50Qnl0ZShkYXRhYmluLCBzdGF0ZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUuaXNTa2lwTmV4dEJ5dGUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ1VuZXhwZWN0ZWQgc3RhdGUgb2YgYml0c3RyZWFtUmVhZGVyOiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ1doZW4gMHhGRiBlbmNvdW50ZXJlZCwgdHJ5VmFsaWRhdGVDdXJyZW50Qnl0ZSAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3Nob3VsZCBza2lwIHRoZSB3aG9sZSBieXRlICBhZnRlciAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3NoaWZ0UmVtYWluaW5nQml0c0luQnl0ZSBhbmQgY2xlYXIgaXNTa2lwTmV4dEJ5dGUuICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnSG93ZXZlciB0aGUgZmxhZyBpcyBzdGlsbCBzZXQnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHN0YXRlLm5leHRPZmZzZXRUb1BhcnNlICogOCAtIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGU7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ2RhdGFiaW5PZmZzZXQnLCB7XHJcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gZ2V0RGF0YWJpbk9mZnNldCgpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLmlzU2tpcE5leHRCeXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0YXRlLm5leHRPZmZzZXRUb1BhcnNlICsgMTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgJSA4ICE9PSAwIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub3JpZ2luYWxCeXRlV2l0aG91dFNoaWZ0ID09PSAweEZGKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdDYW5ub3QgY2FsY3VsYXRlIGRhdGFiaW4gb2Zmc2V0IHdoZW4gYml0c3RyZWFtUmVhZGVyICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnIGlzIGluIHRoZSBtaWRkbGUgb2YgdGhlIGJ5dGUnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXRlLm5leHRPZmZzZXRUb1BhcnNlIC0gc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSAvIDg7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uIHNldERhdGFiaW5PZmZzZXQob2Zmc2V0SW5CeXRlcykge1xyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSA9IDA7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc1NraXBOZXh0Qnl0ZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUub3JpZ2luYWxCeXRlV2l0aG91dFNoaWZ0ID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIHN0YXRlLm5leHRPZmZzZXRUb1BhcnNlID0gb2Zmc2V0SW5CeXRlcztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc3RhcnROZXdUcmFuc2FjdGlvbiA9IGZ1bmN0aW9uIHN0YXJ0TmV3VHJhbnNhY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVUcmFuc2FjdGlvbiAhPT0gbnVsbCAmJiBhY3RpdmVUcmFuc2FjdGlvbi5pc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0Nhbm5vdCBzdGFydCBuZXcgdHJhbnNhY3Rpb24gaW4gYml0c3RyZWFtUmVhZGVyICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICd3aGlsZSBhbm90aGVyIHRyYW5zYWN0aW9uIGlzIGFjdGl2ZScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBhY3RpdmVUcmFuc2FjdGlvbiA9IHRyYW5zYWN0aW9uSGVscGVyLmNyZWF0ZVRyYW5zYWN0aW9uKCk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnNoaWZ0UmVtYWluaW5nQml0c0luQnl0ZSA9IGZ1bmN0aW9uIHNoaWZ0UmVtYWluaW5nQml0c0luQnl0ZSgpIHtcclxuICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG5cclxuICAgICAgICAgICAgc3RhdGUuaXNTa2lwTmV4dEJ5dGUgPSBzdGF0ZS5vcmlnaW5hbEJ5dGVXaXRob3V0U2hpZnQgPT09IDB4RkY7XHJcbiAgICAgICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgPSBNYXRoLmZsb29yKFxyXG4gICAgICAgICAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSAvIDgpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5zaGlmdEJpdCA9IGZ1bmN0aW9uIHNoaWZ0Qml0KCkge1xyXG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgIGlmICghdHJ5VmFsaWRhdGVDdXJyZW50Qnl0ZShkYXRhYmluLCBzdGF0ZSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb25lc0NvdW50ID0gY291bnRBbmRTaGlmdEJpdHMoXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgc3RhdGUsXHJcbiAgICAgICAgICAgICAgICAvKmlzVW50aWxaZXJvQml0PSovdHJ1ZSxcclxuICAgICAgICAgICAgICAgIC8qbWF4Qml0c1RvU2hpZnQ9Ki8xKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBvbmVzQ291bnQ7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmNvdW50WmVyb3NBbmRTaGlmdFVudGlsRmlyc3RPbmVCaXQgPVxyXG4gICAgICAgICAgICBmdW5jdGlvbiBjb3VudFplcm9zQW5kU2hpZnRVbnRpbEZpcnN0T25lQml0KG1heEJpdHNUb1NoaWZ0KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gY291bnRBbmRTaGlmdEJpdHMoXHJcbiAgICAgICAgICAgICAgICAgICAgZGF0YWJpbiwgc3RhdGUsIC8qaXNVbnRpbFplcm9CaXQ9Ki9mYWxzZSwgbWF4Qml0c1RvU2hpZnQpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY291bnRPbmVzQW5kU2hpZnRVbnRpbEZpcnN0WmVyb0JpdCA9XHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNvdW50T25lc0FuZFNoaWZ0VW50aWxGaXJzdFplcm9CaXQobWF4Qml0c1RvU2hpZnQpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBjb3VudEFuZFNoaWZ0Qml0cyhcclxuICAgICAgICAgICAgICAgICAgICBkYXRhYmluLCBzdGF0ZSwgLyppc1VudGlsWmVyb0JpdD0qL3RydWUsIG1heEJpdHNUb1NoaWZ0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnNoaWZ0Qml0cyA9IGZ1bmN0aW9uIHNoaWZ0Qml0cyhiaXRzQ291bnQpIHtcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IDA7XHJcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgdmFyIHJlbWFpbmluZ0JpdHMgPSBiaXRzQ291bnQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB3aGlsZSAocmVtYWluaW5nQml0cyA+IDApIHtcclxuICAgICAgICAgICAgICAgIGlmICghdHJ5VmFsaWRhdGVDdXJyZW50Qnl0ZShkYXRhYmluLCBzdGF0ZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGJpdHNUb1Rha2UgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlLCByZW1haW5pbmdCaXRzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGFkZFRvUmVzdWx0ID0gc3RhdGUuY3VycmVudEJ5dGUgPj4gKDggLSBiaXRzVG9UYWtlKTtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IChyZXN1bHQgPDwgYml0c1RvVGFrZSkgKyBhZGRUb1Jlc3VsdDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmVtb3ZlQml0c0Zyb21CeXRlKHN0YXRlLCBiaXRzVG9UYWtlKTtcclxuICAgICAgICAgICAgICAgIHJlbWFpbmluZ0JpdHMgLT0gYml0c1RvVGFrZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjb3VudEFuZFNoaWZ0Qml0cyhkYXRhYmluLCBzdGF0ZSwgaXNVbnRpbFplcm9CaXQsIG1heEJpdHNUb1NoaWZ0KSB7XHJcbiAgICAgICAgdmFyIGNvdW50ZWRCaXRzID0gMDtcclxuICAgICAgICB2YXIgZm91bmRUZXJtaW5hdGluZ0JpdDtcclxuICAgICAgICB2YXIgcmVtYWluaW5nQml0cyA9IG1heEJpdHNUb1NoaWZ0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgaWYgKCF0cnlWYWxpZGF0ZUN1cnJlbnRCeXRlKGRhdGFiaW4sIHN0YXRlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBieXRlVmFsdWUgPSBpc1VudGlsWmVyb0JpdCA/IH5zdGF0ZS5jdXJyZW50Qnl0ZSA6IHN0YXRlLmN1cnJlbnRCeXRlO1xyXG4gICAgICAgICAgICB2YXIgYml0c0NvdW50SW5jbHVkaW5nVGVybWluYXRpbmdCaXQgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgIHplcm9CaXRzVW50aWxGaXJzdE9uZUJpdE1hcFtieXRlVmFsdWVdLFxyXG4gICAgICAgICAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSArIDEpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGJpdHNDb3VudE5vdEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0ID1cclxuICAgICAgICAgICAgICAgIGJpdHNDb3VudEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0IC0gMTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChyZW1haW5pbmdCaXRzICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGlmIChiaXRzQ291bnRJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdCA+IHJlbWFpbmluZ0JpdHMpIHtcclxuICAgICAgICAgICAgICAgICAgICByZW1vdmVCaXRzRnJvbUJ5dGUoc3RhdGUsIHJlbWFpbmluZ0JpdHMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvdW50ZWRCaXRzICs9IHJlbWFpbmluZ0JpdHM7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJlbWFpbmluZ0JpdHMgLT0gYml0c0NvdW50Tm90SW5jbHVkaW5nVGVybWluYXRpbmdCaXQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvdW50ZWRCaXRzICs9IGJpdHNDb3VudE5vdEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm91bmRUZXJtaW5hdGluZ0JpdCA9XHJcbiAgICAgICAgICAgICAgICBiaXRzQ291bnRJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdCA8PSBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlO1xyXG5cclxuICAgICAgICAgICAgaWYgKGZvdW5kVGVybWluYXRpbmdCaXQpIHtcclxuICAgICAgICAgICAgICAgIHJlbW92ZUJpdHNGcm9tQnl0ZShzdGF0ZSwgYml0c0NvdW50SW5jbHVkaW5nVGVybWluYXRpbmdCaXQpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IHdoaWxlICghZm91bmRUZXJtaW5hdGluZ0JpdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNvdW50ZWRCaXRzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiByZW1vdmVCaXRzRnJvbUJ5dGUoc3RhdGUsIGJpdHNDb3VudCkge1xyXG4gICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgLT0gYml0c0NvdW50O1xyXG4gICAgICAgIGlmIChzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlID4gMCkge1xyXG4gICAgICAgICAgICBzdGF0ZS5jdXJyZW50Qnl0ZSA9IChzdGF0ZS5jdXJyZW50Qnl0ZSA8PCBiaXRzQ291bnQpICYgMHhGRjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gdHJ5VmFsaWRhdGVDdXJyZW50Qnl0ZShkYXRhYmluLCBzdGF0ZSkge1xyXG4gICAgICAgIGlmIChzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlID4gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzTmVlZGVkID0gc3RhdGUuaXNTa2lwTmV4dEJ5dGUgPyAyIDogMTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0QXJyYXkgPSBbXTtcclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBkYXRhYmluLmNvcHlCeXRlcyhyZXN1bHRBcnJheSwgLypyZXN1bHRTdGFydE9mZnNldD0qLzAsIHtcclxuICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogc3RhdGUubmV4dE9mZnNldFRvUGFyc2UsXHJcbiAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogYnl0ZXNOZWVkZWRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGJ5dGVzQ29waWVkICE9PSBieXRlc05lZWRlZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgcHJldkJ5dGUgPSBzdGF0ZS5vcmlnaW5hbEJ5dGVXaXRob3V0U2hpZnQ7XHJcblxyXG4gICAgICAgIHN0YXRlLmN1cnJlbnRCeXRlID0gcmVzdWx0QXJyYXlbYnl0ZXNOZWVkZWQgLSAxXTtcclxuICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlID0gODtcclxuICAgICAgICBzdGF0ZS5vcmlnaW5hbEJ5dGVXaXRob3V0U2hpZnQgPSBzdGF0ZS5jdXJyZW50Qnl0ZTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocHJldkJ5dGUgPT09IDB4RkYpIHtcclxuICAgICAgICAgICAgaWYgKChyZXN1bHRBcnJheVswXSAmIDB4ODApICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnRXhwZWN0ZWQgMCBiaXQgYWZ0ZXIgMHhGRiBieXRlJywgJ0IuMTAuMScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBObyBuZWVkIHRvIHNraXAgYW5vdGhlciBiaXQgaWYgYWxyZWFkeSBza2lwIHRoZSB3aG9sZSBieXRlXHJcbiAgICAgICAgICAgIGlmICghc3RhdGUuaXNTa2lwTmV4dEJ5dGUpIHtcclxuICAgICAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRCeXRlIDw8PSAxO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSA9IDc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3RhdGUuaXNTa2lwTmV4dEJ5dGUgPSBmYWxzZTtcclxuICAgICAgICBzdGF0ZS5uZXh0T2Zmc2V0VG9QYXJzZSArPSBieXRlc05lZWRlZDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVaZXJvQml0c1VudGlsRmlyc3RPbmVCaXRNYXAoKSB7XHJcbiAgICAgICAgdmFyIGFycmF5TWFwID0gbmV3IEFycmF5KDI1NSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYXJyYXlNYXBbMHgwMF0gPSA5O1xyXG4gICAgICAgIGFycmF5TWFwWzB4MDFdID0gODtcclxuICAgICAgICBhcnJheU1hcFsweDAyXSA9IDc7XHJcbiAgICAgICAgYXJyYXlNYXBbMHgwM10gPSA3O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoaSA9IDB4MDQ7IGkgPD0gMHgwNzsgKytpKSB7XHJcbiAgICAgICAgICAgIGFycmF5TWFwW2ldID0gNjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChpID0gMHgwODsgaSA8PSAweDBGOyArK2kpIHtcclxuICAgICAgICAgICAgYXJyYXlNYXBbaV0gPSA1O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChpID0gMHgxMDsgaSA8PSAweDFGOyArK2kpIHtcclxuICAgICAgICAgICAgYXJyYXlNYXBbaV0gPSA0O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChpID0gMHgyMDsgaSA8PSAweDNGOyArK2kpIHtcclxuICAgICAgICAgICAgYXJyYXlNYXBbaV0gPSAzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGkgPSAweDQwOyBpIDw9IDB4N0Y7ICsraSkge1xyXG4gICAgICAgICAgICBhcnJheU1hcFtpXSA9IDI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoaSA9IDB4ODA7IGkgPD0gMHhGRjsgKytpKSB7XHJcbiAgICAgICAgICAgIGFycmF5TWFwW2ldID0gMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQXZvaWQgdHdvJ3MgY29tcGxlbWVudCBwcm9ibGVtc1xyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPD0gMHhGRjsgKytpKSB7XHJcbiAgICAgICAgICAgIGFycmF5TWFwW2kgLSAweDEwMF0gPSBhcnJheU1hcFtpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGFycmF5TWFwO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gSnBpcEJpdHN0cmVhbVJlYWRlcjtcclxufSkoKTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwQ29kZWJsb2NrTGVuZ3RoUGFyc2VyID0gKGZ1bmN0aW9uIEpwaXBDb2RlYmxvY2tMZW5ndGhQYXJzZXJDbG9zdXJlKCkge1xyXG4gICAgLy8gQi4xMC43LlxyXG4gICAgXHJcbiAgICB2YXIgZXhhY3RMb2cyVGFibGUgPSBjcmVhdGVFeGFjdExvZzJUYWJsZSgpO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBKcGlwQ29kZWJsb2NrTGVuZ3RoUGFyc2VyKGJpdHN0cmVhbVJlYWRlciwgdHJhbnNhY3Rpb25IZWxwZXIpIHtcclxuICAgICAgICB2YXIgbEJsb2NrID0gdHJhbnNhY3Rpb25IZWxwZXIuY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdCh7XHJcbiAgICAgICAgICAgIGxCbG9ja1ZhbHVlOiAzXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMucGFyc2UgPSBmdW5jdGlvbiBwYXJzZShjb2RpbmdQYXNzZXMpIHtcclxuICAgICAgICAgICAgdmFyIGFkZFRvTEJsb2NrID0gYml0c3RyZWFtUmVhZGVyLmNvdW50T25lc0FuZFNoaWZ0VW50aWxGaXJzdFplcm9CaXQoKTtcclxuICAgICAgICAgICAgaWYgKGFkZFRvTEJsb2NrID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGxCbG9ja1N0YXRlID0gbEJsb2NrLmdldFZhbHVlKGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgIGxCbG9ja1N0YXRlLmxCbG9ja1ZhbHVlICs9IGFkZFRvTEJsb2NrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGNvZGluZ1Bhc3Nlc0xvZzIgPSBleGFjdExvZzJUYWJsZVtjb2RpbmdQYXNzZXNdO1xyXG4gICAgICAgICAgICBpZiAoY29kaW5nUGFzc2VzTG9nMiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCB2YWx1ZSBvZiBjb2RpbmcgcGFzc2VzICcgKyBjb2RpbmdQYXNzZXMgK1xyXG4gICAgICAgICAgICAgICAgICAgICcuIEV4cGVjdGVkIHBvc2l0aXZlIGludGVnZXIgPD0gMTY0Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBiaXRzQ291bnQgPSBsQmxvY2tTdGF0ZS5sQmxvY2tWYWx1ZSArIGNvZGluZ1Bhc3Nlc0xvZzI7XHJcbiAgICAgICAgICAgIHZhciBsZW5ndGggPSBiaXRzdHJlYW1SZWFkZXIuc2hpZnRCaXRzKGJpdHNDb3VudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gbGVuZ3RoO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUV4YWN0TG9nMlRhYmxlKCkge1xyXG4gICAgICAgIHZhciBtYXhDb2RpbmdQYXNzZXNQb3NzaWJsZSA9IDE2NDtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KG1heENvZGluZ1Bhc3Nlc1Bvc3NpYmxlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW5wdXRWYWx1ZUxvd2VyQm91bmQgPSAxO1xyXG4gICAgICAgIHZhciBpbnB1dFZhbHVlVXBwZXJCb3VuZCA9IDI7XHJcbiAgICAgICAgdmFyIGxvZzJSZXN1bHQgPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChpbnB1dFZhbHVlTG93ZXJCb3VuZCA8PSBtYXhDb2RpbmdQYXNzZXNQb3NzaWJsZSkge1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gaW5wdXRWYWx1ZUxvd2VyQm91bmQ7IGkgPCBpbnB1dFZhbHVlVXBwZXJCb3VuZDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSBsb2cyUmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbnB1dFZhbHVlTG93ZXJCb3VuZCAqPSAyO1xyXG4gICAgICAgICAgICBpbnB1dFZhbHVlVXBwZXJCb3VuZCAqPSAyO1xyXG4gICAgICAgICAgICArK2xvZzJSZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBKcGlwQ29kZWJsb2NrTGVuZ3RoUGFyc2VyO1xyXG59KSgpOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBDb2RpbmdQYXNzZXNOdW1iZXJQYXJzZXIgPSAoZnVuY3Rpb24gSnBpcENvZGluZ1Bhc3Nlc051bWJlclBhcnNlckNsb3N1cmUoKSB7XHJcbiAgICAvLyBUYWJsZSBCLjQgaW4gcGFydCAxIG9mIHRoZSBKcGVnMjAwMCBzdGFuZGFyZCBzaG93cyA3IGNhc2VzXHJcbiAgICAvLyBvZiB2YWx1ZXMuIFRoZSBhbGdvcml0aG0gc2hvd24gaGVyZSBzZXBhcmF0ZXMgdGhvc2UgY2FzZXNcclxuICAgIC8vIGludG8gMTYgY2FzZXMsIGRlcGVuZHMgb24gdGhlIG51bWJlciBvZiBvbmVzIGluIHRoZSBwcmVmaXhcclxuICAgIC8vIG9mIHRoZSBjb2RlZCBudW1iZXIgdW50aWwgdGhlIGZpcnN0IHplcm8uXHJcbiAgICAvLyBUaGUgcGFyc2luZyBpcyBkb25lIGluIHR3byBzdGFnZXM6IGZpcnN0IHdlIGNvdW50IHRoZSBvbmVzIHVudGlsXHJcbiAgICAvLyB0aGUgZmlyc3QgemVybywgbGF0ZXIgd2UgcGFyc2UgdGhlIG90aGVyIGJpdHMuXHJcbiAgICBcclxuICAgIC8vIEZvciBleGFtcGxlLCB0aGUgY2FzZSBvZiAxMTAxICh3aGljaCByZXByZXNlbnRzIDQgYWNjb3JkaW5nIHRvXHJcbiAgICAvLyB0YWJsZSBCLjQpIGlzIHBhcnNlZCBpbiB0d28gc3RhZ2VzLiBGaXJzdCB3ZSBjb3VudCB0aGUgb25lcyBpblxyXG4gICAgLy8gdGhlIGJlZ2lubmluZyB1bnRpbCB0aGUgZmlyc3QgemVybywgdGhlIHJlc3VsdCBpcyAyICgnMTEwJykuIFRoZW4gd2VcclxuICAgIC8vIHBhcnNlIHRoZSBvdGhlciBiaXRzICgnMScpLlxyXG4gICAgXHJcbiAgICAvLyBBZnRlciB0aGUgZmlyc3QgcGFyc2luZyBzdGFnZSAoY291bnQgb2Ygb25lcyksIHdlIGtub3cgdHdvIHRoaW5nczpcclxuICAgIC8vIC0gSG93IG1hbnkgYml0cyB3ZSBuZWVkIHRvIHRha2UgYWZ0ZXIgdGhlIGZpcnN0IHplcm8gKHNpbmdsZSBiaXQgaW5cclxuICAgIC8vICAgdGhlIGFib3ZlIGNhc2Ugb2YgJzExMCcgcHJlZml4KS5cclxuICAgIC8vIC0gSG93IG11Y2ggd2UgbmVlZCB0byBhZGQgdG8gdGhlIHJlc3VsdCBvZiBwYXJzaW5nIHRoZSBvdGhlciBiaXRzICgzXHJcbiAgICAvLyAgICAgaW4gdGhlIGFib3ZlIGNhc2Ugb2YgJzExMCcgcHJlZml4KS5cclxuICAgIFxyXG4gICAgLy8gQWN0dWFsbHkgdGhlIDE2IGNhc2VzIHdlcmUgZXh0cmFjdGVkIGZyb20gdGhlIHRhYmxlIHdpdGhvdXQgYW55IGZvcm11bGEsXHJcbiAgICAvLyBzbyB3ZSBjYW4gcmVmZXIgdGhlIG51bWJlciBvZiBvbmVzIGFzICdrZXl3b3Jkcycgb25seS5cclxuXHJcbiAgICB2YXIgYml0c05lZWRlZEFmdGVyQ291bnRPZk9uZXMgPSBjcmVhdGVCaXRzTmVlZGVkQWZ0ZXJDb3VudE9mT25lc01hcCgpO1xyXG4gICAgdmFyIGFkZFRvUmVzdWx0QWZ0ZXJDb3VudE9mT25lcyA9IGNyZWF0ZUFkZFRvUmVzdWx0QWZ0ZXJDb3VudE9mT25lc01hcCgpO1xyXG5cclxuICAgIHZhciBqcGlwQ29kaW5nUGFzc2VzTnVtYmVyUGFyc2VyID0ge1xyXG4gICAgICAgIHBhcnNlOiBmdW5jdGlvbiBwYXJzZShiaXRzdHJlYW1SZWFkZXIpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBvbmVzQ291bnQgPSBiaXRzdHJlYW1SZWFkZXIuY291bnRPbmVzQW5kU2hpZnRVbnRpbEZpcnN0WmVyb0JpdChcclxuICAgICAgICAgICAgICAgIC8qbWF4Qml0c1RvU2hpZnQ9Ki8xNik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob25lc0NvdW50ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIG1vcmVCaXRzTmVlZGVkID0gYml0c05lZWRlZEFmdGVyQ291bnRPZk9uZXNbb25lc0NvdW50XTtcclxuICAgICAgICAgICAgdmFyIG1vcmVCaXRzID0gYml0c3RyZWFtUmVhZGVyLnNoaWZ0Qml0cyhtb3JlQml0c05lZWRlZCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobW9yZUJpdHMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgYWRkVG9SZXN1bHQgPSBhZGRUb1Jlc3VsdEFmdGVyQ291bnRPZk9uZXNbb25lc0NvdW50XTtcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IG1vcmVCaXRzICsgYWRkVG9SZXN1bHQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUJpdHNOZWVkZWRBZnRlckNvdW50T2ZPbmVzTWFwKCkge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgQXJyYXkoMTcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcwJzogQWZ0ZXIgMCBvbmVzIGFuZCBzaW5nbGUgemVybywgbmVlZHMgbm8gbW9yZSBiaXRzXHJcbiAgICAgICAgcmVzdWx0WzBdID0gMDtcclxuXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzEwJzogQWZ0ZXIgMSBvbmVzIGFuZCBzaW5nbGUgemVybywgbmVlZHMgbm8gbW9yZSBiaXRzXHJcbiAgICAgICAgcmVzdWx0WzFdID0gMDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMHgnOiBBZnRlciAyIG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBuZWVkcyBhbm90aGVyIGJpdFxyXG4gICAgICAgIHJlc3VsdFsyXSA9IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzExMTAnOiBBZnRlciAzIG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBuZWVkcyBubyBtb3JlIGJpdHNcclxuICAgICAgICByZXN1bHRbM10gPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlcyBvZiAnMTExMSAwMDAwIDAnIHRvICcxMTExIDExMTEgMCc6XHJcbiAgICAgICAgLy8gQWZ0ZXIgNCB0byA4IG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBuZWVkcyBiaXRzIHRvIGNvbXBsZXRlIHRvIDkgYml0c1xyXG4gICAgICAgIHJlc3VsdFs0XSA9IDQ7XHJcbiAgICAgICAgcmVzdWx0WzVdID0gMztcclxuICAgICAgICByZXN1bHRbNl0gPSAyO1xyXG4gICAgICAgIHJlc3VsdFs3XSA9IDE7XHJcbiAgICAgICAgcmVzdWx0WzhdID0gMDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMTEgMTExMTEgLi4uJ1xyXG4gICAgICAgIC8vIEFmdGVyIGF0IGxlYXN0IDkgb25lcyBhbmQgc2luZ2xlIHplcm8sIG5lZWRzIGJpdHMgdG8gY29tcGxldGUgdG8gMTYgYml0c1xyXG4gICAgICAgIHJlc3VsdFs5XSA9IDY7XHJcbiAgICAgICAgcmVzdWx0WzEwXSA9IDU7XHJcbiAgICAgICAgcmVzdWx0WzExXSA9IDQ7XHJcbiAgICAgICAgcmVzdWx0WzEyXSA9IDM7XHJcbiAgICAgICAgcmVzdWx0WzEzXSA9IDI7XHJcbiAgICAgICAgcmVzdWx0WzE0XSA9IDE7XHJcbiAgICAgICAgcmVzdWx0WzE1XSA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzExMTEgMTExMTEgMTExMSAxMTEnXHJcbiAgICAgICAgcmVzdWx0WzE2XSA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlQWRkVG9SZXN1bHRBZnRlckNvdW50T2ZPbmVzTWFwKCkge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgQXJyYXkoMTcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcwJyAoY29kZXdvcmQgZm9yIDEpOlxyXG4gICAgICAgIC8vIEFmdGVyIDAgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCAxIHRvIG90aGVyIDAgYml0cyB2YWx1ZVxyXG4gICAgICAgIHJlc3VsdFswXSA9IDE7XHJcblxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcxMCcgKGNvZGV3b3JkIGZvciAyKTpcclxuICAgICAgICAvLyBBZnRlciAxIG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBhZGQgMiB0byBvdGhlciAwIGJpdHMgdmFsdWVcclxuICAgICAgICByZXN1bHRbMV0gPSAyO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlcyBvZiAnMTEweCcgKGNvZGV3b3JkcyBmb3IgMyBhbmQgNCk6XHJcbiAgICAgICAgLy8gQWZ0ZXIgMiBvbmVzIGFuZCBzaW5nbGUgemVybywgYWRkIDMgdG8gb3RoZXIgc2luZ2xlIGJpdCB2YWx1ZVxyXG4gICAgICAgIHJlc3VsdFsyXSA9IDM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzExMTAnIChjb2Rld29yZCBmb3IgNSk6XHJcbiAgICAgICAgLy8gQWZ0ZXIgMyBvbmVzIGFuZCBzaW5nbGUgemVybywgYWRkIDUgdG8gb3RoZXIgMCBiaXRzIHZhbHVlXHJcbiAgICAgICAgcmVzdWx0WzNdID0gNTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMTEgMDAwMCAwJyB0byAnMTExMSAxMTExIDAnIChjb2Rld29yZHMgZm9yIDYgdG8gMzYpOlxyXG4gICAgICAgIC8vIEFmdGVyIDQgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCA2IHRvIG90aGVyIDAvMS8yLzMvNCBiaXRzIHZhbHVlXHJcbiAgICAgICAgcmVzdWx0WzRdID0gNiArIDB4MDA7IC8vIGIwMDAwMFxyXG4gICAgICAgIHJlc3VsdFs1XSA9IDYgKyAweDEwOyAvLyBiMTAwMDBcclxuICAgICAgICByZXN1bHRbNl0gPSA2ICsgMHgxODsgLy8gYjExMDAwXHJcbiAgICAgICAgcmVzdWx0WzddID0gNiArIDB4MUM7IC8vIGIxMTEwMFxyXG4gICAgICAgIHJlc3VsdFs4XSA9IDYgKyAweDFFOyAvLyBiMTExMTBcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMTEgMTExMTEgLi4uJyAoY29kZXdvcmRzIGZvciAzNyB0byAxNjQpOlxyXG4gICAgICAgIC8vIEFmdGVyIDkgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCAzNyB0byBvdGhlciAwLzEvMi8zLzQvNS82IGJpdHMgdmFsdWVcclxuICAgICAgICByZXN1bHRbIDldID0gMzcgKyAweDAwOyAvLyBiMDAwMDAwXHJcbiAgICAgICAgcmVzdWx0WzEwXSA9IDM3ICsgMHg0MDsgLy8gYjEwMDAwMFxyXG4gICAgICAgIHJlc3VsdFsxMV0gPSAzNyArIDB4NjA7IC8vIGIxMTAwMDBcclxuICAgICAgICByZXN1bHRbMTJdID0gMzcgKyAweDcwOyAvLyBiMTExMDAwXHJcbiAgICAgICAgcmVzdWx0WzEzXSA9IDM3ICsgMHg3ODsgLy8gYjExMTEwMFxyXG4gICAgICAgIHJlc3VsdFsxNF0gPSAzNyArIDB4N0M7IC8vIGIxMTExMTBcclxuICAgICAgICByZXN1bHRbMTVdID0gMzcgKyAweDdFOyAvLyBiMTExMTExXHJcbiAgICAgICAgcmVzdWx0WzE2XSA9IDM3ICsgMHg3RjsgLy8gYjExMTExMVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBqcGlwQ29kaW5nUGFzc2VzTnVtYmVyUGFyc2VyO1xyXG59KSgpOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBQYWNrZXRMZW5ndGhDYWxjdWxhdG9yID0gZnVuY3Rpb24gSnBpcFBhY2tldExlbmd0aENhbGN1bGF0b3IoXHJcbiAgICB0aWxlU3RydWN0dXJlLFxyXG4gICAgY29tcG9uZW50U3RydWN0dXJlLFxyXG4gICAgZGF0YWJpbixcclxuICAgIHN0YXJ0T2Zmc2V0SW5EYXRhYmluLFxyXG4gICAgcHJlY2luY3QsXHJcbiAgICBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgY2FsY3VsYXRlZExlbmd0aHMgPSBbXTtcclxuICAgIFxyXG4gICAgdmFyIGJpdHN0cmVhbVJlYWRlciA9IGpwaXBGYWN0b3J5LmNyZWF0ZUJpdHN0cmVhbVJlYWRlcihkYXRhYmluKTtcclxuICAgIFxyXG4gICAgdmFyIG51bUNvZGVibG9ja3NYID1cclxuICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtQ29kZWJsb2Nrc1hJblByZWNpbmN0KHByZWNpbmN0KTtcclxuICAgIHZhciBudW1Db2RlYmxvY2tzWSA9XHJcbiAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldE51bUNvZGVibG9ja3NZSW5QcmVjaW5jdChwcmVjaW5jdCk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgbnVtUXVhbGl0eUxheWVyc0luVGlsZSA9IHRpbGVTdHJ1Y3R1cmUuZ2V0TnVtUXVhbGl0eUxheWVycygpO1xyXG4gICAgdmFyIGlzUGFja2V0SGVhZGVyTmVhckRhdGEgPSB0aWxlU3RydWN0dXJlLmdldElzUGFja2V0SGVhZGVyTmVhckRhdGEoKTtcclxuICAgIHZhciBpc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkID0gdGlsZVN0cnVjdHVyZS5nZXRJc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkKCk7XHJcbiAgICB2YXIgaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkID1cclxuICAgICAgICB0aWxlU3RydWN0dXJlLmdldElzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCgpO1xyXG4gICAgXHJcbiAgICB2YXIgc3ViYmFuZFBhcnNlcnMgPSBpbml0U3ViYmFuZFBhcnNlcnMoKTtcclxuICAgIFxyXG4gICAgdGhpcy5jYWxjdWxhdGVFbmRPZmZzZXRPZkxhc3RGdWxsUGFja2V0ID1cclxuICAgICAgICBmdW5jdGlvbiBjYWxjdWxhdGVGdWxsUGFja2V0c0F2YWlsYWJsZU9mZnNldHMobWF4TnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc0FsbG93ZWRGdWxsUXVhbGl0eSA9XHJcbiAgICAgICAgICAgIG1heE51bVF1YWxpdHlMYXllcnMgPT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzID49IG51bVF1YWxpdHlMYXllcnNJblRpbGU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVF1YWxpdHlMYXllcnNUb1BhcnNlO1xyXG4gICAgICAgIGlmICghaXNBbGxvd2VkRnVsbFF1YWxpdHkpIHtcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyc1RvUGFyc2UgPSBtYXhOdW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoIWRhdGFiaW4uaXNBbGxEYXRhYmluTG9hZGVkKCkpIHtcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyc1RvUGFyc2UgPSBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHZhciBlbmRPZmZzZXQgPSBkYXRhYmluLmdldERhdGFiaW5MZW5ndGhJZktub3duKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgZW5kT2Zmc2V0OiBlbmRPZmZzZXQsXHJcbiAgICAgICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzOiBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjaGVja1N1cHBvcnRlZFN0cnVjdHVyZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRyeVZhbGlkYXRlUGFja2V0cyhudW1RdWFsaXR5TGF5ZXJzVG9QYXJzZSk7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGdldEZ1bGxRdWFsaXR5TGF5ZXJzRW5kT2Zmc2V0KG51bVF1YWxpdHlMYXllcnNUb1BhcnNlKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleCA9IGZ1bmN0aW9uIGdldFBhY2tldE9mZnNldHNCeUNvZGVibG9ja0luZGV4KFxyXG4gICAgICAgIHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNoZWNrU3VwcG9ydGVkU3RydWN0dXJlKCk7XHJcbiAgICAgICAgdHJ5VmFsaWRhdGVQYWNrZXRzKHF1YWxpdHlMYXllciArIDEpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYWxjdWxhdGVkTGVuZ3Rocy5sZW5ndGggPD0gcXVhbGl0eUxheWVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY2FsY3VsYXRlZExlbmd0aHNbcXVhbGl0eUxheWVyXTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeVZhbGlkYXRlUGFja2V0cyhxdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgd2hpbGUgKGNhbGN1bGF0ZWRMZW5ndGhzLmxlbmd0aCA8IHF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLnN0YXJ0TmV3VHJhbnNhY3Rpb24oKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXh0UGFja2V0ID0gdHJ5Q2FsY3VsYXRlTmV4dFBhY2tldExlbmd0aChcclxuICAgICAgICAgICAgICAgIGNhbGN1bGF0ZWRMZW5ndGhzLmxlbmd0aCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobmV4dFBhY2tldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uLmFib3J0KCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhbGN1bGF0ZWRMZW5ndGhzLnB1c2gobmV4dFBhY2tldCk7XHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbi5jb21taXQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUNhbGN1bGF0ZU5leHRQYWNrZXRMZW5ndGgocXVhbGl0eUxheWVyKSB7XHJcbiAgICAgICAgdmFyIGhlYWRlclN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIGlmIChxdWFsaXR5TGF5ZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHZhciBsYXN0ID0gY2FsY3VsYXRlZExlbmd0aHNbcXVhbGl0eUxheWVyIC0gMV07XHJcbiAgICAgICAgICAgIGhlYWRlclN0YXJ0T2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIGxhc3QuaGVhZGVyU3RhcnRPZmZzZXQgK1xyXG4gICAgICAgICAgICAgICAgbGFzdC5oZWFkZXJMZW5ndGggK1xyXG4gICAgICAgICAgICAgICAgbGFzdC5vdmVyYWxsQm9keUxlbmd0aEJ5dGVzO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGhlYWRlclN0YXJ0T2Zmc2V0ID0gc3RhcnRPZmZzZXRJbkRhdGFiaW47XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICBiaXRzdHJlYW1SZWFkZXIuZGF0YWJpbk9mZnNldCA9IGhlYWRlclN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpc1BhY2tldEhlYWRlck5lYXJEYXRhICYmIGlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQpIHtcclxuICAgICAgICAgICAgdmFyIGlzTWFya2VyID0gaXNNYXJrZXJIZXJlKDB4OTEpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzTWFya2VyID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChpc01hcmtlcikge1xyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0T2ZQYWNrZXRTZWdtZW50TGVuZ3RoID0gNjtcclxuICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5kYXRhYmluT2Zmc2V0ICs9IHN0YXJ0T2ZQYWNrZXRTZWdtZW50TGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc1BhY2tldEV4aXN0SW5RdWFsaXR5TGF5ZXIgPSBiaXRzdHJlYW1SZWFkZXIuc2hpZnRCaXQoKTtcclxuICAgICAgICBpZiAoaXNQYWNrZXRFeGlzdEluUXVhbGl0eUxheWVyID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzUGFja2V0RXhpc3RJblF1YWxpdHlMYXllcikge1xyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuc2hpZnRSZW1haW5pbmdCaXRzSW5CeXRlKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBoZWFkZXJTdGFydE9mZnNldDogaGVhZGVyU3RhcnRPZmZzZXQsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJMZW5ndGg6IDEsXHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleDogW10sXHJcbiAgICAgICAgICAgICAgICBvdmVyYWxsQm9keUxlbmd0aEJ5dGVzOiAwXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYm9keUxlbmd0aCA9IGFjdHVhbENhbGN1bGF0ZVBhY2tldExlbmd0aEFmdGVyWmVyb0xlbmd0aEJpdChcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyKTtcclxuICAgICAgICBpZiAoYm9keUxlbmd0aCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhlYWRlckVuZE9mZnNldCA9IGJpdHN0cmVhbVJlYWRlci5kYXRhYmluT2Zmc2V0O1xyXG4gICAgICAgIGJvZHlMZW5ndGguaGVhZGVyTGVuZ3RoID0gaGVhZGVyRW5kT2Zmc2V0IC0gaGVhZGVyU3RhcnRPZmZzZXQ7XHJcblxyXG4gICAgICAgIGJvZHlMZW5ndGguaGVhZGVyU3RhcnRPZmZzZXQgPSBoZWFkZXJTdGFydE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYm9keUxlbmd0aDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWN0dWFsQ2FsY3VsYXRlUGFja2V0TGVuZ3RoQWZ0ZXJaZXJvTGVuZ3RoQml0KHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIHZhciBib2R5Qnl0ZXMgPSAwO1xyXG4gICAgICAgIHZhciBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgc3ViYmFuZCA9IDA7IHN1YmJhbmQgPCBzdWJiYW5kUGFyc2Vycy5sZW5ndGg7ICsrc3ViYmFuZCkge1xyXG4gICAgICAgICAgICB2YXIgcGFyc2VyID0gc3ViYmFuZFBhcnNlcnNbc3ViYmFuZF07XHJcbiAgICAgICAgICAgIHZhciBzdWJiYW5kQm9keUxlbmd0aCA9IHBhcnNlci5jYWxjdWxhdGVTdWJiYW5kTGVuZ3RoKHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoc3ViYmFuZEJvZHlMZW5ndGggPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXggPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4ID1cclxuICAgICAgICAgICAgICAgICAgICBzdWJiYW5kQm9keUxlbmd0aC5jb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleDtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4ID0gY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXguY29uY2F0KFxyXG4gICAgICAgICAgICAgICAgICAgIHN1YmJhbmRCb2R5TGVuZ3RoLmNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYm9keUJ5dGVzICs9IHN1YmJhbmRCb2R5TGVuZ3RoLm92ZXJhbGxCb2R5TGVuZ3RoQnl0ZXM7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBiaXRzdHJlYW1SZWFkZXIuc2hpZnRSZW1haW5pbmdCaXRzSW5CeXRlKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCkge1xyXG4gICAgICAgICAgICB2YXIgaXNNYXJrZXIgPSBpc01hcmtlckhlcmUoMHg5Mik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaXNNYXJrZXIgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzTWFya2VyKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZW5kUGFja2V0SGVhZGVyTWFya2VyTGVuZ3RoID0gMjtcclxuICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5kYXRhYmluT2Zmc2V0ICs9IGVuZFBhY2tldEhlYWRlck1hcmtlckxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleDogY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXgsXHJcbiAgICAgICAgICAgIG92ZXJhbGxCb2R5TGVuZ3RoQnl0ZXM6IGJvZHlCeXRlc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRGdWxsUXVhbGl0eUxheWVyc0VuZE9mZnNldChtYXhOdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgdmFyIG51bVBhcnNlZFF1YWxpdHlMYXllciA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzLCBjYWxjdWxhdGVkTGVuZ3Rocy5sZW5ndGgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChudW1QYXJzZWRRdWFsaXR5TGF5ZXIgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIGVuZE9mZnNldDogc3RhcnRPZmZzZXRJbkRhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzOiAwXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGFzdFBhY2tldCA9IGNhbGN1bGF0ZWRMZW5ndGhzW251bVBhcnNlZFF1YWxpdHlMYXllciAtIDFdO1xyXG4gICAgICAgIHZhciBlbmRPZmZzZXQgPVxyXG4gICAgICAgICAgICBsYXN0UGFja2V0LmhlYWRlclN0YXJ0T2Zmc2V0ICtcclxuICAgICAgICAgICAgbGFzdFBhY2tldC5oZWFkZXJMZW5ndGggK1xyXG4gICAgICAgICAgICBsYXN0UGFja2V0Lm92ZXJhbGxCb2R5TGVuZ3RoQnl0ZXM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgZW5kT2Zmc2V0OiBlbmRPZmZzZXQsXHJcbiAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnM6IG51bVBhcnNlZFF1YWxpdHlMYXllclxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGluaXRTdWJiYW5kUGFyc2VycygpIHtcclxuICAgICAgICB2YXIgbnVtU3ViYmFuZHMgPSBwcmVjaW5jdC5yZXNvbHV0aW9uTGV2ZWwgPT09IDAgPyAxIDogMztcclxuICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1TdWJiYW5kczsgKytpKSB7XHJcbiAgICAgICAgICAgIHZhciBudW1Db2RlYmxvY2tzWEluU3ViYmFuZDtcclxuICAgICAgICAgICAgdmFyIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kO1xyXG4gICAgICAgICAgICBpZiAocHJlY2luY3QucmVzb2x1dGlvbkxldmVsID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBudW1Db2RlYmxvY2tzWEluU3ViYmFuZCA9IG51bUNvZGVibG9ja3NYO1xyXG4gICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQgPSBudW1Db2RlYmxvY2tzWTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIFRyZWF0IHRoZSBlZGdlIGNhc2Ugb2Ygc2luZ2xlIHJlZHVuZGFudCBwaXhlbHMgY29sdW1uXHJcbiAgICAgICAgICAgICAgICAvLyAoSW4gb3RoZXIgY2FzZXMsIG51bUNvZGVibG9ja3NYIGlzIGZ1bGwgZHVwbGljYXRpb24gb2YgMi5cclxuICAgICAgICAgICAgICAgIC8vIFNlZSBKcGlwQ29tcG9uZW50U3RydWN0dXJlIGltcGxlbWVudGF0aW9uKS5cclxuICAgICAgICAgICAgICAgIGlmIChpID09PSAxKSB7IC8vIExIXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQgPSBNYXRoLmNlaWwobnVtQ29kZWJsb2Nrc1ggLyAyKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7IC8vIEhMIG9yIEhIXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQgPSBNYXRoLmZsb29yKG51bUNvZGVibG9ja3NYIC8gMik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIFRyZWF0IHRoZSBlZGdlIGNhc2Ugb2Ygc2luZ2xlIHJlZHVuZGFudCBwaXhlbHMgcm93XHJcbiAgICAgICAgICAgICAgICAvLyAoSW4gb3RoZXIgY2FzZXMsIG51bUNvZGVibG9ja3NZIGlzIGZ1bGwgZHVwbGljYXRpb24gb2YgMi5cclxuICAgICAgICAgICAgICAgIC8vIFNlZSBKcGlwQ29tcG9uZW50U3RydWN0dXJlIGltcGxlbWVudGF0aW9uKS5cclxuICAgICAgICAgICAgICAgIGlmIChpID09PSAwKSB7IC8vIEhMXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQgPSBNYXRoLmNlaWwobnVtQ29kZWJsb2Nrc1kgLyAyKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7IC8vIExIIG9yIEhIXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQgPSBNYXRoLmZsb29yKG51bUNvZGVibG9ja3NZIC8gMik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChudW1Db2RlYmxvY2tzWEluU3ViYmFuZCA9PT0gMCB8fCBudW1Db2RlYmxvY2tzWUluU3ViYmFuZCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGpwaXBGYWN0b3J5LmNyZWF0ZVN1YmJhbmRMZW5ndGhJblBhY2tldEhlYWRlckNhbGN1bGF0b3IoXHJcbiAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsXHJcbiAgICAgICAgICAgICAgICBudW1Db2RlYmxvY2tzWEluU3ViYmFuZCxcclxuICAgICAgICAgICAgICAgIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGlzTWFya2VySGVyZShtYXJrZXJTZWNvbmRCeXRlKSB7XHJcbiAgICAgICAgdmFyIHBvc3NpYmxlTWFya2VyID0gbmV3IEFycmF5KDIpO1xyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW4uY29weUJ5dGVzKFxyXG4gICAgICAgICAgICBwb3NzaWJsZU1hcmtlcixcclxuICAgICAgICAgICAgLypyZXN1bHRTdGFydE9mZnNldD0qLzAsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogYml0c3RyZWFtUmVhZGVyLmRhdGFiaW5PZmZzZXQsXHJcbiAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IDIsXHJcbiAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogZmFsc2VcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChieXRlc0NvcGllZCkge1xyXG4gICAgICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICAgICAgICB2YXIgaXNNYXJrZXIgPVxyXG4gICAgICAgICAgICAgICAgICAgIHBvc3NpYmxlTWFya2VyWzBdID09PSAweEZGICYmXHJcbiAgICAgICAgICAgICAgICAgICAgcG9zc2libGVNYXJrZXJbMV0gPT09IG1hcmtlclNlY29uZEJ5dGU7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiBpc01hcmtlcjtcclxuXHJcbiAgICAgICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgICAgIGlmIChwb3NzaWJsZU1hcmtlclswXSA9PT0gMHhGRikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjaGVja1N1cHBvcnRlZFN0cnVjdHVyZSgpIHtcclxuICAgICAgICBpZiAoIWlzUGFja2V0SGVhZGVyTmVhckRhdGEpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdQUE0gb3IgUFBUJywgJ0EuNy40IGFuZCBBLjcuNScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwUXVhbGl0eUxheWVyc0NhY2hlID0gZnVuY3Rpb24gSnBpcFF1YWxpdHlMYXllcnNDYWNoZShcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGpwaXBGYWN0b3J5KSB7XHJcbiAgICBcclxuICAgIHZhciBDQUNIRV9LRVkgPSAncGFja2V0TGVuZ3RoQ2FsY3VsYXRvcic7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UGFja2V0T2Zmc2V0c0J5Q29kZWJsb2NrSW5kZXggPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldFBhY2tldE9mZnNldHNCeUNvZGVibG9ja0luZGV4KFxyXG4gICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sIHF1YWxpdHlMYXllciwgcHJlY2luY3RQb3NpdGlvbikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yID0gZ2V0UGFja2V0UGFyc2VyKFxyXG4gICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sIHByZWNpbmN0UG9zaXRpb24pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gcGFja2V0TGVuZ3RoQ2FsY3VsYXRvci5nZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleChcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRRdWFsaXR5TGF5ZXJPZmZzZXQgPSBmdW5jdGlvbiBnZXRRdWFsaXR5TGF5ZXJPZmZzZXQoXHJcbiAgICAgICAgcHJlY2luY3REYXRhYmluLCBtYXhOdW1RdWFsaXR5TGF5ZXJzLCBwcmVjaW5jdFBvc2l0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxvYWRlZFJhbmdlcyA9IHByZWNpbmN0RGF0YWJpbi5nZXRFeGlzdGluZ1JhbmdlcygpO1xyXG4gICAgICAgIHZhciBlbmRPZmZzZXRMb2FkZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhY2tldExlbmd0aENhbGN1bGF0b3IgPSBnZXRQYWNrZXRQYXJzZXIoXHJcbiAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgcHJlY2luY3RQb3NpdGlvbik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChsb2FkZWRSYW5nZXMubGVuZ3RoIDwgMSB8fCBsb2FkZWRSYW5nZXNbMF0uc3RhcnQgPiAwKSB7XHJcbiAgICAgICAgICAgIGVuZE9mZnNldExvYWRlZCA9IDA7XHJcbiAgICAgICAgICAgIG1heE51bVF1YWxpdHlMYXllcnMgPSAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGVuZE9mZnNldExvYWRlZCA9IGxvYWRlZFJhbmdlc1swXS5zdGFydCArIGxvYWRlZFJhbmdlc1swXS5sZW5ndGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsYXllcnNJblByZWNpbmN0ID1cclxuICAgICAgICAgICAgcGFja2V0TGVuZ3RoQ2FsY3VsYXRvci5jYWxjdWxhdGVFbmRPZmZzZXRPZkxhc3RGdWxsUGFja2V0KFxyXG4gICAgICAgICAgICAgICAgbWF4TnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGVuZE9mZnNldExvYWRlZCA8IGxheWVyc0luUHJlY2luY3QuZW5kT2Zmc2V0KSB7XHJcbiAgICAgICAgICAgIHZhciByZWR1Y2VkTGF5ZXJzVG9TZWFyY2ggPSBsYXllcnNJblByZWNpbmN0Lm51bVF1YWxpdHlMYXllcnMgLSAxO1xyXG4gICAgICAgICAgICBsYXllcnNJblByZWNpbmN0ID0gcGFja2V0TGVuZ3RoQ2FsY3VsYXRvclxyXG4gICAgICAgICAgICAgICAgLmNhbGN1bGF0ZUVuZE9mZnNldE9mTGFzdEZ1bGxQYWNrZXQocmVkdWNlZExheWVyc1RvU2VhcmNoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGxheWVyc0luUHJlY2luY3Q7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGdldFBhY2tldFBhcnNlcihwcmVjaW5jdERhdGFiaW4sIHByZWNpbmN0UG9zaXRpb24pIHtcclxuICAgICAgICB2YXIgcGFja2V0TGVuZ3RoQ2FsY3VsYXRvckNvbnRhaW5lciA9XHJcbiAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbi5nZXRDYWNoZWREYXRhKENBQ0hFX0tFWSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBhY2tldExlbmd0aENhbGN1bGF0b3JDb250YWluZXIuY2FsY3VsYXRvciAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yQ29udGFpbmVyLmNhbGN1bGF0b3I7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcmVjaW5jdFBvc2l0aW9uID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ3ByZWNpbmN0UG9zaXRpb24gJyArXHJcbiAgICAgICAgICAgICAgICAnc2hvdWxkIGJlIGdpdmVuIG9uIHRoZSBmaXJzdCB0aW1lIG9mIHVzaW5nIFF1YWxpdHlMYXllcnNDYWNoZSAnICtcclxuICAgICAgICAgICAgICAgICdvbiB0aGlzIHByZWNpbmN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlU3RydWN0dXJlID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlU3RydWN0dXJlKFxyXG4gICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnRpbGVJbmRleCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IHRpbGVTdHJ1Y3R1cmUuZ2V0Q29tcG9uZW50U3RydWN0dXJlKFxyXG4gICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHBhY2tldExlbmd0aENhbGN1bGF0b3JDb250YWluZXIuY2FsY3VsYXRvciA9XHJcbiAgICAgICAgICAgIGpwaXBGYWN0b3J5LmNyZWF0ZVBhY2tldExlbmd0aENhbGN1bGF0b3IoXHJcbiAgICAgICAgICAgICAgICB0aWxlU3RydWN0dXJlLFxyXG4gICAgICAgICAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgLypzdGFydE9mZnNldEluRGF0YWJpbj0qLzAsXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcGFja2V0TGVuZ3RoQ2FsY3VsYXRvckNvbnRhaW5lci5jYWxjdWxhdG9yO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yID1cclxuICAgIGZ1bmN0aW9uIEpwaXBTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yKFxyXG4gICAgICAgIGJpdHN0cmVhbVJlYWRlcixcclxuICAgICAgICBudW1Db2RlYmxvY2tzWCxcclxuICAgICAgICBudW1Db2RlYmxvY2tzWSxcclxuICAgICAgICBjb2RpbmdQYXNzZXNOdW1iZXJQYXJzZXIsXHJcbiAgICAgICAgdHJhbnNhY3Rpb25IZWxwZXIsXHJcbiAgICAgICAganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdmFyIGNvZGVibG9ja0xlbmd0aFBhcnNlcnMgPSBudWxsO1xyXG4gICAgdmFyIGlzQ29kZWJsb2Nrc0luY2x1ZGVkID0gbnVsbDtcclxuICAgIHZhciBwYXJzZWRRdWFsaXR5TGF5ZXJzID0gdHJhbnNhY3Rpb25IZWxwZXIuY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdChcclxuICAgICAgICAwLCAvKmlzVmFsdWVUeXBlPSovdHJ1ZSk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgaW5jbHVzaW9uVHJlZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZVRhZ1RyZWUoXHJcbiAgICAgICAgYml0c3RyZWFtUmVhZGVyLCBudW1Db2RlYmxvY2tzWCwgbnVtQ29kZWJsb2Nrc1kpO1xyXG4gICAgXHJcbiAgICB2YXIgemVyb0JpdFBsYW5lc1RyZWUgPSBqcGlwRmFjdG9yeS5jcmVhdGVUYWdUcmVlKFxyXG4gICAgICAgIGJpdHN0cmVhbVJlYWRlciwgbnVtQ29kZWJsb2Nrc1gsIG51bUNvZGVibG9ja3NZKTtcclxuICAgIFxyXG4gICAgdGhpcy5jYWxjdWxhdGVTdWJiYW5kTGVuZ3RoID0gZnVuY3Rpb24gY2FsY3VhbHRlU3ViYmFuZExlbmd0aChxdWFsaXR5TGF5ZXIpIHtcclxuICAgICAgICBlbnN1cmVRdWFsaXR5TGF5ZXJOb3RQYXJzZWRZZXQocXVhbGl0eUxheWVyKTtcclxuICAgICAgICBcclxuICAgICAgICBsYXp5SW5pdEFycmF5cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGluY2x1c2lvblRyZWUuc2V0TWluaW1hbFZhbHVlSWZOb3RSZWFkQml0cyhxdWFsaXR5TGF5ZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhY2N1bXVsYXRlZEJvZHlMZW5ndGhCeXRlcyA9IDA7XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja0luZGV4ID0gMDtcclxuICAgICAgICB2YXIgY29kZWJsb2NrTGVuZ3RoQnlJbmRleCA9IG5ldyBBcnJheShudW1Db2RlYmxvY2tzWCAqIG51bUNvZGVibG9ja3NZKTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IG51bUNvZGVibG9ja3NZOyArK3kpIHtcclxuICAgICAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCBudW1Db2RlYmxvY2tzWDsgKyt4KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgY29kZWJsb2NrQm9keUxlbmd0aCA9IGdldE5leHRDb2RlYmxvY2tMZW5ndGgoeCwgeSwgcXVhbGl0eUxheWVyKTtcclxuICAgICAgICAgICAgICAgIGlmIChjb2RlYmxvY2tCb2R5TGVuZ3RoID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja0xlbmd0aEJ5SW5kZXhbY29kZWJsb2NrSW5kZXgrK10gPSBjb2RlYmxvY2tCb2R5TGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBhY2N1bXVsYXRlZEJvZHlMZW5ndGhCeXRlcyArPVxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGguY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHBhcnNlZFF1YWxpdHlMYXllcnMuc2V0VmFsdWUoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbiwgcXVhbGl0eUxheWVyICsgMSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXg6IGNvZGVibG9ja0xlbmd0aEJ5SW5kZXgsXHJcbiAgICAgICAgICAgIG92ZXJhbGxCb2R5TGVuZ3RoQnl0ZXM6IGFjY3VtdWxhdGVkQm9keUxlbmd0aEJ5dGVzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBlbnN1cmVRdWFsaXR5TGF5ZXJOb3RQYXJzZWRZZXQocXVhbGl0eUxheWVyKSB7XHJcbiAgICAgICAgdmFyIHBhcnNlZFF1YWxpdHlMYXllcnNWYWx1ZSA9IHBhcnNlZFF1YWxpdHlMYXllcnMuZ2V0VmFsdWUoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBhcnNlZFF1YWxpdHlMYXllcnNWYWx1ZSA+PSBxdWFsaXR5TGF5ZXIgKyAxKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ1VuZXhwZWN0ZWQgcXVhbGl0eSBsYXllciB0byBwYXJzZScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gbGF6eUluaXRBcnJheXMoKSB7XHJcbiAgICAgICAgaWYgKGNvZGVibG9ja0xlbmd0aFBhcnNlcnMgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb2RlYmxvY2tMZW5ndGhQYXJzZXJzID0gbmV3IEFycmF5KG51bUNvZGVibG9ja3NYKTtcclxuICAgICAgICBpc0NvZGVibG9ja3NJbmNsdWRlZCA9IG5ldyBBcnJheShudW1Db2RlYmxvY2tzWCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCBudW1Db2RlYmxvY2tzWDsgKyt4KSB7XHJcbiAgICAgICAgICAgIGNvZGVibG9ja0xlbmd0aFBhcnNlcnNbeF0gPSBuZXcgQXJyYXkobnVtQ29kZWJsb2Nrc1kpO1xyXG4gICAgICAgICAgICBpc0NvZGVibG9ja3NJbmNsdWRlZFt4XSA9IG5ldyBBcnJheShudW1Db2RlYmxvY2tzWSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IG51bUNvZGVibG9ja3NZOyArK3kpIHtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja0xlbmd0aFBhcnNlcnNbeF1beV0gPVxyXG4gICAgICAgICAgICAgICAgICAgIGpwaXBGYWN0b3J5LmNyZWF0ZUNvZGVibG9ja0xlbmd0aFBhcnNlcihcclxuICAgICAgICAgICAgICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLCB0cmFuc2FjdGlvbkhlbHBlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpc0NvZGVibG9ja3NJbmNsdWRlZFt4XVt5XSA9IHRyYW5zYWN0aW9uSGVscGVyXHJcbiAgICAgICAgICAgICAgICAgICAgLmNyZWF0ZVRyYW5zYWN0aW9uYWxPYmplY3QoeyBpc0luY2x1ZGVkOiBmYWxzZSB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TmV4dENvZGVibG9ja0xlbmd0aCh4LCB5LCBxdWFsaXR5TGF5ZXIpIHtcclxuICAgICAgICB2YXIgaXNDb2RlYmxvY2tBbHJlYWR5SW5jbHVkZWQgPSBpc0NvZGVibG9ja3NJbmNsdWRlZFt4XVt5XS5nZXRWYWx1ZShcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNDb2RlYmxvY2tJbmNsdWRlZE5vdztcclxuICAgICAgICBpZiAoaXNDb2RlYmxvY2tBbHJlYWR5SW5jbHVkZWQuaXNJbmNsdWRlZCkge1xyXG4gICAgICAgICAgICBpc0NvZGVibG9ja0luY2x1ZGVkTm93ID0gYml0c3RyZWFtUmVhZGVyLnNoaWZ0Qml0KCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaXNDb2RlYmxvY2tJbmNsdWRlZE5vdyA9IGluY2x1c2lvblRyZWUuaXNTbWFsbGVyVGhhbk9yRXF1YWxzVG8oXHJcbiAgICAgICAgICAgICAgICB4LCB5LCBxdWFsaXR5TGF5ZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzQ29kZWJsb2NrSW5jbHVkZWROb3cgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfSBlbHNlIGlmICghaXNDb2RlYmxvY2tJbmNsdWRlZE5vdykge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzOiAwLFxyXG4gICAgICAgICAgICAgICAgY29kaW5nUGFzc2VzOiAwXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgemVyb0JpdFBsYW5lcyA9IG51bGw7XHJcbiAgICAgICAgaWYgKCFpc0NvZGVibG9ja0FscmVhZHlJbmNsdWRlZC5pc0luY2x1ZGVkKSB7XHJcbiAgICAgICAgICAgIHplcm9CaXRQbGFuZXMgPSB6ZXJvQml0UGxhbmVzVHJlZS5nZXRWYWx1ZSh4LCB5KTtcclxuICAgICAgICAgICAgaWYgKHplcm9CaXRQbGFuZXMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2RpbmdQYXNzZXMgPSBjb2RpbmdQYXNzZXNOdW1iZXJQYXJzZXIucGFyc2UoYml0c3RyZWFtUmVhZGVyKTtcclxuICAgICAgICBpZiAoY29kaW5nUGFzc2VzID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGVuZ3RoUGFyc2VyID0gY29kZWJsb2NrTGVuZ3RoUGFyc2Vyc1t4XVt5XTtcclxuICAgICAgICB2YXIgYm9keUxlbmd0aEJ5dGVzID0gbGVuZ3RoUGFyc2VyLnBhcnNlKGNvZGluZ1Bhc3Nlcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGJvZHlMZW5ndGhCeXRlcyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaXNDb2RlYmxvY2tBbHJlYWR5SW5jbHVkZWQuaXNJbmNsdWRlZCA9IHRydWU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzOiBib2R5TGVuZ3RoQnl0ZXMsXHJcbiAgICAgICAgICAgIGNvZGluZ1Bhc3NlczogY29kaW5nUGFzc2VzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHplcm9CaXRQbGFuZXMgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmVzdWx0Lnplcm9CaXRQbGFuZXMgPSB6ZXJvQml0UGxhbmVzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBUYWdUcmVlID0gZnVuY3Rpb24gSnBpcFRhZ1RyZWUoXHJcbiAgICBiaXRzdHJlYW1SZWFkZXIsIHdpZHRoLCBoZWlnaHQsIHRyYW5zYWN0aW9uSGVscGVyKSB7XHJcbiAgICBcclxuICAgIHZhciBpc0FscmVhZHlSZWFkQml0c1RyYW5zYWN0aW9uYWxPYmplY3QgPVxyXG4gICAgICAgIHRyYW5zYWN0aW9uSGVscGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxPYmplY3QoZmFsc2UsIC8qaXNWYWx1ZVR5cGU9Ki90cnVlKTtcclxuICAgIHZhciBsZXZlbHM7XHJcbiAgICBcclxuICAgIGNyZWF0ZUxldmVsc0FycmF5KCk7XHJcbiAgICAgICAgXHJcbiAgICB0aGlzLnNldE1pbmltYWxWYWx1ZUlmTm90UmVhZEJpdHMgPSBmdW5jdGlvbiBzZXRNaW5pbWFsVmFsdWVJZk5vdFJlYWRCaXRzKFxyXG4gICAgICAgIG1pbmltYWxWYWx1ZSkge1xyXG4gICAgXHJcbiAgICAgICAgaWYgKGlzQWxyZWFkeVJlYWRCaXRzKCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdHJhbnNhY3Rpb25hbE9iamVjdCA9IGxldmVsc1swXS5jb250ZW50WzBdO1xyXG4gICAgICAgIHZhciBub2RlID0gdHJhbnNhY3Rpb25hbE9iamVjdC5nZXRWYWx1ZShcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICBcclxuICAgICAgICBub2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlID0gbWluaW1hbFZhbHVlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5pc1NtYWxsZXJUaGFuT3JFcXVhbHNUbyA9IGZ1bmN0aW9uIGlzU21hbGxlclRoYW5PckVxdWFsc1RvKFxyXG4gICAgICAgIHgsIHksIHZhbHVlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2V0QWxyZWFkeVJlYWRCaXRzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGdldE5leHROb2RlID0gZ2V0Um9vdFRvTGVhZkl0ZXJhdG9yKHgsIHkpO1xyXG4gICAgICAgIHZhciBjdXJyZW50Tm9kZSA9IGdldE5leHROb2RlKCk7XHJcbiAgICAgICAgdmFyIGxhc3ROb2RlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChjdXJyZW50Tm9kZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudE5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWUgPiB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWN1cnJlbnROb2RlLmlzRmluYWxWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIG1heEJpdHNUb1NoaWZ0ID0gdmFsdWUgLSBjdXJyZW50Tm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZSArIDE7XHJcbiAgICAgICAgICAgICAgICB2YXIgYWRkVG9WYWx1ZSA9IGJpdHN0cmVhbVJlYWRlci5jb3VudFplcm9zQW5kU2hpZnRVbnRpbEZpcnN0T25lQml0KFxyXG4gICAgICAgICAgICAgICAgICAgIG1heEJpdHNUb1NoaWZ0KTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChhZGRUb1ZhbHVlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGN1cnJlbnROb2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlICs9IGFkZFRvVmFsdWU7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChhZGRUb1ZhbHVlIDwgbWF4Qml0c1RvU2hpZnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50Tm9kZS5pc0ZpbmFsVmFsdWUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsYXN0Tm9kZSA9IGN1cnJlbnROb2RlO1xyXG4gICAgICAgICAgICBjdXJyZW50Tm9kZSA9IGdldE5leHROb2RlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSBsYXN0Tm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZSA8PSB2YWx1ZTtcclxuICAgICAgICBpZiAocmVzdWx0ICYmICFsYXN0Tm9kZS5pc0ZpbmFsVmFsdWUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnV3JvbmcgcGFyc2luZyBpbiBUYWdUcmVlLmlzU21hbGxlclRoYW5PckVxdWFsc1RvOiAnICtcclxuICAgICAgICAgICAgICAgICdub3Qgc3VyZSBpZiB2YWx1ZSBpcyBzbWFsbGVyIHRoYW4gYXNrZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VmFsdWUgPSBmdW5jdGlvbiBnZXRWYWx1ZSh4LCB5KSB7XHJcbiAgICAgICAgdmFyIGdldE5leHROb2RlID0gZ2V0Um9vdFRvTGVhZkl0ZXJhdG9yKHgsIHkpO1xyXG4gICAgICAgIHZhciBjdXJyZW50Tm9kZSA9IGdldE5leHROb2RlKCk7XHJcbiAgICAgICAgdmFyIGxlYWY7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2V0QWxyZWFkeVJlYWRCaXRzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGN1cnJlbnROb2RlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGlmICghY3VycmVudE5vZGUuaXNGaW5hbFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgYWRkVG9WYWx1ZSA9XHJcbiAgICAgICAgICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmNvdW50WmVyb3NBbmRTaGlmdFVudGlsRmlyc3RPbmVCaXQoKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGFkZFRvVmFsdWUgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50Tm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZSArPSBhZGRUb1ZhbHVlO1xyXG4gICAgICAgICAgICAgICAgY3VycmVudE5vZGUuaXNGaW5hbFZhbHVlID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbGVhZiA9IGN1cnJlbnROb2RlO1xyXG4gICAgICAgICAgICBjdXJyZW50Tm9kZSA9IGdldE5leHROb2RlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBsZWFmLm1pbmltYWxQb3NzaWJsZVZhbHVlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlTGV2ZWxzQXJyYXkoKSB7XHJcbiAgICAgICAgbGV2ZWxzID0gW107XHJcbiAgICAgICAgdmFyIGxldmVsV2lkdGggPSB3aWR0aDtcclxuICAgICAgICB2YXIgbGV2ZWxIZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGxldmVsV2lkdGggPj0gMSB8fCBsZXZlbEhlaWdodCA+PSAxKSB7XHJcbiAgICAgICAgICAgIGxldmVsV2lkdGggPSBNYXRoLmNlaWwobGV2ZWxXaWR0aCk7XHJcbiAgICAgICAgICAgIGxldmVsSGVpZ2h0ID0gTWF0aC5jZWlsKGxldmVsSGVpZ2h0KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBlbGVtZW50Q291bnQgPSBsZXZlbFdpZHRoICogbGV2ZWxIZWlnaHQ7XHJcbiAgICAgICAgICAgIGxldmVscy51bnNoaWZ0KHtcclxuICAgICAgICAgICAgICAgIHdpZHRoOiBsZXZlbFdpZHRoLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBsZXZlbEhlaWdodCxcclxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IG5ldyBBcnJheShlbGVtZW50Q291bnQpXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxldmVsV2lkdGggLz0gMjtcclxuICAgICAgICAgICAgbGV2ZWxIZWlnaHQgLz0gMjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaW5pdE5vZGUoMCwgMCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFJvb3RUb0xlYWZJdGVyYXRvcih4LCB5KSB7XHJcbiAgICAgICAgdmFyIGxldmVsID0gMDtcclxuICAgICAgICB2YXIgcHJldkl0ZXJhdGVkTm9kZSA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0TmV4dCgpIHtcclxuICAgICAgICAgICAgaWYgKGxldmVsID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnSXRlcmF0ZWQgdG9vIGRlZXAgaW4gdGFnIHRyZWUnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGxldmVsID09PSBsZXZlbHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICBsZXZlbCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHNoaWZ0RmFjdG9yID0gbGV2ZWxzLmxlbmd0aCAtIGxldmVsIC0gMTtcclxuICAgICAgICAgICAgdmFyIGN1cnJlbnRYID0gTWF0aC5mbG9vcih4ID4+IHNoaWZ0RmFjdG9yKTtcclxuICAgICAgICAgICAgdmFyIGN1cnJlbnRZID0gTWF0aC5mbG9vcih5ID4+IHNoaWZ0RmFjdG9yKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBpbmRleEluTGV2ZWwgPSBsZXZlbHNbbGV2ZWxdLndpZHRoICogY3VycmVudFkgKyBjdXJyZW50WDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciB0cmFuc2FjdGlvbmFsT2JqZWN0ID0gbGV2ZWxzW2xldmVsXS5jb250ZW50W2luZGV4SW5MZXZlbF07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAodHJhbnNhY3Rpb25hbE9iamVjdCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICB0cmFuc2FjdGlvbmFsT2JqZWN0ID0gaW5pdE5vZGUobGV2ZWwsIGluZGV4SW5MZXZlbCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSB0cmFuc2FjdGlvbmFsT2JqZWN0LmdldFZhbHVlKFxyXG4gICAgICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChwcmV2SXRlcmF0ZWROb2RlICE9PSBudWxsICYmXHJcbiAgICAgICAgICAgICAgICBwcmV2SXRlcmF0ZWROb2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlID4gcmVzdWx0Lm1pbmltYWxQb3NzaWJsZVZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5taW5pbWFsUG9zc2libGVWYWx1ZSA9IHByZXZJdGVyYXRlZE5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHByZXZJdGVyYXRlZE5vZGUgPSByZXN1bHQ7XHJcbiAgICAgICAgICAgICsrbGV2ZWw7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBnZXROZXh0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpbml0Tm9kZShsZXZlbCwgaW5kZXhJbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIG9iamVjdFZhbHVlID0ge1xyXG4gICAgICAgICAgICBtaW5pbWFsUG9zc2libGVWYWx1ZTogMCxcclxuICAgICAgICAgICAgaXNGaW5hbFZhbHVlOiBmYWxzZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgdHJhbnNhY3Rpb25hbE9iamVjdCA9IHRyYW5zYWN0aW9uSGVscGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxPYmplY3QoXHJcbiAgICAgICAgICAgIG9iamVjdFZhbHVlKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXZlbHNbbGV2ZWxdLmNvbnRlbnRbaW5kZXhJbkxldmVsXSA9IHRyYW5zYWN0aW9uYWxPYmplY3Q7XHJcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxPYmplY3Q7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGlzQWxyZWFkeVJlYWRCaXRzKCkge1xyXG4gICAgICAgIHZhciBpc0FscmVhZHlSZWFkQml0c1RyYW5zYWN0aW9uYWxWYWx1ZSA9XHJcbiAgICAgICAgICAgIGlzQWxyZWFkeVJlYWRCaXRzVHJhbnNhY3Rpb25hbE9iamVjdC5nZXRWYWx1ZShcclxuICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGlzQWxyZWFkeVJlYWRCaXRzVHJhbnNhY3Rpb25hbFZhbHVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBzZXRBbHJlYWR5UmVhZEJpdHMoKSB7XHJcbiAgICAgICAgaXNBbHJlYWR5UmVhZEJpdHNUcmFuc2FjdGlvbmFsT2JqZWN0LnNldFZhbHVlKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24sIHRydWUpO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLm11dHVhbEV4Y2x1c2l2ZVRyYW5zYWN0aW9uSGVscGVyID0ge1xyXG4gICAgY3JlYXRlVHJhbnNhY3Rpb246IGZ1bmN0aW9uIGNyZWF0ZVRyYW5zYWN0aW9uKCkge1xyXG4gICAgICAgIC8vIFRoaXMgY29kZSBpcyBleGVjdXRlZCBhIExPVC4gRm9yIG9wdGltaXphdGlvbiwgc3RhdGUgaXMgcmVwcmVzZW50ZWRcclxuICAgICAgICAvLyBkaXJlY3RseSBhcyBudW1iZXJzIChJIGNvdWxkbid0IHRoaW5rIGFib3V0IG1vcmUgcmVhZGFibGUgd2F5IHdoaWNoXHJcbiAgICAgICAgLy8gaXMgcGVyZm9ybWFuY2UtZXF1aXZhbGVudCkuXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gc3RhdGUgPSAxID09PiBUcmFuc2FjdGlvbiBpcyBhY3RpdmVcclxuICAgICAgICAvLyBzdGF0ZSA9IDIgPT0+IFRyYW5zYWN0aW9uIGhhcyBjb21taXR0ZWQgc3VjY2Vzc2Z1bGx5XHJcbiAgICAgICAgLy8gc3RhdGUgPSAzID09PiBUcmFuc2FjdGlvbiBoYXMgYmVlbiBhYm9ydGVkXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0YXRlID0gMTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdHJhbnNhY3Rpb24gPSB7XHJcbiAgICAgICAgICAgIGdldCBpc0Fib3J0ZWQoKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhdGUgPT09IDM7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBnZXQgaXNBY3RpdmUoKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhdGUgPT09IDE7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb21taXQ6IGZ1bmN0aW9uIGNvbW1pdCgpIHtcclxuICAgICAgICAgICAgICAgIHRlcm1pbmF0ZSh0cnVlKTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICBcclxuICAgICAgICAgICAgYWJvcnQ6IGZ1bmN0aW9uIGFib3J0KCkge1xyXG4gICAgICAgICAgICAgICAgdGVybWluYXRlKGZhbHNlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gdGVybWluYXRlKGlzU3VjY2Vzc2Z1bF8pIHtcclxuICAgICAgICAgICAgaWYgKCF0cmFuc2FjdGlvbi5pc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0Nhbm5vdCB0ZXJtaW5hdGUgYW4gYWxyZWFkeSB0ZXJtaW5hdGVkIHRyYW5zYWN0aW9uJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc3RhdGUgPSBpc1N1Y2Nlc3NmdWxfID8gMiA6IDM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gdHJhbnNhY3Rpb247XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVUcmFuc2FjdGlvbmFsT2JqZWN0OiBmdW5jdGlvbiBjb21taXRUcmFuc2FjdGlvbihcclxuICAgICAgICBpbml0aWFsVmFsdWUsIGlzVmFsdWVUeXBlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHZhbHVlID0gbnVsbDtcclxuICAgICAgICB2YXIgcHJldlZhbHVlID0gaW5pdGlhbFZhbHVlO1xyXG4gICAgICAgIHZhciBsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbiA9IHtcclxuICAgICAgICAgICAgaXNBY3RpdmU6IGZhbHNlLFxyXG4gICAgICAgICAgICBpc0Fib3J0ZWQ6IHRydWVcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB2YXIgY2xvbmUgPSBpc1ZhbHVlVHlwZSA/IGNsb25lVmFsdWVUeXBlIDogY2xvbmVCeUpTT047XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRyYW5zYWN0aW9uYWxPYmplY3QgPSB7XHJcbiAgICAgICAgICAgIGdldFZhbHVlOiBmdW5jdGlvbiBnZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbikge1xyXG4gICAgICAgICAgICAgICAgZW5zdXJlQWxsb3dlZEFjY2VzcyhhY3RpdmVUcmFuc2FjdGlvbik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uID09PSBhY3RpdmVUcmFuc2FjdGlvbikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uLmlzQWJvcnRlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gY2xvbmUocHJldlZhbHVlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcHJldlZhbHVlID0gY2xvbmUodmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uID0gYWN0aXZlVHJhbnNhY3Rpb247XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBzZXRWYWx1ZTogZnVuY3Rpb24gc2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24sIG5ld1ZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICBlbnN1cmVBbGxvd2VkQWNjZXNzKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24gPT09IGFjdGl2ZVRyYW5zYWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBuZXdWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmICghbGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24uaXNBYm9ydGVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcHJldlZhbHVlID0gY2xvbmUodmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbiA9IGFjdGl2ZVRyYW5zYWN0aW9uO1xyXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBuZXdWYWx1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gZW5zdXJlQWxsb3dlZEFjY2VzcyhhY3RpdmVUcmFuc2FjdGlvbikge1xyXG4gICAgICAgICAgICBpZiAoIWFjdGl2ZVRyYW5zYWN0aW9uLmlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ2Fubm90IHVzZSB0ZXJtaW5hdGVkIHRyYW5zYWN0aW9uIHRvIGFjY2VzcyBvYmplY3RzJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhY3RpdmVUcmFuc2FjdGlvbiAhPT0gbGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24gJiZcclxuICAgICAgICAgICAgICAgIGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uLmlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDYW5ub3Qgc2ltdWx0YW5vdXNseSBhY2Nlc3MgdHJhbnNhY3Rpb25hbCBvYmplY3QgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2Zyb20gdHdvIGFjdGl2ZSB0cmFuc2FjdGlvbnMnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBjbG9uZVZhbHVlVHlwZSh2YWx1ZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIGNsb25lQnlKU09OKHZhbHVlKSB7XHJcbiAgICAgICAgICAgIHZhciBuZXdWYWx1ZSA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTtcclxuICAgICAgICAgICAgcmV0dXJuIG5ld1ZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbE9iamVjdDtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwSW1hZ2VJbXBsZW1lbnRhdGlvbiA9IHJlcXVpcmUoJ2pwaXAtaW1hZ2UtaW1wbGVtZW50YXRpb24uanMnKS5KcGlwSW1hZ2VJbXBsZW1lbnRhdGlvbjtcclxubW9kdWxlLmV4cG9ydHMuSnBpcENvZGVzdHJlYW1DbGllbnQgPSByZXF1aXJlKCdqcGlwLWNvZGVzdHJlYW0tY2xpZW50LmpzJykuSnBpcENvZGVzdHJlYW1DbGllbnQ7XHJcbm1vZHVsZS5leHBvcnRzLkpwaXBDb2Rlc3RyZWFtU2l6ZXNDYWxjdWxhdG9yID0gcmVxdWlyZSgnanBpcC1jb2Rlc3RyZWFtLXNpemVzLWNhbGN1bGF0b3IuanMnKS5KcGlwQ29kZXN0cmVhbVNpemVzQ2FsY3VsYXRvcjtcclxubW9kdWxlLmV4cG9ydHMuUGRmanNKcHhEZWNvZGVyID0gcmVxdWlyZSgncGRmanMtanB4LWRlY29kZXIuanMnKS5QZGZqc0pweERlY29kZXI7XHJcbm1vZHVsZS5leHBvcnRzLmoya0V4Y2VwdGlvbnMgPSBqR2xvYmFscy5qMmtFeGNlcHRpb25zO1xyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucyA9IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zO1xyXG5tb2R1bGUuZXhwb3J0cy5JbnRlcm5hbHMgPSB7XHJcbiAgICBqcGlwUnVudGltZUZhY3Rvcnk6IHJlcXVpcmUoJ2pwaXAtcnVudGltZS1mYWN0b3J5LmpzJyksXHJcbiAgICBqR2xvYmFsczogakdsb2JhbHNcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwQ29kZXN0cmVhbVJlY29uc3RydWN0b3IgPSBmdW5jdGlvbiBKcGlwQ29kZXN0cmVhbVJlY29uc3RydWN0b3IoXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgZGF0YWJpbnNTYXZlcixcclxuICAgIGhlYWRlck1vZGlmaWVyLFxyXG4gICAgcXVhbGl0eUxheWVyc0NhY2hlKSB7XHJcbiAgICBcclxuICAgIHRoaXMucmVjb25zdHJ1Y3RDb2Rlc3RyZWFtID0gZnVuY3Rpb24gcmVjb25zdHJ1Y3RDb2Rlc3RyZWFtKFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgICAgdmFyIGN1cnJlbnRPZmZzZXQgPSBjcmVhdGVNYWluSGVhZGVyKHJlc3VsdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1UaWxlcyA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNYKCkgKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtUGFydDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobWluTnVtUXVhbGl0eUxheWVycyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMgPSAnbWF4JztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgdGlsZUlkID0gMDsgdGlsZUlkIDwgbnVtVGlsZXM7ICsrdGlsZUlkKSB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlQnl0ZXNDb3BpZWQgPSBjcmVhdGVUaWxlKFxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgICAgIHRpbGVJZCxcclxuICAgICAgICAgICAgICAgIHRpbGVJZCxcclxuICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0LFxyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IHRpbGVCeXRlc0NvcGllZDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh0aWxlQnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXJCeXRlc0NvcGllZCA9IGNvcHlCeXRlcyhcclxuICAgICAgICAgICAgcmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBqR2xvYmFscy5qMmtNYXJrZXJzLkVuZE9mQ29kZXN0cmVhbSk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBtYXJrZXJCeXRlc0NvcGllZDtcclxuICAgICAgICByZXN1bHQubGVuZ3RoID0gY3VycmVudE9mZnNldDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY3JlYXRlQ29kZXN0cmVhbUZvclJlZ2lvbiA9IGZ1bmN0aW9uIGNyZWF0ZUNvZGVzdHJlYW1Gb3JSZWdpb24oXHJcbiAgICAgICAgcGFyYW1zLCBtaW5OdW1RdWFsaXR5TGF5ZXJzLCBpc09ubHlIZWFkZXJzV2l0aG91dEJpdHN0cmVhbSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtID0gW107XHJcbiAgICAgICAgdmFyIGN1cnJlbnRPZmZzZXQgPSBjcmVhdGVNYWluSGVhZGVyKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtLCBwYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudE9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJZFRvV3JpdGUgPSAwO1xyXG4gICAgICAgIHZhciB0aWxlSXRlcmF0b3IgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVzSXRlcmF0b3IocGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RUaWxlSWQgPSB0aWxlSXRlcmF0b3IudGlsZUluZGV4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdFRpbGVMZWZ0ID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlTGVmdChcclxuICAgICAgICAgICAgZmlyc3RUaWxlSWQsIHBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIHZhciBmaXJzdFRpbGVUb3AgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVUb3AoXHJcbiAgICAgICAgICAgIGZpcnN0VGlsZUlkLCBwYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIG9mZnNldFggPSBwYXJhbXMubWluWCAtIGZpcnN0VGlsZUxlZnQ7XHJcbiAgICAgICAgdmFyIG9mZnNldFkgPSBwYXJhbXMubWluWSAtIGZpcnN0VGlsZVRvcDtcclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlSWRPcmlnaW5hbCA9IHRpbGVJdGVyYXRvci50aWxlSW5kZXg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgdGlsZUJ5dGVzQ29waWVkID0gY3JlYXRlVGlsZShcclxuICAgICAgICAgICAgICAgIGNvZGVzdHJlYW0sXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgdGlsZUlkVG9Xcml0ZSsrLFxyXG4gICAgICAgICAgICAgICAgdGlsZUlkT3JpZ2luYWwsXHJcbiAgICAgICAgICAgICAgICBwYXJhbXMsXHJcbiAgICAgICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzLFxyXG4gICAgICAgICAgICAgICAgaXNPbmx5SGVhZGVyc1dpdGhvdXRCaXRzdHJlYW0pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gdGlsZUJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBpZiAodGlsZUJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gd2hpbGUgKHRpbGVJdGVyYXRvci50cnlBZHZhbmNlKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXJCeXRlc0NvcGllZCA9IGNvcHlCeXRlcyhcclxuICAgICAgICAgICAgY29kZXN0cmVhbSwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5FbmRPZkNvZGVzdHJlYW0pO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gbWFya2VyQnl0ZXNDb3BpZWQ7XHJcblxyXG4gICAgICAgIGhlYWRlck1vZGlmaWVyLm1vZGlmeUltYWdlU2l6ZShjb2Rlc3RyZWFtLCBwYXJhbXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2Rlc3RyZWFtID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb2Rlc3RyZWFtLmxlbmd0aCA9IGN1cnJlbnRPZmZzZXQ7XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW06IGNvZGVzdHJlYW0sXHJcbiAgICAgICAgICAgIG9mZnNldFg6IG9mZnNldFgsXHJcbiAgICAgICAgICAgIG9mZnNldFk6IG9mZnNldFlcclxuICAgICAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY3JlYXRlQ29kZXN0cmVhbUZvclRpbGUgPSBmdW5jdGlvbiBjcmVhdGVDb2Rlc3RyZWFtRm9yVGlsZShcclxuICAgICAgICB0aWxlSWQsXHJcbiAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0LFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgbWF4TnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcclxuICAgICAgICB2YXIgY3VycmVudE9mZnNldCA9IGNyZWF0ZU1haW5IZWFkZXIocmVzdWx0LCBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50T2Zmc2V0ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUT0RPOiBEZWxldGUgdGhpcyBmdW5jdGlvbiBhbmQgdGVzdCBjcmVhdGVDb2Rlc3RyZWFtRm9yUmVnaW9uIGluc3RlYWRcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kZXN0cmVhbVBhcnRQYXJhbXMgPSB7XHJcbiAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dDogbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0LFxyXG4gICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzOiBtYXhOdW1RdWFsaXR5TGF5ZXJzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVCeXRlc0NvcGllZCA9IGNyZWF0ZVRpbGUoXHJcbiAgICAgICAgICAgIHJlc3VsdCxcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgLyp0aWxlSWRUb1dyaXRlPSovMCxcclxuICAgICAgICAgICAgLyp0aWxlSWRPcmlnaW5hbD0qL3RpbGVJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IHRpbGVCeXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGlsZUJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIG1hcmtlckJ5dGVzQ29waWVkID0gY29weUJ5dGVzKFxyXG4gICAgICAgICAgICByZXN1bHQsIGN1cnJlbnRPZmZzZXQsIGpHbG9iYWxzLmoya01hcmtlcnMuRW5kT2ZDb2Rlc3RyZWFtKTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IG1hcmtlckJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1UaWxlc1ggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgIHZhciB0aWxlWCA9IHRpbGVJZCAlIG51bVRpbGVzWDtcclxuICAgICAgICB2YXIgdGlsZVkgPSBNYXRoLmZsb29yKHRpbGVJZCAvIG51bVRpbGVzWCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaGVhZGVyTW9kaWZpZXIubW9kaWZ5SW1hZ2VTaXplKHJlc3VsdCwge1xyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQ6IG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCxcclxuICAgICAgICAgICAgbWluVGlsZVg6IHRpbGVYLFxyXG4gICAgICAgICAgICBtYXhUaWxlWEV4Y2x1c2l2ZTogdGlsZVggKyAxLFxyXG4gICAgICAgICAgICBtaW5UaWxlWTogdGlsZVksXHJcbiAgICAgICAgICAgIG1heFRpbGVZRXhjbHVzaXZlOiB0aWxlWSArIDFcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVzdWx0Lmxlbmd0aCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZU1haW5IZWFkZXIocmVzdWx0LCBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpIHtcclxuICAgICAgICBpZiAoZGF0YWJpbnNTYXZlci5nZXRJc0pwaXBUaWxlUGFydFN0cmVhbSgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAncmVjb25zdHJ1Y3Rpb24gb2YgY29kZXN0cmVhbSBmcm9tIEpQVCAoSnBpcCBUaWxlLXBhcnQpIHN0cmVhbScsICdBLjMuNCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFpbkhlYWRlciA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuICAgICAgICB2YXIgY3VycmVudE9mZnNldCA9IG1haW5IZWFkZXIuY29weUJ5dGVzKHJlc3VsdCwgLypzdGFydE9mZnNldD0qLzAsIHtcclxuICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWVcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0FkZGVkID0gaGVhZGVyTW9kaWZpZXIubW9kaWZ5TWFpbk9yVGlsZUhlYWRlcihcclxuICAgICAgICAgICAgcmVzdWx0LCBtYWluSGVhZGVyLCAvKm9mZnNldD0qLzAsIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0FkZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGJ5dGVzQWRkZWQgPSBhZGRNYW1hemF2Q29tbWVudChyZXN1bHQsIGN1cnJlbnRPZmZzZXQpO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNBZGRlZDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY3VycmVudE9mZnNldDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlVGlsZShcclxuICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICB0aWxlSWRUb1dyaXRlLFxyXG4gICAgICAgIHRpbGVJZE9yaWdpbmFsLFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgaXNPbmx5SGVhZGVyc1dpdGhvdXRCaXRzdHJlYW0pIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVN0cnVjdHVyZSA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVN0cnVjdHVyZShcclxuICAgICAgICAgICAgdGlsZUlkT3JpZ2luYWwpO1xyXG5cclxuICAgICAgICB2YXIgc3RhcnRUaWxlT2Zmc2V0ID0gY3VycmVudE9mZnNldDtcclxuICAgICAgICB2YXIgdGlsZUhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldFRpbGVIZWFkZXJEYXRhYmluKFxyXG4gICAgICAgICAgICB0aWxlSWRPcmlnaW5hbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dDtcclxuICAgICAgICBpZiAoY29kZXN0cmVhbVBhcnRQYXJhbXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQgPSBjb2Rlc3RyZWFtUGFydFBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlSGVhZGVyT2Zmc2V0cyA9IGNyZWF0ZVRpbGVIZWFkZXJBbmRHZXRPZmZzZXRzKFxyXG4gICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQsXHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJEYXRhYmluLFxyXG4gICAgICAgICAgICB0aWxlSWRUb1dyaXRlLFxyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzVG9DdXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlSGVhZGVyT2Zmc2V0cyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgPSB0aWxlSGVhZGVyT2Zmc2V0cy5lbmRUaWxlSGVhZGVyT2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNPbmx5SGVhZGVyc1dpdGhvdXRCaXRzdHJlYW0pIHtcclxuICAgICAgICAgICAgdmFyIHRpbGVCeXRlc0NvcGllZCA9IGNyZWF0ZVRpbGVCaXRzdHJlYW0oXHJcbiAgICAgICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgdGlsZVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgICAgIHRpbGVJZE9yaWdpbmFsLFxyXG4gICAgICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IHRpbGVCeXRlc0NvcGllZDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh0aWxlQnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgZW5kVGlsZU9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhlYWRlckFuZERhdGFMZW5ndGggPVxyXG4gICAgICAgICAgICBlbmRUaWxlT2Zmc2V0IC0gdGlsZUhlYWRlck9mZnNldHMuc3RhcnRPZlRpbGVIZWFkZXJPZmZzZXQ7XHJcblxyXG4gICAgICAgIGhlYWRlck1vZGlmaWVyLm1vZGlmeUludDMyKFxyXG4gICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJPZmZzZXRzLmhlYWRlckFuZERhdGFMZW5ndGhQbGFjZWhvbGRlck9mZnNldCxcclxuICAgICAgICAgICAgaGVhZGVyQW5kRGF0YUxlbmd0aCk7XHJcblxyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGVuZFRpbGVPZmZzZXQgLSBzdGFydFRpbGVPZmZzZXQ7XHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzQ29waWVkO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVUaWxlSGVhZGVyQW5kR2V0T2Zmc2V0cyhcclxuICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICB0aWxlSGVhZGVyRGF0YWJpbixcclxuICAgICAgICB0aWxlSWRUb1dyaXRlLFxyXG4gICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGFydE9mVGlsZUhlYWRlck9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICBcclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMoXHJcbiAgICAgICAgICAgIHJlc3VsdCwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5TdGFydE9mVGlsZSk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBLjQuMlxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGFydE9mVGlsZVNlZ21lbnRMZW5ndGggPSBbMCwgMTBdOyAvLyBMc290XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBzdGFydE9mVGlsZVNlZ21lbnRMZW5ndGgpO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJbmRleCA9IFt0aWxlSWRUb1dyaXRlID4+PiA4LCB0aWxlSWRUb1dyaXRlICYgMHhGRl07IC8vIElzb3RcclxuICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIHRpbGVJbmRleCk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaGVhZGVyQW5kRGF0YUxlbmd0aFBsYWNlaG9sZGVyT2Zmc2V0ID0gY3VycmVudE9mZnNldDtcclxuICAgICAgICB2YXIgaGVhZGVyQW5kRGF0YUxlbmd0aFBsYWNlaG9sZGVyID0gWzAsIDAsIDAsIDBdOyAvLyBQc290XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBoZWFkZXJBbmREYXRhTGVuZ3RoUGxhY2Vob2xkZXIpO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVQYXJ0SW5kZXggPSBbMF07IC8vIFRQc290XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCB0aWxlUGFydEluZGV4KTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1iZXJPZlRpbGVwYXJ0cyA9IFsxXTsgLy8gVE5zb3RcclxuICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIG51bWJlck9mVGlsZXBhcnRzKTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhZnRlclN0YXJ0T2ZUaWxlU2VnbWVudE9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSB0aWxlSGVhZGVyRGF0YWJpbi5jb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCB7XHJcbiAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIC8vIE5PVEU6IENhbiBjcmVhdGUgZW1wdHkgdGlsZVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzRW5kZWRXaXRoU3RhcnRPZkRhdGFNYXJrZXIgPVxyXG4gICAgICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCAtIDJdID09PSBqR2xvYmFscy5qMmtNYXJrZXJzLlN0YXJ0T2ZEYXRhWzBdICYmXHJcbiAgICAgICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0IC0gMV0gPT09IGpHbG9iYWxzLmoya01hcmtlcnMuU3RhcnRPZkRhdGFbMV07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmICghaXNFbmRlZFdpdGhTdGFydE9mRGF0YU1hcmtlcikge1xyXG4gICAgICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhcclxuICAgICAgICAgICAgICAgIHJlc3VsdCwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5TdGFydE9mRGF0YSk7XHJcbiAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0FkZGVkID0gaGVhZGVyTW9kaWZpZXIubW9kaWZ5TWFpbk9yVGlsZUhlYWRlcihcclxuICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICB0aWxlSGVhZGVyRGF0YWJpbixcclxuICAgICAgICAgICAgYWZ0ZXJTdGFydE9mVGlsZVNlZ21lbnRPZmZzZXQsXHJcbiAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0FkZGVkO1xyXG5cclxuICAgICAgICB2YXIgb2Zmc2V0cyA9IHtcclxuICAgICAgICAgICAgc3RhcnRPZlRpbGVIZWFkZXJPZmZzZXQ6IHN0YXJ0T2ZUaWxlSGVhZGVyT2Zmc2V0LFxyXG4gICAgICAgICAgICBoZWFkZXJBbmREYXRhTGVuZ3RoUGxhY2Vob2xkZXJPZmZzZXQ6IGhlYWRlckFuZERhdGFMZW5ndGhQbGFjZWhvbGRlck9mZnNldCxcclxuICAgICAgICAgICAgZW5kVGlsZUhlYWRlck9mZnNldDogY3VycmVudE9mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBvZmZzZXRzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVUaWxlQml0c3RyZWFtKFxyXG4gICAgICAgIHJlc3VsdCxcclxuICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgIHRpbGVTdHJ1Y3R1cmUsXHJcbiAgICAgICAgdGlsZUlkT3JpZ2luYWwsXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlID0gdGlsZVN0cnVjdHVyZS5nZXROdW1RdWFsaXR5TGF5ZXJzKCk7XHJcbiAgICAgICAgdmFyIG1heE51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gdGlsZVN0cnVjdHVyZS5nZXRQcmVjaW5jdEl0ZXJhdG9yKFxyXG4gICAgICAgICAgICB0aWxlSWRPcmlnaW5hbCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgIC8qaXNJdGVyYXRlUHJlY2luY3RzTm90SW5Db2Rlc3RyZWFtUGFydD0qL3RydWUpO1xyXG5cclxuICAgICAgICB2YXIgYWxsQnl0ZXNDb3BpZWQgPSAwO1xyXG4gICAgICAgIHZhciBoYXNNb3JlUGFja2V0cztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29kZXN0cmVhbVBhcnRQYXJhbXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzID0gY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4TnVtUXVhbGl0eUxheWVycztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnMgPT09ICdtYXgnKSB7XHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMgPSBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIHZhciBlbXB0eVBhY2tldHNUb1B1c2ggPSBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGl0ZXJhdG9yLmlzSW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGluQ2xhc3NJZCA9XHJcbiAgICAgICAgICAgICAgICAgICAgdGlsZVN0cnVjdHVyZS5wcmVjaW5jdFBvc2l0aW9uVG9JbkNsYXNzSW5kZXgoaXRlcmF0b3IpO1xyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0RGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0UHJlY2luY3REYXRhYmluKGluQ2xhc3NJZCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBxdWFsaXR5TGF5ZXJPZmZzZXQgPSBxdWFsaXR5TGF5ZXJzQ2FjaGUuZ2V0UXVhbGl0eUxheWVyT2Zmc2V0KFxyXG4gICAgICAgICAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbixcclxuICAgICAgICAgICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzLFxyXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGJ5dGVzVG9Db3B5ID0gcXVhbGl0eUxheWVyT2Zmc2V0LmVuZE9mZnNldDtcclxuICAgICAgICAgICAgICAgIGVtcHR5UGFja2V0c1RvUHVzaCA9XHJcbiAgICAgICAgICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyc0luVGlsZSAtIHF1YWxpdHlMYXllck9mZnNldC5udW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAocXVhbGl0eUxheWVyT2Zmc2V0Lm51bVF1YWxpdHlMYXllcnMgPCBtaW5OdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBieXRlc0NvcGllZCA9IHByZWNpbmN0RGF0YWJpbi5jb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBieXRlc1RvQ29weVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBieXRlc0NvcGllZCA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgZW1wdHlQYWNrZXRzVG9QdXNoID0gbnVtUXVhbGl0eUxheWVyc0luVGlsZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgYWxsQnl0ZXNDb3BpZWQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVtcHR5UGFja2V0c1RvUHVzaDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYWxsQnl0ZXNDb3BpZWQgKz0gZW1wdHlQYWNrZXRzVG9QdXNoO1xyXG4gICAgICAgIH1cclxuICAgICAgICB3aGlsZSAoaXRlcmF0b3IudHJ5QWR2YW5jZSgpKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYWxsQnl0ZXNDb3BpZWQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGFkZE1hbWF6YXZDb21tZW50KHJlc3VsdCwgY3VycmVudE9mZnNldCkge1xyXG4gICAgICAgIHZhciBzdGFydE9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICBcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDB4RkY7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAweDY0O1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMHgwMDtcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDB4MDk7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSA3NztcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDk3O1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMTA5O1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gOTc7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAxMjI7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSA5NztcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDExODtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNBZGRlZCA9IGN1cnJlbnRPZmZzZXQgLSBzdGFydE9mZnNldDtcclxuICAgICAgICByZXR1cm4gYnl0ZXNBZGRlZDtcclxuICAgIH1cclxuICAgICAgICBcclxuICAgIGZ1bmN0aW9uIGNvcHlCeXRlcyhyZXN1bHQsIHJlc3VsdFN0YXJ0T2Zmc2V0LCBieXRlc1RvQ29weSkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXNUb0NvcHkubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgcmVzdWx0W2kgKyByZXN1bHRTdGFydE9mZnNldF0gPSBieXRlc1RvQ29weVtpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzVG9Db3B5Lmxlbmd0aDtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5KcGlwSGVhZGVyTW9kaWZpZXIgPSBmdW5jdGlvbiBKcGlwSGVhZGVyTW9kaWZpZXIoXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBvZmZzZXRzQ2FsY3VsYXRvciwgcHJvZ3Jlc3Npb25PcmRlcikge1xyXG5cclxuICAgIHZhciBlbmNvZGVkUHJvZ3Jlc3Npb25PcmRlciA9IGVuY29kZVByb2dyZXNzaW9uT3JkZXIocHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICAgICAgXHJcbiAgICB0aGlzLm1vZGlmeU1haW5PclRpbGVIZWFkZXIgPSBmdW5jdGlvbiBtb2RpZnlNYWluT3JUaWxlSGVhZGVyKFxyXG4gICAgICAgIHJlc3VsdCwgb3JpZ2luYWxEYXRhYmluLCBkYXRhYmluT2Zmc2V0SW5SZXN1bHQsIG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1vZGlmeVByb2dyZXNzaW9uT3JkZXIocmVzdWx0LCBvcmlnaW5hbERhdGFiaW4sIGRhdGFiaW5PZmZzZXRJblJlc3VsdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG51bVJlc29sdXRpb25MZXZlbHNUb0N1dCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYmVzdFJlc29sdXRpb25MZXZlbHNSYW5nZXMgPVxyXG4gICAgICAgICAgICBvZmZzZXRzQ2FsY3VsYXRvci5nZXRSYW5nZXNPZkJlc3RSZXNvbHV0aW9uTGV2ZWxzRGF0YShcclxuICAgICAgICAgICAgICAgIG9yaWdpbmFsRGF0YWJpbiwgbnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYmVzdFJlc29sdXRpb25MZXZlbHNSYW5nZXMubnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIGRhdGFiaW5PZmZzZXRJblJlc3VsdCArXHJcbiAgICAgICAgICAgICAgICBiZXN0UmVzb2x1dGlvbkxldmVsc1Jhbmdlcy5udW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdFtvZmZzZXRdIC09IG51bVJlc29sdXRpb25MZXZlbHNUb0N1dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzUmVtb3ZlZCA9IHJlbW92ZVJhbmdlcyhcclxuICAgICAgICAgICAgcmVzdWx0LCBiZXN0UmVzb2x1dGlvbkxldmVsc1Jhbmdlcy5yYW5nZXMsIGRhdGFiaW5PZmZzZXRJblJlc3VsdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQWRkZWQgPSAtYnl0ZXNSZW1vdmVkO1xyXG4gICAgICAgIHJldHVybiBieXRlc0FkZGVkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5tb2RpZnlJbWFnZVNpemUgPSBmdW5jdGlvbiBtb2RpZnlJbWFnZVNpemUocmVzdWx0LCBjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG4gICAgICAgIHZhciBuZXdUaWxlV2lkdGggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVXaWR0aChcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICB2YXIgbmV3VGlsZUhlaWdodCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZUhlaWdodChcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc1RvQ3V0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbmV3UmVmZXJlbmNlR3JpZFNpemUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFNpemVPZlBhcnQoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6TWFya2VyT2Zmc2V0ID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0SW1hZ2VBbmRUaWxlU2l6ZU9mZnNldCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgPVxyXG4gICAgICAgICAgICBzaXpNYXJrZXJPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLlJFRkVSRU5DRV9HUklEX1NJWkVfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVI7XHJcblxyXG4gICAgICAgIHZhciBpbWFnZU9mZnNldEJ5dGVzT2Zmc2V0ID0gcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgKyA4O1xyXG4gICAgICAgIHZhciB0aWxlU2l6ZUJ5dGVzT2Zmc2V0ID0gcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgKyAxNjtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlT2Zmc2V0Qnl0ZXNPZmZzZXQgPSByZWZlcmVuY2VHcmlkU2l6ZU9mZnNldCArIDI0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQsIG5ld1JlZmVyZW5jZUdyaWRTaXplLndpZHRoKTtcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0ICsgNCwgbmV3UmVmZXJlbmNlR3JpZFNpemUuaGVpZ2h0KTtcclxuICAgICAgICBcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIHRpbGVTaXplQnl0ZXNPZmZzZXQsIG5ld1RpbGVXaWR0aCk7XHJcbiAgICAgICAgbW9kaWZ5SW50MzIocmVzdWx0LCB0aWxlU2l6ZUJ5dGVzT2Zmc2V0ICsgNCwgbmV3VGlsZUhlaWdodCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbW9kaWZ5SW50MzIocmVzdWx0LCBpbWFnZU9mZnNldEJ5dGVzT2Zmc2V0LCAwKTtcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIGltYWdlT2Zmc2V0Qnl0ZXNPZmZzZXQgKyA0LCAwKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgZmlyc3RUaWxlT2Zmc2V0Qnl0ZXNPZmZzZXQsIDApO1xyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgZmlyc3RUaWxlT2Zmc2V0Qnl0ZXNPZmZzZXQgKyA0LCAwKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMubW9kaWZ5SW50MzIgPSBtb2RpZnlJbnQzMjtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gbW9kaWZ5UHJvZ3Jlc3Npb25PcmRlcihyZXN1bHQsIG9yaWdpbmFsRGF0YWJpbiwgZGF0YWJpbk9mZnNldEluUmVzdWx0KSB7XHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlT2Zmc2V0ID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0Q29kaW5nU3R5bGVPZmZzZXQob3JpZ2luYWxEYXRhYmluKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29kaW5nU3R5bGVPZmZzZXQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdmFyIHByb2dyZXNzaW9uT3JkZXJPZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk9mZnNldEluUmVzdWx0ICsgY29kaW5nU3R5bGVPZmZzZXQgKyA1O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVzdWx0W3Byb2dyZXNzaW9uT3JkZXJPZmZzZXRdID0gZW5jb2RlZFByb2dyZXNzaW9uT3JkZXI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiByZW1vdmVSYW5nZXMocmVzdWx0LCByYW5nZXNUb1JlbW92ZSwgYWRkT2Zmc2V0KSB7XHJcbiAgICAgICAgaWYgKHJhbmdlc1RvUmVtb3ZlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gMDsgLy8gemVybyBieXRlcyByZW1vdmVkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzVG9SZW1vdmUubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIG9mZnNldCA9XHJcbiAgICAgICAgICAgICAgICBhZGRPZmZzZXQgK1xyXG4gICAgICAgICAgICAgICAgcmFuZ2VzVG9SZW1vdmVbaV0ubWFya2VyU2VnbWVudExlbmd0aE9mZnNldDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb3JpZ2luYWxNYXJrZXJTZWdtZW50TGVuZ3RoID1cclxuICAgICAgICAgICAgICAgIChyZXN1bHRbb2Zmc2V0XSA8PCA4KSArIHJlc3VsdFtvZmZzZXQgKyAxXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXdNYXJrZXJTZWdtZW50TGVuZ3RoID1cclxuICAgICAgICAgICAgICAgIG9yaWdpbmFsTWFya2VyU2VnbWVudExlbmd0aCAtIHJhbmdlc1RvUmVtb3ZlW2ldLmxlbmd0aDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdFtvZmZzZXRdID0gbmV3TWFya2VyU2VnbWVudExlbmd0aCA+Pj4gODtcclxuICAgICAgICAgICAgcmVzdWx0W29mZnNldCArIDFdID0gbmV3TWFya2VyU2VnbWVudExlbmd0aCAmIDB4RkY7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBvZmZzZXRUYXJnZXQgPSBhZGRPZmZzZXQgKyByYW5nZXNUb1JlbW92ZVswXS5zdGFydDtcclxuICAgICAgICB2YXIgb2Zmc2V0U291cmNlID0gb2Zmc2V0VGFyZ2V0O1xyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmFuZ2VzVG9SZW1vdmUubGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgb2Zmc2V0U291cmNlICs9IHJhbmdlc1RvUmVtb3ZlW2pdLmxlbmd0aDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXh0UmFuZ2VPZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgaiArIDEgPCByYW5nZXNUb1JlbW92ZS5sZW5ndGggP1xyXG4gICAgICAgICAgICAgICAgICAgIGFkZE9mZnNldCArIHJhbmdlc1RvUmVtb3ZlW2ogKyAxXS5zdGFydCA6XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lmxlbmd0aDtcclxuXHJcbiAgICAgICAgICAgIGZvciAoOyBvZmZzZXRTb3VyY2UgPCBuZXh0UmFuZ2VPZmZzZXQ7ICsrb2Zmc2V0U291cmNlKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbb2Zmc2V0VGFyZ2V0XSA9IHJlc3VsdFtvZmZzZXRTb3VyY2VdO1xyXG4gICAgICAgICAgICAgICAgKytvZmZzZXRUYXJnZXQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzUmVtb3ZlZCA9IG9mZnNldFNvdXJjZSAtIG9mZnNldFRhcmdldDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYnl0ZXNSZW1vdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIG1vZGlmeUludDMyKGJ5dGVzLCBvZmZzZXQsIG5ld1ZhbHVlKSB7XHJcbiAgICAgICAgYnl0ZXNbb2Zmc2V0KytdID0gbmV3VmFsdWUgPj4+IDI0O1xyXG4gICAgICAgIGJ5dGVzW29mZnNldCsrXSA9IChuZXdWYWx1ZSA+Pj4gMTYpICYgMHhGRjtcclxuICAgICAgICBieXRlc1tvZmZzZXQrK10gPSAobmV3VmFsdWUgPj4+IDgpICYgMHhGRjtcclxuICAgICAgICBieXRlc1tvZmZzZXQrK10gPSBuZXdWYWx1ZSAmIDB4RkY7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZW5jb2RlUHJvZ3Jlc3Npb25PcmRlcihwcm9ncmVzc2lvbk9yZGVyKSB7XHJcbiAgICAgICAgLy8gQS42LjFcclxuICAgICAgICBcclxuICAgICAgICAvLyBUYWJsZSBBLjE2XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChwcm9ncmVzc2lvbk9yZGVyKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ0xSQ1AnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnUkxDUCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdSUENMJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiAyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnUENSTCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gMztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdDUFJMJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiA0O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdQcm9ncmVzc2lvbiBvcmRlciBvZiAnICsgcHJvZ3Jlc3Npb25PcmRlciwgJ0EuNi4xLCB0YWJsZSBBLjE2Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBQYWNrZXRzRGF0YUNvbGxlY3RvciA9IGZ1bmN0aW9uIEpwaXBQYWNrZXRzRGF0YUNvbGxlY3RvcihcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgcXVhbGl0eUxheWVyc0NhY2hlLFxyXG4gICAganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRBbGxDb2RlYmxvY2tzRGF0YSA9IGZ1bmN0aW9uIGdldENvZGVibG9ja3NEYXRhKFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBtaW5OdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3MgPSBqcGlwRmFjdG9yeS5jcmVhdGVPYmplY3RQb29sQnlEYXRhYmluKCk7XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja3NEYXRhID0gZ2V0TmV3Q29kZWJsb2Nrc0RhdGFBbmRVcGRhdGVSZXR1cm5lZENvZGVibG9ja3MoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBtaW5OdW1RdWFsaXR5TGF5ZXJzLCBhbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjb2RlYmxvY2tzRGF0YTogY29kZWJsb2Nrc0RhdGEsXHJcbiAgICAgICAgICAgIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3M6IGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3NcclxuICAgICAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TmV3Q29kZWJsb2Nrc0RhdGFBbmRVcGRhdGVSZXR1cm5lZENvZGVibG9ja3MgPVxyXG4gICAgICAgIGdldE5ld0NvZGVibG9ja3NEYXRhQW5kVXBkYXRlUmV0dXJuZWRDb2RlYmxvY2tzO1xyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TmV3Q29kZWJsb2Nrc0RhdGFBbmRVcGRhdGVSZXR1cm5lZENvZGVibG9ja3MoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsIG1pbk51bVF1YWxpdHlMYXllcnMsIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3MpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUl0ZXJhdG9yID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlc0l0ZXJhdG9yKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQgPSAwO1xyXG4gICAgICAgIHZhciBkdW1teU9mZnNldCA9IDA7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgcGFja2V0RGF0YU9mZnNldHM6IFtdLFxyXG4gICAgICAgICAgICBkYXRhOiBqcGlwRmFjdG9yeS5jcmVhdGVDb21wb3NpdGVBcnJheShkdW1teU9mZnNldCksXHJcbiAgICAgICAgICAgIGFsbFJlbGV2YW50Qnl0ZXNMb2FkZWQ6IDBcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlU3RydWN0dXJlID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlU3RydWN0dXJlKFxyXG4gICAgICAgICAgICAgICAgdGlsZUl0ZXJhdG9yLnRpbGVJbmRleCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcHJlY2luY3RJdGVyYXRvciA9IHRpbGVTdHJ1Y3R1cmUuZ2V0UHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICAgICAgICAgIHRpbGVJdGVyYXRvci50aWxlSW5kZXgsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBtYXhOdW1RdWFsaXR5TGF5ZXJzID0gdGlsZVN0cnVjdHVyZS5nZXROdW1RdWFsaXR5TGF5ZXJzKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4TnVtUXVhbGl0eUxheWVycyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4TnVtUXVhbGl0eUxheWVycywgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4TnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzID09PSAnbWF4Jykge1xyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyA9IG1heE51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobWluTnVtUXVhbGl0eUxheWVycyA+IG1heE51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdtaW5OdW1RdWFsaXR5TGF5ZXJzIGlzIGxhcmdlciB0aGFuIG1heE51bVF1YWxpdHlMYXllcnMnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFwcmVjaW5jdEl0ZXJhdG9yLmlzSW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBwcmVjaW5jdCBub3QgaW4gY29kZXN0cmVhbSBwYXJ0Jyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBpbkNsYXNzSW5kZXggPSB0aWxlU3RydWN0dXJlLnByZWNpbmN0UG9zaXRpb25Ub0luQ2xhc3NJbmRleChcclxuICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdEl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdERhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldFByZWNpbmN0RGF0YWJpbihcclxuICAgICAgICAgICAgICAgICAgICBpbkNsYXNzSW5kZXgpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcmV0dXJuZWRJblByZWNpbmN0ID1cclxuICAgICAgICAgICAgICAgICAgICBhbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzLmdldE9iamVjdChwcmVjaW5jdERhdGFiaW4pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJldHVybmVkSW5QcmVjaW5jdC5sYXllclBlckNvZGVibG9jayA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuZWRJblByZWNpbmN0LmxheWVyUGVyQ29kZWJsb2NrID0gW107XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGxheWVyUmVhY2hlZCA9IHB1c2hQYWNrZXRzKFxyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCxcclxuICAgICAgICAgICAgICAgICAgICB0aWxlSW5kZXhJbkNvZGVzdHJlYW1QYXJ0LFxyXG4gICAgICAgICAgICAgICAgICAgIHByZWNpbmN0SXRlcmF0b3IsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybmVkSW5QcmVjaW5jdCxcclxuICAgICAgICAgICAgICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGxheWVyUmVhY2hlZCA8IG1pbk51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiBhbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzIGlzIHdyb25nIGluIHRoaXMgc3RhZ2UsXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gYmVjYXVzZSBpdCB3YXMgdXBkYXRlZCB3aXRoIGEgZGF0YSB3aGljaCB3aWxsIG5vdCBiZVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIHJldHVybmVkLiBJIGRvbid0IGNhcmUgYWJvdXQgaXQgbm93IGJlY2F1c2UgcmV0dXJuaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gbnVsbCBoZXJlIG1lYW5zIHNvbWV0aGluZyBiYWQgaGFwcGVuZWQgKGFuIGV4Y2VwdGlvbiBpc1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIHRocm93biBpbiBSZXF1ZXN0Q29udGV4dCB3aGVuIHRoaXMgaGFwcGVucykuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgc29tZSBkYXkgdGhlIGNvbnNpc3RlbmN5IG9mIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3NcclxuICAgICAgICAgICAgICAgICAgICAvLyBpcyBpbXBvcnRhbnQgdGhlbiBhIG5ldyBvYmplY3Qgc2hvdWxkIGJlIHJldHVybmVkIG9uIGVhY2hcclxuICAgICAgICAgICAgICAgICAgICAvLyBjYWxsIHRvIHRoaXMgZnVuY3Rpb24sIG9yIGEgdHJhbnNhY3Rpb25hbCBzdHlsZSBzaG91bGQgYmVcclxuICAgICAgICAgICAgICAgICAgICAvLyB1c2VkIGhlcmUgdG8gYWJvcnQgYWxsIG5vbi1yZXR1cm5lZCBkYXRhLlxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IHdoaWxlIChwcmVjaW5jdEl0ZXJhdG9yLnRyeUFkdmFuY2UoKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICArK3RpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQ7XHJcbiAgICAgICAgfSB3aGlsZSAodGlsZUl0ZXJhdG9yLnRyeUFkdmFuY2UoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRhdGFBc1VpbnQ4ID0gbmV3IFVpbnQ4QXJyYXkocmVzdWx0LmRhdGEuZ2V0TGVuZ3RoKCkpO1xyXG4gICAgICAgIHJlc3VsdC5kYXRhLmNvcHlUb1R5cGVkQXJyYXkoZGF0YUFzVWludDgsIDAsIDAsIHJlc3VsdC5kYXRhLmdldExlbmd0aCgpKTtcclxuICAgICAgICByZXN1bHQuZGF0YSA9IGRhdGFBc1VpbnQ4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcHVzaFBhY2tldHMoXHJcbiAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgIHRpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQsXHJcbiAgICAgICAgcHJlY2luY3RJdGVyYXRvcixcclxuICAgICAgICBwcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgcmV0dXJuZWRDb2RlYmxvY2tzSW5QcmVjaW5jdCxcclxuICAgICAgICBtYXhOdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxheWVyO1xyXG4gICAgICAgIHZhciBvZmZzZXRJblByZWNpbmN0RGF0YWJpbjtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGxheWVyID0gMDsgbGF5ZXIgPCBtYXhOdW1RdWFsaXR5TGF5ZXJzOyArK2xheWVyKSB7XHJcbiAgICAgICAgICAgIHZhciBjb2RlYmxvY2tPZmZzZXRzSW5EYXRhYmluID1cclxuICAgICAgICAgICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZS5nZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleChcclxuICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sIGxheWVyLCBwcmVjaW5jdEl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChjb2RlYmxvY2tPZmZzZXRzSW5EYXRhYmluID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgb2Zmc2V0SW5QcmVjaW5jdERhdGFiaW4gPVxyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrT2Zmc2V0c0luRGF0YWJpbi5oZWFkZXJTdGFydE9mZnNldCArXHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tPZmZzZXRzSW5EYXRhYmluLmhlYWRlckxlbmd0aDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBudW1Db2RlYmxvY2tzID1cclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHNJbkRhdGFiaW4uY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXgubGVuZ3RoO1xyXG4gICAgICAgICAgICB2YXIgY29kZWJsb2NrT2Zmc2V0c0luUmVzdWx0ID0gbmV3IEFycmF5KG51bUNvZGVibG9ja3MpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGlzSW5jb21wbGV0ZVBhY2tldCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Db2RlYmxvY2tzOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHZhciByZXR1cm5lZCA9IHJldHVybmVkQ29kZWJsb2Nrc0luUHJlY2luY3QubGF5ZXJQZXJDb2RlYmxvY2tbaV07XHJcbiAgICAgICAgICAgICAgICBpZiAocmV0dXJuZWQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybmVkID0geyBsYXllcjogLTEgfTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm5lZENvZGVibG9ja3NJblByZWNpbmN0LmxheWVyUGVyQ29kZWJsb2NrW2ldID0gcmV0dXJuZWQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJldHVybmVkLmxheWVyID49IGxheWVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBjb2RlYmxvY2sgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHNJbkRhdGFiaW4uY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXhbaV07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBvZmZzZXRJblJlc3VsdEFycmF5ID0gcmVzdWx0LmRhdGEuZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBieXRlc0NvcGllZCA9IHByZWNpbmN0RGF0YWJpbi5jb3B5VG9Db21wb3NpdGVBcnJheShcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQuZGF0YSxcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogb2Zmc2V0SW5QcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogY29kZWJsb2NrLmNvZGVibG9ja0JvZHlMZW5ndGhCeXRlcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWVcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGJ5dGVzQ29waWVkICE9PSBjb2RlYmxvY2suY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZWJsb2NrT2Zmc2V0c0luUmVzdWx0Lmxlbmd0aCA9IGk7XHJcbiAgICAgICAgICAgICAgICAgICAgaXNJbmNvbXBsZXRlUGFja2V0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuZWQubGF5ZXIgPSBsYXllcjtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHNJblJlc3VsdFtpXSA9IHtcclxuICAgICAgICAgICAgICAgICAgICBzdGFydDogb2Zmc2V0SW5SZXN1bHRBcnJheSxcclxuICAgICAgICAgICAgICAgICAgICBlbmQ6IG9mZnNldEluUmVzdWx0QXJyYXkgKyBjb2RlYmxvY2suY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzLFxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGluZ3Bhc3NlczogY29kZWJsb2NrLmNvZGluZ1Bhc3NlcyxcclxuICAgICAgICAgICAgICAgICAgICB6ZXJvQml0UGxhbmVzOiBjb2RlYmxvY2suemVyb0JpdFBsYW5lc1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIG9mZnNldEluUHJlY2luY3REYXRhYmluICs9IGNvZGVibG9jay5jb2RlYmxvY2tCb2R5TGVuZ3RoQnl0ZXM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBwYWNrZXQgPSB7XHJcbiAgICAgICAgICAgICAgICB0aWxlSW5kZXg6IHRpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQsXHJcbiAgICAgICAgICAgICAgICByOiBwcmVjaW5jdEl0ZXJhdG9yLnJlc29sdXRpb25MZXZlbCxcclxuICAgICAgICAgICAgICAgIHA6IHByZWNpbmN0SXRlcmF0b3IucHJlY2luY3RJbmRleEluQ29tcG9uZW50UmVzb2x1dGlvbixcclxuICAgICAgICAgICAgICAgIGM6IHByZWNpbmN0SXRlcmF0b3IuY29tcG9uZW50LFxyXG4gICAgICAgICAgICAgICAgbDogbGF5ZXIsXHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tPZmZzZXRzOiBjb2RlYmxvY2tPZmZzZXRzSW5SZXN1bHRcclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICByZXN1bHQucGFja2V0RGF0YU9mZnNldHMucHVzaChwYWNrZXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzSW5jb21wbGV0ZVBhY2tldCkge1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVzdWx0LmFsbFJlbGV2YW50Qnl0ZXNMb2FkZWQgKz0gb2Zmc2V0SW5QcmVjaW5jdERhdGFiaW47XHJcbiAgICAgICAgcmV0dXJuIGxheWVyO1xyXG4gICAgfSAgICBcclxufTsiXX0=
