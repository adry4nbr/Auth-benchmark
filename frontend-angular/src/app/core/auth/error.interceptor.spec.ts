import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { errorInterceptor } from './error.interceptor';

function createFakeToken(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payloadB64}.fake-sig`;
}

describe('errorInterceptor', () => {
  let authServiceSpy: {
    getToken: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let routerSpy: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authServiceSpy = {
      getToken: vi.fn(),
      logout: vi.fn(),
    };
    routerSpy = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('deve ignorar requisições para rotas que contenham /auth/', async () => {
    const req = new HttpRequest('POST', 'http://localhost:3000/api/v1/auth/login', {});
    const errorResponse = new HttpErrorResponse({ status: 401, url: req.url });
    const next = () => throwError(() => errorResponse);

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => errorInterceptor(req, next))),
    ).rejects.toBe(errorResponse);

    expect(authServiceSpy.logout).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('deve deslogar e navegar para / em 401 para rotas que não sejam /auth/', async () => {
    const req = new HttpRequest('GET', 'http://localhost:3000/api/v1/user/profile');
    const errorResponse = new HttpErrorResponse({ status: 401, url: req.url });
    const next = () => throwError(() => errorResponse);

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => errorInterceptor(req, next))),
    ).rejects.toBe(errorResponse);

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });

  it('deve deslogar e navegar para / em 403 se o token estiver expirado ou ausente', async () => {
    const req = new HttpRequest('GET', 'http://localhost:3000/api/v1/admin/users');
    const errorResponse = new HttpErrorResponse({ status: 403, url: req.url });
    const next = () => throwError(() => errorResponse);

    authServiceSpy.getToken.mockReturnValue(null);

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => errorInterceptor(req, next))),
    ).rejects.toBe(errorResponse);

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });

  it('NÃO deve deslogar em 403 se o token local ainda for válido', async () => {
    const req = new HttpRequest('GET', 'http://localhost:3000/api/v1/admin/users');
    const errorResponse = new HttpErrorResponse({ status: 403, url: req.url });
    const next = () => throwError(() => errorResponse);

    const futuro = Math.floor(Date.now() / 1000) + 3600;
    authServiceSpy.getToken.mockReturnValue(createFakeToken({ role: 'USER', exp: futuro }));

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => errorInterceptor(req, next))),
    ).rejects.toBe(errorResponse);

    expect(authServiceSpy.logout).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });
});
