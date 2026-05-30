import { SetMetadata } from '@nestjs/common';

/** Metadata key flagging a route/controller as exempt from the global
 * ApiKeyGuard (e.g. health checks, uptime monitors). */
export const SKIP_API_KEY = 'skipApiKey';

/** Mark a handler or controller as not requiring an API key. */
export const SkipApiKey = () => SetMetadata(SKIP_API_KEY, true);
