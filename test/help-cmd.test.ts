import * as chai from 'chai';
import path from 'path';
import os from 'os';
import helpCmd from '../lib/help-cmd.js';

const { expect } = chai;

function captureHelp(): string {
  const captured: string[] = [];
  const orig = console.log;
  console.log = (...args) => captured.push(args.join(' '));
  try {
    helpCmd();
  } finally {
    console.log = orig;
  }
  return captured.join('\n');
}

describe('help-cmd', () => {
  let output: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ARCQ_CONFIG;
    delete process.env.ARCQ_CONFIG;
    output = captureHelp();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ARCQ_CONFIG;
    } else {
      process.env.ARCQ_CONFIG = originalEnv;
    }
  });

  it('prints output', () => {
    expect(output.length).to.be.above(0);
  });

  it('lists all commands', () => {
    for (const cmd of [
      'refresh',
      'sync',
      'use',
      'active',
      'query',
      'fields',
      'list',
      'layers',
      'services add',
      'token set',
      'token show',
      'version',
    ]) {
      expect(output).to.include(cmd);
    }
  });

  it('documents the query shaping flags', () => {
    for (const flag of ['--out-fields', '--limit', '--count', '--order-by']) {
      expect(output).to.include(flag);
    }
  });

  it('shows the single-quote string-literal rule with a copyable example', () => {
    expect(output).to.include(`"STATUS = 'ACTIVE'"`);
    expect(output).to.include('SINGLE quotes');
  });

  it('documents the exit-code contract', () => {
    expect(output).to.include('Exit codes');
    expect(output).to.include('token invalid or expired');
  });

  it('shows the real config path', () => {
    expect(output).to.include(path.join(os.homedir(), '.arcq.json'));
  });

  it('reflects an ARCQ_CONFIG override in the config path', () => {
    const override = path.join(os.tmpdir(), 'arcq-help-test.json');
    const original = process.env.ARCQ_CONFIG;
    process.env.ARCQ_CONFIG = override;
    try {
      expect(captureHelp()).to.include(override);
    } finally {
      if (original === undefined) {
        delete process.env.ARCQ_CONFIG;
      } else {
        process.env.ARCQ_CONFIG = original;
      }
    }
  });

  it('mentions the ARCQ_CONFIG env var', () => {
    expect(output).to.include('ARCQ_CONFIG');
  });

  it('does not claim the stale dev/cli-config path', () => {
    expect(output).to.not.include('dev/cli-config');
  });
});
