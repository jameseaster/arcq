import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { run, resolveInsecure, resolveAllowCrossHost } from '../index.js';
import { getHttpsAgent } from '../lib/tls-core.js';
import { ArcqError } from '../lib/errors.js';
import {
  isCrossHostAllowed,
  resetBindingNotices,
} from '../lib/token-binding.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-index-test-config.json');

describe('index', () => {
  useTempStateDir();

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
      // Point config resolution at an empty temp file so a stray config
      // cannot flip these cases on or off.
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

  // Mirrors the --insecure precedence exactly; the two flags are deliberately
  // the same shape so one is not a special case of the other.
  describe('--allow-cross-host resolution', () => {
    let envConfig: string | undefined;
    let envAllow: string | undefined;

    beforeEach(() => {
      envConfig = process.env.ARCQ_CONFIG;
      envAllow = process.env.ARCQ_ALLOW_CROSS_HOST;
      process.env.ARCQ_CONFIG = TEMP_CONFIG;
      fs.writeFileSync(TEMP_CONFIG, '{}');
      delete process.env.ARCQ_ALLOW_CROSS_HOST;
      resetBindingNotices();
    });

    afterEach(() => {
      if (envConfig === undefined) delete process.env.ARCQ_CONFIG;
      else process.env.ARCQ_CONFIG = envConfig;
      if (envAllow === undefined) delete process.env.ARCQ_ALLOW_CROSS_HOST;
      else process.env.ARCQ_ALLOW_CROSS_HOST = envAllow;
      if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
      resetBindingNotices();
    });

    it('enforces the binding by default and strips no args', () => {
      const { allowCrossHost, args } = resolveAllowCrossHost(['query', '1=1']);
      expect(allowCrossHost).to.equal(false);
      expect(args).to.deep.equal(['query', '1=1']);
    });

    it('allows via the --allow-cross-host flag and strips it', () => {
      const { allowCrossHost, args } = resolveAllowCrossHost([
        '--allow-cross-host',
        'layer',
        '1=1',
      ]);
      expect(allowCrossHost).to.equal(true);
      expect(args).to.deep.equal(['layer', '1=1']);
    });

    it('allows via ARCQ_ALLOW_CROSS_HOST=1', () => {
      process.env.ARCQ_ALLOW_CROSS_HOST = '1';
      expect(resolveAllowCrossHost(['query']).allowCrossHost).to.equal(true);
    });

    it('allows via ARCQ_ALLOW_CROSS_HOST=true', () => {
      process.env.ARCQ_ALLOW_CROSS_HOST = 'true';
      expect(resolveAllowCrossHost(['query']).allowCrossHost).to.equal(true);
    });

    it('ignores other ARCQ_ALLOW_CROSS_HOST values', () => {
      process.env.ARCQ_ALLOW_CROSS_HOST = '0';
      expect(resolveAllowCrossHost(['query']).allowCrossHost).to.equal(false);
    });

    it('allows via config "allowCrossHost": true', () => {
      fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ allowCrossHost: true }));
      expect(resolveAllowCrossHost(['query']).allowCrossHost).to.equal(true);
    });

    it('ignores a non-boolean config allowCrossHost value', () => {
      fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ allowCrossHost: 'yes' }));
      expect(resolveAllowCrossHost(['query']).allowCrossHost).to.equal(false);
    });

    it('run() arms the override and does not treat the flag as a command', async () => {
      await run(['--allow-cross-host', 'version']);
      expect(isCrossHostAllowed()).to.equal(true);
      expect(logs.join(' ')).to.match(/^\d+\.\d+\.\d+$/);
    });

    it('run() leaves the binding enforced without the flag', async () => {
      await run(['version']);
      expect(isCrossHostAllowed()).to.equal(false);
    });
  });
});
