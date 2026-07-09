# El Lado B — Sex Shop Tandil

Tienda online con carrito por WhatsApp y panel de administración.
**⚠️ EN PRODUCCIÓN en Vercel: todo push a `main` deploya automáticamente.**
Trabajar siempre en una rama y verificar antes de mergear a `main`.

## Stack

- **Backend:** Node.js + Express (`server.js`, un solo archivo). Se exporta como
  `module.exports = app` para Vercel (`@vercel/node`); en local escucha en `:3000`.
- **Base de datos:** MongoDB Atlas, base `eladob`, colecciones `products`, `config`
  (doc único `_id: 'main'`) y `orders`. Sin `MONGO_URI` el catálogo cae al
  fallback `data/products.json` (solo lectura).
- **Frontend:** HTML estático en `public/`, **sin framework ni build step**.
  CSS y JS van inline dentro de cada HTML (decisión deliberada: archivo único).
  - `public/index.html` — tienda / landing (≈3000 líneas).
  - `public/admin.html` — panel admin (login por contraseña).
- **Deploy:** Vercel. `vercel.json` enruta todo a `server.js`.

## Comandos

```bash
npm install        # deps: express, mongodb, multer, cors, body-parser
npm start          # node server.js → http://localhost:3000 (sin MONGO_URI usa el JSON)
```

No hay tests ni linter. Verificar manualmente: levantar el server y revisar
tienda, carrito, buscador, drawer de categorías y modal de producto.

## Variables de entorno (Vercel → Settings → Environment Variables)

- `MONGO_URI` — obligatoria en producción. Sin ella, las rutas de DB devuelven
  fallback o 500.

## Cosas que hay que saber (gotchas)

- **Filesystem de Vercel es de solo lectura.** No usar `fs.mkdirSync`/`writeFileSync`
  fuera de try/catch. Las imágenes subidas con multer a `public/uploads` **no
  persisten** en Vercel → en el admin se cargan imágenes por **URL** (workaround vigente).
- **WhatsApp es el canal de venta.** Número real: `5492494639700`. Está como
  default en `server.js` y en `index.html` (`configWhatsappNumber`), y el valor
  vivo viene de `/api/config`. No inventar otros números.
- **Auth del admin es simple:** el "token" es la contraseña en texto plano
  comparada contra `config.adminPassword` en Mongo (header `Authorization`).
  No loguear contraseñas por consola.
- `/api/config` es **público**: nunca devolver `adminPassword`,
  `pageAccessPassword`, `recoveryAnswer` ni `recoveryQuestion`.
- El árbol de categorías del drawer (`categoryTree`) y los overrides de
  productos (`productOverrides`) viven en **localStorage del navegador**, no en
  la DB. El panel oculto se abre con 5 clicks en el logo o `#admin` en la URL.
- Los precios son **strings** con formato (`"$24.900"`), no números. Para
  ordenar/sumar se parsean con regex.
- `/producto/:id` genera una página con meta Open Graph para que WhatsApp
  muestre preview rico al compartir un producto.
- Los productos tienen campo `pausado` (bool): la tienda pública los excluye;
  el admin los ve pidiendo `/api/products?todos=1`. También `destacado` y
  `rating`, editables desde el panel (switches y estrellas).
- La vista principal "Todo" de la tienda muestra máximo 29 productos (los
  primeros que devuelve la DB); categorías, filtros y búsqueda muestran todo.
- El carrito pide nombre y teléfono opcionales que se guardan en
  `orders.customerInfo` y se muestran en la pestaña Pedidos del admin.

## Convenciones

- Idioma: español rioplatense (voseo) en UI, comentarios y commits.
- Paleta (tokens CSS en `:root`): fondo `--ink #0c0c10`, texto `--paper #eef2f5`,
  acento `--rose #ff3366`, éxito/precios `--lime #66ffcc`, WhatsApp `--wa #25d366`.
- Tipografías: Cormorant Garamond (títulos), Archivo (texto), Inconsolata (mono/etiquetas).
- Historial de incidentes y fixes: ver `memory.md`.
