import { Component } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Router } from '@angular/router';
import { UsersTable } from '../users-table/users-table';

@Component({
  selector: 'app-nestjs-dashboard',
  imports: [UsersTable],
  template: `
    <div class="p-8 bg-[#0a0a0f] min-h-screen text-white">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-xl font-bold">Dashboard NestJS</h1>
        <button (click)="logout()" class="text-sm text-gray-400 hover:text-white">Sair</button>
      </div>
      <app-users-table stack="nestjs" />
    </div>
  `,
})
export class NestjsDashboard {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
