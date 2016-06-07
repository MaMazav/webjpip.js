'use strict';

var maxNumTilesToShow = 10000;

var statusDiv = document.getElementById('status');
var tilesViewerDiv = document.getElementById('tilesViewer');
var codestreamBytesDiv = document.getElementById('codestreamBytesDiv');
var errorDiv = document.getElementById('errorDiv');

var numResolutionLevelsToCutTxt = document.getElementById('numResolutionLevelsToCutTxt');
var numQualityLayersTxt = document.getElementById('numQualityLayersTxt');
var jpipUrlTxt = document.getElementById('jpipUrlTxt');
var minXTxt = document.getElementById('minXTxt');
var maxXTxt = document.getElementById('maxXTxt');
var minYTxt = document.getElementById('minYTxt');
var maxYTxt = document.getElementById('maxYTxt');
var maxQualityLayersRadio = document.getElementById('maxQualityLayersRadio');
var automaticProgressivenessRadio = document.getElementById('automaticProgressivenessRadio');
var useCachedDataOnlyRadio = document.getElementById('useCachedDataOnlyRadio');

var closeImageLink = document.getElementById('closeImageLink');
//var loadAllTilesLink = document.getElementById('loadAllTilesLink');
var showRegionLink = document.getElementById('showRegionLink');
var demonstrateLayersLink = document.getElementById('demonstrateLayersLink');

var maxNumResolutionLevelsSpan = document.getElementById('maxNumResolutionLevelsSpan');
var maxNumQualityLayersSpan = document.getElementById('maxNumQualityLayersSpan');

//var numTilesX = null;
//var numTilesY = null;
//var firstTileX = 0;
//var firstTileY = 0;
var defaultResolutionLevelsToCut;
var defaultQualityLayers;
var defaultMinX;
var defaultMinY;
var defaultMaxX;
var defaultMaxY;
var onlyQualityLayers;

var image = null;
//var codestreamPerTile;
var isImageReady = false;

var urlParamsString = document.URL.split('?')[1] || '';
var urlParamsArray = urlParamsString.split('&');
for (var i = 0; i < urlParamsArray.length; ++i) {
	var keyValue = urlParamsArray[i].split('=');
	var value = keyValue[1];
	
	switch (keyValue[0].toLowerCase()) {
		case 'url':
			jpipUrlTxt.value = value;
			break;

		case 'resolutionlevelstocut':
			defaultResolutionLevelsToCut = value;
			break;

		case 'qualitylayers':
			defaultQualityLayers = value;
			break;

		case 'minx':
			defaultMinX = value;
			break;

		case 'miny':
			defaultMinY = value;
			break;

		case 'maxx':
			defaultMaxX = value;
			break;

		case 'maxy':
			defaultMaxY = value;
			break;

		case 'onlyqualitylayers':
			onlyQualityLayers = Boolean(value);
			if (!onlyQualityLayers) {
				break;
			}
			
			document.getElementById('reduceQualityDiv').style.display = 'none';
			//document.getElementById('tilesViewer').style.display = 'none';
			document.getElementById('codestreamBytesDiv').style.display = 'none';
			document.getElementById('imageOpenDiv').style.display = 'none';
			document.getElementById('showRegionDiv').style.display = 'none';
			break;

	}
}

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
	
	statusDiv.innerHTML = 'Ready.';
	closeImageLink.innerHTML = 'Close image';
	//loadAllTilesLink.innerHTML = 'Load all tiles';
	showRegionLink.innerHTML = 'Show region';
	demonstrateLayersLink.innerHTML = 'Demonstrate quality layers';
	
	//numTilesX = image.getNumTilesX();
	//numTilesY = image.getNumTilesY();
	//
	//var numTiles = numTilesX * numTilesY;
	//var reduceBy = Math.ceil(numTiles / maxNumTilesToShow);
	//if (reduceBy > 1) {
	//	statusDiv.innerHTML = 'There are too much tiles ' + numTilesX + 'x' +
	//		numTilesY + '. Showing only part';
	//	reduceBy = Math.sqrt(reduceBy);
	//	
	//	numTilesX = Math.floor(numTilesX / reduceBy);
	//	numTilesY = Math.min(numTilesY, Math.floor(maxNumTilesToShow / numTilesX));
	//	
	//	firstTileX = Math.floor((image.getNumTilesX() - numTilesX) / 2);
	//	firstTileY = Math.floor((image.getNumTilesY() - numTilesY) / 2);
	//} else {
	//	firstTileX = 0;
	//	firstTileY = 0;
	//}
	
	var numResolutionLevels =
		+(defaultResolutionLevelsToCut || (image.getDefaultNumResolutionLevels() - 1));
	
	minXTxt.value = defaultMinX || 0;
	minYTxt.value = defaultMinY || 0;
	maxXTxt.value = defaultMaxX || image.getLevelWidth(numResolutionLevels);
	maxYTxt.value = defaultMaxY || image.getLevelHeight(numResolutionLevels);
	
	numQualityLayersTxt.value =
		defaultQualityLayers || image.getDefaultNumQualityLayers();
	
	numResolutionLevelsToCutTxt.value = numResolutionLevels;
	
	maxNumResolutionLevelsSpan.innerHTML = image.getDefaultNumResolutionLevels() - 1;
	maxNumQualityLayersSpan.innerHTML = image.getDefaultNumQualityLayers();

	//buildHTMLTileStructure();
	
	if (onlyQualityLayers) {
		demonstrateLayers();
	}
}

