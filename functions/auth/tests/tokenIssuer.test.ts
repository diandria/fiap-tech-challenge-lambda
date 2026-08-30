import jwt from 'jsonwebtoken';
import { JwtTokenIssuer } from '../src/tokenIssuer';

const SECRET = 'segredo-de-teste';

type Claims = {
  sub: string;
  type: string;
  cpf: string;
  name: string;
  iss: string;
  exp: number;
  iat: number;
};

const claimsOf = (token: string, secret = SECRET) => jwt.verify(token, secret) as Claims;

describe('JwtTokenIssuer', () => {
  const issuer = () => new JwtTokenIssuer({ secret: SECRET, expiresIn: '1h' });

  it('should emit all contract claims GIVEN a customer WHEN issuing', () => {
    const { token } = issuer().issue({ id: 'c1', name: 'Ana' }, '123.456.789-09');

    const claims = claimsOf(token);

    expect(claims.sub).toBe('c1');
    expect(claims.type).toBe('customer');
    expect(claims.name).toBe('Ana');
    expect(claims.iss).toBe('car-repair-shop-auth-lambda');
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('should store only digits in the cpf claim GIVEN a formatted cpf WHEN issuing', () => {
    const { token } = issuer().issue({ id: 'c1', name: 'Ana' }, '123.456.789-09');

    expect(claimsOf(token).cpf).toBe('12345678909');
  });

  // Contrato com o middleware da aplicacao (M7.T2), que valida com o MESMO
  // segredo. Se este teste passar e a aplicacao recusar o token, a divergencia
  // esta no segredo configurado, nao no codigo.
  it('should produce a token the application can verify GIVEN the same secret', () => {
    const { token } = issuer().issue({ id: 'c1', name: 'Ana' }, '12345678909');

    expect(() => jwt.verify(token, SECRET)).not.toThrow();
    expect(() => jwt.verify(token, 'outro-segredo')).toThrow();
  });

  it('should report the lifetime in seconds GIVEN a one hour expiry WHEN issuing', () => {
    const { expiresIn } = issuer().issue({ id: 'c1', name: 'Ana' }, '12345678909');

    expect(expiresIn).toBe(3600);
  });

  // A senha do cliente nunca passa por aqui, mas o CPF sim. Um token que
  // carregasse dado alem do contrato vazaria pelo payload, que e apenas
  // codificado em base64 e legivel por qualquer um.
  it('should not carry claims beyond the contract GIVEN a customer WHEN issuing', () => {
    const { token } = issuer().issue({ id: 'c1', name: 'Ana' }, '12345678909');

    const claims = claimsOf(token) as unknown as Record<string, unknown>;
    expect(Object.keys(claims).sort()).toEqual(
      ['cpf', 'exp', 'iat', 'iss', 'name', 'sub', 'type'].sort(),
    );
  });

  it('should reject an expired token GIVEN a past expiry WHEN verifying', () => {
    const shortLived = new JwtTokenIssuer({ secret: SECRET, expiresIn: '-1s' });

    const { token } = shortLived.issue({ id: 'c1', name: 'Ana' }, '12345678909');

    expect(() => jwt.verify(token, SECRET)).toThrow(jwt.TokenExpiredError);
  });
});
