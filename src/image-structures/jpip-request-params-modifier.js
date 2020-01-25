'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = JpipRequestParamsModifier;

function JpipRequestParamsModifier(codestreamStructure) {
    this.modifyCodestreamPartParams = function modifyCodestreamPartParams(codestreamPartParams) {
        var codestreamPartParamsModified = castCodestreamPartParams(codestreamPartParams);
        return codestreamPartParamsModified;
    };

    this.modifyCustomProgressiveness = function modifyCustomProgressiveness(progressiveness) {
        if (!progressiveness || !progressiveness.length) {
            throw new jGlobals.jpipExceptions.ArgumentException(
                'progressiveness',
                progressiveness,
                'custom progressiveness argument should be non empty array');
        }

        // Ensure than minNumQualityLayers is given for all items
        
        var result = new Array(progressiveness.length);

        for (var i = 0; i < progressiveness.length; ++i) {
            var minNumQualityLayers = progressiveness[i].minNumQualityLayers;
            
            if (minNumQualityLayers !== 'max') {
                minNumQualityLayers = validateNumericParam(
                    minNumQualityLayers,
                    'progressiveness[' + i + '].minNumQualityLayers');
            }
            
            var forceMaxQuality = 'no';
            if (progressiveness[i].forceMaxQuality) {
                forceMaxQuality = progressiveness[i].forceMaxQuality;
                if (
                    forceMaxQuality !== 'no' &&
                    forceMaxQuality !== 'force' &&
                    forceMaxQuality !== 'forceAll') {

                    throw new jGlobals.jpipExceptions.ArgumentException(
                        'progressiveness[' + i + '].forceMaxQuality',
                        forceMaxQuality,
                        'forceMaxQuality should be "no", "force" or "forceAll"');
                }
                
                if (forceMaxQuality === 'forceAll') {
                    throw new jGlobals.jpipExceptions.UnsupportedFeatureException(
                        '"forceAll" value for forceMaxQuality in progressiveness');
                }
            }
            
            result[i] = {
                minNumQualityLayers: minNumQualityLayers,
                forceMaxQuality: forceMaxQuality
            };
        }
        
        return result;
    };

    this.getAutomaticProgressiveness = function getAutomaticProgressiveness(maxQuality) {
        // Create progressiveness of (1, 2, 3, (#max-quality/2), (#max-quality))

        var progressiveness = [];

        // No progressiveness, wait for all quality layers to be fetched
        var tileStructure = codestreamStructure.getDefaultTileStructure();
        var numQualityLayersNumeric = tileStructure.getNumQualityLayers();
        var qualityNumericOrMax = 'max';
        
        if (maxQuality !== undefined && maxQuality !== 'max') {
            numQualityLayersNumeric = Math.min(
                numQualityLayersNumeric, maxQuality);
            qualityNumericOrMax = numQualityLayersNumeric;
        }
        
        var firstQualityLayersCount = numQualityLayersNumeric < 4 ?
            numQualityLayersNumeric - 1: 3;
        
        for (var i = 1; i < firstQualityLayersCount; ++i) {
            progressiveness.push({
                minNumQualityLayers: i,
                forceMaxQuality: 'no'
            });
        }
        
        var middleQuality = Math.round(numQualityLayersNumeric / 2);
        if (middleQuality > firstQualityLayersCount && 
            (qualityNumericOrMax === 'max' || middleQuality < qualityNumericOrMax)) {
            progressiveness.push({
                minNumQualityLayers: middleQuality,
                forceMaxQuality: 'no'
            });
        }
        
        progressiveness.push({
            minNumQualityLayers: qualityNumericOrMax,
            forceMaxQuality: 'no'
        });
        
        // Force decoding only first quality layers for quicker show-up
        progressiveness[0].forceMaxQuality = 'force';

        return progressiveness;
    };

    function castCodestreamPartParams(codestreamPartParams) {
        var level = validateNumericParam(
            codestreamPartParams.level,
            'level',
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
            level: level
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