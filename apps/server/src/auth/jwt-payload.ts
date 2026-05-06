import type { Role } from '@prisma/client';

export type AccessTokenPayload = {
  sub: string;
  username: string;
  role: Role;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  type: 'refresh';
};

export type AuthenticatedUser = {
  id: string;
  username: string;
  role: Role;
};
