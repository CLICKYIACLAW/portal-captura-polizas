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

/**
 * Returns true when an entry has AI confirmation or an explicit user override.
 */
export function isConstanciaVerified(fileEntry) {
  if (fileEntry == null || typeof fileEntry !== 'object' || Array.isArray(fileEntry)) return false;
  return fileEntry.overrideConfirmed === true || fileEntry.aiDetectedType === CONSTANCIA_DOCUMENT_ID;
}

/**
 * Returns true when either document entry has a verified constancia.
 */
export function hasConstanciaDocument(documentFile, constanciaFile) {
  return isConstanciaVerified(documentFile) || isConstanciaVerified(constanciaFile);
}

/**
 * Records the outcome of an AI read against the entry it was actually run on.
 *
 * The read is asynchronous and the file inputs stay enabled while it is in
 * flight, so the user can replace the file before the verdict returns. Applying
 * it blindly to whatever is in state would stamp one file's verdict onto a
 * different, unread file — marking it verified without ever being inspected,
 * which is precisely the bypass this verification exists to prevent. The entry
 * is therefore only updated while it still holds the exact File that was read.
 */
export function applyConstanciaReadResult(current, readFile, detectedType, patch = {}) {
  if (current == null || typeof current !== 'object' || Array.isArray(current)) return current;
  if (readFile == null || current.file !== readFile) return current;
  return { ...current, ...patch, aiDetectedType: detectedType ?? null, aiReadAttempted: true };
}

/**
 * Marks that a read was attempted against the entry it was actually run on,
 * without asserting any verdict. Used on the failure path so a failed read
 * still unlocks the manual override for that specific file only.
 */
export function markConstanciaReadAttempted(current, readFile) {
  if (current == null || typeof current !== 'object' || Array.isArray(current)) return current;
  if (readFile == null || current.file !== readFile) return current;
  return { ...current, aiReadAttempted: true };
}

/**
 * Explains whether the general document is claiming to be a constancia.
 */
export function getConstanciaClaimStatus(documentFile) {
  if (isConstanciaVerified(documentFile)) return 'verified';
  if (documentFile == null || typeof documentFile !== 'object' || Array.isArray(documentFile)) return 'none';
  if (documentFile.docType !== CONSTANCIA_DOCUMENT_ID) return 'none';
  return documentFile.aiDetectedType != null ? 'conflict' : 'unverified';
}
