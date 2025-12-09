/**
 * @file Base Error Classes
 */

/**
 * Lightweight base error to provide a consistent name property.
 */
export class BaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
