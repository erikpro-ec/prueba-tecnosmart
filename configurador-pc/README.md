# Configurador PC · TECNOSMART

App web para armar una computadora pieza por pieza con stock real de Odoo. Solo ofrece combinaciones compatibles, muestra **costo, precio sin IVA, precio con IVA y % de ganancia**, y al final crea el **pedido en borrador** en Odoo y genera un **PDF** (versión cliente y versión interna con costos).

- Demo sin Odoo: `configurador-pc/index.html?demo=1`
- Producción (GitHub Pages): `https://erikpro-ec.github.io/prueba-tecnosmart/configurador-pc/` (después de pasar esta rama a `main`)

## Puesta en marcha (≈10 min)

El navegador no puede hablar directo con Odoo desde otro dominio (CORS). Hay dos caminos:

### Opción A: proxy de Google Apps Script (recomendado para hoy; no toca el servidor)
1. Entra a script.google.com → **Nuevo proyecto** → llámalo «Proxy Odoo Configurador».
2. Pega todo `proxy_odoo.gs`. Guarda.
3. Elige la función `probar` → **Ejecutar** → autoriza. En el registro debe salir `200 {"jsonrpc"…"server_version":"13.0…"}`. Si sale error, Google no llega a Odoo (firewall o Cloudflare).
4. **Implementar → Nueva implementación → Aplicación web** · Ejecutar como: *yo* · Acceso: *cualquier usuario*. Copia la URL `/exec`.
5. Pega la URL en `config.js` → `proxyUrl` (o envíasela a Claude para que la suba).

El proxy solo deja pasar lo que la app usa (leer productos, categorías y clientes, crear clientes y pedidos). Cada llamada viaja con el usuario y la contraseña de Odoo de quien está conectado, así que **los permisos de Odoo siguen mandando**.

### Opción B: directo, con CORS en nginx (más rápido; requiere acceso al servidor)
En `config.js` pon `modo: 'directo'` y agrega en el `server {}` de newerp:

```nginx
location = /jsonrpc {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin  "https://erikpro-ec.github.io" always;
        add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
        add_header Access-Control-Max-Age 86400 always;
        return 204;
    }
    add_header Access-Control-Allow-Origin "https://erikpro-ec.github.io" always;
    proxy_pass http://odoo;   # el mismo upstream que usa "location /"
}
```

**Base de datos:** la app intenta detectarla sola. Si Odoo tiene el listado de bases desactivado, escribe el nombre en `config.js → db`.

## Reglas de compatibilidad (estrictas)
Los datos técnicos se leen del **título del producto** en Odoo.

| Paso | Regla | El título debe incluir |
|---|---|---|
| Procesador | Define socket, gráficos integrados y si trae cooler | Modelo (Ryzen 5 7600, i5-12400F, Ultra 5 245K) o socket |
| Mainboard | Socket = el del procesador | Chipset (B650M, B760M…) o socket; **DDR4/DDR5** si el chipset admite las dos (Intel 600/700) |
| RAM | DDR igual a la mainboard; sin SO-DIMM; hasta 4 módulos o las ranuras de la placa (ITX y Micro-ATX de entrada = 2). Un kit 2x8GB cuenta como 2 | DDR4/DDR5 y, si es kit, «2x8GB» |
| SSD / HDD | Hasta 4 SSD y 2 HDD; al menos uno de los dos | — |
| Tarjeta de video | Obligatoria si el procesador no tiene gráficos integrados (F/KF, Ryzen sin G en AM4) | Modelo (RTX 4060, RX 7600…) |
| Case | Admite el formato de la mainboard | ATX, Micro-ATX, ITX, E-ATX, Mid Tower o Full Tower |
| Fuente | ≥ (CPU + GPU + 80 W) × 1,3, redondeado a 50 W, nunca menos que la recomendación del fabricante de la GPU ni 400 W | Potencia en W |
| Water / Air cooler | Excluyentes. Obligatorio uno si el procesador no trae cooler (K, X3D, X en AM5, Tray) | — |
| Ventiladores | Hasta 2, de case, 120 o 140 mm | 120mm / 140mm |
| Monitor, teclado, mouse | Opcionales, 1 de cada uno | — |

Si cambias una pieza anterior, las posteriores que dejan de ser compatibles se quitan solas y la app avisa. El botón **Diagnóstico** lista los productos con stock que no aparecen porque al título le falta un dato, para que Compras los corrija en Odoo.

## Parámetros (`config.js`)
`descuentoMax` (7), `iva` (15), `mostrarCosto` (true; ponlo en false cuando quieras ocultar costos), `gananciaSobre` ('costo' o 'precio'), `validezDias`, `canales`, cálculo de fuente y nombres de categorías.

> Ocultar el costo con `mostrarCosto: false` lo quita de la pantalla y del PDF, pero el dato sigue llegando al navegador. Para que un vendedor **no pueda** verlo de ninguna forma, hay que restringir el campo costo por grupo en Odoo.

## Qué crea en Odoo
- **Pedido de venta en borrador** a nombre del vendedor conectado. Las líneas llevan precio de lista, descuento % y los impuestos del producto.
- **Referencia del cliente:** «Nombre del PC - Nombre Apellido».
- **Nota:** datos del cliente final (teléfono, email, ciudad, canal), asesor y descuento.
- **Cliente:** Consumidor final (RUC 9999999999999), uno existente buscado por nombre, cédula o teléfono, o uno nuevo creado con nombre, teléfono, email y ciudad.
- **Origen (UTM):** se llena con el canal si existe un origen con ese nombre en Odoo.

## Plan de equipo para la prueba de hoy
| # | Quién | Tarea | Tiempo |
|---|---|---|---|
| 1 | Gerencia | Desplegar el proxy (Opción A) y pasar la URL | 10 min |
| 2 | Claude | Subir la URL a `config.js` y publicar en GitHub Pages | 5 min |
| 3 | Admin Odoo | Confirmar el nombre de la base, que exista «Consumidor final» con RUC 9999999999999 y que los vendedores tengan grupo Ventas | 15 min |
| 4 | Compras | Abrir **Diagnóstico** y corregir los títulos de los productos ocultos (DDR, formato, W, mm) | 30–60 min |
| 5 | 2 vendedores | Armar 3 equipos reales cada uno (AMD, Intel y uno de oficina) y generar el PDF | 30 min |
| 6 | Contabilidad | Revisar en Odoo que precios, IVA y descuento de esos pedidos cuadren | 15 min |
| 7 | Todos | Reportar errores de compatibilidad (con el nombre del producto) para ajustar reglas | Al cierre |

## Pruebas
```bash
node configurador-pc/tests/compat.test.js
```

## Migración a Odoo 19
La app usa `/jsonrpc`, que sigue disponible en Odoo 19 (marcado como obsoleto; Odoo anuncia su retiro en versiones futuras). Los nombres de campo que cambian entre versiones (`product_uom`/`product_uom_id`, `tax_id`/`tax_ids`) se detectan solos. Cuando migren conviene pasar a la API JSON-2 con API keys; solo cambia `odoo.js`.
