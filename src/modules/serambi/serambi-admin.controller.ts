import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import {
  AdminAuthorListQueryDto,
  AdminCommentListQueryDto,
  AdminPostListQueryDto,
  BulkSerambiPostDto,
  CreateSerambiAuthorDto,
  CreateSerambiPostDto,
  UpdateCommentStatusDto,
  UpdateSerambiAuthorDto,
  UpdateSerambiPostDto,
} from './dto/serambi.dto';
import { processImageToWebp } from '../../common/util/image';
import { SERAMBI_UPLOAD_DIR, SerambiService } from './serambi.service';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

/** Multer config untuk upload gambar post Serambi. */
const serambiUploadMulter = {
  storage: diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fsp.mkdir(SERAMBI_UPLOAD_DIR, { recursive: true });
        cb(null, SERAMBI_UPLOAD_DIR);
      } catch (err) {
        cb(err as Error, SERAMBI_UPLOAD_DIR);
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

/** Kelola post & moderasi komentar Serambi. Auth: JWT admin (atau seed key). */
@ApiTags('Serambi Admin')
@ApiBearerAuth()
@ApiSecurity('admin-key')
@UseGuards(JwtOrAdminKeyGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/serambi')
export class SerambiAdminController {
  constructor(private readonly service: SerambiService) {}

  // ─── Upload (static route sebelum ':id') ─────────────────────────────

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload gambar post. jpg/png/webp/gif, maks 8MB, field "file". Otomatis dioptimalkan → WebP (resize maks 1280px, kualitas 80). Return { url }.',
  })
  @UseInterceptors(FileInterceptor('file', serambiUploadMulter))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({
        message: 'File tidak ditemukan di field "file"',
        error: 'BAD_REQUEST',
      });
    }
    const { filename } = await processImageToWebp(
      SERAMBI_UPLOAD_DIR,
      file.filename,
      { maxWidth: 1280 },
    );
    return this.service.registerUpload(filename);
  }

  // ─── Moderasi komentar (static routes sebelum posts/:id) ─────────────

  @Get('comments')
  @ApiOperation({
    summary: 'List komentar semua/per-post (filter status, search, paginated)',
  })
  listComments(@Query() query: AdminCommentListQueryDto) {
    return this.service.adminListComments(query);
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Sembunyikan / tampilkan komentar' })
  setCommentStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCommentStatusDto,
  ) {
    return this.service.adminSetCommentStatus(id, dto.status);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Hapus komentar' })
  removeComment(@Param('id') id: string) {
    return this.service.adminRemoveComment(id);
  }

  // ─── Master penulis (static route sebelum posts/:id) ─────────────────

  @Get('authors')
  @ApiOperation({ summary: 'List master penulis (untuk dropdown di form post)' })
  listAuthors(@Query() query: AdminAuthorListQueryDto) {
    return this.service.adminListAuthors(query);
  }

  @Post('authors')
  @ApiOperation({ summary: 'Buat penulis (nama unik + avatar opsional)' })
  createAuthor(@Body() dto: CreateSerambiAuthorDto) {
    return this.service.adminCreateAuthor(dto);
  }

  @Patch('authors/:id')
  @ApiOperation({ summary: 'Edit penulis (nama/avatar/aktif)' })
  updateAuthor(
    @Param('id') id: string,
    @Body() dto: UpdateSerambiAuthorDto,
  ) {
    return this.service.adminUpdateAuthor(id, dto);
  }

  @Delete('authors/:id')
  @ApiOperation({
    summary: 'Hapus penulis (post lama tetap; nama/avatar snapshot dipertahankan)',
  })
  removeAuthor(@Param('id') id: string) {
    return this.service.adminRemoveAuthor(id);
  }

  // ─── Statistik & aksi massal (static routes sebelum posts/:id) ───────

  @Get('stats')
  @ApiOperation({
    summary:
      'Statistik Serambi: jumlah per status, total suka/komentar, terjadwal berikutnya, terpopuler, sebaran penulis, antrian moderasi',
  })
  stats() {
    return this.service.adminStats();
  }

  @Post('posts/bulk')
  @ApiOperation({
    summary:
      'Aksi massal: publish | draft | archive | author | delete (publish massal tidak mengirim push)',
  })
  bulk(@Body() dto: BulkSerambiPostDto) {
    return this.service.adminBulk(dto);
  }

  // ─── Post CRUD ───────────────────────────────────────────────────────

  @Get('posts')
  @ApiOperation({
    summary: 'List post (filter status/penulis, search, sort, paginated)',
  })
  list(@Query() query: AdminPostListQueryDto) {
    return this.service.adminList(query);
  }

  @Post('posts')
  @ApiOperation({ summary: 'Buat post (draft/published)' })
  create(@Body() dto: CreateSerambiPostDto) {
    return this.service.adminCreate(dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Detail satu post (semua status)' })
  getById(@Param('id') id: string) {
    return this.service.adminGet(id);
  }

  @Post('posts/:id/duplicate')
  @ApiOperation({ summary: 'Duplikat post sebagai draft baru' })
  duplicate(@Param('id') id: string) {
    return this.service.adminDuplicate(id);
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: 'Edit post (body/imageUrl/authorName/status)' })
  update(@Param('id') id: string, @Body() dto: UpdateSerambiPostDto) {
    return this.service.adminUpdate(id, dto);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Hapus post (cascade likes + comments)' })
  remove(@Param('id') id: string) {
    return this.service.adminRemove(id);
  }
}
