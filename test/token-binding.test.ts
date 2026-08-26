import * as chai from 'chai';
import {
  hostOf,
  isCrossHostAllowed,
  resetBindingNotices,
  setAllowCrossHost,
  tokenForUrl,
} from '../lib/token-binding.js';
import { saveTokenMeta } from '../lib/token-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

describe('token-binding', () => {
  useTempStateDir();

  let errs: string[];
  let originalError: typeof console.error;

  beforeEach(() => {
    // Notices are per-invocation; a test process runs many, so reset between.
    resetBindingNotices();
    errs = [];
    originalError = console.error;
    console.error = (...args) => errs.push(args.join(' '));
  });

  afterEach(() => {
    console.error = originalError;
    resetBindingNotices();
  });

  describe('hostOf', () => {
    it('extracts the hostname from a URL', () => {
      expect(hostOf('https://portal.example.com/arcgis/rest')).to.equal(
        'portal.example.com'
      );
    });

    it('lowercases the hostname', () => {
      expect(hostOf('https://Portal.EXAMPLE.com')).to.equal(
        'portal.example.com'
      );
    });

    it('drops the port, so one machine is one authority', () => {
      expect(hostOf('https://portal.example.com:6443/arcgis')).to.equal(
        'portal.example.com'
      );
    });

    it('accepts a bare hostname', () => {
      expect(hostOf('portal.example.com')).to.equal('portal.example.com');
    });

    it('returns undefined for a value that is not a host', () => {
      expect(hostOf('not a host/at all')).to.equal(undefined);
      expect(hostOf('   ')).to.equal(undefined);
    });
  });

  describe('tokenForUrl', () => {
    it('passes a null token through untouched', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      expect(tokenForUrl('https://elsewhere.example.com/x', null)).to.be.null;
      expect(errs).to.be.empty;
    });

    it('sends the token to the host it was issued for', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      expect(
        tokenForUrl('https://portal.example.com/arcgis/rest', 'tok')
      ).to.equal('tok');
      expect(errs).to.be.empty;
    });

    it('ignores the port when comparing', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      expect(
        tokenForUrl('https://portal.example.com:6443/arcgis', 'tok')
      ).to.equal('tok');
    });

    it('compares case-insensitively', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      expect(tokenForUrl('https://PORTAL.example.com/x', 'tok')).to.equal(
        'tok'
      );
    });

    // The defect this module exists to fix.
    it('omits the token for a host it was not issued for', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      expect(tokenForUrl('https://services.arcgis.com/x', 'tok')).to.be.null;
    });

    it('names both hosts and the override in the warning', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      tokenForUrl('https://services.arcgis.com/x', 'tok');
      const output = errs.join(' ');
      expect(output).to.include('portal.example.com');
      expect(output).to.include('services.arcgis.com');
      expect(output).to.include('--allow-cross-host');
    });

    it('warns once no matter how many requests a command makes', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      tokenForUrl('https://services.arcgis.com/x', 'tok');
      tokenForUrl('https://services.arcgis.com/x', 'tok');
      tokenForUrl('https://other.example.com/x', 'tok');
      expect(errs).to.have.length(1);
    });

    describe('with no recorded host', () => {
      it('sends the token, preserving pre-binding behavior', () => {
        saveTokenMeta({ expires: 1 });
        expect(tokenForUrl('https://anywhere.example.com/x', 'tok')).to.equal(
          'tok'
        );
      });

      it('sends the token when there is no meta file at all', () => {
        expect(tokenForUrl('https://anywhere.example.com/x', 'tok')).to.equal(
          'tok'
        );
      });

      it('hints once at how to record a host', () => {
        tokenForUrl('https://anywhere.example.com/x', 'tok');
        tokenForUrl('https://anywhere.example.com/x', 'tok');
        expect(errs).to.have.length(1);
        expect(errs[0]).to.include('--host');
      });

      it('stays silent when no token is being sent', () => {
        tokenForUrl('https://anywhere.example.com/x', null);
        expect(errs).to.be.empty;
      });
    });

    describe('when the target URL has no parseable host', () => {
      it('omits the token rather than trusting a destination it cannot name', () => {
        saveTokenMeta({ expires: 1, host: 'portal.example.com' });
        expect(tokenForUrl('not a url/at all', 'tok')).to.be.null;
        expect(errs.join(' ')).to.include('unrecognized destination');
      });
    });
  });

  describe('setAllowCrossHost', () => {
    it('defaults to off', () => {
      expect(isCrossHostAllowed()).to.equal(false);
    });

    it('sends the token cross-host once enabled', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      setAllowCrossHost(true);
      expect(tokenForUrl('https://services.arcgis.com/x', 'tok')).to.equal(
        'tok'
      );
    });

    it('still warns, so the override is never silent', () => {
      saveTokenMeta({ expires: 1, host: 'portal.example.com' });
      setAllowCrossHost(true);
      tokenForUrl('https://services.arcgis.com/x', 'tok');
      expect(errs.join(' ')).to.include('--allow-cross-host');
      expect(errs.join(' ')).to.include('WARNING');
    });
  });
});
