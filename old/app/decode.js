'use strict';

self.onmessage = function(event) {  
  var bytes = event.data.bytes, extension = event.data.extension;
  var uint8Array = new Uint8Array(bytes);
  var packetsData = event.data.packetsData;
  var t0, t1;
  
  importScripts('../jpx.js/util.js');
  importScripts('../jpx.js/arithmetic_decoder.js');
  importScripts('../jpx.js/jpx.js');
  t0 = (new Date()).getTime();
  var jpxImg = new JpxImage();
  
  if (packetsData === undefined) {
    jpxImg.parse(uint8Array);
  } else {
    var context = jpxImg.parseCodestream(
		uint8Array, 0, uint8Array.length, { isOnlyParseHeaders : true });
	
	jpxImg.addPacketsData(context, packetsData);
	
	jpxImg.decode(context);
  }
  
  t1 = (new Date()).getTime();
  
  var j2k =
  {
    jpxImg: jpxImg,
	width: jpxImg.width,
	height: jpxImg.height,
	tileCount: jpxImg.tiles.length,
	componentsCount: jpxImg.componentsCount,
	
	arbitraryTile: {
		width: jpxImg.tiles[0].width,
		height: jpxImg.tiles[0].height,
		data: jpxImg.tiles[0].items
	},
	
	tdiff: t1 - t0
  };

  self.postMessage(j2k);
};
