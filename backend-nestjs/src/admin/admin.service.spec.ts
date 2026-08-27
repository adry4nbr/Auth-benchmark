import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminService', () => {
  let service: AdminService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  describe('listUsers', () => {
    it('deve calcular skip corretamente e retornar dados paginados', async () => {
      const usuariosFake = [
        { id: '1', name: 'User A', email: 'a@teste.com', role: 'USER' },
        { id: '2', name: 'User B', email: 'b@teste.com', role: 'USER' },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(usuariosFake);
      mockPrismaService.user.count.mockResolvedValue(2);

      const resultado = await service.listUsers({ page: 2, limit: 5 });

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
      expect(resultado).toEqual({
        data: usuariosFake,
        total: 2,
        page: 2,
        limit: 5,
      });
    });

    it('deve usar page=1 e limit=10 quando não informados', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.user.count.mockResolvedValue(0);

      await service.listUsers({});

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe('deleteUser', () => {
    const requesterId = 'admin-id-1';

    it('deve lançar NotFoundException se o usuário alvo não existir', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteUser('id-inexistente', requesterId),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se o admin tentar se autodeletar', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: requesterId,
        role: 'ADMIN',
      });

      await expect(
        service.deleteUser(requesterId, requesterId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException se o alvo for outro ADMIN', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'outro-admin-id',
        role: 'ADMIN',
      });

      await expect(
        service.deleteUser('outro-admin-id', requesterId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve deletar com sucesso um usuário comum', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-comum-id',
        role: 'USER',
      });
      mockPrismaService.user.delete.mockResolvedValue({
        id: 'user-comum-id',
      });

      const resultado = await service.deleteUser('user-comum-id', requesterId);

      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-comum-id' },
      });
      expect(resultado).toEqual({ message: 'Usuário deletado com sucesso' });
    });
  });
});
