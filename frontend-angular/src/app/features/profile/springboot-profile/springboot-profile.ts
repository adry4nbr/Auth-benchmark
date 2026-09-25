import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { AuthService, UserProfile } from '../../../core/auth/auth.service';
import { siSpring } from 'simple-icons';

@Component({
  selector: 'app-springboot-profile',
  imports: [RouterLink],
  templateUrl: './springboot-profile.html',
  styleUrl: './springboot-profile.css',
})
export class SpringbootProfile implements OnInit {
  protected readonly springIcon = siSpring.path;
  protected readonly profile = signal<UserProfile | null>(null);

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.authService.getProfile('springboot').subscribe({
      next: (profile) => this.profile.set(profile),
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  protected activateTwoFactor(): void {
    console.log('Ativar 2FA — a construir');
  }
}
