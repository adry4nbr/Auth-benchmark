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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private otp = new OTP();

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

    if (!existingUser) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!existingUser.password) {
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

    const token = this.jwtService.sign({
      sub: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    });

    return { access_token: token };
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
}
