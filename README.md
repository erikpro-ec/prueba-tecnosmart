# Certificación Profesional Tecnosmart · Examen técnico

Página publicada con GitHub Pages. Los resultados se guardan en una Google Sheet y llegan por correo mediante Google Apps Script (`Code.gs`).

## Conectar Google (una sola vez, ~5 minutos)
1. Crea una Google Sheet nueva llamada «Resultados cuestionario Tecnosmart».
2. Menú **Extensiones ▸ Apps Script**. Borra el contenido y pega todo `Code.gs`. Guarda.
3. **Configuración del proyecto (⚙) ▸ Propiedades del script**: agrega
   - `ADMIN_KEY` = tu clave del panel de resultados (mínimo 6 caracteres)
   - `MAIL_TO` = correo que recibe los resultados (opcional: por defecto, el dueño del script)
4. En el editor elige la función `probar` y pulsa **Ejecutar**: autoriza los permisos (hoja y correo). Debe llegarte un correo de prueba.
5. **Implementar ▸ Nueva implementación ▸ Aplicación web**: «Ejecutar como: yo» y «Quién tiene acceso: cualquier usuario». Copia la URL que termina en `/exec`.
6. Pega esa URL en `config.json` (`{"gas":"https://script.google.com/macros/s/…/exec"}`) o envíasela a Claude para que la suba.

Si cambias `Code.gs` más adelante: **Implementar ▸ Administrar implementaciones ▸ Editar ▸ Nueva versión** (la URL se mantiene).
