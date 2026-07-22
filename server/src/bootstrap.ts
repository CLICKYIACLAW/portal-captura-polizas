import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSchema, exec, queryOne, queryRows, tableHasRows } from './db.js';

type SeedFile = {
  catalogs?: Record<string, unknown>;
  records?: Record<string, unknown>;
};

type BootstrapPayload = {
  ok: true;
  catalogs: Record<string, unknown>;
  records: {
    polizas: unknown[];
    asegurados: unknown[];
    grupos: unknown[];
    log: unknown[];
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
export const storageDir = path.join(projectRoot, 'storage');
export const seedPath = path.join(storageDir, 'bootstrap.json');
export const cachePath = path.join(storageDir, 'bootstrap-cache.json');
export const legacySqlitePath = path.join(storageDir, 'portal.sqlite');
const apiBase = '/api';
const biTokenUrl = 'https://ws.developmentservices.com.mx/BIFranquicias/AutorizaId/Token/generar';
const biVendedoresUrl = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/CKIA_Captura_Trae_Vendedores';
const biAseguradosUrl = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/CKIA_Captura_Trae_Asegurados';
const biRamosUrl = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/CKIA_Captura_Trae_Ramos';
const biSubRamosUrl = 'https://ws.developmentservices.com.mx/BIFranquicias/Sicas/Generar/CKIA_Captura_Trae_SubRamos';
const biClientId = 'ClickIA';
const biStaticToken =
  '6Vqe/9+YKj+mUmDapL5lTvgoEQyh10DW2rWuX2YzJSlMjuFL9jeRc8Hrs1k5yWfA986nayzTIyw8biLU/8C93big9fQx3dMXj8NwUock98CydCTvciSpuqo2EFLEe7/6';

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeFileName(value: unknown): string {
  return String(value ?? 'archivo').replace(/[^A-Za-z0-9._-]+/g, '_');
}

type BiTokenResponse = {
  ATkn?: string;
  [key: string]: unknown;
};

type BiVendedorItem = {
  Texto?: string;
  Valor?: string;
  [key: string]: unknown;
};

type BiVendedoresResponse = {
  Respuesta?: boolean;
  MError?: string;
  Valores?: BiVendedorItem[];
  [key: string]: unknown;
};

type BiAseguradosResponse = BiVendedoresResponse;

function responseErrorMessage(payload: Record<string, unknown>, fallback: string): string {
  const message = payload.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

async function ensureStorage(): Promise<void> {
  await mkdir(path.join(storageDir, 'uploads'), { recursive: true });
}

async function fetchBiToken(): Promise<string> {
  const response = await fetch(biTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Id: biClientId })
  });

  const text = await response.text();
  let payload: BiTokenResponse = {};
  try {
    payload = text ? (JSON.parse(text) as BiTokenResponse) : {};
  } catch {
    throw new Error('No se pudo parsear el token de BI');
  }

  if (!response.ok) {
    throw new Error(responseErrorMessage(payload as Record<string, unknown>, `Error HTTP ${response.status}`));
  }

  if (!payload.ATkn) {
    throw new Error('La API de token no devolvió ATkn');
  }

  return String(payload.ATkn);
}

async function fetchBiList(
  url: string,
  body: Record<string, unknown>,
  errorContext: string
): Promise<Array<{ Texto: string; Valor: string }>> {
  const token = await fetchBiToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `FId ${token}`,
      token: biStaticToken,
      id: biClientId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    redirect: 'follow'
  });

  const text = await response.text();
  let payload: BiVendedoresResponse = {};
  try {
    payload = text ? (JSON.parse(text) as BiVendedoresResponse) : {};
  } catch {
    throw new Error(`La API de ${errorContext} devolvió una respuesta inválida`);
  }

  if (!response.ok) {
    throw new Error(responseErrorMessage(payload as Record<string, unknown>, `Error HTTP ${response.status}`));
  }

  if (payload.Respuesta === false) {
    throw new Error(payload.MError || `No se pudieron cargar los ${errorContext}`);
  }

  if (!Array.isArray(payload.Valores)) {
    throw new Error(`La API de ${errorContext} devolvió un formato inválido`);
  }

  return payload.Valores.map((item) => ({
    Texto: String(item.Texto ?? '').trim(),
    Valor: String(item.Valor ?? '').trim()
  })).filter((item) => item.Texto && item.Valor);
}

