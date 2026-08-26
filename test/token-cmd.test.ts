import * as chai from 'chai';
import fs from 'fs';
import { setTokenValue } from '../lib/token-core.js';
import { saveOAuth, saveTokenMeta } from '../lib/oauth-core.js';
import tokenCmd from '../lib/token-cmd.js';
import {
  resolveOAuthPath,
  resolveTokenMetaPath,
  resolveTokenPath,
} from '../lib/paths-core.js';

const { expect } = chai;

describe('token-cmd', () => {
  let backups: Record<string, string | null>;
  let logs: string[];
  let errs: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  const paths = [
    resolveTokenPath(),
    resolveOAuthPath(),
    resolveTokenMetaPath(),
  ];

  beforeEach(() => {
    backups = {};
    for (const p of paths) {
      backups[p] = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    logs = [];
    errs = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args) => logs.push(args.join(' '));
    console.error = (...args) => errs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;

    for (const p of paths) {
      const backup = backups[p];
      if (backup != null) fs.writeFileSync(p, backup);
      else if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  describe('show', () => {
    it('prints the stored token', async () => {
      setTokenValue('my-secret-token');
      await tokenCmd(['show']);
      expect(logs).to.include('my-secret-token');
    });

    it('prints "No token set." when no token is stored', async () => {
      await tokenCmd(['show']);
      expect(logs.join(' ')).to.include('No token set.');
    });

    it('reports "refresh: not configured" on stderr when no oauth is set up', async () => {
      await tokenCmd(['show']);
      expect(errs.join(' ')).to.include('refresh: not configured');
    });

    it('prints the token expiry line on stderr when meta exists', async () => {
      setTokenValue('tok');
      saveTokenMeta({ expires: Date.now() + 30 * 60000 });
      await tokenCmd(['show']);
      expect(errs.join(' ')).to.match(/expires:.*min left/);
    });

    it('reports the configured portal origin without the refresh token', async () => {
      setTokenValue('tok');
      saveOAuth({
        portalUrl: 'https://portal.example.com/arcgis',
        appId: 'app-1',
        refreshToken: 'super-secret-rt',
      });
      await tokenCmd(['show']);
      const out = errs.join(' ');
      expect(out).to.include(
        'refresh: configured (portal https://portal.example.com)'
      );
      expect(out).to.not.include('super-secret-rt');
      expect(logs.join(' ')).to.not.include('super-secret-rt');
    });

    it('keeps stdout to the bare token so $(arcq token show) stays scriptable', async () => {
      setTokenValue('tok');
      saveTokenMeta({ expires: Date.now() + 30 * 60000 });
      saveOAuth({
        portalUrl: 'https://portal.example.com/arcgis',
        appId: 'app-1',
        refreshToken: 'super-secret-rt',
      });
      await tokenCmd(['show']);
      expect(logs).to.deep.equal(['tok']);
    });
  });

  describe('set', () => {
    it('saves the token', async () => {
      await tokenCmd(['set', 'my-new-token']);
      expect(fs.readFileSync(resolveTokenPath(), 'utf-8').trim()).to.equal(
        'my-new-token'
      );
    });

    it('logs confirmation', async () => {
      await tokenCmd(['set', 'my-new-token']);
      expect(logs.join(' ')).to.include('Token saved');
    });

    it('prompts for the token when the argument is omitted', async () => {
      await tokenCmd(['set'], {
        prompt: async () => '  prompted-token  ',
      });
      expect(fs.readFileSync(resolveTokenPath(), 'utf-8').trim()).to.equal(
        'prompted-token'
      );
    });

    it('rejects an empty prompted token without writing anything', async () => {
      let error: unknown;
      try {
        await tokenCmd(['set'], { prompt: async () => '   ' });
      } catch (err) {
        error = err;
      }
      expect(String(error)).to.include('no token provided');
      expect(fs.existsSync(resolveTokenPath())).to.equal(false);
    });
  });

  describe('unknown subcommand', () => {
    it('prints usage', async () => {
      await tokenCmd(['unknown']);
      expect(logs.join(' ')).to.include('Usage');
    });

    it('prints usage when called with no subcommand', async () => {
      await tokenCmd([]);
      expect(logs.join(' ')).to.include('Usage');
    });
  });
});
