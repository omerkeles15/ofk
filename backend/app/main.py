from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os

from app.config import get_settings
from app.database import init_db
from app.routes import auth_routes, company_routes, device_data_routes, user_routes
from app.seed import seed_default_users

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await seed_default_users()
    yield
    # Shutdown


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route'ları ekle
app.include_router(auth_routes.router)
app.include_router(company_routes.router)
app.include_router(device_data_routes.router)
app.include_router(user_routes.router)


@app.get("/api/health")
async def health():
    from datetime import datetime
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


# ── Frontend Statik Dosyalar ──────────────────────────────────
DIST_DIR = settings.dist_dir
LOGO_DIR = os.path.join(DIST_DIR, "logo")
if not os.path.isdir(LOGO_DIR):
    LOGO_DIR = settings.logo_dir

if os.path.isdir(os.path.join(DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

if os.path.isdir(LOGO_DIR):
    app.mount("/logo", StaticFiles(directory=LOGO_DIR), name="logo")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    file_path = os.path.join(DIST_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(DIST_DIR, "index.html"))
