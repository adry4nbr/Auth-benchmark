import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  sub: string;
  stage?: string;
  email?: string;
  role?: string;
}

interface ValidatedUser {
  userId: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtPayload): ValidatedUser {
    if (payload.stage === '2fa-pending') {
      throw new UnauthorizedException('Token incompleto: 2FA pendente');
    }

    const email = payload.email;
    const role = payload.role;

    return {
      userId: payload.sub,
      email: email!,
      role: role!,
    };
  }
}
