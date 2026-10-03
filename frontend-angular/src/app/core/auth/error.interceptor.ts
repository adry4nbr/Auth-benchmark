import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { isExpired } from './jwt.util';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (!req.url.includes('/auth/')) {
          const token = authService.getToken();
          const tokenExpiredOrMissing = !token || isExpired(token);

          if (error.status === 401 || (error.status === 403 && tokenExpiredOrMissing)) {
            authService.logout();
            router.navigate(['/']);
          }
        }
      }
      return throwError(() => error);
    }),
  );
};
