import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'tsx';

// B1 + B2: groupCatalog pure functions
const groupCatalogModule = await import('../src/lib/groupCatalog.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});
const utilsModule = await import('../src/lib/utils.js').catch((error) => {
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

    it('ranks a catalog name contained by the query as substring, while forward prefix remains prefix', () => {
      const reverseContainment = groupCatalogModule?.findGroupNameMatches('Grupo A Norte', ['Grupo A']);
      assert.deepEqual(reverseContainment, [{ name: 'Grupo A', rank: 'substring' }]);

      const forwardPrefix = groupCatalogModule?.findGroupNameMatches('Grupo A', ['Grupo A Norte']);
      assert.deepEqual(forwardPrefix, [{ name: 'Grupo A Norte', rank: 'prefix' }]);
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
    const groupModalStart = appSource.indexOf('const groupModalNode = (');
    const createActionStart = appSource.lastIndexOf('<button', appSource.indexOf('form="group-modal-form"', groupModalStart));
    const createActionEnd = appSource.indexOf('</button>', createActionStart) + '</button>'.length;
    const createAction = appSource.slice(createActionStart, createActionEnd);
    const openActionStart = appSource.lastIndexOf('<button', appSource.indexOf('onClick={openGroupModal}'));
    const openActionEnd = appSource.indexOf('</button>', openActionStart) + '</button>'.length;
    const openAction = appSource.slice(openActionStart, openActionEnd);

    assert.doesNotMatch(altaGroupRegion, /actionLabel|onAction/);
    assert.match(openAction, />\s*Registrar grupo\s*</);
    assert.match(createAction, /type="submit"/);
    assert.match(createAction, /form="group-modal-form"/);
    assert.match(createAction, /\{groupModal\.submitting \? 'Enviando solicitud\.\.\.' : 'Solicitar alta de grupo'\}/);
    assert.doesNotMatch(createAction, /Registrar grupo/);
    assert.match(appSource, /Tal vez buscas este grupo/);
    assert.match(appSource, /titleId="group-modal-title"/);
  });
});

describe('§6 — the group modal represents an email request', () => {
  it('labels the submit action as a request and drops the direct-creation wording', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /Solicitar alta de grupo/);
    assert.doesNotMatch(appSource, /Dar de alta grupo/);
  });

  it('shows the sent notice inside the modal and blocks a second submission', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const modalStart = appSource.indexOf('const groupModalNode = (');
    const modalEnd = appSource.indexOf('const errorModalNode = ', modalStart);
    assert.ok(modalEnd !== -1, 'expected the group modal to be bounded by the error modal');
    const modal = appSource.slice(modalStart, modalEnd);

    assert.match(modal, /groupModal\.requestSent/, 'expected the modal to render a sent notice');
    assert.match(modal, /className="modal-notice"/);
    assert.match(modal, /solicitud/i);
    assert.match(modal, /disabled=\{!canCreateGroup \|\| groupModal\.submitting \|\| groupModal\.requestSent\}/);
  });

  it('adds no network call for the mail: only the existing createGrupo runs', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const start = appSource.indexOf('async function createGroupFromAlta()');
    const body = appSource.slice(start, appSource.indexOf('\n  }', start));
    assert.doesNotMatch(body, /fetch\(|sendMail|mailto:/);
    assert.match(body, /await createGrupo\(\{/);
  });
});

