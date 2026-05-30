import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { BacaanShalatService } from './bacaan-shalat.service';

@ApiTags('Bacaan Shalat')
@Controller('bacaan-shalat')
export class BacaanShalatController {
  constructor(private readonly service: BacaanShalatService) {}

  @Get()
  @ETagCacheable(86_400)
  @ApiOperation({
    summary:
      'Tata cara shalat: 10 gerakan dengan bacaan masing-masing (Takbiratul Ihram → Salam)',
  })
  list() {
    return this.service.getAll();
  }
}
