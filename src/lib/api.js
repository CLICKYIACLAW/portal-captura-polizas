import { fetchJson } from './utils.js';

const API_URL = '/api';
const BI_CLIENT_ID = 'ClickIA';
const BI_AUTH_TOKEN_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/AutorizaId/Token/generar';
const BI_EXECUTIVES_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/Buscar_Ejecutivos';
const BI_VENDORS_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/Buscar_Vendedores';
const BI_ASEGURADOS_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/CKIA_Captura_Trae_Asegurados';
const BI_GRUPOS_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/Buscar_Grupos';
const BI_RAMOS_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/CKIA_Captura_Trae_Ramos';
const BI_SUBRAMOS_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/CKIA_Captura_Trae_SubRamos';
const BI_EXECUTIVES_TOKEN = '6Vqe/9+YKj+mUmDapL5lTvgoEQyh10DW2rWuX2YzJSlMjuFL9jeRc8Hrs1k5yWfA986nayzTIyw8biLU/8C93big9fQx3dMXj8NwUock98CydCTvciSpuqo2EFLEe7/6';
const BI_RAMOS_TOKEN = '6Vqe/9+YKj+mUmDapL5lTvgoEQyh10DW2rWuX2YzJSlMjuFL9jeRc8Hrs1k5yWfA986nayzTIyw8biLU/8C93big9fQx3dMXj8NwUock98CydCTvciSpuqo2EFLEe7/6';

let biAuthTokenPromise = null;

export async function fetchBiAuthToken() {
  if (!biAuthTokenPromise) {
    biAuthTokenPromise = (async () => {
      const auth_token_bi_payload = { Id: BI_CLIENT_ID };
      const response = await fetch(BI_AUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(auth_token_bi_payload)
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.Message || `Error HTTP ${response.status}`);
      }

      const token = payload?.ATkn;
      if (!token || typeof token !== 'string') {
        throw new Error('La API de token no devolvió ATkn');
      }

      return token.trim();
    })().finally(() => {
      biAuthTokenPromise = null;
    });
  }

  return biAuthTokenPromise;
}

function mapBiListResponse(payload, fallbackKey) {
  const rawItems = Array.isArray(payload?.Valores) ? payload.Valores : [];
  return {
    ok: true,
    [fallbackKey]: rawItems
      .map((item) => ({
        Texto: String(item?.Texto ?? '').trim(),
        Valor: String(item?.Valor ?? '').trim()
      }))
      .filter((item) => item.Texto && item.Valor)
  };
}

function normalizeType(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export const GENERIC_VENDOR_CLAVE = 'VG001';

export function mapBiVendorOption(item) {
  const clave = String(item?.Clave ?? '').trim();
  const nombre = String(item?.Nombre ?? '').trim();
  const label = [clave, nombre].filter(Boolean).join(' - ');
  if (!label) return null;
  return {
    Texto: label,
    Valor: label,
    Clave: clave,
    IdVendedor: item?.IdVendedor ?? 0
  };
}

export function findVendorByClave(vendors, clave = GENERIC_VENDOR_CLAVE) {
  const target = String(clave ?? GENERIC_VENDOR_CLAVE).trim();
  return (vendors || []).find((vendor) => String(vendor?.Clave ?? '').trim() === target) || null;
}

function buildVendedoresBody(executive) {
  const tipo = normalizeType(executive?.Tipo);
  const body = {
    Busqueda: '',
    IdEjecutivo: 0,
    IdDespacho: 0,
    IdOficina: 0,
    IdMaster: 0
  };

  if (
    [
      '05 ejecutivo broker',
      '06 ejecutivo promotorias',
      '07 ejecutivo franquicias',
      '08 ejecutivo corporate',
      '09 ejecutivo call center',
      '10 ejecutivo cobranzas',
      '11 ejecutivo siniestros',
      '12 ejecutivo operaciones'
    ].includes(tipo)
  ) {
    body.IdEjecutivo = Number(executive?.IdEjecutivo ?? 0) || 0;
  } else if (['03 gerente', '04 lider'].includes(tipo)) {
    body.IdDespacho = Number(executive?.IdDespacho ?? 0) || 0;
  } else if (tipo === '02 gerente') {
    body.IdOficina = Number(executive?.IdOficina ?? 0) || 0;
  } else if (tipo === '01 master') {
    body.IdMaster = Number(executive?.IdMaster ?? 0) || 0;
  }

  return body;
}

async function fetchBiList(url, body, errorContext, fallbackKey, token) {
  const auth_token_bi = await fetchBiAuthToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `FId ${auth_token_bi}`,
      token,
      id: 'ClickIA',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    redirect: 'follow'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.MError || payload?.Message || `Error HTTP ${response.status}`);
  }
  if (payload?.Respuesta === false) {
    throw new Error(payload?.MError || `La API de ${errorContext} no devolvió resultados`);
  }

  return mapBiListResponse(payload, fallbackKey);
}

