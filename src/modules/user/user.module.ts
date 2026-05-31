import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { DeviceController } from './device.controller';
import { UserService } from './user.service';

@Module({
  controllers: [UserController, DeviceController],
  providers: [UserService],
})
export class UserModule {}
