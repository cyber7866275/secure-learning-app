import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@UseGuards(AdminGuard)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.users.getOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/revoke-all')
  revokeAll(@Param('id') id: string) {
    return this.users.revokeAllSessions(id);
  }
}
