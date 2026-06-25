# bussikanri

**Karidasu** — 「QRをかざすだけ」の、社内備品・資産の貸出/返却・棚卸管理システム。

Excelや紙の貸出簿で管理しがちな社内のPC・周辺機器・工具・撮影機材などの「個体管理が必要な備品/資産」を、スマホでQR/バーコードをかざすだけで貸出・返却・棚卸まで完結させる、セルフホスト可能な軽量OSSです。

## 特徴

- **モバイル/QRファースト** — PWA・カメラスキャン・オフライン対応で、スキャン操作を主役に据える
- **導入が手軽** — `docker compose up` 一発、外部依存最小
- **貸出/返却 + 棚卸に特化** — ITSMやERPの巨大機能を持たず、備品の個体追跡に絞って軽量・高速
- **日本語ファースト** — UI/帳票/CSVを国内業務にフィット

## クイックスタート（セルフホスト）

```bash
git clone <this-repo> karidasu && cd karidasu
cp .env.example .env
# .env を編集（JWT_SECRET / ADMIN_EMAIL / ADMIN_PASSWORD などを設定）
docker compose up -d
```

起動後、ブラウザで `http://localhost`（または `SITE_ADDRESS` に設定したドメイン）にアクセス。
`.env` の `ADMIN_EMAIL` / `ADMIN_PASSWORD` で初回ログインできます。公開ドメインを設定すると Caddy が自動で TLS 証明書を取得します。

## 構成

| サービス | 役割 | 技術 |
|----------|------|------|
| `web` | PWA配信 + リバースプロキシ（自動TLS） | Caddy 2 + React/Vite ビルド成果物 |
| `api` | REST API（OpenAPI自動生成） | FastAPI + SQLAlchemy 2.0 |
| `worker` | 返却期限の監視・督促 | APScheduler |
| `db` | データストア | PostgreSQL 16 |

```
frontend/   React 18 + TS + Vite PWA（カメラスキャン・オフラインキュー）
backend/    FastAPI（認証 / 資産 / 貸出・返却 / 棚卸 / メンテ / レポート / 督促）
docs/       設計書
```

## 開発

**バックエンド**（既定は SQLite で起動。Postgres 不要でローカル開発・テスト可能）
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload      # http://localhost:8000 — OpenAPI: /docs
pytest                              # テスト
```

**フロントエンド**
```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173 （/api を :8000 へプロキシ）
npm run build
```

## 実装済み機能（v1.0 MVP）

- 認証・RBAC（admin / manager / member、JWT access+refresh、Argon2id）
- 資産マスタ（個体登録・自動採番・カテゴリ/保管場所の階層・状態遷移）
- スキャン特定（`GET /assets/lookup?tag=`）と貸出/返却（自己・代理、二重貸出の排他制御）
- 棚卸（連続スキャン・台帳自動照合 発見/欠品/想定外・締め確定）
- メンテナンス/修理履歴（受付でメンテ中→貸出不可、完了で利用可へ復帰）
- 返却期限の督促（前日/当日/超過、アプリ内通知。SMTPメールはフック用意）
- QRラベルPDF発行（市販ラベルシート面付け）・CSVエクスポート/インポート
- ダッシュボードKPI・監査ログ（追記専用）
- PWA：カメラスキャン（@zxing）・オフライン操作キュー・自動同期

## ドキュメント

- [設計書（要件定義〜詳細設計 / v1.0 MVP）](docs/design.md)

## ライセンス

AGPL-3.0 を推奨（設計書 §13）。
