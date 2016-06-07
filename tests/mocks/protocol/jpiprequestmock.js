'use strict';

function JpipRequestMock(targetId) {
    var mock = new MockHelper(this);
    
    mock.addFunction(
        'startRequest', /*argNames=*/[], /*allowNotReturnValue=*/true);
    
    mock.addFunction(
        'stopRequestAsync', /*argNames=*/[], /*allowNotReturnValue=*/true);
}