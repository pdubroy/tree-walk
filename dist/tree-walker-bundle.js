!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.treeWalker=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Copyright (c) 2014 Patrick Dubroy <pdubroy@gmail.com>
// This software is distributed under the terms of the MIT License.

var extend = require('util-extend');

// An internal object that can be returned from a visitor function to
// prevent a top-down walk from walking subtrees of a node.
var stopRecursion = {};

// An internal object that can be returned from a visitor function to
// cause the walk to immediately stop.
var stopWalk = {};

var notTreeError = 'Not a tree: same object found in two different branches';
var hasOwnProp = Object.prototype.hasOwnProperty;

// Helpers
// -------

// Replacement for a few functions from Underscore that we need.
var _ = {
  any: function(obj, predicate) {
    if (obj === null || !obj) return false;
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
  }
};

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
  var visited = [];
  return (function _walk(value, key, parent) {
    // Keep track of objects that have been visited, and throw an exception
    // when trying to visit the same object twice.
    if (_.isObject(value)) {
      if (visited.indexOf(value) >= 0) throw new TypeError(notTreeError);
      visited.push(value);
    }

    if (beforeFunc) {
      var result = beforeFunc.call(context, value, key, parent);
      if (result === stopWalk) return stopWalk;
      if (result === stopRecursion) return;
    }

    var subResults;
    var target = traversalStrategy(value);
    if (_.isObject(target)) {
      // Collect results from subtrees in the same shape as the target.
      if (collectResults) subResults = Array.isArray(target) ? [] : {};

      var stop = _.any(target, function(obj, key) {
        var result = _walk(obj, key, value);
        if (result === stopWalk) return true;
        if (subResults) subResults[key] = result;
      });
      if (stop) return stopWalk;
    }
    if (afterFunc) return afterFunc.call(context, value, key, parent, subResults);
  })(root);
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

},{"util-extend":2}],2:[function(require,module,exports){
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

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvaW5kZXguanMiLCIvVXNlcnMvZHVicm95L2Rldi90cmVlLXdhbGsvbm9kZV9tb2R1bGVzL3V0aWwtZXh0ZW5kL2V4dGVuZC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vIENvcHlyaWdodCAoYykgMjAxNCBQYXRyaWNrIER1YnJveSA8cGR1YnJveUBnbWFpbC5jb20+XG4vLyBUaGlzIHNvZnR3YXJlIGlzIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgTUlUIExpY2Vuc2UuXG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCd1dGlsLWV4dGVuZCcpO1xuXG4vLyBBbiBpbnRlcm5hbCBvYmplY3QgdGhhdCBjYW4gYmUgcmV0dXJuZWQgZnJvbSBhIHZpc2l0b3IgZnVuY3Rpb24gdG9cbi8vIHByZXZlbnQgYSB0b3AtZG93biB3YWxrIGZyb20gd2Fsa2luZyBzdWJ0cmVlcyBvZiBhIG5vZGUuXG52YXIgc3RvcFJlY3Vyc2lvbiA9IHt9O1xuXG4vLyBBbiBpbnRlcm5hbCBvYmplY3QgdGhhdCBjYW4gYmUgcmV0dXJuZWQgZnJvbSBhIHZpc2l0b3IgZnVuY3Rpb24gdG9cbi8vIGNhdXNlIHRoZSB3YWxrIHRvIGltbWVkaWF0ZWx5IHN0b3AuXG52YXIgc3RvcFdhbGsgPSB7fTtcblxudmFyIG5vdFRyZWVFcnJvciA9ICdOb3QgYSB0cmVlOiBzYW1lIG9iamVjdCBmb3VuZCBpbiB0d28gZGlmZmVyZW50IGJyYW5jaGVzJztcbnZhciBoYXNPd25Qcm9wID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gSGVscGVyc1xuLy8gLS0tLS0tLVxuXG4vLyBSZXBsYWNlbWVudCBmb3IgYSBmZXcgZnVuY3Rpb25zIGZyb20gVW5kZXJzY29yZSB0aGF0IHdlIG5lZWQuXG52YXIgXyA9IHtcbiAgYW55OiBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSkge1xuICAgIGlmIChvYmogPT09IG51bGwgfHwgIW9iaikgcmV0dXJuIGZhbHNlO1xuICAgIHZhciBrZXlzID0gb2JqLmxlbmd0aCAhPT0gK29iai5sZW5ndGggJiYgT2JqZWN0LmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgIGluZGV4LCBjdXJyZW50S2V5O1xuICAgIGZvciAoaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgaWYgKHByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG4gIGlzRWxlbWVudDogZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuICEhKG9iaiAmJiBvYmoubm9kZVR5cGUgPT09IDEpO1xuICB9LFxuICBpc09iamVjdDogZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHR5cGUgPSB0eXBlb2Ygb2JqO1xuICAgIHJldHVybiB0eXBlID09PSAnZnVuY3Rpb24nIHx8IHR5cGUgPT09ICdvYmplY3QnICYmICEhb2JqO1xuICB9XG59O1xuXG4vLyBJbXBsZW1lbnRzIHRoZSBkZWZhdWx0IHRyYXZlcnNhbCBzdHJhdGVneTogaWYgYG9iamAgaXMgYSBET00gbm9kZSwgd2Fsa1xuLy8gaXRzIERPTSBjaGlsZHJlbjsgb3RoZXJ3aXNlLCB3YWxrIGFsbCB0aGUgb2JqZWN0cyBpdCByZWZlcmVuY2VzLlxuZnVuY3Rpb24gZGVmYXVsdFRyYXZlcnNhbChvYmopIHtcbiAgcmV0dXJuIF8uaXNFbGVtZW50KG9iaikgPyBvYmouY2hpbGRyZW4gOiBvYmo7XG59XG5cbi8vIFdhbGsgdGhlIHRyZWUgcmVjdXJzaXZlbHkgYmVnaW5uaW5nIHdpdGggYHJvb3RgLCBjYWxsaW5nIGBiZWZvcmVGdW5jYFxuLy8gYmVmb3JlIHZpc2l0aW5nIGFuIG9iamVjdHMgZGVzY2VuZGVudHMsIGFuZCBgYWZ0ZXJGdW5jYCBhZnRlcndhcmRzLlxuLy8gSWYgYGNvbGxlY3RSZXN1bHRzYCBpcyB0cnVlLCB0aGUgbGFzdCBhcmd1bWVudCB0byBgYWZ0ZXJGdW5jYCB3aWxsIGJlIGFcbi8vIGNvbGxlY3Rpb24gb2YgdGhlIHJlc3VsdHMgb2Ygd2Fsa2luZyB0aGUgbm9kZSdzIHN1YnRyZWVzLlxuZnVuY3Rpb24gd2Fsa0ltcGwocm9vdCwgdHJhdmVyc2FsU3RyYXRlZ3ksIGJlZm9yZUZ1bmMsIGFmdGVyRnVuYywgY29udGV4dCwgY29sbGVjdFJlc3VsdHMpIHtcbiAgdmFyIHZpc2l0ZWQgPSBbXTtcbiAgcmV0dXJuIChmdW5jdGlvbiBfd2Fsayh2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAvLyBLZWVwIHRyYWNrIG9mIG9iamVjdHMgdGhhdCBoYXZlIGJlZW4gdmlzaXRlZCwgYW5kIHRocm93IGFuIGV4Y2VwdGlvblxuICAgIC8vIHdoZW4gdHJ5aW5nIHRvIHZpc2l0IHRoZSBzYW1lIG9iamVjdCB0d2ljZS5cbiAgICBpZiAoXy5pc09iamVjdCh2YWx1ZSkpIHtcbiAgICAgIGlmICh2aXNpdGVkLmluZGV4T2YodmFsdWUpID49IDApIHRocm93IG5ldyBUeXBlRXJyb3Iobm90VHJlZUVycm9yKTtcbiAgICAgIHZpc2l0ZWQucHVzaCh2YWx1ZSk7XG4gICAgfVxuXG4gICAgaWYgKGJlZm9yZUZ1bmMpIHtcbiAgICAgIHZhciByZXN1bHQgPSBiZWZvcmVGdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IHN0b3BXYWxrKSByZXR1cm4gc3RvcFdhbGs7XG4gICAgICBpZiAocmVzdWx0ID09PSBzdG9wUmVjdXJzaW9uKSByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHN1YlJlc3VsdHM7XG4gICAgdmFyIHRhcmdldCA9IHRyYXZlcnNhbFN0cmF0ZWd5KHZhbHVlKTtcbiAgICBpZiAoXy5pc09iamVjdCh0YXJnZXQpKSB7XG4gICAgICAvLyBDb2xsZWN0IHJlc3VsdHMgZnJvbSBzdWJ0cmVlcyBpbiB0aGUgc2FtZSBzaGFwZSBhcyB0aGUgdGFyZ2V0LlxuICAgICAgaWYgKGNvbGxlY3RSZXN1bHRzKSBzdWJSZXN1bHRzID0gQXJyYXkuaXNBcnJheSh0YXJnZXQpID8gW10gOiB7fTtcblxuICAgICAgdmFyIHN0b3AgPSBfLmFueSh0YXJnZXQsIGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBfd2FsayhvYmosIGtleSwgdmFsdWUpO1xuICAgICAgICBpZiAocmVzdWx0ID09PSBzdG9wV2FsaykgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChzdWJSZXN1bHRzKSBzdWJSZXN1bHRzW2tleV0gPSByZXN1bHQ7XG4gICAgICB9KTtcbiAgICAgIGlmIChzdG9wKSByZXR1cm4gc3RvcFdhbGs7XG4gICAgfVxuICAgIGlmIChhZnRlckZ1bmMpIHJldHVybiBhZnRlckZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwga2V5LCBwYXJlbnQsIHN1YlJlc3VsdHMpO1xuICB9KShyb290KTtcbn1cblxuLy8gSW50ZXJuYWwgaGVscGVyIHByb3ZpZGluZyB0aGUgaW1wbGVtZW50YXRpb24gZm9yIGBwbHVja2AgYW5kIGBwbHVja1JlY2AuXG5mdW5jdGlvbiBwbHVjayhvYmosIHByb3BlcnR5TmFtZSwgcmVjdXJzaXZlKSB7XG4gIHZhciByZXN1bHRzID0gW107XG4gIHRoaXMucHJlb3JkZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgaWYgKCFyZWN1cnNpdmUgJiYga2V5ID09IHByb3BlcnR5TmFtZSlcbiAgICAgIHJldHVybiBzdG9wUmVjdXJzaW9uO1xuICAgIGlmIChoYXNPd25Qcm9wLmNhbGwodmFsdWUsIHByb3BlcnR5TmFtZSkpXG4gICAgICByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoXSA9IHZhbHVlW3Byb3BlcnR5TmFtZV07XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0cztcbn1cblxuLy8gUmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgd2FsayBmdW5jdGlvbnMuIElmIGB0cmF2ZXJzYWxTdHJhdGVneWBcbi8vIGlzIHNwZWNpZmllZCwgaXQgaXMgYSBmdW5jdGlvbiBkZXRlcm1pbmluZyBob3cgb2JqZWN0cyBzaG91bGQgYmVcbi8vIHRyYXZlcnNlZC4gR2l2ZW4gYW4gb2JqZWN0LCBpdCByZXR1cm5zIHRoZSBvYmplY3QgdG8gYmUgcmVjdXJzaXZlbHlcbi8vIHdhbGtlZC4gVGhlIGRlZmF1bHQgc3RyYXRlZ3kgaXMgZXF1aXZhbGVudCB0byBgXy5pZGVudGl0eWAgZm9yIHJlZ3VsYXJcbi8vIG9iamVjdHMsIGFuZCBmb3IgRE9NIG5vZGVzIGl0IHJldHVybnMgdGhlIG5vZGUncyBET00gY2hpbGRyZW4uXG5mdW5jdGlvbiBXYWxrZXIodHJhdmVyc2FsU3RyYXRlZ3kpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFdhbGtlcikpXG4gICAgcmV0dXJuIG5ldyBXYWxrZXIodHJhdmVyc2FsU3RyYXRlZ3kpO1xuICB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneSA9IHRyYXZlcnNhbFN0cmF0ZWd5IHx8IGRlZmF1bHRUcmF2ZXJzYWw7XG59XG5cbmV4dGVuZChXYWxrZXIucHJvdG90eXBlLCB7XG4gIC8vIFBlcmZvcm1zIGEgcHJlb3JkZXIgdHJhdmVyc2FsIG9mIGBvYmpgIGFuZCByZXR1cm5zIHRoZSBmaXJzdCB2YWx1ZVxuICAvLyB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LlxuICBmaW5kOiBmdW5jdGlvbihvYmosIHZpc2l0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0O1xuICAgIHRoaXMucHJlb3JkZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIGlmICh2aXNpdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KSkge1xuICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIHN0b3BXYWxrO1xuICAgICAgfVxuICAgIH0sIGNvbnRleHQpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG5cbiAgLy8gUmVjdXJzaXZlbHkgdHJhdmVyc2VzIGBvYmpgIGFuZCByZXR1cm5zIGFsbCB0aGUgZWxlbWVudHMgdGhhdCBwYXNzIGFcbiAgLy8gdHJ1dGggdGVzdC4gYHN0cmF0ZWd5YCBpcyB0aGUgdHJhdmVyc2FsIGZ1bmN0aW9uIHRvIHVzZSwgZS5nLiBgcHJlb3JkZXJgXG4gIC8vIG9yIGBwb3N0b3JkZXJgLlxuICBmaWx0ZXI6IGZ1bmN0aW9uKG9iaiwgc3RyYXRlZ3ksIHZpc2l0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGlmIChvYmogPT09IG51bGwpIHJldHVybiByZXN1bHRzO1xuICAgIHN0cmF0ZWd5KG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSwgcGFyZW50KSB7XG4gICAgICBpZiAodmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCkpIHJlc3VsdHMucHVzaCh2YWx1ZSk7XG4gICAgfSwgbnVsbCwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3kpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBhbmQgcmV0dXJucyBhbGwgdGhlIGVsZW1lbnRzIGZvciB3aGljaCBhXG4gIC8vIHRydXRoIHRlc3QgZmFpbHMuXG4gIHJlamVjdDogZnVuY3Rpb24ob2JqLCBzdHJhdGVneSwgdmlzaXRvciwgY29udGV4dCkge1xuICAgIHJldHVybiB0aGlzLmZpbHRlcihvYmosIHN0cmF0ZWd5LCBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQpIHtcbiAgICAgIHJldHVybiAhdmlzaXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgfSk7XG4gIH0sXG5cbiAgLy8gUHJvZHVjZXMgYSBuZXcgYXJyYXkgb2YgdmFsdWVzIGJ5IHJlY3Vyc2l2ZWx5IHRyYXZlcnNpbmcgYG9iamAgYW5kXG4gIC8vIG1hcHBpbmcgZWFjaCB2YWx1ZSB0aHJvdWdoIHRoZSB0cmFuc2Zvcm1hdGlvbiBmdW5jdGlvbiBgdmlzaXRvcmAuXG4gIC8vIGBzdHJhdGVneWAgaXMgdGhlIHRyYXZlcnNhbCBmdW5jdGlvbiB0byB1c2UsIGUuZy4gYHByZW9yZGVyYCBvclxuICAvLyBgcG9zdG9yZGVyYC5cbiAgbWFwOiBmdW5jdGlvbihvYmosIHN0cmF0ZWd5LCB2aXNpdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBzdHJhdGVneShvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIHBhcmVudCkge1xuICAgICAgcmVzdWx0c1tyZXN1bHRzLmxlbmd0aF0gPSB2aXNpdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGtleSwgcGFyZW50KTtcbiAgICB9LCBudWxsLCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0sXG5cbiAgLy8gUmV0dXJuIHRoZSB2YWx1ZSBvZiBwcm9wZXJ0aWVzIG5hbWVkIGBwcm9wZXJ0eU5hbWVgIHJlYWNoYWJsZSBmcm9tIHRoZVxuICAvLyB0cmVlIHJvb3RlZCBhdCBgb2JqYC4gUmVzdWx0cyBhcmUgbm90IHJlY3Vyc2l2ZWx5IHNlYXJjaGVkOyB1c2VcbiAgLy8gYHBsdWNrUmVjYCBmb3IgdGhhdC5cbiAgcGx1Y2s6IGZ1bmN0aW9uKG9iaiwgcHJvcGVydHlOYW1lKSB7XG4gICAgcmV0dXJuIHBsdWNrLmNhbGwodGhpcywgb2JqLCBwcm9wZXJ0eU5hbWUsIGZhbHNlKTtcbiAgfSxcblxuICAvLyBWZXJzaW9uIG9mIGBwbHVja2Agd2hpY2ggcmVjdXJzaXZlbHkgc2VhcmNoZXMgcmVzdWx0cyBmb3IgbmVzdGVkIG9iamVjdHNcbiAgLy8gd2l0aCBhIHByb3BlcnR5IG5hbWVkIGBwcm9wZXJ0eU5hbWVgLlxuICBwbHVja1JlYzogZnVuY3Rpb24ob2JqLCBwcm9wZXJ0eU5hbWUpIHtcbiAgICByZXR1cm4gcGx1Y2suY2FsbCh0aGlzLCBvYmosIHByb3BlcnR5TmFtZSwgdHJ1ZSk7XG4gIH0sXG5cbiAgLy8gUmVjdXJzaXZlbHkgdHJhdmVyc2VzIGBvYmpgIGluIGEgZGVwdGgtZmlyc3QgZmFzaGlvbiwgaW52b2tpbmcgdGhlXG4gIC8vIGB2aXNpdG9yYCBmdW5jdGlvbiBmb3IgZWFjaCBvYmplY3Qgb25seSBhZnRlciB0cmF2ZXJzaW5nIGl0cyBjaGlsZHJlbi5cbiAgLy8gYHRyYXZlcnNhbFN0cmF0ZWd5YCBpcyBpbnRlbmRlZCBmb3IgaW50ZXJuYWwgY2FsbGVycywgYW5kIGlzIG5vdCBwYXJ0XG4gIC8vIG9mIHRoZSBwdWJsaWMgQVBJLlxuICBwb3N0b3JkZXI6IGZ1bmN0aW9uKG9iaiwgdmlzaXRvciwgY29udGV4dCwgdHJhdmVyc2FsU3RyYXRlZ3kpIHtcbiAgICB0cmF2ZXJzYWxTdHJhdGVneSA9IHRyYXZlcnNhbFN0cmF0ZWd5IHx8IHRoaXMuX3RyYXZlcnNhbFN0cmF0ZWd5O1xuICAgIHdhbGtJbXBsKG9iaiwgdHJhdmVyc2FsU3RyYXRlZ3ksIG51bGwsIHZpc2l0b3IsIGNvbnRleHQpO1xuICB9LFxuXG4gIC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlcyBgb2JqYCBpbiBhIGRlcHRoLWZpcnN0IGZhc2hpb24sIGludm9raW5nIHRoZVxuICAvLyBgdmlzaXRvcmAgZnVuY3Rpb24gZm9yIGVhY2ggb2JqZWN0IGJlZm9yZSB0cmF2ZXJzaW5nIGl0cyBjaGlsZHJlbi5cbiAgLy8gYHRyYXZlcnNhbFN0cmF0ZWd5YCBpcyBpbnRlbmRlZCBmb3IgaW50ZXJuYWwgY2FsbGVycywgYW5kIGlzIG5vdCBwYXJ0XG4gIC8vIG9mIHRoZSBwdWJsaWMgQVBJLlxuICBwcmVvcmRlcjogZnVuY3Rpb24ob2JqLCB2aXNpdG9yLCBjb250ZXh0LCB0cmF2ZXJzYWxTdHJhdGVneSkge1xuICAgIHRyYXZlcnNhbFN0cmF0ZWd5ID0gdHJhdmVyc2FsU3RyYXRlZ3kgfHwgdGhpcy5fdHJhdmVyc2FsU3RyYXRlZ3k7XG4gICAgd2Fsa0ltcGwob2JqLCB0cmF2ZXJzYWxTdHJhdGVneSwgdmlzaXRvciwgbnVsbCwgY29udGV4dCk7XG4gIH0sXG5cbiAgLy8gQnVpbGRzIHVwIGEgc2luZ2xlIHZhbHVlIGJ5IGRvaW5nIGEgcG9zdC1vcmRlciB0cmF2ZXJzYWwgb2YgYG9iamAgYW5kXG4gIC8vIGNhbGxpbmcgdGhlIGB2aXNpdG9yYCBmdW5jdGlvbiBvbiBlYWNoIG9iamVjdCBpbiB0aGUgdHJlZS4gRm9yIGxlYWZcbiAgLy8gb2JqZWN0cywgdGhlIGBtZW1vYCBhcmd1bWVudCB0byBgdmlzaXRvcmAgaXMgdGhlIHZhbHVlIG9mIHRoZSBgbGVhZk1lbW9gXG4gIC8vIGFyZ3VtZW50IHRvIGByZWR1Y2VgLiBGb3Igbm9uLWxlYWYgb2JqZWN0cywgYG1lbW9gIGlzIGEgY29sbGVjdGlvbiBvZlxuICAvLyB0aGUgcmVzdWx0cyBvZiBjYWxsaW5nIGByZWR1Y2VgIG9uIHRoZSBvYmplY3QncyBjaGlsZHJlbi5cbiAgcmVkdWNlOiBmdW5jdGlvbihvYmosIHZpc2l0b3IsIGxlYWZNZW1vLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlZHVjZXIgPSBmdW5jdGlvbih2YWx1ZSwga2V5LCBwYXJlbnQsIHN1YlJlc3VsdHMpIHtcbiAgICAgIHJldHVybiB2aXNpdG9yKHN1YlJlc3VsdHMgfHwgbGVhZk1lbW8sIHZhbHVlLCBrZXksIHBhcmVudCk7XG4gICAgfTtcbiAgICByZXR1cm4gd2Fsa0ltcGwob2JqLCB0aGlzLl90cmF2ZXJzYWxTdHJhdGVneSwgbnVsbCwgcmVkdWNlciwgY29udGV4dCwgdHJ1ZSk7XG4gIH1cbn0pO1xuXG52YXIgV2Fsa2VyUHJvdG8gPSBXYWxrZXIucHJvdG90eXBlO1xuXG4vLyBTZXQgdXAgYSBmZXcgY29udmVuaWVudCBhbGlhc2VzLlxuV2Fsa2VyUHJvdG8uZWFjaCA9IFdhbGtlclByb3RvLnByZW9yZGVyO1xuV2Fsa2VyUHJvdG8uY29sbGVjdCA9IFdhbGtlclByb3RvLm1hcDtcbldhbGtlclByb3RvLmRldGVjdCA9IFdhbGtlclByb3RvLmZpbmQ7XG5XYWxrZXJQcm90by5zZWxlY3QgPSBXYWxrZXJQcm90by5maWx0ZXI7XG5cbi8vIEV4cG9ydCB0aGUgd2Fsa2VyIGNvbnN0cnVjdG9yLCBidXQgbWFrZSBpdCBiZWhhdmUgbGlrZSBhbiBpbnN0YW5jZS5cbldhbGtlci5fdHJhdmVyc2FsU3RyYXRlZ3kgPSBkZWZhdWx0VHJhdmVyc2FsO1xubW9kdWxlLmV4cG9ydHMgPSBleHRlbmQoV2Fsa2VyLCBXYWxrZXJQcm90byk7XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxubW9kdWxlLmV4cG9ydHMgPSBleHRlbmQ7XG5mdW5jdGlvbiBleHRlbmQob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCB0eXBlb2YgYWRkICE9PSAnb2JqZWN0JykgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn1cbiJdfQ==
