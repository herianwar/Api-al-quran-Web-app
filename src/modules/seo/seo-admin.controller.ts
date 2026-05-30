import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ok } from '../../common/dto/api-response';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpsertSeoPageDto } from './dto/seo.dto';
import { SeoService } from './seo.service';

interface AdminCtx {
  userId: string;
  email: string;
}

/**
 * Admin management of per-route SEO overrides. Global SEO defaults are edited
 * via the existing Admin Settings endpoints (category "seo"); this controller
 * owns the seo_pages table + a live preview using the same resolver the
 * frontend uses.
 */
@ApiTags('Admin SEO')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/seo')
export class SeoAdminController {
  constructor(
    private readonly seo: SeoService,
    private readonly audit: AuditService,
  ) {}

  @Get('pages')
  @ApiOperation({ summary: 'List all per-route SEO overrides.' })
  async list() {
    const pages = await this.seo.listPages();
    return ok(pages, 'SEO pages');
  }

  @Get('preview')
  @ApiOperation({
    summary: 'Preview the resolved metadata for a path (globals + template + override).',
  })
  async preview(@Query('path') path?: string) {
    const meta = await this.seo.resolve(path || '/');
    return ok(meta, 'SEO preview');
  }

  @Get('sitemap')
  @ApiOperation({ summary: 'Preview the computed sitemap entries.' })
  async sitemap() {
    const entries = await this.seo.buildSitemap();
    return ok(entries, 'Sitemap entries', { total: entries.length });
  }

  @Post('pages')
  @ApiOperation({ summary: 'Create or update a per-route SEO override (upsert by path).' })
  async upsert(@Body() dto: UpsertSeoPageDto, @CurrentUser() actor: AdminCtx) {
    const page = await this.seo.upsertPage(dto);
    await this.audit.log({
      action: 'seo.page.upsert',
      actorId: actor.userId,
      actorEmail: actor.email,
      target: page.path,
    });
    return ok(page, 'SEO override disimpan');
  }

  @Delete('pages/:id')
  @ApiOperation({ summary: 'Delete a per-route SEO override.' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AdminCtx,
  ) {
    const page = await this.seo.getPage(id);
    await this.seo.deletePage(id);
    await this.audit.log({
      action: 'seo.page.delete',
      actorId: actor.userId,
      actorEmail: actor.email,
      target: page?.path ?? String(id),
    });
    return ok({ id, deleted: true }, 'SEO override dihapus');
  }
}
