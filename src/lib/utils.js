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

  const emailValue = String(alta.email ?? '');
  if (emailValue.length > 0) {
    notes.email = isValidAltaEmail(emailValue)
      ? { text: 'Correo válido', tone: 'ok' }
      : { text: 'Correo inválido', tone: 'bad' };
  }

  const telValue = String(alta.tel ?? '');
  if (telValue.length > 0) {
    notes.tel = isValidAltaPhone(telValue)
      ? { text: 'Teléfono válido', tone: 'ok' }
      : { text: 'Teléfono incompleto', tone: 'muted' };
  }

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

const ALTA_REQUIRED_SHARED = [
  'vendedor',
  'grupo',
  'email',
  'tel',
  'calle',
  'numero',
  'cp',
  'colonia',
  'municipio',
  'estado'
];

const ALTA_NAME_FIELDS = {
  fisica: ['apP', 'apM', 'nombres'],
  moral: ['razon']
};

const ALTA_LABELS = {
  linea: 'línea',
  gerencia: 'gerencia',
  vendedor: 'vendedor',
  grupo: 'grupo',
  email: 'correo',
  tel: 'teléfono',
  calle: 'calle',
  numero: 'número',
  cp: 'código postal',
  colonia: 'colonia',
  municipio: 'municipio',
  estado: 'estado',
  apP: 'apellido paterno',
  apM: 'apellido materno',
  nombres: 'nombre(s)',
  razon: 'razón social',
  curp: 'CURP'
};

function isEmptyAltaValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

export function getAltaRequiredKeys(tipo) {
  const nameFields = ALTA_NAME_FIELDS[tipo] || ALTA_NAME_FIELDS.fisica;
  return [...ALTA_REQUIRED_SHARED, ...nameFields];
}

export function getAltaMissingKeys(alta) {
  if (alta == null) return [];
  const required = getAltaRequiredKeys(alta.tipo);
  return required.filter((key) => isEmptyAltaValue(alta[key]));
}

export function isValidAltaEmail(value) {
  const email = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email);
}

export function normalizeAltaPhone(value) {
  const raw = String(value ?? '');
  if (raw === '55 1234 5678') return '5551234567';
  return raw.replace(/\D/g, '').slice(0, 10);
}

export function isValidAltaPhone(value) {
  return String(value ?? '').replace(/\D/g, '').length === 10;
}

export function getAltaInvalidKeys(alta) {
  if (alta == null) return [];

  const invalid = [];
  if (!isEmptyAltaValue(alta.email) && !isValidAltaEmail(alta.email)) invalid.push('email');
  if (!isEmptyAltaValue(alta.tel) && !isValidAltaPhone(alta.tel)) invalid.push('tel');
  return invalid;
}

export function isAltaComplete(alta) {
  if (alta == null) return false;
  return getAltaMissingKeys(alta).length === 0 && getAltaInvalidKeys(alta).length === 0;
}

export function getAltaSaveHint(alta) {
  const missing = getAltaMissingKeys(alta);
  if (missing.length === 0) {
    const invalid = getAltaInvalidKeys(alta);
    return invalid.length ? `Revisa: ${invalid.map((key) => ALTA_LABELS[key]).join(', ')}.` : '';
  }
  if (missing.length === 1) {
    return `Falta: ${ALTA_LABELS[missing[0]]}.`;
  }
  if (missing.length <= 4) {
    return `Faltan: ${missing.map((key) => ALTA_LABELS[key]).join(', ')}.`;
  }
  const first = missing.slice(0, 4).map((key) => ALTA_LABELS[key]).join(', ');
  return `Faltan: ${first} y ${missing.length - 4} más.`;
}

export const ALTA_EXTRACTABLE_KEYS = [
  'apP',
  'apM',
  'nombres',
  'razon',
  'rfc',
  'curp',
  'email',
  'tel',
  'calle',
  'numero',
  'cp',
  'colonia',
  'municipio',
  'estado',
  'giro',
  'regimen'
];

export function buildAltaAnthropicPrompt(tipo) {
  const fisicaNameKeys = tipo === 'fisica' ? ['apP', 'apM', 'nombres'] : [];
  const moralNameKey = tipo === 'moral' ? ['razon'] : [];
  const commonKeys = ['rfc', 'curp', 'email', 'tel', 'calle', 'numero', 'cp', 'colonia', 'municipio', 'estado', 'giro', 'regimen'];
  const keys = [...fisicaNameKeys, ...moralNameKey, ...commonKeys];
  const keysList = keys.map((key) => `    "${key}": string | null`).join(',\n');

  return [
    'Analiza el documento adjunto de un asegurado en México (RFC, constancia de situación fiscal, comprobante de domicilio o INE) y extrae todos los datos que puedas completar en el formulario.',
    'Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones y sin texto adicional.',
    'Cuando un dato no aparezca con claridad, usa null.',
    'No inventes datos.',
    'Todos los campos son textos.',
    'La estructura debe ser:',
    '{',
    '  "alta": {',
    keysList,
    '  }',
    '}',
    'Usa exactamente las claves técnicas indicadas como claves JSON; no inventes claves.',
    'Si el documento no muestra un campo, omítelo o usa null.',
    'Nunca devuelvas un arreglo posicional; usa siempre el objeto con claves.',
    'Devuelve los datos listos para llenar el alta.'
  ].join('\n');
}

export function mapAltaExtraction(current, result) {
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    return current;
  }

  const base = { ...current };
  const source =
    result && typeof result === 'object' && !Array.isArray(result) && result.alta && typeof result.alta === 'object' && !Array.isArray(result.alta)
      ? result.alta
      : {};

  const filledKeys = new Set();

  for (const key of ALTA_EXTRACTABLE_KEYS) {
    if (!isEmptyAltaValue(base[key])) continue;

    let value = source[key];
    if (value === null || value === undefined) continue;
    value = String(value).trim();
    if (value === '') continue;

    if (base.tipo === 'fisica' && key === 'razon') continue;
    if (base.tipo === 'moral' && (key === 'apP' || key === 'apM' || key === 'nombres')) continue;

    base[key] = value;
    filledKeys.add(key);
  }

  if (filledKeys.has('cp')) {
    const afterCp = applyAltaPostalCode(base, base.cp);
    base.estado = afterCp.estado;
    base.estadoDerivado = afterCp.estadoDerivado;
  }

  if (filledKeys.has('estado')) {
    base.estadoDerivado = false;
  }

  base.tipo = current.tipo;
  return base;
}
