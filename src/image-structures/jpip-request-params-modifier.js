'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipRequestParamsModifier;

function JpipRequestParamsModifier(codestreamStructure) {
    this.modify = function modify(codestreamPartParams, options) {
        var codestreamPartParamsModified = castCodestreamPartParams(codestreamPartParams);

        options = options || {};
        var useCachedDataOnly = options.useCachedDataOnly;
        var disableProgressiveness = options.disableProgressiveness;

        var progressivenessModified;
        if (options.progressiveness !== undefined) {
            if (useCachedDataOnly || disableProgressiveness) {
                throw new jGlobals.jpipExceptions.ArgumentException(
                    'options.progressiveness',
                    options.progressiveness,
                    'options contradiction: cannot accept both progressiveness' +
                    'and useCachedDataOnly/disableProgressiveness options');
            }
            progressivenessModified = castProgressivenessParams(
                options.progressiveness,
                codestreamPartParamsModified.quality,
                'quality');
        } else  if (useCachedDataOnly) {
            progressivenessModified = [ { minNumQualityLayers: 0 } ];
        } else if (disableProgressiveness) {
            var quality = codestreamPartParamsModified.quality;
            var minNumQualityLayers =
                quality === undefined ? 'max' : quality;
            
            progressivenessModified = [ { minNumQualityLayers: minNumQualityLayers } ];
        } else {
            progressivenessModified = getAutomaticProgressivenessStages(
                codestreamPartParamsModified.quality);
        }
        
        return {
            codestreamPartParams: codestreamPartParamsModified,
            progressiveness: progressivenessModified
        };
    };

    function castProgressivenessParams(progressiveness, quality, propertyName) {
        // Ensure than minNumQualityLayers is given for all items
        
        var result = new Array(progressiveness.length);

        for (var i = 0; i < progressiveness.length; ++i) {
            var minNumQualityLayers = progressiveness[i].minNumQualityLayers;
            
            if (minNumQualityLayers !== 'max') {
                if (quality !== undefined &&
                    minNumQualityLayers > quality) {
                    
                    throw new jGlobals.jpipExceptions.ArgumentException(
                        'progressiveness[' + i + '].minNumQualityLayers',
                        minNumQualityLayers,
                        'minNumQualityLayers is bigger than ' +
                            'fetchParams.quality');
                }
                
                minNumQualityLayers = validateNumericParam(
                    minNumQualityLayers,
                    propertyName,
                    'progressiveness[' + i + '].minNumQualityLayers');
            }
            
            result[i] = { minNumQualityLayers: minNumQualityLayers };
        }
        
        return result;
    }

    function getAutomaticProgressivenessStages(quality) {
        // Create progressiveness of (1, 2, 3, (#max-quality/2), (#max-quality))

        var progressiveness = [];

        // No progressiveness, wait for all quality layers to be fetched
        var tileStructure = codestreamStructure.getDefaultTileStructure();
        var numQualityLayersNumeric = tileStructure.getNumQualityLayers();
        var qualityNumericOrMax = 'max';
        
        if (quality !== undefined) {
            numQualityLayersNumeric = Math.min(
                numQualityLayersNumeric, quality);
            qualityNumericOrMax = numQualityLayersNumeric;
        }
        
        var firstQualityLayersCount = numQualityLayersNumeric < 4 ?
            numQualityLayersNumeric - 1: 3;
        
        for (var i = 1; i < firstQualityLayersCount; ++i) {
            progressiveness.push({ minNumQualityLayers: i });
        }
        
        var middleQuality = Math.round(numQualityLayersNumeric / 2);
        if (middleQuality > firstQualityLayersCount) {
            progressiveness.push({ minNumQualityLayers: middleQuality });
        }
        
        progressiveness.push({
            minNumQualityLayers: qualityNumericOrMax
            });
        
        return progressiveness;
    }

    function castCodestreamPartParams(codestreamPartParams) {
        var level = validateNumericParam(
            codestreamPartParams.level,
            'level',
            /*defaultValue=*/undefined,
            /*allowUndefiend=*/true);

        var quality = validateNumericParam(
            codestreamPartParams.quality,
            'quality',
            /*defaultValue=*/undefined,
            /*allowUndefiend=*/true);
        
        var minX = validateNumericParam(codestreamPartParams.minX, 'minX');
        var minY = validateNumericParam(codestreamPartParams.minY, 'minY');
        
        var maxX = validateNumericParam(
            codestreamPartParams.maxXExclusive, 'maxXExclusive');
        
        var maxY = validateNumericParam(
            codestreamPartParams.maxYExclusive, 'maxYExclusive');
        
        var levelWidth = codestreamStructure.getLevelWidth(level);
        var levelHeight = codestreamStructure.getLevelHeight(level);
        
        if (minX < 0 || maxX > levelWidth ||
            minY < 0 || maxY > levelHeight ||
            minX >= maxX || minY >= maxY) {
            
            throw new jGlobals.jpipExceptions.ArgumentException(
                'codestreamPartParams', codestreamPartParams);
        }
        
        var result = {
            minX: minX,
            minY: minY,
            maxXExclusive: maxX,
            maxYExclusive: maxY,
            
            level: level,
            quality: quality
            };
        
        return result;
    }

    function validateNumericParam(
        inputValue, propertyName, defaultValue, allowUndefined) {
        
        if (inputValue === undefined &&
            (defaultValue !== undefined || allowUndefined)) {
            
            return defaultValue;
        }
        
        var result = +inputValue;
        if (isNaN(result) || result !== Math.floor(result)) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                propertyName, inputValue);
        }
        
        return result;
    }
}