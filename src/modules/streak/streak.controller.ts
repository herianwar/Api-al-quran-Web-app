import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  LogSessionDto,
  UpdateGoalDto,
  UpsertKhatamDto,
} from './dto/streak.dto';
import { StreakService } from './streak.service';

@ApiTags('Reading Streak')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class StreakController {
  constructor(private readonly streak: StreakService) {}

  @Post('reading-session')
  @ApiOperation({
    summary:
      'Catat sesi baca hari ini (idempotent per tanggal — multi call menambah ayatCount)',
  })
  log(
    @CurrentUser('userId') userId: string,
    @Body() dto: LogSessionDto,
  ) {
    return this.streak.logSession(userId, dto);
  }

  @Get('streak')
  @ApiOperation({
    summary: 'Streak baca: current, longest, history 30 hari terakhir',
  })
  get(@CurrentUser('userId') userId: string) {
    return this.streak.getStreak(userId);
  }

  @Get('goal')
  @ApiOperation({ summary: 'Target baca harian user' })
  getGoal(@CurrentUser('userId') userId: string) {
    return this.streak.getGoal(userId);
  }

  @Put('goal')
  @ApiOperation({ summary: 'Set/update target baca harian' })
  setGoal(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.streak.upsertGoal(userId, dto);
  }

  @Get('khatam')
  @ApiOperation({ summary: 'Rencana & progress khatam Al-Qur’an' })
  getKhatam(@CurrentUser('userId') userId: string) {
    return this.streak.getKhatam(userId);
  }

  @Put('khatam')
  @ApiOperation({ summary: 'Set/update rencana khatam (tanggal mulai → target)' })
  setKhatam(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpsertKhatamDto,
  ) {
    return this.streak.upsertKhatam(userId, dto);
  }

  @Delete('khatam')
  @ApiOperation({ summary: 'Hapus rencana khatam' })
  deleteKhatam(@CurrentUser('userId') userId: string) {
    return this.streak.deleteKhatam(userId);
  }
}
