<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const STORAGE_DIR = __DIR__ . '/storage';
const DB_PATH = STORAGE_DIR . '/portal.sqlite';
const SEED_PATH = STORAGE_DIR . '/bootstrap.json';
const LEGACY_PATH = __DIR__ . '/legacy/index-monolith.html';
const SEED_SCRIPT = __DIR__ . '/scripts/seed-legacy.mjs';

function respond(array $payload, int $status = 200): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function readSeed(): array {
  if (!file_exists(SEED_PATH)) {
    if (!file_exists(LEGACY_PATH)) {
      throw new RuntimeException('No existe el archivo legado para generar la semilla.');
    }

    $command = 'node ' . escapeshellarg(SEED_SCRIPT) . ' ' . escapeshellarg(__DIR__);
    $output = [];
    $code = 0;
    exec($command . ' 2>&1', $output, $code);
    if ($code !== 0 || !file_exists(SEED_PATH)) {
      throw new RuntimeException('No se pudo generar la semilla: ' . implode("\n", $output));
    }
  }

  $decoded = json_decode((string) file_get_contents(SEED_PATH), true);
  if (!is_array($decoded)) {
    throw new RuntimeException('La semilla de bootstrap no es válida.');
  }

  return $decoded;
}

function sqliteBinary(): string {
  static $binary = null;
  if (is_string($binary) && $binary !== '') {
    return $binary;
  }

  $output = [];
  $code = 0;
  exec('command -v sqlite3 2>/dev/null', $output, $code);
  $binary = trim(implode("\n", $output));
  if ($binary === '') {
    throw new RuntimeException('No está disponible el binario sqlite3 en el servidor.');
  }

  return $binary;
}

function sqlValue(mixed $value): string {
  if ($value === null) {
    return 'NULL';
  }

  if (is_bool($value)) {
    return $value ? '1' : '0';
  }

  if (is_int($value) || is_float($value)) {
    return (string) $value;
  }

  if (is_array($value) || is_object($value)) {
    $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  }

  $value = (string) $value;
  return "'" . str_replace("'", "''", $value) . "'";
}

function sqliteRun(string $script): string {
  if (!is_dir(STORAGE_DIR)) {
    mkdir(STORAGE_DIR, 0775, true);
  }

  $tmp = tempnam(sys_get_temp_dir(), 'sqlite-script-');
  if ($tmp === false) {
    throw new RuntimeException('No se pudo crear un archivo temporal para SQLite.');
  }

  file_put_contents($tmp, $script);

  $binary = sqliteBinary();
  $output = [];
  $code = 0;
  $command = escapeshellarg($binary) . ' -batch ' . escapeshellarg(DB_PATH) . ' < ' . escapeshellarg($tmp) . ' 2>&1';
  exec($command, $output, $code);
  @unlink($tmp);

  if ($code !== 0) {
    throw new RuntimeException(implode("\n", $output) ?: 'Error ejecutando SQLite.');
  }

  return trim(implode("\n", $output));
}

function sqliteQueryRows(string $sql): array {
  $script = ".mode csv\n.headers on\n" . rtrim($sql, ";\r\n\t ") . ";\n";
  $raw = sqliteRun($script);
  if ($raw === '') {
    return [];
  }

  $lines = preg_split('/\r\n|\n|\r/', $raw) ?: [];
  if (!$lines) {
    return [];
  }

  $headers = str_getcsv(array_shift($lines));
  $rows = [];
  foreach ($lines as $line) {
    if ($line === '') {
      continue;
    }
    $values = str_getcsv($line);
    $row = [];
    foreach ($headers as $index => $header) {
      $row[$header] = $values[$index] ?? null;
    }
    $rows[] = $row;
  }

  return $rows;
}

function sqliteQueryOne(string $sql): ?array {
  $rows = sqliteQueryRows($sql);
  return $rows[0] ?? null;
}

