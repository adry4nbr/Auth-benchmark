import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { LoginCredentials } from '../../features/auth/login-form/login-form';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(stack: 'nestjs' | 'springboot', credentials: LoginCredentials): Observable<AuthResponse> {
    const baseUrl = environment.apiUrls[stack];
    return this.http.post<AuthResponse>(`${baseUrl}/auth/login`, credentials);
  }
}
