import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { GrantPermissionDto, ListPermissionsQuery } from './dto/permissions.dto';
import { PermissionsService } from './permissions.service';

@UseGuards(AdminGuard)
@Controller('admin/permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  list(@Query() query: ListPermissionsQuery) {
    return this.permissions.list(query);
  }

  @Post()
  grant(@Body() dto: GrantPermissionDto) {
    return this.permissions.grant(dto);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.permissions.revoke(id);
  }
}
