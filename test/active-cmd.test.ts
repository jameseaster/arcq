import * as chai from 'chai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import activeCmd from '../lib/active-cmd.js';
import type { Context } from '../lib/types.js';

const { expect } = chai;

const CONTEXT_PATH = path.join(os.homedir(), '.arcq-context.json');

describe('active-cmd', () => {
  let contextBackup: string | null;
  let logs: string[];
  let originalLog: typeof console.log;

  function setContext(ctx: Context) {
    fs.writeFileSync(CONTEXT_PATH, JSON.stringify(ctx));
  }

  beforeEach(() => {
    contextBackup = fs.existsSync(CONTEXT_PATH)
      ? fs.readFileSync(CONTEXT_PATH, 'utf-8')
      : null;
    if (fs.existsSync(CONTEXT_PATH)) fs.unlinkSync(CONTEXT_PATH);

    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;

    if (contextBackup !== null) {
      fs.writeFileSync(CONTEXT_PATH, contextBackup);
    } else if (fs.existsSync(CONTEXT_PATH)) {
      fs.unlinkSync(CONTEXT_PATH);
    }
  });

  it('prints service:id → name and the url for a full context', () => {
    setContext({
      service: 'my-service',
      layerId: 3,
      name: 'Parcels',
      url: 'https://example.com/FS/3',
    });
    activeCmd();
    expect(logs[0]).to.equal('my-service:3 → Parcels');
    expect(logs[1]).to.equal('https://example.com/FS/3');
  });

  it('falls back to the name when service/id are missing', () => {
    setContext({ name: 'my-parcels', url: 'https://example.com/FS/0' });
    activeCmd();
    expect(logs[0]).to.equal('my-parcels');
    expect(logs[1]).to.equal('https://example.com/FS/0');
  });

  it('falls back to the url when the context has only a url', () => {
    setContext({ url: 'https://example.com/FS/0' });
    activeCmd();
    expect(logs[0]).to.equal('https://example.com/FS/0');
  });

  it('prints the no-active-layer line when no context is set', () => {
    activeCmd();
    expect(logs.join(' ')).to.include('no active layer - run: arcq use');
  });
});
