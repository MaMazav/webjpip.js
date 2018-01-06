'use strict';

var jGlobals = require('j2k-jpip-globals.js');

module.exports = function JpipTagTree(
    bitstreamReader, width, height, transactionHelper) {
    
    var isAlreadyReadBitsTransactionalObject =
        transactionHelper.createTransactionalObject(false, /*isValueType=*/true);
    var levels;
    
    createLevelsArray();
        
    this.setMinimalValueIfNotReadBits = function setMinimalValueIfNotReadBits(
        minimalValue) {
    
        if (isAlreadyReadBits()) {
            return;
        }
        
        var transactionalObject = levels[0].content[0];
        var node = transactionalObject.getValue(
            bitstreamReader.activeTransaction);
        
        node.minimalPossibleValue = minimalValue;
    };
    
    this.isSmallerThanOrEqualsTo = function isSmallerThanOrEqualsTo(
        x, y, value) {
        
        setAlreadyReadBits();
        
        var getNextNode = getRootToLeafIterator(x, y);
        var currentNode = getNextNode();
        var lastNode;
        
        while (currentNode !== null) {
            if (currentNode.minimalPossibleValue > value) {
                return false;
            }
            
            if (!currentNode.isFinalValue) {
                var maxBitsToShift = value - currentNode.minimalPossibleValue + 1;
                var addToValue = bitstreamReader.countZerosAndShiftUntilFirstOneBit(
                    maxBitsToShift);
                    
                if (addToValue === null) {
                    return null;
                }
                
                currentNode.minimalPossibleValue += addToValue;
                
                if (addToValue < maxBitsToShift) {
                    currentNode.isFinalValue = true;
                }
            }
            
            lastNode = currentNode;
            currentNode = getNextNode();
        }
        
        var result = lastNode.minimalPossibleValue <= value;
        if (result && !lastNode.isFinalValue) {
            throw new jGlobals.jpipExceptions.InternalErrorException(
                'Wrong parsing in TagTree.isSmallerThanOrEqualsTo: ' +
                'not sure if value is smaller than asked');
        }
        
        return result;
    };
    
    this.getValue = function getValue(x, y) {
        var getNextNode = getRootToLeafIterator(x, y);
        var currentNode = getNextNode();
        var leaf;
        
        setAlreadyReadBits();
        
        while (currentNode !== null) {
            if (!currentNode.isFinalValue) {
                var addToValue =
                    bitstreamReader.countZerosAndShiftUntilFirstOneBit();
                
                if (addToValue === null) {
                    return null;
                }

                currentNode.minimalPossibleValue += addToValue;
                currentNode.isFinalValue = true;
            }
            
            leaf = currentNode;
            currentNode = getNextNode();
        }
        
        return leaf.minimalPossibleValue;
    };
    
    function createLevelsArray() {
        levels = [];
        var levelWidth = width;
        var levelHeight = height;
        
        while (levelWidth >= 1 || levelHeight >= 1) {
            levelWidth = Math.ceil(levelWidth);
            levelHeight = Math.ceil(levelHeight);
            
            var elementCount = levelWidth * levelHeight;
            levels.unshift({
                width: levelWidth,
                height: levelHeight,
                content: new Array(elementCount)
                });
            
            levelWidth /= 2;
            levelHeight /= 2;
        }
        
        initNode(0, 0);
    }
    
    function getRootToLeafIterator(x, y) {
        var level = 0;
        var prevIteratedNode = null;
        
        function getNext() {
            if (level === null) {
                throw new jGlobals.jpipExceptions.InternalErrorException(
                    'Iterated too deep in tag tree');
            }
            
            if (level === levels.length) {
                level = null;
                return null;
            }
            
            var shiftFactor = levels.length - level - 1;
            var currentX = Math.floor(x >> shiftFactor);
            var currentY = Math.floor(y >> shiftFactor);
            
            var indexInLevel = levels[level].width * currentY + currentX;
            
            var transactionalObject = levels[level].content[indexInLevel];
            
            if (transactionalObject === undefined) {
                transactionalObject = initNode(level, indexInLevel);
            }
            
            var result = transactionalObject.getValue(
                bitstreamReader.activeTransaction);
            
            if (prevIteratedNode !== null &&
                prevIteratedNode.minimalPossibleValue > result.minimalPossibleValue) {
                
                result.minimalPossibleValue = prevIteratedNode.minimalPossibleValue;
            }

            prevIteratedNode = result;
            ++level;
            return result;
        }
        
        return getNext;
    }
    
    function initNode(level, indexInLevel) {
        var objectValue = {
            minimalPossibleValue: 0,
            isFinalValue: false
            };
            
        var transactionalObject = transactionHelper.createTransactionalObject(
            objectValue);
        
        levels[level].content[indexInLevel] = transactionalObject;
        return transactionalObject;
    }
    
    function isAlreadyReadBits() {
        var isAlreadyReadBitsTransactionalValue =
            isAlreadyReadBitsTransactionalObject.getValue(
                bitstreamReader.activeTransaction);
        
        return isAlreadyReadBitsTransactionalValue;
    }
    
    function setAlreadyReadBits() {
        isAlreadyReadBitsTransactionalObject.setValue(
            bitstreamReader.activeTransaction, true);
    }
};