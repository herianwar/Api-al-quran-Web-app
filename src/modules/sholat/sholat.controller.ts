import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JadwalQueryDto, KotaQueryDto } from './dto/kota-query.dto';
import { SholatService } from './sholat.service';

@ApiTags('Jadwal Sholat')
@Controller('sholat')
export class SholatController {
  constructor(private readonly sholatService: SholatService) {}

  @Get('provinsi')
  @ApiOperation({ summary: 'List provinsi' })
  getProvinsi() {
    return this.sholatService.getProvinsiList();
  }

  @Get('kota')
  @ApiOperation({
    summary:
      'List kota — kosongkan ?provinsi untuk dapat 518 kota dalam satu request',
  })
  getKota(@Query() query: KotaQueryDto) {
    return this.sholatService.getKotaByProvinsi(query.provinsi);
  }

  @Get(':kotaId/hari-ini')
  @ApiOperation({ summary: 'Jadwal sholat hari ini' })
  getHariIni(@Param('kotaId') kotaId: string) {
    return this.sholatService.getHariIni(kotaId);
  }

  @Get(':kotaId')
  @ApiOperation({ summary: 'Jadwal sholat 1 bulan' })
  getJadwal(@Param('kotaId') kotaId: string, @Query() query: JadwalQueryDto) {
    return this.sholatService.getJadwal(kotaId, query.bulan, query.tahun);
  }
}
