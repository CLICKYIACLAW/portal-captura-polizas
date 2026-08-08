/**
 * The "Formulario de póliza" card after the extracted policy form was hidden
 * from the end user.
 *
 * The AI extraction still fills capture.layout and savePoliza still sends it,
 * so this change is purely visual: the SectionFields form is no longer
 * rendered, while the confirmation checkbox and the Guardar/Limpiar actions
 * must behave exactly as before. These tests drive the real <App /> through a
 * real extraction (upload + Leer documentos against a stubbed Anthropic endpoint)
 * and assert on the rendered card, then scan the source to pin that the layout
 * plumbing survived the edit.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFile } from 'node:fs/promises';
import { SIGNED_IN, clearPendingTimers, flush, reactProps, setupFakeDom, walk } from './dom-harness.mjs';

const LINEA = 'Call Center';
const GERENCIA = 'Portales Web';
const GENERIC_VENDOR = 'VG001 - Vendedor Generico';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const POLIZA_FILE = { name: 'poliza.pdf', type: 'application/pdf', size: 1234 };

/** A FileReader that resolves readAsDataURL synchronously, so fileToBase64 settles in a microtask. */
class FakeFileReader {
  readAsDataURL() {
    this.result = 'data:application/pdf;base64,UEQxMjM0';
    if (this.onload) this.onload();
  }
}

const EXTRACTION = {
  aseguradora: 'AXA Seguros',
  poliza: 'P-1000',
  campos: {
    'DatDocumentos.Documento': '987654',
    'DatDoctoDetail.IDAseg': 'Juan Pérez López'
  },
  resumenPrimas: {
    prima_neta: '1000.00',
    importe_total: '1160.00'
  }
};

/**
 * Serves the BI catalogues the signed-in branch loads (same shape as the other
 * harness suites), plus a stubbed Anthropic extraction and a catch-all for the
 * SQL API calls the extraction flow makes on the way.
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
    if (target === ANTHROPIC_URL) {
      return json({
        content: [{ type: 'text', text: JSON.stringify(EXTRACTION) }]
      });
    }
    return json({ ok: true, record: { id: 'A1' } });
  };
}

async function mountApp() {
  const timers = setupFakeDom(SIGNED_IN, catalogFetch());
  global.window.prompt = () => 'sk-ant-test';
  global.FileReader = FakeFileReader;
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

function firstWithin(node, predicate) {
  let found = null;
  walk(node, (child) => {
    if (!found && predicate(child)) found = child;
  });
  return found;
}

function comboField(container, placeholder) {
  return nodesWithProps(container, (node, props) => node.tagName === 'input' && props.placeholder === placeholder)[0];
}

/**
 * Opens a combo and picks an option the way the user does. Option buttons are
 * the only buttons in the tree wired to `onMouseDown`, and a pick closes its
 * own popover, so at most one is ever open.
 */
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
  return nodesWithProps(container, (node, props) => node.tagName === 'button' && props.children === text);
}

async function clickButton(container, text) {
  const matches = buttonsByText(container, text);
  assert.equal(matches.length, 1, `expected exactly one "${text}" button, found ${matches.length}`);
  await act(() => matches[0].props.onClick());
  await flush();
}

function cardByTitle(container, title) {
  const cards = nodesWithProps(
    container,
    (node, props) => node.tagName === 'section' && String(props.className || '').includes('card')
  );
  return cards.find(({ node }) => {
    const heading = firstWithin(node, (child) => child.tagName === 'h3');
    return heading && reactProps(heading)?.children === title;
  });
}

/**
 * Fills the capture assignment and runs a real extraction: VG001 hands over a
 * generic asegurado (so the documents block opens), a ramo is picked, the
 * póliza file is uploaded, and "Leer póliza" is pressed against the stubbed
 * Anthropic endpoint.
 */
async function runExtraction(container) {
  await selectOption(container, 'Selecciona la línea', LINEA);
  await selectOption(container, 'Selecciona la gerencia', GERENCIA);
  await selectOption(container, 'Selecciona el vendedor', GENERIC_VENDOR);

  // The vendor combo only fills vendedor/vendedorId; flipping the generic
  // switch is what hands over a generic asegurado and opens the documents block.
  const genericToggle = nodesWithProps(
    container,
    (node, props) => node.tagName === 'button' && props.role === 'switch'
  )[0];
  assert.ok(genericToggle, 'expected the generic vendor switch');
  await act(() => genericToggle.props.onClick());
  await flush();

  await selectOption(container, 'Selecciona el ramo', 'Autos');

  const polizaInput = nodesWithProps(container, (node, props) => node.tagName === 'input' && props.type === 'file')[0];
  assert.ok(polizaInput, 'expected the póliza file input');
  await act(() => polizaInput.props.onChange({ target: { files: [POLIZA_FILE] } }));

  await clickButton(container, 'Leer documentos');
}

