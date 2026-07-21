import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CACHE_PATH, saveCache } from '../lib/cache-core.js';
import { loadContext } from '../lib/context-core.js';
import interactiveCmd from '../lib/interactive-cmd.js';
import { ArcqError } from '../lib/errors.js';
import type { Cache } from '../lib/types.js';

const { expect } = chai;

const CONTEXT_PATH = path.join(os.homedir(), '.arcq-context.json');
const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-use-config.json');

// Fake fzf: if ARCQ_TEST_SELECT is set, grep for that string; otherwise head -1.
// This lets each test control which layer gets "selected" via process.env.
const FAKE_FZF_DIR = path.join(os.tmpdir(), 'arcq-test-fzf');
const FAKE_FZF_PATH = path.join(FAKE_FZF_DIR, 'fzf');

const FAKE_CACHE = {
  'service-a': [
    { id: 0, name: 'Parcels', url: 'https://example.com/A/FeatureServer/0' },
    { id: 1, name: 'Owners', url: 'https://example.com/A/FeatureServer/1' },
    { id: 10, name: 'Zoning', url: 'https://example.com/A/FeatureServer/10' },
  ],
  'service-b': [
    { id: 0, name: 'Roads', url: 'https://example.com/B/FeatureServer/0' },
  ],
} as unknown as Cache;

