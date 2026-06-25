#!/usr/bin/env bash
# Karidasu リストア（設計書 §12）。backup.sh が作成した db ダンプから復元する。
# 使い方: scripts/restore.sh ./backups/db-YYYYmmdd-HHMMSS.dump [./backups/media-...tar.gz]
set -euo pipefail

cd "$(dirname "$0")/.."

DUMP="${1:-}"
MEDIA="${2:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "使い方: $0 <db-dump> [media-tar.gz]" >&2
  exit 1
fi

echo "[restore] $DUMP を復元します（既存データは置き換えられます）"
read -r -p "続行しますか? [y/N] " ans
[[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "中止しました"; exit 1; }

# 既存DBを drop して作り直し、ダンプを流し込む。
docker compose exec -T db psql -U app -d postgres -c "DROP DATABASE IF EXISTS karidasu;"
docker compose exec -T db psql -U app -d postgres -c "CREATE DATABASE karidasu OWNER app;"
docker compose exec -T db pg_restore -U app -d karidasu --no-owner < "$DUMP"
echo "[restore] DB 復元完了"

if [[ -n "$MEDIA" && -f "$MEDIA" ]]; then
  docker compose run --rm --no-deps -T \
    -v "$(pwd)/$(dirname "$MEDIA"):/backup" api \
    sh -c "rm -rf /app/media/* && tar xzf /backup/$(basename "$MEDIA") -C /app/media"
  echo "[restore] media 復元完了"
fi

echo "[restore] 完了。api/worker を再起動してください: docker compose restart api worker"
