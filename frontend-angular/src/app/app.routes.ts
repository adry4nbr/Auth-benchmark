import { Routes } from '@angular/router';
import { Landing } from './features/landing/landing';
import { NestjsShell } from './features/auth/shells/nestjs-shell/nestjs-shell';
import { SpringbootShell } from './features/auth/shells/springboot-shell/springboot-shell';
import { authGuard } from './core/auth/auth.guard';
import { NestjsDashboard } from './features/admin/nestjs-dashboard/nestjs-dashboard';
import { SpringbootDashboard } from './features/admin/springboot-dashboard/springboot-dashboard';
import { NestjsProfile } from './features/profile/nestjs-profile/nestjs-profile';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'nestjs', component: NestjsShell },
  { path: 'springboot', component: SpringbootShell },
  { path: 'nestjs/dashboard', component: NestjsDashboard, canActivate: [authGuard] },
  { path: 'springboot/dashboard', component: SpringbootDashboard, canActivate: [authGuard] },
  { path: 'nestjs/profile', component: NestjsProfile, canActivate: [authGuard] },
];
