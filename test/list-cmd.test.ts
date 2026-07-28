import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { tokenPath } from '../lib/token-core.js';
import { oauthPath, tokenMetaPath } from '../lib/oauth-core.js';
import listCmd from '../lib/list-cmd.js';

const { expect } = chai;

const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-config.json');

const CATALOG_RESPONSE = {
  layers: [
    { id: 0, name: 'Parcels' },
    { id: 1, name: 'Owners' },
  ],
  tables: [{ id: 2, name: 'Metadata' }],
};

describe('list-cmd', () => {
  let server: http.Server;
  let serviceUrl: string;
  let requests: http.IncomingMessage[];
  let originalEnv: string | undefined;
  let tokenBackup: string | null;
  let oauthBackup: string | null;
  let tokenMetaBackup: string | null;
  let logs: string[];
  let originalLog: typeof console.log;

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
          res.end(JSON.stringify(CATALOG_RESPONSE));
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

    tokenBackup = fs.existsSync(tokenPath)
      ? fs.readFileSync(tokenPath, 'utf-8')
      : null;
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);

    // Isolate the developer's real OAuth setup: with it present, the exit-2
    // path would trigger a real credential-command run and portal request.
    oauthBackup = fs.existsSync(oauthPath)
      ? fs.readFileSync(oauthPath, 'utf-8')
      : null;
    tokenMetaBackup = fs.existsSync(tokenMetaPath)
      ? fs.readFileSync(tokenMetaPath, 'utf-8')
      : null;
    if (fs.existsSync(oauthPath)) fs.unlinkSync(oauthPath);
    if (fs.existsSync(tokenMetaPath)) fs.unlinkSync(tokenMetaPath);

    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;

    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);

    if (tokenBackup !== null) {
      fs.writeFileSync(tokenPath, tokenBackup);
    } else if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }

    if (oauthBackup !== null) {
      fs.writeFileSync(oauthPath, oauthBackup);
    } else if (fs.existsSync(oauthPath)) {
      fs.unlinkSync(oauthPath);
    }

    if (tokenMetaBackup !== null) {
      fs.writeFileSync(tokenMetaPath, tokenMetaBackup);
    } else if (fs.existsSync(tokenMetaPath)) {
      fs.unlinkSync(tokenMetaPath);
    }
  });

  function writeConfig(services: Record<string, string>) {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ services }));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
  }

  it('prints each layer as "id → name"', async () => {
    await listCmd([serviceUrl]);
    expect(logs).to.include('0 → Parcels');
    expect(logs).to.include('1 → Owners');
  });

  it('prints tables alongside layers', async () => {
    await listCmd([serviceUrl]);
    expect(logs).to.include('2 → Metadata');
  });

  it('resolves a named service from config', async () => {
    writeConfig({ 'my-service': serviceUrl });
    await listCmd(['my-service']);
    expect(logs).to.include('0 → Parcels');
  });

  it('uses the arg as a raw URL when not found in config', async () => {
    await listCmd([serviceUrl]);
    expect(logs).to.include('0 → Parcels');
  });

  it('prints usage when called with no args', async () => {
    await listCmd([]);
    expect(logs.join(' ')).to.include('Usage');
  });

  it('includes the stored token in the request', async () => {
    fs.writeFileSync(tokenPath, 'test-token-abc');
    await listCmd([serviceUrl]);
    const params = (requests[0] as unknown as { bodyParams: URLSearchParams })
      .bodyParams;
    expect(params.get('token')).to.equal('test-token-abc');
  });

  it('sends no token param when none is stored', async () => {
    await listCmd([serviceUrl]);
    const params = (requests[0] as unknown as { bodyParams: URLSearchParams })
      .bodyParams;
    expect(params.has('token')).to.be.false;
  });
});
