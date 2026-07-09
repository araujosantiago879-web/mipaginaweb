# Memory — Fixes y troubleshooting

> Contexto general del proyecto (stack, comandos, gotchas): ver `CLAUDE.md`.

## Refactor y auditoría general (julio 2026)

- `/api/config` filtraba solo `adminPassword`; exponía `pageAccessPassword` y
  `recoveryAnswer` públicamente. Ahora se excluyen todos los campos sensibles.
- `/api/verify-admin-access` logueaba la contraseña recibida por consola → eliminado.
- La página OG `/producto/:id` inyectaba datos del producto sin escapar → se agregó `escapeHtml`.
- El catálogo PDF usaba `window._productos` (nunca definido) y `Number(precio)`
  sobre strings `"$24.900"` → nunca funcionó; corregido.
- En el modal de producto, `precio.textContent = ...` destruía el span hijo del
  precio anterior → el tachado nunca se mostraba; se separaron los spans.
- El carrito no podía quitar ítems sin `id` (fallback JSON) → clave `id ?? nombre`.
- Números de WhatsApp placeholder `5492494123456` en la política de privacidad → real.
- Template de card duplicado (grilla + búsqueda) unificado en `cardHTML()` con escapado.
- `public/css/style.css` no estaba referenciado por ningún HTML → eliminado.
- El HTML de `admin.html` tenía un `</div>` desbalanceado que dejaba dos
  config-cards fuera de la grilla → corregido.

## Error 500 / FUNCTION_INVOCATION_FAILED en Vercel

### Causa
`server.js` ejecutaba `fs.mkdirSync('public/uploads')` al cargar el módulo.
En Vercel el filesystem es **solo lectura** → `mkdirSync` lanza excepción → la
función nunca arranca.

### Fix (commit `db80259`)
Envolver la creación del directorio en `try/catch`:

```js
try {
  if (!require('fs').existsSync(uploadDir)) {
    require('fs').mkdirSync(uploadDir, { recursive: true });
  }
} catch (_) {
  // Vercel: read-only filesystem, ignorar
}
```

---

## node_modules en el repo de git

### Causa
No había `.gitignore`. `node_modules/` (instalado en Windows) estaba commiteado
y se subía al repo. Vercel intentaba usar módulos de Windows en su entorno
Linux, causando errores de resolución de dependencias.

### Fix (commit `4fd0416`)
- Crear `.gitignore` con `node_modules/`, `.env`, `.vercel/`, `uploads/*`, `.claude/`
- `git rm --cached -r node_modules`
- `git rm --cached -r .claude`

---

## Variables de entorno

- `MONGO_URI` debe estar configurada en Vercel (Project → Settings → Environment Variables)
- Sin ella, las rutas que llaman a MongoDB devuelven 500