function buildHTMLTileStructure() {
	var tableHTML = '<table border=1><tr><td></td>';

	codestreamPerTile = new Array();
	
	for (var x = firstTileX; x < firstTileX + numTilesX; ++x) {
		tableHTML += '<th>' + x + '</th>';
		codestreamPerTile[x] = new Array(numTilesY);
	}
	
	for (var y = firstTileY; y < firstTileY + numTilesY; ++y) {
		tableHTML += '</tr><tr><th>' + y + '</th>';
		
		for (var x = firstTileX; x < firstTileX + numTilesX; ++x) {
			var name = x + '_' + y;
			var params = '' + x + ', ' + y;
			tableHTML +=
				'<td>' + 
					'<span id="span' + name + '"></span><br>' +
					'<a id="linkLoadTile' + name + '" href="javascript:loadTile(' + params + ')" >Load tile</a><br>' +
					'<div><canvas id="canvas' + name + '"></canvas></div><br>' +
				'</td>';
		}
		
		tableHTML += '</tr>';
	}
	
	tilesViewerDiv.innerHTML = tableHTML;
}

function disableAllLinks() {
	statusDiv.innerHTML = 'Not ready';
	closeImageLink.innerHTML = '';
	//loadAllTilesLink.innerHTML = '';
	showRegionLink.innerHTML = '';
	demonstrateLayersLink.innerHTML = '';
	
	return;

	for (var y = firstTileY; y < firstTileY + numTilesY; ++y) {
		for (var x = firstTileX; x < firstTileX + numTilesX; ++x) {
			var name = x + '_' + y;
			var linkLoadTileElement = document.getElementById('linkLoadTile' + name);
			
			linkLoadTileElement.innerHTML = '';
		}
	}
}

function loadAllTiles() {
	for (var x = firstTileX; x < firstTileX + numTilesX; ++x) {
		for (var y = firstTileY; y < firstTileY + numTilesY; ++y) {
			loadTile(x, y);
		}
	}
}

function showRegion() {
	var spanElement = document.getElementById('spanRegionStatus');
	var canvasElement = document.getElementById('canvasRegion');
	
	loadPixels(
		minXTxt.value,
		minYTxt.value,
		maxXTxt.value,
		maxYTxt.value,
		spanElement,
		canvasElement);
}

function demonstrateLayers() {
	var spanElement = document.getElementById('spanRegionStatus');
	var canvasElement = document.getElementById('canvasRegion');
	
	spanElement.innerHTML = 'Preprocessing all quality layers...';
	
	var numQualityLayers = +numQualityLayersTxt.value;
	var decodedQualityLayers = new Array(numQualityLayers);
	var decodedQualityLayersCount = 0;
	
	var qualityLayerToShow = 0;
	var setIntervalResult;
	
	for (var qualityLayerToDecode = 0; qualityLayerToDecode < numQualityLayers; ++qualityLayerToDecode) {
		decodePixelsAsynchronously(qualityLayerToDecode, qualityLayerDecoded);
	}
	
	function qualityLayerDecoded(qualityLayer, decodedImageData) {
		decodedQualityLayers[qualityLayer] = decodedImageData;
		++decodedQualityLayersCount;
		
		if (decodedQualityLayersCount === numQualityLayers) {
			setIntervalResult = setInterval(showNextQualityLayer, 1000);
		}
	}
	
	function showNextQualityLayer() {
		if (qualityLayerToShow >= numQualityLayers) {
			clearInterval(setIntervalResult);
			spanElement.innerHTML = 'Done.';
			
			if (onlyQualityLayers) {
				image.close();
			}
			
			return;
		}
		
		spanElement.innerHTML = 'Watch the cool animation! Current quality layer: ' +
			qualityLayerToShow + ', encoded bytes: ' +
			decodedQualityLayers[qualityLayerToShow].encodedLengthBytes;
		
		canvasElement.width = decodedQualityLayers[qualityLayerToShow].width;
		canvasElement.height = decodedQualityLayers[qualityLayerToShow].height;
		var context = canvasElement.getContext('2d');
		context.putImageData(decodedQualityLayers[qualityLayerToShow], 0, 0);
		
		++qualityLayerToShow;
	}
}

