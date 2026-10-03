import { Routes } from '@angular/router';
import { Landing } from './features/landing/landing';
import { NestjsShell } from './features/auth/shells/nestjs-shell/nestjs-shell';
import { SpringbootShell } from './features/auth/shells/springboot-shell/springboot-shell';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/admin.guard';
import { NestjsDashboard } from './features/admin/nestjs-dashboard/nestjs-dashboard';
import { SpringbootDashboard } from './features/admin/springboot-dashboard/springboot-dashboard';
import { NestjsProfile } from './features/profile/nestjs-profile/nestjs-profile';
import { SpringbootProfile } from './features/profile/springboot-profile/springboot-profile';
import { ResetPassword } from './features/auth/reset-password/reset-password';
import { ForgotPassword } from './features/auth/forgot-password/forgot-password';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'nestjs', component: NestjsShell },
  { path: 'springboot', component: SpringbootShell },
  { path: 'nestjs/dashboard', component: NestjsDashboard, canActivate: [authGuard, adminGuard] },
  { path: 'springboot/dashboard', component: SpringbootDashboard, canActivate: [authGuard, adminGuard] },
  { path: 'nestjs/profile', component: NestjsProfile, canActivate: [authGuard] },
  { path: 'springboot/profile', component: SpringbootProfile, canActivate: [authGuard] },
  { path: 'reset-password', component: ResetPassword },
  { path: 'nestjs/forgot-password', component: ForgotPassword, data: { stack: 'nestjs' } },
  { path: 'springboot/forgot-password', component: ForgotPassword, data: { stack: 'springboot' } },
];
