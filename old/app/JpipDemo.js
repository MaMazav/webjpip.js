'use strict';

var tileWidth = 256;
var tileHeight = 256;

var statusDiv = document.getElementById('status');
var tilesViewerDiv = document.getElementById('tilesViewer');
var codestreamBytesDiv = document.getElementById('codestreamBytesDiv');
var errorDiv = document.getElementById('errorDiv');

var numResolutionLevelsToCutTxt = document.getElementById('numResolutionLevelsToCutTxt');
var maxNumQualityLayersTxt = document.getElementById('maxNumQualityLayersTxt');
var jpipUrlTxt = document.getElementById('jpipUrlTxt');
var minTileXTxt = document.getElementById('minTileXTxt');
var maxTileXTxt = document.getElementById('maxTileXTxt');
var minTileYTxt = document.getElementById('minTileYTxt');
var maxTileYTxt = document.getElementById('maxTileYTxt');

var enableProgressiveChk = document.getElementById('enableProgressiveChk');

var closeImageLink = document.getElementById('closeImageLink');
var loadAllTilesLink = document.getElementById('loadAllTilesLink');

var maxNumResolutionLevelsSpan = document.getElementById('maxNumResolutionLevelsSpan');

var numTilesX = null;
var numTilesY = null;

var image = null;
var codestreamPerTile;
var isImageReady = false;

function statusCallback(status) {
	if (status.exception !== null) {
		errorDiv.innerHTML = 'Exception occurred: ' + status.exception;
	} else {
		errorDiv.innerHTML = '';
	}
	
	if (isImageReady === status.isReady) {
		return;
	}
	isImageReady = status.isReady;

	if (!status.isReady) {
		disableAllLinks();
		return;
	}

	var sizeParams = image.getSizesParams();
	var sizesCalculator = new JpipCodestreamSizesCalculator(sizeParams);
	
	numTilesX = Math.ceil(sizesCalculator.getLevelWidth() / tileWidth);
	numTilesY = Math.ceil(sizesCalculator.getLevelHeight() / tileHeight);
	
	statusDiv.innerHTML = 'Ready.';
	closeImageLink.innerHTML = 'Close image';
	loadAllTilesLink.innerHTML = 'Load all tiles';
	maxNumQualityLayersTxt.value = sizesCalculator.getDefaultNumQualityLayers();
	
	maxNumResolutionLevelsSpan.innerHTML = sizesCalculator.getDefaultNumResolutionLevels() - 1;

	buildHTMLTileStructure();
}

function buildHTMLTileStructure() {
	var tableHTML = '<table border=1><tr><td></td>';

	codestreamPerTile = new Array();
	
	for (var x = 0; x < numTilesX; ++x) {
		tableHTML += '<th>' + x + '</th>';
		codestreamPerTile[x] = new Array(numTilesY);
	}
	
	for (var y = 0; y < numTilesY; ++y) {
		tableHTML += '</tr><tr><th>' + y + '</th>';
		
		for (var x = 0; x < numTilesX; ++x) {
			var name = x + '_' + y ;
			var params = '' + x + ', ' + y;
			tableHTML +=
				'<td>' + 
					'<span id="span' + name + '"></span><br>' +
					'<a id="linkLoadTile' + name + '" href="javascript:loadTile(' + params + ')" >Load tile</a><br>' +
					'<div><canvas id="canvas' + name + '"></canvas></div><br>' +
					'<a id="linkShowCodestream' + name + '" href="javascript:showCodestream(' + params + ')" ></a>' +
				'</td>';
		}
		
		tableHTML += '</tr>';
	}
	
	tilesViewerDiv.innerHTML = tableHTML;
}

function disableAllLinks() {
	statusDiv.innerHTML = 'Not ready';
	closeImageLink.innerHTML = '';
	loadAllTilesLink.innerHTML = '';

	for (var y = 0; y < numTilesY; ++y) {
		for (var x = 0; x < numTilesX; ++x) {
			var name = x + '_' + y ;
			var linkLoadTileElement = document.getElementById('linkLoadTile' + name);
			
			linkLoadTileElement.innerHTML = '';
		}
	}
}

