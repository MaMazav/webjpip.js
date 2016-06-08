'use strict';

QUnit.module('jpipExports.mutualExclusiveTransactionHelper');

QUnit.test('Correctness of initial value', function(assert) {
    var initialValue = { prop1: 'value1', prop2: 2 };
    
    var transactionalObject = jpipExports.mutualExclusiveTransactionHelper
        .createTransactionalObject(JSON.parse(JSON.stringify(initialValue)));
    
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    
    var valueActual = transactionalObject.getValue(transaction);
    var valueExpected = initialValue;
    assert.deepEqual(
        valueActual,
        valueExpected,
        'getValue() returns the initial value');
    });

QUnit.test(
    'Correctness of changed value of committed transaction',
    function(assert) {
        var initialValue = { prop1: 'value1', prop2: 2 };
        
        var transactionalObject = jpipExports.mutualExclusiveTransactionHelper
            .createTransactionalObject(JSON.parse(JSON.stringify(initialValue)));
        
        var writerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var changedValue = transactionalObject.getValue(writerTx);
        changedValue.prop1 = 'value3';
        writerTx.commit();
        
        var readerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var valueActual = transactionalObject.getValue(readerTx);
        
        var valueExpected = Object.create(initialValue);
        valueExpected.prop1 = 'value3';
        
        assert.deepEqual(
            valueActual,
            valueExpected,
            'getValue() of a reader transaction returns the new value ' +
            'written by previous one');
    });

QUnit.test(
    'Correctness of changed value of aborted transaction',
    function(assert) {
        var initialValue = { prop1: 'value1', prop2: 2 };
        
        var transactionalObject = jpipExports.mutualExclusiveTransactionHelper
            .createTransactionalObject(JSON.parse(JSON.stringify(initialValue)));
        
        var writerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var changedValue = transactionalObject.getValue(writerTx);
        changedValue.prop1 = 'value3';
        writerTx.abort();
        
        var readerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var valueActual = transactionalObject.getValue(readerTx);
        
        var valueExpected = Object.create(initialValue);
        
        assert.deepEqual(
            valueActual,
            valueExpected,
            'getValue() of a reader transaction returns the initial value');
    });

QUnit.test(
    'Correctness of changed value of two aborted transaction',
    function(assert) {
        var initialValue = { prop1: 'value1', prop2: 2 };
        
        var transactionalObject = jpipExports.mutualExclusiveTransactionHelper
            .createTransactionalObject(JSON.parse(JSON.stringify(initialValue)));
        
        var writerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var changedValue = transactionalObject.getValue(writerTx);
        changedValue.prop1 = 'value3';
        writerTx.abort();
        
        var writer2Tx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var changedValue2 = transactionalObject.getValue(writer2Tx);
        changedValue2.prop1 = 'value4';
        writer2Tx.abort();
        
        var readerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var valueActual = transactionalObject.getValue(readerTx);
        
        var valueExpected = Object.create(initialValue);
        
        assert.deepEqual(
            valueActual,
            valueExpected,
            'getValue() of a reader transaction returns the initial value');
    });

QUnit.test(
    'Correctness of changed value of aborted after committed transactions',
    function(assert) {
        var initialValue = { prop1: 'value1', prop2: 2 };
        
        var transactionalObject = jpipExports.mutualExclusiveTransactionHelper
            .createTransactionalObject(JSON.parse(JSON.stringify(initialValue)));
        
        var writerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var changedValue = transactionalObject.getValue(writerTx);
        changedValue.prop1 = 'value3';
        writerTx.commit();
        
        var writer2Tx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var changedValue2 = transactionalObject.getValue(writer2Tx);
        changedValue2.prop1 = 'value4';
        writer2Tx.abort();
        
        var readerTx = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var valueActual = transactionalObject.getValue(readerTx);
        
        var valueExpected = Object.create(initialValue);
        valueExpected.prop1 = 'value3';
        
        assert.deepEqual(
            valueActual,
            valueExpected,
            'getValue() of a reader transaction returns the initial value');
    });

