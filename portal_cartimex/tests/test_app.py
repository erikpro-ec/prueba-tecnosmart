"""Pruebas del portal con un Cartimex simulado (no se conecta a Internet ni crea órdenes reales)."""

import json
import os
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["CARTIMEX_API_KEY"] = "ck_test"
os.environ["PORTAL_PASSWORD"] = "12345"

import app as portal  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PRODUCTO = {
    "codigo": "XTM24", "nombre": "MONITOR XTRATECH 24\"", "marca": "XTRATECH", "categoria": "03 Monitores",
    "precio": 98.38, "promocion": {"precio": 91.01, "unidades": 278}, "precio_final": 91.01, "iva_pct": 15,
    "peso_kg": 3.15, "stock": {
        "mostrador_guayaquil": {"stock": 64, "reservado": 4, "disponible": 60},
        "mostrador_quito": {"stock": 24, "reservado": 0, "disponible": 24},
        "otras_guayaquil": {"stock": 5, "reservado": 0, "disponible": 5},
        "disponible_total": 89},
    "url": "https://www.cartimex.com/producto/XTM24", "actualizado": "2026-11-26T16:13:35",
}


@pytest.fixture
def calls(tmp_path, monkeypatch):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.headers["X-API-Key"] == "ck_test"
        p = request.url.path
        if p.endswith("/productos"):
            return httpx.Response(200, json={"productos": [PRODUCTO], "total": 1, "page": 1, "pages": 1})
        if p.endswith("/ordenes") and request.method == "POST":
            body = json.loads(request.content)
            if body["items"][0].get("precio_esperado", 0) < 91.01:
                return httpx.Response(409, json={"detail": {"motivo": "precios", "mensaje": "El precio cambió"}})
            return httpx.Response(201, json={"referencia": body["referencia"], "orden": "1500001", "estado": "registrada",
                                             "repetida": False, "total_estimado": 104.66})
        return httpx.Response(404, json={"detail": "no"})

    portal.app.state.cartimex_transport = httpx.MockTransport(handler)
    monkeypatch.setattr(portal, "ORDERS_LOG", tmp_path / "ordenes.jsonl")
    yield seen
    portal.app.state.cartimex_transport = None


def logged(client):
    assert client.post("/api/login", json={"password": "12345"}).status_code == 200
    return client


def test_requiere_clave(calls):
    c = TestClient(portal.app)
    assert c.get("/api/buscar", params={"q": "monitor"}).status_code == 401
    assert c.post("/api/login", json={"password": "mala"}).status_code == 401
    assert not calls  # nunca se llamó a Cartimex sin sesión


def test_bloqueo_por_intentos(calls):
    portal._failed_logins.clear()
    c = TestClient(portal.app)
    for _ in range(5):
        c.post("/api/login", json={"password": "x"})
    assert c.post("/api/login", json={"password": "12345"}).status_code == 429
    portal._failed_logins.clear()


def test_busqueda_columnas(calls):
    c = logged(TestClient(portal.app))
    d = c.get("/api/buscar", params={"q": "monitor 24"}).json()
    p = d["productos"][0]
    assert (p["gye_mostrador"], p["gye_otras"], p["uio_mostrador"]) == (60, 5, 24)
    assert p["precio"] == 91.01 and p["precio_iva"] == 104.66
    assert "ck_test" not in json.dumps(d)  # la clave nunca sale al navegador


def test_orden_ok_y_nota(calls):
    c = logged(TestClient(portal.app))
    r = c.post("/api/ordenes", json={
        "referencia": "TS-261126-1", "entrega": {"tipo": "retiro_gye"}, "comentario": "Retira Carlos",
        "items": [{"codigo": "XTM24", "cantidad": 2, "precio_esperado": 91.01, "comentario": "caja sellada"}]})
    assert r.status_code == 200 and r.json()["respuesta"]["orden"] == "1500001"
    enviado = json.loads(calls[-1].content)
    assert enviado["nota"] == "Retira Carlos | XTM24: caja sellada"
    assert "comentario" not in enviado["items"][0]
    assert portal.ORDERS_LOG.read_text().count("1500001") == 1


def test_orden_precio_cambio(calls):
    c = logged(TestClient(portal.app))
    r = c.post("/api/ordenes", json={"referencia": "TS-2", "entrega": {"tipo": "retiro_gye"},
                                     "items": [{"codigo": "XTM24", "cantidad": 1, "precio_esperado": 90}]})
    assert r.status_code == 409 and r.json()["ok"] is False


@pytest.mark.parametrize("payload,msg", [
    ({"referencia": "TS-3", "entrega": {"tipo": "envio"}, "items": [{"codigo": "A", "cantidad": 1}]}, "dirección"),
    ({"referencia": "TS-4", "entrega": {"tipo": "retiro_gye"}, "comentario": "x" * 201,
      "items": [{"codigo": "A", "cantidad": 1}]}, "200"),
    ({"referencia": "TS-5", "entrega": {"tipo": "retiro_gye"},
      "items": [{"codigo": "A", "cantidad": 1}, {"codigo": "A", "cantidad": 2}]}, "repetidos"),
])
def test_validaciones(calls, payload, msg):
    c = logged(TestClient(portal.app))
    r = c.post("/api/ordenes", json=payload)
    assert r.status_code == 422 and msg in r.text
    assert not [x for x in calls if x.method == "POST"]  # no se envió nada a Cartimex
