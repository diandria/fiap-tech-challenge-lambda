#!/usr/bin/env bash
#
# Copies the local Learner Lab credential into the GitHub Actions secrets.
#
#   ./scripts/refresh-aws-secrets.sh          this repository only
#   ./scripts/refresh-aws-secrets.sh --all    all four repositories
#
# The Learner Lab credential expires in about 4 hours, and the CI stops being
# able to run the plan when it does. This makes renewal one command instead of
# manual edits in the GitHub interface.
#
# Before running: Start Lab > AWS Details > AWS CLI > Show, then paste the
# block into ~/.aws/credentials.
set -uo pipefail

# The four repositories share the same Learner Lab credential and it expires in
# all of them at once. Renewing only one leaves the rest failing with
# ExpiredToken at a step that does not explain the cause.
ALL_REPOS=(
  fiap-tech-challenge
  fiap-tech-challenge-lambda
  fiap-tech-challenge-infra-k8s
  fiap-tech-challenge-infra-db
)

# An unknown flag must not fall through to the single-repository mode: the
# runbook once used --todos, and the silent fallback published to one repo
# while the other three kept an expired credential.
TARGET="current"
case "${1:-}" in
  "")      ;;
  --all)   TARGET="all" ;;
  -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
  *)       echo "Unknown option: $1 (use --all to publish to the four repositories)" >&2; exit 1 ;;
esac

CRED_FILE="${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}"
PROFILE="${AWS_PROFILE:-default}"

fail() { echo "ERROR: $*" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || fail "gh CLI not found."
gh auth status >/dev/null 2>&1 || fail "gh is not authenticated. Run: gh auth login"
[ -f "$CRED_FILE" ] || fail "Credential file not found at $CRED_FILE"

# Reads a key from the profile section without printing the value.
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

[ -n "$KEY_ID" ] || fail "aws_access_key_id not found in profile [$PROFILE]"
[ -n "$SECRET" ]  || fail "aws_secret_access_key not found in profile [$PROFILE]"
[ -z "$TOKEN" ] && echo "Warning: no aws_session_token. Learner Lab credentials usually have one."

echo "Validating the credential before publishing..."
# describe-vpcs, not sts get-caller-identity: the Learner Lab revokes the
# session while get-caller-identity keeps answering. Publishing a revoked
# credential only defers the discovery into the CI.
AWS_ACCESS_KEY_ID="$KEY_ID" AWS_SECRET_ACCESS_KEY="$SECRET" AWS_SESSION_TOKEN="$TOKEN" \
  aws ec2 describe-vpcs --max-items 1 >/dev/null 2>&1 \
  || fail "The local credential cannot reach AWS. Renew it in the Learner Lab first."
echo "  ok"

publish_to() {
  local target=$1 label=$2
  echo "  $label"
  printf '%s' "$KEY_ID" | gh secret set AWS_ACCESS_KEY_ID     $target >/dev/null || return 1
  printf '%s' "$SECRET" | gh secret set AWS_SECRET_ACCESS_KEY $target >/dev/null || return 1
  printf '%s' "$TOKEN"  | gh secret set AWS_SESSION_TOKEN     $target >/dev/null || return 1
}

if [ "$TARGET" = "all" ]; then
  echo "Publishing to all four repositories..."
  failures=0
  for repo in "${ALL_REPOS[@]}"; do
    publish_to "--repo diandria/$repo" "$repo" || { echo "    FAILED"; failures=$((failures+1)); }
  done
  [ "$failures" -gt 0 ] && fail "$failures repository(ies) did not receive the credential."
else
  echo "Publishing to the current repository's secrets..."
  publish_to "" "$(basename "$PWD")" || fail "Failed to publish."
fi

echo
echo "Done. The secrets last as long as the lab session (about 4h)."
