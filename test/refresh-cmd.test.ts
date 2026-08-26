import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { loadCache } from '../lib/cache-core.js';
import refreshCmd from '../lib/refresh-cmd.js';
import { resolveTokenPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-config.json');

const CATALOG = {
  layers: [{ id: 0, name: 'Parcels', type: 'Feature Layer' }],
  tables: [],
};

describe('refresh-cmd', () => {
  useTempStateDir();

  let server: http.Server;
  let serviceUrl: string;
  let requests: http.IncomingMessage[];
  let originalEnv: string | undefined;
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  before(async () => {
    server = http.createServer(
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
        });
        req.on('end', () => {
          (req as unknown as { bodyParams: URLSearchParams }).bodyParams =
            new URLSearchParams(raw);
          requests.push(req);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(CATALOG));
        });
      }
    );
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serviceUrl = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    requests = [];

    originalEnv = process.env.ARCQ_CONFIG;
    delete process.env.ARCQ_CONFIG;
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);

    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args) => logs.push(args.join(' '));
    console.error = (...args) => errors.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;

    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }

    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
  });

  function writeConfig(services: Record<string, string>) {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ services }));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
  }

  it('saves an empty cache when config has no services', async () => {
    await refreshCmd();
    expect(loadCache()).to.deep.equal({});
  });

  it('fetches the catalog for each configured service', async () => {
    writeConfig({ 'my-service': serviceUrl });
    await refreshCmd();
    expect(requests).to.have.length(1);
  });

  it('saves fetched layers under the service name in the cache', async () => {
    writeConfig({ 'my-service': serviceUrl });
    await refreshCmd();
    expect(loadCache()['my-service']).to.deep.equal([
      { id: 0, name: 'Parcels', type: 'Feature Layer', url: `${serviceUrl}/0` },
    ]);
  });

  it('fetches all configured services', async () => {
    writeConfig({ 'service-a': serviceUrl, 'service-b': serviceUrl });
    await refreshCmd();
    expect(requests).to.have.length(2);
    expect(loadCache()).to.have.keys('service-a', 'service-b');
  });

  it('logs indexing progress for each service to stderr', async () => {
    writeConfig({ 'my-service': serviceUrl });
    await refreshCmd();
    expect(errors.join(' ')).to.include('my-service');
  });

  it('logs "[arcq] cache updated" to stdout when done', async () => {
    await refreshCmd();
    expect(logs.join(' ')).to.include('cache updated');
  });

  it('passes the stored token with each request', async () => {
    fs.writeFileSync(resolveTokenPath(), 'refresh-token');
    writeConfig({ 'my-service': serviceUrl });
    await refreshCmd();
    const params = (requests[0] as unknown as { bodyParams: URLSearchParams })
      .bodyParams;
    expect(params.get('token')).to.equal('refresh-token');
  });
});
