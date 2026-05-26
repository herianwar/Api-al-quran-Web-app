/** Standard success envelope returned by every endpoint. */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

/** Standard error envelope returned by the global exception filter. */
export interface ApiError {
  success: false;
  message: string;
  error: string;
  statusCode: number;
}

/**
 * Wrapper a controller/service can return to customise the success message and
 * meta block. Plain return values are wrapped automatically by the
 * TransformInterceptor with a default message.
 */
export class ResponsePayload<T> {
  constructor(
    public readonly data: T,
    public readonly message?: string,
    public readonly meta?: Record<string, unknown>,
  ) {}
}

export function ok<T>(
  data: T,
  message?: string,
  meta?: Record<string, unknown>,
): ResponsePayload<T> {
  return new ResponsePayload(data, message, meta);
}
