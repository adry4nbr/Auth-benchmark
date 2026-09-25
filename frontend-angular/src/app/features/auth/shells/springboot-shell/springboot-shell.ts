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
  protected readonly springIcon = siSpring.path;
  protected readonly googleIcon = siGoogle.path;
  protected readonly activeTab = signal<AuthTab>('login');
  protected readonly errorMessage = signal('');
  protected readonly twoFactorPending = signal(false);
  protected readonly tempToken = signal('');
  protected readonly twoFactorCode = signal('');

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  protected setTab(tab: AuthTab): void {
    this.activeTab.set(tab);
    this.errorMessage.set('');
  }

  protected onLoginSubmit(credentials: LoginCredentials): void {
    this.errorMessage.set('');
    this.authService.login('springboot', credentials).subscribe({
      next: (result) => {
        if (result.requiresTwoFactor) {
          this.tempToken.set(result.tempToken);
          this.twoFactorPending.set(true);
          return;
        }
        this.goToDestination();
      },
      error: () => {
        this.errorMessage.set('E-mail ou senha inválidos.');
      },
    });
  }

  protected onTwoFactorCodeInput(value: string): void {
    this.twoFactorCode.set(value);
  }

  protected confirmTwoFactorLogin(): void {
    this.errorMessage.set('');
    this.authService
      .verifyTwoFactor('springboot', this.tempToken(), this.twoFactorCode())
      .subscribe({
        next: () => {
          this.twoFactorPending.set(false);
          this.goToDestination();
        },
        error: () => {
          this.errorMessage.set('Código inválido.');
        },
      });
  }

  protected onRegisterSubmit(payload: RegisterPayload): void {
    this.errorMessage.set('');
    this.authService.register('springboot', payload).subscribe({
      next: () => {
        this.authService
          .login('springboot', { email: payload.email, password: payload.password })
          .subscribe({
            next: () => this.goToDestination(),
          });
      },
      error: () => {
        this.errorMessage.set('Erro ao cadastrar. Verifique os dados.');
      },
    });
  }

  private goToDestination(): void {
    this.authService.getProfile('springboot').subscribe({
      next: (profile) => {
        const destination =
          profile.role === 'ADMIN' ? '/springboot/dashboard' : '/springboot/profile';
        this.router.navigate([destination]);
      },
    });
  }
}
