import { OTP } from 'otplib';
import * as qrcode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private otp = new OTP();

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
      data: { twoFactorSecret: secret },
    });

    return {
      qrCodeDataUrl,
      manualEntryKey: secret,
    };
  }

  async enableTwoFactor(userId: string, code: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!usuario || !usuario.twoFactorSecret) {
      throw new BadRequestException(
        '2FA não foi configurado para este usuário.',
      );
    }

    const result = await this.otp.verify({
      secret: usuario.twoFactorSecret,
      token: code,
    });

    if (!result.valid) {
      throw new BadRequestException('Código de autenticação inválido.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA ativado com sucesso.' };
  }
}
