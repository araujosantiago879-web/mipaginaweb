# Memory — Fixes y troubleshooting

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
