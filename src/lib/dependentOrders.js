function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

export function parseIsoDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

export function formatIsoDate(parts) {
  const { year, month, day } = parts || {};
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const iso = parseIsoDate(text);
  if (iso) return formatIsoDate(iso);

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return formatIsoDate({ year, month, day });
}

export function formatDateInput(iso) {
  const parts = parseIsoDate(iso);
  if (!parts) return '';
  const d = String(parts.day).padStart(2, '0');
  const m = String(parts.month).padStart(2, '0');
  return `${d}/${m}/${parts.year}`;
}

export function addCalendarDays(iso, delta) {
  const parts = parseIsoDate(iso);
  if (!parts) return '';

  let { year, month, day } = parts;
  let remaining = delta;

  while (remaining > 0) {
    const limit = daysInMonth(year, month);
    const canAdvance = limit - day;
    if (remaining <= canAdvance) {
      day += remaining;
      remaining = 0;
    } else {
      remaining -= canAdvance + 1;
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  while (remaining < 0) {
    if (day + remaining >= 1) {
      day += remaining;
      remaining = 0;
    } else {
      remaining += day;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
  }

  return formatIsoDate({ year, month, day });
}

function generateOrderId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDependentOrder({ id, asegurado } = {}) {
  return {
    id: id ?? generateOrderId(),
    folio: '',
    concepto: '',
    asegurado: asegurado ?? '',
    ramo: '',
    subramo: '',
    startDate: '',
    endDate: ''
  };
}

function normalizeOrderField(value) {
  return String(value ?? '').trim();
}

export function validateDependentOrder(order, subramoCatalog = []) {
  const errors = {};

  const folio = normalizeOrderField(order?.folio);
  const concepto = normalizeOrderField(order?.concepto);
  const asegurado = normalizeOrderField(order?.asegurado);
  const ramo = normalizeOrderField(order?.ramo);
  const subramo = normalizeOrderField(order?.subramo);

  if (!folio) errors.folio = 'El folio es requerido.';
  if (!concepto) errors.concepto = 'El concepto es requerido.';
  if (!asegurado) errors.asegurado = 'El asegurado es requerido.';
  if (!ramo) errors.ramo = 'El ramo es requerido.';

  const hasSubramos = Array.isArray(subramoCatalog) && subramoCatalog.length > 0;
  if (hasSubramos && !subramo) {
    errors.subramo = 'El subramo es requerido para este ramo.';
  }

  const startDate = parseIsoDate(order?.startDate);
  const endDate = parseIsoDate(order?.endDate);

  if (!startDate) errors.startDate = 'La fecha de inicio no es válida.';
  if (!endDate) errors.endDate = 'La fecha de fin no es válida.';

  if (startDate && endDate) {
    const start = startDate.year * 10000 + startDate.month * 100 + startDate.day;
    const end = endDate.year * 10000 + endDate.month * 100 + endDate.day;
    if (end < start) {
      errors.endDate = 'La fecha de fin no puede ser anterior a la de inicio.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

export function addDependentOrder(orders, order) {
  const normalized = {
    ...createDependentOrder(),
    ...order,
    folio: normalizeOrderField(order?.folio),
    concepto: normalizeOrderField(order?.concepto),
    asegurado: normalizeOrderField(order?.asegurado),
    ramo: normalizeOrderField(order?.ramo),
    subramo: normalizeOrderField(order?.subramo)
  };
  return [...orders, normalized];
}

export function updateDependentOrder(orders, id, patch) {
  const index = orders.findIndex((order) => order.id === id);
  if (index === -1) return orders;

  const current = orders[index];
  const next = { ...current, ...patch };
  const normalized = {
    ...next,
    folio: normalizeOrderField(next.folio),
    concepto: normalizeOrderField(next.concepto),
    asegurado: normalizeOrderField(next.asegurado),
    ramo: normalizeOrderField(next.ramo),
    subramo: normalizeOrderField(next.subramo)
  };

  const nextOrders = [...orders];
  nextOrders[index] = normalized;
  return nextOrders;
}

export function removeDependentOrder(orders, id) {
  return orders.filter((order) => order.id !== id);
}
