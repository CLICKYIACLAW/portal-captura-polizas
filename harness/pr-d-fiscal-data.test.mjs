import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REGIMENES_FISCALES,
  USOS_CFDI,
  formatRegimenOption,
  formatUsoCfdiOption,
  findClosestRegimen,
  findRegimenByClave,
  getUsosCfdiParaRegimen
} from '../src/lib/satCatalog.js';
import {
  getAltaRequiredKeys,
  getAltaMissingKeys,
  getAltaInvalidKeys,
  isAltaComplete,
  getAltaSaveHint,
  mapAltaExtraction
} from '../src/lib/utils.js';
import { selectAltaRegimen } from '../src/App.jsx';

describe('PR D — SAT fiscal catalogs', () => {
  describe('formatRegimenOption', () => {
    it('renders "clave - nombre"', () => {
      assert.equal(formatRegimenOption({ clave: '626', nombre: 'Régimen Simplificado de Confianza' }), '626 - Régimen Simplificado de Confianza');
    });
  });

  describe('formatUsoCfdiOption', () => {
    it('renders "clave - nombre"', () => {
      assert.equal(formatUsoCfdiOption({ clave: 'G03', nombre: 'Gastos en general' }), 'G03 - Gastos en general');
    });
  });

  describe('findRegimenByClave', () => {
    it('finds RESICO by clave 626', () => {
      const result = findRegimenByClave('626');
      assert.ok(result);
      assert.equal(result.clave, '626');
      assert.equal(result.nombre, 'Régimen Simplificado de Confianza');
    });

    it('trims whitespace and stringifies input', () => {
      const result = findRegimenByClave('  601  ');
      assert.ok(result);
      assert.equal(result.clave, '601');
    });

    it('returns null for unknown clave', () => {
      assert.equal(findRegimenByClave('999'), null);
    });

    it('returns null for empty/null input', () => {
      assert.equal(findRegimenByClave(''), null);
      assert.equal(findRegimenByClave(null), null);
      assert.equal(findRegimenByClave(undefined), null);
    });
  });

  describe('getUsosCfdiParaRegimen', () => {
    it('for 626 includes S01, CP01 and G/I/G03 but not CN01 or D01', () => {
      const result = getUsosCfdiParaRegimen('626');
      const claves = result.map((u) => u.clave);
      assert.ok(claves.includes('S01'));
      assert.ok(claves.includes('CP01'));
      assert.ok(claves.includes('G03'));
      assert.ok(claves.includes('I01'));
      assert.ok(!claves.includes('CN01'));
      assert.ok(!claves.includes('D01'));
    });

    it('for 605 includes CN01 and D-group plus the universal codes', () => {
      const result = getUsosCfdiParaRegimen('605');
      const claves = result.map((u) => u.clave);
      assert.ok(claves.includes('CN01'));
      assert.ok(claves.includes('D01'));
      assert.ok(claves.includes('S01'));
      assert.ok(claves.includes('CP01'));
    });

    it('for 610 (no G/I/D matches) returns only S01 and CP01', () => {
      const result = getUsosCfdiParaRegimen('610');
      const claves = result.map((u) => u.clave);
      assert.deepEqual(claves.sort(), ['CP01', 'S01']);
    });

    it('returns empty array for empty, null or undefined regimen', () => {
      assert.deepEqual(getUsosCfdiParaRegimen(''), []);
      assert.deepEqual(getUsosCfdiParaRegimen(null), []);
      assert.deepEqual(getUsosCfdiParaRegimen(undefined), []);
    });

    it('exposes every catalog entry with a regimenes array', () => {
      for (const uso of USOS_CFDI) {
        assert.ok(Array.isArray(uso.regimenes));
      }
    });

    it('REGIMENES_FISCALES contains the expected regimes', () => {
      const claves = REGIMENES_FISCALES.map((r) => r.clave);
      assert.ok(claves.includes('601'));
      assert.ok(claves.includes('626'));
      assert.ok(!claves.includes('999'));
    });
  });
});

