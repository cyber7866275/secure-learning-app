import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminGuard } from '../common/guards/admin.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { DevicesService } from './devices.service';

@Controller()
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Devices belonging to the logged-in user. */
  @Get('devices')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  listMine(@Req() req: Request & { user: JwtPayload }) {
    return this.devices.listUserDevices(req.user.userId);
  }

  /** Admin remote-logout of one device. */
  @Post('admin/devices/:id/revoke')
  @UseGuards(AdminGuard)
  revoke(@Param('id') id: string) {
    return this.devices.revokeDevice(id);
  }
}