describe('interactive-cmd', () => {
  let cacheBackup: string | null;
  let contextBackup: string | null;
  let originalPath: string | undefined;
  let originalEnv: string | undefined;

  function writeConfig(layers: Record<string, string>) {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ layers }));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
  }

  before(() => {
    fs.mkdirSync(FAKE_FZF_DIR, { recursive: true });
    fs.writeFileSync(
      FAKE_FZF_PATH,
      '#!/bin/sh\nif [ -n "$ARCQ_TEST_SELECT" ]; then grep "$ARCQ_TEST_SELECT"; else head -1; fi\n'
    );
    fs.chmodSync(FAKE_FZF_PATH, '755');
  });

  after(() => {
    fs.rmSync(FAKE_FZF_DIR, { recursive: true });
  });

  beforeEach(() => {
    cacheBackup = fs.existsSync(CACHE_PATH)
      ? fs.readFileSync(CACHE_PATH, 'utf-8')
      : null;
    contextBackup = fs.existsSync(CONTEXT_PATH)
      ? fs.readFileSync(CONTEXT_PATH, 'utf-8')
      : null;
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
    if (fs.existsSync(CONTEXT_PATH)) fs.unlinkSync(CONTEXT_PATH);

    originalPath = process.env.PATH;
    process.env.PATH = `${FAKE_FZF_DIR}:${process.env.PATH}`;
    delete process.env.ARCQ_TEST_SELECT;

    originalEnv = process.env.ARCQ_CONFIG;
    delete process.env.ARCQ_CONFIG;
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    delete process.env.ARCQ_TEST_SELECT;

    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);

    if (cacheBackup !== null) {
      fs.writeFileSync(CACHE_PATH, cacheBackup);
    } else if (fs.existsSync(CACHE_PATH)) {
      fs.unlinkSync(CACHE_PATH);
    }

    if (contextBackup !== null) {
      fs.writeFileSync(CONTEXT_PATH, contextBackup);
    } else if (fs.existsSync(CONTEXT_PATH)) {
      fs.unlinkSync(CONTEXT_PATH);
    }
  });

  it('saves the selected layer as the active context', async () => {
    saveCache(FAKE_CACHE);
    process.env.ARCQ_TEST_SELECT = 'service-a:0';

    await interactiveCmd();

    expect(loadContext()).to.deep.equal({
      service: 'service-a',
      layerId: 0,
      name: 'Parcels',
      url: 'https://example.com/A/FeatureServer/0',
    });
  });

  it('correctly matches a layer from a non-first service', async () => {
    saveCache(FAKE_CACHE);
    process.env.ARCQ_TEST_SELECT = 'service-b:0';

    await interactiveCmd();

    expect(loadContext()).to.deep.equal({
      service: 'service-b',
      layerId: 0,
      name: 'Roads',
      url: 'https://example.com/B/FeatureServer/0',
    });
  });

  it('correctly matches a non-zero layer id', async () => {
    saveCache(FAKE_CACHE);
    process.env.ARCQ_TEST_SELECT = 'service-a:1';

    await interactiveCmd();

    expect(loadContext()).to.deep.equal({
      service: 'service-a',
      layerId: 1,
      name: 'Owners',
      url: 'https://example.com/A/FeatureServer/1',
    });
  });

  it('overwrites an existing context', async () => {
    fs.writeFileSync(
      CONTEXT_PATH,
      JSON.stringify({ service: 'old', layerId: 99, name: 'Old', url: 'https://old' })
    );
    saveCache(FAKE_CACHE);
    process.env.ARCQ_TEST_SELECT = 'service-b:0';

    await interactiveCmd();

    expect(loadContext()!.name).to.equal('Roads');
  });

  it('does not match a layer whose id is a prefix of the selected id', async () => {
    saveCache(FAKE_CACHE);
    process.env.ARCQ_TEST_SELECT = 'service-a:10';

    await interactiveCmd();

    expect(loadContext()).to.deep.equal({
      service: 'service-a',
      layerId: 10,
      name: 'Zoning',
      url: 'https://example.com/A/FeatureServer/10',
    });
  });

  it('logs the selected layer name', async () => {
    saveCache(FAKE_CACHE);
    process.env.ARCQ_TEST_SELECT = 'service-a:0';

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await interactiveCmd();
    } finally {
      console.log = orig;
    }

    expect(logs.join(' ')).to.include('Parcels');
  });

  describe('named selection — arcq use <name>', () => {
    it('resolves a config layer key without invoking fzf', async () => {
      writeConfig({ 'my-parcels': 'https://example.com/CFG/0' });
      // No cache and a PATH-first fake fzf that would pick nothing useful:
      // a successful named selection proves fzf was bypassed.
      await interactiveCmd(['my-parcels']);
      expect(loadContext()).to.deep.equal({
        name: 'my-parcels',
        url: 'https://example.com/CFG/0',
      });
    });

    it('resolves a cache layer by service:id', async () => {
      saveCache(FAKE_CACHE);
      await interactiveCmd(['service-a:1']);
      expect(loadContext()).to.deep.equal({
        service: 'service-a',
        layerId: 1,
        name: 'Owners',
        url: 'https://example.com/A/FeatureServer/1',
      });
    });

    it('resolves a cache layer by exact name', async () => {
      saveCache(FAKE_CACHE);
      await interactiveCmd(['Roads']);
      expect(loadContext()).to.deep.equal({
        service: 'service-b',
        layerId: 0,
        name: 'Roads',
        url: 'https://example.com/B/FeatureServer/0',
      });
    });

    it('prefers a config key over a cache name', async () => {
      saveCache(FAKE_CACHE);
      writeConfig({ Roads: 'https://example.com/CFG/9' });
      await interactiveCmd(['Roads']);
      expect(loadContext()).to.deep.equal({
        name: 'Roads',
        url: 'https://example.com/CFG/9',
      });
    });

    it('rejects a name that exists in multiple services, listing candidates', async () => {
      saveCache({
        'service-a': [
          { id: 0, name: 'Parcels', url: 'https://example.com/A/0' },
        ],
        'service-b': [
          { id: 3, name: 'Parcels', url: 'https://example.com/B/3' },
        ],
      } as unknown as Cache);

      let thrown;
      try {
        await interactiveCmd(['Parcels']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include('ambiguous');
      expect((thrown as ArcqError).message).to.include('service-a:0');
      expect((thrown as ArcqError).message).to.include('service-b:3');
      expect(loadContext()).to.equal(null);
    });

    it('rejects an unknown name with suggestions', async () => {
      saveCache(FAKE_CACHE);
      let thrown;
      try {
        await interactiveCmd(['Parcel']);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).to.be.instanceOf(ArcqError);
      expect((thrown as ArcqError).message).to.include("unknown layer 'Parcel'");
      expect((thrown as ArcqError).message).to.include('Parcels');
      expect(loadContext()).to.equal(null);
    });

    it('logs the active-layer confirmation', async () => {
      saveCache(FAKE_CACHE);
      const logs: string[] = [];
      const orig = console.log;
      console.log = (...args) => logs.push(args.join(' '));
      try {
        await interactiveCmd(['service-a:0']);
      } finally {
        console.log = orig;
      }
      expect(logs.join(' ')).to.include('active layer set → Parcels');
    });
  });
});
