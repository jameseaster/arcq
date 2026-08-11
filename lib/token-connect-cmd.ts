import fs from 'fs';
import { fetchOwningSystemUrl } from './arcgis-core.js';
import { loadContext } from './context-core.js';
import { ArcqError } from './errors.js';
import { makePrompter } from './prompt-core.js';
import {
  oauthPath,
  parseEsriOAuthBlob,
  performRefresh,
  saveOAuth,
  type OAuthConfig,
  type RefreshResult,
} from './oauth-core.js';
import { getToken } from './token-core.js';

export interface ConnectDeps {
  // Prompts for a line of input. Injected in tests.
  prompt?: (question: string) => Promise<string>;
  // Validates the stored credentials by minting a token. Injected in tests.
  refresh?: () => Promise<RefreshResult>;
}

function printConnectGuidance(): void {
  console.log(
    'To find your OAuth credential, open your browser DevTools console on a'
  );
  console.log('page of your ArcGIS web app and run:');
  console.log('');
  console.log(
    "  copy(sessionStorage.getItem('esriJSAPIOAuth') ?? localStorage.getItem('esriJSAPIOAuth'))"
  );
  console.log('');
  console.log(
    'The web app stores it in session or local storage depending on how it'
  );
  console.log(
    'signed in, so the line checks both. Paste the clipboard contents below.'
  );
  console.log('');
}

// Best-effort default for the portal prompt: the owning system of the active
// layer, if one is set and the server reports it. Any failure yields undefined.
async function derivePortalDefault(): Promise<string | undefined> {
  try {
    const ctx = loadContext();
    if (!ctx?.url) return undefined;
    return await fetchOwningSystemUrl(ctx.url, getToken());
  } catch {
    return undefined;
  }
}

async function promptPortalUrl(
  prompt: (q: string) => Promise<string>
): Promise<string> {
  const suggested = await derivePortalDefault();
  const label = suggested ? `Portal URL [${suggested}]: ` : 'Portal URL: ';
  const answer = (await prompt(label)).trim();
  const portalUrl = answer || suggested || '';
  if (!portalUrl) throw new ArcqError('portal URL is required');
  return portalUrl;
}

async function promptRequired(
  prompt: (q: string) => Promise<string>,
  label: string,
  field: string
): Promise<string> {
  const value = (await prompt(label)).trim();
  if (!value) throw new ArcqError(`${field} is required`);
  return value;
}

export default async function tokenConnectCmd(
  args: string[],
  deps: ConnectDeps = {}
): Promise<void> {
  const prompter = deps.prompt ? null : makePrompter();
  const prompt = deps.prompt ?? prompter!.prompt;
  const refresh = deps.refresh ?? performRefresh;
  try {
    await runConnect(args, prompt, refresh);
  } finally {
    prompter?.close();
  }
}

async function runConnect(
  args: string[],
  prompt: (question: string) => Promise<string>,
  refresh: () => Promise<RefreshResult>
): Promise<void> {
  let command: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--command') {
      command = args[++i];
      if (command === undefined) {
        throw new ArcqError('--command requires a value');
      }
    } else {
      throw new ArcqError(`unknown flag '${args[i]}' for token connect`);
    }
  }

  let config: OAuthConfig;

  if (command !== undefined) {
    // Credential-helper path: no secret is prompted or stored, only the command.
    const portalUrl = await promptPortalUrl(prompt);
    const appId = await promptRequired(
      prompt,
      'App id (client_id): ',
      'app id'
    );
    config = { portalUrl, appId, refreshTokenCommand: command };
  } else {
    printConnectGuidance();
    const raw = (
      await prompt('Paste esriJSAPIOAuth JSON (or a bare refresh token): ')
    ).trim();
    if (!raw) throw new ArcqError('nothing pasted - aborted');

    let looksLikeJson = false;
    try {
      JSON.parse(raw);
      looksLikeJson = true;
    } catch {
      // Not JSON - fall through to the bare refresh-token path.
    }

    if (looksLikeJson) {
      const blob = parseEsriOAuthBlob(raw);
      config = {
        portalUrl: blob.portalUrl,
        appId: blob.appId,
        refreshToken: blob.refreshToken,
      };
      if (blob.refreshTokenExpires != null) {
        config.refreshTokenExpires = blob.refreshTokenExpires;
      }
    } else {
      // Bare-token path: the token alone can't tell us the portal or appId.
      const portalUrl = await promptPortalUrl(prompt);
      const appId = await promptRequired(
        prompt,
        'App id (client_id): ',
        'app id'
      );
      config = { portalUrl, appId, refreshToken: raw };
    }
  }

  // Save, then validate. On failure, restore whatever oauth file was there
  // before so a botched connect never clobbers a working setup.
  const prior = fs.existsSync(oauthPath)
    ? fs.readFileSync(oauthPath, 'utf-8')
    : null;
  saveOAuth(config);

  let result: RefreshResult;
  try {
    result = await refresh();
  } catch (err) {
    if (prior !== null) {
      fs.writeFileSync(oauthPath, prior, { mode: 0o600 });
      fs.chmodSync(oauthPath, 0o600);
    } else if (fs.existsSync(oauthPath)) {
      fs.unlinkSync(oauthPath);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ArcqError(`connect failed: ${message}`, 1);
  }

  const expiresAt = new Date(result.expires).toISOString();
  const goodUntil =
    config.refreshTokenExpires != null
      ? `; refresh credential good until ~${new Date(config.refreshTokenExpires).toISOString()}`
      : '';
  console.log(
    `Connected. Access token saved (expires ${expiresAt})${goodUntil}.`
  );
}
