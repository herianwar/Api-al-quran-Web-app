import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AyatNoteController } from './ayat-note.controller';
import { AyatNoteService } from './ayat-note.service';

@Module({
  imports: [AuthModule],
  controllers: [AyatNoteController],
  providers: [AyatNoteService],
  exports: [AyatNoteService],
})
export class AyatNoteModule {}
