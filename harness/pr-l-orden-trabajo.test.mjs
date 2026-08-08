import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadOrdenesTrabajo } from '../src/lib/api.js';

describe('PR L — Orden de trabajo combobox', () => {
  it('loadOrdenesTrabajo returns an empty catalogue without throwing', async () => {
    const result = await loadOrdenesTrabajo();
    assert.ok(result, 'expected a result object');
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.ordenesTrabajo), 'expected ordenesTrabajo array');
    assert.equal(result.ordenesTrabajo.length, 0);
  });

  it('replaces the OT-dependiente feature with a single Orden de trabajo combo', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

    // New field is wired like the others in the assignment card.
    assert.match(appSource, /label="Orden de trabajo"/);
    assert.match(appSource, /applyAssignmentSelection\(\s*current,\s*'ordenTrabajo'/);
    assert.match(appSource, /ordenTrabajoOptions\.length/);

    // Hint distinguishes loading, stub-empty, and normal states.
    assert.match(appSource, /Cargando órdenes de trabajo/);
    assert.match(appSource, /Esperando API/);

    // The old OT feature is gone.
    assert.doesNotMatch(appSource, /dependent-order-entry/);
    assert.doesNotMatch(appSource, /OTs dependientes/);
    assert.doesNotMatch(appSource, /Agregar OT dependiente/);
    assert.doesNotMatch(appSource, /function DatePicker\(/);
    assert.doesNotMatch(appSource, /otSubramo/);
    assert.doesNotMatch(appSource, /dependentOrder/);
    assert.doesNotMatch(appSource, /DependentOrder/);

    // Primary capture action is renamed.
    assert.doesNotMatch(appSource, /'Leer póliza'/);
    assert.match(appSource, /'Leer documentos'/);
  });
});
