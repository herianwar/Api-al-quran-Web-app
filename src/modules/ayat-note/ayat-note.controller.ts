import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AyatNoteService } from './ayat-note.service';
import {
  AyatNoteQueryDto,
  CreateAyatNoteDto,
  UpdateAyatNoteDto,
} from './dto/ayat-note.dto';

@ApiTags('Catatan Ayat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/notes')
export class AyatNoteController {
  constructor(private readonly notes: AyatNoteService) {}

  @Get()
  @ApiOperation({ summary: 'List catatan ayat (paginated, filter ayatId)' })
  list(
    @CurrentUser('userId') userId: string,
    @Query() query: AyatNoteQueryDto,
  ) {
    return this.notes.list(userId, query);
  }

  @Get('ayat/:ayatId')
  @ApiOperation({ summary: 'Catatan saya untuk 1 ayat spesifik' })
  forAyat(
    @CurrentUser('userId') userId: string,
    @Param('ayatId', ParseIntPipe) ayatId: number,
  ) {
    return this.notes.listForAyat(userId, ayatId);
  }

  @Post()
  @ApiOperation({ summary: 'Buat catatan ayat baru' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAyatNoteDto,
  ) {
    return this.notes.create(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit catatan ayat' })
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAyatNoteDto,
  ) {
    return this.notes.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus catatan ayat' })
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.notes.remove(userId, id);
  }
}
