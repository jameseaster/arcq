import * as chai from 'chai';
import { resolveLayerArg, suggestNames } from '../lib/layer-resolve.js';
import { ArcqError } from '../lib/errors.js';
import type { Config } from '../lib/types.js';

const { expect } = chai;

describe('layer-resolve', () => {
  describe('resolveLayerArg', () => {
    const config: Config = {
      layers: {
        'my-service-parcels': 'https://example.com/FS/3',
        'my-service-addresses': 'https://example.com/FS/19',
      },
    };

    it('resolves a config layer by name', () => {
      expect(resolveLayerArg('my-service-addresses', config)).to.deep.equal({
        url: 'https://example.com/FS/19',
        source: "named layer 'my-service-addresses'",
      });
    });

    it('passes through anything containing :// as a raw URL', () => {
      expect(resolveLayerArg('https://example.com/FS/0', config)).to.deep.equal(
        { url: 'https://example.com/FS/0', source: 'raw URL' }
      );
    });

    it('prefers a config hit over raw-URL detection', () => {
      const cfg: Config = { layers: { 'http://weird': 'https://real/0' } };
      expect(resolveLayerArg('http://weird', cfg).url).to.equal(
        'https://real/0'
      );
    });

    it('throws an ArcqError for an unknown name', () => {
      let thrown;
      try {
        resolveLayerArg('parcls', config);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include(
        "unknown layer 'parcls'"
      );
    });

    it('includes closest-match suggestions in the error', () => {
      let thrown;
      try {
        resolveLayerArg('parcels', config);
      } catch (e) {
        thrown = e;
      }
      expect((thrown as ArcqError).message).to.include('my-service-parcels');
      expect((thrown as ArcqError).message).to.include('arcq layers --names');
    });

    it('omits the did-you-mean hint when nothing is close', () => {
      let thrown;
      try {
        resolveLayerArg('zzz', config);
      } catch (e) {
        thrown = e;
      }
      expect((thrown as ArcqError).message).to.not.include('did you mean');
    });

    it('throws when the config has no layers at all', () => {
      let thrown;
      try {
        resolveLayerArg('parcels', {});
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
    });
  });

  describe('suggestNames', () => {
    const candidates = [
      'my-service-parcels',
      'my-service-roads',
      'my-service-addresses',
      'other-service-addresses',
    ];

    it('ranks substring matches first', () => {
      const result = suggestNames('roads', candidates);
      expect(result[0]).to.equal('my-service-roads');
    });

    it('matches on shared hyphen tokens', () => {
      const result = suggestNames('addresses-stuff', candidates);
      expect(result).to.include('my-service-addresses');
      expect(result).to.include('other-service-addresses');
    });

    it('caps results at 3', () => {
      expect(suggestNames('my-service', candidates)).to.have.length.at.most(3);
    });

    it('returns an empty array when nothing matches', () => {
      expect(suggestNames('zzz', candidates)).to.deep.equal([]);
    });

    it('is case-insensitive', () => {
      expect(suggestNames('ROADS', candidates)).to.include('my-service-roads');
    });
  });
});
