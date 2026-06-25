#!/bin/sh
# api コンテナ起動時に DB マイグレーションを適用してから API を起動する。
set -e

# Postgres を使う場合のみマイグレーションを実行（SQLite はアプリ側で create_all）。
case "${DATABASE_URL:-}" in
  *sqlite*) echo "[entrypoint] SQLite を検出。マイグレーションをスキップします" ;;
  *) echo "[entrypoint] alembic upgrade head を実行します"; alembic upgrade head ;;
esac

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
