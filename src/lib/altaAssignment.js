import { findVendorByClave } from './api.js';

/**
 * Generic-vendor assignment for the Alta de asegurados form.
 *
 * The capture tab has an equivalent toggle, but there it also has to invalidate
 * the uploaded documents and the extracted layout. The alta form holds none of
 * that, so the whole state transition is just the vendor and what depends on it
 * — which is exactly what makes it worth keeping here as pure functions instead
 * of inline in the component.
 *
 * The group is cleared on both directions for the same reason the manual
 * Vendedor combo clears it: a grupo only exists inside one vendor's catalogue,
 * so carrying it across a vendor change would attach the asegurado to a group
 * its new vendor does not own.
 */

/**
 * Turns the generic assignment ON, writing the VG001 catalogue entry into the
 * alta. Returns `current` untouched when the catalogue has no VG001, so the
 * form can never end up flagged generic without a vendor behind it.
 */
export function activateAltaGenericVendor(current, vendors) {
  const generic = findVendorByClave(vendors);
  if (!generic) return current;

  return {
    ...current,
    assignmentMode: 'generic',
    vendedor: generic.Valor ?? '',
    vendedorId: String(generic.IdVendedor ?? ''),
    grupo: ''
  };
}

/** Turns the generic assignment OFF, clearing the vendor and its dependants. */
export function returnAltaToManualVendor(current) {
  return {
    ...current,
    assignmentMode: 'manual',
    vendedor: '',
    vendedorId: '',
    grupo: ''
  };
}

/** Single entry point for the toggle: flips whichever way the form is in. */
export function toggleAltaGenericVendor(current, vendors) {
  return current?.assignmentMode === 'generic'
    ? returnAltaToManualVendor(current)
    : activateAltaGenericVendor(current, vendors);
}

/**
 * Applies a Línea/Gerencia change. The vendor is normally cleared because the
 * catalogue it was picked from is scoped to that context — but VG001 is not, so
 * the generic assignment survives a context change here exactly as it does in
 * the capture tab. Without this the switch would stay visibly on while the
 * vendor behind it had been wiped.
 */
export function applyAltaContextChange(current, patch) {
  const next = { ...current, ...patch };
  return current?.assignmentMode === 'generic' ? next : { ...next, vendedor: '' };
}