export async function fetchBiVendedores(): Promise<Array<{ Texto: string; Valor: string }>> {
  return fetchBiList(biVendedoresUrl, {}, 'vendedores');
}

export async function fetchBiAsegurados(idVendedor: string | number): Promise<Array<{ Texto: string; Valor: string }>> {
  return fetchBiList(biAseguradosUrl, { IdVendedor: String(idVendedor) }, 'asegurados');
}

export async function fetchBiRamos(): Promise<Array<{ Texto: string; Valor: string }>> {
  return fetchBiList(biRamosUrl, {}, 'ramos');
}

export async function fetchBiSubramos(idRamo: string | number): Promise<Array<{ Texto: string; Valor: string }>> {
  return fetchBiList(biSubRamosUrl, { IdRamo: String(idRamo) }, 'subramos');
}

export async function readSeed(): Promise<SeedFile> {
  const raw = await readFile(seedPath, 'utf8');
  return JSON.parse(raw) as SeedFile;
}

export async function readBootstrapCache(): Promise<BootstrapPayload | null> {
  try {
    const raw = await readFile(cachePath, 'utf8');
    const decoded = JSON.parse(raw) as BootstrapPayload;
    return decoded?.ok ? decoded : null;
  } catch {
    return null;
  }
}

export async function writeBootstrapCache(payload: BootstrapPayload): Promise<void> {
  await writeFile(cachePath, JSON.stringify(payload));
}

export async function invalidateBootstrapCache(): Promise<void> {
  try {
    await rm(cachePath);
  } catch {
    // ignore
  }
}

export async function buildBootstrapResponseFromSeed(seed: SeedFile): Promise<BootstrapPayload> {
  const catalogs = (seed.catalogs ?? {}) as Record<string, unknown>;
  const records = (seed.records ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    catalogs,
    records: {
      polizas: Array.isArray(records.polizas) ? records.polizas : [],
      asegurados: Array.isArray(records.asegurados) ? records.asegurados : [],
      grupos: Array.isArray(records.grupos) ? records.grupos : [],
      log: Array.isArray(records.log) ? records.log : []
    }
  };
}

async function loadSchemasFromDb(): Promise<Record<string, unknown>> {
  const rows = await queryRows<{ name: string; payload_json: string }>('SELECT name, payload_json FROM catalog_schemas ORDER BY name ASC');
  const schemas: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      schemas[row.name] = JSON.parse(row.payload_json || '[]');
    } catch {
      schemas[row.name] = [];
    }
  }
  return schemas;
}

async function loadCatalogsFromDb(): Promise<Record<string, unknown>> {
  const rows = await queryRows<{
    kind: string;
    name: string;
    parent_name: string | null;
  }>('SELECT kind, name, parent_name FROM catalog_entries ORDER BY sort_order ASC, id ASC');

  const catalogs: Record<string, unknown> = {
    lineas: [],
    gerencias: {},
    vendedores: {},
    asegurados: {},
    ramos: [],
    subramos: {}
  };

  const gerencias = catalogs.gerencias as Record<string, string[]>;
  const vendedores = catalogs.vendedores as Record<string, string[]>;
  const asegurados = catalogs.asegurados as Record<string, string[]>;
  const subramos = catalogs.subramos as Record<string, string[]>;

  for (const row of rows) {
    const kind = String(row.kind);
    const name = String(row.name);
    const parent = String(row.parent_name ?? '');
    if (kind === 'linea') {
      (catalogs.lineas as string[]).push(name);
      continue;
    }
    if (kind === 'gerencia') {
      gerencias[parent] ??= [];
      gerencias[parent].push(name);
      continue;
    }
    if (kind === 'vendedor') {
      vendedores[parent] ??= [];
      vendedores[parent].push(name);
      continue;
    }
    if (kind === 'asegurado') {
      asegurados[parent] ??= [];
      asegurados[parent].push(name);
      continue;
    }
    if (kind === 'ramo') {
      (catalogs.ramos as string[]).push(name);
      continue;
    }
    if (kind === 'subramo') {
      subramos[parent] ??= [];
      subramos[parent].push(name);
    }
  }

  for (const bucket of [gerencias, vendedores, asegurados, subramos]) {
    for (const key of Object.keys(bucket)) {
      bucket[key] = Array.from(new Set(bucket[key]));
    }
  }

  return catalogs;
}

