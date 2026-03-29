import redis.asyncio as redis
import json
from app.config import get_settings

settings = get_settings()
_redis = None


async def get_redis():
    global _redis
    if _redis is None:
        try:
            _redis = redis.from_url(settings.redis_url, decode_responses=True)
            await _redis.ping()
        except Exception:
            _redis = None
    return _redis


async def cache_get(key: str):
    r = await get_redis()
    if not r:
        return None
    val = await r.get(key)
    return json.loads(val) if val else None


async def cache_set(key: str, data, ttl: int = 5):
    r = await get_redis()
    if not r:
        return
    await r.set(key, json.dumps(data, ensure_ascii=False), ex=ttl)


async def cache_delete(pattern: str):
    r = await get_redis()
    if not r:
        return
    keys = []
    async for key in r.scan_iter(match=pattern):
        keys.append(key)
    if keys:
        await r.delete(*keys)
