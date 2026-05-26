import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AudioService } from './audio.service';

@ApiTags('Audio')
@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Get('qari')
  @ApiOperation({ summary: 'List qari tersedia' })
  getQari() {
    return this.audioService.getQariList();
  }

  @Get('surat/:nomor')
  @ApiOperation({ summary: 'URL audio full surat' })
  @ApiQuery({ name: 'qari', required: false, example: '05' })
  getSuratAudio(
    @Param('nomor', ParseIntPipe) nomor: number,
    @Query('qari') qari?: string,
  ) {
    return this.audioService.getSuratAudio(nomor, qari);
  }

  @Get('ayat/:surat/:ayat')
  @ApiOperation({ summary: 'URL audio 1 ayat' })
  @ApiQuery({ name: 'qari', required: false, example: '05' })
  getAyatAudio(
    @Param('surat', ParseIntPipe) surat: number,
    @Param('ayat', ParseIntPipe) ayat: number,
    @Query('qari') qari?: string,
  ) {
    return this.audioService.getAyatAudio(surat, ayat, qari);
  }
}
