export const POLIZA_LAYOUT_FIELDS = [
  { k: 'DatDocumentos.IDDocto', d: 'IDDocto', section: 'Póliza' },
  { k: 'DatDocumentos.TipoDocto', d: 'Tipo Documento', section: 'Póliza' },
  { k: 'DatDocumentos.Documento', d: 'Documento', section: 'Póliza' },
  { k: 'DatDocumentos.IDCli', d: 'Cliente', section: 'Contratante' },
  { k: 'DatDocumentos.IDDir', d: 'Dirección', section: 'Contratante' },
  { k: 'DatDocumentos.IDGrupo', d: 'Grupo', section: 'Contratante' },
  { k: 'DatDocumentos.IDAgente', d: 'Agente', section: 'Póliza' },
  { k: 'DatDocumentos.IDFPago', d: 'Forma de Pago', section: 'Póliza' },
  { k: 'DatDocumentos.IDMon', d: 'Moneda', section: 'Póliza' },
  { k: 'DatDocumentos.IDSRamo', d: 'Sub Ramo', section: 'Póliza' },
  { k: 'DatDocumentos.IDEjecut', d: 'Ejecutivo', section: 'Control' },
  { k: 'DatDocumentos.IDEjecutCob', d: 'Ejecutivo de Cobranza', section: 'Control' },
  { k: 'DatDocumentos.IDEjecutRec', d: 'Ejecutivo de Reclamo', section: 'Control' },
  { k: 'DatDocumentos.IDVend', d: 'Vendedor', section: 'Control' },
  { k: 'DatDocumentos.IDDespacho', d: 'Despacho', section: 'Control' },
  { k: 'DatDocumentos.IDGerencia', d: 'Gerencia', section: 'Control' },
  { k: 'DatDocumentos.IDLineBuss', d: 'Línea de Negocio', section: 'Control' },
  { k: 'DatDocumentos.IDEjecutCia', d: 'Ejecutivo de Compañía', section: 'Control' },
  { k: 'DatDocumentos.CCobro', d: 'Conducto de Cobro', section: 'Control' },
  { k: 'DatDocumentos.TVenta', d: 'Tipo de Venta', section: 'Control' },
  { k: 'DatDocumentos.FDesde', d: 'Inicio de Vigencia', section: 'Póliza' },
  { k: 'DatDocumentos.FHasta', d: 'Fin de Vigencia', section: 'Póliza' },
  { k: 'DatDocumentos.Renovacion', d: 'Renovación', section: 'Control' },
  { k: 'DatDocumentos.FAntiguedad', d: 'Fecha de Antigüedad', section: 'Control' },
  { k: 'DatDocumentos.FSolicitud', d: 'Solicitud', section: 'Control' },
  { k: 'DatDocumentos.Status', d: 'Estatus', section: 'Control' },
  { k: 'DatDocumentos.PrimaNeta', d: 'Prima neta', section: 'Importe Primas' },
  { k: 'DatDocumentos.Descuento', d: 'Descuento', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorDesc', d: '% Descuento', section: 'Importe Primas' },
  { k: 'DatDocumentos.ExtraPrima', d: 'Extra Prima', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorExtraP', d: '% Extra Prima', section: 'Importe Primas' },
  { k: 'DatDocumentos.Recargos', d: 'Recargos', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorRecargos', d: '% Recargos', section: 'Importe Primas' },
  { k: 'DatDocumentos.Derechos', d: 'Derechos', section: 'Importe Primas' },
  { k: 'DatDocumentos.STotal', d: 'Sub total', section: 'Importe Primas' },
  { k: 'DatDocumentos.Impuesto1', d: 'IVA', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorImp1', d: '% IVA', section: 'Importe Primas' },
  { k: 'DatDocumentos.PrimaTotal', d: 'Prima total', section: 'Importe Primas' },
  { k: 'DatDocumentos.Comision0', d: 'Neta', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorCom0', d: '% Com. Neta', section: 'Importe Primas' },
  { k: 'DatDocumentos.Comision1', d: 'Extra Prima', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorCom1', d: '% Com. Extra Prima', section: 'Importe Primas' },
  { k: 'DatDocumentos.Comision2', d: 'Recargos', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorCom2', d: '% Com. Recargos', section: 'Importe Primas' },
  { k: 'DatDocumentos.Comision3', d: 'Derechos', section: 'Importe Primas' },
  { k: 'DatDocumentos.PorCom3', d: '% Com. Derechos', section: 'Importe Primas' },
  { k: 'DatDocumentos.Concepto', d: 'Concepto', section: 'Importe Primas' },
  { k: 'DatDocumentos.ClasDocto', d: 'Clasificación Documento', section: 'Control' },
  { k: 'DatDocumentos.TCDocto', d: 'T. de Cambio', section: 'Control' },
  { k: 'DatDocumentos.IDUserC', d: 'Usuario que Capturó', section: 'Control' },
  { k: 'DatDoctoDetail.IDDocto', d: 'Documento ID', section: 'Póliza' },
  { k: 'DatDoctoDetail.IDAseg', d: 'Nombre', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDir', d: 'Dirección', section: 'Asegurado' },
  { k: 'DatDoctoDetail.Clave', d: 'Clave', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Marca', d: 'Marca', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Tipo', d: 'Tipo', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Modelo', d: 'Modelo', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Serie', d: 'Serie', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Motor', d: 'Motor', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Repuve', d: 'Repuve', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Placas', d: 'Placas /Matricula', section: 'Vehículo' },
  { k: 'DatDoctoDetail.EstadoCircula', d: 'Estado circula', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Color', d: 'Color', section: 'Vehículo' },
  { k: 'DatDoctoDetail.UsoVehiculo', d: 'Uso del vehículo', section: 'Vehículo' },
  { k: 'DatDoctoDetail.TipoCarga', d: 'Tipo de carga', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Servicio', d: 'Servicio', section: 'Vehículo' }
];

export function buildPolizaSections(fields = POLIZA_LAYOUT_FIELDS) {
  const sections = [];
  let currentSection = null;
  let startIndex = 0;

  fields.forEach((field, index) => {
    const section = String(field.section || 'General');
    if (currentSection === null) {
      currentSection = section;
      startIndex = index;
      return;
    }
    if (section !== currentSection) {
      sections.push([currentSection, startIndex, index - 1]);
      currentSection = section;
      startIndex = index;
    }
  });

  if (currentSection !== null) {
    sections.push([currentSection, startIndex, fields.length - 1]);
  }

  return sections;
}

export const POLIZA_LAYOUT_SECTIONS = buildPolizaSections();

export const POLIZA_LAYOUT_INDEX_BY_KEY = Object.fromEntries(
  POLIZA_LAYOUT_FIELDS.map((field, index) => [field.k, index])
);

export const POLIZA_ASEGURADO_INDEX = POLIZA_LAYOUT_INDEX_BY_KEY['DatDoctoDetail.IDAseg'] ?? -1;
