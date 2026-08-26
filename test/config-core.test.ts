import * as chai from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig } from '../lib/config-core.js';
import { resolveConfigPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-config.json');

describe('config-core', () => {
  useTempStateDir();

  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ARCQ_CONFIG;
    delete process.env.ARCQ_CONFIG;
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }

    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
  });

  it('returns {} when neither ARCQ_CONFIG nor the default file exists', () => {
    expect(loadConfig()).to.deep.equal({});
  });

  it('reads the state directory config when ARCQ_CONFIG is not set', () => {
    const config = { services: { svc: 'https://example.com' } };
    fs.writeFileSync(resolveConfigPath(), JSON.stringify(config));
    expect(loadConfig()).to.deep.equal(config);
  });

  it('returns {} when ARCQ_CONFIG points to a missing file', () => {
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
    expect(loadConfig()).to.deep.equal({});
  });

  it('returns parsed JSON when ARCQ_CONFIG is set', () => {
    const config = {
      services: { 'my-service': 'https://example.com/FeatureServer' },
      layers: { parcels: 'https://example.com/FeatureServer/0' },
    };
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify(config));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
    expect(loadConfig()).to.deep.equal(config);
  });

  it('reads a top-level insecure:true', () => {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ insecure: true }));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
    expect(loadConfig().insecure).to.equal(true);
  });

  it('ignores a non-boolean insecure value', () => {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify({ insecure: 'yes' }));
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
    expect(loadConfig().insecure).to.be.undefined;
  });

  it('returns an object with only the fields present in the file', () => {
    fs.writeFileSync(
      TEMP_CONFIG,
      JSON.stringify({ services: { svc: 'https://example.com' } })
    );
    process.env.ARCQ_CONFIG = TEMP_CONFIG;
    const config = loadConfig();
    expect(config.services).to.deep.equal({ svc: 'https://example.com' });
    expect(config.layers).to.be.undefined;
  });
});
