/**
 * Discreet inline actions.
 *
 * The three actions that used to sit in their own prominent blocks (the
 * "Vendedor genérico" switch, "Registrar asegurado" and "Registrar grupo") now
 * live inside the grid cell of the combo they belong to, in the same visual
 * register as the hint line. These tests pin both the pure state helper behind
 * the new Alta-side toggle and the structural placement of the three controls.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapBiVendorOption } from '../src/lib/api.js';
import {
  activateAltaGenericVendor,
  applyAltaContextChange,
  returnAltaToManualVendor,
  toggleAltaGenericVendor
} from '../src/lib/altaAssignment.js';
import { emptyAlta, getGenericAssignmentToggleState } from '../src/App.jsx';

const genericVendor = mapBiVendorOption({ Clave: 'VG001', Nombre: 'Vendedor Genérico', IdVendedor: 99 });
const otherVendor = mapBiVendorOption({ Clave: 'VG002', Nombre: 'Otro', IdVendedor: 7 });

async function readAppSource() {
  return readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
}

/**
 * Slices the source into the four `.combo-cell` wrappers, in document order:
 * Captura vendedor, Captura asegurado, Alta vendedor, Alta grupo.
 */
function sliceComboCells(appSource) {
  const starts = [...appSource.matchAll(/<div className="combo-cell">/g)].map((match) => match.index);
  // The last cell has no following wrapper, so it is bounded by the block that
  // follows the Alta combo grid instead.
  const tail = appSource.indexOf('Tipo de persona');
  return starts.map((start, index) => appSource.slice(start, starts[index + 1] ?? tail));
}

describe('§1 — Alta generic vendor state helper', () => {
  it('emptyAlta starts in manual assignment mode', () => {
    assert.equal(emptyAlta().assignmentMode, 'manual');
  });

  it('activateAltaGenericVendor writes the VG001 display value and clears the group', () => {
    const current = { ...emptyAlta(), vendedor: 'Alguien', vendedorId: '3', grupo: 'Grupo previo' };
    const next = activateAltaGenericVendor(current, [otherVendor, genericVendor]);

    assert.equal(next.assignmentMode, 'generic');
    assert.equal(next.vendedor, genericVendor.Valor);
    assert.equal(next.vendedorId, '99');
    assert.equal(next.grupo, '');
  });

  it('activateAltaGenericVendor is a no-op when the catalogue has no VG001', () => {
    const current = { ...emptyAlta(), vendedor: 'Alguien', grupo: 'Grupo previo' };
    assert.strictEqual(activateAltaGenericVendor(current, [otherVendor]), current);
    assert.strictEqual(activateAltaGenericVendor(current, []), current);
  });

  it('returnAltaToManualVendor clears the vendor and everything derived from it', () => {
    const current = {
      ...emptyAlta(),
      assignmentMode: 'generic',
      vendedor: genericVendor.Valor,
      vendedorId: '99',
      grupo: 'Grupo'
    };
    const next = returnAltaToManualVendor(current);

    assert.equal(next.assignmentMode, 'manual');
    assert.equal(next.vendedor, '');
    assert.equal(next.vendedorId, '');
    assert.equal(next.grupo, '');
  });

  it('returnAltaToManualVendor preserves unrelated fields', () => {
    const current = { ...emptyAlta(), assignmentMode: 'generic', email: 'a@b.co', rfc: 'GODE561231GR8' };
    const next = returnAltaToManualVendor(current);

    assert.equal(next.email, 'a@b.co');
    assert.equal(next.rfc, 'GODE561231GR8');
  });

  it('toggleAltaGenericVendor flips between both directions', () => {
    const manual = emptyAlta();
    const generic = toggleAltaGenericVendor(manual, [genericVendor]);
    assert.equal(generic.assignmentMode, 'generic');
    assert.equal(generic.vendedor, genericVendor.Valor);

    const back = toggleAltaGenericVendor(generic, [genericVendor]);
    assert.equal(back.assignmentMode, 'manual');
    assert.equal(back.vendedor, '');
  });

  it('applyAltaContextChange keeps VG001 across a línea/gerencia change, like the capture tab', () => {
    const generic = {
      ...emptyAlta(),
      assignmentMode: 'generic',
      vendedor: genericVendor.Valor,
      vendedorId: '99',
      linea: 'Anterior',
      gerencia: 'Anterior'
    };
    const next = applyAltaContextChange(generic, { linea: 'Nueva', gerencia: '' });

    assert.equal(next.assignmentMode, 'generic');
    assert.equal(next.vendedor, genericVendor.Valor);
    assert.equal(next.linea, 'Nueva');
    assert.equal(next.gerencia, '');
  });

  it('applyAltaContextChange still clears a manually picked vendor', () => {
    const manual = { ...emptyAlta(), vendedor: 'Alguien', linea: 'Anterior', gerencia: 'Anterior' };
    const next = applyAltaContextChange(manual, { linea: 'Nueva', gerencia: '' });

    assert.equal(next.assignmentMode, 'manual');
    assert.equal(next.vendedor, '');
    assert.equal(next.linea, 'Nueva');
  });

  it('picking a vendor by hand drops back to manual mode', async () => {
    const altaVendedor = sliceComboCells(await readAppSource())[2];
    assert.match(altaVendedor, /assignmentMode:\s*'manual'/, 'expected a manual pick to leave generic mode');
  });

  it('shares getGenericAssignmentToggleState with the capture tab', () => {
    assert.deepEqual(
      getGenericAssignmentToggleState({
        vendedoresLoading: false,
        genericVendor: null,
        assignmentMode: 'manual'
      }),
      { disabled: true, checked: false, statusLabel: 'No disponible: el catálogo no contiene VG001' }
    );
  });
});

