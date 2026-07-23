import { fetchJson } from './utils';

const API_URL = '/api';
const BI_CLIENT_ID = 'ClickIA';
const BI_AUTH_TOKEN_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/AutorizaId/Token/generar';
const BI_EXECUTIVES_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/Buscar_Ejecutivos';
const BI_EXECUTIVES_TOKEN = '6Vqe/9+YKj+mUmDapL5lTvgoEQyh10DW2rWuX2YzJSlMjuFL9jeRc8Hrs1k5yWfA986nayzTIyw8biLU/8C93big9fQx3dMXj8NwUock98CydCTvciSpuqo2EFLEe7/6';

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

export function bootstrapApp() {
  return fetchJson(`${API_URL}?action=bootstrap`);
}

export function loadVendedores() {
  return fetchJson(`${API_URL}?action=vendedores.list`);
}

export function loadAsegurados(idVendedor) {
  const params = new URLSearchParams({ action: 'asegurados.list' });
  if (idVendedor) {
    params.set('idvendedor', idVendedor);
  }
  return fetchJson(`${API_URL}?${params.toString()}`);
}

export function loadRamos() {
  const params = new URLSearchParams({ action: 'ramos.list' });
  return fetchJson(`${API_URL}?${params.toString()}`);
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

export function loadSubramos(idRamo) {
  const params = new URLSearchParams({ action: 'subramos.list' });
  if (idRamo) {
    params.set('idramo', idRamo);
  }
  return fetchJson(`${API_URL}?${params.toString()}`);
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
