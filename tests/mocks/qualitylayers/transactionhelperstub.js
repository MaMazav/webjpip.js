'use strict';

var transactionHelperStub = {
    lastTransaction: null,
    
    transactionToCreateMember: null,
    
    get transactionToCreate() {
        return transactionHelperStub.transactionToCreateMember;
    },
    
    set transactionToCreate(transaction) {
        if (transaction !== null && transaction.isActive === undefined) {
            transaction.isActive = true;
        }
        
        transactionHelperStub.transactionToCreateMember = transaction;
    },
    
    timesResetted: 0,
    
    clearForTest: function clearForTest() {
        transactionHelperStub.lastTransaction = null;
        transactionHelperStub.timesResetted = 0;
        transactionHelperStub.transactionToCreate = null;
    },
    
    resetAllObjectsToInitialValuesForTest :
        function resetAllObjectsToInitialValuesForTest() {
            ++transactionHelperStub.timesResetted;
        },
    
    createTransaction: function createTransaction() {
        if (transactionHelperStub.transactionToCreate === null) {
            throw 'Unexpected call to createTransaction. Fix test';
        }
        
        var result = transactionHelperStub.transactionToCreate;
        transactionHelperStub.transactionToCreate = null;
        return result;
    },
    
    createTransactionalObject: function createTransactionalObject(initialValue, clone) {
        var currentValue = null;
        var timesResetted = -1;
        
        return {
            setValue: function setValue(transaction, value) {
                if (transactionHelperStub.lastTransaction !== null &&
                    transactionHelperStub.lastTransaction !== transaction) {
                    
                    throw 'Mix of transaction. Fix test or implementation';
                }

                transactionHelperStub.lastTransaction = transaction;
                currentValue = value;
            },
            
            getValue: function getValue(transaction) {
                if (transactionHelperStub.lastTransaction !== null &&
                    transactionHelperStub.lastTransaction !== transaction) {
                    
                    throw 'Mix of transaction. Fix test or implementation';
                }

                transactionHelperStub.lastTransaction = transaction;
                
                if (timesResetted < transactionHelperStub.timesResetted) {
                    currentValue = clone(initialValue);
                    timesResetted = transactionHelperStub.timesResetted;
                }
                
                return currentValue;
            }
        };
    }
};