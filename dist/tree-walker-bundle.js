!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.treeWalker=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Copyright (c) 2014 Patrick Dubroy <pdubroy@gmail.com>
// This software is distributed under the terms of the MIT License.

'use strict';

var extend = require('util-extend'),
    WeakMap = require('./third_party/WeakMap');  // eslint-disable-line no-undef,no-native-reassign

// An internal object that can be returned from a visitor function to
// prevent a top-down walk from walking subtrees of a node.
var stopRecursion = {};

// An internal object that can be returned from a visitor function to
// cause the walk to immediately stop.
var stopWalk = {};

var hasOwnProp = Object.prototype.hasOwnProperty;

// Helpers
// -------

function isElement(obj) {
  return !!(obj && obj.nodeType === 1);
}

function isObject(obj) {
  var type = typeof obj;
  return type === 'function' || type === 'object' && !!obj;
}

function isString(obj) {
  return Object.prototype.toString.call(obj) === '[object String]';
}

function each(obj, predicate) {
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {
      if (predicate(obj[k], k, obj))
        return false;
    }
  }
  return true;
}

// Returns a copy of `obj` containing only the properties given by `keys`.
function pick(obj, keys) {
  var result = {};
  for (var i = 0, length = keys.length; i < length; i++) {
    var key = keys[i];
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

// Makes a shallow copy of `arr`, and adds `obj` to the end of the copy.
function copyAndPush(arr, obj) {
  var result = arr.slice();
  result.push(obj);
  return result;
}

// Implements the default traversal strategy: if `obj` is a DOM node, walk
// its DOM children; otherwise, walk all the objects it references.
function defaultTraversal(obj) {
  return isElement(obj) ? obj.children : obj;
}

// Walk the tree recursively beginning with `root`, calling `beforeFunc`
// before visiting an objects descendents, and `afterFunc` afterwards.
// If `collectResults` is true, the last argument to `afterFunc` will be a
// collection of the results of walking the node's subtrees.
function walkImpl(root, traversalStrategy, beforeFunc, afterFunc, context, collectResults) {
  return (function _walk(stack, value, key, parent) {
    if (isObject(value) && stack.indexOf(value) >= 0)
      throw new TypeError('A cycle was detected at ' + value);

    if (beforeFunc) {
      var result = beforeFunc.call(context, value, key, parent);
      if (result === stopWalk) return stopWalk;
      if (result === stopRecursion) return;  // eslint-disable-line consistent-return
    }

    var subResults;
    var target = traversalStrategy(value);

    if (isObject(target) && Object.keys(target).length > 0) {
      // Collect results from subtrees in the same shape as the target.
      if (collectResults) subResults = Array.isArray(target) ? [] : {};

      var ok = each(target, function(obj, key) {
        var result = _walk(copyAndPush(stack, value), obj, key, value);
        if (result === stopWalk) return false;
        if (subResults) subResults[key] = result;
      });
      if (!ok) return stopWalk;
    }
    if (afterFunc) return afterFunc.call(context, value, key, parent, subResults);
  })([], root);
}

// Internal helper providing the implementation for `pluck` and `pluckRec`.
function pluck(obj, propertyName, recursive) {
  var results = [];
  this.preorder(obj, function(value, key) {
    if (!recursive && key === propertyName)
      return stopRecursion;
    if (hasOwnProp.call(value, propertyName))
      results[results.length] = value[propertyName];
  });
  return results;
}

function defineEnumerableProperty(obj, propName, getterFn) {
  Object.defineProperty(obj, propName, {
    enumerable: true,
    get: getterFn
  });
}

// Returns an object containing the walk functions. If `traversalStrategy`
// is specified, it is a function determining how objects should be
// traversed. Given an object, it returns the object to be recursively
// walked. The default strategy is equivalent to `_.identity` for regular
// objects, and for DOM nodes it returns the node's DOM children.
function Walker(traversalStrategy) {
  if (!(this instanceof Walker))
    return new Walker(traversalStrategy);

  // There are two different strategy shorthands: if a single string is
  // specified, treat the value of that property as the traversal target.
  // If an array is specified, the traversal target is the node itself, but
  // only the properties contained in the array will be traversed.
  if (isString(traversalStrategy)) {
    var prop = traversalStrategy;
    traversalStrategy = function(node) {
      if (isObject(node) && prop in node) return node[prop];
    };
  } else if (Array.isArray(traversalStrategy)) {
    var props = traversalStrategy;
    traversalStrategy = function(node) {
      if (isObject(node)) return pick(node, props);
    };
  }
  this._traversalStrategy = traversalStrategy || defaultTraversal;
}

extend(Walker.prototype, {
  // Performs a preorder traversal of `obj` and returns the first value
  // which passes a truth test.
  find: function(obj, visitor, context) {
    var result;
    this.preorder(obj, function(value, key, parent) {
      if (visitor.call(context, value, key, parent)) {
        result = value;
        return stopWalk;
      }
    }, context);
    return result;
  },

  // Recursively traverses `obj` and returns all the elements that pass a
  // truth test. `strategy` is the traversal function to use, e.g. `preorder`
  // or `postorder`.
  filter: function(obj, strategy, visitor, context) {
    var results = [];
    if (obj === null) return results;
    strategy(obj, function(value, key, parent) {
      if (visitor.call(context, value, key, parent)) results.push(value);
    }, null, this._traversalStrategy);
    return results;
  },

  // Recursively traverses `obj` and returns all the elements for which a
  // truth test fails.
  reject: function(obj, strategy, visitor, context) {
    return this.filter(obj, strategy, function(value, key, parent) {
      return !visitor.call(context, value, key, parent);
    });
  },

  // Produces a new array of values by recursively traversing `obj` and
  // mapping each value through the transformation function `visitor`.
  // `strategy` is the traversal function to use, e.g. `preorder` or
  // `postorder`.
  map: function(obj, strategy, visitor, context) {
    var results = [];
    strategy(obj, function(value, key, parent) {
      results[results.length] = visitor.call(context, value, key, parent);
    }, null, this._traversalStrategy);
    return results;
  },

  // Return the value of properties named `propertyName` reachable from the
  // tree rooted at `obj`. Results are not recursively searched; use
  // `pluckRec` for that.
  pluck: function(obj, propertyName) {
    return pluck.call(this, obj, propertyName, false);
  },

  // Version of `pluck` which recursively searches results for nested objects
  // with a property named `propertyName`.
  pluckRec: function(obj, propertyName) {
    return pluck.call(this, obj, propertyName, true);
  },

  // Recursively traverses `obj` in a depth-first fashion, invoking the
  // `visitor` function for each object only after traversing its children.
  // `traversalStrategy` is intended for internal callers, and is not part
  // of the public API.
  postorder: function(obj, visitor, context, traversalStrategy) {
    traversalStrategy = traversalStrategy || this._traversalStrategy;
    walkImpl(obj, traversalStrategy, null, visitor, context);
  },

  // Recursively traverses `obj` in a depth-first fashion, invoking the
  // `visitor` function for each object before traversing its children.
  // `traversalStrategy` is intended for internal callers, and is not part
  // of the public API.
  preorder: function(obj, visitor, context, traversalStrategy) {
    traversalStrategy = traversalStrategy || this._traversalStrategy;
    walkImpl(obj, traversalStrategy, visitor, null, context);
  },

  // Builds up a single value by doing a post-order traversal of `obj` and
  // calling the `visitor` function on each object in the tree. For leaf
  // objects, the `memo` argument to `visitor` is the value of the `leafMemo`
  // argument to `reduce`. For non-leaf objects, `memo` is a collection of
  // the results of calling `reduce` on the object's children.
  reduce: function(obj, visitor, leafMemo, context) {
    var reducer = function(value, key, parent, subResults) {
      return visitor(subResults || leafMemo, value, key, parent);
    };
    return walkImpl(obj, this._traversalStrategy, null, reducer, context, true);
  },

  // An 'attribute' is a value that is calculated by invoking a visitor
  // function on a node. The first argument of the visitor is a collection
  // of the attribute values for the node's children. These are calculated
  // lazily -- in this way the visitor can decide in what order to visit the
  // subtrees.
  createAttribute: function(visitor, defaultValue, context) {
    var self = this;
    var memo = new WeakMap();
    function _visit(stack, value, key, parent) {
      if (isObject(value) && stack.indexOf(value) >= 0)
        throw new TypeError('A cycle was detected at ' + value);

      if (memo.has(value))
        return memo.get(value);

      var subResults;
      var target = self._traversalStrategy(value);
      if (isObject(target) && Object.keys(target).length > 0) {
        subResults = {};
        each(target, function(child, k) {
          defineEnumerableProperty(subResults, k, function() {
            return _visit(copyAndPush(stack, value), child, k, value);
          });
        });
      }
      var result = visitor.call(context, subResults, value, key, parent);
      memo.set(value, result);
      return result;
    }
    return function(obj) { return _visit([], obj); };
  }
});

var WalkerProto = Walker.prototype;

// Set up a few convenient aliases.
WalkerProto.each = WalkerProto.preorder;
WalkerProto.collect = WalkerProto.map;
WalkerProto.detect = WalkerProto.find;
WalkerProto.select = WalkerProto.filter;

// Export the walker constructor, but make it behave like an instance.
Walker._traversalStrategy = defaultTraversal;
module.exports = extend(Walker, WalkerProto);

},{"./third_party/WeakMap":3,"util-extend":2}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = extend;
function extend(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || typeof add !== 'object') return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
}

},{}],3:[function(require,module,exports){
/*
 * Copyright 2012 The Polymer Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

if (typeof WeakMap === 'undefined') {
  (function() {
    var defineProperty = Object.defineProperty;
    var counter = Date.now() % 1e9;

    var WeakMap = function() {
      this.name = '__st' + (Math.random() * 1e9 >>> 0) + (counter++ + '__');
    };

    WeakMap.prototype = {
      set: function(key, value) {
        var entry = key[this.name];
        if (entry && entry[0] === key)
          entry[1] = value;
        else
          defineProperty(key, this.name, {value: [key, value], writable: true});
        return this;
      },
      get: function(key) {
        var entry;
        return (entry = key[this.name]) && entry[0] === key ?
            entry[1] : undefined;
      },
      delete: function(key) {
        var entry = key[this.name];
        if (!entry || entry[0] !== key) return false;
        entry[0] = entry[1] = undefined;
        return true;
      },
      has: function(key) {
        var entry = key[this.name];
        if (!entry) return false;
        return entry[0] === key;
      }
    };

    module.exports = WeakMap;
  })();
} else {
  module.exports = WeakMap;
}

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvaW5kZXguanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvbm9kZV9tb2R1bGVzL3V0aWwtZXh0ZW5kL2V4dGVuZC5qcyIsIi9Vc2Vycy9kdWJyb3kvZGV2L3RyZWUtd2Fsay90aGlyZF9wYXJ0eS9XZWFrTWFwL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gQ29weXJpZ2h0IChjKSAyMDE0IFBhdHJpY2sgRHVicm95IDxwZHVicm95QGdtYWlsLmNvbT5cbi8vIFRoaXMgc29mdHdhcmUgaXMgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBNSVQgTGljZW5zZS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgndXRpbC1leHRlbmQnKSxcbiAgICBXZWFrTWFwID0gcmVxdWlyZSgnLi90aGlyZF9wYXJ0eS9XZWFrTWFwJyk7ICAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXVuZGVmLG5vLW5hdGl2ZS1yZWFzc2lnblxuXG4vLyBBbiBpbnRlcm5hbCBvYmplY3QgdGhhdCBjYW4gYmUgcmV0dXJuZWQgZnJvbSBhIHZpc2l0b3IgZnVuY3Rpb24gdG9cbi8vIHByZXZlbnQgYSB0b3AtZG93biB3YWxrIGZyb20gd2Fsa2luZyBzdWJ0cmVlcyBvZiBhIG5vZGUuXG52YXIgc3RvcFJlY3Vyc2lvbiA9IHt9O1xuXG4vLyBBbiBpbnRlcm5hbCBvYmplY3QgdGhhdCBjYW4gYmUgcmV0dXJuZWQgZnJvbSBhIHZpc2l0b3IgZnVuY3Rpb24gdG9cbi8vIGNhdXNlIHRoZSB3YWxrIHRvIGltbWVkaWF0ZWx5IHN0b3AuXG52YXIgc3RvcFdhbGsgPSB7fTtcblxudmFyIGhhc093blByb3AgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4vLyBIZWxwZXJzXG4vLyAtLS0tLS0tXG5cbmZ1bmN0aW9uIGlzRWxlbWVudChvYmopIHtcbiAgcmV0dXJuICEhKG9iaiAmJiBvYmoubm9kZVR5cGUgPT09IDEpO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdChvYmopIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2Ygb2JqO1xuICByZXR1cm4gdHlwZSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlID09PSAnb2JqZWN0JyAmJiAhIW9iajtcbn1cblxuZnVuY3Rpb24gaXNTdHJpbmcob2JqKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgU3RyaW5nXSc7XG59XG5cbmZ1bmN0aW9uIGVhY2gob2JqLCBwcmVkaWNhdGUpIHtcbiAgZm9yICh2YXIgayBpbiBvYmopIHtcbiAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtrXSwgaywgb2JqKSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgYG9iamAgY29udGFpbmluZyBvbmx5IHRoZSBwcm9wZXJ0aWVzIGdpdmVuIGJ5IGBrZXlzYC5cbmZ1bmN0aW9uIHBpY2sob2JqLCBrZXlzKSB7XG4gIHZhciByZXN1bHQgPSB7fTtcbiAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICBpZiAoa2V5IGluIG9iaikgcmVzdWx0W2tleV0gPSBvYmpba2V5XTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vLyBNYWtlcyBhIHNoYWxsb3cgY29weSBvZiBgYXJyYCwgYW5kIGFkZHMgYG9iamAgdG8gdGhlIGVuZCBvZiB0aGUgY29weS5cbmZ1bmN0aW9uIGNvcHlBbmRQdXNoKGFyciwgb2JqKSB7XG4gIHZhciByZXN1bHQgPSBhcnIuc2xpY2UoKTtcbiAgcmVzdWx0LnB1c2gob2JqKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gSW1wbGVtZW50cyB0aGUgZGVmYXVsdCB0cmF2ZXJzYWwgc3RyYXRlZ3k6IGlmIGBvYmpgIGlzIGEgRE9NIG5vZGUsIHdhbGtcbi8vIGl0cyBET00gY2hpbGRyZW47IG90aGVyd2lzZSwgd2FsayBhbGwgdGhlIG9iamVjdHMgaXQgcmVmZXJlbmNlcy5cbmZ1bmN0aW9uIGRlZmF1bHRUcmF2ZXJzYWwob2JqKSB7XG4gIHJldHVybiBpc0VsZW1lbnQob2JqKSA/IG9iai5jaGlsZHJlbiA6IG9iajtcbn1cblxuLy8gV2FsayB0aGUgdHJlZSByZWN1cnNpdmVseSBiZWdpbm5pbmcgd2l0aCBgcm9vdGAsIGNhbGxpbmcgYGJlZm9yZUZ1bmNgXG4vLyBiZWZvcmUgdmlzaXRpbmcgYW4gb2JqZWN0cyBkZXNjZW5kZW50cywgYW5kIGBhZnRlckZ1bmNgIGFmdGVyd2FyZHMuXG4vLyBJZiBgY29sbGVjdFJlc3VsdHNgIGlzIHRydWUsIHRoZSBsYXN0IGFyZ3VtZW50IHRvIGBhZnRlckZ1bmNgIHdpbGwgYmUgYVxuLy8gY29sbGVjdGlvbiBvZiB0aGUgcmVzdWx0cyBvZiB3YWxraW5nIHRoZSBub2RlJ3Mgc3VidHJlZXMuXG5mdW5jdGlvbiB3YWxrSW1wbChyb290LCB0cmF2ZXJzYWxTdHJhdGVneSwgYmVmb3JlRnVuYywgYWZ0ZXJGdW5jLCBjb250ZXh0LCBjb2xsZWN0UmVzdWx0cykge1xuICByZXR1cm4gKGZ1bmN0aW9uIF93YWxrKHN0YWNrLCB2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICBpZiAoaXNPYmplY3QodmFsdWUpICYmIHN0YWNrLmluZGV4T2YodmFsdWUpID49IDApXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBIGN5Y2xlIHdhcyBkZXRlY3RlZCBhdCAnICsgdmFsdWUpO1xuXG4gICAgaWYgKGJlZm9yZUZ1bmMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBiZWZvcmVGdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IHN0b3BXYWxrKSByZXR1cm4gc3RvcFdhbGs7XG4gICAgICBpZiAocmVzdWx0ID09PSBzdG9wUmVjdXJzaW9uKSByZXR1cm47ICAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGNvbnNpc3RlbnQtcmV0dXJuXG4gICAgfVxuXG4gICAgdmFyIHN1YlJlc3VsdHM7XG4gICAgdmFyIHRhcmdldCA9IHRyYXZlcnNhbFN0cmF0ZWd5KHZhbHVlKTtcblxuICAgIGlmIChpc09iamVjdCh0YXJnZXQpICYmIE9iamVjdC5rZXlzKHRhcmdldCkubGVuZ3RoID4gMCkge1xuICAgICAgLy8gQ29sbGVjdCByZXN1bHRzIGZyb20gc3VidHJlZXMgaW4gdGhlIHNhbWUgc2hhcGUgYXMgdGhlIHRhcmdldC5cbiAgICAgIGlmIChjb2xsZWN0UmVzdWx0cykgc3ViUmVzdWx0cyA9IEFycmF5LmlzQXJyYXkodGFyZ2V0KSA/IFtdIDoge307XG5cbiAgICAgIHZhciBvayA9IGVhY2godGFyZ2V0LCBmdW5jdGlvbihvYmosIGtleSkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gX3dhbGsoY29weUFuZFB1c2goc3RhY2ssIHZhbHVlKSwgb2JqLCBrZXksIHZhbHVlKTtcbiAgICAgICAgaWYgKHJlc3VsdCA9PT0gc3RvcFdhbGspIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHN1YlJlc3VsdHMpIHN1YlJlc3VsdHNba2V5XSA9IHJlc3VsdDtcbiAgICAgIH0pO1xuICAgICAgaWYgKCFvaykgcmV0dXJuIHN0b3BXYWxrO1xuICAgIH1cbiAgICBpZiAoYWZ0ZXJGdW5jKSByZXR1cm4gYWZ0ZXJGdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50LCBzdWJSZXN1bHRzKTtcbiAgfSkoW10sIHJvb3QpO1xufVxuXG4vLyBJbnRlcm5hbCBoZWxwZXIgcHJvdmlkaW5nIHRoZSBpbXBsZW1lbnRhdGlvbiBmb3IgYHBsdWNrYCBhbmQgYHBsdWNrUmVjYC5cbmZ1bmN0aW9uIHBsdWNrKG9iaiwgcHJvcGVydHlOYW1lLCByZWN1cnNpdmUpIHtcbiAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgdGhpcy5wcmVvcmRlcihvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoIXJlY3Vyc2l2ZSAmJiBrZXkgPT09IHByb3BlcnR5TmFtZSlcbiAgICAgIHJldHVybiBzdG9wUmVjdXJzaW9uO1xuICAgIGlmIChoYXNPd25Qcm9wLmNhbGwodmFsdWUsIHByb3BlcnR5TmFtZSkpXG4gICAgICByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IHZhbHVlW3Byb3BlcnR5TmFtZV07XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gZGVmaW5lRW51bWVyYWJsZVByb3BlcnR5KG9iaiwgcHJvcE5hbWUsIGdldHRlckZuKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3BOYW1lLCB7XG4gICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICBnZXQ6IGdldHRlckZuXG4gIH0pO1xufVxuXG4vLyBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSB3YWxrIGZ1bmN0aW9ucy4gSWYgYHRyYXZlcnNhbFN0cmF0ZWd5YFxuLy8gaXMgc3BlY2lmaWVkLCBpdCBpcyBhIGZ1bmN0aW9uIGRldGVybWluaW5nIGhvdyBvYmplY3RzIHNob3VsZCBiZVxuLy8gdHJhdmVyc2VkLiBHaXZlbiBhbiBvYmplY3QsIGl0IHJldHVybnMgdGhlIG9iamVjdCB0byBiZSByZWN1cnNpdmVseVxuLy8gd2Fsa2VkLiBUaGUgZGVmYXVsdCBzdHJhdGVneSBpcyBlcXVpdmFsZW50IHRvIGBfLmlkZW50aXR5YCBmb3IgcmVndWxhclxuLy8gb2JqZWN0cywgYW5kIGZvciBET00gbm9kZXMgaXQgcmV0dXJucyB0aGUgbm9kZSdzIERPTSBjaGlsZHJlbi5cbmZ1bmN0aW9uIFdhbGtlcih0cmF2ZXJzYWxTdHJhdGVneSkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgV2Fsa2VyKSlcbiAgICByZXR1cm4gbmV3IFdhbGtlcih0cmF2ZXJzYWxTdHJhdGVneSk7XG5cbiAgLy8gVGhlcmUgYXJlIHR3byBkaWZmZXJlbnQgc3RyYXRlZ3kgc2hvcnRoYW5kczogaWYgYSBzaW5nbGUgc3RyaW5nIGlzXG4gIC8vIHNwZWNpZmllZCwgdHJlYXQgdGhlIHZhbHVlIG9mIHRoYXQgcHJvcGVydHkgYXMgdGhlIHRyYXZlcnNhbCB0YXJnZXQuXG4gIC8vIElmIGFuIGFycmF5IGlzIHNwZWNpZmllZCwgdGhlIHRyYXZlcnNhbCB0YXJnZXQgaXMgdGhlIG5vZGUgaXRzZWxmLCBidXRcbiAgLy8gb25seSB0aGUgcHJvcGVydGllcyBjb250YWluZWQgaW4gdGhlIGFycmF5IHdpbGwgYmUgdHJhdmVyc2VkLlxuICBpZiAoaXNTdHJpbmcodHJhdmVyc2FsU3RyYXRlZ3kpKSB7XG4gICAgdmFyIHByb3AgPSB0cmF2ZXJzYWxTdHJhdGVneTtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIGlmIChpc09iamVjdChub2RlKSAmJiBwcm9wIGluIG5vZGUpIHJldHVybiBub2RlW3Byb3BdO1xuICAgIH07XG4gIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh0cmF2ZXJzYWxTdHJhdGVneSkpIHtcbiAgICB2YXIgcHJvcHMgPSB0cmF2ZXJzYWxTdHJhdGVneTtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIGlmIChpc09iamVjdChub2RlKSkgcmV0dXJuIHBpY2sobm9kZSwgcHJvcHMpO1xuICAgIH07XG4gIH1cbiAgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3kgPSB0cmF2ZXJzYWxTdHJhdGVneSB8fCBkZWZhdWx0VHJhdmVyc2FsO1xufVxuXG5leHRlbmQoV2Fsa2VyLnByb3RvdHlwZSwge1xuICAvLyBQZXJmb3JtcyBhIHByZW9yZGVyIHRyYXZlcnNhbCBvZiBgb2JqYCBhbmQgcmV0dXJucyB0aGUgZmlyc3QgdmFsdWVcbiAgLy8gd2hpY2ggcGFzc2VzIGEgdHJ1dGggdGVzdC5cbiAgZmluZDogZnVuY3Rpb24ob2JqLCB2aXNpdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdDtcbiAgICB0aGlzLnByZW9yZGVyKG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICBpZiAodmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCkpIHtcbiAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBzdG9wV2FsaztcbiAgICAgIH1cbiAgICB9LCBjb250ZXh0KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBhbmQgcmV0dXJucyBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgcGFzcyBhXG4gIC8vIHRydXRoIHRlc3QuIGBzdHJhdGVneWAgaXMgdGhlIHRyYXZlcnNhbCBmdW5jdGlvbiB0byB1c2UsIGUuZy4gYHByZW9yZGVyYFxuICAvLyBvciBgcG9zdG9yZGVyYC5cbiAgZmlsdGVyOiBmdW5jdGlvbihvYmosIHN0cmF0ZWd5LCB2aXNpdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBpZiAob2JqID09PSBudWxsKSByZXR1cm4gcmVzdWx0cztcbiAgICBzdHJhdGVneShvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIHBhcmVudCkge1xuICAgICAgaWYgKHZpc2l0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQpKSByZXN1bHRzLnB1c2godmFsdWUpO1xuICAgIH0sIG51bGwsIHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSxcblxuICAvLyBSZWN1cnNpdmVseSB0cmF2ZXJzZXMgYG9iamAgYW5kIHJldHVybnMgYWxsIHRoZSBlbGVtZW50cyBmb3Igd2hpY2ggYVxuICAvLyB0cnV0aCB0ZXN0IGZhaWxzLlxuICByZWplY3Q6IGZ1bmN0aW9uKG9iaiwgc3RyYXRlZ3ksIHZpc2l0b3IsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIob2JqLCBzdHJhdGVneSwgZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICByZXR1cm4gIXZpc2l0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQpO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIFByb2R1Y2VzIGEgbmV3IGFycmF5IG9mIHZhbHVlcyBieSByZWN1cnNpdmVseSB0cmF2ZXJzaW5nIGBvYmpgIGFuZFxuICAvLyBtYXBwaW5nIGVhY2ggdmFsdWUgdGhyb3VnaCB0aGUgdHJhbnNmb3JtYXRpb24gZnVuY3Rpb24gYHZpc2l0b3JgLlxuICAvLyBgc3RyYXRlZ3lgIGlzIHRoZSB0cmF2ZXJzYWwgZnVuY3Rpb24gdG8gdXNlLCBlLmcuIGBwcmVvcmRlcmAgb3JcbiAgLy8gYHBvc3RvcmRlcmAuXG4gIG1hcDogZnVuY3Rpb24ob2JqLCBzdHJhdGVneSwgdmlzaXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgc3RyYXRlZ3kob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGhdID0gdmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgfSwgbnVsbCwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3kpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9LFxuXG4gIC8vIFJldHVybiB0aGUgdmFsdWUgb2YgcHJvcGVydGllcyBuYW1lZCBgcHJvcGVydHlOYW1lYCByZWFjaGFibGUgZnJvbSB0aGVcbiAgLy8gdHJlZSByb290ZWQgYXQgYG9iamAuIFJlc3VsdHMgYXJlIG5vdCByZWN1cnNpdmVseSBzZWFyY2hlZDsgdXNlXG4gIC8vIGBwbHVja1JlY2AgZm9yIHRoYXQuXG4gIHBsdWNrOiBmdW5jdGlvbihvYmosIHByb3BlcnR5TmFtZSkge1xuICAgIHJldHVybiBwbHVjay5jYWxsKHRoaXMsIG9iaiwgcHJvcGVydHlOYW1lLCBmYWxzZSk7XG4gIH0sXG5cbiAgLy8gVmVyc2lvbiBvZiBgcGx1Y2tgIHdoaWNoIHJlY3Vyc2l2ZWx5IHNlYXJjaGVzIHJlc3VsdHMgZm9yIG5lc3RlZCBvYmplY3RzXG4gIC8vIHdpdGggYSBwcm9wZXJ0eSBuYW1lZCBgcHJvcGVydHlOYW1lYC5cbiAgcGx1Y2tSZWM6IGZ1bmN0aW9uKG9iaiwgcHJvcGVydHlOYW1lKSB7XG4gICAgcmV0dXJuIHBsdWNrLmNhbGwodGhpcywgb2JqLCBwcm9wZXJ0eU5hbWUsIHRydWUpO1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBpbiBhIGRlcHRoLWZpcnN0IGZhc2hpb24sIGludm9raW5nIHRoZVxuICAvLyBgdmlzaXRvcmAgZnVuY3Rpb24gZm9yIGVhY2ggb2JqZWN0IG9ubHkgYWZ0ZXIgdHJhdmVyc2luZyBpdHMgY2hpbGRyZW4uXG4gIC8vIGB0cmF2ZXJzYWxTdHJhdGVneWAgaXMgaW50ZW5kZWQgZm9yIGludGVybmFsIGNhbGxlcnMsIGFuZCBpcyBub3QgcGFydFxuICAvLyBvZiB0aGUgcHVibGljIEFQSS5cbiAgcG9zdG9yZGVyOiBmdW5jdGlvbihvYmosIHZpc2l0b3IsIGNvbnRleHQsIHRyYXZlcnNhbFN0cmF0ZWd5KSB7XG4gICAgdHJhdmVyc2FsU3RyYXRlZ3kgPSB0cmF2ZXJzYWxTdHJhdGVneSB8fCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneTtcbiAgICB3YWxrSW1wbChvYmosIHRyYXZlcnNhbFN0cmF0ZWd5LCBudWxsLCB2aXNpdG9yLCBjb250ZXh0KTtcbiAgfSxcblxuICAvLyBSZWN1cnNpdmVseSB0cmF2ZXJzZXMgYG9iamAgaW4gYSBkZXB0aC1maXJzdCBmYXNoaW9uLCBpbnZva2luZyB0aGVcbiAgLy8gYHZpc2l0b3JgIGZ1bmN0aW9uIGZvciBlYWNoIG9iamVjdCBiZWZvcmUgdHJhdmVyc2luZyBpdHMgY2hpbGRyZW4uXG4gIC8vIGB0cmF2ZXJzYWxTdHJhdGVneWAgaXMgaW50ZW5kZWQgZm9yIGludGVybmFsIGNhbGxlcnMsIGFuZCBpcyBub3QgcGFydFxuICAvLyBvZiB0aGUgcHVibGljIEFQSS5cbiAgcHJlb3JkZXI6IGZ1bmN0aW9uKG9iaiwgdmlzaXRvciwgY29udGV4dCwgdHJhdmVyc2FsU3RyYXRlZ3kpIHtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IHRyYXZlcnNhbFN0cmF0ZWd5IHx8IHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5O1xuICAgIHdhbGtJbXBsKG9iaiwgdHJhdmVyc2FsU3RyYXRlZ3ksIHZpc2l0b3IsIG51bGwsIGNvbnRleHQpO1xuICB9LFxuXG4gIC8vIEJ1aWxkcyB1cCBhIHNpbmdsZSB2YWx1ZSBieSBkb2luZyBhIHBvc3Qtb3JkZXIgdHJhdmVyc2FsIG9mIGBvYmpgIGFuZFxuICAvLyBjYWxsaW5nIHRoZSBgdmlzaXRvcmAgZnVuY3Rpb24gb24gZWFjaCBvYmplY3QgaW4gdGhlIHRyZWUuIEZvciBsZWFmXG4gIC8vIG9iamVjdHMsIHRoZSBgbWVtb2AgYXJndW1lbnQgdG8gYHZpc2l0b3JgIGlzIHRoZSB2YWx1ZSBvZiB0aGUgYGxlYWZNZW1vYFxuICAvLyBhcmd1bWVudCB0byBgcmVkdWNlYC4gRm9yIG5vbi1sZWFmIG9iamVjdHMsIGBtZW1vYCBpcyBhIGNvbGxlY3Rpb24gb2ZcbiAgLy8gdGhlIHJlc3VsdHMgb2YgY2FsbGluZyBgcmVkdWNlYCBvbiB0aGUgb2JqZWN0J3MgY2hpbGRyZW4uXG4gIHJlZHVjZTogZnVuY3Rpb24ob2JqLCB2aXNpdG9yLCBsZWFmTWVtbywgY29udGV4dCkge1xuICAgIHZhciByZWR1Y2VyID0gZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50LCBzdWJSZXN1bHRzKSB7XG4gICAgICByZXR1cm4gdmlzaXRvcihzdWJSZXN1bHRzIHx8IGxlYWZNZW1vLCB2YWx1ZSwga2V5LCBwYXJlbnQpO1xuICAgIH07XG4gICAgcmV0dXJuIHdhbGtJbXBsKG9iaiwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3ksIG51bGwsIHJlZHVjZXIsIGNvbnRleHQsIHRydWUpO1xuICB9LFxuXG4gIC8vIEFuICdhdHRyaWJ1dGUnIGlzIGEgdmFsdWUgdGhhdCBpcyBjYWxjdWxhdGVkIGJ5IGludm9raW5nIGEgdmlzaXRvclxuICAvLyBmdW5jdGlvbiBvbiBhIG5vZGUuIFRoZSBmaXJzdCBhcmd1bWVudCBvZiB0aGUgdmlzaXRvciBpcyBhIGNvbGxlY3Rpb25cbiAgLy8gb2YgdGhlIGF0dHJpYnV0ZSB2YWx1ZXMgZm9yIHRoZSBub2RlJ3MgY2hpbGRyZW4uIFRoZXNlIGFyZSBjYWxjdWxhdGVkXG4gIC8vIGxhemlseSAtLSBpbiB0aGlzIHdheSB0aGUgdmlzaXRvciBjYW4gZGVjaWRlIGluIHdoYXQgb3JkZXIgdG8gdmlzaXQgdGhlXG4gIC8vIHN1YnRyZWVzLlxuICBjcmVhdGVBdHRyaWJ1dGU6IGZ1bmN0aW9uKHZpc2l0b3IsIGRlZmF1bHRWYWx1ZSwgY29udGV4dCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgbWVtbyA9IG5ldyBXZWFrTWFwKCk7XG4gICAgZnVuY3Rpb24gX3Zpc2l0KHN0YWNrLCB2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIGlmIChpc09iamVjdCh2YWx1ZSkgJiYgc3RhY2suaW5kZXhPZih2YWx1ZSkgPj0gMClcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQSBjeWNsZSB3YXMgZGV0ZWN0ZWQgYXQgJyArIHZhbHVlKTtcblxuICAgICAgaWYgKG1lbW8uaGFzKHZhbHVlKSlcbiAgICAgICAgcmV0dXJuIG1lbW8uZ2V0KHZhbHVlKTtcblxuICAgICAgdmFyIHN1YlJlc3VsdHM7XG4gICAgICB2YXIgdGFyZ2V0ID0gc2VsZi5fdHJhdmVyc2FsU3RyYXRlZ3kodmFsdWUpO1xuICAgICAgaWYgKGlzT2JqZWN0KHRhcmdldCkgJiYgT2JqZWN0LmtleXModGFyZ2V0KS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHN1YlJlc3VsdHMgPSB7fTtcbiAgICAgICAgZWFjaCh0YXJnZXQsIGZ1bmN0aW9uKGNoaWxkLCBrKSB7XG4gICAgICAgICAgZGVmaW5lRW51bWVyYWJsZVByb3BlcnR5KHN1YlJlc3VsdHMsIGssIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIF92aXNpdChjb3B5QW5kUHVzaChzdGFjaywgdmFsdWUpLCBjaGlsZCwgaywgdmFsdWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHZhciByZXN1bHQgPSB2aXNpdG9yLmNhbGwoY29udGV4dCwgc3ViUmVzdWx0cywgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICAgIG1lbW8uc2V0KHZhbHVlLCByZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikgeyByZXR1cm4gX3Zpc2l0KFtdLCBvYmopOyB9O1xuICB9XG59KTtcblxudmFyIFdhbGtlclByb3RvID0gV2Fsa2VyLnByb3RvdHlwZTtcblxuLy8gU2V0IHVwIGEgZmV3IGNvbnZlbmllbnQgYWxpYXNlcy5cbldhbGtlclByb3RvLmVhY2ggPSBXYWxrZXJQcm90by5wcmVvcmRlcjtcbldhbGtlclByb3RvLmNvbGxlY3QgPSBXYWxrZXJQcm90by5tYXA7XG5XYWxrZXJQcm90by5kZXRlY3QgPSBXYWxrZXJQcm90by5maW5kO1xuV2Fsa2VyUHJvdG8uc2VsZWN0ID0gV2Fsa2VyUHJvdG8uZmlsdGVyO1xuXG4vLyBFeHBvcnQgdGhlIHdhbGtlciBjb25zdHJ1Y3RvciwgYnV0IG1ha2UgaXQgYmVoYXZlIGxpa2UgYW4gaW5zdGFuY2UuXG5XYWxrZXIuX3RyYXZlcnNhbFN0cmF0ZWd5ID0gZGVmYXVsdFRyYXZlcnNhbDtcbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kKFdhbGtlciwgV2Fsa2VyUHJvdG8pO1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kO1xuZnVuY3Rpb24gZXh0ZW5kKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgdHlwZW9mIGFkZCAhPT0gJ29iamVjdCcpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59XG4iLCIvKlxuICogQ29weXJpZ2h0IDIwMTIgVGhlIFBvbHltZXIgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGEgQlNELXN0eWxlXG4gKiBsaWNlbnNlIHRoYXQgY2FuIGJlIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUuXG4gKi9cblxuaWYgKHR5cGVvZiBXZWFrTWFwID09PSAndW5kZWZpbmVkJykge1xuICAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRlZmluZVByb3BlcnR5ID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuICAgIHZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcblxuICAgIHZhciBXZWFrTWFwID0gZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLm5hbWUgPSAnX19zdCcgKyAoTWF0aC5yYW5kb20oKSAqIDFlOSA+Pj4gMCkgKyAoY291bnRlcisrICsgJ19fJyk7XG4gICAgfTtcblxuICAgIFdlYWtNYXAucHJvdG90eXBlID0ge1xuICAgICAgc2V0OiBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICBpZiAoZW50cnkgJiYgZW50cnlbMF0gPT09IGtleSlcbiAgICAgICAgICBlbnRyeVsxXSA9IHZhbHVlO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgZGVmaW5lUHJvcGVydHkoa2V5LCB0aGlzLm5hbWUsIHt2YWx1ZTogW2tleSwgdmFsdWVdLCB3cml0YWJsZTogdHJ1ZX0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0sXG4gICAgICBnZXQ6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZW50cnk7XG4gICAgICAgIHJldHVybiAoZW50cnkgPSBrZXlbdGhpcy5uYW1lXSkgJiYgZW50cnlbMF0gPT09IGtleSA/XG4gICAgICAgICAgICBlbnRyeVsxXSA6IHVuZGVmaW5lZDtcbiAgICAgIH0sXG4gICAgICBkZWxldGU6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgICAgaWYgKCFlbnRyeSB8fCBlbnRyeVswXSAhPT0ga2V5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGVudHJ5WzBdID0gZW50cnlbMV0gPSB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSxcbiAgICAgIGhhczogZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiBlbnRyeVswXSA9PT0ga2V5O1xuICAgICAgfVxuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IFdlYWtNYXA7XG4gIH0pKCk7XG59IGVsc2Uge1xuICBtb2R1bGUuZXhwb3J0cyA9IFdlYWtNYXA7XG59XG4iXX0=
