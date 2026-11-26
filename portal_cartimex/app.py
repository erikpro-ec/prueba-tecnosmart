"""Portal privado de compras Cartimex · Tecnosmart.

Servidor pequeño que:
  * protege la interfaz con una clave (PORTAL_PASSWORD, por defecto 12345);
  * guarda la API key de Cartimex del lado del servidor (nunca llega al navegador);
  * reenvía a Cartimex las consultas de productos, stock, direcciones y órdenes.

Variables de entorno (ver .env.example):
  CARTIMEX_API_KEY   obligatoria
  PORTAL_PASSWORD    clave de acceso a la interfaz (por defecto 12345)
  SESSION_SECRET     secreto para firmar la sesión (si falta, se genera uno al arrancar)
  SESSION_HOURS      duración de la sesión (por defecto 12)
  COOKIE_SECURE      1 para enviar la cookie solo por HTTPS (recomendado en producción)
  CARTIMEX_BASE_URL  por defecto https://www.cartimex.com/api/v1
  ORDERS_LOG         archivo donde se registran las órdenes enviadas (JSON por línea)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

CARTIMEX_BASE_URL = os.getenv("CARTIMEX_BASE_URL", "https://www.cartimex.com/api/v1").rstrip("/")
PORTAL_PASSWORD = os.getenv("PORTAL_PASSWORD", "12345")
SESSION_SECRET = os.getenv("SESSION_SECRET") or secrets.token_hex(32)
SESSION_HOURS = float(os.getenv("SESSION_HOURS", "12"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"
ORDERS_LOG = Path(os.getenv("ORDERS_LOG", str(BASE_DIR / "data" / "ordenes.jsonl")))
COOKIE_NAME = "ts_portal"

NOTA_MAX = 200  # límite de Cartimex para el campo "nota"
ENTREGAS = {"retiro_gye", "retiro_uio", "envio"}
BODEGAS = ("mostrador_guayaquil", "otras_guayaquil", "mostrador_quito", "otras_quito")

app = FastAPI(title="Portal Cartimex · Tecnosmart", docs_url=None, redoc_url=None, openapi_url=None)

# Permite inyectar un transporte falso en las pruebas.
app.state.cartimex_transport = None


# ---------------------------------------------------------------- seguridad

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' https://www.cartimex.com data:; "
        "style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


_failed_logins: dict[str, list[float]] = {}
LOGIN_WINDOW_S = 300
LOGIN_MAX_FAILS = 5


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


def _sign(payload: str) -> str:
    return hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _make_token() -> str:
    exp = int(time.time() + SESSION_HOURS * 3600)
    return f"{exp}.{_sign(str(exp))}"


def _valid_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    exp, sig = token.split(".", 1)
    if not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, _sign(exp))


def require_session(request: Request) -> None:
    if not _valid_token(request.cookies.get(COOKIE_NAME)):
        raise HTTPException(status_code=401, detail="Sesión no iniciada o vencida")


class LoginIn(BaseModel):
    password: str = Field(max_length=200)


@app.post("/api/login")
def login(data: LoginIn, request: Request, response: Response):
    ip = _client_ip(request)
    now = time.time()
    fails = [t for t in _failed_logins.get(ip, []) if now - t < LOGIN_WINDOW_S]
    if len(fails) >= LOGIN_MAX_FAILS:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espere 5 minutos.")
    if not hmac.compare_digest(data.password.encode(), PORTAL_PASSWORD.encode()):
        fails.append(now)
        _failed_logins[ip] = fails
        raise HTTPException(status_code=401, detail="Clave incorrecta")
    _failed_logins.pop(ip, None)
    response.set_cookie(
        COOKIE_NAME, _make_token(), max_age=int(SESSION_HOURS * 3600),
        httponly=True, samesite="strict", secure=COOKIE_SECURE, path="/",
    )
    return {"ok": True}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/sesion")
def sesion(request: Request):
    return {"activa": _valid_token(request.cookies.get(COOKIE_NAME))}


# ---------------------------------------------------------------- Cartimex

async def cartimex(method: str, path: str, *, params: dict | None = None, body: Any = None) -> httpx.Response:
    key = os.getenv("CARTIMEX_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="Falta configurar CARTIMEX_API_KEY en el servidor")
    try:
        async with httpx.AsyncClient(
            base_url=CARTIMEX_BASE_URL, timeout=30, transport=app.state.cartimex_transport,
            headers={"X-API-Key": key, "Accept": "application/json"},
        ) as client:
            return await client.request(method, path, params=params, json=body)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con Cartimex: {exc.__class__.__name__}")


def _json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return {"detail": resp.text[:500]}


def _raise_for(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        data = _json(resp)
        detail = data.get("detail") if isinstance(data, dict) else data
        raise HTTPException(status_code=resp.status_code, detail=detail or f"Error de Cartimex ({resp.status_code})")


def _disp(stock: dict, bodega: str) -> int:
    b = stock.get(bodega) or {}
    return int(b.get("disponible") or 0)


def simplificar(p: dict) -> dict:
    """Reduce el producto de Cartimex a lo que muestra la interfaz."""
    stock = p.get("stock") or {}
    precio_final = float(p.get("precio_final") or p.get("precio") or 0)
    iva = float(p.get("iva_pct") if p.get("iva_pct") is not None else 15)
    promo = p.get("promocion")
    return {
        "codigo": p.get("codigo"),
        "nombre": p.get("nombre"),
        "marca": p.get("marca"),
        "categoria": p.get("categoria"),
        "encontrado": p.get("encontrado", True),
        "precio_lista": p.get("precio"),
        "promocion": promo,
        "precio": round(precio_final, 2),
        "iva_pct": iva,
        "precio_iva": round(precio_final * (1 + iva / 100), 2),
        "peso_kg": p.get("peso_kg"),
        "gye_mostrador": _disp(stock, "mostrador_guayaquil"),
        "gye_otras": _disp(stock, "otras_guayaquil"),
        "uio_mostrador": _disp(stock, "mostrador_quito"),
        "uio_otras": _disp(stock, "otras_quito"),
        "disponible_total": int(stock.get("disponible_total") or 0),
        "imagen": p.get("imagen"),
        "url": p.get("url"),
        "actualizado": p.get("actualizado"),
    }


@app.get("/api/cuenta", dependencies=[Depends(require_session)])
async def cuenta():
    resp = await cartimex("GET", "/cuenta")
    _raise_for(resp)
    d = _json(resp)
    return {k: d.get(k) for k in ("cliente", "nivel_precio", "vence", "puede_crear_ordenes", "dropshipping_habilitado", "bodegas")}


@app.get("/api/buscar", dependencies=[Depends(require_session)])
async def buscar(q: str, solo_disponibles: bool = True, page: int = 1):
    q = q.strip()
    if not 2 <= len(q) <= 80:
        raise HTTPException(status_code=422, detail="Escriba entre 2 y 80 caracteres")
    params = {"q": q, "page": max(1, page), "limit": 50}
    if solo_disponibles:
        params["solo_disponibles"] = "true"
    resp = await cartimex("GET", "/productos", params=params)
    if resp.status_code == 404:
        return {"productos": [], "total": 0, "page": 1, "pages": 0}
    _raise_for(resp)
    d = _json(resp)
    productos = [simplificar(p) for p in d.get("productos", [])]
    total = int(d.get("total") or len(productos))
    return {"productos": productos, "total": total, "page": d.get("page", page),
            "pages": d.get("pages") or (1 if productos else 0), "has_next": d.get("has_next", False)}


class StockIn(BaseModel):
    codigos: list[str] = Field(min_length=1, max_length=200)


@app.post("/api/stock", dependencies=[Depends(require_session)])
async def stock(data: StockIn):
    resp = await cartimex("POST", "/stock/bulk", body={"codigos": data.codigos})
    _raise_for(resp)
    return {"resultados": [simplificar(p) for p in _json(resp).get("resultados", [])]}


@app.get("/api/direcciones", dependencies=[Depends(require_session)])
async def direcciones():
    resp = await cartimex("GET", "/direcciones")
    _raise_for(resp)
    return _json(resp)


@app.get("/api/ordenes", dependencies=[Depends(require_session)])
async def listar_ordenes(dias: int = 30):
    resp = await cartimex("GET", "/ordenes", params={"dias": min(max(dias, 1), 365)})
    _raise_for(resp)
    return _json(resp)


class ItemIn(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    cantidad: int = Field(ge=1, le=9999)
    precio_esperado: float | None = Field(default=None, gt=0)
    comentario: str = Field(default="", max_length=200)


class EntregaIn(BaseModel):
    tipo: str
    direccion_id: str | None = None

    @field_validator("tipo")
    @classmethod
    def _tipo(cls, v: str) -> str:
        if v not in ENTREGAS:
            raise ValueError("Tipo de entrega no válido")
        return v


class OrdenIn(BaseModel):
    referencia: str
    items: list[ItemIn] = Field(min_length=1, max_length=100)
    entrega: EntregaIn
    comentario: str = Field(default="", max_length=500)

    @field_validator("referencia")
    @classmethod
    def _ref(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9\-_/]{2,39}", v):
            raise ValueError("Referencia: 3 a 40 caracteres (letras, números, - _ /)")
        return v


def armar_nota(orden: OrdenIn) -> str:
    """Une el comentario general y los comentarios por línea en la nota de Cartimex."""
    partes = [orden.comentario.strip()] if orden.comentario.strip() else []
    partes += [f"{i.codigo}: {i.comentario.strip()}" for i in orden.items if i.comentario.strip()]
    return " | ".join(partes)


def _log_orden(entry: dict) -> None:
    try:
        ORDERS_LOG.parent.mkdir(parents=True, exist_ok=True)
        with ORDERS_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        pass  # el registro local nunca debe impedir la orden


@app.post("/api/ordenes", dependencies=[Depends(require_session)])
async def crear_orden(orden: OrdenIn):
    codigos = [i.codigo for i in orden.items]
    if len(set(codigos)) != len(codigos):
        raise HTTPException(status_code=422, detail="Hay productos repetidos en la orden; sume las cantidades en una sola línea")
    if orden.entrega.tipo == "envio" and not orden.entrega.direccion_id:
        raise HTTPException(status_code=422, detail="Elija la dirección de envío")
    nota = armar_nota(orden)
    if len(nota) > NOTA_MAX:
        raise HTTPException(status_code=422, detail=f"Los comentarios suman {len(nota)} caracteres; Cartimex acepta {NOTA_MAX}")

    entrega: dict[str, Any] = {"tipo": orden.entrega.tipo}
    if orden.entrega.tipo == "envio":
        entrega["direccion_id"] = orden.entrega.direccion_id
    body: dict[str, Any] = {
        "referencia": orden.referencia,
        "items": [
            {"codigo": i.codigo, "cantidad": i.cantidad, **({"precio_esperado": i.precio_esperado} if i.precio_esperado else {})}
            for i in orden.items
        ],
        "entrega": entrega,
    }
    if nota:
        body["nota"] = nota

    resp = await cartimex("POST", "/ordenes", body=body)
    data = _json(resp)
    _log_orden({
        "fecha": datetime.now(timezone.utc).isoformat(),
        "enviado": body,
        "comentarios_linea": {i.codigo: i.comentario for i in orden.items if i.comentario},
        "http": resp.status_code,
        "respuesta": data,
    })
    if resp.status_code >= 400:
        detail = data.get("detail") if isinstance(data, dict) else data
        return JSONResponse(status_code=resp.status_code, content={"ok": False, "detail": detail, "respuesta": data})
    return {"ok": True, "respuesta": data}


# ---------------------------------------------------------------- interfaz

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-store"})
