import * as chai from 'chai';
import fs from 'fs';
import { tokenPath, setTokenValue } from '../lib/token-core.js';
import tokenCmd from '../lib/token-cmd.js';

const { expect } = chai;

describe('token-cmd', () => {
  let backup: string | null;
  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    backup = fs.existsSync(tokenPath)
      ? fs.readFileSync(tokenPath, 'utf-8')
      : null;
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);

    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;

    if (backup !== null) {
      fs.writeFileSync(tokenPath, backup);
    } else if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
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
  });

  describe('set', () => {
    it('saves the token', async () => {
      tokenCmd(['set', 'my-new-token']);
      expect(fs.readFileSync(tokenPath, 'utf-8').trim()).to.equal('my-new-token');
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
