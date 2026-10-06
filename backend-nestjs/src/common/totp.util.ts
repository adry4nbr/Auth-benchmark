import { OTP } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';

const otp = new OTP();

export async function validateAndConsumeTotp(
  prisma: PrismaService,
  userId: string,
  secret: string,
  code: string,
  nowSec?: number,
): Promise<boolean> {
  if (!secret || !code) {
    return false;
  }
  const cleanCode = code.trim();
  const currentSec = nowSec ?? Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(currentSec / 30);
  const candidateSteps = [currentStep - 1, currentStep, currentStep + 1];

  let matchedStep: number | null = null;

  for (const step of candidateSteps) {
    try {
      const expectedCode = await otp.generate({ secret, epoch: step * 30 });
      if (expectedCode === cleanCode) {
        matchedStep = step;
        break;
      }
    } catch {
      // Continue checking candidate steps
    }
  }

  if (matchedStep === null) {
    return false;
  }

  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { twoFactorLastStep: null },
        { twoFactorLastStep: { lt: matchedStep } },
      ],
    },
    data: {
      twoFactorLastStep: matchedStep,
    },
  });

  return result.count === 1;
}
