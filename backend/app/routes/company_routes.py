from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import json
from app.database import get_db
from app.models import Company, Location, Device
from app.schemas import CompanyCreate, CompanyUpdate, LocationCreate, LocationUpdate
from app.schemas import DeviceCreateSchema, DeviceUpdateSchema
from app.cache import cache_get, cache_set, cache_delete
from datetime import datetime

router = APIRouter(prefix="/api", tags=["companies"])


def _company_to_dict(c):
    return {
        "id": c.id,
        "displayName": c.display_name,
        "fullName": c.full_name,
        "managers": c.managers or [],
        "locations": [_location_to_dict(l) for l in (c.locations or [])],
    }


def _location_to_dict(l):
    return {
        "id": l.id,
        "name": l.name,
        "managers": l.managers or [],
        "users": l.users or [],
        "devices": [_device_to_dict(d) for d in (l.devices or [])],
    }


def _device_to_dict(d):
    return {
        "id": d.id,
        "tagName": d.tag_name,
        "deviceType": d.device_type,
        "subtype": d.subtype,
        "unit": d.unit or "",
        "value": d.value or 0,
        "status": d.status or "offline",
        "modbusConfig": d.modbus_config,
        "plcIoConfig": d.plc_io_config,
        "ioTags": d.io_tags,
        "timestamp": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.get("/companies")
async def get_companies(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("companies:all")
    if cached:
        return cached

    from app.models import DeviceData

    result = await db.execute(
        select(Company)
        .options(selectinload(Company.locations).selectinload(Location.devices))
        .order_by(Company.id)
    )
    companies = result.scalars().all()

    # Tüm cihaz ID'lerini topla
    all_device_ids = []
    for c in companies:
        for l in (c.locations or []):
            for d in (l.devices or []):
                all_device_ids.append(d.id)

    # Her cihazın son verisini çek
    latest_map = {}
    for did in all_device_ids:
        latest_q = await db.execute(
            select(DeviceData)
            .where(DeviceData.device_id == did)
            .order_by(DeviceData.timestamp.desc())
            .limit(1)
        )
        row = latest_q.scalar_one_or_none()
        if row and row.data_json:
            latest_map[did] = json.loads(row.data_json)

    def _dev_dict_with_latest(d):
        dd = _device_to_dict(d)
        latest = latest_map.get(d.id)
        if latest:
            dd["value"] = float(latest.get("value", 0)) if latest.get("value") else dd.get("value", 0)
            dd["lastValue"] = latest.get("value")
            dd["lastUnit"] = latest.get("unit")
        return dd

    def _loc_dict_with_latest(l):
        return {
            "id": l.id,
            "name": l.name,
            "managers": l.managers or [],
            "users": l.users or [],
            "devices": [_dev_dict_with_latest(d) for d in (l.devices or [])],
        }

    data = []
    for c in companies:
        data.append({
            "id": c.id,
            "displayName": c.display_name,
            "fullName": c.full_name,
            "managers": c.managers or [],
            "locations": [_loc_dict_with_latest(l) for l in (c.locations or [])],
        })

    await cache_set("companies:all", data, ttl=10)
    return data


@router.post("/companies")
async def add_company(body: CompanyCreate, db: AsyncSession = Depends(get_db)):
    comp = Company(display_name=body.displayName, full_name=body.fullName, managers=body.managers)
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    await cache_delete("companies:*")
    return {"id": comp.id, "displayName": comp.display_name, "fullName": comp.full_name, "managers": comp.managers, "locations": []}


@router.put("/companies/{company_id}")
async def update_company(company_id: int, body: CompanyUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    if body.displayName is not None:
        comp.display_name = body.displayName
    if body.fullName is not None:
        comp.full_name = body.fullName
    if body.managers is not None:
        comp.managers = body.managers
    await db.commit()
    await cache_delete("companies:*")
    return {"id": comp.id, "displayName": comp.display_name, "fullName": comp.full_name, "managers": comp.managers}


@router.delete("/companies/{company_id}")
async def delete_company(company_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    await db.delete(comp)
    await db.commit()
    await cache_delete("companies:*")
    return {"ok": True}


# ── LOCATIONS ─────────────────────────────────────────────────
@router.post("/companies/{company_id}/locations")
async def add_location(company_id: int, body: LocationCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Firma bulunamadı")
    loc = Location(company_id=company_id, name=body.name, managers=body.managers, users=body.users)
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    await cache_delete("companies:*")
    return {"id": loc.id, "name": loc.name, "managers": loc.managers or [], "users": loc.users or [], "devices": []}


@router.put("/companies/{company_id}/locations/{location_id}")
async def update_location(company_id: int, location_id: int, body: LocationUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Location).where(Location.id == location_id, Location.company_id == company_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(404, "Lokasyon bulunamadı")
    if body.name is not None:
        loc.name = body.name
    if body.managers is not None:
        loc.managers = body.managers
    if body.users is not None:
        loc.users = body.users
    await db.commit()
    await cache_delete("companies:*")
    return {"ok": True}


@router.delete("/companies/{company_id}/locations/{location_id}")
async def delete_location(company_id: int, location_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Location).where(Location.id == location_id, Location.company_id == company_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(404, "Lokasyon bulunamadı")
    await db.delete(loc)
    await db.commit()
    await cache_delete("companies:*")
    return {"ok": True}


# ── DEVICES ───────────────────────────────────────────────────
@router.get("/devices")
async def get_all_devices(db: AsyncSession = Depends(get_db)):
    from app.models import DeviceData
    result = await db.execute(
        select(Device, Location, Company)
        .join(Location, Device.location_id == Location.id)
        .join(Company, Location.company_id == Company.id)
    )
    rows = result.all()

    # Her cihazın son verisini çek
    device_ids = [d.id for d, l, c in rows]
    latest_map = {}
    if device_ids:
        from sqlalchemy import text
        for did in device_ids:
            latest_q = await db.execute(
                select(DeviceData)
                .where(DeviceData.device_id == did)
                .order_by(DeviceData.timestamp.desc())
                .limit(1)
            )
            latest_row = latest_q.scalar_one_or_none()
            if latest_row and latest_row.data_json:
                latest_map[did] = json.loads(latest_row.data_json)

    devices = []
    for d, l, c in rows:
        dev = {
            **_device_to_dict(d),
            "companyId": c.id, "companyName": c.display_name,
            "locationId": l.id, "locationName": l.name,
        }
        latest = latest_map.get(d.id)
        if latest:
            dev["lastValue"] = latest.get("value")
            dev["lastUnit"] = latest.get("unit")
        devices.append(dev)
    return devices


@router.get("/devices/next-id")
async def peek_next_device_id(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device.id).order_by(Device.id.desc()).limit(1))
    last = result.scalar_one_or_none()
    if last and last.startswith("DEV-"):
        num = int(last.split("-")[1]) + 1
    else:
        num = 1
    return {"nextId": f"DEV-{num:03d}"}


@router.post("/companies/{cid}/locations/{lid}/devices")
async def add_device(cid: int, lid: int, body: DeviceCreateSchema, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device.id).order_by(Device.id.desc()).limit(1))
    last = result.scalar_one_or_none()
    num = int(last.split("-")[1]) + 1 if last and last.startswith("DEV-") else 1
    new_id = f"DEV-{num:03d}"
    dev = Device(id=new_id, location_id=lid, tag_name=body.tagName, device_type=body.deviceType, subtype=body.subtype, unit=body.unit)
    db.add(dev)
    await db.commit()
    await db.refresh(dev)
    await cache_delete("companies:*")
    return {"id": dev.id, "tagName": dev.tag_name, "deviceType": dev.device_type, "subtype": dev.subtype, "unit": dev.unit or "", "value": 0, "status": "offline"}


@router.delete("/companies/{cid}/locations/{lid}/devices/{device_id}")
async def delete_device(cid: int, lid: int, device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404)
    await db.delete(dev)
    await db.commit()
    await cache_delete("companies:*")
    return {"ok": True}
