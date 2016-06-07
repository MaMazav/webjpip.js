'use strict';

function createDatabinStub(classId, inClassId) {
    return {
        getClassId: function getClassId() { return classId; },
        getInClassId: function getInClassId() { return inClassId; }
        };
}

function checkDifferentDatabins(assert, databinA, databinB) {
    var pool = new JpipObjectPoolByDatabin();

    var someValueInDatabinA = 'Some dummy value 142';
    var someValueInDatabinB = 'Some dummy value 932';
    
    // Act
    
    var objectReturnedFirstTimeOnDatabinA = pool.getObject(databinA);
    objectReturnedFirstTimeOnDatabinA.someProperty = someValueInDatabinA;
    
    var objectReturnedFirstTimeOnDatabinB = pool.getObject(databinB);
    objectReturnedFirstTimeOnDatabinB.someProperty = someValueInDatabinB;

    var objectReturnedSecondTimeOnDatabinA = pool.getObject(databinA);
    
    var objectReturnedSecondTimeOnDatabinB = pool.getObject(databinB);
    
    // Assert
    
    var databinAValueExpected = someValueInDatabinA;
    var databinAValueActual = objectReturnedFirstTimeOnDatabinA.someProperty;
    assert.deepEqual(
        databinAValueActual,
        databinAValueExpected,
        'Value stored on first time is accessible on second time on databin A');

    var databinBValueExpected = someValueInDatabinB;
    var databinBValueActual = objectReturnedFirstTimeOnDatabinB.someProperty;
    assert.deepEqual(
        databinBValueActual,
        databinBValueExpected,
        'Value stored on first time is accessible on second time on databin B');
}

QUnit.module('JpipObjectPoolByDatabin');

QUnit.test('Object is correctly cached', function(assert) {
    var pool = new JpipObjectPoolByDatabin();
    var databin = createDatabinStub(152, 294);
    
    var someValue = 'Some dummy value 412';
    
    // Act
    
    var objectReturnedFirstTime = pool.getObject(databin);
    objectReturnedFirstTime.someProperty = someValue;
    
    var objectReturnedSecondTime = pool.getObject(databin);
    
    // Assert
    
    var valueExpected = someValue;
    var valueActual = objectReturnedSecondTime.someProperty;
    assert.deepEqual(
        valueActual,
        valueExpected,
        'Value stored on first time is accessible on second time');
    });

QUnit.test('Two different databins with same class ID are correctly cached', function(assert) {
    var databinA = createDatabinStub(284, 192);
    var databinB = createDatabinStub(113, 192);
    
    checkDifferentDatabins(assert, databinA, databinB);
    });

QUnit.test('Two different databins with same in-class ID are correctly cached', function(assert) {
    var databinA = createDatabinStub(553, 623);
    var databinB = createDatabinStub(553, 723);
    
    checkDifferentDatabins(assert, databinA, databinB);
    });
    
QUnit.test(
    'Expected exception for different databins with same class ID and in-class ID',
    function(assert) {
        var pool = new JpipObjectPoolByDatabin();
        var databinA = createDatabinStub(664, 938);
        var databinB = createDatabinStub(664, 938);
        
        var someValue = 'Some dummy value 412';
        
        var obj = pool.getObject(databinA);
        obj.someProperty = someValue;
        
        assert.throws(
            function() {
                pool.getObject(databinB);
            },
            jpipExceptions.InternalErrorException,
            'Expected exception on second duplicated databin access');
    });