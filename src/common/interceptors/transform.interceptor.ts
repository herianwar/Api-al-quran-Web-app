import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccess, ResponsePayload } from '../dto/api-response';

/** Wraps every HTTP response in the standard success envelope. */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiSuccess<unknown>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<unknown>> {
    return next.handle().pipe(
      map((value): ApiSuccess<unknown> => {
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
