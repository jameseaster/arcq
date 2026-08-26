import * as chai from 'chai';
import fs from 'fs';
import { ArcqError } from '../lib/errors.js';
import {
  loadOAuth,
  saveOAuth,
  type OAuthConfig,
  type RefreshResult,
} from '../lib/oauth-core.js';
import tokenConnectCmd from '../lib/token-connect-cmd.js';
import { resolveOAuthPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

// A queued fake prompt: each call returns the next answer in order.
function promptQueue(answers: string[]): (q: string) => Promise<string> {
  const queue = [...answers];
  return async () => {
    if (queue.length === 0) throw new Error('prompt called more than expected');
    return queue.shift()!;
  };
}

const okRefresh = async (): Promise<RefreshResult> => ({
  accessToken: 'minted',
  expires: Date.now() + 1800 * 1000,
});

function blob(entries: Record<string, unknown>): string {
  return JSON.stringify({ '/': entries });
}

describe('token-connect-cmd', () => {
  useTempStateDir();

  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('parses a pasted blob and stores portalUrl, appId, refreshToken', async () => {
    const raw = blob({
      'https://portal.example.com': {
        appId: 'app-1',
        refreshToken: 'rt-1',
        expires: 999,
      },
    });
    await tokenConnectCmd([], {
      prompt: promptQueue([raw]),
      refresh: okRefresh,
    });
    expect(loadOAuth()).to.deep.equal({
      portalUrl: 'https://portal.example.com',
      appId: 'app-1',
      refreshToken: 'rt-1',
      refreshTokenExpires: 999,
    });
  });

  it('uses the first portal entry when the blob has several', async () => {
    const raw = blob({
      'https://first.example.com': { appId: 'a1', refreshToken: 'r1' },
      'https://second.example.com': { appId: 'a2', refreshToken: 'r2' },
    });
    await tokenConnectCmd([], {
      prompt: promptQueue([raw]),
      refresh: okRefresh,
    });
    expect(loadOAuth()!.portalUrl).to.equal('https://first.example.com');
  });

  it('tells the user to check session and local storage', async () => {
    const raw = blob({
      'https://portal.example.com': { appId: 'a', refreshToken: 'r' },
    });
    await tokenConnectCmd([], {
      prompt: promptQueue([raw]),
      refresh: okRefresh,
    });
    const output = logs.join(' ');
    expect(output).to.include("sessionStorage.getItem('esriJSAPIOAuth')");
    expect(output).to.include("localStorage.getItem('esriJSAPIOAuth')");
  });

  it('prints a Connected confirmation on success', async () => {
    const raw = blob({
      'https://portal.example.com': { appId: 'a', refreshToken: 'r' },
    });
    await tokenConnectCmd([], {
      prompt: promptQueue([raw]),
      refresh: okRefresh,
    });
    expect(logs.join(' ')).to.include('Connected.');
  });

  it('prompts for portal URL and appId on the bare-token path', async () => {
    await tokenConnectCmd([], {
      prompt: promptQueue(['bare-rt', 'https://portal.example.com', 'app-xyz']),
      refresh: okRefresh,
    });
    expect(loadOAuth()).to.deep.equal({
      portalUrl: 'https://portal.example.com',
      appId: 'app-xyz',
      refreshToken: 'bare-rt',
    });
  });

  it('stores a refreshTokenCommand and no secret on the --command path', async () => {
    await tokenConnectCmd(['--command', 'op read op://Vault/item/field'], {
      prompt: promptQueue(['https://portal.example.com', 'app-xyz']),
      refresh: okRefresh,
    });
    const stored = loadOAuth()!;
    expect(stored.refreshTokenCommand).to.equal(
      'op read op://Vault/item/field'
    );
    expect(stored.refreshToken).to.be.undefined;
  });

  it('errors on a malformed blob and writes no oauth file', async () => {
    let thrown: unknown;
    try {
      await tokenConnectCmd([], {
        prompt: promptQueue([JSON.stringify({ foo: 1 })]),
        refresh: okRefresh,
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect(loadOAuth()).to.be.null;
  });

  it('writes the oauth file with mode 600', async () => {
    const raw = blob({
      'https://portal.example.com': { appId: 'a', refreshToken: 'r' },
    });
    await tokenConnectCmd([], {
      prompt: promptQueue([raw]),
      refresh: okRefresh,
    });
    expect(fs.statSync(resolveOAuthPath()).mode & 0o777).to.equal(0o600);
  });

  it('restores the prior oauth file when validation fails', async () => {
    const prior: OAuthConfig = {
      portalUrl: 'https://old.example.com',
      appId: 'old-app',
      refreshToken: 'old-rt',
    };
    saveOAuth(prior);

    const raw = blob({
      'https://portal.example.com': {
        appId: 'new-app',
        refreshToken: 'new-rt',
      },
    });
    let thrown: unknown;
    try {
      await tokenConnectCmd([], {
        prompt: promptQueue([raw]),
        refresh: async () => {
          throw new ArcqError(
            'refresh token expired - run: arcq token connect',
            2
          );
        },
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).to.be.instanceOf(ArcqError);
    expect((thrown as ArcqError).exitCode).to.equal(1);
    // Prior credentials survive a botched connect.
    expect(loadOAuth()).to.deep.equal(prior);
  });
});
