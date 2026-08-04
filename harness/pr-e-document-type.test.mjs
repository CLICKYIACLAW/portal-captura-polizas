import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ALTA_DOCUMENT_TYPES,
  CONSTANCIA_DOCUMENT_ID,
  applyDetectedDocumentType,
  findAltaDocumentType,
  hasConstanciaDocument,
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

describe('PR E — hasConstanciaDocument helper', () => {
  it('returns true when the general document is a constancia and there is no second file', () => {
    assert.equal(hasConstanciaDocument({ docType: CONSTANCIA_DOCUMENT_ID }, null), true);
  });

  it('returns true when the general document is an INE but the constancia slot has a file', () => {
    assert.equal(hasConstanciaDocument({ docType: 'ine' }, { cat: 'alta-constancia' }), true);
  });

  it('returns false when the general document is an INE and the constancia slot is empty', () => {
    assert.equal(hasConstanciaDocument({ docType: 'ine' }, null), false);
  });

  it('returns false without throwing when both arguments are null or undefined', () => {
    assert.equal(hasConstanciaDocument(null, null), false);
    assert.equal(hasConstanciaDocument(undefined, undefined), false);
    assert.equal(hasConstanciaDocument(null, undefined), false);
  });

  it('returns false when a file exists but its docType is empty and there is no constancia slot file', () => {
    assert.equal(hasConstanciaDocument({ docType: '' }, null), false);
  });
});

describe('PR E — App.jsx gates through hasConstanciaDocument', () => {
  it('uses the helper with both files for the save/complete/hint gates', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /import\s+\{[^}]*hasConstanciaDocument[^}]*\}\s+from\s+['"]\.\/lib\/altaDocumentTypes['"]/);
    assert.match(appSource, /hasConstancia:\s*hasConstanciaDocument\(altaDocumentFile,\s*altaConstanciaFile\)/);
    assert.doesNotMatch(appSource, /hasConstancia:\s*altaDocumentFile\?\.docType\s*===\s*CONSTANCIA_DOCUMENT_ID/);
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

describe('PR E — general document dropzone copy', () => {
  it('advertises all four accepted documents unconditionally', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /Sube RFC, constancia de situación fiscal, comprobante de domicilio o INE/);
    assert.doesNotMatch(appSource, /alta\.requiereFactura\s*\?\s*['"]Sube la constancia de situación fiscal['"]/);
  });

  it('keeps the section heading as "Documento del asegurado (opcional)" regardless of factura', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /Documento del asegurado \(opcional\)/);
    assert.doesNotMatch(
      appSource,
      /alta\.requiereFactura\s*\?\s*['"]Constancia de situación fiscal['"]\s*:\s*['"]Documento del asegurado['"]/
    );
  });
});

describe('PR E — dedicated constancia upload slot', () => {
  it('declares altaConstanciaFile state and a setter', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /const\s+\[altaConstanciaFile,\s*setAltaConstanciaFile\]\s*=\s*useState\(null\)/);
  });

  it('renders the dedicated slot only when factura is required', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /alta\.requiereFactura\s*\?\s*\([\s\S]*?setAltaConstanciaFile[\s\S]*?\)\s*:\s*null/);
  });

  it('shows a confirmation pill when the general upload already is a constancia', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /altaDocumentFile\?\.docType\s*===\s*CONSTANCIA_DOCUMENT_ID/);
    assert.match(appSource, /<span\s+className=["']pill tone-ok["']>[\s\S]*?constancia[\s\S]*?<\/span>/);
  });

  it('has its own file input that populates altaConstanciaFile', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /<input\s+type=["']file["'][\s\S]*?onChange=\{\s*\(event\)\s*=>\s*\{[\s\S]*?setAltaConstanciaFile/);
  });

  it('has a Quitar button that clears the dedicated constancia file', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /onClick=\{\s*\(\)\s*=>\s*setAltaConstanciaFile\(null\)\s*\}/);
  });
});

describe('PR E — reset calls keep the dedicated file from leaking across records', () => {
  it('clears altaConstanciaFile alongside altaDocumentFile in every reset path', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const occurrences = (appSource.match(/setAltaConstanciaFile\(null\)/g) || []).length;
    assert.equal(occurrences, 4, 'expected three reset paths plus the dedicated-slot Quitar button');
    assert.match(appSource, /function handleLogout[\s\S]*?setAltaDocumentFile\(null\)[\s\S]*?setAltaConstanciaFile\(null\)/);
    assert.match(appSource, /setAlta\(emptyAlta\(\)\);\s*setAltaDocumentFile\(null\);\s*setAltaConstanciaFile\(null\);/);
    assert.match(appSource, /Limpiar[\s\S]*?setAltaConstanciaFile\(null\)/);
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

describe('PR E — a separately uploaded constancia stays removable', () => {
  it('renders the uploaded constancia row outside the already-satisfied branch', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const blockStart = appSource.indexOf('{alta.requiereFactura ? (');
    assert.ok(blockStart !== -1, 'expected to find the fiscal constancia block');
    const block = appSource.slice(blockStart, blockStart + 3000);

    const pillOffset = block.indexOf('ya cargada arriba');
    const removeOffset = block.indexOf('setAltaConstanciaFile(null)');
    assert.ok(pillOffset !== -1, 'expected the already-uploaded confirmation pill');
    assert.ok(removeOffset !== -1, 'expected a control that clears altaConstanciaFile');

    // The remove control must NOT be nested in the else branch of the pill, or a
    // file uploaded here becomes invisible and unremovable the moment the general
    // document is typed as a constancia.
    const elseBranchStart = block.indexOf(') : (', pillOffset);
    const elseBranchEnd = block.indexOf('\n                )}', elseBranchStart);
    assert.ok(
      removeOffset < elseBranchStart || removeOffset > elseBranchEnd,
      'expected the uploaded-constancia row and its Quitar button to render regardless of the general document type'
    );
  });
});
