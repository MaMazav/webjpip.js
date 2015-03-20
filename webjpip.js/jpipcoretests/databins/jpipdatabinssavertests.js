'use strict';

QUnit.module('JpipDatabinsSaver');

QUnit.test('JpipDatabinsSaver (JPP or JPT)', function(assert) {
    mockFactoryForDatabinsSaverTests.clearLastCreated();
    var databinsSaver = new JpipDatabinsSaver(/*isJPT=*/true, mockFactoryForDatabinsSaverTests);
    
    // Before saveData

    var mainHeaderDatabinActual = databinsSaver.getMainHeaderDatabin();
    var mainHeaderDatabinExpected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    assert.equal(mainHeaderDatabinActual, mainHeaderDatabinExpected, 'getMainHeaderDatabin (first time accessed)');
    
    var savePartToMainHeaderExpected = {
        header: { dummyProperty: 'dummy header', classId: 6 /*Main header*/, codestreamIndex: 0, inClassId: 0 },
        message: new Int8Array([ 0x43, 0xF4, 0x52 ])
        };
    databinsSaver.saveData(savePartToMainHeaderExpected.header, savePartToMainHeaderExpected.message);
    var savePartToMainHeaderActual = mainHeaderDatabinExpected.getLastAddDataCall();
    assert.deepEqual(savePartToMainHeaderActual, savePartToMainHeaderExpected, 'saveData to main header');
    
    // Ensure no exception thrown on metadata-bin
    var savePartToMetadata = {
        header: { dummyProperty: 'dummy header 2', classId: 8 /*Metadata*/, codestreamIndex: 0, inClassId: 2 },
        message: new Int8Array([ 0x41, 0xB2, 0x4A, 0x9F, 0x94 ])
        };
    databinsSaver.saveData(savePartToMetadata.header, savePartToMetadata.message);
    
    // Ensure no exception thrown on unknown class ID
    var savePartToUnknownClass = {
        header: { dummyProperty: 'dummy header 3', classId: 17 /*Unknown*/, codestreamIndex: 0, inClassId: 2 },
        message: new Int8Array([ 0x41, 0xB2, 0x4A, 0x9F, 0x94 ])
        };
    databinsSaver.saveData(savePartToUnknownClass.header, savePartToUnknownClass.message);
    
    // After saveData
    
    mainHeaderDatabinActual = databinsSaver.getMainHeaderDatabin();
    assert.equal(mainHeaderDatabinActual, mainHeaderDatabinExpected, 'getMainHeaderDatabin (reference not changed after saving data)');
    
    var nonUniqueIdsActual = mockFactoryForDatabinsSaverTests.nonUniqueIds;
    var nonUniqueIdsExpected = {};
    assert.deepEqual(nonUniqueIdsActual, nonUniqueIdsExpected, 'every databin is expected to be created with a unique ID');
    mockFactoryForDatabinsSaverTests.clearAllLoggedCreated();
    });

