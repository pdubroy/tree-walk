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

// Replacement for a few functions from Underscore that we need.
var _ = {
  any: function(obj, predicate) {
    if (obj === null) return false;
    var keys = obj.length !== +obj.length && Object.keys(obj),
        length = (keys || obj).length,
        index, currentKey;
    for (index = 0; index < length; index++) {
      currentKey = keys ? keys[index] : index;
      if (predicate(obj[currentKey], currentKey, obj)) return true;
    }
    return false;
  },
  isElement: function(obj) {
    return !!(obj && obj.nodeType === 1);
  },
  isObject: function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  },
  size: function(obj) {
    if (obj === null) return 0;
    return obj.length === +obj.length ? obj.length : Object.keys(obj).length;
  }
};

// Makes a shallow copy of `arr`, and adds `obj` to the end of the copy.
function copyAndPush(arr, obj) {
  var result = arr.slice();
  result.push(obj);
  return result;
}

// Implements the default traversal strategy: if `obj` is a DOM node, walk
// its DOM children; otherwise, walk all the objects it references.
function defaultTraversal(obj) {
  return _.isElement(obj) ? obj.children : obj;
}

// Walk the tree recursively beginning with `root`, calling `beforeFunc`
// before visiting an objects descendents, and `afterFunc` afterwards.
// If `collectResults` is true, the last argument to `afterFunc` will be a
// collection of the results of walking the node's subtrees.
function walkImpl(root, traversalStrategy, beforeFunc, afterFunc, context, collectResults) {
  return (function _walk(stack, value, key, parent) {
    if (_.isObject(value) && stack.indexOf(value) >= 0)
      throw new TypeError('A cycle was detected at ' + value);

    if (beforeFunc) {
      var result = beforeFunc.call(context, value, key, parent);
      if (result === stopWalk) return stopWalk;
      if (result === stopRecursion) return;
    }

    var subResults;
    var target = traversalStrategy(value);

    if (_.isObject(target) && _.size(target) > 0) {
      // Collect results from subtrees in the same shape as the target.
      if (collectResults) subResults = Array.isArray(target) ? [] : {};

      var stop = _.any(target, function(obj, key) {
        var result = _walk(copyAndPush(stack, value), obj, key, value);
        if (result === stopWalk) return true;
        if (subResults) subResults[key] = result;
      });
      if (stop) return stopWalk;
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
      if (_.isObject(value) && stack.indexOf(value) >= 0)
        throw new TypeError('A cycle was detected at ' + value);

      if (memo.has(value))
        return memo.get(value);

      var subResults;
      var target = self._traversalStrategy(value);
      if (_.isObject(target) && _.size(target) > 0) {
        subResults = {};
        _.any(target, function(child, k) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvaW5kZXguanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvbm9kZV9tb2R1bGVzL3V0aWwtZXh0ZW5kL2V4dGVuZC5qcyIsIi9Vc2Vycy9kdWJyb3kvZGV2L3RyZWUtd2Fsay90aGlyZF9wYXJ0eS9XZWFrTWFwL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBDb3B5cmlnaHQgKGMpIDIwMTQgUGF0cmljayBEdWJyb3kgPHBkdWJyb3lAZ21haWwuY29tPlxuLy8gVGhpcyBzb2Z0d2FyZSBpcyBkaXN0cmlidXRlZCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIE1JVCBMaWNlbnNlLlxuXG4vKiBnbG9iYWwgLVdlYWtNYXAgKi9cblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ3V0aWwtZXh0ZW5kJyksXG4gICAgV2Vha01hcCA9IHJlcXVpcmUoJy4vdGhpcmRfcGFydHkvV2Vha01hcCcpO1xuXG4vLyBBbiBpbnRlcm5hbCBvYmplY3QgdGhhdCBjYW4gYmUgcmV0dXJuZWQgZnJvbSBhIHZpc2l0b3IgZnVuY3Rpb24gdG9cbi8vIHByZXZlbnQgYSB0b3AtZG93biB3YWxrIGZyb20gd2Fsa2luZyBzdWJ0cmVlcyBvZiBhIG5vZGUuXG52YXIgc3RvcFJlY3Vyc2lvbiA9IHt9O1xuXG4vLyBBbiBpbnRlcm5hbCBvYmplY3QgdGhhdCBjYW4gYmUgcmV0dXJuZWQgZnJvbSBhIHZpc2l0b3IgZnVuY3Rpb24gdG9cbi8vIGNhdXNlIHRoZSB3YWxrIHRvIGltbWVkaWF0ZWx5IHN0b3AuXG52YXIgc3RvcFdhbGsgPSB7fTtcblxudmFyIGhhc093blByb3AgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4vLyBIZWxwZXJzXG4vLyAtLS0tLS0tXG5cbi8vIFJlcGxhY2VtZW50IGZvciBhIGZldyBmdW5jdGlvbnMgZnJvbSBVbmRlcnNjb3JlIHRoYXQgd2UgbmVlZC5cbnZhciBfID0ge1xuICBhbnk6IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlKSB7XG4gICAgaWYgKG9iaiA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIHZhciBrZXlzID0gb2JqLmxlbmd0aCAhPT0gK29iai5sZW5ndGggJiYgT2JqZWN0LmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgIGluZGV4LCBjdXJyZW50S2V5O1xuICAgIGZvciAoaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgaWYgKHByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG4gIGlzRWxlbWVudDogZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuICEhKG9iaiAmJiBvYmoubm9kZVR5cGUgPT09IDEpO1xuICB9LFxuICBpc09iamVjdDogZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHR5cGUgPSB0eXBlb2Ygb2JqO1xuICAgIHJldHVybiB0eXBlID09PSAnZnVuY3Rpb24nIHx8IHR5cGUgPT09ICdvYmplY3QnICYmICEhb2JqO1xuICB9LFxuICBzaXplOiBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09PSBudWxsKSByZXR1cm4gMDtcbiAgICByZXR1cm4gb2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGggPyBvYmoubGVuZ3RoIDogT2JqZWN0LmtleXMob2JqKS5sZW5ndGg7XG4gIH1cbn07XG5cbi8vIE1ha2VzIGEgc2hhbGxvdyBjb3B5IG9mIGBhcnJgLCBhbmQgYWRkcyBgb2JqYCB0byB0aGUgZW5kIG9mIHRoZSBjb3B5LlxuZnVuY3Rpb24gY29weUFuZFB1c2goYXJyLCBvYmopIHtcbiAgdmFyIHJlc3VsdCA9IGFyci5zbGljZSgpO1xuICByZXN1bHQucHVzaChvYmopO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vLyBJbXBsZW1lbnRzIHRoZSBkZWZhdWx0IHRyYXZlcnNhbCBzdHJhdGVneTogaWYgYG9iamAgaXMgYSBET00gbm9kZSwgd2Fsa1xuLy8gaXRzIERPTSBjaGlsZHJlbjsgb3RoZXJ3aXNlLCB3YWxrIGFsbCB0aGUgb2JqZWN0cyBpdCByZWZlcmVuY2VzLlxuZnVuY3Rpb24gZGVmYXVsdFRyYXZlcnNhbChvYmopIHtcbiAgcmV0dXJuIF8uaXNFbGVtZW50KG9iaikgPyBvYmouY2hpbGRyZW4gOiBvYmo7XG59XG5cbi8vIFdhbGsgdGhlIHRyZWUgcmVjdXJzaXZlbHkgYmVnaW5uaW5nIHdpdGggYHJvb3RgLCBjYWxsaW5nIGBiZWZvcmVGdW5jYFxuLy8gYmVmb3JlIHZpc2l0aW5nIGFuIG9iamVjdHMgZGVzY2VuZGVudHMsIGFuZCBgYWZ0ZXJGdW5jYCBhZnRlcndhcmRzLlxuLy8gSWYgYGNvbGxlY3RSZXN1bHRzYCBpcyB0cnVlLCB0aGUgbGFzdCBhcmd1bWVudCB0byBgYWZ0ZXJGdW5jYCB3aWxsIGJlIGFcbi8vIGNvbGxlY3Rpb24gb2YgdGhlIHJlc3VsdHMgb2Ygd2Fsa2luZyB0aGUgbm9kZSdzIHN1YnRyZWVzLlxuZnVuY3Rpb24gd2Fsa0ltcGwocm9vdCwgdHJhdmVyc2FsU3RyYXRlZ3ksIGJlZm9yZUZ1bmMsIGFmdGVyRnVuYywgY29udGV4dCwgY29sbGVjdFJlc3VsdHMpIHtcbiAgcmV0dXJuIChmdW5jdGlvbiBfd2FsayhzdGFjaywgdmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgaWYgKF8uaXNPYmplY3QodmFsdWUpICYmIHN0YWNrLmluZGV4T2YodmFsdWUpID49IDApXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBIGN5Y2xlIHdhcyBkZXRlY3RlZCBhdCAnICsgdmFsdWUpO1xuXG4gICAgaWYgKGJlZm9yZUZ1bmMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBiZWZvcmVGdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IHN0b3BXYWxrKSByZXR1cm4gc3RvcFdhbGs7XG4gICAgICBpZiAocmVzdWx0ID09PSBzdG9wUmVjdXJzaW9uKSByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHN1YlJlc3VsdHM7XG4gICAgdmFyIHRhcmdldCA9IHRyYXZlcnNhbFN0cmF0ZWd5KHZhbHVlKTtcblxuICAgIGlmIChfLmlzT2JqZWN0KHRhcmdldCkgJiYgXy5zaXplKHRhcmdldCkgPiAwKSB7XG4gICAgICAvLyBDb2xsZWN0IHJlc3VsdHMgZnJvbSBzdWJ0cmVlcyBpbiB0aGUgc2FtZSBzaGFwZSBhcyB0aGUgdGFyZ2V0LlxuICAgICAgaWYgKGNvbGxlY3RSZXN1bHRzKSBzdWJSZXN1bHRzID0gQXJyYXkuaXNBcnJheSh0YXJnZXQpID8gW10gOiB7fTtcblxuICAgICAgdmFyIHN0b3AgPSBfLmFueSh0YXJnZXQsIGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBfd2Fsayhjb3B5QW5kUHVzaChzdGFjaywgdmFsdWUpLCBvYmosIGtleSwgdmFsdWUpO1xuICAgICAgICBpZiAocmVzdWx0ID09PSBzdG9wV2FsaykgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChzdWJSZXN1bHRzKSBzdWJSZXN1bHRzW2tleV0gPSByZXN1bHQ7XG4gICAgICB9KTtcbiAgICAgIGlmIChzdG9wKSByZXR1cm4gc3RvcFdhbGs7XG4gICAgfVxuICAgIGlmIChhZnRlckZ1bmMpIHJldHVybiBhZnRlckZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQsIHN1YlJlc3VsdHMpO1xuICB9KShbXSwgcm9vdCk7XG59XG5cbi8vIEludGVybmFsIGhlbHBlciBwcm92aWRpbmcgdGhlIGltcGxlbWVudGF0aW9uIGZvciBgcGx1Y2tgIGFuZCBgcGx1Y2tSZWNgLlxuZnVuY3Rpb24gcGx1Y2sob2JqLCBwcm9wZXJ0eU5hbWUsIHJlY3Vyc2l2ZSkge1xuICB2YXIgcmVzdWx0cyA9IFtdO1xuICB0aGlzLnByZW9yZGVyKG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgIGlmICghcmVjdXJzaXZlICYmIGtleSA9PSBwcm9wZXJ0eU5hbWUpXG4gICAgICByZXR1cm4gc3RvcFJlY3Vyc2lvbjtcbiAgICBpZiAoaGFzT3duUHJvcC5jYWxsKHZhbHVlLCBwcm9wZXJ0eU5hbWUpKVxuICAgICAgcmVzdWx0c1tyZXN1bHRzLmxlbmd0aF0gPSB2YWx1ZVtwcm9wZXJ0eU5hbWVdO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGRlZmluZUVudW1lcmFibGVQcm9wZXJ0eShvYmosIHByb3BOYW1lLCBnZXR0ZXJGbikge1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wTmFtZSwge1xuICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgZ2V0OiBnZXR0ZXJGblxuICB9KTtcbn1cblxuLy8gUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgd2FsayBmdW5jdGlvbnMuIElmIGB0cmF2ZXJzYWxTdHJhdGVneWBcbi8vIGlzIHNwZWNpZmllZCwgaXQgaXMgYSBmdW5jdGlvbiBkZXRlcm1pbmluZyBob3cgb2JqZWN0cyBzaG91bGQgYmVcbi8vIHRyYXZlcnNlZC4gR2l2ZW4gYW4gb2JqZWN0LCBpdCByZXR1cm5zIHRoZSBvYmplY3QgdG8gYmUgcmVjdXJzaXZlbHlcbi8vIHdhbGtlZC4gVGhlIGRlZmF1bHQgc3RyYXRlZ3kgaXMgZXF1aXZhbGVudCB0byBgXy5pZGVudGl0eWAgZm9yIHJlZ3VsYXJcbi8vIG9iamVjdHMsIGFuZCBmb3IgRE9NIG5vZGVzIGl0IHJldHVybnMgdGhlIG5vZGUncyBET00gY2hpbGRyZW4uXG5mdW5jdGlvbiBXYWxrZXIodHJhdmVyc2FsU3RyYXRlZ3kpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFdhbGtlcikpXG4gICAgcmV0dXJuIG5ldyBXYWxrZXIodHJhdmVyc2FsU3RyYXRlZ3kpO1xuICB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneSA9IHRyYXZlcnNhbFN0cmF0ZWd5IHx8IGRlZmF1bHRUcmF2ZXJzYWw7XG59XG5cbmV4dGVuZChXYWxrZXIucHJvdG90eXBlLCB7XG4gIC8vIFBlcmZvcm1zIGEgcHJlb3JkZXIgdHJhdmVyc2FsIG9mIGBvYmpgIGFuZCByZXR1cm5zIHRoZSBmaXJzdCB2YWx1ZVxuICAvLyB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LlxuICBmaW5kOiBmdW5jdGlvbihvYmosIHZpc2l0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0O1xuICAgIHRoaXMucHJlb3JkZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIGlmICh2aXNpdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KSkge1xuICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIHN0b3BXYWxrO1xuICAgICAgfVxuICAgIH0sIGNvbnRleHQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG5cbiAgLy8gUmVjdXJzaXZlbHkgdHJhdmVyc2VzIGBvYmpgIGFuZCByZXR1cm5zIGFsbCB0aGUgZWxlbWVudHMgdGhhdCBwYXNzIGFcbiAgLy8gdHJ1dGggdGVzdC4gYHN0cmF0ZWd5YCBpcyB0aGUgdHJhdmVyc2FsIGZ1bmN0aW9uIHRvIHVzZSwgZS5nLiBgcHJlb3JkZXJgXG4gIC8vIG9yIGBwb3N0b3JkZXJgLlxuICBmaWx0ZXI6IGZ1bmN0aW9uKG9iaiwgc3RyYXRlZ3ksIHZpc2l0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGlmIChvYmogPT09IG51bGwpIHJldHVybiByZXN1bHRzO1xuICAgIHN0cmF0ZWd5KG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICBpZiAodmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCkpIHJlc3VsdHMucHVzaCh2YWx1ZSk7XG4gICAgfSwgbnVsbCwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3kpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBhbmQgcmV0dXJucyBhbGwgdGhlIGVsZW1lbnRzIGZvciB3aGljaCBhXG4gIC8vIHRydXRoIHRlc3QgZmFpbHMuXG4gIHJlamVjdDogZnVuY3Rpb24ob2JqLCBzdHJhdGVneSwgdmlzaXRvciwgY29udGV4dCkge1xuICAgIHJldHVybiB0aGlzLmZpbHRlcihvYmosIHN0cmF0ZWd5LCBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIHJldHVybiAhdmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgfSk7XG4gIH0sXG5cbiAgLy8gUHJvZHVjZXMgYSBuZXcgYXJyYXkgb2YgdmFsdWVzIGJ5IHJlY3Vyc2l2ZWx5IHRyYXZlcnNpbmcgYG9iamAgYW5kXG4gIC8vIG1hcHBpbmcgZWFjaCB2YWx1ZSB0aHJvdWdoIHRoZSB0cmFuc2Zvcm1hdGlvbiBmdW5jdGlvbiBgdmlzaXRvcmAuXG4gIC8vIGBzdHJhdGVneWAgaXMgdGhlIHRyYXZlcnNhbCBmdW5jdGlvbiB0byB1c2UsIGUuZy4gYHByZW9yZGVyYCBvclxuICAvLyBgcG9zdG9yZGVyYC5cbiAgbWFwOiBmdW5jdGlvbihvYmosIHN0cmF0ZWd5LCB2aXNpdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBzdHJhdGVneShvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIHBhcmVudCkge1xuICAgICAgcmVzdWx0c1tyZXN1bHRzLmxlbmd0aF0gPSB2aXNpdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICB9LCBudWxsLCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0sXG5cbiAgLy8gUmV0dXJuIHRoZSB2YWx1ZSBvZiBwcm9wZXJ0aWVzIG5hbWVkIGBwcm9wZXJ0eU5hbWVgIHJlYWNoYWJsZSBmcm9tIHRoZVxuICAvLyB0cmVlIHJvb3RlZCBhdCBgb2JqYC4gUmVzdWx0cyBhcmUgbm90IHJlY3Vyc2l2ZWx5IHNlYXJjaGVkOyB1c2VcbiAgLy8gYHBsdWNrUmVjYCBmb3IgdGhhdC5cbiAgcGx1Y2s6IGZ1bmN0aW9uKG9iaiwgcHJvcGVydHlOYW1lKSB7XG4gICAgcmV0dXJuIHBsdWNrLmNhbGwodGhpcywgb2JqLCBwcm9wZXJ0eU5hbWUsIGZhbHNlKTtcbiAgfSxcblxuICAvLyBWZXJzaW9uIG9mIGBwbHVja2Agd2hpY2ggcmVjdXJzaXZlbHkgc2VhcmNoZXMgcmVzdWx0cyBmb3IgbmVzdGVkIG9iamVjdHNcbiAgLy8gd2l0aCBhIHByb3BlcnR5IG5hbWVkIGBwcm9wZXJ0eU5hbWVgLlxuICBwbHVja1JlYzogZnVuY3Rpb24ob2JqLCBwcm9wZXJ0eU5hbWUpIHtcbiAgICByZXR1cm4gcGx1Y2suY2FsbCh0aGlzLCBvYmosIHByb3BlcnR5TmFtZSwgdHJ1ZSk7XG4gIH0sXG5cbiAgLy8gUmVjdXJzaXZlbHkgdHJhdmVyc2VzIGBvYmpgIGluIGEgZGVwdGgtZmlyc3QgZmFzaGlvbiwgaW52b2tpbmcgdGhlXG4gIC8vIGB2aXNpdG9yYCBmdW5jdGlvbiBmb3IgZWFjaCBvYmplY3Qgb25seSBhZnRlciB0cmF2ZXJzaW5nIGl0cyBjaGlsZHJlbi5cbiAgLy8gYHRyYXZlcnNhbFN0cmF0ZWd5YCBpcyBpbnRlbmRlZCBmb3IgaW50ZXJuYWwgY2FsbGVycywgYW5kIGlzIG5vdCBwYXJ0XG4gIC8vIG9mIHRoZSBwdWJsaWMgQVBJLlxuICBwb3N0b3JkZXI6IGZ1bmN0aW9uKG9iaiwgdmlzaXRvciwgY29udGV4dCwgdHJhdmVyc2FsU3RyYXRlZ3kpIHtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IHRyYXZlcnNhbFN0cmF0ZWd5IHx8IHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5O1xuICAgIHdhbGtJbXBsKG9iaiwgdHJhdmVyc2FsU3RyYXRlZ3ksIG51bGwsIHZpc2l0b3IsIGNvbnRleHQpO1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBpbiBhIGRlcHRoLWZpcnN0IGZhc2hpb24sIGludm9raW5nIHRoZVxuICAvLyBgdmlzaXRvcmAgZnVuY3Rpb24gZm9yIGVhY2ggb2JqZWN0IGJlZm9yZSB0cmF2ZXJzaW5nIGl0cyBjaGlsZHJlbi5cbiAgLy8gYHRyYXZlcnNhbFN0cmF0ZWd5YCBpcyBpbnRlbmRlZCBmb3IgaW50ZXJuYWwgY2FsbGVycywgYW5kIGlzIG5vdCBwYXJ0XG4gIC8vIG9mIHRoZSBwdWJsaWMgQVBJLlxuICBwcmVvcmRlcjogZnVuY3Rpb24ob2JqLCB2aXNpdG9yLCBjb250ZXh0LCB0cmF2ZXJzYWxTdHJhdGVneSkge1xuICAgIHRyYXZlcnNhbFN0cmF0ZWd5ID0gdHJhdmVyc2FsU3RyYXRlZ3kgfHwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3k7XG4gICAgd2Fsa0ltcGwob2JqLCB0cmF2ZXJzYWxTdHJhdGVneSwgdmlzaXRvciwgbnVsbCwgY29udGV4dCk7XG4gIH0sXG5cbiAgLy8gQnVpbGRzIHVwIGEgc2luZ2xlIHZhbHVlIGJ5IGRvaW5nIGEgcG9zdC1vcmRlciB0cmF2ZXJzYWwgb2YgYG9iamAgYW5kXG4gIC8vIGNhbGxpbmcgdGhlIGB2aXNpdG9yYCBmdW5jdGlvbiBvbiBlYWNoIG9iamVjdCBpbiB0aGUgdHJlZS4gRm9yIGxlYWZcbiAgLy8gb2JqZWN0cywgdGhlIGBtZW1vYCBhcmd1bWVudCB0byBgdmlzaXRvcmAgaXMgdGhlIHZhbHVlIG9mIHRoZSBgbGVhZk1lbW9gXG4gIC8vIGFyZ3VtZW50IHRvIGByZWR1Y2VgLiBGb3Igbm9uLWxlYWYgb2JqZWN0cywgYG1lbW9gIGlzIGEgY29sbGVjdGlvbiBvZlxuICAvLyB0aGUgcmVzdWx0cyBvZiBjYWxsaW5nIGByZWR1Y2VgIG9uIHRoZSBvYmplY3QncyBjaGlsZHJlbi5cbiAgcmVkdWNlOiBmdW5jdGlvbihvYmosIHZpc2l0b3IsIGxlYWZNZW1vLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlZHVjZXIgPSBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQsIHN1YlJlc3VsdHMpIHtcbiAgICAgIHJldHVybiB2aXNpdG9yKHN1YlJlc3VsdHMgfHwgbGVhZk1lbW8sIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgfTtcbiAgICByZXR1cm4gd2Fsa0ltcGwob2JqLCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneSwgbnVsbCwgcmVkdWNlciwgY29udGV4dCwgdHJ1ZSk7XG4gIH0sXG5cbiAgLy8gQW4gJ2F0dHJpYnV0ZScgaXMgYSB2YWx1ZSB0aGF0IGlzIGNhbGN1bGF0ZWQgYnkgaW52b2tpbmcgYSB2aXNpdG9yXG4gIC8vIGZ1bmN0aW9uIG9uIGEgbm9kZS4gVGhlIGZpcnN0IGFyZ3VtZW50IG9mIHRoZSB2aXNpdG9yIGlzIGEgY29sbGVjdGlvblxuICAvLyBvZiB0aGUgYXR0cmlidXRlIHZhbHVlcyBmb3IgdGhlIG5vZGUncyBjaGlsZHJlbi4gVGhlc2UgYXJlIGNhbGN1bGF0ZWRcbiAgLy8gbGF6aWx5IC0tIGluIHRoaXMgd2F5IHRoZSB2aXNpdG9yIGNhbiBkZWNpZGUgaW4gd2hhdCBvcmRlciB0byB2aXNpdCB0aGVcbiAgLy8gc3VidHJlZXMuXG4gIGNyZWF0ZUF0dHJpYnV0ZTogZnVuY3Rpb24odmlzaXRvciwgZGVmYXVsdFZhbHVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBtZW1vID0gbmV3IFdlYWtNYXAoKTtcbiAgICBmdW5jdGlvbiBfdmlzaXQoc3RhY2ssIHZhbHVlLCBrZXksIHBhcmVudCkge1xuICAgICAgaWYgKF8uaXNPYmplY3QodmFsdWUpICYmIHN0YWNrLmluZGV4T2YodmFsdWUpID49IDApXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0EgY3ljbGUgd2FzIGRldGVjdGVkIGF0ICcgKyB2YWx1ZSk7XG5cbiAgICAgIGlmIChtZW1vLmhhcyh2YWx1ZSkpXG4gICAgICAgIHJldHVybiBtZW1vLmdldCh2YWx1ZSk7XG5cbiAgICAgIHZhciBzdWJSZXN1bHRzO1xuICAgICAgdmFyIHRhcmdldCA9IHNlbGYuX3RyYXZlcnNhbFN0cmF0ZWd5KHZhbHVlKTtcbiAgICAgIGlmIChfLmlzT2JqZWN0KHRhcmdldCkgJiYgXy5zaXplKHRhcmdldCkgPiAwKSB7XG4gICAgICAgIHN1YlJlc3VsdHMgPSB7fTtcbiAgICAgICAgXy5hbnkodGFyZ2V0LCBmdW5jdGlvbihjaGlsZCwgaykge1xuICAgICAgICAgIGRlZmluZUVudW1lcmFibGVQcm9wZXJ0eShzdWJSZXN1bHRzLCBrLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBfdmlzaXQoY29weUFuZFB1c2goc3RhY2ssdmFsdWUpLCBjaGlsZCwgaywgdmFsdWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHZhciByZXN1bHQgPSB2aXNpdG9yLmNhbGwoY29udGV4dCwgc3ViUmVzdWx0cywgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICAgIG1lbW8uc2V0KHZhbHVlLCByZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikgeyByZXR1cm4gX3Zpc2l0KFtdLCBvYmopOyB9O1xuICB9XG59KTtcblxudmFyIFdhbGtlclByb3RvID0gV2Fsa2VyLnByb3RvdHlwZTtcblxuLy8gU2V0IHVwIGEgZmV3IGNvbnZlbmllbnQgYWxpYXNlcy5cbldhbGtlclByb3RvLmVhY2ggPSBXYWxrZXJQcm90by5wcmVvcmRlcjtcbldhbGtlclByb3RvLmNvbGxlY3QgPSBXYWxrZXJQcm90by5tYXA7XG5XYWxrZXJQcm90by5kZXRlY3QgPSBXYWxrZXJQcm90by5maW5kO1xuV2Fsa2VyUHJvdG8uc2VsZWN0ID0gV2Fsa2VyUHJvdG8uZmlsdGVyO1xuXG4vLyBFeHBvcnQgdGhlIHdhbGtlciBjb25zdHJ1Y3RvciwgYnV0IG1ha2UgaXQgYmVoYXZlIGxpa2UgYW4gaW5zdGFuY2UuXG5XYWxrZXIuX3RyYXZlcnNhbFN0cmF0ZWd5ID0gZGVmYXVsdFRyYXZlcnNhbDtcbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kKFdhbGtlciwgV2Fsa2VyUHJvdG8pO1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kO1xuZnVuY3Rpb24gZXh0ZW5kKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgdHlwZW9mIGFkZCAhPT0gJ29iamVjdCcpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59XG4iLCIvKlxuICogQ29weXJpZ2h0IDIwMTIgVGhlIFBvbHltZXIgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGEgQlNELXN0eWxlXG4gKiBsaWNlbnNlIHRoYXQgY2FuIGJlIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUuXG4gKi9cblxuaWYgKHR5cGVvZiBXZWFrTWFwID09PSAndW5kZWZpbmVkJykge1xuICAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIGRlZmluZVByb3BlcnR5ID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuICAgIHZhciBjb3VudGVyID0gRGF0ZS5ub3coKSAlIDFlOTtcblxuICAgIHZhciBXZWFrTWFwID0gZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLm5hbWUgPSAnX19zdCcgKyAoTWF0aC5yYW5kb20oKSAqIDFlOSA+Pj4gMCkgKyAoY291bnRlcisrICsgJ19fJyk7XG4gICAgfTtcblxuICAgIFdlYWtNYXAucHJvdG90eXBlID0ge1xuICAgICAgc2V0OiBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICBpZiAoZW50cnkgJiYgZW50cnlbMF0gPT09IGtleSlcbiAgICAgICAgICBlbnRyeVsxXSA9IHZhbHVlO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgZGVmaW5lUHJvcGVydHkoa2V5LCB0aGlzLm5hbWUsIHt2YWx1ZTogW2tleSwgdmFsdWVdLCB3cml0YWJsZTogdHJ1ZX0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0sXG4gICAgICBnZXQ6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZW50cnk7XG4gICAgICAgIHJldHVybiAoZW50cnkgPSBrZXlbdGhpcy5uYW1lXSkgJiYgZW50cnlbMF0gPT09IGtleSA/XG4gICAgICAgICAgICBlbnRyeVsxXSA6IHVuZGVmaW5lZDtcbiAgICAgIH0sXG4gICAgICBkZWxldGU6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZW50cnkgPSBrZXlbdGhpcy5uYW1lXTtcbiAgICAgICAgaWYgKCFlbnRyeSB8fCBlbnRyeVswXSAhPT0ga2V5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGVudHJ5WzBdID0gZW50cnlbMV0gPSB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSxcbiAgICAgIGhhczogZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBlbnRyeSA9IGtleVt0aGlzLm5hbWVdO1xuICAgICAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiBlbnRyeVswXSA9PT0ga2V5O1xuICAgICAgfVxuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IFdlYWtNYXA7XG4gIH0pKCk7XG59IGVsc2Uge1xuICBtb2R1bGUuZXhwb3J0cyA9IFdlYWtNYXA7XG59XG4iXX0=