describe('§1/§2/§3 — the three actions live inside their combo cell', () => {
  it('wraps exactly the four cells that own a discreet action', async () => {
    const cells = sliceComboCells(await readAppSource());
    assert.equal(cells.length, 4, 'expected four .combo-cell wrappers');
  });

  it('puts the Vendedor genérico switch inside the Captura vendedor cell', async () => {
    const [capturaVendedor] = sliceComboCells(await readAppSource());
    assert.match(capturaVendedor, /label="Vendedor"/);
    assert.match(capturaVendedor, /role="switch"/);
    assert.match(capturaVendedor, /onClick=\{handleToggleAssignmentMode\}/);
    assert.match(capturaVendedor, /Vendedor genérico/);
  });

  it('puts a discreet Registrar asegurado action inside the Captura asegurado cell', async () => {
    const capturaAsegurado = sliceComboCells(await readAppSource())[1];
    assert.match(capturaAsegurado, /label="Asegurado"/);
    assert.match(capturaAsegurado, /className="inline-action"/);
    assert.match(capturaAsegurado, /onClick=\{openAseguradoModal\}/);
    assert.match(capturaAsegurado, />\s*Registrar asegurado\s*</);
    assert.match(capturaAsegurado, /disabled=\{!selectedVendorId \|\| aseguradosLoading\}/);
  });

  it('puts the Vendedor genérico switch inside the Alta vendedor cell too', async () => {
    const altaVendedor = sliceComboCells(await readAppSource())[2];
    assert.match(altaVendedor, /label="Vendedor \*"/);
    assert.match(altaVendedor, /role="switch"/);
    assert.match(altaVendedor, /onClick=\{handleToggleAltaAssignmentMode\}/);
    assert.match(altaVendedor, /Vendedor genérico/);
  });

  it('puts a discreet Registrar grupo action inside the Alta grupo cell', async () => {
    const altaGrupo = sliceComboCells(await readAppSource())[3];
    assert.match(altaGrupo, /label="Grupo \*"/);
    assert.match(altaGrupo, /className="inline-action"/);
    assert.match(altaGrupo, /onClick=\{openGroupModal\}/);
    assert.match(altaGrupo, />\s*Registrar grupo\s*</);
    assert.match(altaGrupo, /disabled=\{!alta\.vendedor \|\| groupsLoading\}/);
  });

  it('keeps both switches accessible', async () => {
    const appSource = await readAppSource();
    const switches = appSource.match(/role="switch"/g) || [];
    assert.equal(switches.length, 2, 'expected one switch per tab');
    assert.equal((appSource.match(/aria-checked=/g) || []).length, 2);
    assert.equal((appSource.match(/aria-disabled=/g) || []).length, 2);
    assert.equal((appSource.match(/toggle-switch-thumb/g) || []).length, 2);
  });

  it('drops the prominent blocks the discreet actions replace', async () => {
    const appSource = await readAppSource();
    assert.doesNotMatch(appSource, /assignment-toggle/, 'expected the prominent Captura toggle block to be gone');
    assert.doesNotMatch(appSource, /asegurado-registration/, 'expected the NUEVO ASEGURADO card to be gone');
    assert.doesNotMatch(appSource, /group-registration/, 'expected the NUEVO GRUPO card to be gone');
    assert.doesNotMatch(appSource, /<label>Nuevo asegurado<\/label>/);
    assert.doesNotMatch(appSource, /<label>Nuevo grupo<\/label>/);
  });

  it('explains why each action is unavailable while no vendor is selected', async () => {
    const cells = sliceComboCells(await readAppSource());
    assert.match(cells[1], /inline-action-hint/);
    assert.match(cells[3], /inline-action-hint/);
  });
});