QUnit.test('JpipDatabinsSaver (JPP)', function(assert) {
    mockFactoryForDatabinsSaverTests.clearLastCreated();
    var jppSaver = new JpipDatabinsSaver(/*isJPT=*/false, mockFactoryForDatabinsSaverTests);
    mockFactoryForDatabinsSaverTests.clearLastCreated(); // Clear main header data-bin creation
    
    var isJptActual = jppSaver.getIsJpipTilePartStream();
    var isJptExpected = false;
    assert.deepEqual(isJptActual, isJptExpected, 'IsJpipTilePartStream in JPP');

    // Before saveData
    
    var tileHeaderDatabinActual = jppSaver.getTileHeaderDatabin(5);
    var tileHeaderDatabinExpected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    assert.equal(tileHeaderDatabinActual, tileHeaderDatabinExpected, 'getTileHeaderDatabin (first time accessed)');
    
    tileHeaderDatabinActual = jppSaver.getTileHeaderDatabin(3);
    var tileHeaderDatabinExpected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    assert.equal(tileHeaderDatabinActual, tileHeaderDatabinExpected, 'getTileHeaderDatabin (accessed another tile)');
    
    var precinctDatabinActual = jppSaver.getPrecinctDatabin(3);
    var precinctDatabinExpected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    assert.equal(precinctDatabinActual, precinctDatabinExpected, 'getPrecinctDatabin (first time accessed)');
    
    var precinctDatabinActual = jppSaver.getPrecinctDatabin(2);
    var precinctDatabinExpected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    assert.equal(precinctDatabinActual, precinctDatabinExpected, 'getPrecinctDatabin (accessed another precinct)');
    
    // saveData
    
    var savePartToTileHeaderExpected = {
        header: { dummyProperty: 'dummy header 2', classId: 2 /*Tile header*/, codestreamIndex: 0, inClassId: 3 },
        message: new Int8Array([ 0x41, 0xA4, 0xA2 ])
        };
    jppSaver.saveData(savePartToTileHeaderExpected.header, savePartToTileHeaderExpected.message);
    var savePartToTileHeaderActual = tileHeaderDatabinExpected.getLastAddDataCall();
    assert.deepEqual(savePartToTileHeaderActual, savePartToTileHeaderExpected, 'saveData to tile header');
    
    var savePartToPrecinctExpected = {
        header: { dummyProperty: 'dummy header 2', classId: 0 /*Precinct*/, codestreamIndex: 0, inClassId: 2 },
        message: new Int8Array([ 0x0F, 0x55 ])
        };
    jppSaver.saveData(savePartToPrecinctExpected.header, savePartToPrecinctExpected.message);
    var savePartToPrecinctActual = precinctDatabinExpected.getLastAddDataCall();
    assert.deepEqual(savePartToPrecinctActual, savePartToPrecinctExpected, 'saveData to precinct (classId = 0 - without aux)');
    
    savePartToPrecinctExpected = {
        header: { dummyProperty: 'dummy header 2', classId: 1 /*Precinct*/, codestreamIndex: 0, inClassId: 2 },
        message: new Int8Array([ 0x41, 0xB2, 0x4A, 0x9F ])
        };
    jppSaver.saveData(savePartToPrecinctExpected.header, savePartToPrecinctExpected.message);
    savePartToPrecinctActual = precinctDatabinExpected.getLastAddDataCall();
    assert.deepEqual(savePartToPrecinctActual, savePartToPrecinctExpected, 'saveData to precinct (classId = 1 - with aux)');
    
    // After saveData
    
    tileHeaderDatabinActual = jppSaver.getTileHeaderDatabin(3);
    assert.equal(tileHeaderDatabinActual, tileHeaderDatabinExpected, 'getTileHeaderDatabin (reference not changed after saving data)');
    
    precinctDatabinActual = jppSaver.getPrecinctDatabin(2);
    assert.equal(precinctDatabinActual, precinctDatabinExpected, 'getPrecinctDatabin (reference not changed after saving data)');

    mockFactoryForDatabinsSaverTests.clearAllLoggedCreated();
    });

QUnit.test('JpipDatabinsSaver (JPP), in-class ID = 65,536', function(assert) {
    mockFactoryForDatabinsSaverTests.clearLastCreated();
    var jppSaver = new JpipDatabinsSaver(/*isJPT=*/false, mockFactoryForDatabinsSaverTests);
    mockFactoryForDatabinsSaverTests.clearLastCreated(); // Clear main header data-bin creation

    var savePartTo65536Expected = {
        header: {dummyProperty: 'dummy header 3', classId: 0 /*Precinct*/, codestreamIndex: 0, inClassId: 65536, bodyStart: 0, messageBodyLength: 1, isLastByteInDatabin: true },
        message: new Int8Array([ 0x4, 0x8 ])
        };
    jppSaver.saveData(savePartTo65536Expected.header, savePartTo65536Expected.message);

    var databin65536Expected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    var databin65536Actual = jppSaver.getPrecinctDatabin(65536);
    assert.equal(databin65536Actual, databin65536Expected, 'in-class ID of 65536 (correct reference returned)');

    var savePartTo65536Actual = databin65536Expected.getLastAddDataCall();
    assert.deepEqual(savePartTo65536Actual, savePartTo65536Expected, 'in-class ID of 65536 (correct data saved)');
    
    var nonUniqueIdsActual = mockFactoryForDatabinsSaverTests.nonUniqueIds;
    var nonUniqueIdsExpected = {};
    assert.deepEqual(nonUniqueIdsActual, nonUniqueIdsExpected, 'every databin is expected to be created with a unique ID (JPP)');
    mockFactoryForDatabinsSaverTests.clearAllLoggedCreated();
    });

