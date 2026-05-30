import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccess, ResponsePayload } from '../dto/api-response';

/**
 * Wraps every HTTP response in the standard success envelope. Binary
 * streams (StreamableFile) pass through untouched — wrapping them in JSON
 * would corrupt downloads like .sql.gz snapshots.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiSuccess<unknown> | StreamableFile>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<unknown> | StreamableFile> {
    return next.handle().pipe(
      map((value): ApiSuccess<unknown> | StreamableFile => {
        if (value instanceof StreamableFile) return value;
        if (value instanceof ResponsePayload) {
          return {
            success: true,
            message: value.message ?? 'OK',
            data: value.data,
            ...(value.meta ? { meta: value.meta } : {}),
          };
        }
        return {
          success: true,
          message: 'OK',
          data: value ?? null,
        };
      }),
    );
  }
}
