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

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(stack: 'nestjs' | 'springboot', credentials: LoginCredentials): Observable<unknown> {
    const baseUrl = environment.apiUrls[stack];
    return this.http
      .post<NestjsAuthResponse | SpringbootAuthResponse>(`${baseUrl}/auth/login`, credentials)
      .pipe(tap((response) => this.saveSession(stack, response)));
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

  private saveSession(
    stack: 'nestjs' | 'springboot',
    response: NestjsAuthResponse | SpringbootAuthResponse,
  ): void {
    const token = 'access_token' in response ? response.access_token : response.token;
    localStorage.setItem('accessToken', token);
    localStorage.setItem('activeStack', stack);
  }
}
