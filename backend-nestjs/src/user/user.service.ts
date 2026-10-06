import { OTP } from 'otplib';
import * as qrcode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { validateAndConsumeTotp } from '../common/totp.util';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private otp = new OTP();

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        twoFactorEnabled: true,
      },
    });
  }

  async setupTwoFactor(userId: string, userEmail: string) {
    const secret = this.otp.generateSecret();
    const otpauthUrl = this.otp.generateURI({
      issuer: 'AuthBenchmark',
      label: userEmail,
      secret,
    });
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorLastStep: null },
    });

    return {
      qrCodeDataUrl,
      manualEntryKey: secret,
    };
  }

  async enableTwoFactor(userId: string, code: string, nowSec?: number) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!usuario || !usuario.twoFactorSecret) {
      throw new BadRequestException(
        '2FA não foi configurado para este usuário.',
      );
    }

    const isValid = await validateAndConsumeTotp(
      this.prisma,
      userId,
      usuario.twoFactorSecret,
      code,
      nowSec,
    );

    if (!isValid) {
      throw new BadRequestException('Código de autenticação inválido.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA ativado com sucesso.' };
  }
}
