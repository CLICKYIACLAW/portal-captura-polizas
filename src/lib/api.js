import { fetchJson } from './utils';

const API_URL = '/api';

export function bootstrapApp() {
  return fetchJson(`${API_URL}?action=bootstrap`);
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
