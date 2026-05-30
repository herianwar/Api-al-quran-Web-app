import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ok } from '../../common/dto/api-response';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { AuditQueryDto } from '../audit/dto/audit-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from '../notification/notification.service';
import { AdminService } from './admin.service';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';

interface AdminCtx {
  userId: string;
  email: string;
  role: string;
}

/**
 * Admin endpoints — accessible only to users with `role=admin`. Uses the
 * regular JWT auth + a RolesGuard layer; this is separate from the
 * `x-seed-admin-key` flow which is for system-level / unattended admin
 * actions like seed/snapshot/api-key/cron.
 */
@ApiTags('Admin (role)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
// Admin dashboard polls these (system stats, etc.) and is already auth+role
// guarded, so exempt it from the public rate limiter to avoid spurious 429s.
@SkipThrottle()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
    private readonly notif: NotificationService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Statistik sistem (user count, content count, dll)' })
  stats() {
    return this.admin.getStats();
  }

  @Get('system')
  @ApiOperation({ summary: 'Health detail: DB size, redis info, audio cache' })
  systemHealth() {
    return this.admin.getSystemHealth();
  }

  @Get('users')
  @ApiOperation({ summary: 'List user (paginated, searchable, filter role, sortable)' })
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Detail user + bookmarks + hafalan + devices' })
  getUserDetail(@Param('id') id: string) {
    return this.admin.getUserDetail(id);
  }

  @Put('users/:id/role')
  @ApiOperation({ summary: 'Ubah role user (user/admin)' })
  setRole(
    @Param('id') id: string,
    @Body() body: { role: string },
    @CurrentUser() actor: AdminCtx,
  ) {
    return this.admin.setUserRole(id, body.role, {
      id: actor.userId,
      email: actor.email,
    });
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Hapus user beserta semua data terkait (cascade)' })
  deleteUser(@Param('id') id: string, @CurrentUser() actor: AdminCtx) {
    return this.admin.deleteUser(id, {
      id: actor.userId,
      email: actor.email,
    });
  }

  // ─── Analytics ───────────────────────────────────────────────────────

  @Get('analytics/search')
  @ApiOperation({ summary: 'Top search queries + no-result gaps + trend' })
  searchAnalytics() {
    return this.admin.getSearchAnalytics();
  }

  @Get('analytics/users')
  @ApiOperation({
    summary:
      'Signups 30 hari, role distribution, active users (with device), latest signups',
  })
  usersAnalytics() {
    return this.admin.getUsersAnalytics();
  }

  @Get('analytics/content')
  @ApiOperation({
    summary:
      'Top bookmarked ayat, top memorized ayat, popular surahs, hafalan level distribution',
  })
  contentAnalytics() {
    return this.admin.getContentAnalytics();
  }

  @Get('analytics/engagement')
  @ApiOperation({
    summary:
      'Trend bookmark/hafalan/review per hari, device platform, broadcast performance',
  })
  engagementAnalytics() {
    return this.admin.getEngagementAnalytics();
  }

  // ─── Broadcast history ──────────────────────────────────────────────

  @Get('broadcasts')
  @ApiOperation({ summary: '50 broadcast push terakhir' })
  async listBroadcasts() {
    const data = await this.notif.listBroadcasts();
    return ok(data, 'Riwayat broadcast', { total: data.length });
  }

  // ─── Audit log ───────────────────────────────────────────────────────

  @Get('audit')
  @ApiOperation({ summary: 'Audit log (paginated, optional filter by action prefix)' })
  auditLog(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
