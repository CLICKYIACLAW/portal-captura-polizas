import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ALTA_DOCUMENT_TYPES,
  CONSTANCIA_DOCUMENT_ID,
  applyDetectedDocumentType,
  findAltaDocumentType,
  resolveDetectedDocumentType
} from '../src/lib/altaDocumentTypes.js';
import { buildAltaAnthropicPrompt, getAltaMissingKeys, getAltaSaveHint } from '../src/lib/utils.js';

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
    rfc: 'GODE561231GR8',
    curp: 'CURP1234567890123',
    giro: 'Giro',
    regimen: '626 - Régimen Simplificado de Confianza',
    regimenClave: '626',
    usoCfdi: 'G03 - Gastos en general',
    requiereFactura: true,
    ...overrides
  };
}

describe('PR E — alta document type catalog', () => {
  it('exports the four advertised document types in order', () => {
    assert.deepEqual(ALTA_DOCUMENT_TYPES, [
      { id: 'constancia', label: 'Constancia de situación fiscal' },
      { id: 'rfc', label: 'RFC' },
      { id: 'domicilio', label: 'Comprobante de domicilio' },
      { id: 'ine', label: 'INE' }
    ]);
  });

  it('exports the constancia id constant', () => {
    assert.equal(CONSTANCIA_DOCUMENT_ID, 'constancia');
  });

  describe('findAltaDocumentType', () => {
    it('finds a valid id', () => {
      assert.deepEqual(findAltaDocumentType('constancia'), { id: 'constancia', label: 'Constancia de situación fiscal' });
      assert.deepEqual(findAltaDocumentType('ine'), { id: 'ine', label: 'INE' });
    });

    it('returns null for an unknown id', () => {
      assert.equal(findAltaDocumentType('pasaporte'), null);
      assert.equal(findAltaDocumentType('desconocido'), null);
    });

    it('tolerates null, undefined, non-string and whitespace input', () => {
      assert.equal(findAltaDocumentType(null), null);
      assert.equal(findAltaDocumentType(undefined), null);
      assert.equal(findAltaDocumentType(''), null);
      assert.equal(findAltaDocumentType('   '), null);
      assert.equal(findAltaDocumentType(123), null);
    });
  });

  describe('resolveDetectedDocumentType', () => {
    it('resolves each of the four valid types', () => {
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'constancia' } }), 'constancia');
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'rfc' } }), 'rfc');
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'domicilio' } }), 'domicilio');
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'ine' } }), 'ine');
    });

    it('is case-insensitive and trims whitespace', () => {
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'Constancia' } }), 'constancia');
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: '  RFC  ' } }), 'rfc');
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'DOMICILIO' } }), 'domicilio');
    });

    it('returns null for unrecognised document strings', () => {
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'desconocido' } }), null);
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 'pasaporte' } }), null);
    });

    it('returns null without throwing on malformed inputs', () => {
      assert.equal(resolveDetectedDocumentType(null), null);
      assert.equal(resolveDetectedDocumentType(undefined), null);
      assert.equal(resolveDetectedDocumentType([]), null);
      assert.equal(resolveDetectedDocumentType({ documento: null }), null);
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: null } }), null);
      assert.equal(resolveDetectedDocumentType({ documento: { tipo: 123 } }), null);
      assert.equal(resolveDetectedDocumentType({}), null);
    });
  });

  describe('buildAltaAnthropicPrompt', () => {
    it('requests the documento.tipo classification in addition to alta keys', () => {
      const prompt = buildAltaAnthropicPrompt('fisica');
      assert.match(prompt, /"documento":\s*\{\s*"tipo"/);
      assert.match(prompt, /"alta":\s*\{/);
      assert.match(prompt, /"rfc":\s*string \| null/);
      assert.match(prompt, /"curp":\s*string \| null/);
    });

    it('lists the four allowed document type ids', () => {
      const prompt = buildAltaAnthropicPrompt('moral');
      assert.match(prompt, /"constancia"/);
      assert.match(prompt, /"rfc"/);
      assert.match(prompt, /"domicilio"/);
      assert.match(prompt, /"ine"/);
    });
  });

  describe('getAltaMissingKeys constancia gate', () => {
    it('includes documento when factura is required and constancia is absent', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: true }), { hasConstancia: false });
      assert.ok(missing.includes('documento'));
    });

    it('does not include documento when constancia is present', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: true }), { hasConstancia: true });
      assert.ok(!missing.includes('documento'));
    });

    it('does not include documento when factura is not required', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: false }), { hasConstancia: false });
      assert.ok(!missing.includes('documento'));
    });

    it('defaults the option to true so callers are not silently broken', () => {
      const missing = getAltaMissingKeys(baseAlta({ requiereFactura: true }));
      assert.ok(!missing.includes('documento'));
    });
  });

  describe('getAltaSaveHint', () => {
    it('mentions constancia de situación fiscal when document is missing', () => {
      const hint = getAltaSaveHint(baseAlta({ requiereFactura: true }), { hasConstancia: false });
      assert.ok(hint.toLowerCase().includes('constancia de situación fiscal'));
    });
  });
});

