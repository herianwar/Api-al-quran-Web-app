import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, PageViewDto } from './dto/pageview.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Anonymous-friendly tracker endpoint. Accepts a page view; if the caller
   * is authenticated (Bearer JWT present and valid) the user id is attached
   * — otherwise it falls through to anonymous.
   *
   * Per-IP/UA throttle is tight (60 hits per 60s) to deter abuse without
   * harming normal browsing.
   */
  @Post('pageview')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Record a page view (anonymous OK; user id auto-attached when JWT valid)',
  })
  track(
    @Req() req: Request,
    @Body() dto: PageViewDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.analytics.track(req, dto, userId);
  }
}

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/analytics')
export class AnalyticsAdminController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('traffic')
  @ApiOperation({
    summary: 'Traffic aggregates: headline, daily, top pages, referrers, device/browser/OS/country splits',
  })
  traffic(@Query() query: AnalyticsQueryDto) {
    const days = query.range ? parseInt(query.range, 10) : 7;
    return this.analytics.getTraffic(days);
  }

  @Get('traffic/realtime')
  @ApiOperation({ summary: 'Visitors active in the last 5 minutes + top paths' })
  realtime() {
    return this.analytics.getRealtime();
  }
}
