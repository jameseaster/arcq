import * as chai from 'chai';
import {
  parseServiceId,
  resolveLayerArg,
  suggestNames,
} from '../lib/layer-resolve.js';
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

  describe('parseServiceId', () => {
    it('splits a service and a numeric id', () => {
      expect(parseServiceId('ok-county:0')).to.deep.equal({
        service: 'ok-county',
        id: 0,
      });
    });

    it('splits on the last colon, so a service name may contain one', () => {
      expect(parseServiceId('odd:name:12')).to.deep.equal({
        service: 'odd:name',
        id: 12,
      });
    });

    it('rejects a non-numeric suffix', () => {
      expect(parseServiceId('foo:bar')).to.be.null;
    });

    it('rejects a value with no colon', () => {
      expect(parseServiceId('parcels')).to.be.null;
    });

    it('rejects an empty service name', () => {
      expect(parseServiceId(':0')).to.be.null;
    });

    it('never treats a URL as service:id', () => {
      expect(parseServiceId('https://example.com/FS/0')).to.be.null;
      expect(parseServiceId('http://host:8080')).to.be.null;
      expect(parseServiceId('https://host:8080/FS/0')).to.be.null;
    });
  });

  describe('resolveLayerArg with service:id', () => {
    const config: Config = {
      layers: { 'named-one': 'https://example.com/named/FS/1' },
      services: {
        'ok-county':
          'https://example.com/arcgis/rest/services/County/FeatureServer',
        other: 'https://other.example.com/FS',
      },
    };

    it('resolves against the configured services', () => {
      const { url } = resolveLayerArg('ok-county:0', config);
      expect(url).to.equal(
        'https://example.com/arcgis/rest/services/County/FeatureServer/0'
      );
    });

    it('reports the service and layer as the source', () => {
      const { source } = resolveLayerArg('ok-county:0', config);
      expect(source).to.equal("service 'ok-county' layer 0");
    });

    it('handles a non-zero id', () => {
      expect(resolveLayerArg('other:12', config).url).to.equal(
        'https://other.example.com/FS/12'
      );
    });

    it('does not double the slash on a trailing-slash service URL', () => {
      const withSlash: Config = { services: { s: 'https://example.com/FS/' } };
      expect(resolveLayerArg('s:0', withSlash).url).to.equal(
        'https://example.com/FS/0'
      );
    });

    it('lets a named layer win over a same-named service reference', () => {
      const shadowed: Config = {
        layers: { 'ok-county:0': 'https://example.com/explicit' },
        services: { 'ok-county': 'https://example.com/FS' },
      };
      expect(resolveLayerArg('ok-county:0', shadowed).url).to.equal(
        'https://example.com/explicit'
      );
    });

    it('leaves a raw URL alone', () => {
      const url = 'https://example.com/arcgis/rest/services/X/FeatureServer/0';
      expect(resolveLayerArg(url, config).source).to.equal('raw URL');
    });

    it('leaves a raw URL with a port alone', () => {
      const url = 'https://example.com:6443/arcgis/rest/services/X/FS/0';
      const resolved = resolveLayerArg(url, config);
      expect(resolved.source).to.equal('raw URL');
      expect(resolved.url).to.equal(url);
    });

    it('still throws for an unknown service key', () => {
      let thrown;
      try {
        resolveLayerArg('nope:0', config);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
    });

    it('suggests service keys, not just layer keys', () => {
      let thrown;
      try {
        resolveLayerArg('ok-county', config);
      } catch (e) {
        thrown = e;
      }
      expect((thrown as ArcqError).message).to.include('ok-county');
    });

    it('names service:id in the unknown-layer error', () => {
      let thrown;
      try {
        resolveLayerArg('totally-unknown', config);
      } catch (e) {
        thrown = e;
      }
      expect((thrown as ArcqError).message).to.include('<service>:<id>');
    });
  });
});
