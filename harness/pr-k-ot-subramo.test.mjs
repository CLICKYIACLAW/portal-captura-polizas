/**
 * PR K — the OT modal's subramo rule is driven by the OT's OWN ramo.
 *
 * The capture flow loads a subramo catalogue for the policy ramo; the OT modal
 * has its own Ramo field and must load, validate and render from a catalogue
 * for THAT ramo instead. These tests drive the real <App /> against a stubbed
 * BI backend whose Trae_SubRamos endpoint is a deferred the test settles by
 * hand, so each scenario can prove exactly which catalogue the modal is bound
 * to and how the loading / failed / empty states behave.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { SIGNED_IN, clearPendingTimers, flush, reactProps, setupFakeDom, walk } from './dom-harness.mjs';

const LINEA = 'Call Center';
const GERENCIA = 'Portales Web';
const GENERIC_VENDOR = 'VG001 - Vendedor Generico';

const RAMOS = [
  { Texto: 'Autos', Valor: '1' },
  { Texto: 'Daños', Valor: '2' }
];

const DANOS_SUBRAMOS = [
  { Texto: 'Daños Catastróficos', Valor: 'D1' },
  { Texto: 'Incendio', Valor: 'D2' }
];

const json = (payload) => ({ ok: true, status: 200, json: async () => payload });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Serves the signed-in catalogues and turns every Trae_SubRamos call into a
 * deferred the test resolves in the exact order it wants, so the catalogue that
 * "belongs" to each ramo (and which response is stale) is fully controlled.
 */
function catalogFetch() {
  const subramosRequests = [];
  return {
    subramosRequests,
    fetch: async (url) => {
      const target = String(url);
      if (target.includes('AutorizaId/Token/generar')) return json({ ATkn: 'test-token' });
      if (target.includes('Buscar_Vendedores')) {
        return json({
          Coincidencias: [{ Clave: 'VG001', Nombre: 'Vendedor Generico', IdVendedor: 99 }]
        });
      }
      if (target.includes('Trae_Ramos')) return json({ Valores: RAMOS });
      if (target.includes('Trae_Asegurados')) return json({ Valores: [] });
      if (target.includes('Buscar_Grupos')) return json({ Coincidencias: [] });
      if (target.includes('Trae_SubRamos')) {
        const request = deferred();
        subramosRequests.push(request);
        return request.promise;
      }
      return json({ ok: true, record: { id: 'A1' } });
    }
  };
}

function nodesWithProps(container, predicate) {
  const found = [];
  walk(container, (node) => {
    const props = reactProps(node);
    if (props && predicate(node, props)) found.push({ node, props });
  });
  return found;
}

function firstWithin(node, predicate) {
  let found = null;
  walk(node, (child) => {
    if (!found && predicate(child)) found = child;
  });
  return found;
}

function comboField(container, placeholder) {
  return nodesWithProps(
    container,
    (node, props) => node.tagName === 'input' && props.placeholder === placeholder
  )[0];
}

async function selectOption(container, placeholder, optionLabel) {
  const combo = comboField(container, placeholder);
  assert.ok(combo, `expected a combo with placeholder "${placeholder}"`);
  await act(() => combo.props.onFocus());
  const options = nodesWithProps(
    container,
    (node, props) => node.tagName === 'button' && typeof props.onMouseDown === 'function'
  );
  const picked = options.find(({ props }) => props.children === optionLabel);
  assert.ok(picked, `expected the option "${optionLabel}" under "${placeholder}"`);
  await act(() => picked.props.onMouseDown({ preventDefault() {} }));
  await flush();
}

function buttonsByText(container, text) {
  return nodesWithProps(
    container,
    (node, props) => node.tagName === 'button' && props.children === text
  );
}

async function clickButton(container, text) {
  const matches = buttonsByText(container, text);
  assert.equal(matches.length, 1, `expected exactly one "${text}" button, found ${matches.length}`);
  await act(() => matches[0].props.onClick());
  await flush();
}

async function fillTextInput(container, id, value) {
  const input = firstWithin(
    container,
    (node) => node.tagName === 'input' && reactProps(node)?.id === id
  );
  assert.ok(input, `expected input #${id}`);
  await act(() => reactProps(input).onChange({ target: { value } }));
  await flush();
}

