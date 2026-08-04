import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERIC_VENDOR_CLAVE,
  mapBiVendorOption,
  findVendorByClave
} from '../src/lib/api.js';
import { applyAssignmentSelection, hasAssignmentTupleChanged } from '../src/lib/utils.js';
import {
  emptyCapture,
  activateGenericAssignment,
  getGenericAssignmentToggleState,
  returnToManualAssignment,
  selectCaptureGerencia,
  selectCaptureLine
} from '../src/App.jsx';

describe('PR A — generic capture assignment', () => {
  describe('A1/A2 — vendor catalog helpers', () => {
    it('mapBiVendorOption builds the additive shape and drops blank labels', () => {
      assert.deepEqual(mapBiVendorOption({ Clave: 'VG001', Nombre: 'Vendedor Genérico', IdVendedor: 123 }), {
        Texto: 'VG001 - Vendedor Genérico',
        Valor: 'VG001 - Vendedor Genérico',
        Clave: 'VG001',
        IdVendedor: 123
      });

      assert.deepEqual(mapBiVendorOption({ Clave: 'VG002', Nombre: 'Solo nombre', IdVendedor: '42' }), {
        Texto: 'VG002 - Solo nombre',
        Valor: 'VG002 - Solo nombre',
        Clave: 'VG002',
        IdVendedor: '42'
      });

      assert.equal(mapBiVendorOption({ Clave: '', Nombre: '  ', IdVendedor: 1 }), null);
      assert.equal(mapBiVendorOption({}), null);
      assert.equal(mapBiVendorOption(null), null);
    });

    it('findVendorByClave defaults to VG001 and compares trimmed, case-sensitive Clave', () => {
      const vendors = [
        { Texto: 'VG001 - Genérico', Valor: 'VG001 - Genérico', Clave: 'VG001', IdVendedor: 99 },
        { Texto: 'OTRO', Valor: 'OTRO', Clave: 'VG002', IdVendedor: 2 }
      ];

      assert.deepEqual(findVendorByClave(vendors), vendors[0]);
      assert.deepEqual(findVendorByClave(vendors, 'VG001'), vendors[0]);
      assert.deepEqual(findVendorByClave(vendors, '  VG001  '), vendors[0]);
      assert.equal(findVendorByClave(vendors, 'vg001'), null);
      assert.equal(findVendorByClave(vendors, 'VG003'), null);
      assert.equal(findVendorByClave([], 'VG001'), null);
      assert.equal(GENERIC_VENDOR_CLAVE, 'VG001');
    });
  });

  describe('A3/A4 — assignment tuple change detection', () => {
    it('returns false when the three tuple fields are the same after normalization', () => {
      const current = { vendedor: 'A', vendedorId: '1', asegurado: 'B', other: 'x' };
      const next = { vendedor: ' A ', vendedorId: '1', asegurado: 'B', other: 'y' };
      assert.equal(hasAssignmentTupleChanged(current, next), false);
    });

    it('returns true when any of the three tuple fields really differ', () => {
      const base = { vendedor: 'A', vendedorId: '1', asegurado: 'B' };

      assert.equal(hasAssignmentTupleChanged(base, { ...base, vendedor: 'a' }), true);
      assert.equal(hasAssignmentTupleChanged(base, { ...base, vendedorId: '2' }), true);
      assert.equal(hasAssignmentTupleChanged(base, { ...base, asegurado: 'C' }), true);
    });

    it('treats missing/empty values as equal', () => {
      assert.equal(hasAssignmentTupleChanged({}, {}), false);
      assert.equal(hasAssignmentTupleChanged({ vendedor: '' }, { vendedor: '  ' }), false);
    });
  });

  describe('A5 — context changes preserve the generic tuple', () => {
    const genericTuple = {
      vendedor: 'VG001 - Vendedor Genérico',
      vendedorId: '99',
      asegurado: 'VG001 - Vendedor Genérico'
    };

    it('preserves VG001 after a Línea change while generic mode is active', () => {
      const current = {
        ...emptyCapture(),
        ...genericTuple,
        assignmentMode: 'generic',
        linea: 'Anterior',
        gerencia: 'Anterior'
      };

      const next = selectCaptureLine(current, 'Nueva línea', current.layout.length);

      assert.equal(next.assignmentMode, 'generic');
      assert.equal(next.vendedor, genericTuple.vendedor);
      assert.equal(next.vendedorId, genericTuple.vendedorId);
      assert.equal(next.asegurado, genericTuple.asegurado);
    });

    it('preserves VG001 after a Gerencia change while generic mode is active', () => {
      const current = {
        ...emptyCapture(),
        ...genericTuple,
        assignmentMode: 'generic',
        linea: 'Línea',
        gerencia: 'Anterior'
      };

      const next = selectCaptureGerencia(current, 'Nueva gerencia', current.layout.length);

      assert.equal(next.assignmentMode, 'generic');
      assert.equal(next.vendedor, genericTuple.vendedor);
      assert.equal(next.vendedorId, genericTuple.vendedorId);
      assert.equal(next.asegurado, genericTuple.asegurado);
    });

    it('still clears the tuple after a Línea change in manual mode', () => {
      const current = {
        ...emptyCapture(),
        vendedor: 'Vendedor manual',
        vendedorId: '12',
        asegurado: 'Asegurado manual',
        linea: 'Anterior',
        gerencia: 'Anterior'
      };

      const next = selectCaptureLine(current, 'Nueva línea', current.layout.length);

      assert.equal(next.assignmentMode, 'manual');
      assert.equal(next.vendedor, '');
      assert.equal(next.vendedorId, '');
      assert.equal(next.asegurado, '');
    });
  });

  describe('A8 — generic assignment toggle availability', () => {
    it('shows a neutral loading state instead of claiming VG001 is unavailable', () => {
      assert.deepEqual(
        getGenericAssignmentToggleState({
          vendedoresLoading: true,
          genericVendor: null,
          assignmentMode: 'manual'
        }),
        { disabled: true, checked: false, statusLabel: 'Cargando vendedores...' }
      );
    });

    it('flags the toggle unavailable when the catalog has no VG001 vendor', () => {
      assert.deepEqual(
        getGenericAssignmentToggleState({
          vendedoresLoading: false,
          genericVendor: null,
          assignmentMode: 'manual'
        }),
        { disabled: true, checked: false, statusLabel: 'No disponible: el catálogo no contiene VG001' }
      );
    });

    it('enables the switch unchecked in manual mode once VG001 is available', () => {
      assert.deepEqual(
        getGenericAssignmentToggleState({
          vendedoresLoading: false,
          genericVendor: { Clave: 'VG001' },
          assignmentMode: 'manual'
        }),
        { disabled: false, checked: false, statusLabel: '' }
      );
    });

    it('enables the switch checked in generic mode once VG001 is available', () => {
      assert.deepEqual(
        getGenericAssignmentToggleState({
          vendedoresLoading: false,
          genericVendor: { Clave: 'VG001' },
          assignmentMode: 'generic'
        }),
        { disabled: false, checked: true, statusLabel: '' }
      );
    });
  });

  describe('A6/A7 — generic/manual assignment state machine', () => {
    const genericVendor = mapBiVendorOption({ Clave: 'VG001', Nombre: 'Vendedor Genérico', IdVendedor: 99 });

    it('emptyCapture initializes in manual mode', () => {
      const capture = emptyCapture();
      assert.equal(capture.assignmentMode, 'manual');
    });

    it('activateGenericAssignment sets the generic tuple and clears documents when the tuple really changes', () => {
      const current = {
        ...emptyCapture(),
        files: [{ name: 'poliza.pdf' }],
        extracted: true,
        aseguradora: 'X',
        poliza: 'Y'
      };

      const next = activateGenericAssignment(current, [genericVendor]);

      assert.equal(next.assignmentMode, 'generic');
      assert.equal(next.vendedor, genericVendor.Valor);
      assert.equal(next.vendedorId, String(genericVendor.IdVendedor));
      assert.equal(next.asegurado, genericVendor.Valor);
      assert.equal(next.files.length, 0);
      assert.equal(next.extracted, false);
      assert.equal(next.aseguradora, '');
      assert.equal(next.poliza, '');
      assert.equal(next.documentsInvalidated, true);
    });

    it('activateGenericAssignment only flips the mode when the tuple is already the same', () => {
      const current = {
        ...emptyCapture(),
        assignmentMode: 'manual',
        vendedor: genericVendor.Valor,
        vendedorId: String(genericVendor.IdVendedor),
        asegurado: genericVendor.Valor,
        files: [{ name: 'poliza.pdf' }],
        extracted: true
      };

      const next = activateGenericAssignment(current, [genericVendor]);

      assert.equal(next.assignmentMode, 'generic');
      assert.equal(next.files.length, 1);
      assert.equal(next.extracted, true);
    });

    it('activateGenericAssignment is a no-op when VG001 is absent', () => {
      const current = emptyCapture();
      const next = activateGenericAssignment(current, []);

      assert.strictEqual(next, current);
      assert.equal(next.assignmentMode, 'manual');
    });

    it('returnToManualAssignment clears the tuple and documents when coming from generic', () => {
      const current = {
        ...emptyCapture(),
        assignmentMode: 'generic',
        vendedor: genericVendor.Valor,
        vendedorId: String(genericVendor.IdVendedor),
        asegurado: genericVendor.Valor,
        files: [{ name: 'poliza.pdf' }],
        extracted: true,
        aseguradora: 'X',
        poliza: 'Y'
      };

      const next = returnToManualAssignment(current);

      assert.equal(next.assignmentMode, 'manual');
      assert.equal(next.vendedor, '');
      assert.equal(next.vendedorId, '');
      assert.equal(next.asegurado, '');
      assert.equal(next.files.length, 0);
      assert.equal(next.extracted, false);
      assert.equal(next.documentsInvalidated, true);
    });

    it('returnToManualAssignment only flips the mode when already manual and empty', () => {
      const current = emptyCapture();
      const next = returnToManualAssignment(current);

      assert.equal(next.assignmentMode, 'manual');
      assert.strictEqual(next.vendedor, '');
      assert.equal(next.files.length, 0);
    });
  });
});
