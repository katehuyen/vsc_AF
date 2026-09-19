// Shared local endpoints for the X-117 end-to-end tests — just enough of the
// Anthropic Messages API for the real `claude` CLI to finish a turn. Not a test
// file itself (no `test_` prefix), so `run-all` does not run it.
'use strict';
const http = require('http');
const cp = require('child_process');

/** Is this CLI on PATH? The E2E files skip, not fail, when it is not. */
function cliPresent(name) {
    try {
        cp.execSync(process.platform === 'win32' ? `where ${name}` : `command -v ${name}`, { stdio: 'ignore' });
        return true;
    } catch { return false; }
}

/**
 * A local Anthropic endpoint. `answerAs` is the model name it answers under —
 * a gateway's own name for what it serves — defaulting to what was asked for.
 * Every request is kept: method, url, `x-api-key`, `authorization`, model.
 */
function anthropicMock(answerAs) {
    const hits = [];
    const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', d => { body += d; }).on('end', () => {
            let j = {};
            try { j = JSON.parse(body); } catch { /* HEAD /api/hello has no body */ }
            hits.push({ method: req.method, url: req.url, key: req.headers['x-api-key'] || '',
                auth: req.headers['authorization'] || '', model: j.model || '' });
            if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) { res.writeHead(200); res.end('{}'); return; }
            if (req.url.startsWith('/v1/messages/count_tokens')) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ input_tokens: 12 }));
                return;
            }
            const model = answerAs || j.model || 'mock';
            if (!j.stream) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model,
                    content: [{ type: 'text', text: 'pong' }], stop_reason: 'end_turn', stop_sequence: null,
                    usage: { input_tokens: 12, output_tokens: 3 } }));
                return;
            }
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify(d)}\n\n`);
            ev('message_start', { type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant',
                model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } });
            ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
            ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'pong' } });
            ev('content_block_stop', { type: 'content_block_stop', index: 0 });
            ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } });
            ev('message_stop', { type: 'message_stop' });
            res.end();
        });
    });
    return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({
        url: `http://127.0.0.1:${srv.address().port}`, hits,
        posts: () => hits.filter(h => h.method === 'POST' && h.url.startsWith('/v1/messages')),
        close: () => new Promise(r => srv.close(r))
    })));
}

module.exports = { cliPresent, anthropicMock };
