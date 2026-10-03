import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { LoginCredentials } from '../../features/auth/login-form/login-form';

interface NestjsAuthResponse {
  access_token: string;
  refresh_token: string;
}

interface SpringbootAuthResponse {
  token: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string };
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface TwoFactorSetup {
  qrCodeDataUrl: string;
  manualEntryKey: string;
}

interface TwoFactorPendingResponse {
  requiresTwoFactor: true;
  tempToken: string;
}

export type LoginResult =
  { requiresTwoFactor: true; tempToken: string } | { requiresTwoFactor: false };

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(stack: 'nestjs' | 'springboot', credentials: LoginCredentials): Observable<LoginResult> {
    const baseUrl = environment.apiUrls[stack];
    return this.http
      .post<NestjsAuthResponse | SpringbootAuthResponse | TwoFactorPendingResponse>(
        `${baseUrl}/auth/login`,
        credentials,
      )
      .pipe(
        tap((response) => {
          if (!('requiresTwoFactor' in response)) {
            this.saveSession(stack, response);
          }
        }),
        map((response) =>
          'requiresTwoFactor' in response
            ? { requiresTwoFactor: true as const, tempToken: response.tempToken }
            : { requiresTwoFactor: false as const },
        ),
      );
  }

  register(stack: 'nestjs' | 'springboot', payload: RegisterPayload): Observable<unknown> {
    const baseUrl = environment.apiUrls[stack];
    return this.http
      .post<NestjsAuthResponse | SpringbootAuthResponse>(`${baseUrl}/auth/register`, payload)
      .pipe(tap((response) => this.saveSession(stack, response)));
  }

  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('activeStack');
    localStorage.removeItem('resetStack');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('accessToken');
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  getActiveStack(): 'nestjs' | 'springboot' | null {
    return localStorage.getItem('activeStack') as 'nestjs' | 'springboot' | null;
  }

  getProfile(stack: 'nestjs' | 'springboot'): Observable<UserProfile> {
    const baseUrl = environment.apiUrls[stack];
    return this.http.get<UserProfile>(`${baseUrl}/user/profile`).pipe(
      map((response) => ({
        name: response.name,
        email: response.email,
        role: response.role,
        twoFactorEnabled: response.twoFactorEnabled,
      })),
    );
  }

  setupTwoFactor(stack: 'nestjs' | 'springboot'): Observable<TwoFactorSetup> {
    const baseUrl = environment.apiUrls[stack];
    return this.http.post<TwoFactorSetup>(`${baseUrl}/user/2fa/setup`, {});
  }

  enableTwoFactor(stack: 'nestjs' | 'springboot', code: string): Observable<unknown> {
    const baseUrl = environment.apiUrls[stack];
    return this.http.post(`${baseUrl}/user/2fa/enable`, { code });
  }

  verifyTwoFactor(
    stack: 'nestjs' | 'springboot',
    tempToken: string,
    code: string,
  ): Observable<unknown> {
    const baseUrl = environment.apiUrls[stack];
    return this.http
      .post<NestjsAuthResponse | SpringbootAuthResponse>(`${baseUrl}/auth/2fa/verify`, {
        tempToken,
        code,
      })
      .pipe(tap((response) => this.saveSession(stack, response)));
  }

  loginWithGoogle(stack: 'nestjs' | 'springboot', idToken: string): Observable<LoginResult> {
    const baseUrl = environment.apiUrls[stack];
    return this.http
      .post<NestjsAuthResponse | SpringbootAuthResponse | TwoFactorPendingResponse>(
        `${baseUrl}/auth/social/google`,
        { idToken },
      )
      .pipe(
        tap((response) => {
          if (!('requiresTwoFactor' in response)) {
            this.saveSession(stack, response);
          }
        }),
        map((response) =>
          'requiresTwoFactor' in response
            ? { requiresTwoFactor: true as const, tempToken: response.tempToken }
            : { requiresTwoFactor: false as const },
        ),
      );
  }

  forgotPassword(stack: 'nestjs' | 'springboot', email: string): Observable<{ message: string }> {
    const baseUrl = environment.apiUrls[stack];
    localStorage.setItem('resetStack', stack);
    return this.http.post<{ message: string }>(`${baseUrl}/auth/forgot-password`, { email });
  }

  resetPassword(
    stack: 'nestjs' | 'springboot',
    token: string,
    newPassword: string,
  ): Observable<{ message: string }> {
    const baseUrl = environment.apiUrls[stack];
    return this.http.post<{ message: string }>(`${baseUrl}/auth/reset-password`, {
      token,
      newPassword,
    });
  }

  getResetStack(): 'nestjs' | 'springboot' | null {
    return localStorage.getItem('resetStack') as 'nestjs' | 'springboot' | null;
  }

  private saveSession(
    stack: 'nestjs' | 'springboot',
    response: NestjsAuthResponse | SpringbootAuthResponse,
  ): void {
    const token = 'access_token' in response ? response.access_token : response.token;
    localStorage.setItem('accessToken', token);
    localStorage.setItem('activeStack', stack);
  }
}
