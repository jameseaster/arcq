import * as chai from 'chai';
import { ArcqError, tokenError } from '../lib/errors.js';

const { expect } = chai;

describe('errors', () => {
  describe('ArcqError', () => {
    it('defaults exitCode to 1', () => {
      const err = new ArcqError('boom');
      expect(err.exitCode).to.equal(1);
    });

    it('keeps the given message', () => {
      const err = new ArcqError('boom');
      expect(err.message).to.equal('boom');
    });

    it('accepts a custom exit code', () => {
      const err = new ArcqError('boom', 3);
      expect(err.exitCode).to.equal(3);
    });

    it('is an instance of Error', () => {
      expect(new ArcqError('boom')).to.be.instanceOf(Error);
    });
  });

  describe('tokenError', () => {
    it('has exitCode 2', () => {
      expect(tokenError().exitCode).to.equal(2);
    });

    it('points at arcq token set', () => {
      expect(tokenError().message).to.equal(
        'token invalid or expired - run: arcq token set'
      );
    });
  });
});
