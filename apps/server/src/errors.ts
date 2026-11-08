import type { z } from 'zod';

/**
 * Uniform error envelope for every route: `{ error, message, details? }`
 * (docs/CONTRACT.md, "Errors").
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function httpError(statusCode: number, code: string, message: string, details?: unknown): HttpError {
  return new HttpError(statusCode, code, message, details);
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Parse untrusted input with a zod schema, throwing the contract's 400 envelope. */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown, what = 'Request body'): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw httpError(400, 'validation_error', `${what} failed validation.`, details);
  }
  return result.data;
}
