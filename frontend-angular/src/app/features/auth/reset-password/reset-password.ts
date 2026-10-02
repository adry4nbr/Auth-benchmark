import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Password } from 'primeng/password';
import { Button } from 'primeng/button';
import { AuthService } from '../../../core/auth/auth.service';

type Stack = 'nestjs' | 'springboot';

@Component({
  selector: 'app-reset-password',
  imports: [RouterLink, ReactiveFormsModule, Password, Button],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
})
export class ResetPassword implements OnInit {
  protected readonly token = signal('');
  protected readonly stack = signal<Stack>('nestjs');
  protected readonly successMessage = signal('');
  protected readonly errorMessage = signal('');

  protected readonly form: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private authService: AuthService,
  ) {
    this.form = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.token.set(params.get('token') ?? '');

    const stackFromUrl = params.get('stack');
    if (stackFromUrl === 'nestjs' || stackFromUrl === 'springboot') {
      this.stack.set(stackFromUrl);
    } else {
      const saved = this.authService.getResetStack();
      this.stack.set(saved === 'springboot' ? 'springboot' : 'nestjs');
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');

    this.authService
      .resetPassword(this.stack(), this.token(), this.form.value.newPassword)
      .subscribe({
        next: () =>
          this.successMessage.set('Senha atualizada com sucesso! Você já pode fazer login.'),
        error: () => this.errorMessage.set('Token inválido ou expirado.'),
      });
  }
}
