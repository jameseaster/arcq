import * as chai from 'chai';
import fs from 'fs';
import { tokenPath, setTokenValue } from '../lib/token-core.js';
import {
  oauthPath,
  tokenMetaPath,
  saveOAuth,
  saveTokenMeta,
} from '../lib/oauth-core.js';
import tokenCmd from '../lib/token-cmd.js';

const { expect } = chai;

describe('token-cmd', () => {
  let backups: Record<string, string | null>;
  let logs: string[];
  let originalLog: typeof console.log;

  const paths = [tokenPath, oauthPath, tokenMetaPath];

  beforeEach(() => {
    backups = {};
    for (const p of paths) {
      backups[p] = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;

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

    it('reports "refresh: not configured" when no oauth is set up', async () => {
      await tokenCmd(['show']);
      expect(logs.join(' ')).to.include('refresh: not configured');
    });

    it('prints the token expiry line when meta exists', async () => {
      setTokenValue('tok');
      saveTokenMeta({ expires: Date.now() + 30 * 60000 });
      await tokenCmd(['show']);
      expect(logs.join(' ')).to.match(/expires:.*min left/);
    });

    it('reports the configured portal origin without the refresh token', async () => {
      setTokenValue('tok');
      saveOAuth({
        portalUrl: 'https://portal.example.com/arcgis',
        appId: 'app-1',
        refreshToken: 'super-secret-rt',
      });
      await tokenCmd(['show']);
      const out = logs.join(' ');
      expect(out).to.include(
        'refresh: configured (portal https://portal.example.com)'
      );
      expect(out).to.not.include('super-secret-rt');
    });
  });

  describe('set', () => {
    it('saves the token', async () => {
      tokenCmd(['set', 'my-new-token']);
      expect(fs.readFileSync(tokenPath, 'utf-8').trim()).to.equal(
        'my-new-token'
      );
    });

    it('logs confirmation', async () => {
      tokenCmd(['set', 'my-new-token']);
      expect(logs.join(' ')).to.include('Token saved');
    });

    it('prints usage when token argument is missing', async () => {
      tokenCmd(['set']);
      expect(logs.join(' ')).to.include('Usage');
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
