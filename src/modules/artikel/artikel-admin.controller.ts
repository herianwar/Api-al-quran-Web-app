import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { promises as fsp } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtOrAdminKeyGuard } from '../../common/guards/jwt-or-admin-key.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ArtikelService, ARTIKEL_UPLOAD_DIR } from './artikel.service';
import {
  CreateArtikelDto,
  CreateKategoriDto,
  ArtikelListQueryDto,
  UpdateArtikelDto,
  UpdateKategoriDto,
} from './dto/artikel.dto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

/** Multer config for article cover + inline editor image uploads. */
const artikelUploadMulter = {
  storage: diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fsp.mkdir(ARTIKEL_UPLOAD_DIR, { recursive: true });
        cb(null, ARTIKEL_UPLOAD_DIR);
      } catch (err) {
        cb(err as Error, ARTIKEL_UPLOAD_DIR);
      }
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const rand = Math.random().toString(36).slice(2, 10);
      cb(null, `${Date.now()}-${rand}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(
        new BadRequestException({
          message: `Mime ${file.mimetype} tidak diizinkan. Hanya jpg/png/webp/gif.`,
          error: 'BAD_REQUEST',
        }),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

@ApiTags('Artikel Admin')
@ApiBearerAuth()
@ApiSecurity('admin-key')
@UseGuards(JwtOrAdminKeyGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/artikel')
export class ArtikelAdminController {
  constructor(private readonly service: ArtikelService) {}

  // ─── Kategori ────────────────────────────────────────────────────────

  @Get('kategori')
  @ApiOperation({ summary: 'List kategori (admin — termasuk non-aktif)' })
  listKategori() {
    return this.service.listKategori(false);
  }

  @Post('kategori')
  @ApiOperation({ summary: 'Buat kategori artikel' })
  createKategori(@Body() dto: CreateKategoriDto) {
    return this.service.createKategori(dto);
  }

  @Put('kategori/:id')
  @ApiOperation({ summary: 'Update kategori artikel' })
  updateKategori(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKategoriDto,
  ) {
    return this.service.updateKategori(id, dto);
  }

  @Delete('kategori/:id')
  @ApiOperation({ summary: 'Hapus kategori (artikel jadi tanpa kategori)' })
  deleteKategori(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteKategori(id);
  }

  // ─── Upload gambar ───────────────────────────────────────────────────
  // Declared before ':id' routes so "upload" isn't treated as an id.

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload gambar (cover/inline editor). jpg/png/webp/gif, maks 8MB, field "file". Return { url }.',
  })
  @UseInterceptors(FileInterceptor('file', artikelUploadMulter))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({
        message: 'File tidak ditemukan di field "file"',
        error: 'BAD_REQUEST',
      });
    }
    return this.service.registerUpload(file.filename);
  }

  // ─── Artikel CRUD ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List semua artikel (termasuk draft)' })
  list(@Query() query: ArtikelListQueryDto) {
    return this.service.list(query, false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail artikel by id (any status)' })
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Buat artikel' })
  create(@Body() dto: CreateArtikelDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update artikel' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArtikelDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus artikel (cover di disk ikut terhapus)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