function sqliteEnsureBootstrap(array $seed): void {
  if (file_exists(DB_PATH) && filesize(DB_PATH) > 0) {
    return;
  }

  $script = <<<'SQL'
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS catalog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_kind TEXT,
  parent_name TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_catalog_entries_kind_parent
  ON catalog_entries(kind, parent_kind, parent_name, sort_order, name);

CREATE TABLE IF NOT EXISTS catalog_schemas (
  name TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS polizas (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  linea TEXT NOT NULL,
  gerencia TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  asegurado TEXT NOT NULL,
  ramo TEXT NOT NULL,
  subramo TEXT,
  aseguradora TEXT,
  poliza TEXT,
  extraido INTEGER NOT NULL DEFAULT 0,
  layout_json TEXT NOT NULL DEFAULT '[]',
  ramo_json TEXT NOT NULL DEFAULT '{}',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS asegurados (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ap_paterno TEXT,
  ap_materno TEXT,
  nombres TEXT,
  razon_social TEXT,
  rfc TEXT,
  email TEXT,
  telefono TEXT,
  calle TEXT,
  numero TEXT,
  cp TEXT,
  colonia TEXT,
  municipio TEXT,
  estado TEXT,
  giro TEXT,
  regimen TEXT,
  linea TEXT NOT NULL,
  gerencia TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  grupo_nombre TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS grupos (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  nombre TEXT NOT NULL UNIQUE,
  linea TEXT,
  gerencia TEXT,
  vendedor TEXT,
  asegurados_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS bitacora (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  evento TEXT NOT NULL,
  detalle TEXT NOT NULL
);

DELETE FROM catalog_entries;
DELETE FROM catalog_schemas;
DELETE FROM polizas;
DELETE FROM asegurados;
DELETE FROM grupos;
DELETE FROM bitacora;
SQL;

  $catalogs = $seed['catalogs'] ?? [];
  $order = 0;

  foreach (($catalogs['lineas'] ?? []) as $linea) {
    $script .= "\nINSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES ('linea', " . sqlValue((string) $linea) . ", NULL, NULL, '{}', " . (int) $order++ . ");";
  }

  foreach (($catalogs['gerencias'] ?? []) as $linea => $gerencias) {
    foreach ((array) $gerencias as $gerencia) {
      $script .= "\nINSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES ('gerencia', " . sqlValue((string) $gerencia) . ", 'linea', " . sqlValue((string) $linea) . ", '{}', " . (int) $order++ . ");";
    }
  }

  foreach (($catalogs['vendedores'] ?? []) as $gerencia => $vendedores) {
    foreach ((array) $vendedores as $vendedor) {
      $script .= "\nINSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES ('vendedor', " . sqlValue((string) $vendedor) . ", 'gerencia', " . sqlValue((string) $gerencia) . ", '{}', " . (int) $order++ . ");";
    }
  }

  foreach (($catalogs['asegurados'] ?? []) as $vendedor => $asegurados) {
    foreach ((array) $asegurados as $asegurado) {
      $script .= "\nINSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES ('asegurado', " . sqlValue((string) $asegurado) . ", 'vendedor', " . sqlValue((string) $vendedor) . ", '{}', " . (int) $order++ . ");";
    }
  }

  foreach (($catalogs['ramos'] ?? []) as $ramo) {
    $script .= "\nINSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES ('ramo', " . sqlValue((string) $ramo) . ", NULL, NULL, '{}', " . (int) $order++ . ");";
  }

  foreach (($catalogs['subramos'] ?? []) as $ramo => $subramos) {
    foreach ((array) $subramos as $subramo) {
      $script .= "\nINSERT INTO catalog_entries (kind, name, parent_kind, parent_name, meta_json, sort_order) VALUES ('subramo', " . sqlValue((string) $subramo) . ", 'ramo', " . sqlValue((string) $ramo) . ", '{}', " . (int) $order++ . ");";
    }
  }

  foreach ([
    'fields' => $catalogs['fields'] ?? [],
    'sections' => $catalogs['sections'] ?? [],
    'ramoCatalogo' => $catalogs['ramoCatalogo'] ?? [],
    'ramoSchemas' => $catalogs['ramoSchemas'] ?? [],
    'danosEmpresarialesSchema' => $catalogs['danosEmpresarialesSchema'] ?? []
  ] as $name => $payload) {
    $script .= "\nINSERT OR REPLACE INTO catalog_schemas (name, payload_json) VALUES (" . sqlValue($name) . ", " . sqlValue(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ");";
  }

  foreach (($seed['records']['polizas'] ?? []) as $record) {
    $script .= "\nINSERT INTO polizas (id, created_at, linea, gerencia, vendedor, asegurado, ramo, subramo, aseguradora, poliza, extraido, layout_json, ramo_json, attachments_json, notes_json) VALUES ("
      . sqlValue($record['id']) . ', '
      . (int) ($record['created_at'] ?? 0) . ', '
      . sqlValue($record['linea'] ?? '') . ', '
      . sqlValue($record['gerencia'] ?? '') . ', '
      . sqlValue($record['vendedor'] ?? '') . ', '
      . sqlValue($record['asegurado'] ?? '') . ', '
      . sqlValue($record['ramo'] ?? '') . ', '
      . sqlValue($record['subramo'] ?? null) . ', '
      . sqlValue($record['aseguradora'] ?? null) . ', '
      . sqlValue($record['poliza'] ?? null) . ', '
      . (!empty($record['extraido']) ? '1' : '0') . ', '
      . sqlValue(json_encode($record['layout'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ', '
      . sqlValue(json_encode($record['datos'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ', '
      . sqlValue(json_encode($record['archivos'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ', '
      . sqlValue(json_encode($record['noGuardados'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ');';
  }

  $script .= "\nCOMMIT;\n";
  sqliteRun($script);
}

function ensureDatabase(): void {
  if (!is_dir(STORAGE_DIR)) {
    mkdir(STORAGE_DIR, 0775, true);
  }

  sqliteEnsureBootstrap(readSeed());
}

function fetchAll(string $sql): array {
  return sqliteQueryRows($sql);
}

function loadSchemas(): array {
  $rows = fetchAll('SELECT name, payload_json FROM catalog_schemas ORDER BY name ASC');
  $schemas = [];
  foreach ($rows as $row) {
    $schemas[(string) $row['name']] = json_decode((string) ($row['payload_json'] ?? '[]'), true);
  }
  return $schemas;
}

function loadCatalogs(): array {
  $rows = fetchAll('SELECT kind, name, parent_kind, parent_name, meta_json, sort_order FROM catalog_entries ORDER BY sort_order ASC, name ASC');
  $catalogs = [
    'lineas' => [],
    'gerencias' => [],
    'vendedores' => [],
    'asegurados' => [],
    'ramos' => [],
    'subramos' => []
  ];

  foreach ($rows as $row) {
    $kind = (string) $row['kind'];
    $name = (string) $row['name'];

    if ($kind === 'linea') {
      $catalogs['lineas'][] = $name;
      continue;
    }

    if ($kind === 'gerencia') {
      $parent = (string) ($row['parent_name'] ?? '');
      $catalogs['gerencias'][$parent] ??= [];
      $catalogs['gerencias'][$parent][] = $name;
      continue;
    }

    if ($kind === 'vendedor') {
      $parent = (string) ($row['parent_name'] ?? '');
      $catalogs['vendedores'][$parent] ??= [];
      $catalogs['vendedores'][$parent][] = $name;
      continue;
    }

    if ($kind === 'asegurado') {
      $parent = (string) ($row['parent_name'] ?? '');
      $catalogs['asegurados'][$parent] ??= [];
      $catalogs['asegurados'][$parent][] = $name;
      continue;
    }

    if ($kind === 'ramo') {
      $catalogs['ramos'][] = $name;
      continue;
    }

    if ($kind === 'subramo') {
      $parent = (string) ($row['parent_name'] ?? '');
      $catalogs['subramos'][$parent] ??= [];
      $catalogs['subramos'][$parent][] = $name;
    }
  }

  foreach ($catalogs['gerencias'] as &$items) {
    $items = array_values(array_unique($items));
  }
  foreach ($catalogs['vendedores'] as &$items) {
    $items = array_values(array_unique($items));
  }
  foreach ($catalogs['asegurados'] as &$items) {
    $items = array_values(array_unique($items));
  }
  foreach ($catalogs['subramos'] as &$items) {
    $items = array_values(array_unique($items));
  }

  return $catalogs;
}

function loadPolizas(): array {
  $rows = fetchAll('SELECT * FROM polizas ORDER BY created_at DESC');
  $records = [];
  foreach ($rows as $row) {
    $attachments = json_decode((string) ($row['attachments_json'] ?? '[]'), true) ?: [];
    foreach ($attachments as $index => &$attachment) {
      $attachment['downloadUrl'] = '/api.php?action=polizas.download&id=' . rawurlencode((string) $row['id']) . '&index=' . $index;
    }
    unset($attachment);

    $records[] = [
      'id' => (string) $row['id'],
      'fecha' => (int) $row['created_at'],
      'linea' => (string) $row['linea'],
      'gerencia' => (string) $row['gerencia'],
      'vendedor' => (string) $row['vendedor'],
      'asegurado' => (string) $row['asegurado'],
      'ramo' => (string) $row['ramo'],
      'subramo' => $row['subramo'],
      'aseguradora' => $row['aseguradora'],
      'poliza' => $row['poliza'],
      'extraido' => (bool) $row['extraido'],
      'layout' => json_decode((string) ($row['layout_json'] ?? '[]'), true) ?: [],
      'datos' => json_decode((string) ($row['ramo_json'] ?? '{}'), true) ?: [],
      'archivos' => $attachments,
      'noGuardados' => json_decode((string) ($row['notes_json'] ?? '[]'), true) ?: []
    ];
  }
  return $records;
}

function loadAsegurados(): array {
  $rows = fetchAll('SELECT * FROM asegurados ORDER BY created_at DESC');
  return array_map(static function (array $row): array {
    return [
      'id' => (string) $row['id'],
      'fecha' => (int) $row['created_at'],
      'nombre' => (string) $row['nombre'],
      'tipo' => (string) $row['tipo'],
      'apP' => $row['ap_paterno'],
      'apM' => $row['ap_materno'],
      'nombres' => $row['nombres'],
      'razon' => $row['razon_social'],
      'rfc' => $row['rfc'],
      'email' => $row['email'],
      'tel' => $row['telefono'],
      'calle' => $row['calle'],
      'numero' => $row['numero'],
      'cp' => $row['cp'],
      'colonia' => $row['colonia'],
      'municipio' => $row['municipio'],
      'estado' => $row['estado'],
      'giro' => $row['giro'],
      'regimen' => $row['regimen'],
      'linea' => $row['linea'],
      'gerencia' => $row['gerencia'],
      'vendedor' => $row['vendedor'],
      'grupo' => $row['grupo_nombre']
    ];
  }, $rows);
}

function loadGrupos(): array {
  $rows = fetchAll('SELECT * FROM grupos ORDER BY created_at DESC');
  return array_map(static function (array $row): array {
    return [
      'id' => (string) $row['id'],
      'fecha' => (int) $row['created_at'],
      'nombre' => (string) $row['nombre'],
      'linea' => $row['linea'],
      'gerencia' => $row['gerencia'],
      'vendedor' => $row['vendedor'],
      'asegurados' => json_decode((string) ($row['asegurados_json'] ?? '[]'), true) ?: []
    ];
  }, $rows);
}

function loadLog(): array {
  $rows = fetchAll('SELECT * FROM bitacora ORDER BY created_at DESC LIMIT 500');
  return array_map(static function (array $row): array {
    return [
      'id' => (int) $row['id'],
      'ts' => (int) $row['created_at'],
      'evento' => (string) $row['evento'],
      'detalle' => (string) $row['detalle']
    ];
  }, $rows);
}

function writeFileAttachment(string $baseDir, string $recordId, int $index, array $file): array {
  $data = base64_decode((string) ($file['data'] ?? ''), true);
  if ($data === false) {
    throw new RuntimeException('Archivo inválido en base64');
  }

  $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) ($file['name'] ?? 'archivo'));
  $dir = $baseDir . '/uploads/' . $recordId;
  if (!is_dir($dir)) {
    mkdir($dir, 0775, true);
  }

  $fileName = sprintf('%02d_%s', $index, $safeName);
  $filePath = $dir . '/' . $fileName;
  file_put_contents($filePath, $data);

  return [
    'name' => $safeName,
    'type' => (string) ($file['type'] ?? 'application/octet-stream'),
    'cat' => (string) ($file['cat'] ?? 'otros'),
    'path' => str_replace(__DIR__ . '/', '', $filePath),
    'size' => strlen($data)
  ];
}

function logEvent(string $evento, string $detalle): void {
  sqliteRun('BEGIN IMMEDIATE; INSERT INTO bitacora (created_at, evento, detalle) VALUES (' . ((int) (time() * 1000)) . ', ' . sqlValue($evento) . ', ' . sqlValue($detalle) . '); COMMIT;');
}

function ensureGroup(string $nombre, array $context = []): array {
  $nombre = trim(preg_replace('/\s+/', ' ', $nombre));
  if ($nombre === '') {
    throw new RuntimeException('El nombre del grupo es obligatorio');
  }

  $group = sqliteQueryOne('SELECT * FROM grupos WHERE lower(nombre) = lower(' . sqlValue($nombre) . ') LIMIT 1');
  $created = false;

  if (!$group) {
    $created = true;
    $group = [
      'id' => 'G' . str_replace('.', '', (string) microtime(true)),
      'created_at' => time() * 1000,
      'nombre' => $nombre,
      'linea' => $context['linea'] ?? null,
      'gerencia' => $context['gerencia'] ?? null,
      'vendedor' => $context['vendedor'] ?? null,
      'asegurados_json' => '[]'
    ];

    sqliteRun(
      'BEGIN IMMEDIATE; INSERT INTO grupos (id, created_at, nombre, linea, gerencia, vendedor, asegurados_json) VALUES ('
      . sqlValue($group['id']) . ', '
      . (int) $group['created_at'] . ', '
      . sqlValue($group['nombre']) . ', '
      . sqlValue($group['linea']) . ', '
      . sqlValue($group['gerencia']) . ', '
      . sqlValue($group['vendedor']) . ', '
      . sqlValue($group['asegurados_json']) . '); COMMIT;'
    );
  }

  return [$group, $created];
}

function appendGroupMember(string $groupName, string $member, array $context = []): void {
  [$group] = ensureGroup($groupName, $context);
  $members = json_decode((string) ($group['asegurados_json'] ?? '[]'), true);
  if (!is_array($members)) {
    $members = [];
  }

  $members[] = $member;
  $members = array_values(array_unique(array_map(static fn($name) => trim((string) $name), $members)));
  sqliteRun(
    'BEGIN IMMEDIATE; UPDATE grupos SET asegurados_json = ' . sqlValue(json_encode($members, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
    . ', linea = COALESCE(linea, ' . sqlValue($context['linea'] ?? null) . ')'
    . ', gerencia = COALESCE(gerencia, ' . sqlValue($context['gerencia'] ?? null) . ')'
    . ', vendedor = COALESCE(vendedor, ' . sqlValue($context['vendedor'] ?? null) . ')'
    . ' WHERE lower(nombre) = lower(' . sqlValue($groupName) . '); COMMIT;'
  );
}

function bootstrapDatabase(): void {
  ensureDatabase();
}

try {
  bootstrapDatabase();
  $action = $_GET['action'] ?? 'bootstrap';

  if ($action === 'bootstrap') {
    respond([
      'ok' => true,
      'catalogs' => array_merge(
        loadCatalogs(),
        loadSchemas()
      ),
      'records' => [
        'polizas' => loadPolizas(),
        'asegurados' => loadAsegurados(),
        'grupos' => loadGrupos(),
        'log' => loadLog()
      ]
    ]);
  }

  if ($action === 'polizas.download') {
    $id = (string) ($_GET['id'] ?? '');
    $index = (int) ($_GET['index'] ?? 0);
    $row = sqliteQueryOne('SELECT attachments_json FROM polizas WHERE id = ' . sqlValue($id) . ' LIMIT 1');
    if (!$row) {
      respond(['ok' => false, 'error' => 'Póliza no encontrada'], 404);
    }

    $attachments = json_decode((string) ($row['attachments_json'] ?? '[]'), true);
    if (!is_array($attachments) || !isset($attachments[$index]['path'])) {
      respond(['ok' => false, 'error' => 'Archivo no encontrado'], 404);
    }

    $filePath = __DIR__ . '/' . $attachments[$index]['path'];
    if (!file_exists($filePath)) {
      respond(['ok' => false, 'error' => 'Archivo no disponible'], 404);
    }

    header('Content-Type: ' . ($attachments[$index]['type'] ?: 'application/octet-stream'));
    header('Content-Disposition: attachment; filename="' . basename((string) $attachments[$index]['name']) . '"');
    readfile($filePath);
    exit;
  }

  $input = json_decode((string) file_get_contents('php://input'), true);
  if (!is_array($input)) {
    $input = [];
  }

  if ($action === 'polizas.create') {
    $recordId = 'P' . str_replace('.', '', (string) microtime(true));
    $createdAt = (int) ($input['fecha'] ?? (time() * 1000));
    $files = is_array($input['files'] ?? null) ? $input['files'] : [];
    $storedFiles = [];
    foreach ($files as $index => $file) {
      if (!is_array($file) || empty($file['data'])) {
        continue;
      }
      $storedFiles[] = writeFileAttachment(STORAGE_DIR, $recordId, $index, $file);
    }

    sqliteRun(
      'BEGIN IMMEDIATE; INSERT INTO polizas (id, created_at, linea, gerencia, vendedor, asegurado, ramo, subramo, aseguradora, poliza, extraido, layout_json, ramo_json, attachments_json, notes_json) VALUES ('
      . sqlValue($recordId) . ', '
      . $createdAt . ', '
      . sqlValue(trim((string) ($input['linea'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['gerencia'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['vendedor'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['asegurado'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['ramo'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['subramo'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['aseguradora'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['poliza'] ?? ''))) . ', '
      . (!empty($input['extraido']) ? '1' : '0') . ', '
      . sqlValue(json_encode($input['layout'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ', '
      . sqlValue(json_encode($input['datosRamo'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ', '
      . sqlValue(json_encode($storedFiles, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ', '
      . sqlValue(json_encode($input['noGuardados'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . '); COMMIT;'
    );

    logEvent(
      'Póliza registrada',
      trim(implode(' · ', array_filter([
        (string) ($input['aseguradora'] ?? ''),
        (string) ($input['poliza'] ?? ''),
        (string) ($input['asegurado'] ?? ''),
        (string) ($input['linea'] ?? ''),
        (string) ($input['gerencia'] ?? ''),
        (string) ($input['vendedor'] ?? ''),
        (string) ($input['ramo'] ?? '')
      ])))
    );

    respond([
      'ok' => true,
      'record' => [
        'id' => $recordId,
        'fecha' => $createdAt,
        'linea' => (string) ($input['linea'] ?? ''),
        'gerencia' => (string) ($input['gerencia'] ?? ''),
        'vendedor' => (string) ($input['vendedor'] ?? ''),
        'asegurado' => (string) ($input['asegurado'] ?? ''),
        'ramo' => (string) ($input['ramo'] ?? ''),
        'subramo' => (string) ($input['subramo'] ?? ''),
        'aseguradora' => (string) ($input['aseguradora'] ?? ''),
        'poliza' => (string) ($input['poliza'] ?? ''),
        'extraido' => !empty($input['extraido']),
        'layout' => $input['layout'] ?? [],
        'datos' => $input['datosRamo'] ?? [],
        'archivos' => array_map(static function (array $file, int $index) use ($recordId): array {
          $file['downloadUrl'] = '/api.php?action=polizas.download&id=' . rawurlencode($recordId) . '&index=' . $index;
          return $file;
        }, $storedFiles, array_keys($storedFiles)),
        'noGuardados' => $input['noGuardados'] ?? []
      ]
    ]);
  }

  if ($action === 'asegurados.create') {
    $recordId = 'A' . str_replace('.', '', (string) microtime(true));
    $createdAt = (int) ($input['fecha'] ?? (time() * 1000));
    $nombre = trim((string) ($input['nombre'] ?? ''));
    if ($nombre === '') {
      respond(['ok' => false, 'error' => 'El nombre del asegurado es obligatorio'], 422);
    }

    sqliteRun(
      'BEGIN IMMEDIATE; INSERT INTO asegurados (id, created_at, nombre, tipo, ap_paterno, ap_materno, nombres, razon_social, rfc, email, telefono, calle, numero, cp, colonia, municipio, estado, giro, regimen, linea, gerencia, vendedor, grupo_nombre) VALUES ('
      . sqlValue($recordId) . ', '
      . $createdAt . ', '
      . sqlValue($nombre) . ', '
      . sqlValue(trim((string) ($input['tipo'] ?? 'fisica'))) . ', '
      . sqlValue(trim((string) ($input['apP'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['apM'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['nombres'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['razon'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['rfc'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['email'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['tel'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['calle'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['numero'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['cp'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['colonia'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['municipio'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['estado'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['giro'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['regimen'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['linea'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['gerencia'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['vendedor'] ?? ''))) . ', '
      . sqlValue(trim((string) ($input['grupo'] ?? ''))) . '); COMMIT;'
    );

    $grupo = trim((string) ($input['grupo'] ?? ''));
    if ($grupo !== '') {
      appendGroupMember($grupo, $nombre, [
        'linea' => trim((string) ($input['linea'] ?? '')),
        'gerencia' => trim((string) ($input['gerencia'] ?? '')),
        'vendedor' => trim((string) ($input['vendedor'] ?? ''))
      ]);
    }

    logEvent('Asegurado dado de alta', $nombre . ' → ' . trim((string) ($input['vendedor'] ?? '')) . ' (' . trim((string) ($input['gerencia'] ?? '')) . ', ' . trim((string) ($input['linea'] ?? '')) . ')');

    respond([
      'ok' => true,
      'record' => [
        'id' => $recordId,
        'fecha' => $createdAt,
        'nombre' => $nombre,
        'tipo' => trim((string) ($input['tipo'] ?? 'fisica')),
        'apP' => trim((string) ($input['apP'] ?? '')),
        'apM' => trim((string) ($input['apM'] ?? '')),
        'nombres' => trim((string) ($input['nombres'] ?? '')),
        'razon' => trim((string) ($input['razon'] ?? '')),
        'rfc' => trim((string) ($input['rfc'] ?? '')),
        'email' => trim((string) ($input['email'] ?? '')),
        'tel' => trim((string) ($input['tel'] ?? '')),
        'calle' => trim((string) ($input['calle'] ?? '')),
        'numero' => trim((string) ($input['numero'] ?? '')),
        'cp' => trim((string) ($input['cp'] ?? '')),
        'colonia' => trim((string) ($input['colonia'] ?? '')),
        'municipio' => trim((string) ($input['municipio'] ?? '')),
        'estado' => trim((string) ($input['estado'] ?? '')),
        'giro' => trim((string) ($input['giro'] ?? '')),
        'regimen' => trim((string) ($input['regimen'] ?? '')),
        'linea' => trim((string) ($input['linea'] ?? '')),
        'gerencia' => trim((string) ($input['gerencia'] ?? '')),
        'vendedor' => trim((string) ($input['vendedor'] ?? '')),
        'grupo' => $grupo
      ]
    ]);
  }

  if ($action === 'grupos.create') {
    $name = trim((string) ($input['nombre'] ?? ''));
    if ($name === '') {
      respond(['ok' => false, 'error' => 'El nombre del grupo es obligatorio'], 422);
    }
    [$group, $created] = ensureGroup($name, [
      'linea' => trim((string) ($input['linea'] ?? '')),
      'gerencia' => trim((string) ($input['gerencia'] ?? '')),
      'vendedor' => trim((string) ($input['vendedor'] ?? ''))
    ]);

    logEvent($created ? 'Grupo dado de alta' : 'Grupo seleccionado', $name);

    respond([
      'ok' => true,
      'record' => [
        'id' => $group['id'],
        'fecha' => (int) $group['created_at'],
        'nombre' => $group['nombre'],
        'linea' => $group['linea'],
        'gerencia' => $group['gerencia'],
        'vendedor' => $group['vendedor'],
        'asegurados' => json_decode((string) ($group['asegurados_json'] ?? '[]'), true) ?: []
      ]
    ]);
  }

  if ($action === 'log.create') {
    $evento = trim((string) ($input['evento'] ?? 'Evento'));
    $detalle = trim((string) ($input['detalle'] ?? ''));
    logEvent($evento, $detalle);
    respond(['ok' => true]);
  }

  respond(['ok' => false, 'error' => 'Acción no soportada'], 404);
} catch (Throwable $error) {
  respond([
    'ok' => false,
    'error' => $error->getMessage()
  ], 500);
}
