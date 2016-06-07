var LifoScheduler=function LifoSchedulerClosure(){function LifoScheduler(createResource,jobsLimit){this._resourceCreator=createResource;this._jobsLimit=jobsLimit;this._freeResourcesCount=this._jobsLimit;this._freeResources=new Array(this._jobsLimit);this._pendingJobs=[]}LifoScheduler.prototype={enqueueJob:function enqueueJob(jobFunc,jobContext){if(this._freeResourcesCount>0){--this._freeResourcesCount;var resource=this._freeResources.pop();if(resource===undefined)resource=this._resourceCreator();
jobFunc(resource,jobContext)}else this._pendingJobs.push({jobFunc:jobFunc,jobContext:jobContext})},jobDone:function jobDone(resource){if(this._pendingJobs.length>0){var nextJob=this._pendingJobs.pop();nextJob.jobFunc(resource,nextJob.jobContext)}else{this._freeResources.push(resource);++this._freeResourcesCount}},shouldYieldOrAbort:function shouldYieldOrAbort(jobContext){return false},tryYield:function yieldResource(jobFunc,jobContext,resource){return false}};return LifoScheduler}();var LinkedList=function LinkedListClosure(){function LinkedList(){this._first={_prev:null,_parent:this};this._last={_next:null,_parent:this};this._count=0;this._last._prev=this._first;this._first._next=this._last}LinkedList.prototype.add=function add(value,addBefore){if(addBefore===null||addBefore===undefined)addBefore=this._last;this._validateIteratorOfThis(addBefore);++this._count;var newNode={_value:value,_next:addBefore,_prev:addBefore._prev,_parent:this};newNode._prev._next=newNode;addBefore._prev=
newNode;return newNode};LinkedList.prototype.remove=function remove(iterator){this._validateIteratorOfThis(iterator);--this._count;iterator._prev._next=iterator._next;iterator._next._prev=iterator._prev;iterator._parent=null};LinkedList.prototype.getValue=function getValue(iterator){this._validateIteratorOfThis(iterator);return iterator._value};LinkedList.prototype.getFirstIterator=function getFirstIterator(){var iterator=this.getNextIterator(this._first);return iterator};LinkedList.prototype.getLastIterator=
function getFirstIterator(){var iterator=this.getPrevIterator(this._last);return iterator};LinkedList.prototype.getNextIterator=function getNextIterator(iterator){this._validateIteratorOfThis(iterator);if(iterator._next===this._last)return null;return iterator._next};LinkedList.prototype.getPrevIterator=function getPrevIterator(iterator){this._validateIteratorOfThis(iterator);if(iterator._prev===this._first)return null;return iterator._prev};LinkedList.prototype.getCount=function getCount(){return this._count};
LinkedList.prototype._validateIteratorOfThis=function validateIteratorOfThis(iterator){if(iterator._parent!==this)throw"iterator must be of the current LinkedList";};return LinkedList}();var PriorityScheduler=function PrioritySchedulerClosure(){function PriorityScheduler(createResource,jobsLimit,prioritizer,options){options=options||{};this._resourceCreator=createResource;this._jobsLimit=jobsLimit;this._prioritizer=prioritizer;this._showLog=options["showLog"];this._schedulerName=options["schedulerName"];this._numNewJobs=options["numNewJobs"]||20;this._numJobsBeforeRerankOldPriorities=options["numJobsBeforeRerankOldPriorities"]||20;this._freeResourcesCount=this._jobsLimit;this._freeResources=
new Array(this._jobsLimit);this._resourcesGuaranteedForHighPriority=options["resourcesGuaranteedForHighPriority"]||0;this._highPriorityToGuaranteeResource=options["highPriorityToGuaranteeResource"]||0;this._pendingJobsCount=0;this._oldPendingJobsByPriority=[];initializeNewPendingJobsLinkedList(this);this._schedulesCounter=0}PriorityScheduler.prototype={enqueueJob:function enqueueJob(jobFunc,jobContext,jobAbortedFunc){var priority=this._prioritizer["getPriority"](jobContext);if(priority<0){jobAbortedFunc(jobContext);
return}var job={jobFunc:jobFunc,jobAbortedFunc:jobAbortedFunc,jobContext:jobContext};var minPriority=getMinimalPriorityToSchedule(self);var resource=null;if(priority>=minPriority)resource=tryGetFreeResource(this);if(resource!==null){schedule(this,job,resource);return}enqueueNewJob(this,job,priority);ensurePendingJobsCount(self)},jobDone:function jobDone(resource,jobContext){if(this._showLog){var message="";if(this._schedulerName!==undefined)message=this._schedulerName+"'s ";var priority=this._prioritizer["getPriority"](jobContext);
message+=" job done of priority "+priority;console.log(message)}resourceFreed(this,resource);ensurePendingJobsCount(self)},tryYield:function tryYield(jobContinueFunc,jobContext,jobAbortedFunc,jobYieldedFunc,resource){var priority=this._prioritizer["getPriority"](jobContext);if(priority<0){jobAbortedFunc(jobContext);resourceFreed(this,resource);return true}var higherPriorityJob=tryDequeueNewJobWithHigherPriority(this,priority);ensurePendingJobsCount(self);if(higherPriorityJob===null)return false;jobYieldedFunc(jobContext);
var job={jobFunc:jobContinueFunc,jobAbortedFunc:jobAbortedFunc,jobContext:jobContext};enqueueNewJob(this,job,priority);ensurePendingJobsCount(self);schedule(this,higherPriorityJob,resource);ensurePendingJobsCount(self);return true}};function tryDequeueNewJobWithHigherPriority(self,lowPriority){var jobToScheduleNode=null;var highestPriorityFound=lowPriority;var countedPriorities=[];var currentNode=self._newPendingJobsLinkedList.getFirstIterator();while(currentNode!==null){var nextNode=self._newPendingJobsLinkedList.getNextIterator(currentNode);
var job=self._newPendingJobsLinkedList.getValue(currentNode);var priority=self._prioritizer["getPriority"](job.jobContext);if(priority<0){extractJobFromLinkedList(self,currentNode);--self._pendingJobsCount;job.jobAbortedFunc(job.jobContext);currentNode=nextNode;continue}if(highestPriorityFound===undefined||priority>highestPriorityFound){highestPriorityFound=priority;jobToScheduleNode=currentNode}if(!self._showLog){currentNode=nextNode;continue}if(countedPriorities[priority]===undefined)countedPriorities[priority]=
1;else++countedPriorities[priority];currentNode=nextNode}var jobToSchedule=null;if(jobToScheduleNode!==null){jobToSchedule=extractJobFromLinkedList(self,jobToScheduleNode);--self._pendingJobsCount}if(self._showLog){var jobsListMessage="";var jobDequeuedMessage="";if(self._schedulerName!==undefined){jobsListMessage=self._schedulerName+"'s ";jobDequeuedMessage=self._schedulerName+"'s "}jobsListMessage+="Jobs list:";for(var i=0;i<countedPriorities.length;++i)if(countedPriorities[i]!==undefined)jobsListMessage+=
countedPriorities[i]+" jobs of priority "+i+";";console.log(jobsListMessage);if(jobToSchedule!==null){jobDequeuedMessage+=" dequeued new job of priority "+highestPriorityFound;console.log(jobDequeuedMessage)}}ensurePendingJobsCount(self);return jobToSchedule}function tryGetFreeResource(self){if(self._freeResourcesCount===0)return null;--self._freeResourcesCount;var resource=self._freeResources.pop();if(resource===undefined)resource=self._resourceCreator();ensurePendingJobsCount(self);return resource}
function enqueueNewJob(self,job,priority){++self._pendingJobsCount;var firstIterator=self._newPendingJobsLinkedList.getFirstIterator();addJobToLinkedList(self,job,firstIterator);if(self._showLog){var message="";if(self._schedulerName!==undefined)message=self._schedulerName+"'s ";message+=" enqueued job of priority "+priority;console.log(message)}if(self._newPendingJobsLinkedList.getCount()<=self._numNewJobs){ensurePendingJobsCount(self);return}var lastIterator=self._newPendingJobsLinkedList.getLastIterator();
var oldJob=extractJobFromLinkedList(self,lastIterator);enqueueOldJob(self,oldJob);ensurePendingJobsCount(self)}function enqueueOldJob(self,job){var priority=self._prioritizer["getPriority"](job.jobContext);if(priority<0){--self._pendingJobsCount;job.jobAbortedFunc(job.jobContext);return}if(self._oldPendingJobsByPriority[priority]===undefined)self._oldPendingJobsByPriority[priority]=[];self._oldPendingJobsByPriority[priority].push(job)}function rerankPriorities(self){var originalOldsArray=self._oldPendingJobsByPriority;
var originalNewsList=self._newPendingJobsLinkedList;if(originalOldsArray.length===0)return;self._oldPendingJobsByPriority=[];initializeNewPendingJobsLinkedList(self);for(var i=0;i<originalOldsArray.length;++i){if(originalOldsArray[i]===undefined)continue;for(var j=0;j<originalOldsArray[i].length;++j)enqueueOldJob(self,originalOldsArray[i][j])}var iterator=originalNewsList.getFirstIterator();while(iterator!==null){var value=originalNewsList.getValue(iterator);enqueueOldJob(self,value);iterator=originalNewsList.getNextIterator(iterator)}var message=
"";if(self._schedulerName!==undefined)message=self._schedulerName+"'s ";message+="rerank: ";for(var i=self._oldPendingJobsByPriority.length-1;i>=0;--i){var highPriorityJobs=self._oldPendingJobsByPriority[i];if(highPriorityJobs===undefined)continue;if(self._showLog)message+=highPriorityJobs.length+" jobs in priority "+i+";";while(highPriorityJobs.length>0&&self._newPendingJobsLinkedList.getCount()<self._numNewJobs){var job=highPriorityJobs.pop();addJobToLinkedList(self,job)}if(self._newPendingJobsLinkedList.getCount()>=
self._numNewJobs&&!self._showLog)break}if(self._showLog)console.log(message);ensurePendingJobsCount(self)}function resourceFreed(self,resource){++self._freeResourcesCount;var minPriority=getMinimalPriorityToSchedule(self);--self._freeResourcesCount;var job=tryDequeueNewJobWithHigherPriority(self,minPriority);if(job!==null){ensurePendingJobsCount(self);schedule(self,job,resource);ensurePendingJobsCount(self);return}var hasOldJobs=self._pendingJobsCount>self._newPendingJobsLinkedList.getCount();if(hasOldJobs){self._freeResources.push(resource);
++self._freeResourcesCount;ensurePendingJobsCount(self);return}var numPriorities=self._oldPendingJobsByPriority.length;var jobPriority;for(var priority=numPriorities-1;priority>=0;--priority){var jobs=self._oldPendingJobsByPriority[priority];if(jobs===undefined||jobs.length===0)continue;for(var i=jobs.length-1;i>=0;--i){job=jobs[i];jobPriority=self._prioritizer["getPriority"](job.jobContext);if(jobPriority>=priority){jobs.length=i;break}else if(jobPriority<0){--self._pendingJobsCount;job.jobAbortedFunc(job.jobContext)}else{if(self._oldPendingJobsByPriority[jobPriority]===
undefined)self._oldPendingJobsByPriority[jobPriority]=[];self._oldPendingJobsByPriority[jobPriority].push(job)}job=null}if(job!==null)break;jobs.length=0}if(job===null){self._freeResources.push(resource);++self._freeResourcesCount;ensurePendingJobsCount(self);return}if(self._showLog){var message="";if(self._schedulerName!==undefined)message=self._schedulerName+"'s ";message+=" dequeued old job of priority "+jobPriority;console.log(message)}--self._pendingJobsCount;ensurePendingJobsCount(self);schedule(self,
job,resource);ensurePendingJobsCount(self)}function schedule(self,job,resource){++self._schedulesCounter;if(self._schedulesCounter>=self._numJobsBeforeRerankOldPriorities){self._schedulesCounter=0;rerankPriorities(self)}if(self._showLog){var message="";if(self._schedulerName!==undefined)message=self._schedulerName+"'s ";var priority=self._prioritizer["getPriority"](job.jobContext);message+=" scheduled job of priority "+priority;console.log(message)}job.jobFunc(resource,job.jobContext)}function initializeNewPendingJobsLinkedList(self){self._newPendingJobsLinkedList=
new LinkedList}function addJobToLinkedList(self,job,addBefore){self._newPendingJobsLinkedList.add(job,addBefore);ensureNumberOfNodes(self)}function extractJobFromLinkedList(self,iterator){var value=self._newPendingJobsLinkedList.getValue(iterator);self._newPendingJobsLinkedList.remove(iterator);ensureNumberOfNodes(self);return value}function ensureNumberOfNodes(self){if(!self._showLog)return;var iterator=self._newPendingJobsLinkedList.getIterator();var expectedCount=0;while(iterator!==null){++expectedCount;
iterator=self._newPendingJobsLinkedList.getNextIterator(iterator)}if(expectedCount!==self._newPendingJobsLinkedList.getCount())throw"Unexpected count of new jobs";}function ensurePendingJobsCount(self){if(!self._showLog)return;var oldJobsCount=0;for(var i=0;i<self._oldPendingJobsByPriority.length;++i){var jobs=self._oldPendingJobsByPriority[i];if(jobs!==undefined)oldJobsCount+=jobs.length}var expectedCount=oldJobsCount+self._newPendingJobsLinkedList.getCount();if(expectedCount!==self._pendingJobsCount)throw"Unexpected count of jobs";
}function getMinimalPriorityToSchedule(self){if(self._freeResourcesCount<=self._resourcesGuaranteedForHighPriority)return self._highPriorityToGuaranteeResources;return 0}return PriorityScheduler}();self["ResourceScheduler"]={};self["ResourceScheduler"]["PriorityScheduler"]=PriorityScheduler;self["ResourceScheduler"]["LifoScheduler"]=LifoScheduler;PriorityScheduler.prototype["enqueueJob"]=PriorityScheduler.prototype.enqueueJob;PriorityScheduler.prototype["tryYield"]=PriorityScheduler.prototype.tryYield;PriorityScheduler.prototype["jobDone"]=PriorityScheduler.prototype.jobDone;LifoScheduler.prototype["enqueueJob"]=LifoScheduler.prototype.enqueueJob;LifoScheduler.prototype["tryYield"]=LifoScheduler.prototype.tryYield;
LifoScheduler.prototype["jobDone"]=LifoScheduler.prototype.jobDone;

var BlobScriptGenerator=BlobScriptGeneratorClosure();self["asyncProxyScriptBlob"]=new BlobScriptGenerator;
function BlobScriptGeneratorClosure(){function BlobScriptGenerator(){var that=this;that._blobChunks=["'use strict';"];that._blob=null;that._blobUrl=null;that._namespaces={};that.addMember(BlobScriptGeneratorClosure,"BlobScriptGenerator");that.addStatement("var asyncProxyScriptBlob = new BlobScriptGenerator();")}BlobScriptGenerator.prototype.addMember=function addMember(closureFunction,memberName,namespace){if(this._blob)throw new Error("Cannot add member to AsyncProxyScriptBlob after blob was used");
if(memberName){if(namespace){this._namespaces[namespace]=true;this._blobChunks.push(namespace);this._blobChunks.push(".")}else this._blobChunks.push("var ");this._blobChunks.push(memberName);this._blobChunks.push(" = ")}this._blobChunks.push("(");this._blobChunks.push(closureFunction.toString());this._blobChunks.push(")();")};BlobScriptGenerator.prototype.addStatement=function addStatement(statement){if(this._blob)throw new Error("Cannot add statement to AsyncProxyScriptBlob after blob was used");
this._blobChunks.push(statement)};BlobScriptGenerator.prototype.getBlob=function getBlob(){if(!this._blob)this._blob=new Blob(this._blobChunks,{type:"application/javascript"});return this._blob};BlobScriptGenerator.prototype.getBlobUrl=function getBlobUrl(){if(!this._blobUrl)this._blobUrl=URL.createObjectURL(this.getBlob());return this._blobUrl};return BlobScriptGenerator};function SubWorkerEmulationForChromeClosure(){var subWorkerId=0;var subWorkerIdToSubWorker=null;function SubWorkerEmulationForChrome(scriptUrl){if(subWorkerIdToSubWorker===null)throw"AsyncProxy internal error: SubWorkerEmulationForChrome "+"not initialized";var that=this;that._subWorkerId=++subWorkerId;subWorkerIdToSubWorker[that._subWorkerId]=that;self.postMessage({type:"subWorkerCtor",subWorkerId:that._subWorkerId,scriptUrl:scriptUrl})}SubWorkerEmulationForChrome.initialize=function initialize(subWorkerIdToSubWorker_){subWorkerIdToSubWorker=
subWorkerIdToSubWorker_};SubWorkerEmulationForChrome.prototype.postMessage=function postMessage(data,transferables){self.postMessage({type:"subWorkerPostMessage",subWorkerId:this._subWorkerId,data:data},transferables)};SubWorkerEmulationForChrome.prototype.terminate=function terminate(data,transferables){self.postMessage({type:"subWorkerTerminate",subWorkerId:this._subWorkerId},transferables)};self["asyncProxyScriptBlob"].addMember(SubWorkerEmulationForChromeClosure,"SubWorkerEmulationForChrome");
return SubWorkerEmulationForChrome}var SubWorkerEmulationForChrome=SubWorkerEmulationForChromeClosure();function AsyncProxyMasterClosure(){var asyncProxyScriptBlob=self["asyncProxyScriptBlob"];var callId=0;var isGetMasterEntryUrlCalled=false;var masterEntryUrl=getBaseUrlFromEntryScript();function AsyncProxyMaster(scriptsToImport,ctorName,ctorArgs,options){var that=this;options=options||{};var slaveScriptContentString=mainSlaveScriptContent.toString();slaveScriptContentString=slaveScriptContentString.replace("SCRIPT_PLACEHOLDER",asyncProxyScriptBlob.getBlobUrl());var slaveScriptContentBlob=new Blob(["(",
slaveScriptContentString,")()"],{type:"application/javascript"});var slaveScriptUrl=URL.createObjectURL(slaveScriptContentBlob);that._callbacks=[];that._pendingPromiseCalls=[];that._subWorkerById=[];that._subWorkers=[];that._worker=new Worker(slaveScriptUrl);that._worker.onmessage=onWorkerMessageInternal;that._userDataHandler=null;that._notReturnedFunctions=0;that._functionsBufferSize=options["functionsBufferSize"]||5;that._pendingMessages=[];that._worker.postMessage({functionToCall:"ctor",scriptsToImport:scriptsToImport,
ctorName:ctorName,args:ctorArgs,callId:++callId,isPromise:false,masterEntryUrl:AsyncProxyMaster.getEntryUrl()});function onWorkerMessageInternal(workerEvent){onWorkerMessage(that,workerEvent)}}AsyncProxyMaster.prototype.setUserDataHandler=function setUserDataHandler(userDataHandler){this._userDataHandler=userDataHandler};AsyncProxyMaster.prototype.terminate=function terminate(){this._worker.terminate();for(var i=0;i<this._subWorkers.length;++i)this._subWorkers[i].terminate()};AsyncProxyMaster.prototype.callFunction=
function callFunction(functionToCall,args,options){options=options||{};var isReturnPromise=!!options["isReturnPromise"];var transferables=options["transferables"];var pathsToTransferables=options["pathsToTransferablesInPromiseResult"];var localCallId=++callId;var promiseOnMasterSide=null;var that=this;if(isReturnPromise)promiseOnMasterSide=new Promise(function promiseFunc(resolve,reject){that._pendingPromiseCalls[localCallId]={resolve:resolve,reject:reject}});var sendMessageFunction=options["isSendImmediately"]?
sendMessageToSlave:enqueueMessageToSlave;sendMessageFunction(this,transferables,true,{functionToCall:functionToCall,args:args||[],callId:localCallId,isPromise:isReturnPromise,pathsToTransferablesInPromiseResult:pathsToTransferables});if(isReturnPromise)return promiseOnMasterSide};AsyncProxyMaster.prototype.wrapCallback=function wrapCallback(callback,callbackName,options){options=options||{};var localCallId=++callId;var callbackHandle={isWorkerHelperCallback:true,isMultipleTimeCallback:!!options["isMultipleTimeCallback"],
callId:localCallId,callbackName:callbackName,pathsToTransferables:options["pathsToTransferables"]};var internalCallbackHandle={isMultipleTimeCallback:!!options["isMultipleTimeCallback"],callId:localCallId,callback:callback,pathsToTransferables:options["pathsToTransferables"]};this._callbacks[localCallId]=internalCallbackHandle;return callbackHandle};AsyncProxyMaster.prototype.freeCallback=function freeCallback(callbackHandle){delete this._callbacks[callbackHandle.callId]};AsyncProxyMaster.getEntryUrl=
function getEntryUrl(){isGetMasterEntryUrlCalled=true;return masterEntryUrl};AsyncProxyMaster._setEntryUrl=function setEntryUrl(newUrl){if(masterEntryUrl!==newUrl&&isGetMasterEntryUrlCalled)throw"Previous values returned from getMasterEntryUrl "+"is wrong. Avoid calling it within the slave c`tor";masterEntryUrl=newUrl};function mainSlaveScriptContent(){importScripts("SCRIPT_PLACEHOLDER");AsyncProxy["AsyncProxySlave"]=self["AsyncProxy"]["AsyncProxySlaveSingleton"];AsyncProxy["AsyncProxySlave"]._initializeSlave()}
function onWorkerMessage(that,workerEvent){var callId=workerEvent.data.callId;switch(workerEvent.data.type){case "functionCalled":--that._notReturnedFunctions;trySendPendingMessages(that);break;case "promiseResult":var promiseData=that._pendingPromiseCalls[callId];delete that._pendingPromiseCalls[callId];var result=workerEvent.data.result;promiseData.resolve(result);break;case "promiseFailure":var promiseData=that._pendingPromiseCalls[callId];delete that._pendingPromiseCalls[callId];var reason=workerEvent.data.reason;
promiseData.reject(reason);break;case "userData":if(that._userDataHandler!==null)that._userDataHandler(workerEvent.data.userData);break;case "callback":var callbackHandle=that._callbacks[workerEvent.data.callId];if(callbackHandle===undefined)throw"Unexpected message from SlaveWorker of callback ID: "+workerEvent.data.callId+". Maybe should indicate "+"isMultipleTimesCallback = true on creation?";if(!callbackHandle.isMultipleTimeCallback)that.freeCallback(that._callbacks[workerEvent.data.callId]);
if(callbackHandle.callback!==null)callbackHandle.callback.apply(null,workerEvent.data.args);break;case "subWorkerCtor":var subWorker=new Worker(workerEvent.data.scriptUrl);var id=workerEvent.data.subWorkerId;that._subWorkerById[id]=subWorker;that._subWorkers.push(subWorker);subWorker.onmessage=function onSubWorkerMessage(subWorkerEvent){enqueueMessageToSlave(that,subWorkerEvent.ports,false,{functionToCall:"subWorkerOnMessage",subWorkerId:id,data:subWorkerEvent.data})};break;case "subWorkerPostMessage":var subWorker=
that._subWorkerById[workerEvent.data.subWorkerId];subWorker.postMessage(workerEvent.data.data);break;case "subWorkerTerminate":var subWorker=that._subWorkerById[workerEvent.data.subWorkerId];subWorker.terminate();break;default:throw"Unknown message from AsyncProxySlave of type: "+workerEvent.data.type;}}function enqueueMessageToSlave(that,transferables,isFunctionCall,message){if(that._notReturnedFunctions>=that._functionsBufferSize){that._pendingMessages.push({transferables:transferables,isFunctionCall:isFunctionCall,
message:message});return}sendMessageToSlave(that,transferables,isFunctionCall,message)}function sendMessageToSlave(that,transferables,isFunctionCall,message){if(isFunctionCall)++that._notReturnedFunctions;that._worker.postMessage(message,transferables)}function trySendPendingMessages(that){while(that._notReturnedFunctions<that._functionsBufferSize&&that._pendingMessages.length>0){var message=that._pendingMessages.shift();sendMessageToSlave(that,message.transferables,message.isFunctionCall,message.message)}}
function getBaseUrlFromEntryScript(){var baseUrl=location.href;var endOfPath=baseUrl.lastIndexOf("/");if(endOfPath>=0)baseUrl=baseUrl.substring(0,endOfPath);return baseUrl}asyncProxyScriptBlob.addMember(AsyncProxyMasterClosure,"AsyncProxyMaster");return AsyncProxyMaster}var AsyncProxyMaster=AsyncProxyMasterClosure();function AsyncProxySlaveClosure(){var slaveHelperSingleton={};var beforeOperationListener=null;var slaveSideMainInstance;var slaveSideInstanceCreator=defaultInstanceCreator;var subWorkerIdToSubWorker={};var ctorName;slaveHelperSingleton._initializeSlave=function initializeSlave(){self.onmessage=onMessage};slaveHelperSingleton.setSlaveSideCreator=function setSlaveSideCreator(creator){slaveSideInstanceCreator=creator};slaveHelperSingleton.setBeforeOperationListener=function setBeforeOperationListener(listener){beforeOperationListener=
listener};slaveHelperSingleton.sendUserDataToMaster=function sendUserDataToMaster(userData){self.postMessage({type:"userData",userData:userData})};slaveHelperSingleton.wrapPromiseFromSlaveSide=function wrapPromiseFromSlaveSide(callId,promise,pathsToTransferables){var promiseThen=promise.then(function sendPromiseToMaster(result){var transferables=extractTransferables(pathsToTransferables,result);self.postMessage({type:"promiseResult",callId:callId,result:result},transferables)});promiseThen["catch"](function sendFailureToMaster(reason){self.postMessage({type:"promiseFailure",
callId:callId,reason:reason})})};slaveHelperSingleton.wrapCallbackFromSlaveSide=function wrapCallbackFromSlaveSide(callbackHandle){var isAlreadyCalled=false;function callbackWrapperFromSlaveSide(){if(isAlreadyCalled)throw"Callback is called twice but isMultipleTimeCallback "+"= false";var argumentsAsArray=getArgumentsAsArray(arguments);if(beforeOperationListener!==null)try{beforeOperationListener.call(slaveSideMainInstance,"callback",callbackHandle.callbackName,argumentsAsArray)}catch(e){console.log("AsyncProxySlave.beforeOperationListener has thrown an exception: "+
e)}var transferables=extractTransferables(callbackHandle.pathsToTransferables,argumentsAsArray);self.postMessage({type:"callback",callId:callbackHandle.callId,args:argumentsAsArray},transferables);if(!callbackHandle.isMultipleTimeCallback)isAlreadyCalled=true}return callbackWrapperFromSlaveSide};slaveHelperSingleton._getScriptName=function _getScriptName(){var error=new Error;var scriptName=ScriptsToImportPool._getScriptName(error);return scriptName};function extractTransferables(pathsToTransferables,
pathsBase){if(pathsToTransferables===undefined)return undefined;var transferables=new Array(pathsToTransferables.length);for(var i=0;i<pathsToTransferables.length;++i){var path=pathsToTransferables[i];var transferable=pathsBase;for(var j=0;j<path.length;++j){var member=path[j];transferable=transferable[member]}transferables[i]=transferable}return transferables}function onMessage(event){var functionNameToCall=event.data.functionToCall;var args=event.data.args;var callId=event.data.callId;var isPromise=
event.data.isPromise;var pathsToTransferablesInPromiseResult=event.data.pathsToTransferablesInPromiseResult;var result=null;switch(functionNameToCall){case "ctor":self["AsyncProxy"]["AsyncProxyMaster"]._setEntryUrl(event.data.masterEntryUrl);var scriptsToImport=event.data.scriptsToImport;ctorName=event.data.ctorName;for(var i=0;i<scriptsToImport.length;++i)importScripts(scriptsToImport[i]);slaveSideMainInstance=slaveSideInstanceCreator.apply(null,args);return;case "subWorkerOnMessage":var subWorker=
subWorkerIdToSubWorker[event.data.subWorkerId];var workerEvent={data:event.data.data};subWorker.onmessage(workerEvent);return}args=new Array(event.data.args.length);for(var i=0;i<event.data.args.length;++i){var arg=event.data.args[i];if(arg!==undefined&&arg!==null&&arg.isWorkerHelperCallback)arg=slaveHelperSingleton.wrapCallbackFromSlaveSide(arg);args[i]=arg}var functionContainer=slaveSideMainInstance;var functionToCall;while(functionContainer){functionToCall=slaveSideMainInstance[functionNameToCall];
if(functionToCall)break;functionContainer=functionContainer.__proto__}if(!functionToCall)throw"AsyncProxy error: could not find function "+functionToCall;var promise=functionToCall.apply(slaveSideMainInstance,args);if(isPromise)slaveHelperSingleton.wrapPromiseFromSlaveSide(callId,promise,pathsToTransferablesInPromiseResult);self.postMessage({type:"functionCalled",callId:event.data.callId,result:result})}function defaultInstanceCreator(){var namespacesAndCtorName=ctorName.split(".");var member=self;
for(var i=0;i<namespacesAndCtorName.length;++i)member=member[namespacesAndCtorName[i]];var TypeCtor=member;var bindArgs=[null].concat(getArgumentsAsArray(arguments));var instance=new (Function.prototype.bind.apply(TypeCtor,bindArgs));return instance}function getArgumentsAsArray(args){var argumentsAsArray=new Array(args.length);for(var i=0;i<args.length;++i)argumentsAsArray[i]=args[i];return argumentsAsArray}if(self["Worker"]===undefined){var SubWorkerEmulationForChrome=self["SubWorkerEmulationForChrome"];
SubWorkerEmulationForChrome.initialize(subWorkerIdToSubWorker);self["Worker"]=SubWorkerEmulationForChrome}self["asyncProxyScriptBlob"].addMember(AsyncProxySlaveClosure,"AsyncProxySlaveSingleton");return slaveHelperSingleton}var AsyncProxySlaveSingleton=AsyncProxySlaveClosure();function ScriptsToImportPoolClosure(){function ScriptsToImportPool(){var that=this;that._scriptsByName={};that._scriptsArray=null}ScriptsToImportPool.prototype.addScriptFromErrorWithStackTrace=function addScriptForWorkerImport(errorWithStackTrace){var fileName=ScriptsToImportPool._getScriptName(errorWithStackTrace);if(!this._scriptsByName[fileName]){this._scriptsByName[fileName]=true;this._scriptsArray=null}};ScriptsToImportPool.prototype.getScriptsForWorkerImport=function getScriptsForWorkerImport(){if(this._scriptsArray===
null){this._scriptsArray=[];for(var fileName in this._scriptsByName)this._scriptsArray.push(fileName)}return this._scriptsArray};ScriptsToImportPool._getScriptName=function getScriptName(errorWithStackTrace){var stack=errorWithStackTrace.stack.trim();var currentStackFrameRegex=/at (|[^ ]+ \()([^ ]+):\d+:\d+/;var source=currentStackFrameRegex.exec(stack);if(source&&source[2]!=="")return source[2];var lastStackFrameRegex=new RegExp(/.+\/(.*?):\d+(:\d+)*$/);source=lastStackFrameRegex.exec(stack);if(source&&
source[1]!=="")return source[1];if(errorWithStackTrace.fileName!=undefined)return errorWithStackTrace.fileName;throw"ImageDecoderFramework.js: Could not get current script URL";};self["asyncProxyScriptBlob"].addMember(ScriptsToImportPoolClosure,"ScriptsToImportPool");return ScriptsToImportPool}var ScriptsToImportPool=ScriptsToImportPoolClosure();function ExportAsyncProxySymbolsClosure(){function ExportAsyncProxySymbols(SubWorkerEmulationForChrome,AsyncProxySlaveSingleton,AsyncProxyMaster,ScriptsToImportPool){self["AsyncProxy"]=self["AsyncProxy"]||{};SubWorkerEmulationForChrome.prototype["postMessage"]=SubWorkerEmulationForChrome.prototype.postMessage;SubWorkerEmulationForChrome.prototype["terminate"]=SubWorkerEmulationForChrome.prototype.terminate;AsyncProxySlaveSingleton["setSlaveSideCreator"]=AsyncProxySlaveSingleton.setSlaveSideCreator;
AsyncProxySlaveSingleton["setBeforeOperationListener"]=AsyncProxySlaveSingleton.setBeforeOperationListener;AsyncProxySlaveSingleton["sendUserDataToMaster"]=AsyncProxySlaveSingleton.sendUserDataToMaster;AsyncProxySlaveSingleton["wrapPromiseFromSlaveSide"]=AsyncProxySlaveSingleton.wrapPromiseFromSlaveSide;AsyncProxySlaveSingleton["wrapCallbackFromSlaveSide"]=AsyncProxySlaveSingleton.wrapCallbackFromSlaveSide;AsyncProxyMaster.prototype["setUserDataHandler"]=AsyncProxyMaster.prototype.setUserDataHandler;
AsyncProxyMaster.prototype["terminate"]=AsyncProxyMaster.prototype.terminate;AsyncProxyMaster.prototype["callFunction"]=AsyncProxyMaster.prototype.callFunction;AsyncProxyMaster.prototype["wrapCallback"]=AsyncProxyMaster.prototype.wrapCallback;AsyncProxyMaster.prototype["freeCallback"]=AsyncProxyMaster.prototype.freeCallback;AsyncProxyMaster["getEntryUrl"]=AsyncProxyMaster.getEntryUrl;ScriptsToImportPool.prototype["addScriptFromErrorWithStackTrace"]=ScriptsToImportPool.prototype.addScriptFromErrorWithStackTrace;
ScriptsToImportPool.prototype["getScriptsForWorkerImport"]=ScriptsToImportPool.prototype.getScriptsForWorkerImport}asyncProxyScriptBlob.addMember(ExportAsyncProxySymbolsClosure,"ExportAsyncProxySymbols");asyncProxyScriptBlob.addStatement("ExportAsyncProxySymbols(SubWorkerEmulationForChrome, AsyncProxySlaveSingleton, AsyncProxyMaster, ScriptsToImportPool);");asyncProxyScriptBlob.addStatement("self['AsyncProxy']['AsyncProxySlaveSingleton'] = AsyncProxySlaveSingleton;");asyncProxyScriptBlob.addStatement("self['AsyncProxy']['AsyncProxyMaster'] = AsyncProxyMaster;");
asyncProxyScriptBlob.addStatement("self['AsyncProxy']['ScriptsToImportPool'] = ScriptsToImportPool;");return ExportAsyncProxySymbols}ExportAsyncProxySymbolsClosure()(SubWorkerEmulationForChrome,AsyncProxySlaveSingleton,AsyncProxyMaster,ScriptsToImportPool);self["AsyncProxy"]["AsyncProxySlaveSingleton"]=AsyncProxySlaveSingleton;self["AsyncProxy"]["AsyncProxyMaster"]=AsyncProxyMaster;self["AsyncProxy"]["ScriptsToImportPool"]=ScriptsToImportPool;

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.imageDecoderFramework = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

module.exports = calculateFrustum;

/* global Cesium: false */

var imageHelperFunctions = require('imagehelperfunctions.js');

var MAX_RECURSIVE_LEVEL_ON_FAILED_TRANSFORM = 4;

function calculateFrustum(cesiumWidget) {
    var screenSize = {
        x: cesiumWidget.scene.canvas.width,
        y: cesiumWidget.scene.canvas.height
    };
    
    var points = [];
    searchBoundingPoints(
        0, 0, screenSize.x, screenSize.y, points, cesiumWidget, /*recursive=*/0);

    var frustumRectangle = Cesium.Rectangle.fromCartographicArray(points);
    if (frustumRectangle.east < frustumRectangle.west || frustumRectangle.north < frustumRectangle.south) {
        frustumRectangle = {
            east: Math.max(frustumRectangle.east, frustumRectangle.west),
            west: Math.min(frustumRectangle.east, frustumRectangle.west),
            north: Math.max(frustumRectangle.north, frustumRectangle.south),
            south: Math.min(frustumRectangle.north, frustumRectangle.south)
        };
    }

    var frustumData = imageHelperFunctions.calculateFrustum2DFromBounds(
        frustumRectangle, screenSize);
                
    return frustumData;
}
    
function searchBoundingPoints(
    minX, minY, maxX, maxY, points, cesiumWidget, recursiveLevel) {
    
    var transformedPoints = 0;
    transformedPoints += transformAndAddPoint(
        minX, minY, cesiumWidget, points);
    transformedPoints += transformAndAddPoint(
        maxX, minY, cesiumWidget, points);
    transformedPoints += transformAndAddPoint(
        minX, maxY, cesiumWidget, points);
    transformedPoints += transformAndAddPoint(
        maxX, maxY, cesiumWidget, points);

    var maxLevel = MAX_RECURSIVE_LEVEL_ON_FAILED_TRANSFORM;
    
    if (transformedPoints === 4 || recursiveLevel >= maxLevel) {
        return;
    }
    
    ++recursiveLevel;
    
    var middleX = (minX + maxX) / 2;
    var middleY = (minY + maxY) / 2;
    
    searchBoundingPoints(
        minX, minY, middleX, middleY, points, cesiumWidget, recursiveLevel);

    searchBoundingPoints(
        minX, middleY, middleX, maxY, points, cesiumWidget, recursiveLevel);

    searchBoundingPoints(
        middleX, minY, maxX, middleY, points, cesiumWidget, recursiveLevel);

    searchBoundingPoints(
        middleX, middleY, maxX, maxY, points, cesiumWidget, recursiveLevel);
}

function transformAndAddPoint(x, y, cesiumWidget, points) {
    
    var screenPoint = new Cesium.Cartesian2(x, y);
    var ellipsoid = cesiumWidget.scene.mapProjection.ellipsoid;
    var point3D = cesiumWidget.scene.camera.pickEllipsoid(screenPoint, ellipsoid);
    
    if (point3D === undefined) {
        return 0;
    }

    var cartesian = ellipsoid.cartesianToCartographic(point3D);
    if (cartesian === undefined) {
        return 0;
    }
    
    points.push(cartesian);
    return 1;
}
},{"imagehelperfunctions.js":12}],2:[function(require,module,exports){
'use strict';

module.exports = CesiumImageDecoderLayerManager;

var CanvasImageryProvider = require('canvasimageryprovider.js');
var ViewerImageDecoder = require('viewerimagedecoder.js');
var calculateCesiumFrustum = require('_cesiumfrustumcalculator.js');

/* global Cesium: false */

function CesiumImageDecoderLayerManager(imageImplementationClassName, options) {
    this._options = options || {};
    
    if (this._options.rectangle !== undefined) {
        this._options = JSON.parse(JSON.stringify(options));
        this._options.cartographicBounds = {
            west: options.rectangle.west,
            east: options.rectangle.east,
            south: options.rectangle.south,
            north: options.rectangle.north
        };
    }
    
    this._options.minFunctionCallIntervalMilliseconds =
        options.minFunctionCallIntervalMilliseconds || 100;
    this._url = options.url;

    this._targetCanvas = document.createElement('canvas');
    this._imageryProviders = [
        new CanvasImageryProvider(this._targetCanvas),
        new CanvasImageryProvider(this._targetCanvas)
    ];
    this._imageryLayerShown = new Cesium.ImageryLayer(this._imageryProviders[0]);
    this._imageryLayerPending = new Cesium.ImageryLayer(this._imageryProviders[1]);

    this._canvasUpdatedCallbackBound = this._canvasUpdatedCallback.bind(this);
    
    this._isPendingUpdateCallback = false;
    this._isWhileReplaceLayerShown = false;
    this._pendingPositionRectangle = null;
    
    this._image = new ViewerImageDecoder(
        imageImplementationClassName,
        this._canvasUpdatedCallbackBound,
        this._options);
    
    this._image.setTargetCanvas(this._targetCanvas);
    
    this._updateFrustumBound = this._updateFrustum.bind(this);
    this._postRenderBound = this._postRender.bind(this);
}

CesiumImageDecoderLayerManager.prototype.setExceptionCallback = function setExceptionCallback(exceptionCallback) {
    this._image.setExceptionCallback(exceptionCallback);
};

CesiumImageDecoderLayerManager.prototype.open = function open(widgetOrViewer) {
    this._widget = widgetOrViewer;
    this._layers = widgetOrViewer.scene.imageryLayers;
    widgetOrViewer.scene.postRender.addEventListener(this._postRenderBound);
    
    this._image.open(this._url);
    this._layers.add(this._imageryLayerShown);
    
    // NOTE: Is there an event handler to register instead?
    // (Cesium's event controllers only expose keyboard and mouse
    // events, but there is no event for frustum changed
    // programmatically).
    this._intervalHandle = setInterval(
        this._updateFrustumBound,
        500);
};

CesiumImageDecoderLayerManager.prototype.close = function close() {
    this._image.close();
    clearInterval(this._intervalHandle);

    this._layers.remove(this._imageryLayerShown);
    this._widget.removeEventListener(this._postRenderBound);
    if (this._isWhileReplaceLayerShown) {
        this._isWhileReplaceLayerShown = false;
        this._isPendingUpdateCallback = false;
        this._layers.remove(this._imageryLayerPending);
    }
};

CesiumImageDecoderLayerManager.prototype.getImageryLayers = function getImageryLayers() {
    return [this._imageryLayerShown, this._imageryLayerPending];
};

CesiumImageDecoderLayerManager.prototype._updateFrustum = function updateFrustum() {
    var frustum = calculateCesiumFrustum(this._widget);
    if (frustum !== null) {
        this._image.updateViewArea(frustum);
    }
};

CesiumImageDecoderLayerManager.prototype._canvasUpdatedCallback = function canvasUpdatedCallback(newPosition) {
    if (this._isWhileReplaceLayerShown) {
        this._isPendingUpdateCallback = true;
        this._pendingPositionRectangle = newPosition;
    }
    
    if (newPosition !== null) {
        var rectangle = new Cesium.Rectangle(
            newPosition.west,
            newPosition.south,
            newPosition.east,
            newPosition.north);
        
        this._imageryProviders[0].setRectangle(rectangle);
        this._imageryProviders[1].setRectangle(rectangle);
    }
    
    this._removeAndReAddLayer();
};

CesiumImageDecoderLayerManager.prototype._removeAndReAddLayer = function removeAndReAddLayer() {
    var index = this._layers.indexOf(this._imageryLayerShown);
    
    if (index < 0) {
        throw 'Layer was removed from viewer\'s layers  without ' +
            'closing layer manager. Use CesiumImageDecoderLayerManager.' +
            'close() instead';
    }
    
    this._isWhileReplaceLayerShown = true;
    this._layers.add(this._imageryLayerPending, index);
};

CesiumImageDecoderLayerManager.prototype._postRender = function postRender() {
    if (!this._isWhileReplaceLayerShown)
        return;
    
    this._isWhileReplaceLayerShown = false;
    this._layers.remove(this._imageryLayerShown, /*destroy=*/false);
    
    var swap = this._imageryLayerShown;
    this._imageryLayerShown = this._imageryLayerPending;
    this._imageryLayerPending = swap;
    
    if (this._isPendingUpdateCallback) {
        this._isPendingUpdateCallback = false;
        this._canvasUpdatedCallback(this._pendingPositionRectangle);
    }
};
},{"_cesiumfrustumcalculator.js":1,"canvasimageryprovider.js":3,"viewerimagedecoder.js":20}],3:[function(require,module,exports){
'use strict';

module.exports = CanvasImageryProvider;

/* global Cesium: false */
/* global DeveloperError: false */
/* global Credit: false */

/**
 * Provides a Single Canvas imagery tile.  The image is assumed to use a
 * {@link GeographicTilingScheme}.
 *
 * @alias CanvasImageryProvider
 * @constructor
 *
 * @param {canvas} Canvas for the tile.
 * @param {Object} options Object with the following properties:
 * @param {Credit|String} [options.credit] A credit for the data source, which is displayed on the canvas.
 *
 * @see ArcGisMapServerImageryProvider
 * @see BingMapsImageryProvider
 * @see GoogleEarthImageryProvider
 * @see OpenStreetMapImageryProvider
 * @see TileMapServiceImageryProvider
 * @see WebMapServiceImageryProvider
 */
function CanvasImageryProvider(canvas, options) {
    if (options === undefined) {
        options = {};
    }

    //>>includeStart('debug', pragmas.debug);
    if (canvas === undefined) {
        throw new DeveloperError('canvas is required.');
    }
    //>>includeEnd('debug');

    this._canvas = canvas;

    this._errorEvent = new Event('CanvasImageryProviderStatus');

    this._ready = false;

    var credit = options.credit;
    if (typeof credit === 'string') {
        credit = new Credit(credit);
    }
    this._credit = credit;
}

CanvasImageryProvider.prototype = {
    /**
     * Gets the width of each tile, in pixels. This function should
     * not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get tileWidth() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('tileWidth must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return this._canvas.width;
    },

    /**
     * Gets the height of each tile, in pixels.  This function should
     * not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get tileHeight() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('tileHeight must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return this._canvas.height;
    },

    /**
     * Gets the maximum level-of-detail that can be requested.  This function should
     * not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get maximumLevel() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('maximumLevel must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return 0;
    },

    /**
     * Gets the minimum level-of-detail that can be requested.  This function should
     * not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get minimumLevel() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('minimumLevel must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return 0;
    },

    /**
     * Gets the tiling scheme used by this provider.  This function should
     * not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {TilingScheme}
     * @readonly
     */
    get tilingScheme() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('tilingScheme must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return this._tilingScheme;
    },

    /**
     * Gets the rectangle, in radians, of the imagery provided by this instance.  This function should
     * not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {Rectangle}
     * @readonly
     */
    get rectangle() {
            return this._tilingScheme.rectangle;
    },

    /**
     * Gets the tile discard policy.  If not undefined, the discard policy is responsible
     * for filtering out "missing" tiles via its shouldDiscardImage function.  If this function
     * returns undefined, no tiles are filtered.  This function should
     * not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {TileDiscardPolicy}
     * @readonly
     */
    get tileDiscardPolicy() {
            //>>includeStart('debug', pragmas.debug);
            if (!this._ready) {
                    throw new DeveloperError('tileDiscardPolicy must not be called before the imagery provider is ready.');
            }
            //>>includeEnd('debug');

            return undefined;
    },

    /**
     * Gets an event that is raised when the imagery provider encounters an asynchronous error.  By subscribing
     * to the event, you will be notified of the error and can potentially recover from it.  Event listeners
     * are passed an instance of {@link TileProviderError}.
     * @memberof CanvasImageryProvider.prototype
     * @type {Event}
     * @readonly
     */
    get errorEvent() {
            return this._errorEvent;
    },

    /**
     * Gets a value indicating whether or not the provider is ready for use.
     * @memberof CanvasImageryProvider.prototype
     * @type {Boolean}
     * @readonly
     */
    get ready() {
            return this._ready;
    },

    /**
     * Gets the credit to display when this imagery provider is active.  Typically this is used to credit
     * the source of the imagery.  This function should not be called before {@link CanvasImageryProvider#ready} returns true.
     * @memberof CanvasImageryProvider.prototype
     * @type {Credit}
     * @readonly
     */
    get credit() {
            return this._credit;
    },

    /**
     * Gets a value indicating whether or not the images provided by this imagery provider
     * include an alpha channel.  If this property is false, an alpha channel, if present, will
     * be ignored.  If this property is true, any images without an alpha channel will be treated
     * as if their alpha is 1.0 everywhere.  When this property is false, memory usage
     * and texture upload time are reduced.
     * @memberof CanvasImageryProvider.prototype
     * @type {Boolean}
     * @readonly
     */
    get hasAlphaChannel() {
            return true;
    }
};

CanvasImageryProvider.prototype.setRectangle = function setRectangle(rectangle) {
    
    this._tilingScheme = new Cesium.GeographicTilingScheme({
        rectangle: rectangle,
        numberOfLevelZeroTilesX: 1,
        numberOfLevelZeroTilesY: 1
    });
    
    if (!this._ready) {
        this._ready = true;
        Cesium.TileProviderError.handleSuccess(this._errorEvent);
    }
};

CanvasImageryProvider.prototype.getTileWidth = function getTileWidth() {
    return this.tileWidth;
};

CanvasImageryProvider.prototype.getTileHeight = function getTileHeight() {
    return this.tileHeight;
};

CanvasImageryProvider.prototype.getMaximumLevel = function getMaximumLevel() {
    return this.maximumLevel;
};

CanvasImageryProvider.prototype.getMinimumLevel = function getMinimumLevel() {
    return this.minimumLevel;
};

CanvasImageryProvider.prototype.isReady = function isReady() {
    return this.ready;
};

CanvasImageryProvider.prototype.getCredit = function getCredit() {
    return this.credit;
};

CanvasImageryProvider.prototype.getRectangle = function getRectangle() {
    return this.tilingScheme.rectangle;
};

CanvasImageryProvider.prototype.getTilingScheme = function getTilingScheme() {
    return this.tilingScheme;
};

CanvasImageryProvider.prototype.getTileDiscardPolicy = function getTileDiscardPolicy() {
    return this.tileDiscardPolicy;
};

CanvasImageryProvider.prototype.getErrorEvent = function getErrorEvent() {
    return this.errorEvent;
};

CanvasImageryProvider.prototype.getHasAlphaChannel = function getHasAlphaChannel() {
    return this.hasAlphaChannel;
};

/**
 * Gets the credits to be displayed when a given tile is displayed.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level;
 * @returns {Credit[]} The credits to be displayed when the tile is displayed.
 *
 * @exception {DeveloperError} <code>getTileCredits</code> must not be called before the imagery provider is ready.
 */
CanvasImageryProvider.prototype.getTileCredits = function(x, y, level) {
    return undefined;
};

/**
 * Requests the image for a given tile.  This function should
 * not be called before {@link CanvasImageryProvider#ready} returns true.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level.
 * @returns {Promise} A promise for the image that will resolve when the image is available, or
 *          undefined if there are too many active requests to the server, and the request
 *          should be retried later.  The resolved image may be either an
 *          Image or a Canvas DOM object.
 *
 * @exception {DeveloperError} <code>requestImage</code> must not be called before the imagery provider is ready.
 */
CanvasImageryProvider.prototype.requestImage = function(x, y, level) {
    //>>includeStart('debug', pragmas.debug);
    if (!this._ready) {
            throw new DeveloperError('requestImage must not be called before the imagery provider is ready.');
    }
    //>>includeEnd('debug');

    return this._canvas;
};

/**
 * Picking features is not currently supported by this imagery provider, so this function simply returns
 * undefined.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level.
 * @param {Number} longitude The longitude at which to pick features.
 * @param {Number} latitude  The latitude at which to pick features.
 * @return {Promise} A promise for the picked features that will resolve when the asynchronous
 *                   picking completes.  The resolved value is an array of {@link ImageryLayerFeatureInfo}
 *                   instances.  The array may be empty if no features are found at the given location.
 *                   It may also be undefined if picking is not supported.
 */
CanvasImageryProvider.prototype.pickFeatures = function() {
        return undefined;
};
},{}],4:[function(require,module,exports){
'use strict';

module.exports = ImageDecoderImageryProvider;

var WorkerProxyImageDecoder = require('workerproxyimagedecoder.js');
var calculateCesiumFrustum = require('_cesiumfrustumcalculator.js');
var imageHelperFunctions = require('imagehelperfunctions.js');

/* global Cesium: false */
/* global DeveloperError: false */
/* global Credit: false */
/* global Promise: false */

/**
 * Provides a ImageDecoder client imagery tile.  The image is assumed to use a
 * {@link GeographicTilingScheme}.
 *
 * @alias ImageDecoderImageryProvider
 * @constructor
 *
 * @param {Object} options Object with the following properties:
 * @param {String} options.url The url for the tile.
 * @param {Rectangle} [options.rectangle=Rectangle.MAX_VALUE] The rectangle, in radians, covered by the image.
 * @param {Credit|String} [options.credit] A credit for the data source, which is displayed on the canvas.
 * @param {Object} [options.proxy] A proxy to use for requests. This object is expected to have a getURL function which returns the proxied URL, if needed.
 * @param {boolean} [options.adaptProportions] determines if to adapt the proportions of the rectangle provided to the image pixels proportions.
 *
 * @see ArcGisMapServerImageryProvider
 * @see BingMapsImageryProvider
 * @see GoogleEarthImageryProvider
 * @see OpenStreetMapImageryProvider
 * @see TileMapServiceImageryProvider
 * @see WebMapServiceImageryProvider
 */
function ImageDecoderImageryProvider(imageImplementationClassName, options) {
    var url = options.url;
    this._adaptProportions = options.adaptProportions;
    this._rectangle = options.rectangle;
    this._proxy = options.proxy;
    this._updateFrustumInterval = 1000 || options.updateFrustumInterval;
    this._credit = options.credit;
    
    if (typeof this._credit === 'string') {
        this._credit = new Credit(this._credit);
    }
    
    if (this._rectangle === undefined) {
        this._rectangle = Cesium.Rectangle.fromDegrees(-180, -90, 180, 90);
    }
    
    if (this._adaptProportions === undefined) {
        this._adaptProportions = true;
    }

    options = JSON.parse(JSON.stringify(options || {}));
    options.cartographicBounds = {
        west: this._rectangle.west,
        east: this._rectangle.east,
        south: this._rectangle.south,
        north: this._rectangle.north
    };
    
    //>>includeStart('debug', pragmas.debug);
    if (url === undefined) {
            throw new DeveloperError('url is required.');
    }
    //>>includeEnd('debug');

    this._url = url;

    this._tilingScheme = undefined;

    this._tileWidth = 0;
    this._tileHeight = 0;

    this._errorEvent = new Event('ImageDecoderImageryProviderStatus');

    this._ready = false;
    this._exceptionCallback = null;
    this._cesiumWidget = null;
    this._updateFrustumIntervalHandle = null;
    

    var imageUrl = url;
    if (this._proxy !== undefined) {
        // NOTE: Is that the correct logic?
        imageUrl = this._proxy.getURL(imageUrl);
    }
        
    this._image = new WorkerProxyImageDecoder(imageImplementationClassName, {
        serverRequestPrioritizer: 'frustum',
        decodePrioritizer: 'frustum'
    });

    this._url = imageUrl;
}

ImageDecoderImageryProvider.prototype = {
    /**
     * Gets the URL of the ImageDecoder server (including target).
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {String}
     * @readonly
     */
    get url() {
        return this._url;
    },

    /**
     * Gets the proxy used by this provider.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Proxy}
     * @readonly
     */
    get proxy() {
        return this._proxy;
    },

    /**
     * Gets the width of each tile, in pixels. This function should
     * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get tileWidth() {
        //>>includeStart('debug', pragmas.debug);
        if (!this._ready) {
                throw new DeveloperError('tileWidth must not be called before the imagery provider is ready.');
        }
        //>>includeEnd('debug');

        return this._tileWidth;
    },

    /**
     * Gets the height of each tile, in pixels.  This function should
     * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get tileHeight() {
        //>>includeStart('debug', pragmas.debug);
        if (!this._ready) {
                throw new DeveloperError('tileHeight must not be called before the imagery provider is ready.');
        }
        //>>includeEnd('debug');

        return this._tileHeight;
    },

    /**
     * Gets the maximum level-of-detail that can be requested.  This function should
     * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get maximumLevel() {
        //>>includeStart('debug', pragmas.debug);
        if (!this._ready) {
                throw new DeveloperError('maximumLevel must not be called before the imagery provider is ready.');
        }
        //>>includeEnd('debug');

        return this._numResolutionLevels - 1;
    },

    /**
     * Gets the minimum level-of-detail that can be requested.  This function should
     * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    get minimumLevel() {
        //>>includeStart('debug', pragmas.debug);
        if (!this._ready) {
                throw new DeveloperError('minimumLevel must not be called before the imagery provider is ready.');
        }
        //>>includeEnd('debug');

        return 0;
    },

    /**
     * Gets the tiling scheme used by this provider.  This function should
     * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {TilingScheme}
     * @readonly
     */
    get tilingScheme() {
        //>>includeStart('debug', pragmas.debug);
        if (!this._ready) {
            throw new DeveloperError('tilingScheme must not be called before the imagery provider is ready.');
        }
        //>>includeEnd('debug');

        return this._tilingScheme;
    },

    /**
     * Gets the rectangle, in radians, of the imagery provided by this instance.  This function should
     * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Rectangle}
     * @readonly
     */
    get rectangle() {
        return this._tilingScheme.rectangle;
    },

    /**
     * Gets the tile discard policy.  If not undefined, the discard policy is responsible
     * for filtering out "missing" tiles via its shouldDiscardImage function.  If this function
     * returns undefined, no tiles are filtered.  This function should
     * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {TileDiscardPolicy}
     * @readonly
     */
    get tileDiscardPolicy() {
        //>>includeStart('debug', pragmas.debug);
        if (!this._ready) {
            throw new DeveloperError('tileDiscardPolicy must not be called before the imagery provider is ready.');
        }
        //>>includeEnd('debug');

        return undefined;
    },

    /**
     * Gets an event that is raised when the imagery provider encounters an asynchronous error.  By subscribing
     * to the event, you will be notified of the error and can potentially recover from it.  Event listeners
     * are passed an instance of {@link TileProviderError}.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Event}
     * @readonly
     */
    get errorEvent() {
        return this._errorEvent;
    },

    /**
     * Gets a value indicating whether or not the provider is ready for use.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Boolean}
     * @readonly
     */
    get ready() {
        return this._ready;
    },

    /**
     * Gets the credit to display when this imagery provider is active.  Typically this is used to credit
     * the source of the imagery.  This function should not be called before {@link ImageDecoderImageryProvider#ready} returns true.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Credit}
     * @readonly
     */
    get credit() {
        return this._credit;
    },

    /**
     * Gets a value indicating whether or not the images provided by this imagery provider
     * include an alpha channel.  If this property is false, an alpha channel, if present, will
     * be ignored.  If this property is true, any images without an alpha channel will be treated
     * as if their alpha is 1.0 everywhere.  When this property is false, memory usage
     * and texture upload time are reduced.
     * @memberof ImageDecoderImageryProvider.prototype
     * @type {Boolean}
     * @readonly
     */
    get hasAlphaChannel() {
        return true;
    }
};

ImageDecoderImageryProvider.prototype.setExceptionCallback =
    function setExceptionCallback(exceptionCallback) {
    
    this._exceptionCallback = exceptionCallback;
};

ImageDecoderImageryProvider.prototype.open = function open(widgetOrViewer) {
    if (this._updateFrustumIntervalHandle !== null) {
        throw new DeveloperError('Cannot set two parent viewers.');
    }
    
    if (widgetOrViewer === undefined) {
        throw new DeveloperError('widgetOrViewer should be given. It is ' +
            'needed for frustum calculation for the priority mechanism');
    }
    
    this._image.open(this._url)
		.then(this._opened.bind(this))
		.catch(this._onException.bind(this));
    
    this._cesiumWidget = widgetOrViewer;
    
    this._updateFrustumIntervalHandle = setInterval(
        this._setPriorityByFrustum.bind(this),
        this._updateFrustumInterval);
};

ImageDecoderImageryProvider.prototype.close = function close() {
    clearInterval(this._updateFrustumIntervalHandle);
    this._image.close();
};

ImageDecoderImageryProvider.prototype.getTileWidth = function getTileWidth() {
    return this.tileWidth;
};

ImageDecoderImageryProvider.prototype.getTileHeight = function getTileHeight() {
    return this.tileHeight;
};

ImageDecoderImageryProvider.prototype.getMaximumLevel = function getMaximumLevel() {
    return this.maximumLevel;
};

ImageDecoderImageryProvider.prototype.getMinimumLevel = function getMinimumLevel() {
    return this.minimumLevel;
};

ImageDecoderImageryProvider.prototype.getUrl = function getUrl() {
    return this.url;
};

ImageDecoderImageryProvider.prototype.getProxy = function getProxy() {
    return this.proxy;
};

ImageDecoderImageryProvider.prototype.isReady = function isReady() {
    return this.ready;
};

ImageDecoderImageryProvider.prototype.getCredit = function getCredit() {
    return this.credit;
};

ImageDecoderImageryProvider.prototype.getRectangle = function getRectangle() {
    return this.tilingScheme.rectangle;
};

ImageDecoderImageryProvider.prototype.getTilingScheme = function getTilingScheme() {
    return this.tilingScheme;
};

ImageDecoderImageryProvider.prototype.getTileDiscardPolicy = function getTileDiscardPolicy() {
    return this.tileDiscardPolicy;
};

ImageDecoderImageryProvider.prototype.getErrorEvent = function getErrorEvent() {
    return this.errorEvent;
};

ImageDecoderImageryProvider.prototype.getHasAlphaChannel = function getHasAlphaChannel() {
    return this.hasAlphaChannel;
};

/**
 * Gets the credits to be displayed when a given tile is displayed.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level;
 * @returns {Credit[]} The credits to be displayed when the tile is displayed.
 *
 * @exception {DeveloperError} <code>getTileCredits</code> must not be called before the imagery provider is ready.
 */
ImageDecoderImageryProvider.prototype.getTileCredits = function(x, y, level) {
    return undefined;
};

/**
 * Requests the image for a given tile.  This function should
 * not be called before {@link ImageDecoderImageryProvider#ready} returns true.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level.
 * @returns {Promise} A promise for the image that will resolve when the image is available, or
 *          undefined if there are too many active requests to the server, and the request
 *          should be retried later.  The resolved image may be either an
 *          Image or a Canvas DOM object.
 *
 * @exception {DeveloperError} <code>requestImage</code> must not be called before the imagery provider is ready.
 */
ImageDecoderImageryProvider.prototype.requestImage = function(x, y, cesiumLevel) {
    //>>includeStart('debug', pragmas.debug);
    if (!this._ready) {
        throw new DeveloperError('requestImage must not be called before the imagery provider is ready.');
    }
    //>>includeEnd('debug');
    
    var self = this;
    
    var levelFactor = Math.pow(2, this._numResolutionLevels - cesiumLevel - 1);
    var minX = x * this._tileWidth  * levelFactor;
    var minY = y * this._tileHeight * levelFactor;
    var maxXExclusive = (x + 1) * this._tileWidth  * levelFactor;
    var maxYExclusive = (y + 1) * this._tileHeight * levelFactor;
    
    var alignedParams = imageHelperFunctions.alignParamsToTilesAndLevel({
        minX: minX,
        minY: minY,
        maxXExclusive: maxXExclusive,
        maxYExclusive: maxYExclusive,
        screenWidth: this._tileWidth,
        screenHeight: this._tileHeight
    }, this._image);
    
    var level = alignedParams.imagePartParams.level;
    var levelWidth = this._image.getLevelWidth(level);
    var levelHeight = this._image.getLevelHeight(level);
    
    var scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = this._tileWidth;
    scaledCanvas.height = this._tileHeight;
    
    var scaledContext = scaledCanvas.getContext('2d');
    scaledContext.clearRect(0, 0, this._tileWidth, this._tileHeight);
    
    var tempPixelWidth  = alignedParams.imagePartParams.maxXExclusive - alignedParams.imagePartParams.minX;
    var tempPixelHeight = alignedParams.imagePartParams.maxYExclusive - alignedParams.imagePartParams.minY;
    if (tempPixelWidth <= 0 || tempPixelHeight <= 0) {
        return scaledCanvas;
    }
    
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempPixelWidth;
    tempCanvas.height = tempPixelHeight;
    var tempContext = tempCanvas.getContext('2d');
    tempContext.clearRect(0, 0, tempPixelWidth, tempPixelHeight);
    
    alignedParams.imagePartParams.quality = this._quality;
    alignedParams.imagePartParams.requestPriorityData = {
        imageRectangle: this._rectangle
    };
    
    var resolve, reject;
    var requestPixelsPromise = new Promise(function(resolve_, reject_) {
        resolve = resolve_;
        reject = reject_;
        
        self._image.requestPixelsProgressive(
            alignedParams.imagePartParams,
            pixelsDecodedCallback,
            terminatedCallback);
    });
    
    function pixelsDecodedCallback(decoded) {
        var partialTileWidth = decoded.imageData.width;
        var partialTileHeight = decoded.imageData.height;

        if (partialTileWidth > 0 && partialTileHeight > 0) {
            tempContext.putImageData(
                decoded.imageData,
                decoded.xInOriginalRequest,
                decoded.yInOriginalRequest);
        }
    }

    function terminatedCallback(isAborted) {
        if (isAborted) {
            reject('Fetch request or decode aborted');
        } else {
            scaledContext.drawImage(
                tempCanvas,
                0, 0, tempPixelWidth, tempPixelHeight,
                alignedParams.croppedScreen.minX, alignedParams.croppedScreen.minY,
                alignedParams.croppedScreen.maxXExclusive, alignedParams.croppedScreen.maxYExclusive);
                
            resolve(scaledCanvas);
        }
    }

    return requestPixelsPromise;
};

ImageDecoderImageryProvider.prototype._setPriorityByFrustum =
    function setPriorityByFrustum() {
    
    if (!this._ready) {
        return;
    }
    
    var frustumData = calculateCesiumFrustum(
        this._cesiumWidget, this);
    
    if (frustumData === null) {
        return;
    }
    
    frustumData.imageRectangle = this.getRectangle();
    frustumData.exactlevel = null;

    this._image.setServerRequestPrioritizerData(frustumData);
    this._image.setDecodePrioritizerData(frustumData);
};

/**
 * Picking features is not currently supported by this imagery provider, so this function simply returns
 * undefined.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level.
 * @param {Number} longitude The longitude at which to pick features.
 * @param {Number} latitude  The latitude at which to pick features.
 * @return {Promise} A promise for the picked features that will resolve when the asynchronous
 *                   picking completes.  The resolved value is an array of {@link ImageryLayerFeatureInfo}
 *                   instances.  The array may be empty if no features are found at the given location.
 *                   It may also be undefined if picking is not supported.
 */
ImageDecoderImageryProvider.prototype.pickFeatures = function() {
        return undefined;
};

ImageDecoderImageryProvider.prototype._onException = function onException(reason) {
    if (this._exceptionCallback !== null) {
		this._exceptionCallback(reason);
    }
};

ImageDecoderImageryProvider.prototype._opened = function opened() {
    if (this._ready) {
        throw 'ImageDecoderImageryProvider error: opened() was called more than once!';
    }
    
    this._ready = true;
    
    // This is wrong if COD or COC exists besides main header COD
    this._numResolutionLevels = this._image.getNumResolutionLevelsForLimittedViewer();
    this._quality = this._image.getHighestQuality();
    var maximumCesiumLevel = this._numResolutionLevels - 1;
        
    this._tileWidth = this._image.getTileWidth();
    this._tileHeight = this._image.getTileHeight();
        
    var bestLevel = this._image.getImageLevel();
    var bestLevelWidth  = this._image.getLevelWidth (bestLevel);
    var bestLevelHeight = this._image.getLevelHeight(bestLevel);
    
    var lowestLevelTilesX = Math.ceil(bestLevelWidth  / this._tileWidth ) >> maximumCesiumLevel;
    var lowestLevelTilesY = Math.ceil(bestLevelHeight / this._tileHeight) >> maximumCesiumLevel;

    imageHelperFunctions.fixBounds(
        this._rectangle,
        this._image,
        this._adaptProportions);
    var rectangleWidth  = this._rectangle.east  - this._rectangle.west;
    var rectangleHeight = this._rectangle.north - this._rectangle.south;
    
    var bestLevelScale = 1 << maximumCesiumLevel;
    var pixelsWidthForCesium  = this._tileWidth  * lowestLevelTilesX * bestLevelScale;
    var pixelsHeightForCesium = this._tileHeight * lowestLevelTilesY * bestLevelScale;
    
    // Cesium works with full tiles only, thus fix the geographic bounds so
    // the pixels lies exactly on the original bounds
    
    var geographicWidthForCesium =
        rectangleWidth * pixelsWidthForCesium / bestLevelWidth;
    var geographicHeightForCesium =
        rectangleHeight * pixelsHeightForCesium / bestLevelHeight;
    
    var fixedEast  = this._rectangle.west  + geographicWidthForCesium;
    var fixedSouth = this._rectangle.north - geographicHeightForCesium;
    
    this._tilingSchemeParams = {
        west: this._rectangle.west,
        east: fixedEast,
        south: fixedSouth,
        north: this._rectangle.north,
        levelZeroTilesX: lowestLevelTilesX,
        levelZeroTilesY: lowestLevelTilesY,
        maximumLevel: maximumCesiumLevel
    };
    
    this._tilingScheme = createTilingScheme(this._tilingSchemeParams);
        
    Cesium.TileProviderError.handleSuccess(this._errorEvent);
};

function createTilingScheme(params) {
    var geographicRectangleForCesium = new Cesium.Rectangle(
        params.west, params.south, params.east, params.north);
    
    var tilingScheme = new Cesium.GeographicTilingScheme({
        rectangle: geographicRectangleForCesium,
        numberOfLevelZeroTilesX: params.levelZeroTilesX,
        numberOfLevelZeroTilesY: params.levelZeroTilesY
    });
    
    return tilingScheme;
}
},{"_cesiumfrustumcalculator.js":1,"imagehelperfunctions.js":12,"workerproxyimagedecoder.js":18}],5:[function(require,module,exports){
'use strict';

module.exports = ImageDecoder;

var WorkerProxyFetchManager = require('workerproxyfetchmanager.js');
var imageHelperFunctions = require('imageHelperFunctions.js');
var DecodeJobsPool = require('decodejobspool.js');
var WorkerProxyPixelsDecoder = require('workerproxypixelsdecoder.js');
var ImageParamsRetrieverProxy = require('imageparamsretrieverproxy.js');

/* global console: false */
/* global Promise: false */

function ImageDecoder(imageImplementationClassName, options) {
    ImageParamsRetrieverProxy.call(this, imageImplementationClassName);
    
    this._options = options || {};
    this._optionsWebWorkers = imageHelperFunctions.createInternalOptions(imageImplementationClassName, this._options);
    var decodeWorkersLimit = this._options.workersLimit || 5;
    
    this._tileWidth = this._options.tileWidth || 256;
    this._tileHeight = this._options.tileHeight || 256;
    this._showLog = !!this._options.showLog;
    
    /*if (this._showLog) {
        // Old IE
        throw 'showLog is not supported on this browser';
    }*/

    this._channelStates = [];
    this._decoders = [];

    this._fetchManager = new WorkerProxyFetchManager(this._optionsWebWorkers);
    
    var decodeScheduler = imageHelperFunctions.createScheduler(
        this._showLog,
        this._options.decodePrioritizer,
        'decode',
        this._createDecoder.bind(this),
        decodeWorkersLimit);
    
    this._decodePrioritizer = decodeScheduler.prioritizer;

    this._requestsDecodeJobsPool = new DecodeJobsPool(
        this._fetchManager,
        decodeScheduler.scheduler,
        this._tileWidth,
        this._tileHeight,
        /*onlyWaitForDataAndDecode=*/false);
        
    this._channelsDecodeJobsPool = new DecodeJobsPool(
        this._fetchManager,
        decodeScheduler.scheduler,
        this._tileWidth,
        this._tileHeight,
        /*onlyWaitForDataAndDecode=*/true);
}

ImageDecoder.prototype = Object.create(ImageParamsRetrieverProxy.prototype);

ImageDecoder.prototype.getTileWidth = function getTileWidth() {
    this._validateSizesCalculator();
    return this._tileWidth;
};

ImageDecoder.prototype.getTileHeight = function getTileHeight() {
    this._validateSizesCalculator();
    return this._tileHeight;
};
    
ImageDecoder.prototype.setServerRequestPrioritizerData =
    function setServerRequestPrioritizerData(prioritizerData) {
    
    this._fetchManager.setServerRequestPrioritizerData(
        prioritizerData);
};

ImageDecoder.prototype.setDecodePrioritizerData =
    function setDecodePrioritizerData(prioritizerData) {
    
    if (this._decodePrioritizer === null) {
        throw 'No decode prioritizer has been set';
    }
    
    if (this._showLog) {
        console.log('setDecodePrioritizerData(' + prioritizerData + ')');
    }
    
    var prioritizerDataModified = Object.create(prioritizerData);
    prioritizerDataModified.image = this;
    
    this._decodePrioritizer.setPrioritizerData(prioritizerDataModified);
};

ImageDecoder.prototype.open = function open(url) {
    var self = this;
    return this._fetchManager.open(url).then(function (sizesParams) {
        self._internalSizesParams = sizesParams;
        return {
            sizesParams: sizesParams,
            applicativeTileWidth : self.getTileWidth(),
            applicativeTileHeight: self.getTileHeight()
        };
    });
};

ImageDecoder.prototype.close = function close() {
    for (var i = 0; i < this._decoders.length; ++i) {
        this._decoders[i].terminate();
    }

    return this._fetchManager.close();
};

ImageDecoder.prototype.createChannel = function createChannel(
    createdCallback) {
    
    this._validateSizesCalculator();
    
    var self = this;
    
    function channelCreated(channelHandle) {
        self._channelStates[channelHandle] = {
            decodeJobsListenerHandle: null
        };
        
        createdCallback(channelHandle);
    }
    
    this._fetchManager.createChannel(
        channelCreated);
};

ImageDecoder.prototype.requestPixels = function requestPixels(imagePartParams) {
    this._validateSizesCalculator();
    
    var level = imagePartParams.level;
    var levelWidth = this._sizesCalculator.getLevelWidth(level);
    var levelHeight = this._sizesCalculator.getLevelHeight(level);
    
    var resolve, reject;
    var accumulatedResult = {};
    
    var self = this;
    var promise = new Promise(startPromise);
    return promise;
    
    function startPromise(resolve_, reject_) {
        resolve = resolve_;
        reject = reject_;
        
        self._requestsDecodeJobsPool.forkDecodeJobs(
            imagePartParams,
            internalCallback,
            internalTerminatedCallback,
            levelWidth,
            levelHeight,
            /*isProgressive=*/false);
    }
    
    function internalCallback(decodedData) {
        copyPixelsToAccumulatedResult(decodedData, accumulatedResult);
    }
    
    function internalTerminatedCallback(isAborted) {
        if (isAborted) {
            reject('Request was aborted due to failure or priority');
        } else {
            resolve(accumulatedResult);
        }
    }
};

ImageDecoder.prototype.requestPixelsProgressive = function requestPixelsProgressive(
    imagePartParams,
    callback,
    terminatedCallback,
    imagePartParamsNotNeeded,
    channelHandle) {
    
    this._validateSizesCalculator();
    
    var level = imagePartParams.level;
    var levelWidth = this._sizesCalculator.getLevelWidth(level);
    var levelHeight = this._sizesCalculator.getLevelHeight(level);
    
    var channelState = null;
    var decodeJobsPool;
    if (channelHandle === undefined) {
        decodeJobsPool = this._requestsDecodeJobsPool;
    } else {
        decodeJobsPool = this._channelsDecodeJobsPool;
        
        channelState = this._channelStates[channelHandle];
        
        if (channelState === undefined) {
            throw 'Channel handle does not exist';
        }
    }
    
    var listenerHandle = decodeJobsPool.forkDecodeJobs(
        imagePartParams,
        callback,
        terminatedCallback,
        levelWidth,
        levelHeight,
        /*isProgressive=*/true,
        imagePartParamsNotNeeded);
        
    if (channelHandle !== undefined) {
        if (channelState.decodeJobsListenerHandle !== null) {
            // Unregister after forked new jobs, so no termination occurs meanwhile
            decodeJobsPool.unregisterForkedJobs(
                channelState.decodeJobsListenerHandle);
        }
        channelState.decodeJobsListenerHandle = listenerHandle;
        this._fetchManager.moveChannel(channelHandle, imagePartParams);
    }
};

ImageDecoder.prototype.reconnect = function reconnect() {
    this._fetchManager.reconnect();
};

ImageDecoder.prototype.alignParamsToTilesAndLevel = function alignParamsToTilesAndLevel(region) {
	return imageHelperFunctions.alignParamsToTilesAndLevel(region, this);
};

ImageDecoder.prototype._getSizesParamsInternal = function getSizesParamsInternal() {
    return this._internalSizesParams;
};

ImageDecoder.prototype._createDecoder = function createDecoder() {
    var decoder = new WorkerProxyPixelsDecoder(this._optionsWebWorkers);
    this._decoders.push(decoder);
    
    return decoder;
};

function copyPixelsToAccumulatedResult(decodedData, accumulatedResult) {
    var bytesPerPixel = 4;
    var sourceStride = decodedData.width * bytesPerPixel;
    var targetStride =
        decodedData.originalRequestWidth * bytesPerPixel;
    
    if (accumulatedResult.pixels === undefined) {
        var size =
            targetStride * decodedData.originalRequestHeight;
            
        accumulatedResult.pixels = new Uint8Array(size);
        accumulatedResult.xInOriginalRequest = 0;
        accumulatedResult.yInOriginalRequest = 0;
        
        var width = decodedData.originalRequestWidth;
        accumulatedResult.originalRequestWidth = width;
        accumulatedResult.width = width;

        var height = decodedData.originalRequestHeight;
        accumulatedResult.originalRequestHeight = height;
        accumulatedResult.height = height;
    }
    
    accumulatedResult.allRelevantBytesLoaded =
        decodedData.allRelevantBytesLoaded;

    var sourceOffset = 0;
    var targetOffset =
        decodedData.xInOriginalRequest * bytesPerPixel + 
        decodedData.yInOriginalRequest * targetStride;
    
    for (var i = 0; i < decodedData.height; ++i) {
        var sourceSubArray = decodedData.pixels.subarray(
            sourceOffset, sourceOffset + sourceStride);
        
        accumulatedResult.pixels.set(sourceSubArray, targetOffset);
        
        sourceOffset += sourceStride;
        targetOffset += targetStride;
    }
}
},{"decodejobspool.js":7,"imageHelperFunctions.js":12,"imageparamsretrieverproxy.js":15,"workerproxyfetchmanager.js":17,"workerproxypixelsdecoder.js":19}],6:[function(require,module,exports){
'use strict';

module.exports = DecodeJob;

var LinkedList = require('linkedlist.js');

var requestIdCounter = 0;

function DecodeJob(
    imagePartParams,
    fetchManager,
    decodeScheduler,
    onlyWaitForDataAndDecode) {
    
    this._isAborted = false;
    this._isTerminated = false;
    this._isFetchRequestTerminated = false;
    this._isFirstStage = true;
    this._isManuallyAborted = false;

    this._firstDecodeInput = null;
    this._pendingDecodeInput = null;
    this._activeSubJobs = 1;
    this._imagePartParams = imagePartParams;
    this._decodeScheduler = decodeScheduler;
    this._jobSequenceId = 0;
    this._lastFinishedJobSequenceId = -1;
    this._progressiveStagesDone = 0;
    this._listenersLinkedList = new LinkedList();
    this._progressiveListenersCount = 0;
    this._requestId = ++requestIdCounter;
    this._allRelevantBytesLoaded = 0;
    this._fetchManager = fetchManager;
    this._startDecodeBound = this._startDecode.bind(this);
    this._decodeAbortedBound = this._decodeAborted.bind(this);
    
    fetchManager.createRequest(
        imagePartParams,
        this,
        this._dataReadyForDecode,
        this._fetchTerminated,
        onlyWaitForDataAndDecode,
        this._requestId);
}

DecodeJob.prototype.registerListener = function registerListener(listenerHandle) {
    var iterator = this._listenersLinkedList.add(listenerHandle);
    
    if (listenerHandle.isProgressive) {
        ++this._progressiveListenersCount;
        
        if (this._progressiveListenersCount === 1) {
            this._fetchManager.setIsProgressiveRequest(
                this._requestId, true);
        }
    }
    
    var unregisterHandle = iterator;
    return unregisterHandle;
};

DecodeJob.prototype.unregisterListener = function unregisterListener(unregisterHandle) {
    var iterator = unregisterHandle;
    var listenerHandle = this._listenersLinkedList.getValue(iterator);

    this._listenersLinkedList.remove(unregisterHandle);
    
    if (listenerHandle.isProgressive) {
        --this._progressiveListenersCount;
    }
    
    if (this._listenersLinkedList.getCount() === 0) {
        this._fetchManager.manualAbortRequest(
            this._requestId);
        
        this._isAborted = true;
        this._isTerminated = true;
        this._isFetchRequestTerminated = true;
        this._isManuallyAborted = true;
    } else if (this._progressiveListenersCount === 0) {
        this._fetchManager.setIsProgressiveRequest(
            this._requestId, false);
    }
};

DecodeJob.prototype.getIsTerminated = function getIsTerminated() {
    return this._isTerminated;
};

DecodeJob.prototype._dataReadyForDecode = function dataReadyForDecode(dataForDecode) {
    if (this._isAbortedNoTermination() ||
        this._listenersLinkedList.getCount() === 0) {
        
        // NOTE: Should find better way to clean job if listeners list
        // is empty
        
        return;
    }
    
	// Implementation idea:
	// 1. We have at most one active decode per DecodeJob. Thus if already
	//    active decode is done, we put the new data in a "pendingDecodeInput"
	//    variable which will be decoded when current decode is done.
	// 2. When we have more than a single decode we need to decode only last
	//    fetched data (because it is of highest quality). Thus older pending
	//    data is overriden by last one.
	// 3. The only case that older data should be decoded is the lowest quality
	//    (which is the first fetched data arrived). This is because we want to
	//    show a primary image ASAP, and the the lowest quality is easier to
	//    than others decode.
	// The idea described below is correct for JPIP, and I guess for other
	// heavy-decoded image types. One may add options to the ImageDecoder
	// library in order to configure another behavior, and change the
	// implementation in the DecodeJob class accordingly.
	
    if (this._isFirstStage) {
        this._firstDecodeInput = {
            dataForDecode: dataForDecode
        };
    } else {
        this._pendingDecodeInput = {
            dataForDecode: dataForDecode
        };
    
        if (this._isAlreadyScheduledNonFirstJob) {
            return;
        }
        
        this._isAlreadyScheduledNonFirstJob = true;
    }
    
    if (this._isTerminated) {
        throw 'Job has already been terminated';
    }
    
    this._isFirstStage = false;
    ++this._activeSubJobs;
    
    var jobContext = {
        self: this,
        imagePartParams: this._imagePartParams,
        progressiveStagesDone: this._progressiveStagesDone
    };
    
    this._decodeScheduler.enqueueJob(
        this._startDecodeBound, jobContext, this._decodeAbortedBound);
};

DecodeJob.prototype._startDecode = function startDecode(decoder, jobContext) {
    var decodeInput;
    if (this._firstDecodeInput !== null) {
        decodeInput = this._firstDecodeInput;
        this._firstDecodeInput = null;
    } else {
        decodeInput = this._pendingDecodeInput;
        this._pendingDecodeInput = null;
        
        this._isAlreadyScheduledNonFirstJob = false;
    }
    
    jobContext.allRelevantBytesLoaded = decodeInput.dataForDecode.allRelevantBytesLoaded;
    
    if (this._isAbortedNoTermination()) {
        --this._activeSubJobs;
        this._decodeScheduler.jobDone(decoder, jobContext);
        this._checkIfAllTerminated();
        
        return;
    }
    
    var jobSequenceId = ++this._jobSequenceId;
    
    var params = this._imagePartParams;
    var width = params.maxXExclusive - params.minX;
    var height = params.maxYExclusive - params.minY;

    decoder.decode(decodeInput.dataForDecode).then(pixelsDecodedCallbackInClosure);
        
    var self = this;
    
    function pixelsDecodedCallbackInClosure(decodeResult) {
        self._pixelsDecodedCallback(
            decoder,
            decodeResult,
            jobSequenceId,
            jobContext);
        
        self = null;
    }
};

DecodeJob.prototype._pixelsDecodedCallback = function pixelsDecodedCallback(
    decoder, decodeResult, jobSequenceId, jobContext) {
    
    this._decodeScheduler.jobDone(decoder, jobContext);
    --this._activeSubJobs;
    
    var relevantBytesLoadedDiff =
        jobContext.allRelevantBytesLoaded - this._allRelevantBytesLoaded;
    this._allRelevantBytesLoaded = jobContext.allRelevantBytesLoaded;
    
    if (this._isAbortedNoTermination()) {
        this._checkIfAllTerminated();
        return;
    }
    
    var lastFinished = this._lastFinishedJobSequenceId;
    if (lastFinished > jobSequenceId) {
        // Do not refresh pixels with lower quality than
        // what was already returned
        
        this._checkIfAllTerminated();
        return;
    }
    
    this._lastFinishedJobSequenceId = jobSequenceId;
    
    var tileParams = this._imagePartParams;
    
    var iterator = this._listenersLinkedList.getFirstIterator();
    while (iterator !== null) {
        var listenerHandle = this._listenersLinkedList.getValue(iterator);
        var originalParams = listenerHandle.imagePartParams;
        
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
            
            imageData: decodeResult,
            
            allRelevantBytesLoaded: listenerHandle.allRelevantBytesLoaded
        };
        
        listenerHandle.callback(decodedOffsetted);
        
        iterator = this._listenersLinkedList.getNextIterator(iterator);
    }

    this._checkIfAllTerminated();
};

DecodeJob.prototype._fetchTerminated = function fetchTerminated(isAborted) {
    if (this._isManuallyAborted) {
        // This situation might occur if request has been terminated,
        // but user's terminatedCallback has not been called yet. It
        // happens on WorkerProxyFetchManager due to thread
        // message delay.
        
        return;
    }

    if (this._isFetchRequestTerminated) {
        throw 'Double termination of fetch request';
    }
    
    this._isFetchRequestTerminated = true;
    --this._activeSubJobs;
    this._isAborted |= isAborted;
    
    this._checkIfAllTerminated();
};

DecodeJob.prototype._decodeAborted = function decodeAborted(jobContext) {
    this._isAborted = true;
    
    if (this._firstDecodeInput !== null) {
        this._firstDecodeInput = null;
    } else {
        this._pendingDecodeInput = null;
        this._isAlreadyScheduledNonFirstJob = false;
    }
    
    --this._activeSubJobs;
    
    this._checkIfAllTerminated();
};

DecodeJob.prototype._isAbortedNoTermination = function _isAbortedNoTermination() {
    if (this._isManuallyAborted) {
        return;
    }
    
    if (this._isTerminated) {
        throw 'Unexpected job state of terminated: Still runnin sub-jobs';
    }
    
    return this._isAborted;
};

DecodeJob.prototype._checkIfAllTerminated = function checkIfAllTerminated() {
    if (this._activeSubJobs < 0) {
        throw 'Inconsistent number of decode jobs';
    }
    
    if (this._activeSubJobs > 0) {
        return;
    }
    
    if (this._isAlreadyScheduledNonFirstJob) {
        throw 'Inconsistent isAlreadyScheduledNonFirstJob flag';
    }
    
    this._isTerminated = true;
    var linkedList = this._listenersLinkedList;
    this._listenersLinkedList = null;

    var iterator = linkedList.getFirstIterator();
    
    while (iterator !== null) {
        var listenerHandle = linkedList.getValue(iterator);
        listenerHandle.isAnyDecoderAborted |= this._isAborted;
        
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
};
},{"linkedlist.js":13}],7:[function(require,module,exports){
'use strict';

module.exports = DecodeJobsPool;

var DecodeJob = require('decodejob.js');

function DecodeJobsPool(
    fetchManager,
    decodeScheduler,
    tileWidth,
    tileHeight,
    onlyWaitForDataAndDecode) {
    
    this._tileWidth = tileWidth;
    this._tileHeight = tileHeight;
    this._activeRequests = [];
    this._onlyWaitForDataAndDecode = onlyWaitForDataAndDecode;
    
    this._fetchManager = fetchManager;
    
    this._decodeScheduler = decodeScheduler;
}

DecodeJobsPool.prototype.forkDecodeJobs = function forkDecodeJobs(
    imagePartParams,
    callback,
    terminatedCallback,
    levelWidth,
    levelHeight,
    isProgressive,
    imagePartParamsNotNeeded) {
    
    var minX = imagePartParams.minX;
    var minY = imagePartParams.minY;
    var maxX = imagePartParams.maxXExclusive;
    var maxY = imagePartParams.maxYExclusive;
    var level = imagePartParams.level || 0;
    var quality = imagePartParams.quality;
    var priorityData = imagePartParams.requestPriorityData;
                
    var isMinAligned =
        minX % this._tileWidth === 0 && minY % this._tileHeight === 0;
    var isMaxXAligned = maxX % this._tileWidth === 0 || maxX === levelWidth;
    var isMaxYAligned = maxY % this._tileHeight === 0 || maxY === levelHeight;
    var isOrderValid = minX < maxX && minY < maxY;
    
    if (!isMinAligned || !isMaxXAligned || !isMaxYAligned || !isOrderValid) {
        throw 'imagePartParams for decoders is not aligned to ' +
            'tile size or not in valid order';
    }
    
    var requestsInLevel = getOrAddValue(this._activeRequests, level, []);
    var requestsInQuality = getOrAddValue(
        requestsInLevel, imagePartParams.quality, []);
        
    var numTilesX = Math.ceil((maxX - minX) / this._tileWidth);
    var numTilesY = Math.ceil((maxY - minY) / this._tileHeight);
    
    var listenerHandle = {
        imagePartParams: imagePartParams,
        callback: callback,
        terminatedCallback: terminatedCallback,
        remainingDecodeJobs: numTilesX * numTilesY,
        isProgressive: isProgressive,
        isAnyDecoderAborted: false,
        isTerminatedCallbackCalled: false,
        allRelevantBytesLoaded: 0,
        unregisterHandles: []
    };
    
    for (var x = minX; x < maxX; x += this._tileWidth) {
        var requestsInX = getOrAddValue(requestsInQuality, x, []);
        var singleTileMaxX = Math.min(x + this._tileWidth, levelWidth);
        
        for (var y = minY; y < maxY; y += this._tileHeight) {
            var singleTileMaxY = Math.min(y + this._tileHeight, levelHeight);
            
            var isTileNotNeeded = isUnneeded(
                x,
                y,
                singleTileMaxX,
                singleTileMaxY,
                imagePartParamsNotNeeded);
                
            if (isTileNotNeeded) {
                --listenerHandle.remainingDecodeJobs;
                continue;
            }
        
            var decodeJobContainer = getOrAddValue(requestsInX, y, {});
            
            if (decodeJobContainer.job === undefined ||
                decodeJobContainer.job.getIsTerminated()) {
                
                var singleTileImagePartParams = {
                    minX: x,
                    minY: y,
                    maxXExclusive: singleTileMaxX,
                    maxYExclusive: singleTileMaxY,
                    level: level,
                    quality: quality,
                    requestPriorityData: priorityData
                };
                
                decodeJobContainer.job = new DecodeJob(
                    singleTileImagePartParams,
                    this._fetchManager,
                    this._decodeScheduler,
                    this._onlyWaitForDataAndDecode);
            }
            
            var unregisterHandle =
                decodeJobContainer.job.registerListener(listenerHandle);
            listenerHandle.unregisterHandles.push({
                unregisterHandle: unregisterHandle,
                job: decodeJobContainer.job
            });
        }
    }
    
    if (!listenerHandle.isTerminatedCallbackCalled &&
        listenerHandle.remainingDecodeJobs === 0) {
        
        listenerHandle.isTerminatedCallbackCalled = true;
        listenerHandle.terminatedCallback(listenerHandle.isAnyDecoderAborted);
    }
    
    return listenerHandle;
};

DecodeJobsPool.prototype.unregisterForkedJobs = function unregisterForkedJobs(listenerHandle) {
    if (listenerHandle.remainingDecodeJobs === 0) {
        // All jobs has already been terminated, no need to unregister
        return;
    }
    
    for (var i = 0; i < listenerHandle.unregisterHandles.length; ++i) {
        var handle = listenerHandle.unregisterHandles[i];
        if (handle.job.getIsTerminated()) {
            continue;
        }
        
        handle.job.unregisterListener(handle.unregisterHandle);
    }
};

function isUnneeded(
    minX, minY, maxX, maxY, imagePartParamsNotNeeded) {
    
    if (imagePartParamsNotNeeded === undefined) {
        return false;
    }
    
    for (var i = 0; i < imagePartParamsNotNeeded.length; ++i) {
        var notNeeded = imagePartParamsNotNeeded[i];
        var isInX = minX >= notNeeded.minX && maxX <= notNeeded.maxXExclusive;
        var isInY = minY >= notNeeded.minY && maxY <= notNeeded.maxYExclusive;
        
        if (isInX && isInY) {
            return true;
        }
    }
    
    return false;
}

function getOrAddValue(parentArray, index, defaultValue) {
    var subArray = parentArray[index];
    if (subArray === undefined) {
        subArray = defaultValue;
        parentArray[index] = subArray;
    }
    
    return subArray;
}
},{"decodejob.js":6}],8:[function(require,module,exports){
'use strict';

module.exports = FetchJob;

FetchJob.FETCH_TYPE_REQUEST = 1;
FetchJob.FETCH_TYPE_CHANNEL = 2; // movable
FetchJob.FETCH_TYPE_ONLY_WAIT_FOR_DATA = 3;

function FetchJob(fetcher, scheduler, fetchType, contextVars) {
    this._fetcher = fetcher;
    this._scheduler = scheduler;
    
    this._dataListeners = [];
    this._terminatedListeners = [];
    
    this._imagePartParams = null;
    this._progressiveStagesDone = 0;
    
    this._isYielded = false;
    this._isFailure = false;
    this._isTerminated = false;
    this._isManuallyAborted = false;
    this._isChannel = fetchType === FetchJob.FETCH_TYPE_CHANNEL;
	this._isChannelStartedFetch = false;
    this._contextVars = contextVars;
    this._isOnlyWaitForData = fetchType === FetchJob.FETCH_TYPE_ONLY_WAIT_FOR_DATA;
    this._useScheduler = fetchType === FetchJob.FETCH_TYPE_REQUEST;
    this._imageDataContext = null;
    this._resource = null;
    this._abortedBound = this._aborted.bind(this);
	this._fetchHandle = null;
    //this._alreadyTerminatedWhenAllDataArrived = false;
    
    if (fetchType === FetchJob.FETCH_TYPE_CHANNEL) {
        this._movableFetchState = {};
    } else {
        this._movableFetchState = null;
    }
}

FetchJob.prototype.fetch = function fetch(imagePartParams) {
    if (this._isChannel) {
		if (this._imageDataContext !== null) {
			this._imageDataContext.dispose();
		}
        this._imagePartParams = imagePartParams;
        this._startFetch();
        return;
    }
    
    if (this._imagePartParams !== null) {
        throw 'Cannot fetch twice on fetch type of "request"';
    }
    
    this._imagePartParams = imagePartParams;
    
    if (!this._useScheduler) {
        startRequest(/*resource=*/null, this);
        return;
    }
    
    this._scheduler.enqueueJob(startRequest, this, fetchAbortedByScheduler);
};

FetchJob.prototype.manualAbortRequest = function manualAbortRequest() {
    this._isManuallyAborted = true;
    this._isTerminated = true;
    
    if (this._fetchHandle !== null) {
        this._fetchHandle.abortAsync().then(this._abortedBound);
    } else {
		this._imageDataContext.dispose();
	}
};

FetchJob.prototype.getContextVars = function getContextVars(requestId) {
    return this._contextVars;
};

FetchJob.prototype.on = function on(event, listener) {
    switch (event) {
        case 'data':
            this._dataListeners.push(listener);
            break;
        case 'terminated':
            this._terminatedListeners.push(listener);
            break;
        default:
            throw 'Unexpected event ' + event;
    }
};

FetchJob.prototype.setIsProgressive = function setIsProgressive(isProgressive) {
    this._isProgressive = isProgressive;
	if (this._imageDataContext !== null) {
		this._imageDataContext.setIsProgressive(isProgressive);
	}
};

FetchJob.prototype.getIsProgressive = function getIsProgressive() {
    return this._isProgressive;
};

FetchJob.prototype._startFetch = function startFetch() {
    var imageDataContext = this._fetcher.createImageDataContext(
        this._imagePartParams);
    
    this._imageDataContext = imageDataContext;
	this._imageDataContext.setIsProgressive(this._isProgressive);

    if (imageDataContext.isDone()) {
        for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i].call(this, this._contextVars, imageDataContext);
        }

        this._fetchTerminated(/*isAborted=*/false);
        //this._alreadyTerminatedWhenAllDataArrived = true;
        
        return;
    }
    
    if (imageDataContext.hasData()) {
        for (var j = 0; j < this._dataListeners.length; ++j) {
            this._dataListeners[j].call(this, this._contextVars, imageDataContext);
        }
    }
    
    var self = this;
    imageDataContext.on('data', function() {
        self._dataCallback(imageDataContext);
    });
    
    if (!this._isOnlyWaitForData) {
		if (!this._isChannel) {
			this._fetchHandle = this._fetcher.fetch(imageDataContext);
		} else if (this._isChannelStartedFetch) {
			this._fetcher.moveFetch(imageDataContext, this._movableFetchState);
		} else {
			this._fetcher.startMovableFetch(imageDataContext, this._movableFetchState);
			this._isChannelStartedFetch = true;
		}
    }
};

FetchJob.prototype._fetchTerminated = function fetchTerminated(isAborted) {
    if (this._isYielded || this._isTerminated) {
        throw 'Unexpected request state on terminated';
    }
    
    if (this._resource !== null) {
        if (isAborted) {
            throw 'Unexpected request termination without resource allocated';
        }

        this._scheduler.jobDone(this._resource, this);

        this._resource = null;
    } else if (!isAborted && this._useScheduler) {
        throw 'Job expected to have resource on successful termination';
    }
    
    // Channel is not really terminated, but only fetches a new region
    // (see moveChannel()).
    if (!this._isChannel) {
        this._isTerminated = true;
        
        for (var i = 0; i < this._terminatedListeners.length; ++i) {
            this._terminatedListeners[i](
                this._contextVars, this._imageDataContext, isAborted);
        }
    }
    
    if (this._imageDataContext !== null && !this._isFailure) {
        this._imageDataContext.dispose();
    }
};

FetchJob.prototype._continueFetch = function continueFetch() {
    if (this.isChannel) {
        throw 'Unexpected call to continueFetch on channel';
    }
    
    this._fetchHandle = this._fetcher.fetch(this._imageDataContext);
};

FetchJob.prototype._dataCallback = function dataCallback(imageDataContext) {
    try {
        if (this._isYielded || this._isTerminated) {
            throw 'Unexpected request state on fetch callback';
        }
            
        if (imageDataContext !== this._imageDataContext) {
            throw 'Unexpected imageDataContext';
        }

        ++this._progressiveStagesDone;
        
        
        for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i].call(this, this._contextVars, imageDataContext);
        }
        
        if (imageDataContext.isDone()) {
            this._fetchTerminated(/*isAborted=*/false);
            //this._alreadyTerminatedWhenAllDataArrived = true;
            return;
        }
        
        if (this._useScheduler) {
            if (this._resource === null) {
                throw 'No resource allocated but fetch callback called';
            }
            
			var isYielded = this._scheduler.tryYield(
				continueYieldedRequest,
				this,
				fetchAbortedByScheduler,
				fetchYieldedByScheduler,
				this._resource);
            
			if (isYielded) {
                this._fetchHandle.abortAsync().then(this._abortedBound);
            }
        }
    } catch (e) {
        this._isFailure = true;
        fetchAbortedByScheduler(this);
    }
};

FetchJob.prototype._aborted = function aborted() {
    // TODO: It seems that this function is totally historical code. Should review it.
    
    //if (this._alreadyTerminatedWhenAllDataArrived) {
    //    // Resources were already released ASAP
    //    return;
    //}
    
    if (this._isYielded || this._resource === null) {
        throw 'Unexpected request state on stopped';
    }
    
    if (this._isOnlyWaitForData ||
        this._fetchHandle === null) {
        
        throw 'Unexpected request type on stopped';
    }
    
    /*
    if (!isAborted) {
        if (!this._isTerminated) {
            throw '"stopped" listener was called with isAborted=false but ' +
                'imageDataContext "data" listener was not called yet';
        }
        
        return;
    }
    //*/
    
    var scheduler = this._scheduler;
    
    var isYielded = scheduler.tryYield(
        continueYieldedRequest,
        this,
        fetchAbortedByScheduler,
        fetchYieldedByScheduler,
        this._resource);
    
    if (isYielded || this._isTerminated) {
        this._fetchHandle = null;
        scheduler.jobDone(this._resource, this);
        
        return;
    }
    
    this._continueFetch();
};

// Properties for FrustumRequesetPrioritizer

Object.defineProperty(FetchJob.prototype, 'imagePartParams', {
    get: function getImagePartParams() {
        return this._imagePartParams;
    }
});

Object.defineProperty(FetchJob.prototype, 'progressiveStagesDone', {
    get: function getProgressiveStagesDone() {
        return this._progressiveStagesDone;
    }
});

function startRequest(resource, self) {
    if (self._imageDataContext !== null) {
        throw 'Unexpected restart of already started request';
    }
    
    if (self._isManuallyAborted) {
        if (resource !== null) {
            self._scheduler.jobDone(resource, self);
        }
        
        return;
    }
    
    self._resource = resource;
    
    self._startFetch();
}

function continueYieldedRequest(resource, self) {
    if (self._isManuallyAborted || self._isFailure) {
        self._scheduler.jobDone(self._resource, self);
        
        return;
    }
    
    if (!self.isYielded || self.isTerminated) {
        throw 'Unexpected request state on continue';
    }
    
    self.isYielded = false;
    self.resource = resource;
    
    self._continueFetch();
}

function fetchYieldedByScheduler(self) {
    if (self._isYielded || self._isTerminated) {
        throw 'Unexpected request state on yield';
    }
    
    self._isYielded = true;
    self._resource = null;
}

function fetchAbortedByScheduler(self) {
    self._isYielded = false;
    self._resource = null;
    self._fetchTerminated(/*isAborted=*/true);
}
},{}],9:[function(require,module,exports){
'use strict';

module.exports = FetchManager;

var imageHelperFunctions = require('imagehelperfunctions.js');
var FetchJob = require('fetchjob.js');
var ImageParamsRetrieverProxy = require('imageparamsretrieverproxy.js');

/* global console: false */

function FetchManager(options) {
    ImageParamsRetrieverProxy.call(this, options.imageImplementationClassName);

    var serverRequestsLimit = options.serverRequestsLimit || 5;
    
    this._fetcher = null;
    this._internalSizesParams = null;
    this._showLog = options.showLog;
    
    if (this._showLog) {
        // Old IE
        throw 'showLog is not supported on this browser';
    }
    
    var serverRequestScheduler = imageHelperFunctions.createScheduler(
        options.showLog,
        options.serverRequestPrioritizer,
        'serverRequest',
        createServerRequestDummyResource,
        serverRequestsLimit);
    
    this._serverRequestPrioritizer = serverRequestScheduler.prioritizer;
    
    this._scheduler = serverRequestScheduler.scheduler;
    this._channelHandleCounter = 0;
    this._channelHandles = [];
    this._requestById = [];
}

FetchManager.prototype = Object.create(ImageParamsRetrieverProxy.prototype);

FetchManager.prototype.open = function open(url) {
    var promise = this._imageImplementation.createFetcher(url, {isReturnPromise: true});
    var self = this;
    return promise.then(function(result) {
        self._fetcher = result.fetcher;
        self._internalSizesParams = result.sizesParams;
        return result.sizesParams;
    });
};

FetchManager.prototype.close = function close() {
    return this._fetcher.close({isReturnPromise: true});
};

FetchManager.prototype.setIsProgressiveRequest = function setIsProgressiveRequest(
    requestId, isProgressive) {
    
    var fetchJob = this._requestById[requestId];
    if (fetchJob === undefined) {
        // This situation might occur if request has been terminated,
        // but user's terminatedCallback has not been called yet. It
        // happens on WorkerProxyFetchManager due to thread
        // message delay.
        
        return null;
    }
    
    fetchJob.setIsProgressive(isProgressive);
};

FetchManager.prototype.createChannel = function createChannel(
    createdCallback) {
    
    var channelHandle = ++this._channelHandleCounter;
    this._channelHandles[channelHandle] = new FetchJob(
        this._fetcher,
        this._scheduler,
        FetchJob.FETCH_TYPE_CHANNEL,
        /*contextVars=*/null);

    createdCallback(channelHandle);
};

FetchManager.prototype.moveChannel = function moveChannel(
    channelHandle, imagePartParams) {
    
    var channel = this._channelHandles[channelHandle];
    channel.fetch(imagePartParams);
};

FetchManager.prototype.createRequest = function createRequest(
    fetchParams,
    callbackThis,
    callback,
    terminatedCallback,
    isOnlyWaitForData,
    requestId) {
    
    var contextVars = {
        progressiveStagesDone: 0,
        isLastCallbackCalledWithoutLowQualityLimit: false,
        callbackThis: callbackThis,
        callback: callback,
        terminatedCallback: terminatedCallback,
        requestId: requestId,
        fetchJob: null,
        self: this
    };
    
    var fetchType = isOnlyWaitForData ?
        FetchJob.FETCH_TYPE_ONLY_WAIT_FOR_DATA : FetchJob.FETCH_TYPE_REQUEST;
    
    var fetchJob = new FetchJob(
        this._fetcher, this._scheduler, fetchType, contextVars);
    
    contextVars.fetchJob = fetchJob;
    
    if (this._requestById[requestId] !== undefined) {
        throw 'Duplication of requestId ' + requestId;
    } else if (requestId !== undefined) {
        this._requestById[requestId] = fetchJob;
    }
    
    fetchJob.on('data', internalCallback);
    fetchJob.on('terminated', internalTerminatedCallback);
    
    fetchJob.fetch(fetchParams);
};

FetchManager.prototype.manualAbortRequest = function manualAbortRequest(
    requestId) {
    
    var fetchJob = this._requestById[requestId];
    
    if (fetchJob === undefined) {
        // This situation might occur if request has been terminated,
        // but user's terminatedCallback has not been called yet. It
        // happens on WorkerProxyFetchManager due to web worker
        // message delay.
        
        return;
    }
    
    fetchJob.manualAbortRequest();
    delete this._requestById[requestId];
};

FetchManager.prototype.reconnect = function reconnect() {
    this._fetcher.reconnect();
};

FetchManager.prototype.setServerRequestPrioritizerData =
    function setServerRequestPrioritizerData(prioritizerData) {
        if (this._serverRequestPrioritizer === null) {
            throw 'No serverRequest prioritizer has been set';
        }
        
        if (this._showLog) {
            console.log('setServerRequestPrioritizerData(' + prioritizerData + ')');
        }
        
        prioritizerData.image = this;
        this._serverRequestPrioritizer.setPrioritizerData(prioritizerData);
    };

FetchManager.prototype._getSizesParamsInternal = function getSizesParamsInternal() {
    return this._internalSizesParams;
};

function internalCallback(contextVars, imageDataContext) {
    var isProgressive = contextVars.fetchJob.getIsProgressive();
    var isLimitToLowQuality = 
        contextVars.progressiveStagesDone === 0;
    
    // See comment at internalTerminatedCallback method
    contextVars.isLastCallbackCalledWithoutLowQualityLimit |=
        isProgressive && !isLimitToLowQuality;
    
    if (!isProgressive) {
        return;
    }
    
    var quality = isLimitToLowQuality ? contextVars.self.getLowestQuality() : undefined;
    
    ++contextVars.progressiveStagesDone;
    
    extractDataAndCallCallback(contextVars, imageDataContext, quality);
}

function internalTerminatedCallback(contextVars, imageDataContext, isAborted) {
    if (!contextVars.isLastCallbackCalledWithoutLowQualityLimit) {
        // This condition come to check if another decoding should be done.
        // One situation it may happen is when the request is not
        // progressive, then the decoding is done only on termination.
        // Another situation is when only the first stage has been reached,
        // thus the callback was called with only the first quality (for
        // performance reasons). Thus another decoding should be done.
        
        extractDataAndCallCallback(contextVars, imageDataContext);
    }
    
    contextVars.terminatedCallback.call(
        contextVars.callbackThis, isAborted);
    
    delete contextVars.self._requestById[contextVars.requestId];
}

function extractDataAndCallCallback(contextVars, imageDataContext, quality) {
    var dataForDecode = imageDataContext.getFetchedData(quality);
    
    contextVars.callback.call(
        contextVars.callbackThis, dataForDecode);
}

function createServerRequestDummyResource() {
    return {};
}
},{"fetchjob.js":8,"imagehelperfunctions.js":12,"imageparamsretrieverproxy.js":15}],10:[function(require,module,exports){
'use strict';

module.exports = FrustumRequestsPrioritizer;
var PRIORITY_ABORT_NOT_IN_FRUSTUM = -1;
var PRIORITY_CALCULATION_FAILED = 0;
var PRIORITY_TOO_GOOD_RESOLUTION = 1;
var PRIORITY_NOT_IN_FRUSTUM = 2;
var PRIORITY_LOWER_RESOLUTION = 3;

var PRIORITY_MINORITY_IN_FRUSTUM = 4;
var PRIORITY_PARTIAL_IN_FRUSTUM = 5;
var PRIORITY_MAJORITY_IN_FRUSTUM = 6;
var PRIORITY_FULLY_IN_FRUSTUM = 7;

var ADD_PRIORITY_TO_LOW_QUALITY = 5;

var PRIORITY_HIGHEST = 13;

var log2 = Math.log(2);

function FrustumRequestsPrioritizer(
    isAbortRequestsNotInFrustum, isPrioritizeLowProgressiveStage) {
    
    this._frustumData = null;
    this._isAbortRequestsNotInFrustum = isAbortRequestsNotInFrustum;
    this._isPrioritizeLowProgressiveStage = isPrioritizeLowProgressiveStage;
}

Object.defineProperty(
    FrustumRequestsPrioritizer.prototype, 'minimalLowQualityPriority', {
        get: function minimalLowQualityPriority() {
            return PRIORITY_MINORITY_IN_FRUSTUM + ADD_PRIORITY_TO_LOW_QUALITY;
        }
    }
);
    
FrustumRequestsPrioritizer.prototype.setPrioritizerData = function setPrioritizerData(prioritizerData) {
    this._frustumData = prioritizerData;
};

FrustumRequestsPrioritizer.prototype.getPriority = function getPriority(jobContext) {
    var imagePartParams = jobContext.imagePartParams;
    if (imagePartParams.requestPriorityData.overrideHighestPriority) {
        return PRIORITY_HIGHEST;
    }

    var priority = this._getPriorityInternal(imagePartParams);
    var isInFrustum = priority >= PRIORITY_MINORITY_IN_FRUSTUM;
    
    if (this._isAbortRequestsNotInFrustum && !isInFrustum) {
        return PRIORITY_ABORT_NOT_IN_FRUSTUM;
    }
    
    var prioritizeLowProgressiveStage = 0;
    
    if (this._isPrioritizeLowProgressiveStage && isInFrustum) {
        if (jobContext.progressiveStagesDone === undefined) {
            throw 'Missing progressive stage information';
        }
        
        prioritizeLowProgressiveStage =
            jobContext.progressiveStagesDone === 0 ? ADD_PRIORITY_TO_LOW_QUALITY :
            jobContext.progressiveStagesDone === 1 ? 1 :
            0;
    }
    
    return priority + prioritizeLowProgressiveStage;
};

FrustumRequestsPrioritizer.prototype._getPriorityInternal = function getPriorityInternal(imagePartParams) {
    if (this._frustumData === null) {
        return PRIORITY_CALCULATION_FAILED;
    }
    
    if (this._frustumData.imageRectangle === undefined) {
        throw 'No imageRectangle information passed in setPrioritizerData';
    }
    
    var exactFrustumLevel = this._frustumData.exactlevel;
    
    if (this._frustumData.exactlevel === undefined) {
        throw 'No exactlevel information passed in ' +
            'setPrioritizerData. Use null if unknown';
    }
    
    var tileWest = this._pixelToCartographicX(
        imagePartParams.minX, imagePartParams);
    var tileEast = this._pixelToCartographicX(
        imagePartParams.maxXExclusive, imagePartParams);
    var tileNorth = this._pixelToCartographicY(
        imagePartParams.minY, imagePartParams);
    var tileSouth = this._pixelToCartographicY(
        imagePartParams.maxYExclusive, imagePartParams);
    
    var tilePixelsWidth =
        imagePartParams.maxXExclusive - imagePartParams.minX;
    var tilePixelsHeight =
        imagePartParams.maxYExclusive - imagePartParams.minY;
    
    var requestToFrustumResolutionRatio;
    var tileLevel = imagePartParams.level || 0;
    if (exactFrustumLevel === null) {
        var tileResolutionX = tilePixelsWidth / (tileEast - tileWest);
        var tileResolutionY = tilePixelsHeight / (tileNorth - tileSouth);
        var tileResolution = Math.max(tileResolutionX, tileResolutionY);
        var frustumResolution = this._frustumData.resolution;
        requestToFrustumResolutionRatio = tileResolution / frustumResolution;
    
        if (requestToFrustumResolutionRatio > 2) {
            return PRIORITY_TOO_GOOD_RESOLUTION;
        }
    } else if (tileLevel < exactFrustumLevel) {
        return PRIORITY_TOO_GOOD_RESOLUTION;
    }
    
    var frustumRectangle = this._frustumData.rectangle;
    var intersectionWest = Math.max(frustumRectangle.west, tileWest);
    var intersectionEast = Math.min(frustumRectangle.east, tileEast);
    var intersectionSouth = Math.max(frustumRectangle.south, tileSouth);
    var intersectionNorth = Math.min(frustumRectangle.north, tileNorth);
    
    var intersectionWidth = intersectionEast - intersectionWest;
    var intersectionHeight = intersectionNorth - intersectionSouth;
    
    if (intersectionWidth < 0 || intersectionHeight < 0) {
        return PRIORITY_NOT_IN_FRUSTUM;
    }
    
    if (exactFrustumLevel !== null) {
        if (tileLevel > exactFrustumLevel) {
            return PRIORITY_LOWER_RESOLUTION;
        }
    } else if (tileLevel > 0 && requestToFrustumResolutionRatio < 0.25) {
        return PRIORITY_LOWER_RESOLUTION;
    }
    
    var intersectionArea = intersectionWidth * intersectionHeight;
    var tileArea = (tileEast - tileWest) * (tileNorth - tileSouth);
    var partInFrustum = intersectionArea / tileArea;
    
    if (partInFrustum > 0.99) {
        return PRIORITY_FULLY_IN_FRUSTUM;
    } else if (partInFrustum > 0.7) {
        return PRIORITY_MAJORITY_IN_FRUSTUM;
    } else if (partInFrustum > 0.3) {
        return PRIORITY_PARTIAL_IN_FRUSTUM;
    } else {
        return PRIORITY_MINORITY_IN_FRUSTUM;
    }
};

FrustumRequestsPrioritizer.prototype._pixelToCartographicX = function pixelToCartographicX(
    x, imagePartParams) {
    
    var relativeX = x / this._frustumData.image.getLevelWidth(
        imagePartParams.level);
    
    var imageRectangle = this._frustumData.imageRectangle;
    var rectangleWidth = imageRectangle.east - imageRectangle.west;
    
    var xProjected = imageRectangle.west + relativeX * rectangleWidth;
    return xProjected;
};

FrustumRequestsPrioritizer.prototype._pixelToCartographicY = function tileToCartographicY(
    y, imagePartParams, image) {
    
    var relativeY = y / this._frustumData.image.getLevelHeight(
        imagePartParams.level);
    
    var imageRectangle = this._frustumData.imageRectangle;
    var rectangleHeight = imageRectangle.north - imageRectangle.south;
    
    var yProjected = imageRectangle.north - relativeY * rectangleHeight;
    return yProjected;
};
},{}],11:[function(require,module,exports){
'use strict';

module.exports = HashMap;

var LinkedList = require('linkedlist.js');

function HashMap(hasher) {
    this._byKey = [];
    this._hasher = hasher;
}

HashMap.prototype.getFromKey = function getFromKey(key) {
    var hashCode = this._hasher.getHashCode(key);
    var hashElements = this._byKey[hashCode];
    if (!hashElements) {
        return null;
    }
    
    var iterator = hashElements.getFirstIterator();
    while (iterator !== null) {
        var item = hashElements.getValue(iterator);
        if (this._hasher.isEqual(item.key, key)) {
            return item.value;
        }
        
        iterator = hashElements.getNextIterator(iterator);
    }

    return null;
};

HashMap.prototype.getFromIterator = function getFromIterator(iterator) {
    return iterator._hashElements.getValue(iterator._internalIterator).value;
};

HashMap.prototype.tryAdd = function tryAdd(key, createValue) {
    var hashCode = this._hasher.getHashCode(key);
    var hashElements = this._byKey[hashCode];
    if (!hashElements) {
        hashElements = new LinkedList();
        this._byKey[hashCode] = hashElements ;
    }
    
    var iterator = {
        _hashCode: hashCode,
        _hashElements: hashElements,
        _internalIterator: null
    };
    
    iterator._internalIterator = hashElements.getFirstIterator();
    while (iterator._internalIterator !== null) {
        var item = hashElements.getValue(iterator._internalIterator);
        if (this._hasher.isEqual(item.key, key)) {
            return {
                iterator: iterator,
                isNew: false,
                value: item.value
            };
        }
        
        iterator._internalIterator = hashElements.getNextIterator(iterator._internalIterator);
    }
    
    var value = createValue();
    iterator._internalIterator = hashElements.add({
        key: key,
        value: value
    });
    
    return {
        iterator: iterator,
        isNew: true,
        value: value
    };
};

HashMap.prototype.remove = function remove(iterator) {
    iterator._hashElements.remove(iterator._internalIterator);
    if (iterator._hashElements.getCount() === 0) {
        delete this._byKey[iterator._hashCode];
    }
};
},{"linkedlist.js":13}],12:[function(require,module,exports){
'use strict';

var FrustumRequestsPrioritizer = require('frustumrequestsprioritizer.js');

module.exports = {
    calculateFrustum2DFromBounds: calculateFrustum2DFromBounds,
    createScheduler: createScheduler,
    fixBounds: fixBounds,
    alignParamsToTilesAndLevel: alignParamsToTilesAndLevel,
    getImageImplementation: getImageImplementation,
    getScriptsForWorkerImport: getScriptsForWorkerImport,
    createInternalOptions: createInternalOptions
};

// Avoid jshint error
/* global self: false */
/* global globals: false */
    
//var log2 = Math.log(2);

var imageDecoderFrameworkScript = new AsyncProxy.ScriptsToImportPool();
imageDecoderFrameworkScript.addScriptFromErrorWithStackTrace(new Error());
var scriptsForWorkerToImport = imageDecoderFrameworkScript.getScriptsForWorkerImport();

function calculateFrustum2DFromBounds(
    bounds, screenSize) {
    
    var screenPixels =
        screenSize.x * screenSize.x + screenSize.y * screenSize.y;
    
    var boundsWidth = bounds.east - bounds.west;
    var boundsHeight = bounds.north - bounds.south;
    var boundsDistance =
        boundsWidth * boundsWidth + boundsHeight * boundsHeight;
    
    var resolution = Math.sqrt(screenPixels / boundsDistance);
    
    var frustumData = {
        resolution: resolution,
        rectangle: bounds,
        
        // Redundant, but enables to avoid already-performed calculation
        screenSize: screenSize
    };
    
    return frustumData;
}
    
function createScheduler(
    showLog, prioritizerType, schedulerName, createResource, resourceLimit) {
    
    var prioritizer;
    var scheduler;
    
    if (prioritizerType === undefined) {
        prioritizer = null;
        
        scheduler = new ResourceScheduler.LifoScheduler(
            createResource,
            resourceLimit);
    } else {
        var limitResourceByLowQualityPriority = false;
        
        if (prioritizerType === 'frustum') {
            limitResourceByLowQualityPriority = true;
            prioritizer = new FrustumRequestsPrioritizer();
        } else if (prioritizerType === 'frustumOnly') {
            limitResourceByLowQualityPriority = true;
            prioritizer = new FrustumRequestsPrioritizer(
                /*isAbortRequestsNotInFrustum=*/true,
                /*isPrioritizeLowQualityStage=*/true);
        } else {
            prioritizer = prioritizerType;
        }
        
        var options = {
            schedulerName: schedulerName,
            showLog: showLog
        };
        
        if (limitResourceByLowQualityPriority) {
            options.resourceGuaranteedForHighPriority = resourceLimit - 2;
            options.highPriorityToGuaranteeResource =
                prioritizer.minimalLowQualityPriority;
        }
        
        scheduler = new ResourceScheduler.PriorityScheduler(
            createResource,
            resourceLimit,
            prioritizer,
            options);
    }
    
    return {
        prioritizer: prioritizer,
        scheduler: scheduler
    };
}
    
function fixBounds(bounds, image, adaptProportions) {
    if (!adaptProportions) {
        return;
    }

    var rectangleWidth = bounds.east - bounds.west;
    var rectangleHeight = bounds.north - bounds.south;

    var level = image.getImageLevel();
    var pixelsAspectRatio =
        image.getLevelWidth(level) / image.getLevelHeight(level);
    var rectangleAspectRatio = rectangleWidth / rectangleHeight;
    
    if (pixelsAspectRatio < rectangleAspectRatio) {
        var oldWidth = rectangleWidth;
        rectangleWidth = rectangleHeight * pixelsAspectRatio;
        var substractFromWidth = oldWidth - rectangleWidth;
        
        bounds.east -= substractFromWidth / 2;
        bounds.west += substractFromWidth / 2;
    } else {
        var oldHeight = rectangleHeight;
        rectangleHeight = rectangleWidth / pixelsAspectRatio;
        var substractFromHeight = oldHeight - rectangleHeight;
        
        bounds.north -= substractFromHeight / 2;
        bounds.south += substractFromHeight / 2;
    }
}

function alignParamsToTilesAndLevel(
    region, imageDecoder) {
    
    var sizesCalculator = imageDecoder._getSizesCalculator();
    var tileWidth = imageDecoder.getTileWidth();
    var tileHeight = imageDecoder.getTileHeight();
    
    var regionMinX = region.minX;
    var regionMinY = region.minY;
    var regionMaxX = region.maxXExclusive;
    var regionMaxY = region.maxYExclusive;
    var screenWidth = region.screenWidth;
    var screenHeight = region.screenHeight;
    
    var isValidOrder = regionMinX < regionMaxX && regionMinY < regionMaxY;
    if (!isValidOrder) {
        throw 'Parameters order is invalid';
    }
    
    var imageLevel = sizesCalculator.getImageLevel();
    var defaultLevelWidth = sizesCalculator.getLevelWidth(imageLevel);
    var defaultLevelHeight = sizesCalculator.getLevelHeight(imageLevel);
    if (regionMaxX < 0 || regionMinX >= defaultLevelWidth ||
        regionMaxY < 0 || regionMinY >= defaultLevelHeight) {
        
        return null;
    }
    
    //var maxLevel =
    //    sizesCalculator.getDefaultNumResolutionLevels() - 1;

    //var levelX = Math.log((regionMaxX - regionMinX) / screenWidth ) / log2;
    //var levelY = Math.log((regionMaxY - regionMinY) / screenHeight) / log2;
    //var level = Math.ceil(Math.min(levelX, levelY));
    //level = Math.max(0, Math.min(maxLevel, level));
    var level = sizesCalculator.getLevel(region);
    var levelWidth = sizesCalculator.getLevelWidth(level);
    var levelHeight = sizesCalculator.getLevelHeight(level);
    
    var scaleX = defaultLevelWidth / levelWidth;
    var scaleY = defaultLevelHeight / levelHeight;
    
    var minTileX = Math.floor(regionMinX / (scaleX * tileWidth ));
    var minTileY = Math.floor(regionMinY / (scaleY * tileHeight));
    var maxTileX = Math.ceil (regionMaxX / (scaleX * tileWidth ));
    var maxTileY = Math.ceil (regionMaxY / (scaleY * tileHeight));
    
    var minX = minTileX * tileWidth;
    var minY = minTileY * tileHeight;
    var maxX = maxTileX * tileWidth;
    var maxY = maxTileY * tileHeight;
    
    var croppedMinX = Math.max(0, Math.min(levelWidth , minX));
    var croppedMinY = Math.max(0, Math.min(levelHeight, minY));
    var croppedMaxX = Math.max(0, Math.min(levelWidth , maxX));
    var croppedMaxY = Math.max(0, Math.min(levelHeight, maxY));
    
    var imageParamsToScreenScaleX = screenWidth  / (maxX - minX);
    var imageParamsToScreenScaleY = screenHeight / (maxY - minY);
    
    var imagePartParams = {
        minX: croppedMinX,
        minY: croppedMinY,
        maxXExclusive: croppedMaxX,
        maxYExclusive: croppedMaxY,
        level: level
    };
    
    var positionInImage = {
        minX: croppedMinX * scaleX,
        minY: croppedMinY * scaleY,
        maxXExclusive: croppedMaxX * scaleX,
        maxYExclusive: croppedMaxY * scaleY
    };
    
    var croppedScreen = {
        minX : Math.floor((croppedMinX - minX) * imageParamsToScreenScaleX),
        minY : Math.floor((croppedMinY - minY) * imageParamsToScreenScaleY),
        maxXExclusive : Math.ceil((croppedMaxX - minX) * imageParamsToScreenScaleX),
        maxYExclusive : Math.ceil((croppedMaxY - minY) * imageParamsToScreenScaleY)
    };
    
    return {
        imagePartParams: imagePartParams,
        positionInImage: positionInImage,
        croppedScreen: croppedScreen
    };
}

function getImageImplementation(imageImplementationClassName) {
    try {
        return window && window[imageImplementationClassName];
    } catch(e) { }

    try {
        return globals && globals[imageImplementationClassName];
    } catch(e) { }

    try {
        return self && self[imageImplementationClassName];
    } catch(e) { }
}

function getScriptsForWorkerImport(imageImplementation, options) {
    return scriptsForWorkerToImport.concat(
        imageImplementation.getScriptsToImport());
}

function createInternalOptions(imageImplementationClassName, options) {
    options = options || {};
    
    if (options.imageImplementationClassName &&
        options.scriptsToImport) {
            
        return options;
    }
    
    var imageImplementation = getImageImplementation(imageImplementationClassName);
    
    var optionsInternal = JSON.parse(JSON.stringify(options));
    optionsInternal.imageImplementationClassName = options.imageImplementationClassName || imageImplementationClassName;
    optionsInternal.scriptsToImport = options.scriptsToImport || getScriptsForWorkerImport(imageImplementation, options);
    
    return optionsInternal;
}
},{"frustumrequestsprioritizer.js":10}],13:[function(require,module,exports){
'use strict';

module.exports = LinkedList;

function LinkedList() {
    this._first = { _prev: null, _parent: this };
    this._last = { _next: null, _parent: this };
    this._count = 0;
    
    this._last._prev = this._first;
    this._first._next = this._last;
}

LinkedList.prototype.add = function add(value, addBefore) {
    if (addBefore === null || addBefore === undefined) {
        addBefore = this._last;
    }
    
    this._validateIteratorOfThis(addBefore);
    
    ++this._count;
    
    var newNode = {
        _value: value,
        _next: addBefore,
        _prev: addBefore._prev,
        _parent: this
    };
    
    newNode._prev._next = newNode;
    addBefore._prev = newNode;
    
    return newNode;
};

LinkedList.prototype.remove = function remove(iterator) {
    this._validateIteratorOfThis(iterator);
    
    --this._count;
    
    iterator._prev._next = iterator._next;
    iterator._next._prev = iterator._prev;
    iterator._parent = null;
};

LinkedList.prototype.getValue = function getValue(iterator) {
    this._validateIteratorOfThis(iterator);
    
    return iterator._value;
};

LinkedList.prototype.getFirstIterator = function getFirstIterator() {
    var iterator = this.getNextIterator(this._first);
    return iterator;
};

LinkedList.prototype.getLastIterator = function getFirstIterator() {
    var iterator = this.getPrevIterator(this._last);
    return iterator;
};

LinkedList.prototype.getNextIterator = function getNextIterator(iterator) {
    this._validateIteratorOfThis(iterator);

    if (iterator._next === this._last) {
        return null;
    }
    
    return iterator._next;
};

LinkedList.prototype.getPrevIterator = function getPrevIterator(iterator) {
    this._validateIteratorOfThis(iterator);

    if (iterator._prev === this._first) {
        return null;
    }
    
    return iterator._prev;
};

LinkedList.prototype.getCount = function getCount() {
    return this._count;
};

LinkedList.prototype._validateIteratorOfThis =
    function validateIteratorOfThis(iterator) {
    
    if (iterator._parent !== this) {
        throw 'iterator must be of the current LinkedList';
    }
};
},{}],14:[function(require,module,exports){
'use strict';

// Suppress "Unnecessary directive 'use strict'" for the slaveScriptContent function
/*jshint -W034 */

var ImageDecoder = require('imagedecoder.js');

module.exports.getScriptUrl = function getScriptUrl() {
    return slaveScriptUrl;
};

var slaveScriptBlob = new Blob(
    ['(', slaveScriptContent.toString(), ')()'],
    { type: 'application/javascript' });
var slaveScriptUrl = URL.createObjectURL(slaveScriptBlob);

function slaveScriptContent() {
    'use strict';
    AsyncProxy.AsyncProxySlave.setSlaveSideCreator(function() {
        var argumentsAsArray = new Array(arguments.length + 1);
        argumentsAsArray[0] = null;
        for (var i = 0; i < arguments.length; ++i) {
            argumentsAsArray[i + 1] = arguments[i];
        }
        
        var instance = new (Function.prototype.bind.apply(imageDecoderFramework.ImageDecoder, argumentsAsArray));
        
        return instance;
    });
}
},{"imagedecoder.js":5}],15:[function(require,module,exports){
'use strict';

module.exports = ImageParamsRetrieverProxy;

var imageHelperFunctions = require('imagehelperfunctions.js');

function ImageParamsRetrieverProxy(imageImplementationClassName) {
    this._imageImplementation = imageHelperFunctions.getImageImplementation(imageImplementationClassName);
    this._sizesParams = null;
    this._sizesCalculator = null;
}

ImageParamsRetrieverProxy.prototype.getImageLevel = function getImageLevel() {
    this._validateSizesCalculator();
    var level = this._sizesCalculator.getImageLevel();

    return level;
};

ImageParamsRetrieverProxy.prototype.getNumResolutionLevelsForLimittedViewer = function getNumResolutionLevelsForLimittedViewer() {
    this._validateSizesCalculator();
    var levels = this._sizesCalculator.getNumResolutionLevelsForLimittedViewer();

    return levels;
};

ImageParamsRetrieverProxy.prototype.getLevelWidth = function getLevelWidth(level) {
    this._validateSizesCalculator();
    var width = this._sizesCalculator.getLevelWidth(
        level);

    return width;
};

ImageParamsRetrieverProxy.prototype.getLevelHeight = function getLevelHeight(level) {
    this._validateSizesCalculator();
    var height = this._sizesCalculator.getLevelHeight(
        level);

    return height;
};

ImageParamsRetrieverProxy.prototype.getLevel = function getLevel(regionLevel0) {
    this._validateSizesCalculator();
    var level = this._sizesCalculator.getLevel(regionLevel0);
    
    return level;
};

ImageParamsRetrieverProxy.prototype.getLowestQuality = function getLowestQuality() {
    this._validateSizesCalculator();
    var quality = this._sizesCalculator.getLowestQuality();
    
    return quality;
};

ImageParamsRetrieverProxy.prototype.getHighestQuality = function getHighestQuality() {
    this._validateSizesCalculator();
    var quality = this._sizesCalculator.getHighestQuality();

    return quality;
};

ImageParamsRetrieverProxy.prototype._getSizesCalculator = function getSizesCalculator() {
    this._validateSizesCalculator(this);
    
    return this._sizesCalculator;
};

ImageParamsRetrieverProxy.prototype._getSizesParams = function getSizesParams() {
    if (!this._sizesParams) {
        this._sizesParams = this._getSizesParamsInternal();
        if (!this._sizesParams) {
            throw 'getSizesParams() return falsy value; Maybe image not ready yet?';
        }
    }
    
    return this._sizesParams;
};

ImageParamsRetrieverProxy.prototype._getSizesParamsInternal = function getSizesParamsInternal() {
    throw 'ImageParamsRetrieverProxy implemented did not implement _getSizesParamsInternal()';
};

ImageParamsRetrieverProxy.prototype._validateSizesCalculator = function validateSizesCalculator() {
    if (this._sizesCalculator !== null) {
        return;
    }
    
    var sizesParams = this._getSizesParams();
    this._sizesCalculator = this._imageImplementation.createImageParamsRetriever(
        sizesParams);
}
},{"imagehelperfunctions.js":12}],16:[function(require,module,exports){
'use strict';

// Suppress "Unnecessary directive 'use strict'" for the slaveScriptContent function
/*jshint -W034 */

module.exports.getScriptUrl = function getScriptUrl() {
    return slaveScriptUrl;
};

var slaveScriptBlob = new Blob(
    ['(', slaveScriptContent.toString(), ')()'],
    { type: 'application/javascript' });
var slaveScriptUrl = URL.createObjectURL(slaveScriptBlob);

function slaveScriptContent() {
    'use strict';
    
    var isReady = false;

    AsyncProxy.AsyncProxySlave.setBeforeOperationListener(beforeOperationListener);

    function beforeOperationListener(operationType, operationName, args) {
        /* jshint validthis: true */
        
        if (operationType !== 'callback' || operationName !== 'statusCallback') {
            return;
        }
        
        if (isReady || !args[0].isReady) {
            return null;
        }
        
        var data = { sizesParams: this._getSizesParams() };
        
        // getTileWidth and getTileHeight exists only in ImageDecoder but not in FetchManager
        if (this.getTileWidth) {
            data.applicativeTileWidth = this.getTileWidth();
        }
        if (this.getTileHeight) {
            data.applicativeTileHeight = this.getTileHeight();
        }
        
        AsyncProxy.AsyncProxySlave.sendUserDataToMaster(data);
        isReady = true;
    }
}
},{}],17:[function(require,module,exports){
'use strict';

module.exports = WorkerProxyFetchManager;

var imageHelperFunctions = require('imagehelperfunctions.js');
var sendImageParametersToMaster = require('sendimageparameterstomaster.js');
var ImageParamsRetrieverProxy = require('imageparamsretrieverproxy.js');

function WorkerProxyFetchManager(options) {
    ImageParamsRetrieverProxy.call(this, options.imageImplementationClassName);

    this._imageWidth = null;
    this._imageHeight = null;
    this._internalSizesParams = null;
    this._options = options;
    
    var ctorArgs = [options];
    var scriptsToImport = options.scriptsToImport.concat([sendImageParametersToMaster.getScriptUrl()]);
    
    this._workerHelper = new AsyncProxy.AsyncProxyMaster(
        scriptsToImport, 'imageDecoderFramework.Internals.FetchManager', ctorArgs);
    
    var boundUserDataHandler = this._userDataHandler.bind(this);
    this._workerHelper.setUserDataHandler(boundUserDataHandler);
}

WorkerProxyFetchManager.prototype = Object.create(ImageParamsRetrieverProxy.prototype);

WorkerProxyFetchManager.prototype.open = function open(url) {
    return this._workerHelper.callFunction('open', [url], { isReturnPromise: true });
};

WorkerProxyFetchManager.prototype.close = function close() {
    var self = this;
    return this._workerHelper.callFunction('close', [], { isReturnPromise: true }).then(function() {
        self._workerHelper.terminate();
    });
};

WorkerProxyFetchManager.prototype.createChannel = function createChannel(
    createdCallback) {
    
    var callbackWrapper = this._workerHelper.wrapCallback(
        createdCallback,
        'FetchManager_createChannelCallback');
    
    var args = [callbackWrapper];
    this._workerHelper.callFunction('createChannel', args);
};

WorkerProxyFetchManager.prototype.moveChannel = function moveChannel(
    channelHandle, imagePartParams) {
    
    var args = [channelHandle, imagePartParams];
    this._workerHelper.callFunction('moveChannel', args);
};

WorkerProxyFetchManager.prototype.createRequest = function createRequest(
    fetchParams,
    callbackThis,
    callback,
    terminatedCallback,
    isOnlyWaitForData,
    requestId) {
    
    //var pathToArrayInPacketsData = [0, 'data', 'buffer'];
    //var pathToHeadersCodestream = [1, 'codestream', 'buffer'];
    //var transferablePaths = [
    //    pathToArrayInPacketsData,
    //    pathToHeadersCodestream
    //];
    
    var transferablePaths = this._options.transferablePathsOfRequestCallback;
    
    var internalCallbackWrapper =
        this._workerHelper.wrapCallback(
            callback.bind(callbackThis), 'requestTilesProgressiveCallback', {
                isMultipleTimeCallback: true,
                pathsToTransferables: transferablePaths
            }
        );
    
    var internalTerminatedCallbackWrapper =
        this._workerHelper.wrapCallback(
            internalTerminatedCallback, 'requestTilesProgressiveTerminatedCallback', {
                isMultipleTimeCallback: false
            }
        );
            
    var args = [
        fetchParams,
        /*callbackThis=*/{ dummyThis: 'dummyThis' },
        internalCallbackWrapper,
        internalTerminatedCallbackWrapper,
        isOnlyWaitForData,
        requestId];
        
    var self = this;
    
    this._workerHelper.callFunction('createRequest', args);
    
    function internalTerminatedCallback(isAborted) {
        self._workerHelper.freeCallback(internalCallbackWrapper);
        terminatedCallback.call(callbackThis, isAborted);
    }
};

WorkerProxyFetchManager.prototype.manualAbortRequest = function manualAbortRequest(
    requestId) {
    
    var args = [requestId];
    this._workerHelper.callFunction(
        'manualAbortRequest', args);
};

WorkerProxyFetchManager.prototype.setIsProgressiveRequest = function setIsProgressiveRequest(
    requestId, isProgressive) {
    
    var args = [requestId, isProgressive];
    this._workerHelper.callFunction('setIsProgressiveRequest', args);
};

WorkerProxyFetchManager.prototype.setServerRequestPrioritizerData =
    function setServerRequestPrioritizerData(prioritizerData) {
    
    this._workerHelper.callFunction(
        'setServerRequestPrioritizerData',
        [ prioritizerData ],
        { isSendImmediately: true });
};

WorkerProxyFetchManager.prototype.reconnect = function reconnect() {
    this._workerHelper.callFunction('reconnect');
};

WorkerProxyFetchManager.prototype._getSizesParamsInternal = function getSizesParamsInternal() {
    return this._internalSizesParams;
};

WorkerProxyFetchManager.prototype._userDataHandler = function userDataHandler(data) {
    this._internalSizesParams = data.sizesParams;
};
},{"imagehelperfunctions.js":12,"imageparamsretrieverproxy.js":15,"sendimageparameterstomaster.js":16}],18:[function(require,module,exports){
'use strict';

module.exports = WorkerProxyImageDecoder;

var imageHelperFunctions = require('imagehelperfunctions.js');
var sendImageParametersToMaster = require('sendimageparameterstomaster.js');
var createImageDecoderSlaveSide = require('createimagedecoderonslaveside.js');
var ImageParamsRetrieverProxy = require('imageparamsretrieverproxy.js');

function WorkerProxyImageDecoder(imageImplementationClassName, options) {
    ImageParamsRetrieverProxy.call(this, imageImplementationClassName);

    this._imageWidth = null;
    this._imageHeight = null;
    this._tileWidth = 0;
    this._tileHeight = 0;
    this._sizesCalculator = null;
    
    var optionsInternal = imageHelperFunctions.createInternalOptions(imageImplementationClassName, options);
    var ctorArgs = [imageImplementationClassName, optionsInternal];
    
    var scriptsToImport = imageHelperFunctions.getScriptsForWorkerImport(
        this._imageImplementation, options);
    scriptsToImport = scriptsToImport.concat([
        sendImageParametersToMaster.getScriptUrl(),
        createImageDecoderSlaveSide.getScriptUrl()]);

    this._workerHelper = new AsyncProxy.AsyncProxyMaster(
        scriptsToImport, 'imageDecoderFramework.ImageDecoder', ctorArgs);
    
    var boundImageOpened = this._imageOpened.bind(this);
    this._workerHelper.setUserDataHandler(boundImageOpened);
}

WorkerProxyImageDecoder.prototype = Object.create(ImageParamsRetrieverProxy.prototype);

WorkerProxyImageDecoder.prototype.getTileWidth = function getTileWidth() {
    this._validateSizesCalculator();
    return this._tileWidth;
};

WorkerProxyImageDecoder.prototype.getTileHeight = function getTileHeight() {
    this._validateSizesCalculator();
    return this._tileHeight;
};

WorkerProxyImageDecoder.prototype.open = function open(url) {
    var self = this;
    return this._workerHelper.callFunction('open', [url], { isReturnPromise: true })
        .then(function(imageParams) {
            self._imageOpened(imageParams);
            return imageParams;
        });
};

WorkerProxyImageDecoder.prototype.close = function close() {
    return this._workerHelper.callFunction('close', [], { isReturnPromise: true });
};

WorkerProxyImageDecoder.prototype.createChannel = function createChannel(
    createdCallback) {
    
    var callbackWrapper = this._workerHelper.wrapCallback(
        createdCallback, 'ImageDecoder_createChannelCallback');
    
    var args = [callbackWrapper];
    this._workerHelper.callFunction('createChannel', args);
};

WorkerProxyImageDecoder.prototype.requestPixels = function requestPixels(imagePartParams) {
    var pathToPixelsArray = ['data', 'buffer'];
    var transferables = [pathToPixelsArray];
    
    var args = [imagePartParams];
    
    this._workerHelper.callFunction('requestPixels', args, {
        isReturnPromise: true,
        pathsToTransferablesInPromiseResult: transferables
    });
};

WorkerProxyImageDecoder.prototype.requestPixelsProgressive = function requestPixelsProgressive(
    imagePartParams,
    callback,
    terminatedCallback,
    imagePartParamsNotNeeded,
    channelHandle) {
    
    var transferables;
    
    // NOTE: Cannot pass it as transferables because it is passed to all
    // listener callbacks, thus after the first one the buffer is not valid
    
    //var pathToPixelsArray = [0, 'pixels', 'buffer'];
    //transferables = [pathToPixelsArray];
    
    var internalCallbackWrapper =
        this._workerHelper.wrapCallback(
            callback, 'requestPixelsProgressiveCallback', {
                isMultipleTimeCallback: true,
                pathsToTransferables: transferables
            }
        );
    
    var internalTerminatedCallbackWrapper =
        this._workerHelper.wrapCallback(
            internalTerminatedCallback, 'requestPixelsProgressiveTerminatedCallback', {
                isMultipleTimeCallback: false
            }
        );
            
    var args = [
        imagePartParams,
        internalCallbackWrapper,
        internalTerminatedCallbackWrapper,
        imagePartParamsNotNeeded,
        channelHandle];
    
    this._workerHelper.callFunction('requestPixelsProgressive', args);
        
    var self = this;
    
    function internalTerminatedCallback(isAborted) {
        self._workerHelper.freeCallback(internalCallbackWrapper);
        
        terminatedCallback(isAborted);
    }
};

WorkerProxyImageDecoder.prototype.setServerRequestPrioritizerData =
    function setServerRequestPrioritizerData(prioritizerData) {
    
    this._workerHelper.callFunction(
        'setServerRequestPrioritizerData',
        [ prioritizerData ],
        { isSendImmediately: true });
};

WorkerProxyImageDecoder.prototype.setDecodePrioritizerData =
    function setDecodePrioritizerData(prioritizerData) {
    
    this._workerHelper.callFunction(
        'setDecodePrioritizerData',
        [ prioritizerData ],
        { isSendImmediately: true });
};

WorkerProxyImageDecoder.prototype.reconnect = function reconnect() {
    this._workerHelper.callFunction('reconnect');
};

WorkerProxyImageDecoder.prototype.alignParamsToTilesAndLevel = function alignParamsToTilesAndLevel(region) {
	return imageHelperFunctions.alignParamsToTilesAndLevel(region, this);
};

WorkerProxyImageDecoder.prototype._imageOpened = function imageOpened(data) {
    this._internalSizesParams = data.sizesParams;
    this._tileWidth = data.applicativeTileWidth;
    this._tileHeight = data.applicativeTileHeight;
    this._validateSizesCalculator();
};

WorkerProxyImageDecoder.prototype._getSizesParamsInternal = function getSizesParamsInternal() {
    return this._internalSizesParams;
};
},{"createimagedecoderonslaveside.js":14,"imagehelperfunctions.js":12,"imageparamsretrieverproxy.js":15,"sendimageparameterstomaster.js":16}],19:[function(require,module,exports){
'use strict';

// Suppress "Unnecessary directive 'use strict'" for the slaveScriptContent function
/*jshint -W034 */

/* global self: false */

module.exports = WorkerProxyPixelsDecoder;

var imageHelperFunctions = require('imagehelperfunctions.js');

var decoderSlaveScriptBlob = new Blob(
    ['(', decoderSlaveScriptBody.toString(), ')()'],
    { type: 'application/javascript' });
var decoderSlaveScriptUrl = URL.createObjectURL(decoderSlaveScriptBlob);

function WorkerProxyPixelsDecoder(options) {
    this._options = options || {};
    this._imageImplementation = imageHelperFunctions.getImageImplementation(
        options.imageImplementationClassName);
    
    var scriptsToImport = (this._options.scriptsToImport || []).concat([decoderSlaveScriptUrl]);
    var args = [this._options];
    
    this._workerHelper = new AsyncProxy.AsyncProxyMaster(
        scriptsToImport,
        'ArbitraryClassName',
        args);
}

WorkerProxyPixelsDecoder.prototype.decode = function decode(dataForDecode) {
    //var transferables = this._imageImplementation.getTransferableOfDecodeArguments(dataForDecode);
    var resultTransferables = [['data', 'buffer']];
    
    var args = [dataForDecode];
    var options = {
        //transferables: transferables,
        pathsToTransferablesInPromiseResult: resultTransferables,
        isReturnPromise: true
    };
    
    return this._workerHelper.callFunction('decode', args, options);
};

WorkerProxyPixelsDecoder.prototype.terminate = function terminate() {
    this._workerHelper.terminate();
};

function decoderSlaveScriptBody() {
    'use strict';

    AsyncProxy.AsyncProxySlave.setSlaveSideCreator(function createDecoder(options) {
        var imageImplementation = self[options.imageImplementationClassName];
        return imageImplementation.createPixelsDecoder();
    });
}
},{"imagehelperfunctions.js":12}],20:[function(require,module,exports){
'use strict';

module.exports = ViewerImageDecoder;

var ImageDecoder = require('imagedecoder.js');
var WorkerProxyImageDecoder = require('workerproxyimagedecoder.js');
var imageHelperFunctions = require('imagehelperfunctions.js');

var PENDING_CALL_TYPE_PIXELS_UPDATED = 1;
var PENDING_CALL_TYPE_REPOSITION = 2;

var REGION_OVERVIEW = 0;
var REGION_DYNAMIC = 1;

function ViewerImageDecoder(imageImplementationClassName, canvasUpdatedCallback, options) {
    this._imageImplementationClassName = imageImplementationClassName;
    this._canvasUpdatedCallback = canvasUpdatedCallback;
    
    this._adaptProportions = options.adaptProportions;
    this._cartographicBounds = options.cartographicBounds;
    this._isMainImageOnUi = options.isMainImageOnUi;
    this._showLog = options.showLog;
    this._allowMultipleChannelsInSession =
        options.allowMultipleChannelsInSession;
    this._minFunctionCallIntervalMilliseconds =
        options.minFunctionCallIntervalMilliseconds;
    this._overviewResolutionX = options.overviewResolutionX || 100;
    this._overviewResolutionY = options.overviewResolutionY || 100;
    this._workersLimit = options.workersLimit;
        
    this._lastRequestIndex = 0;
    this._pendingUpdateViewArea = null;
    this._regions = [];
    this._targetCanvas = null;
    
    this._callPendingCallbacksBound = this._callPendingCallbacks.bind(this);
    this._createdChannelBound = this._createdChannel.bind(this);
    
    this._pendingCallbacksIntervalHandle = 0;
    this._pendingCallbackCalls = [];
    this._canShowDynamicRegion = false;
    
    if (this._cartographicBounds === undefined) {
        this._cartographicBounds = {
            west: -175.0,
            east: 175.0,
            south: -85.0,
            north: 85.0
        };
    }
    
    if (this._adaptProportions === undefined) {
        this._adaptProportions = true;
    }
    
    var ImageType = this._isMainImageOnUi ?
        ImageDecoder: WorkerProxyImageDecoder;
        
    this._image = new ImageType(imageImplementationClassName, {
        serverRequestPrioritizer: 'frustumOnly',
        decodePrioritizer: 'frustumOnly',
        showLog: this._showLog,
        workersLimit: this._workersLimit
        });
}

ViewerImageDecoder.prototype.setExceptionCallback = function setExceptionCallback(exceptionCallback) {
    // TODO: Support exceptionCallback in every place needed
	this._exceptionCallback = exceptionCallback;
};
    
ViewerImageDecoder.prototype.open = function open(url) {
    return this._image.open(url)
        .then(this._opened.bind(this))
        .catch(this._exceptionCallback);
};

ViewerImageDecoder.prototype.close = function close() {
    var promise = this._image.close();
    promise.catch(this._exceptionCallback);
    this._isReady = false;
    this._canShowDynamicRegion = false;
    this._targetCanvas = null;
	return promise;
};

ViewerImageDecoder.prototype.setTargetCanvas = function setTargetCanvas(canvas) {
    this._targetCanvas = canvas;
};

ViewerImageDecoder.prototype.updateViewArea = function updateViewArea(frustumData) {
    if (this._targetCanvas === null) {
        throw 'Cannot update dynamic region before setTargetCanvas()';
    }
    
    if (!this._canShowDynamicRegion) {
        this._pendingUpdateViewArea = frustumData;
        
        return;
    }
    
    var bounds = frustumData.rectangle;
    var screenSize = frustumData.screenSize;
    
    var regionParams = {
        minX: bounds.west * this._scaleX + this._translateX,
        minY: bounds.north * this._scaleY + this._translateY,
        maxXExclusive: bounds.east * this._scaleX + this._translateX,
        maxYExclusive: bounds.south * this._scaleY + this._translateY,
        screenWidth: screenSize.x,
        screenHeight: screenSize.y
    };
    
    var alignedParams =
        imageHelperFunctions.alignParamsToTilesAndLevel(
            regionParams, this._image);
    
    var isOutsideScreen = alignedParams === null;
    if (isOutsideScreen) {
        return;
    }
    
    alignedParams.imagePartParams.quality = this._quality;

    var isSameRegion =
        this._dynamicFetchParams !== undefined &&
        this._isImagePartsEqual(
            alignedParams.imagePartParams,
            this._dynamicFetchParams.imagePartParams);
    
    if (isSameRegion) {
        return;
    }
    
    frustumData.imageRectangle = this._cartographicBoundsFixed;
    frustumData.exactlevel =
        alignedParams.imagePartParams.level;
    
    this._image.setDecodePrioritizerData(frustumData);
    this._image.setServerRequestPrioritizerData(frustumData);

    this._dynamicFetchParams = alignedParams;
    
    var startDynamicRegionOnTermination = false;
    var moveExistingChannel = !this._allowMultipleChannelsInSession;
    this._fetch(
        REGION_DYNAMIC,
        alignedParams,
        startDynamicRegionOnTermination,
        moveExistingChannel);
};

ViewerImageDecoder.prototype.getBounds = function getCartographicBounds() {
    if (!this._isReady) {
        throw 'ViewerImageDecoder error: Image is not ready yet';
    }
    return this._cartographicBoundsFixed;
};

ViewerImageDecoder.prototype._isImagePartsEqual = function isImagePartsEqual(first, second) {
    var isEqual =
        this._dynamicFetchParams !== undefined &&
        first.minX === second.minX &&
        first.minY === second.minY &&
        first.maxXExclusive === second.maxXExclusive &&
        first.maxYExclusive === second.maxYExclusive &&
        first.level === second.level;
    
    return isEqual;
};

ViewerImageDecoder.prototype._fetch = function fetch(
    regionId,
    fetchParams,
    startDynamicRegionOnTermination,
    moveExistingChannel) {
    
    var requestIndex = ++this._lastRequestIndex;
    
    var imagePartParams = fetchParams.imagePartParams;
    imagePartParams.requestPriorityData =
        imagePartParams.requestPriorityData || {};
    
    imagePartParams.requestPriorityData.requestIndex = requestIndex;

    var minX = fetchParams.positionInImage.minX;
    var minY = fetchParams.positionInImage.minY;
    var maxX = fetchParams.positionInImage.maxXExclusive;
    var maxY = fetchParams.positionInImage.maxYExclusive;
    
    var west = (minX - this._translateX) / this._scaleX;
    var east = (maxX - this._translateX) / this._scaleX;
    var north = (minY - this._translateY) / this._scaleY;
    var south = (maxY - this._translateY) / this._scaleY;
    
    var position = {
        west: west,
        east: east,
        north: north,
        south: south
    };
    
    var canReuseOldData = false;
    var fetchParamsNotNeeded;
    
    var region = this._regions[regionId];
    if (region !== undefined) {
        var newResolution = imagePartParams.level;
        var oldResolution = region.imagePartParams.level;
        
        canReuseOldData = newResolution === oldResolution;
        
        if (canReuseOldData && region.donePartParams) {
            fetchParamsNotNeeded = [ region.donePartParams ];
        }

        if (regionId !== REGION_OVERVIEW) {
            var addedPendingCall = this._checkIfRepositionNeeded(
                region, imagePartParams, position);
            
            if (addedPendingCall) {
                this._notifyNewPendingCalls();
            }
        }
    }
    
    var self = this;
    
    var channelHandle = moveExistingChannel ? this._channelHandle: undefined;

    this._image.requestPixelsProgressive(
        fetchParams.imagePartParams,
        callback,
        terminatedCallback,
        fetchParamsNotNeeded,
        channelHandle);
    
    function callback(decoded) {
        self._tilesDecodedCallback(
            regionId,
            fetchParams,
            position,
            decoded);
    }
    
    function terminatedCallback(isAborted) {
        if (isAborted &&
            imagePartParams.requestPriorityData.overrideHighestPriority) {
            
            // NOTE: Bug in kdu_server causes first request to be sent wrongly.
            // Then Chrome raises ERR_INVALID_CHUNKED_ENCODING and the request
            // never returns. Thus perform second request.
            
            self._image.requestPixelsProgressive(
                fetchParams.imagePartParams,
                callback,
                terminatedCallback,
                fetchParamsNotNeeded);
        }
        
        self._fetchTerminatedCallback(
            regionId,
            fetchParams.imagePartParams.requestPriorityData,
            isAborted,
            startDynamicRegionOnTermination);
    }
};

ViewerImageDecoder.prototype._fetchTerminatedCallback = function fetchTerminatedCallback(
    regionId, priorityData, isAborted, startDynamicRegionOnTermination) {
    
    var region = this._regions[regionId];
    if (region === undefined) {
        return;
    }
    
    if (!priorityData.overrideHighestPriority &&
        priorityData.requestIndex !== this._lastRequestIndex) {
    
        return;
    }
    
    region.isDone = !isAborted && this._isReady;
	if (region.isDone) {
		region.donePartParams = region.imagePartParams;
	}
    
    if (startDynamicRegionOnTermination) {
        this._image.createChannel(
            this._createdChannelBound);
    }
};

ViewerImageDecoder.prototype._createdChannel = function createdChannel(channelHandle) {
    this._channelHandle = channelHandle;
    this._startShowingDynamicRegion();
};

ViewerImageDecoder.prototype._startShowingDynamicRegion = function startShowingDynamicRegion() {
    this._canShowDynamicRegion = true;
    
    if (this._pendingUpdateViewArea !== null) {
        this.updateViewArea(this._pendingUpdateViewArea);
        
        this._pendingUpdateViewArea = null;
    }
};

ViewerImageDecoder.prototype._tilesDecodedCallback = function tilesDecodedCallback(
    regionId, fetchParams, position, decoded) {
    
    if (!this._isReady) {
        return;
    }
    
    var region = this._regions[regionId];
    if (region === undefined) {
        region = {};
        this._regions[regionId] = region;
        
        switch (regionId) {
            case REGION_DYNAMIC:
                region.canvas = this._targetCanvas;
                break;
                
            case REGION_OVERVIEW:
                region.canvas = document.createElement('canvas');
                break;
            
            default:
                throw 'Unexpected regionId ' + regionId;
        }
    }
    
    var partParams = fetchParams.imagePartParams;
    if (!partParams.requestPriorityData.overrideHighestPriority &&
        partParams.requestPriorityData.requestIndex < region.currentDisplayRequestIndex) {
        
        return;
    }
    
    this._checkIfRepositionNeeded(region, partParams, position);
        
    this._pendingCallbackCalls.push({
        type: PENDING_CALL_TYPE_PIXELS_UPDATED,
        region: region,
        decoded: decoded
    });
    
    this._notifyNewPendingCalls();
};

ViewerImageDecoder.prototype._checkIfRepositionNeeded = function checkIfRepositionNeeded(
    region, newPartParams, newPosition) {
    
    var oldPartParams = region.imagePartParams;
	var oldDonePartParams = region.donePartParams;
    var level = newPartParams.level;
    
    var needReposition =
        oldPartParams === undefined ||
        oldPartParams.minX !== newPartParams.minX ||
        oldPartParams.minY !== newPartParams.minY ||
        oldPartParams.maxXExclusive !== newPartParams.maxXExclusive ||
        oldPartParams.maxYExclusive !== newPartParams.maxYExclusive ||
        oldPartParams.level !== level;
    
    if (!needReposition) {
        return false;
    }
    
    var copyData;
    var intersection;
	var newDonePartParams;
    var reuseOldData = false;
    var scaleX;
    var scaleY;
    if (oldPartParams !== undefined) {
        scaleX = this._image.getLevelWidth (level) / this._image.getLevelWidth (oldPartParams.level);
        scaleY = this._image.getLevelHeight(level) / this._image.getLevelHeight(oldPartParams.level);
        
        intersection = {
            minX: Math.max(oldPartParams.minX * scaleX, newPartParams.minX),
            minY: Math.max(oldPartParams.minY * scaleY, newPartParams.minY),
            maxX: Math.min(oldPartParams.maxXExclusive * scaleX, newPartParams.maxXExclusive),
            maxY: Math.min(oldPartParams.maxYExclusive * scaleY, newPartParams.maxYExclusive)
        };
        reuseOldData =
            intersection.maxX > intersection.minX &&
            intersection.maxY > intersection.minY;
    }
    
    if (reuseOldData) {
        copyData = {
            fromX: intersection.minX / scaleX - oldPartParams.minX,
            fromY: intersection.minY / scaleY - oldPartParams.minY,
            fromWidth : (intersection.maxX - intersection.minX) / scaleX,
            fromHeight: (intersection.maxY - intersection.minY) / scaleY,
            toX: intersection.minX - newPartParams.minX,
            toY: intersection.minY - newPartParams.minY,
            toWidth : intersection.maxX - intersection.minX,
            toHeight: intersection.maxY - intersection.minY,
        };
	
		if (oldDonePartParams && oldPartParams.level === level) {
			newDonePartParams = {
				minX: Math.max(oldDonePartParams.minX, newPartParams.minX),
				minY: Math.max(oldDonePartParams.minY, newPartParams.minY),
				maxXExclusive: Math.min(oldDonePartParams.maxXExclusive, newPartParams.maxXExclusive),
				maxYExclusive: Math.min(oldDonePartParams.maxYExclusive, newPartParams.maxYExclusive)
			};
		}
	}
    
    region.imagePartParams = newPartParams;
    region.isDone = false;
    region.currentDisplayRequestIndex = newPartParams.requestPriorityData.requestIndex;
    
    var repositionArgs = {
        type: PENDING_CALL_TYPE_REPOSITION,
        region: region,
        position: newPosition,
		donePartParams: newDonePartParams,
        copyData: copyData,
        pixelsWidth: newPartParams.maxXExclusive - newPartParams.minX,
        pixelsHeight: newPartParams.maxYExclusive - newPartParams.minY
    };
    
    this._pendingCallbackCalls.push(repositionArgs);
    
    return true;
};

ViewerImageDecoder.prototype._notifyNewPendingCalls = function notifyNewPendingCalls() {
    if (!this._isNearCallbackCalled) {
        this._callPendingCallbacks();
    }
};

ViewerImageDecoder.prototype._callPendingCallbacks = function callPendingCallbacks() {
    if (this._pendingCallbackCalls.length === 0 || !this._isReady) {
        this._isNearCallbackCalled = false;
        return;
    }
    
    if (this._isNearCallbackCalled) {
        clearTimeout(this._pendingCallbacksIntervalHandle);
    }
    
    if (this._minFunctionCallIntervalMilliseconds !== undefined) {
        this._pendingCallbacksIntervalHandle =
            setTimeout(this._callPendingCallbacksBound,
            this._minFunctionCallIntervalMilliseconds);
            
        this._isNearCallbackCalled = true;
    }

    var newPosition = null;
    
    for (var i = 0; i < this._pendingCallbackCalls.length; ++i) {
        var callArgs = this._pendingCallbackCalls[i];
        
        if (callArgs.type === PENDING_CALL_TYPE_REPOSITION) {
            this._repositionCanvas(callArgs);
            newPosition = callArgs.position;
        } else if (callArgs.type === PENDING_CALL_TYPE_PIXELS_UPDATED) {
            this._pixelsUpdated(callArgs);
        } else {
            throw 'Internal ViewerImageDecoder Error: Unexpected call type ' +
                callArgs.type;
        }
    }
    
    this._pendingCallbackCalls.length = 0;
    
    this._canvasUpdatedCallback(newPosition);
};

ViewerImageDecoder.prototype._pixelsUpdated = function pixelsUpdated(pixelsUpdatedArgs) {
    var region = pixelsUpdatedArgs.region;
    var decoded = pixelsUpdatedArgs.decoded;
    if (decoded.imageData.width === 0 || decoded.imageData.height === 0) {
        return;
    }
    
    var x = decoded.xInOriginalRequest;
    var y = decoded.yInOriginalRequest;
    
    var context = region.canvas.getContext('2d');
    //var imageData = context.createImageData(decoded.width, decoded.height);
    //imageData.data.set(decoded.pixels);
    
    context.putImageData(decoded.imageData, x, y);
};

ViewerImageDecoder.prototype._repositionCanvas = function repositionCanvas(repositionArgs) {
    var region = repositionArgs.region;
    var position = repositionArgs.position;
	var donePartParams = repositionArgs.donePartParams;
    var copyData = repositionArgs.copyData;
    var pixelsWidth = repositionArgs.pixelsWidth;
    var pixelsHeight = repositionArgs.pixelsHeight;
    
    var imageDataToCopy;
    var context = region.canvas.getContext('2d');
    
    if (copyData !== undefined) {
        if (copyData.fromWidth === copyData.toWidth && copyData.fromHeight === copyData.toHeight) {
            imageDataToCopy = context.getImageData(
                copyData.fromX, copyData.fromY, copyData.fromWidth, copyData.fromHeight);
        } else {
            if (!this._tmpCanvas) {
                this._tmpCanvas = document.createElement('canvas');
                this._tmpCanvasContext = this._tmpCanvas.getContext('2d');
            }
            
            this._tmpCanvas.width  = copyData.toWidth;
            this._tmpCanvas.height = copyData.toHeight;
            this._tmpCanvasContext.drawImage(
                region.canvas,
                copyData.fromX, copyData.fromY, copyData.fromWidth, copyData.fromHeight,
                0, 0, copyData.toWidth, copyData.toHeight);
            
            imageDataToCopy = this._tmpCanvasContext.getImageData(
                0, 0, copyData.toWidth, copyData.toHeight);
        }
    }
    
    region.canvas.width = pixelsWidth;
    region.canvas.height = pixelsHeight;
    
    if (region !== this._regions[REGION_OVERVIEW]) {
        this._copyOverviewToCanvas(
            context, position, pixelsWidth, pixelsHeight);
    }
    
    if (copyData !== undefined) {
        context.putImageData(imageDataToCopy, copyData.toX, copyData.toY);
    }
    
    region.position = position;
	region.donePartParams = donePartParams;
};

ViewerImageDecoder.prototype._copyOverviewToCanvas = function copyOverviewToCanvas(
    context, canvasPosition, canvasPixelsWidth, canvasPixelsHeight) {
    
    var sourcePosition = this._regions[REGION_OVERVIEW].position;
    var sourcePixels =
        this._regions[REGION_OVERVIEW].imagePartParams;
    
    var sourcePixelsWidth =
        sourcePixels.maxXExclusive - sourcePixels.minX;
    var sourcePixelsHeight =
        sourcePixels.maxYExclusive - sourcePixels.minY;
    
    var sourcePositionWidth =
        sourcePosition.east - sourcePosition.west;
    var sourcePositionHeight =
        sourcePosition.north - sourcePosition.south;
        
    var sourceResolutionX =
        sourcePixelsWidth / sourcePositionWidth;
    var sourceResolutionY =
        sourcePixelsHeight / sourcePositionHeight;
    
    var targetPositionWidth =
        canvasPosition.east - canvasPosition.west;
    var targetPositionHeight =
        canvasPosition.north - canvasPosition.south;
        
    var cropWidth = targetPositionWidth * sourceResolutionX;
    var cropHeight = targetPositionHeight * sourceResolutionY;
    
    var cropOffsetPositionX =
        canvasPosition.west - sourcePosition.west;
    var cropOffsetPositionY =
        sourcePosition.north - canvasPosition.north;
        
    var cropPixelOffsetX = cropOffsetPositionX * sourceResolutionX;
    var cropPixelOffsetY = cropOffsetPositionY * sourceResolutionY;
    
    context.drawImage(
        this._regions[REGION_OVERVIEW].canvas,
        cropPixelOffsetX, cropPixelOffsetY, cropWidth, cropHeight,
        0, 0, canvasPixelsWidth, canvasPixelsHeight);
};

ViewerImageDecoder.prototype._opened = function opened() {
    this._isReady = true;
    
    var fixedBounds = {
        west: this._cartographicBounds.west,
        east: this._cartographicBounds.east,
        south: this._cartographicBounds.south,
        north: this._cartographicBounds.north
    };
    imageHelperFunctions.fixBounds(
        fixedBounds, this._image, this._adaptProportions);
    this._cartographicBoundsFixed = fixedBounds;
    
    var level = this._image.getImageLevel();
    var imageWidth = this._image.getLevelWidth(level);
    var imageHeight = this._image.getLevelHeight(level);
    this._quality = this._image.getHighestQuality();

    var rectangleWidth = fixedBounds.east - fixedBounds.west;
    var rectangleHeight = fixedBounds.north - fixedBounds.south;
    this._scaleX = imageWidth / rectangleWidth;
    this._scaleY = -imageHeight / rectangleHeight;
    
    this._translateX = -fixedBounds.west * this._scaleX;
    this._translateY = -fixedBounds.north * this._scaleY;
    
    var overviewParams = {
        minX: 0,
        minY: 0,
        maxXExclusive: imageWidth,
        maxYExclusive: imageHeight,
        screenWidth: this._overviewResolutionX,
        screenHeight: this._overviewResolutionY
    };
    
    var overviewAlignedParams =
        imageHelperFunctions.alignParamsToTilesAndLevel(
            overviewParams, this._image);
            
    overviewAlignedParams.imagePartParams.requestPriorityData =
        overviewAlignedParams.imagePartParams.requestPriorityData || {};
    
    overviewAlignedParams.imagePartParams.requestPriorityData.overrideHighestPriority = true;
    overviewAlignedParams.imagePartParams.quality = this._image.getLowestQuality();
    
    var startDynamicRegionOnTermination =
        !this._allowMultipleChannelsInSession;
        
    this._fetch(
        REGION_OVERVIEW,
        overviewAlignedParams,
        startDynamicRegionOnTermination);
    
    if (this._allowMultipleChannelsInSession) {
        this._startShowingDynamicRegion();
    }
};
},{"imagedecoder.js":5,"imagehelperfunctions.js":12,"workerproxyimagedecoder.js":18}],21:[function(require,module,exports){
'use strict';

module.exports.ViewerImageDecoder = require('viewerimagedecoder.js');
module.exports.ImageDecoder = require('imagedecoder.js');
module.exports.SimpleFetcher = require('simplefetcher.js');
module.exports.SimplePixelsDecoderBase = require('simplepixelsdecoderbase.js');
module.exports.CesiumImageDecoderLayerManager = require('_cesiumimagedecoderlayermanager.js');
module.exports.ImageDecoderImageryProvider = require('imagedecoderimageryprovider.js');
module.exports.ImageDecoderRegionLayer = require('imagedecoderregionlayer.js');
module.exports.Internals = {
    FetchManager: require('fetchmanager.js')
};
},{"_cesiumimagedecoderlayermanager.js":2,"fetchmanager.js":9,"imagedecoder.js":5,"imagedecoderimageryprovider.js":4,"imagedecoderregionlayer.js":22,"simplefetcher.js":25,"simplepixelsdecoderbase.js":28,"viewerimagedecoder.js":20}],22:[function(require,module,exports){
'use strict';

var ViewerImageDecoder = require('viewerimagedecoder.js');
var calculateLeafletFrustum = require('leafletfrustumcalculator.js');

/* global L: false */
/* global self: false */

if (self.L) {
    module.exports = L.Class.extend(createImageDecoderRegionLayerFunctions());
} else {
    module.exports = function() {
        throw new Error('Cannot instantiate ImageDecoderRegionLayer: No Leaflet namespace in scope');
    };
}

function createImageDecoderRegionLayerFunctions() {
    return {
        initialize: function initialize(options) {
            this._options = options || {};
            
            if (this._options.latLngBounds !== undefined) {
                this._options = JSON.parse(JSON.stringify(options));
                this._options.cartographicBounds = {
                    west: options.latLngBounds.getWest(),
                    east: options.latLngBounds.getEast(),
                    south: options.latLngBounds.getSouth(),
                    north: options.latLngBounds.getNorth()
                };
            }
            
            this._targetCanvas = null;
            this._canvasPosition = null;
            this._canvasUpdatedCallbackBound = this._canvasUpdatedCallback.bind(this);
            this._image = null;
            this._exceptionCallback = null;
        },
        
        setExceptionCallback: function setExceptionCallback(exceptionCallback) {
            this._exceptionCallback = exceptionCallback;
            if (this._image !== null) {
                this._image.setExceptionCallback(exceptionCallback);
            }
        },
        
        _createImage: function createImage() {
            if (this._image === null) {
                this._image = new ViewerImageDecoder(
                    this._options.imageImplementationClassName,
                    this._canvasUpdatedCallbackBound,
                    this._options);
                
                if (this._exceptionCallback !== null) {
                    this._image.setExceptionCallback(this._exceptionCallback);
                }
                
                this._image.open(this._options.url);
            }
        },

        onAdd: function onAdd(map) {
            if (this._map !== undefined) {
                throw 'Cannot add this layer to two maps';
            }
            
            this._map = map;
            this._createImage();

            // create a DOM element and put it into one of the map panes
            this._targetCanvas = L.DomUtil.create(
                'canvas', 'image-decoder-layer-canvas leaflet-zoom-animated');
            
            this._image.setTargetCanvas(this._targetCanvas);
            
            this._canvasPosition = null;
                
            map.getPanes().mapPane.appendChild(this._targetCanvas);

            // add a viewreset event listener for updating layer's position, do the latter
            map.on('viewreset', this._moved, this);
            map.on('move', this._moved, this);

            if (L.Browser.any3d) {
                map.on('zoomanim', this._animateZoom, this);
            }

            this._moved();
        },

        onRemove: function onRemove(map) {
            if (map !== this._map) {
                throw 'Removed from wrong map';
            }
            
            map.off('viewreset', this._moved, this);
            map.off('move', this._moved, this);
            map.off('zoomanim', this._animateZoom, this);
            
            // remove layer's DOM elements and listeners
            map.getPanes().mapPane.removeChild(this._targetCanvas);
            this._targetCanvas = null;
            this._canvasPosition = null;

            this._map = undefined;
            
            this._image.close();
            this._image = null;
        },
        
        _moved: function () {
            this._moveCanvases();

            var frustumData = calculateLeafletFrustum(this._map);
            
            this._image.updateViewArea(frustumData);
        },
        
        _canvasUpdatedCallback: function canvasUpdatedCallback(newPosition) {
            if (newPosition !== null) {
                this._canvasPosition = newPosition;
                this._moveCanvases();
            }
        },
        
        _moveCanvases: function moveCanvases() {
            if (this._canvasPosition === null) {
                return;
            }
        
            // update layer's position
            var west = this._canvasPosition.west;
            var east = this._canvasPosition.east;
            var south = this._canvasPosition.south;
            var north = this._canvasPosition.north;
            
            var topLeft = this._map.latLngToLayerPoint([north, west]);
            var bottomRight = this._map.latLngToLayerPoint([south, east]);
            var size = bottomRight.subtract(topLeft);
            
            L.DomUtil.setPosition(this._targetCanvas, topLeft);
            this._targetCanvas.style.width = size.x + 'px';
            this._targetCanvas.style.height = size.y + 'px';
        },
        
        _animateZoom: function animateZoom(options) {
            // NOTE: All method (including using of private method
            // _latLngToNewLayerPoint) was copied from ImageOverlay,
            // as Leaflet documentation recommends.
            
            var west =  this._canvasPosition.west;
            var east =  this._canvasPosition.east;
            var south = this._canvasPosition.south;
            var north = this._canvasPosition.north;

            var topLeft = this._map._latLngToNewLayerPoint(
                [north, west], options.zoom, options.center);
            var bottomRight = this._map._latLngToNewLayerPoint(
                [south, east], options.zoom, options.center);
            
            var scale = this._map.getZoomScale(options.zoom);
            var size = bottomRight.subtract(topLeft);
            var sizeScaled = size.multiplyBy((1 / 2) * (1 - 1 / scale));
            var origin = topLeft.add(sizeScaled);
            
            this._targetCanvas.style[L.DomUtil.TRANSFORM] =
                L.DomUtil.getTranslateString(origin) + ' scale(' + scale + ') ';
        }
    };
}
},{"leafletfrustumcalculator.js":23,"viewerimagedecoder.js":20}],23:[function(require,module,exports){
'use strict';

var imageHelperFunctions = require('imagehelperfunctions.js');

module.exports = function calculateLeafletFrustum(leafletMap) {
    var screenSize = leafletMap.getSize();
    var bounds = leafletMap.getBounds();

    var cartographicBounds = {
        west: bounds.getWest(),
        east: bounds.getEast(),
        south: bounds.getSouth(),
        north: bounds.getNorth()
    };
    
    var frustumData = imageHelperFunctions.calculateFrustum2DFromBounds(
        cartographicBounds, screenSize);

    return frustumData;
};
},{"imagehelperfunctions.js":12}],24:[function(require,module,exports){
'use strict';

module.exports = DataPublisher;

var LinkedList = require('linkedlist.js');
var HashMap = require('hashmap.js');

function DataPublisher(hasher) {
    this._subscribersByKey = new HashMap(hasher);
}

DataPublisher.prototype.publish = function publish(key, data, fetchEnded) {
    var subscribers = this._subscribersByKey.getFromKey(key);
    if (!subscribers) {
        return;
    }
    
    var iterator = subscribers.subscribersList.getFirstIterator();
    var listeners = [];
    while (iterator !== null) {
        var subscriber = subscribers.subscribersList.getValue(iterator);
	
		if (!subscriber.isEnded) {
			listeners.push(subscriber.listener);
			if (fetchEnded) {
				--subscribers.subscribersNotEndedCount;
				subscriber.isEnded = true;
			}
		}
        
        iterator = subscribers.subscribersList.getNextIterator(iterator);
    }
    
    // Call only after collecting all listeners, so the list will not be destroyed while iterating
    for (var i = 0; i < listeners.length; ++i) {
        listeners[i].call(this, key, data, fetchEnded);
    }
};

DataPublisher.prototype.subscribe = function subscribe(key, subscriber) {
    var subscribers = this._subscribersByKey.tryAdd(key, function() {
        return {
            subscribersList: new LinkedList(),
            subscribersNotEndedCount: 0
        };
    });
    
    ++subscribers.value.subscribersNotEndedCount;
    
    var listIterator = subscribers.value.subscribersList.add({
        listener: subscriber,
        isEnded: false
    });
    
    var handle = {
        _listIterator: listIterator,
        _hashIterator: subscribers.iterator
    };
    return handle;
};

DataPublisher.prototype.unsubscribe = function unsubscribe(handle) {
    var subscribers = this._subscribersByKey.getFromIterator(handle._hashIterator);
    
    var subscriber = subscribers.subscribersList.getValue(handle._listIterator);
    subscribers.subscribersList.remove(handle._listIterator);
    if (subscribers.subscribersList.getCount() === 0) {
        this._subscribersByKey.remove(handle._hashIterator);
    } else if (!subscriber.isEnded) {
        --subscribers.subscribersNotEndedCount;
        subscriber.isEnded = true;
    }
};

DataPublisher.prototype.isKeyNeedFetch = function isKeyNeedFetch(key) {
    var subscribers = this._subscribersByKey.getFromKey(key);
    return (!!subscribers) && (subscribers.subscribersNotEndedCount > 0);
};
},{"hashmap.js":11,"linkedlist.js":13}],25:[function(require,module,exports){
'use strict';

module.exports = SimpleFetcher;

var SimpleImageDataContext = require('simpleimagedatacontext.js');
var SimpleNonProgressiveFetchHandle = require('simplenonprogressivefetchhandle.js');
var DataPublisher = require('datapublisher.js');

/* global Promise: false */

function SimpleFetcher(fetcherMethods, options) {
    this._url = null;
    this._fetcherMethods = fetcherMethods;
    this._options = options || {};
    this._isReady = true;
    
    if (!this._fetcherMethods.getDataKeys) {
        throw 'SimpleFetcher error: getDataKeys is not implemented';
    }
    if (!this._fetcherMethods.fetch && !this._fetcherMethods.fetchProgressive) {
        throw 'SimpleFetcher error: Neither fetch nor fetchProgressive methods are implemented';
    }
    
    if (!this._fetcherMethods.getHashCode) {
        throw 'SimpleFetcher error: getHashCode is not implemented';
    }
    if (!this._fetcherMethods.isEqual) {
        throw 'SimpleFetcher error: isEqual is not implemented';
    }

    this._hasher = {
        _fetcherMethods: this._fetcherMethods,
        getHashCode: function(dataKey) {
            return this._fetcherMethods.getHashCode(dataKey);
        },
        isEqual: function(key1, key2) {
            if (key1.maxQuality !== key2.maxQuality) {
                return false;
            }

            return this._fetcherMethods.isEqual(key1.dataKey, key2.dataKey);
        }
    };

    if (this._fetcherMethods.createDataPublisher) {
        this._dataPublisher = this.fetcherMethods.createDataPublisher(this._hasher);
    } else {
        this._dataPublisher = new DataPublisher(this._hasher);
    }
}

SimpleFetcher.prototype.fetchProgressive = function fetchProgressive(imagePartParams, dataKeys, dataCallback, queryIsKeyNeedFetch, maxQuality) {
    this._ensureReady();
    if (!this._fetcherMethods.fetchProgressive) {
        var fetchHandle = new SimpleNonProgressiveFetchHandle(this._fetcherMethods, dataCallback, queryIsKeyNeedFetch, this._options);
        fetchHandle.fetch(dataKeys);
        return fetchHandle;
    }
    
    return this._fetcherMethods.fetchProgressive(imagePartParams, dataKeys, dataCallback, queryIsKeyNeedFetch, maxQuality);
};

SimpleFetcher.prototype.reconnect = function reconnect() {
    this._ensureReady();
    if (!this._fetcherMethods.reconnect) {
        throw 'SimpleFetcher error: reconnect is not implemented';
    }
    this._fetcherMethods.reconnect();
};

// Fetcher implementation

SimpleFetcher.prototype.createImageDataContext = function createImageDataContext(
    imagePartParams) {
    
    this._ensureReady();
    var dataKeys = this._fetcherMethods.getDataKeys(imagePartParams);
    return new SimpleImageDataContext(dataKeys, imagePartParams, this._dataPublisher, this._hasher);
};

SimpleFetcher.prototype.fetch = function fetch(imageDataContext) {
	var maxQuality = imageDataContext.getMaxQuality();
	var self = this;
	
	function dataCallback(dataKey, data, isFetchEnded) {
		var key = {
			dataKey: dataKey,
			maxQuality: maxQuality
		};
		self._dataPublisher.publish(key, data, isFetchEnded);
	}
	
	function queryIsKeyNeedFetch(dataKey) {
		var key = {
			dataKey: dataKey,
			maxQuality: maxQuality
		};
		return self._dataPublisher.isKeyNeedFetch(key);
	}
	
	return this.fetchProgressive(imageDataContext.getImagePartParams(), imageDataContext.getDataKeys(), dataCallback, queryIsKeyNeedFetch, maxQuality);
};

SimpleFetcher.prototype.startMovableFetch = function startMovableFetch(imageDataContext, movableFetchState) {
	movableFetchState.fetchHandle = this.fetch(imageDataContext);
};

SimpleFetcher.prototype.moveFetch = function moveFetch(imageDataContext, movableFetchState) {
	movableFetchState.fetchHandle.abortAsync();
	movableFetchState.fetchHandle = this.fetch(imageDataContext);
};

SimpleFetcher.prototype.close = function close(closedCallback) {
    this._ensureReady();
    this._isReady = false;
    return new Promise(function(resolve, reject) {
        // NOTE: Wait for all fetchHandles to finish?
        resolve();
    });
};

SimpleFetcher.prototype._ensureReady = function ensureReady() {
    if (!this._isReady) {
        throw 'SimpleFetcher error: fetch client is not opened';
    }
};

},{"datapublisher.js":24,"simpleimagedatacontext.js":26,"simplenonprogressivefetchhandle.js":27}],26:[function(require,module,exports){
'use strict';

module.exports = SimpleImageDataContext;

var HashMap = require('hashmap.js');

function SimpleImageDataContext(dataKeys, imagePartParams, dataPublisher, hasher) {
    this._dataByKey = new HashMap(hasher);
    this._dataToReturn = {
        imagePartParams: JSON.parse(JSON.stringify(imagePartParams)),
        fetchedItems: []
    };
	this._maxQuality = imagePartParams.quality;
    this._fetchEndedCount = 0;
	this._fetchedLowQualityCount = 0;
    this._dataListeners = [];
    this._dataKeys = dataKeys;
    this._imagePartParams = imagePartParams;
    this._dataPublisher = dataPublisher;
	this._isProgressive = false;
	this._isDisposed = false;
    
    this._subscribeHandles = [];
    
    var dataFetchedBound = this._dataFetched.bind(this);
    for (var i = 0; i < dataKeys.length; ++i) {
        var subscribeHandle = this._dataPublisher.subscribe(
			{ dataKey: dataKeys[i], maxQuality: this._maxQuality },
			dataFetchedBound);
        
        this._subscribeHandles.push(subscribeHandle);
    }
}

// Not part of ImageDataContext interface, only service for SimpleFetcher
SimpleImageDataContext.prototype.getMaxQuality = function getMaxQuality() {
	return this._maxQuality;
};

SimpleImageDataContext.prototype.getDataKeys = function getDataKeys() {
    return this._dataKeys;
};

SimpleImageDataContext.prototype.getImagePartParams = function getImagePartParams() {
    return this._imagePartParams;
};

SimpleImageDataContext.prototype.hasData = function hasData() {
    return this._fetchedLowQualityCount == this._dataKeys.length;
};

SimpleImageDataContext.prototype.getFetchedData = function getFetchedData() {
    if (!this.hasData()) {
        throw 'SimpleImageDataContext error: cannot call getFetchedData before hasData = true';
    }
    
    return this._dataToReturn;
};

SimpleImageDataContext.prototype.on = function on(event, listener) {
	if (this._isDisposed) {
		throw 'Cannot register to event on disposed ImageDataContext';
	}
    if (event !== 'data') {
        throw 'SimpleImageDataContext error: Unexpected event ' + event;
    }
    
    this._dataListeners.push(listener);
};

SimpleImageDataContext.prototype.isDone = function isDone() {
    return this._fetchEndedCount === this._dataKeys.length;
};

SimpleImageDataContext.prototype.dispose = function dispose() {
	this._isDisposed = true;
    for (var i = 0; i < this._subscribeHandles.length; ++i) {
        this._dataPublisher.unsubscribe(this._subscribeHandles[i]);
    }
    
    this._subscribeHandles = [];
	this._dataListeners = [];
};

SimpleImageDataContext.prototype.setIsProgressive = function setIsProgressive(isProgressive) {
	var oldIsProgressive = this._isProgressive;
    this._isProgressive = isProgressive;
	if (!oldIsProgressive && isProgressive && this.hasData()) {
		for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i](this);
        }
	}
};

SimpleImageDataContext.prototype._dataFetched = function dataFetched(key, data, fetchEnded) {
	if (this._isDisposed) {
		throw 'Unexpected dataFetched listener call on disposed ImageDataContext';
	}

	var self = this;
	var added = this._dataByKey.tryAdd(key, function() {
		// Executed if new item
        self._dataToReturn.fetchedItems.push({
            key: key.dataKey,
            data: data
        });
		++self._fetchedLowQualityCount;
		return {
			fetchEnded: false,
			fetchedItemsOffset: self._dataToReturn.fetchedItems.length - 1
		};
	});
	
    if (added.value.fetchEnded) {
		// Already fetched full quality, nothing to refresh
		return;
	}
	
	this._dataToReturn.fetchedItems[added.value.fetchedItemsOffset].data = data;
	if (fetchEnded)
	{
		added.value.fetchEnded = true;
        ++this._fetchEndedCount;
    }
    
    if (this.isDone() || (this.hasData() && this._isProgressive)) {
        for (var i = 0; i < this._dataListeners.length; ++i) {
            this._dataListeners[i](this);
        }
    }
};
},{"hashmap.js":11}],27:[function(require,module,exports){
'use strict';

module.exports = SimpleNonProgressiveFetchHandle;

/* global Promise: false */

function SimpleNonProgressiveFetchHandle(fetchMethods, dataCallback, queryIsKeyNeedFetch, options) {
    this._fetchMethods = fetchMethods;
	this._dataCallback = dataCallback;
    this._queryIsKeyNeedFetch = queryIsKeyNeedFetch;
    this._fetchLimit = (options || {}).fetchLimitPerFetcher || 2;
    this._keysToFetch = null;
    this._nextKeyToFetch = 0;
    this._activeFetches = {};
    this._activeFetchesCount = 0;
    this._isAborted = false;
    this._isStoppedCalled = false;
    this._resolveAbort = null;
}

SimpleNonProgressiveFetchHandle.prototype.fetch = function fetch(keys) {
    if (this._keysToFetch !== null) {
        throw 'SimpleNonProgressiveFetchHandle error: Request fetcher can fetch only one region';
    }
    
    this._keysToFetch = keys;
    this._nextKeyToFetch = 0;
    while (this._activeFetchesCount < this._fetchLimit) {
        if (!this._fetchSingleKey()) {
            break;
        }
    }
};

SimpleNonProgressiveFetchHandle.prototype.abortAsync = function abortAsync() {
    var self = this;
    return new Promise(function(resolve, reject) {
        if (self._activeFetchesCount === 0) {
            resolve();
        } else {
            this._resolveAbort = resolve;
        }
    });
};

SimpleNonProgressiveFetchHandle.prototype._fetchSingleKey = function fetchSingleKey() {
    var key;
    do {
        if (this._nextKeyToFetch >= this._keysToFetch.length) {
            return false;
        }
        key = this._keysToFetch[this._nextKeyToFetch++];
    } while (!this._queryIsKeyNeedFetch(key));
    
    var self = this;
    this._activeFetches[key] = true;
    ++this._activeFetchesCount;
    
    this._fetchMethods.fetch(key)
        .then(function resolved(result) {
            self._dataCallback(key, result, /*fetchEnded=*/true);
            self._fetchEnded(null, key, result);
        }).catch(function failed(reason) {
            //self._fetchClient._onError(reason);
            self._fetchEnded(reason, key);
        });
    
    return true;
};

SimpleNonProgressiveFetchHandle.prototype._fetchEnded = function fetchEnded(error, key, result) {
    delete this._activeFetches[key];
    --this._activeFetchesCount;
    
    if (!this._resolveAbort) {
        this._fetchSingleKey();
    } else if (this._activeFetchesCount === 0) {
        this._resolveAbort();
        this._resolveAbort = null;
    }
};
},{}],28:[function(require,module,exports){
'use strict';

module.exports = SimplePixelsDecoderBase;

/* global Promise : false */
/* global ImageData : false */

function SimplePixelsDecoderBase() {
    SimplePixelsDecoderBase.prototype.decode = function decode(fetchedData) {
        var imagePartParams = fetchedData.imagePartParams;
        var width  = imagePartParams.maxXExclusive - imagePartParams.minX;
        var height = imagePartParams.maxYExclusive - imagePartParams.minY;
        var result = new ImageData(width, height);
        var promises = [];
        for (var i = 0; i < fetchedData.fetchedItems.length; ++i) {
            promises.push(this.decodeRegion(result, imagePartParams.minX, imagePartParams.minY, fetchedData.fetchedItems[i].key, fetchedData.fetchedItems[i].data));
        }
        
        return Promise.all(promises).then(function() {
            return result;
        });
    };
    
    SimplePixelsDecoderBase.prototype.decodeRegion = function decodeRegion(targetImageData, imagePartParams, key, fetchedData) {
        throw 'SimplePixelsDecoderBase error: decodeRegion is not implemented';
    };
}
},{}]},{},[21])(21)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvY2VzaXVtaW1hZ2VkZWNvZGVyL19jZXNpdW1mcnVzdHVtY2FsY3VsYXRvci5qcyIsInNyYy9jZXNpdW1pbWFnZWRlY29kZXIvX2Nlc2l1bWltYWdlZGVjb2RlcmxheWVybWFuYWdlci5qcyIsInNyYy9jZXNpdW1pbWFnZWRlY29kZXIvY2FudmFzaW1hZ2VyeXByb3ZpZGVyLmpzIiwic3JjL2Nlc2l1bWltYWdlZGVjb2Rlci9pbWFnZWRlY29kZXJpbWFnZXJ5cHJvdmlkZXIuanMiLCJzcmMvaW1hZ2VkZWNvZGVyL2ltYWdlZGVjb2Rlci5qcyIsInNyYy9pbWFnZWRlY29kZXIvaW1hZ2VkZWNvZGVyaGVscGVycy9kZWNvZGVqb2IuanMiLCJzcmMvaW1hZ2VkZWNvZGVyL2ltYWdlZGVjb2RlcmhlbHBlcnMvZGVjb2Rlam9ic3Bvb2wuanMiLCJzcmMvaW1hZ2VkZWNvZGVyL2ltYWdlZGVjb2RlcmhlbHBlcnMvZmV0Y2hqb2IuanMiLCJzcmMvaW1hZ2VkZWNvZGVyL2ltYWdlZGVjb2RlcmhlbHBlcnMvZmV0Y2htYW5hZ2VyLmpzIiwic3JjL2ltYWdlZGVjb2Rlci9pbWFnZWRlY29kZXJoZWxwZXJzL2ZydXN0dW1yZXF1ZXN0c3ByaW9yaXRpemVyLmpzIiwic3JjL2ltYWdlZGVjb2Rlci9pbWFnZWRlY29kZXJoZWxwZXJzL2hhc2htYXAuanMiLCJzcmMvaW1hZ2VkZWNvZGVyL2ltYWdlZGVjb2RlcmhlbHBlcnMvaW1hZ2VoZWxwZXJmdW5jdGlvbnMuanMiLCJzcmMvaW1hZ2VkZWNvZGVyL2ltYWdlZGVjb2RlcmhlbHBlcnMvbGlua2VkbGlzdC5qcyIsInNyYy9pbWFnZWRlY29kZXIvaW1hZ2VkZWNvZGVyd29ya2Vycy9jcmVhdGVpbWFnZWRlY29kZXJvbnNsYXZlc2lkZS5qcyIsInNyYy9pbWFnZWRlY29kZXIvaW1hZ2VkZWNvZGVyd29ya2Vycy9pbWFnZXBhcmFtc3JldHJpZXZlcnByb3h5LmpzIiwic3JjL2ltYWdlZGVjb2Rlci9pbWFnZWRlY29kZXJ3b3JrZXJzL3NlbmRpbWFnZXBhcmFtZXRlcnN0b21hc3Rlci5qcyIsInNyYy9pbWFnZWRlY29kZXIvaW1hZ2VkZWNvZGVyd29ya2Vycy93b3JrZXJwcm94eWZldGNobWFuYWdlci5qcyIsInNyYy9pbWFnZWRlY29kZXIvaW1hZ2VkZWNvZGVyd29ya2Vycy93b3JrZXJwcm94eWltYWdlZGVjb2Rlci5qcyIsInNyYy9pbWFnZWRlY29kZXIvaW1hZ2VkZWNvZGVyd29ya2Vycy93b3JrZXJwcm94eXBpeGVsc2RlY29kZXIuanMiLCJzcmMvaW1hZ2VkZWNvZGVyL3ZpZXdlcmltYWdlZGVjb2Rlci5qcyIsInNyYy9pbWFnZWRlY29kZXJleHBvcnRzLmpzIiwic3JjL2xlYWZsZXRpbWFnZWRlY29kZXIvaW1hZ2VkZWNvZGVycmVnaW9ubGF5ZXIuanMiLCJzcmMvbGVhZmxldGltYWdlZGVjb2Rlci9sZWFmbGV0ZnJ1c3R1bWNhbGN1bGF0b3IuanMiLCJzcmMvc2ltcGxlZmV0Y2hlci9kYXRhcHVibGlzaGVyLmpzIiwic3JjL3NpbXBsZWZldGNoZXIvc2ltcGxlZmV0Y2hlci5qcyIsInNyYy9zaW1wbGVmZXRjaGVyL3NpbXBsZWltYWdlZGF0YWNvbnRleHQuanMiLCJzcmMvc2ltcGxlZmV0Y2hlci9zaW1wbGVub25wcm9ncmVzc2l2ZWZldGNoaGFuZGxlLmpzIiwic3JjL3NpbXBsZWZldGNoZXIvc2ltcGxlcGl4ZWxzZGVjb2RlcmJhc2UuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4bEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL1VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9LQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcG9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gY2FsY3VsYXRlRnJ1c3R1bTtcclxuXHJcbi8qIGdsb2JhbCBDZXNpdW06IGZhbHNlICovXHJcblxyXG52YXIgaW1hZ2VIZWxwZXJGdW5jdGlvbnMgPSByZXF1aXJlKCdpbWFnZWhlbHBlcmZ1bmN0aW9ucy5qcycpO1xyXG5cclxudmFyIE1BWF9SRUNVUlNJVkVfTEVWRUxfT05fRkFJTEVEX1RSQU5TRk9STSA9IDQ7XHJcblxyXG5mdW5jdGlvbiBjYWxjdWxhdGVGcnVzdHVtKGNlc2l1bVdpZGdldCkge1xyXG4gICAgdmFyIHNjcmVlblNpemUgPSB7XHJcbiAgICAgICAgeDogY2VzaXVtV2lkZ2V0LnNjZW5lLmNhbnZhcy53aWR0aCxcclxuICAgICAgICB5OiBjZXNpdW1XaWRnZXQuc2NlbmUuY2FudmFzLmhlaWdodFxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdmFyIHBvaW50cyA9IFtdO1xyXG4gICAgc2VhcmNoQm91bmRpbmdQb2ludHMoXHJcbiAgICAgICAgMCwgMCwgc2NyZWVuU2l6ZS54LCBzY3JlZW5TaXplLnksIHBvaW50cywgY2VzaXVtV2lkZ2V0LCAvKnJlY3Vyc2l2ZT0qLzApO1xyXG5cclxuICAgIHZhciBmcnVzdHVtUmVjdGFuZ2xlID0gQ2VzaXVtLlJlY3RhbmdsZS5mcm9tQ2FydG9ncmFwaGljQXJyYXkocG9pbnRzKTtcclxuICAgIGlmIChmcnVzdHVtUmVjdGFuZ2xlLmVhc3QgPCBmcnVzdHVtUmVjdGFuZ2xlLndlc3QgfHwgZnJ1c3R1bVJlY3RhbmdsZS5ub3J0aCA8IGZydXN0dW1SZWN0YW5nbGUuc291dGgpIHtcclxuICAgICAgICBmcnVzdHVtUmVjdGFuZ2xlID0ge1xyXG4gICAgICAgICAgICBlYXN0OiBNYXRoLm1heChmcnVzdHVtUmVjdGFuZ2xlLmVhc3QsIGZydXN0dW1SZWN0YW5nbGUud2VzdCksXHJcbiAgICAgICAgICAgIHdlc3Q6IE1hdGgubWluKGZydXN0dW1SZWN0YW5nbGUuZWFzdCwgZnJ1c3R1bVJlY3RhbmdsZS53ZXN0KSxcclxuICAgICAgICAgICAgbm9ydGg6IE1hdGgubWF4KGZydXN0dW1SZWN0YW5nbGUubm9ydGgsIGZydXN0dW1SZWN0YW5nbGUuc291dGgpLFxyXG4gICAgICAgICAgICBzb3V0aDogTWF0aC5taW4oZnJ1c3R1bVJlY3RhbmdsZS5ub3J0aCwgZnJ1c3R1bVJlY3RhbmdsZS5zb3V0aClcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBmcnVzdHVtRGF0YSA9IGltYWdlSGVscGVyRnVuY3Rpb25zLmNhbGN1bGF0ZUZydXN0dW0yREZyb21Cb3VuZHMoXHJcbiAgICAgICAgZnJ1c3R1bVJlY3RhbmdsZSwgc2NyZWVuU2l6ZSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgIHJldHVybiBmcnVzdHVtRGF0YTtcclxufVxyXG4gICAgXHJcbmZ1bmN0aW9uIHNlYXJjaEJvdW5kaW5nUG9pbnRzKFxyXG4gICAgbWluWCwgbWluWSwgbWF4WCwgbWF4WSwgcG9pbnRzLCBjZXNpdW1XaWRnZXQsIHJlY3Vyc2l2ZUxldmVsKSB7XHJcbiAgICBcclxuICAgIHZhciB0cmFuc2Zvcm1lZFBvaW50cyA9IDA7XHJcbiAgICB0cmFuc2Zvcm1lZFBvaW50cyArPSB0cmFuc2Zvcm1BbmRBZGRQb2ludChcclxuICAgICAgICBtaW5YLCBtaW5ZLCBjZXNpdW1XaWRnZXQsIHBvaW50cyk7XHJcbiAgICB0cmFuc2Zvcm1lZFBvaW50cyArPSB0cmFuc2Zvcm1BbmRBZGRQb2ludChcclxuICAgICAgICBtYXhYLCBtaW5ZLCBjZXNpdW1XaWRnZXQsIHBvaW50cyk7XHJcbiAgICB0cmFuc2Zvcm1lZFBvaW50cyArPSB0cmFuc2Zvcm1BbmRBZGRQb2ludChcclxuICAgICAgICBtaW5YLCBtYXhZLCBjZXNpdW1XaWRnZXQsIHBvaW50cyk7XHJcbiAgICB0cmFuc2Zvcm1lZFBvaW50cyArPSB0cmFuc2Zvcm1BbmRBZGRQb2ludChcclxuICAgICAgICBtYXhYLCBtYXhZLCBjZXNpdW1XaWRnZXQsIHBvaW50cyk7XHJcblxyXG4gICAgdmFyIG1heExldmVsID0gTUFYX1JFQ1VSU0lWRV9MRVZFTF9PTl9GQUlMRURfVFJBTlNGT1JNO1xyXG4gICAgXHJcbiAgICBpZiAodHJhbnNmb3JtZWRQb2ludHMgPT09IDQgfHwgcmVjdXJzaXZlTGV2ZWwgPj0gbWF4TGV2ZWwpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgICsrcmVjdXJzaXZlTGV2ZWw7XHJcbiAgICBcclxuICAgIHZhciBtaWRkbGVYID0gKG1pblggKyBtYXhYKSAvIDI7XHJcbiAgICB2YXIgbWlkZGxlWSA9IChtaW5ZICsgbWF4WSkgLyAyO1xyXG4gICAgXHJcbiAgICBzZWFyY2hCb3VuZGluZ1BvaW50cyhcclxuICAgICAgICBtaW5YLCBtaW5ZLCBtaWRkbGVYLCBtaWRkbGVZLCBwb2ludHMsIGNlc2l1bVdpZGdldCwgcmVjdXJzaXZlTGV2ZWwpO1xyXG5cclxuICAgIHNlYXJjaEJvdW5kaW5nUG9pbnRzKFxyXG4gICAgICAgIG1pblgsIG1pZGRsZVksIG1pZGRsZVgsIG1heFksIHBvaW50cywgY2VzaXVtV2lkZ2V0LCByZWN1cnNpdmVMZXZlbCk7XHJcblxyXG4gICAgc2VhcmNoQm91bmRpbmdQb2ludHMoXHJcbiAgICAgICAgbWlkZGxlWCwgbWluWSwgbWF4WCwgbWlkZGxlWSwgcG9pbnRzLCBjZXNpdW1XaWRnZXQsIHJlY3Vyc2l2ZUxldmVsKTtcclxuXHJcbiAgICBzZWFyY2hCb3VuZGluZ1BvaW50cyhcclxuICAgICAgICBtaWRkbGVYLCBtaWRkbGVZLCBtYXhYLCBtYXhZLCBwb2ludHMsIGNlc2l1bVdpZGdldCwgcmVjdXJzaXZlTGV2ZWwpO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0cmFuc2Zvcm1BbmRBZGRQb2ludCh4LCB5LCBjZXNpdW1XaWRnZXQsIHBvaW50cykge1xyXG4gICAgXHJcbiAgICB2YXIgc2NyZWVuUG9pbnQgPSBuZXcgQ2VzaXVtLkNhcnRlc2lhbjIoeCwgeSk7XHJcbiAgICB2YXIgZWxsaXBzb2lkID0gY2VzaXVtV2lkZ2V0LnNjZW5lLm1hcFByb2plY3Rpb24uZWxsaXBzb2lkO1xyXG4gICAgdmFyIHBvaW50M0QgPSBjZXNpdW1XaWRnZXQuc2NlbmUuY2FtZXJhLnBpY2tFbGxpcHNvaWQoc2NyZWVuUG9pbnQsIGVsbGlwc29pZCk7XHJcbiAgICBcclxuICAgIGlmIChwb2ludDNEID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICByZXR1cm4gMDtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgY2FydGVzaWFuID0gZWxsaXBzb2lkLmNhcnRlc2lhblRvQ2FydG9ncmFwaGljKHBvaW50M0QpO1xyXG4gICAgaWYgKGNhcnRlc2lhbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHBvaW50cy5wdXNoKGNhcnRlc2lhbik7XHJcbiAgICByZXR1cm4gMTtcclxufSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQ2VzaXVtSW1hZ2VEZWNvZGVyTGF5ZXJNYW5hZ2VyO1xyXG5cclxudmFyIENhbnZhc0ltYWdlcnlQcm92aWRlciA9IHJlcXVpcmUoJ2NhbnZhc2ltYWdlcnlwcm92aWRlci5qcycpO1xyXG52YXIgVmlld2VySW1hZ2VEZWNvZGVyID0gcmVxdWlyZSgndmlld2VyaW1hZ2VkZWNvZGVyLmpzJyk7XHJcbnZhciBjYWxjdWxhdGVDZXNpdW1GcnVzdHVtID0gcmVxdWlyZSgnX2Nlc2l1bWZydXN0dW1jYWxjdWxhdG9yLmpzJyk7XHJcblxyXG4vKiBnbG9iYWwgQ2VzaXVtOiBmYWxzZSAqL1xyXG5cclxuZnVuY3Rpb24gQ2VzaXVtSW1hZ2VEZWNvZGVyTGF5ZXJNYW5hZ2VyKGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUsIG9wdGlvbnMpIHtcclxuICAgIHRoaXMuX29wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fb3B0aW9ucy5yZWN0YW5nbGUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRoaXMuX29wdGlvbnMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdGlvbnMpKTtcclxuICAgICAgICB0aGlzLl9vcHRpb25zLmNhcnRvZ3JhcGhpY0JvdW5kcyA9IHtcclxuICAgICAgICAgICAgd2VzdDogb3B0aW9ucy5yZWN0YW5nbGUud2VzdCxcclxuICAgICAgICAgICAgZWFzdDogb3B0aW9ucy5yZWN0YW5nbGUuZWFzdCxcclxuICAgICAgICAgICAgc291dGg6IG9wdGlvbnMucmVjdGFuZ2xlLnNvdXRoLFxyXG4gICAgICAgICAgICBub3J0aDogb3B0aW9ucy5yZWN0YW5nbGUubm9ydGhcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLl9vcHRpb25zLm1pbkZ1bmN0aW9uQ2FsbEludGVydmFsTWlsbGlzZWNvbmRzID1cclxuICAgICAgICBvcHRpb25zLm1pbkZ1bmN0aW9uQ2FsbEludGVydmFsTWlsbGlzZWNvbmRzIHx8IDEwMDtcclxuICAgIHRoaXMuX3VybCA9IG9wdGlvbnMudXJsO1xyXG5cclxuICAgIHRoaXMuX3RhcmdldENhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xyXG4gICAgdGhpcy5faW1hZ2VyeVByb3ZpZGVycyA9IFtcclxuICAgICAgICBuZXcgQ2FudmFzSW1hZ2VyeVByb3ZpZGVyKHRoaXMuX3RhcmdldENhbnZhcyksXHJcbiAgICAgICAgbmV3IENhbnZhc0ltYWdlcnlQcm92aWRlcih0aGlzLl90YXJnZXRDYW52YXMpXHJcbiAgICBdO1xyXG4gICAgdGhpcy5faW1hZ2VyeUxheWVyU2hvd24gPSBuZXcgQ2VzaXVtLkltYWdlcnlMYXllcih0aGlzLl9pbWFnZXJ5UHJvdmlkZXJzWzBdKTtcclxuICAgIHRoaXMuX2ltYWdlcnlMYXllclBlbmRpbmcgPSBuZXcgQ2VzaXVtLkltYWdlcnlMYXllcih0aGlzLl9pbWFnZXJ5UHJvdmlkZXJzWzFdKTtcclxuXHJcbiAgICB0aGlzLl9jYW52YXNVcGRhdGVkQ2FsbGJhY2tCb3VuZCA9IHRoaXMuX2NhbnZhc1VwZGF0ZWRDYWxsYmFjay5iaW5kKHRoaXMpO1xyXG4gICAgXHJcbiAgICB0aGlzLl9pc1BlbmRpbmdVcGRhdGVDYWxsYmFjayA9IGZhbHNlO1xyXG4gICAgdGhpcy5faXNXaGlsZVJlcGxhY2VMYXllclNob3duID0gZmFsc2U7XHJcbiAgICB0aGlzLl9wZW5kaW5nUG9zaXRpb25SZWN0YW5nbGUgPSBudWxsO1xyXG4gICAgXHJcbiAgICB0aGlzLl9pbWFnZSA9IG5ldyBWaWV3ZXJJbWFnZURlY29kZXIoXHJcbiAgICAgICAgaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSxcclxuICAgICAgICB0aGlzLl9jYW52YXNVcGRhdGVkQ2FsbGJhY2tCb3VuZCxcclxuICAgICAgICB0aGlzLl9vcHRpb25zKTtcclxuICAgIFxyXG4gICAgdGhpcy5faW1hZ2Uuc2V0VGFyZ2V0Q2FudmFzKHRoaXMuX3RhcmdldENhbnZhcyk7XHJcbiAgICBcclxuICAgIHRoaXMuX3VwZGF0ZUZydXN0dW1Cb3VuZCA9IHRoaXMuX3VwZGF0ZUZydXN0dW0uYmluZCh0aGlzKTtcclxuICAgIHRoaXMuX3Bvc3RSZW5kZXJCb3VuZCA9IHRoaXMuX3Bvc3RSZW5kZXIuYmluZCh0aGlzKTtcclxufVxyXG5cclxuQ2VzaXVtSW1hZ2VEZWNvZGVyTGF5ZXJNYW5hZ2VyLnByb3RvdHlwZS5zZXRFeGNlcHRpb25DYWxsYmFjayA9IGZ1bmN0aW9uIHNldEV4Y2VwdGlvbkNhbGxiYWNrKGV4Y2VwdGlvbkNhbGxiYWNrKSB7XHJcbiAgICB0aGlzLl9pbWFnZS5zZXRFeGNlcHRpb25DYWxsYmFjayhleGNlcHRpb25DYWxsYmFjayk7XHJcbn07XHJcblxyXG5DZXNpdW1JbWFnZURlY29kZXJMYXllck1hbmFnZXIucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbiBvcGVuKHdpZGdldE9yVmlld2VyKSB7XHJcbiAgICB0aGlzLl93aWRnZXQgPSB3aWRnZXRPclZpZXdlcjtcclxuICAgIHRoaXMuX2xheWVycyA9IHdpZGdldE9yVmlld2VyLnNjZW5lLmltYWdlcnlMYXllcnM7XHJcbiAgICB3aWRnZXRPclZpZXdlci5zY2VuZS5wb3N0UmVuZGVyLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5fcG9zdFJlbmRlckJvdW5kKTtcclxuICAgIFxyXG4gICAgdGhpcy5faW1hZ2Uub3Blbih0aGlzLl91cmwpO1xyXG4gICAgdGhpcy5fbGF5ZXJzLmFkZCh0aGlzLl9pbWFnZXJ5TGF5ZXJTaG93bik7XHJcbiAgICBcclxuICAgIC8vIE5PVEU6IElzIHRoZXJlIGFuIGV2ZW50IGhhbmRsZXIgdG8gcmVnaXN0ZXIgaW5zdGVhZD9cclxuICAgIC8vIChDZXNpdW0ncyBldmVudCBjb250cm9sbGVycyBvbmx5IGV4cG9zZSBrZXlib2FyZCBhbmQgbW91c2VcclxuICAgIC8vIGV2ZW50cywgYnV0IHRoZXJlIGlzIG5vIGV2ZW50IGZvciBmcnVzdHVtIGNoYW5nZWRcclxuICAgIC8vIHByb2dyYW1tYXRpY2FsbHkpLlxyXG4gICAgdGhpcy5faW50ZXJ2YWxIYW5kbGUgPSBzZXRJbnRlcnZhbChcclxuICAgICAgICB0aGlzLl91cGRhdGVGcnVzdHVtQm91bmQsXHJcbiAgICAgICAgNTAwKTtcclxufTtcclxuXHJcbkNlc2l1bUltYWdlRGVjb2RlckxheWVyTWFuYWdlci5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiBjbG9zZSgpIHtcclxuICAgIHRoaXMuX2ltYWdlLmNsb3NlKCk7XHJcbiAgICBjbGVhckludGVydmFsKHRoaXMuX2ludGVydmFsSGFuZGxlKTtcclxuXHJcbiAgICB0aGlzLl9sYXllcnMucmVtb3ZlKHRoaXMuX2ltYWdlcnlMYXllclNob3duKTtcclxuICAgIHRoaXMuX3dpZGdldC5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuX3Bvc3RSZW5kZXJCb3VuZCk7XHJcbiAgICBpZiAodGhpcy5faXNXaGlsZVJlcGxhY2VMYXllclNob3duKSB7XHJcbiAgICAgICAgdGhpcy5faXNXaGlsZVJlcGxhY2VMYXllclNob3duID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5faXNQZW5kaW5nVXBkYXRlQ2FsbGJhY2sgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLl9sYXllcnMucmVtb3ZlKHRoaXMuX2ltYWdlcnlMYXllclBlbmRpbmcpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuQ2VzaXVtSW1hZ2VEZWNvZGVyTGF5ZXJNYW5hZ2VyLnByb3RvdHlwZS5nZXRJbWFnZXJ5TGF5ZXJzID0gZnVuY3Rpb24gZ2V0SW1hZ2VyeUxheWVycygpIHtcclxuICAgIHJldHVybiBbdGhpcy5faW1hZ2VyeUxheWVyU2hvd24sIHRoaXMuX2ltYWdlcnlMYXllclBlbmRpbmddO1xyXG59O1xyXG5cclxuQ2VzaXVtSW1hZ2VEZWNvZGVyTGF5ZXJNYW5hZ2VyLnByb3RvdHlwZS5fdXBkYXRlRnJ1c3R1bSA9IGZ1bmN0aW9uIHVwZGF0ZUZydXN0dW0oKSB7XHJcbiAgICB2YXIgZnJ1c3R1bSA9IGNhbGN1bGF0ZUNlc2l1bUZydXN0dW0odGhpcy5fd2lkZ2V0KTtcclxuICAgIGlmIChmcnVzdHVtICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5faW1hZ2UudXBkYXRlVmlld0FyZWEoZnJ1c3R1bSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5DZXNpdW1JbWFnZURlY29kZXJMYXllck1hbmFnZXIucHJvdG90eXBlLl9jYW52YXNVcGRhdGVkQ2FsbGJhY2sgPSBmdW5jdGlvbiBjYW52YXNVcGRhdGVkQ2FsbGJhY2sobmV3UG9zaXRpb24pIHtcclxuICAgIGlmICh0aGlzLl9pc1doaWxlUmVwbGFjZUxheWVyU2hvd24pIHtcclxuICAgICAgICB0aGlzLl9pc1BlbmRpbmdVcGRhdGVDYWxsYmFjayA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5fcGVuZGluZ1Bvc2l0aW9uUmVjdGFuZ2xlID0gbmV3UG9zaXRpb247XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChuZXdQb3NpdGlvbiAhPT0gbnVsbCkge1xyXG4gICAgICAgIHZhciByZWN0YW5nbGUgPSBuZXcgQ2VzaXVtLlJlY3RhbmdsZShcclxuICAgICAgICAgICAgbmV3UG9zaXRpb24ud2VzdCxcclxuICAgICAgICAgICAgbmV3UG9zaXRpb24uc291dGgsXHJcbiAgICAgICAgICAgIG5ld1Bvc2l0aW9uLmVhc3QsXHJcbiAgICAgICAgICAgIG5ld1Bvc2l0aW9uLm5vcnRoKTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLl9pbWFnZXJ5UHJvdmlkZXJzWzBdLnNldFJlY3RhbmdsZShyZWN0YW5nbGUpO1xyXG4gICAgICAgIHRoaXMuX2ltYWdlcnlQcm92aWRlcnNbMV0uc2V0UmVjdGFuZ2xlKHJlY3RhbmdsZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX3JlbW92ZUFuZFJlQWRkTGF5ZXIoKTtcclxufTtcclxuXHJcbkNlc2l1bUltYWdlRGVjb2RlckxheWVyTWFuYWdlci5wcm90b3R5cGUuX3JlbW92ZUFuZFJlQWRkTGF5ZXIgPSBmdW5jdGlvbiByZW1vdmVBbmRSZUFkZExheWVyKCkge1xyXG4gICAgdmFyIGluZGV4ID0gdGhpcy5fbGF5ZXJzLmluZGV4T2YodGhpcy5faW1hZ2VyeUxheWVyU2hvd24pO1xyXG4gICAgXHJcbiAgICBpZiAoaW5kZXggPCAwKSB7XHJcbiAgICAgICAgdGhyb3cgJ0xheWVyIHdhcyByZW1vdmVkIGZyb20gdmlld2VyXFwncyBsYXllcnMgIHdpdGhvdXQgJyArXHJcbiAgICAgICAgICAgICdjbG9zaW5nIGxheWVyIG1hbmFnZXIuIFVzZSBDZXNpdW1JbWFnZURlY29kZXJMYXllck1hbmFnZXIuJyArXHJcbiAgICAgICAgICAgICdjbG9zZSgpIGluc3RlYWQnO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLl9pc1doaWxlUmVwbGFjZUxheWVyU2hvd24gPSB0cnVlO1xyXG4gICAgdGhpcy5fbGF5ZXJzLmFkZCh0aGlzLl9pbWFnZXJ5TGF5ZXJQZW5kaW5nLCBpbmRleCk7XHJcbn07XHJcblxyXG5DZXNpdW1JbWFnZURlY29kZXJMYXllck1hbmFnZXIucHJvdG90eXBlLl9wb3N0UmVuZGVyID0gZnVuY3Rpb24gcG9zdFJlbmRlcigpIHtcclxuICAgIGlmICghdGhpcy5faXNXaGlsZVJlcGxhY2VMYXllclNob3duKVxyXG4gICAgICAgIHJldHVybjtcclxuICAgIFxyXG4gICAgdGhpcy5faXNXaGlsZVJlcGxhY2VMYXllclNob3duID0gZmFsc2U7XHJcbiAgICB0aGlzLl9sYXllcnMucmVtb3ZlKHRoaXMuX2ltYWdlcnlMYXllclNob3duLCAvKmRlc3Ryb3k9Ki9mYWxzZSk7XHJcbiAgICBcclxuICAgIHZhciBzd2FwID0gdGhpcy5faW1hZ2VyeUxheWVyU2hvd247XHJcbiAgICB0aGlzLl9pbWFnZXJ5TGF5ZXJTaG93biA9IHRoaXMuX2ltYWdlcnlMYXllclBlbmRpbmc7XHJcbiAgICB0aGlzLl9pbWFnZXJ5TGF5ZXJQZW5kaW5nID0gc3dhcDtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2lzUGVuZGluZ1VwZGF0ZUNhbGxiYWNrKSB7XHJcbiAgICAgICAgdGhpcy5faXNQZW5kaW5nVXBkYXRlQ2FsbGJhY2sgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLl9jYW52YXNVcGRhdGVkQ2FsbGJhY2sodGhpcy5fcGVuZGluZ1Bvc2l0aW9uUmVjdGFuZ2xlKTtcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENhbnZhc0ltYWdlcnlQcm92aWRlcjtcclxuXHJcbi8qIGdsb2JhbCBDZXNpdW06IGZhbHNlICovXHJcbi8qIGdsb2JhbCBEZXZlbG9wZXJFcnJvcjogZmFsc2UgKi9cclxuLyogZ2xvYmFsIENyZWRpdDogZmFsc2UgKi9cclxuXHJcbi8qKlxyXG4gKiBQcm92aWRlcyBhIFNpbmdsZSBDYW52YXMgaW1hZ2VyeSB0aWxlLiAgVGhlIGltYWdlIGlzIGFzc3VtZWQgdG8gdXNlIGFcclxuICoge0BsaW5rIEdlb2dyYXBoaWNUaWxpbmdTY2hlbWV9LlxyXG4gKlxyXG4gKiBAYWxpYXMgQ2FudmFzSW1hZ2VyeVByb3ZpZGVyXHJcbiAqIEBjb25zdHJ1Y3RvclxyXG4gKlxyXG4gKiBAcGFyYW0ge2NhbnZhc30gQ2FudmFzIGZvciB0aGUgdGlsZS5cclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT2JqZWN0IHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxyXG4gKiBAcGFyYW0ge0NyZWRpdHxTdHJpbmd9IFtvcHRpb25zLmNyZWRpdF0gQSBjcmVkaXQgZm9yIHRoZSBkYXRhIHNvdXJjZSwgd2hpY2ggaXMgZGlzcGxheWVkIG9uIHRoZSBjYW52YXMuXHJcbiAqXHJcbiAqIEBzZWUgQXJjR2lzTWFwU2VydmVySW1hZ2VyeVByb3ZpZGVyXHJcbiAqIEBzZWUgQmluZ01hcHNJbWFnZXJ5UHJvdmlkZXJcclxuICogQHNlZSBHb29nbGVFYXJ0aEltYWdlcnlQcm92aWRlclxyXG4gKiBAc2VlIE9wZW5TdHJlZXRNYXBJbWFnZXJ5UHJvdmlkZXJcclxuICogQHNlZSBUaWxlTWFwU2VydmljZUltYWdlcnlQcm92aWRlclxyXG4gKiBAc2VlIFdlYk1hcFNlcnZpY2VJbWFnZXJ5UHJvdmlkZXJcclxuICovXHJcbmZ1bmN0aW9uIENhbnZhc0ltYWdlcnlQcm92aWRlcihjYW52YXMsIG9wdGlvbnMpIHtcclxuICAgIGlmIChvcHRpb25zID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBvcHRpb25zID0ge307XHJcbiAgICB9XHJcblxyXG4gICAgLy8+PmluY2x1ZGVTdGFydCgnZGVidWcnLCBwcmFnbWFzLmRlYnVnKTtcclxuICAgIGlmIChjYW52YXMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRocm93IG5ldyBEZXZlbG9wZXJFcnJvcignY2FudmFzIGlzIHJlcXVpcmVkLicpO1xyXG4gICAgfVxyXG4gICAgLy8+PmluY2x1ZGVFbmQoJ2RlYnVnJyk7XHJcblxyXG4gICAgdGhpcy5fY2FudmFzID0gY2FudmFzO1xyXG5cclxuICAgIHRoaXMuX2Vycm9yRXZlbnQgPSBuZXcgRXZlbnQoJ0NhbnZhc0ltYWdlcnlQcm92aWRlclN0YXR1cycpO1xyXG5cclxuICAgIHRoaXMuX3JlYWR5ID0gZmFsc2U7XHJcblxyXG4gICAgdmFyIGNyZWRpdCA9IG9wdGlvbnMuY3JlZGl0O1xyXG4gICAgaWYgKHR5cGVvZiBjcmVkaXQgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgY3JlZGl0ID0gbmV3IENyZWRpdChjcmVkaXQpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5fY3JlZGl0ID0gY3JlZGl0O1xyXG59XHJcblxyXG5DYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlID0ge1xyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSB3aWR0aCBvZiBlYWNoIHRpbGUsIGluIHBpeGVscy4gVGhpcyBmdW5jdGlvbiBzaG91bGRcclxuICAgICAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBDYW52YXNJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEBtZW1iZXJvZiBDYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7TnVtYmVyfVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCB0aWxlV2lkdGgoKSB7XHJcbiAgICAgICAgICAgIC8vPj5pbmNsdWRlU3RhcnQoJ2RlYnVnJywgcHJhZ21hcy5kZWJ1Zyk7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5fcmVhZHkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRGV2ZWxvcGVyRXJyb3IoJ3RpbGVXaWR0aCBtdXN0IG5vdCBiZSBjYWxsZWQgYmVmb3JlIHRoZSBpbWFnZXJ5IHByb3ZpZGVyIGlzIHJlYWR5LicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vPj5pbmNsdWRlRW5kKCdkZWJ1ZycpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NhbnZhcy53aWR0aDtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBoZWlnaHQgb2YgZWFjaCB0aWxlLCBpbiBwaXhlbHMuICBUaGlzIGZ1bmN0aW9uIHNob3VsZFxyXG4gICAgICogbm90IGJlIGNhbGxlZCBiZWZvcmUge0BsaW5rIENhbnZhc0ltYWdlcnlQcm92aWRlciNyZWFkeX0gcmV0dXJucyB0cnVlLlxyXG4gICAgICogQG1lbWJlcm9mIENhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtOdW1iZXJ9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IHRpbGVIZWlnaHQoKSB7XHJcbiAgICAgICAgICAgIC8vPj5pbmNsdWRlU3RhcnQoJ2RlYnVnJywgcHJhZ21hcy5kZWJ1Zyk7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5fcmVhZHkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRGV2ZWxvcGVyRXJyb3IoJ3RpbGVIZWlnaHQgbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS4nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLz4+aW5jbHVkZUVuZCgnZGVidWcnKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jYW52YXMuaGVpZ2h0O1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIG1heGltdW0gbGV2ZWwtb2YtZGV0YWlsIHRoYXQgY2FuIGJlIHJlcXVlc3RlZC4gIFRoaXMgZnVuY3Rpb24gc2hvdWxkXHJcbiAgICAgKiBub3QgYmUgY2FsbGVkIGJlZm9yZSB7QGxpbmsgQ2FudmFzSW1hZ2VyeVByb3ZpZGVyI3JlYWR5fSByZXR1cm5zIHRydWUuXHJcbiAgICAgKiBAbWVtYmVyb2YgQ2FudmFzSW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZVxyXG4gICAgICogQHR5cGUge051bWJlcn1cclxuICAgICAqIEByZWFkb25seVxyXG4gICAgICovXHJcbiAgICBnZXQgbWF4aW11bUxldmVsKCkge1xyXG4gICAgICAgICAgICAvLz4+aW5jbHVkZVN0YXJ0KCdkZWJ1ZycsIHByYWdtYXMuZGVidWcpO1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuX3JlYWR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCdtYXhpbXVtTGV2ZWwgbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS4nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLz4+aW5jbHVkZUVuZCgnZGVidWcnKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIG1pbmltdW0gbGV2ZWwtb2YtZGV0YWlsIHRoYXQgY2FuIGJlIHJlcXVlc3RlZC4gIFRoaXMgZnVuY3Rpb24gc2hvdWxkXHJcbiAgICAgKiBub3QgYmUgY2FsbGVkIGJlZm9yZSB7QGxpbmsgQ2FudmFzSW1hZ2VyeVByb3ZpZGVyI3JlYWR5fSByZXR1cm5zIHRydWUuXHJcbiAgICAgKiBAbWVtYmVyb2YgQ2FudmFzSW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZVxyXG4gICAgICogQHR5cGUge051bWJlcn1cclxuICAgICAqIEByZWFkb25seVxyXG4gICAgICovXHJcbiAgICBnZXQgbWluaW11bUxldmVsKCkge1xyXG4gICAgICAgICAgICAvLz4+aW5jbHVkZVN0YXJ0KCdkZWJ1ZycsIHByYWdtYXMuZGVidWcpO1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuX3JlYWR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCdtaW5pbXVtTGV2ZWwgbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS4nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLz4+aW5jbHVkZUVuZCgnZGVidWcnKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIHRpbGluZyBzY2hlbWUgdXNlZCBieSB0aGlzIHByb3ZpZGVyLiAgVGhpcyBmdW5jdGlvbiBzaG91bGRcclxuICAgICAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBDYW52YXNJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEBtZW1iZXJvZiBDYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7VGlsaW5nU2NoZW1lfVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCB0aWxpbmdTY2hlbWUoKSB7XHJcbiAgICAgICAgICAgIC8vPj5pbmNsdWRlU3RhcnQoJ2RlYnVnJywgcHJhZ21hcy5kZWJ1Zyk7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5fcmVhZHkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRGV2ZWxvcGVyRXJyb3IoJ3RpbGluZ1NjaGVtZSBtdXN0IG5vdCBiZSBjYWxsZWQgYmVmb3JlIHRoZSBpbWFnZXJ5IHByb3ZpZGVyIGlzIHJlYWR5LicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vPj5pbmNsdWRlRW5kKCdkZWJ1ZycpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbGluZ1NjaGVtZTtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSByZWN0YW5nbGUsIGluIHJhZGlhbnMsIG9mIHRoZSBpbWFnZXJ5IHByb3ZpZGVkIGJ5IHRoaXMgaW5zdGFuY2UuICBUaGlzIGZ1bmN0aW9uIHNob3VsZFxyXG4gICAgICogbm90IGJlIGNhbGxlZCBiZWZvcmUge0BsaW5rIENhbnZhc0ltYWdlcnlQcm92aWRlciNyZWFkeX0gcmV0dXJucyB0cnVlLlxyXG4gICAgICogQG1lbWJlcm9mIENhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtSZWN0YW5nbGV9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IHJlY3RhbmdsZSgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3RpbGluZ1NjaGVtZS5yZWN0YW5nbGU7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGlsZSBkaXNjYXJkIHBvbGljeS4gIElmIG5vdCB1bmRlZmluZWQsIHRoZSBkaXNjYXJkIHBvbGljeSBpcyByZXNwb25zaWJsZVxyXG4gICAgICogZm9yIGZpbHRlcmluZyBvdXQgXCJtaXNzaW5nXCIgdGlsZXMgdmlhIGl0cyBzaG91bGREaXNjYXJkSW1hZ2UgZnVuY3Rpb24uICBJZiB0aGlzIGZ1bmN0aW9uXHJcbiAgICAgKiByZXR1cm5zIHVuZGVmaW5lZCwgbm8gdGlsZXMgYXJlIGZpbHRlcmVkLiAgVGhpcyBmdW5jdGlvbiBzaG91bGRcclxuICAgICAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBDYW52YXNJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEBtZW1iZXJvZiBDYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7VGlsZURpc2NhcmRQb2xpY3l9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IHRpbGVEaXNjYXJkUG9saWN5KCkge1xyXG4gICAgICAgICAgICAvLz4+aW5jbHVkZVN0YXJ0KCdkZWJ1ZycsIHByYWdtYXMuZGVidWcpO1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuX3JlYWR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCd0aWxlRGlzY2FyZFBvbGljeSBtdXN0IG5vdCBiZSBjYWxsZWQgYmVmb3JlIHRoZSBpbWFnZXJ5IHByb3ZpZGVyIGlzIHJlYWR5LicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vPj5pbmNsdWRlRW5kKCdkZWJ1ZycpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGFuIGV2ZW50IHRoYXQgaXMgcmFpc2VkIHdoZW4gdGhlIGltYWdlcnkgcHJvdmlkZXIgZW5jb3VudGVycyBhbiBhc3luY2hyb25vdXMgZXJyb3IuICBCeSBzdWJzY3JpYmluZ1xyXG4gICAgICogdG8gdGhlIGV2ZW50LCB5b3Ugd2lsbCBiZSBub3RpZmllZCBvZiB0aGUgZXJyb3IgYW5kIGNhbiBwb3RlbnRpYWxseSByZWNvdmVyIGZyb20gaXQuICBFdmVudCBsaXN0ZW5lcnNcclxuICAgICAqIGFyZSBwYXNzZWQgYW4gaW5zdGFuY2Ugb2Yge0BsaW5rIFRpbGVQcm92aWRlckVycm9yfS5cclxuICAgICAqIEBtZW1iZXJvZiBDYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7RXZlbnR9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IGVycm9yRXZlbnQoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9lcnJvckV2ZW50O1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSB2YWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRoZSBwcm92aWRlciBpcyByZWFkeSBmb3IgdXNlLlxyXG4gICAgICogQG1lbWJlcm9mIENhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtCb29sZWFufVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCByZWFkeSgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JlYWR5O1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNyZWRpdCB0byBkaXNwbGF5IHdoZW4gdGhpcyBpbWFnZXJ5IHByb3ZpZGVyIGlzIGFjdGl2ZS4gIFR5cGljYWxseSB0aGlzIGlzIHVzZWQgdG8gY3JlZGl0XHJcbiAgICAgKiB0aGUgc291cmNlIG9mIHRoZSBpbWFnZXJ5LiAgVGhpcyBmdW5jdGlvbiBzaG91bGQgbm90IGJlIGNhbGxlZCBiZWZvcmUge0BsaW5rIENhbnZhc0ltYWdlcnlQcm92aWRlciNyZWFkeX0gcmV0dXJucyB0cnVlLlxyXG4gICAgICogQG1lbWJlcm9mIENhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtDcmVkaXR9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IGNyZWRpdCgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NyZWRpdDtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgdmFsdWUgaW5kaWNhdGluZyB3aGV0aGVyIG9yIG5vdCB0aGUgaW1hZ2VzIHByb3ZpZGVkIGJ5IHRoaXMgaW1hZ2VyeSBwcm92aWRlclxyXG4gICAgICogaW5jbHVkZSBhbiBhbHBoYSBjaGFubmVsLiAgSWYgdGhpcyBwcm9wZXJ0eSBpcyBmYWxzZSwgYW4gYWxwaGEgY2hhbm5lbCwgaWYgcHJlc2VudCwgd2lsbFxyXG4gICAgICogYmUgaWdub3JlZC4gIElmIHRoaXMgcHJvcGVydHkgaXMgdHJ1ZSwgYW55IGltYWdlcyB3aXRob3V0IGFuIGFscGhhIGNoYW5uZWwgd2lsbCBiZSB0cmVhdGVkXHJcbiAgICAgKiBhcyBpZiB0aGVpciBhbHBoYSBpcyAxLjAgZXZlcnl3aGVyZS4gIFdoZW4gdGhpcyBwcm9wZXJ0eSBpcyBmYWxzZSwgbWVtb3J5IHVzYWdlXHJcbiAgICAgKiBhbmQgdGV4dHVyZSB1cGxvYWQgdGltZSBhcmUgcmVkdWNlZC5cclxuICAgICAqIEBtZW1iZXJvZiBDYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7Qm9vbGVhbn1cclxuICAgICAqIEByZWFkb25seVxyXG4gICAgICovXHJcbiAgICBnZXQgaGFzQWxwaGFDaGFubmVsKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxufTtcclxuXHJcbkNhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuc2V0UmVjdGFuZ2xlID0gZnVuY3Rpb24gc2V0UmVjdGFuZ2xlKHJlY3RhbmdsZSkge1xyXG4gICAgXHJcbiAgICB0aGlzLl90aWxpbmdTY2hlbWUgPSBuZXcgQ2VzaXVtLkdlb2dyYXBoaWNUaWxpbmdTY2hlbWUoe1xyXG4gICAgICAgIHJlY3RhbmdsZTogcmVjdGFuZ2xlLFxyXG4gICAgICAgIG51bWJlck9mTGV2ZWxaZXJvVGlsZXNYOiAxLFxyXG4gICAgICAgIG51bWJlck9mTGV2ZWxaZXJvVGlsZXNZOiAxXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLl9yZWFkeSkge1xyXG4gICAgICAgIHRoaXMuX3JlYWR5ID0gdHJ1ZTtcclxuICAgICAgICBDZXNpdW0uVGlsZVByb3ZpZGVyRXJyb3IuaGFuZGxlU3VjY2Vzcyh0aGlzLl9lcnJvckV2ZW50KTtcclxuICAgIH1cclxufTtcclxuXHJcbkNhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0VGlsZVdpZHRoID0gZnVuY3Rpb24gZ2V0VGlsZVdpZHRoKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudGlsZVdpZHRoO1xyXG59O1xyXG5cclxuQ2FudmFzSW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5nZXRUaWxlSGVpZ2h0ID0gZnVuY3Rpb24gZ2V0VGlsZUhlaWdodCgpIHtcclxuICAgIHJldHVybiB0aGlzLnRpbGVIZWlnaHQ7XHJcbn07XHJcblxyXG5DYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldE1heGltdW1MZXZlbCA9IGZ1bmN0aW9uIGdldE1heGltdW1MZXZlbCgpIHtcclxuICAgIHJldHVybiB0aGlzLm1heGltdW1MZXZlbDtcclxufTtcclxuXHJcbkNhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0TWluaW11bUxldmVsID0gZnVuY3Rpb24gZ2V0TWluaW11bUxldmVsKCkge1xyXG4gICAgcmV0dXJuIHRoaXMubWluaW11bUxldmVsO1xyXG59O1xyXG5cclxuQ2FudmFzSW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5pc1JlYWR5ID0gZnVuY3Rpb24gaXNSZWFkeSgpIHtcclxuICAgIHJldHVybiB0aGlzLnJlYWR5O1xyXG59O1xyXG5cclxuQ2FudmFzSW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5nZXRDcmVkaXQgPSBmdW5jdGlvbiBnZXRDcmVkaXQoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5jcmVkaXQ7XHJcbn07XHJcblxyXG5DYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldFJlY3RhbmdsZSA9IGZ1bmN0aW9uIGdldFJlY3RhbmdsZSgpIHtcclxuICAgIHJldHVybiB0aGlzLnRpbGluZ1NjaGVtZS5yZWN0YW5nbGU7XHJcbn07XHJcblxyXG5DYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldFRpbGluZ1NjaGVtZSA9IGZ1bmN0aW9uIGdldFRpbGluZ1NjaGVtZSgpIHtcclxuICAgIHJldHVybiB0aGlzLnRpbGluZ1NjaGVtZTtcclxufTtcclxuXHJcbkNhbnZhc0ltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0VGlsZURpc2NhcmRQb2xpY3kgPSBmdW5jdGlvbiBnZXRUaWxlRGlzY2FyZFBvbGljeSgpIHtcclxuICAgIHJldHVybiB0aGlzLnRpbGVEaXNjYXJkUG9saWN5O1xyXG59O1xyXG5cclxuQ2FudmFzSW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5nZXRFcnJvckV2ZW50ID0gZnVuY3Rpb24gZ2V0RXJyb3JFdmVudCgpIHtcclxuICAgIHJldHVybiB0aGlzLmVycm9yRXZlbnQ7XHJcbn07XHJcblxyXG5DYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldEhhc0FscGhhQ2hhbm5lbCA9IGZ1bmN0aW9uIGdldEhhc0FscGhhQ2hhbm5lbCgpIHtcclxuICAgIHJldHVybiB0aGlzLmhhc0FscGhhQ2hhbm5lbDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBHZXRzIHRoZSBjcmVkaXRzIHRvIGJlIGRpc3BsYXllZCB3aGVuIGEgZ2l2ZW4gdGlsZSBpcyBkaXNwbGF5ZWQuXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFRoZSB0aWxlIFggY29vcmRpbmF0ZS5cclxuICogQHBhcmFtIHtOdW1iZXJ9IHkgVGhlIHRpbGUgWSBjb29yZGluYXRlLlxyXG4gKiBAcGFyYW0ge051bWJlcn0gbGV2ZWwgVGhlIHRpbGUgbGV2ZWw7XHJcbiAqIEByZXR1cm5zIHtDcmVkaXRbXX0gVGhlIGNyZWRpdHMgdG8gYmUgZGlzcGxheWVkIHdoZW4gdGhlIHRpbGUgaXMgZGlzcGxheWVkLlxyXG4gKlxyXG4gKiBAZXhjZXB0aW9uIHtEZXZlbG9wZXJFcnJvcn0gPGNvZGU+Z2V0VGlsZUNyZWRpdHM8L2NvZGU+IG11c3Qgbm90IGJlIGNhbGxlZCBiZWZvcmUgdGhlIGltYWdlcnkgcHJvdmlkZXIgaXMgcmVhZHkuXHJcbiAqL1xyXG5DYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldFRpbGVDcmVkaXRzID0gZnVuY3Rpb24oeCwgeSwgbGV2ZWwpIHtcclxuICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbn07XHJcblxyXG4vKipcclxuICogUmVxdWVzdHMgdGhlIGltYWdlIGZvciBhIGdpdmVuIHRpbGUuICBUaGlzIGZ1bmN0aW9uIHNob3VsZFxyXG4gKiBub3QgYmUgY2FsbGVkIGJlZm9yZSB7QGxpbmsgQ2FudmFzSW1hZ2VyeVByb3ZpZGVyI3JlYWR5fSByZXR1cm5zIHRydWUuXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFRoZSB0aWxlIFggY29vcmRpbmF0ZS5cclxuICogQHBhcmFtIHtOdW1iZXJ9IHkgVGhlIHRpbGUgWSBjb29yZGluYXRlLlxyXG4gKiBAcGFyYW0ge051bWJlcn0gbGV2ZWwgVGhlIHRpbGUgbGV2ZWwuXHJcbiAqIEByZXR1cm5zIHtQcm9taXNlfSBBIHByb21pc2UgZm9yIHRoZSBpbWFnZSB0aGF0IHdpbGwgcmVzb2x2ZSB3aGVuIHRoZSBpbWFnZSBpcyBhdmFpbGFibGUsIG9yXHJcbiAqICAgICAgICAgIHVuZGVmaW5lZCBpZiB0aGVyZSBhcmUgdG9vIG1hbnkgYWN0aXZlIHJlcXVlc3RzIHRvIHRoZSBzZXJ2ZXIsIGFuZCB0aGUgcmVxdWVzdFxyXG4gKiAgICAgICAgICBzaG91bGQgYmUgcmV0cmllZCBsYXRlci4gIFRoZSByZXNvbHZlZCBpbWFnZSBtYXkgYmUgZWl0aGVyIGFuXHJcbiAqICAgICAgICAgIEltYWdlIG9yIGEgQ2FudmFzIERPTSBvYmplY3QuXHJcbiAqXHJcbiAqIEBleGNlcHRpb24ge0RldmVsb3BlckVycm9yfSA8Y29kZT5yZXF1ZXN0SW1hZ2U8L2NvZGU+IG11c3Qgbm90IGJlIGNhbGxlZCBiZWZvcmUgdGhlIGltYWdlcnkgcHJvdmlkZXIgaXMgcmVhZHkuXHJcbiAqL1xyXG5DYW52YXNJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLnJlcXVlc3RJbWFnZSA9IGZ1bmN0aW9uKHgsIHksIGxldmVsKSB7XHJcbiAgICAvLz4+aW5jbHVkZVN0YXJ0KCdkZWJ1ZycsIHByYWdtYXMuZGVidWcpO1xyXG4gICAgaWYgKCF0aGlzLl9yZWFkeSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRGV2ZWxvcGVyRXJyb3IoJ3JlcXVlc3RJbWFnZSBtdXN0IG5vdCBiZSBjYWxsZWQgYmVmb3JlIHRoZSBpbWFnZXJ5IHByb3ZpZGVyIGlzIHJlYWR5LicpO1xyXG4gICAgfVxyXG4gICAgLy8+PmluY2x1ZGVFbmQoJ2RlYnVnJyk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuX2NhbnZhcztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQaWNraW5nIGZlYXR1cmVzIGlzIG5vdCBjdXJyZW50bHkgc3VwcG9ydGVkIGJ5IHRoaXMgaW1hZ2VyeSBwcm92aWRlciwgc28gdGhpcyBmdW5jdGlvbiBzaW1wbHkgcmV0dXJuc1xyXG4gKiB1bmRlZmluZWQuXHJcbiAqXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFRoZSB0aWxlIFggY29vcmRpbmF0ZS5cclxuICogQHBhcmFtIHtOdW1iZXJ9IHkgVGhlIHRpbGUgWSBjb29yZGluYXRlLlxyXG4gKiBAcGFyYW0ge051bWJlcn0gbGV2ZWwgVGhlIHRpbGUgbGV2ZWwuXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBsb25naXR1ZGUgVGhlIGxvbmdpdHVkZSBhdCB3aGljaCB0byBwaWNrIGZlYXR1cmVzLlxyXG4gKiBAcGFyYW0ge051bWJlcn0gbGF0aXR1ZGUgIFRoZSBsYXRpdHVkZSBhdCB3aGljaCB0byBwaWNrIGZlYXR1cmVzLlxyXG4gKiBAcmV0dXJuIHtQcm9taXNlfSBBIHByb21pc2UgZm9yIHRoZSBwaWNrZWQgZmVhdHVyZXMgdGhhdCB3aWxsIHJlc29sdmUgd2hlbiB0aGUgYXN5bmNocm9ub3VzXHJcbiAqICAgICAgICAgICAgICAgICAgIHBpY2tpbmcgY29tcGxldGVzLiAgVGhlIHJlc29sdmVkIHZhbHVlIGlzIGFuIGFycmF5IG9mIHtAbGluayBJbWFnZXJ5TGF5ZXJGZWF0dXJlSW5mb31cclxuICogICAgICAgICAgICAgICAgICAgaW5zdGFuY2VzLiAgVGhlIGFycmF5IG1heSBiZSBlbXB0eSBpZiBubyBmZWF0dXJlcyBhcmUgZm91bmQgYXQgdGhlIGdpdmVuIGxvY2F0aW9uLlxyXG4gKiAgICAgICAgICAgICAgICAgICBJdCBtYXkgYWxzbyBiZSB1bmRlZmluZWQgaWYgcGlja2luZyBpcyBub3Qgc3VwcG9ydGVkLlxyXG4gKi9cclxuQ2FudmFzSW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5waWNrRmVhdHVyZXMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyO1xyXG5cclxudmFyIFdvcmtlclByb3h5SW1hZ2VEZWNvZGVyID0gcmVxdWlyZSgnd29ya2VycHJveHlpbWFnZWRlY29kZXIuanMnKTtcclxudmFyIGNhbGN1bGF0ZUNlc2l1bUZydXN0dW0gPSByZXF1aXJlKCdfY2VzaXVtZnJ1c3R1bWNhbGN1bGF0b3IuanMnKTtcclxudmFyIGltYWdlSGVscGVyRnVuY3Rpb25zID0gcmVxdWlyZSgnaW1hZ2VoZWxwZXJmdW5jdGlvbnMuanMnKTtcclxuXHJcbi8qIGdsb2JhbCBDZXNpdW06IGZhbHNlICovXHJcbi8qIGdsb2JhbCBEZXZlbG9wZXJFcnJvcjogZmFsc2UgKi9cclxuLyogZ2xvYmFsIENyZWRpdDogZmFsc2UgKi9cclxuLyogZ2xvYmFsIFByb21pc2U6IGZhbHNlICovXHJcblxyXG4vKipcclxuICogUHJvdmlkZXMgYSBJbWFnZURlY29kZXIgY2xpZW50IGltYWdlcnkgdGlsZS4gIFRoZSBpbWFnZSBpcyBhc3N1bWVkIHRvIHVzZSBhXHJcbiAqIHtAbGluayBHZW9ncmFwaGljVGlsaW5nU2NoZW1lfS5cclxuICpcclxuICogQGFsaWFzIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlclxyXG4gKiBAY29uc3RydWN0b3JcclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgT2JqZWN0IHdpdGggdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy51cmwgVGhlIHVybCBmb3IgdGhlIHRpbGUuXHJcbiAqIEBwYXJhbSB7UmVjdGFuZ2xlfSBbb3B0aW9ucy5yZWN0YW5nbGU9UmVjdGFuZ2xlLk1BWF9WQUxVRV0gVGhlIHJlY3RhbmdsZSwgaW4gcmFkaWFucywgY292ZXJlZCBieSB0aGUgaW1hZ2UuXHJcbiAqIEBwYXJhbSB7Q3JlZGl0fFN0cmluZ30gW29wdGlvbnMuY3JlZGl0XSBBIGNyZWRpdCBmb3IgdGhlIGRhdGEgc291cmNlLCB3aGljaCBpcyBkaXNwbGF5ZWQgb24gdGhlIGNhbnZhcy5cclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zLnByb3h5XSBBIHByb3h5IHRvIHVzZSBmb3IgcmVxdWVzdHMuIFRoaXMgb2JqZWN0IGlzIGV4cGVjdGVkIHRvIGhhdmUgYSBnZXRVUkwgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyB0aGUgcHJveGllZCBVUkwsIGlmIG5lZWRlZC5cclxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5hZGFwdFByb3BvcnRpb25zXSBkZXRlcm1pbmVzIGlmIHRvIGFkYXB0IHRoZSBwcm9wb3J0aW9ucyBvZiB0aGUgcmVjdGFuZ2xlIHByb3ZpZGVkIHRvIHRoZSBpbWFnZSBwaXhlbHMgcHJvcG9ydGlvbnMuXHJcbiAqXHJcbiAqIEBzZWUgQXJjR2lzTWFwU2VydmVySW1hZ2VyeVByb3ZpZGVyXHJcbiAqIEBzZWUgQmluZ01hcHNJbWFnZXJ5UHJvdmlkZXJcclxuICogQHNlZSBHb29nbGVFYXJ0aEltYWdlcnlQcm92aWRlclxyXG4gKiBAc2VlIE9wZW5TdHJlZXRNYXBJbWFnZXJ5UHJvdmlkZXJcclxuICogQHNlZSBUaWxlTWFwU2VydmljZUltYWdlcnlQcm92aWRlclxyXG4gKiBAc2VlIFdlYk1hcFNlcnZpY2VJbWFnZXJ5UHJvdmlkZXJcclxuICovXHJcbmZ1bmN0aW9uIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlcihpbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lLCBvcHRpb25zKSB7XHJcbiAgICB2YXIgdXJsID0gb3B0aW9ucy51cmw7XHJcbiAgICB0aGlzLl9hZGFwdFByb3BvcnRpb25zID0gb3B0aW9ucy5hZGFwdFByb3BvcnRpb25zO1xyXG4gICAgdGhpcy5fcmVjdGFuZ2xlID0gb3B0aW9ucy5yZWN0YW5nbGU7XHJcbiAgICB0aGlzLl9wcm94eSA9IG9wdGlvbnMucHJveHk7XHJcbiAgICB0aGlzLl91cGRhdGVGcnVzdHVtSW50ZXJ2YWwgPSAxMDAwIHx8IG9wdGlvbnMudXBkYXRlRnJ1c3R1bUludGVydmFsO1xyXG4gICAgdGhpcy5fY3JlZGl0ID0gb3B0aW9ucy5jcmVkaXQ7XHJcbiAgICBcclxuICAgIGlmICh0eXBlb2YgdGhpcy5fY3JlZGl0ID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgIHRoaXMuX2NyZWRpdCA9IG5ldyBDcmVkaXQodGhpcy5fY3JlZGl0KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX3JlY3RhbmdsZSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdGhpcy5fcmVjdGFuZ2xlID0gQ2VzaXVtLlJlY3RhbmdsZS5mcm9tRGVncmVlcygtMTgwLCAtOTAsIDE4MCwgOTApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fYWRhcHRQcm9wb3J0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdGhpcy5fYWRhcHRQcm9wb3J0aW9ucyA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgb3B0aW9ucyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0aW9ucyB8fCB7fSkpO1xyXG4gICAgb3B0aW9ucy5jYXJ0b2dyYXBoaWNCb3VuZHMgPSB7XHJcbiAgICAgICAgd2VzdDogdGhpcy5fcmVjdGFuZ2xlLndlc3QsXHJcbiAgICAgICAgZWFzdDogdGhpcy5fcmVjdGFuZ2xlLmVhc3QsXHJcbiAgICAgICAgc291dGg6IHRoaXMuX3JlY3RhbmdsZS5zb3V0aCxcclxuICAgICAgICBub3J0aDogdGhpcy5fcmVjdGFuZ2xlLm5vcnRoXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICAvLz4+aW5jbHVkZVN0YXJ0KCdkZWJ1ZycsIHByYWdtYXMuZGVidWcpO1xyXG4gICAgaWYgKHVybCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBEZXZlbG9wZXJFcnJvcigndXJsIGlzIHJlcXVpcmVkLicpO1xyXG4gICAgfVxyXG4gICAgLy8+PmluY2x1ZGVFbmQoJ2RlYnVnJyk7XHJcblxyXG4gICAgdGhpcy5fdXJsID0gdXJsO1xyXG5cclxuICAgIHRoaXMuX3RpbGluZ1NjaGVtZSA9IHVuZGVmaW5lZDtcclxuXHJcbiAgICB0aGlzLl90aWxlV2lkdGggPSAwO1xyXG4gICAgdGhpcy5fdGlsZUhlaWdodCA9IDA7XHJcblxyXG4gICAgdGhpcy5fZXJyb3JFdmVudCA9IG5ldyBFdmVudCgnSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyU3RhdHVzJyk7XHJcblxyXG4gICAgdGhpcy5fcmVhZHkgPSBmYWxzZTtcclxuICAgIHRoaXMuX2V4Y2VwdGlvbkNhbGxiYWNrID0gbnVsbDtcclxuICAgIHRoaXMuX2Nlc2l1bVdpZGdldCA9IG51bGw7XHJcbiAgICB0aGlzLl91cGRhdGVGcnVzdHVtSW50ZXJ2YWxIYW5kbGUgPSBudWxsO1xyXG4gICAgXHJcblxyXG4gICAgdmFyIGltYWdlVXJsID0gdXJsO1xyXG4gICAgaWYgKHRoaXMuX3Byb3h5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAvLyBOT1RFOiBJcyB0aGF0IHRoZSBjb3JyZWN0IGxvZ2ljP1xyXG4gICAgICAgIGltYWdlVXJsID0gdGhpcy5fcHJveHkuZ2V0VVJMKGltYWdlVXJsKTtcclxuICAgIH1cclxuICAgICAgICBcclxuICAgIHRoaXMuX2ltYWdlID0gbmV3IFdvcmtlclByb3h5SW1hZ2VEZWNvZGVyKGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUsIHtcclxuICAgICAgICBzZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXI6ICdmcnVzdHVtJyxcclxuICAgICAgICBkZWNvZGVQcmlvcml0aXplcjogJ2ZydXN0dW0nXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLl91cmwgPSBpbWFnZVVybDtcclxufVxyXG5cclxuSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZSA9IHtcclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgVVJMIG9mIHRoZSBJbWFnZURlY29kZXIgc2VydmVyIChpbmNsdWRpbmcgdGFyZ2V0KS5cclxuICAgICAqIEBtZW1iZXJvZiBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7U3RyaW5nfVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCB1cmwoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3VybDtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBwcm94eSB1c2VkIGJ5IHRoaXMgcHJvdmlkZXIuXHJcbiAgICAgKiBAbWVtYmVyb2YgSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZVxyXG4gICAgICogQHR5cGUge1Byb3h5fVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCBwcm94eSgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcHJveHk7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgd2lkdGggb2YgZWFjaCB0aWxlLCBpbiBwaXhlbHMuIFRoaXMgZnVuY3Rpb24gc2hvdWxkXHJcbiAgICAgKiBub3QgYmUgY2FsbGVkIGJlZm9yZSB7QGxpbmsgSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyI3JlYWR5fSByZXR1cm5zIHRydWUuXHJcbiAgICAgKiBAbWVtYmVyb2YgSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZVxyXG4gICAgICogQHR5cGUge051bWJlcn1cclxuICAgICAqIEByZWFkb25seVxyXG4gICAgICovXHJcbiAgICBnZXQgdGlsZVdpZHRoKCkge1xyXG4gICAgICAgIC8vPj5pbmNsdWRlU3RhcnQoJ2RlYnVnJywgcHJhZ21hcy5kZWJ1Zyk7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9yZWFkeSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCd0aWxlV2lkdGggbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8+PmluY2x1ZGVFbmQoJ2RlYnVnJyk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLl90aWxlV2lkdGg7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgaGVpZ2h0IG9mIGVhY2ggdGlsZSwgaW4gcGl4ZWxzLiAgVGhpcyBmdW5jdGlvbiBzaG91bGRcclxuICAgICAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEBtZW1iZXJvZiBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7TnVtYmVyfVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCB0aWxlSGVpZ2h0KCkge1xyXG4gICAgICAgIC8vPj5pbmNsdWRlU3RhcnQoJ2RlYnVnJywgcHJhZ21hcy5kZWJ1Zyk7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9yZWFkeSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCd0aWxlSGVpZ2h0IG11c3Qgbm90IGJlIGNhbGxlZCBiZWZvcmUgdGhlIGltYWdlcnkgcHJvdmlkZXIgaXMgcmVhZHkuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vPj5pbmNsdWRlRW5kKCdkZWJ1ZycpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5fdGlsZUhlaWdodDtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIHRoZSBtYXhpbXVtIGxldmVsLW9mLWRldGFpbCB0aGF0IGNhbiBiZSByZXF1ZXN0ZWQuICBUaGlzIGZ1bmN0aW9uIHNob3VsZFxyXG4gICAgICogbm90IGJlIGNhbGxlZCBiZWZvcmUge0BsaW5rIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlciNyZWFkeX0gcmV0dXJucyB0cnVlLlxyXG4gICAgICogQG1lbWJlcm9mIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtOdW1iZXJ9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IG1heGltdW1MZXZlbCgpIHtcclxuICAgICAgICAvLz4+aW5jbHVkZVN0YXJ0KCdkZWJ1ZycsIHByYWdtYXMuZGVidWcpO1xyXG4gICAgICAgIGlmICghdGhpcy5fcmVhZHkpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBEZXZlbG9wZXJFcnJvcignbWF4aW11bUxldmVsIG11c3Qgbm90IGJlIGNhbGxlZCBiZWZvcmUgdGhlIGltYWdlcnkgcHJvdmlkZXIgaXMgcmVhZHkuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vPj5pbmNsdWRlRW5kKCdkZWJ1ZycpO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcy5fbnVtUmVzb2x1dGlvbkxldmVscyAtIDE7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgbWluaW11bSBsZXZlbC1vZi1kZXRhaWwgdGhhdCBjYW4gYmUgcmVxdWVzdGVkLiAgVGhpcyBmdW5jdGlvbiBzaG91bGRcclxuICAgICAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEBtZW1iZXJvZiBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7TnVtYmVyfVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCBtaW5pbXVtTGV2ZWwoKSB7XHJcbiAgICAgICAgLy8+PmluY2x1ZGVTdGFydCgnZGVidWcnLCBwcmFnbWFzLmRlYnVnKTtcclxuICAgICAgICBpZiAoIXRoaXMuX3JlYWR5KSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRGV2ZWxvcGVyRXJyb3IoJ21pbmltdW1MZXZlbCBtdXN0IG5vdCBiZSBjYWxsZWQgYmVmb3JlIHRoZSBpbWFnZXJ5IHByb3ZpZGVyIGlzIHJlYWR5LicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLz4+aW5jbHVkZUVuZCgnZGVidWcnKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIDA7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGlsaW5nIHNjaGVtZSB1c2VkIGJ5IHRoaXMgcHJvdmlkZXIuICBUaGlzIGZ1bmN0aW9uIHNob3VsZFxyXG4gICAgICogbm90IGJlIGNhbGxlZCBiZWZvcmUge0BsaW5rIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlciNyZWFkeX0gcmV0dXJucyB0cnVlLlxyXG4gICAgICogQG1lbWJlcm9mIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtUaWxpbmdTY2hlbWV9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IHRpbGluZ1NjaGVtZSgpIHtcclxuICAgICAgICAvLz4+aW5jbHVkZVN0YXJ0KCdkZWJ1ZycsIHByYWdtYXMuZGVidWcpO1xyXG4gICAgICAgIGlmICghdGhpcy5fcmVhZHkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCd0aWxpbmdTY2hlbWUgbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8+PmluY2x1ZGVFbmQoJ2RlYnVnJyk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLl90aWxpbmdTY2hlbWU7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgcmVjdGFuZ2xlLCBpbiByYWRpYW5zLCBvZiB0aGUgaW1hZ2VyeSBwcm92aWRlZCBieSB0aGlzIGluc3RhbmNlLiAgVGhpcyBmdW5jdGlvbiBzaG91bGRcclxuICAgICAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEBtZW1iZXJvZiBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7UmVjdGFuZ2xlfVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCByZWN0YW5nbGUoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RpbGluZ1NjaGVtZS5yZWN0YW5nbGU7XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdGlsZSBkaXNjYXJkIHBvbGljeS4gIElmIG5vdCB1bmRlZmluZWQsIHRoZSBkaXNjYXJkIHBvbGljeSBpcyByZXNwb25zaWJsZVxyXG4gICAgICogZm9yIGZpbHRlcmluZyBvdXQgXCJtaXNzaW5nXCIgdGlsZXMgdmlhIGl0cyBzaG91bGREaXNjYXJkSW1hZ2UgZnVuY3Rpb24uICBJZiB0aGlzIGZ1bmN0aW9uXHJcbiAgICAgKiByZXR1cm5zIHVuZGVmaW5lZCwgbm8gdGlsZXMgYXJlIGZpbHRlcmVkLiAgVGhpcyBmdW5jdGlvbiBzaG91bGRcclxuICAgICAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICAgICAqIEBtZW1iZXJvZiBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7VGlsZURpc2NhcmRQb2xpY3l9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IHRpbGVEaXNjYXJkUG9saWN5KCkge1xyXG4gICAgICAgIC8vPj5pbmNsdWRlU3RhcnQoJ2RlYnVnJywgcHJhZ21hcy5kZWJ1Zyk7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9yZWFkeSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRGV2ZWxvcGVyRXJyb3IoJ3RpbGVEaXNjYXJkUG9saWN5IG11c3Qgbm90IGJlIGNhbGxlZCBiZWZvcmUgdGhlIGltYWdlcnkgcHJvdmlkZXIgaXMgcmVhZHkuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vPj5pbmNsdWRlRW5kKCdkZWJ1ZycpO1xyXG5cclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYW4gZXZlbnQgdGhhdCBpcyByYWlzZWQgd2hlbiB0aGUgaW1hZ2VyeSBwcm92aWRlciBlbmNvdW50ZXJzIGFuIGFzeW5jaHJvbm91cyBlcnJvci4gIEJ5IHN1YnNjcmliaW5nXHJcbiAgICAgKiB0byB0aGUgZXZlbnQsIHlvdSB3aWxsIGJlIG5vdGlmaWVkIG9mIHRoZSBlcnJvciBhbmQgY2FuIHBvdGVudGlhbGx5IHJlY292ZXIgZnJvbSBpdC4gIEV2ZW50IGxpc3RlbmVyc1xyXG4gICAgICogYXJlIHBhc3NlZCBhbiBpbnN0YW5jZSBvZiB7QGxpbmsgVGlsZVByb3ZpZGVyRXJyb3J9LlxyXG4gICAgICogQG1lbWJlcm9mIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtFdmVudH1cclxuICAgICAqIEByZWFkb25seVxyXG4gICAgICovXHJcbiAgICBnZXQgZXJyb3JFdmVudCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fZXJyb3JFdmVudDtcclxuICAgIH0sXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBHZXRzIGEgdmFsdWUgaW5kaWNhdGluZyB3aGV0aGVyIG9yIG5vdCB0aGUgcHJvdmlkZXIgaXMgcmVhZHkgZm9yIHVzZS5cclxuICAgICAqIEBtZW1iZXJvZiBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlXHJcbiAgICAgKiBAdHlwZSB7Qm9vbGVhbn1cclxuICAgICAqIEByZWFkb25seVxyXG4gICAgICovXHJcbiAgICBnZXQgcmVhZHkoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JlYWR5O1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgdGhlIGNyZWRpdCB0byBkaXNwbGF5IHdoZW4gdGhpcyBpbWFnZXJ5IHByb3ZpZGVyIGlzIGFjdGl2ZS4gIFR5cGljYWxseSB0aGlzIGlzIHVzZWQgdG8gY3JlZGl0XHJcbiAgICAgKiB0aGUgc291cmNlIG9mIHRoZSBpbWFnZXJ5LiAgVGhpcyBmdW5jdGlvbiBzaG91bGQgbm90IGJlIGNhbGxlZCBiZWZvcmUge0BsaW5rIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlciNyZWFkeX0gcmV0dXJucyB0cnVlLlxyXG4gICAgICogQG1lbWJlcm9mIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtDcmVkaXR9XHJcbiAgICAgKiBAcmVhZG9ubHlcclxuICAgICAqL1xyXG4gICAgZ2V0IGNyZWRpdCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fY3JlZGl0O1xyXG4gICAgfSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldHMgYSB2YWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRoZSBpbWFnZXMgcHJvdmlkZWQgYnkgdGhpcyBpbWFnZXJ5IHByb3ZpZGVyXHJcbiAgICAgKiBpbmNsdWRlIGFuIGFscGhhIGNoYW5uZWwuICBJZiB0aGlzIHByb3BlcnR5IGlzIGZhbHNlLCBhbiBhbHBoYSBjaGFubmVsLCBpZiBwcmVzZW50LCB3aWxsXHJcbiAgICAgKiBiZSBpZ25vcmVkLiAgSWYgdGhpcyBwcm9wZXJ0eSBpcyB0cnVlLCBhbnkgaW1hZ2VzIHdpdGhvdXQgYW4gYWxwaGEgY2hhbm5lbCB3aWxsIGJlIHRyZWF0ZWRcclxuICAgICAqIGFzIGlmIHRoZWlyIGFscGhhIGlzIDEuMCBldmVyeXdoZXJlLiAgV2hlbiB0aGlzIHByb3BlcnR5IGlzIGZhbHNlLCBtZW1vcnkgdXNhZ2VcclxuICAgICAqIGFuZCB0ZXh0dXJlIHVwbG9hZCB0aW1lIGFyZSByZWR1Y2VkLlxyXG4gICAgICogQG1lbWJlcm9mIEltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGVcclxuICAgICAqIEB0eXBlIHtCb29sZWFufVxyXG4gICAgICogQHJlYWRvbmx5XHJcbiAgICAgKi9cclxuICAgIGdldCBoYXNBbHBoYUNoYW5uZWwoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLnNldEV4Y2VwdGlvbkNhbGxiYWNrID1cclxuICAgIGZ1bmN0aW9uIHNldEV4Y2VwdGlvbkNhbGxiYWNrKGV4Y2VwdGlvbkNhbGxiYWNrKSB7XHJcbiAgICBcclxuICAgIHRoaXMuX2V4Y2VwdGlvbkNhbGxiYWNrID0gZXhjZXB0aW9uQ2FsbGJhY2s7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbiBvcGVuKHdpZGdldE9yVmlld2VyKSB7XHJcbiAgICBpZiAodGhpcy5fdXBkYXRlRnJ1c3R1bUludGVydmFsSGFuZGxlICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCdDYW5ub3Qgc2V0IHR3byBwYXJlbnQgdmlld2Vycy4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHdpZGdldE9yVmlld2VyID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRGV2ZWxvcGVyRXJyb3IoJ3dpZGdldE9yVmlld2VyIHNob3VsZCBiZSBnaXZlbi4gSXQgaXMgJyArXHJcbiAgICAgICAgICAgICduZWVkZWQgZm9yIGZydXN0dW0gY2FsY3VsYXRpb24gZm9yIHRoZSBwcmlvcml0eSBtZWNoYW5pc20nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5faW1hZ2Uub3Blbih0aGlzLl91cmwpXHJcblx0XHQudGhlbih0aGlzLl9vcGVuZWQuYmluZCh0aGlzKSlcclxuXHRcdC5jYXRjaCh0aGlzLl9vbkV4Y2VwdGlvbi5iaW5kKHRoaXMpKTtcclxuICAgIFxyXG4gICAgdGhpcy5fY2VzaXVtV2lkZ2V0ID0gd2lkZ2V0T3JWaWV3ZXI7XHJcbiAgICBcclxuICAgIHRoaXMuX3VwZGF0ZUZydXN0dW1JbnRlcnZhbEhhbmRsZSA9IHNldEludGVydmFsKFxyXG4gICAgICAgIHRoaXMuX3NldFByaW9yaXR5QnlGcnVzdHVtLmJpbmQodGhpcyksXHJcbiAgICAgICAgdGhpcy5fdXBkYXRlRnJ1c3R1bUludGVydmFsKTtcclxufTtcclxuXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiBjbG9zZSgpIHtcclxuICAgIGNsZWFySW50ZXJ2YWwodGhpcy5fdXBkYXRlRnJ1c3R1bUludGVydmFsSGFuZGxlKTtcclxuICAgIHRoaXMuX2ltYWdlLmNsb3NlKCk7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldFRpbGVXaWR0aCA9IGZ1bmN0aW9uIGdldFRpbGVXaWR0aCgpIHtcclxuICAgIHJldHVybiB0aGlzLnRpbGVXaWR0aDtcclxufTtcclxuXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0VGlsZUhlaWdodCA9IGZ1bmN0aW9uIGdldFRpbGVIZWlnaHQoKSB7XHJcbiAgICByZXR1cm4gdGhpcy50aWxlSGVpZ2h0O1xyXG59O1xyXG5cclxuSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5nZXRNYXhpbXVtTGV2ZWwgPSBmdW5jdGlvbiBnZXRNYXhpbXVtTGV2ZWwoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5tYXhpbXVtTGV2ZWw7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldE1pbmltdW1MZXZlbCA9IGZ1bmN0aW9uIGdldE1pbmltdW1MZXZlbCgpIHtcclxuICAgIHJldHVybiB0aGlzLm1pbmltdW1MZXZlbDtcclxufTtcclxuXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0VXJsID0gZnVuY3Rpb24gZ2V0VXJsKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudXJsO1xyXG59O1xyXG5cclxuSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5nZXRQcm94eSA9IGZ1bmN0aW9uIGdldFByb3h5KCkge1xyXG4gICAgcmV0dXJuIHRoaXMucHJveHk7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmlzUmVhZHkgPSBmdW5jdGlvbiBpc1JlYWR5KCkge1xyXG4gICAgcmV0dXJuIHRoaXMucmVhZHk7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldENyZWRpdCA9IGZ1bmN0aW9uIGdldENyZWRpdCgpIHtcclxuICAgIHJldHVybiB0aGlzLmNyZWRpdDtcclxufTtcclxuXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0UmVjdGFuZ2xlID0gZnVuY3Rpb24gZ2V0UmVjdGFuZ2xlKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudGlsaW5nU2NoZW1lLnJlY3RhbmdsZTtcclxufTtcclxuXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0VGlsaW5nU2NoZW1lID0gZnVuY3Rpb24gZ2V0VGlsaW5nU2NoZW1lKCkge1xyXG4gICAgcmV0dXJuIHRoaXMudGlsaW5nU2NoZW1lO1xyXG59O1xyXG5cclxuSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5nZXRUaWxlRGlzY2FyZFBvbGljeSA9IGZ1bmN0aW9uIGdldFRpbGVEaXNjYXJkUG9saWN5KCkge1xyXG4gICAgcmV0dXJuIHRoaXMudGlsZURpc2NhcmRQb2xpY3k7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLmdldEVycm9yRXZlbnQgPSBmdW5jdGlvbiBnZXRFcnJvckV2ZW50KCkge1xyXG4gICAgcmV0dXJuIHRoaXMuZXJyb3JFdmVudDtcclxufTtcclxuXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0SGFzQWxwaGFDaGFubmVsID0gZnVuY3Rpb24gZ2V0SGFzQWxwaGFDaGFubmVsKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuaGFzQWxwaGFDaGFubmVsO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGNyZWRpdHMgdG8gYmUgZGlzcGxheWVkIHdoZW4gYSBnaXZlbiB0aWxlIGlzIGRpc3BsYXllZC5cclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IHggVGhlIHRpbGUgWCBjb29yZGluYXRlLlxyXG4gKiBAcGFyYW0ge051bWJlcn0geSBUaGUgdGlsZSBZIGNvb3JkaW5hdGUuXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBsZXZlbCBUaGUgdGlsZSBsZXZlbDtcclxuICogQHJldHVybnMge0NyZWRpdFtdfSBUaGUgY3JlZGl0cyB0byBiZSBkaXNwbGF5ZWQgd2hlbiB0aGUgdGlsZSBpcyBkaXNwbGF5ZWQuXHJcbiAqXHJcbiAqIEBleGNlcHRpb24ge0RldmVsb3BlckVycm9yfSA8Y29kZT5nZXRUaWxlQ3JlZGl0czwvY29kZT4gbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS5cclxuICovXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuZ2V0VGlsZUNyZWRpdHMgPSBmdW5jdGlvbih4LCB5LCBsZXZlbCkge1xyXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXF1ZXN0cyB0aGUgaW1hZ2UgZm9yIGEgZ2l2ZW4gdGlsZS4gIFRoaXMgZnVuY3Rpb24gc2hvdWxkXHJcbiAqIG5vdCBiZSBjYWxsZWQgYmVmb3JlIHtAbGluayBJbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIjcmVhZHl9IHJldHVybnMgdHJ1ZS5cclxuICpcclxuICogQHBhcmFtIHtOdW1iZXJ9IHggVGhlIHRpbGUgWCBjb29yZGluYXRlLlxyXG4gKiBAcGFyYW0ge051bWJlcn0geSBUaGUgdGlsZSBZIGNvb3JkaW5hdGUuXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSBsZXZlbCBUaGUgdGlsZSBsZXZlbC5cclxuICogQHJldHVybnMge1Byb21pc2V9IEEgcHJvbWlzZSBmb3IgdGhlIGltYWdlIHRoYXQgd2lsbCByZXNvbHZlIHdoZW4gdGhlIGltYWdlIGlzIGF2YWlsYWJsZSwgb3JcclxuICogICAgICAgICAgdW5kZWZpbmVkIGlmIHRoZXJlIGFyZSB0b28gbWFueSBhY3RpdmUgcmVxdWVzdHMgdG8gdGhlIHNlcnZlciwgYW5kIHRoZSByZXF1ZXN0XHJcbiAqICAgICAgICAgIHNob3VsZCBiZSByZXRyaWVkIGxhdGVyLiAgVGhlIHJlc29sdmVkIGltYWdlIG1heSBiZSBlaXRoZXIgYW5cclxuICogICAgICAgICAgSW1hZ2Ugb3IgYSBDYW52YXMgRE9NIG9iamVjdC5cclxuICpcclxuICogQGV4Y2VwdGlvbiB7RGV2ZWxvcGVyRXJyb3J9IDxjb2RlPnJlcXVlc3RJbWFnZTwvY29kZT4gbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS5cclxuICovXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUucmVxdWVzdEltYWdlID0gZnVuY3Rpb24oeCwgeSwgY2VzaXVtTGV2ZWwpIHtcclxuICAgIC8vPj5pbmNsdWRlU3RhcnQoJ2RlYnVnJywgcHJhZ21hcy5kZWJ1Zyk7XHJcbiAgICBpZiAoIXRoaXMuX3JlYWR5KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IERldmVsb3BlckVycm9yKCdyZXF1ZXN0SW1hZ2UgbXVzdCBub3QgYmUgY2FsbGVkIGJlZm9yZSB0aGUgaW1hZ2VyeSBwcm92aWRlciBpcyByZWFkeS4nKTtcclxuICAgIH1cclxuICAgIC8vPj5pbmNsdWRlRW5kKCdkZWJ1ZycpO1xyXG4gICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBcclxuICAgIHZhciBsZXZlbEZhY3RvciA9IE1hdGgucG93KDIsIHRoaXMuX251bVJlc29sdXRpb25MZXZlbHMgLSBjZXNpdW1MZXZlbCAtIDEpO1xyXG4gICAgdmFyIG1pblggPSB4ICogdGhpcy5fdGlsZVdpZHRoICAqIGxldmVsRmFjdG9yO1xyXG4gICAgdmFyIG1pblkgPSB5ICogdGhpcy5fdGlsZUhlaWdodCAqIGxldmVsRmFjdG9yO1xyXG4gICAgdmFyIG1heFhFeGNsdXNpdmUgPSAoeCArIDEpICogdGhpcy5fdGlsZVdpZHRoICAqIGxldmVsRmFjdG9yO1xyXG4gICAgdmFyIG1heFlFeGNsdXNpdmUgPSAoeSArIDEpICogdGhpcy5fdGlsZUhlaWdodCAqIGxldmVsRmFjdG9yO1xyXG4gICAgXHJcbiAgICB2YXIgYWxpZ25lZFBhcmFtcyA9IGltYWdlSGVscGVyRnVuY3Rpb25zLmFsaWduUGFyYW1zVG9UaWxlc0FuZExldmVsKHtcclxuICAgICAgICBtaW5YOiBtaW5YLFxyXG4gICAgICAgIG1pblk6IG1pblksXHJcbiAgICAgICAgbWF4WEV4Y2x1c2l2ZTogbWF4WEV4Y2x1c2l2ZSxcclxuICAgICAgICBtYXhZRXhjbHVzaXZlOiBtYXhZRXhjbHVzaXZlLFxyXG4gICAgICAgIHNjcmVlbldpZHRoOiB0aGlzLl90aWxlV2lkdGgsXHJcbiAgICAgICAgc2NyZWVuSGVpZ2h0OiB0aGlzLl90aWxlSGVpZ2h0XHJcbiAgICB9LCB0aGlzLl9pbWFnZSk7XHJcbiAgICBcclxuICAgIHZhciBsZXZlbCA9IGFsaWduZWRQYXJhbXMuaW1hZ2VQYXJ0UGFyYW1zLmxldmVsO1xyXG4gICAgdmFyIGxldmVsV2lkdGggPSB0aGlzLl9pbWFnZS5nZXRMZXZlbFdpZHRoKGxldmVsKTtcclxuICAgIHZhciBsZXZlbEhlaWdodCA9IHRoaXMuX2ltYWdlLmdldExldmVsSGVpZ2h0KGxldmVsKTtcclxuICAgIFxyXG4gICAgdmFyIHNjYWxlZENhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xyXG4gICAgc2NhbGVkQ2FudmFzLndpZHRoID0gdGhpcy5fdGlsZVdpZHRoO1xyXG4gICAgc2NhbGVkQ2FudmFzLmhlaWdodCA9IHRoaXMuX3RpbGVIZWlnaHQ7XHJcbiAgICBcclxuICAgIHZhciBzY2FsZWRDb250ZXh0ID0gc2NhbGVkQ2FudmFzLmdldENvbnRleHQoJzJkJyk7XHJcbiAgICBzY2FsZWRDb250ZXh0LmNsZWFyUmVjdCgwLCAwLCB0aGlzLl90aWxlV2lkdGgsIHRoaXMuX3RpbGVIZWlnaHQpO1xyXG4gICAgXHJcbiAgICB2YXIgdGVtcFBpeGVsV2lkdGggID0gYWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIGFsaWduZWRQYXJhbXMuaW1hZ2VQYXJ0UGFyYW1zLm1pblg7XHJcbiAgICB2YXIgdGVtcFBpeGVsSGVpZ2h0ID0gYWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSAtIGFsaWduZWRQYXJhbXMuaW1hZ2VQYXJ0UGFyYW1zLm1pblk7XHJcbiAgICBpZiAodGVtcFBpeGVsV2lkdGggPD0gMCB8fCB0ZW1wUGl4ZWxIZWlnaHQgPD0gMCkge1xyXG4gICAgICAgIHJldHVybiBzY2FsZWRDYW52YXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciB0ZW1wQ2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XHJcbiAgICB0ZW1wQ2FudmFzLndpZHRoID0gdGVtcFBpeGVsV2lkdGg7XHJcbiAgICB0ZW1wQ2FudmFzLmhlaWdodCA9IHRlbXBQaXhlbEhlaWdodDtcclxuICAgIHZhciB0ZW1wQ29udGV4dCA9IHRlbXBDYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgIHRlbXBDb250ZXh0LmNsZWFyUmVjdCgwLCAwLCB0ZW1wUGl4ZWxXaWR0aCwgdGVtcFBpeGVsSGVpZ2h0KTtcclxuICAgIFxyXG4gICAgYWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMucXVhbGl0eSA9IHRoaXMuX3F1YWxpdHk7XHJcbiAgICBhbGlnbmVkUGFyYW1zLmltYWdlUGFydFBhcmFtcy5yZXF1ZXN0UHJpb3JpdHlEYXRhID0ge1xyXG4gICAgICAgIGltYWdlUmVjdGFuZ2xlOiB0aGlzLl9yZWN0YW5nbGVcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciByZXNvbHZlLCByZWplY3Q7XHJcbiAgICB2YXIgcmVxdWVzdFBpeGVsc1Byb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlXywgcmVqZWN0Xykge1xyXG4gICAgICAgIHJlc29sdmUgPSByZXNvbHZlXztcclxuICAgICAgICByZWplY3QgPSByZWplY3RfO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlbGYuX2ltYWdlLnJlcXVlc3RQaXhlbHNQcm9ncmVzc2l2ZShcclxuICAgICAgICAgICAgYWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgIHBpeGVsc0RlY29kZWRDYWxsYmFjayxcclxuICAgICAgICAgICAgdGVybWluYXRlZENhbGxiYWNrKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwaXhlbHNEZWNvZGVkQ2FsbGJhY2soZGVjb2RlZCkge1xyXG4gICAgICAgIHZhciBwYXJ0aWFsVGlsZVdpZHRoID0gZGVjb2RlZC5pbWFnZURhdGEud2lkdGg7XHJcbiAgICAgICAgdmFyIHBhcnRpYWxUaWxlSGVpZ2h0ID0gZGVjb2RlZC5pbWFnZURhdGEuaGVpZ2h0O1xyXG5cclxuICAgICAgICBpZiAocGFydGlhbFRpbGVXaWR0aCA+IDAgJiYgcGFydGlhbFRpbGVIZWlnaHQgPiAwKSB7XHJcbiAgICAgICAgICAgIHRlbXBDb250ZXh0LnB1dEltYWdlRGF0YShcclxuICAgICAgICAgICAgICAgIGRlY29kZWQuaW1hZ2VEYXRhLFxyXG4gICAgICAgICAgICAgICAgZGVjb2RlZC54SW5PcmlnaW5hbFJlcXVlc3QsXHJcbiAgICAgICAgICAgICAgICBkZWNvZGVkLnlJbk9yaWdpbmFsUmVxdWVzdCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHRlcm1pbmF0ZWRDYWxsYmFjayhpc0Fib3J0ZWQpIHtcclxuICAgICAgICBpZiAoaXNBYm9ydGVkKSB7XHJcbiAgICAgICAgICAgIHJlamVjdCgnRmV0Y2ggcmVxdWVzdCBvciBkZWNvZGUgYWJvcnRlZCcpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNjYWxlZENvbnRleHQuZHJhd0ltYWdlKFxyXG4gICAgICAgICAgICAgICAgdGVtcENhbnZhcyxcclxuICAgICAgICAgICAgICAgIDAsIDAsIHRlbXBQaXhlbFdpZHRoLCB0ZW1wUGl4ZWxIZWlnaHQsXHJcbiAgICAgICAgICAgICAgICBhbGlnbmVkUGFyYW1zLmNyb3BwZWRTY3JlZW4ubWluWCwgYWxpZ25lZFBhcmFtcy5jcm9wcGVkU2NyZWVuLm1pblksXHJcbiAgICAgICAgICAgICAgICBhbGlnbmVkUGFyYW1zLmNyb3BwZWRTY3JlZW4ubWF4WEV4Y2x1c2l2ZSwgYWxpZ25lZFBhcmFtcy5jcm9wcGVkU2NyZWVuLm1heFlFeGNsdXNpdmUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJlc29sdmUoc2NhbGVkQ2FudmFzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlcXVlc3RQaXhlbHNQcm9taXNlO1xyXG59O1xyXG5cclxuSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyLnByb3RvdHlwZS5fc2V0UHJpb3JpdHlCeUZydXN0dW0gPVxyXG4gICAgZnVuY3Rpb24gc2V0UHJpb3JpdHlCeUZydXN0dW0oKSB7XHJcbiAgICBcclxuICAgIGlmICghdGhpcy5fcmVhZHkpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBmcnVzdHVtRGF0YSA9IGNhbGN1bGF0ZUNlc2l1bUZydXN0dW0oXHJcbiAgICAgICAgdGhpcy5fY2VzaXVtV2lkZ2V0LCB0aGlzKTtcclxuICAgIFxyXG4gICAgaWYgKGZydXN0dW1EYXRhID09PSBudWxsKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmcnVzdHVtRGF0YS5pbWFnZVJlY3RhbmdsZSA9IHRoaXMuZ2V0UmVjdGFuZ2xlKCk7XHJcbiAgICBmcnVzdHVtRGF0YS5leGFjdGxldmVsID0gbnVsbDtcclxuXHJcbiAgICB0aGlzLl9pbWFnZS5zZXRTZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXJEYXRhKGZydXN0dW1EYXRhKTtcclxuICAgIHRoaXMuX2ltYWdlLnNldERlY29kZVByaW9yaXRpemVyRGF0YShmcnVzdHVtRGF0YSk7XHJcbn07XHJcblxyXG4vKipcclxuICogUGlja2luZyBmZWF0dXJlcyBpcyBub3QgY3VycmVudGx5IHN1cHBvcnRlZCBieSB0aGlzIGltYWdlcnkgcHJvdmlkZXIsIHNvIHRoaXMgZnVuY3Rpb24gc2ltcGx5IHJldHVybnNcclxuICogdW5kZWZpbmVkLlxyXG4gKlxyXG4gKiBAcGFyYW0ge051bWJlcn0geCBUaGUgdGlsZSBYIGNvb3JkaW5hdGUuXHJcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFRoZSB0aWxlIFkgY29vcmRpbmF0ZS5cclxuICogQHBhcmFtIHtOdW1iZXJ9IGxldmVsIFRoZSB0aWxlIGxldmVsLlxyXG4gKiBAcGFyYW0ge051bWJlcn0gbG9uZ2l0dWRlIFRoZSBsb25naXR1ZGUgYXQgd2hpY2ggdG8gcGljayBmZWF0dXJlcy5cclxuICogQHBhcmFtIHtOdW1iZXJ9IGxhdGl0dWRlICBUaGUgbGF0aXR1ZGUgYXQgd2hpY2ggdG8gcGljayBmZWF0dXJlcy5cclxuICogQHJldHVybiB7UHJvbWlzZX0gQSBwcm9taXNlIGZvciB0aGUgcGlja2VkIGZlYXR1cmVzIHRoYXQgd2lsbCByZXNvbHZlIHdoZW4gdGhlIGFzeW5jaHJvbm91c1xyXG4gKiAgICAgICAgICAgICAgICAgICBwaWNraW5nIGNvbXBsZXRlcy4gIFRoZSByZXNvbHZlZCB2YWx1ZSBpcyBhbiBhcnJheSBvZiB7QGxpbmsgSW1hZ2VyeUxheWVyRmVhdHVyZUluZm99XHJcbiAqICAgICAgICAgICAgICAgICAgIGluc3RhbmNlcy4gIFRoZSBhcnJheSBtYXkgYmUgZW1wdHkgaWYgbm8gZmVhdHVyZXMgYXJlIGZvdW5kIGF0IHRoZSBnaXZlbiBsb2NhdGlvbi5cclxuICogICAgICAgICAgICAgICAgICAgSXQgbWF5IGFsc28gYmUgdW5kZWZpbmVkIGlmIHBpY2tpbmcgaXMgbm90IHN1cHBvcnRlZC5cclxuICovXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUucGlja0ZlYXR1cmVzID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxufTtcclxuXHJcbkltYWdlRGVjb2RlckltYWdlcnlQcm92aWRlci5wcm90b3R5cGUuX29uRXhjZXB0aW9uID0gZnVuY3Rpb24gb25FeGNlcHRpb24ocmVhc29uKSB7XHJcbiAgICBpZiAodGhpcy5fZXhjZXB0aW9uQ2FsbGJhY2sgIT09IG51bGwpIHtcclxuXHRcdHRoaXMuX2V4Y2VwdGlvbkNhbGxiYWNrKHJlYXNvbik7XHJcbiAgICB9XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXJJbWFnZXJ5UHJvdmlkZXIucHJvdG90eXBlLl9vcGVuZWQgPSBmdW5jdGlvbiBvcGVuZWQoKSB7XHJcbiAgICBpZiAodGhpcy5fcmVhZHkpIHtcclxuICAgICAgICB0aHJvdyAnSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyIGVycm9yOiBvcGVuZWQoKSB3YXMgY2FsbGVkIG1vcmUgdGhhbiBvbmNlISc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX3JlYWR5ID0gdHJ1ZTtcclxuICAgIFxyXG4gICAgLy8gVGhpcyBpcyB3cm9uZyBpZiBDT0Qgb3IgQ09DIGV4aXN0cyBiZXNpZGVzIG1haW4gaGVhZGVyIENPRFxyXG4gICAgdGhpcy5fbnVtUmVzb2x1dGlvbkxldmVscyA9IHRoaXMuX2ltYWdlLmdldE51bVJlc29sdXRpb25MZXZlbHNGb3JMaW1pdHRlZFZpZXdlcigpO1xyXG4gICAgdGhpcy5fcXVhbGl0eSA9IHRoaXMuX2ltYWdlLmdldEhpZ2hlc3RRdWFsaXR5KCk7XHJcbiAgICB2YXIgbWF4aW11bUNlc2l1bUxldmVsID0gdGhpcy5fbnVtUmVzb2x1dGlvbkxldmVscyAtIDE7XHJcbiAgICAgICAgXHJcbiAgICB0aGlzLl90aWxlV2lkdGggPSB0aGlzLl9pbWFnZS5nZXRUaWxlV2lkdGgoKTtcclxuICAgIHRoaXMuX3RpbGVIZWlnaHQgPSB0aGlzLl9pbWFnZS5nZXRUaWxlSGVpZ2h0KCk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgYmVzdExldmVsID0gdGhpcy5faW1hZ2UuZ2V0SW1hZ2VMZXZlbCgpO1xyXG4gICAgdmFyIGJlc3RMZXZlbFdpZHRoICA9IHRoaXMuX2ltYWdlLmdldExldmVsV2lkdGggKGJlc3RMZXZlbCk7XHJcbiAgICB2YXIgYmVzdExldmVsSGVpZ2h0ID0gdGhpcy5faW1hZ2UuZ2V0TGV2ZWxIZWlnaHQoYmVzdExldmVsKTtcclxuICAgIFxyXG4gICAgdmFyIGxvd2VzdExldmVsVGlsZXNYID0gTWF0aC5jZWlsKGJlc3RMZXZlbFdpZHRoICAvIHRoaXMuX3RpbGVXaWR0aCApID4+IG1heGltdW1DZXNpdW1MZXZlbDtcclxuICAgIHZhciBsb3dlc3RMZXZlbFRpbGVzWSA9IE1hdGguY2VpbChiZXN0TGV2ZWxIZWlnaHQgLyB0aGlzLl90aWxlSGVpZ2h0KSA+PiBtYXhpbXVtQ2VzaXVtTGV2ZWw7XHJcblxyXG4gICAgaW1hZ2VIZWxwZXJGdW5jdGlvbnMuZml4Qm91bmRzKFxyXG4gICAgICAgIHRoaXMuX3JlY3RhbmdsZSxcclxuICAgICAgICB0aGlzLl9pbWFnZSxcclxuICAgICAgICB0aGlzLl9hZGFwdFByb3BvcnRpb25zKTtcclxuICAgIHZhciByZWN0YW5nbGVXaWR0aCAgPSB0aGlzLl9yZWN0YW5nbGUuZWFzdCAgLSB0aGlzLl9yZWN0YW5nbGUud2VzdDtcclxuICAgIHZhciByZWN0YW5nbGVIZWlnaHQgPSB0aGlzLl9yZWN0YW5nbGUubm9ydGggLSB0aGlzLl9yZWN0YW5nbGUuc291dGg7XHJcbiAgICBcclxuICAgIHZhciBiZXN0TGV2ZWxTY2FsZSA9IDEgPDwgbWF4aW11bUNlc2l1bUxldmVsO1xyXG4gICAgdmFyIHBpeGVsc1dpZHRoRm9yQ2VzaXVtICA9IHRoaXMuX3RpbGVXaWR0aCAgKiBsb3dlc3RMZXZlbFRpbGVzWCAqIGJlc3RMZXZlbFNjYWxlO1xyXG4gICAgdmFyIHBpeGVsc0hlaWdodEZvckNlc2l1bSA9IHRoaXMuX3RpbGVIZWlnaHQgKiBsb3dlc3RMZXZlbFRpbGVzWSAqIGJlc3RMZXZlbFNjYWxlO1xyXG4gICAgXHJcbiAgICAvLyBDZXNpdW0gd29ya3Mgd2l0aCBmdWxsIHRpbGVzIG9ubHksIHRodXMgZml4IHRoZSBnZW9ncmFwaGljIGJvdW5kcyBzb1xyXG4gICAgLy8gdGhlIHBpeGVscyBsaWVzIGV4YWN0bHkgb24gdGhlIG9yaWdpbmFsIGJvdW5kc1xyXG4gICAgXHJcbiAgICB2YXIgZ2VvZ3JhcGhpY1dpZHRoRm9yQ2VzaXVtID1cclxuICAgICAgICByZWN0YW5nbGVXaWR0aCAqIHBpeGVsc1dpZHRoRm9yQ2VzaXVtIC8gYmVzdExldmVsV2lkdGg7XHJcbiAgICB2YXIgZ2VvZ3JhcGhpY0hlaWdodEZvckNlc2l1bSA9XHJcbiAgICAgICAgcmVjdGFuZ2xlSGVpZ2h0ICogcGl4ZWxzSGVpZ2h0Rm9yQ2VzaXVtIC8gYmVzdExldmVsSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB2YXIgZml4ZWRFYXN0ICA9IHRoaXMuX3JlY3RhbmdsZS53ZXN0ICArIGdlb2dyYXBoaWNXaWR0aEZvckNlc2l1bTtcclxuICAgIHZhciBmaXhlZFNvdXRoID0gdGhpcy5fcmVjdGFuZ2xlLm5vcnRoIC0gZ2VvZ3JhcGhpY0hlaWdodEZvckNlc2l1bTtcclxuICAgIFxyXG4gICAgdGhpcy5fdGlsaW5nU2NoZW1lUGFyYW1zID0ge1xyXG4gICAgICAgIHdlc3Q6IHRoaXMuX3JlY3RhbmdsZS53ZXN0LFxyXG4gICAgICAgIGVhc3Q6IGZpeGVkRWFzdCxcclxuICAgICAgICBzb3V0aDogZml4ZWRTb3V0aCxcclxuICAgICAgICBub3J0aDogdGhpcy5fcmVjdGFuZ2xlLm5vcnRoLFxyXG4gICAgICAgIGxldmVsWmVyb1RpbGVzWDogbG93ZXN0TGV2ZWxUaWxlc1gsXHJcbiAgICAgICAgbGV2ZWxaZXJvVGlsZXNZOiBsb3dlc3RMZXZlbFRpbGVzWSxcclxuICAgICAgICBtYXhpbXVtTGV2ZWw6IG1heGltdW1DZXNpdW1MZXZlbFxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5fdGlsaW5nU2NoZW1lID0gY3JlYXRlVGlsaW5nU2NoZW1lKHRoaXMuX3RpbGluZ1NjaGVtZVBhcmFtcyk7XHJcbiAgICAgICAgXHJcbiAgICBDZXNpdW0uVGlsZVByb3ZpZGVyRXJyb3IuaGFuZGxlU3VjY2Vzcyh0aGlzLl9lcnJvckV2ZW50KTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVRpbGluZ1NjaGVtZShwYXJhbXMpIHtcclxuICAgIHZhciBnZW9ncmFwaGljUmVjdGFuZ2xlRm9yQ2VzaXVtID0gbmV3IENlc2l1bS5SZWN0YW5nbGUoXHJcbiAgICAgICAgcGFyYW1zLndlc3QsIHBhcmFtcy5zb3V0aCwgcGFyYW1zLmVhc3QsIHBhcmFtcy5ub3J0aCk7XHJcbiAgICBcclxuICAgIHZhciB0aWxpbmdTY2hlbWUgPSBuZXcgQ2VzaXVtLkdlb2dyYXBoaWNUaWxpbmdTY2hlbWUoe1xyXG4gICAgICAgIHJlY3RhbmdsZTogZ2VvZ3JhcGhpY1JlY3RhbmdsZUZvckNlc2l1bSxcclxuICAgICAgICBudW1iZXJPZkxldmVsWmVyb1RpbGVzWDogcGFyYW1zLmxldmVsWmVyb1RpbGVzWCxcclxuICAgICAgICBudW1iZXJPZkxldmVsWmVyb1RpbGVzWTogcGFyYW1zLmxldmVsWmVyb1RpbGVzWVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB0aWxpbmdTY2hlbWU7XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEltYWdlRGVjb2RlcjtcclxuXHJcbnZhciBXb3JrZXJQcm94eUZldGNoTWFuYWdlciA9IHJlcXVpcmUoJ3dvcmtlcnByb3h5ZmV0Y2htYW5hZ2VyLmpzJyk7XHJcbnZhciBpbWFnZUhlbHBlckZ1bmN0aW9ucyA9IHJlcXVpcmUoJ2ltYWdlSGVscGVyRnVuY3Rpb25zLmpzJyk7XHJcbnZhciBEZWNvZGVKb2JzUG9vbCA9IHJlcXVpcmUoJ2RlY29kZWpvYnNwb29sLmpzJyk7XHJcbnZhciBXb3JrZXJQcm94eVBpeGVsc0RlY29kZXIgPSByZXF1aXJlKCd3b3JrZXJwcm94eXBpeGVsc2RlY29kZXIuanMnKTtcclxudmFyIEltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkgPSByZXF1aXJlKCdpbWFnZXBhcmFtc3JldHJpZXZlcnByb3h5LmpzJyk7XHJcblxyXG4vKiBnbG9iYWwgY29uc29sZTogZmFsc2UgKi9cclxuLyogZ2xvYmFsIFByb21pc2U6IGZhbHNlICovXHJcblxyXG5mdW5jdGlvbiBJbWFnZURlY29kZXIoaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSwgb3B0aW9ucykge1xyXG4gICAgSW1hZ2VQYXJhbXNSZXRyaWV2ZXJQcm94eS5jYWxsKHRoaXMsIGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUpO1xyXG4gICAgXHJcbiAgICB0aGlzLl9vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcclxuICAgIHRoaXMuX29wdGlvbnNXZWJXb3JrZXJzID0gaW1hZ2VIZWxwZXJGdW5jdGlvbnMuY3JlYXRlSW50ZXJuYWxPcHRpb25zKGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUsIHRoaXMuX29wdGlvbnMpO1xyXG4gICAgdmFyIGRlY29kZVdvcmtlcnNMaW1pdCA9IHRoaXMuX29wdGlvbnMud29ya2Vyc0xpbWl0IHx8IDU7XHJcbiAgICBcclxuICAgIHRoaXMuX3RpbGVXaWR0aCA9IHRoaXMuX29wdGlvbnMudGlsZVdpZHRoIHx8IDI1NjtcclxuICAgIHRoaXMuX3RpbGVIZWlnaHQgPSB0aGlzLl9vcHRpb25zLnRpbGVIZWlnaHQgfHwgMjU2O1xyXG4gICAgdGhpcy5fc2hvd0xvZyA9ICEhdGhpcy5fb3B0aW9ucy5zaG93TG9nO1xyXG4gICAgXHJcbiAgICAvKmlmICh0aGlzLl9zaG93TG9nKSB7XHJcbiAgICAgICAgLy8gT2xkIElFXHJcbiAgICAgICAgdGhyb3cgJ3Nob3dMb2cgaXMgbm90IHN1cHBvcnRlZCBvbiB0aGlzIGJyb3dzZXInO1xyXG4gICAgfSovXHJcblxyXG4gICAgdGhpcy5fY2hhbm5lbFN0YXRlcyA9IFtdO1xyXG4gICAgdGhpcy5fZGVjb2RlcnMgPSBbXTtcclxuXHJcbiAgICB0aGlzLl9mZXRjaE1hbmFnZXIgPSBuZXcgV29ya2VyUHJveHlGZXRjaE1hbmFnZXIodGhpcy5fb3B0aW9uc1dlYldvcmtlcnMpO1xyXG4gICAgXHJcbiAgICB2YXIgZGVjb2RlU2NoZWR1bGVyID0gaW1hZ2VIZWxwZXJGdW5jdGlvbnMuY3JlYXRlU2NoZWR1bGVyKFxyXG4gICAgICAgIHRoaXMuX3Nob3dMb2csXHJcbiAgICAgICAgdGhpcy5fb3B0aW9ucy5kZWNvZGVQcmlvcml0aXplcixcclxuICAgICAgICAnZGVjb2RlJyxcclxuICAgICAgICB0aGlzLl9jcmVhdGVEZWNvZGVyLmJpbmQodGhpcyksXHJcbiAgICAgICAgZGVjb2RlV29ya2Vyc0xpbWl0KTtcclxuICAgIFxyXG4gICAgdGhpcy5fZGVjb2RlUHJpb3JpdGl6ZXIgPSBkZWNvZGVTY2hlZHVsZXIucHJpb3JpdGl6ZXI7XHJcblxyXG4gICAgdGhpcy5fcmVxdWVzdHNEZWNvZGVKb2JzUG9vbCA9IG5ldyBEZWNvZGVKb2JzUG9vbChcclxuICAgICAgICB0aGlzLl9mZXRjaE1hbmFnZXIsXHJcbiAgICAgICAgZGVjb2RlU2NoZWR1bGVyLnNjaGVkdWxlcixcclxuICAgICAgICB0aGlzLl90aWxlV2lkdGgsXHJcbiAgICAgICAgdGhpcy5fdGlsZUhlaWdodCxcclxuICAgICAgICAvKm9ubHlXYWl0Rm9yRGF0YUFuZERlY29kZT0qL2ZhbHNlKTtcclxuICAgICAgICBcclxuICAgIHRoaXMuX2NoYW5uZWxzRGVjb2RlSm9ic1Bvb2wgPSBuZXcgRGVjb2RlSm9ic1Bvb2woXHJcbiAgICAgICAgdGhpcy5fZmV0Y2hNYW5hZ2VyLFxyXG4gICAgICAgIGRlY29kZVNjaGVkdWxlci5zY2hlZHVsZXIsXHJcbiAgICAgICAgdGhpcy5fdGlsZVdpZHRoLFxyXG4gICAgICAgIHRoaXMuX3RpbGVIZWlnaHQsXHJcbiAgICAgICAgLypvbmx5V2FpdEZvckRhdGFBbmREZWNvZGU9Ki90cnVlKTtcclxufVxyXG5cclxuSW1hZ2VEZWNvZGVyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoSW1hZ2VQYXJhbXNSZXRyaWV2ZXJQcm94eS5wcm90b3R5cGUpO1xyXG5cclxuSW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5nZXRUaWxlV2lkdGggPSBmdW5jdGlvbiBnZXRUaWxlV2lkdGgoKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcigpO1xyXG4gICAgcmV0dXJuIHRoaXMuX3RpbGVXaWR0aDtcclxufTtcclxuXHJcbkltYWdlRGVjb2Rlci5wcm90b3R5cGUuZ2V0VGlsZUhlaWdodCA9IGZ1bmN0aW9uIGdldFRpbGVIZWlnaHQoKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcigpO1xyXG4gICAgcmV0dXJuIHRoaXMuX3RpbGVIZWlnaHQ7XHJcbn07XHJcbiAgICBcclxuSW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5zZXRTZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXJEYXRhID1cclxuICAgIGZ1bmN0aW9uIHNldFNlcnZlclJlcXVlc3RQcmlvcml0aXplckRhdGEocHJpb3JpdGl6ZXJEYXRhKSB7XHJcbiAgICBcclxuICAgIHRoaXMuX2ZldGNoTWFuYWdlci5zZXRTZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXJEYXRhKFxyXG4gICAgICAgIHByaW9yaXRpemVyRGF0YSk7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXIucHJvdG90eXBlLnNldERlY29kZVByaW9yaXRpemVyRGF0YSA9XHJcbiAgICBmdW5jdGlvbiBzZXREZWNvZGVQcmlvcml0aXplckRhdGEocHJpb3JpdGl6ZXJEYXRhKSB7XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9kZWNvZGVQcmlvcml0aXplciA9PT0gbnVsbCkge1xyXG4gICAgICAgIHRocm93ICdObyBkZWNvZGUgcHJpb3JpdGl6ZXIgaGFzIGJlZW4gc2V0JztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX3Nob3dMb2cpIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnc2V0RGVjb2RlUHJpb3JpdGl6ZXJEYXRhKCcgKyBwcmlvcml0aXplckRhdGEgKyAnKScpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgcHJpb3JpdGl6ZXJEYXRhTW9kaWZpZWQgPSBPYmplY3QuY3JlYXRlKHByaW9yaXRpemVyRGF0YSk7XHJcbiAgICBwcmlvcml0aXplckRhdGFNb2RpZmllZC5pbWFnZSA9IHRoaXM7XHJcbiAgICBcclxuICAgIHRoaXMuX2RlY29kZVByaW9yaXRpemVyLnNldFByaW9yaXRpemVyRGF0YShwcmlvcml0aXplckRhdGFNb2RpZmllZCk7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXIucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbiBvcGVuKHVybCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgcmV0dXJuIHRoaXMuX2ZldGNoTWFuYWdlci5vcGVuKHVybCkudGhlbihmdW5jdGlvbiAoc2l6ZXNQYXJhbXMpIHtcclxuICAgICAgICBzZWxmLl9pbnRlcm5hbFNpemVzUGFyYW1zID0gc2l6ZXNQYXJhbXM7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgc2l6ZXNQYXJhbXM6IHNpemVzUGFyYW1zLFxyXG4gICAgICAgICAgICBhcHBsaWNhdGl2ZVRpbGVXaWR0aCA6IHNlbGYuZ2V0VGlsZVdpZHRoKCksXHJcbiAgICAgICAgICAgIGFwcGxpY2F0aXZlVGlsZUhlaWdodDogc2VsZi5nZXRUaWxlSGVpZ2h0KClcclxuICAgICAgICB9O1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXIucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gY2xvc2UoKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX2RlY29kZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgdGhpcy5fZGVjb2RlcnNbaV0udGVybWluYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuX2ZldGNoTWFuYWdlci5jbG9zZSgpO1xyXG59O1xyXG5cclxuSW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5jcmVhdGVDaGFubmVsID0gZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbChcclxuICAgIGNyZWF0ZWRDYWxsYmFjaykge1xyXG4gICAgXHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcigpO1xyXG4gICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNoYW5uZWxDcmVhdGVkKGNoYW5uZWxIYW5kbGUpIHtcclxuICAgICAgICBzZWxmLl9jaGFubmVsU3RhdGVzW2NoYW5uZWxIYW5kbGVdID0ge1xyXG4gICAgICAgICAgICBkZWNvZGVKb2JzTGlzdGVuZXJIYW5kbGU6IG51bGxcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNyZWF0ZWRDYWxsYmFjayhjaGFubmVsSGFuZGxlKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fZmV0Y2hNYW5hZ2VyLmNyZWF0ZUNoYW5uZWwoXHJcbiAgICAgICAgY2hhbm5lbENyZWF0ZWQpO1xyXG59O1xyXG5cclxuSW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5yZXF1ZXN0UGl4ZWxzID0gZnVuY3Rpb24gcmVxdWVzdFBpeGVscyhpbWFnZVBhcnRQYXJhbXMpIHtcclxuICAgIHRoaXMuX3ZhbGlkYXRlU2l6ZXNDYWxjdWxhdG9yKCk7XHJcbiAgICBcclxuICAgIHZhciBsZXZlbCA9IGltYWdlUGFydFBhcmFtcy5sZXZlbDtcclxuICAgIHZhciBsZXZlbFdpZHRoID0gdGhpcy5fc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsV2lkdGgobGV2ZWwpO1xyXG4gICAgdmFyIGxldmVsSGVpZ2h0ID0gdGhpcy5fc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsSGVpZ2h0KGxldmVsKTtcclxuICAgIFxyXG4gICAgdmFyIHJlc29sdmUsIHJlamVjdDtcclxuICAgIHZhciBhY2N1bXVsYXRlZFJlc3VsdCA9IHt9O1xyXG4gICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKHN0YXJ0UHJvbWlzZSk7XHJcbiAgICByZXR1cm4gcHJvbWlzZTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gc3RhcnRQcm9taXNlKHJlc29sdmVfLCByZWplY3RfKSB7XHJcbiAgICAgICAgcmVzb2x2ZSA9IHJlc29sdmVfO1xyXG4gICAgICAgIHJlamVjdCA9IHJlamVjdF87XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2VsZi5fcmVxdWVzdHNEZWNvZGVKb2JzUG9vbC5mb3JrRGVjb2RlSm9icyhcclxuICAgICAgICAgICAgaW1hZ2VQYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICBpbnRlcm5hbENhbGxiYWNrLFxyXG4gICAgICAgICAgICBpbnRlcm5hbFRlcm1pbmF0ZWRDYWxsYmFjayxcclxuICAgICAgICAgICAgbGV2ZWxXaWR0aCxcclxuICAgICAgICAgICAgbGV2ZWxIZWlnaHQsXHJcbiAgICAgICAgICAgIC8qaXNQcm9ncmVzc2l2ZT0qL2ZhbHNlKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZnVuY3Rpb24gaW50ZXJuYWxDYWxsYmFjayhkZWNvZGVkRGF0YSkge1xyXG4gICAgICAgIGNvcHlQaXhlbHNUb0FjY3VtdWxhdGVkUmVzdWx0KGRlY29kZWREYXRhLCBhY2N1bXVsYXRlZFJlc3VsdCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGludGVybmFsVGVybWluYXRlZENhbGxiYWNrKGlzQWJvcnRlZCkge1xyXG4gICAgICAgIGlmIChpc0Fib3J0ZWQpIHtcclxuICAgICAgICAgICAgcmVqZWN0KCdSZXF1ZXN0IHdhcyBhYm9ydGVkIGR1ZSB0byBmYWlsdXJlIG9yIHByaW9yaXR5Jyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmVzb2x2ZShhY2N1bXVsYXRlZFJlc3VsdCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuSW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5yZXF1ZXN0UGl4ZWxzUHJvZ3Jlc3NpdmUgPSBmdW5jdGlvbiByZXF1ZXN0UGl4ZWxzUHJvZ3Jlc3NpdmUoXHJcbiAgICBpbWFnZVBhcnRQYXJhbXMsXHJcbiAgICBjYWxsYmFjayxcclxuICAgIHRlcm1pbmF0ZWRDYWxsYmFjayxcclxuICAgIGltYWdlUGFydFBhcmFtc05vdE5lZWRlZCxcclxuICAgIGNoYW5uZWxIYW5kbGUpIHtcclxuICAgIFxyXG4gICAgdGhpcy5fdmFsaWRhdGVTaXplc0NhbGN1bGF0b3IoKTtcclxuICAgIFxyXG4gICAgdmFyIGxldmVsID0gaW1hZ2VQYXJ0UGFyYW1zLmxldmVsO1xyXG4gICAgdmFyIGxldmVsV2lkdGggPSB0aGlzLl9zaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWxXaWR0aChsZXZlbCk7XHJcbiAgICB2YXIgbGV2ZWxIZWlnaHQgPSB0aGlzLl9zaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWxIZWlnaHQobGV2ZWwpO1xyXG4gICAgXHJcbiAgICB2YXIgY2hhbm5lbFN0YXRlID0gbnVsbDtcclxuICAgIHZhciBkZWNvZGVKb2JzUG9vbDtcclxuICAgIGlmIChjaGFubmVsSGFuZGxlID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBkZWNvZGVKb2JzUG9vbCA9IHRoaXMuX3JlcXVlc3RzRGVjb2RlSm9ic1Bvb2w7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGRlY29kZUpvYnNQb29sID0gdGhpcy5fY2hhbm5lbHNEZWNvZGVKb2JzUG9vbDtcclxuICAgICAgICBcclxuICAgICAgICBjaGFubmVsU3RhdGUgPSB0aGlzLl9jaGFubmVsU3RhdGVzW2NoYW5uZWxIYW5kbGVdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjaGFubmVsU3RhdGUgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyAnQ2hhbm5lbCBoYW5kbGUgZG9lcyBub3QgZXhpc3QnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGxpc3RlbmVySGFuZGxlID0gZGVjb2RlSm9ic1Bvb2wuZm9ya0RlY29kZUpvYnMoXHJcbiAgICAgICAgaW1hZ2VQYXJ0UGFyYW1zLFxyXG4gICAgICAgIGNhbGxiYWNrLFxyXG4gICAgICAgIHRlcm1pbmF0ZWRDYWxsYmFjayxcclxuICAgICAgICBsZXZlbFdpZHRoLFxyXG4gICAgICAgIGxldmVsSGVpZ2h0LFxyXG4gICAgICAgIC8qaXNQcm9ncmVzc2l2ZT0qL3RydWUsXHJcbiAgICAgICAgaW1hZ2VQYXJ0UGFyYW1zTm90TmVlZGVkKTtcclxuICAgICAgICBcclxuICAgIGlmIChjaGFubmVsSGFuZGxlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBpZiAoY2hhbm5lbFN0YXRlLmRlY29kZUpvYnNMaXN0ZW5lckhhbmRsZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAvLyBVbnJlZ2lzdGVyIGFmdGVyIGZvcmtlZCBuZXcgam9icywgc28gbm8gdGVybWluYXRpb24gb2NjdXJzIG1lYW53aGlsZVxyXG4gICAgICAgICAgICBkZWNvZGVKb2JzUG9vbC51bnJlZ2lzdGVyRm9ya2VkSm9icyhcclxuICAgICAgICAgICAgICAgIGNoYW5uZWxTdGF0ZS5kZWNvZGVKb2JzTGlzdGVuZXJIYW5kbGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjaGFubmVsU3RhdGUuZGVjb2RlSm9ic0xpc3RlbmVySGFuZGxlID0gbGlzdGVuZXJIYW5kbGU7XHJcbiAgICAgICAgdGhpcy5fZmV0Y2hNYW5hZ2VyLm1vdmVDaGFubmVsKGNoYW5uZWxIYW5kbGUsIGltYWdlUGFydFBhcmFtcyk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXIucHJvdG90eXBlLnJlY29ubmVjdCA9IGZ1bmN0aW9uIHJlY29ubmVjdCgpIHtcclxuICAgIHRoaXMuX2ZldGNoTWFuYWdlci5yZWNvbm5lY3QoKTtcclxufTtcclxuXHJcbkltYWdlRGVjb2Rlci5wcm90b3R5cGUuYWxpZ25QYXJhbXNUb1RpbGVzQW5kTGV2ZWwgPSBmdW5jdGlvbiBhbGlnblBhcmFtc1RvVGlsZXNBbmRMZXZlbChyZWdpb24pIHtcclxuXHRyZXR1cm4gaW1hZ2VIZWxwZXJGdW5jdGlvbnMuYWxpZ25QYXJhbXNUb1RpbGVzQW5kTGV2ZWwocmVnaW9uLCB0aGlzKTtcclxufTtcclxuXHJcbkltYWdlRGVjb2Rlci5wcm90b3R5cGUuX2dldFNpemVzUGFyYW1zSW50ZXJuYWwgPSBmdW5jdGlvbiBnZXRTaXplc1BhcmFtc0ludGVybmFsKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2ludGVybmFsU2l6ZXNQYXJhbXM7XHJcbn07XHJcblxyXG5JbWFnZURlY29kZXIucHJvdG90eXBlLl9jcmVhdGVEZWNvZGVyID0gZnVuY3Rpb24gY3JlYXRlRGVjb2RlcigpIHtcclxuICAgIHZhciBkZWNvZGVyID0gbmV3IFdvcmtlclByb3h5UGl4ZWxzRGVjb2Rlcih0aGlzLl9vcHRpb25zV2ViV29ya2Vycyk7XHJcbiAgICB0aGlzLl9kZWNvZGVycy5wdXNoKGRlY29kZXIpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gZGVjb2RlcjtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGNvcHlQaXhlbHNUb0FjY3VtdWxhdGVkUmVzdWx0KGRlY29kZWREYXRhLCBhY2N1bXVsYXRlZFJlc3VsdCkge1xyXG4gICAgdmFyIGJ5dGVzUGVyUGl4ZWwgPSA0O1xyXG4gICAgdmFyIHNvdXJjZVN0cmlkZSA9IGRlY29kZWREYXRhLndpZHRoICogYnl0ZXNQZXJQaXhlbDtcclxuICAgIHZhciB0YXJnZXRTdHJpZGUgPVxyXG4gICAgICAgIGRlY29kZWREYXRhLm9yaWdpbmFsUmVxdWVzdFdpZHRoICogYnl0ZXNQZXJQaXhlbDtcclxuICAgIFxyXG4gICAgaWYgKGFjY3VtdWxhdGVkUmVzdWx0LnBpeGVscyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdmFyIHNpemUgPVxyXG4gICAgICAgICAgICB0YXJnZXRTdHJpZGUgKiBkZWNvZGVkRGF0YS5vcmlnaW5hbFJlcXVlc3RIZWlnaHQ7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGFjY3VtdWxhdGVkUmVzdWx0LnBpeGVscyA9IG5ldyBVaW50OEFycmF5KHNpemUpO1xyXG4gICAgICAgIGFjY3VtdWxhdGVkUmVzdWx0LnhJbk9yaWdpbmFsUmVxdWVzdCA9IDA7XHJcbiAgICAgICAgYWNjdW11bGF0ZWRSZXN1bHQueUluT3JpZ2luYWxSZXF1ZXN0ID0gMDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgd2lkdGggPSBkZWNvZGVkRGF0YS5vcmlnaW5hbFJlcXVlc3RXaWR0aDtcclxuICAgICAgICBhY2N1bXVsYXRlZFJlc3VsdC5vcmlnaW5hbFJlcXVlc3RXaWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIGFjY3VtdWxhdGVkUmVzdWx0LndpZHRoID0gd2lkdGg7XHJcblxyXG4gICAgICAgIHZhciBoZWlnaHQgPSBkZWNvZGVkRGF0YS5vcmlnaW5hbFJlcXVlc3RIZWlnaHQ7XHJcbiAgICAgICAgYWNjdW11bGF0ZWRSZXN1bHQub3JpZ2luYWxSZXF1ZXN0SGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIGFjY3VtdWxhdGVkUmVzdWx0LmhlaWdodCA9IGhlaWdodDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYWNjdW11bGF0ZWRSZXN1bHQuYWxsUmVsZXZhbnRCeXRlc0xvYWRlZCA9XHJcbiAgICAgICAgZGVjb2RlZERhdGEuYWxsUmVsZXZhbnRCeXRlc0xvYWRlZDtcclxuXHJcbiAgICB2YXIgc291cmNlT2Zmc2V0ID0gMDtcclxuICAgIHZhciB0YXJnZXRPZmZzZXQgPVxyXG4gICAgICAgIGRlY29kZWREYXRhLnhJbk9yaWdpbmFsUmVxdWVzdCAqIGJ5dGVzUGVyUGl4ZWwgKyBcclxuICAgICAgICBkZWNvZGVkRGF0YS55SW5PcmlnaW5hbFJlcXVlc3QgKiB0YXJnZXRTdHJpZGU7XHJcbiAgICBcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVjb2RlZERhdGEuaGVpZ2h0OyArK2kpIHtcclxuICAgICAgICB2YXIgc291cmNlU3ViQXJyYXkgPSBkZWNvZGVkRGF0YS5waXhlbHMuc3ViYXJyYXkoXHJcbiAgICAgICAgICAgIHNvdXJjZU9mZnNldCwgc291cmNlT2Zmc2V0ICsgc291cmNlU3RyaWRlKTtcclxuICAgICAgICBcclxuICAgICAgICBhY2N1bXVsYXRlZFJlc3VsdC5waXhlbHMuc2V0KHNvdXJjZVN1YkFycmF5LCB0YXJnZXRPZmZzZXQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNvdXJjZU9mZnNldCArPSBzb3VyY2VTdHJpZGU7XHJcbiAgICAgICAgdGFyZ2V0T2Zmc2V0ICs9IHRhcmdldFN0cmlkZTtcclxuICAgIH1cclxufSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRGVjb2RlSm9iO1xyXG5cclxudmFyIExpbmtlZExpc3QgPSByZXF1aXJlKCdsaW5rZWRsaXN0LmpzJyk7XHJcblxyXG52YXIgcmVxdWVzdElkQ291bnRlciA9IDA7XHJcblxyXG5mdW5jdGlvbiBEZWNvZGVKb2IoXHJcbiAgICBpbWFnZVBhcnRQYXJhbXMsXHJcbiAgICBmZXRjaE1hbmFnZXIsXHJcbiAgICBkZWNvZGVTY2hlZHVsZXIsXHJcbiAgICBvbmx5V2FpdEZvckRhdGFBbmREZWNvZGUpIHtcclxuICAgIFxyXG4gICAgdGhpcy5faXNBYm9ydGVkID0gZmFsc2U7XHJcbiAgICB0aGlzLl9pc1Rlcm1pbmF0ZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuX2lzRmV0Y2hSZXF1ZXN0VGVybWluYXRlZCA9IGZhbHNlO1xyXG4gICAgdGhpcy5faXNGaXJzdFN0YWdlID0gdHJ1ZTtcclxuICAgIHRoaXMuX2lzTWFudWFsbHlBYm9ydGVkID0gZmFsc2U7XHJcblxyXG4gICAgdGhpcy5fZmlyc3REZWNvZGVJbnB1dCA9IG51bGw7XHJcbiAgICB0aGlzLl9wZW5kaW5nRGVjb2RlSW5wdXQgPSBudWxsO1xyXG4gICAgdGhpcy5fYWN0aXZlU3ViSm9icyA9IDE7XHJcbiAgICB0aGlzLl9pbWFnZVBhcnRQYXJhbXMgPSBpbWFnZVBhcnRQYXJhbXM7XHJcbiAgICB0aGlzLl9kZWNvZGVTY2hlZHVsZXIgPSBkZWNvZGVTY2hlZHVsZXI7XHJcbiAgICB0aGlzLl9qb2JTZXF1ZW5jZUlkID0gMDtcclxuICAgIHRoaXMuX2xhc3RGaW5pc2hlZEpvYlNlcXVlbmNlSWQgPSAtMTtcclxuICAgIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRG9uZSA9IDA7XHJcbiAgICB0aGlzLl9saXN0ZW5lcnNMaW5rZWRMaXN0ID0gbmV3IExpbmtlZExpc3QoKTtcclxuICAgIHRoaXMuX3Byb2dyZXNzaXZlTGlzdGVuZXJzQ291bnQgPSAwO1xyXG4gICAgdGhpcy5fcmVxdWVzdElkID0gKytyZXF1ZXN0SWRDb3VudGVyO1xyXG4gICAgdGhpcy5fYWxsUmVsZXZhbnRCeXRlc0xvYWRlZCA9IDA7XHJcbiAgICB0aGlzLl9mZXRjaE1hbmFnZXIgPSBmZXRjaE1hbmFnZXI7XHJcbiAgICB0aGlzLl9zdGFydERlY29kZUJvdW5kID0gdGhpcy5fc3RhcnREZWNvZGUuYmluZCh0aGlzKTtcclxuICAgIHRoaXMuX2RlY29kZUFib3J0ZWRCb3VuZCA9IHRoaXMuX2RlY29kZUFib3J0ZWQuYmluZCh0aGlzKTtcclxuICAgIFxyXG4gICAgZmV0Y2hNYW5hZ2VyLmNyZWF0ZVJlcXVlc3QoXHJcbiAgICAgICAgaW1hZ2VQYXJ0UGFyYW1zLFxyXG4gICAgICAgIHRoaXMsXHJcbiAgICAgICAgdGhpcy5fZGF0YVJlYWR5Rm9yRGVjb2RlLFxyXG4gICAgICAgIHRoaXMuX2ZldGNoVGVybWluYXRlZCxcclxuICAgICAgICBvbmx5V2FpdEZvckRhdGFBbmREZWNvZGUsXHJcbiAgICAgICAgdGhpcy5fcmVxdWVzdElkKTtcclxufVxyXG5cclxuRGVjb2RlSm9iLnByb3RvdHlwZS5yZWdpc3Rlckxpc3RlbmVyID0gZnVuY3Rpb24gcmVnaXN0ZXJMaXN0ZW5lcihsaXN0ZW5lckhhbmRsZSkge1xyXG4gICAgdmFyIGl0ZXJhdG9yID0gdGhpcy5fbGlzdGVuZXJzTGlua2VkTGlzdC5hZGQobGlzdGVuZXJIYW5kbGUpO1xyXG4gICAgXHJcbiAgICBpZiAobGlzdGVuZXJIYW5kbGUuaXNQcm9ncmVzc2l2ZSkge1xyXG4gICAgICAgICsrdGhpcy5fcHJvZ3Jlc3NpdmVMaXN0ZW5lcnNDb3VudDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAodGhpcy5fcHJvZ3Jlc3NpdmVMaXN0ZW5lcnNDb3VudCA9PT0gMSkge1xyXG4gICAgICAgICAgICB0aGlzLl9mZXRjaE1hbmFnZXIuc2V0SXNQcm9ncmVzc2l2ZVJlcXVlc3QoXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9yZXF1ZXN0SWQsIHRydWUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHVucmVnaXN0ZXJIYW5kbGUgPSBpdGVyYXRvcjtcclxuICAgIHJldHVybiB1bnJlZ2lzdGVySGFuZGxlO1xyXG59O1xyXG5cclxuRGVjb2RlSm9iLnByb3RvdHlwZS51bnJlZ2lzdGVyTGlzdGVuZXIgPSBmdW5jdGlvbiB1bnJlZ2lzdGVyTGlzdGVuZXIodW5yZWdpc3RlckhhbmRsZSkge1xyXG4gICAgdmFyIGl0ZXJhdG9yID0gdW5yZWdpc3RlckhhbmRsZTtcclxuICAgIHZhciBsaXN0ZW5lckhhbmRsZSA9IHRoaXMuX2xpc3RlbmVyc0xpbmtlZExpc3QuZ2V0VmFsdWUoaXRlcmF0b3IpO1xyXG5cclxuICAgIHRoaXMuX2xpc3RlbmVyc0xpbmtlZExpc3QucmVtb3ZlKHVucmVnaXN0ZXJIYW5kbGUpO1xyXG4gICAgXHJcbiAgICBpZiAobGlzdGVuZXJIYW5kbGUuaXNQcm9ncmVzc2l2ZSkge1xyXG4gICAgICAgIC0tdGhpcy5fcHJvZ3Jlc3NpdmVMaXN0ZW5lcnNDb3VudDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2xpc3RlbmVyc0xpbmtlZExpc3QuZ2V0Q291bnQoKSA9PT0gMCkge1xyXG4gICAgICAgIHRoaXMuX2ZldGNoTWFuYWdlci5tYW51YWxBYm9ydFJlcXVlc3QoXHJcbiAgICAgICAgICAgIHRoaXMuX3JlcXVlc3RJZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5faXNBYm9ydGVkID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLl9pc1Rlcm1pbmF0ZWQgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuX2lzRmV0Y2hSZXF1ZXN0VGVybWluYXRlZCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5faXNNYW51YWxseUFib3J0ZWQgPSB0cnVlO1xyXG4gICAgfSBlbHNlIGlmICh0aGlzLl9wcm9ncmVzc2l2ZUxpc3RlbmVyc0NvdW50ID09PSAwKSB7XHJcbiAgICAgICAgdGhpcy5fZmV0Y2hNYW5hZ2VyLnNldElzUHJvZ3Jlc3NpdmVSZXF1ZXN0KFxyXG4gICAgICAgICAgICB0aGlzLl9yZXF1ZXN0SWQsIGZhbHNlKTtcclxuICAgIH1cclxufTtcclxuXHJcbkRlY29kZUpvYi5wcm90b3R5cGUuZ2V0SXNUZXJtaW5hdGVkID0gZnVuY3Rpb24gZ2V0SXNUZXJtaW5hdGVkKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2lzVGVybWluYXRlZDtcclxufTtcclxuXHJcbkRlY29kZUpvYi5wcm90b3R5cGUuX2RhdGFSZWFkeUZvckRlY29kZSA9IGZ1bmN0aW9uIGRhdGFSZWFkeUZvckRlY29kZShkYXRhRm9yRGVjb2RlKSB7XHJcbiAgICBpZiAodGhpcy5faXNBYm9ydGVkTm9UZXJtaW5hdGlvbigpIHx8XHJcbiAgICAgICAgdGhpcy5fbGlzdGVuZXJzTGlua2VkTGlzdC5nZXRDb3VudCgpID09PSAwKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTk9URTogU2hvdWxkIGZpbmQgYmV0dGVyIHdheSB0byBjbGVhbiBqb2IgaWYgbGlzdGVuZXJzIGxpc3RcclxuICAgICAgICAvLyBpcyBlbXB0eVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG5cdC8vIEltcGxlbWVudGF0aW9uIGlkZWE6XHJcblx0Ly8gMS4gV2UgaGF2ZSBhdCBtb3N0IG9uZSBhY3RpdmUgZGVjb2RlIHBlciBEZWNvZGVKb2IuIFRodXMgaWYgYWxyZWFkeVxyXG5cdC8vICAgIGFjdGl2ZSBkZWNvZGUgaXMgZG9uZSwgd2UgcHV0IHRoZSBuZXcgZGF0YSBpbiBhIFwicGVuZGluZ0RlY29kZUlucHV0XCJcclxuXHQvLyAgICB2YXJpYWJsZSB3aGljaCB3aWxsIGJlIGRlY29kZWQgd2hlbiBjdXJyZW50IGRlY29kZSBpcyBkb25lLlxyXG5cdC8vIDIuIFdoZW4gd2UgaGF2ZSBtb3JlIHRoYW4gYSBzaW5nbGUgZGVjb2RlIHdlIG5lZWQgdG8gZGVjb2RlIG9ubHkgbGFzdFxyXG5cdC8vICAgIGZldGNoZWQgZGF0YSAoYmVjYXVzZSBpdCBpcyBvZiBoaWdoZXN0IHF1YWxpdHkpLiBUaHVzIG9sZGVyIHBlbmRpbmdcclxuXHQvLyAgICBkYXRhIGlzIG92ZXJyaWRlbiBieSBsYXN0IG9uZS5cclxuXHQvLyAzLiBUaGUgb25seSBjYXNlIHRoYXQgb2xkZXIgZGF0YSBzaG91bGQgYmUgZGVjb2RlZCBpcyB0aGUgbG93ZXN0IHF1YWxpdHlcclxuXHQvLyAgICAod2hpY2ggaXMgdGhlIGZpcnN0IGZldGNoZWQgZGF0YSBhcnJpdmVkKS4gVGhpcyBpcyBiZWNhdXNlIHdlIHdhbnQgdG9cclxuXHQvLyAgICBzaG93IGEgcHJpbWFyeSBpbWFnZSBBU0FQLCBhbmQgdGhlIHRoZSBsb3dlc3QgcXVhbGl0eSBpcyBlYXNpZXIgdG9cclxuXHQvLyAgICB0aGFuIG90aGVycyBkZWNvZGUuXHJcblx0Ly8gVGhlIGlkZWEgZGVzY3JpYmVkIGJlbG93IGlzIGNvcnJlY3QgZm9yIEpQSVAsIGFuZCBJIGd1ZXNzIGZvciBvdGhlclxyXG5cdC8vIGhlYXZ5LWRlY29kZWQgaW1hZ2UgdHlwZXMuIE9uZSBtYXkgYWRkIG9wdGlvbnMgdG8gdGhlIEltYWdlRGVjb2RlclxyXG5cdC8vIGxpYnJhcnkgaW4gb3JkZXIgdG8gY29uZmlndXJlIGFub3RoZXIgYmVoYXZpb3IsIGFuZCBjaGFuZ2UgdGhlXHJcblx0Ly8gaW1wbGVtZW50YXRpb24gaW4gdGhlIERlY29kZUpvYiBjbGFzcyBhY2NvcmRpbmdseS5cclxuXHRcclxuICAgIGlmICh0aGlzLl9pc0ZpcnN0U3RhZ2UpIHtcclxuICAgICAgICB0aGlzLl9maXJzdERlY29kZUlucHV0ID0ge1xyXG4gICAgICAgICAgICBkYXRhRm9yRGVjb2RlOiBkYXRhRm9yRGVjb2RlXHJcbiAgICAgICAgfTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5fcGVuZGluZ0RlY29kZUlucHV0ID0ge1xyXG4gICAgICAgICAgICBkYXRhRm9yRGVjb2RlOiBkYXRhRm9yRGVjb2RlXHJcbiAgICAgICAgfTtcclxuICAgIFxyXG4gICAgICAgIGlmICh0aGlzLl9pc0FscmVhZHlTY2hlZHVsZWROb25GaXJzdEpvYikge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuX2lzQWxyZWFkeVNjaGVkdWxlZE5vbkZpcnN0Sm9iID0gdHJ1ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2lzVGVybWluYXRlZCkge1xyXG4gICAgICAgIHRocm93ICdKb2IgaGFzIGFscmVhZHkgYmVlbiB0ZXJtaW5hdGVkJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5faXNGaXJzdFN0YWdlID0gZmFsc2U7XHJcbiAgICArK3RoaXMuX2FjdGl2ZVN1YkpvYnM7XHJcbiAgICBcclxuICAgIHZhciBqb2JDb250ZXh0ID0ge1xyXG4gICAgICAgIHNlbGY6IHRoaXMsXHJcbiAgICAgICAgaW1hZ2VQYXJ0UGFyYW1zOiB0aGlzLl9pbWFnZVBhcnRQYXJhbXMsXHJcbiAgICAgICAgcHJvZ3Jlc3NpdmVTdGFnZXNEb25lOiB0aGlzLl9wcm9ncmVzc2l2ZVN0YWdlc0RvbmVcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMuX2RlY29kZVNjaGVkdWxlci5lbnF1ZXVlSm9iKFxyXG4gICAgICAgIHRoaXMuX3N0YXJ0RGVjb2RlQm91bmQsIGpvYkNvbnRleHQsIHRoaXMuX2RlY29kZUFib3J0ZWRCb3VuZCk7XHJcbn07XHJcblxyXG5EZWNvZGVKb2IucHJvdG90eXBlLl9zdGFydERlY29kZSA9IGZ1bmN0aW9uIHN0YXJ0RGVjb2RlKGRlY29kZXIsIGpvYkNvbnRleHQpIHtcclxuICAgIHZhciBkZWNvZGVJbnB1dDtcclxuICAgIGlmICh0aGlzLl9maXJzdERlY29kZUlucHV0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgZGVjb2RlSW5wdXQgPSB0aGlzLl9maXJzdERlY29kZUlucHV0O1xyXG4gICAgICAgIHRoaXMuX2ZpcnN0RGVjb2RlSW5wdXQgPSBudWxsO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBkZWNvZGVJbnB1dCA9IHRoaXMuX3BlbmRpbmdEZWNvZGVJbnB1dDtcclxuICAgICAgICB0aGlzLl9wZW5kaW5nRGVjb2RlSW5wdXQgPSBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuX2lzQWxyZWFkeVNjaGVkdWxlZE5vbkZpcnN0Sm9iID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGpvYkNvbnRleHQuYWxsUmVsZXZhbnRCeXRlc0xvYWRlZCA9IGRlY29kZUlucHV0LmRhdGFGb3JEZWNvZGUuYWxsUmVsZXZhbnRCeXRlc0xvYWRlZDtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2lzQWJvcnRlZE5vVGVybWluYXRpb24oKSkge1xyXG4gICAgICAgIC0tdGhpcy5fYWN0aXZlU3ViSm9icztcclxuICAgICAgICB0aGlzLl9kZWNvZGVTY2hlZHVsZXIuam9iRG9uZShkZWNvZGVyLCBqb2JDb250ZXh0KTtcclxuICAgICAgICB0aGlzLl9jaGVja0lmQWxsVGVybWluYXRlZCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGpvYlNlcXVlbmNlSWQgPSArK3RoaXMuX2pvYlNlcXVlbmNlSWQ7XHJcbiAgICBcclxuICAgIHZhciBwYXJhbXMgPSB0aGlzLl9pbWFnZVBhcnRQYXJhbXM7XHJcbiAgICB2YXIgd2lkdGggPSBwYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIHBhcmFtcy5taW5YO1xyXG4gICAgdmFyIGhlaWdodCA9IHBhcmFtcy5tYXhZRXhjbHVzaXZlIC0gcGFyYW1zLm1pblk7XHJcblxyXG4gICAgZGVjb2Rlci5kZWNvZGUoZGVjb2RlSW5wdXQuZGF0YUZvckRlY29kZSkudGhlbihwaXhlbHNEZWNvZGVkQ2FsbGJhY2tJbkNsb3N1cmUpO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBwaXhlbHNEZWNvZGVkQ2FsbGJhY2tJbkNsb3N1cmUoZGVjb2RlUmVzdWx0KSB7XHJcbiAgICAgICAgc2VsZi5fcGl4ZWxzRGVjb2RlZENhbGxiYWNrKFxyXG4gICAgICAgICAgICBkZWNvZGVyLFxyXG4gICAgICAgICAgICBkZWNvZGVSZXN1bHQsXHJcbiAgICAgICAgICAgIGpvYlNlcXVlbmNlSWQsXHJcbiAgICAgICAgICAgIGpvYkNvbnRleHQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHNlbGYgPSBudWxsO1xyXG4gICAgfVxyXG59O1xyXG5cclxuRGVjb2RlSm9iLnByb3RvdHlwZS5fcGl4ZWxzRGVjb2RlZENhbGxiYWNrID0gZnVuY3Rpb24gcGl4ZWxzRGVjb2RlZENhbGxiYWNrKFxyXG4gICAgZGVjb2RlciwgZGVjb2RlUmVzdWx0LCBqb2JTZXF1ZW5jZUlkLCBqb2JDb250ZXh0KSB7XHJcbiAgICBcclxuICAgIHRoaXMuX2RlY29kZVNjaGVkdWxlci5qb2JEb25lKGRlY29kZXIsIGpvYkNvbnRleHQpO1xyXG4gICAgLS10aGlzLl9hY3RpdmVTdWJKb2JzO1xyXG4gICAgXHJcbiAgICB2YXIgcmVsZXZhbnRCeXRlc0xvYWRlZERpZmYgPVxyXG4gICAgICAgIGpvYkNvbnRleHQuYWxsUmVsZXZhbnRCeXRlc0xvYWRlZCAtIHRoaXMuX2FsbFJlbGV2YW50Qnl0ZXNMb2FkZWQ7XHJcbiAgICB0aGlzLl9hbGxSZWxldmFudEJ5dGVzTG9hZGVkID0gam9iQ29udGV4dC5hbGxSZWxldmFudEJ5dGVzTG9hZGVkO1xyXG4gICAgXHJcbiAgICBpZiAodGhpcy5faXNBYm9ydGVkTm9UZXJtaW5hdGlvbigpKSB7XHJcbiAgICAgICAgdGhpcy5fY2hlY2tJZkFsbFRlcm1pbmF0ZWQoKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBsYXN0RmluaXNoZWQgPSB0aGlzLl9sYXN0RmluaXNoZWRKb2JTZXF1ZW5jZUlkO1xyXG4gICAgaWYgKGxhc3RGaW5pc2hlZCA+IGpvYlNlcXVlbmNlSWQpIHtcclxuICAgICAgICAvLyBEbyBub3QgcmVmcmVzaCBwaXhlbHMgd2l0aCBsb3dlciBxdWFsaXR5IHRoYW5cclxuICAgICAgICAvLyB3aGF0IHdhcyBhbHJlYWR5IHJldHVybmVkXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5fY2hlY2tJZkFsbFRlcm1pbmF0ZWQoKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2xhc3RGaW5pc2hlZEpvYlNlcXVlbmNlSWQgPSBqb2JTZXF1ZW5jZUlkO1xyXG4gICAgXHJcbiAgICB2YXIgdGlsZVBhcmFtcyA9IHRoaXMuX2ltYWdlUGFydFBhcmFtcztcclxuICAgIFxyXG4gICAgdmFyIGl0ZXJhdG9yID0gdGhpcy5fbGlzdGVuZXJzTGlua2VkTGlzdC5nZXRGaXJzdEl0ZXJhdG9yKCk7XHJcbiAgICB3aGlsZSAoaXRlcmF0b3IgIT09IG51bGwpIHtcclxuICAgICAgICB2YXIgbGlzdGVuZXJIYW5kbGUgPSB0aGlzLl9saXN0ZW5lcnNMaW5rZWRMaXN0LmdldFZhbHVlKGl0ZXJhdG9yKTtcclxuICAgICAgICB2YXIgb3JpZ2luYWxQYXJhbXMgPSBsaXN0ZW5lckhhbmRsZS5pbWFnZVBhcnRQYXJhbXM7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG9mZnNldFggPSB0aWxlUGFyYW1zLm1pblggLSBvcmlnaW5hbFBhcmFtcy5taW5YO1xyXG4gICAgICAgIHZhciBvZmZzZXRZID0gdGlsZVBhcmFtcy5taW5ZIC0gb3JpZ2luYWxQYXJhbXMubWluWTtcclxuICAgICAgICB2YXIgd2lkdGggPSBvcmlnaW5hbFBhcmFtcy5tYXhYRXhjbHVzaXZlIC0gb3JpZ2luYWxQYXJhbXMubWluWDtcclxuICAgICAgICB2YXIgaGVpZ2h0ID0gb3JpZ2luYWxQYXJhbXMubWF4WUV4Y2x1c2l2ZSAtIG9yaWdpbmFsUGFyYW1zLm1pblk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGlzdGVuZXJIYW5kbGUuYWxsUmVsZXZhbnRCeXRlc0xvYWRlZCArPSByZWxldmFudEJ5dGVzTG9hZGVkRGlmZjtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGVjb2RlZE9mZnNldHRlZCA9IHtcclxuICAgICAgICAgICAgb3JpZ2luYWxSZXF1ZXN0V2lkdGg6IHdpZHRoLFxyXG4gICAgICAgICAgICBvcmlnaW5hbFJlcXVlc3RIZWlnaHQ6IGhlaWdodCxcclxuICAgICAgICAgICAgeEluT3JpZ2luYWxSZXF1ZXN0OiBvZmZzZXRYLFxyXG4gICAgICAgICAgICB5SW5PcmlnaW5hbFJlcXVlc3Q6IG9mZnNldFksXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbWFnZURhdGE6IGRlY29kZVJlc3VsdCxcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGFsbFJlbGV2YW50Qnl0ZXNMb2FkZWQ6IGxpc3RlbmVySGFuZGxlLmFsbFJlbGV2YW50Qnl0ZXNMb2FkZWRcclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxpc3RlbmVySGFuZGxlLmNhbGxiYWNrKGRlY29kZWRPZmZzZXR0ZWQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGl0ZXJhdG9yID0gdGhpcy5fbGlzdGVuZXJzTGlua2VkTGlzdC5nZXROZXh0SXRlcmF0b3IoaXRlcmF0b3IpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX2NoZWNrSWZBbGxUZXJtaW5hdGVkKCk7XHJcbn07XHJcblxyXG5EZWNvZGVKb2IucHJvdG90eXBlLl9mZXRjaFRlcm1pbmF0ZWQgPSBmdW5jdGlvbiBmZXRjaFRlcm1pbmF0ZWQoaXNBYm9ydGVkKSB7XHJcbiAgICBpZiAodGhpcy5faXNNYW51YWxseUFib3J0ZWQpIHtcclxuICAgICAgICAvLyBUaGlzIHNpdHVhdGlvbiBtaWdodCBvY2N1ciBpZiByZXF1ZXN0IGhhcyBiZWVuIHRlcm1pbmF0ZWQsXHJcbiAgICAgICAgLy8gYnV0IHVzZXIncyB0ZXJtaW5hdGVkQ2FsbGJhY2sgaGFzIG5vdCBiZWVuIGNhbGxlZCB5ZXQuIEl0XHJcbiAgICAgICAgLy8gaGFwcGVucyBvbiBXb3JrZXJQcm94eUZldGNoTWFuYWdlciBkdWUgdG8gdGhyZWFkXHJcbiAgICAgICAgLy8gbWVzc2FnZSBkZWxheS5cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuX2lzRmV0Y2hSZXF1ZXN0VGVybWluYXRlZCkge1xyXG4gICAgICAgIHRocm93ICdEb3VibGUgdGVybWluYXRpb24gb2YgZmV0Y2ggcmVxdWVzdCc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2lzRmV0Y2hSZXF1ZXN0VGVybWluYXRlZCA9IHRydWU7XHJcbiAgICAtLXRoaXMuX2FjdGl2ZVN1YkpvYnM7XHJcbiAgICB0aGlzLl9pc0Fib3J0ZWQgfD0gaXNBYm9ydGVkO1xyXG4gICAgXHJcbiAgICB0aGlzLl9jaGVja0lmQWxsVGVybWluYXRlZCgpO1xyXG59O1xyXG5cclxuRGVjb2RlSm9iLnByb3RvdHlwZS5fZGVjb2RlQWJvcnRlZCA9IGZ1bmN0aW9uIGRlY29kZUFib3J0ZWQoam9iQ29udGV4dCkge1xyXG4gICAgdGhpcy5faXNBYm9ydGVkID0gdHJ1ZTtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2ZpcnN0RGVjb2RlSW5wdXQgIT09IG51bGwpIHtcclxuICAgICAgICB0aGlzLl9maXJzdERlY29kZUlucHV0ID0gbnVsbDtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5fcGVuZGluZ0RlY29kZUlucHV0ID0gbnVsbDtcclxuICAgICAgICB0aGlzLl9pc0FscmVhZHlTY2hlZHVsZWROb25GaXJzdEpvYiA9IGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAtLXRoaXMuX2FjdGl2ZVN1YkpvYnM7XHJcbiAgICBcclxuICAgIHRoaXMuX2NoZWNrSWZBbGxUZXJtaW5hdGVkKCk7XHJcbn07XHJcblxyXG5EZWNvZGVKb2IucHJvdG90eXBlLl9pc0Fib3J0ZWROb1Rlcm1pbmF0aW9uID0gZnVuY3Rpb24gX2lzQWJvcnRlZE5vVGVybWluYXRpb24oKSB7XHJcbiAgICBpZiAodGhpcy5faXNNYW51YWxseUFib3J0ZWQpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pc1Rlcm1pbmF0ZWQpIHtcclxuICAgICAgICB0aHJvdyAnVW5leHBlY3RlZCBqb2Igc3RhdGUgb2YgdGVybWluYXRlZDogU3RpbGwgcnVubmluIHN1Yi1qb2JzJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuX2lzQWJvcnRlZDtcclxufTtcclxuXHJcbkRlY29kZUpvYi5wcm90b3R5cGUuX2NoZWNrSWZBbGxUZXJtaW5hdGVkID0gZnVuY3Rpb24gY2hlY2tJZkFsbFRlcm1pbmF0ZWQoKSB7XHJcbiAgICBpZiAodGhpcy5fYWN0aXZlU3ViSm9icyA8IDApIHtcclxuICAgICAgICB0aHJvdyAnSW5jb25zaXN0ZW50IG51bWJlciBvZiBkZWNvZGUgam9icyc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9hY3RpdmVTdWJKb2JzID4gMCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2lzQWxyZWFkeVNjaGVkdWxlZE5vbkZpcnN0Sm9iKSB7XHJcbiAgICAgICAgdGhyb3cgJ0luY29uc2lzdGVudCBpc0FscmVhZHlTY2hlZHVsZWROb25GaXJzdEpvYiBmbGFnJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5faXNUZXJtaW5hdGVkID0gdHJ1ZTtcclxuICAgIHZhciBsaW5rZWRMaXN0ID0gdGhpcy5fbGlzdGVuZXJzTGlua2VkTGlzdDtcclxuICAgIHRoaXMuX2xpc3RlbmVyc0xpbmtlZExpc3QgPSBudWxsO1xyXG5cclxuICAgIHZhciBpdGVyYXRvciA9IGxpbmtlZExpc3QuZ2V0Rmlyc3RJdGVyYXRvcigpO1xyXG4gICAgXHJcbiAgICB3aGlsZSAoaXRlcmF0b3IgIT09IG51bGwpIHtcclxuICAgICAgICB2YXIgbGlzdGVuZXJIYW5kbGUgPSBsaW5rZWRMaXN0LmdldFZhbHVlKGl0ZXJhdG9yKTtcclxuICAgICAgICBsaXN0ZW5lckhhbmRsZS5pc0FueURlY29kZXJBYm9ydGVkIHw9IHRoaXMuX2lzQWJvcnRlZDtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcmVtYWluaW5nID0gLS1saXN0ZW5lckhhbmRsZS5yZW1haW5pbmdEZWNvZGVKb2JzO1xyXG4gICAgICAgIGlmIChyZW1haW5pbmcgPCAwKSB7XHJcbiAgICAgICAgICAgIHRocm93ICdJbmNvbnNpc3RlbnQgbnVtYmVyIG9mIGRvbmUgcmVxdWVzdHMnO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgaXNMaXN0ZW5lckRvbmUgPSByZW1haW5pbmcgPT09IDA7XHJcbiAgICAgICAgaWYgKGlzTGlzdGVuZXJEb25lKSB7XHJcbiAgICAgICAgICAgIGxpc3RlbmVySGFuZGxlLmlzVGVybWluYXRlZENhbGxiYWNrQ2FsbGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgbGlzdGVuZXJIYW5kbGUudGVybWluYXRlZENhbGxiYWNrKFxyXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJIYW5kbGUuaXNBbnlEZWNvZGVyQWJvcnRlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGl0ZXJhdG9yID0gbGlua2VkTGlzdC5nZXROZXh0SXRlcmF0b3IoaXRlcmF0b3IpO1xyXG4gICAgfVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRGVjb2RlSm9ic1Bvb2w7XHJcblxyXG52YXIgRGVjb2RlSm9iID0gcmVxdWlyZSgnZGVjb2Rlam9iLmpzJyk7XHJcblxyXG5mdW5jdGlvbiBEZWNvZGVKb2JzUG9vbChcclxuICAgIGZldGNoTWFuYWdlcixcclxuICAgIGRlY29kZVNjaGVkdWxlcixcclxuICAgIHRpbGVXaWR0aCxcclxuICAgIHRpbGVIZWlnaHQsXHJcbiAgICBvbmx5V2FpdEZvckRhdGFBbmREZWNvZGUpIHtcclxuICAgIFxyXG4gICAgdGhpcy5fdGlsZVdpZHRoID0gdGlsZVdpZHRoO1xyXG4gICAgdGhpcy5fdGlsZUhlaWdodCA9IHRpbGVIZWlnaHQ7XHJcbiAgICB0aGlzLl9hY3RpdmVSZXF1ZXN0cyA9IFtdO1xyXG4gICAgdGhpcy5fb25seVdhaXRGb3JEYXRhQW5kRGVjb2RlID0gb25seVdhaXRGb3JEYXRhQW5kRGVjb2RlO1xyXG4gICAgXHJcbiAgICB0aGlzLl9mZXRjaE1hbmFnZXIgPSBmZXRjaE1hbmFnZXI7XHJcbiAgICBcclxuICAgIHRoaXMuX2RlY29kZVNjaGVkdWxlciA9IGRlY29kZVNjaGVkdWxlcjtcclxufVxyXG5cclxuRGVjb2RlSm9ic1Bvb2wucHJvdG90eXBlLmZvcmtEZWNvZGVKb2JzID0gZnVuY3Rpb24gZm9ya0RlY29kZUpvYnMoXHJcbiAgICBpbWFnZVBhcnRQYXJhbXMsXHJcbiAgICBjYWxsYmFjayxcclxuICAgIHRlcm1pbmF0ZWRDYWxsYmFjayxcclxuICAgIGxldmVsV2lkdGgsXHJcbiAgICBsZXZlbEhlaWdodCxcclxuICAgIGlzUHJvZ3Jlc3NpdmUsXHJcbiAgICBpbWFnZVBhcnRQYXJhbXNOb3ROZWVkZWQpIHtcclxuICAgIFxyXG4gICAgdmFyIG1pblggPSBpbWFnZVBhcnRQYXJhbXMubWluWDtcclxuICAgIHZhciBtaW5ZID0gaW1hZ2VQYXJ0UGFyYW1zLm1pblk7XHJcbiAgICB2YXIgbWF4WCA9IGltYWdlUGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlO1xyXG4gICAgdmFyIG1heFkgPSBpbWFnZVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZTtcclxuICAgIHZhciBsZXZlbCA9IGltYWdlUGFydFBhcmFtcy5sZXZlbCB8fCAwO1xyXG4gICAgdmFyIHF1YWxpdHkgPSBpbWFnZVBhcnRQYXJhbXMucXVhbGl0eTtcclxuICAgIHZhciBwcmlvcml0eURhdGEgPSBpbWFnZVBhcnRQYXJhbXMucmVxdWVzdFByaW9yaXR5RGF0YTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgdmFyIGlzTWluQWxpZ25lZCA9XHJcbiAgICAgICAgbWluWCAlIHRoaXMuX3RpbGVXaWR0aCA9PT0gMCAmJiBtaW5ZICUgdGhpcy5fdGlsZUhlaWdodCA9PT0gMDtcclxuICAgIHZhciBpc01heFhBbGlnbmVkID0gbWF4WCAlIHRoaXMuX3RpbGVXaWR0aCA9PT0gMCB8fCBtYXhYID09PSBsZXZlbFdpZHRoO1xyXG4gICAgdmFyIGlzTWF4WUFsaWduZWQgPSBtYXhZICUgdGhpcy5fdGlsZUhlaWdodCA9PT0gMCB8fCBtYXhZID09PSBsZXZlbEhlaWdodDtcclxuICAgIHZhciBpc09yZGVyVmFsaWQgPSBtaW5YIDwgbWF4WCAmJiBtaW5ZIDwgbWF4WTtcclxuICAgIFxyXG4gICAgaWYgKCFpc01pbkFsaWduZWQgfHwgIWlzTWF4WEFsaWduZWQgfHwgIWlzTWF4WUFsaWduZWQgfHwgIWlzT3JkZXJWYWxpZCkge1xyXG4gICAgICAgIHRocm93ICdpbWFnZVBhcnRQYXJhbXMgZm9yIGRlY29kZXJzIGlzIG5vdCBhbGlnbmVkIHRvICcgK1xyXG4gICAgICAgICAgICAndGlsZSBzaXplIG9yIG5vdCBpbiB2YWxpZCBvcmRlcic7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciByZXF1ZXN0c0luTGV2ZWwgPSBnZXRPckFkZFZhbHVlKHRoaXMuX2FjdGl2ZVJlcXVlc3RzLCBsZXZlbCwgW10pO1xyXG4gICAgdmFyIHJlcXVlc3RzSW5RdWFsaXR5ID0gZ2V0T3JBZGRWYWx1ZShcclxuICAgICAgICByZXF1ZXN0c0luTGV2ZWwsIGltYWdlUGFydFBhcmFtcy5xdWFsaXR5LCBbXSk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgbnVtVGlsZXNYID0gTWF0aC5jZWlsKChtYXhYIC0gbWluWCkgLyB0aGlzLl90aWxlV2lkdGgpO1xyXG4gICAgdmFyIG51bVRpbGVzWSA9IE1hdGguY2VpbCgobWF4WSAtIG1pblkpIC8gdGhpcy5fdGlsZUhlaWdodCk7XHJcbiAgICBcclxuICAgIHZhciBsaXN0ZW5lckhhbmRsZSA9IHtcclxuICAgICAgICBpbWFnZVBhcnRQYXJhbXM6IGltYWdlUGFydFBhcmFtcyxcclxuICAgICAgICBjYWxsYmFjazogY2FsbGJhY2ssXHJcbiAgICAgICAgdGVybWluYXRlZENhbGxiYWNrOiB0ZXJtaW5hdGVkQ2FsbGJhY2ssXHJcbiAgICAgICAgcmVtYWluaW5nRGVjb2RlSm9iczogbnVtVGlsZXNYICogbnVtVGlsZXNZLFxyXG4gICAgICAgIGlzUHJvZ3Jlc3NpdmU6IGlzUHJvZ3Jlc3NpdmUsXHJcbiAgICAgICAgaXNBbnlEZWNvZGVyQWJvcnRlZDogZmFsc2UsXHJcbiAgICAgICAgaXNUZXJtaW5hdGVkQ2FsbGJhY2tDYWxsZWQ6IGZhbHNlLFxyXG4gICAgICAgIGFsbFJlbGV2YW50Qnl0ZXNMb2FkZWQ6IDAsXHJcbiAgICAgICAgdW5yZWdpc3RlckhhbmRsZXM6IFtdXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmb3IgKHZhciB4ID0gbWluWDsgeCA8IG1heFg7IHggKz0gdGhpcy5fdGlsZVdpZHRoKSB7XHJcbiAgICAgICAgdmFyIHJlcXVlc3RzSW5YID0gZ2V0T3JBZGRWYWx1ZShyZXF1ZXN0c0luUXVhbGl0eSwgeCwgW10pO1xyXG4gICAgICAgIHZhciBzaW5nbGVUaWxlTWF4WCA9IE1hdGgubWluKHggKyB0aGlzLl90aWxlV2lkdGgsIGxldmVsV2lkdGgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIHkgPSBtaW5ZOyB5IDwgbWF4WTsgeSArPSB0aGlzLl90aWxlSGVpZ2h0KSB7XHJcbiAgICAgICAgICAgIHZhciBzaW5nbGVUaWxlTWF4WSA9IE1hdGgubWluKHkgKyB0aGlzLl90aWxlSGVpZ2h0LCBsZXZlbEhlaWdodCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgaXNUaWxlTm90TmVlZGVkID0gaXNVbm5lZWRlZChcclxuICAgICAgICAgICAgICAgIHgsXHJcbiAgICAgICAgICAgICAgICB5LFxyXG4gICAgICAgICAgICAgICAgc2luZ2xlVGlsZU1heFgsXHJcbiAgICAgICAgICAgICAgICBzaW5nbGVUaWxlTWF4WSxcclxuICAgICAgICAgICAgICAgIGltYWdlUGFydFBhcmFtc05vdE5lZWRlZCk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGlzVGlsZU5vdE5lZWRlZCkge1xyXG4gICAgICAgICAgICAgICAgLS1saXN0ZW5lckhhbmRsZS5yZW1haW5pbmdEZWNvZGVKb2JzO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGRlY29kZUpvYkNvbnRhaW5lciA9IGdldE9yQWRkVmFsdWUocmVxdWVzdHNJblgsIHksIHt9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChkZWNvZGVKb2JDb250YWluZXIuam9iID09PSB1bmRlZmluZWQgfHxcclxuICAgICAgICAgICAgICAgIGRlY29kZUpvYkNvbnRhaW5lci5qb2IuZ2V0SXNUZXJtaW5hdGVkKCkpIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIHNpbmdsZVRpbGVJbWFnZVBhcnRQYXJhbXMgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWluWDogeCxcclxuICAgICAgICAgICAgICAgICAgICBtaW5ZOiB5LFxyXG4gICAgICAgICAgICAgICAgICAgIG1heFhFeGNsdXNpdmU6IHNpbmdsZVRpbGVNYXhYLFxyXG4gICAgICAgICAgICAgICAgICAgIG1heFlFeGNsdXNpdmU6IHNpbmdsZVRpbGVNYXhZLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiBsZXZlbCxcclxuICAgICAgICAgICAgICAgICAgICBxdWFsaXR5OiBxdWFsaXR5LFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RQcmlvcml0eURhdGE6IHByaW9yaXR5RGF0YVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgZGVjb2RlSm9iQ29udGFpbmVyLmpvYiA9IG5ldyBEZWNvZGVKb2IoXHJcbiAgICAgICAgICAgICAgICAgICAgc2luZ2xlVGlsZUltYWdlUGFydFBhcmFtcyxcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9mZXRjaE1hbmFnZXIsXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVjb2RlU2NoZWR1bGVyLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX29ubHlXYWl0Rm9yRGF0YUFuZERlY29kZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciB1bnJlZ2lzdGVySGFuZGxlID1cclxuICAgICAgICAgICAgICAgIGRlY29kZUpvYkNvbnRhaW5lci5qb2IucmVnaXN0ZXJMaXN0ZW5lcihsaXN0ZW5lckhhbmRsZSk7XHJcbiAgICAgICAgICAgIGxpc3RlbmVySGFuZGxlLnVucmVnaXN0ZXJIYW5kbGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgdW5yZWdpc3RlckhhbmRsZTogdW5yZWdpc3RlckhhbmRsZSxcclxuICAgICAgICAgICAgICAgIGpvYjogZGVjb2RlSm9iQ29udGFpbmVyLmpvYlxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghbGlzdGVuZXJIYW5kbGUuaXNUZXJtaW5hdGVkQ2FsbGJhY2tDYWxsZWQgJiZcclxuICAgICAgICBsaXN0ZW5lckhhbmRsZS5yZW1haW5pbmdEZWNvZGVKb2JzID09PSAwKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGlzdGVuZXJIYW5kbGUuaXNUZXJtaW5hdGVkQ2FsbGJhY2tDYWxsZWQgPSB0cnVlO1xyXG4gICAgICAgIGxpc3RlbmVySGFuZGxlLnRlcm1pbmF0ZWRDYWxsYmFjayhsaXN0ZW5lckhhbmRsZS5pc0FueURlY29kZXJBYm9ydGVkKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIGxpc3RlbmVySGFuZGxlO1xyXG59O1xyXG5cclxuRGVjb2RlSm9ic1Bvb2wucHJvdG90eXBlLnVucmVnaXN0ZXJGb3JrZWRKb2JzID0gZnVuY3Rpb24gdW5yZWdpc3RlckZvcmtlZEpvYnMobGlzdGVuZXJIYW5kbGUpIHtcclxuICAgIGlmIChsaXN0ZW5lckhhbmRsZS5yZW1haW5pbmdEZWNvZGVKb2JzID09PSAwKSB7XHJcbiAgICAgICAgLy8gQWxsIGpvYnMgaGFzIGFscmVhZHkgYmVlbiB0ZXJtaW5hdGVkLCBubyBuZWVkIHRvIHVucmVnaXN0ZXJcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJIYW5kbGUudW5yZWdpc3RlckhhbmRsZXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICB2YXIgaGFuZGxlID0gbGlzdGVuZXJIYW5kbGUudW5yZWdpc3RlckhhbmRsZXNbaV07XHJcbiAgICAgICAgaWYgKGhhbmRsZS5qb2IuZ2V0SXNUZXJtaW5hdGVkKCkpIHtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGhhbmRsZS5qb2IudW5yZWdpc3Rlckxpc3RlbmVyKGhhbmRsZS51bnJlZ2lzdGVySGFuZGxlKTtcclxuICAgIH1cclxufTtcclxuXHJcbmZ1bmN0aW9uIGlzVW5uZWVkZWQoXHJcbiAgICBtaW5YLCBtaW5ZLCBtYXhYLCBtYXhZLCBpbWFnZVBhcnRQYXJhbXNOb3ROZWVkZWQpIHtcclxuICAgIFxyXG4gICAgaWYgKGltYWdlUGFydFBhcmFtc05vdE5lZWRlZCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGltYWdlUGFydFBhcmFtc05vdE5lZWRlZC5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgIHZhciBub3ROZWVkZWQgPSBpbWFnZVBhcnRQYXJhbXNOb3ROZWVkZWRbaV07XHJcbiAgICAgICAgdmFyIGlzSW5YID0gbWluWCA+PSBub3ROZWVkZWQubWluWCAmJiBtYXhYIDw9IG5vdE5lZWRlZC5tYXhYRXhjbHVzaXZlO1xyXG4gICAgICAgIHZhciBpc0luWSA9IG1pblkgPj0gbm90TmVlZGVkLm1pblkgJiYgbWF4WSA8PSBub3ROZWVkZWQubWF4WUV4Y2x1c2l2ZTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNJblggJiYgaXNJblkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldE9yQWRkVmFsdWUocGFyZW50QXJyYXksIGluZGV4LCBkZWZhdWx0VmFsdWUpIHtcclxuICAgIHZhciBzdWJBcnJheSA9IHBhcmVudEFycmF5W2luZGV4XTtcclxuICAgIGlmIChzdWJBcnJheSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgc3ViQXJyYXkgPSBkZWZhdWx0VmFsdWU7XHJcbiAgICAgICAgcGFyZW50QXJyYXlbaW5kZXhdID0gc3ViQXJyYXk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBzdWJBcnJheTtcclxufSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRmV0Y2hKb2I7XHJcblxyXG5GZXRjaEpvYi5GRVRDSF9UWVBFX1JFUVVFU1QgPSAxO1xyXG5GZXRjaEpvYi5GRVRDSF9UWVBFX0NIQU5ORUwgPSAyOyAvLyBtb3ZhYmxlXHJcbkZldGNoSm9iLkZFVENIX1RZUEVfT05MWV9XQUlUX0ZPUl9EQVRBID0gMztcclxuXHJcbmZ1bmN0aW9uIEZldGNoSm9iKGZldGNoZXIsIHNjaGVkdWxlciwgZmV0Y2hUeXBlLCBjb250ZXh0VmFycykge1xyXG4gICAgdGhpcy5fZmV0Y2hlciA9IGZldGNoZXI7XHJcbiAgICB0aGlzLl9zY2hlZHVsZXIgPSBzY2hlZHVsZXI7XHJcbiAgICBcclxuICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnMgPSBbXTtcclxuICAgIHRoaXMuX3Rlcm1pbmF0ZWRMaXN0ZW5lcnMgPSBbXTtcclxuICAgIFxyXG4gICAgdGhpcy5faW1hZ2VQYXJ0UGFyYW1zID0gbnVsbDtcclxuICAgIHRoaXMuX3Byb2dyZXNzaXZlU3RhZ2VzRG9uZSA9IDA7XHJcbiAgICBcclxuICAgIHRoaXMuX2lzWWllbGRlZCA9IGZhbHNlO1xyXG4gICAgdGhpcy5faXNGYWlsdXJlID0gZmFsc2U7XHJcbiAgICB0aGlzLl9pc1Rlcm1pbmF0ZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuX2lzTWFudWFsbHlBYm9ydGVkID0gZmFsc2U7XHJcbiAgICB0aGlzLl9pc0NoYW5uZWwgPSBmZXRjaFR5cGUgPT09IEZldGNoSm9iLkZFVENIX1RZUEVfQ0hBTk5FTDtcclxuXHR0aGlzLl9pc0NoYW5uZWxTdGFydGVkRmV0Y2ggPSBmYWxzZTtcclxuICAgIHRoaXMuX2NvbnRleHRWYXJzID0gY29udGV4dFZhcnM7XHJcbiAgICB0aGlzLl9pc09ubHlXYWl0Rm9yRGF0YSA9IGZldGNoVHlwZSA9PT0gRmV0Y2hKb2IuRkVUQ0hfVFlQRV9PTkxZX1dBSVRfRk9SX0RBVEE7XHJcbiAgICB0aGlzLl91c2VTY2hlZHVsZXIgPSBmZXRjaFR5cGUgPT09IEZldGNoSm9iLkZFVENIX1RZUEVfUkVRVUVTVDtcclxuICAgIHRoaXMuX2ltYWdlRGF0YUNvbnRleHQgPSBudWxsO1xyXG4gICAgdGhpcy5fcmVzb3VyY2UgPSBudWxsO1xyXG4gICAgdGhpcy5fYWJvcnRlZEJvdW5kID0gdGhpcy5fYWJvcnRlZC5iaW5kKHRoaXMpO1xyXG5cdHRoaXMuX2ZldGNoSGFuZGxlID0gbnVsbDtcclxuICAgIC8vdGhpcy5fYWxyZWFkeVRlcm1pbmF0ZWRXaGVuQWxsRGF0YUFycml2ZWQgPSBmYWxzZTtcclxuICAgIFxyXG4gICAgaWYgKGZldGNoVHlwZSA9PT0gRmV0Y2hKb2IuRkVUQ0hfVFlQRV9DSEFOTkVMKSB7XHJcbiAgICAgICAgdGhpcy5fbW92YWJsZUZldGNoU3RhdGUgPSB7fTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5fbW92YWJsZUZldGNoU3RhdGUgPSBudWxsO1xyXG4gICAgfVxyXG59XHJcblxyXG5GZXRjaEpvYi5wcm90b3R5cGUuZmV0Y2ggPSBmdW5jdGlvbiBmZXRjaChpbWFnZVBhcnRQYXJhbXMpIHtcclxuICAgIGlmICh0aGlzLl9pc0NoYW5uZWwpIHtcclxuXHRcdGlmICh0aGlzLl9pbWFnZURhdGFDb250ZXh0ICE9PSBudWxsKSB7XHJcblx0XHRcdHRoaXMuX2ltYWdlRGF0YUNvbnRleHQuZGlzcG9zZSgpO1xyXG5cdFx0fVxyXG4gICAgICAgIHRoaXMuX2ltYWdlUGFydFBhcmFtcyA9IGltYWdlUGFydFBhcmFtcztcclxuICAgICAgICB0aGlzLl9zdGFydEZldGNoKCk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5faW1hZ2VQYXJ0UGFyYW1zICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhyb3cgJ0Nhbm5vdCBmZXRjaCB0d2ljZSBvbiBmZXRjaCB0eXBlIG9mIFwicmVxdWVzdFwiJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5faW1hZ2VQYXJ0UGFyYW1zID0gaW1hZ2VQYXJ0UGFyYW1zO1xyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMuX3VzZVNjaGVkdWxlcikge1xyXG4gICAgICAgIHN0YXJ0UmVxdWVzdCgvKnJlc291cmNlPSovbnVsbCwgdGhpcyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLl9zY2hlZHVsZXIuZW5xdWV1ZUpvYihzdGFydFJlcXVlc3QsIHRoaXMsIGZldGNoQWJvcnRlZEJ5U2NoZWR1bGVyKTtcclxufTtcclxuXHJcbkZldGNoSm9iLnByb3RvdHlwZS5tYW51YWxBYm9ydFJlcXVlc3QgPSBmdW5jdGlvbiBtYW51YWxBYm9ydFJlcXVlc3QoKSB7XHJcbiAgICB0aGlzLl9pc01hbnVhbGx5QWJvcnRlZCA9IHRydWU7XHJcbiAgICB0aGlzLl9pc1Rlcm1pbmF0ZWQgPSB0cnVlO1xyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fZmV0Y2hIYW5kbGUgIT09IG51bGwpIHtcclxuICAgICAgICB0aGlzLl9mZXRjaEhhbmRsZS5hYm9ydEFzeW5jKCkudGhlbih0aGlzLl9hYm9ydGVkQm91bmQpO1xyXG4gICAgfSBlbHNlIHtcclxuXHRcdHRoaXMuX2ltYWdlRGF0YUNvbnRleHQuZGlzcG9zZSgpO1xyXG5cdH1cclxufTtcclxuXHJcbkZldGNoSm9iLnByb3RvdHlwZS5nZXRDb250ZXh0VmFycyA9IGZ1bmN0aW9uIGdldENvbnRleHRWYXJzKHJlcXVlc3RJZCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2NvbnRleHRWYXJzO1xyXG59O1xyXG5cclxuRmV0Y2hKb2IucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gb24oZXZlbnQsIGxpc3RlbmVyKSB7XHJcbiAgICBzd2l0Y2ggKGV2ZW50KSB7XHJcbiAgICAgICAgY2FzZSAnZGF0YSc6XHJcbiAgICAgICAgICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ3Rlcm1pbmF0ZWQnOlxyXG4gICAgICAgICAgICB0aGlzLl90ZXJtaW5hdGVkTGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyAnVW5leHBlY3RlZCBldmVudCAnICsgZXZlbnQ7XHJcbiAgICB9XHJcbn07XHJcblxyXG5GZXRjaEpvYi5wcm90b3R5cGUuc2V0SXNQcm9ncmVzc2l2ZSA9IGZ1bmN0aW9uIHNldElzUHJvZ3Jlc3NpdmUoaXNQcm9ncmVzc2l2ZSkge1xyXG4gICAgdGhpcy5faXNQcm9ncmVzc2l2ZSA9IGlzUHJvZ3Jlc3NpdmU7XHJcblx0aWYgKHRoaXMuX2ltYWdlRGF0YUNvbnRleHQgIT09IG51bGwpIHtcclxuXHRcdHRoaXMuX2ltYWdlRGF0YUNvbnRleHQuc2V0SXNQcm9ncmVzc2l2ZShpc1Byb2dyZXNzaXZlKTtcclxuXHR9XHJcbn07XHJcblxyXG5GZXRjaEpvYi5wcm90b3R5cGUuZ2V0SXNQcm9ncmVzc2l2ZSA9IGZ1bmN0aW9uIGdldElzUHJvZ3Jlc3NpdmUoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5faXNQcm9ncmVzc2l2ZTtcclxufTtcclxuXHJcbkZldGNoSm9iLnByb3RvdHlwZS5fc3RhcnRGZXRjaCA9IGZ1bmN0aW9uIHN0YXJ0RmV0Y2goKSB7XHJcbiAgICB2YXIgaW1hZ2VEYXRhQ29udGV4dCA9IHRoaXMuX2ZldGNoZXIuY3JlYXRlSW1hZ2VEYXRhQ29udGV4dChcclxuICAgICAgICB0aGlzLl9pbWFnZVBhcnRQYXJhbXMpO1xyXG4gICAgXHJcbiAgICB0aGlzLl9pbWFnZURhdGFDb250ZXh0ID0gaW1hZ2VEYXRhQ29udGV4dDtcclxuXHR0aGlzLl9pbWFnZURhdGFDb250ZXh0LnNldElzUHJvZ3Jlc3NpdmUodGhpcy5faXNQcm9ncmVzc2l2ZSk7XHJcblxyXG4gICAgaWYgKGltYWdlRGF0YUNvbnRleHQuaXNEb25lKCkpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX2RhdGFMaXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdGhpcy5fZGF0YUxpc3RlbmVyc1tpXS5jYWxsKHRoaXMsIHRoaXMuX2NvbnRleHRWYXJzLCBpbWFnZURhdGFDb250ZXh0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuX2ZldGNoVGVybWluYXRlZCgvKmlzQWJvcnRlZD0qL2ZhbHNlKTtcclxuICAgICAgICAvL3RoaXMuX2FscmVhZHlUZXJtaW5hdGVkV2hlbkFsbERhdGFBcnJpdmVkID0gdHJ1ZTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChpbWFnZURhdGFDb250ZXh0Lmhhc0RhdGEoKSkge1xyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5fZGF0YUxpc3RlbmVycy5sZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgICB0aGlzLl9kYXRhTGlzdGVuZXJzW2pdLmNhbGwodGhpcywgdGhpcy5fY29udGV4dFZhcnMsIGltYWdlRGF0YUNvbnRleHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgaW1hZ2VEYXRhQ29udGV4dC5vbignZGF0YScsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHNlbGYuX2RhdGFDYWxsYmFjayhpbWFnZURhdGFDb250ZXh0KTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMuX2lzT25seVdhaXRGb3JEYXRhKSB7XHJcblx0XHRpZiAoIXRoaXMuX2lzQ2hhbm5lbCkge1xyXG5cdFx0XHR0aGlzLl9mZXRjaEhhbmRsZSA9IHRoaXMuX2ZldGNoZXIuZmV0Y2goaW1hZ2VEYXRhQ29udGV4dCk7XHJcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzQ2hhbm5lbFN0YXJ0ZWRGZXRjaCkge1xyXG5cdFx0XHR0aGlzLl9mZXRjaGVyLm1vdmVGZXRjaChpbWFnZURhdGFDb250ZXh0LCB0aGlzLl9tb3ZhYmxlRmV0Y2hTdGF0ZSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLl9mZXRjaGVyLnN0YXJ0TW92YWJsZUZldGNoKGltYWdlRGF0YUNvbnRleHQsIHRoaXMuX21vdmFibGVGZXRjaFN0YXRlKTtcclxuXHRcdFx0dGhpcy5faXNDaGFubmVsU3RhcnRlZEZldGNoID0gdHJ1ZTtcclxuXHRcdH1cclxuICAgIH1cclxufTtcclxuXHJcbkZldGNoSm9iLnByb3RvdHlwZS5fZmV0Y2hUZXJtaW5hdGVkID0gZnVuY3Rpb24gZmV0Y2hUZXJtaW5hdGVkKGlzQWJvcnRlZCkge1xyXG4gICAgaWYgKHRoaXMuX2lzWWllbGRlZCB8fCB0aGlzLl9pc1Rlcm1pbmF0ZWQpIHtcclxuICAgICAgICB0aHJvdyAnVW5leHBlY3RlZCByZXF1ZXN0IHN0YXRlIG9uIHRlcm1pbmF0ZWQnO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fcmVzb3VyY2UgIT09IG51bGwpIHtcclxuICAgICAgICBpZiAoaXNBYm9ydGVkKSB7XHJcbiAgICAgICAgICAgIHRocm93ICdVbmV4cGVjdGVkIHJlcXVlc3QgdGVybWluYXRpb24gd2l0aG91dCByZXNvdXJjZSBhbGxvY2F0ZWQnO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fc2NoZWR1bGVyLmpvYkRvbmUodGhpcy5fcmVzb3VyY2UsIHRoaXMpO1xyXG5cclxuICAgICAgICB0aGlzLl9yZXNvdXJjZSA9IG51bGw7XHJcbiAgICB9IGVsc2UgaWYgKCFpc0Fib3J0ZWQgJiYgdGhpcy5fdXNlU2NoZWR1bGVyKSB7XHJcbiAgICAgICAgdGhyb3cgJ0pvYiBleHBlY3RlZCB0byBoYXZlIHJlc291cmNlIG9uIHN1Y2Nlc3NmdWwgdGVybWluYXRpb24nO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGFubmVsIGlzIG5vdCByZWFsbHkgdGVybWluYXRlZCwgYnV0IG9ubHkgZmV0Y2hlcyBhIG5ldyByZWdpb25cclxuICAgIC8vIChzZWUgbW92ZUNoYW5uZWwoKSkuXHJcbiAgICBpZiAoIXRoaXMuX2lzQ2hhbm5lbCkge1xyXG4gICAgICAgIHRoaXMuX2lzVGVybWluYXRlZCA9IHRydWU7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLl90ZXJtaW5hdGVkTGlzdGVuZXJzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3Rlcm1pbmF0ZWRMaXN0ZW5lcnNbaV0oXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9jb250ZXh0VmFycywgdGhpcy5faW1hZ2VEYXRhQ29udGV4dCwgaXNBYm9ydGVkKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pbWFnZURhdGFDb250ZXh0ICE9PSBudWxsICYmICF0aGlzLl9pc0ZhaWx1cmUpIHtcclxuICAgICAgICB0aGlzLl9pbWFnZURhdGFDb250ZXh0LmRpc3Bvc2UoKTtcclxuICAgIH1cclxufTtcclxuXHJcbkZldGNoSm9iLnByb3RvdHlwZS5fY29udGludWVGZXRjaCA9IGZ1bmN0aW9uIGNvbnRpbnVlRmV0Y2goKSB7XHJcbiAgICBpZiAodGhpcy5pc0NoYW5uZWwpIHtcclxuICAgICAgICB0aHJvdyAnVW5leHBlY3RlZCBjYWxsIHRvIGNvbnRpbnVlRmV0Y2ggb24gY2hhbm5lbCc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2ZldGNoSGFuZGxlID0gdGhpcy5fZmV0Y2hlci5mZXRjaCh0aGlzLl9pbWFnZURhdGFDb250ZXh0KTtcclxufTtcclxuXHJcbkZldGNoSm9iLnByb3RvdHlwZS5fZGF0YUNhbGxiYWNrID0gZnVuY3Rpb24gZGF0YUNhbGxiYWNrKGltYWdlRGF0YUNvbnRleHQpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2lzWWllbGRlZCB8fCB0aGlzLl9pc1Rlcm1pbmF0ZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgJ1VuZXhwZWN0ZWQgcmVxdWVzdCBzdGF0ZSBvbiBmZXRjaCBjYWxsYmFjayc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAoaW1hZ2VEYXRhQ29udGV4dCAhPT0gdGhpcy5faW1hZ2VEYXRhQ29udGV4dCkge1xyXG4gICAgICAgICAgICB0aHJvdyAnVW5leHBlY3RlZCBpbWFnZURhdGFDb250ZXh0JztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgICsrdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNEb25lO1xyXG4gICAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fZGF0YUxpc3RlbmVycy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB0aGlzLl9kYXRhTGlzdGVuZXJzW2ldLmNhbGwodGhpcywgdGhpcy5fY29udGV4dFZhcnMsIGltYWdlRGF0YUNvbnRleHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoaW1hZ2VEYXRhQ29udGV4dC5pc0RvbmUoKSkge1xyXG4gICAgICAgICAgICB0aGlzLl9mZXRjaFRlcm1pbmF0ZWQoLyppc0Fib3J0ZWQ9Ki9mYWxzZSk7XHJcbiAgICAgICAgICAgIC8vdGhpcy5fYWxyZWFkeVRlcm1pbmF0ZWRXaGVuQWxsRGF0YUFycml2ZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLl91c2VTY2hlZHVsZXIpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuX3Jlc291cmNlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyAnTm8gcmVzb3VyY2UgYWxsb2NhdGVkIGJ1dCBmZXRjaCBjYWxsYmFjayBjYWxsZWQnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG5cdFx0XHR2YXIgaXNZaWVsZGVkID0gdGhpcy5fc2NoZWR1bGVyLnRyeVlpZWxkKFxyXG5cdFx0XHRcdGNvbnRpbnVlWWllbGRlZFJlcXVlc3QsXHJcblx0XHRcdFx0dGhpcyxcclxuXHRcdFx0XHRmZXRjaEFib3J0ZWRCeVNjaGVkdWxlcixcclxuXHRcdFx0XHRmZXRjaFlpZWxkZWRCeVNjaGVkdWxlcixcclxuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZSk7XHJcbiAgICAgICAgICAgIFxyXG5cdFx0XHRpZiAoaXNZaWVsZGVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9mZXRjaEhhbmRsZS5hYm9ydEFzeW5jKCkudGhlbih0aGlzLl9hYm9ydGVkQm91bmQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIHRoaXMuX2lzRmFpbHVyZSA9IHRydWU7XHJcbiAgICAgICAgZmV0Y2hBYm9ydGVkQnlTY2hlZHVsZXIodGhpcyk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5GZXRjaEpvYi5wcm90b3R5cGUuX2Fib3J0ZWQgPSBmdW5jdGlvbiBhYm9ydGVkKCkge1xyXG4gICAgLy8gVE9ETzogSXQgc2VlbXMgdGhhdCB0aGlzIGZ1bmN0aW9uIGlzIHRvdGFsbHkgaGlzdG9yaWNhbCBjb2RlLiBTaG91bGQgcmV2aWV3IGl0LlxyXG4gICAgXHJcbiAgICAvL2lmICh0aGlzLl9hbHJlYWR5VGVybWluYXRlZFdoZW5BbGxEYXRhQXJyaXZlZCkge1xyXG4gICAgLy8gICAgLy8gUmVzb3VyY2VzIHdlcmUgYWxyZWFkeSByZWxlYXNlZCBBU0FQXHJcbiAgICAvLyAgICByZXR1cm47XHJcbiAgICAvL31cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2lzWWllbGRlZCB8fCB0aGlzLl9yZXNvdXJjZSA9PT0gbnVsbCkge1xyXG4gICAgICAgIHRocm93ICdVbmV4cGVjdGVkIHJlcXVlc3Qgc3RhdGUgb24gc3RvcHBlZCc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pc09ubHlXYWl0Rm9yRGF0YSB8fFxyXG4gICAgICAgIHRoaXMuX2ZldGNoSGFuZGxlID09PSBudWxsKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhyb3cgJ1VuZXhwZWN0ZWQgcmVxdWVzdCB0eXBlIG9uIHN0b3BwZWQnO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvKlxyXG4gICAgaWYgKCFpc0Fib3J0ZWQpIHtcclxuICAgICAgICBpZiAoIXRoaXMuX2lzVGVybWluYXRlZCkge1xyXG4gICAgICAgICAgICB0aHJvdyAnXCJzdG9wcGVkXCIgbGlzdGVuZXIgd2FzIGNhbGxlZCB3aXRoIGlzQWJvcnRlZD1mYWxzZSBidXQgJyArXHJcbiAgICAgICAgICAgICAgICAnaW1hZ2VEYXRhQ29udGV4dCBcImRhdGFcIiBsaXN0ZW5lciB3YXMgbm90IGNhbGxlZCB5ZXQnO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyovXHJcbiAgICBcclxuICAgIHZhciBzY2hlZHVsZXIgPSB0aGlzLl9zY2hlZHVsZXI7XHJcbiAgICBcclxuICAgIHZhciBpc1lpZWxkZWQgPSBzY2hlZHVsZXIudHJ5WWllbGQoXHJcbiAgICAgICAgY29udGludWVZaWVsZGVkUmVxdWVzdCxcclxuICAgICAgICB0aGlzLFxyXG4gICAgICAgIGZldGNoQWJvcnRlZEJ5U2NoZWR1bGVyLFxyXG4gICAgICAgIGZldGNoWWllbGRlZEJ5U2NoZWR1bGVyLFxyXG4gICAgICAgIHRoaXMuX3Jlc291cmNlKTtcclxuICAgIFxyXG4gICAgaWYgKGlzWWllbGRlZCB8fCB0aGlzLl9pc1Rlcm1pbmF0ZWQpIHtcclxuICAgICAgICB0aGlzLl9mZXRjaEhhbmRsZSA9IG51bGw7XHJcbiAgICAgICAgc2NoZWR1bGVyLmpvYkRvbmUodGhpcy5fcmVzb3VyY2UsIHRoaXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fY29udGludWVGZXRjaCgpO1xyXG59O1xyXG5cclxuLy8gUHJvcGVydGllcyBmb3IgRnJ1c3R1bVJlcXVlc2V0UHJpb3JpdGl6ZXJcclxuXHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShGZXRjaEpvYi5wcm90b3R5cGUsICdpbWFnZVBhcnRQYXJhbXMnLCB7XHJcbiAgICBnZXQ6IGZ1bmN0aW9uIGdldEltYWdlUGFydFBhcmFtcygpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5faW1hZ2VQYXJ0UGFyYW1zO1xyXG4gICAgfVxyXG59KTtcclxuXHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShGZXRjaEpvYi5wcm90b3R5cGUsICdwcm9ncmVzc2l2ZVN0YWdlc0RvbmUnLCB7XHJcbiAgICBnZXQ6IGZ1bmN0aW9uIGdldFByb2dyZXNzaXZlU3RhZ2VzRG9uZSgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fcHJvZ3Jlc3NpdmVTdGFnZXNEb25lO1xyXG4gICAgfVxyXG59KTtcclxuXHJcbmZ1bmN0aW9uIHN0YXJ0UmVxdWVzdChyZXNvdXJjZSwgc2VsZikge1xyXG4gICAgaWYgKHNlbGYuX2ltYWdlRGF0YUNvbnRleHQgIT09IG51bGwpIHtcclxuICAgICAgICB0aHJvdyAnVW5leHBlY3RlZCByZXN0YXJ0IG9mIGFscmVhZHkgc3RhcnRlZCByZXF1ZXN0JztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHNlbGYuX2lzTWFudWFsbHlBYm9ydGVkKSB7XHJcbiAgICAgICAgaWYgKHJlc291cmNlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNlbGYuX3NjaGVkdWxlci5qb2JEb25lKHJlc291cmNlLCBzZWxmKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBzZWxmLl9yZXNvdXJjZSA9IHJlc291cmNlO1xyXG4gICAgXHJcbiAgICBzZWxmLl9zdGFydEZldGNoKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbnRpbnVlWWllbGRlZFJlcXVlc3QocmVzb3VyY2UsIHNlbGYpIHtcclxuICAgIGlmIChzZWxmLl9pc01hbnVhbGx5QWJvcnRlZCB8fCBzZWxmLl9pc0ZhaWx1cmUpIHtcclxuICAgICAgICBzZWxmLl9zY2hlZHVsZXIuam9iRG9uZShzZWxmLl9yZXNvdXJjZSwgc2VsZik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXNlbGYuaXNZaWVsZGVkIHx8IHNlbGYuaXNUZXJtaW5hdGVkKSB7XHJcbiAgICAgICAgdGhyb3cgJ1VuZXhwZWN0ZWQgcmVxdWVzdCBzdGF0ZSBvbiBjb250aW51ZSc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHNlbGYuaXNZaWVsZGVkID0gZmFsc2U7XHJcbiAgICBzZWxmLnJlc291cmNlID0gcmVzb3VyY2U7XHJcbiAgICBcclxuICAgIHNlbGYuX2NvbnRpbnVlRmV0Y2goKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZmV0Y2hZaWVsZGVkQnlTY2hlZHVsZXIoc2VsZikge1xyXG4gICAgaWYgKHNlbGYuX2lzWWllbGRlZCB8fCBzZWxmLl9pc1Rlcm1pbmF0ZWQpIHtcclxuICAgICAgICB0aHJvdyAnVW5leHBlY3RlZCByZXF1ZXN0IHN0YXRlIG9uIHlpZWxkJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgc2VsZi5faXNZaWVsZGVkID0gdHJ1ZTtcclxuICAgIHNlbGYuX3Jlc291cmNlID0gbnVsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gZmV0Y2hBYm9ydGVkQnlTY2hlZHVsZXIoc2VsZikge1xyXG4gICAgc2VsZi5faXNZaWVsZGVkID0gZmFsc2U7XHJcbiAgICBzZWxmLl9yZXNvdXJjZSA9IG51bGw7XHJcbiAgICBzZWxmLl9mZXRjaFRlcm1pbmF0ZWQoLyppc0Fib3J0ZWQ9Ki90cnVlKTtcclxufSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRmV0Y2hNYW5hZ2VyO1xyXG5cclxudmFyIGltYWdlSGVscGVyRnVuY3Rpb25zID0gcmVxdWlyZSgnaW1hZ2VoZWxwZXJmdW5jdGlvbnMuanMnKTtcclxudmFyIEZldGNoSm9iID0gcmVxdWlyZSgnZmV0Y2hqb2IuanMnKTtcclxudmFyIEltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkgPSByZXF1aXJlKCdpbWFnZXBhcmFtc3JldHJpZXZlcnByb3h5LmpzJyk7XHJcblxyXG4vKiBnbG9iYWwgY29uc29sZTogZmFsc2UgKi9cclxuXHJcbmZ1bmN0aW9uIEZldGNoTWFuYWdlcihvcHRpb25zKSB7XHJcbiAgICBJbWFnZVBhcmFtc1JldHJpZXZlclByb3h5LmNhbGwodGhpcywgb3B0aW9ucy5pbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lKTtcclxuXHJcbiAgICB2YXIgc2VydmVyUmVxdWVzdHNMaW1pdCA9IG9wdGlvbnMuc2VydmVyUmVxdWVzdHNMaW1pdCB8fCA1O1xyXG4gICAgXHJcbiAgICB0aGlzLl9mZXRjaGVyID0gbnVsbDtcclxuICAgIHRoaXMuX2ludGVybmFsU2l6ZXNQYXJhbXMgPSBudWxsO1xyXG4gICAgdGhpcy5fc2hvd0xvZyA9IG9wdGlvbnMuc2hvd0xvZztcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX3Nob3dMb2cpIHtcclxuICAgICAgICAvLyBPbGQgSUVcclxuICAgICAgICB0aHJvdyAnc2hvd0xvZyBpcyBub3Qgc3VwcG9ydGVkIG9uIHRoaXMgYnJvd3Nlcic7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBzZXJ2ZXJSZXF1ZXN0U2NoZWR1bGVyID0gaW1hZ2VIZWxwZXJGdW5jdGlvbnMuY3JlYXRlU2NoZWR1bGVyKFxyXG4gICAgICAgIG9wdGlvbnMuc2hvd0xvZyxcclxuICAgICAgICBvcHRpb25zLnNlcnZlclJlcXVlc3RQcmlvcml0aXplcixcclxuICAgICAgICAnc2VydmVyUmVxdWVzdCcsXHJcbiAgICAgICAgY3JlYXRlU2VydmVyUmVxdWVzdER1bW15UmVzb3VyY2UsXHJcbiAgICAgICAgc2VydmVyUmVxdWVzdHNMaW1pdCk7XHJcbiAgICBcclxuICAgIHRoaXMuX3NlcnZlclJlcXVlc3RQcmlvcml0aXplciA9IHNlcnZlclJlcXVlc3RTY2hlZHVsZXIucHJpb3JpdGl6ZXI7XHJcbiAgICBcclxuICAgIHRoaXMuX3NjaGVkdWxlciA9IHNlcnZlclJlcXVlc3RTY2hlZHVsZXIuc2NoZWR1bGVyO1xyXG4gICAgdGhpcy5fY2hhbm5lbEhhbmRsZUNvdW50ZXIgPSAwO1xyXG4gICAgdGhpcy5fY2hhbm5lbEhhbmRsZXMgPSBbXTtcclxuICAgIHRoaXMuX3JlcXVlc3RCeUlkID0gW107XHJcbn1cclxuXHJcbkZldGNoTWFuYWdlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlKTtcclxuXHJcbkZldGNoTWFuYWdlci5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uIG9wZW4odXJsKSB7XHJcbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMuX2ltYWdlSW1wbGVtZW50YXRpb24uY3JlYXRlRmV0Y2hlcih1cmwsIHtpc1JldHVyblByb21pc2U6IHRydWV9KTtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHJldHVybiBwcm9taXNlLnRoZW4oZnVuY3Rpb24ocmVzdWx0KSB7XHJcbiAgICAgICAgc2VsZi5fZmV0Y2hlciA9IHJlc3VsdC5mZXRjaGVyO1xyXG4gICAgICAgIHNlbGYuX2ludGVybmFsU2l6ZXNQYXJhbXMgPSByZXN1bHQuc2l6ZXNQYXJhbXM7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5zaXplc1BhcmFtcztcclxuICAgIH0pO1xyXG59O1xyXG5cclxuRmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5jbG9zZSA9IGZ1bmN0aW9uIGNsb3NlKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2ZldGNoZXIuY2xvc2Uoe2lzUmV0dXJuUHJvbWlzZTogdHJ1ZX0pO1xyXG59O1xyXG5cclxuRmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5zZXRJc1Byb2dyZXNzaXZlUmVxdWVzdCA9IGZ1bmN0aW9uIHNldElzUHJvZ3Jlc3NpdmVSZXF1ZXN0KFxyXG4gICAgcmVxdWVzdElkLCBpc1Byb2dyZXNzaXZlKSB7XHJcbiAgICBcclxuICAgIHZhciBmZXRjaEpvYiA9IHRoaXMuX3JlcXVlc3RCeUlkW3JlcXVlc3RJZF07XHJcbiAgICBpZiAoZmV0Y2hKb2IgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIC8vIFRoaXMgc2l0dWF0aW9uIG1pZ2h0IG9jY3VyIGlmIHJlcXVlc3QgaGFzIGJlZW4gdGVybWluYXRlZCxcclxuICAgICAgICAvLyBidXQgdXNlcidzIHRlcm1pbmF0ZWRDYWxsYmFjayBoYXMgbm90IGJlZW4gY2FsbGVkIHlldC4gSXRcclxuICAgICAgICAvLyBoYXBwZW5zIG9uIFdvcmtlclByb3h5RmV0Y2hNYW5hZ2VyIGR1ZSB0byB0aHJlYWRcclxuICAgICAgICAvLyBtZXNzYWdlIGRlbGF5LlxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmZXRjaEpvYi5zZXRJc1Byb2dyZXNzaXZlKGlzUHJvZ3Jlc3NpdmUpO1xyXG59O1xyXG5cclxuRmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5jcmVhdGVDaGFubmVsID0gZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbChcclxuICAgIGNyZWF0ZWRDYWxsYmFjaykge1xyXG4gICAgXHJcbiAgICB2YXIgY2hhbm5lbEhhbmRsZSA9ICsrdGhpcy5fY2hhbm5lbEhhbmRsZUNvdW50ZXI7XHJcbiAgICB0aGlzLl9jaGFubmVsSGFuZGxlc1tjaGFubmVsSGFuZGxlXSA9IG5ldyBGZXRjaEpvYihcclxuICAgICAgICB0aGlzLl9mZXRjaGVyLFxyXG4gICAgICAgIHRoaXMuX3NjaGVkdWxlcixcclxuICAgICAgICBGZXRjaEpvYi5GRVRDSF9UWVBFX0NIQU5ORUwsXHJcbiAgICAgICAgLypjb250ZXh0VmFycz0qL251bGwpO1xyXG5cclxuICAgIGNyZWF0ZWRDYWxsYmFjayhjaGFubmVsSGFuZGxlKTtcclxufTtcclxuXHJcbkZldGNoTWFuYWdlci5wcm90b3R5cGUubW92ZUNoYW5uZWwgPSBmdW5jdGlvbiBtb3ZlQ2hhbm5lbChcclxuICAgIGNoYW5uZWxIYW5kbGUsIGltYWdlUGFydFBhcmFtcykge1xyXG4gICAgXHJcbiAgICB2YXIgY2hhbm5lbCA9IHRoaXMuX2NoYW5uZWxIYW5kbGVzW2NoYW5uZWxIYW5kbGVdO1xyXG4gICAgY2hhbm5lbC5mZXRjaChpbWFnZVBhcnRQYXJhbXMpO1xyXG59O1xyXG5cclxuRmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5jcmVhdGVSZXF1ZXN0ID0gZnVuY3Rpb24gY3JlYXRlUmVxdWVzdChcclxuICAgIGZldGNoUGFyYW1zLFxyXG4gICAgY2FsbGJhY2tUaGlzLFxyXG4gICAgY2FsbGJhY2ssXHJcbiAgICB0ZXJtaW5hdGVkQ2FsbGJhY2ssXHJcbiAgICBpc09ubHlXYWl0Rm9yRGF0YSxcclxuICAgIHJlcXVlc3RJZCkge1xyXG4gICAgXHJcbiAgICB2YXIgY29udGV4dFZhcnMgPSB7XHJcbiAgICAgICAgcHJvZ3Jlc3NpdmVTdGFnZXNEb25lOiAwLFxyXG4gICAgICAgIGlzTGFzdENhbGxiYWNrQ2FsbGVkV2l0aG91dExvd1F1YWxpdHlMaW1pdDogZmFsc2UsXHJcbiAgICAgICAgY2FsbGJhY2tUaGlzOiBjYWxsYmFja1RoaXMsXHJcbiAgICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxyXG4gICAgICAgIHRlcm1pbmF0ZWRDYWxsYmFjazogdGVybWluYXRlZENhbGxiYWNrLFxyXG4gICAgICAgIHJlcXVlc3RJZDogcmVxdWVzdElkLFxyXG4gICAgICAgIGZldGNoSm9iOiBudWxsLFxyXG4gICAgICAgIHNlbGY6IHRoaXNcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciBmZXRjaFR5cGUgPSBpc09ubHlXYWl0Rm9yRGF0YSA/XHJcbiAgICAgICAgRmV0Y2hKb2IuRkVUQ0hfVFlQRV9PTkxZX1dBSVRfRk9SX0RBVEEgOiBGZXRjaEpvYi5GRVRDSF9UWVBFX1JFUVVFU1Q7XHJcbiAgICBcclxuICAgIHZhciBmZXRjaEpvYiA9IG5ldyBGZXRjaEpvYihcclxuICAgICAgICB0aGlzLl9mZXRjaGVyLCB0aGlzLl9zY2hlZHVsZXIsIGZldGNoVHlwZSwgY29udGV4dFZhcnMpO1xyXG4gICAgXHJcbiAgICBjb250ZXh0VmFycy5mZXRjaEpvYiA9IGZldGNoSm9iO1xyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fcmVxdWVzdEJ5SWRbcmVxdWVzdElkXSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdGhyb3cgJ0R1cGxpY2F0aW9uIG9mIHJlcXVlc3RJZCAnICsgcmVxdWVzdElkO1xyXG4gICAgfSBlbHNlIGlmIChyZXF1ZXN0SWQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRoaXMuX3JlcXVlc3RCeUlkW3JlcXVlc3RJZF0gPSBmZXRjaEpvYjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZmV0Y2hKb2Iub24oJ2RhdGEnLCBpbnRlcm5hbENhbGxiYWNrKTtcclxuICAgIGZldGNoSm9iLm9uKCd0ZXJtaW5hdGVkJywgaW50ZXJuYWxUZXJtaW5hdGVkQ2FsbGJhY2spO1xyXG4gICAgXHJcbiAgICBmZXRjaEpvYi5mZXRjaChmZXRjaFBhcmFtcyk7XHJcbn07XHJcblxyXG5GZXRjaE1hbmFnZXIucHJvdG90eXBlLm1hbnVhbEFib3J0UmVxdWVzdCA9IGZ1bmN0aW9uIG1hbnVhbEFib3J0UmVxdWVzdChcclxuICAgIHJlcXVlc3RJZCkge1xyXG4gICAgXHJcbiAgICB2YXIgZmV0Y2hKb2IgPSB0aGlzLl9yZXF1ZXN0QnlJZFtyZXF1ZXN0SWRdO1xyXG4gICAgXHJcbiAgICBpZiAoZmV0Y2hKb2IgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIC8vIFRoaXMgc2l0dWF0aW9uIG1pZ2h0IG9jY3VyIGlmIHJlcXVlc3QgaGFzIGJlZW4gdGVybWluYXRlZCxcclxuICAgICAgICAvLyBidXQgdXNlcidzIHRlcm1pbmF0ZWRDYWxsYmFjayBoYXMgbm90IGJlZW4gY2FsbGVkIHlldC4gSXRcclxuICAgICAgICAvLyBoYXBwZW5zIG9uIFdvcmtlclByb3h5RmV0Y2hNYW5hZ2VyIGR1ZSB0byB3ZWIgd29ya2VyXHJcbiAgICAgICAgLy8gbWVzc2FnZSBkZWxheS5cclxuICAgICAgICBcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZldGNoSm9iLm1hbnVhbEFib3J0UmVxdWVzdCgpO1xyXG4gICAgZGVsZXRlIHRoaXMuX3JlcXVlc3RCeUlkW3JlcXVlc3RJZF07XHJcbn07XHJcblxyXG5GZXRjaE1hbmFnZXIucHJvdG90eXBlLnJlY29ubmVjdCA9IGZ1bmN0aW9uIHJlY29ubmVjdCgpIHtcclxuICAgIHRoaXMuX2ZldGNoZXIucmVjb25uZWN0KCk7XHJcbn07XHJcblxyXG5GZXRjaE1hbmFnZXIucHJvdG90eXBlLnNldFNlcnZlclJlcXVlc3RQcmlvcml0aXplckRhdGEgPVxyXG4gICAgZnVuY3Rpb24gc2V0U2VydmVyUmVxdWVzdFByaW9yaXRpemVyRGF0YShwcmlvcml0aXplckRhdGEpIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmVyUmVxdWVzdFByaW9yaXRpemVyID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHRocm93ICdObyBzZXJ2ZXJSZXF1ZXN0IHByaW9yaXRpemVyIGhhcyBiZWVuIHNldCc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0aGlzLl9zaG93TG9nKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdzZXRTZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXJEYXRhKCcgKyBwcmlvcml0aXplckRhdGEgKyAnKScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwcmlvcml0aXplckRhdGEuaW1hZ2UgPSB0aGlzO1xyXG4gICAgICAgIHRoaXMuX3NlcnZlclJlcXVlc3RQcmlvcml0aXplci5zZXRQcmlvcml0aXplckRhdGEocHJpb3JpdGl6ZXJEYXRhKTtcclxuICAgIH07XHJcblxyXG5GZXRjaE1hbmFnZXIucHJvdG90eXBlLl9nZXRTaXplc1BhcmFtc0ludGVybmFsID0gZnVuY3Rpb24gZ2V0U2l6ZXNQYXJhbXNJbnRlcm5hbCgpIHtcclxuICAgIHJldHVybiB0aGlzLl9pbnRlcm5hbFNpemVzUGFyYW1zO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gaW50ZXJuYWxDYWxsYmFjayhjb250ZXh0VmFycywgaW1hZ2VEYXRhQ29udGV4dCkge1xyXG4gICAgdmFyIGlzUHJvZ3Jlc3NpdmUgPSBjb250ZXh0VmFycy5mZXRjaEpvYi5nZXRJc1Byb2dyZXNzaXZlKCk7XHJcbiAgICB2YXIgaXNMaW1pdFRvTG93UXVhbGl0eSA9IFxyXG4gICAgICAgIGNvbnRleHRWYXJzLnByb2dyZXNzaXZlU3RhZ2VzRG9uZSA9PT0gMDtcclxuICAgIFxyXG4gICAgLy8gU2VlIGNvbW1lbnQgYXQgaW50ZXJuYWxUZXJtaW5hdGVkQ2FsbGJhY2sgbWV0aG9kXHJcbiAgICBjb250ZXh0VmFycy5pc0xhc3RDYWxsYmFja0NhbGxlZFdpdGhvdXRMb3dRdWFsaXR5TGltaXQgfD1cclxuICAgICAgICBpc1Byb2dyZXNzaXZlICYmICFpc0xpbWl0VG9Mb3dRdWFsaXR5O1xyXG4gICAgXHJcbiAgICBpZiAoIWlzUHJvZ3Jlc3NpdmUpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBxdWFsaXR5ID0gaXNMaW1pdFRvTG93UXVhbGl0eSA/IGNvbnRleHRWYXJzLnNlbGYuZ2V0TG93ZXN0UXVhbGl0eSgpIDogdW5kZWZpbmVkO1xyXG4gICAgXHJcbiAgICArK2NvbnRleHRWYXJzLnByb2dyZXNzaXZlU3RhZ2VzRG9uZTtcclxuICAgIFxyXG4gICAgZXh0cmFjdERhdGFBbmRDYWxsQ2FsbGJhY2soY29udGV4dFZhcnMsIGltYWdlRGF0YUNvbnRleHQsIHF1YWxpdHkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbnRlcm5hbFRlcm1pbmF0ZWRDYWxsYmFjayhjb250ZXh0VmFycywgaW1hZ2VEYXRhQ29udGV4dCwgaXNBYm9ydGVkKSB7XHJcbiAgICBpZiAoIWNvbnRleHRWYXJzLmlzTGFzdENhbGxiYWNrQ2FsbGVkV2l0aG91dExvd1F1YWxpdHlMaW1pdCkge1xyXG4gICAgICAgIC8vIFRoaXMgY29uZGl0aW9uIGNvbWUgdG8gY2hlY2sgaWYgYW5vdGhlciBkZWNvZGluZyBzaG91bGQgYmUgZG9uZS5cclxuICAgICAgICAvLyBPbmUgc2l0dWF0aW9uIGl0IG1heSBoYXBwZW4gaXMgd2hlbiB0aGUgcmVxdWVzdCBpcyBub3RcclxuICAgICAgICAvLyBwcm9ncmVzc2l2ZSwgdGhlbiB0aGUgZGVjb2RpbmcgaXMgZG9uZSBvbmx5IG9uIHRlcm1pbmF0aW9uLlxyXG4gICAgICAgIC8vIEFub3RoZXIgc2l0dWF0aW9uIGlzIHdoZW4gb25seSB0aGUgZmlyc3Qgc3RhZ2UgaGFzIGJlZW4gcmVhY2hlZCxcclxuICAgICAgICAvLyB0aHVzIHRoZSBjYWxsYmFjayB3YXMgY2FsbGVkIHdpdGggb25seSB0aGUgZmlyc3QgcXVhbGl0eSAoZm9yXHJcbiAgICAgICAgLy8gcGVyZm9ybWFuY2UgcmVhc29ucykuIFRodXMgYW5vdGhlciBkZWNvZGluZyBzaG91bGQgYmUgZG9uZS5cclxuICAgICAgICBcclxuICAgICAgICBleHRyYWN0RGF0YUFuZENhbGxDYWxsYmFjayhjb250ZXh0VmFycywgaW1hZ2VEYXRhQ29udGV4dCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnRleHRWYXJzLnRlcm1pbmF0ZWRDYWxsYmFjay5jYWxsKFxyXG4gICAgICAgIGNvbnRleHRWYXJzLmNhbGxiYWNrVGhpcywgaXNBYm9ydGVkKTtcclxuICAgIFxyXG4gICAgZGVsZXRlIGNvbnRleHRWYXJzLnNlbGYuX3JlcXVlc3RCeUlkW2NvbnRleHRWYXJzLnJlcXVlc3RJZF07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV4dHJhY3REYXRhQW5kQ2FsbENhbGxiYWNrKGNvbnRleHRWYXJzLCBpbWFnZURhdGFDb250ZXh0LCBxdWFsaXR5KSB7XHJcbiAgICB2YXIgZGF0YUZvckRlY29kZSA9IGltYWdlRGF0YUNvbnRleHQuZ2V0RmV0Y2hlZERhdGEocXVhbGl0eSk7XHJcbiAgICBcclxuICAgIGNvbnRleHRWYXJzLmNhbGxiYWNrLmNhbGwoXHJcbiAgICAgICAgY29udGV4dFZhcnMuY2FsbGJhY2tUaGlzLCBkYXRhRm9yRGVjb2RlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlU2VydmVyUmVxdWVzdER1bW15UmVzb3VyY2UoKSB7XHJcbiAgICByZXR1cm4ge307XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZydXN0dW1SZXF1ZXN0c1ByaW9yaXRpemVyO1xyXG52YXIgUFJJT1JJVFlfQUJPUlRfTk9UX0lOX0ZSVVNUVU0gPSAtMTtcclxudmFyIFBSSU9SSVRZX0NBTENVTEFUSU9OX0ZBSUxFRCA9IDA7XHJcbnZhciBQUklPUklUWV9UT09fR09PRF9SRVNPTFVUSU9OID0gMTtcclxudmFyIFBSSU9SSVRZX05PVF9JTl9GUlVTVFVNID0gMjtcclxudmFyIFBSSU9SSVRZX0xPV0VSX1JFU09MVVRJT04gPSAzO1xyXG5cclxudmFyIFBSSU9SSVRZX01JTk9SSVRZX0lOX0ZSVVNUVU0gPSA0O1xyXG52YXIgUFJJT1JJVFlfUEFSVElBTF9JTl9GUlVTVFVNID0gNTtcclxudmFyIFBSSU9SSVRZX01BSk9SSVRZX0lOX0ZSVVNUVU0gPSA2O1xyXG52YXIgUFJJT1JJVFlfRlVMTFlfSU5fRlJVU1RVTSA9IDc7XHJcblxyXG52YXIgQUREX1BSSU9SSVRZX1RPX0xPV19RVUFMSVRZID0gNTtcclxuXHJcbnZhciBQUklPUklUWV9ISUdIRVNUID0gMTM7XHJcblxyXG52YXIgbG9nMiA9IE1hdGgubG9nKDIpO1xyXG5cclxuZnVuY3Rpb24gRnJ1c3R1bVJlcXVlc3RzUHJpb3JpdGl6ZXIoXHJcbiAgICBpc0Fib3J0UmVxdWVzdHNOb3RJbkZydXN0dW0sIGlzUHJpb3JpdGl6ZUxvd1Byb2dyZXNzaXZlU3RhZ2UpIHtcclxuICAgIFxyXG4gICAgdGhpcy5fZnJ1c3R1bURhdGEgPSBudWxsO1xyXG4gICAgdGhpcy5faXNBYm9ydFJlcXVlc3RzTm90SW5GcnVzdHVtID0gaXNBYm9ydFJlcXVlc3RzTm90SW5GcnVzdHVtO1xyXG4gICAgdGhpcy5faXNQcmlvcml0aXplTG93UHJvZ3Jlc3NpdmVTdGFnZSA9IGlzUHJpb3JpdGl6ZUxvd1Byb2dyZXNzaXZlU3RhZ2U7XHJcbn1cclxuXHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShcclxuICAgIEZydXN0dW1SZXF1ZXN0c1ByaW9yaXRpemVyLnByb3RvdHlwZSwgJ21pbmltYWxMb3dRdWFsaXR5UHJpb3JpdHknLCB7XHJcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiBtaW5pbWFsTG93UXVhbGl0eVByaW9yaXR5KCkge1xyXG4gICAgICAgICAgICByZXR1cm4gUFJJT1JJVFlfTUlOT1JJVFlfSU5fRlJVU1RVTSArIEFERF9QUklPUklUWV9UT19MT1dfUVVBTElUWTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbik7XHJcbiAgICBcclxuRnJ1c3R1bVJlcXVlc3RzUHJpb3JpdGl6ZXIucHJvdG90eXBlLnNldFByaW9yaXRpemVyRGF0YSA9IGZ1bmN0aW9uIHNldFByaW9yaXRpemVyRGF0YShwcmlvcml0aXplckRhdGEpIHtcclxuICAgIHRoaXMuX2ZydXN0dW1EYXRhID0gcHJpb3JpdGl6ZXJEYXRhO1xyXG59O1xyXG5cclxuRnJ1c3R1bVJlcXVlc3RzUHJpb3JpdGl6ZXIucHJvdG90eXBlLmdldFByaW9yaXR5ID0gZnVuY3Rpb24gZ2V0UHJpb3JpdHkoam9iQ29udGV4dCkge1xyXG4gICAgdmFyIGltYWdlUGFydFBhcmFtcyA9IGpvYkNvbnRleHQuaW1hZ2VQYXJ0UGFyYW1zO1xyXG4gICAgaWYgKGltYWdlUGFydFBhcmFtcy5yZXF1ZXN0UHJpb3JpdHlEYXRhLm92ZXJyaWRlSGlnaGVzdFByaW9yaXR5KSB7XHJcbiAgICAgICAgcmV0dXJuIFBSSU9SSVRZX0hJR0hFU1Q7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHByaW9yaXR5ID0gdGhpcy5fZ2V0UHJpb3JpdHlJbnRlcm5hbChpbWFnZVBhcnRQYXJhbXMpO1xyXG4gICAgdmFyIGlzSW5GcnVzdHVtID0gcHJpb3JpdHkgPj0gUFJJT1JJVFlfTUlOT1JJVFlfSU5fRlJVU1RVTTtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2lzQWJvcnRSZXF1ZXN0c05vdEluRnJ1c3R1bSAmJiAhaXNJbkZydXN0dW0pIHtcclxuICAgICAgICByZXR1cm4gUFJJT1JJVFlfQUJPUlRfTk9UX0lOX0ZSVVNUVU07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBwcmlvcml0aXplTG93UHJvZ3Jlc3NpdmVTdGFnZSA9IDA7XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pc1ByaW9yaXRpemVMb3dQcm9ncmVzc2l2ZVN0YWdlICYmIGlzSW5GcnVzdHVtKSB7XHJcbiAgICAgICAgaWYgKGpvYkNvbnRleHQucHJvZ3Jlc3NpdmVTdGFnZXNEb25lID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgJ01pc3NpbmcgcHJvZ3Jlc3NpdmUgc3RhZ2UgaW5mb3JtYXRpb24nO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwcmlvcml0aXplTG93UHJvZ3Jlc3NpdmVTdGFnZSA9XHJcbiAgICAgICAgICAgIGpvYkNvbnRleHQucHJvZ3Jlc3NpdmVTdGFnZXNEb25lID09PSAwID8gQUREX1BSSU9SSVRZX1RPX0xPV19RVUFMSVRZIDpcclxuICAgICAgICAgICAgam9iQ29udGV4dC5wcm9ncmVzc2l2ZVN0YWdlc0RvbmUgPT09IDEgPyAxIDpcclxuICAgICAgICAgICAgMDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHByaW9yaXR5ICsgcHJpb3JpdGl6ZUxvd1Byb2dyZXNzaXZlU3RhZ2U7XHJcbn07XHJcblxyXG5GcnVzdHVtUmVxdWVzdHNQcmlvcml0aXplci5wcm90b3R5cGUuX2dldFByaW9yaXR5SW50ZXJuYWwgPSBmdW5jdGlvbiBnZXRQcmlvcml0eUludGVybmFsKGltYWdlUGFydFBhcmFtcykge1xyXG4gICAgaWYgKHRoaXMuX2ZydXN0dW1EYXRhID09PSBudWxsKSB7XHJcbiAgICAgICAgcmV0dXJuIFBSSU9SSVRZX0NBTENVTEFUSU9OX0ZBSUxFRDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2ZydXN0dW1EYXRhLmltYWdlUmVjdGFuZ2xlID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICB0aHJvdyAnTm8gaW1hZ2VSZWN0YW5nbGUgaW5mb3JtYXRpb24gcGFzc2VkIGluIHNldFByaW9yaXRpemVyRGF0YSc7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBleGFjdEZydXN0dW1MZXZlbCA9IHRoaXMuX2ZydXN0dW1EYXRhLmV4YWN0bGV2ZWw7XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9mcnVzdHVtRGF0YS5leGFjdGxldmVsID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICB0aHJvdyAnTm8gZXhhY3RsZXZlbCBpbmZvcm1hdGlvbiBwYXNzZWQgaW4gJyArXHJcbiAgICAgICAgICAgICdzZXRQcmlvcml0aXplckRhdGEuIFVzZSBudWxsIGlmIHVua25vd24nO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgdGlsZVdlc3QgPSB0aGlzLl9waXhlbFRvQ2FydG9ncmFwaGljWChcclxuICAgICAgICBpbWFnZVBhcnRQYXJhbXMubWluWCwgaW1hZ2VQYXJ0UGFyYW1zKTtcclxuICAgIHZhciB0aWxlRWFzdCA9IHRoaXMuX3BpeGVsVG9DYXJ0b2dyYXBoaWNYKFxyXG4gICAgICAgIGltYWdlUGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlLCBpbWFnZVBhcnRQYXJhbXMpO1xyXG4gICAgdmFyIHRpbGVOb3J0aCA9IHRoaXMuX3BpeGVsVG9DYXJ0b2dyYXBoaWNZKFxyXG4gICAgICAgIGltYWdlUGFydFBhcmFtcy5taW5ZLCBpbWFnZVBhcnRQYXJhbXMpO1xyXG4gICAgdmFyIHRpbGVTb3V0aCA9IHRoaXMuX3BpeGVsVG9DYXJ0b2dyYXBoaWNZKFxyXG4gICAgICAgIGltYWdlUGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlLCBpbWFnZVBhcnRQYXJhbXMpO1xyXG4gICAgXHJcbiAgICB2YXIgdGlsZVBpeGVsc1dpZHRoID1cclxuICAgICAgICBpbWFnZVBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIGltYWdlUGFydFBhcmFtcy5taW5YO1xyXG4gICAgdmFyIHRpbGVQaXhlbHNIZWlnaHQgPVxyXG4gICAgICAgIGltYWdlUGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlIC0gaW1hZ2VQYXJ0UGFyYW1zLm1pblk7XHJcbiAgICBcclxuICAgIHZhciByZXF1ZXN0VG9GcnVzdHVtUmVzb2x1dGlvblJhdGlvO1xyXG4gICAgdmFyIHRpbGVMZXZlbCA9IGltYWdlUGFydFBhcmFtcy5sZXZlbCB8fCAwO1xyXG4gICAgaWYgKGV4YWN0RnJ1c3R1bUxldmVsID09PSBudWxsKSB7XHJcbiAgICAgICAgdmFyIHRpbGVSZXNvbHV0aW9uWCA9IHRpbGVQaXhlbHNXaWR0aCAvICh0aWxlRWFzdCAtIHRpbGVXZXN0KTtcclxuICAgICAgICB2YXIgdGlsZVJlc29sdXRpb25ZID0gdGlsZVBpeGVsc0hlaWdodCAvICh0aWxlTm9ydGggLSB0aWxlU291dGgpO1xyXG4gICAgICAgIHZhciB0aWxlUmVzb2x1dGlvbiA9IE1hdGgubWF4KHRpbGVSZXNvbHV0aW9uWCwgdGlsZVJlc29sdXRpb25ZKTtcclxuICAgICAgICB2YXIgZnJ1c3R1bVJlc29sdXRpb24gPSB0aGlzLl9mcnVzdHVtRGF0YS5yZXNvbHV0aW9uO1xyXG4gICAgICAgIHJlcXVlc3RUb0ZydXN0dW1SZXNvbHV0aW9uUmF0aW8gPSB0aWxlUmVzb2x1dGlvbiAvIGZydXN0dW1SZXNvbHV0aW9uO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKHJlcXVlc3RUb0ZydXN0dW1SZXNvbHV0aW9uUmF0aW8gPiAyKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBQUklPUklUWV9UT09fR09PRF9SRVNPTFVUSU9OO1xyXG4gICAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAodGlsZUxldmVsIDwgZXhhY3RGcnVzdHVtTGV2ZWwpIHtcclxuICAgICAgICByZXR1cm4gUFJJT1JJVFlfVE9PX0dPT0RfUkVTT0xVVElPTjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGZydXN0dW1SZWN0YW5nbGUgPSB0aGlzLl9mcnVzdHVtRGF0YS5yZWN0YW5nbGU7XHJcbiAgICB2YXIgaW50ZXJzZWN0aW9uV2VzdCA9IE1hdGgubWF4KGZydXN0dW1SZWN0YW5nbGUud2VzdCwgdGlsZVdlc3QpO1xyXG4gICAgdmFyIGludGVyc2VjdGlvbkVhc3QgPSBNYXRoLm1pbihmcnVzdHVtUmVjdGFuZ2xlLmVhc3QsIHRpbGVFYXN0KTtcclxuICAgIHZhciBpbnRlcnNlY3Rpb25Tb3V0aCA9IE1hdGgubWF4KGZydXN0dW1SZWN0YW5nbGUuc291dGgsIHRpbGVTb3V0aCk7XHJcbiAgICB2YXIgaW50ZXJzZWN0aW9uTm9ydGggPSBNYXRoLm1pbihmcnVzdHVtUmVjdGFuZ2xlLm5vcnRoLCB0aWxlTm9ydGgpO1xyXG4gICAgXHJcbiAgICB2YXIgaW50ZXJzZWN0aW9uV2lkdGggPSBpbnRlcnNlY3Rpb25FYXN0IC0gaW50ZXJzZWN0aW9uV2VzdDtcclxuICAgIHZhciBpbnRlcnNlY3Rpb25IZWlnaHQgPSBpbnRlcnNlY3Rpb25Ob3J0aCAtIGludGVyc2VjdGlvblNvdXRoO1xyXG4gICAgXHJcbiAgICBpZiAoaW50ZXJzZWN0aW9uV2lkdGggPCAwIHx8IGludGVyc2VjdGlvbkhlaWdodCA8IDApIHtcclxuICAgICAgICByZXR1cm4gUFJJT1JJVFlfTk9UX0lOX0ZSVVNUVU07XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChleGFjdEZydXN0dW1MZXZlbCAhPT0gbnVsbCkge1xyXG4gICAgICAgIGlmICh0aWxlTGV2ZWwgPiBleGFjdEZydXN0dW1MZXZlbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gUFJJT1JJVFlfTE9XRVJfUkVTT0xVVElPTjtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKHRpbGVMZXZlbCA+IDAgJiYgcmVxdWVzdFRvRnJ1c3R1bVJlc29sdXRpb25SYXRpbyA8IDAuMjUpIHtcclxuICAgICAgICByZXR1cm4gUFJJT1JJVFlfTE9XRVJfUkVTT0xVVElPTjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGludGVyc2VjdGlvbkFyZWEgPSBpbnRlcnNlY3Rpb25XaWR0aCAqIGludGVyc2VjdGlvbkhlaWdodDtcclxuICAgIHZhciB0aWxlQXJlYSA9ICh0aWxlRWFzdCAtIHRpbGVXZXN0KSAqICh0aWxlTm9ydGggLSB0aWxlU291dGgpO1xyXG4gICAgdmFyIHBhcnRJbkZydXN0dW0gPSBpbnRlcnNlY3Rpb25BcmVhIC8gdGlsZUFyZWE7XHJcbiAgICBcclxuICAgIGlmIChwYXJ0SW5GcnVzdHVtID4gMC45OSkge1xyXG4gICAgICAgIHJldHVybiBQUklPUklUWV9GVUxMWV9JTl9GUlVTVFVNO1xyXG4gICAgfSBlbHNlIGlmIChwYXJ0SW5GcnVzdHVtID4gMC43KSB7XHJcbiAgICAgICAgcmV0dXJuIFBSSU9SSVRZX01BSk9SSVRZX0lOX0ZSVVNUVU07XHJcbiAgICB9IGVsc2UgaWYgKHBhcnRJbkZydXN0dW0gPiAwLjMpIHtcclxuICAgICAgICByZXR1cm4gUFJJT1JJVFlfUEFSVElBTF9JTl9GUlVTVFVNO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gUFJJT1JJVFlfTUlOT1JJVFlfSU5fRlJVU1RVTTtcclxuICAgIH1cclxufTtcclxuXHJcbkZydXN0dW1SZXF1ZXN0c1ByaW9yaXRpemVyLnByb3RvdHlwZS5fcGl4ZWxUb0NhcnRvZ3JhcGhpY1ggPSBmdW5jdGlvbiBwaXhlbFRvQ2FydG9ncmFwaGljWChcclxuICAgIHgsIGltYWdlUGFydFBhcmFtcykge1xyXG4gICAgXHJcbiAgICB2YXIgcmVsYXRpdmVYID0geCAvIHRoaXMuX2ZydXN0dW1EYXRhLmltYWdlLmdldExldmVsV2lkdGgoXHJcbiAgICAgICAgaW1hZ2VQYXJ0UGFyYW1zLmxldmVsKTtcclxuICAgIFxyXG4gICAgdmFyIGltYWdlUmVjdGFuZ2xlID0gdGhpcy5fZnJ1c3R1bURhdGEuaW1hZ2VSZWN0YW5nbGU7XHJcbiAgICB2YXIgcmVjdGFuZ2xlV2lkdGggPSBpbWFnZVJlY3RhbmdsZS5lYXN0IC0gaW1hZ2VSZWN0YW5nbGUud2VzdDtcclxuICAgIFxyXG4gICAgdmFyIHhQcm9qZWN0ZWQgPSBpbWFnZVJlY3RhbmdsZS53ZXN0ICsgcmVsYXRpdmVYICogcmVjdGFuZ2xlV2lkdGg7XHJcbiAgICByZXR1cm4geFByb2plY3RlZDtcclxufTtcclxuXHJcbkZydXN0dW1SZXF1ZXN0c1ByaW9yaXRpemVyLnByb3RvdHlwZS5fcGl4ZWxUb0NhcnRvZ3JhcGhpY1kgPSBmdW5jdGlvbiB0aWxlVG9DYXJ0b2dyYXBoaWNZKFxyXG4gICAgeSwgaW1hZ2VQYXJ0UGFyYW1zLCBpbWFnZSkge1xyXG4gICAgXHJcbiAgICB2YXIgcmVsYXRpdmVZID0geSAvIHRoaXMuX2ZydXN0dW1EYXRhLmltYWdlLmdldExldmVsSGVpZ2h0KFxyXG4gICAgICAgIGltYWdlUGFydFBhcmFtcy5sZXZlbCk7XHJcbiAgICBcclxuICAgIHZhciBpbWFnZVJlY3RhbmdsZSA9IHRoaXMuX2ZydXN0dW1EYXRhLmltYWdlUmVjdGFuZ2xlO1xyXG4gICAgdmFyIHJlY3RhbmdsZUhlaWdodCA9IGltYWdlUmVjdGFuZ2xlLm5vcnRoIC0gaW1hZ2VSZWN0YW5nbGUuc291dGg7XHJcbiAgICBcclxuICAgIHZhciB5UHJvamVjdGVkID0gaW1hZ2VSZWN0YW5nbGUubm9ydGggLSByZWxhdGl2ZVkgKiByZWN0YW5nbGVIZWlnaHQ7XHJcbiAgICByZXR1cm4geVByb2plY3RlZDtcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEhhc2hNYXA7XHJcblxyXG52YXIgTGlua2VkTGlzdCA9IHJlcXVpcmUoJ2xpbmtlZGxpc3QuanMnKTtcclxuXHJcbmZ1bmN0aW9uIEhhc2hNYXAoaGFzaGVyKSB7XHJcbiAgICB0aGlzLl9ieUtleSA9IFtdO1xyXG4gICAgdGhpcy5faGFzaGVyID0gaGFzaGVyO1xyXG59XHJcblxyXG5IYXNoTWFwLnByb3RvdHlwZS5nZXRGcm9tS2V5ID0gZnVuY3Rpb24gZ2V0RnJvbUtleShrZXkpIHtcclxuICAgIHZhciBoYXNoQ29kZSA9IHRoaXMuX2hhc2hlci5nZXRIYXNoQ29kZShrZXkpO1xyXG4gICAgdmFyIGhhc2hFbGVtZW50cyA9IHRoaXMuX2J5S2V5W2hhc2hDb2RlXTtcclxuICAgIGlmICghaGFzaEVsZW1lbnRzKSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBpdGVyYXRvciA9IGhhc2hFbGVtZW50cy5nZXRGaXJzdEl0ZXJhdG9yKCk7XHJcbiAgICB3aGlsZSAoaXRlcmF0b3IgIT09IG51bGwpIHtcclxuICAgICAgICB2YXIgaXRlbSA9IGhhc2hFbGVtZW50cy5nZXRWYWx1ZShpdGVyYXRvcik7XHJcbiAgICAgICAgaWYgKHRoaXMuX2hhc2hlci5pc0VxdWFsKGl0ZW0ua2V5LCBrZXkpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBpdGVtLnZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpdGVyYXRvciA9IGhhc2hFbGVtZW50cy5nZXROZXh0SXRlcmF0b3IoaXRlcmF0b3IpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBudWxsO1xyXG59O1xyXG5cclxuSGFzaE1hcC5wcm90b3R5cGUuZ2V0RnJvbUl0ZXJhdG9yID0gZnVuY3Rpb24gZ2V0RnJvbUl0ZXJhdG9yKGl0ZXJhdG9yKSB7XHJcbiAgICByZXR1cm4gaXRlcmF0b3IuX2hhc2hFbGVtZW50cy5nZXRWYWx1ZShpdGVyYXRvci5faW50ZXJuYWxJdGVyYXRvcikudmFsdWU7XHJcbn07XHJcblxyXG5IYXNoTWFwLnByb3RvdHlwZS50cnlBZGQgPSBmdW5jdGlvbiB0cnlBZGQoa2V5LCBjcmVhdGVWYWx1ZSkge1xyXG4gICAgdmFyIGhhc2hDb2RlID0gdGhpcy5faGFzaGVyLmdldEhhc2hDb2RlKGtleSk7XHJcbiAgICB2YXIgaGFzaEVsZW1lbnRzID0gdGhpcy5fYnlLZXlbaGFzaENvZGVdO1xyXG4gICAgaWYgKCFoYXNoRWxlbWVudHMpIHtcclxuICAgICAgICBoYXNoRWxlbWVudHMgPSBuZXcgTGlua2VkTGlzdCgpO1xyXG4gICAgICAgIHRoaXMuX2J5S2V5W2hhc2hDb2RlXSA9IGhhc2hFbGVtZW50cyA7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBpdGVyYXRvciA9IHtcclxuICAgICAgICBfaGFzaENvZGU6IGhhc2hDb2RlLFxyXG4gICAgICAgIF9oYXNoRWxlbWVudHM6IGhhc2hFbGVtZW50cyxcclxuICAgICAgICBfaW50ZXJuYWxJdGVyYXRvcjogbnVsbFxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgaXRlcmF0b3IuX2ludGVybmFsSXRlcmF0b3IgPSBoYXNoRWxlbWVudHMuZ2V0Rmlyc3RJdGVyYXRvcigpO1xyXG4gICAgd2hpbGUgKGl0ZXJhdG9yLl9pbnRlcm5hbEl0ZXJhdG9yICE9PSBudWxsKSB7XHJcbiAgICAgICAgdmFyIGl0ZW0gPSBoYXNoRWxlbWVudHMuZ2V0VmFsdWUoaXRlcmF0b3IuX2ludGVybmFsSXRlcmF0b3IpO1xyXG4gICAgICAgIGlmICh0aGlzLl9oYXNoZXIuaXNFcXVhbChpdGVtLmtleSwga2V5KSkge1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgaXRlcmF0b3I6IGl0ZXJhdG9yLFxyXG4gICAgICAgICAgICAgICAgaXNOZXc6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgdmFsdWU6IGl0ZW0udmFsdWVcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaXRlcmF0b3IuX2ludGVybmFsSXRlcmF0b3IgPSBoYXNoRWxlbWVudHMuZ2V0TmV4dEl0ZXJhdG9yKGl0ZXJhdG9yLl9pbnRlcm5hbEl0ZXJhdG9yKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHZhbHVlID0gY3JlYXRlVmFsdWUoKTtcclxuICAgIGl0ZXJhdG9yLl9pbnRlcm5hbEl0ZXJhdG9yID0gaGFzaEVsZW1lbnRzLmFkZCh7XHJcbiAgICAgICAga2V5OiBrZXksXHJcbiAgICAgICAgdmFsdWU6IHZhbHVlXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBpdGVyYXRvcjogaXRlcmF0b3IsXHJcbiAgICAgICAgaXNOZXc6IHRydWUsXHJcbiAgICAgICAgdmFsdWU6IHZhbHVlXHJcbiAgICB9O1xyXG59O1xyXG5cclxuSGFzaE1hcC5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24gcmVtb3ZlKGl0ZXJhdG9yKSB7XHJcbiAgICBpdGVyYXRvci5faGFzaEVsZW1lbnRzLnJlbW92ZShpdGVyYXRvci5faW50ZXJuYWxJdGVyYXRvcik7XHJcbiAgICBpZiAoaXRlcmF0b3IuX2hhc2hFbGVtZW50cy5nZXRDb3VudCgpID09PSAwKSB7XHJcbiAgICAgICAgZGVsZXRlIHRoaXMuX2J5S2V5W2l0ZXJhdG9yLl9oYXNoQ29kZV07XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxudmFyIEZydXN0dW1SZXF1ZXN0c1ByaW9yaXRpemVyID0gcmVxdWlyZSgnZnJ1c3R1bXJlcXVlc3RzcHJpb3JpdGl6ZXIuanMnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgY2FsY3VsYXRlRnJ1c3R1bTJERnJvbUJvdW5kczogY2FsY3VsYXRlRnJ1c3R1bTJERnJvbUJvdW5kcyxcclxuICAgIGNyZWF0ZVNjaGVkdWxlcjogY3JlYXRlU2NoZWR1bGVyLFxyXG4gICAgZml4Qm91bmRzOiBmaXhCb3VuZHMsXHJcbiAgICBhbGlnblBhcmFtc1RvVGlsZXNBbmRMZXZlbDogYWxpZ25QYXJhbXNUb1RpbGVzQW5kTGV2ZWwsXHJcbiAgICBnZXRJbWFnZUltcGxlbWVudGF0aW9uOiBnZXRJbWFnZUltcGxlbWVudGF0aW9uLFxyXG4gICAgZ2V0U2NyaXB0c0ZvcldvcmtlckltcG9ydDogZ2V0U2NyaXB0c0ZvcldvcmtlckltcG9ydCxcclxuICAgIGNyZWF0ZUludGVybmFsT3B0aW9uczogY3JlYXRlSW50ZXJuYWxPcHRpb25zXHJcbn07XHJcblxyXG4vLyBBdm9pZCBqc2hpbnQgZXJyb3JcclxuLyogZ2xvYmFsIHNlbGY6IGZhbHNlICovXHJcbi8qIGdsb2JhbCBnbG9iYWxzOiBmYWxzZSAqL1xyXG4gICAgXHJcbi8vdmFyIGxvZzIgPSBNYXRoLmxvZygyKTtcclxuXHJcbnZhciBpbWFnZURlY29kZXJGcmFtZXdvcmtTY3JpcHQgPSBuZXcgQXN5bmNQcm94eS5TY3JpcHRzVG9JbXBvcnRQb29sKCk7XHJcbmltYWdlRGVjb2RlckZyYW1ld29ya1NjcmlwdC5hZGRTY3JpcHRGcm9tRXJyb3JXaXRoU3RhY2tUcmFjZShuZXcgRXJyb3IoKSk7XHJcbnZhciBzY3JpcHRzRm9yV29ya2VyVG9JbXBvcnQgPSBpbWFnZURlY29kZXJGcmFtZXdvcmtTY3JpcHQuZ2V0U2NyaXB0c0ZvcldvcmtlckltcG9ydCgpO1xyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlRnJ1c3R1bTJERnJvbUJvdW5kcyhcclxuICAgIGJvdW5kcywgc2NyZWVuU2l6ZSkge1xyXG4gICAgXHJcbiAgICB2YXIgc2NyZWVuUGl4ZWxzID1cclxuICAgICAgICBzY3JlZW5TaXplLnggKiBzY3JlZW5TaXplLnggKyBzY3JlZW5TaXplLnkgKiBzY3JlZW5TaXplLnk7XHJcbiAgICBcclxuICAgIHZhciBib3VuZHNXaWR0aCA9IGJvdW5kcy5lYXN0IC0gYm91bmRzLndlc3Q7XHJcbiAgICB2YXIgYm91bmRzSGVpZ2h0ID0gYm91bmRzLm5vcnRoIC0gYm91bmRzLnNvdXRoO1xyXG4gICAgdmFyIGJvdW5kc0Rpc3RhbmNlID1cclxuICAgICAgICBib3VuZHNXaWR0aCAqIGJvdW5kc1dpZHRoICsgYm91bmRzSGVpZ2h0ICogYm91bmRzSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB2YXIgcmVzb2x1dGlvbiA9IE1hdGguc3FydChzY3JlZW5QaXhlbHMgLyBib3VuZHNEaXN0YW5jZSk7XHJcbiAgICBcclxuICAgIHZhciBmcnVzdHVtRGF0YSA9IHtcclxuICAgICAgICByZXNvbHV0aW9uOiByZXNvbHV0aW9uLFxyXG4gICAgICAgIHJlY3RhbmdsZTogYm91bmRzLFxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFJlZHVuZGFudCwgYnV0IGVuYWJsZXMgdG8gYXZvaWQgYWxyZWFkeS1wZXJmb3JtZWQgY2FsY3VsYXRpb25cclxuICAgICAgICBzY3JlZW5TaXplOiBzY3JlZW5TaXplXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICByZXR1cm4gZnJ1c3R1bURhdGE7XHJcbn1cclxuICAgIFxyXG5mdW5jdGlvbiBjcmVhdGVTY2hlZHVsZXIoXHJcbiAgICBzaG93TG9nLCBwcmlvcml0aXplclR5cGUsIHNjaGVkdWxlck5hbWUsIGNyZWF0ZVJlc291cmNlLCByZXNvdXJjZUxpbWl0KSB7XHJcbiAgICBcclxuICAgIHZhciBwcmlvcml0aXplcjtcclxuICAgIHZhciBzY2hlZHVsZXI7XHJcbiAgICBcclxuICAgIGlmIChwcmlvcml0aXplclR5cGUgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHByaW9yaXRpemVyID0gbnVsbDtcclxuICAgICAgICBcclxuICAgICAgICBzY2hlZHVsZXIgPSBuZXcgUmVzb3VyY2VTY2hlZHVsZXIuTGlmb1NjaGVkdWxlcihcclxuICAgICAgICAgICAgY3JlYXRlUmVzb3VyY2UsXHJcbiAgICAgICAgICAgIHJlc291cmNlTGltaXQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgbGltaXRSZXNvdXJjZUJ5TG93UXVhbGl0eVByaW9yaXR5ID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHByaW9yaXRpemVyVHlwZSA9PT0gJ2ZydXN0dW0nKSB7XHJcbiAgICAgICAgICAgIGxpbWl0UmVzb3VyY2VCeUxvd1F1YWxpdHlQcmlvcml0eSA9IHRydWU7XHJcbiAgICAgICAgICAgIHByaW9yaXRpemVyID0gbmV3IEZydXN0dW1SZXF1ZXN0c1ByaW9yaXRpemVyKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChwcmlvcml0aXplclR5cGUgPT09ICdmcnVzdHVtT25seScpIHtcclxuICAgICAgICAgICAgbGltaXRSZXNvdXJjZUJ5TG93UXVhbGl0eVByaW9yaXR5ID0gdHJ1ZTtcclxuICAgICAgICAgICAgcHJpb3JpdGl6ZXIgPSBuZXcgRnJ1c3R1bVJlcXVlc3RzUHJpb3JpdGl6ZXIoXHJcbiAgICAgICAgICAgICAgICAvKmlzQWJvcnRSZXF1ZXN0c05vdEluRnJ1c3R1bT0qL3RydWUsXHJcbiAgICAgICAgICAgICAgICAvKmlzUHJpb3JpdGl6ZUxvd1F1YWxpdHlTdGFnZT0qL3RydWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHByaW9yaXRpemVyID0gcHJpb3JpdGl6ZXJUeXBlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgb3B0aW9ucyA9IHtcclxuICAgICAgICAgICAgc2NoZWR1bGVyTmFtZTogc2NoZWR1bGVyTmFtZSxcclxuICAgICAgICAgICAgc2hvd0xvZzogc2hvd0xvZ1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGxpbWl0UmVzb3VyY2VCeUxvd1F1YWxpdHlQcmlvcml0eSkge1xyXG4gICAgICAgICAgICBvcHRpb25zLnJlc291cmNlR3VhcmFudGVlZEZvckhpZ2hQcmlvcml0eSA9IHJlc291cmNlTGltaXQgLSAyO1xyXG4gICAgICAgICAgICBvcHRpb25zLmhpZ2hQcmlvcml0eVRvR3VhcmFudGVlUmVzb3VyY2UgPVxyXG4gICAgICAgICAgICAgICAgcHJpb3JpdGl6ZXIubWluaW1hbExvd1F1YWxpdHlQcmlvcml0eTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2NoZWR1bGVyID0gbmV3IFJlc291cmNlU2NoZWR1bGVyLlByaW9yaXR5U2NoZWR1bGVyKFxyXG4gICAgICAgICAgICBjcmVhdGVSZXNvdXJjZSxcclxuICAgICAgICAgICAgcmVzb3VyY2VMaW1pdCxcclxuICAgICAgICAgICAgcHJpb3JpdGl6ZXIsXHJcbiAgICAgICAgICAgIG9wdGlvbnMpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHByaW9yaXRpemVyOiBwcmlvcml0aXplcixcclxuICAgICAgICBzY2hlZHVsZXI6IHNjaGVkdWxlclxyXG4gICAgfTtcclxufVxyXG4gICAgXHJcbmZ1bmN0aW9uIGZpeEJvdW5kcyhib3VuZHMsIGltYWdlLCBhZGFwdFByb3BvcnRpb25zKSB7XHJcbiAgICBpZiAoIWFkYXB0UHJvcG9ydGlvbnMpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHJlY3RhbmdsZVdpZHRoID0gYm91bmRzLmVhc3QgLSBib3VuZHMud2VzdDtcclxuICAgIHZhciByZWN0YW5nbGVIZWlnaHQgPSBib3VuZHMubm9ydGggLSBib3VuZHMuc291dGg7XHJcblxyXG4gICAgdmFyIGxldmVsID0gaW1hZ2UuZ2V0SW1hZ2VMZXZlbCgpO1xyXG4gICAgdmFyIHBpeGVsc0FzcGVjdFJhdGlvID1cclxuICAgICAgICBpbWFnZS5nZXRMZXZlbFdpZHRoKGxldmVsKSAvIGltYWdlLmdldExldmVsSGVpZ2h0KGxldmVsKTtcclxuICAgIHZhciByZWN0YW5nbGVBc3BlY3RSYXRpbyA9IHJlY3RhbmdsZVdpZHRoIC8gcmVjdGFuZ2xlSGVpZ2h0O1xyXG4gICAgXHJcbiAgICBpZiAocGl4ZWxzQXNwZWN0UmF0aW8gPCByZWN0YW5nbGVBc3BlY3RSYXRpbykge1xyXG4gICAgICAgIHZhciBvbGRXaWR0aCA9IHJlY3RhbmdsZVdpZHRoO1xyXG4gICAgICAgIHJlY3RhbmdsZVdpZHRoID0gcmVjdGFuZ2xlSGVpZ2h0ICogcGl4ZWxzQXNwZWN0UmF0aW87XHJcbiAgICAgICAgdmFyIHN1YnN0cmFjdEZyb21XaWR0aCA9IG9sZFdpZHRoIC0gcmVjdGFuZ2xlV2lkdGg7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYm91bmRzLmVhc3QgLT0gc3Vic3RyYWN0RnJvbVdpZHRoIC8gMjtcclxuICAgICAgICBib3VuZHMud2VzdCArPSBzdWJzdHJhY3RGcm9tV2lkdGggLyAyO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgb2xkSGVpZ2h0ID0gcmVjdGFuZ2xlSGVpZ2h0O1xyXG4gICAgICAgIHJlY3RhbmdsZUhlaWdodCA9IHJlY3RhbmdsZVdpZHRoIC8gcGl4ZWxzQXNwZWN0UmF0aW87XHJcbiAgICAgICAgdmFyIHN1YnN0cmFjdEZyb21IZWlnaHQgPSBvbGRIZWlnaHQgLSByZWN0YW5nbGVIZWlnaHQ7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYm91bmRzLm5vcnRoIC09IHN1YnN0cmFjdEZyb21IZWlnaHQgLyAyO1xyXG4gICAgICAgIGJvdW5kcy5zb3V0aCArPSBzdWJzdHJhY3RGcm9tSGVpZ2h0IC8gMjtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYWxpZ25QYXJhbXNUb1RpbGVzQW5kTGV2ZWwoXHJcbiAgICByZWdpb24sIGltYWdlRGVjb2Rlcikge1xyXG4gICAgXHJcbiAgICB2YXIgc2l6ZXNDYWxjdWxhdG9yID0gaW1hZ2VEZWNvZGVyLl9nZXRTaXplc0NhbGN1bGF0b3IoKTtcclxuICAgIHZhciB0aWxlV2lkdGggPSBpbWFnZURlY29kZXIuZ2V0VGlsZVdpZHRoKCk7XHJcbiAgICB2YXIgdGlsZUhlaWdodCA9IGltYWdlRGVjb2Rlci5nZXRUaWxlSGVpZ2h0KCk7XHJcbiAgICBcclxuICAgIHZhciByZWdpb25NaW5YID0gcmVnaW9uLm1pblg7XHJcbiAgICB2YXIgcmVnaW9uTWluWSA9IHJlZ2lvbi5taW5ZO1xyXG4gICAgdmFyIHJlZ2lvbk1heFggPSByZWdpb24ubWF4WEV4Y2x1c2l2ZTtcclxuICAgIHZhciByZWdpb25NYXhZID0gcmVnaW9uLm1heFlFeGNsdXNpdmU7XHJcbiAgICB2YXIgc2NyZWVuV2lkdGggPSByZWdpb24uc2NyZWVuV2lkdGg7XHJcbiAgICB2YXIgc2NyZWVuSGVpZ2h0ID0gcmVnaW9uLnNjcmVlbkhlaWdodDtcclxuICAgIFxyXG4gICAgdmFyIGlzVmFsaWRPcmRlciA9IHJlZ2lvbk1pblggPCByZWdpb25NYXhYICYmIHJlZ2lvbk1pblkgPCByZWdpb25NYXhZO1xyXG4gICAgaWYgKCFpc1ZhbGlkT3JkZXIpIHtcclxuICAgICAgICB0aHJvdyAnUGFyYW1ldGVycyBvcmRlciBpcyBpbnZhbGlkJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGltYWdlTGV2ZWwgPSBzaXplc0NhbGN1bGF0b3IuZ2V0SW1hZ2VMZXZlbCgpO1xyXG4gICAgdmFyIGRlZmF1bHRMZXZlbFdpZHRoID0gc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsV2lkdGgoaW1hZ2VMZXZlbCk7XHJcbiAgICB2YXIgZGVmYXVsdExldmVsSGVpZ2h0ID0gc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsSGVpZ2h0KGltYWdlTGV2ZWwpO1xyXG4gICAgaWYgKHJlZ2lvbk1heFggPCAwIHx8IHJlZ2lvbk1pblggPj0gZGVmYXVsdExldmVsV2lkdGggfHxcclxuICAgICAgICByZWdpb25NYXhZIDwgMCB8fCByZWdpb25NaW5ZID49IGRlZmF1bHRMZXZlbEhlaWdodCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvL3ZhciBtYXhMZXZlbCA9XHJcbiAgICAvLyAgICBzaXplc0NhbGN1bGF0b3IuZ2V0RGVmYXVsdE51bVJlc29sdXRpb25MZXZlbHMoKSAtIDE7XHJcblxyXG4gICAgLy92YXIgbGV2ZWxYID0gTWF0aC5sb2coKHJlZ2lvbk1heFggLSByZWdpb25NaW5YKSAvIHNjcmVlbldpZHRoICkgLyBsb2cyO1xyXG4gICAgLy92YXIgbGV2ZWxZID0gTWF0aC5sb2coKHJlZ2lvbk1heFkgLSByZWdpb25NaW5ZKSAvIHNjcmVlbkhlaWdodCkgLyBsb2cyO1xyXG4gICAgLy92YXIgbGV2ZWwgPSBNYXRoLmNlaWwoTWF0aC5taW4obGV2ZWxYLCBsZXZlbFkpKTtcclxuICAgIC8vbGV2ZWwgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihtYXhMZXZlbCwgbGV2ZWwpKTtcclxuICAgIHZhciBsZXZlbCA9IHNpemVzQ2FsY3VsYXRvci5nZXRMZXZlbChyZWdpb24pO1xyXG4gICAgdmFyIGxldmVsV2lkdGggPSBzaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWxXaWR0aChsZXZlbCk7XHJcbiAgICB2YXIgbGV2ZWxIZWlnaHQgPSBzaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWxIZWlnaHQobGV2ZWwpO1xyXG4gICAgXHJcbiAgICB2YXIgc2NhbGVYID0gZGVmYXVsdExldmVsV2lkdGggLyBsZXZlbFdpZHRoO1xyXG4gICAgdmFyIHNjYWxlWSA9IGRlZmF1bHRMZXZlbEhlaWdodCAvIGxldmVsSGVpZ2h0O1xyXG4gICAgXHJcbiAgICB2YXIgbWluVGlsZVggPSBNYXRoLmZsb29yKHJlZ2lvbk1pblggLyAoc2NhbGVYICogdGlsZVdpZHRoICkpO1xyXG4gICAgdmFyIG1pblRpbGVZID0gTWF0aC5mbG9vcihyZWdpb25NaW5ZIC8gKHNjYWxlWSAqIHRpbGVIZWlnaHQpKTtcclxuICAgIHZhciBtYXhUaWxlWCA9IE1hdGguY2VpbCAocmVnaW9uTWF4WCAvIChzY2FsZVggKiB0aWxlV2lkdGggKSk7XHJcbiAgICB2YXIgbWF4VGlsZVkgPSBNYXRoLmNlaWwgKHJlZ2lvbk1heFkgLyAoc2NhbGVZICogdGlsZUhlaWdodCkpO1xyXG4gICAgXHJcbiAgICB2YXIgbWluWCA9IG1pblRpbGVYICogdGlsZVdpZHRoO1xyXG4gICAgdmFyIG1pblkgPSBtaW5UaWxlWSAqIHRpbGVIZWlnaHQ7XHJcbiAgICB2YXIgbWF4WCA9IG1heFRpbGVYICogdGlsZVdpZHRoO1xyXG4gICAgdmFyIG1heFkgPSBtYXhUaWxlWSAqIHRpbGVIZWlnaHQ7XHJcbiAgICBcclxuICAgIHZhciBjcm9wcGVkTWluWCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGxldmVsV2lkdGggLCBtaW5YKSk7XHJcbiAgICB2YXIgY3JvcHBlZE1pblkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihsZXZlbEhlaWdodCwgbWluWSkpO1xyXG4gICAgdmFyIGNyb3BwZWRNYXhYID0gTWF0aC5tYXgoMCwgTWF0aC5taW4obGV2ZWxXaWR0aCAsIG1heFgpKTtcclxuICAgIHZhciBjcm9wcGVkTWF4WSA9IE1hdGgubWF4KDAsIE1hdGgubWluKGxldmVsSGVpZ2h0LCBtYXhZKSk7XHJcbiAgICBcclxuICAgIHZhciBpbWFnZVBhcmFtc1RvU2NyZWVuU2NhbGVYID0gc2NyZWVuV2lkdGggIC8gKG1heFggLSBtaW5YKTtcclxuICAgIHZhciBpbWFnZVBhcmFtc1RvU2NyZWVuU2NhbGVZID0gc2NyZWVuSGVpZ2h0IC8gKG1heFkgLSBtaW5ZKTtcclxuICAgIFxyXG4gICAgdmFyIGltYWdlUGFydFBhcmFtcyA9IHtcclxuICAgICAgICBtaW5YOiBjcm9wcGVkTWluWCxcclxuICAgICAgICBtaW5ZOiBjcm9wcGVkTWluWSxcclxuICAgICAgICBtYXhYRXhjbHVzaXZlOiBjcm9wcGVkTWF4WCxcclxuICAgICAgICBtYXhZRXhjbHVzaXZlOiBjcm9wcGVkTWF4WSxcclxuICAgICAgICBsZXZlbDogbGV2ZWxcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciBwb3NpdGlvbkluSW1hZ2UgPSB7XHJcbiAgICAgICAgbWluWDogY3JvcHBlZE1pblggKiBzY2FsZVgsXHJcbiAgICAgICAgbWluWTogY3JvcHBlZE1pblkgKiBzY2FsZVksXHJcbiAgICAgICAgbWF4WEV4Y2x1c2l2ZTogY3JvcHBlZE1heFggKiBzY2FsZVgsXHJcbiAgICAgICAgbWF4WUV4Y2x1c2l2ZTogY3JvcHBlZE1heFkgKiBzY2FsZVlcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciBjcm9wcGVkU2NyZWVuID0ge1xyXG4gICAgICAgIG1pblggOiBNYXRoLmZsb29yKChjcm9wcGVkTWluWCAtIG1pblgpICogaW1hZ2VQYXJhbXNUb1NjcmVlblNjYWxlWCksXHJcbiAgICAgICAgbWluWSA6IE1hdGguZmxvb3IoKGNyb3BwZWRNaW5ZIC0gbWluWSkgKiBpbWFnZVBhcmFtc1RvU2NyZWVuU2NhbGVZKSxcclxuICAgICAgICBtYXhYRXhjbHVzaXZlIDogTWF0aC5jZWlsKChjcm9wcGVkTWF4WCAtIG1pblgpICogaW1hZ2VQYXJhbXNUb1NjcmVlblNjYWxlWCksXHJcbiAgICAgICAgbWF4WUV4Y2x1c2l2ZSA6IE1hdGguY2VpbCgoY3JvcHBlZE1heFkgLSBtaW5ZKSAqIGltYWdlUGFyYW1zVG9TY3JlZW5TY2FsZVkpXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGltYWdlUGFydFBhcmFtczogaW1hZ2VQYXJ0UGFyYW1zLFxyXG4gICAgICAgIHBvc2l0aW9uSW5JbWFnZTogcG9zaXRpb25JbkltYWdlLFxyXG4gICAgICAgIGNyb3BwZWRTY3JlZW46IGNyb3BwZWRTY3JlZW5cclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEltYWdlSW1wbGVtZW50YXRpb24oaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICByZXR1cm4gd2luZG93ICYmIHdpbmRvd1tpbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lXTtcclxuICAgIH0gY2F0Y2goZSkgeyB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICByZXR1cm4gZ2xvYmFscyAmJiBnbG9iYWxzW2ltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWVdO1xyXG4gICAgfSBjYXRjaChlKSB7IH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIHJldHVybiBzZWxmICYmIHNlbGZbaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZV07XHJcbiAgICB9IGNhdGNoKGUpIHsgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRTY3JpcHRzRm9yV29ya2VySW1wb3J0KGltYWdlSW1wbGVtZW50YXRpb24sIG9wdGlvbnMpIHtcclxuICAgIHJldHVybiBzY3JpcHRzRm9yV29ya2VyVG9JbXBvcnQuY29uY2F0KFxyXG4gICAgICAgIGltYWdlSW1wbGVtZW50YXRpb24uZ2V0U2NyaXB0c1RvSW1wb3J0KCkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVJbnRlcm5hbE9wdGlvbnMoaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSwgb3B0aW9ucykge1xyXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUgJiZcclxuICAgICAgICBvcHRpb25zLnNjcmlwdHNUb0ltcG9ydCkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gb3B0aW9ucztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGltYWdlSW1wbGVtZW50YXRpb24gPSBnZXRJbWFnZUltcGxlbWVudGF0aW9uKGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUpO1xyXG4gICAgXHJcbiAgICB2YXIgb3B0aW9uc0ludGVybmFsID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRpb25zKSk7XHJcbiAgICBvcHRpb25zSW50ZXJuYWwuaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSA9IG9wdGlvbnMuaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSB8fCBpbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lO1xyXG4gICAgb3B0aW9uc0ludGVybmFsLnNjcmlwdHNUb0ltcG9ydCA9IG9wdGlvbnMuc2NyaXB0c1RvSW1wb3J0IHx8IGdldFNjcmlwdHNGb3JXb3JrZXJJbXBvcnQoaW1hZ2VJbXBsZW1lbnRhdGlvbiwgb3B0aW9ucyk7XHJcbiAgICBcclxuICAgIHJldHVybiBvcHRpb25zSW50ZXJuYWw7XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExpbmtlZExpc3Q7XHJcblxyXG5mdW5jdGlvbiBMaW5rZWRMaXN0KCkge1xyXG4gICAgdGhpcy5fZmlyc3QgPSB7IF9wcmV2OiBudWxsLCBfcGFyZW50OiB0aGlzIH07XHJcbiAgICB0aGlzLl9sYXN0ID0geyBfbmV4dDogbnVsbCwgX3BhcmVudDogdGhpcyB9O1xyXG4gICAgdGhpcy5fY291bnQgPSAwO1xyXG4gICAgXHJcbiAgICB0aGlzLl9sYXN0Ll9wcmV2ID0gdGhpcy5fZmlyc3Q7XHJcbiAgICB0aGlzLl9maXJzdC5fbmV4dCA9IHRoaXMuX2xhc3Q7XHJcbn1cclxuXHJcbkxpbmtlZExpc3QucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIGFkZCh2YWx1ZSwgYWRkQmVmb3JlKSB7XHJcbiAgICBpZiAoYWRkQmVmb3JlID09PSBudWxsIHx8IGFkZEJlZm9yZSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgYWRkQmVmb3JlID0gdGhpcy5fbGFzdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fdmFsaWRhdGVJdGVyYXRvck9mVGhpcyhhZGRCZWZvcmUpO1xyXG4gICAgXHJcbiAgICArK3RoaXMuX2NvdW50O1xyXG4gICAgXHJcbiAgICB2YXIgbmV3Tm9kZSA9IHtcclxuICAgICAgICBfdmFsdWU6IHZhbHVlLFxyXG4gICAgICAgIF9uZXh0OiBhZGRCZWZvcmUsXHJcbiAgICAgICAgX3ByZXY6IGFkZEJlZm9yZS5fcHJldixcclxuICAgICAgICBfcGFyZW50OiB0aGlzXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBuZXdOb2RlLl9wcmV2Ll9uZXh0ID0gbmV3Tm9kZTtcclxuICAgIGFkZEJlZm9yZS5fcHJldiA9IG5ld05vZGU7XHJcbiAgICBcclxuICAgIHJldHVybiBuZXdOb2RlO1xyXG59O1xyXG5cclxuTGlua2VkTGlzdC5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24gcmVtb3ZlKGl0ZXJhdG9yKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZUl0ZXJhdG9yT2ZUaGlzKGl0ZXJhdG9yKTtcclxuICAgIFxyXG4gICAgLS10aGlzLl9jb3VudDtcclxuICAgIFxyXG4gICAgaXRlcmF0b3IuX3ByZXYuX25leHQgPSBpdGVyYXRvci5fbmV4dDtcclxuICAgIGl0ZXJhdG9yLl9uZXh0Ll9wcmV2ID0gaXRlcmF0b3IuX3ByZXY7XHJcbiAgICBpdGVyYXRvci5fcGFyZW50ID0gbnVsbDtcclxufTtcclxuXHJcbkxpbmtlZExpc3QucHJvdG90eXBlLmdldFZhbHVlID0gZnVuY3Rpb24gZ2V0VmFsdWUoaXRlcmF0b3IpIHtcclxuICAgIHRoaXMuX3ZhbGlkYXRlSXRlcmF0b3JPZlRoaXMoaXRlcmF0b3IpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gaXRlcmF0b3IuX3ZhbHVlO1xyXG59O1xyXG5cclxuTGlua2VkTGlzdC5wcm90b3R5cGUuZ2V0Rmlyc3RJdGVyYXRvciA9IGZ1bmN0aW9uIGdldEZpcnN0SXRlcmF0b3IoKSB7XHJcbiAgICB2YXIgaXRlcmF0b3IgPSB0aGlzLmdldE5leHRJdGVyYXRvcih0aGlzLl9maXJzdCk7XHJcbiAgICByZXR1cm4gaXRlcmF0b3I7XHJcbn07XHJcblxyXG5MaW5rZWRMaXN0LnByb3RvdHlwZS5nZXRMYXN0SXRlcmF0b3IgPSBmdW5jdGlvbiBnZXRGaXJzdEl0ZXJhdG9yKCkge1xyXG4gICAgdmFyIGl0ZXJhdG9yID0gdGhpcy5nZXRQcmV2SXRlcmF0b3IodGhpcy5fbGFzdCk7XHJcbiAgICByZXR1cm4gaXRlcmF0b3I7XHJcbn07XHJcblxyXG5MaW5rZWRMaXN0LnByb3RvdHlwZS5nZXROZXh0SXRlcmF0b3IgPSBmdW5jdGlvbiBnZXROZXh0SXRlcmF0b3IoaXRlcmF0b3IpIHtcclxuICAgIHRoaXMuX3ZhbGlkYXRlSXRlcmF0b3JPZlRoaXMoaXRlcmF0b3IpO1xyXG5cclxuICAgIGlmIChpdGVyYXRvci5fbmV4dCA9PT0gdGhpcy5fbGFzdCkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gaXRlcmF0b3IuX25leHQ7XHJcbn07XHJcblxyXG5MaW5rZWRMaXN0LnByb3RvdHlwZS5nZXRQcmV2SXRlcmF0b3IgPSBmdW5jdGlvbiBnZXRQcmV2SXRlcmF0b3IoaXRlcmF0b3IpIHtcclxuICAgIHRoaXMuX3ZhbGlkYXRlSXRlcmF0b3JPZlRoaXMoaXRlcmF0b3IpO1xyXG5cclxuICAgIGlmIChpdGVyYXRvci5fcHJldiA9PT0gdGhpcy5fZmlyc3QpIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIGl0ZXJhdG9yLl9wcmV2O1xyXG59O1xyXG5cclxuTGlua2VkTGlzdC5wcm90b3R5cGUuZ2V0Q291bnQgPSBmdW5jdGlvbiBnZXRDb3VudCgpIHtcclxuICAgIHJldHVybiB0aGlzLl9jb3VudDtcclxufTtcclxuXHJcbkxpbmtlZExpc3QucHJvdG90eXBlLl92YWxpZGF0ZUl0ZXJhdG9yT2ZUaGlzID1cclxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlSXRlcmF0b3JPZlRoaXMoaXRlcmF0b3IpIHtcclxuICAgIFxyXG4gICAgaWYgKGl0ZXJhdG9yLl9wYXJlbnQgIT09IHRoaXMpIHtcclxuICAgICAgICB0aHJvdyAnaXRlcmF0b3IgbXVzdCBiZSBvZiB0aGUgY3VycmVudCBMaW5rZWRMaXN0JztcclxuICAgIH1cclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG4vLyBTdXBwcmVzcyBcIlVubmVjZXNzYXJ5IGRpcmVjdGl2ZSAndXNlIHN0cmljdCdcIiBmb3IgdGhlIHNsYXZlU2NyaXB0Q29udGVudCBmdW5jdGlvblxyXG4vKmpzaGludCAtVzAzNCAqL1xyXG5cclxudmFyIEltYWdlRGVjb2RlciA9IHJlcXVpcmUoJ2ltYWdlZGVjb2Rlci5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuZ2V0U2NyaXB0VXJsID0gZnVuY3Rpb24gZ2V0U2NyaXB0VXJsKCkge1xyXG4gICAgcmV0dXJuIHNsYXZlU2NyaXB0VXJsO1xyXG59O1xyXG5cclxudmFyIHNsYXZlU2NyaXB0QmxvYiA9IG5ldyBCbG9iKFxyXG4gICAgWycoJywgc2xhdmVTY3JpcHRDb250ZW50LnRvU3RyaW5nKCksICcpKCknXSxcclxuICAgIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnIH0pO1xyXG52YXIgc2xhdmVTY3JpcHRVcmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHNsYXZlU2NyaXB0QmxvYik7XHJcblxyXG5mdW5jdGlvbiBzbGF2ZVNjcmlwdENvbnRlbnQoKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICBBc3luY1Byb3h5LkFzeW5jUHJveHlTbGF2ZS5zZXRTbGF2ZVNpZGVDcmVhdG9yKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBhcmd1bWVudHNBc0FycmF5ID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggKyAxKTtcclxuICAgICAgICBhcmd1bWVudHNBc0FycmF5WzBdID0gbnVsbDtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBhcmd1bWVudHNBc0FycmF5W2kgKyAxXSA9IGFyZ3VtZW50c1tpXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIGluc3RhbmNlID0gbmV3IChGdW5jdGlvbi5wcm90b3R5cGUuYmluZC5hcHBseShpbWFnZURlY29kZXJGcmFtZXdvcmsuSW1hZ2VEZWNvZGVyLCBhcmd1bWVudHNBc0FycmF5KSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGluc3RhbmNlO1xyXG4gICAgfSk7XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEltYWdlUGFyYW1zUmV0cmlldmVyUHJveHk7XHJcblxyXG52YXIgaW1hZ2VIZWxwZXJGdW5jdGlvbnMgPSByZXF1aXJlKCdpbWFnZWhlbHBlcmZ1bmN0aW9ucy5qcycpO1xyXG5cclxuZnVuY3Rpb24gSW1hZ2VQYXJhbXNSZXRyaWV2ZXJQcm94eShpbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lKSB7XHJcbiAgICB0aGlzLl9pbWFnZUltcGxlbWVudGF0aW9uID0gaW1hZ2VIZWxwZXJGdW5jdGlvbnMuZ2V0SW1hZ2VJbXBsZW1lbnRhdGlvbihpbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lKTtcclxuICAgIHRoaXMuX3NpemVzUGFyYW1zID0gbnVsbDtcclxuICAgIHRoaXMuX3NpemVzQ2FsY3VsYXRvciA9IG51bGw7XHJcbn1cclxuXHJcbkltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlLmdldEltYWdlTGV2ZWwgPSBmdW5jdGlvbiBnZXRJbWFnZUxldmVsKCkge1xyXG4gICAgdGhpcy5fdmFsaWRhdGVTaXplc0NhbGN1bGF0b3IoKTtcclxuICAgIHZhciBsZXZlbCA9IHRoaXMuX3NpemVzQ2FsY3VsYXRvci5nZXRJbWFnZUxldmVsKCk7XHJcblxyXG4gICAgcmV0dXJuIGxldmVsO1xyXG59O1xyXG5cclxuSW1hZ2VQYXJhbXNSZXRyaWV2ZXJQcm94eS5wcm90b3R5cGUuZ2V0TnVtUmVzb2x1dGlvbkxldmVsc0ZvckxpbWl0dGVkVmlld2VyID0gZnVuY3Rpb24gZ2V0TnVtUmVzb2x1dGlvbkxldmVsc0ZvckxpbWl0dGVkVmlld2VyKCkge1xyXG4gICAgdGhpcy5fdmFsaWRhdGVTaXplc0NhbGN1bGF0b3IoKTtcclxuICAgIHZhciBsZXZlbHMgPSB0aGlzLl9zaXplc0NhbGN1bGF0b3IuZ2V0TnVtUmVzb2x1dGlvbkxldmVsc0ZvckxpbWl0dGVkVmlld2VyKCk7XHJcblxyXG4gICAgcmV0dXJuIGxldmVscztcclxufTtcclxuXHJcbkltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlLmdldExldmVsV2lkdGggPSBmdW5jdGlvbiBnZXRMZXZlbFdpZHRoKGxldmVsKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcigpO1xyXG4gICAgdmFyIHdpZHRoID0gdGhpcy5fc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsV2lkdGgoXHJcbiAgICAgICAgbGV2ZWwpO1xyXG5cclxuICAgIHJldHVybiB3aWR0aDtcclxufTtcclxuXHJcbkltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlLmdldExldmVsSGVpZ2h0ID0gZnVuY3Rpb24gZ2V0TGV2ZWxIZWlnaHQobGV2ZWwpIHtcclxuICAgIHRoaXMuX3ZhbGlkYXRlU2l6ZXNDYWxjdWxhdG9yKCk7XHJcbiAgICB2YXIgaGVpZ2h0ID0gdGhpcy5fc2l6ZXNDYWxjdWxhdG9yLmdldExldmVsSGVpZ2h0KFxyXG4gICAgICAgIGxldmVsKTtcclxuXHJcbiAgICByZXR1cm4gaGVpZ2h0O1xyXG59O1xyXG5cclxuSW1hZ2VQYXJhbXNSZXRyaWV2ZXJQcm94eS5wcm90b3R5cGUuZ2V0TGV2ZWwgPSBmdW5jdGlvbiBnZXRMZXZlbChyZWdpb25MZXZlbDApIHtcclxuICAgIHRoaXMuX3ZhbGlkYXRlU2l6ZXNDYWxjdWxhdG9yKCk7XHJcbiAgICB2YXIgbGV2ZWwgPSB0aGlzLl9zaXplc0NhbGN1bGF0b3IuZ2V0TGV2ZWwocmVnaW9uTGV2ZWwwKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIGxldmVsO1xyXG59O1xyXG5cclxuSW1hZ2VQYXJhbXNSZXRyaWV2ZXJQcm94eS5wcm90b3R5cGUuZ2V0TG93ZXN0UXVhbGl0eSA9IGZ1bmN0aW9uIGdldExvd2VzdFF1YWxpdHkoKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcigpO1xyXG4gICAgdmFyIHF1YWxpdHkgPSB0aGlzLl9zaXplc0NhbGN1bGF0b3IuZ2V0TG93ZXN0UXVhbGl0eSgpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gcXVhbGl0eTtcclxufTtcclxuXHJcbkltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlLmdldEhpZ2hlc3RRdWFsaXR5ID0gZnVuY3Rpb24gZ2V0SGlnaGVzdFF1YWxpdHkoKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcigpO1xyXG4gICAgdmFyIHF1YWxpdHkgPSB0aGlzLl9zaXplc0NhbGN1bGF0b3IuZ2V0SGlnaGVzdFF1YWxpdHkoKTtcclxuXHJcbiAgICByZXR1cm4gcXVhbGl0eTtcclxufTtcclxuXHJcbkltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlLl9nZXRTaXplc0NhbGN1bGF0b3IgPSBmdW5jdGlvbiBnZXRTaXplc0NhbGN1bGF0b3IoKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcih0aGlzKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuX3NpemVzQ2FsY3VsYXRvcjtcclxufTtcclxuXHJcbkltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlLl9nZXRTaXplc1BhcmFtcyA9IGZ1bmN0aW9uIGdldFNpemVzUGFyYW1zKCkge1xyXG4gICAgaWYgKCF0aGlzLl9zaXplc1BhcmFtcykge1xyXG4gICAgICAgIHRoaXMuX3NpemVzUGFyYW1zID0gdGhpcy5fZ2V0U2l6ZXNQYXJhbXNJbnRlcm5hbCgpO1xyXG4gICAgICAgIGlmICghdGhpcy5fc2l6ZXNQYXJhbXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgJ2dldFNpemVzUGFyYW1zKCkgcmV0dXJuIGZhbHN5IHZhbHVlOyBNYXliZSBpbWFnZSBub3QgcmVhZHkgeWV0Pyc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcy5fc2l6ZXNQYXJhbXM7XHJcbn07XHJcblxyXG5JbWFnZVBhcmFtc1JldHJpZXZlclByb3h5LnByb3RvdHlwZS5fZ2V0U2l6ZXNQYXJhbXNJbnRlcm5hbCA9IGZ1bmN0aW9uIGdldFNpemVzUGFyYW1zSW50ZXJuYWwoKSB7XHJcbiAgICB0aHJvdyAnSW1hZ2VQYXJhbXNSZXRyaWV2ZXJQcm94eSBpbXBsZW1lbnRlZCBkaWQgbm90IGltcGxlbWVudCBfZ2V0U2l6ZXNQYXJhbXNJbnRlcm5hbCgpJztcclxufTtcclxuXHJcbkltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvciA9IGZ1bmN0aW9uIHZhbGlkYXRlU2l6ZXNDYWxjdWxhdG9yKCkge1xyXG4gICAgaWYgKHRoaXMuX3NpemVzQ2FsY3VsYXRvciAhPT0gbnVsbCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHNpemVzUGFyYW1zID0gdGhpcy5fZ2V0U2l6ZXNQYXJhbXMoKTtcclxuICAgIHRoaXMuX3NpemVzQ2FsY3VsYXRvciA9IHRoaXMuX2ltYWdlSW1wbGVtZW50YXRpb24uY3JlYXRlSW1hZ2VQYXJhbXNSZXRyaWV2ZXIoXHJcbiAgICAgICAgc2l6ZXNQYXJhbXMpO1xyXG59IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxuLy8gU3VwcHJlc3MgXCJVbm5lY2Vzc2FyeSBkaXJlY3RpdmUgJ3VzZSBzdHJpY3QnXCIgZm9yIHRoZSBzbGF2ZVNjcmlwdENvbnRlbnQgZnVuY3Rpb25cclxuLypqc2hpbnQgLVcwMzQgKi9cclxuXHJcbm1vZHVsZS5leHBvcnRzLmdldFNjcmlwdFVybCA9IGZ1bmN0aW9uIGdldFNjcmlwdFVybCgpIHtcclxuICAgIHJldHVybiBzbGF2ZVNjcmlwdFVybDtcclxufTtcclxuXHJcbnZhciBzbGF2ZVNjcmlwdEJsb2IgPSBuZXcgQmxvYihcclxuICAgIFsnKCcsIHNsYXZlU2NyaXB0Q29udGVudC50b1N0cmluZygpLCAnKSgpJ10sXHJcbiAgICB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0JyB9KTtcclxudmFyIHNsYXZlU2NyaXB0VXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChzbGF2ZVNjcmlwdEJsb2IpO1xyXG5cclxuZnVuY3Rpb24gc2xhdmVTY3JpcHRDb250ZW50KCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgXHJcbiAgICB2YXIgaXNSZWFkeSA9IGZhbHNlO1xyXG5cclxuICAgIEFzeW5jUHJveHkuQXN5bmNQcm94eVNsYXZlLnNldEJlZm9yZU9wZXJhdGlvbkxpc3RlbmVyKGJlZm9yZU9wZXJhdGlvbkxpc3RlbmVyKTtcclxuXHJcbiAgICBmdW5jdGlvbiBiZWZvcmVPcGVyYXRpb25MaXN0ZW5lcihvcGVyYXRpb25UeXBlLCBvcGVyYXRpb25OYW1lLCBhcmdzKSB7XHJcbiAgICAgICAgLyoganNoaW50IHZhbGlkdGhpczogdHJ1ZSAqL1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChvcGVyYXRpb25UeXBlICE9PSAnY2FsbGJhY2snIHx8IG9wZXJhdGlvbk5hbWUgIT09ICdzdGF0dXNDYWxsYmFjaycpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoaXNSZWFkeSB8fCAhYXJnc1swXS5pc1JlYWR5KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgZGF0YSA9IHsgc2l6ZXNQYXJhbXM6IHRoaXMuX2dldFNpemVzUGFyYW1zKCkgfTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBnZXRUaWxlV2lkdGggYW5kIGdldFRpbGVIZWlnaHQgZXhpc3RzIG9ubHkgaW4gSW1hZ2VEZWNvZGVyIGJ1dCBub3QgaW4gRmV0Y2hNYW5hZ2VyXHJcbiAgICAgICAgaWYgKHRoaXMuZ2V0VGlsZVdpZHRoKSB7XHJcbiAgICAgICAgICAgIGRhdGEuYXBwbGljYXRpdmVUaWxlV2lkdGggPSB0aGlzLmdldFRpbGVXaWR0aCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5nZXRUaWxlSGVpZ2h0KSB7XHJcbiAgICAgICAgICAgIGRhdGEuYXBwbGljYXRpdmVUaWxlSGVpZ2h0ID0gdGhpcy5nZXRUaWxlSGVpZ2h0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIEFzeW5jUHJveHkuQXN5bmNQcm94eVNsYXZlLnNlbmRVc2VyRGF0YVRvTWFzdGVyKGRhdGEpO1xyXG4gICAgICAgIGlzUmVhZHkgPSB0cnVlO1xyXG4gICAgfVxyXG59IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBXb3JrZXJQcm94eUZldGNoTWFuYWdlcjtcclxuXHJcbnZhciBpbWFnZUhlbHBlckZ1bmN0aW9ucyA9IHJlcXVpcmUoJ2ltYWdlaGVscGVyZnVuY3Rpb25zLmpzJyk7XHJcbnZhciBzZW5kSW1hZ2VQYXJhbWV0ZXJzVG9NYXN0ZXIgPSByZXF1aXJlKCdzZW5kaW1hZ2VwYXJhbWV0ZXJzdG9tYXN0ZXIuanMnKTtcclxudmFyIEltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkgPSByZXF1aXJlKCdpbWFnZXBhcmFtc3JldHJpZXZlcnByb3h5LmpzJyk7XHJcblxyXG5mdW5jdGlvbiBXb3JrZXJQcm94eUZldGNoTWFuYWdlcihvcHRpb25zKSB7XHJcbiAgICBJbWFnZVBhcmFtc1JldHJpZXZlclByb3h5LmNhbGwodGhpcywgb3B0aW9ucy5pbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lKTtcclxuXHJcbiAgICB0aGlzLl9pbWFnZVdpZHRoID0gbnVsbDtcclxuICAgIHRoaXMuX2ltYWdlSGVpZ2h0ID0gbnVsbDtcclxuICAgIHRoaXMuX2ludGVybmFsU2l6ZXNQYXJhbXMgPSBudWxsO1xyXG4gICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XHJcbiAgICBcclxuICAgIHZhciBjdG9yQXJncyA9IFtvcHRpb25zXTtcclxuICAgIHZhciBzY3JpcHRzVG9JbXBvcnQgPSBvcHRpb25zLnNjcmlwdHNUb0ltcG9ydC5jb25jYXQoW3NlbmRJbWFnZVBhcmFtZXRlcnNUb01hc3Rlci5nZXRTY3JpcHRVcmwoKV0pO1xyXG4gICAgXHJcbiAgICB0aGlzLl93b3JrZXJIZWxwZXIgPSBuZXcgQXN5bmNQcm94eS5Bc3luY1Byb3h5TWFzdGVyKFxyXG4gICAgICAgIHNjcmlwdHNUb0ltcG9ydCwgJ2ltYWdlRGVjb2RlckZyYW1ld29yay5JbnRlcm5hbHMuRmV0Y2hNYW5hZ2VyJywgY3RvckFyZ3MpO1xyXG4gICAgXHJcbiAgICB2YXIgYm91bmRVc2VyRGF0YUhhbmRsZXIgPSB0aGlzLl91c2VyRGF0YUhhbmRsZXIuYmluZCh0aGlzKTtcclxuICAgIHRoaXMuX3dvcmtlckhlbHBlci5zZXRVc2VyRGF0YUhhbmRsZXIoYm91bmRVc2VyRGF0YUhhbmRsZXIpO1xyXG59XHJcblxyXG5Xb3JrZXJQcm94eUZldGNoTWFuYWdlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkucHJvdG90eXBlKTtcclxuXHJcbldvcmtlclByb3h5RmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24gb3Blbih1cmwpIHtcclxuICAgIHJldHVybiB0aGlzLl93b3JrZXJIZWxwZXIuY2FsbEZ1bmN0aW9uKCdvcGVuJywgW3VybF0sIHsgaXNSZXR1cm5Qcm9taXNlOiB0cnVlIH0pO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlGZXRjaE1hbmFnZXIucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gY2xvc2UoKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICByZXR1cm4gdGhpcy5fd29ya2VySGVscGVyLmNhbGxGdW5jdGlvbignY2xvc2UnLCBbXSwgeyBpc1JldHVyblByb21pc2U6IHRydWUgfSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICBzZWxmLl93b3JrZXJIZWxwZXIudGVybWluYXRlKCk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcbldvcmtlclByb3h5RmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5jcmVhdGVDaGFubmVsID0gZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbChcclxuICAgIGNyZWF0ZWRDYWxsYmFjaykge1xyXG4gICAgXHJcbiAgICB2YXIgY2FsbGJhY2tXcmFwcGVyID0gdGhpcy5fd29ya2VySGVscGVyLndyYXBDYWxsYmFjayhcclxuICAgICAgICBjcmVhdGVkQ2FsbGJhY2ssXHJcbiAgICAgICAgJ0ZldGNoTWFuYWdlcl9jcmVhdGVDaGFubmVsQ2FsbGJhY2snKTtcclxuICAgIFxyXG4gICAgdmFyIGFyZ3MgPSBbY2FsbGJhY2tXcmFwcGVyXTtcclxuICAgIHRoaXMuX3dvcmtlckhlbHBlci5jYWxsRnVuY3Rpb24oJ2NyZWF0ZUNoYW5uZWwnLCBhcmdzKTtcclxufTtcclxuXHJcbldvcmtlclByb3h5RmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5tb3ZlQ2hhbm5lbCA9IGZ1bmN0aW9uIG1vdmVDaGFubmVsKFxyXG4gICAgY2hhbm5lbEhhbmRsZSwgaW1hZ2VQYXJ0UGFyYW1zKSB7XHJcbiAgICBcclxuICAgIHZhciBhcmdzID0gW2NoYW5uZWxIYW5kbGUsIGltYWdlUGFydFBhcmFtc107XHJcbiAgICB0aGlzLl93b3JrZXJIZWxwZXIuY2FsbEZ1bmN0aW9uKCdtb3ZlQ2hhbm5lbCcsIGFyZ3MpO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlGZXRjaE1hbmFnZXIucHJvdG90eXBlLmNyZWF0ZVJlcXVlc3QgPSBmdW5jdGlvbiBjcmVhdGVSZXF1ZXN0KFxyXG4gICAgZmV0Y2hQYXJhbXMsXHJcbiAgICBjYWxsYmFja1RoaXMsXHJcbiAgICBjYWxsYmFjayxcclxuICAgIHRlcm1pbmF0ZWRDYWxsYmFjayxcclxuICAgIGlzT25seVdhaXRGb3JEYXRhLFxyXG4gICAgcmVxdWVzdElkKSB7XHJcbiAgICBcclxuICAgIC8vdmFyIHBhdGhUb0FycmF5SW5QYWNrZXRzRGF0YSA9IFswLCAnZGF0YScsICdidWZmZXInXTtcclxuICAgIC8vdmFyIHBhdGhUb0hlYWRlcnNDb2Rlc3RyZWFtID0gWzEsICdjb2Rlc3RyZWFtJywgJ2J1ZmZlciddO1xyXG4gICAgLy92YXIgdHJhbnNmZXJhYmxlUGF0aHMgPSBbXHJcbiAgICAvLyAgICBwYXRoVG9BcnJheUluUGFja2V0c0RhdGEsXHJcbiAgICAvLyAgICBwYXRoVG9IZWFkZXJzQ29kZXN0cmVhbVxyXG4gICAgLy9dO1xyXG4gICAgXHJcbiAgICB2YXIgdHJhbnNmZXJhYmxlUGF0aHMgPSB0aGlzLl9vcHRpb25zLnRyYW5zZmVyYWJsZVBhdGhzT2ZSZXF1ZXN0Q2FsbGJhY2s7XHJcbiAgICBcclxuICAgIHZhciBpbnRlcm5hbENhbGxiYWNrV3JhcHBlciA9XHJcbiAgICAgICAgdGhpcy5fd29ya2VySGVscGVyLndyYXBDYWxsYmFjayhcclxuICAgICAgICAgICAgY2FsbGJhY2suYmluZChjYWxsYmFja1RoaXMpLCAncmVxdWVzdFRpbGVzUHJvZ3Jlc3NpdmVDYWxsYmFjaycsIHtcclxuICAgICAgICAgICAgICAgIGlzTXVsdGlwbGVUaW1lQ2FsbGJhY2s6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBwYXRoc1RvVHJhbnNmZXJhYmxlczogdHJhbnNmZXJhYmxlUGF0aHNcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICBcclxuICAgIHZhciBpbnRlcm5hbFRlcm1pbmF0ZWRDYWxsYmFja1dyYXBwZXIgPVxyXG4gICAgICAgIHRoaXMuX3dvcmtlckhlbHBlci53cmFwQ2FsbGJhY2soXHJcbiAgICAgICAgICAgIGludGVybmFsVGVybWluYXRlZENhbGxiYWNrLCAncmVxdWVzdFRpbGVzUHJvZ3Jlc3NpdmVUZXJtaW5hdGVkQ2FsbGJhY2snLCB7XHJcbiAgICAgICAgICAgICAgICBpc011bHRpcGxlVGltZUNhbGxiYWNrOiBmYWxzZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICAgICAgXHJcbiAgICB2YXIgYXJncyA9IFtcclxuICAgICAgICBmZXRjaFBhcmFtcyxcclxuICAgICAgICAvKmNhbGxiYWNrVGhpcz0qL3sgZHVtbXlUaGlzOiAnZHVtbXlUaGlzJyB9LFxyXG4gICAgICAgIGludGVybmFsQ2FsbGJhY2tXcmFwcGVyLFxyXG4gICAgICAgIGludGVybmFsVGVybWluYXRlZENhbGxiYWNrV3JhcHBlcixcclxuICAgICAgICBpc09ubHlXYWl0Rm9yRGF0YSxcclxuICAgICAgICByZXF1ZXN0SWRdO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgXHJcbiAgICB0aGlzLl93b3JrZXJIZWxwZXIuY2FsbEZ1bmN0aW9uKCdjcmVhdGVSZXF1ZXN0JywgYXJncyk7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGludGVybmFsVGVybWluYXRlZENhbGxiYWNrKGlzQWJvcnRlZCkge1xyXG4gICAgICAgIHNlbGYuX3dvcmtlckhlbHBlci5mcmVlQ2FsbGJhY2soaW50ZXJuYWxDYWxsYmFja1dyYXBwZXIpO1xyXG4gICAgICAgIHRlcm1pbmF0ZWRDYWxsYmFjay5jYWxsKGNhbGxiYWNrVGhpcywgaXNBYm9ydGVkKTtcclxuICAgIH1cclxufTtcclxuXHJcbldvcmtlclByb3h5RmV0Y2hNYW5hZ2VyLnByb3RvdHlwZS5tYW51YWxBYm9ydFJlcXVlc3QgPSBmdW5jdGlvbiBtYW51YWxBYm9ydFJlcXVlc3QoXHJcbiAgICByZXF1ZXN0SWQpIHtcclxuICAgIFxyXG4gICAgdmFyIGFyZ3MgPSBbcmVxdWVzdElkXTtcclxuICAgIHRoaXMuX3dvcmtlckhlbHBlci5jYWxsRnVuY3Rpb24oXHJcbiAgICAgICAgJ21hbnVhbEFib3J0UmVxdWVzdCcsIGFyZ3MpO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlGZXRjaE1hbmFnZXIucHJvdG90eXBlLnNldElzUHJvZ3Jlc3NpdmVSZXF1ZXN0ID0gZnVuY3Rpb24gc2V0SXNQcm9ncmVzc2l2ZVJlcXVlc3QoXHJcbiAgICByZXF1ZXN0SWQsIGlzUHJvZ3Jlc3NpdmUpIHtcclxuICAgIFxyXG4gICAgdmFyIGFyZ3MgPSBbcmVxdWVzdElkLCBpc1Byb2dyZXNzaXZlXTtcclxuICAgIHRoaXMuX3dvcmtlckhlbHBlci5jYWxsRnVuY3Rpb24oJ3NldElzUHJvZ3Jlc3NpdmVSZXF1ZXN0JywgYXJncyk7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUZldGNoTWFuYWdlci5wcm90b3R5cGUuc2V0U2VydmVyUmVxdWVzdFByaW9yaXRpemVyRGF0YSA9XHJcbiAgICBmdW5jdGlvbiBzZXRTZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXJEYXRhKHByaW9yaXRpemVyRGF0YSkge1xyXG4gICAgXHJcbiAgICB0aGlzLl93b3JrZXJIZWxwZXIuY2FsbEZ1bmN0aW9uKFxyXG4gICAgICAgICdzZXRTZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXJEYXRhJyxcclxuICAgICAgICBbIHByaW9yaXRpemVyRGF0YSBdLFxyXG4gICAgICAgIHsgaXNTZW5kSW1tZWRpYXRlbHk6IHRydWUgfSk7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUZldGNoTWFuYWdlci5wcm90b3R5cGUucmVjb25uZWN0ID0gZnVuY3Rpb24gcmVjb25uZWN0KCkge1xyXG4gICAgdGhpcy5fd29ya2VySGVscGVyLmNhbGxGdW5jdGlvbigncmVjb25uZWN0Jyk7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUZldGNoTWFuYWdlci5wcm90b3R5cGUuX2dldFNpemVzUGFyYW1zSW50ZXJuYWwgPSBmdW5jdGlvbiBnZXRTaXplc1BhcmFtc0ludGVybmFsKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2ludGVybmFsU2l6ZXNQYXJhbXM7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUZldGNoTWFuYWdlci5wcm90b3R5cGUuX3VzZXJEYXRhSGFuZGxlciA9IGZ1bmN0aW9uIHVzZXJEYXRhSGFuZGxlcihkYXRhKSB7XHJcbiAgICB0aGlzLl9pbnRlcm5hbFNpemVzUGFyYW1zID0gZGF0YS5zaXplc1BhcmFtcztcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFdvcmtlclByb3h5SW1hZ2VEZWNvZGVyO1xyXG5cclxudmFyIGltYWdlSGVscGVyRnVuY3Rpb25zID0gcmVxdWlyZSgnaW1hZ2VoZWxwZXJmdW5jdGlvbnMuanMnKTtcclxudmFyIHNlbmRJbWFnZVBhcmFtZXRlcnNUb01hc3RlciA9IHJlcXVpcmUoJ3NlbmRpbWFnZXBhcmFtZXRlcnN0b21hc3Rlci5qcycpO1xyXG52YXIgY3JlYXRlSW1hZ2VEZWNvZGVyU2xhdmVTaWRlID0gcmVxdWlyZSgnY3JlYXRlaW1hZ2VkZWNvZGVyb25zbGF2ZXNpZGUuanMnKTtcclxudmFyIEltYWdlUGFyYW1zUmV0cmlldmVyUHJveHkgPSByZXF1aXJlKCdpbWFnZXBhcmFtc3JldHJpZXZlcnByb3h5LmpzJyk7XHJcblxyXG5mdW5jdGlvbiBXb3JrZXJQcm94eUltYWdlRGVjb2RlcihpbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lLCBvcHRpb25zKSB7XHJcbiAgICBJbWFnZVBhcmFtc1JldHJpZXZlclByb3h5LmNhbGwodGhpcywgaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSk7XHJcblxyXG4gICAgdGhpcy5faW1hZ2VXaWR0aCA9IG51bGw7XHJcbiAgICB0aGlzLl9pbWFnZUhlaWdodCA9IG51bGw7XHJcbiAgICB0aGlzLl90aWxlV2lkdGggPSAwO1xyXG4gICAgdGhpcy5fdGlsZUhlaWdodCA9IDA7XHJcbiAgICB0aGlzLl9zaXplc0NhbGN1bGF0b3IgPSBudWxsO1xyXG4gICAgXHJcbiAgICB2YXIgb3B0aW9uc0ludGVybmFsID0gaW1hZ2VIZWxwZXJGdW5jdGlvbnMuY3JlYXRlSW50ZXJuYWxPcHRpb25zKGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUsIG9wdGlvbnMpO1xyXG4gICAgdmFyIGN0b3JBcmdzID0gW2ltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUsIG9wdGlvbnNJbnRlcm5hbF07XHJcbiAgICBcclxuICAgIHZhciBzY3JpcHRzVG9JbXBvcnQgPSBpbWFnZUhlbHBlckZ1bmN0aW9ucy5nZXRTY3JpcHRzRm9yV29ya2VySW1wb3J0KFxyXG4gICAgICAgIHRoaXMuX2ltYWdlSW1wbGVtZW50YXRpb24sIG9wdGlvbnMpO1xyXG4gICAgc2NyaXB0c1RvSW1wb3J0ID0gc2NyaXB0c1RvSW1wb3J0LmNvbmNhdChbXHJcbiAgICAgICAgc2VuZEltYWdlUGFyYW1ldGVyc1RvTWFzdGVyLmdldFNjcmlwdFVybCgpLFxyXG4gICAgICAgIGNyZWF0ZUltYWdlRGVjb2RlclNsYXZlU2lkZS5nZXRTY3JpcHRVcmwoKV0pO1xyXG5cclxuICAgIHRoaXMuX3dvcmtlckhlbHBlciA9IG5ldyBBc3luY1Byb3h5LkFzeW5jUHJveHlNYXN0ZXIoXHJcbiAgICAgICAgc2NyaXB0c1RvSW1wb3J0LCAnaW1hZ2VEZWNvZGVyRnJhbWV3b3JrLkltYWdlRGVjb2RlcicsIGN0b3JBcmdzKTtcclxuICAgIFxyXG4gICAgdmFyIGJvdW5kSW1hZ2VPcGVuZWQgPSB0aGlzLl9pbWFnZU9wZW5lZC5iaW5kKHRoaXMpO1xyXG4gICAgdGhpcy5fd29ya2VySGVscGVyLnNldFVzZXJEYXRhSGFuZGxlcihib3VuZEltYWdlT3BlbmVkKTtcclxufVxyXG5cclxuV29ya2VyUHJveHlJbWFnZURlY29kZXIucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShJbWFnZVBhcmFtc1JldHJpZXZlclByb3h5LnByb3RvdHlwZSk7XHJcblxyXG5Xb3JrZXJQcm94eUltYWdlRGVjb2Rlci5wcm90b3R5cGUuZ2V0VGlsZVdpZHRoID0gZnVuY3Rpb24gZ2V0VGlsZVdpZHRoKCkge1xyXG4gICAgdGhpcy5fdmFsaWRhdGVTaXplc0NhbGN1bGF0b3IoKTtcclxuICAgIHJldHVybiB0aGlzLl90aWxlV2lkdGg7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUltYWdlRGVjb2Rlci5wcm90b3R5cGUuZ2V0VGlsZUhlaWdodCA9IGZ1bmN0aW9uIGdldFRpbGVIZWlnaHQoKSB7XHJcbiAgICB0aGlzLl92YWxpZGF0ZVNpemVzQ2FsY3VsYXRvcigpO1xyXG4gICAgcmV0dXJuIHRoaXMuX3RpbGVIZWlnaHQ7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUltYWdlRGVjb2Rlci5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uIG9wZW4odXJsKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICByZXR1cm4gdGhpcy5fd29ya2VySGVscGVyLmNhbGxGdW5jdGlvbignb3BlbicsIFt1cmxdLCB7IGlzUmV0dXJuUHJvbWlzZTogdHJ1ZSB9KVxyXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKGltYWdlUGFyYW1zKSB7XHJcbiAgICAgICAgICAgIHNlbGYuX2ltYWdlT3BlbmVkKGltYWdlUGFyYW1zKTtcclxuICAgICAgICAgICAgcmV0dXJuIGltYWdlUGFyYW1zO1xyXG4gICAgICAgIH0pO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlJbWFnZURlY29kZXIucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gY2xvc2UoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fd29ya2VySGVscGVyLmNhbGxGdW5jdGlvbignY2xvc2UnLCBbXSwgeyBpc1JldHVyblByb21pc2U6IHRydWUgfSk7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUltYWdlRGVjb2Rlci5wcm90b3R5cGUuY3JlYXRlQ2hhbm5lbCA9IGZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwoXHJcbiAgICBjcmVhdGVkQ2FsbGJhY2spIHtcclxuICAgIFxyXG4gICAgdmFyIGNhbGxiYWNrV3JhcHBlciA9IHRoaXMuX3dvcmtlckhlbHBlci53cmFwQ2FsbGJhY2soXHJcbiAgICAgICAgY3JlYXRlZENhbGxiYWNrLCAnSW1hZ2VEZWNvZGVyX2NyZWF0ZUNoYW5uZWxDYWxsYmFjaycpO1xyXG4gICAgXHJcbiAgICB2YXIgYXJncyA9IFtjYWxsYmFja1dyYXBwZXJdO1xyXG4gICAgdGhpcy5fd29ya2VySGVscGVyLmNhbGxGdW5jdGlvbignY3JlYXRlQ2hhbm5lbCcsIGFyZ3MpO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlJbWFnZURlY29kZXIucHJvdG90eXBlLnJlcXVlc3RQaXhlbHMgPSBmdW5jdGlvbiByZXF1ZXN0UGl4ZWxzKGltYWdlUGFydFBhcmFtcykge1xyXG4gICAgdmFyIHBhdGhUb1BpeGVsc0FycmF5ID0gWydkYXRhJywgJ2J1ZmZlciddO1xyXG4gICAgdmFyIHRyYW5zZmVyYWJsZXMgPSBbcGF0aFRvUGl4ZWxzQXJyYXldO1xyXG4gICAgXHJcbiAgICB2YXIgYXJncyA9IFtpbWFnZVBhcnRQYXJhbXNdO1xyXG4gICAgXHJcbiAgICB0aGlzLl93b3JrZXJIZWxwZXIuY2FsbEZ1bmN0aW9uKCdyZXF1ZXN0UGl4ZWxzJywgYXJncywge1xyXG4gICAgICAgIGlzUmV0dXJuUHJvbWlzZTogdHJ1ZSxcclxuICAgICAgICBwYXRoc1RvVHJhbnNmZXJhYmxlc0luUHJvbWlzZVJlc3VsdDogdHJhbnNmZXJhYmxlc1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUltYWdlRGVjb2Rlci5wcm90b3R5cGUucmVxdWVzdFBpeGVsc1Byb2dyZXNzaXZlID0gZnVuY3Rpb24gcmVxdWVzdFBpeGVsc1Byb2dyZXNzaXZlKFxyXG4gICAgaW1hZ2VQYXJ0UGFyYW1zLFxyXG4gICAgY2FsbGJhY2ssXHJcbiAgICB0ZXJtaW5hdGVkQ2FsbGJhY2ssXHJcbiAgICBpbWFnZVBhcnRQYXJhbXNOb3ROZWVkZWQsXHJcbiAgICBjaGFubmVsSGFuZGxlKSB7XHJcbiAgICBcclxuICAgIHZhciB0cmFuc2ZlcmFibGVzO1xyXG4gICAgXHJcbiAgICAvLyBOT1RFOiBDYW5ub3QgcGFzcyBpdCBhcyB0cmFuc2ZlcmFibGVzIGJlY2F1c2UgaXQgaXMgcGFzc2VkIHRvIGFsbFxyXG4gICAgLy8gbGlzdGVuZXIgY2FsbGJhY2tzLCB0aHVzIGFmdGVyIHRoZSBmaXJzdCBvbmUgdGhlIGJ1ZmZlciBpcyBub3QgdmFsaWRcclxuICAgIFxyXG4gICAgLy92YXIgcGF0aFRvUGl4ZWxzQXJyYXkgPSBbMCwgJ3BpeGVscycsICdidWZmZXInXTtcclxuICAgIC8vdHJhbnNmZXJhYmxlcyA9IFtwYXRoVG9QaXhlbHNBcnJheV07XHJcbiAgICBcclxuICAgIHZhciBpbnRlcm5hbENhbGxiYWNrV3JhcHBlciA9XHJcbiAgICAgICAgdGhpcy5fd29ya2VySGVscGVyLndyYXBDYWxsYmFjayhcclxuICAgICAgICAgICAgY2FsbGJhY2ssICdyZXF1ZXN0UGl4ZWxzUHJvZ3Jlc3NpdmVDYWxsYmFjaycsIHtcclxuICAgICAgICAgICAgICAgIGlzTXVsdGlwbGVUaW1lQ2FsbGJhY2s6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBwYXRoc1RvVHJhbnNmZXJhYmxlczogdHJhbnNmZXJhYmxlc1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgIFxyXG4gICAgdmFyIGludGVybmFsVGVybWluYXRlZENhbGxiYWNrV3JhcHBlciA9XHJcbiAgICAgICAgdGhpcy5fd29ya2VySGVscGVyLndyYXBDYWxsYmFjayhcclxuICAgICAgICAgICAgaW50ZXJuYWxUZXJtaW5hdGVkQ2FsbGJhY2ssICdyZXF1ZXN0UGl4ZWxzUHJvZ3Jlc3NpdmVUZXJtaW5hdGVkQ2FsbGJhY2snLCB7XHJcbiAgICAgICAgICAgICAgICBpc011bHRpcGxlVGltZUNhbGxiYWNrOiBmYWxzZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICAgICAgXHJcbiAgICB2YXIgYXJncyA9IFtcclxuICAgICAgICBpbWFnZVBhcnRQYXJhbXMsXHJcbiAgICAgICAgaW50ZXJuYWxDYWxsYmFja1dyYXBwZXIsXHJcbiAgICAgICAgaW50ZXJuYWxUZXJtaW5hdGVkQ2FsbGJhY2tXcmFwcGVyLFxyXG4gICAgICAgIGltYWdlUGFydFBhcmFtc05vdE5lZWRlZCxcclxuICAgICAgICBjaGFubmVsSGFuZGxlXTtcclxuICAgIFxyXG4gICAgdGhpcy5fd29ya2VySGVscGVyLmNhbGxGdW5jdGlvbigncmVxdWVzdFBpeGVsc1Byb2dyZXNzaXZlJywgYXJncyk7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGludGVybmFsVGVybWluYXRlZENhbGxiYWNrKGlzQWJvcnRlZCkge1xyXG4gICAgICAgIHNlbGYuX3dvcmtlckhlbHBlci5mcmVlQ2FsbGJhY2soaW50ZXJuYWxDYWxsYmFja1dyYXBwZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRlcm1pbmF0ZWRDYWxsYmFjayhpc0Fib3J0ZWQpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuV29ya2VyUHJveHlJbWFnZURlY29kZXIucHJvdG90eXBlLnNldFNlcnZlclJlcXVlc3RQcmlvcml0aXplckRhdGEgPVxyXG4gICAgZnVuY3Rpb24gc2V0U2VydmVyUmVxdWVzdFByaW9yaXRpemVyRGF0YShwcmlvcml0aXplckRhdGEpIHtcclxuICAgIFxyXG4gICAgdGhpcy5fd29ya2VySGVscGVyLmNhbGxGdW5jdGlvbihcclxuICAgICAgICAnc2V0U2VydmVyUmVxdWVzdFByaW9yaXRpemVyRGF0YScsXHJcbiAgICAgICAgWyBwcmlvcml0aXplckRhdGEgXSxcclxuICAgICAgICB7IGlzU2VuZEltbWVkaWF0ZWx5OiB0cnVlIH0pO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlJbWFnZURlY29kZXIucHJvdG90eXBlLnNldERlY29kZVByaW9yaXRpemVyRGF0YSA9XHJcbiAgICBmdW5jdGlvbiBzZXREZWNvZGVQcmlvcml0aXplckRhdGEocHJpb3JpdGl6ZXJEYXRhKSB7XHJcbiAgICBcclxuICAgIHRoaXMuX3dvcmtlckhlbHBlci5jYWxsRnVuY3Rpb24oXHJcbiAgICAgICAgJ3NldERlY29kZVByaW9yaXRpemVyRGF0YScsXHJcbiAgICAgICAgWyBwcmlvcml0aXplckRhdGEgXSxcclxuICAgICAgICB7IGlzU2VuZEltbWVkaWF0ZWx5OiB0cnVlIH0pO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlJbWFnZURlY29kZXIucHJvdG90eXBlLnJlY29ubmVjdCA9IGZ1bmN0aW9uIHJlY29ubmVjdCgpIHtcclxuICAgIHRoaXMuX3dvcmtlckhlbHBlci5jYWxsRnVuY3Rpb24oJ3JlY29ubmVjdCcpO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlJbWFnZURlY29kZXIucHJvdG90eXBlLmFsaWduUGFyYW1zVG9UaWxlc0FuZExldmVsID0gZnVuY3Rpb24gYWxpZ25QYXJhbXNUb1RpbGVzQW5kTGV2ZWwocmVnaW9uKSB7XHJcblx0cmV0dXJuIGltYWdlSGVscGVyRnVuY3Rpb25zLmFsaWduUGFyYW1zVG9UaWxlc0FuZExldmVsKHJlZ2lvbiwgdGhpcyk7XHJcbn07XHJcblxyXG5Xb3JrZXJQcm94eUltYWdlRGVjb2Rlci5wcm90b3R5cGUuX2ltYWdlT3BlbmVkID0gZnVuY3Rpb24gaW1hZ2VPcGVuZWQoZGF0YSkge1xyXG4gICAgdGhpcy5faW50ZXJuYWxTaXplc1BhcmFtcyA9IGRhdGEuc2l6ZXNQYXJhbXM7XHJcbiAgICB0aGlzLl90aWxlV2lkdGggPSBkYXRhLmFwcGxpY2F0aXZlVGlsZVdpZHRoO1xyXG4gICAgdGhpcy5fdGlsZUhlaWdodCA9IGRhdGEuYXBwbGljYXRpdmVUaWxlSGVpZ2h0O1xyXG4gICAgdGhpcy5fdmFsaWRhdGVTaXplc0NhbGN1bGF0b3IoKTtcclxufTtcclxuXHJcbldvcmtlclByb3h5SW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5fZ2V0U2l6ZXNQYXJhbXNJbnRlcm5hbCA9IGZ1bmN0aW9uIGdldFNpemVzUGFyYW1zSW50ZXJuYWwoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5faW50ZXJuYWxTaXplc1BhcmFtcztcclxufTsiLCIndXNlIHN0cmljdCc7XHJcblxyXG4vLyBTdXBwcmVzcyBcIlVubmVjZXNzYXJ5IGRpcmVjdGl2ZSAndXNlIHN0cmljdCdcIiBmb3IgdGhlIHNsYXZlU2NyaXB0Q29udGVudCBmdW5jdGlvblxyXG4vKmpzaGludCAtVzAzNCAqL1xyXG5cclxuLyogZ2xvYmFsIHNlbGY6IGZhbHNlICovXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFdvcmtlclByb3h5UGl4ZWxzRGVjb2RlcjtcclxuXHJcbnZhciBpbWFnZUhlbHBlckZ1bmN0aW9ucyA9IHJlcXVpcmUoJ2ltYWdlaGVscGVyZnVuY3Rpb25zLmpzJyk7XHJcblxyXG52YXIgZGVjb2RlclNsYXZlU2NyaXB0QmxvYiA9IG5ldyBCbG9iKFxyXG4gICAgWycoJywgZGVjb2RlclNsYXZlU2NyaXB0Qm9keS50b1N0cmluZygpLCAnKSgpJ10sXHJcbiAgICB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0JyB9KTtcclxudmFyIGRlY29kZXJTbGF2ZVNjcmlwdFVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoZGVjb2RlclNsYXZlU2NyaXB0QmxvYik7XHJcblxyXG5mdW5jdGlvbiBXb3JrZXJQcm94eVBpeGVsc0RlY29kZXIob3B0aW9ucykge1xyXG4gICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgICB0aGlzLl9pbWFnZUltcGxlbWVudGF0aW9uID0gaW1hZ2VIZWxwZXJGdW5jdGlvbnMuZ2V0SW1hZ2VJbXBsZW1lbnRhdGlvbihcclxuICAgICAgICBvcHRpb25zLmltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUpO1xyXG4gICAgXHJcbiAgICB2YXIgc2NyaXB0c1RvSW1wb3J0ID0gKHRoaXMuX29wdGlvbnMuc2NyaXB0c1RvSW1wb3J0IHx8IFtdKS5jb25jYXQoW2RlY29kZXJTbGF2ZVNjcmlwdFVybF0pO1xyXG4gICAgdmFyIGFyZ3MgPSBbdGhpcy5fb3B0aW9uc107XHJcbiAgICBcclxuICAgIHRoaXMuX3dvcmtlckhlbHBlciA9IG5ldyBBc3luY1Byb3h5LkFzeW5jUHJveHlNYXN0ZXIoXHJcbiAgICAgICAgc2NyaXB0c1RvSW1wb3J0LFxyXG4gICAgICAgICdBcmJpdHJhcnlDbGFzc05hbWUnLFxyXG4gICAgICAgIGFyZ3MpO1xyXG59XHJcblxyXG5Xb3JrZXJQcm94eVBpeGVsc0RlY29kZXIucHJvdG90eXBlLmRlY29kZSA9IGZ1bmN0aW9uIGRlY29kZShkYXRhRm9yRGVjb2RlKSB7XHJcbiAgICAvL3ZhciB0cmFuc2ZlcmFibGVzID0gdGhpcy5faW1hZ2VJbXBsZW1lbnRhdGlvbi5nZXRUcmFuc2ZlcmFibGVPZkRlY29kZUFyZ3VtZW50cyhkYXRhRm9yRGVjb2RlKTtcclxuICAgIHZhciByZXN1bHRUcmFuc2ZlcmFibGVzID0gW1snZGF0YScsICdidWZmZXInXV07XHJcbiAgICBcclxuICAgIHZhciBhcmdzID0gW2RhdGFGb3JEZWNvZGVdO1xyXG4gICAgdmFyIG9wdGlvbnMgPSB7XHJcbiAgICAgICAgLy90cmFuc2ZlcmFibGVzOiB0cmFuc2ZlcmFibGVzLFxyXG4gICAgICAgIHBhdGhzVG9UcmFuc2ZlcmFibGVzSW5Qcm9taXNlUmVzdWx0OiByZXN1bHRUcmFuc2ZlcmFibGVzLFxyXG4gICAgICAgIGlzUmV0dXJuUHJvbWlzZTogdHJ1ZVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuX3dvcmtlckhlbHBlci5jYWxsRnVuY3Rpb24oJ2RlY29kZScsIGFyZ3MsIG9wdGlvbnMpO1xyXG59O1xyXG5cclxuV29ya2VyUHJveHlQaXhlbHNEZWNvZGVyLnByb3RvdHlwZS50ZXJtaW5hdGUgPSBmdW5jdGlvbiB0ZXJtaW5hdGUoKSB7XHJcbiAgICB0aGlzLl93b3JrZXJIZWxwZXIudGVybWluYXRlKCk7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBkZWNvZGVyU2xhdmVTY3JpcHRCb2R5KCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIEFzeW5jUHJveHkuQXN5bmNQcm94eVNsYXZlLnNldFNsYXZlU2lkZUNyZWF0b3IoZnVuY3Rpb24gY3JlYXRlRGVjb2RlcihvcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGltYWdlSW1wbGVtZW50YXRpb24gPSBzZWxmW29wdGlvbnMuaW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZV07XHJcbiAgICAgICAgcmV0dXJuIGltYWdlSW1wbGVtZW50YXRpb24uY3JlYXRlUGl4ZWxzRGVjb2RlcigpO1xyXG4gICAgfSk7XHJcbn0iLCIndXNlIHN0cmljdCc7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFZpZXdlckltYWdlRGVjb2RlcjtcclxuXHJcbnZhciBJbWFnZURlY29kZXIgPSByZXF1aXJlKCdpbWFnZWRlY29kZXIuanMnKTtcclxudmFyIFdvcmtlclByb3h5SW1hZ2VEZWNvZGVyID0gcmVxdWlyZSgnd29ya2VycHJveHlpbWFnZWRlY29kZXIuanMnKTtcclxudmFyIGltYWdlSGVscGVyRnVuY3Rpb25zID0gcmVxdWlyZSgnaW1hZ2VoZWxwZXJmdW5jdGlvbnMuanMnKTtcclxuXHJcbnZhciBQRU5ESU5HX0NBTExfVFlQRV9QSVhFTFNfVVBEQVRFRCA9IDE7XHJcbnZhciBQRU5ESU5HX0NBTExfVFlQRV9SRVBPU0lUSU9OID0gMjtcclxuXHJcbnZhciBSRUdJT05fT1ZFUlZJRVcgPSAwO1xyXG52YXIgUkVHSU9OX0RZTkFNSUMgPSAxO1xyXG5cclxuZnVuY3Rpb24gVmlld2VySW1hZ2VEZWNvZGVyKGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUsIGNhbnZhc1VwZGF0ZWRDYWxsYmFjaywgb3B0aW9ucykge1xyXG4gICAgdGhpcy5faW1hZ2VJbXBsZW1lbnRhdGlvbkNsYXNzTmFtZSA9IGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWU7XHJcbiAgICB0aGlzLl9jYW52YXNVcGRhdGVkQ2FsbGJhY2sgPSBjYW52YXNVcGRhdGVkQ2FsbGJhY2s7XHJcbiAgICBcclxuICAgIHRoaXMuX2FkYXB0UHJvcG9ydGlvbnMgPSBvcHRpb25zLmFkYXB0UHJvcG9ydGlvbnM7XHJcbiAgICB0aGlzLl9jYXJ0b2dyYXBoaWNCb3VuZHMgPSBvcHRpb25zLmNhcnRvZ3JhcGhpY0JvdW5kcztcclxuICAgIHRoaXMuX2lzTWFpbkltYWdlT25VaSA9IG9wdGlvbnMuaXNNYWluSW1hZ2VPblVpO1xyXG4gICAgdGhpcy5fc2hvd0xvZyA9IG9wdGlvbnMuc2hvd0xvZztcclxuICAgIHRoaXMuX2FsbG93TXVsdGlwbGVDaGFubmVsc0luU2Vzc2lvbiA9XHJcbiAgICAgICAgb3B0aW9ucy5hbGxvd011bHRpcGxlQ2hhbm5lbHNJblNlc3Npb247XHJcbiAgICB0aGlzLl9taW5GdW5jdGlvbkNhbGxJbnRlcnZhbE1pbGxpc2Vjb25kcyA9XHJcbiAgICAgICAgb3B0aW9ucy5taW5GdW5jdGlvbkNhbGxJbnRlcnZhbE1pbGxpc2Vjb25kcztcclxuICAgIHRoaXMuX292ZXJ2aWV3UmVzb2x1dGlvblggPSBvcHRpb25zLm92ZXJ2aWV3UmVzb2x1dGlvblggfHwgMTAwO1xyXG4gICAgdGhpcy5fb3ZlcnZpZXdSZXNvbHV0aW9uWSA9IG9wdGlvbnMub3ZlcnZpZXdSZXNvbHV0aW9uWSB8fCAxMDA7XHJcbiAgICB0aGlzLl93b3JrZXJzTGltaXQgPSBvcHRpb25zLndvcmtlcnNMaW1pdDtcclxuICAgICAgICBcclxuICAgIHRoaXMuX2xhc3RSZXF1ZXN0SW5kZXggPSAwO1xyXG4gICAgdGhpcy5fcGVuZGluZ1VwZGF0ZVZpZXdBcmVhID0gbnVsbDtcclxuICAgIHRoaXMuX3JlZ2lvbnMgPSBbXTtcclxuICAgIHRoaXMuX3RhcmdldENhbnZhcyA9IG51bGw7XHJcbiAgICBcclxuICAgIHRoaXMuX2NhbGxQZW5kaW5nQ2FsbGJhY2tzQm91bmQgPSB0aGlzLl9jYWxsUGVuZGluZ0NhbGxiYWNrcy5iaW5kKHRoaXMpO1xyXG4gICAgdGhpcy5fY3JlYXRlZENoYW5uZWxCb3VuZCA9IHRoaXMuX2NyZWF0ZWRDaGFubmVsLmJpbmQodGhpcyk7XHJcbiAgICBcclxuICAgIHRoaXMuX3BlbmRpbmdDYWxsYmFja3NJbnRlcnZhbEhhbmRsZSA9IDA7XHJcbiAgICB0aGlzLl9wZW5kaW5nQ2FsbGJhY2tDYWxscyA9IFtdO1xyXG4gICAgdGhpcy5fY2FuU2hvd0R5bmFtaWNSZWdpb24gPSBmYWxzZTtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2NhcnRvZ3JhcGhpY0JvdW5kcyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdGhpcy5fY2FydG9ncmFwaGljQm91bmRzID0ge1xyXG4gICAgICAgICAgICB3ZXN0OiAtMTc1LjAsXHJcbiAgICAgICAgICAgIGVhc3Q6IDE3NS4wLFxyXG4gICAgICAgICAgICBzb3V0aDogLTg1LjAsXHJcbiAgICAgICAgICAgIG5vcnRoOiA4NS4wXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHRoaXMuX2FkYXB0UHJvcG9ydGlvbnMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRoaXMuX2FkYXB0UHJvcG9ydGlvbnMgPSB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgSW1hZ2VUeXBlID0gdGhpcy5faXNNYWluSW1hZ2VPblVpID9cclxuICAgICAgICBJbWFnZURlY29kZXI6IFdvcmtlclByb3h5SW1hZ2VEZWNvZGVyO1xyXG4gICAgICAgIFxyXG4gICAgdGhpcy5faW1hZ2UgPSBuZXcgSW1hZ2VUeXBlKGltYWdlSW1wbGVtZW50YXRpb25DbGFzc05hbWUsIHtcclxuICAgICAgICBzZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXI6ICdmcnVzdHVtT25seScsXHJcbiAgICAgICAgZGVjb2RlUHJpb3JpdGl6ZXI6ICdmcnVzdHVtT25seScsXHJcbiAgICAgICAgc2hvd0xvZzogdGhpcy5fc2hvd0xvZyxcclxuICAgICAgICB3b3JrZXJzTGltaXQ6IHRoaXMuX3dvcmtlcnNMaW1pdFxyXG4gICAgICAgIH0pO1xyXG59XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLnNldEV4Y2VwdGlvbkNhbGxiYWNrID0gZnVuY3Rpb24gc2V0RXhjZXB0aW9uQ2FsbGJhY2soZXhjZXB0aW9uQ2FsbGJhY2spIHtcclxuICAgIC8vIFRPRE86IFN1cHBvcnQgZXhjZXB0aW9uQ2FsbGJhY2sgaW4gZXZlcnkgcGxhY2UgbmVlZGVkXHJcblx0dGhpcy5fZXhjZXB0aW9uQ2FsbGJhY2sgPSBleGNlcHRpb25DYWxsYmFjaztcclxufTtcclxuICAgIFxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbiBvcGVuKHVybCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2ltYWdlLm9wZW4odXJsKVxyXG4gICAgICAgIC50aGVuKHRoaXMuX29wZW5lZC5iaW5kKHRoaXMpKVxyXG4gICAgICAgIC5jYXRjaCh0aGlzLl9leGNlcHRpb25DYWxsYmFjayk7XHJcbn07XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gY2xvc2UoKSB7XHJcbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMuX2ltYWdlLmNsb3NlKCk7XHJcbiAgICBwcm9taXNlLmNhdGNoKHRoaXMuX2V4Y2VwdGlvbkNhbGxiYWNrKTtcclxuICAgIHRoaXMuX2lzUmVhZHkgPSBmYWxzZTtcclxuICAgIHRoaXMuX2NhblNob3dEeW5hbWljUmVnaW9uID0gZmFsc2U7XHJcbiAgICB0aGlzLl90YXJnZXRDYW52YXMgPSBudWxsO1xyXG5cdHJldHVybiBwcm9taXNlO1xyXG59O1xyXG5cclxuVmlld2VySW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5zZXRUYXJnZXRDYW52YXMgPSBmdW5jdGlvbiBzZXRUYXJnZXRDYW52YXMoY2FudmFzKSB7XHJcbiAgICB0aGlzLl90YXJnZXRDYW52YXMgPSBjYW52YXM7XHJcbn07XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLnVwZGF0ZVZpZXdBcmVhID0gZnVuY3Rpb24gdXBkYXRlVmlld0FyZWEoZnJ1c3R1bURhdGEpIHtcclxuICAgIGlmICh0aGlzLl90YXJnZXRDYW52YXMgPT09IG51bGwpIHtcclxuICAgICAgICB0aHJvdyAnQ2Fubm90IHVwZGF0ZSBkeW5hbWljIHJlZ2lvbiBiZWZvcmUgc2V0VGFyZ2V0Q2FudmFzKCknO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMuX2NhblNob3dEeW5hbWljUmVnaW9uKSB7XHJcbiAgICAgICAgdGhpcy5fcGVuZGluZ1VwZGF0ZVZpZXdBcmVhID0gZnJ1c3R1bURhdGE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgYm91bmRzID0gZnJ1c3R1bURhdGEucmVjdGFuZ2xlO1xyXG4gICAgdmFyIHNjcmVlblNpemUgPSBmcnVzdHVtRGF0YS5zY3JlZW5TaXplO1xyXG4gICAgXHJcbiAgICB2YXIgcmVnaW9uUGFyYW1zID0ge1xyXG4gICAgICAgIG1pblg6IGJvdW5kcy53ZXN0ICogdGhpcy5fc2NhbGVYICsgdGhpcy5fdHJhbnNsYXRlWCxcclxuICAgICAgICBtaW5ZOiBib3VuZHMubm9ydGggKiB0aGlzLl9zY2FsZVkgKyB0aGlzLl90cmFuc2xhdGVZLFxyXG4gICAgICAgIG1heFhFeGNsdXNpdmU6IGJvdW5kcy5lYXN0ICogdGhpcy5fc2NhbGVYICsgdGhpcy5fdHJhbnNsYXRlWCxcclxuICAgICAgICBtYXhZRXhjbHVzaXZlOiBib3VuZHMuc291dGggKiB0aGlzLl9zY2FsZVkgKyB0aGlzLl90cmFuc2xhdGVZLFxyXG4gICAgICAgIHNjcmVlbldpZHRoOiBzY3JlZW5TaXplLngsXHJcbiAgICAgICAgc2NyZWVuSGVpZ2h0OiBzY3JlZW5TaXplLnlcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciBhbGlnbmVkUGFyYW1zID1cclxuICAgICAgICBpbWFnZUhlbHBlckZ1bmN0aW9ucy5hbGlnblBhcmFtc1RvVGlsZXNBbmRMZXZlbChcclxuICAgICAgICAgICAgcmVnaW9uUGFyYW1zLCB0aGlzLl9pbWFnZSk7XHJcbiAgICBcclxuICAgIHZhciBpc091dHNpZGVTY3JlZW4gPSBhbGlnbmVkUGFyYW1zID09PSBudWxsO1xyXG4gICAgaWYgKGlzT3V0c2lkZVNjcmVlbikge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMucXVhbGl0eSA9IHRoaXMuX3F1YWxpdHk7XHJcblxyXG4gICAgdmFyIGlzU2FtZVJlZ2lvbiA9XHJcbiAgICAgICAgdGhpcy5fZHluYW1pY0ZldGNoUGFyYW1zICE9PSB1bmRlZmluZWQgJiZcclxuICAgICAgICB0aGlzLl9pc0ltYWdlUGFydHNFcXVhbChcclxuICAgICAgICAgICAgYWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMsXHJcbiAgICAgICAgICAgIHRoaXMuX2R5bmFtaWNGZXRjaFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMpO1xyXG4gICAgXHJcbiAgICBpZiAoaXNTYW1lUmVnaW9uKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmcnVzdHVtRGF0YS5pbWFnZVJlY3RhbmdsZSA9IHRoaXMuX2NhcnRvZ3JhcGhpY0JvdW5kc0ZpeGVkO1xyXG4gICAgZnJ1c3R1bURhdGEuZXhhY3RsZXZlbCA9XHJcbiAgICAgICAgYWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMubGV2ZWw7XHJcbiAgICBcclxuICAgIHRoaXMuX2ltYWdlLnNldERlY29kZVByaW9yaXRpemVyRGF0YShmcnVzdHVtRGF0YSk7XHJcbiAgICB0aGlzLl9pbWFnZS5zZXRTZXJ2ZXJSZXF1ZXN0UHJpb3JpdGl6ZXJEYXRhKGZydXN0dW1EYXRhKTtcclxuXHJcbiAgICB0aGlzLl9keW5hbWljRmV0Y2hQYXJhbXMgPSBhbGlnbmVkUGFyYW1zO1xyXG4gICAgXHJcbiAgICB2YXIgc3RhcnREeW5hbWljUmVnaW9uT25UZXJtaW5hdGlvbiA9IGZhbHNlO1xyXG4gICAgdmFyIG1vdmVFeGlzdGluZ0NoYW5uZWwgPSAhdGhpcy5fYWxsb3dNdWx0aXBsZUNoYW5uZWxzSW5TZXNzaW9uO1xyXG4gICAgdGhpcy5fZmV0Y2goXHJcbiAgICAgICAgUkVHSU9OX0RZTkFNSUMsXHJcbiAgICAgICAgYWxpZ25lZFBhcmFtcyxcclxuICAgICAgICBzdGFydER5bmFtaWNSZWdpb25PblRlcm1pbmF0aW9uLFxyXG4gICAgICAgIG1vdmVFeGlzdGluZ0NoYW5uZWwpO1xyXG59O1xyXG5cclxuVmlld2VySW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5nZXRCb3VuZHMgPSBmdW5jdGlvbiBnZXRDYXJ0b2dyYXBoaWNCb3VuZHMoKSB7XHJcbiAgICBpZiAoIXRoaXMuX2lzUmVhZHkpIHtcclxuICAgICAgICB0aHJvdyAnVmlld2VySW1hZ2VEZWNvZGVyIGVycm9yOiBJbWFnZSBpcyBub3QgcmVhZHkgeWV0JztcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLl9jYXJ0b2dyYXBoaWNCb3VuZHNGaXhlZDtcclxufTtcclxuXHJcblZpZXdlckltYWdlRGVjb2Rlci5wcm90b3R5cGUuX2lzSW1hZ2VQYXJ0c0VxdWFsID0gZnVuY3Rpb24gaXNJbWFnZVBhcnRzRXF1YWwoZmlyc3QsIHNlY29uZCkge1xyXG4gICAgdmFyIGlzRXF1YWwgPVxyXG4gICAgICAgIHRoaXMuX2R5bmFtaWNGZXRjaFBhcmFtcyAhPT0gdW5kZWZpbmVkICYmXHJcbiAgICAgICAgZmlyc3QubWluWCA9PT0gc2Vjb25kLm1pblggJiZcclxuICAgICAgICBmaXJzdC5taW5ZID09PSBzZWNvbmQubWluWSAmJlxyXG4gICAgICAgIGZpcnN0Lm1heFhFeGNsdXNpdmUgPT09IHNlY29uZC5tYXhYRXhjbHVzaXZlICYmXHJcbiAgICAgICAgZmlyc3QubWF4WUV4Y2x1c2l2ZSA9PT0gc2Vjb25kLm1heFlFeGNsdXNpdmUgJiZcclxuICAgICAgICBmaXJzdC5sZXZlbCA9PT0gc2Vjb25kLmxldmVsO1xyXG4gICAgXHJcbiAgICByZXR1cm4gaXNFcXVhbDtcclxufTtcclxuXHJcblZpZXdlckltYWdlRGVjb2Rlci5wcm90b3R5cGUuX2ZldGNoID0gZnVuY3Rpb24gZmV0Y2goXHJcbiAgICByZWdpb25JZCxcclxuICAgIGZldGNoUGFyYW1zLFxyXG4gICAgc3RhcnREeW5hbWljUmVnaW9uT25UZXJtaW5hdGlvbixcclxuICAgIG1vdmVFeGlzdGluZ0NoYW5uZWwpIHtcclxuICAgIFxyXG4gICAgdmFyIHJlcXVlc3RJbmRleCA9ICsrdGhpcy5fbGFzdFJlcXVlc3RJbmRleDtcclxuICAgIFxyXG4gICAgdmFyIGltYWdlUGFydFBhcmFtcyA9IGZldGNoUGFyYW1zLmltYWdlUGFydFBhcmFtcztcclxuICAgIGltYWdlUGFydFBhcmFtcy5yZXF1ZXN0UHJpb3JpdHlEYXRhID1cclxuICAgICAgICBpbWFnZVBhcnRQYXJhbXMucmVxdWVzdFByaW9yaXR5RGF0YSB8fCB7fTtcclxuICAgIFxyXG4gICAgaW1hZ2VQYXJ0UGFyYW1zLnJlcXVlc3RQcmlvcml0eURhdGEucmVxdWVzdEluZGV4ID0gcmVxdWVzdEluZGV4O1xyXG5cclxuICAgIHZhciBtaW5YID0gZmV0Y2hQYXJhbXMucG9zaXRpb25JbkltYWdlLm1pblg7XHJcbiAgICB2YXIgbWluWSA9IGZldGNoUGFyYW1zLnBvc2l0aW9uSW5JbWFnZS5taW5ZO1xyXG4gICAgdmFyIG1heFggPSBmZXRjaFBhcmFtcy5wb3NpdGlvbkluSW1hZ2UubWF4WEV4Y2x1c2l2ZTtcclxuICAgIHZhciBtYXhZID0gZmV0Y2hQYXJhbXMucG9zaXRpb25JbkltYWdlLm1heFlFeGNsdXNpdmU7XHJcbiAgICBcclxuICAgIHZhciB3ZXN0ID0gKG1pblggLSB0aGlzLl90cmFuc2xhdGVYKSAvIHRoaXMuX3NjYWxlWDtcclxuICAgIHZhciBlYXN0ID0gKG1heFggLSB0aGlzLl90cmFuc2xhdGVYKSAvIHRoaXMuX3NjYWxlWDtcclxuICAgIHZhciBub3J0aCA9IChtaW5ZIC0gdGhpcy5fdHJhbnNsYXRlWSkgLyB0aGlzLl9zY2FsZVk7XHJcbiAgICB2YXIgc291dGggPSAobWF4WSAtIHRoaXMuX3RyYW5zbGF0ZVkpIC8gdGhpcy5fc2NhbGVZO1xyXG4gICAgXHJcbiAgICB2YXIgcG9zaXRpb24gPSB7XHJcbiAgICAgICAgd2VzdDogd2VzdCxcclxuICAgICAgICBlYXN0OiBlYXN0LFxyXG4gICAgICAgIG5vcnRoOiBub3J0aCxcclxuICAgICAgICBzb3V0aDogc291dGhcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciBjYW5SZXVzZU9sZERhdGEgPSBmYWxzZTtcclxuICAgIHZhciBmZXRjaFBhcmFtc05vdE5lZWRlZDtcclxuICAgIFxyXG4gICAgdmFyIHJlZ2lvbiA9IHRoaXMuX3JlZ2lvbnNbcmVnaW9uSWRdO1xyXG4gICAgaWYgKHJlZ2lvbiAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgdmFyIG5ld1Jlc29sdXRpb24gPSBpbWFnZVBhcnRQYXJhbXMubGV2ZWw7XHJcbiAgICAgICAgdmFyIG9sZFJlc29sdXRpb24gPSByZWdpb24uaW1hZ2VQYXJ0UGFyYW1zLmxldmVsO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNhblJldXNlT2xkRGF0YSA9IG5ld1Jlc29sdXRpb24gPT09IG9sZFJlc29sdXRpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNhblJldXNlT2xkRGF0YSAmJiByZWdpb24uZG9uZVBhcnRQYXJhbXMpIHtcclxuICAgICAgICAgICAgZmV0Y2hQYXJhbXNOb3ROZWVkZWQgPSBbIHJlZ2lvbi5kb25lUGFydFBhcmFtcyBdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHJlZ2lvbklkICE9PSBSRUdJT05fT1ZFUlZJRVcpIHtcclxuICAgICAgICAgICAgdmFyIGFkZGVkUGVuZGluZ0NhbGwgPSB0aGlzLl9jaGVja0lmUmVwb3NpdGlvbk5lZWRlZChcclxuICAgICAgICAgICAgICAgIHJlZ2lvbiwgaW1hZ2VQYXJ0UGFyYW1zLCBwb3NpdGlvbik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoYWRkZWRQZW5kaW5nQ2FsbCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbm90aWZ5TmV3UGVuZGluZ0NhbGxzKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIFxyXG4gICAgdmFyIGNoYW5uZWxIYW5kbGUgPSBtb3ZlRXhpc3RpbmdDaGFubmVsID8gdGhpcy5fY2hhbm5lbEhhbmRsZTogdW5kZWZpbmVkO1xyXG5cclxuICAgIHRoaXMuX2ltYWdlLnJlcXVlc3RQaXhlbHNQcm9ncmVzc2l2ZShcclxuICAgICAgICBmZXRjaFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMsXHJcbiAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAgICAgdGVybWluYXRlZENhbGxiYWNrLFxyXG4gICAgICAgIGZldGNoUGFyYW1zTm90TmVlZGVkLFxyXG4gICAgICAgIGNoYW5uZWxIYW5kbGUpO1xyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBjYWxsYmFjayhkZWNvZGVkKSB7XHJcbiAgICAgICAgc2VsZi5fdGlsZXNEZWNvZGVkQ2FsbGJhY2soXHJcbiAgICAgICAgICAgIHJlZ2lvbklkLFxyXG4gICAgICAgICAgICBmZXRjaFBhcmFtcyxcclxuICAgICAgICAgICAgcG9zaXRpb24sXHJcbiAgICAgICAgICAgIGRlY29kZWQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiB0ZXJtaW5hdGVkQ2FsbGJhY2soaXNBYm9ydGVkKSB7XHJcbiAgICAgICAgaWYgKGlzQWJvcnRlZCAmJlxyXG4gICAgICAgICAgICBpbWFnZVBhcnRQYXJhbXMucmVxdWVzdFByaW9yaXR5RGF0YS5vdmVycmlkZUhpZ2hlc3RQcmlvcml0eSkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gTk9URTogQnVnIGluIGtkdV9zZXJ2ZXIgY2F1c2VzIGZpcnN0IHJlcXVlc3QgdG8gYmUgc2VudCB3cm9uZ2x5LlxyXG4gICAgICAgICAgICAvLyBUaGVuIENocm9tZSByYWlzZXMgRVJSX0lOVkFMSURfQ0hVTktFRF9FTkNPRElORyBhbmQgdGhlIHJlcXVlc3RcclxuICAgICAgICAgICAgLy8gbmV2ZXIgcmV0dXJucy4gVGh1cyBwZXJmb3JtIHNlY29uZCByZXF1ZXN0LlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2VsZi5faW1hZ2UucmVxdWVzdFBpeGVsc1Byb2dyZXNzaXZlKFxyXG4gICAgICAgICAgICAgICAgZmV0Y2hQYXJhbXMuaW1hZ2VQYXJ0UGFyYW1zLFxyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2ssXHJcbiAgICAgICAgICAgICAgICB0ZXJtaW5hdGVkQ2FsbGJhY2ssXHJcbiAgICAgICAgICAgICAgICBmZXRjaFBhcmFtc05vdE5lZWRlZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHNlbGYuX2ZldGNoVGVybWluYXRlZENhbGxiYWNrKFxyXG4gICAgICAgICAgICByZWdpb25JZCxcclxuICAgICAgICAgICAgZmV0Y2hQYXJhbXMuaW1hZ2VQYXJ0UGFyYW1zLnJlcXVlc3RQcmlvcml0eURhdGEsXHJcbiAgICAgICAgICAgIGlzQWJvcnRlZCxcclxuICAgICAgICAgICAgc3RhcnREeW5hbWljUmVnaW9uT25UZXJtaW5hdGlvbik7XHJcbiAgICB9XHJcbn07XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLl9mZXRjaFRlcm1pbmF0ZWRDYWxsYmFjayA9IGZ1bmN0aW9uIGZldGNoVGVybWluYXRlZENhbGxiYWNrKFxyXG4gICAgcmVnaW9uSWQsIHByaW9yaXR5RGF0YSwgaXNBYm9ydGVkLCBzdGFydER5bmFtaWNSZWdpb25PblRlcm1pbmF0aW9uKSB7XHJcbiAgICBcclxuICAgIHZhciByZWdpb24gPSB0aGlzLl9yZWdpb25zW3JlZ2lvbklkXTtcclxuICAgIGlmIChyZWdpb24gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFwcmlvcml0eURhdGEub3ZlcnJpZGVIaWdoZXN0UHJpb3JpdHkgJiZcclxuICAgICAgICBwcmlvcml0eURhdGEucmVxdWVzdEluZGV4ICE9PSB0aGlzLl9sYXN0UmVxdWVzdEluZGV4KSB7XHJcbiAgICBcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlZ2lvbi5pc0RvbmUgPSAhaXNBYm9ydGVkICYmIHRoaXMuX2lzUmVhZHk7XHJcblx0aWYgKHJlZ2lvbi5pc0RvbmUpIHtcclxuXHRcdHJlZ2lvbi5kb25lUGFydFBhcmFtcyA9IHJlZ2lvbi5pbWFnZVBhcnRQYXJhbXM7XHJcblx0fVxyXG4gICAgXHJcbiAgICBpZiAoc3RhcnREeW5hbWljUmVnaW9uT25UZXJtaW5hdGlvbikge1xyXG4gICAgICAgIHRoaXMuX2ltYWdlLmNyZWF0ZUNoYW5uZWwoXHJcbiAgICAgICAgICAgIHRoaXMuX2NyZWF0ZWRDaGFubmVsQm91bmQpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuVmlld2VySW1hZ2VEZWNvZGVyLnByb3RvdHlwZS5fY3JlYXRlZENoYW5uZWwgPSBmdW5jdGlvbiBjcmVhdGVkQ2hhbm5lbChjaGFubmVsSGFuZGxlKSB7XHJcbiAgICB0aGlzLl9jaGFubmVsSGFuZGxlID0gY2hhbm5lbEhhbmRsZTtcclxuICAgIHRoaXMuX3N0YXJ0U2hvd2luZ0R5bmFtaWNSZWdpb24oKTtcclxufTtcclxuXHJcblZpZXdlckltYWdlRGVjb2Rlci5wcm90b3R5cGUuX3N0YXJ0U2hvd2luZ0R5bmFtaWNSZWdpb24gPSBmdW5jdGlvbiBzdGFydFNob3dpbmdEeW5hbWljUmVnaW9uKCkge1xyXG4gICAgdGhpcy5fY2FuU2hvd0R5bmFtaWNSZWdpb24gPSB0cnVlO1xyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fcGVuZGluZ1VwZGF0ZVZpZXdBcmVhICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy51cGRhdGVWaWV3QXJlYSh0aGlzLl9wZW5kaW5nVXBkYXRlVmlld0FyZWEpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuX3BlbmRpbmdVcGRhdGVWaWV3QXJlYSA9IG51bGw7XHJcbiAgICB9XHJcbn07XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLl90aWxlc0RlY29kZWRDYWxsYmFjayA9IGZ1bmN0aW9uIHRpbGVzRGVjb2RlZENhbGxiYWNrKFxyXG4gICAgcmVnaW9uSWQsIGZldGNoUGFyYW1zLCBwb3NpdGlvbiwgZGVjb2RlZCkge1xyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMuX2lzUmVhZHkpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciByZWdpb24gPSB0aGlzLl9yZWdpb25zW3JlZ2lvbklkXTtcclxuICAgIGlmIChyZWdpb24gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJlZ2lvbiA9IHt9O1xyXG4gICAgICAgIHRoaXMuX3JlZ2lvbnNbcmVnaW9uSWRdID0gcmVnaW9uO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHN3aXRjaCAocmVnaW9uSWQpIHtcclxuICAgICAgICAgICAgY2FzZSBSRUdJT05fRFlOQU1JQzpcclxuICAgICAgICAgICAgICAgIHJlZ2lvbi5jYW52YXMgPSB0aGlzLl90YXJnZXRDYW52YXM7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjYXNlIFJFR0lPTl9PVkVSVklFVzpcclxuICAgICAgICAgICAgICAgIHJlZ2lvbi5jYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93ICdVbmV4cGVjdGVkIHJlZ2lvbklkICcgKyByZWdpb25JZDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBwYXJ0UGFyYW1zID0gZmV0Y2hQYXJhbXMuaW1hZ2VQYXJ0UGFyYW1zO1xyXG4gICAgaWYgKCFwYXJ0UGFyYW1zLnJlcXVlc3RQcmlvcml0eURhdGEub3ZlcnJpZGVIaWdoZXN0UHJpb3JpdHkgJiZcclxuICAgICAgICBwYXJ0UGFyYW1zLnJlcXVlc3RQcmlvcml0eURhdGEucmVxdWVzdEluZGV4IDwgcmVnaW9uLmN1cnJlbnREaXNwbGF5UmVxdWVzdEluZGV4KSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLl9jaGVja0lmUmVwb3NpdGlvbk5lZWRlZChyZWdpb24sIHBhcnRQYXJhbXMsIHBvc2l0aW9uKTtcclxuICAgICAgICBcclxuICAgIHRoaXMuX3BlbmRpbmdDYWxsYmFja0NhbGxzLnB1c2goe1xyXG4gICAgICAgIHR5cGU6IFBFTkRJTkdfQ0FMTF9UWVBFX1BJWEVMU19VUERBVEVELFxyXG4gICAgICAgIHJlZ2lvbjogcmVnaW9uLFxyXG4gICAgICAgIGRlY29kZWQ6IGRlY29kZWRcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICB0aGlzLl9ub3RpZnlOZXdQZW5kaW5nQ2FsbHMoKTtcclxufTtcclxuXHJcblZpZXdlckltYWdlRGVjb2Rlci5wcm90b3R5cGUuX2NoZWNrSWZSZXBvc2l0aW9uTmVlZGVkID0gZnVuY3Rpb24gY2hlY2tJZlJlcG9zaXRpb25OZWVkZWQoXHJcbiAgICByZWdpb24sIG5ld1BhcnRQYXJhbXMsIG5ld1Bvc2l0aW9uKSB7XHJcbiAgICBcclxuICAgIHZhciBvbGRQYXJ0UGFyYW1zID0gcmVnaW9uLmltYWdlUGFydFBhcmFtcztcclxuXHR2YXIgb2xkRG9uZVBhcnRQYXJhbXMgPSByZWdpb24uZG9uZVBhcnRQYXJhbXM7XHJcbiAgICB2YXIgbGV2ZWwgPSBuZXdQYXJ0UGFyYW1zLmxldmVsO1xyXG4gICAgXHJcbiAgICB2YXIgbmVlZFJlcG9zaXRpb24gPVxyXG4gICAgICAgIG9sZFBhcnRQYXJhbXMgPT09IHVuZGVmaW5lZCB8fFxyXG4gICAgICAgIG9sZFBhcnRQYXJhbXMubWluWCAhPT0gbmV3UGFydFBhcmFtcy5taW5YIHx8XHJcbiAgICAgICAgb2xkUGFydFBhcmFtcy5taW5ZICE9PSBuZXdQYXJ0UGFyYW1zLm1pblkgfHxcclxuICAgICAgICBvbGRQYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUgIT09IG5ld1BhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSB8fFxyXG4gICAgICAgIG9sZFBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSAhPT0gbmV3UGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlIHx8XHJcbiAgICAgICAgb2xkUGFydFBhcmFtcy5sZXZlbCAhPT0gbGV2ZWw7XHJcbiAgICBcclxuICAgIGlmICghbmVlZFJlcG9zaXRpb24pIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBjb3B5RGF0YTtcclxuICAgIHZhciBpbnRlcnNlY3Rpb247XHJcblx0dmFyIG5ld0RvbmVQYXJ0UGFyYW1zO1xyXG4gICAgdmFyIHJldXNlT2xkRGF0YSA9IGZhbHNlO1xyXG4gICAgdmFyIHNjYWxlWDtcclxuICAgIHZhciBzY2FsZVk7XHJcbiAgICBpZiAob2xkUGFydFBhcmFtcyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgc2NhbGVYID0gdGhpcy5faW1hZ2UuZ2V0TGV2ZWxXaWR0aCAobGV2ZWwpIC8gdGhpcy5faW1hZ2UuZ2V0TGV2ZWxXaWR0aCAob2xkUGFydFBhcmFtcy5sZXZlbCk7XHJcbiAgICAgICAgc2NhbGVZID0gdGhpcy5faW1hZ2UuZ2V0TGV2ZWxIZWlnaHQobGV2ZWwpIC8gdGhpcy5faW1hZ2UuZ2V0TGV2ZWxIZWlnaHQob2xkUGFydFBhcmFtcy5sZXZlbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaW50ZXJzZWN0aW9uID0ge1xyXG4gICAgICAgICAgICBtaW5YOiBNYXRoLm1heChvbGRQYXJ0UGFyYW1zLm1pblggKiBzY2FsZVgsIG5ld1BhcnRQYXJhbXMubWluWCksXHJcbiAgICAgICAgICAgIG1pblk6IE1hdGgubWF4KG9sZFBhcnRQYXJhbXMubWluWSAqIHNjYWxlWSwgbmV3UGFydFBhcmFtcy5taW5ZKSxcclxuICAgICAgICAgICAgbWF4WDogTWF0aC5taW4ob2xkUGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlICogc2NhbGVYLCBuZXdQYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUpLFxyXG4gICAgICAgICAgICBtYXhZOiBNYXRoLm1pbihvbGRQYXJ0UGFyYW1zLm1heFlFeGNsdXNpdmUgKiBzY2FsZVksIG5ld1BhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSlcclxuICAgICAgICB9O1xyXG4gICAgICAgIHJldXNlT2xkRGF0YSA9XHJcbiAgICAgICAgICAgIGludGVyc2VjdGlvbi5tYXhYID4gaW50ZXJzZWN0aW9uLm1pblggJiZcclxuICAgICAgICAgICAgaW50ZXJzZWN0aW9uLm1heFkgPiBpbnRlcnNlY3Rpb24ubWluWTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHJldXNlT2xkRGF0YSkge1xyXG4gICAgICAgIGNvcHlEYXRhID0ge1xyXG4gICAgICAgICAgICBmcm9tWDogaW50ZXJzZWN0aW9uLm1pblggLyBzY2FsZVggLSBvbGRQYXJ0UGFyYW1zLm1pblgsXHJcbiAgICAgICAgICAgIGZyb21ZOiBpbnRlcnNlY3Rpb24ubWluWSAvIHNjYWxlWSAtIG9sZFBhcnRQYXJhbXMubWluWSxcclxuICAgICAgICAgICAgZnJvbVdpZHRoIDogKGludGVyc2VjdGlvbi5tYXhYIC0gaW50ZXJzZWN0aW9uLm1pblgpIC8gc2NhbGVYLFxyXG4gICAgICAgICAgICBmcm9tSGVpZ2h0OiAoaW50ZXJzZWN0aW9uLm1heFkgLSBpbnRlcnNlY3Rpb24ubWluWSkgLyBzY2FsZVksXHJcbiAgICAgICAgICAgIHRvWDogaW50ZXJzZWN0aW9uLm1pblggLSBuZXdQYXJ0UGFyYW1zLm1pblgsXHJcbiAgICAgICAgICAgIHRvWTogaW50ZXJzZWN0aW9uLm1pblkgLSBuZXdQYXJ0UGFyYW1zLm1pblksXHJcbiAgICAgICAgICAgIHRvV2lkdGggOiBpbnRlcnNlY3Rpb24ubWF4WCAtIGludGVyc2VjdGlvbi5taW5YLFxyXG4gICAgICAgICAgICB0b0hlaWdodDogaW50ZXJzZWN0aW9uLm1heFkgLSBpbnRlcnNlY3Rpb24ubWluWSxcclxuICAgICAgICB9O1xyXG5cdFxyXG5cdFx0aWYgKG9sZERvbmVQYXJ0UGFyYW1zICYmIG9sZFBhcnRQYXJhbXMubGV2ZWwgPT09IGxldmVsKSB7XHJcblx0XHRcdG5ld0RvbmVQYXJ0UGFyYW1zID0ge1xyXG5cdFx0XHRcdG1pblg6IE1hdGgubWF4KG9sZERvbmVQYXJ0UGFyYW1zLm1pblgsIG5ld1BhcnRQYXJhbXMubWluWCksXHJcblx0XHRcdFx0bWluWTogTWF0aC5tYXgob2xkRG9uZVBhcnRQYXJhbXMubWluWSwgbmV3UGFydFBhcmFtcy5taW5ZKSxcclxuXHRcdFx0XHRtYXhYRXhjbHVzaXZlOiBNYXRoLm1pbihvbGREb25lUGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlLCBuZXdQYXJ0UGFyYW1zLm1heFhFeGNsdXNpdmUpLFxyXG5cdFx0XHRcdG1heFlFeGNsdXNpdmU6IE1hdGgubWluKG9sZERvbmVQYXJ0UGFyYW1zLm1heFlFeGNsdXNpdmUsIG5ld1BhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSlcclxuXHRcdFx0fTtcclxuXHRcdH1cclxuXHR9XHJcbiAgICBcclxuICAgIHJlZ2lvbi5pbWFnZVBhcnRQYXJhbXMgPSBuZXdQYXJ0UGFyYW1zO1xyXG4gICAgcmVnaW9uLmlzRG9uZSA9IGZhbHNlO1xyXG4gICAgcmVnaW9uLmN1cnJlbnREaXNwbGF5UmVxdWVzdEluZGV4ID0gbmV3UGFydFBhcmFtcy5yZXF1ZXN0UHJpb3JpdHlEYXRhLnJlcXVlc3RJbmRleDtcclxuICAgIFxyXG4gICAgdmFyIHJlcG9zaXRpb25BcmdzID0ge1xyXG4gICAgICAgIHR5cGU6IFBFTkRJTkdfQ0FMTF9UWVBFX1JFUE9TSVRJT04sXHJcbiAgICAgICAgcmVnaW9uOiByZWdpb24sXHJcbiAgICAgICAgcG9zaXRpb246IG5ld1Bvc2l0aW9uLFxyXG5cdFx0ZG9uZVBhcnRQYXJhbXM6IG5ld0RvbmVQYXJ0UGFyYW1zLFxyXG4gICAgICAgIGNvcHlEYXRhOiBjb3B5RGF0YSxcclxuICAgICAgICBwaXhlbHNXaWR0aDogbmV3UGFydFBhcmFtcy5tYXhYRXhjbHVzaXZlIC0gbmV3UGFydFBhcmFtcy5taW5YLFxyXG4gICAgICAgIHBpeGVsc0hlaWdodDogbmV3UGFydFBhcmFtcy5tYXhZRXhjbHVzaXZlIC0gbmV3UGFydFBhcmFtcy5taW5ZXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLl9wZW5kaW5nQ2FsbGJhY2tDYWxscy5wdXNoKHJlcG9zaXRpb25BcmdzKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRydWU7XHJcbn07XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLl9ub3RpZnlOZXdQZW5kaW5nQ2FsbHMgPSBmdW5jdGlvbiBub3RpZnlOZXdQZW5kaW5nQ2FsbHMoKSB7XHJcbiAgICBpZiAoIXRoaXMuX2lzTmVhckNhbGxiYWNrQ2FsbGVkKSB7XHJcbiAgICAgICAgdGhpcy5fY2FsbFBlbmRpbmdDYWxsYmFja3MoKTtcclxuICAgIH1cclxufTtcclxuXHJcblZpZXdlckltYWdlRGVjb2Rlci5wcm90b3R5cGUuX2NhbGxQZW5kaW5nQ2FsbGJhY2tzID0gZnVuY3Rpb24gY2FsbFBlbmRpbmdDYWxsYmFja3MoKSB7XHJcbiAgICBpZiAodGhpcy5fcGVuZGluZ0NhbGxiYWNrQ2FsbHMubGVuZ3RoID09PSAwIHx8ICF0aGlzLl9pc1JlYWR5KSB7XHJcbiAgICAgICAgdGhpcy5faXNOZWFyQ2FsbGJhY2tDYWxsZWQgPSBmYWxzZTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9pc05lYXJDYWxsYmFja0NhbGxlZCkge1xyXG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9wZW5kaW5nQ2FsbGJhY2tzSW50ZXJ2YWxIYW5kbGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5fbWluRnVuY3Rpb25DYWxsSW50ZXJ2YWxNaWxsaXNlY29uZHMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHRoaXMuX3BlbmRpbmdDYWxsYmFja3NJbnRlcnZhbEhhbmRsZSA9XHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQodGhpcy5fY2FsbFBlbmRpbmdDYWxsYmFja3NCb3VuZCxcclxuICAgICAgICAgICAgdGhpcy5fbWluRnVuY3Rpb25DYWxsSW50ZXJ2YWxNaWxsaXNlY29uZHMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB0aGlzLl9pc05lYXJDYWxsYmFja0NhbGxlZCA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG5ld1Bvc2l0aW9uID0gbnVsbDtcclxuICAgIFxyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLl9wZW5kaW5nQ2FsbGJhY2tDYWxscy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgIHZhciBjYWxsQXJncyA9IHRoaXMuX3BlbmRpbmdDYWxsYmFja0NhbGxzW2ldO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjYWxsQXJncy50eXBlID09PSBQRU5ESU5HX0NBTExfVFlQRV9SRVBPU0lUSU9OKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3JlcG9zaXRpb25DYW52YXMoY2FsbEFyZ3MpO1xyXG4gICAgICAgICAgICBuZXdQb3NpdGlvbiA9IGNhbGxBcmdzLnBvc2l0aW9uO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoY2FsbEFyZ3MudHlwZSA9PT0gUEVORElOR19DQUxMX1RZUEVfUElYRUxTX1VQREFURUQpIHtcclxuICAgICAgICAgICAgdGhpcy5fcGl4ZWxzVXBkYXRlZChjYWxsQXJncyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgJ0ludGVybmFsIFZpZXdlckltYWdlRGVjb2RlciBFcnJvcjogVW5leHBlY3RlZCBjYWxsIHR5cGUgJyArXHJcbiAgICAgICAgICAgICAgICBjYWxsQXJncy50eXBlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fcGVuZGluZ0NhbGxiYWNrQ2FsbHMubGVuZ3RoID0gMDtcclxuICAgIFxyXG4gICAgdGhpcy5fY2FudmFzVXBkYXRlZENhbGxiYWNrKG5ld1Bvc2l0aW9uKTtcclxufTtcclxuXHJcblZpZXdlckltYWdlRGVjb2Rlci5wcm90b3R5cGUuX3BpeGVsc1VwZGF0ZWQgPSBmdW5jdGlvbiBwaXhlbHNVcGRhdGVkKHBpeGVsc1VwZGF0ZWRBcmdzKSB7XHJcbiAgICB2YXIgcmVnaW9uID0gcGl4ZWxzVXBkYXRlZEFyZ3MucmVnaW9uO1xyXG4gICAgdmFyIGRlY29kZWQgPSBwaXhlbHNVcGRhdGVkQXJncy5kZWNvZGVkO1xyXG4gICAgaWYgKGRlY29kZWQuaW1hZ2VEYXRhLndpZHRoID09PSAwIHx8IGRlY29kZWQuaW1hZ2VEYXRhLmhlaWdodCA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHggPSBkZWNvZGVkLnhJbk9yaWdpbmFsUmVxdWVzdDtcclxuICAgIHZhciB5ID0gZGVjb2RlZC55SW5PcmlnaW5hbFJlcXVlc3Q7XHJcbiAgICBcclxuICAgIHZhciBjb250ZXh0ID0gcmVnaW9uLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xyXG4gICAgLy92YXIgaW1hZ2VEYXRhID0gY29udGV4dC5jcmVhdGVJbWFnZURhdGEoZGVjb2RlZC53aWR0aCwgZGVjb2RlZC5oZWlnaHQpO1xyXG4gICAgLy9pbWFnZURhdGEuZGF0YS5zZXQoZGVjb2RlZC5waXhlbHMpO1xyXG4gICAgXHJcbiAgICBjb250ZXh0LnB1dEltYWdlRGF0YShkZWNvZGVkLmltYWdlRGF0YSwgeCwgeSk7XHJcbn07XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLl9yZXBvc2l0aW9uQ2FudmFzID0gZnVuY3Rpb24gcmVwb3NpdGlvbkNhbnZhcyhyZXBvc2l0aW9uQXJncykge1xyXG4gICAgdmFyIHJlZ2lvbiA9IHJlcG9zaXRpb25BcmdzLnJlZ2lvbjtcclxuICAgIHZhciBwb3NpdGlvbiA9IHJlcG9zaXRpb25BcmdzLnBvc2l0aW9uO1xyXG5cdHZhciBkb25lUGFydFBhcmFtcyA9IHJlcG9zaXRpb25BcmdzLmRvbmVQYXJ0UGFyYW1zO1xyXG4gICAgdmFyIGNvcHlEYXRhID0gcmVwb3NpdGlvbkFyZ3MuY29weURhdGE7XHJcbiAgICB2YXIgcGl4ZWxzV2lkdGggPSByZXBvc2l0aW9uQXJncy5waXhlbHNXaWR0aDtcclxuICAgIHZhciBwaXhlbHNIZWlnaHQgPSByZXBvc2l0aW9uQXJncy5waXhlbHNIZWlnaHQ7XHJcbiAgICBcclxuICAgIHZhciBpbWFnZURhdGFUb0NvcHk7XHJcbiAgICB2YXIgY29udGV4dCA9IHJlZ2lvbi5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgIFxyXG4gICAgaWYgKGNvcHlEYXRhICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBpZiAoY29weURhdGEuZnJvbVdpZHRoID09PSBjb3B5RGF0YS50b1dpZHRoICYmIGNvcHlEYXRhLmZyb21IZWlnaHQgPT09IGNvcHlEYXRhLnRvSGVpZ2h0KSB7XHJcbiAgICAgICAgICAgIGltYWdlRGF0YVRvQ29weSA9IGNvbnRleHQuZ2V0SW1hZ2VEYXRhKFxyXG4gICAgICAgICAgICAgICAgY29weURhdGEuZnJvbVgsIGNvcHlEYXRhLmZyb21ZLCBjb3B5RGF0YS5mcm9tV2lkdGgsIGNvcHlEYXRhLmZyb21IZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5fdG1wQ2FudmFzKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl90bXBDYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3RtcENhbnZhc0NvbnRleHQgPSB0aGlzLl90bXBDYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5fdG1wQ2FudmFzLndpZHRoICA9IGNvcHlEYXRhLnRvV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuX3RtcENhbnZhcy5oZWlnaHQgPSBjb3B5RGF0YS50b0hlaWdodDtcclxuICAgICAgICAgICAgdGhpcy5fdG1wQ2FudmFzQ29udGV4dC5kcmF3SW1hZ2UoXHJcbiAgICAgICAgICAgICAgICByZWdpb24uY2FudmFzLFxyXG4gICAgICAgICAgICAgICAgY29weURhdGEuZnJvbVgsIGNvcHlEYXRhLmZyb21ZLCBjb3B5RGF0YS5mcm9tV2lkdGgsIGNvcHlEYXRhLmZyb21IZWlnaHQsXHJcbiAgICAgICAgICAgICAgICAwLCAwLCBjb3B5RGF0YS50b1dpZHRoLCBjb3B5RGF0YS50b0hlaWdodCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpbWFnZURhdGFUb0NvcHkgPSB0aGlzLl90bXBDYW52YXNDb250ZXh0LmdldEltYWdlRGF0YShcclxuICAgICAgICAgICAgICAgIDAsIDAsIGNvcHlEYXRhLnRvV2lkdGgsIGNvcHlEYXRhLnRvSGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlZ2lvbi5jYW52YXMud2lkdGggPSBwaXhlbHNXaWR0aDtcclxuICAgIHJlZ2lvbi5jYW52YXMuaGVpZ2h0ID0gcGl4ZWxzSGVpZ2h0O1xyXG4gICAgXHJcbiAgICBpZiAocmVnaW9uICE9PSB0aGlzLl9yZWdpb25zW1JFR0lPTl9PVkVSVklFV10pIHtcclxuICAgICAgICB0aGlzLl9jb3B5T3ZlcnZpZXdUb0NhbnZhcyhcclxuICAgICAgICAgICAgY29udGV4dCwgcG9zaXRpb24sIHBpeGVsc1dpZHRoLCBwaXhlbHNIZWlnaHQpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoY29weURhdGEgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGNvbnRleHQucHV0SW1hZ2VEYXRhKGltYWdlRGF0YVRvQ29weSwgY29weURhdGEudG9YLCBjb3B5RGF0YS50b1kpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZWdpb24ucG9zaXRpb24gPSBwb3NpdGlvbjtcclxuXHRyZWdpb24uZG9uZVBhcnRQYXJhbXMgPSBkb25lUGFydFBhcmFtcztcclxufTtcclxuXHJcblZpZXdlckltYWdlRGVjb2Rlci5wcm90b3R5cGUuX2NvcHlPdmVydmlld1RvQ2FudmFzID0gZnVuY3Rpb24gY29weU92ZXJ2aWV3VG9DYW52YXMoXHJcbiAgICBjb250ZXh0LCBjYW52YXNQb3NpdGlvbiwgY2FudmFzUGl4ZWxzV2lkdGgsIGNhbnZhc1BpeGVsc0hlaWdodCkge1xyXG4gICAgXHJcbiAgICB2YXIgc291cmNlUG9zaXRpb24gPSB0aGlzLl9yZWdpb25zW1JFR0lPTl9PVkVSVklFV10ucG9zaXRpb247XHJcbiAgICB2YXIgc291cmNlUGl4ZWxzID1cclxuICAgICAgICB0aGlzLl9yZWdpb25zW1JFR0lPTl9PVkVSVklFV10uaW1hZ2VQYXJ0UGFyYW1zO1xyXG4gICAgXHJcbiAgICB2YXIgc291cmNlUGl4ZWxzV2lkdGggPVxyXG4gICAgICAgIHNvdXJjZVBpeGVscy5tYXhYRXhjbHVzaXZlIC0gc291cmNlUGl4ZWxzLm1pblg7XHJcbiAgICB2YXIgc291cmNlUGl4ZWxzSGVpZ2h0ID1cclxuICAgICAgICBzb3VyY2VQaXhlbHMubWF4WUV4Y2x1c2l2ZSAtIHNvdXJjZVBpeGVscy5taW5ZO1xyXG4gICAgXHJcbiAgICB2YXIgc291cmNlUG9zaXRpb25XaWR0aCA9XHJcbiAgICAgICAgc291cmNlUG9zaXRpb24uZWFzdCAtIHNvdXJjZVBvc2l0aW9uLndlc3Q7XHJcbiAgICB2YXIgc291cmNlUG9zaXRpb25IZWlnaHQgPVxyXG4gICAgICAgIHNvdXJjZVBvc2l0aW9uLm5vcnRoIC0gc291cmNlUG9zaXRpb24uc291dGg7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgc291cmNlUmVzb2x1dGlvblggPVxyXG4gICAgICAgIHNvdXJjZVBpeGVsc1dpZHRoIC8gc291cmNlUG9zaXRpb25XaWR0aDtcclxuICAgIHZhciBzb3VyY2VSZXNvbHV0aW9uWSA9XHJcbiAgICAgICAgc291cmNlUGl4ZWxzSGVpZ2h0IC8gc291cmNlUG9zaXRpb25IZWlnaHQ7XHJcbiAgICBcclxuICAgIHZhciB0YXJnZXRQb3NpdGlvbldpZHRoID1cclxuICAgICAgICBjYW52YXNQb3NpdGlvbi5lYXN0IC0gY2FudmFzUG9zaXRpb24ud2VzdDtcclxuICAgIHZhciB0YXJnZXRQb3NpdGlvbkhlaWdodCA9XHJcbiAgICAgICAgY2FudmFzUG9zaXRpb24ubm9ydGggLSBjYW52YXNQb3NpdGlvbi5zb3V0aDtcclxuICAgICAgICBcclxuICAgIHZhciBjcm9wV2lkdGggPSB0YXJnZXRQb3NpdGlvbldpZHRoICogc291cmNlUmVzb2x1dGlvblg7XHJcbiAgICB2YXIgY3JvcEhlaWdodCA9IHRhcmdldFBvc2l0aW9uSGVpZ2h0ICogc291cmNlUmVzb2x1dGlvblk7XHJcbiAgICBcclxuICAgIHZhciBjcm9wT2Zmc2V0UG9zaXRpb25YID1cclxuICAgICAgICBjYW52YXNQb3NpdGlvbi53ZXN0IC0gc291cmNlUG9zaXRpb24ud2VzdDtcclxuICAgIHZhciBjcm9wT2Zmc2V0UG9zaXRpb25ZID1cclxuICAgICAgICBzb3VyY2VQb3NpdGlvbi5ub3J0aCAtIGNhbnZhc1Bvc2l0aW9uLm5vcnRoO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIGNyb3BQaXhlbE9mZnNldFggPSBjcm9wT2Zmc2V0UG9zaXRpb25YICogc291cmNlUmVzb2x1dGlvblg7XHJcbiAgICB2YXIgY3JvcFBpeGVsT2Zmc2V0WSA9IGNyb3BPZmZzZXRQb3NpdGlvblkgKiBzb3VyY2VSZXNvbHV0aW9uWTtcclxuICAgIFxyXG4gICAgY29udGV4dC5kcmF3SW1hZ2UoXHJcbiAgICAgICAgdGhpcy5fcmVnaW9uc1tSRUdJT05fT1ZFUlZJRVddLmNhbnZhcyxcclxuICAgICAgICBjcm9wUGl4ZWxPZmZzZXRYLCBjcm9wUGl4ZWxPZmZzZXRZLCBjcm9wV2lkdGgsIGNyb3BIZWlnaHQsXHJcbiAgICAgICAgMCwgMCwgY2FudmFzUGl4ZWxzV2lkdGgsIGNhbnZhc1BpeGVsc0hlaWdodCk7XHJcbn07XHJcblxyXG5WaWV3ZXJJbWFnZURlY29kZXIucHJvdG90eXBlLl9vcGVuZWQgPSBmdW5jdGlvbiBvcGVuZWQoKSB7XHJcbiAgICB0aGlzLl9pc1JlYWR5ID0gdHJ1ZTtcclxuICAgIFxyXG4gICAgdmFyIGZpeGVkQm91bmRzID0ge1xyXG4gICAgICAgIHdlc3Q6IHRoaXMuX2NhcnRvZ3JhcGhpY0JvdW5kcy53ZXN0LFxyXG4gICAgICAgIGVhc3Q6IHRoaXMuX2NhcnRvZ3JhcGhpY0JvdW5kcy5lYXN0LFxyXG4gICAgICAgIHNvdXRoOiB0aGlzLl9jYXJ0b2dyYXBoaWNCb3VuZHMuc291dGgsXHJcbiAgICAgICAgbm9ydGg6IHRoaXMuX2NhcnRvZ3JhcGhpY0JvdW5kcy5ub3J0aFxyXG4gICAgfTtcclxuICAgIGltYWdlSGVscGVyRnVuY3Rpb25zLmZpeEJvdW5kcyhcclxuICAgICAgICBmaXhlZEJvdW5kcywgdGhpcy5faW1hZ2UsIHRoaXMuX2FkYXB0UHJvcG9ydGlvbnMpO1xyXG4gICAgdGhpcy5fY2FydG9ncmFwaGljQm91bmRzRml4ZWQgPSBmaXhlZEJvdW5kcztcclxuICAgIFxyXG4gICAgdmFyIGxldmVsID0gdGhpcy5faW1hZ2UuZ2V0SW1hZ2VMZXZlbCgpO1xyXG4gICAgdmFyIGltYWdlV2lkdGggPSB0aGlzLl9pbWFnZS5nZXRMZXZlbFdpZHRoKGxldmVsKTtcclxuICAgIHZhciBpbWFnZUhlaWdodCA9IHRoaXMuX2ltYWdlLmdldExldmVsSGVpZ2h0KGxldmVsKTtcclxuICAgIHRoaXMuX3F1YWxpdHkgPSB0aGlzLl9pbWFnZS5nZXRIaWdoZXN0UXVhbGl0eSgpO1xyXG5cclxuICAgIHZhciByZWN0YW5nbGVXaWR0aCA9IGZpeGVkQm91bmRzLmVhc3QgLSBmaXhlZEJvdW5kcy53ZXN0O1xyXG4gICAgdmFyIHJlY3RhbmdsZUhlaWdodCA9IGZpeGVkQm91bmRzLm5vcnRoIC0gZml4ZWRCb3VuZHMuc291dGg7XHJcbiAgICB0aGlzLl9zY2FsZVggPSBpbWFnZVdpZHRoIC8gcmVjdGFuZ2xlV2lkdGg7XHJcbiAgICB0aGlzLl9zY2FsZVkgPSAtaW1hZ2VIZWlnaHQgLyByZWN0YW5nbGVIZWlnaHQ7XHJcbiAgICBcclxuICAgIHRoaXMuX3RyYW5zbGF0ZVggPSAtZml4ZWRCb3VuZHMud2VzdCAqIHRoaXMuX3NjYWxlWDtcclxuICAgIHRoaXMuX3RyYW5zbGF0ZVkgPSAtZml4ZWRCb3VuZHMubm9ydGggKiB0aGlzLl9zY2FsZVk7XHJcbiAgICBcclxuICAgIHZhciBvdmVydmlld1BhcmFtcyA9IHtcclxuICAgICAgICBtaW5YOiAwLFxyXG4gICAgICAgIG1pblk6IDAsXHJcbiAgICAgICAgbWF4WEV4Y2x1c2l2ZTogaW1hZ2VXaWR0aCxcclxuICAgICAgICBtYXhZRXhjbHVzaXZlOiBpbWFnZUhlaWdodCxcclxuICAgICAgICBzY3JlZW5XaWR0aDogdGhpcy5fb3ZlcnZpZXdSZXNvbHV0aW9uWCxcclxuICAgICAgICBzY3JlZW5IZWlnaHQ6IHRoaXMuX292ZXJ2aWV3UmVzb2x1dGlvbllcclxuICAgIH07XHJcbiAgICBcclxuICAgIHZhciBvdmVydmlld0FsaWduZWRQYXJhbXMgPVxyXG4gICAgICAgIGltYWdlSGVscGVyRnVuY3Rpb25zLmFsaWduUGFyYW1zVG9UaWxlc0FuZExldmVsKFxyXG4gICAgICAgICAgICBvdmVydmlld1BhcmFtcywgdGhpcy5faW1hZ2UpO1xyXG4gICAgICAgICAgICBcclxuICAgIG92ZXJ2aWV3QWxpZ25lZFBhcmFtcy5pbWFnZVBhcnRQYXJhbXMucmVxdWVzdFByaW9yaXR5RGF0YSA9XHJcbiAgICAgICAgb3ZlcnZpZXdBbGlnbmVkUGFyYW1zLmltYWdlUGFydFBhcmFtcy5yZXF1ZXN0UHJpb3JpdHlEYXRhIHx8IHt9O1xyXG4gICAgXHJcbiAgICBvdmVydmlld0FsaWduZWRQYXJhbXMuaW1hZ2VQYXJ0UGFyYW1zLnJlcXVlc3RQcmlvcml0eURhdGEub3ZlcnJpZGVIaWdoZXN0UHJpb3JpdHkgPSB0cnVlO1xyXG4gICAgb3ZlcnZpZXdBbGlnbmVkUGFyYW1zLmltYWdlUGFydFBhcmFtcy5xdWFsaXR5ID0gdGhpcy5faW1hZ2UuZ2V0TG93ZXN0UXVhbGl0eSgpO1xyXG4gICAgXHJcbiAgICB2YXIgc3RhcnREeW5hbWljUmVnaW9uT25UZXJtaW5hdGlvbiA9XHJcbiAgICAgICAgIXRoaXMuX2FsbG93TXVsdGlwbGVDaGFubmVsc0luU2Vzc2lvbjtcclxuICAgICAgICBcclxuICAgIHRoaXMuX2ZldGNoKFxyXG4gICAgICAgIFJFR0lPTl9PVkVSVklFVyxcclxuICAgICAgICBvdmVydmlld0FsaWduZWRQYXJhbXMsXHJcbiAgICAgICAgc3RhcnREeW5hbWljUmVnaW9uT25UZXJtaW5hdGlvbik7XHJcbiAgICBcclxuICAgIGlmICh0aGlzLl9hbGxvd011bHRpcGxlQ2hhbm5lbHNJblNlc3Npb24pIHtcclxuICAgICAgICB0aGlzLl9zdGFydFNob3dpbmdEeW5hbWljUmVnaW9uKCk7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMuVmlld2VySW1hZ2VEZWNvZGVyID0gcmVxdWlyZSgndmlld2VyaW1hZ2VkZWNvZGVyLmpzJyk7XHJcbm1vZHVsZS5leHBvcnRzLkltYWdlRGVjb2RlciA9IHJlcXVpcmUoJ2ltYWdlZGVjb2Rlci5qcycpO1xyXG5tb2R1bGUuZXhwb3J0cy5TaW1wbGVGZXRjaGVyID0gcmVxdWlyZSgnc2ltcGxlZmV0Y2hlci5qcycpO1xyXG5tb2R1bGUuZXhwb3J0cy5TaW1wbGVQaXhlbHNEZWNvZGVyQmFzZSA9IHJlcXVpcmUoJ3NpbXBsZXBpeGVsc2RlY29kZXJiYXNlLmpzJyk7XHJcbm1vZHVsZS5leHBvcnRzLkNlc2l1bUltYWdlRGVjb2RlckxheWVyTWFuYWdlciA9IHJlcXVpcmUoJ19jZXNpdW1pbWFnZWRlY29kZXJsYXllcm1hbmFnZXIuanMnKTtcclxubW9kdWxlLmV4cG9ydHMuSW1hZ2VEZWNvZGVySW1hZ2VyeVByb3ZpZGVyID0gcmVxdWlyZSgnaW1hZ2VkZWNvZGVyaW1hZ2VyeXByb3ZpZGVyLmpzJyk7XHJcbm1vZHVsZS5leHBvcnRzLkltYWdlRGVjb2RlclJlZ2lvbkxheWVyID0gcmVxdWlyZSgnaW1hZ2VkZWNvZGVycmVnaW9ubGF5ZXIuanMnKTtcclxubW9kdWxlLmV4cG9ydHMuSW50ZXJuYWxzID0ge1xyXG4gICAgRmV0Y2hNYW5hZ2VyOiByZXF1aXJlKCdmZXRjaG1hbmFnZXIuanMnKVxyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBWaWV3ZXJJbWFnZURlY29kZXIgPSByZXF1aXJlKCd2aWV3ZXJpbWFnZWRlY29kZXIuanMnKTtcclxudmFyIGNhbGN1bGF0ZUxlYWZsZXRGcnVzdHVtID0gcmVxdWlyZSgnbGVhZmxldGZydXN0dW1jYWxjdWxhdG9yLmpzJyk7XHJcblxyXG4vKiBnbG9iYWwgTDogZmFsc2UgKi9cclxuLyogZ2xvYmFsIHNlbGY6IGZhbHNlICovXHJcblxyXG5pZiAoc2VsZi5MKSB7XHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEwuQ2xhc3MuZXh0ZW5kKGNyZWF0ZUltYWdlRGVjb2RlclJlZ2lvbkxheWVyRnVuY3Rpb25zKCkpO1xyXG59IGVsc2Uge1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBpbnN0YW50aWF0ZSBJbWFnZURlY29kZXJSZWdpb25MYXllcjogTm8gTGVhZmxldCBuYW1lc3BhY2UgaW4gc2NvcGUnKTtcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUltYWdlRGVjb2RlclJlZ2lvbkxheWVyRnVuY3Rpb25zKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBpbml0aWFsaXplOiBmdW5jdGlvbiBpbml0aWFsaXplKG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAodGhpcy5fb3B0aW9ucy5sYXRMbmdCb3VuZHMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fb3B0aW9ucyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0aW9ucykpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fb3B0aW9ucy5jYXJ0b2dyYXBoaWNCb3VuZHMgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgd2VzdDogb3B0aW9ucy5sYXRMbmdCb3VuZHMuZ2V0V2VzdCgpLFxyXG4gICAgICAgICAgICAgICAgICAgIGVhc3Q6IG9wdGlvbnMubGF0TG5nQm91bmRzLmdldEVhc3QoKSxcclxuICAgICAgICAgICAgICAgICAgICBzb3V0aDogb3B0aW9ucy5sYXRMbmdCb3VuZHMuZ2V0U291dGgoKSxcclxuICAgICAgICAgICAgICAgICAgICBub3J0aDogb3B0aW9ucy5sYXRMbmdCb3VuZHMuZ2V0Tm9ydGgoKVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5fdGFyZ2V0Q2FudmFzID0gbnVsbDtcclxuICAgICAgICAgICAgdGhpcy5fY2FudmFzUG9zaXRpb24gPSBudWxsO1xyXG4gICAgICAgICAgICB0aGlzLl9jYW52YXNVcGRhdGVkQ2FsbGJhY2tCb3VuZCA9IHRoaXMuX2NhbnZhc1VwZGF0ZWRDYWxsYmFjay5iaW5kKHRoaXMpO1xyXG4gICAgICAgICAgICB0aGlzLl9pbWFnZSA9IG51bGw7XHJcbiAgICAgICAgICAgIHRoaXMuX2V4Y2VwdGlvbkNhbGxiYWNrID0gbnVsbDtcclxuICAgICAgICB9LFxyXG4gICAgICAgIFxyXG4gICAgICAgIHNldEV4Y2VwdGlvbkNhbGxiYWNrOiBmdW5jdGlvbiBzZXRFeGNlcHRpb25DYWxsYmFjayhleGNlcHRpb25DYWxsYmFjaykge1xyXG4gICAgICAgICAgICB0aGlzLl9leGNlcHRpb25DYWxsYmFjayA9IGV4Y2VwdGlvbkNhbGxiYWNrO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5faW1hZ2UgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX2ltYWdlLnNldEV4Y2VwdGlvbkNhbGxiYWNrKGV4Y2VwdGlvbkNhbGxiYWNrKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXHJcbiAgICAgICAgX2NyZWF0ZUltYWdlOiBmdW5jdGlvbiBjcmVhdGVJbWFnZSgpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuX2ltYWdlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9pbWFnZSA9IG5ldyBWaWV3ZXJJbWFnZURlY29kZXIoXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fb3B0aW9ucy5pbWFnZUltcGxlbWVudGF0aW9uQ2xhc3NOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NhbnZhc1VwZGF0ZWRDYWxsYmFja0JvdW5kLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX29wdGlvbnMpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fZXhjZXB0aW9uQ2FsbGJhY2sgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pbWFnZS5zZXRFeGNlcHRpb25DYWxsYmFjayh0aGlzLl9leGNlcHRpb25DYWxsYmFjayk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHRoaXMuX2ltYWdlLm9wZW4odGhpcy5fb3B0aW9ucy51cmwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgb25BZGQ6IGZ1bmN0aW9uIG9uQWRkKG1hcCkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5fbWFwICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93ICdDYW5ub3QgYWRkIHRoaXMgbGF5ZXIgdG8gdHdvIG1hcHMnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLl9tYXAgPSBtYXA7XHJcbiAgICAgICAgICAgIHRoaXMuX2NyZWF0ZUltYWdlKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBjcmVhdGUgYSBET00gZWxlbWVudCBhbmQgcHV0IGl0IGludG8gb25lIG9mIHRoZSBtYXAgcGFuZXNcclxuICAgICAgICAgICAgdGhpcy5fdGFyZ2V0Q2FudmFzID0gTC5Eb21VdGlsLmNyZWF0ZShcclxuICAgICAgICAgICAgICAgICdjYW52YXMnLCAnaW1hZ2UtZGVjb2Rlci1sYXllci1jYW52YXMgbGVhZmxldC16b29tLWFuaW1hdGVkJyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLl9pbWFnZS5zZXRUYXJnZXRDYW52YXModGhpcy5fdGFyZ2V0Q2FudmFzKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuX2NhbnZhc1Bvc2l0aW9uID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBtYXAuZ2V0UGFuZXMoKS5tYXBQYW5lLmFwcGVuZENoaWxkKHRoaXMuX3RhcmdldENhbnZhcyk7XHJcblxyXG4gICAgICAgICAgICAvLyBhZGQgYSB2aWV3cmVzZXQgZXZlbnQgbGlzdGVuZXIgZm9yIHVwZGF0aW5nIGxheWVyJ3MgcG9zaXRpb24sIGRvIHRoZSBsYXR0ZXJcclxuICAgICAgICAgICAgbWFwLm9uKCd2aWV3cmVzZXQnLCB0aGlzLl9tb3ZlZCwgdGhpcyk7XHJcbiAgICAgICAgICAgIG1hcC5vbignbW92ZScsIHRoaXMuX21vdmVkLCB0aGlzKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChMLkJyb3dzZXIuYW55M2QpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5vbignem9vbWFuaW0nLCB0aGlzLl9hbmltYXRlWm9vbSwgdGhpcyk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuX21vdmVkKCk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgb25SZW1vdmU6IGZ1bmN0aW9uIG9uUmVtb3ZlKG1hcCkge1xyXG4gICAgICAgICAgICBpZiAobWFwICE9PSB0aGlzLl9tYXApIHtcclxuICAgICAgICAgICAgICAgIHRocm93ICdSZW1vdmVkIGZyb20gd3JvbmcgbWFwJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbWFwLm9mZigndmlld3Jlc2V0JywgdGhpcy5fbW92ZWQsIHRoaXMpO1xyXG4gICAgICAgICAgICBtYXAub2ZmKCdtb3ZlJywgdGhpcy5fbW92ZWQsIHRoaXMpO1xyXG4gICAgICAgICAgICBtYXAub2ZmKCd6b29tYW5pbScsIHRoaXMuX2FuaW1hdGVab29tLCB0aGlzKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIHJlbW92ZSBsYXllcidzIERPTSBlbGVtZW50cyBhbmQgbGlzdGVuZXJzXHJcbiAgICAgICAgICAgIG1hcC5nZXRQYW5lcygpLm1hcFBhbmUucmVtb3ZlQ2hpbGQodGhpcy5fdGFyZ2V0Q2FudmFzKTtcclxuICAgICAgICAgICAgdGhpcy5fdGFyZ2V0Q2FudmFzID0gbnVsbDtcclxuICAgICAgICAgICAgdGhpcy5fY2FudmFzUG9zaXRpb24gPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fbWFwID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5faW1hZ2UuY2xvc2UoKTtcclxuICAgICAgICAgICAgdGhpcy5faW1hZ2UgPSBudWxsO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXHJcbiAgICAgICAgX21vdmVkOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX21vdmVDYW52YXNlcygpO1xyXG5cclxuICAgICAgICAgICAgdmFyIGZydXN0dW1EYXRhID0gY2FsY3VsYXRlTGVhZmxldEZydXN0dW0odGhpcy5fbWFwKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuX2ltYWdlLnVwZGF0ZVZpZXdBcmVhKGZydXN0dW1EYXRhKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIFxyXG4gICAgICAgIF9jYW52YXNVcGRhdGVkQ2FsbGJhY2s6IGZ1bmN0aW9uIGNhbnZhc1VwZGF0ZWRDYWxsYmFjayhuZXdQb3NpdGlvbikge1xyXG4gICAgICAgICAgICBpZiAobmV3UG9zaXRpb24gIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX2NhbnZhc1Bvc2l0aW9uID0gbmV3UG9zaXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9tb3ZlQ2FudmFzZXMoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXHJcbiAgICAgICAgX21vdmVDYW52YXNlczogZnVuY3Rpb24gbW92ZUNhbnZhc2VzKCkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5fY2FudmFzUG9zaXRpb24gPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyB1cGRhdGUgbGF5ZXIncyBwb3NpdGlvblxyXG4gICAgICAgICAgICB2YXIgd2VzdCA9IHRoaXMuX2NhbnZhc1Bvc2l0aW9uLndlc3Q7XHJcbiAgICAgICAgICAgIHZhciBlYXN0ID0gdGhpcy5fY2FudmFzUG9zaXRpb24uZWFzdDtcclxuICAgICAgICAgICAgdmFyIHNvdXRoID0gdGhpcy5fY2FudmFzUG9zaXRpb24uc291dGg7XHJcbiAgICAgICAgICAgIHZhciBub3J0aCA9IHRoaXMuX2NhbnZhc1Bvc2l0aW9uLm5vcnRoO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHRvcExlZnQgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KFtub3J0aCwgd2VzdF0pO1xyXG4gICAgICAgICAgICB2YXIgYm90dG9tUmlnaHQgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KFtzb3V0aCwgZWFzdF0pO1xyXG4gICAgICAgICAgICB2YXIgc2l6ZSA9IGJvdHRvbVJpZ2h0LnN1YnRyYWN0KHRvcExlZnQpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgTC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX3RhcmdldENhbnZhcywgdG9wTGVmdCk7XHJcbiAgICAgICAgICAgIHRoaXMuX3RhcmdldENhbnZhcy5zdHlsZS53aWR0aCA9IHNpemUueCArICdweCc7XHJcbiAgICAgICAgICAgIHRoaXMuX3RhcmdldENhbnZhcy5zdHlsZS5oZWlnaHQgPSBzaXplLnkgKyAncHgnO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXHJcbiAgICAgICAgX2FuaW1hdGVab29tOiBmdW5jdGlvbiBhbmltYXRlWm9vbShvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIC8vIE5PVEU6IEFsbCBtZXRob2QgKGluY2x1ZGluZyB1c2luZyBvZiBwcml2YXRlIG1ldGhvZFxyXG4gICAgICAgICAgICAvLyBfbGF0TG5nVG9OZXdMYXllclBvaW50KSB3YXMgY29waWVkIGZyb20gSW1hZ2VPdmVybGF5LFxyXG4gICAgICAgICAgICAvLyBhcyBMZWFmbGV0IGRvY3VtZW50YXRpb24gcmVjb21tZW5kcy5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciB3ZXN0ID0gIHRoaXMuX2NhbnZhc1Bvc2l0aW9uLndlc3Q7XHJcbiAgICAgICAgICAgIHZhciBlYXN0ID0gIHRoaXMuX2NhbnZhc1Bvc2l0aW9uLmVhc3Q7XHJcbiAgICAgICAgICAgIHZhciBzb3V0aCA9IHRoaXMuX2NhbnZhc1Bvc2l0aW9uLnNvdXRoO1xyXG4gICAgICAgICAgICB2YXIgbm9ydGggPSB0aGlzLl9jYW52YXNQb3NpdGlvbi5ub3J0aDtcclxuXHJcbiAgICAgICAgICAgIHZhciB0b3BMZWZ0ID0gdGhpcy5fbWFwLl9sYXRMbmdUb05ld0xheWVyUG9pbnQoXHJcbiAgICAgICAgICAgICAgICBbbm9ydGgsIHdlc3RdLCBvcHRpb25zLnpvb20sIG9wdGlvbnMuY2VudGVyKTtcclxuICAgICAgICAgICAgdmFyIGJvdHRvbVJpZ2h0ID0gdGhpcy5fbWFwLl9sYXRMbmdUb05ld0xheWVyUG9pbnQoXHJcbiAgICAgICAgICAgICAgICBbc291dGgsIGVhc3RdLCBvcHRpb25zLnpvb20sIG9wdGlvbnMuY2VudGVyKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBzY2FsZSA9IHRoaXMuX21hcC5nZXRab29tU2NhbGUob3B0aW9ucy56b29tKTtcclxuICAgICAgICAgICAgdmFyIHNpemUgPSBib3R0b21SaWdodC5zdWJ0cmFjdCh0b3BMZWZ0KTtcclxuICAgICAgICAgICAgdmFyIHNpemVTY2FsZWQgPSBzaXplLm11bHRpcGx5QnkoKDEgLyAyKSAqICgxIC0gMSAvIHNjYWxlKSk7XHJcbiAgICAgICAgICAgIHZhciBvcmlnaW4gPSB0b3BMZWZ0LmFkZChzaXplU2NhbGVkKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuX3RhcmdldENhbnZhcy5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9XHJcbiAgICAgICAgICAgICAgICBMLkRvbVV0aWwuZ2V0VHJhbnNsYXRlU3RyaW5nKG9yaWdpbikgKyAnIHNjYWxlKCcgKyBzY2FsZSArICcpICc7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxufSIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciBpbWFnZUhlbHBlckZ1bmN0aW9ucyA9IHJlcXVpcmUoJ2ltYWdlaGVscGVyZnVuY3Rpb25zLmpzJyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNhbGN1bGF0ZUxlYWZsZXRGcnVzdHVtKGxlYWZsZXRNYXApIHtcclxuICAgIHZhciBzY3JlZW5TaXplID0gbGVhZmxldE1hcC5nZXRTaXplKCk7XHJcbiAgICB2YXIgYm91bmRzID0gbGVhZmxldE1hcC5nZXRCb3VuZHMoKTtcclxuXHJcbiAgICB2YXIgY2FydG9ncmFwaGljQm91bmRzID0ge1xyXG4gICAgICAgIHdlc3Q6IGJvdW5kcy5nZXRXZXN0KCksXHJcbiAgICAgICAgZWFzdDogYm91bmRzLmdldEVhc3QoKSxcclxuICAgICAgICBzb3V0aDogYm91bmRzLmdldFNvdXRoKCksXHJcbiAgICAgICAgbm9ydGg6IGJvdW5kcy5nZXROb3J0aCgpXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB2YXIgZnJ1c3R1bURhdGEgPSBpbWFnZUhlbHBlckZ1bmN0aW9ucy5jYWxjdWxhdGVGcnVzdHVtMkRGcm9tQm91bmRzKFxyXG4gICAgICAgIGNhcnRvZ3JhcGhpY0JvdW5kcywgc2NyZWVuU2l6ZSk7XHJcblxyXG4gICAgcmV0dXJuIGZydXN0dW1EYXRhO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRGF0YVB1Ymxpc2hlcjtcclxuXHJcbnZhciBMaW5rZWRMaXN0ID0gcmVxdWlyZSgnbGlua2VkbGlzdC5qcycpO1xyXG52YXIgSGFzaE1hcCA9IHJlcXVpcmUoJ2hhc2htYXAuanMnKTtcclxuXHJcbmZ1bmN0aW9uIERhdGFQdWJsaXNoZXIoaGFzaGVyKSB7XHJcbiAgICB0aGlzLl9zdWJzY3JpYmVyc0J5S2V5ID0gbmV3IEhhc2hNYXAoaGFzaGVyKTtcclxufVxyXG5cclxuRGF0YVB1Ymxpc2hlci5wcm90b3R5cGUucHVibGlzaCA9IGZ1bmN0aW9uIHB1Ymxpc2goa2V5LCBkYXRhLCBmZXRjaEVuZGVkKSB7XHJcbiAgICB2YXIgc3Vic2NyaWJlcnMgPSB0aGlzLl9zdWJzY3JpYmVyc0J5S2V5LmdldEZyb21LZXkoa2V5KTtcclxuICAgIGlmICghc3Vic2NyaWJlcnMpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBpdGVyYXRvciA9IHN1YnNjcmliZXJzLnN1YnNjcmliZXJzTGlzdC5nZXRGaXJzdEl0ZXJhdG9yKCk7XHJcbiAgICB2YXIgbGlzdGVuZXJzID0gW107XHJcbiAgICB3aGlsZSAoaXRlcmF0b3IgIT09IG51bGwpIHtcclxuICAgICAgICB2YXIgc3Vic2NyaWJlciA9IHN1YnNjcmliZXJzLnN1YnNjcmliZXJzTGlzdC5nZXRWYWx1ZShpdGVyYXRvcik7XHJcblx0XHJcblx0XHRpZiAoIXN1YnNjcmliZXIuaXNFbmRlZCkge1xyXG5cdFx0XHRsaXN0ZW5lcnMucHVzaChzdWJzY3JpYmVyLmxpc3RlbmVyKTtcclxuXHRcdFx0aWYgKGZldGNoRW5kZWQpIHtcclxuXHRcdFx0XHQtLXN1YnNjcmliZXJzLnN1YnNjcmliZXJzTm90RW5kZWRDb3VudDtcclxuXHRcdFx0XHRzdWJzY3JpYmVyLmlzRW5kZWQgPSB0cnVlO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaXRlcmF0b3IgPSBzdWJzY3JpYmVycy5zdWJzY3JpYmVyc0xpc3QuZ2V0TmV4dEl0ZXJhdG9yKGl0ZXJhdG9yKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2FsbCBvbmx5IGFmdGVyIGNvbGxlY3RpbmcgYWxsIGxpc3RlbmVycywgc28gdGhlIGxpc3Qgd2lsbCBub3QgYmUgZGVzdHJveWVkIHdoaWxlIGl0ZXJhdGluZ1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICBsaXN0ZW5lcnNbaV0uY2FsbCh0aGlzLCBrZXksIGRhdGEsIGZldGNoRW5kZWQpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuRGF0YVB1Ymxpc2hlci5wcm90b3R5cGUuc3Vic2NyaWJlID0gZnVuY3Rpb24gc3Vic2NyaWJlKGtleSwgc3Vic2NyaWJlcikge1xyXG4gICAgdmFyIHN1YnNjcmliZXJzID0gdGhpcy5fc3Vic2NyaWJlcnNCeUtleS50cnlBZGQoa2V5LCBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBzdWJzY3JpYmVyc0xpc3Q6IG5ldyBMaW5rZWRMaXN0KCksXHJcbiAgICAgICAgICAgIHN1YnNjcmliZXJzTm90RW5kZWRDb3VudDogMFxyXG4gICAgICAgIH07XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgKytzdWJzY3JpYmVycy52YWx1ZS5zdWJzY3JpYmVyc05vdEVuZGVkQ291bnQ7XHJcbiAgICBcclxuICAgIHZhciBsaXN0SXRlcmF0b3IgPSBzdWJzY3JpYmVycy52YWx1ZS5zdWJzY3JpYmVyc0xpc3QuYWRkKHtcclxuICAgICAgICBsaXN0ZW5lcjogc3Vic2NyaWJlcixcclxuICAgICAgICBpc0VuZGVkOiBmYWxzZVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHZhciBoYW5kbGUgPSB7XHJcbiAgICAgICAgX2xpc3RJdGVyYXRvcjogbGlzdEl0ZXJhdG9yLFxyXG4gICAgICAgIF9oYXNoSXRlcmF0b3I6IHN1YnNjcmliZXJzLml0ZXJhdG9yXHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIGhhbmRsZTtcclxufTtcclxuXHJcbkRhdGFQdWJsaXNoZXIucHJvdG90eXBlLnVuc3Vic2NyaWJlID0gZnVuY3Rpb24gdW5zdWJzY3JpYmUoaGFuZGxlKSB7XHJcbiAgICB2YXIgc3Vic2NyaWJlcnMgPSB0aGlzLl9zdWJzY3JpYmVyc0J5S2V5LmdldEZyb21JdGVyYXRvcihoYW5kbGUuX2hhc2hJdGVyYXRvcik7XHJcbiAgICBcclxuICAgIHZhciBzdWJzY3JpYmVyID0gc3Vic2NyaWJlcnMuc3Vic2NyaWJlcnNMaXN0LmdldFZhbHVlKGhhbmRsZS5fbGlzdEl0ZXJhdG9yKTtcclxuICAgIHN1YnNjcmliZXJzLnN1YnNjcmliZXJzTGlzdC5yZW1vdmUoaGFuZGxlLl9saXN0SXRlcmF0b3IpO1xyXG4gICAgaWYgKHN1YnNjcmliZXJzLnN1YnNjcmliZXJzTGlzdC5nZXRDb3VudCgpID09PSAwKSB7XHJcbiAgICAgICAgdGhpcy5fc3Vic2NyaWJlcnNCeUtleS5yZW1vdmUoaGFuZGxlLl9oYXNoSXRlcmF0b3IpO1xyXG4gICAgfSBlbHNlIGlmICghc3Vic2NyaWJlci5pc0VuZGVkKSB7XHJcbiAgICAgICAgLS1zdWJzY3JpYmVycy5zdWJzY3JpYmVyc05vdEVuZGVkQ291bnQ7XHJcbiAgICAgICAgc3Vic2NyaWJlci5pc0VuZGVkID0gdHJ1ZTtcclxuICAgIH1cclxufTtcclxuXHJcbkRhdGFQdWJsaXNoZXIucHJvdG90eXBlLmlzS2V5TmVlZEZldGNoID0gZnVuY3Rpb24gaXNLZXlOZWVkRmV0Y2goa2V5KSB7XHJcbiAgICB2YXIgc3Vic2NyaWJlcnMgPSB0aGlzLl9zdWJzY3JpYmVyc0J5S2V5LmdldEZyb21LZXkoa2V5KTtcclxuICAgIHJldHVybiAoISFzdWJzY3JpYmVycykgJiYgKHN1YnNjcmliZXJzLnN1YnNjcmliZXJzTm90RW5kZWRDb3VudCA+IDApO1xyXG59OyIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2ltcGxlRmV0Y2hlcjtcclxuXHJcbnZhciBTaW1wbGVJbWFnZURhdGFDb250ZXh0ID0gcmVxdWlyZSgnc2ltcGxlaW1hZ2VkYXRhY29udGV4dC5qcycpO1xyXG52YXIgU2ltcGxlTm9uUHJvZ3Jlc3NpdmVGZXRjaEhhbmRsZSA9IHJlcXVpcmUoJ3NpbXBsZW5vbnByb2dyZXNzaXZlZmV0Y2hoYW5kbGUuanMnKTtcclxudmFyIERhdGFQdWJsaXNoZXIgPSByZXF1aXJlKCdkYXRhcHVibGlzaGVyLmpzJyk7XHJcblxyXG4vKiBnbG9iYWwgUHJvbWlzZTogZmFsc2UgKi9cclxuXHJcbmZ1bmN0aW9uIFNpbXBsZUZldGNoZXIoZmV0Y2hlck1ldGhvZHMsIG9wdGlvbnMpIHtcclxuICAgIHRoaXMuX3VybCA9IG51bGw7XHJcbiAgICB0aGlzLl9mZXRjaGVyTWV0aG9kcyA9IGZldGNoZXJNZXRob2RzO1xyXG4gICAgdGhpcy5fb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XHJcbiAgICB0aGlzLl9pc1JlYWR5ID0gdHJ1ZTtcclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLl9mZXRjaGVyTWV0aG9kcy5nZXREYXRhS2V5cykge1xyXG4gICAgICAgIHRocm93ICdTaW1wbGVGZXRjaGVyIGVycm9yOiBnZXREYXRhS2V5cyBpcyBub3QgaW1wbGVtZW50ZWQnO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLl9mZXRjaGVyTWV0aG9kcy5mZXRjaCAmJiAhdGhpcy5fZmV0Y2hlck1ldGhvZHMuZmV0Y2hQcm9ncmVzc2l2ZSkge1xyXG4gICAgICAgIHRocm93ICdTaW1wbGVGZXRjaGVyIGVycm9yOiBOZWl0aGVyIGZldGNoIG5vciBmZXRjaFByb2dyZXNzaXZlIG1ldGhvZHMgYXJlIGltcGxlbWVudGVkJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLl9mZXRjaGVyTWV0aG9kcy5nZXRIYXNoQ29kZSkge1xyXG4gICAgICAgIHRocm93ICdTaW1wbGVGZXRjaGVyIGVycm9yOiBnZXRIYXNoQ29kZSBpcyBub3QgaW1wbGVtZW50ZWQnO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLl9mZXRjaGVyTWV0aG9kcy5pc0VxdWFsKSB7XHJcbiAgICAgICAgdGhyb3cgJ1NpbXBsZUZldGNoZXIgZXJyb3I6IGlzRXF1YWwgaXMgbm90IGltcGxlbWVudGVkJztcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9oYXNoZXIgPSB7XHJcbiAgICAgICAgX2ZldGNoZXJNZXRob2RzOiB0aGlzLl9mZXRjaGVyTWV0aG9kcyxcclxuICAgICAgICBnZXRIYXNoQ29kZTogZnVuY3Rpb24oZGF0YUtleSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZmV0Y2hlck1ldGhvZHMuZ2V0SGFzaENvZGUoZGF0YUtleSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBpc0VxdWFsOiBmdW5jdGlvbihrZXkxLCBrZXkyKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXkxLm1heFF1YWxpdHkgIT09IGtleTIubWF4UXVhbGl0eSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZmV0Y2hlck1ldGhvZHMuaXNFcXVhbChrZXkxLmRhdGFLZXksIGtleTIuZGF0YUtleSk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAodGhpcy5fZmV0Y2hlck1ldGhvZHMuY3JlYXRlRGF0YVB1Ymxpc2hlcikge1xyXG4gICAgICAgIHRoaXMuX2RhdGFQdWJsaXNoZXIgPSB0aGlzLmZldGNoZXJNZXRob2RzLmNyZWF0ZURhdGFQdWJsaXNoZXIodGhpcy5faGFzaGVyKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5fZGF0YVB1Ymxpc2hlciA9IG5ldyBEYXRhUHVibGlzaGVyKHRoaXMuX2hhc2hlcik7XHJcbiAgICB9XHJcbn1cclxuXHJcblNpbXBsZUZldGNoZXIucHJvdG90eXBlLmZldGNoUHJvZ3Jlc3NpdmUgPSBmdW5jdGlvbiBmZXRjaFByb2dyZXNzaXZlKGltYWdlUGFydFBhcmFtcywgZGF0YUtleXMsIGRhdGFDYWxsYmFjaywgcXVlcnlJc0tleU5lZWRGZXRjaCwgbWF4UXVhbGl0eSkge1xyXG4gICAgdGhpcy5fZW5zdXJlUmVhZHkoKTtcclxuICAgIGlmICghdGhpcy5fZmV0Y2hlck1ldGhvZHMuZmV0Y2hQcm9ncmVzc2l2ZSkge1xyXG4gICAgICAgIHZhciBmZXRjaEhhbmRsZSA9IG5ldyBTaW1wbGVOb25Qcm9ncmVzc2l2ZUZldGNoSGFuZGxlKHRoaXMuX2ZldGNoZXJNZXRob2RzLCBkYXRhQ2FsbGJhY2ssIHF1ZXJ5SXNLZXlOZWVkRmV0Y2gsIHRoaXMuX29wdGlvbnMpO1xyXG4gICAgICAgIGZldGNoSGFuZGxlLmZldGNoKGRhdGFLZXlzKTtcclxuICAgICAgICByZXR1cm4gZmV0Y2hIYW5kbGU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzLl9mZXRjaGVyTWV0aG9kcy5mZXRjaFByb2dyZXNzaXZlKGltYWdlUGFydFBhcmFtcywgZGF0YUtleXMsIGRhdGFDYWxsYmFjaywgcXVlcnlJc0tleU5lZWRGZXRjaCwgbWF4UXVhbGl0eSk7XHJcbn07XHJcblxyXG5TaW1wbGVGZXRjaGVyLnByb3RvdHlwZS5yZWNvbm5lY3QgPSBmdW5jdGlvbiByZWNvbm5lY3QoKSB7XHJcbiAgICB0aGlzLl9lbnN1cmVSZWFkeSgpO1xyXG4gICAgaWYgKCF0aGlzLl9mZXRjaGVyTWV0aG9kcy5yZWNvbm5lY3QpIHtcclxuICAgICAgICB0aHJvdyAnU2ltcGxlRmV0Y2hlciBlcnJvcjogcmVjb25uZWN0IGlzIG5vdCBpbXBsZW1lbnRlZCc7XHJcbiAgICB9XHJcbiAgICB0aGlzLl9mZXRjaGVyTWV0aG9kcy5yZWNvbm5lY3QoKTtcclxufTtcclxuXHJcbi8vIEZldGNoZXIgaW1wbGVtZW50YXRpb25cclxuXHJcblNpbXBsZUZldGNoZXIucHJvdG90eXBlLmNyZWF0ZUltYWdlRGF0YUNvbnRleHQgPSBmdW5jdGlvbiBjcmVhdGVJbWFnZURhdGFDb250ZXh0KFxyXG4gICAgaW1hZ2VQYXJ0UGFyYW1zKSB7XHJcbiAgICBcclxuICAgIHRoaXMuX2Vuc3VyZVJlYWR5KCk7XHJcbiAgICB2YXIgZGF0YUtleXMgPSB0aGlzLl9mZXRjaGVyTWV0aG9kcy5nZXREYXRhS2V5cyhpbWFnZVBhcnRQYXJhbXMpO1xyXG4gICAgcmV0dXJuIG5ldyBTaW1wbGVJbWFnZURhdGFDb250ZXh0KGRhdGFLZXlzLCBpbWFnZVBhcnRQYXJhbXMsIHRoaXMuX2RhdGFQdWJsaXNoZXIsIHRoaXMuX2hhc2hlcik7XHJcbn07XHJcblxyXG5TaW1wbGVGZXRjaGVyLnByb3RvdHlwZS5mZXRjaCA9IGZ1bmN0aW9uIGZldGNoKGltYWdlRGF0YUNvbnRleHQpIHtcclxuXHR2YXIgbWF4UXVhbGl0eSA9IGltYWdlRGF0YUNvbnRleHQuZ2V0TWF4UXVhbGl0eSgpO1xyXG5cdHZhciBzZWxmID0gdGhpcztcclxuXHRcclxuXHRmdW5jdGlvbiBkYXRhQ2FsbGJhY2soZGF0YUtleSwgZGF0YSwgaXNGZXRjaEVuZGVkKSB7XHJcblx0XHR2YXIga2V5ID0ge1xyXG5cdFx0XHRkYXRhS2V5OiBkYXRhS2V5LFxyXG5cdFx0XHRtYXhRdWFsaXR5OiBtYXhRdWFsaXR5XHJcblx0XHR9O1xyXG5cdFx0c2VsZi5fZGF0YVB1Ymxpc2hlci5wdWJsaXNoKGtleSwgZGF0YSwgaXNGZXRjaEVuZGVkKTtcclxuXHR9XHJcblx0XHJcblx0ZnVuY3Rpb24gcXVlcnlJc0tleU5lZWRGZXRjaChkYXRhS2V5KSB7XHJcblx0XHR2YXIga2V5ID0ge1xyXG5cdFx0XHRkYXRhS2V5OiBkYXRhS2V5LFxyXG5cdFx0XHRtYXhRdWFsaXR5OiBtYXhRdWFsaXR5XHJcblx0XHR9O1xyXG5cdFx0cmV0dXJuIHNlbGYuX2RhdGFQdWJsaXNoZXIuaXNLZXlOZWVkRmV0Y2goa2V5KTtcclxuXHR9XHJcblx0XHJcblx0cmV0dXJuIHRoaXMuZmV0Y2hQcm9ncmVzc2l2ZShpbWFnZURhdGFDb250ZXh0LmdldEltYWdlUGFydFBhcmFtcygpLCBpbWFnZURhdGFDb250ZXh0LmdldERhdGFLZXlzKCksIGRhdGFDYWxsYmFjaywgcXVlcnlJc0tleU5lZWRGZXRjaCwgbWF4UXVhbGl0eSk7XHJcbn07XHJcblxyXG5TaW1wbGVGZXRjaGVyLnByb3RvdHlwZS5zdGFydE1vdmFibGVGZXRjaCA9IGZ1bmN0aW9uIHN0YXJ0TW92YWJsZUZldGNoKGltYWdlRGF0YUNvbnRleHQsIG1vdmFibGVGZXRjaFN0YXRlKSB7XHJcblx0bW92YWJsZUZldGNoU3RhdGUuZmV0Y2hIYW5kbGUgPSB0aGlzLmZldGNoKGltYWdlRGF0YUNvbnRleHQpO1xyXG59O1xyXG5cclxuU2ltcGxlRmV0Y2hlci5wcm90b3R5cGUubW92ZUZldGNoID0gZnVuY3Rpb24gbW92ZUZldGNoKGltYWdlRGF0YUNvbnRleHQsIG1vdmFibGVGZXRjaFN0YXRlKSB7XHJcblx0bW92YWJsZUZldGNoU3RhdGUuZmV0Y2hIYW5kbGUuYWJvcnRBc3luYygpO1xyXG5cdG1vdmFibGVGZXRjaFN0YXRlLmZldGNoSGFuZGxlID0gdGhpcy5mZXRjaChpbWFnZURhdGFDb250ZXh0KTtcclxufTtcclxuXHJcblNpbXBsZUZldGNoZXIucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gY2xvc2UoY2xvc2VkQ2FsbGJhY2spIHtcclxuICAgIHRoaXMuX2Vuc3VyZVJlYWR5KCk7XHJcbiAgICB0aGlzLl9pc1JlYWR5ID0gZmFsc2U7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgLy8gTk9URTogV2FpdCBmb3IgYWxsIGZldGNoSGFuZGxlcyB0byBmaW5pc2g/XHJcbiAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5TaW1wbGVGZXRjaGVyLnByb3RvdHlwZS5fZW5zdXJlUmVhZHkgPSBmdW5jdGlvbiBlbnN1cmVSZWFkeSgpIHtcclxuICAgIGlmICghdGhpcy5faXNSZWFkeSkge1xyXG4gICAgICAgIHRocm93ICdTaW1wbGVGZXRjaGVyIGVycm9yOiBmZXRjaCBjbGllbnQgaXMgbm90IG9wZW5lZCc7XHJcbiAgICB9XHJcbn07XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2ltcGxlSW1hZ2VEYXRhQ29udGV4dDtcclxuXHJcbnZhciBIYXNoTWFwID0gcmVxdWlyZSgnaGFzaG1hcC5qcycpO1xyXG5cclxuZnVuY3Rpb24gU2ltcGxlSW1hZ2VEYXRhQ29udGV4dChkYXRhS2V5cywgaW1hZ2VQYXJ0UGFyYW1zLCBkYXRhUHVibGlzaGVyLCBoYXNoZXIpIHtcclxuICAgIHRoaXMuX2RhdGFCeUtleSA9IG5ldyBIYXNoTWFwKGhhc2hlcik7XHJcbiAgICB0aGlzLl9kYXRhVG9SZXR1cm4gPSB7XHJcbiAgICAgICAgaW1hZ2VQYXJ0UGFyYW1zOiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGltYWdlUGFydFBhcmFtcykpLFxyXG4gICAgICAgIGZldGNoZWRJdGVtczogW11cclxuICAgIH07XHJcblx0dGhpcy5fbWF4UXVhbGl0eSA9IGltYWdlUGFydFBhcmFtcy5xdWFsaXR5O1xyXG4gICAgdGhpcy5fZmV0Y2hFbmRlZENvdW50ID0gMDtcclxuXHR0aGlzLl9mZXRjaGVkTG93UXVhbGl0eUNvdW50ID0gMDtcclxuICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnMgPSBbXTtcclxuICAgIHRoaXMuX2RhdGFLZXlzID0gZGF0YUtleXM7XHJcbiAgICB0aGlzLl9pbWFnZVBhcnRQYXJhbXMgPSBpbWFnZVBhcnRQYXJhbXM7XHJcbiAgICB0aGlzLl9kYXRhUHVibGlzaGVyID0gZGF0YVB1Ymxpc2hlcjtcclxuXHR0aGlzLl9pc1Byb2dyZXNzaXZlID0gZmFsc2U7XHJcblx0dGhpcy5faXNEaXNwb3NlZCA9IGZhbHNlO1xyXG4gICAgXHJcbiAgICB0aGlzLl9zdWJzY3JpYmVIYW5kbGVzID0gW107XHJcbiAgICBcclxuICAgIHZhciBkYXRhRmV0Y2hlZEJvdW5kID0gdGhpcy5fZGF0YUZldGNoZWQuYmluZCh0aGlzKTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YUtleXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICB2YXIgc3Vic2NyaWJlSGFuZGxlID0gdGhpcy5fZGF0YVB1Ymxpc2hlci5zdWJzY3JpYmUoXHJcblx0XHRcdHsgZGF0YUtleTogZGF0YUtleXNbaV0sIG1heFF1YWxpdHk6IHRoaXMuX21heFF1YWxpdHkgfSxcclxuXHRcdFx0ZGF0YUZldGNoZWRCb3VuZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5fc3Vic2NyaWJlSGFuZGxlcy5wdXNoKHN1YnNjcmliZUhhbmRsZSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIE5vdCBwYXJ0IG9mIEltYWdlRGF0YUNvbnRleHQgaW50ZXJmYWNlLCBvbmx5IHNlcnZpY2UgZm9yIFNpbXBsZUZldGNoZXJcclxuU2ltcGxlSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuZ2V0TWF4UXVhbGl0eSA9IGZ1bmN0aW9uIGdldE1heFF1YWxpdHkoKSB7XHJcblx0cmV0dXJuIHRoaXMuX21heFF1YWxpdHk7XHJcbn07XHJcblxyXG5TaW1wbGVJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5nZXREYXRhS2V5cyA9IGZ1bmN0aW9uIGdldERhdGFLZXlzKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2RhdGFLZXlzO1xyXG59O1xyXG5cclxuU2ltcGxlSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuZ2V0SW1hZ2VQYXJ0UGFyYW1zID0gZnVuY3Rpb24gZ2V0SW1hZ2VQYXJ0UGFyYW1zKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2ltYWdlUGFydFBhcmFtcztcclxufTtcclxuXHJcblNpbXBsZUltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLmhhc0RhdGEgPSBmdW5jdGlvbiBoYXNEYXRhKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2ZldGNoZWRMb3dRdWFsaXR5Q291bnQgPT0gdGhpcy5fZGF0YUtleXMubGVuZ3RoO1xyXG59O1xyXG5cclxuU2ltcGxlSW1hZ2VEYXRhQ29udGV4dC5wcm90b3R5cGUuZ2V0RmV0Y2hlZERhdGEgPSBmdW5jdGlvbiBnZXRGZXRjaGVkRGF0YSgpIHtcclxuICAgIGlmICghdGhpcy5oYXNEYXRhKCkpIHtcclxuICAgICAgICB0aHJvdyAnU2ltcGxlSW1hZ2VEYXRhQ29udGV4dCBlcnJvcjogY2Fubm90IGNhbGwgZ2V0RmV0Y2hlZERhdGEgYmVmb3JlIGhhc0RhdGEgPSB0cnVlJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuX2RhdGFUb1JldHVybjtcclxufTtcclxuXHJcblNpbXBsZUltYWdlRGF0YUNvbnRleHQucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gb24oZXZlbnQsIGxpc3RlbmVyKSB7XHJcblx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcclxuXHRcdHRocm93ICdDYW5ub3QgcmVnaXN0ZXIgdG8gZXZlbnQgb24gZGlzcG9zZWQgSW1hZ2VEYXRhQ29udGV4dCc7XHJcblx0fVxyXG4gICAgaWYgKGV2ZW50ICE9PSAnZGF0YScpIHtcclxuICAgICAgICB0aHJvdyAnU2ltcGxlSW1hZ2VEYXRhQ29udGV4dCBlcnJvcjogVW5leHBlY3RlZCBldmVudCAnICsgZXZlbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX2RhdGFMaXN0ZW5lcnMucHVzaChsaXN0ZW5lcik7XHJcbn07XHJcblxyXG5TaW1wbGVJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5pc0RvbmUgPSBmdW5jdGlvbiBpc0RvbmUoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZmV0Y2hFbmRlZENvdW50ID09PSB0aGlzLl9kYXRhS2V5cy5sZW5ndGg7XHJcbn07XHJcblxyXG5TaW1wbGVJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5kaXNwb3NlID0gZnVuY3Rpb24gZGlzcG9zZSgpIHtcclxuXHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fc3Vic2NyaWJlSGFuZGxlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgIHRoaXMuX2RhdGFQdWJsaXNoZXIudW5zdWJzY3JpYmUodGhpcy5fc3Vic2NyaWJlSGFuZGxlc1tpXSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuX3N1YnNjcmliZUhhbmRsZXMgPSBbXTtcclxuXHR0aGlzLl9kYXRhTGlzdGVuZXJzID0gW107XHJcbn07XHJcblxyXG5TaW1wbGVJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5zZXRJc1Byb2dyZXNzaXZlID0gZnVuY3Rpb24gc2V0SXNQcm9ncmVzc2l2ZShpc1Byb2dyZXNzaXZlKSB7XHJcblx0dmFyIG9sZElzUHJvZ3Jlc3NpdmUgPSB0aGlzLl9pc1Byb2dyZXNzaXZlO1xyXG4gICAgdGhpcy5faXNQcm9ncmVzc2l2ZSA9IGlzUHJvZ3Jlc3NpdmU7XHJcblx0aWYgKCFvbGRJc1Byb2dyZXNzaXZlICYmIGlzUHJvZ3Jlc3NpdmUgJiYgdGhpcy5oYXNEYXRhKCkpIHtcclxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fZGF0YUxpc3RlbmVycy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICB0aGlzLl9kYXRhTGlzdGVuZXJzW2ldKHRoaXMpO1xyXG4gICAgICAgIH1cclxuXHR9XHJcbn07XHJcblxyXG5TaW1wbGVJbWFnZURhdGFDb250ZXh0LnByb3RvdHlwZS5fZGF0YUZldGNoZWQgPSBmdW5jdGlvbiBkYXRhRmV0Y2hlZChrZXksIGRhdGEsIGZldGNoRW5kZWQpIHtcclxuXHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xyXG5cdFx0dGhyb3cgJ1VuZXhwZWN0ZWQgZGF0YUZldGNoZWQgbGlzdGVuZXIgY2FsbCBvbiBkaXNwb3NlZCBJbWFnZURhdGFDb250ZXh0JztcclxuXHR9XHJcblxyXG5cdHZhciBzZWxmID0gdGhpcztcclxuXHR2YXIgYWRkZWQgPSB0aGlzLl9kYXRhQnlLZXkudHJ5QWRkKGtleSwgZnVuY3Rpb24oKSB7XHJcblx0XHQvLyBFeGVjdXRlZCBpZiBuZXcgaXRlbVxyXG4gICAgICAgIHNlbGYuX2RhdGFUb1JldHVybi5mZXRjaGVkSXRlbXMucHVzaCh7XHJcbiAgICAgICAgICAgIGtleToga2V5LmRhdGFLZXksXHJcbiAgICAgICAgICAgIGRhdGE6IGRhdGFcclxuICAgICAgICB9KTtcclxuXHRcdCsrc2VsZi5fZmV0Y2hlZExvd1F1YWxpdHlDb3VudDtcclxuXHRcdHJldHVybiB7XHJcblx0XHRcdGZldGNoRW5kZWQ6IGZhbHNlLFxyXG5cdFx0XHRmZXRjaGVkSXRlbXNPZmZzZXQ6IHNlbGYuX2RhdGFUb1JldHVybi5mZXRjaGVkSXRlbXMubGVuZ3RoIC0gMVxyXG5cdFx0fTtcclxuXHR9KTtcclxuXHRcclxuICAgIGlmIChhZGRlZC52YWx1ZS5mZXRjaEVuZGVkKSB7XHJcblx0XHQvLyBBbHJlYWR5IGZldGNoZWQgZnVsbCBxdWFsaXR5LCBub3RoaW5nIHRvIHJlZnJlc2hcclxuXHRcdHJldHVybjtcclxuXHR9XHJcblx0XHJcblx0dGhpcy5fZGF0YVRvUmV0dXJuLmZldGNoZWRJdGVtc1thZGRlZC52YWx1ZS5mZXRjaGVkSXRlbXNPZmZzZXRdLmRhdGEgPSBkYXRhO1xyXG5cdGlmIChmZXRjaEVuZGVkKVxyXG5cdHtcclxuXHRcdGFkZGVkLnZhbHVlLmZldGNoRW5kZWQgPSB0cnVlO1xyXG4gICAgICAgICsrdGhpcy5fZmV0Y2hFbmRlZENvdW50O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodGhpcy5pc0RvbmUoKSB8fCAodGhpcy5oYXNEYXRhKCkgJiYgdGhpcy5faXNQcm9ncmVzc2l2ZSkpIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX2RhdGFMaXN0ZW5lcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgdGhpcy5fZGF0YUxpc3RlbmVyc1tpXSh0aGlzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTaW1wbGVOb25Qcm9ncmVzc2l2ZUZldGNoSGFuZGxlO1xyXG5cclxuLyogZ2xvYmFsIFByb21pc2U6IGZhbHNlICovXHJcblxyXG5mdW5jdGlvbiBTaW1wbGVOb25Qcm9ncmVzc2l2ZUZldGNoSGFuZGxlKGZldGNoTWV0aG9kcywgZGF0YUNhbGxiYWNrLCBxdWVyeUlzS2V5TmVlZEZldGNoLCBvcHRpb25zKSB7XHJcbiAgICB0aGlzLl9mZXRjaE1ldGhvZHMgPSBmZXRjaE1ldGhvZHM7XHJcblx0dGhpcy5fZGF0YUNhbGxiYWNrID0gZGF0YUNhbGxiYWNrO1xyXG4gICAgdGhpcy5fcXVlcnlJc0tleU5lZWRGZXRjaCA9IHF1ZXJ5SXNLZXlOZWVkRmV0Y2g7XHJcbiAgICB0aGlzLl9mZXRjaExpbWl0ID0gKG9wdGlvbnMgfHwge30pLmZldGNoTGltaXRQZXJGZXRjaGVyIHx8IDI7XHJcbiAgICB0aGlzLl9rZXlzVG9GZXRjaCA9IG51bGw7XHJcbiAgICB0aGlzLl9uZXh0S2V5VG9GZXRjaCA9IDA7XHJcbiAgICB0aGlzLl9hY3RpdmVGZXRjaGVzID0ge307XHJcbiAgICB0aGlzLl9hY3RpdmVGZXRjaGVzQ291bnQgPSAwO1xyXG4gICAgdGhpcy5faXNBYm9ydGVkID0gZmFsc2U7XHJcbiAgICB0aGlzLl9pc1N0b3BwZWRDYWxsZWQgPSBmYWxzZTtcclxuICAgIHRoaXMuX3Jlc29sdmVBYm9ydCA9IG51bGw7XHJcbn1cclxuXHJcblNpbXBsZU5vblByb2dyZXNzaXZlRmV0Y2hIYW5kbGUucHJvdG90eXBlLmZldGNoID0gZnVuY3Rpb24gZmV0Y2goa2V5cykge1xyXG4gICAgaWYgKHRoaXMuX2tleXNUb0ZldGNoICE9PSBudWxsKSB7XHJcbiAgICAgICAgdGhyb3cgJ1NpbXBsZU5vblByb2dyZXNzaXZlRmV0Y2hIYW5kbGUgZXJyb3I6IFJlcXVlc3QgZmV0Y2hlciBjYW4gZmV0Y2ggb25seSBvbmUgcmVnaW9uJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fa2V5c1RvRmV0Y2ggPSBrZXlzO1xyXG4gICAgdGhpcy5fbmV4dEtleVRvRmV0Y2ggPSAwO1xyXG4gICAgd2hpbGUgKHRoaXMuX2FjdGl2ZUZldGNoZXNDb3VudCA8IHRoaXMuX2ZldGNoTGltaXQpIHtcclxuICAgICAgICBpZiAoIXRoaXMuX2ZldGNoU2luZ2xlS2V5KCkpIHtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuU2ltcGxlTm9uUHJvZ3Jlc3NpdmVGZXRjaEhhbmRsZS5wcm90b3R5cGUuYWJvcnRBc3luYyA9IGZ1bmN0aW9uIGFib3J0QXN5bmMoKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgaWYgKHNlbGYuX2FjdGl2ZUZldGNoZXNDb3VudCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5fcmVzb2x2ZUFib3J0ID0gcmVzb2x2ZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxufTtcclxuXHJcblNpbXBsZU5vblByb2dyZXNzaXZlRmV0Y2hIYW5kbGUucHJvdG90eXBlLl9mZXRjaFNpbmdsZUtleSA9IGZ1bmN0aW9uIGZldGNoU2luZ2xlS2V5KCkge1xyXG4gICAgdmFyIGtleTtcclxuICAgIGRvIHtcclxuICAgICAgICBpZiAodGhpcy5fbmV4dEtleVRvRmV0Y2ggPj0gdGhpcy5fa2V5c1RvRmV0Y2gubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAga2V5ID0gdGhpcy5fa2V5c1RvRmV0Y2hbdGhpcy5fbmV4dEtleVRvRmV0Y2grK107XHJcbiAgICB9IHdoaWxlICghdGhpcy5fcXVlcnlJc0tleU5lZWRGZXRjaChrZXkpKTtcclxuICAgIFxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgdGhpcy5fYWN0aXZlRmV0Y2hlc1trZXldID0gdHJ1ZTtcclxuICAgICsrdGhpcy5fYWN0aXZlRmV0Y2hlc0NvdW50O1xyXG4gICAgXHJcbiAgICB0aGlzLl9mZXRjaE1ldGhvZHMuZmV0Y2goa2V5KVxyXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uIHJlc29sdmVkKHJlc3VsdCkge1xyXG4gICAgICAgICAgICBzZWxmLl9kYXRhQ2FsbGJhY2soa2V5LCByZXN1bHQsIC8qZmV0Y2hFbmRlZD0qL3RydWUpO1xyXG4gICAgICAgICAgICBzZWxmLl9mZXRjaEVuZGVkKG51bGwsIGtleSwgcmVzdWx0KTtcclxuICAgICAgICB9KS5jYXRjaChmdW5jdGlvbiBmYWlsZWQocmVhc29uKSB7XHJcbiAgICAgICAgICAgIC8vc2VsZi5fZmV0Y2hDbGllbnQuX29uRXJyb3IocmVhc29uKTtcclxuICAgICAgICAgICAgc2VsZi5fZmV0Y2hFbmRlZChyZWFzb24sIGtleSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICBcclxuICAgIHJldHVybiB0cnVlO1xyXG59O1xyXG5cclxuU2ltcGxlTm9uUHJvZ3Jlc3NpdmVGZXRjaEhhbmRsZS5wcm90b3R5cGUuX2ZldGNoRW5kZWQgPSBmdW5jdGlvbiBmZXRjaEVuZGVkKGVycm9yLCBrZXksIHJlc3VsdCkge1xyXG4gICAgZGVsZXRlIHRoaXMuX2FjdGl2ZUZldGNoZXNba2V5XTtcclxuICAgIC0tdGhpcy5fYWN0aXZlRmV0Y2hlc0NvdW50O1xyXG4gICAgXHJcbiAgICBpZiAoIXRoaXMuX3Jlc29sdmVBYm9ydCkge1xyXG4gICAgICAgIHRoaXMuX2ZldGNoU2luZ2xlS2V5KCk7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMuX2FjdGl2ZUZldGNoZXNDb3VudCA9PT0gMCkge1xyXG4gICAgICAgIHRoaXMuX3Jlc29sdmVBYm9ydCgpO1xyXG4gICAgICAgIHRoaXMuX3Jlc29sdmVBYm9ydCA9IG51bGw7XHJcbiAgICB9XHJcbn07IiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTaW1wbGVQaXhlbHNEZWNvZGVyQmFzZTtcclxuXHJcbi8qIGdsb2JhbCBQcm9taXNlIDogZmFsc2UgKi9cclxuLyogZ2xvYmFsIEltYWdlRGF0YSA6IGZhbHNlICovXHJcblxyXG5mdW5jdGlvbiBTaW1wbGVQaXhlbHNEZWNvZGVyQmFzZSgpIHtcclxuICAgIFNpbXBsZVBpeGVsc0RlY29kZXJCYXNlLnByb3RvdHlwZS5kZWNvZGUgPSBmdW5jdGlvbiBkZWNvZGUoZmV0Y2hlZERhdGEpIHtcclxuICAgICAgICB2YXIgaW1hZ2VQYXJ0UGFyYW1zID0gZmV0Y2hlZERhdGEuaW1hZ2VQYXJ0UGFyYW1zO1xyXG4gICAgICAgIHZhciB3aWR0aCAgPSBpbWFnZVBhcnRQYXJhbXMubWF4WEV4Y2x1c2l2ZSAtIGltYWdlUGFydFBhcmFtcy5taW5YO1xyXG4gICAgICAgIHZhciBoZWlnaHQgPSBpbWFnZVBhcnRQYXJhbXMubWF4WUV4Y2x1c2l2ZSAtIGltYWdlUGFydFBhcmFtcy5taW5ZO1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgSW1hZ2VEYXRhKHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICAgIHZhciBwcm9taXNlcyA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZmV0Y2hlZERhdGEuZmV0Y2hlZEl0ZW1zLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5kZWNvZGVSZWdpb24ocmVzdWx0LCBpbWFnZVBhcnRQYXJhbXMubWluWCwgaW1hZ2VQYXJ0UGFyYW1zLm1pblksIGZldGNoZWREYXRhLmZldGNoZWRJdGVtc1tpXS5rZXksIGZldGNoZWREYXRhLmZldGNoZWRJdGVtc1tpXS5kYXRhKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIFNpbXBsZVBpeGVsc0RlY29kZXJCYXNlLnByb3RvdHlwZS5kZWNvZGVSZWdpb24gPSBmdW5jdGlvbiBkZWNvZGVSZWdpb24odGFyZ2V0SW1hZ2VEYXRhLCBpbWFnZVBhcnRQYXJhbXMsIGtleSwgZmV0Y2hlZERhdGEpIHtcclxuICAgICAgICB0aHJvdyAnU2ltcGxlUGl4ZWxzRGVjb2RlckJhc2UgZXJyb3I6IGRlY29kZVJlZ2lvbiBpcyBub3QgaW1wbGVtZW50ZWQnO1xyXG4gICAgfTtcclxufSJdfQ==
