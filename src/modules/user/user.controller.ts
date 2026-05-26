import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateBookmarkDto,
  CreateHafalanDto,
  ReviewHafalanDto,
  UpdateProfileDto,
  UpdateProgressDto,
} from './dto/user.dto';
import { UserService } from './user.service';

@ApiTags('User')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Profil user' })
  getProfile(@CurrentUser('userId') userId: string) {
    return this.userService.getProfile(userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update profil' })
  updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  @Get('progress')
  @ApiOperation({ summary: 'Posisi baca terakhir' })
  getProgress(@CurrentUser('userId') userId: string) {
    return this.userService.getProgress(userId);
  }

  @Put('progress')
  @ApiOperation({ summary: 'Update posisi baca' })
  updateProgress(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.userService.updateProgress(userId, dto.ayatId);
  }

  @Get('bookmark')
  @ApiOperation({ summary: 'List bookmark' })
  getBookmarks(@CurrentUser('userId') userId: string) {
    return this.userService.getBookmarks(userId);
  }

  @Post('bookmark')
  @ApiOperation({ summary: 'Tambah bookmark' })
  addBookmark(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBookmarkDto,
  ) {
    return this.userService.addBookmark(userId, dto);
  }

  @Delete('bookmark/:id')
  @ApiOperation({ summary: 'Hapus bookmark' })
  removeBookmark(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.userService.removeBookmark(userId, id);
  }

  @Get('hafalan')
  @ApiOperation({ summary: 'List ayat hafalan' })
  getHafalan(@CurrentUser('userId') userId: string) {
    return this.userService.getHafalan(userId);
  }

  @Post('hafalan')
  @ApiOperation({ summary: 'Tandai ayat dihafal' })
  addHafalan(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateHafalanDto,
  ) {
    return this.userService.addHafalan(userId, dto);
  }

  @Get('hafalan/review')
  @ApiOperation({ summary: "Ayat yang perlu muraja'ah hari ini" })
  getReview(@CurrentUser('userId') userId: string) {
    return this.userService.getReviewDue(userId);
  }

  @Put('hafalan/:id/review')
  @ApiOperation({ summary: "Update hasil muraja'ah (level naik/turun)" })
  reviewHafalan(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: ReviewHafalanDto,
  ) {
    return this.userService.reviewHafalan(userId, id, dto.remembered);
  }
}
