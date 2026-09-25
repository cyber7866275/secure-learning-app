import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AlertsQuery, LoginAttemptsQuery, PaginationQuery } from './dto/security.dto';
import { SecurityService } from './security.service';

/**
 * Read-only security feeds for the admin panel. These fill the gaps Stage 3
 * left as honest placeholders — the backend was already logging everything,
 * it just had no list endpoints.
 */
@UseGuards(AdminGuard)
@Controller('admin/security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('alerts')
  alerts(@Query() query: AlertsQuery) {
    return this.security.alerts(query);
  }

  @Patch('alerts/:id/seen')
  markSeen(@Param('id') id: string) {
    return this.security.markSeen(id);
  }

  @Get('login-attempts')
  loginAttempts(@Query() query: LoginAttemptsQuery) {
    return this.security.loginAttempts(query);
  }

  @Get('denied-attempts')
  deniedAttempts(@Query() query: PaginationQuery) {
    return this.security.deniedAttempts(query);
  }
}
