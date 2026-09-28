import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LoginForm, LoginCredentials } from '../../login-form/login-form';
import { AuthService } from '../../../../core/auth/auth.service';
import { siNestjs, siGoogle } from 'simple-icons';
import { RegisterPayload, RegisterForm } from '../../register-form/register-form';
import { GoogleAuthService } from '../../../../core/auth/google-auth.service';

type AuthTab = 'login' | 'cadastro';

@Component({
  selector: 'app-nestjs-shell',
  imports: [RouterLink, LoginForm, RegisterForm],
  templateUrl: './nestjs-shell.html',
  styleUrl: './nestjs-shell.css',
})
export class NestjsShell {
  protected readonly nestjsIcon = siNestjs.path;
  protected readonly googleIcon = siGoogle.path;
  protected readonly activeTab = signal<AuthTab>('login');
  protected readonly errorMessage = signal('');
  protected readonly twoFactorPending = signal(false);
  protected readonly tempToken = signal('');
  protected readonly twoFactorCode = signal('');
  protected readonly forgotEmail = signal('');
  protected readonly forgotSent = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router,
    private googleAuthService: GoogleAuthService,
  ) {}

  protected setTab(tab: AuthTab): void {
    this.activeTab.set(tab);
    this.errorMessage.set('');
  }

  protected onLoginSubmit(credentials: LoginCredentials): void {
    this.errorMessage.set('');
    this.authService.login('nestjs', credentials).subscribe({
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
    this.authService.verifyTwoFactor('nestjs', this.tempToken(), this.twoFactorCode()).subscribe({
      next: () => {
        this.twoFactorPending.set(false);
        this.goToDestination();
      },
      error: () => {
        this.errorMessage.set('Código inválido.');
      },
    });
  }

  private goToDestination(): void {
    this.authService.getProfile('nestjs').subscribe({
      next: (profile) => {
        const destination = profile.role === 'ADMIN' ? '/nestjs/dashboard' : '/nestjs/profile';
        this.router.navigate([destination]);
      },
    });
  }

  protected onRegisterSubmit(payload: RegisterPayload): void {
    this.errorMessage.set('');
    this.authService.register('nestjs', payload).subscribe({
      next: () => {
        this.authService
          .login('nestjs', { email: payload.email, password: payload.password })
          .subscribe({
            next: () => this.goToDestination(),
          });
      },
      error: () => {
        this.errorMessage.set('Erro ao cadastrar. Verifique os dados.');
      },
    });
  }

  protected sendForgotPassword(): void {
    this.authService.forgotPassword('nestjs', this.forgotEmail()).subscribe({
      next: () => this.forgotSent.set(true),
    });
  }

  protected loginWithGoogle(): void {
    this.errorMessage.set('');
    this.googleAuthService.promptLogin().subscribe({
      next: (idToken) => {
        this.authService.loginWithGoogle('nestjs', idToken).subscribe({
          next: (result) => {
            if (result.requiresTwoFactor) {
              this.tempToken.set(result.tempToken);
              this.twoFactorPending.set(true);
              return;
            }
            this.goToDestination();
          },
          error: () => this.errorMessage.set('Erro ao entrar com Google.'),
        });
      },
    });
  }
}