async function fetchBiVendors(executive) {
  const auth_token_bi = await fetchBiAuthToken();
  const response = await fetch(BI_VENDORS_URL, {
    method: 'POST',
    headers: {
      Authorization: `FId ${auth_token_bi}`,
      id: 'ClickIA',
      token: BI_EXECUTIVES_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildVendedoresBody(executive)),
    redirect: 'follow'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.MError || payload?.Message || `Error HTTP ${response.status}`);
  }
  if (payload?.Respuesta === false) {
    return [];
  }
  if (!Array.isArray(payload?.Coincidencias)) {
    return [];
  }

  return payload.Coincidencias.map(mapBiVendorOption).filter(Boolean);
}

export async function loadRamos() {
  return fetchBiList(BI_RAMOS_URL, {}, 'ramos', 'ramos', BI_RAMOS_TOKEN);
}

export async function buscarEjecutivos(busqueda) {
  const auth_token_bi = await fetchBiAuthToken();
  const response = await fetch(BI_EXECUTIVES_URL, {
    method: 'POST',
    headers: {
      Authorization: `FId ${auth_token_bi}`,
      id: 'ClickIA',
      token: BI_EXECUTIVES_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Busqueda: busqueda }),
    redirect: 'follow'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.MError || `Error HTTP ${response.status}`);
  }
  return payload;
}

export async function loadVendedores(executive) {
  return fetchBiVendors(executive);
}

export async function loadAsegurados(idVendedor) {
  const auth_token_bi = await fetchBiAuthToken();
  const response = await fetch(BI_ASEGURADOS_URL, {
    method: 'POST',
    headers: {
      Authorization: `FId ${auth_token_bi}`,
      id: 'ClickIA',
      token: BI_EXECUTIVES_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ IdVendedor: String(idVendedor || '') }),
    redirect: 'follow'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.MError || payload?.Message || `Error HTTP ${response.status}`);
  }
  if (payload?.Respuesta === false || !Array.isArray(payload?.Valores)) {
    return [];
  }

  return payload.Valores.map((item) => ({
    Texto: String(item?.Texto ?? '').trim(),
    Valor: String(item?.Valor ?? '').trim()
  })).filter((item) => item.Texto && item.Valor);
}

export async function loadGrupos(idVendedor) {
  const auth_token_bi = await fetchBiAuthToken();
  const response = await fetch(BI_GRUPOS_URL, {
    method: 'POST',
    headers: {
      Authorization: `FId ${auth_token_bi}`,
      id: 'ClickIA',
      token: BI_EXECUTIVES_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Busqueda: '',
      IdVendedor: Number(idVendedor || 0) || 0
    }),
    redirect: 'follow'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.MError || payload?.Message || `Error HTTP ${response.status}`);
  }
  if (payload?.Respuesta === false || !Array.isArray(payload?.Coincidencias)) {
    return [];
  }

  return payload.Coincidencias.map((item) => {
    if (typeof item === 'string') {
      return String(item).trim();
    }
    return String(item?.Clave ?? item?.Nombre ?? item?.Texto ?? item?.Valor ?? '').trim();
  }).filter(Boolean);
}

export function loadSubramos() {
  return fetchBiList(
    BI_SUBRAMOS_URL,
    {
      IdRamo: '2'
    },
    'subramos',
    'subramos',
    BI_RAMOS_TOKEN
  );
}

export function createPoliza(payload) {
  return fetchJson(`${API_URL}?action=polizas.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function createAsegurado(payload) {
  return fetchJson(`${API_URL}?action=asegurados.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function createGrupo(payload) {
  return fetchJson(`${API_URL}?action=grupos.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function createLog(payload) {
  return fetchJson(`${API_URL}?action=log.create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function downloadAttachmentUrl(polizaId, index) {
  return `${API_URL}?action=polizas.download&id=${encodeURIComponent(polizaId)}&index=${index}`;
}
