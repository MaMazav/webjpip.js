'use strict';

function jpxToCanvas(rgbImage, canvas) {
	canvas.width = rgbImage.width;
	canvas.height = rgbImage.height;
	var pixelsPerChannel = rgbImage.width * rgbImage.height;

	var ctx = canvas.getContext('2d');
	var rgbaImage = ctx.createImageData(rgbImage.width, rgbImage.height);
	
	var rOffset = 0;
	var gOffset = 0;
	var bOffset = 0;
	var pixelsOffset = 1;
	
	if (event.data.componentsCount === 3) {
		gOffset = 1;
		bOffset = 2;
		pixelsOffset = 3;
	}
	else if (event.data.componentsCount === 4) {
		gOffset = 1;
		bOffset = 2;
		pixelsOffset = 4;
	}
	else if (event.data.componentsCount !== 1) {
		statusDiv.innerHTML = 'Unsupported components count ' + event.data.componentsCount;
		return;
	}

	var i = 0, j = 0;
	while (i < rgbaImage.data.length && j < rgbImage.data.length) {
	  rgbaImage.data[i] = rgbImage.data[j]; // R
	  rgbaImage.data[i+1] = rgbImage.data[j + gOffset]; // G
	  rgbaImage.data[i+2] = rgbImage.data[j + bOffset]; // B
	  rgbaImage.data[i+3] = 255; // A

	  // Next pixel
	  i += 4;
	  j += pixelsOffset;
	}

	ctx.putImageData(rgbaImage, 0, 0);
}