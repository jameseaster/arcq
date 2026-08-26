import * as chai from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import syncCmd from '../lib/sync-cmd.js';
import type { Config } from '../lib/types.js';
import { resolveTokenPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-sync-config.json');

const CATALOG = {
  layers: [
    { id: 0, name: 'Parcel Data', type: 'Feature Layer' },
    { id: 1, name: 'Road Centerlines', type: 'Feature Layer' },
  ],
  tables: [{ id: 2, name: 'Ownership Records' }],
};

describe('sync-cmd', () => {
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
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
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

  function writeConfig(config: Config) {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify(config));
  }

  it('writes layer keys as servicename-layername to the config', async () => {
    writeConfig({ services: { 'my-service': serviceUrl } });
    await syncCmd();
    const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
    expect(config.layers).to.include.keys('my-service-parcel-data');
    expect(config.layers!['my-service-parcel-data']).to.equal(
      `${serviceUrl}/0`
    );
  });

  it('slugifies layer names (lowercase, non-alphanumeric to hyphens)', async () => {
    writeConfig({ services: { 'my-service': serviceUrl } });
    await syncCmd();
    const { layers } = JSON.parse(
      fs.readFileSync(TEMP_CONFIG, 'utf-8')
    ) as Config;
    expect(layers).to.have.keys(
      'my-service-parcel-data',
      'my-service-road-centerlines',
      'my-service-ownership-records'
    );
  });

  it('includes tables alongside layers', async () => {
    writeConfig({ services: { 'my-service': serviceUrl } });
    await syncCmd();
    const { layers } = JSON.parse(
      fs.readFileSync(TEMP_CONFIG, 'utf-8')
    ) as Config;
    expect(layers).to.include.keys('my-service-ownership-records');
    expect(layers!['my-service-ownership-records']).to.equal(`${serviceUrl}/2`);
  });

  it('overwrites the existing layers section', async () => {
    writeConfig({
      services: { 'my-service': serviceUrl },
      layers: { 'old-key': 'https://example.com/old' },
    });
    await syncCmd();
    const { layers } = JSON.parse(
      fs.readFileSync(TEMP_CONFIG, 'utf-8')
    ) as Config;
    expect(layers).to.not.have.keys('old-key');
  });

  it('preserves the services section', async () => {
    writeConfig({ services: { 'my-service': serviceUrl } });
    await syncCmd();
    const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
    expect(config.services).to.deep.equal({ 'my-service': serviceUrl });
  });

  it('handles multiple services', async () => {
    writeConfig({ services: { alpha: serviceUrl, beta: serviceUrl } });
    await syncCmd();
    const { layers } = JSON.parse(
      fs.readFileSync(TEMP_CONFIG, 'utf-8')
    ) as Config;
    expect(layers).to.include.keys('alpha-parcel-data');
    expect(layers).to.include.keys('beta-parcel-data');
  });

  it('writes an empty layers object when no services are configured', async () => {
    writeConfig({});
    await syncCmd();
    const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
    expect(config.layers).to.deep.equal({});
  });

  it('passes the stored token with each request', async () => {
    fs.writeFileSync(resolveTokenPath(), 'sync-token');
    writeConfig({ services: { 'my-service': serviceUrl } });
    await syncCmd();
    const params = (requests[0] as unknown as { bodyParams: URLSearchParams })
      .bodyParams;
    expect(params.get('token')).to.equal('sync-token');
  });

  it('logs progress per service to stderr', async () => {
    writeConfig({ services: { 'my-service': serviceUrl } });
    await syncCmd();
    expect(errors.join(' ')).to.include('my-service');
  });

  it('logs completion to stdout', async () => {
    writeConfig({});
    await syncCmd();
    expect(logs.join(' ')).to.include('config layers updated');
  });
});
