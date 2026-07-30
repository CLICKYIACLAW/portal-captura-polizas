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
