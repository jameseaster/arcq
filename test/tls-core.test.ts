import * as chai from 'chai';
import {
  setInsecureTls,
  getHttpsAgent,
  tlsErrorMessage,
} from '../lib/tls-core.js';

const { expect } = chai;

describe('tls-core', () => {
  afterEach(() => {
    // Leave the module on the secure default so other suites are unaffected.
    setInsecureTls(false);
  });

  describe('getHttpsAgent / setInsecureTls', () => {
    it('returns no agent on the secure default', () => {
      setInsecureTls(false);
      expect(getHttpsAgent()).to.equal(undefined);
    });

    it('returns a rejectUnauthorized=false agent when insecure', () => {
      setInsecureTls(true);
      const agent = getHttpsAgent();
      expect(agent).to.not.equal(undefined);
      expect(agent!.options.rejectUnauthorized).to.equal(false);
    });

    it('clears the agent when toggled back to secure', () => {
      setInsecureTls(true);
      setInsecureTls(false);
      expect(getHttpsAgent()).to.equal(undefined);
    });
  });

  describe('tlsErrorMessage', () => {
    const codes = [
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'CERT_UNTRUSTED',
      'CERT_NOT_YET_VALID',
      'CERT_HAS_EXPIRED',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ];

    for (const code of codes) {
      it(`describes the ${code} certificate error`, () => {
        const msg = tlsErrorMessage({ code }, 'https://example.com/FS/0');
        expect(msg).to.be.a('string');
        expect(msg).to.include('example.com');
        expect(msg).to.include('--insecure');
        expect(msg).to.include('"insecure": true');
      });
    }

    it('names the host parsed from the url', () => {
      const msg = tlsErrorMessage(
        { code: 'CERT_HAS_EXPIRED' },
        'https://svc.internal:6443/arcgis/rest'
      );
      expect(msg).to.include('svc.internal:6443');
    });

    it('returns null for a non-TLS error', () => {
      expect(tlsErrorMessage({ code: 'ECONNREFUSED' }, 'https://x')).to.equal(
        null
      );
    });

    it('returns null when the error has no code', () => {
      expect(tlsErrorMessage(new Error('boom'), 'https://x')).to.equal(null);
    });
  });
});
