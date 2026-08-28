// src/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

jest.mock('bcrypt');

const mockOtpInstance = {
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
};

jest.mock('otplib', () => ({
  OTP: jest.fn().mockImplementation(() => mockOtpInstance),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  // Mock do PrismaService: só implementamos os métodos que o AuthService realmente usa
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    passwordReset: {
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  // Mock do JwtService
  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);

    // Limpa o histórico de chamadas dos mocks entre cada teste,
    // para um teste não "vazar" configuração para o próximo
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      name: 'Adryan Teste',
      email: 'teste@teste.com',
      password: '12345678',
      confirmPassword: '12345678',
    };

    it('deve lançar BadRequestException se as senhas não coincidirem', async () => {
      const dtoComSenhasDiferentes = {
        ...registerDto,
        confirmPassword: 'outrasenha',
      };

      await expect(service.register(dtoComSenhasDiferentes)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar ConflictException se o e-mail já estiver cadastrado', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: registerDto.email,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve criar o usuário com sucesso quando os dados são válidos', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-fake-gerado');
      mockPrismaService.user.create.mockResolvedValue({
        id: '1',
        name: registerDto.name,
        email: registerDto.email,
        role: 'USER',
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const resultado = await service.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ password: 'hash-fake-gerado' }),
        }),
      );
      expect(resultado).not.toHaveProperty('password');
      expect(resultado.email).toBe(registerDto.email);
    });
  });

  describe('login', () => {
    const loginDto = { email: 'teste@teste.com', password: '12345678' };

    it('deve lançar UnauthorizedException se o usuário não existir', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se o usuário não tiver senha cadastrada (conta Google)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: loginDto.email,
        password: null,
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se a senha estiver incorreta', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: loginDto.email,
        password: 'hash-salvo',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve retornar um access_token quando as credenciais estão corretas', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: loginDto.email,
        password: 'hash-salvo',
        role: 'USER',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('token-fake-assinado');

      const resultado = await service.login(loginDto);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: '1',
        email: loginDto.email,
        role: 'USER',
      });
      expect(resultado).toEqual({ access_token: 'token-fake-assinado' });
    });

    it('deve retornar tempToken quando o usuário tem 2FA ativo', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: loginDto.email,
        password: 'hash-salvo',
        role: 'USER',
        twoFactorEnabled: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('temp-token-fake');

      const resultado = await service.login(loginDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: '1', stage: '2fa-pending' },
        { expiresIn: '5m' },
      );
      expect(resultado).toEqual({
        requiresTwoFactor: true,
        tempToken: 'temp-token-fake',
      });
    });
  });

  describe('verifyTwoFactor', () => {
    const verifyDto = { tempToken: 'temp-token-fake', code: '123456' };

    it('deve lançar UnauthorizedException se o tempToken for inválido', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('token inválido');
      });

      await expect(service.verifyTwoFactor(verifyDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se o stage não for 2fa-pending', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1', stage: 'outro-stage' });

      await expect(service.verifyTwoFactor(verifyDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se o usuário não tiver 2FA configurado', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1', stage: '2fa-pending' });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        twoFactorSecret: null,
      });

      await expect(service.verifyTwoFactor(verifyDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se o código for inválido', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1', stage: '2fa-pending' });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        twoFactorSecret: 'SEGREDO_FAKE',
      });
      mockOtpInstance.verify.mockResolvedValue({ valid: false });

      await expect(service.verifyTwoFactor(verifyDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve retornar access_token quando o código for válido', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1', stage: '2fa-pending' });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'admin@teste.com',
        role: 'ADMIN',
        twoFactorSecret: 'SEGREDO_FAKE',
      });
      mockOtpInstance.verify.mockResolvedValue({ valid: true });
      mockJwtService.sign.mockReturnValue('token-final-fake');

      const resultado = await service.verifyTwoFactor(verifyDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: '1',
        email: 'admin@teste.com',
        role: 'ADMIN',
      });
      expect(resultado).toEqual({ access_token: 'token-final-fake' });
    });
  });

  describe('forgotPassword', () => {
    const dto = { email: 'teste@teste.com' };

    it('deve criar um passwordReset e logar o link quando o usuário existir', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.email,
      });
      (randomBytes as jest.Mock).mockReturnValue({
        toString: () => 'token-fake-hex',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-do-token-fake');
      mockPrismaService.passwordReset.create.mockResolvedValue({});
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const resultado = await service.forgotPassword(dto);

      expect(mockPrismaService.passwordReset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            email: dto.email,
            tokenHash: 'hash-do-token-fake',
          }),
        }),
      );
      expect(consoleSpy).toHaveBeenCalled();
      expect(resultado).toEqual({
        message: 'Se o e-mail existir, um link de recuperação foi enviado.',
      });

      consoleSpy.mockRestore();
    });

    it('deve retornar a mesma mensagem genérica quando o usuário não existir (proteção contra enumeração)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const resultado = await service.forgotPassword(dto);

      expect(mockPrismaService.passwordReset.create).not.toHaveBeenCalled();
      expect(resultado).toEqual({
        message: 'Se o e-mail existir, um link de recuperação foi enviado.',
      });
    });
  });

  describe('resetPassword', () => {
    const dto = { token: 'token-em-texto-puro', newPassword: 'novaSenha123' };

    it('deve lançar BadRequestException se nenhum token bater', async () => {
      mockPrismaService.passwordReset.findMany.mockResolvedValue([
        { id: '1', email: 'a@teste.com', tokenHash: 'hash-diferente' },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve atualizar a senha e apagar o registro quando o token bater', async () => {
      const resetEncontrado = {
        id: 'reset-1',
        email: 'user@teste.com',
        tokenHash: 'hash-correto',
      };
      mockPrismaService.passwordReset.findMany.mockResolvedValue([
        resetEncontrado,
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('nova-senha-hash');
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.passwordReset.delete.mockResolvedValue({});

      const resultado = await service.resetPassword(dto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { email: 'user@teste.com' },
        data: { password: 'nova-senha-hash' },
      });
      expect(mockPrismaService.passwordReset.delete).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
      });
      expect(resultado).toEqual({ message: 'Senha atualizada com sucesso.' });
    });
  });
});
