import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    listUsers: jest.fn(),
    deleteUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockAdminService }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getUsers deve delegar para adminService.listUsers com o DTO recebido', async () => {
    const dto = { page: 1, limit: 10 };
    mockAdminService.listUsers.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    await controller.getUsers(dto);

    expect(mockAdminService.listUsers).toHaveBeenCalledWith(dto);
  });

  it('deleteUser deve delegar para adminService.deleteUser com os ids corretos', async () => {
    mockAdminService.deleteUser.mockResolvedValue({
      message: 'Usuário deletado com sucesso',
    });
    const req = { user: { userId: 'admin-id-1' } };

    await controller.deleteUser('target-id', req);

    expect(mockAdminService.deleteUser).toHaveBeenCalledWith(
      'target-id',
      'admin-id-1',
    );
  });
});
