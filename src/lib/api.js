import { fetchJson } from './utils';

const API_URL = '/api';

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
