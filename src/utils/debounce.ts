/**
 * Debounced function wrapper
 */
export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  /** Cancel pending execution */
  cancel: () => void;
  /** Flush: execute immediately if pending */
  flush: () => void;
}

/**
 * Create a debounced version of a function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      const argsToUse = lastArgs ?? ([] as unknown as Parameters<T>);
      lastArgs = null;
      fn(...argsToUse);
    }, ms);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
      const argsToUse = lastArgs ?? ([] as unknown as Parameters<T>);
      lastArgs = null;
      fn(...argsToUse);
    }
  };

  return debounced as DebouncedFunction<T>;
}

