import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ArtikelService } from './artikel.service';
import {
  ArtikelListQueryDto,
  SyncArtikelInteractionsDto,
} from './dto/artikel.dto';

@ApiTags('Artikel')
@ApiBearerAuth()
@Controller('artikel')
export class ArtikelController {
  constructor(private readonly service: ArtikelService) {}

  @Get('kategori')
  @ETagCacheable(300)
  @ApiOperation({ summary: 'Daftar kategori artikel aktif (+ jumlah artikel)' })
  listKategori() {
    return this.service.listKategori(true);
  }

  // Declared before ':slug' so "hub" isn't captured as a slug.
  // 60s to match the list endpoint (the latest-articles block dominates
  // freshness); views excluded from the hash for the same reason as list.
  // OptionalJwtAuthGuard fills liked/saved when a Bearer token is present;
  // the ETag interceptor flips such requests to `private, no-store`.
  @Get('hub')
  @UseGuards(OptionalJwtAuthGuard)
  @ETagCacheable(60, { ignoreFields: ['views'] })
  @ApiOperation({
    summary:
      'Hub artikel: latest + featured + kategori dalam satu respons ber-ETag',
  })
  hub(@CurrentUser('userId') userId?: string) {
    return this.service.hub(10, userId ?? null);
  }

  // Static route — declared before ':slug' so "bookmarks" isn't a slug.
  @Get('bookmarks')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Artikel tersimpan (bookmark) milik user (paginated)' })
  bookmarks(
    @Query() query: ArtikelListQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.listBookmarks(query, userId);
  }

  // Merge like & bookmark lokal (daftar slug) → akun. Dipanggil app sekali
  // setelah login pasca-update, lalu data lokal dihapus.
  @Post('sync')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Merge like & bookmark lokal (slug) ke akun (idempoten)',
  })
  sync(
    @Body() dto: SyncArtikelInteractionsDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.syncInteractions(
      userId,
      dto.likedSlugs ?? [],
      dto.savedSlugs ?? [],
    );
  }

  // 60s: short enough that a freshly published article shows up promptly on
  // the hub, long enough to collapse the app's repeated tab-opens into 304s.
  // `views` is excluded from the hash — it drifts on its own and would
  // otherwise change the ETag on every counter flush.
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ETagCacheable(60, { ignoreFields: ['views'] })
  @ApiOperation({
    summary:
      'Daftar artikel published (paginated, filter q/kategori/tag/featured)',
  })
  list(
    @Query() query: ArtikelListQueryDto,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.service.list(query, true, userId ?? null);
  }

  // 120s: an article body rarely changes after publish, and the detail
  // payload is the heaviest of the three (full HTML + related list).
  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ETagCacheable(120, { ignoreFields: ['views'] })
  @ApiOperation({
    summary: 'Detail artikel published berdasarkan slug (+ artikel terkait)',
  })
  getBySlug(
    @Param('slug') slug: string,
    @Ip() ip: string,
    @CurrentUser('userId') userId?: string,
  ) {
    return this.service.getBySlug(slug, ip, userId ?? null);
  }

  // ─── Like & bookmark (Bearer wajib) ──────────────────────────────────

  @Post(':slug/like')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Sukai artikel (idempoten)' })
  like(@Param('slug') slug: string, @CurrentUser('userId') userId: string) {
    return this.service.like(slug, userId);
  }

  @Delete(':slug/like')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Batal sukai artikel (idempoten)' })
  unlike(@Param('slug') slug: string, @CurrentUser('userId') userId: string) {
    return this.service.unlike(slug, userId);
  }

  @Post(':slug/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Simpan artikel ke bookmark (idempoten)' })
  bookmark(@Param('slug') slug: string, @CurrentUser('userId') userId: string) {
    return this.service.bookmark(slug, userId);
  }

  @Delete(':slug/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Hapus artikel dari bookmark (idempoten)' })
  unbookmark(
    @Param('slug') slug: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.unbookmark(slug, userId);
  }
}
