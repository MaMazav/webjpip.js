'use strict';

var LifoScheduler = (function LifoScheduler() {
    function LifoScheduler(createResource, jobsLimit) {
        this._resourceCreator = createResource;
        this._jobsLimit = jobsLimit;
        this._freeResourcesCount = this._jobsLimit;
        this._freeResources = new Array(this._jobsLimit);
        this._pendingJobs = [];
    }
    
    LifoScheduler.prototype = {
        enqueueJob: function enqueueJob(jobFunc, jobContext) {
            if (this._freeResourcesCount > 0) {
                --this._freeResourcesCount;
                
                var resource = this._freeResources.pop();
                if (resource === undefined) {
                    resource = this._resourceCreator();
                }
                
                jobFunc(resource, jobContext);
            } else {
                this._pendingJobs.push({
                    jobFunc: jobFunc,
                    jobContext: jobContext
                    });
            }
        },
        
        jobDone: function jobDone(resource) {
            if (this._pendingJobs.length > 0) {
                var nextJob = this._pendingJobs.pop();
                nextJob.jobFunc(resource, nextJob.jobContext);
            } else {
                this._freeResources.push(resource);
                ++this._freeResourcesCount;
            }
        },
        
        tryYield: function yieldResource(jobFunc, jobContext, resource) {
            return false;
        }
    };
    
    return LifoScheduler;
})();