import jwt from 'jsonwebtoken';

/**
 * Signs the customer JWT.
 *
 * The application validates tokens; this function is what issues the customer
 * one (ADR-002). The claim contract is in RFC-003 and the application validates
 * it with the same secret, so changing a claim here breaks the other side.
 */
export interface IssuerConfig {
  secret: string;
  expiresIn: string;
}

export interface IssuedToken {
  token: string;
  /** Lifetime in seconds, so the client knows when to renew. */
  expiresIn: number;
}

export class JwtTokenIssuer {
  constructor(private readonly config: IssuerConfig) {}

  issue(customer: { id: string; name: string }, cpf: string): IssuedToken {
    const token = jwt.sign(
      {
        sub: customer.id,
        type: 'customer',
        // Digits only: the CPF arrives formatted or not, and the application
        // compares against the normalised value it stores.
        cpf: cpf.replace(/\D/g, ''),
        name: customer.name,
      },
      this.config.secret,
      {
        expiresIn: this.config.expiresIn as jwt.SignOptions['expiresIn'],
        issuer: 'car-repair-shop-auth-lambda',
      },
    );

    // The JWT payload is base64-encoded, not encrypted: anyone can read it, so
    // nothing beyond the contract goes into the claims.
    const { exp, iat } = jwt.decode(token) as { exp: number; iat: number };

    return { token, expiresIn: exp - iat };
  }
}
