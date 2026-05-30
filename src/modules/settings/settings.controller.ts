import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ok } from '../../common/dto/api-response';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  UpdateSettingsDto,
  UpdateSingleSettingDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';

interface AdminCtx {
  userId: string;
  email: string;
}

@ApiTags('Admin Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@SkipThrottle()
@Controller('admin/settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List all admin-editable settings. Secrets are returned masked (preview only).',
  })
  async list(@Query('category') category?: string) {
    const items = await this.settings.listForAdmin(category);
    return ok(items, 'Settings');
  }

  @Put()
  @ApiOperation({
    summary: 'Update a batch of settings. Empty string clears a secret.',
  })
  async update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    await this.settings.setMany(dto.values);
    await this.audit.log({
      action: 'settings.update',
      actorId: actor.userId,
      actorEmail: actor.email,
      metadata: { keys: Object.keys(dto.values) },
    });
    const fresh = await this.settings.listForAdmin();
    return ok(fresh, 'Settings disimpan');
  }

  @Put(':key')
  @ApiOperation({ summary: 'Update single setting by key.' })
  async updateOne(
    @Param('key') key: string,
    @Body() dto: UpdateSingleSettingDto,
    @CurrentUser() actor: AdminCtx,
  ) {
    await this.settings.set(key, dto.value);
    await this.audit.log({
      action: 'settings.update',
      actorId: actor.userId,
      actorEmail: actor.email,
      target: key,
    });
    return ok({ key, updated: true }, 'Setting disimpan');
  }

  @Post('ai/test')
  @ApiOperation({
    summary:
      'Test the configured AI provider by sending a tiny embedding request.',
  })
  async testAi(@CurrentUser() actor: AdminCtx) {
    const result = await this.settings.testAiConnection();
    await this.audit.log({
      action: 'settings.ai.test',
      actorId: actor.userId,
      actorEmail: actor.email,
      metadata: { ok: result.ok, latencyMs: result.latencyMs },
    });
    return ok(result, result.ok ? 'AI test berhasil' : 'AI test gagal');
  }
}
