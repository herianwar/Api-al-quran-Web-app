import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IbadahController } from './ibadah.controller';
import { IbadahService } from './ibadah.service';

@Module({
  imports: [AuthModule],
  controllers: [IbadahController],
  providers: [IbadahService],
  exports: [IbadahService],
})
export class IbadahModule {}
