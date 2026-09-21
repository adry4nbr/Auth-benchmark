import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { Button } from 'primeng/button';

export interface LoginCredentials {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login-form',
  imports: [ReactiveFormsModule, InputText, Password, Button],
  templateUrl: './login-form.html',
  styleUrl: './login-form.css',
})
export class LoginForm {
  @Input() accentColor = '#3b82f6';
  @Input() hoverColor = '#2563eb';
  @Input() activeColor = '#1d4ed8';
  @Input() inputBg = '#ffffff';
  @Input() inputBorder = '#e5e7eb';

  @Output() submitted = new EventEmitter<LoginCredentials>();

  protected readonly form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  protected get buttonTokens() {
    return {
      background: this.accentColor,
      hoverBackground: this.hoverColor,
      activeBackground: this.activeColor,
      borderColor: this.accentColor,
      hoverBorderColor: this.hoverColor,
      activeBorderColor: this.activeColor,
      color: '#ffffff',
      primary: {
        background: this.accentColor,
        hoverBackground: this.hoverColor,
        activeBackground: this.activeColor,
        borderColor: this.accentColor,
        hoverBorderColor: this.hoverColor,
        activeBorderColor: this.activeColor,
        color: '#ffffff',
      },
    };
  }

  protected get inputTokens() {
    return {
      background: this.inputBg,
      borderColor: this.inputBorder,
      hoverBorderColor: this.accentColor,
      focusBorderColor: this.accentColor,
    };
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.value as LoginCredentials);
  }
}
