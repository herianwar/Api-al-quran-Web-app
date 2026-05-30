import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/dto/api-response';
import { ETagCacheable } from '../../common/decorators/etag.decorator';
import { SeoService } from './seo.service';

/**
 * Public, unauthenticated SEO endpoints consumed by the Next.js frontend:
 *  - GET /seo/resolve?path=…  → merged metadata for one route (generateMetadata)
 *  - GET /seo/sitemap          → URL list rendered to /sitemap.xml by Next
 *  - GET /seo/robots           → policy rendered to /robots.txt by Next
 */
@ApiTags('SEO')
@Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('globals')
  @ETagCacheable(300)
  @ApiOperation({
    summary: 'Global SEO settings (site name, title template, verification, analytics IDs).',
  })
  async globals() {
    const g = await this.seo.getGlobals();
    return ok(g, 'Global SEO settings');
  }

  @Get('resolve')
  @ETagCacheable(300)
  @ApiOperation({
    summary: 'Resolve merged SEO metadata for a route (globals + template + override).',
  })
  @ApiQuery({ name: 'path', example: '/surat/2' })
  async resolve(@Query('path') path?: string) {
    const meta = await this.seo.resolve(path || '/');
    return ok(meta, 'Resolved SEO metadata');
  }

  @Get('sitemap')
  @ETagCacheable(900)
  @ApiOperation({ summary: 'Sitemap entries (origin-relative paths).' })
  async sitemap() {
    const entries = await this.seo.buildSitemap();
    return ok(entries, 'Sitemap entries');
  }

  @Get('robots')
  @ETagCacheable(900)
  @ApiOperation({ summary: 'Robots policy for robots.txt.' })
  async robots() {
    const policy = await this.seo.buildRobots();
    return ok(policy, 'Robots policy');
  }
}
