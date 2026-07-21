import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { run, resolveInsecure } from '../index.js';
import { getHttpsAgent } from '../lib/tls-core.js';
import { ArcqError } from '../lib/errors.js';

const { expect } = chai;

const CONTEXT_PATH = path.join(os.homedir(), '.arcq-context.json');
const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-index-test-config.json');

describe('index', () => {
  let logs: string[];
  let errors: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
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
  });

  it('shows help when called with no args', async () => {
    await run([]);
    expect(logs.join(' ')).to.include('arcq');
  });

  it('shows help for --help', async () => {
    await run(['--help']);
    expect(logs.join(' ')).to.include('arcq');
  });

  it('shows help for -h', async () => {
    await run(['-h']);
    expect(logs.join(' ')).to.include('arcq');
  });

  it('prints a semver for --version', async () => {
    await run(['--version']);
    expect(logs.join(' ')).to.match(/^\d+\.\d+\.\d+$/);
  });

  it('prints a semver for version', async () => {
    await run(['version']);
    expect(logs.join(' ')).to.match(/^\d+\.\d+\.\d+$/);
  });

  it('prints a semver for -V', async () => {
    await run(['-V']);
    expect(logs.join(' ')).to.match(/^\d+\.\d+\.\d+$/);
  });

  it('rejects an unknown top-level flag', async () => {
    let thrown;
    try {
      await run(['--bogus']);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect((thrown as ArcqError).message).to.include("unknown flag '--bogus'");
  });

  describe('flag-first query shorthand', () => {
    let contextBackup: string | null;

    beforeEach(() => {
      contextBackup = fs.existsSync(CONTEXT_PATH)
        ? fs.readFileSync(CONTEXT_PATH, 'utf-8')
        : null;
      if (fs.existsSync(CONTEXT_PATH)) fs.unlinkSync(CONTEXT_PATH);
    });

    afterEach(() => {
      if (contextBackup !== null) {
        fs.writeFileSync(CONTEXT_PATH, contextBackup);
      } else if (fs.existsSync(CONTEXT_PATH)) {
        fs.unlinkSync(CONTEXT_PATH);
      }
    });

    it('still routes arcq -q "1=1" to query', async () => {
      // With no active context the query itself rejects, which proves the
      // -q allowlist routed to query instead of the unknown-flag guard.
      let thrown;
      try {
        await run(['-q', '1=1']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include('no active layer');
      expect((thrown as ArcqError).message).to.not.include('unknown flag');
    });
  });

  describe('--insecure resolution', () => {
    let envConfig: string | undefined;
    let envInsecure: string | undefined;

    beforeEach(() => {
      envConfig = process.env.ARCQ_CONFIG;
      envInsecure = process.env.ARCQ_INSECURE;
      // Point config resolution at an empty temp file so the real
      // ~/.arcq.json cannot flip these cases on or off.
      process.env.ARCQ_CONFIG = TEMP_CONFIG;
      fs.writeFileSync(TEMP_CONFIG, '{}');
      delete process.env.ARCQ_INSECURE;
    });

    afterEach(() => {
      if (envConfig === undefined) delete process.env.ARCQ_CONFIG;
      else process.env.ARCQ_CONFIG = envConfig;
      if (envInsecure === undefined) delete process.env.ARCQ_INSECURE;
      else process.env.ARCQ_INSECURE = envInsecure;
      if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
    });

    it('is secure by default and strips no args', () => {
      const { insecure, args } = resolveInsecure(['query', '1=1']);
      expect(insecure).to.equal(false);
      expect(args).to.deep.equal(['query', '1=1']);
    });

    it('enables insecure via the --insecure flag and strips it', () => {
      const { insecure, args } = resolveInsecure([
        '--insecure',
        'layer',
        '1=1',
      ]);
      expect(insecure).to.equal(true);
      expect(args).to.deep.equal(['layer', '1=1']);
    });

    it('enables insecure via ARCQ_INSECURE=1', () => {
      process.env.ARCQ_INSECURE = '1';
      expect(resolveInsecure(['query']).insecure).to.equal(true);
    });

    it('enables insecure via ARCQ_INSECURE=true', () => {
      process.env.ARCQ_INSECURE = 'true';
      expect(resolveInsecure(['query']).insecure).to.equal(true);
    });

    it('ignores other ARCQ_INSECURE values', () => {
      process.env.ARCQ_INSECURE = '0';
      expect(resolveInsecure(['query']).insecure).to.equal(false);
    });

    it('enables insecure via config "insecure": true', () => {
      fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ insecure: true }));
      expect(resolveInsecure(['query']).insecure).to.equal(true);
    });

    it('ignores a non-boolean config insecure value', () => {
      fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ insecure: 'yes' }));
      expect(resolveInsecure(['query']).insecure).to.equal(false);
    });

    it('lets the flag win even when config is absent', () => {
      expect(resolveInsecure(['--insecure']).insecure).to.equal(true);
    });

    it('run() installs the insecure agent and warns on stderr', async () => {
      await run(['--insecure', 'version']);
      expect(getHttpsAgent()).to.not.equal(undefined);
      expect(errors.join('\n')).to.include(
        '[arcq] WARNING: TLS certificate verification is disabled'
      );
      expect(logs.join(' ')).to.match(/^\d+\.\d+\.\d+$/);
    });

    it('run() leaves the secure default with no warning', async () => {
      await run(['version']);
      expect(getHttpsAgent()).to.equal(undefined);
      expect(errors.join('\n')).to.not.include('WARNING');
    });

    it('strips --insecure without swallowing a following unknown flag', async () => {
      let thrown;
      try {
        await run(['--insecure', '--bogus']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include(
        "unknown flag '--bogus'"
      );
    });
  });
});
