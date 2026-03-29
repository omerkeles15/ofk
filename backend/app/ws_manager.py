from fastapi import WebSocket
import json
import asyncio


class ConnectionManager:
    """
    WebSocket bağlantı yöneticisi.
    Kullanıcılar device_id bazında subscribe olur.
    Yeni veri geldiğinde sadece ilgili cihazı izleyenlere push yapılır.
    """

    def __init__(self):
        # { device_id: set(WebSocket) }
        self._subscriptions: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, ws: WebSocket, device_id: str):
        await ws.accept()
        async with self._lock:
            if device_id not in self._subscriptions:
                self._subscriptions[device_id] = set()
            self._subscriptions[device_id].add(ws)

    async def unsubscribe(self, ws: WebSocket, device_id: str):
        async with self._lock:
            subs = self._subscriptions.get(device_id)
            if subs:
                subs.discard(ws)
                if not subs:
                    del self._subscriptions[device_id]

    async def broadcast(self, device_id: str, data: dict):
        """Belirli cihazı izleyen tüm client'lara veri gönder."""
        async with self._lock:
            subs = self._subscriptions.get(device_id, set()).copy()

        dead = []
        message = json.dumps(data, ensure_ascii=False)
        for ws in subs:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                subs = self._subscriptions.get(device_id)
                if subs:
                    for ws in dead:
                        subs.discard(ws)


manager = ConnectionManager()
