import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ALTA_DOCUMENT_TYPES,
  CONSTANCIA_DOCUMENT_ID,
  applyConstanciaReadResult,
  applyDetectedDocumentType,
  findAltaDocumentType,
  getConstanciaClaimStatus,
  hasConstanciaDocument,
  isConstanciaVerified,
  markConstanciaReadAttempted,
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

describe('PR E - verified constancia helpers', () => {
  describe('isConstanciaVerified', () => {
    it('requires AI confirmation or an explicit override, never a manual label alone', () => {
      assert.equal(isConstanciaVerified({ aiDetectedType: CONSTANCIA_DOCUMENT_ID }), true);
      assert.equal(isConstanciaVerified({ aiDetectedType: 'ine', overrideConfirmed: true }), true);
      assert.equal(isConstanciaVerified({ overrideConfirmed: true }), true);
      assert.equal(isConstanciaVerified({ aiDetectedType: 'ine' }), false);
      assert.equal(isConstanciaVerified({ aiDetectedType: null }), false);
      assert.equal(isConstanciaVerified({ docType: CONSTANCIA_DOCUMENT_ID }), false);
    });

    it('tolerates null, undefined, and non-object input', () => {
      assert.equal(isConstanciaVerified(null), false);
      assert.equal(isConstanciaVerified(undefined), false);
      assert.equal(isConstanciaVerified('constancia'), false);
    });
  });

  describe('hasConstanciaDocument', () => {
    it('accepts an AI-verified general entry', () => {
      assert.equal(hasConstanciaDocument({ aiDetectedType: CONSTANCIA_DOCUMENT_ID }, null), true);
    });

    it('accepts an explicitly overridden dedicated entry', () => {
      assert.equal(hasConstanciaDocument(null, { overrideConfirmed: true }), true);
    });

    it('rejects present but unverified entries and missing entries', () => {
      assert.equal(hasConstanciaDocument({ docType: CONSTANCIA_DOCUMENT_ID }, { aiDetectedType: 'ine' }), false);
      assert.equal(hasConstanciaDocument(null, null), false);
      assert.equal(hasConstanciaDocument(undefined, undefined), false);
    });
  });

  describe('getConstanciaClaimStatus', () => {
    it('describes verified, conflicting, unverified, and absent general claims', () => {
      assert.equal(getConstanciaClaimStatus({ aiDetectedType: CONSTANCIA_DOCUMENT_ID }), 'verified');
      assert.equal(getConstanciaClaimStatus({ docType: CONSTANCIA_DOCUMENT_ID, aiDetectedType: 'ine' }), 'conflict');
      assert.equal(getConstanciaClaimStatus({ docType: CONSTANCIA_DOCUMENT_ID, aiDetectedType: null }), 'unverified');
      assert.equal(getConstanciaClaimStatus({ docType: 'ine', aiDetectedType: 'ine' }), 'none');
    });

    it('tolerates null and undefined input', () => {
      assert.equal(getConstanciaClaimStatus(null), 'none');
      assert.equal(getConstanciaClaimStatus(undefined), 'none');
    });
  });
});

