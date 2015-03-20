'use strict';

function testBitstreamParsingOperationSequence(
    testName,
    bitstreamContent,
    operations,
    doOperation,
    contextInitializer,
    createNewTransaction,
    disableAbortedTransactionTest,
    disableTransactionArgumentCorrectnessTest) {
    
    performTest('', false);
    
    if (!disableAbortedTransactionTest) {
        performTest(' (check no dirty value of aborted transactions)', true);
    }
    
    function performTest(suffixTestName, checkNoDirtyValueOfAbortedTransactions) {
        var finalTestName = testName + suffixTestName;
        
        QUnit.test(finalTestName, function(assert) {
            transactionHelperStub.clearForTest();
            var bitstreamReaderStub = new JpipBitstreamReaderStub(bitstreamContent);
            var testContext = contextInitializer(bitstreamReaderStub);
            
            if (checkNoDirtyValueOfAbortedTransactions) {
                for (var i = 0; i < operations.length; ++i) {
                    doOperation(testContext, operations[i], /*assert=*/null, i);
                }
                
                // Simulate abort
                bitstreamReaderStub.setOffsetForTest(0);
                transactionHelperStub.resetAllObjectsToInitialValuesForTest();
            }
            
            var transactionObjectValueToTest = null;

            for (var i = 0; i < operations.length; ++i) {
                transactionHelperStub.lastTransaction = null;
                
                if (transactionObjectValueToTest !== null) {
                    transactionObjectValueToTest.isActive = false;
                }
                
                if (createNewTransaction === undefined) {
                    transactionObjectValueToTest = {
                        name: 'dummy transaction ' + i
                        };
                    bitstreamReaderStub.activeTransaction =
                        transactionObjectValueToTest;
                } else {
                    transactionObjectValueToTest = createNewTransaction(
                        testContext);
                }
                
                doOperation(testContext, operations[i], assert, i);
                
                if (disableTransactionArgumentCorrectnessTest ||
                    operations[i].disableTransactionArgumentCorrectnessTest) {
                    
                    continue;
                }
                
                var transactionActual = transactionHelperStub.lastTransaction;
                var transactionExpected = transactionObjectValueToTest;
                assert.deepEqual(
                    transactionActual,
                    transactionExpected,
                    'Correctness of transaction argument passed to ' +
                        'transactionalObject.getValue() of calculation #' + i);
            }
            transactionHelperStub.clearForTest();
        });
    }
}

function stubParseFromBitstream(bitstreamReaderStub, propertyNameInStubArray) {
    var internalArray = bitstreamReaderStub.internalBufferForTest;
    var currentOffset = bitstreamReaderStub.bitsCounter;
    
    var offsetToParseResultMap = internalArray[propertyNameInStubArray];
    if (offsetToParseResultMap === undefined) {
        throw 'No ' + propertyNameInStubArray + ' information in ' +
            'bufferReader stub. Fix test';
    }
    
    var resultAndBitsToShift = offsetToParseResultMap[currentOffset];
    if (resultAndBitsToShift === undefined) {
        throw 'No ' + propertyNameInStubArray + ' information in offset ' +
            currentOffset + '. Fix test or implementation';
    }
    
    var result = resultAndBitsToShift.result;
    var bitsToShift = resultAndBitsToShift.bitsToShift;
    bitstreamReaderStub.shiftBits(bitsToShift);
    
    return result;
}

