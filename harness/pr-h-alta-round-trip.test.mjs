/**
 * The Captura → Alta de asegurados → Captura round trip, driven through the
 * real <App />.
 *
 * Both defects these tests pin are invisible to source matching: the alta seed
 * spread `{ ...emptyAlta(), ...current }` *looks* like a reset while being a
 * complete no-op, and the return-to-capture flag only misbehaves several
 * interactions after the one that set it. So everything here goes through the
 * rendered form — typing into the real inputs, clicking the real buttons — and
 * asserts on what the user would see next.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFile } from 'node:fs/promises';
import { SIGNED_IN, clearPendingTimers, flush, reactProps, setupFakeDom, walk } from './dom-harness.mjs';
import { emptyAlta } from '../src/App.jsx';

const LINEA = 'Call Center';
const GERENCIA = 'Portales Web';
const MANUAL_VENDOR = 'VG002 - Otro Vendedor';
const GENERIC_VENDOR = 'VG001 - Vendedor Generico';

const CAPTURA_TAB = 0;
const ALTA_TAB = 1;

/**
 * Serves the BI catalogues the signed-in branch loads, so the capture tab has a
 * real vendor to assign — including VG001, without which the generic branch of
 * the import reconciliation cannot be reached at all.
 */
function catalogFetch() {
  const json = (payload) => ({ ok: true, status: 200, json: async () => payload });
  return async (url) => {
    const target = String(url);
    if (target.includes('AutorizaId/Token/generar')) return json({ ATkn: 'test-token' });
    if (target.includes('Buscar_Vendedores')) {
      return json({
        Coincidencias: [
          { Clave: 'VG001', Nombre: 'Vendedor Generico', IdVendedor: 99 },
          { Clave: 'VG002', Nombre: 'Otro Vendedor', IdVendedor: 7 }
        ]
      });
    }
    if (target.includes('Trae_Ramos')) return json({ Valores: [{ Texto: 'Autos', Valor: '1' }] });
    if (target.includes('Trae_Asegurados')) return json({ Valores: [] });
    if (target.includes('Buscar_Grupos')) return json({ Coincidencias: [] });
    return json({ ok: true, record: { id: 'A1' } });
  };
}

async function mountApp() {
  const timers = setupFakeDom(SIGNED_IN, catalogFetch());
  const { default: App } = await import('../src/App.jsx');
  const container = global.document.createElement('div');
  const root = createRoot(container);
  await act(() => root.render(createElement(App)));
  await flush();
  return { container, root, timers };
}

async function unmountApp({ root, timers }) {
  await act(() => root.unmount());
  clearPendingTimers(timers);
}

function nodesWithProps(container, predicate) {
  const found = [];
  walk(container, (node) => {
    const props = reactProps(node);
    if (props && predicate(node, props)) found.push({ node, props });
  });
  return found;
}

function textOf(node) {
  let text = '';
  walk(node, (child) => {
    if (typeof child.data === 'string') text += child.data;
  });
  return text;
}

function tabButtons(container) {
  return nodesWithProps(
    container,
    (node, props) =>
      node.tagName === 'button' && typeof props.className === 'string' && props.className.split(' ')[0] === 'tab'
  );
}

function activeTab(container) {
  return tabButtons(container).findIndex(({ props }) => props.className === 'tab active');
}

async function clickTab(container, index) {
  const tabs = tabButtons(container);
  assert.equal(tabs.length, 4, 'expected the four navigation tabs');
  await act(() => tabs[index].props.onClick());
  await flush();
}

function buttonsByText(container, text) {
  return nodesWithProps(container, (node, props) => node.tagName === 'button' && props.children === text);
}

async function clickButton(container, text) {
  const matches = buttonsByText(container, text);
  assert.equal(matches.length, 1, `expected exactly one "${text}" button, found ${matches.length}`);
  await act(() => matches[0].props.onClick());
  await flush();
}

/** The free-text alta inputs, found by the label sitting next to them. */
function textField(container, label) {
  const match = nodesWithProps(
    container,
    (node, props) => node.tagName === 'input' && (props.type === 'text' || props.type === 'email')
  ).find(({ node }) => textOf(node.parentNode || node).trim().startsWith(label));
  assert.ok(match, `expected a field labelled "${label}"`);
  return match;
}

function fieldValue(container, label) {
  return textField(container, label).props.value;
}

async function type(container, label, value) {
  const field = textField(container, label);
  await act(() => field.props.onChange({ target: { value } }));
}

function comboField(container, placeholder) {
  return nodesWithProps(container, (node, props) => node.tagName === 'input' && props.placeholder === placeholder)[0];
}

function comboValue(container, placeholder) {
  const combo = comboField(container, placeholder);
  assert.ok(combo, `expected a combo with placeholder "${placeholder}"`);
  return combo.props.value;
}

/**
 * Opens a combo and picks an option the way the user does. Option buttons are
 * the only buttons in the tree wired to `onMouseDown`, and a pick closes its own
 * popover, so at most one is ever open.
 */
