import * as chai from 'chai';
import fs from 'fs';
import { loadContext, saveContext } from '../lib/context-core.js';
import { resolveContextPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

describe('context-core', () => {
  useTempStateDir();

  describe('loadContext', () => {
    it('returns null when no context file exists', () => {
      expect(loadContext()).to.be.null;
    });

    it('returns the parsed context when the file exists', () => {
      const ctx = {
        service: 'svc',
        layerId: 0,
        name: 'Parcels',
        url: 'https://example.com/0',
      };
      fs.writeFileSync(resolveContextPath(), JSON.stringify(ctx));
      expect(loadContext()).to.deep.equal(ctx);
    });
  });

  describe('saveContext', () => {
    it('writes the context as JSON to the resolved context path', () => {
      const ctx = {
        service: 'svc',
        layerId: 1,
        name: 'Roads',
        url: 'https://example.com/1',
      };
      saveContext(ctx);
      const written = JSON.parse(
        fs.readFileSync(resolveContextPath(), 'utf-8')
      );
      expect(written).to.deep.equal(ctx);
    });

    it('overwrites an existing context', () => {
      fs.writeFileSync(
        resolveContextPath(),
        JSON.stringify({ service: 'old' })
      );
      const ctx = {
        service: 'new',
        layerId: 2,
        name: 'New',
        url: 'https://example.com/2',
      };
      saveContext(ctx);
      expect(
        JSON.parse(fs.readFileSync(resolveContextPath(), 'utf-8'))
      ).to.deep.equal(ctx);
    });
  });

  describe('round-trip', () => {
    it('loadContext returns what saveContext wrote', () => {
      const ctx = {
        service: 'svc',
        layerId: 5,
        name: 'Test',
        url: 'https://example.com/5',
      };
      saveContext(ctx);
      expect(loadContext()).to.deep.equal(ctx);
    });
  });
});
