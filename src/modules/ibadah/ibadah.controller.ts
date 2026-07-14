import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  IbadahHistoryQueryDto,
  IbadahSummaryQueryDto,
  SetItemDto,
  SetSholatDto,
} from './dto/ibadah.dto';
import { IbadahService } from './ibadah.service';

@ApiTags('Daily Ibadah')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/ibadah')
export class IbadahController {
  constructor(private readonly ibadah: IbadahService) {}

  @Get('today')
  @ApiOperation({
    summary: 'Checklist sholat 5 waktu hari ini (WIB) + jumlah yang sudah',
  })
  today(@CurrentUser('userId') userId: string) {
    return this.ibadah.getToday(userId);
  }

  @Put('sholat')
  @ApiOperation({
    summary:
      'Tandai/batalkan satu waktu sholat hari ini (idempotent). Return sama seperti GET today. Legacy — pakai PUT item untuk item baru',
  })
  setSholat(
    @CurrentUser('userId') userId: string,
    @Body() dto: SetSholatDto,
  ) {
    return this.ibadah.setSholat(userId, dto);
  }

  @Put('item')
  @ApiOperation({
    summary:
      'Tandai/batalkan satu item ibadah (5 sholat + dzikir/tilawah/hafalan) pada tanggal (default hari ini WIB). Idempotent. Return bentuk harian',
  })
  setItem(@CurrentUser('userId') userId: string, @Body() dto: SetItemDto) {
    return this.ibadah.setItem(userId, dto);
  }

  @Get('history')
  @ApiOperation({
    summary:
      'Riwayat harian ibadah pada rentang from..to (default 30 hari terakhir). Hanya hari yang ada datanya',
  })
  history(
    @CurrentUser('userId') userId: string,
    @Query() query: IbadahHistoryQueryDto,
  ) {
    return this.ibadah.getHistory(userId, query.from, query.to);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Ringkasan progress ibadah N hari terakhir (default 7) + streak',
  })
  summary(
    @CurrentUser('userId') userId: string,
    @Query() query: IbadahSummaryQueryDto,
  ) {
    return this.ibadah.getSummary(userId, query.days);
  }
}
