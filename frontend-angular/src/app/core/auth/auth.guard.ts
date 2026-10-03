import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { isExpired } from './jwt.util';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (token && !isExpired(token)) {
    return true;
  }

  authService.logout();
  router.navigate(['/']);
  return false;
};
