import * as chai from 'chai';
import fs from 'fs';
import { tokenPath, getToken, setTokenValue } from '../lib/token-core.js';

const { expect } = chai;

describe('token-core', () => {
  let backup: string | null;

  beforeEach(() => {
    backup = fs.existsSync(tokenPath)
      ? fs.readFileSync(tokenPath, 'utf-8')
      : null;
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  });

  afterEach(() => {
    if (backup !== null) {
      fs.writeFileSync(tokenPath, backup);
    } else if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  });

  describe('getToken', () => {
    it('returns null when no token file exists', () => {
      expect(getToken()).to.be.null;
    });

    it('returns the token string when the file exists', () => {
      fs.writeFileSync(tokenPath, 'abc123');
      expect(getToken()).to.equal('abc123');
    });

    it('trims whitespace from the stored token', () => {
      fs.writeFileSync(tokenPath, '  my-token\n');
      expect(getToken()).to.equal('my-token');
    });
  });

  describe('setTokenValue', () => {
    it('writes the token to tokenPath', () => {
      setTokenValue('new-token');
      expect(fs.readFileSync(tokenPath, 'utf-8')).to.equal('new-token');
    });

    it('trims whitespace before writing', () => {
      setTokenValue('  padded-token  ');
      expect(fs.readFileSync(tokenPath, 'utf-8')).to.equal('padded-token');
    });

    it('overwrites an existing token', () => {
      fs.writeFileSync(tokenPath, 'old-token');
      setTokenValue('new-token');
      expect(fs.readFileSync(tokenPath, 'utf-8')).to.equal('new-token');
    });

    it('writes the token file with mode 600', () => {
      setTokenValue('secret');
      expect(fs.statSync(tokenPath).mode & 0o777).to.equal(0o600);
    });

    it('tightens a pre-existing loosely-permissioned file to 600', () => {
      fs.writeFileSync(tokenPath, 'old-token', { mode: 0o644 });
      fs.chmodSync(tokenPath, 0o644);
      setTokenValue('new-token');
      expect(fs.statSync(tokenPath).mode & 0o777).to.equal(0o600);
    });
  });

  describe('round-trip', () => {
    it('getToken returns what setTokenValue wrote', () => {
      setTokenValue('round-trip-token');
      expect(getToken()).to.equal('round-trip-token');
    });
  });
});
