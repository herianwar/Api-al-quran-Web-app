import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiAdminController, AiController } from './ai.controller';
import { AiService } from './ai.service';
import { SemanticSearchService } from './semantic-search.service';

/**
 * Global so SeedService can inject AiService for the bulk embeddings job
 * without circular module imports.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AiController, AiAdminController],
  providers: [AiService, SemanticSearchService],
  exports: [AiService, SemanticSearchService],
})
export class AiModule {}
