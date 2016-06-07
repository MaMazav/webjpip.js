'use strict';

importScripts('../../../webjpip.js/misc/j2kjpipglobals.js');
importScripts('../../../webjpip.js/misc/jpipruntimefactory.js');
importScripts('../../../webjpip.js/misc/simpleajaxhelper.js');

importScripts('../../../webjpip.js/jpipcore/databins/compositearray.js');
importScripts('../../../webjpip.js/jpipcore/databins/jpipdatabinparts.js');
importScripts('../../../webjpip.js/jpipcore/databins/jpipdatabinssaver.js');
importScripts('../../../webjpip.js/jpipcore/databins/jpipobjectpoolbydatabin.js');
importScripts('../../../webjpip.js/jpipcore/databins/jpiprequestdatabinslistener.js');
importScripts('../../../webjpip.js/jpipcore/parsers/jpipmarkersparser.js');
importScripts('../../../webjpip.js/jpipcore/parsers/jpipoffsetscalculator.js');
importScripts('../../../webjpip.js/jpipcore/parsers/jpipstructureparser.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/mutualexclusivetransactionhelper.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/jpipbitstreamreader.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/jpipcodingpassesnumberparser.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/jpipcodeblocklengthparser.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/jpippacketlengthcalculator.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/jpipqualitylayerscache.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/jpipsubbandlengthinpacketheadercalculator.js');
importScripts('../../../webjpip.js/jpipcore/qualitylayers/jpiptagtree.js');
importScripts('../../../webjpip.js/jpipcore/imagestructures/jpiptilestructure.js');
importScripts('../../../webjpip.js/jpipcore/imagestructures/jpipcomponentstructure.js');
importScripts('../../../webjpip.js/jpipcore/imagestructures/jpipcodestreamstructure.js');
importScripts('../../../webjpip.js/jpipcore/writers/jpipheadermodifier.js');
importScripts('../../../webjpip.js/jpipcore/writers/jpipcodestreamreconstructor.js');
importScripts('../../../webjpip.js/jpipcore/writers/jpippacketsdatacollector.js');
importScripts('../../../webjpip.js/jpipcore/protocol/jpipchannel.js');
importScripts('../../../webjpip.js/jpipcore/protocol/jpipmessageheaderparser.js');
importScripts('../../../webjpip.js/jpipcore/protocol/jpipreconnectablerequester.js');
importScripts('../../../webjpip.js/jpipcore/protocol/jpiprequest.js');
importScripts('../../../webjpip.js/jpipcore/protocol/jpipsessionhelper.js');
importScripts('../../../webjpip.js/jpipcore/protocol/jpipsession.js');
importScripts('../../../webjpip.js/jpipcore/api/jpipcodestreamclient.js');
importScripts('../../../webjpip.js/jpipcore/api/jpipcodestreamsizescalculator.js');
importScripts('../../../webjpip.js/jpipcore/api/jpiprequestcontext.js');

importScripts('../jpxjpipimagehelpers/codestreamclientmanager.js');
importScripts('../jpxjpipimagehelpers/copyTilesPixelsToOnePixelsArray.js');
importScripts('../jpxjpipimagehelpers/decodejobspool.js');
importScripts('../jpxjpipimagehelpers/frustumrequestsprioritizer.js');
importScripts('../jpxjpipimagehelpers/jpipimagehelperfunctions.js');
importScripts('../jpxjpipimagehelpers/jpxdecodejob.js');
importScripts('../jpxjpipimagehelpers/lifoscheduler.js');
importScripts('../jpxjpipimagehelpers/linkedlist.js');
importScripts('../jpxjpipimagehelpers/priorityscheduler.js');
importScripts('../jpxjpipimagehelpers/singleregionprioritizer.js');
importScripts('../jpxjpipimagehelpers/scheduledrequestmanager.js');
importScripts('workerproxyasyncjpximage.js');
importScripts('workerproxycodestreamclientmanager.js');
importScripts('../jpxjpipimage.js');
importScripts('../../workerhelper/mastersideworkerhelper.js');
importScripts('../../workerhelper/slavesideworkerhelper.js');

var manager;
var isReady;

SlaveSideWorkerHelper.setBeforeOperationListener(beforeOperationListener);
SlaveSideWorkerHelper.setSlaveSideCtor(createManager);
self.onmessage = SlaveSideWorkerHelper.onMessage;

function createManager(args) {
    isReady = false;
    manager = new CodestreamClientManager(args[0], args[1]);
    
    return manager;
}

function beforeOperationListener(operationType, operationName, args) {
    if (operationType !== 'callback' || operationName !== 'statusCallback') {
        return;
    }
    
    if (isReady || !args[0].isReady) {
        return null;
    }
    
    var sizes = manager.getSizesParams();
    isReady = true;
    
    SlaveSideWorkerHelper.sendUserDataToMaster(sizes);
}