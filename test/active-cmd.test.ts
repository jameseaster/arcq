import * as chai from 'chai';
import fs from 'fs';
import activeCmd from '../lib/active-cmd.js';
import type { Context } from '../lib/types.js';
import { resolveContextPath } from '../lib/paths-core.js';
import { useTempStateDir } from './state-dir.js';

const { expect } = chai;

describe('active-cmd', () => {
  useTempStateDir();

  let logs: string[];
  let originalLog: typeof console.log;

  function setContext(ctx: Context) {
    fs.writeFileSync(resolveContextPath(), JSON.stringify(ctx));
  }

  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
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
