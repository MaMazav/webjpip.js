'use strict';

var MockHelper = function MockHelper(mockObject) {
    var FUNCTION_NOT_RETURNS_VALUE_PLACEHOLDER = {};
    
    var argNamesByFunction = {};
    
    mockObject.namedArgsLogByFunctionForTest = {};
    mockObject.enumeratedArgsLogByFunctionForTest = {};
    
    clearForTest();
    
    this.clearForTest = clearForTest;
    
    this.addFunction = function addFunction(
        functionName, argNames, allowNotReturnValue) {
        
        if (allowNotReturnValue) {
            mockObject.resultByFunctionForTest[functionName] =
                FUNCTION_NOT_RETURNS_VALUE_PLACEHOLDER;
        }
        
        argNamesByFunction[functionName] = argNames || [];
        mockObject.namedArgsLogByFunctionForTest[functionName] = [];
        mockObject.enumeratedArgsLogByFunctionForTest[functionName] = [];
        
        mockObject[functionName] = function mockedFunction(
            arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            
            return callMockFunctionAndLogArgs(
                functionName, arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7);
        };
    };
    
    this.defineGetterOfLastCall = function defineGetterOfLastCall(
        property, setterFunction, argument) {
        
        Object.defineProperty(mockObject, property, {
            get: function getCallback() {
                var allStatusCallbacksSet = this.namedArgsLogByFunctionForTest[
                    setterFunction];
                
                var length = allStatusCallbacksSet.length;
                if (length === 0) {
                    throw 'No ' + argument + ' set. Fix test or implementation';
                }
                
                return allStatusCallbacksSet[length - 1][argument];
            }
        });
    };
    
    function callMockFunctionAndLogArgs(
        functionName, arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
        
        var argsArray = [arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7];
        var argNames = argNamesByFunction[functionName];
        var argsByName = {};
        
        for (var i = 0; i < argNames.length; ++i) {
            argsByName[argNames[i]] = argsArray[i];
        }
        
        var result = mockObject.resultByFunctionForTest[functionName];
        
        if (result === undefined) {
            throw 'No Mock.resultByFunctionForTest.' + functionName +
                ' set. Fix test';
        } else if (result === FUNCTION_NOT_RETURNS_VALUE_PLACEHOLDER) {
            result = undefined;
        }

        mockObject.namedArgsLogByFunctionForTest[functionName].push(argsByName);
        mockObject.enumeratedArgsLogByFunctionForTest[functionName].push(argsArray.slice(0, argNames.length));
        
        return result;
    }
    
    function clearForTest() {
        clearDictionaryOfArrays(mockObject.namedArgsLogByFunctionForTest);
        clearDictionaryOfArrays(mockObject.enumeratedArgsLogByFunctionForTest);
        mockObject.resultByFunctionForTest = {};
    }
    
    function clearDictionaryOfArrays(dictionary) {
        for (var key in dictionary) {
            dictionary[key] = [];
        }
    }
};