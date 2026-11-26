# Portal de compras Cartimex · Tecnosmart

Interfaz privada para consultar productos de Cartimex (stock en GYE y UIO, precio y precio con IVA),
armar una orden en un carrito con comentarios y subirla a Cartimex por su API.

```
Navegador ──(clave 12345, cookie de sesión)──► Portal (FastAPI) ──(X-API-Key, solo en el servidor)──► Cartimex API
```

La API key de Cartimex **nunca llega al navegador**: queda en el `.env` del servidor, como exige la
documentación de Cartimex.

## Qué hace
- **Buscar** por código / part number, marca o descripción (opción “solo con stock”).
- Columnas **GYE** y **UIO**: disponible = mostrador + otras bodegas (el detalle aparece debajo y al pasar el mouse).
- **Precio** (su costo nivel 02, sin IVA; promoción incluida) y **Precio + IVA**.
- **Agregar** con cantidad → carrito en rejilla con cantidad editable, subtotal, total con IVA, peso y **comentario por línea**.
- **Entrega**: retiro en mostrador GYE / UIO o envío a sus direcciones registradas en Cartimex.
- **Subir orden**: antes de enviar vuelve a consultar precio y stock, avisa si algo cambió, pide confirmación y
  envía `precio_esperado` (si el precio subió, Cartimex la rechaza y no se compra caro).
  La referencia evita duplicados si se reenvía.
- Comentario general + comentarios por línea se unen en la **nota** de Cartimex (máx. 200 caracteres).
- **Órdenes recientes** (últimos 60 días) con su estado y número de factura.
- Cada orden enviada queda registrada en `data/ordenes.jsonl` (lo enviado, los comentarios y la respuesta).

## Probar en su computadora
```bash
cd portal_cartimex
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # ponga CARTIMEX_API_KEY y COOKIE_SECURE=0 para http local
set -a; . ./.env; set +a
uvicorn app:app --port 8000
# abrir http://localhost:8000  (clave 12345)
```

## Publicar en el VPS (DigitalOcean o Hostinger) con HTTPS
1. Apunte un subdominio (ej. `compras.tecnosmart.com.ec`) a la IP del VPS (registro A).
2. En el VPS: instale Docker, copie esta carpeta y cree `.env` desde `.env.example`
   (ponga `PORTAL_DOMAIN`, `CARTIMEX_API_KEY`, un `SESSION_SECRET` largo y `COOKIE_SECURE=1`).
3. `docker compose up -d --build` → Caddy obtiene el certificado HTTPS automáticamente.
4. Firewall: abra solo 80/443 (y SSH con llave desde su IP).

## Seguridad — antes de exponerlo a Internet
- **Cambie la clave 12345** por una larga en `PORTAL_PASSWORD`: 12345 se adivina en segundos
  (el portal bloquea 5 minutos tras 5 intentos fallidos por IP, pero no es suficiente con una clave tan corta).
- La API key de Cartimex puede **crear órdenes a su nombre**: pida a Cartimex rotarla si fue compartida, y no la suba a git
  (`.env` está en `.gitignore`).
- Mejor aún: limite el acceso por IP en Caddy o use una VPN/Tailscale para que solo su equipo vea el portal.

## Pruebas
```bash
python3 -m pytest -q tests     # usan un Cartimex simulado: no se conectan ni crean órdenes reales
```
