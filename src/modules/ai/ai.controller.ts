import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AiQueriesListDto, AskBodyDto, AskQueryDto } from './dto/ask.dto';
import { SemanticSearchService } from './semantic-search.service';

@ApiTags('AI Search')
@Controller('quran')
export class AiController {
  constructor(private readonly semantic: SemanticSearchService) {}

  /** Simple link-friendly GET. Includes GPT summary unless ?withSummary=false. */
  @Get('ask')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Hybrid semantic+text search dengan GPT summary. RRF fusion, score threshold, Redis cache.',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ask(
    @Req() req: Request,
    @Query() query: AskQueryDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.semantic.ask(query.q, {
      limit: query.limit ?? 8,
      conversationId: query.conversationId,
      withSummary: query.withSummary !== false,
      userId,
      req,
    });
  }

  /** POST form supports `history` for coherent follow-up turns in /tanya. */
  @Post('ask')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Sama dengan GET /quran/ask tapi support conversation history',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  askWithHistory(
    @Req() req: Request,
    @Body() body: AskBodyDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.semantic.ask(body.q, {
      limit: body.limit ?? 8,
      conversationId: body.conversationId,
      conversationHistory: body.history,
      withSummary: body.withSummary !== false,
      userId,
      req,
    });
  }
}

@ApiTags('Admin AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/ai')
export class AiAdminController {
  constructor(private readonly semantic: SemanticSearchService) {}

  @Get('coverage')
  @ApiOperation({ summary: 'Cakupan embedding ayat' })
  coverage() {
    return this.semantic.coverage();
  }

  @Get('cost')
  @ApiOperation({
    summary: 'Cost & token usage per hari, per model + budget vs spend',
  })
  cost(@Query('range') range?: string) {
    const days = range ? parseInt(range, 10) : 30;
    return this.semantic.cost(days);
  }

  @Get('queries')
  @ApiOperation({
    summary: 'Log queries + top 30d + gap-content (no-match)',
  })
  queries(@Query() q: AiQueriesListDto) {
    return this.semantic.queries(
      q.page ?? 1,
      q.limit ?? 50,
      q.onlyNoResults === true,
    );
  }
}
