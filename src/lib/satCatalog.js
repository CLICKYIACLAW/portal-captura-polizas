/**
 * SAT (Servicio de Administración Tributaria, México) CFDI 4.0 catalogs:
 * c_RegimenFiscal (fiscal regimes) and c_UsoCFDI (CFDI use codes), including
 * the official compatibility matrix between them (a Uso CFDI is only valid
 * for specific Regímenes Fiscales — SAT rejects an incompatible combination
 * with error CFDI40113 at stamping time).
 *
 * Source: cross-checked against https://soporte.enlacefiscal.com/article/212-usos-de-cfdi-por-regimen-fiscal
 * and multiple independent CFDI 4.0 Anexo 20 references, current as of
 * research done in August 2026.
 *
 * KNOWN GAP — do not silently "fill in" a guess: multiple 2026-dated sources
 * (SAT catalog update coverage) mention "three new c_RegimenFiscal codes for
 * 2026 for primary-sector (agricultural/livestock) RESICO taxpayers" but none
 * of the sources checked could be made to produce the actual new numeric
 * codes/names. If Click Seguros' compliance/accounting team can supply the
 * exact new codes, add them as additional entries to REGIMENES_FISCALES below
 * (and their applicable Usos de CFDI to USOS_CFDI's `regimenes` arrays) — this
 * is a data-only addition, not a logic change, by design.
 */

export const REGIMENES_FISCALES = [
  { clave: '601', nombre: 'General de Ley Personas Morales' },
  { clave: '603', nombre: 'Personas Morales con Fines no Lucrativos' },
  { clave: '605', nombre: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { clave: '606', nombre: 'Arrendamiento' },
  { clave: '607', nombre: 'Régimen de Enajenación o Adquisición de Bienes' },
  { clave: '608', nombre: 'Demás ingresos' },
  { clave: '610', nombre: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { clave: '611', nombre: 'Ingresos por Dividendos (socios y accionistas)' },
  { clave: '612', nombre: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { clave: '614', nombre: 'Ingresos por intereses' },
  { clave: '615', nombre: 'Régimen de los ingresos por obtención de premios' },
  { clave: '616', nombre: 'Sin obligaciones fiscales' },
  { clave: '620', nombre: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
  { clave: '621', nombre: 'Incorporación Fiscal' },
  { clave: '622', nombre: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { clave: '623', nombre: 'Opcional para Grupos de Sociedades' },
  { clave: '624', nombre: 'Coordinados' },
  { clave: '625', nombre: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { clave: '626', nombre: 'Régimen Simplificado de Confianza' }
];

// G/I-prefixed usos de CFDI = acquisition and investment uses (Gastos / Inversión).
const G_I_REGIMENES = ['601', '603', '606', '612', '620', '621', '622', '623', '624', '625', '626'];
// D-prefixed usos de CFDI = personal deductions available to individuals.
const D_REGIMENES = ['605', '606', '607', '608', '611', '612', '614', '615', '625'];
const TODOS_LOS_REGIMENES = REGIMENES_FISCALES.map((r) => r.clave);

export const USOS_CFDI = [
  { clave: 'G01', nombre: 'Adquisición de mercancías', regimenes: G_I_REGIMENES },
  { clave: 'G02', nombre: 'Devoluciones, descuentos o bonificaciones', regimenes: G_I_REGIMENES },
  { clave: 'G03', nombre: 'Gastos en general', regimenes: G_I_REGIMENES },
  { clave: 'I01', nombre: 'Construcciones', regimenes: G_I_REGIMENES },
  { clave: 'I02', nombre: 'Mobiliario y equipo de oficina por inversiones', regimenes: G_I_REGIMENES },
  { clave: 'I03', nombre: 'Equipo de transporte', regimenes: G_I_REGIMENES },
  { clave: 'I04', nombre: 'Equipo de cómputo y accesorios', regimenes: G_I_REGIMENES },
  { clave: 'I05', nombre: 'Dados, troqueles, moldes, matrices y herramental', regimenes: G_I_REGIMENES },
  { clave: 'I06', nombre: 'Comunicaciones telefónicas', regimenes: G_I_REGIMENES },
  { clave: 'I07', nombre: 'Comunicaciones satelitales', regimenes: G_I_REGIMENES },
  { clave: 'I08', nombre: 'Otra maquinaria y equipo', regimenes: G_I_REGIMENES },
  { clave: 'D01', nombre: 'Honorarios médicos, dentales y gastos hospitalarios', regimenes: D_REGIMENES },
  { clave: 'D02', nombre: 'Gastos médicos por incapacidad o discapacidad', regimenes: D_REGIMENES },
  { clave: 'D03', nombre: 'Gastos funerales', regimenes: D_REGIMENES },
  { clave: 'D04', nombre: 'Donativos', regimenes: D_REGIMENES },
  { clave: 'D05', nombre: 'Intereses reales efectivamente pagados por créditos hipotecarios', regimenes: D_REGIMENES },
  { clave: 'D06', nombre: 'Aportaciones voluntarias al SAR', regimenes: D_REGIMENES },
  { clave: 'D07', nombre: 'Primas por seguros de gastos médicos', regimenes: D_REGIMENES },
  { clave: 'D08', nombre: 'Gastos de transportación escolar obligatoria', regimenes: D_REGIMENES },
  { clave: 'D09', nombre: 'Depósitos en cuentas para ahorro y pensiones', regimenes: D_REGIMENES },
  { clave: 'D10', nombre: 'Pagos por servicios educativos (colegiaturas)', regimenes: D_REGIMENES },
  { clave: 'S01', nombre: 'Sin efectos fiscales', regimenes: TODOS_LOS_REGIMENES },
  { clave: 'CP01', nombre: 'Pagos', regimenes: TODOS_LOS_REGIMENES },
  { clave: 'CN01', nombre: 'Nómina', regimenes: ['605'] }
];

export function formatRegimenOption(regimen) {
  return `${regimen.clave} - ${regimen.nombre}`;
}

export function formatUsoCfdiOption(uso) {
  return `${uso.clave} - ${uso.nombre}`;
}

export function findRegimenByClave(clave) {
  const normalized = String(clave ?? '').trim();
  if (!normalized) return null;
  return REGIMENES_FISCALES.find((r) => r.clave === normalized) || null;
}

export function getUsosCfdiParaRegimen(claveRegimen) {
  const normalized = String(claveRegimen ?? '').trim();
  if (!normalized) return [];
  return USOS_CFDI.filter((uso) => uso.regimenes.includes(normalized));
}
