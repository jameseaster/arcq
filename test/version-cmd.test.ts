import * as chai from 'chai';
import { createRequire } from 'module';
import versionCmd, { getVersion } from '../lib/version-cmd.js';

const { expect } = chai;

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

describe('version-cmd', () => {
  it("getVersion returns the repo's package.json version", () => {
    expect(getVersion()).to.equal(pkg.version);
  });

  it('prints the version', () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      versionCmd();
    } finally {
      console.log = orig;
    }
    expect(logs).to.deep.equal([pkg.version]);
  });
});