async function selectOption(container, placeholder, optionLabel) {
  const combo = comboField(container, placeholder);
  assert.ok(combo, `expected a combo with placeholder "${placeholder}"`);
  await act(() => combo.props.onFocus());
  const options = nodesWithProps(
    container,
    (node, props) => node.tagName === 'button' && typeof props.onMouseDown === 'function'
  );
  const picked = optionLabel ? options.find(({ props }) => props.children === optionLabel) : options[0];
  assert.ok(picked, `expected the option "${optionLabel ?? '(first)'}" under "${placeholder}"`);
  const label = picked.props.children;
  await act(() => picked.props.onMouseDown({ preventDefault() {} }));
  await flush();
  return label;
}

/** Picks the capture assignment the discreet action hands to the alta. */
async function assignCapture(container, vendor = MANUAL_VENDOR) {
  await selectOption(container, 'Selecciona la línea', LINEA);
  await selectOption(container, 'Selecciona la gerencia', GERENCIA);
  await selectOption(container, 'Selecciona el vendedor', vendor);
}

/** Fills everything `isAltaComplete` demands of a persona física without factura. */
async function fillRequiredAlta(container, { apP, apM, nombres }) {
  await type(container, 'Apellido paterno', apP);
  await type(container, 'Apellido materno', apM);
  await type(container, 'Nombre(s)', nombres);
  await type(container, 'Correo', 'ana@example.com');
  await type(container, 'Teléfono', '5512345678');
  await type(container, 'Calle', 'Reforma');
  await type(container, 'Número', '100');
  // The postal code derives colonia/municipio/estado, so it is typed first and
  // the derived values overwritten right after.
  await type(container, 'Código postal', '06000');
  await type(container, 'Colonia', 'Centro');
  await type(container, 'Municipio', 'Cuauhtemoc');
  await type(container, 'Estado', 'CDMX');
}

async function saveAlta(container) {
  const save = buttonsByText(container, 'Guardar asegurado');
  assert.equal(save.length, 1, 'expected the Guardar asegurado button');
  assert.equal(save[0].props.disabled, false, 'expected the alta form to be complete before saving');
  await clickButton(container, 'Guardar asegurado');
}

describe('§1 — Registrar asegurado always starts from a clean alta', () => {
  it('does not carry the previous asegurado identity or fiscal data into the next one', async () => {
    const app = await mountApp();
    const { container } = app;
    try {
      await assignCapture(container);
      await clickButton(container, 'Registrar asegurado');
      assert.equal(activeTab(container), ALTA_TAB, 'expected the discreet action to open the alta tab');

      // Persona A: everything that identifies a taxpayer.
      await type(container, 'RFC', 'GODE561231GR8');
      await type(container, 'CURP', 'GODE561231HDFXXX09');
      await type(container, 'Giro', 'Servicios');
      await type(container, 'Correo', 'persona.a@example.com');
      await type(container, 'Teléfono', '5512345678');
      await type(container, 'Calle', 'Insurgentes');
      await type(container, 'Número', '42');
      await type(container, 'Código postal', '06000');
      await type(container, 'Colonia', 'Roma Norte');
      await type(container, 'Municipio', 'Cuauhtemoc');
      await type(container, 'Estado', 'CDMX');
      await clickButton(container, 'Sí');
      await selectOption(container, 'Selecciona el régimen fiscal', null);
      await selectOption(container, 'Selecciona el uso de CFDI', null);

      assert.equal(fieldValue(container, 'RFC'), 'GODE561231GR8', 'sanity: persona A was really filled in');
      assert.notEqual(comboValue(container, 'Selecciona el régimen fiscal'), '', 'sanity: a régimen was picked');

      // Abandon by switching tabs, then start persona B from another capture.
      await clickTab(container, CAPTURA_TAB);
      await clickButton(container, 'Registrar asegurado');
      assert.equal(activeTab(container), ALTA_TAB);

      const blank = emptyAlta();
      const carried = [
        ['RFC', 'rfc'],
        ['CURP', 'curp'],
        ['Giro', 'giro'],
        ['Correo', 'email'],
        ['Teléfono', 'tel'],
        ['Calle', 'calle'],
        ['Número', 'numero'],
        ['Código postal', 'cp'],
        ['Colonia', 'colonia'],
        ['Municipio', 'municipio'],
        ['Estado', 'estado']
      ];
      for (const [label, key] of carried) {
        assert.equal(
          fieldValue(container, label),
          blank[key],
          `expected "${label}" to be back at its emptyAlta() default`
        );
      }
      assert.equal(comboValue(container, 'Selecciona el régimen fiscal'), blank.regimen);

      // requiereFactura is back to false...
      const [si] = buttonsByText(container, 'Sí');
      const [no] = buttonsByText(container, 'No');
      assert.equal(si.props.className, 'switch');
      assert.equal(no.props.className, 'switch active');

      // ...and behind it, régimenClave and usoCfdi are blank too: turning the
      // factura back on offers the uso de CFDI combo disabled, waiting for a
      // régimen, with nothing selected.
      await clickButton(container, 'Sí');
      const uso = comboField(container, 'Selecciona un régimen primero');
      assert.ok(uso, 'expected the uso de CFDI combo to be waiting for a régimen');
      assert.equal(uso.props.disabled, true, 'expected no régimenClave to be carried over');
      assert.equal(uso.props.value, blank.usoCfdi);
    } finally {
      await unmountApp(app);
    }
  });

  it('still carries the capture assignment over and reconciles it against the catalogue', async () => {
    const app = await mountApp();
    const { container } = app;
    try {
      await assignCapture(container, MANUAL_VENDOR);
      await clickButton(container, 'Registrar asegurado');

      assert.equal(comboValue(container, 'Selecciona la línea'), LINEA);
      assert.equal(comboValue(container, 'Selecciona la gerencia'), GERENCIA);
      assert.equal(comboValue(container, 'Selecciona el vendedor'), MANUAL_VENDOR);
      const [manualSwitch] = nodesWithProps(container, (node, props) => props.role === 'switch');
      assert.equal(manualSwitch.props['aria-checked'], false, 'a manual vendor must not flag generic mode');

      // The same trip with VG001 flips the reconciled mode the other way.
      await clickTab(container, CAPTURA_TAB);
      await selectOption(container, 'Selecciona el vendedor', GENERIC_VENDOR);
      await clickButton(container, 'Registrar asegurado');

      assert.equal(comboValue(container, 'Selecciona el vendedor'), GENERIC_VENDOR);
      const [genericSwitch] = nodesWithProps(container, (node, props) => props.role === 'switch');
      assert.equal(genericSwitch.props['aria-checked'], true, 'VG001 must reconcile to generic mode');
    } finally {
      await unmountApp(app);
    }
  });
});