/** Types DD/MM/YYYY into a DatePicker and lets blur commit it. */
async function fillDateInput(container, id, text) {
  const input = firstWithin(
    container,
    (node) => node.tagName === 'input' && reactProps(node)?.id === id
  );
  assert.ok(input, `expected date input #${id}`);
  await act(() => reactProps(input).onChange({ target: { value: text } }));
  await flush();
  await act(() => reactProps(input).onBlur());
  await flush();
}

/** Settles one stubbed Trae_SubRamos request inside act so no state update escapes it. */
async function settleSubramos(request, payload) {
  await act(async () => {
    request.resolve(json(payload));
  });
  await flush();
}

async function rejectSubramos(request, message) {
  await act(async () => {
    request.reject(new Error(message));
  });
  await flush();
}

async function mountApp() {
  const backend = catalogFetch();
  const timers = setupFakeDom(SIGNED_IN, backend.fetch);
  const { default: App } = await import('../src/App.jsx');
  const container = global.document.createElement('div');
  const root = createRoot(container);
  await act(() => root.render(createElement(App)));
  await flush();
  return { container, root, timers, requests: backend.subramosRequests };
}

async function unmountApp({ root, timers }) {
  await act(() => root.unmount());
  clearPendingTimers(timers);
}

/** Fills the capture assignment (línea, gerencia, generic vendor, ramo) so the OT entry point opens. */
async function assignPolicy(container, ramoLabel) {
  await selectOption(container, 'Selecciona la línea', LINEA);
  await selectOption(container, 'Selecciona la gerencia', GERENCIA);
  await selectOption(container, 'Selecciona el vendedor', GENERIC_VENDOR);
  const genericToggle = nodesWithProps(
    container,
    (node, props) => node.tagName === 'button' && props.role === 'switch'
  )[0];
  assert.ok(genericToggle, 'expected the generic vendor switch');
  await act(() => genericToggle.props.onClick());
  await flush();
  await selectOption(container, 'Selecciona el ramo', ramoLabel);
}

function subramoFieldError(container, message) {
  return nodesWithProps(
    container,
    (node, props) =>
      node.tagName === 'span' &&
      String(props.className || '').includes('field-error') &&
      props.children === message
  );
}

