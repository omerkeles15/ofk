from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, delete
from typing import Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import DeviceData
from app.schemas import DeviceDataPayload
from app.ws_manager import manager
from app.cache import cache_get, cache_set, cache_delete

router = APIRouter(prefix="/api", tags=["device-data"])


@router.post("/device-data")
async def receive_device_data(payload: DeviceDataPayload, db: AsyncSession = Depends(get_db)):
    """IoT cihazdan gelen veriyi PostgreSQL'e yazar ve WebSocket ile push yapar."""
    now = datetime.now()
    record = DeviceData(
        device_id=payload.deviceId,
        company_id=payload.companyId,
        location_id=payload.locationId,
        timestamp=payload.timestamp,
        type=payload.type,
        subtype=payload.subtype,
        data_json=json.dumps(payload.data, ensure_ascii=False) if payload.data else None,
        received_at=now,
    )
    db.add(record)
    await db.commit()

    # Cache invalidate
    await cache_delete(f"device:{payload.deviceId}:*")

    # WebSocket push — sadece bu cihazı izleyenlere
    ws_data = {
        "type": "new_data",
        "deviceId": payload.deviceId,
        "record": {
            "id": record.id,
            "deviceId": record.device_id,
            "timestamp": record.timestamp,
            "data": payload.data,
            "receivedAt": now.isoformat(),
        },
    }
    await manager.broadcast(payload.deviceId, ws_data)

    return {"ok": True, "receivedAt": now.isoformat()}


@router.get("/device-data/{device_id}")
async def get_device_data(
    device_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    """Sayfalı ve filtreli cihaz verisi döndürür."""
    # Cache key
    cache_key = f"device:{device_id}:L{limit}:O{offset}:F{from_ts}:T{to_ts}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    # Filtreli sorgu
    where = [DeviceData.device_id == device_id]
    if from_ts:
        where.append(DeviceData.timestamp >= from_ts)
    if to_ts:
        where.append(DeviceData.timestamp <= to_ts)

    # Filtreli toplam
    filtered_q = select(func.count()).select_from(DeviceData).where(*where)
    filtered_total = (await db.execute(filtered_q)).scalar()

    # Genel toplam (filtresiz)
    grand_q = select(func.count()).select_from(DeviceData).where(DeviceData.device_id == device_id)
    grand_total = (await db.execute(grand_q)).scalar()

    # Kayıtlar
    data_q = (
        select(DeviceData)
        .where(*where)
        .order_by(DeviceData.timestamp.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(data_q)).scalars().all()

    # En son kayıt (filtresiz)
    latest_q = (
        select(DeviceData)
        .where(DeviceData.device_id == device_id)
        .order_by(DeviceData.timestamp.desc())
        .limit(1)
    )
    latest_row = (await db.execute(latest_q)).scalar_one_or_none()

    def to_dict(r):
        return {
            "id": r.id,
            "deviceId": r.device_id,
            "companyId": r.company_id,
            "locationId": r.location_id,
            "timestamp": r.timestamp,
            "type": r.type,
            "subtype": r.subtype,
            "data": json.loads(r.data_json) if r.data_json else None,
            "receivedAt": r.received_at.isoformat() if r.received_at else None,
        }

    result = {
        "latest": to_dict(latest_row) if latest_row else None,
        "records": [to_dict(r) for r in rows],
        "total": grand_total,
        "filtered": filtered_total,
        "limit": limit,
        "offset": offset,
    }
    await cache_set(cache_key, result, ttl=3)
    return result


@router.delete("/device-data/{device_id}/history")
async def clear_device_history(
    device_id: str,
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    where = [DeviceData.device_id == device_id]
    if from_ts:
        where.append(DeviceData.timestamp >= from_ts)
    if to_ts:
        where.append(DeviceData.timestamp <= to_ts)

    result = await db.execute(delete(DeviceData).where(*where))
    await db.commit()
    await cache_delete(f"device:{device_id}:*")
    return {"ok": True, "deleted": result.rowcount}


@router.get("/device-data/{device_id}/stats")
async def get_device_stats(device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            func.count().label("total"),
            func.min(DeviceData.received_at).label("first_at"),
            func.max(DeviceData.received_at).label("last_at"),
        ).where(DeviceData.device_id == device_id)
    )
    row = result.one()
    return {
        "total": row.total,
        "firstAt": row.first_at.isoformat() if row.first_at else None,
        "lastAt": row.last_at.isoformat() if row.last_at else None,
    }


# ── WebSocket — Canlı Veri İzleme ────────────────────────────
@router.websocket("/ws/device/{device_id}")
async def ws_device_live(websocket: WebSocket, device_id: str):
    """
    Client bu endpoint'e bağlanır, device_id'ye subscribe olur.
    Yeni veri geldiğinde otomatik push alır.
    Polling'e gerek kalmaz.
    """
    await manager.subscribe(websocket, device_id)
    try:
        while True:
            # Client'tan gelen mesajları dinle (ping/pong veya unsubscribe)
            data = await websocket.receive_text()
            if data == "close":
                break
    except WebSocketDisconnect:
        pass
    finally:
        await manager.unsubscribe(websocket, device_id)
