import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CreateCommentDto } from './dto/serambi.dto';
import { SerambiService } from './serambi.service';

/**
 * Feed Serambi publik yang dipakai app Android.
 *
 * Auth: `x-api-key` wajib (global ApiKeyGuard). Endpoint baca memakai
 * OptionalJwtAuthGuard (Bearer opsional → mengisi `liked`); like & komentar
 * memakai JwtAuthGuard (Bearer wajib, 401 tanpa token).
 */
@ApiTags('Serambi')
@ApiSecurity('api-key')
@ApiBearerAuth()
@Controller('serambi')
export class SerambiController {
  constructor(private readonly service: SerambiService) {}

  @Get('posts')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List feed Serambi (published, paginated)' })
  list(
    @Query() query: PaginationQueryDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.service.listPublic(query, userId ?? null);
  }

  @Get('posts/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Detail satu post Serambi' })
  detail(
    @Param('id') id: string,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.service.getPublic(id, userId ?? null);
  }

  @Post('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Sukai post (idempoten)' })
  like(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.like(id, userId);
  }

  @Delete('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Batal sukai post (idempoten)' })
  unlike(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.unlike(id, userId);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'List komentar sebuah post (visible, paginated)' })
  comments(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.service.listComments(id, query);
  }

  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Kirim komentar (Bearer wajib, maks 10/menit)' })
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.addComment(id, userId, dto);
  }
}