describe('§5 — findClosestRegimen resolves free text to a catalogue entry', () => {
  describe('rule 1 — an explicit three-digit clave wins', () => {
    it('accepts a bare clave', () => {
      assert.equal(findClosestRegimen('626')?.clave, '626');
      assert.equal(findClosestRegimen('601')?.clave, '601');
    });

    it('accepts a clave embedded in the usual SAT rendering', () => {
      assert.equal(findClosestRegimen('626 - Régimen Simplificado de Confianza')?.clave, '626');
      assert.equal(findClosestRegimen('Régimen fiscal: 605 Sueldos y salarios')?.clave, '605');
    });

    it('ignores three-digit numbers that are not claves', () => {
      assert.equal(findClosestRegimen('123'), null);
      assert.equal(findClosestRegimen('Calle 5 de Mayo 123, Col. Centro'), null);
    });
  });

  describe('rule 2 — name matching', () => {
    it('matches the exact catalogue name, accent and case insensitively', () => {
      assert.equal(findClosestRegimen('Régimen Simplificado de Confianza')?.clave, '626');
      assert.equal(findClosestRegimen('regimen simplificado de confianza')?.clave, '626');
      assert.equal(findClosestRegimen('  REGIMEN   SIMPLIFICADO  DE CONFIANZA  ')?.clave, '626');
      assert.equal(findClosestRegimen('Arrendamiento')?.clave, '606');
    });

    it('matches when the catalogue name is contained in the text', () => {
      assert.equal(findClosestRegimen('Régimen de Incorporación Fiscal')?.clave, '621');
      assert.equal(findClosestRegimen('Contribuyente en Arrendamiento de inmuebles')?.clave, '606');
    });

    it('matches when the text is contained in the catalogue name', () => {
      assert.equal(findClosestRegimen('Sueldos y Salarios')?.clave, '605');
      assert.equal(findClosestRegimen('Actividades Empresariales y Profesionales')?.clave, '612');
    });

    it('falls back to token overlap above the confidence threshold', () => {
      assert.equal(findClosestRegimen('Personas Morales con Fines Lucrativos no')?.clave, '603');
      assert.equal(findClosestRegimen('Opcional Grupos Sociedades')?.clave, '623');
    });
  });

  describe('rule 3 — never guess when uncertain', () => {
    it('returns null for unrelated text', () => {
      assert.equal(findClosestRegimen('Ciudad de México'), null);
      assert.equal(findClosestRegimen('Servicios de consultoría en informática'), null);
      assert.equal(findClosestRegimen('GODE561231GR8'), null);
    });

    it('returns null when only filler or a single weak token overlaps', () => {
      assert.equal(findClosestRegimen('de la los por con'), null);
      assert.equal(findClosestRegimen('ingresos'), null);
      assert.equal(findClosestRegimen('régimen'), null);
    });

    it('returns null for empty, blank and non-string input', () => {
      assert.equal(findClosestRegimen(''), null);
      assert.equal(findClosestRegimen('   '), null);
      assert.equal(findClosestRegimen(null), null);
      assert.equal(findClosestRegimen(undefined), null);
      assert.equal(findClosestRegimen({}), null);
      assert.equal(findClosestRegimen([]), null);
    });
  });

  it('always returns a real catalogue entry', () => {
    const match = findClosestRegimen('Régimen Simplificado de Confianza');
    assert.ok(REGIMENES_FISCALES.includes(match));
  });
});

describe('§5 — mapAltaExtraction resolves the extracted régimen', () => {
  function extractionBase(overrides = {}) {
    return { tipo: 'fisica', regimen: '', regimenClave: '', giro: '', ...overrides };
  }

  it('writes the canonical display string and the clave', () => {
    const next = mapAltaExtraction(extractionBase(), {
      alta: { regimen: 'Régimen Simplificado de Confianza' }
    });
    assert.equal(next.regimen, '626 - Régimen Simplificado de Confianza');
    assert.equal(next.regimenClave, '626');
  });

  it('resolves a clave-prefixed extraction to the same canonical pair', () => {
    const next = mapAltaExtraction(extractionBase(), { alta: { regimen: '601' } });
    assert.equal(next.regimen, '601 - General de Ley Personas Morales');
    assert.equal(next.regimenClave, '601');
  });

  it('leaves both fields empty rather than storing unusable free text', () => {
    const next = mapAltaExtraction(extractionBase(), {
      alta: { regimen: 'no se pudo determinar', giro: 'Comercio' }
    });
    assert.equal(next.regimen, '');
    assert.equal(next.regimenClave, '');
    assert.equal(next.giro, 'Comercio');
  });

  it('never overwrites a régimen the user already picked', () => {
    const current = extractionBase({
      regimen: '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios',
      regimenClave: '605'
    });
    const next = mapAltaExtraction(current, { alta: { regimen: 'Arrendamiento' } });
    assert.equal(next.regimen, '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios');
    assert.equal(next.regimenClave, '605');
  });

  it('never overwrites a clave the user already picked, even with an empty display', () => {
    const current = extractionBase({ regimen: '', regimenClave: '626' });
    const next = mapAltaExtraction(current, { alta: { regimen: 'Arrendamiento' } });
    assert.equal(next.regimenClave, '626');
    assert.equal(next.regimen, '');
  });

  it('leaves the régimen untouched when the extraction has none', () => {
    const next = mapAltaExtraction(extractionBase(), { alta: { giro: 'Comercio' } });
    assert.equal(next.regimen, '');
    assert.equal(next.regimenClave, '');
  });
});

