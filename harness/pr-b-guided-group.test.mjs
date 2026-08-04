import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'tsx';

// B1 + B2: groupCatalog pure functions
const groupCatalogModule = await import('../src/lib/groupCatalog.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});

// B5: group-modal hook exported from App.jsx
const appModule = await import('../src/App.jsx').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message?.includes('useGroupModal')) return {};
  throw error;
});
const useGroupModal = appModule.useGroupModal;

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

describe('groupCatalog', () => {
  describe('normalizeGroupName', () => {
    it('trims, collapses whitespace, strips accents, lowercases, preserves punctuation', () => {
      assert.equal(groupCatalogModule?.normalizeGroupName('  Grúpo   A! '), 'grupo a!');
    });

    it('collapses internal whitespace to single spaces', () => {
      assert.equal(groupCatalogModule?.normalizeGroupName('uno    dos\t\ttres'), 'uno dos tres');
    });

    it('strips accents via NFD decomposition', () => {
      assert.equal(groupCatalogModule?.normalizeGroupName('ÁÉÍÓÚáéíóúÑñ'), 'aeiouaeiounn');
    });

    it('lowercases', () => {
      assert.equal(groupCatalogModule?.normalizeGroupName('GRUPO MAYÚSCULAS'), 'grupo mayusculas');
    });

    it('preserves punctuation and numbers', () => {
      assert.equal(groupCatalogModule?.normalizeGroupName('Grupo #1 (2026)!'), 'grupo #1 (2026)!');
    });
  });

  describe('findGroupNameMatches', () => {
    const catalog = ['Grupo A', 'grupo  beta', '  Corporativo  ', 'otro'];

    it('returns empty array for empty or blank query', () => {
      assert.deepEqual(groupCatalogModule?.findGroupNameMatches('', catalog), []);
      assert.deepEqual(groupCatalogModule?.findGroupNameMatches('   ', catalog), []);
    });

    it('returns exact match with rank exact', () => {
      const result = groupCatalogModule?.findGroupNameMatches('grupo a', catalog);
      assert.deepEqual(result, [{ name: 'Grupo A', rank: 'exact' }]);
    });

    it('returns prefix matches', () => {
      const result = groupCatalogModule?.findGroupNameMatches('gru', catalog);
      assert.ok(result.some((item) => item.name === 'Grupo A' && item.rank === 'prefix'));
      assert.ok(result.some((item) => item.name === 'grupo  beta' && item.rank === 'prefix'));
    });

    it('returns substring matches bidirectionally', () => {
      const result = groupCatalogModule?.findGroupNameMatches('beta', catalog);
      assert.ok(result.some((item) => item.name === 'grupo  beta' && item.rank === 'substring'));
    });

    it('excludes entries with no match', () => {
      const result = groupCatalogModule?.findGroupNameMatches('xyz', catalog);
      assert.deepEqual(result, []);
    });

    it('is case-insensitive and accent-insensitive', () => {
      const result = groupCatalogModule?.findGroupNameMatches('GRÚPO Á', catalog);
      assert.deepEqual(result, [{ name: 'Grupo A', rank: 'exact' }]);
    });

    it('is whitespace-insensitive', () => {
      const result = groupCatalogModule?.findGroupNameMatches('  grupo    a  ', catalog);
      assert.deepEqual(result, [{ name: 'Grupo A', rank: 'exact' }]);
    });

    it('deduplicates by normalized name', () => {
      const dupCatalog = ['Grupo A', '  grupo a  ', 'GRUPO A'];
      const result = groupCatalogModule?.findGroupNameMatches('grupo a', dupCatalog);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0], { name: 'Grupo A', rank: 'exact' });
    });

    it('sorts exact before prefix before substring', () => {
      const sortedCatalog = ['abc', 'abcdef', 'xxabcyy'];
      const result = groupCatalogModule?.findGroupNameMatches('abc', sortedCatalog);
      assert.equal(result[0].rank, 'exact');
      assert.equal(result[0].name, 'abc');
      assert.equal(result[1].rank, 'prefix');
      assert.equal(result[1].name, 'abcdef');
      assert.equal(result[2].rank, 'substring');
      assert.equal(result[2].name, 'xxabcyy');
    });

  });
});

describe('guided group UI', () => {
  it('keeps the Alta group combo selection-only and provides a dedicated modal flow', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const altaGroupRegion = appSource.slice(appSource.indexOf('label="Grupo *"'), appSource.indexOf('</div>', appSource.indexOf('label="Grupo *"')));

    assert.doesNotMatch(altaGroupRegion, /actionLabel|onAction/);
    assert.match(appSource, /Registrar grupo/);
    assert.match(appSource, /Tal vez buscas este grupo/);
    assert.match(appSource, /titleId="group-modal-title"/);
  });
});

