#!/usr/bin/env bash
# Karidasu バックアップ（設計書 §12 / NFR 可用性）。
# PostgreSQL を pg_dump で、アップロード画像(app_media)を tar で取得する。
# cron 例（日次03:00）: 0 3 * * * /path/to/karidasu/scripts/backup.sh >> /var/log/karidasu-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "[backup] $STAMP 開始"

# DB ダンプ（カスタム形式 = 圧縮 + 並列リストア可）。
docker compose exec -T db pg_dump -U app -Fc karidasu > "$BACKUP_DIR/db-$STAMP.dump"
echo "[backup] DB: $BACKUP_DIR/db-$STAMP.dump"

# アップロード画像（named volume の中身を tar 化）。
docker compose run --rm --no-deps -T \
  -v "$(pwd)/$BACKUP_DIR:/backup" api \
  tar czf "/backup/media-$STAMP.tar.gz" -C /app/media . 2>/dev/null || \
  echo "[backup] media: スキップ（画像なし、または api 未起動）"

# 古い世代の削除（既定14日）。
RETENTION_DAYS="${RETENTION_DAYS:-14}"
find "$BACKUP_DIR" -name 'db-*.dump' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'media-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

echo "[backup] 完了"
