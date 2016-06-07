'use strict';

var JpxDecodeJob = (function JpxDecodeJob() {
    var requestIdCounter = 0;
    
    function JpxDecodeJob(
        codestreamPartParams,
        codestreamClientManager,
        jpxScheduler,
        onlyWaitForDataAndDecode) {
        
        this._isAborted = false;
        this._isTerminated = false;
        this._isJpipRequestTerminated = false;
        this._isFirstStage = true;
        this._isManuallyAborted = false;

        this._firstPacketsData = null;
        this._firstHeadersCodestream = null;
        this._activeSubJobs = 1;
        this._codestreamPartParams = codestreamPartParams;
        this._jpxScheduler = jpxScheduler;
        this._jpxJobSequenceId = 0;
        this._lastFinishedJpxJobSequenceId = -1;
        this._progressiveStagesDone = 0;
        this._listenersLinkedList = new LinkedList();
        this._progressiveListenersCount = 0;
        this._requestId = ++requestIdCounter;
        this._allRelevantBytesLoaded = 0;
        this._codestreamClientManager = codestreamClientManager;
        
        codestreamClientManager.createRequest(
            codestreamPartParams,
            this,
            this._dataReadyForJpx,
            this._jpipTerminated,
            onlyWaitForDataAndDecode,
            this._requestId);
    }
    
    JpxDecodeJob.prototype = {
        registerListener: function registerListener(listenerHandle) {
            var iterator = this._listenersLinkedList.add(listenerHandle);
            
            if (listenerHandle.isProgressive) {
                ++this._progressiveListenersCount;
                
                if (this._progressiveListenersCount === 1) {
                    this._codestreamClientManager.setIsProgressiveRequest(
                        this._requestId, true);
                }
            }
            
            var unregisterHandle = iterator;
            return unregisterHandle;
        },
        
        unregisterListener: function unregisterListener(unregisterHandle) {
            var iterator = unregisterHandle;
            var listenerHandle = this._listenersLinkedList.getValue(iterator);

            this._listenersLinkedList.remove(unregisterHandle);
            
            if (listenerHandle.isProgressive) {
                --this._progressiveListenersCount;
            }
            
            if (this._listenersLinkedList.getCount() === 0) {
                this._codestreamClientManager.manualAbortNonMovableRequest(
                    this._requestId);
                
                this._isAborted = true;
                this._isTerminated = true;
                this._isJpipRequestTerminated = true;
                this._isManuallyAborted = true;
            } else if (this._progressiveListenersCount === 0) {
                this._codestreamClientManager.setIsProgressiveRequest(
                    this._requestId, false);
            }
        },
        
        getIsTerminated: function getIsTerminated() {
            return this._isTerminated;
        },
    
        _dataReadyForJpx: function dataReadyForJpx(packetsData, headersCodestream) {
            if (this._isAbortedNoTermination() ||
                this._listenersLinkedList.getCount() === 0) {
                
                // NOTE: Should find better way to clean job if listeners list
                // is empty
                
                return;
            }
            
            if (this._isFirstStage) {
                this._firstPacketsData = packetsData;
                this._firstHeadersCodestream = headersCodestream;
            } else {
                this._pendingPacketsData = packetsData;
                this._pendingHeadersCodestream = headersCodestream;
            
                if (this._isAlreadyScheduledNonFirstJpxJob) {
                    return;
                }
                
                this._isAlreadyScheduledNonFirstJpxJob = true;
            }
            
            if (this._isTerminated) {
                throw 'Job has already been terminated';
            }
            
            this._isFirstStage = false;
            ++this._activeSubJobs;
            
            var jobContext = {
                self: this,
                codestreamPartParams: this._codestreamPartParams,
                progressiveStagesDone: this._progressiveStagesDone
            };
            
            this._jpxScheduler.enqueueJob(startJpx, jobContext, jpxAborted);
        },
    
        _startJpx: function startJpx(jpxImageResource, jobContext) {
            var packetsData, headersCodestream;
            if (this._firstPacketsData !== null) {
                packetsData = this._firstPacketsData;
                headersCodestream = this._firstHeadersCodestream;
                
                this._firstPacketsData = null;
                this._firstHeadersCodestream = null;
            } else {
                packetsData = this._pendingPacketsData;
                headersCodestream = this._pendingHeadersCodestream;

                this._pendingPacketsData = null;
                this._pendingHeadersCodestream = null;
                
                this._isAlreadyScheduledNonFirstJpxJob = false;
            }
            
            jobContext.allRelevantBytesLoaded = packetsData.allRelevantBytesLoaded;
            
            if (this._isAbortedNoTermination()) {
                --this._activeSubJobs;
                this._jpxScheduler.jobDone(jpxImageResource, jobContext);
                checkIfAllTerminated(this);
                
                return;
            }
            
            var jpxJobSequenceId = ++this._jpxJobSequenceId;
            
            var params = this._codestreamPartParams;
            var width = params.maxXExclusive - params.minX;
            var height = params.maxYExclusive - params.minY;

            var regionToParse = {
                left: headersCodestream.offsetX,
                top: headersCodestream.offsetY,
                right: headersCodestream.offsetX + width,
                bottom: headersCodestream.offsetY + height
            };
            
            jpxImageResource.parseCodestreamAsync(
                jpxHeaderParseEndedCallback,
                headersCodestream.codestream,
                0,
                headersCodestream.codestream.length,
                { isOnlyParseHeaders: true });
            
            jpxImageResource.addPacketsDataToCurrentContext(packetsData);
            
            jpxImageResource.decodeCurrentContextAsync(
                pixelsDecodedCallbackInClosure, { regionToParse: regionToParse });
                
            var self = this;
            
            function pixelsDecodedCallbackInClosure(decodeResult) {
                self._pixelsDecodedCallback(
                    jpxImageResource,
                    decodeResult,
                    jpxJobSequenceId,
                    jobContext);
                
                self = null;
            }
        },
        
        _pixelsDecodedCallback: function pixelsDecodedCallback(
            jpxImageResource, decodeResult, jpxJobSequenceId, jobContext) {
            
            this._jpxScheduler.jobDone(jpxImageResource, jobContext);
            --this._activeSubJobs;
            
            var relevantBytesLoadedDiff =
                jobContext.allRelevantBytesLoaded - this._allRelevantBytesLoaded;
            this._allRelevantBytesLoaded = jobContext.allRelevantBytesLoaded;
            
            if (this._isAbortedNoTermination()) {
                checkIfAllTerminated(this);
                return;
            }
            
            var lastFinished = this._lastFinishedJpxJobSequenceId;
            if (lastFinished > jpxJobSequenceId) {
                // Do not refresh pixels with lower quality layer than
                // what was already returned
                
                checkIfAllTerminated(this);
                return;
            }
            
            this._lastFinishedJpxJobSequenceId = jpxJobSequenceId;
            
            var tileParams = this._codestreamPartParams;
            
            var iterator = this._listenersLinkedList.getFirstIterator();
            while (iterator !== null) {
                var listenerHandle = this._listenersLinkedList.getValue(iterator);
                var originalParams = listenerHandle.codestreamPartParams;
                
                var offsetX = tileParams.minX - originalParams.minX;
                var offsetY = tileParams.minY - originalParams.minY;
                var width = originalParams.maxXExclusive - originalParams.minX;
                var height = originalParams.maxYExclusive - originalParams.minY;
                
                listenerHandle.allRelevantBytesLoaded += relevantBytesLoadedDiff;
                
                var decodedOffsetted = {
                    originalRequestWidth: width,
                    originalRequestHeight: height,
                    xInOriginalRequest: offsetX,
                    yInOriginalRequest: offsetY,
                    
                    width: decodeResult.width,
                    height: decodeResult.height,
                    pixels: decodeResult.pixels,
                    
                    allRelevantBytesLoaded: listenerHandle.allRelevantBytesLoaded
                };
                
                listenerHandle.callback(decodedOffsetted);
                
                iterator = this._listenersLinkedList.getNextIterator(iterator);
            }

            checkIfAllTerminated(this);
        },
        
        _jpipTerminated: function jpipTerminated(isAborted) {
            if (this._isManuallyAborted) {
                // This situation might occur if request has been terminated,
                // but user's terminatedCallback has not been called yet. It
                // happens on WorkerProxyCodestreamClientManager due to thread
                // message delay.
                
                return;
            }
        
            if (this._isJpipRequestTerminated) {
                throw 'Double termination of JPIP request';
            }
            
            this._isJpipRequestTerminated = true;
            --this._activeSubJobs;
            this._isAborted |= isAborted;
            
            checkIfAllTerminated(this);
        },
        
        _jpxAborted: function jpxAborted() {
            this._isAborted = true;
            
            if (this._firstPacketsData !== null) {
                this._firstPacketsData = null;
                this._firstHeadersCodestream = null;
            } else {
                this._pendingPacketsData = null;
                this._pendingHeadersCodestream = null;
                this._isAlreadyScheduledNonFirstJpxJob = false;
            }
            
            --this._activeSubJobs;
            
            checkIfAllTerminated(this);
        },
        
        _isAbortedNoTermination: function _isAbortedNoTermination() {
            if (this._isManuallyAborted) {
                return;
            }
            
            if (this._isTerminated) {
                throw 'Unexpected job state of terminated: Still runnin sub-jobs';
            }
            
            return this._isAborted;
        }
    }; // Prototype
    
    function startJpx(jpxImageResource, jobContext) {
        jobContext.self._startJpx(jpxImageResource, jobContext);
    }
    
    function jpxAborted(jobContext) {
        jobContext.self._jpxAborted();
    }
    
    function jpxHeaderParseEndedCallback() {
        // Do nothing
    }
    
    function checkIfAllTerminated(self) {
        if (self._activeSubJobs < 0) {
            throw 'Inconsistent number of jpx jobs';
        }
        
        if (self._activeSubJobs > 0) {
            return;
        }
        
        if (self._isAlreadyScheduledNonFirstJpxJob) {
            throw 'Inconsistent isAlreadyScheduledNonFirstJpxJob flag';
        }
        
        self._isTerminated = true;
        var linkedList = self._listenersLinkedList;
        self._listenersLinkedList = null;

        var iterator = linkedList.getFirstIterator();
        
        while (iterator !== null) {
            var listenerHandle = linkedList.getValue(iterator);
            listenerHandle.isAnyDecoderAborted |= self._isAborted;
            
            var remaining = --listenerHandle.remainingDecodeJobs;
            if (remaining < 0) {
                throw 'Inconsistent number of done requests';
            }
            
            var isListenerDone = remaining === 0;
            if (isListenerDone) {
                listenerHandle.isTerminatedCallbackCalled = true;
                listenerHandle.terminatedCallback(
                    listenerHandle.isAnyDecoderAborted);
            }
            
            iterator = linkedList.getNextIterator(iterator);
        }
    }
    
    return JpxDecodeJob;
})();