QUnit.test('JPIPDatabinsSaver (JPT)', function(assert) {

    mockFactoryForDatabinsSaverTests.clearLastCreated();
    var jptSaver = new JpipDatabinsSaver(/*isJPT=*/true, mockFactoryForDatabinsSaverTests);
    mockFactoryForDatabinsSaverTests.clearLastCreated(); // Clear main header data-bin creation

    var isJptActual = jptSaver.getIsJpipTilePartStream();
    var isJptExpected = true;
    assert.deepEqual(isJptActual, isJptExpected, 'IsJpipTilePartStream in JPT');

    // Before saveData
    
    var tileDatabinActual = jptSaver.getTileDatabin(3);
    var tileDatabinExpected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    assert.equal(tileDatabinActual, tileDatabinExpected, 'getTileDatabin (first time accessed)');
    
    var tileDatabinActual = jptSaver.getTileDatabin(2);
    var tileDatabinExpected = mockFactoryForDatabinsSaverTests.getLastDatabinCreated();
    assert.equal(tileDatabinActual, tileDatabinExpected, 'getTileDatabin (accessed another tile)');
    
    // saveData
    
    var savePartToTileExpected = {
        header: { dummyProperty: 'dummy header 2', classId: 4 /*Tile*/, codestreamIndex: 0, inClassId: 2 },
        message: new Int8Array([ 0x0F, 0x55 ])
        };
    jptSaver.saveData(savePartToTileExpected.header, savePartToTileExpected.message);
    var savePartToTileActual = tileDatabinExpected.getLastAddDataCall();
    assert.deepEqual(savePartToTileActual, savePartToTileExpected, 'saveData to tile (classId = 4 - without aux)');
    
    savePartToTileExpected = {
        header: { dummyProperty: 'dummy header 2', classId: 5 /*Tile*/, codestreamIndex: 0, inClassId: 2 },
        message: new Int8Array([ 0x41, 0xB2, 0x4A, 0x9F ])
        };
    jptSaver.saveData(savePartToTileExpected.header, savePartToTileExpected.message);
    savePartToTileActual = tileDatabinExpected.getLastAddDataCall();
    assert.deepEqual(savePartToTileActual, savePartToTileExpected, 'saveData to tile (classId = 5 - with aux)');
    
    // After saveData
    
    tileDatabinActual = jptSaver.getTileDatabin(2);
    assert.equal(tileDatabinActual, tileDatabinExpected, 'getTileDatabin (reference not changed after saving data)');
    
    var nonUniqueIdsActual = mockFactoryForDatabinsSaverTests.nonUniqueIds;
    var nonUniqueIdsExpected = {};
    assert.deepEqual(nonUniqueIdsActual, nonUniqueIdsExpected, 'every databin is expected to be created with a unique ID (JPT)');
    mockFactoryForDatabinsSaverTests.clearAllLoggedCreated();
    });

QUnit.test('Illegal operation exceptions', function(assert) {
    mockFactoryForDatabinsSaverTests.clearLastCreated();
    var jppSaver = new JpipDatabinsSaver(/*isJPT=*/false, mockFactoryForDatabinsSaverTests);
    mockFactoryForDatabinsSaverTests.getLastDatabinCreated();

    assert.throws(
        function() { jppSaver.getTileDatabin(4); },
        jpipExceptions.WrongStreamException,
        'getTileDatabin expected to throw exception in JPP stream');
        
    var nonUniqueIdsActual = mockFactoryForDatabinsSaverTests.nonUniqueIds;
    var nonUniqueIdsExpected = {};
    assert.deepEqual(nonUniqueIdsActual, nonUniqueIdsExpected, 'every databin is expected to be created with a unique ID (JPP with exception)');
    mockFactoryForDatabinsSaverTests.clearAllLoggedCreated();

    mockFactoryForDatabinsSaverTests.clearLastCreated();
    var jptSaver = new JpipDatabinsSaver(/*isJPT=*/true, mockFactoryForDatabinsSaverTests);
    mockFactoryForDatabinsSaverTests.getLastDatabinCreated();

    assert.throws(
        function() { jptSaver.getTileHeaderDatabin(0); },
        jpipExceptions.WrongStreamException,
        'getTileHeaderDatabin expected to throw exception in JPT stream');
        
    assert.throws(
        function() { jptSaver.getPrecinctDatabin(15); },
        jpipExceptions.WrongStreamException,
        'getPrecinctDatabin expected to throw exception in JPT stream');
        
    var illegalInClassIdToMainHeader = {
        header: { dummyProperty: 'dummy header', classId: 6 /*Main header*/, codestreamIndex: 0, inClassId: 5 /*Illegal*/ },
        message: new Int8Array([ 0x43, 0xF4, 0x52 ])
        };
    assert.throws(
        function() { jptSaver.saveData(illegalInClassIdToMainHeader.header, illegalInClassIdToMainHeader.message); },
        jpipExceptions.IllegalDataException,
        'Illegal non zero in-class ID in main header');
    
    var unsupportedNonZeroCodestream = {
        header: { dummyProperty: 'dummy header', classId: 6, codestreamIndex: 2 /*Unsupported*/, inClassId: 0 },
        message: new Int8Array([ 0x43, 0xF4, 0x52 ])
        };
    assert.throws(
        function() { jptSaver.saveData(unsupportedNonZeroCodestream.header, unsupportedNonZeroCodestream.message); },
        jpipExceptions.UnsupportedFeatureException,
        'Unsupported non zero codestream != 0');
    
    var nonUniqueIdsActual = mockFactoryForDatabinsSaverTests.nonUniqueIds;
    var nonUniqueIdsExpected = {};
    assert.deepEqual(nonUniqueIdsActual, nonUniqueIdsExpected, 'every databin is expected to be created with a unique ID (JPT with exceptions)');
    mockFactoryForDatabinsSaverTests.clearAllLoggedCreated();
    });