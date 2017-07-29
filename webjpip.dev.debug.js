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

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.webjpip = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

module.exports = JpipFetch;

var jGlobals = require('j2k-jpip-globals.js');

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
	
	this.setDedicatedChannelHandle = function setDedicatedChannelHandle(
		dedicatedChannelHandle_) {
		
		dedicatedChannelHandle = dedicatedChannelHandle_;
	};
	
	this.move = function move(codestreamPartParams_) {
		if (dedicatedChannelHandle === null && codestreamPartParams !== null) {
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Cannot move non movable fetch');
		}
		codestreamPartParams = codestreamPartParams_;
		requestData();
	};
	
	this.resume = function resume() {
		requestData();
	};
	
	this.stop = function stop() {
		if (serverRequest === null) {
			if (isTerminated/* || isDone*/) {
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Cannot stop already terminated fetch');
			}
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Cannot stop already stopped fetch');
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
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Unexpected terminate event on movable fetch');
		}
		if (isTerminated) {
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Double terminate event');
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
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Unexpected requestData() after fetch done');
		}
		if (serverRequest !== null) {
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Cannot resume already-active-fetch');
		}
		
		if (isTerminated) {
			throw new jGlobals.jpipExceptions.IllegalOperationException(
				'Cannot resume already-terminated-fetch');
		}

		setTimeout(function() {
			if (nextProgressiveStage >= progressiveness.length ||
				serverRequest !== null ||
				isTerminated) {
					
				return;
			}
			
			//if (isDone) {
			//	return;
			//}
			
			requestedProgressiveStage =
				isProgressive ? nextProgressiveStage : progressiveness.length - 1;
				
			serverRequest = requester.requestData(
				codestreamPartParams,
				requesterCallbackOnAllDataRecieved,
				requesterCallbackOnFailure,
				progressiveness[requestedProgressiveStage].minNumQualityLayers,
				dedicatedChannelHandle);
		});
	}

	function requesterCallbackOnAllDataRecieved(request, isResponseDone) {
		serverRequest = null;
		if (!isResponseDone) {
			return;
		}
		
		//if (isTerminated && requestedQualityLayer > reachedQualityLayer) {
		//	throw new jGlobals.jpipExceptions.IllegalDataException(
		//		'JPIP server not returned all data', 'D.3');
		//}
		nextProgressiveStage = requestedProgressiveStage;
		if (nextProgressiveStage >= progressiveness.length) {
			fetchContext.done();
		}
	};

	function requesterCallbackOnFailure() {
		//updateStatus(STATUS_ENDED, 'endAsync()');
		
		//if (failureCallback !== undefined) {
		//    failureCallback(self, userContextVars);
		//} else {
		//    isFailure = true;
		//}
		isFailure = true;

		//if (isMoved) {
		//	throw new jGlobals.jpipExceptions.InternalErrorException(
		//		'Failure callback to an old fetch which has been already moved');
		//}
	};
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
},{"j2k-jpip-globals.js":16}],2:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');
var jpipFactory = require('jpip-runtime-factory.js'); 

module.exports = JpipFetcher;

function JpipFetcher(databinsSaver, options) {
    options = options || {};

	var isOpenCalled = false;
	var resolveOpen = null;
	var rejectOpen = null;
    var progressionOrder = 'RPCL';

    var maxChannelsInSession = options.maxChannelsInSession || 1;
    var maxRequestsWaitingForResponseInChannel =
        options.maxRequestsWaitingForResponseInChannel || 1;

    //var databinsSaver = jpipFactory.createDatabinsSaver(/*isJpipTilepartStream=*/false);
    var mainHeaderDatabin = databinsSaver.getMainHeaderDatabin();

    var markersParser = jpipFactory.createMarkersParser(mainHeaderDatabin);
    var offsetsCalculator = jpipFactory.createOffsetsCalculator(
        mainHeaderDatabin, markersParser);
    var structureParser = jpipFactory.createStructureParser(
        databinsSaver, markersParser, offsetsCalculator);
    var codestreamStructure = jpipFactory.createCodestreamStructure(
        structureParser, progressionOrder);

	var requester = jpipFactory.createReconnectableRequester(
        maxChannelsInSession,
        maxRequestsWaitingForResponseInChannel,
        codestreamStructure,
        databinsSaver);

	var paramsModifier = jpipFactory.createRequestParamsModifier(codestreamStructure);

	requester.setStatusCallback(requesterStatusCallback);
    
    this.open = function open(baseUrl) {
		if (isOpenCalled) {
			throw 'webJpip error: Cannot call JpipFetcher.open() twice';
		}
		
		return new Promise(function(resolve, reject) {
			resolveOpen = resolve;
			rejectOpen = reject;
			requester.open(baseUrl);
		});
    };
    
    this.close = function close() {
        return new Promise(function(resolve, reject) {
            requester.close(resolve);
        });
    };
    
	this.on = function on() {
		// TODO When JpipFetcher is fully aligned to imageDecoderFramework new API
	};

	this.startFetch = function startFetch(fetchContext, codestreamPartParams) {
		var params = paramsModifier.modify(codestreamPartParams);
		var fetch = createFetch(fetchContext, params.progressiveness);
		
		fetch.move(params.codestreamPartParams);
	};

	this.startMovableFetch = function startMovableFetch(fetchContext, codestreamPartParams) {
		var params = paramsModifier.modify(codestreamPartParams);
		var fetch = createFetch(fetchContext, params.progressiveness);

        var dedicatedChannelHandle = requester.dedicateChannelForMovableRequest();
		fetch.setDedicatedChannelHandle(dedicatedChannelHandle);
		fetchContext.on('move', fetch.move);

		fetch.move(params.codestreamPartParams);
	};
    
    function createFetch(fetchContext, progressiveness) {
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
		
		var fetch = jpipFactory.createFetch(fetchContext, requester, progressiveness);

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
        
		if (!resolveOpen || (!status.isReady && !status.exception)) {
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
		
        var params = codestreamStructure.getSizesParams();
        var clonedParams = JSON.parse(JSON.stringify(params));
        
        var tile = codestreamStructure.getDefaultTileStructure();
        var component = tile.getDefaultComponentStructure();

		clonedParams.imageLevel = 0;
		clonedParams.lowestQuality = 1;
        clonedParams.highestQuality = tile.getNumQualityLayers();
        clonedParams.numResolutionLevelsForLimittedViewer =
            component.getNumResolutionLevels();
        
		localResolve(clonedParams);
    }
    
    return this;
}
},{"j2k-jpip-globals.js":16,"jpip-runtime-factory.js":17}],3:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipImageDataContext;

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
    this._dataListeners = [];
    
    this._listener = this._jpipFactory.createRequestDatabinsListener(
        codestreamPartParams,
        this._qualityLayerReachedCallback.bind(this),
        this._codestreamStructure,
        this._databinsSaver,
        this._qualityLayersCache);
}

JpipImageDataContext.prototype.hasData = function hasData() {
    //ensureNoFailure();
    this._ensureNotDisposed();
    return this._progressiveStagesFinished > 0;
};

JpipImageDataContext.prototype.getFetchedData = function getFetchedData(quality) {
    this._ensureNotDisposed();
    if (!this.hasData()) {
        throw 'JpipImageDataContext error: cannot call getFetchedData before hasData = true';
    }
    
    //ensureNoFailure();
    var params = this._getParamsForDataWriter(quality);
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
    
    if (headersCodestream === null) {
        throw new jGlobals.jpipExceptions.InternalErrorException(
            'Could not reconstruct codestream although ' +
            'progressiveness stage has been reached');
    }
    
    //alreadyReturnedCodeblocks = codeblocks.alreadyReturnedCodeblocks;
    return {
        headersCodestream: headersCodestream,
        codeblocksData: codeblocks.codeblocksData,
        codestreamPartParams: this._codestreamPartParams
    };
};

JpipImageDataContext.prototype.getFetchedDataAsCodestream = function getFetchedDataAsCodestream(quality) {
    this._ensureNotDisposed();
    //ensureNoFailure();
    
    var params = this._getParamsForDataWriter(quality);
    
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
    return !this._listener;
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
    
    this._isRequestDone = this._progressiveStagesFinished === this._progressiveness.length;

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

JpipImageDataContext.prototype._getParamsForDataWriter = function getParamsForDataWriter(quality) {
    //ensureNotEnded(status, /*allowZombie=*/true);
    
    //if (codestreamPartParams === null) {
    //    throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot ' +
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
    if (quality !== undefined) {
        newParams = Object.create(this._codestreamPartParams);
        newParams.quality = quality;
        
        if (minNumQualityLayers !== 'max') {
            minNumQualityLayers = Math.min(
                minNumQualityLayers, quality);
        }
    }
    
    return {
        codestreamPartParams: newParams,
        minNumQualityLayers: minNumQualityLayers
        };
};

JpipImageDataContext.prototype._ensureNotDisposed = function ensureNotDisposed() {
    if (this.isDisposed()) {
        throw new jGlobals.jpipExceptions.IllegalOperationException('Cannot use ImageDataContext after disposed');
    }
};

},{"j2k-jpip-globals.js":16}],4:[function(require,module,exports){
'use strict';

var jpipFactory = require('jpip-runtime-factory.js'); 

module.exports = JpipImage;

function JpipImage(options) {
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
    
    var jpipObjectsForRequestContext = {
        reconstructor: reconstructor,
        packetsDataCollector: packetsDataCollector,
        qualityLayersCache: qualityLayersCache,
        codestreamStructure: codestreamStructure,
        databinsSaver: databinsSaver,
        jpipFactory: jpipFactory
	};
	
	var paramsModifier = jpipFactory.createRequestParamsModifier(codestreamStructure);

	var imageParams = null;
	var levelCalculator = null;
	
	var fetcher = jpipFactory.createFetcher(databinsSaver, options); // TODO: WorkerProxyFetcher
	//function GridImageBase() {
	//	this._fetcher = fetcher;
	//	this._imageParams = null;
	//	this._waitingFetches = {};
	//	this._levelCalculator = null;
	//}

	this.opened = function opened(imageDecoder) {
		imageParams = imageDecoder.getImageParams();
		//imageDecoder.onFetcherEvent('data', this._onDataFetched.bind(this));
		//imageDecoder.onFetcherEvent('tile-terminated', this._onTileTerminated.bind(this));
	};

	this.getLevelCalculator = function getLevelCalculator() {
		if (levelCalculator === null) {
			levelCalculator = jpipFactory.createLevelCalculator(imageParams);
		}
		return levelCalculator;
	};

	this.getDecoderWorkersInputRetreiver = function getDecoderWorkersInputRetreiver() {
		return this;
	};
	
	this.getFetcher = function getFetcher() {
		return fetcher;
	};

	this.getWorkerTypeOptions = function getWorkerTypeOptions(taskType) {
		return {
			ctorName: 'webjpip.PdfjsJpxDecoder',
			ctorArgs: [],
			scriptsToImport: [getScriptName(new Error())]
		};
	};

	this.getKeyAsString = function getKeyAsString(key) {
		return JSON.stringify(key);
	};

	this.taskStarted = function taskStarted(task) {
		var params = paramsModifier.modify(/*codestreamTaskParams=*/task.key);
		var context = jpipFactory.createImageDataContext(
			jpipObjectsForRequestContext,
			params.codestreamPartParams,
			params.progressiveness);
		
		context.on('data', onData);
		if (context.hasData()) {
			onData(context);
		}
		
		function onData(context_) {
			if (context !== context_) {
				throw 'webjpip error: Unexpected context in data event';
			}
			
			// TODO: First quality layer
			var data = context.getFetchedData();
			task.dataReady(data);
			
			if (context.isDone()) {
				task.terminate();
				context.dispose();
			}
		}
	};
}

function getScriptName(errorWithStackTrace) {
	var stack = errorWithStackTrace.stack.trim();
	
	var currentStackFrameRegex = /at (|[^ ]+ \()([^ ]+):\d+:\d+/;
	var source = currentStackFrameRegex.exec(stack);
	if (source && source[2] !== "") {
		return source[2];
	}

	var lastStackFrameRegex = new RegExp(/.+\/(.*?):\d+(:\d+)*$/);
	source = lastStackFrameRegex.exec(stack);
	if (source && source[1] !== "") {
		return source[1];
	}
	
	if (errorWithStackTrace.fileName !== undefined) {
		return errorWithStackTrace.fileName;
	}
	
	throw 'ImageDecoderFramework.js: Could not get current script URL';
}
},{"jpip-runtime-factory.js":17}],5:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');
var LOG2 = Math.log(2);

module.exports = function JpipLevelCalculator(
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
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
		var levelX = Math.log((regionImageLevel.maxXExclusive - regionImageLevel.minX) / regionImageLevel.screenWidth ) / LOG2;
		var levelY = Math.log((regionImageLevel.maxYExclusive - regionImageLevel.minY) / regionImageLevel.screenHeight) / LOG2;
		var level = Math.ceil(Math.max(levelX, levelY));
		level = Math.max(0, Math.min(params.numResolutionLevelsForLimittedViewer - 1, level));
		return level;
    };
    
    this.getNumResolutionLevelsForLimittedViewer =
        function getNumResolutionLevelsForLimittedViewer() {
        
        if (params.numResolutionLevelsForLimittedViewer === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
        return params.numResolutionLevelsForLimittedViewer;
    };
    
    this.getLowestQuality = function getLowestQuality() {
        return 1;
    };
    
    this.getHighestQuality = function getHighestQuality() {
        if (params.highestQuality === undefined) {
            throw 'This method is available only when jpipSizesCalculator ' +
                'is created from params returned by jpipCodestreamClient. ' +
                'It shall be used for JPIP API purposes only';
        }
        
        return params.highestQuality;
    };
    
    // Private methods
    
    function getSizeOfPart(codestreamPartParams) {
        var level =
            codestreamPartParams.level;
        var tileWidth = getTileWidth(level);
        var tileHeight = getTileHeight(level);
        
        var tileBounds = getTilesFromPixels(codestreamPartParams);
        
        var firstTileIndex =
            tileBounds.minTileX + tileBounds.minTileY * getNumTilesX();
            
        var lastTileIndex =
            (tileBounds.maxTileXExclusive - 1) +
            (tileBounds.maxTileYExclusive - 1) * getNumTilesX();
        
        var firstEdgeType = isEdgeTileId(firstTileIndex);
        var lastEdgeType = isEdgeTileId(lastTileIndex);
        var firstSize = getTileSize(firstEdgeType, level);
        var lastSize = getTileSize(lastEdgeType, level);
        
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
        var level =
            partParams.level;

        var tileWidth = getTileWidth(level);
        var tileHeight = getTileHeight(level);
        
        var firstTileWidth = getFirstTileWidth(level);
        var firstTileHeight = getFirstTileHeight(level);
        
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

    function getTileSize(edgeType, level) {
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
        
        if (level !== undefined) {
            var scale = 1 << level;
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
    
    function getLevelWidth(level) {
        if (level === undefined) {
            return params.imageWidth;
        }
        
        var size = getSizeOfPart({
            minX: 0,
            maxXExclusive: params.imageWidth,
            minY: 0,
            maxYExclusive: params.imageHeight,
            level: level
            });
        
        return size.width;
    }
    
    function getLevelHeight(level) {
        if (level === undefined) {
            return params.imageHeight;
        }
        
        var size = getSizeOfPart({
            minX: 0,
            maxXExclusive: params.imageWidth,
            minY: 0,
            maxYExclusive: params.imageHeight,
            level: level
            });
        
        return size.height;
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
        var firstTileWidthBestLevel =
            getTileWidth() - getFirstTileOffsetX();
        
        var imageWidth = getLevelWidth();
        if (firstTileWidthBestLevel > imageWidth) {
            firstTileWidthBestLevel = imageWidth;
        }
        
        var scale = 1 << level;
        var firstTileWidth = Math.ceil(firstTileWidthBestLevel / scale);
        
        return firstTileWidth;
    }
    
    function getFirstTileHeight(level) {
        var firstTileHeightBestLevel =
            getTileHeight() - getFirstTileOffsetY();
        
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
},{"j2k-jpip-globals.js":16}],6:[function(require,module,exports){
'use strict';

module.exports = PdfjsJpxDecoder;

var jGlobals = require('j2k-jpip-globals.js');

function PdfjsJpxDecoder() {
    this._image = new JpxImage();
}

PdfjsJpxDecoder.prototype.start = function start(data) {
    var self = this;
    return new Promise(function(resolve, reject) {
        var regionToParse = {
            left  : data.headersCodestream.offsetX,
            top   : data.headersCodestream.offsetY,
            right : data.headersCodestream.offsetX + data.codestreamPartParams.maxXExclusive - data.codestreamPartParams.minX,
            bottom: data.headersCodestream.offsetY + data.codestreamPartParams.maxYExclusive - data.codestreamPartParams.minY
        };
        
        var currentContext = self._image.parseCodestream(
            data.headersCodestream.codestream,
            0,
            data.headersCodestream.codestream.length,
            { isOnlyParseHeaders: true });
        
        self._image.addPacketsData(currentContext, data.codeblocksData);
        
        self._image.decode(currentContext, { regionToParse: regionToParse });

        var result = self._copyTilesPixelsToOnePixelsArray(self._image.tiles, regionToParse, self._image.componentsCount);
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
},{"j2k-jpip-globals.js":16}],7:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

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
},{"j2k-jpip-globals.js":16}],8:[function(require,module,exports){
'use strict';

// A.2.1.

module.exports = function JpipDatabinParts(
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
},{"j2k-jpip-globals.js":16}],10:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipObjectPoolByDatabin() {
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
},{"j2k-jpip-globals.js":16}],11:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipRequestDatabinsListener(
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
        var qualityInTile = tileStructure.getNumQualityLayers();
        
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
            
            if (accumulatedData.qualityInTile !== undefined) {
                throw new jGlobals.jpipExceptions.InternalErrorException('Tile was ' +
                    'iterated twice in codestream part');
            }
            
            accumulatedData.qualityInTile = qualityInTile;
            incrementPrecinctQualityLayers(
                precinctDatabin, accumulatedData, precinctIterator);
            
            databinsSaver.addEventListener(
                precinctDatabin, 'dataArrived', precinctDataArrived);
        } while (precinctIterator.tryAdvance());
        
        tryAdvanceQualityLayersReached();
    }
    
    function precinctDataArrived(precinctDatabin) {
        var local = unregistered;
        var accumulatedData = accumulatedDataPerDatabin.getObject(
            precinctDatabin);

        var oldQualityLayersReached = accumulatedData.numQualityLayersReached;
        var qualityInTile =
            accumulatedData.qualityInTile;

        if (oldQualityLayersReached === qualityInTile) {
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
            codestreamPartParams.quality,
            precinctIteratorOptional);

        var numQualityLayersReached = qualityLayers.numQualityLayers;
        accumulatedData.numQualityLayersReached = numQualityLayersReached;

        var qualityInTile =
            accumulatedData.qualityInTile;

        if (numQualityLayersReached === qualityInTile) {
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
            
            var qualityInTile =
                accumulatedData.qualityInTile;
                
            if (qualityInTile === undefined) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'No information of qualityInTile in ' +
                    'JpipRequestDatabinsListener');
            }
            
            var qualityLayers = qualityLayersCache.getQualityLayerOffset(
                registeredPrecinctDatabins[i],
                codestreamPartParams.quality);
            
            if (qualityLayers.numQualityLayers === qualityInTile) {
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
},{"j2k-jpip-globals.js":16}],12:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipCodestreamStructure(
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
    
    this.getLevelWidth = function(level) {
        validateParams();

        var size = sizesCalculator.getLevelWidth(level);
        return size;
    };
    
    this.getLevelHeight = function(level) {
        validateParams();

        var size = sizesCalculator.getLevelHeight(level);
        return size;
    };
    
    this.getTileWidth = function(level) {
        validateParams();

        var size = sizesCalculator.getTileWidth(level);
        return size;
    };
    
    this.getTileHeight = function(level) {
        validateParams();

        var size = sizesCalculator.getTileHeight(level);
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
        tileIndex, level) {
        
        validateParams();
        
        var tileX = tileIndex % sizesCalculator.getNumTilesX();
        if (tileX === 0) {
            return 0;
        }
        
        var tileLeft =
            (tileX - 1) * sizesCalculator.getTileWidth(level) +
            sizesCalculator.getFirstTileWidth(level);
        
        return tileLeft;
    };
    
    this.getTileTop = function getTileTop(tileIndex, level) {
        validateParams();
        
        var tileY = Math.floor(tileIndex / sizesCalculator.getNumTilesX());
        if (tileY === 0) {
            return 0;
        }
        
        var tileTop =
            (tileY - 1) * sizesCalculator.getTileHeight(level) +
            sizesCalculator.getFirstTileHeight(level);
        
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
            sizesCalculator = jpipFactory.createLevelCalculator(params);
        }
    }
    
    return this;
};
},{"j2k-jpip-globals.js":16}],13:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipComponentStructure(
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
},{"j2k-jpip-globals.js":16}],14:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipRequestParamsModifier;

function JpipRequestParamsModifier(codestreamStructure) {
	this.modify = function modify(codestreamPartParams, options) {
		var codestreamPartParamsModified = castCodestreamPartParams(codestreamPartParams);

		options = options || {};
		var useCachedDataOnly = options.useCachedDataOnly;
		var disableProgressiveness = options.disableProgressiveness;

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
				codestreamPartParamsModified.quality,
				'quality');
		} else  if (useCachedDataOnly) {
			progressivenessModified = [ { minNumQualityLayers: 0 } ];
		} else if (disableProgressiveness) {
			var quality = codestreamPartParamsModified.quality;
			var minNumQualityLayers =
				quality === undefined ? 'max' : quality;
			
			progressivenessModified = [ { minNumQualityLayers: minNumQualityLayers } ];
		} else {
			progressivenessModified = getAutomaticProgressivenessStages(
				codestreamPartParamsModified.quality);
		}
		
		return {
			codestreamPartParams: codestreamPartParamsModified,
			progressiveness: progressivenessModified
		};
	};

	function castProgressivenessParams(progressiveness, quality, propertyName) {
		// Ensure than minNumQualityLayers is given for all items
		
		var result = new Array(progressiveness.length);

		for (var i = 0; i < progressiveness.length; ++i) {
			var minNumQualityLayers = progressiveness[i].minNumQualityLayers;
			
			if (minNumQualityLayers !== 'max') {
				if (quality !== undefined &&
					minNumQualityLayers > quality) {
					
					throw new jGlobals.jpipExceptions.ArgumentException(
						'progressiveness[' + i + '].minNumQualityLayers',
						minNumQualityLayers,
						'minNumQualityLayers is bigger than ' +
							'fetchParams.quality');
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

	function getAutomaticProgressivenessStages(quality) {
		// Create progressiveness of (1, 2, 3, (#max-quality/2), (#max-quality))

		var progressiveness = [];

		// No progressiveness, wait for all quality layers to be fetched
		var tileStructure = codestreamStructure.getDefaultTileStructure();
		var numQualityLayersNumeric = tileStructure.getNumQualityLayers();
		var qualityNumericOrMax = 'max';
		
		if (quality !== undefined) {
			numQualityLayersNumeric = Math.min(
				numQualityLayersNumeric, quality);
			qualityNumericOrMax = numQualityLayersNumeric;
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
			minNumQualityLayers: qualityNumericOrMax
			});
		
		return progressiveness;
	}

	function castCodestreamPartParams(codestreamPartParams) {
		var level = validateNumericParam(
			codestreamPartParams.level,
			'level',
			/*defaultValue=*/undefined,
			/*allowUndefiend=*/true);

		var quality = validateNumericParam(
			codestreamPartParams.quality,
			'quality',
			/*defaultValue=*/undefined,
			/*allowUndefiend=*/true);
		
		var minX = validateNumericParam(codestreamPartParams.minX, 'minX');
		var minY = validateNumericParam(codestreamPartParams.minY, 'minY');
		
		var maxX = validateNumericParam(
			codestreamPartParams.maxXExclusive, 'maxXExclusive');
		
		var maxY = validateNumericParam(
			codestreamPartParams.maxYExclusive, 'maxYExclusive');
		
		var levelWidth = codestreamStructure.getLevelWidth(level);
		var levelHeight = codestreamStructure.getLevelHeight(level);
		
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
			
			level: level,
			quality: quality
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
}
},{"j2k-jpip-globals.js":16}],15:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipTileStructure(
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
        
        var level = 0;
        if (codestreamPartParams !== undefined &&
            codestreamPartParams.level !== undefined) {
            
            level = codestreamPartParams.level;
            
            if (minNumResolutionLevels <= level) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot advance resolution: level=' +
                    codestreamPartParams.level + ' but should ' +
                    'be smaller than ' + minNumResolutionLevels);
            }
        }

        var precinctsInCodestreamPartPerLevelPerComponent =
            getPrecinctsInCodestreamPartPerLevelPerComponent(
                tileIndex, codestreamPartParams);
                
        var precinctX = 0;
        var precinctY = 0;
        if (!isIteratePrecinctsNotInCodestreamPart &&
            precinctsInCodestreamPartPerLevelPerComponent !== null) {
            
            var firstPrecinctsRange =
                precinctsInCodestreamPartPerLevelPerComponent[0][0];
            precinctX = firstPrecinctsRange.minPrecinctX;
            precinctY = firstPrecinctsRange.minPrecinctY;
        }
        
        // A.6.1 in part 1: Core Coding System
        
        var setableIterator = {
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
                var componentStructure = componentStructures[setableIterator.component];
                var precinctsX = componentStructure.getNumPrecinctsX(
                    setableIterator.resolutionLevel);
                setableIterator.precinctIndexInComponentResolution =
                    setableIterator.precinctX + setableIterator.precinctY * precinctsX;
        
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
                level,
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
        var minLevel =
            codestreamPartParams.level || 0;
        
        var tileLeftInLevel = codestreamStructure.getTileLeft(
            tileIndex, minLevel);
        var tileTopInLevel = codestreamStructure.getTileTop(
            tileIndex, minLevel);
        
        var minXInTile =
            codestreamPartParams.minX - tileLeftInLevel;
        var minYInTile =
            codestreamPartParams.minY - tileTopInLevel;
        var maxXInTile =
            codestreamPartParams.maxXExclusive - tileLeftInLevel;
        var maxYInTile =
            codestreamPartParams.maxYExclusive - tileTopInLevel;
        
        var codestreamPartLevelWidth = codestreamStructure.getLevelWidth(
            minLevel);
        var codestreamPartLevelHeight = codestreamStructure.getLevelHeight(
            minLevel);

        for (var component = 0; component < components; ++component) {
            var componentStructure = componentStructures[component];
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
        level,
        precinctsInCodestreamPartPerLevelPerComponent,
        isIteratePrecinctsNotInCodestreamPart) {
        
        var needAdvanceNextMember = true;
        var precinctsRangeHash = isIteratePrecinctsNotInCodestreamPart ?
            null: precinctsInCodestreamPartPerLevelPerComponent;
        
        var needResetPrecinctToMinimalInCodestreamPart = false;
        
        for (var i = 2; i >= 0; --i) {
            var newValue = advanceProgressionOrderMember(
                setableIterator, i, level, precinctsRangeHash);
            
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
        level,
        precinctsRange) {
        
        var componentStructure = componentStructures[precinctPosition.component];
        
        switch (progressionOrder[memberIndex]) {
            case 'R':
                var numResolutionLevels =
                    componentStructure.getNumResolutionLevels() -
                    level;
                
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
},{"j2k-jpip-globals.js":16}],16:[function(require,module,exports){
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
},{}],17:[function(require,module,exports){
'use strict';

var simpleAjaxHelper                 = require('simple-ajax-helper.js'                 );
var mutualExclusiveTransactionHelper = require('mutual-exclusive-transaction-helper.js');

var jpipCodingPassesNumberParser = require('jpip-coding-passes-number-parser.js');
var jpipMessageHeaderParser      = require('jpip-message-header-parser.js'      );

var JpipChannel                               = require('jpip-channel.js'                                   );
var JpipCodestreamReconstructor               = require('jpip-codestream-reconstructor.js'                  );
var JpipCodestreamStructure                   = require('jpip-codestream-structure.js'                      );
var JpipComponentStructure                    = require('jpip-component-structure.js'                       );
var CompositeArray                            = require('composite-array.js'                                );
var JpipDatabinParts                          = require('jpip-databin-parts.js'                             );
var JpipDatabinsSaver                         = require('jpip-databins-saver.js'                            );
var JpipFetch                                 = require('jpip-fetch.js'                                     );
var JpipHeaderModifier                        = require('jpip-header-modifier.js'                           );
var JpipImageDataContext                      = require('jpip-image-data-context.js'                        );
var JpipLevelCalculator                       = require('jpip-level-calculator.js'                          );
var JpipMarkersParser                         = require('jpip-markers-parser.js'                            );
var JpipObjectPoolByDatabin                   = require('jpip-object-pool-by-databin.js'                    );
var JpipOffsetsCalculator                     = require('jpip-offsets-calculator.js'                        );
var JpipPacketsDataCollector                  = require('jpip-packets-data-collector.js'                    );
var JpipRequestDatabinsListener               = require('jpip-request-databins-listener.js'                 );
var JpipRequestParamsModifier                 = require('jpip-request-params-modifier.js'                   );
var JpipRequest                               = require('jpip-request.js'                                   );
var JpipSessionHelper                         = require('jpip-session-helper.js'                            );
var JpipSession                               = require('jpip-session.js'                                   );
var JpipReconnectableRequester                = require('jpip-reconnectable-requester.js'                   );
var JpipStructureParser                       = require('jpip-structure-parser.js'                          );
var JpipTileStructure                         = require('jpip-tile-structure.js'                            );
var JpipBitstreamReader                       = require('jpip-bitstream-reader.js'                          );
var JpipTagTree                               = require('jpip-tag-tree.js'                                  );
var JpipCodeblockLengthParser                 = require('jpip-codeblock-length-parser.js'                   );
var JpipSubbandLengthInPacketHeaderCalculator = require('jpip-subband-length-in-packet-header-calculator.js');
var JpipPacketLengthCalculator                = require('jpip-packet-length-calculator.js'                  );
var JpipQualityLayersCache                    = require('jpip-quality-layers-cache.js'                      );

var JpipFetcher;

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
    
    createLevelCalculator: function(params) {
        return new JpipLevelCalculator(params);
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
    
    createFetcher: function(databinsSaver, options) {
        if (!JpipFetcher) {
			// Avoid dependency - load only on runtime
			JpipFetcher = require('jpip-fetcher.js');
		}
        return new JpipFetcher(databinsSaver, options);
    },
	
	createFetch: function(fetchContext, requester, progressiveness) {
		return new JpipFetch(fetchContext, requester, progressiveness);
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
	
	createRequestParamsModifier: function createRequestParamsModifier(
		codestreamStructure) {
		
		return new JpipRequestParamsModifier(codestreamStructure);
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

module.exports = jpipRuntimeFactory;
},{"composite-array.js":7,"jpip-bitstream-reader.js":28,"jpip-channel.js":22,"jpip-codeblock-length-parser.js":29,"jpip-codestream-reconstructor.js":37,"jpip-codestream-structure.js":12,"jpip-coding-passes-number-parser.js":30,"jpip-component-structure.js":13,"jpip-databin-parts.js":8,"jpip-databins-saver.js":9,"jpip-fetch.js":1,"jpip-fetcher.js":2,"jpip-header-modifier.js":38,"jpip-image-data-context.js":3,"jpip-level-calculator.js":5,"jpip-markers-parser.js":19,"jpip-message-header-parser.js":23,"jpip-object-pool-by-databin.js":10,"jpip-offsets-calculator.js":20,"jpip-packet-length-calculator.js":31,"jpip-packets-data-collector.js":39,"jpip-quality-layers-cache.js":32,"jpip-reconnectable-requester.js":24,"jpip-request-databins-listener.js":11,"jpip-request-params-modifier.js":14,"jpip-request.js":25,"jpip-session-helper.js":26,"jpip-session.js":27,"jpip-structure-parser.js":21,"jpip-subband-length-in-packet-header-calculator.js":33,"jpip-tag-tree.js":34,"jpip-tile-structure.js":15,"mutual-exclusive-transaction-helper.js":35,"simple-ajax-helper.js":18}],18:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = {
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
},{"j2k-jpip-globals.js":16}],19:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipMarkersParser(
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
},{"j2k-jpip-globals.js":16}],20:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipOffsetsCalculator(
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
},{"j2k-jpip-globals.js":16}],21:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipStructureParser(
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
},{"j2k-jpip-globals.js":16}],22:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipChannel(
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
            codestreamPartParams.level);
        var frameHeight = codestreamStructure.getLevelHeight(
            codestreamPartParams.level);
        
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
},{"j2k-jpip-globals.js":16}],23:[function(require,module,exports){
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

module.exports = jpipMessageHeaderParser;
},{"j2k-jpip-globals.js":16}],24:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipReconnectableRequester(
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
        var moveDedicatedChannel = !!dedicatedChannelHandleToMove;
        
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
                    exception: //jpipExceptions.IllegalOperationException(
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
            throw new jGlobals.jpipExceptions.IllegalOperationException(
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
},{"j2k-jpip-globals.js":16}],25:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipRequest(
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
},{"j2k-jpip-globals.js":16}],26:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipSessionHelper(
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
},{"j2k-jpip-globals.js":16}],27:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipSession(
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
        
        if (arbitraryChannelId === null) {
            return; // Failure indication already returned in JpipRequest
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
},{"j2k-jpip-globals.js":16}],28:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = (function JpipBitstreamReaderClosure() {
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
},{"j2k-jpip-globals.js":16}],29:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = (function JpipCodeblockLengthParserClosure() {
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
},{"j2k-jpip-globals.js":16}],30:[function(require,module,exports){
'use strict';

module.exports = (function JpipCodingPassesNumberParserClosure() {
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
},{}],31:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipPacketLengthCalculator(
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
        function calculateFullPacketsAvailableOffsets(quality) {
        
        var isAllowedFullQuality =
            quality === undefined ||
            quality >= numQualityLayersInTile;
        
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
    
    function getFullQualityLayersEndOffset(quality) {
        var numParsedQualityLayer = Math.min(
            quality, calculatedLengths.length);
        
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
},{"j2k-jpip-globals.js":16}],32:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipQualityLayersCache(
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
        precinctDatabin, quality, precinctPosition) {
        
        var loadedRanges = precinctDatabin.getExistingRanges();
        var endOffsetLoaded;
        
        var packetLengthCalculator = getPacketParser(
            precinctDatabin, precinctPosition);
            
        if (loadedRanges.length < 1 || loadedRanges[0].start > 0) {
            endOffsetLoaded = 0;
            quality = 0;
        } else {
            endOffsetLoaded = loadedRanges[0].start + loadedRanges[0].length;
        }
        
        var layersInPrecinct =
            packetLengthCalculator.calculateEndOffsetOfLastFullPacket(
                quality);
        
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
},{"j2k-jpip-globals.js":16}],33:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports =
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
},{"j2k-jpip-globals.js":16}],34:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipTagTree(
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
},{"j2k-jpip-globals.js":16}],35:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

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
},{"j2k-jpip-globals.js":16}],36:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports.JpipImage = require('jpip-image.js');
module.exports.PdfjsJpxDecoder = require('pdfjs-jpx-decoder.js');
module.exports.j2kExceptions = jGlobals.j2kExceptions;
module.exports.jpipExceptions = jGlobals.jpipExceptions;
module.exports.Internals = {
    jpipRuntimeFactory: require('jpip-runtime-factory.js'),
    jGlobals: jGlobals
};
},{"j2k-jpip-globals.js":16,"jpip-image.js":4,"jpip-runtime-factory.js":17,"pdfjs-jpx-decoder.js":6}],37:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipCodestreamReconstructor(
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
            codestream, params.level);
        
        if (currentOffset === null) {
            return null;
        }
        
        var tileIdToWrite = 0;
        var tileIterator = codestreamStructure.getTilesIterator(params);
        
        var firstTileId = tileIterator.tileIndex;
        
        var firstTileLeft = codestreamStructure.getTileLeft(
            firstTileId, params.level);
        var firstTileTop = codestreamStructure.getTileTop(
            firstTileId, params.level);
            
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
        level,
        minNumQualityLayers,
        quality) {
        
        var result = [];
        var currentOffset = createMainHeader(result, level);
        
        if (currentOffset === null) {
            return null;
        }
        
        // TODO: Delete this function and test createCodestreamForRegion instead
        
        var codestreamPartParams = {
            level: level,
            quality: quality
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
            level: level,
            minTileX: tileX,
            maxTileXExclusive: tileX + 1,
            minTileY: tileY,
            maxTileYExclusive: tileY + 1
            });
        
        result.length = currentOffset;
        
        return result;
    };
    
    function createMainHeader(result, level) {
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
            result, mainHeader, /*offset=*/0, level);
        
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
        
        var level;
        if (codestreamPartParams !== undefined) {
            level = codestreamPartParams.level;
        }
        
        var tileHeaderOffsets = createTileHeaderAndGetOffsets(
            result,
            currentOffset,
            tileHeaderDatabin,
            tileIdToWrite,
            level);
        
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
        level) {
        
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
            level);
        
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
        var quality;
        var iterator = tileStructure.getPrecinctIterator(
            tileIdOriginal,
            codestreamPartParams,
            /*isIteratePrecinctsNotInCodestreamPart=*/true);

        var allBytesCopied = 0;
        var hasMorePackets;
        
        if (codestreamPartParams !== undefined) {
            quality = codestreamPartParams.quality;
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
                    quality,
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
},{"j2k-jpip-globals.js":16}],38:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipHeaderModifier(
    codestreamStructure, offsetsCalculator, progressionOrder) {

    var encodedProgressionOrder = encodeProgressionOrder(progressionOrder);
        
    this.modifyMainOrTileHeader = function modifyMainOrTileHeader(
        result, originalDatabin, databinOffsetInResult, level) {
        
        modifyProgressionOrder(result, originalDatabin, databinOffsetInResult);
        
        if (level === undefined) {
            return 0;
        }
        
        var bestResolutionLevelsRanges =
            offsetsCalculator.getRangesOfBestResolutionLevelsData(
                originalDatabin, level);
        
        if (bestResolutionLevelsRanges.numDecompositionLevelsOffset !== null) {
            var offset =
                databinOffsetInResult +
                bestResolutionLevelsRanges.numDecompositionLevelsOffset;
                
            result[offset] -= level;
        }
        
        var bytesRemoved = removeRanges(
            result, bestResolutionLevelsRanges.ranges, databinOffsetInResult);
        
        var bytesAdded = -bytesRemoved;
        return bytesAdded;
    };
    
    this.modifyImageSize = function modifyImageSize(result, codestreamPartParams) {
        var newTileWidth = codestreamStructure.getTileWidth(
            codestreamPartParams.level);
        var newTileHeight = codestreamStructure.getTileHeight(
            codestreamPartParams.level);
        
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
},{"j2k-jpip-globals.js":16}],39:[function(require,module,exports){
'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipPacketsDataCollector(
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
            
            var quality = tileStructure.getNumQualityLayers();
            
            if (codestreamPartParams.quality !== undefined) {
                quality = Math.min(
                    quality, codestreamPartParams.quality);
            }
            
            if (minNumQualityLayers === 'max') {
                minNumQualityLayers = quality;
            } else if (minNumQualityLayers > quality) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'minNumQualityLayers is larger than quality');
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
                    quality);
                
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
        quality) {
        
        var layer;
        var offsetInPrecinctDatabin;
        
        for (layer = 0; layer < quality; ++layer) {
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
},{"j2k-jpip-globals.js":16}]},{},[36])(36)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYXBpL2pwaXAtZmV0Y2guanMiLCJzcmMvYXBpL2pwaXAtZmV0Y2hlci5qcyIsInNyYy9hcGkvanBpcC1pbWFnZS1kYXRhLWNvbnRleHQuanMiLCJzcmMvYXBpL2pwaXAtaW1hZ2UuanMiLCJzcmMvYXBpL2pwaXAtbGV2ZWwtY2FsY3VsYXRvci5qcyIsInNyYy9hcGkvcGRmanMtanB4LWRlY29kZXIuanMiLCJzcmMvZGF0YWJpbnMvY29tcG9zaXRlLWFycmF5LmpzIiwic3JjL2RhdGFiaW5zL2pwaXAtZGF0YWJpbi1wYXJ0cy5qcyIsInNyYy9kYXRhYmlucy9qcGlwLWRhdGFiaW5zLXNhdmVyLmpzIiwic3JjL2RhdGFiaW5zL2pwaXAtb2JqZWN0LXBvb2wtYnktZGF0YWJpbi5qcyIsInNyYy9kYXRhYmlucy9qcGlwLXJlcXVlc3QtZGF0YWJpbnMtbGlzdGVuZXIuanMiLCJzcmMvaW1hZ2Utc3RydWN0dXJlcy9qcGlwLWNvZGVzdHJlYW0tc3RydWN0dXJlLmpzIiwic3JjL2ltYWdlLXN0cnVjdHVyZXMvanBpcC1jb21wb25lbnQtc3RydWN0dXJlLmpzIiwic3JjL2ltYWdlLXN0cnVjdHVyZXMvanBpcC1yZXF1ZXN0LXBhcmFtcy1tb2RpZmllci5qcyIsInNyYy9pbWFnZS1zdHJ1Y3R1cmVzL2pwaXAtdGlsZS1zdHJ1Y3R1cmUuanMiLCJzcmMvbWlzYy9qMmstanBpcC1nbG9iYWxzLmpzIiwic3JjL21pc2MvanBpcC1ydW50aW1lLWZhY3RvcnkuanMiLCJzcmMvbWlzYy9zaW1wbGUtYWpheC1oZWxwZXIuanMiLCJzcmMvcGFyc2Vycy9qcGlwLW1hcmtlcnMtcGFyc2VyLmpzIiwic3JjL3BhcnNlcnMvanBpcC1vZmZzZXRzLWNhbGN1bGF0b3IuanMiLCJzcmMvcGFyc2Vycy9qcGlwLXN0cnVjdHVyZS1wYXJzZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1jaGFubmVsLmpzIiwic3JjL3Byb3RvY29sL2pwaXAtbWVzc2FnZS1oZWFkZXItcGFyc2VyLmpzIiwic3JjL3Byb3RvY29sL2pwaXAtcmVjb25uZWN0YWJsZS1yZXF1ZXN0ZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1yZXF1ZXN0LmpzIiwic3JjL3Byb3RvY29sL2pwaXAtc2Vzc2lvbi1oZWxwZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1zZXNzaW9uLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtYml0c3RyZWFtLXJlYWRlci5qcyIsInNyYy9xdWFsaXR5LWxheWVycy9qcGlwLWNvZGVibG9jay1sZW5ndGgtcGFyc2VyLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtY29kaW5nLXBhc3Nlcy1udW1iZXItcGFyc2VyLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtcGFja2V0LWxlbmd0aC1jYWxjdWxhdG9yLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtcXVhbGl0eS1sYXllcnMtY2FjaGUuanMiLCJzcmMvcXVhbGl0eS1sYXllcnMvanBpcC1zdWJiYW5kLWxlbmd0aC1pbi1wYWNrZXQtaGVhZGVyLWNhbGN1bGF0b3IuanMiLCJzcmMvcXVhbGl0eS1sYXllcnMvanBpcC10YWctdHJlZS5qcyIsInNyYy9xdWFsaXR5LWxheWVycy9tdXR1YWwtZXhjbHVzaXZlLXRyYW5zYWN0aW9uLWhlbHBlci5qcyIsInNyYy93ZWJqcGlwLWV4cG9ydHMuanMiLCJzcmMvd3JpdGVycy9qcGlwLWNvZGVzdHJlYW0tcmVjb25zdHJ1Y3Rvci5qcyIsInNyYy93cml0ZXJzL2pwaXAtaGVhZGVyLW1vZGlmaWVyLmpzIiwic3JjL3dyaXRlcnMvanBpcC1wYWNrZXRzLWRhdGEtY29sbGVjdG9yLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdmtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25RQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9hQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBKcGlwRmV0Y2g7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5mdW5jdGlvbiBKcGlwRmV0Y2goZmV0Y2hDb250ZXh0LCByZXF1ZXN0ZXIsIHByb2dyZXNzaXZlbmVzcykge1xyXG5cdHZhciBjb2Rlc3RyZWFtUGFydFBhcmFtcyA9IG51bGw7XHJcblx0dmFyIGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPSBudWxsO1xyXG5cdHZhciBzZXJ2ZXJSZXF1ZXN0ID0gbnVsbDtcclxuICAgIHZhciBpc0ZhaWx1cmUgPSBmYWxzZTtcclxuXHR2YXIgaXNUZXJtaW5hdGVkID0gZmFsc2U7XHJcblx0dmFyIGlzUHJvZ3Jlc3NpdmUgPSBmYWxzZTtcclxuXHQvL3ZhciBpc0RvbmUgPSBmYWxzZTtcclxuICAgIHZhciByZXF1ZXN0ZWRQcm9ncmVzc2l2ZVN0YWdlID0gMDtcclxuICAgIC8vdmFyIHJlYWNoZWRRdWFsaXR5TGF5ZXIgPSAwO1xyXG5cdHZhciBuZXh0UHJvZ3Jlc3NpdmVTdGFnZSA9IDA7XHJcblx0XHJcblx0dGhpcy5zZXREZWRpY2F0ZWRDaGFubmVsSGFuZGxlID0gZnVuY3Rpb24gc2V0RGVkaWNhdGVkQ2hhbm5lbEhhbmRsZShcclxuXHRcdGRlZGljYXRlZENoYW5uZWxIYW5kbGVfKSB7XHJcblx0XHRcclxuXHRcdGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPSBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlXztcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMubW92ZSA9IGZ1bmN0aW9uIG1vdmUoY29kZXN0cmVhbVBhcnRQYXJhbXNfKSB7XHJcblx0XHRpZiAoZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSA9PT0gbnVsbCAmJiBjb2Rlc3RyZWFtUGFydFBhcmFtcyAhPT0gbnVsbCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuXHRcdFx0XHQnQ2Fubm90IG1vdmUgbm9uIG1vdmFibGUgZmV0Y2gnKTtcclxuXHRcdH1cclxuXHRcdGNvZGVzdHJlYW1QYXJ0UGFyYW1zID0gY29kZXN0cmVhbVBhcnRQYXJhbXNfO1xyXG5cdFx0cmVxdWVzdERhdGEoKTtcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMucmVzdW1lID0gZnVuY3Rpb24gcmVzdW1lKCkge1xyXG5cdFx0cmVxdWVzdERhdGEoKTtcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMuc3RvcCA9IGZ1bmN0aW9uIHN0b3AoKSB7XHJcblx0XHRpZiAoc2VydmVyUmVxdWVzdCA9PT0gbnVsbCkge1xyXG5cdFx0XHRpZiAoaXNUZXJtaW5hdGVkLyogfHwgaXNEb25lKi8pIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J0Nhbm5vdCBzdG9wIGFscmVhZHkgdGVybWluYXRlZCBmZXRjaCcpO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG5cdFx0XHRcdCdDYW5ub3Qgc3RvcCBhbHJlYWR5IHN0b3BwZWQgZmV0Y2gnKTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0aWYgKCFkZWRpY2F0ZWRDaGFubmVsSGFuZGxlKSB7XHJcblx0XHRcdHJlcXVlc3Rlci5zdG9wUmVxdWVzdEFzeW5jKHNlcnZlclJlcXVlc3QpO1xyXG5cdFx0XHRzZXJ2ZXJSZXF1ZXN0ID0gbnVsbDtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0Ly8gTk9URTogU2VuZCBhIHN0b3AgcmVxdWVzdCB3aXRoaW4gSnBpcFJlcXVlc3QgYW5kIHJlc29sdmUgdGhlIFByb21pc2VcclxuXHRcdC8vIG9ubHkgYWZ0ZXIgc2VydmVyIHJlc3BvbnNlIChUaGlzIGlzIG9ubHkgcGVyZm9ybWFuY2UgaXNzdWUsIG5vXHJcblx0XHQvLyBmdW5jdGlvbmFsIHByb2JsZW06IGEgbmV3IGZldGNoIHdpbGwgdHJpZ2dlciBhIEpQSVAgcmVxdWVzdCB3aXRoXHJcblx0XHQvLyB3YWl0PW5vLCBhbmQgdGhlIG9sZCByZXF1ZXN0IHdpbGwgYmUgYWN0dWFsbHkgc3RvcHBlZCkuXHJcblx0XHRyZXR1cm4gZmV0Y2hDb250ZXh0LnN0b3BwZWQoKTtcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMudGVybWluYXRlID0gZnVuY3Rpb24gdGVybWluYXRlKCkge1xyXG5cdFx0aWYgKGRlZGljYXRlZENoYW5uZWxIYW5kbGUpIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J1VuZXhwZWN0ZWQgdGVybWluYXRlIGV2ZW50IG9uIG1vdmFibGUgZmV0Y2gnKTtcclxuXHRcdH1cclxuXHRcdGlmIChpc1Rlcm1pbmF0ZWQpIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J0RvdWJsZSB0ZXJtaW5hdGUgZXZlbnQnKTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0c2VydmVyUmVxdWVzdCA9IG51bGw7XHJcblx0XHRpc1Rlcm1pbmF0ZWQgPSB0cnVlO1xyXG5cdH07XHJcblx0XHJcblx0dGhpcy5pc1Byb2dyZXNzaXZlQ2hhbmdlZCA9IGZ1bmN0aW9uIGlzUHJvZ3Jlc3NpdmVDaGFuZ2VkKGlzUHJvZ3Jlc3NpdmVfKSB7XHJcblx0XHRpc1Byb2dyZXNzaXZlID0gaXNQcm9ncmVzc2l2ZV87XHJcblx0XHRpZiAoZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSAmJiBzZXJ2ZXJSZXF1ZXN0ICE9PSBudWxsKSB7XHJcblx0XHRcdHNlcnZlclJlcXVlc3QgPSBudWxsO1xyXG5cdFx0XHRyZXF1ZXN0RGF0YSgpO1xyXG5cdFx0fVxyXG5cdH07XHJcblx0XHJcblx0ZnVuY3Rpb24gcmVxdWVzdERhdGEoKSB7XHJcblx0XHRpZiAobmV4dFByb2dyZXNzaXZlU3RhZ2UgPj0gcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuXHRcdFx0XHQnVW5leHBlY3RlZCByZXF1ZXN0RGF0YSgpIGFmdGVyIGZldGNoIGRvbmUnKTtcclxuXHRcdH1cclxuXHRcdGlmIChzZXJ2ZXJSZXF1ZXN0ICE9PSBudWxsKSB7XHJcblx0XHRcdHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG5cdFx0XHRcdCdDYW5ub3QgcmVzdW1lIGFscmVhZHktYWN0aXZlLWZldGNoJyk7XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdGlmIChpc1Rlcm1pbmF0ZWQpIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J0Nhbm5vdCByZXN1bWUgYWxyZWFkeS10ZXJtaW5hdGVkLWZldGNoJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuXHRcdFx0aWYgKG5leHRQcm9ncmVzc2l2ZVN0YWdlID49IHByb2dyZXNzaXZlbmVzcy5sZW5ndGggfHxcclxuXHRcdFx0XHRzZXJ2ZXJSZXF1ZXN0ICE9PSBudWxsIHx8XHJcblx0XHRcdFx0aXNUZXJtaW5hdGVkKSB7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdH1cclxuXHRcdFx0XHJcblx0XHRcdC8vaWYgKGlzRG9uZSkge1xyXG5cdFx0XHQvL1x0cmV0dXJuO1xyXG5cdFx0XHQvL31cclxuXHRcdFx0XHJcblx0XHRcdHJlcXVlc3RlZFByb2dyZXNzaXZlU3RhZ2UgPVxyXG5cdFx0XHRcdGlzUHJvZ3Jlc3NpdmUgPyBuZXh0UHJvZ3Jlc3NpdmVTdGFnZSA6IHByb2dyZXNzaXZlbmVzcy5sZW5ndGggLSAxO1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRzZXJ2ZXJSZXF1ZXN0ID0gcmVxdWVzdGVyLnJlcXVlc3REYXRhKFxyXG5cdFx0XHRcdGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG5cdFx0XHRcdHJlcXVlc3RlckNhbGxiYWNrT25BbGxEYXRhUmVjaWV2ZWQsXHJcblx0XHRcdFx0cmVxdWVzdGVyQ2FsbGJhY2tPbkZhaWx1cmUsXHJcblx0XHRcdFx0cHJvZ3Jlc3NpdmVuZXNzW3JlcXVlc3RlZFByb2dyZXNzaXZlU3RhZ2VdLm1pbk51bVF1YWxpdHlMYXllcnMsXHJcblx0XHRcdFx0ZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSk7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIHJlcXVlc3RlckNhbGxiYWNrT25BbGxEYXRhUmVjaWV2ZWQocmVxdWVzdCwgaXNSZXNwb25zZURvbmUpIHtcclxuXHRcdHNlcnZlclJlcXVlc3QgPSBudWxsO1xyXG5cdFx0aWYgKCFpc1Jlc3BvbnNlRG9uZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdC8vaWYgKGlzVGVybWluYXRlZCAmJiByZXF1ZXN0ZWRRdWFsaXR5TGF5ZXIgPiByZWFjaGVkUXVhbGl0eUxheWVyKSB7XHJcblx0XHQvL1x0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG5cdFx0Ly9cdFx0J0pQSVAgc2VydmVyIG5vdCByZXR1cm5lZCBhbGwgZGF0YScsICdELjMnKTtcclxuXHRcdC8vfVxyXG5cdFx0bmV4dFByb2dyZXNzaXZlU3RhZ2UgPSByZXF1ZXN0ZWRQcm9ncmVzc2l2ZVN0YWdlO1xyXG5cdFx0aWYgKG5leHRQcm9ncmVzc2l2ZVN0YWdlID49IHByb2dyZXNzaXZlbmVzcy5sZW5ndGgpIHtcclxuXHRcdFx0ZmV0Y2hDb250ZXh0LmRvbmUoKTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHRmdW5jdGlvbiByZXF1ZXN0ZXJDYWxsYmFja09uRmFpbHVyZSgpIHtcclxuXHRcdC8vdXBkYXRlU3RhdHVzKFNUQVRVU19FTkRFRCwgJ2VuZEFzeW5jKCknKTtcclxuXHRcdFxyXG5cdFx0Ly9pZiAoZmFpbHVyZUNhbGxiYWNrICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdC8vICAgIGZhaWx1cmVDYWxsYmFjayhzZWxmLCB1c2VyQ29udGV4dFZhcnMpO1xyXG5cdFx0Ly99IGVsc2Uge1xyXG5cdFx0Ly8gICAgaXNGYWlsdXJlID0gdHJ1ZTtcclxuXHRcdC8vfVxyXG5cdFx0aXNGYWlsdXJlID0gdHJ1ZTtcclxuXHJcblx0XHQvL2lmIChpc01vdmVkKSB7XHJcblx0XHQvL1x0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcblx0XHQvL1x0XHQnRmFpbHVyZSBjYWxsYmFjayB0byBhbiBvbGQgZmV0Y2ggd2hpY2ggaGFzIGJlZW4gYWxyZWFkeSBtb3ZlZCcpO1xyXG5cdFx0Ly99XHJcblx0fTtcclxufVxyXG5cclxuLy9mdW5jdGlvbiBKcGlwRmV0Y2hIYW5kbGUocmVxdWVzdGVyLCBpbWFnZURhdGFDb250ZXh0LCBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlKSB7XHJcbi8vICAgIHRoaXMuX3JlcXVlc3RlciA9IHJlcXVlc3RlcjtcclxuLy8gICAgdGhpcy5faW1hZ2VEYXRhQ29udGV4dCA9IGltYWdlRGF0YUNvbnRleHQ7XHJcbi8vICAgIHRoaXMuX3NlcnZlclJlcXVlc3QgPSBudWxsO1xyXG4vLyAgICB0aGlzLl9kZWRpY2F0ZWRDaGFubmVsSGFuZGxlID0gZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZTtcclxuLy8gICAgdGhpcy5faXNGYWlsdXJlID0gZmFsc2U7XHJcbi8vICAgIHRoaXMuX2lzTW92ZWQgPSBmYWxzZTtcclxuLy8gICAgdGhpcy5fcmVxdWVzdGVkUXVhbGl0eUxheWVyID0gMDtcclxuLy8gICAgdGhpcy5fcmVhY2hlZFF1YWxpdHlMYXllciA9IDA7XHJcbi8vICAgIHRoaXMuX3JlcXVlc3RlckNhbGxiYWNrT25GYWlsdXJlQm91bmQgPSB0aGlzLl9yZXF1ZXN0ZXJDYWxsYmFja09uRmFpbHVyZS5iaW5kKHRoaXMpO1xyXG4vLyAgICBcclxuLy8gICAgaWYgKGltYWdlRGF0YUNvbnRleHQuaXNEaXNwb3NlZCgpKSB7XHJcbi8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuLy8gICAgICAgICAgICAnQ2Fubm90IGluaXRpYWxpemUgSnBpcEZldGNoSGFuZGxlIHdpdGggZGlzcG9zZWQgSW1hZ2VEYXRhQ29udGV4dCcpO1xyXG4vLyAgICB9XHJcbi8vICAgIGltYWdlRGF0YUNvbnRleHQub24oJ2RhdGEnLCB0aGlzLl9vbkRhdGEuYmluZCh0aGlzKSk7XHJcbi8vfVxyXG4vL1xyXG4vL0pwaXBGZXRjaEhhbmRsZS5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24gcmVzdW1lKCkge1xyXG4vLyAgICBpZiAodGhpcy5fc2VydmVyUmVxdWVzdCAhPT0gbnVsbCkge1xyXG4vLyAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbi8vICAgICAgICAgICAgJ0Nhbm5vdCByZXN1bWUgYWxyZWFkeS1hY3RpdmUtZmV0Y2gnKTtcclxuLy8gICAgfVxyXG4vLyAgICBcclxuLy8gICAgaWYgKHRoaXMuX2ltYWdlRGF0YUNvbnRleHQuaXNEaXNwb3NlZCgpKSB7XHJcbi8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuLy8gICAgICAgICAgICAnQ2Fubm90IGZldGNoIGRhdGEgd2l0aCBkaXNwb3NlZCBpbWFnZURhdGFDb250ZXh0Jyk7XHJcbi8vICAgIH1cclxuLy8gICAgXHJcbi8vICAgIGlmICh0aGlzLl9pc01vdmVkKSB7XHJcbi8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuLy8gICAgICAgICAgICAnQ2Fubm90IHJlc3VtZSBtb3ZhYmxlIGZldGNoIHdoaWNoIGhhcyBiZWVuIGFscmVhZHkgbW92ZWQ7IFNob3VsZCcgK1xyXG4vLyAgICAgICAgICAgICcgc3RhcnQgYSBuZXcgZmV0Y2ggd2l0aCBzYW1lIGRlZGljYXRlZENoYW5uZWxIYW5kbGUgaW5zdGVhZCcpO1xyXG4vLyAgICB9XHJcbi8vICAgIFxyXG4vLyAgICB0aGlzLl9yZXF1ZXN0RGF0YSgpO1xyXG4vL307XHJcbi8vXHJcbi8vSnBpcEZldGNoSGFuZGxlLnByb3RvdHlwZS5zdG9wQXN5bmMgPSBmdW5jdGlvbiBzdG9wQXN5bmMoKSB7XHJcbi8vICAgIGlmICh0aGlzLl9zZXJ2ZXJSZXF1ZXN0ID09PSBudWxsKSB7XHJcbi8vICAgICAgICBpZiAodGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0Rpc3Bvc2VkKCkgfHwgdGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0RvbmUoKSkge1xyXG4vLyAgICAgICAgICAgIHJldHVybjtcclxuLy8gICAgICAgIH1cclxuLy8gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4vLyAgICAgICAgICAgICdDYW5ub3Qgc3RvcCBhbHJlYWR5IHN0b3BwZWQgZmV0Y2gnKTtcclxuLy8gICAgfVxyXG4vLyAgICBcclxuLy8gICAgaWYgKHRoaXMuX2RlZGljYXRlZENoYW5uZWxIYW5kbGUpIHtcclxuLy8gICAgICAgIHRoaXMuX2lzTW92ZWQgPSB0cnVlO1xyXG4vLyAgICB9IGVsc2Uge1xyXG4vLyAgICAgICAgdGhpcy5fcmVxdWVzdGVyLnN0b3BSZXF1ZXN0QXN5bmModGhpcy5fc2VydmVyUmVxdWVzdCk7XHJcbi8vICAgICAgICB0aGlzLl9zZXJ2ZXJSZXF1ZXN0ID0gbnVsbDtcclxuLy8gICAgfVxyXG4vLyAgICBcclxuLy8gICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4vLyAgICAgICAgLy8gTk9URTogU2VuZCBhIHN0b3AgcmVxdWVzdCB3aXRoaW4gSnBpcFJlcXVlc3QgYW5kIHJlc29sdmUgdGhlIFByb21pc2VcclxuLy8gICAgICAgIC8vIG9ubHkgYWZ0ZXIgc2VydmVyIHJlc3BvbnNlIChUaGlzIGlzIG9ubHkgcGVyZm9ybWFuY2UgaXNzdWUsIG5vXHJcbi8vICAgICAgICAvLyBmdW5jdGlvbmFsIHByb2JsZW06IGEgbmV3IGZldGNoIHdpbGwgdHJpZ2dlciBhIEpQSVAgcmVxdWVzdCB3aXRoXHJcbi8vICAgICAgICAvLyB3YWl0PW5vLCBhbmQgdGhlIG9sZCByZXF1ZXN0IHdpbGwgYmUgYWN0dWFsbHkgc3RvcHBlZCkuXHJcbi8vICAgICAgICByZXNvbHZlKCk7XHJcbi8vICAgIH0pO1xyXG4vL307XHJcbi8vXHJcbi8vSnBpcEZldGNoSGFuZGxlLnByb3RvdHlwZS5fcmVxdWVzdGVyQ2FsbGJhY2tPbkFsbERhdGFSZWNpZXZlZCA9XHJcbi8vICAgIGZ1bmN0aW9uIChyZXF1ZXN0LCBpc1Jlc3BvbnNlRG9uZSwgcmVxdWVzdGVkUXVhbGl0eUxheWVyKSB7XHJcbi8vICAgIFxyXG4vLyAgICBpZiAoaXNSZXNwb25zZURvbmUgJiZcclxuLy8gICAgICAgICF0aGlzLl9pc01vdmVkICYmXHJcbi8vICAgICAgICAhdGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0Rpc3Bvc2VkKCkgJiZcclxuLy8gICAgICAgIHJlcXVlc3RlZFF1YWxpdHlMYXllciA+IHRoaXMuX3JlYWNoZWRRdWFsaXR5TGF5ZXIpIHtcclxuLy8gICAgICAgICAgICBcclxuLy8gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuLy8gICAgICAgICAgICAnSlBJUCBzZXJ2ZXIgbm90IHJldHVybmVkIGFsbCBkYXRhJywgJ0QuMycpO1xyXG4vLyAgICB9XHJcbi8vfTtcclxuLy9cclxuLy9KcGlwRmV0Y2hIYW5kbGUucHJvdG90eXBlLl9yZXF1ZXN0ZXJDYWxsYmFja09uRmFpbHVyZSA9XHJcbi8vICAgIGZ1bmN0aW9uIHJlcXVlc3RlckNhbGxiYWNrT25GYWlsdXJlKCkge1xyXG4vLyAgICAgICAgXHJcbi8vICAgIC8vdXBkYXRlU3RhdHVzKFNUQVRVU19FTkRFRCwgJ2VuZEFzeW5jKCknKTtcclxuLy8gICAgXHJcbi8vICAgIC8vaWYgKGZhaWx1cmVDYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XHJcbi8vICAgIC8vICAgIGZhaWx1cmVDYWxsYmFjayhzZWxmLCB1c2VyQ29udGV4dFZhcnMpO1xyXG4vLyAgICAvL30gZWxzZSB7XHJcbi8vICAgIC8vICAgIGlzRmFpbHVyZSA9IHRydWU7XHJcbi8vICAgIC8vfVxyXG4vLyAgICB0aGlzLl9pc0ZhaWx1cmUgPSB0cnVlO1xyXG4vL1xyXG4vLyAgICBpZiAodGhpcy5faXNNb3ZlZCkge1xyXG4vLyAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbi8vICAgICAgICAgICAgJ0ZhaWx1cmUgY2FsbGJhY2sgdG8gYW4gb2xkIGZldGNoIHdoaWNoIGhhcyBiZWVuIGFscmVhZHkgbW92ZWQnKTtcclxuLy8gICAgfVxyXG4vL307XHJcbi8vXHJcbi8vSnBpcEZldGNoSGFuZGxlLnByb3RvdHlwZS5fb25EYXRhID0gZnVuY3Rpb24gb25EYXRhKGltYWdlRGF0YUNvbnRleHQpIHtcclxuLy8gICAgdGhpcy5fcmVhY2hlZFF1YWxpdHlMYXllciA9IHRoaXMuX3JlcXVlc3RlZFF1YWxpdHlMYXllcjtcclxuLy8gICAgXHJcbi8vICAgIGlmIChpbWFnZURhdGFDb250ZXh0ICE9PSB0aGlzLl9pbWFnZURhdGFDb250ZXh0KSB7XHJcbi8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuLy8gICAgICAgICAgICAnVW5leHBlY3RlZCBJbWFnZURhdGFDb250ZXh0IGluIEZldGNoSGFuZGxlIGV2ZW50Jyk7XHJcbi8vICAgIH1cclxuLy8gICAgXHJcbi8vICAgIGlmICghdGhpcy5faXNNb3ZlZCAmJlxyXG4vLyAgICAgICAgIXRoaXMuX2ltYWdlRGF0YUNvbnRleHQuaXNEaXNwb3NlZCgpICYmXHJcbi8vICAgICAgICB0aGlzLl9zZXJ2ZXJSZXF1ZXN0ICE9PSBudWxsKSB7XHJcbi8vICAgICAgICBcclxuLy8gICAgICAgIHRoaXMuX3JlcXVlc3REYXRhKCk7XHJcbi8vICAgIH1cclxuLy99O1xyXG4vL1xyXG4vL0pwaXBGZXRjaEhhbmRsZS5wcm90b3R5cGUuX3JlcXVlc3REYXRhID0gZnVuY3Rpb24gcmVxdWVzdERhdGEoKSB7XHJcbi8vICAgIGlmICh0aGlzLl9pbWFnZURhdGFDb250ZXh0LmlzRG9uZSgpKSB7XHJcbi8vICAgICAgICByZXR1cm47XHJcbi8vICAgIH1cclxuLy8gICAgXHJcbi8vICAgIHZhciBzZWxmID0gdGhpcztcclxuLy8gICAgdmFyIG51bVF1YWxpdHlMYXllcnNUb1dhaXQgPSB0aGlzLl9pbWFnZURhdGFDb250ZXh0LmdldE5leHRRdWFsaXR5TGF5ZXIoKTtcclxuLy8gICAgdGhpcy5fcmVxdWVzdGVkUXVhbGl0eUxheWVyID0gbnVtUXVhbGl0eUxheWVyc1RvV2FpdDtcclxuLy8gICAgICAgIFxyXG4vLyAgICB0aGlzLl9zZXJ2ZXJSZXF1ZXN0ID0gdGhpcy5fcmVxdWVzdGVyLnJlcXVlc3REYXRhKFxyXG4vLyAgICAgICAgdGhpcy5faW1hZ2VEYXRhQ29udGV4dC5nZXRDb2Rlc3RyZWFtUGFydFBhcmFtcygpLFxyXG4vLyAgICAgICAgZnVuY3Rpb24gYWxsRGF0YVJlY2lldmVkKHJlcXVlc3QsIGlzUmVzcG9uc2VEb25lKSB7XHJcbi8vICAgICAgICAgICAgc2VsZi5fcmVxdWVzdGVyQ2FsbGJhY2tPbkFsbERhdGFSZWNpZXZlZChcclxuLy8gICAgICAgICAgICAgICAgcmVxdWVzdCwgaXNSZXNwb25zZURvbmUsIG51bVF1YWxpdHlMYXllcnNUb1dhaXQpO1xyXG4vLyAgICAgICAgfSxcclxuLy8gICAgICAgIHRoaXMuX3JlcXVlc3RlckNhbGxiYWNrT25GYWlsdXJlQm91bmQsXHJcbi8vICAgICAgICBudW1RdWFsaXR5TGF5ZXJzVG9XYWl0LFxyXG4vLyAgICAgICAgdGhpcy5fZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSk7XHJcbi8vfTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcbnZhciBqcGlwRmFjdG9yeSA9IHJlcXVpcmUoJ2pwaXAtcnVudGltZS1mYWN0b3J5LmpzJyk7IFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBKcGlwRmV0Y2hlcjtcclxuXHJcbmZ1bmN0aW9uIEpwaXBGZXRjaGVyKGRhdGFiaW5zU2F2ZXIsIG9wdGlvbnMpIHtcclxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG5cclxuXHR2YXIgaXNPcGVuQ2FsbGVkID0gZmFsc2U7XHJcblx0dmFyIHJlc29sdmVPcGVuID0gbnVsbDtcclxuXHR2YXIgcmVqZWN0T3BlbiA9IG51bGw7XHJcbiAgICB2YXIgcHJvZ3Jlc3Npb25PcmRlciA9ICdSUENMJztcclxuXHJcbiAgICB2YXIgbWF4Q2hhbm5lbHNJblNlc3Npb24gPSBvcHRpb25zLm1heENoYW5uZWxzSW5TZXNzaW9uIHx8IDE7XHJcbiAgICB2YXIgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwgPVxyXG4gICAgICAgIG9wdGlvbnMubWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwgfHwgMTtcclxuXHJcbiAgICAvL3ZhciBkYXRhYmluc1NhdmVyID0ganBpcEZhY3RvcnkuY3JlYXRlRGF0YWJpbnNTYXZlcigvKmlzSnBpcFRpbGVwYXJ0U3RyZWFtPSovZmFsc2UpO1xyXG4gICAgdmFyIG1haW5IZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRNYWluSGVhZGVyRGF0YWJpbigpO1xyXG5cclxuICAgIHZhciBtYXJrZXJzUGFyc2VyID0ganBpcEZhY3RvcnkuY3JlYXRlTWFya2Vyc1BhcnNlcihtYWluSGVhZGVyRGF0YWJpbik7XHJcbiAgICB2YXIgb2Zmc2V0c0NhbGN1bGF0b3IgPSBqcGlwRmFjdG9yeS5jcmVhdGVPZmZzZXRzQ2FsY3VsYXRvcihcclxuICAgICAgICBtYWluSGVhZGVyRGF0YWJpbiwgbWFya2Vyc1BhcnNlcik7XHJcbiAgICB2YXIgc3RydWN0dXJlUGFyc2VyID0ganBpcEZhY3RvcnkuY3JlYXRlU3RydWN0dXJlUGFyc2VyKFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXIsIG1hcmtlcnNQYXJzZXIsIG9mZnNldHNDYWxjdWxhdG9yKTtcclxuICAgIHZhciBjb2Rlc3RyZWFtU3RydWN0dXJlID0ganBpcEZhY3RvcnkuY3JlYXRlQ29kZXN0cmVhbVN0cnVjdHVyZShcclxuICAgICAgICBzdHJ1Y3R1cmVQYXJzZXIsIHByb2dyZXNzaW9uT3JkZXIpO1xyXG5cclxuXHR2YXIgcmVxdWVzdGVyID0ganBpcEZhY3RvcnkuY3JlYXRlUmVjb25uZWN0YWJsZVJlcXVlc3RlcihcclxuICAgICAgICBtYXhDaGFubmVsc0luU2Vzc2lvbixcclxuICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCxcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXIpO1xyXG5cclxuXHR2YXIgcGFyYW1zTW9kaWZpZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVSZXF1ZXN0UGFyYW1zTW9kaWZpZXIoY29kZXN0cmVhbVN0cnVjdHVyZSk7XHJcblxyXG5cdHJlcXVlc3Rlci5zZXRTdGF0dXNDYWxsYmFjayhyZXF1ZXN0ZXJTdGF0dXNDYWxsYmFjayk7XHJcbiAgICBcclxuICAgIHRoaXMub3BlbiA9IGZ1bmN0aW9uIG9wZW4oYmFzZVVybCkge1xyXG5cdFx0aWYgKGlzT3BlbkNhbGxlZCkge1xyXG5cdFx0XHR0aHJvdyAnd2ViSnBpcCBlcnJvcjogQ2Fubm90IGNhbGwgSnBpcEZldGNoZXIub3BlbigpIHR3aWNlJztcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG5cdFx0XHRyZXNvbHZlT3BlbiA9IHJlc29sdmU7XHJcblx0XHRcdHJlamVjdE9wZW4gPSByZWplY3Q7XHJcblx0XHRcdHJlcXVlc3Rlci5vcGVuKGJhc2VVcmwpO1xyXG5cdFx0fSk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNsb3NlID0gZnVuY3Rpb24gY2xvc2UoKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICByZXF1ZXN0ZXIuY2xvc2UocmVzb2x2ZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG4gICAgXHJcblx0dGhpcy5vbiA9IGZ1bmN0aW9uIG9uKCkge1xyXG5cdFx0Ly8gVE9ETyBXaGVuIEpwaXBGZXRjaGVyIGlzIGZ1bGx5IGFsaWduZWQgdG8gaW1hZ2VEZWNvZGVyRnJhbWV3b3JrIG5ldyBBUElcclxuXHR9O1xyXG5cclxuXHR0aGlzLnN0YXJ0RmV0Y2ggPSBmdW5jdGlvbiBzdGFydEZldGNoKGZldGNoQ29udGV4dCwgY29kZXN0cmVhbVBhcnRQYXJhbXMpIHtcclxuXHRcdHZhciBwYXJhbXMgPSBwYXJhbXNNb2RpZmllci5tb2RpZnkoY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG5cdFx0dmFyIGZldGNoID0gY3JlYXRlRmV0Y2goZmV0Y2hDb250ZXh0LCBwYXJhbXMucHJvZ3Jlc3NpdmVuZXNzKTtcclxuXHRcdFxyXG5cdFx0ZmV0Y2gubW92ZShwYXJhbXMuY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG5cdH07XHJcblxyXG5cdHRoaXMuc3RhcnRNb3ZhYmxlRmV0Y2ggPSBmdW5jdGlvbiBzdGFydE1vdmFibGVGZXRjaChmZXRjaENvbnRleHQsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKSB7XHJcblx0XHR2YXIgcGFyYW1zID0gcGFyYW1zTW9kaWZpZXIubW9kaWZ5KGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuXHRcdHZhciBmZXRjaCA9IGNyZWF0ZUZldGNoKGZldGNoQ29udGV4dCwgcGFyYW1zLnByb2dyZXNzaXZlbmVzcyk7XHJcblxyXG4gICAgICAgIHZhciBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlID0gcmVxdWVzdGVyLmRlZGljYXRlQ2hhbm5lbEZvck1vdmFibGVSZXF1ZXN0KCk7XHJcblx0XHRmZXRjaC5zZXREZWRpY2F0ZWRDaGFubmVsSGFuZGxlKGRlZGljYXRlZENoYW5uZWxIYW5kbGUpO1xyXG5cdFx0ZmV0Y2hDb250ZXh0Lm9uKCdtb3ZlJywgZmV0Y2gubW92ZSk7XHJcblxyXG5cdFx0ZmV0Y2gubW92ZShwYXJhbXMuY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG5cdH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUZldGNoKGZldGNoQ29udGV4dCwgcHJvZ3Jlc3NpdmVuZXNzKSB7XHJcbiAgICAgICAgLy92YXIgaW1hZ2VEYXRhQ29udGV4dCA9IGpwaXBGYWN0b3J5LmNyZWF0ZUltYWdlRGF0YUNvbnRleHQoXHJcbiAgICAgICAgLy8gICAganBpcE9iamVjdHNGb3JSZXF1ZXN0Q29udGV4dCxcclxuICAgICAgICAvLyAgICBjb2Rlc3RyZWFtUGFydFBhcmFtc01vZGlmaWVkLFxyXG4gICAgICAgIC8vICAgIHByb2dyZXNzaXZlbmVzc01vZGlmaWVkKTtcclxuICAgICAgICAvLyAgICAvL3tcclxuICAgICAgICAvLyAgICAvLyAgICBkaXNhYmxlU2VydmVyUmVxdWVzdHM6ICEhb3B0aW9ucy5pc09ubHlXYWl0Rm9yRGF0YSxcclxuICAgICAgICAvLyAgICAvLyAgICBpc01vdmFibGU6IGZhbHNlLFxyXG4gICAgICAgIC8vICAgIC8vICAgIHVzZXJDb250ZXh0VmFyczogdXNlckNvbnRleHRWYXJzLFxyXG4gICAgICAgIC8vICAgIC8vICAgIGZhaWx1cmVDYWxsYmFjazogb3B0aW9ucy5mYWlsdXJlQ2FsbGJhY2tcclxuICAgICAgICAvLyAgICAvL30pO1xyXG5cdFx0XHJcblx0XHR2YXIgZmV0Y2ggPSBqcGlwRmFjdG9yeS5jcmVhdGVGZXRjaChmZXRjaENvbnRleHQsIHJlcXVlc3RlciwgcHJvZ3Jlc3NpdmVuZXNzKTtcclxuXHJcblx0XHRmZXRjaENvbnRleHQub24oJ2lzUHJvZ3Jlc3NpdmVDaGFuZ2VkJywgZmV0Y2guaXNQcm9ncmVzc2l2ZUNoYW5nZWQpO1xyXG5cdFx0ZmV0Y2hDb250ZXh0Lm9uKCd0ZXJtaW5hdGUnLCBmZXRjaC50ZXJtaW5hdGUpO1xyXG5cdFx0ZmV0Y2hDb250ZXh0Lm9uKCdzdG9wJywgZmV0Y2guc3RvcCk7XHJcblx0XHRmZXRjaENvbnRleHQub24oJ3Jlc3VtZScsIGZldGNoLnJlc3VtKTtcclxuXHRcdFxyXG5cdFx0cmV0dXJuIGZldGNoO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvL3RoaXMuc3RhcnRNb3ZhYmxlRmV0Y2ggPSBmdW5jdGlvbiBzdGFydE1vdmFibGVGZXRjaChpbWFnZURhdGFDb250ZXh0LCBtb3ZhYmxlRmV0Y2hTdGF0ZSkge1xyXG4gICAgLy8gICAgbW92YWJsZUZldGNoU3RhdGUuZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSA9XHJcbiAgICAvLyAgICAgICAgcmVxdWVzdGVyLmRlZGljYXRlQ2hhbm5lbEZvck1vdmFibGVSZXF1ZXN0KCk7XHJcbiAgICAvLyAgICBtb3ZhYmxlRmV0Y2hTdGF0ZS5mZXRjaEhhbmRsZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZUZldGNoSGFuZGxlKFxyXG4gICAgLy8gICAgICAgIHJlcXVlc3RlciwgaW1hZ2VEYXRhQ29udGV4dCwgbW92YWJsZUZldGNoU3RhdGUuZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSk7XHJcbiAgICAvLyAgICBtb3ZhYmxlRmV0Y2hTdGF0ZS5mZXRjaEhhbmRsZS5yZXN1bWUoKTtcclxuICAgIC8vfTtcclxuICAgIC8vXHJcbiAgICAvL3RoaXMubW92ZUZldGNoID0gZnVuY3Rpb24gbW92ZUZldGNoKGltYWdlRGF0YUNvbnRleHQsIG1vdmFibGVGZXRjaFN0YXRlKSB7XHJcbiAgICAvLyAgICBtb3ZhYmxlRmV0Y2hTdGF0ZS5mZXRjaEhhbmRsZS5zdG9wQXN5bmMoKTtcclxuICAgIC8vICAgIG1vdmFibGVGZXRjaFN0YXRlLmZldGNoSGFuZGxlID0ganBpcEZhY3RvcnkuY3JlYXRlRmV0Y2hIYW5kbGUoXHJcbiAgICAvLyAgICAgICAgcmVxdWVzdGVyLCBpbWFnZURhdGFDb250ZXh0LCBtb3ZhYmxlRmV0Y2hTdGF0ZS5kZWRpY2F0ZWRDaGFubmVsSGFuZGxlKTtcclxuICAgIC8vICAgIG1vdmFibGVGZXRjaFN0YXRlLmZldGNoSGFuZGxlLnJlc3VtZSgpO1xyXG4gICAgLy99O1xyXG4gICAgXHJcbiAgICB0aGlzLnJlY29ubmVjdCA9IGZ1bmN0aW9uIHJlY29ubmVjdCgpIHtcclxuICAgICAgICByZXF1ZXN0ZXIucmVjb25uZWN0KCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiByZXF1ZXN0ZXJTdGF0dXNDYWxsYmFjayhyZXF1ZXN0ZXJTdGF0dXMpIHtcclxuICAgICAgICB2YXIgc2VyaWFsaXphYmxlRXhjZXB0aW9uID0gbnVsbDtcclxuICAgICAgICBpZiAocmVxdWVzdGVyU3RhdHVzLmV4Y2VwdGlvbiAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXJpYWxpemFibGVFeGNlcHRpb24gPSByZXF1ZXN0ZXJTdGF0dXMuZXhjZXB0aW9uLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGF0dXMgPSB7XHJcbiAgICAgICAgICAgIGlzUmVhZHk6IHJlcXVlc3RlclN0YXR1cy5pc1JlYWR5LFxyXG4gICAgICAgICAgICBleGNlcHRpb246IHNlcmlhbGl6YWJsZUV4Y2VwdGlvblxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG5cdFx0aWYgKCFyZXNvbHZlT3BlbiB8fCAoIXN0YXR1cy5pc1JlYWR5ICYmICFzdGF0dXMuZXhjZXB0aW9uKSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdHZhciBsb2NhbFJlc29sdmUgPSByZXNvbHZlT3BlbjtcclxuXHRcdHZhciBsb2NhbFJlamVjdCA9IHJlamVjdE9wZW47XHJcblx0XHRyZXNvbHZlT3BlbiA9IG51bGw7XHJcblx0XHRyZWplY3RPcGVuID0gbnVsbDtcclxuXHJcblx0XHRpZiAoIXN0YXR1cy5pc1JlYWR5KSB7XHJcblx0XHRcdGxvY2FsUmVqZWN0KHN0YXR1cy5leGNlcHRpb24pO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRcclxuICAgICAgICB2YXIgcGFyYW1zID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRTaXplc1BhcmFtcygpO1xyXG4gICAgICAgIHZhciBjbG9uZWRQYXJhbXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHBhcmFtcykpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXREZWZhdWx0VGlsZVN0cnVjdHVyZSgpO1xyXG4gICAgICAgIHZhciBjb21wb25lbnQgPSB0aWxlLmdldERlZmF1bHRDb21wb25lbnRTdHJ1Y3R1cmUoKTtcclxuXHJcblx0XHRjbG9uZWRQYXJhbXMuaW1hZ2VMZXZlbCA9IDA7XHJcblx0XHRjbG9uZWRQYXJhbXMubG93ZXN0UXVhbGl0eSA9IDE7XHJcbiAgICAgICAgY2xvbmVkUGFyYW1zLmhpZ2hlc3RRdWFsaXR5ID0gdGlsZS5nZXROdW1RdWFsaXR5TGF5ZXJzKCk7XHJcbiAgICAgICAgY2xvbmVkUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNGb3JMaW1pdHRlZFZpZXdlciA9XHJcbiAgICAgICAgICAgIGNvbXBvbmVudC5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgXHJcblx0XHRsb2NhbFJlc29sdmUoY2xvbmVkUGFyYW1zKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEpwaXBJbWFnZURhdGFDb250ZXh0O1xyXG5cclxuZnVuY3Rpb24gSnBpcEltYWdlRGF0YUNvbnRleHQoanBpcE9iamVjdHMsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBwcm9ncmVzc2l2ZW5lc3MpIHtcclxuICAgIHRoaXMuX2NvZGVzdHJlYW1QYXJ0UGFyYW1zID0gY29kZXN0cmVhbVBhcnRQYXJhbXM7XHJcbiAgICB0aGlzLl9wcm9ncmVzc2l2ZW5lc3MgICAgICA9IHByb2dyZXNzaXZlbmVzcztcclxuICAgIHRoaXMuX3JlY29uc3RydWN0b3IgICAgICAgID0ganBpcE9iamVjdHMucmVjb25zdHJ1Y3RvcjtcclxuICAgIHRoaXMuX3BhY2tldHNEYXRhQ29sbGVjdG9yID0ganBpcE9iamVjdHMucGFja2V0c0RhdGFDb2xsZWN0b3I7XHJcbiAgICB0aGlzLl9xdWFsaXR5TGF5ZXJzQ2FjaGUgICA9IGpwaXBPYmplY3RzLnF1YWxpdHlMYXllcnNDYWNoZTtcclxuICAgIHRoaXMuX2NvZGVzdHJlYW1TdHJ1Y3R1cmUgID0ganBpcE9iamVjdHMuY29kZXN0cmVhbVN0cnVjdHVyZTtcclxuICAgIHRoaXMuX2RhdGFiaW5zU2F2ZXIgICAgICAgID0ganBpcE9iamVjdHMuZGF0YWJpbnNTYXZlcjtcclxuICAgIHRoaXMuX2pwaXBGYWN0b3J5ICAgICAgICAgID0ganBpcE9iamVjdHMuanBpcEZhY3Rvcnk7XHJcblxyXG4gICAgdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9IDA7XHJcbiAgICB0aGlzLl9xdWFsaXR5TGF5ZXJzUmVhY2hlZCA9IDA7XHJcbiAgICB0aGlzLl9kYXRhTGlzdGVuZXJzID0gW107XHJcbiAgICBcclxuICAgIHRoaXMuX2xpc3RlbmVyID0gdGhpcy5fanBpcEZhY3RvcnkuY3JlYXRlUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgdGhpcy5fcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrLmJpbmQodGhpcyksXHJcbiAgICAgICAgdGhpcy5fY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICB0aGlzLl9kYXRhYmluc1NhdmVyLFxyXG4gICAgICAgIHRoaXMuX3F1YWxpdHlMYXllcnNDYWNoZSk7XHJcbn1cclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5oYXNEYXRhID0gZnVuY3Rpb24gaGFzRGF0YSgpIHtcclxuICAgIC8vZW5zdXJlTm9GYWlsdXJlKCk7XHJcbiAgICB0aGlzLl9lbnN1cmVOb3REaXNwb3NlZCgpO1xyXG4gICAgcmV0dXJuIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWQgPiAwO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmdldEZldGNoZWREYXRhID0gZnVuY3Rpb24gZ2V0RmV0Y2hlZERhdGEocXVhbGl0eSkge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIGlmICghdGhpcy5oYXNEYXRhKCkpIHtcclxuICAgICAgICB0aHJvdyAnSnBpcEltYWdlRGF0YUNvbnRleHQgZXJyb3I6IGNhbm5vdCBjYWxsIGdldEZldGNoZWREYXRhIGJlZm9yZSBoYXNEYXRhID0gdHJ1ZSc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vZW5zdXJlTm9GYWlsdXJlKCk7XHJcbiAgICB2YXIgcGFyYW1zID0gdGhpcy5fZ2V0UGFyYW1zRm9yRGF0YVdyaXRlcihxdWFsaXR5KTtcclxuICAgIHZhciBjb2RlYmxvY2tzID0gdGhpcy5fcGFja2V0c0RhdGFDb2xsZWN0b3IuZ2V0QWxsQ29kZWJsb2Nrc0RhdGEoXHJcbiAgICAgICAgcGFyYW1zLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIHBhcmFtcy5taW5OdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgIFxyXG4gICAgdmFyIGhlYWRlcnNDb2Rlc3RyZWFtID0gdGhpcy5fcmVjb25zdHJ1Y3Rvci5jcmVhdGVDb2Rlc3RyZWFtRm9yUmVnaW9uKFxyXG4gICAgICAgIHBhcmFtcy5jb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICBwYXJhbXMubWluTnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICAvKmlzT25seUhlYWRlcnNXaXRob3V0Qml0c3RyZWFtPSovdHJ1ZSk7XHJcbiAgICBcclxuICAgIGlmIChjb2RlYmxvY2tzLmNvZGVibG9ja3NEYXRhID09PSBudWxsKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICdDb3VsZCBub3QgY29sbGVjdCBjb2RlYmxvY2tzIGFsdGhvdWdoIHByb2dyZXNzaXZlbmVzcyAnICtcclxuICAgICAgICAgICAgJ3N0YWdlIGhhcyBiZWVuIHJlYWNoZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGhlYWRlcnNDb2Rlc3RyZWFtID09PSBudWxsKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICdDb3VsZCBub3QgcmVjb25zdHJ1Y3QgY29kZXN0cmVhbSBhbHRob3VnaCAnICtcclxuICAgICAgICAgICAgJ3Byb2dyZXNzaXZlbmVzcyBzdGFnZSBoYXMgYmVlbiByZWFjaGVkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vYWxyZWFkeVJldHVybmVkQ29kZWJsb2NrcyA9IGNvZGVibG9ja3MuYWxyZWFkeVJldHVybmVkQ29kZWJsb2NrcztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgaGVhZGVyc0NvZGVzdHJlYW06IGhlYWRlcnNDb2Rlc3RyZWFtLFxyXG4gICAgICAgIGNvZGVibG9ja3NEYXRhOiBjb2RlYmxvY2tzLmNvZGVibG9ja3NEYXRhLFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zOiB0aGlzLl9jb2Rlc3RyZWFtUGFydFBhcmFtc1xyXG4gICAgfTtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5nZXRGZXRjaGVkRGF0YUFzQ29kZXN0cmVhbSA9IGZ1bmN0aW9uIGdldEZldGNoZWREYXRhQXNDb2Rlc3RyZWFtKHF1YWxpdHkpIHtcclxuICAgIHRoaXMuX2Vuc3VyZU5vdERpc3Bvc2VkKCk7XHJcbiAgICAvL2Vuc3VyZU5vRmFpbHVyZSgpO1xyXG4gICAgXHJcbiAgICB2YXIgcGFyYW1zID0gdGhpcy5fZ2V0UGFyYW1zRm9yRGF0YVdyaXRlcihxdWFsaXR5KTtcclxuICAgIFxyXG4gICAgdmFyIGNvZGVzdHJlYW0gPSB0aGlzLl9yZWNvbnN0cnVjdG9yLmNyZWF0ZUNvZGVzdHJlYW1Gb3JSZWdpb24oXHJcbiAgICAgICAgcGFyYW1zLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIHBhcmFtcy5taW5OdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgIFxyXG4gICAgaWYgKGNvZGVzdHJlYW0gPT09IG51bGwpIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0NvdWxkIG5vdCByZWNvbnN0cnVjdCBjb2Rlc3RyZWFtIGFsdGhvdWdoICcgK1xyXG4gICAgICAgICAgICAncHJvZ3Jlc3NpdmVuZXNzIHN0YWdlIGhhcyBiZWVuIHJlYWNoZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIGNvZGVzdHJlYW07XHJcbn07XHJcblxyXG5KcGlwSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUub24gPSBmdW5jdGlvbiBvbihldmVudCwgbGlzdGVuZXIpIHtcclxuICAgIHRoaXMuX2Vuc3VyZU5vdERpc3Bvc2VkKCk7XHJcbiAgICBpZiAoZXZlbnQgIT09ICdkYXRhJykge1xyXG4gICAgICAgIHRocm93ICdKcGlwSW1hZ2VEYXRhQ29udGV4dCBlcnJvcjogVW5leHBlY3RlZCBldmVudCAnICsgZXZlbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XHJcbn07XHJcblxyXG5KcGlwSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuaXNEb25lID0gZnVuY3Rpb24gaXNEb25lKCkge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIHJldHVybiB0aGlzLl9pc1JlcXVlc3REb25lO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmRpc3Bvc2UgPSBmdW5jdGlvbiBkaXNwb3NlKCkge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIHRoaXMuX2xpc3RlbmVyLnVucmVnaXN0ZXIoKTtcclxuICAgIHRoaXMuX2xpc3RlbmVyID0gbnVsbDtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5zZXRJc1Byb2dyZXNzaXZlID0gZnVuY3Rpb24gc2V0SXNQcm9ncmVzc2l2ZShpc1Byb2dyZXNzaXZlKSB7XHJcbiAgICB0aGlzLl9lbnN1cmVOb3REaXNwb3NlZCgpO1xyXG4gICAgdmFyIG9sZElzUHJvZ3Jlc3NpdmUgPSB0aGlzLl9pc1Byb2dyZXNzaXZlO1xyXG4gICAgdGhpcy5faXNQcm9ncmVzc2l2ZSA9IGlzUHJvZ3Jlc3NpdmU7XHJcbiAgICBpZiAoIW9sZElzUHJvZ3Jlc3NpdmUgJiYgaXNQcm9ncmVzc2l2ZSAmJiB0aGlzLmhhc0RhdGEoKSkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fZGF0YUxpc3RlbmVycy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB0aGlzLl9kYXRhTGlzdGVuZXJzW2ldKHRoaXMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcbi8vIE1ldGhvZHMgZm9yIEpwaXBGZXRjaEhhbmRsZVxyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmlzRGlzcG9zZWQgPSBmdW5jdGlvbiBpc0Rpc3Bvc2VkKCkge1xyXG4gICAgcmV0dXJuICF0aGlzLl9saXN0ZW5lcjtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5nZXRDb2Rlc3RyZWFtUGFydFBhcmFtcyA9XHJcbiAgICBmdW5jdGlvbiBnZXRDb2Rlc3RyZWFtUGFydFBhcmFtcygpIHtcclxuICAgICAgICBcclxuICAgIHJldHVybiB0aGlzLl9jb2Rlc3RyZWFtUGFydFBhcmFtcztcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5nZXROZXh0UXVhbGl0eUxheWVyID1cclxuICAgIGZ1bmN0aW9uIGdldE5leHRRdWFsaXR5TGF5ZXIoKSB7XHJcbiAgICAgICAgXHJcbiAgICByZXR1cm4gdGhpcy5fcHJvZ3Jlc3NpdmVuZXNzW3RoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWRdLm1pbk51bVF1YWxpdHlMYXllcnM7XHJcbn07XHJcblxyXG4vLyBQcml2YXRlIG1ldGhvZHNcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5fdHJ5QWR2YW5jZVByb2dyZXNzaXZlU3RhZ2UgPSBmdW5jdGlvbiB0cnlBZHZhbmNlUHJvZ3Jlc3NpdmVTdGFnZSgpIHtcclxuICAgIHZhciBudW1RdWFsaXR5TGF5ZXJzVG9XYWl0ID0gdGhpcy5fcHJvZ3Jlc3NpdmVuZXNzW1xyXG4gICAgICAgIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWRdLm1pbk51bVF1YWxpdHlMYXllcnM7XHJcblxyXG4gICAgaWYgKHRoaXMuX3F1YWxpdHlMYXllcnNSZWFjaGVkIDwgbnVtUXVhbGl0eUxheWVyc1RvV2FpdCkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX3F1YWxpdHlMYXllcnNSZWFjaGVkID09PSAnbWF4Jykge1xyXG4gICAgICAgIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWQgPSB0aGlzLl9wcm9ncmVzc2l2ZW5lc3MubGVuZ3RoO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB3aGlsZSAodGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA8IHRoaXMuX3Byb2dyZXNzaXZlbmVzcy5sZW5ndGgpIHtcclxuICAgICAgICB2YXIgcXVhbGl0eUxheWVyc1JlcXVpcmVkID0gdGhpcy5fcHJvZ3Jlc3NpdmVuZXNzW1xyXG4gICAgICAgICAgICB0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkXS5taW5OdW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChxdWFsaXR5TGF5ZXJzUmVxdWlyZWQgPT09ICdtYXgnIHx8XHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllcnNSZXF1aXJlZCA+IHRoaXMuX3F1YWxpdHlMYXllcnNSZWFjaGVkKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgKyt0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLl9pc1JlcXVlc3REb25lID0gdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9PT0gdGhpcy5fcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aDtcclxuXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5fcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrID0gZnVuY3Rpb24gcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrKHF1YWxpdHlMYXllcnNSZWFjaGVkKSB7XHJcbiAgICB0aGlzLl9xdWFsaXR5TGF5ZXJzUmVhY2hlZCA9IHF1YWxpdHlMYXllcnNSZWFjaGVkO1xyXG4gICAgXHJcbiAgICBpZiAodGhpcy5faXNSZXF1ZXN0RG9uZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnUmVxdWVzdCBhbHJlYWR5IGRvbmUgYnV0IGNhbGxiYWNrIGlzIGNhbGxlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMuX3RyeUFkdmFuY2VQcm9ncmVzc2l2ZVN0YWdlKCkpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdGhpcy5faXNQcm9ncmVzc2l2ZSAmJiAhdGhpcy5faXNSZXF1ZXN0RG9uZSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLl9kYXRhTGlzdGVuZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgdGhpcy5fZGF0YUxpc3RlbmVyc1tpXSh0aGlzKTtcclxuICAgIH1cclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5fZ2V0UGFyYW1zRm9yRGF0YVdyaXRlciA9IGZ1bmN0aW9uIGdldFBhcmFtc0ZvckRhdGFXcml0ZXIocXVhbGl0eSkge1xyXG4gICAgLy9lbnN1cmVOb3RFbmRlZChzdGF0dXMsIC8qYWxsb3dab21iaWU9Ki90cnVlKTtcclxuICAgIFxyXG4gICAgLy9pZiAoY29kZXN0cmVhbVBhcnRQYXJhbXMgPT09IG51bGwpIHtcclxuICAgIC8vICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKCdDYW5ub3QgJyArXHJcbiAgICAvLyAgICAgICAgJ2dldCBkYXRhIG9mIHpvbWJpZSByZXF1ZXN0IHdpdGggbm8gY29kZXN0cmVhbVBhcnRQYXJhbXMnKTtcclxuICAgIC8vfVxyXG4gICAgXHJcbiAgICAvL3ZhciBpc1JlcXVlc3REb25lID0gcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9PT0gcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aDtcclxuICAgIC8vaWYgKCFpc1JlcXVlc3REb25lKSB7XHJcbiAgICAvLyAgICBlbnN1cmVOb3RXYWl0aW5nRm9yVXNlcklucHV0KHN0YXR1cyk7XHJcbiAgICAvL31cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWQgPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0Nhbm5vdCBjcmVhdGUgY29kZXN0cmVhbSBiZWZvcmUgZmlyc3QgcHJvZ3Jlc3NpdmVuZXNzICcgK1xyXG4gICAgICAgICAgICAnc3RhZ2UgaGFzIGJlZW4gcmVhY2hlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgbWluTnVtUXVhbGl0eUxheWVycyA9XHJcbiAgICAgICAgdGhpcy5fcHJvZ3Jlc3NpdmVuZXNzW3RoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWQgLSAxXS5taW5OdW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgXHJcbiAgICB2YXIgbmV3UGFyYW1zID0gdGhpcy5fY29kZXN0cmVhbVBhcnRQYXJhbXM7XHJcbiAgICBpZiAocXVhbGl0eSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgbmV3UGFyYW1zID0gT2JqZWN0LmNyZWF0ZSh0aGlzLl9jb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgbmV3UGFyYW1zLnF1YWxpdHkgPSBxdWFsaXR5O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzICE9PSAnbWF4Jykge1xyXG4gICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzLCBxdWFsaXR5KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXM6IG5ld1BhcmFtcyxcclxuICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzOiBtaW5OdW1RdWFsaXR5TGF5ZXJzXHJcbiAgICAgICAgfTtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5fZW5zdXJlTm90RGlzcG9zZWQgPSBmdW5jdGlvbiBlbnN1cmVOb3REaXNwb3NlZCgpIHtcclxuICAgIGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKCdDYW5ub3QgdXNlIEltYWdlRGF0YUNvbnRleHQgYWZ0ZXIgZGlzcG9zZWQnKTtcclxuICAgIH1cclxufTtcclxuIiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpwaXBGYWN0b3J5ID0gcmVxdWlyZSgnanBpcC1ydW50aW1lLWZhY3RvcnkuanMnKTsgXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEpwaXBJbWFnZTtcclxuXHJcbmZ1bmN0aW9uIEpwaXBJbWFnZShvcHRpb25zKSB7XHJcbiAgICB2YXIgZGF0YWJpbnNTYXZlciA9IGpwaXBGYWN0b3J5LmNyZWF0ZURhdGFiaW5zU2F2ZXIoLyppc0pwaXBUaWxlcGFydFN0cmVhbT0qL2ZhbHNlKTtcclxuICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuXHJcbiAgICB2YXIgbWFya2Vyc1BhcnNlciA9IGpwaXBGYWN0b3J5LmNyZWF0ZU1hcmtlcnNQYXJzZXIobWFpbkhlYWRlckRhdGFiaW4pO1xyXG4gICAgdmFyIG9mZnNldHNDYWxjdWxhdG9yID0ganBpcEZhY3RvcnkuY3JlYXRlT2Zmc2V0c0NhbGN1bGF0b3IoXHJcbiAgICAgICAgbWFpbkhlYWRlckRhdGFiaW4sIG1hcmtlcnNQYXJzZXIpO1xyXG4gICAgdmFyIHN0cnVjdHVyZVBhcnNlciA9IGpwaXBGYWN0b3J5LmNyZWF0ZVN0cnVjdHVyZVBhcnNlcihcclxuICAgICAgICBkYXRhYmluc1NhdmVyLCBtYXJrZXJzUGFyc2VyLCBvZmZzZXRzQ2FsY3VsYXRvcik7XHJcbiAgICBcclxuICAgIHZhciBwcm9ncmVzc2lvbk9yZGVyID0gJ1JQQ0wnO1xyXG4gICAgdmFyIGNvZGVzdHJlYW1TdHJ1Y3R1cmUgPSBqcGlwRmFjdG9yeS5jcmVhdGVDb2Rlc3RyZWFtU3RydWN0dXJlKFxyXG4gICAgICAgIHN0cnVjdHVyZVBhcnNlciwgcHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICBcclxuICAgIHZhciBxdWFsaXR5TGF5ZXJzQ2FjaGUgPSBqcGlwRmFjdG9yeS5jcmVhdGVRdWFsaXR5TGF5ZXJzQ2FjaGUoXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgaGVhZGVyTW9kaWZpZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVIZWFkZXJNb2RpZmllcihcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBvZmZzZXRzQ2FsY3VsYXRvciwgcHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICB2YXIgcmVjb25zdHJ1Y3RvciA9IGpwaXBGYWN0b3J5LmNyZWF0ZUNvZGVzdHJlYW1SZWNvbnN0cnVjdG9yKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGRhdGFiaW5zU2F2ZXIsIGhlYWRlck1vZGlmaWVyLCBxdWFsaXR5TGF5ZXJzQ2FjaGUpO1xyXG4gICAgdmFyIHBhY2tldHNEYXRhQ29sbGVjdG9yID0ganBpcEZhY3RvcnkuY3JlYXRlUGFja2V0c0RhdGFDb2xsZWN0b3IoXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSwgZGF0YWJpbnNTYXZlciwgcXVhbGl0eUxheWVyc0NhY2hlKTtcclxuICAgIFxyXG4gICAgdmFyIGpwaXBPYmplY3RzRm9yUmVxdWVzdENvbnRleHQgPSB7XHJcbiAgICAgICAgcmVjb25zdHJ1Y3RvcjogcmVjb25zdHJ1Y3RvcixcclxuICAgICAgICBwYWNrZXRzRGF0YUNvbGxlY3RvcjogcGFja2V0c0RhdGFDb2xsZWN0b3IsXHJcbiAgICAgICAgcXVhbGl0eUxheWVyc0NhY2hlOiBxdWFsaXR5TGF5ZXJzQ2FjaGUsXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZTogY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyOiBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgIGpwaXBGYWN0b3J5OiBqcGlwRmFjdG9yeVxyXG5cdH07XHJcblx0XHJcblx0dmFyIHBhcmFtc01vZGlmaWVyID0ganBpcEZhY3RvcnkuY3JlYXRlUmVxdWVzdFBhcmFtc01vZGlmaWVyKGNvZGVzdHJlYW1TdHJ1Y3R1cmUpO1xyXG5cclxuXHR2YXIgaW1hZ2VQYXJhbXMgPSBudWxsO1xyXG5cdHZhciBsZXZlbENhbGN1bGF0b3IgPSBudWxsO1xyXG5cdFxyXG5cdHZhciBmZXRjaGVyID0ganBpcEZhY3RvcnkuY3JlYXRlRmV0Y2hlcihkYXRhYmluc1NhdmVyLCBvcHRpb25zKTsgLy8gVE9ETzogV29ya2VyUHJveHlGZXRjaGVyXHJcblx0Ly9mdW5jdGlvbiBHcmlkSW1hZ2VCYXNlKCkge1xyXG5cdC8vXHR0aGlzLl9mZXRjaGVyID0gZmV0Y2hlcjtcclxuXHQvL1x0dGhpcy5faW1hZ2VQYXJhbXMgPSBudWxsO1xyXG5cdC8vXHR0aGlzLl93YWl0aW5nRmV0Y2hlcyA9IHt9O1xyXG5cdC8vXHR0aGlzLl9sZXZlbENhbGN1bGF0b3IgPSBudWxsO1xyXG5cdC8vfVxyXG5cclxuXHR0aGlzLm9wZW5lZCA9IGZ1bmN0aW9uIG9wZW5lZChpbWFnZURlY29kZXIpIHtcclxuXHRcdGltYWdlUGFyYW1zID0gaW1hZ2VEZWNvZGVyLmdldEltYWdlUGFyYW1zKCk7XHJcblx0XHQvL2ltYWdlRGVjb2Rlci5vbkZldGNoZXJFdmVudCgnZGF0YScsIHRoaXMuX29uRGF0YUZldGNoZWQuYmluZCh0aGlzKSk7XHJcblx0XHQvL2ltYWdlRGVjb2Rlci5vbkZldGNoZXJFdmVudCgndGlsZS10ZXJtaW5hdGVkJywgdGhpcy5fb25UaWxlVGVybWluYXRlZC5iaW5kKHRoaXMpKTtcclxuXHR9O1xyXG5cclxuXHR0aGlzLmdldExldmVsQ2FsY3VsYXRvciA9IGZ1bmN0aW9uIGdldExldmVsQ2FsY3VsYXRvcigpIHtcclxuXHRcdGlmIChsZXZlbENhbGN1bGF0b3IgPT09IG51bGwpIHtcclxuXHRcdFx0bGV2ZWxDYWxjdWxhdG9yID0ganBpcEZhY3RvcnkuY3JlYXRlTGV2ZWxDYWxjdWxhdG9yKGltYWdlUGFyYW1zKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBsZXZlbENhbGN1bGF0b3I7XHJcblx0fTtcclxuXHJcblx0dGhpcy5nZXREZWNvZGVyV29ya2Vyc0lucHV0UmV0cmVpdmVyID0gZnVuY3Rpb24gZ2V0RGVjb2RlcldvcmtlcnNJbnB1dFJldHJlaXZlcigpIHtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH07XHJcblx0XHJcblx0dGhpcy5nZXRGZXRjaGVyID0gZnVuY3Rpb24gZ2V0RmV0Y2hlcigpIHtcclxuXHRcdHJldHVybiBmZXRjaGVyO1xyXG5cdH07XHJcblxyXG5cdHRoaXMuZ2V0V29ya2VyVHlwZU9wdGlvbnMgPSBmdW5jdGlvbiBnZXRXb3JrZXJUeXBlT3B0aW9ucyh0YXNrVHlwZSkge1xyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0Y3Rvck5hbWU6ICd3ZWJqcGlwLlBkZmpzSnB4RGVjb2RlcicsXHJcblx0XHRcdGN0b3JBcmdzOiBbXSxcclxuXHRcdFx0c2NyaXB0c1RvSW1wb3J0OiBbZ2V0U2NyaXB0TmFtZShuZXcgRXJyb3IoKSldXHJcblx0XHR9O1xyXG5cdH07XHJcblxyXG5cdHRoaXMuZ2V0S2V5QXNTdHJpbmcgPSBmdW5jdGlvbiBnZXRLZXlBc1N0cmluZyhrZXkpIHtcclxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShrZXkpO1xyXG5cdH07XHJcblxyXG5cdHRoaXMudGFza1N0YXJ0ZWQgPSBmdW5jdGlvbiB0YXNrU3RhcnRlZCh0YXNrKSB7XHJcblx0XHR2YXIgcGFyYW1zID0gcGFyYW1zTW9kaWZpZXIubW9kaWZ5KC8qY29kZXN0cmVhbVRhc2tQYXJhbXM9Ki90YXNrLmtleSk7XHJcblx0XHR2YXIgY29udGV4dCA9IGpwaXBGYWN0b3J5LmNyZWF0ZUltYWdlRGF0YUNvbnRleHQoXHJcblx0XHRcdGpwaXBPYmplY3RzRm9yUmVxdWVzdENvbnRleHQsXHJcblx0XHRcdHBhcmFtcy5jb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuXHRcdFx0cGFyYW1zLnByb2dyZXNzaXZlbmVzcyk7XHJcblx0XHRcclxuXHRcdGNvbnRleHQub24oJ2RhdGEnLCBvbkRhdGEpO1xyXG5cdFx0aWYgKGNvbnRleHQuaGFzRGF0YSgpKSB7XHJcblx0XHRcdG9uRGF0YShjb250ZXh0KTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0ZnVuY3Rpb24gb25EYXRhKGNvbnRleHRfKSB7XHJcblx0XHRcdGlmIChjb250ZXh0ICE9PSBjb250ZXh0Xykge1xyXG5cdFx0XHRcdHRocm93ICd3ZWJqcGlwIGVycm9yOiBVbmV4cGVjdGVkIGNvbnRleHQgaW4gZGF0YSBldmVudCc7XHJcblx0XHRcdH1cclxuXHRcdFx0XHJcblx0XHRcdC8vIFRPRE86IEZpcnN0IHF1YWxpdHkgbGF5ZXJcclxuXHRcdFx0dmFyIGRhdGEgPSBjb250ZXh0LmdldEZldGNoZWREYXRhKCk7XHJcblx0XHRcdHRhc2suZGF0YVJlYWR5KGRhdGEpO1xyXG5cdFx0XHRcclxuXHRcdFx0aWYgKGNvbnRleHQuaXNEb25lKCkpIHtcclxuXHRcdFx0XHR0YXNrLnRlcm1pbmF0ZSgpO1xyXG5cdFx0XHRcdGNvbnRleHQuZGlzcG9zZSgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0U2NyaXB0TmFtZShlcnJvcldpdGhTdGFja1RyYWNlKSB7XHJcblx0dmFyIHN0YWNrID0gZXJyb3JXaXRoU3RhY2tUcmFjZS5zdGFjay50cmltKCk7XHJcblx0XHJcblx0dmFyIGN1cnJlbnRTdGFja0ZyYW1lUmVnZXggPSAvYXQgKHxbXiBdKyBcXCgpKFteIF0rKTpcXGQrOlxcZCsvO1xyXG5cdHZhciBzb3VyY2UgPSBjdXJyZW50U3RhY2tGcmFtZVJlZ2V4LmV4ZWMoc3RhY2spO1xyXG5cdGlmIChzb3VyY2UgJiYgc291cmNlWzJdICE9PSBcIlwiKSB7XHJcblx0XHRyZXR1cm4gc291cmNlWzJdO1xyXG5cdH1cclxuXHJcblx0dmFyIGxhc3RTdGFja0ZyYW1lUmVnZXggPSBuZXcgUmVnRXhwKC8uK1xcLyguKj8pOlxcZCsoOlxcZCspKiQvKTtcclxuXHRzb3VyY2UgPSBsYXN0U3RhY2tGcmFtZVJlZ2V4LmV4ZWMoc3RhY2spO1xyXG5cdGlmIChzb3VyY2UgJiYgc291cmNlWzFdICE9PSBcIlwiKSB7XHJcblx0XHRyZXR1cm4gc291cmNlWzFdO1xyXG5cdH1cclxuXHRcclxuXHRpZiAoZXJyb3JXaXRoU3RhY2tUcmFjZS5maWxlTmFtZSAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRyZXR1cm4gZXJyb3JXaXRoU3RhY2tUcmFjZS5maWxlTmFtZTtcclxuXHR9XHJcblx0XHJcblx0dGhyb3cgJ0ltYWdlRGVjb2RlckZyYW1ld29yay5qczogQ291bGQgbm90IGdldCBjdXJyZW50IHNjcmlwdCBVUkwnO1xyXG59IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG52YXIgTE9HMiA9IE1hdGgubG9nKDIpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwTGV2ZWxDYWxjdWxhdG9yKFxyXG4gICAgcGFyYW1zKSB7XHJcbiAgICBcclxuICAgIHZhciBFREdFX1RZUEVfTk9fRURHRSA9IDA7XHJcbiAgICB2YXIgRURHRV9UWVBFX0ZJUlNUID0gMTtcclxuICAgIHZhciBFREdFX1RZUEVfTEFTVCA9IDI7XHJcblxyXG4gICAgdGhpcy5FREdFX1RZUEVfTk9fRURHRSA9IEVER0VfVFlQRV9OT19FREdFO1xyXG4gICAgdGhpcy5FREdFX1RZUEVfRklSU1QgPSBFREdFX1RZUEVfRklSU1Q7XHJcbiAgICB0aGlzLkVER0VfVFlQRV9MQVNUID0gRURHRV9UWVBFX0xBU1Q7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0U2l6ZU9mUGFydCA9IGdldFNpemVPZlBhcnQ7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZXNGcm9tUGl4ZWxzID0gZ2V0VGlsZXNGcm9tUGl4ZWxzO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE51bVRpbGVzWCA9IGdldE51bVRpbGVzWDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1UaWxlc1kgPSBnZXROdW1UaWxlc1k7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZVdpZHRoID0gZ2V0VGlsZVdpZHRoO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVIZWlnaHQgPSBnZXRUaWxlSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZU9mZnNldFggPSBnZXRGaXJzdFRpbGVPZmZzZXRYO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZU9mZnNldFkgPSBnZXRGaXJzdFRpbGVPZmZzZXRZO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZVdpZHRoID0gZ2V0Rmlyc3RUaWxlV2lkdGg7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RUaWxlSGVpZ2h0ID0gZ2V0Rmlyc3RUaWxlSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB0aGlzLmlzRWRnZVRpbGVJZCA9IGlzRWRnZVRpbGVJZDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlU2l6ZSA9IGdldFRpbGVTaXplO1xyXG4gICAgXHJcbiAgICAvLyBQdWJsaWMgbWV0aG9kcyBmb3IgaW1hZ2VEZWNvZGVyRnJhbWV3b3JrLmpzXHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TGV2ZWxXaWR0aCA9IGdldExldmVsV2lkdGg7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TGV2ZWxIZWlnaHQgPSBnZXRMZXZlbEhlaWdodDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJbWFnZUxldmVsID0gZnVuY3Rpb24gZ2V0SW1hZ2VMZXZlbCgpIHtcclxuICAgICAgICByZXR1cm4gMDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TGV2ZWwgPSBmdW5jdGlvbiBnZXRMZXZlbChyZWdpb25JbWFnZUxldmVsKSB7XHJcbiAgICAgICAgaWYgKHBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzRm9yTGltaXR0ZWRWaWV3ZXIgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyAnVGhpcyBtZXRob2QgaXMgYXZhaWxhYmxlIG9ubHkgd2hlbiBqcGlwU2l6ZXNDYWxjdWxhdG9yICcgK1xyXG4gICAgICAgICAgICAgICAgJ2lzIGNyZWF0ZWQgZnJvbSBwYXJhbXMgcmV0dXJuZWQgYnkganBpcENvZGVzdHJlYW1DbGllbnQuICcgK1xyXG4gICAgICAgICAgICAgICAgJ0l0IHNoYWxsIGJlIHVzZWQgZm9yIEpQSVAgQVBJIHB1cnBvc2VzIG9ubHknO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuXHRcdHZhciBsZXZlbFggPSBNYXRoLmxvZygocmVnaW9uSW1hZ2VMZXZlbC5tYXhYRXhjbHVzaXZlIC0gcmVnaW9uSW1hZ2VMZXZlbC5taW5YKSAvIHJlZ2lvbkltYWdlTGV2ZWwuc2NyZWVuV2lkdGggKSAvIExPRzI7XHJcblx0XHR2YXIgbGV2ZWxZID0gTWF0aC5sb2coKHJlZ2lvbkltYWdlTGV2ZWwubWF4WUV4Y2x1c2l2ZSAtIHJlZ2lvbkltYWdlTGV2ZWwubWluWSkgLyByZWdpb25JbWFnZUxldmVsLnNjcmVlbkhlaWdodCkgLyBMT0cyO1xyXG5cdFx0dmFyIGxldmVsID0gTWF0aC5jZWlsKE1hdGgubWF4KGxldmVsWCwgbGV2ZWxZKSk7XHJcblx0XHRsZXZlbCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzRm9yTGltaXR0ZWRWaWV3ZXIgLSAxLCBsZXZlbCkpO1xyXG5cdFx0cmV0dXJuIGxldmVsO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzRm9yTGltaXR0ZWRWaWV3ZXIgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldE51bVJlc29sdXRpb25MZXZlbHNGb3JMaW1pdHRlZFZpZXdlcigpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNGb3JMaW1pdHRlZFZpZXdlciA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93ICdUaGlzIG1ldGhvZCBpcyBhdmFpbGFibGUgb25seSB3aGVuIGpwaXBTaXplc0NhbGN1bGF0b3IgJyArXHJcbiAgICAgICAgICAgICAgICAnaXMgY3JlYXRlZCBmcm9tIHBhcmFtcyByZXR1cm5lZCBieSBqcGlwQ29kZXN0cmVhbUNsaWVudC4gJyArXHJcbiAgICAgICAgICAgICAgICAnSXQgc2hhbGwgYmUgdXNlZCBmb3IgSlBJUCBBUEkgcHVycG9zZXMgb25seSc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc0ZvckxpbWl0dGVkVmlld2VyO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMb3dlc3RRdWFsaXR5ID0gZnVuY3Rpb24gZ2V0TG93ZXN0UXVhbGl0eSgpIHtcclxuICAgICAgICByZXR1cm4gMTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SGlnaGVzdFF1YWxpdHkgPSBmdW5jdGlvbiBnZXRIaWdoZXN0UXVhbGl0eSgpIHtcclxuICAgICAgICBpZiAocGFyYW1zLmhpZ2hlc3RRdWFsaXR5ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgJ1RoaXMgbWV0aG9kIGlzIGF2YWlsYWJsZSBvbmx5IHdoZW4ganBpcFNpemVzQ2FsY3VsYXRvciAnICtcclxuICAgICAgICAgICAgICAgICdpcyBjcmVhdGVkIGZyb20gcGFyYW1zIHJldHVybmVkIGJ5IGpwaXBDb2Rlc3RyZWFtQ2xpZW50LiAnICtcclxuICAgICAgICAgICAgICAgICdJdCBzaGFsbCBiZSB1c2VkIGZvciBKUElQIEFQSSBwdXJwb3NlcyBvbmx5JztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5oaWdoZXN0UXVhbGl0eTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIC8vIFByaXZhdGUgbWV0aG9kc1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRTaXplT2ZQYXJ0KGNvZGVzdHJlYW1QYXJ0UGFyYW1zKSB7XHJcbiAgICAgICAgdmFyIGxldmVsID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubGV2ZWw7XHJcbiAgICAgICAgdmFyIHRpbGVXaWR0aCA9IGdldFRpbGVXaWR0aChsZXZlbCk7XHJcbiAgICAgICAgdmFyIHRpbGVIZWlnaHQgPSBnZXRUaWxlSGVpZ2h0KGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUJvdW5kcyA9IGdldFRpbGVzRnJvbVBpeGVscyhjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZUluZGV4ID1cclxuICAgICAgICAgICAgdGlsZUJvdW5kcy5taW5UaWxlWCArIHRpbGVCb3VuZHMubWluVGlsZVkgKiBnZXROdW1UaWxlc1goKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIGxhc3RUaWxlSW5kZXggPVxyXG4gICAgICAgICAgICAodGlsZUJvdW5kcy5tYXhUaWxlWEV4Y2x1c2l2ZSAtIDEpICtcclxuICAgICAgICAgICAgKHRpbGVCb3VuZHMubWF4VGlsZVlFeGNsdXNpdmUgLSAxKSAqIGdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdEVkZ2VUeXBlID0gaXNFZGdlVGlsZUlkKGZpcnN0VGlsZUluZGV4KTtcclxuICAgICAgICB2YXIgbGFzdEVkZ2VUeXBlID0gaXNFZGdlVGlsZUlkKGxhc3RUaWxlSW5kZXgpO1xyXG4gICAgICAgIHZhciBmaXJzdFNpemUgPSBnZXRUaWxlU2l6ZShmaXJzdEVkZ2VUeXBlLCBsZXZlbCk7XHJcbiAgICAgICAgdmFyIGxhc3RTaXplID0gZ2V0VGlsZVNpemUobGFzdEVkZ2VUeXBlLCBsZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHdpZHRoID0gZmlyc3RTaXplWzBdO1xyXG4gICAgICAgIHZhciBoZWlnaHQgPSBmaXJzdFNpemVbMV07XHJcblxyXG4gICAgICAgIHZhciB0aWxlc1ggPSB0aWxlQm91bmRzLm1heFRpbGVYRXhjbHVzaXZlIC0gdGlsZUJvdW5kcy5taW5UaWxlWDtcclxuICAgICAgICB2YXIgdGlsZXNZID0gdGlsZUJvdW5kcy5tYXhUaWxlWUV4Y2x1c2l2ZSAtIHRpbGVCb3VuZHMubWluVGlsZVk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRpbGVzWCA+IDEpIHtcclxuICAgICAgICAgICAgd2lkdGggKz0gbGFzdFNpemVbMF07XHJcbiAgICAgICAgICAgIHdpZHRoICs9IHRpbGVXaWR0aCAqICh0aWxlc1ggLSAyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRpbGVzWSA+IDEpIHtcclxuICAgICAgICAgICAgaGVpZ2h0ICs9IGxhc3RTaXplWzFdO1xyXG4gICAgICAgICAgICBoZWlnaHQgKz0gdGlsZUhlaWdodCAqICh0aWxlc1kgLSAyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRUaWxlc0Zyb21QaXhlbHMocGFydFBhcmFtcykge1xyXG4gICAgICAgIHZhciBsZXZlbCA9XHJcbiAgICAgICAgICAgIHBhcnRQYXJhbXMubGV2ZWw7XHJcblxyXG4gICAgICAgIHZhciB0aWxlV2lkdGggPSBnZXRUaWxlV2lkdGgobGV2ZWwpO1xyXG4gICAgICAgIHZhciB0aWxlSGVpZ2h0ID0gZ2V0VGlsZUhlaWdodChsZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZVdpZHRoID0gZ2V0Rmlyc3RUaWxlV2lkdGgobGV2ZWwpO1xyXG4gICAgICAgIHZhciBmaXJzdFRpbGVIZWlnaHQgPSBnZXRGaXJzdFRpbGVIZWlnaHQobGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGFydFhOb0ZpcnN0ID0gKHBhcnRQYXJhbXMubWluWCAtIGZpcnN0VGlsZVdpZHRoKSAvIHRpbGVXaWR0aDtcclxuICAgICAgICB2YXIgc3RhcnRZTm9GaXJzdCA9IChwYXJ0UGFyYW1zLm1pblkgLSBmaXJzdFRpbGVIZWlnaHQpIC8gdGlsZUhlaWdodDtcclxuICAgICAgICB2YXIgZW5kWE5vRmlyc3QgPSAocGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlIC0gZmlyc3RUaWxlV2lkdGgpIC8gdGlsZVdpZHRoO1xyXG4gICAgICAgIHZhciBlbmRZTm9GaXJzdCA9IChwYXJ0UGFyYW1zLm1heFlFeGNsdXNpdmUgLSBmaXJzdFRpbGVIZWlnaHQpIC8gdGlsZUhlaWdodDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWluVGlsZVggPSBNYXRoLm1heCgwLCAxICsgc3RhcnRYTm9GaXJzdCk7XHJcbiAgICAgICAgdmFyIG1pblRpbGVZID0gTWF0aC5tYXgoMCwgMSArIHN0YXJ0WU5vRmlyc3QpO1xyXG4gICAgICAgIHZhciBtYXhUaWxlWCA9IE1hdGgubWluKGdldE51bVRpbGVzWCgpLCAxICsgZW5kWE5vRmlyc3QpO1xyXG4gICAgICAgIHZhciBtYXhUaWxlWSA9IE1hdGgubWluKGdldE51bVRpbGVzWSgpLCAxICsgZW5kWU5vRmlyc3QpO1xyXG5cclxuICAgICAgICB2YXIgYm91bmRzID0ge1xyXG4gICAgICAgICAgICBtaW5UaWxlWDogTWF0aC5mbG9vcihtaW5UaWxlWCksXHJcbiAgICAgICAgICAgIG1pblRpbGVZOiBNYXRoLmZsb29yKG1pblRpbGVZKSxcclxuICAgICAgICAgICAgbWF4VGlsZVhFeGNsdXNpdmU6IE1hdGguY2VpbChtYXhUaWxlWCksXHJcbiAgICAgICAgICAgIG1heFRpbGVZRXhjbHVzaXZlOiBNYXRoLmNlaWwobWF4VGlsZVkpXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGJvdW5kcztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRUaWxlU2l6ZShlZGdlVHlwZSwgbGV2ZWwpIHtcclxuICAgICAgICB2YXIgdGlsZVdpZHRoID0gZ2V0VGlsZURpbWVuc2lvblNpemUoXHJcbiAgICAgICAgICAgIGVkZ2VUeXBlLmhvcml6b250YWxFZGdlVHlwZSxcclxuICAgICAgICAgICAgZ2V0Rmlyc3RUaWxlV2lkdGgsXHJcbiAgICAgICAgICAgIGdldExldmVsV2lkdGgsXHJcbiAgICAgICAgICAgIGdldFRpbGVXaWR0aCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVIZWlnaHQgPSBnZXRUaWxlRGltZW5zaW9uU2l6ZShcclxuICAgICAgICAgICAgZWRnZVR5cGUudmVydGljYWxFZGdlVHlwZSxcclxuICAgICAgICAgICAgZ2V0Rmlyc3RUaWxlSGVpZ2h0LFxyXG4gICAgICAgICAgICBnZXRMZXZlbEhlaWdodCxcclxuICAgICAgICAgICAgZ2V0VGlsZUhlaWdodCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGxldmVsICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdmFyIHNjYWxlID0gMSA8PCBsZXZlbDtcclxuICAgICAgICAgICAgdGlsZVdpZHRoID0gTWF0aC5jZWlsKHRpbGVXaWR0aCAvIHNjYWxlKTtcclxuICAgICAgICAgICAgdGlsZUhlaWdodCA9IE1hdGguY2VpbCh0aWxlSGVpZ2h0IC8gc2NhbGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gW3RpbGVXaWR0aCwgdGlsZUhlaWdodF07XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0VGlsZURpbWVuc2lvblNpemUoXHJcbiAgICAgICAgZWRnZVR5cGUsIGdldEZpcnN0VGlsZVNpemUsIGdldExldmVsU2l6ZSwgZ2V0Tm9uRWRnZVRpbGVTaXplKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdDtcclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKGVkZ2VUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgRURHRV9UWVBFX0ZJUlNUOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gZ2V0Rmlyc3RUaWxlU2l6ZSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIEVER0VfVFlQRV9MQVNUOlxyXG4gICAgICAgICAgICAgICAgdmFyIG5vbkVkZ2VUaWxlU2l6ZSA9IGdldE5vbkVkZ2VUaWxlU2l6ZSgpO1xyXG4gICAgICAgICAgICAgICAgdmFyIHdpZHRoV2l0aG91dEZpcnN0ID0gZ2V0TGV2ZWxTaXplKCkgLSBnZXRGaXJzdFRpbGVTaXplKCk7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB3aWR0aFdpdGhvdXRGaXJzdCAlIG5vbkVkZ2VUaWxlU2l6ZTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IG5vbkVkZ2VUaWxlU2l6ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIEVER0VfVFlQRV9OT19FREdFOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gZ2V0Tm9uRWRnZVRpbGVTaXplKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBlZGdlIHR5cGU6ICcgKyBlZGdlVHlwZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBpc0VkZ2VUaWxlSWQodGlsZUlkKSB7XHJcbiAgICAgICAgdmFyIG51bVRpbGVzWCA9IGdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgIHZhciBudW1UaWxlc1kgPSBnZXROdW1UaWxlc1koKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVggPSB0aWxlSWQgJSBudW1UaWxlc1g7XHJcbiAgICAgICAgdmFyIHRpbGVZID0gTWF0aC5mbG9vcih0aWxlSWQgLyBudW1UaWxlc1gpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlWSA+IG51bVRpbGVzWSB8fCB0aWxlWCA8IDAgfHwgdGlsZVkgPCAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ1RpbGUgaW5kZXggJyArIHRpbGVJZCArICcgaXMgbm90IGluIHJhbmdlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBob3Jpem9udGFsRWRnZSA9XHJcbiAgICAgICAgICAgIHRpbGVYID09PSAwID8gRURHRV9UWVBFX0ZJUlNUIDpcclxuICAgICAgICAgICAgdGlsZVggPT09IChudW1UaWxlc1ggLSAxKSA/IEVER0VfVFlQRV9MQVNUIDpcclxuICAgICAgICAgICAgRURHRV9UWVBFX05PX0VER0U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHZlcnRpY2FsRWRnZSA9XHJcbiAgICAgICAgICAgIHRpbGVZID09PSAwID8gRURHRV9UWVBFX0ZJUlNUIDpcclxuICAgICAgICAgICAgdGlsZVkgPT09IChudW1UaWxlc1kgLSAxKSA/IEVER0VfVFlQRV9MQVNUIDpcclxuICAgICAgICAgICAgRURHRV9UWVBFX05PX0VER0U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgaG9yaXpvbnRhbEVkZ2VUeXBlOiBob3Jpem9udGFsRWRnZSxcclxuICAgICAgICAgICAgdmVydGljYWxFZGdlVHlwZTogdmVydGljYWxFZGdlXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXROdW1UaWxlc1goKSB7XHJcbiAgICAgICAgdmFyIG51bVRpbGVzWCA9IE1hdGguY2VpbChwYXJhbXMuaW1hZ2VXaWR0aCAvIHBhcmFtcy50aWxlV2lkdGgpO1xyXG4gICAgICAgIHJldHVybiBudW1UaWxlc1g7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldE51bVRpbGVzWSgpIHtcclxuICAgICAgICB2YXIgbnVtVGlsZXNZID0gTWF0aC5jZWlsKHBhcmFtcy5pbWFnZUhlaWdodCAvIHBhcmFtcy50aWxlSGVpZ2h0KTtcclxuICAgICAgICByZXR1cm4gbnVtVGlsZXNZO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRMZXZlbFdpZHRoKGxldmVsKSB7XHJcbiAgICAgICAgaWYgKGxldmVsID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcmFtcy5pbWFnZVdpZHRoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6ZSA9IGdldFNpemVPZlBhcnQoe1xyXG4gICAgICAgICAgICBtaW5YOiAwLFxyXG4gICAgICAgICAgICBtYXhYRXhjbHVzaXZlOiBwYXJhbXMuaW1hZ2VXaWR0aCxcclxuICAgICAgICAgICAgbWluWTogMCxcclxuICAgICAgICAgICAgbWF4WUV4Y2x1c2l2ZTogcGFyYW1zLmltYWdlSGVpZ2h0LFxyXG4gICAgICAgICAgICBsZXZlbDogbGV2ZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHNpemUud2lkdGg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldExldmVsSGVpZ2h0KGxldmVsKSB7XHJcbiAgICAgICAgaWYgKGxldmVsID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcmFtcy5pbWFnZUhlaWdodDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNpemUgPSBnZXRTaXplT2ZQYXJ0KHtcclxuICAgICAgICAgICAgbWluWDogMCxcclxuICAgICAgICAgICAgbWF4WEV4Y2x1c2l2ZTogcGFyYW1zLmltYWdlV2lkdGgsXHJcbiAgICAgICAgICAgIG1pblk6IDAsXHJcbiAgICAgICAgICAgIG1heFlFeGNsdXNpdmU6IHBhcmFtcy5pbWFnZUhlaWdodCxcclxuICAgICAgICAgICAgbGV2ZWw6IGxldmVsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBzaXplLmhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRUaWxlV2lkdGgobGV2ZWwpIHtcclxuICAgICAgICBpZiAobGV2ZWwgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGFyYW1zLnRpbGVXaWR0aDtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICB2YXIgc2NhbGUgPSAxIDw8IGxldmVsO1xyXG4gICAgICAgIHZhciB3aWR0aCA9IE1hdGguY2VpbChwYXJhbXMudGlsZVdpZHRoIC8gc2NhbGUpO1xyXG4gICAgICAgIHJldHVybiB3aWR0aDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0VGlsZUhlaWdodChsZXZlbCkge1xyXG4gICAgICAgIGlmIChsZXZlbCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJhbXMudGlsZUhlaWdodDtcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICB2YXIgc2NhbGUgPSAxIDw8IGxldmVsO1xyXG4gICAgICAgIHZhciBoZWlnaHQgPSBNYXRoLmNlaWwocGFyYW1zLnRpbGVIZWlnaHQgLyBzY2FsZSk7XHJcbiAgICAgICAgcmV0dXJuIGhlaWdodDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Rmlyc3RUaWxlT2Zmc2V0WCgpIHtcclxuICAgICAgICByZXR1cm4gcGFyYW1zLmZpcnN0VGlsZU9mZnNldFg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldEZpcnN0VGlsZU9mZnNldFkoKSB7XHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5maXJzdFRpbGVPZmZzZXRZO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldEZpcnN0VGlsZVdpZHRoKGxldmVsKSB7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZVdpZHRoQmVzdExldmVsID1cclxuICAgICAgICAgICAgZ2V0VGlsZVdpZHRoKCkgLSBnZXRGaXJzdFRpbGVPZmZzZXRYKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGltYWdlV2lkdGggPSBnZXRMZXZlbFdpZHRoKCk7XHJcbiAgICAgICAgaWYgKGZpcnN0VGlsZVdpZHRoQmVzdExldmVsID4gaW1hZ2VXaWR0aCkge1xyXG4gICAgICAgICAgICBmaXJzdFRpbGVXaWR0aEJlc3RMZXZlbCA9IGltYWdlV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzY2FsZSA9IDEgPDwgbGV2ZWw7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZVdpZHRoID0gTWF0aC5jZWlsKGZpcnN0VGlsZVdpZHRoQmVzdExldmVsIC8gc2NhbGUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBmaXJzdFRpbGVXaWR0aDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Rmlyc3RUaWxlSGVpZ2h0KGxldmVsKSB7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZUhlaWdodEJlc3RMZXZlbCA9XHJcbiAgICAgICAgICAgIGdldFRpbGVIZWlnaHQoKSAtIGdldEZpcnN0VGlsZU9mZnNldFkoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW1hZ2VIZWlnaHQgPSBnZXRMZXZlbEhlaWdodCgpO1xyXG4gICAgICAgIGlmIChmaXJzdFRpbGVIZWlnaHRCZXN0TGV2ZWwgPiBpbWFnZUhlaWdodCkge1xyXG4gICAgICAgICAgICBmaXJzdFRpbGVIZWlnaHRCZXN0TGV2ZWwgPSBpbWFnZUhlaWdodDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNjYWxlID0gMSA8PCBsZXZlbDtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlSGVpZ2h0ID0gTWF0aC5jZWlsKGZpcnN0VGlsZUhlaWdodEJlc3RMZXZlbCAvIHNjYWxlKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGZpcnN0VGlsZUhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFBkZmpzSnB4RGVjb2RlcjtcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbmZ1bmN0aW9uIFBkZmpzSnB4RGVjb2RlcigpIHtcclxuICAgIHRoaXMuX2ltYWdlID0gbmV3IEpweEltYWdlKCk7XHJcbn1cclxuXHJcblBkZmpzSnB4RGVjb2Rlci5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbiBzdGFydChkYXRhKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgdmFyIHJlZ2lvblRvUGFyc2UgPSB7XHJcbiAgICAgICAgICAgIGxlZnQgIDogZGF0YS5oZWFkZXJzQ29kZXN0cmVhbS5vZmZzZXRYLFxyXG4gICAgICAgICAgICB0b3AgICA6IGRhdGEuaGVhZGVyc0NvZGVzdHJlYW0ub2Zmc2V0WSxcclxuICAgICAgICAgICAgcmlnaHQgOiBkYXRhLmhlYWRlcnNDb2Rlc3RyZWFtLm9mZnNldFggKyBkYXRhLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUgLSBkYXRhLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblgsXHJcbiAgICAgICAgICAgIGJvdHRvbTogZGF0YS5oZWFkZXJzQ29kZXN0cmVhbS5vZmZzZXRZICsgZGF0YS5jb2Rlc3RyZWFtUGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlIC0gZGF0YS5jb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5ZXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY3VycmVudENvbnRleHQgPSBzZWxmLl9pbWFnZS5wYXJzZUNvZGVzdHJlYW0oXHJcbiAgICAgICAgICAgIGRhdGEuaGVhZGVyc0NvZGVzdHJlYW0uY29kZXN0cmVhbSxcclxuICAgICAgICAgICAgMCxcclxuICAgICAgICAgICAgZGF0YS5oZWFkZXJzQ29kZXN0cmVhbS5jb2Rlc3RyZWFtLmxlbmd0aCxcclxuICAgICAgICAgICAgeyBpc09ubHlQYXJzZUhlYWRlcnM6IHRydWUgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2VsZi5faW1hZ2UuYWRkUGFja2V0c0RhdGEoY3VycmVudENvbnRleHQsIGRhdGEuY29kZWJsb2Nrc0RhdGEpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlbGYuX2ltYWdlLmRlY29kZShjdXJyZW50Q29udGV4dCwgeyByZWdpb25Ub1BhcnNlOiByZWdpb25Ub1BhcnNlIH0pO1xyXG5cclxuICAgICAgICB2YXIgcmVzdWx0ID0gc2VsZi5fY29weVRpbGVzUGl4ZWxzVG9PbmVQaXhlbHNBcnJheShzZWxmLl9pbWFnZS50aWxlcywgcmVnaW9uVG9QYXJzZSwgc2VsZi5faW1hZ2UuY29tcG9uZW50c0NvdW50KTtcclxuICAgICAgICByZXNvbHZlKHJlc3VsdCk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcblBkZmpzSnB4RGVjb2Rlci5wcm90b3R5cGUuX2NvcHlUaWxlc1BpeGVsc1RvT25lUGl4ZWxzQXJyYXkgPVxyXG4gICAgZnVuY3Rpb24gY29weVRpbGVzUGl4ZWxzVG9PbmVQaXhlbHNBcnJheSh0aWxlcywgcmVzdWx0UmVnaW9uLCBjb21wb25lbnRzQ291bnQpIHtcclxuICAgICAgICBcclxuICAgIHZhciBmaXJzdFRpbGUgPSB0aWxlc1swXTtcclxuICAgIHZhciB3aWR0aCA9IHJlc3VsdFJlZ2lvbi5yaWdodCAtIHJlc3VsdFJlZ2lvbi5sZWZ0O1xyXG4gICAgdmFyIGhlaWdodCA9IHJlc3VsdFJlZ2lvbi5ib3R0b20gLSByZXN1bHRSZWdpb24udG9wO1xyXG4gICAgXHJcbiAgICAvL2lmIChmaXJzdFRpbGUubGVmdCA9PT0gcmVzdWx0UmVnaW9uLmxlZnQgJiZcclxuICAgIC8vICAgIGZpcnN0VGlsZS50b3AgPT09IHJlc3VsdFJlZ2lvbi50b3AgJiZcclxuICAgIC8vICAgIGZpcnN0VGlsZS53aWR0aCA9PT0gd2lkdGggJiZcclxuICAgIC8vICAgIGZpcnN0VGlsZS5oZWlnaHQgPT09IGhlaWdodCAmJlxyXG4gICAgLy8gICAgY29tcG9uZW50c0NvdW50ID09PSA0KSB7XHJcbiAgICAvLyAgICBcclxuICAgIC8vICAgIHJldHVybiBmaXJzdFRpbGU7XHJcbiAgICAvL31cclxuICAgIFxyXG4gICAgdmFyIHJlc3VsdCA9IG5ldyBJbWFnZURhdGEod2lkdGgsIGhlaWdodCk7XHJcbiAgICAgIFxyXG4gICAgdmFyIGJ5dGVzUGVyUGl4ZWwgPSA0O1xyXG4gICAgdmFyIHJnYmFJbWFnZVN0cmlkZSA9IHdpZHRoICogYnl0ZXNQZXJQaXhlbDtcclxuICAgIFxyXG4gICAgdmFyIHRpbGVJbmRleCA9IDA7XHJcbiAgICBcclxuICAgIC8vZm9yICh2YXIgeCA9IDA7IHggPCBudW1UaWxlc1g7ICsreCkge1xyXG5cclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGlsZXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICB2YXIgdGlsZVJpZ2h0ID0gdGlsZXNbaV0ubGVmdCArIHRpbGVzW2ldLndpZHRoO1xyXG4gICAgICAgIHZhciB0aWxlQm90dG9tID0gdGlsZXNbaV0udG9wICsgdGlsZXNbaV0uaGVpZ2h0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25MZWZ0ID0gTWF0aC5tYXgocmVzdWx0UmVnaW9uLmxlZnQsIHRpbGVzW2ldLmxlZnQpO1xyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25Ub3AgPSBNYXRoLm1heChyZXN1bHRSZWdpb24udG9wLCB0aWxlc1tpXS50b3ApO1xyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25SaWdodCA9IE1hdGgubWluKHJlc3VsdFJlZ2lvbi5yaWdodCwgdGlsZVJpZ2h0KTtcclxuICAgICAgICB2YXIgaW50ZXJzZWN0aW9uQm90dG9tID0gTWF0aC5taW4ocmVzdWx0UmVnaW9uLmJvdHRvbSwgdGlsZUJvdHRvbSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGludGVyc2VjdGlvbldpZHRoID0gaW50ZXJzZWN0aW9uUmlnaHQgLSBpbnRlcnNlY3Rpb25MZWZ0O1xyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25IZWlnaHQgPSBpbnRlcnNlY3Rpb25Cb3R0b20gLSBpbnRlcnNlY3Rpb25Ub3A7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGludGVyc2VjdGlvbkxlZnQgIT09IHRpbGVzW2ldLmxlZnQgfHxcclxuICAgICAgICAgICAgaW50ZXJzZWN0aW9uVG9wICE9PSB0aWxlc1tpXS50b3AgfHxcclxuICAgICAgICAgICAgaW50ZXJzZWN0aW9uV2lkdGggIT09IHRpbGVzW2ldLndpZHRoIHx8XHJcbiAgICAgICAgICAgIGludGVyc2VjdGlvbkhlaWdodCAhPT0gdGlsZXNbaV0uaGVpZ2h0KSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aHJvdyAnVW5zdXBwb3J0ZWQgdGlsZXMgdG8gY29weSc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlT2Zmc2V0WFBpeGVscyA9IGludGVyc2VjdGlvbkxlZnQgLSByZXN1bHRSZWdpb24ubGVmdDtcclxuICAgICAgICB2YXIgdGlsZU9mZnNldFlQaXhlbHMgPSBpbnRlcnNlY3Rpb25Ub3AgLSByZXN1bHRSZWdpb24udG9wO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZU9mZnNldEJ5dGVzID1cclxuICAgICAgICAgICAgdGlsZU9mZnNldFhQaXhlbHMgKiBieXRlc1BlclBpeGVsICtcclxuICAgICAgICAgICAgdGlsZU9mZnNldFlQaXhlbHMgKiByZ2JhSW1hZ2VTdHJpZGU7XHJcblxyXG4gICAgICAgIHRoaXMuX2NvcHlUaWxlKFxyXG4gICAgICAgICAgICByZXN1bHQuZGF0YSwgdGlsZXNbaV0sIHRpbGVPZmZzZXRCeXRlcywgcmdiYUltYWdlU3RyaWRlLCBjb21wb25lbnRzQ291bnQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuUGRmanNKcHhEZWNvZGVyLnByb3RvdHlwZS5fY29weVRpbGUgPSBmdW5jdGlvbiBjb3B5VGlsZShcclxuICAgIHRhcmdldEltYWdlLCB0aWxlLCB0YXJnZXRJbWFnZVN0YXJ0T2Zmc2V0LCB0YXJnZXRJbWFnZVN0cmlkZSwgY29tcG9uZW50c0NvdW50KSB7XHJcbiAgICBcclxuICAgIHZhciByT2Zmc2V0ID0gMDtcclxuICAgIHZhciBnT2Zmc2V0ID0gMTtcclxuICAgIHZhciBiT2Zmc2V0ID0gMjtcclxuICAgIHZhciBwaXhlbHNPZmZzZXQgPSAxO1xyXG4gICAgXHJcbiAgICB2YXIgcGl4ZWxzID0gdGlsZS5waXhlbHMgfHwgdGlsZS5pdGVtcztcclxuICAgIFxyXG4gICAgaWYgKGNvbXBvbmVudHNDb3VudCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgY29tcG9uZW50c0NvdW50ID0gcGl4ZWxzLmxlbmd0aCAvICh0aWxlLndpZHRoICogdGlsZS5oZWlnaHQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBzd2l0Y2ggKGNvbXBvbmVudHNDb3VudCkge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgZ09mZnNldCA9IDA7XHJcbiAgICAgICAgICAgIGJPZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgICAgIHBpeGVsc09mZnNldCA9IDM7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBjYXNlIDQ6XHJcbiAgICAgICAgICAgIHBpeGVsc09mZnNldCA9IDQ7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyAnVW5zdXBwb3J0ZWQgY29tcG9uZW50cyBjb3VudCAnICsgY29tcG9uZW50c0NvdW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgdGFyZ2V0SW1hZ2VJbmRleCA9IHRhcmdldEltYWdlU3RhcnRPZmZzZXQ7XHJcbiAgICB2YXIgcGl4ZWwgPSAwO1xyXG4gICAgZm9yICh2YXIgeSA9IDA7IHkgPCB0aWxlLmhlaWdodDsgKyt5KSB7XHJcbiAgICAgICAgdmFyIHRhcmdldEltYWdlU3RhcnRMaW5lID0gdGFyZ2V0SW1hZ2VJbmRleDtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHRpbGUud2lkdGg7ICsreCkge1xyXG4gICAgICAgICAgICB0YXJnZXRJbWFnZVt0YXJnZXRJbWFnZUluZGV4ICsgMF0gPSBwaXhlbHNbcGl4ZWwgKyByT2Zmc2V0XTtcclxuICAgICAgICAgICAgdGFyZ2V0SW1hZ2VbdGFyZ2V0SW1hZ2VJbmRleCArIDFdID0gcGl4ZWxzW3BpeGVsICsgZ09mZnNldF07XHJcbiAgICAgICAgICAgIHRhcmdldEltYWdlW3RhcmdldEltYWdlSW5kZXggKyAyXSA9IHBpeGVsc1twaXhlbCArIGJPZmZzZXRdO1xyXG4gICAgICAgICAgICB0YXJnZXRJbWFnZVt0YXJnZXRJbWFnZUluZGV4ICsgM10gPSAyNTU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwaXhlbCArPSBwaXhlbHNPZmZzZXQ7XHJcbiAgICAgICAgICAgIHRhcmdldEltYWdlSW5kZXggKz0gNDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGFyZ2V0SW1hZ2VJbmRleCA9IHRhcmdldEltYWdlU3RhcnRMaW5lICsgdGFyZ2V0SW1hZ2VTdHJpZGU7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBDb21wb3NpdGVBcnJheShvZmZzZXQpIHtcclxuICAgIHZhciBsZW5ndGggPSAwO1xyXG4gICAgdmFyIGludGVybmFsUGFydHMgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZW5ndGggPSBmdW5jdGlvbiBnZXRMZW5ndGgoKSB7XHJcbiAgICAgICAgcmV0dXJuIGxlbmd0aDtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5nZXRPZmZzZXQgPSBmdW5jdGlvbiBnZXRPZmZzZXQoKSB7XHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH07XHJcbiAgICAgICAgXHJcbiAgICB0aGlzLnB1c2hTdWJBcnJheSA9IGZ1bmN0aW9uIHB1c2hTdWJBcnJheShzdWJBcnJheSkge1xyXG4gICAgICAgIGludGVybmFsUGFydHMucHVzaChzdWJBcnJheSk7XHJcbiAgICAgICAgbGVuZ3RoICs9IHN1YkFycmF5Lmxlbmd0aDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY29weVRvT3RoZXJBdFRoZUVuZCA9IGZ1bmN0aW9uIGNvcHlUb090aGVyQXRUaGVFbmQocmVzdWx0LCBtaW5PZmZzZXQsIG1heE9mZnNldCkge1xyXG4gICAgICAgIGNoZWNrT2Zmc2V0c1RvQ29weShtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gZ2V0SW50ZXJuYWxQYXJ0c0l0ZXJhdG9yKG1pbk9mZnNldCwgbWF4T2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBOT1RFOiBXaGF0IGlmIGRhdGEgbm90IGluIGZpcnN0IHBhcnQ/XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpIHtcclxuICAgICAgICAgICAgcmVzdWx0LnB1c2hTdWJBcnJheShpdGVyYXRvci5zdWJBcnJheSk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmNvcHlUb1R5cGVkQXJyYXkgPSBmdW5jdGlvbiBjb3B5VG9UeXBlZEFycmF5KFxyXG4gICAgICAgIHJlc3VsdEFycmF5LCByZXN1bHRBcnJheU9mZnNldCwgbWluT2Zmc2V0LCBtYXhPZmZzZXQpIHtcclxuICAgICAgICBcclxuICAgICAgICBjaGVja09mZnNldHNUb0NvcHkobWluT2Zmc2V0LCBtYXhPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IGdldEludGVybmFsUGFydHNJdGVyYXRvcihtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTk9URTogV2hhdCBpZiBkYXRhIG5vdCBpbiBmaXJzdCBwYXJ0P1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlICh0cnlBZHZhbmNlSXRlcmF0b3IoaXRlcmF0b3IpKSB7XHJcbiAgICAgICAgICAgIHZhciBvZmZzZXRJblJlc3VsdCA9XHJcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5vZmZzZXQgLSByZXN1bHRBcnJheU9mZnNldDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdEFycmF5LnNldChpdGVyYXRvci5zdWJBcnJheSwgb2Zmc2V0SW5SZXN1bHQpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5jb3B5VG9BcnJheSA9IGZ1bmN0aW9uIGNvcHlUb0FycmF5KFxyXG4gICAgICAgIHJlc3VsdEFycmF5LCByZXN1bHRBcnJheU9mZnNldCwgbWluT2Zmc2V0LCBtYXhPZmZzZXQpIHtcclxuICAgICAgICBcclxuICAgICAgICBjaGVja09mZnNldHNUb0NvcHkobWluT2Zmc2V0LCBtYXhPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IGdldEludGVybmFsUGFydHNJdGVyYXRvcihtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTk9URTogV2hhdCBpZiBkYXRhIG5vdCBpbiBmaXJzdCBwYXJ0P1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlICh0cnlBZHZhbmNlSXRlcmF0b3IoaXRlcmF0b3IpKSB7XHJcbiAgICAgICAgICAgIHZhciBvZmZzZXRJblJlc3VsdCA9XHJcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5vZmZzZXQgLSByZXN1bHRBcnJheU9mZnNldDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaXRlcmF0b3Iuc3ViQXJyYXkubGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdEFycmF5W29mZnNldEluUmVzdWx0KytdID0gaXRlcmF0b3Iuc3ViQXJyYXlbal07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNvcHlUb090aGVyID0gZnVuY3Rpb24gY29weVRvT3RoZXIob3RoZXIpIHtcclxuICAgICAgICBpZiAob3RoZXIuZ2V0T2Zmc2V0KCkgPiBvZmZzZXQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IFRyeWluZyB0byBjb3B5IHBhcnQgaW50byBhIGxhdHRlciBwYXJ0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBvdGhlckVuZE9mZnNldCA9IG90aGVyLmdldE9mZnNldCgpICsgb3RoZXIuZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgdmFyIGlzT3RoZXJDb250YWluc1RoaXMgPSBvZmZzZXQgKyBsZW5ndGggPD0gb3RoZXJFbmRPZmZzZXQ7XHJcbiAgICAgICAgaWYgKGlzT3RoZXJDb250YWluc1RoaXMpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIC8vIERvIG5vdCBvdmVycmlkZSBhbHJlYWR5IGV4aXN0IGRhdGEgKGZvciBlZmZpY2llbmN5KVxyXG4gICAgICAgIHZhciBtaW5PZmZzZXQgPSBvdGhlckVuZE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSBnZXRJbnRlcm5hbFBhcnRzSXRlcmF0b3IobWluT2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIXRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IENvdWxkIG5vdCBtZXJnZSBwYXJ0cycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZXhwZWN0ZWRPZmZzZXRWYWx1ZSA9IG1pbk9mZnNldDtcclxuXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBpZiAoaXRlcmF0b3Iub2Zmc2V0ICE9PSBleHBlY3RlZE9mZnNldFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IE5vbi1jb250aW51b3VzIHZhbHVlIG9mICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdyYW5nZVRvQ29weS5vZmZzZXQuIEV4cGVjdGVkOiAnICsgZXhwZWN0ZWRPZmZzZXRWYWx1ZSArXHJcbiAgICAgICAgICAgICAgICAgICAgICcsIEFjdHVhbDogJyArIGl0ZXJhdG9yLm9mZnNldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIG90aGVyLnB1c2hTdWJBcnJheShpdGVyYXRvci5zdWJBcnJheSk7XHJcbiAgICAgICAgICAgIGV4cGVjdGVkT2Zmc2V0VmFsdWUgKz0gaXRlcmF0b3Iuc3ViQXJyYXkubGVuZ3RoO1xyXG4gICAgICAgIH0gd2hpbGUgKHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tPZmZzZXRzVG9Db3B5KG1pbk9mZnNldCwgbWF4T2Zmc2V0KSB7XHJcbiAgICAgICAgaWYgKG1pbk9mZnNldCA9PT0gdW5kZWZpbmVkIHx8IG1heE9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ21pbk9mZnNldCBvciBtYXhPZmZzZXQgaXMgdW5kZWZpbmVkIGZvciBDb21wb3NpdGVBcnJheS5jb3B5VG9BcnJheScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobWluT2Zmc2V0IDwgb2Zmc2V0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ21pbk9mZnNldCAoJyArIG1pbk9mZnNldCArICcpIG11c3QgYmUgc21hbGxlciB0aGFuICcgK1xyXG4gICAgICAgICAgICAgICAgJ0NvbXBvc2l0ZUFycmF5IG9mZnNldCAoJyArIG9mZnNldCArICcpJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXhPZmZzZXQgPiBvZmZzZXQgKyBsZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnbWF4T2Zmc2V0ICgnICsgbWF4T2Zmc2V0ICsgJykgbXVzdCBiZSBsYXJnZXIgdGhhbiAnICtcclxuICAgICAgICAgICAgICAgICdDb21wb3NpdGVBcnJheSBlbmQgb2Zmc2V0ICgnICsgb2Zmc2V0ICsgbGVuZ3RoICsgJyknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldEludGVybmFsUGFydHNJdGVyYXRvcihtaW5PZmZzZXQsIG1heE9mZnNldCkge1xyXG4gICAgICAgIHZhciBzdGFydCA9IE1hdGgubWF4KG9mZnNldCwgbWluT2Zmc2V0KTtcclxuXHJcbiAgICAgICAgdmFyIGVuZCA9IG9mZnNldCArIGxlbmd0aDtcclxuICAgICAgICBpZiAobWF4T2Zmc2V0ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZW5kID0gTWF0aC5taW4oZW5kLCBtYXhPZmZzZXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoc3RhcnQgPj0gZW5kKSB7XHJcbiAgICAgICAgICAgIHZhciBlbXB0eUl0ZXJhdG9yID0ge1xyXG4gICAgICAgICAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGE6IHsgaXNFbmRPZlJhbmdlOiB0cnVlIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBlbXB0eUl0ZXJhdG9yO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSB7XHJcbiAgICAgICAgICAgIHN1YkFycmF5OiBudWxsLFxyXG4gICAgICAgICAgICBvZmZzZXQ6IC0xLFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGE6IHtcclxuICAgICAgICAgICAgICAgIGVuZDogZW5kLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudFN1YkFycmF5OiBudWxsLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudEludGVybmFsUGFydE9mZnNldDogbnVsbCxcclxuICAgICAgICAgICAgICAgIG5leHRJbnRlcm5hbFBhcnRPZmZzZXQ6IG9mZnNldCxcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRJbnRlcm5hbFBhcnRJbmRleDogLTEsXHJcbiAgICAgICAgICAgICAgICBpc0VuZE9mUmFuZ2U6IGZhbHNlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhbHJlYWR5UmVhY2hlZFRvVGhlRW5kID0gZmFsc2U7XHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBpZiAoYWxyZWFkeVJlYWNoZWRUb1RoZUVuZCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ0l0ZXJhdG9yIHJlYWNoZWQgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ3RvIHRoZSBlbmQgYWx0aG91Z2ggbm8gZGF0YSBoYXMgYmVlbiBpdGVyYXRlZCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBhbHJlYWR5UmVhY2hlZFRvVGhlRW5kID0gIXRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcik7XHJcbiAgICAgICAgfSB3aGlsZSAoc3RhcnQgPj0gaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEubmV4dEludGVybmFsUGFydE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGN1dEZpcnN0U3ViQXJyYXkgPVxyXG4gICAgICAgICAgICBzdGFydCAtIGl0ZXJhdG9yLmludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQ7XHJcbiAgICAgICAgaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudFN1YkFycmF5ID1cclxuICAgICAgICAgICAgaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudFN1YkFycmF5LnN1YmFycmF5KGN1dEZpcnN0U3ViQXJyYXkpO1xyXG4gICAgICAgIGl0ZXJhdG9yLmludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQgPSBzdGFydDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXRlcmF0b3I7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikge1xyXG4gICAgICAgIHZhciBpbnRlcm5hbEl0ZXJhdG9yRGF0YSA9IGl0ZXJhdG9yLmludGVybmFsSXRlcmF0b3JEYXRhO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpbnRlcm5hbEl0ZXJhdG9yRGF0YS5pc0VuZE9mUmFuZ2UpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpdGVyYXRvci5zdWJBcnJheSA9IGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRTdWJBcnJheTtcclxuICAgICAgICBpdGVyYXRvci5vZmZzZXQgPSBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgICsraW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydEluZGV4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpbnRlcm5hbEl0ZXJhdG9yRGF0YS5uZXh0SW50ZXJuYWxQYXJ0T2Zmc2V0ID49IGludGVybmFsSXRlcmF0b3JEYXRhLmVuZCkge1xyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5pc0VuZE9mUmFuZ2UgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGVuc3VyZU5vRW5kT2ZBcnJheVJlYWNoZWQoaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydEluZGV4KTtcclxuICAgICAgICBcclxuICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50U3ViQXJyYXkgPSBpbnRlcm5hbFBhcnRzW1xyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXhdO1xyXG4gICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQgPVxyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5uZXh0SW50ZXJuYWxQYXJ0T2Zmc2V0O1xyXG4gICAgICAgIHZhciBjdXJyZW50SW50ZXJuYWxQYXJ0TGVuZ3RoID1cclxuICAgICAgICAgICAgaW50ZXJuYWxQYXJ0c1tpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXhdLmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5uZXh0SW50ZXJuYWxQYXJ0T2Zmc2V0ID1cclxuICAgICAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydE9mZnNldCArIGN1cnJlbnRJbnRlcm5hbFBhcnRMZW5ndGg7XHJcblxyXG4gICAgICAgIHZhciBjdXRMYXN0U3ViQXJyYXkgPVxyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5lbmQgLSBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0T2Zmc2V0O1xyXG4gICAgICAgIHZhciBpc0xhc3RTdWJBcnJheSA9XHJcbiAgICAgICAgICAgIGN1dExhc3RTdWJBcnJheSA8IGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRTdWJBcnJheS5sZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzTGFzdFN1YkFycmF5KSB7XHJcbiAgICAgICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRTdWJBcnJheSA9IGludGVybmFsSXRlcmF0b3JEYXRhXHJcbiAgICAgICAgICAgICAgICAuY3VycmVudFN1YkFycmF5LnN1YmFycmF5KDAsIGN1dExhc3RTdWJBcnJheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBlbnN1cmVOb0VuZE9mQXJyYXlSZWFjaGVkKGN1cnJlbnRJbnRlcm5hbFBhcnRJbmRleCkge1xyXG4gICAgICAgIGlmIChjdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXggPj0gaW50ZXJuYWxQYXJ0cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXk6IGVuZCBvZiBwYXJ0IGhhcyByZWFjaGVkLiBDaGVjayBlbmQgY2FsY3VsYXRpb24nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxuLy8gQS4yLjEuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBEYXRhYmluUGFydHMoXHJcbiAgICBjbGFzc0lkLCBpbkNsYXNzSWQsIGpwaXBGYWN0b3J5KSB7XHJcblxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuICAgIHZhciBwYXJ0cyA9IFtdO1xyXG4gICAgdmFyIGRhdGFiaW5MZW5ndGhJZktub3duID0gbnVsbDtcclxuICAgIHZhciBsb2FkZWRCeXRlcyA9IDA7XHJcbiAgICBcclxuICAgIHZhciBjYWNoZWREYXRhID0gW107XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RGF0YWJpbkxlbmd0aElmS25vd24gPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gZGF0YWJpbkxlbmd0aElmS25vd247XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExvYWRlZEJ5dGVzID0gZnVuY3Rpb24gZ2V0TG9hZGVkQnl0ZXMoKSB7XHJcbiAgICAgICAgcmV0dXJuIGxvYWRlZEJ5dGVzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5pc0FsbERhdGFiaW5Mb2FkZWQgPSBmdW5jdGlvbiBpc0FsbERhdGFiaW5Mb2FkZWQoKSB7XHJcbiAgICAgICAgdmFyIHJlc3VsdDtcclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKHBhcnRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjYXNlIDA6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBkYXRhYmluTGVuZ3RoSWZLbm93biA9PT0gMDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9XHJcbiAgICAgICAgICAgICAgICAgICAgcGFydHNbMF0uZ2V0T2Zmc2V0KCkgPT09IDAgJiZcclxuICAgICAgICAgICAgICAgICAgICBwYXJ0c1swXS5nZXRMZW5ndGgoKSA9PT0gZGF0YWJpbkxlbmd0aElmS25vd247XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDYWNoZWREYXRhID0gZnVuY3Rpb24gZ2V0Q2FjaGVkRGF0YShrZXkpIHtcclxuICAgICAgICB2YXIgb2JqID0gY2FjaGVkRGF0YVtrZXldO1xyXG4gICAgICAgIGlmIChvYmogPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBvYmogPSB7fTtcclxuICAgICAgICAgICAgY2FjaGVkRGF0YVtrZXldID0gb2JqO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gb2JqO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDbGFzc0lkID0gZnVuY3Rpb24gZ2V0Q2xhc3NJZCgpIHtcclxuICAgICAgICByZXR1cm4gY2xhc3NJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SW5DbGFzc0lkID0gZnVuY3Rpb24gZ2V0SW5DbGFzc0lkKCkge1xyXG4gICAgICAgIHJldHVybiBpbkNsYXNzSWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNvcHlUb0NvbXBvc2l0ZUFycmF5ID0gZnVuY3Rpb24gY29weVRvQ29tcG9zaXRlQXJyYXkocmVzdWx0LCByYW5nZU9wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZHVtbXlSZXN1bHRTdGFydE9mZnNldCA9IDA7XHJcbiAgICAgICAgdmFyIHBhcmFtcyA9IGdldFBhcmFtc0ZvckNvcHlCeXRlcyhkdW1teVJlc3VsdFN0YXJ0T2Zmc2V0LCByYW5nZU9wdGlvbnMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwYXJhbXMucmVzdWx0V2l0aG91dENvcHkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGFyYW1zLnJlc3VsdFdpdGhvdXRDb3B5O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWF4TGVuZ3RoQ29waWVkID0gaXRlcmF0ZVJhbmdlKFxyXG4gICAgICAgICAgICBwYXJhbXMuZGF0YWJpblN0YXJ0T2Zmc2V0LFxyXG4gICAgICAgICAgICBwYXJhbXMubWF4TGVuZ3RoVG9Db3B5LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiBhZGRQYXJ0VG9SZXN1bHRJbkNvcHlUb0NvbXBvc2l0ZUFycmF5KHBhcnQsIG1pbk9mZnNldEluUGFydCwgbWF4T2Zmc2V0SW5QYXJ0KSB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0LmNvcHlUb090aGVyQXRUaGVFbmQoXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICAgICAgICAgIG1pbk9mZnNldEluUGFydCxcclxuICAgICAgICAgICAgICAgICAgICBtYXhPZmZzZXRJblBhcnQpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbWF4TGVuZ3RoQ29waWVkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5jb3B5Qnl0ZXMgPSBmdW5jdGlvbihyZXN1bHRBcnJheSwgcmVzdWx0U3RhcnRPZmZzZXQsIHJhbmdlT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBwYXJhbXMgPSBnZXRQYXJhbXNGb3JDb3B5Qnl0ZXMocmVzdWx0U3RhcnRPZmZzZXQsIHJhbmdlT3B0aW9ucyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBhcmFtcy5yZXN1bHRXaXRob3V0Q29weSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJhbXMucmVzdWx0V2l0aG91dENvcHk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHRBcnJheU9mZnNldEluRGF0YWJpbiA9IHBhcmFtcy5kYXRhYmluU3RhcnRPZmZzZXQgLSBwYXJhbXMucmVzdWx0U3RhcnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1heExlbmd0aENvcGllZCA9IGl0ZXJhdGVSYW5nZShcclxuICAgICAgICAgICAgcGFyYW1zLmRhdGFiaW5TdGFydE9mZnNldCxcclxuICAgICAgICAgICAgcGFyYW1zLm1heExlbmd0aFRvQ29weSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gYWRkUGFydFRvUmVzdWx0SW5Db3B5Qnl0ZXMocGFydCwgbWluT2Zmc2V0SW5QYXJ0LCBtYXhPZmZzZXRJblBhcnQpIHtcclxuICAgICAgICAgICAgICAgIHBhcnQuY29weVRvQXJyYXkoXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0QXJyYXksXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0QXJyYXlPZmZzZXRJbkRhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICAgICAgbWluT2Zmc2V0SW5QYXJ0LFxyXG4gICAgICAgICAgICAgICAgICAgIG1heE9mZnNldEluUGFydCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBtYXhMZW5ndGhDb3BpZWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEV4aXN0aW5nUmFuZ2VzID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShwYXJ0cy5sZW5ndGgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgcmVzdWx0W2ldID0ge1xyXG4gICAgICAgICAgICAgICAgc3RhcnQ6IHBhcnRzW2ldLmdldE9mZnNldCgpLFxyXG4gICAgICAgICAgICAgICAgbGVuZ3RoOiBwYXJ0c1tpXS5nZXRMZW5ndGgoKVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuYWRkRGF0YSA9IGZ1bmN0aW9uKGhlYWRlciwgbWVzc2FnZSkge1xyXG4gICAgICAgIGlmIChoZWFkZXIuaXNMYXN0Qnl0ZUluRGF0YWJpbikge1xyXG4gICAgICAgICAgICBkYXRhYmluTGVuZ3RoSWZLbm93biA9IGhlYWRlci5tZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydCArIGhlYWRlci5tZXNzYWdlQm9keUxlbmd0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGhlYWRlci5tZXNzYWdlQm9keUxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgbmV3UGFydCA9IGpwaXBGYWN0b3J5LmNyZWF0ZUNvbXBvc2l0ZUFycmF5KFxyXG4gICAgICAgICAgICBoZWFkZXIubWVzc2FnZU9mZnNldEZyb21EYXRhYmluU3RhcnQpO1xyXG5cclxuICAgICAgICB2YXIgZW5kT2Zmc2V0SW5NZXNzYWdlID0gaGVhZGVyLmJvZHlTdGFydCArIGhlYWRlci5tZXNzYWdlQm9keUxlbmd0aDtcclxuICAgICAgICBuZXdQYXJ0LnB1c2hTdWJBcnJheShtZXNzYWdlLnN1YmFycmF5KGhlYWRlci5ib2R5U3RhcnQsIGVuZE9mZnNldEluTWVzc2FnZSkpO1xyXG5cclxuICAgICAgICAvLyBGaW5kIHdoZXJlIHRvIHB1c2ggdGhlIG5ldyBtZXNzYWdlXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGluZGV4Rmlyc3RQYXJ0QWZ0ZXIgPSBmaW5kRmlyc3RQYXJ0QWZ0ZXJPZmZzZXQoaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0KTtcclxuICAgICAgICB2YXIgaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlciA9IGluZGV4Rmlyc3RQYXJ0QWZ0ZXI7XHJcblxyXG4gICAgICAgIGlmIChpbmRleEZpcnN0UGFydEFmdGVyID4gMCkge1xyXG4gICAgICAgICAgICB2YXIgcHJldmlvdXNQYXJ0ID0gcGFydHNbaW5kZXhGaXJzdFBhcnRBZnRlciAtIDFdO1xyXG4gICAgICAgICAgICB2YXIgcHJldmlvdXNQYXJ0RW5kT2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIHByZXZpb3VzUGFydC5nZXRPZmZzZXQoKSArIHByZXZpb3VzUGFydC5nZXRMZW5ndGgoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChwcmV2aW91c1BhcnRFbmRPZmZzZXQgPT09IGhlYWRlci5tZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydCkge1xyXG4gICAgICAgICAgICAgICAgLy8gQ2FuIG1lcmdlIGFsc28gcHJldmlvdXMgcGFydFxyXG4gICAgICAgICAgICAgICAgLS1pbmRleEZpcnN0UGFydE5lYXJPckFmdGVyO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlciA+PSBwYXJ0cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcGFydHMucHVzaChuZXdQYXJ0KTtcclxuICAgICAgICAgICAgbG9hZGVkQnl0ZXMgKz0gaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RQYXJ0TmVhck9yQWZ0ZXIgPSBwYXJ0c1tpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyXTtcclxuICAgICAgICB2YXIgZW5kT2Zmc2V0SW5EYXRhYmluID1cclxuICAgICAgICAgICAgaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0ICsgaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgIGlmIChmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRPZmZzZXQoKSA+IGVuZE9mZnNldEluRGF0YWJpbikge1xyXG4gICAgICAgICAgICAvLyBOb3QgZm91bmQgYW4gb3ZlcmxhcHBpbmcgcGFydCwgcHVzaCBhIG5ld1xyXG4gICAgICAgICAgICAvLyBwYXJ0IGluIHRoZSBtaWRkbGUgb2YgdGhlIHBhcnRzIGFycmF5XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aDsgaSA+IGluZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXI7IC0taSkge1xyXG4gICAgICAgICAgICAgICAgcGFydHNbaV0gPSBwYXJ0c1tpIC0gMV07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHBhcnRzW2luZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXJdID0gbmV3UGFydDtcclxuICAgICAgICAgICAgbG9hZGVkQnl0ZXMgKz0gaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBNZXJnZSBmaXJzdCBhbmQgbGFzdCBvdmVybGFwcGluZyBwYXJ0cyAtIGFsbCB0aGUgcmVzdCAoaWYgYW55KSBhcmUgaW4gdGhlIG1pZGRsZSBvZiB0aGUgbmV3IHBhcnRcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNBbHJlYWR5U2F2ZWQgPSBmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRMZW5ndGgoKTtcclxuXHJcbiAgICAgICAgdmFyIHNob3VsZFN3YXAgPVxyXG4gICAgICAgICAgICBmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRPZmZzZXQoKSA+IGhlYWRlci5tZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydDtcclxuICAgICAgICBpZiAoc2hvdWxkU3dhcCkge1xyXG4gICAgICAgICAgICBwYXJ0c1tpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyXSA9IG5ld1BhcnQ7XHJcbiAgICAgICAgICAgIG5ld1BhcnQgPSBmaXJzdFBhcnROZWFyT3JBZnRlcjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZpcnN0UGFydE5lYXJPckFmdGVyID0gcGFydHNbaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlcl07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBuZXdQYXJ0LmNvcHlUb090aGVyKGZpcnN0UGFydE5lYXJPckFmdGVyKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZW5kT2Zmc2V0ID1cclxuICAgICAgICAgICAgZmlyc3RQYXJ0TmVhck9yQWZ0ZXIuZ2V0T2Zmc2V0KCkgKyBmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRMZW5ndGgoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGFydFRvTWVyZ2VJbmRleDtcclxuICAgICAgICBmb3IgKHBhcnRUb01lcmdlSW5kZXggPSBpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyO1xyXG4gICAgICAgICAgICBwYXJ0VG9NZXJnZUluZGV4IDwgcGFydHMubGVuZ3RoIC0gMTtcclxuICAgICAgICAgICAgKytwYXJ0VG9NZXJnZUluZGV4KSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoZW5kT2Zmc2V0IDwgcGFydHNbcGFydFRvTWVyZ2VJbmRleCArIDFdLmdldE9mZnNldCgpKSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYnl0ZXNBbHJlYWR5U2F2ZWQgKz0gcGFydHNbcGFydFRvTWVyZ2VJbmRleCArIDFdLmdldExlbmd0aCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGFydHNUb0RlbGV0ZSA9IHBhcnRUb01lcmdlSW5kZXggLSBpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyO1xyXG4gICAgICAgIGlmIChwYXJ0c1RvRGVsZXRlID4gMCkge1xyXG4gICAgICAgICAgICBwYXJ0c1twYXJ0VG9NZXJnZUluZGV4XS5jb3B5VG9PdGhlcihmaXJzdFBhcnROZWFyT3JBZnRlcik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZWxldGUgYWxsIG1pZGRsZSBhbmQgbWVyZ2VkIHBhcnRzIGV4Y2VwdCAxXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlciArIDE7IGogPCBwYXJ0cy5sZW5ndGggLSBwYXJ0c1RvRGVsZXRlOyArK2opIHtcclxuICAgICAgICAgICAgICAgIHBhcnRzW2pdID0gcGFydHNbaiArIHBhcnRzVG9EZWxldGVdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwYXJ0cy5sZW5ndGggLT0gcGFydHNUb0RlbGV0ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbG9hZGVkQnl0ZXMgKz0gZmlyc3RQYXJ0TmVhck9yQWZ0ZXIuZ2V0TGVuZ3RoKCkgLSBieXRlc0FscmVhZHlTYXZlZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFBhcmFtc0ZvckNvcHlCeXRlcyhyZXN1bHRTdGFydE9mZnNldCwgcmFuZ2VPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGZvcmNlQ29weUFsbFJhbmdlID0gZmFsc2U7XHJcbiAgICAgICAgdmFyIGRhdGFiaW5TdGFydE9mZnNldCA9IDA7XHJcbiAgICAgICAgdmFyIG1heExlbmd0aFRvQ29weTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocmFuZ2VPcHRpb25zICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2UgPSAhIXJhbmdlT3B0aW9ucy5mb3JjZUNvcHlBbGxSYW5nZTtcclxuICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0ID0gcmFuZ2VPcHRpb25zLmRhdGFiaW5TdGFydE9mZnNldDtcclxuICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5ID0gcmFuZ2VPcHRpb25zLm1heExlbmd0aFRvQ29weTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChkYXRhYmluU3RhcnRPZmZzZXQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAocmVzdWx0U3RhcnRPZmZzZXQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXN1bHRTdGFydE9mZnNldCA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXhMZW5ndGhUb0NvcHkgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgcmVzdWx0V2l0aG91dENvcHk6IDAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKChkYXRhYmluTGVuZ3RoSWZLbm93biAhPT0gbnVsbCkgJiYgKGRhdGFiaW5TdGFydE9mZnNldCA+PSBkYXRhYmluTGVuZ3RoSWZLbm93bikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgcmVzdWx0V2l0aG91dENvcHk6ICghIW1heExlbmd0aFRvQ29weSAmJiBmb3JjZUNvcHlBbGxSYW5nZSA/IG51bGwgOiAwKSB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RSZWxldmFudFBhcnRJbmRleCA9IGZpbmRGaXJzdFBhcnRBZnRlck9mZnNldChkYXRhYmluU3RhcnRPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmaXJzdFJlbGV2YW50UGFydEluZGV4ID09PSBwYXJ0cy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgcmVzdWx0V2l0aG91dENvcHk6IChmb3JjZUNvcHlBbGxSYW5nZSA/IG51bGwgOiAwKSB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZm9yY2VDb3B5QWxsUmFuZ2UpIHtcclxuICAgICAgICAgICAgdmFyIGlzQWxsUmVxdWVzdGVkUmFuZ2VFeGlzdCA9XHJcbiAgICAgICAgICAgICAgICBpc0FsbFJhbmdlRXhpc3QoZGF0YWJpblN0YXJ0T2Zmc2V0LCBtYXhMZW5ndGhUb0NvcHksIGZpcnN0UmVsZXZhbnRQYXJ0SW5kZXgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFpc0FsbFJlcXVlc3RlZFJhbmdlRXhpc3QpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHJlc3VsdFdpdGhvdXRDb3B5OiBudWxsIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhcmFtcyA9IHtcclxuICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0OiBkYXRhYmluU3RhcnRPZmZzZXQsXHJcbiAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogbWF4TGVuZ3RoVG9Db3B5LFxyXG4gICAgICAgICAgICByZXN1bHRTdGFydE9mZnNldDogcmVzdWx0U3RhcnRPZmZzZXRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcGFyYW1zO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpc0FsbFJhbmdlRXhpc3QoXHJcbiAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0LCBtYXhMZW5ndGhUb0NvcHksIGZpcnN0UmVsZXZhbnRQYXJ0SW5kZXgpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocGFydHNbZmlyc3RSZWxldmFudFBhcnRJbmRleF0uZ2V0T2Zmc2V0KCkgPiBkYXRhYmluU3RhcnRPZmZzZXQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobWF4TGVuZ3RoVG9Db3B5KSB7XHJcbiAgICAgICAgICAgIHZhciB1bnVzZWRFbGVtZW50cyA9XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQgLSBwYXJ0c1tmaXJzdFJlbGV2YW50UGFydEluZGV4XS5nZXRPZmZzZXQoKTtcclxuICAgICAgICAgICAgdmFyIGF2YWlsYWJsZUxlbmd0aCA9XHJcbiAgICAgICAgICAgICAgICBwYXJ0c1tmaXJzdFJlbGV2YW50UGFydEluZGV4XS5nZXRMZW5ndGgoKSAtIHVudXNlZEVsZW1lbnRzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGlzVW50aWxNYXhMZW5ndGhFeGlzdCA9IGF2YWlsYWJsZUxlbmd0aCA+PSBtYXhMZW5ndGhUb0NvcHk7XHJcbiAgICAgICAgICAgIHJldHVybiBpc1VudGlsTWF4TGVuZ3RoRXhpc3Q7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChkYXRhYmluTGVuZ3RoSWZLbm93biA9PT0gbnVsbCB8fFxyXG4gICAgICAgICAgICBmaXJzdFJlbGV2YW50UGFydEluZGV4IDwgcGFydHMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGFzdFBhcnQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcclxuICAgICAgICB2YXIgZW5kT2Zmc2V0UmVjaWV2ZWQgPSBsYXN0UGFydC5nZXRPZmZzZXQoKSArIGxhc3RQYXJ0LmdldExlbmd0aCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc1VudGlsRW5kT2ZEYXRhYmluRXhpc3QgPSBlbmRPZmZzZXRSZWNpZXZlZCA9PT0gZGF0YWJpbkxlbmd0aElmS25vd247XHJcbiAgICAgICAgcmV0dXJuIGlzVW50aWxFbmRPZkRhdGFiaW5FeGlzdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaXRlcmF0ZVJhbmdlKFxyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQsXHJcbiAgICAgICAgICAgIG1heExlbmd0aFRvQ29weSxcclxuICAgICAgICBhZGRTdWJQYXJ0VG9SZXN1bHQpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWluT2Zmc2V0SW5EYXRhYmluVG9Db3B5ID0gZGF0YWJpblN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhPZmZzZXRJbkRhdGFiaW5Ub0NvcHk7XHJcbiAgICAgICAgaWYgKG1heExlbmd0aFRvQ29weSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIG1heE9mZnNldEluRGF0YWJpblRvQ29weSA9IGRhdGFiaW5TdGFydE9mZnNldCArIG1heExlbmd0aFRvQ29weTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgbGFzdFBhcnQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgbWF4T2Zmc2V0SW5EYXRhYmluVG9Db3B5ID0gbGFzdFBhcnQuZ2V0T2Zmc2V0KCkgKyBsYXN0UGFydC5nZXRMZW5ndGgoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICB2YXIgbGFzdENvcGllZFBhcnQgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKHBhcnRzW2ldLmdldE9mZnNldCgpID49IG1heE9mZnNldEluRGF0YWJpblRvQ29weSkge1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBjdXJyZW50TWluT2Zmc2V0SW5EYXRhYmluVG9Db3B5ID0gTWF0aC5tYXgoXHJcbiAgICAgICAgICAgICAgICBtaW5PZmZzZXRJbkRhdGFiaW5Ub0NvcHksIHBhcnRzW2ldLmdldE9mZnNldCgpKTtcclxuICAgICAgICAgICAgdmFyIGN1cnJlbnRNYXhPZmZzZXRJbkRhdGFiaW5Ub0NvcHkgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgIG1heE9mZnNldEluRGF0YWJpblRvQ29weSwgcGFydHNbaV0uZ2V0T2Zmc2V0KCkgKyBwYXJ0c1tpXS5nZXRMZW5ndGgoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIGFkZFN1YlBhcnRUb1Jlc3VsdChcclxuICAgICAgICAgICAgICAgIHBhcnRzW2ldLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE1pbk9mZnNldEluRGF0YWJpblRvQ29weSxcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRNYXhPZmZzZXRJbkRhdGFiaW5Ub0NvcHkpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbGFzdENvcGllZFBhcnQgPSBwYXJ0c1tpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGxhc3RDb3BpZWRQYXJ0ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGFzdE9mZnNldENvcGllZCA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICBsYXN0Q29waWVkUGFydC5nZXRPZmZzZXQoKSArIGxhc3RDb3BpZWRQYXJ0LmdldExlbmd0aCgpLFxyXG4gICAgICAgICAgICBtYXhPZmZzZXRJbkRhdGFiaW5Ub0NvcHkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhMZW5ndGhDb3BpZWQgPSBsYXN0T2Zmc2V0Q29waWVkIC0gZGF0YWJpblN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIHJldHVybiBtYXhMZW5ndGhDb3BpZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZmluZEZpcnN0UGFydEFmdGVyT2Zmc2V0KG9mZnNldCkge1xyXG4gICAgICAgIHZhciBpbmRleDtcclxuICAgICAgICBmb3IgKGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGg7ICsraW5kZXgpIHtcclxuICAgICAgICAgICAgaWYgKHBhcnRzW2luZGV4XS5nZXRPZmZzZXQoKSArIHBhcnRzW2luZGV4XS5nZXRMZW5ndGgoKSA+IG9mZnNldCkge1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcztcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBEYXRhYmluc1NhdmVyKGlzSnBpcFRpbGVQYXJ0U3RyZWFtLCBqcGlwRmFjdG9yeSkge1xyXG4gICAgdmFyIFBSRUNJTkNUX05PX0FVWF9DTEFTUyA9IDA7XHJcbiAgICB2YXIgUFJFQ0lOQ1RfV0lUSF9BVVhfQ0xBU1MgPSAxO1xyXG4gICAgdmFyIFRJTEVfSEVBREVSX0NMQVNTID0gMjtcclxuICAgIHZhciBUSUxFX05PX0FVWF9DTEFTUyA9IDQ7XHJcbiAgICB2YXIgVElMRV9XSVRIX0FVWF9DTEFTUyA9IDU7XHJcblxyXG4gICAgdmFyIGRhdGFiaW5zQnlDbGFzcyA9IFtdO1xyXG4gICAgdmFyIGZvcmJpZGRlbkluSnBwID0gW107XHJcbiAgICB2YXIgZm9yYmlkZGVuSW5KcHQgPSBbXTtcclxuICAgIFxyXG4gICAgdmFyIGxvYWRlZEJ5dGVzID0gMDtcclxuICAgIHZhciBsb2FkZWRCeXRlc0luUmVnaXN0ZXJlZERhdGFiaW5zID0gMDtcclxuXHJcbiAgICAvLyBWYWxpZCBvbmx5IGlmIGlzSnBpcFRpbGVQYXJ0U3RyZWFtID0gZmFsc2VcclxuICAgIFxyXG4gICAgZGF0YWJpbnNCeUNsYXNzW1RJTEVfSEVBREVSX0NMQVNTXSA9IGNyZWF0ZURhdGFiaW5zQXJyYXkoKTtcclxuICAgIGRhdGFiaW5zQnlDbGFzc1tQUkVDSU5DVF9OT19BVVhfQ0xBU1NdID0gY3JlYXRlRGF0YWJpbnNBcnJheSgpO1xyXG4gICAgZGF0YWJpbnNCeUNsYXNzW1BSRUNJTkNUX1dJVEhfQVVYX0NMQVNTXSA9IGRhdGFiaW5zQnlDbGFzc1tcclxuICAgICAgICBQUkVDSU5DVF9OT19BVVhfQ0xBU1NdO1xyXG4gICAgXHJcbiAgICBmb3JiaWRkZW5JbkpwdFtUSUxFX0hFQURFUl9DTEFTU10gPSB0cnVlO1xyXG4gICAgZm9yYmlkZGVuSW5KcHRbUFJFQ0lOQ1RfTk9fQVVYX0NMQVNTXSA9IHRydWU7XHJcbiAgICBmb3JiaWRkZW5JbkpwdFtQUkVDSU5DVF9XSVRIX0FVWF9DTEFTU10gPSB0cnVlO1xyXG4gICAgXHJcbiAgICAvLyBWYWxpZCBvbmx5IGlmIGlzSnBpcFRpbGVQYXJ0U3RyZWFtID0gdHJ1ZVxyXG5cclxuICAgIGRhdGFiaW5zQnlDbGFzc1tUSUxFX05PX0FVWF9DTEFTU10gPSBjcmVhdGVEYXRhYmluc0FycmF5KCk7XHJcbiAgICBkYXRhYmluc0J5Q2xhc3NbVElMRV9XSVRIX0FVWF9DTEFTU10gPSBkYXRhYmluc0J5Q2xhc3NbXHJcbiAgICAgICAgVElMRV9OT19BVVhfQ0xBU1NdO1xyXG4gICAgXHJcbiAgICBmb3JiaWRkZW5JbkpwcFtUSUxFX05PX0FVWF9DTEFTU10gPSB0cnVlO1xyXG4gICAgZm9yYmlkZGVuSW5KcHBbVElMRV9XSVRIX0FVWF9DTEFTU10gPSB0cnVlO1xyXG4gICAgXHJcbiAgICB2YXIgbWFpbkhlYWRlckRhdGFiaW4gPSBqcGlwRmFjdG9yeS5jcmVhdGVEYXRhYmluUGFydHMoNiwgMCk7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SXNKcGlwVGlsZVBhcnRTdHJlYW0gPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gaXNKcGlwVGlsZVBhcnRTdHJlYW07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExvYWRlZEJ5dGVzID0gZnVuY3Rpb24gZ2V0TG9hZGVkQnl0ZXMoKSB7XHJcbiAgICAgICAgcmV0dXJuIGxvYWRlZEJ5dGVzO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmdldE1haW5IZWFkZXJEYXRhYmluID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHJldHVybiBtYWluSGVhZGVyRGF0YWJpbjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZUhlYWRlckRhdGFiaW4gPSBmdW5jdGlvbihpbkNsYXNzSW5kZXgpIHtcclxuICAgICAgICB2YXIgZGF0YWJpbiA9IGdldERhdGFiaW5Gcm9tQXJyYXkoXHJcbiAgICAgICAgICAgIGRhdGFiaW5zQnlDbGFzc1tUSUxFX0hFQURFUl9DTEFTU10sXHJcbiAgICAgICAgICAgIFRJTEVfSEVBREVSX0NMQVNTLFxyXG4gICAgICAgICAgICBpbkNsYXNzSW5kZXgsXHJcbiAgICAgICAgICAgIC8qaXNKcGlwVGlsZVBhcnRTdHJlYW1FeHBlY3RlZD0qL2ZhbHNlLFxyXG4gICAgICAgICAgICAndGlsZUhlYWRlcicpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBkYXRhYmluO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQcmVjaW5jdERhdGFiaW4gPSBmdW5jdGlvbihpbkNsYXNzSW5kZXgpIHtcclxuICAgICAgICB2YXIgZGF0YWJpbiA9IGdldERhdGFiaW5Gcm9tQXJyYXkoXHJcbiAgICAgICAgICAgIGRhdGFiaW5zQnlDbGFzc1tQUkVDSU5DVF9OT19BVVhfQ0xBU1NdLFxyXG4gICAgICAgICAgICBQUkVDSU5DVF9OT19BVVhfQ0xBU1MsXHJcbiAgICAgICAgICAgIGluQ2xhc3NJbmRleCxcclxuICAgICAgICAgICAgLyppc0pwaXBUaWxlUGFydFN0cmVhbUV4cGVjdGVkPSovZmFsc2UsXHJcbiAgICAgICAgICAgICdwcmVjaW5jdCcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBkYXRhYmluO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlRGF0YWJpbiA9IGZ1bmN0aW9uKGluQ2xhc3NJbmRleCkge1xyXG4gICAgICAgIHZhciBkYXRhYmluID0gZ2V0RGF0YWJpbkZyb21BcnJheShcclxuICAgICAgICAgICAgZGF0YWJpbnNCeUNsYXNzW1RJTEVfTk9fQVVYX0NMQVNTXSxcclxuICAgICAgICAgICAgVElMRV9OT19BVVhfQ0xBU1MsXHJcbiAgICAgICAgICAgIGluQ2xhc3NJbmRleCxcclxuICAgICAgICAgICAgLyppc0pwaXBUaWxlUGFydFN0cmVhbUV4cGVjdGVkPSovdHJ1ZSxcclxuICAgICAgICAgICAgJ3RpbGVQYXJ0Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW47XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbiBhZGRFdmVudExpc3RlbmVyKFxyXG4gICAgICAgIGRhdGFiaW4sIGV2ZW50LCBsaXN0ZW5lciwgbGlzdGVuZXJUaGlzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGV2ZW50ICE9PSAnZGF0YUFycml2ZWQnKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdVbnN1cHBvcnRlZCBldmVudDogJyArXHJcbiAgICAgICAgICAgICAgICBldmVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjbGFzc0lkID0gZGF0YWJpbi5nZXRDbGFzc0lkKCk7XHJcbiAgICAgICAgdmFyIGluQ2xhc3NJZCA9IGRhdGFiaW4uZ2V0SW5DbGFzc0lkKCk7XHJcbiAgICAgICAgdmFyIGRhdGFiaW5zQXJyYXkgPSBkYXRhYmluc0J5Q2xhc3NbY2xhc3NJZF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW4gIT09IGRhdGFiaW5zQXJyYXkuZGF0YWJpbnNbaW5DbGFzc0lkXSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVW5tYXRjaGVkIGRhdGFiaW4gJyArXHJcbiAgICAgICAgICAgICAgICAnd2l0aCBjbGFzcy1JRD0nICsgY2xhc3NJZCArICcgYW5kIGluLWNsYXNzLUlEPScgKyBpbkNsYXNzSWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbnNBcnJheS5saXN0ZW5lcnNbaW5DbGFzc0lkXSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGRhdGFiaW5zQXJyYXkubGlzdGVuZXJzW2luQ2xhc3NJZF0gPSBbXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5zQXJyYXkubGlzdGVuZXJzW2luQ2xhc3NJZF0ubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGxvYWRlZEJ5dGVzSW5SZWdpc3RlcmVkRGF0YWJpbnMgKz0gZGF0YWJpbi5nZXRMb2FkZWRCeXRlcygpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBkYXRhYmluc0FycmF5Lmxpc3RlbmVyc1tpbkNsYXNzSWRdLnB1c2goe1xyXG4gICAgICAgICAgICBsaXN0ZW5lcjogbGlzdGVuZXIsXHJcbiAgICAgICAgICAgIGxpc3RlbmVyVGhpczogbGlzdGVuZXJUaGlzLFxyXG4gICAgICAgICAgICBpc1JlZ2lzdGVyZWQ6IHRydWVcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZGF0YWJpbnNBcnJheS5kYXRhYmluc1dpdGhMaXN0ZW5lcnNbaW5DbGFzc0lkXSA9IGRhdGFiaW47XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbiByZW1vdmVFdmVudExpc3RlbmVyKFxyXG4gICAgICAgIGRhdGFiaW4sIGV2ZW50LCBsaXN0ZW5lcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChldmVudCAhPT0gJ2RhdGFBcnJpdmVkJykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVW5zdXBwb3J0ZWQgZXZlbnQ6ICcgK1xyXG4gICAgICAgICAgICAgICAgZXZlbnQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGNsYXNzSWQgPSBkYXRhYmluLmdldENsYXNzSWQoKTtcclxuICAgICAgICB2YXIgaW5DbGFzc0lkID0gZGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgZGF0YWJpbnNBcnJheSA9IGRhdGFiaW5zQnlDbGFzc1tjbGFzc0lkXTtcclxuICAgICAgICB2YXIgbGlzdGVuZXJzID0gZGF0YWJpbnNBcnJheS5saXN0ZW5lcnNbaW5DbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbiAhPT0gZGF0YWJpbnNBcnJheS5kYXRhYmluc1tpbkNsYXNzSWRdIHx8XHJcbiAgICAgICAgICAgIGRhdGFiaW4gIT09IGRhdGFiaW5zQXJyYXkuZGF0YWJpbnNXaXRoTGlzdGVuZXJzW2luQ2xhc3NJZF0pIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdVbm1hdGNoZWQgZGF0YWJpbiAnICtcclxuICAgICAgICAgICAgICAgICd3aXRoIGNsYXNzLUlEPScgKyBjbGFzc0lkICsgJyBhbmQgaW4tY2xhc3MtSUQ9JyArIGluQ2xhc3NJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChsaXN0ZW5lcnNbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbaV0uaXNSZWdpc3RlcmVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGxpc3RlbmVyc1tpXSA9IGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGRhdGFiaW5zQXJyYXkuZGF0YWJpbnNXaXRoTGlzdGVuZXJzW2luQ2xhc3NJZF07XHJcbiAgICAgICAgICAgICAgICAgICAgbG9hZGVkQnl0ZXNJblJlZ2lzdGVyZWREYXRhYmlucyAtPSBkYXRhYmluLmdldExvYWRlZEJ5dGVzKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0NvdWxkIG5vdCB1bnJlZ2lzdGVyIGxpc3RlbmVyIGZyb20gZGF0YWJpbicpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5jbGVhbnVwVW5yZWdpc3RlcmVkRGF0YWJpbnMgPSBmdW5jdGlvbiBjbGVhbnVwVW5yZWdpc3RlcmVkRGF0YWJpbnMoKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhYmluc0J5Q2xhc3MubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGRhdGFiaW5zQnlDbGFzc1tpXSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGRhdGFiaW5zID0gZGF0YWJpbnNCeUNsYXNzW2ldLmRhdGFiaW5zV2l0aExpc3RlbmVycztcclxuICAgICAgICAgICAgZGF0YWJpbnNCeUNsYXNzW2ldLmRhdGFiaW5zID0gZGF0YWJpbnMuc2xpY2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbG9hZGVkQnl0ZXMgPSBsb2FkZWRCeXRlc0luUmVnaXN0ZXJlZERhdGFiaW5zO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNhdmVEYXRhID0gZnVuY3Rpb24gKGhlYWRlciwgbWVzc2FnZSkge1xyXG4gICAgICAgIC8vIEEuMi4yXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGhlYWRlci5jb2Rlc3RyZWFtSW5kZXggIT09IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdOb24gemVybyBDc24gKENvZGUgU3RyZWFtIEluZGV4KScsICdBLjIuMicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKGhlYWRlci5jbGFzc0lkKSB7XHJcbiAgICAgICAgICAgIGNhc2UgNjpcclxuICAgICAgICAgICAgICAgIHNhdmVNYWluSGVhZGVyKGhlYWRlciwgbWVzc2FnZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIDg6XHJcbiAgICAgICAgICAgICAgICBzYXZlTWV0YWRhdGEoaGVhZGVyLCBtZXNzYWdlKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIC8vIEEuMy4yLCBBLjMuMywgQS4zLjRcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGRhdGFiaW5zQXJyYXkgPSBkYXRhYmluc0J5Q2xhc3NbaGVhZGVyLmNsYXNzSWRdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGRhdGFiaW5zQXJyYXkgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrOyAvLyBBLjIuMlxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgaXNKcHRFeHBlY3RlZCA9ICEhZm9yYmlkZGVuSW5KcHBbaGVhZGVyLmNsYXNzSWRdO1xyXG4gICAgICAgICAgICAgICAgdmFyIGRhdGFiaW4gPSBnZXREYXRhYmluRnJvbUFycmF5KFxyXG4gICAgICAgICAgICAgICAgICAgIGRhdGFiaW5zQXJyYXksXHJcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyLmNsYXNzSWQsXHJcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyLmluQ2xhc3NJZCxcclxuICAgICAgICAgICAgICAgICAgICBpc0pwdEV4cGVjdGVkLFxyXG4gICAgICAgICAgICAgICAgICAgICc8Y2xhc3MgSUQgJyArIGhlYWRlci5jbGFzc0lkICsgJz4nKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGJ5dGVzQmVmb3JlID0gZGF0YWJpbi5nZXRMb2FkZWRCeXRlcygpO1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpbi5hZGREYXRhKGhlYWRlciwgbWVzc2FnZSk7XHJcbiAgICAgICAgICAgICAgICB2YXIgYnl0ZXNEaWZmZXJlbmNlID0gZGF0YWJpbi5nZXRMb2FkZWRCeXRlcygpIC0gYnl0ZXNCZWZvcmU7XHJcbiAgICAgICAgICAgICAgICBsb2FkZWRCeXRlcyArPSBieXRlc0RpZmZlcmVuY2U7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMgPSBkYXRhYmluc0FycmF5Lmxpc3RlbmVycztcclxuICAgICAgICAgICAgICAgIHZhciBkYXRhYmluTGlzdGVuZXJzID0gbGlzdGVuZXJzW2hlYWRlci5pbkNsYXNzSWRdO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoZGF0YWJpbkxpc3RlbmVycyAhPT0gdW5kZWZpbmVkICYmIGRhdGFiaW5MaXN0ZW5lcnMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxvYWRlZEJ5dGVzSW5SZWdpc3RlcmVkRGF0YWJpbnMgKz0gYnl0ZXNEaWZmZXJlbmNlO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBsb2NhbExpc3RlbmVycyA9IGRhdGFiaW5MaXN0ZW5lcnMuc2xpY2UoKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxvY2FsTGlzdGVuZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsaXN0ZW5lciA9IGxvY2FsTGlzdGVuZXJzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXIuaXNSZWdpc3RlcmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lci5jYWxsKGxpc3RlbmVyLmxpc3RlbmVyVGhpcywgZGF0YWJpbik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNhdmVNYWluSGVhZGVyKGhlYWRlciwgbWVzc2FnZSkge1xyXG4gICAgICAgIC8vIEEuMy41XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGhlYWRlci5pbkNsYXNzSWQgIT09IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdNYWluIGhlYWRlciBkYXRhLWJpbiB3aXRoICcgK1xyXG4gICAgICAgICAgICAgICAgJ2luLWNsYXNzIGluZGV4IG90aGVyIHRoYW4gemVybyBpcyBub3QgdmFsaWQnLCAnQS4zLjUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQmVmb3JlID0gbWFpbkhlYWRlckRhdGFiaW4uZ2V0TG9hZGVkQnl0ZXMoKTtcclxuICAgICAgICBtYWluSGVhZGVyRGF0YWJpbi5hZGREYXRhKGhlYWRlciwgbWVzc2FnZSk7XHJcbiAgICAgICAgdmFyIGJ5dGVzRGlmZmVyZW5jZSA9IG1haW5IZWFkZXJEYXRhYmluLmdldExvYWRlZEJ5dGVzKCkgLSBieXRlc0JlZm9yZTtcclxuICAgICAgICBcclxuICAgICAgICBsb2FkZWRCeXRlcyArPSBieXRlc0RpZmZlcmVuY2U7XHJcbiAgICAgICAgbG9hZGVkQnl0ZXNJblJlZ2lzdGVyZWREYXRhYmlucyArPSBieXRlc0RpZmZlcmVuY2U7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNhdmVNZXRhZGF0YShoZWFkZXIsIG1lc3NhZ2UpIHtcclxuICAgICAgICAvLyBBLjMuNlxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oJ3JlY2lldmUgbWV0YWRhdGEtYmluJywgJ0EuMy42Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gaWdub3JlIHVudXNlZCBtZXRhZGF0YSAobGVnYWwgYWNjb3JkaW5nIHRvIEEuMi4yKS5cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0RGF0YWJpbkZyb21BcnJheShcclxuICAgICAgICBkYXRhYmluc0FycmF5LFxyXG4gICAgICAgIGNsYXNzSWQsXHJcbiAgICAgICAgaW5DbGFzc0lkLFxyXG4gICAgICAgIGlzSnBpcFRpbGVQYXJ0U3RyZWFtRXhwZWN0ZWQsXHJcbiAgICAgICAgZGF0YWJpblR5cGVEZXNjcmlwdGlvbikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpc0pwaXBUaWxlUGFydFN0cmVhbUV4cGVjdGVkICE9PSBpc0pwaXBUaWxlUGFydFN0cmVhbSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuV3JvbmdTdHJlYW1FeGNlcHRpb24oJ2RhdGFiaW4gb2YgdHlwZSAnICtcclxuICAgICAgICAgICAgICAgIGRhdGFiaW5UeXBlRGVzY3JpcHRpb24sIGlzSnBpcFRpbGVQYXJ0U3RyZWFtKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRhdGFiaW4gPSBkYXRhYmluc0FycmF5LmRhdGFiaW5zW2luQ2xhc3NJZF07XHJcbiAgICAgICAgaWYgKCFkYXRhYmluKSB7XHJcbiAgICAgICAgICAgIGRhdGFiaW4gPSBqcGlwRmFjdG9yeS5jcmVhdGVEYXRhYmluUGFydHMoY2xhc3NJZCwgaW5DbGFzc0lkKTtcclxuICAgICAgICAgICAgZGF0YWJpbnNBcnJheS5kYXRhYmluc1tpbkNsYXNzSWRdID0gZGF0YWJpbjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZURhdGFiaW5zQXJyYXkoKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZGF0YWJpbnM6IFtdLFxyXG4gICAgICAgICAgICBsaXN0ZW5lcnM6IFtdLFxyXG4gICAgICAgICAgICBkYXRhYmluc1dpdGhMaXN0ZW5lcnM6IFtdXHJcbiAgICAgICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcE9iamVjdFBvb2xCeURhdGFiaW4oKSB7XHJcbiAgICB2YXIgZGF0YWJpbklkVG9PYmplY3QgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRPYmplY3QgPSBmdW5jdGlvbiBnZXRPYmplY3QoZGF0YWJpbikge1xyXG4gICAgICAgIHZhciBjbGFzc0lkID0gZGF0YWJpbi5nZXRDbGFzc0lkKCk7XHJcbiAgICAgICAgdmFyIGluQ2xhc3NJZFRvT2JqZWN0ID0gZGF0YWJpbklkVG9PYmplY3RbY2xhc3NJZF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGluQ2xhc3NJZFRvT2JqZWN0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgaW5DbGFzc0lkVG9PYmplY3QgPSBbXTtcclxuICAgICAgICAgICAgZGF0YWJpbklkVG9PYmplY3RbY2xhc3NJZF0gPSBpbkNsYXNzSWRUb09iamVjdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGluQ2xhc3NJZCA9IGRhdGFiaW4uZ2V0SW5DbGFzc0lkKCk7XHJcbiAgICAgICAgdmFyIG9iaiA9IGluQ2xhc3NJZFRvT2JqZWN0W2luQ2xhc3NJZF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG9iaiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIG9iaiA9IHt9O1xyXG4gICAgICAgICAgICBvYmouZGF0YWJpbiA9IGRhdGFiaW47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbkNsYXNzSWRUb09iamVjdFtpbkNsYXNzSWRdID0gb2JqO1xyXG4gICAgICAgIH0gZWxzZSBpZiAob2JqLmRhdGFiaW4gIT09IGRhdGFiaW4pIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnRGF0YWJpbiBJRHMgYXJlIG5vdCB1bmlxdWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG9iajtcclxuICAgIH07XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIoXHJcbiAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgIHF1YWxpdHlMYXllclJlYWNoZWRDYWxsYmFjayxcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgcXVhbGl0eUxheWVyc0NhY2hlLFxyXG4gICAganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdmFyIG51bVF1YWxpdHlMYXllcnNUb1dhaXRGb3I7XHJcbiAgICB2YXIgdGlsZUhlYWRlcnNOb3RMb2FkZWQgPSAwO1xyXG4gICAgdmFyIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkID0gMDtcclxuICAgIHZhciB1bnJlZ2lzdGVyZWQgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgdmFyIHJlZ2lzdGVyZWRUaWxlSGVhZGVyRGF0YWJpbnMgPSBbXTtcclxuICAgIHZhciByZWdpc3RlcmVkUHJlY2luY3REYXRhYmlucyA9IFtdO1xyXG4gICAgdmFyIGFjY3VtdWxhdGVkRGF0YVBlckRhdGFiaW4gPSBqcGlwRmFjdG9yeS5jcmVhdGVPYmplY3RQb29sQnlEYXRhYmluKCk7XHJcbiAgICB2YXIgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllciA9IFtdO1xyXG4gICAgXHJcbiAgICByZWdpc3RlcigpO1xyXG4gICAgXHJcbiAgICB0aGlzLnVucmVnaXN0ZXIgPSBmdW5jdGlvbiB1bnJlZ2lzdGVyKCkge1xyXG4gICAgICAgIGlmICh1bnJlZ2lzdGVyZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVnaXN0ZXJlZFRpbGVIZWFkZXJEYXRhYmlucy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgICAgICAgICByZWdpc3RlcmVkVGlsZUhlYWRlckRhdGFiaW5zW2ldLFxyXG4gICAgICAgICAgICAgICAgJ2RhdGFBcnJpdmVkJyxcclxuICAgICAgICAgICAgICAgIHRpbGVIZWFkZXJEYXRhQXJyaXZlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmVnaXN0ZXJlZFByZWNpbmN0RGF0YWJpbnMubGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlci5yZW1vdmVFdmVudExpc3RlbmVyKFxyXG4gICAgICAgICAgICAgICAgcmVnaXN0ZXJlZFByZWNpbmN0RGF0YWJpbnNbal0sXHJcbiAgICAgICAgICAgICAgICAnZGF0YUFycml2ZWQnLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3REYXRhQXJyaXZlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHVucmVnaXN0ZXJlZCA9IHRydWU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiByZWdpc3RlcigpIHtcclxuICAgICAgICArK3RpbGVIZWFkZXJzTm90TG9hZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlSXRlcmF0b3IgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVzSXRlcmF0b3IoY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgdmFyIHRpbGVJbmRleCA9IHRpbGVJdGVyYXRvci50aWxlSW5kZXg7XHJcbiAgICAgICAgICAgIHZhciBkYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRUaWxlSGVhZGVyRGF0YWJpbih0aWxlSW5kZXgpO1xyXG4gICAgICAgICAgICByZWdpc3RlcmVkVGlsZUhlYWRlckRhdGFiaW5zLnB1c2goZGF0YWJpbik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLmFkZEV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLCAnZGF0YUFycml2ZWQnLCB0aWxlSGVhZGVyRGF0YUFycml2ZWQpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICsrdGlsZUhlYWRlcnNOb3RMb2FkZWQ7XHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJEYXRhQXJyaXZlZChkYXRhYmluKTtcclxuICAgICAgICB9IHdoaWxlICh0aWxlSXRlcmF0b3IudHJ5QWR2YW5jZSgpKTtcclxuICAgICAgICBcclxuICAgICAgICAtLXRpbGVIZWFkZXJzTm90TG9hZGVkO1xyXG4gICAgICAgIHRyeUFkdmFuY2VRdWFsaXR5TGF5ZXJzUmVhY2hlZCgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0aWxlSGVhZGVyRGF0YUFycml2ZWQodGlsZUhlYWRlckRhdGFiaW4pIHtcclxuICAgICAgICBpZiAoIXRpbGVIZWFkZXJEYXRhYmluLmlzQWxsRGF0YWJpbkxvYWRlZCgpKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVBY2N1bXVsYXRlZERhdGEgPSBhY2N1bXVsYXRlZERhdGFQZXJEYXRhYmluLmdldE9iamVjdChcclxuICAgICAgICAgICAgdGlsZUhlYWRlckRhdGFiaW4pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlQWNjdW11bGF0ZWREYXRhLmlzQWxyZWFkeUxvYWRlZCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRpbGVBY2N1bXVsYXRlZERhdGEuaXNBbHJlYWR5TG9hZGVkID0gdHJ1ZTtcclxuICAgICAgICAtLXRpbGVIZWFkZXJzTm90TG9hZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlSW5kZXggPSB0aWxlSGVhZGVyRGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgdGlsZVN0cnVjdHVyZSA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVN0cnVjdHVyZSh0aWxlSW5kZXgpO1xyXG4gICAgICAgIHZhciBxdWFsaXR5SW5UaWxlID0gdGlsZVN0cnVjdHVyZS5nZXROdW1RdWFsaXR5TGF5ZXJzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0SXRlcmF0b3IgPSB0aWxlU3RydWN0dXJlLmdldFByZWNpbmN0SXRlcmF0b3IoXHJcbiAgICAgICAgICAgIHRpbGVJbmRleCwgY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG5cclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIGlmICghcHJlY2luY3RJdGVyYXRvci5pc0luQ29kZXN0cmVhbVBhcnQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIHByZWNpbmN0IG5vdCBpbiBjb2Rlc3RyZWFtIHBhcnQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGluQ2xhc3NJZCA9IHRpbGVTdHJ1Y3R1cmUucHJlY2luY3RQb3NpdGlvblRvSW5DbGFzc0luZGV4KFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RJdGVyYXRvcik7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHByZWNpbmN0RGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0UHJlY2luY3REYXRhYmluKGluQ2xhc3NJZCk7XHJcbiAgICAgICAgICAgIHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zLnB1c2gocHJlY2luY3REYXRhYmluKTtcclxuICAgICAgICAgICAgdmFyIGFjY3VtdWxhdGVkRGF0YSA9IGFjY3VtdWxhdGVkRGF0YVBlckRhdGFiaW4uZ2V0T2JqZWN0KFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChhY2N1bXVsYXRlZERhdGEucXVhbGl0eUluVGlsZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVGlsZSB3YXMgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2l0ZXJhdGVkIHR3aWNlIGluIGNvZGVzdHJlYW0gcGFydCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBhY2N1bXVsYXRlZERhdGEucXVhbGl0eUluVGlsZSA9IHF1YWxpdHlJblRpbGU7XHJcbiAgICAgICAgICAgIGluY3JlbWVudFByZWNpbmN0UXVhbGl0eUxheWVycyhcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgYWNjdW11bGF0ZWREYXRhLCBwcmVjaW5jdEl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIuYWRkRXZlbnRMaXN0ZW5lcihcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgJ2RhdGFBcnJpdmVkJywgcHJlY2luY3REYXRhQXJyaXZlZCk7XHJcbiAgICAgICAgfSB3aGlsZSAocHJlY2luY3RJdGVyYXRvci50cnlBZHZhbmNlKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRyeUFkdmFuY2VRdWFsaXR5TGF5ZXJzUmVhY2hlZCgpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwcmVjaW5jdERhdGFBcnJpdmVkKHByZWNpbmN0RGF0YWJpbikge1xyXG4gICAgICAgIHZhciBsb2NhbCA9IHVucmVnaXN0ZXJlZDtcclxuICAgICAgICB2YXIgYWNjdW11bGF0ZWREYXRhID0gYWNjdW11bGF0ZWREYXRhUGVyRGF0YWJpbi5nZXRPYmplY3QoXHJcbiAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbik7XHJcblxyXG4gICAgICAgIHZhciBvbGRRdWFsaXR5TGF5ZXJzUmVhY2hlZCA9IGFjY3VtdWxhdGVkRGF0YS5udW1RdWFsaXR5TGF5ZXJzUmVhY2hlZDtcclxuICAgICAgICB2YXIgcXVhbGl0eUluVGlsZSA9XHJcbiAgICAgICAgICAgIGFjY3VtdWxhdGVkRGF0YS5xdWFsaXR5SW5UaWxlO1xyXG5cclxuICAgICAgICBpZiAob2xkUXVhbGl0eUxheWVyc1JlYWNoZWQgPT09IHF1YWxpdHlJblRpbGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAtLXByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJbb2xkUXVhbGl0eUxheWVyc1JlYWNoZWRdO1xyXG4gICAgICAgIGluY3JlbWVudFByZWNpbmN0UXVhbGl0eUxheWVycyhwcmVjaW5jdERhdGFiaW4sIGFjY3VtdWxhdGVkRGF0YSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdHJ5QWR2YW5jZVF1YWxpdHlMYXllcnNSZWFjaGVkKCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGluY3JlbWVudFByZWNpbmN0UXVhbGl0eUxheWVycyhcclxuICAgICAgICBwcmVjaW5jdERhdGFiaW4sIGFjY3VtdWxhdGVkRGF0YSwgcHJlY2luY3RJdGVyYXRvck9wdGlvbmFsKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHF1YWxpdHlMYXllcnMgPSBxdWFsaXR5TGF5ZXJzQ2FjaGUuZ2V0UXVhbGl0eUxheWVyT2Zmc2V0KFxyXG4gICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLnF1YWxpdHksXHJcbiAgICAgICAgICAgIHByZWNpbmN0SXRlcmF0b3JPcHRpb25hbCk7XHJcblxyXG4gICAgICAgIHZhciBudW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCA9IHF1YWxpdHlMYXllcnMubnVtUXVhbGl0eUxheWVycztcclxuICAgICAgICBhY2N1bXVsYXRlZERhdGEubnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPSBudW1RdWFsaXR5TGF5ZXJzUmVhY2hlZDtcclxuXHJcbiAgICAgICAgdmFyIHF1YWxpdHlJblRpbGUgPVxyXG4gICAgICAgICAgICBhY2N1bXVsYXRlZERhdGEucXVhbGl0eUluVGlsZTtcclxuXHJcbiAgICAgICAgaWYgKG51bVF1YWxpdHlMYXllcnNSZWFjaGVkID09PSBxdWFsaXR5SW5UaWxlKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZXZDb3VudCA9XHJcbiAgICAgICAgICAgIHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJbbnVtUXVhbGl0eUxheWVyc1JlYWNoZWRdIHx8IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltudW1RdWFsaXR5TGF5ZXJzUmVhY2hlZF0gPVxyXG4gICAgICAgICAgICBwcmV2Q291bnQgKyAxO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0cnlBZHZhbmNlUXVhbGl0eUxheWVyc1JlYWNoZWQoKSB7XHJcbiAgICAgICAgaWYgKHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJbbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWRdID4gMCB8fFxyXG4gICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCA9PT0gJ21heCcgfHxcclxuICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPj0gbnVtUXVhbGl0eUxheWVyc1RvV2FpdEZvciB8fFxyXG4gICAgICAgICAgICB0aWxlSGVhZGVyc05vdExvYWRlZCA+IDApIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhhc1ByZWNpbmN0c0luUXVhbGl0eUxheWVyO1xyXG4gICAgICAgIHZhciBtYXhRdWFsaXR5TGF5ZXJzID0gcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllci5sZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICArK21pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkID49IG1heFF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkID0gJ21heCc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaGFzUHJlY2luY3RzSW5RdWFsaXR5TGF5ZXIgPVxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllclttaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZF0gPiAwO1xyXG4gICAgICAgIH0gd2hpbGUgKCFoYXNQcmVjaW5jdHNJblF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrKG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZW5zdXJlUXVhbGl0eUxheWVyc1N0YXRpc3RpY3NGb3JEZWJ1ZygpIHtcclxuICAgICAgICB2YXIgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllckV4cGVjdGVkID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RlcmVkUHJlY2luY3REYXRhYmlucy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgYWNjdW11bGF0ZWREYXRhID0gYWNjdW11bGF0ZWREYXRhUGVyRGF0YWJpbi5nZXRPYmplY3QoXHJcbiAgICAgICAgICAgICAgICByZWdpc3RlcmVkUHJlY2luY3REYXRhYmluc1tpXSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcXVhbGl0eUluVGlsZSA9XHJcbiAgICAgICAgICAgICAgICBhY2N1bXVsYXRlZERhdGEucXVhbGl0eUluVGlsZTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocXVhbGl0eUluVGlsZSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnTm8gaW5mb3JtYXRpb24gb2YgcXVhbGl0eUluVGlsZSBpbiAnICtcclxuICAgICAgICAgICAgICAgICAgICAnSnBpcFJlcXVlc3REYXRhYmluc0xpc3RlbmVyJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBxdWFsaXR5TGF5ZXJzID0gcXVhbGl0eUxheWVyc0NhY2hlLmdldFF1YWxpdHlMYXllck9mZnNldChcclxuICAgICAgICAgICAgICAgIHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zW2ldLFxyXG4gICAgICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMucXVhbGl0eSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocXVhbGl0eUxheWVycy5udW1RdWFsaXR5TGF5ZXJzID09PSBxdWFsaXR5SW5UaWxlKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIG9sZFZhbHVlID0gcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllckV4cGVjdGVkW1xyXG4gICAgICAgICAgICAgICAgcXVhbGl0eUxheWVycy5udW1RdWFsaXR5TGF5ZXJzXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJFeHBlY3RlZFtcclxuICAgICAgICAgICAgICAgIHF1YWxpdHlMYXllcnMubnVtUXVhbGl0eUxheWVyc10gPSAob2xkVmFsdWUgfHwgMCkgKyAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGVuZ3RoID0gTWF0aC5tYXgoXHJcbiAgICAgICAgICAgIHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJFeHBlY3RlZC5sZW5ndGgsXHJcbiAgICAgICAgICAgIHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXIubGVuZ3RoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkRXhwZWN0ZWQgPSAnbWF4JztcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxlbmd0aDsgKytqKSB7XHJcbiAgICAgICAgICAgIHZhciBpc0V4cGVjdGVkWmVybyA9IChwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyRXhwZWN0ZWRbal0gfHwgMCkgPT09IDA7XHJcbiAgICAgICAgICAgIHZhciBpc0FjdHVhbFplcm8gPSAocHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltqXSB8fCAwKSA9PT0gMDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpc0V4cGVjdGVkWmVybyAhPT0gaXNBY3R1YWxaZXJvKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnV3JvbmcgYWNjdW11bGF0ZWQgc3RhdGlzdGljcyBpbiBKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXInKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzRXhwZWN0ZWRaZXJvKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJbal0gIT09XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyRXhwZWN0ZWRbal0pIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ1dyb25nICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdhY2N1bXVsYXRlZCBzdGF0aXN0aWNzIGluIEpwaXBSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWRFeHBlY3RlZCA9PT0gJ21heCcpIHtcclxuICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkRXhwZWN0ZWQgPSBqO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCAhPT0gbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWRFeHBlY3RlZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdXcm9uZyBtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCBpbiBKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXInKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwQ29kZXN0cmVhbVN0cnVjdHVyZShcclxuICAgIGpwaXBTdHJ1Y3R1cmVQYXJzZXIsXHJcbiAgICBqcGlwRmFjdG9yeSxcclxuICAgIHByb2dyZXNzaW9uT3JkZXIpIHtcclxuXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgcGFyYW1zO1xyXG4gICAgdmFyIHNpemVzQ2FsY3VsYXRvcjtcclxuICAgIFxyXG4gICAgdmFyIGRlZmF1bHRUaWxlU3RydWN0dXJlQnlFZGdlVHlwZTtcclxuXHJcbiAgICB2YXIgY2FjaGVkVGlsZVN0cnVjdHVyZXMgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRTaXplc1BhcmFtcyA9IGZ1bmN0aW9uIGdldFNpemVzUGFyYW1zKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtVGlsZXNYID0gZnVuY3Rpb24gZ2V0TnVtVGlsZXNYKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVRpbGVzID0gc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgIHJldHVybiBudW1UaWxlcztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtVGlsZXNZID0gZnVuY3Rpb24gZ2V0TnVtVGlsZXNZKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVRpbGVzID0gc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIHJldHVybiBudW1UaWxlcztcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5nZXROdW1Db21wb25lbnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICByZXR1cm4gcGFyYW1zLm51bUNvbXBvbmVudHM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEltYWdlV2lkdGggPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRMZXZlbFdpZHRoKCk7XHJcbiAgICAgICAgcmV0dXJuIHNpemU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEltYWdlSGVpZ2h0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIHNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWxIZWlnaHQoKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TGV2ZWxXaWR0aCA9IGZ1bmN0aW9uKGxldmVsKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIHNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWxXaWR0aChsZXZlbCk7XHJcbiAgICAgICAgcmV0dXJuIHNpemU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExldmVsSGVpZ2h0ID0gZnVuY3Rpb24obGV2ZWwpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRMZXZlbEhlaWdodChsZXZlbCk7XHJcbiAgICAgICAgcmV0dXJuIHNpemU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVXaWR0aCA9IGZ1bmN0aW9uKGxldmVsKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIHNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0VGlsZVdpZHRoKGxldmVsKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZUhlaWdodCA9IGZ1bmN0aW9uKGxldmVsKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIHNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0VGlsZUhlaWdodChsZXZlbCk7XHJcbiAgICAgICAgcmV0dXJuIHNpemU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZU9mZnNldFggPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgb2Zmc2V0ID0gc2l6ZXNDYWxjdWxhdG9yLmdldEZpcnN0VGlsZU9mZnNldFgoKTtcclxuICAgICAgICByZXR1cm4gb2Zmc2V0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRGaXJzdFRpbGVPZmZzZXRZID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuXHJcbiAgICAgICAgdmFyIG9mZnNldCA9IHNpemVzQ2FsY3VsYXRvci5nZXRGaXJzdFRpbGVPZmZzZXRZKCk7XHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZUxlZnQgPSBmdW5jdGlvbiBnZXRUaWxlTGVmdChcclxuICAgICAgICB0aWxlSW5kZXgsIGxldmVsKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVggPSB0aWxlSW5kZXggJSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgaWYgKHRpbGVYID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUxlZnQgPVxyXG4gICAgICAgICAgICAodGlsZVggLSAxKSAqIHNpemVzQ2FsY3VsYXRvci5nZXRUaWxlV2lkdGgobGV2ZWwpICtcclxuICAgICAgICAgICAgc2l6ZXNDYWxjdWxhdG9yLmdldEZpcnN0VGlsZVdpZHRoKGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGlsZUxlZnQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVUb3AgPSBmdW5jdGlvbiBnZXRUaWxlVG9wKHRpbGVJbmRleCwgbGV2ZWwpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlWSA9IE1hdGguZmxvb3IodGlsZUluZGV4IC8gc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWCgpKTtcclxuICAgICAgICBpZiAodGlsZVkgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlVG9wID1cclxuICAgICAgICAgICAgKHRpbGVZIC0gMSkgKiBzaXplc0NhbGN1bGF0b3IuZ2V0VGlsZUhlaWdodChsZXZlbCkgK1xyXG4gICAgICAgICAgICBzaXplc0NhbGN1bGF0b3IuZ2V0Rmlyc3RUaWxlSGVpZ2h0KGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGlsZVRvcDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RGVmYXVsdFRpbGVTdHJ1Y3R1cmUgPSBmdW5jdGlvbiBnZXREZWZhdWx0VGlsZVN0cnVjdHVyZSgpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBnZXREZWZhdWx0VGlsZVN0cnVjdHVyZUludGVybmFsKHtcclxuICAgICAgICAgICAgaG9yaXpvbnRhbEVkZ2VUeXBlOiBzaXplc0NhbGN1bGF0b3IuRURHRV9UWVBFX05PX0VER0UsXHJcbiAgICAgICAgICAgIHZlcnRpY2FsRWRnZVR5cGU6IHNpemVzQ2FsY3VsYXRvci5FREdFX1RZUEVfTk9fRURHRVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZVN0cnVjdHVyZSA9IGdldFRpbGVTdHJ1Y3R1cmU7XHJcblxyXG4gICAgdGhpcy50aWxlUG9zaXRpb25Ub0luQ2xhc3NJbmRleCA9IGZ1bmN0aW9uKHRpbGVQb3NpdGlvbikge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgdmFyIHRpbGVzWCA9IHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1goKTtcclxuICAgICAgICB2YXIgdGlsZXNZID0gc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKCd0aWxlUG9zaXRpb24udGlsZVgnLCB0aWxlUG9zaXRpb24udGlsZVgsIHRpbGVzWCk7XHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoJ3RpbGVQb3NpdGlvbi50aWxlWScsIHRpbGVQb3NpdGlvbi50aWxlWSwgdGlsZXNZKTtcclxuXHJcbiAgICAgICAgdmFyIGluQ2xhc3NJbmRleCA9IHRpbGVQb3NpdGlvbi50aWxlWCArIHRpbGVQb3NpdGlvbi50aWxlWSAqIHRpbGVzWDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaW5DbGFzc0luZGV4O1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnRpbGVJbkNsYXNzSW5kZXhUb1Bvc2l0aW9uID0gZnVuY3Rpb24oaW5DbGFzc0luZGV4KSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICB2YXIgdGlsZXNYID0gc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgIHZhciB0aWxlc1kgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgdmFyIG51bVRpbGVzID0gdGlsZXNYICogdGlsZXNZO1xyXG5cclxuICAgICAgICB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZSgnaW5DbGFzc0luZGV4JywgaW5DbGFzc0luZGV4LCB0aWxlc1ggKiB0aWxlc1kpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlWCA9IGluQ2xhc3NJbmRleCAlIHRpbGVzWDtcclxuICAgICAgICB2YXIgdGlsZVkgPSAoaW5DbGFzc0luZGV4IC0gdGlsZVgpIC8gdGlsZXNYO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIHRpbGVYOiB0aWxlWCxcclxuICAgICAgICAgICAgdGlsZVk6IHRpbGVZXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZXNJdGVyYXRvciA9IGZ1bmN0aW9uIGdldFRpbGVzSXRlcmF0b3IoY29kZXN0cmVhbVBhcnRQYXJhbXMpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIHZhciBib3VuZHMgPSBzaXplc0NhbGN1bGF0b3IuZ2V0VGlsZXNGcm9tUGl4ZWxzKGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2V0YWJsZUl0ZXJhdG9yID0ge1xyXG4gICAgICAgICAgICBjdXJyZW50WDogYm91bmRzLm1pblRpbGVYLFxyXG4gICAgICAgICAgICBjdXJyZW50WTogYm91bmRzLm1pblRpbGVZXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSB7XHJcbiAgICAgICAgICAgIGdldCB0aWxlSW5kZXgoKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3RJblJvdyA9XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRZICogc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgICAgICAgICAgdmFyIGluZGV4ID0gZmlyc3RJblJvdyArIHNldGFibGVJdGVyYXRvci5jdXJyZW50WDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdHJ5QWR2YW5jZTogZnVuY3Rpb24gdHJ5QWR2YW5jZSgpIHtcclxuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSB0cnlBZHZhbmNlVGlsZUl0ZXJhdG9yKHNldGFibGVJdGVyYXRvciwgYm91bmRzKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBpdGVyYXRvcjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0U2l6ZU9mUGFydCA9IGZ1bmN0aW9uIGdldFNpemVPZlBhcnQoY29kZXN0cmVhbVBhcnRQYXJhbXMpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaXplID0gc2l6ZXNDYWxjdWxhdG9yLmdldFNpemVPZlBhcnQoY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gdHJ5QWR2YW5jZVRpbGVJdGVyYXRvcihzZXRhYmxlSXRlcmF0b3IsIGJvdW5kcykge1xyXG4gICAgICAgIGlmIChzZXRhYmxlSXRlcmF0b3IuY3VycmVudFkgPj0gYm91bmRzLm1heFRpbGVZRXhjbHVzaXZlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0Nhbm5vdCBhZHZhbmNlIHRpbGUgaXRlcmF0b3IgYWZ0ZXIgZW5kJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICsrc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRYO1xyXG4gICAgICAgIGlmIChzZXRhYmxlSXRlcmF0b3IuY3VycmVudFggPCBib3VuZHMubWF4VGlsZVhFeGNsdXNpdmUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHNldGFibGVJdGVyYXRvci5jdXJyZW50WCA9IGJvdW5kcy5taW5UaWxlWDtcclxuICAgICAgICArK3NldGFibGVJdGVyYXRvci5jdXJyZW50WTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNNb3JlVGlsZXNBdmFpbGFibGUgPVxyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IuY3VycmVudFkgPCBib3VuZHMubWF4VGlsZVlFeGNsdXNpdmU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGlzTW9yZVRpbGVzQXZhaWxhYmxlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRUaWxlU3RydWN0dXJlKHRpbGVJZCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1heFRpbGVJZCA9XHJcbiAgICAgICAgICAgIHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1goKSAqIHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1koKS0gMTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGlsZUlkIDwgMCB8fCB0aWxlSWQgPiBtYXhUaWxlSWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ3RpbGVJZCcsXHJcbiAgICAgICAgICAgICAgICB0aWxlSWQsXHJcbiAgICAgICAgICAgICAgICAnRXhwZWN0ZWQgdmFsdWUgYmV0d2VlbiAwIGFuZCAnICsgbWF4VGlsZUlkKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzRWRnZSA9IHNpemVzQ2FsY3VsYXRvci5pc0VkZ2VUaWxlSWQodGlsZUlkKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2FjaGVkVGlsZVN0cnVjdHVyZXNbdGlsZUlkXSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlUGFyYW1zID0ganBpcFN0cnVjdHVyZVBhcnNlci5wYXJzZU92ZXJyaWRlblRpbGVQYXJhbXModGlsZUlkKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghIXRpbGVQYXJhbXMpIHtcclxuICAgICAgICAgICAgICAgIGNhY2hlZFRpbGVTdHJ1Y3R1cmVzW3RpbGVJZF0gPSBjcmVhdGVUaWxlU3RydWN0dXJlKHRpbGVQYXJhbXMsIGlzRWRnZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjYWNoZWRUaWxlU3RydWN0dXJlc1t0aWxlSWRdID0gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2FjaGVkVGlsZVN0cnVjdHVyZXNbdGlsZUlkXSkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkVGlsZVN0cnVjdHVyZXNbdGlsZUlkXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGdldERlZmF1bHRUaWxlU3RydWN0dXJlSW50ZXJuYWwoaXNFZGdlKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKHBhcmFtTmFtZSwgcGFyYW1WYWx1ZSwgc3VwcmltdW1QYXJhbVZhbHVlKSB7XHJcbiAgICAgICAgaWYgKHBhcmFtVmFsdWUgPCAwIHx8IHBhcmFtVmFsdWUgPj0gc3VwcmltdW1QYXJhbVZhbHVlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgIHBhcmFtTmFtZSxcclxuICAgICAgICAgICAgICAgIHBhcmFtVmFsdWUsXHJcbiAgICAgICAgICAgICAgICBwYXJhbU5hbWUgKyAnIGlzIGV4cGVjdGVkIHRvIGJlIGJldHdlZW4gMCBhbmQgJyArIHN1cHJpbXVtUGFyYW1WYWx1ZSAtIDEpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0RGVmYXVsdFRpbGVTdHJ1Y3R1cmVJbnRlcm5hbChlZGdlVHlwZSkge1xyXG4gICAgICAgIGlmICghZGVmYXVsdFRpbGVTdHJ1Y3R1cmVCeUVkZ2VUeXBlKSB7XHJcbiAgICAgICAgICAgIHZhciBkZWZhdWx0VGlsZVBhcmFtcyA9IGpwaXBTdHJ1Y3R1cmVQYXJzZXIucGFyc2VEZWZhdWx0VGlsZVBhcmFtcygpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdFRpbGVTdHJ1Y3R1cmVCeUVkZ2VUeXBlID0gbmV3IEFycmF5KDMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaG9yaXpvbnRhbEVkZ2UgPSAwOyBob3Jpem9udGFsRWRnZSA8IDM7ICsraG9yaXpvbnRhbEVkZ2UpIHtcclxuICAgICAgICAgICAgICAgIGRlZmF1bHRUaWxlU3RydWN0dXJlQnlFZGdlVHlwZVtob3Jpem9udGFsRWRnZV0gPSBuZXcgQXJyYXkoMyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIHZlcnRpY2FsRWRnZSA9IDA7IHZlcnRpY2FsRWRnZSA8IDM7ICsrdmVydGljYWxFZGdlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGVkZ2UgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGhvcml6b250YWxFZGdlVHlwZTogaG9yaXpvbnRhbEVkZ2UsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRpY2FsRWRnZVR5cGU6IHZlcnRpY2FsRWRnZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHRUaWxlU3RydWN0dXJlQnlFZGdlVHlwZVtob3Jpem9udGFsRWRnZV1bdmVydGljYWxFZGdlXSA9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZVRpbGVTdHJ1Y3R1cmUoZGVmYXVsdFRpbGVQYXJhbXMsIGVkZ2UpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdHJ1Y3R1cmVCeVZlcnRpY2FsVHlwZSA9XHJcbiAgICAgICAgICAgIGRlZmF1bHRUaWxlU3RydWN0dXJlQnlFZGdlVHlwZVtlZGdlVHlwZS5ob3Jpem9udGFsRWRnZVR5cGVdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlU3RydWN0dXJlID0gc3RydWN0dXJlQnlWZXJ0aWNhbFR5cGVbZWRnZVR5cGUudmVydGljYWxFZGdlVHlwZV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRpbGVTdHJ1Y3R1cmU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZVRpbGVTdHJ1Y3R1cmUodGlsZVBhcmFtcywgZWRnZVR5cGUpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaXplUGFyYW1zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh0aWxlUGFyYW1zKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2l6ZVBhcmFtcy50aWxlU2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRUaWxlU2l6ZShlZGdlVHlwZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2l6ZVBhcmFtcy5kZWZhdWx0Q29tcG9uZW50UGFyYW1zLnNjYWxlWCA9IDE7XHJcbiAgICAgICAgc2l6ZVBhcmFtcy5kZWZhdWx0Q29tcG9uZW50UGFyYW1zLnNjYWxlWSA9IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaXplUGFyYW1zLnBhcmFtc1BlckNvbXBvbmVudC5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBzaXplUGFyYW1zLnBhcmFtc1BlckNvbXBvbmVudFtpXS5zY2FsZVggPSBwYXJhbXMuY29tcG9uZW50c1NjYWxlWFtpXTtcclxuICAgICAgICAgICAgc2l6ZVBhcmFtcy5wYXJhbXNQZXJDb21wb25lbnRbaV0uc2NhbGVZID0gcGFyYW1zLmNvbXBvbmVudHNTY2FsZVlbaV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlU3RydWN0dXJlID0ganBpcEZhY3RvcnkuY3JlYXRlVGlsZVN0cnVjdHVyZShzaXplUGFyYW1zLCBzZWxmLCBwcm9ncmVzc2lvbk9yZGVyKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGlsZVN0cnVjdHVyZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVQYXJhbXMoc2VsZikge1xyXG4gICAgICAgIGlmICghcGFyYW1zKSB7XHJcbiAgICAgICAgICAgIHBhcmFtcyA9IGpwaXBTdHJ1Y3R1cmVQYXJzZXIucGFyc2VDb2Rlc3RyZWFtU3RydWN0dXJlKCk7XHJcbiAgICAgICAgICAgIHNpemVzQ2FsY3VsYXRvciA9IGpwaXBGYWN0b3J5LmNyZWF0ZUxldmVsQ2FsY3VsYXRvcihwYXJhbXMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwQ29tcG9uZW50U3RydWN0dXJlKFxyXG4gICAgcGFyYW1zLCB0aWxlU3RydWN0dXJlKSB7XHJcbiAgICBcclxuICAgIHZhciB0aWxlV2lkdGhMZXZlbDA7XHJcbiAgICB2YXIgdGlsZUhlaWdodExldmVsMDtcclxuICAgIFxyXG4gICAgaW5pdGlhbGl6ZSgpO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENvbXBvbmVudFNjYWxlWCA9IGZ1bmN0aW9uIGdldENvbXBvbmVudFNjYWxlWCgpIHtcclxuICAgICAgICByZXR1cm4gcGFyYW1zLnNjYWxlWDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q29tcG9uZW50U2NhbGVZID0gZnVuY3Rpb24gZ2V0Q29tcG9uZW50U2NhbGVZKCkge1xyXG4gICAgICAgIHJldHVybiBwYXJhbXMuc2NhbGVZO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQcmVjaW5jdFdpZHRoID0gZnVuY3Rpb24ocmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIHdpZHRoID0gcGFyYW1zLnByZWNpbmN0V2lkdGhQZXJMZXZlbFtyZXNvbHV0aW9uTGV2ZWxdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB3aWR0aDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UHJlY2luY3RIZWlnaHQgPSBmdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpIHtcclxuICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyYW1zLnByZWNpbmN0SGVpZ2h0UGVyTGV2ZWxbcmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaGVpZ2h0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRNYXhDb2RlYmxvY2tXaWR0aCA9IGZ1bmN0aW9uIGdldE1heENvZGVibG9ja1dpZHRoKCkge1xyXG4gICAgICAgIHZhciB3aWR0aCA9IHBhcmFtcy5tYXhDb2RlYmxvY2tXaWR0aDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gd2lkdGg7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE1heENvZGVibG9ja0hlaWdodCA9IGZ1bmN0aW9uIGdldE1heENvZGVibG9ja0hlaWdodCgpIHtcclxuICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyYW1zLm1heENvZGVibG9ja0hlaWdodDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaGVpZ2h0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1Db2RlYmxvY2tzWEluUHJlY2luY3QgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldE51bUNvZGVibG9ja3NYKHByZWNpbmN0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvZGVibG9ja3NYID0gY2FsY3VsYXRlTnVtQ29kZWJsb2NrcyhcclxuICAgICAgICAgICAgcHJlY2luY3QsXHJcbiAgICAgICAgICAgIHByZWNpbmN0LnByZWNpbmN0WCxcclxuICAgICAgICAgICAgcGFyYW1zLm1heENvZGVibG9ja1dpZHRoLFxyXG4gICAgICAgICAgICBwYXJhbXMucHJlY2luY3RXaWR0aFBlckxldmVsLFxyXG4gICAgICAgICAgICB0aWxlV2lkdGhMZXZlbDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudW1Db2RlYmxvY2tzWDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtQ29kZWJsb2Nrc1lJblByZWNpbmN0ID1cclxuICAgICAgICBmdW5jdGlvbiBnZXROdW1Db2RlYmxvY2tzWShwcmVjaW5jdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1Db2RlYmxvY2tzWSA9IGNhbGN1bGF0ZU51bUNvZGVibG9ja3MoXHJcbiAgICAgICAgICAgIHByZWNpbmN0LFxyXG4gICAgICAgICAgICBwcmVjaW5jdC5wcmVjaW5jdFksXHJcbiAgICAgICAgICAgIHBhcmFtcy5tYXhDb2RlYmxvY2tIZWlnaHQsXHJcbiAgICAgICAgICAgIHBhcmFtcy5wcmVjaW5jdEhlaWdodFBlckxldmVsLFxyXG4gICAgICAgICAgICB0aWxlSGVpZ2h0TGV2ZWwwKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVtQ29kZWJsb2Nrc1k7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuZ2V0TnVtUHJlY2luY3RzWCA9IGZ1bmN0aW9uKHJlc29sdXRpb25MZXZlbCkge1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNYID0gY2FsY3VsYXRlTnVtUHJlY2luY3RzKFxyXG4gICAgICAgICAgICB0aWxlV2lkdGhMZXZlbDAsIHBhcmFtcy5wcmVjaW5jdFdpZHRoUGVyTGV2ZWwsIHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwcmVjaW5jdHNYO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1QcmVjaW5jdHNZID0gZnVuY3Rpb24ocmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1kgPSBjYWxjdWxhdGVOdW1QcmVjaW5jdHMoXHJcbiAgICAgICAgICAgIHRpbGVIZWlnaHRMZXZlbDAsIHBhcmFtcy5wcmVjaW5jdEhlaWdodFBlckxldmVsLCByZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gcHJlY2luY3RzWTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNhbGN1bGF0ZU51bVByZWNpbmN0cyhcclxuICAgICAgICB0aWxlU2l6ZUxldmVsMCwgcHJlY2luY3RTaXplUGVyTGV2ZWwsIHJlc29sdXRpb25MZXZlbCkge1xyXG4gICAgXHJcbiAgICAgICAgdmFyIHJlc29sdXRpb25GYWN0b3IgPSBnZXRSZXNvbHV0aW9uRmFjdG9yKHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgdmFyIHRpbGVTaXplSW5MZXZlbCA9IHRpbGVTaXplTGV2ZWwwIC8gcmVzb2x1dGlvbkZhY3RvcjtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RTaXplSW5MZXZlbCA9IHByZWNpbmN0U2l6ZVBlckxldmVsW3Jlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVByZWNpbmN0cyA9IE1hdGguY2VpbCh0aWxlU2l6ZUluTGV2ZWwgLyBwcmVjaW5jdFNpemVJbkxldmVsKTtcclxuICAgICAgICByZXR1cm4gbnVtUHJlY2luY3RzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjYWxjdWxhdGVOdW1Db2RlYmxvY2tzKFxyXG4gICAgICAgIHByZWNpbmN0LFxyXG4gICAgICAgIHByZWNpbmN0SW5kZXgsXHJcbiAgICAgICAgbWF4Q29kZWJsb2NrU2l6ZSxcclxuICAgICAgICBwcmVjaW5jdFNpemVQZXJMZXZlbCxcclxuICAgICAgICB0aWxlU2l6ZUxldmVsMCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXNvbHV0aW9uRmFjdG9yID0gZ2V0UmVzb2x1dGlvbkZhY3RvcihwcmVjaW5jdC5yZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIHZhciB0aWxlU2l6ZUluTGV2ZWwgPSBNYXRoLmNlaWwodGlsZVNpemVMZXZlbDAgLyByZXNvbHV0aW9uRmFjdG9yKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RCZWdpblBpeGVsID1cclxuICAgICAgICAgICAgcHJlY2luY3RJbmRleCAqIHByZWNpbmN0U2l6ZVBlckxldmVsW3ByZWNpbmN0LnJlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0U2l6ZSA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICBwcmVjaW5jdFNpemVQZXJMZXZlbFtwcmVjaW5jdC5yZXNvbHV0aW9uTGV2ZWxdLFxyXG4gICAgICAgICAgICB0aWxlU2l6ZUluTGV2ZWwgLSBwcmVjaW5jdEJlZ2luUGl4ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdWJiYW5kVHlwZUZhY3RvciA9IHByZWNpbmN0LnJlc29sdXRpb25MZXZlbCA9PT0gMCA/IDEgOiAyO1xyXG4gICAgICAgIHZhciBzdWJiYW5kT2ZQcmVjaW5jdFNpemUgPSBNYXRoLmNlaWwocHJlY2luY3RTaXplIC8gc3ViYmFuZFR5cGVGYWN0b3IpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1Db2RlYmxvY2tzID0gc3ViYmFuZFR5cGVGYWN0b3IgKiBNYXRoLmNlaWwoXHJcbiAgICAgICAgICAgIHN1YmJhbmRPZlByZWNpbmN0U2l6ZSAvIG1heENvZGVibG9ja1NpemUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcmVjaW5jdFNpemUgJSBtYXhDb2RlYmxvY2tTaXplID09PSAxICYmXHJcbiAgICAgICAgICAgIHByZWNpbmN0LnJlc29sdXRpb25MZXZlbCA+IDApIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC0tbnVtQ29kZWJsb2NrcztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bUNvZGVibG9ja3M7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFJlc29sdXRpb25GYWN0b3IocmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIGRpZmZlcmVuY2VGcm9tQmVzdExldmVsID0gcGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMgLSByZXNvbHV0aW9uTGV2ZWwgLSAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmYWN0b3IgPSAxIDw8IGRpZmZlcmVuY2VGcm9tQmVzdExldmVsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBmYWN0b3I7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGluaXRpYWxpemUoKSB7XHJcbiAgICAgICAgaWYgKHBhcmFtcy5zY2FsZVggIT09IDEgfHwgcGFyYW1zLnNjYWxlWSAhPT0gMSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnTm9uIDEgY29tcG9uZW50IHNjYWxlJywgJ0EuNS4xJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRpbGVXaWR0aExldmVsMCA9IE1hdGguZmxvb3IoXHJcbiAgICAgICAgICAgIHRpbGVTdHJ1Y3R1cmUuZ2V0VGlsZVdpZHRoKCkgLyBwYXJhbXMuc2NhbGVYKTtcclxuICAgICAgICB0aWxlSGVpZ2h0TGV2ZWwwID0gTWF0aC5mbG9vcihcclxuICAgICAgICAgICAgdGlsZVN0cnVjdHVyZS5nZXRUaWxlSGVpZ2h0KCkgLyBwYXJhbXMuc2NhbGVZKTtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEpwaXBSZXF1ZXN0UGFyYW1zTW9kaWZpZXI7XHJcblxyXG5mdW5jdGlvbiBKcGlwUmVxdWVzdFBhcmFtc01vZGlmaWVyKGNvZGVzdHJlYW1TdHJ1Y3R1cmUpIHtcclxuXHR0aGlzLm1vZGlmeSA9IGZ1bmN0aW9uIG1vZGlmeShjb2Rlc3RyZWFtUGFydFBhcmFtcywgb3B0aW9ucykge1xyXG5cdFx0dmFyIGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQgPSBjYXN0Q29kZXN0cmVhbVBhcnRQYXJhbXMoY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG5cclxuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG5cdFx0dmFyIHVzZUNhY2hlZERhdGFPbmx5ID0gb3B0aW9ucy51c2VDYWNoZWREYXRhT25seTtcclxuXHRcdHZhciBkaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzID0gb3B0aW9ucy5kaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzO1xyXG5cclxuXHRcdHZhciBwcm9ncmVzc2l2ZW5lc3NNb2RpZmllZDtcclxuXHRcdGlmIChvcHRpb25zLnByb2dyZXNzaXZlbmVzcyAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdGlmICh1c2VDYWNoZWREYXRhT25seSB8fCBkaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzKSB7XHJcblx0XHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG5cdFx0XHRcdFx0J29wdGlvbnMucHJvZ3Jlc3NpdmVuZXNzJyxcclxuXHRcdFx0XHRcdG9wdGlvbnMucHJvZ3Jlc3NpdmVuZXNzLFxyXG5cdFx0XHRcdFx0J29wdGlvbnMgY29udHJhZGljdGlvbjogY2Fubm90IGFjY2VwdCBib3RoIHByb2dyZXNzaXZlbmVzcycgK1xyXG5cdFx0XHRcdFx0J2FuZCB1c2VDYWNoZWREYXRhT25seS9kaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzIG9wdGlvbnMnKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRwcm9ncmVzc2l2ZW5lc3NNb2RpZmllZCA9IGNhc3RQcm9ncmVzc2l2ZW5lc3NQYXJhbXMoXHJcblx0XHRcdFx0b3B0aW9ucy5wcm9ncmVzc2l2ZW5lc3MsXHJcblx0XHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXNNb2RpZmllZC5xdWFsaXR5LFxyXG5cdFx0XHRcdCdxdWFsaXR5Jyk7XHJcblx0XHR9IGVsc2UgIGlmICh1c2VDYWNoZWREYXRhT25seSkge1xyXG5cdFx0XHRwcm9ncmVzc2l2ZW5lc3NNb2RpZmllZCA9IFsgeyBtaW5OdW1RdWFsaXR5TGF5ZXJzOiAwIH0gXTtcclxuXHRcdH0gZWxzZSBpZiAoZGlzYWJsZVByb2dyZXNzaXZlbmVzcykge1xyXG5cdFx0XHR2YXIgcXVhbGl0eSA9IGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQucXVhbGl0eTtcclxuXHRcdFx0dmFyIG1pbk51bVF1YWxpdHlMYXllcnMgPVxyXG5cdFx0XHRcdHF1YWxpdHkgPT09IHVuZGVmaW5lZCA/ICdtYXgnIDogcXVhbGl0eTtcclxuXHRcdFx0XHJcblx0XHRcdHByb2dyZXNzaXZlbmVzc01vZGlmaWVkID0gWyB7IG1pbk51bVF1YWxpdHlMYXllcnM6IG1pbk51bVF1YWxpdHlMYXllcnMgfSBdO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQgPSBnZXRBdXRvbWF0aWNQcm9ncmVzc2l2ZW5lc3NTdGFnZXMoXHJcblx0XHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXNNb2RpZmllZC5xdWFsaXR5KTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0cmV0dXJuIHtcclxuXHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXM6IGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQsXHJcblx0XHRcdHByb2dyZXNzaXZlbmVzczogcHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWRcclxuXHRcdH07XHJcblx0fTtcclxuXHJcblx0ZnVuY3Rpb24gY2FzdFByb2dyZXNzaXZlbmVzc1BhcmFtcyhwcm9ncmVzc2l2ZW5lc3MsIHF1YWxpdHksIHByb3BlcnR5TmFtZSkge1xyXG5cdFx0Ly8gRW5zdXJlIHRoYW4gbWluTnVtUXVhbGl0eUxheWVycyBpcyBnaXZlbiBmb3IgYWxsIGl0ZW1zXHJcblx0XHRcclxuXHRcdHZhciByZXN1bHQgPSBuZXcgQXJyYXkocHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCk7XHJcblxyXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBwcm9ncmVzc2l2ZW5lc3MubGVuZ3RoOyArK2kpIHtcclxuXHRcdFx0dmFyIG1pbk51bVF1YWxpdHlMYXllcnMgPSBwcm9ncmVzc2l2ZW5lc3NbaV0ubWluTnVtUXVhbGl0eUxheWVycztcclxuXHRcdFx0XHJcblx0XHRcdGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzICE9PSAnbWF4Jykge1xyXG5cdFx0XHRcdGlmIChxdWFsaXR5ICE9PSB1bmRlZmluZWQgJiZcclxuXHRcdFx0XHRcdG1pbk51bVF1YWxpdHlMYXllcnMgPiBxdWFsaXR5KSB7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbihcclxuXHRcdFx0XHRcdFx0J3Byb2dyZXNzaXZlbmVzc1snICsgaSArICddLm1pbk51bVF1YWxpdHlMYXllcnMnLFxyXG5cdFx0XHRcdFx0XHRtaW5OdW1RdWFsaXR5TGF5ZXJzLFxyXG5cdFx0XHRcdFx0XHQnbWluTnVtUXVhbGl0eUxheWVycyBpcyBiaWdnZXIgdGhhbiAnICtcclxuXHRcdFx0XHRcdFx0XHQnZmV0Y2hQYXJhbXMucXVhbGl0eScpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRcclxuXHRcdFx0XHRtaW5OdW1RdWFsaXR5TGF5ZXJzID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcblx0XHRcdFx0XHRtaW5OdW1RdWFsaXR5TGF5ZXJzLFxyXG5cdFx0XHRcdFx0cHJvcGVydHlOYW1lLFxyXG5cdFx0XHRcdFx0J3Byb2dyZXNzaXZlbmVzc1snICsgaSArICddLm1pbk51bVF1YWxpdHlMYXllcnMnKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0cmVzdWx0W2ldID0geyBtaW5OdW1RdWFsaXR5TGF5ZXJzOiBtaW5OdW1RdWFsaXR5TGF5ZXJzIH07XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdHJldHVybiByZXN1bHQ7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBnZXRBdXRvbWF0aWNQcm9ncmVzc2l2ZW5lc3NTdGFnZXMocXVhbGl0eSkge1xyXG5cdFx0Ly8gQ3JlYXRlIHByb2dyZXNzaXZlbmVzcyBvZiAoMSwgMiwgMywgKCNtYXgtcXVhbGl0eS8yKSwgKCNtYXgtcXVhbGl0eSkpXHJcblxyXG5cdFx0dmFyIHByb2dyZXNzaXZlbmVzcyA9IFtdO1xyXG5cclxuXHRcdC8vIE5vIHByb2dyZXNzaXZlbmVzcywgd2FpdCBmb3IgYWxsIHF1YWxpdHkgbGF5ZXJzIHRvIGJlIGZldGNoZWRcclxuXHRcdHZhciB0aWxlU3RydWN0dXJlID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXREZWZhdWx0VGlsZVN0cnVjdHVyZSgpO1xyXG5cdFx0dmFyIG51bVF1YWxpdHlMYXllcnNOdW1lcmljID0gdGlsZVN0cnVjdHVyZS5nZXROdW1RdWFsaXR5TGF5ZXJzKCk7XHJcblx0XHR2YXIgcXVhbGl0eU51bWVyaWNPck1heCA9ICdtYXgnO1xyXG5cdFx0XHJcblx0XHRpZiAocXVhbGl0eSAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdG51bVF1YWxpdHlMYXllcnNOdW1lcmljID0gTWF0aC5taW4oXHJcblx0XHRcdFx0bnVtUXVhbGl0eUxheWVyc051bWVyaWMsIHF1YWxpdHkpO1xyXG5cdFx0XHRxdWFsaXR5TnVtZXJpY09yTWF4ID0gbnVtUXVhbGl0eUxheWVyc051bWVyaWM7XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdHZhciBmaXJzdFF1YWxpdHlMYXllcnNDb3VudCA9IG51bVF1YWxpdHlMYXllcnNOdW1lcmljIDwgNCA/XHJcblx0XHRcdG51bVF1YWxpdHlMYXllcnNOdW1lcmljIC0gMTogMztcclxuXHRcdFxyXG5cdFx0Zm9yICh2YXIgaSA9IDE7IGkgPCBmaXJzdFF1YWxpdHlMYXllcnNDb3VudDsgKytpKSB7XHJcblx0XHRcdHByb2dyZXNzaXZlbmVzcy5wdXNoKHsgbWluTnVtUXVhbGl0eUxheWVyczogaSB9KTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0dmFyIG1pZGRsZVF1YWxpdHkgPSBNYXRoLnJvdW5kKG51bVF1YWxpdHlMYXllcnNOdW1lcmljIC8gMik7XHJcblx0XHRpZiAobWlkZGxlUXVhbGl0eSA+IGZpcnN0UXVhbGl0eUxheWVyc0NvdW50KSB7XHJcblx0XHRcdHByb2dyZXNzaXZlbmVzcy5wdXNoKHsgbWluTnVtUXVhbGl0eUxheWVyczogbWlkZGxlUXVhbGl0eSB9KTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0cHJvZ3Jlc3NpdmVuZXNzLnB1c2goe1xyXG5cdFx0XHRtaW5OdW1RdWFsaXR5TGF5ZXJzOiBxdWFsaXR5TnVtZXJpY09yTWF4XHJcblx0XHRcdH0pO1xyXG5cdFx0XHJcblx0XHRyZXR1cm4gcHJvZ3Jlc3NpdmVuZXNzO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gY2FzdENvZGVzdHJlYW1QYXJ0UGFyYW1zKGNvZGVzdHJlYW1QYXJ0UGFyYW1zKSB7XHJcblx0XHR2YXIgbGV2ZWwgPSB2YWxpZGF0ZU51bWVyaWNQYXJhbShcclxuXHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXMubGV2ZWwsXHJcblx0XHRcdCdsZXZlbCcsXHJcblx0XHRcdC8qZGVmYXVsdFZhbHVlPSovdW5kZWZpbmVkLFxyXG5cdFx0XHQvKmFsbG93VW5kZWZpZW5kPSovdHJ1ZSk7XHJcblxyXG5cdFx0dmFyIHF1YWxpdHkgPSB2YWxpZGF0ZU51bWVyaWNQYXJhbShcclxuXHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXMucXVhbGl0eSxcclxuXHRcdFx0J3F1YWxpdHknLFxyXG5cdFx0XHQvKmRlZmF1bHRWYWx1ZT0qL3VuZGVmaW5lZCxcclxuXHRcdFx0LyphbGxvd1VuZGVmaWVuZD0qL3RydWUpO1xyXG5cdFx0XHJcblx0XHR2YXIgbWluWCA9IHZhbGlkYXRlTnVtZXJpY1BhcmFtKGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblgsICdtaW5YJyk7XHJcblx0XHR2YXIgbWluWSA9IHZhbGlkYXRlTnVtZXJpY1BhcmFtKGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblksICdtaW5ZJyk7XHJcblx0XHRcclxuXHRcdHZhciBtYXhYID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcblx0XHRcdGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUsICdtYXhYRXhjbHVzaXZlJyk7XHJcblx0XHRcclxuXHRcdHZhciBtYXhZID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcblx0XHRcdGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFlFeGNsdXNpdmUsICdtYXhZRXhjbHVzaXZlJyk7XHJcblx0XHRcclxuXHRcdHZhciBsZXZlbFdpZHRoID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRMZXZlbFdpZHRoKGxldmVsKTtcclxuXHRcdHZhciBsZXZlbEhlaWdodCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxIZWlnaHQobGV2ZWwpO1xyXG5cdFx0XHJcblx0XHRpZiAobWluWCA8IDAgfHwgbWF4WCA+IGxldmVsV2lkdGggfHxcclxuXHRcdFx0bWluWSA8IDAgfHwgbWF4WSA+IGxldmVsSGVpZ2h0IHx8XHJcblx0XHRcdG1pblggPj0gbWF4WCB8fCBtaW5ZID49IG1heFkpIHtcclxuXHRcdFx0XHJcblx0XHRcdHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbihcclxuXHRcdFx0XHQnY29kZXN0cmVhbVBhcnRQYXJhbXMnLCBjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdHZhciByZXN1bHQgPSB7XHJcblx0XHRcdG1pblg6IG1pblgsXHJcblx0XHRcdG1pblk6IG1pblksXHJcblx0XHRcdG1heFhFeGNsdXNpdmU6IG1heFgsXHJcblx0XHRcdG1heFlFeGNsdXNpdmU6IG1heFksXHJcblx0XHRcdFxyXG5cdFx0XHRsZXZlbDogbGV2ZWwsXHJcblx0XHRcdHF1YWxpdHk6IHF1YWxpdHlcclxuXHRcdFx0fTtcclxuXHRcdFxyXG5cdFx0cmV0dXJuIHJlc3VsdDtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIHZhbGlkYXRlTnVtZXJpY1BhcmFtKFxyXG5cdFx0aW5wdXRWYWx1ZSwgcHJvcGVydHlOYW1lLCBkZWZhdWx0VmFsdWUsIGFsbG93VW5kZWZpbmVkKSB7XHJcblx0XHRcclxuXHRcdGlmIChpbnB1dFZhbHVlID09PSB1bmRlZmluZWQgJiZcclxuXHRcdFx0KGRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkIHx8IGFsbG93VW5kZWZpbmVkKSkge1xyXG5cdFx0XHRcclxuXHRcdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0dmFyIHJlc3VsdCA9ICtpbnB1dFZhbHVlO1xyXG5cdFx0aWYgKGlzTmFOKHJlc3VsdCkgfHwgcmVzdWx0ICE9PSBNYXRoLmZsb29yKHJlc3VsdCkpIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG5cdFx0XHRcdHByb3BlcnR5TmFtZSwgaW5wdXRWYWx1ZSk7XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdHJldHVybiByZXN1bHQ7XHJcblx0fVxyXG59IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwVGlsZVN0cnVjdHVyZShcclxuICAgIHNpemVQYXJhbXMsXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAganBpcEZhY3RvcnksXHJcbiAgICBwcm9ncmVzc2lvbk9yZGVyXHJcbiAgICApIHtcclxuICAgIFxyXG4gICAgdmFyIGRlZmF1bHRDb21wb25lbnRTdHJ1Y3R1cmU7XHJcbiAgICB2YXIgY29tcG9uZW50U3RydWN0dXJlcztcclxuICAgIHZhciBjb21wb25lbnRUb0luQ2xhc3NMZXZlbFN0YXJ0SW5kZXg7XHJcbiAgICB2YXIgbWluTnVtUmVzb2x1dGlvbkxldmVscztcclxuXHJcbiAgICB0aGlzLmdldFByb2dyZXNzaW9uT3JkZXIgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gcHJvZ3Jlc3Npb25PcmRlcjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZSA9IGZ1bmN0aW9uIGdldERlZmF1bHRDb21wb25lbnRTdHJ1Y3R1cmUoY29tcG9uZW50KSB7XHJcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRDb21wb25lbnRTdHJ1Y3R1cmU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENvbXBvbmVudFN0cnVjdHVyZSA9IGZ1bmN0aW9uIGdldENvbXBvbmVudFN0cnVjdHVyZShjb21wb25lbnQpIHtcclxuICAgICAgICByZXR1cm4gY29tcG9uZW50U3RydWN0dXJlc1tjb21wb25lbnRdO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlV2lkdGggPSBmdW5jdGlvbiBnZXRUaWxlV2lkdGhDbG9zdXJlKCkge1xyXG4gICAgICAgIHJldHVybiBzaXplUGFyYW1zLnRpbGVTaXplWzBdO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlSGVpZ2h0ID0gZnVuY3Rpb24gZ2V0VGlsZUhlaWdodENsb3N1cmUoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpemVQYXJhbXMudGlsZVNpemVbMV07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE51bVF1YWxpdHlMYXllcnMgPSBmdW5jdGlvbiBnZXROdW1RdWFsaXR5TGF5ZXJzKCkge1xyXG4gICAgICAgIHJldHVybiBzaXplUGFyYW1zLm51bVF1YWxpdHlMYXllcnM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzUGFja2V0SGVhZGVyTmVhckRhdGEgPSBmdW5jdGlvbiBnZXRJc1BhY2tldEhlYWRlck5lYXJEYXRhKCkge1xyXG4gICAgICAgIHJldHVybiBzaXplUGFyYW1zLmlzUGFja2V0SGVhZGVyc05lYXJEYXRhO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkID0gZnVuY3Rpb24gZ2V0SXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZCgpIHtcclxuICAgICAgICByZXR1cm4gc2l6ZVBhcmFtcy5pc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldElzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCgpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gc2l6ZVBhcmFtcy5pc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnByZWNpbmN0SW5DbGFzc0luZGV4VG9Qb3NpdGlvbiA9IGZ1bmN0aW9uKGluQ2xhc3NJbmRleCkge1xyXG4gICAgICAgIC8vIEEuMy4yXHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGluQ2xhc3NJbmRleCA8IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ2luQ2xhc3NJbmRleCcsXHJcbiAgICAgICAgICAgICAgICBpbkNsYXNzSW5kZXgsXHJcbiAgICAgICAgICAgICAgICAnSW52YWxpZCBuZWdhdGl2ZSBpbi1jbGFzcyBpbmRleCBvZiBwcmVjaW5jdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtVGlsZXMgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWCgpICogY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1UaWxlc1koKTtcclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50cyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG5cclxuICAgICAgICB2YXIgdGlsZUluZGV4ID0gaW5DbGFzc0luZGV4ICUgbnVtVGlsZXM7XHJcbiAgICAgICAgdmFyIGluQ2xhc3NJbmRleFdpdGhvdXRUaWxlID0gKGluQ2xhc3NJbmRleCAtIHRpbGVJbmRleCkgLyBudW1UaWxlcztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29tcG9uZW50ID0gaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgJSBudW1Db21wb25lbnRzO1xyXG4gICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSBjb21wb25lbnRTdHJ1Y3R1cmVzW2NvbXBvbmVudF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHMgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUmVzb2x1dGlvbkxldmVscygpO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdEluZGV4ID0gKGluQ2xhc3NJbmRleFdpdGhvdXRUaWxlIC0gY29tcG9uZW50KSAvIG51bUNvbXBvbmVudHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc29sdXRpb25MZXZlbDtcclxuICAgICAgICB2YXIgbGV2ZWxTdGFydEluZGV4ID0gMDtcclxuICAgICAgICBmb3IgKHJlc29sdXRpb25MZXZlbCA9IDE7IHJlc29sdXRpb25MZXZlbCA8IG51bVJlc29sdXRpb25MZXZlbHM7ICsrcmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgICAgIHZhciBuZXh0TGV2ZWxTdGFydEluZGV4ID1cclxuICAgICAgICAgICAgICAgIGNvbXBvbmVudFRvSW5DbGFzc0xldmVsU3RhcnRJbmRleFtjb21wb25lbnRdW3Jlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobmV4dExldmVsU3RhcnRJbmRleCA+IHByZWNpbmN0SW5kZXgpIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXZlbFN0YXJ0SW5kZXggPSBuZXh0TGV2ZWxTdGFydEluZGV4O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAtLXJlc29sdXRpb25MZXZlbDtcclxuICAgICAgICB2YXIgcHJlY2luY3RJbmRleEluTGV2ZWwgPSBwcmVjaW5jdEluZGV4IC0gbGV2ZWxTdGFydEluZGV4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdHNYID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1gocmVzb2x1dGlvbkxldmVsKTtcclxuICAgICAgICB2YXIgcHJlY2luY3RzWSA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNZKHJlc29sdXRpb25MZXZlbCk7XHJcblxyXG4gICAgICAgIHZhciBwcmVjaW5jdFggPSBwcmVjaW5jdEluZGV4SW5MZXZlbCAlIHByZWNpbmN0c1g7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0WSA9IChwcmVjaW5jdEluZGV4SW5MZXZlbCAtIHByZWNpbmN0WCkgLyBwcmVjaW5jdHNYO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcmVjaW5jdFkgPj0gcHJlY2luY3RzWSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnaW5DbGFzc0luZGV4JyxcclxuICAgICAgICAgICAgICAgIGluQ2xhc3NJbmRleCxcclxuICAgICAgICAgICAgICAgICdJbnZhbGlkIGluLWNsYXNzIGluZGV4IG9mIHByZWNpbmN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIHRpbGVJbmRleDogdGlsZUluZGV4LFxyXG4gICAgICAgICAgICBjb21wb25lbnQ6IGNvbXBvbmVudCxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHByZWNpbmN0WDogcHJlY2luY3RYLFxyXG4gICAgICAgICAgICBwcmVjaW5jdFk6IHByZWNpbmN0WSxcclxuICAgICAgICAgICAgcmVzb2x1dGlvbkxldmVsOiByZXNvbHV0aW9uTGV2ZWxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5wcmVjaW5jdFBvc2l0aW9uVG9JbkNsYXNzSW5kZXggPSBmdW5jdGlvbihwcmVjaW5jdFBvc2l0aW9uKSB7XHJcbiAgICAgICAgLy8gQS4zLjJcclxuXHJcbiAgICAgICAgdmFyIG51bUNvbXBvbmVudHMgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bUNvbXBvbmVudHMoKTtcclxuICAgICAgICB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZShcclxuICAgICAgICAgICAgJ3ByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50JywgcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnQsIG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSBjb21wb25lbnRTdHJ1Y3R1cmVzW3ByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50XTtcclxuXHJcbiAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHMgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUmVzb2x1dGlvbkxldmVscygpO1xyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKFxyXG4gICAgICAgICAgICAncHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWwnLCBwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCwgbnVtUmVzb2x1dGlvbkxldmVscyk7XHJcblxyXG4gICAgICAgIHZhciBudW1UaWxlcyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNYKCkgKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNYID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1gocHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNZID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1kocHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKFxyXG4gICAgICAgICAgICAncHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFgnLCBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCwgcHJlY2luY3RzWCk7XHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoXHJcbiAgICAgICAgICAgICdwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WScsIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RZLCBwcmVjaW5jdHNZKTtcclxuICAgICAgICB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZShcclxuICAgICAgICAgICAgJ3ByZWNpbmN0UG9zaXRpb24udGlsZUluZGV4JywgcHJlY2luY3RQb3NpdGlvbi50aWxlSW5kZXgsIG51bVRpbGVzKTtcclxuXHJcbiAgICAgICAgdmFyIHByZWNpbmN0SW5kZXhJbkxldmVsID0gcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFggKyBcclxuICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFkgKiBwcmVjaW5jdHNYO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZXZlbFN0YXJ0SW5kZXggPSBjb21wb25lbnRUb0luQ2xhc3NMZXZlbFN0YXJ0SW5kZXhbcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnRdW3ByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RJbmRleCA9IHByZWNpbmN0SW5kZXhJbkxldmVsICsgbGV2ZWxTdGFydEluZGV4O1xyXG5cclxuICAgICAgICB2YXIgaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgPVxyXG4gICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudCArIHByZWNpbmN0SW5kZXggKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bUNvbXBvbmVudHMoKTtcclxuXHJcbiAgICAgICAgdmFyIGluQ2xhc3NJbmRleCA9IHByZWNpbmN0UG9zaXRpb24udGlsZUluZGV4ICsgXHJcbiAgICAgICAgICAgIGluQ2xhc3NJbmRleFdpdGhvdXRUaWxlICogY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1UaWxlc1goKSAqIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGluQ2xhc3NJbmRleDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UHJlY2luY3RJdGVyYXRvciA9IGZ1bmN0aW9uIGdldFByZWNpbmN0SXRlcmF0b3IoXHJcbiAgICAgICAgdGlsZUluZGV4LCBjb2Rlc3RyZWFtUGFydFBhcmFtcywgaXNJdGVyYXRlUHJlY2luY3RzTm90SW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZXZlbCA9IDA7XHJcbiAgICAgICAgaWYgKGNvZGVzdHJlYW1QYXJ0UGFyYW1zICE9PSB1bmRlZmluZWQgJiZcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubGV2ZWwgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbGV2ZWwgPSBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtaW5OdW1SZXNvbHV0aW9uTGV2ZWxzIDw9IGxldmVsKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ2Fubm90IGFkdmFuY2UgcmVzb2x1dGlvbjogbGV2ZWw9JyArXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubGV2ZWwgKyAnIGJ1dCBzaG91bGQgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2JlIHNtYWxsZXIgdGhhbiAnICsgbWluTnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBwcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQgPVxyXG4gICAgICAgICAgICBnZXRQcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQoXHJcbiAgICAgICAgICAgICAgICB0aWxlSW5kZXgsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFggPSAwO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdFkgPSAwO1xyXG4gICAgICAgIGlmICghaXNJdGVyYXRlUHJlY2luY3RzTm90SW5Db2Rlc3RyZWFtUGFydCAmJlxyXG4gICAgICAgICAgICBwcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBmaXJzdFByZWNpbmN0c1JhbmdlID1cclxuICAgICAgICAgICAgICAgIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudFswXVswXTtcclxuICAgICAgICAgICAgcHJlY2luY3RYID0gZmlyc3RQcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFg7XHJcbiAgICAgICAgICAgIHByZWNpbmN0WSA9IGZpcnN0UHJlY2luY3RzUmFuZ2UubWluUHJlY2luY3RZO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBBLjYuMSBpbiBwYXJ0IDE6IENvcmUgQ29kaW5nIFN5c3RlbVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzZXRhYmxlSXRlcmF0b3IgPSB7XHJcbiAgICAgICAgICAgIGNvbXBvbmVudDogMCxcclxuICAgICAgICAgICAgcHJlY2luY3RYOiBwcmVjaW5jdFgsXHJcbiAgICAgICAgICAgIHByZWNpbmN0WTogcHJlY2luY3RZLFxyXG4gICAgICAgICAgICByZXNvbHV0aW9uTGV2ZWw6IDAsXHJcbiAgICAgICAgICAgIGlzSW5Db2Rlc3RyZWFtUGFydDogdHJ1ZVxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSB7XHJcbiAgICAgICAgICAgIGdldCB0aWxlSW5kZXgoKSB7IHJldHVybiB0aWxlSW5kZXg7IH0sXHJcbiAgICAgICAgICAgIGdldCBjb21wb25lbnQoKSB7IHJldHVybiBzZXRhYmxlSXRlcmF0b3IuY29tcG9uZW50OyB9LFxyXG4gICAgICAgICAgICBnZXQgcHJlY2luY3RJbmRleEluQ29tcG9uZW50UmVzb2x1dGlvbigpIHtcclxuICAgICAgICAgICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSBjb21wb25lbnRTdHJ1Y3R1cmVzW3NldGFibGVJdGVyYXRvci5jb21wb25lbnRdO1xyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChcclxuICAgICAgICAgICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucmVzb2x1dGlvbkxldmVsKTtcclxuICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdEluZGV4SW5Db21wb25lbnRSZXNvbHV0aW9uID1cclxuICAgICAgICAgICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RYICsgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WSAqIHByZWNpbmN0c1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0SW5kZXhJbkNvbXBvbmVudFJlc29sdXRpb247XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgZ2V0IHByZWNpbmN0WCgpIHsgcmV0dXJuIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFg7IH0sXHJcbiAgICAgICAgICAgIGdldCBwcmVjaW5jdFkoKSB7IHJldHVybiBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RZOyB9LFxyXG4gICAgICAgICAgICBnZXQgcmVzb2x1dGlvbkxldmVsKCkgeyByZXR1cm4gc2V0YWJsZUl0ZXJhdG9yLnJlc29sdXRpb25MZXZlbDsgfSxcclxuICAgICAgICAgICAgZ2V0IGlzSW5Db2Rlc3RyZWFtUGFydCgpIHsgcmV0dXJuIHNldGFibGVJdGVyYXRvci5pc0luQ29kZXN0cmVhbVBhcnQ7IH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBpdGVyYXRvci50cnlBZHZhbmNlID0gZnVuY3Rpb24gdHJ5QWR2YW5jZSgpIHtcclxuICAgICAgICAgICAgdmFyIGlzU3VjY2VlZGVkID0gdHJ5QWR2YW5jZVByZWNpbmN0SXRlcmF0b3IoXHJcbiAgICAgICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IsXHJcbiAgICAgICAgICAgICAgICBsZXZlbCxcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCxcclxuICAgICAgICAgICAgICAgIGlzSXRlcmF0ZVByZWNpbmN0c05vdEluQ29kZXN0cmVhbVBhcnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIGlzU3VjY2VlZGVkO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGl0ZXJhdG9yO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UocGFyYW1OYW1lLCBwYXJhbVZhbHVlLCBzdXByaW11bVBhcmFtVmFsdWUpIHtcclxuICAgICAgICBpZiAocGFyYW1WYWx1ZSA8IDAgfHwgcGFyYW1WYWx1ZSA+PSBzdXByaW11bVBhcmFtVmFsdWUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgcGFyYW1OYW1lLFxyXG4gICAgICAgICAgICAgICAgcGFyYW1WYWx1ZSxcclxuICAgICAgICAgICAgICAgIHBhcmFtTmFtZSArICcgaXMgZXhwZWN0ZWQgdG8gYmUgYmV0d2VlbiAwIGFuZCAnICsgc3VwcmltdW1QYXJhbVZhbHVlIC0gMSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB2YWxpZGF0ZVRhcmdldFByb2dyZXNzaW9uT3JkZXIocHJvZ3Jlc3Npb25PcmRlcikge1xyXG4gICAgICAgIGlmIChwcm9ncmVzc2lvbk9yZGVyLmxlbmd0aCAhPT0gNCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbignSWxsZWdhbCBwcm9ncmVzc2lvbiBvcmRlciAnICsgcHJvZ3Jlc3Npb25PcmRlciArICc6IHVuZXhwZWN0ZWQgbGVuZ3RoJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcm9ncmVzc2lvbk9yZGVyWzNdICE9PSAnTCcpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdJbGxlZ2FsIHRhcmdldCBwcm9ncmVzc2lvbiBvcmRlciBvZiAnICsgcHJvZ3Jlc3Npb25PcmRlciwgJ0EuMy4yLjEnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhhc1AgPSBwcm9ncmVzc2lvbk9yZGVyLmluZGV4T2YoJ1AnKSA+PSAwO1xyXG4gICAgICAgIHZhciBoYXNDID0gcHJvZ3Jlc3Npb25PcmRlci5pbmRleE9mKCdDJykgPj0gMDtcclxuICAgICAgICB2YXIgaGFzUiA9IHByb2dyZXNzaW9uT3JkZXIuaW5kZXhPZignUicpID49IDA7XHJcbiAgICAgICAgaWYgKCFoYXNQIHx8ICFoYXNDIHx8ICFoYXNSKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdJbGxlZ2FsIHByb2dyZXNzaW9uIG9yZGVyICcgKyBwcm9ncmVzc2lvbk9yZGVyICsgJzogbWlzc2luZyBsZXR0ZXInKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByb2dyZXNzaW9uT3JkZXIgIT09ICdSUENMJykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oJ1Byb2dyZXNzaW9uIG9yZGVyIG9mICcgKyBwcm9ncmVzc2lvbk9yZGVyLCAnQS42LjEnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHByZXByb2Nlc3NQYXJhbXMoKSB7XHJcbiAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4ID0gbmV3IEFycmF5KGNvbXBvbmVudHMpO1xyXG5cclxuICAgICAgICB2YXIgY29tcG9uZW50cyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkZWZhdWx0Q29tcG9uZW50ID0gc2l6ZVBhcmFtcy5kZWZhdWx0Q29tcG9uZW50UGFyYW1zO1xyXG4gICAgICAgIG1pbk51bVJlc29sdXRpb25MZXZlbHMgPSBkZWZhdWx0Q29tcG9uZW50Lm51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICAgICAgdmFyIGlzQ29tcG9uZW50c0lkZW50aWNhbFNpemUgPSB0cnVlO1xyXG4gICAgICAgIHZhciBpc1ByZWNpbmN0UGFydGl0aW9uRml0c1RvVGlsZVBhcnRpdGlvbiA9IHRydWU7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGMgPSAwOyBjIDwgY29tcG9uZW50czsgKytjKSB7XHJcbiAgICAgICAgICAgIHZhciBzaXplID0gc2l6ZVBhcmFtcy5wYXJhbXNQZXJDb21wb25lbnRbY107XHJcbiAgICAgICAgICAgIG1pbk51bVJlc29sdXRpb25MZXZlbHMgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgIG1pbk51bVJlc29sdXRpb25MZXZlbHMsIHNpemUubnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4W2NdID0gbmV3IEFycmF5KHNpemUubnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSBjb21wb25lbnRTdHJ1Y3R1cmVzW2NdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGFjY3VtdWxhdGVkT2Zmc2V0ID0gMDtcclxuICAgICAgICAgICAgdmFyIGZpcnN0TGV2ZWxQcmVjaW5jdHNYID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1goYyk7XHJcbiAgICAgICAgICAgIHZhciBmaXJzdExldmVsUHJlY2luY3RzWSA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNZKGMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCBzaXplLm51bVJlc29sdXRpb25MZXZlbHM7ICsrcikge1xyXG4gICAgICAgICAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4W2NdW3JdID0gYWNjdW11bGF0ZWRPZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RzWEluTGV2ZWwgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChyKTtcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdHNZSW5MZXZlbCA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNZKHIpO1xyXG4gICAgICAgICAgICAgICAgYWNjdW11bGF0ZWRPZmZzZXQgKz0gcHJlY2luY3RzWEluTGV2ZWwgKiBwcmVjaW5jdHNZSW5MZXZlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoZGVmYXVsdENvbXBvbmVudC5wcmVjaW5jdFdpZHRoUGVyTGV2ZWxbcl0gIT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemUucHJlY2luY3RXaWR0aFBlckxldmVsW3JdIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdENvbXBvbmVudC5wcmVjaW5jdEhlaWdodFBlckxldmVsW3JdICE9PVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplLnByZWNpbmN0SGVpZ2h0UGVyTGV2ZWxbcl0pIHtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBpc0NvbXBvbmVudHNJZGVudGljYWxTaXplID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBpc0hvcml6b250YWxQYXJ0aXRpb25TdXBwb3J0ZWQgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrSWZQcmVjaW5jdFBhcnRpdGlvblN0YXJ0c0luVGlsZVRvcExlZnQoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemUubnVtUmVzb2x1dGlvbkxldmVscyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldFByZWNpbmN0V2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxXaWR0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlV2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBpc1ZlcnRpY2FsUGFydGl0aW9uU3VwcG9ydGVkID1cclxuICAgICAgICAgICAgICAgICAgICBjaGVja0lmUHJlY2luY3RQYXJ0aXRpb25TdGFydHNJblRpbGVUb3BMZWZ0KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzaXplLm51bVJlc29sdXRpb25MZXZlbHMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZS5nZXRQcmVjaW5jdFdpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldExldmVsV2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVdpZHRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpc1ByZWNpbmN0UGFydGl0aW9uRml0c1RvVGlsZVBhcnRpdGlvbiAmPVxyXG4gICAgICAgICAgICAgICAgICAgIGlzSG9yaXpvbnRhbFBhcnRpdGlvblN1cHBvcnRlZCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIGlzVmVydGljYWxQYXJ0aXRpb25TdXBwb3J0ZWQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghaXNDb21wb25lbnRzSWRlbnRpY2FsU2l6ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnU3BlY2lhbCBDb2RpbmcgU3R5bGUgZm9yIENvbXBvbmVudCAoQ09DKScsICdBLjYuMicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdQcmVjaW5jdCBUb3BMZWZ0IHdoaWNoIGlzIG5vdCBtYXRjaGVkIHRvIHRpbGUgVG9wTGVmdCcsICdCLjYnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNoZWNrSWZQcmVjaW5jdFBhcnRpdGlvblN0YXJ0c0luVGlsZVRvcExlZnQoXHJcbiAgICAgICAgcmVzb2x1dGlvbkxldmVsLFxyXG4gICAgICAgIG51bVJlc29sdXRpb25MZXZlbHMsXHJcbiAgICAgICAgZ2V0UHJlY2luY3RTaXplRnVuY3Rpb24sXHJcbiAgICAgICAgZ2V0TGV2ZWxTaXplRnVuY3Rpb24sXHJcbiAgICAgICAgZ2V0VGlsZVNpemVGdW5jdGlvbikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEpwZWcyMDAwIHN0YW5kYXJkIGFsbG93cyBwYXJ0aXRpb24gb2YgdGlsZXMgd2hpY2ggZG9lcyBub3QgZml0XHJcbiAgICAgICAgLy8gZXhhY3RseSB0aGUgcHJlY2luY3RzIHBhcnRpdGlvbiAoaS5lLiB0aGUgZmlyc3QgcHJlY2luY3RzIFwidmlydHVhbGx5XCJcclxuICAgICAgICAvLyBzdGFydHMgYmVmb3JlIHRoZSB0aWxlLCB0aHVzIGlzIHNtYWxsZXIgdGhhbiBvdGhlcikuXHJcbiAgICAgICAgLy8gVGhpcyBpcyBub3Qgc3VwcG9ydGVkIG5vdyBpbiB0aGUgY29kZSwgdGhpcyBmdW5jdGlvbiBzaG91bGQgY2hlY2tcclxuICAgICAgICAvLyB0aGF0IHRoaXMgaXMgbm90IHRoZSBzaXR1YXRpb24uXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGZ1bmN0aW9uIGFzc3VtZXMgdGhhdCBmaXJzdFRpbGVPZmZzZXQgaXMgemVybyBhbmQgY29tcG9uZW50U2NhbGVcclxuICAgICAgICAvLyBpcyBvbmUgKFVuc3VwcG9ydGVkRXhjZXB0aW9ucyBhcmUgdGhyb3duIGluIENvbXBvbmVudFN0cnVjdHVyZSBhbmRcclxuICAgICAgICAvLyBDb2Rlc3RyZWFtU3RydWN0dXJlIGNsYXNzZXMpLlxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFNpemUgPSBnZXRQcmVjaW5jdFNpemVGdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIHZhciBsZXZlbFNpemUgPSBnZXRMZXZlbFNpemVGdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcmVjaW5jdFNpemUgPiBsZXZlbFNpemUpIHtcclxuICAgICAgICAgICAgLy8gUHJlY2luY3QgaXMgbGFyZ2VyIHRoYW4gaW1hZ2UgdGh1cyBhbnl3YXkgdGlsZSBoYXMgYSBzaW5nbGVcclxuICAgICAgICAgICAgLy8gcHJlY2luY3RcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVNpemUgPSBnZXRUaWxlU2l6ZUZ1bmN0aW9uKHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uID1cclxuICAgICAgICAgICAgcHJlY2luY3RTaXplICUgdGlsZVNpemUgPT09IDAgfHxcclxuICAgICAgICAgICAgdGlsZVNpemUgJSBwcmVjaW5jdFNpemUgPT09IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRQcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQoXHJcbiAgICAgICAgdGlsZUluZGV4LCBjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2Rlc3RyZWFtUGFydFBhcmFtcyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29tcG9uZW50cyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG4gICAgICAgIHZhciBwZXJDb21wb25lbnRSZXN1bHQgPSBuZXcgQXJyYXkoY29tcG9uZW50cyk7XHJcbiAgICAgICAgdmFyIG1pbkxldmVsID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubGV2ZWwgfHwgMDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUxlZnRJbkxldmVsID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlTGVmdChcclxuICAgICAgICAgICAgdGlsZUluZGV4LCBtaW5MZXZlbCk7XHJcbiAgICAgICAgdmFyIHRpbGVUb3BJbkxldmVsID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlVG9wKFxyXG4gICAgICAgICAgICB0aWxlSW5kZXgsIG1pbkxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWluWEluVGlsZSA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblggLSB0aWxlTGVmdEluTGV2ZWw7XHJcbiAgICAgICAgdmFyIG1pbllJblRpbGUgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5ZIC0gdGlsZVRvcEluTGV2ZWw7XHJcbiAgICAgICAgdmFyIG1heFhJblRpbGUgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlIC0gdGlsZUxlZnRJbkxldmVsO1xyXG4gICAgICAgIHZhciBtYXhZSW5UaWxlID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSAtIHRpbGVUb3BJbkxldmVsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtUGFydExldmVsV2lkdGggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldExldmVsV2lkdGgoXHJcbiAgICAgICAgICAgIG1pbkxldmVsKTtcclxuICAgICAgICB2YXIgY29kZXN0cmVhbVBhcnRMZXZlbEhlaWdodCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxIZWlnaHQoXHJcbiAgICAgICAgICAgIG1pbkxldmVsKTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgY29tcG9uZW50ID0gMDsgY29tcG9uZW50IDwgY29tcG9uZW50czsgKytjb21wb25lbnQpIHtcclxuICAgICAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbY29tcG9uZW50XTtcclxuICAgICAgICAgICAgdmFyIGxldmVscyA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgICAgIHZhciBsZXZlbHNJbkNvZGVzdHJlYW1QYXJ0ID0gbGV2ZWxzIC0gbWluTGV2ZWw7XHJcbiAgICAgICAgICAgIHZhciBudW1SZXNvbHV0aW9uTGV2ZWxzID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVJlc29sdXRpb25MZXZlbHMoKTtcclxuICAgICAgICAgICAgdmFyIHBlckxldmVsUmVzdWx0ID0gbmV3IEFycmF5KGxldmVscyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGxldmVsID0gMDsgbGV2ZWwgPCBsZXZlbHNJbkNvZGVzdHJlYW1QYXJ0OyArK2xldmVsKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgY29tcG9uZW50U2NhbGVYID0gY29tcG9uZW50U3RydWN0dXJlLmdldENvbXBvbmVudFNjYWxlWCgpO1xyXG4gICAgICAgICAgICAgICAgdmFyIGNvbXBvbmVudFNjYWxlWSA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXRDb21wb25lbnRTY2FsZVkoKTtcclxuICAgICAgICAgICAgICAgIHZhciBsZXZlbEluQ29kZXN0cmVhbVBhcnQgPSBsZXZlbHNJbkNvZGVzdHJlYW1QYXJ0IC0gbGV2ZWwgLSAxO1xyXG4gICAgICAgICAgICAgICAgdmFyIGxldmVsU2NhbGVYID0gY29tcG9uZW50U2NhbGVYIDw8IGxldmVsSW5Db2Rlc3RyZWFtUGFydDtcclxuICAgICAgICAgICAgICAgIHZhciBsZXZlbFNjYWxlWSA9IGNvbXBvbmVudFNjYWxlWSA8PCBsZXZlbEluQ29kZXN0cmVhbVBhcnQ7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciByZWR1bmRhbnQgPSA0OyAvLyBSZWR1bmRhbnQgcGl4ZWxzIGZvciB3YXZlbGV0IDktNyBjb252b2x1dGlvblxyXG4gICAgICAgICAgICAgICAgdmFyIG1pblhJbkxldmVsID0gTWF0aC5mbG9vcihtaW5YSW5UaWxlIC8gbGV2ZWxTY2FsZVgpIC0gcmVkdW5kYW50O1xyXG4gICAgICAgICAgICAgICAgdmFyIG1pbllJbkxldmVsID0gTWF0aC5mbG9vcihtaW5ZSW5UaWxlIC8gbGV2ZWxTY2FsZVkpIC0gcmVkdW5kYW50O1xyXG4gICAgICAgICAgICAgICAgdmFyIG1heFhJbkxldmVsID0gTWF0aC5jZWlsKG1heFhJblRpbGUgLyBsZXZlbFNjYWxlWCkgKyByZWR1bmRhbnQ7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWF4WUluTGV2ZWwgPSBNYXRoLmNlaWwobWF4WUluVGlsZSAvIGxldmVsU2NhbGVZKSArIHJlZHVuZGFudDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0V2lkdGggPVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZS5nZXRQcmVjaW5jdFdpZHRoKGxldmVsKSAqIGNvbXBvbmVudFNjYWxlWDtcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdEhlaWdodCA9XHJcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldFByZWNpbmN0SGVpZ2h0KGxldmVsKSAqIGNvbXBvbmVudFNjYWxlWTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIG1pblByZWNpbmN0WCA9IE1hdGguZmxvb3IobWluWEluTGV2ZWwgLyBwcmVjaW5jdFdpZHRoKTtcclxuICAgICAgICAgICAgICAgIHZhciBtaW5QcmVjaW5jdFkgPSBNYXRoLmZsb29yKG1pbllJbkxldmVsIC8gcHJlY2luY3RIZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG1heFByZWNpbmN0WCA9IE1hdGguY2VpbChtYXhYSW5MZXZlbCAvIHByZWNpbmN0V2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG1heFByZWNpbmN0WSA9IE1hdGguY2VpbChtYXhZSW5MZXZlbCAvIHByZWNpbmN0SGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChsZXZlbCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RzWSA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNZKGxldmVsKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcGVyTGV2ZWxSZXN1bHRbbGV2ZWxdID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIG1pblByZWNpbmN0WDogTWF0aC5tYXgoMCwgbWluUHJlY2luY3RYKSxcclxuICAgICAgICAgICAgICAgICAgICBtaW5QcmVjaW5jdFk6IE1hdGgubWF4KDAsIG1pblByZWNpbmN0WSksXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4UHJlY2luY3RYRXhjbHVzaXZlOiBNYXRoLm1pbihtYXhQcmVjaW5jdFgsIHByZWNpbmN0c1gpLFxyXG4gICAgICAgICAgICAgICAgICAgIG1heFByZWNpbmN0WUV4Y2x1c2l2ZTogTWF0aC5taW4obWF4UHJlY2luY3RZLCBwcmVjaW5jdHNZKVxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHBlckNvbXBvbmVudFJlc3VsdFtjb21wb25lbnRdID0gcGVyTGV2ZWxSZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwZXJDb21wb25lbnRSZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUFkdmFuY2VQcmVjaW5jdEl0ZXJhdG9yKFxyXG4gICAgICAgIHNldGFibGVJdGVyYXRvcixcclxuICAgICAgICBsZXZlbCxcclxuICAgICAgICBwcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQsXHJcbiAgICAgICAgaXNJdGVyYXRlUHJlY2luY3RzTm90SW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBuZWVkQWR2YW5jZU5leHRNZW1iZXIgPSB0cnVlO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNSYW5nZUhhc2ggPSBpc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0ID9cclxuICAgICAgICAgICAgbnVsbDogcHJlY2luY3RzSW5Db2Rlc3RyZWFtUGFydFBlckxldmVsUGVyQ29tcG9uZW50O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBuZWVkUmVzZXRQcmVjaW5jdFRvTWluaW1hbEluQ29kZXN0cmVhbVBhcnQgPSBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMjsgaSA+PSAwOyAtLWkpIHtcclxuICAgICAgICAgICAgdmFyIG5ld1ZhbHVlID0gYWR2YW5jZVByb2dyZXNzaW9uT3JkZXJNZW1iZXIoXHJcbiAgICAgICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IsIGksIGxldmVsLCBwcmVjaW5jdHNSYW5nZUhhc2gpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbmVlZEFkdmFuY2VOZXh0TWVtYmVyID0gbmV3VmFsdWUgPT09IDA7XHJcbiAgICAgICAgICAgIGlmICghbmVlZEFkdmFuY2VOZXh0TWVtYmVyKSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHByb2dyZXNzaW9uT3JkZXJbaV0gPT09ICdQJyAmJlxyXG4gICAgICAgICAgICAgICAgIWlzSXRlcmF0ZVByZWNpbmN0c05vdEluQ29kZXN0cmVhbVBhcnQpIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbmVlZFJlc2V0UHJlY2luY3RUb01pbmltYWxJbkNvZGVzdHJlYW1QYXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobmVlZEFkdmFuY2VOZXh0TWVtYmVyKSB7XHJcbiAgICAgICAgICAgIC8vIElmIHdlIGFyZSBoZXJlLCB0aGUgbGFzdCBwcmVjaW5jdCBoYXMgYmVlbiByZWFjaGVkXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IuaXNJbkNvZGVzdHJlYW1QYXJ0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByYW5nZVBlckxldmVsID1cclxuICAgICAgICAgICAgcHJlY2luY3RzSW5Db2Rlc3RyZWFtUGFydFBlckxldmVsUGVyQ29tcG9uZW50W3NldGFibGVJdGVyYXRvci5jb21wb25lbnRdO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNSYW5nZSA9IHJhbmdlUGVyTGV2ZWxbc2V0YWJsZUl0ZXJhdG9yLnJlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG5lZWRSZXNldFByZWNpbmN0VG9NaW5pbWFsSW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RYID0gcHJlY2luY3RzUmFuZ2UubWluUHJlY2luY3RYO1xyXG4gICAgICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WSA9IHByZWNpbmN0c1JhbmdlLm1pblByZWNpbmN0WTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLmlzSW5Db2Rlc3RyZWFtUGFydCA9XHJcbiAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFggPj0gcHJlY2luY3RzUmFuZ2UubWluUHJlY2luY3RYICYmXHJcbiAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFkgPj0gcHJlY2luY3RzUmFuZ2UubWluUHJlY2luY3RZICYmXHJcbiAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFggPCBwcmVjaW5jdHNSYW5nZS5tYXhQcmVjaW5jdFhFeGNsdXNpdmUgJiZcclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WSA8IHByZWNpbmN0c1JhbmdlLm1heFByZWNpbmN0WUV4Y2x1c2l2ZTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWR2YW5jZVByb2dyZXNzaW9uT3JkZXJNZW1iZXIoXHJcbiAgICAgICAgcHJlY2luY3RQb3NpdGlvbixcclxuICAgICAgICBtZW1iZXJJbmRleCxcclxuICAgICAgICBsZXZlbCxcclxuICAgICAgICBwcmVjaW5jdHNSYW5nZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSBjb21wb25lbnRTdHJ1Y3R1cmVzW3ByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50XTtcclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKHByb2dyZXNzaW9uT3JkZXJbbWVtYmVySW5kZXhdKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ1InOlxyXG4gICAgICAgICAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHMgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCkgLVxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICArK3ByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsO1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWwgJT0gbnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICAgICAgICAgIHJldHVybiBwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ0MnOlxyXG4gICAgICAgICAgICAgICAgKytwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudDtcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50ICU9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnUCc6XHJcbiAgICAgICAgICAgICAgICB2YXIgbWluWCwgbWluWSwgbWF4WCwgbWF4WTtcclxuICAgICAgICAgICAgICAgIGlmIChwcmVjaW5jdHNSYW5nZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdHNSYW5nZVBlckxldmVsID0gcHJlY2luY3RzUmFuZ2VbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50XTtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RzUmFuZ2VJbkxldmVsQ29tcG9uZW50ID0gcHJlY2luY3RzUmFuZ2VQZXJMZXZlbFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWxdO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIG1pblggPSBwcmVjaW5jdHNSYW5nZUluTGV2ZWxDb21wb25lbnQubWluUHJlY2luY3RYO1xyXG4gICAgICAgICAgICAgICAgICAgIG1pblkgPSBwcmVjaW5jdHNSYW5nZUluTGV2ZWxDb21wb25lbnQubWluUHJlY2luY3RZO1xyXG4gICAgICAgICAgICAgICAgICAgIG1heFggPSBwcmVjaW5jdHNSYW5nZUluTGV2ZWxDb21wb25lbnQubWF4UHJlY2luY3RYRXhjbHVzaXZlO1xyXG4gICAgICAgICAgICAgICAgICAgIG1heFkgPSBwcmVjaW5jdHNSYW5nZUluTGV2ZWxDb21wb25lbnQubWF4UHJlY2luY3RZRXhjbHVzaXZlO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBtaW5YID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBtaW5ZID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBtYXhYID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1goXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsKTtcclxuICAgICAgICAgICAgICAgICAgICBtYXhZID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1koXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFggLT0gKG1pblggLSAxKTtcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RYICU9IChtYXhYIC0gbWluWCk7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCArPSBtaW5YO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAocHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFggIT0gbWluWCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCAtIG1pblg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RZIC09IChtaW5ZIC0gMSk7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WSAlPSAobWF4WSAtIG1pblkpO1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFkgKz0gbWluWTtcclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFkgLSBtaW5ZO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnTCcgOlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0FkdmFuY2luZyBMIGlzIG5vdCBzdXBwb3J0ZWQgaW4gSlBJUCcpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIGxldHRlciBpbiBwcm9ncmVzc2lvbiBvcmRlcjogJyArXHJcbiAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3Npb25PcmRlclttZW1iZXJJbmRleF0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZUNvbXBvbmVudFN0cnVjdHVyZShcclxuICAgICAgICBzaXplUGFyYW1zLmRlZmF1bHRDb21wb25lbnRQYXJhbXMsIHRoaXMpO1xyXG4gICAgICAgIFxyXG4gICAgY29tcG9uZW50U3RydWN0dXJlcyA9IG5ldyBBcnJheShjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bUNvbXBvbmVudHMoKSk7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpOyArK2kpIHtcclxuICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmVzW2ldID0ganBpcEZhY3RvcnkuY3JlYXRlQ29tcG9uZW50U3RydWN0dXJlKFxyXG4gICAgICAgICAgICBzaXplUGFyYW1zLnBhcmFtc1BlckNvbXBvbmVudFtpXSwgdGhpcyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByZXByb2Nlc3NQYXJhbXMoKTtcclxuICAgIFxyXG4gICAgdmFsaWRhdGVUYXJnZXRQcm9ncmVzc2lvbk9yZGVyKHByb2dyZXNzaW9uT3JkZXIpO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzLmoya01hcmtlcnMgPSB7XHJcbiAgICBTdGFydE9mQ29kZXN0cmVhbTogWzB4RkYsIDB4NEZdLCAvLyBTT0NcclxuICAgIEltYWdlQW5kVGlsZVNpemU6IFsweEZGLCAweDUxXSwgLy8gU0laXHJcbiAgICBDb2RpbmdTdHlsZURlZmF1bHQ6IFsweEZGLCAweDUyXSwgLy8gQ09EXHJcbiAgICBDb2RpbmdTdHlsZUNvbXBvbmVudDogWzB4RkYsIDB4NTNdLCAvLyBDT0NcclxuICAgIFF1YW50aXphdGlvbkRlZmF1bHQ6IFsweEZGLCAweDVDXSwgLy8gUUNEXHJcbiAgICBQcm9ncmVzc2lvbk9yZGVyQ2hhbmdlOiBbMHhGRiwgMHg1Rl0sIC8vIFBPQ1xyXG4gICAgUGFja2VkUGFja2V0SGVhZGVyc0luTWFpbkhlYWRlcjogWzB4RkYsIDB4NjBdLCAvLyBQUE1cclxuICAgIFBhY2tlZFBhY2tldEhlYWRlcnNJblRpbGVIZWFkZXI6IFsweEZGLCAweDYxXSwgLy8gUFBUXHJcbiAgICBTdGFydE9mVGlsZTogWzB4RkYsIDB4OTBdLCAvLyBTT1RcclxuICAgIFN0YXJ0T2ZEYXRhOiBbMHhGRiwgMHg5M10sIC8vIFNPRFxyXG4gICAgRW5kT2ZDb2Rlc3RyZWFtOiBbMHhGRiwgMHhEOV0sIC8vIEVPQ1xyXG4gICAgQ29tbWVudDogWzB4RkYsIDB4NjRdIC8vIENPTVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuajJrT2Zmc2V0cyA9IHtcclxuICAgIE1BUktFUl9TSVpFOiAyLFxyXG4gICAgTEVOR1RIX0ZJRUxEX1NJWkU6IDIsXHJcbiAgICBcclxuICAgIE5VTV9DT01QT05FTlRTX09GRlNFVF9BRlRFUl9TSVpfTUFSS0VSOiAzOCxcclxuICAgIFJFRkVSRU5DRV9HUklEX1NJWkVfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVI6IDZcclxuXHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRW5kT2ZSZXNwb25zZVJlYXNvbnMgPSB7XHJcbiAgICBJTUFHRV9ET05FIDogMSxcclxuICAgIFdJTkRPV19ET05FIDogMixcclxuICAgIFdJTkRPV19DSEFOR0UgOiAzLFxyXG4gICAgQllURV9MSU1JVCA6IDQsXHJcbiAgICBRVUFMSVRZX0xJTUlUIDogNSxcclxuICAgIFNFU1NJT05fTElNSVQgOiA2LFxyXG4gICAgUkVTUE9OU0VfTElNSVQgOiA3LFxyXG4gICAgTk9OX1NQRUNJRklFRCA6IDhcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmoya0V4Y2VwdGlvbnMgPSB7XHJcbiAgICBVbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb246IGZ1bmN0aW9uKGZlYXR1cmUsIHN0YW5kYXJkU2VjdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBmZWF0dXJlICsgJyAoc3BlY2lmaWVkIGluIHNlY3Rpb24gJyArIHN0YW5kYXJkU2VjdGlvbiArICcgb2YgcGFydCAxOiBDb3JlIENvZGluZyBTeXN0ZW0gc3RhbmRhcmQpIGlzIG5vdCBzdXBwb3J0ZWQgeWV0JztcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSjJrIFVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcblxyXG4gICAgUGFyc2VFeGNlcHRpb246IGZ1bmN0aW9uKGRlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKMmsgUGFyc2VFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG5cclxuICAgIElsbGVnYWxEYXRhRXhjZXB0aW9uOiBmdW5jdGlvbihpbGxlZ2FsRGF0YURlc2NyaXB0aW9uLCBzdGFuZGFyZFNlY3Rpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gaWxsZWdhbERhdGFEZXNjcmlwdGlvbiArICcgKHNlZSBzZWN0aW9uICcgKyBzdGFuZGFyZFNlY3Rpb24gKyAnIG9mIHBhcnQgOTogSW50ZXJhY3Rpdml0eSB0b29scywgQVBJcyBhbmQgUHJvdG9jb2xzKSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0oyayBJbGxlZ2FsRGF0YUV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zID0ge1xyXG4gICAgVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uOiBmdW5jdGlvbihmZWF0dXJlLCBzdGFuZGFyZFNlY3Rpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gZmVhdHVyZSArICcgKHNwZWNpZmllZCBpbiBzZWN0aW9uICcgKyBzdGFuZGFyZFNlY3Rpb24gKyAnIG9mIHBhcnQgOTogSW50ZXJhY3Rpdml0eSB0b29scywgQVBJcyBhbmQgUHJvdG9jb2xzKSBpcyBub3Qgc3VwcG9ydGVkIHlldCc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0pwaXAgVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuXHJcbiAgICBQYXJzZUV4Y2VwdGlvbjogZnVuY3Rpb24oZGVzY3JpcHRpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0pwaXAgUGFyc2VFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG5cclxuICAgIElsbGVnYWxEYXRhRXhjZXB0aW9uOiBmdW5jdGlvbihpbGxlZ2FsRGF0YURlc2NyaXB0aW9uLCBzdGFuZGFyZFNlY3Rpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gaWxsZWdhbERhdGFEZXNjcmlwdGlvbiArICcgKHNlZSBzZWN0aW9uICcgKyBzdGFuZGFyZFNlY3Rpb24gKyAnIG9mIHBhcnQgOTogSW50ZXJhY3Rpdml0eSB0b29scywgQVBJcyBhbmQgUHJvdG9jb2xzKSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0pwaXAgSWxsZWdhbERhdGFFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBJbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uOiBmdW5jdGlvbihkZXNjcmlwdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSnBpcCBJbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgQXJndW1lbnRFeGNlcHRpb246IGZ1bmN0aW9uKGFyZ3VtZW50TmFtZSwgYXJndW1lbnRWYWx1ZSwgZGVzY3JpcHRpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gJ0FyZ3VtZW50ICcgKyBhcmd1bWVudE5hbWUgKyAnIGhhcyBpbnZhbGlkIHZhbHVlICcgK1xyXG4gICAgICAgICAgICBhcmd1bWVudFZhbHVlICsgKGRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQgPyAnIDonICsgZGVzY3JpcHRpb24gOiAnJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0pwaXAgQXJndW1lbnRFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG5cclxuICAgIFdyb25nU3RyZWFtRXhjZXB0aW9uOiBmdW5jdGlvbihyZXF1ZXN0ZWRPcGVyYXRpb24sIGlzSlBUKSB7XHJcbiAgICAgICAgdmFyIGNvcnJlY3RTdHJlYW0gPSAnSlBQIChKUElQIFByZWNpbmN0KSc7XHJcbiAgICAgICAgdmFyIHdyb25nU3RyZWFtID0gJ0pQVCAoSlBJUCBUaWxlLXBhcnQpJztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNKUFQpIHtcclxuICAgICAgICAgICAgdmFyIHN3YXAgPSBjb3JyZWN0U3RyZWFtO1xyXG4gICAgICAgICAgICBjb3JyZWN0U3RyZWFtID0gd3JvbmdTdHJlYW07XHJcbiAgICAgICAgICAgIHdyb25nU3RyZWFtID0gc3dhcDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9ICAgICdTdHJlYW0gdHlwZSBpcyAnICsgd3JvbmdTdHJlYW0gKyAnLCBidXQgJyArIHJlcXVlc3RlZE9wZXJhdGlvbiArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnIGlzIGFsbG93ZWQgb25seSBpbiAnICsgY29ycmVjdFN0cmVhbSArICcgc3RyZWFtJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKcGlwIFdyb25nU3RyZWFtRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuXHJcbiAgICBJbnRlcm5hbEVycm9yRXhjZXB0aW9uOiBmdW5jdGlvbihkZXNjcmlwdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSnBpcCBJbnRlcm5hbEVycm9yRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qMmtFeGNlcHRpb25zLlBhcnNlRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2oya0V4Y2VwdGlvbnMuUGFyc2VFeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2oya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24nO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMuVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2pwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zLlBhcnNlRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2pwaXBFeGNlcHRpb25zLlBhcnNlRXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2pwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zLldyb25nU3RyZWFtRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2pwaXBFeGNlcHRpb25zLldyb25nU3RyZWFtRXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uJzsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgc2ltcGxlQWpheEhlbHBlciAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdzaW1wbGUtYWpheC1oZWxwZXIuanMnICAgICAgICAgICAgICAgICApO1xyXG52YXIgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIgPSByZXF1aXJlKCdtdXR1YWwtZXhjbHVzaXZlLXRyYW5zYWN0aW9uLWhlbHBlci5qcycpO1xyXG5cclxudmFyIGpwaXBDb2RpbmdQYXNzZXNOdW1iZXJQYXJzZXIgPSByZXF1aXJlKCdqcGlwLWNvZGluZy1wYXNzZXMtbnVtYmVyLXBhcnNlci5qcycpO1xyXG52YXIganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXIgICAgICA9IHJlcXVpcmUoJ2pwaXAtbWVzc2FnZS1oZWFkZXItcGFyc2VyLmpzJyAgICAgICk7XHJcblxyXG52YXIgSnBpcENoYW5uZWwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNoYW5uZWwuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcENvZGVzdHJlYW1SZWNvbnN0cnVjdG9yICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNvZGVzdHJlYW0tcmVjb25zdHJ1Y3Rvci5qcycgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcENvZGVzdHJlYW1TdHJ1Y3R1cmUgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNvZGVzdHJlYW0tc3RydWN0dXJlLmpzJyAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcENvbXBvbmVudFN0cnVjdHVyZSAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNvbXBvbmVudC1zdHJ1Y3R1cmUuanMnICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgQ29tcG9zaXRlQXJyYXkgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdjb21wb3NpdGUtYXJyYXkuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcERhdGFiaW5QYXJ0cyAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWRhdGFiaW4tcGFydHMuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcERhdGFiaW5zU2F2ZXIgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWRhdGFiaW5zLXNhdmVyLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcEZldGNoICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWZldGNoLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcEhlYWRlck1vZGlmaWVyICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWhlYWRlci1tb2RpZmllci5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcEltYWdlRGF0YUNvbnRleHQgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWltYWdlLWRhdGEtY29udGV4dC5qcycgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcExldmVsQ2FsY3VsYXRvciAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWxldmVsLWNhbGN1bGF0b3IuanMnICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcE1hcmtlcnNQYXJzZXIgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLW1hcmtlcnMtcGFyc2VyLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcE9iamVjdFBvb2xCeURhdGFiaW4gICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLW9iamVjdC1wb29sLWJ5LWRhdGFiaW4uanMnICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcE9mZnNldHNDYWxjdWxhdG9yICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLW9mZnNldHMtY2FsY3VsYXRvci5qcycgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFBhY2tldHNEYXRhQ29sbGVjdG9yICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXBhY2tldHMtZGF0YS1jb2xsZWN0b3IuanMnICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFJlcXVlc3REYXRhYmluc0xpc3RlbmVyICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXJlcXVlc3QtZGF0YWJpbnMtbGlzdGVuZXIuanMnICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFJlcXVlc3RQYXJhbXNNb2RpZmllciAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXJlcXVlc3QtcGFyYW1zLW1vZGlmaWVyLmpzJyAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFJlcXVlc3QgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXJlcXVlc3QuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFNlc3Npb25IZWxwZXIgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXNlc3Npb24taGVscGVyLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFNlc3Npb24gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXNlc3Npb24uanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFJlY29ubmVjdGFibGVSZXF1ZXN0ZXIgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXJlY29ubmVjdGFibGUtcmVxdWVzdGVyLmpzJyAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFN0cnVjdHVyZVBhcnNlciAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXN0cnVjdHVyZS1wYXJzZXIuanMnICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFRpbGVTdHJ1Y3R1cmUgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXRpbGUtc3RydWN0dXJlLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcEJpdHN0cmVhbVJlYWRlciAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWJpdHN0cmVhbS1yZWFkZXIuanMnICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFRhZ1RyZWUgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXRhZy10cmVlLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcENvZGVibG9ja0xlbmd0aFBhcnNlciAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLWNvZGVibG9jay1sZW5ndGgtcGFyc2VyLmpzJyAgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFN1YmJhbmRMZW5ndGhJblBhY2tldEhlYWRlckNhbGN1bGF0b3IgPSByZXF1aXJlKCdqcGlwLXN1YmJhbmQtbGVuZ3RoLWluLXBhY2tldC1oZWFkZXItY2FsY3VsYXRvci5qcycpO1xyXG52YXIgSnBpcFBhY2tldExlbmd0aENhbGN1bGF0b3IgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXBhY2tldC1sZW5ndGgtY2FsY3VsYXRvci5qcycgICAgICAgICAgICAgICAgICApO1xyXG52YXIgSnBpcFF1YWxpdHlMYXllcnNDYWNoZSAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdqcGlwLXF1YWxpdHktbGF5ZXJzLWNhY2hlLmpzJyAgICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxudmFyIEpwaXBGZXRjaGVyO1xyXG5cclxudmFyIGpwaXBSdW50aW1lRmFjdG9yeSA9IHtcclxuICAgIGNyZWF0ZUNoYW5uZWw6IGZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwoXHJcbiAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsIHNlc3Npb25IZWxwZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDaGFubmVsKFxyXG4gICAgICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCxcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlcixcclxuICAgICAgICAgICAganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUNvZGVzdHJlYW1SZWNvbnN0cnVjdG9yOiBmdW5jdGlvbihcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBkYXRhYmluc1NhdmVyLCBoZWFkZXJNb2RpZmllciwgcXVhbGl0eUxheWVyc0NhY2hlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwQ29kZXN0cmVhbVJlY29uc3RydWN0b3IoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgICAgIGhlYWRlck1vZGlmaWVyLFxyXG4gICAgICAgICAgICBxdWFsaXR5TGF5ZXJzQ2FjaGUpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlTGV2ZWxDYWxjdWxhdG9yOiBmdW5jdGlvbihwYXJhbXMpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBMZXZlbENhbGN1bGF0b3IocGFyYW1zKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUNvZGVzdHJlYW1TdHJ1Y3R1cmU6IGZ1bmN0aW9uKHN0cnVjdHVyZVBhcnNlciwgcHJvZ3Jlc3Npb25PcmRlcikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcENvZGVzdHJlYW1TdHJ1Y3R1cmUoXHJcbiAgICAgICAgICAgIHN0cnVjdHVyZVBhcnNlciwganBpcFJ1bnRpbWVGYWN0b3J5LCBwcm9ncmVzc2lvbk9yZGVyKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUNvbXBvbmVudFN0cnVjdHVyZTogZnVuY3Rpb24ocGFyYW1zLCB0aWxlU3RydWN0dXJlKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwQ29tcG9uZW50U3RydWN0dXJlKHBhcmFtcywgdGlsZVN0cnVjdHVyZSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVDb21wb3NpdGVBcnJheTogZnVuY3Rpb24ob2Zmc2V0KSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBDb21wb3NpdGVBcnJheShvZmZzZXQpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlRGF0YWJpblBhcnRzOiBmdW5jdGlvbihjbGFzc0lkLCBpbkNsYXNzSWQpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBEYXRhYmluUGFydHMoY2xhc3NJZCwgaW5DbGFzc0lkLCBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlRGF0YWJpbnNTYXZlcjogZnVuY3Rpb24oaXNKcGlwVGlsZXBhcnRTdHJlYW0pIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBEYXRhYmluc1NhdmVyKGlzSnBpcFRpbGVwYXJ0U3RyZWFtLCBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlRmV0Y2hlcjogZnVuY3Rpb24oZGF0YWJpbnNTYXZlciwgb3B0aW9ucykge1xyXG4gICAgICAgIGlmICghSnBpcEZldGNoZXIpIHtcclxuXHRcdFx0Ly8gQXZvaWQgZGVwZW5kZW5jeSAtIGxvYWQgb25seSBvbiBydW50aW1lXHJcblx0XHRcdEpwaXBGZXRjaGVyID0gcmVxdWlyZSgnanBpcC1mZXRjaGVyLmpzJyk7XHJcblx0XHR9XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwRmV0Y2hlcihkYXRhYmluc1NhdmVyLCBvcHRpb25zKTtcclxuICAgIH0sXHJcblx0XHJcblx0Y3JlYXRlRmV0Y2g6IGZ1bmN0aW9uKGZldGNoQ29udGV4dCwgcmVxdWVzdGVyLCBwcm9ncmVzc2l2ZW5lc3MpIHtcclxuXHRcdHJldHVybiBuZXcgSnBpcEZldGNoKGZldGNoQ29udGV4dCwgcmVxdWVzdGVyLCBwcm9ncmVzc2l2ZW5lc3MpO1xyXG5cdH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUhlYWRlck1vZGlmaWVyOiBmdW5jdGlvbihcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBvZmZzZXRzQ2FsY3VsYXRvciwgcHJvZ3Jlc3Npb25PcmRlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcEhlYWRlck1vZGlmaWVyKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBvZmZzZXRzQ2FsY3VsYXRvciwgcHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVJbWFnZURhdGFDb250ZXh0OiBmdW5jdGlvbihcclxuICAgICAgICBqcGlwT2JqZWN0cywgY29kZXN0cmVhbVBhcnRQYXJhbXMsIHByb2dyZXNzaXZlbmVzcykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcEltYWdlRGF0YUNvbnRleHQoXHJcbiAgICAgICAgICAgIGpwaXBPYmplY3RzLCBjb2Rlc3RyZWFtUGFydFBhcmFtcywgcHJvZ3Jlc3NpdmVuZXNzKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZU1hcmtlcnNQYXJzZXI6IGZ1bmN0aW9uKG1haW5IZWFkZXJEYXRhYmluKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwTWFya2Vyc1BhcnNlcihcclxuICAgICAgICAgICAgbWFpbkhlYWRlckRhdGFiaW4sIGpwaXBNZXNzYWdlSGVhZGVyUGFyc2VyLCBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlT2JqZWN0UG9vbEJ5RGF0YWJpbjogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwT2JqZWN0UG9vbEJ5RGF0YWJpbigpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlT2Zmc2V0c0NhbGN1bGF0b3I6IGZ1bmN0aW9uKG1haW5IZWFkZXJEYXRhYmluLCBtYXJrZXJzUGFyc2VyKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwT2Zmc2V0c0NhbGN1bGF0b3IobWFpbkhlYWRlckRhdGFiaW4sIG1hcmtlcnNQYXJzZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlUGFja2V0c0RhdGFDb2xsZWN0b3I6IGZ1bmN0aW9uKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGRhdGFiaW5zU2F2ZXIsIHF1YWxpdHlMYXllcnNDYWNoZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFBhY2tldHNEYXRhQ29sbGVjdG9yKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgICAgICBxdWFsaXR5TGF5ZXJzQ2FjaGUsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcjogZnVuY3Rpb24gY3JlYXRlUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrLFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICBxdWFsaXR5TGF5ZXJzQ2FjaGUpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcihcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllclJlYWNoZWRDYWxsYmFjayxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyc0NhY2hlLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuXHRcclxuXHRjcmVhdGVSZXF1ZXN0UGFyYW1zTW9kaWZpZXI6IGZ1bmN0aW9uIGNyZWF0ZVJlcXVlc3RQYXJhbXNNb2RpZmllcihcclxuXHRcdGNvZGVzdHJlYW1TdHJ1Y3R1cmUpIHtcclxuXHRcdFxyXG5cdFx0cmV0dXJuIG5ldyBKcGlwUmVxdWVzdFBhcmFtc01vZGlmaWVyKGNvZGVzdHJlYW1TdHJ1Y3R1cmUpO1xyXG5cdH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVJlcXVlc3Q6IGZ1bmN0aW9uIGNyZWF0ZVJlcXVlc3QoXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlciwgY2hhbm5lbCwgcmVxdWVzdFVybCwgY2FsbGJhY2ssIGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFJlcXVlc3QoXHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIsXHJcbiAgICAgICAgICAgIGpwaXBNZXNzYWdlSGVhZGVyUGFyc2VyLFxyXG4gICAgICAgICAgICBjaGFubmVsLFxyXG4gICAgICAgICAgICByZXF1ZXN0VXJsLFxyXG4gICAgICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVNlc3Npb25IZWxwZXI6IGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25IZWxwZXIoXHJcbiAgICAgICAgZGF0YVJlcXVlc3RVcmwsXHJcbiAgICAgICAga25vd25UYXJnZXRJZCxcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBTZXNzaW9uSGVscGVyKFxyXG4gICAgICAgICAgICBkYXRhUmVxdWVzdFVybCxcclxuICAgICAgICAgICAga25vd25UYXJnZXRJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICAgICAgc2ltcGxlQWpheEhlbHBlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVTZXNzaW9uOiBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKFxyXG4gICAgICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgIHRhcmdldElkLFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFNlc3Npb24oXHJcbiAgICAgICAgICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCxcclxuICAgICAgICAgICAgdGFyZ2V0SWQsXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgICAgIHNldEludGVydmFsLFxyXG4gICAgICAgICAgICBjbGVhckludGVydmFsLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlUmVjb25uZWN0YWJsZVJlcXVlc3RlcjogZnVuY3Rpb24oXHJcbiAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwUmVjb25uZWN0YWJsZVJlcXVlc3RlcihcclxuICAgICAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlU3RydWN0dXJlUGFyc2VyOiBmdW5jdGlvbihkYXRhYmluc1NhdmVyLCBtYXJrZXJzUGFyc2VyLCBvZmZzZXRzQ2FsY3VsYXRvcikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFN0cnVjdHVyZVBhcnNlcihcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlciwgbWFya2Vyc1BhcnNlciwganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXIsIG9mZnNldHNDYWxjdWxhdG9yKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVRpbGVTdHJ1Y3R1cmU6IGZ1bmN0aW9uKFxyXG4gICAgICAgIHNpemVQYXJhbXMsIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIHByb2dyZXNzaW9uT3JkZXIpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBUaWxlU3RydWN0dXJlKFxyXG4gICAgICAgICAgICBzaXplUGFyYW1zLCBjb2Rlc3RyZWFtU3RydWN0dXJlLCBqcGlwUnVudGltZUZhY3RvcnksIHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQml0c3RyZWFtUmVhZGVyOiBmdW5jdGlvbiBjcmVhdGVCaXRzdHJlYW1SZWFkZXIoZGF0YWJpbikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcEJpdHN0cmVhbVJlYWRlcihcclxuICAgICAgICAgICAgZGF0YWJpbiwgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlVGFnVHJlZTogZnVuY3Rpb24gY3JlYXRlVGFnVHJlZShiaXRzdHJlYW1SZWFkZXIsIHdpZHRoLCBoZWlnaHQpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBUYWdUcmVlKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsIHdpZHRoLCBoZWlnaHQsIG11dHVhbEV4Y2x1c2l2ZVRyYW5zYWN0aW9uSGVscGVyKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUNvZGVibG9ja0xlbmd0aFBhcnNlcjogZnVuY3Rpb24gY3JlYXRlQ29kZWJsb2NrTGVuZ3RoUGFyc2VyKFxyXG4gICAgICAgIGJpdHN0cmVhbVJlYWRlciwgdHJhbnNhY3Rpb25IZWxwZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDb2RlYmxvY2tMZW5ndGhQYXJzZXIoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlciwgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlU3ViYmFuZExlbmd0aEluUGFja2V0SGVhZGVyQ2FsY3VsYXRvciA6XHJcbiAgICAgICAgZnVuY3Rpb24gY3JlYXRlU3ViYmFuZExlbmd0aEluUGFja2V0SGVhZGVyQ2FsY3VsYXRvcihcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLCBudW1Db2RlYmxvY2tzWEluU3ViYmFuZCwgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsXHJcbiAgICAgICAgICAgIG51bUNvZGVibG9ja3NYSW5TdWJiYW5kLFxyXG4gICAgICAgICAgICBudW1Db2RlYmxvY2tzWUluU3ViYmFuZCxcclxuICAgICAgICAgICAganBpcENvZGluZ1Bhc3Nlc051bWJlclBhcnNlcixcclxuICAgICAgICAgICAgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVQYWNrZXRMZW5ndGhDYWxjdWxhdG9yOiBmdW5jdGlvbiBjcmVhdGVQYWNrZXRMZW5ndGhDYWxjdWxhdG9yKFxyXG4gICAgICAgIHRpbGVTdHJ1Y3R1cmUsXHJcbiAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgc3RhcnRPZmZzZXRJbkRhdGFiaW4sXHJcbiAgICAgICAgcHJlY2luY3QpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBQYWNrZXRMZW5ndGhDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICB0aWxlU3RydWN0dXJlLFxyXG4gICAgICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgICAgIHN0YXJ0T2Zmc2V0SW5EYXRhYmluLFxyXG4gICAgICAgICAgICBwcmVjaW5jdCxcclxuICAgICAgICAgICAganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVF1YWxpdHlMYXllcnNDYWNoZTogZnVuY3Rpb24gY3JlYXRlUXVhbGl0eUxheWVyc0NhY2hlKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBRdWFsaXR5TGF5ZXJzQ2FjaGUoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGpwaXBSdW50aW1lRmFjdG9yeTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIHJlcXVlc3Q6IGZ1bmN0aW9uIHJlcXVlc3QoXHJcbiAgICAgICAgdXJsLFxyXG4gICAgICAgIGNhbGxiYWNrRm9yQXN5bmNocm9ub3VzUmVxdWVzdCxcclxuICAgICAgICBmYWlsdXJlQ2FsbGJhY2tGb3JBc3luY2hyb25vdXNSZXF1ZXN0LFxyXG4gICAgICAgIHByb2dyZXNzaXZlUmVxdWVzdFF1YW50Qnl0ZXMpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYWpheFJlc3BvbnNlID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XHJcbiAgICAgICAgdmFyIGlzU3luY2hyb25vdXMgPSBjYWxsYmFja0ZvckFzeW5jaHJvbm91c1JlcXVlc3QgPT09IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgdmFyIGlzRmluaXNoZWRSZXF1ZXN0ID0gZmFsc2U7XHJcbiAgICAgICAgdmFyIGJ5dGVzUmVjaWV2ZWRPbkxhc3RRdWFudCA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gaW50ZXJuYWxBamF4Q2FsbGJhY2soZSkge1xyXG4gICAgICAgICAgICBpZiAoaXNGaW5pc2hlZFJlcXVlc3QpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFqYXhSZXNwb25zZS5yZWFkeVN0YXRlICE9PSA0KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAocHJvZ3Jlc3NpdmVSZXF1ZXN0UXVhbnRCeXRlcyA9PT0gdW5kZWZpbmVkIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgYWpheFJlc3BvbnNlLnJlc3BvbnNlID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgYWpheFJlc3BvbnNlLnJlYWR5U3RhdGUgPCAzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgYnl0ZXNSZWNpZXZlZCA9IGFqYXhSZXNwb25zZS5yZXNwb25zZS5ieXRlTGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgdmFyIGJ5dGVzVGlsbExhc3RRdWFudCA9IGJ5dGVzUmVjaWV2ZWQgLSBieXRlc1JlY2lldmVkT25MYXN0UXVhbnQ7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChieXRlc1RpbGxMYXN0UXVhbnQgPCBwcm9ncmVzc2l2ZVJlcXVlc3RRdWFudEJ5dGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBieXRlc1JlY2lldmVkT25MYXN0UXVhbnQgPSBieXRlc1JlY2lldmVkO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgaXNGaW5pc2hlZFJlcXVlc3QgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoYWpheFJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgYWpheFJlc3BvbnNlLnJlc3BvbnNlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrRm9yQXN5bmNocm9ub3VzUmVxdWVzdChhamF4UmVzcG9uc2UpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFpc1N5bmNocm9ub3VzKSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsYmFja0ZvckFzeW5jaHJvbm91c1JlcXVlc3QoYWpheFJlc3BvbnNlLCBpc0ZpbmlzaGVkUmVxdWVzdCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWpheFJlc3BvbnNlLm9wZW4oJ0dFVCcsIHVybCwgIWlzU3luY2hyb25vdXMpO1xyXG4gICAgICAgIGFqYXhSZXNwb25zZS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBpbnRlcm5hbEFqYXhDYWxsYmFjaztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzU3luY2hyb25vdXMpIHtcclxuICAgICAgICAgICAgLy8gTm90IHN1cHBvcnRlZCBmb3Igc3luY2hyb25vdXMgcmVxdWVzdHNcclxuICAgICAgICAgICAgYWpheFJlc3BvbnNlLm1velJlc3BvbnNlVHlwZSA9IGFqYXhSZXNwb25zZS5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHByb2dyZXNzaXZlUmVxdWVzdFF1YW50Qnl0ZXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBhamF4UmVzcG9uc2Uuc2V0UmVxdWVzdEhlYWRlcignWC1Db250ZW50LVR5cGUtT3B0aW9ucycsICdub3NuaWZmJyk7XHJcbiAgICAgICAgICAgIGFqYXhSZXNwb25zZS5vbnByb2dyZXNzID0gaW50ZXJuYWxBamF4Q2FsbGJhY2s7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGFqYXhSZXNwb25zZS5zZW5kKG51bGwpO1xyXG5cclxuICAgICAgICBpZiAoaXNTeW5jaHJvbm91cyAmJiAhaXNGaW5pc2hlZFJlcXVlc3QpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnc3luY2hyb25vdXMgYWpheCBjYWxsIHdhcyBub3QgZmluaXNoZWQgc3luY2hyb25vdXNseScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYWpheFJlc3BvbnNlO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcE1hcmtlcnNQYXJzZXIoXHJcbiAgICBtYWluSGVhZGVyRGF0YWJpbiwgbWVzc2FnZUhlYWRlclBhcnNlciwganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdmFyIENBQ0hFX0tFWSA9ICdtYXJrZXJzJztcclxuICAgIFxyXG4gICAgdGhpcy5nZXRNYW5kYXRvcnlNYXJrZXJPZmZzZXRJbkRhdGFiaW4gPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldE1hbmRhdG9yeU1hcmtlck9mZnNldEluRGF0YWJpbkNsb3N1cmUoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIG1hcmtlciwgbWFya2VyTmFtZSwgc3RhbmRhcmRTZWN0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG9mZnNldCA9IGdldE1hcmtlck9mZnNldEluRGF0YWJpbihkYXRhYmluLCBtYXJrZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICBtYXJrZXJOYW1lICsgJyBpcyBub3QgZm91bmQgd2hlcmUgZXhwZWN0ZWQgdG8gYmUnLFxyXG4gICAgICAgICAgICAgICAgc3RhbmRhcmRTZWN0aW9uKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2hlY2tTdXBwb3J0ZWRNYXJrZXJzID0gZnVuY3Rpb24gY2hlY2tTdXBwb3J0ZWRNYXJrZXJzQ2xvc3VyZShcclxuICAgICAgICBkYXRhYmluLCBtYXJrZXJzLCBpc01hcmtlcnNTdXBwb3J0ZWQpIHtcclxuICAgICAgICBcclxuICAgICAgICBpc01hcmtlcnNTdXBwb3J0ZWQgPSAhIWlzTWFya2Vyc1N1cHBvcnRlZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YWJpbk1hcmtlcnMgPSBnZXREYXRhYmluTWFya2VycyhcclxuICAgICAgICAgICAgZGF0YWJpbiwgLypmb3JjZUFsbE1hcmtlcnNQYXJzZWQ9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFya2Vyc0FzUHJvcGVydGllcyA9IHt9O1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgbWFya2VyID0gZ2V0TWFya2VyQXNQcm9wZXJ0eU5hbWUoXHJcbiAgICAgICAgICAgICAgICBtYXJrZXJzW2ldLCAnanBpcE1hcmtlcnNQYXJzZXIuc3VwcG9ydGVkTWFya2Vyc1snICsgaSArICddJyk7XHJcbiAgICAgICAgICAgIG1hcmtlcnNBc1Byb3BlcnRpZXNbbWFya2VyXSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGV4aXN0aW5nTWFya2VyIGluIGRhdGFiaW5NYXJrZXJzLm1hcmtlclRvT2Zmc2V0KSB7XHJcbiAgICAgICAgICAgIHZhciBpc01hcmtlckluTGlzdCA9ICEhbWFya2Vyc0FzUHJvcGVydGllc1tleGlzdGluZ01hcmtlcl07XHJcbiAgICAgICAgICAgIGlmIChpc01hcmtlckluTGlzdCAhPT0gaXNNYXJrZXJzU3VwcG9ydGVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ1Vuc3VwcG9ydGVkIG1hcmtlciBmb3VuZDogJyArIGV4aXN0aW5nTWFya2VyLCAndW5rbm93bicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4gPSBnZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW47XHJcbiAgICBcclxuICAgIHRoaXMuaXNNYXJrZXIgPSBpc01hcmtlcjtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaXNNYXJrZXIoZGF0YSwgbWFya2VyLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gKGRhdGFbb2Zmc2V0XSA9PT0gbWFya2VyWzBdKSAmJiAoZGF0YVtvZmZzZXQgKyAxXSA9PT0gbWFya2VyWzFdKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldE1hcmtlck9mZnNldEluRGF0YWJpbihkYXRhYmluLCBtYXJrZXIpIHtcclxuICAgICAgICB2YXIgZGF0YWJpbk1hcmtlcnMgPSBnZXREYXRhYmluTWFya2VycyhcclxuICAgICAgICAgICAgZGF0YWJpbiwgLypmb3JjZUFsbE1hcmtlcnNQYXJzZWQ9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3RyTWFya2VyID0gZ2V0TWFya2VyQXNQcm9wZXJ0eU5hbWUoXHJcbiAgICAgICAgICAgIG1hcmtlciwgJ1ByZWRlZmluZWQgbWFya2VyIGluIGpHbG9iYWxzLmoya01hcmtlcnMnKTtcclxuICAgICAgICB2YXIgb2Zmc2V0ID0gZGF0YWJpbk1hcmtlcnMubWFya2VyVG9PZmZzZXRbc3RyTWFya2VyXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAob2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0RGF0YWJpbk1hcmtlcnMoZGF0YWJpbiwgZm9yY2VBbGxNYXJrZXJzUGFyc2VkKSB7XHJcbiAgICAgICAgdmFyIGRhdGFiaW5NYXJrZXJzID0gZGF0YWJpbi5nZXRDYWNoZWREYXRhKENBQ0hFX0tFWSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5NYXJrZXJzLm1hcmtlclRvT2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuaXNQYXJzZWRBbGxNYXJrZXJzID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWQgPSAwO1xyXG4gICAgICAgICAgICBkYXRhYmluTWFya2Vycy5tYXJrZXJUb09mZnNldCA9IHt9O1xyXG4gICAgICAgICAgICBkYXRhYmluTWFya2Vycy5kYXRhYmluID0gZGF0YWJpbjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5NYXJrZXJzLmlzUGFyc2VkQWxsTWFya2Vycykge1xyXG4gICAgICAgICAgICByZXR1cm4gZGF0YWJpbk1hcmtlcnM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGFydE9mZnNldCA9IDA7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gW107XHJcbiAgICAgICAgdmFyIGNhblBhcnNlID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgaWYgKGRhdGFiaW4gPT09IG1haW5IZWFkZXJEYXRhYmluICYmIGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWQgPT09IDApIHtcclxuICAgICAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gZGF0YWJpbi5jb3B5Qnl0ZXMoYnl0ZXMsIC8qc3RhcnRPZmZzZXQ9Ki8wLCB7XHJcbiAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNhblBhcnNlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzTWFya2VyKGJ5dGVzLCBqR2xvYmFscy5qMmtNYXJrZXJzLlN0YXJ0T2ZDb2Rlc3RyZWFtLCAvKm9mZnNldD0qLzApKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnU09DIChTdGFydCBPZiBDb2Rlc3RyZWFtKSAnICtcclxuICAgICAgICAgICAgICAgICAgICAnaXMgbm90IGZvdW5kIHdoZXJlIGV4cGVjdGVkIHRvIGJlJyxcclxuICAgICAgICAgICAgICAgICAgICAnQS40LjEnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCA9IDI7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoY2FuUGFyc2UpIHtcclxuICAgICAgICAgICAgYWN0dWFsUGFyc2VNYXJrZXJzKGRhdGFiaW5NYXJrZXJzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWZ0ZXJQYXJzZU1hcmtlcnMoZGF0YWJpbk1hcmtlcnMsIGZvcmNlQWxsTWFya2Vyc1BhcnNlZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW5NYXJrZXJzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhY3R1YWxQYXJzZU1hcmtlcnMoZGF0YWJpbk1hcmtlcnMpIHtcclxuICAgICAgICB2YXIgb2Zmc2V0ID0gZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXMgPSBbXTtcclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBkYXRhYmluTWFya2Vycy5kYXRhYmluLmNvcHlCeXRlcyhieXRlcywgLypzdGFydE9mZnNldD0qLzAsIHtcclxuICAgICAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFICsgakdsb2JhbHMuajJrT2Zmc2V0cy5MRU5HVEhfRklFTERfU0laRSxcclxuICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogb2Zmc2V0XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoYnl0ZXNDb3BpZWQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdmFyIG1hcmtlciA9IGdldE1hcmtlckFzUHJvcGVydHlOYW1lKFxyXG4gICAgICAgICAgICAgICAgYnl0ZXMsXHJcbiAgICAgICAgICAgICAgICAnb2Zmc2V0ICcgKyBvZmZzZXQgKyAnIG9mIGRhdGFiaW4gd2l0aCBjbGFzcyBJRCA9ICcgK1xyXG4gICAgICAgICAgICAgICAgICAgIGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uZ2V0Q2xhc3NJZCgpICsgJyBhbmQgaW4gY2xhc3MgSUQgPSAnICtcclxuICAgICAgICAgICAgICAgICAgICBkYXRhYmluTWFya2Vycy5kYXRhYmluLmdldEluQ2xhc3NJZCgpKTtcclxuICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMubWFya2VyVG9PZmZzZXRbbWFya2VyLnRvU3RyaW5nKCldID0gb2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBsZW5ndGggPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDE2KGJ5dGVzLCBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFKTtcclxuICAgICAgICAgICAgb2Zmc2V0ICs9IGxlbmd0aCArIGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBieXRlc0NvcGllZCA9IGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwge1xyXG4gICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUgKyBqR2xvYmFscy5qMmtPZmZzZXRzLkxFTkdUSF9GSUVMRF9TSVpFLFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0OiBvZmZzZXRcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCA9IG9mZnNldDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWZ0ZXJQYXJzZU1hcmtlcnMoZGF0YWJpbk1hcmtlcnMsIGZvcmNlQWxsTWFya2Vyc1BhcnNlZCkge1xyXG4gICAgICAgIHZhciBkYXRhYmluTGVuZ3RoID0gZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5nZXREYXRhYmluTGVuZ3RoSWZLbm93bigpO1xyXG4gICAgICAgIGRhdGFiaW5NYXJrZXJzLmlzUGFyc2VkQWxsTWFya2VycyA9IGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWQgPT09IGRhdGFiaW5MZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFkYXRhYmluTWFya2Vycy5pc1BhcnNlZEFsbE1hcmtlcnMgJiYgZGF0YWJpbk1hcmtlcnMuZGF0YWJpbiAhPT0gbWFpbkhlYWRlckRhdGFiaW4pIHtcclxuICAgICAgICAgICAgdmFyIGJ5dGVzID0gW107XHJcbiAgICAgICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwge1xyXG4gICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUsXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGRhdGFiaW5NYXJrZXJzLmxhc3RPZmZzZXRQYXJzZWRcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGJ5dGVzQ29waWVkICE9PSBudWxsICYmXHJcbiAgICAgICAgICAgICAgICBpc01hcmtlcihieXRlcywgMCwgakdsb2JhbHMuajJrTWFya2Vycy5TdGFydE9mRGF0YSkpIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCArPSBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFO1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuaXNQYXJzZWRBbGxNYXJrZXJzID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZm9yY2VBbGxNYXJrZXJzUGFyc2VkICYmICFkYXRhYmluTWFya2Vycy5pc1BhcnNlZEFsbE1hcmtlcnMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnZGF0YS1iaW4gd2l0aCBjbGFzcyBJRCA9ICcgK1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5nZXRDbGFzc0lkKCkgKyAnIGFuZCBpbiBjbGFzcyBJRCA9ICcgK1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5nZXRJbkNsYXNzSWQoKSArXHJcbiAgICAgICAgICAgICAgICAnIHdhcyBub3QgcmVjaWV2ZWQgeWV0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRNYXJrZXJBc1Byb3BlcnR5TmFtZShieXRlcywgbWFya2VyUG9zaXRpb25EZXNjcmlwdGlvbikge1xyXG4gICAgICAgIGlmIChieXRlc1swXSAhPT0gMHhGRikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdFeHBlY3RlZCBtYXJrZXIgaW4gJyArIG1hcmtlclBvc2l0aW9uRGVzY3JpcHRpb24sICdBJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXIgPSBieXRlc1sxXS50b1N0cmluZygxNik7XHJcbiAgICAgICAgcmV0dXJuIG1hcmtlcjtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBPZmZzZXRzQ2FsY3VsYXRvcihcclxuICAgIG1haW5IZWFkZXJEYXRhYmluLCBtYXJrZXJzUGFyc2VyKSB7XHJcbiAgICBcclxuICAgIHZhciBzdXBwb3J0ZWRNYXJrZXJzID0gW1xyXG4gICAgICAgIGpHbG9iYWxzLmoya01hcmtlcnMuSW1hZ2VBbmRUaWxlU2l6ZSxcclxuICAgICAgICBqR2xvYmFscy5qMmtNYXJrZXJzLkNvZGluZ1N0eWxlRGVmYXVsdCxcclxuICAgICAgICBqR2xvYmFscy5qMmtNYXJrZXJzLlF1YW50aXphdGlvbkRlZmF1bHQsXHJcbiAgICAgICAgakdsb2JhbHMuajJrTWFya2Vycy5Db21tZW50XHJcbiAgICAgICAgXTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDb2RpbmdTdHlsZU9mZnNldCA9IGdldENvZGluZ1N0eWxlT2Zmc2V0O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENvZGluZ1N0eWxlQmFzZVBhcmFtcyA9IGdldENvZGluZ1N0eWxlQmFzZVBhcmFtcztcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJbWFnZUFuZFRpbGVTaXplT2Zmc2V0ID0gZnVuY3Rpb24gZ2V0SW1hZ2VBbmRUaWxlU2l6ZU9mZnNldCgpIHtcclxuICAgICAgICAvLyBBLjUuMSAoSW1hZ2UgYW5kIHRpbGUgc2l6ZSBtYXJrZXIgc2VnbWVudClcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6TWFya2VyT2Zmc2V0ID0gbWFya2Vyc1BhcnNlci5nZXRNYW5kYXRvcnlNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLFxyXG4gICAgICAgICAgICBqR2xvYmFscy5qMmtNYXJrZXJzLkltYWdlQW5kVGlsZVNpemUsXHJcbiAgICAgICAgICAgICdJbWFnZSBhbmQgVGlsZSBTaXplIChTSVopJyxcclxuICAgICAgICAgICAgJ0EuNS4xJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHNpek1hcmtlck9mZnNldDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UmFuZ2VzT2ZCZXN0UmVzb2x1dGlvbkxldmVsc0RhdGEgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldFJhbmdlc1dpdGhEYXRhT2ZSZXNvbHV0aW9uTGV2ZWxzQ2xvc3VyZShcclxuICAgICAgICAgICAgZGF0YWJpbiwgbnVtUmVzb2x1dGlvbkxldmVscykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1hcmtlcnNQYXJzZXIuY2hlY2tTdXBwb3J0ZWRNYXJrZXJzKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBzdXBwb3J0ZWRNYXJrZXJzLCAvKmlzTWFya2Vyc1N1cHBvcnRlZD0qL3RydWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0ID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YWJpbkNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMgPSBnZXRDb2RpbmdTdHlsZUJhc2VQYXJhbXMoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIC8qaXNNYW5kYXRvcnk9Ki9mYWxzZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRhdGFiaW5Pck1haW5IZWFkZXJDb2RpbmdTdHlsZUJhc2VQYXJhbXMgPSBkYXRhYmluQ29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcztcclxuICAgICAgICBpZiAoZGF0YWJpbkNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgZGF0YWJpbk9yTWFpbkhlYWRlckNvZGluZ1N0eWxlQmFzZVBhcmFtcyA9IGdldENvZGluZ1N0eWxlQmFzZVBhcmFtcyhcclxuICAgICAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLCAvKmlzTWFuZGF0b3J5PSovdHJ1ZSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldCA9XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluQ29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcy5udW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kaW5nU3R5bGVOdW1SZXNvbHV0aW9uTGV2ZWxzID0gXHJcbiAgICAgICAgICAgIGRhdGFiaW5Pck1haW5IZWFkZXJDb2RpbmdTdHlsZUJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGluZ1N0eWxlTnVtUmVzb2x1dGlvbkxldmVscyA8PSBudW1SZXNvbHV0aW9uTGV2ZWxzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ251bVJlc29sdXRpb25MZXZlbHMgKCcgKyBudW1SZXNvbHV0aW9uTGV2ZWxzICsgJykgPD0gQ09ELicgK1xyXG4gICAgICAgICAgICAgICAgJ251bVJlc29sdXRpb25MZXZlbHMgKCcgKyBjb2RpbmdTdHlsZU51bVJlc29sdXRpb25MZXZlbHMgKyAnKScpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIHJhbmdlcyA9IFtdO1xyXG5cclxuICAgICAgICBhZGRSYW5nZU9mQmVzdFJlc29sdXRpb25MZXZlbHNJbkNvZGluZ1N0eWxlKFxyXG4gICAgICAgICAgICByYW5nZXMsIGRhdGFiaW5Db2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLCBudW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuXHJcbiAgICAgICAgYWRkUmFuZ2VPZkJlc3RSZXNvbHV0aW9uTGV2ZWxzSW5RdWFudGl6YXRpb24oXHJcbiAgICAgICAgICAgIHJhbmdlcyxcclxuICAgICAgICAgICAgZGF0YWJpbixcclxuICAgICAgICAgICAgZGF0YWJpbk9yTWFpbkhlYWRlckNvZGluZ1N0eWxlQmFzZVBhcmFtcyxcclxuICAgICAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVscyk7XHJcblxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIHJhbmdlczogcmFuZ2VzLFxyXG4gICAgICAgICAgICBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0OiBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldENvZGluZ1N0eWxlQmFzZVBhcmFtcyhcclxuICAgICAgICBkYXRhYmluLCBpc01hbmRhdG9yeSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2RpbmdTdHlsZURlZmF1bHRPZmZzZXQgPSBnZXRDb2RpbmdTdHlsZU9mZnNldChcclxuICAgICAgICAgICAgZGF0YWJpbiwgaXNNYW5kYXRvcnkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2RpbmdTdHlsZURlZmF1bHRPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1CeXRlcyA9IDg7XHJcbiAgICAgICAgdmFyIGJ5dGVzT2Zmc2V0ID0gY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0ICsgakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRTtcclxuICAgICAgICB2YXIgYnl0ZXMgPSBnZXRCeXRlcyhkYXRhYmluLCBudW1CeXRlcywgYnl0ZXNPZmZzZXQpO1xyXG5cclxuICAgICAgICB2YXIgY29kaW5nU3R5bGVGbGFnc0ZvckFsbENvbXBvbmVudHNPZmZzZXQgPSAyOyAvLyBTY29kXHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlRmxhZ3NGb3JBbGxDb21wb25lbnRzID1cclxuICAgICAgICAgICAgYnl0ZXNbY29kaW5nU3R5bGVGbGFnc0ZvckFsbENvbXBvbmVudHNPZmZzZXRdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgaXNEZWZhdWx0UHJlY2luY3RTaXplID0gIShjb2RpbmdTdHlsZUZsYWdzRm9yQWxsQ29tcG9uZW50cyAmIDB4MSk7XHJcbiAgICAgICAgdmFyIGlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQgPSAhIShjb2RpbmdTdHlsZUZsYWdzRm9yQWxsQ29tcG9uZW50cyAmIDB4Mik7XHJcbiAgICAgICAgdmFyIGlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCA9ICEhKGNvZGluZ1N0eWxlRmxhZ3NGb3JBbGxDb21wb25lbnRzICYgMHg0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldEluQnl0ZXMgPSA3OyAvLyBTUGNvZCwgMXN0IGJ5dGVcclxuICAgICAgICB2YXIgbnVtRGVjb21wb3NpdGlvbkxldmVscyA9IGJ5dGVzW251bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXRJbkJ5dGVzXTtcclxuICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVscyA9IG51bURlY29tcG9zaXRpb25MZXZlbHMgKyAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0ID0gYnl0ZXNPZmZzZXQgKyBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0SW5CeXRlcztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RTaXplc09mZnNldCA9IGlzRGVmYXVsdFByZWNpbmN0U2l6ZSA/IG51bGwgOiBjb2RpbmdTdHlsZURlZmF1bHRPZmZzZXQgKyAxNDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZURlZmF1bHRPZmZzZXQ6IGNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlzRGVmYXVsdFByZWNpbmN0U2l6ZTogaXNEZWZhdWx0UHJlY2luY3RTaXplLFxyXG4gICAgICAgICAgICBpc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkOiBpc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkLFxyXG4gICAgICAgICAgICBpc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQ6IGlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIG51bVJlc29sdXRpb25MZXZlbHM6IG51bVJlc29sdXRpb25MZXZlbHMsXHJcbiAgICAgICAgICAgIHByZWNpbmN0U2l6ZXNPZmZzZXQ6IHByZWNpbmN0U2l6ZXNPZmZzZXQsXHJcbiAgICAgICAgICAgIG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXQ6IG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhZGRSYW5nZU9mQmVzdFJlc29sdXRpb25MZXZlbHNJbkNvZGluZ1N0eWxlKFxyXG4gICAgICAgIHJhbmdlcywgY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcywgbnVtUmVzb2x1dGlvbkxldmVscykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMuaXNEZWZhdWx0UHJlY2luY3RTaXplKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZXZlbHNOb3RJblJhbmdlID1cclxuICAgICAgICAgICAgY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzIC0gbnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RPZmZzZXRJblJhbmdlID1cclxuICAgICAgICAgICAgY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcy5wcmVjaW5jdFNpemVzT2Zmc2V0ICsgbGV2ZWxzTm90SW5SYW5nZTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFya2VyTGVuZ3RoT2Zmc2V0ID0gXHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMuY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0ICsgakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RTaXplc1JhbmdlID0ge1xyXG4gICAgICAgICAgICBtYXJrZXJTZWdtZW50TGVuZ3RoT2Zmc2V0OiBtYXJrZXJMZW5ndGhPZmZzZXQsXHJcbiAgICAgICAgICAgIHN0YXJ0OiBmaXJzdE9mZnNldEluUmFuZ2UsXHJcbiAgICAgICAgICAgIGxlbmd0aDogbnVtUmVzb2x1dGlvbkxldmVsc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG5cclxuICAgICAgICByYW5nZXMucHVzaChwcmVjaW5jdFNpemVzUmFuZ2UpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFF1YW50aXphdGlvbkRhdGFCeXRlc1BlclN1YmJhbmQoZGF0YWJpbiwgcXVhbnRpemF0aW9uU3R5bGVPZmZzZXQpIHtcclxuICAgICAgICB2YXIgc3FjZE9mZnNldCA9IHF1YW50aXphdGlvblN0eWxlT2Zmc2V0ICsgNDsgLy8gU3FjZFxyXG4gICAgICAgIHZhciBieXRlcyA9IGdldEJ5dGVzKGRhdGFiaW4sIC8qbnVtQnl0ZXM9Ki8xLCBzcWNkT2Zmc2V0KTtcclxuICAgICAgICB2YXIgcXVhbnRpemF0aW9uU3R5bGUgPSBieXRlc1swXSAmIDB4MUY7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzUGVyU3ViYmFuZDtcclxuICAgICAgICBzd2l0Y2ggKHF1YW50aXphdGlvblN0eWxlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgMDpcclxuICAgICAgICAgICAgICAgIGJ5dGVzUGVyU3ViYmFuZCA9IDE7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICAgICAgYnl0ZXNQZXJTdWJiYW5kID0gMDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICAgICAgICBieXRlc1BlclN1YmJhbmQgPSAyO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnUXVhbnRpemF0aW9uIHN0eWxlIG9mICcgKyBxdWFudGl6YXRpb25TdHlsZSwgJ0EuNi40Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBieXRlc1BlclN1YmJhbmQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGFkZFJhbmdlT2ZCZXN0UmVzb2x1dGlvbkxldmVsc0luUXVhbnRpemF0aW9uKFxyXG4gICAgICAgIHJhbmdlcyxcclxuICAgICAgICBkYXRhYmluLFxyXG4gICAgICAgIGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMsXHJcbiAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVscykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBxY2RNYXJrZXJPZmZzZXQgPSBtYXJrZXJzUGFyc2VyLmdldE1hcmtlck9mZnNldEluRGF0YWJpbihcclxuICAgICAgICAgICAgZGF0YWJpbiwgakdsb2JhbHMuajJrTWFya2Vycy5RdWFudGl6YXRpb25EZWZhdWx0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocWNkTWFya2VyT2Zmc2V0ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzUGVyU3ViYmFuZCA9IGdldFF1YW50aXphdGlvbkRhdGFCeXRlc1BlclN1YmJhbmQoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIHFjZE1hcmtlck9mZnNldCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChieXRlc1BlclN1YmJhbmQgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGV2ZWxzTm90SW5SYW5nZSA9XHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscyAtIG51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN1YmJhbmRzTm90SW5SYW5nZSA9IDEgKyAzICogKGxldmVsc05vdEluUmFuZ2UgLSAxKTtcclxuICAgICAgICB2YXIgc3ViYmFuZHNJblJhbmdlID0gMyAqIG51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZpcnN0T2Zmc2V0SW5SYW5nZSA9XHJcbiAgICAgICAgICAgIHFjZE1hcmtlck9mZnNldCArIDUgKyBzdWJiYW5kc05vdEluUmFuZ2UgKiBieXRlc1BlclN1YmJhbmQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJhbmdlTGVuZ3RoID0gc3ViYmFuZHNJblJhbmdlICogYnl0ZXNQZXJTdWJiYW5kO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXJMZW5ndGhPZmZzZXQgPSBxY2RNYXJrZXJPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBxdWFudGl6YXRpb25zUmFuZ2UgPSB7XHJcbiAgICAgICAgICAgIG1hcmtlclNlZ21lbnRMZW5ndGhPZmZzZXQ6IG1hcmtlckxlbmd0aE9mZnNldCxcclxuICAgICAgICAgICAgc3RhcnQ6IGZpcnN0T2Zmc2V0SW5SYW5nZSxcclxuICAgICAgICAgICAgbGVuZ3RoOiByYW5nZUxlbmd0aFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJhbmdlcy5wdXNoKHF1YW50aXphdGlvbnNSYW5nZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGV4cGVjdE5vQ29kaW5nU3R5bGVDb21wb25lbnQoZGF0YWJpbikge1xyXG4gICAgICAgIHZhciBjb2NPZmZzZXQgPSBtYXJrZXJzUGFyc2VyLmdldE1hcmtlck9mZnNldEluRGF0YWJpbihcclxuICAgICAgICAgICAgZGF0YWJpbiwgakdsb2JhbHMuajJrTWFya2Vycy5Db2RpbmdTdHlsZUNvbXBvbmVudCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvY09mZnNldCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAvLyBBLjYuMlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ09DIE1hcmtlciAoQ29kaW5nIFN0eWxlIENvbXBvbmVudCknLCAnQS42LjInKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldENvZGluZ1N0eWxlT2Zmc2V0KGRhdGFiaW4sIGlzTWFuZGF0b3J5KSB7XHJcbiAgICAgICAgZXhwZWN0Tm9Db2RpbmdTdHlsZUNvbXBvbmVudChkYXRhYmluKTtcclxuXHJcbiAgICAgICAgdmFyIG9mZnNldDtcclxuICAgICAgICBpZiAoaXNNYW5kYXRvcnkpIHtcclxuICAgICAgICAgICAgb2Zmc2V0ID0gbWFya2Vyc1BhcnNlci5nZXRNYW5kYXRvcnlNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgakdsb2JhbHMuajJrTWFya2Vycy5Db2RpbmdTdHlsZURlZmF1bHQsXHJcbiAgICAgICAgICAgICAgICAnQ09EIChDb2Rpbmcgc3R5bGUgRGVmYXVsdCknLFxyXG4gICAgICAgICAgICAgICAgJ0EuNi4xJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgb2Zmc2V0ID0gbWFya2Vyc1BhcnNlci5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLCBqR2xvYmFscy5qMmtNYXJrZXJzLkNvZGluZ1N0eWxlRGVmYXVsdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldEJ5dGVzKGRhdGFiaW4sIG51bUJ5dGVzLCBkYXRhYmluU3RhcnRPZmZzZXQsIGFsbG93RW5kT2ZSYW5nZSkge1xyXG4gICAgICAgIHZhciBieXRlcyA9IFtdO1xyXG5cclxuICAgICAgICB2YXIgcmFuZ2VPcHRpb25zID0ge1xyXG4gICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZSxcclxuICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBudW1CeXRlcyxcclxuICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0OiBkYXRhYmluU3RhcnRPZmZzZXRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBkYXRhYmluLmNvcHlCeXRlcyhieXRlcywgLypzdGFydE9mZnNldD0qLzAsIHJhbmdlT3B0aW9ucyk7XHJcbiAgICAgICAgaWYgKGJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0hlYWRlciBkYXRhLWJpbiBoYXMgbm90IHlldCByZWNpZXZlZCAnICsgbnVtQnl0ZXMgK1xyXG4gICAgICAgICAgICAgICAgJyBieXRlcyBzdGFydGluZyBmcm9tIG9mZnNldCAnICsgZGF0YWJpblN0YXJ0T2Zmc2V0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcFN0cnVjdHVyZVBhcnNlcihcclxuICAgIGRhdGFiaW5zU2F2ZXIsIG1hcmtlcnNQYXJzZXIsIG1lc3NhZ2VIZWFkZXJQYXJzZXIsIG9mZnNldHNDYWxjdWxhdG9yKSB7XHJcbiAgICBcclxuICAgIHRoaXMucGFyc2VDb2Rlc3RyZWFtU3RydWN0dXJlID0gZnVuY3Rpb24gcGFyc2VDb2Rlc3RyZWFtU3RydWN0dXJlKCkge1xyXG4gICAgICAgIC8vIEEuNS4xIChJbWFnZSBhbmQgVGlsZSBTaXplKVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6TWFya2VyT2Zmc2V0ID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0SW1hZ2VBbmRUaWxlU2l6ZU9mZnNldCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlcyA9IGdldEJ5dGVzKFxyXG4gICAgICAgICAgICBtYWluSGVhZGVyRGF0YWJpbixcclxuICAgICAgICAgICAgLypudW1CeXRlcz0qLzM4LFxyXG4gICAgICAgICAgICBzaXpNYXJrZXJPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFICsgakdsb2JhbHMuajJrT2Zmc2V0cy5MRU5HVEhfRklFTERfU0laRSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0ID1cclxuICAgICAgICAgICAgakdsb2JhbHMuajJrT2Zmc2V0cy5SRUZFUkVOQ0VfR1JJRF9TSVpFX09GRlNFVF9BRlRFUl9TSVpfTUFSS0VSIC1cclxuICAgICAgICAgICAgKGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUgKyBqR2xvYmFscy5qMmtPZmZzZXRzLkxFTkdUSF9GSUVMRF9TSVpFKTtcclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50c09mZnNldCA9XHJcbiAgICAgICAgICAgIGpHbG9iYWxzLmoya09mZnNldHMuTlVNX0NPTVBPTkVOVFNfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVIgLVxyXG4gICAgICAgICAgICAoakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRSArIGpHbG9iYWxzLmoya09mZnNldHMuTEVOR1RIX0ZJRUxEX1NJWkUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgcmVmZXJlbmNlR3JpZFNpemVYID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihcclxuICAgICAgICAgICAgYnl0ZXMsIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0KTsgLy8gWFNpelxyXG4gICAgICAgIHZhciByZWZlcmVuY2VHcmlkU2l6ZVkgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKFxyXG4gICAgICAgICAgICBieXRlcywgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgKyA0KTsgLy8gWVNpelxyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgaW1hZ2VPZmZzZXRYID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMTApOyAvLyBYT1NpelxyXG4gICAgICAgIHZhciBpbWFnZU9mZnNldFkgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKGJ5dGVzLCAxNCk7IC8vIFlPU2l6XHJcbiAgICAgICAgdmFyIHRpbGVTaXplWCA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MzIoYnl0ZXMsIDE4KTsgLy8gWFRTaXpcclxuICAgICAgICB2YXIgdGlsZVNpemVZID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMjIpOyAvLyBZVFNpelxyXG4gICAgICAgIHZhciBmaXJzdFRpbGVPZmZzZXRYID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMjYpOyAvLyBYVE9TaXpcclxuICAgICAgICB2YXIgZmlyc3RUaWxlT2Zmc2V0WSA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MzIoYnl0ZXMsIDMwKTsgLy8gWVRPU2l6XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvbXBvbmVudHMgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDE2KGJ5dGVzLCBudW1Db21wb25lbnRzT2Zmc2V0KTsgLy8gQ1NpelxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRzRGF0YU9mZnNldCA9XHJcbiAgICAgICAgICAgIHNpek1hcmtlck9mZnNldCArIGpHbG9iYWxzLmoya09mZnNldHMuTlVNX0NPTVBPTkVOVFNfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVIgKyAyO1xyXG4gICAgICAgIHZhciBjb21wb25lbnRzRGF0YUxlbmd0aCA9IG51bUNvbXBvbmVudHMgKiAzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRzRGF0YUJ5dGVzID0gZ2V0Qnl0ZXMoXHJcbiAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLCBjb21wb25lbnRzRGF0YUxlbmd0aCwgY29tcG9uZW50c0RhdGFPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRzU2NhbGVYID0gbmV3IEFycmF5KG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgIHZhciBjb21wb25lbnRzU2NhbGVZID0gbmV3IEFycmF5KG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtQ29tcG9uZW50czsgKytpKSB7XHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVhbaV0gPSBjb21wb25lbnRzRGF0YUJ5dGVzW2kgKiAzICsgMV07XHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVlbaV0gPSBjb21wb25lbnRzRGF0YUJ5dGVzW2kgKiAzICsgMl07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIG51bUNvbXBvbmVudHM6IG51bUNvbXBvbmVudHMsXHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVg6IGNvbXBvbmVudHNTY2FsZVgsXHJcbiAgICAgICAgICAgIGNvbXBvbmVudHNTY2FsZVk6IGNvbXBvbmVudHNTY2FsZVksXHJcbiAgICAgICAgICAgIGltYWdlV2lkdGg6IHJlZmVyZW5jZUdyaWRTaXplWCAtIGZpcnN0VGlsZU9mZnNldFgsXHJcbiAgICAgICAgICAgIGltYWdlSGVpZ2h0OiByZWZlcmVuY2VHcmlkU2l6ZVkgLSBmaXJzdFRpbGVPZmZzZXRZLFxyXG4gICAgICAgICAgICB0aWxlV2lkdGg6IHRpbGVTaXplWCxcclxuICAgICAgICAgICAgdGlsZUhlaWdodDogdGlsZVNpemVZLFxyXG4gICAgICAgICAgICBmaXJzdFRpbGVPZmZzZXRYOiBmaXJzdFRpbGVPZmZzZXRYLFxyXG4gICAgICAgICAgICBmaXJzdFRpbGVPZmZzZXRZOiBmaXJzdFRpbGVPZmZzZXRZXHJcbiAgICAgICAgfTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJzZURlZmF1bHRUaWxlUGFyYW1zID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIG1haW5IZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRNYWluSGVhZGVyRGF0YWJpbigpO1xyXG5cclxuICAgICAgICB2YXIgdGlsZVBhcmFtcyA9IHBhcnNlQ29kaW5nU3R5bGUobWFpbkhlYWRlckRhdGFiaW4sIC8qaXNNYW5kYXRvcnk9Ki90cnVlKTtcclxuICAgICAgICByZXR1cm4gdGlsZVBhcmFtcztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucGFyc2VPdmVycmlkZW5UaWxlUGFyYW1zID0gZnVuY3Rpb24odGlsZUluZGV4KSB7XHJcbiAgICAgICAgdmFyIHRpbGVIZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRUaWxlSGVhZGVyRGF0YWJpbih0aWxlSW5kZXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEEuNC4yIChTdGFydCBPZiBUaWxlLXBhcnQpXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVQYXJhbXMgPSBwYXJzZUNvZGluZ1N0eWxlKHRpbGVIZWFkZXJEYXRhYmluLCAvKmlzTWFuZGF0b3J5PSovZmFsc2UpO1xyXG4gICAgICAgIHJldHVybiB0aWxlUGFyYW1zO1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBwYXJzZUNvZGluZ1N0eWxlKGRhdGFiaW4sIGlzTWFuZGF0b3J5KSB7XHJcbiAgICAgICAgLy8gQS41LjEgKEltYWdlIGFuZCBUaWxlIFNpemUpXHJcblxyXG4gICAgICAgIHZhciBiYXNlUGFyYW1zID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0Q29kaW5nU3R5bGVCYXNlUGFyYW1zKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBpc01hbmRhdG9yeSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGJhc2VQYXJhbXMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgbWFpbkhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldE1haW5IZWFkZXJEYXRhYmluKCk7XHJcblxyXG4gICAgICAgIHZhciBzaXpNYXJrZXJPZmZzZXQgPSBvZmZzZXRzQ2FsY3VsYXRvci5nZXRJbWFnZUFuZFRpbGVTaXplT2Zmc2V0KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvbXBvbmVudHNPZmZzZXQgPVxyXG4gICAgICAgICAgICBzaXpNYXJrZXJPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLk5VTV9DT01QT05FTlRTX09GRlNFVF9BRlRFUl9TSVpfTUFSS0VSO1xyXG5cclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50c0J5dGVzID0gZ2V0Qnl0ZXMoXHJcbiAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLFxyXG4gICAgICAgICAgICAvKm51bUJ5dGVzPSovMixcclxuICAgICAgICAgICAgLypzdGFydE9mZnNldD0qL251bUNvbXBvbmVudHNPZmZzZXQpO1xyXG4gICAgICAgIHZhciBudW1Db21wb25lbnRzID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQxNihudW1Db21wb25lbnRzQnl0ZXMsIDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYWNrZWRQYWNrZXRIZWFkZXJzTWFya2VySW5UaWxlSGVhZGVyID1cclxuICAgICAgICAgICAgbWFya2Vyc1BhcnNlci5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLCBqR2xvYmFscy5qMmtNYXJrZXJzLlBhY2tlZFBhY2tldEhlYWRlcnNJblRpbGVIZWFkZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYWNrZWRQYWNrZXRIZWFkZXJzTWFya2VySW5NYWluSGVhZGVyID1cclxuICAgICAgICAgICAgbWFya2Vyc1BhcnNlci5nZXRNYXJrZXJPZmZzZXRJbkRhdGFiaW4oXHJcbiAgICAgICAgICAgICAgICBtYWluSGVhZGVyRGF0YWJpbiwgakdsb2JhbHMuajJrTWFya2Vycy5QYWNrZWRQYWNrZXRIZWFkZXJzSW5NYWluSGVhZGVyKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNQYWNrZXRIZWFkZXJzTmVhckRhdGEgPVxyXG4gICAgICAgICAgICBwYWNrZWRQYWNrZXRIZWFkZXJzTWFya2VySW5UaWxlSGVhZGVyID09PSBudWxsICYmXHJcbiAgICAgICAgICAgIHBhY2tlZFBhY2tldEhlYWRlcnNNYXJrZXJJbk1haW5IZWFkZXIgPT09IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlTW9yZURhdGFPZmZzZXQgPSBiYXNlUGFyYW1zLmNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCArIDY7XHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlTW9yZURhdGFCeXRlcyA9IGdldEJ5dGVzKFxyXG4gICAgICAgICAgICBkYXRhYmluLFxyXG4gICAgICAgICAgICAvKm51bUJ5dGVzPSovNixcclxuICAgICAgICAgICAgLypzdGFydE9mZnNldD0qL2NvZGluZ1N0eWxlTW9yZURhdGFPZmZzZXQpO1xyXG4gICAgICAgIHZhciBudW1RdWFsaXR5TGF5ZXJzID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQxNihcclxuICAgICAgICAgICAgY29kaW5nU3R5bGVNb3JlRGF0YUJ5dGVzLCAwKTtcclxuXHJcbiAgICAgICAgdmFyIGNvZGVibG9ja1dpZHRoID0gcGFyc2VDb2RlYmxvY2tTaXplKFxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZU1vcmVEYXRhQnl0ZXMsIDQpO1xyXG4gICAgICAgIHZhciBjb2RlYmxvY2tIZWlnaHQgPSBwYXJzZUNvZGVibG9ja1NpemUoXHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlTW9yZURhdGFCeXRlcywgNSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0V2lkdGhzID0gbmV3IEFycmF5KGJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0SGVpZ2h0cyA9IG5ldyBBcnJheShiYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFNpemVzQnl0ZXMgPSBudWxsO1xyXG4gICAgICAgIGlmICghYmFzZVBhcmFtcy5pc0RlZmF1bHRQcmVjaW5jdFNpemUpIHtcclxuICAgICAgICAgICAgdmFyIHByZWNpbmN0U2l6ZXNCeXRlc05lZWRlZCA9IGJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHByZWNpbmN0U2l6ZXNCeXRlcyA9IGdldEJ5dGVzKFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbixcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0U2l6ZXNCeXRlc05lZWRlZCxcclxuICAgICAgICAgICAgICAgIGJhc2VQYXJhbXMucHJlY2luY3RTaXplc09mZnNldCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgZGVmYXVsdFNpemUgPSAxIDw8IDE1O1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGJhc2VQYXJhbXMuaXNEZWZhdWx0UHJlY2luY3RTaXplKSB7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFdpZHRoc1tpXSA9IGRlZmF1bHRTaXplO1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RIZWlnaHRzW2ldID0gZGVmYXVsdFNpemU7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHByZWNpbmN0U2l6ZU9mZnNldCA9IGk7XHJcbiAgICAgICAgICAgIHZhciBzaXplRXhwb25lbnRzID0gcHJlY2luY3RTaXplc0J5dGVzW3ByZWNpbmN0U2l6ZU9mZnNldF07XHJcbiAgICAgICAgICAgIHZhciBwcHggPSBzaXplRXhwb25lbnRzICYgMHgwRjtcclxuICAgICAgICAgICAgdmFyIHBweSA9IHNpemVFeHBvbmVudHMgPj4+IDQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwcmVjaW5jdFdpZHRoc1tpXSA9IDEgKiBNYXRoLnBvdygyLCBwcHgpOyAvLyBBdm9pZCBuZWdhdGl2ZSByZXN1bHQgZHVlIHRvIHNpZ25lZCBjYWxjdWxhdGlvblxyXG4gICAgICAgICAgICBwcmVjaW5jdEhlaWdodHNbaV0gPSAxICogTWF0aC5wb3coMiwgcHB5KTsgLy8gQXZvaWQgbmVnYXRpdmUgcmVzdWx0IGR1ZSB0byBzaWduZWQgY2FsY3VsYXRpb25cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhcmFtc1BlckNvbXBvbmVudCA9IG5ldyBBcnJheShudW1Db21wb25lbnRzKTtcclxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG51bUNvbXBvbmVudHM7ICsraikge1xyXG4gICAgICAgICAgICBwYXJhbXNQZXJDb21wb25lbnRbal0gPSB7XHJcbiAgICAgICAgICAgICAgICBtYXhDb2RlYmxvY2tXaWR0aDogY29kZWJsb2NrV2lkdGgsXHJcbiAgICAgICAgICAgICAgICBtYXhDb2RlYmxvY2tIZWlnaHQ6IGNvZGVibG9ja0hlaWdodCxcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsczogYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzLFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFdpZHRoUGVyTGV2ZWw6IHByZWNpbmN0V2lkdGhzLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RIZWlnaHRQZXJMZXZlbDogcHJlY2luY3RIZWlnaHRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkZWZhdWx0Q29tcG9uZW50UGFyYW1zID0ge1xyXG4gICAgICAgICAgICBtYXhDb2RlYmxvY2tXaWR0aDogY29kZWJsb2NrV2lkdGgsXHJcbiAgICAgICAgICAgIG1heENvZGVibG9ja0hlaWdodDogY29kZWJsb2NrSGVpZ2h0LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsczogYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzLFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJlY2luY3RXaWR0aFBlckxldmVsOiBwcmVjaW5jdFdpZHRocyxcclxuICAgICAgICAgICAgcHJlY2luY3RIZWlnaHRQZXJMZXZlbDogcHJlY2luY3RIZWlnaHRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVQYXJhbXMgPSB7XHJcbiAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnM6IG51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpc1BhY2tldEhlYWRlcnNOZWFyRGF0YTogaXNQYWNrZXRIZWFkZXJzTmVhckRhdGEsXHJcbiAgICAgICAgICAgIGlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQ6IGJhc2VQYXJhbXMuaXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZCxcclxuICAgICAgICAgICAgaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkOiBiYXNlUGFyYW1zLmlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCxcclxuXHJcbiAgICAgICAgICAgIHBhcmFtc1BlckNvbXBvbmVudDogcGFyYW1zUGVyQ29tcG9uZW50LFxyXG4gICAgICAgICAgICBkZWZhdWx0Q29tcG9uZW50UGFyYW1zOiBkZWZhdWx0Q29tcG9uZW50UGFyYW1zXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRpbGVQYXJhbXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHBhcnNlQ29kZWJsb2NrU2l6ZShieXRlcywgb2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja1NpemVFeHBvbmVudE1pbnVzMiA9IGJ5dGVzW29mZnNldF07XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja1NpemVFeHBvbmVudCA9IDIgKyAoY29kZWJsb2NrU2l6ZUV4cG9uZW50TWludXMyICYgMHgwRik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGVibG9ja1NpemVFeHBvbmVudCA+IDEwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0lsbGVnYWwgY29kZWJsb2NrIHdpZHRoIGV4cG9uZW50ICcgKyBjb2RlYmxvY2tTaXplRXhwb25lbnQsXHJcbiAgICAgICAgICAgICAgICAnQS42LjEsIFRhYmxlIEEuMTgnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNpemUgPSAxIDw8IGNvZGVibG9ja1NpemVFeHBvbmVudDtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Qnl0ZXMoZGF0YWJpbiwgbnVtQnl0ZXMsIGRhdGFiaW5TdGFydE9mZnNldCwgYWxsb3dFbmRPZlJhbmdlKSB7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gW107XHJcblxyXG4gICAgICAgIHZhciByYW5nZU9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IG51bUJ5dGVzLFxyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGRhdGFiaW5TdGFydE9mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwgcmFuZ2VPcHRpb25zKTtcclxuICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnSGVhZGVyIGRhdGEtYmluIGhhcyBub3QgeWV0IHJlY2lldmVkICcgKyBudW1CeXRlcyArXHJcbiAgICAgICAgICAgICAgICAnIGJ5dGVzIHN0YXJ0aW5nIGZyb20gb2Zmc2V0ICcgKyBkYXRhYmluU3RhcnRPZmZzZXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYnl0ZXM7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwQ2hhbm5lbChcclxuICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLCBzZXNzaW9uSGVscGVyLCBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgY2hhbm5lbElkID0gbnVsbDtcclxuICAgIHZhciByZXF1ZXN0SWQgPSAwO1xyXG4gICAgdmFyIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbiA9IFtdO1xyXG4gICAgdmFyIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlID0gW107XHJcbiAgICB2YXIgaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB0aGlzLnJlcXVlc3REYXRhID0gZnVuY3Rpb24gcmVxdWVzdERhdGEoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAgICAgZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgIG51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgLy8gTm8gbmVlZCB0byBjaGVjayBpZiB0aGVyZSBhcmUgdG9vIG1hbnkgY29uY3VycmVudCByZXF1ZXN0c1xyXG4gICAgICAgICAgICAvLyBpZiBjaGFubmVsIHdhcyBkZWRpY2F0ZWQgZm9yIG1vdmFibGUgcmVxdWVzdC4gVGhlIHJlYXNvbiBpc1xyXG4gICAgICAgICAgICAvLyB0aGF0IGFueSByZXF1ZXN0IGluIGRlZGljYXRlZCBjaGFubmVsIGNhbmNlbCB0aGUgcHJldmlvdXMgb25lLlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGFsbFdhaXRpbmdSZXF1ZXN0cyA9IGdldEFsbFF1ZXVlZFJlcXVlc3RDb3VudCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFsbFdhaXRpbmdSZXF1ZXN0cyA+PSBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0NoYW5uZWwgaGFzIHRvbyBtYW55IHJlcXVlc3RzIG5vdCByZXNwb25kZWQgeWV0Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciB1cmwgPSBjcmVhdGVSZXF1ZXN0VXJsKGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBudW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICB2YXIgcmVxdWVzdCA9IGpwaXBGYWN0b3J5LmNyZWF0ZVJlcXVlc3QoXHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIsXHJcbiAgICAgICAgICAgIHNlbGYsXHJcbiAgICAgICAgICAgIHVybCxcclxuICAgICAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAgICAgICAgIGZhaWx1cmVDYWxsYmFjayk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNoYW5uZWxJZCAhPT0gbnVsbCB8fCByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UucHVzaChyZXF1ZXN0KTtcclxuICAgICAgICAgICAgcmVxdWVzdC5zdGFydFJlcXVlc3QoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgLy8gVGhvc2UgcmVxdWVzdHMgY2FuY2VsIGFsbCBwcmV2aW91cyByZXF1ZXN0cyBpbiBjaGFubmVsLCBzbyBub1xyXG4gICAgICAgICAgICAvLyBuZWVkIHRvIGxvZyBvbGQgcmVxdWVzdHNcclxuICAgICAgICAgICAgcmVxdWVzdHNXYWl0aW5nRm9yQ2hhbm5lbENyZWF0aW9uID0gW3JlcXVlc3RdO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbi5wdXNoKHJlcXVlc3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVxdWVzdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2VuZE1pbmltYWxSZXF1ZXN0ID0gZnVuY3Rpb24gc2VuZE1pbmltYWxSZXF1ZXN0KGNhbGxiYWNrKSB7XHJcbiAgICAgICAgaWYgKGNoYW5uZWxJZCA9PT0gbnVsbCAmJiByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ01pbmltYWwgcmVxdWVzdHMgc2hvdWxkIGJlIHVzZWQgZm9yIGZpcnN0IHJlcXVlc3Qgb3Iga2VlcCAnICtcclxuICAgICAgICAgICAgICAgICdhbGl2ZSBtZXNzYWdlLiBLZWVwIGFsaXZlIHJlcXVpcmVzIGFuIGFscmVhZHkgaW5pdGlhbGl6ZWQgJyArXHJcbiAgICAgICAgICAgICAgICAnY2hhbm5lbCwgYW5kIGZpcnN0IHJlcXVlc3QgcmVxdWlyZXMgdG8gbm90IGhhdmUgYW55ICcgK1xyXG4gICAgICAgICAgICAgICAgJ3ByZXZpb3VzIHJlcXVlc3QnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHVybCA9IGNyZWF0ZU1pbmltYWxSZXF1ZXN0VXJsKCk7XHJcbiAgICAgICAgdmFyIHJlcXVlc3QgPSBqcGlwRmFjdG9yeS5jcmVhdGVSZXF1ZXN0KFxyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLCBzZWxmLCB1cmwsIGNhbGxiYWNrKTtcclxuICAgICAgICBcclxuICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5wdXNoKHJlcXVlc3QpO1xyXG4gICAgICAgIHJlcXVlc3Quc3RhcnRSZXF1ZXN0KCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3Q7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3QgPSBmdW5jdGlvbiBkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0KCkge1xyXG4gICAgICAgIGlmIChpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0NoYW5uZWwgYWxyZWFkeSBkZWRpY2F0ZWQgZm9yIG1vdmFibGUgcmVxdWVzdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0ID0gdHJ1ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q2hhbm5lbElkID0gZnVuY3Rpb24gZ2V0Q2hhbm5lbElkKCkge1xyXG4gICAgICAgIHJldHVybiBjaGFubmVsSWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldENoYW5uZWxJZCA9IGZ1bmN0aW9uIHNldENoYW5uZWxJZChuZXdDaGFubmVsSWQpIHtcclxuICAgICAgICBpZiAobmV3Q2hhbm5lbElkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2hhbm5lbElkID0gbmV3Q2hhbm5lbElkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXF1ZXN0c1RvU2VuZCA9IHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbjtcclxuICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JDaGFubmVsQ3JlYXRpb24gPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlcXVlc3RzVG9TZW5kLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLnB1c2gocmVxdWVzdHNUb1NlbmRbaV0pO1xyXG4gICAgICAgICAgICByZXF1ZXN0c1RvU2VuZFtpXS5zdGFydFJlcXVlc3QoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLm5leHRSZXF1ZXN0SWQgPSBmdW5jdGlvbiBuZXh0UmVxdWVzdElkKCkge1xyXG4gICAgICAgIHJldHVybiArK3JlcXVlc3RJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0QWxsUXVldWVkUmVxdWVzdENvdW50ID0gZ2V0QWxsUXVldWVkUmVxdWVzdENvdW50O1xyXG4gICAgXHJcbiAgICB0aGlzLnJlcXVlc3RFbmRlZCA9IGZ1bmN0aW9uIHJlcXVlc3RFbmRlZChhamF4UmVzcG9uc2UsIHJlcXVlc3QpIHtcclxuICAgICAgICB2YXIgcmVxdWVzdHMgPSByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZTtcclxuICAgICAgICB2YXIgaXNGb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVxdWVzdHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKHJlcXVlc3RzW2ldID09PSByZXF1ZXN0KSB7XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0c1tpXSA9IHJlcXVlc3RzW3JlcXVlc3RzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdHMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgICAgICAgICBpc0ZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNGb3VuZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdjaGFubmVsLnJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlIGluY29uc2lzdGVuY3knKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5yZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBzZWxmKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbElkID09PSBudWxsICYmIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIElmIG5vdCBzdWNjZWVkZWQgdG8gY3JlYXRlIGEgY2hhbm5lbCBJRCB5ZXQsXHJcbiAgICAgICAgICAgIC8vIHBlcmZvcm0gYW4gYWRkaXRpb25hbCByZXF1ZXN0XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbmV4dFJlcXVlc3QgPSByZXF1ZXN0c1dhaXRpbmdGb3JDaGFubmVsQ3JlYXRpb24uc2hpZnQoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLnB1c2gobmV4dFJlcXVlc3QpO1xyXG4gICAgICAgICAgICBuZXh0UmVxdWVzdC5zdGFydFJlcXVlc3QoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmlzQWxsT2xkUmVxdWVzdHNFbmRlZCA9IGZ1bmN0aW9uIGlzQWxsT2xkUmVxdWVzdHNFbmRlZChwcmlvclRvSWQpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZVtpXS5sYXN0UmVxdWVzdElkIDw9IHByaW9yVG9JZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0QWxsUXVldWVkUmVxdWVzdENvdW50KCkge1xyXG4gICAgICAgIHZhciBhbGxXYWl0aW5nUmVxdWVzdHMgPVxyXG4gICAgICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5sZW5ndGggK1xyXG4gICAgICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JDaGFubmVsQ3JlYXRpb24ubGVuZ3RoO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBhbGxXYWl0aW5nUmVxdWVzdHM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZU1pbmltYWxSZXF1ZXN0VXJsKGFsbG93U3RvcFByZXZpb3VzUmVxdWVzdHNJbkNoYW5uZWwpIHtcclxuICAgICAgICB2YXIgcmVxdWVzdFVybCA9IHNlc3Npb25IZWxwZXIuZ2V0RGF0YVJlcXVlc3RVcmwoKTtcclxuICAgICAgICB2YXIgdGFyZ2V0SWQgPSBzZXNzaW9uSGVscGVyLmdldFRhcmdldElkKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRhcmdldElkICE9PSAnMCcpIHtcclxuICAgICAgICAgICAgcmVxdWVzdFVybCArPSAnJnRpZD0nICsgdGFyZ2V0SWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhbHJlYWR5U2VudE1lc3NhZ2VzT25DaGFubmVsID0gY2hhbm5lbElkICE9PSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhbHJlYWR5U2VudE1lc3NhZ2VzT25DaGFubmVsKSB7XHJcbiAgICAgICAgICAgIHZhciBpc1N0b3BQcmV2aW91cyA9XHJcbiAgICAgICAgICAgICAgICBpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0ICYmXHJcbiAgICAgICAgICAgICAgICBhbGxvd1N0b3BQcmV2aW91c1JlcXVlc3RzSW5DaGFubmVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzU3RvcFByZXZpb3VzKSB7XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0VXJsICs9ICcmd2FpdD1ubyc7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0VXJsICs9ICcmd2FpdD15ZXMnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0VXJsO1xyXG4gICAgfVxyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlUmVxdWVzdFVybChjb2Rlc3RyZWFtUGFydFBhcmFtcywgbnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIHZhciByZXF1ZXN0VXJsID0gY3JlYXRlTWluaW1hbFJlcXVlc3RVcmwoXHJcbiAgICAgICAgICAgIC8qYWxsb3dTdG9wUHJldmlvdXNSZXF1ZXN0c0luQ2hhbm5lbD0qL3RydWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtU3RydWN0dXJlID0gc2Vzc2lvbkhlbHBlci5nZXRDb2Rlc3RyZWFtU3RydWN0dXJlKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZyYW1lV2lkdGggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldExldmVsV2lkdGgoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLmxldmVsKTtcclxuICAgICAgICB2YXIgZnJhbWVIZWlnaHQgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldExldmVsSGVpZ2h0KFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlZ2lvbldpZHRoID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblg7XHJcbiAgICAgICAgdmFyIHJlZ2lvbkhlaWdodCA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFlFeGNsdXNpdmUgLSBjb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5ZO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJlcXVlc3RVcmwgKz1cclxuICAgICAgICAgICAgJyZmc2l6PScgKyBmcmFtZVdpZHRoICsgJywnICsgZnJhbWVIZWlnaHQgKyAnLGNsb3Nlc3QnICtcclxuICAgICAgICAgICAgJyZyc2l6PScgKyByZWdpb25XaWR0aCArICcsJyArIHJlZ2lvbkhlaWdodCArXHJcbiAgICAgICAgICAgICcmcm9mZj0nICsgY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWCArICcsJyArIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChudW1RdWFsaXR5TGF5ZXJzICE9PSAnbWF4Jykge1xyXG4gICAgICAgICAgICByZXF1ZXN0VXJsICs9ICcmbGF5ZXJzPScgKyBudW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVxdWVzdFVybDtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG52YXIganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXIgPSB7XHJcbiAgICAgICAgXHJcbiAgICBMU0JfTUFTSzogMHgxLFxyXG4gICAgQklUXzRfTUFTSzogMHgxMCxcclxuICAgIEJJVFNfNTZfTUFTSzogMHg2MCxcclxuICAgIE1TQl9NQVNLOiAweDgwLFxyXG5cclxuICAgIExTQl83X01BU0s6IDB4N0YsXHJcblxyXG4gICAgLy8gQS4yLjFcclxuICAgIHBhcnNlTnVtYmVySW5WYmFzOiBmdW5jdGlvbiBwYXJzZU51bWJlckluVmJhc0Nsb3N1cmUoXHJcbiAgICAgICAgbWVzc2FnZSwgc3RhcnRPZmZzZXQsIGJpdHNUb1Rha2VJbkZpcnN0Qnl0ZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzZWxmID0ganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXI7XHJcbiAgICAgICAgdmFyIGN1cnJlbnRPZmZzZXQgPSBzdGFydE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0O1xyXG4gICAgICAgIGlmIChiaXRzVG9UYWtlSW5GaXJzdEJ5dGUpIHtcclxuICAgICAgICAgICAgdmFyIG1hc2tGaXJzdEJ5dGUgPSAoMSA8PCBiaXRzVG9UYWtlSW5GaXJzdEJ5dGUpIC0gMTtcclxuICAgICAgICAgICAgcmVzdWx0ID0gbWVzc2FnZVtjdXJyZW50T2Zmc2V0XSAmIG1hc2tGaXJzdEJ5dGU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQgPSBtZXNzYWdlW2N1cnJlbnRPZmZzZXRdICYgc2VsZi5MU0JfN19NQVNLO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoICEhKG1lc3NhZ2VbY3VycmVudE9mZnNldF0gJiBzZWxmLk1TQl9NQVNLKSApIHtcclxuICAgICAgICAgICAgKytjdXJyZW50T2Zmc2V0O1xyXG5cclxuICAgICAgICAgICAgcmVzdWx0IDw8PSA3O1xyXG4gICAgICAgICAgICByZXN1bHQgfD0gbWVzc2FnZVtjdXJyZW50T2Zmc2V0XSAmIHNlbGYuTFNCXzdfTUFTSztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgZW5kT2Zmc2V0OiBjdXJyZW50T2Zmc2V0ICsgMSxcclxuICAgICAgICAgICAgbnVtYmVyOiByZXN1bHRcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgLy8gQS4yXHJcbiAgICBwYXJzZU1lc3NhZ2VIZWFkZXI6IGZ1bmN0aW9uIHBhcnNlTWVzc2FnZUhlYWRlckNsb3N1cmUoXHJcbiAgICAgICAgbWVzc2FnZSwgc3RhcnRPZmZzZXQsIHByZXZpb3VzTWVzc2FnZUhlYWRlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzZWxmID0ganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXI7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQS4yLjFcclxuICAgICAgICBcclxuICAgICAgICAvLyBGaXJzdCBWYmFzOiBCaW4tSURcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2xhc3NBbmRDc25QcmVjZW5zZSA9IChtZXNzYWdlW3N0YXJ0T2Zmc2V0XSAmIHNlbGYuQklUU181Nl9NQVNLKSA+Pj4gNTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2xhc3NBbmRDc25QcmVjZW5zZSA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuUGFyc2VFeGNlcHRpb24oJ0ZhaWxlZCBwYXJzaW5nIG1lc3NhZ2UgaGVhZGVyICcgK1xyXG4gICAgICAgICAgICAgICAgJyhBLjIuMSk6IHByb2hpYml0ZWQgZXhpc3RhbmNlIGNsYXNzIGFuZCBjc24gYml0cyAwMCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaGFzQ2xhc3NWYmFzID0gISEoY2xhc3NBbmRDc25QcmVjZW5zZSAmIDB4Mik7XHJcbiAgICAgICAgdmFyIGhhc0NvZGVTdHJlYW1JbmRleFZiYXMgPSBjbGFzc0FuZENzblByZWNlbnNlID09PSAzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc0xhc3RCeXRlSW5EYXRhYmluID0gISEobWVzc2FnZVtzdGFydE9mZnNldF0gJiBzZWxmLkJJVF80X01BU0spO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEEuMi4zXHJcbiAgICAgICAgdmFyIHBhcnNlZEluQ2xhc3NJZCA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMoXHJcbiAgICAgICAgICAgIG1lc3NhZ2UsIHN0YXJ0T2Zmc2V0LCAvKmJpdHNUb1Rha2VJbkZpcnN0Qnl0ZT0qLzQpO1xyXG4gICAgICAgIHZhciBpbkNsYXNzSWQgPSBwYXJzZWRJbkNsYXNzSWQubnVtYmVyO1xyXG4gICAgICAgIHZhciBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkSW5DbGFzc0lkLmVuZE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTZWNvbmQgb3B0aW9uYWwgVmJhczogQ2xhc3MgSURcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2xhc3NJZCA9IDA7XHJcbiAgICAgICAgaWYgKGhhc0NsYXNzVmJhcykge1xyXG4gICAgICAgICAgICB2YXIgcGFyc2VkQ2xhc3NJZCA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMobWVzc2FnZSwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgICAgIGNsYXNzSWQgPSBwYXJzZWRDbGFzc0lkLm51bWJlcjtcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCA9IHBhcnNlZENsYXNzSWQuZW5kT2Zmc2V0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChwcmV2aW91c01lc3NhZ2VIZWFkZXIpIHtcclxuICAgICAgICAgICAgY2xhc3NJZCA9IHByZXZpb3VzTWVzc2FnZUhlYWRlci5jbGFzc0lkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGlyZCBvcHRpb25hbCBWYmFzOiBDb2RlIFN0cmVhbSBJbmRleCAoQ3NuKVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtSW5kZXggPSAwO1xyXG4gICAgICAgIGlmIChoYXNDb2RlU3RyZWFtSW5kZXhWYmFzKSB7XHJcbiAgICAgICAgICAgIHZhciBwYXJzZWRDc24gPSBzZWxmLnBhcnNlTnVtYmVySW5WYmFzKG1lc3NhZ2UsIGN1cnJlbnRPZmZzZXQpO1xyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtSW5kZXggPSBwYXJzZWRDc24ubnVtYmVyO1xyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkQ3NuLmVuZE9mZnNldDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAocHJldmlvdXNNZXNzYWdlSGVhZGVyKSB7XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1JbmRleCA9IHByZXZpb3VzTWVzc2FnZUhlYWRlci5jb2Rlc3RyZWFtSW5kZXg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIDR0aCBWYmFzOiBNZXNzYWdlIG9mZnNldFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYXJzZWRPZmZzZXQgPSBzZWxmLnBhcnNlTnVtYmVySW5WYmFzKG1lc3NhZ2UsIGN1cnJlbnRPZmZzZXQpO1xyXG4gICAgICAgIHZhciBtZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydCA9IHBhcnNlZE9mZnNldC5udW1iZXI7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCA9IHBhcnNlZE9mZnNldC5lbmRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gNXRoIFZiYXM6IE1lc3NhZ2UgbGVuZ3RoXHJcblxyXG4gICAgICAgIHZhciBwYXJzZWRMZW5ndGggPSBzZWxmLnBhcnNlTnVtYmVySW5WYmFzKG1lc3NhZ2UsIGN1cnJlbnRPZmZzZXQpO1xyXG4gICAgICAgIHZhciBtZXNzYWdlQm9keUxlbmd0aCA9IHBhcnNlZExlbmd0aC5udW1iZXI7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCA9IHBhcnNlZExlbmd0aC5lbmRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gNnRoIG9wdGlvbmFsIFZiYXM6IEF1eFxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEEuMi4yXHJcbiAgICAgICAgdmFyIGhhc0F1eFZiYXMgPSAhIShjbGFzc0lkICYgc2VsZi5MU0JfTUFTSyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGF1eDtcclxuICAgICAgICBpZiAoaGFzQXV4VmJhcykge1xyXG4gICAgICAgICAgICB2YXIgcGFyc2VkQXV4ID0gc2VsZi5wYXJzZU51bWJlckluVmJhcyhtZXNzYWdlLCBjdXJyZW50T2Zmc2V0KTtcclxuICAgICAgICAgICAgYXV4ID0gcGFyc2VkQXV4Lm51bWJlcjtcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCA9IHBhcnNlZEF1eC5lbmRPZmZzZXQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJldHVyblxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIGlzTGFzdEJ5dGVJbkRhdGFiaW46IGlzTGFzdEJ5dGVJbkRhdGFiaW4sXHJcbiAgICAgICAgICAgIGluQ2xhc3NJZDogaW5DbGFzc0lkLFxyXG4gICAgICAgICAgICBib2R5U3RhcnQ6IGN1cnJlbnRPZmZzZXQsXHJcbiAgICAgICAgICAgIGNsYXNzSWQ6IGNsYXNzSWQsXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1JbmRleDogY29kZXN0cmVhbUluZGV4LFxyXG4gICAgICAgICAgICBtZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydDogbWVzc2FnZU9mZnNldEZyb21EYXRhYmluU3RhcnQsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VCb2R5TGVuZ3RoOiBtZXNzYWdlQm9keUxlbmd0aFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGhhc0F1eFZiYXMpIHtcclxuICAgICAgICAgICAgcmVzdWx0LmF1eCA9IGF1eDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGdldEludDMyOiBmdW5jdGlvbiBnZXRJbnQzMkNsb3N1cmUoZGF0YSwgb2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIG1zYiA9IGRhdGFbb2Zmc2V0XSAqIE1hdGgucG93KDIsIDI0KTsgLy8gQXZvaWQgbmVnYXRpdmUgcmVzdWx0IGR1ZSB0byBzaWduZWQgY2FsY3VsYXRpb25cclxuICAgICAgICB2YXIgYnl0ZTIgPSBkYXRhW29mZnNldCArIDFdIDw8IDE2O1xyXG4gICAgICAgIHZhciBieXRlMSA9IGRhdGFbb2Zmc2V0ICsgMl0gPDwgODtcclxuICAgICAgICB2YXIgbHNiID0gZGF0YVtvZmZzZXQgKyAzXTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbXNiICsgYnl0ZTIgKyBieXRlMSArIGxzYjtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgZ2V0SW50MTY6IGZ1bmN0aW9uIGdldEludDE2Q2xvc3VyZShkYXRhLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgbXNiID0gZGF0YVtvZmZzZXRdIDw8IDg7XHJcbiAgICAgICAgdmFyIGxzYiA9IGRhdGFbb2Zmc2V0ICsgMV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IG1zYiArIGxzYjtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBqcGlwTWVzc2FnZUhlYWRlclBhcnNlcjsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBSZWNvbm5lY3RhYmxlUmVxdWVzdGVyKFxyXG4gICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCwgXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgZGF0YWJpbnNTYXZlcixcclxuICAgIGpwaXBGYWN0b3J5LFxyXG4gICAgLy8gTk9URTogTW92ZSBwYXJhbWV0ZXIgdG8gYmVnaW5uaW5nIGFuZCBleHBvc2UgaW4gQ29kZXN0cmVhbUNsaWVudFxyXG4gICAgbWF4SnBpcENhY2hlU2l6ZUNvbmZpZykge1xyXG4gICAgXHJcbiAgICB2YXIgTUIgPSAxMDQ4NTc2O1xyXG4gICAgdmFyIG1heEpwaXBDYWNoZVNpemUgPSBtYXhKcGlwQ2FjaGVTaXplQ29uZmlnIHx8ICgxMCAqIE1CKTtcclxuICAgIFxyXG4gICAgdmFyIHNlc3Npb25XYWl0aW5nRm9yUmVhZHk7XHJcbiAgICB2YXIgYWN0aXZlU2Vzc2lvbiA9IG51bGw7XHJcbiAgICB2YXIgc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0ID0gbnVsbDtcclxuICAgIFxyXG4gICAgdmFyIHVybCA9IG51bGw7XHJcbiAgICB2YXIgd2FpdGluZ0ZvckNsb3NlU2Vzc2lvbnMgPSAwO1xyXG4gICAgXHJcbiAgICB2YXIgbm9uRGVkaWNhdGVkUmVxdWVzdHNXYWl0aW5nRm9yU2VuZCA9IFtdO1xyXG4gICAgdmFyIGRlZGljYXRlZENoYW5uZWxzID0gW107XHJcbiAgICBcclxuICAgIHZhciBzdGF0dXNDYWxsYmFjayA9IG51bGw7XHJcbiAgICB2YXIgbGFzdENsb3NlZENhbGxiYWNrID0gbnVsbDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJc1JlYWR5ID0gZnVuY3Rpb24gZ2V0SXNSZWFkeSgpIHtcclxuICAgICAgICByZXR1cm4gYWN0aXZlU2Vzc2lvbiAhPT0gbnVsbCAmJiBhY3RpdmVTZXNzaW9uLmdldElzUmVhZHkoKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMub3BlbiA9IGZ1bmN0aW9uIG9wZW4oYmFzZVVybCkge1xyXG4gICAgICAgIGlmIChiYXNlVXJsID09PSB1bmRlZmluZWQgfHwgYmFzZVVybCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oJ2Jhc2VVcmwnLCBiYXNlVXJsKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHVybCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdJbWFnZSB3YXMgYWxyZWFkeSBvcGVuZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdXJsID0gYmFzZVVybDtcclxuICAgICAgICBjcmVhdGVJbnRlcm5hbFNlc3Npb24oKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2xvc2UgPSBmdW5jdGlvbiBjbG9zZShjbG9zZWRDYWxsYmFjaykge1xyXG4gICAgICAgIGlmIChsYXN0Q2xvc2VkQ2FsbGJhY2sgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oJ2Nsb3NlZCB0d2ljZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsYXN0Q2xvc2VkQ2FsbGJhY2sgPSBjbG9zZWRDYWxsYmFjaztcclxuICAgICAgICB3YWl0aW5nRm9yQ2xvc2VTZXNzaW9ucyA9IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2xvc2VJbnRlcm5hbFNlc3Npb24oYWN0aXZlU2Vzc2lvbik7XHJcbiAgICAgICAgY2xvc2VJbnRlcm5hbFNlc3Npb24oc2Vzc2lvbldhaXRpbmdGb3JSZWFkeSk7XHJcbiAgICAgICAgY2xvc2VJbnRlcm5hbFNlc3Npb24oc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0KTtcclxuICAgICAgICBcclxuICAgICAgICBjaGVja0lmQWxsU2Vzc2lvbnNDbG9zZWRBZnRlclNlc3Npb25DbG9zZWQoKTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5zZXRTdGF0dXNDYWxsYmFjayA9IGZ1bmN0aW9uIHNldFN0YXR1c0NhbGxiYWNrKG5ld1N0YXR1c0NhbGxiYWNrKSB7XHJcbiAgICAgICAgc3RhdHVzQ2FsbGJhY2sgPSBuZXdTdGF0dXNDYWxsYmFjaztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYWN0aXZlU2Vzc2lvbiAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBhY3RpdmVTZXNzaW9uLnNldFN0YXR1c0NhbGxiYWNrKG5ld1N0YXR1c0NhbGxiYWNrKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmRlZGljYXRlQ2hhbm5lbEZvck1vdmFibGVSZXF1ZXN0ID1cclxuICAgICAgICBmdW5jdGlvbiBkZWRpY2F0ZUNoYW5uZWxGb3JNb3ZhYmxlUmVxdWVzdCgpIHtcclxuXHJcbiAgICAgICAgY2hlY2tSZWFkeSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlID0geyBpbnRlcm5hbERlZGljYXRlZENoYW5uZWw6IG51bGwgfTtcclxuICAgICAgICBkZWRpY2F0ZWRDaGFubmVscy5wdXNoKGRlZGljYXRlZENoYW5uZWxIYW5kbGUpO1xyXG4gICAgICAgIGNyZWF0ZUludGVybmFsRGVkaWNhdGVkQ2hhbm5lbChkZWRpY2F0ZWRDaGFubmVsSGFuZGxlKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucmVxdWVzdERhdGEgPSBmdW5jdGlvbiByZXF1ZXN0RGF0YShcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICBmYWlsdXJlQ2FsbGJhY2ssXHJcbiAgICAgICAgbnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlVG9Nb3ZlKSB7XHJcblxyXG4gICAgICAgIGNoZWNrUmVhZHkoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVxdWVzdCA9IHtcclxuICAgICAgICAgICAgaXNFbmRlZDogZmFsc2UsXHJcbiAgICAgICAgICAgIGludGVybmFsUmVxdWVzdDogbnVsbCxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zOiBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxyXG4gICAgICAgICAgICBmYWlsdXJlQ2FsbGJhY2s6IGZhaWx1cmVDYWxsYmFjayxcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyczogbnVtUXVhbGl0eUxheWVyc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjaGFubmVsO1xyXG4gICAgICAgIHZhciBtb3ZlRGVkaWNhdGVkQ2hhbm5lbCA9ICEhZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZVRvTW92ZTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobW92ZURlZGljYXRlZENoYW5uZWwpIHtcclxuICAgICAgICAgICAgY2hhbm5lbCA9IGRlZGljYXRlZENoYW5uZWxIYW5kbGVUb01vdmUuaW50ZXJuYWxEZWRpY2F0ZWRDaGFubmVsO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNoYW5uZWwgPSBhY3RpdmVTZXNzaW9uLnRyeUdldENoYW5uZWwoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChjaGFubmVsID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBub25EZWRpY2F0ZWRSZXF1ZXN0c1dhaXRpbmdGb3JTZW5kLnB1c2gocmVxdWVzdCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVxdWVzdDtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaGFubmVsLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0V4cGVjdGVkIG5vbi1tb3ZhYmxlIGNoYW5uZWwnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbC5nZXRJc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0KCkgIT09IG1vdmVEZWRpY2F0ZWRDaGFubmVsKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ2dldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QgaW5jb25zaXN0ZW5jeScpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmVxdWVzdC5pbnRlcm5hbFJlcXVlc3QgPSBjaGFubmVsLnJlcXVlc3REYXRhKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAgICAgICAgIGZhaWx1cmVDYWxsYmFjayxcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVycyk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5zdG9wUmVxdWVzdEFzeW5jID0gZnVuY3Rpb24gc3RvcFJlcXVlc3RBc3luYyhyZXF1ZXN0KSB7XHJcbiAgICAgICAgcmVxdWVzdC5pc0VuZGVkID0gdHJ1ZTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocmVxdWVzdC5pbnRlcm5hbFJlcXVlc3QgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmVxdWVzdC5pbnRlcm5hbFJlcXVlc3Quc3RvcFJlcXVlc3RBc3luYygpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucmVjb25uZWN0ID0gcmVjb25uZWN0O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiByZWNvbm5lY3QoKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb25XYWl0aW5nRm9yUmVhZHkgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnUHJldmlvdXMgc2Vzc2lvbiBzdGlsbCBub3QgZXN0YWJsaXNoZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBpZiAoc3RhdHVzQ2FsbGJhY2sgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHN0YXR1c0NhbGxiYWNrKHtcclxuICAgICAgICAgICAgICAgICAgICBpc1JlYWR5OiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIGV4Y2VwdGlvbjogLy9qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnUHJldmlvdXMgc2Vzc2lvbiB0aGF0IHNob3VsZCBiZSBjbG9zZWQgc3RpbGwgYWxpdmUuJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdNYXliZSBvbGQgcmVxdWVzdENvbnRleHRzIGhhdmUgbm90IGJlZWQgY2xvc2VkLiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ1JlY29ubmVjdCB3aWxsIG5vdCBiZSBkb25lJyAvLyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlci5jbGVhbnVwVW5yZWdpc3RlcmVkRGF0YWJpbnMoKTtcclxuICAgICAgICBjcmVhdGVJbnRlcm5hbFNlc3Npb24oKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlSW50ZXJuYWxTZXNzaW9uKCkge1xyXG4gICAgICAgIHZhciB0YXJnZXRJZDtcclxuICAgICAgICBpZiAoYWN0aXZlU2Vzc2lvbiAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0YXJnZXRJZCA9IGFjdGl2ZVNlc3Npb24uZ2V0VGFyZ2V0SWQoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbldhaXRpbmdGb3JSZWFkeSA9IGpwaXBGYWN0b3J5LmNyZWF0ZVNlc3Npb24oXHJcbiAgICAgICAgICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCxcclxuICAgICAgICAgICAgdGFyZ2V0SWQsXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBzZXNzaW9uV2FpdGluZ0ZvclJlYWR5LnNldFN0YXR1c0NhbGxiYWNrKHdhaXRpbmdGb3JSZWFkeUNhbGxiYWNrKTtcclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uV2FpdGluZ0ZvclJlYWR5Lm9wZW4odXJsKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlSW50ZXJuYWxEZWRpY2F0ZWRDaGFubmVsKGRlZGljYXRlZENoYW5uZWxIYW5kbGUpIHtcclxuICAgICAgICB2YXIgY2hhbm5lbCA9IGFjdGl2ZVNlc3Npb24udHJ5R2V0Q2hhbm5lbChcclxuICAgICAgICAgICAgLypkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0PSovdHJ1ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNoYW5uZWwgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnVG9vIG1hbnkgY29uY3VycmVudCByZXF1ZXN0cy4gTGltaXQgdGhlIHVzZSBvZiBkZWRpY2F0ZWQgJyArXHJcbiAgICAgICAgICAgICAgICAnKG1vdmFibGUpIHJlcXVlc3RzLCBlbmxhcmdlIG1heENoYW5uZWxzSW5TZXNzaW9uIG9yIHdhaXQgJyArXHJcbiAgICAgICAgICAgICAgICAnZm9yIHJlcXVlc3RzIHRvIGZpbmlzaCBhbmQgYXZvaWQgY3JlYXRlIG5ldyBvbmVzJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghY2hhbm5lbC5nZXRJc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0KCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCBpbmNvbnNpc3RlbmN5Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlLmludGVybmFsRGVkaWNhdGVkQ2hhbm5lbCA9IGNoYW5uZWw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHdhaXRpbmdGb3JSZWFkeUNhbGxiYWNrKHN0YXR1cykge1xyXG4gICAgICAgIGlmIChzZXNzaW9uV2FpdGluZ0ZvclJlYWR5ID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgIHN0YXR1cy5pc1JlYWR5ICE9PSBzZXNzaW9uV2FpdGluZ0ZvclJlYWR5LmdldElzUmVhZHkoKSkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ1VuZXhwZWN0ZWQgJyArXHJcbiAgICAgICAgICAgICAgICAnc3RhdHVzQ2FsbGJhY2sgd2hlbiBub3QgcmVnaXN0ZXJlZCB0byBzZXNzaW9uIG9yICcgK1xyXG4gICAgICAgICAgICAgICAgJ2luY29uc2lzdGVudCBpc1JlYWR5Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzdGF0dXMuaXNSZWFkeSkge1xyXG4gICAgICAgICAgICBpZiAoc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0IHNob3VsZCBiZSBudWxsJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdCA9IGFjdGl2ZVNlc3Npb247XHJcbiAgICAgICAgICAgIGFjdGl2ZVNlc3Npb24gPSBzZXNzaW9uV2FpdGluZ0ZvclJlYWR5O1xyXG4gICAgICAgICAgICBzZXNzaW9uV2FpdGluZ0ZvclJlYWR5ID0gbnVsbDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdC5zZXRTdGF0dXNDYWxsYmFjayhudWxsKTtcclxuICAgICAgICAgICAgICAgIGlmICghdHJ5RGlzY29ubmVjdFdhaXRpbmdTZXNzaW9uKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3Quc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2soXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeURpc2Nvbm5lY3RXYWl0aW5nU2Vzc2lvbik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGFjdGl2ZVNlc3Npb24uc2V0U3RhdHVzQ2FsbGJhY2soc3RhdHVzQ2FsbGJhY2spO1xyXG4gICAgICAgICAgICBhY3RpdmVTZXNzaW9uLnNldFJlcXVlc3RFbmRlZENhbGxiYWNrKGFjdGl2ZVNlc3Npb25SZXF1ZXN0RW5kZWRDYWxsYmFjayk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlZGljYXRlZENoYW5uZWxzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICBjcmVhdGVJbnRlcm5hbERlZGljYXRlZENoYW5uZWwoZGVkaWNhdGVkQ2hhbm5lbHNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzdGF0dXNDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzdGF0dXNDYWxsYmFjayhzdGF0dXMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2xvc2VJbnRlcm5hbFNlc3Npb24oc2Vzc2lvbikge1xyXG4gICAgICAgIGlmIChzZXNzaW9uICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICsrd2FpdGluZ0ZvckNsb3NlU2Vzc2lvbnM7XHJcbiAgICAgICAgICAgIHNlc3Npb24uY2xvc2UoY2hlY2tJZkFsbFNlc3Npb25zQ2xvc2VkQWZ0ZXJTZXNzaW9uQ2xvc2VkKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNoZWNrSWZBbGxTZXNzaW9uc0Nsb3NlZEFmdGVyU2Vzc2lvbkNsb3NlZCgpIHtcclxuICAgICAgICAtLXdhaXRpbmdGb3JDbG9zZVNlc3Npb25zO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh3YWl0aW5nRm9yQ2xvc2VTZXNzaW9ucyA9PT0gMCAmJiBsYXN0Q2xvc2VkQ2FsbGJhY2sgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBsYXN0Q2xvc2VkQ2FsbGJhY2soKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNoZWNrUmVhZHkoKSB7XHJcbiAgICAgICAgaWYgKGFjdGl2ZVNlc3Npb24gPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ1RoaXMgb3BlcmF0aW9uICcgK1xyXG4gICAgICAgICAgICAgICAgJ2lzIGZvcmJpZGRlbiB3aGVuIHNlc3Npb24gaXMgbm90IHJlYWR5Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhY3RpdmVTZXNzaW9uUmVxdWVzdEVuZGVkQ2FsbGJhY2soY2hhbm5lbEZyZWVkKSB7XHJcbiAgICAgICAgdmFyIHJlcXVlc3QgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChkYXRhYmluc1NhdmVyLmdldExvYWRlZEJ5dGVzKCkgPiBtYXhKcGlwQ2FjaGVTaXplKSB7XHJcbiAgICAgICAgICAgIHJlY29ubmVjdCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbEZyZWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNoYW5uZWxGcmVlZC5nZXRJc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0KCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnRXhwZWN0ZWQgbm9uLW1vdmFibGUgY2hhbm5lbCBhcyBjaGFubmVsRnJlZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBpZiAobm9uRGVkaWNhdGVkUmVxdWVzdHNXYWl0aW5nRm9yU2VuZC5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHJlcXVlc3QgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlcXVlc3QgPSBub25EZWRpY2F0ZWRSZXF1ZXN0c1dhaXRpbmdGb3JTZW5kLnNoaWZ0KCk7XHJcbiAgICAgICAgICAgIGlmIChyZXF1ZXN0LmludGVybmFsUmVxdWVzdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ1JlcXVlc3Qgd2FzICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdhbHJlYWR5IHNlbnQgYnV0IHN0aWxsIGluIHF1ZXVlJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IHdoaWxlIChyZXF1ZXN0LmlzRW5kZWQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXF1ZXN0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3QuaW50ZXJuYWxSZXF1ZXN0ID0gY2hhbm5lbEZyZWVkLnJlcXVlc3REYXRhKFxyXG4gICAgICAgICAgICAgICAgcmVxdWVzdC5jb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICAgICAgICAgIHJlcXVlc3QuY2FsbGJhY2ssXHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0LmZhaWx1cmVDYWxsYmFjayxcclxuICAgICAgICAgICAgICAgIHJlcXVlc3QubnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0cnlEaXNjb25uZWN0V2FpdGluZ1Nlc3Npb24oKSB7XHJcbiAgICAgICAgdmFyIGNhbkNsb3NlU2Vzc2lvbiA9ICFzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QuaGFzQWN0aXZlUmVxdWVzdHMoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2FuQ2xvc2VTZXNzaW9uKSB7XHJcbiAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdC5jbG9zZSgpO1xyXG4gICAgICAgICAgICBzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY2FuQ2xvc2VTZXNzaW9uO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcFJlcXVlc3QoXHJcbiAgICBzZXNzaW9uSGVscGVyLFxyXG4gICAgbWVzc2FnZUhlYWRlclBhcnNlcixcclxuICAgIGNoYW5uZWwsXHJcbiAgICByZXF1ZXN0VXJsLFxyXG4gICAgY2FsbGJhY2ssXHJcbiAgICBmYWlsdXJlQ2FsbGJhY2spIHtcclxuICAgIFxyXG4gICAgdmFyIEtCID0gMTAyNDtcclxuICAgIHZhciBQUk9HUkVTU0lWRU5FU1NfTUlOX0xFTkdUSF9CWVRFUyA9IDEwICogS0I7XHJcblxyXG4gICAgdmFyIFJFU1BPTlNFX0VOREVEX1NVQ0NFU1MgPSAxO1xyXG4gICAgdmFyIFJFU1BPTlNFX0VOREVEX0FCT1JURUQgPSAyO1xyXG4gICAgdmFyIFJFU1BPTlNFX0VOREVEX1NFTlRfQU5PVEhFUl9NRVNTQUdFID0gMztcclxuICAgIFxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgdmFyIGlzQWN0aXZlID0gZmFsc2U7XHJcbiAgICB2YXIgZW5kZWRCeVVzZXIgPSBmYWxzZTtcclxuICAgIHZhciBsYXN0UmVxdWVzdElkO1xyXG4gICAgdmFyIHJlc3BvbnNlTGVuZ3RoID0gUFJPR1JFU1NJVkVORVNTX01JTl9MRU5HVEhfQllURVM7XHJcbiAgICBcclxuICAgIHRoaXMuc3RhcnRSZXF1ZXN0ID0gZnVuY3Rpb24gc3RhcnRSZXF1ZXN0KCkge1xyXG4gICAgICAgIGlmIChpc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdzdGFydFJlcXVlc3QgY2FsbGVkIHR3aWNlJyk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChlbmRlZEJ5VXNlcikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdyZXF1ZXN0IHdhcyBhbHJlYWR5IHN0b3BwZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaXNBY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHNlc3Npb25IZWxwZXIucmVxdWVzdFN0YXJ0ZWQoKTtcclxuICAgICAgICBcclxuICAgICAgICBzZW5kTWVzc2FnZU9mRGF0YVJlcXVlc3QoKTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5zdG9wUmVxdWVzdEFzeW5jID0gZnVuY3Rpb24gc3RvcFJlcXVlc3RBc3luYyhyZXF1ZXN0KSB7XHJcbiAgICAgICAgZW5kZWRCeVVzZXIgPSB0cnVlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMYXN0UmVxdWVzdElkID0gZnVuY3Rpb24gZ2V0TGFzdFJlcXVlc3RJZCgpIHtcclxuICAgICAgICBpZiAoIWlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ1VuZXhwZWN0ZWQgY2FsbCB0byBnZXRMYXN0UmVxdWVzdElkIG9uIGluYWN0aXZlIHJlcXVlc3QnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGxhc3RSZXF1ZXN0SWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNhbGxDYWxsYmFja0FmdGVyQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGNhbGxDYWxsYmFja0FmdGVyQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2FsbGJhY2soc2VsZiwgLyppc1Jlc3BvbnNlRG9uZT0qL3RydWUpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW50ZXJuYWxTdWNjZXNzQ2FsbGJhY2soYWpheFJlc3BvbnNlLCBpc1Jlc3BvbnNlRG9uZSkge1xyXG4gICAgICAgIHZhciBmYWlsZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdmFyIGVuZGVkUmVhc29uID0gcHJvY2Vzc0FqYXhSZXNwb25zZShhamF4UmVzcG9uc2UsIGlzUmVzcG9uc2VEb25lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChlbmRlZFJlYXNvbiA9PT0gUkVTUE9OU0VfRU5ERURfU0VOVF9BTk9USEVSX01FU1NBR0UpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZmFpbGVkID0gZW5kZWRSZWFzb24gPT09IFJFU1BPTlNFX0VOREVEX0FCT1JURUQ7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBmYWlsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpZiAoIWZhaWxlZCkge1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci53YWl0Rm9yQ29uY3VycmVudFJlcXVlc3RzVG9FbmQoc2VsZik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNoYW5uZWwucmVxdWVzdEVuZGVkKGFqYXhSZXNwb25zZSwgc2VsZik7XHJcblxyXG4gICAgICAgICAgICBpZiAoZmFpbGVkICYmICFlbmRlZEJ5VXNlciAmJiBmYWlsdXJlQ2FsbGJhY2sgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIuY2hlY2tDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCgpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5vbkV4Y2VwdGlvbihlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGludGVybmFsRmFpbHVyZUNhbGxiYWNrKGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgIGNoYW5uZWwucmVxdWVzdEVuZGVkKGFqYXhSZXNwb25zZSwgc2VsZik7XHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5jaGVja0NvbmN1cnJlbnRSZXF1ZXN0c0ZpbmlzaGVkKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGZhaWx1cmVDYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGZhaWx1cmVDYWxsYmFjaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gcHJvY2Vzc0FqYXhSZXNwb25zZShhamF4UmVzcG9uc2UsIGlzUmVzcG9uc2VEb25lKSB7XHJcbiAgICAgICAgaWYgKCFpc1Jlc3BvbnNlRG9uZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignQUpBWCAnICtcclxuICAgICAgICAgICAgICAgICdjYWxsYmFjayBjYWxsZWQgYWx0aG91Z2ggcmVzcG9uc2UgaXMgbm90IGRvbmUgeWV0ICcgK1xyXG4gICAgICAgICAgICAgICAgJ2FuZCBjaHVua2VkIGVuY29kaW5nIGlzIG5vdCBlbmFibGVkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIGNyZWF0ZWRDaGFubmVsID0gc2Vzc2lvbkhlbHBlci5nZXRDcmVhdGVkQ2hhbm5lbElkKFxyXG4gICAgICAgICAgICBhamF4UmVzcG9uc2UpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjcmVhdGVkQ2hhbm5lbCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBpZiAoY2hhbm5lbC5nZXRDaGFubmVsSWQoKSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5vbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdDaGFubmVsIGNyZWF0ZWQgYWx0aG91Z2ggd2FzIG5vdCByZXF1ZXN0ZWQnLCAnRC4yLjMnKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjaGFubmVsLnNldENoYW5uZWxJZChjcmVhdGVkQ2hhbm5lbCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGNoYW5uZWwuZ2V0Q2hhbm5lbElkKCkgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5vbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgIG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ2Fubm90IGV4dHJhY3QgY2lkIGZyb20gY25ldyByZXNwb25zZScsICdELjIuMycpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGVuZE9mZnNldCA9IHNhdmVUb0RhdGFiaW5zRnJvbU9mZnNldChhamF4UmVzcG9uc2UpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChlbmRPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFJFU1BPTlNFX0VOREVEX0FCT1JURUQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBlbmRlZFJlYXNvbiA9IHBhcnNlRW5kT2ZSZXNwb25zZShhamF4UmVzcG9uc2UsIGVuZE9mZnNldCk7XHJcbiAgICAgICAgcmV0dXJuIGVuZGVkUmVhc29uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBzZW5kTWVzc2FnZU9mRGF0YVJlcXVlc3QoKSB7XHJcbiAgICAgICAgbGFzdFJlcXVlc3RJZCA9IGNoYW5uZWwubmV4dFJlcXVlc3RJZCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB1cmwgPSByZXF1ZXN0VXJsICtcclxuICAgICAgICAgICAgJyZsZW49JyArIHJlc3BvbnNlTGVuZ3RoICtcclxuICAgICAgICAgICAgJyZxaWQ9JyArIGxhc3RSZXF1ZXN0SWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVzcG9uc2VMZW5ndGggKj0gMjtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2hvdWxkQ3JlYXRlQ2hhbm5lbCA9IGNoYW5uZWwuZ2V0Q2hhbm5lbElkKCkgPT09IG51bGw7XHJcbiAgICAgICAgaWYgKHNob3VsZENyZWF0ZUNoYW5uZWwpIHtcclxuICAgICAgICAgICAgdXJsICs9ICcmY25ldz1odHRwJztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBleGlzdENoYW5uZWxJblNlc3Npb24gPSBzZXNzaW9uSGVscGVyLmdldEZpcnN0Q2hhbm5lbCgpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChleGlzdENoYW5uZWxJblNlc3Npb24gIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHVybCArPSAnJmNpZD0nICsgZXhpc3RDaGFubmVsSW5TZXNzaW9uLmdldENoYW5uZWxJZCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBOT1RFOiBJZiBleGlzdENoYW5uZWxJblNlc3Npb24sIG1heWJlIHNob3VsZCByZW1vdmUgXCImc3RyZWFtPTBcIlxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHVybCArPSAnJmNpZD0nICsgY2hhbm5lbC5nZXRDaGFubmVsSWQoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5zZW5kQWpheChcclxuICAgICAgICAgICAgdXJsLFxyXG4gICAgICAgICAgICBpbnRlcm5hbFN1Y2Nlc3NDYWxsYmFjayxcclxuICAgICAgICAgICAgaW50ZXJuYWxGYWlsdXJlQ2FsbGJhY2spO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwYXJzZUVuZE9mUmVzcG9uc2UoYWpheFJlc3BvbnNlLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgZW5kUmVzcG9uc2VSZXN1bHQgPSBSRVNQT05TRV9FTkRFRF9BQk9SVEVEO1xyXG4gICAgICAgIHZhciBieXRlcyA9IG5ldyBVaW50OEFycmF5KGFqYXhSZXNwb25zZS5yZXNwb25zZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG9mZnNldCA+IGJ5dGVzLmxlbmd0aCAtIDIgfHxcclxuICAgICAgICAgICAgYnl0ZXNbb2Zmc2V0XSAhPT0gMCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdDb3VsZCBub3QgZmluZCAnICtcclxuICAgICAgICAgICAgICAgICdFbmQgT2YgUmVzcG9uc2UgKEVPUikgY29kZSBhdCB0aGUgZW5kIG9mIHJlc3BvbnNlJywgJ0QuMycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzd2l0Y2ggKGJ5dGVzW29mZnNldCArIDFdKSB7XHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLklNQUdFX0RPTkU6XHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLldJTkRPV19ET05FOlxyXG4gICAgICAgICAgICBjYXNlIGpHbG9iYWxzLmpwaXBFbmRPZlJlc3BvbnNlUmVhc29ucy5RVUFMSVRZX0xJTUlUOlxyXG4gICAgICAgICAgICAgICAgZW5kUmVzcG9uc2VSZXN1bHQgPSBSRVNQT05TRV9FTkRFRF9TVUNDRVNTO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIGpHbG9iYWxzLmpwaXBFbmRPZlJlc3BvbnNlUmVhc29ucy5XSU5ET1dfQ0hBTkdFOlxyXG4gICAgICAgICAgICAgICAgaWYgKCFlbmRlZEJ5VXNlcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnU2VydmVyIHJlc3BvbnNlIHdhcyB0ZXJtaW5hdGVkIGR1ZSB0byBuZXdlciAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3JlcXVlc3QgaXNzdWVkIG9uIHNhbWUgY2hhbm5lbC4gVGhhdCBtYXkgYmUgYW4gJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdpbnRlcm5hbCB3ZWJqcGlwLmpzIGVycm9yIC0gQ2hlY2sgdGhhdCBtb3ZhYmxlICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAncmVxdWVzdHMgYXJlIHdlbGwgbWFpbnRhaW5lZCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIGpHbG9iYWxzLmpwaXBFbmRPZlJlc3BvbnNlUmVhc29ucy5CWVRFX0xJTUlUOlxyXG4gICAgICAgICAgICBjYXNlIGpHbG9iYWxzLmpwaXBFbmRPZlJlc3BvbnNlUmVhc29ucy5SRVNQT05TRV9MSU1JVDpcclxuICAgICAgICAgICAgICAgIGlmICghZW5kZWRCeVVzZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZW5kTWVzc2FnZU9mRGF0YVJlcXVlc3QoKTtcclxuICAgICAgICAgICAgICAgICAgICBlbmRSZXNwb25zZVJlc3VsdCA9IFJFU1BPTlNFX0VOREVEX1NFTlRfQU5PVEhFUl9NRVNTQUdFO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLlNFU1NJT05fTElNSVQ6XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnU2VydmVyIHJlc291cmNlcyBhc3NvY2lhdGVkIHdpdGggdGhlIHNlc3Npb24gaXMgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdsaW1pdHRlZCwgbm8gZnVydGhlciByZXF1ZXN0cyBzaG91bGQgYmUgaXNzdWVkIHRvICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAndGhpcyBzZXNzaW9uJykpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIGpHbG9iYWxzLmpwaXBFbmRPZlJlc3BvbnNlUmVhc29ucy5OT05fU1BFQ0lGSUVEOlxyXG4gICAgICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5vbkV4Y2VwdGlvbihuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnU2VydmVyIGVycm9yIHRlcm1pbmF0ZWQgcmVzcG9uc2Ugd2l0aCBubyByZWFzb24gc3BlY2lmaWVkJykpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ1NlcnZlciByZXNwb25kZWQgd2l0aCBpbGxlZ2FsIEVuZCBPZiBSZXNwb25zZSAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyhFT1IpIGNvZGU6ICcgKyBieXRlc1tvZmZzZXQgKyAxXSkpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBlbmRSZXNwb25zZVJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc2F2ZVRvRGF0YWJpbnNGcm9tT2Zmc2V0KGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHZhciBieXRlcyA9IG5ldyBVaW50OEFycmF5KGFqYXhSZXNwb25zZS5yZXNwb25zZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gMDtcclxuICAgICAgICAgICAgdmFyIHByZXZpb3VzSGVhZGVyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgd2hpbGUgKG9mZnNldCA8IGJ5dGVzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGJ5dGVzW29mZnNldF0gPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBFbmQgT2YgUmVzcG9uc2UgKEVPUilcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGhlYWRlciA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIucGFyc2VNZXNzYWdlSGVhZGVyKFxyXG4gICAgICAgICAgICAgICAgICAgIGJ5dGVzLCBvZmZzZXQsIHByZXZpb3VzSGVhZGVyKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGhlYWRlci5ib2R5U3RhcnQgKyBoZWFkZXIubWVzc2FnZUJvZHlMZW5ndGggPiBieXRlcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLmdldERhdGFiaW5zU2F2ZXIoKS5zYXZlRGF0YShoZWFkZXIsIGJ5dGVzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgb2Zmc2V0ID0gaGVhZGVyLmJvZHlTdGFydCArIGhlYWRlci5tZXNzYWdlQm9keUxlbmd0aDtcclxuICAgICAgICAgICAgICAgIHByZXZpb3VzSGVhZGVyID0gaGVhZGVyO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gb2Zmc2V0O1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5vbkV4Y2VwdGlvbihlKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBTZXNzaW9uSGVscGVyKFxyXG4gICAgZGF0YVJlcXVlc3RVcmwsXHJcbiAgICBrbm93blRhcmdldElkLFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICBhamF4SGVscGVyKSB7XHJcbiAgICBcclxuICAgIHZhciBzdGF0dXNDYWxsYmFjayA9IG51bGw7XHJcbiAgICB2YXIgcmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSBudWxsO1xyXG4gICAgXHJcbiAgICB2YXIgY2hhbm5lbHMgPSBbXTtcclxuICAgIHZhciBmaXJzdENoYW5uZWwgPSBudWxsO1xyXG5cclxuICAgIHZhciBhY3RpdmVSZXF1ZXN0cyA9IDA7XHJcbiAgICB2YXIgd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0cyA9IFtdO1xyXG5cclxuICAgIHZhciBpc1JlYWR5ID0gZmFsc2U7XHJcbiAgICB2YXIgdGFyZ2V0SWQgPSBrbm93blRhcmdldElkIHx8ICcwJztcclxuICAgIFxyXG4gICAgdGhpcy5vbkV4Y2VwdGlvbiA9IGZ1bmN0aW9uIG9uRXhjZXB0aW9uKGV4Y2VwdGlvbikge1xyXG4gICAgICAgIG9uU3RhdHVzQ2hhbmdlKGV4Y2VwdGlvbik7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzUmVhZHkgPSBmdW5jdGlvbiBnZXRJc1JlYWR5KCkge1xyXG4gICAgICAgIHJldHVybiBpc1JlYWR5O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5zZXRJc1JlYWR5ID0gZnVuY3Rpb24gc2V0SXNSZWFkeShpc1JlYWR5Xykge1xyXG4gICAgICAgIGlzUmVhZHkgPSBpc1JlYWR5XztcclxuICAgICAgICBvblN0YXR1c0NoYW5nZSgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDb2Rlc3RyZWFtU3RydWN0dXJlID0gZnVuY3Rpb24gZ2V0Q29kZXN0cmVhbVN0cnVjdHVyZSgpIHtcclxuICAgICAgICByZXR1cm4gY29kZXN0cmVhbVN0cnVjdHVyZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RGF0YWJpbnNTYXZlciA9IGZ1bmN0aW9uIGdldERhdGFiaW5zU2F2ZXIoKSB7XHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW5zU2F2ZXI7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldERhdGFSZXF1ZXN0VXJsID0gZnVuY3Rpb24gZ2V0RGF0YVJlcXVlc3RVcmwoKSB7XHJcbiAgICAgICAgcmV0dXJuIGRhdGFSZXF1ZXN0VXJsO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUYXJnZXRJZCA9IGZ1bmN0aW9uIGdldFRhcmdldElkKCkge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXRJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RDaGFubmVsID0gZnVuY3Rpb24gZ2V0Rmlyc3RDaGFubmVsKCkge1xyXG4gICAgICAgIHJldHVybiBmaXJzdENoYW5uZWw7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldFN0YXR1c0NhbGxiYWNrID0gZnVuY3Rpb24gc2V0U3RhdHVzQ2FsbGJhY2soc3RhdHVzQ2FsbGJhY2tfKSB7XHJcbiAgICAgICAgc3RhdHVzQ2FsbGJhY2sgPSBzdGF0dXNDYWxsYmFja187XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldFJlcXVlc3RFbmRlZENhbGxiYWNrID0gZnVuY3Rpb24gc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2soXHJcbiAgICAgICAgcmVxdWVzdEVuZGVkQ2FsbGJhY2tfKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSByZXF1ZXN0RW5kZWRDYWxsYmFja187XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnJlcXVlc3RTdGFydGVkID0gZnVuY3Rpb24gcmVxdWVzdFN0YXJ0ZWQoKSB7XHJcbiAgICAgICAgKythY3RpdmVSZXF1ZXN0cztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucmVxdWVzdEVuZGVkID0gZnVuY3Rpb24gcmVxdWVzdEVuZGVkKGFqYXhSZXNwb25zZSwgY2hhbm5lbCkge1xyXG4gICAgICAgIC0tYWN0aXZlUmVxdWVzdHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRhcmdldElkRnJvbVNlcnZlciA9IGFqYXhSZXNwb25zZS5nZXRSZXNwb25zZUhlYWRlcignSlBJUC10aWQnKTtcclxuICAgICAgICBpZiAodGFyZ2V0SWRGcm9tU2VydmVyICE9PSAnJyAmJiB0YXJnZXRJZEZyb21TZXJ2ZXIgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgaWYgKHRhcmdldElkID09PSAnMCcpIHtcclxuICAgICAgICAgICAgICAgIHRhcmdldElkID0gdGFyZ2V0SWRGcm9tU2VydmVyO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldElkICE9PSB0YXJnZXRJZEZyb21TZXJ2ZXIpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnU2VydmVyIHJldHVybmVkIHVubWF0Y2hlZCB0YXJnZXQgSUQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZmlyc3RDaGFubmVsID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGZpcnN0Q2hhbm5lbCA9IGNoYW5uZWw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjaGFubmVsRnJlZWQgPSBjaGFubmVsLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSA/XHJcbiAgICAgICAgICAgIG51bGwgOiBjaGFubmVsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXF1ZXN0RW5kZWRDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFjayhjaGFubmVsRnJlZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0QWN0aXZlUmVxdWVzdHNDb3VudCA9IGZ1bmN0aW9uIGdldEFjdGl2ZVJlcXVlc3RzQ291bnQoKSB7XHJcbiAgICAgICAgcmV0dXJuIGFjdGl2ZVJlcXVlc3RzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5jaGFubmVsQ3JlYXRlZCA9IGZ1bmN0aW9uIGNoYW5uZWxDcmVhdGVkKGNoYW5uZWwpIHtcclxuICAgICAgICBjaGFubmVscy5wdXNoKGNoYW5uZWwpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDcmVhdGVkQ2hhbm5lbElkID0gZnVuY3Rpb24gZ2V0Q3JlYXRlZENoYW5uZWxJZChhamF4UmVzcG9uc2UpIHtcclxuICAgICAgICB2YXIgY25ld1Jlc3BvbnNlID0gYWpheFJlc3BvbnNlLmdldFJlc3BvbnNlSGVhZGVyKCdKUElQLWNuZXcnKTtcclxuICAgICAgICBpZiAoIWNuZXdSZXNwb25zZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGtleVZhbHVlUGFpcnNJblJlc3BvbnNlID0gY25ld1Jlc3BvbnNlLnNwbGl0KCcsJyk7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwga2V5VmFsdWVQYWlyc0luUmVzcG9uc2UubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIGtleUFuZFZhbHVlID0ga2V5VmFsdWVQYWlyc0luUmVzcG9uc2VbaV0uc3BsaXQoJz0nKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChrZXlBbmRWYWx1ZVswXSA9PT0gJ2NpZCcpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBrZXlBbmRWYWx1ZVsxXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMud2FpdEZvckNvbmN1cnJlbnRSZXF1ZXN0c1RvRW5kID1cclxuICAgICAgICBmdW5jdGlvbiB3YWl0Rm9yQ29uY3VycmVudFJlcXVlc3RzVG9FbmQocmVxdWVzdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb25jdXJyZW50UmVxdWVzdHMgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYW5uZWxzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHZhciByZXF1ZXN0cyA9IGNoYW5uZWxzW2ldLmdldFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlKCk7XHJcbiAgICAgICAgICAgIHZhciBudW1SZXF1ZXN0cyA9IHJlcXVlc3RzLmxlbmd0aDtcclxuICAgICAgICAgICAgaWYgKG51bVJlcXVlc3RzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGxhc3RSZXF1ZXN0SWQgPSByZXF1ZXN0c1swXS5nZXRMYXN0UmVxdWVzdElkKCk7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAxOyBqIDwgcmVxdWVzdHMubGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgICAgIGxhc3RSZXF1ZXN0SWQgPSBNYXRoLm1heChcclxuICAgICAgICAgICAgICAgICAgICBsYXN0UmVxdWVzdElkLCByZXF1ZXN0c1tqXS5nZXRMYXN0UmVxdWVzdElkKCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25jdXJyZW50UmVxdWVzdHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICBjaGFubmVsOiBjaGFubmVsc1tpXSxcclxuICAgICAgICAgICAgICAgIHJlcXVlc3RJZDogbGFzdFJlcXVlc3RJZFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHMucHVzaCh7XHJcbiAgICAgICAgICAgIHJlcXVlc3Q6IHJlcXVlc3QsXHJcbiAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0czogY29uY3VycmVudFJlcXVlc3RzXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmNoZWNrQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGNoZWNrQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcclxuICAgICAgICAgICAgdmFyIGlzQWxsQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgdmFyIGNvbmN1cnJlbnRSZXF1ZXN0cyA9XHJcbiAgICAgICAgICAgICAgICB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzW2ldLmNvbmN1cnJlbnRSZXF1ZXN0cztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBjb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoIC0gMTsgaiA+PSAwOyAtLWopIHtcclxuICAgICAgICAgICAgICAgIHZhciB3YWl0aW5nID0gY29uY3VycmVudFJlcXVlc3RzW2pdO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAod2FpdGluZy5jaGFubmVsLmlzQWxsT2xkUmVxdWVzdHNFbmRlZCh3YWl0aW5nLnJlcXVlc3RJZCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25jdXJyZW50UmVxdWVzdHNbal0gPSBjb25jdXJyZW50UmVxdWVzdHNbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgICAgICAgICBjb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChjb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciByZXF1ZXN0ID0gd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0c1tpXS5yZXF1ZXN0O1xyXG4gICAgICAgICAgICB2YXIgY2FsbGJhY2sgPSByZXF1ZXN0LmNhbGxiYWNrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0c1tpXSA9IHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHNbXHJcbiAgICAgICAgICAgICAgICB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzLmxlbmd0aCAtPSAxO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVxdWVzdC5jYWxsQ2FsbGJhY2tBZnRlckNvbmN1cnJlbnRSZXF1ZXN0c0ZpbmlzaGVkKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5zZW5kQWpheCA9IGZ1bmN0aW9uIHNlbmRBamF4KFxyXG4gICAgICAgIHVybCxcclxuICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICBmYWlsdXJlQ2FsbGJhY2spIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZm9ya2VkRmFpbHVyZUNhbGxiYWNrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmYWlsdXJlQ2FsbGJhY2spIHtcclxuICAgICAgICAgICAgZm9ya2VkRmFpbHVyZUNhbGxiYWNrID0gZnVuY3Rpb24gZm9ya0ZhaWx1cmVDYWxsYmFjayhhamF4UmVzcG9uc2UpIHtcclxuICAgICAgICAgICAgICAgIGdlbmVyYWxGYWlsdXJlQ2FsbGJhY2soYWpheFJlc3BvbnNlKTtcclxuICAgICAgICAgICAgICAgIGZhaWx1cmVDYWxsYmFjayhhamF4UmVzcG9uc2UpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGZvcmtlZEZhaWx1cmVDYWxsYmFjayA9IGdlbmVyYWxGYWlsdXJlQ2FsbGJhY2s7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGFqYXhIZWxwZXIucmVxdWVzdCh1cmwsIGNhbGxiYWNrLCBmb3JrZWRGYWlsdXJlQ2FsbGJhY2spO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2VuZXJhbEZhaWx1cmVDYWxsYmFjayhhamF4UmVzcG9uc2UpIHtcclxuICAgICAgICB2YXIgZXhjZXB0aW9uID0gbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICdCYWQganBpcCBzZXJ2ZXIgcmVzcG9uc2UgKHN0YXR1cyA9ICcgKyBhamF4UmVzcG9uc2Uuc3RhdHVzICsgJyknKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgb25TdGF0dXNDaGFuZ2UoZXhjZXB0aW9uKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gb25TdGF0dXNDaGFuZ2UoZXhjZXB0aW9uKSB7XHJcbiAgICAgICAgaWYgKGV4Y2VwdGlvbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGV4Y2VwdGlvbiA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzdGF0dXNDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzdGF0dXNDYWxsYmFjayh7XHJcbiAgICAgICAgICAgICAgICBpc1JlYWR5OiBpc1JlYWR5LFxyXG4gICAgICAgICAgICAgICAgZXhjZXB0aW9uOiBleGNlcHRpb25cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcFNlc3Npb24oXHJcbiAgICBtYXhDaGFubmVsc0luU2Vzc2lvbixcclxuICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAga25vd25UYXJnZXRJZCxcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgc2V0SW50ZXJ2YWxGdW5jdGlvbixcclxuICAgIGNsZWFySW50ZXJ2YWxGdW5jdGlvbixcclxuICAgIGpwaXBGYWN0b3J5KSB7XHJcblxyXG4gICAgdmFyIFNFQ09ORCA9IDEwMDA7XHJcbiAgICB2YXIgS0VFUF9BTElWRV9JTlRFUlZBTCA9IDMwICogU0VDT05EO1xyXG4gICAgXHJcbiAgICB2YXIgY2hhbm5lbE1hbmFnZW1lbnRVcmw7XHJcbiAgICB2YXIgZGF0YVJlcXVlc3RVcmw7XHJcbiAgICB2YXIgY2xvc2VTZXNzaW9uVXJsO1xyXG4gICAgXHJcbiAgICB2YXIgaXNDbG9zZUNhbGxlZCA9IGZhbHNlO1xyXG4gICAgdmFyIGNsb3NlQ2FsbGJhY2tQZW5kaW5nID0gbnVsbDtcclxuXHJcbiAgICB2YXIgc2Vzc2lvbkhlbHBlciA9IG51bGw7XHJcbiAgICB2YXIgc3RhdHVzQ2FsbGJhY2sgPSBudWxsO1xyXG4gICAgdmFyIHJlcXVlc3RFbmRlZENhbGxiYWNrID0gbnVsbDtcclxuXHJcbiAgICB2YXIgbm9uRGVkaWNhdGVkQ2hhbm5lbHMgPSBbXTtcclxuICAgIHZhciBjaGFubmVsc0NyZWF0ZWQgPSAwO1xyXG4gICAgdmFyIGtlZXBBbGl2ZUludGVydmFsSGFuZGxlID0gbnVsbDtcclxuICAgIFxyXG4gICAgdGhpcy5vcGVuID0gZnVuY3Rpb24gb3BlbihiYXNlVXJsKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb25IZWxwZXIgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnc2Vzc2lvbi5vcGVuKCkgc2hvdWxkIGJlIGNhbGxlZCBvbmx5IG9uY2UnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHF1ZXJ5UGFyYW1zRGVsaW1pdGVyID0gYmFzZVVybC5pbmRleE9mKCc/JykgPCAwID8gJz8nIDogJyYnO1xyXG4gICAgICAgIGNoYW5uZWxNYW5hZ2VtZW50VXJsID0gYmFzZVVybCArIHF1ZXJ5UGFyYW1zRGVsaW1pdGVyICsgJ3R5cGU9JyArIFxyXG4gICAgICAgICAgICAoZGF0YWJpbnNTYXZlci5nZXRJc0pwaXBUaWxlUGFydFN0cmVhbSgpID8gJ2pwdC1zdHJlYW0nIDogJ2pwcC1zdHJlYW0nKTtcclxuICAgICAgICBkYXRhUmVxdWVzdFVybCA9IGNoYW5uZWxNYW5hZ2VtZW50VXJsICsgJyZzdHJlYW09MCc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlciA9IGpwaXBGYWN0b3J5LmNyZWF0ZVNlc3Npb25IZWxwZXIoXHJcbiAgICAgICAgICAgIGRhdGFSZXF1ZXN0VXJsLCBrbm93blRhcmdldElkLCBjb2Rlc3RyZWFtU3RydWN0dXJlLCBkYXRhYmluc1NhdmVyKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoc3RhdHVzQ2FsbGJhY2sgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5zZXRTdGF0dXNDYWxsYmFjayhzdGF0dXNDYWxsYmFjayk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXF1ZXN0RW5kZWRDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLnNldFJlcXVlc3RFbmRlZENhbGxiYWNrKHJlcXVlc3RFbmRlZENhbGxiYWNrKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNoYW5uZWwgPSBjcmVhdGVDaGFubmVsKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2hhbm5lbC5zZW5kTWluaW1hbFJlcXVlc3Qoc2Vzc2lvblJlYWR5Q2FsbGJhY2spO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUYXJnZXRJZCA9IGZ1bmN0aW9uIGdldFRhcmdldElkKCkge1xyXG4gICAgICAgIGVuc3VyZVJlYWR5KCk7XHJcbiAgICAgICAgcmV0dXJuIHNlc3Npb25IZWxwZXIuZ2V0VGFyZ2V0SWQoKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SXNSZWFkeSA9IGZ1bmN0aW9uIGdldElzUmVhZHkoKSB7XHJcbiAgICAgICAgdmFyIGlzUmVhZHkgPSBzZXNzaW9uSGVscGVyICE9PSBudWxsICYmIHNlc3Npb25IZWxwZXIuZ2V0SXNSZWFkeSgpO1xyXG4gICAgICAgIHJldHVybiBpc1JlYWR5O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5zZXRTdGF0dXNDYWxsYmFjayA9IGZ1bmN0aW9uIHNldFN0YXR1c0NhbGxiYWNrKHN0YXR1c0NhbGxiYWNrXykge1xyXG4gICAgICAgIHN0YXR1c0NhbGxiYWNrID0gc3RhdHVzQ2FsbGJhY2tfO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzZXNzaW9uSGVscGVyICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIuc2V0U3RhdHVzQ2FsbGJhY2soc3RhdHVzQ2FsbGJhY2tfKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldFJlcXVlc3RFbmRlZENhbGxiYWNrID0gZnVuY3Rpb24gc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2soXHJcbiAgICAgICAgcmVxdWVzdEVuZGVkQ2FsbGJhY2tfKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSByZXF1ZXN0RW5kZWRDYWxsYmFja187XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHNlc3Npb25IZWxwZXIgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5zZXRSZXF1ZXN0RW5kZWRDYWxsYmFjayhyZXF1ZXN0RW5kZWRDYWxsYmFja18pO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuaGFzQWN0aXZlUmVxdWVzdHMgPSBmdW5jdGlvbiBoYXNBY3RpdmVSZXF1ZXN0cygpIHtcclxuICAgICAgICBlbnN1cmVSZWFkeSgpO1xyXG5cclxuICAgICAgICB2YXIgaXNBY3RpdmVSZXF1ZXN0cyA9IHNlc3Npb25IZWxwZXIuZ2V0QWN0aXZlUmVxdWVzdHNDb3VudCgpID4gMDtcclxuICAgICAgICByZXR1cm4gaXNBY3RpdmVSZXF1ZXN0cztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMudHJ5R2V0Q2hhbm5lbCA9IGZ1bmN0aW9uIHRyeUdldENoYW5uZWwoZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdCkge1xyXG4gICAgICAgIGVuc3VyZVJlYWR5KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNhbkNyZWF0ZU5ld0NoYW5uZWwgPSBjaGFubmVsc0NyZWF0ZWQgPCBtYXhDaGFubmVsc0luU2Vzc2lvbjtcclxuICAgICAgICB2YXIgc2VhcmNoT25seUNoYW5uZWxXaXRoRW1wdHlRdWV1ZSA9XHJcbiAgICAgICAgICAgIGNhbkNyZWF0ZU5ld0NoYW5uZWwgfHwgZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWF4UmVxdWVzdHNJbkNoYW5uZWwgPSBzZWFyY2hPbmx5Q2hhbm5lbFdpdGhFbXB0eVF1ZXVlID9cclxuICAgICAgICAgICAgMCA6IG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsIC0gMTtcclxuXHJcbiAgICAgICAgdmFyIGNoYW5uZWwgPSBnZXRDaGFubmVsV2l0aE1pbmltYWxXYWl0aW5nUmVxdWVzdHMoXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzSW5DaGFubmVsLFxyXG4gICAgICAgICAgICAvKmlzRXh0cmFjdEZyb21Ob25EZWRpY2F0ZWRMaXN0PSovZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNoYW5uZWwgPT09IG51bGwgJiYgY2FuQ3JlYXRlTmV3Q2hhbm5lbCkge1xyXG4gICAgICAgICAgICBjaGFubmVsID0gY3JlYXRlQ2hhbm5lbChkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3QgJiYgY2hhbm5lbCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjaGFubmVsLmRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3QoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNoYW5uZWw7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNsb3NlID0gZnVuY3Rpb24gY2xvc2UoY2xvc2VkQ2FsbGJhY2spIHtcclxuICAgICAgICBpZiAoY2hhbm5lbHNDcmVhdGVkID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0Nhbm5vdCBjbG9zZSBzZXNzaW9uIGJlZm9yZSBvcGVuJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoaXNDbG9zZUNhbGxlZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdDYW5ub3QgY2xvc2Ugc2Vzc2lvbiB0d2ljZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpc0Nsb3NlQ2FsbGVkID0gdHJ1ZTtcclxuICAgICAgICBjbG9zZUNhbGxiYWNrUGVuZGluZyA9IGNsb3NlZENhbGxiYWNrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjbG9zZVNlc3Npb25VcmwgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBjbG9zZUludGVybmFsKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2xvc2VJbnRlcm5hbCgpIHtcclxuICAgICAgICBpZiAoa2VlcEFsaXZlSW50ZXJ2YWxIYW5kbGUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbEZ1bmN0aW9uKGtlZXBBbGl2ZUludGVydmFsSGFuZGxlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5zZXRJc1JlYWR5KGZhbHNlKTtcclxuICAgICAgICBzZXNzaW9uSGVscGVyLnNlbmRBamF4KGNsb3NlU2Vzc2lvblVybCwgY2xvc2VDYWxsYmFja1BlbmRpbmcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVDaGFubmVsKGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QpIHtcclxuICAgICAgICArK2NoYW5uZWxzQ3JlYXRlZDtcclxuICAgICAgICB2YXIgY2hhbm5lbCA9IGpwaXBGYWN0b3J5LmNyZWF0ZUNoYW5uZWwoXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLCBzZXNzaW9uSGVscGVyKTtcclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyLmNoYW5uZWxDcmVhdGVkKGNoYW5uZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCkge1xyXG4gICAgICAgICAgICBub25EZWRpY2F0ZWRDaGFubmVscy5wdXNoKGNoYW5uZWwpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGNoYW5uZWw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldENoYW5uZWxXaXRoTWluaW1hbFdhaXRpbmdSZXF1ZXN0cyhcclxuICAgICAgICBtYXhSZXF1ZXN0c0luQ2hhbm5lbCwgaXNFeHRyYWN0RnJvbU5vbkRlZGljYXRlZExpc3QpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2hhbm5lbCA9IG51bGw7XHJcbiAgICAgICAgdmFyIGluZGV4O1xyXG4gICAgICAgIHZhciBtaW5pbWFsV2FpdGluZ1JlcXVlc3RzID0gbWF4UmVxdWVzdHNJbkNoYW5uZWwgKyAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9uRGVkaWNhdGVkQ2hhbm5lbHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIHdhaXRpbmdSZXF1ZXN0cyA9XHJcbiAgICAgICAgICAgICAgICBub25EZWRpY2F0ZWRDaGFubmVsc1tpXS5nZXRBbGxRdWV1ZWRSZXF1ZXN0Q291bnQoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh3YWl0aW5nUmVxdWVzdHMgPCBtaW5pbWFsV2FpdGluZ1JlcXVlc3RzKSB7XHJcbiAgICAgICAgICAgICAgICBjaGFubmVsID0gbm9uRGVkaWNhdGVkQ2hhbm5lbHNbaV07XHJcbiAgICAgICAgICAgICAgICBpbmRleCA9IGk7XHJcbiAgICAgICAgICAgICAgICBtaW5pbWFsV2FpdGluZ1JlcXVlc3RzID0gd2FpdGluZ1JlcXVlc3RzO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAod2FpdGluZ1JlcXVlc3RzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzRXh0cmFjdEZyb21Ob25EZWRpY2F0ZWRMaXN0IHx8IGNoYW5uZWwgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNoYW5uZWw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIG5vbkRlZGljYXRlZENoYW5uZWxzW2luZGV4XSA9XHJcbiAgICAgICAgICAgIG5vbkRlZGljYXRlZENoYW5uZWxzW25vbkRlZGljYXRlZENoYW5uZWxzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIG5vbkRlZGljYXRlZENoYW5uZWxzLmxlbmd0aCAtPSAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjaGFubmVsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBzZXNzaW9uUmVhZHlDYWxsYmFjaygpIHtcclxuICAgICAgICB2YXIgbWFpbkhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldE1haW5IZWFkZXJEYXRhYmluKCk7XHJcbiAgICAgICAgaWYgKCFtYWluSGVhZGVyRGF0YWJpbi5pc0FsbERhdGFiaW5Mb2FkZWQoKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnTWFpbiBoZWFkZXIgd2FzIG5vdCBsb2FkZWQgb24gc2Vzc2lvbiBjcmVhdGlvbicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYXJiaXRyYXJ5Q2hhbm5lbCA9IHNlc3Npb25IZWxwZXIuZ2V0Rmlyc3RDaGFubmVsKCk7XHJcbiAgICAgICAgdmFyIGFyYml0cmFyeUNoYW5uZWxJZCA9IGFyYml0cmFyeUNoYW5uZWwuZ2V0Q2hhbm5lbElkKCk7XHJcbiAgICAgICAgY2xvc2VTZXNzaW9uVXJsID0gY2hhbm5lbE1hbmFnZW1lbnRVcmwgK1xyXG4gICAgICAgICAgICAnJmNjbG9zZT0qJyArXHJcbiAgICAgICAgICAgICcmY2lkPScgKyBhcmJpdHJhcnlDaGFubmVsSWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzQ2xvc2VDYWxsZWQpIHtcclxuICAgICAgICAgICAgY2xvc2VJbnRlcm5hbCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhcmJpdHJhcnlDaGFubmVsSWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBGYWlsdXJlIGluZGljYXRpb24gYWxyZWFkeSByZXR1cm5lZCBpbiBKcGlwUmVxdWVzdFxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBrZWVwQWxpdmVJbnRlcnZhbEhhbmRsZSA9IHNldEludGVydmFsRnVuY3Rpb24oXHJcbiAgICAgICAgICAgIGtlZXBBbGl2ZUhhbmRsZXIsIEtFRVBfQUxJVkVfSU5URVJWQUwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlc3Npb25IZWxwZXIuc2V0SXNSZWFkeSh0cnVlKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24ga2VlcEFsaXZlSGFuZGxlcigpIHtcclxuICAgICAgICBpZiAoc2Vzc2lvbkhlbHBlci5nZXRBY3RpdmVSZXF1ZXN0c0NvdW50KCkgPiAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGFyYml0cmFyeUNoYW5uZWwgPSBzZXNzaW9uSGVscGVyLmdldEZpcnN0Q2hhbm5lbCgpO1xyXG4gICAgICAgIGFyYml0cmFyeUNoYW5uZWwuc2VuZE1pbmltYWxSZXF1ZXN0KGZ1bmN0aW9uIGR1bW15Q2FsbGJhY2soKSB7fSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGVuc3VyZVJlYWR5KCkge1xyXG4gICAgICAgIGlmIChzZXNzaW9uSGVscGVyID09PSBudWxsIHx8ICFzZXNzaW9uSGVscGVyLmdldElzUmVhZHkoKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignQ2Fubm90IHBlcmZvcm0gJyArXHJcbiAgICAgICAgICAgICAgICAndGhpcyBvcGVyYXRpb24gd2hlbiB0aGUgc2Vzc2lvbiBpcyBub3QgcmVhZHknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24gSnBpcEJpdHN0cmVhbVJlYWRlckNsb3N1cmUoKSB7XHJcbiAgICB2YXIgemVyb0JpdHNVbnRpbEZpcnN0T25lQml0TWFwID0gY3JlYXRlWmVyb0JpdHNVbnRpbEZpcnN0T25lQml0TWFwKCk7XHJcblxyXG4gICAgZnVuY3Rpb24gSnBpcEJpdHN0cmVhbVJlYWRlcihkYXRhYmluLCB0cmFuc2FjdGlvbkhlbHBlcikge1xyXG4gICAgICAgIHZhciBpbml0aWFsU3RhdGUgPSB7XHJcbiAgICAgICAgICAgIG5leHRPZmZzZXRUb1BhcnNlOiAwLFxyXG4gICAgICAgICAgICB2YWxpZEJpdHNJbkN1cnJlbnRCeXRlOiAwLFxyXG4gICAgICAgICAgICBvcmlnaW5hbEJ5dGVXaXRob3V0U2hpZnQ6IG51bGwsXHJcbiAgICAgICAgICAgIGN1cnJlbnRCeXRlOiBudWxsLFxyXG4gICAgICAgICAgICBpc1NraXBOZXh0Qnl0ZTogZmFsc2VcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdmFyIHN0cmVhbVN0YXRlID0gdHJhbnNhY3Rpb25IZWxwZXIuY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdChpbml0aWFsU3RhdGUpO1xyXG4gICAgICAgIHZhciBhY3RpdmVUcmFuc2FjdGlvbiA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdhY3RpdmVUcmFuc2FjdGlvbicsIHtcclxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiBnZXRBY3RpdmVUcmFuc2FjdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIGlmIChhY3RpdmVUcmFuc2FjdGlvbiA9PT0gbnVsbCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICFhY3RpdmVUcmFuc2FjdGlvbi5pc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnTm8gYWN0aXZlIHRyYW5zYWN0aW9uIGluIGJpdHN0cmVhbVJlYWRlcicpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYWN0aXZlVHJhbnNhY3Rpb247XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ2JpdHNDb3VudGVyJywge1xyXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uIGdldEJpdHNDb3VudGVyKCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0cnlWYWxpZGF0ZUN1cnJlbnRCeXRlKGRhdGFiaW4sIHN0YXRlKTtcclxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5pc1NraXBOZXh0Qnl0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBzdGF0ZSBvZiBiaXRzdHJlYW1SZWFkZXI6ICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnV2hlbiAweEZGIGVuY291bnRlcmVkLCB0cnlWYWxpZGF0ZUN1cnJlbnRCeXRlICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnc2hvdWxkIHNraXAgdGhlIHdob2xlIGJ5dGUgIGFmdGVyICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnc2hpZnRSZW1haW5pbmdCaXRzSW5CeXRlIGFuZCBjbGVhciBpc1NraXBOZXh0Qnl0ZS4gJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdIb3dldmVyIHRoZSBmbGFnIGlzIHN0aWxsIHNldCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gc3RhdGUubmV4dE9mZnNldFRvUGFyc2UgKiA4IC0gc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnZGF0YWJpbk9mZnNldCcsIHtcclxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiBnZXREYXRhYmluT2Zmc2V0KCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUuaXNTa2lwTmV4dEJ5dGUpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhdGUubmV4dE9mZnNldFRvUGFyc2UgKyAxO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSAlIDggIT09IDAgfHxcclxuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcmlnaW5hbEJ5dGVXaXRob3V0U2hpZnQgPT09IDB4RkYpIHtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0Nhbm5vdCBjYWxjdWxhdGUgZGF0YWJpbiBvZmZzZXQgd2hlbiBiaXRzdHJlYW1SZWFkZXIgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICcgaXMgaW4gdGhlIG1pZGRsZSBvZiB0aGUgYnl0ZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RhdGUubmV4dE9mZnNldFRvUGFyc2UgLSBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlIC8gODtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24gc2V0RGF0YWJpbk9mZnNldChvZmZzZXRJbkJ5dGVzKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlID0gMDtcclxuICAgICAgICAgICAgICAgIHN0YXRlLmlzU2tpcE5leHRCeXRlID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5vcmlnaW5hbEJ5dGVXaXRob3V0U2hpZnQgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUubmV4dE9mZnNldFRvUGFyc2UgPSBvZmZzZXRJbkJ5dGVzO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5zdGFydE5ld1RyYW5zYWN0aW9uID0gZnVuY3Rpb24gc3RhcnROZXdUcmFuc2FjdGlvbigpIHtcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZVRyYW5zYWN0aW9uICE9PSBudWxsICYmIGFjdGl2ZVRyYW5zYWN0aW9uLmlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ2Fubm90IHN0YXJ0IG5ldyB0cmFuc2FjdGlvbiBpbiBiaXRzdHJlYW1SZWFkZXIgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ3doaWxlIGFub3RoZXIgdHJhbnNhY3Rpb24gaXMgYWN0aXZlJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGFjdGl2ZVRyYW5zYWN0aW9uID0gdHJhbnNhY3Rpb25IZWxwZXIuY3JlYXRlVHJhbnNhY3Rpb24oKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc2hpZnRSZW1haW5pbmdCaXRzSW5CeXRlID0gZnVuY3Rpb24gc2hpZnRSZW1haW5pbmdCaXRzSW5CeXRlKCkge1xyXG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcblxyXG4gICAgICAgICAgICBzdGF0ZS5pc1NraXBOZXh0Qnl0ZSA9IHN0YXRlLm9yaWdpbmFsQnl0ZVdpdGhvdXRTaGlmdCA9PT0gMHhGRjtcclxuICAgICAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSA9IE1hdGguZmxvb3IoXHJcbiAgICAgICAgICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlIC8gOCk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnNoaWZ0Qml0ID0gZnVuY3Rpb24gc2hpZnRCaXQoKSB7XHJcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgaWYgKCF0cnlWYWxpZGF0ZUN1cnJlbnRCeXRlKGRhdGFiaW4sIHN0YXRlKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBvbmVzQ291bnQgPSBjb3VudEFuZFNoaWZ0Qml0cyhcclxuICAgICAgICAgICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICBzdGF0ZSxcclxuICAgICAgICAgICAgICAgIC8qaXNVbnRpbFplcm9CaXQ9Ki90cnVlLFxyXG4gICAgICAgICAgICAgICAgLyptYXhCaXRzVG9TaGlmdD0qLzEpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIG9uZXNDb3VudDtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY291bnRaZXJvc0FuZFNoaWZ0VW50aWxGaXJzdE9uZUJpdCA9XHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNvdW50WmVyb3NBbmRTaGlmdFVudGlsRmlyc3RPbmVCaXQobWF4Qml0c1RvU2hpZnQpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBjb3VudEFuZFNoaWZ0Qml0cyhcclxuICAgICAgICAgICAgICAgICAgICBkYXRhYmluLCBzdGF0ZSwgLyppc1VudGlsWmVyb0JpdD0qL2ZhbHNlLCBtYXhCaXRzVG9TaGlmdCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jb3VudE9uZXNBbmRTaGlmdFVudGlsRmlyc3RaZXJvQml0ID1cclxuICAgICAgICAgICAgZnVuY3Rpb24gY291bnRPbmVzQW5kU2hpZnRVbnRpbEZpcnN0WmVyb0JpdChtYXhCaXRzVG9TaGlmdCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGNvdW50QW5kU2hpZnRCaXRzKFxyXG4gICAgICAgICAgICAgICAgICAgIGRhdGFiaW4sIHN0YXRlLCAvKmlzVW50aWxaZXJvQml0PSovdHJ1ZSwgbWF4Qml0c1RvU2hpZnQpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc2hpZnRCaXRzID0gZnVuY3Rpb24gc2hpZnRCaXRzKGJpdHNDb3VudCkge1xyXG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gMDtcclxuICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICB2YXIgcmVtYWluaW5nQml0cyA9IGJpdHNDb3VudDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHdoaWxlIChyZW1haW5pbmdCaXRzID4gMCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0cnlWYWxpZGF0ZUN1cnJlbnRCeXRlKGRhdGFiaW4sIHN0YXRlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgYml0c1RvVGFrZSA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUsIHJlbWFpbmluZ0JpdHMpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgYWRkVG9SZXN1bHQgPSBzdGF0ZS5jdXJyZW50Qnl0ZSA+PiAoOCAtIGJpdHNUb1Rha2UpO1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gKHJlc3VsdCA8PCBiaXRzVG9UYWtlKSArIGFkZFRvUmVzdWx0O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZW1vdmVCaXRzRnJvbUJ5dGUoc3RhdGUsIGJpdHNUb1Rha2UpO1xyXG4gICAgICAgICAgICAgICAgcmVtYWluaW5nQml0cyAtPSBiaXRzVG9UYWtlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNvdW50QW5kU2hpZnRCaXRzKGRhdGFiaW4sIHN0YXRlLCBpc1VudGlsWmVyb0JpdCwgbWF4Qml0c1RvU2hpZnQpIHtcclxuICAgICAgICB2YXIgY291bnRlZEJpdHMgPSAwO1xyXG4gICAgICAgIHZhciBmb3VuZFRlcm1pbmF0aW5nQml0O1xyXG4gICAgICAgIHZhciByZW1haW5pbmdCaXRzID0gbWF4Qml0c1RvU2hpZnQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBpZiAoIXRyeVZhbGlkYXRlQ3VycmVudEJ5dGUoZGF0YWJpbiwgc3RhdGUpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGJ5dGVWYWx1ZSA9IGlzVW50aWxaZXJvQml0ID8gfnN0YXRlLmN1cnJlbnRCeXRlIDogc3RhdGUuY3VycmVudEJ5dGU7XHJcbiAgICAgICAgICAgIHZhciBiaXRzQ291bnRJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdCA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICAgICAgemVyb0JpdHNVbnRpbEZpcnN0T25lQml0TWFwW2J5dGVWYWx1ZV0sXHJcbiAgICAgICAgICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlICsgMSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgYml0c0NvdW50Tm90SW5jbHVkaW5nVGVybWluYXRpbmdCaXQgPVxyXG4gICAgICAgICAgICAgICAgYml0c0NvdW50SW5jbHVkaW5nVGVybWluYXRpbmdCaXQgLSAxO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHJlbWFpbmluZ0JpdHMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGJpdHNDb3VudEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0ID4gcmVtYWluaW5nQml0cykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZUJpdHNGcm9tQnl0ZShzdGF0ZSwgcmVtYWluaW5nQml0cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgY291bnRlZEJpdHMgKz0gcmVtYWluaW5nQml0cztcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmVtYWluaW5nQml0cyAtPSBiaXRzQ291bnROb3RJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY291bnRlZEJpdHMgKz0gYml0c0NvdW50Tm90SW5jbHVkaW5nVGVybWluYXRpbmdCaXQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3VuZFRlcm1pbmF0aW5nQml0ID1cclxuICAgICAgICAgICAgICAgIGJpdHNDb3VudEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0IDw9IHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGU7XHJcblxyXG4gICAgICAgICAgICBpZiAoZm91bmRUZXJtaW5hdGluZ0JpdCkge1xyXG4gICAgICAgICAgICAgICAgcmVtb3ZlQml0c0Zyb21CeXRlKHN0YXRlLCBiaXRzQ291bnRJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gd2hpbGUgKCFmb3VuZFRlcm1pbmF0aW5nQml0KTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY291bnRlZEJpdHM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHJlbW92ZUJpdHNGcm9tQnl0ZShzdGF0ZSwgYml0c0NvdW50KSB7XHJcbiAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSAtPSBiaXRzQ291bnQ7XHJcbiAgICAgICAgaWYgKHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgPiAwKSB7XHJcbiAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRCeXRlID0gKHN0YXRlLmN1cnJlbnRCeXRlIDw8IGJpdHNDb3VudCkgJiAweEZGO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiB0cnlWYWxpZGF0ZUN1cnJlbnRCeXRlKGRhdGFiaW4sIHN0YXRlKSB7XHJcbiAgICAgICAgaWYgKHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgPiAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNOZWVkZWQgPSBzdGF0ZS5pc1NraXBOZXh0Qnl0ZSA/IDIgOiAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHRBcnJheSA9IFtdO1xyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW4uY29weUJ5dGVzKHJlc3VsdEFycmF5LCAvKnJlc3VsdFN0YXJ0T2Zmc2V0PSovMCwge1xyXG4gICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZSxcclxuICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0OiBzdGF0ZS5uZXh0T2Zmc2V0VG9QYXJzZSxcclxuICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBieXRlc05lZWRlZFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgIT09IGJ5dGVzTmVlZGVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBwcmV2Qnl0ZSA9IHN0YXRlLm9yaWdpbmFsQnl0ZVdpdGhvdXRTaGlmdDtcclxuXHJcbiAgICAgICAgc3RhdGUuY3VycmVudEJ5dGUgPSByZXN1bHRBcnJheVtieXRlc05lZWRlZCAtIDFdO1xyXG4gICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgPSA4O1xyXG4gICAgICAgIHN0YXRlLm9yaWdpbmFsQnl0ZVdpdGhvdXRTaGlmdCA9IHN0YXRlLmN1cnJlbnRCeXRlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwcmV2Qnl0ZSA9PT0gMHhGRikge1xyXG4gICAgICAgICAgICBpZiAoKHJlc3VsdEFycmF5WzBdICYgMHg4MCkgIT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdFeHBlY3RlZCAwIGJpdCBhZnRlciAweEZGIGJ5dGUnLCAnQi4xMC4xJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIE5vIG5lZWQgdG8gc2tpcCBhbm90aGVyIGJpdCBpZiBhbHJlYWR5IHNraXAgdGhlIHdob2xlIGJ5dGVcclxuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pc1NraXBOZXh0Qnl0ZSkge1xyXG4gICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEJ5dGUgPDw9IDE7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlID0gNztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzdGF0ZS5pc1NraXBOZXh0Qnl0ZSA9IGZhbHNlO1xyXG4gICAgICAgIHN0YXRlLm5leHRPZmZzZXRUb1BhcnNlICs9IGJ5dGVzTmVlZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGNyZWF0ZVplcm9CaXRzVW50aWxGaXJzdE9uZUJpdE1hcCgpIHtcclxuICAgICAgICB2YXIgYXJyYXlNYXAgPSBuZXcgQXJyYXkoMjU1KTtcclxuICAgICAgICBcclxuICAgICAgICBhcnJheU1hcFsweDAwXSA9IDk7XHJcbiAgICAgICAgYXJyYXlNYXBbMHgwMV0gPSA4O1xyXG4gICAgICAgIGFycmF5TWFwWzB4MDJdID0gNztcclxuICAgICAgICBhcnJheU1hcFsweDAzXSA9IDc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChpID0gMHgwNDsgaSA8PSAweDA3OyArK2kpIHtcclxuICAgICAgICAgICAgYXJyYXlNYXBbaV0gPSA2O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGkgPSAweDA4OyBpIDw9IDB4MEY7ICsraSkge1xyXG4gICAgICAgICAgICBhcnJheU1hcFtpXSA9IDU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGkgPSAweDEwOyBpIDw9IDB4MUY7ICsraSkge1xyXG4gICAgICAgICAgICBhcnJheU1hcFtpXSA9IDQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGkgPSAweDIwOyBpIDw9IDB4M0Y7ICsraSkge1xyXG4gICAgICAgICAgICBhcnJheU1hcFtpXSA9IDM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoaSA9IDB4NDA7IGkgPD0gMHg3RjsgKytpKSB7XHJcbiAgICAgICAgICAgIGFycmF5TWFwW2ldID0gMjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChpID0gMHg4MDsgaSA8PSAweEZGOyArK2kpIHtcclxuICAgICAgICAgICAgYXJyYXlNYXBbaV0gPSAxO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBBdm9pZCB0d28ncyBjb21wbGVtZW50IHByb2JsZW1zXHJcbiAgICAgICAgZm9yIChpID0gMDsgaSA8PSAweEZGOyArK2kpIHtcclxuICAgICAgICAgICAgYXJyYXlNYXBbaSAtIDB4MTAwXSA9IGFycmF5TWFwW2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYXJyYXlNYXA7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBKcGlwQml0c3RyZWFtUmVhZGVyO1xyXG59KSgpOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uIEpwaXBDb2RlYmxvY2tMZW5ndGhQYXJzZXJDbG9zdXJlKCkge1xyXG4gICAgLy8gQi4xMC43LlxyXG4gICAgXHJcbiAgICB2YXIgZXhhY3RMb2cyVGFibGUgPSBjcmVhdGVFeGFjdExvZzJUYWJsZSgpO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBKcGlwQ29kZWJsb2NrTGVuZ3RoUGFyc2VyKGJpdHN0cmVhbVJlYWRlciwgdHJhbnNhY3Rpb25IZWxwZXIpIHtcclxuICAgICAgICB2YXIgbEJsb2NrID0gdHJhbnNhY3Rpb25IZWxwZXIuY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdCh7XHJcbiAgICAgICAgICAgIGxCbG9ja1ZhbHVlOiAzXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMucGFyc2UgPSBmdW5jdGlvbiBwYXJzZShjb2RpbmdQYXNzZXMpIHtcclxuICAgICAgICAgICAgdmFyIGFkZFRvTEJsb2NrID0gYml0c3RyZWFtUmVhZGVyLmNvdW50T25lc0FuZFNoaWZ0VW50aWxGaXJzdFplcm9CaXQoKTtcclxuICAgICAgICAgICAgaWYgKGFkZFRvTEJsb2NrID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGxCbG9ja1N0YXRlID0gbEJsb2NrLmdldFZhbHVlKGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgIGxCbG9ja1N0YXRlLmxCbG9ja1ZhbHVlICs9IGFkZFRvTEJsb2NrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGNvZGluZ1Bhc3Nlc0xvZzIgPSBleGFjdExvZzJUYWJsZVtjb2RpbmdQYXNzZXNdO1xyXG4gICAgICAgICAgICBpZiAoY29kaW5nUGFzc2VzTG9nMiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCB2YWx1ZSBvZiBjb2RpbmcgcGFzc2VzICcgKyBjb2RpbmdQYXNzZXMgK1xyXG4gICAgICAgICAgICAgICAgICAgICcuIEV4cGVjdGVkIHBvc2l0aXZlIGludGVnZXIgPD0gMTY0Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBiaXRzQ291bnQgPSBsQmxvY2tTdGF0ZS5sQmxvY2tWYWx1ZSArIGNvZGluZ1Bhc3Nlc0xvZzI7XHJcbiAgICAgICAgICAgIHZhciBsZW5ndGggPSBiaXRzdHJlYW1SZWFkZXIuc2hpZnRCaXRzKGJpdHNDb3VudCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gbGVuZ3RoO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUV4YWN0TG9nMlRhYmxlKCkge1xyXG4gICAgICAgIHZhciBtYXhDb2RpbmdQYXNzZXNQb3NzaWJsZSA9IDE2NDtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KG1heENvZGluZ1Bhc3Nlc1Bvc3NpYmxlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW5wdXRWYWx1ZUxvd2VyQm91bmQgPSAxO1xyXG4gICAgICAgIHZhciBpbnB1dFZhbHVlVXBwZXJCb3VuZCA9IDI7XHJcbiAgICAgICAgdmFyIGxvZzJSZXN1bHQgPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChpbnB1dFZhbHVlTG93ZXJCb3VuZCA8PSBtYXhDb2RpbmdQYXNzZXNQb3NzaWJsZSkge1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gaW5wdXRWYWx1ZUxvd2VyQm91bmQ7IGkgPCBpbnB1dFZhbHVlVXBwZXJCb3VuZDsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbaV0gPSBsb2cyUmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbnB1dFZhbHVlTG93ZXJCb3VuZCAqPSAyO1xyXG4gICAgICAgICAgICBpbnB1dFZhbHVlVXBwZXJCb3VuZCAqPSAyO1xyXG4gICAgICAgICAgICArK2xvZzJSZXN1bHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBKcGlwQ29kZWJsb2NrTGVuZ3RoUGFyc2VyO1xyXG59KSgpOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uIEpwaXBDb2RpbmdQYXNzZXNOdW1iZXJQYXJzZXJDbG9zdXJlKCkge1xyXG4gICAgLy8gVGFibGUgQi40IGluIHBhcnQgMSBvZiB0aGUgSnBlZzIwMDAgc3RhbmRhcmQgc2hvd3MgNyBjYXNlc1xyXG4gICAgLy8gb2YgdmFsdWVzLiBUaGUgYWxnb3JpdGhtIHNob3duIGhlcmUgc2VwYXJhdGVzIHRob3NlIGNhc2VzXHJcbiAgICAvLyBpbnRvIDE2IGNhc2VzLCBkZXBlbmRzIG9uIHRoZSBudW1iZXIgb2Ygb25lcyBpbiB0aGUgcHJlZml4XHJcbiAgICAvLyBvZiB0aGUgY29kZWQgbnVtYmVyIHVudGlsIHRoZSBmaXJzdCB6ZXJvLlxyXG4gICAgLy8gVGhlIHBhcnNpbmcgaXMgZG9uZSBpbiB0d28gc3RhZ2VzOiBmaXJzdCB3ZSBjb3VudCB0aGUgb25lcyB1bnRpbFxyXG4gICAgLy8gdGhlIGZpcnN0IHplcm8sIGxhdGVyIHdlIHBhcnNlIHRoZSBvdGhlciBiaXRzLlxyXG4gICAgXHJcbiAgICAvLyBGb3IgZXhhbXBsZSwgdGhlIGNhc2Ugb2YgMTEwMSAod2hpY2ggcmVwcmVzZW50cyA0IGFjY29yZGluZyB0b1xyXG4gICAgLy8gdGFibGUgQi40KSBpcyBwYXJzZWQgaW4gdHdvIHN0YWdlcy4gRmlyc3Qgd2UgY291bnQgdGhlIG9uZXMgaW5cclxuICAgIC8vIHRoZSBiZWdpbm5pbmcgdW50aWwgdGhlIGZpcnN0IHplcm8sIHRoZSByZXN1bHQgaXMgMiAoJzExMCcpLiBUaGVuIHdlXHJcbiAgICAvLyBwYXJzZSB0aGUgb3RoZXIgYml0cyAoJzEnKS5cclxuICAgIFxyXG4gICAgLy8gQWZ0ZXIgdGhlIGZpcnN0IHBhcnNpbmcgc3RhZ2UgKGNvdW50IG9mIG9uZXMpLCB3ZSBrbm93IHR3byB0aGluZ3M6XHJcbiAgICAvLyAtIEhvdyBtYW55IGJpdHMgd2UgbmVlZCB0byB0YWtlIGFmdGVyIHRoZSBmaXJzdCB6ZXJvIChzaW5nbGUgYml0IGluXHJcbiAgICAvLyAgIHRoZSBhYm92ZSBjYXNlIG9mICcxMTAnIHByZWZpeCkuXHJcbiAgICAvLyAtIEhvdyBtdWNoIHdlIG5lZWQgdG8gYWRkIHRvIHRoZSByZXN1bHQgb2YgcGFyc2luZyB0aGUgb3RoZXIgYml0cyAoM1xyXG4gICAgLy8gICAgIGluIHRoZSBhYm92ZSBjYXNlIG9mICcxMTAnIHByZWZpeCkuXHJcbiAgICBcclxuICAgIC8vIEFjdHVhbGx5IHRoZSAxNiBjYXNlcyB3ZXJlIGV4dHJhY3RlZCBmcm9tIHRoZSB0YWJsZSB3aXRob3V0IGFueSBmb3JtdWxhLFxyXG4gICAgLy8gc28gd2UgY2FuIHJlZmVyIHRoZSBudW1iZXIgb2Ygb25lcyBhcyAna2V5d29yZHMnIG9ubHkuXHJcblxyXG4gICAgdmFyIGJpdHNOZWVkZWRBZnRlckNvdW50T2ZPbmVzID0gY3JlYXRlQml0c05lZWRlZEFmdGVyQ291bnRPZk9uZXNNYXAoKTtcclxuICAgIHZhciBhZGRUb1Jlc3VsdEFmdGVyQ291bnRPZk9uZXMgPSBjcmVhdGVBZGRUb1Jlc3VsdEFmdGVyQ291bnRPZk9uZXNNYXAoKTtcclxuXHJcbiAgICB2YXIganBpcENvZGluZ1Bhc3Nlc051bWJlclBhcnNlciA9IHtcclxuICAgICAgICBwYXJzZTogZnVuY3Rpb24gcGFyc2UoYml0c3RyZWFtUmVhZGVyKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb25lc0NvdW50ID0gYml0c3RyZWFtUmVhZGVyLmNvdW50T25lc0FuZFNoaWZ0VW50aWxGaXJzdFplcm9CaXQoXHJcbiAgICAgICAgICAgICAgICAvKm1heEJpdHNUb1NoaWZ0PSovMTYpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG9uZXNDb3VudCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBtb3JlQml0c05lZWRlZCA9IGJpdHNOZWVkZWRBZnRlckNvdW50T2ZPbmVzW29uZXNDb3VudF07XHJcbiAgICAgICAgICAgIHZhciBtb3JlQml0cyA9IGJpdHN0cmVhbVJlYWRlci5zaGlmdEJpdHMobW9yZUJpdHNOZWVkZWQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG1vcmVCaXRzID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGFkZFRvUmVzdWx0ID0gYWRkVG9SZXN1bHRBZnRlckNvdW50T2ZPbmVzW29uZXNDb3VudF07XHJcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBtb3JlQml0cyArIGFkZFRvUmVzdWx0O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVCaXRzTmVlZGVkQWZ0ZXJDb3VudE9mT25lc01hcCgpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KDE3KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZSBvZiAnMCc6IEFmdGVyIDAgb25lcyBhbmQgc2luZ2xlIHplcm8sIG5lZWRzIG5vIG1vcmUgYml0c1xyXG4gICAgICAgIHJlc3VsdFswXSA9IDA7XHJcblxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcxMCc6IEFmdGVyIDEgb25lcyBhbmQgc2luZ2xlIHplcm8sIG5lZWRzIG5vIG1vcmUgYml0c1xyXG4gICAgICAgIHJlc3VsdFsxXSA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2VzIG9mICcxMTB4JzogQWZ0ZXIgMiBvbmVzIGFuZCBzaW5nbGUgemVybywgbmVlZHMgYW5vdGhlciBiaXRcclxuICAgICAgICByZXN1bHRbMl0gPSAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcxMTEwJzogQWZ0ZXIgMyBvbmVzIGFuZCBzaW5nbGUgemVybywgbmVlZHMgbm8gbW9yZSBiaXRzXHJcbiAgICAgICAgcmVzdWx0WzNdID0gMDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMTEgMDAwMCAwJyB0byAnMTExMSAxMTExIDAnOlxyXG4gICAgICAgIC8vIEFmdGVyIDQgdG8gOCBvbmVzIGFuZCBzaW5nbGUgemVybywgbmVlZHMgYml0cyB0byBjb21wbGV0ZSB0byA5IGJpdHNcclxuICAgICAgICByZXN1bHRbNF0gPSA0O1xyXG4gICAgICAgIHJlc3VsdFs1XSA9IDM7XHJcbiAgICAgICAgcmVzdWx0WzZdID0gMjtcclxuICAgICAgICByZXN1bHRbN10gPSAxO1xyXG4gICAgICAgIHJlc3VsdFs4XSA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2VzIG9mICcxMTExIDExMTExIC4uLidcclxuICAgICAgICAvLyBBZnRlciBhdCBsZWFzdCA5IG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBuZWVkcyBiaXRzIHRvIGNvbXBsZXRlIHRvIDE2IGJpdHNcclxuICAgICAgICByZXN1bHRbOV0gPSA2O1xyXG4gICAgICAgIHJlc3VsdFsxMF0gPSA1O1xyXG4gICAgICAgIHJlc3VsdFsxMV0gPSA0O1xyXG4gICAgICAgIHJlc3VsdFsxMl0gPSAzO1xyXG4gICAgICAgIHJlc3VsdFsxM10gPSAyO1xyXG4gICAgICAgIHJlc3VsdFsxNF0gPSAxO1xyXG4gICAgICAgIHJlc3VsdFsxNV0gPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcxMTExIDExMTExIDExMTEgMTExJ1xyXG4gICAgICAgIHJlc3VsdFsxNl0gPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUFkZFRvUmVzdWx0QWZ0ZXJDb3VudE9mT25lc01hcCgpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KDE3KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZSBvZiAnMCcgKGNvZGV3b3JkIGZvciAxKTpcclxuICAgICAgICAvLyBBZnRlciAwIG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBhZGQgMSB0byBvdGhlciAwIGJpdHMgdmFsdWVcclxuICAgICAgICByZXN1bHRbMF0gPSAxO1xyXG5cclxuICAgICAgICAvLyBUaGUgY2FzZSBvZiAnMTAnIChjb2Rld29yZCBmb3IgMik6XHJcbiAgICAgICAgLy8gQWZ0ZXIgMSBvbmVzIGFuZCBzaW5nbGUgemVybywgYWRkIDIgdG8gb3RoZXIgMCBiaXRzIHZhbHVlXHJcbiAgICAgICAgcmVzdWx0WzFdID0gMjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMHgnIChjb2Rld29yZHMgZm9yIDMgYW5kIDQpOlxyXG4gICAgICAgIC8vIEFmdGVyIDIgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCAzIHRvIG90aGVyIHNpbmdsZSBiaXQgdmFsdWVcclxuICAgICAgICByZXN1bHRbMl0gPSAzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcxMTEwJyAoY29kZXdvcmQgZm9yIDUpOlxyXG4gICAgICAgIC8vIEFmdGVyIDMgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCA1IHRvIG90aGVyIDAgYml0cyB2YWx1ZVxyXG4gICAgICAgIHJlc3VsdFszXSA9IDU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2VzIG9mICcxMTExIDAwMDAgMCcgdG8gJzExMTEgMTExMSAwJyAoY29kZXdvcmRzIGZvciA2IHRvIDM2KTpcclxuICAgICAgICAvLyBBZnRlciA0IG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBhZGQgNiB0byBvdGhlciAwLzEvMi8zLzQgYml0cyB2YWx1ZVxyXG4gICAgICAgIHJlc3VsdFs0XSA9IDYgKyAweDAwOyAvLyBiMDAwMDBcclxuICAgICAgICByZXN1bHRbNV0gPSA2ICsgMHgxMDsgLy8gYjEwMDAwXHJcbiAgICAgICAgcmVzdWx0WzZdID0gNiArIDB4MTg7IC8vIGIxMTAwMFxyXG4gICAgICAgIHJlc3VsdFs3XSA9IDYgKyAweDFDOyAvLyBiMTExMDBcclxuICAgICAgICByZXN1bHRbOF0gPSA2ICsgMHgxRTsgLy8gYjExMTEwXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2VzIG9mICcxMTExIDExMTExIC4uLicgKGNvZGV3b3JkcyBmb3IgMzcgdG8gMTY0KTpcclxuICAgICAgICAvLyBBZnRlciA5IG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBhZGQgMzcgdG8gb3RoZXIgMC8xLzIvMy80LzUvNiBiaXRzIHZhbHVlXHJcbiAgICAgICAgcmVzdWx0WyA5XSA9IDM3ICsgMHgwMDsgLy8gYjAwMDAwMFxyXG4gICAgICAgIHJlc3VsdFsxMF0gPSAzNyArIDB4NDA7IC8vIGIxMDAwMDBcclxuICAgICAgICByZXN1bHRbMTFdID0gMzcgKyAweDYwOyAvLyBiMTEwMDAwXHJcbiAgICAgICAgcmVzdWx0WzEyXSA9IDM3ICsgMHg3MDsgLy8gYjExMTAwMFxyXG4gICAgICAgIHJlc3VsdFsxM10gPSAzNyArIDB4Nzg7IC8vIGIxMTExMDBcclxuICAgICAgICByZXN1bHRbMTRdID0gMzcgKyAweDdDOyAvLyBiMTExMTEwXHJcbiAgICAgICAgcmVzdWx0WzE1XSA9IDM3ICsgMHg3RTsgLy8gYjExMTExMVxyXG4gICAgICAgIHJlc3VsdFsxNl0gPSAzNyArIDB4N0Y7IC8vIGIxMTExMTFcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4ganBpcENvZGluZ1Bhc3Nlc051bWJlclBhcnNlcjtcclxufSkoKTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBQYWNrZXRMZW5ndGhDYWxjdWxhdG9yKFxyXG4gICAgdGlsZVN0cnVjdHVyZSxcclxuICAgIGNvbXBvbmVudFN0cnVjdHVyZSxcclxuICAgIGRhdGFiaW4sXHJcbiAgICBzdGFydE9mZnNldEluRGF0YWJpbixcclxuICAgIHByZWNpbmN0LFxyXG4gICAganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdmFyIGNhbGN1bGF0ZWRMZW5ndGhzID0gW107XHJcbiAgICBcclxuICAgIHZhciBiaXRzdHJlYW1SZWFkZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVCaXRzdHJlYW1SZWFkZXIoZGF0YWJpbik7XHJcbiAgICBcclxuICAgIHZhciBudW1Db2RlYmxvY2tzWCA9XHJcbiAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldE51bUNvZGVibG9ja3NYSW5QcmVjaW5jdChwcmVjaW5jdCk7XHJcbiAgICB2YXIgbnVtQ29kZWJsb2Nrc1kgPVxyXG4gICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1Db2RlYmxvY2tzWUluUHJlY2luY3QocHJlY2luY3QpO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIG51bVF1YWxpdHlMYXllcnNJblRpbGUgPSB0aWxlU3RydWN0dXJlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuICAgIHZhciBpc1BhY2tldEhlYWRlck5lYXJEYXRhID0gdGlsZVN0cnVjdHVyZS5nZXRJc1BhY2tldEhlYWRlck5lYXJEYXRhKCk7XHJcbiAgICB2YXIgaXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZCA9IHRpbGVTdHJ1Y3R1cmUuZ2V0SXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZCgpO1xyXG4gICAgdmFyIGlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCA9XHJcbiAgICAgICAgdGlsZVN0cnVjdHVyZS5nZXRJc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQoKTtcclxuICAgIFxyXG4gICAgdmFyIHN1YmJhbmRQYXJzZXJzID0gaW5pdFN1YmJhbmRQYXJzZXJzKCk7XHJcbiAgICBcclxuICAgIHRoaXMuY2FsY3VsYXRlRW5kT2Zmc2V0T2ZMYXN0RnVsbFBhY2tldCA9XHJcbiAgICAgICAgZnVuY3Rpb24gY2FsY3VsYXRlRnVsbFBhY2tldHNBdmFpbGFibGVPZmZzZXRzKHF1YWxpdHkpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNBbGxvd2VkRnVsbFF1YWxpdHkgPVxyXG4gICAgICAgICAgICBxdWFsaXR5ID09PSB1bmRlZmluZWQgfHxcclxuICAgICAgICAgICAgcXVhbGl0eSA+PSBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1RdWFsaXR5TGF5ZXJzVG9QYXJzZTtcclxuICAgICAgICBpZiAoIWlzQWxsb3dlZEZ1bGxRdWFsaXR5KSB7XHJcbiAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnNUb1BhcnNlID0gcXVhbGl0eTtcclxuICAgICAgICB9IGVsc2UgaWYgKCFkYXRhYmluLmlzQWxsRGF0YWJpbkxvYWRlZCgpKSB7XHJcbiAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnNUb1BhcnNlID0gbnVtUXVhbGl0eUxheWVyc0luVGlsZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgZW5kT2Zmc2V0ID0gZGF0YWJpbi5nZXREYXRhYmluTGVuZ3RoSWZLbm93bigpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIGVuZE9mZnNldDogZW5kT2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyczogbnVtUXVhbGl0eUxheWVyc0luVGlsZVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2hlY2tTdXBwb3J0ZWRTdHJ1Y3R1cmUoKTtcclxuICAgICAgICBcclxuICAgICAgICB0cnlWYWxpZGF0ZVBhY2tldHMobnVtUXVhbGl0eUxheWVyc1RvUGFyc2UpO1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBnZXRGdWxsUXVhbGl0eUxheWVyc0VuZE9mZnNldChudW1RdWFsaXR5TGF5ZXJzVG9QYXJzZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UGFja2V0T2Zmc2V0c0J5Q29kZWJsb2NrSW5kZXggPSBmdW5jdGlvbiBnZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleChcclxuICAgICAgICBxdWFsaXR5TGF5ZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICBjaGVja1N1cHBvcnRlZFN0cnVjdHVyZSgpO1xyXG4gICAgICAgIHRyeVZhbGlkYXRlUGFja2V0cyhxdWFsaXR5TGF5ZXIgKyAxKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2FsY3VsYXRlZExlbmd0aHMubGVuZ3RoIDw9IHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNhbGN1bGF0ZWRMZW5ndGhzW3F1YWxpdHlMYXllcl07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0cnlWYWxpZGF0ZVBhY2tldHMocXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIHdoaWxlIChjYWxjdWxhdGVkTGVuZ3Rocy5sZW5ndGggPCBxdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5zdGFydE5ld1RyYW5zYWN0aW9uKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbmV4dFBhY2tldCA9IHRyeUNhbGN1bGF0ZU5leHRQYWNrZXRMZW5ndGgoXHJcbiAgICAgICAgICAgICAgICBjYWxjdWxhdGVkTGVuZ3Rocy5sZW5ndGgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG5leHRQYWNrZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbi5hYm9ydCgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYWxjdWxhdGVkTGVuZ3Rocy5wdXNoKG5leHRQYWNrZXQpO1xyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24uY29tbWl0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0cnlDYWxjdWxhdGVOZXh0UGFja2V0TGVuZ3RoKHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIHZhciBoZWFkZXJTdGFydE9mZnNldDtcclxuICAgICAgICBpZiAocXVhbGl0eUxheWVyID4gMCkge1xyXG4gICAgICAgICAgICB2YXIgbGFzdCA9IGNhbGN1bGF0ZWRMZW5ndGhzW3F1YWxpdHlMYXllciAtIDFdO1xyXG4gICAgICAgICAgICBoZWFkZXJTdGFydE9mZnNldCA9XHJcbiAgICAgICAgICAgICAgICBsYXN0LmhlYWRlclN0YXJ0T2Zmc2V0ICtcclxuICAgICAgICAgICAgICAgIGxhc3QuaGVhZGVyTGVuZ3RoICtcclxuICAgICAgICAgICAgICAgIGxhc3Qub3ZlcmFsbEJvZHlMZW5ndGhCeXRlcztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBoZWFkZXJTdGFydE9mZnNldCA9IHN0YXJ0T2Zmc2V0SW5EYXRhYmluO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgYml0c3RyZWFtUmVhZGVyLmRhdGFiaW5PZmZzZXQgPSBoZWFkZXJTdGFydE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNQYWNrZXRIZWFkZXJOZWFyRGF0YSAmJiBpc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkKSB7XHJcbiAgICAgICAgICAgIHZhciBpc01hcmtlciA9IGlzTWFya2VySGVyZSgweDkxKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpc01hcmtlciA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNNYXJrZXIpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdGFydE9mUGFja2V0U2VnbWVudExlbmd0aCA9IDY7XHJcbiAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuZGF0YWJpbk9mZnNldCArPSBzdGFydE9mUGFja2V0U2VnbWVudExlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNQYWNrZXRFeGlzdEluUXVhbGl0eUxheWVyID0gYml0c3RyZWFtUmVhZGVyLnNoaWZ0Qml0KCk7XHJcbiAgICAgICAgaWYgKGlzUGFja2V0RXhpc3RJblF1YWxpdHlMYXllciA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFpc1BhY2tldEV4aXN0SW5RdWFsaXR5TGF5ZXIpIHtcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLnNoaWZ0UmVtYWluaW5nQml0c0luQnl0ZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgaGVhZGVyU3RhcnRPZmZzZXQ6IGhlYWRlclN0YXJ0T2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgaGVhZGVyTGVuZ3RoOiAxLFxyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXg6IFtdLFxyXG4gICAgICAgICAgICAgICAgb3ZlcmFsbEJvZHlMZW5ndGhCeXRlczogMFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJvZHlMZW5ndGggPSBhY3R1YWxDYWxjdWxhdGVQYWNrZXRMZW5ndGhBZnRlclplcm9MZW5ndGhCaXQoXHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgaWYgKGJvZHlMZW5ndGggPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBoZWFkZXJFbmRPZmZzZXQgPSBiaXRzdHJlYW1SZWFkZXIuZGF0YWJpbk9mZnNldDtcclxuICAgICAgICBib2R5TGVuZ3RoLmhlYWRlckxlbmd0aCA9IGhlYWRlckVuZE9mZnNldCAtIGhlYWRlclN0YXJ0T2Zmc2V0O1xyXG5cclxuICAgICAgICBib2R5TGVuZ3RoLmhlYWRlclN0YXJ0T2Zmc2V0ID0gaGVhZGVyU3RhcnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGJvZHlMZW5ndGg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGFjdHVhbENhbGN1bGF0ZVBhY2tldExlbmd0aEFmdGVyWmVyb0xlbmd0aEJpdChxdWFsaXR5TGF5ZXIpIHtcclxuICAgICAgICB2YXIgYm9keUJ5dGVzID0gMDtcclxuICAgICAgICB2YXIgY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXggPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIHN1YmJhbmQgPSAwOyBzdWJiYW5kIDwgc3ViYmFuZFBhcnNlcnMubGVuZ3RoOyArK3N1YmJhbmQpIHtcclxuICAgICAgICAgICAgdmFyIHBhcnNlciA9IHN1YmJhbmRQYXJzZXJzW3N1YmJhbmRdO1xyXG4gICAgICAgICAgICB2YXIgc3ViYmFuZEJvZHlMZW5ndGggPSBwYXJzZXIuY2FsY3VsYXRlU3ViYmFuZExlbmd0aChxdWFsaXR5TGF5ZXIpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHN1YmJhbmRCb2R5TGVuZ3RoID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleCA9XHJcbiAgICAgICAgICAgICAgICAgICAgc3ViYmFuZEJvZHlMZW5ndGguY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXg7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleCA9IGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4LmNvbmNhdChcclxuICAgICAgICAgICAgICAgICAgICBzdWJiYW5kQm9keUxlbmd0aC5jb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGJvZHlCeXRlcyArPSBzdWJiYW5kQm9keUxlbmd0aC5vdmVyYWxsQm9keUxlbmd0aEJ5dGVzO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYml0c3RyZWFtUmVhZGVyLnNoaWZ0UmVtYWluaW5nQml0c0luQnl0ZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQpIHtcclxuICAgICAgICAgICAgdmFyIGlzTWFya2VyID0gaXNNYXJrZXJIZXJlKDB4OTIpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzTWFya2VyID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChpc01hcmtlcikge1xyXG4gICAgICAgICAgICAgICAgdmFyIGVuZFBhY2tldEhlYWRlck1hcmtlckxlbmd0aCA9IDI7XHJcbiAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuZGF0YWJpbk9mZnNldCArPSBlbmRQYWNrZXRIZWFkZXJNYXJrZXJMZW5ndGg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXg6IGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4LFxyXG4gICAgICAgICAgICBvdmVyYWxsQm9keUxlbmd0aEJ5dGVzOiBib2R5Qnl0ZXNcclxuICAgICAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0RnVsbFF1YWxpdHlMYXllcnNFbmRPZmZzZXQocXVhbGl0eSkge1xyXG4gICAgICAgIHZhciBudW1QYXJzZWRRdWFsaXR5TGF5ZXIgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgcXVhbGl0eSwgY2FsY3VsYXRlZExlbmd0aHMubGVuZ3RoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobnVtUGFyc2VkUXVhbGl0eUxheWVyID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBlbmRPZmZzZXQ6IHN0YXJ0T2Zmc2V0SW5EYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyczogMFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxhc3RQYWNrZXQgPSBjYWxjdWxhdGVkTGVuZ3Roc1tudW1QYXJzZWRRdWFsaXR5TGF5ZXIgLSAxXTtcclxuICAgICAgICB2YXIgZW5kT2Zmc2V0ID1cclxuICAgICAgICAgICAgbGFzdFBhY2tldC5oZWFkZXJTdGFydE9mZnNldCArXHJcbiAgICAgICAgICAgIGxhc3RQYWNrZXQuaGVhZGVyTGVuZ3RoICtcclxuICAgICAgICAgICAgbGFzdFBhY2tldC5vdmVyYWxsQm9keUxlbmd0aEJ5dGVzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIGVuZE9mZnNldDogZW5kT2Zmc2V0LFxyXG4gICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzOiBudW1QYXJzZWRRdWFsaXR5TGF5ZXJcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpbml0U3ViYmFuZFBhcnNlcnMoKSB7XHJcbiAgICAgICAgdmFyIG51bVN1YmJhbmRzID0gcHJlY2luY3QucmVzb2x1dGlvbkxldmVsID09PSAwID8gMSA6IDM7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtU3ViYmFuZHM7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQ7XHJcbiAgICAgICAgICAgIHZhciBudW1Db2RlYmxvY2tzWUluU3ViYmFuZDtcclxuICAgICAgICAgICAgaWYgKHByZWNpbmN0LnJlc29sdXRpb25MZXZlbCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQgPSBudW1Db2RlYmxvY2tzWDtcclxuICAgICAgICAgICAgICAgIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kID0gbnVtQ29kZWJsb2Nrc1k7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUcmVhdCB0aGUgZWRnZSBjYXNlIG9mIHNpbmdsZSByZWR1bmRhbnQgcGl4ZWxzIGNvbHVtblxyXG4gICAgICAgICAgICAgICAgLy8gKEluIG90aGVyIGNhc2VzLCBudW1Db2RlYmxvY2tzWCBpcyBmdWxsIGR1cGxpY2F0aW9uIG9mIDIuXHJcbiAgICAgICAgICAgICAgICAvLyBTZWUgSnBpcENvbXBvbmVudFN0cnVjdHVyZSBpbXBsZW1lbnRhdGlvbikuXHJcbiAgICAgICAgICAgICAgICBpZiAoaSA9PT0gMSkgeyAvLyBMSFxyXG4gICAgICAgICAgICAgICAgICAgIG51bUNvZGVibG9ja3NYSW5TdWJiYW5kID0gTWF0aC5jZWlsKG51bUNvZGVibG9ja3NYIC8gMik7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgeyAvLyBITCBvciBISFxyXG4gICAgICAgICAgICAgICAgICAgIG51bUNvZGVibG9ja3NYSW5TdWJiYW5kID0gTWF0aC5mbG9vcihudW1Db2RlYmxvY2tzWCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBUcmVhdCB0aGUgZWRnZSBjYXNlIG9mIHNpbmdsZSByZWR1bmRhbnQgcGl4ZWxzIHJvd1xyXG4gICAgICAgICAgICAgICAgLy8gKEluIG90aGVyIGNhc2VzLCBudW1Db2RlYmxvY2tzWSBpcyBmdWxsIGR1cGxpY2F0aW9uIG9mIDIuXHJcbiAgICAgICAgICAgICAgICAvLyBTZWUgSnBpcENvbXBvbmVudFN0cnVjdHVyZSBpbXBsZW1lbnRhdGlvbikuXHJcbiAgICAgICAgICAgICAgICBpZiAoaSA9PT0gMCkgeyAvLyBITFxyXG4gICAgICAgICAgICAgICAgICAgIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kID0gTWF0aC5jZWlsKG51bUNvZGVibG9ja3NZIC8gMik7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgeyAvLyBMSCBvciBISFxyXG4gICAgICAgICAgICAgICAgICAgIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kID0gTWF0aC5mbG9vcihudW1Db2RlYmxvY2tzWSAvIDIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQgPT09IDAgfHwgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXN1bHQucHVzaChqcGlwRmFjdG9yeS5jcmVhdGVTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLFxyXG4gICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQsXHJcbiAgICAgICAgICAgICAgICBudW1Db2RlYmxvY2tzWUluU3ViYmFuZCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpc01hcmtlckhlcmUobWFya2VyU2Vjb25kQnl0ZSkge1xyXG4gICAgICAgIHZhciBwb3NzaWJsZU1hcmtlciA9IG5ldyBBcnJheSgyKTtcclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBkYXRhYmluLmNvcHlCeXRlcyhcclxuICAgICAgICAgICAgcG9zc2libGVNYXJrZXIsXHJcbiAgICAgICAgICAgIC8qcmVzdWx0U3RhcnRPZmZzZXQ9Ki8wLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGJpdHN0cmVhbVJlYWRlci5kYXRhYmluT2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiAyLFxyXG4gICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IGZhbHNlXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoYnl0ZXNDb3BpZWQpIHtcclxuICAgICAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgICAgICAgdmFyIGlzTWFya2VyID1cclxuICAgICAgICAgICAgICAgICAgICBwb3NzaWJsZU1hcmtlclswXSA9PT0gMHhGRiAmJlxyXG4gICAgICAgICAgICAgICAgICAgIHBvc3NpYmxlTWFya2VyWzFdID09PSBtYXJrZXJTZWNvbmRCeXRlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaXNNYXJrZXI7XHJcblxyXG4gICAgICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICAgICAgICBpZiAocG9zc2libGVNYXJrZXJbMF0gPT09IDB4RkYpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tTdXBwb3J0ZWRTdHJ1Y3R1cmUoKSB7XHJcbiAgICAgICAgaWYgKCFpc1BhY2tldEhlYWRlck5lYXJEYXRhKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnUFBNIG9yIFBQVCcsICdBLjcuNCBhbmQgQS43LjUnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwUXVhbGl0eUxheWVyc0NhY2hlKFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSwganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdmFyIENBQ0hFX0tFWSA9ICdwYWNrZXRMZW5ndGhDYWxjdWxhdG9yJztcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleCA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0UGFja2V0T2Zmc2V0c0J5Q29kZWJsb2NrSW5kZXgoXHJcbiAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgcXVhbGl0eUxheWVyLCBwcmVjaW5jdFBvc2l0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhY2tldExlbmd0aENhbGN1bGF0b3IgPSBnZXRQYWNrZXRQYXJzZXIoXHJcbiAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgcHJlY2luY3RQb3NpdGlvbik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yLmdldFBhY2tldE9mZnNldHNCeUNvZGVibG9ja0luZGV4KFxyXG4gICAgICAgICAgICBxdWFsaXR5TGF5ZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFF1YWxpdHlMYXllck9mZnNldCA9IGZ1bmN0aW9uIGdldFF1YWxpdHlMYXllck9mZnNldChcclxuICAgICAgICBwcmVjaW5jdERhdGFiaW4sIHF1YWxpdHksIHByZWNpbmN0UG9zaXRpb24pIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbG9hZGVkUmFuZ2VzID0gcHJlY2luY3REYXRhYmluLmdldEV4aXN0aW5nUmFuZ2VzKCk7XHJcbiAgICAgICAgdmFyIGVuZE9mZnNldExvYWRlZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGFja2V0TGVuZ3RoQ2FsY3VsYXRvciA9IGdldFBhY2tldFBhcnNlcihcclxuICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLCBwcmVjaW5jdFBvc2l0aW9uKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKGxvYWRlZFJhbmdlcy5sZW5ndGggPCAxIHx8IGxvYWRlZFJhbmdlc1swXS5zdGFydCA+IDApIHtcclxuICAgICAgICAgICAgZW5kT2Zmc2V0TG9hZGVkID0gMDtcclxuICAgICAgICAgICAgcXVhbGl0eSA9IDA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZW5kT2Zmc2V0TG9hZGVkID0gbG9hZGVkUmFuZ2VzWzBdLnN0YXJ0ICsgbG9hZGVkUmFuZ2VzWzBdLmxlbmd0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxheWVyc0luUHJlY2luY3QgPVxyXG4gICAgICAgICAgICBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yLmNhbGN1bGF0ZUVuZE9mZnNldE9mTGFzdEZ1bGxQYWNrZXQoXHJcbiAgICAgICAgICAgICAgICBxdWFsaXR5KTtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoZW5kT2Zmc2V0TG9hZGVkIDwgbGF5ZXJzSW5QcmVjaW5jdC5lbmRPZmZzZXQpIHtcclxuICAgICAgICAgICAgdmFyIHJlZHVjZWRMYXllcnNUb1NlYXJjaCA9IGxheWVyc0luUHJlY2luY3QubnVtUXVhbGl0eUxheWVycyAtIDE7XHJcbiAgICAgICAgICAgIGxheWVyc0luUHJlY2luY3QgPSBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yXHJcbiAgICAgICAgICAgICAgICAuY2FsY3VsYXRlRW5kT2Zmc2V0T2ZMYXN0RnVsbFBhY2tldChyZWR1Y2VkTGF5ZXJzVG9TZWFyY2gpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbGF5ZXJzSW5QcmVjaW5jdDtcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0UGFja2V0UGFyc2VyKHByZWNpbmN0RGF0YWJpbiwgcHJlY2luY3RQb3NpdGlvbikge1xyXG4gICAgICAgIHZhciBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yQ29udGFpbmVyID1cclxuICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLmdldENhY2hlZERhdGEoQ0FDSEVfS0VZKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocGFja2V0TGVuZ3RoQ2FsY3VsYXRvckNvbnRhaW5lci5jYWxjdWxhdG9yICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhY2tldExlbmd0aENhbGN1bGF0b3JDb250YWluZXIuY2FsY3VsYXRvcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZWNpbmN0UG9zaXRpb24gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbigncHJlY2luY3RQb3NpdGlvbiAnICtcclxuICAgICAgICAgICAgICAgICdzaG91bGQgYmUgZ2l2ZW4gb24gdGhlIGZpcnN0IHRpbWUgb2YgdXNpbmcgUXVhbGl0eUxheWVyc0NhY2hlICcgK1xyXG4gICAgICAgICAgICAgICAgJ29uIHRoaXMgcHJlY2luY3QnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVTdHJ1Y3R1cmUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVTdHJ1Y3R1cmUoXHJcbiAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24udGlsZUluZGV4KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29tcG9uZW50U3RydWN0dXJlID0gdGlsZVN0cnVjdHVyZS5nZXRDb21wb25lbnRTdHJ1Y3R1cmUoXHJcbiAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcGFja2V0TGVuZ3RoQ2FsY3VsYXRvckNvbnRhaW5lci5jYWxjdWxhdG9yID1cclxuICAgICAgICAgICAganBpcEZhY3RvcnkuY3JlYXRlUGFja2V0TGVuZ3RoQ2FsY3VsYXRvcihcclxuICAgICAgICAgICAgICAgIHRpbGVTdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICAvKnN0YXJ0T2Zmc2V0SW5EYXRhYmluPSovMCxcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yQ29udGFpbmVyLmNhbGN1bGF0b3I7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gICAgZnVuY3Rpb24gSnBpcFN1YmJhbmRMZW5ndGhJblBhY2tldEhlYWRlckNhbGN1bGF0b3IoXHJcbiAgICAgICAgYml0c3RyZWFtUmVhZGVyLFxyXG4gICAgICAgIG51bUNvZGVibG9ja3NYLFxyXG4gICAgICAgIG51bUNvZGVibG9ja3NZLFxyXG4gICAgICAgIGNvZGluZ1Bhc3Nlc051bWJlclBhcnNlcixcclxuICAgICAgICB0cmFuc2FjdGlvbkhlbHBlcixcclxuICAgICAgICBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgY29kZWJsb2NrTGVuZ3RoUGFyc2VycyA9IG51bGw7XHJcbiAgICB2YXIgaXNDb2RlYmxvY2tzSW5jbHVkZWQgPSBudWxsO1xyXG4gICAgdmFyIHBhcnNlZFF1YWxpdHlMYXllcnMgPSB0cmFuc2FjdGlvbkhlbHBlci5jcmVhdGVUcmFuc2FjdGlvbmFsT2JqZWN0KFxyXG4gICAgICAgIDAsIC8qaXNWYWx1ZVR5cGU9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgIHZhciBpbmNsdXNpb25UcmVlID0ganBpcEZhY3RvcnkuY3JlYXRlVGFnVHJlZShcclxuICAgICAgICBiaXRzdHJlYW1SZWFkZXIsIG51bUNvZGVibG9ja3NYLCBudW1Db2RlYmxvY2tzWSk7XHJcbiAgICBcclxuICAgIHZhciB6ZXJvQml0UGxhbmVzVHJlZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZVRhZ1RyZWUoXHJcbiAgICAgICAgYml0c3RyZWFtUmVhZGVyLCBudW1Db2RlYmxvY2tzWCwgbnVtQ29kZWJsb2Nrc1kpO1xyXG4gICAgXHJcbiAgICB0aGlzLmNhbGN1bGF0ZVN1YmJhbmRMZW5ndGggPSBmdW5jdGlvbiBjYWxjdWFsdGVTdWJiYW5kTGVuZ3RoKHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIGVuc3VyZVF1YWxpdHlMYXllck5vdFBhcnNlZFlldChxdWFsaXR5TGF5ZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxhenlJbml0QXJyYXlzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaW5jbHVzaW9uVHJlZS5zZXRNaW5pbWFsVmFsdWVJZk5vdFJlYWRCaXRzKHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGFjY3VtdWxhdGVkQm9keUxlbmd0aEJ5dGVzID0gMDtcclxuICAgICAgICB2YXIgY29kZWJsb2NrSW5kZXggPSAwO1xyXG4gICAgICAgIHZhciBjb2RlYmxvY2tMZW5ndGhCeUluZGV4ID0gbmV3IEFycmF5KG51bUNvZGVibG9ja3NYICogbnVtQ29kZWJsb2Nrc1kpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIHkgPSAwOyB5IDwgbnVtQ29kZWJsb2Nrc1k7ICsreSkge1xyXG4gICAgICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IG51bUNvZGVibG9ja3NYOyArK3gpIHtcclxuICAgICAgICAgICAgICAgIHZhciBjb2RlYmxvY2tCb2R5TGVuZ3RoID0gZ2V0TmV4dENvZGVibG9ja0xlbmd0aCh4LCB5LCBxdWFsaXR5TGF5ZXIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNvZGVibG9ja0JvZHlMZW5ndGggPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrTGVuZ3RoQnlJbmRleFtjb2RlYmxvY2tJbmRleCsrXSA9IGNvZGVibG9ja0JvZHlMZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGFjY3VtdWxhdGVkQm9keUxlbmd0aEJ5dGVzICs9XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZWJsb2NrQm9keUxlbmd0aC5jb2RlYmxvY2tCb2R5TGVuZ3RoQnl0ZXM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcGFyc2VkUXVhbGl0eUxheWVycy5zZXRWYWx1ZShcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uLCBxdWFsaXR5TGF5ZXIgKyAxKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleDogY29kZWJsb2NrTGVuZ3RoQnlJbmRleCxcclxuICAgICAgICAgICAgb3ZlcmFsbEJvZHlMZW5ndGhCeXRlczogYWNjdW11bGF0ZWRCb2R5TGVuZ3RoQnl0ZXNcclxuICAgICAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGVuc3VyZVF1YWxpdHlMYXllck5vdFBhcnNlZFlldChxdWFsaXR5TGF5ZXIpIHtcclxuICAgICAgICB2YXIgcGFyc2VkUXVhbGl0eUxheWVyc1ZhbHVlID0gcGFyc2VkUXVhbGl0eUxheWVycy5nZXRWYWx1ZShcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocGFyc2VkUXVhbGl0eUxheWVyc1ZhbHVlID49IHF1YWxpdHlMYXllciArIDEpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBxdWFsaXR5IGxheWVyIHRvIHBhcnNlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBsYXp5SW5pdEFycmF5cygpIHtcclxuICAgICAgICBpZiAoY29kZWJsb2NrTGVuZ3RoUGFyc2VycyAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvZGVibG9ja0xlbmd0aFBhcnNlcnMgPSBuZXcgQXJyYXkobnVtQ29kZWJsb2Nrc1gpO1xyXG4gICAgICAgIGlzQ29kZWJsb2Nrc0luY2x1ZGVkID0gbmV3IEFycmF5KG51bUNvZGVibG9ja3NYKTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IG51bUNvZGVibG9ja3NYOyArK3gpIHtcclxuICAgICAgICAgICAgY29kZWJsb2NrTGVuZ3RoUGFyc2Vyc1t4XSA9IG5ldyBBcnJheShudW1Db2RlYmxvY2tzWSk7XHJcbiAgICAgICAgICAgIGlzQ29kZWJsb2Nrc0luY2x1ZGVkW3hdID0gbmV3IEFycmF5KG51bUNvZGVibG9ja3NZKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIHkgPSAwOyB5IDwgbnVtQ29kZWJsb2Nrc1k7ICsreSkge1xyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrTGVuZ3RoUGFyc2Vyc1t4XVt5XSA9XHJcbiAgICAgICAgICAgICAgICAgICAganBpcEZhY3RvcnkuY3JlYXRlQ29kZWJsb2NrTGVuZ3RoUGFyc2VyKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsIHRyYW5zYWN0aW9uSGVscGVyKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlzQ29kZWJsb2Nrc0luY2x1ZGVkW3hdW3ldID0gdHJhbnNhY3Rpb25IZWxwZXJcclxuICAgICAgICAgICAgICAgICAgICAuY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdCh7IGlzSW5jbHVkZWQ6IGZhbHNlIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXROZXh0Q29kZWJsb2NrTGVuZ3RoKHgsIHksIHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIHZhciBpc0NvZGVibG9ja0FscmVhZHlJbmNsdWRlZCA9IGlzQ29kZWJsb2Nrc0luY2x1ZGVkW3hdW3ldLmdldFZhbHVlKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc0NvZGVibG9ja0luY2x1ZGVkTm93O1xyXG4gICAgICAgIGlmIChpc0NvZGVibG9ja0FscmVhZHlJbmNsdWRlZC5pc0luY2x1ZGVkKSB7XHJcbiAgICAgICAgICAgIGlzQ29kZWJsb2NrSW5jbHVkZWROb3cgPSBiaXRzdHJlYW1SZWFkZXIuc2hpZnRCaXQoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpc0NvZGVibG9ja0luY2x1ZGVkTm93ID0gaW5jbHVzaW9uVHJlZS5pc1NtYWxsZXJUaGFuT3JFcXVhbHNUbyhcclxuICAgICAgICAgICAgICAgIHgsIHksIHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAoaXNDb2RlYmxvY2tJbmNsdWRlZE5vdyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9IGVsc2UgaWYgKCFpc0NvZGVibG9ja0luY2x1ZGVkTm93KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnl0ZXM6IDAsXHJcbiAgICAgICAgICAgICAgICBjb2RpbmdQYXNzZXM6IDBcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB6ZXJvQml0UGxhbmVzID0gbnVsbDtcclxuICAgICAgICBpZiAoIWlzQ29kZWJsb2NrQWxyZWFkeUluY2x1ZGVkLmlzSW5jbHVkZWQpIHtcclxuICAgICAgICAgICAgemVyb0JpdFBsYW5lcyA9IHplcm9CaXRQbGFuZXNUcmVlLmdldFZhbHVlKHgsIHkpO1xyXG4gICAgICAgICAgICBpZiAoemVyb0JpdFBsYW5lcyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGluZ1Bhc3NlcyA9IGNvZGluZ1Bhc3Nlc051bWJlclBhcnNlci5wYXJzZShiaXRzdHJlYW1SZWFkZXIpO1xyXG4gICAgICAgIGlmIChjb2RpbmdQYXNzZXMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZW5ndGhQYXJzZXIgPSBjb2RlYmxvY2tMZW5ndGhQYXJzZXJzW3hdW3ldO1xyXG4gICAgICAgIHZhciBib2R5TGVuZ3RoQnl0ZXMgPSBsZW5ndGhQYXJzZXIucGFyc2UoY29kaW5nUGFzc2VzKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYm9keUxlbmd0aEJ5dGVzID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpc0NvZGVibG9ja0FscmVhZHlJbmNsdWRlZC5pc0luY2x1ZGVkID0gdHJ1ZTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnl0ZXM6IGJvZHlMZW5ndGhCeXRlcyxcclxuICAgICAgICAgICAgY29kaW5nUGFzc2VzOiBjb2RpbmdQYXNzZXNcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoemVyb0JpdFBsYW5lcyAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXN1bHQuemVyb0JpdFBsYW5lcyA9IHplcm9CaXRQbGFuZXM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwVGFnVHJlZShcclxuICAgIGJpdHN0cmVhbVJlYWRlciwgd2lkdGgsIGhlaWdodCwgdHJhbnNhY3Rpb25IZWxwZXIpIHtcclxuICAgIFxyXG4gICAgdmFyIGlzQWxyZWFkeVJlYWRCaXRzVHJhbnNhY3Rpb25hbE9iamVjdCA9XHJcbiAgICAgICAgdHJhbnNhY3Rpb25IZWxwZXIuY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdChmYWxzZSwgLyppc1ZhbHVlVHlwZT0qL3RydWUpO1xyXG4gICAgdmFyIGxldmVscztcclxuICAgIFxyXG4gICAgY3JlYXRlTGV2ZWxzQXJyYXkoKTtcclxuICAgICAgICBcclxuICAgIHRoaXMuc2V0TWluaW1hbFZhbHVlSWZOb3RSZWFkQml0cyA9IGZ1bmN0aW9uIHNldE1pbmltYWxWYWx1ZUlmTm90UmVhZEJpdHMoXHJcbiAgICAgICAgbWluaW1hbFZhbHVlKSB7XHJcbiAgICBcclxuICAgICAgICBpZiAoaXNBbHJlYWR5UmVhZEJpdHMoKSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0cmFuc2FjdGlvbmFsT2JqZWN0ID0gbGV2ZWxzWzBdLmNvbnRlbnRbMF07XHJcbiAgICAgICAgdmFyIG5vZGUgPSB0cmFuc2FjdGlvbmFsT2JqZWN0LmdldFZhbHVlKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWUgPSBtaW5pbWFsVmFsdWU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmlzU21hbGxlclRoYW5PckVxdWFsc1RvID0gZnVuY3Rpb24gaXNTbWFsbGVyVGhhbk9yRXF1YWxzVG8oXHJcbiAgICAgICAgeCwgeSwgdmFsdWUpIHtcclxuICAgICAgICBcclxuICAgICAgICBzZXRBbHJlYWR5UmVhZEJpdHMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZ2V0TmV4dE5vZGUgPSBnZXRSb290VG9MZWFmSXRlcmF0b3IoeCwgeSk7XHJcbiAgICAgICAgdmFyIGN1cnJlbnROb2RlID0gZ2V0TmV4dE5vZGUoKTtcclxuICAgICAgICB2YXIgbGFzdE5vZGU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGN1cnJlbnROb2RlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50Tm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZSA+IHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghY3VycmVudE5vZGUuaXNGaW5hbFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWF4Qml0c1RvU2hpZnQgPSB2YWx1ZSAtIGN1cnJlbnROb2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlICsgMTtcclxuICAgICAgICAgICAgICAgIHZhciBhZGRUb1ZhbHVlID0gYml0c3RyZWFtUmVhZGVyLmNvdW50WmVyb3NBbmRTaGlmdFVudGlsRmlyc3RPbmVCaXQoXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4Qml0c1RvU2hpZnQpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGFkZFRvVmFsdWUgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWUgKz0gYWRkVG9WYWx1ZTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGFkZFRvVmFsdWUgPCBtYXhCaXRzVG9TaGlmdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnROb2RlLmlzRmluYWxWYWx1ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxhc3ROb2RlID0gY3VycmVudE5vZGU7XHJcbiAgICAgICAgICAgIGN1cnJlbnROb2RlID0gZ2V0TmV4dE5vZGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGxhc3ROb2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlIDw9IHZhbHVlO1xyXG4gICAgICAgIGlmIChyZXN1bHQgJiYgIWxhc3ROb2RlLmlzRmluYWxWYWx1ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdXcm9uZyBwYXJzaW5nIGluIFRhZ1RyZWUuaXNTbWFsbGVyVGhhbk9yRXF1YWxzVG86ICcgK1xyXG4gICAgICAgICAgICAgICAgJ25vdCBzdXJlIGlmIHZhbHVlIGlzIHNtYWxsZXIgdGhhbiBhc2tlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRWYWx1ZSA9IGZ1bmN0aW9uIGdldFZhbHVlKHgsIHkpIHtcclxuICAgICAgICB2YXIgZ2V0TmV4dE5vZGUgPSBnZXRSb290VG9MZWFmSXRlcmF0b3IoeCwgeSk7XHJcbiAgICAgICAgdmFyIGN1cnJlbnROb2RlID0gZ2V0TmV4dE5vZGUoKTtcclxuICAgICAgICB2YXIgbGVhZjtcclxuICAgICAgICBcclxuICAgICAgICBzZXRBbHJlYWR5UmVhZEJpdHMoKTtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoY3VycmVudE5vZGUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgaWYgKCFjdXJyZW50Tm9kZS5pc0ZpbmFsVmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHZhciBhZGRUb1ZhbHVlID1cclxuICAgICAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuY291bnRaZXJvc0FuZFNoaWZ0VW50aWxGaXJzdE9uZUJpdCgpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoYWRkVG9WYWx1ZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGN1cnJlbnROb2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlICs9IGFkZFRvVmFsdWU7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50Tm9kZS5pc0ZpbmFsVmFsdWUgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZWFmID0gY3VycmVudE5vZGU7XHJcbiAgICAgICAgICAgIGN1cnJlbnROb2RlID0gZ2V0TmV4dE5vZGUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGxlYWYubWluaW1hbFBvc3NpYmxlVmFsdWU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVMZXZlbHNBcnJheSgpIHtcclxuICAgICAgICBsZXZlbHMgPSBbXTtcclxuICAgICAgICB2YXIgbGV2ZWxXaWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHZhciBsZXZlbEhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAobGV2ZWxXaWR0aCA+PSAxIHx8IGxldmVsSGVpZ2h0ID49IDEpIHtcclxuICAgICAgICAgICAgbGV2ZWxXaWR0aCA9IE1hdGguY2VpbChsZXZlbFdpZHRoKTtcclxuICAgICAgICAgICAgbGV2ZWxIZWlnaHQgPSBNYXRoLmNlaWwobGV2ZWxIZWlnaHQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGVsZW1lbnRDb3VudCA9IGxldmVsV2lkdGggKiBsZXZlbEhlaWdodDtcclxuICAgICAgICAgICAgbGV2ZWxzLnVuc2hpZnQoe1xyXG4gICAgICAgICAgICAgICAgd2lkdGg6IGxldmVsV2lkdGgsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGxldmVsSGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgY29udGVudDogbmV3IEFycmF5KGVsZW1lbnRDb3VudClcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbGV2ZWxXaWR0aCAvPSAyO1xyXG4gICAgICAgICAgICBsZXZlbEhlaWdodCAvPSAyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpbml0Tm9kZSgwLCAwKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Um9vdFRvTGVhZkl0ZXJhdG9yKHgsIHkpIHtcclxuICAgICAgICB2YXIgbGV2ZWwgPSAwO1xyXG4gICAgICAgIHZhciBwcmV2SXRlcmF0ZWROb2RlID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBnZXROZXh0KCkge1xyXG4gICAgICAgICAgICBpZiAobGV2ZWwgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdJdGVyYXRlZCB0b28gZGVlcCBpbiB0YWcgdHJlZScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobGV2ZWwgPT09IGxldmVscy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIGxldmVsID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgc2hpZnRGYWN0b3IgPSBsZXZlbHMubGVuZ3RoIC0gbGV2ZWwgLSAxO1xyXG4gICAgICAgICAgICB2YXIgY3VycmVudFggPSBNYXRoLmZsb29yKHggPj4gc2hpZnRGYWN0b3IpO1xyXG4gICAgICAgICAgICB2YXIgY3VycmVudFkgPSBNYXRoLmZsb29yKHkgPj4gc2hpZnRGYWN0b3IpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGluZGV4SW5MZXZlbCA9IGxldmVsc1tsZXZlbF0ud2lkdGggKiBjdXJyZW50WSArIGN1cnJlbnRYO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHRyYW5zYWN0aW9uYWxPYmplY3QgPSBsZXZlbHNbbGV2ZWxdLmNvbnRlbnRbaW5kZXhJbkxldmVsXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh0cmFuc2FjdGlvbmFsT2JqZWN0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHRyYW5zYWN0aW9uYWxPYmplY3QgPSBpbml0Tm9kZShsZXZlbCwgaW5kZXhJbkxldmVsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxPYmplY3QuZ2V0VmFsdWUoXHJcbiAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHByZXZJdGVyYXRlZE5vZGUgIT09IG51bGwgJiZcclxuICAgICAgICAgICAgICAgIHByZXZJdGVyYXRlZE5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWUgPiByZXN1bHQubWluaW1hbFBvc3NpYmxlVmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmVzdWx0Lm1pbmltYWxQb3NzaWJsZVZhbHVlID0gcHJldkl0ZXJhdGVkTm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcHJldkl0ZXJhdGVkTm9kZSA9IHJlc3VsdDtcclxuICAgICAgICAgICAgKytsZXZlbDtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGdldE5leHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGluaXROb2RlKGxldmVsLCBpbmRleEluTGV2ZWwpIHtcclxuICAgICAgICB2YXIgb2JqZWN0VmFsdWUgPSB7XHJcbiAgICAgICAgICAgIG1pbmltYWxQb3NzaWJsZVZhbHVlOiAwLFxyXG4gICAgICAgICAgICBpc0ZpbmFsVmFsdWU6IGZhbHNlXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciB0cmFuc2FjdGlvbmFsT2JqZWN0ID0gdHJhbnNhY3Rpb25IZWxwZXIuY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdChcclxuICAgICAgICAgICAgb2JqZWN0VmFsdWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldmVsc1tsZXZlbF0uY29udGVudFtpbmRleEluTGV2ZWxdID0gdHJhbnNhY3Rpb25hbE9iamVjdDtcclxuICAgICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbE9iamVjdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaXNBbHJlYWR5UmVhZEJpdHMoKSB7XHJcbiAgICAgICAgdmFyIGlzQWxyZWFkeVJlYWRCaXRzVHJhbnNhY3Rpb25hbFZhbHVlID1cclxuICAgICAgICAgICAgaXNBbHJlYWR5UmVhZEJpdHNUcmFuc2FjdGlvbmFsT2JqZWN0LmdldFZhbHVlKFxyXG4gICAgICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXNBbHJlYWR5UmVhZEJpdHNUcmFuc2FjdGlvbmFsVmFsdWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNldEFscmVhZHlSZWFkQml0cygpIHtcclxuICAgICAgICBpc0FscmVhZHlSZWFkQml0c1RyYW5zYWN0aW9uYWxPYmplY3Quc2V0VmFsdWUoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbiwgdHJ1ZSk7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgICBjcmVhdGVUcmFuc2FjdGlvbjogZnVuY3Rpb24gY3JlYXRlVHJhbnNhY3Rpb24oKSB7XHJcbiAgICAgICAgLy8gVGhpcyBjb2RlIGlzIGV4ZWN1dGVkIGEgTE9ULiBGb3Igb3B0aW1pemF0aW9uLCBzdGF0ZSBpcyByZXByZXNlbnRlZFxyXG4gICAgICAgIC8vIGRpcmVjdGx5IGFzIG51bWJlcnMgKEkgY291bGRuJ3QgdGhpbmsgYWJvdXQgbW9yZSByZWFkYWJsZSB3YXkgd2hpY2hcclxuICAgICAgICAvLyBpcyBwZXJmb3JtYW5jZS1lcXVpdmFsZW50KS5cclxuICAgICAgICBcclxuICAgICAgICAvLyBzdGF0ZSA9IDEgPT0+IFRyYW5zYWN0aW9uIGlzIGFjdGl2ZVxyXG4gICAgICAgIC8vIHN0YXRlID0gMiA9PT4gVHJhbnNhY3Rpb24gaGFzIGNvbW1pdHRlZCBzdWNjZXNzZnVsbHlcclxuICAgICAgICAvLyBzdGF0ZSA9IDMgPT0+IFRyYW5zYWN0aW9uIGhhcyBiZWVuIGFib3J0ZWRcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3RhdGUgPSAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0cmFuc2FjdGlvbiA9IHtcclxuICAgICAgICAgICAgZ2V0IGlzQWJvcnRlZCgpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZSA9PT0gMztcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGdldCBpc0FjdGl2ZSgpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZSA9PT0gMTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbW1pdDogZnVuY3Rpb24gY29tbWl0KCkge1xyXG4gICAgICAgICAgICAgICAgdGVybWluYXRlKHRydWUpO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBhYm9ydDogZnVuY3Rpb24gYWJvcnQoKSB7XHJcbiAgICAgICAgICAgICAgICB0ZXJtaW5hdGUoZmFsc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiB0ZXJtaW5hdGUoaXNTdWNjZXNzZnVsXykge1xyXG4gICAgICAgICAgICBpZiAoIXRyYW5zYWN0aW9uLmlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ2Fubm90IHRlcm1pbmF0ZSBhbiBhbHJlYWR5IHRlcm1pbmF0ZWQgdHJhbnNhY3Rpb24nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzdGF0ZSA9IGlzU3VjY2Vzc2Z1bF8gPyAyIDogMztcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbjtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVRyYW5zYWN0aW9uYWxPYmplY3Q6IGZ1bmN0aW9uIGNvbW1pdFRyYW5zYWN0aW9uKFxyXG4gICAgICAgIGluaXRpYWxWYWx1ZSwgaXNWYWx1ZVR5cGUpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdmFsdWUgPSBudWxsO1xyXG4gICAgICAgIHZhciBwcmV2VmFsdWUgPSBpbml0aWFsVmFsdWU7XHJcbiAgICAgICAgdmFyIGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uID0ge1xyXG4gICAgICAgICAgICBpc0FjdGl2ZTogZmFsc2UsXHJcbiAgICAgICAgICAgIGlzQWJvcnRlZDogdHJ1ZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIHZhciBjbG9uZSA9IGlzVmFsdWVUeXBlID8gY2xvbmVWYWx1ZVR5cGUgOiBjbG9uZUJ5SlNPTjtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdHJhbnNhY3Rpb25hbE9iamVjdCA9IHtcclxuICAgICAgICAgICAgZ2V0VmFsdWU6IGZ1bmN0aW9uIGdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICBlbnN1cmVBbGxvd2VkQWNjZXNzKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24gPT09IGFjdGl2ZVRyYW5zYWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAobGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24uaXNBYm9ydGVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBjbG9uZShwcmV2VmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2VmFsdWUgPSBjbG9uZSh2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgbGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24gPSBhY3RpdmVUcmFuc2FjdGlvbjtcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHNldFZhbHVlOiBmdW5jdGlvbiBzZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbiwgbmV3VmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIGVuc3VyZUFsbG93ZWRBY2Nlc3MoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbiA9PT0gYWN0aXZlVHJhbnNhY3Rpb24pIHtcclxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IG5ld1ZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKCFsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbi5pc0Fib3J0ZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2VmFsdWUgPSBjbG9uZSh2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uID0gYWN0aXZlVHJhbnNhY3Rpb247XHJcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IG5ld1ZhbHVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBlbnN1cmVBbGxvd2VkQWNjZXNzKGFjdGl2ZVRyYW5zYWN0aW9uKSB7XHJcbiAgICAgICAgICAgIGlmICghYWN0aXZlVHJhbnNhY3Rpb24uaXNBY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDYW5ub3QgdXNlIHRlcm1pbmF0ZWQgdHJhbnNhY3Rpb24gdG8gYWNjZXNzIG9iamVjdHMnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFjdGl2ZVRyYW5zYWN0aW9uICE9PSBsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbiAmJlxyXG4gICAgICAgICAgICAgICAgbGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24uaXNBY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0Nhbm5vdCBzaW11bHRhbm91c2x5IGFjY2VzcyB0cmFuc2FjdGlvbmFsIG9iamVjdCAnICtcclxuICAgICAgICAgICAgICAgICAgICAnZnJvbSB0d28gYWN0aXZlIHRyYW5zYWN0aW9ucycpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIGNsb25lVmFsdWVUeXBlKHZhbHVlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gY2xvbmVCeUpTT04odmFsdWUpIHtcclxuICAgICAgICAgICAgdmFyIG5ld1ZhbHVlID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3VmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsT2JqZWN0O1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLkpwaXBJbWFnZSA9IHJlcXVpcmUoJ2pwaXAtaW1hZ2UuanMnKTtcclxubW9kdWxlLmV4cG9ydHMuUGRmanNKcHhEZWNvZGVyID0gcmVxdWlyZSgncGRmanMtanB4LWRlY29kZXIuanMnKTtcclxubW9kdWxlLmV4cG9ydHMuajJrRXhjZXB0aW9ucyA9IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnM7XHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zID0gakdsb2JhbHMuanBpcEV4Y2VwdGlvbnM7XHJcbm1vZHVsZS5leHBvcnRzLkludGVybmFscyA9IHtcclxuICAgIGpwaXBSdW50aW1lRmFjdG9yeTogcmVxdWlyZSgnanBpcC1ydW50aW1lLWZhY3RvcnkuanMnKSxcclxuICAgIGpHbG9iYWxzOiBqR2xvYmFsc1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcENvZGVzdHJlYW1SZWNvbnN0cnVjdG9yKFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICBoZWFkZXJNb2RpZmllcixcclxuICAgIHF1YWxpdHlMYXllcnNDYWNoZSkge1xyXG4gICAgXHJcbiAgICB0aGlzLnJlY29uc3RydWN0Q29kZXN0cmVhbSA9IGZ1bmN0aW9uIHJlY29uc3RydWN0Q29kZXN0cmVhbShcclxuICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xyXG4gICAgICAgIHZhciBjdXJyZW50T2Zmc2V0ID0gY3JlYXRlTWFpbkhlYWRlcihyZXN1bHQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50T2Zmc2V0ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtVGlsZXMgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWCgpICogY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1UaWxlc1koKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kZXN0cmVhbVBhcnQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzID0gJ21heCc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIHRpbGVJZCA9IDA7IHRpbGVJZCA8IG51bVRpbGVzOyArK3RpbGVJZCkge1xyXG4gICAgICAgICAgICB2YXIgdGlsZUJ5dGVzQ29waWVkID0gY3JlYXRlVGlsZShcclxuICAgICAgICAgICAgICAgIHJlc3VsdCxcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQsXHJcbiAgICAgICAgICAgICAgICB0aWxlSWQsXHJcbiAgICAgICAgICAgICAgICB0aWxlSWQsXHJcbiAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtUGFydCxcclxuICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCArPSB0aWxlQnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAodGlsZUJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFya2VyQnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMoXHJcbiAgICAgICAgICAgIHJlc3VsdCwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5FbmRPZkNvZGVzdHJlYW0pO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gbWFya2VyQnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgcmVzdWx0Lmxlbmd0aCA9IGN1cnJlbnRPZmZzZXQ7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNyZWF0ZUNvZGVzdHJlYW1Gb3JSZWdpb24gPSBmdW5jdGlvbiBjcmVhdGVDb2Rlc3RyZWFtRm9yUmVnaW9uKFxyXG4gICAgICAgIHBhcmFtcywgbWluTnVtUXVhbGl0eUxheWVycywgaXNPbmx5SGVhZGVyc1dpdGhvdXRCaXRzdHJlYW0pIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kZXN0cmVhbSA9IFtdO1xyXG4gICAgICAgIHZhciBjdXJyZW50T2Zmc2V0ID0gY3JlYXRlTWFpbkhlYWRlcihcclxuICAgICAgICAgICAgY29kZXN0cmVhbSwgcGFyYW1zLmxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudE9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJZFRvV3JpdGUgPSAwO1xyXG4gICAgICAgIHZhciB0aWxlSXRlcmF0b3IgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVzSXRlcmF0b3IocGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RUaWxlSWQgPSB0aWxlSXRlcmF0b3IudGlsZUluZGV4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdFRpbGVMZWZ0ID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlTGVmdChcclxuICAgICAgICAgICAgZmlyc3RUaWxlSWQsIHBhcmFtcy5sZXZlbCk7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZVRvcCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVRvcChcclxuICAgICAgICAgICAgZmlyc3RUaWxlSWQsIHBhcmFtcy5sZXZlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBvZmZzZXRYID0gcGFyYW1zLm1pblggLSBmaXJzdFRpbGVMZWZ0O1xyXG4gICAgICAgIHZhciBvZmZzZXRZID0gcGFyYW1zLm1pblkgLSBmaXJzdFRpbGVUb3A7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICB2YXIgdGlsZUlkT3JpZ2luYWwgPSB0aWxlSXRlcmF0b3IudGlsZUluZGV4O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHRpbGVCeXRlc0NvcGllZCA9IGNyZWF0ZVRpbGUoXHJcbiAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgICAgIHRpbGVJZFRvV3JpdGUrKyxcclxuICAgICAgICAgICAgICAgIHRpbGVJZE9yaWdpbmFsLFxyXG4gICAgICAgICAgICAgICAgcGFyYW1zLFxyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICAgICAgICAgIGlzT25seUhlYWRlcnNXaXRob3V0Qml0c3RyZWFtKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IHRpbGVCeXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHRpbGVCeXRlc0NvcGllZCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IHdoaWxlICh0aWxlSXRlcmF0b3IudHJ5QWR2YW5jZSgpKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFya2VyQnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW0sIGN1cnJlbnRPZmZzZXQsIGpHbG9iYWxzLmoya01hcmtlcnMuRW5kT2ZDb2Rlc3RyZWFtKTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IG1hcmtlckJ5dGVzQ29waWVkO1xyXG5cclxuICAgICAgICBoZWFkZXJNb2RpZmllci5tb2RpZnlJbWFnZVNpemUoY29kZXN0cmVhbSwgcGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29kZXN0cmVhbSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29kZXN0cmVhbS5sZW5ndGggPSBjdXJyZW50T2Zmc2V0O1xyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtOiBjb2Rlc3RyZWFtLFxyXG4gICAgICAgICAgICBvZmZzZXRYOiBvZmZzZXRYLFxyXG4gICAgICAgICAgICBvZmZzZXRZOiBvZmZzZXRZXHJcbiAgICAgICAgICAgIH07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNyZWF0ZUNvZGVzdHJlYW1Gb3JUaWxlID0gZnVuY3Rpb24gY3JlYXRlQ29kZXN0cmVhbUZvclRpbGUoXHJcbiAgICAgICAgdGlsZUlkLFxyXG4gICAgICAgIGxldmVsLFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMsXHJcbiAgICAgICAgcXVhbGl0eSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcclxuICAgICAgICB2YXIgY3VycmVudE9mZnNldCA9IGNyZWF0ZU1haW5IZWFkZXIocmVzdWx0LCBsZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRPRE86IERlbGV0ZSB0aGlzIGZ1bmN0aW9uIGFuZCB0ZXN0IGNyZWF0ZUNvZGVzdHJlYW1Gb3JSZWdpb24gaW5zdGVhZFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtUGFydFBhcmFtcyA9IHtcclxuICAgICAgICAgICAgbGV2ZWw6IGxldmVsLFxyXG4gICAgICAgICAgICBxdWFsaXR5OiBxdWFsaXR5XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVCeXRlc0NvcGllZCA9IGNyZWF0ZVRpbGUoXHJcbiAgICAgICAgICAgIHJlc3VsdCxcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgLyp0aWxlSWRUb1dyaXRlPSovMCxcclxuICAgICAgICAgICAgLyp0aWxlSWRPcmlnaW5hbD0qL3RpbGVJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IHRpbGVCeXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGlsZUJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIG1hcmtlckJ5dGVzQ29waWVkID0gY29weUJ5dGVzKFxyXG4gICAgICAgICAgICByZXN1bHQsIGN1cnJlbnRPZmZzZXQsIGpHbG9iYWxzLmoya01hcmtlcnMuRW5kT2ZDb2Rlc3RyZWFtKTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IG1hcmtlckJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1UaWxlc1ggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgIHZhciB0aWxlWCA9IHRpbGVJZCAlIG51bVRpbGVzWDtcclxuICAgICAgICB2YXIgdGlsZVkgPSBNYXRoLmZsb29yKHRpbGVJZCAvIG51bVRpbGVzWCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaGVhZGVyTW9kaWZpZXIubW9kaWZ5SW1hZ2VTaXplKHJlc3VsdCwge1xyXG4gICAgICAgICAgICBsZXZlbDogbGV2ZWwsXHJcbiAgICAgICAgICAgIG1pblRpbGVYOiB0aWxlWCxcclxuICAgICAgICAgICAgbWF4VGlsZVhFeGNsdXNpdmU6IHRpbGVYICsgMSxcclxuICAgICAgICAgICAgbWluVGlsZVk6IHRpbGVZLFxyXG4gICAgICAgICAgICBtYXhUaWxlWUV4Y2x1c2l2ZTogdGlsZVkgKyAxXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJlc3VsdC5sZW5ndGggPSBjdXJyZW50T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVNYWluSGVhZGVyKHJlc3VsdCwgbGV2ZWwpIHtcclxuICAgICAgICBpZiAoZGF0YWJpbnNTYXZlci5nZXRJc0pwaXBUaWxlUGFydFN0cmVhbSgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAncmVjb25zdHJ1Y3Rpb24gb2YgY29kZXN0cmVhbSBmcm9tIEpQVCAoSnBpcCBUaWxlLXBhcnQpIHN0cmVhbScsICdBLjMuNCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWFpbkhlYWRlciA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuICAgICAgICB2YXIgY3VycmVudE9mZnNldCA9IG1haW5IZWFkZXIuY29weUJ5dGVzKHJlc3VsdCwgLypzdGFydE9mZnNldD0qLzAsIHtcclxuICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWVcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0FkZGVkID0gaGVhZGVyTW9kaWZpZXIubW9kaWZ5TWFpbk9yVGlsZUhlYWRlcihcclxuICAgICAgICAgICAgcmVzdWx0LCBtYWluSGVhZGVyLCAvKm9mZnNldD0qLzAsIGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQWRkZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYnl0ZXNBZGRlZCA9IGFkZE1hbWF6YXZDb21tZW50KHJlc3VsdCwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0FkZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjdXJyZW50T2Zmc2V0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVUaWxlKFxyXG4gICAgICAgIHJlc3VsdCxcclxuICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgIHRpbGVJZFRvV3JpdGUsXHJcbiAgICAgICAgdGlsZUlkT3JpZ2luYWwsXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICBpc09ubHlIZWFkZXJzV2l0aG91dEJpdHN0cmVhbSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlU3RydWN0dXJlID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlU3RydWN0dXJlKFxyXG4gICAgICAgICAgICB0aWxlSWRPcmlnaW5hbCk7XHJcblxyXG4gICAgICAgIHZhciBzdGFydFRpbGVPZmZzZXQgPSBjdXJyZW50T2Zmc2V0O1xyXG4gICAgICAgIHZhciB0aWxlSGVhZGVyRGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0VGlsZUhlYWRlckRhdGFiaW4oXHJcbiAgICAgICAgICAgIHRpbGVJZE9yaWdpbmFsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGV2ZWw7XHJcbiAgICAgICAgaWYgKGNvZGVzdHJlYW1QYXJ0UGFyYW1zICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgbGV2ZWwgPSBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVIZWFkZXJPZmZzZXRzID0gY3JlYXRlVGlsZUhlYWRlckFuZEdldE9mZnNldHMoXHJcbiAgICAgICAgICAgIHJlc3VsdCxcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgdGlsZUhlYWRlckRhdGFiaW4sXHJcbiAgICAgICAgICAgIHRpbGVJZFRvV3JpdGUsXHJcbiAgICAgICAgICAgIGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGlsZUhlYWRlck9mZnNldHMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ID0gdGlsZUhlYWRlck9mZnNldHMuZW5kVGlsZUhlYWRlck9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzT25seUhlYWRlcnNXaXRob3V0Qml0c3RyZWFtKSB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlQnl0ZXNDb3BpZWQgPSBjcmVhdGVUaWxlQml0c3RyZWFtKFxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgICAgIHRpbGVTdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgICAgICB0aWxlSWRPcmlnaW5hbCxcclxuICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCArPSB0aWxlQnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAodGlsZUJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIGVuZFRpbGVPZmZzZXQgPSBjdXJyZW50T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBoZWFkZXJBbmREYXRhTGVuZ3RoID1cclxuICAgICAgICAgICAgZW5kVGlsZU9mZnNldCAtIHRpbGVIZWFkZXJPZmZzZXRzLnN0YXJ0T2ZUaWxlSGVhZGVyT2Zmc2V0O1xyXG5cclxuICAgICAgICBoZWFkZXJNb2RpZmllci5tb2RpZnlJbnQzMihcclxuICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICB0aWxlSGVhZGVyT2Zmc2V0cy5oZWFkZXJBbmREYXRhTGVuZ3RoUGxhY2Vob2xkZXJPZmZzZXQsXHJcbiAgICAgICAgICAgIGhlYWRlckFuZERhdGFMZW5ndGgpO1xyXG5cclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBlbmRUaWxlT2Zmc2V0IC0gc3RhcnRUaWxlT2Zmc2V0O1xyXG4gICAgICAgIHJldHVybiBieXRlc0NvcGllZDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlVGlsZUhlYWRlckFuZEdldE9mZnNldHMoXHJcbiAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQsXHJcbiAgICAgICAgdGlsZUhlYWRlckRhdGFiaW4sXHJcbiAgICAgICAgdGlsZUlkVG9Xcml0ZSxcclxuICAgICAgICBsZXZlbCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGFydE9mVGlsZUhlYWRlck9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICBcclxuICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMoXHJcbiAgICAgICAgICAgIHJlc3VsdCwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5TdGFydE9mVGlsZSk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBLjQuMlxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGFydE9mVGlsZVNlZ21lbnRMZW5ndGggPSBbMCwgMTBdOyAvLyBMc290XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBzdGFydE9mVGlsZVNlZ21lbnRMZW5ndGgpO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJbmRleCA9IFt0aWxlSWRUb1dyaXRlID4+PiA4LCB0aWxlSWRUb1dyaXRlICYgMHhGRl07IC8vIElzb3RcclxuICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIHRpbGVJbmRleCk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaGVhZGVyQW5kRGF0YUxlbmd0aFBsYWNlaG9sZGVyT2Zmc2V0ID0gY3VycmVudE9mZnNldDtcclxuICAgICAgICB2YXIgaGVhZGVyQW5kRGF0YUxlbmd0aFBsYWNlaG9sZGVyID0gWzAsIDAsIDAsIDBdOyAvLyBQc290XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBoZWFkZXJBbmREYXRhTGVuZ3RoUGxhY2Vob2xkZXIpO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVQYXJ0SW5kZXggPSBbMF07IC8vIFRQc290XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCB0aWxlUGFydEluZGV4KTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1iZXJPZlRpbGVwYXJ0cyA9IFsxXTsgLy8gVE5zb3RcclxuICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIG51bWJlck9mVGlsZXBhcnRzKTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhZnRlclN0YXJ0T2ZUaWxlU2VnbWVudE9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICAgICAgYnl0ZXNDb3BpZWQgPSB0aWxlSGVhZGVyRGF0YWJpbi5jb3B5Qnl0ZXMocmVzdWx0LCBjdXJyZW50T2Zmc2V0LCB7XHJcbiAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIC8vIE5PVEU6IENhbiBjcmVhdGUgZW1wdHkgdGlsZVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzRW5kZWRXaXRoU3RhcnRPZkRhdGFNYXJrZXIgPVxyXG4gICAgICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCAtIDJdID09PSBqR2xvYmFscy5qMmtNYXJrZXJzLlN0YXJ0T2ZEYXRhWzBdICYmXHJcbiAgICAgICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0IC0gMV0gPT09IGpHbG9iYWxzLmoya01hcmtlcnMuU3RhcnRPZkRhdGFbMV07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmICghaXNFbmRlZFdpdGhTdGFydE9mRGF0YU1hcmtlcikge1xyXG4gICAgICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhcclxuICAgICAgICAgICAgICAgIHJlc3VsdCwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5TdGFydE9mRGF0YSk7XHJcbiAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0FkZGVkID0gaGVhZGVyTW9kaWZpZXIubW9kaWZ5TWFpbk9yVGlsZUhlYWRlcihcclxuICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICB0aWxlSGVhZGVyRGF0YWJpbixcclxuICAgICAgICAgICAgYWZ0ZXJTdGFydE9mVGlsZVNlZ21lbnRPZmZzZXQsXHJcbiAgICAgICAgICAgIGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQWRkZWQ7XHJcblxyXG4gICAgICAgIHZhciBvZmZzZXRzID0ge1xyXG4gICAgICAgICAgICBzdGFydE9mVGlsZUhlYWRlck9mZnNldDogc3RhcnRPZlRpbGVIZWFkZXJPZmZzZXQsXHJcbiAgICAgICAgICAgIGhlYWRlckFuZERhdGFMZW5ndGhQbGFjZWhvbGRlck9mZnNldDogaGVhZGVyQW5kRGF0YUxlbmd0aFBsYWNlaG9sZGVyT2Zmc2V0LFxyXG4gICAgICAgICAgICBlbmRUaWxlSGVhZGVyT2Zmc2V0OiBjdXJyZW50T2Zmc2V0XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG9mZnNldHM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZVRpbGVCaXRzdHJlYW0oXHJcbiAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQsXHJcbiAgICAgICAgdGlsZVN0cnVjdHVyZSxcclxuICAgICAgICB0aWxlSWRPcmlnaW5hbCxcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVF1YWxpdHlMYXllcnNJblRpbGUgPSB0aWxlU3RydWN0dXJlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuICAgICAgICB2YXIgcXVhbGl0eTtcclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSB0aWxlU3RydWN0dXJlLmdldFByZWNpbmN0SXRlcmF0b3IoXHJcbiAgICAgICAgICAgIHRpbGVJZE9yaWdpbmFsLFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICAgICAgLyppc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0PSovdHJ1ZSk7XHJcblxyXG4gICAgICAgIHZhciBhbGxCeXRlc0NvcGllZCA9IDA7XHJcbiAgICAgICAgdmFyIGhhc01vcmVQYWNrZXRzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2Rlc3RyZWFtUGFydFBhcmFtcyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHF1YWxpdHkgPSBjb2Rlc3RyZWFtUGFydFBhcmFtcy5xdWFsaXR5O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobWluTnVtUXVhbGl0eUxheWVycyA9PT0gJ21heCcpIHtcclxuICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyA9IG51bVF1YWxpdHlMYXllcnNJblRpbGU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgdmFyIGVtcHR5UGFja2V0c1RvUHVzaCA9IG51bVF1YWxpdHlMYXllcnNJblRpbGU7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaXRlcmF0b3IuaXNJbkNvZGVzdHJlYW1QYXJ0KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgaW5DbGFzc0lkID1cclxuICAgICAgICAgICAgICAgICAgICB0aWxlU3RydWN0dXJlLnByZWNpbmN0UG9zaXRpb25Ub0luQ2xhc3NJbmRleChpdGVyYXRvcik7XHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3REYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRQcmVjaW5jdERhdGFiaW4oaW5DbGFzc0lkKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHF1YWxpdHlMYXllck9mZnNldCA9IHF1YWxpdHlMYXllcnNDYWNoZS5nZXRRdWFsaXR5TGF5ZXJPZmZzZXQoXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgICAgIHF1YWxpdHksXHJcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgYnl0ZXNUb0NvcHkgPSBxdWFsaXR5TGF5ZXJPZmZzZXQuZW5kT2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgZW1wdHlQYWNrZXRzVG9QdXNoID1cclxuICAgICAgICAgICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlIC0gcXVhbGl0eUxheWVyT2Zmc2V0Lm51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChxdWFsaXR5TGF5ZXJPZmZzZXQubnVtUXVhbGl0eUxheWVycyA8IG1pbk51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gcHJlY2luY3REYXRhYmluLmNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IGJ5dGVzVG9Db3B5XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChieXRlc0NvcGllZCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGJ5dGVzQ29waWVkID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBlbXB0eVBhY2tldHNUb1B1c2ggPSBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBhbGxCeXRlc0NvcGllZCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZW1wdHlQYWNrZXRzVG9QdXNoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhbGxCeXRlc0NvcGllZCArPSBlbXB0eVBhY2tldHNUb1B1c2g7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHdoaWxlIChpdGVyYXRvci50cnlBZHZhbmNlKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBhbGxCeXRlc0NvcGllZDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWRkTWFtYXphdkNvbW1lbnQocmVzdWx0LCBjdXJyZW50T2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIHN0YXJ0T2Zmc2V0ID0gY3VycmVudE9mZnNldDtcclxuICAgIFxyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMHhGRjtcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDB4NjQ7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAweDAwO1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMHgwOTtcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDc3O1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gOTc7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAxMDk7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSA5NztcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDEyMjtcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDk3O1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMTE4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0FkZGVkID0gY3VycmVudE9mZnNldCAtIHN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIHJldHVybiBieXRlc0FkZGVkO1xyXG4gICAgfVxyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gY29weUJ5dGVzKHJlc3VsdCwgcmVzdWx0U3RhcnRPZmZzZXQsIGJ5dGVzVG9Db3B5KSB7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlc1RvQ29weS5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICByZXN1bHRbaSArIHJlc3VsdFN0YXJ0T2Zmc2V0XSA9IGJ5dGVzVG9Db3B5W2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYnl0ZXNUb0NvcHkubGVuZ3RoO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcEhlYWRlck1vZGlmaWVyKFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSwgb2Zmc2V0c0NhbGN1bGF0b3IsIHByb2dyZXNzaW9uT3JkZXIpIHtcclxuXHJcbiAgICB2YXIgZW5jb2RlZFByb2dyZXNzaW9uT3JkZXIgPSBlbmNvZGVQcm9ncmVzc2lvbk9yZGVyKHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgICAgIFxyXG4gICAgdGhpcy5tb2RpZnlNYWluT3JUaWxlSGVhZGVyID0gZnVuY3Rpb24gbW9kaWZ5TWFpbk9yVGlsZUhlYWRlcihcclxuICAgICAgICByZXN1bHQsIG9yaWdpbmFsRGF0YWJpbiwgZGF0YWJpbk9mZnNldEluUmVzdWx0LCBsZXZlbCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1vZGlmeVByb2dyZXNzaW9uT3JkZXIocmVzdWx0LCBvcmlnaW5hbERhdGFiaW4sIGRhdGFiaW5PZmZzZXRJblJlc3VsdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGxldmVsID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBiZXN0UmVzb2x1dGlvbkxldmVsc1JhbmdlcyA9XHJcbiAgICAgICAgICAgIG9mZnNldHNDYWxjdWxhdG9yLmdldFJhbmdlc09mQmVzdFJlc29sdXRpb25MZXZlbHNEYXRhKFxyXG4gICAgICAgICAgICAgICAgb3JpZ2luYWxEYXRhYmluLCBsZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGJlc3RSZXNvbHV0aW9uTGV2ZWxzUmFuZ2VzLm51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdmFyIG9mZnNldCA9XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluT2Zmc2V0SW5SZXN1bHQgK1xyXG4gICAgICAgICAgICAgICAgYmVzdFJlc29sdXRpb25MZXZlbHNSYW5nZXMubnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXN1bHRbb2Zmc2V0XSAtPSBsZXZlbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzUmVtb3ZlZCA9IHJlbW92ZVJhbmdlcyhcclxuICAgICAgICAgICAgcmVzdWx0LCBiZXN0UmVzb2x1dGlvbkxldmVsc1Jhbmdlcy5yYW5nZXMsIGRhdGFiaW5PZmZzZXRJblJlc3VsdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQWRkZWQgPSAtYnl0ZXNSZW1vdmVkO1xyXG4gICAgICAgIHJldHVybiBieXRlc0FkZGVkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5tb2RpZnlJbWFnZVNpemUgPSBmdW5jdGlvbiBtb2RpZnlJbWFnZVNpemUocmVzdWx0LCBjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG4gICAgICAgIHZhciBuZXdUaWxlV2lkdGggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVXaWR0aChcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubGV2ZWwpO1xyXG4gICAgICAgIHZhciBuZXdUaWxlSGVpZ2h0ID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlSGVpZ2h0KFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG5ld1JlZmVyZW5jZUdyaWRTaXplID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRTaXplT2ZQYXJ0KFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNpek1hcmtlck9mZnNldCA9IG9mZnNldHNDYWxjdWxhdG9yLmdldEltYWdlQW5kVGlsZVNpemVPZmZzZXQoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0ID1cclxuICAgICAgICAgICAgc2l6TWFya2VyT2Zmc2V0ICsgakdsb2JhbHMuajJrT2Zmc2V0cy5SRUZFUkVOQ0VfR1JJRF9TSVpFX09GRlNFVF9BRlRFUl9TSVpfTUFSS0VSO1xyXG5cclxuICAgICAgICB2YXIgaW1hZ2VPZmZzZXRCeXRlc09mZnNldCA9IHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0ICsgODtcclxuICAgICAgICB2YXIgdGlsZVNpemVCeXRlc09mZnNldCA9IHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0ICsgMTY7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZU9mZnNldEJ5dGVzT2Zmc2V0ID0gcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgKyAyNDtcclxuICAgICAgICBcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0LCBuZXdSZWZlcmVuY2VHcmlkU2l6ZS53aWR0aCk7XHJcbiAgICAgICAgbW9kaWZ5SW50MzIocmVzdWx0LCByZWZlcmVuY2VHcmlkU2l6ZU9mZnNldCArIDQsIG5ld1JlZmVyZW5jZUdyaWRTaXplLmhlaWdodCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbW9kaWZ5SW50MzIocmVzdWx0LCB0aWxlU2l6ZUJ5dGVzT2Zmc2V0LCBuZXdUaWxlV2lkdGgpO1xyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgdGlsZVNpemVCeXRlc09mZnNldCArIDQsIG5ld1RpbGVIZWlnaHQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgaW1hZ2VPZmZzZXRCeXRlc09mZnNldCwgMCk7XHJcbiAgICAgICAgbW9kaWZ5SW50MzIocmVzdWx0LCBpbWFnZU9mZnNldEJ5dGVzT2Zmc2V0ICsgNCwgMCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIGZpcnN0VGlsZU9mZnNldEJ5dGVzT2Zmc2V0LCAwKTtcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIGZpcnN0VGlsZU9mZnNldEJ5dGVzT2Zmc2V0ICsgNCwgMCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLm1vZGlmeUludDMyID0gbW9kaWZ5SW50MzI7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIG1vZGlmeVByb2dyZXNzaW9uT3JkZXIocmVzdWx0LCBvcmlnaW5hbERhdGFiaW4sIGRhdGFiaW5PZmZzZXRJblJlc3VsdCkge1xyXG4gICAgICAgIHZhciBjb2RpbmdTdHlsZU9mZnNldCA9IG9mZnNldHNDYWxjdWxhdG9yLmdldENvZGluZ1N0eWxlT2Zmc2V0KG9yaWdpbmFsRGF0YWJpbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGluZ1N0eWxlT2Zmc2V0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHZhciBwcm9ncmVzc2lvbk9yZGVyT2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIGRhdGFiaW5PZmZzZXRJblJlc3VsdCArIGNvZGluZ1N0eWxlT2Zmc2V0ICsgNTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdFtwcm9ncmVzc2lvbk9yZGVyT2Zmc2V0XSA9IGVuY29kZWRQcm9ncmVzc2lvbk9yZGVyO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gcmVtb3ZlUmFuZ2VzKHJlc3VsdCwgcmFuZ2VzVG9SZW1vdmUsIGFkZE9mZnNldCkge1xyXG4gICAgICAgIGlmIChyYW5nZXNUb1JlbW92ZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7IC8vIHplcm8gYnl0ZXMgcmVtb3ZlZFxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlc1RvUmVtb3ZlLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgYWRkT2Zmc2V0ICtcclxuICAgICAgICAgICAgICAgIHJhbmdlc1RvUmVtb3ZlW2ldLm1hcmtlclNlZ21lbnRMZW5ndGhPZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIG9yaWdpbmFsTWFya2VyU2VnbWVudExlbmd0aCA9XHJcbiAgICAgICAgICAgICAgICAocmVzdWx0W29mZnNldF0gPDwgOCkgKyByZXN1bHRbb2Zmc2V0ICsgMV07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbmV3TWFya2VyU2VnbWVudExlbmd0aCA9XHJcbiAgICAgICAgICAgICAgICBvcmlnaW5hbE1hcmtlclNlZ21lbnRMZW5ndGggLSByYW5nZXNUb1JlbW92ZVtpXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXN1bHRbb2Zmc2V0XSA9IG5ld01hcmtlclNlZ21lbnRMZW5ndGggPj4+IDg7XHJcbiAgICAgICAgICAgIHJlc3VsdFtvZmZzZXQgKyAxXSA9IG5ld01hcmtlclNlZ21lbnRMZW5ndGggJiAweEZGO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgb2Zmc2V0VGFyZ2V0ID0gYWRkT2Zmc2V0ICsgcmFuZ2VzVG9SZW1vdmVbMF0uc3RhcnQ7XHJcbiAgICAgICAgdmFyIG9mZnNldFNvdXJjZSA9IG9mZnNldFRhcmdldDtcclxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHJhbmdlc1RvUmVtb3ZlLmxlbmd0aDsgKytqKSB7XHJcbiAgICAgICAgICAgIG9mZnNldFNvdXJjZSArPSByYW5nZXNUb1JlbW92ZVtqXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbmV4dFJhbmdlT2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIGogKyAxIDwgcmFuZ2VzVG9SZW1vdmUubGVuZ3RoID9cclxuICAgICAgICAgICAgICAgICAgICBhZGRPZmZzZXQgKyByYW5nZXNUb1JlbW92ZVtqICsgMV0uc3RhcnQgOlxyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5sZW5ndGg7XHJcblxyXG4gICAgICAgICAgICBmb3IgKDsgb2Zmc2V0U291cmNlIDwgbmV4dFJhbmdlT2Zmc2V0OyArK29mZnNldFNvdXJjZSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0W29mZnNldFRhcmdldF0gPSByZXN1bHRbb2Zmc2V0U291cmNlXTtcclxuICAgICAgICAgICAgICAgICsrb2Zmc2V0VGFyZ2V0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc1JlbW92ZWQgPSBvZmZzZXRTb3VyY2UgLSBvZmZzZXRUYXJnZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzUmVtb3ZlZDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBtb2RpZnlJbnQzMihieXRlcywgb2Zmc2V0LCBuZXdWYWx1ZSkge1xyXG4gICAgICAgIGJ5dGVzW29mZnNldCsrXSA9IG5ld1ZhbHVlID4+PiAyNDtcclxuICAgICAgICBieXRlc1tvZmZzZXQrK10gPSAobmV3VmFsdWUgPj4+IDE2KSAmIDB4RkY7XHJcbiAgICAgICAgYnl0ZXNbb2Zmc2V0KytdID0gKG5ld1ZhbHVlID4+PiA4KSAmIDB4RkY7XHJcbiAgICAgICAgYnl0ZXNbb2Zmc2V0KytdID0gbmV3VmFsdWUgJiAweEZGO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGVuY29kZVByb2dyZXNzaW9uT3JkZXIocHJvZ3Jlc3Npb25PcmRlcikge1xyXG4gICAgICAgIC8vIEEuNi4xXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGFibGUgQS4xNlxyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAocHJvZ3Jlc3Npb25PcmRlcikge1xyXG4gICAgICAgICAgICBjYXNlICdMUkNQJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ1JMQ1AnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIDE7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnUlBDTCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gMjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgJ1BDUkwnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIDM7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnQ1BSTCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gNDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbignUHJvZ3Jlc3Npb24gb3JkZXIgb2YgJyArIHByb2dyZXNzaW9uT3JkZXIsICdBLjYuMSwgdGFibGUgQS4xNicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBQYWNrZXRzRGF0YUNvbGxlY3RvcihcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgcXVhbGl0eUxheWVyc0NhY2hlLFxyXG4gICAganBpcEZhY3RvcnkpIHtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRBbGxDb2RlYmxvY2tzRGF0YSA9IGZ1bmN0aW9uIGdldENvZGVibG9ja3NEYXRhKFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBtaW5OdW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3MgPSBqcGlwRmFjdG9yeS5jcmVhdGVPYmplY3RQb29sQnlEYXRhYmluKCk7XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja3NEYXRhID0gZ2V0TmV3Q29kZWJsb2Nrc0RhdGFBbmRVcGRhdGVSZXR1cm5lZENvZGVibG9ja3MoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBtaW5OdW1RdWFsaXR5TGF5ZXJzLCBhbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjb2RlYmxvY2tzRGF0YTogY29kZWJsb2Nrc0RhdGEsXHJcbiAgICAgICAgICAgIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3M6IGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3NcclxuICAgICAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TmV3Q29kZWJsb2Nrc0RhdGFBbmRVcGRhdGVSZXR1cm5lZENvZGVibG9ja3MgPVxyXG4gICAgICAgIGdldE5ld0NvZGVibG9ja3NEYXRhQW5kVXBkYXRlUmV0dXJuZWRDb2RlYmxvY2tzO1xyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TmV3Q29kZWJsb2Nrc0RhdGFBbmRVcGRhdGVSZXR1cm5lZENvZGVibG9ja3MoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsIG1pbk51bVF1YWxpdHlMYXllcnMsIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3MpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUl0ZXJhdG9yID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlc0l0ZXJhdG9yKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQgPSAwO1xyXG4gICAgICAgIHZhciBkdW1teU9mZnNldCA9IDA7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgcGFja2V0RGF0YU9mZnNldHM6IFtdLFxyXG4gICAgICAgICAgICBkYXRhOiBqcGlwRmFjdG9yeS5jcmVhdGVDb21wb3NpdGVBcnJheShkdW1teU9mZnNldCksXHJcbiAgICAgICAgICAgIGFsbFJlbGV2YW50Qnl0ZXNMb2FkZWQ6IDBcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlU3RydWN0dXJlID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlU3RydWN0dXJlKFxyXG4gICAgICAgICAgICAgICAgdGlsZUl0ZXJhdG9yLnRpbGVJbmRleCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcHJlY2luY3RJdGVyYXRvciA9IHRpbGVTdHJ1Y3R1cmUuZ2V0UHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICAgICAgICAgIHRpbGVJdGVyYXRvci50aWxlSW5kZXgsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBxdWFsaXR5ID0gdGlsZVN0cnVjdHVyZS5nZXROdW1RdWFsaXR5TGF5ZXJzKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoY29kZXN0cmVhbVBhcnRQYXJhbXMucXVhbGl0eSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBxdWFsaXR5ID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgICAgICAgICAgcXVhbGl0eSwgY29kZXN0cmVhbVBhcnRQYXJhbXMucXVhbGl0eSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzID09PSAnbWF4Jykge1xyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyA9IHF1YWxpdHk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobWluTnVtUXVhbGl0eUxheWVycyA+IHF1YWxpdHkpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdtaW5OdW1RdWFsaXR5TGF5ZXJzIGlzIGxhcmdlciB0aGFuIHF1YWxpdHknKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFwcmVjaW5jdEl0ZXJhdG9yLmlzSW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBwcmVjaW5jdCBub3QgaW4gY29kZXN0cmVhbSBwYXJ0Jyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBpbkNsYXNzSW5kZXggPSB0aWxlU3RydWN0dXJlLnByZWNpbmN0UG9zaXRpb25Ub0luQ2xhc3NJbmRleChcclxuICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdEl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdERhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldFByZWNpbmN0RGF0YWJpbihcclxuICAgICAgICAgICAgICAgICAgICBpbkNsYXNzSW5kZXgpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcmV0dXJuZWRJblByZWNpbmN0ID1cclxuICAgICAgICAgICAgICAgICAgICBhbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzLmdldE9iamVjdChwcmVjaW5jdERhdGFiaW4pO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJldHVybmVkSW5QcmVjaW5jdC5sYXllclBlckNvZGVibG9jayA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuZWRJblByZWNpbmN0LmxheWVyUGVyQ29kZWJsb2NrID0gW107XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGxheWVyUmVhY2hlZCA9IHB1c2hQYWNrZXRzKFxyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCxcclxuICAgICAgICAgICAgICAgICAgICB0aWxlSW5kZXhJbkNvZGVzdHJlYW1QYXJ0LFxyXG4gICAgICAgICAgICAgICAgICAgIHByZWNpbmN0SXRlcmF0b3IsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybmVkSW5QcmVjaW5jdCxcclxuICAgICAgICAgICAgICAgICAgICBxdWFsaXR5KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGxheWVyUmVhY2hlZCA8IG1pbk51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiBhbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzIGlzIHdyb25nIGluIHRoaXMgc3RhZ2UsXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gYmVjYXVzZSBpdCB3YXMgdXBkYXRlZCB3aXRoIGEgZGF0YSB3aGljaCB3aWxsIG5vdCBiZVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIHJldHVybmVkLiBJIGRvbid0IGNhcmUgYWJvdXQgaXQgbm93IGJlY2F1c2UgcmV0dXJuaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gbnVsbCBoZXJlIG1lYW5zIHNvbWV0aGluZyBiYWQgaGFwcGVuZWQgKGFuIGV4Y2VwdGlvbiBpc1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIHRocm93biBpbiBSZXF1ZXN0Q29udGV4dCB3aGVuIHRoaXMgaGFwcGVucykuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgc29tZSBkYXkgdGhlIGNvbnNpc3RlbmN5IG9mIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3NcclxuICAgICAgICAgICAgICAgICAgICAvLyBpcyBpbXBvcnRhbnQgdGhlbiBhIG5ldyBvYmplY3Qgc2hvdWxkIGJlIHJldHVybmVkIG9uIGVhY2hcclxuICAgICAgICAgICAgICAgICAgICAvLyBjYWxsIHRvIHRoaXMgZnVuY3Rpb24sIG9yIGEgdHJhbnNhY3Rpb25hbCBzdHlsZSBzaG91bGQgYmVcclxuICAgICAgICAgICAgICAgICAgICAvLyB1c2VkIGhlcmUgdG8gYWJvcnQgYWxsIG5vbi1yZXR1cm5lZCBkYXRhLlxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IHdoaWxlIChwcmVjaW5jdEl0ZXJhdG9yLnRyeUFkdmFuY2UoKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICArK3RpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQ7XHJcbiAgICAgICAgfSB3aGlsZSAodGlsZUl0ZXJhdG9yLnRyeUFkdmFuY2UoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRhdGFBc1VpbnQ4ID0gbmV3IFVpbnQ4QXJyYXkocmVzdWx0LmRhdGEuZ2V0TGVuZ3RoKCkpO1xyXG4gICAgICAgIHJlc3VsdC5kYXRhLmNvcHlUb1R5cGVkQXJyYXkoZGF0YUFzVWludDgsIDAsIDAsIHJlc3VsdC5kYXRhLmdldExlbmd0aCgpKTtcclxuICAgICAgICByZXN1bHQuZGF0YSA9IGRhdGFBc1VpbnQ4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcHVzaFBhY2tldHMoXHJcbiAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgIHRpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQsXHJcbiAgICAgICAgcHJlY2luY3RJdGVyYXRvcixcclxuICAgICAgICBwcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgcmV0dXJuZWRDb2RlYmxvY2tzSW5QcmVjaW5jdCxcclxuICAgICAgICBxdWFsaXR5KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxheWVyO1xyXG4gICAgICAgIHZhciBvZmZzZXRJblByZWNpbmN0RGF0YWJpbjtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGxheWVyID0gMDsgbGF5ZXIgPCBxdWFsaXR5OyArK2xheWVyKSB7XHJcbiAgICAgICAgICAgIHZhciBjb2RlYmxvY2tPZmZzZXRzSW5EYXRhYmluID1cclxuICAgICAgICAgICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZS5nZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleChcclxuICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sIGxheWVyLCBwcmVjaW5jdEl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChjb2RlYmxvY2tPZmZzZXRzSW5EYXRhYmluID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgb2Zmc2V0SW5QcmVjaW5jdERhdGFiaW4gPVxyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrT2Zmc2V0c0luRGF0YWJpbi5oZWFkZXJTdGFydE9mZnNldCArXHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tPZmZzZXRzSW5EYXRhYmluLmhlYWRlckxlbmd0aDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBudW1Db2RlYmxvY2tzID1cclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHNJbkRhdGFiaW4uY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXgubGVuZ3RoO1xyXG4gICAgICAgICAgICB2YXIgY29kZWJsb2NrT2Zmc2V0c0luUmVzdWx0ID0gbmV3IEFycmF5KG51bUNvZGVibG9ja3MpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGlzSW5jb21wbGV0ZVBhY2tldCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Db2RlYmxvY2tzOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHZhciByZXR1cm5lZCA9IHJldHVybmVkQ29kZWJsb2Nrc0luUHJlY2luY3QubGF5ZXJQZXJDb2RlYmxvY2tbaV07XHJcbiAgICAgICAgICAgICAgICBpZiAocmV0dXJuZWQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybmVkID0geyBsYXllcjogLTEgfTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm5lZENvZGVibG9ja3NJblByZWNpbmN0LmxheWVyUGVyQ29kZWJsb2NrW2ldID0gcmV0dXJuZWQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJldHVybmVkLmxheWVyID49IGxheWVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBjb2RlYmxvY2sgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHNJbkRhdGFiaW4uY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXhbaV07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBvZmZzZXRJblJlc3VsdEFycmF5ID0gcmVzdWx0LmRhdGEuZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBieXRlc0NvcGllZCA9IHByZWNpbmN0RGF0YWJpbi5jb3B5VG9Db21wb3NpdGVBcnJheShcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQuZGF0YSxcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogb2Zmc2V0SW5QcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogY29kZWJsb2NrLmNvZGVibG9ja0JvZHlMZW5ndGhCeXRlcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWVcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGJ5dGVzQ29waWVkICE9PSBjb2RlYmxvY2suY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZWJsb2NrT2Zmc2V0c0luUmVzdWx0Lmxlbmd0aCA9IGk7XHJcbiAgICAgICAgICAgICAgICAgICAgaXNJbmNvbXBsZXRlUGFja2V0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuZWQubGF5ZXIgPSBsYXllcjtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHNJblJlc3VsdFtpXSA9IHtcclxuICAgICAgICAgICAgICAgICAgICBzdGFydDogb2Zmc2V0SW5SZXN1bHRBcnJheSxcclxuICAgICAgICAgICAgICAgICAgICBlbmQ6IG9mZnNldEluUmVzdWx0QXJyYXkgKyBjb2RlYmxvY2suY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzLFxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGluZ3Bhc3NlczogY29kZWJsb2NrLmNvZGluZ1Bhc3NlcyxcclxuICAgICAgICAgICAgICAgICAgICB6ZXJvQml0UGxhbmVzOiBjb2RlYmxvY2suemVyb0JpdFBsYW5lc1xyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIG9mZnNldEluUHJlY2luY3REYXRhYmluICs9IGNvZGVibG9jay5jb2RlYmxvY2tCb2R5TGVuZ3RoQnl0ZXM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBwYWNrZXQgPSB7XHJcbiAgICAgICAgICAgICAgICB0aWxlSW5kZXg6IHRpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQsXHJcbiAgICAgICAgICAgICAgICByOiBwcmVjaW5jdEl0ZXJhdG9yLnJlc29sdXRpb25MZXZlbCxcclxuICAgICAgICAgICAgICAgIHA6IHByZWNpbmN0SXRlcmF0b3IucHJlY2luY3RJbmRleEluQ29tcG9uZW50UmVzb2x1dGlvbixcclxuICAgICAgICAgICAgICAgIGM6IHByZWNpbmN0SXRlcmF0b3IuY29tcG9uZW50LFxyXG4gICAgICAgICAgICAgICAgbDogbGF5ZXIsXHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tPZmZzZXRzOiBjb2RlYmxvY2tPZmZzZXRzSW5SZXN1bHRcclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICByZXN1bHQucGFja2V0RGF0YU9mZnNldHMucHVzaChwYWNrZXQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzSW5jb21wbGV0ZVBhY2tldCkge1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVzdWx0LmFsbFJlbGV2YW50Qnl0ZXNMb2FkZWQgKz0gb2Zmc2V0SW5QcmVjaW5jdERhdGFiaW47XHJcbiAgICAgICAgcmV0dXJuIGxheWVyO1xyXG4gICAgfSAgICBcclxufTsiXX0=
