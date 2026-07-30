/**
 * Two-digit postal-code prefix to Mexican state mapping.
 *
 * Provenance: extracted from the SEPOMEX national catalog
 * (`Catalogo Sepomex.xls`, 33 sheets, 157,714 rows, 31,890 distinct postal codes).
 * The first two digits determine the state with zero ambiguity: 96 prefixes, 0 conflicts.
 * Regenerate by re-running the extraction against a refreshed catalog and replacing only this file.
 */

export const CP_PREFIX_ESTADO = {
  '01': 'Ciudad de México',
  '02': 'Ciudad de México',
  '03': 'Ciudad de México',
  '04': 'Ciudad de México',
  '05': 'Ciudad de México',
  '06': 'Ciudad de México',
  '07': 'Ciudad de México',
  '08': 'Ciudad de México',
  '09': 'Ciudad de México',
  '10': 'Ciudad de México',
  '11': 'Ciudad de México',
  '12': 'Ciudad de México',
  '13': 'Ciudad de México',
  '14': 'Ciudad de México',
  '15': 'Ciudad de México',
  '16': 'Ciudad de México',
  '20': 'Aguascalientes',
  '21': 'Baja California',
  '22': 'Baja California',
  '23': 'Baja California Sur',
  '24': 'Campeche',
  '25': 'Coahuila',
  '26': 'Coahuila',
  '27': 'Coahuila',
  '28': 'Colima',
  '29': 'Chiapas',
  '30': 'Chiapas',
  '31': 'Chihuahua',
  '32': 'Chihuahua',
  '33': 'Chihuahua',
  '34': 'Durango',
  '35': 'Durango',
  '36': 'Guanajuato',
  '37': 'Guanajuato',
  '38': 'Guanajuato',
  '39': 'Guerrero',
  '40': 'Guerrero',
  '41': 'Guerrero',
  '42': 'Hidalgo',
  '43': 'Hidalgo',
  '44': 'Jalisco',
  '45': 'Jalisco',
  '46': 'Jalisco',
  '47': 'Jalisco',
  '48': 'Jalisco',
  '49': 'Jalisco',
  '50': 'México',
  '51': 'México',
  '52': 'México',
  '53': 'México',
  '54': 'México',
  '55': 'México',
  '56': 'México',
  '57': 'México',
  '58': 'Michoacán de Ocampo',
  '59': 'Michoacán de Ocampo',
  '60': 'Michoacán de Ocampo',
  '61': 'Michoacán de Ocampo',
  '62': 'Morelos',
  '63': 'Nayarit',
  '64': 'Nuevo León',
  '65': 'Nuevo León',
  '66': 'Nuevo León',
  '67': 'Nuevo León',
  '68': 'Oaxaca',
  '69': 'Oaxaca',
  '70': 'Oaxaca',
  '71': 'Oaxaca',
  '72': 'Puebla',
  '73': 'Puebla',
  '74': 'Puebla',
  '75': 'Puebla',
  '76': 'Querétaro',
  '77': 'Quintana Roo',
  '78': 'San Luis Potosí',
  '79': 'San Luis Potosí',
  '80': 'Sinaloa',
  '81': 'Sinaloa',
  '82': 'Sinaloa',
  '83': 'Sonora',
  '84': 'Sonora',
  '85': 'Sonora',
  '86': 'Tabasco',
  '87': 'Tamaulipas',
  '88': 'Tamaulipas',
  '89': 'Tamaulipas',
  '90': 'Tlaxcala',
  '91': 'Veracruz',
  '92': 'Veracruz',
  '93': 'Veracruz',
  '94': 'Veracruz',
  '95': 'Veracruz',
  '96': 'Veracruz',
  '97': 'Yucatán',
  '98': 'Zacatecas',
  '99': 'Zacatecas'
};

export const PAIS_CATALOGO = 'México';

/**
 * Resolve Estado and País from a Mexican postal code.
 *
 * @param {string | number | null | undefined} cp
 * @returns {{ estado: string, pais: string } | null}
 */
export function resolveMexicanAddressFromPostalCode(cp) {
  const digits = String(cp ?? '')
    .replace(/\D/g, '');

  if (digits.length !== 5) {
    return null;
  }

  const estado = CP_PREFIX_ESTADO[digits.slice(0, 2)];
  if (!estado) {
    return null;
  }

  return { estado, pais: PAIS_CATALOGO };
}
