import { Component } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Router } from '@angular/router';
import { UsersTable } from '../users-table/users-table';

@Component({
  selector: 'app-springboot-dashboard',
  imports: [UsersTable],
  template: `
    <div class="p-8 bg-gray-50 min-h-screen">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-xl font-bold text-gray-900">Dashboard Spring Boot</h1>
        <button (click)="logout()" class="text-sm text-gray-500 hover:text-gray-900">Sair</button>
      </div>
      <app-users-table stack="springboot" />
    </div>
  `,
})
export class SpringbootDashboard {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
