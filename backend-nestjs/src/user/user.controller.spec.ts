import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

jest.mock('otplib', () => ({
  OTP: jest.fn().mockImplementation(() => ({
    generateSecret: jest.fn(),
    generateURI: jest.fn(),
    verify: jest.fn(),
  })),
}));

describe('UserController', () => {
  let controller: UserController;

  const mockUserService = {
    setupTwoFactor: jest.fn(),
    enableTwoFactor: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
