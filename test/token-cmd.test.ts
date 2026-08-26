import * as chai from 'chai';
import fs from 'fs';
import {
  loadTokenMeta,
  saveTokenMeta,
  setTokenValue,
} from '../lib/token-core.js';
import { saveOAuth } from '../lib/oauth-core.js';
import tokenCmd from '../lib/token-cmd.js';
import { resolveConfigPath, resolveTokenPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

describe('token-cmd', () => {
  useTempStateDir();

  // Written into the temp state dir, so `loadConfig()` picks it up without
  // ARCQ_CONFIG and each test starts from no configured services.
  function writeServices(services: Record<string, string>) {
    fs.writeFileSync(resolveConfigPath(), JSON.stringify({ services }));
  }

  let logs: string[];
  let errs: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
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

    it('reports the bound host on stderr when one is recorded', async () => {
      setTokenValue('tok');
      saveTokenMeta({
        expires: Date.now() + 60000,
        host: 'portal.example.com',
      });
      await tokenCmd(['show']);
      expect(errs.join(' ')).to.include('host: portal.example.com');
    });

    it('says the host is not recorded when the token has no binding', async () => {
      setTokenValue('tok');
      await tokenCmd(['show']);
      expect(errs.join(' ')).to.include('host: not recorded');
      expect(errs.join(' ')).to.include('--host');
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

    describe('--host', () => {
      it('records an explicit host', async () => {
        await tokenCmd(['set', 'tok', '--host', 'portal.example.com']);
        expect(loadTokenMeta()!.host).to.equal('portal.example.com');
      });

      it('accepts a full URL and stores just the hostname', async () => {
        await tokenCmd([
          'set',
          'tok',
          '--host',
          'https://Portal.Example.com/arcgis',
        ]);
        expect(loadTokenMeta()!.host).to.equal('portal.example.com');
      });

      it('takes the flag before the token too', async () => {
        await tokenCmd(['set', '--host', 'portal.example.com', 'tok']);
        expect(fs.readFileSync(resolveTokenPath(), 'utf-8').trim()).to.equal(
          'tok'
        );
        expect(loadTokenMeta()!.host).to.equal('portal.example.com');
      });

      it('names the host in the confirmation', async () => {
        await tokenCmd(['set', 'tok', '--host', 'portal.example.com']);
        expect(logs.join(' ')).to.include('host portal.example.com');
      });

      it('rejects a missing value', async () => {
        let error: unknown;
        try {
          await tokenCmd(['set', 'tok', '--host']);
        } catch (err) {
          error = err;
        }
        expect(String(error)).to.include('--host requires a value');
      });

      it('rejects a value that is not a host', async () => {
        let error: unknown;
        try {
          await tokenCmd(['set', 'tok', '--host', 'not a host/at all']);
        } catch (err) {
          error = err;
        }
        expect(String(error)).to.include('not a host');
      });

      it('explicit --host wins over the configured services', async () => {
        writeServices({ a: 'https://inferred.example.com/arcgis/rest' });
        await tokenCmd(['set', 'tok', '--host', 'explicit.example.com']);
        expect(loadTokenMeta()!.host).to.equal('explicit.example.com');
      });
    });

    describe('host inference', () => {
      it('infers the host when every service shares one', async () => {
        writeServices({
          a: 'https://portal.example.com/arcgis/rest/services/A/FeatureServer',
          b: 'https://portal.example.com/arcgis/rest/services/B/FeatureServer',
        });
        await tokenCmd(['set', 'tok']);
        expect(loadTokenMeta()!.host).to.equal('portal.example.com');
      });

      it('records nothing when services span several hosts', async () => {
        writeServices({
          a: 'https://one.example.com/arcgis/rest',
          b: 'https://two.example.com/arcgis/rest',
        });
        await tokenCmd(['set', 'tok']);
        expect(loadTokenMeta()?.host).to.equal(undefined);
      });

      it('records nothing when no services are configured', async () => {
        await tokenCmd(['set', 'tok']);
        expect(loadTokenMeta()?.host).to.equal(undefined);
      });

      // A new token is not the old one, so the previous binding must not
      // survive it and vouch for a credential it never described.
      it('clears a stale host when the new token has none', async () => {
        saveTokenMeta({ expires: 123, host: 'old.example.com' });
        await tokenCmd(['set', 'tok']);
        expect(loadTokenMeta()?.host).to.equal(undefined);
      });
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
