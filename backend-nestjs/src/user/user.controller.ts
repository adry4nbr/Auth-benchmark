import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { Enable2faDto } from './dto/enable-2fa.dto';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: Express.Request) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setupTwoFactor(@Request() req: { user: { userId: string; email: string } }) {
    return this.userService.setupTwoFactor(req.user.userId, req.user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enableTwoFactor(
    @Request() req: { user: { userId: string } },
    @Body() dto: Enable2faDto,
  ) {
    return this.userService.enableTwoFactor(req.user.userId, dto.code);
  }
}
