from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    user: dict
    token: str
    redirect: str

class CompanyCreate(BaseModel):
    displayName: str
    fullName: str
    managers: list = []

class CompanyUpdate(BaseModel):
    displayName: Optional[str] = None
    fullName: Optional[str] = None
    managers: Optional[list] = None

class LocationCreate(BaseModel):
    name: str
    managers: list = []
    users: list = []

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    managers: Optional[list] = None
    users: Optional[list] = None

class DeviceCreateSchema(BaseModel):
    tagName: str
    deviceType: Optional[str] = None
    subtype: Optional[str] = None
    unit: Optional[str] = ""
    modbusConfig: Optional[dict] = None
    plcIoConfig: Optional[dict] = None

class DeviceUpdateSchema(BaseModel):
    tagName: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    status: Optional[str] = None
    deviceType: Optional[str] = None
    subtype: Optional[str] = None
    modbusConfig: Optional[dict] = None
    plcIoConfig: Optional[dict] = None
    ioTags: Optional[dict] = None

class UserCreate(BaseModel):
    username: str
    name: str
    role: str
    password: Optional[str] = "123456"
    companyId: Optional[int] = None
    locationId: Optional[int] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    companyId: Optional[int] = None
    locationId: Optional[int] = None

class DeviceDataPayload(BaseModel):
    deviceId: str
    companyId: Optional[str] = None
    locationId: Optional[str] = None
    timestamp: Optional[str] = None
    type: Optional[str] = None
    subtype: Optional[str] = None
    data: Optional[dict] = None
