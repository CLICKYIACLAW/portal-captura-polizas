/**
 * Shared fake DOM for the tests that mount the real <App />.
 *
 * Not a test file itself (the runner globs `harness/*.test.mjs`): it only holds
 * the browser surface React needs, so more than one suite can drive the real
 * component without duplicating it.
 */
import { act } from 'react';

const AUTH_STORAGE_KEY = 'captura-polizas.auth.v1';

export const SIGNED_IN = JSON.stringify({
  Nombre: 'Prueba',
  Correo: 'prueba@example.com',
  Grupo: 'G1',
  IdVendedor: '1'
});

/**
 * Installs the fake DOM globals and returns the set of timer handles opened
 * through `window.setTimeout`. Toasts schedule a 2.6s timer with no cleanup, so
 * a test that triggers one has to clear what is left after unmounting or the
 * runner reports asynchronous activity after the test ended.
 */
export function setupFakeDom(storedAuth, fetchImpl) {
  let document;
  const timers = new Set();
  class FakeNode {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attributes = {};
      this.style = {};
      this.nodeType = tag ? 1 : 3;
      this.ownerDocument = document;
      this.addEventListener = () => {};
      this.removeEventListener = () => {};
      this.dispatchEvent = () => {};
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    }
    removeChild(child) {
      this.children = this.children.filter((node) => node !== child);
    }
    insertBefore(child, before) {
      this.children.splice(this.children.indexOf(before), 0, child);
      child.parentNode = this;
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    }
    removeAttribute(key) {
      delete this.attributes[key];
    }
    contains(node) {
      return this.children.includes(node) || this.children.some((child) => child.contains && child.contains(node));
    }
    compareDocumentPosition(node) {
      return this === node ? 0 : 4;
    }
    focus() {
      document.activeElement = this;
    }
  }
  class FakeDocument {
    constructor() {
      this.body = new FakeNode('body');
      this.documentElement = new FakeNode('html');
      this.documentElement.appendChild(this.body);
      this.activeElement = this.body;
      this.defaultView = null;
    }
    createElement(tag) {
      return new FakeNode(tag);
    }
    // React may reach for namespaced elements while preloading resources.
    createElementNS(_namespace, tag) {
      return new FakeNode(tag);
    }
    createTextNode(text) {
      return Object.assign(new FakeNode(), { data: text, nodeType: 3 });
    }
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
    }
    addEventListener() {}
    removeEventListener() {}
  }
  class HTMLIFrameElement extends FakeNode {}

  document = new FakeDocument();
  const store = {
    getItem: (key) => (key === AUTH_STORAGE_KEY ? storedAuth ?? null : null),
    setItem: () => {},
    removeItem: () => {}
  };
  const window = {
    document,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: '' },
    HTMLIFrameElement,
    sessionStorage: store,
    localStorage: store,
    setTimeout: (...args) => {
      const handle = globalThis.setTimeout(...args);
      timers.add(handle);
      return handle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle);
      return globalThis.clearTimeout(handle);
    }
  };
  // The signed-in branch fires catalog-loading effects that call the real API.
  // Without this stub the suite would make live outbound requests to a third-party
  // production endpoint carrying real tokens on every run, which is both a
  // side effect no test should have and an unbounded source of hangs and flakes.
  // The effects use Promise.allSettled, so rejecting here is handled cleanly.
  const blockedFetch = async () => {
    throw new Error('network access is disabled in tests');
  };
  const fetchStub = fetchImpl || blockedFetch;
  window.fetch = fetchStub;
  global.fetch = fetchStub;

  document.defaultView = window;
  global.document = document;
  global.window = window;
  global.IS_REACT_ACT_ENVIRONMENT = true;

  return timers;
}

/** Drops every timer the fake window still holds open. */
export function clearPendingTimers(timers) {
  for (const handle of timers) globalThis.clearTimeout(handle);
  timers.clear();
}

export function walk(node, visit) {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}

/**
 * React keeps the props it rendered a host element with on the element itself,
 * which is the only handle on a click available here: the fake DOM has no event
 * system, so the delegated listeners React installs never fire.
 */
export function reactProps(node) {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps$'));
  return key ? node[key] : null;
}

/** Lets every already-resolved promise settle and React commit what they queued. */
export async function flush() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}
