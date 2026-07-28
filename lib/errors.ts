// Errors carry the process exit code: 1 general, 2 token invalid/expired.

export class ArcqError extends Error {
  exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'ArcqError';
    this.exitCode = exitCode;
  }
}

export function tokenError(): ArcqError {
  return new ArcqError(
    'token invalid or expired - run: arcq token set or arcq token refresh',
    2
  );
}