var qualityLayersCallsLog = {
    callsLog: [],
    
    clearForTest: function clearForTest() {
        qualityLayersCallsLog.callsLog = [];
    },
    
    log: function log(objectType, instanceId, details) {
        var instanceIdAsString = null;
        if (instanceId !== null) {
            instanceIdAsString = instanceId.toString();
        }
        
        qualityLayersCallsLog.callsLog.push({
            objectType: objectType,
            instanceId: instanceIdAsString,
            details: details
            });
    },
    
    replaceNamedInstanceIdsWithNumericIdsInCallsLog :
        function replaceNamedInstanceIdsWithNumericIdsInCallsLog(
            assert, namedIdsCalls) {
        
        /*
            This function should handle with the situation that
            the instance IDs of the expected function calls does
            not appropriate with the actual one.
            
            For example, if the expected list of calls is:
            [    { objectType: 'tagTree', instanceId: 'inclusion tree' },
                { objectType: 'tagTree', instanceId: 'zero bit planes tree' },
                { objectType: 'bitstreamReader', instanceId: '1st bitstreamReader' },
                { objectType: 'tagTree', instanceId: 'inclusion tree' }
            ]
            
            and the actual list is:
            [    { objectType: 'tagTree', instanceId: '501' },
                { objectType: 'tagTree', instanceId: '1342' },
                { objectType: 'bitstreamReader', instanceId: '19' },
                { objectType: 'tagTree', instanceId: '501' }
            ]
            
            The first list (the 'expected' one) will be fixed to fit
            the second list (the 'actual' one).
            We cannot just take the actual one because we would like to
            find inconsistencies of instances.

            For example, if the actual list in the above example would be:
            [    { objectType: 'tagTree', instanceId: '501' },
                { objectType: 'tagTree', instanceId: '1342' },
                { objectType: 'bitstreamReader', instanceId: '19' },
                { objectType: 'tagTree', instanceId: '1342' } // <---- here is wrong ID
            ]
            
            Then the expected list will still be fixed into:
            [    { objectType: 'tagTree', instanceId: '501' },
                { objectType: 'tagTree', instanceId: '1342' },
                { objectType: 'bitstreamReader', instanceId: '19' },
                { objectType: 'tagTree', instanceId: '501' }
            ]
            
            And then it is easy to see that the 4th instance is not
            the right one instance.
            This function will fix the expected list to be as above,
            and later the client function (which is actually
            assertCallsLogEqual appears below) can assert each object.
            
            -------------------------------------------------------
            
            The function should also ensure (by assertions) that each
            instance in the expected calls list has no more than single
            instance in the actual calls list. For example, if the
            expected calls list is:
            [    { objectType: 'tagTree', instanceId: 'inclusion tree' },
                { objectType: 'tagTree', instanceId: 'zero bit planes tree' },
                { objectType: 'bitstreamReader', instanceId: '1st bitstreamReader' },
                { objectType: 'tagTree', instanceId: 'inclusion tree' }
            ]
            
            and the actuall calls list is:
            [    { objectType: 'tagTree', instanceId: '501' },
                { objectType: 'tagTree', instanceId: '1342' },
                { objectType: 'bitstreamReader', instanceId: '19' },
                { objectType: 'tagTree', instanceId: '472' } <--- Wrong one!
            ]
            
            Then an assertion will be raised for the fourth instance.
            This assertion can be discovered only before the fix, thus
            it is done within this function.
         */
        
        var numericIdsCalls = qualityLayersCallsLog.callsLog;
        
        var callsNum = Math.min(namedIdsCalls.length, numericIdsCalls.length);
        
        var numericIdsPerNamedIdPerObjectType = {};
        var namedIdsPerNumericIdPerObjectType = {};
        
        for (var i = 0; i < callsNum; ++i) {
            if (namedIdsCalls[i].objectType !== numericIdsCalls[i].objectType) {
                // Wrong calls log, assertion will fail anyway
                continue;
            }
            
            if (numericIdsCalls[i].instanceId === null ||
                namedIdsCalls[i].instanceId === null) {
                
                // null indicates we don't care about instanceId.
                // Just fix to fit the reference list and continue
                
                namedIdsCalls[i].instanceId = numericIdsCalls[i].instanceId;
                continue;
            }
            
            var objectType = namedIdsCalls[i].objectType;
            var numericIdsPerNamedIds =
                numericIdsPerNamedIdPerObjectType[objectType];
            var namedIdsPerNumericId =
                namedIdsPerNumericIdPerObjectType[objectType];

            if (numericIdsPerNamedIds === undefined) {
                numericIdsPerNamedIds = {};
                namedIdsPerNumericId = {};
                
                numericIdsPerNamedIdPerObjectType[objectType] =
                    numericIdsPerNamedIds;
                namedIdsPerNumericIdPerObjectType[objectType] =
                    namedIdsPerNumericId;
            }
            
            var namedId = namedIdsCalls[i].instanceId;
            var numericId = numericIdsPerNamedIds[namedId];

            var namedIds = namedIdsPerNumericId[numericId];
            if (namedIds === undefined) {
                namedIds = [];
                namedIds.count = 0;
                namedIdsPerNumericId[numericId] = namedIds;
            }
            
            if (namedIds[namedId] === undefined) {
                namedIds[namedId] = true;
                ++namedIds.count;
            }

            if (numericId !== undefined) {
                namedIdsCalls[i].instanceId = numericId;
                continue;
            }
            
            numericId = numericIdsCalls[i].instanceId;
            numericIdsPerNamedIds[namedId] = numericId;
            namedIdsCalls[i].instanceId = numericId;
        }
        
        for (var objectType in namedIdsPerNumericIdPerObjectType) {
            var namedIdsPerNumericId =
                namedIdsPerNumericIdPerObjectType[objectType];
                
            for (var i = 0; i < namedIdsPerNumericId.length; ++i) {
                var namedIds = namedIdsPerNumericId[i];
                
                var instancesList = '';
                var first = true;
                
                for (var name in namedIds) {
                    if (name === 'count') {
                        continue;
                    }
                    
                    if (!first) {
                        instancesList += ', ';
                    }
                    first = false;
                    
                    instancesList += name;
                }
                
                assert.deepEqual(
                    namedIds.count,
                    1,
                    'Object of type ' + objectType + ' should match single' +
                        ' instance in calls log (instance(s) name: ' +
                        instancesList + ')');
            }
        }
    },
    
    assertCallsLogEqual: function assertCallsLogEqual(assert, expectedCallsLogWithNamedIds) {
        var callsActual = qualityLayersCallsLog.callsLog;
        
        var callsLogJSON = JSON.stringify(expectedCallsLogWithNamedIds);
        var expectedCallsLogWithNumericIds = JSON.parse(callsLogJSON);
        qualityLayersCallsLog.replaceNamedInstanceIdsWithNumericIdsInCallsLog(
            assert, expectedCallsLogWithNumericIds);
        
        assert.deepEqual(
            callsActual.length,
            expectedCallsLogWithNumericIds.length,
            'Correctness of number of functions called');
        
        var numCalls = Math.min(
            expectedCallsLogWithNumericIds.length, callsActual.length);
        
        for (var i = 0; i < numCalls; ++i) {
            var callActual = callsActual[i];
            var callExpected = expectedCallsLogWithNumericIds[i];
            assert.deepEqual(
                callActual,
                callExpected,
                'Correctness of parameters passed to function call ' +
                    callExpected.objectType + '.' +
                    callExpected.details.functionName + ' (instance name: ' +
                    expectedCallsLogWithNamedIds[i].instanceId + ')');
        }
    }
};