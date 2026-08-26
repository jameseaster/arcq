import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import fieldsCmd from '../lib/fields-cmd.js';
import { ArcqError } from '../lib/errors.js';
import type { Context } from '../lib/types.js';
import { resolveContextPath, resolveTokenPath } from '../lib/paths-core.js';
import { resetBindingNotices } from '../lib/token-binding.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-fields-config.json');

const SERVER_FIELDS = [
  {
    name: 'OBJECTID',
    type: 'esriFieldTypeOID',
    alias: 'OBJECTID',
    domain: null,
    editable: false,
  },
  {
    name: 'STATUS',
    type: 'esriFieldTypeString',
    alias: 'Status',
    length: 50,
    sqlType: 'sqlTypeOther',
  },
];

const EXPECTED_FIELDS = [
  { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
  {
    name: 'STATUS',
    type: 'esriFieldTypeString',
    alias: 'Status',
    length: 50,
  },
];

describe('fields-cmd', () => {
  useTempStateDir();

  let server: http.Server;
  let baseUrl: string;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  let requests: http.IncomingMessage[];
  let originalEnv: string | undefined;
  let logs: string[];
  let originalLog: typeof console.log;
  let errs: string[];
  let originalError: typeof console.error;

  function respond(data: unknown) {
    handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
      requests.push(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
  }

  function setContext(ctx: Context) {
    fs.writeFileSync(resolveContextPath(), JSON.stringify(ctx));
  }

  function writeConfig(layers: Record<string, string>) {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ layers }));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
  }

  before(async () => {
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        (req as unknown as { bodyParams: URLSearchParams }).bodyParams =
          new URLSearchParams(raw);
        handler(req, res);
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    requests = [];
    respond({ fields: SERVER_FIELDS });

    originalEnv = process.env.ARCQ_CONFIG;
    delete process.env.ARCQ_CONFIG;
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);

    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    // A token with no recorded host draws a one-time stderr hint; capture it
    // so it stays out of the test report, and reset so each test sees it.
    resetBindingNotices();
    errs = [];
    originalError = console.error;
    console.error = (...args) => errs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    resetBindingNotices();

    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
  });

  it('resolves the active context when called with no args', async () => {
    setContext({ url: baseUrl });
    await fieldsCmd([]);
    expect(requests).to.have.length(1);
  });

  it('resolves a named layer from config', async () => {
    writeConfig({ 'my-layer': baseUrl });
    await fieldsCmd(['my-layer']);
    expect(requests).to.have.length(1);
  });

  it('accepts a raw layer URL', async () => {
    await fieldsCmd([baseUrl]);
    expect(requests).to.have.length(1);
  });

  it('sends f=json and the stored token', async () => {
    fs.writeFileSync(resolveTokenPath(), 'my-token');
    setContext({ url: baseUrl });
    await fieldsCmd([]);
    const params = (requests[0] as unknown as { bodyParams: URLSearchParams })
      .bodyParams;
    expect(params.get('f')).to.equal('json');
    expect(params.get('token')).to.equal('my-token');
  });

  it('prints the fields as JSON with extra server keys stripped', async () => {
    setContext({ url: baseUrl });
    await fieldsCmd([]);
    expect(JSON.parse(logs[0]!)).to.deep.equal(EXPECTED_FIELDS);
  });

  it('rejects with no active layer and no arg, making no HTTP request', async () => {
    let thrown;
    try {
      await fieldsCmd([]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect((thrown as ArcqError).message).to.include('no active layer');
    expect(requests).to.have.length(0);
  });

  it('rejects an unknown layer name with suggestions', async () => {
    writeConfig({ 'my-layer': baseUrl });
    let thrown;
    try {
      await fieldsCmd(['my-lyer']);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect((thrown as ArcqError).message).to.include('my-layer');
    expect(requests).to.have.length(0);
  });

  it('rejects on an ArcGIS response error', async () => {
    respond({ error: { code: 400, message: 'Invalid URL' } });
    setContext({ url: baseUrl });
    let thrown;
    try {
      await fieldsCmd([]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect((thrown as ArcqError).exitCode).to.equal(1);
  });

  it('rejects with exit code 2 on a token error', async () => {
    respond({ error: { code: 499, message: 'Token Required' } });
    setContext({ url: baseUrl });
    let thrown;
    try {
      await fieldsCmd([]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect((thrown as ArcqError).exitCode).to.equal(2);
  });
});
