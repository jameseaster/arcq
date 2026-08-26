import fs from 'fs';
import os from 'os';
import path from 'path';

// Point arcq's state at a throwaway directory for the duration of a suite, so
// no test ever reads or writes the developer's real token, OAuth credential,
// config, context, or cache. A crash between hooks can no longer destroy a
// live credential, because the tests never touch one.
//
// Call inside a `describe`; it registers its own beforeEach/afterEach and
// returns a handle whose `path` is the directory for the running test.
export interface TempStateDir {
  readonly path: string;
}

export function useTempStateDir(): TempStateDir {
  let dir = '';
  let priorHome: string | undefined;

  beforeEach(() => {
    priorHome = process.env.ARCQ_HOME;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcq-state-'));
    process.env.ARCQ_HOME = dir;
  });

  afterEach(() => {
    if (priorHome === undefined) delete process.env.ARCQ_HOME;
    else process.env.ARCQ_HOME = priorHome;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return {
    get path(): string {
      return dir;
    },
  };
}
