import { decodePayload, isExpired } from './jwt.util';

function createFakeToken(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payloadB64}.fake-sig`;
}

describe('jwt.util', () => {
  it('deve decodificar payload de token JWT válido', () => {
    const payload = { sub: '123', email: 'teste@exemplo.com', role: 'ADMIN', exp: 1999999999 };
    const token = createFakeToken(payload);

    const decoded = decodePayload(token);
    expect(decoded).toBeTruthy();
    expect(decoded?.sub).toBe('123');
    expect(decoded?.email).toBe('teste@exemplo.com');
    expect(decoded?.role).toBe('ADMIN');
  });

  it('deve retornar null para tokens inválidos ou malformados', () => {
    expect(decodePayload(null)).toBeNull();
    expect(decodePayload('')).toBeNull();
    expect(decodePayload('invalido')).toBeNull();
    expect(decodePayload('parte1.parte2')).toBeNull();
    expect(decodePayload('parte1.invalido_base64!@#.parte3')).toBeNull();
  });

  it('deve identificar se o token está expirado', () => {
    const passado = Math.floor(Date.now() / 1000) - 300;
    const futuro = Math.floor(Date.now() / 1000) + 3600;

    const tokenExpirado = createFakeToken({ exp: passado });
    const tokenValido = createFakeToken({ exp: futuro });
    const tokenSemExp = createFakeToken({ sub: '123' });

    expect(isExpired(tokenExpirado)).toBe(true);
    expect(isExpired(tokenValido)).toBe(false);
    expect(isExpired(tokenSemExp)).toBe(true);
    expect(isExpired(null)).toBe(true);
    expect(isExpired('token-invalido')).toBe(true);
  });
});
