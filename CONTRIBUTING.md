# コントリビューションガイド / Contributing

Karidasu へのコントリビューションを歓迎します。

## 開発の始め方

[README](README.md) の「開発」セクションを参照してください（バックエンド: FastAPI / フロントエンド: Vite）。

## プルリクエストの流れ

1. Issue を立てて変更内容を共有してください（小さな修正は不要です）。
2. フィーチャーブランチを作成して変更します。
3. テスト・型チェック・ビルドが通ることを確認します。
   - backend: `pytest` と `alembic check`（モデル変更時はマイグレーションを追加）
   - frontend: `npm run typecheck` と `npm run build`
4. プルリクエストを作成します。CI（GitHub Actions）が自動で上記を検証します。

## コーディング規約

- バックエンド: PEP 8 準拠、型ヒントを付与。ルータ/サービス/モデルの分離を維持。
- フロントエンド: TypeScript strict。表示文字列は i18n キー方式（`src/i18n.tsx`）を使用し、
  日本語・英語の両辞書を更新してください。
- DB スキーマ変更時は必ず Alembic マイグレーションを同梱してください。

## ライセンスとDCO

本プロジェクトは **AGPL-3.0** で配布されます。コントリビューションは同ライセンスの下で
提供されたものとみなされます。コミットには `Signed-off-by`（DCO）を付与してください。

## 行動規範

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) に従ってください。
