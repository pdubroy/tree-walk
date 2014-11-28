!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.treeWalker=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Copyright (c) 2014 Patrick Dubroy <pdubroy@gmail.com>
// This software is distributed under the terms of the MIT License.

/* global -WeakMap */

var extend = require('util-extend'),
    WeakMap = require('./third_party/WeakMap');

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
      if (result === stopRecursion) return;
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
    if (!recursive && key == propertyName)
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
            return _visit(copyAndPush(stack,value), child, k, value);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvaW5kZXguanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvbm9kZV9tb2R1bGVzL3V0aWwtZXh0ZW5kL2V4dGVuZC5qcyIsIi9Vc2Vycy9kdWJyb3kvZGV2L3RyZWUtd2Fsay90aGlyZF9wYXJ0eS9XZWFrTWFwL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gQ29weXJpZ2h0IChjKSAyMDE0IFBhdHJpY2sgRHVicm95IDxwZHVicm95QGdtYWlsLmNvbT5cbi8vIFRoaXMgc29mdHdhcmUgaXMgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBNSVQgTGljZW5zZS5cblxuLyogZ2xvYmFsIC1XZWFrTWFwICovXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCd1dGlsLWV4dGVuZCcpLFxuICAgIFdlYWtNYXAgPSByZXF1aXJlKCcuL3RoaXJkX3BhcnR5L1dlYWtNYXAnKTtcblxuLy8gQW4gaW50ZXJuYWwgb2JqZWN0IHRoYXQgY2FuIGJlIHJldHVybmVkIGZyb20gYSB2aXNpdG9yIGZ1bmN0aW9uIHRvXG4vLyBwcmV2ZW50IGEgdG9wLWRvd24gd2FsayBmcm9tIHdhbGtpbmcgc3VidHJlZXMgb2YgYSBub2RlLlxudmFyIHN0b3BSZWN1cnNpb24gPSB7fTtcblxuLy8gQW4gaW50ZXJuYWwgb2JqZWN0IHRoYXQgY2FuIGJlIHJldHVybmVkIGZyb20gYSB2aXNpdG9yIGZ1bmN0aW9uIHRvXG4vLyBjYXVzZSB0aGUgd2FsayB0byBpbW1lZGlhdGVseSBzdG9wLlxudmFyIHN0b3BXYWxrID0ge307XG5cbnZhciBoYXNPd25Qcm9wID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gSGVscGVyc1xuLy8gLS0tLS0tLVxuXG5mdW5jdGlvbiBpc0VsZW1lbnQob2JqKSB7XG4gIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3Qob2JqKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIG9iajtcbiAgcmV0dXJuIHR5cGUgPT09ICdmdW5jdGlvbicgfHwgdHlwZSA9PT0gJ29iamVjdCcgJiYgISFvYmo7XG59XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKG9iaikge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IFN0cmluZ10nO1xufVxuXG5mdW5jdGlvbiBlYWNoKG9iaiwgcHJlZGljYXRlKSB7XG4gIGZvciAodmFyIGsgaW4gb2JqKSB7XG4gICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrKSkge1xuICAgICAgaWYgKHByZWRpY2F0ZShvYmpba10sIGssIG9iaikpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIFJldHVybnMgYSBjb3B5IG9mIGBvYmpgIGNvbnRhaW5pbmcgb25seSB0aGUgcHJvcGVydGllcyBnaXZlbiBieSBga2V5c2AuXG5mdW5jdGlvbiBwaWNrKG9iaiwga2V5cykge1xuICB2YXIgcmVzdWx0ID0ge307XG4gIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgaWYgKGtleSBpbiBvYmopIHJlc3VsdFtrZXldID0gb2JqW2tleV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gTWFrZXMgYSBzaGFsbG93IGNvcHkgb2YgYGFycmAsIGFuZCBhZGRzIGBvYmpgIHRvIHRoZSBlbmQgb2YgdGhlIGNvcHkuXG5mdW5jdGlvbiBjb3B5QW5kUHVzaChhcnIsIG9iaikge1xuICB2YXIgcmVzdWx0ID0gYXJyLnNsaWNlKCk7XG4gIHJlc3VsdC5wdXNoKG9iaik7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8vIEltcGxlbWVudHMgdGhlIGRlZmF1bHQgdHJhdmVyc2FsIHN0cmF0ZWd5OiBpZiBgb2JqYCBpcyBhIERPTSBub2RlLCB3YWxrXG4vLyBpdHMgRE9NIGNoaWxkcmVuOyBvdGhlcndpc2UsIHdhbGsgYWxsIHRoZSBvYmplY3RzIGl0IHJlZmVyZW5jZXMuXG5mdW5jdGlvbiBkZWZhdWx0VHJhdmVyc2FsKG9iaikge1xuICByZXR1cm4gaXNFbGVtZW50KG9iaikgPyBvYmouY2hpbGRyZW4gOiBvYmo7XG59XG5cbi8vIFdhbGsgdGhlIHRyZWUgcmVjdXJzaXZlbHkgYmVnaW5uaW5nIHdpdGggYHJvb3RgLCBjYWxsaW5nIGBiZWZvcmVGdW5jYFxuLy8gYmVmb3JlIHZpc2l0aW5nIGFuIG9iamVjdHMgZGVzY2VuZGVudHMsIGFuZCBgYWZ0ZXJGdW5jYCBhZnRlcndhcmRzLlxuLy8gSWYgYGNvbGxlY3RSZXN1bHRzYCBpcyB0cnVlLCB0aGUgbGFzdCBhcmd1bWVudCB0byBgYWZ0ZXJGdW5jYCB3aWxsIGJlIGFcbi8vIGNvbGxlY3Rpb24gb2YgdGhlIHJlc3VsdHMgb2Ygd2Fsa2luZyB0aGUgbm9kZSdzIHN1YnRyZWVzLlxuZnVuY3Rpb24gd2Fsa0ltcGwocm9vdCwgdHJhdmVyc2FsU3RyYXRlZ3ksIGJlZm9yZUZ1bmMsIGFmdGVyRnVuYywgY29udGV4dCwgY29sbGVjdFJlc3VsdHMpIHtcbiAgcmV0dXJuIChmdW5jdGlvbiBfd2FsayhzdGFjaywgdmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgaWYgKGlzT2JqZWN0KHZhbHVlKSAmJiBzdGFjay5pbmRleE9mKHZhbHVlKSA+PSAwKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQSBjeWNsZSB3YXMgZGV0ZWN0ZWQgYXQgJyArIHZhbHVlKTtcblxuICAgIGlmIChiZWZvcmVGdW5jKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gYmVmb3JlRnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgICBpZiAocmVzdWx0ID09PSBzdG9wV2FsaykgcmV0dXJuIHN0b3BXYWxrO1xuICAgICAgaWYgKHJlc3VsdCA9PT0gc3RvcFJlY3Vyc2lvbikgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBzdWJSZXN1bHRzO1xuICAgIHZhciB0YXJnZXQgPSB0cmF2ZXJzYWxTdHJhdGVneSh2YWx1ZSk7XG5cbiAgICBpZiAoaXNPYmplY3QodGFyZ2V0KSAmJiBPYmplY3Qua2V5cyh0YXJnZXQpLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIENvbGxlY3QgcmVzdWx0cyBmcm9tIHN1YnRyZWVzIGluIHRoZSBzYW1lIHNoYXBlIGFzIHRoZSB0YXJnZXQuXG4gICAgICBpZiAoY29sbGVjdFJlc3VsdHMpIHN1YlJlc3VsdHMgPSBBcnJheS5pc0FycmF5KHRhcmdldCkgPyBbXSA6IHt9O1xuXG4gICAgICB2YXIgb2sgPSBlYWNoKHRhcmdldCwgZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IF93YWxrKGNvcHlBbmRQdXNoKHN0YWNrLCB2YWx1ZSksIG9iaiwga2V5LCB2YWx1ZSk7XG4gICAgICAgIGlmIChyZXN1bHQgPT09IHN0b3BXYWxrKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChzdWJSZXN1bHRzKSBzdWJSZXN1bHRzW2tleV0gPSByZXN1bHQ7XG4gICAgICB9KTtcbiAgICAgIGlmICghb2spIHJldHVybiBzdG9wV2FsaztcbiAgICB9XG4gICAgaWYgKGFmdGVyRnVuYykgcmV0dXJuIGFmdGVyRnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCwgc3ViUmVzdWx0cyk7XG4gIH0pKFtdLCByb290KTtcbn1cblxuLy8gSW50ZXJuYWwgaGVscGVyIHByb3ZpZGluZyB0aGUgaW1wbGVtZW50YXRpb24gZm9yIGBwbHVja2AgYW5kIGBwbHVja1JlY2AuXG5mdW5jdGlvbiBwbHVjayhvYmosIHByb3BlcnR5TmFtZSwgcmVjdXJzaXZlKSB7XG4gIHZhciByZXN1bHRzID0gW107XG4gIHRoaXMucHJlb3JkZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgaWYgKCFyZWN1cnNpdmUgJiYga2V5ID09IHByb3BlcnR5TmFtZSlcbiAgICAgIHJldHVybiBzdG9wUmVjdXJzaW9uO1xuICAgIGlmIChoYXNPd25Qcm9wLmNhbGwodmFsdWUsIHByb3BlcnR5TmFtZSkpXG4gICAgICByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IHZhbHVlW3Byb3BlcnR5TmFtZV07XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gZGVmaW5lRW51bWVyYWJsZVByb3BlcnR5KG9iaiwgcHJvcE5hbWUsIGdldHRlckZuKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3BOYW1lLCB7XG4gICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICBnZXQ6IGdldHRlckZuXG4gIH0pO1xufVxuXG4vLyBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSB3YWxrIGZ1bmN0aW9ucy4gSWYgYHRyYXZlcnNhbFN0cmF0ZWd5YFxuLy8gaXMgc3BlY2lmaWVkLCBpdCBpcyBhIGZ1bmN0aW9uIGRldGVybWluaW5nIGhvdyBvYmplY3RzIHNob3VsZCBiZVxuLy8gdHJhdmVyc2VkLiBHaXZlbiBhbiBvYmplY3QsIGl0IHJldHVybnMgdGhlIG9iamVjdCB0byBiZSByZWN1cnNpdmVseVxuLy8gd2Fsa2VkLiBUaGUgZGVmYXVsdCBzdHJhdGVneSBpcyBlcXVpdmFsZW50IHRvIGBfLmlkZW50aXR5YCBmb3IgcmVndWxhclxuLy8gb2JqZWN0cywgYW5kIGZvciBET00gbm9kZXMgaXQgcmV0dXJucyB0aGUgbm9kZSdzIERPTSBjaGlsZHJlbi5cbmZ1bmN0aW9uIFdhbGtlcih0cmF2ZXJzYWxTdHJhdGVneSkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgV2Fsa2VyKSlcbiAgICByZXR1cm4gbmV3IFdhbGtlcih0cmF2ZXJzYWxTdHJhdGVneSk7XG5cbiAgLy8gVGhlcmUgYXJlIHR3byBkaWZmZXJlbnQgc3RyYXRlZ3kgc2hvcnRoYW5kczogaWYgYSBzaW5nbGUgc3RyaW5nIGlzXG4gIC8vIHNwZWNpZmllZCwgdHJlYXQgdGhlIHZhbHVlIG9mIHRoYXQgcHJvcGVydHkgYXMgdGhlIHRyYXZlcnNhbCB0YXJnZXQuXG4gIC8vIElmIGFuIGFycmF5IGlzIHNwZWNpZmllZCwgdGhlIHRyYXZlcnNhbCB0YXJnZXQgaXMgdGhlIG5vZGUgaXRzZWxmLCBidXRcbiAgLy8gb25seSB0aGUgcHJvcGVydGllcyBjb250YWluZWQgaW4gdGhlIGFycmF5IHdpbGwgYmUgdHJhdmVyc2VkLlxuICBpZiAoaXNTdHJpbmcodHJhdmVyc2FsU3RyYXRlZ3kpKSB7XG4gICAgdmFyIHByb3AgPSB0cmF2ZXJzYWxTdHJhdGVneTtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIGlmIChpc09iamVjdChub2RlKSAmJiBwcm9wIGluIG5vZGUpIHJldHVybiBub2RlW3Byb3BdO1xuICAgIH07XG4gIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh0cmF2ZXJzYWxTdHJhdGVneSkpIHtcbiAgICB2YXIgcHJvcHMgPSB0cmF2ZXJzYWxTdHJhdGVneTtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIGlmIChpc09iamVjdChub2RlKSkgcmV0dXJuIHBpY2sobm9kZSwgcHJvcHMpO1xuICAgIH07XG4gIH1cbiAgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3kgPSB0cmF2ZXJzYWxTdHJhdGVneSB8fCBkZWZhdWx0VHJhdmVyc2FsO1xufVxuXG5leHRlbmQoV2Fsa2VyLnByb3RvdHlwZSwge1xuICAvLyBQZXJmb3JtcyBhIHByZW9yZGVyIHRyYXZlcnNhbCBvZiBgb2JqYCBhbmQgcmV0dXJucyB0aGUgZmlyc3QgdmFsdWVcbiAgLy8gd2hpY2ggcGFzc2VzIGEgdHJ1dGggdGVzdC5cbiAgZmluZDogZnVuY3Rpb24ob2JqLCB2aXNpdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdDtcbiAgICB0aGlzLnByZW9yZGVyKG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICBpZiAodmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCkpIHtcbiAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIHJldHVybiBzdG9wV2FsaztcbiAgICAgIH1cbiAgICB9LCBjb250ZXh0KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBhbmQgcmV0dXJucyBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgcGFzcyBhXG4gIC8vIHRydXRoIHRlc3QuIGBzdHJhdGVneWAgaXMgdGhlIHRyYXZlcnNhbCBmdW5jdGlvbiB0byB1c2UsIGUuZy4gYHByZW9yZGVyYFxuICAvLyBvciBgcG9zdG9yZGVyYC5cbiAgZmlsdGVyOiBmdW5jdGlvbihvYmosIHN0cmF0ZWd5LCB2aXNpdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBpZiAob2JqID09PSBudWxsKSByZXR1cm4gcmVzdWx0cztcbiAgICBzdHJhdGVneShvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIHBhcmVudCkge1xuICAgICAgaWYgKHZpc2l0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQpKSByZXN1bHRzLnB1c2godmFsdWUpO1xuICAgIH0sIG51bGwsIHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSxcblxuICAvLyBSZWN1cnNpdmVseSB0cmF2ZXJzZXMgYG9iamAgYW5kIHJldHVybnMgYWxsIHRoZSBlbGVtZW50cyBmb3Igd2hpY2ggYVxuICAvLyB0cnV0aCB0ZXN0IGZhaWxzLlxuICByZWplY3Q6IGZ1bmN0aW9uKG9iaiwgc3RyYXRlZ3ksIHZpc2l0b3IsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIob2JqLCBzdHJhdGVneSwgZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICByZXR1cm4gIXZpc2l0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQpO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIFByb2R1Y2VzIGEgbmV3IGFycmF5IG9mIHZhbHVlcyBieSByZWN1cnNpdmVseSB0cmF2ZXJzaW5nIGBvYmpgIGFuZFxuICAvLyBtYXBwaW5nIGVhY2ggdmFsdWUgdGhyb3VnaCB0aGUgdHJhbnNmb3JtYXRpb24gZnVuY3Rpb24gYHZpc2l0b3JgLlxuICAvLyBgc3RyYXRlZ3lgIGlzIHRoZSB0cmF2ZXJzYWwgZnVuY3Rpb24gdG8gdXNlLCBlLmcuIGBwcmVvcmRlcmAgb3JcbiAgLy8gYHBvc3RvcmRlcmAuXG4gIG1hcDogZnVuY3Rpb24ob2JqLCBzdHJhdGVneSwgdmlzaXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgc3RyYXRlZ3kob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIHJlc3VsdHNbcmVzdWx0cy5sZW5ndGhdID0gdmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgfSwgbnVsbCwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3kpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9LFxuXG4gIC8vIFJldHVybiB0aGUgdmFsdWUgb2YgcHJvcGVydGllcyBuYW1lZCBgcHJvcGVydHlOYW1lYCByZWFjaGFibGUgZnJvbSB0aGVcbiAgLy8gdHJlZSByb290ZWQgYXQgYG9iamAuIFJlc3VsdHMgYXJlIG5vdCByZWN1cnNpdmVseSBzZWFyY2hlZDsgdXNlXG4gIC8vIGBwbHVja1JlY2AgZm9yIHRoYXQuXG4gIHBsdWNrOiBmdW5jdGlvbihvYmosIHByb3BlcnR5TmFtZSkge1xuICAgIHJldHVybiBwbHVjay5jYWxsKHRoaXMsIG9iaiwgcHJvcGVydHlOYW1lLCBmYWxzZSk7XG4gIH0sXG5cbiAgLy8gVmVyc2lvbiBvZiBgcGx1Y2tgIHdoaWNoIHJlY3Vyc2l2ZWx5IHNlYXJjaGVzIHJlc3VsdHMgZm9yIG5lc3RlZCBvYmplY3RzXG4gIC8vIHdpdGggYSBwcm9wZXJ0eSBuYW1lZCBgcHJvcGVydHlOYW1lYC5cbiAgcGx1Y2tSZWM6IGZ1bmN0aW9uKG9iaiwgcHJvcGVydHlOYW1lKSB7XG4gICAgcmV0dXJuIHBsdWNrLmNhbGwodGhpcywgb2JqLCBwcm9wZXJ0eU5hbWUsIHRydWUpO1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBpbiBhIGRlcHRoLWZpcnN0IGZhc2hpb24sIGludm9raW5nIHRoZVxuICAvLyBgdmlzaXRvcmAgZnVuY3Rpb24gZm9yIGVhY2ggb2JqZWN0IG9ubHkgYWZ0ZXIgdHJhdmVyc2luZyBpdHMgY2hpbGRyZW4uXG4gIC8vIGB0cmF2ZXJzYWxTdHJhdGVneWAgaXMgaW50ZW5kZWQgZm9yIGludGVybmFsIGNhbGxlcnMsIGFuZCBpcyBub3QgcGFydFxuICAvLyBvZiB0aGUgcHVibGljIEFQSS5cbiAgcG9zdG9yZGVyOiBmdW5jdGlvbihvYmosIHZpc2l0b3IsIGNvbnRleHQsIHRyYXZlcnNhbFN0cmF0ZWd5KSB7XG4gICAgdHJhdmVyc2FsU3RyYXRlZ3kgPSB0cmF2ZXJzYWxTdHJhdGVneSB8fCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneTtcbiAgICB3YWxrSW1wbChvYmosIHRyYXZlcnNhbFN0cmF0ZWd5LCBudWxsLCB2aXNpdG9yLCBjb250ZXh0KTtcbiAgfSxcblxuICAvLyBSZWN1cnNpdmVseSB0cmF2ZXJzZXMgYG9iamAgaW4gYSBkZXB0aC1maXJzdCBmYXNoaW9uLCBpbnZva2luZyB0aGVcbiAgLy8gYHZpc2l0b3JgIGZ1bmN0aW9uIGZvciBlYWNoIG9iamVjdCBiZWZvcmUgdHJhdmVyc2luZyBpdHMgY2hpbGRyZW4uXG4gIC8vIGB0cmF2ZXJzYWxTdHJhdGVneWAgaXMgaW50ZW5kZWQgZm9yIGludGVybmFsIGNhbGxlcnMsIGFuZCBpcyBub3QgcGFydFxuICAvLyBvZiB0aGUgcHVibGljIEFQSS5cbiAgcHJlb3JkZXI6IGZ1bmN0aW9uKG9iaiwgdmlzaXRvciwgY29udGV4dCwgdHJhdmVyc2FsU3RyYXRlZ3kpIHtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IHRyYXZlcnNhbFN0cmF0ZWd5IHx8IHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5O1xuICAgIHdhbGtJbXBsKG9iaiwgdHJhdmVyc2FsU3RyYXRlZ3ksIHZpc2l0b3IsIG51bGwsIGNvbnRleHQpO1xuICB9LFxuXG4gIC8vIEJ1aWxkcyB1cCBhIHNpbmdsZSB2YWx1ZSBieSBkb2luZyBhIHBvc3Qtb3JkZXIgdHJhdmVyc2FsIG9mIGBvYmpgIGFuZFxuICAvLyBjYWxsaW5nIHRoZSBgdmlzaXRvcmAgZnVuY3Rpb24gb24gZWFjaCBvYmplY3QgaW4gdGhlIHRyZWUuIEZvciBsZWFmXG4gIC8vIG9iamVjdHMsIHRoZSBgbWVtb2AgYXJndW1lbnQgdG8gYHZpc2l0b3JgIGlzIHRoZSB2YWx1ZSBvZiB0aGUgYGxlYWZNZW1vYFxuICAvLyBhcmd1bWVudCB0byBgcmVkdWNlYC4gRm9yIG5vbi1sZWFmIG9iamVjdHMsIGBtZW1vYCBpcyBhIGNvbGxlY3Rpb24gb2ZcbiAgLy8gdGhlIHJlc3VsdHMgb2YgY2FsbGluZyBgcmVkdWNlYCBvbiB0aGUgb2JqZWN0J3MgY2hpbGRyZW4uXG4gIHJlZHVjZTogZnVuY3Rpb24ob2JqLCB2aXNpdG9yLCBsZWFmTWVtbywgY29udGV4dCkge1xuICAgIHZhciByZWR1Y2VyID0gZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50LCBzdWJSZXN1bHRzKSB7XG4gICAgICByZXR1cm4gdmlzaXRvcihzdWJSZXN1bHRzIHx8IGxlYWZNZW1vLCB2YWx1ZSwga2V5LCBwYXJlbnQpO1xuICAgIH07XG4gICAgcmV0dXJuIHdhbGtJbXBsKG9iaiwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3ksIG51bGwsIHJlZHVjZXIsIGNvbnRleHQsIHRydWUpO1xuICB9LFxuXG4gIC8vIEFuICdhdHRyaWJ1dGUnIGlzIGEgdmFsdWUgdGhhdCBpcyBjYWxjdWxhdGVkIGJ5IGludm9raW5nIGEgdmlzaXRvclxuICAvLyBmdW5jdGlvbiBvbiBhIG5vZGUuIFRoZSBmaXJzdCBhcmd1bWVudCBvZiB0aGUgdmlzaXRvciBpcyBhIGNvbGxlY3Rpb25cbiAgLy8gb2YgdGhlIGF0dHJpYnV0ZSB2YWx1ZXMgZm9yIHRoZSBub2RlJ3MgY2hpbGRyZW4uIFRoZXNlIGFyZSBjYWxjdWxhdGVkXG4gIC8vIGxhemlseSAtLSBpbiB0aGlzIHdheSB0aGUgdmlzaXRvciBjYW4gZGVjaWRlIGluIHdoYXQgb3JkZXIgdG8gdmlzaXQgdGhlXG4gIC8vIHN1YnRyZWVzLlxuICBjcmVhdGVBdHRyaWJ1dGU6IGZ1bmN0aW9uKHZpc2l0b3IsIGRlZmF1bHRWYWx1ZSwgY29udGV4dCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgbWVtbyA9IG5ldyBXZWFrTWFwKCk7XG4gICAgZnVuY3Rpb24gX3Zpc2l0KHN0YWNrLCB2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIGlmIChpc09iamVjdCh2YWx1ZSkgJiYgc3RhY2suaW5kZXhPZih2YWx1ZSkgPj0gMClcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQSBjeWNsZSB3YXMgZGV0ZWN0ZWQgYXQgJyArIHZhbHVlKTtcblxuICAgICAgaWYgKG1lbW8uaGFzKHZhbHVlKSlcbiAgICAgICAgcmV0dXJuIG1lbW8uZ2V0KHZhbHVlKTtcblxuICAgICAgdmFyIHN1YlJlc3VsdHM7XG4gICAgICB2YXIgdGFyZ2V0ID0gc2VsZi5fdHJhdmVyc2FsU3RyYXRlZ3kodmFsdWUpO1xuICAgICAgaWYgKGlzT2JqZWN0KHRhcmdldCkgJiYgT2JqZWN0LmtleXModGFyZ2V0KS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHN1YlJlc3VsdHMgPSB7fTtcbiAgICAgICAgZWFjaCh0YXJnZXQsIGZ1bmN0aW9uKGNoaWxkLCBrKSB7XG4gICAgICAgICAgZGVmaW5lRW51bWVyYWJsZVByb3BlcnR5KHN1YlJlc3VsdHMsIGssIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIF92aXNpdChjb3B5QW5kUHVzaChzdGFjayx2YWx1ZSksIGNoaWxkLCBrLCB2YWx1ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdmFyIHJlc3VsdCA9IHZpc2l0b3IuY2FsbChjb250ZXh0LCBzdWJSZXN1bHRzLCB2YWx1ZSwga2V5LCBwYXJlbnQpO1xuICAgICAgbWVtby5zZXQodmFsdWUsIHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7IHJldHVybiBfdmlzaXQoW10sIG9iaik7IH07XG4gIH1cbn0pO1xuXG52YXIgV2Fsa2VyUHJvdG8gPSBXYWxrZXIucHJvdG90eXBlO1xuXG4vLyBTZXQgdXAgYSBmZXcgY29udmVuaWVudCBhbGlhc2VzLlxuV2Fsa2VyUHJvdG8uZWFjaCA9IFdhbGtlclByb3RvLnByZW9yZGVyO1xuV2Fsa2VyUHJvdG8uY29sbGVjdCA9IFdhbGtlclByb3RvLm1hcDtcbldhbGtlclByb3RvLmRldGVjdCA9IFdhbGtlclByb3RvLmZpbmQ7XG5XYWxrZXJQcm90by5zZWxlY3QgPSBXYWxrZXJQcm90by5maWx0ZXI7XG5cbi8vIEV4cG9ydCB0aGUgd2Fsa2VyIGNvbnN0cnVjdG9yLCBidXQgbWFrZSBpdCBiZWhhdmUgbGlrZSBhbiBpbnN0YW5jZS5cbldhbGtlci5fdHJhdmVyc2FsU3RyYXRlZ3kgPSBkZWZhdWx0VHJhdmVyc2FsO1xubW9kdWxlLmV4cG9ydHMgPSBleHRlbmQoV2Fsa2VyLCBXYWxrZXJQcm90byk7XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxubW9kdWxlLmV4cG9ydHMgPSBleHRlbmQ7XG5mdW5jdGlvbiBleHRlbmQob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCB0eXBlb2YgYWRkICE9PSAnb2JqZWN0JykgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn1cbiIsIi8qXG4gKiBDb3B5cmlnaHQgMjAxMiBUaGUgUG9seW1lciBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYSBCU0Qtc3R5bGVcbiAqIGxpY2Vuc2UgdGhhdCBjYW4gYmUgZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZS5cbiAqL1xuXG5pZiAodHlwZW9mIFdlYWtNYXAgPT09ICd1bmRlZmluZWQnKSB7XG4gIChmdW5jdGlvbigpIHtcbiAgICB2YXIgZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG4gICAgdmFyIGNvdW50ZXIgPSBEYXRlLm5vdygpICUgMWU5O1xuXG4gICAgdmFyIFdlYWtNYXAgPSBmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMubmFtZSA9ICdfX3N0JyArIChNYXRoLnJhbmRvbSgpICogMWU5ID4+PiAwKSArIChjb3VudGVyKysgKyAnX18nKTtcbiAgICB9O1xuXG4gICAgV2Vha01hcC5wcm90b3R5cGUgPSB7XG4gICAgICBzZXQ6IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICAgIGlmIChlbnRyeSAmJiBlbnRyeVswXSA9PT0ga2V5KVxuICAgICAgICAgIGVudHJ5WzFdID0gdmFsdWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBkZWZpbmVQcm9wZXJ0eShrZXksIHRoaXMubmFtZSwge3ZhbHVlOiBba2V5LCB2YWx1ZV0sIHdyaXRhYmxlOiB0cnVlfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcbiAgICAgIGdldDogZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBlbnRyeTtcbiAgICAgICAgcmV0dXJuIChlbnRyeSA9IGtleVt0aGlzLm5hbWVdKSAmJiBlbnRyeVswXSA9PT0ga2V5ID9cbiAgICAgICAgICAgIGVudHJ5WzFdIDogdW5kZWZpbmVkO1xuICAgICAgfSxcbiAgICAgIGRlbGV0ZTogZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICBpZiAoIWVudHJ5IHx8IGVudHJ5WzBdICE9PSBrZXkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgZW50cnlbMF0gPSBlbnRyeVsxXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9LFxuICAgICAgaGFzOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgdmFyIGVudHJ5ID0ga2V5W3RoaXMubmFtZV07XG4gICAgICAgIGlmICghZW50cnkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuIGVudHJ5WzBdID09PSBrZXk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gV2Vha01hcDtcbiAgfSkoKTtcbn0gZWxzZSB7XG4gIG1vZHVsZS5leHBvcnRzID0gV2Vha01hcDtcbn1cbiJdfQ==
