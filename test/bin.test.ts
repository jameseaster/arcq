import * as chai from 'chai';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const { expect } = chai;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const BIN = path.join(ROOT, 'bin', 'arcq.ts');
const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-bin-config.json');
const TEMP_HOME = path.join(os.tmpdir(), 'arcq-test-bin-home');

interface BinResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Each spawn pays the tsx startup cost (~1s), so keep this suite to the few
// cases nothing else covers: the bin catch block and its exit codes.
// Async spawn (not spawnSync) — the child talks to the in-process http
// server, so the parent's event loop must stay free to answer it.
describe('bin/arcq', function () {
  this.timeout(20000);

  let server: http.Server;
  let baseUrl: string;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  function respond(data: unknown) {
    handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
  }

  function runBin(args: string[]): Promise<BinResult> {
    return new Promise((resolve, reject) => {
      // The child gets an empty temp state directory so the developer's real
      // token and OAuth files can't leak in (a real OAuth setup would turn the
      // token-error test into a live credential-command run and portal
      // request). HOME is overridden too, in case anything else consults it.
      const child = spawn(TSX, [BIN, ...args], {
        env: {
          ...process.env,
          ARCQ_CONFIG: TEMP_CONFIG,
          ARCQ_HOME: TEMP_HOME,
          HOME: TEMP_HOME,
          USERPROFILE: TEMP_HOME,
        },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
  }

  before(async () => {
    fs.writeFileSync(TEMP_CONFIG, '{}');
    fs.mkdirSync(TEMP_HOME, { recursive: true });
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
    fs.rmSync(TEMP_HOME, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('exits 1 and prints error: <message> on an ArcGIS response error', async () => {
    respond({ error: { code: 400, message: 'Unable to complete operation.' } });
    const res = await runBin(['-q', baseUrl, 'BAD = "SYNTAX"']);
    expect(res.status).to.equal(1);
    expect(res.stderr).to.match(/^error: /m);
    expect(res.stderr).to.include('Unable to complete operation.');
    expect(res.stdout).to.not.include('[]');
  });

  it('exits 2 with the friendly message on a token error', async () => {
    respond({ error: { code: 498, message: 'Invalid token.' } });
    const res = await runBin(['-q', baseUrl, '1=1']);
    expect(res.status).to.equal(2);
    expect(res.stderr).to.match(/^error: /m);
    expect(res.stderr).to.include('arcq token set');
  });

  it('exits 0 and prints the version for --version', async () => {
    const res = await runBin(['--version']);
    expect(res.status).to.equal(0);
    expect(res.stdout.trim()).to.match(/^\d+\.\d+\.\d+$/);
  });
});
