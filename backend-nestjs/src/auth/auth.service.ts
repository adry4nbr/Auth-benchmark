import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { OTP } from 'otplib';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { createHash, randomBytes } from 'crypto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { PasswordReset } from '../../generated/prisma/client';
import { OAuth2Client } from 'google-auth-library';
import type { LoginTicket } from 'google-auth-library';
import { GoogleLoginDto } from './dto/google-login.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private otp = new OTP();
  private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('As duas senhas precisam ser iguais.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Este email já está cadastrado.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const usuario = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, password: hashedPassword },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return usuario;
  }

  async login(dto: LoginDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!existingUser || !existingUser.password) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const comparePassword = await bcrypt.compare(
      dto.password,
      existingUser.password,
    );

    if (!comparePassword) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (existingUser.twoFactorEnabled) {
      const tempToken = this.jwtService.sign(
        { sub: existingUser.id, stage: '2fa-pending' },
        { expiresIn: '5m' },
      );

      return {
        requiresTwoFactor: true,
        tempToken,
      };
    }

    const accessToken = this.jwtService.sign({
      sub: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    });

    const refreshToken = randomBytes(40).toString('hex');
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        userId: existingUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async verifyTwoFactor(dto: Verify2faDto) {
    let payload: { sub: string; stage?: string };

    try {
      payload = this.jwtService.verify(dto.tempToken);
    } catch {
      throw new UnauthorizedException('Token temporário inválido ou expirado');
    }

    if (payload.stage !== '2fa-pending') {
      throw new UnauthorizedException('Token inválido para está operação.');
    }

    const usuario = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!usuario || !usuario.twoFactorSecret) {
      throw new UnauthorizedException(
        'Usuário inválido ou 2FA não configurado',
      );
    }

    const result = await this.otp.verify({
      secret: usuario.twoFactorSecret,
      token: dto.code,
    });

    if (!result.valid) {
      throw new UnauthorizedException('Código de autenticação inválido');
    }

    const token = this.jwtService.sign({
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role,
    });

    return { access_token: token };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const usuario = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (usuario) {
      const token = randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 10);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.passwordReset.create({
        data: {
          email: dto.email,
          tokenHash,
          expiresAt,
        },
      });

      const resetLink = `http://localhost:4200/reset-password?token=${token}`;
      await this.sendPasswordResetEmail(dto.email, resetLink);
    }

    return {
      message: 'Se o e-mail existir, um link de recuperação foi enviado.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resets = await this.prisma.passwordReset.findMany({
      where: { expiresAt: { gt: new Date() } },
    });

    let resetEncontrado: PasswordReset | null = null;

    for (const reset of resets) {
      const bate = await bcrypt.compare(dto.token, reset.tokenHash);
      if (bate) {
        resetEncontrado = reset;
        break;
      }
    }

    if (!resetEncontrado) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { email: resetEncontrado.email },
      data: { password: hashedPassword },
    });

    await this.prisma.passwordReset.delete({
      where: { id: resetEncontrado.id },
    });

    return { message: 'Senha atualizada com sucesso.' };
  }

  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  private async sendPasswordResetEmail(
    to: string,
    resetLink: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: `"Auth Benchmark" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Recuperação de senha',
      html: `
      <p>Você solicitou a recuperação de senha.</p>
      <p><a href="${resetLink}">Clique aqui para redefinir sua senha</a></p>
      <p>Esse link expira em 15 minutos. Se você não solicitou isso, ignore este e-mail.</p>
    `,
    });
  }

  async loginWithGoogle(dto: GoogleLoginDto) {
    let ticket: LoginTicket;

    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch {
      throw new UnauthorizedException('Token do Google inválido');
    }

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      throw new UnauthorizedException(
        'Não foi possível obter o e-mail da conta Google',
      );
    }

    const usuario = await this.prisma.user.upsert({
      where: { email: payload.email },
      update: {},
      create: {
        name: payload.name ?? 'Usuário Google',
        email: payload.email,
        password: null,
      },
    });

    if (usuario.twoFactorEnabled) {
      const tempToken = this.jwtService.sign(
        { sub: usuario.id, stage: '2fa-pending' },
        { expiresIn: '5m' },
      );

      return {
        requiresTwoFactor: true,
        tempToken,
      };
    }

    const token = this.jwtService.sign({
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role,
    });

    return { access_token: token };
  }

  async refresh(refreshTokenRecebido: string) {
    const tokenHash = createHash('sha256')
      .update(refreshTokenRecebido)
      .digest('hex');

    const tokenValido = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
    });

    if (!tokenValido) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const usuario = await this.prisma.user.findUnique({
      where: { id: tokenValido.userId },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    await this.prisma.refreshToken.delete({ where: { id: tokenValido.id } });

    const novoRefreshToken = randomBytes(40).toString('hex');
    const novoRefreshTokenHash = createHash('sha256')
      .update(novoRefreshToken)
      .digest('hex');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: novoRefreshTokenHash,
        userId: usuario.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const novoAccessToken = this.jwtService.sign({
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role,
    });

    return { access_token: novoAccessToken, refresh_token: novoRefreshToken };
  }

  async logout(refreshTokenRecebido: string) {
    const tokenHash = createHash('sha256')
      .update(refreshTokenRecebido)
      .digest('hex');

    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash },
    });

    return { message: 'Logout realizado com sucesso' };
  }
}
