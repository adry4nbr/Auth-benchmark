import { Routes } from '@angular/router';
import { Landing } from './features/landing/landing';
import { NestjsShell } from './features/auth/shells/nestjs-shell/nestjs-shell';
import { SpringbootShell } from './features/auth/shells/springboot-shell/springboot-shell';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'nestjs', component: NestjsShell },
  { path: 'springboot', component: SpringbootShell },
];
