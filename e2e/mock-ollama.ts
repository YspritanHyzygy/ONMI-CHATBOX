import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const port = Number(process.env.MOCK_OLLAMA_PORT || 4114);
const model = 'onmi-e2e:latest';

function writeJson(response: ServerResponse, payload: unknown, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/tags') {
      writeJson(response, {
        models: [{ name: model, model, size: 1, modified_at: '2026-01-01T00:00:00.000Z' }]
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/chat') {
      const body = await readJson(request);
      if (body.model !== model) {
        writeJson(response, { error: 'Unknown E2E model' }, 404);
        return;
      }

      const content = 'Mock ONMI response';
      if (body.stream === true) {
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        response.write(`${JSON.stringify({ model, message: { role: 'assistant', content }, done: false })}\n`);
        // Intentionally omit the final newline to exercise the stream parser's
        // valid unterminated-final-record behavior.
        response.end(JSON.stringify({
          model,
          message: { role: 'assistant', content: '' },
          done: true,
          prompt_eval_count: 4,
          eval_count: 3
        }));
        return;
      }

      writeJson(response, {
        model,
        message: { role: 'assistant', content },
        done: true,
        prompt_eval_count: 4,
        eval_count: 3
      });
      return;
    }

    writeJson(response, { error: 'Mock Ollama route not found' }, 404);
  } catch {
    writeJson(response, { error: 'Invalid mock request' }, 400);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ONMI E2E mock Ollama ready at http://127.0.0.1:${port}`);
});

const close = () => server.close();
process.once('SIGTERM', close);
process.once('SIGINT', close);
