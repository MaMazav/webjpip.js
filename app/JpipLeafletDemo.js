'use strict';

var west = -2.0;
var south = -1.0;
var east = 2.0;
var north = 1.0;

var jpipUrlText = document.getElementById('jpipUrlTxt');
var qualityLayersText = document.getElementById('qualityLayersTxt');
var errorContainer = document.getElementById('errorContainer');

var isTiled = false;
var imageryLayer = null;
var leafletMap;

var urlParamsString = document.URL.split('?')[1] || '';
var urlParamsArray = urlParamsString.split('&');
for (var i = 0; i < urlParamsArray.length; ++i) {
	var keyValue = urlParamsArray[i].split('=');
	var value = keyValue[1];
	
	switch (keyValue[0].toLowerCase()) {
		case 'url':
			jpipUrlText.value = value;
			break;
		
		case 'qualitylayers':
			qualityLayersText.value = value;
			break;
		
		case 'istiled':
			isTiled = Boolean(value);
			break;
		
		case 'west':
			west = +value;
			break;
		
		case 'south':
			south = +value;
			break;
		
		case 'east':
			east = +value;
			break;
		
		case 'north':
			north = +value;
			break;
	}
}

var latLngBounds = L.latLngBounds(
	L.latLng(south, west),
	L.latLng(north, east));

function loadJpipUrl() {
  if (imageryLayer !== null) {
    leafletMap.removeLayer(imageryLayer);
  }
  
  var url = jpipUrlText.value;
  var urlFixed = url.replace(/\\/g, '%5C');
  
  var qualityLayersToShow;
  if (qualityLayersText.value.toLowerCase() === 'max' || qualityLayersText.value === '') {
	qualityLayersToShow = undefined;
  } else {
	qualityLayersToShow = +qualityLayersText.value;
	qualityLayersToShow = Math.max(1, qualityLayersToShow);
  }
  
  var layerType = isTiled ? JpipTileLayer : JpipRegionLayer;
  
  imageryLayer = new layerType({
	url : urlFixed,
	latLngBounds : latLngBounds,
	bounds : latLngBounds,
	maxNumQualityLayers : qualityLayersToShow
	});
  
  imageryLayer.setExceptionCallback(exceptionCallback);
  
  leafletMap.addLayer(imageryLayer);
  
  leafletMap.fitBounds(latLngBounds);
}

function exceptionCallback(exception) {
    errorContainer.innerHTML = exception;
}

leafletMap = L.map('leafletContainer');

loadJpipUrl();