async function loadPolizas(): Promise<unknown[]> {
  const rows = await queryRows<Record<string, unknown>>('SELECT * FROM polizas ORDER BY created_at DESC');
  return rows.map((row) => {
    let attachments: Array<Record<string, unknown>> = [];
    try {
      attachments = JSON.parse(String(row.attachments_json ?? '[]'));
    } catch {
      attachments = [];
    }
    const mappedAttachments = attachments.map((attachment, index) => ({
      ...attachment,
      downloadUrl: `${apiBase}?action=polizas.download&id=${encodeURIComponent(String(row.id))}&index=${index}`
    }));
    return {
      id: String(row.id),
      fecha: Number(row.created_at ?? 0),
      linea: String(row.linea ?? ''),
      gerencia: String(row.gerencia ?? ''),
      vendedor: String(row.vendedor ?? ''),
      asegurado: String(row.asegurado ?? ''),
      ramo: String(row.ramo ?? ''),
      subramo: row.subramo ?? null,
      aseguradora: row.aseguradora ?? null,
      poliza: row.poliza ?? null,
      extraido: Boolean(Number(row.extraido ?? 0)),
      layout: JSON.parse(String(row.layout_json ?? '[]')),
      datos: JSON.parse(String(row.ramo_json ?? '{}')),
      archivos: mappedAttachments,
      noGuardados: JSON.parse(String(row.notes_json ?? '[]'))
    };
  });
}

async function loadAsegurados(): Promise<unknown[]> {
  const rows = await queryRows<Record<string, unknown>>('SELECT * FROM asegurados ORDER BY created_at DESC');
  return rows.map((row) => ({
    id: String(row.id),
    fecha: Number(row.created_at ?? 0),
    nombre: String(row.nombre ?? ''),
    tipo: String(row.tipo ?? ''),
    apP: row.ap_paterno ?? null,
    apM: row.ap_materno ?? null,
    nombres: row.nombres ?? null,
    razon: row.razon_social ?? null,
    rfc: row.rfc ?? null,
    email: row.email ?? null,
    tel: row.telefono ?? null,
    calle: row.calle ?? null,
    numero: row.numero ?? null,
    cp: row.cp ?? null,
    colonia: row.colonia ?? null,
    municipio: row.municipio ?? null,
    estado: row.estado ?? null,
    giro: row.giro ?? null,
    regimen: row.regimen ?? null,
    linea: row.linea ?? null,
    gerencia: row.gerencia ?? null,
    vendedor: row.vendedor ?? null,
    grupo: row.grupo_nombre ?? null
  }));
}

async function loadGrupos(): Promise<unknown[]> {
  const rows = await queryRows<Record<string, unknown>>('SELECT * FROM grupos ORDER BY created_at DESC');
  return rows.map((row) => ({
    id: String(row.id),
    fecha: Number(row.created_at ?? 0),
    nombre: String(row.nombre ?? ''),
    linea: row.linea ?? null,
    gerencia: row.gerencia ?? null,
    vendedor: row.vendedor ?? null,
    asegurados: JSON.parse(String(row.asegurados_json ?? '[]'))
  }));
}

async function loadLog(): Promise<unknown[]> {
  const rows = await queryRows<Record<string, unknown>>('SELECT * FROM bitacora ORDER BY created_at DESC LIMIT 500');
  return rows.map((row) => ({
    id: Number(row.id ?? 0),
    ts: Number(row.created_at ?? 0),
    evento: String(row.evento ?? ''),
    detalle: String(row.detalle ?? '')
  }));
}

