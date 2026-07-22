import { fetchJson } from './utils';

const API_URL = '/api';
const BI_AUTH_TOKEN = 'FId {{auth_token_bi}}';
const BI_EXECUTIVES_URL = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/Buscar_Ejecutivos';

export function bootstrapApp(idGerencia) {
  const params = new URLSearchParams({ action: 'bootstrap' });
  if (idGerencia) {
    params.set('idgerencia', idGerencia);
  }
  return fetchJson(`${API_URL}?${params.toString()}`);
}

export function loadVendedores(idGerencia) {
  const params = new URLSearchParams({ action: 'vendedores.list' });
  if (idGerencia) {
    params.set('idgerencia', idGerencia);
  }
  return fetchJson(`${API_URL}?${params.toString()}`);
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
  const response = await fetch(BI_EXECUTIVES_URL, {
    method: 'POST',
    headers: {
      Authorization: BI_AUTH_TOKEN,
      id: 'auditoria',
      token: '6Vqe/9+YKj+mUmDapL5lTvgoEQyh10DW2rWuX2YzJSlMjuFL9jeRc8Hrs1k5yWfA986nayzTIyw8biLU/8C93big9fQx3dMXj8NwUock98CydCTvciSpuqo2EFLEe7/6',
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
