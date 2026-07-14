import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import {
  KabupatenQueryDto,
  KecamatanQueryDto,
  KelurahanQueryDto,
} from './dto/wilayah.dto';
import { WilayahService } from './wilayah.service';

// Static reference data — cache for a day (content-hashed ETag + Cache-Control).
const ONE_DAY = 86_400;

@ApiTags('Wilayah')
@Controller('wilayah')
export class WilayahController {
  constructor(private readonly wilayah: WilayahService) {}

  @Get('provinsi')
  @ETagCacheable(ONE_DAY)
  @ApiOperation({ summary: 'Daftar provinsi (urut nama)' })
  provinsi() {
    return this.wilayah.listProvinsi();
  }

  @Get('kabupaten')
  @ETagCacheable(ONE_DAY)
  @ApiOperation({ summary: 'Daftar kabupaten/kota dalam satu provinsi' })
  kabupaten(@Query() query: KabupatenQueryDto) {
    return this.wilayah.listKabupaten(query.provinsiId);
  }

  @Get('kecamatan')
  @ETagCacheable(ONE_DAY)
  @ApiOperation({ summary: 'Daftar kecamatan dalam satu kabupaten/kota' })
  kecamatan(@Query() query: KecamatanQueryDto) {
    return this.wilayah.listKecamatan(query.kabupatenId);
  }

  @Get('kelurahan')
  @ETagCacheable(ONE_DAY)
  @ApiOperation({ summary: 'Daftar kelurahan/desa dalam satu kecamatan' })
  kelurahan(@Query() query: KelurahanQueryDto) {
    return this.wilayah.listKelurahan(query.kecamatanId);
  }
}