async function syncCatalogEntriesFromSeed(seed: SeedFile): Promise<void> {
  const catalogs = (seed.catalogs ?? {}) as Record<string, unknown>;
  await exec('DELETE FROM catalog_entries');
  await exec('DELETE FROM catalog_schemas');

  let sort = 0;
  for (const name of (catalogs.lineas as string[] | undefined) ?? []) {
    await exec(
      'INSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES (:kind, :name, :parent_kind, :parent_name, :meta_json, :sort_order)',
      {
        kind: 'linea',
        name,
        parent_kind: null,
        parent_name: null,
        meta_json: '{}',
        sort_order: sort++
      }
    );
  }

  const mapBuckets: Array<[string, unknown]> = [
    ['gerencia', catalogs.gerencias ?? {}],
    ['vendedor', catalogs.vendedores ?? {}],
    ['asegurado', catalogs.asegurados ?? {}],
    ['subramo', catalogs.subramos ?? {}]
  ];

  for (const [kind, bucket] of mapBuckets) {
    for (const [parent, values] of Object.entries(bucket as Record<string, string[]>)) {
      for (const name of values) {
        await exec(
          'INSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES (:kind, :name, :parent_kind, :parent_name, :meta_json, :sort_order)',
          {
            kind,
            name,
            parent_kind: kind === 'gerencia' || kind === 'vendedor' || kind === 'asegurado' || kind === 'subramo' ? 'linea' : null,
            parent_name: parent,
            meta_json: '{}',
            sort_order: sort++
          }
        );
      }
    }
  }

  for (const name of (catalogs.ramos as string[] | undefined) ?? []) {
    await exec(
      'INSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES (:kind, :name, :parent_kind, :parent_name, :meta_json, :sort_order)',
      {
        kind: 'ramo',
        name,
        parent_kind: null,
        parent_name: null,
        meta_json: '{}',
        sort_order: sort++
      }
    );
  }

  if (catalogs.ramoSchemas) {
    await exec('REPLACE INTO catalog_schemas (name, payload_json) VALUES (:name, :payload_json)', {
      name: 'ramoSchemas',
      payload_json: JSON.stringify(catalogs.ramoSchemas)
    });
  }

  if (catalogs.danosEmpresarialesSchema) {
    await exec('REPLACE INTO catalog_schemas (name, payload_json) VALUES (:name, :payload_json)', {
      name: 'danosEmpresarialesSchema',
      payload_json: JSON.stringify(catalogs.danosEmpresarialesSchema)
    });
  }
}

async function syncCatalogSchemasFromSeed(seed: SeedFile): Promise<void> {
  const catalogs = (seed.catalogs ?? {}) as Record<string, unknown>;
  await exec('DELETE FROM catalog_schemas');
  if (catalogs.ramoSchemas) {
    await exec('REPLACE INTO catalog_schemas (name, payload_json) VALUES (:name, :payload_json)', {
      name: 'ramoSchemas',
      payload_json: JSON.stringify(catalogs.ramoSchemas)
    });
  }
  if (catalogs.danosEmpresarialesSchema) {
    await exec('REPLACE INTO catalog_schemas (name, payload_json) VALUES (:name, :payload_json)', {
      name: 'danosEmpresarialesSchema',
      payload_json: JSON.stringify(catalogs.danosEmpresarialesSchema)
    });
  }
}

export async function buildBootstrapResponseFromDb(): Promise<BootstrapPayload> {
  const seed = await readSeed();
  const catalogs = {
    ...(seed.catalogs ?? {}),
    ...(await loadCatalogsFromDb()),
    ...(await loadSchemasFromDb())
  };

  return {
    ok: true,
    catalogs,
    records: {
      polizas: await loadPolizas(),
      asegurados: await loadAsegurados(),
      grupos: await loadGrupos(),
      log: await loadLog()
    }
  };
}

