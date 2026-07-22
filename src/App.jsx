import { useEffect, useMemo, useState } from 'react';
import appPackage from '../package.json';
import {
  bootstrapApp,
  createAsegurado,
  createGrupo,
  createLog,
  createPoliza,
  downloadAttachmentUrl,
  loadAsegurados,
  loadRamos,
  loadSubramos,
  loadVendedores
} from './lib/api';
import {
  countFilled,
  fileToBase64,
  formatDateTime,
  formatMoney,
  formatShortDate,
  normalizeKey,
  normalizeText,
  splitName
} from './lib/utils';

const TAB_IDS = ['captura', 'asegurados', 'polizas', 'bitacora'];
const TAB_LABELS = {
  captura: 'Captura',
  asegurados: 'Alta de asegurados',
  polizas: 'Pólizas',
  bitacora: 'Bitácora'
};
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

function emptyCapture(length = 0) {
  return {
    linea: '',
    gerencia: '',
    vendedor: '',
    asegurado: '',
    ramo: '',
    subramo: '',
    aseguradora: '',
    poliza: '',
    layout: Array(length).fill(''),
    ramoData: {},
    files: [],
    extracted: false
  };
}

function emptyAlta() {
  return {
    tipo: 'fisica',
    linea: '',
    gerencia: '',
    vendedor: '',
    grupo: '',
    apP: '',
    apM: '',
    nombres: '',
    razon: '',
    rfc: '',
    email: '',
    tel: '',
    calle: '',
    numero: '',
    cp: '',
    colonia: '',
    municipio: '',
    estado: '',
    giro: '',
    regimen: ''
  };
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
      <label>{label}</label>
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

function SectionFields({ sections, fields, layout, onChange }) {
  return (
    <div className="section-grid">
      {(sections || []).map((section, index) => {
        const [title, start, end] = section;
        return (
          <details key={`${title}-${index}`} className="section-card" open={index < 2}>
            <summary>
              <span>{title}</span>
              <span className="badge">
                {countFilled(layout.slice(start, end + 1))} / {end - start + 1}
              </span>
            </summary>
            <div className="fields-grid">
              {fields.slice(start, end + 1).map((field, fieldIndex) => {
                const absoluteIndex = start + fieldIndex;
                return (
                  <div className="mini-field" key={`${field.k}-${absoluteIndex}`}>
                    <label title={field.d}>{field.k}</label>
                    <input
                      type="text"
                      value={layout[absoluteIndex] || ''}
                      onChange={(event) => onChange(absoluteIndex, event.target.value)}
                    />
                  </div>
                );
              })}
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

function Modal({ open, title, message, tone = 'danger', closeLabel = 'Cerrar', onClose }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation">
      <section
        className={`modal-card tone-${tone}`}
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="app-modal-title"
      >
        <div className="modal-head">
          <span className="eyebrow">{tone === 'danger' ? 'Error' : 'Aviso'}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </div>
        <h2 id="app-modal-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const publishedVersion = `v${appPackage.version}`;
  const [gerenciaId, setGerenciaId] = useState('');
  const [activeTab, setActiveTab] = useState('captura');
  const [boot, setBoot] = useState(EMPTY_BOOT);
  const [loading, setLoading] = useState(true);
  const [errorModal, setErrorModal] = useState(null);
  const [toast, setToast] = useState('');
  const [capture, setCapture] = useState(emptyCapture());
  const [alta, setAlta] = useState(emptyAlta());
  const [altaReturnToCapture, setAltaReturnToCapture] = useState(false);
  const [bootVersion, setBootVersion] = useState('React + MySQL');
  const [vendorCatalog, setVendorCatalog] = useState([]);
  const [insuredCatalog, setInsuredCatalog] = useState([]);
  const [ramoCatalog, setRamoCatalog] = useState([]);
  const [subramoCatalog, setSubramoCatalog] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [insuredLoading, setInsuredLoading] = useState(false);
  const [ramosLoading, setRamosLoading] = useState(false);
  const [subramosLoading, setSubramosLoading] = useState(false);
  const isCaptureBlocked = !gerenciaId;

  function openErrorModal(title, message) {
    setErrorModal({ title, message });
  }

  function closeErrorModal() {
    setErrorModal(null);
  }

  const catalogs = boot.catalogs || EMPTY_BOOT.catalogs;
  const records = boot.records || EMPTY_BOOT.records;
  const fields = catalogs.fields || [];
  const sections = catalogs.sections || [];
  const lineOptions = catalogs.lineas || [];
  const gerenciaOptions = catalogs.gerencias?.[capture.linea] || [];
  const vendedorOptions = vendorCatalog;
  const aseguradoOptions = insuredCatalog;
  const ramoOptions = ramoCatalog;
  const subramoOptions = subramoCatalog;
  const normalizedRamoOptions = useMemo(
    () => (ramoOptions || []).map(getComboOption).filter((option) => option.label || option.value),
    [ramoOptions]
  );
  const normalizedSubramoOptions = useMemo(
    () => (subramoOptions || []).map(getComboOption).filter((option) => option.label || option.value),
    [subramoOptions]
  );
  const selectedRamoOption =
    normalizedRamoOptions.find((option) => option.value === String(capture.ramo || '')) || null;
  const selectedSubramoOption =
    normalizedSubramoOptions.find((option) => option.value === String(capture.subramo || '')) || null;
  const selectedRamoLabel = selectedRamoOption?.label || String(capture.ramo || '');
  const selectedSubramoLabel = selectedSubramoOption?.label || String(capture.subramo || '');
  const showSubramo = normalizeKey(selectedRamoLabel) === normalizeKey('Daños');
  const captureSchema = getRamoSchema(catalogs, selectedRamoLabel, selectedSubramoLabel);
  const ramoLabels = computeRamoLabels(captureSchema);
  const captureFiles = capture.files || [];
  const polizaFiles = captureFiles.filter((file) => file.cat === 'poliza');
  const showCaptureContextCombos = false;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawId = params.get('idgerencia')?.trim() || '';
    if (!rawId || !/^\d+$/.test(rawId)) {
      setGerenciaId('');
      setLoading(false);
      openErrorModal(
        'No se puede realizar la captura de pólizas',
        'No se ha indicado la Gerencia en la URL. Agrega el querystring idgerencia con un valor entero largo para continuar.'
      );
      return undefined;
    }

    setGerenciaId(rawId);
    let mounted = true;
    setVendorCatalog([]);
    setInsuredCatalog([]);
    setRamoCatalog([]);
    setSubramoCatalog([]);
    setVendorsLoading(true);
    setInsuredLoading(true);
    setRamosLoading(true);
    setSubramosLoading(false);
    bootstrapApp(rawId)
      .then((payload) => {
        if (!mounted) return;
        setBoot(payload);
        setBootVersion(`MySQL ${payload?.catalogs ? 'listo' : ''}`.trim());
        setCapture(emptyCapture(payload?.catalogs?.fields?.length || 0));
        return Promise.allSettled([loadVendedores(rawId), loadRamos()]).then(([vendorsResult, ramosResult]) => {
          if (!mounted) return;

          if (vendorsResult.status === 'fulfilled' && vendorsResult.value?.vendedores) {
            setVendorCatalog(vendorsResult.value.vendedores);
          } else {
            setVendorCatalog([]);
            const vendorReason =
              vendorsResult.status === 'rejected' ? vendorsResult.reason : 'No se pudieron cargar los vendedores';
            const vendorMessage =
              vendorReason instanceof Error ? vendorReason.message : String(vendorReason || 'No se pudieron cargar los vendedores');
            openErrorModal('Error al cargar vendedores', vendorMessage);
          }

          if (ramosResult.status === 'fulfilled' && ramosResult.value?.ramos) {
            setRamoCatalog(ramosResult.value.ramos);
          } else {
            setRamoCatalog([]);
            const ramoReason = ramosResult.status === 'rejected' ? ramosResult.reason : 'No se pudieron cargar los ramos';
            const ramoMessage =
              ramoReason instanceof Error ? ramoReason.message : String(ramoReason || 'No se pudieron cargar los ramos');
            openErrorModal('Error al cargar ramos', ramoMessage);
          }

          setVendorsLoading(false);
          setRamosLoading(false);
          setInsuredLoading(false);
          setLoading(false);
        });
      })
      .catch((fetchError) => {
        if (!mounted) return;
        setVendorCatalog([]);
        setInsuredCatalog([]);
        setRamoCatalog([]);
        setSubramoCatalog([]);
        setVendorsLoading(false);
        setInsuredLoading(false);
        setRamosLoading(false);
        setSubramosLoading(false);
        openErrorModal('Error de arranque', fetchError.message || 'No se pudo cargar el bootstrap o la lista de vendedores');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (fields.length && capture.layout.length !== fields.length) {
      setCapture((current) => ({
        ...current,
        layout: Array(fields.length).fill('')
      }));
    }
  }, [fields.length]);

  useEffect(() => {
    let mounted = true;
    const idVendedor = String(capture.vendedor || '').trim();
    if (!idVendedor) {
      setInsuredCatalog([]);
      setInsuredLoading(false);
      return undefined;
    }

    setInsuredLoading(true);
    loadAsegurados(idVendedor)
      .then((payload) => {
        if (!mounted) return;
        if (payload?.asegurados) {
          setInsuredCatalog(payload.asegurados);
        } else {
          setInsuredCatalog([]);
        }
      })
      .catch((insuredError) => {
        if (!mounted) return;
        setInsuredCatalog([]);
        openErrorModal('Error al cargar asegurados', insuredError.message || 'No se pudieron cargar los asegurados');
      })
      .finally(() => {
        if (!mounted) return;
        setInsuredLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [capture.vendedor]);

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
              subramo: ''
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

  const summary = useMemo(() => {
    const layout = capture.layout || [];
    const subtotal = Number(String(layout[43] || '').replace(/[$,\s]/g, '')) +
      Number(String(layout[47] || '').replace(/[$,\s]/g, '')) +
      Number(String(layout[45] || '').replace(/[$,\s]/g, '')) -
      Number(String(layout[44] || '').replace(/[$,\s]/g, ''));
    const total = Number(String(layout[48] || '').replace(/[$,\s]/g, ''));
    return {
      subtotal: Number.isFinite(subtotal) && subtotal !== 0 ? subtotal : null,
      total: Number.isFinite(total) && total !== 0 ? total : null
    };
  }, [capture.layout]);

  const matchResult = useMemo(() => {
    if (!capture.extracted) return { tone: 'neutral', message: 'Aún no se ejecuta lectura asistida.' };
    const candidate =
      [capture.layout[19], capture.layout[18], capture.layout[17]].filter(Boolean).join(' ') ||
      capture.layout[6] ||
      [capture.layout[3], capture.layout[2], capture.layout[1]].filter(Boolean).join(' ');
    if (!candidate || !capture.asegurado) {
      return { tone: 'neutral', message: 'Captura un asegurado y una póliza para validar coincidencia.' };
    }
    const a = normalizeTokens(capture.asegurado);
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
      return { tone: 'warning', message: `Coincidencia parcial: en la póliza aparece «${candidate}» y elegiste «${capture.asegurado}».` };
    }
    return {
      tone: 'danger',
      message: `No cuadra: en la póliza aparece «${candidate}» y en la asignación elegiste «${capture.asegurado}».`
    };
  }, [capture]);

  function pushToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function resetCapture() {
    setCapture(emptyCapture(fields.length));
  }

  function updateCapture(field, value) {
    setCapture((current) => ({ ...current, [field]: value }));
  }

  function updateLayout(index, value) {
    setCapture((current) => {
      const next = [...current.layout];
      next[index] = value;
      return { ...current, layout: next };
    });
  }

  function updateRamoData(key, value) {
    setCapture((current) => ({
      ...current,
      ramoData: {
        ...(current.ramoData || {}),
        [key]: value
      }
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
      return { ...current, files: final };
    });
  }

  function removeFile(index) {
    setCapture((current) => ({
      ...current,
      files: current.files.filter((_, fileIndex) => fileIndex !== index)
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

  async function loadAgain() {
    try {
      const payload = await bootstrapApp(gerenciaId);
      setBoot(payload);
      setBootVersion(`MySQL ${payload?.catalogs ? 'listo' : ''}`.trim());
    } catch (fetchError) {
      openErrorModal('Error de arranque', fetchError.message || 'No se pudo recargar el bootstrap');
    }
  }

  async function callAnthropic(content) {
    let apiKey = localStorage.getItem('clk-api-key');
    if (!apiKey) {
      apiKey = window.prompt(
        'Pega tu clave de API de Anthropic para habilitar la lectura asistida en este navegador.\nSe guarda solo en este equipo.'
      );
      if (apiKey) {
        apiKey = apiKey.trim();
        if (apiKey) localStorage.setItem('clk-api-key', apiKey);
      }
    }

    if (!apiKey) {
      throw new Error('Falta la clave de API');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1400,
        messages: [{ role: 'user', content }]
      })
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('clk-api-key');
      throw new Error('La clave de API no es válida');
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Error de Anthropic');

    const text = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    return safeJsonParse(cleaned, null);
  }

  async function readCaptureDocument() {
    const doc = polizaFiles[0];
    if (!doc) {
      openErrorModal('Falta un archivo', 'Carga una póliza antes de pedir lectura asistida.');
      return;
    }

    const file = doc.file;
    const content = await fileToBase64(file);
    const ramoSchema = getRamoSchema(catalogs, capture.ramo, capture.subramo);
    const ramoFields = ramoSchema ? [...(ramoSchema.main || []), ...(ramoSchema.full || [])] : [];
    const prompt = [
      `Analiza este documento de una póliza mexicana y devuelve SOLO un JSON object válido.`,
      `Estructura esperada: { "aseguradora": string|null, "poliza": string|null, "layout": [${fields.length} valores], "ramo": object }`,
      `El arreglo "layout" debe tener exactamente ${fields.length} elementos en el mismo orden del listado.`,
      `Usa null cuando no encuentres el dato y conserva montos como números sin símbolos.`,
      `Listas de campos:`,
      ...fields.map((field, index) => `${index + 1}. ${field.k} — ${field.d}`),
      ramoFields.length ? 'Campos específicos del ramo:' : '',
      ...ramoFields.map((field) => `- ${field[0]}: ${field[2]}`),
      'No incluyas explicación adicional ni markdown.'
    ]
      .filter(Boolean)
      .join('\n');

    let extracted;
    try {
      extracted = await callAnthropic([
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: file.type,
            data: content
          }
        },
        { type: 'text', text: prompt }
      ]);
    } catch (anthropicError) {
      openErrorModal('Error de lectura', anthropicError.message || 'No se pudo completar la lectura asistida.');
      return;
    }

    if (!extracted || typeof extracted !== 'object') {
      throw new Error('La respuesta de lectura no vino en formato JSON');
    }

    const nextLayout = Array(fields.length).fill('');
    if (Array.isArray(extracted.layout)) {
      extracted.layout.forEach((value, index) => {
        if (value !== null && value !== undefined && value !== '') {
          nextLayout[index] = String(value);
        }
      });
    }

    const ramoData = {};
    if (extracted.ramo && typeof extracted.ramo === 'object') {
      Object.entries(extracted.ramo).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          ramoData[key] = String(value);
        }
      });
    }

    setCapture((current) => ({
      ...current,
      aseguradora: extracted.aseguradora ? String(extracted.aseguradora) : current.aseguradora,
      poliza: extracted.poliza ? String(extracted.poliza) : current.poliza,
      layout: nextLayout,
      ramoData,
      extracted: true
    }));

    await createLog({
      evento: 'Lectura de póliza',
      detalle: `${file.name} · ${capture.ramo || 'sin ramo'}`
    });

    pushToast('Lectura asistida completada');
    await loadAgain();
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

    const files = await Promise.all(
      captureFiles.map(async (item) => ({
        name: item.name,
        type: item.type,
        cat: item.cat,
        data: await fileToBase64(item.file)
      }))
    );

    try {
      await createPoliza({
        idgerencia: gerenciaId,
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
    } catch (saveError) {
      openErrorModal('Error al guardar póliza', saveError.message || 'No se pudo guardar la póliza.');
      return;
    }

    pushToast('Póliza guardada en SQL');
    resetCapture();
    await loadAgain();
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
    if (!alta.linea || !alta.gerencia || !alta.vendedor) {
      openErrorModal('Faltan datos', 'Completa línea, gerencia y vendedor.');
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
      linea: alta.linea,
      gerencia: alta.gerencia,
      vendedor: alta.vendedor,
      grupo: alta.grupo
    };

    try {
      await createAsegurado({ ...payload, idgerencia: gerenciaId });
    } catch (saveError) {
      openErrorModal('Error al guardar asegurado', saveError.message || 'No se pudo guardar el asegurado.');
      return;
    }
    pushToast('Asegurado dado de alta');
    if (alta.grupo) {
      try {
        await createGrupo({
          idgerencia: gerenciaId,
          nombre: alta.grupo,
          linea: alta.linea,
          gerencia: alta.gerencia,
          vendedor: alta.vendedor
        });
      } catch (groupError) {
        openErrorModal('Error al guardar grupo', groupError.message || 'No se pudo guardar el grupo.');
        return;
      }
    }

    if (altaReturnToCapture) {
      setCapture((current) => ({
        ...current,
        asegurado: nombre
      }));
      setActiveTab('captura');
      setAltaReturnToCapture(false);
    }

    setAlta(emptyAlta());
    await loadAgain();
  }

  async function createGroupFromAlta(name) {
    const grupo = normalizeText(name);
    if (!grupo) {
      openErrorModal('Faltan datos', 'Escribe un nombre de grupo.');
      return;
    }
    try {
      await createGrupo({
        idgerencia: gerenciaId,
        nombre: grupo,
        linea: alta.linea,
        gerencia: alta.gerencia,
        vendedor: alta.vendedor
      });
    } catch (groupError) {
      openErrorModal('Error al guardar grupo', groupError.message || 'No se pudo guardar el grupo.');
      return;
    }
    setAlta((current) => ({ ...current, grupo }));
    pushToast(`Grupo ${grupo} listo`);
    await loadAgain();
  }

  const captureMatchClass = `status-chip ${matchResult.tone}`;
  if (loading) {
    return (
      <div className="app-shell loading">
        <div className="hero-card">
          <span className="eyebrow">Click Seguros</span>
          <h1>Captura de Pólizas</h1>
          <p>Cargando React + MySQL...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${isCaptureBlocked ? 'blocked' : ''}`}>
      <header className="topbar">
        <div className="topbar-main">
          <div className="title-row">
            <h1>Captura de Pólizas</h1>
            <span className="version-chip">{publishedVersion}</span>
          </div>
          <button type="button" className="context-switch" aria-label="Seleccionar unidad">
            <span>{gerenciaId ? `Gerencia #${gerenciaId}` : 'Gerencia no indicada'}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 10l5 5 5-5" />
            </svg>
          </button>
        </div>
      </header>

      <Modal
        open={Boolean(errorModal)}
        title={errorModal?.title || 'Error'}
        message={errorModal?.message || ''}
        tone="danger"
        onClose={closeErrorModal}
      />

      <main className="app-main">
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
                    setCapture((current) => ({
                      ...current,
                      linea: value,
                      gerencia: '',
                      vendedor: '',
                      asegurado: '',
                      ramo: '',
                      subramo: ''
                    }))
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
                    setCapture((current) => ({
                      ...current,
                      gerencia: value,
                      vendedor: '',
                      asegurado: ''
                    }))
                  }
                />
              ) : null}
              <ComboField
                label="Vendedor"
                value={capture.vendedor}
                options={vendedorOptions}
                placeholder="Selecciona el vendedor"
                hint={vendorsLoading ? 'Cargando vendedores...' : `${vendedorOptions.length} opciones`}
                disabled={vendorsLoading || !vendedorOptions.length}
                onSelect={(value) =>
                  setCapture((current) => ({
                    ...current,
                    vendedor: value,
                    asegurado: ''
                  }))
                }
              />
              <ComboField
                label="Asegurado"
                value={capture.asegurado}
                options={aseguradoOptions}
                placeholder="Escribe para buscar al asegurado"
                hint={insuredLoading ? 'Cargando asegurados...' : `${aseguradoOptions.length} opciones`}
                disabled={!capture.vendedor || insuredLoading}
                onSelect={(value) =>
                  setCapture((current) => ({
                    ...current,
                    asegurado: value
                  }))
                }
                actionLabel={(query) =>
                  query ? `Dar de alta a «${query}»` : 'Dar de alta a un asegurado nuevo'
                }
                onAction={(query) => openAltaFromCapture(query)}
              />
              <ComboField
                label="Ramo"
                value={capture.ramo}
                options={ramoOptions}
                placeholder={ramosLoading ? 'Cargando ramos...' : 'Selecciona el ramo'}
                hint={ramosLoading ? 'Cargando ramos...' : `${ramoOptions.length} opciones`}
                disabled={ramosLoading || !ramoOptions.length}
                onSelect={(value) =>
                  setCapture((current) => ({
                    ...current,
                    ramo: value,
                    subramo: '',
                    ramoData: {}
                  }))
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
                  onSelect={(value) => setCapture((current) => ({ ...current, subramo: value }))}
                />
              ) : null}
            </div>

            <div className="capture-highlight">
              <div className={captureMatchClass}>{matchResult.message}</div>
            </div>
          </Card>

          <Card
            badge="2"
            title="Documentos de respaldo"
            subtitle="Carga la póliza principal, el recibo y otros archivos"
            headAlign="left"
          >
            <div className="file-grid">
              <label className="dropzone">
                <strong>Subir póliza</strong>
                <small>PDF, JPG o PNG · 1 archivo</small>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => addFiles('poliza', event.target.files, 1)}
                />
              </label>
              <label className="dropzone">
                <strong>Subir recibo</strong>
                <small>PDF, JPG o PNG · 1 archivo</small>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => addFiles('recibo', event.target.files, 1)}
                />
              </label>
              <label className="dropzone">
                <strong>Subir otros</strong>
                <small>PDF, JPG o PNG · hasta 3 archivos</small>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  multiple
                  onChange={(event) => addFiles('otros', event.target.files, 3)}
                />
              </label>
            </div>

            <AttachmentsList items={captureFiles} onRemove={removeFile} />
            <div className="actions-row">
              <button type="button" className="primary-button" onClick={readCaptureDocument} disabled={!polizaFiles.length}>
                Leer póliza
              </button>
            </div>
          </Card>

          <Card title="Resumen de prima" subtitle="Revisa importes antes de guardar">
            <div className="summary-grid">
              <div>
                <span>Subtotal estimado</span>
                <strong>{summary.subtotal !== null ? formatMoney(summary.subtotal) : '—'}</strong>
              </div>
              <div>
                <span>Prima total</span>
                <strong>{summary.total !== null ? formatMoney(summary.total) : '—'}</strong>
              </div>
            </div>
            <div className="warning-box">
              Revisa que prima neta, recargos, gastos, descuento, IVA y total cuadren antes de guardar.
            </div>
          </Card>

          {captureSchema ? (
            <Card
              title={`Datos del ramo${selectedRamoLabel ? ` · ${selectedRamoLabel}` : ''}${showSubramo && selectedSubramoLabel ? ` / ${selectedSubramoLabel}` : ''}`}
              subtitle="Completa la información específica del ramo"
            >
              <div className="ramo-grid">
                {(captureSchema.main || []).map(([key, label]) => (
                  <div className="mini-field" key={`main-${key}`}>
                    <label>{label}</label>
                    <input
                      type="text"
                      value={capture.ramoData?.[key] || ''}
                      onChange={(event) => updateRamoData(key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="ramo-grid full">
                {(captureSchema.full || []).map(([key, label]) => (
                  <div className="mini-field" key={`full-${key}`}>
                    <label>{label}</label>
                    <input
                      type="text"
                      value={capture.ramoData?.[key] || ''}
                      onChange={(event) => updateRamoData(key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card title="Formulario de póliza" subtitle="Datos extraídos para validar la captura" headAlign="left">
            <SectionFields
              sections={sections}
              fields={fields}
              layout={capture.layout}
              onChange={updateLayout}
            />
            <div className="actions-row">
              <button type="button" className="secondary-button" onClick={savePoliza}>
                Guardar póliza
              </button>
              <button type="button" className="ghost-button" onClick={resetCapture}>
                Limpiar
              </button>
            </div>
          </Card>
          </div>
        ) : null}

        {activeTab === 'asegurados' ? (
          <div className="page-grid two-col">
          <Card title="Alta de asegurados" subtitle="Catálogo SQL de asegurados y grupos">
            <div className="type-switch">
              <button
                type="button"
                className={alta.tipo === 'fisica' ? 'switch active' : 'switch'}
                onClick={() => setAlta((current) => ({ ...current, tipo: 'fisica', razon: '' }))}
              >
                Física
              </button>
              <button
                type="button"
                className={alta.tipo === 'moral' ? 'switch active' : 'switch'}
                onClick={() => setAlta((current) => ({ ...current, tipo: 'moral', apP: '', apM: '', nombres: '' }))}
              >
                Moral
              </button>
            </div>

            <div className="combo-grid">
              <ComboField
                label="Línea"
                value={alta.linea}
                options={lineOptions}
                placeholder="Selecciona la línea"
                onSelect={(value) =>
                  setAlta((current) => ({
                    ...current,
                    linea: value,
                    gerencia: '',
                    vendedor: ''
                  }))
                }
              />
              <ComboField
                label="Gerencia"
                value={alta.gerencia}
                options={alta.linea ? catalogs.gerencias?.[alta.linea] || [] : []}
                placeholder="Selecciona la gerencia"
                disabled={!alta.linea}
                onSelect={(value) =>
                  setAlta((current) => ({
                    ...current,
                    gerencia: value,
                    vendedor: ''
                  }))
                }
              />
              <ComboField
                label="Vendedor"
                value={alta.vendedor}
                options={vendedorOptions}
                placeholder="Selecciona el vendedor"
                hint={vendorsLoading ? 'Cargando vendedores...' : `${vendedorOptions.length} opciones`}
                disabled={!alta.gerencia || vendorsLoading}
                onSelect={(value) => setAlta((current) => ({ ...current, vendedor: value }))}
              />
              <ComboField
                label="Grupo"
                value={alta.grupo}
                options={records.grupos.map((group) => group.nombre)}
                placeholder="Busca o escribe un grupo"
                onSelect={(value) => setAlta((current) => ({ ...current, grupo: value }))}
                actionLabel={(query) => (query ? `Registrar grupo «${query}»` : 'Registrar nuevo grupo')}
                onAction={createGroupFromAlta}
              />
            </div>

            {alta.tipo === 'fisica' ? (
              <div className="ramo-grid">
                <div className="mini-field">
                  <label>Apellido paterno</label>
                  <input
                    type="text"
                    value={alta.apP}
                    onChange={(event) => setAlta((current) => ({ ...current, apP: event.target.value }))}
                  />
                </div>
                <div className="mini-field">
                  <label>Apellido materno</label>
                  <input
                    type="text"
                    value={alta.apM}
                    onChange={(event) => setAlta((current) => ({ ...current, apM: event.target.value }))}
                  />
                </div>
                <div className="mini-field">
                  <label>Nombre(s)</label>
                  <input
                    type="text"
                    value={alta.nombres}
                    onChange={(event) => setAlta((current) => ({ ...current, nombres: event.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div className="ramo-grid">
                <div className="mini-field full">
                  <label>Razón social</label>
                  <input
                    type="text"
                    value={alta.razon}
                    onChange={(event) => setAlta((current) => ({ ...current, razon: event.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="ramo-grid">
              <div className="mini-field">
                <label>RFC</label>
                <input type="text" value={alta.rfc} onChange={(e) => setAlta((current) => ({ ...current, rfc: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Correo</label>
                <input type="email" value={alta.email} onChange={(e) => setAlta((current) => ({ ...current, email: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Teléfono</label>
                <input type="text" value={alta.tel} onChange={(e) => setAlta((current) => ({ ...current, tel: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Calle</label>
                <input type="text" value={alta.calle} onChange={(e) => setAlta((current) => ({ ...current, calle: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Número</label>
                <input type="text" value={alta.numero} onChange={(e) => setAlta((current) => ({ ...current, numero: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Código postal</label>
                <input type="text" value={alta.cp} onChange={(e) => setAlta((current) => ({ ...current, cp: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Colonia</label>
                <input type="text" value={alta.colonia} onChange={(e) => setAlta((current) => ({ ...current, colonia: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Municipio</label>
                <input type="text" value={alta.municipio} onChange={(e) => setAlta((current) => ({ ...current, municipio: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Estado</label>
                <input type="text" value={alta.estado} onChange={(e) => setAlta((current) => ({ ...current, estado: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Giro</label>
                <input type="text" value={alta.giro} onChange={(e) => setAlta((current) => ({ ...current, giro: e.target.value }))} />
              </div>
              <div className="mini-field">
                <label>Régimen fiscal</label>
                <input type="text" value={alta.regimen} onChange={(e) => setAlta((current) => ({ ...current, regimen: e.target.value }))} />
              </div>
            </div>

            <div className="actions-row">
              <button type="button" className="primary-button" onClick={saveAlta}>
                Guardar asegurado
              </button>
              <button type="button" className="ghost-button" onClick={() => setAlta(emptyAlta())}>
                Limpiar
              </button>
            </div>
          </Card>

          <div className="stack">
            <Card title="Asegurados" subtitle="Persistidos en MySQL">
              {records.asegurados.length ? (
                <div className="records-list">
                  {records.asegurados.map((record) => (
                    <article className="record" key={record.id}>
                      <div className="record-top">
                        <div>
                          <strong>{record.nombre}</strong>
                          <div className="meta-row">
                            <span className="pill">{record.tipo === 'moral' ? 'Moral' : 'Física'}</span>
                            {record.grupo ? <span className="pill accent">Grupo: {record.grupo}</span> : null}
                          </div>
                        </div>
                        <span className="date">{formatShortDate(record.fecha)}</span>
                      </div>
                      <p className="muted">
                        {[record.rfc, record.email, record.tel].filter(Boolean).join(' · ')}
                      </p>
                      <p className="muted">
                        {[record.linea, record.gerencia, record.vendedor].filter(Boolean).join(' · ')}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Aún no hay asegurados en la base SQL.</div>
              )}
            </Card>

            <Card title="Grupos" subtitle="Catálogo independiente">
              {records.grupos.length ? (
                <div className="records-list">
                  {records.grupos.map((group) => (
                    <article className="record" key={group.id}>
                      <div className="record-top">
                        <div>
                          <strong>{group.nombre}</strong>
                          <div className="meta-row">
                            <span className="pill">Grupo</span>
                            <span className="pill accent">{group.asegurados?.length || 0} asegurados</span>
                          </div>
                        </div>
                        <span className="date">{formatShortDate(group.fecha)}</span>
                      </div>
                      <p className="muted">{[group.linea, group.gerencia, group.vendedor].filter(Boolean).join(' · ')}</p>
                      {group.asegurados?.length ? <p className="muted">{group.asegurados.join(' · ')}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Aún no hay grupos registrados.</div>
              )}
            </Card>
          </div>
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

        <footer className="footer">
          <span>Portal migrado a React + MySQL</span>
          <span>{bootVersion}</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
