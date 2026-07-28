import readline from 'readline';
import { ArcqError } from './errors.js';

export interface Prompter {
  prompt: (question: string) => Promise<string>;
  close: () => void;
}

// One shared readline interface for a whole interactive flow, with line
// buffering. Two piped-stdin hazards drive this shape: closing an interface
// ends the stream (so per-question interfaces strand later prompts), and lines
// can arrive BEFORE their question is asked (piped input drains - and may
// EOF-close the interface - while earlier async work like the portal-default
// lookup is still running). Buffered lines answer prompts in order; an input
// that ends before all prompts are answered rejects instead of hanging.
// Prompts go to stderr so interactive flows never contaminate stdout.
export function makePrompter(): Prompter {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const buffered: string[] = [];
  const waiters: Array<{
    resolve: (line: string) => void;
    reject: (err: Error) => void;
  }> = [];
  let closed = false;

  const endedEarly = () =>
    new ArcqError('input ended before all prompts were answered');

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else buffered.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) {
      waiters.shift()!.reject(endedEarly());
    }
  });

  return {
    prompt: (question) => {
      process.stderr.write(question);
      if (buffered.length > 0) return Promise.resolve(buffered.shift()!);
      if (closed) return Promise.reject(endedEarly());
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    close: () => rl.close(),
  };
}
