'use strict';

importScripts('../../../jpx.js/util.js');
importScripts('../../../jpx.js/arithmetic_decoder.js');
importScripts('../../../jpx.js/jpx.js');
importScripts('../../../jpx.js/asyncjpximage.js');
importScripts('../../workerhelper/slavesideworkerhelper.js');
importScripts('../jpxjpipimagehelpers/copyTilesPixelsToOnePixelsArray.js');

SlaveSideWorkerHelper.setSlaveSideCtor(createImage);
self.onmessage = SlaveSideWorkerHelper.onMessage;

function createImage(args) {
    var image = new AsyncJpxImage();
    return image;
}