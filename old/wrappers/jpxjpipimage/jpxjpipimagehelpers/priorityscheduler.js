'use strict';

var PriorityScheduler = (function PrioritySchedulerClosure() {
    function PriorityScheduler(
        createResource, jobsLimit, prioritizer, options) {
        
        options = options || {};
        this._resourceCreator = createResource;
        this._jobsLimit = jobsLimit;
        this._prioritizer = prioritizer;
        
        this._showLog = options.showLog;
        this._schedulerName = options.schedulerName;
        this._numNewJobs = options.numNewJobs || 20;
        this._numJobsBeforeRerankOldPriorities =
            options.numJobsBeforeRerankOldPriorities || 20;
            
        this._freeResourcesCount = this._jobsLimit;
        this._freeResources = new Array(this._jobsLimit);
        
        this._resourcesGuaranteedForHighPriority =
            options.resourcesGuaranteedForHighPriority || 0;
        this._highPriorityToGuaranteeResource =
            options.highPriorityToGuaranteeResource || 0;
        
        this._pendingJobsCount = 0;
        this._oldPendingJobsByPriority = [];
        initializeNewPendingJobsLinkedList(this);
        
        this._schedulesCounter = 0;
    }
    
    PriorityScheduler.prototype = {
        enqueueJob: function enqueueJob(jobFunc, jobContext, jobAbortedFunc) {
            var priority = this._prioritizer.getPriority(jobContext);
            
            if (priority < 0) {
                jobAbortedFunc(jobContext);
                return;
            }
            
            var job = {
                jobFunc: jobFunc,
                jobAbortedFunc: jobAbortedFunc,
                jobContext: jobContext
            };
            
            var minPriority = getMinimalPriorityToSchedule(self);
            
            var resource = null;
            if (priority >= minPriority) {
                resource = tryGetFreeResource(this);
            }
            
            if (resource !== null) {
                schedule(this, job, resource);
                return;
            }
            
            enqueueNewJob(this, job, priority);
            ensurePendingJobsCount(self);
        },
        
        jobDone: function jobDone(resource, jobContext) {
            if (this._showLog) {
                var message = '';
                if (this._schedulerName !== undefined) {
                    message = this._schedulerName + '\'s ';
                }
                
                var priority = this._prioritizer.getPriority(jobContext);
                message += ' job done of priority ' + priority;
                
                console.log(message);
            }
            
            resourceFreed(this, resource);
            ensurePendingJobsCount(self);
        },
        
        tryYield: function tryYield(
            jobContinueFunc, jobContext, jobAbortedFunc, jobYieldedFunc, resource) {
            
            var priority = this._prioritizer.getPriority(jobContext);
            if (priority < 0) {
                jobAbortedFunc(jobContext);
                resourceFreed(this, resource);
                return true;
            }
                
            var higherPriorityJob = tryDequeueNewJobWithHigherPriority(
                this, priority);
            ensurePendingJobsCount(self);
            
            if (higherPriorityJob === null) {
                return false;
            }
            
            jobYieldedFunc(jobContext);

            var job = {
                jobFunc: jobContinueFunc,
                jobAbortedFunc: jobAbortedFunc,
                jobContext: jobContext
                };
                
            enqueueNewJob(this, job, priority);
            ensurePendingJobsCount(self);

            schedule(this, higherPriorityJob, resource);
            ensurePendingJobsCount(self);
            
            return true;
        }
    }; // end prototype
    
    function tryDequeueNewJobWithHigherPriority(self, lowPriority) {
        var jobToScheduleNode = null;
        var highestPriorityFound = lowPriority;
        var countedPriorities = [];

        var currentNode = self._newPendingJobsLinkedList.getFirstIterator();
        
        while (currentNode !== null) {
            var nextNode = self._newPendingJobsLinkedList.getNextIterator(
                currentNode);
                
            var job = self._newPendingJobsLinkedList.getValue(currentNode);
            var priority = self._prioritizer.getPriority(job.jobContext);
            
            if (priority < 0) {
                extractJobFromLinkedList(self, currentNode);
                --self._pendingJobsCount;
                
                job.jobAbortedFunc(job.jobContext);
                currentNode = nextNode;
                continue;
            }
            
            if (highestPriorityFound === undefined ||
                priority > highestPriorityFound) {
                
                highestPriorityFound = priority;
                jobToScheduleNode = currentNode;
            }
            
            if (!self._showLog) {
                currentNode = nextNode;
                continue;
            }
            
            if (countedPriorities[priority] === undefined) {
                countedPriorities[priority] = 1;
            } else {
                ++countedPriorities[priority];
            }
            
            currentNode = nextNode;
        }
        
        var jobToSchedule = null;
        if (jobToScheduleNode !== null) {
            jobToSchedule = extractJobFromLinkedList(self, jobToScheduleNode);
            --self._pendingJobsCount;
        }
        
        if (self._showLog) {
            var jobsListMessage = '';
            var jobDequeuedMessage = '';
            if (self._schedulerName !== undefined) {
                jobsListMessage = self._schedulerName + '\'s ';
                jobDequeuedMessage = self._schedulerName + '\'s ';
            }
            
            jobsListMessage += 'Jobs list:';

            for (var i = 0; i < countedPriorities.length; ++i) {
                if (countedPriorities[i] !== undefined) {
                    jobsListMessage += countedPriorities[i] + ' jobs of priority ' + i + ';';
                }
            }
            
            console.log(jobsListMessage);

            if (jobToSchedule !== null) {
                jobDequeuedMessage += ' dequeued new job of priority ' + highestPriorityFound;
                console.log(jobDequeuedMessage);
            }
        }
        
        ensurePendingJobsCount(self);
        
        return jobToSchedule;
    }
    
    function tryGetFreeResource(self) {
        if (self._freeResourcesCount === 0) {
            return null;
        }
        --self._freeResourcesCount;
        var resource = self._freeResources.pop();
        
        if (resource === undefined) {
            resource = self._resourceCreator();
        }
        
        ensurePendingJobsCount(self);
        
        return resource;
    }
    
    function enqueueNewJob(self, job, priority) {
        ++self._pendingJobsCount;
        
        var firstIterator = self._newPendingJobsLinkedList.getFirstIterator();
        addJobToLinkedList(self, job, firstIterator);
        
        if (self._showLog) {
            var message = '';
            if (self._schedulerName !== undefined) {
                message = self._schedulerName + '\'s ';
            }
            
            message += ' enqueued job of priority ' + priority;
            
            console.log(message);
        }
        
        if (self._newPendingJobsLinkedList.getCount() <= self._numNewJobs) {
            ensurePendingJobsCount(self);
            return;
        }
        
        var lastIterator = self._newPendingJobsLinkedList.getLastIterator();
        var oldJob = extractJobFromLinkedList(self, lastIterator);
        enqueueOldJob(self, oldJob);
        ensurePendingJobsCount(self);
    }
    
    function enqueueOldJob(self, job) {
        var priority = self._prioritizer.getPriority(job.jobContext);
        
        if (priority < 0) {
            --self._pendingJobsCount;
            job.jobAbortedFunc(job.jobContext);
            return;
        }
        
        if (self._oldPendingJobsByPriority[priority] === undefined) {
            self._oldPendingJobsByPriority[priority] = [];
        }
        
        self._oldPendingJobsByPriority[priority].push(job);
    }
    
    function rerankPriorities(self) {
        var originalOldsArray = self._oldPendingJobsByPriority;
        var originalNewsList = self._newPendingJobsLinkedList;
        
        if (originalOldsArray.length === 0) {
            return;
        }
        
        self._oldPendingJobsByPriority = [];
        initializeNewPendingJobsLinkedList(self);
        
        for (var i = 0; i < originalOldsArray.length; ++i) {
            if (originalOldsArray[i] === undefined) {
                continue;
            }
            
            for (var j = 0; j < originalOldsArray[i].length; ++j) {
                enqueueOldJob(self, originalOldsArray[i][j]);
            }
        }
        
        var iterator = originalNewsList.getFirstIterator();
        while (iterator !== null) {
            var value = originalNewsList.getValue(iterator);
            enqueueOldJob(self, value);
            
            iterator = originalNewsList.getNextIterator(iterator);
        }
        
        var message = '';
        if (self._schedulerName !== undefined) {
            message = self._schedulerName + '\'s ';
        }
        message += 'rerank: ';
        
        for (var i = self._oldPendingJobsByPriority.length - 1; i >= 0; --i) {
            var highPriorityJobs = self._oldPendingJobsByPriority[i];
            if (highPriorityJobs === undefined) {
                continue;
            }
            
            if (self._showLog) {
                message += highPriorityJobs.length + ' jobs in priority ' + i + ';';
            }
            
            while (highPriorityJobs.length > 0 &&
                    self._newPendingJobsLinkedList.getCount() < self._numNewJobs) {
                    
                var job = highPriorityJobs.pop();
                addJobToLinkedList(self, job);
            }
            
            if (self._newPendingJobsLinkedList.getCount() >= self._numNewJobs &&
                !self._showLog) {
                break;
            }
        }
        
        if (self._showLog) {
            console.log(message);
        }
        
        ensurePendingJobsCount(self);
    }
    
    function resourceFreed(self, resource) {
        ++self._freeResourcesCount;
        var minPriority = getMinimalPriorityToSchedule(self);
        --self._freeResourcesCount;
        
        var job = tryDequeueNewJobWithHigherPriority(self, minPriority);

        if (job !== null) {
            ensurePendingJobsCount(self);
            schedule(self, job, resource);
            ensurePendingJobsCount(self);
            
            return;
        }
        
        var hasOldJobs =
            self._pendingJobsCount > self._newPendingJobsLinkedList.getCount();
            
        if (hasOldJobs) {
            self._freeResources.push(resource);
            ++self._freeResourcesCount;
            
            ensurePendingJobsCount(self);
            return;
        }
        
        var numPriorities = self._oldPendingJobsByPriority.length;
        var jobPriority;
        
        for (var priority = numPriorities - 1; priority >= 0; --priority) {
            var jobs = self._oldPendingJobsByPriority[priority];
            if (jobs === undefined || jobs.length === 0) {
                continue;
            }
            
            for (var i = jobs.length - 1; i >= 0; --i) {
                job = jobs[i];
                jobPriority = self._prioritizer.getPriority(job.jobContext);
                if (jobPriority >= priority) {
                    jobs.length = i;
                    break;
                } else if (jobPriority < 0) {
                    --self._pendingJobsCount;
                    job.jobAbortedFunc(job.jobContext);
                } else {
                    if (self._oldPendingJobsByPriority[jobPriority] === undefined) {
                        self._oldPendingJobsByPriority[jobPriority] = [];
                    }
                    
                    self._oldPendingJobsByPriority[jobPriority].push(job);
                }
                
                job = null;
            }
            
            if (job !== null) {
                break;
            }
            
            jobs.length = 0;
        }
        
        if (job === null) {
            self._freeResources.push(resource);
            ++self._freeResourcesCount;
            
            ensurePendingJobsCount(self);
            
            return;
        }
        
        if (self._showLog) {
            var message = '';
            if (self._schedulerName !== undefined) {
                message = self._schedulerName + '\'s ';
            }
            
            message += ' dequeued old job of priority ' + jobPriority;
            
            console.log(message);
        }
        
        --self._pendingJobsCount;
        
        ensurePendingJobsCount(self);
        schedule(self, job, resource);
        ensurePendingJobsCount(self);
    }
    
    function schedule(self, job, resource) {
        ++self._schedulesCounter;
        
        if (self._schedulesCounter >= self._numJobsBeforeRerankOldPriorities) {
            self._schedulesCounter = 0;
            rerankPriorities(self);
        }
        
        if (self._showLog) {
            var message = '';
            if (self._schedulerName !== undefined) {
                message = self._schedulerName + '\'s ';
            }
            
            var priority = self._prioritizer.getPriority(job.jobContext);
            message += ' scheduled job of priority ' + priority;
            
            console.log(message);
        }
        
        job.jobFunc(resource, job.jobContext);
    }
    
    function initializeNewPendingJobsLinkedList(self) {
        self._newPendingJobsLinkedList = new LinkedList();
    }
    
    function addJobToLinkedList(self, job, addBefore) {
        self._newPendingJobsLinkedList.add(job, addBefore);
        ensureNumberOfNodes(self);
    }
    
    function extractJobFromLinkedList(self, iterator) {
        var value = self._newPendingJobsLinkedList.getValue(iterator);
        self._newPendingJobsLinkedList.remove(iterator);
        ensureNumberOfNodes(self);
        
        return value;
    }
    
    function ensureNumberOfNodes(self) {
        if (!self._showLog) {
            return;
        }
        
        var iterator = self._newPendingJobsLinkedList.getIterator();
        var expectedCount = 0;
        while (iterator !== null) {
            ++expectedCount;
            iterator = self._newPendingJobsLinkedList.getNextIterator(iterator);
        }
        
        if (expectedCount !== self._newPendingJobsLinkedList.getCount()) {
            throw 'Unexpected count of new jobs';
        }
    }
    
    function ensurePendingJobsCount(self) {
        if (!self._showLog) {
            return;
        }
        
        var oldJobsCount = 0;
        for (var i = 0; i < self._oldPendingJobsByPriority.length; ++i) {
            var jobs = self._oldPendingJobsByPriority[i];
            if (jobs !== undefined) {
                oldJobsCount += jobs.length;
            }
        }
        
        var expectedCount =
            oldJobsCount + self._newPendingJobsLinkedList.getCount();
            
        if (expectedCount !== self._pendingJobsCount) {
            throw 'Unexpected count of jobs';
        }
    }
    
    function getMinimalPriorityToSchedule(self) {
        if (self._freeResourcesCount <= self._resourcesGuaranteedForHighPriority) {
            return self._highPriorityToGuaranteeResources;
        }
        
        return 0;
    }
    
    return PriorityScheduler;
})();