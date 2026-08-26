import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationDto } from './dto/pagination.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}
  async listUsers(dto: PaginationDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;

    const usuarios = await this.prisma.user.findMany({
      skip: skip,
      take: limit,
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

    const total = await this.prisma.user.count();

    return {
      data: usuarios,
      total: total,
      page: page,
      limit: limit,
    };
  }

  async deleteUser(targetId: string, requesterId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetId },
    });

    if (!targetUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (targetId === requesterId) {
      throw new ForbiddenException('Você não pode deletar sua própria conta');
    }

    if (targetUser.role === 'ADMIN') {
      throw new ForbiddenException(
        'Não é possível deletar outro administrador',
      );
    }

    await this.prisma.user.delete({ where: { id: targetId } });
    return { message: 'Usuário deletado com sucesso' };
  }
}
