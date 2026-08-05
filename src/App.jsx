import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import appPackage from '../package.json';
import {
  buscarEjecutivos,
  createAsegurado,
  createGrupo,
  createLog,
  createPoliza,
  downloadAttachmentUrl,
  findVendorByClave,
  loadAsegurados,
  loadGrupos,
  loadRamos,
  loadVendedores,
  loadSubramos
} from './lib/api';
import {
  POLIZA_ASEGURADO_INDEX,
  POLIZA_LAYOUT_FIELDS,
  POLIZA_LAYOUT_INDEX_BY_KEY,
  POLIZA_LAYOUT_SECTIONS,
  POLIZA_LAYOUT_DISPLAY_SECTIONS,
  buildExtractionFieldGuide,
  mapExtractedFieldsToLayout,
  applyCompanyFallback,
  buildDataSummaryGroups,
  applyDerivedAddressFields,
  buildFieldNotes
} from './lib/polizaLayout';
import legacyBootstrap from '../storage/bootstrap.json';
import {
  applyAltaPostalCode,
  applyAssignmentSelection,
  applyCaptureFieldUpdate,
  buildAltaAnthropicPrompt,
  hasAssignmentTupleChanged,
  buildAltaFieldNotes,
  countFilled,
  fileToBase64,
  formatDateTime,
  formatMoney,
  formatShortDate,
  getAltaSaveHint,
  isAltaComplete,
  mapAltaExtraction,
  normalizeKey,
  normalizeAltaPhone,
  normalizeText,
  splitName
} from './lib/utils';
import { findGroupNameMatches } from './lib/groupCatalog';
import { applyAltaContextChange, toggleAltaGenericVendor } from './lib/altaAssignment';
import {
  REGIMENES_FISCALES,
  formatRegimenOption,
  formatUsoCfdiOption,
  getUsosCfdiParaRegimen
} from './lib/satCatalog';

const TAB_IDS = ['captura', 'asegurados', 'polizas', 'bitacora'];
const TAB_LABELS = {
  captura: 'Captura',
  asegurados: 'Alta de asegurados',
  polizas: 'Pólizas',
  bitacora: 'Bitácora'
};
const AUTH_STORAGE_KEY = 'captura-polizas.auth.v1';
const EMPTY_BOOT = {
  catalogs: {
    lineas: [],
    gerencias: {},
    vendedores: {},
    asegurados: {},
    ramos: [],
    subramos: {},
    ramoSchemas: {},
    danosEmpresarialesSchema: null,
    fields: [],
    sections: []
  },
  records: {
    polizas: [],
    asegurados: [],
    grupos: [],
    log: []
  }
};

const LOCAL_BOOT = {
  catalogs: legacyBootstrap.catalogs || EMPTY_BOOT.catalogs,
  records: legacyBootstrap.records || EMPTY_BOOT.records
};

export function emptyCapture(length = POLIZA_LAYOUT_FIELDS.length) {
  return {
    linea: '',
    gerencia: '',
    vendedor: '',
    vendedorId: '',
    asegurado: '',
    assignmentMode: 'manual',
    ramo: '',
    subramo: '',
    aseguradora: '',
    poliza: '',
    layout: Array(length).fill(''),
    derivedFields: [],
    ramoData: {},
    files: [],
    extracted: false,
    confirmed: false,
    documentsInvalidated: false
  };
}

export function emptyAlta() {
  return {
    tipo: 'fisica',
    linea: '',
    gerencia: '',
    vendedor: '',
    vendedorId: '',
    assignmentMode: 'manual',
    grupo: '',
    apP: '',
    apM: '',
    nombres: '',
    razon: '',
    rfc: '',
    curp: '',
    email: '',
    tel: '',
    calle: '',
    numero: '',
    cp: '',
    colonia: '',
    municipio: '',
    estado: '',
    estadoDerivado: false,
    giro: '',
    regimen: '',
    regimenClave: '',
    requiereFactura: false,
    usoCfdi: ''
  };
}

/**
 * Selects a Régimen Fiscal for the Alta form. If the previously chosen Uso de
 * CFDI is no longer compatible with the newly selected régimen (per SAT's
 * c_UsoCFDI/c_RegimenFiscal compatibility matrix), it is cleared so the form
 * can never hold a régimen/uso-CFDI pair SAT would reject at stamping time.
 */
export function selectAltaRegimen(current, value) {
  const selected = REGIMENES_FISCALES.find((regimen) => formatRegimenOption(regimen) === value);
  const nextClave = selected?.clave || '';
  const compatibleUsos = getUsosCfdiParaRegimen(nextClave).map(formatUsoCfdiOption);
  const usoCfdiStillValid = Boolean(current.usoCfdi) && compatibleUsos.includes(current.usoCfdi);

  return {
    ...current,
    regimen: value,
    regimenClave: nextClave,
    usoCfdi: usoCfdiStillValid ? current.usoCfdi : ''
  };
}

export function activateGenericAssignment(current, vendors) {
  const generic = findVendorByClave(vendors);
  if (!generic) return current;

  const patch = {
    vendedor: generic.Valor ?? '',
    vendedorId: String(generic.IdVendedor ?? ''),
    asegurado: generic.Valor ?? ''
  };

  if (hasAssignmentTupleChanged(current, { ...current, ...patch })) {
    return applyAssignmentSelection(
      current,
      'assignmentMode',
      'generic',
      patch,
      POLIZA_LAYOUT_FIELDS.length
    );
  }

  return { ...current, assignmentMode: 'generic' };
}

export function returnToManualAssignment(current) {
  const patch = {
    vendedor: '',
    vendedorId: '',
    asegurado: ''
  };

  if (hasAssignmentTupleChanged(current, { ...current, ...patch })) {
    return applyAssignmentSelection(
      current,
      'assignmentMode',
      'manual',
      patch,
      POLIZA_LAYOUT_FIELDS.length
    );
  }

  return { ...current, assignmentMode: 'manual' };
}


export function selectCaptureLine(current, value, layoutLength) {
  const dependentPatch = {
    gerencia: '',
    ramo: '',
    subramo: ''
  };

  if (current.assignmentMode !== 'generic') {
    Object.assign(dependentPatch, {
      vendedor: '',
      vendedorId: '',
      asegurado: ''
    });
  }

  return applyAssignmentSelection(current, 'linea', value, dependentPatch, layoutLength);
}

export function selectCaptureGerencia(current, value, layoutLength) {
  const dependentPatch = current.assignmentMode === 'generic'
    ? {}
    : { vendedor: '', vendedorId: '', asegurado: '' };

  return applyAssignmentSelection(current, 'gerencia', value, dependentPatch, layoutLength);
}

export function getGenericAssignmentToggleState({ vendedoresLoading, genericVendor, assignmentMode }) {
  const checked = assignmentMode === 'generic';

  if (vendedoresLoading) {
    return { disabled: true, checked, statusLabel: 'Cargando vendedores...' };
  }

  if (!genericVendor) {
    return { disabled: true, checked, statusLabel: 'No disponible: el catálogo no contiene VG001' };
  }

  return { disabled: false, checked, statusLabel: '' };
}

function normalizeTokens(value) {
  const stop = new Set(['sa', 'de', 'cv', 's', 'a', 'rl', 'sc', 'sapi', 'y', 'del', 'la', 'el']);
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((token) => token && !stop.has(token))
  );
}

function getRamoSchema(catalogs, ramo, subramo) {
  if (!ramo) return null;
  if (normalizeKey(ramo) === normalizeKey('Vehículos')) return null;
  if (normalizeKey(ramo) === normalizeKey('Daños') && normalizeKey(subramo) === normalizeKey('Empresariales')) {
    return catalogs.danosEmpresarialesSchema || null;
  }
  return catalogs.ramoSchemas?.[ramo] || null;
}

