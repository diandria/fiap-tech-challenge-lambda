import jwt from 'jsonwebtoken';
import { JwtTokenIssuer } from '../src/tokenIssuer';

const SECRET = 'test-secret';

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

  // Contract with the application middleware, which validates with the same
  // secret. If this passes and the application still rejects the token, the
  // divergence is in the configured secret, not in the code.
  it('should produce a token the application can verify GIVEN the same secret', () => {
    const { token } = issuer().issue({ id: 'c1', name: 'Ana' }, '12345678909');

    expect(() => jwt.verify(token, SECRET)).not.toThrow();
    expect(() => jwt.verify(token, 'another-secret')).toThrow();
  });

  it('should report the lifetime in seconds GIVEN a one hour expiry WHEN issuing', () => {
    const { expiresIn } = issuer().issue({ id: 'c1', name: 'Ana' }, '12345678909');

    expect(expiresIn).toBe(3600);
  });

  // The CPF passes through here. A token carrying anything beyond the contract
  // would leak it through the payload, which is base64-encoded and readable.
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
