import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeedbackListQueryDto, UpdateFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/** Kelola masukan yang masuk. Auth: JWT admin (atau seed key untuk CI). */
@ApiTags('Feedback Admin')
@ApiBearerAuth()
@ApiSecurity('admin-key')
@UseGuards(JwtOrAdminKeyGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/feedback')
export class FeedbackAdminController {
  constructor(private readonly service: FeedbackService) {}

  // Static route declared before ':id' so "stats" isn't treated as an id.
  @Get('stats')
  @ApiOperation({ summary: 'Hitung masukan per status & kategori (widget)' })
  stats() {
    return this.service.stats();
  }

  @Get()
  @ApiOperation({
    summary: 'List masukan (filter status/kategori/tanggal, search, paginated)',
  })
  list(@Query() query: FeedbackListQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail satu masukan (+ info user kalau ada)' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update status &/atau catatan admin (partial)' })
  update(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus masukan (spam dll)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
