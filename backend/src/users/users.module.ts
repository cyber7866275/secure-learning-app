import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TokensModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
