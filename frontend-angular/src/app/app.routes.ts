import { Routes } from '@angular/router';
import { Landing } from './features/landing/landing';
import { NestjsShell } from './features/auth/shells/nestjs-shell/nestjs-shell';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'nestjs', component: NestjsShell },
];
