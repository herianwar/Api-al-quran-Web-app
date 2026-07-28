import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ApiError } from '../dto/api-response';

const STATUS_ERROR_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan pada server';
    let errorCode: string | undefined;
    let domainCode: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        const msg = body.message;
        message = Array.isArray(msg)
          ? (msg as string[]).join(', ')
          : ((msg as string) ?? exception.message);
        if (typeof body.error === 'string') errorCode = body.error;
        // Kode domain opsional (mis. HAID_OVERLAP) diteruskan apa adanya agar
        // client bisa bercabang tanpa mem-parsing pesan.
        if (typeof body.code === 'string') domainCode = body.code;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // DB constraint violations (unique, FK, not-found, …). Without this
      // branch they fell through to the generic Error handler and leaked the
      // raw Prisma message as a 500 (a P2002 unique violation that should be
      // a 409, etc.).
      const mapped = mapPrismaKnownError(exception);
      status = mapped.status;
      message = mapped.message;
      errorCode = mapped.errorCode;
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Malformed query / wrong argument types reaching Prisma — caller input
      // problem, not a server fault. Never echo the (verbose) raw message.
      status = HttpStatus.BAD_REQUEST;
      message = 'Parameter permintaan tidak valid.';
      errorCode = 'BAD_REQUEST';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const payload: ApiError = {
      success: false,
      message,
      error: errorCode ?? STATUS_ERROR_CODE[status] ?? 'ERROR',
      statusCode: status,
      ...(domainCode ? { code: domainCode } : {}),
    };

    response.status(status).json(payload);
  }
}

/**
 * Translate a Prisma known-request error into an HTTP status + safe message.
 * Only the well-understood codes are mapped explicitly; anything else becomes
 * a generic 400 so we never surface the raw Prisma error (which can include
 * query fragments) to clients. See the Prisma error reference for codes.
 */
function mapPrismaKnownError(err: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
  errorCode: string;
} {
  switch (err.code) {
    case 'P2002': {
      // Unique constraint failed.
      const target = Array.isArray(err.meta?.target)
        ? (err.meta?.target as string[]).join(', ')
        : (err.meta?.target as string | undefined);
      return {
        status: HttpStatus.CONFLICT,
        message: target
          ? `Data dengan ${target} tersebut sudah ada.`
          : 'Data sudah ada (duplikat).',
        errorCode: 'CONFLICT',
      };
    }
    case 'P2025':
      // Record required for the operation was not found.
      return {
        status: HttpStatus.NOT_FOUND,
        message:
          (err.meta?.cause as string | undefined) ?? 'Data tidak ditemukan.',
        errorCode: 'NOT_FOUND',
      };
    case 'P2003':
      // Foreign-key constraint failed.
      return {
        status: HttpStatus.CONFLICT,
        message: 'Operasi melanggar relasi data (foreign key).',
        errorCode: 'CONFLICT',
      };
    case 'P2014':
      // Change would violate a required relation.
      return {
        status: HttpStatus.CONFLICT,
        message: 'Operasi melanggar relasi wajib antar data.',
        errorCode: 'CONFLICT',
      };
    case 'P2000':
      // Value too long for the column type.
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Nilai terlalu panjang untuk salah satu kolom.',
        errorCode: 'BAD_REQUEST',
      };
    case 'P2011':
      // Null constraint violation.
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Ada kolom wajib yang tidak boleh kosong.',
        errorCode: 'BAD_REQUEST',
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Permintaan database tidak dapat diproses.',
        errorCode: 'DATABASE_ERROR',
      };
  }
}
