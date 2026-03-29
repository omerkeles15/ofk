from fastapi import WebSocket
import json
import asyncio
import redis.asyncio as redis
from app.config import get_settings

settings = get_settings()


class ConnectionManager:
    """
    WebSocket bağlantı yöneticisi + Redis Pub/Sub.
    
    Akış:
    1. Cihaz veri gönderir → Redis'e publish edilir
    2. Her worker Redis'ten subscribe ile dinler
    3. Kendi bağlı kullanıcılarına push yapar
    
    Bu sayede Worker-1'e bağlı kullanıcı, Worker-3'e gelen veriyi de alır.
    """

    def __init__(self):
        self._subs: dict[str, set[WebSocket]] = {}
        self._pubsub_task = None

    async def subscribe(self, ws: WebSocket, device_id: str):
        await ws.accept()
        if device_id not in self._subs:
            self._subs[device_id] = set()
        self._subs[device_id].add(ws)

    def unsubscribe(self, ws: WebSocket, device_id: str):
        subs = self._subs.get(device_id)
        if subs:
            subs.discard(ws)
            if not subs:
                del self._subs[device_id]

    async def _local_broadcast(self, device_id: str, data: dict):
        """Bu worker'daki bağlı client'lara push."""
        subs = self._subs.get(device_id, set()).copy()
        if not subs:
            return
        msg = json.dumps(data, ensure_ascii=False)
        dead = []
        for ws in subs:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unsubscribe(ws, device_id)

    async def publish_and_broadcast(self, device_id: str, data: dict):
        """Redis'e publish et + kendi local client'lara da push yap."""
        # Local push (bu worker'daki client'lar)
        await self._local_broadcast(device_id, data)

        # Redis Pub/Sub ile diğer worker'lara da bildir
        try:
            r = redis.from_url(settings.redis_url, decode_responses=True)
            msg = json.dumps({"device_id": device_id, "data": data}, ensure_ascii=False)
            await r.publish("device_data_channel", msg)
            await r.aclose()
        except Exception:
            pass  # Redis yoksa sadece local broadcast çalışır

    async def start_pubsub_listener(self):
        """Redis Pub/Sub dinleyici — diğer worker'lardan gelen mesajları alır."""
        while True:
            try:
                r = redis.from_url(settings.redis_url, decode_responses=True)
                pubsub = r.pubsub()
                await pubsub.subscribe("device_data_channel")

                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue
                    try:
                        payload = json.loads(message["data"])
                        device_id = payload["device_id"]
                        data = payload["data"]
                        await self._local_broadcast(device_id, data)
                    except Exception:
                        pass

            except Exception:
                await asyncio.sleep(1)  # Bağlantı koparsa 1sn bekle, tekrar dene


manager = ConnectionManager()
