#!/usr/bin/env bash
#
# Copia a credencial local do Learner Lab para os secrets do GitHub Actions.
#
#   ./scripts/refresh-aws-secrets.sh            so este repositorio
#   ./scripts/refresh-aws-secrets.sh --todos    os quatro repositorios
#
# A credencial do Learner Lab expira em cerca de 4 horas, e o CI para de
# conseguir rodar o plan quando isso acontece. Este script existe para que
# renovar seja um comando, e nao tres edicoes manuais na interface do GitHub.
#
# Antes de rodar: Start Lab > AWS Details > AWS CLI > Show, e cole o bloco em
# ~/.aws/credentials.
set -uo pipefail

# Os quatro repositorios compartilham a mesma credencial do Learner Lab, e ela
# expira nos quatro ao mesmo tempo. Renovar so um deixa o restante falhando com
# ExpiredToken num passo que nao explica a causa.
TODOS_OS_REPOS=(
  fiap-tech-challenge
  fiap-tech-challenge-lambda
  fiap-tech-challenge-infra-k8s
  fiap-tech-challenge-infra-db
)

ALVO="atual"
[ "${1:-}" = "--todos" ] && ALVO="todos"

CRED_FILE="${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}"
PROFILE="${AWS_PROFILE:-default}"

fail() { echo "ERRO: $*" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || fail "gh CLI nao encontrado."
gh auth status >/dev/null 2>&1 || fail "gh nao autenticado. Rode: gh auth login"
[ -f "$CRED_FILE" ] || fail "Arquivo de credencial nao encontrado em $CRED_FILE"

# Le uma chave da secao do perfil, sem imprimir o valor.
read_key() {
  awk -v profile="[$PROFILE]" -v key="$1" '
    $0 == profile { inside = 1; next }
    /^\[/         { inside = 0 }
    inside && $0 ~ "^[ \t]*" key "[ \t]*=" {
      sub(/^[^=]*=[ \t]*/, ""); gsub(/[ \t\r]+$/, ""); print; exit
    }
  ' "$CRED_FILE"
}

KEY_ID=$(read_key aws_access_key_id)
SECRET=$(read_key aws_secret_access_key)
TOKEN=$(read_key aws_session_token)

[ -n "$KEY_ID" ] || fail "aws_access_key_id nao encontrado no perfil [$PROFILE]"
[ -n "$SECRET" ]  || fail "aws_secret_access_key nao encontrado no perfil [$PROFILE]"
[ -z "$TOKEN" ] && echo "Aviso: sem aws_session_token. Credencial do Learner Lab costuma ter um."

echo "Validando a credencial antes de publicar..."
# describe-vpcs, e nao sts get-caller-identity: o Learner Lab revoga a sessao
# mantendo o get-caller-identity respondendo. Publicar uma credencial revogada
# so adia a descoberta para dentro do CI, onde diagnosticar custa mais.
AWS_ACCESS_KEY_ID="$KEY_ID" AWS_SECRET_ACCESS_KEY="$SECRET" AWS_SESSION_TOKEN="$TOKEN" \
  aws ec2 describe-vpcs --max-items 1 >/dev/null 2>&1 \
  || fail "A credencial local nao alcanca a AWS. Renove no Learner Lab antes de publicar."
echo "  ok"

publicar_em() {
  local destino=$1 rotulo=$2
  echo "  $rotulo"
  printf '%s' "$KEY_ID" | gh secret set AWS_ACCESS_KEY_ID     $destino >/dev/null || return 1
  printf '%s' "$SECRET" | gh secret set AWS_SECRET_ACCESS_KEY $destino >/dev/null || return 1
  printf '%s' "$TOKEN"  | gh secret set AWS_SESSION_TOKEN     $destino >/dev/null || return 1
}

if [ "$ALVO" = "todos" ]; then
  echo "Publicando nos quatro repositorios..."
  falhas=0
  for repo in "${TODOS_OS_REPOS[@]}"; do
    publicar_em "--repo diandria/$repo" "$repo" || { echo "    FALHOU"; falhas=$((falhas+1)); }
  done
  [ "$falhas" -gt 0 ] && fail "$falhas repositorio(s) nao receberam a credencial."
else
  echo "Publicando nos secrets do repositorio atual..."
  publicar_em "" "$(basename "$PWD")" || fail "Falha ao publicar."
fi

echo
echo "Pronto. Os secrets valem enquanto a sessao do lab durar (cerca de 4h)."
