/**
 * Mounts the real <App /> component.
 *
 * Every other test in this suite exercises exported functions in isolation, and
 * `vite build` only compiles without executing a component body. That leaves a
 * blind spot: a temporal-dead-zone reference, a bad hook order or a throwing
 * memo inside App() passes both gates and only fails in the browser, as a blank
 * page. This repo has already shipped exactly that bug once.
 *
 * Rendering the component here closes that gap. Both branches are worth running:
 * the signed-out branch already evaluates the ENTIRE App() body — every const,
 * hook and memo — and the signed-in branch additionally renders every tab.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';

const AUTH_STORAGE_KEY = 'captura-polizas.auth.v1';

function setupFakeDom(storedAuth) {
  let document;
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
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args)
  };
  // The signed-in branch fires catalog-loading effects that call the real API.
  // Without this stub the suite would make live outbound requests to a third-party
  // production endpoint carrying real tokens on every run, which is both a
  // side effect no test should have and an unbounded source of hangs and flakes.
  // The effects use Promise.allSettled, so rejecting here is handled cleanly.
  const blockedFetch = async () => {
    throw new Error('network access is disabled in tests');
  };
  window.fetch = blockedFetch;
  global.fetch = blockedFetch;

  document.defaultView = window;
  global.document = document;
  global.window = window;
  global.IS_REACT_ACT_ENVIRONMENT = true;
}

/**
 * Renders the app and tears it down again. Unmounting matters: the signed-in
 * branch schedules catalog-loading effects, and leaving them running past the
 * end of the test surfaces as asynchronous activity after the test ended.
 */
async function renderApp(storedAuth) {
  setupFakeDom(storedAuth);
  const { default: App } = await import('../src/App.jsx');
  const container = global.document.createElement('div');
  const root = createRoot(container);
  await act(() => root.render(createElement(App)));
  const rendered = container.children.length > 0;
  await act(() => root.unmount());
  return rendered;
}

describe('App renders', () => {
  it('mounts without throwing when signed out', async () => {
    assert.equal(await renderApp(null), true, 'expected the signed-out render to produce DOM');
  });

  it('mounts without throwing when signed in', async () => {
    const auth = JSON.stringify({
      Nombre: 'Prueba',
      Correo: 'prueba@example.com',
      Grupo: 'G1',
      IdVendedor: '1'
    });
    assert.equal(await renderApp(auth), true, 'expected the signed-in render to produce DOM');
  });
});
