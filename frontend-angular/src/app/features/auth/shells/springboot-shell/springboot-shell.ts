import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LoginForm, LoginCredentials } from '../../login-form/login-form';
import { AuthService } from '../../../../core/auth/auth.service';
import { siSpring, siGoogle } from 'simple-icons';
import { RegisterPayload, RegisterForm } from '../../register-form/register-form';

type AuthTab = 'login' | 'cadastro';

@Component({
  selector: 'app-springboot-shell',
  imports: [RouterLink, LoginForm, RegisterForm],
  templateUrl: './springboot-shell.html',
  styleUrl: './springboot-shell.css',
})
export class SpringbootShell {
  protected readonly springbootIcon = siSpring.path;
  protected readonly googleIcon = siGoogle.path;
  protected readonly activeTab = signal<AuthTab>('login');
  protected errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}
  protected setTab(tab: AuthTab): void {
    this.activeTab.set(tab);
    this.errorMessage = '';
  }

  protected onLoginSubmit(credentials: LoginCredentials): void {
    this.errorMessage = '';
    this.authService.login('springboot', credentials).subscribe({
      next: () => {
        this.authService.getProfile('springboot').subscribe({
          next: (profile) => {
            const destination =
              profile.role === 'ADMIN' ? '/springboot/dashboard' : '/springboot/profile';
            this.router.navigate([destination]);
          },
        });
      },
      error: () => {
        this.errorMessage = 'E-mail ou senha inválidos.';
      },
    });
  }

  protected onRegisterSubmit(payload: RegisterPayload): void {
    this.errorMessage = '';
    this.authService.register('springboot', payload).subscribe({
      next: () => this.router.navigate(['/springboot/dashboard']),
      error: () => {
        this.errorMessage = 'Erro ao cadastrar. Verifique os dados.';
      },
    });
  }
}
