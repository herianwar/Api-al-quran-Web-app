import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { WiridService } from './wirid.service';

@ApiTags('Wirid Pagi & Petang')
@Controller('wirid')
export class WiridController {
  constructor(private readonly service: WiridService) {}

  @Get(':type')
  @ETagCacheable(86_400)
  @ApiOperation({ summary: 'Wirid pagi atau petang (type: pagi | petang)' })
  byType(@Param('type') type: string) {
    return this.service.byType(type);
  }
}
