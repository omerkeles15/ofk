from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import DeviceData
from app.schemas import DeviceDataPayload
from app.ws_manager import manager
from app.cache import cache_get, cache_set, cache_delete, buffer_push

router = APIRouter(prefix="/api", tags=["device-data"])


@router.post("/device-data")
async def receive_device_data(payload: DeviceDataPayload):
    """
    IoT cihazdan gelen veri akışı:
    1. Redis buffer'a yaz (mikrosaniye)
    2. Redis Pub/Sub ile tüm worker'lara bildir
    3. WebSocket ile izleyen kullanıcılara anında push
    4. Arka planda batch worker buffer'ı PostgreSQL'e yazar
    """
    now = datetime.now().isoformat()

    record = {
        "device_id": payload.deviceId,
        "company_id": payload.companyId,
        "location_id": payload.locationId,
        "timestamp": payload.timestamp,
        "type": payload.type,
        "subtype": payload.subtype,
        "data_json": json.dumps(payload.data, ensure_ascii=False) if payload.data else None,
        "received_at": now,
    }

    # 1. Redis buffer'a ekle (batch insert için)
    buffered = await buffer_push(payload.deviceId, record)

    # Buffer çalışmazsa doğrudan DB'ye yaz (fallback)
    if not buffered:
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            db.add(DeviceData(**record))
            await db.commit()

    # 2. WebSocket push — anında tüm izleyicilere
    ws_data = {
        "type": "new_data",
        "record": {
            "deviceId": payload.deviceId,
            "companyId": payload.companyId,
            "locationId": payload.locationId,
            "timestamp": payload.timestamp,
            "type": payload.type,
            "subtype": payload.subtype,
            "data": payload.data,
            "receivedAt": now,
        },
    }
    await manager.publish_and_broadcast(payload.deviceId, ws_data)

    return {"ok": True, "receivedAt": now}


@router.get("/device-data/{device_id}")
async def get_device_data(
    device_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    # Cache
    cache_key = f"device:{device_id}:L{limit}:O{offset}:F{from_ts}:T{to_ts}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    where = [DeviceData.device_id == device_id]
    if from_ts:
        where.append(DeviceData.timestamp >= from_ts)
    if to_ts:
        where.append(DeviceData.timestamp <= to_ts)

    filtered_total = (await db.execute(
        select(func.count()).select_from(DeviceData).where(*where)
    )).scalar()

    grand_total = (await db.execute(
        select(func.count()).select_from(DeviceData).where(DeviceData.device_id == device_id)
    )).scalar()

    rows = (await db.execute(
        select(DeviceData).where(*where).order_by(DeviceData.timestamp.desc()).limit(limit).offset(offset)
    )).scalars().all()

    latest_row = (await db.execute(
        select(DeviceData).where(DeviceData.device_id == device_id).order_by(DeviceData.timestamp.desc()).limit(1)
    )).scalar_one_or_none()

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


# WebSocket endpoint kaldırıldı — app/main.py'de tanımlı
