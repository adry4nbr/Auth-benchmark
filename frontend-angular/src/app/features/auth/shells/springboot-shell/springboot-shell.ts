import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoginForm, LoginCredentials } from '../../login-form/login-form';
import { AuthService } from '../../../../core/auth/auth.service';
import { siSpringboot } from 'simple-icons';

@Component({
  selector: 'app-springboot-shell',
  imports: [RouterLink, LoginForm],
  templateUrl: './springboot-shell.html',
  styleUrl: './springboot-shell.css',
})
export class SpringbootShell {
  protected readonly springbootIcon = siSpringboot.path;
  protected errorMessage = '';

  protected readonly features = [
    'JWT + Refresh tokens',
    'TOTP Two-Factor Auth',
    'OAuth2 com Google',
    'Role-based access control',
  ];

  constructor(private authService: AuthService) {}

  protected onLoginSubmit(credentials: LoginCredentials): void {
    this.errorMessage = '';
    this.authService.login('springboot', credentials).subscribe({
      next: (response) => console.log('Login OK:', response),
      error: () => {
        this.errorMessage = 'E-mail ou senha inválidos.';
      },
    });
  }
}
