export const ALTA_DOCUMENT_TYPES = [
  { id: 'constancia', label: 'Constancia de situación fiscal' },
  { id: 'rfc', label: 'RFC' },
  { id: 'domicilio', label: 'Comprobante de domicilio' },
  { id: 'ine', label: 'INE' }
];

export const CONSTANCIA_DOCUMENT_ID = 'constancia';

export function findAltaDocumentType(id) {
  const normalized = String(id ?? '').trim();
  if (!normalized) return null;
  return ALTA_DOCUMENT_TYPES.find((type) => type.id === normalized) || null;
}

/**
 * Applies an AI-detected document type to the current upload state.
 *
 * Must be called from inside the state updater rather than against a captured
 * variable: the type selector stays enabled while the AI read is in flight, so
 * a user choice made during that window would otherwise be overwritten by a
 * stale closure read.
 */
export function applyDetectedDocumentType(current, detectedType) {
  if (!current || !detectedType) return current;
  if (current.docTypeSource === 'user') return current;
  return { ...current, docType: detectedType, docTypeSource: 'ai' };
}

export function resolveDetectedDocumentType(result) {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) {
    return null;
  }
  const documento = result.documento;
  if (documento == null || typeof documento !== 'object' || Array.isArray(documento)) {
    return null;
  }
  const raw = documento.tipo;
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const matched = findAltaDocumentType(normalized);
  return matched ? matched.id : null;
}