describe('PR E — App.jsx gates on docType, not on the mere presence of a file', () => {
  it('uses CONSTANCIA_DOCUMENT_ID and docType for the save/complete gates', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /import\s+\{[^}]*CONSTANCIA_DOCUMENT_ID[^}]*\}\s+from\s+['"]\.\/lib\/altaDocumentTypes['"]/);
    assert.match(appSource, /docType\s*===\s*CONSTANCIA_DOCUMENT_ID/);
    assert.match(appSource, /hasConstancia:\s*altaDocumentFile\?\.docType\s*===\s*CONSTANCIA_DOCUMENT_ID/);
    assert.doesNotMatch(appSource, /hasConstancia:\s*Boolean\(altaDocumentFile\)/);
    assert.doesNotMatch(appSource, /hasDocument:\s*Boolean\(altaDocumentFile\)/);
  });

  it('keeps docType initialised to empty on every new file selection', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(
      appSource,
      /setAltaDocumentFile\(\{\s*file,\s*name:\s*file\.name,\s*type:\s*file\.type,\s*sizeMb:[^,]*,\s*cat:[^,]*,\s*docType:\s*['"]['"],\s*docTypeSource:\s*['"]['"][\s\S]*?\}\)/
    );
  });

  it('marks a manual change as user-sourced in the component', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /docTypeSource:\s*['"]user['"]/);
  });

  it('marks an AI detection as ai-sourced in the pure module', async () => {
    // The 'ai' source is assigned by applyDetectedDocumentType, not inline in App.jsx,
    // so the stale-closure guard can be unit tested.
    const libSource = await readFile(new URL('../src/lib/altaDocumentTypes.js', import.meta.url), 'utf8');
    assert.match(libSource, /docTypeSource:\s*['"]ai['"]/);
  });

  it('applies the AI detection inside the state updater, not from a stale closure', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    // The selector stays enabled while the AI read is in flight, so the
    // user-choice guard must read the freshest state from the updater argument.
    assert.match(
      appSource,
      /setAltaDocumentFile\(\(current\) => applyDetectedDocumentType\(current, detectedType\)\)/,
      'expected readAltaDocument to funnel the detection through applyDetectedDocumentType inside the updater'
    );
    assert.doesNotMatch(
      appSource,
      /altaDocumentFile\?\.docTypeSource !== ['"]user['"]/,
      'expected no stale-closure read of altaDocumentFile.docTypeSource'
    );
  });
});

describe('PR E — applyDetectedDocumentType (stale-choice guard)', () => {
  it('applies an AI detection when no type was chosen yet', () => {
    const current = { name: 'doc.pdf', docType: '', docTypeSource: '' };
    const next = applyDetectedDocumentType(current, 'constancia');
    assert.equal(next.docType, 'constancia');
    assert.equal(next.docTypeSource, 'ai');
  });

  it('overwrites a previous AI guess with a newer one', () => {
    const current = { docType: 'ine', docTypeSource: 'ai' };
    const next = applyDetectedDocumentType(current, 'constancia');
    assert.equal(next.docType, 'constancia');
    assert.equal(next.docTypeSource, 'ai');
  });

  it('never overwrites a choice the user already made', () => {
    const current = { docType: 'ine', docTypeSource: 'user' };
    const next = applyDetectedDocumentType(current, 'constancia');
    assert.strictEqual(next, current);
    assert.equal(next.docType, 'ine');
    assert.equal(next.docTypeSource, 'user');
  });

  it('is a no-op when there is no detection or no file', () => {
    const current = { docType: '', docTypeSource: '' };
    assert.strictEqual(applyDetectedDocumentType(current, null), current);
    assert.strictEqual(applyDetectedDocumentType(current, ''), current);
    assert.equal(applyDetectedDocumentType(null, 'constancia'), null);
    assert.equal(applyDetectedDocumentType(undefined, 'constancia'), undefined);
  });
});
