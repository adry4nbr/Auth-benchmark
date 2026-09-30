import request from 'supertest';

const BASE_URL = 'http://localhost:3000/api/v1';

describe('Auth (e2e)', () => {
  const testEmail = `e2e-${Date.now()}@teste.com`;
  const testPassword = 'senha12345';

  afterAll(async () => {
    // limpeza feita via requisição HTTP, não via Prisma direto (evita reativar o problema do WASM no Jest)
  });

  describe('Fluxo básico', () => {
    it('deve cadastrar um novo usuário', async () => {
      const response = await request(BASE_URL)
        .post('/auth/register')
        .send({
          name: 'Usuário E2E',
          email: testEmail,
          password: testPassword,
          confirmPassword: testPassword,
        })
        .expect(201);

      const body = response.body as { email: string; role: string };
      expect(body.email).toBe(testEmail);
      expect(body.role).toBe('USER');
    });

    it('deve fazer login com credenciais corretas', async () => {
      const response = await request(BASE_URL)
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
    });

    it('deve rejeitar login com senha errada', async () => {
      await request(BASE_URL)
        .post('/auth/login')
        .send({ email: testEmail, password: 'senhaErrada' })
        .expect(401);
    });
  });

  describe('Rotas protegidas', () => {
    let userToken: string;
    let adminToken: string;

    beforeAll(async () => {
      const userLogin = await request(BASE_URL)
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      userToken = (userLogin.body as { access_token: string }).access_token;

      const adminLogin = await request(BASE_URL).post('/auth/login').send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      });
      adminToken = (adminLogin.body as { access_token: string }).access_token;
    });

    it('deve rejeitar acesso ao perfil sem token', async () => {
      await request(BASE_URL).get('/user/profile').expect(401);
    });

    it('deve retornar o perfil com token válido', async () => {
      const response = await request(BASE_URL)
        .get('/user/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const body = response.body as { email: string };
      expect(body.email).toBe(testEmail);
    });

    it('deve rejeitar usuário comum na rota de admin', async () => {
      await request(BASE_URL)
        .get('/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('deve permitir admin acessar a listagem de usuários', async () => {
      await request(BASE_URL)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Rate limiting', () => {
    it('deve bloquear após exceder o limite de tentativas de login', async () => {
      const attempts = Array.from({ length: 6 }, () =>
        request(BASE_URL)
          .post('/auth/login')
          .send({ email: testEmail, password: 'senhaErrada' }),
      );

      const responses = await Promise.all(attempts);
      const blocked = responses.some((res) => res.status === 429);

      expect(blocked).toBe(true);
    });
  });
});
