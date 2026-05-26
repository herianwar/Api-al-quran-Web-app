import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DoaService } from './doa.service';

@ApiTags('Doa')
@Controller('doa')
export class DoaController {
  constructor(private readonly doaService: DoaService) {}

  @Get()
  @ApiOperation({ summary: 'Semua doa & dzikir' })
  getAll() {
    return this.doaService.getAll();
  }

  @Get('random')
  @ApiOperation({ summary: 'Doa random' })
  getRandom() {
    return this.doaService.getRandom();
  }

  @Get(':id')
  @ApiOperation({ summary: '1 doa berdasarkan id' })
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.doaService.getById(id);
  }
}
