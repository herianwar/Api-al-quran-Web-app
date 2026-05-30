import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global so every module that performs an admin action can inject the
 * AuditService without import wiring.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
