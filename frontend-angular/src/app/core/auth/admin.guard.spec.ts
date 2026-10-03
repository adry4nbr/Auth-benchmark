import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { adminGuard } from './admin.guard';
import { AuthService } from './auth.service';

function createFakeToken(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payloadB64}.fake-sig`;
}

describe('adminGuard', () => {
  let authServiceSpy: {
    getToken: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    getActiveStack: ReturnType<typeof vi.fn>;
  };
  let routerSpy: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authServiceSpy = {
      getToken: vi.fn(),
      logout: vi.fn(),
      getActiveStack: vi.fn(),
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

  it('deve permitir acesso quando token é válido e role é ADMIN', () => {
    const futuro = Math.floor(Date.now() / 1000) + 3600;
    const token = createFakeToken({ role: 'ADMIN', exp: futuro });
    authServiceSpy.getToken.mockReturnValue(token);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBe(true);
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('deve deslogar e redirecionar para / se o token não existir ou estiver expirado', () => {
    authServiceSpy.getToken.mockReturnValue(null);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBe(false);
    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });

  it('deve redirecionar para /nestjs/profile quando logado com role USER na stack nestjs', () => {
    const futuro = Math.floor(Date.now() / 1000) + 3600;
    const token = createFakeToken({ role: 'USER', exp: futuro });
    authServiceSpy.getToken.mockReturnValue(token);
    authServiceSpy.getActiveStack.mockReturnValue('nestjs');

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBe(false);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/nestjs/profile']);
  });

  it('deve redirecionar para /springboot/profile quando logado com role USER na stack springboot', () => {
    const futuro = Math.floor(Date.now() / 1000) + 3600;
    const token = createFakeToken({ role: 'USER', exp: futuro });
    authServiceSpy.getToken.mockReturnValue(token);
    authServiceSpy.getActiveStack.mockReturnValue('springboot');

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBe(false);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/springboot/profile']);
  });
});
