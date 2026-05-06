import { createContext } from 'react';
import type { LoginResponse } from './api';

export type AuthState = {
  user: LoginResponse['user'] | null;
  accessToken: string | null;
  refreshToken: string | null;
};

export type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
