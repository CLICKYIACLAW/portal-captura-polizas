const layoutFields = [
  // Póliza
  { k: 'DatDocumentos.TipoDocto', d: 'Tipo Documento', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Identificación del documento', order: 24, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.Documento', d: 'Documento', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Identificación del documento', order: 25, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDAgenteNum', d: 'Agente número', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Datos del agente', order: 31, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDAgenteNombre', d: 'Agente nombre', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Datos del agente', order: 30, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDFPago', d: 'Forma de Pago', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Pago de la prima', order: 28, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDMon', d: 'Moneda', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Pago de la prima', order: 29, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDSRamo', d: 'Sub Ramo', section: 'Póliza', display: { section: 'Campos administrativos', subgroup: 'Datos administrativos del documento', order: 42, span: 1, availability: 'not-printed', hidden: true } },
  { k: 'DatDocumentos.FDesde', d: 'Inicio de Vigencia', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Vigencia', order: 26, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.FHasta', d: 'Fin de Vigencia', section: 'Póliza', display: { section: 'Datos de la póliza', subgroup: 'Vigencia', order: 27, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.Renovacion', d: 'Renovación', section: 'Póliza', display: { section: 'Campos administrativos', subgroup: 'Datos administrativos del documento', order: 43, span: 1, availability: 'not-printed', hidden: true } },
  { k: 'DatDocumentos.FAntiguedad', d: 'Fecha de Antigüedad', section: 'Póliza', display: { section: 'Campos administrativos', subgroup: 'Datos administrativos del documento', order: 44, span: 1, availability: 'not-printed', hidden: true } },
  { k: 'DatDocumentos.FSolicitud', d: 'Solicitud', section: 'Póliza', display: { section: 'Campos administrativos', subgroup: 'Datos administrativos del documento', order: 45, span: 1, availability: 'not-printed', hidden: true } },
  { k: 'DatDocumentos.Status', d: 'Estatus', section: 'Póliza', display: { section: 'Campos administrativos', subgroup: 'Datos administrativos del documento', order: 46, span: 1, availability: 'not-printed', hidden: true } },

  // Contratante
  { k: 'DatDocumentos.IDCli', d: 'Cliente', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Identificación del contratante', order: 1, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirCalle', d: 'Calle', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 2, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirNumExt', d: 'Num ext.', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 3, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirNumInt', d: 'Num int.', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 4, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirCP', d: 'Código postal', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 9, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirColonia', d: 'Colonia', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 5, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirDelegacion', d: 'Delegación', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 7, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirEstado', d: 'Estado', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 8, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirCiudad', d: 'Ciudad', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 6, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDDirPais', d: 'País', section: 'Contratante', display: { section: 'Datos del contratante', subgroup: 'Domicilio del contratante', order: 10, span: 1, availability: 'printed' } },
  { k: 'DatDocumentos.IDGrupo', d: 'Grupo', section: 'Contratante', display: { section: 'Campos administrativos', subgroup: 'Datos administrativos del documento', order: 47, span: 1, availability: 'not-printed', hidden: true } },

  // Asegurado
  { k: 'DatDoctoDetail.IDAseg', d: 'Nombre', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Identificación del asegurado', order: 32, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirCalle', d: 'Calle', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 33, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirNumExt', d: 'Num ext.', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 34, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirNumInt', d: 'Num int.', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 35, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirCP', d: 'Código postal', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 40, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirColonia', d: 'Colonia', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 36, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirDelegacion', d: 'Delegación', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 38, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirEstado', d: 'Estado', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 39, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirCiudad', d: 'Ciudad', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 37, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.IDDirPais', d: 'País', section: 'Asegurado', display: { section: 'Datos del asegurado', subgroup: 'Domicilio del asegurado', order: 41, span: 1, availability: 'printed' } },

  // Vehículo
  { k: 'DatDoctoDetail.Clave', d: 'Clave', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 13, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.Marca', d: 'Marca', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 11, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.Tipo', d: 'Tipo', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 12, span: 2, availability: 'printed' } },
  { k: 'DatDoctoDetail.Modelo', d: 'Modelo', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 14, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.Serie', d: 'Serie', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 15, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.Motor', d: 'Motor', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 16, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.Repuve', d: 'Repuve', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 22, span: 1, availability: 'not-printed' } },
  { k: 'DatDoctoDetail.Placas', d: 'Placas / Matricula', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 17, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.EstadoCircula', d: 'Estado circula', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 21, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.Color', d: 'Color', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 18, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.UsoVehiculo', d: 'Uso del vehículo', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 19, span: 1, availability: 'printed' } },
  { k: 'DatDoctoDetail.TipoCarga', d: 'Tipo de carga', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 23, span: 1, availability: 'not-printed' } },
  { k: 'DatDoctoDetail.Servicio', d: 'Servicio', section: 'Vehículo', display: { section: 'Datos del vehículo', subgroup: 'Descripción del vehículo', order: 20, span: 1, availability: 'printed' } }
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

export function buildExtractionFieldGuide(fields = POLIZA_LAYOUT_FIELDS) {
  return fields
    .filter((field) => field.display?.availability === 'printed')
    .map((field) => ({
      key: field.k,
      section: field.display.section,
      label: field.d
    }));
}

export function mapExtractedFieldsToLayout(payload, fields = POLIZA_LAYOUT_FIELDS) {
  const layout = Array(fields.length).fill('');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return layout;
  }

  fields.forEach((field, index) => {
    if (
      field.display?.availability === 'printed' &&
      Object.prototype.hasOwnProperty.call(payload, field.k)
    ) {
      layout[index] = String(payload[field.k] ?? '').trim();
    }
  });

  return layout;
}

export function buildPolizaDisplaySections(fields = POLIZA_LAYOUT_FIELDS) {
  const ordered = fields
    .map((field, index) => ({ field, index, display: field.display }))
    .filter((entry) => entry.display && !entry.display.hidden)
    .sort((a, b) => a.display.order - b.display.order);

  const sectionMap = new Map();

  for (const { field, index } of ordered) {
    const { section, subgroup } = field.display;
    if (!sectionMap.has(section)) {
      sectionMap.set(section, { subgroups: new Map() });
    }
    const sectionEntry = sectionMap.get(section);
    if (!sectionEntry.subgroups.has(subgroup)) {
      sectionEntry.subgroups.set(subgroup, []);
    }
    sectionEntry.subgroups.get(subgroup).push(index);
  }

  return Array.from(sectionMap.entries()).map(([title, entry]) => ({
    title,
    indexes: Array.from(entry.subgroups.values()).flat(),
    subgroups: Array.from(entry.subgroups.entries()).map(([subgroupTitle, indexes]) => ({
      title: subgroupTitle,
      indexes,
    })),
    openByDefault: false,
  }));
}

export const POLIZA_LAYOUT_DISPLAY_SECTIONS = buildPolizaDisplaySections();
