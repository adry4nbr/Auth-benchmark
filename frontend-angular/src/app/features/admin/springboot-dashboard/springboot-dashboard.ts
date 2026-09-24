import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Router } from '@angular/router';
import { UsersTable } from '../users-table/users-table';
import { siSpringboot } from 'simple-icons';

@Component({
  selector: 'app-springboot-dashboard',
  imports: [RouterLink, UsersTable],
  templateUrl: './springboot-dashboard.html',
  styleUrl: './springboot-dashboard.css',
})
export class SpringbootDashboard {
  protected readonly springbootIcon = siSpringboot.path;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