function baseAlta(overrides = {}) {
  return {
    tipo: 'fisica',
    vendedor: 'Vendedor',
    grupo: 'Grupo',
    email: 'a@b.co',
    tel: '5551234567',
    calle: 'Calle',
    numero: '1',
    cp: '01000',
    colonia: 'Colonia',
    municipio: 'Municipio',
    estado: 'Estado',
    apP: 'Paterno',
    apM: 'Materno',
    nombres: 'Nombre',
    rfc: '',
    curp: '',
    giro: '',
    regimen: '',
    regimenClave: '',
    usoCfdi: '',
    requiereFactura: false,
    ...overrides
  };
}

describe('PR D — alta conditional required/invalid logic', () => {
  describe('getAltaRequiredKeys', () => {
    it('includes fiscal keys only when requiereFactura is true', () => {
      const without = getAltaRequiredKeys(baseAlta({ requiereFactura: false }));
      const withFactura = getAltaRequiredKeys(baseAlta({ requiereFactura: true }));

      assert.ok(!without.includes('rfc'));
      assert.ok(!without.includes('curp'));
      assert.ok(!without.includes('giro'));
      assert.ok(!without.includes('regimenClave'));
      assert.ok(!without.includes('usoCfdi'));

      assert.ok(withFactura.includes('rfc'));
      assert.ok(withFactura.includes('curp'));
      assert.ok(withFactura.includes('giro'));
      assert.ok(withFactura.includes('regimenClave'));
      assert.ok(withFactura.includes('usoCfdi'));
    });

    it('still includes shared and name fields regardless of factura', () => {
      const keys = getAltaRequiredKeys(baseAlta({ requiereFactura: true }));
      assert.ok(keys.includes('vendedor'));
      assert.ok(keys.includes('email'));
      assert.ok(keys.includes('apP'));
      assert.ok(keys.includes('nombres'));
    });

    it('uses moral name fields when tipo is moral', () => {
      const keys = getAltaRequiredKeys(baseAlta({ tipo: 'moral', requiereFactura: false }));
      assert.ok(keys.includes('razon'));
      assert.ok(!keys.includes('apP'));
    });
  });

  describe('getAltaMissingKeys', () => {
    it('lists fiscal keys only when requiereFactura is true and they are empty', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: true }));
      assert.ok(missing.includes('rfc'));
      assert.ok(missing.includes('usoCfdi'));
    });

    it('does not list fiscal keys when requiereFactura is false even if empty', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: false }));
      assert.ok(!missing.includes('rfc'));
      assert.ok(!missing.includes('usoCfdi'));
    });

    it('does not list fiscal keys when they are filled', () => {
      const missing = getAltaMissingKeys(baseAlta({
        requiereFactura: true,
        rfc: 'XAXX010101000',
        curp: 'CURP1234567890123',
        giro: 'Giro',
        regimen: '626 - Régimen Simplificado de Confianza',
        regimenClave: '626',
        usoCfdi: 'G03 - Gastos en general'
      }));
      assert.ok(!missing.includes('rfc'));
      assert.ok(!missing.includes('curp'));
      assert.ok(!missing.includes('giro'));
      assert.ok(!missing.includes('regimenClave'));
      assert.ok(!missing.includes('usoCfdi'));
    });

    it('reports regimenClave missing when only free-text regimen is present (OCR)', () => {
      const missing = getAltaMissingKeys(baseAlta({
        requiereFactura: true,
        rfc: 'XAXX010101000',
        curp: 'CURP1234567890123',
        giro: 'Giro',
        regimen: '626 - Régimen Simplificado de Confianza',
        regimenClave: '',
        usoCfdi: 'G03 - Gastos en general'
      }));
      assert.ok(!missing.includes('regimen'));
      assert.ok(missing.includes('regimenClave'));
    });

    it('adds synthetic documento key when requiereFactura && !hasConstancia', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: true }), { hasConstancia: false });
      assert.ok(missing.includes('documento'));
    });

    it('does not add documento when requiereFactura is false', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: false }), { hasConstancia: false });
      assert.ok(!missing.includes('documento'));
    });

    it('does not add documento when hasConstancia is true', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: true }), { hasConstancia: true });
      assert.ok(!missing.includes('documento'));
    });

    it('defaults hasConstancia to true so callers are not silently broken', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: true }));
      assert.ok(!missing.includes('documento'));
    });
  });

  describe('getAltaInvalidKeys', () => {
    it('flags a non-empty invalid RFC as invalid', () => {
      const invalid = getAltaInvalidKeys(baseAlta({ rfc: 'INVALID123' }));
      assert.ok(invalid.includes('rfc'));
    });

    it('does not flag an empty RFC as invalid', () => {
      const invalid = getAltaInvalidKeys(baseAlta({ rfc: '' }));
      assert.ok(!invalid.includes('rfc'));
    });

    it('does not flag a valid RFC as invalid', () => {
      const invalid = getAltaInvalidKeys(baseAlta({ rfc: 'GODE561231GR8' }));
      assert.ok(!invalid.includes('rfc'));
    });

    it('still flags invalid email and phone', () => {
      assert.ok(getAltaInvalidKeys(baseAlta({ email: 'bad' })).includes('email'));
      assert.ok(getAltaInvalidKeys(baseAlta({ tel: '123' })).includes('tel'));
    });
  });

  describe('isAltaComplete', () => {
    it('returns false when fiscal keys are required but empty', () => {
      assert.equal(isAltaComplete(baseAlta({ requiereFactura: true })), false);
    });

    it('returns true when requiereFactura is false and base fields are complete', () => {
      assert.equal(isAltaComplete(baseAlta({ requiereFactura: false })), true);
    });

    it('returns false when constancia is required but missing', () => {
      const alta = baseAlta({ requiereFactura: true, rfc: 'GODE561231GR8', curp: 'CURP', giro: 'G', regimen: '626 - X', regimenClave: '626', usoCfdi: 'G03 - X' });
      assert.equal(isAltaComplete(alta, { hasConstancia: false }), false);
    });

    it('returns true when constancia is required and present', () => {
      const alta = baseAlta({ requiereFactura: true, rfc: 'GODE561231GR8', curp: 'CURP', giro: 'G', regimen: '626 - X', regimenClave: '626', usoCfdi: 'G03 - X' });
      assert.equal(isAltaComplete(alta, { hasConstancia: true }), true);
    });
  });

  describe('getAltaSaveHint', () => {
    it('mentions uso de CFDI when it is the only missing field', () => {
      const hint = getAltaSaveHint(baseAlta({
        requiereFactura: true,
        rfc: 'GODE561231GR8',
        curp: 'CURP1234567890123',
        giro: 'Giro',
        regimen: '626 - Régimen Simplificado de Confianza',
        regimenClave: '626'
      }));
      assert.ok(hint.toLowerCase().includes('uso de cfdi'));
    });

    it('mentions constancia de situación fiscal when constancia is missing', () => {
      const hint = getAltaSaveHint(baseAlta({
        requiereFactura: true,
        rfc: 'GODE561231GR8',
        curp: 'CURP1234567890123',
        giro: 'Giro',
        regimen: '626 - Régimen Simplificado de Confianza',
        regimenClave: '626',
        usoCfdi: 'G03 - Gastos en general'
      }), { hasConstancia: false });
      assert.ok(hint.toLowerCase().includes('constancia de situación fiscal'));
    });
  });
});