async function writeFileAttachment(recordId: string, index: number, file: Record<string, unknown>): Promise<Record<string, unknown>> {
  const data = Buffer.from(String(file.data ?? ''), 'base64');
  const safeName = normalizeFileName(file.name);
  const dir = path.join(storageDir, 'uploads', recordId);
  await mkdir(dir, { recursive: true });
  const fileName = `${String(index).padStart(2, '0')}_${safeName}`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, data);
  return {
    name: safeName,
    type: String(file.type ?? 'application/octet-stream'),
    cat: String(file.cat ?? 'otros'),
    path: path.relative(projectRoot, filePath).split(path.sep).join('/'),
    size: data.length
  };
}

async function logEvent(evento: string, detalle: string): Promise<void> {
  await exec(
    'INSERT INTO bitacora (created_at, evento, detalle) VALUES (:created_at, :evento, :detalle)',
    {
      created_at: Date.now(),
      evento,
      detalle
    }
  );
}

async function ensureGroup(nombre: string, context: Record<string, unknown> = {}): Promise<{ group: Record<string, unknown>; created: boolean }> {
  const cleanName = normalizeText(nombre);
  if (!cleanName) {
    throw new Error('El nombre del grupo es obligatorio');
  }

  const existing = await queryOne<Record<string, unknown>>('SELECT * FROM grupos WHERE LOWER(nombre) = LOWER(:nombre) LIMIT 1', {
    nombre: cleanName
  });
  if (existing) {
    return { group: existing, created: false };
  }

  const group = {
    id: `G${String(Date.now())}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    created_at: Date.now(),
    nombre: cleanName,
    linea: context.linea ?? null,
    gerencia: context.gerencia ?? null,
    vendedor: context.vendedor ?? null,
    asegurados_json: '[]'
  };

  await exec(
    'INSERT INTO grupos (id, created_at, nombre, linea, gerencia, vendedor, asegurados_json) VALUES (:id, :created_at, :nombre, :linea, :gerencia, :vendedor, :asegurados_json)',
    group
  );

  return { group, created: true };
}

async function appendGroupMember(groupName: string, member: string, context: Record<string, unknown> = {}): Promise<void> {
  const { group } = await ensureGroup(groupName, context);
  let members: string[] = [];
  try {
    members = JSON.parse(String(group.asegurados_json ?? '[]'));
  } catch {
    members = [];
  }

  members.push(member);
  members = Array.from(new Set(members.map((name) => normalizeText(name)).filter(Boolean)));
  await exec(
    'UPDATE grupos SET asegurados_json = :asegurados_json, linea = COALESCE(linea, :linea), gerencia = COALESCE(gerencia, :gerencia), vendedor = COALESCE(vendedor, :vendedor) WHERE LOWER(nombre) = LOWER(:nombre)',
    {
      asegurados_json: JSON.stringify(members),
      linea: context.linea ?? null,
      gerencia: context.gerencia ?? null,
      vendedor: context.vendedor ?? null,
      nombre: groupName
    }
  );
}

async function seedFromBootstrap(seed: SeedFile): Promise<void> {
  const catalogs = (seed.catalogs ?? {}) as Record<string, unknown>;
  const records = (seed.records ?? {}) as Record<string, unknown>;

  await exec('DELETE FROM catalog_entries');
  await exec('DELETE FROM catalog_schemas');
  await exec('DELETE FROM polizas');
  await exec('DELETE FROM asegurados');
  await exec('DELETE FROM grupos');
  await exec('DELETE FROM bitacora');

  let sort = 0;
  for (const name of (catalogs.lineas as string[] | undefined) ?? []) {
    await exec(
      'INSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES (:kind, :name, :parent_kind, :parent_name, :meta_json, :sort_order)',
      {
        kind: 'linea',
        name,
        parent_kind: null,
        parent_name: null,
        meta_json: '{}',
        sort_order: sort++
      }
    );
  }

  const mapBuckets: Array<[string, unknown]> = [
    ['gerencia', catalogs.gerencias ?? {}],
    ['vendedor', catalogs.vendedores ?? {}],
    ['asegurado', catalogs.asegurados ?? {}],
    ['subramo', catalogs.subramos ?? {}]
  ];

  for (const [kind, bucket] of mapBuckets) {
    for (const [parent, values] of Object.entries(bucket as Record<string, string[]>)) {
      for (const name of values) {
        await exec(
          'INSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES (:kind, :name, :parent_kind, :parent_name, :meta_json, :sort_order)',
          {
            kind,
            name,
            parent_kind: kind === 'gerencia' || kind === 'vendedor' || kind === 'asegurado' || kind === 'subramo' ? 'linea' : null,
            parent_name: parent,
            meta_json: '{}',
            sort_order: sort++
          }
        );
      }
    }
  }

  for (const name of (catalogs.ramos as string[] | undefined) ?? []) {
    await exec(
      'INSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES (:kind, :name, :parent_kind, :parent_name, :meta_json, :sort_order)',
      {
        kind: 'ramo',
        name,
        parent_kind: null,
        parent_name: null,
        meta_json: '{}',
        sort_order: sort++
      }
    );
  }

  if (catalogs.ramoSchemas) {
    await exec('INSERT INTO catalog_schemas (name, payload_json) VALUES (:name, :payload_json)', {
      name: 'ramoSchemas',
      payload_json: JSON.stringify(catalogs.ramoSchemas)
    });
  }

  if (catalogs.danosEmpresarialesSchema) {
    await exec('INSERT INTO catalog_schemas (name, payload_json) VALUES (:name, :payload_json)', {
      name: 'danosEmpresarialesSchema',
      payload_json: JSON.stringify(catalogs.danosEmpresarialesSchema)
    });
  }

  const seedResponse = await buildBootstrapResponseFromSeed(seed);
  await writeBootstrapCache(seedResponse);

  const seedPolizas = Array.isArray(records.polizas) ? records.polizas : [];
  for (const record of seedPolizas) {
    const row = record as Record<string, unknown>;
    await exec(
      'INSERT INTO polizas (id, created_at, linea, gerencia, vendedor, asegurado, ramo, subramo, aseguradora, poliza, extraido, layout_json, ramo_json, attachments_json, notes_json) VALUES (:id, :created_at, :linea, :gerencia, :vendedor, :asegurado, :ramo, :subramo, :aseguradora, :poliza, :extraido, :layout_json, :ramo_json, :attachments_json, :notes_json)',
      {
        id: row.id,
        created_at: Number(row.created_at ?? 0),
        linea: String(row.linea ?? ''),
        gerencia: String(row.gerencia ?? ''),
        vendedor: String(row.vendedor ?? ''),
        asegurado: String(row.asegurado ?? ''),
        ramo: String(row.ramo ?? ''),
        subramo: row.subramo ?? null,
        aseguradora: row.aseguradora ?? null,
        poliza: row.poliza ?? null,
        extraido: row.extraido ? 1 : 0,
        layout_json: JSON.stringify(row.layout ?? []),
        ramo_json: JSON.stringify(row.datos ?? {}),
        attachments_json: JSON.stringify(row.archivos ?? []),
        notes_json: JSON.stringify(row.noGuardados ?? [])
      }
    );
  }
}

export async function migrateLegacyCatalogsToDb(seed: SeedFile): Promise<void> {
  await ensureStorage();
  await ensureSchema();
  await syncCatalogEntriesFromSeed(seed);
  await invalidateBootstrapCache();
}

export async function bootstrapDatabase(): Promise<void> {
  await ensureStorage();
  await ensureSchema();

  if (!(await tableHasRows('catalog_entries'))) {
    const seed = await readSeed();
    await seedFromBootstrap(seed);
    return;
  }

  if (!(await tableHasRows('catalog_schemas'))) {
    const seed = await readSeed();
    await syncCatalogSchemasFromSeed(seed);
  }
}

export async function handleBootstrap(): Promise<BootstrapPayload> {
  const cached = await readBootstrapCache();
  if (cached) {
    return cached;
  }

  await bootstrapDatabase();
  const payload = await buildBootstrapResponseFromDb();
  await writeBootstrapCache(payload);
  return payload;
}

export async function createPoliza(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  await bootstrapDatabase();
  await invalidateBootstrapCache();

  const recordId = `P${String(Date.now())}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  const createdAt = Number(input.fecha ?? Date.now());
  const files = Array.isArray(input.files) ? input.files : [];
  const storedFiles: Record<string, unknown>[] = [];
  for (const [index, file] of files.entries()) {
    if (!file || typeof file !== 'object' || !String((file as Record<string, unknown>).data ?? '')) {
      continue;
    }
    storedFiles.push(await writeFileAttachment(recordId, index, file as Record<string, unknown>));
  }

  await exec(
    'INSERT INTO polizas (id, created_at, linea, gerencia, vendedor, asegurado, ramo, subramo, aseguradora, poliza, extraido, layout_json, ramo_json, attachments_json, notes_json) VALUES (:id, :created_at, :linea, :gerencia, :vendedor, :asegurado, :ramo, :subramo, :aseguradora, :poliza, :extraido, :layout_json, :ramo_json, :attachments_json, :notes_json)',
    {
      id: recordId,
      created_at: createdAt,
      linea: normalizeText(input.linea),
      gerencia: normalizeText(input.gerencia),
      vendedor: normalizeText(input.vendedor),
      asegurado: normalizeText(input.asegurado),
      ramo: normalizeText(input.ramo),
      subramo: normalizeText(input.subramo),
      aseguradora: normalizeText(input.aseguradora),
      poliza: normalizeText(input.poliza),
      extraido: input.extraido ? 1 : 0,
      layout_json: JSON.stringify(input.layout ?? []),
      ramo_json: JSON.stringify(input.datosRamo ?? {}),
      attachments_json: JSON.stringify(storedFiles),
      notes_json: JSON.stringify(input.noGuardados ?? [])
    }
  );

  await logEvent(
    'Póliza registrada',
    [
      input.aseguradora,
      input.poliza,
      input.asegurado,
      input.linea,
      input.gerencia,
      input.vendedor,
      input.ramo
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .join(' · ')
  );

  return {
    ok: true,
    record: {
      id: recordId,
      fecha: createdAt,
      linea: normalizeText(input.linea),
      gerencia: normalizeText(input.gerencia),
      vendedor: normalizeText(input.vendedor),
      asegurado: normalizeText(input.asegurado),
      ramo: normalizeText(input.ramo),
      subramo: normalizeText(input.subramo),
      aseguradora: normalizeText(input.aseguradora),
      poliza: normalizeText(input.poliza),
      extraido: Boolean(input.extraido),
      layout: input.layout ?? [],
      datos: input.datosRamo ?? {},
      archivos: storedFiles.map((file, index) => ({
        ...file,
        downloadUrl: `${apiBase}?action=polizas.download&id=${encodeURIComponent(recordId)}&index=${index}`
      })),
      noGuardados: input.noGuardados ?? []
    }
  };
}

export async function createAsegurado(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  await bootstrapDatabase();
  await invalidateBootstrapCache();

  const recordId = `A${String(Date.now())}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  const createdAt = Number(input.fecha ?? Date.now());
  const nombre = normalizeText(input.nombre);
  if (!nombre) {
    throw new Error('El nombre del asegurado es obligatorio');
  }

  await exec(
    'INSERT INTO asegurados (id, created_at, nombre, tipo, ap_paterno, ap_materno, nombres, razon_social, rfc, email, telefono, calle, numero, cp, colonia, municipio, estado, giro, regimen, linea, gerencia, vendedor, grupo_nombre) VALUES (:id, :created_at, :nombre, :tipo, :ap_paterno, :ap_materno, :nombres, :razon_social, :rfc, :email, :telefono, :calle, :numero, :cp, :colonia, :municipio, :estado, :giro, :regimen, :linea, :gerencia, :vendedor, :grupo_nombre)',
    {
      id: recordId,
      created_at: createdAt,
      nombre,
      tipo: normalizeText(input.tipo || 'fisica'),
      ap_paterno: normalizeText(input.apP) || null,
      ap_materno: normalizeText(input.apM) || null,
      nombres: normalizeText(input.nombres) || null,
      razon_social: normalizeText(input.razon) || null,
      rfc: normalizeText(input.rfc) || null,
      email: normalizeText(input.email) || null,
      telefono: normalizeText(input.tel) || null,
      calle: normalizeText(input.calle) || null,
      numero: normalizeText(input.numero) || null,
      cp: normalizeText(input.cp) || null,
      colonia: normalizeText(input.colonia) || null,
      municipio: normalizeText(input.municipio) || null,
      estado: normalizeText(input.estado) || null,
      giro: normalizeText(input.giro) || null,
      regimen: normalizeText(input.regimen) || null,
      linea: normalizeText(input.linea),
      gerencia: normalizeText(input.gerencia),
      vendedor: normalizeText(input.vendedor),
      grupo_nombre: normalizeText(input.grupo)
    }
  );

  const group = normalizeText(input.grupo);
  if (group) {
    await appendGroupMember(group, nombre, {
      linea: normalizeText(input.linea),
      gerencia: normalizeText(input.gerencia),
      vendedor: normalizeText(input.vendedor)
    });
  }

  await logEvent('Asegurado dado de alta', `${nombre} → ${normalizeText(input.vendedor)} (${normalizeText(input.gerencia)}, ${normalizeText(input.linea)})`);

  return {
    ok: true,
    record: {
      id: recordId,
      fecha: createdAt,
      nombre,
      tipo: normalizeText(input.tipo || 'fisica'),
      apP: normalizeText(input.apP),
      apM: normalizeText(input.apM),
      nombres: normalizeText(input.nombres),
      razon: normalizeText(input.razon),
      rfc: normalizeText(input.rfc),
      email: normalizeText(input.email),
      tel: normalizeText(input.tel),
      calle: normalizeText(input.calle),
      numero: normalizeText(input.numero),
      cp: normalizeText(input.cp),
      colonia: normalizeText(input.colonia),
      municipio: normalizeText(input.municipio),
      estado: normalizeText(input.estado),
      giro: normalizeText(input.giro),
      regimen: normalizeText(input.regimen),
      linea: normalizeText(input.linea),
      gerencia: normalizeText(input.gerencia),
      vendedor: normalizeText(input.vendedor),
      grupo: normalizeText(input.grupo)
    }
  };
}

export async function createGrupo(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  await bootstrapDatabase();
  await invalidateBootstrapCache();

  const name = normalizeText(input.nombre);
  if (!name) {
    throw new Error('El nombre del grupo es obligatorio');
  }

  const { group, created } = await ensureGroup(name, {
    linea: normalizeText(input.linea),
    gerencia: normalizeText(input.gerencia),
    vendedor: normalizeText(input.vendedor)
  });

  await logEvent(created ? 'Grupo dado de alta' : 'Grupo seleccionado', name);

  return {
    ok: true,
    record: {
      id: String(group.id),
      fecha: Number(group.created_at ?? 0),
      nombre: String(group.nombre ?? ''),
      linea: group.linea ?? null,
      gerencia: group.gerencia ?? null,
      vendedor: group.vendedor ?? null,
      asegurados: JSON.parse(String(group.asegurados_json ?? '[]'))
    }
  };
}

export async function createLog(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  await bootstrapDatabase();
  await invalidateBootstrapCache();
  await logEvent(normalizeText(input.evento || 'Evento'), normalizeText(input.detalle));
  return { ok: true };
}

export async function getAttachmentResponse(id: string, index: number): Promise<{ contentType: string; filePath: string } | null> {
  await bootstrapDatabase();
  const row = await queryOne<{ attachments_json: string }>('SELECT attachments_json FROM polizas WHERE id = :id LIMIT 1', { id });
  if (!row) {
    return null;
  }

  let attachments: Array<Record<string, unknown>> = [];
  try {
    attachments = JSON.parse(row.attachments_json || '[]');
  } catch {
    attachments = [];
  }

  const attachment = attachments[index];
  if (!attachment || !attachment.path) {
    return null;
  }

  const filePath = path.join(projectRoot, String(attachment.path));
  return {
    contentType: String(attachment.type || 'application/octet-stream'),
    filePath
  };
}
