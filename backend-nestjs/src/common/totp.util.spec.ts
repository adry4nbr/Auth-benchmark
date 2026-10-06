import { OTP } from 'otplib';
import { validateAndConsumeTotp } from './totp.util';
import { PrismaService } from '../prisma/prisma.service';

describe('TotpUtil (Anti-Replay 2FA)', () => {
  const otp = new OTP();
  const secret = otp.generateSecret();
  const userId = 'user-test-uuid';

  const fixedNowSec = 1700000000;
  const currentStep = Math.floor(fixedNowSec / 30);
  const nextStep = currentStep + 1;

  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService;
  });

  it('(1) primeiro uso de um código válido é aceito e grava o passo', async () => {
    const validCode = await otp.generate({ secret, epoch: fixedNowSec });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await validateAndConsumeTotp(
      mockPrisma,
      userId,
      secret,
      validCode,
      fixedNowSec,
    );

    expect(result).toBe(true);
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: userId,
        OR: [
          { twoFactorLastStep: null },
          { twoFactorLastStep: { lt: currentStep } },
        ],
      },
      data: {
        twoFactorLastStep: currentStep,
      },
    });
  });

  it('(2) segundo uso do MESMO código é rejeitado (simulado por 0 linhas afetadas no banco)', async () => {
    const validCode = await otp.generate({ secret, epoch: fixedNowSec });
    // Quando o passo já foi gravado, a cláusula conditional lt: currentStep afeta 0 linhas
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

    const result = await validateAndConsumeTotp(
      mockPrisma,
      userId,
      secret,
      validCode,
      fixedNowSec,
    );

    expect(result).toBe(false);
  });

  it('(3) um código do passo seguinte é aceito', async () => {
    const nextStepSec = fixedNowSec + 30;
    const nextStepCode = await otp.generate({ secret, epoch: nextStepSec });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await validateAndConsumeTotp(
      mockPrisma,
      userId,
      secret,
      nextStepCode,
      nextStepSec,
    );

    expect(result).toBe(true);
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: userId,
        OR: [
          { twoFactorLastStep: null },
          { twoFactorLastStep: { lt: nextStep } },
        ],
      },
      data: {
        twoFactorLastStep: nextStep,
      },
    });
  });

  it('(4) código inválido é rejeitado sem gravar nada no banco', async () => {
    const invalidCode = '000000';

    const result = await validateAndConsumeTotp(
      mockPrisma,
      userId,
      secret,
      invalidCode,
      fixedNowSec,
    );

    expect(result).toBe(false);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });
});
