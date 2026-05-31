import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { RegisterDeviceDto } from './dto/device.dto';

/**
 * Public device registration — lets a NOT-logged-in app register its FCM token
 * so it can receive broadcast push (e.g. new-article notifications). Only the
 * global API key (x-api-key) is required; no JWT. Tokens land with userId=null
 * and get claimed by an account if the same token later registers via the
 * authenticated `POST /user/devices`.
 */
@ApiTags('Devices (Public)')
@ApiSecurity('api-key')
@Controller('devices')
export class DeviceController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({
    summary:
      'Daftarkan FCM token tanpa login (anonim) agar device menerima push broadcast',
  })
  register(@Body() dto: RegisterDeviceDto) {
    return this.userService.registerDevice(null, dto);
  }

  @Delete(':token')
  @ApiOperation({ summary: 'Unregister device anonim (panggil saat uninstall)' })
  unregister(@Param('token') token: string) {
    return this.userService.unregisterDevicePublic(token);
  }
}
