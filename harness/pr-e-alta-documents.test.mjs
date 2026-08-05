/**
 * Alta documents after the classification feature was dropped.
 *
 * The general "Documento del asegurado (opcional)" upload still feeds the AI
 * extraction, and the dedicated constancia upload is pure storage: no type
 * selector, no AI verification, no override. This file keeps the coverage of
 * everything that survived that removal (it replaces pr-e-document-type.test.mjs)
 * and pins the removal itself so the feature cannot creep back.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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

async function readAppSource() {
  return readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
}

describe('§4 — the document classification feature is gone', () => {
  it('deletes src/lib/altaDocumentTypes.js', async () => {
    await assert.rejects(
      () => access(new URL('../src/lib/altaDocumentTypes.js', import.meta.url)),
      'expected src/lib/altaDocumentTypes.js to be deleted'
    );
  });

  it('leaves no import of the deleted module', async () => {
    const appSource = await readAppSource();
    assert.doesNotMatch(appSource, /altaDocumentTypes/);
  });

  it('drops the type selector and everything that fed it', async () => {
    const appSource = await readAppSource();
    assert.doesNotMatch(appSource, /ALTA_DOCUMENT_TYPES/);
    assert.doesNotMatch(appSource, /CONSTANCIA_DOCUMENT_ID/);
    assert.doesNotMatch(appSource, /docTypeSource/);
    assert.doesNotMatch(appSource, /docType/);
    assert.doesNotMatch(appSource, /¿Qué documento es\?/);
  });

  it('drops the whole verification apparatus', async () => {
    const appSource = await readAppSource();
    for (const symbol of [
      'isConstanciaVerified',
      'getConstanciaClaimStatus',
      'applyConstanciaReadResult',
      'markConstanciaReadAttempted',
      'applyDetectedDocumentType',
      'resolveDetectedDocumentType',
      'hasConstanciaDocument',
      'aiDetectedType',
      'aiReadAttempted',
      'overrideConfirmed',
      'ensureAnthropicKeyForVerification',
      'readAltaConstancia'
    ]) {
      assert.doesNotMatch(appSource, new RegExp(symbol), `expected ${symbol} to be removed`);
    }
  });

  it('stops asking the AI to classify the document', async () => {
    const prompt = buildAltaAnthropicPrompt('fisica');
    assert.doesNotMatch(prompt, /"documento"/);
    assert.doesNotMatch(prompt, /"tipo"/);
    assert.doesNotMatch(prompt, /Clasifica/);
  });
});

describe('§4 — the general document upload keeps working unchanged', () => {
  it('still asks the AI for every alta key', () => {
    const fisica = buildAltaAnthropicPrompt('fisica');
    assert.match(fisica, /"alta":\s*\{/);
    assert.match(fisica, /"apP":\s*string \| null/);
    assert.match(fisica, /"rfc":\s*string \| null/);
    assert.match(fisica, /"curp":\s*string \| null/);
    assert.match(fisica, /"regimen":\s*string \| null/);
    assert.doesNotMatch(fisica, /"razon"/);

    const moral = buildAltaAnthropicPrompt('moral');
    assert.match(moral, /"razon":\s*string \| null/);
    assert.doesNotMatch(moral, /"apP"/);
  });

  it('does not narrow the dropzone copy: all four documents stay advertised', async () => {
    const appSource = await readAppSource();
    assert.match(appSource, /Sube RFC, constancia de situación fiscal, comprobante de domicilio o INE/);
    assert.doesNotMatch(appSource, /alta\.requiereFactura\s*\?\s*['"]Sube la constancia de situación fiscal['"]/);
  });

  it('keeps the section heading as "Documento del asegurado (opcional)"', async () => {
    const appSource = await readAppSource();
    assert.match(appSource, /Documento del asegurado \(opcional\)/);
    assert.doesNotMatch(
      appSource,
      /alta\.requiereFactura\s*\?\s*['"]Constancia de situación fiscal['"]\s*:\s*['"]Documento del asegurado['"]/
    );
  });

  it('keeps the "Leer documento" AI extraction on the general upload', async () => {
    const appSource = await readAppSource();
    assert.match(appSource, /async function readAltaDocument\(\)/);
    assert.match(appSource, /onClick=\{readAltaDocument\}/);
    assert.match(appSource, /setAlta\(\(current\) => mapAltaExtraction\(current, result\)\)/);
  });
});

describe('§4 — the dedicated constancia upload is storage only', () => {
  it('declares altaConstanciaFile state and a setter', async () => {
    const appSource = await readAppSource();
    assert.match(appSource, /const\s+\[altaConstanciaFile,\s*setAltaConstanciaFile\]\s*=\s*useState\(null\)/);
  });

  it('renders the dedicated slot whenever factura is required, unconditionally', async () => {
    const appSource = await readAppSource();
    const start = appSource.indexOf('{alta.requiereFactura ? (');
    assert.ok(start !== -1, 'expected the factura-gated constancia block');
    const block = appSource.slice(start, appSource.indexOf('<div className="ramo-grid alta-grid">', start));

    assert.match(block, /Sube la constancia de situación fiscal/);
    assert.match(block, /setAltaConstanciaFile\(\{/);
    assert.doesNotMatch(block, /Leer documento/, 'the constancia must not offer an AI read');
    assert.doesNotMatch(block, /final-confirmation/, 'the constancia must not offer a manual override');
  });

  it('stores nothing but the file metadata', async () => {
    const appSource = await readAppSource();
    assert.match(
      appSource,
      /setAltaConstanciaFile\(\{\s*file,\s*name:\s*file\.name,\s*type:\s*file\.type,\s*sizeMb:[^,]*,\s*cat:\s*['"]alta-constancia['"]\s*\}\)/
    );
  });

  it('keeps the file row with its Quitar button', async () => {
    const appSource = await readAppSource();
    const rowStart = appSource.indexOf('{altaConstanciaFile ? (');
    assert.ok(rowStart !== -1, 'expected the uploaded-constancia row');
    assert.ok(appSource.indexOf('setAltaConstanciaFile(null)', rowStart) > rowStart);
  });

  it('gates completeness on the file being present, nothing more', async () => {
    const appSource = await readAppSource();
    assert.match(appSource, /const hasAltaConstancia = Boolean\(altaConstanciaFile\)/);
    assert.match(appSource, /hasConstancia:\s*hasAltaConstancia/);
  });
});

describe('§4 — the completeness gate itself is unchanged', () => {
  it('includes documento when factura is required and the constancia is absent', () => {
    assert.ok(getAltaMissingKeys(baseAlta({ requiereFactura: true }), { hasConstancia: false }).includes('documento'));
  });

  it('does not include documento when the constancia is present', () => {
    assert.ok(!getAltaMissingKeys(baseAlta({ requiereFactura: true }), { hasConstancia: true }).includes('documento'));
  });

  it('does not include documento when factura is not required', () => {
    assert.ok(!getAltaMissingKeys(baseAlta({ requiereFactura: false }), { hasConstancia: false }).includes('documento'));
  });

  it('defaults the option to true so callers are not silently broken', () => {
    assert.ok(!getAltaMissingKeys(baseAlta({ requiereFactura: true })).includes('documento'));
  });

  it('names the constancia in the save hint when it is missing', () => {
    const hint = getAltaSaveHint(baseAlta({ requiereFactura: true }), { hasConstancia: false });
    assert.ok(hint.toLowerCase().includes('constancia de situación fiscal'));
  });
});

describe('§4 — reset paths still clear both uploads', () => {
  it('clears altaConstanciaFile alongside altaDocumentFile everywhere', async () => {
    const appSource = await readAppSource();
    const occurrences = (appSource.match(/setAltaConstanciaFile\(null\)/g) || []).length;
    assert.equal(occurrences, 4, 'expected logout, saveAlta and Limpiar plus the Quitar button');
    assert.match(appSource, /function handleLogout[\s\S]*?setAltaDocumentFile\(null\)[\s\S]*?setAltaConstanciaFile\(null\)/);
    assert.match(appSource, /setAlta\(emptyAlta\(\)\);\s*setAltaDocumentFile\(null\);\s*setAltaConstanciaFile\(null\);/);
    assert.match(appSource, /Limpiar[\s\S]*?setAltaConstanciaFile\(null\)/);
  });
});
