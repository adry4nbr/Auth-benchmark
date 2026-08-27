import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

const mockOtpInstance = {
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
};

jest.mock('otplib', () => ({
  OTP: jest.fn().mockImplementation(() => mockOtpInstance),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));

import * as qrcode from 'qrcode';

describe('UserService', () => {
  let service: UserService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });

  describe('setupTwoFactor', () => {
    it('deve gerar segredo, QR code, e salvar o segredo no usuário', async () => {
      mockOtpInstance.generateSecret.mockReturnValue('SEGREDO_FAKE');
      mockOtpInstance.generateURI.mockReturnValue('otpauth://totp/fake');
      (qrcode.toDataURL as jest.Mock).mockResolvedValue(
        'data:image/png;base64,fake',
      );
      mockPrismaService.user.update.mockResolvedValue({});

      const resultado = await service.setupTwoFactor(
        'user-1',
        'user@teste.com',
      );

      expect(mockOtpInstance.generateURI).toHaveBeenCalledWith({
        issuer: 'AuthBenchmark',
        label: 'user@teste.com',
        secret: 'SEGREDO_FAKE',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorSecret: 'SEGREDO_FAKE' },
      });
      expect(resultado).toEqual({
        qrCodeDataUrl: 'data:image/png;base64,fake',
        manualEntryKey: 'SEGREDO_FAKE',
      });
    });
  });

  describe('enableTwoFactor', () => {
    it('deve lançar BadRequestException se o usuário não tiver segredo configurado', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFactorSecret: null,
      });

      await expect(service.enableTwoFactor('user-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar BadRequestException se o código for inválido', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFactorSecret: 'SEGREDO_FAKE',
      });
      mockOtpInstance.verify.mockResolvedValue({ valid: false });

      await expect(service.enableTwoFactor('user-1', '000000')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve ativar o 2FA quando o código for válido', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFactorSecret: 'SEGREDO_FAKE',
      });
      mockOtpInstance.verify.mockResolvedValue({ valid: true });
      mockPrismaService.user.update.mockResolvedValue({});

      const resultado = await service.enableTwoFactor('user-1', '123456');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: true },
      });
      expect(resultado).toEqual({ message: '2FA ativado com sucesso.' });
    });
  });
});