describe('§1 — the hidden policy form keeps confirmation and reset', () => {
  it('renders the card without the extracted fields, and guards save behind the same confirmation', async () => {
    const app = await mountApp();
    const { container } = app;
    try {
      await runExtraction(container);

      const formulario = cardByTitle(container, 'Formulario de póliza');
      assert.ok(formulario, 'expected the Formulario de póliza card');
      const { node: cardNode } = formulario;

      // The confirmation checkbox lives inside the card.
      const checkbox = firstWithin(
        cardNode,
        (child) => child.tagName === 'input' && reactProps(child)?.type === 'checkbox'
      );
      assert.ok(checkbox, 'expected a checkbox inside the card');
      const confirmationLabel = firstWithin(
        cardNode,
        (child) =>
          child.tagName === 'label' &&
          String(reactProps(child)?.className || '').includes('final-confirmation')
      );
      assert.ok(confirmationLabel, 'expected the final-confirmation label inside the card');
      assert.ok(
        confirmationLabel.contains(checkbox),
        'expected the checkbox inside the final-confirmation label'
      );

      // Guardar póliza and Limpiar exist inside the same card.
      const [guardar] = buttonsByText(cardNode, 'Guardar póliza');
      const [limpiar] = buttonsByText(cardNode, 'Limpiar');
      assert.ok(guardar, 'expected Guardar póliza inside the card');
      assert.ok(limpiar, 'expected Limpiar inside the card');
      assert.equal(guardar.props.disabled, true, 'Guardar póliza must start disabled');

      // The extracted policy form is gone: no section-grid, no details.section-card.
      const sectionGrid = nodesWithProps(container, (node, props) => props.className === 'section-grid');
      assert.equal(sectionGrid.length, 0, 'expected no .section-grid anywhere in the container');
      const sectionCard = nodesWithProps(
        container,
        (node, props) => node.tagName === 'details' && String(props.className || '').includes('section-card')
      );
      assert.equal(sectionCard.length, 0, 'expected no details.section-card anywhere in the container');

      // The two preceding summary cards are untouched.
      assert.ok(cardByTitle(container, 'Resumen de datos'), 'expected the Resumen de datos card');
      assert.ok(cardByTitle(container, 'Resumen de prima'), 'expected the Resumen de prima card');

      // Checking the box enables Guardar póliza.
      await act(() => reactProps(checkbox).onChange({ target: { checked: true } }));
      await flush();
      const [guardarAfterCheck] = buttonsByText(cardNode, 'Guardar póliza');
      assert.equal(guardarAfterCheck.props.disabled, false, 'Guardar póliza must enable once confirmed');

      // Limpiar resets the capture: resetCapture wipes the extraction state
      // entirely, so the card (checkbox and buttons included) unmounts.
      await clickButton(container, 'Limpiar');
      assert.equal(
        cardByTitle(container, 'Formulario de póliza'),
        undefined,
        'Limpiar must wipe the Formulario de póliza card'
      );
      const leftoverConfirmation = nodesWithProps(
        container,
        (node, props) =>
          node.tagName === 'label' && String(props.className || '').includes('final-confirmation')
      );
      assert.equal(leftoverConfirmation.length, 0, 'no final-confirmation checkbox may survive Limpiar');
    } finally {
      await unmountApp(app);
    }
  });
});

describe('§2 — the layout plumbing survives the visibility change', () => {
  it('keeps the SectionFields machinery, the new subtitle and the untouched neighbors', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

    const cardStart = appSource.indexOf('title="Formulario de póliza"');
    assert.ok(cardStart !== -1, 'expected the Formulario de póliza card');
    const cardEnd = appSource.indexOf('final-confirmation', cardStart);
    assert.ok(cardEnd !== -1, 'expected the final-confirmation label after the card title');
    const cardBody = appSource.slice(cardStart, cardEnd);
    assert.ok(
      !cardBody.includes('<SectionFields'),
      'the Formulario de póliza card must no longer render SectionFields'
    );

    assert.match(appSource, /\/\* The extracted policy fields are intentionally hidden/);
    assert.ok(
      appSource.includes('subtitle="Confirma la información y guarda la póliza"'),
      'expected the new honest subtitle'
    );

    assert.ok(appSource.includes('function SectionFields('), 'SectionFields must survive');
    assert.ok(appSource.includes('POLIZA_LAYOUT_DISPLAY_SECTIONS'), 'POLIZA_LAYOUT_DISPLAY_SECTIONS must survive');
    assert.ok(appSource.includes('POLIZA_LAYOUT_FIELDS'), 'POLIZA_LAYOUT_FIELDS must survive');
    assert.ok(appSource.includes('function updateLayout'), 'updateLayout must survive');
    assert.ok(appSource.includes('fieldNotes'), 'fieldNotes must survive');
    assert.ok(appSource.includes('layout: capture.layout,'), 'savePoliza must still send the layout');

    assert.ok(appSource.includes('title="Resumen de datos"'), 'Resumen de datos must be untouched');
    assert.ok(appSource.includes('title="Resumen de prima"'), 'Resumen de prima must be untouched');
  });
});
