'use strict';

var mockFactoryForDatabinsSaverTests = Object.create(jpipMockFactory);

mockFactoryForDatabinsSaverTests.lastDatabinCreated = null;
mockFactoryForDatabinsSaverTests.loggedCreatedDatabins = {};
mockFactoryForDatabinsSaverTests.nonUniqueIds = {};

mockFactoryForDatabinsSaverTests.createDatabinParts = function(classId, inClassId) {
    if (mockFactoryForDatabinsSaverTests.lastDatabinCreated !== null) {
        throw 'More than one creation of databin parts';
    }
    
    mockFactoryForDatabinsSaverTests.lastDatabinCreated =
        new DatabinPartsMockLastCallLogger(classId, inClassId);
    
    var uniqueId = classId + '_' + inClassId;
    
    if (mockFactoryForDatabinsSaverTests.loggedCreatedDatabins[uniqueId] !== undefined) {
        mockFactoryForDatabinsSaverTests.nonUniqueIds[uniqueId] = true;
    } else {
        mockFactoryForDatabinsSaverTests.loggedCreatedDatabins[uniqueId] = true;
    }
    
    return mockFactoryForDatabinsSaverTests.lastDatabinCreated;
};

mockFactoryForDatabinsSaverTests.clearLastCreated = function() {
    mockFactoryForDatabinsSaverTests.lastDatabinCreated = null;
};

mockFactoryForDatabinsSaverTests.clearAllLoggedCreated = function() {
    mockFactoryForDatabinsSaverTests.loggedCreatedDatabins = {};
    mockFactoryForDatabinsSaverTests.nonUniqueIds = {};
};

mockFactoryForDatabinsSaverTests.getLastDatabinCreated = function() {
    if (mockFactoryForDatabinsSaverTests.lastDatabinCreated === null) {
        throw 'no databin has been created';
    }

    var result = mockFactoryForDatabinsSaverTests.lastDatabinCreated;
    mockFactoryForDatabinsSaverTests.lastDatabinCreated = null;
    
    return result;
};