QUnit.test('Transaction should see all local changes', function(assert) {
    var initialValue = { prop1: 'value1', prop2: 2 };
    
    var transactionalObject = jpipExports.mutualExclusiveTransactionHelper
        .createTransactionalObject(JSON.parse(JSON.stringify(initialValue)));
    
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();

    var object1 = transactionalObject.getValue(transaction);
    object1.prop1 = 'value3';
    
    var object2 = transactionalObject.getValue(transaction);
    object2.prop2 = 4;
    
    var valueActual = transactionalObject.getValue(transaction);
    var valueExpected = Object.create(initialValue);
    valueExpected.prop1 = 'value3';
    valueExpected.prop2 = 4;
    
    assert.deepEqual(
        valueActual,
        valueExpected,
        'getValue() should return an object with all local changes');
    });

QUnit.test('isAborted of active transaction', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    
    var isAbortedActual = transaction.isAborted;
    var isAbortedExpected = false;
    assert.deepEqual(isAbortedActual, isAbortedExpected, 'isAborted should be false');
    });

QUnit.test('isAborted of aborted transaction', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.abort();
    
    var isAbortedActual = transaction.isAborted;
    var isAbortedExpected = true;
    assert.deepEqual(isAbortedActual, isAbortedExpected, 'isAborted should be true');
    });

QUnit.test('isAborted of committed transaction', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.commit();
    
    var isAbortedActual = transaction.isAborted;
    var isAbortedExpected = false;
    assert.deepEqual(isAbortedActual, isAbortedExpected, 'isAborted should be false');
    });

QUnit.test('isActive of active transaction', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    
    var isActiveActual = transaction.isActive;
    var isActiveExpected = true;
    assert.deepEqual(isActiveActual, isActiveExpected, 'isActive should be true');
    });

QUnit.test('isActive of aborted transaction', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.abort();
    
    var isActiveActual = transaction.isActive;
    var isActiveExpected = false;
    assert.deepEqual(isActiveActual, isActiveExpected, 'isActive should be false');
    });

QUnit.test('isActive of committed transaction', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.commit();
    
    var isActiveActual = transaction.isActive;
    var isActiveExpected = false;
    assert.deepEqual(isActiveActual, isActiveExpected, 'isActive should be false');
    });

QUnit.test('commit after commit exception', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.commit();
    
    assert.throws(
        function() {
            transaction.commit();
        },
        _jGlobals.jpipExceptions.InternalErrorException,
        'Commit after commit should throw exception');
    });

QUnit.test('commit after abort exception', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.abort();
    
    assert.throws(
        function() {
            transaction.commit();
        },
        _jGlobals.jpipExceptions.InternalErrorException,
        'Commit after abort should throw exception');
    });

QUnit.test('abort after commit exception', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.commit();
    
    assert.throws(
        function() {
            transaction.abort();
        },
        _jGlobals.jpipExceptions.InternalErrorException,
        'Abort after commit should throw exception');
    });

QUnit.test('abort after abort exception', function(assert) {
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.abort();
    
    assert.throws(
        function() {
            transaction.abort();
        },
        _jGlobals.jpipExceptions.InternalErrorException,
        'Abort after abort should throw exception');
    });

QUnit.test('Committed transaction exception when accessing object', function(assert) {
    var object = jpipExports.mutualExclusiveTransactionHelper.createTransactionalObject();
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.commit();
    
    assert.throws(
        function() {
            object.getValue(transaction);
        },
        _jGlobals.jpipExceptions.InternalErrorException,
        'Access to object from committed transaction should throw exception');
    });

QUnit.test('Aborted transaction exception when accessing object', function(assert) {
    var object = jpipExports.mutualExclusiveTransactionHelper.createTransactionalObject();
    var transaction = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
    transaction.abort();
    
    assert.throws(
        function() {
            object.getValue(transaction);
        },
        _jGlobals.jpipExceptions.InternalErrorException,
        'Access to object from abort transaction should throw exception');
    });

QUnit.test(
    'Mutual exclusiveness: exception when accessing simultanuously from two ' +
        'active transactions',
    function(assert) {
        var object = jpipExports.mutualExclusiveTransactionHelper.createTransactionalObject(
            { initialValue: 'dummyValue' } );
        var transaction1 = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        var transaction2 = jpipExports.mutualExclusiveTransactionHelper.createTransaction();
        
        object.getValue(transaction1);
        
        assert.throws(
            function() {
                object.getValue(transaction2);
            },
            _jGlobals.jpipExceptions.InternalErrorException,
            'Simultanuous access should throw exception');
    });