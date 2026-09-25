import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../tokens/token.service';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  maxDevices: true,
  accessExpiresAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Admin-only user management (block/unblock, access expiry, device limits). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListUsersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {};
    if (query.status) where.status = query.status as UserStatus;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  async getOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SELECT,
        devices: {
          orderBy: { lastSeenAt: 'desc' },
          select: {
            id: true,
            fingerprint: true,
            name: true,
            ip: true,
            lastSeenAt: true,
            revoked: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    if (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) {
      throw new ConflictException('Phone number is already registered');
    }
    if (dto.email && (await this.prisma.user.findUnique({ where: { email: dto.email } }))) {
      throw new ConflictException('Email is already registered');
    }
    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email ?? null,
        phone: dto.phone,
        passwordHash: dto.password
          ? await argon2.hash(dto.password, { type: argon2.argon2id })
          : null,
        maxDevices: dto.maxDevices ?? this.config.getOrThrow<number>('defaultMaxDevices'),
      },
      select: USER_SELECT,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== user.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (taken) throw new ConflictException('Email is already registered');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.maxDevices !== undefined) data.maxDevices = dto.maxDevices;
    if (dto.accessExpiresAt !== undefined) {
      data.accessExpiresAt = dto.accessExpiresAt ? new Date(dto.accessExpiresAt) : null;
    }

    const updated = await this.prisma.user.update({ where: { id }, data, select: USER_SELECT });

    // Blocking / expiring a user must kill live sessions immediately.
    if (dto.status === 'BLOCKED' || (dto.accessExpiresAt && new Date(dto.accessExpiresAt) < new Date())) {
      await this.tokens.revokeAllUserTokens(id);
    }
    return updated;
  }

  /** Revoke every session of a user (remote logout everywhere). */
  async revokeAllSessions(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.tokens.revokeAllUserTokens(id);
    return { message: 'All sessions revoked' };
  }
}
