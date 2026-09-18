import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoginForm, LoginCredentials } from '../../login-form/login-form';
import { AuthService } from '../../../../core/auth/auth.service';
import { siNestjs, siGoogle } from 'simple-icons';

type AuthTab = 'login' | 'cadastro';

@Component({
  selector: 'app-nestjs-shell',
  imports: [RouterLink, LoginForm],
  templateUrl: './nestjs-shell.html',
  styleUrl: './nestjs-shell.css',
})
export class NestjsShell {
  protected readonly nestjsIcon = siNestjs.path;
  protected readonly googleIcon = siGoogle.path;
  protected readonly activeTab = signal<AuthTab>('login');
  protected errorMessage = '';

  constructor(private authService: AuthService) {}

  protected setTab(tab: AuthTab): void {
    this.activeTab.set(tab);
    this.errorMessage = '';
  }

  protected onLoginSubmit(credentials: LoginCredentials): void {
    this.errorMessage = '';
    this.authService.login('nestjs', credentials).subscribe({
      next: (response) => console.log('Login OK:', response),
      error: () => {
        this.errorMessage = 'E-mail ou senha inválidos.';
      },
    });
  }
}
