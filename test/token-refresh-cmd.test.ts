import * as chai from 'chai';
import { getToken } from '../lib/token-core.js';
import { ArcqError } from '../lib/errors.js';
import {
  loadOAuth,
  loadTokenMeta,
  saveOAuth,
  type OAuthConfig,
} from '../lib/oauth-core.js';
import tokenRefreshCmd from '../lib/token-refresh-cmd.js';
import type { OAuthTokenResponse } from '../lib/types.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

const CONFIG: OAuthConfig = {
  portalUrl: 'https://portal.example.com',
  appId: 'app-abc',
  refreshToken: 'stored-rt',
};

describe('token-refresh-cmd', () => {
  useTempStateDir();

  let logs: string[];
  let originalLog: typeof console.log;

  function request(response: OAuthTokenResponse) {
    return async (): Promise<OAuthTokenResponse> => response;
  }

  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('saves the token and meta and prints the expiry on success', async () => {
    saveOAuth(CONFIG);
    await tokenRefreshCmd({
      request: request({ access_token: 'fresh-token', expires_in: 1800 }),
    });
    expect(getToken()).to.equal('fresh-token');
    expect(loadTokenMeta()).to.not.be.null;
    expect(logs.join(' ')).to.include('Token refreshed');
  });

  it('persists a rotated refresh token', async () => {
    saveOAuth(CONFIG);
    await tokenRefreshCmd({
      request: request({
        access_token: 't',
        expires_in: 60,
        refresh_token: 'rotated-rt',
      }),
    });
    expect(loadOAuth()!.refreshToken).to.equal('rotated-rt');
  });

  it('exits 1 with the connect hint when no oauth file exists', async () => {
    let thrown: unknown;
    try {
      await tokenRefreshCmd({ request: request({ access_token: 'x' }) });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect((thrown as ArcqError).exitCode).to.equal(1);
    expect((thrown as ArcqError).message).to.include('arcq token connect');
  });

  it('exits 2 with the connect hint on an expired refresh token', async () => {
    saveOAuth(CONFIG);
    let thrown: unknown;
    try {
      await tokenRefreshCmd({
        request: request({
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

  describe('with a refreshTokenCommand', () => {
    const cmdConfig: OAuthConfig = { ...CONFIG, refreshTokenCommand: 'get-rt' };

    it('runs the command and does not persist a rotated token', async () => {
      saveOAuth(cmdConfig);
      await tokenRefreshCmd({
        exec: () => 'cmd-rt',
        request: request({
          access_token: 't',
          expires_in: 60,
          refresh_token: 'rotated-rt',
        }),
      });
      expect(loadOAuth()!.refreshToken).to.equal('stored-rt');
    });

    it('surfaces command stderr and exits 1 without minting a token', async () => {
      saveOAuth(cmdConfig);
      let thrown: unknown;
      try {
        await tokenRefreshCmd({
          exec: () => {
            throw Object.assign(new Error('exit 1'), {
              stderr: Buffer.from('vault locked'),
            });
          },
          request: request({ access_token: 'unused' }),
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
