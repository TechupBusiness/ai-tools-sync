/**
 * @file Result Type Tests
 * @description Tests for the Result type utility
 */

import { describe, it, expect } from 'vitest';

import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  tryCatch,
  tryCatchAsync,
} from '../../../src/utils/result.js';

describe('Result Type', () => {
  describe('ok()', () => {
    it('should create a successful result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should work with complex types', () => {
      const result = ok({ name: 'test', value: [1, 2, 3] });
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ name: 'test', value: [1, 2, 3] });
    });
  });

  describe('err()', () => {
    it('should create a failed result', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });

    it('should work with custom error types', () => {
      const result = err({ code: 'NOT_FOUND', message: 'Item not found' });
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ code: 'NOT_FOUND', message: 'Item not found' });
    });
  });

  describe('isOk()', () => {
    it('should return true for Ok results', () => {
      expect(isOk(ok(42))).toBe(true);
    });

    it('should return false for Err results', () => {
      expect(isOk(err(new Error('test')))).toBe(false);
    });
  });

  describe('isErr()', () => {
    it('should return true for Err results', () => {
      expect(isErr(err(new Error('test')))).toBe(true);
    });

    it('should return false for Ok results', () => {
      expect(isErr(ok(42))).toBe(false);
    });
  });

  describe('unwrap()', () => {
    it('should return the value for Ok results', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('should throw for Err results', () => {
      const error = new Error('test error');
      expect(() => unwrap(err(error))).toThrow(error);
    });
  });

  describe('unwrapOr()', () => {
    it('should return the value for Ok results', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('should return the default for Err results', () => {
      expect(unwrapOr(err(new Error('test')), 0)).toBe(0);
    });
  });

  describe('map()', () => {
    it('should transform Ok values', () => {
      const result = map(ok(42), (x) => x * 2);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(84);
    });

    it('should pass through Err values', () => {
      const error = new Error('test');
      const result = map(err(error), (x: number) => x * 2);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('mapErr()', () => {
    it('should transform Err values', () => {
      const result = mapErr(err('error'), (e) => new Error(e));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('error');
      }
    });

    it('should pass through Ok values', () => {
      const result = mapErr(ok(42), (e: string) => new Error(e));
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });
  });

  describe('andThen()', () => {
    it('should chain successful operations', () => {
      const result = andThen(ok(42), (x) => ok(x * 2));
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(84);
    });

    it('should short-circuit on error', () => {
      const error = new Error('test');
      const result = andThen(err(error), (x: number) => ok(x * 2));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it('should propagate errors from the function', () => {
      const error = new Error('from function');
      const result = andThen(ok(42), () => err(error));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('tryCatch()', () => {
    it('should return Ok for successful functions', () => {
      const result = tryCatch(() => 42);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should return Err for throwing functions', () => {
      const error = new Error('test');
      const result = tryCatch(() => {
        throw error;
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it('should apply error mapper', () => {
      const result = tryCatch(
        () => {
          throw new Error('original');
        },
        (e) => ({ code: 'ERROR', original: e })
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('ERROR');
      }
    });
  });

  describe('tryCatchAsync()', () => {
    it('should return Ok for successful async functions', async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should return Err for rejecting async functions', async () => {
      const error = new Error('test');
      const result = await tryCatchAsync(async () => {
        throw error;
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it('should apply error mapper', async () => {
      const result = await tryCatchAsync(
        async () => {
          throw new Error('original');
        },
        (e) => ({ code: 'ERROR', original: e })
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('ERROR');
      }
    });
  });
});

