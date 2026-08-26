import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { getToken } from '../lib/token-core.js';
import { saveOAuth } from '../lib/oauth-core.js';
import queryCmd from '../lib/query-cmd.js';
import { ArcqError } from '../lib/errors.js';
import type { Context } from '../lib/types.js';
import { resolveContextPath, resolveTokenPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-config.json');

describe('query-cmd', () => {
  useTempStateDir();

  let server: http.Server;
  let baseUrl: string;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  let requests: http.IncomingMessage[];
  let originalEnv: string | undefined;
  let logs: string[];
  let originalLog: typeof console.log;
  let errs: string[];
  let originalErr: typeof console.error;

  // arcq sends parameters in a form-encoded POST body (never the URL query
  // string), so tests read them from the buffered body attached by the server.
  function params(req: http.IncomingMessage): URLSearchParams {
    return (req as unknown as { bodyParams: URLSearchParams }).bodyParams;
  }

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

  function writeServices(services: Record<string, string>) {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ services }));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
  }

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
          handler(req, res);
        });
      }
    );
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
    respond({ features: [] });

    originalEnv = process.env.ARCQ_CONFIG;
    delete process.env.ARCQ_CONFIG;
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);

    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    // The query summary is on by default, so capture stderr for every test.
    errs = [];
    originalErr = console.error;
    console.error = (...args) => errs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalErr;

    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
  });

  describe('single arg — where clause against active layer', () => {
    it('rejects when no context is set', async () => {
      let thrown;
      try {
        await queryCmd(['1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include('no active layer');
    });

    it('makes no HTTP request when no context is set', async () => {
      await queryCmd(['1=1']).catch(() => {});
      expect(requests).to.have.length(0);
    });

    it('queries the context layer URL', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(
        requests.filter((r: http.IncomingMessage) =>
          r.url!.startsWith('/query')
        )
      ).to.have.length(1);
    });

    it('sends the where clause to the query endpoint', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['AREA > 500']);
      const p = params(requests[0]!);
      expect(p.get('where')).to.equal('AREA > 500');
    });
  });

  describe('two args — layer and where clause', () => {
    it('resolves a named layer from config', async () => {
      writeConfig({ parcels: baseUrl });
      await queryCmd(['parcels', '1=1']);
      expect(
        requests.filter((r: http.IncomingMessage) =>
          r.url!.startsWith('/query')
        )
      ).to.have.length(1);
    });

    it('uses the arg directly as a URL when not in config', async () => {
      await queryCmd([baseUrl, "STATUS = 'ACTIVE'"]);
      expect(
        requests.filter((r: http.IncomingMessage) =>
          r.url!.startsWith('/query')
        )
      ).to.have.length(1);
    });

    it('sends the where clause', async () => {
      await queryCmd([baseUrl, "STATUS = 'ACTIVE'"]);
      const p = params(requests[0]!);
      expect(p.get('where')).to.equal("STATUS = 'ACTIVE'");
    });

    it('rejects an unknown layer name with suggestions and no HTTP request', async () => {
      writeConfig({ 'my-service-parcels': baseUrl });
      let thrown;
      try {
        await queryCmd(['parcels', '1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include(
        "unknown layer 'parcels'"
      );
      expect((thrown as ArcqError).message).to.include('my-service-parcels');
      expect(requests).to.have.length(0);
    });
  });

  describe('query params', () => {
    it('sends outFields=*, f=json, resultOffset=0, resultRecordCount=1000', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      const p = params(requests[0]!);
      expect(p.get('outFields')).to.equal('*');
      expect(p.get('f')).to.equal('json');
      expect(p.get('resultOffset')).to.equal('0');
      expect(p.get('resultRecordCount')).to.equal('1000');
    });
  });

  describe('token', () => {
    it('makes only the query request when no token is stored', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(requests).to.have.length(1);
      expect(requests[0]!.url).to.match(/^\/query/);
    });

    it('makes only the query request when a token is stored (no preflight)', async () => {
      fs.writeFileSync(resolveTokenPath(), 'my-token');
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(requests).to.have.length(1);
      expect(requests[0]!.url).to.match(/^\/query/);
    });

    it('includes the token in the query request', async () => {
      fs.writeFileSync(resolveTokenPath(), 'my-token');
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      const queryReq = requests.find((r: http.IncomingMessage) =>
        r.url!.startsWith('/query')
      );
      const p = params(queryReq!);
      expect(p.get('token')).to.equal('my-token');
    });
  });

  describe('pagination', () => {
    function pagedHandler(page1Size: number, page2Features: unknown[]) {
      handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        requests.push(req);
        const offset = parseInt(params(req).get('resultOffset') || '0', 10);
        const isFirstPage = offset === 0;
        const features = isFirstPage
          ? Array.from({ length: page1Size }, (_, i) => ({
              attributes: { ID: i },
            }))
          : page2Features;
        const body = isFirstPage
          ? { features, exceededTransferLimit: true }
          : { features };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
    }

    it('makes a single request when exceededTransferLimit is absent', async () => {
      respond({ features: [{ attributes: { ID: 1 } }] });
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(requests).to.have.length(1);
    });

    it('fetches a second page when exceededTransferLimit is true', async () => {
      pagedHandler(1000, [{ attributes: { ID: 1000 } }]);
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(requests).to.have.length(2);
    });

    it('sends resultOffset=0 on page 1 and resultOffset=1000 on page 2', async () => {
      pagedHandler(1000, [{ attributes: { ID: 1000 } }]);
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(params(requests[0]!).get('resultOffset')).to.equal('0');
      expect(params(requests[1]!).get('resultOffset')).to.equal('1000');
    });

    it('merges all pages into a single output array', async () => {
      pagedHandler(1000, [
        { attributes: { ID: 1000 } },
        { attributes: { ID: 1001 } },
      ]);
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      const output = JSON.parse(logs[0]!);
      expect(output).to.have.length(1002);
      expect(output[0]).to.deep.equal({ ID: 0 });
      expect(output[1001]).to.deep.equal({ ID: 1001 });
    });
  });

  describe('output', () => {
    it('prints a JSON array of feature attributes', async () => {
      respond({
        features: [
          { attributes: { ID: 1, NAME: 'Alpha' } },
          { attributes: { ID: 2, NAME: 'Beta' } },
        ],
      });
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(JSON.parse(logs[0]!)).to.deep.equal([
        { ID: 1, NAME: 'Alpha' },
        { ID: 2, NAME: 'Beta' },
      ]);
    });

    it('prints an empty array when no features are returned', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(JSON.parse(logs[0]!)).to.deep.equal([]);
    });
  });

  describe('ArcGIS response errors', () => {
    it('rejects with exit code 1 instead of printing [] on a query error', async () => {
      respond({
        error: { code: 400, message: 'Unable to complete operation.' },
      });
      setContext({ url: baseUrl });
      let thrown;
      try {
        await queryCmd(['BAD = "SYNTAX"']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(1);
      expect((thrown as ArcqError).message).to.include(
        'Unable to complete operation.'
      );
      expect(logs).to.have.length(0);
    });

    it('rejects with exit code 2 when the query reports a token error', async () => {
      respond({ error: { code: 499, message: 'Token Required' } });
      setContext({ url: baseUrl });
      let thrown;
      try {
        await queryCmd(['1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
      expect(logs).to.have.length(0);
    });
  });

  describe('query shaping flags', () => {
    it('--out-fields sends the given list as outFields', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['-q', '--out-fields', 'OBJECTID,NAME', '1=1']);
      const p = params(requests[0]!);
      expect(p.get('outFields')).to.equal('OBJECTID,NAME');
    });

    it('--order-by sends orderByFields', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['-q', '--order-by', 'NAME DESC', '1=1']);
      const p = params(requests[0]!);
      expect(p.get('orderByFields')).to.equal('NAME DESC');
    });

    it('--count makes a single returnCountOnly request with no pagination params', async () => {
      respond({ count: 42 });
      setContext({ url: baseUrl });
      await queryCmd(['-q', '--count', '1=1']);
      expect(requests).to.have.length(1);
      const p = params(requests[0]!);
      expect(p.get('returnCountOnly')).to.equal('true');
      expect(p.get('resultOffset')).to.equal(null);
      expect(p.get('resultRecordCount')).to.equal(null);
    });

    it('--count prints {"count":N}', async () => {
      respond({ count: 42 });
      setContext({ url: baseUrl });
      await queryCmd(['-q', '--count', '1=1']);
      expect(logs[0]).to.equal('{"count":42}');
    });

    it('--count rejects on an ArcGIS response error', async () => {
      respond({ error: { code: 400, message: 'Invalid query.' } });
      setContext({ url: baseUrl });
      let thrown;
      try {
        await queryCmd(['-q', '--count', 'BAD']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect(logs).to.have.length(0);
    });

    it('--limit 1500 asks for 1000 then 500 and outputs 1500 rows', async () => {
      handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        requests.push(req);
        const qp = params(req);
        const offset = parseInt(qp.get('resultOffset') || '0', 10);
        const size = parseInt(qp.get('resultRecordCount') || '1000', 10);
        const features = Array.from({ length: size }, (_, i) => ({
          attributes: { ID: offset + i },
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ features, exceededTransferLimit: true }));
      };
      setContext({ url: baseUrl });
      await queryCmd(['-q', '--limit', '1500', '1=1']);
      expect(requests).to.have.length(2);
      const sizes = requests.map((r: http.IncomingMessage) =>
        params(r).get('resultRecordCount')
      );
      expect(sizes).to.deep.equal(['1000', '500']);
      expect(JSON.parse(logs[0]!)).to.have.length(1500);
    });

    it('--limit 5 makes exactly one request even when the server reports more', async () => {
      respond({
        features: Array.from({ length: 5 }, (_, i) => ({
          attributes: { ID: i },
        })),
        exceededTransferLimit: true,
      });
      setContext({ url: baseUrl });
      await queryCmd(['-q', '--limit', '5', '1=1']);
      expect(requests).to.have.length(1);
      const p = params(requests[0]!);
      expect(p.get('resultRecordCount')).to.equal('5');
      expect(JSON.parse(logs[0]!)).to.have.length(5);
    });

    it('rejects an unknown flag with no HTTP request', async () => {
      setContext({ url: baseUrl });
      let thrown;
      try {
        await queryCmd(['--nope', '1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include("unknown flag '--nope'");
      expect(requests).to.have.length(0);
    });

    it('rejects a valueless --limit with no HTTP request', async () => {
      setContext({ url: baseUrl });
      let thrown;
      try {
        await queryCmd(['1=1', '--limit']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect(requests).to.have.length(0);
    });

    it('rejects a non-integer --limit with no HTTP request', async () => {
      setContext({ url: baseUrl });
      let thrown;
      try {
        await queryCmd(['--limit', 'abc', '1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include('positive integer');
      expect(requests).to.have.length(0);
    });
  });

  describe('query summary (on by default, -q / --quiet suppresses)', () => {
    it('prints the resolved endpoint and where clause to stderr by default', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['AREA > 500']);
      const out = errs.join('\n');
      expect(out).to.include(`endpoint: ${baseUrl}/query`);
      expect(out).to.include('where:    AREA > 500');
      expect(out).to.include('─'.repeat(60));
    });

    it('shows the active layer in service:id → name form', async () => {
      setContext({
        service: 'my-service',
        layerId: 3,
        name: 'Parcels',
        url: baseUrl,
      });
      await queryCmd(['1=1']);
      expect(errs.join('\n')).to.include('layer:    my-service:3 → Parcels');
    });

    it('falls back to the URL when the context has no name', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(errs.join('\n')).to.include(`layer:    ${baseUrl}`);
    });

    it('labels a named layer from config', async () => {
      writeConfig({ parcels: baseUrl });
      await queryCmd(['parcels', '1=1']);
      expect(errs.join('\n')).to.include("named layer 'parcels'");
    });

    it('labels a raw URL when not in config', async () => {
      await queryCmd([baseUrl, '1=1']);
      expect(errs.join('\n')).to.include('layer:    raw URL');
    });

    it('suppresses the summary with --quiet', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['1=1', '--quiet']);
      expect(errs).to.have.length(0);
    });

    it('suppresses the summary with -q', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['-q', '1=1']);
      expect(errs).to.have.length(0);
    });

    it('still resolves the active layer when -q is mixed into the args', async () => {
      setContext({ url: baseUrl });
      await queryCmd(['-q', '1=1']);
      const queryReq = requests.find((r: http.IncomingMessage) =>
        r.url!.startsWith('/query')
      );
      expect(params(queryReq!).get('where')).to.equal('1=1');
    });

    it('keeps stdout as clean JSON while the summary goes to stderr', async () => {
      respond({ features: [{ attributes: { ID: 1 } }] });
      setContext({ url: baseUrl });
      await queryCmd(['1=1']);
      expect(
        requests.filter((r: http.IncomingMessage) =>
          r.url!.startsWith('/query')
        )
      ).to.have.length(1);
      expect(JSON.parse(logs[0]!)).to.deep.equal([{ ID: 1 }]);
    });
  });

  describe('auto-refresh on expiry', () => {
    // Serves the OAuth token endpoint plus a /query that fails with a token
    // error for its first `queryFailures` calls, then succeeds.
    function autoRefreshHandler(
      queryFailures: number,
      freshFeatures: unknown[]
    ) {
      let queryCalls = 0;
      handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        requests.push(req);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url!.startsWith('/sharing/rest/oauth2/token')) {
          res.end(
            JSON.stringify({ access_token: 'fresh-token', expires_in: 1800 })
          );
          return;
        }
        queryCalls++;
        if (queryCalls <= queryFailures) {
          res.end(
            JSON.stringify({ error: { code: 499, message: 'Token Required' } })
          );
        } else {
          res.end(JSON.stringify({ features: freshFeatures }));
        }
      };
    }

    function tokenRequests() {
      return requests.filter((r) =>
        r.url!.startsWith('/sharing/rest/oauth2/token')
      );
    }

    function queryRequests() {
      return requests.filter((r) => r.url!.startsWith('/query'));
    }

    it('refreshes once and retries the query when OAuth is configured', async () => {
      autoRefreshHandler(1, [{ attributes: { ID: 7 } }]);
      setContext({ url: baseUrl });
      saveOAuth({ portalUrl: baseUrl, appId: 'app', refreshToken: 'rt' });

      await queryCmd(['-q', '1=1']);

      expect(tokenRequests()).to.have.length(1);
      expect(queryRequests()).to.have.length(2);
      expect(getToken()).to.equal('fresh-token');
      expect(JSON.parse(logs[0]!)).to.deep.equal([{ ID: 7 }]);
    });

    it('does not refresh when OAuth is not configured', async () => {
      autoRefreshHandler(1, [{ attributes: { ID: 7 } }]);
      setContext({ url: baseUrl });

      let thrown;
      try {
        await queryCmd(['-q', '1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
      expect(tokenRequests()).to.have.length(0);
      expect(queryRequests()).to.have.length(1);
    });

    it('retries at most once and then exits 2 (no loop)', async () => {
      autoRefreshHandler(99, []);
      setContext({ url: baseUrl });
      saveOAuth({ portalUrl: baseUrl, appId: 'app', refreshToken: 'rt' });

      let thrown;
      try {
        await queryCmd(['-q', '1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
      expect(queryRequests()).to.have.length(2);
    });
  });

  // `arcq use` has always taken service:id; query rejecting it meant the same
  // identifier worked in one command and failed in the next.
  describe('service:id layer argument', () => {
    it('resolves <service>:<id> against the configured services', async () => {
      writeServices({ 'my-service': baseUrl });
      respond({ features: [{ attributes: { OBJECTID: 1 } }] });
      await queryCmd(['my-service:0', '1=1']);
      expect(requests[0]!.url).to.include('/0/query');
    });

    it('reports the service and layer in the summary', async () => {
      writeServices({ 'my-service': baseUrl });
      respond({ features: [] });
      await queryCmd(['my-service:0', '1=1']);
      expect(errs.join(' ')).to.include("service 'my-service' layer 0");
    });

    it('rejects an unknown service key', async () => {
      writeServices({ 'my-service': baseUrl });
      let thrown;
      try {
        await queryCmd(['nope:0', '1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include('unknown layer');
    });

    it('still treats a raw URL as a raw URL', async () => {
      respond({ features: [] });
      await queryCmd([`${baseUrl}/0`, '1=1']);
      expect(requests[0]!.url).to.include('/0/query');
    });
  });
});
