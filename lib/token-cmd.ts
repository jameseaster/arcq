import { getToken, setTokenValue } from './token-core.js';

export default function tokenCmd(args: string[]): void {
  const sub = args[0];

  if (sub === 'show') {
    console.log(getToken() || 'No token set.');
    return;
  }

  if (sub === 'set') {
    const token = args[1];
    if (!token) {
      console.log('Usage: arcq token set <token>');
      return;
    }
    setTokenValue(token);
    console.log('Token saved.');
    return;
  }

  console.log('Usage:');
  console.log('  arcq token set <token>');
  console.log('  arcq token show');
}
