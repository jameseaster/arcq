import * as chai from 'chai';
import fs from 'fs';
import { getToken } from '../lib/token-core.js';
import { ArcqError } from '../lib/errors.js';
import {
  loadOAuth,
  saveOAuth,
  loadTokenMeta,
  saveTokenMeta,
  parseEsriOAuthBlob,
  refreshTokenFrom,
  performRefresh,
  isOAuthConfigured,
  withTokenRetry,
  type OAuthConfig,
} from '../lib/oauth-core.js';
import type { OAuthTokenResponse } from '../lib/types.js';
import { resolveOAuthPath, resolveTokenMetaPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

// A minimal esriJSAPIOAuth browser-storage blob for parse tests.
function blob(entries: Record<string, unknown>): string {
  return JSON.stringify({ '/': entries });
}

describe('oauth-core', () => {
  useTempStateDir();

  describe('oauth storage', () => {
    it('round-trips a saved config', () => {
      const config: OAuthConfig = {
        portalUrl: 'https://portal.example.com',
        appId: 'app-abc',
        refreshToken: 'rt-123',
      };
      saveOAuth(config);
      expect(loadOAuth()).to.deep.equal(config);
    });

    it('writes the oauth file with mode 600', () => {
      saveOAuth({ portalUrl: 'https://portal.example.com', appId: 'a' });
      expect(fs.statSync(resolveOAuthPath()).mode & 0o777).to.equal(0o600);
    });

    it('tightens a pre-existing loosely-permissioned file to 600', () => {
      fs.writeFileSync(resolveOAuthPath(), '{}', { mode: 0o644 });
      fs.chmodSync(resolveOAuthPath(), 0o644);
      saveOAuth({ portalUrl: 'https://portal.example.com', appId: 'a' });
      expect(fs.statSync(resolveOAuthPath()).mode & 0o777).to.equal(0o600);
    });

    it('treats a missing file as not configured', () => {
      expect(loadOAuth()).to.be.null;
      expect(isOAuthConfigured()).to.be.false;
    });

    it('treats a corrupt file as not configured', () => {
      fs.writeFileSync(resolveOAuthPath(), 'not json {');
      expect(loadOAuth()).to.be.null;
    });

    it('treats a file missing required fields as not configured', () => {
      fs.writeFileSync(resolveOAuthPath(), JSON.stringify({ appId: 'a' }));
      expect(loadOAuth()).to.be.null;
    });

    it('reports configured once a valid file exists', () => {
      saveOAuth({ portalUrl: 'https://portal.example.com', appId: 'a' });
      expect(isOAuthConfigured()).to.be.true;
    });
  });

  describe('token meta', () => {
    it('round-trips saved meta', () => {
      saveTokenMeta({ expires: 1234 });
      expect(loadTokenMeta()).to.deep.equal({ expires: 1234 });
    });

    it('writes the meta file with mode 600', () => {
      saveTokenMeta({ expires: 1 });
      expect(fs.statSync(resolveTokenMetaPath()).mode & 0o777).to.equal(0o600);
    });

    it('treats a missing meta file as absent', () => {
      expect(loadTokenMeta()).to.be.null;
    });

    it('treats corrupt meta as absent', () => {
      fs.writeFileSync(resolveTokenMetaPath(), 'nope');
      expect(loadTokenMeta()).to.be.null;
    });
  });

  describe('parseEsriOAuthBlob', () => {
    it('extracts portalUrl, appId, refreshToken, and expires', () => {
      const raw = blob({
        'https://portal.example.com': {
          appId: 'app-1',
          refreshToken: 'rt-1',
          expires: 999,
        },
      });
      expect(parseEsriOAuthBlob(raw)).to.deep.equal({
        portalUrl: 'https://portal.example.com',
        appId: 'app-1',
        refreshToken: 'rt-1',
        refreshTokenExpires: 999,
      });
    });

    it('uses the first portal entry when several exist', () => {
      const raw = blob({
        'https://first.example.com': { appId: 'a1', refreshToken: 'r1' },
        'https://second.example.com': { appId: 'a2', refreshToken: 'r2' },
      });
      expect(parseEsriOAuthBlob(raw).portalUrl).to.equal(
        'https://first.example.com'
      );
    });

    it('throws when the "/" section is missing', () => {
      expect(() => parseEsriOAuthBlob(JSON.stringify({ foo: 1 }))).to.throw(
        ArcqError
      );
    });

    it('throws when appId or refreshToken is missing', () => {
      const raw = blob({ 'https://portal.example.com': { appId: 'a' } });
      expect(() => parseEsriOAuthBlob(raw)).to.throw(ArcqError);
    });
  });

  describe('refreshTokenFrom', () => {
    it('returns a bare token trimmed', () => {
      expect(refreshTokenFrom('  bare-rt  ')).to.equal('bare-rt');
    });

    it('extracts the refresh token from a blob', () => {
      const raw = blob({
        'https://portal.example.com': {
          appId: 'a',
          refreshToken: 'rt-from-blob',
        },
      });
      expect(refreshTokenFrom(raw)).to.equal('rt-from-blob');
    });
  });

  describe('performRefresh', () => {
    const config: OAuthConfig = {
      portalUrl: 'https://portal.example.com',
      appId: 'app-abc',
      refreshToken: 'stored-rt',
    };

    function fakeRequest(
      response: OAuthTokenResponse,
      seen?: { portalUrl?: string; params?: Record<string, unknown> }
    ) {
      return async (
        portalUrl: string,
        params: Record<string, unknown>
      ): Promise<OAuthTokenResponse> => {
        if (seen) {
          seen.portalUrl = portalUrl;
          seen.params = params;
        }
        return response;
      };
    }

    it('exits 1 when no oauth credentials exist', async () => {
      let thrown: unknown;
      try {
        await performRefresh({ request: fakeRequest({ access_token: 'x' }) });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(1);
      expect((thrown as ArcqError).message).to.include('arcq token connect');
    });

    it('saves the access token and expiry meta on success', async () => {
      saveOAuth(config);
      const before = Date.now();
      await performRefresh({
        request: fakeRequest({ access_token: 'fresh-token', expires_in: 1800 }),
      });
      expect(getToken()).to.equal('fresh-token');
      const meta = loadTokenMeta();
      expect(meta).to.not.be.null;
      expect(meta!.expires).to.be.at.least(before + 1800 * 1000);
    });

    it('sends client_id, grant_type, and the stored refresh token', async () => {
      saveOAuth(config);
      const seen: { portalUrl?: string; params?: Record<string, unknown> } = {};
      await performRefresh({
        request: fakeRequest({ access_token: 't', expires_in: 60 }, seen),
      });
      expect(seen.portalUrl).to.equal('https://portal.example.com');
      expect(seen.params).to.include({
        client_id: 'app-abc',
        grant_type: 'refresh_token',
        refresh_token: 'stored-rt',
      });
    });

    it('persists a rotated refresh token', async () => {
      saveOAuth(config);
      await performRefresh({
        request: fakeRequest({
          access_token: 't',
          expires_in: 60,
          refresh_token: 'rotated-rt',
        }),
      });
      expect(loadOAuth()!.refreshToken).to.equal('rotated-rt');
    });

    it('exits 2 with the connect hint on an expired refresh token', async () => {
      saveOAuth(config);
      let thrown: unknown;
      try {
        await performRefresh({
          request: fakeRequest({
            error: { code: 498, message: 'Invalid refresh_token' },
          }),
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(2);
      expect((thrown as ArcqError).message).to.include('arcq token connect');
    });

    it('exits 1 on a non-token server error', async () => {
      saveOAuth(config);
      let thrown: unknown;
      try {
        await performRefresh({
          request: fakeRequest({
            error: { code: 400, message: 'Something else broke' },
          }),
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).exitCode).to.equal(1);
      expect((thrown as ArcqError).message).to.include('Something else broke');
    });

    describe('refreshTokenCommand', () => {
      const cmdConfig: OAuthConfig = {
        portalUrl: 'https://portal.example.com',
        appId: 'app-abc',
        refreshToken: 'stored-rt',
        refreshTokenCommand: 'get-secret',
      };

      it('runs the command and prefers it over a stored token', async () => {
        saveOAuth(cmdConfig);
        const seen: { params?: Record<string, unknown> } = {};
        await performRefresh({
          exec: () => 'cmd-rt\n',
          request: fakeRequest({ access_token: 't', expires_in: 60 }, seen),
        });
        expect(seen.params!.refresh_token).to.equal('cmd-rt');
      });

      it('parses a blob emitted by the command', async () => {
        saveOAuth(cmdConfig);
        const seen: { params?: Record<string, unknown> } = {};
        await performRefresh({
          exec: () =>
            blob({
              'https://portal.example.com': {
                appId: 'app-abc',
                refreshToken: 'blob-rt',
              },
            }),
          request: fakeRequest({ access_token: 't', expires_in: 60 }, seen),
        });
        expect(seen.params!.refresh_token).to.equal('blob-rt');
      });

      it('never persists a rotated refresh token when a command is configured', async () => {
        saveOAuth(cmdConfig);
        await performRefresh({
          exec: () => 'cmd-rt',
          request: fakeRequest({
            access_token: 't',
            expires_in: 60,
            refresh_token: 'rotated-rt',
          }),
        });
        const stored = loadOAuth()!;
        expect(stored.refreshToken).to.equal('stored-rt');
        expect(stored.refreshTokenCommand).to.equal('get-secret');
      });

      it('surfaces command stderr and exits 1 without minting a token', async () => {
        saveOAuth(cmdConfig);
        let thrown: unknown;
        try {
          await performRefresh({
            exec: () => {
              throw Object.assign(new Error('exit 1'), {
                stderr: Buffer.from('vault locked'),
              });
            },
            request: fakeRequest({ access_token: 'should-not-be-used' }),
          });
        } catch (e) {
          thrown = e;
        }
        expect(thrown).to.be.instanceOf(ArcqError);
        expect((thrown as ArcqError).exitCode).to.equal(1);
        expect((thrown as ArcqError).message).to.include('vault locked');
        expect(getToken()).to.be.null;
      });
    });
  });

  describe('withTokenRetry', () => {
    const config: OAuthConfig = {
      portalUrl: 'https://portal.example.com',
      appId: 'app-abc',
      refreshToken: 'stored-rt',
    };

    function tokenErr(): ArcqError {
      return new ArcqError('token invalid or expired', 2);
    }

    it('returns the operation result without retry on success', async () => {
      let calls = 0;
      const result = await withTokenRetry(async () => {
        calls++;
        return 'ok';
      });
      expect(result).to.equal('ok');
      expect(calls).to.equal(1);
    });

    it('refreshes once and retries when oauth is configured', async () => {
      saveOAuth(config);
      let calls = 0;
      const result = await withTokenRetry(
        async () => {
          calls++;
          if (calls === 1) throw tokenErr();
          return 'recovered';
        },
        { request: async () => ({ access_token: 'fresh', expires_in: 60 }) }
      );
      expect(result).to.equal('recovered');
      expect(calls).to.equal(2);
      expect(getToken()).to.equal('fresh');
    });

    it('does not retry when oauth is not configured', async () => {
      let calls = 0;
      let thrown: unknown;
      try {
        await withTokenRetry(async () => {
          calls++;
          throw tokenErr();
        });
      } catch (e) {
        thrown = e;
      }
      expect(calls).to.equal(1);
      expect((thrown as ArcqError).exitCode).to.equal(2);
    });

    it('retries at most once (no loop) when the retry also fails', async () => {
      saveOAuth(config);
      let calls = 0;
      let thrown: unknown;
      try {
        await withTokenRetry(
          async () => {
            calls++;
            throw tokenErr();
          },
          { request: async () => ({ access_token: 'fresh', expires_in: 60 }) }
        );
      } catch (e) {
        thrown = e;
      }
      expect(calls).to.equal(2);
      expect((thrown as ArcqError).exitCode).to.equal(2);
    });

    it('does not retry a non-token error', async () => {
      saveOAuth(config);
      let calls = 0;
      let thrown: unknown;
      try {
        await withTokenRetry(async () => {
          calls++;
          throw new ArcqError('bad where clause', 1);
        });
      } catch (e) {
        thrown = e;
      }
      expect(calls).to.equal(1);
      expect((thrown as ArcqError).exitCode).to.equal(1);
    });
  });
});
