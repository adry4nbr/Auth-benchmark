import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Router } from '@angular/router';
import { UsersTable } from '../users-table/users-table';
import { siSpring } from 'simple-icons';

@Component({
  selector: 'app-springboot-dashboard',
  imports: [RouterLink, UsersTable],
  templateUrl: './springboot-dashboard.html',
  styleUrl: './springboot-dashboard.css',
})
export class SpringbootDashboard {
  protected readonly springIcon = siSpring.path;
  protected readonly totalUsers = signal<number | null>(null);

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  protected onTotalUsersChange(total: number): void {
    this.totalUsers.set(total);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