describe('PR D — selectAltaRegimen clears an incompatible uso de CFDI', () => {
  it('keeps usoCfdi when it is still compatible with the newly selected regimen', () => {
    const current = baseAlta({
      regimen: '626 - Régimen Simplificado de Confianza',
      regimenClave: '626',
      usoCfdi: 'G03 - Gastos en general'
    });
    // 606 (Arrendamiento) is also G/I-compatible, so G03 stays valid.
    const next = selectAltaRegimen(current, '606 - Arrendamiento');
    assert.equal(next.regimenClave, '606');
    assert.equal(next.usoCfdi, 'G03 - Gastos en general');
  });

  it('clears usoCfdi when it is no longer compatible with the newly selected regimen', () => {
    const current = baseAlta({
      regimen: '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios',
      regimenClave: '605',
      usoCfdi: 'CN01 - Nómina'
    });
    // CN01 (Nómina) is only valid for 605; switching to 601 must drop it.
    const next = selectAltaRegimen(current, '601 - General de Ley Personas Morales');
    assert.equal(next.regimenClave, '601');
    assert.equal(next.usoCfdi, '');
  });

  it('clears usoCfdi when the new regimen is unknown', () => {
    const current = baseAlta({ regimen: '626 - X', regimenClave: '626', usoCfdi: 'G03 - Gastos en general' });
    const next = selectAltaRegimen(current, 'texto libre no catalogado');
    assert.equal(next.regimenClave, '');
    assert.equal(next.usoCfdi, '');
  });

  it('leaves usoCfdi empty when it was already empty', () => {
    const current = baseAlta({ regimen: '', regimenClave: '', usoCfdi: '' });
    const next = selectAltaRegimen(current, '601 - General de Ley Personas Morales');
    assert.equal(next.usoCfdi, '');
  });
});

