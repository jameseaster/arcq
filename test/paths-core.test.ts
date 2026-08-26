import * as chai from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ensureStateDir,
  resolveCachePath,
  resolveConfigPath,
  resolveContextPath,
  resolveOAuthPath,
  resolveStateDir,
  resolveTokenMetaPath,
  resolveTokenPath,
} from '../lib/paths-core.js';

const { expect } = chai;

// name -> resolver, so the "defaults to ~" and "follows ARCQ_HOME" cases can be
// asserted for every state file rather than a representative one.
const RESOLVERS: Array<[string, () => string]> = [
  ['.arcq.json', resolveConfigPath],
  ['.arcq-context.json', resolveContextPath],
  ['.arcq-cache.json', resolveCachePath],
  ['.arcq-token', resolveTokenPath],
  ['.arcq-oauth.json', resolveOAuthPath],
  ['.arcq-token-meta.json', resolveTokenMetaPath],
];

describe('paths-core', () => {
  let originalHome: string | undefined;
  let originalConfig: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    originalHome = process.env.ARCQ_HOME;
    originalConfig = process.env.ARCQ_CONFIG;
    delete process.env.ARCQ_HOME;
    delete process.env.ARCQ_CONFIG;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcq-paths-'));
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.ARCQ_HOME;
    else process.env.ARCQ_HOME = originalHome;
    if (originalConfig === undefined) delete process.env.ARCQ_CONFIG;
    else process.env.ARCQ_CONFIG = originalConfig;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('resolveStateDir', () => {
    it('returns the home directory when ARCQ_HOME is unset', () => {
      expect(resolveStateDir()).to.equal(os.homedir());
    });

    it('returns ARCQ_HOME when it is set', () => {
      process.env.ARCQ_HOME = tempDir;
      expect(resolveStateDir()).to.equal(tempDir);
    });
  });

  for (const [name, resolve] of RESOLVERS) {
    describe(`resolver for ${name}`, () => {
      it('resolves under the home directory by default', () => {
        expect(resolve()).to.equal(path.join(os.homedir(), name));
      });

      it('resolves under ARCQ_HOME when it is set', () => {
        process.env.ARCQ_HOME = tempDir;
        expect(resolve()).to.equal(path.join(tempDir, name));
      });

      // The defect this module fixes: the old module-level constants captured
      // the path at import time, so an env change made afterwards was ignored.
      it('observes an ARCQ_HOME change made after import', () => {
        const before = resolve();
        process.env.ARCQ_HOME = tempDir;
        expect(resolve()).to.not.equal(before);
        expect(resolve()).to.equal(path.join(tempDir, name));
      });
    });
  }

  describe('resolveConfigPath', () => {
    it('prefers ARCQ_CONFIG over ARCQ_HOME', () => {
      const explicit = path.join(tempDir, 'explicit.json');
      process.env.ARCQ_HOME = tempDir;
      process.env.ARCQ_CONFIG = explicit;
      expect(resolveConfigPath()).to.equal(explicit);
    });

    it('falls back to $ARCQ_HOME/.arcq.json when only ARCQ_HOME is set', () => {
      process.env.ARCQ_HOME = tempDir;
      expect(resolveConfigPath()).to.equal(path.join(tempDir, '.arcq.json'));
    });
  });

  describe('ensureStateDir', () => {
    it('creates a missing state directory with mode 0700', () => {
      const missing = path.join(tempDir, 'nested', 'state');
      process.env.ARCQ_HOME = missing;
      ensureStateDir();
      expect(fs.existsSync(missing)).to.equal(true);
      expect(fs.statSync(missing).mode & 0o777).to.equal(0o700);
    });

    it('leaves an existing directory alone', () => {
      const marker = path.join(tempDir, 'marker');
      fs.writeFileSync(marker, 'kept');
      process.env.ARCQ_HOME = tempDir;
      ensureStateDir();
      expect(fs.readFileSync(marker, 'utf-8')).to.equal('kept');
    });

    it('is a no-op for the default home directory', () => {
      ensureStateDir();
      expect(fs.existsSync(os.homedir())).to.equal(true);
    });
  });
});
