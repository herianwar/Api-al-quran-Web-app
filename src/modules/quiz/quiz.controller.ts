import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuizService } from './quiz.service';

@ApiTags('Quiz Hafalan')
@Controller('quiz')
export class QuizController {
  constructor(private readonly service: QuizService) {}

  @Get('sambung-ayat')
  @ApiOperation({
    summary:
      'Soal random: ayat anchor + 4 pilihan ayat lanjutan (1 benar, 3 distractor)',
  })
  sambung() {
    return this.service.sambungAyat();
  }

  @Get('isi-kata')
  @ApiOperation({
    summary:
      'Soal random: 1 ayat dengan 1 kata di-blank + 4 opsi kata (1 benar)',
  })
  isiKata() {
    return this.service.isiKata();
  }
}
