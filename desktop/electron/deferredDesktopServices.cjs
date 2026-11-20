'use strict';

// Explicit service graph for Electron main-process factories.
// Calling an unbound dependency is a deterministic error rather than a TDZ ReferenceError.
function createDeferredDesktopServices(names) {
  const declared = new Set(names);
  const handlers = new Map();
  function bind(name, implementation) {
    if (!declared.has(name)) throw new Error(`Unknown desktop service: ${name}`);
    if (handlers.has(name)) throw new Error(`Desktop service already bound: ${name}`);
    if (typeof implementation !== 'function') throw new TypeError(`Desktop service must be a function: ${name}`);
    handlers.set(name, implementation);
  }
  function call(name, ...args) {
    if (!declared.has(name)) throw new Error(`Unknown desktop service: ${name}`);
    const implementation = handlers.get(name);
    if (!implementation) throw new Error(`Desktop service not initialized: ${name}`);
    return implementation(...args);
  }
  function assertReady() {
    const missing = [...declared].filter(name => !handlers.has(name));
    if (missing.length) throw new Error(`Desktop services not initialized: ${missing.join(', ')}`);
  }
  return { bind, call, assertReady };
}
module.exports = { createDeferredDesktopServices };