function loadAllTiles() {
	for (var x = 0; x < numTilesX; ++x) {
		for (var y = 0; y < numTilesY; ++y) {
			loadTile(x, y);
		}
	}
}

function loadTile(tileX, tileY) {
	var name = tileX + '_' + tileY;
	var spanElement = document.getElementById('span' + name);
	var linkLoadTileElement = document.getElementById('linkLoadTile' + name);
	var canvasElement = document.getElementById('canvas' + name);
	var linkShowCodestreamElement = document.getElementById('linkShowCodestream' + name);
	
	spanElement.innerHTML = 'webjpip.js...';
	linkLoadTileElement.innerHTML = 'Reload tile';
	linkShowCodestreamElement.innerHTML = 'Show codestream bytes';
	
	var pendingCodestreamToDecode = null;
	var isPendingCodestreamEndOfProgressiveRendering = false;

	var isJpxWorking = false;
	var decodeWorker = new Worker('decode.js');
	decodeWorker.onmessage = tileDecodedCallback;
	
	function tileDecodedCallback(event) {
		var rgbImage = event.data.arbitraryTile;
		jpxToCanvas(rgbImage, canvasElement);
		
		isJpxWorking = false;
		
		if (isPendingCodestreamEndOfProgressiveRendering) {
			spanElement.innerHTML = 'Done.';
		} else {
			tryDecodePendingCodestream();
		}
	}
	
	function dataCallback(requestContext, userContextVars) {
		var isDone = !requestContext.tryContinueRequest();
		
		if (!requestContext.hasData()) {
			return;
		}
		
		var useParsedPacketOffsets = true;
		
		var packetsData;
		var codestream = requestContext.createCodestream(
			/*onlyHeaders=*/useParsedPacketOffsets).codestream;
		spanElement.innerHTML = 'jpx.js...';
		
		if (useParsedPacketOffsets) {
			packetsData = requestContext.getAllCodeblocksData();
		} else {
			codestreamPerTile[tileX][tileY] = codestream;
		}
		
		pendingCodestreamToDecode = {
			isPendingCodestreamEndOfProgressiveRendering : isDone,
			codestream : codestream,
			packetsData : packetsData
			};
		tryDecodePendingCodestream();
		
		if (isDone) {
			requestContext.endAsync();
		}
	}
	
	function tryDecodePendingCodestream() {
		if (pendingCodestreamToDecode === null || isJpxWorking) {
			return;
		}
		
		isPendingCodestreamEndOfProgressiveRendering =
			pendingCodestreamToDecode
				.isPendingCodestreamEndOfProgressiveRendering;
		
		decodeWorker.postMessage( {
			bytes: pendingCodestreamToDecode.codestream,
			packetsData : pendingCodestreamToDecode.packetsData
			} );
			
		pendingCodestreamToDecode = null;
	}
	
	var codestreamPartParams = {
		minX : tileX * tileWidth,
		minY : tileY * tileHeight,
		maxXExclusive : (tileX + 1) * tileWidth,
		maxYExclusive : (tileY + 1) * tileHeight,
		numResolutionLevelsToCut : +numResolutionLevelsToCutTxt.value,
		maxNumQualityLayers : +maxNumQualityLayersTxt.value
	};
	
	var requestContext = image.createDataRequest(
		codestreamPartParams,
		dataCallback,
		/*userContextVars=*/null);
	
	dataCallback(requestContext);
}

function showCodestream(tileX, tileY) {
	var text = '';
	var codestream = codestreamPerTile[tileX][tileY];
	
	for (var i = 0; i < codestream.length; ++i) {
		if (codestream[i] < 16) {
			text += '0';
		}
		text += codestream[i].toString(16) + ' ';
		
		if ((i + 1) % 500 === 0) {
			text += '<br>';
		}
	}
	
	codestreamBytesDiv.innerHTML = text;
}

function loadImage() {
	if (image !== null) {
		image.close();
	}
	
	statusDiv.innerHTML = 'Waiting for server...';

	var url = jpipUrlTxt.value;
	var urlFixed = url.replace(/\\/g, '%5C');
	
	image = new JpipCodestreamClient();
	image.setStatusCallback(statusCallback);
    image.open(urlFixed);
}

loadImage();