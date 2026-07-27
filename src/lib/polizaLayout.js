const layoutFields = [
  // Póliza
  { k: 'DatDocumentos.IDDocto', d: 'IDDocto', section: 'Póliza' },
  { k: 'DatDocumentos.TipoDocto', d: 'Tipo Documento', section: 'Póliza' },
  { k: 'DatDocumentos.Documento', d: 'Documento', section: 'Póliza' },
  { k: 'DatDocumentos.IDAgenteNum', d: 'Agente número', section: 'Póliza' },
  { k: 'DatDocumentos.IDAgenteNombre', d: 'Agente nombre', section: 'Póliza' },
  { k: 'DatDocumentos.IDFPago', d: 'Forma de Pago', section: 'Póliza' },
  { k: 'DatDocumentos.IDMon', d: 'Moneda', section: 'Póliza' },
  { k: 'DatDocumentos.IDSRamo', d: 'Sub Ramo', section: 'Póliza' },
  { k: 'DatDocumentos.FDesde', d: 'Inicio de Vigencia', section: 'Póliza' },
  { k: 'DatDocumentos.FHasta', d: 'Fin de Vigencia', section: 'Póliza' },
  { k: 'DatDocumentos.Renovacion', d: 'Renovación', section: 'Póliza' },
  { k: 'DatDocumentos.FAntiguedad', d: 'Fecha de Antigüedad', section: 'Póliza' },
  { k: 'DatDocumentos.FSolicitud', d: 'Solicitud', section: 'Póliza' },
  { k: 'DatDocumentos.Status', d: 'Estatus', section: 'Póliza' },
  { k: 'DatDocumentos.ClasDocto', d: 'Clasificación Documento', section: 'Póliza' },
  { k: 'DatDocumentos.TCDocto', d: 'T. de Cambio', section: 'Póliza' },
  { k: 'DatDocumentos.IDUserC', d: 'Usuario que Capturó', section: 'Póliza' },

  // Contratante
  { k: 'DatDocumentos.IDCli', d: 'Cliente', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirCalle', d: 'Calle', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirNumExt', d: 'Num ext.', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirNumInt', d: 'Num int.', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirCP', d: 'Código postal', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirColonia', d: 'Colonia', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirDelegacion', d: 'Delegación', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirEstado', d: 'Estado', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirCiudad', d: 'Ciudad', section: 'Contratante' },
  { k: 'DatDocumentos.IDDirPais', d: 'País', section: 'Contratante' },
  { k: 'DatDocumentos.IDGrupo', d: 'Grupo', section: 'Contratante' },

  // Control
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

  // Asegurado
  { k: 'DatDoctoDetail.IDDocto', d: 'Documento ID', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDAseg', d: 'Nombre', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirCalle', d: 'Calle', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirNumExt', d: 'Num ext.', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirNumInt', d: 'Num int.', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirCP', d: 'Código postal', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirColonia', d: 'Colonia', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirDelegacion', d: 'Delegación', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirEstado', d: 'Estado', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirCiudad', d: 'Ciudad', section: 'Asegurado' },
  { k: 'DatDoctoDetail.IDDirPais', d: 'País', section: 'Asegurado' },

  // Vehículo
  { k: 'DatDoctoDetail.Clave', d: 'Clave', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Marca', d: 'Marca', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Tipo', d: 'Tipo', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Modelo', d: 'Modelo', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Serie', d: 'Serie', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Motor', d: 'Motor', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Repuve', d: 'Repuve', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Placas', d: 'Placas / Matricula', section: 'Vehículo' },
  { k: 'DatDoctoDetail.EstadoCircula', d: 'Estado circula', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Color', d: 'Color', section: 'Vehículo' },
  { k: 'DatDoctoDetail.UsoVehiculo', d: 'Uso del vehículo', section: 'Vehículo' },
  { k: 'DatDoctoDetail.TipoCarga', d: 'Tipo de carga', section: 'Vehículo' },
  { k: 'DatDoctoDetail.Servicio', d: 'Servicio', section: 'Vehículo' }
];

export const POLIZA_LAYOUT_FIELDS = layoutFields;

export function buildPolizaSections(fields = POLIZA_LAYOUT_FIELDS) {
  const sectionMap = new Map();
  const sectionOrder = [];

  fields.forEach((field, index) => {
    const section = String(field.section || 'General');
    if (!sectionMap.has(section)) {
      sectionMap.set(section, []);
      sectionOrder.push(section);
    }
    sectionMap.get(section).push(index);
  });

  return sectionOrder.map((section) => [section, sectionMap.get(section)]);
}

export const POLIZA_LAYOUT_SECTIONS = buildPolizaSections();

export const POLIZA_LAYOUT_INDEX_BY_KEY = Object.fromEntries(
  POLIZA_LAYOUT_FIELDS.map((field, index) => [field.k, index])
);

export const POLIZA_ASEGURADO_INDEX = POLIZA_LAYOUT_INDEX_BY_KEY['DatDoctoDetail.IDAseg'] ?? -1;
