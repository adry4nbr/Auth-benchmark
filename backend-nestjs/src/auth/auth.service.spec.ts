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

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  // Mock do PrismaService: só implementamos os métodos que o AuthService realmente usa
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  // Mock do JwtService
  const mockJwtService = {
    sign: jest.fn(),
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
  });
});
