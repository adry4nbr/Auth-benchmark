import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { AuthService, UserProfile, TwoFactorSetup } from '../../../core/auth/auth.service';
import { siNestjs } from 'simple-icons';

type SetupStep = 'idle' | 'showing-qr' | 'done';

@Component({
  selector: 'app-nestjs-profile',
  imports: [RouterLink],
  templateUrl: './nestjs-profile.html',
  styleUrl: './nestjs-profile.css',
})
export class NestjsProfile implements OnInit {
  protected readonly nestjsIcon = siNestjs.path;
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly setupStep = signal<SetupStep>('idle');
  protected readonly setupData = signal<TwoFactorSetup | null>(null);
  protected readonly code = signal('');
  protected readonly setupError = signal('');

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  private loadProfile(): void {
    this.authService.getProfile('nestjs').subscribe({
      next: (profile) => this.profile.set(profile),
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  protected activateTwoFactor(): void {
    this.setupError.set('');
    this.authService.setupTwoFactor('nestjs').subscribe({
      next: (data) => {
        this.setupData.set(data);
        this.setupStep.set('showing-qr');
      },
      error: () => this.setupError.set('Erro ao gerar QR code.'),
    });
  }

  protected onCodeInput(value: string): void {
    this.code.set(value);
  }

  protected confirmCode(): void {
    this.setupError.set('');
    this.authService.enableTwoFactor('nestjs', this.code()).subscribe({
      next: () => {
        this.setupStep.set('done');
        this.code.set('');
        this.loadProfile();
      },
      error: () => this.setupError.set('Código inválido. Tente novamente.'),
    });
  }

  protected cancelSetup(): void {
    this.setupStep.set('idle');
    this.setupData.set(null);
    this.code.set('');
  }
}
