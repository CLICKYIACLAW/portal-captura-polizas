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
  importCaptureAssignment,
  returnAltaToManualVendor,
  toggleAltaGenericVendor
} from '../src/lib/altaAssignment.js';
import { splitName } from '../src/lib/utils.js';
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

/**
 * The capture context only carries the vendor's display value, so the alta's
 * `assignmentMode`/`vendedorId` — which describe a *different* vendor until the
 * import happens — have to be re-derived from the vendor actually being
 * imported. Left alone, the alta renders the generic switch ON behind an
 * unrelated manual vendor, and one click on it wipes the imported vendor.
 */
describe('§2 — importCaptureAssignment reconciles the imported assignment', () => {
  const vendors = [otherVendor, genericVendor];

  it('drops generic mode when the imported vendor is a manual one, keeping that vendor', () => {
    const current = {
      ...emptyAlta(),
      assignmentMode: 'generic',
      vendedor: genericVendor.Valor,
      vendedorId: '99'
    };
    const next = importCaptureAssignment(current, { linea: 'L', gerencia: 'G', vendedor: otherVendor.Valor }, vendors);

    assert.equal(next.assignmentMode, 'manual');
    assert.equal(next.vendedor, otherVendor.Valor);
    assert.equal(next.vendedorId, '7');
  });

  it('turns generic mode on when the imported vendor is VG001', () => {
    const current = { ...emptyAlta(), vendedor: otherVendor.Valor, vendedorId: '7' };
    const next = importCaptureAssignment(current, { linea: 'L', gerencia: 'G', vendedor: genericVendor.Valor }, vendors);

    assert.equal(next.assignmentMode, 'generic');
    assert.equal(next.vendedor, genericVendor.Valor);
    assert.equal(next.vendedorId, '99');
  });

  it('leaves no stale mode or id behind when the capture has no vendor yet', () => {
    const current = {
      ...emptyAlta(),
      assignmentMode: 'generic',
      vendedor: genericVendor.Valor,
      vendedorId: '99'
    };
    const next = importCaptureAssignment(current, { linea: 'L', gerencia: '', vendedor: '' }, vendors);

    assert.equal(next.assignmentMode, 'manual');
    assert.equal(next.vendedor, '');
    assert.equal(next.vendedorId, '');
  });

  it('clears the id when the imported vendor is not in the catalogue', () => {
    const current = { ...emptyAlta(), assignmentMode: 'generic', vendedor: genericVendor.Valor, vendedorId: '99' };
    const next = importCaptureAssignment(current, { linea: '', gerencia: '', vendedor: 'VG404 - Fuera' }, vendors);

    assert.equal(next.assignmentMode, 'manual');
    assert.equal(next.vendedor, 'VG404 - Fuera');
    assert.equal(next.vendedorId, '');
  });

  it('never reports generic mode while some other vendor sits in the field', () => {
    const modes = ['manual', 'generic'];
    const imported = ['', otherVendor.Valor, genericVendor.Valor, 'VG404 - Fuera'];

    for (const assignmentMode of modes) {
      for (const vendedor of imported) {
        const next = importCaptureAssignment(
          { ...emptyAlta(), assignmentMode, vendedor: genericVendor.Valor, vendedorId: '99' },
          { linea: 'L', gerencia: 'G', vendedor },
          vendors
        );
        assert.equal(
          next.assignmentMode === 'generic',
          next.vendedor === genericVendor.Valor,
          `generic mode must track the imported vendor, got ${next.assignmentMode} for "${vendedor}"`
        );
      }
    }
  });

  it('carries the rest of the capture context and leaves unrelated alta fields alone', () => {
    const current = { ...emptyAlta(), email: 'a@b.co', linea: 'Vieja', gerencia: 'Vieja' };
    const next = importCaptureAssignment(current, { linea: 'Nueva', gerencia: 'Otra', vendedor: '' }, vendors);

    assert.equal(next.linea, 'Nueva');
    assert.equal(next.gerencia, 'Otra');
    assert.equal(next.email, 'a@b.co');
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
    assert.match(capturaVendedor, /<InlineGenericVendorToggle/);
    assert.match(capturaVendedor, /state=\{genericAssignmentToggleState\}/);
    assert.match(capturaVendedor, /onToggle=\{handleToggleAssignmentMode\}/);
    assert.match(capturaVendedor, /Vendedor genérico/);
  });

  it('puts a discreet Registrar asegurado action inside the Captura asegurado cell', async () => {
    const capturaAsegurado = sliceComboCells(await readAppSource())[1];
    assert.match(capturaAsegurado, /label="Asegurado"/);
    assert.match(capturaAsegurado, /className="inline-action"/);
    assert.match(capturaAsegurado, /onClick=\{\(\) => openAltaFromCapture\(''\)\}/);
    assert.match(capturaAsegurado, />\s*Registrar asegurado\s*</);
    assert.match(capturaAsegurado, /disabled=\{!selectedVendorId \|\| aseguradosLoading\}/);
    // The combo itself stays selection-only: registering never happens from the
    // search query, only from the discreet action next to it.
    assert.doesNotMatch(capturaAsegurado, /actionLabel|onAction/);
  });

  it('puts the Vendedor genérico switch inside the Alta vendedor cell too', async () => {
    const altaVendedor = sliceComboCells(await readAppSource())[2];
    assert.match(altaVendedor, /label="Vendedor \*"/);
    assert.match(altaVendedor, /<InlineGenericVendorToggle/);
    assert.match(altaVendedor, /state=\{altaGenericToggleState\}/);
    assert.match(altaVendedor, /onToggle=\{handleToggleAltaAssignmentMode\}/);
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

  it('keeps both switches accessible from a single shared toggle component', async () => {
    const appSource = await readAppSource();
    const start = appSource.indexOf('function InlineGenericVendorToggle(');
    assert.ok(start !== -1, 'expected one shared inline-toggle component');
    const component = appSource.slice(start, appSource.indexOf('\n}\n', start));

    // The accessible switch is declared exactly once...
    assert.equal((appSource.match(/role="switch"/g) || []).length, 1, 'expected a single switch declaration');
    assert.equal((appSource.match(/aria-checked=/g) || []).length, 1);
    assert.equal((appSource.match(/aria-disabled=/g) || []).length, 1);
    assert.equal((appSource.match(/toggle-switch-thumb/g) || []).length, 1);
    assert.match(component, /role="switch"/);
    assert.match(component, /aria-checked=\{state\.checked\}/);
    assert.match(component, /aria-disabled=\{state\.disabled\}/);
    assert.match(component, /disabled=\{state\.disabled\}/);
    assert.match(component, /title=\{state\.statusLabel \|\| undefined\}/);
    assert.match(component, /toggle-switch\$\{state\.checked \? ' is-on' : ''\}/);
    assert.match(component, /<span className="toggle-switch-thumb" aria-hidden="true" \/>/);
    assert.match(component, /className="inline-toggle-label">\{label\}</);
    assert.match(component, /state\.statusLabel \?[\s\S]*?inline-toggle-status/);

    // ...and mounted once per tab.
    assert.equal((appSource.match(/<InlineGenericVendorToggle/g) || []).length, 2, 'expected one toggle per tab');
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

    // The context alone would leave assignmentMode/vendedorId describing the
    // vendor that was there *before* the import.
    assert.match(
      body,
      /importCaptureAssignment\(emptyAlta\(\), captureContext, vendorOptions\)/,
      'expected a blank alta to be seeded with the reconciled capture assignment'
    );
    assert.doesNotMatch(
      body,
      /\.\.\.captureContext\s*\}\)/,
      'expected the capture context to go through the reconciling helper, not a raw spread'
    );
    // Spreading the alta already on screen over emptyAlta() silently defeats the
    // reset: `current` carries every key emptyAlta() produces, so the previous
    // asegurado's RFC, CURP, domicilio and fiscal data all survive it.
    assert.doesNotMatch(
      body,
      /\.\.\.emptyAlta\(\)/,
      'expected emptyAlta() to be the seed itself, not a base some stale state is spread over'
    );
    assert.doesNotMatch(body, /setAlta\(\(current\)/, 'expected the seed not to read the previous alta at all');
  });

  it('saveAlta returns to Captura writing the new name into capture.asegurado', async () => {
    const appSource = await readAppSource();
    const start = appSource.indexOf('async function saveAlta(');
    assert.ok(start !== -1, 'expected saveAlta');
    const body = appSource.slice(start, appSource.indexOf('\n  }', start));

    assert.match(body, /if \(altaReturnToCapture\) \{[\s\S]*?asegurado:\s*nombre[\s\S]*?setActiveTab\('captura'\)[\s\S]*?setAltaReturnToCapture\(false\)/);
  });

  it('starts the round trip straight from the discreet action, with no intermediate modal', async () => {
    const appSource = await readAppSource();
    const capturaAsegurado = sliceComboCells(appSource)[1];

    assert.match(capturaAsegurado, /onClick=\{\(\) => openAltaFromCapture\(''\)\}/);

    // The insured modal is gone for good: no hook, no state, no node, no
    // handlers. If any of these come back the direct navigation has regressed.
    assert.doesNotMatch(appSource, /aseguradoModal/i, 'expected no insured-modal state or node left');
    assert.doesNotMatch(appSource, /asegurado-modal/, 'expected no insured-modal markup left');
    assert.doesNotMatch(appSource, /registerAseguradoFromCapture/);
    assert.doesNotMatch(appSource, /selectAseguradoSuggestion/);
    assert.doesNotMatch(appSource, /canRegisterAsegurado/);
  });

  it('navigating with an empty name leaves the alta identity fields blank', async () => {
    // The discreet action has no name to hand over — the insured is typed in
    // the Alta form — so setCaptureStateFromGroup('') must take the branch that
    // simply blanks razón/apellidos/nombres instead of splitting a full name.
    assert.deepEqual(splitName(''), []);

    const appSource = await readAppSource();
    const start = appSource.indexOf('function setCaptureStateFromGroup(');
    assert.ok(start !== -1, 'expected setCaptureStateFromGroup');
    const body = appSource.slice(start, appSource.indexOf('\n  }', start));

    assert.match(body, /const parts = splitName\(name\);/);
    assert.match(body, /if \(parts\.length >= 3\)/);
    assert.match(body, /razon: name,\s*apP: '',\s*apM: '',\s*nombres: ''/);
  });
});
