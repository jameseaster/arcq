import * as chai from 'chai';
import fs from 'fs';
import { loadCache, saveCache } from '../lib/cache-core.js';
import type { Cache } from '../lib/types.js';
import { resolveCachePath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

describe('cache-core', () => {
  useTempStateDir();

  describe('loadCache', () => {
    it('returns {} when the file does not exist', () => {
      expect(loadCache()).to.deep.equal({});
    });

    it('returns the parsed cache when the file exists', () => {
      const data = { 'my-service': [{ id: 0, name: 'Parcels' }] };
      fs.writeFileSync(resolveCachePath(), JSON.stringify(data));
      expect(loadCache()).to.deep.equal(data);
    });
  });

  describe('saveCache', () => {
    it('writes the cache as JSON to the resolved cache path', () => {
      const data = { 'my-service': [{ id: 0, name: 'Parcels' }] };
      saveCache(data as unknown as Cache);
      expect(
        JSON.parse(fs.readFileSync(resolveCachePath(), 'utf-8'))
      ).to.deep.equal(data);
    });

    it('overwrites an existing cache file', () => {
      fs.writeFileSync(resolveCachePath(), JSON.stringify({ old: [] }));
      const data = { new: [{ id: 1, name: 'Roads' }] };
      saveCache(data as unknown as Cache);
      expect(
        JSON.parse(fs.readFileSync(resolveCachePath(), 'utf-8'))
      ).to.deep.equal(data);
    });
  });

  describe('round-trip', () => {
    it('loadCache returns what saveCache wrote', () => {
      const data = {
        'service-a': [
          { id: 0, name: 'Parcels', type: 'Feature Layer' },
          { id: 1, name: 'Owners', type: 'Table' },
        ],
        'service-b': [{ id: 0, name: 'Roads', type: 'Feature Layer' }],
      };
      saveCache(data as unknown as Cache);
      expect(loadCache()).to.deep.equal(data);
    });

    it('round-trips an empty cache', () => {
      saveCache({});
      expect(loadCache()).to.deep.equal({});
    });
  });
});
