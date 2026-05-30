import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HijriService } from './hijri.service';

@ApiTags('Hijri')
@Controller('hijri')
export class HijriController {
  constructor(private readonly hijri: HijriService) {}

  @Get('today')
  @ApiOperation({
    summary: 'Tanggal hari ini dalam kalender Hijriah & Masehi',
  })
  today() {
    return this.hijri.today();
  }

  @Get('months')
  @ApiOperation({ summary: 'Daftar 12 nama bulan Hijriah (id + arab)' })
  months() {
    return this.hijri.months();
  }

  @Get('to-hijri')
  @ApiOperation({ summary: 'Konversi tanggal Masehi → Hijri' })
  @ApiQuery({
    name: 'date',
    description: 'Tanggal Masehi format YYYY-MM-DD',
    example: '2026-05-28',
  })
  toHijri(@Query('date') date: string) {
    return this.hijri.fromGregorian(date);
  }

  @Get('to-gregorian')
  @ApiOperation({ summary: 'Konversi tanggal Hijri → Masehi' })
  @ApiQuery({
    name: 'date',
    description: 'Tanggal Hijri format YYYY-MM-DD (mis. 1446-09-15)',
    example: '1446-12-09',
  })
  toGregorian(@Query('date') date: string) {
    return this.hijri.fromHijri(date);
  }
}
