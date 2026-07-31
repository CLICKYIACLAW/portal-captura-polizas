import { resolveMexicanAddressFromPostalCode } from './cpPrefixEstado.js';
import { validateRfc } from './rfc.js';

export function normalizeAssignmentValue(value) {
  return value == null ? '' : String(value).trim();
}

export function applyCaptureFieldUpdate(current, field, value) {
  const base = current != null ? { ...current } : {};

  if (field === 'confirmed') {
    return { ...base, confirmed: Boolean(value) };
  }

  return { ...base, [field]: value, confirmed: false };
}

export function classifyAssignmentTransition(previousValue, nextValue) {
  const previous = normalizeAssignmentValue(previousValue);
  const next = normalizeAssignmentValue(nextValue);
  if (next === '' || previous === next) return 'ignore';
  if (previous === '') return 'initial';
  return 'change';
}

export function applyAssignmentSelection(
  current,
  field,
  nextValue,
  dependentPatch = {},
  layoutLength = 0
) {
  const transition = classifyAssignmentTransition(current[field], nextValue);
  if (transition === 'ignore') return current;

  const base = {
    ...current,
    [field]: nextValue,
    ...dependentPatch
  };

  if (transition === 'initial') {
    return base;
  }

  const hadDocuments = (current.files || []).length > 0;
  const hadReadState =
    Boolean(current.extracted) ||
    Boolean(current.aseguradora) ||
    Boolean(current.poliza) ||
    Object.keys(current.ramoData || {}).length > 0;

  return {
    ...base,
    files: [],
    aseguradora: '',
    poliza: '',
    layout: Array(layoutLength).fill(''),
    ramoData: {},
    extracted: false,
    confirmed: false,
    documentsInvalidated: current.documentsInvalidated || hadDocuments || hadReadState
  };
}

export function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatShortDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function formatMoney(value) {
  const num = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(num) || num === 0) return '—';
  return num.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function countFilled(values) {
  return values.reduce((acc, value) => (String(value ?? '').trim() ? acc + 1 : acc), 0);
}

export function splitName(name) {
  return normalizeText(name).split(/\s+/).filter(Boolean);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Error HTTP ${response.status}`);
  }
  return payload;
}

export function applyAltaPostalCode(current, cp) {
  const base = current != null ? { ...current } : {};
  const next = { ...base, cp };

  const digits = String(cp ?? '').replace(/\D/g, '');
  const resolved = digits.length === 5 ? resolveMexicanAddressFromPostalCode(digits) : null;

  const currentEstado = String(base.estado ?? '');
  const wasDerived = base.estadoDerivado === true;

  if (resolved) {
    if (currentEstado === '' || wasDerived) {
      next.estado = resolved.estado;
      next.estadoDerivado = true;
    }
  } else if (wasDerived) {
    next.estado = '';
    next.estadoDerivado = false;
  }

  return next;
}

export function buildAltaFieldNotes(alta) {
  if (alta == null) return {};

  const notes = {};

  const rfcValue = String(alta.rfc ?? '');
  if (rfcValue.length > 0) {
    const result = validateRfc(rfcValue);
    if (result.state === 'valid') {
      notes.rfc = { text: 'RFC válido', tone: 'ok' };
    } else if (result.state === 'invalid') {
      notes.rfc = { text: 'RFC inválido', tone: 'bad' };
    } else {
      notes.rfc = { text: 'RFC incompleto', tone: 'muted' };
    }
  }

  const cpValue = String(alta.cp ?? '');
  if (cpValue.length > 0) {
    const digits = cpValue.replace(/\D/g, '');
    if (digits.length < 5) {
      notes.cp = { text: 'CP incompleto', tone: 'muted' };
    } else if (resolveMexicanAddressFromPostalCode(digits)) {
      notes.cp = { text: 'CP válido', tone: 'ok' };
    } else {
      notes.cp = { text: 'CP no reconocido', tone: 'bad' };
    }
  }

  if (alta.estadoDerivado === true) {
    notes.estado = { text: 'Valor derivado', tone: 'info' };
  }

  return notes;
}
