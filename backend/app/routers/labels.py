"""QR/バーコードラベルPDF発行。設計書 FR-4 / §9.2 /labels。"""

from __future__ import annotations

import io

import segno
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_manager
from ..models import Asset, User
from ..schemas import LabelRequest

router = APIRouter(tags=["labels"])

# ラベルシートレイアウト（面付け）。A-one 65面相当 = 5列×13行 / 38.1×21.2mm。
LAYOUTS = {
    "a-one-65": {"cols": 5, "rows": 13, "w": 38.1, "h": 21.2, "mx": 5.0, "my": 10.7, "gx": 2.5, "gy": 0.0},
    "a-one-44": {"cols": 4, "rows": 11, "w": 48.3, "h": 25.4, "mx": 8.4, "my": 13.0, "gx": 0.0, "gy": 0.0},
}


def _qr_png(data: str, scale: int = 4) -> io.BytesIO:
    buf = io.BytesIO()
    segno.make(data, error="m").save(buf, kind="png", scale=scale, border=1)
    buf.seek(0)
    return buf


@router.post("/labels")
def generate_labels(body: LabelRequest, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    layout = LAYOUTS.get(body.layout)
    if not layout:
        raise HTTPException(status_code=400, detail={"code": "UNKNOWN_LAYOUT", "message": "未知のラベルレイアウトです"})

    assets = list(db.scalars(select(Asset).where(Asset.id.in_(body.asset_ids))).all())
    if not assets:
        raise HTTPException(status_code=404, detail={"code": "NO_ASSETS", "message": "対象資産が見つかりません"})
    # asset_ids の順序を維持。
    order = {aid: i for i, aid in enumerate(body.asset_ids)}
    assets.sort(key=lambda a: order.get(a.id, 0))

    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4
    cols, rows = layout["cols"], layout["rows"]
    lw, lh = layout["w"] * mm, layout["h"] * mm
    mx, my = layout["mx"] * mm, layout["my"] * mm
    gx, gy = layout["gx"] * mm, layout["gy"] * mm
    per_page = cols * rows

    from reportlab.lib.utils import ImageReader

    for idx, asset in enumerate(assets):
        slot = idx % per_page
        if idx > 0 and slot == 0:
            pdf.showPage()
        col = slot % cols
        row = slot // cols
        x = mx + col * (lw + gx)
        y = page_h - my - (row + 1) * lh - row * gy  # 上端から下方向に配置

        qr = ImageReader(_qr_png(asset.asset_tag))
        qr_size = lh - 6 * mm
        pdf.drawImage(qr, x + 2 * mm, y + 3 * mm, qr_size, qr_size, preserveAspectRatio=True, mask="auto")

        text_x = x + qr_size + 4 * mm
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(text_x, y + lh - 7 * mm, asset.asset_tag)
        if body.show_name:
            pdf.setFont("Helvetica", 6)
            name = asset.name[:18]
            pdf.drawString(text_x, y + lh - 11 * mm, name)

    pdf.showPage()
    pdf.save()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="labels.pdf"'},
    )