describe('§1/§2/§3 — stylesheet', () => {
  it('styles the discreet action and the inline toggle, and drops the orphaned rules', async () => {
    const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
    assert.match(css, /\.inline-action\s*\{/);
    assert.match(css, /\.inline-action:disabled\s*\{/);
    assert.match(css, /\.inline-toggle\s*\{/);
    assert.match(css, /\.combo-cell\s*\{/);
    assert.doesNotMatch(css, /\.assignment-toggle/, 'expected the orphaned prominent-toggle rules to be removed');
  });

  it('keeps the switch hit target at least 24px tall with a visible focus style', async () => {
    const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.toggle-switch {'), css.indexOf('.toggle-switch.is-on'));
    const height = /height:\s*(\d+)px/.exec(rule);
    assert.ok(height, 'expected an explicit switch height');
    assert.ok(Number(height[1]) >= 24, `expected a >= 24px hit target, got ${height[1]}px`);
    assert.match(css, /\.toggle-switch:focus-visible\s*\{/);
  });
});

describe('§2 — the capture → alta → capture round trip survives', () => {
  it('openAltaFromCapture carries the assignment over and flags the return trip', async () => {
    const appSource = await readAppSource();
    const start = appSource.indexOf('function openAltaFromCapture(');
    assert.ok(start !== -1, 'expected openAltaFromCapture');
    const body = appSource.slice(start, appSource.indexOf('\n  }', start));

    assert.match(body, /linea:\s*capture\.linea/);
    assert.match(body, /gerencia:\s*capture\.gerencia/);
    assert.match(body, /vendedor:\s*capture\.vendedor/);
    assert.match(body, /setAltaReturnToCapture\(true\)/);
    assert.match(body, /setActiveTab\('asegurados'\)/);
  });

  it('saveAlta returns to Captura writing the new name into capture.asegurado', async () => {
    const appSource = await readAppSource();
    const start = appSource.indexOf('async function saveAlta(');
    assert.ok(start !== -1, 'expected saveAlta');
    const body = appSource.slice(start, appSource.indexOf('\n  }', start));

    assert.match(body, /if \(altaReturnToCapture\) \{[\s\S]*?asegurado:\s*nombre[\s\S]*?setActiveTab\('captura'\)[\s\S]*?setAltaReturnToCapture\(false\)/);
  });

  it('still opens the alta from the asegurado modal, not straight from the combo', async () => {
    const appSource = await readAppSource();
    assert.match(appSource, /function registerAseguradoFromCapture\(\)[\s\S]*?openAltaFromCapture\(name\)/);
  });
});
