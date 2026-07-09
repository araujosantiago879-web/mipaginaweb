---
name: contexto-proyecto
description: Cargar el contexto completo del proyecto El Lado B (arquitectura, deploy en Vercel, gotchas) antes de hacer cambios. Usar al inicio de cualquier sesión de trabajo sobre esta tienda.
---

# Contexto del proyecto El Lado B

Antes de tocar código en este repo, seguí estos pasos:

1. **Leé `CLAUDE.md`** (raíz del repo): stack, comandos, variables de entorno y gotchas.
2. **Leé `memory.md`**: historial de errores ya resueltos (error 500 en Vercel,
   node_modules commiteado, etc.). No repitas esos errores.
3. **Recordá que producción deploya sola**: cada push a `main` actualiza la web
   en Vercel. Los cambios se desarrollan en rama y se verifican antes de mergear.

## Checklist antes de commitear

- [ ] `node -c server.js` pasa (o `node server.js` levanta sin crash).
- [ ] La tienda carga en `http://localhost:3000` con los productos del JSON de fallback.
- [ ] Carrito: agregar, cambiar cantidad, quitar y "Consultar por WhatsApp" funcionan.
- [ ] El buscador y el drawer de categorías filtran bien.
- [ ] Nada escribe al filesystem fuera de try/catch (Vercel es solo lectura).
- [ ] `/api/config` no expone contraseñas ni respuestas de recuperación.
- [ ] No quedaron números de WhatsApp placeholder: el real es `5492494639700`.
