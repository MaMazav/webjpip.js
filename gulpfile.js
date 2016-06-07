'use strict';

var browserify = require('browserify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var gutil = require('gulp-util');
var rename = require('gulp-rename');
var addsrc = require('gulp-add-src');
var concat = require('gulp-concat');
var jshint = require('gulp-jshint');
var filter = require('gulp-filter');
var mergeStream = require('merge-stream');

var sources = [
    './src/api/jpip-codestream-client.js',
    './src/api/jpip-codestream-sizes-calculator.js',
    './src/api/jpip-request-context.js',
    './src/databins/composite-array.js',
    './src/databins/jpip-databin-parts.js',
    './src/databins/jpip-databins-saver.js',
    './src/databins/jpip-object-pool-by-databin.js',
    './src/databins/jpip-request-databins-listener.js',
    './src/image-structures/jpip-codestream-structure.js',
    './src/image-structures/jpip-component-structure.js',
    './src/image-structures/jpip-tile-structure.js',
    './src/parsers/jpip-markers-parser.js',
    './src/parsers/jpip-offsets-calculator.js',
    './src/parsers/jpip-structure-parser.js',
    './src/protocol/jpip-channel.js',
    './src/protocol/jpip-message-header-parser.js',
    './src/protocol/jpip-reconnectable-requester.js',
    './src/protocol/jpip-request.js',
    './src/protocol/jpip-session.js',
    './src/protocol/jpip-session-helper.js',
    './src/quality-layers/jpip-bitstream-reader.js',
    './src/quality-layers/jpip-codeblock-length-parser.js',
    './src/quality-layers/jpip-coding-passes-number-parser.js',
    './src/quality-layers/jpip-packet-length-calculator.js',
    './src/quality-layers/jpip-quality-layers-cache.js',
    './src/quality-layers/jpip-subband-length-in-packet-header-calculator.js',
    './src/quality-layers/jpip-tag-tree.js',
    './src/quality-layers/mutual-exclusive-transaction-helper.js',
    './src/writers/jpip-codestream-reconstructor.js',
    './src/writers/jpip-header-modifier.js',
    './src/writers/jpip-packets-data-collector.js',

    './src/misc/j2k-jpip-globals.js',
    './src/misc/jpip-runtime-factory.js',
    './src/misc/simple-ajax-helper.js'
];

var vendorsProd = [
    './vendor/imagedecoderframework.js',
    './vendor/pdf.js/arithmetic_decoder.js',
    './vendor/pdf.js/async-jpx-image.js',
    './vendor/pdf.js/jpx.js',
    './vendor/pdf.js/util.js'
];

var vendorsDebug = [
    './vendor/imagedecoderframework-debug.js',
    './vendor/pdf.js/arithmetic_decoder.js',
    './vendor/pdf.js/async-jpx-image.js',
    './vendor/pdf.js/jpx.js',
    './vendor/pdf.js/util.js'
];

var scriptsDebug = vendorsDebug.concat(sources);
var scriptsProd = vendorsProd.concat(sources);

function build(isDebug) {
    var browserified = browserify({
        entries: ['./src/webjpip-exports.js'],
        paths: [
            './src/api',
            './src/databins',
            './src/image-structures',
            './src/misc',
            './src/parsers',
            './src/protocol',
            './src/quality-layers',
            './src/writers'
        ],
        standalone: 'webjpip',
        debug: isDebug
    });
    
    var scripts = isDebug ? scriptsDebug : scriptsProd;
    var vendors = isDebug ? vendorsDebug : vendorsProd;
    var jshintStream = gulp.src(scripts)
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(buffer())
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
    
    var browserifyStream = browserified
        .bundle()
        .pipe(source('webjpip-src.js'))
        .pipe(buffer());
    
    if (!isDebug) {
        browserifyStream = browserifyStream
        .pipe(uglify())
        .on('error', gutil.log);
    }
            // NOTE: Add it in production
            //.pipe(uglify(/* { compress: { unused: false } } */))
            //.on('error', gutil.log);
    for (var i = 0; i < vendors.length; ++i) {
        browserifyStream = browserifyStream.pipe(addsrc(vendors[i]));
    }
    
    var outFile = isDebug ? 'webjpip-debug' : 'webjpip';
    
    browserifyStream = browserifyStream
        .pipe(concat('webjpip-src.js'))
        .pipe(rename(outFile + '.js'))
        .pipe(sourcemaps.write(outFile))
        .pipe(gulp.dest('./'));

    //return jshintStream;
    return mergeStream(jshintStream, browserifyStream);
}

gulp.task('debug', function () {
    return build(/*isDebug=*/true);
});

gulp.task('prod', function() {
    return build(/*isDebug=*/false);
});

gulp.task('default', ['debug', 'prod']);