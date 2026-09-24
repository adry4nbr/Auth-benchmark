import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { AuthService, UserProfile } from '../../../core/auth/auth.service';
import { siNestjs } from 'simple-icons';

@Component({
  selector: 'app-nestjs-profile',
  imports: [RouterLink],
  templateUrl: './nestjs-profile.html',
  styleUrl: './nestjs-profile.css',
})
export class NestjsProfile implements OnInit {
  protected readonly nestjsIcon = siNestjs.path;
  protected readonly profile = signal<UserProfile | null>(null);

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.authService.getProfile('nestjs').subscribe({
      next: (profile) => this.profile.set(profile),
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  protected activateTwoFactor(): void {
    // próximo passo: fluxo de setup do 2FA
    console.log('Ativar 2FA — a construir');
  }
}
