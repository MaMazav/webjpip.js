const path = require('path');
const MinifyPlugin = require("babel-minify-webpack-plugin");

module.exports = getConfiguration;

function getConfiguration(env) {
    var outFile;
    var plugins = [];
    if (env === 'prod') {
        outFile = 'webjpip.dev';
        plugins.push(new MinifyPlugin());
    } else {
        if (env !== 'dev') {
            console.log('Unknown env ' + env + '. Defaults to dev');
        }
        outFile = 'webjpip.dev.debug';
    }
    
    var entry = {};
    entry[outFile] = './src/webjpip-exports.js';

    return {
        entry: entry,
        plugins: plugins,
        output: {
            filename: '[name].js',
            path: __dirname,
            library: 'webjpip',
            libraryTarget: 'var'
        },
        resolve: {
            modules: [
                path.resolve(__dirname, 'vendor', 'pdf.js', 'core'),
                path.resolve(__dirname, 'vendor', 'pdf.js', 'shared'),
                path.resolve(__dirname, 'src', 'api'),
                path.resolve(__dirname, 'src', 'databins'),
                path.resolve(__dirname, 'src', 'image-structures'),
                path.resolve(__dirname, 'src', 'misc'),
                path.resolve(__dirname, 'src', 'parsers'),
                path.resolve(__dirname, 'src', 'protocol'),
                path.resolve(__dirname, 'src', 'quality-layers'),
                path.resolve(__dirname, 'src', 'writers'),
            ]
        },
        module: { rules: [
            {
                test: /\.js$/, // include .js files
                enforce: 'pre', // preload the jshint loader
                exclude: /node_modules|vendor.pdf\.js.core|vendor.pdf\.js.shared/,
                use: [ { loader: 'jshint-loader' } ]
            },
            {
                test: [/\.js$/],
                exclude: [/node_modules/],
                loader: 'babel-loader',
                options: { presets: ['es2015'] }
            }
        ] }
    };
}