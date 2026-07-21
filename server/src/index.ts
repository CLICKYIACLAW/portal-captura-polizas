import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import { bootstrapDatabase, createAsegurado, createGrupo, createLog, createPoliza, getAttachmentResponse, handleBootstrap } from './bootstrap.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res: http.ServerResponse, status: number, payload: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache'
  });
  res.end(payload);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 50 * 1024 * 1024) {
      throw new Error('El cuerpo excede el tamaño permitido');
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const action = url.searchParams.get('action') || 'bootstrap';

  try {
    if (method === 'GET' && action === 'bootstrap') {
      const payload = await handleBootstrap();
      sendJson(res, 200, payload);
      return;
    }

    if (method === 'GET' && action === 'polizas.download') {
      const id = url.searchParams.get('id') || '';
      const index = Number(url.searchParams.get('index') || 0);
      const attachment = await getAttachmentResponse(id, index);
      if (!attachment) {
        sendJson(res, 404, { ok: false, error: 'Archivo no disponible' });
        return;
      }

      const fileStat = await stat(attachment.filePath).catch(() => null);
      if (!fileStat) {
        sendJson(res, 404, { ok: false, error: 'Archivo no disponible' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': attachment.contentType,
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `attachment; filename="${attachment.filePath.split('/').pop() || 'archivo'}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
      createReadStream(attachment.filePath).pipe(res);
      return;
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      if (action === 'polizas.create') {
        const payload = await createPoliza(body);
        sendJson(res, 200, payload);
        return;
      }
      if (action === 'asegurados.create') {
        const payload = await createAsegurado(body);
        sendJson(res, 200, payload);
        return;
      }
      if (action === 'grupos.create') {
        const payload = await createGrupo(body);
        sendJson(res, 200, payload);
        return;
      }
      if (action === 'log.create') {
        const payload = await createLog(body);
        sendJson(res, 200, payload);
        return;
      }
    }

    if (url.pathname === '/health') {
      sendText(res, 200, 'ok');
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Acción no soportada' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado';
    sendJson(res, 500, { ok: false, error: message });
  }
}

async function main(): Promise<void> {
  await bootstrapDatabase();
  const server = http.createServer((req, res) => {
    void route(req, res);
  });

  server.listen(port, host, () => {
    console.log(`Portal Captura Polizas API listening on http://${host}:${port}`);
  });
}

void main();
