/**
 * @file Result Type Utility
 * @description Generic Result type for error handling without exceptions
 *
 * This module provides a Result type similar to Rust's Result<T, E> for
 * explicit error handling throughout the codebase.
 */

/**
 * Represents a successful result containing a value of type T
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Represents a failed result containing an error of type E
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A Result is either Ok with a value or Err with an error
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Creates a successful Result containing the given value
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Creates a failed Result containing the given error
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Type guard to check if a Result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Type guard to check if a Result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Unwraps a Result, returning the value if Ok or throwing if Err
 * @throws The error if the Result is Err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  // Throw Error object for ESLint only-throw-error rule compliance
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
}

/**
 * Unwraps a Result, returning the value if Ok or the default value if Err
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Maps a Result<T, E> to Result<U, E> by applying a function to the Ok value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Maps a Result<T, E> to Result<T, F> by applying a function to the Err value
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chains Result operations, similar to flatMap
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Wraps a function that might throw into one that returns a Result
 */
export function tryCatch<T, E = Error>(fn: () => T, mapError?: (e: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (e) {
    if (mapError) {
      return err(mapError(e));
    }
    return err(e as E);
  }
}

/**
 * Wraps an async function that might throw into one that returns a Promise<Result>
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (e) {
    if (mapError) {
      return err(mapError(e));
    }
    return err(e as E);
  }
}
