import * as chai from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import layersCmd from '../lib/layers-cmd.js';
import type { Config } from '../lib/types.js';

const { expect } = chai;

const DEFAULT_PATH = path.join(os.homedir(), '.arcq.json');
const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-layers-config.json');

describe('layers-cmd', () => {
  let originalEnv: string | undefined;
  let defaultBackup: string | null;
  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    originalEnv = process.env.ARCQ_CONFIG;
    process.env.ARCQ_CONFIG = TEMP_CONFIG;

    defaultBackup = fs.existsSync(DEFAULT_PATH)
      ? fs.readFileSync(DEFAULT_PATH, 'utf-8')
      : null;
    if (fs.existsSync(DEFAULT_PATH)) fs.unlinkSync(DEFAULT_PATH);
    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);

    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;

    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }

    if (defaultBackup !== null) {
      fs.writeFileSync(DEFAULT_PATH, defaultBackup);
    } else if (fs.existsSync(DEFAULT_PATH)) {
      fs.unlinkSync(DEFAULT_PATH);
    }

    if (fs.existsSync(TEMP_CONFIG)) fs.unlinkSync(TEMP_CONFIG);
  });

  function writeConfig(config: Config) {
    fs.writeFileSync(TEMP_CONFIG, JSON.stringify(config));
  }

  it('prints each layer as "key → url"', () => {
    writeConfig({
      layers: {
        'my-service-parcels': 'https://example.com/FeatureServer/0',
        'my-service-roads': 'https://example.com/FeatureServer/1',
      },
    });
    layersCmd();
    expect(logs).to.include(
      'my-service-parcels → https://example.com/FeatureServer/0'
    );
    expect(logs).to.include(
      'my-service-roads → https://example.com/FeatureServer/1'
    );
  });

  it('prints only the key with --names', () => {
    writeConfig({
      layers: {
        'my-service-parcels': 'https://example.com/FeatureServer/0',
      },
    });
    layersCmd(['--names']);
    expect(logs).to.include('my-service-parcels');
    expect(logs.join(' ')).to.not.include('https://');
  });

  it('prints a hint when no layers are in the config', () => {
    writeConfig({});
    layersCmd();
    expect(logs.join(' ')).to.include('arcq sync');
  });

  it('prints a hint when config file does not exist', () => {
    layersCmd();
    expect(logs.join(' ')).to.include('arcq sync');
  });
});
