'use strict';

var SingleRegionPrioritizer = (function SingleRegionPrioritizerClosure() {
    var PRIORITY_OLD_REGION = -1;
    var PRIORITY_LAST_REGION = 0;
    var PRIORITY_FETCH_EVEN_IF_NOT_LAST_REGION = 1;
    
    function SingleRegionPrioritizer() {
        this._currentRequestIndex = null;
    }
    
    SingleRegionPrioritizer.prototype = {
        setPrioritizerData: function setPrioritizerData(prioritizerData) {
            this._currentRequestIndex = prioritizerData;
        },
        
        getPriority: function getPriority(jobContext) {
            var priorityData = jobContext.codestreamPartParams.requestPriorityData;
            if (priorityData.overrideHighestPriority) {
                return PRIORITY_FETCH_EVEN_IF_NOT_LAST_REGION;
            }
            
            var requestIndex = priorityData.requestIndex;
            if (requestIndex === undefined ||
                this._currentRequestIndex === null) {
                
                throw 'Missing request index information, cannot prioritize';
            }
            
            var isLastRequest = requestIndex === this._currentRequestIndex;
            var result = isLastRequest ? PRIORITY_LAST_REGION : PRIORITY_OLD_REGION;
            
            return result;
        }
    };
    
    return SingleRegionPrioritizer;
})();