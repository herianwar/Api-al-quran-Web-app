import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CreateFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/**
 * Endpoint publik untuk mengirim masukan / pengajuan fitur dari app.
 *
 * Auth: `x-api-key` wajib (global ApiKeyGuard). Bearer token OPSIONAL —
 * OptionalJwtAuthGuard mengisi `req.user` kalau token valid, tapi tidak
 * pernah memblokir (guest tetap bisa submit).
 *
 * Rate limit: 5 submission / 10 menit per IP (anti-spam) — mengoverride
 * throttler global.
 */
@ApiTags('Feedback')
@ApiSecurity('api-key')
@ApiBearerAuth()
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Kirim masukan / pengajuan fitur (guest atau login)',
  })
  create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.service.create(dto, userId ?? null);
  }
}
