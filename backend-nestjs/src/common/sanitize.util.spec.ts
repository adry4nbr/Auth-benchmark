import { sanitizeText } from './sanitize.util';

describe('SanitizeUtil (Anti-XSS)', () => {
  it('deve remover a tag script e seu conteúdo mantendo o texto restante: <script>alert(1)</script>Ana -> Ana', () => {
    const input = '<script>alert(1)</script>Ana';
    expect(sanitizeText(input)).toBe('Ana');
  });

  it('deve remover tags HTML simples mantendo o texto: <b>Ana</b> -> Ana', () => {
    const input = '<b>Ana</b>';
    expect(sanitizeText(input)).toBe('Ana');
  });

  it('deve manter texto sem tags sem alteração: Ana Souza -> Ana Souza', () => {
    const input = 'Ana Souza';
    expect(sanitizeText(input)).toBe('Ana Souza');
  });

  it('deve demonstrar o comportamento com Tom & Jerry (escapa & para &amp;)', () => {
    const input = 'Tom & Jerry';
    const result = sanitizeText(input);
    expect(result).toBe('Tom &amp; Jerry');
  });

  it('deve retornar string vazia para entrada contendo apenas tags', () => {
    const input = '<script>alert(1)</script>';
    expect(sanitizeText(input)).toBe('');
  });
});