describe('useGroupModal', () => {
  let captured;
  let mocks;

  function Harness({ initialAlta = {}, initialCatalog = [] }) {
    const [alta, setAlta] = useState({ linea: '', gerencia: '', vendedor: '', grupo: '', ...initialAlta });
    const [groupCatalog, setGroupCatalog] = useState(initialCatalog);
    mocks.createGrupoCalls ||= [];
    mocks.errorCalls ||= [];
    mocks.toastCalls ||= [];
    mocks.createGrupo ||= async (payload) => {
      mocks.createGrupoCalls.push(payload);
      if (mocks.grupoReject) throw mocks.grupoReject;
      return { record: { nombre: mocks.grupoResultName || payload.nombre } };
    };
    mocks.openErrorModal ||= (title, message) => {
      mocks.errorCalls.push({ title, message });
    };
    mocks.pushToast ||= (message) => {
      mocks.toastCalls.push(message);
    };
    const result = useGroupModal({
      alta,
      setAlta,
      groupCatalog,
      setGroupCatalog,
      createGrupo: mocks.createGrupo,
      openErrorModal: mocks.openErrorModal,
      pushToast: mocks.pushToast,
      normalizeText: groupCatalogModule?.normalizeGroupName
    });
    captured = { ...result, alta, groupCatalog };
    return createElement('div', null, JSON.stringify({ groupModal: result.groupModal, alta }));
  }

  beforeEach(() => {
    setupFakeDom();
    captured = null;
    mocks = {};
  });

  it('openGroupModal sets groupModal to open, empty name, not submitting', async () => {
    const root = new global.window.document.constructor === undefined ? null : createRoot(global.document.createElement('div'));
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() => r.render(createElement(Harness)));
    assert.equal(captured.groupModal.open, false);
    await act(() => captured.openGroupModal());
    assert.deepEqual(captured.groupModal, { open: true, name: '', submitting: false });
  });

  it('closeGroupModal sets open to false', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() => r.render(createElement(Harness)));
    await act(() => captured.openGroupModal());
    assert.equal(captured.groupModal.open, true);
    await act(() => captured.closeGroupModal());
    assert.equal(captured.groupModal.open, false);
  });

  it('selectGroupSuggestion sets alta.grupo and closes modal without calling createGrupo', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() => r.render(createElement(Harness)));
    await act(() => captured.openGroupModal());
    await act(() => captured.selectGroupSuggestion('Sugerido'));
    assert.equal(captured.alta.grupo, 'Sugerido');
    assert.equal(captured.groupModal.open, false);
    assert.equal(mocks.createGrupoCalls.length, 0);
  });

  it('createGroupFromAlta creates when no match exists', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() =>
      r.render(
        createElement(Harness, {
          initialAlta: { linea: 'Autos', gerencia: 'Norte', vendedor: 'V1' },
          initialCatalog: ['Existente']
        })
      )
    );
    await act(() => captured.openGroupModal());
    // name matches nothing
    await act(() => captured.setGroupModal((current) => ({ ...current, name: 'Nuevo grupo' })));
    await act(async () => {
      await captured.createGroupFromAlta();
    });
    assert.equal(captured.groupModal.open, false);
    assert.equal(captured.groupModal.submitting, false);
    assert.equal(captured.alta.grupo, 'nuevo grupo');
    assert.ok(captured.groupCatalog.includes('nuevo grupo'));
    assert.equal(mocks.toastCalls.length, 1);
    assert.ok(mocks.toastCalls[0].includes('nuevo grupo'));
    assert.deepEqual(mocks.createGrupoCalls[0], {
      nombre: 'nuevo grupo',
      linea: 'Autos',
      gerencia: 'Norte',
      vendedor: 'V1'
    });
  });

  it('createGroupFromAlta returns early when a match exists', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() =>
      r.render(
        createElement(Harness, {
          initialAlta: { linea: 'Autos', gerencia: 'Norte', vendedor: 'V1' },
          initialCatalog: ['Existente']
        })
      )
    );
    await act(() => captured.openGroupModal());
    await act(() => captured.setGroupModal((current) => ({ ...current, name: 'Existente' })));
    await act(() => captured.createGroupFromAlta());
    assert.equal(captured.groupModal.submitting, false);
    assert.equal(mocks.createGrupoCalls.length, 0);
  });

  it('createGroupFromAlta handles createGrupo failure without throwing', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    mocks.grupoReject = new Error('SQL timeout');
    await act(() =>
      r.render(
        createElement(Harness, {
          initialAlta: { linea: 'Autos', gerencia: 'Norte', vendedor: 'V1' },
          initialCatalog: []
        })
      )
    );
    await act(() => captured.openGroupModal());
    await act(() => captured.setGroupModal((current) => ({ ...current, name: 'Fallido' })));
    await act(async () => {
      await captured.createGroupFromAlta();
    });
    assert.equal(captured.groupModal.submitting, false);
    assert.equal(mocks.errorCalls.length, 1);
    assert.equal(mocks.errorCalls[0].title, 'Error al guardar grupo');
    assert.equal(mocks.errorCalls[0].message, 'SQL timeout');
  });
});
