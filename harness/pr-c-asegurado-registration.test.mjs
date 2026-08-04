import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'tsx';

// C1 + C2: asegurado registration hook exported from App.jsx
const appModule = await import('../src/App.jsx').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message?.includes('useAseguradoModal')) return {};
  throw error;
});
const useAseguradoModal = appModule.useAseguradoModal;

const utilsModule = await import('../src/lib/utils.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});

import { createElement, useState, act } from 'react';
import { createRoot } from 'react-dom/client';

function setupFakeDom() {
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
      this.children = this.children.filter((c) => c !== child);
    }
    insertBefore(child, before) {
      this.children.splice(this.children.indexOf(before), 0, child);
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    }
    removeAttribute(k) {
      delete this.attributes[k];
    }
    contains(node) {
      return this.children.includes(node) || this.children.some((c) => c.contains && c.contains(node));
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
    createTextNode(text) {
      return Object.assign(new FakeNode(), { data: text, nodeType: 3 });
    }
    addEventListener() {}
    removeEventListener() {}
  }
  class HTMLIFrameElement extends FakeNode {}
  document = new FakeDocument();
  const window = {
    document,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: '' },
    HTMLIFrameElement,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args)
  };
  document.defaultView = window;
  global.document = document;
  global.window = window;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return { document, window };
}

describe('asegurado registration UI', () => {
  it('keeps the capture asegurado combo selection-only and provides a dedicated modal flow', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const aseguradoRegionStart = appSource.indexOf('label="Asegurado"');
    const aseguradoRegionEnd = appSource.indexOf('</div>', aseguradoRegionStart) + '</div>'.length;
    const aseguradoRegion = appSource.slice(aseguradoRegionStart, aseguradoRegionEnd);
    const modalStart = appSource.indexOf('const aseguradoModalNode = (');
    const submitActionStart = appSource.lastIndexOf('<button', appSource.indexOf('form="asegurado-modal-form"', modalStart));
    const submitActionEnd = appSource.indexOf('</button>', submitActionStart) + '</button>'.length;
    const submitAction = appSource.slice(submitActionStart, submitActionEnd);
    const openActionStart = appSource.lastIndexOf('<button', appSource.indexOf('onClick={openAseguradoModal}'));
    const openActionEnd = appSource.indexOf('</button>', openActionStart) + '</button>'.length;
    const openAction = appSource.slice(openActionStart, openActionEnd);

    assert.doesNotMatch(aseguradoRegion, /actionLabel|onAction/);
    assert.match(openAction, />\s*Registrar asegurado\s*</);
    assert.match(submitAction, /type="submit"/);
    assert.match(submitAction, /form="asegurado-modal-form"/);
    assert.doesNotMatch(submitAction, /onClick=\{openAseguradoModal\}/);
    assert.match(appSource, /Tal vez buscas a este asegurado/);
    assert.match(appSource, /titleId="asegurado-modal-title"/);
    assert.match(appSource, /title="Registrar asegurado"/);
  });
});

describe('useAseguradoModal', () => {
  let captured;
  let mocks;

  function emptyCapture() {
    return { asegurado: '' };
  }

  function Harness({ initialCapture = {}, initialCatalog = [] }) {
    const [capture, setCapture] = useState({ ...emptyCapture(), ...initialCapture });
    mocks.openAltaFromCapture ||= (name) => {
      mocks.altaCalls.push(name);
    };
    mocks.openErrorModal ||= (title, message) => {
      mocks.errorCalls.push({ title, message });
    };
    const result = useAseguradoModal({
      setCapture,
      aseguradoNames: initialCatalog,
      openAltaFromCapture: mocks.openAltaFromCapture,
      openErrorModal: mocks.openErrorModal,
      normalizeText: utilsModule?.normalizeText
    });
    captured = { ...result, capture, setCapture };
    return createElement('div', null, JSON.stringify({ aseguradoModal: result.aseguradoModal, capture }));
  }

  beforeEach(() => {
    setupFakeDom();
    captured = null;
    mocks = { altaCalls: [], errorCalls: [] };
  });

  it('openAseguradoModal sets aseguradoModal to open with an empty name', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() => r.render(createElement(Harness)));
    assert.equal(captured.aseguradoModal.open, false);
    await act(() => captured.openAseguradoModal());
    assert.deepEqual(captured.aseguradoModal, { open: true, name: '' });
  });

  it('closeAseguradoModal sets open to false', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() => r.render(createElement(Harness)));
    await act(() => captured.openAseguradoModal());
    assert.equal(captured.aseguradoModal.open, true);
    await act(() => captured.closeAseguradoModal());
    assert.equal(captured.aseguradoModal.open, false);
  });

  it('selectAseguradoSuggestion sets capture.asegurado and closes modal without calling openAltaFromCapture', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() => r.render(createElement(Harness)));
    await act(() => captured.openAseguradoModal());
    await act(() => captured.selectAseguradoSuggestion('Sugerido'));
    assert.equal(captured.capture.asegurado, 'Sugerido');
    assert.equal(captured.aseguradoModal.open, false);
    assert.equal(mocks.altaCalls.length, 0);
  });

  it('registerAseguradoFromCapture calls openAltaFromCapture when no match exists', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() =>
      r.render(
        createElement(Harness, {
          initialCatalog: ['Existente']
        })
      )
    );
    await act(() => captured.openAseguradoModal());
    await act(() => captured.setAseguradoModal((current) => ({ ...current, name: '  Nuevo   asegurado  ' })));
    await act(() => captured.registerAseguradoFromCapture());
    assert.equal(captured.aseguradoModal.open, false);
    assert.equal(mocks.altaCalls.length, 1);
    assert.equal(mocks.altaCalls[0], 'Nuevo asegurado');
  });

  it('registerAseguradoFromCapture returns early when a match exists', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() =>
      r.render(
        createElement(Harness, {
          initialCatalog: ['Existente']
        })
      )
    );
    await act(() => captured.openAseguradoModal());
    await act(() => captured.setAseguradoModal((current) => ({ ...current, name: 'Existente' })));
    await act(() => captured.registerAseguradoFromCapture());
    assert.equal(captured.aseguradoModal.open, true);
    assert.equal(mocks.altaCalls.length, 0);
  });

  it('registerAseguradoFromCapture shows error when name is empty', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() => r.render(createElement(Harness)));
    await act(() => captured.openAseguradoModal());
    await act(() => captured.setAseguradoModal((current) => ({ ...current, name: '   ' })));
    await act(() => captured.registerAseguradoFromCapture());
    assert.equal(captured.aseguradoModal.open, true);
    assert.equal(mocks.altaCalls.length, 0);
    assert.equal(mocks.errorCalls.length, 1);
    assert.equal(mocks.errorCalls[0].title, 'Faltan datos');
    assert.equal(mocks.errorCalls[0].message, 'Escribe el nombre del asegurado.');
  });
});