describe('PR E — App.jsx gates through hasConstanciaDocument', () => {
  it('uses the helper with both files for the save/complete/hint gates', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /import\s+\{[^}]*hasConstanciaDocument[^}]*\}\s+from\s+['"]\.\/lib\/altaDocumentTypes['"]/);
    assert.match(appSource, /hasConstancia:\s*hasVerifiedConstancia/);
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
      /setAltaDocumentFile\(\(current\) => \{[\s\S]*?current\.file !== file[\s\S]*?applyConstanciaReadResult\([\s\S]*?applyDetectedDocumentType\(current, detectedType\)[\s\S]*?\}\)/,
      'expected readAltaDocument to funnel the detection through applyConstanciaReadResult inside the updater, guarded by file identity'
    );
    assert.match(
      appSource,
      /setAltaConstanciaFile\(\(current\) => applyConstanciaReadResult\(current, file, detectedType\)\)/,
      'expected the dedicated constancia read to record its verdict through the same identity-guarded helper'
    );
    assert.doesNotMatch(
      appSource,
      /aiDetectedType:\s*detectedType/,
      'expected the verdict to be recorded only by the identity-guarded helper, never assigned inline'
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

describe('PR E - constancia verification UI source contracts', () => {
  it('gates each override checkbox behind an attempted AI read', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /altaDocumentFile\?\.docType\s*===\s*CONSTANCIA_DOCUMENT_ID\s*&&\s*altaDocumentFile\.aiReadAttempted\s*&&\s*!isConstanciaVerified/);
    assert.match(appSource, /altaConstanciaFile\s*&&\s*altaConstanciaFile\.aiReadAttempted\s*&&\s*!isConstanciaVerified/);
  });

  it('provides a dedicated classification action and resets verification state on new files', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /async function readAltaConstancia\(\)/);
    assert.match(appSource, /onClick=\{readAltaConstancia\}/);
    assert.match(appSource, /cat:\s*['"]alta-constancia['"],[\s\S]*?aiDetectedType:\s*null,[\s\S]*?aiReadAttempted:\s*false,[\s\S]*?overrideConfirmed:\s*false/);
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
  it('renders the uploaded constancia row and Quitar button regardless of verification state', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const fiscalStart = appSource.indexOf('{alta.requiereFactura ? (');
    const rowStart = appSource.indexOf('{altaConstanciaFile ? (', fiscalStart);
    assert.ok(rowStart > fiscalStart, 'expected the uploaded-constancia row in the fiscal block');
    assert.ok(appSource.indexOf('setAltaConstanciaFile(null)', rowStart) > rowStart);
  });
});

describe('PR F — an AI verdict never lands on a file it did not read', () => {
  const fileA = { name: 'a.pdf' };
  const fileB = { name: 'b.pdf' };

  it('applies the verdict while the entry still holds the file that was read', () => {
    const current = { file: fileA, aiDetectedType: null, aiReadAttempted: false, overrideConfirmed: false };
    const next = applyConstanciaReadResult(current, fileA, 'constancia');
    assert.equal(next.aiDetectedType, 'constancia');
    assert.equal(next.aiReadAttempted, true);
  });

  it('discards the verdict when the file was swapped mid-read', () => {
    const current = { file: fileB, aiDetectedType: null, aiReadAttempted: false, overrideConfirmed: false };
    const next = applyConstanciaReadResult(current, fileA, 'constancia');
    assert.strictEqual(next, current);
    assert.equal(next.aiDetectedType, null);
    assert.equal(next.aiReadAttempted, false);
    assert.equal(isConstanciaVerified(next), false);
  });

  it('records a null verdict as attempted so the override unlocks', () => {
    const current = { file: fileA, aiDetectedType: null, aiReadAttempted: false };
    const next = applyConstanciaReadResult(current, fileA, null);
    assert.equal(next.aiDetectedType, null);
    assert.equal(next.aiReadAttempted, true);
    assert.equal(isConstanciaVerified(next), false);
  });

  it('merges an extra patch without losing the verdict fields', () => {
    const current = { file: fileA, docType: '', docTypeSource: '' };
    const next = applyConstanciaReadResult(current, fileA, 'ine', { docType: 'ine', docTypeSource: 'ai' });
    assert.equal(next.docType, 'ine');
    assert.equal(next.docTypeSource, 'ai');
    assert.equal(next.aiDetectedType, 'ine');
    assert.equal(next.aiReadAttempted, true);
  });

  it('is a no-op on missing entries or a missing read file', () => {
    assert.equal(applyConstanciaReadResult(null, fileA, 'constancia'), null);
    assert.equal(applyConstanciaReadResult(undefined, fileA, 'constancia'), undefined);
    const current = { file: fileA };
    assert.strictEqual(applyConstanciaReadResult(current, null, 'constancia'), current);
  });

  it('markConstanciaReadAttempted only marks the entry holding the read file', () => {
    const same = { file: fileA, aiReadAttempted: false };
    assert.equal(markConstanciaReadAttempted(same, fileA).aiReadAttempted, true);

    const swapped = { file: fileB, aiReadAttempted: false };
    assert.strictEqual(markConstanciaReadAttempted(swapped, fileA), swapped);
    assert.equal(swapped.aiReadAttempted, false);

    assert.equal(markConstanciaReadAttempted(null, fileA), null);
  });
});

describe('PR F — a read that never reaches the AI must not unlock the override', () => {
  it('bails out before recording an attempt when no API key is available', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

    // Both reads must return early on a missing key. Recording an attempt there
    // would let a user dismiss the key prompt and then self-certify a document
    // the AI never analysed, which is exactly the bypass this flow prevents.
    assert.match(
      appSource,
      /function ensureAnthropicKeyForVerification\(\)/,
      'expected a guard that refuses the read when no API key is configured'
    );

    for (const fn of ['readAltaDocument', 'readAltaConstancia']) {
      const start = appSource.indexOf(`async function ${fn}(`);
      assert.ok(start !== -1, `expected to find ${fn}`);
      const body = appSource.slice(start, start + 900);
      const guardOffset = body.indexOf('ensureAnthropicKeyForVerification()');
      const attemptOffset = body.indexOf('markConstanciaReadAttempted');
      assert.ok(guardOffset !== -1, `expected ${fn} to check the API key before reading`);
      assert.ok(
        attemptOffset === -1 || guardOffset < attemptOffset,
        `expected ${fn} to bail out on a missing key before any attempt is recorded`
      );
    }
  });
});
