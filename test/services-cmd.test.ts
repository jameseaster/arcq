import * as chai from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import servicesCmd from '../lib/services-cmd.js';
import type { Config } from '../lib/types.js';

const { expect } = chai;

const DEFAULT_PATH = path.join(os.homedir(), '.arcq.json');
const TEMP_CONFIG = path.join(os.tmpdir(), 'arcq-test-services-config.json');

describe('services-cmd', () => {
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

  describe('add', () => {
    it('writes the service to the config', () => {
      writeConfig({});
      servicesCmd(['add', 'my-service', 'https://example.com/FeatureServer']);
      const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
      expect(config.services!['my-service']).to.equal(
        'https://example.com/FeatureServer'
      );
    });

    it('creates the config file when it does not exist', () => {
      servicesCmd(['add', 'my-service', 'https://example.com/FeatureServer']);
      const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
      expect(config.services!['my-service']).to.equal(
        'https://example.com/FeatureServer'
      );
    });

    it('preserves existing services', () => {
      writeConfig({
        services: { existing: 'https://example.com/Other' },
      });
      servicesCmd(['add', 'new-service', 'https://example.com/FeatureServer']);
      const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
      expect(config.services).to.have.keys('existing', 'new-service');
    });

    it('preserves other config keys', () => {
      writeConfig({ layers: { 'existing-layer': 'https://example.com/0' } });
      servicesCmd(['add', 'my-service', 'https://example.com/FeatureServer']);
      const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
      expect(config.layers).to.deep.equal({
        'existing-layer': 'https://example.com/0',
      });
    });

    it('overwrites an existing service with the same name', () => {
      writeConfig({
        services: { 'my-service': 'https://example.com/Old' },
      });
      servicesCmd(['add', 'my-service', 'https://example.com/New']);
      const config = JSON.parse(fs.readFileSync(TEMP_CONFIG, 'utf-8')) as Config;
      expect(config.services!['my-service']).to.equal(
        'https://example.com/New'
      );
    });

    it('logs confirmation', () => {
      writeConfig({});
      servicesCmd(['add', 'my-service', 'https://example.com/FeatureServer']);
      expect(logs.join(' ')).to.include('my-service');
    });

    it('prints usage when name is missing', () => {
      servicesCmd(['add']);
      expect(logs.join(' ')).to.include('Usage');
    });

    it('prints usage when url is missing', () => {
      servicesCmd(['add', 'my-service']);
      expect(logs.join(' ')).to.include('Usage');
    });
  });

  describe('unknown subcommand', () => {
    it('prints usage', () => {
      servicesCmd([]);
      expect(logs.join(' ')).to.include('Usage');
    });
  });
});
