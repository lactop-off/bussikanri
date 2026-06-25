"""レポート/CSVエクスポート・インポート。設計書 FR-8 / §9.2。"""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_manager
from ..models import Asset, Category, Location, Loan, User
from ..services import audit_log

router = APIRouter(tags=["reports"])

# Excel 互換のため UTF-8 BOM 付きで出力（FR-8.1）。
BOM = "﻿"


def _csv_response(filename: str, header: list[str], rows: list[list]) -> StreamingResponse:
    buf = io.StringIO()
    buf.write(BOM)
    writer = csv.writer(buf)
    writer.writerow(header)
    for r in rows:
        writer.writerow(r)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/{report_type}.csv")
def export_csv(report_type: str, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    if report_type == "assets":
        rows = []
        for a in db.scalars(select(Asset).order_by(Asset.asset_tag)).all():
            rows.append([
                a.asset_tag, a.name, a.category.name if a.category else "",
                a.home_location.name if a.home_location else "", a.manufacturer or "",
                a.model or "", a.serial_no or "", a.status.value,
                a.purchase_date or "", a.purchase_price or "", a.warranty_until or "", a.notes or "",
            ])
        return _csv_response(
            "assets.csv",
            ["asset_tag", "name", "category", "home_location", "manufacturer", "model",
             "serial_no", "status", "purchase_date", "purchase_price", "warranty_until", "notes"],
            rows,
        )
    if report_type == "loans":
        rows = []
        for ln in db.scalars(select(Loan).order_by(Loan.checkout_at.desc())).all():
            rows.append([
                ln.asset.asset_tag, ln.asset.name, ln.borrower.name,
                ln.checkout_at.isoformat(), ln.due_at.isoformat(),
                ln.checkin_at.isoformat() if ln.checkin_at else "", ln.status.value,
            ])
        return _csv_response(
            "loans.csv",
            ["asset_tag", "asset_name", "borrower", "checkout_at", "due_at", "checkin_at", "status"],
            rows,
        )
    raise HTTPException(status_code=404, detail={"code": "UNKNOWN_REPORT", "message": "未知のレポート種別です"})


@router.post("/imports/assets")
def import_assets(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
):
    """CSV から資産マスタを一括登録（FR-8.2 / 付録A テンプレート）。"""
    raw = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    created, skipped, errors = 0, 0, []

    # カテゴリ/保管場所は名前で参照、なければ自動作成。
    cat_cache = {c.name: c for c in db.scalars(select(Category)).all()}
    loc_cache = {loc.name: loc for loc in db.scalars(select(Location)).all()}

    def resolve(cache, model, name):
        name = (name or "").strip()
        if not name:
            return None
        obj = cache.get(name)
        if not obj:
            obj = model(name=name)
            db.add(obj)
            db.flush()
            cache[name] = obj
        return obj

    for i, row in enumerate(reader, start=2):
        tag = (row.get("asset_tag") or "").strip()
        name = (row.get("name") or "").strip()
        if not tag or not name:
            errors.append(f"{i}行目: asset_tag と name は必須です")
            continue
        if db.scalar(select(Asset).where(Asset.asset_tag == tag)):
            skipped += 1
            continue
        cat = resolve(cat_cache, Category, row.get("category"))
        loc = resolve(loc_cache, Location, row.get("home_location"))
        asset = Asset(
            asset_tag=tag, name=name,
            category_id=cat.id if cat else None,
            home_location_id=loc.id if loc else None,
            manufacturer=(row.get("manufacturer") or None),
            model=(row.get("model") or None),
            serial_no=(row.get("serial_no") or None),
            purchase_date=_parse_date(row.get("purchase_date")),
            purchase_price=_parse_int(row.get("purchase_price")),
            warranty_until=_parse_date(row.get("warranty_until")),
            notes=(row.get("notes") or None),
        )
        db.add(asset)
        created += 1

    audit_log.record(db, actor_id=actor.id, entity_type="asset", entity_id=None,
                     action="import", after={"created": created, "skipped": skipped})
    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}


def _parse_date(v):
    from datetime import date
    v = (v or "").strip()
    if not v:
        return None
    try:
        return date.fromisoformat(v)
    except ValueError:
        return None


def _parse_int(v):
    v = (v or "").strip()
    try:
        return int(v) if v else None
    except ValueError:
        return None
