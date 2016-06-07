'use strict';

var DatabinPartsMockLastCallLogger = function(uniqueId) {
    this.lastAddDataCall = null;
    
    this.addData = function(header, message) {
        if (this.lastAddDataCall !== null) {
            throw 'More than one call to databinParts.addData()';
        }
        
        this.lastAddDataCall = {
            header: header,
            message: message
            };
    };
    
    this.getLoadedBytes = function getLoadedBytes() {
        return NaN;
    };
    
    this.getLastAddDataCall = function() {
        if (this.lastAddDataCall === null) {
            throw 'No call to addData has been performed';
        }
        
        var result = this.lastAddDataCall;
        this.lastAddDataCall = null;
        
        return result;
    };
    
    return this;
};