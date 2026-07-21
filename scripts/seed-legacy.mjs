import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(process.argv[2] || process.cwd());
const legacyPath = path.join(root, 'legacy', 'index-monolith.html');
const outPath = path.join(root, 'storage', 'bootstrap.json');

function extractJsValue(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=`, 'm'));
  if (!match || typeof match.index !== 'number') {
    throw new Error(`No se encontró ${name} en el monolito legado`);
  }

  let i = match.index + match[0].length;
  while (/\s/.test(source[i])) i += 1;

  const open = source[i];
  const close = ({ '{': '}', '[': ']', '(': ')', '"': '"', "'": "'", '`': '`' })[open];
  if (!close) {
    throw new Error(`No se pudo detectar el bloque de ${name}`);
  }

  let depth = 0;
  let inString = null;
  let escaped = false;

  for (let j = i; j < source.length; j += 1) {
    const ch = source[j];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (open === '{' || open === '[' || open === '(') {
      if (ch === open) depth += 1;
      if (ch === close) {
        depth -= 1;
        if (depth === 0) return source.slice(i, j + 1);
      }
    } else if (ch === close) {
      return source.slice(i, j + 1);
    }
  }

  throw new Error(`No se pudo cerrar el bloque de ${name}`);
}

function evalValue(code) {
  return vm.runInNewContext(`(${code})`, {}, { timeout: 3000 });
}

const source = fs.readFileSync(legacyPath, 'utf8');
const data = evalValue(extractJsValue(source, 'DATA'));
const gerencias = evalValue(extractJsValue(source, 'GERENCIAS_CATALOGO'));
const fields = evalValue(extractJsValue(source, 'FIELDS'));
const sections = evalValue(extractJsValue(source, 'SECTIONS'));
const ramoCatalogo = evalValue(extractJsValue(source, 'RAMO_CATALOGO'));
const ramoSchemas = evalValue(extractJsValue(source, 'RAMO_SCHEMAS'));
const danosEmpresarialesSchema = evalValue(extractJsValue(source, 'DANOS_EMPRESARIALES_SCHEMA'));

const ramos = Object.entries(ramoCatalogo)
  .sort((a, b) => a[1].idRamo - b[1].idRamo)
  .map(([name]) => name);

const subramos = Object.fromEntries(
  Object.entries(ramoCatalogo).map(([name, info]) => [
    name,
    Array.isArray(info.subramos) ? info.subramos.map((item) => item.subramo) : []
  ])
);

const seed = {
  catalogs: {
    lineas: Array.isArray(data.lineas) ? data.lineas : [],
    gerencias,
    vendedores: data.vendedores || {},
    asegurados: data.asegurados || {},
    ramos,
    subramos,
    ramoCatalogo,
    ramoSchemas,
    danosEmpresarialesSchema,
    fields,
    sections
  },
  records: {
    polizas: [],
    asegurados: [],
    grupos: [],
    log: []
  }
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(seed, null, 2));

console.log(`Seed generado en ${outPath}`);
