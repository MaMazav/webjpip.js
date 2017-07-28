'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = {
    createTransaction: function createTransaction() {
        // This code is executed a LOT. For optimization, state is represented
        // directly as numbers (I couldn't think about more readable way which
        // is performance-equivalent).
        
        // state = 1 ==> Transaction is active
        // state = 2 ==> Transaction has committed successfully
        // state = 3 ==> Transaction has been aborted
        
        var state = 1;
        
        var transaction = {
            get isAborted() {
                return state === 3;
            },
            
            get isActive() {
                return state === 1;
            },
            
            commit: function commit() {
                terminate(true);
            },
        
            abort: function abort() {
                terminate(false);
            }
        };
        
        function terminate(isSuccessful_) {
            if (!transaction.isActive) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot terminate an already terminated transaction');
            }
            state = isSuccessful_ ? 2 : 3;
        }
            
        return transaction;
    },
    
    createTransactionalObject: function commitTransaction(
        initialValue, isValueType) {
        
        var value = null;
        var prevValue = initialValue;
        var lastAccessedTransaction = {
            isActive: false,
            isAborted: true
            };
        var clone = isValueType ? cloneValueType : cloneByJSON;
        
        var transactionalObject = {
            getValue: function getValue(activeTransaction) {
                ensureAllowedAccess(activeTransaction);

                if (lastAccessedTransaction === activeTransaction) {
                    return value;
                }
                
                if (lastAccessedTransaction.isAborted) {
                    value = clone(prevValue);
                } else {
                    prevValue = clone(value);
                }

                lastAccessedTransaction = activeTransaction;
                return value;
            },
            
            setValue: function setValue(activeTransaction, newValue) {
                ensureAllowedAccess(activeTransaction);

                if (lastAccessedTransaction === activeTransaction) {
                    value = newValue;
                    return;
                }
                
                if (!lastAccessedTransaction.isAborted) {
                    prevValue = clone(value);
                }
                
                lastAccessedTransaction = activeTransaction;
                value = newValue;
            }
        };
        
        function ensureAllowedAccess(activeTransaction) {
            if (!activeTransaction.isActive) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot use terminated transaction to access objects');
            }
            
            if (activeTransaction !== lastAccessedTransaction &&
                lastAccessedTransaction.isActive) {
                
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Cannot simultanously access transactional object ' +
                    'from two active transactions');
            }
        }
        
        function cloneValueType(value) {
            return value;
        }
        
        function cloneByJSON(value) {
            var newValue = JSON.parse(JSON.stringify(value));
            return newValue;
        }
        
        return transactionalObject;
    }
};