describe('§2 — the return-to-capture flag does not survive an abandonment', () => {
  it('is cleared when the user switches tabs away from the alta flow', async () => {
    const app = await mountApp();
    const { container } = app;
    try {
      await assignCapture(container);
      await clickButton(container, 'Registrar asegurado');

      // Abandon the round trip by hand.
      await clickTab(container, CAPTURA_TAB);

      // A later, unrelated registration started from the Asegurados tab itself.
      await clickTab(container, ALTA_TAB);
      await fillRequiredAlta(container, { apP: 'Perez', apM: 'Lopez', nombres: 'Ana' });
      await saveAlta(container);

      assert.equal(activeTab(container), ALTA_TAB, 'an abandoned round trip must not force-navigate on save');
      await clickTab(container, CAPTURA_TAB);
      assert.equal(
        comboValue(container, 'Selecciona el asegurado'),
        '',
        'an abandoned round trip must not relabel the capture'
      );
    } finally {
      await unmountApp(app);
    }
  });

  it('is cleared when the user presses Limpiar', async () => {
    const app = await mountApp();
    const { container } = app;
    try {
      await assignCapture(container);
      await clickButton(container, 'Registrar asegurado');

      await clickButton(container, 'Limpiar');

      await selectOption(container, 'Selecciona el vendedor', MANUAL_VENDOR);
      await fillRequiredAlta(container, { apP: 'Perez', apM: 'Lopez', nombres: 'Ana' });
      await saveAlta(container);

      assert.equal(activeTab(container), ALTA_TAB, 'Limpiar must abandon the round trip');
      await clickTab(container, CAPTURA_TAB);
      assert.equal(comboValue(container, 'Selecciona el asegurado'), '');
    } finally {
      await unmountApp(app);
    }
  });

  it('still sets, uses and clears the flag exactly once on the legitimate round trip', async () => {
    const app = await mountApp();
    const { container } = app;
    try {
      await assignCapture(container);
      await clickButton(container, 'Registrar asegurado');
      await fillRequiredAlta(container, { apP: 'Perez', apM: 'Lopez', nombres: 'Ana' });
      await saveAlta(container);

      assert.equal(activeTab(container), CAPTURA_TAB, 'the round trip must land back on Captura');
      assert.equal(comboValue(container, 'Selecciona el asegurado'), 'Perez Lopez Ana');

      // Used once: the very next ordinary alta must not repeat the return.
      await clickTab(container, ALTA_TAB);
      await selectOption(container, 'Selecciona el vendedor', MANUAL_VENDOR);
      await fillRequiredAlta(container, { apP: 'Diaz', apM: 'Ruiz', nombres: 'Beto' });
      await saveAlta(container);

      assert.equal(activeTab(container), ALTA_TAB);
      await clickTab(container, CAPTURA_TAB);
      assert.equal(
        comboValue(container, 'Selecciona el asegurado'),
        'Perez Lopez Ana',
        'the second, unrelated alta must leave the capture alone'
      );
    } finally {
      await unmountApp(app);
    }
  });

  it('is cleared on logout so it cannot leak into the next session', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const start = appSource.indexOf('function handleLogout(');
    assert.ok(start !== -1, 'expected handleLogout');
    const body = appSource.slice(start, appSource.indexOf('\n  }', start));
    assert.match(body, /setAltaReturnToCapture\(false\)/);
  });
});
