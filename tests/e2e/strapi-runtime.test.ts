import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDefinition } from '../../src/core/contracts/flow.js';
import { FlowOrchestrator } from '../../src/core/orchestrator/flow-orchestrator.js';
import { AdapterRegistry } from '../../src/adapter/registry.js';

describe('Strapi-compatible Chromium runtime', () => {
  let server: http.Server;
  let baseUrl: string;
  let artifactsDir: string;

  beforeAll(async () => {
    AdapterRegistry.registerDefaultExecutors();
    artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'intentproof-strapi-browser-'));
    server = http.createServer((request, response) => {
      if (request.url === '/fail') {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end('{"error":"synthetic"}');
        return;
      }
      if (request.url === '/policy') {
        response.end(`<!doctype html><body><main id="ready">Policy page</main><div id="policy-complete" hidden>Complete</div><script>
          fetch('/fail').then(() => {
            console.error('synthetic console failure');
            setTimeout(() => { throw new Error('synthetic page failure'); }, 0);
            setTimeout(() => { document.querySelector('#policy-complete').hidden = false; }, 20);
          });
        </script></body>`);
        return;
      }
      response.end(`<!doctype html><body>
        <form><label id="category-label">Category</label>
          <button type="button" role="combobox" aria-labelledby="category-label" aria-expanded="false">Choose category</button>
          <output data-testid="selected-category">None</output>
        </form>
        <script>
          const combo = document.querySelector('[role=combobox]');
          combo.addEventListener('click', () => {
            combo.setAttribute('aria-expanded', 'true');
            const list = document.createElement('div');
            list.setAttribute('role', 'listbox');
            list.innerHTML = '<button type="button" role="option">News</button>';
            document.body.append(list);
            list.querySelector('[role=option]').addEventListener('click', () => {
              document.querySelector('output').textContent = 'News';
              combo.textContent = 'News';
              combo.setAttribute('aria-expanded', 'false');
              list.remove();
            });
          });
        </script>
      </body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (artifactsDir) await fs.rm(artifactsDir, { recursive: true, force: true });
  });

  it('selects an option from a listbox portaled outside the form', async () => {
    const result = await verify({
      id: 'portal.combobox', name: 'Portal combobox', priority: 'high', roles: [], tags: [],
      preconditions: [{ route: '/' }],
      steps: [{ action: 'select_option', target: { role: 'combobox', name: 'Category', exact: true }, value: 'News' }],
      assertions: [{ type: 'text_equals', target: { testId: 'selected-category' }, value: 'News' }],
      evidence: { checkpoints: [] },
    });
    expect(result.status, result.error).toBe('PROVEN');
  });

  it('fails on console, page and HTTP 500 errors and writes global evidence', async () => {
    const result = await verify({
      id: 'policy.failure', name: 'Policy failure', priority: 'high', roles: [], tags: [],
      preconditions: [{ route: '/policy' }],
      steps: [{ action: 'wait', target: '#policy-complete' }],
      assertions: [{ type: 'element_visible', target: '#ready' }],
      evidence: { checkpoints: [] },
    });
    expect(result.status).toBe('FAILED');
    expect(result.policyViolations?.map((item) => item.source)).toEqual(expect.arrayContaining(['console', 'pageerror', 'http']));
    expect(result.artifacts.screenshots).toEqual(expect.arrayContaining(['evidence/failure.png', 'evidence/failure-full-page.png']));
    expect(result.artifacts.trace).toBe('trace/trace.zip');
    const root = path.join(artifactsDir, result.executionId);
    for (const relative of ['evidence/failure.png', 'evidence/failure-full-page.png', 'evidence/page.html', 'evidence/accessibility.json', 'trace/trace.zip', 'logs/console.log', 'logs/network.log', 'result.json', 'summary.md']) {
      expect((await fs.stat(path.join(root, relative))).isFile()).toBe(true);
    }
  });

  it('reports screenshot capture warnings without replacing the original failure', async () => {
    const result = await verify({
      id: 'evidence.partial', name: 'Partial evidence', priority: 'high', roles: [], tags: [],
      preconditions: [{ route: '/' }],
      steps: [{ action: 'click', target: { role: 'button', name: 'Missing button', exact: true }, timeoutMs: 100 }],
      assertions: [{ type: 'element_visible', target: 'body' }],
      evidence: { checkpoints: [] },
    }, { screenshotMaskTargets: [{ selector: '[' }] });
    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('Missing button');
    expect(result.error).not.toContain('Screenshot');
    expect(result.artifactWarnings?.some((warning) => warning.includes('Screenshot'))).toBe(true);
    const persisted = JSON.parse(await fs.readFile(path.join(artifactsDir, result.executionId, 'result.json'), 'utf8'));
    expect(persisted.artifactWarnings.length).toBeGreaterThan(0);
  });

  async function verify(flow: FlowDefinition, options: Record<string, unknown> = {}) {
    return new FlowOrchestrator({ config: { baseUrl, artifactsDir, options: { timeoutMs: 2000, recordTrace: true, ...options } } }).verifyFlow(flow);
  }
});
