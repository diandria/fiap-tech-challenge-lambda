import jwt from 'jsonwebtoken';

/**
 * Assina o JWT de cliente.
 *
 * Esta e a unica responsabilidade do sistema que nao existe em nenhum outro
 * lugar (ADR-002): a aplicacao *valida* tokens, mas quem emite o de cliente e
 * esta function.
 *
 * O contrato das claims esta no RFC-003, e o middleware da aplicacao valida com
 * o mesmo segredo. Mudar qualquer claim aqui quebra o outro lado.
 */
export interface IssuerConfig {
  secret: string;
  expiresIn: string;
}

export interface IssuedToken {
  token: string;
  /** Vida util em segundos, para o cliente saber quando renovar. */
  expiresIn: number;
}

export class JwtTokenIssuer {
  constructor(private readonly config: IssuerConfig) {}

  issue(customer: { id: string; name: string }, cpf: string): IssuedToken {
    const token = jwt.sign(
      {
        sub: customer.id,
        type: 'customer',
        // Guarda so digitos: o CPF chega formatado ou nao, e a aplicacao
        // compara com o valor normalizado que tem no banco.
        cpf: cpf.replace(/\D/g, ''),
        name: customer.name,
      },
      this.config.secret,
      {
        expiresIn: this.config.expiresIn as jwt.SignOptions['expiresIn'],
        issuer: 'car-repair-shop-auth-lambda',
      },
    );

    // O payload do JWT e apenas codificado em base64, nao cifrado: qualquer um
    // le o conteudo. Por isso nada alem do contrato entra nas claims.
    const { exp, iat } = jwt.decode(token) as { exp: number; iat: number };

    return { token, expiresIn: exp - iat };
  }
}