describe('PR K — OT subramo follows the OT ramo', () => {
  it('requires the subramo when the OT ramo has subramos, even if the policy ramo differs', async () => {
    const app = await mountApp();
    const { container, requests } = app;
    try {
      await assignPolicy(container, 'Autos');
      await clickButton(container, 'Agregar OT dependiente');

      // The OT modal opens with an empty ramo, so no catalogue loads until the
      // user picks one. Selecting Daños starts exactly one load, which resolves
      // with a real catalogue.
      await selectOption(container, 'Selecciona el ramo', 'Daños');
      assert.equal(requests.length, 1, 'expected one OT subramos load for the selected ramo');
      await settleSubramos(requests[0], { ok: true, Valores: DANOS_SUBRAMOS });

      await fillTextInput(container, 'dependent-order-folio', 'F-100');
      await fillTextInput(container, 'dependent-order-concepto', 'Endoso');
      await fillDateInput(container, 'dependent-order-start-date', '01/01/2025');
      await fillDateInput(container, 'dependent-order-end-date', '31/12/2025');

      await clickButton(container, 'Agregar');
      assert.equal(
        subramoFieldError(container, 'El subramo es requerido para este ramo.').length,
        1,
        'expected the subramo-required error for the OT ramo that has subramos'
      );
    } finally {
      await unmountApp(app);
    }
  });

  it('treats the subramo as optional when the OT ramo itself has no subramos', async () => {
    const app = await mountApp();
    const { container, requests } = app;
    try {
      // The policy ramo DOES have subramos (its load resolves non-empty), so the
      // old behaviour would force the OT to pick one. The OT's own catalogue is
      // empty, so the subramo must become optional for the OT.
      await assignPolicy(container, 'Daños');
      assert.equal(requests.length, 1, 'expected the policy subramos load');
      await settleSubramos(requests[0], { ok: true, Valores: DANOS_SUBRAMOS });

      await clickButton(container, 'Agregar OT dependiente');
      await selectOption(container, 'Selecciona el ramo', 'Daños');
      assert.equal(requests.length, 2, 'expected the OT subramos load');
      await settleSubramos(requests[1], { ok: true, Valores: [] });

      await fillTextInput(container, 'dependent-order-folio', 'F-200');
      await fillTextInput(container, 'dependent-order-concepto', 'Endoso');
      await fillDateInput(container, 'dependent-order-start-date', '01/02/2025');
      await fillDateInput(container, 'dependent-order-end-date', '28/02/2025');

      await clickButton(container, 'Agregar');
      const rows = nodesWithProps(
        container,
        (node, props) => String(props.className || '').includes('dependent-order-row')
      );
      assert.equal(rows.length, 1, 'expected the saved OT row');
      const modalTitle = nodesWithProps(
        container,
        (node, props) => node.tagName === 'h2' && props.children === 'Agregar OT dependiente'
      );
      assert.equal(modalTitle.length, 0, 'expected the modal to close after saving');
    } finally {
      await unmountApp(app);
    }
  });

  it('ignores a stale subramos response after the OT ramo changes', async () => {
    const app = await mountApp();
    const { container, requests } = app;
    try {
      await assignPolicy(container, 'Autos');
      await clickButton(container, 'Agregar OT dependiente');
      await selectOption(container, 'Selecciona el ramo', 'Autos');
      assert.equal(requests.length, 1, 'expected the load for the first OT ramo');

      // While the first catalogue is still in flight the field must say so.
      assert.ok(
        comboField(container, 'Cargando subramos...'),
        'expected the loading state while the catalogue is in flight'
      );

      // The user changes the OT ramo before the first response arrives.
      await selectOption(container, 'Selecciona el ramo', 'Daños');
      assert.equal(requests.length, 2, 'expected a new load for the changed OT ramo');

      // The newer request settles first (with Daños' catalogue), then the stale
      // Autos response resolves late and must be discarded.
      await settleSubramos(requests[1], { ok: true, Valores: DANOS_SUBRAMOS });
      await settleSubramos(requests[0], { ok: true, Valores: [] });

      const subramoCombo = comboField(container, 'Selecciona el subramo');
      assert.ok(subramoCombo, 'expected the OT subramo combo for the selected ramo');
      assert.ok(!subramoCombo.props.disabled, 'expected the subramo combo enabled');
      await act(() => subramoCombo.props.onFocus());
      const subramoOptions = nodesWithProps(
        container,
        (node, props) => node.tagName === 'button' && typeof props.onMouseDown === 'function'
      );
      assert.ok(
        subramoOptions.some(({ props }) => props.children === 'Daños Catastróficos'),
        'expected the Daños catalogue to survive the stale response'
      );
    } finally {
      await unmountApp(app);
    }
  });

  it('renders a failed catalogue load as an error and keeps the requirement fail-closed', async () => {
    const app = await mountApp();
    const { container, requests } = app;
    try {
      await assignPolicy(container, 'Autos');
      await clickButton(container, 'Agregar OT dependiente');
      await selectOption(container, 'Selecciona el ramo', 'Daños');
      assert.equal(requests.length, 1, 'expected one OT subramos load');
      await rejectSubramos(requests[0], 'network down');

      assert.equal(
        subramoFieldError(container, 'No se pudieron cargar los subramos de este ramo.').length,
        1,
        'expected the failed-load notice in the modal'
      );

      await fillTextInput(container, 'dependent-order-folio', 'F-300');
      await fillTextInput(container, 'dependent-order-concepto', 'Endoso');
      await fillDateInput(container, 'dependent-order-start-date', '01/03/2025');
      await fillDateInput(container, 'dependent-order-end-date', '31/03/2025');
      await clickButton(container, 'Agregar');
      assert.equal(
        subramoFieldError(container, 'El subramo es requerido para este ramo.').length,
        1,
        'a failed load must not silently downgrade the subramo requirement'
      );
    } finally {
      await unmountApp(app);
    }
  });
});
