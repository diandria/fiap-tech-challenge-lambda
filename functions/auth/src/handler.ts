import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

/**
 * Emite o JWT de cliente a partir do CPF.
 *
 * Contrato completo, implementado ate o final desta milestone:
 *
 *   200  { token, expiresIn, customer: { id, name } }
 *   400  corpo ausente, malformado, ou cpf ausente
 *   401  cliente nao encontrado
 *   403  cliente inativo
 *   503  falha ao consultar a aplicacao
 *
 * O 401 para cliente nao encontrado e deliberado. Devolver 404 transformaria
 * o endpoint num oraculo de enumeracao: daria para descobrir quem e cliente da
 * oficina testando CPFs. O 401 generico fecha essa porta.
 */
const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  let cpf: unknown;

  // JSON.parse desprotegido derruba a function, e o API Gateway devolve 502.
  // 502 nao diz ao cliente que o problema e o corpo que ele mandou.
  try {
    cpf = (JSON.parse(event.body ?? '{}') as { cpf?: unknown }).cpf;
  } catch {
    return json(400, { error: 'invalid request body' });
  }

  if (typeof cpf !== 'string' || cpf.trim() === '') {
    return json(400, { error: 'cpf is required' });
  }

  // Completado na tarefa da emissao do token.
  return json(501, { error: 'not implemented' });
}
