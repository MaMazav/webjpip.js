var _jGlobals = {
    j2kMarkers              : module.exports.j2kMarkers,
    j2kOffsets              : module.exports.j2kOffsets,
    jpipEndOfResponseReasons: module.exports.jpipEndOfResponseReasons,
    j2kExceptions           : module.exports.j2kExceptions,
    jpipExceptions          : module.exports.jpipExceptions
};

var requiresMap = {
    'j2k-jpip-globals': _jGlobals,
    'jpip-runtime-factory': mockFactoryForCodestreamClientTest
};

function require(path) {
    var result = requiresMap[path];
    if (!result && (path.indexOf('.js', path.length - 3) > 0)) {
        // path ends with .js
        result = requiresMap[path.substr(0, path.length - 3)];
    }
    
    if (!result) {
        throw 'Could not find require lib for ' + path + '. Fix test';
    }
    return result;
}