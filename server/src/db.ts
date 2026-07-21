import mysql from 'mysql2/promise';

export type DbConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  socketPath?: string;
  charset: string;
};

let pool: mysql.Pool | null = null;

export function getDbConfig(): DbConfig {
  const env = process.env;
  return {
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    database: env.MYSQL_DATABASE || 'portal_captura_polizas',
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    socketPath: env.MYSQL_SOCKET || '',
    charset: env.MYSQL_CHARSET || 'utf8mb4'
  };
}

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = getDbConfig();
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      charset: config.charset,
      connectionLimit: 4,
      namedPlaceholders: true,
      supportBigNumbers: true,
      dateStrings: true,
      socketPath: config.socketPath || undefined
    });
  }

  return pool;
}

export async function queryRows<T = Record<string, unknown>>(sql: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params as any);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: Record<string, unknown> = {}): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}

export async function exec(sql: string, params: Record<string, unknown> = {}): Promise<void> {
  await getPool().execute(sql, params as any);
}

export async function ensureSchema(): Promise<void> {
  await exec(`
    CREATE TABLE IF NOT EXISTS catalog_entries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      kind VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      parent_kind VARCHAR(32) DEFAULT NULL,
      parent_name VARCHAR(255) DEFAULT NULL,
      meta_json LONGTEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_catalog_entries_kind_parent (kind, parent_kind, parent_name, sort_order, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS catalog_schemas (
      name VARCHAR(255) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS polizas (
      id VARCHAR(64) NOT NULL,
      created_at BIGINT UNSIGNED NOT NULL,
      linea VARCHAR(255) NOT NULL,
      gerencia VARCHAR(255) NOT NULL,
      vendedor VARCHAR(255) NOT NULL,
      asegurado VARCHAR(255) NOT NULL,
      ramo VARCHAR(255) NOT NULL,
      subramo VARCHAR(255) DEFAULT NULL,
      aseguradora VARCHAR(255) DEFAULT NULL,
      poliza VARCHAR(255) DEFAULT NULL,
      extraido TINYINT(1) NOT NULL DEFAULT 0,
      layout_json LONGTEXT NOT NULL,
      ramo_json LONGTEXT NOT NULL,
      attachments_json LONGTEXT NOT NULL,
      notes_json LONGTEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_polizas_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS asegurados (
      id VARCHAR(64) NOT NULL,
      created_at BIGINT UNSIGNED NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      tipo VARCHAR(32) NOT NULL,
      ap_paterno VARCHAR(255) DEFAULT NULL,
      ap_materno VARCHAR(255) DEFAULT NULL,
      nombres VARCHAR(255) DEFAULT NULL,
      razon_social VARCHAR(255) DEFAULT NULL,
      rfc VARCHAR(32) DEFAULT NULL,
      email VARCHAR(255) DEFAULT NULL,
      telefono VARCHAR(64) DEFAULT NULL,
      calle VARCHAR(255) DEFAULT NULL,
      numero VARCHAR(64) DEFAULT NULL,
      cp VARCHAR(32) DEFAULT NULL,
      colonia VARCHAR(255) DEFAULT NULL,
      municipio VARCHAR(255) DEFAULT NULL,
      estado VARCHAR(255) DEFAULT NULL,
      giro VARCHAR(255) DEFAULT NULL,
      regimen VARCHAR(255) DEFAULT NULL,
      linea VARCHAR(255) NOT NULL,
      gerencia VARCHAR(255) NOT NULL,
      vendedor VARCHAR(255) NOT NULL,
      grupo_nombre VARCHAR(255) NOT NULL DEFAULT '',
      PRIMARY KEY (id),
      KEY idx_asegurados_created_at (created_at),
      KEY idx_asegurados_grupo (grupo_nombre)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS grupos (
      id VARCHAR(64) NOT NULL,
      created_at BIGINT UNSIGNED NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      linea VARCHAR(255) DEFAULT NULL,
      gerencia VARCHAR(255) DEFAULT NULL,
      vendedor VARCHAR(255) DEFAULT NULL,
      asegurados_json LONGTEXT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_grupos_nombre (nombre),
      KEY idx_grupos_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS bitacora (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      created_at BIGINT UNSIGNED NOT NULL,
      evento VARCHAR(255) NOT NULL,
      detalle LONGTEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_bitacora_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function tableHasRows(table: string): Promise<boolean> {
  const row = await queryOne<{ total: string }>(`SELECT COUNT(*) AS total FROM \`${table}\``);
  return Number(row?.total || 0) > 0;
}
