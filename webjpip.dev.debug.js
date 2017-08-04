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
		if (serverRequest !== null && dedicatedChannelHandle === null) {
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYXBpL2pwaXAtZmV0Y2guanMiLCJzcmMvYXBpL2pwaXAtZmV0Y2hlci5qcyIsInNyYy9hcGkvanBpcC1pbWFnZS1kYXRhLWNvbnRleHQuanMiLCJzcmMvYXBpL2pwaXAtaW1hZ2UuanMiLCJzcmMvYXBpL2pwaXAtbGV2ZWwtY2FsY3VsYXRvci5qcyIsInNyYy9hcGkvcGRmanMtanB4LWRlY29kZXIuanMiLCJzcmMvZGF0YWJpbnMvY29tcG9zaXRlLWFycmF5LmpzIiwic3JjL2RhdGFiaW5zL2pwaXAtZGF0YWJpbi1wYXJ0cy5qcyIsInNyYy9kYXRhYmlucy9qcGlwLWRhdGFiaW5zLXNhdmVyLmpzIiwic3JjL2RhdGFiaW5zL2pwaXAtb2JqZWN0LXBvb2wtYnktZGF0YWJpbi5qcyIsInNyYy9kYXRhYmlucy9qcGlwLXJlcXVlc3QtZGF0YWJpbnMtbGlzdGVuZXIuanMiLCJzcmMvaW1hZ2Utc3RydWN0dXJlcy9qcGlwLWNvZGVzdHJlYW0tc3RydWN0dXJlLmpzIiwic3JjL2ltYWdlLXN0cnVjdHVyZXMvanBpcC1jb21wb25lbnQtc3RydWN0dXJlLmpzIiwic3JjL2ltYWdlLXN0cnVjdHVyZXMvanBpcC1yZXF1ZXN0LXBhcmFtcy1tb2RpZmllci5qcyIsInNyYy9pbWFnZS1zdHJ1Y3R1cmVzL2pwaXAtdGlsZS1zdHJ1Y3R1cmUuanMiLCJzcmMvbWlzYy9qMmstanBpcC1nbG9iYWxzLmpzIiwic3JjL21pc2MvanBpcC1ydW50aW1lLWZhY3RvcnkuanMiLCJzcmMvbWlzYy9zaW1wbGUtYWpheC1oZWxwZXIuanMiLCJzcmMvcGFyc2Vycy9qcGlwLW1hcmtlcnMtcGFyc2VyLmpzIiwic3JjL3BhcnNlcnMvanBpcC1vZmZzZXRzLWNhbGN1bGF0b3IuanMiLCJzcmMvcGFyc2Vycy9qcGlwLXN0cnVjdHVyZS1wYXJzZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1jaGFubmVsLmpzIiwic3JjL3Byb3RvY29sL2pwaXAtbWVzc2FnZS1oZWFkZXItcGFyc2VyLmpzIiwic3JjL3Byb3RvY29sL2pwaXAtcmVjb25uZWN0YWJsZS1yZXF1ZXN0ZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1yZXF1ZXN0LmpzIiwic3JjL3Byb3RvY29sL2pwaXAtc2Vzc2lvbi1oZWxwZXIuanMiLCJzcmMvcHJvdG9jb2wvanBpcC1zZXNzaW9uLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtYml0c3RyZWFtLXJlYWRlci5qcyIsInNyYy9xdWFsaXR5LWxheWVycy9qcGlwLWNvZGVibG9jay1sZW5ndGgtcGFyc2VyLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtY29kaW5nLXBhc3Nlcy1udW1iZXItcGFyc2VyLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtcGFja2V0LWxlbmd0aC1jYWxjdWxhdG9yLmpzIiwic3JjL3F1YWxpdHktbGF5ZXJzL2pwaXAtcXVhbGl0eS1sYXllcnMtY2FjaGUuanMiLCJzcmMvcXVhbGl0eS1sYXllcnMvanBpcC1zdWJiYW5kLWxlbmd0aC1pbi1wYWNrZXQtaGVhZGVyLWNhbGN1bGF0b3IuanMiLCJzcmMvcXVhbGl0eS1sYXllcnMvanBpcC10YWctdHJlZS5qcyIsInNyYy9xdWFsaXR5LWxheWVycy9tdXR1YWwtZXhjbHVzaXZlLXRyYW5zYWN0aW9uLWhlbHBlci5qcyIsInNyYy93ZWJqcGlwLWV4cG9ydHMuanMiLCJzcmMvd3JpdGVycy9qcGlwLWNvZGVzdHJlYW0tcmVjb25zdHJ1Y3Rvci5qcyIsInNyYy93cml0ZXJzL2pwaXAtaGVhZGVyLW1vZGlmaWVyLmpzIiwic3JjL3dyaXRlcnMvanBpcC1wYWNrZXRzLWRhdGEtY29sbGVjdG9yLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdmtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25RQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9OQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9hQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBKcGlwRmV0Y2g7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5mdW5jdGlvbiBKcGlwRmV0Y2goZmV0Y2hDb250ZXh0LCByZXF1ZXN0ZXIsIHByb2dyZXNzaXZlbmVzcykge1xyXG5cdHZhciBjb2Rlc3RyZWFtUGFydFBhcmFtcyA9IG51bGw7XHJcblx0dmFyIGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPSBudWxsO1xyXG5cdHZhciBzZXJ2ZXJSZXF1ZXN0ID0gbnVsbDtcclxuICAgIHZhciBpc0ZhaWx1cmUgPSBmYWxzZTtcclxuXHR2YXIgaXNUZXJtaW5hdGVkID0gZmFsc2U7XHJcblx0dmFyIGlzUHJvZ3Jlc3NpdmUgPSBmYWxzZTtcclxuXHQvL3ZhciBpc0RvbmUgPSBmYWxzZTtcclxuICAgIHZhciByZXF1ZXN0ZWRQcm9ncmVzc2l2ZVN0YWdlID0gMDtcclxuICAgIC8vdmFyIHJlYWNoZWRRdWFsaXR5TGF5ZXIgPSAwO1xyXG5cdHZhciBuZXh0UHJvZ3Jlc3NpdmVTdGFnZSA9IDA7XHJcblx0XHJcblx0dGhpcy5zZXREZWRpY2F0ZWRDaGFubmVsSGFuZGxlID0gZnVuY3Rpb24gc2V0RGVkaWNhdGVkQ2hhbm5lbEhhbmRsZShcclxuXHRcdGRlZGljYXRlZENoYW5uZWxIYW5kbGVfKSB7XHJcblx0XHRcclxuXHRcdGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPSBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlXztcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMubW92ZSA9IGZ1bmN0aW9uIG1vdmUoY29kZXN0cmVhbVBhcnRQYXJhbXNfKSB7XHJcblx0XHRpZiAoZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSA9PT0gbnVsbCAmJiBjb2Rlc3RyZWFtUGFydFBhcmFtcyAhPT0gbnVsbCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuXHRcdFx0XHQnQ2Fubm90IG1vdmUgbm9uIG1vdmFibGUgZmV0Y2gnKTtcclxuXHRcdH1cclxuXHRcdGNvZGVzdHJlYW1QYXJ0UGFyYW1zID0gY29kZXN0cmVhbVBhcnRQYXJhbXNfO1xyXG5cdFx0cmVxdWVzdERhdGEoKTtcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMucmVzdW1lID0gZnVuY3Rpb24gcmVzdW1lKCkge1xyXG5cdFx0cmVxdWVzdERhdGEoKTtcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMuc3RvcCA9IGZ1bmN0aW9uIHN0b3AoKSB7XHJcblx0XHRpZiAoc2VydmVyUmVxdWVzdCA9PT0gbnVsbCkge1xyXG5cdFx0XHRpZiAoaXNUZXJtaW5hdGVkLyogfHwgaXNEb25lKi8pIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J0Nhbm5vdCBzdG9wIGFscmVhZHkgdGVybWluYXRlZCBmZXRjaCcpO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG5cdFx0XHRcdCdDYW5ub3Qgc3RvcCBhbHJlYWR5IHN0b3BwZWQgZmV0Y2gnKTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0aWYgKCFkZWRpY2F0ZWRDaGFubmVsSGFuZGxlKSB7XHJcblx0XHRcdHJlcXVlc3Rlci5zdG9wUmVxdWVzdEFzeW5jKHNlcnZlclJlcXVlc3QpO1xyXG5cdFx0XHRzZXJ2ZXJSZXF1ZXN0ID0gbnVsbDtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0Ly8gTk9URTogU2VuZCBhIHN0b3AgcmVxdWVzdCB3aXRoaW4gSnBpcFJlcXVlc3QgYW5kIHJlc29sdmUgdGhlIFByb21pc2VcclxuXHRcdC8vIG9ubHkgYWZ0ZXIgc2VydmVyIHJlc3BvbnNlIChUaGlzIGlzIG9ubHkgcGVyZm9ybWFuY2UgaXNzdWUsIG5vXHJcblx0XHQvLyBmdW5jdGlvbmFsIHByb2JsZW06IGEgbmV3IGZldGNoIHdpbGwgdHJpZ2dlciBhIEpQSVAgcmVxdWVzdCB3aXRoXHJcblx0XHQvLyB3YWl0PW5vLCBhbmQgdGhlIG9sZCByZXF1ZXN0IHdpbGwgYmUgYWN0dWFsbHkgc3RvcHBlZCkuXHJcblx0XHRyZXR1cm4gZmV0Y2hDb250ZXh0LnN0b3BwZWQoKTtcclxuXHR9O1xyXG5cdFxyXG5cdHRoaXMudGVybWluYXRlID0gZnVuY3Rpb24gdGVybWluYXRlKCkge1xyXG5cdFx0aWYgKGRlZGljYXRlZENoYW5uZWxIYW5kbGUpIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J1VuZXhwZWN0ZWQgdGVybWluYXRlIGV2ZW50IG9uIG1vdmFibGUgZmV0Y2gnKTtcclxuXHRcdH1cclxuXHRcdGlmIChpc1Rlcm1pbmF0ZWQpIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J0RvdWJsZSB0ZXJtaW5hdGUgZXZlbnQnKTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0c2VydmVyUmVxdWVzdCA9IG51bGw7XHJcblx0XHRpc1Rlcm1pbmF0ZWQgPSB0cnVlO1xyXG5cdH07XHJcblx0XHJcblx0dGhpcy5pc1Byb2dyZXNzaXZlQ2hhbmdlZCA9IGZ1bmN0aW9uIGlzUHJvZ3Jlc3NpdmVDaGFuZ2VkKGlzUHJvZ3Jlc3NpdmVfKSB7XHJcblx0XHRpc1Byb2dyZXNzaXZlID0gaXNQcm9ncmVzc2l2ZV87XHJcblx0XHRpZiAoZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSAmJiBzZXJ2ZXJSZXF1ZXN0ICE9PSBudWxsKSB7XHJcblx0XHRcdHNlcnZlclJlcXVlc3QgPSBudWxsO1xyXG5cdFx0XHRyZXF1ZXN0RGF0YSgpO1xyXG5cdFx0fVxyXG5cdH07XHJcblx0XHJcblx0ZnVuY3Rpb24gcmVxdWVzdERhdGEoKSB7XHJcblx0XHRpZiAobmV4dFByb2dyZXNzaXZlU3RhZ2UgPj0gcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuXHRcdFx0XHQnVW5leHBlY3RlZCByZXF1ZXN0RGF0YSgpIGFmdGVyIGZldGNoIGRvbmUnKTtcclxuXHRcdH1cclxuXHRcdGlmIChzZXJ2ZXJSZXF1ZXN0ICE9PSBudWxsICYmIGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPT09IG51bGwpIHtcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcblx0XHRcdFx0J0Nhbm5vdCByZXN1bWUgYWxyZWFkeS1hY3RpdmUtZmV0Y2gnKTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0aWYgKGlzVGVybWluYXRlZCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuXHRcdFx0XHQnQ2Fubm90IHJlc3VtZSBhbHJlYWR5LXRlcm1pbmF0ZWQtZmV0Y2gnKTtcclxuXHRcdH1cclxuXHJcblx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRpZiAobmV4dFByb2dyZXNzaXZlU3RhZ2UgPj0gcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCB8fFxyXG5cdFx0XHRcdHNlcnZlclJlcXVlc3QgIT09IG51bGwgfHxcclxuXHRcdFx0XHRpc1Rlcm1pbmF0ZWQpIHtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0Ly9pZiAoaXNEb25lKSB7XHJcblx0XHRcdC8vXHRyZXR1cm47XHJcblx0XHRcdC8vfVxyXG5cdFx0XHRcclxuXHRcdFx0cmVxdWVzdGVkUHJvZ3Jlc3NpdmVTdGFnZSA9XHJcblx0XHRcdFx0aXNQcm9ncmVzc2l2ZSA/IG5leHRQcm9ncmVzc2l2ZVN0YWdlIDogcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCAtIDE7XHJcblx0XHRcdFx0XHJcblx0XHRcdHNlcnZlclJlcXVlc3QgPSByZXF1ZXN0ZXIucmVxdWVzdERhdGEoXHJcblx0XHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcblx0XHRcdFx0cmVxdWVzdGVyQ2FsbGJhY2tPbkFsbERhdGFSZWNpZXZlZCxcclxuXHRcdFx0XHRyZXF1ZXN0ZXJDYWxsYmFja09uRmFpbHVyZSxcclxuXHRcdFx0XHRwcm9ncmVzc2l2ZW5lc3NbcmVxdWVzdGVkUHJvZ3Jlc3NpdmVTdGFnZV0ubWluTnVtUXVhbGl0eUxheWVycyxcclxuXHRcdFx0XHRkZWRpY2F0ZWRDaGFubmVsSGFuZGxlKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gcmVxdWVzdGVyQ2FsbGJhY2tPbkFsbERhdGFSZWNpZXZlZChyZXF1ZXN0LCBpc1Jlc3BvbnNlRG9uZSkge1xyXG5cdFx0c2VydmVyUmVxdWVzdCA9IG51bGw7XHJcblx0XHRpZiAoIWlzUmVzcG9uc2VEb25lKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0Ly9pZiAoaXNUZXJtaW5hdGVkICYmIHJlcXVlc3RlZFF1YWxpdHlMYXllciA+IHJlYWNoZWRRdWFsaXR5TGF5ZXIpIHtcclxuXHRcdC8vXHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcblx0XHQvL1x0XHQnSlBJUCBzZXJ2ZXIgbm90IHJldHVybmVkIGFsbCBkYXRhJywgJ0QuMycpO1xyXG5cdFx0Ly99XHJcblx0XHRuZXh0UHJvZ3Jlc3NpdmVTdGFnZSA9IHJlcXVlc3RlZFByb2dyZXNzaXZlU3RhZ2U7XHJcblx0XHRpZiAobmV4dFByb2dyZXNzaXZlU3RhZ2UgPj0gcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCkge1xyXG5cdFx0XHRmZXRjaENvbnRleHQuZG9uZSgpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdGZ1bmN0aW9uIHJlcXVlc3RlckNhbGxiYWNrT25GYWlsdXJlKCkge1xyXG5cdFx0Ly91cGRhdGVTdGF0dXMoU1RBVFVTX0VOREVELCAnZW5kQXN5bmMoKScpO1xyXG5cdFx0XHJcblx0XHQvL2lmIChmYWlsdXJlQ2FsbGJhY2sgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0Ly8gICAgZmFpbHVyZUNhbGxiYWNrKHNlbGYsIHVzZXJDb250ZXh0VmFycyk7XHJcblx0XHQvL30gZWxzZSB7XHJcblx0XHQvLyAgICBpc0ZhaWx1cmUgPSB0cnVlO1xyXG5cdFx0Ly99XHJcblx0XHRpc0ZhaWx1cmUgPSB0cnVlO1xyXG5cclxuXHRcdC8vaWYgKGlzTW92ZWQpIHtcclxuXHRcdC8vXHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuXHRcdC8vXHRcdCdGYWlsdXJlIGNhbGxiYWNrIHRvIGFuIG9sZCBmZXRjaCB3aGljaCBoYXMgYmVlbiBhbHJlYWR5IG1vdmVkJyk7XHJcblx0XHQvL31cclxuXHR9O1xyXG59XHJcblxyXG4vL2Z1bmN0aW9uIEpwaXBGZXRjaEhhbmRsZShyZXF1ZXN0ZXIsIGltYWdlRGF0YUNvbnRleHQsIGRlZGljYXRlZENoYW5uZWxIYW5kbGUpIHtcclxuLy8gICAgdGhpcy5fcmVxdWVzdGVyID0gcmVxdWVzdGVyO1xyXG4vLyAgICB0aGlzLl9pbWFnZURhdGFDb250ZXh0ID0gaW1hZ2VEYXRhQ29udGV4dDtcclxuLy8gICAgdGhpcy5fc2VydmVyUmVxdWVzdCA9IG51bGw7XHJcbi8vICAgIHRoaXMuX2RlZGljYXRlZENoYW5uZWxIYW5kbGUgPSBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlO1xyXG4vLyAgICB0aGlzLl9pc0ZhaWx1cmUgPSBmYWxzZTtcclxuLy8gICAgdGhpcy5faXNNb3ZlZCA9IGZhbHNlO1xyXG4vLyAgICB0aGlzLl9yZXF1ZXN0ZWRRdWFsaXR5TGF5ZXIgPSAwO1xyXG4vLyAgICB0aGlzLl9yZWFjaGVkUXVhbGl0eUxheWVyID0gMDtcclxuLy8gICAgdGhpcy5fcmVxdWVzdGVyQ2FsbGJhY2tPbkZhaWx1cmVCb3VuZCA9IHRoaXMuX3JlcXVlc3RlckNhbGxiYWNrT25GYWlsdXJlLmJpbmQodGhpcyk7XHJcbi8vICAgIFxyXG4vLyAgICBpZiAoaW1hZ2VEYXRhQ29udGV4dC5pc0Rpc3Bvc2VkKCkpIHtcclxuLy8gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4vLyAgICAgICAgICAgICdDYW5ub3QgaW5pdGlhbGl6ZSBKcGlwRmV0Y2hIYW5kbGUgd2l0aCBkaXNwb3NlZCBJbWFnZURhdGFDb250ZXh0Jyk7XHJcbi8vICAgIH1cclxuLy8gICAgaW1hZ2VEYXRhQ29udGV4dC5vbignZGF0YScsIHRoaXMuX29uRGF0YS5iaW5kKHRoaXMpKTtcclxuLy99XHJcbi8vXHJcbi8vSnBpcEZldGNoSGFuZGxlLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbiByZXN1bWUoKSB7XHJcbi8vICAgIGlmICh0aGlzLl9zZXJ2ZXJSZXF1ZXN0ICE9PSBudWxsKSB7XHJcbi8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuLy8gICAgICAgICAgICAnQ2Fubm90IHJlc3VtZSBhbHJlYWR5LWFjdGl2ZS1mZXRjaCcpO1xyXG4vLyAgICB9XHJcbi8vICAgIFxyXG4vLyAgICBpZiAodGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0Rpc3Bvc2VkKCkpIHtcclxuLy8gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4vLyAgICAgICAgICAgICdDYW5ub3QgZmV0Y2ggZGF0YSB3aXRoIGRpc3Bvc2VkIGltYWdlRGF0YUNvbnRleHQnKTtcclxuLy8gICAgfVxyXG4vLyAgICBcclxuLy8gICAgaWYgKHRoaXMuX2lzTW92ZWQpIHtcclxuLy8gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4vLyAgICAgICAgICAgICdDYW5ub3QgcmVzdW1lIG1vdmFibGUgZmV0Y2ggd2hpY2ggaGFzIGJlZW4gYWxyZWFkeSBtb3ZlZDsgU2hvdWxkJyArXHJcbi8vICAgICAgICAgICAgJyBzdGFydCBhIG5ldyBmZXRjaCB3aXRoIHNhbWUgZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSBpbnN0ZWFkJyk7XHJcbi8vICAgIH1cclxuLy8gICAgXHJcbi8vICAgIHRoaXMuX3JlcXVlc3REYXRhKCk7XHJcbi8vfTtcclxuLy9cclxuLy9KcGlwRmV0Y2hIYW5kbGUucHJvdG90eXBlLnN0b3BBc3luYyA9IGZ1bmN0aW9uIHN0b3BBc3luYygpIHtcclxuLy8gICAgaWYgKHRoaXMuX3NlcnZlclJlcXVlc3QgPT09IG51bGwpIHtcclxuLy8gICAgICAgIGlmICh0aGlzLl9pbWFnZURhdGFDb250ZXh0LmlzRGlzcG9zZWQoKSB8fCB0aGlzLl9pbWFnZURhdGFDb250ZXh0LmlzRG9uZSgpKSB7XHJcbi8vICAgICAgICAgICAgcmV0dXJuO1xyXG4vLyAgICAgICAgfVxyXG4vLyAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbi8vICAgICAgICAgICAgJ0Nhbm5vdCBzdG9wIGFscmVhZHkgc3RvcHBlZCBmZXRjaCcpO1xyXG4vLyAgICB9XHJcbi8vICAgIFxyXG4vLyAgICBpZiAodGhpcy5fZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSkge1xyXG4vLyAgICAgICAgdGhpcy5faXNNb3ZlZCA9IHRydWU7XHJcbi8vICAgIH0gZWxzZSB7XHJcbi8vICAgICAgICB0aGlzLl9yZXF1ZXN0ZXIuc3RvcFJlcXVlc3RBc3luYyh0aGlzLl9zZXJ2ZXJSZXF1ZXN0KTtcclxuLy8gICAgICAgIHRoaXMuX3NlcnZlclJlcXVlc3QgPSBudWxsO1xyXG4vLyAgICB9XHJcbi8vICAgIFxyXG4vLyAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbi8vICAgICAgICAvLyBOT1RFOiBTZW5kIGEgc3RvcCByZXF1ZXN0IHdpdGhpbiBKcGlwUmVxdWVzdCBhbmQgcmVzb2x2ZSB0aGUgUHJvbWlzZVxyXG4vLyAgICAgICAgLy8gb25seSBhZnRlciBzZXJ2ZXIgcmVzcG9uc2UgKFRoaXMgaXMgb25seSBwZXJmb3JtYW5jZSBpc3N1ZSwgbm9cclxuLy8gICAgICAgIC8vIGZ1bmN0aW9uYWwgcHJvYmxlbTogYSBuZXcgZmV0Y2ggd2lsbCB0cmlnZ2VyIGEgSlBJUCByZXF1ZXN0IHdpdGhcclxuLy8gICAgICAgIC8vIHdhaXQ9bm8sIGFuZCB0aGUgb2xkIHJlcXVlc3Qgd2lsbCBiZSBhY3R1YWxseSBzdG9wcGVkKS5cclxuLy8gICAgICAgIHJlc29sdmUoKTtcclxuLy8gICAgfSk7XHJcbi8vfTtcclxuLy9cclxuLy9KcGlwRmV0Y2hIYW5kbGUucHJvdG90eXBlLl9yZXF1ZXN0ZXJDYWxsYmFja09uQWxsRGF0YVJlY2lldmVkID1cclxuLy8gICAgZnVuY3Rpb24gKHJlcXVlc3QsIGlzUmVzcG9uc2VEb25lLCByZXF1ZXN0ZWRRdWFsaXR5TGF5ZXIpIHtcclxuLy8gICAgXHJcbi8vICAgIGlmIChpc1Jlc3BvbnNlRG9uZSAmJlxyXG4vLyAgICAgICAgIXRoaXMuX2lzTW92ZWQgJiZcclxuLy8gICAgICAgICF0aGlzLl9pbWFnZURhdGFDb250ZXh0LmlzRGlzcG9zZWQoKSAmJlxyXG4vLyAgICAgICAgcmVxdWVzdGVkUXVhbGl0eUxheWVyID4gdGhpcy5fcmVhY2hlZFF1YWxpdHlMYXllcikge1xyXG4vLyAgICAgICAgICAgIFxyXG4vLyAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4vLyAgICAgICAgICAgICdKUElQIHNlcnZlciBub3QgcmV0dXJuZWQgYWxsIGRhdGEnLCAnRC4zJyk7XHJcbi8vICAgIH1cclxuLy99O1xyXG4vL1xyXG4vL0pwaXBGZXRjaEhhbmRsZS5wcm90b3R5cGUuX3JlcXVlc3RlckNhbGxiYWNrT25GYWlsdXJlID1cclxuLy8gICAgZnVuY3Rpb24gcmVxdWVzdGVyQ2FsbGJhY2tPbkZhaWx1cmUoKSB7XHJcbi8vICAgICAgICBcclxuLy8gICAgLy91cGRhdGVTdGF0dXMoU1RBVFVTX0VOREVELCAnZW5kQXN5bmMoKScpO1xyXG4vLyAgICBcclxuLy8gICAgLy9pZiAoZmFpbHVyZUNhbGxiYWNrICE9PSB1bmRlZmluZWQpIHtcclxuLy8gICAgLy8gICAgZmFpbHVyZUNhbGxiYWNrKHNlbGYsIHVzZXJDb250ZXh0VmFycyk7XHJcbi8vICAgIC8vfSBlbHNlIHtcclxuLy8gICAgLy8gICAgaXNGYWlsdXJlID0gdHJ1ZTtcclxuLy8gICAgLy99XHJcbi8vICAgIHRoaXMuX2lzRmFpbHVyZSA9IHRydWU7XHJcbi8vXHJcbi8vICAgIGlmICh0aGlzLl9pc01vdmVkKSB7XHJcbi8vICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuLy8gICAgICAgICAgICAnRmFpbHVyZSBjYWxsYmFjayB0byBhbiBvbGQgZmV0Y2ggd2hpY2ggaGFzIGJlZW4gYWxyZWFkeSBtb3ZlZCcpO1xyXG4vLyAgICB9XHJcbi8vfTtcclxuLy9cclxuLy9KcGlwRmV0Y2hIYW5kbGUucHJvdG90eXBlLl9vbkRhdGEgPSBmdW5jdGlvbiBvbkRhdGEoaW1hZ2VEYXRhQ29udGV4dCkge1xyXG4vLyAgICB0aGlzLl9yZWFjaGVkUXVhbGl0eUxheWVyID0gdGhpcy5fcmVxdWVzdGVkUXVhbGl0eUxheWVyO1xyXG4vLyAgICBcclxuLy8gICAgaWYgKGltYWdlRGF0YUNvbnRleHQgIT09IHRoaXMuX2ltYWdlRGF0YUNvbnRleHQpIHtcclxuLy8gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4vLyAgICAgICAgICAgICdVbmV4cGVjdGVkIEltYWdlRGF0YUNvbnRleHQgaW4gRmV0Y2hIYW5kbGUgZXZlbnQnKTtcclxuLy8gICAgfVxyXG4vLyAgICBcclxuLy8gICAgaWYgKCF0aGlzLl9pc01vdmVkICYmXHJcbi8vICAgICAgICAhdGhpcy5faW1hZ2VEYXRhQ29udGV4dC5pc0Rpc3Bvc2VkKCkgJiZcclxuLy8gICAgICAgIHRoaXMuX3NlcnZlclJlcXVlc3QgIT09IG51bGwpIHtcclxuLy8gICAgICAgIFxyXG4vLyAgICAgICAgdGhpcy5fcmVxdWVzdERhdGEoKTtcclxuLy8gICAgfVxyXG4vL307XHJcbi8vXHJcbi8vSnBpcEZldGNoSGFuZGxlLnByb3RvdHlwZS5fcmVxdWVzdERhdGEgPSBmdW5jdGlvbiByZXF1ZXN0RGF0YSgpIHtcclxuLy8gICAgaWYgKHRoaXMuX2ltYWdlRGF0YUNvbnRleHQuaXNEb25lKCkpIHtcclxuLy8gICAgICAgIHJldHVybjtcclxuLy8gICAgfVxyXG4vLyAgICBcclxuLy8gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4vLyAgICB2YXIgbnVtUXVhbGl0eUxheWVyc1RvV2FpdCA9IHRoaXMuX2ltYWdlRGF0YUNvbnRleHQuZ2V0TmV4dFF1YWxpdHlMYXllcigpO1xyXG4vLyAgICB0aGlzLl9yZXF1ZXN0ZWRRdWFsaXR5TGF5ZXIgPSBudW1RdWFsaXR5TGF5ZXJzVG9XYWl0O1xyXG4vLyAgICAgICAgXHJcbi8vICAgIHRoaXMuX3NlcnZlclJlcXVlc3QgPSB0aGlzLl9yZXF1ZXN0ZXIucmVxdWVzdERhdGEoXHJcbi8vICAgICAgICB0aGlzLl9pbWFnZURhdGFDb250ZXh0LmdldENvZGVzdHJlYW1QYXJ0UGFyYW1zKCksXHJcbi8vICAgICAgICBmdW5jdGlvbiBhbGxEYXRhUmVjaWV2ZWQocmVxdWVzdCwgaXNSZXNwb25zZURvbmUpIHtcclxuLy8gICAgICAgICAgICBzZWxmLl9yZXF1ZXN0ZXJDYWxsYmFja09uQWxsRGF0YVJlY2lldmVkKFxyXG4vLyAgICAgICAgICAgICAgICByZXF1ZXN0LCBpc1Jlc3BvbnNlRG9uZSwgbnVtUXVhbGl0eUxheWVyc1RvV2FpdCk7XHJcbi8vICAgICAgICB9LFxyXG4vLyAgICAgICAgdGhpcy5fcmVxdWVzdGVyQ2FsbGJhY2tPbkZhaWx1cmVCb3VuZCxcclxuLy8gICAgICAgIG51bVF1YWxpdHlMYXllcnNUb1dhaXQsXHJcbi8vICAgICAgICB0aGlzLl9kZWRpY2F0ZWRDaGFubmVsSGFuZGxlKTtcclxuLy99OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxudmFyIGpwaXBGYWN0b3J5ID0gcmVxdWlyZSgnanBpcC1ydW50aW1lLWZhY3RvcnkuanMnKTsgXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEpwaXBGZXRjaGVyO1xyXG5cclxuZnVuY3Rpb24gSnBpcEZldGNoZXIoZGF0YWJpbnNTYXZlciwgb3B0aW9ucykge1xyXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcblxyXG5cdHZhciBpc09wZW5DYWxsZWQgPSBmYWxzZTtcclxuXHR2YXIgcmVzb2x2ZU9wZW4gPSBudWxsO1xyXG5cdHZhciByZWplY3RPcGVuID0gbnVsbDtcclxuICAgIHZhciBwcm9ncmVzc2lvbk9yZGVyID0gJ1JQQ0wnO1xyXG5cclxuICAgIHZhciBtYXhDaGFubmVsc0luU2Vzc2lvbiA9IG9wdGlvbnMubWF4Q2hhbm5lbHNJblNlc3Npb24gfHwgMTtcclxuICAgIHZhciBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCA9XHJcbiAgICAgICAgb3B0aW9ucy5tYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCB8fCAxO1xyXG5cclxuICAgIC8vdmFyIGRhdGFiaW5zU2F2ZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVEYXRhYmluc1NhdmVyKC8qaXNKcGlwVGlsZXBhcnRTdHJlYW09Ki9mYWxzZSk7XHJcbiAgICB2YXIgbWFpbkhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldE1haW5IZWFkZXJEYXRhYmluKCk7XHJcblxyXG4gICAgdmFyIG1hcmtlcnNQYXJzZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVNYXJrZXJzUGFyc2VyKG1haW5IZWFkZXJEYXRhYmluKTtcclxuICAgIHZhciBvZmZzZXRzQ2FsY3VsYXRvciA9IGpwaXBGYWN0b3J5LmNyZWF0ZU9mZnNldHNDYWxjdWxhdG9yKFxyXG4gICAgICAgIG1haW5IZWFkZXJEYXRhYmluLCBtYXJrZXJzUGFyc2VyKTtcclxuICAgIHZhciBzdHJ1Y3R1cmVQYXJzZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVTdHJ1Y3R1cmVQYXJzZXIoXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlciwgbWFya2Vyc1BhcnNlciwgb2Zmc2V0c0NhbGN1bGF0b3IpO1xyXG4gICAgdmFyIGNvZGVzdHJlYW1TdHJ1Y3R1cmUgPSBqcGlwRmFjdG9yeS5jcmVhdGVDb2Rlc3RyZWFtU3RydWN0dXJlKFxyXG4gICAgICAgIHN0cnVjdHVyZVBhcnNlciwgcHJvZ3Jlc3Npb25PcmRlcik7XHJcblxyXG5cdHZhciByZXF1ZXN0ZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVSZWNvbm5lY3RhYmxlUmVxdWVzdGVyKFxyXG4gICAgICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlcik7XHJcblxyXG5cdHZhciBwYXJhbXNNb2RpZmllciA9IGpwaXBGYWN0b3J5LmNyZWF0ZVJlcXVlc3RQYXJhbXNNb2RpZmllcihjb2Rlc3RyZWFtU3RydWN0dXJlKTtcclxuXHJcblx0cmVxdWVzdGVyLnNldFN0YXR1c0NhbGxiYWNrKHJlcXVlc3RlclN0YXR1c0NhbGxiYWNrKTtcclxuICAgIFxyXG4gICAgdGhpcy5vcGVuID0gZnVuY3Rpb24gb3BlbihiYXNlVXJsKSB7XHJcblx0XHRpZiAoaXNPcGVuQ2FsbGVkKSB7XHJcblx0XHRcdHRocm93ICd3ZWJKcGlwIGVycm9yOiBDYW5ub3QgY2FsbCBKcGlwRmV0Y2hlci5vcGVuKCkgdHdpY2UnO1xyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcblx0XHRcdHJlc29sdmVPcGVuID0gcmVzb2x2ZTtcclxuXHRcdFx0cmVqZWN0T3BlbiA9IHJlamVjdDtcclxuXHRcdFx0cmVxdWVzdGVyLm9wZW4oYmFzZVVybCk7XHJcblx0XHR9KTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2xvc2UgPSBmdW5jdGlvbiBjbG9zZSgpIHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3Rlci5jbG9zZShyZXNvbHZlKTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICBcclxuXHR0aGlzLm9uID0gZnVuY3Rpb24gb24oKSB7XHJcblx0XHQvLyBUT0RPIFdoZW4gSnBpcEZldGNoZXIgaXMgZnVsbHkgYWxpZ25lZCB0byBpbWFnZURlY29kZXJGcmFtZXdvcmsgbmV3IEFQSVxyXG5cdH07XHJcblxyXG5cdHRoaXMuc3RhcnRGZXRjaCA9IGZ1bmN0aW9uIHN0YXJ0RmV0Y2goZmV0Y2hDb250ZXh0LCBjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG5cdFx0dmFyIHBhcmFtcyA9IHBhcmFtc01vZGlmaWVyLm1vZGlmeShjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcblx0XHR2YXIgZmV0Y2ggPSBjcmVhdGVGZXRjaChmZXRjaENvbnRleHQsIHBhcmFtcy5wcm9ncmVzc2l2ZW5lc3MpO1xyXG5cdFx0XHJcblx0XHRmZXRjaC5tb3ZlKHBhcmFtcy5jb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5zdGFydE1vdmFibGVGZXRjaCA9IGZ1bmN0aW9uIHN0YXJ0TW92YWJsZUZldGNoKGZldGNoQ29udGV4dCwgY29kZXN0cmVhbVBhcnRQYXJhbXMpIHtcclxuXHRcdHZhciBwYXJhbXMgPSBwYXJhbXNNb2RpZmllci5tb2RpZnkoY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG5cdFx0dmFyIGZldGNoID0gY3JlYXRlRmV0Y2goZmV0Y2hDb250ZXh0LCBwYXJhbXMucHJvZ3Jlc3NpdmVuZXNzKTtcclxuXHJcbiAgICAgICAgdmFyIGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPSByZXF1ZXN0ZXIuZGVkaWNhdGVDaGFubmVsRm9yTW92YWJsZVJlcXVlc3QoKTtcclxuXHRcdGZldGNoLnNldERlZGljYXRlZENoYW5uZWxIYW5kbGUoZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSk7XHJcblx0XHRmZXRjaENvbnRleHQub24oJ21vdmUnLCBmZXRjaC5tb3ZlKTtcclxuXHJcblx0XHRmZXRjaC5tb3ZlKHBhcmFtcy5jb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcblx0fTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlRmV0Y2goZmV0Y2hDb250ZXh0LCBwcm9ncmVzc2l2ZW5lc3MpIHtcclxuICAgICAgICAvL3ZhciBpbWFnZURhdGFDb250ZXh0ID0ganBpcEZhY3RvcnkuY3JlYXRlSW1hZ2VEYXRhQ29udGV4dChcclxuICAgICAgICAvLyAgICBqcGlwT2JqZWN0c0ZvclJlcXVlc3RDb250ZXh0LFxyXG4gICAgICAgIC8vICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zTW9kaWZpZWQsXHJcbiAgICAgICAgLy8gICAgcHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQpO1xyXG4gICAgICAgIC8vICAgIC8ve1xyXG4gICAgICAgIC8vICAgIC8vICAgIGRpc2FibGVTZXJ2ZXJSZXF1ZXN0czogISFvcHRpb25zLmlzT25seVdhaXRGb3JEYXRhLFxyXG4gICAgICAgIC8vICAgIC8vICAgIGlzTW92YWJsZTogZmFsc2UsXHJcbiAgICAgICAgLy8gICAgLy8gICAgdXNlckNvbnRleHRWYXJzOiB1c2VyQ29udGV4dFZhcnMsXHJcbiAgICAgICAgLy8gICAgLy8gICAgZmFpbHVyZUNhbGxiYWNrOiBvcHRpb25zLmZhaWx1cmVDYWxsYmFja1xyXG4gICAgICAgIC8vICAgIC8vfSk7XHJcblx0XHRcclxuXHRcdHZhciBmZXRjaCA9IGpwaXBGYWN0b3J5LmNyZWF0ZUZldGNoKGZldGNoQ29udGV4dCwgcmVxdWVzdGVyLCBwcm9ncmVzc2l2ZW5lc3MpO1xyXG5cclxuXHRcdGZldGNoQ29udGV4dC5vbignaXNQcm9ncmVzc2l2ZUNoYW5nZWQnLCBmZXRjaC5pc1Byb2dyZXNzaXZlQ2hhbmdlZCk7XHJcblx0XHRmZXRjaENvbnRleHQub24oJ3Rlcm1pbmF0ZScsIGZldGNoLnRlcm1pbmF0ZSk7XHJcblx0XHRmZXRjaENvbnRleHQub24oJ3N0b3AnLCBmZXRjaC5zdG9wKTtcclxuXHRcdGZldGNoQ29udGV4dC5vbigncmVzdW1lJywgZmV0Y2gucmVzdW0pO1xyXG5cdFx0XHJcblx0XHRyZXR1cm4gZmV0Y2g7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vdGhpcy5zdGFydE1vdmFibGVGZXRjaCA9IGZ1bmN0aW9uIHN0YXJ0TW92YWJsZUZldGNoKGltYWdlRGF0YUNvbnRleHQsIG1vdmFibGVGZXRjaFN0YXRlKSB7XHJcbiAgICAvLyAgICBtb3ZhYmxlRmV0Y2hTdGF0ZS5kZWRpY2F0ZWRDaGFubmVsSGFuZGxlID1cclxuICAgIC8vICAgICAgICByZXF1ZXN0ZXIuZGVkaWNhdGVDaGFubmVsRm9yTW92YWJsZVJlcXVlc3QoKTtcclxuICAgIC8vICAgIG1vdmFibGVGZXRjaFN0YXRlLmZldGNoSGFuZGxlID0ganBpcEZhY3RvcnkuY3JlYXRlRmV0Y2hIYW5kbGUoXHJcbiAgICAvLyAgICAgICAgcmVxdWVzdGVyLCBpbWFnZURhdGFDb250ZXh0LCBtb3ZhYmxlRmV0Y2hTdGF0ZS5kZWRpY2F0ZWRDaGFubmVsSGFuZGxlKTtcclxuICAgIC8vICAgIG1vdmFibGVGZXRjaFN0YXRlLmZldGNoSGFuZGxlLnJlc3VtZSgpO1xyXG4gICAgLy99O1xyXG4gICAgLy9cclxuICAgIC8vdGhpcy5tb3ZlRmV0Y2ggPSBmdW5jdGlvbiBtb3ZlRmV0Y2goaW1hZ2VEYXRhQ29udGV4dCwgbW92YWJsZUZldGNoU3RhdGUpIHtcclxuICAgIC8vICAgIG1vdmFibGVGZXRjaFN0YXRlLmZldGNoSGFuZGxlLnN0b3BBc3luYygpO1xyXG4gICAgLy8gICAgbW92YWJsZUZldGNoU3RhdGUuZmV0Y2hIYW5kbGUgPSBqcGlwRmFjdG9yeS5jcmVhdGVGZXRjaEhhbmRsZShcclxuICAgIC8vICAgICAgICByZXF1ZXN0ZXIsIGltYWdlRGF0YUNvbnRleHQsIG1vdmFibGVGZXRjaFN0YXRlLmRlZGljYXRlZENoYW5uZWxIYW5kbGUpO1xyXG4gICAgLy8gICAgbW92YWJsZUZldGNoU3RhdGUuZmV0Y2hIYW5kbGUucmVzdW1lKCk7XHJcbiAgICAvL307XHJcbiAgICBcclxuICAgIHRoaXMucmVjb25uZWN0ID0gZnVuY3Rpb24gcmVjb25uZWN0KCkge1xyXG4gICAgICAgIHJlcXVlc3Rlci5yZWNvbm5lY3QoKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHJlcXVlc3RlclN0YXR1c0NhbGxiYWNrKHJlcXVlc3RlclN0YXR1cykge1xyXG4gICAgICAgIHZhciBzZXJpYWxpemFibGVFeGNlcHRpb24gPSBudWxsO1xyXG4gICAgICAgIGlmIChyZXF1ZXN0ZXJTdGF0dXMuZXhjZXB0aW9uICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNlcmlhbGl6YWJsZUV4Y2VwdGlvbiA9IHJlcXVlc3RlclN0YXR1cy5leGNlcHRpb24udG9TdHJpbmcoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0YXR1cyA9IHtcclxuICAgICAgICAgICAgaXNSZWFkeTogcmVxdWVzdGVyU3RhdHVzLmlzUmVhZHksXHJcbiAgICAgICAgICAgIGV4Y2VwdGlvbjogc2VyaWFsaXphYmxlRXhjZXB0aW9uXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcblx0XHRpZiAoIXJlc29sdmVPcGVuIHx8ICghc3RhdHVzLmlzUmVhZHkgJiYgIXN0YXR1cy5leGNlcHRpb24pKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0dmFyIGxvY2FsUmVzb2x2ZSA9IHJlc29sdmVPcGVuO1xyXG5cdFx0dmFyIGxvY2FsUmVqZWN0ID0gcmVqZWN0T3BlbjtcclxuXHRcdHJlc29sdmVPcGVuID0gbnVsbDtcclxuXHRcdHJlamVjdE9wZW4gPSBudWxsO1xyXG5cclxuXHRcdGlmICghc3RhdHVzLmlzUmVhZHkpIHtcclxuXHRcdFx0bG9jYWxSZWplY3Qoc3RhdHVzLmV4Y2VwdGlvbik7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdFxyXG4gICAgICAgIHZhciBwYXJhbXMgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFNpemVzUGFyYW1zKCk7XHJcbiAgICAgICAgdmFyIGNsb25lZFBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldERlZmF1bHRUaWxlU3RydWN0dXJlKCk7XHJcbiAgICAgICAgdmFyIGNvbXBvbmVudCA9IHRpbGUuZ2V0RGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZSgpO1xyXG5cclxuXHRcdGNsb25lZFBhcmFtcy5pbWFnZUxldmVsID0gMDtcclxuXHRcdGNsb25lZFBhcmFtcy5sb3dlc3RRdWFsaXR5ID0gMTtcclxuICAgICAgICBjbG9uZWRQYXJhbXMuaGlnaGVzdFF1YWxpdHkgPSB0aWxlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuICAgICAgICBjbG9uZWRQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc0ZvckxpbWl0dGVkVmlld2VyID1cclxuICAgICAgICAgICAgY29tcG9uZW50LmdldE51bVJlc29sdXRpb25MZXZlbHMoKTtcclxuICAgICAgICBcclxuXHRcdGxvY2FsUmVzb2x2ZShjbG9uZWRQYXJhbXMpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcztcclxufSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gSnBpcEltYWdlRGF0YUNvbnRleHQ7XHJcblxyXG5mdW5jdGlvbiBKcGlwSW1hZ2VEYXRhQ29udGV4dChqcGlwT2JqZWN0cywgY29kZXN0cmVhbVBhcnRQYXJhbXMsIHByb2dyZXNzaXZlbmVzcykge1xyXG4gICAgdGhpcy5fY29kZXN0cmVhbVBhcnRQYXJhbXMgPSBjb2Rlc3RyZWFtUGFydFBhcmFtcztcclxuICAgIHRoaXMuX3Byb2dyZXNzaXZlbmVzcyAgICAgID0gcHJvZ3Jlc3NpdmVuZXNzO1xyXG4gICAgdGhpcy5fcmVjb25zdHJ1Y3RvciAgICAgICAgPSBqcGlwT2JqZWN0cy5yZWNvbnN0cnVjdG9yO1xyXG4gICAgdGhpcy5fcGFja2V0c0RhdGFDb2xsZWN0b3IgPSBqcGlwT2JqZWN0cy5wYWNrZXRzRGF0YUNvbGxlY3RvcjtcclxuICAgIHRoaXMuX3F1YWxpdHlMYXllcnNDYWNoZSAgID0ganBpcE9iamVjdHMucXVhbGl0eUxheWVyc0NhY2hlO1xyXG4gICAgdGhpcy5fY29kZXN0cmVhbVN0cnVjdHVyZSAgPSBqcGlwT2JqZWN0cy5jb2Rlc3RyZWFtU3RydWN0dXJlO1xyXG4gICAgdGhpcy5fZGF0YWJpbnNTYXZlciAgICAgICAgPSBqcGlwT2JqZWN0cy5kYXRhYmluc1NhdmVyO1xyXG4gICAgdGhpcy5fanBpcEZhY3RvcnkgICAgICAgICAgPSBqcGlwT2JqZWN0cy5qcGlwRmFjdG9yeTtcclxuXHJcbiAgICB0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkID0gMDtcclxuICAgIHRoaXMuX3F1YWxpdHlMYXllcnNSZWFjaGVkID0gMDtcclxuICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnMgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5fbGlzdGVuZXIgPSB0aGlzLl9qcGlwRmFjdG9yeS5jcmVhdGVSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcihcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICB0aGlzLl9xdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2suYmluZCh0aGlzKSxcclxuICAgICAgICB0aGlzLl9jb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgIHRoaXMuX2RhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgdGhpcy5fcXVhbGl0eUxheWVyc0NhY2hlKTtcclxufVxyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmhhc0RhdGEgPSBmdW5jdGlvbiBoYXNEYXRhKCkge1xyXG4gICAgLy9lbnN1cmVOb0ZhaWx1cmUoKTtcclxuICAgIHRoaXMuX2Vuc3VyZU5vdERpc3Bvc2VkKCk7XHJcbiAgICByZXR1cm4gdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA+IDA7XHJcbn07XHJcblxyXG5KcGlwSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuZ2V0RmV0Y2hlZERhdGEgPSBmdW5jdGlvbiBnZXRGZXRjaGVkRGF0YShxdWFsaXR5KSB7XHJcbiAgICB0aGlzLl9lbnN1cmVOb3REaXNwb3NlZCgpO1xyXG4gICAgaWYgKCF0aGlzLmhhc0RhdGEoKSkge1xyXG4gICAgICAgIHRocm93ICdKcGlwSW1hZ2VEYXRhQ29udGV4dCBlcnJvcjogY2Fubm90IGNhbGwgZ2V0RmV0Y2hlZERhdGEgYmVmb3JlIGhhc0RhdGEgPSB0cnVlJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy9lbnN1cmVOb0ZhaWx1cmUoKTtcclxuICAgIHZhciBwYXJhbXMgPSB0aGlzLl9nZXRQYXJhbXNGb3JEYXRhV3JpdGVyKHF1YWxpdHkpO1xyXG4gICAgdmFyIGNvZGVibG9ja3MgPSB0aGlzLl9wYWNrZXRzRGF0YUNvbGxlY3Rvci5nZXRBbGxDb2RlYmxvY2tzRGF0YShcclxuICAgICAgICBwYXJhbXMuY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgcGFyYW1zLm1pbk51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgXHJcbiAgICB2YXIgaGVhZGVyc0NvZGVzdHJlYW0gPSB0aGlzLl9yZWNvbnN0cnVjdG9yLmNyZWF0ZUNvZGVzdHJlYW1Gb3JSZWdpb24oXHJcbiAgICAgICAgcGFyYW1zLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIHBhcmFtcy5taW5OdW1RdWFsaXR5TGF5ZXJzLFxyXG4gICAgICAgIC8qaXNPbmx5SGVhZGVyc1dpdGhvdXRCaXRzdHJlYW09Ki90cnVlKTtcclxuICAgIFxyXG4gICAgaWYgKGNvZGVibG9ja3MuY29kZWJsb2Nrc0RhdGEgPT09IG51bGwpIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0NvdWxkIG5vdCBjb2xsZWN0IGNvZGVibG9ja3MgYWx0aG91Z2ggcHJvZ3Jlc3NpdmVuZXNzICcgK1xyXG4gICAgICAgICAgICAnc3RhZ2UgaGFzIGJlZW4gcmVhY2hlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoaGVhZGVyc0NvZGVzdHJlYW0gPT09IG51bGwpIHtcclxuICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0NvdWxkIG5vdCByZWNvbnN0cnVjdCBjb2Rlc3RyZWFtIGFsdGhvdWdoICcgK1xyXG4gICAgICAgICAgICAncHJvZ3Jlc3NpdmVuZXNzIHN0YWdlIGhhcyBiZWVuIHJlYWNoZWQnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy9hbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzID0gY29kZWJsb2Nrcy5hbHJlYWR5UmV0dXJuZWRDb2RlYmxvY2tzO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBoZWFkZXJzQ29kZXN0cmVhbTogaGVhZGVyc0NvZGVzdHJlYW0sXHJcbiAgICAgICAgY29kZWJsb2Nrc0RhdGE6IGNvZGVibG9ja3MuY29kZWJsb2Nrc0RhdGEsXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXM6IHRoaXMuX2NvZGVzdHJlYW1QYXJ0UGFyYW1zXHJcbiAgICB9O1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmdldEZldGNoZWREYXRhQXNDb2Rlc3RyZWFtID0gZnVuY3Rpb24gZ2V0RmV0Y2hlZERhdGFBc0NvZGVzdHJlYW0ocXVhbGl0eSkge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIC8vZW5zdXJlTm9GYWlsdXJlKCk7XHJcbiAgICBcclxuICAgIHZhciBwYXJhbXMgPSB0aGlzLl9nZXRQYXJhbXNGb3JEYXRhV3JpdGVyKHF1YWxpdHkpO1xyXG4gICAgXHJcbiAgICB2YXIgY29kZXN0cmVhbSA9IHRoaXMuX3JlY29uc3RydWN0b3IuY3JlYXRlQ29kZXN0cmVhbUZvclJlZ2lvbihcclxuICAgICAgICBwYXJhbXMuY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgcGFyYW1zLm1pbk51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgXHJcbiAgICBpZiAoY29kZXN0cmVhbSA9PT0gbnVsbCkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ291bGQgbm90IHJlY29uc3RydWN0IGNvZGVzdHJlYW0gYWx0aG91Z2ggJyArXHJcbiAgICAgICAgICAgICdwcm9ncmVzc2l2ZW5lc3Mgc3RhZ2UgaGFzIGJlZW4gcmVhY2hlZCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gY29kZXN0cmVhbTtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uIG9uKGV2ZW50LCBsaXN0ZW5lcikge1xyXG4gICAgdGhpcy5fZW5zdXJlTm90RGlzcG9zZWQoKTtcclxuICAgIGlmIChldmVudCAhPT0gJ2RhdGEnKSB7XHJcbiAgICAgICAgdGhyb3cgJ0pwaXBJbWFnZURhdGFDb250ZXh0IGVycm9yOiBVbmV4cGVjdGVkIGV2ZW50ICcgKyBldmVudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fZGF0YUxpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxufTtcclxuXHJcbkpwaXBJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5pc0RvbmUgPSBmdW5jdGlvbiBpc0RvbmUoKSB7XHJcbiAgICB0aGlzLl9lbnN1cmVOb3REaXNwb3NlZCgpO1xyXG4gICAgcmV0dXJuIHRoaXMuX2lzUmVxdWVzdERvbmU7XHJcbn07XHJcblxyXG5KcGlwSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuZGlzcG9zZSA9IGZ1bmN0aW9uIGRpc3Bvc2UoKSB7XHJcbiAgICB0aGlzLl9lbnN1cmVOb3REaXNwb3NlZCgpO1xyXG4gICAgdGhpcy5fbGlzdGVuZXIudW5yZWdpc3RlcigpO1xyXG4gICAgdGhpcy5fbGlzdGVuZXIgPSBudWxsO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLnNldElzUHJvZ3Jlc3NpdmUgPSBmdW5jdGlvbiBzZXRJc1Byb2dyZXNzaXZlKGlzUHJvZ3Jlc3NpdmUpIHtcclxuICAgIHRoaXMuX2Vuc3VyZU5vdERpc3Bvc2VkKCk7XHJcbiAgICB2YXIgb2xkSXNQcm9ncmVzc2l2ZSA9IHRoaXMuX2lzUHJvZ3Jlc3NpdmU7XHJcbiAgICB0aGlzLl9pc1Byb2dyZXNzaXZlID0gaXNQcm9ncmVzc2l2ZTtcclxuICAgIGlmICghb2xkSXNQcm9ncmVzc2l2ZSAmJiBpc1Byb2dyZXNzaXZlICYmIHRoaXMuaGFzRGF0YSgpKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLl9kYXRhTGlzdGVuZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnNbaV0odGhpcyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuLy8gTWV0aG9kcyBmb3IgSnBpcEZldGNoSGFuZGxlXHJcblxyXG5KcGlwSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuaXNEaXNwb3NlZCA9IGZ1bmN0aW9uIGlzRGlzcG9zZWQoKSB7XHJcbiAgICByZXR1cm4gIXRoaXMuX2xpc3RlbmVyO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmdldENvZGVzdHJlYW1QYXJ0UGFyYW1zID1cclxuICAgIGZ1bmN0aW9uIGdldENvZGVzdHJlYW1QYXJ0UGFyYW1zKCkge1xyXG4gICAgICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuX2NvZGVzdHJlYW1QYXJ0UGFyYW1zO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmdldE5leHRRdWFsaXR5TGF5ZXIgPVxyXG4gICAgZnVuY3Rpb24gZ2V0TmV4dFF1YWxpdHlMYXllcigpIHtcclxuICAgICAgICBcclxuICAgIHJldHVybiB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZF0ubWluTnVtUXVhbGl0eUxheWVycztcclxufTtcclxuXHJcbi8vIFByaXZhdGUgbWV0aG9kc1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl90cnlBZHZhbmNlUHJvZ3Jlc3NpdmVTdGFnZSA9IGZ1bmN0aW9uIHRyeUFkdmFuY2VQcm9ncmVzc2l2ZVN0YWdlKCkge1xyXG4gICAgdmFyIG51bVF1YWxpdHlMYXllcnNUb1dhaXQgPSB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbXHJcbiAgICAgICAgdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZF0ubWluTnVtUXVhbGl0eUxheWVycztcclxuXHJcbiAgICBpZiAodGhpcy5fcXVhbGl0eUxheWVyc1JlYWNoZWQgPCBudW1RdWFsaXR5TGF5ZXJzVG9XYWl0KSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fcXVhbGl0eUxheWVyc1JlYWNoZWQgPT09ICdtYXgnKSB7XHJcbiAgICAgICAgdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9IHRoaXMuX3Byb2dyZXNzaXZlbmVzcy5sZW5ndGg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHdoaWxlICh0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkIDwgdGhpcy5fcHJvZ3Jlc3NpdmVuZXNzLmxlbmd0aCkge1xyXG4gICAgICAgIHZhciBxdWFsaXR5TGF5ZXJzUmVxdWlyZWQgPSB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbXHJcbiAgICAgICAgICAgIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWRdLm1pbk51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHF1YWxpdHlMYXllcnNSZXF1aXJlZCA9PT0gJ21heCcgfHxcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyc1JlcXVpcmVkID4gdGhpcy5fcXVhbGl0eUxheWVyc1JlYWNoZWQpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICArK3RoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRmluaXNoZWQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2lzUmVxdWVzdERvbmUgPSB0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkID09PSB0aGlzLl9wcm9ncmVzc2l2ZW5lc3MubGVuZ3RoO1xyXG5cclxuICAgIHJldHVybiB0cnVlO1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl9xdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2sgPSBmdW5jdGlvbiBxdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2socXVhbGl0eUxheWVyc1JlYWNoZWQpIHtcclxuICAgIHRoaXMuX3F1YWxpdHlMYXllcnNSZWFjaGVkID0gcXVhbGl0eUxheWVyc1JlYWNoZWQ7XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pc1JlcXVlc3REb25lKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICdSZXF1ZXN0IGFscmVhZHkgZG9uZSBidXQgY2FsbGJhY2sgaXMgY2FsbGVkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghdGhpcy5fdHJ5QWR2YW5jZVByb2dyZXNzaXZlU3RhZ2UoKSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLl9pc1Byb2dyZXNzaXZlICYmICF0aGlzLl9pc1JlcXVlc3REb25lKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX2RhdGFMaXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICB0aGlzLl9kYXRhTGlzdGVuZXJzW2ldKHRoaXMpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl9nZXRQYXJhbXNGb3JEYXRhV3JpdGVyID0gZnVuY3Rpb24gZ2V0UGFyYW1zRm9yRGF0YVdyaXRlcihxdWFsaXR5KSB7XHJcbiAgICAvL2Vuc3VyZU5vdEVuZGVkKHN0YXR1cywgLyphbGxvd1pvbWJpZT0qL3RydWUpO1xyXG4gICAgXHJcbiAgICAvL2lmIChjb2Rlc3RyZWFtUGFydFBhcmFtcyA9PT0gbnVsbCkge1xyXG4gICAgLy8gICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oJ0Nhbm5vdCAnICtcclxuICAgIC8vICAgICAgICAnZ2V0IGRhdGEgb2Ygem9tYmllIHJlcXVlc3Qgd2l0aCBubyBjb2Rlc3RyZWFtUGFydFBhcmFtcycpO1xyXG4gICAgLy99XHJcbiAgICBcclxuICAgIC8vdmFyIGlzUmVxdWVzdERvbmUgPSBwcm9ncmVzc2l2ZVN0YWdlc0ZpbmlzaGVkID09PSBwcm9ncmVzc2l2ZW5lc3MubGVuZ3RoO1xyXG4gICAgLy9pZiAoIWlzUmVxdWVzdERvbmUpIHtcclxuICAgIC8vICAgIGVuc3VyZU5vdFdhaXRpbmdGb3JVc2VySW5wdXQoc3RhdHVzKTtcclxuICAgIC8vfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCA9PT0gMCkge1xyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ2Fubm90IGNyZWF0ZSBjb2Rlc3RyZWFtIGJlZm9yZSBmaXJzdCBwcm9ncmVzc2l2ZW5lc3MgJyArXHJcbiAgICAgICAgICAgICdzdGFnZSBoYXMgYmVlbiByZWFjaGVkJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBtaW5OdW1RdWFsaXR5TGF5ZXJzID1cclxuICAgICAgICB0aGlzLl9wcm9ncmVzc2l2ZW5lc3NbdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNGaW5pc2hlZCAtIDFdLm1pbk51bVF1YWxpdHlMYXllcnM7XHJcbiAgICBcclxuICAgIHZhciBuZXdQYXJhbXMgPSB0aGlzLl9jb2Rlc3RyZWFtUGFydFBhcmFtcztcclxuICAgIGlmIChxdWFsaXR5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBuZXdQYXJhbXMgPSBPYmplY3QuY3JlYXRlKHRoaXMuX2NvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBuZXdQYXJhbXMucXVhbGl0eSA9IHF1YWxpdHk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnMgIT09ICdtYXgnKSB7XHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMsIHF1YWxpdHkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtczogbmV3UGFyYW1zLFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnM6IG1pbk51bVF1YWxpdHlMYXllcnNcclxuICAgICAgICB9O1xyXG59O1xyXG5cclxuSnBpcEltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLl9lbnN1cmVOb3REaXNwb3NlZCA9IGZ1bmN0aW9uIGVuc3VyZU5vdERpc3Bvc2VkKCkge1xyXG4gICAgaWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oJ0Nhbm5vdCB1c2UgSW1hZ2VEYXRhQ29udGV4dCBhZnRlciBkaXNwb3NlZCcpO1xyXG4gICAgfVxyXG59O1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIganBpcEZhY3RvcnkgPSByZXF1aXJlKCdqcGlwLXJ1bnRpbWUtZmFjdG9yeS5qcycpOyBcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gSnBpcEltYWdlO1xyXG5cclxuZnVuY3Rpb24gSnBpcEltYWdlKG9wdGlvbnMpIHtcclxuICAgIHZhciBkYXRhYmluc1NhdmVyID0ganBpcEZhY3RvcnkuY3JlYXRlRGF0YWJpbnNTYXZlcigvKmlzSnBpcFRpbGVwYXJ0U3RyZWFtPSovZmFsc2UpO1xyXG4gICAgdmFyIG1haW5IZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRNYWluSGVhZGVyRGF0YWJpbigpO1xyXG5cclxuICAgIHZhciBtYXJrZXJzUGFyc2VyID0ganBpcEZhY3RvcnkuY3JlYXRlTWFya2Vyc1BhcnNlcihtYWluSGVhZGVyRGF0YWJpbik7XHJcbiAgICB2YXIgb2Zmc2V0c0NhbGN1bGF0b3IgPSBqcGlwRmFjdG9yeS5jcmVhdGVPZmZzZXRzQ2FsY3VsYXRvcihcclxuICAgICAgICBtYWluSGVhZGVyRGF0YWJpbiwgbWFya2Vyc1BhcnNlcik7XHJcbiAgICB2YXIgc3RydWN0dXJlUGFyc2VyID0ganBpcEZhY3RvcnkuY3JlYXRlU3RydWN0dXJlUGFyc2VyKFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXIsIG1hcmtlcnNQYXJzZXIsIG9mZnNldHNDYWxjdWxhdG9yKTtcclxuICAgIFxyXG4gICAgdmFyIHByb2dyZXNzaW9uT3JkZXIgPSAnUlBDTCc7XHJcbiAgICB2YXIgY29kZXN0cmVhbVN0cnVjdHVyZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZUNvZGVzdHJlYW1TdHJ1Y3R1cmUoXHJcbiAgICAgICAgc3RydWN0dXJlUGFyc2VyLCBwcm9ncmVzc2lvbk9yZGVyKTtcclxuICAgIFxyXG4gICAgdmFyIHF1YWxpdHlMYXllcnNDYWNoZSA9IGpwaXBGYWN0b3J5LmNyZWF0ZVF1YWxpdHlMYXllcnNDYWNoZShcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlKTtcclxuICAgICAgICBcclxuICAgIHZhciBoZWFkZXJNb2RpZmllciA9IGpwaXBGYWN0b3J5LmNyZWF0ZUhlYWRlck1vZGlmaWVyKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIG9mZnNldHNDYWxjdWxhdG9yLCBwcm9ncmVzc2lvbk9yZGVyKTtcclxuICAgIHZhciByZWNvbnN0cnVjdG9yID0ganBpcEZhY3RvcnkuY3JlYXRlQ29kZXN0cmVhbVJlY29uc3RydWN0b3IoXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSwgZGF0YWJpbnNTYXZlciwgaGVhZGVyTW9kaWZpZXIsIHF1YWxpdHlMYXllcnNDYWNoZSk7XHJcbiAgICB2YXIgcGFja2V0c0RhdGFDb2xsZWN0b3IgPSBqcGlwRmFjdG9yeS5jcmVhdGVQYWNrZXRzRGF0YUNvbGxlY3RvcihcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBkYXRhYmluc1NhdmVyLCBxdWFsaXR5TGF5ZXJzQ2FjaGUpO1xyXG4gICAgXHJcbiAgICB2YXIganBpcE9iamVjdHNGb3JSZXF1ZXN0Q29udGV4dCA9IHtcclxuICAgICAgICByZWNvbnN0cnVjdG9yOiByZWNvbnN0cnVjdG9yLFxyXG4gICAgICAgIHBhY2tldHNEYXRhQ29sbGVjdG9yOiBwYWNrZXRzRGF0YUNvbGxlY3RvcixcclxuICAgICAgICBxdWFsaXR5TGF5ZXJzQ2FjaGU6IHF1YWxpdHlMYXllcnNDYWNoZSxcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlOiBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXI6IGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAganBpcEZhY3Rvcnk6IGpwaXBGYWN0b3J5XHJcblx0fTtcclxuXHRcclxuXHR2YXIgcGFyYW1zTW9kaWZpZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVSZXF1ZXN0UGFyYW1zTW9kaWZpZXIoY29kZXN0cmVhbVN0cnVjdHVyZSk7XHJcblxyXG5cdHZhciBpbWFnZVBhcmFtcyA9IG51bGw7XHJcblx0dmFyIGxldmVsQ2FsY3VsYXRvciA9IG51bGw7XHJcblx0XHJcblx0dmFyIGZldGNoZXIgPSBqcGlwRmFjdG9yeS5jcmVhdGVGZXRjaGVyKGRhdGFiaW5zU2F2ZXIsIG9wdGlvbnMpOyAvLyBUT0RPOiBXb3JrZXJQcm94eUZldGNoZXJcclxuXHQvL2Z1bmN0aW9uIEdyaWRJbWFnZUJhc2UoKSB7XHJcblx0Ly9cdHRoaXMuX2ZldGNoZXIgPSBmZXRjaGVyO1xyXG5cdC8vXHR0aGlzLl9pbWFnZVBhcmFtcyA9IG51bGw7XHJcblx0Ly9cdHRoaXMuX3dhaXRpbmdGZXRjaGVzID0ge307XHJcblx0Ly9cdHRoaXMuX2xldmVsQ2FsY3VsYXRvciA9IG51bGw7XHJcblx0Ly99XHJcblxyXG5cdHRoaXMub3BlbmVkID0gZnVuY3Rpb24gb3BlbmVkKGltYWdlRGVjb2Rlcikge1xyXG5cdFx0aW1hZ2VQYXJhbXMgPSBpbWFnZURlY29kZXIuZ2V0SW1hZ2VQYXJhbXMoKTtcclxuXHRcdC8vaW1hZ2VEZWNvZGVyLm9uRmV0Y2hlckV2ZW50KCdkYXRhJywgdGhpcy5fb25EYXRhRmV0Y2hlZC5iaW5kKHRoaXMpKTtcclxuXHRcdC8vaW1hZ2VEZWNvZGVyLm9uRmV0Y2hlckV2ZW50KCd0aWxlLXRlcm1pbmF0ZWQnLCB0aGlzLl9vblRpbGVUZXJtaW5hdGVkLmJpbmQodGhpcykpO1xyXG5cdH07XHJcblxyXG5cdHRoaXMuZ2V0TGV2ZWxDYWxjdWxhdG9yID0gZnVuY3Rpb24gZ2V0TGV2ZWxDYWxjdWxhdG9yKCkge1xyXG5cdFx0aWYgKGxldmVsQ2FsY3VsYXRvciA9PT0gbnVsbCkge1xyXG5cdFx0XHRsZXZlbENhbGN1bGF0b3IgPSBqcGlwRmFjdG9yeS5jcmVhdGVMZXZlbENhbGN1bGF0b3IoaW1hZ2VQYXJhbXMpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGxldmVsQ2FsY3VsYXRvcjtcclxuXHR9O1xyXG5cclxuXHR0aGlzLmdldERlY29kZXJXb3JrZXJzSW5wdXRSZXRyZWl2ZXIgPSBmdW5jdGlvbiBnZXREZWNvZGVyV29ya2Vyc0lucHV0UmV0cmVpdmVyKCkge1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fTtcclxuXHRcclxuXHR0aGlzLmdldEZldGNoZXIgPSBmdW5jdGlvbiBnZXRGZXRjaGVyKCkge1xyXG5cdFx0cmV0dXJuIGZldGNoZXI7XHJcblx0fTtcclxuXHJcblx0dGhpcy5nZXRXb3JrZXJUeXBlT3B0aW9ucyA9IGZ1bmN0aW9uIGdldFdvcmtlclR5cGVPcHRpb25zKHRhc2tUeXBlKSB7XHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRjdG9yTmFtZTogJ3dlYmpwaXAuUGRmanNKcHhEZWNvZGVyJyxcclxuXHRcdFx0Y3RvckFyZ3M6IFtdLFxyXG5cdFx0XHRzY3JpcHRzVG9JbXBvcnQ6IFtnZXRTY3JpcHROYW1lKG5ldyBFcnJvcigpKV1cclxuXHRcdH07XHJcblx0fTtcclxuXHJcblx0dGhpcy5nZXRLZXlBc1N0cmluZyA9IGZ1bmN0aW9uIGdldEtleUFzU3RyaW5nKGtleSkge1xyXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGtleSk7XHJcblx0fTtcclxuXHJcblx0dGhpcy50YXNrU3RhcnRlZCA9IGZ1bmN0aW9uIHRhc2tTdGFydGVkKHRhc2spIHtcclxuXHRcdHZhciBwYXJhbXMgPSBwYXJhbXNNb2RpZmllci5tb2RpZnkoLypjb2Rlc3RyZWFtVGFza1BhcmFtcz0qL3Rhc2sua2V5KTtcclxuXHRcdHZhciBjb250ZXh0ID0ganBpcEZhY3RvcnkuY3JlYXRlSW1hZ2VEYXRhQ29udGV4dChcclxuXHRcdFx0anBpcE9iamVjdHNGb3JSZXF1ZXN0Q29udGV4dCxcclxuXHRcdFx0cGFyYW1zLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG5cdFx0XHRwYXJhbXMucHJvZ3Jlc3NpdmVuZXNzKTtcclxuXHRcdFxyXG5cdFx0Y29udGV4dC5vbignZGF0YScsIG9uRGF0YSk7XHJcblx0XHRpZiAoY29udGV4dC5oYXNEYXRhKCkpIHtcclxuXHRcdFx0b25EYXRhKGNvbnRleHQpO1xyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHRmdW5jdGlvbiBvbkRhdGEoY29udGV4dF8pIHtcclxuXHRcdFx0aWYgKGNvbnRleHQgIT09IGNvbnRleHRfKSB7XHJcblx0XHRcdFx0dGhyb3cgJ3dlYmpwaXAgZXJyb3I6IFVuZXhwZWN0ZWQgY29udGV4dCBpbiBkYXRhIGV2ZW50JztcclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0Ly8gVE9ETzogRmlyc3QgcXVhbGl0eSBsYXllclxyXG5cdFx0XHR2YXIgZGF0YSA9IGNvbnRleHQuZ2V0RmV0Y2hlZERhdGEoKTtcclxuXHRcdFx0dGFzay5kYXRhUmVhZHkoZGF0YSk7XHJcblx0XHRcdFxyXG5cdFx0XHRpZiAoY29udGV4dC5pc0RvbmUoKSkge1xyXG5cdFx0XHRcdHRhc2sudGVybWluYXRlKCk7XHJcblx0XHRcdFx0Y29udGV4dC5kaXNwb3NlKCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRTY3JpcHROYW1lKGVycm9yV2l0aFN0YWNrVHJhY2UpIHtcclxuXHR2YXIgc3RhY2sgPSBlcnJvcldpdGhTdGFja1RyYWNlLnN0YWNrLnRyaW0oKTtcclxuXHRcclxuXHR2YXIgY3VycmVudFN0YWNrRnJhbWVSZWdleCA9IC9hdCAofFteIF0rIFxcKCkoW14gXSspOlxcZCs6XFxkKy87XHJcblx0dmFyIHNvdXJjZSA9IGN1cnJlbnRTdGFja0ZyYW1lUmVnZXguZXhlYyhzdGFjayk7XHJcblx0aWYgKHNvdXJjZSAmJiBzb3VyY2VbMl0gIT09IFwiXCIpIHtcclxuXHRcdHJldHVybiBzb3VyY2VbMl07XHJcblx0fVxyXG5cclxuXHR2YXIgbGFzdFN0YWNrRnJhbWVSZWdleCA9IG5ldyBSZWdFeHAoLy4rXFwvKC4qPyk6XFxkKyg6XFxkKykqJC8pO1xyXG5cdHNvdXJjZSA9IGxhc3RTdGFja0ZyYW1lUmVnZXguZXhlYyhzdGFjayk7XHJcblx0aWYgKHNvdXJjZSAmJiBzb3VyY2VbMV0gIT09IFwiXCIpIHtcclxuXHRcdHJldHVybiBzb3VyY2VbMV07XHJcblx0fVxyXG5cdFxyXG5cdGlmIChlcnJvcldpdGhTdGFja1RyYWNlLmZpbGVOYW1lICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdHJldHVybiBlcnJvcldpdGhTdGFja1RyYWNlLmZpbGVOYW1lO1xyXG5cdH1cclxuXHRcclxuXHR0aHJvdyAnSW1hZ2VEZWNvZGVyRnJhbWV3b3JrLmpzOiBDb3VsZCBub3QgZ2V0IGN1cnJlbnQgc2NyaXB0IFVSTCc7XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcbnZhciBMT0cyID0gTWF0aC5sb2coMik7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBMZXZlbENhbGN1bGF0b3IoXHJcbiAgICBwYXJhbXMpIHtcclxuICAgIFxyXG4gICAgdmFyIEVER0VfVFlQRV9OT19FREdFID0gMDtcclxuICAgIHZhciBFREdFX1RZUEVfRklSU1QgPSAxO1xyXG4gICAgdmFyIEVER0VfVFlQRV9MQVNUID0gMjtcclxuXHJcbiAgICB0aGlzLkVER0VfVFlQRV9OT19FREdFID0gRURHRV9UWVBFX05PX0VER0U7XHJcbiAgICB0aGlzLkVER0VfVFlQRV9GSVJTVCA9IEVER0VfVFlQRV9GSVJTVDtcclxuICAgIHRoaXMuRURHRV9UWVBFX0xBU1QgPSBFREdFX1RZUEVfTEFTVDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRTaXplT2ZQYXJ0ID0gZ2V0U2l6ZU9mUGFydDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlc0Zyb21QaXhlbHMgPSBnZXRUaWxlc0Zyb21QaXhlbHM7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtVGlsZXNYID0gZ2V0TnVtVGlsZXNYO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE51bVRpbGVzWSA9IGdldE51bVRpbGVzWTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlV2lkdGggPSBnZXRUaWxlV2lkdGg7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZUhlaWdodCA9IGdldFRpbGVIZWlnaHQ7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RUaWxlT2Zmc2V0WCA9IGdldEZpcnN0VGlsZU9mZnNldFg7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RUaWxlT2Zmc2V0WSA9IGdldEZpcnN0VGlsZU9mZnNldFk7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RUaWxlV2lkdGggPSBnZXRGaXJzdFRpbGVXaWR0aDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRGaXJzdFRpbGVIZWlnaHQgPSBnZXRGaXJzdFRpbGVIZWlnaHQ7XHJcbiAgICBcclxuICAgIHRoaXMuaXNFZGdlVGlsZUlkID0gaXNFZGdlVGlsZUlkO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVTaXplID0gZ2V0VGlsZVNpemU7XHJcbiAgICBcclxuICAgIC8vIFB1YmxpYyBtZXRob2RzIGZvciBpbWFnZURlY29kZXJGcmFtZXdvcmsuanNcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZXZlbFdpZHRoID0gZ2V0TGV2ZWxXaWR0aDtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZXZlbEhlaWdodCA9IGdldExldmVsSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEltYWdlTGV2ZWwgPSBmdW5jdGlvbiBnZXRJbWFnZUxldmVsKCkge1xyXG4gICAgICAgIHJldHVybiAwO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZXZlbCA9IGZ1bmN0aW9uIGdldExldmVsKHJlZ2lvbkltYWdlTGV2ZWwpIHtcclxuICAgICAgICBpZiAocGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNGb3JMaW1pdHRlZFZpZXdlciA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93ICdUaGlzIG1ldGhvZCBpcyBhdmFpbGFibGUgb25seSB3aGVuIGpwaXBTaXplc0NhbGN1bGF0b3IgJyArXHJcbiAgICAgICAgICAgICAgICAnaXMgY3JlYXRlZCBmcm9tIHBhcmFtcyByZXR1cm5lZCBieSBqcGlwQ29kZXN0cmVhbUNsaWVudC4gJyArXHJcbiAgICAgICAgICAgICAgICAnSXQgc2hhbGwgYmUgdXNlZCBmb3IgSlBJUCBBUEkgcHVycG9zZXMgb25seSc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG5cdFx0dmFyIGxldmVsWCA9IE1hdGgubG9nKChyZWdpb25JbWFnZUxldmVsLm1heFhFeGNsdXNpdmUgLSByZWdpb25JbWFnZUxldmVsLm1pblgpIC8gcmVnaW9uSW1hZ2VMZXZlbC5zY3JlZW5XaWR0aCApIC8gTE9HMjtcclxuXHRcdHZhciBsZXZlbFkgPSBNYXRoLmxvZygocmVnaW9uSW1hZ2VMZXZlbC5tYXhZRXhjbHVzaXZlIC0gcmVnaW9uSW1hZ2VMZXZlbC5taW5ZKSAvIHJlZ2lvbkltYWdlTGV2ZWwuc2NyZWVuSGVpZ2h0KSAvIExPRzI7XHJcblx0XHR2YXIgbGV2ZWwgPSBNYXRoLmNlaWwoTWF0aC5tYXgobGV2ZWxYLCBsZXZlbFkpKTtcclxuXHRcdGxldmVsID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHNGb3JMaW1pdHRlZFZpZXdlciAtIDEsIGxldmVsKSk7XHJcblx0XHRyZXR1cm4gbGV2ZWw7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE51bVJlc29sdXRpb25MZXZlbHNGb3JMaW1pdHRlZFZpZXdlciA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0TnVtUmVzb2x1dGlvbkxldmVsc0ZvckxpbWl0dGVkVmlld2VyKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwYXJhbXMubnVtUmVzb2x1dGlvbkxldmVsc0ZvckxpbWl0dGVkVmlld2VyID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgJ1RoaXMgbWV0aG9kIGlzIGF2YWlsYWJsZSBvbmx5IHdoZW4ganBpcFNpemVzQ2FsY3VsYXRvciAnICtcclxuICAgICAgICAgICAgICAgICdpcyBjcmVhdGVkIGZyb20gcGFyYW1zIHJldHVybmVkIGJ5IGpwaXBDb2Rlc3RyZWFtQ2xpZW50LiAnICtcclxuICAgICAgICAgICAgICAgICdJdCBzaGFsbCBiZSB1c2VkIGZvciBKUElQIEFQSSBwdXJwb3NlcyBvbmx5JztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzRm9yTGltaXR0ZWRWaWV3ZXI7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExvd2VzdFF1YWxpdHkgPSBmdW5jdGlvbiBnZXRMb3dlc3RRdWFsaXR5KCkge1xyXG4gICAgICAgIHJldHVybiAxO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRIaWdoZXN0UXVhbGl0eSA9IGZ1bmN0aW9uIGdldEhpZ2hlc3RRdWFsaXR5KCkge1xyXG4gICAgICAgIGlmIChwYXJhbXMuaGlnaGVzdFF1YWxpdHkgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyAnVGhpcyBtZXRob2QgaXMgYXZhaWxhYmxlIG9ubHkgd2hlbiBqcGlwU2l6ZXNDYWxjdWxhdG9yICcgK1xyXG4gICAgICAgICAgICAgICAgJ2lzIGNyZWF0ZWQgZnJvbSBwYXJhbXMgcmV0dXJuZWQgYnkganBpcENvZGVzdHJlYW1DbGllbnQuICcgK1xyXG4gICAgICAgICAgICAgICAgJ0l0IHNoYWxsIGJlIHVzZWQgZm9yIEpQSVAgQVBJIHB1cnBvc2VzIG9ubHknO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcGFyYW1zLmhpZ2hlc3RRdWFsaXR5O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgLy8gUHJpdmF0ZSBtZXRob2RzXHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFNpemVPZlBhcnQoY29kZXN0cmVhbVBhcnRQYXJhbXMpIHtcclxuICAgICAgICB2YXIgbGV2ZWwgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbDtcclxuICAgICAgICB2YXIgdGlsZVdpZHRoID0gZ2V0VGlsZVdpZHRoKGxldmVsKTtcclxuICAgICAgICB2YXIgdGlsZUhlaWdodCA9IGdldFRpbGVIZWlnaHQobGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlQm91bmRzID0gZ2V0VGlsZXNGcm9tUGl4ZWxzKGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RUaWxlSW5kZXggPVxyXG4gICAgICAgICAgICB0aWxlQm91bmRzLm1pblRpbGVYICsgdGlsZUJvdW5kcy5taW5UaWxlWSAqIGdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgbGFzdFRpbGVJbmRleCA9XHJcbiAgICAgICAgICAgICh0aWxlQm91bmRzLm1heFRpbGVYRXhjbHVzaXZlIC0gMSkgK1xyXG4gICAgICAgICAgICAodGlsZUJvdW5kcy5tYXhUaWxlWUV4Y2x1c2l2ZSAtIDEpICogZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZpcnN0RWRnZVR5cGUgPSBpc0VkZ2VUaWxlSWQoZmlyc3RUaWxlSW5kZXgpO1xyXG4gICAgICAgIHZhciBsYXN0RWRnZVR5cGUgPSBpc0VkZ2VUaWxlSWQobGFzdFRpbGVJbmRleCk7XHJcbiAgICAgICAgdmFyIGZpcnN0U2l6ZSA9IGdldFRpbGVTaXplKGZpcnN0RWRnZVR5cGUsIGxldmVsKTtcclxuICAgICAgICB2YXIgbGFzdFNpemUgPSBnZXRUaWxlU2l6ZShsYXN0RWRnZVR5cGUsIGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgd2lkdGggPSBmaXJzdFNpemVbMF07XHJcbiAgICAgICAgdmFyIGhlaWdodCA9IGZpcnN0U2l6ZVsxXTtcclxuXHJcbiAgICAgICAgdmFyIHRpbGVzWCA9IHRpbGVCb3VuZHMubWF4VGlsZVhFeGNsdXNpdmUgLSB0aWxlQm91bmRzLm1pblRpbGVYO1xyXG4gICAgICAgIHZhciB0aWxlc1kgPSB0aWxlQm91bmRzLm1heFRpbGVZRXhjbHVzaXZlIC0gdGlsZUJvdW5kcy5taW5UaWxlWTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGlsZXNYID4gMSkge1xyXG4gICAgICAgICAgICB3aWR0aCArPSBsYXN0U2l6ZVswXTtcclxuICAgICAgICAgICAgd2lkdGggKz0gdGlsZVdpZHRoICogKHRpbGVzWCAtIDIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodGlsZXNZID4gMSkge1xyXG4gICAgICAgICAgICBoZWlnaHQgKz0gbGFzdFNpemVbMV07XHJcbiAgICAgICAgICAgIGhlaWdodCArPSB0aWxlSGVpZ2h0ICogKHRpbGVzWSAtIDIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB3aWR0aDogd2lkdGgsXHJcbiAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0XHJcbiAgICAgICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFRpbGVzRnJvbVBpeGVscyhwYXJ0UGFyYW1zKSB7XHJcbiAgICAgICAgdmFyIGxldmVsID1cclxuICAgICAgICAgICAgcGFydFBhcmFtcy5sZXZlbDtcclxuXHJcbiAgICAgICAgdmFyIHRpbGVXaWR0aCA9IGdldFRpbGVXaWR0aChsZXZlbCk7XHJcbiAgICAgICAgdmFyIHRpbGVIZWlnaHQgPSBnZXRUaWxlSGVpZ2h0KGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RUaWxlV2lkdGggPSBnZXRGaXJzdFRpbGVXaWR0aChsZXZlbCk7XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZUhlaWdodCA9IGdldEZpcnN0VGlsZUhlaWdodChsZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0YXJ0WE5vRmlyc3QgPSAocGFydFBhcmFtcy5taW5YIC0gZmlyc3RUaWxlV2lkdGgpIC8gdGlsZVdpZHRoO1xyXG4gICAgICAgIHZhciBzdGFydFlOb0ZpcnN0ID0gKHBhcnRQYXJhbXMubWluWSAtIGZpcnN0VGlsZUhlaWdodCkgLyB0aWxlSGVpZ2h0O1xyXG4gICAgICAgIHZhciBlbmRYTm9GaXJzdCA9IChwYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUgLSBmaXJzdFRpbGVXaWR0aCkgLyB0aWxlV2lkdGg7XHJcbiAgICAgICAgdmFyIGVuZFlOb0ZpcnN0ID0gKHBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSAtIGZpcnN0VGlsZUhlaWdodCkgLyB0aWxlSGVpZ2h0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtaW5UaWxlWCA9IE1hdGgubWF4KDAsIDEgKyBzdGFydFhOb0ZpcnN0KTtcclxuICAgICAgICB2YXIgbWluVGlsZVkgPSBNYXRoLm1heCgwLCAxICsgc3RhcnRZTm9GaXJzdCk7XHJcbiAgICAgICAgdmFyIG1heFRpbGVYID0gTWF0aC5taW4oZ2V0TnVtVGlsZXNYKCksIDEgKyBlbmRYTm9GaXJzdCk7XHJcbiAgICAgICAgdmFyIG1heFRpbGVZID0gTWF0aC5taW4oZ2V0TnVtVGlsZXNZKCksIDEgKyBlbmRZTm9GaXJzdCk7XHJcblxyXG4gICAgICAgIHZhciBib3VuZHMgPSB7XHJcbiAgICAgICAgICAgIG1pblRpbGVYOiBNYXRoLmZsb29yKG1pblRpbGVYKSxcclxuICAgICAgICAgICAgbWluVGlsZVk6IE1hdGguZmxvb3IobWluVGlsZVkpLFxyXG4gICAgICAgICAgICBtYXhUaWxlWEV4Y2x1c2l2ZTogTWF0aC5jZWlsKG1heFRpbGVYKSxcclxuICAgICAgICAgICAgbWF4VGlsZVlFeGNsdXNpdmU6IE1hdGguY2VpbChtYXhUaWxlWSlcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYm91bmRzO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFRpbGVTaXplKGVkZ2VUeXBlLCBsZXZlbCkge1xyXG4gICAgICAgIHZhciB0aWxlV2lkdGggPSBnZXRUaWxlRGltZW5zaW9uU2l6ZShcclxuICAgICAgICAgICAgZWRnZVR5cGUuaG9yaXpvbnRhbEVkZ2VUeXBlLFxyXG4gICAgICAgICAgICBnZXRGaXJzdFRpbGVXaWR0aCxcclxuICAgICAgICAgICAgZ2V0TGV2ZWxXaWR0aCxcclxuICAgICAgICAgICAgZ2V0VGlsZVdpZHRoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUhlaWdodCA9IGdldFRpbGVEaW1lbnNpb25TaXplKFxyXG4gICAgICAgICAgICBlZGdlVHlwZS52ZXJ0aWNhbEVkZ2VUeXBlLFxyXG4gICAgICAgICAgICBnZXRGaXJzdFRpbGVIZWlnaHQsXHJcbiAgICAgICAgICAgIGdldExldmVsSGVpZ2h0LFxyXG4gICAgICAgICAgICBnZXRUaWxlSGVpZ2h0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobGV2ZWwgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB2YXIgc2NhbGUgPSAxIDw8IGxldmVsO1xyXG4gICAgICAgICAgICB0aWxlV2lkdGggPSBNYXRoLmNlaWwodGlsZVdpZHRoIC8gc2NhbGUpO1xyXG4gICAgICAgICAgICB0aWxlSGVpZ2h0ID0gTWF0aC5jZWlsKHRpbGVIZWlnaHQgLyBzY2FsZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBbdGlsZVdpZHRoLCB0aWxlSGVpZ2h0XTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRUaWxlRGltZW5zaW9uU2l6ZShcclxuICAgICAgICBlZGdlVHlwZSwgZ2V0Rmlyc3RUaWxlU2l6ZSwgZ2V0TGV2ZWxTaXplLCBnZXROb25FZGdlVGlsZVNpemUpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoZWRnZVR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSBFREdFX1RZUEVfRklSU1Q6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBnZXRGaXJzdFRpbGVTaXplKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgRURHRV9UWVBFX0xBU1Q6XHJcbiAgICAgICAgICAgICAgICB2YXIgbm9uRWRnZVRpbGVTaXplID0gZ2V0Tm9uRWRnZVRpbGVTaXplKCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgd2lkdGhXaXRob3V0Rmlyc3QgPSBnZXRMZXZlbFNpemUoKSAtIGdldEZpcnN0VGlsZVNpemUoKTtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHdpZHRoV2l0aG91dEZpcnN0ICUgbm9uRWRnZVRpbGVTaXplO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gbm9uRWRnZVRpbGVTaXplO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgRURHRV9UWVBFX05PX0VER0U6XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBnZXROb25FZGdlVGlsZVNpemUoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIGVkZ2UgdHlwZTogJyArIGVkZ2VUeXBlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIGlzRWRnZVRpbGVJZCh0aWxlSWQpIHtcclxuICAgICAgICB2YXIgbnVtVGlsZXNYID0gZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgdmFyIG51bVRpbGVzWSA9IGdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlWCA9IHRpbGVJZCAlIG51bVRpbGVzWDtcclxuICAgICAgICB2YXIgdGlsZVkgPSBNYXRoLmZsb29yKHRpbGVJZCAvIG51bVRpbGVzWCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRpbGVZID4gbnVtVGlsZXNZIHx8IHRpbGVYIDwgMCB8fCB0aWxlWSA8IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnVGlsZSBpbmRleCAnICsgdGlsZUlkICsgJyBpcyBub3QgaW4gcmFuZ2UnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhvcml6b250YWxFZGdlID1cclxuICAgICAgICAgICAgdGlsZVggPT09IDAgPyBFREdFX1RZUEVfRklSU1QgOlxyXG4gICAgICAgICAgICB0aWxlWCA9PT0gKG51bVRpbGVzWCAtIDEpID8gRURHRV9UWVBFX0xBU1QgOlxyXG4gICAgICAgICAgICBFREdFX1RZUEVfTk9fRURHRTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdmVydGljYWxFZGdlID1cclxuICAgICAgICAgICAgdGlsZVkgPT09IDAgPyBFREdFX1RZUEVfRklSU1QgOlxyXG4gICAgICAgICAgICB0aWxlWSA9PT0gKG51bVRpbGVzWSAtIDEpID8gRURHRV9UWVBFX0xBU1QgOlxyXG4gICAgICAgICAgICBFREdFX1RZUEVfTk9fRURHRTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICBob3Jpem9udGFsRWRnZVR5cGU6IGhvcml6b250YWxFZGdlLFxyXG4gICAgICAgICAgICB2ZXJ0aWNhbEVkZ2VUeXBlOiB2ZXJ0aWNhbEVkZ2VcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldE51bVRpbGVzWCgpIHtcclxuICAgICAgICB2YXIgbnVtVGlsZXNYID0gTWF0aC5jZWlsKHBhcmFtcy5pbWFnZVdpZHRoIC8gcGFyYW1zLnRpbGVXaWR0aCk7XHJcbiAgICAgICAgcmV0dXJuIG51bVRpbGVzWDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TnVtVGlsZXNZKCkge1xyXG4gICAgICAgIHZhciBudW1UaWxlc1kgPSBNYXRoLmNlaWwocGFyYW1zLmltYWdlSGVpZ2h0IC8gcGFyYW1zLnRpbGVIZWlnaHQpO1xyXG4gICAgICAgIHJldHVybiBudW1UaWxlc1k7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldExldmVsV2lkdGgobGV2ZWwpIHtcclxuICAgICAgICBpZiAobGV2ZWwgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGFyYW1zLmltYWdlV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaXplID0gZ2V0U2l6ZU9mUGFydCh7XHJcbiAgICAgICAgICAgIG1pblg6IDAsXHJcbiAgICAgICAgICAgIG1heFhFeGNsdXNpdmU6IHBhcmFtcy5pbWFnZVdpZHRoLFxyXG4gICAgICAgICAgICBtaW5ZOiAwLFxyXG4gICAgICAgICAgICBtYXhZRXhjbHVzaXZlOiBwYXJhbXMuaW1hZ2VIZWlnaHQsXHJcbiAgICAgICAgICAgIGxldmVsOiBsZXZlbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gc2l6ZS53aWR0aDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TGV2ZWxIZWlnaHQobGV2ZWwpIHtcclxuICAgICAgICBpZiAobGV2ZWwgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGFyYW1zLmltYWdlSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6ZSA9IGdldFNpemVPZlBhcnQoe1xyXG4gICAgICAgICAgICBtaW5YOiAwLFxyXG4gICAgICAgICAgICBtYXhYRXhjbHVzaXZlOiBwYXJhbXMuaW1hZ2VXaWR0aCxcclxuICAgICAgICAgICAgbWluWTogMCxcclxuICAgICAgICAgICAgbWF4WUV4Y2x1c2l2ZTogcGFyYW1zLmltYWdlSGVpZ2h0LFxyXG4gICAgICAgICAgICBsZXZlbDogbGV2ZWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHNpemUuaGVpZ2h0O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFRpbGVXaWR0aChsZXZlbCkge1xyXG4gICAgICAgIGlmIChsZXZlbCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJhbXMudGlsZVdpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHZhciBzY2FsZSA9IDEgPDwgbGV2ZWw7XHJcbiAgICAgICAgdmFyIHdpZHRoID0gTWF0aC5jZWlsKHBhcmFtcy50aWxlV2lkdGggLyBzY2FsZSk7XHJcbiAgICAgICAgcmV0dXJuIHdpZHRoO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRUaWxlSGVpZ2h0KGxldmVsKSB7XHJcbiAgICAgICAgaWYgKGxldmVsID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcmFtcy50aWxlSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHZhciBzY2FsZSA9IDEgPDwgbGV2ZWw7XHJcbiAgICAgICAgdmFyIGhlaWdodCA9IE1hdGguY2VpbChwYXJhbXMudGlsZUhlaWdodCAvIHNjYWxlKTtcclxuICAgICAgICByZXR1cm4gaGVpZ2h0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRGaXJzdFRpbGVPZmZzZXRYKCkge1xyXG4gICAgICAgIHJldHVybiBwYXJhbXMuZmlyc3RUaWxlT2Zmc2V0WDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Rmlyc3RUaWxlT2Zmc2V0WSgpIHtcclxuICAgICAgICByZXR1cm4gcGFyYW1zLmZpcnN0VGlsZU9mZnNldFk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0Rmlyc3RUaWxlV2lkdGgobGV2ZWwpIHtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlV2lkdGhCZXN0TGV2ZWwgPVxyXG4gICAgICAgICAgICBnZXRUaWxlV2lkdGgoKSAtIGdldEZpcnN0VGlsZU9mZnNldFgoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW1hZ2VXaWR0aCA9IGdldExldmVsV2lkdGgoKTtcclxuICAgICAgICBpZiAoZmlyc3RUaWxlV2lkdGhCZXN0TGV2ZWwgPiBpbWFnZVdpZHRoKSB7XHJcbiAgICAgICAgICAgIGZpcnN0VGlsZVdpZHRoQmVzdExldmVsID0gaW1hZ2VXaWR0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNjYWxlID0gMSA8PCBsZXZlbDtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlV2lkdGggPSBNYXRoLmNlaWwoZmlyc3RUaWxlV2lkdGhCZXN0TGV2ZWwgLyBzY2FsZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGZpcnN0VGlsZVdpZHRoO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRGaXJzdFRpbGVIZWlnaHQobGV2ZWwpIHtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlSGVpZ2h0QmVzdExldmVsID1cclxuICAgICAgICAgICAgZ2V0VGlsZUhlaWdodCgpIC0gZ2V0Rmlyc3RUaWxlT2Zmc2V0WSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpbWFnZUhlaWdodCA9IGdldExldmVsSGVpZ2h0KCk7XHJcbiAgICAgICAgaWYgKGZpcnN0VGlsZUhlaWdodEJlc3RMZXZlbCA+IGltYWdlSGVpZ2h0KSB7XHJcbiAgICAgICAgICAgIGZpcnN0VGlsZUhlaWdodEJlc3RMZXZlbCA9IGltYWdlSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2NhbGUgPSAxIDw8IGxldmVsO1xyXG4gICAgICAgIHZhciBmaXJzdFRpbGVIZWlnaHQgPSBNYXRoLmNlaWwoZmlyc3RUaWxlSGVpZ2h0QmVzdExldmVsIC8gc2NhbGUpO1xyXG5cclxuICAgICAgICByZXR1cm4gZmlyc3RUaWxlSGVpZ2h0O1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gUGRmanNKcHhEZWNvZGVyO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxuZnVuY3Rpb24gUGRmanNKcHhEZWNvZGVyKCkge1xyXG4gICAgdGhpcy5faW1hZ2UgPSBuZXcgSnB4SW1hZ2UoKTtcclxufVxyXG5cclxuUGRmanNKcHhEZWNvZGVyLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uIHN0YXJ0KGRhdGEpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICB2YXIgcmVnaW9uVG9QYXJzZSA9IHtcclxuICAgICAgICAgICAgbGVmdCAgOiBkYXRhLmhlYWRlcnNDb2Rlc3RyZWFtLm9mZnNldFgsXHJcbiAgICAgICAgICAgIHRvcCAgIDogZGF0YS5oZWFkZXJzQ29kZXN0cmVhbS5vZmZzZXRZLFxyXG4gICAgICAgICAgICByaWdodCA6IGRhdGEuaGVhZGVyc0NvZGVzdHJlYW0ub2Zmc2V0WCArIGRhdGEuY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIGRhdGEuY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWCxcclxuICAgICAgICAgICAgYm90dG9tOiBkYXRhLmhlYWRlcnNDb2Rlc3RyZWFtLm9mZnNldFkgKyBkYXRhLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFlFeGNsdXNpdmUgLSBkYXRhLmNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pbllcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjdXJyZW50Q29udGV4dCA9IHNlbGYuX2ltYWdlLnBhcnNlQ29kZXN0cmVhbShcclxuICAgICAgICAgICAgZGF0YS5oZWFkZXJzQ29kZXN0cmVhbS5jb2Rlc3RyZWFtLFxyXG4gICAgICAgICAgICAwLFxyXG4gICAgICAgICAgICBkYXRhLmhlYWRlcnNDb2Rlc3RyZWFtLmNvZGVzdHJlYW0ubGVuZ3RoLFxyXG4gICAgICAgICAgICB7IGlzT25seVBhcnNlSGVhZGVyczogdHJ1ZSB9KTtcclxuICAgICAgICBcclxuICAgICAgICBzZWxmLl9pbWFnZS5hZGRQYWNrZXRzRGF0YShjdXJyZW50Q29udGV4dCwgZGF0YS5jb2RlYmxvY2tzRGF0YSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2VsZi5faW1hZ2UuZGVjb2RlKGN1cnJlbnRDb250ZXh0LCB7IHJlZ2lvblRvUGFyc2U6IHJlZ2lvblRvUGFyc2UgfSk7XHJcblxyXG4gICAgICAgIHZhciByZXN1bHQgPSBzZWxmLl9jb3B5VGlsZXNQaXhlbHNUb09uZVBpeGVsc0FycmF5KHNlbGYuX2ltYWdlLnRpbGVzLCByZWdpb25Ub1BhcnNlLCBzZWxmLl9pbWFnZS5jb21wb25lbnRzQ291bnQpO1xyXG4gICAgICAgIHJlc29sdmUocmVzdWx0KTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxuUGRmanNKcHhEZWNvZGVyLnByb3RvdHlwZS5fY29weVRpbGVzUGl4ZWxzVG9PbmVQaXhlbHNBcnJheSA9XHJcbiAgICBmdW5jdGlvbiBjb3B5VGlsZXNQaXhlbHNUb09uZVBpeGVsc0FycmF5KHRpbGVzLCByZXN1bHRSZWdpb24sIGNvbXBvbmVudHNDb3VudCkge1xyXG4gICAgICAgIFxyXG4gICAgdmFyIGZpcnN0VGlsZSA9IHRpbGVzWzBdO1xyXG4gICAgdmFyIHdpZHRoID0gcmVzdWx0UmVnaW9uLnJpZ2h0IC0gcmVzdWx0UmVnaW9uLmxlZnQ7XHJcbiAgICB2YXIgaGVpZ2h0ID0gcmVzdWx0UmVnaW9uLmJvdHRvbSAtIHJlc3VsdFJlZ2lvbi50b3A7XHJcbiAgICBcclxuICAgIC8vaWYgKGZpcnN0VGlsZS5sZWZ0ID09PSByZXN1bHRSZWdpb24ubGVmdCAmJlxyXG4gICAgLy8gICAgZmlyc3RUaWxlLnRvcCA9PT0gcmVzdWx0UmVnaW9uLnRvcCAmJlxyXG4gICAgLy8gICAgZmlyc3RUaWxlLndpZHRoID09PSB3aWR0aCAmJlxyXG4gICAgLy8gICAgZmlyc3RUaWxlLmhlaWdodCA9PT0gaGVpZ2h0ICYmXHJcbiAgICAvLyAgICBjb21wb25lbnRzQ291bnQgPT09IDQpIHtcclxuICAgIC8vICAgIFxyXG4gICAgLy8gICAgcmV0dXJuIGZpcnN0VGlsZTtcclxuICAgIC8vfVxyXG4gICAgXHJcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEltYWdlRGF0YSh3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgXHJcbiAgICB2YXIgYnl0ZXNQZXJQaXhlbCA9IDQ7XHJcbiAgICB2YXIgcmdiYUltYWdlU3RyaWRlID0gd2lkdGggKiBieXRlc1BlclBpeGVsO1xyXG4gICAgXHJcbiAgICB2YXIgdGlsZUluZGV4ID0gMDtcclxuICAgIFxyXG4gICAgLy9mb3IgKHZhciB4ID0gMDsgeCA8IG51bVRpbGVzWDsgKyt4KSB7XHJcblxyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aWxlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgIHZhciB0aWxlUmlnaHQgPSB0aWxlc1tpXS5sZWZ0ICsgdGlsZXNbaV0ud2lkdGg7XHJcbiAgICAgICAgdmFyIHRpbGVCb3R0b20gPSB0aWxlc1tpXS50b3AgKyB0aWxlc1tpXS5oZWlnaHQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGludGVyc2VjdGlvbkxlZnQgPSBNYXRoLm1heChyZXN1bHRSZWdpb24ubGVmdCwgdGlsZXNbaV0ubGVmdCk7XHJcbiAgICAgICAgdmFyIGludGVyc2VjdGlvblRvcCA9IE1hdGgubWF4KHJlc3VsdFJlZ2lvbi50b3AsIHRpbGVzW2ldLnRvcCk7XHJcbiAgICAgICAgdmFyIGludGVyc2VjdGlvblJpZ2h0ID0gTWF0aC5taW4ocmVzdWx0UmVnaW9uLnJpZ2h0LCB0aWxlUmlnaHQpO1xyXG4gICAgICAgIHZhciBpbnRlcnNlY3Rpb25Cb3R0b20gPSBNYXRoLm1pbihyZXN1bHRSZWdpb24uYm90dG9tLCB0aWxlQm90dG9tKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW50ZXJzZWN0aW9uV2lkdGggPSBpbnRlcnNlY3Rpb25SaWdodCAtIGludGVyc2VjdGlvbkxlZnQ7XHJcbiAgICAgICAgdmFyIGludGVyc2VjdGlvbkhlaWdodCA9IGludGVyc2VjdGlvbkJvdHRvbSAtIGludGVyc2VjdGlvblRvcDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaW50ZXJzZWN0aW9uTGVmdCAhPT0gdGlsZXNbaV0ubGVmdCB8fFxyXG4gICAgICAgICAgICBpbnRlcnNlY3Rpb25Ub3AgIT09IHRpbGVzW2ldLnRvcCB8fFxyXG4gICAgICAgICAgICBpbnRlcnNlY3Rpb25XaWR0aCAhPT0gdGlsZXNbaV0ud2lkdGggfHxcclxuICAgICAgICAgICAgaW50ZXJzZWN0aW9uSGVpZ2h0ICE9PSB0aWxlc1tpXS5oZWlnaHQpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRocm93ICdVbnN1cHBvcnRlZCB0aWxlcyB0byBjb3B5JztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVPZmZzZXRYUGl4ZWxzID0gaW50ZXJzZWN0aW9uTGVmdCAtIHJlc3VsdFJlZ2lvbi5sZWZ0O1xyXG4gICAgICAgIHZhciB0aWxlT2Zmc2V0WVBpeGVscyA9IGludGVyc2VjdGlvblRvcCAtIHJlc3VsdFJlZ2lvbi50b3A7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlT2Zmc2V0Qnl0ZXMgPVxyXG4gICAgICAgICAgICB0aWxlT2Zmc2V0WFBpeGVscyAqIGJ5dGVzUGVyUGl4ZWwgK1xyXG4gICAgICAgICAgICB0aWxlT2Zmc2V0WVBpeGVscyAqIHJnYmFJbWFnZVN0cmlkZTtcclxuXHJcbiAgICAgICAgdGhpcy5fY29weVRpbGUoXHJcbiAgICAgICAgICAgIHJlc3VsdC5kYXRhLCB0aWxlc1tpXSwgdGlsZU9mZnNldEJ5dGVzLCByZ2JhSW1hZ2VTdHJpZGUsIGNvbXBvbmVudHNDb3VudCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG5QZGZqc0pweERlY29kZXIucHJvdG90eXBlLl9jb3B5VGlsZSA9IGZ1bmN0aW9uIGNvcHlUaWxlKFxyXG4gICAgdGFyZ2V0SW1hZ2UsIHRpbGUsIHRhcmdldEltYWdlU3RhcnRPZmZzZXQsIHRhcmdldEltYWdlU3RyaWRlLCBjb21wb25lbnRzQ291bnQpIHtcclxuICAgIFxyXG4gICAgdmFyIHJPZmZzZXQgPSAwO1xyXG4gICAgdmFyIGdPZmZzZXQgPSAxO1xyXG4gICAgdmFyIGJPZmZzZXQgPSAyO1xyXG4gICAgdmFyIHBpeGVsc09mZnNldCA9IDE7XHJcbiAgICBcclxuICAgIHZhciBwaXhlbHMgPSB0aWxlLnBpeGVscyB8fCB0aWxlLml0ZW1zO1xyXG4gICAgXHJcbiAgICBpZiAoY29tcG9uZW50c0NvdW50ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBjb21wb25lbnRzQ291bnQgPSBwaXhlbHMubGVuZ3RoIC8gKHRpbGUud2lkdGggKiB0aWxlLmhlaWdodCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHN3aXRjaCAoY29tcG9uZW50c0NvdW50KSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICBnT2Zmc2V0ID0gMDtcclxuICAgICAgICAgICAgYk9mZnNldCA9IDA7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICAgICAgcGl4ZWxzT2Zmc2V0ID0gMztcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGNhc2UgNDpcclxuICAgICAgICAgICAgcGl4ZWxzT2Zmc2V0ID0gNDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHRocm93ICdVbnN1cHBvcnRlZCBjb21wb25lbnRzIGNvdW50ICcgKyBjb21wb25lbnRzQ291bnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciB0YXJnZXRJbWFnZUluZGV4ID0gdGFyZ2V0SW1hZ2VTdGFydE9mZnNldDtcclxuICAgIHZhciBwaXhlbCA9IDA7XHJcbiAgICBmb3IgKHZhciB5ID0gMDsgeSA8IHRpbGUuaGVpZ2h0OyArK3kpIHtcclxuICAgICAgICB2YXIgdGFyZ2V0SW1hZ2VTdGFydExpbmUgPSB0YXJnZXRJbWFnZUluZGV4O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgdGlsZS53aWR0aDsgKyt4KSB7XHJcbiAgICAgICAgICAgIHRhcmdldEltYWdlW3RhcmdldEltYWdlSW5kZXggKyAwXSA9IHBpeGVsc1twaXhlbCArIHJPZmZzZXRdO1xyXG4gICAgICAgICAgICB0YXJnZXRJbWFnZVt0YXJnZXRJbWFnZUluZGV4ICsgMV0gPSBwaXhlbHNbcGl4ZWwgKyBnT2Zmc2V0XTtcclxuICAgICAgICAgICAgdGFyZ2V0SW1hZ2VbdGFyZ2V0SW1hZ2VJbmRleCArIDJdID0gcGl4ZWxzW3BpeGVsICsgYk9mZnNldF07XHJcbiAgICAgICAgICAgIHRhcmdldEltYWdlW3RhcmdldEltYWdlSW5kZXggKyAzXSA9IDI1NTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHBpeGVsICs9IHBpeGVsc09mZnNldDtcclxuICAgICAgICAgICAgdGFyZ2V0SW1hZ2VJbmRleCArPSA0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0YXJnZXRJbWFnZUluZGV4ID0gdGFyZ2V0SW1hZ2VTdGFydExpbmUgKyB0YXJnZXRJbWFnZVN0cmlkZTtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIENvbXBvc2l0ZUFycmF5KG9mZnNldCkge1xyXG4gICAgdmFyIGxlbmd0aCA9IDA7XHJcbiAgICB2YXIgaW50ZXJuYWxQYXJ0cyA9IFtdO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExlbmd0aCA9IGZ1bmN0aW9uIGdldExlbmd0aCgpIHtcclxuICAgICAgICByZXR1cm4gbGVuZ3RoO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmdldE9mZnNldCA9IGZ1bmN0aW9uIGdldE9mZnNldCgpIHtcclxuICAgICAgICByZXR1cm4gb2Zmc2V0O1xyXG4gICAgfTtcclxuICAgICAgICBcclxuICAgIHRoaXMucHVzaFN1YkFycmF5ID0gZnVuY3Rpb24gcHVzaFN1YkFycmF5KHN1YkFycmF5KSB7XHJcbiAgICAgICAgaW50ZXJuYWxQYXJ0cy5wdXNoKHN1YkFycmF5KTtcclxuICAgICAgICBsZW5ndGggKz0gc3ViQXJyYXkubGVuZ3RoO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5jb3B5VG9PdGhlckF0VGhlRW5kID0gZnVuY3Rpb24gY29weVRvT3RoZXJBdFRoZUVuZChyZXN1bHQsIG1pbk9mZnNldCwgbWF4T2Zmc2V0KSB7XHJcbiAgICAgICAgY2hlY2tPZmZzZXRzVG9Db3B5KG1pbk9mZnNldCwgbWF4T2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXRlcmF0b3IgPSBnZXRJbnRlcm5hbFBhcnRzSXRlcmF0b3IobWluT2Zmc2V0LCBtYXhPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE5PVEU6IFdoYXQgaWYgZGF0YSBub3QgaW4gZmlyc3QgcGFydD9cclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAodHJ5QWR2YW5jZUl0ZXJhdG9yKGl0ZXJhdG9yKSkge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaFN1YkFycmF5KGl0ZXJhdG9yLnN1YkFycmF5KTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuY29weVRvVHlwZWRBcnJheSA9IGZ1bmN0aW9uIGNvcHlUb1R5cGVkQXJyYXkoXHJcbiAgICAgICAgcmVzdWx0QXJyYXksIHJlc3VsdEFycmF5T2Zmc2V0LCBtaW5PZmZzZXQsIG1heE9mZnNldCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNoZWNrT2Zmc2V0c1RvQ29weShtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gZ2V0SW50ZXJuYWxQYXJ0c0l0ZXJhdG9yKG1pbk9mZnNldCwgbWF4T2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBOT1RFOiBXaGF0IGlmIGRhdGEgbm90IGluIGZpcnN0IHBhcnQ/XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpIHtcclxuICAgICAgICAgICAgdmFyIG9mZnNldEluUmVzdWx0ID1cclxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLm9mZnNldCAtIHJlc3VsdEFycmF5T2Zmc2V0O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVzdWx0QXJyYXkuc2V0KGl0ZXJhdG9yLnN1YkFycmF5LCBvZmZzZXRJblJlc3VsdCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmNvcHlUb0FycmF5ID0gZnVuY3Rpb24gY29weVRvQXJyYXkoXHJcbiAgICAgICAgcmVzdWx0QXJyYXksIHJlc3VsdEFycmF5T2Zmc2V0LCBtaW5PZmZzZXQsIG1heE9mZnNldCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNoZWNrT2Zmc2V0c1RvQ29weShtaW5PZmZzZXQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gZ2V0SW50ZXJuYWxQYXJ0c0l0ZXJhdG9yKG1pbk9mZnNldCwgbWF4T2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBOT1RFOiBXaGF0IGlmIGRhdGEgbm90IGluIGZpcnN0IHBhcnQ/XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKHRyeUFkdmFuY2VJdGVyYXRvcihpdGVyYXRvcikpIHtcclxuICAgICAgICAgICAgdmFyIG9mZnNldEluUmVzdWx0ID1cclxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLm9mZnNldCAtIHJlc3VsdEFycmF5T2Zmc2V0O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpdGVyYXRvci5zdWJBcnJheS5sZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0QXJyYXlbb2Zmc2V0SW5SZXN1bHQrK10gPSBpdGVyYXRvci5zdWJBcnJheVtqXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY29weVRvT3RoZXIgPSBmdW5jdGlvbiBjb3B5VG9PdGhlcihvdGhlcikge1xyXG4gICAgICAgIGlmIChvdGhlci5nZXRPZmZzZXQoKSA+IG9mZnNldCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdDb21wb3NpdGVBcnJheTogVHJ5aW5nIHRvIGNvcHkgcGFydCBpbnRvIGEgbGF0dGVyIHBhcnQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG90aGVyRW5kT2Zmc2V0ID0gb3RoZXIuZ2V0T2Zmc2V0KCkgKyBvdGhlci5nZXRMZW5ndGgoKTtcclxuICAgICAgICB2YXIgaXNPdGhlckNvbnRhaW5zVGhpcyA9IG9mZnNldCArIGxlbmd0aCA8PSBvdGhlckVuZE9mZnNldDtcclxuICAgICAgICBpZiAoaXNPdGhlckNvbnRhaW5zVGhpcykge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgLy8gRG8gbm90IG92ZXJyaWRlIGFscmVhZHkgZXhpc3QgZGF0YSAoZm9yIGVmZmljaWVuY3kpXHJcbiAgICAgICAgdmFyIG1pbk9mZnNldCA9IG90aGVyRW5kT2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IGdldEludGVybmFsUGFydHNJdGVyYXRvcihtaW5PZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghdHJ5QWR2YW5jZUl0ZXJhdG9yKGl0ZXJhdG9yKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdDb21wb3NpdGVBcnJheTogQ291bGQgbm90IG1lcmdlIHBhcnRzJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBleHBlY3RlZE9mZnNldFZhbHVlID0gbWluT2Zmc2V0O1xyXG5cclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIGlmIChpdGVyYXRvci5vZmZzZXQgIT09IGV4cGVjdGVkT2Zmc2V0VmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDb21wb3NpdGVBcnJheTogTm9uLWNvbnRpbnVvdXMgdmFsdWUgb2YgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ3JhbmdlVG9Db3B5Lm9mZnNldC4gRXhwZWN0ZWQ6ICcgKyBleHBlY3RlZE9mZnNldFZhbHVlICtcclxuICAgICAgICAgICAgICAgICAgICAgJywgQWN0dWFsOiAnICsgaXRlcmF0b3Iub2Zmc2V0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgb3RoZXIucHVzaFN1YkFycmF5KGl0ZXJhdG9yLnN1YkFycmF5KTtcclxuICAgICAgICAgICAgZXhwZWN0ZWRPZmZzZXRWYWx1ZSArPSBpdGVyYXRvci5zdWJBcnJheS5sZW5ndGg7XHJcbiAgICAgICAgfSB3aGlsZSAodHJ5QWR2YW5jZUl0ZXJhdG9yKGl0ZXJhdG9yKSk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjaGVja09mZnNldHNUb0NvcHkobWluT2Zmc2V0LCBtYXhPZmZzZXQpIHtcclxuICAgICAgICBpZiAobWluT2Zmc2V0ID09PSB1bmRlZmluZWQgfHwgbWF4T2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnbWluT2Zmc2V0IG9yIG1heE9mZnNldCBpcyB1bmRlZmluZWQgZm9yIENvbXBvc2l0ZUFycmF5LmNvcHlUb0FycmF5Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtaW5PZmZzZXQgPCBvZmZzZXQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnbWluT2Zmc2V0ICgnICsgbWluT2Zmc2V0ICsgJykgbXVzdCBiZSBzbWFsbGVyIHRoYW4gJyArXHJcbiAgICAgICAgICAgICAgICAnQ29tcG9zaXRlQXJyYXkgb2Zmc2V0ICgnICsgb2Zmc2V0ICsgJyknKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1heE9mZnNldCA+IG9mZnNldCArIGxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdtYXhPZmZzZXQgKCcgKyBtYXhPZmZzZXQgKyAnKSBtdXN0IGJlIGxhcmdlciB0aGFuICcgK1xyXG4gICAgICAgICAgICAgICAgJ0NvbXBvc2l0ZUFycmF5IGVuZCBvZmZzZXQgKCcgKyBvZmZzZXQgKyBsZW5ndGggKyAnKScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0SW50ZXJuYWxQYXJ0c0l0ZXJhdG9yKG1pbk9mZnNldCwgbWF4T2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIHN0YXJ0ID0gTWF0aC5tYXgob2Zmc2V0LCBtaW5PZmZzZXQpO1xyXG5cclxuICAgICAgICB2YXIgZW5kID0gb2Zmc2V0ICsgbGVuZ3RoO1xyXG4gICAgICAgIGlmIChtYXhPZmZzZXQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBlbmQgPSBNYXRoLm1pbihlbmQsIG1heE9mZnNldCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzdGFydCA+PSBlbmQpIHtcclxuICAgICAgICAgICAgdmFyIGVtcHR5SXRlcmF0b3IgPSB7XHJcbiAgICAgICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YTogeyBpc0VuZE9mUmFuZ2U6IHRydWUgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIGVtcHR5SXRlcmF0b3I7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IHtcclxuICAgICAgICAgICAgc3ViQXJyYXk6IG51bGwsXHJcbiAgICAgICAgICAgIG9mZnNldDogLTEsXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YToge1xyXG4gICAgICAgICAgICAgICAgZW5kOiBlbmQsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50U3ViQXJyYXk6IG51bGwsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SW50ZXJuYWxQYXJ0T2Zmc2V0OiBudWxsLFxyXG4gICAgICAgICAgICAgICAgbmV4dEludGVybmFsUGFydE9mZnNldDogb2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgY3VycmVudEludGVybmFsUGFydEluZGV4OiAtMSxcclxuICAgICAgICAgICAgICAgIGlzRW5kT2ZSYW5nZTogZmFsc2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGFscmVhZHlSZWFjaGVkVG9UaGVFbmQgPSBmYWxzZTtcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIGlmIChhbHJlYWR5UmVhY2hlZFRvVGhlRW5kKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignSXRlcmF0b3IgcmVhY2hlZCAnICtcclxuICAgICAgICAgICAgICAgICAgICAndG8gdGhlIGVuZCBhbHRob3VnaCBubyBkYXRhIGhhcyBiZWVuIGl0ZXJhdGVkJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGFscmVhZHlSZWFjaGVkVG9UaGVFbmQgPSAhdHJ5QWR2YW5jZUl0ZXJhdG9yKGl0ZXJhdG9yKTtcclxuICAgICAgICB9IHdoaWxlIChzdGFydCA+PSBpdGVyYXRvci5pbnRlcm5hbEl0ZXJhdG9yRGF0YS5uZXh0SW50ZXJuYWxQYXJ0T2Zmc2V0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY3V0Rmlyc3RTdWJBcnJheSA9XHJcbiAgICAgICAgICAgIHN0YXJ0IC0gaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydE9mZnNldDtcclxuICAgICAgICBpdGVyYXRvci5pbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50U3ViQXJyYXkgPVxyXG4gICAgICAgICAgICBpdGVyYXRvci5pbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50U3ViQXJyYXkuc3ViYXJyYXkoY3V0Rmlyc3RTdWJBcnJheSk7XHJcbiAgICAgICAgaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydE9mZnNldCA9IHN0YXJ0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBpdGVyYXRvcjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gdHJ5QWR2YW5jZUl0ZXJhdG9yKGl0ZXJhdG9yKSB7XHJcbiAgICAgICAgdmFyIGludGVybmFsSXRlcmF0b3JEYXRhID0gaXRlcmF0b3IuaW50ZXJuYWxJdGVyYXRvckRhdGE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGludGVybmFsSXRlcmF0b3JEYXRhLmlzRW5kT2ZSYW5nZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGl0ZXJhdG9yLnN1YkFycmF5ID0gaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudFN1YkFycmF5O1xyXG4gICAgICAgIGl0ZXJhdG9yLm9mZnNldCA9IGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgKytpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGludGVybmFsSXRlcmF0b3JEYXRhLm5leHRJbnRlcm5hbFBhcnRPZmZzZXQgPj0gaW50ZXJuYWxJdGVyYXRvckRhdGEuZW5kKSB7XHJcbiAgICAgICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmlzRW5kT2ZSYW5nZSA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZW5zdXJlTm9FbmRPZkFycmF5UmVhY2hlZChpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0SW5kZXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRTdWJBcnJheSA9IGludGVybmFsUGFydHNbXHJcbiAgICAgICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRJbmRleF07XHJcbiAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudEludGVybmFsUGFydE9mZnNldCA9XHJcbiAgICAgICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLm5leHRJbnRlcm5hbFBhcnRPZmZzZXQ7XHJcbiAgICAgICAgdmFyIGN1cnJlbnRJbnRlcm5hbFBhcnRMZW5ndGggPVxyXG4gICAgICAgICAgICBpbnRlcm5hbFBhcnRzW2ludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRJbmRleF0ubGVuZ3RoO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLm5leHRJbnRlcm5hbFBhcnRPZmZzZXQgPVxyXG4gICAgICAgICAgICBpbnRlcm5hbEl0ZXJhdG9yRGF0YS5jdXJyZW50SW50ZXJuYWxQYXJ0T2Zmc2V0ICsgY3VycmVudEludGVybmFsUGFydExlbmd0aDtcclxuXHJcbiAgICAgICAgdmFyIGN1dExhc3RTdWJBcnJheSA9XHJcbiAgICAgICAgICAgIGludGVybmFsSXRlcmF0b3JEYXRhLmVuZCAtIGludGVybmFsSXRlcmF0b3JEYXRhLmN1cnJlbnRJbnRlcm5hbFBhcnRPZmZzZXQ7XHJcbiAgICAgICAgdmFyIGlzTGFzdFN1YkFycmF5ID1cclxuICAgICAgICAgICAgY3V0TGFzdFN1YkFycmF5IDwgaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudFN1YkFycmF5Lmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNMYXN0U3ViQXJyYXkpIHtcclxuICAgICAgICAgICAgaW50ZXJuYWxJdGVyYXRvckRhdGEuY3VycmVudFN1YkFycmF5ID0gaW50ZXJuYWxJdGVyYXRvckRhdGFcclxuICAgICAgICAgICAgICAgIC5jdXJyZW50U3ViQXJyYXkuc3ViYXJyYXkoMCwgY3V0TGFzdFN1YkFycmF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGVuc3VyZU5vRW5kT2ZBcnJheVJlYWNoZWQoY3VycmVudEludGVybmFsUGFydEluZGV4KSB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRJbnRlcm5hbFBhcnRJbmRleCA+PSBpbnRlcm5hbFBhcnRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdDb21wb3NpdGVBcnJheTogZW5kIG9mIHBhcnQgaGFzIHJlYWNoZWQuIENoZWNrIGVuZCBjYWxjdWxhdGlvbicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG4vLyBBLjIuMS5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcERhdGFiaW5QYXJ0cyhcclxuICAgIGNsYXNzSWQsIGluQ2xhc3NJZCwganBpcEZhY3RvcnkpIHtcclxuXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgdmFyIHBhcnRzID0gW107XHJcbiAgICB2YXIgZGF0YWJpbkxlbmd0aElmS25vd24gPSBudWxsO1xyXG4gICAgdmFyIGxvYWRlZEJ5dGVzID0gMDtcclxuICAgIFxyXG4gICAgdmFyIGNhY2hlZERhdGEgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXREYXRhYmluTGVuZ3RoSWZLbm93biA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBkYXRhYmluTGVuZ3RoSWZLbm93bjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TG9hZGVkQnl0ZXMgPSBmdW5jdGlvbiBnZXRMb2FkZWRCeXRlcygpIHtcclxuICAgICAgICByZXR1cm4gbG9hZGVkQnl0ZXM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmlzQWxsRGF0YWJpbkxvYWRlZCA9IGZ1bmN0aW9uIGlzQWxsRGF0YWJpbkxvYWRlZCgpIHtcclxuICAgICAgICB2YXIgcmVzdWx0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAocGFydHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNhc2UgMDpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGRhdGFiaW5MZW5ndGhJZktub3duID09PSAwO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ID1cclxuICAgICAgICAgICAgICAgICAgICBwYXJ0c1swXS5nZXRPZmZzZXQoKSA9PT0gMCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIHBhcnRzWzBdLmdldExlbmd0aCgpID09PSBkYXRhYmluTGVuZ3RoSWZLbm93bjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENhY2hlZERhdGEgPSBmdW5jdGlvbiBnZXRDYWNoZWREYXRhKGtleSkge1xyXG4gICAgICAgIHZhciBvYmogPSBjYWNoZWREYXRhW2tleV07XHJcbiAgICAgICAgaWYgKG9iaiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIG9iaiA9IHt9O1xyXG4gICAgICAgICAgICBjYWNoZWREYXRhW2tleV0gPSBvYmo7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBvYmo7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENsYXNzSWQgPSBmdW5jdGlvbiBnZXRDbGFzc0lkKCkge1xyXG4gICAgICAgIHJldHVybiBjbGFzc0lkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJbkNsYXNzSWQgPSBmdW5jdGlvbiBnZXRJbkNsYXNzSWQoKSB7XHJcbiAgICAgICAgcmV0dXJuIGluQ2xhc3NJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY29weVRvQ29tcG9zaXRlQXJyYXkgPSBmdW5jdGlvbiBjb3B5VG9Db21wb3NpdGVBcnJheShyZXN1bHQsIHJhbmdlT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBkdW1teVJlc3VsdFN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICB2YXIgcGFyYW1zID0gZ2V0UGFyYW1zRm9yQ29weUJ5dGVzKGR1bW15UmVzdWx0U3RhcnRPZmZzZXQsIHJhbmdlT3B0aW9ucyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHBhcmFtcy5yZXN1bHRXaXRob3V0Q29weSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJhbXMucmVzdWx0V2l0aG91dENvcHk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhMZW5ndGhDb3BpZWQgPSBpdGVyYXRlUmFuZ2UoXHJcbiAgICAgICAgICAgIHBhcmFtcy5kYXRhYmluU3RhcnRPZmZzZXQsXHJcbiAgICAgICAgICAgIHBhcmFtcy5tYXhMZW5ndGhUb0NvcHksXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIGFkZFBhcnRUb1Jlc3VsdEluQ29weVRvQ29tcG9zaXRlQXJyYXkocGFydCwgbWluT2Zmc2V0SW5QYXJ0LCBtYXhPZmZzZXRJblBhcnQpIHtcclxuICAgICAgICAgICAgICAgIHBhcnQuY29weVRvT3RoZXJBdFRoZUVuZChcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgICAgICAgICAgbWluT2Zmc2V0SW5QYXJ0LFxyXG4gICAgICAgICAgICAgICAgICAgIG1heE9mZnNldEluUGFydCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBtYXhMZW5ndGhDb3BpZWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNvcHlCeXRlcyA9IGZ1bmN0aW9uKHJlc3VsdEFycmF5LCByZXN1bHRTdGFydE9mZnNldCwgcmFuZ2VPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIHBhcmFtcyA9IGdldFBhcmFtc0ZvckNvcHlCeXRlcyhyZXN1bHRTdGFydE9mZnNldCwgcmFuZ2VPcHRpb25zKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocGFyYW1zLnJlc3VsdFdpdGhvdXRDb3B5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcmFtcy5yZXN1bHRXaXRob3V0Q29weTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdEFycmF5T2Zmc2V0SW5EYXRhYmluID0gcGFyYW1zLmRhdGFiaW5TdGFydE9mZnNldCAtIHBhcmFtcy5yZXN1bHRTdGFydE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWF4TGVuZ3RoQ29waWVkID0gaXRlcmF0ZVJhbmdlKFxyXG4gICAgICAgICAgICBwYXJhbXMuZGF0YWJpblN0YXJ0T2Zmc2V0LFxyXG4gICAgICAgICAgICBwYXJhbXMubWF4TGVuZ3RoVG9Db3B5LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiBhZGRQYXJ0VG9SZXN1bHRJbkNvcHlCeXRlcyhwYXJ0LCBtaW5PZmZzZXRJblBhcnQsIG1heE9mZnNldEluUGFydCkge1xyXG4gICAgICAgICAgICAgICAgcGFydC5jb3B5VG9BcnJheShcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHRBcnJheSxcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHRBcnJheU9mZnNldEluRGF0YWJpbixcclxuICAgICAgICAgICAgICAgICAgICBtaW5PZmZzZXRJblBhcnQsXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4T2Zmc2V0SW5QYXJ0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG1heExlbmd0aENvcGllZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RXhpc3RpbmdSYW5nZXMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5KHBhcnRzLmxlbmd0aCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICByZXN1bHRbaV0gPSB7XHJcbiAgICAgICAgICAgICAgICBzdGFydDogcGFydHNbaV0uZ2V0T2Zmc2V0KCksXHJcbiAgICAgICAgICAgICAgICBsZW5ndGg6IHBhcnRzW2ldLmdldExlbmd0aCgpXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5hZGREYXRhID0gZnVuY3Rpb24oaGVhZGVyLCBtZXNzYWdlKSB7XHJcbiAgICAgICAgaWYgKGhlYWRlci5pc0xhc3RCeXRlSW5EYXRhYmluKSB7XHJcbiAgICAgICAgICAgIGRhdGFiaW5MZW5ndGhJZktub3duID0gaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0ICsgaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBuZXdQYXJ0ID0ganBpcEZhY3RvcnkuY3JlYXRlQ29tcG9zaXRlQXJyYXkoXHJcbiAgICAgICAgICAgIGhlYWRlci5tZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydCk7XHJcblxyXG4gICAgICAgIHZhciBlbmRPZmZzZXRJbk1lc3NhZ2UgPSBoZWFkZXIuYm9keVN0YXJ0ICsgaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgIG5ld1BhcnQucHVzaFN1YkFycmF5KG1lc3NhZ2Uuc3ViYXJyYXkoaGVhZGVyLmJvZHlTdGFydCwgZW5kT2Zmc2V0SW5NZXNzYWdlKSk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgd2hlcmUgdG8gcHVzaCB0aGUgbmV3IG1lc3NhZ2VcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW5kZXhGaXJzdFBhcnRBZnRlciA9IGZpbmRGaXJzdFBhcnRBZnRlck9mZnNldChoZWFkZXIubWVzc2FnZU9mZnNldEZyb21EYXRhYmluU3RhcnQpO1xyXG4gICAgICAgIHZhciBpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyID0gaW5kZXhGaXJzdFBhcnRBZnRlcjtcclxuXHJcbiAgICAgICAgaWYgKGluZGV4Rmlyc3RQYXJ0QWZ0ZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHZhciBwcmV2aW91c1BhcnQgPSBwYXJ0c1tpbmRleEZpcnN0UGFydEFmdGVyIC0gMV07XHJcbiAgICAgICAgICAgIHZhciBwcmV2aW91c1BhcnRFbmRPZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgcHJldmlvdXNQYXJ0LmdldE9mZnNldCgpICsgcHJldmlvdXNQYXJ0LmdldExlbmd0aCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHByZXZpb3VzUGFydEVuZE9mZnNldCA9PT0gaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDYW4gbWVyZ2UgYWxzbyBwcmV2aW91cyBwYXJ0XHJcbiAgICAgICAgICAgICAgICAtLWluZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyID49IHBhcnRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBwYXJ0cy5wdXNoKG5ld1BhcnQpO1xyXG4gICAgICAgICAgICBsb2FkZWRCeXRlcyArPSBoZWFkZXIubWVzc2FnZUJvZHlMZW5ndGg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdFBhcnROZWFyT3JBZnRlciA9IHBhcnRzW2luZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXJdO1xyXG4gICAgICAgIHZhciBlbmRPZmZzZXRJbkRhdGFiaW4gPVxyXG4gICAgICAgICAgICBoZWFkZXIubWVzc2FnZU9mZnNldEZyb21EYXRhYmluU3RhcnQgKyBoZWFkZXIubWVzc2FnZUJvZHlMZW5ndGg7XHJcbiAgICAgICAgaWYgKGZpcnN0UGFydE5lYXJPckFmdGVyLmdldE9mZnNldCgpID4gZW5kT2Zmc2V0SW5EYXRhYmluKSB7XHJcbiAgICAgICAgICAgIC8vIE5vdCBmb3VuZCBhbiBvdmVybGFwcGluZyBwYXJ0LCBwdXNoIGEgbmV3XHJcbiAgICAgICAgICAgIC8vIHBhcnQgaW4gdGhlIG1pZGRsZSBvZiB0aGUgcGFydHMgYXJyYXlcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoOyBpID4gaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlcjsgLS1pKSB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0c1tpXSA9IHBhcnRzW2kgLSAxXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcGFydHNbaW5kZXhGaXJzdFBhcnROZWFyT3JBZnRlcl0gPSBuZXdQYXJ0O1xyXG4gICAgICAgICAgICBsb2FkZWRCeXRlcyArPSBoZWFkZXIubWVzc2FnZUJvZHlMZW5ndGg7XHJcblxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIE1lcmdlIGZpcnN0IGFuZCBsYXN0IG92ZXJsYXBwaW5nIHBhcnRzIC0gYWxsIHRoZSByZXN0IChpZiBhbnkpIGFyZSBpbiB0aGUgbWlkZGxlIG9mIHRoZSBuZXcgcGFydFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0FscmVhZHlTYXZlZCA9IGZpcnN0UGFydE5lYXJPckFmdGVyLmdldExlbmd0aCgpO1xyXG5cclxuICAgICAgICB2YXIgc2hvdWxkU3dhcCA9XHJcbiAgICAgICAgICAgIGZpcnN0UGFydE5lYXJPckFmdGVyLmdldE9mZnNldCgpID4gaGVhZGVyLm1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0O1xyXG4gICAgICAgIGlmIChzaG91bGRTd2FwKSB7XHJcbiAgICAgICAgICAgIHBhcnRzW2luZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXJdID0gbmV3UGFydDtcclxuICAgICAgICAgICAgbmV3UGFydCA9IGZpcnN0UGFydE5lYXJPckFmdGVyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZmlyc3RQYXJ0TmVhck9yQWZ0ZXIgPSBwYXJ0c1tpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIG5ld1BhcnQuY29weVRvT3RoZXIoZmlyc3RQYXJ0TmVhck9yQWZ0ZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBlbmRPZmZzZXQgPVxyXG4gICAgICAgICAgICBmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRPZmZzZXQoKSArIGZpcnN0UGFydE5lYXJPckFmdGVyLmdldExlbmd0aCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYXJ0VG9NZXJnZUluZGV4O1xyXG4gICAgICAgIGZvciAocGFydFRvTWVyZ2VJbmRleCA9IGluZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXI7XHJcbiAgICAgICAgICAgIHBhcnRUb01lcmdlSW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxO1xyXG4gICAgICAgICAgICArK3BhcnRUb01lcmdlSW5kZXgpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChlbmRPZmZzZXQgPCBwYXJ0c1twYXJ0VG9NZXJnZUluZGV4ICsgMV0uZ2V0T2Zmc2V0KCkpIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBieXRlc0FscmVhZHlTYXZlZCArPSBwYXJ0c1twYXJ0VG9NZXJnZUluZGV4ICsgMV0uZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYXJ0c1RvRGVsZXRlID0gcGFydFRvTWVyZ2VJbmRleCAtIGluZGV4Rmlyc3RQYXJ0TmVhck9yQWZ0ZXI7XHJcbiAgICAgICAgaWYgKHBhcnRzVG9EZWxldGUgPiAwKSB7XHJcbiAgICAgICAgICAgIHBhcnRzW3BhcnRUb01lcmdlSW5kZXhdLmNvcHlUb090aGVyKGZpcnN0UGFydE5lYXJPckFmdGVyKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIERlbGV0ZSBhbGwgbWlkZGxlIGFuZCBtZXJnZWQgcGFydHMgZXhjZXB0IDFcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGogPSBpbmRleEZpcnN0UGFydE5lYXJPckFmdGVyICsgMTsgaiA8IHBhcnRzLmxlbmd0aCAtIHBhcnRzVG9EZWxldGU7ICsraikge1xyXG4gICAgICAgICAgICAgICAgcGFydHNbal0gPSBwYXJ0c1tqICsgcGFydHNUb0RlbGV0ZV07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHBhcnRzLmxlbmd0aCAtPSBwYXJ0c1RvRGVsZXRlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsb2FkZWRCeXRlcyArPSBmaXJzdFBhcnROZWFyT3JBZnRlci5nZXRMZW5ndGgoKSAtIGJ5dGVzQWxyZWFkeVNhdmVkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0UGFyYW1zRm9yQ29weUJ5dGVzKHJlc3VsdFN0YXJ0T2Zmc2V0LCByYW5nZU9wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZm9yY2VDb3B5QWxsUmFuZ2UgPSBmYWxzZTtcclxuICAgICAgICB2YXIgZGF0YWJpblN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICB2YXIgbWF4TGVuZ3RoVG9Db3B5O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyYW5nZU9wdGlvbnMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZSA9ICEhcmFuZ2VPcHRpb25zLmZvcmNlQ29weUFsbFJhbmdlO1xyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQgPSByYW5nZU9wdGlvbnMuZGF0YWJpblN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHkgPSByYW5nZU9wdGlvbnMubWF4TGVuZ3RoVG9Db3B5O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGRhdGFiaW5TdGFydE9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXN1bHRTdGFydE9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdFN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1heExlbmd0aFRvQ29weSA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyByZXN1bHRXaXRob3V0Q29weTogMCB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoKGRhdGFiaW5MZW5ndGhJZktub3duICE9PSBudWxsKSAmJiAoZGF0YWJpblN0YXJ0T2Zmc2V0ID49IGRhdGFiaW5MZW5ndGhJZktub3duKSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyByZXN1bHRXaXRob3V0Q29weTogKCEhbWF4TGVuZ3RoVG9Db3B5ICYmIGZvcmNlQ29weUFsbFJhbmdlID8gbnVsbCA6IDApIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdFJlbGV2YW50UGFydEluZGV4ID0gZmluZEZpcnN0UGFydEFmdGVyT2Zmc2V0KGRhdGFiaW5TdGFydE9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGZpcnN0UmVsZXZhbnRQYXJ0SW5kZXggPT09IHBhcnRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyByZXN1bHRXaXRob3V0Q29weTogKGZvcmNlQ29weUFsbFJhbmdlID8gbnVsbCA6IDApIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmb3JjZUNvcHlBbGxSYW5nZSkge1xyXG4gICAgICAgICAgICB2YXIgaXNBbGxSZXF1ZXN0ZWRSYW5nZUV4aXN0ID1cclxuICAgICAgICAgICAgICAgIGlzQWxsUmFuZ2VFeGlzdChkYXRhYmluU3RhcnRPZmZzZXQsIG1heExlbmd0aFRvQ29weSwgZmlyc3RSZWxldmFudFBhcnRJbmRleCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWlzQWxsUmVxdWVzdGVkUmFuZ2VFeGlzdCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgcmVzdWx0V2l0aG91dENvcHk6IG51bGwgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGFyYW1zID0ge1xyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGRhdGFiaW5TdGFydE9mZnNldCxcclxuICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBtYXhMZW5ndGhUb0NvcHksXHJcbiAgICAgICAgICAgIHJlc3VsdFN0YXJ0T2Zmc2V0OiByZXN1bHRTdGFydE9mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwYXJhbXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGlzQWxsUmFuZ2VFeGlzdChcclxuICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQsIG1heExlbmd0aFRvQ29weSwgZmlyc3RSZWxldmFudFBhcnRJbmRleCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwYXJ0c1tmaXJzdFJlbGV2YW50UGFydEluZGV4XS5nZXRPZmZzZXQoKSA+IGRhdGFiaW5TdGFydE9mZnNldCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXhMZW5ndGhUb0NvcHkpIHtcclxuICAgICAgICAgICAgdmFyIHVudXNlZEVsZW1lbnRzID1cclxuICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldCAtIHBhcnRzW2ZpcnN0UmVsZXZhbnRQYXJ0SW5kZXhdLmdldE9mZnNldCgpO1xyXG4gICAgICAgICAgICB2YXIgYXZhaWxhYmxlTGVuZ3RoID1cclxuICAgICAgICAgICAgICAgIHBhcnRzW2ZpcnN0UmVsZXZhbnRQYXJ0SW5kZXhdLmdldExlbmd0aCgpIC0gdW51c2VkRWxlbWVudHM7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgaXNVbnRpbE1heExlbmd0aEV4aXN0ID0gYXZhaWxhYmxlTGVuZ3RoID49IG1heExlbmd0aFRvQ29weTtcclxuICAgICAgICAgICAgcmV0dXJuIGlzVW50aWxNYXhMZW5ndGhFeGlzdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5MZW5ndGhJZktub3duID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgIGZpcnN0UmVsZXZhbnRQYXJ0SW5kZXggPCBwYXJ0cy5sZW5ndGggLSAxKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIHZhciBlbmRPZmZzZXRSZWNpZXZlZCA9IGxhc3RQYXJ0LmdldE9mZnNldCgpICsgbGFzdFBhcnQuZ2V0TGVuZ3RoKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzVW50aWxFbmRPZkRhdGFiaW5FeGlzdCA9IGVuZE9mZnNldFJlY2lldmVkID09PSBkYXRhYmluTGVuZ3RoSWZLbm93bjtcclxuICAgICAgICByZXR1cm4gaXNVbnRpbEVuZE9mRGF0YWJpbkV4aXN0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpdGVyYXRlUmFuZ2UoXHJcbiAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldCxcclxuICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5LFxyXG4gICAgICAgIGFkZFN1YlBhcnRUb1Jlc3VsdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtaW5PZmZzZXRJbkRhdGFiaW5Ub0NvcHkgPSBkYXRhYmluU3RhcnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1heE9mZnNldEluRGF0YWJpblRvQ29weTtcclxuICAgICAgICBpZiAobWF4TGVuZ3RoVG9Db3B5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgbWF4T2Zmc2V0SW5EYXRhYmluVG9Db3B5ID0gZGF0YWJpblN0YXJ0T2Zmc2V0ICsgbWF4TGVuZ3RoVG9Db3B5O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHZhciBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICBtYXhPZmZzZXRJbkRhdGFiaW5Ub0NvcHkgPSBsYXN0UGFydC5nZXRPZmZzZXQoKSArIGxhc3RQYXJ0LmdldExlbmd0aCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBsYXN0Q29waWVkUGFydCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBpZiAocGFydHNbaV0uZ2V0T2Zmc2V0KCkgPj0gbWF4T2Zmc2V0SW5EYXRhYmluVG9Db3B5KSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGN1cnJlbnRNaW5PZmZzZXRJbkRhdGFiaW5Ub0NvcHkgPSBNYXRoLm1heChcclxuICAgICAgICAgICAgICAgIG1pbk9mZnNldEluRGF0YWJpblRvQ29weSwgcGFydHNbaV0uZ2V0T2Zmc2V0KCkpO1xyXG4gICAgICAgICAgICB2YXIgY3VycmVudE1heE9mZnNldEluRGF0YWJpblRvQ29weSA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICAgICAgbWF4T2Zmc2V0SW5EYXRhYmluVG9Db3B5LCBwYXJ0c1tpXS5nZXRPZmZzZXQoKSArIHBhcnRzW2ldLmdldExlbmd0aCgpKTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgYWRkU3ViUGFydFRvUmVzdWx0KFxyXG4gICAgICAgICAgICAgICAgcGFydHNbaV0sXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50TWluT2Zmc2V0SW5EYXRhYmluVG9Db3B5LFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE1heE9mZnNldEluRGF0YWJpblRvQ29weSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsYXN0Q29waWVkUGFydCA9IHBhcnRzW2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobGFzdENvcGllZFBhcnQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsYXN0T2Zmc2V0Q29waWVkID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgIGxhc3RDb3BpZWRQYXJ0LmdldE9mZnNldCgpICsgbGFzdENvcGllZFBhcnQuZ2V0TGVuZ3RoKCksXHJcbiAgICAgICAgICAgIG1heE9mZnNldEluRGF0YWJpblRvQ29weSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1heExlbmd0aENvcGllZCA9IGxhc3RPZmZzZXRDb3BpZWQgLSBkYXRhYmluU3RhcnRPZmZzZXQ7XHJcbiAgICAgICAgcmV0dXJuIG1heExlbmd0aENvcGllZDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBmaW5kRmlyc3RQYXJ0QWZ0ZXJPZmZzZXQob2Zmc2V0KSB7XHJcbiAgICAgICAgdmFyIGluZGV4O1xyXG4gICAgICAgIGZvciAoaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aDsgKytpbmRleCkge1xyXG4gICAgICAgICAgICBpZiAocGFydHNbaW5kZXhdLmdldE9mZnNldCgpICsgcGFydHNbaW5kZXhdLmdldExlbmd0aCgpID4gb2Zmc2V0KSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcERhdGFiaW5zU2F2ZXIoaXNKcGlwVGlsZVBhcnRTdHJlYW0sIGpwaXBGYWN0b3J5KSB7XHJcbiAgICB2YXIgUFJFQ0lOQ1RfTk9fQVVYX0NMQVNTID0gMDtcclxuICAgIHZhciBQUkVDSU5DVF9XSVRIX0FVWF9DTEFTUyA9IDE7XHJcbiAgICB2YXIgVElMRV9IRUFERVJfQ0xBU1MgPSAyO1xyXG4gICAgdmFyIFRJTEVfTk9fQVVYX0NMQVNTID0gNDtcclxuICAgIHZhciBUSUxFX1dJVEhfQVVYX0NMQVNTID0gNTtcclxuXHJcbiAgICB2YXIgZGF0YWJpbnNCeUNsYXNzID0gW107XHJcbiAgICB2YXIgZm9yYmlkZGVuSW5KcHAgPSBbXTtcclxuICAgIHZhciBmb3JiaWRkZW5JbkpwdCA9IFtdO1xyXG4gICAgXHJcbiAgICB2YXIgbG9hZGVkQnl0ZXMgPSAwO1xyXG4gICAgdmFyIGxvYWRlZEJ5dGVzSW5SZWdpc3RlcmVkRGF0YWJpbnMgPSAwO1xyXG5cclxuICAgIC8vIFZhbGlkIG9ubHkgaWYgaXNKcGlwVGlsZVBhcnRTdHJlYW0gPSBmYWxzZVxyXG4gICAgXHJcbiAgICBkYXRhYmluc0J5Q2xhc3NbVElMRV9IRUFERVJfQ0xBU1NdID0gY3JlYXRlRGF0YWJpbnNBcnJheSgpO1xyXG4gICAgZGF0YWJpbnNCeUNsYXNzW1BSRUNJTkNUX05PX0FVWF9DTEFTU10gPSBjcmVhdGVEYXRhYmluc0FycmF5KCk7XHJcbiAgICBkYXRhYmluc0J5Q2xhc3NbUFJFQ0lOQ1RfV0lUSF9BVVhfQ0xBU1NdID0gZGF0YWJpbnNCeUNsYXNzW1xyXG4gICAgICAgIFBSRUNJTkNUX05PX0FVWF9DTEFTU107XHJcbiAgICBcclxuICAgIGZvcmJpZGRlbkluSnB0W1RJTEVfSEVBREVSX0NMQVNTXSA9IHRydWU7XHJcbiAgICBmb3JiaWRkZW5JbkpwdFtQUkVDSU5DVF9OT19BVVhfQ0xBU1NdID0gdHJ1ZTtcclxuICAgIGZvcmJpZGRlbkluSnB0W1BSRUNJTkNUX1dJVEhfQVVYX0NMQVNTXSA9IHRydWU7XHJcbiAgICBcclxuICAgIC8vIFZhbGlkIG9ubHkgaWYgaXNKcGlwVGlsZVBhcnRTdHJlYW0gPSB0cnVlXHJcblxyXG4gICAgZGF0YWJpbnNCeUNsYXNzW1RJTEVfTk9fQVVYX0NMQVNTXSA9IGNyZWF0ZURhdGFiaW5zQXJyYXkoKTtcclxuICAgIGRhdGFiaW5zQnlDbGFzc1tUSUxFX1dJVEhfQVVYX0NMQVNTXSA9IGRhdGFiaW5zQnlDbGFzc1tcclxuICAgICAgICBUSUxFX05PX0FVWF9DTEFTU107XHJcbiAgICBcclxuICAgIGZvcmJpZGRlbkluSnBwW1RJTEVfTk9fQVVYX0NMQVNTXSA9IHRydWU7XHJcbiAgICBmb3JiaWRkZW5JbkpwcFtUSUxFX1dJVEhfQVVYX0NMQVNTXSA9IHRydWU7XHJcbiAgICBcclxuICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGpwaXBGYWN0b3J5LmNyZWF0ZURhdGFiaW5QYXJ0cyg2LCAwKTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJc0pwaXBUaWxlUGFydFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBpc0pwaXBUaWxlUGFydFN0cmVhbTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TG9hZGVkQnl0ZXMgPSBmdW5jdGlvbiBnZXRMb2FkZWRCeXRlcygpIHtcclxuICAgICAgICByZXR1cm4gbG9hZGVkQnl0ZXM7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuZ2V0TWFpbkhlYWRlckRhdGFiaW4gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcmV0dXJuIG1haW5IZWFkZXJEYXRhYmluO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlSGVhZGVyRGF0YWJpbiA9IGZ1bmN0aW9uKGluQ2xhc3NJbmRleCkge1xyXG4gICAgICAgIHZhciBkYXRhYmluID0gZ2V0RGF0YWJpbkZyb21BcnJheShcclxuICAgICAgICAgICAgZGF0YWJpbnNCeUNsYXNzW1RJTEVfSEVBREVSX0NMQVNTXSxcclxuICAgICAgICAgICAgVElMRV9IRUFERVJfQ0xBU1MsXHJcbiAgICAgICAgICAgIGluQ2xhc3NJbmRleCxcclxuICAgICAgICAgICAgLyppc0pwaXBUaWxlUGFydFN0cmVhbUV4cGVjdGVkPSovZmFsc2UsXHJcbiAgICAgICAgICAgICd0aWxlSGVhZGVyJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW47XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFByZWNpbmN0RGF0YWJpbiA9IGZ1bmN0aW9uKGluQ2xhc3NJbmRleCkge1xyXG4gICAgICAgIHZhciBkYXRhYmluID0gZ2V0RGF0YWJpbkZyb21BcnJheShcclxuICAgICAgICAgICAgZGF0YWJpbnNCeUNsYXNzW1BSRUNJTkNUX05PX0FVWF9DTEFTU10sXHJcbiAgICAgICAgICAgIFBSRUNJTkNUX05PX0FVWF9DTEFTUyxcclxuICAgICAgICAgICAgaW5DbGFzc0luZGV4LFxyXG4gICAgICAgICAgICAvKmlzSnBpcFRpbGVQYXJ0U3RyZWFtRXhwZWN0ZWQ9Ki9mYWxzZSxcclxuICAgICAgICAgICAgJ3ByZWNpbmN0Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGRhdGFiaW47XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVEYXRhYmluID0gZnVuY3Rpb24oaW5DbGFzc0luZGV4KSB7XHJcbiAgICAgICAgdmFyIGRhdGFiaW4gPSBnZXREYXRhYmluRnJvbUFycmF5KFxyXG4gICAgICAgICAgICBkYXRhYmluc0J5Q2xhc3NbVElMRV9OT19BVVhfQ0xBU1NdLFxyXG4gICAgICAgICAgICBUSUxFX05PX0FVWF9DTEFTUyxcclxuICAgICAgICAgICAgaW5DbGFzc0luZGV4LFxyXG4gICAgICAgICAgICAvKmlzSnBpcFRpbGVQYXJ0U3RyZWFtRXhwZWN0ZWQ9Ki90cnVlLFxyXG4gICAgICAgICAgICAndGlsZVBhcnQnKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gZGF0YWJpbjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uIGFkZEV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgZGF0YWJpbiwgZXZlbnQsIGxpc3RlbmVyLCBsaXN0ZW5lclRoaXMpIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZXZlbnQgIT09ICdkYXRhQXJyaXZlZCcpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ1Vuc3VwcG9ydGVkIGV2ZW50OiAnICtcclxuICAgICAgICAgICAgICAgIGV2ZW50KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNsYXNzSWQgPSBkYXRhYmluLmdldENsYXNzSWQoKTtcclxuICAgICAgICB2YXIgaW5DbGFzc0lkID0gZGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgZGF0YWJpbnNBcnJheSA9IGRhdGFiaW5zQnlDbGFzc1tjbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbiAhPT0gZGF0YWJpbnNBcnJheS5kYXRhYmluc1tpbkNsYXNzSWRdKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdVbm1hdGNoZWQgZGF0YWJpbiAnICtcclxuICAgICAgICAgICAgICAgICd3aXRoIGNsYXNzLUlEPScgKyBjbGFzc0lkICsgJyBhbmQgaW4tY2xhc3MtSUQ9JyArIGluQ2xhc3NJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChkYXRhYmluc0FycmF5Lmxpc3RlbmVyc1tpbkNsYXNzSWRdID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZGF0YWJpbnNBcnJheS5saXN0ZW5lcnNbaW5DbGFzc0lkXSA9IFtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbnNBcnJheS5saXN0ZW5lcnNbaW5DbGFzc0lkXS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgbG9hZGVkQnl0ZXNJblJlZ2lzdGVyZWREYXRhYmlucyArPSBkYXRhYmluLmdldExvYWRlZEJ5dGVzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGRhdGFiaW5zQXJyYXkubGlzdGVuZXJzW2luQ2xhc3NJZF0ucHVzaCh7XHJcbiAgICAgICAgICAgIGxpc3RlbmVyOiBsaXN0ZW5lcixcclxuICAgICAgICAgICAgbGlzdGVuZXJUaGlzOiBsaXN0ZW5lclRoaXMsXHJcbiAgICAgICAgICAgIGlzUmVnaXN0ZXJlZDogdHJ1ZVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBkYXRhYmluc0FycmF5LmRhdGFiaW5zV2l0aExpc3RlbmVyc1tpbkNsYXNzSWRdID0gZGF0YWJpbjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucmVtb3ZlRXZlbnRMaXN0ZW5lciA9IGZ1bmN0aW9uIHJlbW92ZUV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgZGF0YWJpbiwgZXZlbnQsIGxpc3RlbmVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGV2ZW50ICE9PSAnZGF0YUFycml2ZWQnKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdVbnN1cHBvcnRlZCBldmVudDogJyArXHJcbiAgICAgICAgICAgICAgICBldmVudCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgY2xhc3NJZCA9IGRhdGFiaW4uZ2V0Q2xhc3NJZCgpO1xyXG4gICAgICAgIHZhciBpbkNsYXNzSWQgPSBkYXRhYmluLmdldEluQ2xhc3NJZCgpO1xyXG4gICAgICAgIHZhciBkYXRhYmluc0FycmF5ID0gZGF0YWJpbnNCeUNsYXNzW2NsYXNzSWRdO1xyXG4gICAgICAgIHZhciBsaXN0ZW5lcnMgPSBkYXRhYmluc0FycmF5Lmxpc3RlbmVyc1tpbkNsYXNzSWRdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChkYXRhYmluICE9PSBkYXRhYmluc0FycmF5LmRhdGFiaW5zW2luQ2xhc3NJZF0gfHxcclxuICAgICAgICAgICAgZGF0YWJpbiAhPT0gZGF0YWJpbnNBcnJheS5kYXRhYmluc1dpdGhMaXN0ZW5lcnNbaW5DbGFzc0lkXSkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oJ1VubWF0Y2hlZCBkYXRhYmluICcgK1xyXG4gICAgICAgICAgICAgICAgJ3dpdGggY2xhc3MtSUQ9JyArIGNsYXNzSWQgKyAnIGFuZCBpbi1jbGFzcy1JRD0nICsgaW5DbGFzc0lkKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpIHtcclxuICAgICAgICAgICAgICAgIGxpc3RlbmVyc1tpXS5pc1JlZ2lzdGVyZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzW2ldID0gbGlzdGVuZXJzW2xpc3RlbmVycy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgICAgIGxpc3RlbmVycy5sZW5ndGggLT0gMTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVycy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBkZWxldGUgZGF0YWJpbnNBcnJheS5kYXRhYmluc1dpdGhMaXN0ZW5lcnNbaW5DbGFzc0lkXTtcclxuICAgICAgICAgICAgICAgICAgICBsb2FkZWRCeXRlc0luUmVnaXN0ZXJlZERhdGFiaW5zIC09IGRhdGFiaW4uZ2V0TG9hZGVkQnl0ZXMoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAnQ291bGQgbm90IHVucmVnaXN0ZXIgbGlzdGVuZXIgZnJvbSBkYXRhYmluJyk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNsZWFudXBVbnJlZ2lzdGVyZWREYXRhYmlucyA9IGZ1bmN0aW9uIGNsZWFudXBVbnJlZ2lzdGVyZWREYXRhYmlucygpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGFiaW5zQnlDbGFzcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBpZiAoZGF0YWJpbnNCeUNsYXNzW2ldID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgZGF0YWJpbnMgPSBkYXRhYmluc0J5Q2xhc3NbaV0uZGF0YWJpbnNXaXRoTGlzdGVuZXJzO1xyXG4gICAgICAgICAgICBkYXRhYmluc0J5Q2xhc3NbaV0uZGF0YWJpbnMgPSBkYXRhYmlucy5zbGljZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsb2FkZWRCeXRlcyA9IGxvYWRlZEJ5dGVzSW5SZWdpc3RlcmVkRGF0YWJpbnM7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuc2F2ZURhdGEgPSBmdW5jdGlvbiAoaGVhZGVyLCBtZXNzYWdlKSB7XHJcbiAgICAgICAgLy8gQS4yLjJcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaGVhZGVyLmNvZGVzdHJlYW1JbmRleCAhPT0gMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ05vbiB6ZXJvIENzbiAoQ29kZSBTdHJlYW0gSW5kZXgpJywgJ0EuMi4yJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoaGVhZGVyLmNsYXNzSWQpIHtcclxuICAgICAgICAgICAgY2FzZSA2OlxyXG4gICAgICAgICAgICAgICAgc2F2ZU1haW5IZWFkZXIoaGVhZGVyLCBtZXNzYWdlKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2UgODpcclxuICAgICAgICAgICAgICAgIHNhdmVNZXRhZGF0YShoZWFkZXIsIG1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgLy8gQS4zLjIsIEEuMy4zLCBBLjMuNFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgZGF0YWJpbnNBcnJheSA9IGRhdGFiaW5zQnlDbGFzc1toZWFkZXIuY2xhc3NJZF07XHJcbiAgICAgICAgICAgICAgICBpZiAoZGF0YWJpbnNBcnJheSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7IC8vIEEuMi4yXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBpc0pwdEV4cGVjdGVkID0gISFmb3JiaWRkZW5JbkpwcFtoZWFkZXIuY2xhc3NJZF07XHJcbiAgICAgICAgICAgICAgICB2YXIgZGF0YWJpbiA9IGdldERhdGFiaW5Gcm9tQXJyYXkoXHJcbiAgICAgICAgICAgICAgICAgICAgZGF0YWJpbnNBcnJheSxcclxuICAgICAgICAgICAgICAgICAgICBoZWFkZXIuY2xhc3NJZCxcclxuICAgICAgICAgICAgICAgICAgICBoZWFkZXIuaW5DbGFzc0lkLFxyXG4gICAgICAgICAgICAgICAgICAgIGlzSnB0RXhwZWN0ZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgJzxjbGFzcyBJRCAnICsgaGVhZGVyLmNsYXNzSWQgKyAnPicpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgYnl0ZXNCZWZvcmUgPSBkYXRhYmluLmdldExvYWRlZEJ5dGVzKCk7XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLmFkZERhdGEoaGVhZGVyLCBtZXNzYWdlKTtcclxuICAgICAgICAgICAgICAgIHZhciBieXRlc0RpZmZlcmVuY2UgPSBkYXRhYmluLmdldExvYWRlZEJ5dGVzKCkgLSBieXRlc0JlZm9yZTtcclxuICAgICAgICAgICAgICAgIGxvYWRlZEJ5dGVzICs9IGJ5dGVzRGlmZmVyZW5jZTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGxpc3RlbmVycyA9IGRhdGFiaW5zQXJyYXkubGlzdGVuZXJzO1xyXG4gICAgICAgICAgICAgICAgdmFyIGRhdGFiaW5MaXN0ZW5lcnMgPSBsaXN0ZW5lcnNbaGVhZGVyLmluQ2xhc3NJZF07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChkYXRhYmluTGlzdGVuZXJzICE9PSB1bmRlZmluZWQgJiYgZGF0YWJpbkxpc3RlbmVycy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbG9hZGVkQnl0ZXNJblJlZ2lzdGVyZWREYXRhYmlucyArPSBieXRlc0RpZmZlcmVuY2U7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxvY2FsTGlzdGVuZXJzID0gZGF0YWJpbkxpc3RlbmVycy5zbGljZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbG9jYWxMaXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGxpc3RlbmVyID0gbG9jYWxMaXN0ZW5lcnNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lci5pc1JlZ2lzdGVyZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyLmNhbGwobGlzdGVuZXIubGlzdGVuZXJUaGlzLCBkYXRhYmluKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc2F2ZU1haW5IZWFkZXIoaGVhZGVyLCBtZXNzYWdlKSB7XHJcbiAgICAgICAgLy8gQS4zLjVcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaGVhZGVyLmluQ2xhc3NJZCAhPT0gMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oJ01haW4gaGVhZGVyIGRhdGEtYmluIHdpdGggJyArXHJcbiAgICAgICAgICAgICAgICAnaW4tY2xhc3MgaW5kZXggb3RoZXIgdGhhbiB6ZXJvIGlzIG5vdCB2YWxpZCcsICdBLjMuNScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNCZWZvcmUgPSBtYWluSGVhZGVyRGF0YWJpbi5nZXRMb2FkZWRCeXRlcygpO1xyXG4gICAgICAgIG1haW5IZWFkZXJEYXRhYmluLmFkZERhdGEoaGVhZGVyLCBtZXNzYWdlKTtcclxuICAgICAgICB2YXIgYnl0ZXNEaWZmZXJlbmNlID0gbWFpbkhlYWRlckRhdGFiaW4uZ2V0TG9hZGVkQnl0ZXMoKSAtIGJ5dGVzQmVmb3JlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxvYWRlZEJ5dGVzICs9IGJ5dGVzRGlmZmVyZW5jZTtcclxuICAgICAgICBsb2FkZWRCeXRlc0luUmVnaXN0ZXJlZERhdGFiaW5zICs9IGJ5dGVzRGlmZmVyZW5jZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc2F2ZU1ldGFkYXRhKGhlYWRlciwgbWVzc2FnZSkge1xyXG4gICAgICAgIC8vIEEuMy42XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbigncmVjaWV2ZSBtZXRhZGF0YS1iaW4nLCAnQS4zLjYnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBpZ25vcmUgdW51c2VkIG1ldGFkYXRhIChsZWdhbCBhY2NvcmRpbmcgdG8gQS4yLjIpLlxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXREYXRhYmluRnJvbUFycmF5KFxyXG4gICAgICAgIGRhdGFiaW5zQXJyYXksXHJcbiAgICAgICAgY2xhc3NJZCxcclxuICAgICAgICBpbkNsYXNzSWQsXHJcbiAgICAgICAgaXNKcGlwVGlsZVBhcnRTdHJlYW1FeHBlY3RlZCxcclxuICAgICAgICBkYXRhYmluVHlwZURlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzSnBpcFRpbGVQYXJ0U3RyZWFtRXhwZWN0ZWQgIT09IGlzSnBpcFRpbGVQYXJ0U3RyZWFtKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Xcm9uZ1N0cmVhbUV4Y2VwdGlvbignZGF0YWJpbiBvZiB0eXBlICcgK1xyXG4gICAgICAgICAgICAgICAgZGF0YWJpblR5cGVEZXNjcmlwdGlvbiwgaXNKcGlwVGlsZVBhcnRTdHJlYW0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YWJpbiA9IGRhdGFiaW5zQXJyYXkuZGF0YWJpbnNbaW5DbGFzc0lkXTtcclxuICAgICAgICBpZiAoIWRhdGFiaW4pIHtcclxuICAgICAgICAgICAgZGF0YWJpbiA9IGpwaXBGYWN0b3J5LmNyZWF0ZURhdGFiaW5QYXJ0cyhjbGFzc0lkLCBpbkNsYXNzSWQpO1xyXG4gICAgICAgICAgICBkYXRhYmluc0FycmF5LmRhdGFiaW5zW2luQ2xhc3NJZF0gPSBkYXRhYmluO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gZGF0YWJpbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlRGF0YWJpbnNBcnJheSgpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBkYXRhYmluczogW10sXHJcbiAgICAgICAgICAgIGxpc3RlbmVyczogW10sXHJcbiAgICAgICAgICAgIGRhdGFiaW5zV2l0aExpc3RlbmVyczogW11cclxuICAgICAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwT2JqZWN0UG9vbEJ5RGF0YWJpbigpIHtcclxuICAgIHZhciBkYXRhYmluSWRUb09iamVjdCA9IFtdO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE9iamVjdCA9IGZ1bmN0aW9uIGdldE9iamVjdChkYXRhYmluKSB7XHJcbiAgICAgICAgdmFyIGNsYXNzSWQgPSBkYXRhYmluLmdldENsYXNzSWQoKTtcclxuICAgICAgICB2YXIgaW5DbGFzc0lkVG9PYmplY3QgPSBkYXRhYmluSWRUb09iamVjdFtjbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaW5DbGFzc0lkVG9PYmplY3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBpbkNsYXNzSWRUb09iamVjdCA9IFtdO1xyXG4gICAgICAgICAgICBkYXRhYmluSWRUb09iamVjdFtjbGFzc0lkXSA9IGluQ2xhc3NJZFRvT2JqZWN0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaW5DbGFzc0lkID0gZGF0YWJpbi5nZXRJbkNsYXNzSWQoKTtcclxuICAgICAgICB2YXIgb2JqID0gaW5DbGFzc0lkVG9PYmplY3RbaW5DbGFzc0lkXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAob2JqID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgb2JqID0ge307XHJcbiAgICAgICAgICAgIG9iai5kYXRhYmluID0gZGF0YWJpbjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGluQ2xhc3NJZFRvT2JqZWN0W2luQ2xhc3NJZF0gPSBvYmo7XHJcbiAgICAgICAgfSBlbHNlIGlmIChvYmouZGF0YWJpbiAhPT0gZGF0YWJpbikge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdEYXRhYmluIElEcyBhcmUgbm90IHVuaXF1ZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gb2JqO1xyXG4gICAgfTtcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcihcclxuICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrLFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICBxdWFsaXR5TGF5ZXJzQ2FjaGUsXHJcbiAgICBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgbnVtUXVhbGl0eUxheWVyc1RvV2FpdEZvcjtcclxuICAgIHZhciB0aWxlSGVhZGVyc05vdExvYWRlZCA9IDA7XHJcbiAgICB2YXIgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPSAwO1xyXG4gICAgdmFyIHVucmVnaXN0ZXJlZCA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB2YXIgcmVnaXN0ZXJlZFRpbGVIZWFkZXJEYXRhYmlucyA9IFtdO1xyXG4gICAgdmFyIHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zID0gW107XHJcbiAgICB2YXIgYWNjdW11bGF0ZWREYXRhUGVyRGF0YWJpbiA9IGpwaXBGYWN0b3J5LmNyZWF0ZU9iamVjdFBvb2xCeURhdGFiaW4oKTtcclxuICAgIHZhciBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyID0gW107XHJcbiAgICBcclxuICAgIHJlZ2lzdGVyKCk7XHJcbiAgICBcclxuICAgIHRoaXMudW5yZWdpc3RlciA9IGZ1bmN0aW9uIHVucmVnaXN0ZXIoKSB7XHJcbiAgICAgICAgaWYgKHVucmVnaXN0ZXJlZCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWdpc3RlcmVkVGlsZUhlYWRlckRhdGFiaW5zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihcclxuICAgICAgICAgICAgICAgIHJlZ2lzdGVyZWRUaWxlSGVhZGVyRGF0YWJpbnNbaV0sXHJcbiAgICAgICAgICAgICAgICAnZGF0YUFycml2ZWQnLFxyXG4gICAgICAgICAgICAgICAgdGlsZUhlYWRlckRhdGFBcnJpdmVkKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCByZWdpc3RlcmVkUHJlY2luY3REYXRhYmlucy5sZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXHJcbiAgICAgICAgICAgICAgICByZWdpc3RlcmVkUHJlY2luY3REYXRhYmluc1tqXSxcclxuICAgICAgICAgICAgICAgICdkYXRhQXJyaXZlZCcsXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdERhdGFBcnJpdmVkKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdW5yZWdpc3RlcmVkID0gdHJ1ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHJlZ2lzdGVyKCkge1xyXG4gICAgICAgICsrdGlsZUhlYWRlcnNOb3RMb2FkZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJdGVyYXRvciA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZXNJdGVyYXRvcihjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICB2YXIgdGlsZUluZGV4ID0gdGlsZUl0ZXJhdG9yLnRpbGVJbmRleDtcclxuICAgICAgICAgICAgdmFyIGRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldFRpbGVIZWFkZXJEYXRhYmluKHRpbGVJbmRleCk7XHJcbiAgICAgICAgICAgIHJlZ2lzdGVyZWRUaWxlSGVhZGVyRGF0YWJpbnMucHVzaChkYXRhYmluKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIuYWRkRXZlbnRMaXN0ZW5lcihcclxuICAgICAgICAgICAgICAgIGRhdGFiaW4sICdkYXRhQXJyaXZlZCcsIHRpbGVIZWFkZXJEYXRhQXJyaXZlZCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgKyt0aWxlSGVhZGVyc05vdExvYWRlZDtcclxuICAgICAgICAgICAgdGlsZUhlYWRlckRhdGFBcnJpdmVkKGRhdGFiaW4pO1xyXG4gICAgICAgIH0gd2hpbGUgKHRpbGVJdGVyYXRvci50cnlBZHZhbmNlKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC0tdGlsZUhlYWRlcnNOb3RMb2FkZWQ7XHJcbiAgICAgICAgdHJ5QWR2YW5jZVF1YWxpdHlMYXllcnNSZWFjaGVkKCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRpbGVIZWFkZXJEYXRhQXJyaXZlZCh0aWxlSGVhZGVyRGF0YWJpbikge1xyXG4gICAgICAgIGlmICghdGlsZUhlYWRlckRhdGFiaW4uaXNBbGxEYXRhYmluTG9hZGVkKCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUFjY3VtdWxhdGVkRGF0YSA9IGFjY3VtdWxhdGVkRGF0YVBlckRhdGFiaW4uZ2V0T2JqZWN0KFxyXG4gICAgICAgICAgICB0aWxlSGVhZGVyRGF0YWJpbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHRpbGVBY2N1bXVsYXRlZERhdGEuaXNBbHJlYWR5TG9hZGVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGlsZUFjY3VtdWxhdGVkRGF0YS5pc0FscmVhZHlMb2FkZWQgPSB0cnVlO1xyXG4gICAgICAgIC0tdGlsZUhlYWRlcnNOb3RMb2FkZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVJbmRleCA9IHRpbGVIZWFkZXJEYXRhYmluLmdldEluQ2xhc3NJZCgpO1xyXG4gICAgICAgIHZhciB0aWxlU3RydWN0dXJlID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlU3RydWN0dXJlKHRpbGVJbmRleCk7XHJcbiAgICAgICAgdmFyIHF1YWxpdHlJblRpbGUgPSB0aWxlU3RydWN0dXJlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RJdGVyYXRvciA9IHRpbGVTdHJ1Y3R1cmUuZ2V0UHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICAgICAgdGlsZUluZGV4LCBjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcblxyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgaWYgKCFwcmVjaW5jdEl0ZXJhdG9yLmlzSW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ1VuZXhwZWN0ZWQgcHJlY2luY3Qgbm90IGluIGNvZGVzdHJlYW0gcGFydCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgaW5DbGFzc0lkID0gdGlsZVN0cnVjdHVyZS5wcmVjaW5jdFBvc2l0aW9uVG9JbkNsYXNzSW5kZXgoXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdEl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcHJlY2luY3REYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRQcmVjaW5jdERhdGFiaW4oaW5DbGFzc0lkKTtcclxuICAgICAgICAgICAgcmVnaXN0ZXJlZFByZWNpbmN0RGF0YWJpbnMucHVzaChwcmVjaW5jdERhdGFiaW4pO1xyXG4gICAgICAgICAgICB2YXIgYWNjdW11bGF0ZWREYXRhID0gYWNjdW11bGF0ZWREYXRhUGVyRGF0YWJpbi5nZXRPYmplY3QoXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFjY3VtdWxhdGVkRGF0YS5xdWFsaXR5SW5UaWxlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdUaWxlIHdhcyAnICtcclxuICAgICAgICAgICAgICAgICAgICAnaXRlcmF0ZWQgdHdpY2UgaW4gY29kZXN0cmVhbSBwYXJ0Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGFjY3VtdWxhdGVkRGF0YS5xdWFsaXR5SW5UaWxlID0gcXVhbGl0eUluVGlsZTtcclxuICAgICAgICAgICAgaW5jcmVtZW50UHJlY2luY3RRdWFsaXR5TGF5ZXJzKFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLCBhY2N1bXVsYXRlZERhdGEsIHByZWNpbmN0SXRlcmF0b3IpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlci5hZGRFdmVudExpc3RlbmVyKFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLCAnZGF0YUFycml2ZWQnLCBwcmVjaW5jdERhdGFBcnJpdmVkKTtcclxuICAgICAgICB9IHdoaWxlIChwcmVjaW5jdEl0ZXJhdG9yLnRyeUFkdmFuY2UoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdHJ5QWR2YW5jZVF1YWxpdHlMYXllcnNSZWFjaGVkKCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHByZWNpbmN0RGF0YUFycml2ZWQocHJlY2luY3REYXRhYmluKSB7XHJcbiAgICAgICAgdmFyIGxvY2FsID0gdW5yZWdpc3RlcmVkO1xyXG4gICAgICAgIHZhciBhY2N1bXVsYXRlZERhdGEgPSBhY2N1bXVsYXRlZERhdGFQZXJEYXRhYmluLmdldE9iamVjdChcclxuICAgICAgICAgICAgcHJlY2luY3REYXRhYmluKTtcclxuXHJcbiAgICAgICAgdmFyIG9sZFF1YWxpdHlMYXllcnNSZWFjaGVkID0gYWNjdW11bGF0ZWREYXRhLm51bVF1YWxpdHlMYXllcnNSZWFjaGVkO1xyXG4gICAgICAgIHZhciBxdWFsaXR5SW5UaWxlID1cclxuICAgICAgICAgICAgYWNjdW11bGF0ZWREYXRhLnF1YWxpdHlJblRpbGU7XHJcblxyXG4gICAgICAgIGlmIChvbGRRdWFsaXR5TGF5ZXJzUmVhY2hlZCA9PT0gcXVhbGl0eUluVGlsZSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC0tcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltvbGRRdWFsaXR5TGF5ZXJzUmVhY2hlZF07XHJcbiAgICAgICAgaW5jcmVtZW50UHJlY2luY3RRdWFsaXR5TGF5ZXJzKHByZWNpbmN0RGF0YWJpbiwgYWNjdW11bGF0ZWREYXRhKTtcclxuICAgICAgICBcclxuICAgICAgICB0cnlBZHZhbmNlUXVhbGl0eUxheWVyc1JlYWNoZWQoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW5jcmVtZW50UHJlY2luY3RRdWFsaXR5TGF5ZXJzKFxyXG4gICAgICAgIHByZWNpbmN0RGF0YWJpbiwgYWNjdW11bGF0ZWREYXRhLCBwcmVjaW5jdEl0ZXJhdG9yT3B0aW9uYWwpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcXVhbGl0eUxheWVycyA9IHF1YWxpdHlMYXllcnNDYWNoZS5nZXRRdWFsaXR5TGF5ZXJPZmZzZXQoXHJcbiAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbixcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMucXVhbGl0eSxcclxuICAgICAgICAgICAgcHJlY2luY3RJdGVyYXRvck9wdGlvbmFsKTtcclxuXHJcbiAgICAgICAgdmFyIG51bVF1YWxpdHlMYXllcnNSZWFjaGVkID0gcXVhbGl0eUxheWVycy5udW1RdWFsaXR5TGF5ZXJzO1xyXG4gICAgICAgIGFjY3VtdWxhdGVkRGF0YS5udW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCA9IG51bVF1YWxpdHlMYXllcnNSZWFjaGVkO1xyXG5cclxuICAgICAgICB2YXIgcXVhbGl0eUluVGlsZSA9XHJcbiAgICAgICAgICAgIGFjY3VtdWxhdGVkRGF0YS5xdWFsaXR5SW5UaWxlO1xyXG5cclxuICAgICAgICBpZiAobnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPT09IHF1YWxpdHlJblRpbGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJldkNvdW50ID1cclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltudW1RdWFsaXR5TGF5ZXJzUmVhY2hlZF0gfHwgMDtcclxuICAgICAgICBcclxuICAgICAgICBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyW251bVF1YWxpdHlMYXllcnNSZWFjaGVkXSA9XHJcbiAgICAgICAgICAgIHByZXZDb3VudCArIDE7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUFkdmFuY2VRdWFsaXR5TGF5ZXJzUmVhY2hlZCgpIHtcclxuICAgICAgICBpZiAocHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllclttaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZF0gPiAwIHx8XHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkID09PSAnbWF4JyB8fFxyXG4gICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZCA+PSBudW1RdWFsaXR5TGF5ZXJzVG9XYWl0Rm9yIHx8XHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJzTm90TG9hZGVkID4gMCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaGFzUHJlY2luY3RzSW5RdWFsaXR5TGF5ZXI7XHJcbiAgICAgICAgdmFyIG1heFF1YWxpdHlMYXllcnMgPSBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyLmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgICsrbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPj0gbWF4UXVhbGl0eUxheWVycykge1xyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQgPSAnbWF4JztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBoYXNQcmVjaW5jdHNJblF1YWxpdHlMYXllciA9XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyW21pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkXSA+IDA7XHJcbiAgICAgICAgfSB3aGlsZSAoIWhhc1ByZWNpbmN0c0luUXVhbGl0eUxheWVyKTtcclxuICAgICAgICBcclxuICAgICAgICBxdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2sobWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBlbnN1cmVRdWFsaXR5TGF5ZXJzU3RhdGlzdGljc0ZvckRlYnVnKCkge1xyXG4gICAgICAgIHZhciBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyRXhwZWN0ZWQgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHZhciBhY2N1bXVsYXRlZERhdGEgPSBhY2N1bXVsYXRlZERhdGFQZXJEYXRhYmluLmdldE9iamVjdChcclxuICAgICAgICAgICAgICAgIHJlZ2lzdGVyZWRQcmVjaW5jdERhdGFiaW5zW2ldKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBxdWFsaXR5SW5UaWxlID1cclxuICAgICAgICAgICAgICAgIGFjY3VtdWxhdGVkRGF0YS5xdWFsaXR5SW5UaWxlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChxdWFsaXR5SW5UaWxlID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdObyBpbmZvcm1hdGlvbiBvZiBxdWFsaXR5SW5UaWxlIGluICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXInKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHF1YWxpdHlMYXllcnMgPSBxdWFsaXR5TGF5ZXJzQ2FjaGUuZ2V0UXVhbGl0eUxheWVyT2Zmc2V0KFxyXG4gICAgICAgICAgICAgICAgcmVnaXN0ZXJlZFByZWNpbmN0RGF0YWJpbnNbaV0sXHJcbiAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5xdWFsaXR5KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChxdWFsaXR5TGF5ZXJzLm51bVF1YWxpdHlMYXllcnMgPT09IHF1YWxpdHlJblRpbGUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb2xkVmFsdWUgPSBwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyRXhwZWN0ZWRbXHJcbiAgICAgICAgICAgICAgICBxdWFsaXR5TGF5ZXJzLm51bVF1YWxpdHlMYXllcnNdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllckV4cGVjdGVkW1xyXG4gICAgICAgICAgICAgICAgcXVhbGl0eUxheWVycy5udW1RdWFsaXR5TGF5ZXJzXSA9IChvbGRWYWx1ZSB8fCAwKSArIDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZW5ndGggPSBNYXRoLm1heChcclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllckV4cGVjdGVkLmxlbmd0aCxcclxuICAgICAgICAgICAgcHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllci5sZW5ndGgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWRFeHBlY3RlZCA9ICdtYXgnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgdmFyIGlzRXhwZWN0ZWRaZXJvID0gKHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJFeHBlY3RlZFtqXSB8fCAwKSA9PT0gMDtcclxuICAgICAgICAgICAgdmFyIGlzQWN0dWFsWmVybyA9IChwcmVjaW5jdENvdW50QnlSZWFjaGVkUXVhbGl0eUxheWVyW2pdIHx8IDApID09PSAwO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzRXhwZWN0ZWRaZXJvICE9PSBpc0FjdHVhbFplcm8pIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdXcm9uZyBhY2N1bXVsYXRlZCBzdGF0aXN0aWNzIGluIEpwaXBSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaXNFeHBlY3RlZFplcm8pIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocHJlY2luY3RDb3VudEJ5UmVhY2hlZFF1YWxpdHlMYXllcltqXSAhPT1cclxuICAgICAgICAgICAgICAgIHByZWNpbmN0Q291bnRCeVJlYWNoZWRRdWFsaXR5TGF5ZXJFeHBlY3RlZFtqXSkge1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignV3JvbmcgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2FjY3VtdWxhdGVkIHN0YXRpc3RpY3MgaW4gSnBpcFJlcXVlc3REYXRhYmluc0xpc3RlbmVyJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZEV4cGVjdGVkID09PSAnbWF4Jykge1xyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVyc1JlYWNoZWRFeHBlY3RlZCA9IGo7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkICE9PSBtaW5OdW1RdWFsaXR5TGF5ZXJzUmVhY2hlZEV4cGVjdGVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ1dyb25nIG1pbk51bVF1YWxpdHlMYXllcnNSZWFjaGVkIGluIEpwaXBSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBDb2Rlc3RyZWFtU3RydWN0dXJlKFxyXG4gICAganBpcFN0cnVjdHVyZVBhcnNlcixcclxuICAgIGpwaXBGYWN0b3J5LFxyXG4gICAgcHJvZ3Jlc3Npb25PcmRlcikge1xyXG5cclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHZhciBwYXJhbXM7XHJcbiAgICB2YXIgc2l6ZXNDYWxjdWxhdG9yO1xyXG4gICAgXHJcbiAgICB2YXIgZGVmYXVsdFRpbGVTdHJ1Y3R1cmVCeUVkZ2VUeXBlO1xyXG5cclxuICAgIHZhciBjYWNoZWRUaWxlU3RydWN0dXJlcyA9IFtdO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFNpemVzUGFyYW1zID0gZnVuY3Rpb24gZ2V0U2l6ZXNQYXJhbXMoKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICByZXR1cm4gcGFyYW1zO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1UaWxlc1ggPSBmdW5jdGlvbiBnZXROdW1UaWxlc1goKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtVGlsZXMgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgcmV0dXJuIG51bVRpbGVzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1UaWxlc1kgPSBmdW5jdGlvbiBnZXROdW1UaWxlc1koKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtVGlsZXMgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgcmV0dXJuIG51bVRpbGVzO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmdldE51bUNvbXBvbmVudHMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIHJldHVybiBwYXJhbXMubnVtQ29tcG9uZW50cztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SW1hZ2VXaWR0aCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcblxyXG4gICAgICAgIHZhciBzaXplID0gc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsV2lkdGgoKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SW1hZ2VIZWlnaHQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRMZXZlbEhlaWdodCgpO1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRMZXZlbFdpZHRoID0gZnVuY3Rpb24obGV2ZWwpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRMZXZlbFdpZHRoKGxldmVsKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TGV2ZWxIZWlnaHQgPSBmdW5jdGlvbihsZXZlbCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcblxyXG4gICAgICAgIHZhciBzaXplID0gc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsSGVpZ2h0KGxldmVsKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZVdpZHRoID0gZnVuY3Rpb24obGV2ZWwpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRUaWxlV2lkdGgobGV2ZWwpO1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlSGVpZ2h0ID0gZnVuY3Rpb24obGV2ZWwpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHNpemVzQ2FsY3VsYXRvci5nZXRUaWxlSGVpZ2h0KGxldmVsKTtcclxuICAgICAgICByZXR1cm4gc2l6ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Rmlyc3RUaWxlT2Zmc2V0WCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcblxyXG4gICAgICAgIHZhciBvZmZzZXQgPSBzaXplc0NhbGN1bGF0b3IuZ2V0Rmlyc3RUaWxlT2Zmc2V0WCgpO1xyXG4gICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEZpcnN0VGlsZU9mZnNldFkgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG5cclxuICAgICAgICB2YXIgb2Zmc2V0ID0gc2l6ZXNDYWxjdWxhdG9yLmdldEZpcnN0VGlsZU9mZnNldFkoKTtcclxuICAgICAgICByZXR1cm4gb2Zmc2V0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlTGVmdCA9IGZ1bmN0aW9uIGdldFRpbGVMZWZ0KFxyXG4gICAgICAgIHRpbGVJbmRleCwgbGV2ZWwpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlWCA9IHRpbGVJbmRleCAlIHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1goKTtcclxuICAgICAgICBpZiAodGlsZVggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlTGVmdCA9XHJcbiAgICAgICAgICAgICh0aWxlWCAtIDEpICogc2l6ZXNDYWxjdWxhdG9yLmdldFRpbGVXaWR0aChsZXZlbCkgK1xyXG4gICAgICAgICAgICBzaXplc0NhbGN1bGF0b3IuZ2V0Rmlyc3RUaWxlV2lkdGgobGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aWxlTGVmdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0VGlsZVRvcCA9IGZ1bmN0aW9uIGdldFRpbGVUb3AodGlsZUluZGV4LCBsZXZlbCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVZID0gTWF0aC5mbG9vcih0aWxlSW5kZXggLyBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCkpO1xyXG4gICAgICAgIGlmICh0aWxlWSA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVUb3AgPVxyXG4gICAgICAgICAgICAodGlsZVkgLSAxKSAqIHNpemVzQ2FsY3VsYXRvci5nZXRUaWxlSGVpZ2h0KGxldmVsKSArXHJcbiAgICAgICAgICAgIHNpemVzQ2FsY3VsYXRvci5nZXRGaXJzdFRpbGVIZWlnaHQobGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aWxlVG9wO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXREZWZhdWx0VGlsZVN0cnVjdHVyZSA9IGZ1bmN0aW9uIGdldERlZmF1bHRUaWxlU3RydWN0dXJlKCkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGdldERlZmF1bHRUaWxlU3RydWN0dXJlSW50ZXJuYWwoe1xyXG4gICAgICAgICAgICBob3Jpem9udGFsRWRnZVR5cGU6IHNpemVzQ2FsY3VsYXRvci5FREdFX1RZUEVfTk9fRURHRSxcclxuICAgICAgICAgICAgdmVydGljYWxFZGdlVHlwZTogc2l6ZXNDYWxjdWxhdG9yLkVER0VfVFlQRV9OT19FREdFXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlU3RydWN0dXJlID0gZ2V0VGlsZVN0cnVjdHVyZTtcclxuXHJcbiAgICB0aGlzLnRpbGVQb3NpdGlvblRvSW5DbGFzc0luZGV4ID0gZnVuY3Rpb24odGlsZVBvc2l0aW9uKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICB2YXIgdGlsZXNYID0gc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWCgpO1xyXG4gICAgICAgIHZhciB0aWxlc1kgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoJ3RpbGVQb3NpdGlvbi50aWxlWCcsIHRpbGVQb3NpdGlvbi50aWxlWCwgdGlsZXNYKTtcclxuICAgICAgICB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZSgndGlsZVBvc2l0aW9uLnRpbGVZJywgdGlsZVBvc2l0aW9uLnRpbGVZLCB0aWxlc1kpO1xyXG5cclxuICAgICAgICB2YXIgaW5DbGFzc0luZGV4ID0gdGlsZVBvc2l0aW9uLnRpbGVYICsgdGlsZVBvc2l0aW9uLnRpbGVZICogdGlsZXNYO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBpbkNsYXNzSW5kZXg7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMudGlsZUluQ2xhc3NJbmRleFRvUG9zaXRpb24gPSBmdW5jdGlvbihpbkNsYXNzSW5kZXgpIHtcclxuICAgICAgICB2YWxpZGF0ZVBhcmFtcygpO1xyXG4gICAgICAgIHZhciB0aWxlc1ggPSBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgdmFyIHRpbGVzWSA9IHNpemVzQ2FsY3VsYXRvci5nZXROdW1UaWxlc1koKTtcclxuICAgICAgICB2YXIgbnVtVGlsZXMgPSB0aWxlc1ggKiB0aWxlc1k7XHJcblxyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKCdpbkNsYXNzSW5kZXgnLCBpbkNsYXNzSW5kZXgsIHRpbGVzWCAqIHRpbGVzWSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVYID0gaW5DbGFzc0luZGV4ICUgdGlsZXNYO1xyXG4gICAgICAgIHZhciB0aWxlWSA9IChpbkNsYXNzSW5kZXggLSB0aWxlWCkgLyB0aWxlc1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgdGlsZVg6IHRpbGVYLFxyXG4gICAgICAgICAgICB0aWxlWTogdGlsZVlcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRUaWxlc0l0ZXJhdG9yID0gZnVuY3Rpb24gZ2V0VGlsZXNJdGVyYXRvcihjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgdmFyIGJvdW5kcyA9IHNpemVzQ2FsY3VsYXRvci5nZXRUaWxlc0Zyb21QaXhlbHMoY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzZXRhYmxlSXRlcmF0b3IgPSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRYOiBib3VuZHMubWluVGlsZVgsXHJcbiAgICAgICAgICAgIGN1cnJlbnRZOiBib3VuZHMubWluVGlsZVlcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IHtcclxuICAgICAgICAgICAgZ2V0IHRpbGVJbmRleCgpIHtcclxuICAgICAgICAgICAgICAgIHZhciBmaXJzdEluUm93ID1cclxuICAgICAgICAgICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IuY3VycmVudFkgKiBzaXplc0NhbGN1bGF0b3IuZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgaW5kZXggPSBmaXJzdEluUm93ICsgc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRYO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5kZXg7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0cnlBZHZhbmNlOiBmdW5jdGlvbiB0cnlBZHZhbmNlKCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHRyeUFkdmFuY2VUaWxlSXRlcmF0b3Ioc2V0YWJsZUl0ZXJhdG9yLCBib3VuZHMpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGl0ZXJhdG9yO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRTaXplT2ZQYXJ0ID0gZnVuY3Rpb24gZ2V0U2l6ZU9mUGFydChjb2Rlc3RyZWFtUGFydFBhcmFtcykge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNpemUgPSBzaXplc0NhbGN1bGF0b3IuZ2V0U2l6ZU9mUGFydChjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcbiAgICAgICAgcmV0dXJuIHNpemU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0cnlBZHZhbmNlVGlsZUl0ZXJhdG9yKHNldGFibGVJdGVyYXRvciwgYm91bmRzKSB7XHJcbiAgICAgICAgaWYgKHNldGFibGVJdGVyYXRvci5jdXJyZW50WSA+PSBib3VuZHMubWF4VGlsZVlFeGNsdXNpdmUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ2Fubm90IGFkdmFuY2UgdGlsZSBpdGVyYXRvciBhZnRlciBlbmQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgKytzZXRhYmxlSXRlcmF0b3IuY3VycmVudFg7XHJcbiAgICAgICAgaWYgKHNldGFibGVJdGVyYXRvci5jdXJyZW50WCA8IGJvdW5kcy5tYXhUaWxlWEV4Y2x1c2l2ZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRYID0gYm91bmRzLm1pblRpbGVYO1xyXG4gICAgICAgICsrc2V0YWJsZUl0ZXJhdG9yLmN1cnJlbnRZO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc01vcmVUaWxlc0F2YWlsYWJsZSA9XHJcbiAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5jdXJyZW50WSA8IGJvdW5kcy5tYXhUaWxlWUV4Y2x1c2l2ZTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXNNb3JlVGlsZXNBdmFpbGFibGU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFRpbGVTdHJ1Y3R1cmUodGlsZUlkKSB7XHJcbiAgICAgICAgdmFsaWRhdGVQYXJhbXMoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbWF4VGlsZUlkID1cclxuICAgICAgICAgICAgc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWCgpICogc2l6ZXNDYWxjdWxhdG9yLmdldE51bVRpbGVzWSgpLSAxO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlSWQgPCAwIHx8IHRpbGVJZCA+IG1heFRpbGVJZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAndGlsZUlkJyxcclxuICAgICAgICAgICAgICAgIHRpbGVJZCxcclxuICAgICAgICAgICAgICAgICdFeHBlY3RlZCB2YWx1ZSBiZXR3ZWVuIDAgYW5kICcgKyBtYXhUaWxlSWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNFZGdlID0gc2l6ZXNDYWxjdWxhdG9yLmlzRWRnZVRpbGVJZCh0aWxlSWQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYWNoZWRUaWxlU3RydWN0dXJlc1t0aWxlSWRdID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdmFyIHRpbGVQYXJhbXMgPSBqcGlwU3RydWN0dXJlUGFyc2VyLnBhcnNlT3ZlcnJpZGVuVGlsZVBhcmFtcyh0aWxlSWQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCEhdGlsZVBhcmFtcykge1xyXG4gICAgICAgICAgICAgICAgY2FjaGVkVGlsZVN0cnVjdHVyZXNbdGlsZUlkXSA9IGNyZWF0ZVRpbGVTdHJ1Y3R1cmUodGlsZVBhcmFtcywgaXNFZGdlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNhY2hlZFRpbGVTdHJ1Y3R1cmVzW3RpbGVJZF0gPSBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYWNoZWRUaWxlU3RydWN0dXJlc1t0aWxlSWRdKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRUaWxlU3RydWN0dXJlc1t0aWxlSWRdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gZ2V0RGVmYXVsdFRpbGVTdHJ1Y3R1cmVJbnRlcm5hbChpc0VkZ2UpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UocGFyYW1OYW1lLCBwYXJhbVZhbHVlLCBzdXByaW11bVBhcmFtVmFsdWUpIHtcclxuICAgICAgICBpZiAocGFyYW1WYWx1ZSA8IDAgfHwgcGFyYW1WYWx1ZSA+PSBzdXByaW11bVBhcmFtVmFsdWUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgcGFyYW1OYW1lLFxyXG4gICAgICAgICAgICAgICAgcGFyYW1WYWx1ZSxcclxuICAgICAgICAgICAgICAgIHBhcmFtTmFtZSArICcgaXMgZXhwZWN0ZWQgdG8gYmUgYmV0d2VlbiAwIGFuZCAnICsgc3VwcmltdW1QYXJhbVZhbHVlIC0gMSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXREZWZhdWx0VGlsZVN0cnVjdHVyZUludGVybmFsKGVkZ2VUeXBlKSB7XHJcbiAgICAgICAgaWYgKCFkZWZhdWx0VGlsZVN0cnVjdHVyZUJ5RWRnZVR5cGUpIHtcclxuICAgICAgICAgICAgdmFyIGRlZmF1bHRUaWxlUGFyYW1zID0ganBpcFN0cnVjdHVyZVBhcnNlci5wYXJzZURlZmF1bHRUaWxlUGFyYW1zKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkZWZhdWx0VGlsZVN0cnVjdHVyZUJ5RWRnZVR5cGUgPSBuZXcgQXJyYXkoMyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBob3Jpem9udGFsRWRnZSA9IDA7IGhvcml6b250YWxFZGdlIDwgMzsgKytob3Jpem9udGFsRWRnZSkge1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdFRpbGVTdHJ1Y3R1cmVCeUVkZ2VUeXBlW2hvcml6b250YWxFZGdlXSA9IG5ldyBBcnJheSgzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgdmVydGljYWxFZGdlID0gMDsgdmVydGljYWxFZGdlIDwgMzsgKyt2ZXJ0aWNhbEVkZ2UpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgZWRnZSA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaG9yaXpvbnRhbEVkZ2VUeXBlOiBob3Jpem9udGFsRWRnZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmVydGljYWxFZGdlVHlwZTogdmVydGljYWxFZGdlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdFRpbGVTdHJ1Y3R1cmVCeUVkZ2VUeXBlW2hvcml6b250YWxFZGdlXVt2ZXJ0aWNhbEVkZ2VdID1cclxuICAgICAgICAgICAgICAgICAgICAgICAgY3JlYXRlVGlsZVN0cnVjdHVyZShkZWZhdWx0VGlsZVBhcmFtcywgZWRnZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0cnVjdHVyZUJ5VmVydGljYWxUeXBlID1cclxuICAgICAgICAgICAgZGVmYXVsdFRpbGVTdHJ1Y3R1cmVCeUVkZ2VUeXBlW2VkZ2VUeXBlLmhvcml6b250YWxFZGdlVHlwZV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVTdHJ1Y3R1cmUgPSBzdHJ1Y3R1cmVCeVZlcnRpY2FsVHlwZVtlZGdlVHlwZS52ZXJ0aWNhbEVkZ2VUeXBlXTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGlsZVN0cnVjdHVyZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlVGlsZVN0cnVjdHVyZSh0aWxlUGFyYW1zLCBlZGdlVHlwZSkge1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNpemVQYXJhbXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHRpbGVQYXJhbXMpKTtcclxuICAgICAgICBcclxuICAgICAgICBzaXplUGFyYW1zLnRpbGVTaXplID0gc2l6ZXNDYWxjdWxhdG9yLmdldFRpbGVTaXplKGVkZ2VUeXBlKTtcclxuICAgICAgICBcclxuICAgICAgICBzaXplUGFyYW1zLmRlZmF1bHRDb21wb25lbnRQYXJhbXMuc2NhbGVYID0gMTtcclxuICAgICAgICBzaXplUGFyYW1zLmRlZmF1bHRDb21wb25lbnRQYXJhbXMuc2NhbGVZID0gMTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNpemVQYXJhbXMucGFyYW1zUGVyQ29tcG9uZW50Lmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHNpemVQYXJhbXMucGFyYW1zUGVyQ29tcG9uZW50W2ldLnNjYWxlWCA9IHBhcmFtcy5jb21wb25lbnRzU2NhbGVYW2ldO1xyXG4gICAgICAgICAgICBzaXplUGFyYW1zLnBhcmFtc1BlckNvbXBvbmVudFtpXS5zY2FsZVkgPSBwYXJhbXMuY29tcG9uZW50c1NjYWxlWVtpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVTdHJ1Y3R1cmUgPSBqcGlwRmFjdG9yeS5jcmVhdGVUaWxlU3RydWN0dXJlKHNpemVQYXJhbXMsIHNlbGYsIHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aWxlU3RydWN0dXJlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB2YWxpZGF0ZVBhcmFtcyhzZWxmKSB7XHJcbiAgICAgICAgaWYgKCFwYXJhbXMpIHtcclxuICAgICAgICAgICAgcGFyYW1zID0ganBpcFN0cnVjdHVyZVBhcnNlci5wYXJzZUNvZGVzdHJlYW1TdHJ1Y3R1cmUoKTtcclxuICAgICAgICAgICAgc2l6ZXNDYWxjdWxhdG9yID0ganBpcEZhY3RvcnkuY3JlYXRlTGV2ZWxDYWxjdWxhdG9yKHBhcmFtcyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcztcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBDb21wb25lbnRTdHJ1Y3R1cmUoXHJcbiAgICBwYXJhbXMsIHRpbGVTdHJ1Y3R1cmUpIHtcclxuICAgIFxyXG4gICAgdmFyIHRpbGVXaWR0aExldmVsMDtcclxuICAgIHZhciB0aWxlSGVpZ2h0TGV2ZWwwO1xyXG4gICAgXHJcbiAgICBpbml0aWFsaXplKCk7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q29tcG9uZW50U2NhbGVYID0gZnVuY3Rpb24gZ2V0Q29tcG9uZW50U2NhbGVYKCkge1xyXG4gICAgICAgIHJldHVybiBwYXJhbXMuc2NhbGVYO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDb21wb25lbnRTY2FsZVkgPSBmdW5jdGlvbiBnZXRDb21wb25lbnRTY2FsZVkoKSB7XHJcbiAgICAgICAgcmV0dXJuIHBhcmFtcy5zY2FsZVk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE51bVJlc29sdXRpb25MZXZlbHMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gcGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFByZWNpbmN0V2lkdGggPSBmdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpIHtcclxuICAgICAgICB2YXIgd2lkdGggPSBwYXJhbXMucHJlY2luY3RXaWR0aFBlckxldmVsW3Jlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHdpZHRoO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQcmVjaW5jdEhlaWdodCA9IGZ1bmN0aW9uKHJlc29sdXRpb25MZXZlbCkge1xyXG4gICAgICAgIHZhciBoZWlnaHQgPSBwYXJhbXMucHJlY2luY3RIZWlnaHRQZXJMZXZlbFtyZXNvbHV0aW9uTGV2ZWxdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBoZWlnaHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE1heENvZGVibG9ja1dpZHRoID0gZnVuY3Rpb24gZ2V0TWF4Q29kZWJsb2NrV2lkdGgoKSB7XHJcbiAgICAgICAgdmFyIHdpZHRoID0gcGFyYW1zLm1heENvZGVibG9ja1dpZHRoO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB3aWR0aDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TWF4Q29kZWJsb2NrSGVpZ2h0ID0gZnVuY3Rpb24gZ2V0TWF4Q29kZWJsb2NrSGVpZ2h0KCkge1xyXG4gICAgICAgIHZhciBoZWlnaHQgPSBwYXJhbXMubWF4Q29kZWJsb2NrSGVpZ2h0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBoZWlnaHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE51bUNvZGVibG9ja3NYSW5QcmVjaW5jdCA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0TnVtQ29kZWJsb2Nrc1gocHJlY2luY3QpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtQ29kZWJsb2Nrc1ggPSBjYWxjdWxhdGVOdW1Db2RlYmxvY2tzKFxyXG4gICAgICAgICAgICBwcmVjaW5jdCxcclxuICAgICAgICAgICAgcHJlY2luY3QucHJlY2luY3RYLFxyXG4gICAgICAgICAgICBwYXJhbXMubWF4Q29kZWJsb2NrV2lkdGgsXHJcbiAgICAgICAgICAgIHBhcmFtcy5wcmVjaW5jdFdpZHRoUGVyTGV2ZWwsXHJcbiAgICAgICAgICAgIHRpbGVXaWR0aExldmVsMCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG51bUNvZGVibG9ja3NYO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROdW1Db2RlYmxvY2tzWUluUHJlY2luY3QgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGdldE51bUNvZGVibG9ja3NZKHByZWNpbmN0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvZGVibG9ja3NZID0gY2FsY3VsYXRlTnVtQ29kZWJsb2NrcyhcclxuICAgICAgICAgICAgcHJlY2luY3QsXHJcbiAgICAgICAgICAgIHByZWNpbmN0LnByZWNpbmN0WSxcclxuICAgICAgICAgICAgcGFyYW1zLm1heENvZGVibG9ja0hlaWdodCxcclxuICAgICAgICAgICAgcGFyYW1zLnByZWNpbmN0SGVpZ2h0UGVyTGV2ZWwsXHJcbiAgICAgICAgICAgIHRpbGVIZWlnaHRMZXZlbDApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudW1Db2RlYmxvY2tzWTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5nZXROdW1QcmVjaW5jdHNYID0gZnVuY3Rpb24ocmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjYWxjdWxhdGVOdW1QcmVjaW5jdHMoXHJcbiAgICAgICAgICAgIHRpbGVXaWR0aExldmVsMCwgcGFyYW1zLnByZWNpbmN0V2lkdGhQZXJMZXZlbCwgcmVzb2x1dGlvbkxldmVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHByZWNpbmN0c1g7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE51bVByZWNpbmN0c1kgPSBmdW5jdGlvbihyZXNvbHV0aW9uTGV2ZWwpIHtcclxuICAgICAgICB2YXIgcHJlY2luY3RzWSA9IGNhbGN1bGF0ZU51bVByZWNpbmN0cyhcclxuICAgICAgICAgICAgdGlsZUhlaWdodExldmVsMCwgcGFyYW1zLnByZWNpbmN0SGVpZ2h0UGVyTGV2ZWwsIHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiBwcmVjaW5jdHNZO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2FsY3VsYXRlTnVtUHJlY2luY3RzKFxyXG4gICAgICAgIHRpbGVTaXplTGV2ZWwwLCBwcmVjaW5jdFNpemVQZXJMZXZlbCwgcmVzb2x1dGlvbkxldmVsKSB7XHJcbiAgICBcclxuICAgICAgICB2YXIgcmVzb2x1dGlvbkZhY3RvciA9IGdldFJlc29sdXRpb25GYWN0b3IocmVzb2x1dGlvbkxldmVsKTtcclxuICAgICAgICB2YXIgdGlsZVNpemVJbkxldmVsID0gdGlsZVNpemVMZXZlbDAgLyByZXNvbHV0aW9uRmFjdG9yO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFNpemVJbkxldmVsID0gcHJlY2luY3RTaXplUGVyTGV2ZWxbcmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtUHJlY2luY3RzID0gTWF0aC5jZWlsKHRpbGVTaXplSW5MZXZlbCAvIHByZWNpbmN0U2l6ZUluTGV2ZWwpO1xyXG4gICAgICAgIHJldHVybiBudW1QcmVjaW5jdHM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNhbGN1bGF0ZU51bUNvZGVibG9ja3MoXHJcbiAgICAgICAgcHJlY2luY3QsXHJcbiAgICAgICAgcHJlY2luY3RJbmRleCxcclxuICAgICAgICBtYXhDb2RlYmxvY2tTaXplLFxyXG4gICAgICAgIHByZWNpbmN0U2l6ZVBlckxldmVsLFxyXG4gICAgICAgIHRpbGVTaXplTGV2ZWwwKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc29sdXRpb25GYWN0b3IgPSBnZXRSZXNvbHV0aW9uRmFjdG9yKHByZWNpbmN0LnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgdmFyIHRpbGVTaXplSW5MZXZlbCA9IE1hdGguY2VpbCh0aWxlU2l6ZUxldmVsMCAvIHJlc29sdXRpb25GYWN0b3IpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdEJlZ2luUGl4ZWwgPVxyXG4gICAgICAgICAgICBwcmVjaW5jdEluZGV4ICogcHJlY2luY3RTaXplUGVyTGV2ZWxbcHJlY2luY3QucmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RTaXplID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgIHByZWNpbmN0U2l6ZVBlckxldmVsW3ByZWNpbmN0LnJlc29sdXRpb25MZXZlbF0sXHJcbiAgICAgICAgICAgIHRpbGVTaXplSW5MZXZlbCAtIHByZWNpbmN0QmVnaW5QaXhlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN1YmJhbmRUeXBlRmFjdG9yID0gcHJlY2luY3QucmVzb2x1dGlvbkxldmVsID09PSAwID8gMSA6IDI7XHJcbiAgICAgICAgdmFyIHN1YmJhbmRPZlByZWNpbmN0U2l6ZSA9IE1hdGguY2VpbChwcmVjaW5jdFNpemUgLyBzdWJiYW5kVHlwZUZhY3Rvcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUNvZGVibG9ja3MgPSBzdWJiYW5kVHlwZUZhY3RvciAqIE1hdGguY2VpbChcclxuICAgICAgICAgICAgc3ViYmFuZE9mUHJlY2luY3RTaXplIC8gbWF4Q29kZWJsb2NrU2l6ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZWNpbmN0U2l6ZSAlIG1heENvZGVibG9ja1NpemUgPT09IDEgJiZcclxuICAgICAgICAgICAgcHJlY2luY3QucmVzb2x1dGlvbkxldmVsID4gMCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLS1udW1Db2RlYmxvY2tzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbnVtQ29kZWJsb2NrcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0UmVzb2x1dGlvbkZhY3RvcihyZXNvbHV0aW9uTGV2ZWwpIHtcclxuICAgICAgICB2YXIgZGlmZmVyZW5jZUZyb21CZXN0TGV2ZWwgPSBwYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscyAtIHJlc29sdXRpb25MZXZlbCAtIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZhY3RvciA9IDEgPDwgZGlmZmVyZW5jZUZyb21CZXN0TGV2ZWw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGZhY3RvcjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW5pdGlhbGl6ZSgpIHtcclxuICAgICAgICBpZiAocGFyYW1zLnNjYWxlWCAhPT0gMSB8fCBwYXJhbXMuc2NhbGVZICE9PSAxKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdOb24gMSBjb21wb25lbnQgc2NhbGUnLCAnQS41LjEnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGlsZVdpZHRoTGV2ZWwwID0gTWF0aC5mbG9vcihcclxuICAgICAgICAgICAgdGlsZVN0cnVjdHVyZS5nZXRUaWxlV2lkdGgoKSAvIHBhcmFtcy5zY2FsZVgpO1xyXG4gICAgICAgIHRpbGVIZWlnaHRMZXZlbDAgPSBNYXRoLmZsb29yKFxyXG4gICAgICAgICAgICB0aWxlU3RydWN0dXJlLmdldFRpbGVIZWlnaHQoKSAvIHBhcmFtcy5zY2FsZVkpO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gSnBpcFJlcXVlc3RQYXJhbXNNb2RpZmllcjtcclxuXHJcbmZ1bmN0aW9uIEpwaXBSZXF1ZXN0UGFyYW1zTW9kaWZpZXIoY29kZXN0cmVhbVN0cnVjdHVyZSkge1xyXG5cdHRoaXMubW9kaWZ5ID0gZnVuY3Rpb24gbW9kaWZ5KGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBvcHRpb25zKSB7XHJcblx0XHR2YXIgY29kZXN0cmVhbVBhcnRQYXJhbXNNb2RpZmllZCA9IGNhc3RDb2Rlc3RyZWFtUGFydFBhcmFtcyhjb2Rlc3RyZWFtUGFydFBhcmFtcyk7XHJcblxyXG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcblx0XHR2YXIgdXNlQ2FjaGVkRGF0YU9ubHkgPSBvcHRpb25zLnVzZUNhY2hlZERhdGFPbmx5O1xyXG5cdFx0dmFyIGRpc2FibGVQcm9ncmVzc2l2ZW5lc3MgPSBvcHRpb25zLmRpc2FibGVQcm9ncmVzc2l2ZW5lc3M7XHJcblxyXG5cdFx0dmFyIHByb2dyZXNzaXZlbmVzc01vZGlmaWVkO1xyXG5cdFx0aWYgKG9wdGlvbnMucHJvZ3Jlc3NpdmVuZXNzICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0aWYgKHVzZUNhY2hlZERhdGFPbmx5IHx8IGRpc2FibGVQcm9ncmVzc2l2ZW5lc3MpIHtcclxuXHRcdFx0XHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcblx0XHRcdFx0XHQnb3B0aW9ucy5wcm9ncmVzc2l2ZW5lc3MnLFxyXG5cdFx0XHRcdFx0b3B0aW9ucy5wcm9ncmVzc2l2ZW5lc3MsXHJcblx0XHRcdFx0XHQnb3B0aW9ucyBjb250cmFkaWN0aW9uOiBjYW5ub3QgYWNjZXB0IGJvdGggcHJvZ3Jlc3NpdmVuZXNzJyArXHJcblx0XHRcdFx0XHQnYW5kIHVzZUNhY2hlZERhdGFPbmx5L2Rpc2FibGVQcm9ncmVzc2l2ZW5lc3Mgb3B0aW9ucycpO1xyXG5cdFx0XHR9XHJcblx0XHRcdHByb2dyZXNzaXZlbmVzc01vZGlmaWVkID0gY2FzdFByb2dyZXNzaXZlbmVzc1BhcmFtcyhcclxuXHRcdFx0XHRvcHRpb25zLnByb2dyZXNzaXZlbmVzcyxcclxuXHRcdFx0XHRjb2Rlc3RyZWFtUGFydFBhcmFtc01vZGlmaWVkLnF1YWxpdHksXHJcblx0XHRcdFx0J3F1YWxpdHknKTtcclxuXHRcdH0gZWxzZSAgaWYgKHVzZUNhY2hlZERhdGFPbmx5KSB7XHJcblx0XHRcdHByb2dyZXNzaXZlbmVzc01vZGlmaWVkID0gWyB7IG1pbk51bVF1YWxpdHlMYXllcnM6IDAgfSBdO1xyXG5cdFx0fSBlbHNlIGlmIChkaXNhYmxlUHJvZ3Jlc3NpdmVuZXNzKSB7XHJcblx0XHRcdHZhciBxdWFsaXR5ID0gY29kZXN0cmVhbVBhcnRQYXJhbXNNb2RpZmllZC5xdWFsaXR5O1xyXG5cdFx0XHR2YXIgbWluTnVtUXVhbGl0eUxheWVycyA9XHJcblx0XHRcdFx0cXVhbGl0eSA9PT0gdW5kZWZpbmVkID8gJ21heCcgOiBxdWFsaXR5O1xyXG5cdFx0XHRcclxuXHRcdFx0cHJvZ3Jlc3NpdmVuZXNzTW9kaWZpZWQgPSBbIHsgbWluTnVtUXVhbGl0eUxheWVyczogbWluTnVtUXVhbGl0eUxheWVycyB9IF07XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRwcm9ncmVzc2l2ZW5lc3NNb2RpZmllZCA9IGdldEF1dG9tYXRpY1Byb2dyZXNzaXZlbmVzc1N0YWdlcyhcclxuXHRcdFx0XHRjb2Rlc3RyZWFtUGFydFBhcmFtc01vZGlmaWVkLnF1YWxpdHkpO1xyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRjb2Rlc3RyZWFtUGFydFBhcmFtczogY29kZXN0cmVhbVBhcnRQYXJhbXNNb2RpZmllZCxcclxuXHRcdFx0cHJvZ3Jlc3NpdmVuZXNzOiBwcm9ncmVzc2l2ZW5lc3NNb2RpZmllZFxyXG5cdFx0fTtcclxuXHR9O1xyXG5cclxuXHRmdW5jdGlvbiBjYXN0UHJvZ3Jlc3NpdmVuZXNzUGFyYW1zKHByb2dyZXNzaXZlbmVzcywgcXVhbGl0eSwgcHJvcGVydHlOYW1lKSB7XHJcblx0XHQvLyBFbnN1cmUgdGhhbiBtaW5OdW1RdWFsaXR5TGF5ZXJzIGlzIGdpdmVuIGZvciBhbGwgaXRlbXNcclxuXHRcdFxyXG5cdFx0dmFyIHJlc3VsdCA9IG5ldyBBcnJheShwcm9ncmVzc2l2ZW5lc3MubGVuZ3RoKTtcclxuXHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHByb2dyZXNzaXZlbmVzcy5sZW5ndGg7ICsraSkge1xyXG5cdFx0XHR2YXIgbWluTnVtUXVhbGl0eUxheWVycyA9IHByb2dyZXNzaXZlbmVzc1tpXS5taW5OdW1RdWFsaXR5TGF5ZXJzO1xyXG5cdFx0XHRcclxuXHRcdFx0aWYgKG1pbk51bVF1YWxpdHlMYXllcnMgIT09ICdtYXgnKSB7XHJcblx0XHRcdFx0aWYgKHF1YWxpdHkgIT09IHVuZGVmaW5lZCAmJlxyXG5cdFx0XHRcdFx0bWluTnVtUXVhbGl0eUxheWVycyA+IHF1YWxpdHkpIHtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG5cdFx0XHRcdFx0XHQncHJvZ3Jlc3NpdmVuZXNzWycgKyBpICsgJ10ubWluTnVtUXVhbGl0eUxheWVycycsXHJcblx0XHRcdFx0XHRcdG1pbk51bVF1YWxpdHlMYXllcnMsXHJcblx0XHRcdFx0XHRcdCdtaW5OdW1RdWFsaXR5TGF5ZXJzIGlzIGJpZ2dlciB0aGFuICcgK1xyXG5cdFx0XHRcdFx0XHRcdCdmZXRjaFBhcmFtcy5xdWFsaXR5Jyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdG1pbk51bVF1YWxpdHlMYXllcnMgPSB2YWxpZGF0ZU51bWVyaWNQYXJhbShcclxuXHRcdFx0XHRcdG1pbk51bVF1YWxpdHlMYXllcnMsXHJcblx0XHRcdFx0XHRwcm9wZXJ0eU5hbWUsXHJcblx0XHRcdFx0XHQncHJvZ3Jlc3NpdmVuZXNzWycgKyBpICsgJ10ubWluTnVtUXVhbGl0eUxheWVycycpO1xyXG5cdFx0XHR9XHJcblx0XHRcdFxyXG5cdFx0XHRyZXN1bHRbaV0gPSB7IG1pbk51bVF1YWxpdHlMYXllcnM6IG1pbk51bVF1YWxpdHlMYXllcnMgfTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0cmV0dXJuIHJlc3VsdDtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIGdldEF1dG9tYXRpY1Byb2dyZXNzaXZlbmVzc1N0YWdlcyhxdWFsaXR5KSB7XHJcblx0XHQvLyBDcmVhdGUgcHJvZ3Jlc3NpdmVuZXNzIG9mICgxLCAyLCAzLCAoI21heC1xdWFsaXR5LzIpLCAoI21heC1xdWFsaXR5KSlcclxuXHJcblx0XHR2YXIgcHJvZ3Jlc3NpdmVuZXNzID0gW107XHJcblxyXG5cdFx0Ly8gTm8gcHJvZ3Jlc3NpdmVuZXNzLCB3YWl0IGZvciBhbGwgcXVhbGl0eSBsYXllcnMgdG8gYmUgZmV0Y2hlZFxyXG5cdFx0dmFyIHRpbGVTdHJ1Y3R1cmUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldERlZmF1bHRUaWxlU3RydWN0dXJlKCk7XHJcblx0XHR2YXIgbnVtUXVhbGl0eUxheWVyc051bWVyaWMgPSB0aWxlU3RydWN0dXJlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuXHRcdHZhciBxdWFsaXR5TnVtZXJpY09yTWF4ID0gJ21heCc7XHJcblx0XHRcclxuXHRcdGlmIChxdWFsaXR5ICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0bnVtUXVhbGl0eUxheWVyc051bWVyaWMgPSBNYXRoLm1pbihcclxuXHRcdFx0XHRudW1RdWFsaXR5TGF5ZXJzTnVtZXJpYywgcXVhbGl0eSk7XHJcblx0XHRcdHF1YWxpdHlOdW1lcmljT3JNYXggPSBudW1RdWFsaXR5TGF5ZXJzTnVtZXJpYztcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0dmFyIGZpcnN0UXVhbGl0eUxheWVyc0NvdW50ID0gbnVtUXVhbGl0eUxheWVyc051bWVyaWMgPCA0ID9cclxuXHRcdFx0bnVtUXVhbGl0eUxheWVyc051bWVyaWMgLSAxOiAzO1xyXG5cdFx0XHJcblx0XHRmb3IgKHZhciBpID0gMTsgaSA8IGZpcnN0UXVhbGl0eUxheWVyc0NvdW50OyArK2kpIHtcclxuXHRcdFx0cHJvZ3Jlc3NpdmVuZXNzLnB1c2goeyBtaW5OdW1RdWFsaXR5TGF5ZXJzOiBpIH0pO1xyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHR2YXIgbWlkZGxlUXVhbGl0eSA9IE1hdGgucm91bmQobnVtUXVhbGl0eUxheWVyc051bWVyaWMgLyAyKTtcclxuXHRcdGlmIChtaWRkbGVRdWFsaXR5ID4gZmlyc3RRdWFsaXR5TGF5ZXJzQ291bnQpIHtcclxuXHRcdFx0cHJvZ3Jlc3NpdmVuZXNzLnB1c2goeyBtaW5OdW1RdWFsaXR5TGF5ZXJzOiBtaWRkbGVRdWFsaXR5IH0pO1xyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHRwcm9ncmVzc2l2ZW5lc3MucHVzaCh7XHJcblx0XHRcdG1pbk51bVF1YWxpdHlMYXllcnM6IHF1YWxpdHlOdW1lcmljT3JNYXhcclxuXHRcdFx0fSk7XHJcblx0XHRcclxuXHRcdHJldHVybiBwcm9ncmVzc2l2ZW5lc3M7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBjYXN0Q29kZXN0cmVhbVBhcnRQYXJhbXMoY29kZXN0cmVhbVBhcnRQYXJhbXMpIHtcclxuXHRcdHZhciBsZXZlbCA9IHZhbGlkYXRlTnVtZXJpY1BhcmFtKFxyXG5cdFx0XHRjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbCxcclxuXHRcdFx0J2xldmVsJyxcclxuXHRcdFx0LypkZWZhdWx0VmFsdWU9Ki91bmRlZmluZWQsXHJcblx0XHRcdC8qYWxsb3dVbmRlZmllbmQ9Ki90cnVlKTtcclxuXHJcblx0XHR2YXIgcXVhbGl0eSA9IHZhbGlkYXRlTnVtZXJpY1BhcmFtKFxyXG5cdFx0XHRjb2Rlc3RyZWFtUGFydFBhcmFtcy5xdWFsaXR5LFxyXG5cdFx0XHQncXVhbGl0eScsXHJcblx0XHRcdC8qZGVmYXVsdFZhbHVlPSovdW5kZWZpbmVkLFxyXG5cdFx0XHQvKmFsbG93VW5kZWZpZW5kPSovdHJ1ZSk7XHJcblx0XHRcclxuXHRcdHZhciBtaW5YID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWCwgJ21pblgnKTtcclxuXHRcdHZhciBtaW5ZID0gdmFsaWRhdGVOdW1lcmljUGFyYW0oY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWSwgJ21pblknKTtcclxuXHRcdFxyXG5cdFx0dmFyIG1heFggPSB2YWxpZGF0ZU51bWVyaWNQYXJhbShcclxuXHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSwgJ21heFhFeGNsdXNpdmUnKTtcclxuXHRcdFxyXG5cdFx0dmFyIG1heFkgPSB2YWxpZGF0ZU51bWVyaWNQYXJhbShcclxuXHRcdFx0Y29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSwgJ21heFlFeGNsdXNpdmUnKTtcclxuXHRcdFxyXG5cdFx0dmFyIGxldmVsV2lkdGggPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldExldmVsV2lkdGgobGV2ZWwpO1xyXG5cdFx0dmFyIGxldmVsSGVpZ2h0ID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRMZXZlbEhlaWdodChsZXZlbCk7XHJcblx0XHRcclxuXHRcdGlmIChtaW5YIDwgMCB8fCBtYXhYID4gbGV2ZWxXaWR0aCB8fFxyXG5cdFx0XHRtaW5ZIDwgMCB8fCBtYXhZID4gbGV2ZWxIZWlnaHQgfHxcclxuXHRcdFx0bWluWCA+PSBtYXhYIHx8IG1pblkgPj0gbWF4WSkge1xyXG5cdFx0XHRcclxuXHRcdFx0dGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uKFxyXG5cdFx0XHRcdCdjb2Rlc3RyZWFtUGFydFBhcmFtcycsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0dmFyIHJlc3VsdCA9IHtcclxuXHRcdFx0bWluWDogbWluWCxcclxuXHRcdFx0bWluWTogbWluWSxcclxuXHRcdFx0bWF4WEV4Y2x1c2l2ZTogbWF4WCxcclxuXHRcdFx0bWF4WUV4Y2x1c2l2ZTogbWF4WSxcclxuXHRcdFx0XHJcblx0XHRcdGxldmVsOiBsZXZlbCxcclxuXHRcdFx0cXVhbGl0eTogcXVhbGl0eVxyXG5cdFx0XHR9O1xyXG5cdFx0XHJcblx0XHRyZXR1cm4gcmVzdWx0O1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gdmFsaWRhdGVOdW1lcmljUGFyYW0oXHJcblx0XHRpbnB1dFZhbHVlLCBwcm9wZXJ0eU5hbWUsIGRlZmF1bHRWYWx1ZSwgYWxsb3dVbmRlZmluZWQpIHtcclxuXHRcdFxyXG5cdFx0aWYgKGlucHV0VmFsdWUgPT09IHVuZGVmaW5lZCAmJlxyXG5cdFx0XHQoZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgfHwgYWxsb3dVbmRlZmluZWQpKSB7XHJcblx0XHRcdFxyXG5cdFx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xyXG5cdFx0fVxyXG5cdFx0XHJcblx0XHR2YXIgcmVzdWx0ID0gK2lucHV0VmFsdWU7XHJcblx0XHRpZiAoaXNOYU4ocmVzdWx0KSB8fCByZXN1bHQgIT09IE1hdGguZmxvb3IocmVzdWx0KSkge1xyXG5cdFx0XHR0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcblx0XHRcdFx0cHJvcGVydHlOYW1lLCBpbnB1dFZhbHVlKTtcclxuXHRcdH1cclxuXHRcdFxyXG5cdFx0cmV0dXJuIHJlc3VsdDtcclxuXHR9XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBUaWxlU3RydWN0dXJlKFxyXG4gICAgc2l6ZVBhcmFtcyxcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBqcGlwRmFjdG9yeSxcclxuICAgIHByb2dyZXNzaW9uT3JkZXJcclxuICAgICkge1xyXG4gICAgXHJcbiAgICB2YXIgZGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZTtcclxuICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmVzO1xyXG4gICAgdmFyIGNvbXBvbmVudFRvSW5DbGFzc0xldmVsU3RhcnRJbmRleDtcclxuICAgIHZhciBtaW5OdW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG5cclxuICAgIHRoaXMuZ2V0UHJvZ3Jlc3Npb25PcmRlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBwcm9ncmVzc2lvbk9yZGVyO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXREZWZhdWx0Q29tcG9uZW50U3RydWN0dXJlID0gZnVuY3Rpb24gZ2V0RGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZShjb21wb25lbnQpIHtcclxuICAgICAgICByZXR1cm4gZGVmYXVsdENvbXBvbmVudFN0cnVjdHVyZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q29tcG9uZW50U3RydWN0dXJlID0gZnVuY3Rpb24gZ2V0Q29tcG9uZW50U3RydWN0dXJlKGNvbXBvbmVudCkge1xyXG4gICAgICAgIHJldHVybiBjb21wb25lbnRTdHJ1Y3R1cmVzW2NvbXBvbmVudF07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVXaWR0aCA9IGZ1bmN0aW9uIGdldFRpbGVXaWR0aENsb3N1cmUoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpemVQYXJhbXMudGlsZVNpemVbMF07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRpbGVIZWlnaHQgPSBmdW5jdGlvbiBnZXRUaWxlSGVpZ2h0Q2xvc3VyZSgpIHtcclxuICAgICAgICByZXR1cm4gc2l6ZVBhcmFtcy50aWxlU2l6ZVsxXTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0TnVtUXVhbGl0eUxheWVycyA9IGZ1bmN0aW9uIGdldE51bVF1YWxpdHlMYXllcnMoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpemVQYXJhbXMubnVtUXVhbGl0eUxheWVycztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SXNQYWNrZXRIZWFkZXJOZWFyRGF0YSA9IGZ1bmN0aW9uIGdldElzUGFja2V0SGVhZGVyTmVhckRhdGEoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpemVQYXJhbXMuaXNQYWNrZXRIZWFkZXJzTmVhckRhdGE7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQgPSBmdW5jdGlvbiBnZXRJc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkKCkge1xyXG4gICAgICAgIHJldHVybiBzaXplUGFyYW1zLmlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0SXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBzaXplUGFyYW1zLmlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucHJlY2luY3RJbkNsYXNzSW5kZXhUb1Bvc2l0aW9uID0gZnVuY3Rpb24oaW5DbGFzc0luZGV4KSB7XHJcbiAgICAgICAgLy8gQS4zLjJcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaW5DbGFzc0luZGV4IDwgMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnaW5DbGFzc0luZGV4JyxcclxuICAgICAgICAgICAgICAgIGluQ2xhc3NJbmRleCxcclxuICAgICAgICAgICAgICAgICdJbnZhbGlkIG5lZ2F0aXZlIGluLWNsYXNzIGluZGV4IG9mIHByZWNpbmN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1UaWxlcyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNYKCkgKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIHZhciBudW1Db21wb25lbnRzID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1Db21wb25lbnRzKCk7XHJcblxyXG4gICAgICAgIHZhciB0aWxlSW5kZXggPSBpbkNsYXNzSW5kZXggJSBudW1UaWxlcztcclxuICAgICAgICB2YXIgaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgPSAoaW5DbGFzc0luZGV4IC0gdGlsZUluZGV4KSAvIG51bVRpbGVzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnQgPSBpbkNsYXNzSW5kZXhXaXRob3V0VGlsZSAlIG51bUNvbXBvbmVudHM7XHJcbiAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbY29tcG9uZW50XTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVscyA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0SW5kZXggPSAoaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgLSBjb21wb25lbnQpIC8gbnVtQ29tcG9uZW50cztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzb2x1dGlvbkxldmVsO1xyXG4gICAgICAgIHZhciBsZXZlbFN0YXJ0SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAocmVzb2x1dGlvbkxldmVsID0gMTsgcmVzb2x1dGlvbkxldmVsIDwgbnVtUmVzb2x1dGlvbkxldmVsczsgKytyZXNvbHV0aW9uTGV2ZWwpIHtcclxuICAgICAgICAgICAgdmFyIG5leHRMZXZlbFN0YXJ0SW5kZXggPVxyXG4gICAgICAgICAgICAgICAgY29tcG9uZW50VG9JbkNsYXNzTGV2ZWxTdGFydEluZGV4W2NvbXBvbmVudF1bcmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChuZXh0TGV2ZWxTdGFydEluZGV4ID4gcHJlY2luY3RJbmRleCkge1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxldmVsU3RhcnRJbmRleCA9IG5leHRMZXZlbFN0YXJ0SW5kZXg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC0tcmVzb2x1dGlvbkxldmVsO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdEluZGV4SW5MZXZlbCA9IHByZWNpbmN0SW5kZXggLSBsZXZlbFN0YXJ0SW5kZXg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChyZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgIHZhciBwcmVjaW5jdHNZID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1kocmVzb2x1dGlvbkxldmVsKTtcclxuXHJcbiAgICAgICAgdmFyIHByZWNpbmN0WCA9IHByZWNpbmN0SW5kZXhJbkxldmVsICUgcHJlY2luY3RzWDtcclxuICAgICAgICB2YXIgcHJlY2luY3RZID0gKHByZWNpbmN0SW5kZXhJbkxldmVsIC0gcHJlY2luY3RYKSAvIHByZWNpbmN0c1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZWNpbmN0WSA+PSBwcmVjaW5jdHNZKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdpbkNsYXNzSW5kZXgnLFxyXG4gICAgICAgICAgICAgICAgaW5DbGFzc0luZGV4LFxyXG4gICAgICAgICAgICAgICAgJ0ludmFsaWQgaW4tY2xhc3MgaW5kZXggb2YgcHJlY2luY3QnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgdGlsZUluZGV4OiB0aWxlSW5kZXgsXHJcbiAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJlY2luY3RYOiBwcmVjaW5jdFgsXHJcbiAgICAgICAgICAgIHByZWNpbmN0WTogcHJlY2luY3RZLFxyXG4gICAgICAgICAgICByZXNvbHV0aW9uTGV2ZWw6IHJlc29sdXRpb25MZXZlbFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnByZWNpbmN0UG9zaXRpb25Ub0luQ2xhc3NJbmRleCA9IGZ1bmN0aW9uKHByZWNpbmN0UG9zaXRpb24pIHtcclxuICAgICAgICAvLyBBLjMuMlxyXG5cclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50cyA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKFxyXG4gICAgICAgICAgICAncHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnQnLCBwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudCwgbnVtQ29tcG9uZW50cyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnRdO1xyXG5cclxuICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVscyA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1SZXNvbHV0aW9uTGV2ZWxzKCk7XHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoXHJcbiAgICAgICAgICAgICdwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCcsIHByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsLCBudW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuXHJcbiAgICAgICAgdmFyIG51bVRpbGVzID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1UaWxlc1goKSAqIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNZKCk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1kgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWShwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFsaWRhdGVBcmd1bWVudEluUmFuZ2UoXHJcbiAgICAgICAgICAgICdwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCcsIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RYLCBwcmVjaW5jdHNYKTtcclxuICAgICAgICB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZShcclxuICAgICAgICAgICAgJ3ByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RZJywgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFksIHByZWNpbmN0c1kpO1xyXG4gICAgICAgIHZhbGlkYXRlQXJndW1lbnRJblJhbmdlKFxyXG4gICAgICAgICAgICAncHJlY2luY3RQb3NpdGlvbi50aWxlSW5kZXgnLCBwcmVjaW5jdFBvc2l0aW9uLnRpbGVJbmRleCwgbnVtVGlsZXMpO1xyXG5cclxuICAgICAgICB2YXIgcHJlY2luY3RJbmRleEluTGV2ZWwgPSBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCArIFxyXG4gICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WSAqIHByZWNpbmN0c1g7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxldmVsU3RhcnRJbmRleCA9IGNvbXBvbmVudFRvSW5DbGFzc0xldmVsU3RhcnRJbmRleFtwcmVjaW5jdFBvc2l0aW9uLmNvbXBvbmVudF1bcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWxdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdEluZGV4ID0gcHJlY2luY3RJbmRleEluTGV2ZWwgKyBsZXZlbFN0YXJ0SW5kZXg7XHJcblxyXG4gICAgICAgIHZhciBpbkNsYXNzSW5kZXhXaXRob3V0VGlsZSA9XHJcbiAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50ICsgcHJlY2luY3RJbmRleCAqIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpO1xyXG5cclxuICAgICAgICB2YXIgaW5DbGFzc0luZGV4ID0gcHJlY2luY3RQb3NpdGlvbi50aWxlSW5kZXggKyBcclxuICAgICAgICAgICAgaW5DbGFzc0luZGV4V2l0aG91dFRpbGUgKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWCgpICogY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1UaWxlc1koKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaW5DbGFzc0luZGV4O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQcmVjaW5jdEl0ZXJhdG9yID0gZnVuY3Rpb24gZ2V0UHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICB0aWxlSW5kZXgsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBpc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxldmVsID0gMDtcclxuICAgICAgICBpZiAoY29kZXN0cmVhbVBhcnRQYXJhbXMgIT09IHVuZGVmaW5lZCAmJlxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXZlbCA9IGNvZGVzdHJlYW1QYXJ0UGFyYW1zLmxldmVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG1pbk51bVJlc29sdXRpb25MZXZlbHMgPD0gbGV2ZWwpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDYW5ub3QgYWR2YW5jZSByZXNvbHV0aW9uOiBsZXZlbD0nICtcclxuICAgICAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbCArICcgYnV0IHNob3VsZCAnICtcclxuICAgICAgICAgICAgICAgICAgICAnYmUgc21hbGxlciB0aGFuICcgKyBtaW5OdW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCA9XHJcbiAgICAgICAgICAgIGdldFByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudChcclxuICAgICAgICAgICAgICAgIHRpbGVJbmRleCwgY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0WCA9IDA7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0WSA9IDA7XHJcbiAgICAgICAgaWYgKCFpc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0ICYmXHJcbiAgICAgICAgICAgIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGZpcnN0UHJlY2luY3RzUmFuZ2UgPVxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RzSW5Db2Rlc3RyZWFtUGFydFBlckxldmVsUGVyQ29tcG9uZW50WzBdWzBdO1xyXG4gICAgICAgICAgICBwcmVjaW5jdFggPSBmaXJzdFByZWNpbmN0c1JhbmdlLm1pblByZWNpbmN0WDtcclxuICAgICAgICAgICAgcHJlY2luY3RZID0gZmlyc3RQcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEEuNi4xIGluIHBhcnQgMTogQ29yZSBDb2RpbmcgU3lzdGVtXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNldGFibGVJdGVyYXRvciA9IHtcclxuICAgICAgICAgICAgY29tcG9uZW50OiAwLFxyXG4gICAgICAgICAgICBwcmVjaW5jdFg6IHByZWNpbmN0WCxcclxuICAgICAgICAgICAgcHJlY2luY3RZOiBwcmVjaW5jdFksXHJcbiAgICAgICAgICAgIHJlc29sdXRpb25MZXZlbDogMCxcclxuICAgICAgICAgICAgaXNJbkNvZGVzdHJlYW1QYXJ0OiB0cnVlXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IHtcclxuICAgICAgICAgICAgZ2V0IHRpbGVJbmRleCgpIHsgcmV0dXJuIHRpbGVJbmRleDsgfSxcclxuICAgICAgICAgICAgZ2V0IGNvbXBvbmVudCgpIHsgcmV0dXJuIHNldGFibGVJdGVyYXRvci5jb21wb25lbnQ7IH0sXHJcbiAgICAgICAgICAgIGdldCBwcmVjaW5jdEluZGV4SW5Db21wb25lbnRSZXNvbHV0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbc2V0YWJsZUl0ZXJhdG9yLmNvbXBvbmVudF07XHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RzWCA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNYKFxyXG4gICAgICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5yZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0SW5kZXhJbkNvbXBvbmVudFJlc29sdXRpb24gPVxyXG4gICAgICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFggKyBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RZICogcHJlY2luY3RzWDtcclxuICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RJbmRleEluQ29tcG9uZW50UmVzb2x1dGlvbjtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBnZXQgcHJlY2luY3RYKCkgeyByZXR1cm4gc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WDsgfSxcclxuICAgICAgICAgICAgZ2V0IHByZWNpbmN0WSgpIHsgcmV0dXJuIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFk7IH0sXHJcbiAgICAgICAgICAgIGdldCByZXNvbHV0aW9uTGV2ZWwoKSB7IHJldHVybiBzZXRhYmxlSXRlcmF0b3IucmVzb2x1dGlvbkxldmVsOyB9LFxyXG4gICAgICAgICAgICBnZXQgaXNJbkNvZGVzdHJlYW1QYXJ0KCkgeyByZXR1cm4gc2V0YWJsZUl0ZXJhdG9yLmlzSW5Db2Rlc3RyZWFtUGFydDsgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGl0ZXJhdG9yLnRyeUFkdmFuY2UgPSBmdW5jdGlvbiB0cnlBZHZhbmNlKCkge1xyXG4gICAgICAgICAgICB2YXIgaXNTdWNjZWVkZWQgPSB0cnlBZHZhbmNlUHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvcixcclxuICAgICAgICAgICAgICAgIGxldmVsLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RzSW5Db2Rlc3RyZWFtUGFydFBlckxldmVsUGVyQ29tcG9uZW50LFxyXG4gICAgICAgICAgICAgICAgaXNJdGVyYXRlUHJlY2luY3RzTm90SW5Db2Rlc3RyZWFtUGFydCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gaXNTdWNjZWVkZWQ7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXRlcmF0b3I7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUFyZ3VtZW50SW5SYW5nZShwYXJhbU5hbWUsIHBhcmFtVmFsdWUsIHN1cHJpbXVtUGFyYW1WYWx1ZSkge1xyXG4gICAgICAgIGlmIChwYXJhbVZhbHVlIDwgMCB8fCBwYXJhbVZhbHVlID49IHN1cHJpbXVtUGFyYW1WYWx1ZSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuQXJndW1lbnRFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICBwYXJhbU5hbWUsXHJcbiAgICAgICAgICAgICAgICBwYXJhbVZhbHVlLFxyXG4gICAgICAgICAgICAgICAgcGFyYW1OYW1lICsgJyBpcyBleHBlY3RlZCB0byBiZSBiZXR3ZWVuIDAgYW5kICcgKyBzdXByaW11bVBhcmFtVmFsdWUgLSAxKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlVGFyZ2V0UHJvZ3Jlc3Npb25PcmRlcihwcm9ncmVzc2lvbk9yZGVyKSB7XHJcbiAgICAgICAgaWYgKHByb2dyZXNzaW9uT3JkZXIubGVuZ3RoICE9PSA0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdJbGxlZ2FsIHByb2dyZXNzaW9uIG9yZGVyICcgKyBwcm9ncmVzc2lvbk9yZGVyICsgJzogdW5leHBlY3RlZCBsZW5ndGgnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByb2dyZXNzaW9uT3JkZXJbM10gIT09ICdMJykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oJ0lsbGVnYWwgdGFyZ2V0IHByb2dyZXNzaW9uIG9yZGVyIG9mICcgKyBwcm9ncmVzc2lvbk9yZGVyLCAnQS4zLjIuMScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaGFzUCA9IHByb2dyZXNzaW9uT3JkZXIuaW5kZXhPZignUCcpID49IDA7XHJcbiAgICAgICAgdmFyIGhhc0MgPSBwcm9ncmVzc2lvbk9yZGVyLmluZGV4T2YoJ0MnKSA+PSAwO1xyXG4gICAgICAgIHZhciBoYXNSID0gcHJvZ3Jlc3Npb25PcmRlci5pbmRleE9mKCdSJykgPj0gMDtcclxuICAgICAgICBpZiAoIWhhc1AgfHwgIWhhc0MgfHwgIWhhc1IpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oJ0lsbGVnYWwgcHJvZ3Jlc3Npb24gb3JkZXIgJyArIHByb2dyZXNzaW9uT3JkZXIgKyAnOiBtaXNzaW5nIGxldHRlcicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAocHJvZ3Jlc3Npb25PcmRlciAhPT0gJ1JQQ0wnKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbignUHJvZ3Jlc3Npb24gb3JkZXIgb2YgJyArIHByb2dyZXNzaW9uT3JkZXIsICdBLjYuMScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gcHJlcHJvY2Vzc1BhcmFtcygpIHtcclxuICAgICAgICBjb21wb25lbnRUb0luQ2xhc3NMZXZlbFN0YXJ0SW5kZXggPSBuZXcgQXJyYXkoY29tcG9uZW50cyk7XHJcblxyXG4gICAgICAgIHZhciBjb21wb25lbnRzID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1Db21wb25lbnRzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRlZmF1bHRDb21wb25lbnQgPSBzaXplUGFyYW1zLmRlZmF1bHRDb21wb25lbnRQYXJhbXM7XHJcbiAgICAgICAgbWluTnVtUmVzb2x1dGlvbkxldmVscyA9IGRlZmF1bHRDb21wb25lbnQubnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICB2YXIgaXNDb21wb25lbnRzSWRlbnRpY2FsU2l6ZSA9IHRydWU7XHJcbiAgICAgICAgdmFyIGlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgYyA9IDA7IGMgPCBjb21wb25lbnRzOyArK2MpIHtcclxuICAgICAgICAgICAgdmFyIHNpemUgPSBzaXplUGFyYW1zLnBhcmFtc1BlckNvbXBvbmVudFtjXTtcclxuICAgICAgICAgICAgbWluTnVtUmVzb2x1dGlvbkxldmVscyA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICAgICAgbWluTnVtUmVzb2x1dGlvbkxldmVscywgc2l6ZS5udW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb21wb25lbnRUb0luQ2xhc3NMZXZlbFN0YXJ0SW5kZXhbY10gPSBuZXcgQXJyYXkoc2l6ZS5udW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuICAgICAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbY107XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgYWNjdW11bGF0ZWRPZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICB2YXIgZmlyc3RMZXZlbFByZWNpbmN0c1ggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChjKTtcclxuICAgICAgICAgICAgdmFyIGZpcnN0TGV2ZWxQcmVjaW5jdHNZID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1koYyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciByID0gMDsgciA8IHNpemUubnVtUmVzb2x1dGlvbkxldmVsczsgKytyKSB7XHJcbiAgICAgICAgICAgICAgICBjb21wb25lbnRUb0luQ2xhc3NMZXZlbFN0YXJ0SW5kZXhbY11bcl0gPSBhY2N1bXVsYXRlZE9mZnNldDtcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdHNYSW5MZXZlbCA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNYKHIpO1xyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0c1lJbkxldmVsID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1kocik7XHJcbiAgICAgICAgICAgICAgICBhY2N1bXVsYXRlZE9mZnNldCArPSBwcmVjaW5jdHNYSW5MZXZlbCAqIHByZWNpbmN0c1lJbkxldmVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChkZWZhdWx0Q29tcG9uZW50LnByZWNpbmN0V2lkdGhQZXJMZXZlbFtyXSAhPT1cclxuICAgICAgICAgICAgICAgICAgICAgICAgc2l6ZS5wcmVjaW5jdFdpZHRoUGVyTGV2ZWxbcl0gfHxcclxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0Q29tcG9uZW50LnByZWNpbmN0SGVpZ2h0UGVyTGV2ZWxbcl0gIT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemUucHJlY2luY3RIZWlnaHRQZXJMZXZlbFtyXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGlzQ29tcG9uZW50c0lkZW50aWNhbFNpemUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGlzSG9yaXpvbnRhbFBhcnRpdGlvblN1cHBvcnRlZCA9XHJcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tJZlByZWNpbmN0UGFydGl0aW9uU3RhcnRzSW5UaWxlVG9wTGVmdChcclxuICAgICAgICAgICAgICAgICAgICAgICAgcixcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2l6ZS5udW1SZXNvbHV0aW9uTGV2ZWxzLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0UHJlY2luY3RXaWR0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRMZXZlbFdpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVXaWR0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGlzVmVydGljYWxQYXJ0aXRpb25TdXBwb3J0ZWQgPVxyXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrSWZQcmVjaW5jdFBhcnRpdGlvblN0YXJ0c0luVGlsZVRvcExlZnQoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpemUubnVtUmVzb2x1dGlvbkxldmVscyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldFByZWNpbmN0V2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxXaWR0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlV2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlzUHJlY2luY3RQYXJ0aXRpb25GaXRzVG9UaWxlUGFydGl0aW9uICY9XHJcbiAgICAgICAgICAgICAgICAgICAgaXNIb3Jpem9udGFsUGFydGl0aW9uU3VwcG9ydGVkICYmXHJcbiAgICAgICAgICAgICAgICAgICAgaXNWZXJ0aWNhbFBhcnRpdGlvblN1cHBvcnRlZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFpc0NvbXBvbmVudHNJZGVudGljYWxTaXplKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdTcGVjaWFsIENvZGluZyBTdHlsZSBmb3IgQ29tcG9uZW50IChDT0MpJywgJ0EuNi4yJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNQcmVjaW5jdFBhcnRpdGlvbkZpdHNUb1RpbGVQYXJ0aXRpb24pIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ1ByZWNpbmN0IFRvcExlZnQgd2hpY2ggaXMgbm90IG1hdGNoZWQgdG8gdGlsZSBUb3BMZWZ0JywgJ0IuNicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tJZlByZWNpbmN0UGFydGl0aW9uU3RhcnRzSW5UaWxlVG9wTGVmdChcclxuICAgICAgICByZXNvbHV0aW9uTGV2ZWwsXHJcbiAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVscyxcclxuICAgICAgICBnZXRQcmVjaW5jdFNpemVGdW5jdGlvbixcclxuICAgICAgICBnZXRMZXZlbFNpemVGdW5jdGlvbixcclxuICAgICAgICBnZXRUaWxlU2l6ZUZ1bmN0aW9uKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSnBlZzIwMDAgc3RhbmRhcmQgYWxsb3dzIHBhcnRpdGlvbiBvZiB0aWxlcyB3aGljaCBkb2VzIG5vdCBmaXRcclxuICAgICAgICAvLyBleGFjdGx5IHRoZSBwcmVjaW5jdHMgcGFydGl0aW9uIChpLmUuIHRoZSBmaXJzdCBwcmVjaW5jdHMgXCJ2aXJ0dWFsbHlcIlxyXG4gICAgICAgIC8vIHN0YXJ0cyBiZWZvcmUgdGhlIHRpbGUsIHRodXMgaXMgc21hbGxlciB0aGFuIG90aGVyKS5cclxuICAgICAgICAvLyBUaGlzIGlzIG5vdCBzdXBwb3J0ZWQgbm93IGluIHRoZSBjb2RlLCB0aGlzIGZ1bmN0aW9uIHNob3VsZCBjaGVja1xyXG4gICAgICAgIC8vIHRoYXQgdGhpcyBpcyBub3QgdGhlIHNpdHVhdGlvbi5cclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgZnVuY3Rpb24gYXNzdW1lcyB0aGF0IGZpcnN0VGlsZU9mZnNldCBpcyB6ZXJvIGFuZCBjb21wb25lbnRTY2FsZVxyXG4gICAgICAgIC8vIGlzIG9uZSAoVW5zdXBwb3J0ZWRFeGNlcHRpb25zIGFyZSB0aHJvd24gaW4gQ29tcG9uZW50U3RydWN0dXJlIGFuZFxyXG4gICAgICAgIC8vIENvZGVzdHJlYW1TdHJ1Y3R1cmUgY2xhc3NlcykuXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0U2l6ZSA9IGdldFByZWNpbmN0U2l6ZUZ1bmN0aW9uKHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgdmFyIGxldmVsU2l6ZSA9IGdldExldmVsU2l6ZUZ1bmN0aW9uKHJlc29sdXRpb25MZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZWNpbmN0U2l6ZSA+IGxldmVsU2l6ZSkge1xyXG4gICAgICAgICAgICAvLyBQcmVjaW5jdCBpcyBsYXJnZXIgdGhhbiBpbWFnZSB0aHVzIGFueXdheSB0aWxlIGhhcyBhIHNpbmdsZVxyXG4gICAgICAgICAgICAvLyBwcmVjaW5jdFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlU2l6ZSA9IGdldFRpbGVTaXplRnVuY3Rpb24ocmVzb2x1dGlvbkxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNQcmVjaW5jdFBhcnRpdGlvbkZpdHNUb1RpbGVQYXJ0aXRpb24gPVxyXG4gICAgICAgICAgICBwcmVjaW5jdFNpemUgJSB0aWxlU2l6ZSA9PT0gMCB8fFxyXG4gICAgICAgICAgICB0aWxlU2l6ZSAlIHByZWNpbmN0U2l6ZSA9PT0gMDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXNQcmVjaW5jdFBhcnRpdGlvbkZpdHNUb1RpbGVQYXJ0aXRpb247XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldFByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudChcclxuICAgICAgICB0aWxlSW5kZXgsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGVzdHJlYW1QYXJ0UGFyYW1zID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRzID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1Db21wb25lbnRzKCk7XHJcbiAgICAgICAgdmFyIHBlckNvbXBvbmVudFJlc3VsdCA9IG5ldyBBcnJheShjb21wb25lbnRzKTtcclxuICAgICAgICB2YXIgbWluTGV2ZWwgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbCB8fCAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlTGVmdEluTGV2ZWwgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVMZWZ0KFxyXG4gICAgICAgICAgICB0aWxlSW5kZXgsIG1pbkxldmVsKTtcclxuICAgICAgICB2YXIgdGlsZVRvcEluTGV2ZWwgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVUb3AoXHJcbiAgICAgICAgICAgIHRpbGVJbmRleCwgbWluTGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtaW5YSW5UaWxlID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWCAtIHRpbGVMZWZ0SW5MZXZlbDtcclxuICAgICAgICB2YXIgbWluWUluVGlsZSA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblkgLSB0aWxlVG9wSW5MZXZlbDtcclxuICAgICAgICB2YXIgbWF4WEluVGlsZSA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUgLSB0aWxlTGVmdEluTGV2ZWw7XHJcbiAgICAgICAgdmFyIG1heFlJblRpbGUgPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlIC0gdGlsZVRvcEluTGV2ZWw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGVzdHJlYW1QYXJ0TGV2ZWxXaWR0aCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxXaWR0aChcclxuICAgICAgICAgICAgbWluTGV2ZWwpO1xyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtUGFydExldmVsSGVpZ2h0ID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRMZXZlbEhlaWdodChcclxuICAgICAgICAgICAgbWluTGV2ZWwpO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBjb21wb25lbnQgPSAwOyBjb21wb25lbnQgPCBjb21wb25lbnRzOyArK2NvbXBvbmVudCkge1xyXG4gICAgICAgICAgICB2YXIgY29tcG9uZW50U3RydWN0dXJlID0gY29tcG9uZW50U3RydWN0dXJlc1tjb21wb25lbnRdO1xyXG4gICAgICAgICAgICB2YXIgbGV2ZWxzID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVJlc29sdXRpb25MZXZlbHMoKTtcclxuICAgICAgICAgICAgdmFyIGxldmVsc0luQ29kZXN0cmVhbVBhcnQgPSBsZXZlbHMgLSBtaW5MZXZlbDtcclxuICAgICAgICAgICAgdmFyIG51bVJlc29sdXRpb25MZXZlbHMgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUmVzb2x1dGlvbkxldmVscygpO1xyXG4gICAgICAgICAgICB2YXIgcGVyTGV2ZWxSZXN1bHQgPSBuZXcgQXJyYXkobGV2ZWxzKTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgbGV2ZWwgPSAwOyBsZXZlbCA8IGxldmVsc0luQ29kZXN0cmVhbVBhcnQ7ICsrbGV2ZWwpIHtcclxuICAgICAgICAgICAgICAgIHZhciBjb21wb25lbnRTY2FsZVggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0Q29tcG9uZW50U2NhbGVYKCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgY29tcG9uZW50U2NhbGVZID0gY29tcG9uZW50U3RydWN0dXJlLmdldENvbXBvbmVudFNjYWxlWSgpO1xyXG4gICAgICAgICAgICAgICAgdmFyIGxldmVsSW5Db2Rlc3RyZWFtUGFydCA9IGxldmVsc0luQ29kZXN0cmVhbVBhcnQgLSBsZXZlbCAtIDE7XHJcbiAgICAgICAgICAgICAgICB2YXIgbGV2ZWxTY2FsZVggPSBjb21wb25lbnRTY2FsZVggPDwgbGV2ZWxJbkNvZGVzdHJlYW1QYXJ0O1xyXG4gICAgICAgICAgICAgICAgdmFyIGxldmVsU2NhbGVZID0gY29tcG9uZW50U2NhbGVZIDw8IGxldmVsSW5Db2Rlc3RyZWFtUGFydDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHJlZHVuZGFudCA9IDQ7IC8vIFJlZHVuZGFudCBwaXhlbHMgZm9yIHdhdmVsZXQgOS03IGNvbnZvbHV0aW9uXHJcbiAgICAgICAgICAgICAgICB2YXIgbWluWEluTGV2ZWwgPSBNYXRoLmZsb29yKG1pblhJblRpbGUgLyBsZXZlbFNjYWxlWCkgLSByZWR1bmRhbnQ7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWluWUluTGV2ZWwgPSBNYXRoLmZsb29yKG1pbllJblRpbGUgLyBsZXZlbFNjYWxlWSkgLSByZWR1bmRhbnQ7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWF4WEluTGV2ZWwgPSBNYXRoLmNlaWwobWF4WEluVGlsZSAvIGxldmVsU2NhbGVYKSArIHJlZHVuZGFudDtcclxuICAgICAgICAgICAgICAgIHZhciBtYXhZSW5MZXZlbCA9IE1hdGguY2VpbChtYXhZSW5UaWxlIC8gbGV2ZWxTY2FsZVkpICsgcmVkdW5kYW50O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RXaWR0aCA9XHJcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldFByZWNpbmN0V2lkdGgobGV2ZWwpICogY29tcG9uZW50U2NhbGVYO1xyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0SGVpZ2h0ID1cclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0UHJlY2luY3RIZWlnaHQobGV2ZWwpICogY29tcG9uZW50U2NhbGVZO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgbWluUHJlY2luY3RYID0gTWF0aC5mbG9vcihtaW5YSW5MZXZlbCAvIHByZWNpbmN0V2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgdmFyIG1pblByZWNpbmN0WSA9IE1hdGguZmxvb3IobWluWUluTGV2ZWwgLyBwcmVjaW5jdEhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWF4UHJlY2luY3RYID0gTWF0aC5jZWlsKG1heFhJbkxldmVsIC8gcHJlY2luY3RXaWR0aCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgbWF4UHJlY2luY3RZID0gTWF0aC5jZWlsKG1heFlJbkxldmVsIC8gcHJlY2luY3RIZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcHJlY2luY3RzWCA9IGNvbXBvbmVudFN0cnVjdHVyZS5nZXROdW1QcmVjaW5jdHNYKGxldmVsKTtcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdHNZID0gY29tcG9uZW50U3RydWN0dXJlLmdldE51bVByZWNpbmN0c1kobGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBwZXJMZXZlbFJlc3VsdFtsZXZlbF0gPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWluUHJlY2luY3RYOiBNYXRoLm1heCgwLCBtaW5QcmVjaW5jdFgpLFxyXG4gICAgICAgICAgICAgICAgICAgIG1pblByZWNpbmN0WTogTWF0aC5tYXgoMCwgbWluUHJlY2luY3RZKSxcclxuICAgICAgICAgICAgICAgICAgICBtYXhQcmVjaW5jdFhFeGNsdXNpdmU6IE1hdGgubWluKG1heFByZWNpbmN0WCwgcHJlY2luY3RzWCksXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4UHJlY2luY3RZRXhjbHVzaXZlOiBNYXRoLm1pbihtYXhQcmVjaW5jdFksIHByZWNpbmN0c1kpXHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcGVyQ29tcG9uZW50UmVzdWx0W2NvbXBvbmVudF0gPSBwZXJMZXZlbFJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHBlckNvbXBvbmVudFJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gdHJ5QWR2YW5jZVByZWNpbmN0SXRlcmF0b3IoXHJcbiAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLFxyXG4gICAgICAgIGxldmVsLFxyXG4gICAgICAgIHByZWNpbmN0c0luQ29kZXN0cmVhbVBhcnRQZXJMZXZlbFBlckNvbXBvbmVudCxcclxuICAgICAgICBpc0l0ZXJhdGVQcmVjaW5jdHNOb3RJbkNvZGVzdHJlYW1QYXJ0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG5lZWRBZHZhbmNlTmV4dE1lbWJlciA9IHRydWU7XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1JhbmdlSGFzaCA9IGlzSXRlcmF0ZVByZWNpbmN0c05vdEluQ29kZXN0cmVhbVBhcnQgP1xyXG4gICAgICAgICAgICBudWxsOiBwcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG5lZWRSZXNldFByZWNpbmN0VG9NaW5pbWFsSW5Db2Rlc3RyZWFtUGFydCA9IGZhbHNlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAyOyBpID49IDA7IC0taSkge1xyXG4gICAgICAgICAgICB2YXIgbmV3VmFsdWUgPSBhZHZhbmNlUHJvZ3Jlc3Npb25PcmRlck1lbWJlcihcclxuICAgICAgICAgICAgICAgIHNldGFibGVJdGVyYXRvciwgaSwgbGV2ZWwsIHByZWNpbmN0c1JhbmdlSGFzaCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBuZWVkQWR2YW5jZU5leHRNZW1iZXIgPSBuZXdWYWx1ZSA9PT0gMDtcclxuICAgICAgICAgICAgaWYgKCFuZWVkQWR2YW5jZU5leHRNZW1iZXIpIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocHJvZ3Jlc3Npb25PcmRlcltpXSA9PT0gJ1AnICYmXHJcbiAgICAgICAgICAgICAgICAhaXNJdGVyYXRlUHJlY2luY3RzTm90SW5Db2Rlc3RyZWFtUGFydCkge1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBuZWVkUmVzZXRQcmVjaW5jdFRvTWluaW1hbEluQ29kZXN0cmVhbVBhcnQgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChuZWVkQWR2YW5jZU5leHRNZW1iZXIpIHtcclxuICAgICAgICAgICAgLy8gSWYgd2UgYXJlIGhlcmUsIHRoZSBsYXN0IHByZWNpbmN0IGhhcyBiZWVuIHJlYWNoZWRcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAocHJlY2luY3RzSW5Db2Rlc3RyZWFtUGFydFBlckxldmVsUGVyQ29tcG9uZW50ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5pc0luQ29kZXN0cmVhbVBhcnQgPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJhbmdlUGVyTGV2ZWwgPVxyXG4gICAgICAgICAgICBwcmVjaW5jdHNJbkNvZGVzdHJlYW1QYXJ0UGVyTGV2ZWxQZXJDb21wb25lbnRbc2V0YWJsZUl0ZXJhdG9yLmNvbXBvbmVudF07XHJcbiAgICAgICAgdmFyIHByZWNpbmN0c1JhbmdlID0gcmFuZ2VQZXJMZXZlbFtzZXRhYmxlSXRlcmF0b3IucmVzb2x1dGlvbkxldmVsXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobmVlZFJlc2V0UHJlY2luY3RUb01pbmltYWxJbkNvZGVzdHJlYW1QYXJ0KSB7XHJcbiAgICAgICAgICAgIHNldGFibGVJdGVyYXRvci5wcmVjaW5jdFggPSBwcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFg7XHJcbiAgICAgICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RZID0gcHJlY2luY3RzUmFuZ2UubWluUHJlY2luY3RZO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXRhYmxlSXRlcmF0b3IuaXNJbkNvZGVzdHJlYW1QYXJ0ID1cclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WCA+PSBwcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFggJiZcclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WSA+PSBwcmVjaW5jdHNSYW5nZS5taW5QcmVjaW5jdFkgJiZcclxuICAgICAgICAgICAgc2V0YWJsZUl0ZXJhdG9yLnByZWNpbmN0WCA8IHByZWNpbmN0c1JhbmdlLm1heFByZWNpbmN0WEV4Y2x1c2l2ZSAmJlxyXG4gICAgICAgICAgICBzZXRhYmxlSXRlcmF0b3IucHJlY2luY3RZIDwgcHJlY2luY3RzUmFuZ2UubWF4UHJlY2luY3RZRXhjbHVzaXZlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhZHZhbmNlUHJvZ3Jlc3Npb25PcmRlck1lbWJlcihcclxuICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLFxyXG4gICAgICAgIG1lbWJlckluZGV4LFxyXG4gICAgICAgIGxldmVsLFxyXG4gICAgICAgIHByZWNpbmN0c1JhbmdlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudFN0cnVjdHVyZSA9IGNvbXBvbmVudFN0cnVjdHVyZXNbcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnRdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAocHJvZ3Jlc3Npb25PcmRlclttZW1iZXJJbmRleF0pIHtcclxuICAgICAgICAgICAgY2FzZSAnUic6XHJcbiAgICAgICAgICAgICAgICB2YXIgbnVtUmVzb2x1dGlvbkxldmVscyA9XHJcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldE51bVJlc29sdXRpb25MZXZlbHMoKSAtXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICsrcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWw7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbCAlPSBudW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZWNpbmN0UG9zaXRpb24ucmVzb2x1dGlvbkxldmVsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnQyc6XHJcbiAgICAgICAgICAgICAgICArK3ByZWNpbmN0UG9zaXRpb24uY29tcG9uZW50O1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnQgJT0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1Db21wb25lbnRzKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdQJzpcclxuICAgICAgICAgICAgICAgIHZhciBtaW5YLCBtaW5ZLCBtYXhYLCBtYXhZO1xyXG4gICAgICAgICAgICAgICAgaWYgKHByZWNpbmN0c1JhbmdlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0c1JhbmdlUGVyTGV2ZWwgPSBwcmVjaW5jdHNSYW5nZVtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnRdO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdHNSYW5nZUluTGV2ZWxDb21wb25lbnQgPSBwcmVjaW5jdHNSYW5nZVBlckxldmVsW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnJlc29sdXRpb25MZXZlbF07XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgbWluWCA9IHByZWNpbmN0c1JhbmdlSW5MZXZlbENvbXBvbmVudC5taW5QcmVjaW5jdFg7XHJcbiAgICAgICAgICAgICAgICAgICAgbWluWSA9IHByZWNpbmN0c1JhbmdlSW5MZXZlbENvbXBvbmVudC5taW5QcmVjaW5jdFk7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF4WCA9IHByZWNpbmN0c1JhbmdlSW5MZXZlbENvbXBvbmVudC5tYXhQcmVjaW5jdFhFeGNsdXNpdmU7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF4WSA9IHByZWNpbmN0c1JhbmdlSW5MZXZlbENvbXBvbmVudC5tYXhQcmVjaW5jdFlFeGNsdXNpdmU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIG1pblggPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIG1pblkgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIG1heFggPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWChcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgICAgIG1heFkgPSBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtUHJlY2luY3RzWShcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5yZXNvbHV0aW9uTGV2ZWwpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCAtPSAobWluWCAtIDEpO1xyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFggJT0gKG1heFggLSBtaW5YKTtcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RYICs9IG1pblg7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WCAhPSBtaW5YKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RYIC0gbWluWDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5wcmVjaW5jdFkgLT0gKG1pblkgLSAxKTtcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0UG9zaXRpb24ucHJlY2luY3RZICU9IChtYXhZIC0gbWluWSk7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WSArPSBtaW5ZO1xyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiBwcmVjaW5jdFBvc2l0aW9uLnByZWNpbmN0WSAtIG1pblk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdMJyA6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQWR2YW5jaW5nIEwgaXMgbm90IHN1cHBvcnRlZCBpbiBKUElQJyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ1VuZXhwZWN0ZWQgbGV0dGVyIGluIHByb2dyZXNzaW9uIG9yZGVyOiAnICtcclxuICAgICAgICAgICAgICAgICAgICBwcm9ncmVzc2lvbk9yZGVyW21lbWJlckluZGV4XSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBkZWZhdWx0Q29tcG9uZW50U3RydWN0dXJlID0ganBpcEZhY3RvcnkuY3JlYXRlQ29tcG9uZW50U3RydWN0dXJlKFxyXG4gICAgICAgIHNpemVQYXJhbXMuZGVmYXVsdENvbXBvbmVudFBhcmFtcywgdGhpcyk7XHJcbiAgICAgICAgXHJcbiAgICBjb21wb25lbnRTdHJ1Y3R1cmVzID0gbmV3IEFycmF5KGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtQ29tcG9uZW50cygpKTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29kZXN0cmVhbVN0cnVjdHVyZS5nZXROdW1Db21wb25lbnRzKCk7ICsraSkge1xyXG4gICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZXNbaV0gPSBqcGlwRmFjdG9yeS5jcmVhdGVDb21wb25lbnRTdHJ1Y3R1cmUoXHJcbiAgICAgICAgICAgIHNpemVQYXJhbXMucGFyYW1zUGVyQ29tcG9uZW50W2ldLCB0aGlzKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJlcHJvY2Vzc1BhcmFtcygpO1xyXG4gICAgXHJcbiAgICB2YWxpZGF0ZVRhcmdldFByb2dyZXNzaW9uT3JkZXIocHJvZ3Jlc3Npb25PcmRlcik7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuajJrTWFya2VycyA9IHtcclxuICAgIFN0YXJ0T2ZDb2Rlc3RyZWFtOiBbMHhGRiwgMHg0Rl0sIC8vIFNPQ1xyXG4gICAgSW1hZ2VBbmRUaWxlU2l6ZTogWzB4RkYsIDB4NTFdLCAvLyBTSVpcclxuICAgIENvZGluZ1N0eWxlRGVmYXVsdDogWzB4RkYsIDB4NTJdLCAvLyBDT0RcclxuICAgIENvZGluZ1N0eWxlQ29tcG9uZW50OiBbMHhGRiwgMHg1M10sIC8vIENPQ1xyXG4gICAgUXVhbnRpemF0aW9uRGVmYXVsdDogWzB4RkYsIDB4NUNdLCAvLyBRQ0RcclxuICAgIFByb2dyZXNzaW9uT3JkZXJDaGFuZ2U6IFsweEZGLCAweDVGXSwgLy8gUE9DXHJcbiAgICBQYWNrZWRQYWNrZXRIZWFkZXJzSW5NYWluSGVhZGVyOiBbMHhGRiwgMHg2MF0sIC8vIFBQTVxyXG4gICAgUGFja2VkUGFja2V0SGVhZGVyc0luVGlsZUhlYWRlcjogWzB4RkYsIDB4NjFdLCAvLyBQUFRcclxuICAgIFN0YXJ0T2ZUaWxlOiBbMHhGRiwgMHg5MF0sIC8vIFNPVFxyXG4gICAgU3RhcnRPZkRhdGE6IFsweEZGLCAweDkzXSwgLy8gU09EXHJcbiAgICBFbmRPZkNvZGVzdHJlYW06IFsweEZGLCAweEQ5XSwgLy8gRU9DXHJcbiAgICBDb21tZW50OiBbMHhGRiwgMHg2NF0gLy8gQ09NXHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qMmtPZmZzZXRzID0ge1xyXG4gICAgTUFSS0VSX1NJWkU6IDIsXHJcbiAgICBMRU5HVEhfRklFTERfU0laRTogMixcclxuICAgIFxyXG4gICAgTlVNX0NPTVBPTkVOVFNfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVI6IDM4LFxyXG4gICAgUkVGRVJFTkNFX0dSSURfU0laRV9PRkZTRVRfQUZURVJfU0laX01BUktFUjogNlxyXG5cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFbmRPZlJlc3BvbnNlUmVhc29ucyA9IHtcclxuICAgIElNQUdFX0RPTkUgOiAxLFxyXG4gICAgV0lORE9XX0RPTkUgOiAyLFxyXG4gICAgV0lORE9XX0NIQU5HRSA6IDMsXHJcbiAgICBCWVRFX0xJTUlUIDogNCxcclxuICAgIFFVQUxJVFlfTElNSVQgOiA1LFxyXG4gICAgU0VTU0lPTl9MSU1JVCA6IDYsXHJcbiAgICBSRVNQT05TRV9MSU1JVCA6IDcsXHJcbiAgICBOT05fU1BFQ0lGSUVEIDogOFxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuajJrRXhjZXB0aW9ucyA9IHtcclxuICAgIFVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbjogZnVuY3Rpb24oZmVhdHVyZSwgc3RhbmRhcmRTZWN0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGZlYXR1cmUgKyAnIChzcGVjaWZpZWQgaW4gc2VjdGlvbiAnICsgc3RhbmRhcmRTZWN0aW9uICsgJyBvZiBwYXJ0IDE6IENvcmUgQ29kaW5nIFN5c3RlbSBzdGFuZGFyZCkgaXMgbm90IHN1cHBvcnRlZCB5ZXQnO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKMmsgVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfSxcclxuXHJcbiAgICBQYXJzZUV4Y2VwdGlvbjogZnVuY3Rpb24oZGVzY3JpcHRpb24pIHtcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0oyayBQYXJzZUV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcblxyXG4gICAgSWxsZWdhbERhdGFFeGNlcHRpb246IGZ1bmN0aW9uKGlsbGVnYWxEYXRhRGVzY3JpcHRpb24sIHN0YW5kYXJkU2VjdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBpbGxlZ2FsRGF0YURlc2NyaXB0aW9uICsgJyAoc2VlIHNlY3Rpb24gJyArIHN0YW5kYXJkU2VjdGlvbiArICcgb2YgcGFydCA5OiBJbnRlcmFjdGl2aXR5IHRvb2xzLCBBUElzIGFuZCBQcm90b2NvbHMpJztcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSjJrIElsbGVnYWxEYXRhRXhjZXB0aW9uOiAnICsgdGhpcy5kZXNjcmlwdGlvbjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMgPSB7XHJcbiAgICBVbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb246IGZ1bmN0aW9uKGZlYXR1cmUsIHN0YW5kYXJkU2VjdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBmZWF0dXJlICsgJyAoc3BlY2lmaWVkIGluIHNlY3Rpb24gJyArIHN0YW5kYXJkU2VjdGlvbiArICcgb2YgcGFydCA5OiBJbnRlcmFjdGl2aXR5IHRvb2xzLCBBUElzIGFuZCBQcm90b2NvbHMpIGlzIG5vdCBzdXBwb3J0ZWQgeWV0JztcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSnBpcCBVbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG5cclxuICAgIFBhcnNlRXhjZXB0aW9uOiBmdW5jdGlvbihkZXNjcmlwdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSnBpcCBQYXJzZUV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcblxyXG4gICAgSWxsZWdhbERhdGFFeGNlcHRpb246IGZ1bmN0aW9uKGlsbGVnYWxEYXRhRGVzY3JpcHRpb24sIHN0YW5kYXJkU2VjdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBpbGxlZ2FsRGF0YURlc2NyaXB0aW9uICsgJyAoc2VlIHNlY3Rpb24gJyArIHN0YW5kYXJkU2VjdGlvbiArICcgb2YgcGFydCA5OiBJbnRlcmFjdGl2aXR5IHRvb2xzLCBBUElzIGFuZCBQcm90b2NvbHMpJztcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSnBpcCBJbGxlZ2FsRGF0YUV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcbiAgICBcclxuICAgIElsbGVnYWxPcGVyYXRpb25FeGNlcHRpb246IGZ1bmN0aW9uKGRlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKcGlwIElsbGVnYWxPcGVyYXRpb25FeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBBcmd1bWVudEV4Y2VwdGlvbjogZnVuY3Rpb24oYXJndW1lbnROYW1lLCBhcmd1bWVudFZhbHVlLCBkZXNjcmlwdGlvbikge1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSAnQXJndW1lbnQgJyArIGFyZ3VtZW50TmFtZSArICcgaGFzIGludmFsaWQgdmFsdWUgJyArXHJcbiAgICAgICAgICAgIGFyZ3VtZW50VmFsdWUgKyAoZGVzY3JpcHRpb24gIT09IHVuZGVmaW5lZCA/ICcgOicgKyBkZXNjcmlwdGlvbiA6ICcnKTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnSnBpcCBBcmd1bWVudEV4Y2VwdGlvbjogJyArIHRoaXMuZGVzY3JpcHRpb247XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0sXHJcblxyXG4gICAgV3JvbmdTdHJlYW1FeGNlcHRpb246IGZ1bmN0aW9uKHJlcXVlc3RlZE9wZXJhdGlvbiwgaXNKUFQpIHtcclxuICAgICAgICB2YXIgY29ycmVjdFN0cmVhbSA9ICdKUFAgKEpQSVAgUHJlY2luY3QpJztcclxuICAgICAgICB2YXIgd3JvbmdTdHJlYW0gPSAnSlBUIChKUElQIFRpbGUtcGFydCknO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpc0pQVCkge1xyXG4gICAgICAgICAgICB2YXIgc3dhcCA9IGNvcnJlY3RTdHJlYW07XHJcbiAgICAgICAgICAgIGNvcnJlY3RTdHJlYW0gPSB3cm9uZ1N0cmVhbTtcclxuICAgICAgICAgICAgd3JvbmdTdHJlYW0gPSBzd2FwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gICAgJ1N0cmVhbSB0eXBlIGlzICcgKyB3cm9uZ1N0cmVhbSArICcsIGJ1dCAnICsgcmVxdWVzdGVkT3BlcmF0aW9uICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICcgaXMgYWxsb3dlZCBvbmx5IGluICcgKyBjb3JyZWN0U3RyZWFtICsgJyBzdHJlYW0nO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ0pwaXAgV3JvbmdTdHJlYW1FeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9LFxyXG5cclxuICAgIEludGVybmFsRXJyb3JFeGNlcHRpb246IGZ1bmN0aW9uKGRlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdKcGlwIEludGVybmFsRXJyb3JFeGNlcHRpb246ICcgKyB0aGlzLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmoya0V4Y2VwdGlvbnMuUGFyc2VFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnajJrRXhjZXB0aW9ucy5QYXJzZUV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmoya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbic7XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucy5VbnN1cHBvcnRlZEZlYXR1cmVFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnanBpcEV4Y2VwdGlvbnMuVW5zdXBwb3J0ZWRGZWF0dXJlRXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMuUGFyc2VFeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnanBpcEV4Y2VwdGlvbnMuUGFyc2VFeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbi5OYW1lID1cclxuICAgICdqcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbic7XHJcbm1vZHVsZS5leHBvcnRzLmpwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2pwaXBFeGNlcHRpb25zLkFyZ3VtZW50RXhjZXB0aW9uJztcclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMuV3JvbmdTdHJlYW1FeGNlcHRpb24uTmFtZSA9XHJcbiAgICAnanBpcEV4Y2VwdGlvbnMuV3JvbmdTdHJlYW1FeGNlcHRpb24nO1xyXG5tb2R1bGUuZXhwb3J0cy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uLk5hbWUgPVxyXG4gICAgJ2pwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24nOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBzaW1wbGVBamF4SGVscGVyICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ3NpbXBsZS1hamF4LWhlbHBlci5qcycgICAgICAgICAgICAgICAgICk7XHJcbnZhciBtdXR1YWxFeGNsdXNpdmVUcmFuc2FjdGlvbkhlbHBlciA9IHJlcXVpcmUoJ211dHVhbC1leGNsdXNpdmUtdHJhbnNhY3Rpb24taGVscGVyLmpzJyk7XHJcblxyXG52YXIganBpcENvZGluZ1Bhc3Nlc051bWJlclBhcnNlciA9IHJlcXVpcmUoJ2pwaXAtY29kaW5nLXBhc3Nlcy1udW1iZXItcGFyc2VyLmpzJyk7XHJcbnZhciBqcGlwTWVzc2FnZUhlYWRlclBhcnNlciAgICAgID0gcmVxdWlyZSgnanBpcC1tZXNzYWdlLWhlYWRlci1wYXJzZXIuanMnICAgICAgKTtcclxuXHJcbnZhciBKcGlwQ2hhbm5lbCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtY2hhbm5lbC5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwQ29kZXN0cmVhbVJlY29uc3RydWN0b3IgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtY29kZXN0cmVhbS1yZWNvbnN0cnVjdG9yLmpzJyAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwQ29kZXN0cmVhbVN0cnVjdHVyZSAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtY29kZXN0cmVhbS1zdHJ1Y3R1cmUuanMnICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwQ29tcG9uZW50U3RydWN0dXJlICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtY29tcG9uZW50LXN0cnVjdHVyZS5qcycgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBDb21wb3NpdGVBcnJheSAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2NvbXBvc2l0ZS1hcnJheS5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwRGF0YWJpblBhcnRzICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtZGF0YWJpbi1wYXJ0cy5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwRGF0YWJpbnNTYXZlciAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtZGF0YWJpbnMtc2F2ZXIuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwRmV0Y2ggICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtZmV0Y2guanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwSGVhZGVyTW9kaWZpZXIgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtaGVhZGVyLW1vZGlmaWVyLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwSW1hZ2VEYXRhQ29udGV4dCAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtaW1hZ2UtZGF0YS1jb250ZXh0LmpzJyAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwTGV2ZWxDYWxjdWxhdG9yICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtbGV2ZWwtY2FsY3VsYXRvci5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwTWFya2Vyc1BhcnNlciAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtbWFya2Vycy1wYXJzZXIuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwT2JqZWN0UG9vbEJ5RGF0YWJpbiAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtb2JqZWN0LXBvb2wtYnktZGF0YWJpbi5qcycgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwT2Zmc2V0c0NhbGN1bGF0b3IgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtb2Zmc2V0cy1jYWxjdWxhdG9yLmpzJyAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwUGFja2V0c0RhdGFDb2xsZWN0b3IgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcGFja2V0cy1kYXRhLWNvbGxlY3Rvci5qcycgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwUmVxdWVzdERhdGFiaW5zTGlzdGVuZXIgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcmVxdWVzdC1kYXRhYmlucy1saXN0ZW5lci5qcycgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwUmVxdWVzdFBhcmFtc01vZGlmaWVyICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcmVxdWVzdC1wYXJhbXMtbW9kaWZpZXIuanMnICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwUmVxdWVzdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcmVxdWVzdC5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwU2Vzc2lvbkhlbHBlciAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtc2Vzc2lvbi1oZWxwZXIuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwU2Vzc2lvbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtc2Vzc2lvbi5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwUmVjb25uZWN0YWJsZVJlcXVlc3RlciAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcmVjb25uZWN0YWJsZS1yZXF1ZXN0ZXIuanMnICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwU3RydWN0dXJlUGFyc2VyICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtc3RydWN0dXJlLXBhcnNlci5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwVGlsZVN0cnVjdHVyZSAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtdGlsZS1zdHJ1Y3R1cmUuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwQml0c3RyZWFtUmVhZGVyICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtYml0c3RyZWFtLXJlYWRlci5qcycgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwVGFnVHJlZSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtdGFnLXRyZWUuanMnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwQ29kZWJsb2NrTGVuZ3RoUGFyc2VyICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtY29kZWJsb2NrLWxlbmd0aC1wYXJzZXIuanMnICAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwU3ViYmFuZExlbmd0aEluUGFja2V0SGVhZGVyQ2FsY3VsYXRvciA9IHJlcXVpcmUoJ2pwaXAtc3ViYmFuZC1sZW5ndGgtaW4tcGFja2V0LWhlYWRlci1jYWxjdWxhdG9yLmpzJyk7XHJcbnZhciBKcGlwUGFja2V0TGVuZ3RoQ2FsY3VsYXRvciAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcGFja2V0LWxlbmd0aC1jYWxjdWxhdG9yLmpzJyAgICAgICAgICAgICAgICAgICk7XHJcbnZhciBKcGlwUXVhbGl0eUxheWVyc0NhY2hlICAgICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoJ2pwaXAtcXVhbGl0eS1sYXllcnMtY2FjaGUuanMnICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG52YXIgSnBpcEZldGNoZXI7XHJcblxyXG52YXIganBpcFJ1bnRpbWVGYWN0b3J5ID0ge1xyXG4gICAgY3JlYXRlQ2hhbm5lbDogZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbChcclxuICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCwgc2Vzc2lvbkhlbHBlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcENoYW5uZWwoXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQ29kZXN0cmVhbVJlY29uc3RydWN0b3I6IGZ1bmN0aW9uKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGRhdGFiaW5zU2F2ZXIsIGhlYWRlck1vZGlmaWVyLCBxdWFsaXR5TGF5ZXJzQ2FjaGUpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDb2Rlc3RyZWFtUmVjb25zdHJ1Y3RvcihcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICAgICAgaGVhZGVyTW9kaWZpZXIsXHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVMZXZlbENhbGN1bGF0b3I6IGZ1bmN0aW9uKHBhcmFtcykge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcExldmVsQ2FsY3VsYXRvcihwYXJhbXMpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQ29kZXN0cmVhbVN0cnVjdHVyZTogZnVuY3Rpb24oc3RydWN0dXJlUGFyc2VyLCBwcm9ncmVzc2lvbk9yZGVyKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwQ29kZXN0cmVhbVN0cnVjdHVyZShcclxuICAgICAgICAgICAgc3RydWN0dXJlUGFyc2VyLCBqcGlwUnVudGltZUZhY3RvcnksIHByb2dyZXNzaW9uT3JkZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQ29tcG9uZW50U3RydWN0dXJlOiBmdW5jdGlvbihwYXJhbXMsIHRpbGVTdHJ1Y3R1cmUpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBDb21wb25lbnRTdHJ1Y3R1cmUocGFyYW1zLCB0aWxlU3RydWN0dXJlKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUNvbXBvc2l0ZUFycmF5OiBmdW5jdGlvbihvZmZzZXQpIHtcclxuICAgICAgICByZXR1cm4gbmV3IENvbXBvc2l0ZUFycmF5KG9mZnNldCk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVEYXRhYmluUGFydHM6IGZ1bmN0aW9uKGNsYXNzSWQsIGluQ2xhc3NJZCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcERhdGFiaW5QYXJ0cyhjbGFzc0lkLCBpbkNsYXNzSWQsIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVEYXRhYmluc1NhdmVyOiBmdW5jdGlvbihpc0pwaXBUaWxlcGFydFN0cmVhbSkge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcERhdGFiaW5zU2F2ZXIoaXNKcGlwVGlsZXBhcnRTdHJlYW0sIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVGZXRjaGVyOiBmdW5jdGlvbihkYXRhYmluc1NhdmVyLCBvcHRpb25zKSB7XHJcbiAgICAgICAgaWYgKCFKcGlwRmV0Y2hlcikge1xyXG5cdFx0XHQvLyBBdm9pZCBkZXBlbmRlbmN5IC0gbG9hZCBvbmx5IG9uIHJ1bnRpbWVcclxuXHRcdFx0SnBpcEZldGNoZXIgPSByZXF1aXJlKCdqcGlwLWZldGNoZXIuanMnKTtcclxuXHRcdH1cclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBGZXRjaGVyKGRhdGFiaW5zU2F2ZXIsIG9wdGlvbnMpO1xyXG4gICAgfSxcclxuXHRcclxuXHRjcmVhdGVGZXRjaDogZnVuY3Rpb24oZmV0Y2hDb250ZXh0LCByZXF1ZXN0ZXIsIHByb2dyZXNzaXZlbmVzcykge1xyXG5cdFx0cmV0dXJuIG5ldyBKcGlwRmV0Y2goZmV0Y2hDb250ZXh0LCByZXF1ZXN0ZXIsIHByb2dyZXNzaXZlbmVzcyk7XHJcblx0fSxcclxuICAgIFxyXG4gICAgY3JlYXRlSGVhZGVyTW9kaWZpZXI6IGZ1bmN0aW9uKFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIG9mZnNldHNDYWxjdWxhdG9yLCBwcm9ncmVzc2lvbk9yZGVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwSGVhZGVyTW9kaWZpZXIoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIG9mZnNldHNDYWxjdWxhdG9yLCBwcm9ncmVzc2lvbk9yZGVyKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZUltYWdlRGF0YUNvbnRleHQ6IGZ1bmN0aW9uKFxyXG4gICAgICAgIGpwaXBPYmplY3RzLCBjb2Rlc3RyZWFtUGFydFBhcmFtcywgcHJvZ3Jlc3NpdmVuZXNzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwSW1hZ2VEYXRhQ29udGV4dChcclxuICAgICAgICAgICAganBpcE9iamVjdHMsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBwcm9ncmVzc2l2ZW5lc3MpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlTWFya2Vyc1BhcnNlcjogZnVuY3Rpb24obWFpbkhlYWRlckRhdGFiaW4pIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBNYXJrZXJzUGFyc2VyKFxyXG4gICAgICAgICAgICBtYWluSGVhZGVyRGF0YWJpbiwganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXIsIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVPYmplY3RQb29sQnlEYXRhYmluOiBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBPYmplY3RQb29sQnlEYXRhYmluKCk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVPZmZzZXRzQ2FsY3VsYXRvcjogZnVuY3Rpb24obWFpbkhlYWRlckRhdGFiaW4sIG1hcmtlcnNQYXJzZXIpIHtcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBPZmZzZXRzQ2FsY3VsYXRvcihtYWluSGVhZGVyRGF0YWJpbiwgbWFya2Vyc1BhcnNlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVQYWNrZXRzRGF0YUNvbGxlY3RvcjogZnVuY3Rpb24oXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSwgZGF0YWJpbnNTYXZlciwgcXVhbGl0eUxheWVyc0NhY2hlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwUGFja2V0c0RhdGFDb2xsZWN0b3IoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZSxcclxuICAgICAgICAgICAganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVJlcXVlc3REYXRhYmluc0xpc3RlbmVyOiBmdW5jdGlvbiBjcmVhdGVSZXF1ZXN0RGF0YWJpbnNMaXN0ZW5lcihcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICBxdWFsaXR5TGF5ZXJSZWFjaGVkQ2FsbGJhY2ssXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgIHF1YWxpdHlMYXllcnNDYWNoZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFJlcXVlc3REYXRhYmluc0xpc3RlbmVyKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyUmVhY2hlZENhbGxiYWNrLFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgICAgICBxdWFsaXR5TGF5ZXJzQ2FjaGUsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG5cdFxyXG5cdGNyZWF0ZVJlcXVlc3RQYXJhbXNNb2RpZmllcjogZnVuY3Rpb24gY3JlYXRlUmVxdWVzdFBhcmFtc01vZGlmaWVyKFxyXG5cdFx0Y29kZXN0cmVhbVN0cnVjdHVyZSkge1xyXG5cdFx0XHJcblx0XHRyZXR1cm4gbmV3IEpwaXBSZXF1ZXN0UGFyYW1zTW9kaWZpZXIoY29kZXN0cmVhbVN0cnVjdHVyZSk7XHJcblx0fSxcclxuICAgIFxyXG4gICAgY3JlYXRlUmVxdWVzdDogZnVuY3Rpb24gY3JlYXRlUmVxdWVzdChcclxuICAgICAgICBzZXNzaW9uSGVscGVyLCBjaGFubmVsLCByZXF1ZXN0VXJsLCBjYWxsYmFjaywgZmFpbHVyZUNhbGxiYWNrKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwUmVxdWVzdChcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlcixcclxuICAgICAgICAgICAganBpcE1lc3NhZ2VIZWFkZXJQYXJzZXIsXHJcbiAgICAgICAgICAgIGNoYW5uZWwsXHJcbiAgICAgICAgICAgIHJlcXVlc3RVcmwsXHJcbiAgICAgICAgICAgIGNhbGxiYWNrLFxyXG4gICAgICAgICAgICBmYWlsdXJlQ2FsbGJhY2spO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlU2Vzc2lvbkhlbHBlcjogZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbkhlbHBlcihcclxuICAgICAgICBkYXRhUmVxdWVzdFVybCxcclxuICAgICAgICBrbm93blRhcmdldElkLFxyXG4gICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgZGF0YWJpbnNTYXZlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFNlc3Npb25IZWxwZXIoXHJcbiAgICAgICAgICAgIGRhdGFSZXF1ZXN0VXJsLFxyXG4gICAgICAgICAgICBrbm93blRhcmdldElkLFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAgICAgICAgICBzaW1wbGVBamF4SGVscGVyKTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVNlc3Npb246IGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24oXHJcbiAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsXHJcbiAgICAgICAgdGFyZ2V0SWQsXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICBkYXRhYmluc1NhdmVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwU2Vzc2lvbihcclxuICAgICAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgICAgICB0YXJnZXRJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcixcclxuICAgICAgICAgICAgc2V0SW50ZXJ2YWwsXHJcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVSZWNvbm5lY3RhYmxlUmVxdWVzdGVyOiBmdW5jdGlvbihcclxuICAgICAgICBtYXhDaGFubmVsc0luU2Vzc2lvbixcclxuICAgICAgICBtYXhSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZUluQ2hhbm5lbCxcclxuICAgICAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgICAgIGRhdGFiaW5zU2F2ZXIpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IEpwaXBSZWNvbm5lY3RhYmxlUmVxdWVzdGVyKFxyXG4gICAgICAgICAgICBtYXhDaGFubmVsc0luU2Vzc2lvbixcclxuICAgICAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICAgICAgICAgIGpwaXBSdW50aW1lRmFjdG9yeSk7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVTdHJ1Y3R1cmVQYXJzZXI6IGZ1bmN0aW9uKGRhdGFiaW5zU2F2ZXIsIG1hcmtlcnNQYXJzZXIsIG9mZnNldHNDYWxjdWxhdG9yKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwU3RydWN0dXJlUGFyc2VyKFxyXG4gICAgICAgICAgICBkYXRhYmluc1NhdmVyLCBtYXJrZXJzUGFyc2VyLCBqcGlwTWVzc2FnZUhlYWRlclBhcnNlciwgb2Zmc2V0c0NhbGN1bGF0b3IpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlVGlsZVN0cnVjdHVyZTogZnVuY3Rpb24oXHJcbiAgICAgICAgc2l6ZVBhcmFtcywgY29kZXN0cmVhbVN0cnVjdHVyZSwgcHJvZ3Jlc3Npb25PcmRlcikge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFRpbGVTdHJ1Y3R1cmUoXHJcbiAgICAgICAgICAgIHNpemVQYXJhbXMsIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGpwaXBSdW50aW1lRmFjdG9yeSwgcHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVCaXRzdHJlYW1SZWFkZXI6IGZ1bmN0aW9uIGNyZWF0ZUJpdHN0cmVhbVJlYWRlcihkYXRhYmluKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBKcGlwQml0c3RyZWFtUmVhZGVyKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBtdXR1YWxFeGNsdXNpdmVUcmFuc2FjdGlvbkhlbHBlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVUYWdUcmVlOiBmdW5jdGlvbiBjcmVhdGVUYWdUcmVlKGJpdHN0cmVhbVJlYWRlciwgd2lkdGgsIGhlaWdodCkge1xyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFRhZ1RyZWUoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlciwgd2lkdGgsIGhlaWdodCwgbXV0dWFsRXhjbHVzaXZlVHJhbnNhY3Rpb25IZWxwZXIpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlQ29kZWJsb2NrTGVuZ3RoUGFyc2VyOiBmdW5jdGlvbiBjcmVhdGVDb2RlYmxvY2tMZW5ndGhQYXJzZXIoXHJcbiAgICAgICAgYml0c3RyZWFtUmVhZGVyLCB0cmFuc2FjdGlvbkhlbHBlcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcENvZGVibG9ja0xlbmd0aFBhcnNlcihcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLCBtdXR1YWxFeGNsdXNpdmVUcmFuc2FjdGlvbkhlbHBlcik7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBjcmVhdGVTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yIDpcclxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVTdWJiYW5kTGVuZ3RoSW5QYWNrZXRIZWFkZXJDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsIG51bUNvZGVibG9ja3NYSW5TdWJiYW5kLCBudW1Db2RlYmxvY2tzWUluU3ViYmFuZCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFN1YmJhbmRMZW5ndGhJblBhY2tldEhlYWRlckNhbGN1bGF0b3IoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlcixcclxuICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQsXHJcbiAgICAgICAgICAgIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kLFxyXG4gICAgICAgICAgICBqcGlwQ29kaW5nUGFzc2VzTnVtYmVyUGFyc2VyLFxyXG4gICAgICAgICAgICBtdXR1YWxFeGNsdXNpdmVUcmFuc2FjdGlvbkhlbHBlcixcclxuICAgICAgICAgICAganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH0sXHJcbiAgICBcclxuICAgIGNyZWF0ZVBhY2tldExlbmd0aENhbGN1bGF0b3I6IGZ1bmN0aW9uIGNyZWF0ZVBhY2tldExlbmd0aENhbGN1bGF0b3IoXHJcbiAgICAgICAgdGlsZVN0cnVjdHVyZSxcclxuICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUsXHJcbiAgICAgICAgZGF0YWJpbixcclxuICAgICAgICBzdGFydE9mZnNldEluRGF0YWJpbixcclxuICAgICAgICBwcmVjaW5jdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFBhY2tldExlbmd0aENhbGN1bGF0b3IoXHJcbiAgICAgICAgICAgIHRpbGVTdHJ1Y3R1cmUsXHJcbiAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbixcclxuICAgICAgICAgICAgc3RhcnRPZmZzZXRJbkRhdGFiaW4sXHJcbiAgICAgICAgICAgIHByZWNpbmN0LFxyXG4gICAgICAgICAgICBqcGlwUnVudGltZUZhY3RvcnkpO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlUXVhbGl0eUxheWVyc0NhY2hlOiBmdW5jdGlvbiBjcmVhdGVRdWFsaXR5TGF5ZXJzQ2FjaGUoXHJcbiAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBuZXcgSnBpcFF1YWxpdHlMYXllcnNDYWNoZShcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAganBpcFJ1bnRpbWVGYWN0b3J5KTtcclxuICAgIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0ganBpcFJ1bnRpbWVGYWN0b3J5OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgcmVxdWVzdDogZnVuY3Rpb24gcmVxdWVzdChcclxuICAgICAgICB1cmwsXHJcbiAgICAgICAgY2FsbGJhY2tGb3JBc3luY2hyb25vdXNSZXF1ZXN0LFxyXG4gICAgICAgIGZhaWx1cmVDYWxsYmFja0ZvckFzeW5jaHJvbm91c1JlcXVlc3QsXHJcbiAgICAgICAgcHJvZ3Jlc3NpdmVSZXF1ZXN0UXVhbnRCeXRlcykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhamF4UmVzcG9uc2UgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAgICAgICB2YXIgaXNTeW5jaHJvbm91cyA9IGNhbGxiYWNrRm9yQXN5bmNocm9ub3VzUmVxdWVzdCA9PT0gdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICB2YXIgaXNGaW5pc2hlZFJlcXVlc3QgPSBmYWxzZTtcclxuICAgICAgICB2YXIgYnl0ZXNSZWNpZXZlZE9uTGFzdFF1YW50ID0gMDtcclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBpbnRlcm5hbEFqYXhDYWxsYmFjayhlKSB7XHJcbiAgICAgICAgICAgIGlmIChpc0ZpbmlzaGVkUmVxdWVzdCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYWpheFJlc3BvbnNlLnJlYWR5U3RhdGUgIT09IDQpIHtcclxuICAgICAgICAgICAgICAgIGlmIChwcm9ncmVzc2l2ZVJlcXVlc3RRdWFudEJ5dGVzID09PSB1bmRlZmluZWQgfHxcclxuICAgICAgICAgICAgICAgICAgICBhamF4UmVzcG9uc2UucmVzcG9uc2UgPT09IG51bGwgfHxcclxuICAgICAgICAgICAgICAgICAgICBhamF4UmVzcG9uc2UucmVhZHlTdGF0ZSA8IDMpIHtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBieXRlc1JlY2lldmVkID0gYWpheFJlc3BvbnNlLnJlc3BvbnNlLmJ5dGVMZW5ndGg7XHJcbiAgICAgICAgICAgICAgICB2YXIgYnl0ZXNUaWxsTGFzdFF1YW50ID0gYnl0ZXNSZWNpZXZlZCAtIGJ5dGVzUmVjaWV2ZWRPbkxhc3RRdWFudDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGJ5dGVzVGlsbExhc3RRdWFudCA8IHByb2dyZXNzaXZlUmVxdWVzdFF1YW50Qnl0ZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGJ5dGVzUmVjaWV2ZWRPbkxhc3RRdWFudCA9IGJ5dGVzUmVjaWV2ZWQ7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpc0ZpbmlzaGVkUmVxdWVzdCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChhamF4UmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHxcclxuICAgICAgICAgICAgICAgICAgICBhamF4UmVzcG9uc2UucmVzcG9uc2UgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBmYWlsdXJlQ2FsbGJhY2tGb3JBc3luY2hyb25vdXNSZXF1ZXN0KGFqYXhSZXNwb25zZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoIWlzU3luY2hyb25vdXMpIHtcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrRm9yQXN5bmNocm9ub3VzUmVxdWVzdChhamF4UmVzcG9uc2UsIGlzRmluaXNoZWRSZXF1ZXN0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhamF4UmVzcG9uc2Uub3BlbignR0VUJywgdXJsLCAhaXNTeW5jaHJvbm91cyk7XHJcbiAgICAgICAgYWpheFJlc3BvbnNlLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGludGVybmFsQWpheENhbGxiYWNrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNTeW5jaHJvbm91cykge1xyXG4gICAgICAgICAgICAvLyBOb3Qgc3VwcG9ydGVkIGZvciBzeW5jaHJvbm91cyByZXF1ZXN0c1xyXG4gICAgICAgICAgICBhamF4UmVzcG9uc2UubW96UmVzcG9uc2VUeXBlID0gYWpheFJlc3BvbnNlLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcic7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAocHJvZ3Jlc3NpdmVSZXF1ZXN0UXVhbnRCeXRlcyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGFqYXhSZXNwb25zZS5zZXRSZXF1ZXN0SGVhZGVyKCdYLUNvbnRlbnQtVHlwZS1PcHRpb25zJywgJ25vc25pZmYnKTtcclxuICAgICAgICAgICAgYWpheFJlc3BvbnNlLm9ucHJvZ3Jlc3MgPSBpbnRlcm5hbEFqYXhDYWxsYmFjaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWpheFJlc3BvbnNlLnNlbmQobnVsbCk7XHJcblxyXG4gICAgICAgIGlmIChpc1N5bmNocm9ub3VzICYmICFpc0ZpbmlzaGVkUmVxdWVzdCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdzeW5jaHJvbm91cyBhamF4IGNhbGwgd2FzIG5vdCBmaW5pc2hlZCBzeW5jaHJvbm91c2x5Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBhamF4UmVzcG9uc2U7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwTWFya2Vyc1BhcnNlcihcclxuICAgIG1haW5IZWFkZXJEYXRhYmluLCBtZXNzYWdlSGVhZGVyUGFyc2VyLCBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgQ0FDSEVfS0VZID0gJ21hcmtlcnMnO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE1hbmRhdG9yeU1hcmtlck9mZnNldEluRGF0YWJpbiA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0TWFuZGF0b3J5TWFya2VyT2Zmc2V0SW5EYXRhYmluQ2xvc3VyZShcclxuICAgICAgICAgICAgZGF0YWJpbiwgbWFya2VyLCBtYXJrZXJOYW1lLCBzdGFuZGFyZFNlY3Rpb24pIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgb2Zmc2V0ID0gZ2V0TWFya2VyT2Zmc2V0SW5EYXRhYmluKGRhdGFiaW4sIG1hcmtlcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuajJrRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgIG1hcmtlck5hbWUgKyAnIGlzIG5vdCBmb3VuZCB3aGVyZSBleHBlY3RlZCB0byBiZScsXHJcbiAgICAgICAgICAgICAgICBzdGFuZGFyZFNlY3Rpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gb2Zmc2V0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5jaGVja1N1cHBvcnRlZE1hcmtlcnMgPSBmdW5jdGlvbiBjaGVja1N1cHBvcnRlZE1hcmtlcnNDbG9zdXJlKFxyXG4gICAgICAgIGRhdGFiaW4sIG1hcmtlcnMsIGlzTWFya2Vyc1N1cHBvcnRlZCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlzTWFya2Vyc1N1cHBvcnRlZCA9ICEhaXNNYXJrZXJzU3VwcG9ydGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkYXRhYmluTWFya2VycyA9IGdldERhdGFiaW5NYXJrZXJzKFxyXG4gICAgICAgICAgICBkYXRhYmluLCAvKmZvcmNlQWxsTWFya2Vyc1BhcnNlZD0qL3RydWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXJzQXNQcm9wZXJ0aWVzID0ge307XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXJrZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHZhciBtYXJrZXIgPSBnZXRNYXJrZXJBc1Byb3BlcnR5TmFtZShcclxuICAgICAgICAgICAgICAgIG1hcmtlcnNbaV0sICdqcGlwTWFya2Vyc1BhcnNlci5zdXBwb3J0ZWRNYXJrZXJzWycgKyBpICsgJ10nKTtcclxuICAgICAgICAgICAgbWFya2Vyc0FzUHJvcGVydGllc1ttYXJrZXJdID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgZXhpc3RpbmdNYXJrZXIgaW4gZGF0YWJpbk1hcmtlcnMubWFya2VyVG9PZmZzZXQpIHtcclxuICAgICAgICAgICAgdmFyIGlzTWFya2VySW5MaXN0ID0gISFtYXJrZXJzQXNQcm9wZXJ0aWVzW2V4aXN0aW5nTWFya2VyXTtcclxuICAgICAgICAgICAgaWYgKGlzTWFya2VySW5MaXN0ICE9PSBpc01hcmtlcnNTdXBwb3J0ZWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnVW5zdXBwb3J0ZWQgbWFya2VyIGZvdW5kOiAnICsgZXhpc3RpbmdNYXJrZXIsICd1bmtub3duJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldE1hcmtlck9mZnNldEluRGF0YWJpbiA9IGdldE1hcmtlck9mZnNldEluRGF0YWJpbjtcclxuICAgIFxyXG4gICAgdGhpcy5pc01hcmtlciA9IGlzTWFya2VyO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpc01hcmtlcihkYXRhLCBtYXJrZXIsIG9mZnNldCkge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSAoZGF0YVtvZmZzZXRdID09PSBtYXJrZXJbMF0pICYmIChkYXRhW29mZnNldCArIDFdID09PSBtYXJrZXJbMV0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0TWFya2VyT2Zmc2V0SW5EYXRhYmluKGRhdGFiaW4sIG1hcmtlcikge1xyXG4gICAgICAgIHZhciBkYXRhYmluTWFya2VycyA9IGdldERhdGFiaW5NYXJrZXJzKFxyXG4gICAgICAgICAgICBkYXRhYmluLCAvKmZvcmNlQWxsTWFya2Vyc1BhcnNlZD0qL3RydWUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdHJNYXJrZXIgPSBnZXRNYXJrZXJBc1Byb3BlcnR5TmFtZShcclxuICAgICAgICAgICAgbWFya2VyLCAnUHJlZGVmaW5lZCBtYXJrZXIgaW4gakdsb2JhbHMuajJrTWFya2VycycpO1xyXG4gICAgICAgIHZhciBvZmZzZXQgPSBkYXRhYmluTWFya2Vycy5tYXJrZXJUb09mZnNldFtzdHJNYXJrZXJdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvZmZzZXQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXREYXRhYmluTWFya2VycyhkYXRhYmluLCBmb3JjZUFsbE1hcmtlcnNQYXJzZWQpIHtcclxuICAgICAgICB2YXIgZGF0YWJpbk1hcmtlcnMgPSBkYXRhYmluLmdldENhY2hlZERhdGEoQ0FDSEVfS0VZKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbk1hcmtlcnMubWFya2VyVG9PZmZzZXQgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBkYXRhYmluTWFya2Vycy5pc1BhcnNlZEFsbE1hcmtlcnMgPSBmYWxzZTtcclxuICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCA9IDA7XHJcbiAgICAgICAgICAgIGRhdGFiaW5NYXJrZXJzLm1hcmtlclRvT2Zmc2V0ID0ge307XHJcbiAgICAgICAgICAgIGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4gPSBkYXRhYmluO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGF0YWJpbk1hcmtlcnMuaXNQYXJzZWRBbGxNYXJrZXJzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBkYXRhYmluTWFya2VycztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0YXJ0T2Zmc2V0ID0gMDtcclxuICAgICAgICB2YXIgYnl0ZXMgPSBbXTtcclxuICAgICAgICB2YXIgY2FuUGFyc2UgPSB0cnVlO1xyXG5cclxuICAgICAgICBpZiAoZGF0YWJpbiA9PT0gbWFpbkhlYWRlckRhdGFiaW4gJiYgZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCA9PT0gMCkge1xyXG4gICAgICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBkYXRhYmluLmNvcHlCeXRlcyhieXRlcywgLypzdGFydE9mZnNldD0qLzAsIHtcclxuICAgICAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChieXRlc0NvcGllZCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgY2FuUGFyc2UgPSBmYWxzZTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmICghaXNNYXJrZXIoYnl0ZXMsIGpHbG9iYWxzLmoya01hcmtlcnMuU3RhcnRPZkNvZGVzdHJlYW0sIC8qb2Zmc2V0PSovMCkpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdTT0MgKFN0YXJ0IE9mIENvZGVzdHJlYW0pICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdpcyBub3QgZm91bmQgd2hlcmUgZXhwZWN0ZWQgdG8gYmUnLFxyXG4gICAgICAgICAgICAgICAgICAgICdBLjQuMScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkYXRhYmluTWFya2Vycy5sYXN0T2Zmc2V0UGFyc2VkID0gMjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChjYW5QYXJzZSkge1xyXG4gICAgICAgICAgICBhY3R1YWxQYXJzZU1hcmtlcnMoZGF0YWJpbk1hcmtlcnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBhZnRlclBhcnNlTWFya2VycyhkYXRhYmluTWFya2VycywgZm9yY2VBbGxNYXJrZXJzUGFyc2VkKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gZGF0YWJpbk1hcmtlcnM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGFjdHVhbFBhcnNlTWFya2VycyhkYXRhYmluTWFya2Vycykge1xyXG4gICAgICAgIHZhciBvZmZzZXQgPSBkYXRhYmluTWFya2Vycy5sYXN0T2Zmc2V0UGFyc2VkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlcyA9IFtdO1xyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwge1xyXG4gICAgICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUgKyBqR2xvYmFscy5qMmtPZmZzZXRzLkxFTkdUSF9GSUVMRF9TSVpFLFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0OiBvZmZzZXRcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChieXRlc0NvcGllZCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB2YXIgbWFya2VyID0gZ2V0TWFya2VyQXNQcm9wZXJ0eU5hbWUoXHJcbiAgICAgICAgICAgICAgICBieXRlcyxcclxuICAgICAgICAgICAgICAgICdvZmZzZXQgJyArIG9mZnNldCArICcgb2YgZGF0YWJpbiB3aXRoIGNsYXNzIElEID0gJyArXHJcbiAgICAgICAgICAgICAgICAgICAgZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5nZXRDbGFzc0lkKCkgKyAnIGFuZCBpbiBjbGFzcyBJRCA9ICcgK1xyXG4gICAgICAgICAgICAgICAgICAgIGRhdGFiaW5NYXJrZXJzLmRhdGFiaW4uZ2V0SW5DbGFzc0lkKCkpO1xyXG4gICAgICAgICAgICBkYXRhYmluTWFya2Vycy5tYXJrZXJUb09mZnNldFttYXJrZXIudG9TdHJpbmcoKV0gPSBvZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGxlbmd0aCA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MTYoYnl0ZXMsIGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUpO1xyXG4gICAgICAgICAgICBvZmZzZXQgKz0gbGVuZ3RoICsgakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGJ5dGVzQ29waWVkID0gZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5jb3B5Qnl0ZXMoYnl0ZXMsIC8qc3RhcnRPZmZzZXQ9Ki8wLCB7XHJcbiAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRSArIGpHbG9iYWxzLmoya09mZnNldHMuTEVOR1RIX0ZJRUxEX1NJWkUsXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IG9mZnNldFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkYXRhYmluTWFya2Vycy5sYXN0T2Zmc2V0UGFyc2VkID0gb2Zmc2V0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhZnRlclBhcnNlTWFya2VycyhkYXRhYmluTWFya2VycywgZm9yY2VBbGxNYXJrZXJzUGFyc2VkKSB7XHJcbiAgICAgICAgdmFyIGRhdGFiaW5MZW5ndGggPSBkYXRhYmluTWFya2Vycy5kYXRhYmluLmdldERhdGFiaW5MZW5ndGhJZktub3duKCk7XHJcbiAgICAgICAgZGF0YWJpbk1hcmtlcnMuaXNQYXJzZWRBbGxNYXJrZXJzID0gZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZCA9PT0gZGF0YWJpbkxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWRhdGFiaW5NYXJrZXJzLmlzUGFyc2VkQWxsTWFya2VycyAmJiBkYXRhYmluTWFya2Vycy5kYXRhYmluICE9PSBtYWluSGVhZGVyRGF0YWJpbikge1xyXG4gICAgICAgICAgICB2YXIgYnl0ZXMgPSBbXTtcclxuICAgICAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gZGF0YWJpbk1hcmtlcnMuZGF0YWJpbi5jb3B5Qnl0ZXMoYnl0ZXMsIC8qc3RhcnRPZmZzZXQ9Ki8wLCB7XHJcbiAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRSxcclxuICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogZGF0YWJpbk1hcmtlcnMubGFzdE9mZnNldFBhcnNlZFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgIT09IG51bGwgJiZcclxuICAgICAgICAgICAgICAgIGlzTWFya2VyKGJ5dGVzLCAwLCBqR2xvYmFscy5qMmtNYXJrZXJzLlN0YXJ0T2ZEYXRhKSkge1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluTWFya2Vycy5sYXN0T2Zmc2V0UGFyc2VkICs9IGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkU7XHJcbiAgICAgICAgICAgICAgICBkYXRhYmluTWFya2Vycy5pc1BhcnNlZEFsbE1hcmtlcnMgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmb3JjZUFsbE1hcmtlcnNQYXJzZWQgJiYgIWRhdGFiaW5NYXJrZXJzLmlzUGFyc2VkQWxsTWFya2Vycykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdkYXRhLWJpbiB3aXRoIGNsYXNzIElEID0gJyArXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluTWFya2Vycy5kYXRhYmluLmdldENsYXNzSWQoKSArICcgYW5kIGluIGNsYXNzIElEID0gJyArXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluTWFya2Vycy5kYXRhYmluLmdldEluQ2xhc3NJZCgpICtcclxuICAgICAgICAgICAgICAgICcgd2FzIG5vdCByZWNpZXZlZCB5ZXQnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldE1hcmtlckFzUHJvcGVydHlOYW1lKGJ5dGVzLCBtYXJrZXJQb3NpdGlvbkRlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgaWYgKGJ5dGVzWzBdICE9PSAweEZGKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0V4cGVjdGVkIG1hcmtlciBpbiAnICsgbWFya2VyUG9zaXRpb25EZXNjcmlwdGlvbiwgJ0EnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1hcmtlciA9IGJ5dGVzWzFdLnRvU3RyaW5nKDE2KTtcclxuICAgICAgICByZXR1cm4gbWFya2VyO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcE9mZnNldHNDYWxjdWxhdG9yKFxyXG4gICAgbWFpbkhlYWRlckRhdGFiaW4sIG1hcmtlcnNQYXJzZXIpIHtcclxuICAgIFxyXG4gICAgdmFyIHN1cHBvcnRlZE1hcmtlcnMgPSBbXHJcbiAgICAgICAgakdsb2JhbHMuajJrTWFya2Vycy5JbWFnZUFuZFRpbGVTaXplLFxyXG4gICAgICAgIGpHbG9iYWxzLmoya01hcmtlcnMuQ29kaW5nU3R5bGVEZWZhdWx0LFxyXG4gICAgICAgIGpHbG9iYWxzLmoya01hcmtlcnMuUXVhbnRpemF0aW9uRGVmYXVsdCxcclxuICAgICAgICBqR2xvYmFscy5qMmtNYXJrZXJzLkNvbW1lbnRcclxuICAgICAgICBdO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENvZGluZ1N0eWxlT2Zmc2V0ID0gZ2V0Q29kaW5nU3R5bGVPZmZzZXQ7XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0Q29kaW5nU3R5bGVCYXNlUGFyYW1zID0gZ2V0Q29kaW5nU3R5bGVCYXNlUGFyYW1zO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEltYWdlQW5kVGlsZVNpemVPZmZzZXQgPSBmdW5jdGlvbiBnZXRJbWFnZUFuZFRpbGVTaXplT2Zmc2V0KCkge1xyXG4gICAgICAgIC8vIEEuNS4xIChJbWFnZSBhbmQgdGlsZSBzaXplIG1hcmtlciBzZWdtZW50KVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaXpNYXJrZXJPZmZzZXQgPSBtYXJrZXJzUGFyc2VyLmdldE1hbmRhdG9yeU1hcmtlck9mZnNldEluRGF0YWJpbihcclxuICAgICAgICAgICAgbWFpbkhlYWRlckRhdGFiaW4sXHJcbiAgICAgICAgICAgIGpHbG9iYWxzLmoya01hcmtlcnMuSW1hZ2VBbmRUaWxlU2l6ZSxcclxuICAgICAgICAgICAgJ0ltYWdlIGFuZCBUaWxlIFNpemUgKFNJWiknLFxyXG4gICAgICAgICAgICAnQS41LjEnKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gc2l6TWFya2VyT2Zmc2V0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRSYW5nZXNPZkJlc3RSZXNvbHV0aW9uTGV2ZWxzRGF0YSA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0UmFuZ2VzV2l0aERhdGFPZlJlc29sdXRpb25MZXZlbHNDbG9zdXJlKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBudW1SZXNvbHV0aW9uTGV2ZWxzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbWFya2Vyc1BhcnNlci5jaGVja1N1cHBvcnRlZE1hcmtlcnMoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIHN1cHBvcnRlZE1hcmtlcnMsIC8qaXNNYXJrZXJzU3VwcG9ydGVkPSovdHJ1ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXQgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBkYXRhYmluQ29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcyA9IGdldENvZGluZ1N0eWxlQmFzZVBhcmFtcyhcclxuICAgICAgICAgICAgZGF0YWJpbiwgLyppc01hbmRhdG9yeT0qL2ZhbHNlKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YWJpbk9yTWFpbkhlYWRlckNvZGluZ1N0eWxlQmFzZVBhcmFtcyA9IGRhdGFiaW5Db2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zO1xyXG4gICAgICAgIGlmIChkYXRhYmluQ29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICBkYXRhYmluT3JNYWluSGVhZGVyQ29kaW5nU3R5bGVCYXNlUGFyYW1zID0gZ2V0Q29kaW5nU3R5bGVCYXNlUGFyYW1zKFxyXG4gICAgICAgICAgICAgICAgbWFpbkhlYWRlckRhdGFiaW4sIC8qaXNNYW5kYXRvcnk9Ki90cnVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIGRhdGFiaW5Db2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLm51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2RpbmdTdHlsZU51bVJlc29sdXRpb25MZXZlbHMgPSBcclxuICAgICAgICAgICAgZGF0YWJpbk9yTWFpbkhlYWRlckNvZGluZ1N0eWxlQmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAoY29kaW5nU3R5bGVOdW1SZXNvbHV0aW9uTGV2ZWxzIDw9IG51bVJlc29sdXRpb25MZXZlbHMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnbnVtUmVzb2x1dGlvbkxldmVscyAoJyArIG51bVJlc29sdXRpb25MZXZlbHMgKyAnKSA8PSBDT0QuJyArXHJcbiAgICAgICAgICAgICAgICAnbnVtUmVzb2x1dGlvbkxldmVscyAoJyArIGNvZGluZ1N0eWxlTnVtUmVzb2x1dGlvbkxldmVscyArICcpJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgcmFuZ2VzID0gW107XHJcblxyXG4gICAgICAgIGFkZFJhbmdlT2ZCZXN0UmVzb2x1dGlvbkxldmVsc0luQ29kaW5nU3R5bGUoXHJcbiAgICAgICAgICAgIHJhbmdlcywgZGF0YWJpbkNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMsIG51bVJlc29sdXRpb25MZXZlbHMpO1xyXG5cclxuICAgICAgICBhZGRSYW5nZU9mQmVzdFJlc29sdXRpb25MZXZlbHNJblF1YW50aXphdGlvbihcclxuICAgICAgICAgICAgcmFuZ2VzLFxyXG4gICAgICAgICAgICBkYXRhYmluLFxyXG4gICAgICAgICAgICBkYXRhYmluT3JNYWluSGVhZGVyQ29kaW5nU3R5bGVCYXNlUGFyYW1zLFxyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgcmFuZ2VzOiByYW5nZXMsXHJcbiAgICAgICAgICAgIG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXQ6IG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Q29kaW5nU3R5bGVCYXNlUGFyYW1zKFxyXG4gICAgICAgIGRhdGFiaW4sIGlzTWFuZGF0b3J5KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCA9IGdldENvZGluZ1N0eWxlT2Zmc2V0KFxyXG4gICAgICAgICAgICBkYXRhYmluLCBpc01hbmRhdG9yeSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bUJ5dGVzID0gODtcclxuICAgICAgICB2YXIgYnl0ZXNPZmZzZXQgPSBjb2RpbmdTdHlsZURlZmF1bHRPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFO1xyXG4gICAgICAgIHZhciBieXRlcyA9IGdldEJ5dGVzKGRhdGFiaW4sIG51bUJ5dGVzLCBieXRlc09mZnNldCk7XHJcblxyXG4gICAgICAgIHZhciBjb2RpbmdTdHlsZUZsYWdzRm9yQWxsQ29tcG9uZW50c09mZnNldCA9IDI7IC8vIFNjb2RcclxuICAgICAgICB2YXIgY29kaW5nU3R5bGVGbGFnc0ZvckFsbENvbXBvbmVudHMgPVxyXG4gICAgICAgICAgICBieXRlc1tjb2RpbmdTdHlsZUZsYWdzRm9yQWxsQ29tcG9uZW50c09mZnNldF07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBpc0RlZmF1bHRQcmVjaW5jdFNpemUgPSAhKGNvZGluZ1N0eWxlRmxhZ3NGb3JBbGxDb21wb25lbnRzICYgMHgxKTtcclxuICAgICAgICB2YXIgaXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZCA9ICEhKGNvZGluZ1N0eWxlRmxhZ3NGb3JBbGxDb21wb25lbnRzICYgMHgyKTtcclxuICAgICAgICB2YXIgaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkID0gISEoY29kaW5nU3R5bGVGbGFnc0ZvckFsbENvbXBvbmVudHMgJiAweDQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0SW5CeXRlcyA9IDc7IC8vIFNQY29kLCAxc3QgYnl0ZVxyXG4gICAgICAgIHZhciBudW1EZWNvbXBvc2l0aW9uTGV2ZWxzID0gYnl0ZXNbbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldEluQnl0ZXNdO1xyXG4gICAgICAgIHZhciBudW1SZXNvbHV0aW9uTGV2ZWxzID0gbnVtRGVjb21wb3NpdGlvbkxldmVscyArIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXQgPSBieXRlc09mZnNldCArIG51bURlY29tcG9zaXRpb25MZXZlbHNPZmZzZXRJbkJ5dGVzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFNpemVzT2Zmc2V0ID0gaXNEZWZhdWx0UHJlY2luY3RTaXplID8gbnVsbCA6IGNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldCArIDE0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlRGVmYXVsdE9mZnNldDogY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaXNEZWZhdWx0UHJlY2luY3RTaXplOiBpc0RlZmF1bHRQcmVjaW5jdFNpemUsXHJcbiAgICAgICAgICAgIGlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQ6IGlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQsXHJcbiAgICAgICAgICAgIGlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZDogaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkLFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbnVtUmVzb2x1dGlvbkxldmVsczogbnVtUmVzb2x1dGlvbkxldmVscyxcclxuICAgICAgICAgICAgcHJlY2luY3RTaXplc09mZnNldDogcHJlY2luY3RTaXplc09mZnNldCxcclxuICAgICAgICAgICAgbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldDogbnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGFkZFJhbmdlT2ZCZXN0UmVzb2x1dGlvbkxldmVsc0luQ29kaW5nU3R5bGUoXHJcbiAgICAgICAgcmFuZ2VzLCBjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLCBudW1SZXNvbHV0aW9uTGV2ZWxzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGluZ1N0eWxlRGVmYXVsdEJhc2VQYXJhbXMgPT09IG51bGwgfHxcclxuICAgICAgICAgICAgY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcy5pc0RlZmF1bHRQcmVjaW5jdFNpemUpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxldmVsc05vdEluUmFuZ2UgPVxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMgLSBudW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdE9mZnNldEluUmFuZ2UgPVxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZURlZmF1bHRCYXNlUGFyYW1zLnByZWNpbmN0U2l6ZXNPZmZzZXQgKyBsZXZlbHNOb3RJblJhbmdlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXJMZW5ndGhPZmZzZXQgPSBcclxuICAgICAgICAgICAgY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcy5jb2RpbmdTdHlsZURlZmF1bHRPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwcmVjaW5jdFNpemVzUmFuZ2UgPSB7XHJcbiAgICAgICAgICAgIG1hcmtlclNlZ21lbnRMZW5ndGhPZmZzZXQ6IG1hcmtlckxlbmd0aE9mZnNldCxcclxuICAgICAgICAgICAgc3RhcnQ6IGZpcnN0T2Zmc2V0SW5SYW5nZSxcclxuICAgICAgICAgICAgbGVuZ3RoOiBudW1SZXNvbHV0aW9uTGV2ZWxzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIHJhbmdlcy5wdXNoKHByZWNpbmN0U2l6ZXNSYW5nZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0UXVhbnRpemF0aW9uRGF0YUJ5dGVzUGVyU3ViYmFuZChkYXRhYmluLCBxdWFudGl6YXRpb25TdHlsZU9mZnNldCkge1xyXG4gICAgICAgIHZhciBzcWNkT2Zmc2V0ID0gcXVhbnRpemF0aW9uU3R5bGVPZmZzZXQgKyA0OyAvLyBTcWNkXHJcbiAgICAgICAgdmFyIGJ5dGVzID0gZ2V0Qnl0ZXMoZGF0YWJpbiwgLypudW1CeXRlcz0qLzEsIHNxY2RPZmZzZXQpO1xyXG4gICAgICAgIHZhciBxdWFudGl6YXRpb25TdHlsZSA9IGJ5dGVzWzBdICYgMHgxRjtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNQZXJTdWJiYW5kO1xyXG4gICAgICAgIHN3aXRjaCAocXVhbnRpemF0aW9uU3R5bGUpIHtcclxuICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgYnl0ZXNQZXJTdWJiYW5kID0gMTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICAgICAgICBieXRlc1BlclN1YmJhbmQgPSAwO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgICAgICAgIGJ5dGVzUGVyU3ViYmFuZCA9IDI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdRdWFudGl6YXRpb24gc3R5bGUgb2YgJyArIHF1YW50aXphdGlvblN0eWxlLCAnQS42LjQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzUGVyU3ViYmFuZDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWRkUmFuZ2VPZkJlc3RSZXNvbHV0aW9uTGV2ZWxzSW5RdWFudGl6YXRpb24oXHJcbiAgICAgICAgcmFuZ2VzLFxyXG4gICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcyxcclxuICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHFjZE1hcmtlck9mZnNldCA9IG1hcmtlcnNQYXJzZXIuZ2V0TWFya2VyT2Zmc2V0SW5EYXRhYmluKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBqR2xvYmFscy5qMmtNYXJrZXJzLlF1YW50aXphdGlvbkRlZmF1bHQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChxY2RNYXJrZXJPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNQZXJTdWJiYW5kID0gZ2V0UXVhbnRpemF0aW9uRGF0YUJ5dGVzUGVyU3ViYmFuZChcclxuICAgICAgICAgICAgZGF0YWJpbiwgcWNkTWFya2VyT2Zmc2V0KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKGJ5dGVzUGVyU3ViYmFuZCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZXZlbHNOb3RJblJhbmdlID1cclxuICAgICAgICAgICAgY29kaW5nU3R5bGVEZWZhdWx0QmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzIC0gbnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc3ViYmFuZHNOb3RJblJhbmdlID0gMSArIDMgKiAobGV2ZWxzTm90SW5SYW5nZSAtIDEpO1xyXG4gICAgICAgIHZhciBzdWJiYW5kc0luUmFuZ2UgPSAzICogbnVtUmVzb2x1dGlvbkxldmVscztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZmlyc3RPZmZzZXRJblJhbmdlID1cclxuICAgICAgICAgICAgcWNkTWFya2VyT2Zmc2V0ICsgNSArIHN1YmJhbmRzTm90SW5SYW5nZSAqIGJ5dGVzUGVyU3ViYmFuZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmFuZ2VMZW5ndGggPSBzdWJiYW5kc0luUmFuZ2UgKiBieXRlc1BlclN1YmJhbmQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1hcmtlckxlbmd0aE9mZnNldCA9IHFjZE1hcmtlck9mZnNldCArIGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHF1YW50aXphdGlvbnNSYW5nZSA9IHtcclxuICAgICAgICAgICAgbWFya2VyU2VnbWVudExlbmd0aE9mZnNldDogbWFya2VyTGVuZ3RoT2Zmc2V0LFxyXG4gICAgICAgICAgICBzdGFydDogZmlyc3RPZmZzZXRJblJhbmdlLFxyXG4gICAgICAgICAgICBsZW5ndGg6IHJhbmdlTGVuZ3RoXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmFuZ2VzLnB1c2gocXVhbnRpemF0aW9uc1JhbmdlKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZXhwZWN0Tm9Db2RpbmdTdHlsZUNvbXBvbmVudChkYXRhYmluKSB7XHJcbiAgICAgICAgdmFyIGNvY09mZnNldCA9IG1hcmtlcnNQYXJzZXIuZ2V0TWFya2VyT2Zmc2V0SW5EYXRhYmluKFxyXG4gICAgICAgICAgICBkYXRhYmluLCBqR2xvYmFscy5qMmtNYXJrZXJzLkNvZGluZ1N0eWxlQ29tcG9uZW50KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29jT2Zmc2V0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIC8vIEEuNi4yXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdDT0MgTWFya2VyIChDb2RpbmcgU3R5bGUgQ29tcG9uZW50KScsICdBLjYuMicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Q29kaW5nU3R5bGVPZmZzZXQoZGF0YWJpbiwgaXNNYW5kYXRvcnkpIHtcclxuICAgICAgICBleHBlY3ROb0NvZGluZ1N0eWxlQ29tcG9uZW50KGRhdGFiaW4pO1xyXG5cclxuICAgICAgICB2YXIgb2Zmc2V0O1xyXG4gICAgICAgIGlmIChpc01hbmRhdG9yeSkge1xyXG4gICAgICAgICAgICBvZmZzZXQgPSBtYXJrZXJzUGFyc2VyLmdldE1hbmRhdG9yeU1hcmtlck9mZnNldEluRGF0YWJpbihcclxuICAgICAgICAgICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICBqR2xvYmFscy5qMmtNYXJrZXJzLkNvZGluZ1N0eWxlRGVmYXVsdCxcclxuICAgICAgICAgICAgICAgICdDT0QgKENvZGluZyBzdHlsZSBEZWZhdWx0KScsXHJcbiAgICAgICAgICAgICAgICAnQS42LjEnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBvZmZzZXQgPSBtYXJrZXJzUGFyc2VyLmdldE1hcmtlck9mZnNldEluRGF0YWJpbihcclxuICAgICAgICAgICAgICAgIGRhdGFiaW4sIGpHbG9iYWxzLmoya01hcmtlcnMuQ29kaW5nU3R5bGVEZWZhdWx0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG9mZnNldDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Qnl0ZXMoZGF0YWJpbiwgbnVtQnl0ZXMsIGRhdGFiaW5TdGFydE9mZnNldCwgYWxsb3dFbmRPZlJhbmdlKSB7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gW107XHJcblxyXG4gICAgICAgIHZhciByYW5nZU9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IG51bUJ5dGVzLFxyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IGRhdGFiaW5TdGFydE9mZnNldFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW4uY29weUJ5dGVzKGJ5dGVzLCAvKnN0YXJ0T2Zmc2V0PSovMCwgcmFuZ2VPcHRpb25zKTtcclxuICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnSGVhZGVyIGRhdGEtYmluIGhhcyBub3QgeWV0IHJlY2lldmVkICcgKyBudW1CeXRlcyArXHJcbiAgICAgICAgICAgICAgICAnIGJ5dGVzIHN0YXJ0aW5nIGZyb20gb2Zmc2V0ICcgKyBkYXRhYmluU3RhcnRPZmZzZXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYnl0ZXM7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwU3RydWN0dXJlUGFyc2VyKFxyXG4gICAgZGF0YWJpbnNTYXZlciwgbWFya2Vyc1BhcnNlciwgbWVzc2FnZUhlYWRlclBhcnNlciwgb2Zmc2V0c0NhbGN1bGF0b3IpIHtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJzZUNvZGVzdHJlYW1TdHJ1Y3R1cmUgPSBmdW5jdGlvbiBwYXJzZUNvZGVzdHJlYW1TdHJ1Y3R1cmUoKSB7XHJcbiAgICAgICAgLy8gQS41LjEgKEltYWdlIGFuZCBUaWxlIFNpemUpXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG1haW5IZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRNYWluSGVhZGVyRGF0YWJpbigpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaXpNYXJrZXJPZmZzZXQgPSBvZmZzZXRzQ2FsY3VsYXRvci5nZXRJbWFnZUFuZFRpbGVTaXplT2Zmc2V0KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzID0gZ2V0Qnl0ZXMoXHJcbiAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLFxyXG4gICAgICAgICAgICAvKm51bUJ5dGVzPSovMzgsXHJcbiAgICAgICAgICAgIHNpek1hcmtlck9mZnNldCArIGpHbG9iYWxzLmoya09mZnNldHMuTUFSS0VSX1NJWkUgKyBqR2xvYmFscy5qMmtPZmZzZXRzLkxFTkdUSF9GSUVMRF9TSVpFKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgPVxyXG4gICAgICAgICAgICBqR2xvYmFscy5qMmtPZmZzZXRzLlJFRkVSRU5DRV9HUklEX1NJWkVfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVIgLVxyXG4gICAgICAgICAgICAoakdsb2JhbHMuajJrT2Zmc2V0cy5NQVJLRVJfU0laRSArIGpHbG9iYWxzLmoya09mZnNldHMuTEVOR1RIX0ZJRUxEX1NJWkUpO1xyXG4gICAgICAgIHZhciBudW1Db21wb25lbnRzT2Zmc2V0ID1cclxuICAgICAgICAgICAgakdsb2JhbHMuajJrT2Zmc2V0cy5OVU1fQ09NUE9ORU5UU19PRkZTRVRfQUZURVJfU0laX01BUktFUiAtXHJcbiAgICAgICAgICAgIChqR2xvYmFscy5qMmtPZmZzZXRzLk1BUktFUl9TSVpFICsgakdsb2JhbHMuajJrT2Zmc2V0cy5MRU5HVEhfRklFTERfU0laRSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciByZWZlcmVuY2VHcmlkU2l6ZVggPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKFxyXG4gICAgICAgICAgICBieXRlcywgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQpOyAvLyBYU2l6XHJcbiAgICAgICAgdmFyIHJlZmVyZW5jZUdyaWRTaXplWSA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MzIoXHJcbiAgICAgICAgICAgIGJ5dGVzLCByZWZlcmVuY2VHcmlkU2l6ZU9mZnNldCArIDQpOyAvLyBZU2l6XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBpbWFnZU9mZnNldFggPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKGJ5dGVzLCAxMCk7IC8vIFhPU2l6XHJcbiAgICAgICAgdmFyIGltYWdlT2Zmc2V0WSA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MzIoYnl0ZXMsIDE0KTsgLy8gWU9TaXpcclxuICAgICAgICB2YXIgdGlsZVNpemVYID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMTgpOyAvLyBYVFNpelxyXG4gICAgICAgIHZhciB0aWxlU2l6ZVkgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKGJ5dGVzLCAyMik7IC8vIFlUU2l6XHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZU9mZnNldFggPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDMyKGJ5dGVzLCAyNik7IC8vIFhUT1NpelxyXG4gICAgICAgIHZhciBmaXJzdFRpbGVPZmZzZXRZID0gbWVzc2FnZUhlYWRlclBhcnNlci5nZXRJbnQzMihieXRlcywgMzApOyAvLyBZVE9TaXpcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50cyA9IG1lc3NhZ2VIZWFkZXJQYXJzZXIuZ2V0SW50MTYoYnl0ZXMsIG51bUNvbXBvbmVudHNPZmZzZXQpOyAvLyBDU2l6XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudHNEYXRhT2Zmc2V0ID1cclxuICAgICAgICAgICAgc2l6TWFya2VyT2Zmc2V0ICsgakdsb2JhbHMuajJrT2Zmc2V0cy5OVU1fQ09NUE9ORU5UU19PRkZTRVRfQUZURVJfU0laX01BUktFUiArIDI7XHJcbiAgICAgICAgdmFyIGNvbXBvbmVudHNEYXRhTGVuZ3RoID0gbnVtQ29tcG9uZW50cyAqIDM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudHNEYXRhQnl0ZXMgPSBnZXRCeXRlcyhcclxuICAgICAgICAgICAgbWFpbkhlYWRlckRhdGFiaW4sIGNvbXBvbmVudHNEYXRhTGVuZ3RoLCBjb21wb25lbnRzRGF0YU9mZnNldCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbXBvbmVudHNTY2FsZVggPSBuZXcgQXJyYXkobnVtQ29tcG9uZW50cyk7XHJcbiAgICAgICAgdmFyIGNvbXBvbmVudHNTY2FsZVkgPSBuZXcgQXJyYXkobnVtQ29tcG9uZW50cyk7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1Db21wb25lbnRzOyArK2kpIHtcclxuICAgICAgICAgICAgY29tcG9uZW50c1NjYWxlWFtpXSA9IGNvbXBvbmVudHNEYXRhQnl0ZXNbaSAqIDMgKyAxXTtcclxuICAgICAgICAgICAgY29tcG9uZW50c1NjYWxlWVtpXSA9IGNvbXBvbmVudHNEYXRhQnl0ZXNbaSAqIDMgKyAyXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgbnVtQ29tcG9uZW50czogbnVtQ29tcG9uZW50cyxcclxuICAgICAgICAgICAgY29tcG9uZW50c1NjYWxlWDogY29tcG9uZW50c1NjYWxlWCxcclxuICAgICAgICAgICAgY29tcG9uZW50c1NjYWxlWTogY29tcG9uZW50c1NjYWxlWSxcclxuICAgICAgICAgICAgaW1hZ2VXaWR0aDogcmVmZXJlbmNlR3JpZFNpemVYIC0gZmlyc3RUaWxlT2Zmc2V0WCxcclxuICAgICAgICAgICAgaW1hZ2VIZWlnaHQ6IHJlZmVyZW5jZUdyaWRTaXplWSAtIGZpcnN0VGlsZU9mZnNldFksXHJcbiAgICAgICAgICAgIHRpbGVXaWR0aDogdGlsZVNpemVYLFxyXG4gICAgICAgICAgICB0aWxlSGVpZ2h0OiB0aWxlU2l6ZVksXHJcbiAgICAgICAgICAgIGZpcnN0VGlsZU9mZnNldFg6IGZpcnN0VGlsZU9mZnNldFgsXHJcbiAgICAgICAgICAgIGZpcnN0VGlsZU9mZnNldFk6IGZpcnN0VGlsZU9mZnNldFlcclxuICAgICAgICB9O1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnBhcnNlRGVmYXVsdFRpbGVQYXJhbXMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgbWFpbkhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldE1haW5IZWFkZXJEYXRhYmluKCk7XHJcblxyXG4gICAgICAgIHZhciB0aWxlUGFyYW1zID0gcGFyc2VDb2RpbmdTdHlsZShtYWluSGVhZGVyRGF0YWJpbiwgLyppc01hbmRhdG9yeT0qL3RydWUpO1xyXG4gICAgICAgIHJldHVybiB0aWxlUGFyYW1zO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJzZU92ZXJyaWRlblRpbGVQYXJhbXMgPSBmdW5jdGlvbih0aWxlSW5kZXgpIHtcclxuICAgICAgICB2YXIgdGlsZUhlYWRlckRhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldFRpbGVIZWFkZXJEYXRhYmluKHRpbGVJbmRleCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQS40LjIgKFN0YXJ0IE9mIFRpbGUtcGFydClcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVBhcmFtcyA9IHBhcnNlQ29kaW5nU3R5bGUodGlsZUhlYWRlckRhdGFiaW4sIC8qaXNNYW5kYXRvcnk9Ki9mYWxzZSk7XHJcbiAgICAgICAgcmV0dXJuIHRpbGVQYXJhbXM7XHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIHBhcnNlQ29kaW5nU3R5bGUoZGF0YWJpbiwgaXNNYW5kYXRvcnkpIHtcclxuICAgICAgICAvLyBBLjUuMSAoSW1hZ2UgYW5kIFRpbGUgU2l6ZSlcclxuXHJcbiAgICAgICAgdmFyIGJhc2VQYXJhbXMgPSBvZmZzZXRzQ2FsY3VsYXRvci5nZXRDb2RpbmdTdHlsZUJhc2VQYXJhbXMoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sIGlzTWFuZGF0b3J5KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYmFzZVBhcmFtcyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuXHJcbiAgICAgICAgdmFyIHNpek1hcmtlck9mZnNldCA9IG9mZnNldHNDYWxjdWxhdG9yLmdldEltYWdlQW5kVGlsZVNpemVPZmZzZXQoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtQ29tcG9uZW50c09mZnNldCA9XHJcbiAgICAgICAgICAgIHNpek1hcmtlck9mZnNldCArIGpHbG9iYWxzLmoya09mZnNldHMuTlVNX0NPTVBPTkVOVFNfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVI7XHJcblxyXG4gICAgICAgIHZhciBudW1Db21wb25lbnRzQnl0ZXMgPSBnZXRCeXRlcyhcclxuICAgICAgICAgICAgbWFpbkhlYWRlckRhdGFiaW4sXHJcbiAgICAgICAgICAgIC8qbnVtQnl0ZXM9Ki8yLFxyXG4gICAgICAgICAgICAvKnN0YXJ0T2Zmc2V0PSovbnVtQ29tcG9uZW50c09mZnNldCk7XHJcbiAgICAgICAgdmFyIG51bUNvbXBvbmVudHMgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDE2KG51bUNvbXBvbmVudHNCeXRlcywgMCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhY2tlZFBhY2tldEhlYWRlcnNNYXJrZXJJblRpbGVIZWFkZXIgPVxyXG4gICAgICAgICAgICBtYXJrZXJzUGFyc2VyLmdldE1hcmtlck9mZnNldEluRGF0YWJpbihcclxuICAgICAgICAgICAgICAgIGRhdGFiaW4sIGpHbG9iYWxzLmoya01hcmtlcnMuUGFja2VkUGFja2V0SGVhZGVyc0luVGlsZUhlYWRlcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhY2tlZFBhY2tldEhlYWRlcnNNYXJrZXJJbk1haW5IZWFkZXIgPVxyXG4gICAgICAgICAgICBtYXJrZXJzUGFyc2VyLmdldE1hcmtlck9mZnNldEluRGF0YWJpbihcclxuICAgICAgICAgICAgICAgIG1haW5IZWFkZXJEYXRhYmluLCBqR2xvYmFscy5qMmtNYXJrZXJzLlBhY2tlZFBhY2tldEhlYWRlcnNJbk1haW5IZWFkZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc1BhY2tldEhlYWRlcnNOZWFyRGF0YSA9XHJcbiAgICAgICAgICAgIHBhY2tlZFBhY2tldEhlYWRlcnNNYXJrZXJJblRpbGVIZWFkZXIgPT09IG51bGwgJiZcclxuICAgICAgICAgICAgcGFja2VkUGFja2V0SGVhZGVyc01hcmtlckluTWFpbkhlYWRlciA9PT0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kaW5nU3R5bGVNb3JlRGF0YU9mZnNldCA9IGJhc2VQYXJhbXMuY29kaW5nU3R5bGVEZWZhdWx0T2Zmc2V0ICsgNjtcclxuICAgICAgICB2YXIgY29kaW5nU3R5bGVNb3JlRGF0YUJ5dGVzID0gZ2V0Qnl0ZXMoXHJcbiAgICAgICAgICAgIGRhdGFiaW4sXHJcbiAgICAgICAgICAgIC8qbnVtQnl0ZXM9Ki82LFxyXG4gICAgICAgICAgICAvKnN0YXJ0T2Zmc2V0PSovY29kaW5nU3R5bGVNb3JlRGF0YU9mZnNldCk7XHJcbiAgICAgICAgdmFyIG51bVF1YWxpdHlMYXllcnMgPSBtZXNzYWdlSGVhZGVyUGFyc2VyLmdldEludDE2KFxyXG4gICAgICAgICAgICBjb2RpbmdTdHlsZU1vcmVEYXRhQnl0ZXMsIDApO1xyXG5cclxuICAgICAgICB2YXIgY29kZWJsb2NrV2lkdGggPSBwYXJzZUNvZGVibG9ja1NpemUoXHJcbiAgICAgICAgICAgIGNvZGluZ1N0eWxlTW9yZURhdGFCeXRlcywgNCk7XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja0hlaWdodCA9IHBhcnNlQ29kZWJsb2NrU2l6ZShcclxuICAgICAgICAgICAgY29kaW5nU3R5bGVNb3JlRGF0YUJ5dGVzLCA1KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcHJlY2luY3RXaWR0aHMgPSBuZXcgQXJyYXkoYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzKTtcclxuICAgICAgICB2YXIgcHJlY2luY3RIZWlnaHRzID0gbmV3IEFycmF5KGJhc2VQYXJhbXMubnVtUmVzb2x1dGlvbkxldmVscyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHByZWNpbmN0U2l6ZXNCeXRlcyA9IG51bGw7XHJcbiAgICAgICAgaWYgKCFiYXNlUGFyYW1zLmlzRGVmYXVsdFByZWNpbmN0U2l6ZSkge1xyXG4gICAgICAgICAgICB2YXIgcHJlY2luY3RTaXplc0J5dGVzTmVlZGVkID0gYmFzZVBhcmFtcy5udW1SZXNvbHV0aW9uTGV2ZWxzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcHJlY2luY3RTaXplc0J5dGVzID0gZ2V0Qnl0ZXMoXHJcbiAgICAgICAgICAgICAgICBkYXRhYmluLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RTaXplc0J5dGVzTmVlZGVkLFxyXG4gICAgICAgICAgICAgICAgYmFzZVBhcmFtcy5wcmVjaW5jdFNpemVzT2Zmc2V0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBkZWZhdWx0U2l6ZSA9IDEgPDwgMTU7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBiYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHM7ICsraSkge1xyXG4gICAgICAgICAgICBpZiAoYmFzZVBhcmFtcy5pc0RlZmF1bHRQcmVjaW5jdFNpemUpIHtcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0V2lkdGhzW2ldID0gZGVmYXVsdFNpemU7XHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdEhlaWdodHNbaV0gPSBkZWZhdWx0U2l6ZTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcHJlY2luY3RTaXplT2Zmc2V0ID0gaTtcclxuICAgICAgICAgICAgdmFyIHNpemVFeHBvbmVudHMgPSBwcmVjaW5jdFNpemVzQnl0ZXNbcHJlY2luY3RTaXplT2Zmc2V0XTtcclxuICAgICAgICAgICAgdmFyIHBweCA9IHNpemVFeHBvbmVudHMgJiAweDBGO1xyXG4gICAgICAgICAgICB2YXIgcHB5ID0gc2l6ZUV4cG9uZW50cyA+Pj4gNDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHByZWNpbmN0V2lkdGhzW2ldID0gMSAqIE1hdGgucG93KDIsIHBweCk7IC8vIEF2b2lkIG5lZ2F0aXZlIHJlc3VsdCBkdWUgdG8gc2lnbmVkIGNhbGN1bGF0aW9uXHJcbiAgICAgICAgICAgIHByZWNpbmN0SGVpZ2h0c1tpXSA9IDEgKiBNYXRoLnBvdygyLCBwcHkpOyAvLyBBdm9pZCBuZWdhdGl2ZSByZXN1bHQgZHVlIHRvIHNpZ25lZCBjYWxjdWxhdGlvblxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGFyYW1zUGVyQ29tcG9uZW50ID0gbmV3IEFycmF5KG51bUNvbXBvbmVudHMpO1xyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnVtQ29tcG9uZW50czsgKytqKSB7XHJcbiAgICAgICAgICAgIHBhcmFtc1BlckNvbXBvbmVudFtqXSA9IHtcclxuICAgICAgICAgICAgICAgIG1heENvZGVibG9ja1dpZHRoOiBjb2RlYmxvY2tXaWR0aCxcclxuICAgICAgICAgICAgICAgIG1heENvZGVibG9ja0hlaWdodDogY29kZWJsb2NrSGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzOiBiYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMsXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0V2lkdGhQZXJMZXZlbDogcHJlY2luY3RXaWR0aHMsXHJcbiAgICAgICAgICAgICAgICBwcmVjaW5jdEhlaWdodFBlckxldmVsOiBwcmVjaW5jdEhlaWdodHNcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRlZmF1bHRDb21wb25lbnRQYXJhbXMgPSB7XHJcbiAgICAgICAgICAgIG1heENvZGVibG9ja1dpZHRoOiBjb2RlYmxvY2tXaWR0aCxcclxuICAgICAgICAgICAgbWF4Q29kZWJsb2NrSGVpZ2h0OiBjb2RlYmxvY2tIZWlnaHQsXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBudW1SZXNvbHV0aW9uTGV2ZWxzOiBiYXNlUGFyYW1zLm51bVJlc29sdXRpb25MZXZlbHMsXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBwcmVjaW5jdFdpZHRoUGVyTGV2ZWw6IHByZWNpbmN0V2lkdGhzLFxyXG4gICAgICAgICAgICBwcmVjaW5jdEhlaWdodFBlckxldmVsOiBwcmVjaW5jdEhlaWdodHNcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVBhcmFtcyA9IHtcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyczogbnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlzUGFja2V0SGVhZGVyc05lYXJEYXRhOiBpc1BhY2tldEhlYWRlcnNOZWFyRGF0YSxcclxuICAgICAgICAgICAgaXNTdGFydE9mUGFja2V0TWFya2VyQWxsb3dlZDogYmFzZVBhcmFtcy5pc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkLFxyXG4gICAgICAgICAgICBpc0VuZFBhY2tldEhlYWRlck1hcmtlckFsbG93ZWQ6IGJhc2VQYXJhbXMuaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkLFxyXG5cclxuICAgICAgICAgICAgcGFyYW1zUGVyQ29tcG9uZW50OiBwYXJhbXNQZXJDb21wb25lbnQsXHJcbiAgICAgICAgICAgIGRlZmF1bHRDb21wb25lbnRQYXJhbXM6IGRlZmF1bHRDb21wb25lbnRQYXJhbXNcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGlsZVBhcmFtcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gcGFyc2VDb2RlYmxvY2tTaXplKGJ5dGVzLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgY29kZWJsb2NrU2l6ZUV4cG9uZW50TWludXMyID0gYnl0ZXNbb2Zmc2V0XTtcclxuICAgICAgICB2YXIgY29kZWJsb2NrU2l6ZUV4cG9uZW50ID0gMiArIChjb2RlYmxvY2tTaXplRXhwb25lbnRNaW51czIgJiAweDBGKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29kZWJsb2NrU2l6ZUV4cG9uZW50ID4gMTApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnSWxsZWdhbCBjb2RlYmxvY2sgd2lkdGggZXhwb25lbnQgJyArIGNvZGVibG9ja1NpemVFeHBvbmVudCxcclxuICAgICAgICAgICAgICAgICdBLjYuMSwgVGFibGUgQS4xOCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6ZSA9IDEgPDwgY29kZWJsb2NrU2l6ZUV4cG9uZW50O1xyXG4gICAgICAgIHJldHVybiBzaXplO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRCeXRlcyhkYXRhYmluLCBudW1CeXRlcywgZGF0YWJpblN0YXJ0T2Zmc2V0LCBhbGxvd0VuZE9mUmFuZ2UpIHtcclxuICAgICAgICB2YXIgYnl0ZXMgPSBbXTtcclxuXHJcbiAgICAgICAgdmFyIHJhbmdlT3B0aW9ucyA9IHtcclxuICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWUsXHJcbiAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogbnVtQnl0ZXMsXHJcbiAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogZGF0YWJpblN0YXJ0T2Zmc2V0XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gZGF0YWJpbi5jb3B5Qnl0ZXMoYnl0ZXMsIC8qc3RhcnRPZmZzZXQ9Ki8wLCByYW5nZU9wdGlvbnMpO1xyXG4gICAgICAgIGlmIChieXRlc0NvcGllZCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdIZWFkZXIgZGF0YS1iaW4gaGFzIG5vdCB5ZXQgcmVjaWV2ZWQgJyArIG51bUJ5dGVzICtcclxuICAgICAgICAgICAgICAgICcgYnl0ZXMgc3RhcnRpbmcgZnJvbSBvZmZzZXQgJyArIGRhdGFiaW5TdGFydE9mZnNldCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBieXRlcztcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBDaGFubmVsKFxyXG4gICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsIHNlc3Npb25IZWxwZXIsIGpwaXBGYWN0b3J5KSB7XHJcbiAgICBcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHZhciBjaGFubmVsSWQgPSBudWxsO1xyXG4gICAgdmFyIHJlcXVlc3RJZCA9IDA7XHJcbiAgICB2YXIgcmVxdWVzdHNXYWl0aW5nRm9yQ2hhbm5lbENyZWF0aW9uID0gW107XHJcbiAgICB2YXIgcmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UgPSBbXTtcclxuICAgIHZhciBpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0ID0gZmFsc2U7XHJcbiAgICBcclxuICAgIHRoaXMucmVxdWVzdERhdGEgPSBmdW5jdGlvbiByZXF1ZXN0RGF0YShcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICBmYWlsdXJlQ2FsbGJhY2ssXHJcbiAgICAgICAgbnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCkge1xyXG4gICAgICAgICAgICAvLyBObyBuZWVkIHRvIGNoZWNrIGlmIHRoZXJlIGFyZSB0b28gbWFueSBjb25jdXJyZW50IHJlcXVlc3RzXHJcbiAgICAgICAgICAgIC8vIGlmIGNoYW5uZWwgd2FzIGRlZGljYXRlZCBmb3IgbW92YWJsZSByZXF1ZXN0LiBUaGUgcmVhc29uIGlzXHJcbiAgICAgICAgICAgIC8vIHRoYXQgYW55IHJlcXVlc3QgaW4gZGVkaWNhdGVkIGNoYW5uZWwgY2FuY2VsIHRoZSBwcmV2aW91cyBvbmUuXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgYWxsV2FpdGluZ1JlcXVlc3RzID0gZ2V0QWxsUXVldWVkUmVxdWVzdENvdW50KCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYWxsV2FpdGluZ1JlcXVlc3RzID49IG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ2hhbm5lbCBoYXMgdG9vIG1hbnkgcmVxdWVzdHMgbm90IHJlc3BvbmRlZCB5ZXQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIHVybCA9IGNyZWF0ZVJlcXVlc3RVcmwoY29kZXN0cmVhbVBhcnRQYXJhbXMsIG51bVF1YWxpdHlMYXllcnMpO1xyXG4gICAgICAgIHZhciByZXF1ZXN0ID0ganBpcEZhY3RvcnkuY3JlYXRlUmVxdWVzdChcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlcixcclxuICAgICAgICAgICAgc2VsZixcclxuICAgICAgICAgICAgdXJsLFxyXG4gICAgICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbElkICE9PSBudWxsIHx8IHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZS5wdXNoKHJlcXVlc3QpO1xyXG4gICAgICAgICAgICByZXF1ZXN0LnN0YXJ0UmVxdWVzdCgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCkge1xyXG4gICAgICAgICAgICAvLyBUaG9zZSByZXF1ZXN0cyBjYW5jZWwgYWxsIHByZXZpb3VzIHJlcXVlc3RzIGluIGNoYW5uZWwsIHNvIG5vXHJcbiAgICAgICAgICAgIC8vIG5lZWQgdG8gbG9nIG9sZCByZXF1ZXN0c1xyXG4gICAgICAgICAgICByZXF1ZXN0c1dhaXRpbmdGb3JDaGFubmVsQ3JlYXRpb24gPSBbcmVxdWVzdF07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmVxdWVzdHNXYWl0aW5nRm9yQ2hhbm5lbENyZWF0aW9uLnB1c2gocmVxdWVzdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5zZW5kTWluaW1hbFJlcXVlc3QgPSBmdW5jdGlvbiBzZW5kTWluaW1hbFJlcXVlc3QoY2FsbGJhY2spIHtcclxuICAgICAgICBpZiAoY2hhbm5lbElkID09PSBudWxsICYmIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnTWluaW1hbCByZXF1ZXN0cyBzaG91bGQgYmUgdXNlZCBmb3IgZmlyc3QgcmVxdWVzdCBvciBrZWVwICcgK1xyXG4gICAgICAgICAgICAgICAgJ2FsaXZlIG1lc3NhZ2UuIEtlZXAgYWxpdmUgcmVxdWlyZXMgYW4gYWxyZWFkeSBpbml0aWFsaXplZCAnICtcclxuICAgICAgICAgICAgICAgICdjaGFubmVsLCBhbmQgZmlyc3QgcmVxdWVzdCByZXF1aXJlcyB0byBub3QgaGF2ZSBhbnkgJyArXHJcbiAgICAgICAgICAgICAgICAncHJldmlvdXMgcmVxdWVzdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdXJsID0gY3JlYXRlTWluaW1hbFJlcXVlc3RVcmwoKTtcclxuICAgICAgICB2YXIgcmVxdWVzdCA9IGpwaXBGYWN0b3J5LmNyZWF0ZVJlcXVlc3QoXHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIsIHNlbGYsIHVybCwgY2FsbGJhY2spO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLnB1c2gocmVxdWVzdCk7XHJcbiAgICAgICAgcmVxdWVzdC5zdGFydFJlcXVlc3QoKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCgpIHtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdCA9IGZ1bmN0aW9uIGRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3QoKSB7XHJcbiAgICAgICAgaWYgKGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ2hhbm5lbCBhbHJlYWR5IGRlZGljYXRlZCBmb3IgbW92YWJsZSByZXF1ZXN0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QgPSB0cnVlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRDaGFubmVsSWQgPSBmdW5jdGlvbiBnZXRDaGFubmVsSWQoKSB7XHJcbiAgICAgICAgcmV0dXJuIGNoYW5uZWxJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2V0Q2hhbm5lbElkID0gZnVuY3Rpb24gc2V0Q2hhbm5lbElkKG5ld0NoYW5uZWxJZCkge1xyXG4gICAgICAgIGlmIChuZXdDaGFubmVsSWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjaGFubmVsSWQgPSBuZXdDaGFubmVsSWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlcXVlc3RzVG9TZW5kID0gcmVxdWVzdHNXYWl0aW5nRm9yQ2hhbm5lbENyZWF0aW9uO1xyXG4gICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbiA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVxdWVzdHNUb1NlbmQubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgcmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UucHVzaChyZXF1ZXN0c1RvU2VuZFtpXSk7XHJcbiAgICAgICAgICAgIHJlcXVlc3RzVG9TZW5kW2ldLnN0YXJ0UmVxdWVzdCgpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMubmV4dFJlcXVlc3RJZCA9IGZ1bmN0aW9uIG5leHRSZXF1ZXN0SWQoKSB7XHJcbiAgICAgICAgcmV0dXJuICsrcmVxdWVzdElkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRSZXF1ZXN0c1dhaXRpbmdGb3JSZXNwb25zZSA9XHJcbiAgICAgICAgZnVuY3Rpb24gZ2V0UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRBbGxRdWV1ZWRSZXF1ZXN0Q291bnQgPSBnZXRBbGxRdWV1ZWRSZXF1ZXN0Q291bnQ7XHJcbiAgICBcclxuICAgIHRoaXMucmVxdWVzdEVuZGVkID0gZnVuY3Rpb24gcmVxdWVzdEVuZGVkKGFqYXhSZXNwb25zZSwgcmVxdWVzdCkge1xyXG4gICAgICAgIHZhciByZXF1ZXN0cyA9IHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlO1xyXG4gICAgICAgIHZhciBpc0ZvdW5kID0gZmFsc2U7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZXF1ZXN0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBpZiAocmVxdWVzdHNbaV0gPT09IHJlcXVlc3QpIHtcclxuICAgICAgICAgICAgICAgIHJlcXVlc3RzW2ldID0gcmVxdWVzdHNbcmVxdWVzdHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0cy5sZW5ndGggLT0gMTtcclxuICAgICAgICAgICAgICAgIGlzRm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFpc0ZvdW5kKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ2NoYW5uZWwucmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UgaW5jb25zaXN0ZW5jeScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyLnJlcXVlc3RFbmRlZChhamF4UmVzcG9uc2UsIHNlbGYpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjaGFubmVsSWQgPT09IG51bGwgJiYgcmVxdWVzdHNXYWl0aW5nRm9yQ2hhbm5lbENyZWF0aW9uLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgLy8gSWYgbm90IHN1Y2NlZWRlZCB0byBjcmVhdGUgYSBjaGFubmVsIElEIHlldCxcclxuICAgICAgICAgICAgLy8gcGVyZm9ybSBhbiBhZGRpdGlvbmFsIHJlcXVlc3RcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXh0UmVxdWVzdCA9IHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbi5zaGlmdCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UucHVzaChuZXh0UmVxdWVzdCk7XHJcbiAgICAgICAgICAgIG5leHRSZXF1ZXN0LnN0YXJ0UmVxdWVzdCgpO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuaXNBbGxPbGRSZXF1ZXN0c0VuZGVkID0gZnVuY3Rpb24gaXNBbGxPbGRSZXF1ZXN0c0VuZGVkKHByaW9yVG9JZCkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgaWYgKHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlW2ldLmxhc3RSZXF1ZXN0SWQgPD0gcHJpb3JUb0lkKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRBbGxRdWV1ZWRSZXF1ZXN0Q291bnQoKSB7XHJcbiAgICAgICAgdmFyIGFsbFdhaXRpbmdSZXF1ZXN0cyA9XHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlLmxlbmd0aCArXHJcbiAgICAgICAgICAgIHJlcXVlc3RzV2FpdGluZ0ZvckNoYW5uZWxDcmVhdGlvbi5sZW5ndGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGFsbFdhaXRpbmdSZXF1ZXN0cztcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlTWluaW1hbFJlcXVlc3RVcmwoYWxsb3dTdG9wUHJldmlvdXNSZXF1ZXN0c0luQ2hhbm5lbCkge1xyXG4gICAgICAgIHZhciByZXF1ZXN0VXJsID0gc2Vzc2lvbkhlbHBlci5nZXREYXRhUmVxdWVzdFVybCgpO1xyXG4gICAgICAgIHZhciB0YXJnZXRJZCA9IHNlc3Npb25IZWxwZXIuZ2V0VGFyZ2V0SWQoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGFyZ2V0SWQgIT09ICcwJykge1xyXG4gICAgICAgICAgICByZXF1ZXN0VXJsICs9ICcmdGlkPScgKyB0YXJnZXRJZDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGFscmVhZHlTZW50TWVzc2FnZXNPbkNoYW5uZWwgPSBjaGFubmVsSWQgIT09IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGFscmVhZHlTZW50TWVzc2FnZXNPbkNoYW5uZWwpIHtcclxuICAgICAgICAgICAgdmFyIGlzU3RvcFByZXZpb3VzID1cclxuICAgICAgICAgICAgICAgIGlzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QgJiZcclxuICAgICAgICAgICAgICAgIGFsbG93U3RvcFByZXZpb3VzUmVxdWVzdHNJbkNoYW5uZWw7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaXNTdG9wUHJldmlvdXMpIHtcclxuICAgICAgICAgICAgICAgIHJlcXVlc3RVcmwgKz0gJyZ3YWl0PW5vJztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHJlcXVlc3RVcmwgKz0gJyZ3YWl0PXllcyc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RVcmw7XHJcbiAgICB9XHJcbiAgICAgICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVSZXF1ZXN0VXJsKGNvZGVzdHJlYW1QYXJ0UGFyYW1zLCBudW1RdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgdmFyIHJlcXVlc3RVcmwgPSBjcmVhdGVNaW5pbWFsUmVxdWVzdFVybChcclxuICAgICAgICAgICAgLyphbGxvd1N0b3BQcmV2aW91c1JlcXVlc3RzSW5DaGFubmVsPSovdHJ1ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGVzdHJlYW1TdHJ1Y3R1cmUgPSBzZXNzaW9uSGVscGVyLmdldENvZGVzdHJlYW1TdHJ1Y3R1cmUoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZnJhbWVXaWR0aCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxXaWR0aChcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubGV2ZWwpO1xyXG4gICAgICAgIHZhciBmcmFtZUhlaWdodCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TGV2ZWxIZWlnaHQoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLmxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVnaW9uV2lkdGggPVxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlIC0gY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWDtcclxuICAgICAgICB2YXIgcmVnaW9uSGVpZ2h0ID1cclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSAtIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLm1pblk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVxdWVzdFVybCArPVxyXG4gICAgICAgICAgICAnJmZzaXo9JyArIGZyYW1lV2lkdGggKyAnLCcgKyBmcmFtZUhlaWdodCArICcsY2xvc2VzdCcgK1xyXG4gICAgICAgICAgICAnJnJzaXo9JyArIHJlZ2lvbldpZHRoICsgJywnICsgcmVnaW9uSGVpZ2h0ICtcclxuICAgICAgICAgICAgJyZyb2ZmPScgKyBjb2Rlc3RyZWFtUGFydFBhcmFtcy5taW5YICsgJywnICsgY29kZXN0cmVhbVBhcnRQYXJhbXMubWluWTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKG51bVF1YWxpdHlMYXllcnMgIT09ICdtYXgnKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RVcmwgKz0gJyZsYXllcnM9JyArIG51bVF1YWxpdHlMYXllcnM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXF1ZXN0VXJsO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbnZhciBqcGlwTWVzc2FnZUhlYWRlclBhcnNlciA9IHtcclxuICAgICAgICBcclxuICAgIExTQl9NQVNLOiAweDEsXHJcbiAgICBCSVRfNF9NQVNLOiAweDEwLFxyXG4gICAgQklUU181Nl9NQVNLOiAweDYwLFxyXG4gICAgTVNCX01BU0s6IDB4ODAsXHJcblxyXG4gICAgTFNCXzdfTUFTSzogMHg3RixcclxuXHJcbiAgICAvLyBBLjIuMVxyXG4gICAgcGFyc2VOdW1iZXJJblZiYXM6IGZ1bmN0aW9uIHBhcnNlTnVtYmVySW5WYmFzQ2xvc3VyZShcclxuICAgICAgICBtZXNzYWdlLCBzdGFydE9mZnNldCwgYml0c1RvVGFrZUluRmlyc3RCeXRlKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNlbGYgPSBqcGlwTWVzc2FnZUhlYWRlclBhcnNlcjtcclxuICAgICAgICB2YXIgY3VycmVudE9mZnNldCA9IHN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQ7XHJcbiAgICAgICAgaWYgKGJpdHNUb1Rha2VJbkZpcnN0Qnl0ZSkge1xyXG4gICAgICAgICAgICB2YXIgbWFza0ZpcnN0Qnl0ZSA9ICgxIDw8IGJpdHNUb1Rha2VJbkZpcnN0Qnl0ZSkgLSAxO1xyXG4gICAgICAgICAgICByZXN1bHQgPSBtZXNzYWdlW2N1cnJlbnRPZmZzZXRdICYgbWFza0ZpcnN0Qnl0ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdCA9IG1lc3NhZ2VbY3VycmVudE9mZnNldF0gJiBzZWxmLkxTQl83X01BU0s7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlICggISEobWVzc2FnZVtjdXJyZW50T2Zmc2V0XSAmIHNlbGYuTVNCX01BU0spICkge1xyXG4gICAgICAgICAgICArK2N1cnJlbnRPZmZzZXQ7XHJcblxyXG4gICAgICAgICAgICByZXN1bHQgPDw9IDc7XHJcbiAgICAgICAgICAgIHJlc3VsdCB8PSBtZXNzYWdlW2N1cnJlbnRPZmZzZXRdICYgc2VsZi5MU0JfN19NQVNLO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBlbmRPZmZzZXQ6IGN1cnJlbnRPZmZzZXQgKyAxLFxyXG4gICAgICAgICAgICBudW1iZXI6IHJlc3VsdFxyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICAvLyBBLjJcclxuICAgIHBhcnNlTWVzc2FnZUhlYWRlcjogZnVuY3Rpb24gcGFyc2VNZXNzYWdlSGVhZGVyQ2xvc3VyZShcclxuICAgICAgICBtZXNzYWdlLCBzdGFydE9mZnNldCwgcHJldmlvdXNNZXNzYWdlSGVhZGVyKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNlbGYgPSBqcGlwTWVzc2FnZUhlYWRlclBhcnNlcjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBLjIuMVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEZpcnN0IFZiYXM6IEJpbi1JRFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjbGFzc0FuZENzblByZWNlbnNlID0gKG1lc3NhZ2Vbc3RhcnRPZmZzZXRdICYgc2VsZi5CSVRTXzU2X01BU0spID4+PiA1O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjbGFzc0FuZENzblByZWNlbnNlID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5QYXJzZUV4Y2VwdGlvbignRmFpbGVkIHBhcnNpbmcgbWVzc2FnZSBoZWFkZXIgJyArXHJcbiAgICAgICAgICAgICAgICAnKEEuMi4xKTogcHJvaGliaXRlZCBleGlzdGFuY2UgY2xhc3MgYW5kIGNzbiBiaXRzIDAwJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBoYXNDbGFzc1ZiYXMgPSAhIShjbGFzc0FuZENzblByZWNlbnNlICYgMHgyKTtcclxuICAgICAgICB2YXIgaGFzQ29kZVN0cmVhbUluZGV4VmJhcyA9IGNsYXNzQW5kQ3NuUHJlY2Vuc2UgPT09IDM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzTGFzdEJ5dGVJbkRhdGFiaW4gPSAhIShtZXNzYWdlW3N0YXJ0T2Zmc2V0XSAmIHNlbGYuQklUXzRfTUFTSyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQS4yLjNcclxuICAgICAgICB2YXIgcGFyc2VkSW5DbGFzc0lkID0gc2VsZi5wYXJzZU51bWJlckluVmJhcyhcclxuICAgICAgICAgICAgbWVzc2FnZSwgc3RhcnRPZmZzZXQsIC8qYml0c1RvVGFrZUluRmlyc3RCeXRlPSovNCk7XHJcbiAgICAgICAgdmFyIGluQ2xhc3NJZCA9IHBhcnNlZEluQ2xhc3NJZC5udW1iZXI7XHJcbiAgICAgICAgdmFyIGN1cnJlbnRPZmZzZXQgPSBwYXJzZWRJbkNsYXNzSWQuZW5kT2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNlY29uZCBvcHRpb25hbCBWYmFzOiBDbGFzcyBJRFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjbGFzc0lkID0gMDtcclxuICAgICAgICBpZiAoaGFzQ2xhc3NWYmFzKSB7XHJcbiAgICAgICAgICAgIHZhciBwYXJzZWRDbGFzc0lkID0gc2VsZi5wYXJzZU51bWJlckluVmJhcyhtZXNzYWdlLCBjdXJyZW50T2Zmc2V0KTtcclxuICAgICAgICAgICAgY2xhc3NJZCA9IHBhcnNlZENsYXNzSWQubnVtYmVyO1xyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkQ2xhc3NJZC5lbmRPZmZzZXQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKHByZXZpb3VzTWVzc2FnZUhlYWRlcikge1xyXG4gICAgICAgICAgICBjbGFzc0lkID0gcHJldmlvdXNNZXNzYWdlSGVhZGVyLmNsYXNzSWQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoaXJkIG9wdGlvbmFsIFZiYXM6IENvZGUgU3RyZWFtIEluZGV4IChDc24pXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGVzdHJlYW1JbmRleCA9IDA7XHJcbiAgICAgICAgaWYgKGhhc0NvZGVTdHJlYW1JbmRleFZiYXMpIHtcclxuICAgICAgICAgICAgdmFyIHBhcnNlZENzbiA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMobWVzc2FnZSwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1JbmRleCA9IHBhcnNlZENzbi5udW1iZXI7XHJcbiAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQgPSBwYXJzZWRDc24uZW5kT2Zmc2V0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChwcmV2aW91c01lc3NhZ2VIZWFkZXIpIHtcclxuICAgICAgICAgICAgY29kZXN0cmVhbUluZGV4ID0gcHJldmlvdXNNZXNzYWdlSGVhZGVyLmNvZGVzdHJlYW1JbmRleDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gNHRoIFZiYXM6IE1lc3NhZ2Ugb2Zmc2V0XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHBhcnNlZE9mZnNldCA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMobWVzc2FnZSwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgdmFyIG1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0ID0gcGFyc2VkT2Zmc2V0Lm51bWJlcjtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkT2Zmc2V0LmVuZE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICAvLyA1dGggVmJhczogTWVzc2FnZSBsZW5ndGhcclxuXHJcbiAgICAgICAgdmFyIHBhcnNlZExlbmd0aCA9IHNlbGYucGFyc2VOdW1iZXJJblZiYXMobWVzc2FnZSwgY3VycmVudE9mZnNldCk7XHJcbiAgICAgICAgdmFyIG1lc3NhZ2VCb2R5TGVuZ3RoID0gcGFyc2VkTGVuZ3RoLm51bWJlcjtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkTGVuZ3RoLmVuZE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICAvLyA2dGggb3B0aW9uYWwgVmJhczogQXV4XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQS4yLjJcclxuICAgICAgICB2YXIgaGFzQXV4VmJhcyA9ICEhKGNsYXNzSWQgJiBzZWxmLkxTQl9NQVNLKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYXV4O1xyXG4gICAgICAgIGlmIChoYXNBdXhWYmFzKSB7XHJcbiAgICAgICAgICAgIHZhciBwYXJzZWRBdXggPSBzZWxmLnBhcnNlTnVtYmVySW5WYmFzKG1lc3NhZ2UsIGN1cnJlbnRPZmZzZXQpO1xyXG4gICAgICAgICAgICBhdXggPSBwYXJzZWRBdXgubnVtYmVyO1xyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ID0gcGFyc2VkQXV4LmVuZE9mZnNldDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUmV0dXJuXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgaXNMYXN0Qnl0ZUluRGF0YWJpbjogaXNMYXN0Qnl0ZUluRGF0YWJpbixcclxuICAgICAgICAgICAgaW5DbGFzc0lkOiBpbkNsYXNzSWQsXHJcbiAgICAgICAgICAgIGJvZHlTdGFydDogY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgY2xhc3NJZDogY2xhc3NJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbUluZGV4OiBjb2Rlc3RyZWFtSW5kZXgsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VPZmZzZXRGcm9tRGF0YWJpblN0YXJ0OiBtZXNzYWdlT2Zmc2V0RnJvbURhdGFiaW5TdGFydCxcclxuICAgICAgICAgICAgbWVzc2FnZUJvZHlMZW5ndGg6IG1lc3NhZ2VCb2R5TGVuZ3RoXHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaGFzQXV4VmJhcykge1xyXG4gICAgICAgICAgICByZXN1bHQuYXV4ID0gYXV4O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgZ2V0SW50MzI6IGZ1bmN0aW9uIGdldEludDMyQ2xvc3VyZShkYXRhLCBvZmZzZXQpIHtcclxuICAgICAgICB2YXIgbXNiID0gZGF0YVtvZmZzZXRdICogTWF0aC5wb3coMiwgMjQpOyAvLyBBdm9pZCBuZWdhdGl2ZSByZXN1bHQgZHVlIHRvIHNpZ25lZCBjYWxjdWxhdGlvblxyXG4gICAgICAgIHZhciBieXRlMiA9IGRhdGFbb2Zmc2V0ICsgMV0gPDwgMTY7XHJcbiAgICAgICAgdmFyIGJ5dGUxID0gZGF0YVtvZmZzZXQgKyAyXSA8PCA4O1xyXG4gICAgICAgIHZhciBsc2IgPSBkYXRhW29mZnNldCArIDNdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSBtc2IgKyBieXRlMiArIGJ5dGUxICsgbHNiO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBnZXRJbnQxNjogZnVuY3Rpb24gZ2V0SW50MTZDbG9zdXJlKGRhdGEsIG9mZnNldCkge1xyXG4gICAgICAgIHZhciBtc2IgPSBkYXRhW29mZnNldF0gPDwgODtcclxuICAgICAgICB2YXIgbHNiID0gZGF0YVtvZmZzZXQgKyAxXTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbXNiICsgbHNiO1xyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGpwaXBNZXNzYWdlSGVhZGVyUGFyc2VyOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcFJlY29ubmVjdGFibGVSZXF1ZXN0ZXIoXHJcbiAgICBtYXhDaGFubmVsc0luU2Vzc2lvbixcclxuICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLCBcclxuICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsXHJcbiAgICBkYXRhYmluc1NhdmVyLFxyXG4gICAganBpcEZhY3RvcnksXHJcbiAgICAvLyBOT1RFOiBNb3ZlIHBhcmFtZXRlciB0byBiZWdpbm5pbmcgYW5kIGV4cG9zZSBpbiBDb2Rlc3RyZWFtQ2xpZW50XHJcbiAgICBtYXhKcGlwQ2FjaGVTaXplQ29uZmlnKSB7XHJcbiAgICBcclxuICAgIHZhciBNQiA9IDEwNDg1NzY7XHJcbiAgICB2YXIgbWF4SnBpcENhY2hlU2l6ZSA9IG1heEpwaXBDYWNoZVNpemVDb25maWcgfHwgKDEwICogTUIpO1xyXG4gICAgXHJcbiAgICB2YXIgc2Vzc2lvbldhaXRpbmdGb3JSZWFkeTtcclxuICAgIHZhciBhY3RpdmVTZXNzaW9uID0gbnVsbDtcclxuICAgIHZhciBzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QgPSBudWxsO1xyXG4gICAgXHJcbiAgICB2YXIgdXJsID0gbnVsbDtcclxuICAgIHZhciB3YWl0aW5nRm9yQ2xvc2VTZXNzaW9ucyA9IDA7XHJcbiAgICBcclxuICAgIHZhciBub25EZWRpY2F0ZWRSZXF1ZXN0c1dhaXRpbmdGb3JTZW5kID0gW107XHJcbiAgICB2YXIgZGVkaWNhdGVkQ2hhbm5lbHMgPSBbXTtcclxuICAgIFxyXG4gICAgdmFyIHN0YXR1c0NhbGxiYWNrID0gbnVsbDtcclxuICAgIHZhciBsYXN0Q2xvc2VkQ2FsbGJhY2sgPSBudWxsO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldElzUmVhZHkgPSBmdW5jdGlvbiBnZXRJc1JlYWR5KCkge1xyXG4gICAgICAgIHJldHVybiBhY3RpdmVTZXNzaW9uICE9PSBudWxsICYmIGFjdGl2ZVNlc3Npb24uZ2V0SXNSZWFkeSgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5vcGVuID0gZnVuY3Rpb24gb3BlbihiYXNlVXJsKSB7XHJcbiAgICAgICAgaWYgKGJhc2VVcmwgPT09IHVuZGVmaW5lZCB8fCBiYXNlVXJsID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5Bcmd1bWVudEV4Y2VwdGlvbignYmFzZVVybCcsIGJhc2VVcmwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAodXJsICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0ltYWdlIHdhcyBhbHJlYWR5IG9wZW5lZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB1cmwgPSBiYXNlVXJsO1xyXG4gICAgICAgIGNyZWF0ZUludGVybmFsU2Vzc2lvbigpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5jbG9zZSA9IGZ1bmN0aW9uIGNsb3NlKGNsb3NlZENhbGxiYWNrKSB7XHJcbiAgICAgICAgaWYgKGxhc3RDbG9zZWRDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbignY2xvc2VkIHR3aWNlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGxhc3RDbG9zZWRDYWxsYmFjayA9IGNsb3NlZENhbGxiYWNrO1xyXG4gICAgICAgIHdhaXRpbmdGb3JDbG9zZVNlc3Npb25zID0gMTtcclxuICAgICAgICBcclxuICAgICAgICBjbG9zZUludGVybmFsU2Vzc2lvbihhY3RpdmVTZXNzaW9uKTtcclxuICAgICAgICBjbG9zZUludGVybmFsU2Vzc2lvbihzZXNzaW9uV2FpdGluZ0ZvclJlYWR5KTtcclxuICAgICAgICBjbG9zZUludGVybmFsU2Vzc2lvbihzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNoZWNrSWZBbGxTZXNzaW9uc0Nsb3NlZEFmdGVyU2Vzc2lvbkNsb3NlZCgpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNldFN0YXR1c0NhbGxiYWNrID0gZnVuY3Rpb24gc2V0U3RhdHVzQ2FsbGJhY2sobmV3U3RhdHVzQ2FsbGJhY2spIHtcclxuICAgICAgICBzdGF0dXNDYWxsYmFjayA9IG5ld1N0YXR1c0NhbGxiYWNrO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhY3RpdmVTZXNzaW9uICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGFjdGl2ZVNlc3Npb24uc2V0U3RhdHVzQ2FsbGJhY2sobmV3U3RhdHVzQ2FsbGJhY2spO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZGVkaWNhdGVDaGFubmVsRm9yTW92YWJsZVJlcXVlc3QgPVxyXG4gICAgICAgIGZ1bmN0aW9uIGRlZGljYXRlQ2hhbm5lbEZvck1vdmFibGVSZXF1ZXN0KCkge1xyXG5cclxuICAgICAgICBjaGVja1JlYWR5KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGRlZGljYXRlZENoYW5uZWxIYW5kbGUgPSB7IGludGVybmFsRGVkaWNhdGVkQ2hhbm5lbDogbnVsbCB9O1xyXG4gICAgICAgIGRlZGljYXRlZENoYW5uZWxzLnB1c2goZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSk7XHJcbiAgICAgICAgY3JlYXRlSW50ZXJuYWxEZWRpY2F0ZWRDaGFubmVsKGRlZGljYXRlZENoYW5uZWxIYW5kbGUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBkZWRpY2F0ZWRDaGFubmVsSGFuZGxlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5yZXF1ZXN0RGF0YSA9IGZ1bmN0aW9uIHJlcXVlc3REYXRhKFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIGNhbGxiYWNrLFxyXG4gICAgICAgIGZhaWx1cmVDYWxsYmFjayxcclxuICAgICAgICBudW1RdWFsaXR5TGF5ZXJzLFxyXG4gICAgICAgIGRlZGljYXRlZENoYW5uZWxIYW5kbGVUb01vdmUpIHtcclxuXHJcbiAgICAgICAgY2hlY2tSZWFkeSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXF1ZXN0ID0ge1xyXG4gICAgICAgICAgICBpc0VuZGVkOiBmYWxzZSxcclxuICAgICAgICAgICAgaW50ZXJuYWxSZXF1ZXN0OiBudWxsLFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXM6IGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICBjYWxsYmFjazogY2FsbGJhY2ssXHJcbiAgICAgICAgICAgIGZhaWx1cmVDYWxsYmFjazogZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzOiBudW1RdWFsaXR5TGF5ZXJzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNoYW5uZWw7XHJcbiAgICAgICAgdmFyIG1vdmVEZWRpY2F0ZWRDaGFubmVsID0gISFkZWRpY2F0ZWRDaGFubmVsSGFuZGxlVG9Nb3ZlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtb3ZlRGVkaWNhdGVkQ2hhbm5lbCkge1xyXG4gICAgICAgICAgICBjaGFubmVsID0gZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZVRvTW92ZS5pbnRlcm5hbERlZGljYXRlZENoYW5uZWw7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY2hhbm5lbCA9IGFjdGl2ZVNlc3Npb24udHJ5R2V0Q2hhbm5lbCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGNoYW5uZWwgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIG5vbkRlZGljYXRlZFJlcXVlc3RzV2FpdGluZ0ZvclNlbmQucHVzaChyZXF1ZXN0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXF1ZXN0O1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoYW5uZWwuZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCgpKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnRXhwZWN0ZWQgbm9uLW1vdmFibGUgY2hhbm5lbCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjaGFubmVsLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSAhPT0gbW92ZURlZGljYXRlZENoYW5uZWwpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCBpbmNvbnNpc3RlbmN5Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXF1ZXN0LmludGVybmFsUmVxdWVzdCA9IGNoYW5uZWwucmVxdWVzdERhdGEoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICBjYWxsYmFjayxcclxuICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlcXVlc3Q7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnN0b3BSZXF1ZXN0QXN5bmMgPSBmdW5jdGlvbiBzdG9wUmVxdWVzdEFzeW5jKHJlcXVlc3QpIHtcclxuICAgICAgICByZXF1ZXN0LmlzRW5kZWQgPSB0cnVlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChyZXF1ZXN0LmludGVybmFsUmVxdWVzdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXF1ZXN0LmludGVybmFsUmVxdWVzdC5zdG9wUmVxdWVzdEFzeW5jKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5yZWNvbm5lY3QgPSByZWNvbm5lY3Q7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHJlY29ubmVjdCgpIHtcclxuICAgICAgICBpZiAoc2Vzc2lvbldhaXRpbmdGb3JSZWFkeSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdQcmV2aW91cyBzZXNzaW9uIHN0aWxsIG5vdCBlc3RhYmxpc2hlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGlmIChzdGF0dXNDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgc3RhdHVzQ2FsbGJhY2soe1xyXG4gICAgICAgICAgICAgICAgICAgIGlzUmVhZHk6IHRydWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZXhjZXB0aW9uOiAvL2pwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdQcmV2aW91cyBzZXNzaW9uIHRoYXQgc2hvdWxkIGJlIGNsb3NlZCBzdGlsbCBhbGl2ZS4nICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ01heWJlIG9sZCByZXF1ZXN0Q29udGV4dHMgaGF2ZSBub3QgYmVlZCBjbG9zZWQuICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnUmVjb25uZWN0IHdpbGwgbm90IGJlIGRvbmUnIC8vKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBkYXRhYmluc1NhdmVyLmNsZWFudXBVbnJlZ2lzdGVyZWREYXRhYmlucygpO1xyXG4gICAgICAgIGNyZWF0ZUludGVybmFsU2Vzc2lvbigpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVJbnRlcm5hbFNlc3Npb24oKSB7XHJcbiAgICAgICAgdmFyIHRhcmdldElkO1xyXG4gICAgICAgIGlmIChhY3RpdmVTZXNzaW9uICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRhcmdldElkID0gYWN0aXZlU2Vzc2lvbi5nZXRUYXJnZXRJZCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uV2FpdGluZ0ZvclJlYWR5ID0ganBpcEZhY3RvcnkuY3JlYXRlU2Vzc2lvbihcclxuICAgICAgICAgICAgbWF4Q2hhbm5lbHNJblNlc3Npb24sXHJcbiAgICAgICAgICAgIG1heFJlcXVlc3RzV2FpdGluZ0ZvclJlc3BvbnNlSW5DaGFubmVsLFxyXG4gICAgICAgICAgICB0YXJnZXRJZCxcclxuICAgICAgICAgICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgZGF0YWJpbnNTYXZlcik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHNlc3Npb25XYWl0aW5nRm9yUmVhZHkuc2V0U3RhdHVzQ2FsbGJhY2sod2FpdGluZ0ZvclJlYWR5Q2FsbGJhY2spO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlc3Npb25XYWl0aW5nRm9yUmVhZHkub3Blbih1cmwpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVJbnRlcm5hbERlZGljYXRlZENoYW5uZWwoZGVkaWNhdGVkQ2hhbm5lbEhhbmRsZSkge1xyXG4gICAgICAgIHZhciBjaGFubmVsID0gYWN0aXZlU2Vzc2lvbi50cnlHZXRDaGFubmVsKFxyXG4gICAgICAgICAgICAvKmRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3Q9Ki90cnVlKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbE9wZXJhdGlvbkV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdUb28gbWFueSBjb25jdXJyZW50IHJlcXVlc3RzLiBMaW1pdCB0aGUgdXNlIG9mIGRlZGljYXRlZCAnICtcclxuICAgICAgICAgICAgICAgICcobW92YWJsZSkgcmVxdWVzdHMsIGVubGFyZ2UgbWF4Q2hhbm5lbHNJblNlc3Npb24gb3Igd2FpdCAnICtcclxuICAgICAgICAgICAgICAgICdmb3IgcmVxdWVzdHMgdG8gZmluaXNoIGFuZCBhdm9pZCBjcmVhdGUgbmV3IG9uZXMnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFjaGFubmVsLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdnZXRJc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0IGluY29uc2lzdGVuY3knKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRlZGljYXRlZENoYW5uZWxIYW5kbGUuaW50ZXJuYWxEZWRpY2F0ZWRDaGFubmVsID0gY2hhbm5lbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gd2FpdGluZ0ZvclJlYWR5Q2FsbGJhY2soc3RhdHVzKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb25XYWl0aW5nRm9yUmVhZHkgPT09IG51bGwgfHxcclxuICAgICAgICAgICAgc3RhdHVzLmlzUmVhZHkgIT09IHNlc3Npb25XYWl0aW5nRm9yUmVhZHkuZ2V0SXNSZWFkeSgpKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVW5leHBlY3RlZCAnICtcclxuICAgICAgICAgICAgICAgICdzdGF0dXNDYWxsYmFjayB3aGVuIG5vdCByZWdpc3RlcmVkIHRvIHNlc3Npb24gb3IgJyArXHJcbiAgICAgICAgICAgICAgICAnaW5jb25zaXN0ZW50IGlzUmVhZHknKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHN0YXR1cy5pc1JlYWR5KSB7XHJcbiAgICAgICAgICAgIGlmIChzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3QgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdzZXNzaW9uV2FpdGluZ0ZvckRpc2Nvbm5lY3Qgc2hvdWxkIGJlIG51bGwnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0ID0gYWN0aXZlU2Vzc2lvbjtcclxuICAgICAgICAgICAgYWN0aXZlU2Vzc2lvbiA9IHNlc3Npb25XYWl0aW5nRm9yUmVhZHk7XHJcbiAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yUmVhZHkgPSBudWxsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0LnNldFN0YXR1c0NhbGxiYWNrKG51bGwpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0cnlEaXNjb25uZWN0V2FpdGluZ1Nlc3Npb24oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdC5zZXRSZXF1ZXN0RW5kZWRDYWxsYmFjayhcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5RGlzY29ubmVjdFdhaXRpbmdTZXNzaW9uKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYWN0aXZlU2Vzc2lvbi5zZXRTdGF0dXNDYWxsYmFjayhzdGF0dXNDYWxsYmFjayk7XHJcbiAgICAgICAgICAgIGFjdGl2ZVNlc3Npb24uc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2soYWN0aXZlU2Vzc2lvblJlcXVlc3RFbmRlZENhbGxiYWNrKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVkaWNhdGVkQ2hhbm5lbHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGNyZWF0ZUludGVybmFsRGVkaWNhdGVkQ2hhbm5lbChkZWRpY2F0ZWRDaGFubmVsc1tpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHN0YXR1c0NhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHN0YXR1c0NhbGxiYWNrKHN0YXR1cyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjbG9zZUludGVybmFsU2Vzc2lvbihzZXNzaW9uKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb24gIT09IG51bGwpIHtcclxuICAgICAgICAgICAgKyt3YWl0aW5nRm9yQ2xvc2VTZXNzaW9ucztcclxuICAgICAgICAgICAgc2Vzc2lvbi5jbG9zZShjaGVja0lmQWxsU2Vzc2lvbnNDbG9zZWRBZnRlclNlc3Npb25DbG9zZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tJZkFsbFNlc3Npb25zQ2xvc2VkQWZ0ZXJTZXNzaW9uQ2xvc2VkKCkge1xyXG4gICAgICAgIC0td2FpdGluZ0ZvckNsb3NlU2Vzc2lvbnM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHdhaXRpbmdGb3JDbG9zZVNlc3Npb25zID09PSAwICYmIGxhc3RDbG9zZWRDYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGxhc3RDbG9zZWRDYWxsYmFjaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY2hlY2tSZWFkeSgpIHtcclxuICAgICAgICBpZiAoYWN0aXZlU2Vzc2lvbiA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignVGhpcyBvcGVyYXRpb24gJyArXHJcbiAgICAgICAgICAgICAgICAnaXMgZm9yYmlkZGVuIHdoZW4gc2Vzc2lvbiBpcyBub3QgcmVhZHknKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGFjdGl2ZVNlc3Npb25SZXF1ZXN0RW5kZWRDYWxsYmFjayhjaGFubmVsRnJlZWQpIHtcclxuICAgICAgICB2YXIgcmVxdWVzdCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGRhdGFiaW5zU2F2ZXIuZ2V0TG9hZGVkQnl0ZXMoKSA+IG1heEpwaXBDYWNoZVNpemUpIHtcclxuICAgICAgICAgICAgcmVjb25uZWN0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjaGFubmVsRnJlZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbEZyZWVkLmdldElzRGVkaWNhdGVkRm9yTW92YWJsZVJlcXVlc3QoKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdFeHBlY3RlZCBub24tbW92YWJsZSBjaGFubmVsIGFzIGNoYW5uZWxGcmVlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIGlmIChub25EZWRpY2F0ZWRSZXF1ZXN0c1dhaXRpbmdGb3JTZW5kLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVxdWVzdCA9IG5vbkRlZGljYXRlZFJlcXVlc3RzV2FpdGluZ0ZvclNlbmQuc2hpZnQoKTtcclxuICAgICAgICAgICAgaWYgKHJlcXVlc3QuaW50ZXJuYWxSZXF1ZXN0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbignUmVxdWVzdCB3YXMgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgJ2FscmVhZHkgc2VudCBidXQgc3RpbGwgaW4gcXVldWUnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gd2hpbGUgKHJlcXVlc3QuaXNFbmRlZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHJlcXVlc3QgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmVxdWVzdC5pbnRlcm5hbFJlcXVlc3QgPSBjaGFubmVsRnJlZWQucmVxdWVzdERhdGEoXHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0LmNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICAgICAgcmVxdWVzdC5jYWxsYmFjayxcclxuICAgICAgICAgICAgICAgIHJlcXVlc3QuZmFpbHVyZUNhbGxiYWNrLFxyXG4gICAgICAgICAgICAgICAgcmVxdWVzdC5udW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeURpc2Nvbm5lY3RXYWl0aW5nU2Vzc2lvbigpIHtcclxuICAgICAgICB2YXIgY2FuQ2xvc2VTZXNzaW9uID0gIXNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdC5oYXNBY3RpdmVSZXF1ZXN0cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYW5DbG9zZVNlc3Npb24pIHtcclxuICAgICAgICAgICAgc2Vzc2lvbldhaXRpbmdGb3JEaXNjb25uZWN0LmNsb3NlKCk7XHJcbiAgICAgICAgICAgIHNlc3Npb25XYWl0aW5nRm9yRGlzY29ubmVjdCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjYW5DbG9zZVNlc3Npb247XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwUmVxdWVzdChcclxuICAgIHNlc3Npb25IZWxwZXIsXHJcbiAgICBtZXNzYWdlSGVhZGVyUGFyc2VyLFxyXG4gICAgY2hhbm5lbCxcclxuICAgIHJlcXVlc3RVcmwsXHJcbiAgICBjYWxsYmFjayxcclxuICAgIGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgXHJcbiAgICB2YXIgS0IgPSAxMDI0O1xyXG4gICAgdmFyIFBST0dSRVNTSVZFTkVTU19NSU5fTEVOR1RIX0JZVEVTID0gMTAgKiBLQjtcclxuXHJcbiAgICB2YXIgUkVTUE9OU0VfRU5ERURfU1VDQ0VTUyA9IDE7XHJcbiAgICB2YXIgUkVTUE9OU0VfRU5ERURfQUJPUlRFRCA9IDI7XHJcbiAgICB2YXIgUkVTUE9OU0VfRU5ERURfU0VOVF9BTk9USEVSX01FU1NBR0UgPSAzO1xyXG4gICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgaXNBY3RpdmUgPSBmYWxzZTtcclxuICAgIHZhciBlbmRlZEJ5VXNlciA9IGZhbHNlO1xyXG4gICAgdmFyIGxhc3RSZXF1ZXN0SWQ7XHJcbiAgICB2YXIgcmVzcG9uc2VMZW5ndGggPSBQUk9HUkVTU0lWRU5FU1NfTUlOX0xFTkdUSF9CWVRFUztcclxuICAgIFxyXG4gICAgdGhpcy5zdGFydFJlcXVlc3QgPSBmdW5jdGlvbiBzdGFydFJlcXVlc3QoKSB7XHJcbiAgICAgICAgaWYgKGlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ3N0YXJ0UmVxdWVzdCBjYWxsZWQgdHdpY2UnKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGVuZGVkQnlVc2VyKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ3JlcXVlc3Qgd2FzIGFscmVhZHkgc3RvcHBlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpc0FjdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5yZXF1ZXN0U3RhcnRlZCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlbmRNZXNzYWdlT2ZEYXRhUmVxdWVzdCgpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnN0b3BSZXF1ZXN0QXN5bmMgPSBmdW5jdGlvbiBzdG9wUmVxdWVzdEFzeW5jKHJlcXVlc3QpIHtcclxuICAgICAgICBlbmRlZEJ5VXNlciA9IHRydWU7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldExhc3RSZXF1ZXN0SWQgPSBmdW5jdGlvbiBnZXRMYXN0UmVxdWVzdElkKCkge1xyXG4gICAgICAgIGlmICghaXNBY3RpdmUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnVW5leHBlY3RlZCBjYWxsIHRvIGdldExhc3RSZXF1ZXN0SWQgb24gaW5hY3RpdmUgcmVxdWVzdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbGFzdFJlcXVlc3RJZDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2FsbENhbGxiYWNrQWZ0ZXJDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCA9XHJcbiAgICAgICAgZnVuY3Rpb24gY2FsbENhbGxiYWNrQWZ0ZXJDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCgpIHtcclxuICAgICAgICBcclxuICAgICAgICBjYWxsYmFjayhzZWxmLCAvKmlzUmVzcG9uc2VEb25lPSovdHJ1ZSk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpbnRlcm5hbFN1Y2Nlc3NDYWxsYmFjayhhamF4UmVzcG9uc2UsIGlzUmVzcG9uc2VEb25lKSB7XHJcbiAgICAgICAgdmFyIGZhaWxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB2YXIgZW5kZWRSZWFzb24gPSBwcm9jZXNzQWpheFJlc3BvbnNlKGFqYXhSZXNwb25zZSwgaXNSZXNwb25zZURvbmUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGVuZGVkUmVhc29uID09PSBSRVNQT05TRV9FTkRFRF9TRU5UX0FOT1RIRVJfTUVTU0FHRSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmYWlsZWQgPSBlbmRlZFJlYXNvbiA9PT0gUkVTUE9OU0VfRU5ERURfQUJPUlRFRDtcclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGZhaWxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIub25FeGNlcHRpb24oZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmICghZmFpbGVkKSB7XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLndhaXRGb3JDb25jdXJyZW50UmVxdWVzdHNUb0VuZChzZWxmKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2hhbm5lbC5yZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBzZWxmKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChmYWlsZWQgJiYgIWVuZGVkQnlVc2VyICYmIGZhaWx1cmVDYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBmYWlsdXJlQ2FsbGJhY2soKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5jaGVja0NvbmN1cnJlbnRSZXF1ZXN0c0ZpbmlzaGVkKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW50ZXJuYWxGYWlsdXJlQ2FsbGJhY2soYWpheFJlc3BvbnNlKSB7XHJcbiAgICAgICAgY2hhbm5lbC5yZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBzZWxmKTtcclxuICAgICAgICBzZXNzaW9uSGVscGVyLmNoZWNrQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQoKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZmFpbHVyZUNhbGxiYWNrICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwcm9jZXNzQWpheFJlc3BvbnNlKGFqYXhSZXNwb25zZSwgaXNSZXNwb25zZURvbmUpIHtcclxuICAgICAgICBpZiAoIWlzUmVzcG9uc2VEb25lKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdBSkFYICcgK1xyXG4gICAgICAgICAgICAgICAgJ2NhbGxiYWNrIGNhbGxlZCBhbHRob3VnaCByZXNwb25zZSBpcyBub3QgZG9uZSB5ZXQgJyArXHJcbiAgICAgICAgICAgICAgICAnYW5kIGNodW5rZWQgZW5jb2RpbmcgaXMgbm90IGVuYWJsZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICB2YXIgY3JlYXRlZENoYW5uZWwgPSBzZXNzaW9uSGVscGVyLmdldENyZWF0ZWRDaGFubmVsSWQoXHJcbiAgICAgICAgICAgIGFqYXhSZXNwb25zZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNyZWF0ZWRDaGFubmVsICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGlmIChjaGFubmVsLmdldENoYW5uZWxJZCgpICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0NoYW5uZWwgY3JlYXRlZCBhbHRob3VnaCB3YXMgbm90IHJlcXVlc3RlZCcsICdELjIuMycpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNoYW5uZWwuc2V0Q2hhbm5lbElkKGNyZWF0ZWRDaGFubmVsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAoY2hhbm5lbC5nZXRDaGFubmVsSWQoKSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDYW5ub3QgZXh0cmFjdCBjaWQgZnJvbSBjbmV3IHJlc3BvbnNlJywgJ0QuMi4zJykpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZW5kT2Zmc2V0ID0gc2F2ZVRvRGF0YWJpbnNGcm9tT2Zmc2V0KGFqYXhSZXNwb25zZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGVuZE9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gUkVTUE9OU0VfRU5ERURfQUJPUlRFRDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGVuZGVkUmVhc29uID0gcGFyc2VFbmRPZlJlc3BvbnNlKGFqYXhSZXNwb25zZSwgZW5kT2Zmc2V0KTtcclxuICAgICAgICByZXR1cm4gZW5kZWRSZWFzb247XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNlbmRNZXNzYWdlT2ZEYXRhUmVxdWVzdCgpIHtcclxuICAgICAgICBsYXN0UmVxdWVzdElkID0gY2hhbm5lbC5uZXh0UmVxdWVzdElkKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHVybCA9IHJlcXVlc3RVcmwgK1xyXG4gICAgICAgICAgICAnJmxlbj0nICsgcmVzcG9uc2VMZW5ndGggK1xyXG4gICAgICAgICAgICAnJnFpZD0nICsgbGFzdFJlcXVlc3RJZDtcclxuICAgICAgICBcclxuICAgICAgICByZXNwb25zZUxlbmd0aCAqPSAyO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzaG91bGRDcmVhdGVDaGFubmVsID0gY2hhbm5lbC5nZXRDaGFubmVsSWQoKSA9PT0gbnVsbDtcclxuICAgICAgICBpZiAoc2hvdWxkQ3JlYXRlQ2hhbm5lbCkge1xyXG4gICAgICAgICAgICB1cmwgKz0gJyZjbmV3PWh0dHAnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGV4aXN0Q2hhbm5lbEluU2Vzc2lvbiA9IHNlc3Npb25IZWxwZXIuZ2V0Rmlyc3RDaGFubmVsKCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGV4aXN0Q2hhbm5lbEluU2Vzc2lvbiAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgdXJsICs9ICcmY2lkPScgKyBleGlzdENoYW5uZWxJblNlc3Npb24uZ2V0Q2hhbm5lbElkKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIE5PVEU6IElmIGV4aXN0Q2hhbm5lbEluU2Vzc2lvbiwgbWF5YmUgc2hvdWxkIHJlbW92ZSBcIiZzdHJlYW09MFwiXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdXJsICs9ICcmY2lkPScgKyBjaGFubmVsLmdldENoYW5uZWxJZCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyLnNlbmRBamF4KFxyXG4gICAgICAgICAgICB1cmwsXHJcbiAgICAgICAgICAgIGludGVybmFsU3VjY2Vzc0NhbGxiYWNrLFxyXG4gICAgICAgICAgICBpbnRlcm5hbEZhaWx1cmVDYWxsYmFjayk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHBhcnNlRW5kT2ZSZXNwb25zZShhamF4UmVzcG9uc2UsIG9mZnNldCkge1xyXG4gICAgICAgIHZhciBlbmRSZXNwb25zZVJlc3VsdCA9IFJFU1BPTlNFX0VOREVEX0FCT1JURUQ7XHJcbiAgICAgICAgdmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYWpheFJlc3BvbnNlLnJlc3BvbnNlKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAob2Zmc2V0ID4gYnl0ZXMubGVuZ3RoIC0gMiB8fFxyXG4gICAgICAgICAgICBieXRlc1tvZmZzZXRdICE9PSAwKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oJ0NvdWxkIG5vdCBmaW5kICcgK1xyXG4gICAgICAgICAgICAgICAgJ0VuZCBPZiBSZXNwb25zZSAoRU9SKSBjb2RlIGF0IHRoZSBlbmQgb2YgcmVzcG9uc2UnLCAnRC4zJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAoYnl0ZXNbb2Zmc2V0ICsgMV0pIHtcclxuICAgICAgICAgICAgY2FzZSBqR2xvYmFscy5qcGlwRW5kT2ZSZXNwb25zZVJlYXNvbnMuSU1BR0VfRE9ORTpcclxuICAgICAgICAgICAgY2FzZSBqR2xvYmFscy5qcGlwRW5kT2ZSZXNwb25zZVJlYXNvbnMuV0lORE9XX0RPTkU6XHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLlFVQUxJVFlfTElNSVQ6XHJcbiAgICAgICAgICAgICAgICBlbmRSZXNwb25zZVJlc3VsdCA9IFJFU1BPTlNFX0VOREVEX1NVQ0NFU1M7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLldJTkRPV19DSEFOR0U6XHJcbiAgICAgICAgICAgICAgICBpZiAoIWVuZGVkQnlVc2VyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgcmVzcG9uc2Ugd2FzIHRlcm1pbmF0ZWQgZHVlIHRvIG5ld2VyICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAncmVxdWVzdCBpc3N1ZWQgb24gc2FtZSBjaGFubmVsLiBUaGF0IG1heSBiZSBhbiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2ludGVybmFsIHdlYmpwaXAuanMgZXJyb3IgLSBDaGVjayB0aGF0IG1vdmFibGUgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdyZXF1ZXN0cyBhcmUgd2VsbCBtYWludGFpbmVkJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLkJZVEVfTElNSVQ6XHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLlJFU1BPTlNFX0xJTUlUOlxyXG4gICAgICAgICAgICAgICAgaWYgKCFlbmRlZEJ5VXNlcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRNZXNzYWdlT2ZEYXRhUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGVuZFJlc3BvbnNlUmVzdWx0ID0gUkVTUE9OU0VfRU5ERURfU0VOVF9BTk9USEVSX01FU1NBR0U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSBqR2xvYmFscy5qcGlwRW5kT2ZSZXNwb25zZVJlYXNvbnMuU0VTU0lPTl9MSU1JVDpcclxuICAgICAgICAgICAgICAgIHNlc3Npb25IZWxwZXIub25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxPcGVyYXRpb25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgcmVzb3VyY2VzIGFzc29jaWF0ZWQgd2l0aCB0aGUgc2Vzc2lvbiBpcyAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2xpbWl0dGVkLCBubyBmdXJ0aGVyIHJlcXVlc3RzIHNob3VsZCBiZSBpc3N1ZWQgdG8gJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICd0aGlzIHNlc3Npb24nKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhc2Ugakdsb2JhbHMuanBpcEVuZE9mUmVzcG9uc2VSZWFzb25zLk5PTl9TUEVDSUZJRUQ6XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsT3BlcmF0aW9uRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgZXJyb3IgdGVybWluYXRlZCByZXNwb25zZSB3aXRoIG5vIHJlYXNvbiBzcGVjaWZpZWQnKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHNlc3Npb25IZWxwZXIub25FeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnU2VydmVyIHJlc3BvbmRlZCB3aXRoIGlsbGVnYWwgRW5kIE9mIFJlc3BvbnNlICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnKEVPUikgY29kZTogJyArIGJ5dGVzW29mZnNldCArIDFdKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGVuZFJlc3BvbnNlUmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBzYXZlVG9EYXRhYmluc0Zyb21PZmZzZXQoYWpheFJlc3BvbnNlKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYWpheFJlc3BvbnNlLnJlc3BvbnNlKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBvZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICB2YXIgcHJldmlvdXNIZWFkZXI7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB3aGlsZSAob2Zmc2V0IDwgYnl0ZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYnl0ZXNbb2Zmc2V0XSA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIEVuZCBPZiBSZXNwb25zZSAoRU9SKVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgaGVhZGVyID0gbWVzc2FnZUhlYWRlclBhcnNlci5wYXJzZU1lc3NhZ2VIZWFkZXIoXHJcbiAgICAgICAgICAgICAgICAgICAgYnl0ZXMsIG9mZnNldCwgcHJldmlvdXNIZWFkZXIpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoaGVhZGVyLmJvZHlTdGFydCArIGhlYWRlci5tZXNzYWdlQm9keUxlbmd0aCA+IGJ5dGVzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHNlc3Npb25IZWxwZXIuZ2V0RGF0YWJpbnNTYXZlcigpLnNhdmVEYXRhKGhlYWRlciwgYnl0ZXMpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBvZmZzZXQgPSBoZWFkZXIuYm9keVN0YXJ0ICsgaGVhZGVyLm1lc3NhZ2VCb2R5TGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgcHJldmlvdXNIZWFkZXIgPSBoZWFkZXI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBvZmZzZXQ7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLm9uRXhjZXB0aW9uKGUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcFNlc3Npb25IZWxwZXIoXHJcbiAgICBkYXRhUmVxdWVzdFVybCxcclxuICAgIGtub3duVGFyZ2V0SWQsXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgZGF0YWJpbnNTYXZlcixcclxuICAgIGFqYXhIZWxwZXIpIHtcclxuICAgIFxyXG4gICAgdmFyIHN0YXR1c0NhbGxiYWNrID0gbnVsbDtcclxuICAgIHZhciByZXF1ZXN0RW5kZWRDYWxsYmFjayA9IG51bGw7XHJcbiAgICBcclxuICAgIHZhciBjaGFubmVscyA9IFtdO1xyXG4gICAgdmFyIGZpcnN0Q2hhbm5lbCA9IG51bGw7XHJcblxyXG4gICAgdmFyIGFjdGl2ZVJlcXVlc3RzID0gMDtcclxuICAgIHZhciB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzID0gW107XHJcblxyXG4gICAgdmFyIGlzUmVhZHkgPSBmYWxzZTtcclxuICAgIHZhciB0YXJnZXRJZCA9IGtub3duVGFyZ2V0SWQgfHwgJzAnO1xyXG4gICAgXHJcbiAgICB0aGlzLm9uRXhjZXB0aW9uID0gZnVuY3Rpb24gb25FeGNlcHRpb24oZXhjZXB0aW9uKSB7XHJcbiAgICAgICAgb25TdGF0dXNDaGFuZ2UoZXhjZXB0aW9uKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0SXNSZWFkeSA9IGZ1bmN0aW9uIGdldElzUmVhZHkoKSB7XHJcbiAgICAgICAgcmV0dXJuIGlzUmVhZHk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldElzUmVhZHkgPSBmdW5jdGlvbiBzZXRJc1JlYWR5KGlzUmVhZHlfKSB7XHJcbiAgICAgICAgaXNSZWFkeSA9IGlzUmVhZHlfO1xyXG4gICAgICAgIG9uU3RhdHVzQ2hhbmdlKCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENvZGVzdHJlYW1TdHJ1Y3R1cmUgPSBmdW5jdGlvbiBnZXRDb2Rlc3RyZWFtU3RydWN0dXJlKCkge1xyXG4gICAgICAgIHJldHVybiBjb2Rlc3RyZWFtU3RydWN0dXJlO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXREYXRhYmluc1NhdmVyID0gZnVuY3Rpb24gZ2V0RGF0YWJpbnNTYXZlcigpIHtcclxuICAgICAgICByZXR1cm4gZGF0YWJpbnNTYXZlcjtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0RGF0YVJlcXVlc3RVcmwgPSBmdW5jdGlvbiBnZXREYXRhUmVxdWVzdFVybCgpIHtcclxuICAgICAgICByZXR1cm4gZGF0YVJlcXVlc3RVcmw7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRhcmdldElkID0gZnVuY3Rpb24gZ2V0VGFyZ2V0SWQoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldElkO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRGaXJzdENoYW5uZWwgPSBmdW5jdGlvbiBnZXRGaXJzdENoYW5uZWwoKSB7XHJcbiAgICAgICAgcmV0dXJuIGZpcnN0Q2hhbm5lbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2V0U3RhdHVzQ2FsbGJhY2sgPSBmdW5jdGlvbiBzZXRTdGF0dXNDYWxsYmFjayhzdGF0dXNDYWxsYmFja18pIHtcclxuICAgICAgICBzdGF0dXNDYWxsYmFjayA9IHN0YXR1c0NhbGxiYWNrXztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSBmdW5jdGlvbiBzZXRSZXF1ZXN0RW5kZWRDYWxsYmFjayhcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFja18pIHtcclxuICAgICAgICBcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFjayA9IHJlcXVlc3RFbmRlZENhbGxiYWNrXztcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucmVxdWVzdFN0YXJ0ZWQgPSBmdW5jdGlvbiByZXF1ZXN0U3RhcnRlZCgpIHtcclxuICAgICAgICArK2FjdGl2ZVJlcXVlc3RzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5yZXF1ZXN0RW5kZWQgPSBmdW5jdGlvbiByZXF1ZXN0RW5kZWQoYWpheFJlc3BvbnNlLCBjaGFubmVsKSB7XHJcbiAgICAgICAgLS1hY3RpdmVSZXF1ZXN0cztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGFyZ2V0SWRGcm9tU2VydmVyID0gYWpheFJlc3BvbnNlLmdldFJlc3BvbnNlSGVhZGVyKCdKUElQLXRpZCcpO1xyXG4gICAgICAgIGlmICh0YXJnZXRJZEZyb21TZXJ2ZXIgIT09ICcnICYmIHRhcmdldElkRnJvbVNlcnZlciAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBpZiAodGFyZ2V0SWQgPT09ICcwJykge1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0SWQgPSB0YXJnZXRJZEZyb21TZXJ2ZXI7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0SWQgIT09IHRhcmdldElkRnJvbVNlcnZlcikge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdTZXJ2ZXIgcmV0dXJuZWQgdW5tYXRjaGVkIHRhcmdldCBJRCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChmaXJzdENoYW5uZWwgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgZmlyc3RDaGFubmVsID0gY2hhbm5lbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNoYW5uZWxGcmVlZCA9IGNoYW5uZWwuZ2V0SXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCgpID9cclxuICAgICAgICAgICAgbnVsbCA6IGNoYW5uZWw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHJlcXVlc3RFbmRlZENhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RFbmRlZENhbGxiYWNrKGNoYW5uZWxGcmVlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRBY3RpdmVSZXF1ZXN0c0NvdW50ID0gZnVuY3Rpb24gZ2V0QWN0aXZlUmVxdWVzdHNDb3VudCgpIHtcclxuICAgICAgICByZXR1cm4gYWN0aXZlUmVxdWVzdHM7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmNoYW5uZWxDcmVhdGVkID0gZnVuY3Rpb24gY2hhbm5lbENyZWF0ZWQoY2hhbm5lbCkge1xyXG4gICAgICAgIGNoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldENyZWF0ZWRDaGFubmVsSWQgPSBmdW5jdGlvbiBnZXRDcmVhdGVkQ2hhbm5lbElkKGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgIHZhciBjbmV3UmVzcG9uc2UgPSBhamF4UmVzcG9uc2UuZ2V0UmVzcG9uc2VIZWFkZXIoJ0pQSVAtY25ldycpO1xyXG4gICAgICAgIGlmICghY25ld1Jlc3BvbnNlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIga2V5VmFsdWVQYWlyc0luUmVzcG9uc2UgPSBjbmV3UmVzcG9uc2Uuc3BsaXQoJywnKTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlWYWx1ZVBhaXJzSW5SZXNwb25zZS5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIga2V5QW5kVmFsdWUgPSBrZXlWYWx1ZVBhaXJzSW5SZXNwb25zZVtpXS5zcGxpdCgnPScpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGtleUFuZFZhbHVlWzBdID09PSAnY2lkJykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleUFuZFZhbHVlWzFdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy53YWl0Rm9yQ29uY3VycmVudFJlcXVlc3RzVG9FbmQgPVxyXG4gICAgICAgIGZ1bmN0aW9uIHdhaXRGb3JDb25jdXJyZW50UmVxdWVzdHNUb0VuZChyZXF1ZXN0KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbmN1cnJlbnRSZXF1ZXN0cyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhbm5lbHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIHJlcXVlc3RzID0gY2hhbm5lbHNbaV0uZ2V0UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2UoKTtcclxuICAgICAgICAgICAgdmFyIG51bVJlcXVlc3RzID0gcmVxdWVzdHMubGVuZ3RoO1xyXG4gICAgICAgICAgICBpZiAobnVtUmVxdWVzdHMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbGFzdFJlcXVlc3RJZCA9IHJlcXVlc3RzWzBdLmdldExhc3RSZXF1ZXN0SWQoKTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDE7IGogPCByZXF1ZXN0cy5sZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICAgICAgbGFzdFJlcXVlc3RJZCA9IE1hdGgubWF4KFxyXG4gICAgICAgICAgICAgICAgICAgIGxhc3RSZXF1ZXN0SWQsIHJlcXVlc3RzW2pdLmdldExhc3RSZXF1ZXN0SWQoKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0cy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIGNoYW5uZWw6IGNoYW5uZWxzW2ldLFxyXG4gICAgICAgICAgICAgICAgcmVxdWVzdElkOiBsYXN0UmVxdWVzdElkXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0cy5wdXNoKHtcclxuICAgICAgICAgICAgcmVxdWVzdDogcmVxdWVzdCxcclxuICAgICAgICAgICAgY29uY3VycmVudFJlcXVlc3RzOiBjb25jdXJyZW50UmVxdWVzdHNcclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuY2hlY2tDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCA9XHJcbiAgICAgICAgZnVuY3Rpb24gY2hlY2tDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCgpIHtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciBpID0gd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xyXG4gICAgICAgICAgICB2YXIgaXNBbGxDb25jdXJyZW50UmVxdWVzdHNGaW5pc2hlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB2YXIgY29uY3VycmVudFJlcXVlc3RzID1cclxuICAgICAgICAgICAgICAgIHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHNbaV0uY29uY3VycmVudFJlcXVlc3RzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IGNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggLSAxOyBqID49IDA7IC0taikge1xyXG4gICAgICAgICAgICAgICAgdmFyIHdhaXRpbmcgPSBjb25jdXJyZW50UmVxdWVzdHNbal07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmICh3YWl0aW5nLmNoYW5uZWwuaXNBbGxPbGRSZXF1ZXN0c0VuZGVkKHdhaXRpbmcucmVxdWVzdElkKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0c1tqXSA9IGNvbmN1cnJlbnRSZXF1ZXN0c1tcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uY3VycmVudFJlcXVlc3RzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggLT0gMTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGNvbmN1cnJlbnRSZXF1ZXN0cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHJlcXVlc3QgPSB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzW2ldLnJlcXVlc3Q7XHJcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IHJlcXVlc3QuY2FsbGJhY2s7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB3YWl0aW5nRm9yQ29uY3VycmVudFJlcXVlc3RzW2ldID0gd2FpdGluZ0ZvckNvbmN1cnJlbnRSZXF1ZXN0c1tcclxuICAgICAgICAgICAgICAgIHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgIHdhaXRpbmdGb3JDb25jdXJyZW50UmVxdWVzdHMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXF1ZXN0LmNhbGxDYWxsYmFja0FmdGVyQ29uY3VycmVudFJlcXVlc3RzRmluaXNoZWQoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNlbmRBamF4ID0gZnVuY3Rpb24gc2VuZEFqYXgoXHJcbiAgICAgICAgdXJsLFxyXG4gICAgICAgIGNhbGxiYWNrLFxyXG4gICAgICAgIGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmb3JrZWRGYWlsdXJlQ2FsbGJhY2s7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGZhaWx1cmVDYWxsYmFjaykge1xyXG4gICAgICAgICAgICBmb3JrZWRGYWlsdXJlQ2FsbGJhY2sgPSBmdW5jdGlvbiBmb3JrRmFpbHVyZUNhbGxiYWNrKGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgICAgICAgICAgZ2VuZXJhbEZhaWx1cmVDYWxsYmFjayhhamF4UmVzcG9uc2UpO1xyXG4gICAgICAgICAgICAgICAgZmFpbHVyZUNhbGxiYWNrKGFqYXhSZXNwb25zZSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZm9ya2VkRmFpbHVyZUNhbGxiYWNrID0gZ2VuZXJhbEZhaWx1cmVDYWxsYmFjaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWpheEhlbHBlci5yZXF1ZXN0KHVybCwgY2FsbGJhY2ssIGZvcmtlZEZhaWx1cmVDYWxsYmFjayk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZW5lcmFsRmFpbHVyZUNhbGxiYWNrKGFqYXhSZXNwb25zZSkge1xyXG4gICAgICAgIHZhciBleGNlcHRpb24gPSBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgJ0JhZCBqcGlwIHNlcnZlciByZXNwb25zZSAoc3RhdHVzID0gJyArIGFqYXhSZXNwb25zZS5zdGF0dXMgKyAnKScpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBvblN0YXR1c0NoYW5nZShleGNlcHRpb24pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBvblN0YXR1c0NoYW5nZShleGNlcHRpb24pIHtcclxuICAgICAgICBpZiAoZXhjZXB0aW9uID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgZXhjZXB0aW9uID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHN0YXR1c0NhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHN0YXR1c0NhbGxiYWNrKHtcclxuICAgICAgICAgICAgICAgIGlzUmVhZHk6IGlzUmVhZHksXHJcbiAgICAgICAgICAgICAgICBleGNlcHRpb246IGV4Y2VwdGlvblxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwU2Vzc2lvbihcclxuICAgIG1heENoYW5uZWxzSW5TZXNzaW9uLFxyXG4gICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsXHJcbiAgICBrbm93blRhcmdldElkLFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICBzZXRJbnRlcnZhbEZ1bmN0aW9uLFxyXG4gICAgY2xlYXJJbnRlcnZhbEZ1bmN0aW9uLFxyXG4gICAganBpcEZhY3RvcnkpIHtcclxuXHJcbiAgICB2YXIgU0VDT05EID0gMTAwMDtcclxuICAgIHZhciBLRUVQX0FMSVZFX0lOVEVSVkFMID0gMzAgKiBTRUNPTkQ7XHJcbiAgICBcclxuICAgIHZhciBjaGFubmVsTWFuYWdlbWVudFVybDtcclxuICAgIHZhciBkYXRhUmVxdWVzdFVybDtcclxuICAgIHZhciBjbG9zZVNlc3Npb25Vcmw7XHJcbiAgICBcclxuICAgIHZhciBpc0Nsb3NlQ2FsbGVkID0gZmFsc2U7XHJcbiAgICB2YXIgY2xvc2VDYWxsYmFja1BlbmRpbmcgPSBudWxsO1xyXG5cclxuICAgIHZhciBzZXNzaW9uSGVscGVyID0gbnVsbDtcclxuICAgIHZhciBzdGF0dXNDYWxsYmFjayA9IG51bGw7XHJcbiAgICB2YXIgcmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSBudWxsO1xyXG5cclxuICAgIHZhciBub25EZWRpY2F0ZWRDaGFubmVscyA9IFtdO1xyXG4gICAgdmFyIGNoYW5uZWxzQ3JlYXRlZCA9IDA7XHJcbiAgICB2YXIga2VlcEFsaXZlSW50ZXJ2YWxIYW5kbGUgPSBudWxsO1xyXG4gICAgXHJcbiAgICB0aGlzLm9wZW4gPSBmdW5jdGlvbiBvcGVuKGJhc2VVcmwpIHtcclxuICAgICAgICBpZiAoc2Vzc2lvbkhlbHBlciAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdzZXNzaW9uLm9wZW4oKSBzaG91bGQgYmUgY2FsbGVkIG9ubHkgb25jZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcXVlcnlQYXJhbXNEZWxpbWl0ZXIgPSBiYXNlVXJsLmluZGV4T2YoJz8nKSA8IDAgPyAnPycgOiAnJic7XHJcbiAgICAgICAgY2hhbm5lbE1hbmFnZW1lbnRVcmwgPSBiYXNlVXJsICsgcXVlcnlQYXJhbXNEZWxpbWl0ZXIgKyAndHlwZT0nICsgXHJcbiAgICAgICAgICAgIChkYXRhYmluc1NhdmVyLmdldElzSnBpcFRpbGVQYXJ0U3RyZWFtKCkgPyAnanB0LXN0cmVhbScgOiAnanBwLXN0cmVhbScpO1xyXG4gICAgICAgIGRhdGFSZXF1ZXN0VXJsID0gY2hhbm5lbE1hbmFnZW1lbnRVcmwgKyAnJnN0cmVhbT0wJztcclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyID0ganBpcEZhY3RvcnkuY3JlYXRlU2Vzc2lvbkhlbHBlcihcclxuICAgICAgICAgICAgZGF0YVJlcXVlc3RVcmwsIGtub3duVGFyZ2V0SWQsIGNvZGVzdHJlYW1TdHJ1Y3R1cmUsIGRhdGFiaW5zU2F2ZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChzdGF0dXNDYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLnNldFN0YXR1c0NhbGxiYWNrKHN0YXR1c0NhbGxiYWNrKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHJlcXVlc3RFbmRlZENhbGxiYWNrICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNlc3Npb25IZWxwZXIuc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2socmVxdWVzdEVuZGVkQ2FsbGJhY2spO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2hhbm5lbCA9IGNyZWF0ZUNoYW5uZWwoKTtcclxuICAgICAgICBcclxuICAgICAgICBjaGFubmVsLnNlbmRNaW5pbWFsUmVxdWVzdChzZXNzaW9uUmVhZHlDYWxsYmFjayk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFRhcmdldElkID0gZnVuY3Rpb24gZ2V0VGFyZ2V0SWQoKSB7XHJcbiAgICAgICAgZW5zdXJlUmVhZHkoKTtcclxuICAgICAgICByZXR1cm4gc2Vzc2lvbkhlbHBlci5nZXRUYXJnZXRJZCgpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRJc1JlYWR5ID0gZnVuY3Rpb24gZ2V0SXNSZWFkeSgpIHtcclxuICAgICAgICB2YXIgaXNSZWFkeSA9IHNlc3Npb25IZWxwZXIgIT09IG51bGwgJiYgc2Vzc2lvbkhlbHBlci5nZXRJc1JlYWR5KCk7XHJcbiAgICAgICAgcmV0dXJuIGlzUmVhZHk7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnNldFN0YXR1c0NhbGxiYWNrID0gZnVuY3Rpb24gc2V0U3RhdHVzQ2FsbGJhY2soc3RhdHVzQ2FsbGJhY2tfKSB7XHJcbiAgICAgICAgc3RhdHVzQ2FsbGJhY2sgPSBzdGF0dXNDYWxsYmFja187XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHNlc3Npb25IZWxwZXIgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgc2Vzc2lvbkhlbHBlci5zZXRTdGF0dXNDYWxsYmFjayhzdGF0dXNDYWxsYmFja18pO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuc2V0UmVxdWVzdEVuZGVkQ2FsbGJhY2sgPSBmdW5jdGlvbiBzZXRSZXF1ZXN0RW5kZWRDYWxsYmFjayhcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFja18pIHtcclxuICAgICAgICBcclxuICAgICAgICByZXF1ZXN0RW5kZWRDYWxsYmFjayA9IHJlcXVlc3RFbmRlZENhbGxiYWNrXztcclxuICAgICAgICBcclxuICAgICAgICBpZiAoc2Vzc2lvbkhlbHBlciAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXNzaW9uSGVscGVyLnNldFJlcXVlc3RFbmRlZENhbGxiYWNrKHJlcXVlc3RFbmRlZENhbGxiYWNrXyk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5oYXNBY3RpdmVSZXF1ZXN0cyA9IGZ1bmN0aW9uIGhhc0FjdGl2ZVJlcXVlc3RzKCkge1xyXG4gICAgICAgIGVuc3VyZVJlYWR5KCk7XHJcblxyXG4gICAgICAgIHZhciBpc0FjdGl2ZVJlcXVlc3RzID0gc2Vzc2lvbkhlbHBlci5nZXRBY3RpdmVSZXF1ZXN0c0NvdW50KCkgPiAwO1xyXG4gICAgICAgIHJldHVybiBpc0FjdGl2ZVJlcXVlc3RzO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy50cnlHZXRDaGFubmVsID0gZnVuY3Rpb24gdHJ5R2V0Q2hhbm5lbChkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0KSB7XHJcbiAgICAgICAgZW5zdXJlUmVhZHkoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2FuQ3JlYXRlTmV3Q2hhbm5lbCA9IGNoYW5uZWxzQ3JlYXRlZCA8IG1heENoYW5uZWxzSW5TZXNzaW9uO1xyXG4gICAgICAgIHZhciBzZWFyY2hPbmx5Q2hhbm5lbFdpdGhFbXB0eVF1ZXVlID1cclxuICAgICAgICAgICAgY2FuQ3JlYXRlTmV3Q2hhbm5lbCB8fCBkZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXhSZXF1ZXN0c0luQ2hhbm5lbCA9IHNlYXJjaE9ubHlDaGFubmVsV2l0aEVtcHR5UXVldWUgP1xyXG4gICAgICAgICAgICAwIDogbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwgLSAxO1xyXG5cclxuICAgICAgICB2YXIgY2hhbm5lbCA9IGdldENoYW5uZWxXaXRoTWluaW1hbFdhaXRpbmdSZXF1ZXN0cyhcclxuICAgICAgICAgICAgbWF4UmVxdWVzdHNJbkNoYW5uZWwsXHJcbiAgICAgICAgICAgIC8qaXNFeHRyYWN0RnJvbU5vbkRlZGljYXRlZExpc3Q9Ki9kZWRpY2F0ZUZvck1vdmFibGVSZXF1ZXN0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY2hhbm5lbCA9PT0gbnVsbCAmJiBjYW5DcmVhdGVOZXdDaGFubmVsKSB7XHJcbiAgICAgICAgICAgIGNoYW5uZWwgPSBjcmVhdGVDaGFubmVsKGRlZGljYXRlRm9yTW92YWJsZVJlcXVlc3QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdCAmJiBjaGFubmVsICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGNoYW5uZWwuZGVkaWNhdGVGb3JNb3ZhYmxlUmVxdWVzdCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY2hhbm5lbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY2xvc2UgPSBmdW5jdGlvbiBjbG9zZShjbG9zZWRDYWxsYmFjaykge1xyXG4gICAgICAgIGlmIChjaGFubmVsc0NyZWF0ZWQgPT09IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAnQ2Fubm90IGNsb3NlIHNlc3Npb24gYmVmb3JlIG9wZW4nKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChpc0Nsb3NlQ2FsbGVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ0Nhbm5vdCBjbG9zZSBzZXNzaW9uIHR3aWNlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlzQ2xvc2VDYWxsZWQgPSB0cnVlO1xyXG4gICAgICAgIGNsb3NlQ2FsbGJhY2tQZW5kaW5nID0gY2xvc2VkQ2FsbGJhY2s7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNsb3NlU2Vzc2lvblVybCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGNsb3NlSW50ZXJuYWwoKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjbG9zZUludGVybmFsKCkge1xyXG4gICAgICAgIGlmIChrZWVwQWxpdmVJbnRlcnZhbEhhbmRsZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjbGVhckludGVydmFsRnVuY3Rpb24oa2VlcEFsaXZlSW50ZXJ2YWxIYW5kbGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBzZXNzaW9uSGVscGVyLnNldElzUmVhZHkoZmFsc2UpO1xyXG4gICAgICAgIHNlc3Npb25IZWxwZXIuc2VuZEFqYXgoY2xvc2VTZXNzaW9uVXJsLCBjbG9zZUNhbGxiYWNrUGVuZGluZyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwoaXNEZWRpY2F0ZWRGb3JNb3ZhYmxlUmVxdWVzdCkge1xyXG4gICAgICAgICsrY2hhbm5lbHNDcmVhdGVkO1xyXG4gICAgICAgIHZhciBjaGFubmVsID0ganBpcEZhY3RvcnkuY3JlYXRlQ2hhbm5lbChcclxuICAgICAgICAgICAgbWF4UmVxdWVzdHNXYWl0aW5nRm9yUmVzcG9uc2VJbkNoYW5uZWwsIHNlc3Npb25IZWxwZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlc3Npb25IZWxwZXIuY2hhbm5lbENyZWF0ZWQoY2hhbm5lbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCFpc0RlZGljYXRlZEZvck1vdmFibGVSZXF1ZXN0KSB7XHJcbiAgICAgICAgICAgIG5vbkRlZGljYXRlZENoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gY2hhbm5lbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0Q2hhbm5lbFdpdGhNaW5pbWFsV2FpdGluZ1JlcXVlc3RzKFxyXG4gICAgICAgIG1heFJlcXVlc3RzSW5DaGFubmVsLCBpc0V4dHJhY3RGcm9tTm9uRGVkaWNhdGVkTGlzdCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjaGFubmVsID0gbnVsbDtcclxuICAgICAgICB2YXIgaW5kZXg7XHJcbiAgICAgICAgdmFyIG1pbmltYWxXYWl0aW5nUmVxdWVzdHMgPSBtYXhSZXF1ZXN0c0luQ2hhbm5lbCArIDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBub25EZWRpY2F0ZWRDaGFubmVscy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB2YXIgd2FpdGluZ1JlcXVlc3RzID1cclxuICAgICAgICAgICAgICAgIG5vbkRlZGljYXRlZENoYW5uZWxzW2ldLmdldEFsbFF1ZXVlZFJlcXVlc3RDb3VudCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHdhaXRpbmdSZXF1ZXN0cyA8IG1pbmltYWxXYWl0aW5nUmVxdWVzdHMpIHtcclxuICAgICAgICAgICAgICAgIGNoYW5uZWwgPSBub25EZWRpY2F0ZWRDaGFubmVsc1tpXTtcclxuICAgICAgICAgICAgICAgIGluZGV4ID0gaTtcclxuICAgICAgICAgICAgICAgIG1pbmltYWxXYWl0aW5nUmVxdWVzdHMgPSB3YWl0aW5nUmVxdWVzdHM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh3YWl0aW5nUmVxdWVzdHMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNFeHRyYWN0RnJvbU5vbkRlZGljYXRlZExpc3QgfHwgY2hhbm5lbCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2hhbm5lbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbm9uRGVkaWNhdGVkQ2hhbm5lbHNbaW5kZXhdID1cclxuICAgICAgICAgICAgbm9uRGVkaWNhdGVkQ2hhbm5lbHNbbm9uRGVkaWNhdGVkQ2hhbm5lbHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgbm9uRGVkaWNhdGVkQ2hhbm5lbHMubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNoYW5uZWw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNlc3Npb25SZWFkeUNhbGxiYWNrKCkge1xyXG4gICAgICAgIHZhciBtYWluSGVhZGVyRGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0TWFpbkhlYWRlckRhdGFiaW4oKTtcclxuICAgICAgICBpZiAoIW1haW5IZWFkZXJEYXRhYmluLmlzQWxsRGF0YWJpbkxvYWRlZCgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbGxlZ2FsRGF0YUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdNYWluIGhlYWRlciB3YXMgbm90IGxvYWRlZCBvbiBzZXNzaW9uIGNyZWF0aW9uJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBhcmJpdHJhcnlDaGFubmVsID0gc2Vzc2lvbkhlbHBlci5nZXRGaXJzdENoYW5uZWwoKTtcclxuICAgICAgICB2YXIgYXJiaXRyYXJ5Q2hhbm5lbElkID0gYXJiaXRyYXJ5Q2hhbm5lbC5nZXRDaGFubmVsSWQoKTtcclxuICAgICAgICBjbG9zZVNlc3Npb25VcmwgPSBjaGFubmVsTWFuYWdlbWVudFVybCArXHJcbiAgICAgICAgICAgICcmY2Nsb3NlPSonICtcclxuICAgICAgICAgICAgJyZjaWQ9JyArIGFyYml0cmFyeUNoYW5uZWxJZDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNDbG9zZUNhbGxlZCkge1xyXG4gICAgICAgICAgICBjbG9zZUludGVybmFsKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGFyYml0cmFyeUNoYW5uZWxJZCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIEZhaWx1cmUgaW5kaWNhdGlvbiBhbHJlYWR5IHJldHVybmVkIGluIEpwaXBSZXF1ZXN0XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGtlZXBBbGl2ZUludGVydmFsSGFuZGxlID0gc2V0SW50ZXJ2YWxGdW5jdGlvbihcclxuICAgICAgICAgICAga2VlcEFsaXZlSGFuZGxlciwgS0VFUF9BTElWRV9JTlRFUlZBTCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2Vzc2lvbkhlbHBlci5zZXRJc1JlYWR5KHRydWUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBrZWVwQWxpdmVIYW5kbGVyKCkge1xyXG4gICAgICAgIGlmIChzZXNzaW9uSGVscGVyLmdldEFjdGl2ZVJlcXVlc3RzQ291bnQoKSA+IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYXJiaXRyYXJ5Q2hhbm5lbCA9IHNlc3Npb25IZWxwZXIuZ2V0Rmlyc3RDaGFubmVsKCk7XHJcbiAgICAgICAgYXJiaXRyYXJ5Q2hhbm5lbC5zZW5kTWluaW1hbFJlcXVlc3QoZnVuY3Rpb24gZHVtbXlDYWxsYmFjaygpIHt9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZW5zdXJlUmVhZHkoKSB7XHJcbiAgICAgICAgaWYgKHNlc3Npb25IZWxwZXIgPT09IG51bGwgfHwgIXNlc3Npb25IZWxwZXIuZ2V0SXNSZWFkeSgpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdDYW5ub3QgcGVyZm9ybSAnICtcclxuICAgICAgICAgICAgICAgICd0aGlzIG9wZXJhdGlvbiB3aGVuIHRoZSBzZXNzaW9uIGlzIG5vdCByZWFkeScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbiBKcGlwQml0c3RyZWFtUmVhZGVyQ2xvc3VyZSgpIHtcclxuICAgIHZhciB6ZXJvQml0c1VudGlsRmlyc3RPbmVCaXRNYXAgPSBjcmVhdGVaZXJvQml0c1VudGlsRmlyc3RPbmVCaXRNYXAoKTtcclxuXHJcbiAgICBmdW5jdGlvbiBKcGlwQml0c3RyZWFtUmVhZGVyKGRhdGFiaW4sIHRyYW5zYWN0aW9uSGVscGVyKSB7XHJcbiAgICAgICAgdmFyIGluaXRpYWxTdGF0ZSA9IHtcclxuICAgICAgICAgICAgbmV4dE9mZnNldFRvUGFyc2U6IDAsXHJcbiAgICAgICAgICAgIHZhbGlkQml0c0luQ3VycmVudEJ5dGU6IDAsXHJcbiAgICAgICAgICAgIG9yaWdpbmFsQnl0ZVdpdGhvdXRTaGlmdDogbnVsbCxcclxuICAgICAgICAgICAgY3VycmVudEJ5dGU6IG51bGwsXHJcbiAgICAgICAgICAgIGlzU2tpcE5leHRCeXRlOiBmYWxzZVxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICB2YXIgc3RyZWFtU3RhdGUgPSB0cmFuc2FjdGlvbkhlbHBlci5jcmVhdGVUcmFuc2FjdGlvbmFsT2JqZWN0KGluaXRpYWxTdGF0ZSk7XHJcbiAgICAgICAgdmFyIGFjdGl2ZVRyYW5zYWN0aW9uID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ2FjdGl2ZVRyYW5zYWN0aW9uJywge1xyXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uIGdldEFjdGl2ZVRyYW5zYWN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGFjdGl2ZVRyYW5zYWN0aW9uID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgIWFjdGl2ZVRyYW5zYWN0aW9uLmlzQWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdObyBhY3RpdmUgdHJhbnNhY3Rpb24gaW4gYml0c3RyZWFtUmVhZGVyJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiBhY3RpdmVUcmFuc2FjdGlvbjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnYml0c0NvdW50ZXInLCB7XHJcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gZ2V0Qml0c0NvdW50ZXIoKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHRyeVZhbGlkYXRlQ3VycmVudEJ5dGUoZGF0YWJpbiwgc3RhdGUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLmlzU2tpcE5leHRCeXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIHN0YXRlIG9mIGJpdHN0cmVhbVJlYWRlcjogJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdXaGVuIDB4RkYgZW5jb3VudGVyZWQsIHRyeVZhbGlkYXRlQ3VycmVudEJ5dGUgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdzaG91bGQgc2tpcCB0aGUgd2hvbGUgYnl0ZSAgYWZ0ZXIgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdzaGlmdFJlbWFpbmluZ0JpdHNJbkJ5dGUgYW5kIGNsZWFyIGlzU2tpcE5leHRCeXRlLiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ0hvd2V2ZXIgdGhlIGZsYWcgaXMgc3RpbGwgc2V0Jyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSBzdGF0ZS5uZXh0T2Zmc2V0VG9QYXJzZSAqIDggLSBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdkYXRhYmluT2Zmc2V0Jywge1xyXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uIGdldERhdGFiaW5PZmZzZXQoKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5pc1NraXBOZXh0Qnl0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZS5uZXh0T2Zmc2V0VG9QYXJzZSArIDE7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlICUgOCAhPT0gMCB8fFxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm9yaWdpbmFsQnl0ZVdpdGhvdXRTaGlmdCA9PT0gMHhGRikge1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnQ2Fubm90IGNhbGN1bGF0ZSBkYXRhYmluIG9mZnNldCB3aGVuIGJpdHN0cmVhbVJlYWRlciAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJyBpcyBpbiB0aGUgbWlkZGxlIG9mIHRoZSBieXRlJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZS5uZXh0T2Zmc2V0VG9QYXJzZSAtIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgLyA4O1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiBzZXREYXRhYmluT2Zmc2V0KG9mZnNldEluQnl0ZXMpIHtcclxuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgPSAwO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUuaXNTa2lwTmV4dEJ5dGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHN0YXRlLm9yaWdpbmFsQnl0ZVdpdGhvdXRTaGlmdCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5uZXh0T2Zmc2V0VG9QYXJzZSA9IG9mZnNldEluQnl0ZXM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnN0YXJ0TmV3VHJhbnNhY3Rpb24gPSBmdW5jdGlvbiBzdGFydE5ld1RyYW5zYWN0aW9uKCkge1xyXG4gICAgICAgICAgICBpZiAoYWN0aXZlVHJhbnNhY3Rpb24gIT09IG51bGwgJiYgYWN0aXZlVHJhbnNhY3Rpb24uaXNBY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDYW5ub3Qgc3RhcnQgbmV3IHRyYW5zYWN0aW9uIGluIGJpdHN0cmVhbVJlYWRlciAnICtcclxuICAgICAgICAgICAgICAgICAgICAnd2hpbGUgYW5vdGhlciB0cmFuc2FjdGlvbiBpcyBhY3RpdmUnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYWN0aXZlVHJhbnNhY3Rpb24gPSB0cmFuc2FjdGlvbkhlbHBlci5jcmVhdGVUcmFuc2FjdGlvbigpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5zaGlmdFJlbWFpbmluZ0JpdHNJbkJ5dGUgPSBmdW5jdGlvbiBzaGlmdFJlbWFpbmluZ0JpdHNJbkJ5dGUoKSB7XHJcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0cmVhbVN0YXRlLmdldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIHN0YXRlLmlzU2tpcE5leHRCeXRlID0gc3RhdGUub3JpZ2luYWxCeXRlV2l0aG91dFNoaWZ0ID09PSAweEZGO1xyXG4gICAgICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlID0gTWF0aC5mbG9vcihcclxuICAgICAgICAgICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgLyA4KTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc2hpZnRCaXQgPSBmdW5jdGlvbiBzaGlmdEJpdCgpIHtcclxuICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICBpZiAoIXRyeVZhbGlkYXRlQ3VycmVudEJ5dGUoZGF0YWJpbiwgc3RhdGUpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIG9uZXNDb3VudCA9IGNvdW50QW5kU2hpZnRCaXRzKFxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbixcclxuICAgICAgICAgICAgICAgIHN0YXRlLFxyXG4gICAgICAgICAgICAgICAgLyppc1VudGlsWmVyb0JpdD0qL3RydWUsXHJcbiAgICAgICAgICAgICAgICAvKm1heEJpdHNUb1NoaWZ0PSovMSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gb25lc0NvdW50O1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jb3VudFplcm9zQW5kU2hpZnRVbnRpbEZpcnN0T25lQml0ID1cclxuICAgICAgICAgICAgZnVuY3Rpb24gY291bnRaZXJvc0FuZFNoaWZ0VW50aWxGaXJzdE9uZUJpdChtYXhCaXRzVG9TaGlmdCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RyZWFtU3RhdGUuZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGNvdW50QW5kU2hpZnRCaXRzKFxyXG4gICAgICAgICAgICAgICAgICAgIGRhdGFiaW4sIHN0YXRlLCAvKmlzVW50aWxaZXJvQml0PSovZmFsc2UsIG1heEJpdHNUb1NoaWZ0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmNvdW50T25lc0FuZFNoaWZ0VW50aWxGaXJzdFplcm9CaXQgPVxyXG4gICAgICAgICAgICBmdW5jdGlvbiBjb3VudE9uZXNBbmRTaGlmdFVudGlsRmlyc3RaZXJvQml0KG1heEJpdHNUb1NoaWZ0KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gY291bnRBbmRTaGlmdEJpdHMoXHJcbiAgICAgICAgICAgICAgICAgICAgZGF0YWJpbiwgc3RhdGUsIC8qaXNVbnRpbFplcm9CaXQ9Ki90cnVlLCBtYXhCaXRzVG9TaGlmdCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5zaGlmdEJpdHMgPSBmdW5jdGlvbiBzaGlmdEJpdHMoYml0c0NvdW50KSB7XHJcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSAwO1xyXG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBzdHJlYW1TdGF0ZS5nZXRWYWx1ZShhY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgIHZhciByZW1haW5pbmdCaXRzID0gYml0c0NvdW50O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgd2hpbGUgKHJlbWFpbmluZ0JpdHMgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRyeVZhbGlkYXRlQ3VycmVudEJ5dGUoZGF0YWJpbiwgc3RhdGUpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBiaXRzVG9UYWtlID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSwgcmVtYWluaW5nQml0cyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBhZGRUb1Jlc3VsdCA9IHN0YXRlLmN1cnJlbnRCeXRlID4+ICg4IC0gYml0c1RvVGFrZSk7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSAocmVzdWx0IDw8IGJpdHNUb1Rha2UpICsgYWRkVG9SZXN1bHQ7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJlbW92ZUJpdHNGcm9tQnl0ZShzdGF0ZSwgYml0c1RvVGFrZSk7XHJcbiAgICAgICAgICAgICAgICByZW1haW5pbmdCaXRzIC09IGJpdHNUb1Rha2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY291bnRBbmRTaGlmdEJpdHMoZGF0YWJpbiwgc3RhdGUsIGlzVW50aWxaZXJvQml0LCBtYXhCaXRzVG9TaGlmdCkge1xyXG4gICAgICAgIHZhciBjb3VudGVkQml0cyA9IDA7XHJcbiAgICAgICAgdmFyIGZvdW5kVGVybWluYXRpbmdCaXQ7XHJcbiAgICAgICAgdmFyIHJlbWFpbmluZ0JpdHMgPSBtYXhCaXRzVG9TaGlmdDtcclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIGlmICghdHJ5VmFsaWRhdGVDdXJyZW50Qnl0ZShkYXRhYmluLCBzdGF0ZSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgYnl0ZVZhbHVlID0gaXNVbnRpbFplcm9CaXQgPyB+c3RhdGUuY3VycmVudEJ5dGUgOiBzdGF0ZS5jdXJyZW50Qnl0ZTtcclxuICAgICAgICAgICAgdmFyIGJpdHNDb3VudEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0ID0gTWF0aC5taW4oXHJcbiAgICAgICAgICAgICAgICB6ZXJvQml0c1VudGlsRmlyc3RPbmVCaXRNYXBbYnl0ZVZhbHVlXSxcclxuICAgICAgICAgICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgKyAxKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBiaXRzQ291bnROb3RJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdCA9XHJcbiAgICAgICAgICAgICAgICBiaXRzQ291bnRJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdCAtIDE7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocmVtYWluaW5nQml0cyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYml0c0NvdW50SW5jbHVkaW5nVGVybWluYXRpbmdCaXQgPiByZW1haW5pbmdCaXRzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlQml0c0Zyb21CeXRlKHN0YXRlLCByZW1haW5pbmdCaXRzKTtcclxuICAgICAgICAgICAgICAgICAgICBjb3VudGVkQml0cyArPSByZW1haW5pbmdCaXRzO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZW1haW5pbmdCaXRzIC09IGJpdHNDb3VudE5vdEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb3VudGVkQml0cyArPSBiaXRzQ291bnROb3RJbmNsdWRpbmdUZXJtaW5hdGluZ0JpdDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvdW5kVGVybWluYXRpbmdCaXQgPVxyXG4gICAgICAgICAgICAgICAgYml0c0NvdW50SW5jbHVkaW5nVGVybWluYXRpbmdCaXQgPD0gc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZTtcclxuXHJcbiAgICAgICAgICAgIGlmIChmb3VuZFRlcm1pbmF0aW5nQml0KSB7XHJcbiAgICAgICAgICAgICAgICByZW1vdmVCaXRzRnJvbUJ5dGUoc3RhdGUsIGJpdHNDb3VudEluY2x1ZGluZ1Rlcm1pbmF0aW5nQml0KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSB3aGlsZSAoIWZvdW5kVGVybWluYXRpbmdCaXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjb3VudGVkQml0cztcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gcmVtb3ZlQml0c0Zyb21CeXRlKHN0YXRlLCBiaXRzQ291bnQpIHtcclxuICAgICAgICBzdGF0ZS52YWxpZEJpdHNJbkN1cnJlbnRCeXRlIC09IGJpdHNDb3VudDtcclxuICAgICAgICBpZiAoc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSA+IDApIHtcclxuICAgICAgICAgICAgc3RhdGUuY3VycmVudEJ5dGUgPSAoc3RhdGUuY3VycmVudEJ5dGUgPDwgYml0c0NvdW50KSAmIDB4RkY7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHRyeVZhbGlkYXRlQ3VycmVudEJ5dGUoZGF0YWJpbiwgc3RhdGUpIHtcclxuICAgICAgICBpZiAoc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSA+IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBieXRlc05lZWRlZCA9IHN0YXRlLmlzU2tpcE5leHRCeXRlID8gMiA6IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdEFycmF5ID0gW107XHJcbiAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gZGF0YWJpbi5jb3B5Qnl0ZXMocmVzdWx0QXJyYXksIC8qcmVzdWx0U3RhcnRPZmZzZXQ9Ki8wLCB7XHJcbiAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICBkYXRhYmluU3RhcnRPZmZzZXQ6IHN0YXRlLm5leHRPZmZzZXRUb1BhcnNlLFxyXG4gICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IGJ5dGVzTmVlZGVkXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChieXRlc0NvcGllZCAhPT0gYnl0ZXNOZWVkZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIHByZXZCeXRlID0gc3RhdGUub3JpZ2luYWxCeXRlV2l0aG91dFNoaWZ0O1xyXG5cclxuICAgICAgICBzdGF0ZS5jdXJyZW50Qnl0ZSA9IHJlc3VsdEFycmF5W2J5dGVzTmVlZGVkIC0gMV07XHJcbiAgICAgICAgc3RhdGUudmFsaWRCaXRzSW5DdXJyZW50Qnl0ZSA9IDg7XHJcbiAgICAgICAgc3RhdGUub3JpZ2luYWxCeXRlV2l0aG91dFNoaWZ0ID0gc3RhdGUuY3VycmVudEJ5dGU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByZXZCeXRlID09PSAweEZGKSB7XHJcbiAgICAgICAgICAgIGlmICgocmVzdWx0QXJyYXlbMF0gJiAweDgwKSAhPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmoya0V4Y2VwdGlvbnMuSWxsZWdhbERhdGFFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0V4cGVjdGVkIDAgYml0IGFmdGVyIDB4RkYgYnl0ZScsICdCLjEwLjEnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gTm8gbmVlZCB0byBza2lwIGFub3RoZXIgYml0IGlmIGFscmVhZHkgc2tpcCB0aGUgd2hvbGUgYnl0ZVxyXG4gICAgICAgICAgICBpZiAoIXN0YXRlLmlzU2tpcE5leHRCeXRlKSB7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5jdXJyZW50Qnl0ZSA8PD0gMTtcclxuICAgICAgICAgICAgICAgIHN0YXRlLnZhbGlkQml0c0luQ3VycmVudEJ5dGUgPSA3O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHN0YXRlLmlzU2tpcE5leHRCeXRlID0gZmFsc2U7XHJcbiAgICAgICAgc3RhdGUubmV4dE9mZnNldFRvUGFyc2UgKz0gYnl0ZXNOZWVkZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gY3JlYXRlWmVyb0JpdHNVbnRpbEZpcnN0T25lQml0TWFwKCkge1xyXG4gICAgICAgIHZhciBhcnJheU1hcCA9IG5ldyBBcnJheSgyNTUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGFycmF5TWFwWzB4MDBdID0gOTtcclxuICAgICAgICBhcnJheU1hcFsweDAxXSA9IDg7XHJcbiAgICAgICAgYXJyYXlNYXBbMHgwMl0gPSA3O1xyXG4gICAgICAgIGFycmF5TWFwWzB4MDNdID0gNztcclxuICAgICAgICBcclxuICAgICAgICB2YXIgaTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGkgPSAweDA0OyBpIDw9IDB4MDc7ICsraSkge1xyXG4gICAgICAgICAgICBhcnJheU1hcFtpXSA9IDY7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAoaSA9IDB4MDg7IGkgPD0gMHgwRjsgKytpKSB7XHJcbiAgICAgICAgICAgIGFycmF5TWFwW2ldID0gNTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoaSA9IDB4MTA7IGkgPD0gMHgxRjsgKytpKSB7XHJcbiAgICAgICAgICAgIGFycmF5TWFwW2ldID0gNDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoaSA9IDB4MjA7IGkgPD0gMHgzRjsgKytpKSB7XHJcbiAgICAgICAgICAgIGFycmF5TWFwW2ldID0gMztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yIChpID0gMHg0MDsgaSA8PSAweDdGOyArK2kpIHtcclxuICAgICAgICAgICAgYXJyYXlNYXBbaV0gPSAyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGkgPSAweDgwOyBpIDw9IDB4RkY7ICsraSkge1xyXG4gICAgICAgICAgICBhcnJheU1hcFtpXSA9IDE7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEF2b2lkIHR3bydzIGNvbXBsZW1lbnQgcHJvYmxlbXNcclxuICAgICAgICBmb3IgKGkgPSAwOyBpIDw9IDB4RkY7ICsraSkge1xyXG4gICAgICAgICAgICBhcnJheU1hcFtpIC0gMHgxMDBdID0gYXJyYXlNYXBbaV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBhcnJheU1hcDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIEpwaXBCaXRzdHJlYW1SZWFkZXI7XHJcbn0pKCk7IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24gSnBpcENvZGVibG9ja0xlbmd0aFBhcnNlckNsb3N1cmUoKSB7XHJcbiAgICAvLyBCLjEwLjcuXHJcbiAgICBcclxuICAgIHZhciBleGFjdExvZzJUYWJsZSA9IGNyZWF0ZUV4YWN0TG9nMlRhYmxlKCk7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIEpwaXBDb2RlYmxvY2tMZW5ndGhQYXJzZXIoYml0c3RyZWFtUmVhZGVyLCB0cmFuc2FjdGlvbkhlbHBlcikge1xyXG4gICAgICAgIHZhciBsQmxvY2sgPSB0cmFuc2FjdGlvbkhlbHBlci5jcmVhdGVUcmFuc2FjdGlvbmFsT2JqZWN0KHtcclxuICAgICAgICAgICAgbEJsb2NrVmFsdWU6IDNcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5wYXJzZSA9IGZ1bmN0aW9uIHBhcnNlKGNvZGluZ1Bhc3Nlcykge1xyXG4gICAgICAgICAgICB2YXIgYWRkVG9MQmxvY2sgPSBiaXRzdHJlYW1SZWFkZXIuY291bnRPbmVzQW5kU2hpZnRVbnRpbEZpcnN0WmVyb0JpdCgpO1xyXG4gICAgICAgICAgICBpZiAoYWRkVG9MQmxvY2sgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbEJsb2NrU3RhdGUgPSBsQmxvY2suZ2V0VmFsdWUoYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uKTtcclxuICAgICAgICAgICAgbEJsb2NrU3RhdGUubEJsb2NrVmFsdWUgKz0gYWRkVG9MQmxvY2s7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgY29kaW5nUGFzc2VzTG9nMiA9IGV4YWN0TG9nMlRhYmxlW2NvZGluZ1Bhc3Nlc107XHJcbiAgICAgICAgICAgIGlmIChjb2RpbmdQYXNzZXNMb2cyID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIHZhbHVlIG9mIGNvZGluZyBwYXNzZXMgJyArIGNvZGluZ1Bhc3NlcyArXHJcbiAgICAgICAgICAgICAgICAgICAgJy4gRXhwZWN0ZWQgcG9zaXRpdmUgaW50ZWdlciA8PSAxNjQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGJpdHNDb3VudCA9IGxCbG9ja1N0YXRlLmxCbG9ja1ZhbHVlICsgY29kaW5nUGFzc2VzTG9nMjtcclxuICAgICAgICAgICAgdmFyIGxlbmd0aCA9IGJpdHN0cmVhbVJlYWRlci5zaGlmdEJpdHMoYml0c0NvdW50KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBsZW5ndGg7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlRXhhY3RMb2cyVGFibGUoKSB7XHJcbiAgICAgICAgdmFyIG1heENvZGluZ1Bhc3Nlc1Bvc3NpYmxlID0gMTY0O1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgQXJyYXkobWF4Q29kaW5nUGFzc2VzUG9zc2libGUpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpbnB1dFZhbHVlTG93ZXJCb3VuZCA9IDE7XHJcbiAgICAgICAgdmFyIGlucHV0VmFsdWVVcHBlckJvdW5kID0gMjtcclxuICAgICAgICB2YXIgbG9nMlJlc3VsdCA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGlucHV0VmFsdWVMb3dlckJvdW5kIDw9IG1heENvZGluZ1Bhc3Nlc1Bvc3NpYmxlKSB7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSBpbnB1dFZhbHVlTG93ZXJCb3VuZDsgaSA8IGlucHV0VmFsdWVVcHBlckJvdW5kOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdFtpXSA9IGxvZzJSZXN1bHQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlucHV0VmFsdWVMb3dlckJvdW5kICo9IDI7XHJcbiAgICAgICAgICAgIGlucHV0VmFsdWVVcHBlckJvdW5kICo9IDI7XHJcbiAgICAgICAgICAgICsrbG9nMlJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIEpwaXBDb2RlYmxvY2tMZW5ndGhQYXJzZXI7XHJcbn0pKCk7IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24gSnBpcENvZGluZ1Bhc3Nlc051bWJlclBhcnNlckNsb3N1cmUoKSB7XHJcbiAgICAvLyBUYWJsZSBCLjQgaW4gcGFydCAxIG9mIHRoZSBKcGVnMjAwMCBzdGFuZGFyZCBzaG93cyA3IGNhc2VzXHJcbiAgICAvLyBvZiB2YWx1ZXMuIFRoZSBhbGdvcml0aG0gc2hvd24gaGVyZSBzZXBhcmF0ZXMgdGhvc2UgY2FzZXNcclxuICAgIC8vIGludG8gMTYgY2FzZXMsIGRlcGVuZHMgb24gdGhlIG51bWJlciBvZiBvbmVzIGluIHRoZSBwcmVmaXhcclxuICAgIC8vIG9mIHRoZSBjb2RlZCBudW1iZXIgdW50aWwgdGhlIGZpcnN0IHplcm8uXHJcbiAgICAvLyBUaGUgcGFyc2luZyBpcyBkb25lIGluIHR3byBzdGFnZXM6IGZpcnN0IHdlIGNvdW50IHRoZSBvbmVzIHVudGlsXHJcbiAgICAvLyB0aGUgZmlyc3QgemVybywgbGF0ZXIgd2UgcGFyc2UgdGhlIG90aGVyIGJpdHMuXHJcbiAgICBcclxuICAgIC8vIEZvciBleGFtcGxlLCB0aGUgY2FzZSBvZiAxMTAxICh3aGljaCByZXByZXNlbnRzIDQgYWNjb3JkaW5nIHRvXHJcbiAgICAvLyB0YWJsZSBCLjQpIGlzIHBhcnNlZCBpbiB0d28gc3RhZ2VzLiBGaXJzdCB3ZSBjb3VudCB0aGUgb25lcyBpblxyXG4gICAgLy8gdGhlIGJlZ2lubmluZyB1bnRpbCB0aGUgZmlyc3QgemVybywgdGhlIHJlc3VsdCBpcyAyICgnMTEwJykuIFRoZW4gd2VcclxuICAgIC8vIHBhcnNlIHRoZSBvdGhlciBiaXRzICgnMScpLlxyXG4gICAgXHJcbiAgICAvLyBBZnRlciB0aGUgZmlyc3QgcGFyc2luZyBzdGFnZSAoY291bnQgb2Ygb25lcyksIHdlIGtub3cgdHdvIHRoaW5nczpcclxuICAgIC8vIC0gSG93IG1hbnkgYml0cyB3ZSBuZWVkIHRvIHRha2UgYWZ0ZXIgdGhlIGZpcnN0IHplcm8gKHNpbmdsZSBiaXQgaW5cclxuICAgIC8vICAgdGhlIGFib3ZlIGNhc2Ugb2YgJzExMCcgcHJlZml4KS5cclxuICAgIC8vIC0gSG93IG11Y2ggd2UgbmVlZCB0byBhZGQgdG8gdGhlIHJlc3VsdCBvZiBwYXJzaW5nIHRoZSBvdGhlciBiaXRzICgzXHJcbiAgICAvLyAgICAgaW4gdGhlIGFib3ZlIGNhc2Ugb2YgJzExMCcgcHJlZml4KS5cclxuICAgIFxyXG4gICAgLy8gQWN0dWFsbHkgdGhlIDE2IGNhc2VzIHdlcmUgZXh0cmFjdGVkIGZyb20gdGhlIHRhYmxlIHdpdGhvdXQgYW55IGZvcm11bGEsXHJcbiAgICAvLyBzbyB3ZSBjYW4gcmVmZXIgdGhlIG51bWJlciBvZiBvbmVzIGFzICdrZXl3b3Jkcycgb25seS5cclxuXHJcbiAgICB2YXIgYml0c05lZWRlZEFmdGVyQ291bnRPZk9uZXMgPSBjcmVhdGVCaXRzTmVlZGVkQWZ0ZXJDb3VudE9mT25lc01hcCgpO1xyXG4gICAgdmFyIGFkZFRvUmVzdWx0QWZ0ZXJDb3VudE9mT25lcyA9IGNyZWF0ZUFkZFRvUmVzdWx0QWZ0ZXJDb3VudE9mT25lc01hcCgpO1xyXG5cclxuICAgIHZhciBqcGlwQ29kaW5nUGFzc2VzTnVtYmVyUGFyc2VyID0ge1xyXG4gICAgICAgIHBhcnNlOiBmdW5jdGlvbiBwYXJzZShiaXRzdHJlYW1SZWFkZXIpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBvbmVzQ291bnQgPSBiaXRzdHJlYW1SZWFkZXIuY291bnRPbmVzQW5kU2hpZnRVbnRpbEZpcnN0WmVyb0JpdChcclxuICAgICAgICAgICAgICAgIC8qbWF4Qml0c1RvU2hpZnQ9Ki8xNik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob25lc0NvdW50ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIG1vcmVCaXRzTmVlZGVkID0gYml0c05lZWRlZEFmdGVyQ291bnRPZk9uZXNbb25lc0NvdW50XTtcclxuICAgICAgICAgICAgdmFyIG1vcmVCaXRzID0gYml0c3RyZWFtUmVhZGVyLnNoaWZ0Qml0cyhtb3JlQml0c05lZWRlZCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobW9yZUJpdHMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgYWRkVG9SZXN1bHQgPSBhZGRUb1Jlc3VsdEFmdGVyQ291bnRPZk9uZXNbb25lc0NvdW50XTtcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IG1vcmVCaXRzICsgYWRkVG9SZXN1bHQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUJpdHNOZWVkZWRBZnRlckNvdW50T2ZPbmVzTWFwKCkge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgQXJyYXkoMTcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcwJzogQWZ0ZXIgMCBvbmVzIGFuZCBzaW5nbGUgemVybywgbmVlZHMgbm8gbW9yZSBiaXRzXHJcbiAgICAgICAgcmVzdWx0WzBdID0gMDtcclxuXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzEwJzogQWZ0ZXIgMSBvbmVzIGFuZCBzaW5nbGUgemVybywgbmVlZHMgbm8gbW9yZSBiaXRzXHJcbiAgICAgICAgcmVzdWx0WzFdID0gMDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMHgnOiBBZnRlciAyIG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBuZWVkcyBhbm90aGVyIGJpdFxyXG4gICAgICAgIHJlc3VsdFsyXSA9IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzExMTAnOiBBZnRlciAzIG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBuZWVkcyBubyBtb3JlIGJpdHNcclxuICAgICAgICByZXN1bHRbM10gPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlcyBvZiAnMTExMSAwMDAwIDAnIHRvICcxMTExIDExMTEgMCc6XHJcbiAgICAgICAgLy8gQWZ0ZXIgNCB0byA4IG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBuZWVkcyBiaXRzIHRvIGNvbXBsZXRlIHRvIDkgYml0c1xyXG4gICAgICAgIHJlc3VsdFs0XSA9IDQ7XHJcbiAgICAgICAgcmVzdWx0WzVdID0gMztcclxuICAgICAgICByZXN1bHRbNl0gPSAyO1xyXG4gICAgICAgIHJlc3VsdFs3XSA9IDE7XHJcbiAgICAgICAgcmVzdWx0WzhdID0gMDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMTEgMTExMTEgLi4uJ1xyXG4gICAgICAgIC8vIEFmdGVyIGF0IGxlYXN0IDkgb25lcyBhbmQgc2luZ2xlIHplcm8sIG5lZWRzIGJpdHMgdG8gY29tcGxldGUgdG8gMTYgYml0c1xyXG4gICAgICAgIHJlc3VsdFs5XSA9IDY7XHJcbiAgICAgICAgcmVzdWx0WzEwXSA9IDU7XHJcbiAgICAgICAgcmVzdWx0WzExXSA9IDQ7XHJcbiAgICAgICAgcmVzdWx0WzEyXSA9IDM7XHJcbiAgICAgICAgcmVzdWx0WzEzXSA9IDI7XHJcbiAgICAgICAgcmVzdWx0WzE0XSA9IDE7XHJcbiAgICAgICAgcmVzdWx0WzE1XSA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzExMTEgMTExMTEgMTExMSAxMTEnXHJcbiAgICAgICAgcmVzdWx0WzE2XSA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlQWRkVG9SZXN1bHRBZnRlckNvdW50T2ZPbmVzTWFwKCkge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgQXJyYXkoMTcpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcwJyAoY29kZXdvcmQgZm9yIDEpOlxyXG4gICAgICAgIC8vIEFmdGVyIDAgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCAxIHRvIG90aGVyIDAgYml0cyB2YWx1ZVxyXG4gICAgICAgIHJlc3VsdFswXSA9IDE7XHJcblxyXG4gICAgICAgIC8vIFRoZSBjYXNlIG9mICcxMCcgKGNvZGV3b3JkIGZvciAyKTpcclxuICAgICAgICAvLyBBZnRlciAxIG9uZXMgYW5kIHNpbmdsZSB6ZXJvLCBhZGQgMiB0byBvdGhlciAwIGJpdHMgdmFsdWVcclxuICAgICAgICByZXN1bHRbMV0gPSAyO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFRoZSBjYXNlcyBvZiAnMTEweCcgKGNvZGV3b3JkcyBmb3IgMyBhbmQgNCk6XHJcbiAgICAgICAgLy8gQWZ0ZXIgMiBvbmVzIGFuZCBzaW5nbGUgemVybywgYWRkIDMgdG8gb3RoZXIgc2luZ2xlIGJpdCB2YWx1ZVxyXG4gICAgICAgIHJlc3VsdFsyXSA9IDM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGhlIGNhc2Ugb2YgJzExMTAnIChjb2Rld29yZCBmb3IgNSk6XHJcbiAgICAgICAgLy8gQWZ0ZXIgMyBvbmVzIGFuZCBzaW5nbGUgemVybywgYWRkIDUgdG8gb3RoZXIgMCBiaXRzIHZhbHVlXHJcbiAgICAgICAgcmVzdWx0WzNdID0gNTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMTEgMDAwMCAwJyB0byAnMTExMSAxMTExIDAnIChjb2Rld29yZHMgZm9yIDYgdG8gMzYpOlxyXG4gICAgICAgIC8vIEFmdGVyIDQgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCA2IHRvIG90aGVyIDAvMS8yLzMvNCBiaXRzIHZhbHVlXHJcbiAgICAgICAgcmVzdWx0WzRdID0gNiArIDB4MDA7IC8vIGIwMDAwMFxyXG4gICAgICAgIHJlc3VsdFs1XSA9IDYgKyAweDEwOyAvLyBiMTAwMDBcclxuICAgICAgICByZXN1bHRbNl0gPSA2ICsgMHgxODsgLy8gYjExMDAwXHJcbiAgICAgICAgcmVzdWx0WzddID0gNiArIDB4MUM7IC8vIGIxMTEwMFxyXG4gICAgICAgIHJlc3VsdFs4XSA9IDYgKyAweDFFOyAvLyBiMTExMTBcclxuICAgICAgICBcclxuICAgICAgICAvLyBUaGUgY2FzZXMgb2YgJzExMTEgMTExMTEgLi4uJyAoY29kZXdvcmRzIGZvciAzNyB0byAxNjQpOlxyXG4gICAgICAgIC8vIEFmdGVyIDkgb25lcyBhbmQgc2luZ2xlIHplcm8sIGFkZCAzNyB0byBvdGhlciAwLzEvMi8zLzQvNS82IGJpdHMgdmFsdWVcclxuICAgICAgICByZXN1bHRbIDldID0gMzcgKyAweDAwOyAvLyBiMDAwMDAwXHJcbiAgICAgICAgcmVzdWx0WzEwXSA9IDM3ICsgMHg0MDsgLy8gYjEwMDAwMFxyXG4gICAgICAgIHJlc3VsdFsxMV0gPSAzNyArIDB4NjA7IC8vIGIxMTAwMDBcclxuICAgICAgICByZXN1bHRbMTJdID0gMzcgKyAweDcwOyAvLyBiMTExMDAwXHJcbiAgICAgICAgcmVzdWx0WzEzXSA9IDM3ICsgMHg3ODsgLy8gYjExMTEwMFxyXG4gICAgICAgIHJlc3VsdFsxNF0gPSAzNyArIDB4N0M7IC8vIGIxMTExMTBcclxuICAgICAgICByZXN1bHRbMTVdID0gMzcgKyAweDdFOyAvLyBiMTExMTExXHJcbiAgICAgICAgcmVzdWx0WzE2XSA9IDM3ICsgMHg3RjsgLy8gYjExMTExMVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBqcGlwQ29kaW5nUGFzc2VzTnVtYmVyUGFyc2VyO1xyXG59KSgpOyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcFBhY2tldExlbmd0aENhbGN1bGF0b3IoXHJcbiAgICB0aWxlU3RydWN0dXJlLFxyXG4gICAgY29tcG9uZW50U3RydWN0dXJlLFxyXG4gICAgZGF0YWJpbixcclxuICAgIHN0YXJ0T2Zmc2V0SW5EYXRhYmluLFxyXG4gICAgcHJlY2luY3QsXHJcbiAgICBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgY2FsY3VsYXRlZExlbmd0aHMgPSBbXTtcclxuICAgIFxyXG4gICAgdmFyIGJpdHN0cmVhbVJlYWRlciA9IGpwaXBGYWN0b3J5LmNyZWF0ZUJpdHN0cmVhbVJlYWRlcihkYXRhYmluKTtcclxuICAgIFxyXG4gICAgdmFyIG51bUNvZGVibG9ja3NYID1cclxuICAgICAgICBjb21wb25lbnRTdHJ1Y3R1cmUuZ2V0TnVtQ29kZWJsb2Nrc1hJblByZWNpbmN0KHByZWNpbmN0KTtcclxuICAgIHZhciBudW1Db2RlYmxvY2tzWSA9XHJcbiAgICAgICAgY29tcG9uZW50U3RydWN0dXJlLmdldE51bUNvZGVibG9ja3NZSW5QcmVjaW5jdChwcmVjaW5jdCk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgbnVtUXVhbGl0eUxheWVyc0luVGlsZSA9IHRpbGVTdHJ1Y3R1cmUuZ2V0TnVtUXVhbGl0eUxheWVycygpO1xyXG4gICAgdmFyIGlzUGFja2V0SGVhZGVyTmVhckRhdGEgPSB0aWxlU3RydWN0dXJlLmdldElzUGFja2V0SGVhZGVyTmVhckRhdGEoKTtcclxuICAgIHZhciBpc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkID0gdGlsZVN0cnVjdHVyZS5nZXRJc1N0YXJ0T2ZQYWNrZXRNYXJrZXJBbGxvd2VkKCk7XHJcbiAgICB2YXIgaXNFbmRQYWNrZXRIZWFkZXJNYXJrZXJBbGxvd2VkID1cclxuICAgICAgICB0aWxlU3RydWN0dXJlLmdldElzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCgpO1xyXG4gICAgXHJcbiAgICB2YXIgc3ViYmFuZFBhcnNlcnMgPSBpbml0U3ViYmFuZFBhcnNlcnMoKTtcclxuICAgIFxyXG4gICAgdGhpcy5jYWxjdWxhdGVFbmRPZmZzZXRPZkxhc3RGdWxsUGFja2V0ID1cclxuICAgICAgICBmdW5jdGlvbiBjYWxjdWxhdGVGdWxsUGFja2V0c0F2YWlsYWJsZU9mZnNldHMocXVhbGl0eSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc0FsbG93ZWRGdWxsUXVhbGl0eSA9XHJcbiAgICAgICAgICAgIHF1YWxpdHkgPT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICAgICAgICBxdWFsaXR5ID49IG51bVF1YWxpdHlMYXllcnNJblRpbGU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVF1YWxpdHlMYXllcnNUb1BhcnNlO1xyXG4gICAgICAgIGlmICghaXNBbGxvd2VkRnVsbFF1YWxpdHkpIHtcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyc1RvUGFyc2UgPSBxdWFsaXR5O1xyXG4gICAgICAgIH0gZWxzZSBpZiAoIWRhdGFiaW4uaXNBbGxEYXRhYmluTG9hZGVkKCkpIHtcclxuICAgICAgICAgICAgbnVtUXVhbGl0eUxheWVyc1RvUGFyc2UgPSBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHZhciBlbmRPZmZzZXQgPSBkYXRhYmluLmdldERhdGFiaW5MZW5ndGhJZktub3duKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgZW5kT2Zmc2V0OiBlbmRPZmZzZXQsXHJcbiAgICAgICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzOiBudW1RdWFsaXR5TGF5ZXJzSW5UaWxlXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjaGVja1N1cHBvcnRlZFN0cnVjdHVyZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRyeVZhbGlkYXRlUGFja2V0cyhudW1RdWFsaXR5TGF5ZXJzVG9QYXJzZSk7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGdldEZ1bGxRdWFsaXR5TGF5ZXJzRW5kT2Zmc2V0KG51bVF1YWxpdHlMYXllcnNUb1BhcnNlKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleCA9IGZ1bmN0aW9uIGdldFBhY2tldE9mZnNldHNCeUNvZGVibG9ja0luZGV4KFxyXG4gICAgICAgIHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNoZWNrU3VwcG9ydGVkU3RydWN0dXJlKCk7XHJcbiAgICAgICAgdHJ5VmFsaWRhdGVQYWNrZXRzKHF1YWxpdHlMYXllciArIDEpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYWxjdWxhdGVkTGVuZ3Rocy5sZW5ndGggPD0gcXVhbGl0eUxheWVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY2FsY3VsYXRlZExlbmd0aHNbcXVhbGl0eUxheWVyXTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeVZhbGlkYXRlUGFja2V0cyhxdWFsaXR5TGF5ZXJzKSB7XHJcbiAgICAgICAgd2hpbGUgKGNhbGN1bGF0ZWRMZW5ndGhzLmxlbmd0aCA8IHF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLnN0YXJ0TmV3VHJhbnNhY3Rpb24oKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXh0UGFja2V0ID0gdHJ5Q2FsY3VsYXRlTmV4dFBhY2tldExlbmd0aChcclxuICAgICAgICAgICAgICAgIGNhbGN1bGF0ZWRMZW5ndGhzLmxlbmd0aCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAobmV4dFBhY2tldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uLmFib3J0KCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNhbGN1bGF0ZWRMZW5ndGhzLnB1c2gobmV4dFBhY2tldCk7XHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbi5jb21taXQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHRyeUNhbGN1bGF0ZU5leHRQYWNrZXRMZW5ndGgocXVhbGl0eUxheWVyKSB7XHJcbiAgICAgICAgdmFyIGhlYWRlclN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIGlmIChxdWFsaXR5TGF5ZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHZhciBsYXN0ID0gY2FsY3VsYXRlZExlbmd0aHNbcXVhbGl0eUxheWVyIC0gMV07XHJcbiAgICAgICAgICAgIGhlYWRlclN0YXJ0T2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIGxhc3QuaGVhZGVyU3RhcnRPZmZzZXQgK1xyXG4gICAgICAgICAgICAgICAgbGFzdC5oZWFkZXJMZW5ndGggK1xyXG4gICAgICAgICAgICAgICAgbGFzdC5vdmVyYWxsQm9keUxlbmd0aEJ5dGVzO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGhlYWRlclN0YXJ0T2Zmc2V0ID0gc3RhcnRPZmZzZXRJbkRhdGFiaW47XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICBiaXRzdHJlYW1SZWFkZXIuZGF0YWJpbk9mZnNldCA9IGhlYWRlclN0YXJ0T2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChpc1BhY2tldEhlYWRlck5lYXJEYXRhICYmIGlzU3RhcnRPZlBhY2tldE1hcmtlckFsbG93ZWQpIHtcclxuICAgICAgICAgICAgdmFyIGlzTWFya2VyID0gaXNNYXJrZXJIZXJlKDB4OTEpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzTWFya2VyID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChpc01hcmtlcikge1xyXG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0T2ZQYWNrZXRTZWdtZW50TGVuZ3RoID0gNjtcclxuICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5kYXRhYmluT2Zmc2V0ICs9IHN0YXJ0T2ZQYWNrZXRTZWdtZW50TGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBpc1BhY2tldEV4aXN0SW5RdWFsaXR5TGF5ZXIgPSBiaXRzdHJlYW1SZWFkZXIuc2hpZnRCaXQoKTtcclxuICAgICAgICBpZiAoaXNQYWNrZXRFeGlzdEluUXVhbGl0eUxheWVyID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWlzUGFja2V0RXhpc3RJblF1YWxpdHlMYXllcikge1xyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuc2hpZnRSZW1haW5pbmdCaXRzSW5CeXRlKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBoZWFkZXJTdGFydE9mZnNldDogaGVhZGVyU3RhcnRPZmZzZXQsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJMZW5ndGg6IDEsXHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleDogW10sXHJcbiAgICAgICAgICAgICAgICBvdmVyYWxsQm9keUxlbmd0aEJ5dGVzOiAwXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYm9keUxlbmd0aCA9IGFjdHVhbENhbGN1bGF0ZVBhY2tldExlbmd0aEFmdGVyWmVyb0xlbmd0aEJpdChcclxuICAgICAgICAgICAgcXVhbGl0eUxheWVyKTtcclxuICAgICAgICBpZiAoYm9keUxlbmd0aCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhlYWRlckVuZE9mZnNldCA9IGJpdHN0cmVhbVJlYWRlci5kYXRhYmluT2Zmc2V0O1xyXG4gICAgICAgIGJvZHlMZW5ndGguaGVhZGVyTGVuZ3RoID0gaGVhZGVyRW5kT2Zmc2V0IC0gaGVhZGVyU3RhcnRPZmZzZXQ7XHJcblxyXG4gICAgICAgIGJvZHlMZW5ndGguaGVhZGVyU3RhcnRPZmZzZXQgPSBoZWFkZXJTdGFydE9mZnNldDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYm9keUxlbmd0aDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gYWN0dWFsQ2FsY3VsYXRlUGFja2V0TGVuZ3RoQWZ0ZXJaZXJvTGVuZ3RoQml0KHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIHZhciBib2R5Qnl0ZXMgPSAwO1xyXG4gICAgICAgIHZhciBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleCA9IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgc3ViYmFuZCA9IDA7IHN1YmJhbmQgPCBzdWJiYW5kUGFyc2Vycy5sZW5ndGg7ICsrc3ViYmFuZCkge1xyXG4gICAgICAgICAgICB2YXIgcGFyc2VyID0gc3ViYmFuZFBhcnNlcnNbc3ViYmFuZF07XHJcbiAgICAgICAgICAgIHZhciBzdWJiYW5kQm9keUxlbmd0aCA9IHBhcnNlci5jYWxjdWxhdGVTdWJiYW5kTGVuZ3RoKHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoc3ViYmFuZEJvZHlMZW5ndGggPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXggPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4ID1cclxuICAgICAgICAgICAgICAgICAgICBzdWJiYW5kQm9keUxlbmd0aC5jb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleDtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4ID0gY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXguY29uY2F0KFxyXG4gICAgICAgICAgICAgICAgICAgIHN1YmJhbmRCb2R5TGVuZ3RoLmNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgYm9keUJ5dGVzICs9IHN1YmJhbmRCb2R5TGVuZ3RoLm92ZXJhbGxCb2R5TGVuZ3RoQnl0ZXM7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBiaXRzdHJlYW1SZWFkZXIuc2hpZnRSZW1haW5pbmdCaXRzSW5CeXRlKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGlzRW5kUGFja2V0SGVhZGVyTWFya2VyQWxsb3dlZCkge1xyXG4gICAgICAgICAgICB2YXIgaXNNYXJrZXIgPSBpc01hcmtlckhlcmUoMHg5Mik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaXNNYXJrZXIgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzTWFya2VyKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZW5kUGFja2V0SGVhZGVyTWFya2VyTGVuZ3RoID0gMjtcclxuICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5kYXRhYmluT2Zmc2V0ICs9IGVuZFBhY2tldEhlYWRlck1hcmtlckxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleDogY29kZWJsb2NrQm9keUxlbmd0aEJ5SW5kZXgsXHJcbiAgICAgICAgICAgIG92ZXJhbGxCb2R5TGVuZ3RoQnl0ZXM6IGJvZHlCeXRlc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRGdWxsUXVhbGl0eUxheWVyc0VuZE9mZnNldChxdWFsaXR5KSB7XHJcbiAgICAgICAgdmFyIG51bVBhcnNlZFF1YWxpdHlMYXllciA9IE1hdGgubWluKFxyXG4gICAgICAgICAgICBxdWFsaXR5LCBjYWxjdWxhdGVkTGVuZ3Rocy5sZW5ndGgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChudW1QYXJzZWRRdWFsaXR5TGF5ZXIgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIGVuZE9mZnNldDogc3RhcnRPZmZzZXRJbkRhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICBudW1RdWFsaXR5TGF5ZXJzOiAwXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGFzdFBhY2tldCA9IGNhbGN1bGF0ZWRMZW5ndGhzW251bVBhcnNlZFF1YWxpdHlMYXllciAtIDFdO1xyXG4gICAgICAgIHZhciBlbmRPZmZzZXQgPVxyXG4gICAgICAgICAgICBsYXN0UGFja2V0LmhlYWRlclN0YXJ0T2Zmc2V0ICtcclxuICAgICAgICAgICAgbGFzdFBhY2tldC5oZWFkZXJMZW5ndGggK1xyXG4gICAgICAgICAgICBsYXN0UGFja2V0Lm92ZXJhbGxCb2R5TGVuZ3RoQnl0ZXM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgZW5kT2Zmc2V0OiBlbmRPZmZzZXQsXHJcbiAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnM6IG51bVBhcnNlZFF1YWxpdHlMYXllclxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGluaXRTdWJiYW5kUGFyc2VycygpIHtcclxuICAgICAgICB2YXIgbnVtU3ViYmFuZHMgPSBwcmVjaW5jdC5yZXNvbHV0aW9uTGV2ZWwgPT09IDAgPyAxIDogMztcclxuICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1TdWJiYW5kczsgKytpKSB7XHJcbiAgICAgICAgICAgIHZhciBudW1Db2RlYmxvY2tzWEluU3ViYmFuZDtcclxuICAgICAgICAgICAgdmFyIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kO1xyXG4gICAgICAgICAgICBpZiAocHJlY2luY3QucmVzb2x1dGlvbkxldmVsID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBudW1Db2RlYmxvY2tzWEluU3ViYmFuZCA9IG51bUNvZGVibG9ja3NYO1xyXG4gICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQgPSBudW1Db2RlYmxvY2tzWTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIFRyZWF0IHRoZSBlZGdlIGNhc2Ugb2Ygc2luZ2xlIHJlZHVuZGFudCBwaXhlbHMgY29sdW1uXHJcbiAgICAgICAgICAgICAgICAvLyAoSW4gb3RoZXIgY2FzZXMsIG51bUNvZGVibG9ja3NYIGlzIGZ1bGwgZHVwbGljYXRpb24gb2YgMi5cclxuICAgICAgICAgICAgICAgIC8vIFNlZSBKcGlwQ29tcG9uZW50U3RydWN0dXJlIGltcGxlbWVudGF0aW9uKS5cclxuICAgICAgICAgICAgICAgIGlmIChpID09PSAxKSB7IC8vIExIXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQgPSBNYXRoLmNlaWwobnVtQ29kZWJsb2Nrc1ggLyAyKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7IC8vIEhMIG9yIEhIXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1hJblN1YmJhbmQgPSBNYXRoLmZsb29yKG51bUNvZGVibG9ja3NYIC8gMik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIFRyZWF0IHRoZSBlZGdlIGNhc2Ugb2Ygc2luZ2xlIHJlZHVuZGFudCBwaXhlbHMgcm93XHJcbiAgICAgICAgICAgICAgICAvLyAoSW4gb3RoZXIgY2FzZXMsIG51bUNvZGVibG9ja3NZIGlzIGZ1bGwgZHVwbGljYXRpb24gb2YgMi5cclxuICAgICAgICAgICAgICAgIC8vIFNlZSBKcGlwQ29tcG9uZW50U3RydWN0dXJlIGltcGxlbWVudGF0aW9uKS5cclxuICAgICAgICAgICAgICAgIGlmIChpID09PSAwKSB7IC8vIEhMXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQgPSBNYXRoLmNlaWwobnVtQ29kZWJsb2Nrc1kgLyAyKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7IC8vIExIIG9yIEhIXHJcbiAgICAgICAgICAgICAgICAgICAgbnVtQ29kZWJsb2Nrc1lJblN1YmJhbmQgPSBNYXRoLmZsb29yKG51bUNvZGVibG9ja3NZIC8gMik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChudW1Db2RlYmxvY2tzWEluU3ViYmFuZCA9PT0gMCB8fCBudW1Db2RlYmxvY2tzWUluU3ViYmFuZCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGpwaXBGYWN0b3J5LmNyZWF0ZVN1YmJhbmRMZW5ndGhJblBhY2tldEhlYWRlckNhbGN1bGF0b3IoXHJcbiAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIsXHJcbiAgICAgICAgICAgICAgICBudW1Db2RlYmxvY2tzWEluU3ViYmFuZCxcclxuICAgICAgICAgICAgICAgIG51bUNvZGVibG9ja3NZSW5TdWJiYW5kKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGlzTWFya2VySGVyZShtYXJrZXJTZWNvbmRCeXRlKSB7XHJcbiAgICAgICAgdmFyIHBvc3NpYmxlTWFya2VyID0gbmV3IEFycmF5KDIpO1xyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGRhdGFiaW4uY29weUJ5dGVzKFxyXG4gICAgICAgICAgICBwb3NzaWJsZU1hcmtlcixcclxuICAgICAgICAgICAgLypyZXN1bHRTdGFydE9mZnNldD0qLzAsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGRhdGFiaW5TdGFydE9mZnNldDogYml0c3RyZWFtUmVhZGVyLmRhdGFiaW5PZmZzZXQsXHJcbiAgICAgICAgICAgICAgICBtYXhMZW5ndGhUb0NvcHk6IDIsXHJcbiAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogZmFsc2VcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChieXRlc0NvcGllZCkge1xyXG4gICAgICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICAgICAgICB2YXIgaXNNYXJrZXIgPVxyXG4gICAgICAgICAgICAgICAgICAgIHBvc3NpYmxlTWFya2VyWzBdID09PSAweEZGICYmXHJcbiAgICAgICAgICAgICAgICAgICAgcG9zc2libGVNYXJrZXJbMV0gPT09IG1hcmtlclNlY29uZEJ5dGU7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiBpc01hcmtlcjtcclxuXHJcbiAgICAgICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgICAgIGlmIChwb3NzaWJsZU1hcmtlclswXSA9PT0gMHhGRikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjaGVja1N1cHBvcnRlZFN0cnVjdHVyZSgpIHtcclxuICAgICAgICBpZiAoIWlzUGFja2V0SGVhZGVyTmVhckRhdGEpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdQUE0gb3IgUFBUJywgJ0EuNy40IGFuZCBBLjcuNScpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBRdWFsaXR5TGF5ZXJzQ2FjaGUoXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB2YXIgQ0FDSEVfS0VZID0gJ3BhY2tldExlbmd0aENhbGN1bGF0b3InO1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFBhY2tldE9mZnNldHNCeUNvZGVibG9ja0luZGV4ID1cclxuICAgICAgICBmdW5jdGlvbiBnZXRQYWNrZXRPZmZzZXRzQnlDb2RlYmxvY2tJbmRleChcclxuICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLCBxdWFsaXR5TGF5ZXIsIHByZWNpbmN0UG9zaXRpb24pIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGFja2V0TGVuZ3RoQ2FsY3VsYXRvciA9IGdldFBhY2tldFBhcnNlcihcclxuICAgICAgICAgICAgcHJlY2luY3REYXRhYmluLCBwcmVjaW5jdFBvc2l0aW9uKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHBhY2tldExlbmd0aENhbGN1bGF0b3IuZ2V0UGFja2V0T2Zmc2V0c0J5Q29kZWJsb2NrSW5kZXgoXHJcbiAgICAgICAgICAgIHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuZ2V0UXVhbGl0eUxheWVyT2Zmc2V0ID0gZnVuY3Rpb24gZ2V0UXVhbGl0eUxheWVyT2Zmc2V0KFxyXG4gICAgICAgIHByZWNpbmN0RGF0YWJpbiwgcXVhbGl0eSwgcHJlY2luY3RQb3NpdGlvbikge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsb2FkZWRSYW5nZXMgPSBwcmVjaW5jdERhdGFiaW4uZ2V0RXhpc3RpbmdSYW5nZXMoKTtcclxuICAgICAgICB2YXIgZW5kT2Zmc2V0TG9hZGVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yID0gZ2V0UGFja2V0UGFyc2VyKFxyXG4gICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sIHByZWNpbmN0UG9zaXRpb24pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAobG9hZGVkUmFuZ2VzLmxlbmd0aCA8IDEgfHwgbG9hZGVkUmFuZ2VzWzBdLnN0YXJ0ID4gMCkge1xyXG4gICAgICAgICAgICBlbmRPZmZzZXRMb2FkZWQgPSAwO1xyXG4gICAgICAgICAgICBxdWFsaXR5ID0gMDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBlbmRPZmZzZXRMb2FkZWQgPSBsb2FkZWRSYW5nZXNbMF0uc3RhcnQgKyBsb2FkZWRSYW5nZXNbMF0ubGVuZ3RoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGF5ZXJzSW5QcmVjaW5jdCA9XHJcbiAgICAgICAgICAgIHBhY2tldExlbmd0aENhbGN1bGF0b3IuY2FsY3VsYXRlRW5kT2Zmc2V0T2ZMYXN0RnVsbFBhY2tldChcclxuICAgICAgICAgICAgICAgIHF1YWxpdHkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChlbmRPZmZzZXRMb2FkZWQgPCBsYXllcnNJblByZWNpbmN0LmVuZE9mZnNldCkge1xyXG4gICAgICAgICAgICB2YXIgcmVkdWNlZExheWVyc1RvU2VhcmNoID0gbGF5ZXJzSW5QcmVjaW5jdC5udW1RdWFsaXR5TGF5ZXJzIC0gMTtcclxuICAgICAgICAgICAgbGF5ZXJzSW5QcmVjaW5jdCA9IHBhY2tldExlbmd0aENhbGN1bGF0b3JcclxuICAgICAgICAgICAgICAgIC5jYWxjdWxhdGVFbmRPZmZzZXRPZkxhc3RGdWxsUGFja2V0KHJlZHVjZWRMYXllcnNUb1NlYXJjaCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBsYXllcnNJblByZWNpbmN0O1xyXG4gICAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBnZXRQYWNrZXRQYXJzZXIocHJlY2luY3REYXRhYmluLCBwcmVjaW5jdFBvc2l0aW9uKSB7XHJcbiAgICAgICAgdmFyIHBhY2tldExlbmd0aENhbGN1bGF0b3JDb250YWluZXIgPVxyXG4gICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4uZ2V0Q2FjaGVkRGF0YShDQUNIRV9LRVkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwYWNrZXRMZW5ndGhDYWxjdWxhdG9yQ29udGFpbmVyLmNhbGN1bGF0b3IgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcGFja2V0TGVuZ3RoQ2FsY3VsYXRvckNvbnRhaW5lci5jYWxjdWxhdG9yO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAocHJlY2luY3RQb3NpdGlvbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKCdwcmVjaW5jdFBvc2l0aW9uICcgK1xyXG4gICAgICAgICAgICAgICAgJ3Nob3VsZCBiZSBnaXZlbiBvbiB0aGUgZmlyc3QgdGltZSBvZiB1c2luZyBRdWFsaXR5TGF5ZXJzQ2FjaGUgJyArXHJcbiAgICAgICAgICAgICAgICAnb24gdGhpcyBwcmVjaW5jdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVN0cnVjdHVyZSA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVN0cnVjdHVyZShcclxuICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi50aWxlSW5kZXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb21wb25lbnRTdHJ1Y3R1cmUgPSB0aWxlU3RydWN0dXJlLmdldENvbXBvbmVudFN0cnVjdHVyZShcclxuICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbi5jb21wb25lbnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBwYWNrZXRMZW5ndGhDYWxjdWxhdG9yQ29udGFpbmVyLmNhbGN1bGF0b3IgPVxyXG4gICAgICAgICAgICBqcGlwRmFjdG9yeS5jcmVhdGVQYWNrZXRMZW5ndGhDYWxjdWxhdG9yKFxyXG4gICAgICAgICAgICAgICAgdGlsZVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0cnVjdHVyZSxcclxuICAgICAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbixcclxuICAgICAgICAgICAgICAgIC8qc3RhcnRPZmZzZXRJbkRhdGFiaW49Ki8wLFxyXG4gICAgICAgICAgICAgICAgcHJlY2luY3RQb3NpdGlvbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHBhY2tldExlbmd0aENhbGN1bGF0b3JDb250YWluZXIuY2FsY3VsYXRvcjtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9XHJcbiAgICBmdW5jdGlvbiBKcGlwU3ViYmFuZExlbmd0aEluUGFja2V0SGVhZGVyQ2FsY3VsYXRvcihcclxuICAgICAgICBiaXRzdHJlYW1SZWFkZXIsXHJcbiAgICAgICAgbnVtQ29kZWJsb2Nrc1gsXHJcbiAgICAgICAgbnVtQ29kZWJsb2Nrc1ksXHJcbiAgICAgICAgY29kaW5nUGFzc2VzTnVtYmVyUGFyc2VyLFxyXG4gICAgICAgIHRyYW5zYWN0aW9uSGVscGVyLFxyXG4gICAgICAgIGpwaXBGYWN0b3J5KSB7XHJcbiAgICBcclxuICAgIHZhciBjb2RlYmxvY2tMZW5ndGhQYXJzZXJzID0gbnVsbDtcclxuICAgIHZhciBpc0NvZGVibG9ja3NJbmNsdWRlZCA9IG51bGw7XHJcbiAgICB2YXIgcGFyc2VkUXVhbGl0eUxheWVycyA9IHRyYW5zYWN0aW9uSGVscGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxPYmplY3QoXHJcbiAgICAgICAgMCwgLyppc1ZhbHVlVHlwZT0qL3RydWUpO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIGluY2x1c2lvblRyZWUgPSBqcGlwRmFjdG9yeS5jcmVhdGVUYWdUcmVlKFxyXG4gICAgICAgIGJpdHN0cmVhbVJlYWRlciwgbnVtQ29kZWJsb2Nrc1gsIG51bUNvZGVibG9ja3NZKTtcclxuICAgIFxyXG4gICAgdmFyIHplcm9CaXRQbGFuZXNUcmVlID0ganBpcEZhY3RvcnkuY3JlYXRlVGFnVHJlZShcclxuICAgICAgICBiaXRzdHJlYW1SZWFkZXIsIG51bUNvZGVibG9ja3NYLCBudW1Db2RlYmxvY2tzWSk7XHJcbiAgICBcclxuICAgIHRoaXMuY2FsY3VsYXRlU3ViYmFuZExlbmd0aCA9IGZ1bmN0aW9uIGNhbGN1YWx0ZVN1YmJhbmRMZW5ndGgocXVhbGl0eUxheWVyKSB7XHJcbiAgICAgICAgZW5zdXJlUXVhbGl0eUxheWVyTm90UGFyc2VkWWV0KHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGF6eUluaXRBcnJheXMoKTtcclxuICAgICAgICBcclxuICAgICAgICBpbmNsdXNpb25UcmVlLnNldE1pbmltYWxWYWx1ZUlmTm90UmVhZEJpdHMocXVhbGl0eUxheWVyKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYWNjdW11bGF0ZWRCb2R5TGVuZ3RoQnl0ZXMgPSAwO1xyXG4gICAgICAgIHZhciBjb2RlYmxvY2tJbmRleCA9IDA7XHJcbiAgICAgICAgdmFyIGNvZGVibG9ja0xlbmd0aEJ5SW5kZXggPSBuZXcgQXJyYXkobnVtQ29kZWJsb2Nrc1ggKiBudW1Db2RlYmxvY2tzWSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCBudW1Db2RlYmxvY2tzWTsgKyt5KSB7XHJcbiAgICAgICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgbnVtQ29kZWJsb2Nrc1g7ICsreCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGNvZGVibG9ja0JvZHlMZW5ndGggPSBnZXROZXh0Q29kZWJsb2NrTGVuZ3RoKHgsIHksIHF1YWxpdHlMYXllcik7XHJcbiAgICAgICAgICAgICAgICBpZiAoY29kZWJsb2NrQm9keUxlbmd0aCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tMZW5ndGhCeUluZGV4W2NvZGVibG9ja0luZGV4KytdID0gY29kZWJsb2NrQm9keUxlbmd0aDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgYWNjdW11bGF0ZWRCb2R5TGVuZ3RoQnl0ZXMgKz1cclxuICAgICAgICAgICAgICAgICAgICBjb2RlYmxvY2tCb2R5TGVuZ3RoLmNvZGVibG9ja0JvZHlMZW5ndGhCeXRlcztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwYXJzZWRRdWFsaXR5TGF5ZXJzLnNldFZhbHVlKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24sIHF1YWxpdHlMYXllciArIDEpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGhCeUluZGV4OiBjb2RlYmxvY2tMZW5ndGhCeUluZGV4LFxyXG4gICAgICAgICAgICBvdmVyYWxsQm9keUxlbmd0aEJ5dGVzOiBhY2N1bXVsYXRlZEJvZHlMZW5ndGhCeXRlc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZW5zdXJlUXVhbGl0eUxheWVyTm90UGFyc2VkWWV0KHF1YWxpdHlMYXllcikge1xyXG4gICAgICAgIHZhciBwYXJzZWRRdWFsaXR5TGF5ZXJzVmFsdWUgPSBwYXJzZWRRdWFsaXR5TGF5ZXJzLmdldFZhbHVlKFxyXG4gICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwYXJzZWRRdWFsaXR5TGF5ZXJzVmFsdWUgPj0gcXVhbGl0eUxheWVyICsgMSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIHF1YWxpdHkgbGF5ZXIgdG8gcGFyc2UnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGxhenlJbml0QXJyYXlzKCkge1xyXG4gICAgICAgIGlmIChjb2RlYmxvY2tMZW5ndGhQYXJzZXJzICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29kZWJsb2NrTGVuZ3RoUGFyc2VycyA9IG5ldyBBcnJheShudW1Db2RlYmxvY2tzWCk7XHJcbiAgICAgICAgaXNDb2RlYmxvY2tzSW5jbHVkZWQgPSBuZXcgQXJyYXkobnVtQ29kZWJsb2Nrc1gpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgbnVtQ29kZWJsb2Nrc1g7ICsreCkge1xyXG4gICAgICAgICAgICBjb2RlYmxvY2tMZW5ndGhQYXJzZXJzW3hdID0gbmV3IEFycmF5KG51bUNvZGVibG9ja3NZKTtcclxuICAgICAgICAgICAgaXNDb2RlYmxvY2tzSW5jbHVkZWRbeF0gPSBuZXcgQXJyYXkobnVtQ29kZWJsb2Nrc1kpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCBudW1Db2RlYmxvY2tzWTsgKyt5KSB7XHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tMZW5ndGhQYXJzZXJzW3hdW3ldID1cclxuICAgICAgICAgICAgICAgICAgICBqcGlwRmFjdG9yeS5jcmVhdGVDb2RlYmxvY2tMZW5ndGhQYXJzZXIoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlciwgdHJhbnNhY3Rpb25IZWxwZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaXNDb2RlYmxvY2tzSW5jbHVkZWRbeF1beV0gPSB0cmFuc2FjdGlvbkhlbHBlclxyXG4gICAgICAgICAgICAgICAgICAgIC5jcmVhdGVUcmFuc2FjdGlvbmFsT2JqZWN0KHsgaXNJbmNsdWRlZDogZmFsc2UgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGdldE5leHRDb2RlYmxvY2tMZW5ndGgoeCwgeSwgcXVhbGl0eUxheWVyKSB7XHJcbiAgICAgICAgdmFyIGlzQ29kZWJsb2NrQWxyZWFkeUluY2x1ZGVkID0gaXNDb2RlYmxvY2tzSW5jbHVkZWRbeF1beV0uZ2V0VmFsdWUoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGlzQ29kZWJsb2NrSW5jbHVkZWROb3c7XHJcbiAgICAgICAgaWYgKGlzQ29kZWJsb2NrQWxyZWFkeUluY2x1ZGVkLmlzSW5jbHVkZWQpIHtcclxuICAgICAgICAgICAgaXNDb2RlYmxvY2tJbmNsdWRlZE5vdyA9IGJpdHN0cmVhbVJlYWRlci5zaGlmdEJpdCgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlzQ29kZWJsb2NrSW5jbHVkZWROb3cgPSBpbmNsdXNpb25UcmVlLmlzU21hbGxlclRoYW5PckVxdWFsc1RvKFxyXG4gICAgICAgICAgICAgICAgeCwgeSwgcXVhbGl0eUxheWVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChpc0NvZGVibG9ja0luY2x1ZGVkTm93ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoIWlzQ29kZWJsb2NrSW5jbHVkZWROb3cpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGhCeXRlczogMCxcclxuICAgICAgICAgICAgICAgIGNvZGluZ1Bhc3NlczogMFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHplcm9CaXRQbGFuZXMgPSBudWxsO1xyXG4gICAgICAgIGlmICghaXNDb2RlYmxvY2tBbHJlYWR5SW5jbHVkZWQuaXNJbmNsdWRlZCkge1xyXG4gICAgICAgICAgICB6ZXJvQml0UGxhbmVzID0gemVyb0JpdFBsYW5lc1RyZWUuZ2V0VmFsdWUoeCwgeSk7XHJcbiAgICAgICAgICAgIGlmICh6ZXJvQml0UGxhbmVzID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgY29kaW5nUGFzc2VzID0gY29kaW5nUGFzc2VzTnVtYmVyUGFyc2VyLnBhcnNlKGJpdHN0cmVhbVJlYWRlcik7XHJcbiAgICAgICAgaWYgKGNvZGluZ1Bhc3NlcyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGxlbmd0aFBhcnNlciA9IGNvZGVibG9ja0xlbmd0aFBhcnNlcnNbeF1beV07XHJcbiAgICAgICAgdmFyIGJvZHlMZW5ndGhCeXRlcyA9IGxlbmd0aFBhcnNlci5wYXJzZShjb2RpbmdQYXNzZXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChib2R5TGVuZ3RoQnl0ZXMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlzQ29kZWJsb2NrQWxyZWFkeUluY2x1ZGVkLmlzSW5jbHVkZWQgPSB0cnVlO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgIGNvZGVibG9ja0JvZHlMZW5ndGhCeXRlczogYm9keUxlbmd0aEJ5dGVzLFxyXG4gICAgICAgICAgICBjb2RpbmdQYXNzZXM6IGNvZGluZ1Bhc3Nlc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh6ZXJvQml0UGxhbmVzICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC56ZXJvQml0UGxhbmVzID0gemVyb0JpdFBsYW5lcztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIEpwaXBUYWdUcmVlKFxyXG4gICAgYml0c3RyZWFtUmVhZGVyLCB3aWR0aCwgaGVpZ2h0LCB0cmFuc2FjdGlvbkhlbHBlcikge1xyXG4gICAgXHJcbiAgICB2YXIgaXNBbHJlYWR5UmVhZEJpdHNUcmFuc2FjdGlvbmFsT2JqZWN0ID1cclxuICAgICAgICB0cmFuc2FjdGlvbkhlbHBlci5jcmVhdGVUcmFuc2FjdGlvbmFsT2JqZWN0KGZhbHNlLCAvKmlzVmFsdWVUeXBlPSovdHJ1ZSk7XHJcbiAgICB2YXIgbGV2ZWxzO1xyXG4gICAgXHJcbiAgICBjcmVhdGVMZXZlbHNBcnJheSgpO1xyXG4gICAgICAgIFxyXG4gICAgdGhpcy5zZXRNaW5pbWFsVmFsdWVJZk5vdFJlYWRCaXRzID0gZnVuY3Rpb24gc2V0TWluaW1hbFZhbHVlSWZOb3RSZWFkQml0cyhcclxuICAgICAgICBtaW5pbWFsVmFsdWUpIHtcclxuICAgIFxyXG4gICAgICAgIGlmIChpc0FscmVhZHlSZWFkQml0cygpKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRyYW5zYWN0aW9uYWxPYmplY3QgPSBsZXZlbHNbMF0uY29udGVudFswXTtcclxuICAgICAgICB2YXIgbm9kZSA9IHRyYW5zYWN0aW9uYWxPYmplY3QuZ2V0VmFsdWUoXHJcbiAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZSA9IG1pbmltYWxWYWx1ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuaXNTbWFsbGVyVGhhbk9yRXF1YWxzVG8gPSBmdW5jdGlvbiBpc1NtYWxsZXJUaGFuT3JFcXVhbHNUbyhcclxuICAgICAgICB4LCB5LCB2YWx1ZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNldEFscmVhZHlSZWFkQml0cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBnZXROZXh0Tm9kZSA9IGdldFJvb3RUb0xlYWZJdGVyYXRvcih4LCB5KTtcclxuICAgICAgICB2YXIgY3VycmVudE5vZGUgPSBnZXROZXh0Tm9kZSgpO1xyXG4gICAgICAgIHZhciBsYXN0Tm9kZTtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoY3VycmVudE5vZGUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnROb2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlID4gdmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKCFjdXJyZW50Tm9kZS5pc0ZpbmFsVmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHZhciBtYXhCaXRzVG9TaGlmdCA9IHZhbHVlIC0gY3VycmVudE5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWUgKyAxO1xyXG4gICAgICAgICAgICAgICAgdmFyIGFkZFRvVmFsdWUgPSBiaXRzdHJlYW1SZWFkZXIuY291bnRaZXJvc0FuZFNoaWZ0VW50aWxGaXJzdE9uZUJpdChcclxuICAgICAgICAgICAgICAgICAgICBtYXhCaXRzVG9TaGlmdCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoYWRkVG9WYWx1ZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50Tm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZSArPSBhZGRUb1ZhbHVlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoYWRkVG9WYWx1ZSA8IG1heEJpdHNUb1NoaWZ0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudE5vZGUuaXNGaW5hbFZhbHVlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbGFzdE5vZGUgPSBjdXJyZW50Tm9kZTtcclxuICAgICAgICAgICAgY3VycmVudE5vZGUgPSBnZXROZXh0Tm9kZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gbGFzdE5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWUgPD0gdmFsdWU7XHJcbiAgICAgICAgaWYgKHJlc3VsdCAmJiAhbGFzdE5vZGUuaXNGaW5hbFZhbHVlKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgJ1dyb25nIHBhcnNpbmcgaW4gVGFnVHJlZS5pc1NtYWxsZXJUaGFuT3JFcXVhbHNUbzogJyArXHJcbiAgICAgICAgICAgICAgICAnbm90IHN1cmUgaWYgdmFsdWUgaXMgc21hbGxlciB0aGFuIGFza2VkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLmdldFZhbHVlID0gZnVuY3Rpb24gZ2V0VmFsdWUoeCwgeSkge1xyXG4gICAgICAgIHZhciBnZXROZXh0Tm9kZSA9IGdldFJvb3RUb0xlYWZJdGVyYXRvcih4LCB5KTtcclxuICAgICAgICB2YXIgY3VycmVudE5vZGUgPSBnZXROZXh0Tm9kZSgpO1xyXG4gICAgICAgIHZhciBsZWFmO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNldEFscmVhZHlSZWFkQml0cygpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChjdXJyZW50Tm9kZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBpZiAoIWN1cnJlbnROb2RlLmlzRmluYWxWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGFkZFRvVmFsdWUgPVxyXG4gICAgICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5jb3VudFplcm9zQW5kU2hpZnRVbnRpbEZpcnN0T25lQml0KCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChhZGRUb1ZhbHVlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY3VycmVudE5vZGUubWluaW1hbFBvc3NpYmxlVmFsdWUgKz0gYWRkVG9WYWx1ZTtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnROb2RlLmlzRmluYWxWYWx1ZSA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxlYWYgPSBjdXJyZW50Tm9kZTtcclxuICAgICAgICAgICAgY3VycmVudE5vZGUgPSBnZXROZXh0Tm9kZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbGVhZi5taW5pbWFsUG9zc2libGVWYWx1ZTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUxldmVsc0FycmF5KCkge1xyXG4gICAgICAgIGxldmVscyA9IFtdO1xyXG4gICAgICAgIHZhciBsZXZlbFdpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdmFyIGxldmVsSGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChsZXZlbFdpZHRoID49IDEgfHwgbGV2ZWxIZWlnaHQgPj0gMSkge1xyXG4gICAgICAgICAgICBsZXZlbFdpZHRoID0gTWF0aC5jZWlsKGxldmVsV2lkdGgpO1xyXG4gICAgICAgICAgICBsZXZlbEhlaWdodCA9IE1hdGguY2VpbChsZXZlbEhlaWdodCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgZWxlbWVudENvdW50ID0gbGV2ZWxXaWR0aCAqIGxldmVsSGVpZ2h0O1xyXG4gICAgICAgICAgICBsZXZlbHMudW5zaGlmdCh7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogbGV2ZWxXaWR0aCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogbGV2ZWxIZWlnaHQsXHJcbiAgICAgICAgICAgICAgICBjb250ZW50OiBuZXcgQXJyYXkoZWxlbWVudENvdW50KVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXZlbFdpZHRoIC89IDI7XHJcbiAgICAgICAgICAgIGxldmVsSGVpZ2h0IC89IDI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGluaXROb2RlKDAsIDApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBnZXRSb290VG9MZWFmSXRlcmF0b3IoeCwgeSkge1xyXG4gICAgICAgIHZhciBsZXZlbCA9IDA7XHJcbiAgICAgICAgdmFyIHByZXZJdGVyYXRlZE5vZGUgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIGdldE5leHQoKSB7XHJcbiAgICAgICAgICAgIGlmIChsZXZlbCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0l0ZXJhdGVkIHRvbyBkZWVwIGluIHRhZyB0cmVlJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChsZXZlbCA9PT0gbGV2ZWxzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgbGV2ZWwgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBzaGlmdEZhY3RvciA9IGxldmVscy5sZW5ndGggLSBsZXZlbCAtIDE7XHJcbiAgICAgICAgICAgIHZhciBjdXJyZW50WCA9IE1hdGguZmxvb3IoeCA+PiBzaGlmdEZhY3Rvcik7XHJcbiAgICAgICAgICAgIHZhciBjdXJyZW50WSA9IE1hdGguZmxvb3IoeSA+PiBzaGlmdEZhY3Rvcik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgaW5kZXhJbkxldmVsID0gbGV2ZWxzW2xldmVsXS53aWR0aCAqIGN1cnJlbnRZICsgY3VycmVudFg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgdHJhbnNhY3Rpb25hbE9iamVjdCA9IGxldmVsc1tsZXZlbF0uY29udGVudFtpbmRleEluTGV2ZWxdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKHRyYW5zYWN0aW9uYWxPYmplY3QgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgdHJhbnNhY3Rpb25hbE9iamVjdCA9IGluaXROb2RlKGxldmVsLCBpbmRleEluTGV2ZWwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbE9iamVjdC5nZXRWYWx1ZShcclxuICAgICAgICAgICAgICAgIGJpdHN0cmVhbVJlYWRlci5hY3RpdmVUcmFuc2FjdGlvbik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocHJldkl0ZXJhdGVkTm9kZSAhPT0gbnVsbCAmJlxyXG4gICAgICAgICAgICAgICAgcHJldkl0ZXJhdGVkTm9kZS5taW5pbWFsUG9zc2libGVWYWx1ZSA+IHJlc3VsdC5taW5pbWFsUG9zc2libGVWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXN1bHQubWluaW1hbFBvc3NpYmxlVmFsdWUgPSBwcmV2SXRlcmF0ZWROb2RlLm1pbmltYWxQb3NzaWJsZVZhbHVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBwcmV2SXRlcmF0ZWROb2RlID0gcmVzdWx0O1xyXG4gICAgICAgICAgICArK2xldmVsO1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gZ2V0TmV4dDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW5pdE5vZGUobGV2ZWwsIGluZGV4SW5MZXZlbCkge1xyXG4gICAgICAgIHZhciBvYmplY3RWYWx1ZSA9IHtcclxuICAgICAgICAgICAgbWluaW1hbFBvc3NpYmxlVmFsdWU6IDAsXHJcbiAgICAgICAgICAgIGlzRmluYWxWYWx1ZTogZmFsc2VcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIHRyYW5zYWN0aW9uYWxPYmplY3QgPSB0cmFuc2FjdGlvbkhlbHBlci5jcmVhdGVUcmFuc2FjdGlvbmFsT2JqZWN0KFxyXG4gICAgICAgICAgICBvYmplY3RWYWx1ZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV2ZWxzW2xldmVsXS5jb250ZW50W2luZGV4SW5MZXZlbF0gPSB0cmFuc2FjdGlvbmFsT2JqZWN0O1xyXG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsT2JqZWN0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBpc0FscmVhZHlSZWFkQml0cygpIHtcclxuICAgICAgICB2YXIgaXNBbHJlYWR5UmVhZEJpdHNUcmFuc2FjdGlvbmFsVmFsdWUgPVxyXG4gICAgICAgICAgICBpc0FscmVhZHlSZWFkQml0c1RyYW5zYWN0aW9uYWxPYmplY3QuZ2V0VmFsdWUoXHJcbiAgICAgICAgICAgICAgICBiaXRzdHJlYW1SZWFkZXIuYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBpc0FscmVhZHlSZWFkQml0c1RyYW5zYWN0aW9uYWxWYWx1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc2V0QWxyZWFkeVJlYWRCaXRzKCkge1xyXG4gICAgICAgIGlzQWxyZWFkeVJlYWRCaXRzVHJhbnNhY3Rpb25hbE9iamVjdC5zZXRWYWx1ZShcclxuICAgICAgICAgICAgYml0c3RyZWFtUmVhZGVyLmFjdGl2ZVRyYW5zYWN0aW9uLCB0cnVlKTtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG52YXIgakdsb2JhbHMgPSByZXF1aXJlKCdqMmstanBpcC1nbG9iYWxzLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIGNyZWF0ZVRyYW5zYWN0aW9uOiBmdW5jdGlvbiBjcmVhdGVUcmFuc2FjdGlvbigpIHtcclxuICAgICAgICAvLyBUaGlzIGNvZGUgaXMgZXhlY3V0ZWQgYSBMT1QuIEZvciBvcHRpbWl6YXRpb24sIHN0YXRlIGlzIHJlcHJlc2VudGVkXHJcbiAgICAgICAgLy8gZGlyZWN0bHkgYXMgbnVtYmVycyAoSSBjb3VsZG4ndCB0aGluayBhYm91dCBtb3JlIHJlYWRhYmxlIHdheSB3aGljaFxyXG4gICAgICAgIC8vIGlzIHBlcmZvcm1hbmNlLWVxdWl2YWxlbnQpLlxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHN0YXRlID0gMSA9PT4gVHJhbnNhY3Rpb24gaXMgYWN0aXZlXHJcbiAgICAgICAgLy8gc3RhdGUgPSAyID09PiBUcmFuc2FjdGlvbiBoYXMgY29tbWl0dGVkIHN1Y2Nlc3NmdWxseVxyXG4gICAgICAgIC8vIHN0YXRlID0gMyA9PT4gVHJhbnNhY3Rpb24gaGFzIGJlZW4gYWJvcnRlZFxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBzdGF0ZSA9IDE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRyYW5zYWN0aW9uID0ge1xyXG4gICAgICAgICAgICBnZXQgaXNBYm9ydGVkKCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXRlID09PSAzO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZ2V0IGlzQWN0aXZlKCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXRlID09PSAxO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29tbWl0OiBmdW5jdGlvbiBjb21taXQoKSB7XHJcbiAgICAgICAgICAgICAgICB0ZXJtaW5hdGUodHJ1ZSk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIGFib3J0OiBmdW5jdGlvbiBhYm9ydCgpIHtcclxuICAgICAgICAgICAgICAgIHRlcm1pbmF0ZShmYWxzZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIHRlcm1pbmF0ZShpc1N1Y2Nlc3NmdWxfKSB7XHJcbiAgICAgICAgICAgIGlmICghdHJhbnNhY3Rpb24uaXNBY3RpdmUpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucy5JbnRlcm5hbEVycm9yRXhjZXB0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICdDYW5ub3QgdGVybWluYXRlIGFuIGFscmVhZHkgdGVybWluYXRlZCB0cmFuc2FjdGlvbicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN0YXRlID0gaXNTdWNjZXNzZnVsXyA/IDIgOiAzO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uO1xyXG4gICAgfSxcclxuICAgIFxyXG4gICAgY3JlYXRlVHJhbnNhY3Rpb25hbE9iamVjdDogZnVuY3Rpb24gY29tbWl0VHJhbnNhY3Rpb24oXHJcbiAgICAgICAgaW5pdGlhbFZhbHVlLCBpc1ZhbHVlVHlwZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB2YWx1ZSA9IG51bGw7XHJcbiAgICAgICAgdmFyIHByZXZWYWx1ZSA9IGluaXRpYWxWYWx1ZTtcclxuICAgICAgICB2YXIgbGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24gPSB7XHJcbiAgICAgICAgICAgIGlzQWN0aXZlOiBmYWxzZSxcclxuICAgICAgICAgICAgaXNBYm9ydGVkOiB0cnVlXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgdmFyIGNsb25lID0gaXNWYWx1ZVR5cGUgPyBjbG9uZVZhbHVlVHlwZSA6IGNsb25lQnlKU09OO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0cmFuc2FjdGlvbmFsT2JqZWN0ID0ge1xyXG4gICAgICAgICAgICBnZXRWYWx1ZTogZnVuY3Rpb24gZ2V0VmFsdWUoYWN0aXZlVHJhbnNhY3Rpb24pIHtcclxuICAgICAgICAgICAgICAgIGVuc3VyZUFsbG93ZWRBY2Nlc3MoYWN0aXZlVHJhbnNhY3Rpb24pO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbiA9PT0gYWN0aXZlVHJhbnNhY3Rpb24pIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbi5pc0Fib3J0ZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IGNsb25lKHByZXZWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZWYWx1ZSA9IGNsb25lKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbiA9IGFjdGl2ZVRyYW5zYWN0aW9uO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2V0VmFsdWU6IGZ1bmN0aW9uIHNldFZhbHVlKGFjdGl2ZVRyYW5zYWN0aW9uLCBuZXdWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgZW5zdXJlQWxsb3dlZEFjY2VzcyhhY3RpdmVUcmFuc2FjdGlvbik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uID09PSBhY3RpdmVUcmFuc2FjdGlvbikge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gbmV3VmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoIWxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uLmlzQWJvcnRlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZWYWx1ZSA9IGNsb25lKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbGFzdEFjY2Vzc2VkVHJhbnNhY3Rpb24gPSBhY3RpdmVUcmFuc2FjdGlvbjtcclxuICAgICAgICAgICAgICAgIHZhbHVlID0gbmV3VmFsdWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIGVuc3VyZUFsbG93ZWRBY2Nlc3MoYWN0aXZlVHJhbnNhY3Rpb24pIHtcclxuICAgICAgICAgICAgaWYgKCFhY3RpdmVUcmFuc2FjdGlvbi5pc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ0Nhbm5vdCB1c2UgdGVybWluYXRlZCB0cmFuc2FjdGlvbiB0byBhY2Nlc3Mgb2JqZWN0cycpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYWN0aXZlVHJhbnNhY3Rpb24gIT09IGxhc3RBY2Nlc3NlZFRyYW5zYWN0aW9uICYmXHJcbiAgICAgICAgICAgICAgICBsYXN0QWNjZXNzZWRUcmFuc2FjdGlvbi5pc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgakdsb2JhbHMuanBpcEV4Y2VwdGlvbnMuSW50ZXJuYWxFcnJvckV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAnQ2Fubm90IHNpbXVsdGFub3VzbHkgYWNjZXNzIHRyYW5zYWN0aW9uYWwgb2JqZWN0ICcgK1xyXG4gICAgICAgICAgICAgICAgICAgICdmcm9tIHR3byBhY3RpdmUgdHJhbnNhY3Rpb25zJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gY2xvbmVWYWx1ZVR5cGUodmFsdWUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBjbG9uZUJ5SlNPTih2YWx1ZSkge1xyXG4gICAgICAgICAgICB2YXIgbmV3VmFsdWUgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSk7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXdWYWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxPYmplY3Q7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuSnBpcEltYWdlID0gcmVxdWlyZSgnanBpcC1pbWFnZS5qcycpO1xyXG5tb2R1bGUuZXhwb3J0cy5QZGZqc0pweERlY29kZXIgPSByZXF1aXJlKCdwZGZqcy1qcHgtZGVjb2Rlci5qcycpO1xyXG5tb2R1bGUuZXhwb3J0cy5qMmtFeGNlcHRpb25zID0gakdsb2JhbHMuajJrRXhjZXB0aW9ucztcclxubW9kdWxlLmV4cG9ydHMuanBpcEV4Y2VwdGlvbnMgPSBqR2xvYmFscy5qcGlwRXhjZXB0aW9ucztcclxubW9kdWxlLmV4cG9ydHMuSW50ZXJuYWxzID0ge1xyXG4gICAganBpcFJ1bnRpbWVGYWN0b3J5OiByZXF1aXJlKCdqcGlwLXJ1bnRpbWUtZmFjdG9yeS5qcycpLFxyXG4gICAgakdsb2JhbHM6IGpHbG9iYWxzXHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwQ29kZXN0cmVhbVJlY29uc3RydWN0b3IoXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLFxyXG4gICAgZGF0YWJpbnNTYXZlcixcclxuICAgIGhlYWRlck1vZGlmaWVyLFxyXG4gICAgcXVhbGl0eUxheWVyc0NhY2hlKSB7XHJcbiAgICBcclxuICAgIHRoaXMucmVjb25zdHJ1Y3RDb2Rlc3RyZWFtID0gZnVuY3Rpb24gcmVjb25zdHJ1Y3RDb2Rlc3RyZWFtKFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcbiAgICAgICAgdmFyIGN1cnJlbnRPZmZzZXQgPSBjcmVhdGVNYWluSGVhZGVyKHJlc3VsdCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRPZmZzZXQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBudW1UaWxlcyA9XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNYKCkgKiBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldE51bVRpbGVzWSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtUGFydDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobWluTnVtUXVhbGl0eUxheWVycyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMgPSAnbWF4JztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgdGlsZUlkID0gMDsgdGlsZUlkIDwgbnVtVGlsZXM7ICsrdGlsZUlkKSB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlQnl0ZXNDb3BpZWQgPSBjcmVhdGVUaWxlKFxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICAgICAgICAgIHRpbGVJZCxcclxuICAgICAgICAgICAgICAgIHRpbGVJZCxcclxuICAgICAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0LFxyXG4gICAgICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IHRpbGVCeXRlc0NvcGllZDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh0aWxlQnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXJCeXRlc0NvcGllZCA9IGNvcHlCeXRlcyhcclxuICAgICAgICAgICAgcmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBqR2xvYmFscy5qMmtNYXJrZXJzLkVuZE9mQ29kZXN0cmVhbSk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBtYXJrZXJCeXRlc0NvcGllZDtcclxuICAgICAgICByZXN1bHQubGVuZ3RoID0gY3VycmVudE9mZnNldDtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY3JlYXRlQ29kZXN0cmVhbUZvclJlZ2lvbiA9IGZ1bmN0aW9uIGNyZWF0ZUNvZGVzdHJlYW1Gb3JSZWdpb24oXHJcbiAgICAgICAgcGFyYW1zLCBtaW5OdW1RdWFsaXR5TGF5ZXJzLCBpc09ubHlIZWFkZXJzV2l0aG91dEJpdHN0cmVhbSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBjb2Rlc3RyZWFtID0gW107XHJcbiAgICAgICAgdmFyIGN1cnJlbnRPZmZzZXQgPSBjcmVhdGVNYWluSGVhZGVyKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtLCBwYXJhbXMubGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50T2Zmc2V0ID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUlkVG9Xcml0ZSA9IDA7XHJcbiAgICAgICAgdmFyIHRpbGVJdGVyYXRvciA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZXNJdGVyYXRvcihwYXJhbXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBmaXJzdFRpbGVJZCA9IHRpbGVJdGVyYXRvci50aWxlSW5kZXg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGZpcnN0VGlsZUxlZnQgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVMZWZ0KFxyXG4gICAgICAgICAgICBmaXJzdFRpbGVJZCwgcGFyYW1zLmxldmVsKTtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlVG9wID0gY29kZXN0cmVhbVN0cnVjdHVyZS5nZXRUaWxlVG9wKFxyXG4gICAgICAgICAgICBmaXJzdFRpbGVJZCwgcGFyYW1zLmxldmVsKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIG9mZnNldFggPSBwYXJhbXMubWluWCAtIGZpcnN0VGlsZUxlZnQ7XHJcbiAgICAgICAgdmFyIG9mZnNldFkgPSBwYXJhbXMubWluWSAtIGZpcnN0VGlsZVRvcDtcclxuICAgICAgICBcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIHZhciB0aWxlSWRPcmlnaW5hbCA9IHRpbGVJdGVyYXRvci50aWxlSW5kZXg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgdGlsZUJ5dGVzQ29waWVkID0gY3JlYXRlVGlsZShcclxuICAgICAgICAgICAgICAgIGNvZGVzdHJlYW0sXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgdGlsZUlkVG9Xcml0ZSsrLFxyXG4gICAgICAgICAgICAgICAgdGlsZUlkT3JpZ2luYWwsXHJcbiAgICAgICAgICAgICAgICBwYXJhbXMsXHJcbiAgICAgICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzLFxyXG4gICAgICAgICAgICAgICAgaXNPbmx5SGVhZGVyc1dpdGhvdXRCaXRzdHJlYW0pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gdGlsZUJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBpZiAodGlsZUJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gd2hpbGUgKHRpbGVJdGVyYXRvci50cnlBZHZhbmNlKCkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYXJrZXJCeXRlc0NvcGllZCA9IGNvcHlCeXRlcyhcclxuICAgICAgICAgICAgY29kZXN0cmVhbSwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5FbmRPZkNvZGVzdHJlYW0pO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gbWFya2VyQnl0ZXNDb3BpZWQ7XHJcblxyXG4gICAgICAgIGhlYWRlck1vZGlmaWVyLm1vZGlmeUltYWdlU2l6ZShjb2Rlc3RyZWFtLCBwYXJhbXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2Rlc3RyZWFtID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb2Rlc3RyZWFtLmxlbmd0aCA9IGN1cnJlbnRPZmZzZXQ7XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW06IGNvZGVzdHJlYW0sXHJcbiAgICAgICAgICAgIG9mZnNldFg6IG9mZnNldFgsXHJcbiAgICAgICAgICAgIG9mZnNldFk6IG9mZnNldFlcclxuICAgICAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuY3JlYXRlQ29kZXN0cmVhbUZvclRpbGUgPSBmdW5jdGlvbiBjcmVhdGVDb2Rlc3RyZWFtRm9yVGlsZShcclxuICAgICAgICB0aWxlSWQsXHJcbiAgICAgICAgbGV2ZWwsXHJcbiAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyxcclxuICAgICAgICBxdWFsaXR5KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xyXG4gICAgICAgIHZhciBjdXJyZW50T2Zmc2V0ID0gY3JlYXRlTWFpbkhlYWRlcihyZXN1bHQsIGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudE9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVE9ETzogRGVsZXRlIHRoaXMgZnVuY3Rpb24gYW5kIHRlc3QgY3JlYXRlQ29kZXN0cmVhbUZvclJlZ2lvbiBpbnN0ZWFkXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvZGVzdHJlYW1QYXJ0UGFyYW1zID0ge1xyXG4gICAgICAgICAgICBsZXZlbDogbGV2ZWwsXHJcbiAgICAgICAgICAgIHF1YWxpdHk6IHF1YWxpdHlcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUJ5dGVzQ29waWVkID0gY3JlYXRlVGlsZShcclxuICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgICAgICAvKnRpbGVJZFRvV3JpdGU9Ki8wLFxyXG4gICAgICAgICAgICAvKnRpbGVJZE9yaWdpbmFsPSovdGlsZUlkLFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICAgICAgbWluTnVtUXVhbGl0eUxheWVycyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gdGlsZUJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlQnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgbWFya2VyQnl0ZXNDb3BpZWQgPSBjb3B5Qnl0ZXMoXHJcbiAgICAgICAgICAgIHJlc3VsdCwgY3VycmVudE9mZnNldCwgakdsb2JhbHMuajJrTWFya2Vycy5FbmRPZkNvZGVzdHJlYW0pO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gbWFya2VyQnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bVRpbGVzWCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0TnVtVGlsZXNYKCk7XHJcbiAgICAgICAgdmFyIHRpbGVYID0gdGlsZUlkICUgbnVtVGlsZXNYO1xyXG4gICAgICAgIHZhciB0aWxlWSA9IE1hdGguZmxvb3IodGlsZUlkIC8gbnVtVGlsZXNYKTtcclxuICAgICAgICBcclxuICAgICAgICBoZWFkZXJNb2RpZmllci5tb2RpZnlJbWFnZVNpemUocmVzdWx0LCB7XHJcbiAgICAgICAgICAgIGxldmVsOiBsZXZlbCxcclxuICAgICAgICAgICAgbWluVGlsZVg6IHRpbGVYLFxyXG4gICAgICAgICAgICBtYXhUaWxlWEV4Y2x1c2l2ZTogdGlsZVggKyAxLFxyXG4gICAgICAgICAgICBtaW5UaWxlWTogdGlsZVksXHJcbiAgICAgICAgICAgIG1heFRpbGVZRXhjbHVzaXZlOiB0aWxlWSArIDFcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmVzdWx0Lmxlbmd0aCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZU1haW5IZWFkZXIocmVzdWx0LCBsZXZlbCkge1xyXG4gICAgICAgIGlmIChkYXRhYmluc1NhdmVyLmdldElzSnBpcFRpbGVQYXJ0U3RyZWFtKCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLlVuc3VwcG9ydGVkRmVhdHVyZUV4Y2VwdGlvbihcclxuICAgICAgICAgICAgICAgICdyZWNvbnN0cnVjdGlvbiBvZiBjb2Rlc3RyZWFtIGZyb20gSlBUIChKcGlwIFRpbGUtcGFydCkgc3RyZWFtJywgJ0EuMy40Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBtYWluSGVhZGVyID0gZGF0YWJpbnNTYXZlci5nZXRNYWluSGVhZGVyRGF0YWJpbigpO1xyXG4gICAgICAgIHZhciBjdXJyZW50T2Zmc2V0ID0gbWFpbkhlYWRlci5jb3B5Qnl0ZXMocmVzdWx0LCAvKnN0YXJ0T2Zmc2V0PSovMCwge1xyXG4gICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudE9mZnNldCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQWRkZWQgPSBoZWFkZXJNb2RpZmllci5tb2RpZnlNYWluT3JUaWxlSGVhZGVyKFxyXG4gICAgICAgICAgICByZXN1bHQsIG1haW5IZWFkZXIsIC8qb2Zmc2V0PSovMCwgbGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNBZGRlZDtcclxuICAgICAgICBcclxuICAgICAgICBieXRlc0FkZGVkID0gYWRkTWFtYXphdkNvbW1lbnQocmVzdWx0LCBjdXJyZW50T2Zmc2V0KTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQWRkZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGN1cnJlbnRPZmZzZXQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNyZWF0ZVRpbGUoXHJcbiAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQsXHJcbiAgICAgICAgdGlsZUlkVG9Xcml0ZSxcclxuICAgICAgICB0aWxlSWRPcmlnaW5hbCxcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcyxcclxuICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzLFxyXG4gICAgICAgIGlzT25seUhlYWRlcnNXaXRob3V0Qml0c3RyZWFtKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHRpbGVTdHJ1Y3R1cmUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVTdHJ1Y3R1cmUoXHJcbiAgICAgICAgICAgIHRpbGVJZE9yaWdpbmFsKTtcclxuXHJcbiAgICAgICAgdmFyIHN0YXJ0VGlsZU9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICAgICAgdmFyIHRpbGVIZWFkZXJEYXRhYmluID0gZGF0YWJpbnNTYXZlci5nZXRUaWxlSGVhZGVyRGF0YWJpbihcclxuICAgICAgICAgICAgdGlsZUlkT3JpZ2luYWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBsZXZlbDtcclxuICAgICAgICBpZiAoY29kZXN0cmVhbVBhcnRQYXJhbXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBsZXZlbCA9IGNvZGVzdHJlYW1QYXJ0UGFyYW1zLmxldmVsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUhlYWRlck9mZnNldHMgPSBjcmVhdGVUaWxlSGVhZGVyQW5kR2V0T2Zmc2V0cyhcclxuICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgICAgICB0aWxlSGVhZGVyRGF0YWJpbixcclxuICAgICAgICAgICAgdGlsZUlkVG9Xcml0ZSxcclxuICAgICAgICAgICAgbGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aWxlSGVhZGVyT2Zmc2V0cyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgPSB0aWxlSGVhZGVyT2Zmc2V0cy5lbmRUaWxlSGVhZGVyT2Zmc2V0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghaXNPbmx5SGVhZGVyc1dpdGhvdXRCaXRzdHJlYW0pIHtcclxuICAgICAgICAgICAgdmFyIHRpbGVCeXRlc0NvcGllZCA9IGNyZWF0ZVRpbGVCaXRzdHJlYW0oXHJcbiAgICAgICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50T2Zmc2V0LFxyXG4gICAgICAgICAgICAgICAgdGlsZVN0cnVjdHVyZSxcclxuICAgICAgICAgICAgICAgIHRpbGVJZE9yaWdpbmFsLFxyXG4gICAgICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IHRpbGVCeXRlc0NvcGllZDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh0aWxlQnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgZW5kVGlsZU9mZnNldCA9IGN1cnJlbnRPZmZzZXQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGhlYWRlckFuZERhdGFMZW5ndGggPVxyXG4gICAgICAgICAgICBlbmRUaWxlT2Zmc2V0IC0gdGlsZUhlYWRlck9mZnNldHMuc3RhcnRPZlRpbGVIZWFkZXJPZmZzZXQ7XHJcblxyXG4gICAgICAgIGhlYWRlck1vZGlmaWVyLm1vZGlmeUludDMyKFxyXG4gICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJPZmZzZXRzLmhlYWRlckFuZERhdGFMZW5ndGhQbGFjZWhvbGRlck9mZnNldCxcclxuICAgICAgICAgICAgaGVhZGVyQW5kRGF0YUxlbmd0aCk7XHJcblxyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGVuZFRpbGVPZmZzZXQgLSBzdGFydFRpbGVPZmZzZXQ7XHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzQ29waWVkO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVUaWxlSGVhZGVyQW5kR2V0T2Zmc2V0cyhcclxuICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICB0aWxlSGVhZGVyRGF0YWJpbixcclxuICAgICAgICB0aWxlSWRUb1dyaXRlLFxyXG4gICAgICAgIGxldmVsKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0YXJ0T2ZUaWxlSGVhZGVyT2Zmc2V0ID0gY3VycmVudE9mZnNldDtcclxuICAgIFxyXG4gICAgICAgIHZhciBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhcclxuICAgICAgICAgICAgcmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBqR2xvYmFscy5qMmtNYXJrZXJzLlN0YXJ0T2ZUaWxlKTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEEuNC4yXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHN0YXJ0T2ZUaWxlU2VnbWVudExlbmd0aCA9IFswLCAxMF07IC8vIExzb3RcclxuICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIHN0YXJ0T2ZUaWxlU2VnbWVudExlbmd0aCk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUluZGV4ID0gW3RpbGVJZFRvV3JpdGUgPj4+IDgsIHRpbGVJZFRvV3JpdGUgJiAweEZGXTsgLy8gSXNvdFxyXG4gICAgICAgIGJ5dGVzQ29waWVkID0gY29weUJ5dGVzKHJlc3VsdCwgY3VycmVudE9mZnNldCwgdGlsZUluZGV4KTtcclxuICAgICAgICBjdXJyZW50T2Zmc2V0ICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBoZWFkZXJBbmREYXRhTGVuZ3RoUGxhY2Vob2xkZXJPZmZzZXQgPSBjdXJyZW50T2Zmc2V0O1xyXG4gICAgICAgIHZhciBoZWFkZXJBbmREYXRhTGVuZ3RoUGxhY2Vob2xkZXIgPSBbMCwgMCwgMCwgMF07IC8vIFBzb3RcclxuICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIGhlYWRlckFuZERhdGFMZW5ndGhQbGFjZWhvbGRlcik7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZVBhcnRJbmRleCA9IFswXTsgLy8gVFBzb3RcclxuICAgICAgICBieXRlc0NvcGllZCA9IGNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIHRpbGVQYXJ0SW5kZXgpO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG51bWJlck9mVGlsZXBhcnRzID0gWzFdOyAvLyBUTnNvdFxyXG4gICAgICAgIGJ5dGVzQ29waWVkID0gY29weUJ5dGVzKHJlc3VsdCwgY3VycmVudE9mZnNldCwgbnVtYmVyT2ZUaWxlcGFydHMpO1xyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNDb3BpZWQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGFmdGVyU3RhcnRPZlRpbGVTZWdtZW50T2Zmc2V0ID0gY3VycmVudE9mZnNldDtcclxuICAgICAgICBieXRlc0NvcGllZCA9IHRpbGVIZWFkZXJEYXRhYmluLmNvcHlCeXRlcyhyZXN1bHQsIGN1cnJlbnRPZmZzZXQsIHtcclxuICAgICAgICAgICAgZm9yY2VDb3B5QWxsUmFuZ2U6IHRydWVcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgLy8gTk9URTogQ2FuIGNyZWF0ZSBlbXB0eSB0aWxlXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNFbmRlZFdpdGhTdGFydE9mRGF0YU1hcmtlciA9XHJcbiAgICAgICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0IC0gMl0gPT09IGpHbG9iYWxzLmoya01hcmtlcnMuU3RhcnRPZkRhdGFbMF0gJiZcclxuICAgICAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQgLSAxXSA9PT0gakdsb2JhbHMuajJrTWFya2Vycy5TdGFydE9mRGF0YVsxXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgaWYgKCFpc0VuZGVkV2l0aFN0YXJ0T2ZEYXRhTWFya2VyKSB7XHJcbiAgICAgICAgICAgIGJ5dGVzQ29waWVkID0gY29weUJ5dGVzKFxyXG4gICAgICAgICAgICAgICAgcmVzdWx0LCBjdXJyZW50T2Zmc2V0LCBqR2xvYmFscy5qMmtNYXJrZXJzLlN0YXJ0T2ZEYXRhKTtcclxuICAgICAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQWRkZWQgPSBoZWFkZXJNb2RpZmllci5tb2RpZnlNYWluT3JUaWxlSGVhZGVyKFxyXG4gICAgICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgICAgIHRpbGVIZWFkZXJEYXRhYmluLFxyXG4gICAgICAgICAgICBhZnRlclN0YXJ0T2ZUaWxlU2VnbWVudE9mZnNldCxcclxuICAgICAgICAgICAgbGV2ZWwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGN1cnJlbnRPZmZzZXQgKz0gYnl0ZXNBZGRlZDtcclxuXHJcbiAgICAgICAgdmFyIG9mZnNldHMgPSB7XHJcbiAgICAgICAgICAgIHN0YXJ0T2ZUaWxlSGVhZGVyT2Zmc2V0OiBzdGFydE9mVGlsZUhlYWRlck9mZnNldCxcclxuICAgICAgICAgICAgaGVhZGVyQW5kRGF0YUxlbmd0aFBsYWNlaG9sZGVyT2Zmc2V0OiBoZWFkZXJBbmREYXRhTGVuZ3RoUGxhY2Vob2xkZXJPZmZzZXQsXHJcbiAgICAgICAgICAgIGVuZFRpbGVIZWFkZXJPZmZzZXQ6IGN1cnJlbnRPZmZzZXRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gb2Zmc2V0cztcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlVGlsZUJpdHN0cmVhbShcclxuICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgY3VycmVudE9mZnNldCxcclxuICAgICAgICB0aWxlU3RydWN0dXJlLFxyXG4gICAgICAgIHRpbGVJZE9yaWdpbmFsLFxyXG4gICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgIG1pbk51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbnVtUXVhbGl0eUxheWVyc0luVGlsZSA9IHRpbGVTdHJ1Y3R1cmUuZ2V0TnVtUXVhbGl0eUxheWVycygpO1xyXG4gICAgICAgIHZhciBxdWFsaXR5O1xyXG4gICAgICAgIHZhciBpdGVyYXRvciA9IHRpbGVTdHJ1Y3R1cmUuZ2V0UHJlY2luY3RJdGVyYXRvcihcclxuICAgICAgICAgICAgdGlsZUlkT3JpZ2luYWwsXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICAvKmlzSXRlcmF0ZVByZWNpbmN0c05vdEluQ29kZXN0cmVhbVBhcnQ9Ki90cnVlKTtcclxuXHJcbiAgICAgICAgdmFyIGFsbEJ5dGVzQ29waWVkID0gMDtcclxuICAgICAgICB2YXIgaGFzTW9yZVBhY2tldHM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvZGVzdHJlYW1QYXJ0UGFyYW1zICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcXVhbGl0eSA9IGNvZGVzdHJlYW1QYXJ0UGFyYW1zLnF1YWxpdHk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzID09PSAnbWF4Jykge1xyXG4gICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzID0gbnVtUXVhbGl0eUxheWVyc0luVGlsZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICB2YXIgZW1wdHlQYWNrZXRzVG9QdXNoID0gbnVtUXVhbGl0eUxheWVyc0luVGlsZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpdGVyYXRvci5pc0luQ29kZXN0cmVhbVBhcnQpIHtcclxuICAgICAgICAgICAgICAgIHZhciBpbkNsYXNzSWQgPVxyXG4gICAgICAgICAgICAgICAgICAgIHRpbGVTdHJ1Y3R1cmUucHJlY2luY3RQb3NpdGlvblRvSW5DbGFzc0luZGV4KGl0ZXJhdG9yKTtcclxuICAgICAgICAgICAgICAgIHZhciBwcmVjaW5jdERhdGFiaW4gPSBkYXRhYmluc1NhdmVyLmdldFByZWNpbmN0RGF0YWJpbihpbkNsYXNzSWQpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcXVhbGl0eUxheWVyT2Zmc2V0ID0gcXVhbGl0eUxheWVyc0NhY2hlLmdldFF1YWxpdHlMYXllck9mZnNldChcclxuICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICAgICAgcXVhbGl0eSxcclxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvcik7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBieXRlc1RvQ29weSA9IHF1YWxpdHlMYXllck9mZnNldC5lbmRPZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICBlbXB0eVBhY2tldHNUb1B1c2ggPVxyXG4gICAgICAgICAgICAgICAgICAgIG51bVF1YWxpdHlMYXllcnNJblRpbGUgLSBxdWFsaXR5TGF5ZXJPZmZzZXQubnVtUXVhbGl0eUxheWVycztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKHF1YWxpdHlMYXllck9mZnNldC5udW1RdWFsaXR5TGF5ZXJzIDwgbWluTnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgYnl0ZXNDb3BpZWQgPSBwcmVjaW5jdERhdGFiaW4uY29weUJ5dGVzKHJlc3VsdCwgY3VycmVudE9mZnNldCwge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcmNlQ29weUFsbFJhbmdlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIG1heExlbmd0aFRvQ29weTogYnl0ZXNUb0NvcHlcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGJ5dGVzQ29waWVkID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnl0ZXNDb3BpZWQgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGVtcHR5UGFja2V0c1RvUHVzaCA9IG51bVF1YWxpdHlMYXllcnNJblRpbGU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGFsbEJ5dGVzQ29waWVkICs9IGJ5dGVzQ29waWVkO1xyXG4gICAgICAgICAgICAgICAgY3VycmVudE9mZnNldCArPSBieXRlc0NvcGllZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbXB0eVBhY2tldHNUb1B1c2g7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGFsbEJ5dGVzQ29waWVkICs9IGVtcHR5UGFja2V0c1RvUHVzaDtcclxuICAgICAgICB9XHJcbiAgICAgICAgd2hpbGUgKGl0ZXJhdG9yLnRyeUFkdmFuY2UoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGFsbEJ5dGVzQ29waWVkO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBhZGRNYW1hemF2Q29tbWVudChyZXN1bHQsIGN1cnJlbnRPZmZzZXQpIHtcclxuICAgICAgICB2YXIgc3RhcnRPZmZzZXQgPSBjdXJyZW50T2Zmc2V0O1xyXG4gICAgXHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAweEZGO1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMHg2NDtcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDB4MDA7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAweDA5O1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gNzc7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSA5NztcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDEwOTtcclxuICAgICAgICByZXN1bHRbY3VycmVudE9mZnNldCsrXSA9IDk3O1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gMTIyO1xyXG4gICAgICAgIHJlc3VsdFtjdXJyZW50T2Zmc2V0KytdID0gOTc7XHJcbiAgICAgICAgcmVzdWx0W2N1cnJlbnRPZmZzZXQrK10gPSAxMTg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzQWRkZWQgPSBjdXJyZW50T2Zmc2V0IC0gc3RhcnRPZmZzZXQ7XHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzQWRkZWQ7XHJcbiAgICB9XHJcbiAgICAgICAgXHJcbiAgICBmdW5jdGlvbiBjb3B5Qnl0ZXMocmVzdWx0LCByZXN1bHRTdGFydE9mZnNldCwgYnl0ZXNUb0NvcHkpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzVG9Db3B5Lmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdFtpICsgcmVzdWx0U3RhcnRPZmZzZXRdID0gYnl0ZXNUb0NvcHlbaV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBieXRlc1RvQ29weS5sZW5ndGg7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIGpHbG9iYWxzID0gcmVxdWlyZSgnajJrLWpwaXAtZ2xvYmFscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBKcGlwSGVhZGVyTW9kaWZpZXIoXHJcbiAgICBjb2Rlc3RyZWFtU3RydWN0dXJlLCBvZmZzZXRzQ2FsY3VsYXRvciwgcHJvZ3Jlc3Npb25PcmRlcikge1xyXG5cclxuICAgIHZhciBlbmNvZGVkUHJvZ3Jlc3Npb25PcmRlciA9IGVuY29kZVByb2dyZXNzaW9uT3JkZXIocHJvZ3Jlc3Npb25PcmRlcik7XHJcbiAgICAgICAgXHJcbiAgICB0aGlzLm1vZGlmeU1haW5PclRpbGVIZWFkZXIgPSBmdW5jdGlvbiBtb2RpZnlNYWluT3JUaWxlSGVhZGVyKFxyXG4gICAgICAgIHJlc3VsdCwgb3JpZ2luYWxEYXRhYmluLCBkYXRhYmluT2Zmc2V0SW5SZXN1bHQsIGxldmVsKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbW9kaWZ5UHJvZ3Jlc3Npb25PcmRlcihyZXN1bHQsIG9yaWdpbmFsRGF0YWJpbiwgZGF0YWJpbk9mZnNldEluUmVzdWx0KTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAobGV2ZWwgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJlc3RSZXNvbHV0aW9uTGV2ZWxzUmFuZ2VzID1cclxuICAgICAgICAgICAgb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0UmFuZ2VzT2ZCZXN0UmVzb2x1dGlvbkxldmVsc0RhdGEoXHJcbiAgICAgICAgICAgICAgICBvcmlnaW5hbERhdGFiaW4sIGxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYmVzdFJlc29sdXRpb25MZXZlbHNSYW5nZXMubnVtRGVjb21wb3NpdGlvbkxldmVsc09mZnNldCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID1cclxuICAgICAgICAgICAgICAgIGRhdGFiaW5PZmZzZXRJblJlc3VsdCArXHJcbiAgICAgICAgICAgICAgICBiZXN0UmVzb2x1dGlvbkxldmVsc1Jhbmdlcy5udW1EZWNvbXBvc2l0aW9uTGV2ZWxzT2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdFtvZmZzZXRdIC09IGxldmVsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNSZW1vdmVkID0gcmVtb3ZlUmFuZ2VzKFxyXG4gICAgICAgICAgICByZXN1bHQsIGJlc3RSZXNvbHV0aW9uTGV2ZWxzUmFuZ2VzLnJhbmdlcywgZGF0YWJpbk9mZnNldEluUmVzdWx0KTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYnl0ZXNBZGRlZCA9IC1ieXRlc1JlbW92ZWQ7XHJcbiAgICAgICAgcmV0dXJuIGJ5dGVzQWRkZWQ7XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLm1vZGlmeUltYWdlU2l6ZSA9IGZ1bmN0aW9uIG1vZGlmeUltYWdlU2l6ZShyZXN1bHQsIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKSB7XHJcbiAgICAgICAgdmFyIG5ld1RpbGVXaWR0aCA9IGNvZGVzdHJlYW1TdHJ1Y3R1cmUuZ2V0VGlsZVdpZHRoKFxyXG4gICAgICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcy5sZXZlbCk7XHJcbiAgICAgICAgdmFyIG5ld1RpbGVIZWlnaHQgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVIZWlnaHQoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zLmxldmVsKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbmV3UmVmZXJlbmNlR3JpZFNpemUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFNpemVPZlBhcnQoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgc2l6TWFya2VyT2Zmc2V0ID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0SW1hZ2VBbmRUaWxlU2l6ZU9mZnNldCgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB2YXIgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgPVxyXG4gICAgICAgICAgICBzaXpNYXJrZXJPZmZzZXQgKyBqR2xvYmFscy5qMmtPZmZzZXRzLlJFRkVSRU5DRV9HUklEX1NJWkVfT0ZGU0VUX0FGVEVSX1NJWl9NQVJLRVI7XHJcblxyXG4gICAgICAgIHZhciBpbWFnZU9mZnNldEJ5dGVzT2Zmc2V0ID0gcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgKyA4O1xyXG4gICAgICAgIHZhciB0aWxlU2l6ZUJ5dGVzT2Zmc2V0ID0gcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQgKyAxNjtcclxuICAgICAgICB2YXIgZmlyc3RUaWxlT2Zmc2V0Qnl0ZXNPZmZzZXQgPSByZWZlcmVuY2VHcmlkU2l6ZU9mZnNldCArIDI0O1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgcmVmZXJlbmNlR3JpZFNpemVPZmZzZXQsIG5ld1JlZmVyZW5jZUdyaWRTaXplLndpZHRoKTtcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIHJlZmVyZW5jZUdyaWRTaXplT2Zmc2V0ICsgNCwgbmV3UmVmZXJlbmNlR3JpZFNpemUuaGVpZ2h0KTtcclxuICAgICAgICBcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIHRpbGVTaXplQnl0ZXNPZmZzZXQsIG5ld1RpbGVXaWR0aCk7XHJcbiAgICAgICAgbW9kaWZ5SW50MzIocmVzdWx0LCB0aWxlU2l6ZUJ5dGVzT2Zmc2V0ICsgNCwgbmV3VGlsZUhlaWdodCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbW9kaWZ5SW50MzIocmVzdWx0LCBpbWFnZU9mZnNldEJ5dGVzT2Zmc2V0LCAwKTtcclxuICAgICAgICBtb2RpZnlJbnQzMihyZXN1bHQsIGltYWdlT2Zmc2V0Qnl0ZXNPZmZzZXQgKyA0LCAwKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgZmlyc3RUaWxlT2Zmc2V0Qnl0ZXNPZmZzZXQsIDApO1xyXG4gICAgICAgIG1vZGlmeUludDMyKHJlc3VsdCwgZmlyc3RUaWxlT2Zmc2V0Qnl0ZXNPZmZzZXQgKyA0LCAwKTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMubW9kaWZ5SW50MzIgPSBtb2RpZnlJbnQzMjtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gbW9kaWZ5UHJvZ3Jlc3Npb25PcmRlcihyZXN1bHQsIG9yaWdpbmFsRGF0YWJpbiwgZGF0YWJpbk9mZnNldEluUmVzdWx0KSB7XHJcbiAgICAgICAgdmFyIGNvZGluZ1N0eWxlT2Zmc2V0ID0gb2Zmc2V0c0NhbGN1bGF0b3IuZ2V0Q29kaW5nU3R5bGVPZmZzZXQob3JpZ2luYWxEYXRhYmluKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoY29kaW5nU3R5bGVPZmZzZXQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgdmFyIHByb2dyZXNzaW9uT3JkZXJPZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgZGF0YWJpbk9mZnNldEluUmVzdWx0ICsgY29kaW5nU3R5bGVPZmZzZXQgKyA1O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmVzdWx0W3Byb2dyZXNzaW9uT3JkZXJPZmZzZXRdID0gZW5jb2RlZFByb2dyZXNzaW9uT3JkZXI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiByZW1vdmVSYW5nZXMocmVzdWx0LCByYW5nZXNUb1JlbW92ZSwgYWRkT2Zmc2V0KSB7XHJcbiAgICAgICAgaWYgKHJhbmdlc1RvUmVtb3ZlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gMDsgLy8gemVybyBieXRlcyByZW1vdmVkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzVG9SZW1vdmUubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdmFyIG9mZnNldCA9XHJcbiAgICAgICAgICAgICAgICBhZGRPZmZzZXQgK1xyXG4gICAgICAgICAgICAgICAgcmFuZ2VzVG9SZW1vdmVbaV0ubWFya2VyU2VnbWVudExlbmd0aE9mZnNldDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgb3JpZ2luYWxNYXJrZXJTZWdtZW50TGVuZ3RoID1cclxuICAgICAgICAgICAgICAgIChyZXN1bHRbb2Zmc2V0XSA8PCA4KSArIHJlc3VsdFtvZmZzZXQgKyAxXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXdNYXJrZXJTZWdtZW50TGVuZ3RoID1cclxuICAgICAgICAgICAgICAgIG9yaWdpbmFsTWFya2VyU2VnbWVudExlbmd0aCAtIHJhbmdlc1RvUmVtb3ZlW2ldLmxlbmd0aDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc3VsdFtvZmZzZXRdID0gbmV3TWFya2VyU2VnbWVudExlbmd0aCA+Pj4gODtcclxuICAgICAgICAgICAgcmVzdWx0W29mZnNldCArIDFdID0gbmV3TWFya2VyU2VnbWVudExlbmd0aCAmIDB4RkY7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciBvZmZzZXRUYXJnZXQgPSBhZGRPZmZzZXQgKyByYW5nZXNUb1JlbW92ZVswXS5zdGFydDtcclxuICAgICAgICB2YXIgb2Zmc2V0U291cmNlID0gb2Zmc2V0VGFyZ2V0O1xyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmFuZ2VzVG9SZW1vdmUubGVuZ3RoOyArK2opIHtcclxuICAgICAgICAgICAgb2Zmc2V0U291cmNlICs9IHJhbmdlc1RvUmVtb3ZlW2pdLmxlbmd0aDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBuZXh0UmFuZ2VPZmZzZXQgPVxyXG4gICAgICAgICAgICAgICAgaiArIDEgPCByYW5nZXNUb1JlbW92ZS5sZW5ndGggP1xyXG4gICAgICAgICAgICAgICAgICAgIGFkZE9mZnNldCArIHJhbmdlc1RvUmVtb3ZlW2ogKyAxXS5zdGFydCA6XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lmxlbmd0aDtcclxuXHJcbiAgICAgICAgICAgIGZvciAoOyBvZmZzZXRTb3VyY2UgPCBuZXh0UmFuZ2VPZmZzZXQ7ICsrb2Zmc2V0U291cmNlKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbb2Zmc2V0VGFyZ2V0XSA9IHJlc3VsdFtvZmZzZXRTb3VyY2VdO1xyXG4gICAgICAgICAgICAgICAgKytvZmZzZXRUYXJnZXQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGJ5dGVzUmVtb3ZlZCA9IG9mZnNldFNvdXJjZSAtIG9mZnNldFRhcmdldDtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gYnl0ZXNSZW1vdmVkO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIG1vZGlmeUludDMyKGJ5dGVzLCBvZmZzZXQsIG5ld1ZhbHVlKSB7XHJcbiAgICAgICAgYnl0ZXNbb2Zmc2V0KytdID0gbmV3VmFsdWUgPj4+IDI0O1xyXG4gICAgICAgIGJ5dGVzW29mZnNldCsrXSA9IChuZXdWYWx1ZSA+Pj4gMTYpICYgMHhGRjtcclxuICAgICAgICBieXRlc1tvZmZzZXQrK10gPSAobmV3VmFsdWUgPj4+IDgpICYgMHhGRjtcclxuICAgICAgICBieXRlc1tvZmZzZXQrK10gPSBuZXdWYWx1ZSAmIDB4RkY7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZW5jb2RlUHJvZ3Jlc3Npb25PcmRlcihwcm9ncmVzc2lvbk9yZGVyKSB7XHJcbiAgICAgICAgLy8gQS42LjFcclxuICAgICAgICBcclxuICAgICAgICAvLyBUYWJsZSBBLjE2XHJcbiAgICAgICAgXHJcbiAgICAgICAgc3dpdGNoIChwcm9ncmVzc2lvbk9yZGVyKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ0xSQ1AnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnUkxDUCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdSUENMJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiAyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY2FzZSAnUENSTCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gMztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlICdDUFJMJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiA0O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBqR2xvYmFscy5qMmtFeGNlcHRpb25zLklsbGVnYWxEYXRhRXhjZXB0aW9uKCdQcm9ncmVzc2lvbiBvcmRlciBvZiAnICsgcHJvZ3Jlc3Npb25PcmRlciwgJ0EuNi4xLCB0YWJsZSBBLjE2Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBqR2xvYmFscyA9IHJlcXVpcmUoJ2oyay1qcGlwLWdsb2JhbHMuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gSnBpcFBhY2tldHNEYXRhQ29sbGVjdG9yKFxyXG4gICAgY29kZXN0cmVhbVN0cnVjdHVyZSxcclxuICAgIGRhdGFiaW5zU2F2ZXIsXHJcbiAgICBxdWFsaXR5TGF5ZXJzQ2FjaGUsXHJcbiAgICBqcGlwRmFjdG9yeSkge1xyXG4gICAgXHJcbiAgICB0aGlzLmdldEFsbENvZGVibG9ja3NEYXRhID0gZnVuY3Rpb24gZ2V0Q29kZWJsb2Nrc0RhdGEoXHJcbiAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsIG1pbk51bVF1YWxpdHlMYXllcnMpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgYWxyZWFkeVJldHVybmVkQ29kZWJsb2NrcyA9IGpwaXBGYWN0b3J5LmNyZWF0ZU9iamVjdFBvb2xCeURhdGFiaW4oKTtcclxuICAgICAgICB2YXIgY29kZWJsb2Nrc0RhdGEgPSBnZXROZXdDb2RlYmxvY2tzRGF0YUFuZFVwZGF0ZVJldHVybmVkQ29kZWJsb2NrcyhcclxuICAgICAgICAgICAgY29kZXN0cmVhbVBhcnRQYXJhbXMsIG1pbk51bVF1YWxpdHlMYXllcnMsIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3MpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGNvZGVibG9ja3NEYXRhOiBjb2RlYmxvY2tzRGF0YSxcclxuICAgICAgICAgICAgYWxyZWFkeVJldHVybmVkQ29kZWJsb2NrczogYWxyZWFkeVJldHVybmVkQ29kZWJsb2Nrc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5nZXROZXdDb2RlYmxvY2tzRGF0YUFuZFVwZGF0ZVJldHVybmVkQ29kZWJsb2NrcyA9XHJcbiAgICAgICAgZ2V0TmV3Q29kZWJsb2Nrc0RhdGFBbmRVcGRhdGVSZXR1cm5lZENvZGVibG9ja3M7XHJcbiAgICAgICAgXHJcbiAgICBmdW5jdGlvbiBnZXROZXdDb2RlYmxvY2tzRGF0YUFuZFVwZGF0ZVJldHVybmVkQ29kZWJsb2NrcyhcclxuICAgICAgICBjb2Rlc3RyZWFtUGFydFBhcmFtcywgbWluTnVtUXVhbGl0eUxheWVycywgYWxyZWFkeVJldHVybmVkQ29kZWJsb2Nrcykge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB0aWxlSXRlcmF0b3IgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVzSXRlcmF0b3IoXHJcbiAgICAgICAgICAgIGNvZGVzdHJlYW1QYXJ0UGFyYW1zKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgdGlsZUluZGV4SW5Db2Rlc3RyZWFtUGFydCA9IDA7XHJcbiAgICAgICAgdmFyIGR1bW15T2Zmc2V0ID0gMDtcclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICBwYWNrZXREYXRhT2Zmc2V0czogW10sXHJcbiAgICAgICAgICAgIGRhdGE6IGpwaXBGYWN0b3J5LmNyZWF0ZUNvbXBvc2l0ZUFycmF5KGR1bW15T2Zmc2V0KSxcclxuICAgICAgICAgICAgYWxsUmVsZXZhbnRCeXRlc0xvYWRlZDogMFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgdmFyIHRpbGVTdHJ1Y3R1cmUgPSBjb2Rlc3RyZWFtU3RydWN0dXJlLmdldFRpbGVTdHJ1Y3R1cmUoXHJcbiAgICAgICAgICAgICAgICB0aWxlSXRlcmF0b3IudGlsZUluZGV4KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBwcmVjaW5jdEl0ZXJhdG9yID0gdGlsZVN0cnVjdHVyZS5nZXRQcmVjaW5jdEl0ZXJhdG9yKFxyXG4gICAgICAgICAgICAgICAgdGlsZUl0ZXJhdG9yLnRpbGVJbmRleCwgY29kZXN0cmVhbVBhcnRQYXJhbXMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHF1YWxpdHkgPSB0aWxlU3RydWN0dXJlLmdldE51bVF1YWxpdHlMYXllcnMoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChjb2Rlc3RyZWFtUGFydFBhcmFtcy5xdWFsaXR5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHF1YWxpdHkgPSBNYXRoLm1pbihcclxuICAgICAgICAgICAgICAgICAgICBxdWFsaXR5LCBjb2Rlc3RyZWFtUGFydFBhcmFtcy5xdWFsaXR5KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG1pbk51bVF1YWxpdHlMYXllcnMgPT09ICdtYXgnKSB7XHJcbiAgICAgICAgICAgICAgICBtaW5OdW1RdWFsaXR5TGF5ZXJzID0gcXVhbGl0eTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChtaW5OdW1RdWFsaXR5TGF5ZXJzID4gcXVhbGl0eSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgJ21pbk51bVF1YWxpdHlMYXllcnMgaXMgbGFyZ2VyIHRoYW4gcXVhbGl0eScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXByZWNpbmN0SXRlcmF0b3IuaXNJbkNvZGVzdHJlYW1QYXJ0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IGpHbG9iYWxzLmpwaXBFeGNlcHRpb25zLkludGVybmFsRXJyb3JFeGNlcHRpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdVbmV4cGVjdGVkIHByZWNpbmN0IG5vdCBpbiBjb2Rlc3RyZWFtIHBhcnQnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGluQ2xhc3NJbmRleCA9IHRpbGVTdHJ1Y3R1cmUucHJlY2luY3RQb3NpdGlvblRvSW5DbGFzc0luZGV4KFxyXG4gICAgICAgICAgICAgICAgICAgIHByZWNpbmN0SXRlcmF0b3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHByZWNpbmN0RGF0YWJpbiA9IGRhdGFiaW5zU2F2ZXIuZ2V0UHJlY2luY3REYXRhYmluKFxyXG4gICAgICAgICAgICAgICAgICAgIGluQ2xhc3NJbmRleCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciByZXR1cm5lZEluUHJlY2luY3QgPVxyXG4gICAgICAgICAgICAgICAgICAgIGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3MuZ2V0T2JqZWN0KHByZWNpbmN0RGF0YWJpbik7XHJcbiAgICAgICAgICAgICAgICBpZiAocmV0dXJuZWRJblByZWNpbmN0LmxheWVyUGVyQ29kZWJsb2NrID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm5lZEluUHJlY2luY3QubGF5ZXJQZXJDb2RlYmxvY2sgPSBbXTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgbGF5ZXJSZWFjaGVkID0gcHVzaFBhY2tldHMoXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LFxyXG4gICAgICAgICAgICAgICAgICAgIHRpbGVJbmRleEluQ29kZXN0cmVhbVBhcnQsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlY2luY3RJdGVyYXRvcixcclxuICAgICAgICAgICAgICAgICAgICBwcmVjaW5jdERhdGFiaW4sXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuZWRJblByZWNpbmN0LFxyXG4gICAgICAgICAgICAgICAgICAgIHF1YWxpdHkpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAobGF5ZXJSZWFjaGVkIDwgbWluTnVtUXVhbGl0eUxheWVycykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE5PVEU6IGFscmVhZHlSZXR1cm5lZENvZGVibG9ja3MgaXMgd3JvbmcgaW4gdGhpcyBzdGFnZSxcclxuICAgICAgICAgICAgICAgICAgICAvLyBiZWNhdXNlIGl0IHdhcyB1cGRhdGVkIHdpdGggYSBkYXRhIHdoaWNoIHdpbGwgbm90IGJlXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gcmV0dXJuZWQuIEkgZG9uJ3QgY2FyZSBhYm91dCBpdCBub3cgYmVjYXVzZSByZXR1cm5pbmdcclxuICAgICAgICAgICAgICAgICAgICAvLyBudWxsIGhlcmUgbWVhbnMgc29tZXRoaW5nIGJhZCBoYXBwZW5lZCAoYW4gZXhjZXB0aW9uIGlzXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhyb3duIGluIFJlcXVlc3RDb250ZXh0IHdoZW4gdGhpcyBoYXBwZW5zKS5cclxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBzb21lIGRheSB0aGUgY29uc2lzdGVuY3kgb2YgYWxyZWFkeVJldHVybmVkQ29kZWJsb2Nrc1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGlzIGltcG9ydGFudCB0aGVuIGEgbmV3IG9iamVjdCBzaG91bGQgYmUgcmV0dXJuZWQgb24gZWFjaFxyXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhbGwgdG8gdGhpcyBmdW5jdGlvbiwgb3IgYSB0cmFuc2FjdGlvbmFsIHN0eWxlIHNob3VsZCBiZVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIHVzZWQgaGVyZSB0byBhYm9ydCBhbGwgbm9uLXJldHVybmVkIGRhdGEuXHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gd2hpbGUgKHByZWNpbmN0SXRlcmF0b3IudHJ5QWR2YW5jZSgpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICsrdGlsZUluZGV4SW5Db2Rlc3RyZWFtUGFydDtcclxuICAgICAgICB9IHdoaWxlICh0aWxlSXRlcmF0b3IudHJ5QWR2YW5jZSgpKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YUFzVWludDggPSBuZXcgVWludDhBcnJheShyZXN1bHQuZGF0YS5nZXRMZW5ndGgoKSk7XHJcbiAgICAgICAgcmVzdWx0LmRhdGEuY29weVRvVHlwZWRBcnJheShkYXRhQXNVaW50OCwgMCwgMCwgcmVzdWx0LmRhdGEuZ2V0TGVuZ3RoKCkpO1xyXG4gICAgICAgIHJlc3VsdC5kYXRhID0gZGF0YUFzVWludDg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBwdXNoUGFja2V0cyhcclxuICAgICAgICByZXN1bHQsXHJcbiAgICAgICAgdGlsZUluZGV4SW5Db2Rlc3RyZWFtUGFydCxcclxuICAgICAgICBwcmVjaW5jdEl0ZXJhdG9yLFxyXG4gICAgICAgIHByZWNpbmN0RGF0YWJpbixcclxuICAgICAgICByZXR1cm5lZENvZGVibG9ja3NJblByZWNpbmN0LFxyXG4gICAgICAgIHF1YWxpdHkpIHtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbGF5ZXI7XHJcbiAgICAgICAgdmFyIG9mZnNldEluUHJlY2luY3REYXRhYmluO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAobGF5ZXIgPSAwOyBsYXllciA8IHF1YWxpdHk7ICsrbGF5ZXIpIHtcclxuICAgICAgICAgICAgdmFyIGNvZGVibG9ja09mZnNldHNJbkRhdGFiaW4gPVxyXG4gICAgICAgICAgICAgICAgcXVhbGl0eUxheWVyc0NhY2hlLmdldFBhY2tldE9mZnNldHNCeUNvZGVibG9ja0luZGV4KFxyXG4gICAgICAgICAgICAgICAgICAgIHByZWNpbmN0RGF0YWJpbiwgbGF5ZXIsIHByZWNpbmN0SXRlcmF0b3IpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGNvZGVibG9ja09mZnNldHNJbkRhdGFiaW4gPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBvZmZzZXRJblByZWNpbmN0RGF0YWJpbiA9XHJcbiAgICAgICAgICAgICAgICBjb2RlYmxvY2tPZmZzZXRzSW5EYXRhYmluLmhlYWRlclN0YXJ0T2Zmc2V0ICtcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHNJbkRhdGFiaW4uaGVhZGVyTGVuZ3RoO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIG51bUNvZGVibG9ja3MgPVxyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrT2Zmc2V0c0luRGF0YWJpbi5jb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleC5sZW5ndGg7XHJcbiAgICAgICAgICAgIHZhciBjb2RlYmxvY2tPZmZzZXRzSW5SZXN1bHQgPSBuZXcgQXJyYXkobnVtQ29kZWJsb2Nrcyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgaXNJbmNvbXBsZXRlUGFja2V0ID0gZmFsc2U7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bUNvZGVibG9ja3M7ICsraSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHJldHVybmVkID0gcmV0dXJuZWRDb2RlYmxvY2tzSW5QcmVjaW5jdC5sYXllclBlckNvZGVibG9ja1tpXTtcclxuICAgICAgICAgICAgICAgIGlmIChyZXR1cm5lZCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuZWQgPSB7IGxheWVyOiAtMSB9O1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybmVkQ29kZWJsb2Nrc0luUHJlY2luY3QubGF5ZXJQZXJDb2RlYmxvY2tbaV0gPSByZXR1cm5lZDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocmV0dXJuZWQubGF5ZXIgPj0gbGF5ZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGNvZGVibG9jayA9XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZWJsb2NrT2Zmc2V0c0luRGF0YWJpbi5jb2RlYmxvY2tCb2R5TGVuZ3RoQnlJbmRleFtpXTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIG9mZnNldEluUmVzdWx0QXJyYXkgPSByZXN1bHQuZGF0YS5nZXRMZW5ndGgoKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGJ5dGVzQ29waWVkID0gcHJlY2luY3REYXRhYmluLmNvcHlUb0NvbXBvc2l0ZUFycmF5KFxyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5kYXRhLFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YWJpblN0YXJ0T2Zmc2V0OiBvZmZzZXRJblByZWNpbmN0RGF0YWJpbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4TGVuZ3RoVG9Db3B5OiBjb2RlYmxvY2suY29kZWJsb2NrQm9keUxlbmd0aEJ5dGVzLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JjZUNvcHlBbGxSYW5nZTogdHJ1ZVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoYnl0ZXNDb3BpZWQgIT09IGNvZGVibG9jay5jb2RlYmxvY2tCb2R5TGVuZ3RoQnl0ZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb2RlYmxvY2tPZmZzZXRzSW5SZXN1bHQubGVuZ3RoID0gaTtcclxuICAgICAgICAgICAgICAgICAgICBpc0luY29tcGxldGVQYWNrZXQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICByZXR1cm5lZC5sYXllciA9IGxheWVyO1xyXG4gICAgICAgICAgICAgICAgY29kZWJsb2NrT2Zmc2V0c0luUmVzdWx0W2ldID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBvZmZzZXRJblJlc3VsdEFycmF5LFxyXG4gICAgICAgICAgICAgICAgICAgIGVuZDogb2Zmc2V0SW5SZXN1bHRBcnJheSArIGNvZGVibG9jay5jb2RlYmxvY2tCb2R5TGVuZ3RoQnl0ZXMsXHJcbiAgICAgICAgICAgICAgICAgICAgY29kaW5ncGFzc2VzOiBjb2RlYmxvY2suY29kaW5nUGFzc2VzLFxyXG4gICAgICAgICAgICAgICAgICAgIHplcm9CaXRQbGFuZXM6IGNvZGVibG9jay56ZXJvQml0UGxhbmVzXHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgb2Zmc2V0SW5QcmVjaW5jdERhdGFiaW4gKz0gY29kZWJsb2NrLmNvZGVibG9ja0JvZHlMZW5ndGhCeXRlcztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHBhY2tldCA9IHtcclxuICAgICAgICAgICAgICAgIHRpbGVJbmRleDogdGlsZUluZGV4SW5Db2Rlc3RyZWFtUGFydCxcclxuICAgICAgICAgICAgICAgIHI6IHByZWNpbmN0SXRlcmF0b3IucmVzb2x1dGlvbkxldmVsLFxyXG4gICAgICAgICAgICAgICAgcDogcHJlY2luY3RJdGVyYXRvci5wcmVjaW5jdEluZGV4SW5Db21wb25lbnRSZXNvbHV0aW9uLFxyXG4gICAgICAgICAgICAgICAgYzogcHJlY2luY3RJdGVyYXRvci5jb21wb25lbnQsXHJcbiAgICAgICAgICAgICAgICBsOiBsYXllcixcclxuICAgICAgICAgICAgICAgIGNvZGVibG9ja09mZnNldHM6IGNvZGVibG9ja09mZnNldHNJblJlc3VsdFxyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIHJlc3VsdC5wYWNrZXREYXRhT2Zmc2V0cy5wdXNoKHBhY2tldCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoaXNJbmNvbXBsZXRlUGFja2V0KSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXN1bHQuYWxsUmVsZXZhbnRCeXRlc0xvYWRlZCArPSBvZmZzZXRJblByZWNpbmN0RGF0YWJpbjtcclxuICAgICAgICByZXR1cm4gbGF5ZXI7XHJcbiAgICB9ICAgIFxyXG59OyJdfQ==
