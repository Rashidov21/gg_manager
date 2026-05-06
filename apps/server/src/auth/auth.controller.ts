import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: unknown) {
    const parsed = loginSchema.parse(body);
    return this.auth.login(parsed.username, parsed.password);
  }

  @Post('refresh')
  async refresh(@Body() body: unknown) {
    const parsed = refreshSchema.parse(body);
    return this.auth.refresh(parsed.refreshToken);
  }
}
