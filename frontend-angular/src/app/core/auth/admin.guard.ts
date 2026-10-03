import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { decodePayload, isExpired } from './jwt.util';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (!token || isExpired(token)) {
    authService.logout();
    router.navigate(['/']);
    return false;
  }

  const payload = decodePayload(token);
  if (payload?.role === 'ADMIN') {
    return true;
  }

  const activeStack = authService.getActiveStack();
  const profileRoute = activeStack === 'springboot' ? '/springboot/profile' : '/nestjs/profile';
  router.navigate([profileRoute]);
  return false;
};
