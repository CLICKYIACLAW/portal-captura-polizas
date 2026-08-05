import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyAssignmentSelection } from '../src/lib/utils.js';
import { emptyCapture } from '../src/App.jsx';
import {
  createDependentOrder,
  validateDependentOrder,
  addDependentOrder,
  updateDependentOrder,
  removeDependentOrder,
  parseIsoDate,
  formatIsoDate,
  parseDateInput,
  formatDateInput,
  daysInMonth,
  addCalendarDays
} from '../src/lib/dependentOrders.js';

describe('PR J — dependent orders', () => {
  describe('J1 — assignment changes clear dependent orders', () => {
    it('clears dependentOrders on a real change of vendedor', () => {
      const current = {
        ...emptyCapture(),
        vendedor: 'Vendedor A',
        vendedorId: '1',
        asegurado: 'Asegurado X',
        ramo: 'Ramo 1',
        dependentOrders: [{ id: 'OT-1', folio: 'F1' }]
      };

      const next = applyAssignmentSelection(
        current,
        'vendedor',
        'Vendedor B',
        { vendedorId: '2', asegurado: '' },
        current.layout.length
      );

      assert.deepEqual(next.dependentOrders, []);
    });

    it('clears dependentOrders on a real change of asegurado', () => {
      const current = {
        ...emptyCapture(),
        vendedor: 'Vendedor A',
        vendedorId: '1',
        asegurado: 'Asegurado X',
        ramo: 'Ramo 1',
        dependentOrders: [{ id: 'OT-1', folio: 'F1' }]
      };

      const next = applyAssignmentSelection(
        current,
        'asegurado',
        'Asegurado Y',
        {},
        current.layout.length
      );

      assert.deepEqual(next.dependentOrders, []);
    });

    it('clears dependentOrders on a real change of ramo', () => {
      const current = {
        ...emptyCapture(),
        vendedor: 'Vendedor A',
        asegurado: 'Asegurado X',
        ramo: 'Ramo 1',
        dependentOrders: [{ id: 'OT-1', folio: 'F1' }]
      };

      const next = applyAssignmentSelection(
        current,
        'ramo',
        'Ramo 2',
        { subramo: '', ramoData: {} },
        current.layout.length
      );

      assert.deepEqual(next.dependentOrders, []);
    });

    it('keeps dependentOrders on the initial selection of vendedor', () => {
      const current = {
        ...emptyCapture(),
        vendedor: '',
        asegurado: '',
        ramo: 'Ramo 1',
        dependentOrders: [{ id: 'OT-1', folio: 'F1' }]
      };

      const next = applyAssignmentSelection(
        current,
        'vendedor',
        'Vendedor A',
        { vendedorId: '1' },
        current.layout.length
      );

      assert.deepEqual(next.dependentOrders, [{ id: 'OT-1', folio: 'F1' }]);
    });

    it('keeps dependentOrders on the initial selection of asegurado', () => {
      const current = {
        ...emptyCapture(),
        vendedor: 'Vendedor A',
        vendedorId: '1',
        asegurado: '',
        ramo: 'Ramo 1',
        dependentOrders: [{ id: 'OT-1', folio: 'F1' }]
      };

      const next = applyAssignmentSelection(
        current,
        'asegurado',
        'Asegurado X',
        {},
        current.layout.length
      );

      assert.deepEqual(next.dependentOrders, [{ id: 'OT-1', folio: 'F1' }]);
    });

    it('keeps dependentOrders when the same value is selected again', () => {
      const current = {
        ...emptyCapture(),
        vendedor: 'Vendedor A',
        dependentOrders: [{ id: 'OT-1', folio: 'F1' }]
      };

      const next = applyAssignmentSelection(
        current,
        'vendedor',
        'Vendedor A',
        {},
        current.layout.length
      );

      assert.equal(next, current);
    });
  });

  describe('J2 — createDependentOrder', () => {
    it('creates an order with the supplied id and asegurado', () => {
      const order = createDependentOrder({ id: 'OT-1', asegurado: 'Asegurado X' });
      assert.equal(order.id, 'OT-1');
      assert.equal(order.asegurado, 'Asegurado X');
      assert.equal(order.folio, '');
      assert.equal(order.concepto, '');
      assert.equal(order.ramo, '');
      assert.equal(order.subramo, '');
      assert.equal(order.startDate, '');
      assert.equal(order.endDate, '');
    });

    it('generates a stable id when none is provided', () => {
      const order = createDependentOrder({ asegurado: 'Asegurado X' });
      assert.match(order.id, /^[a-z0-9-]+$/);
      assert.ok(order.id.length >= 8);
    });

    it('returns a fresh order with empty defaults and a generated id', () => {
      const order = createDependentOrder();
      assert.match(order.id, /^[a-z0-9-]+$/);
      assert.ok(order.id.length >= 8);
      assert.equal(order.asegurado, '');
      assert.equal(order.folio, '');
      assert.equal(order.concepto, '');
    });
  });

  describe('J3 — validateDependentOrder', () => {
    const baseOrder = {
      id: 'OT-1',
      folio: 'F1',
      concepto: 'Concepto',
      asegurado: 'Asegurado X',
      ramo: 'Ramo 1',
      subramo: 'Subramo 1',
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    };

    it('validates a complete order', () => {
      const result = validateDependentOrder(baseOrder);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, {});
    });

    it('requires folio, concepto, asegurado and ramo', () => {
      for (const key of ['folio', 'concepto', 'asegurado', 'ramo']) {
        const result = validateDependentOrder({ ...baseOrder, [key]: '' });
        assert.equal(result.valid, false);
        assert.ok(result.errors[key]);
      }
    });

    it('requires subramo when the catalogue is non-empty', () => {
      const result = validateDependentOrder({ ...baseOrder, subramo: '' }, ['Subramo 1']);
      assert.equal(result.valid, false);
      assert.ok(result.errors.subramo);
    });

    it('does not require subramo when the catalogue is empty', () => {
      const result = validateDependentOrder({ ...baseOrder, subramo: '' }, []);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, {});
    });

    it('rejects an invalid start date', () => {
      const result = validateDependentOrder({ ...baseOrder, startDate: 'not-a-date' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.startDate);
    });

    it('rejects an invalid end date', () => {
      const result = validateDependentOrder({ ...baseOrder, endDate: '2025-02-30' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.endDate);
    });

    it('rejects endDate earlier than startDate', () => {
      const result = validateDependentOrder({
        ...baseOrder,
        startDate: '2025-06-01',
        endDate: '2025-05-31'
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.endDate);
    });

    it('accepts equal startDate and endDate', () => {
      const result = validateDependentOrder({
        ...baseOrder,
        startDate: '2025-06-01',
        endDate: '2025-06-01'
      });
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, {});
    });
  });

  describe('J4 — list mutations', () => {
    const order = createDependentOrder({ id: 'OT-1', asegurado: 'Asegurado X' });

    it('adds an order immutably', () => {
      const orders = addDependentOrder([], order);
      assert.equal(orders.length, 1);
      assert.notEqual(orders, []);
      assert.equal(orders[0].id, 'OT-1');
    });

    it('updates an order by id immutably', () => {
      const orders = addDependentOrder([], order);
      const next = updateDependentOrder(orders, 'OT-1', { folio: 'F2' });
      assert.equal(next[0].folio, 'F2');
      assert.notEqual(next, orders);
      assert.equal(next.length, 1);
    });

    it('returns the same array when updating an unknown id', () => {
      const orders = addDependentOrder([], order);
      const next = updateDependentOrder(orders, 'OT-99', { folio: 'F2' });
      assert.equal(next, orders);
    });

    it('removes an order by id immutably', () => {
      const orders = addDependentOrder([], order);
      const next = removeDependentOrder(orders, 'OT-1');
      assert.equal(next.length, 0);
      assert.notEqual(next, orders);
    });
  });

  describe('J5 — date helpers', () => {
    it('parses ISO dates into calendar parts', () => {
      assert.deepEqual(parseIsoDate('2025-03-15'), { year: 2025, month: 3, day: 15 });
      assert.equal(parseIsoDate(''), null);
      assert.equal(parseIsoDate('invalid'), null);
      assert.equal(parseIsoDate('2025-13-01'), null);
    });

    it('formats calendar parts as ISO', () => {
      assert.equal(formatIsoDate({ year: 2025, month: 3, day: 15 }), '2025-03-15');
      assert.equal(formatIsoDate({ year: 2025, month: 3, day: 2 }), '2025-03-02');
    });

    it('parses DD/MM/YYYY into ISO', () => {
      assert.equal(parseDateInput('15/03/2025'), '2025-03-15');
      assert.equal(parseDateInput('02/03/2025'), '2025-03-02');
      assert.equal(parseDateInput('2025-03-15'), '2025-03-15');
    });

    it('rejects invalid or partial typed dates', () => {
      assert.equal(parseDateInput('30/02/2025'), null);
      assert.equal(parseDateInput('2025-02-30'), null);
      assert.equal(parseDateInput('15/03'), null);
      assert.equal(parseDateInput('not-a-date'), null);
      assert.equal(parseDateInput(''), '');
    });

    it('formats ISO as DD/MM/YYYY', () => {
      assert.equal(formatDateInput('2025-03-15'), '15/03/2025');
      assert.equal(formatDateInput('2025-03-02'), '02/03/2025');
      assert.equal(formatDateInput(''), '');
    });

    it('reports days in month correctly including leap years', () => {
      assert.equal(daysInMonth(2025, 2), 28);
      assert.equal(daysInMonth(2024, 2), 29);
      assert.equal(daysInMonth(2025, 4), 30);
      assert.equal(daysInMonth(2025, 1), 31);
    });

    it('adds calendar days without time-zone shifts', () => {
      assert.equal(addCalendarDays('2025-03-15', 1), '2025-03-16');
      assert.equal(addCalendarDays('2025-03-01', -1), '2025-02-28');
      assert.equal(addCalendarDays('2024-02-28', 2), '2024-03-01');
    });
  });

  describe('J6 — App source structure', () => {
    let appSource;

    before(async () => {
      appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    });

    it('initializes dependentOrders in emptyCapture', () => {
      const emptyCaptureStart = appSource.indexOf('export function emptyCapture(');
      const emptyCaptureEnd = appSource.indexOf('\n}', emptyCaptureStart) + 2;
      const body = appSource.slice(emptyCaptureStart, emptyCaptureEnd);
      assert.match(body, /dependentOrders:\s*\[\]/);
    });

    it('renders the OT entry point inside the assignment card', () => {
      assert.match(appSource, /Agregar OT dependiente/);
    });

    it('disables the entry point until asegurado and ramo are present', () => {
      const labelIndex = appSource.indexOf('Agregar OT dependiente');
      assert.ok(labelIndex !== -1, 'expected the add button label');
      // Use the second occurrence (the entry-point button), not the modal title.
      const addButtonIndex = appSource.indexOf('Agregar OT dependiente', labelIndex + 1);
      assert.ok(addButtonIndex !== -1, 'expected the entry point button');
      const addButtonRegion = appSource.slice(addButtonIndex - 300, addButtonIndex + 300);
      assert.match(addButtonRegion, /capture\.asegurado/);
      assert.match(addButtonRegion, /capture\.ramo/);
    });

    it('renders an OT modal with the required fields', () => {
      const modalStart = appSource.indexOf('const dependentOrderModalNode');
      const modalEnd = appSource.indexOf('const errorModalNode', modalStart);
      assert.ok(modalStart !== -1, 'expected a dependentOrderModalNode');
      assert.ok(modalEnd > modalStart, 'expected the modal to end before the error modal');
      const modal = appSource.slice(modalStart, modalEnd);
      assert.match(modal, /Folio/);
      assert.match(modal, /Concepto/);
      assert.match(modal, /Asegurado/);
      assert.match(modal, /Ramo/);
      assert.match(modal, /Subramo/);
      assert.match(modal, /Inicio de vigencia/);
      assert.match(modal, /Fin de vigencia/);
    });

    it('keeps Asegurado read-only in the modal', () => {
      const modalStart = appSource.indexOf('const dependentOrderModalNode');
      const modalEnd = appSource.indexOf('const errorModalNode', modalStart);
      const modal = appSource.slice(modalStart, modalEnd);
      const aseguradoRegion = modal.slice(modal.indexOf('Asegurado'), modal.indexOf('Asegurado') + 400);
      assert.match(aseguradoRegion, /readOnly/);
    });

    it('renders the compact OT list below the assignment card', () => {
      const listStart = appSource.indexOf('capture.dependentOrders.length > 0');
      assert.ok(listStart !== -1, 'expected the OT list card');
      const listRegion = appSource.slice(listStart, listStart + 600);
      assert.match(listRegion, /dependent-order-row/);
    });

    it('uses order.id as the list row key', () => {
      const listStart = appSource.indexOf('capture.dependentOrders.length > 0');
      const listRegion = appSource.slice(listStart, listStart + 600);
      assert.match(listRegion, /key=\{order\.id\}/);
    });

    it('does not promise persistence in any user-facing copy', () => {
      assert.doesNotMatch(appSource, /\bguarda(?:da|do|das|dos)?\s+(?:la|el|los|las)\s*OT/i);
      assert.doesNotMatch(appSource, /\bpersiste(?:e|ncia|r)?\b/i);
      assert.doesNotMatch(appSource, /\balmacena(?:da|do|das|dos)?\b/i);
      assert.doesNotMatch(appSource, /\barchiva(?:da|do|das|dos)?\b/i);
    });
  });
});
