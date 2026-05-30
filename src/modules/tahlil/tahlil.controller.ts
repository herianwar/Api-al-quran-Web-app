import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { TahlilService } from './tahlil.service';

@ApiTags('Tahlil')
@Controller('tahlil')
export class TahlilController {
  constructor(private readonly service: TahlilService) {}

  @Get()
  @ETagCacheable(86_400)
  @ApiOperation({
    summary: 'Urutan lengkap bacaan tahlil (pengantar → doa penutup)',
  })
  list() {
    return this.service.getAll();
  }
}
