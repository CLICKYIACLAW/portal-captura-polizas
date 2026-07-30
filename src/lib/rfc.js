/**
 * RFC validation and check-digit computation per the Mexican SAT specification.
 *
 * The supplied workbook sheet `Tabla_AnexoIII_DV` lists both `O=24` and `&=24` and skips 36,
 * which is an error. With the workbook's values the documented example base `GODE561231GR`
 * sums to 1012, `1012 % 11 = 0`, giving check digit `0`. With the official values
 * (`&=24`, `O=25`, …, `Z=36`) it sums to 1026, `1026 % 11 = 3`, giving `8` — which is exactly
 * what the workbook's own `Casos_Prueba` sheet requires (`GODE561231GR8` must pass).
 * The test cases are the authority; the table in the sheet is wrong.
 */

const ANEXO_III = new Map([
  ['0', 0],
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 7],
  ['8', 8],
  ['9', 9],
  ['A', 10],
  ['B', 11],
  ['C', 12],
  ['D', 13],
  ['E', 14],
  ['F', 15],
  ['G', 16],
  ['H', 17],
  ['I', 18],
  ['J', 19],
  ['K', 20],
  ['L', 21],
  ['M', 22],
  ['N', 23],
  ['&', 24],
  ['O', 25],
  ['P', 26],
  ['Q', 27],
  ['R', 28],
  ['S', 29],
  ['T', 30],
  ['U', 31],
  ['V', 32],
  ['W', 33],
  ['X', 34],
  ['Y', 35],
  ['Z', 36],
  [' ', 37],
  ['Ñ', 38]
]);

/**
 * Compute the RFC check digit for an 11 or 12 character base.
 *
 * @param {string} base
 * @returns {string | null}
 */
export function computeRfcCheckDigit(base) {
  const normalized = String(base ?? '').trim().toUpperCase();

  if (normalized.length !== 11 && normalized.length !== 12) {
    return null;
  }

  let sum = 0;
  const startWeight = normalized.length + 1;

  for (let i = 0; i < normalized.length; i += 1) {
    const value = ANEXO_III.get(normalized[i]);
    if (value === undefined) {
      return null;
    }
    sum += value * (startWeight - i);
  }

  const residuo = sum % 11;
  const dv = 11 - residuo;

  if (dv === 11) {
    return '0';
  }
  if (dv === 10) {
    return 'A';
  }
  return String(dv);
}

/**
 * Validate an RFC string.
 *
 * @param {string | null | undefined} value
 * @returns {{ state: 'valid' | 'invalid' | 'incomplete', reason: string }}
 */
export function validateRfc(value) {
  const normalized = String(value ?? '').trim().toUpperCase();

  if (normalized.length === 0) {
    return { state: 'incomplete', reason: 'El RFC está vacío.' };
  }

  if (normalized.length < 12) {
    return { state: 'incomplete', reason: 'El RFC está incompleto.' };
  }

  if (normalized === 'XAXX010101000' || normalized === 'XEXX010101000') {
    return { state: 'valid', reason: 'RFC válido' };
  }

  const moral = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/.test(normalized);
  const fisica = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/.test(normalized);

  if (!moral && !fisica) {
    return { state: 'invalid', reason: 'El formato del RFC no es válido.' };
  }

  const datePart = normalized.slice(moral ? 3 : 4, moral ? 9 : 10);
  const yearSuffix = Number(datePart.slice(0, 2));
  const month = Number(datePart.slice(2, 4));
  const day = Number(datePart.slice(4, 6));

  const currentYear = new Date().getFullYear();
  const currentShort = currentYear % 100;
  const fullYear = (yearSuffix <= currentShort ? 2000 : 1900) + yearSuffix;

  const candidate = new Date(fullYear, month - 1, day);
  const validDate =
    candidate.getFullYear() === fullYear &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day;

  if (!validDate) {
    return { state: 'invalid', reason: 'La fecha de nacimiento o constitución del RFC no es válida.' };
  }

  const base = normalized.slice(0, -1);
  const expected = computeRfcCheckDigit(base);
  const actual = normalized.slice(-1);

  if (expected === null || expected !== actual) {
    return { state: 'invalid', reason: 'El dígito verificador del RFC no coincide.' };
  }

  return { state: 'valid', reason: 'RFC válido' };
}