describe('useGroupModal', () => {
  let captured;
  let mocks;

  function Harness({ initialAlta = {}, initialCatalog = [], requestNoticeMs }) {
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
      normalizeText: utilsModule?.normalizeText,
      ...(requestNoticeMs === undefined ? {} : { requestNoticeMs })
    });
    captured = { ...result, alta, groupCatalog, setAlta };
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
    assert.deepEqual(captured.groupModal, { open: true, name: '', submitting: false, requestSent: false });
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

  it('createGroupFromAlta confirms the request in the modal, then closes it, leaving the group usable', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() =>
      r.render(
        createElement(Harness, {
          initialAlta: { linea: 'Autos', gerencia: 'Norte', vendedor: 'V1' },
          initialCatalog: ['Existente'],
          requestNoticeMs: 10
        })
      )
    );
    await act(() => captured.openGroupModal());
    // name matches nothing
    await act(() => captured.setGroupModal((current) => ({ ...current, name: '  Nuevo   grupo  ' })));
    await act(async () => {
      await captured.createGroupFromAlta();
    });

    // The modal stays open just long enough to show the "request sent" notice.
    assert.equal(captured.groupModal.open, true);
    assert.equal(captured.groupModal.requestSent, true);
    assert.equal(captured.groupModal.submitting, false);

    // The group is usable immediately, exactly as before.
    assert.equal(captured.alta.grupo, 'Nuevo grupo');
    assert.ok(captured.groupCatalog.includes('Nuevo grupo'));
    assert.equal(mocks.toastCalls.length, 1);
    assert.ok(mocks.toastCalls[0].includes('Nuevo grupo'));
    assert.deepEqual(mocks.createGrupoCalls[0], {
      nombre: 'Nuevo grupo',
      linea: 'Autos',
      gerencia: 'Norte',
      vendedor: 'V1'
    });

    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 40));
    });
    assert.equal(captured.groupModal.open, false);
    assert.equal(captured.groupModal.requestSent, false);

    await act(() => r.unmount());
  });

  it('cancels the pending auto-close when the modal is closed by hand', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);
    await act(() =>
      r.render(
        createElement(Harness, {
          initialAlta: { linea: 'Autos', gerencia: 'Norte', vendedor: 'V1' },
          initialCatalog: [],
          requestNoticeMs: 10
        })
      )
    );
    await act(() => captured.openGroupModal());
    await act(() => captured.setGroupModal((current) => ({ ...current, name: 'Nuevo grupo' })));
    await act(async () => {
      await captured.createGroupFromAlta();
    });
    await act(() => captured.closeGroupModal());
    assert.equal(captured.groupModal.open, false);
    assert.equal(captured.groupModal.requestSent, false);

    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 40));
    });
    assert.equal(captured.groupModal.open, false);

    await act(() => r.unmount());
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

  it('discards a stale creation when the vendor changes while the request is in flight', async () => {
    const container = global.document.createElement('div');
    const r = createRoot(container);

    let resolveCreate;
    mocks.createGrupo = async (payload) => {
      mocks.createGrupoCalls ||= [];
      mocks.createGrupoCalls.push(payload);
      return new Promise((resolve) => {
        resolveCreate = () => resolve({ record: { nombre: payload.nombre } });
      });
    };

    await act(() =>
      r.render(
        createElement(Harness, {
          initialAlta: { linea: 'Autos', gerencia: 'Norte', vendedor: 'V1' },
          initialCatalog: []
        })
      )
    );
    await act(() => captured.openGroupModal());
    await act(() => captured.setGroupModal((current) => ({ ...current, name: 'Nuevo grupo' })));

    let submitDone;
    const submitPromise = new Promise((resolve) => {
      submitDone = resolve;
    });
    act(() => {
      captured.createGroupFromAlta().then(submitDone);
    });

    // The request is now in flight (submitting), still tied to vendor V1.
    assert.equal(captured.groupModal.submitting, true);

    // The user switches vendor before the backend responds.
    await act(() => captured.setAlta((current) => ({ ...current, vendedor: 'V2', grupo: '' })));

    // The backend now resolves the stale request for V1.
    await act(() => resolveCreate());
    await act(async () => {
      await submitPromise;
    });

    // The stale result must NOT be attributed to the vendor now selected.
    assert.equal(captured.alta.grupo, '');
    assert.deepEqual(captured.groupCatalog, []);
    assert.equal(captured.groupModal.submitting, false);
    assert.ok(
      mocks.toastCalls.some((message) => message.includes('Nuevo grupo') && message.toLowerCase().includes('vendedor'))
    );
  });
});