function computeRamoLabels(schema) {
  if (!schema) return [];
  return [...(schema.main || []), ...(schema.full || [])].map((field) => field[0]);
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function fileExt(name) {
  const parts = String(name || '').split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function getComboOption(option) {
  if (typeof option === 'string' || typeof option === 'number') {
    const value = String(option);
    return { label: value, value };
  }

  if (!option || typeof option !== 'object') {
    return { label: '', value: '' };
  }

  const label = String(
    option.label ??
      option.text ??
      option.Texto ??
      option.name ??
      option.Nombre ??
      option.value ??
      option.valor ??
      option.Valor ??
      ''
  ).trim();
  const value = String(option.value ?? option.valor ?? option.Valor ?? option.id ?? option.Id ?? label).trim();
  return { label, value };
}

function ComboField({
  label,
  value,
  options,
  placeholder,
  onSelect,
  disabled,
  actionLabel,
  onAction,
  actionDisabled = false,
  hint
}) {
  const [query, setQuery] = useState(value || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const normalizedOptions = useMemo(() => (options || []).map(getComboOption).filter((option) => option.label || option.value), [options]);

  useEffect(() => {
    const selected = normalizedOptions.find((option) => option.value === String(value || ''));
    setQuery(selected?.label || String(value || ''));
    setSearchTerm('');
  }, [value, normalizedOptions]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      return normalizedOptions.slice(0, 250);
    }
    return normalizedOptions.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 250);
  }, [normalizedOptions, searchTerm]);

  return (
    <div className="combo-field">
      <label>{typeof label === 'string' && label.endsWith(' *') ? <>{label.slice(0, -2)} <span className="required-mark">*</span></> : label}</label>
      <div className={`combo-shell ${disabled ? 'disabled' : ''}`}>
        <input
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setSearchTerm(nextValue);
            onSelect('');
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
        />
        {open && !disabled ? (
          <div className="combo-popover">
            {filtered.length ? (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={option.value === String(value || '') ? 'selected' : ''}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setQuery(option.label);
                    setSearchTerm('');
                    onSelect(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="combo-empty">Sin coincidencias</div>
            )}
            {onAction ? (
              <div className="combo-action">
                <button
                  type="button"
                  className="action"
                  disabled={actionDisabled}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onAction(query.trim());
                    setOpen(false);
                  }}
                >
                  {typeof actionLabel === 'function' ? actionLabel(query.trim()) : actionLabel}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {hint ? <small className="field-hint">{hint}</small> : null}
    </div>
  );
}

function Card({ title, subtitle, right, badge, children, tone = 'neutral', headAlign = 'space-between' }) {
  return (
    <section className={`card tone-${tone}`}>
      <div className={`card-head align-${headAlign}`}>
        {badge ? <span className="section-badge">{badge}</span> : null}
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {right ? <div className="card-right">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function TabIcon({ tabId }) {
  switch (tabId) {
    case 'captura':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      );
    case 'asegurados':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="8.5" r="3.5" />
          <path d="M4 19c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" />
          <path d="M18.5 7v5M16 9.5h5" />
        </svg>
      );
    case 'polizas':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
  }
}

function SectionFields({ sections, fields, layout, onChange, notes = {} }) {
  return (
    <div className="section-grid">
      {(sections || []).map((section, index) => {
        const title = section.title || section[0];
        const fieldIndexes = Array.isArray(section.indexes)
          ? section.indexes
          : Array.isArray(section[1])
            ? section[1]
            : [];
        const subgroups = section.subgroups || [{ title: null, indexes: fieldIndexes }];
        const open = section.openByDefault !== undefined ? section.openByDefault : index < 2;
        return (
          <details key={`${title}-${index}`} className="section-card" open={open}>
            <summary>
              <span>{title}</span>
              <span className="badge">
                {countFilled(fieldIndexes.map((fieldIndex) => layout[fieldIndex]))} / {fieldIndexes.length}
              </span>
            </summary>
            <div className="fields-grid">
              {subgroups.map((group) => (
                <Fragment key={group.title || 'all'}>
                  {group.title ? <div className="form-divider">{group.title}</div> : null}
                  {group.indexes.map((absoluteIndex) => {
                    const field = fields[absoluteIndex];
                    if (!field || field.display?.hidden) return null;
                    const label = field.d || field.k;
                    const spanClass = field.display?.span === 2 ? 'mini-field span-2' : 'mini-field';
                    const isManual = field.display?.availability !== 'printed';
                    return (
                      <div className={spanClass} key={`${field.k}-${absoluteIndex}`}>
                        <label title={field.k}>
                          <span>{label}</span>
                          {isManual ? <span className="pill">Captura manual</span> : null}
                          {notes[field.k] ? (
                            <span className={`pill tone-${notes[field.k].tone}`}>{notes[field.k].text}</span>
                          ) : null}
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={layout[absoluteIndex] || ''}
                          onChange={(event) => onChange(absoluteIndex, event.target.value)}
                        />
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function AttachmentsList({ items, onRemove, onDownload }) {
  if (!items.length) return <div className="empty-state">Todavía no hay archivos cargados.</div>;
  return (
    <div className="attachments-list">
      {items.map((item, index) => (
        <div className="attachment-row" key={`${item.cat}-${item.name}-${index}`}>
          <div>
            <strong>{item.name}</strong>
            <span>
              {item.cat.toUpperCase()} · {item.sizeMb} MB · {item.type}
            </span>
          </div>
          <div className="attachment-actions">
            {item.downloadUrl ? (
              <a className="ghost-button" href={item.downloadUrl} target="_blank" rel="noreferrer">
                Descargar
              </a>
            ) : null}
            {onDownload ? (
              <button type="button" className="ghost-button" onClick={() => onDownload(item, index)}>
                Ver
              </button>
            ) : null}
            {onRemove ? (
              <button type="button" className="ghost-button danger" onClick={() => onRemove(index)}>
                Quitar
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileUploadCard({ title, help, category, items, maxFiles, accept, multiple, onAddFiles, onRemoveFile }) {
  return (
    <div className="upload-card">
      <label className="dropzone">
        <strong>{title}</strong>
        <small>{help}</small>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(event) => onAddFiles(category, event.target.files, maxFiles)}
        />
      </label>
      {items.length ? (
        <div className="upload-files">
          {items.map((item, index) => (
            <div className="upload-file" key={`${item.cat}-${item.name}-${index}`}>
              <div className="upload-file-meta">
                <strong>{item.name}</strong>
                <span>
                  {item.cat.toUpperCase()} · {item.sizeMb} MB · {item.type || 'archivo'}
                </span>
              </div>
              <button type="button" className="ghost-button danger" onClick={() => onRemoveFile(item)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_API_KEY_STORAGE_KEY = 'clk-api-key';

function getStoredAnthropicKey() {
  try {
    const key = window.localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY);
    return key ? key.trim() : '';
  } catch {
    return '';
  }
}

function storeAnthropicKey(key) {
  try {
    if (key) {
      window.localStorage.setItem(ANTHROPIC_API_KEY_STORAGE_KEY, key.trim());
    } else {
      window.localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE_KEY);
    }
  } catch {
    // No-op.
  }
}

function promptAnthropicKey() {
  const key = window.prompt(
    'Pega tu clave de API de Anthropic (empieza con sk-ant-). Se guarda solo en este navegador.'
  );
  const normalized = normalizeText(key);
  if (normalized) {
    storeAnthropicKey(normalized);
    return normalized;
  }
  return '';
}

function ensureAnthropicKey() {
  const stored = getStoredAnthropicKey();
  if (stored) return stored;
  return promptAnthropicKey();
}

function buildAnthropicDocumentBlock(file, base64) {
  const isPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
  const isImage = file?.type?.startsWith('image/');
  if (isPdf) {
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: base64
      }
    };
  }

  if (isImage) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: file.type || 'image/png',
        data: base64
      }
    };
  }

  return {
    type: 'text',
    text: `Archivo adjunto: ${file?.name || 'documento'}. No se pudo identificar como PDF o imagen.`
  };
}

function extractJsonFromAnthropicText(text) {
  const cleaned = String(text ?? '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  return JSON.parse(cleaned);
}

function normalizeSummaryValues(summaryData) {
  if (!summaryData || typeof summaryData !== 'object' || Array.isArray(summaryData)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(summaryData)
      .map(([key, value]) => [key, normalizeText(value)])
      .filter(([, value]) => Boolean(value))
  );
}

function formatSummaryCurrency(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  const amount = Number(normalized.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amount)) return normalized;
  return `$${amount.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function buildAnthropicPrompt(fields, sections, ramoLabel, subramoLabel) {
  const layoutGuide = buildExtractionFieldGuide(fields)
    .map(({ key, section, label }) => `- ${key} | ${section} | ${label}`)
    .join('\n');

  return [
    'Analiza el documento adjunto de una póliza de seguros mexicana y extrae TODOS los datos que puedas completar en el formulario.',
    'Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones y sin texto adicional.',
    'Cuando un dato no aparezca con claridad, usa null.',
    'No inventes datos.',
    'Todos los campos del formulario son textos.',
    'Conserva números, montos, referencias y póliza exactamente como aparezcan en el documento.',
    'La estructura debe ser:',
    '{',
    '  "aseguradora": string | null,',
    '  "poliza": string | null,',
    '  "campos": { "<clave exacta>": string | null },',
    '  "resumenPrimas": {',
    '    "prima_neta": string | null,',
    '    "tasa_financiamiento": string | null,',
    '    "gastos_expedicion": string | null,',
    '    "descuentos": string | null,',
    '    "subtotal": string | null,',
    '    "iva": string | null,',
    '    "importe_total": string | null,',
    '    "recargos": string | null,',
    '    "derechos": string | null,',
    '    "ajuste": string | null,',
    '    "otros_cargos": string | null',
    '  },',
    '  "notas": Array<string>',
    '}',
    `Ramo seleccionado: ${ramoLabel || 'sin ramo'}`,
    `Subramo seleccionado: ${subramoLabel || 'sin subramo'}`,
    'Usa exactamente las claves técnicas indicadas como claves JSON; no inventes claves.',
    'Si el documento no muestra un campo, omítelo o usa null.',
    'Nunca renumeres, reordenes ni devuelvas un arreglo posicional.',
    'Campos extractables del formulario (clave técnica | sección | etiqueta):',
    layoutGuide || '- (sin campos)',
    'El nombre del asegurado debe colocarse en el campo "Nombre" de la sección "Asegurado".',
    'Resumen de primas: identifica y extrae todos los importes y conceptos visibles. Incluye al menos prima neta, tasa de financiamiento, gastos por expedición, descuentos, subtotal, I.V.A., importe total y cualquier otro recargo, derecho o ajuste que aparezca.',
    'Devuelve los datos listos para llenar la captura.'
  ].join('\n');
}

async function callAnthropic(file, { prompt, errorLabel = 'leer el documento' }) {
  const apiKey = ensureAnthropicKey();
  if (!apiKey) {
    throw new Error(`Se requiere la clave de API de Anthropic para ${errorLabel}.`);
  }

  const fileData = await fileToBase64(file);
  const content = [
    buildAnthropicDocumentBlock(file, fileData),
    { type: 'text', text: prompt }
  ];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      storeAnthropicKey('');
    }
    const errorMessage = payload?.error?.message || payload?.error?.type || `Error HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  const text = Array.isArray(payload?.content)
    ? payload.content
        .filter((block) => block && block.type === 'text')
        .map((block) => block.text || '')
        .join('\n')
    : '';

  if (!text.trim()) {
    throw new Error('Anthropic no devolvió texto de extracción.');
  }

  return extractJsonFromAnthropicText(text);
}

function Modal({
  open,
  title,
  message = '',
  tone = 'danger',
  closeLabel = 'Cerrar',
  onClose,
  titleId = 'app-modal-title',
  children = null,
  actions = undefined
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation">
      <section
        className={`modal-card tone-${tone}`}
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-head">
          <span className="eyebrow">{tone === 'danger' ? 'Error' : 'Aviso'}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </div>
        <h2 id={titleId}>{title}</h2>
        {message ? <p>{message}</p> : null}
        {children}
        {actions === undefined ? (
          <div className="modal-actions">
            <button type="button" className="primary-button" onClick={onClose}>
              {closeLabel}
            </button>
          </div>
        ) : (
          <div className="modal-actions">{actions}</div>
        )}
      </section>
    </div>
  );
}

/** How long the "request sent" notice stays up before the modal closes itself. */
const GROUP_REQUEST_NOTICE_MS = 1800;

export function useGroupModal({
  alta,
  setAlta,
  groupCatalog,
  setGroupCatalog,
  createGrupo,
  openErrorModal,
  pushToast,
  normalizeText,
  requestNoticeMs = GROUP_REQUEST_NOTICE_MS
}) {
  const [groupModal, setGroupModal] = useState({
    open: false,
    name: '',
    submitting: false,
    requestSent: false
  });
  // Tracks the vendor the in-flight request was submitted for, so a late
  // response cannot be misattributed after the user switches vendors.
  const latestVendedorRef = useRef(alta.vendedor);
  latestVendedorRef.current = alta.vendedor;
  // Invalidated whenever the modal session is reopened/closed, so a stale
  // response from a previous session can never touch the current one.
  const submissionIdRef = useRef(0);

  function openGroupModal() {
    submissionIdRef.current += 1;
    setGroupModal({ open: true, name: '', submitting: false, requestSent: false });
  }

  function closeGroupModal() {
    submissionIdRef.current += 1;
    setGroupModal({ open: false, name: '', submitting: false, requestSent: false });
  }

  // Auto-closes the modal once the request confirmation has been on screen long
  // enough to read. Owning the timer here (instead of inside the submit handler)
  // is what lets React cancel it when the modal is closed by hand or unmounted,
  // so a late callback can never reopen or reset a newer modal session.
  useEffect(() => {
    if (!groupModal.open || !groupModal.requestSent) return undefined;
    const timer = window.setTimeout(closeGroupModal, requestNoticeMs);
    return () => window.clearTimeout(timer);
  }, [groupModal.open, groupModal.requestSent, requestNoticeMs]);

  function selectGroupSuggestion(name) {
    setAlta((current) => ({ ...current, grupo: name }));
    closeGroupModal();
  }

  async function createGroupFromAlta() {
    // Belt and braces against a double fire: the button is already disabled
    // while busy, but a second submit must never reach createGrupo.
    if (groupModal.submitting || groupModal.requestSent) return;

    const grupo = normalizeText(groupModal.name);
    if (!grupo) {
      openErrorModal('Faltan datos', 'Escribe un nombre de grupo.');
      return;
    }
    if (findGroupNameMatches(groupModal.name, groupCatalog).length > 0) {
      return;
    }

    const submissionId = submissionIdRef.current;
    const vendorAtSubmit = alta.vendedor;
    setGroupModal((current) => ({ ...current, submitting: true }));
    try {
      const result = await createGrupo({
        nombre: grupo,
        linea: alta.linea,
        gerencia: alta.gerencia,
        vendedor: alta.vendedor
      });
      const createdName = normalizeText(result?.record?.nombre);
      const isStale =
        submissionIdRef.current !== submissionId || latestVendedorRef.current !== vendorAtSubmit;

      if (isStale) {
        // The group was created server-side for vendorAtSubmit, but the UI
        // has since moved to a different vendor/session — do not apply it
        // to the wrong catalog or the wrong asegurado's grupo field.
        pushToast(`Grupo ${createdName} creado, pero el vendedor cambió; revisa el catálogo.`);
        if (submissionIdRef.current === submissionId) {
          // Same modal session, just a different vendor: clear the stuck
          // submitting flag. If the session itself moved on (submissionId
          // changed), a newer submission owns groupModal now — leave it.
          setGroupModal((current) => ({ ...current, submitting: false }));
        }
        return;
      }

      setGroupCatalog((current) => [...current, createdName]);
      setAlta((current) => ({ ...current, grupo: createdName }));
      // The request is represented as an email to the operations team, but the
      // group is deliberately usable right away, so the alta is never blocked
      // waiting for it. The modal stays up only to confirm the request.
      setGroupModal((current) => ({ ...current, submitting: false, requestSent: true }));
      pushToast(`Grupo ${createdName} listo`);
    } catch (groupError) {
      if (submissionIdRef.current === submissionId) {
        setGroupModal((current) => ({ ...current, submitting: false }));
      }
      openErrorModal('Error al guardar grupo', groupError.message || 'No se pudo guardar el grupo.');
    }
  }

  return {
    groupModal,
    setGroupModal,
    openGroupModal,
    closeGroupModal,
    selectGroupSuggestion,
    createGroupFromAlta
  };
}

export function useAseguradoModal({
  setCapture,
  aseguradoNames,
  openAltaFromCapture,
  openErrorModal,
  normalizeText
}) {
  const [aseguradoModal, setAseguradoModal] = useState({ open: false, name: '' });

  function openAseguradoModal() {
    setAseguradoModal({ open: true, name: '' });
  }

  function closeAseguradoModal() {
    setAseguradoModal({ open: false, name: '' });
  }

  function selectAseguradoSuggestion(name) {
    setCapture((current) =>
      applyAssignmentSelection(current, 'asegurado', name, {}, POLIZA_LAYOUT_FIELDS.length)
    );
    closeAseguradoModal();
  }

  function registerAseguradoFromCapture() {
    const name = normalizeText(aseguradoModal.name);
    if (!name) {
      openErrorModal('Faltan datos', 'Escribe el nombre del asegurado.');
      return;
    }
    if (findGroupNameMatches(aseguradoModal.name, aseguradoNames).length > 0) {
      return;
    }
    openAltaFromCapture(name);
    closeAseguradoModal();
  }

  return {
    aseguradoModal,
    setAseguradoModal,
    openAseguradoModal,
    closeAseguradoModal,
    selectAseguradoSuggestion,
    registerAseguradoFromCapture
  };
}

function App() {
  const publishedVersion = `v${appPackage.version}`;
  const [executive, setExecutive] = useState(() => {
    try {
      const stored = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('captura');
  const [boot, setBoot] = useState(LOCAL_BOOT);
  const [loading, setLoading] = useState(() => Boolean(executive));
  const [errorModal, setErrorModal] = useState(null);
  const [toast, setToast] = useState('');
  const [capture, setCapture] = useState(emptyCapture());
  const [alta, setAlta] = useState(emptyAlta());
  const [altaDocumentFile, setAltaDocumentFile] = useState(null);
  const [altaConstanciaFile, setAltaConstanciaFile] = useState(null);
  // Storage only: the constancia is required when factura is, and nothing more
  // is asserted about it — no type selector, no AI verification.
  const hasAltaConstancia = Boolean(altaConstanciaFile);
  const altaNotes = useMemo(() => buildAltaFieldNotes(alta), [alta]);
  const altaComplete = useMemo(
    () => isAltaComplete(alta, { hasConstancia: hasAltaConstancia }),
    [alta, hasAltaConstancia]
  );
  const altaHint = useMemo(
    () => getAltaSaveHint(alta, { hasConstancia: hasAltaConstancia }),
    [alta, hasAltaConstancia]
  );
  const altaUsoCfdiOptions = useMemo(
    () => getUsosCfdiParaRegimen(alta.regimenClave).map(formatUsoCfdiOption),
    [alta.regimenClave]
  );
  const [altaReturnToCapture, setAltaReturnToCapture] = useState(false);
  const [readingDocumentLabel, setReadingDocumentLabel] = useState('');
  const [bootVersion, setBootVersion] = useState('React + MySQL · seed local');
  const [ramoCatalog, setRamoCatalog] = useState([]);
  const [subramoCatalog, setSubramoCatalog] = useState([]);
  const [vendedorCatalog, setVendedorCatalog] = useState([]);
  const [aseguradoCatalog, setAseguradoCatalog] = useState([]);
  const [groupCatalog, setGroupCatalog] = useState([]);
  const [ramosLoading, setRamosLoading] = useState(false);
  const [subramosLoading, setSubramosLoading] = useState(false);
  const [vendedoresLoading, setVendedoresLoading] = useState(false);
  const [aseguradosLoading, setAseguradosLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [readingDocument, setReadingDocument] = useState(false);

  const {
    groupModal,
    setGroupModal,
    openGroupModal,
    closeGroupModal,
    selectGroupSuggestion,
    createGroupFromAlta
  } = useGroupModal({
    alta,
    setAlta,
    groupCatalog,
    setGroupCatalog,
    createGrupo,
    openErrorModal,
    pushToast,
    normalizeText
  });

  function openErrorModal(title, message) {
    setErrorModal({ title, message });
  }

  function closeErrorModal() {
    setErrorModal(null);
  }

  function appendBootRecord(bucket, record) {
    if (!record) return;
    setBoot((current) => {
      const currentRecords = current.records || EMPTY_BOOT.records;
      const existing = Array.isArray(currentRecords[bucket]) ? currentRecords[bucket] : [];
      const next = existing.filter((item) => item && item.id !== record.id);
      return {
        ...current,
        records: {
          ...currentRecords,
          [bucket]: [record, ...next]
        }
      };
    });
  }

  const catalogs = boot.catalogs || EMPTY_BOOT.catalogs;
  const records = boot.records || EMPTY_BOOT.records;
  const lineOptions = catalogs.lineas || [];
  const gerenciaOptions = catalogs.gerencias?.[capture.linea] || [];
  const ramoOptions = ramoCatalog;
  const subramoOptions = subramoCatalog;
  const vendorOptions = vendedorCatalog;
  const normalizedRamoOptions = useMemo(
    () => (ramoOptions || []).map(getComboOption).filter((option) => option.label || option.value),
    [ramoOptions]
  );
  const normalizedSubramoOptions = useMemo(
    () => (subramoOptions || []).map(getComboOption).filter((option) => option.label || option.value),
    [subramoOptions]
  );
  const normalizedAseguradoOptions = useMemo(
    () => (aseguradoCatalog || []).map(getComboOption).filter((option) => option.label || option.value),
    [aseguradoCatalog]
  );
  const aseguradoNames = normalizedAseguradoOptions.map((option) => option.label).filter(Boolean);
  const {
    aseguradoModal,
    setAseguradoModal,
    openAseguradoModal,
    closeAseguradoModal,
    selectAseguradoSuggestion,
    registerAseguradoFromCapture
  } = useAseguradoModal({
    setCapture,
    aseguradoNames,
    openAltaFromCapture,
    openErrorModal,
    normalizeText
  });
  const selectedVendorId = String(capture.vendedorId || '').trim();
  const genericVendor = findVendorByClave(vendorOptions);
  const genericAssignmentToggleState = getGenericAssignmentToggleState({
    vendedoresLoading,
    genericVendor,
    assignmentMode: capture.assignmentMode
  });
  // Same availability rules on both tabs, so a catalogue without VG001 disables
  // the switch identically in Captura and in Alta de asegurados.
  const altaGenericToggleState = getGenericAssignmentToggleState({
    vendedoresLoading,
    genericVendor,
    assignmentMode: alta.assignmentMode
  });
  const selectedRamoOption =
    normalizedRamoOptions.find((option) => option.value === String(capture.ramo || '')) || null;
  const selectedSubramoOption =
    normalizedSubramoOptions.find((option) => option.value === String(capture.subramo || '')) || null;
  const selectedAseguradoOption =
    normalizedAseguradoOptions.find(
      (option) => option.value === String(capture.asegurado || '') || option.label === String(capture.asegurado || '')
    ) || null;
  const selectedRamoLabel = selectedRamoOption?.label || String(capture.ramo || '');
  const selectedSubramoLabel = selectedSubramoOption?.label || String(capture.subramo || '');
  const selectedAseguradoLabel = selectedAseguradoOption?.label || String(capture.asegurado || '');
  const extractedAseguradoName = normalizeText(capture.layout[POLIZA_ASEGURADO_INDEX]);
  const showSubramo = normalizeKey(selectedRamoLabel) === normalizeKey('Daños');
  const captureLocked = readingDocument;
  const captureFiles = capture.files || [];
  const polizaFiles = captureFiles.filter((file) => file.cat === 'poliza');
  const polizaAttachments = captureFiles.filter((file) => file.cat === 'poliza');
  const reciboAttachments = captureFiles.filter((file) => file.cat === 'recibo');
  const otrosAttachments = captureFiles.filter((file) => file.cat === 'otros');
  const showDocumentsBlock =
    Boolean(normalizeText(capture.vendedor)) &&
    Boolean(normalizeText(capture.asegurado)) &&
    Boolean(normalizeText(capture.ramo));
  const showExtractionBlocks = Boolean(capture.extracted);
  const showCaptureContextCombos = true;
  const groupMatches = useMemo(
    () => findGroupNameMatches(groupModal.name, groupCatalog),
    [groupModal.name, groupCatalog]
  );
  const canCreateGroup = Boolean(normalizeText(groupModal.name)) && groupMatches.length === 0;
  const aseguradoModalMatches = useMemo(
    () => findGroupNameMatches(aseguradoModal.name, aseguradoNames),
    [aseguradoModal.name, aseguradoNames]
  );
  const canRegisterAsegurado = Boolean(normalizeText(aseguradoModal.name)) && aseguradoModalMatches.length === 0;

  async function handleLogin(event) {
    event.preventDefault();
    const email = normalizeText(loginEmail);
    if (!email) {
      openErrorModal('Inicio de sesión', 'Escribe un correo electrónico para continuar.');
      return;
    }

    setLoginLoading(true);
    try {
      const payload = await buscarEjecutivos(email);
      if (!payload?.Respuesta) {
        openErrorModal('No se pudo iniciar sesión', payload?.MError || 'El correo no fue validado.');
        return;
      }

      const executiveList = Array.isArray(payload?.Ejecutivos) ? payload.Ejecutivos : [];
      const selectedExecutive = executiveList[0] || null;
      if (!selectedExecutive) {
        openErrorModal('No se pudo iniciar sesión', 'La API respondió sin ejecutivos disponibles.');
        return;
      }

      try {
        window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(selectedExecutive));
      } catch {
        // No-op: la sesión sigue en memoria aunque no haya storage persistente.
      }

      setExecutive(selectedExecutive);
      setLoading(true);
    } catch (error) {
      openErrorModal('No se pudo iniciar sesión', error.message || 'No se pudo validar el correo.');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    try {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // No-op.
    }
    setExecutive(null);
    setBoot(EMPTY_BOOT);
    setActiveTab('captura');
    setCapture(emptyCapture());
    setAlta(emptyAlta());
    setAltaDocumentFile(null);
    setAltaConstanciaFile(null);
    setVendedorCatalog([]);
    setAseguradoCatalog([]);
    setLoading(false);
  }

  useEffect(() => {
    if (!executive) return undefined;
    let mounted = true;
    setBoot(LOCAL_BOOT);
    setBootVersion('React + MySQL · seed local');
    setCapture(emptyCapture());
    setRamoCatalog([]);
    setSubramoCatalog([]);
    setVendedorCatalog([]);
    setAseguradoCatalog([]);
    setGroupCatalog([]);
    setRamosLoading(true);
    setSubramosLoading(false);
    setVendedoresLoading(true);
    setAseguradosLoading(false);
    setGroupsLoading(false);
    Promise.allSettled([loadRamos(), loadVendedores(executive)]).then(([ramosResult, vendorsResult]) => {
      if (!mounted) return;

      if (ramosResult.status === 'fulfilled' && ramosResult.value?.ramos) {
        setRamoCatalog(ramosResult.value.ramos);
      } else {
        setRamoCatalog([]);
        if (ramosResult.status === 'rejected') {
          openErrorModal('Error al cargar ramos', ramosResult.reason?.message || 'No se pudieron cargar los ramos');
        }
      }

      if (vendorsResult.status === 'fulfilled') {
        setVendedorCatalog(vendorsResult.value || []);
      } else {
        setVendedorCatalog([]);
        if (vendorsResult.status === 'rejected') {
          openErrorModal(
            'Error al cargar vendedores',
            vendorsResult.reason?.message || 'No se pudieron cargar los vendedores'
          );
        }
      }

      setLoading(false);
      setRamosLoading(false);
      setSubramosLoading(false);
      setVendedoresLoading(false);
      setGroupsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [executive]);

  useEffect(() => {
    if (capture.layout.length !== POLIZA_LAYOUT_FIELDS.length) {
      setCapture((current) => ({
        ...current,
        layout: Array(POLIZA_LAYOUT_FIELDS.length).fill('')
      }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const ramoLabel = selectedRamoLabel.trim();
    if (!ramoLabel || normalizeKey(ramoLabel) !== normalizeKey('Daños')) {
      setSubramoCatalog([]);
      setSubramosLoading(false);
      setCapture((current) =>
        current.subramo
          ? {
              ...current,
              subramo: '',
              confirmed: false
            }
          : current
      );
      return undefined;
    }

    const idRamo = String(capture.ramo || '').trim();
    if (!idRamo) {
      setSubramoCatalog([]);
      setSubramosLoading(false);
      return undefined;
    }

    setSubramosLoading(true);
    loadSubramos(idRamo)
      .then((payload) => {
        if (!mounted) return;
        if (payload?.subramos) {
          setSubramoCatalog(payload.subramos);
        } else {
          setSubramoCatalog([]);
        }
      })
      .catch((subramoError) => {
        if (!mounted) return;
        setSubramoCatalog([]);
        openErrorModal('Error al cargar subramos', subramoError.message || 'No se pudieron cargar los subramos');
      })
      .finally(() => {
        if (!mounted) return;
        setSubramosLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [capture.ramo, selectedRamoLabel]);

  useEffect(() => {
    if (capture.assignmentMode === 'generic') {
      setAseguradosLoading(false);
      return undefined;
    }

    if (!selectedVendorId) {
      setAseguradoCatalog([]);
      setAseguradosLoading(false);
      setGroupCatalog([]);
      setGroupsLoading(false);
      setCapture((current) =>
        current.asegurado
          ? {
              ...current,
              asegurado: '',
              confirmed: false
            }
          : current
      );
      return undefined;
    }

    let mounted = true;
    setAseguradosLoading(true);
    loadAsegurados(selectedVendorId)
      .then((items) => {
        if (!mounted) return;
        setAseguradoCatalog(Array.isArray(items) ? items : []);
      })
      .catch((aseguradoError) => {
        if (!mounted) return;
        setAseguradoCatalog([]);
        openErrorModal('Error al cargar asegurados', aseguradoError.message || 'No se pudieron cargar los asegurados');
      })
      .finally(() => {
        if (!mounted) return;
        setAseguradosLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedVendorId, capture.assignmentMode]);

  useEffect(() => {
    const vendorId = String(alta.vendedor ? (vendedorCatalog.find((vendor) => {
      const option = getComboOption(vendor);
      return option.label === alta.vendedor || option.value === alta.vendedor;
    })?.IdVendedor || '') : '').trim();
    const executiveGroup = normalizeText(executive?.Grupo || '');

    if (!vendorId) {
      setGroupCatalog([]);
      setGroupsLoading(false);
      setAlta((current) =>
        current.grupo
          ? {
              ...current,
              grupo: ''
            }
          : current
      );
      return undefined;
    }

    setAlta((current) =>
      current.grupo
        ? {
            ...current,
            grupo: ''
          }
        : current
    );
    setGroupCatalog([]);
    setGroupsLoading(false);

    if (executiveGroup) {
      setGroupCatalog([executiveGroup]);
      setAlta((current) => ({
        ...current,
        grupo: executiveGroup
      }));
      return undefined;
    }

    let mounted = true;
    setGroupsLoading(true);
    loadGrupos(vendorId)
      .then((items) => {
        if (!mounted) return;
        const nextCatalog = Array.isArray(items) ? items.filter(Boolean) : [];
        setGroupCatalog(nextCatalog);
      })
      .catch((groupError) => {
        if (!mounted) return;
        setGroupCatalog([]);
        openErrorModal('Error al cargar grupos', groupError.message || 'No se pudieron cargar los grupos');
      })
      .finally(() => {
        if (!mounted) return;
        setGroupsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [alta.vendedor, vendedorCatalog, executive?.Grupo]);

  const summary = useMemo(() => {
    const summaryData = capture.ramoData || {};
    const subtotalSource = normalizeText(summaryData.subtotal || summaryData.Subtotal);
    const totalSource = normalizeText(summaryData.importe_total || summaryData.prima_total || summaryData.total);
    const subtotal = subtotalSource ? Number(subtotalSource.replace(/[$,\s]/g, '')) : null;
    const total = totalSource ? Number(totalSource.replace(/[$,\s]/g, '')) : null;
    return {
      subtotal: Number.isFinite(subtotal) && subtotal !== 0 ? subtotal : null,
      total: Number.isFinite(total) && total !== 0 ? total : null,
      primaNeta: normalizeText(summaryData.prima_neta || summaryData.primaNeta),
      tasaFinanciamiento: normalizeText(summaryData.tasa_financiamiento || summaryData.tasaFinanciamiento),
      gastosExpedicion: normalizeText(summaryData.gastos_expedicion || summaryData.gastosExpedicion),
      descuentos: normalizeText(summaryData.descuentos || summaryData.descuento),
      iva: normalizeText(summaryData.iva || summaryData.iVA || summaryData.iva_total),
      recargos: normalizeText(summaryData.recargos || summaryData.recargo),
      derechos: normalizeText(summaryData.derechos),
      ajuste: normalizeText(summaryData.ajuste),
      otrosCargos: normalizeText(summaryData.otros_cargos || summaryData.otrosCargos)
    };
  }, [capture.layout, capture.ramoData]);

  const fieldNotes = useMemo(
    () => buildFieldNotes(capture.layout, capture.derivedFields),
    [capture.layout, capture.derivedFields]
  );

  const matchResult = useMemo(() => {
    if (capture.documentsInvalidated) {
      return {
        tone: 'warning',
        message:
          'Se eliminaron los documentos porque cambió la asignación. Carga una póliza que corresponda a la nueva asignación.'
      };
    }
    if (!capture.extracted) return { tone: 'neutral', message: 'Aún no se ejecuta lectura asistida.' };
    const candidate = extractedAseguradoName;
    if (!candidate || !capture.asegurado) {
      return { tone: 'neutral', message: 'Captura el nombre del asegurado en la póliza y selecciona un asegurado para validar coincidencia.' };
    }
    const a = normalizeTokens(selectedAseguradoLabel);
    const b = normalizeTokens(candidate);
    let intersection = 0;
    a.forEach((token) => {
      if (b.has(token)) intersection += 1;
    });
    const ratio = intersection / Math.min(a.size || 1, b.size || 1);
    if (ratio >= 0.8) {
      return { tone: 'success', message: `✓ El asegurado coincide con la póliza («${candidate}»).` };
    }
    if (ratio >= 0.5) {
      return {
        tone: 'warning',
        message: `Coincidencia parcial: en la póliza aparece «${candidate}» y seleccionaste «${selectedAseguradoLabel}».`
      };
    }
    return {
      tone: 'danger',
      message: `No cuadra: en la póliza aparece «${candidate}» y en Asegurado seleccionaste «${selectedAseguradoLabel}».`
    };
  }, [capture, extractedAseguradoName, selectedAseguradoLabel]);

  function pushToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function resetCapture() {
    setCapture(emptyCapture());
  }

  function updateCapture(field, value) {
    setCapture((current) => applyCaptureFieldUpdate(current, field, value));
  }

  function handleToggleAssignmentMode() {
    if (capture.assignmentMode === 'generic') {
      setCapture((current) => returnToManualAssignment(current));
    } else {
      setCapture((current) => activateGenericAssignment(current, vendorOptions));
    }
  }

  function handleToggleAltaAssignmentMode() {
    // The group catalogue belongs to the previous vendor, so it is dropped the
    // same way a manual vendor pick drops it.
    setGroupCatalog([]);
    setGroupsLoading(false);
    setAlta((current) => toggleAltaGenericVendor(current, vendorOptions));
  }

  function updateLayout(index, value) {
    setCapture((current) => {
      const next = [...current.layout];
      next[index] = value;
      return { ...current, layout: next, confirmed: false };
    });
  }

  function updateRamoData(key, value) {
    setCapture((current) => ({
      ...current,
      ramoData: {
        ...(current.ramoData || {}),
        [key]: value
      },
      confirmed: false
    }));
  }

  function addFiles(category, fileList, maxCount) {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    setCapture((current) => {
      const existing = current.files.filter((file) => file.cat !== category);
      const bucket = current.files.filter((file) => file.cat === category);
      const incoming = selected.slice(0, maxCount).map((file) => ({
        file,
        name: file.name,
        type: file.type,
        sizeMb: (file.size / 1048576).toFixed(1),
        cat: category
      }));
      const next = category === 'poliza' ? existing : [...existing, ...bucket];
      const final = category === 'poliza' ? [...next, incoming[0]] : [...next, ...incoming.slice(0, Math.max(0, maxCount - bucket.length))];
      return { ...current, files: final, confirmed: false };
    });
  }

  function removeFileByRef(targetFile) {
    setCapture((current) => ({
      ...current,
      files: current.files.filter((file) => file !== targetFile),
      confirmed: false
    }));
  }

  function setCaptureStateFromGroup(name) {
    const parts = splitName(name);
    if (parts.length >= 3) {
      setAlta((current) => ({
        ...current,
        razon: '',
        apP: parts[0],
        apM: parts[1],
        nombres: parts.slice(2).join(' ')
      }));
    } else {
      setAlta((current) => ({
        ...current,
        razon: name,
        apP: '',
        apM: '',
        nombres: ''
      }));
    }
  }

  function openAltaFromCapture(name) {
    const captureContext = {
      linea: capture.linea,
      gerencia: capture.gerencia,
      vendedor: capture.vendedor
    };
    setAlta((current) => ({
      ...emptyAlta(),
      ...current,
      ...captureContext
    }));
    setAltaReturnToCapture(true);
    setCaptureStateFromGroup(name);
    setActiveTab('asegurados');
    pushToast('Completa el alta y volverás a la captura');
  }

  async function readCaptureDocument() {
    const doc = polizaFiles[0];
    if (!doc) {
      openErrorModal('Falta un archivo', 'Carga una póliza antes de pedir lectura asistida.');
      return;
    }

    const file = doc.file;
    setReadingDocumentLabel('Leyendo póliza');
    setReadingDocument(true);
    pushToast('Leyendo póliza con Anthropic...');
    try {
      const result = await callAnthropic(file, {
        prompt: buildAnthropicPrompt(POLIZA_LAYOUT_FIELDS, POLIZA_LAYOUT_SECTIONS, capture.ramo, capture.subramo),
        errorLabel: 'leer la póliza'
      });
      const campos = result?.campos;
      if (
        !campos ||
        typeof campos !== 'object' ||
        Array.isArray(campos) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(campos))
      ) {
        throw new Error('La lectura no devolvió el formato esperado. Intenta nuevamente.');
      }
      const nextLayout = applyCompanyFallback(mapExtractedFieldsToLayout(campos), result?.aseguradora);
      const { layout: derivedLayout, derived } = applyDerivedAddressFields(nextLayout);
      const resumenPrimas = normalizeSummaryValues(result?.resumenPrimas);

      setCapture((current) => ({
        ...current,
        aseguradora: normalizeText(result?.aseguradora) || current.aseguradora,
        poliza: normalizeText(result?.poliza) || current.poliza,
        layout: derivedLayout,
        derivedFields: derived,
        ramoData: {
          ...(current.ramoData || {}),
          ...resumenPrimas
        },
        extracted: true,
        confirmed: false
      }));

      try {
        await createLog({
          evento: 'Lectura de póliza',
          detalle: `${file.name} · ${capture.ramo || 'sin ramo'}`
        });
        appendBootRecord('log', {
          id: `L${Date.now()}`,
          ts: Date.now(),
          evento: 'Lectura de póliza',
          detalle: `${file.name} · ${capture.ramo || 'sin ramo'}`
        });
      } catch {
        // La lectura ya quedó; la bitácora es opcional.
      }

      pushToast('Lectura completada');
    } catch (readError) {
      openErrorModal('Error de lectura', readError.message || 'No se pudo completar la lectura del archivo.');
      return;
    } finally {
      setReadingDocument(false);
    }
  }

  async function readAltaDocument() {
    if (!altaDocumentFile) {
      openErrorModal('Falta un archivo', 'Carga un documento del asegurado antes de pedir lectura asistida.');
      return;
    }

    const file = altaDocumentFile.file;
    setReadingDocumentLabel('Leyendo documento del asegurado');
    setReadingDocument(true);
    pushToast('Leyendo documento del asegurado con Anthropic...');
    try {
      const result = await callAnthropic(file, {
        prompt: buildAltaAnthropicPrompt(alta.tipo),
        errorLabel: 'leer el documento del asegurado'
      });
      setAlta((current) => mapAltaExtraction(current, result));
      pushToast('Lectura completada');
    } catch (readError) {
      openErrorModal('Error de lectura', readError.message || 'No se pudo completar la lectura del archivo.');
    } finally {
      setReadingDocument(false);
    }
  }

  async function savePoliza() {
    if (!capture.vendedor || !capture.asegurado || !capture.ramo) {
      openErrorModal('Faltan datos', 'Completa vendedor, asegurado y ramo.');
      return;
    }
    if (!polizaFiles.length) {
      openErrorModal('Falta archivo', 'Carga al menos la póliza principal.');
      return;
    }
    if (!capture.confirmed) {
      openErrorModal('Confirma la captura', 'Lee toda la información y marca la confirmación antes de guardar.');
      return;
    }

    const files = await Promise.all(
      captureFiles.map(async (item) => ({
        name: item.name,
        type: item.type,
        cat: item.cat,
        data: await fileToBase64(item.file)
      }))
    );

    try {
      const payload = await createPoliza({
        linea: capture.linea,
        gerencia: capture.gerencia,
        vendedor: capture.vendedor,
        asegurado: capture.asegurado,
        ramo: capture.ramo,
        subramo: capture.subramo,
        aseguradora: capture.aseguradora,
        poliza: capture.poliza,
        extracted: capture.extracted,
        layout: capture.layout,
        datosRamo: capture.ramoData,
        files,
        noGuardados: []
      });
      appendBootRecord('polizas', payload?.record);
      appendBootRecord('log', {
        id: `L${Date.now()}`,
        ts: Date.now(),
        evento: 'Póliza registrada',
        detalle: [capture.aseguradora, capture.poliza, capture.asegurado, capture.linea, capture.gerencia, capture.vendedor, capture.ramo]
          .filter(Boolean)
          .join(' · ')
      });
    } catch (saveError) {
      openErrorModal('Error al guardar póliza', saveError.message || 'No se pudo guardar la póliza.');
      return;
    }

    pushToast('Póliza guardada en SQL');
    resetCapture();
  }

  async function saveAlta() {
    const nombre =
      alta.tipo === 'moral'
        ? normalizeText(alta.razon)
        : [normalizeText(alta.apP), normalizeText(alta.apM), normalizeText(alta.nombres)]
            .filter(Boolean)
            .join(' ');

    if (!nombre) {
      openErrorModal('Faltan datos', 'Completa el nombre del asegurado.');
      return;
    }
    if (!alta.vendedor) {
      openErrorModal('Faltan datos', 'Completa el vendedor.');
      return;
    }

    if (!isAltaComplete(alta, { hasConstancia: hasAltaConstancia })) {
      openErrorModal('Faltan datos', 'Completa todos los campos requeridos.');
      return;
    }

    const payload = {
      nombre,
      tipo: alta.tipo,
      apP: alta.apP,
      apM: alta.apM,
      nombres: alta.nombres,
      razon: alta.razon,
      rfc: alta.rfc,
      curp: alta.curp,
      email: alta.email,
      tel: alta.tel,
      calle: alta.calle,
      numero: alta.numero,
      cp: alta.cp,
      colonia: alta.colonia,
      municipio: alta.municipio,
      estado: alta.estado,
      giro: alta.giro,
      regimen: alta.regimen,
      regimenClave: alta.regimenClave,
      usoCfdi: alta.usoCfdi,
      requiereFactura: alta.requiereFactura,
      linea: alta.linea,
      gerencia: alta.gerencia,
      vendedor: alta.vendedor,
      grupo: alta.grupo
    };

    try {
      const result = await createAsegurado(payload);
      appendBootRecord('asegurados', result?.record);
      appendBootRecord('log', {
        id: `L${Date.now()}`,
        ts: Date.now(),
        evento: 'Asegurado dado de alta',
        detalle: `${nombre} → ${alta.vendedor} (${alta.gerencia}, ${alta.linea})`
      });
    } catch (saveError) {
      openErrorModal('Error al guardar asegurado', saveError.message || 'No se pudo guardar el asegurado.');
      return;
    }
    pushToast('Asegurado dado de alta');
    if (altaReturnToCapture) {
      setCapture((current) => ({
        ...current,
        asegurado: nombre
      }));
      setActiveTab('captura');
      setAltaReturnToCapture(false);
    }

    setAlta(emptyAlta());
    setAltaDocumentFile(null);
    setAltaConstanciaFile(null);
  }

  const captureMatchClass = `status-chip ${matchResult.tone}`;
  const groupModalNode = (
    <Modal
      open={groupModal.open}
      title="Registrar grupo"
      tone="neutral"
      titleId="group-modal-title"
      onClose={closeGroupModal}
      actions={
        <>
          <button type="button" className="ghost-button" onClick={closeGroupModal} disabled={groupModal.submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            form="group-modal-form"
            className="primary-button"
            disabled={!canCreateGroup || groupModal.submitting || groupModal.requestSent}
          >
            {groupModal.submitting ? 'Enviando solicitud...' : 'Solicitar alta de grupo'}
          </button>
        </>
      }
    >
      <form
        id="group-modal-form"
        className="group-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          createGroupFromAlta();
        }}
      >
        <label htmlFor="group-modal-name">Nombre del grupo</label>
        <input
          id="group-modal-name"
          type="text"
          value={groupModal.name}
          required
          disabled={groupModal.submitting || groupModal.requestSent}
          onChange={(event) => setGroupModal((current) => ({ ...current, name: event.target.value }))}
        />
        {groupModal.requestSent ? (
          <p className="modal-notice" role="status">
            Enviamos la solicitud de alta del grupo por correo. Mientras tanto, el grupo ya quedó
            seleccionado para que continúes con el alta.
          </p>
        ) : null}
        {groupMatches.length ? (
          <div className="group-suggestion-list">
            <strong>Tal vez buscas este grupo</strong>
            {groupMatches.map(({ name }) => (
              <button
                key={name}
                type="button"
                className="group-suggestion-row"
                onClick={() => selectGroupSuggestion(name)}
              >
                <span>{name}</span>
                <span>Usar este grupo</span>
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </Modal>
  );
  const aseguradoModalNode = (
    <Modal
      open={aseguradoModal.open}
      title="Registrar asegurado"
      tone="neutral"
      titleId="asegurado-modal-title"
      onClose={closeAseguradoModal}
      actions={
        <>
          <button type="button" className="ghost-button" onClick={closeAseguradoModal}>
            Cancelar
          </button>
          <button
            type="submit"
            form="asegurado-modal-form"
            className="primary-button"
            disabled={!canRegisterAsegurado}
          >
            Registrar asegurado
          </button>
        </>
      }
    >
      <form
        id="asegurado-modal-form"
        className="group-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          registerAseguradoFromCapture();
        }}
      >
        <label htmlFor="asegurado-modal-name">Nombre del asegurado</label>
        <input
          id="asegurado-modal-name"
          type="text"
          value={aseguradoModal.name}
          required
          onChange={(event) => setAseguradoModal((current) => ({ ...current, name: event.target.value }))}
        />
        {aseguradoModalMatches.length ? (
          <div className="group-suggestion-list">
            <strong>Tal vez buscas a este asegurado</strong>
            {aseguradoModalMatches.map(({ name }) => (
              <button
                key={name}
                type="button"
                className="group-suggestion-row"
                onClick={() => selectAseguradoSuggestion(name)}
              >
                <span>{name}</span>
                <span>Usar este asegurado</span>
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </Modal>
  );
  const errorModalNode = errorModal ? (
    <Modal
      open={Boolean(errorModal)}
      title={errorModal.title}
      message={errorModal.message}
      tone="danger"
      onClose={closeErrorModal}
    />
  ) : null;
  const captureLockNode = captureLocked ? (
    <div className="screen-lock" role="status" aria-live="polite" aria-label="Bloqueo de captura en progreso">
      <div className="screen-lock__card">
        <div className="screen-lock__spinner" aria-hidden="true" />
        <div>
          <strong>{readingDocumentLabel || 'Leyendo documento'}</strong>
          <p>La pantalla quedó bloqueada mientras se extraen los datos. No cambies nada hasta que termine.</p>
        </div>
      </div>
    </div>
  ) : null;

  if (!executive) {
    return (
      <>
        {groupModalNode}
        {aseguradoModalNode}
        {errorModalNode}
        <div className="login-screen">
          <div className="login-card">
            <span className="eyebrow">Click Seguros</span>
            <h1>Iniciar sesión</h1>
            <p>Ingresa tu correo electrónico para validar acceso a la captura de pólizas.</p>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="login-field">
                <label htmlFor="login-email">Correo electrónico</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@clkseguros.com"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  disabled={loginLoading}
                />
              </div>
              <div className="login-actions">
                <button type="submit" className="primary-button" disabled={loginLoading}>
                  {loginLoading ? 'Validando...' : 'Entrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        {groupModalNode}
        {aseguradoModalNode}
        {errorModalNode}
        <div className="app-shell loading">
          <div className="hero-card">
            <span className="eyebrow">Click Seguros</span>
            <h1>Captura de Pólizas</h1>
            <p>Cargando React + MySQL...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {groupModalNode}
      {aseguradoModalNode}
      {errorModalNode}
      <div className={`app-shell ${captureLocked ? 'blocked' : ''}`}>
      <header className="topbar">
        <div className="topbar-main">
          <div className="title-row">
            <h1>Captura de Pólizas</h1>
            <span className="version-chip">{publishedVersion}</span>
          </div>
            <button type="button" className="context-switch" aria-label="Cerrar sesión" onClick={handleLogout}>
              <span>
                {executive?.Ejecutivo ? `Sesión: ${executive.Ejecutivo}` : 'Sesión activa'}
              </span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 10l5 5 5-5" />
              </svg>
            </button>
          </div>
        </header>

      <main className="app-main" aria-busy={captureLocked ? 'true' : 'false'} inert={captureLocked ? '' : undefined}>
        <nav className="tabs">
        {TAB_IDS.map((tabId) => (
          <button
            key={tabId}
            type="button"
            className={activeTab === tabId ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tabId)}
          >
            <TabIcon tabId={tabId} />
            <span>{TAB_LABELS[tabId]}</span>
          </button>
        ))}
        </nav>

        {toast ? <div className="toast show">{toast}</div> : null}

        {activeTab === 'captura' ? (
          <div className="page-grid">
          <Card
            badge="1"
            title="Asignación de captura"
            subtitle="Selecciona vendedor, asegurado y ramo para continuar"
            headAlign="left"
          >
            <div className="combo-grid">
              {showCaptureContextCombos ? (
                <ComboField
                  label="Línea de negocio"
                  value={capture.linea}
                  options={lineOptions}
                  placeholder="Selecciona la línea"
                  hint={`${lineOptions.length} opciones`}
                  onSelect={(value) =>
                    setCapture((current) =>
                      selectCaptureLine(current, value, POLIZA_LAYOUT_FIELDS.length)
                    )
                  }
                />
              ) : null}
              {showCaptureContextCombos ? (
                <ComboField
                  label="Gerencia"
                  value={capture.gerencia}
                  options={gerenciaOptions}
                  placeholder="Selecciona la gerencia"
                  hint={`${gerenciaOptions.length} opciones`}
                  disabled={!capture.linea}
                  onSelect={(value) =>
                    setCapture((current) =>
                      selectCaptureGerencia(current, value, POLIZA_LAYOUT_FIELDS.length)
                    )
                  }
                />
              ) : null}
              <div className="combo-cell">
                {capture.assignmentMode !== 'generic' ? (
                  <ComboField
                    label="Vendedor"
                    value={capture.vendedor}
                    options={vendorOptions}
                    placeholder={vendedoresLoading ? 'Cargando vendedores...' : 'Selecciona el vendedor'}
                    hint={vendedoresLoading ? 'Cargando vendedores...' : vendorOptions.length ? `${vendorOptions.length} opciones` : 'Sin vendedores'}
                    disabled={vendedoresLoading || !vendorOptions.length}
                    onSelect={(value) => {
                      const selectedVendor = vendorOptions.find(
                        (option) => normalizeText(option.Valor ?? option.Texto ?? '') === normalizeText(value)
                      );

                      setCapture((current) =>
                        applyAssignmentSelection(
                          current,
                          'vendedor',
                          value,
                          {
                            vendedorId: selectedVendor?.IdVendedor ? String(selectedVendor.IdVendedor) : '',
                            asegurado: ''
                          },
                          POLIZA_LAYOUT_FIELDS.length
                        )
                      );
                    }}
                  />
                ) : (
                  <div className="combo-field">
                    <label>Vendedor</label>
                    <div className="generic-field-tag">
                      <span className="pill accent">Vendedor genérico</span>
                      {capture.vendedor ? <span className="generic-field-value">{capture.vendedor}</span> : null}
                    </div>
                  </div>
                )}
                <div className="inline-toggle">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={genericAssignmentToggleState.checked}
                    aria-disabled={genericAssignmentToggleState.disabled}
                    disabled={genericAssignmentToggleState.disabled}
                    title={genericAssignmentToggleState.statusLabel || undefined}
                    className={`toggle-switch${genericAssignmentToggleState.checked ? ' is-on' : ''}`}
                    onClick={handleToggleAssignmentMode}
                  >
                    <span className="toggle-switch-thumb" aria-hidden="true" />
                  </button>
                  <span className="inline-toggle-label">Vendedor genérico</span>
                  {genericAssignmentToggleState.statusLabel ? (
                    <span className="inline-toggle-status">{genericAssignmentToggleState.statusLabel}</span>
                  ) : null}
                </div>
              </div>
              {capture.assignmentMode !== 'generic' ? (
                <div className="combo-cell">
                  <ComboField
                    label="Asegurado"
                    value={capture.asegurado}
                    options={aseguradoCatalog}
                    placeholder={
                      aseguradosLoading
                        ? 'Cargando asegurados...'
                        : selectedVendorId
                          ? 'Selecciona el asegurado'
                          : 'Selecciona un vendedor primero'
                    }
                    hint={
                      aseguradosLoading
                        ? 'Cargando asegurados...'
                        : selectedVendorId
                          ? aseguradoCatalog.length
                            ? `${aseguradoCatalog.length} opciones`
                            : 'Sin asegurados'
                          : 'Depende del vendedor'
                    }
                    disabled={aseguradosLoading || !selectedVendorId || !aseguradoCatalog.length}
                    onSelect={(value) =>
                      setCapture((current) =>
                        applyAssignmentSelection(current, 'asegurado', value, {}, POLIZA_LAYOUT_FIELDS.length)
                      )
                    }
                  />
                  <button
                    type="button"
                    className="inline-action"
                    onClick={openAseguradoModal}
                    disabled={!selectedVendorId || aseguradosLoading}
                  >
                    Registrar asegurado
                  </button>
                  {!selectedVendorId ? (
                    <small className="inline-action-hint">Selecciona un vendedor para poder registrarlo</small>
                  ) : null}
                </div>
              ) : (
                <div className="combo-field">
                  <label>Asegurado</label>
                  <div className="generic-field-tag">
                    <span className="pill accent">Asegurado genérico</span>
                    {capture.asegurado ? <span className="generic-field-value">{capture.asegurado}</span> : null}
                  </div>
                </div>
              )}
              <ComboField
                label="Ramo"
                value={capture.ramo}
                options={ramoOptions}
                placeholder={ramosLoading ? 'Cargando ramos...' : 'Selecciona el ramo'}
                hint={ramosLoading ? 'Cargando ramos...' : `${ramoOptions.length} opciones`}
                disabled={ramosLoading || !ramoOptions.length}
                onSelect={(value) =>
                  setCapture((current) =>
                    applyAssignmentSelection(
                      current,
                      'ramo',
                      value,
                      {
                        subramo: '',
                        ramoData: {}
                      },
                      POLIZA_LAYOUT_FIELDS.length
                    )
                  )
                }
              />
              {showSubramo ? (
                <ComboField
                  label="Subramo"
                  value={capture.subramo}
                  options={subramoOptions}
                  placeholder={subramosLoading ? 'Cargando subramos...' : 'Selecciona el subramo'}
                  hint={subramosLoading ? 'Cargando subramos...' : `${subramoOptions.length} opciones`}
                  disabled={subramosLoading || !subramoOptions.length}
                  onSelect={(value) =>
                    setCapture((current) =>
                      applyAssignmentSelection(current, 'subramo', value, {}, POLIZA_LAYOUT_FIELDS.length)
                    )
                  }
                />
              ) : null}
            </div>

          </Card>

          {showDocumentsBlock ? (
            <Card
              badge="2"
              title="Documentos de respaldo"
              subtitle="Carga la póliza principal, el recibo y otros archivos"
              headAlign="left"
            >
              <div className="file-grid">
                <FileUploadCard
                  title="Subir póliza"
                  help="PDF, JPG o PNG · 1 archivo"
                  category="poliza"
                  items={polizaAttachments}
                  maxFiles={1}
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  multiple={false}
                  onAddFiles={(category, fileList, maxCount) => {
                    if (category === 'poliza' && Array.from(fileList || []).length > 0) {
                      setCapture((current) => ({ ...current, documentsInvalidated: false }));
                    }
                    addFiles(category, fileList, maxCount);
                  }}
                  onRemoveFile={removeFileByRef}
                />
                <FileUploadCard
                  title="Subir recibo"
                  help="PDF, JPG o PNG · 1 archivo"
                  category="recibo"
                  items={reciboAttachments}
                  maxFiles={1}
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  multiple={false}
                  onAddFiles={addFiles}
                  onRemoveFile={removeFileByRef}
                />
                <FileUploadCard
                  title="Subir otros"
                  help="PDF, JPG o PNG · hasta 3 archivos"
                  category="otros"
                  items={otrosAttachments}
                  maxFiles={3}
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  multiple
                  onAddFiles={addFiles}
                  onRemoveFile={removeFileByRef}
                />
              </div>
              <div className="read-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={readCaptureDocument}
                  disabled={!polizaFiles.length || readingDocument}
                >
                  {readingDocument ? 'Leyendo...' : 'Leer póliza'}
                </button>
                <div className="capture-highlight">
                  <div className={captureMatchClass}>{matchResult.message}</div>
                </div>
              </div>
            </Card>
          ) : null}

          {showExtractionBlocks ? (
            <>
              <Card title="Resumen de datos" subtitle="Validación rápida contra el documento">
                {buildDataSummaryGroups(capture.layout).map((group) => (
                  <div key={group.title}>
                    <div className="form-divider">{group.title}</div>
                    <div className="summary-grid">
                      {group.rows.map(({ label, value }) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>

              <Card title="Resumen de prima" subtitle="Revisa importes antes de guardar">
                <div className="premium-summary">
                  <div className="premium-row">
                    <span>Prima neta</span>
                    <input
                      type="text"
                      value={formatSummaryCurrency(summary.primaNeta || capture.ramoData?.prima_neta || '')}
                      readOnly
                    />
                  </div>
                  <div className="premium-row">
                    <span>Tasa financiamiento</span>
                    <input
                      type="text"
                      value={formatSummaryCurrency(
                        summary.tasaFinanciamiento || capture.ramoData?.tasa_financiamiento || ''
                      )}
                      readOnly
                    />
                  </div>
                  <div className="premium-row">
                    <span>Gastos por expedición</span>
                    <input
                      type="text"
                      value={formatSummaryCurrency(
                        summary.gastosExpedicion || capture.ramoData?.gastos_expedicion || ''
                      )}
                      readOnly
                    />
                  </div>
                  <div className="premium-row">
                    <span>Descuentos</span>
                    <input
                      type="text"
                      value={formatSummaryCurrency(summary.descuentos || capture.ramoData?.descuentos || '')}
                      readOnly
                    />
                  </div>
                  <div className="premium-row premium-subtotal">
                    <span>Subtotal</span>
                    <strong>{formatSummaryCurrency(summary.subtotal)}</strong>
                  </div>
                  <div className="premium-row">
                    <span>I.V.A.</span>
                    <input type="text" value={formatSummaryCurrency(summary.iva || capture.ramoData?.iva || '')} readOnly />
                  </div>
                  <div className="premium-total">
                    <span>Importe total</span>
                    <strong>{formatSummaryCurrency(summary.total)}</strong>
                  </div>
                </div>
                <div className="warning-box">Revisa que prima neta, gastos, descuento, IVA, subtotal y total cuadren antes de guardar.</div>
              </Card>

              <Card title="Formulario de póliza" subtitle="Datos extraídos para validar la captura" headAlign="left">
                <SectionFields
                  sections={POLIZA_LAYOUT_DISPLAY_SECTIONS}
                  fields={POLIZA_LAYOUT_FIELDS}
                  layout={capture.layout}
                  onChange={updateLayout}
                  notes={fieldNotes}
                />
                <label className="final-confirmation">
                  <input
                    type="checkbox"
                    checked={Boolean(capture.confirmed)}
                    onChange={(event) => updateCapture('confirmed', event.target.checked)}
                  />
                  <span>Confirmo que leí toda la información y estoy de acuerdo en guardar.</span>
                </label>
                <div className="actions-row">
                  <button type="button" className="secondary-button" onClick={savePoliza} disabled={!capture.confirmed}>
                    Guardar póliza
                  </button>
                  <button type="button" className="ghost-button" onClick={resetCapture}>
                    Limpiar
                  </button>
                </div>
              </Card>
            </>
          ) : null}
          </div>
        ) : null}

        {activeTab === 'asegurados' ? (
          <div className="page-grid asegurados-page">
          <Card title="Alta de asegurados" subtitle="Catálogo SQL de asegurados y grupos">
            <div className="combo-grid">
              <ComboField
                label="Línea"
                value={alta.linea}
                options={lineOptions}
                placeholder="Selecciona la línea"
                onSelect={(value) =>
                  setAlta((current) => applyAltaContextChange(current, { linea: value, gerencia: '' }))
                }
              />
              <ComboField
                label="Gerencia"
                value={alta.gerencia}
                options={alta.linea ? catalogs.gerencias?.[alta.linea] || [] : []}
                placeholder="Selecciona la gerencia"
                disabled={!alta.linea}
                onSelect={(value) => setAlta((current) => applyAltaContextChange(current, { gerencia: value }))}
              />
              <div className="combo-cell">
                <ComboField
                  label="Vendedor *"
                  value={alta.vendedor}
                  options={vendorOptions}
                  placeholder={vendedoresLoading ? 'Cargando vendedores...' : 'Selecciona el vendedor'}
                  hint={vendedoresLoading ? 'Cargando vendedores...' : vendorOptions.length ? `${vendorOptions.length} opciones` : 'Sin vendedores'}
                  disabled={vendedoresLoading || !vendorOptions.length}
                  onSelect={(value) => {
                    const selectedVendor = vendedorCatalog.find((vendor) => {
                      const option = getComboOption(vendor);
                      return option.label === value || option.value === value;
                    });

                    setGroupCatalog([]);
                    setGroupsLoading(false);
                    setAlta((current) => ({
                      ...current,
                      assignmentMode: 'manual',
                      vendedor: value,
                      grupo: '',
                      vendedorId: selectedVendor?.IdVendedor ? String(selectedVendor.IdVendedor) : ''
                    }));
                  }}
                />
                <div className="inline-toggle">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={altaGenericToggleState.checked}
                    aria-disabled={altaGenericToggleState.disabled}
                    disabled={altaGenericToggleState.disabled}
                    title={altaGenericToggleState.statusLabel || undefined}
                    className={`toggle-switch${altaGenericToggleState.checked ? ' is-on' : ''}`}
                    onClick={handleToggleAltaAssignmentMode}
                  >
                    <span className="toggle-switch-thumb" aria-hidden="true" />
                  </button>
                  <span className="inline-toggle-label">Vendedor genérico</span>
                  {altaGenericToggleState.statusLabel ? (
                    <span className="inline-toggle-status">{altaGenericToggleState.statusLabel}</span>
                  ) : null}
                </div>
              </div>
              <div className="combo-cell">
                <ComboField
                  label="Grupo *"
                  value={alta.grupo}
                  options={groupCatalog}
                  placeholder={groupsLoading ? 'Cargando grupos...' : 'Selecciona un grupo'}
                  hint={groupsLoading ? 'Cargando grupos...' : groupCatalog.length ? `${groupCatalog.length} opciones` : 'Sin grupos'}
                  disabled={groupsLoading || !groupCatalog.length}
                  onSelect={(value) => setAlta((current) => ({ ...current, grupo: value }))}
                />
                <button
                  type="button"
                  className="inline-action"
                  onClick={openGroupModal}
                  disabled={!alta.vendedor || groupsLoading}
                >
                  Registrar grupo
                </button>
                {!alta.vendedor ? (
                  <small className="inline-action-hint">Selecciona un vendedor para poder registrarlo</small>
                ) : null}
              </div>
            </div>

            <div className="mini-field">
              <label>Tipo de persona</label>
              <div className="type-switch">
                <button
                  type="button"
                  className={alta.tipo === 'fisica' ? 'switch active' : 'switch'}
                  onClick={() => setAlta((current) => ({ ...current, tipo: 'fisica' }))}
                >
                  Física
                </button>
                <button
                  type="button"
                  className={alta.tipo === 'moral' ? 'switch active' : 'switch'}
                  onClick={() => setAlta((current) => ({ ...current, tipo: 'moral' }))}
                >
                  Moral
                </button>
              </div>
            </div>

            <div className="form-divider">Documento del asegurado (opcional)</div>
            <div className="upload-card">
              <label className="dropzone">
                <strong>Sube RFC, constancia de situación fiscal, comprobante de domicilio o INE</strong>
                <small>PDF, JPG o PNG · la IA llena el formulario y tú lo complementas</small>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    const selected = Array.from(event.target.files || []);
                    if (!selected.length) return;
                    const file = selected[0];
                    setAltaDocumentFile({
                      file,
                      name: file.name,
                      type: file.type,
                      sizeMb: (file.size / 1048576).toFixed(1),
                      cat: 'alta-documento'
                    });
                  }}
                />
              </label>
              {altaDocumentFile ? (
                <div className="upload-files">
                  <div className="upload-file">
                    <div className="upload-file-meta">
                      <strong>{altaDocumentFile.name}</strong>
                      <span>
                        {altaDocumentFile.cat.toUpperCase()} · {altaDocumentFile.sizeMb} MB · {altaDocumentFile.type || 'archivo'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={() => setAltaDocumentFile(null)}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="read-actions">
              <button
                type="button"
                className="primary-button"
                onClick={readAltaDocument}
                disabled={!altaDocumentFile || readingDocument}
              >
                {readingDocument && readingDocumentLabel === 'Leyendo documento del asegurado' ? 'Leyendo...' : 'Leer documento'}
              </button>
            </div>

            <div className="form-divider">Identidad</div>
            {alta.tipo === 'fisica' ? (
              <div className="ramo-grid alta-grid">
                <div className="mini-field">
                  <label>Apellido paterno <span className="required-mark">*</span></label>
                  <input
                    type="text"
                    value={alta.apP}
                    onChange={(event) => setAlta((current) => ({ ...current, apP: event.target.value }))}
                  />
                </div>
                <div className="mini-field">
                  <label>Apellido materno <span className="required-mark">*</span></label>
                  <input
                    type="text"
                    value={alta.apM}
                    onChange={(event) => setAlta((current) => ({ ...current, apM: event.target.value }))}
                  />
                </div>
                <div className="mini-field">
                  <label>Nombre(s) <span className="required-mark">*</span></label>
                  <input
                    type="text"
                    value={alta.nombres}
                    onChange={(event) => setAlta((current) => ({ ...current, nombres: event.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div className="ramo-grid alta-grid">
                <div className="mini-field span-3">
                  <label>Razón social <span className="required-mark">*</span></label>
                  <input
                    type="text"
                    value={alta.razon}
                    onChange={(event) => setAlta((current) => ({ ...current, razon: event.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="ramo-grid alta-grid">
              <div className="mini-field">
                <label>
                  <span>Correo <span className="required-mark">*</span></span>
                  {altaNotes.email ? <span className={'pill tone-' + altaNotes.email.tone}>{altaNotes.email.text}</span> : null}
                </label>
                <input type="email" value={alta.email} onChange={(e) => setAlta((current) => ({ ...current, email: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>
                  <span>Teléfono <span className="required-mark">*</span></span>
                  {altaNotes.tel ? <span className={'pill tone-' + altaNotes.tel.tone}>{altaNotes.tel.text}</span> : null}
                </label>
                <input
                  type="text"
                  value={alta.tel}
                  onChange={(e) => setAlta((current) => ({ ...current, tel: normalizeAltaPhone(e.target.value) }))}
                />
              </div>
            </div>

            <div className="form-divider">Domicilio</div>
            <div className="ramo-grid alta-grid">
              <div className="mini-field">
                <label>Calle <span className="required-mark">*</span></label>
                <input type="text" value={alta.calle} onChange={(e) => setAlta((current) => ({ ...current, calle: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Número <span className="required-mark">*</span></label>
                <input type="text" value={alta.numero} onChange={(e) => setAlta((current) => ({ ...current, numero: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>
                  <span>Código postal <span className="required-mark">*</span></span>
                  {altaNotes.cp ? <span className={'pill tone-' + altaNotes.cp.tone}>{altaNotes.cp.text}</span> : null}
                </label>
                <input type="text" value={alta.cp} onChange={(e) => setAlta((current) => applyAltaPostalCode(current, e.target.value))} />
              </div>
              <div className="mini-field">
                <label>Colonia <span className="required-mark">*</span></label>
                <input type="text" value={alta.colonia} onChange={(e) => setAlta((current) => ({ ...current, colonia: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Municipio / alcaldía <span className="required-mark">*</span></label>
                <input type="text" value={alta.municipio} onChange={(e) => setAlta((current) => ({ ...current, municipio: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>
                  <span>Estado <span className="required-mark">*</span></span>
                  {altaNotes.estado ? <span className={'pill tone-' + altaNotes.estado.tone}>{altaNotes.estado.text}</span> : null}
                </label>
                <input type="text" value={alta.estado} onChange={(e) => setAlta((current) => ({ ...current, estado: e.target.value, estadoDerivado: false }))} />
              </div>
            </div>

            <div className="form-divider">Datos fiscales</div>
            <div className="mini-field">
              <label>¿Requiere factura?</label>
              <div className="type-switch">
                <button
                  type="button"
                  className={alta.requiereFactura ? 'switch active' : 'switch'}
                  onClick={() => setAlta((current) => ({ ...current, requiereFactura: true }))}
                >
                  Sí
                </button>
                <button
                  type="button"
                  className={!alta.requiereFactura ? 'switch active' : 'switch'}
                  onClick={() => setAlta((current) => ({ ...current, requiereFactura: false }))}
                >
                  No
                </button>
              </div>
            </div>
            {alta.requiereFactura ? (
              <div className="mini-field">
                <div className="upload-card">
                  <label>
                    Constancia de situación fiscal <span className="required-mark">*</span>
                  </label>
                  <label className="dropzone">
                    <strong>Sube la constancia de situación fiscal</strong>
                    <small>PDF, JPG o PNG · se guarda con el expediente</small>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={(event) => {
                        const selected = Array.from(event.target.files || []);
                        if (!selected.length) return;
                        const file = selected[0];
                        setAltaConstanciaFile({
                          file,
                          name: file.name,
                          type: file.type,
                          sizeMb: (file.size / 1048576).toFixed(1),
                          cat: 'alta-constancia'
                        });
                      }}
                    />
                  </label>
                </div>
                {altaConstanciaFile ? (
                  <div className="upload-files">
                    <div className="upload-file">
                      <div className="upload-file-meta">
                        <strong>{altaConstanciaFile.name}</strong>
                        <span>
                          {altaConstanciaFile.cat.toUpperCase()} · {altaConstanciaFile.sizeMb} MB · {altaConstanciaFile.type || 'archivo'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button danger"
                        onClick={() => setAltaConstanciaFile(null)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="ramo-grid alta-grid">
              <div className="mini-field">
                <label>
                  <span>RFC {alta.requiereFactura ? <span className="required-mark">*</span> : null}</span>
                  {altaNotes.rfc ? <span className={'pill tone-' + altaNotes.rfc.tone}>{altaNotes.rfc.text}</span> : null}
                </label>
                <input type="text" value={alta.rfc} onChange={(e) => setAlta((current) => ({ ...current, rfc: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>CURP {alta.requiereFactura ? <span className="required-mark">*</span> : null}</label>
                <input type="text" value={alta.curp} onChange={(e) => setAlta((current) => ({ ...current, curp: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Giro {alta.requiereFactura ? <span className="required-mark">*</span> : null}</label>
                <input type="text" value={alta.giro} onChange={(e) => setAlta((current) => ({ ...current, giro: e.target.value }))} />
              </div>
              <ComboField
                label={alta.requiereFactura ? 'Régimen fiscal *' : 'Régimen fiscal'}
                value={alta.regimen}
                options={REGIMENES_FISCALES.map(formatRegimenOption)}
                placeholder="Selecciona el régimen fiscal"
                hint={`${REGIMENES_FISCALES.length} opciones`}
                onSelect={(value) => setAlta((current) => selectAltaRegimen(current, value))}
              />
              {alta.requiereFactura ? (
                <ComboField
                  label="Uso de CFDI *"
                  value={alta.usoCfdi}
                  options={altaUsoCfdiOptions}
                  placeholder={
                    alta.regimenClave ? 'Selecciona el uso de CFDI' : 'Selecciona un régimen primero'
                  }
                  hint={
                    alta.regimenClave
                      ? `${altaUsoCfdiOptions.length} opciones`
                      : 'Depende del régimen fiscal'
                  }
                  disabled={!alta.regimenClave}
                  onSelect={(value) => setAlta((current) => ({ ...current, usoCfdi: value }))}
                />
              ) : null}
            </div>

            {altaHint ? <p className="muted">{altaHint}</p> : null}
            <div className="actions-row">
              <button
                type="button"
                className="primary-button"
                onClick={saveAlta}
                disabled={!altaComplete}
              >
                Guardar asegurado
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setAlta(emptyAlta());
                  setAltaDocumentFile(null);
                  setAltaConstanciaFile(null);
                }}
              >
                Limpiar
              </button>
            </div>
          </Card>

          </div>
        ) : null}

        {activeTab === 'polizas' ? (
          <div className="page-grid">
          <Card title="Pólizas registradas" subtitle="Consulta y descarga de archivos">
            {records.polizas.length ? (
              <div className="records-list">
                {records.polizas.map((record) => (
                  <article className="record" key={record.id}>
                    <div className="record-top">
                      <div>
                        <strong>
                          {record.aseguradora ? `${record.aseguradora} · ` : ''}
                          {record.poliza ? `Póliza ${record.poliza} · ` : ''}
                          {record.asegurado}
                        </strong>
                        <div className="meta-row">
                          <span className={record.extraido ? 'pill accent' : 'pill'}>{record.extraido ? 'con IA' : 'manual'}</span>
                          <span className="pill">{record.ramo}{record.subramo ? ` / ${record.subramo}` : ''}</span>
                        </div>
                      </div>
                      <span className="date">{formatShortDate(record.fecha)}</span>
                    </div>
                    <p className="muted">{[record.linea, record.gerencia, record.vendedor].filter(Boolean).join(' · ')}</p>
                    {Array.isArray(record.archivos) && record.archivos.length ? (
                      <div className="attachments-list compact">
                        {record.archivos.map((attachment, index) => (
                          <a
                            key={`${record.id}-${index}`}
                            className="attachment-chip"
                            href={downloadAttachmentUrl(record.id, index)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            ⬇ {attachment.cat ? attachment.cat.toUpperCase() : 'DOC'} · {attachment.name}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">Aún no hay pólizas registradas en la base SQL.</div>
            )}
          </Card>
          </div>
        ) : null}

        {activeTab === 'bitacora' ? (
          <div className="page-grid">
          <Card title="Bitácora de trabajo" subtitle="Acciones guardadas en MySQL">
            {records.log.length ? (
              <div className="records-list">
                {records.log.map((entry) => (
                  <article className="log-item" key={entry.id}>
                    <div className="log-top">
                      <span className="ts">{formatDateTime(entry.ts)}</span>
                      <strong>{entry.evento}</strong>
                    </div>
                    <p className="muted">{entry.detalle}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">La bitácora registrará aquí cada acción.</div>
            )}
          </Card>
          </div>
        ) : null}

      </main>
      {captureLockNode}
      </div>
    </>
  );
}

export default App;