describe('PR D — Alta fiscal-data UI source scan', () => {
  it('contains the "¿Requiere factura?" switch and a Uso de CFDI combo', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /¿Requiere factura\?/);
    assert.match(appSource, /Uso de CFDI/);
    assert.match(appSource, /getUsosCfdiParaRegimen/);
    assert.match(appSource, /REGIMENES_FISCALES/);
  });

  it('renders required marks on fiscal fields conditionally', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const fiscalStart = appSource.indexOf('>Datos fiscales</div>');
    assert.ok(fiscalStart !== -1, 'expected Datos fiscales section');
    const fiscalEnd = appSource.indexOf('{altaHint ?', fiscalStart);
    const region = appSource.slice(fiscalStart, fiscalEnd);

    assert.match(region, /¿Requiere factura\?/);
    assert.match(region, /RFC \{alta\.requiereFactura \? <span className="required-mark">\*<\/span> : null\}/);
    assert.match(region, /<label>CURP \{alta\.requiereFactura \? <span className="required-mark">\*<\/span> : null\}/);
    assert.match(region, /<label>Giro \{alta\.requiereFactura \? <span className="required-mark">\*<\/span> : null\}/);
    assert.match(region, /label=\{alta\.requiereFactura \? 'Régimen fiscal \*' : 'Régimen fiscal'\}/);
    assert.match(region, /label="Uso de CFDI \*"/);

    // No unconditional required-mark in the fiscal section: every
    // required-mark must be preceded (in this region) by alta.requiereFactura.
    const requiredMarkChunks = region.split('required-mark');
    requiredMarkChunks.shift();
    assert.ok(
      requiredMarkChunks.every((chunk) => chunk.includes('alta.requiereFactura')),
      'expected every fiscal required-mark to be gated by alta.requiereFactura'
    );
  });

  it('resets altaDocumentFile when starting a fresh alta', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(
      appSource,
      /function saveAlta\(.*?\)\s*\{[\s\S]*?setAlta\(emptyAlta\(\)\);\s*setAltaDocumentFile\(null\);/,
      'expected saveAlta success path to clear alta and altaDocumentFile together'
    );
    // There are two "Limpiar" buttons (capture tab and alta tab). Pick the alta
    // one by the reset it performs, and assert on the handler body rather than
    // its exact closing braces, so adding another reset call does not break this.
    const limpiarOffsets = [...appSource.matchAll(/Limpiar/g)].map((match) => match.index);
    const altaLimpiar = limpiarOffsets.find((offset) =>
      appSource.slice(Math.max(0, offset - 400), offset).includes('setAltaDocumentFile(null);')
    );
    assert.ok(altaLimpiar !== undefined, 'expected to find the alta Limpiar handler');
    const limpiarHandler = appSource.slice(Math.max(0, altaLimpiar - 400), altaLimpiar);
    assert.match(limpiarHandler, /setAlta\(emptyAlta\(\)\);/, 'expected Limpiar handler to reset alta');
    assert.match(
      limpiarHandler,
      /setAltaDocumentFile\(null\);/,
      'expected Limpiar handler to clear altaDocumentFile'
    );
  });

  it('clears altaDocumentFile on logout so a document cannot leak to the next user', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const logoutStart = appSource.indexOf('function handleLogout(');
    assert.ok(logoutStart !== -1, 'expected to find handleLogout');
    const logoutBody = appSource.slice(logoutStart, appSource.indexOf('\n  }', logoutStart));
    assert.match(
      logoutBody,
      /setAltaDocumentFile\(null\);/,
      'expected handleLogout to clear altaDocumentFile, otherwise the uploaded constancia survives a session change and silently satisfies the factura document gate for the next user'
    );
  });

  it('sends requiereFactura in the saveAlta payload', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const payloadMatch = appSource.match(/const payload = \{[\s\S]*?\};/);
    assert.ok(payloadMatch, 'expected to find saveAlta payload object');
    assert.match(
      payloadMatch[0],
      /requiereFactura:\s*alta\.requiereFactura,/,
      'expected payload to include requiereFactura'
    );
  });
});
