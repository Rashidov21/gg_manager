import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Operator, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
  RefreshTokenPayload,
} from './jwt-payload';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(
    username: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
    const operator = await this.prisma.operator.findUnique({ where: { username } });
    if (!operator) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, operator.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.buildTokens(operator);
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const operator = await this.prisma.operator.findUnique({ where: { id: payload.sub } });
    if (!operator) throw new UnauthorizedException('Operator not found');

    return this.buildTokens(operator);
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (payload.type !== 'access') throw new UnauthorizedException('Invalid token type');

    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async createOperatorIfMissing(username: string, password: string, role: Role): Promise<void> {
    const existing = await this.prisma.operator.findUnique({ where: { username } });
    if (existing) return;
    const passwordHash = await this.hashPassword(password);
    await this.prisma.operator.create({
      data: { username, passwordHash, role },
    });
  }

  private async buildTokens(
    operator: Operator,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
    const accessSecret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    const refreshSecret = this.config.get('JWT_REFRESH_SECRET', { infer: true });
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });

    const accessPayload: AccessTokenPayload = {
      sub: operator.id,
      username: operator.username,
      role: operator.role,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: operator.id,
      type: 'refresh',
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: accessSecret,
      expiresIn: accessTtl as unknown as number,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: refreshSecret,
      expiresIn: refreshTtl as unknown as number,
    });

    return {
      accessToken,
      refreshToken,
      user: { id: operator.id, username: operator.username, role: operator.role },
    };
  }
}
