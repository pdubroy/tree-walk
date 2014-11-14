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

function each(obj, predicate) {
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {
      if (predicate(obj[k], k, obj))
        return false;
    }
  }
  return true;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvaW5kZXguanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvbm9kZV9tb2R1bGVzL3V0aWwtZXh0ZW5kL2V4dGVuZC5qcyIsIi9Vc2Vycy9kdWJyb3kvZGV2L3RyZWUtd2Fsay90aGlyZF9wYXJ0eS9XZWFrTWFwL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gQ29weXJpZ2h0IChjKSAyMDE0IFBhdHJpY2sgRHVicm95IDxwZHVicm95QGdtYWlsLmNvbT5cbi8vIFRoaXMgc29mdHdhcmUgaXMgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBNSVQgTGljZW5zZS5cblxuLyogZ2xvYmFsIC1XZWFrTWFwICovXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCd1dGlsLWV4dGVuZCcpLFxuICAgIFdlYWtNYXAgPSByZXF1aXJlKCcuL3RoaXJkX3BhcnR5L1dlYWtNYXAnKTtcblxuLy8gQW4gaW50ZXJuYWwgb2JqZWN0IHRoYXQgY2FuIGJlIHJldHVybmVkIGZyb20gYSB2aXNpdG9yIGZ1bmN0aW9uIHRvXG4vLyBwcmV2ZW50IGEgdG9wLWRvd24gd2FsayBmcm9tIHdhbGtpbmcgc3VidHJlZXMgb2YgYSBub2RlLlxudmFyIHN0b3BSZWN1cnNpb24gPSB7fTtcblxuLy8gQW4gaW50ZXJuYWwgb2JqZWN0IHRoYXQgY2FuIGJlIHJldHVybmVkIGZyb20gYSB2aXNpdG9yIGZ1bmN0aW9uIHRvXG4vLyBjYXVzZSB0aGUgd2FsayB0byBpbW1lZGlhdGVseSBzdG9wLlxudmFyIHN0b3BXYWxrID0ge307XG5cbnZhciBoYXNPd25Qcm9wID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gSGVscGVyc1xuLy8gLS0tLS0tLVxuXG5mdW5jdGlvbiBpc0VsZW1lbnQob2JqKSB7XG4gIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3Qob2JqKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIG9iajtcbiAgcmV0dXJuIHR5cGUgPT09ICdmdW5jdGlvbicgfHwgdHlwZSA9PT0gJ29iamVjdCcgJiYgISFvYmo7XG59XG5cbmZ1bmN0aW9uIGVhY2gob2JqLCBwcmVkaWNhdGUpIHtcbiAgZm9yICh2YXIgayBpbiBvYmopIHtcbiAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtrXSwgaywgb2JqKSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gTWFrZXMgYSBzaGFsbG93IGNvcHkgb2YgYGFycmAsIGFuZCBhZGRzIGBvYmpgIHRvIHRoZSBlbmQgb2YgdGhlIGNvcHkuXG5mdW5jdGlvbiBjb3B5QW5kUHVzaChhcnIsIG9iaikge1xuICB2YXIgcmVzdWx0ID0gYXJyLnNsaWNlKCk7XG4gIHJlc3VsdC5wdXNoKG9iaik7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8vIEltcGxlbWVudHMgdGhlIGRlZmF1bHQgdHJhdmVyc2FsIHN0cmF0ZWd5OiBpZiBgb2JqYCBpcyBhIERPTSBub2RlLCB3YWxrXG4vLyBpdHMgRE9NIGNoaWxkcmVuOyBvdGhlcndpc2UsIHdhbGsgYWxsIHRoZSBvYmplY3RzIGl0IHJlZmVyZW5jZXMuXG5mdW5jdGlvbiBkZWZhdWx0VHJhdmVyc2FsKG9iaikge1xuICByZXR1cm4gaXNFbGVtZW50KG9iaikgPyBvYmouY2hpbGRyZW4gOiBvYmo7XG59XG5cbi8vIFdhbGsgdGhlIHRyZWUgcmVjdXJzaXZlbHkgYmVnaW5uaW5nIHdpdGggYHJvb3RgLCBjYWxsaW5nIGBiZWZvcmVGdW5jYFxuLy8gYmVmb3JlIHZpc2l0aW5nIGFuIG9iamVjdHMgZGVzY2VuZGVudHMsIGFuZCBgYWZ0ZXJGdW5jYCBhZnRlcndhcmRzLlxuLy8gSWYgYGNvbGxlY3RSZXN1bHRzYCBpcyB0cnVlLCB0aGUgbGFzdCBhcmd1bWVudCB0byBgYWZ0ZXJGdW5jYCB3aWxsIGJlIGFcbi8vIGNvbGxlY3Rpb24gb2YgdGhlIHJlc3VsdHMgb2Ygd2Fsa2luZyB0aGUgbm9kZSdzIHN1YnRyZWVzLlxuZnVuY3Rpb24gd2Fsa0ltcGwocm9vdCwgdHJhdmVyc2FsU3RyYXRlZ3ksIGJlZm9yZUZ1bmMsIGFmdGVyRnVuYywgY29udGV4dCwgY29sbGVjdFJlc3VsdHMpIHtcbiAgcmV0dXJuIChmdW5jdGlvbiBfd2FsayhzdGFjaywgdmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgaWYgKGlzT2JqZWN0KHZhbHVlKSAmJiBzdGFjay5pbmRleE9mKHZhbHVlKSA+PSAwKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQSBjeWNsZSB3YXMgZGV0ZWN0ZWQgYXQgJyArIHZhbHVlKTtcblxuICAgIGlmIChiZWZvcmVGdW5jKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gYmVmb3JlRnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgICBpZiAocmVzdWx0ID09PSBzdG9wV2FsaykgcmV0dXJuIHN0b3BXYWxrO1xuICAgICAgaWYgKHJlc3VsdCA9PT0gc3RvcFJlY3Vyc2lvbikgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBzdWJSZXN1bHRzO1xuICAgIHZhciB0YXJnZXQgPSB0cmF2ZXJzYWxTdHJhdGVneSh2YWx1ZSk7XG5cbiAgICBpZiAoaXNPYmplY3QodGFyZ2V0KSAmJiBPYmplY3Qua2V5cyh0YXJnZXQpLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIENvbGxlY3QgcmVzdWx0cyBmcm9tIHN1YnRyZWVzIGluIHRoZSBzYW1lIHNoYXBlIGFzIHRoZSB0YXJnZXQuXG4gICAgICBpZiAoY29sbGVjdFJlc3VsdHMpIHN1YlJlc3VsdHMgPSBBcnJheS5pc0FycmF5KHRhcmdldCkgPyBbXSA6IHt9O1xuXG4gICAgICB2YXIgb2sgPSBlYWNoKHRhcmdldCwgZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IF93YWxrKGNvcHlBbmRQdXNoKHN0YWNrLCB2YWx1ZSksIG9iaiwga2V5LCB2YWx1ZSk7XG4gICAgICAgIGlmIChyZXN1bHQgPT09IHN0b3BXYWxrKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChzdWJSZXN1bHRzKSBzdWJSZXN1bHRzW2tleV0gPSByZXN1bHQ7XG4gICAgICB9KTtcbiAgICAgIGlmICghb2spIHJldHVybiBzdG9wV2FsaztcbiAgICB9XG4gICAgaWYgKGFmdGVyRnVuYykgcmV0dXJuIGFmdGVyRnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCwgc3ViUmVzdWx0cyk7XG4gIH0pKFtdLCByb290KTtcbn1cblxuLy8gSW50ZXJuYWwgaGVscGVyIHByb3ZpZGluZyB0aGUgaW1wbGVtZW50YXRpb24gZm9yIGBwbHVja2AgYW5kIGBwbHVja1JlY2AuXG5mdW5jdGlvbiBwbHVjayhvYmosIHByb3BlcnR5TmFtZSwgcmVjdXJzaXZlKSB7XG4gIHZhciByZXN1bHRzID0gW107XG4gIHRoaXMucHJlb3JkZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgaWYgKCFyZWN1cnNpdmUgJiYga2V5ID09IHByb3BlcnR5TmFtZSlcbiAgICAgIHJldHVybiBzdG9wUmVjdXJzaW9uO1xuICAgIGlmIChoYXNPd25Qcm9wLmNhbGwodmFsdWUsIHByb3BlcnR5TmFtZSkpXG4gICAgICByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IHZhbHVlW3Byb3BlcnR5TmFtZV07XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gZGVmaW5lRW51bWVyYWJsZVByb3BlcnR5KG9iaiwgcHJvcE5hbWUsIGdldHRlckZuKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3BOYW1lLCB7XG4gICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICBnZXQ6IGdldHRlckZuXG4gIH0pO1xufVxuXG4vLyBSZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSB3YWxrIGZ1bmN0aW9ucy4gSWYgYHRyYXZlcnNhbFN0cmF0ZWd5YFxuLy8gaXMgc3BlY2lmaWVkLCBpdCBpcyBhIGZ1bmN0aW9uIGRldGVybWluaW5nIGhvdyBvYmplY3RzIHNob3VsZCBiZVxuLy8gdHJhdmVyc2VkLiBHaXZlbiBhbiBvYmplY3QsIGl0IHJldHVybnMgdGhlIG9iamVjdCB0byBiZSByZWN1cnNpdmVseVxuLy8gd2Fsa2VkLiBUaGUgZGVmYXVsdCBzdHJhdGVneSBpcyBlcXVpdmFsZW50IHRvIGBfLmlkZW50aXR5YCBmb3IgcmVndWxhclxuLy8gb2JqZWN0cywgYW5kIGZvciBET00gbm9kZXMgaXQgcmV0dXJucyB0aGUgbm9kZSdzIERPTSBjaGlsZHJlbi5cbmZ1bmN0aW9uIFdhbGtlcih0cmF2ZXJzYWxTdHJhdGVneSkge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgV2Fsa2VyKSlcbiAgICByZXR1cm4gbmV3IFdhbGtlcih0cmF2ZXJzYWxTdHJhdGVneSk7XG4gIHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5ID0gdHJhdmVyc2FsU3RyYXRlZ3kgfHwgZGVmYXVsdFRyYXZlcnNhbDtcbn1cblxuZXh0ZW5kKFdhbGtlci5wcm90b3R5cGUsIHtcbiAgLy8gUGVyZm9ybXMgYSBwcmVvcmRlciB0cmF2ZXJzYWwgb2YgYG9iamAgYW5kIHJldHVybnMgdGhlIGZpcnN0IHZhbHVlXG4gIC8vIHdoaWNoIHBhc3NlcyBhIHRydXRoIHRlc3QuXG4gIGZpbmQ6IGZ1bmN0aW9uKG9iaiwgdmlzaXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQ7XG4gICAgdGhpcy5wcmVvcmRlcihvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIHBhcmVudCkge1xuICAgICAgaWYgKHZpc2l0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQpKSB7XG4gICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gc3RvcFdhbGs7XG4gICAgICB9XG4gICAgfSwgY29udGV4dCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcblxuICAvLyBSZWN1cnNpdmVseSB0cmF2ZXJzZXMgYG9iamAgYW5kIHJldHVybnMgYWxsIHRoZSBlbGVtZW50cyB0aGF0IHBhc3MgYVxuICAvLyB0cnV0aCB0ZXN0LiBgc3RyYXRlZ3lgIGlzIHRoZSB0cmF2ZXJzYWwgZnVuY3Rpb24gdG8gdXNlLCBlLmcuIGBwcmVvcmRlcmBcbiAgLy8gb3IgYHBvc3RvcmRlcmAuXG4gIGZpbHRlcjogZnVuY3Rpb24ob2JqLCBzdHJhdGVneSwgdmlzaXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgaWYgKG9iaiA9PT0gbnVsbCkgcmV0dXJuIHJlc3VsdHM7XG4gICAgc3RyYXRlZ3kob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIGlmICh2aXNpdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KSkgcmVzdWx0cy5wdXNoKHZhbHVlKTtcbiAgICB9LCBudWxsLCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0sXG5cbiAgLy8gUmVjdXJzaXZlbHkgdHJhdmVyc2VzIGBvYmpgIGFuZCByZXR1cm5zIGFsbCB0aGUgZWxlbWVudHMgZm9yIHdoaWNoIGFcbiAgLy8gdHJ1dGggdGVzdCBmYWlscy5cbiAgcmVqZWN0OiBmdW5jdGlvbihvYmosIHN0cmF0ZWd5LCB2aXNpdG9yLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyKG9iaiwgc3RyYXRlZ3ksIGZ1bmN0aW9uKHZhbHVlLCBrZXksIHBhcmVudCkge1xuICAgICAgcmV0dXJuICF2aXNpdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBQcm9kdWNlcyBhIG5ldyBhcnJheSBvZiB2YWx1ZXMgYnkgcmVjdXJzaXZlbHkgdHJhdmVyc2luZyBgb2JqYCBhbmRcbiAgLy8gbWFwcGluZyBlYWNoIHZhbHVlIHRocm91Z2ggdGhlIHRyYW5zZm9ybWF0aW9uIGZ1bmN0aW9uIGB2aXNpdG9yYC5cbiAgLy8gYHN0cmF0ZWd5YCBpcyB0aGUgdHJhdmVyc2FsIGZ1bmN0aW9uIHRvIHVzZSwgZS5nLiBgcHJlb3JkZXJgIG9yXG4gIC8vIGBwb3N0b3JkZXJgLlxuICBtYXA6IGZ1bmN0aW9uKG9iaiwgc3RyYXRlZ3ksIHZpc2l0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIHN0cmF0ZWd5KG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IHZpc2l0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQpO1xuICAgIH0sIG51bGwsIHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSxcblxuICAvLyBSZXR1cm4gdGhlIHZhbHVlIG9mIHByb3BlcnRpZXMgbmFtZWQgYHByb3BlcnR5TmFtZWAgcmVhY2hhYmxlIGZyb20gdGhlXG4gIC8vIHRyZWUgcm9vdGVkIGF0IGBvYmpgLiBSZXN1bHRzIGFyZSBub3QgcmVjdXJzaXZlbHkgc2VhcmNoZWQ7IHVzZVxuICAvLyBgcGx1Y2tSZWNgIGZvciB0aGF0LlxuICBwbHVjazogZnVuY3Rpb24ob2JqLCBwcm9wZXJ0eU5hbWUpIHtcbiAgICByZXR1cm4gcGx1Y2suY2FsbCh0aGlzLCBvYmosIHByb3BlcnR5TmFtZSwgZmFsc2UpO1xuICB9LFxuXG4gIC8vIFZlcnNpb24gb2YgYHBsdWNrYCB3aGljaCByZWN1cnNpdmVseSBzZWFyY2hlcyByZXN1bHRzIGZvciBuZXN0ZWQgb2JqZWN0c1xuICAvLyB3aXRoIGEgcHJvcGVydHkgbmFtZWQgYHByb3BlcnR5TmFtZWAuXG4gIHBsdWNrUmVjOiBmdW5jdGlvbihvYmosIHByb3BlcnR5TmFtZSkge1xuICAgIHJldHVybiBwbHVjay5jYWxsKHRoaXMsIG9iaiwgcHJvcGVydHlOYW1lLCB0cnVlKTtcbiAgfSxcblxuICAvLyBSZWN1cnNpdmVseSB0cmF2ZXJzZXMgYG9iamAgaW4gYSBkZXB0aC1maXJzdCBmYXNoaW9uLCBpbnZva2luZyB0aGVcbiAgLy8gYHZpc2l0b3JgIGZ1bmN0aW9uIGZvciBlYWNoIG9iamVjdCBvbmx5IGFmdGVyIHRyYXZlcnNpbmcgaXRzIGNoaWxkcmVuLlxuICAvLyBgdHJhdmVyc2FsU3RyYXRlZ3lgIGlzIGludGVuZGVkIGZvciBpbnRlcm5hbCBjYWxsZXJzLCBhbmQgaXMgbm90IHBhcnRcbiAgLy8gb2YgdGhlIHB1YmxpYyBBUEkuXG4gIHBvc3RvcmRlcjogZnVuY3Rpb24ob2JqLCB2aXNpdG9yLCBjb250ZXh0LCB0cmF2ZXJzYWxTdHJhdGVneSkge1xuICAgIHRyYXZlcnNhbFN0cmF0ZWd5ID0gdHJhdmVyc2FsU3RyYXRlZ3kgfHwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3k7XG4gICAgd2Fsa0ltcGwob2JqLCB0cmF2ZXJzYWxTdHJhdGVneSwgbnVsbCwgdmlzaXRvciwgY29udGV4dCk7XG4gIH0sXG5cbiAgLy8gUmVjdXJzaXZlbHkgdHJhdmVyc2VzIGBvYmpgIGluIGEgZGVwdGgtZmlyc3QgZmFzaGlvbiwgaW52b2tpbmcgdGhlXG4gIC8vIGB2aXNpdG9yYCBmdW5jdGlvbiBmb3IgZWFjaCBvYmplY3QgYmVmb3JlIHRyYXZlcnNpbmcgaXRzIGNoaWxkcmVuLlxuICAvLyBgdHJhdmVyc2FsU3RyYXRlZ3lgIGlzIGludGVuZGVkIGZvciBpbnRlcm5hbCBjYWxsZXJzLCBhbmQgaXMgbm90IHBhcnRcbiAgLy8gb2YgdGhlIHB1YmxpYyBBUEkuXG4gIHByZW9yZGVyOiBmdW5jdGlvbihvYmosIHZpc2l0b3IsIGNvbnRleHQsIHRyYXZlcnNhbFN0cmF0ZWd5KSB7XG4gICAgdHJhdmVyc2FsU3RyYXRlZ3kgPSB0cmF2ZXJzYWxTdHJhdGVneSB8fCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneTtcbiAgICB3YWxrSW1wbChvYmosIHRyYXZlcnNhbFN0cmF0ZWd5LCB2aXNpdG9yLCBudWxsLCBjb250ZXh0KTtcbiAgfSxcblxuICAvLyBCdWlsZHMgdXAgYSBzaW5nbGUgdmFsdWUgYnkgZG9pbmcgYSBwb3N0LW9yZGVyIHRyYXZlcnNhbCBvZiBgb2JqYCBhbmRcbiAgLy8gY2FsbGluZyB0aGUgYHZpc2l0b3JgIGZ1bmN0aW9uIG9uIGVhY2ggb2JqZWN0IGluIHRoZSB0cmVlLiBGb3IgbGVhZlxuICAvLyBvYmplY3RzLCB0aGUgYG1lbW9gIGFyZ3VtZW50IHRvIGB2aXNpdG9yYCBpcyB0aGUgdmFsdWUgb2YgdGhlIGBsZWFmTWVtb2BcbiAgLy8gYXJndW1lbnQgdG8gYHJlZHVjZWAuIEZvciBub24tbGVhZiBvYmplY3RzLCBgbWVtb2AgaXMgYSBjb2xsZWN0aW9uIG9mXG4gIC8vIHRoZSByZXN1bHRzIG9mIGNhbGxpbmcgYHJlZHVjZWAgb24gdGhlIG9iamVjdCdzIGNoaWxkcmVuLlxuICByZWR1Y2U6IGZ1bmN0aW9uKG9iaiwgdmlzaXRvciwgbGVhZk1lbW8sIGNvbnRleHQpIHtcbiAgICB2YXIgcmVkdWNlciA9IGZ1bmN0aW9uKHZhbHVlLCBrZXksIHBhcmVudCwgc3ViUmVzdWx0cykge1xuICAgICAgcmV0dXJuIHZpc2l0b3Ioc3ViUmVzdWx0cyB8fCBsZWFmTWVtbywgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICB9O1xuICAgIHJldHVybiB3YWxrSW1wbChvYmosIHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5LCBudWxsLCByZWR1Y2VyLCBjb250ZXh0LCB0cnVlKTtcbiAgfSxcblxuICAvLyBBbiAnYXR0cmlidXRlJyBpcyBhIHZhbHVlIHRoYXQgaXMgY2FsY3VsYXRlZCBieSBpbnZva2luZyBhIHZpc2l0b3JcbiAgLy8gZnVuY3Rpb24gb24gYSBub2RlLiBUaGUgZmlyc3QgYXJndW1lbnQgb2YgdGhlIHZpc2l0b3IgaXMgYSBjb2xsZWN0aW9uXG4gIC8vIG9mIHRoZSBhdHRyaWJ1dGUgdmFsdWVzIGZvciB0aGUgbm9kZSdzIGNoaWxkcmVuLiBUaGVzZSBhcmUgY2FsY3VsYXRlZFxuICAvLyBsYXppbHkgLS0gaW4gdGhpcyB3YXkgdGhlIHZpc2l0b3IgY2FuIGRlY2lkZSBpbiB3aGF0IG9yZGVyIHRvIHZpc2l0IHRoZVxuICAvLyBzdWJ0cmVlcy5cbiAgY3JlYXRlQXR0cmlidXRlOiBmdW5jdGlvbih2aXNpdG9yLCBkZWZhdWx0VmFsdWUsIGNvbnRleHQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIG1lbW8gPSBuZXcgV2Vha01hcCgpO1xuICAgIGZ1bmN0aW9uIF92aXNpdChzdGFjaywgdmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICBpZiAoaXNPYmplY3QodmFsdWUpICYmIHN0YWNrLmluZGV4T2YodmFsdWUpID49IDApXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0EgY3ljbGUgd2FzIGRldGVjdGVkIGF0ICcgKyB2YWx1ZSk7XG5cbiAgICAgIGlmIChtZW1vLmhhcyh2YWx1ZSkpXG4gICAgICAgIHJldHVybiBtZW1vLmdldCh2YWx1ZSk7XG5cbiAgICAgIHZhciBzdWJSZXN1bHRzO1xuICAgICAgdmFyIHRhcmdldCA9IHNlbGYuX3RyYXZlcnNhbFN0cmF0ZWd5KHZhbHVlKTtcbiAgICAgIGlmIChpc09iamVjdCh0YXJnZXQpICYmIE9iamVjdC5rZXlzKHRhcmdldCkubGVuZ3RoID4gMCkge1xuICAgICAgICBzdWJSZXN1bHRzID0ge307XG4gICAgICAgIGVhY2godGFyZ2V0LCBmdW5jdGlvbihjaGlsZCwgaykge1xuICAgICAgICAgIGRlZmluZUVudW1lcmFibGVQcm9wZXJ0eShzdWJSZXN1bHRzLCBrLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBfdmlzaXQoY29weUFuZFB1c2goc3RhY2ssdmFsdWUpLCBjaGlsZCwgaywgdmFsdWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHZhciByZXN1bHQgPSB2aXNpdG9yLmNhbGwoY29udGV4dCwgc3ViUmVzdWx0cywgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICAgIG1lbW8uc2V0KHZhbHVlLCByZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikgeyByZXR1cm4gX3Zpc2l0KFtdLCBvYmopOyB9O1xuICB9XG59KTtcblxudmFyIFdhbGtlclByb3RvID0gV2Fsa2VyLnByb3RvdHlwZTtcblxuLy8gU2V0IHVwIGEgZmV3IGNvbnZlbmllbnQgYWxpYXNlcy5cbldhbGtlclByb3RvLmVhY2ggPSBXYWxrZXJQcm90by5wcmVvcmRlcjtcbldhbGtlclByb3RvLmNvbGxlY3QgPSBXYWxrZXJQcm90by5tYXA7XG5XYWxrZXJQcm90by5kZXRlY3QgPSBXYWxrZXJQcm90by5maW5kO1xuV2Fsa2VyUHJvdG8uc2VsZWN0ID0gV2Fsa2VyUHJvdG8uZmlsdGVyO1xuXG4vLyBFeHBvcnQgdGhlIHdhbGtlciBjb25zdHJ1Y3RvciwgYnV0IG1ha2UgaXQgYmVoYXZlIGxpa2UgYW4gaW5zdGFuY2UuXG5XYWxrZXIuX3RyYXZlcnNhbFN0cmF0ZWd5ID0gZGVmYXVsdFRyYXZlcnNhbDtcbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kKFdhbGtlciwgV2Fsa2VyUHJvdG8pO1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kO1xuZnVuY3Rpb24gZXh0ZW5kKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgdHlwZW9mIGFkZCAhPT0gJ29iamVjdCcpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59XG4iLCIvKlxuICogQ29weXJpZ2h0IDIwMTIgVGhlIFBvbHltZXIgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGEgQlNELXN0eWxlXG4gKiBsaWNlbnNlIHRoYXQgY2FuIGJlIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUuXG4gKi9cblxuaWYgKHR5cGVvZiBXZWFrTWFwID09PSAndW5kZWZpbmVkJykge1xuICAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRlZmluZVByb3BlcnR5ID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuICAgIHZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcblxuICAgIHZhciBXZWFrTWFwID0gZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLm5hbWUgPSAnX19zdCcgKyAoTWF0aC5yYW5kb20oKSAqIDFlOSA+Pj4gMCkgKyAoY291bnRlcisrICsgJ19fJyk7XG4gICAgfTtcblxuICAgIFdlYWtNYXAucHJvdG90eXBlID0ge1xuICAgICAgc2V0OiBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICBpZiAoZW50cnkgJiYgZW50cnlbMF0gPT09IGtleSlcbiAgICAgICAgICBlbnRyeVsxXSA9IHZhbHVlO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgZGVmaW5lUHJvcGVydHkoa2V5LCB0aGlzLm5hbWUsIHt2YWx1ZTogW2tleSwgdmFsdWVdLCB3cml0YWJsZTogdHJ1ZX0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0sXG4gICAgICBnZXQ6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZW50cnk7XG4gICAgICAgIHJldHVybiAoZW50cnkgPSBrZXlbdGhpcy5uYW1lXSkgJiYgZW50cnlbMF0gPT09IGtleSA/XG4gICAgICAgICAgICBlbnRyeVsxXSA6IHVuZGVmaW5lZDtcbiAgICAgIH0sXG4gICAgICBkZWxldGU6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgICAgaWYgKCFlbnRyeSB8fCBlbnRyeVswXSAhPT0ga2V5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGVudHJ5WzBdID0gZW50cnlbMV0gPSB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSxcbiAgICAgIGhhczogZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiBlbnRyeVswXSA9PT0ga2V5O1xuICAgICAgfVxuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IFdlYWtNYXA7XG4gIH0pKCk7XG59IGVsc2Uge1xuICBtb2R1bGUuZXhwb3J0cyA9IFdlYWtNYXA7XG59XG4iXX0=
