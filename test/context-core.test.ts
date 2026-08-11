import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadContext, saveContext } from '../lib/context-core.js';

const { expect } = chai;

const CONTEXT_PATH = path.join(os.homedir(), '.arcq-context.json');

describe('context-core', () => {
  let backup: string | null;

  beforeEach(() => {
    backup = fs.existsSync(CONTEXT_PATH)
      ? fs.readFileSync(CONTEXT_PATH, 'utf-8')
      : null;
    if (fs.existsSync(CONTEXT_PATH)) fs.unlinkSync(CONTEXT_PATH);
  });

  afterEach(() => {
    if (backup !== null) {
      fs.writeFileSync(CONTEXT_PATH, backup);
    } else if (fs.existsSync(CONTEXT_PATH)) {
      fs.unlinkSync(CONTEXT_PATH);
    }
  });

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
      fs.writeFileSync(CONTEXT_PATH, JSON.stringify(ctx));
      expect(loadContext()).to.deep.equal(ctx);
    });
  });

  describe('saveContext', () => {
    it('writes the context as JSON to CONTEXT_PATH', () => {
      const ctx = {
        service: 'svc',
        layerId: 1,
        name: 'Roads',
        url: 'https://example.com/1',
      };
      saveContext(ctx);
      const written = JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf-8'));
      expect(written).to.deep.equal(ctx);
    });

    it('overwrites an existing context', () => {
      fs.writeFileSync(CONTEXT_PATH, JSON.stringify({ service: 'old' }));
      const ctx = {
        service: 'new',
        layerId: 2,
        name: 'New',
        url: 'https://example.com/2',
      };
      saveContext(ctx);
      expect(JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf-8'))).to.deep.equal(
        ctx
      );
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