function decodePixelsAsynchronously(qualityLayer, callback) {
	var progressiveness = undefined;
	
	var fetchParams = createFetchParams(
		minXTxt.value,
		minYTxt.value,
		maxXTxt.value,
		maxYTxt.value,
		qualityLayer + 1);
	
	var width = fetchParams.maxXExclusive - fetchParams.minX;
	var height = fetchParams.maxYExclusive - fetchParams.minY;
	
	image.requestPixels(fetchParams)
        .then(pixelsCallback)
        .catch(function failed(reason) {
            alert('Failed fetching pixels: ' + reason);
        });
	
	var tempCanvas = document.createElement('canvas');
	tempCanvas.width = width;
	tempCanvas.height = height;
	var allRelevantBytesLoaded = 0;
	var context = tempCanvas.getContext('2d');
	
	function pixelsCallback(decoded, allRelevantBytesLoaded_) {
		var imageData = context.createImageData(decoded.width, decoded.height);
		imageData.data.set(decoded.pixels);
		allRelevantBytesLoaded = allRelevantBytesLoaded_;
		
		var x = decoded.xInOriginalRequest;
		var y = decoded.yInOriginalRequest;
        if (x !== 0 || y !== 0) {
            throw 'Unexpected offset of non progressive request';
        }
        
        imageData.encodedLengthBytes = decoded.allRelevantBytesLoaded;
        callback(qualityLayer, imageData);
	}
}

function loadTile(tileX, tileY) {
	var name = tileX + '_' + tileY;

	var linkLoadTileElement = document.getElementById('linkLoadTile' + name);
	linkLoadTileElement.innerHTML = 'Reload tile';

	var spanElement = document.getElementById('span' + name);
	var canvasElement = document.getElementById('canvas' + name);
	loadTiles(
		tileX, tileY, tileX + 1, tileY + 1, spanElement, canvasElement);
}

function loadPixels(minX, minY, maxX, maxY, spanElement, canvasElement) {
	spanElement.innerHTML = 'Working...';
	
	var useCachedDataOnly = Boolean(useCachedDataOnlyRadio.checked);
	var automaticProgressiveness = Boolean(automaticProgressivenessRadio.checked);
	var isNoProgressiveness = Boolean(maxQualityLayersRadio.checked);

    var onRadioButtons =
        +useCachedDataOnly + automaticProgressiveness + isNoProgressiveness;
    
	if (onRadioButtons !== 1) {
		throw 'Unexpected radio buttons state';
	}

	var fetchParams = createFetchParams(
		minX, minY, maxX, maxY, numQualityLayersTxt.value);
	
	if (automaticProgressiveness) {
		image.requestPixelsProgressive(
			fetchParams, pixelsDecodedCallback, terminatedCallback);
		return;
	}
	
    if (useCachedDataOnly) {
        alert('"Cached data only" is supported now');
        return;
    }
	
	var promise = image.requestPixels(fetchParams);
	promise.then(nonProgressiveCallback).catch(nonProgressiveFailureCallback);
    
    function nonProgressiveCallback(decoded) {
        pixelsDecodedCallback(decoded);
        terminatedCallback(/*isAborted=*/false);
    }
    
    function nonProgressiveFailureCallback(reason) {
        terminatedCallback(/*isAborted=*/true);
    }

	function pixelsDecodedCallback(decoded) {
		copyPixels(canvasElement, decoded);
	}
	
	function terminatedCallback(isAborted) {
		spanElement.innerHTML = isAborted ? 'Aborted!' : 'Done.';
	}
}

function createFetchParams(
	minX, minY, maxX, maxY, maxNumQualityLayers) {
	
	var numResolutionLevelsToCut = +numResolutionLevelsToCutTxt.value;
	
	var scaleX = image.getLevelWidth() / image.getLevelWidth(numResolutionLevelsToCut);
	var scaleY = image.getLevelHeight() / image.getLevelHeight(numResolutionLevelsToCut);
	
	var regionParams = {
		minX : minX * scaleX,
		minY : minY * scaleY,
		maxXExclusive : maxX * scaleX,
		maxYExclusive : maxY * scaleY,
		screenWidth  : maxX - minX,
		screenHeight : maxY - minY
		//numResolutionLevelsToCut : numResolutionLevelsToCut,
		//maxNumQualityLayers : maxNumQualityLayers
	};
	
	var alignedParams = jpipImageHelperFunctions.alignParamsToTilesAndLevel(regionParams, image);
	alignedParams.codestreamPartParams.maxNumQualityLayers = maxNumQualityLayers;
	
	return alignedParams.codestreamPartParams;
}

function copyPixels(canvasElement, decoded) {
	var x = decoded.xInOriginalRequest;
	var y = decoded.yInOriginalRequest;
	
	if (decoded.originalRequestWidth !== canvasElement.width) {
		canvasElement.width = decoded.originalRequestWidth;
	}
	if (decoded.originalRequestHeight !== canvasElement.height) {
		canvasElement.height = decoded.originalRequestHeight;
	}
	
	var context = canvasElement.getContext('2d');
	var imageData = context.getImageData(x, y, decoded.width, decoded.height);
	imageData.data.set(decoded.pixels);
	
	context.putImageData(imageData, x, y);
}

function loadImage() {
	if (image !== null) {
		image.close();
	}
	
	statusDiv.innerHTML = 'Waiting for server...';

	var url = jpipUrlTxt.value;
	var urlFixed = url.replace(/\\/g, '%5C');
	
	image = new JpxJpipImage();
	image.setStatusCallback(statusCallback);
    image.open(urlFixed);
}

loadImage();
