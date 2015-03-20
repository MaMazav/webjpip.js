'use strict';

var jpipUrlText = document.getElementById('jpipUrlTxt');
var qualityLayersText = document.getElementById('qualityLayersTxt');
var errorContainer = document.getElementById('errorContainer');

var west = -2.0;
var south = -1.0;
var east = 2.0;
var north = 1.0;
var isTiled = false;
var imageryLayer = null;
var imageryProviderOrLayerManager = null;
var imageryLayers;
var camera;
var cesiumWidget;

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

var rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north);

function loadJpipUrl() {
    if (imageryLayer !== null) {
        imageryLayers.remove(imageryLayer);
        imageryLayer = null;
    }
    
    if (imageryProviderOrLayerManager !== null) {
        imageryProviderOrLayerManager.close();
        imageryProviderOrLayerManager = null;
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
    
    if (isTiled) {
        imageryProviderOrLayerManager = new JpipImageryProvider({
            url: urlFixed,
            rectangle: rectangle,
            maxNumQualityLayers: qualityLayersToShow
        });
    } else {
        imageryProviderOrLayerManager = new CesiumJpipLayerManager({
            cartographicBounds : rectangle,
            maxNumQualityLayers : qualityLayersToShow,
            url: urlFixed
        });
    }
    
    imageryProviderOrLayerManager.setExceptionCallback(exceptionCallback);
    imageryProviderOrLayerManager.open(cesiumWidget);
    
    if (isTiled) {
        var imageryProvider = imageryProviderOrLayerManager;
        imageryLayer = imageryLayers.addImageryProvider(imageryProvider);
    }
    
    setTimeout(function delayedViewRectangle() {
        camera.viewRectangle(rectangle, cesiumWidget.scene.mapProjection.ellipsoid);
    }, 100);
}

function exceptionCallback(exception) {
    errorContainer.innerHTML = exception;
}

cesiumWidget = new Cesium.CesiumWidget('cesiumContainer', {
    imageryProvider : new Cesium.SingleTileImageryProvider({
        url : 'black.png',
        rectangle : rectangle
    }),
    contextOptions : { alpha : true, webgl : { alpha : true } },
    sceneMode : Cesium.SceneMode.SCENE2D,
    baseLayerPicker : false,
    geocoder : false
});

var scene = cesiumWidget.scene;
imageryLayers = scene.imageryLayers;
camera = scene.camera;

loadJpipUrl();