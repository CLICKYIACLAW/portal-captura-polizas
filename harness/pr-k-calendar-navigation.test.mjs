/**
 * PR K — calendar grid keyboard navigation.
 *
 * The DatePicker only handled Arrow / Home / End / PageUp / PageDown on its
 * text input, but opening the picker moves focus into the day grid, where only
 * Enter, Space and Escape did anything. These tests drive the REAL component
 * through the OT modal's date picker and assert roving focus inside the grid:
 * arrows move the active day, Home/End move within the week, PageUp/PageDown
 * change month (clamped), a month boundary updates the view, and Escape closes
 * the popover and returns focus to the input.
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

const json = (payload) => ({ ok: true, status: 200, json: async () => payload });

function catalogFetch() {
  return async (url) => {
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
    if (target.includes('Trae_SubRamos')) return json({ Valores: [] });
    return json({ ok: true, record: { id: 'A1' } });
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

async function selectOption(container, placeholder, optionLabel) {
  const combo = nodesWithProps(
    container,
    (node, props) => node.tagName === 'input' && props.placeholder === placeholder
  )[0];
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

/** Signs in and fills the capture assignment so the OT entry point is enabled. */
async function assignPolicy(container) {
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
  await selectOption(container, 'Selecciona el ramo', 'Autos');
}

function dateInput(container, id) {
  const input = firstWithin(
    container,
    (node) => node.tagName === 'input' && reactProps(node)?.id === id
  );
  assert.ok(input, `expected date input #${id}`);
  return input;
}

/** Types DD/MM/YYYY into the start-date DatePicker, commits it and opens the popover. */
async function openStartDatePicker(container, text) {
  const input = dateInput(container, 'dependent-order-start-date');
  await act(() => reactProps(input).onChange({ target: { value: text } }));
  await flush();
  await act(() => reactProps(input).onBlur());
  await flush();
  const opened = dateInput(container, 'dependent-order-start-date');
  await act(() => reactProps(opened).onClick());
  await flush();
}

function dayButtons(container) {
  return nodesWithProps(
    container,
    (node, props) => node.tagName === 'button' && props.role === 'gridcell'
  );
}

function activeDay(container) {
  return nodesWithProps(
    container,
    (node, props) => node.tagName === 'button' && props.role === 'gridcell' && props.tabIndex === 0
  )[0];
}

function activeDayLabel(container) {
  const day = activeDay(container);
  return day ? day.props['aria-label'] : null;
}

function monthLabel(container) {
  const node = nodesWithProps(
    container,
    (node, props) => String(props.className || '').includes('date-picker-month')
  )[0];
  const children = node ? node.props.children : null;
  return Array.isArray(children) ? children.join('') : children;
}

async function pressKeyOnGrid(container, key) {
  const day = activeDay(container);
  assert.ok(day, 'expected an active day in the grid');
  await act(() => day.props.onKeyDown({ key, preventDefault() {} }));
  await flush();
}

async function openModalWithDate(isoText) {
  const app = await mountApp();
  const { container } = app;
  await assignPolicy(container);
  await clickButton(container, 'Agregar OT dependiente');
  await openStartDatePicker(container, isoText);
  return app;
}

describe('PR K — calendar grid keyboard navigation', () => {
  it('moves the active day with the arrow keys and keeps focus in the grid', async () => {
    const app = await openModalWithDate('15/03/2025');
    const { container } = app;
    try {
      assert.equal(activeDayLabel(container), '15 de Marzo de 2025');

      await pressKeyOnGrid(container, 'ArrowRight');
      assert.equal(activeDayLabel(container), '16 de Marzo de 2025');
      assert.equal(document.activeElement, activeDay(container).node, 'focus must follow the active day');

      await pressKeyOnGrid(container, 'ArrowRight');
      assert.equal(activeDayLabel(container), '17 de Marzo de 2025');

      await pressKeyOnGrid(container, 'ArrowLeft');
      assert.equal(activeDayLabel(container), '16 de Marzo de 2025');

      await pressKeyOnGrid(container, 'ArrowUp');
      assert.equal(activeDayLabel(container), '9 de Marzo de 2025');

      await pressKeyOnGrid(container, 'ArrowDown');
      assert.equal(activeDayLabel(container), '16 de Marzo de 2025');
      assert.equal(document.activeElement, activeDay(container).node, 'focus must follow the active day');
    } finally {
      await unmountApp(app);
    }
  });

  it('updates the displayed month when an arrow crosses a month boundary and keeps focus', async () => {
    const app = await openModalWithDate('31/03/2025');
    const { container } = app;
    try {
      assert.equal(monthLabel(container), 'Marzo 2025');
      await pressKeyOnGrid(container, 'ArrowRight');
      assert.equal(activeDayLabel(container), '1 de Abril de 2025');
      assert.equal(monthLabel(container), 'Abril 2025');
      assert.equal(document.activeElement, activeDay(container).node, 'focus must follow across the boundary');
    } finally {
      await unmountApp(app);
    }
  });

  it('moves to the week edges with Home and End', async () => {
    const app = await openModalWithDate('15/03/2025');
    const { container } = app;
    try {
      await pressKeyOnGrid(container, 'Home');
      assert.equal(activeDayLabel(container), '9 de Marzo de 2025');

      await pressKeyOnGrid(container, 'End');
      assert.equal(activeDayLabel(container), '15 de Marzo de 2025');
    } finally {
      await unmountApp(app);
    }
  });

  it('changes month with PageUp/PageDown, clamping the day of month', async () => {
    const app = await openModalWithDate('15/03/2025');
    const { container } = app;
    try {
      await pressKeyOnGrid(container, 'PageDown');
      assert.equal(activeDayLabel(container), '15 de Abril de 2025');
      assert.equal(monthLabel(container), 'Abril 2025');

      await pressKeyOnGrid(container, 'PageUp');
      assert.equal(activeDayLabel(container), '15 de Marzo de 2025');
      assert.equal(monthLabel(container), 'Marzo 2025');
      assert.equal(document.activeElement, activeDay(container).node, 'focus must follow the month change');
    } finally {
      await unmountApp(app);
    }
  });

  it('clamps the day of month when PageDown lands on a shorter month', async () => {
    const app = await openModalWithDate('31/01/2025');
    const { container } = app;
    try {
      await pressKeyOnGrid(container, 'PageDown');
      assert.equal(activeDayLabel(container), '28 de Febrero de 2025');
      assert.equal(monthLabel(container), 'Febrero 2025');
    } finally {
      await unmountApp(app);
    }
  });

  it('closes the popover and restores focus to the input on Escape', async () => {
    const app = await openModalWithDate('15/03/2025');
    const { container } = app;
    try {
      assert.ok(dayButtons(container).length > 0, 'expected the grid to be open');
      await pressKeyOnGrid(container, 'Escape');
      assert.equal(dayButtons(container).length, 0, 'expected the popover to close');
      const input = dateInput(container, 'dependent-order-start-date');
      assert.equal(document.activeElement, input, 'expected focus to return to the input');
    } finally {
      await unmountApp(app);
    }
  });
});
