import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { Button } from 'primeng/button';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-register-form',
  imports: [ReactiveFormsModule, InputText, Password, Button],
  templateUrl: './register-form.html',
  styleUrl: './register-form.css',
})
export class RegisterForm {
  private readonly fb = inject(FormBuilder);

  @Input() accentColor = '#3b82f6';
  @Input() hoverColor = '#2563eb';
  @Input() activeColor = '#1d4ed8';
  @Input() inputBg = '#ffffff';
  @Input() inputBorder = '#e5e7eb';

  @Output() submitted = new EventEmitter<RegisterPayload>();

  protected readonly form: FormGroup = this.fb.group(
    {
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(8)]],
    },
    { validators: passwordsMatchValidator },
  );

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

  protected get passwordStyle() {
    return {
      '--p-inputtext-background': this.inputBg,
      '--p-inputtext-border-color': this.inputBorder,
      '--p-inputtext-hover-border-color': this.accentColor,
      '--p-inputtext-focus-border-color': this.accentColor,
    };
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.value as RegisterPayload);
  }
}
