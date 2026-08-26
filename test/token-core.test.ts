import * as chai from 'chai';
import fs from 'fs';
import { getToken, setTokenValue } from '../lib/token-core.js';
import { resolveTokenPath } from '../lib/paths-core.js';

const { expect } = chai;

describe('token-core', () => {
  let backup: string | null;

  beforeEach(() => {
    backup = fs.existsSync(resolveTokenPath())
      ? fs.readFileSync(resolveTokenPath(), 'utf-8')
      : null;
    if (fs.existsSync(resolveTokenPath())) fs.unlinkSync(resolveTokenPath());
  });

  afterEach(() => {
    if (backup !== null) {
      fs.writeFileSync(resolveTokenPath(), backup);
    } else if (fs.existsSync(resolveTokenPath())) {
      fs.unlinkSync(resolveTokenPath());
    }
  });

  describe('getToken', () => {
    it('returns null when no token file exists', () => {
      expect(getToken()).to.be.null;
    });

    it('returns the token string when the file exists', () => {
      fs.writeFileSync(resolveTokenPath(), 'abc123');
      expect(getToken()).to.equal('abc123');
    });

    it('trims whitespace from the stored token', () => {
      fs.writeFileSync(resolveTokenPath(), '  my-token\n');
      expect(getToken()).to.equal('my-token');
    });
  });

  describe('setTokenValue', () => {
    it('writes the token to resolveTokenPath()', () => {
      setTokenValue('new-token');
      expect(fs.readFileSync(resolveTokenPath(), 'utf-8')).to.equal(
        'new-token'
      );
    });

    it('trims whitespace before writing', () => {
      setTokenValue('  padded-token  ');
      expect(fs.readFileSync(resolveTokenPath(), 'utf-8')).to.equal(
        'padded-token'
      );
    });

    it('overwrites an existing token', () => {
      fs.writeFileSync(resolveTokenPath(), 'old-token');
      setTokenValue('new-token');
      expect(fs.readFileSync(resolveTokenPath(), 'utf-8')).to.equal(
        'new-token'
      );
    });

    it('writes the token file with mode 600', () => {
      setTokenValue('secret');
      expect(fs.statSync(resolveTokenPath()).mode & 0o777).to.equal(0o600);
    });

    it('tightens a pre-existing loosely-permissioned file to 600', () => {
      fs.writeFileSync(resolveTokenPath(), 'old-token', { mode: 0o644 });
      fs.chmodSync(resolveTokenPath(), 0o644);
      setTokenValue('new-token');
      expect(fs.statSync(resolveTokenPath()).mode & 0o777).to.equal(0o600);
    });
  });

  describe('round-trip', () => {
    it('getToken returns what setTokenValue wrote', () => {
      setTokenValue('round-trip-token');
      expect(getToken()).to.equal('round-trip-token');
    });
  });
});
