# Acordeón en Pilares de Categorías

## Objetivo
Al clickear el header de cada pilar (Vibradores, Anal, etc.) se despliegan/contraen sus subcategorías con animación. Solo un pilar abierto a la vez. Mantener click en subcategorías filtrando productos igual que ahora.

## Archivo a modificar
- `public/index.html`

---

## 1. CSS — Reemplazar reglas de `.pillar`, `.pillar-h`, `.pillar-l` y agregar `.pillar-body`

**Localización:** bloque `<style>` ~línea 207

### Reemplazar:
```css
.pillar { background:var(--ink); padding:20px 0 12px 16px; display:flex; flex-direction:column; gap:2px; }
.pillar-h { font-family:'Inconsolata',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--rose); margin-bottom:8px; font-weight:700; }
.pillar-l { font-family:'Archivo',sans-serif; font-size:12px; color:var(--muted); padding:4px 0; cursor:pointer; transition:color .2s; }
```

### Por:
```css
.pillar { background:var(--ink); padding:20px 0 12px 16px; display:flex; flex-direction:column; gap:0; }
.pillar-h { font-family:'Inconsolata',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--rose); margin-bottom:0; font-weight:700; cursor:pointer; user-select:none; display:flex; align-items:center; justify-content:space-between; padding-right:16px; }
.pillar-h::after { content:'+'; font-size:11px; color:var(--muted-2); transition:transform .3s; }
.pillar.open .pillar-h::after { content:'−'; }
.pillar-body { max-height:0; overflow:hidden; transition:max-height .4s ease; display:flex; flex-direction:column; gap:2px; }
.pillar.open .pillar-body { max-height:500px; }
.pillar-l { font-family:'Archivo',sans-serif; font-size:12px; color:var(--muted); padding:4px 0; cursor:pointer; transition:color .2s; margin-top:6px; }
```

---

## 2. CSS — Responsive mobile (dentro del mismo bloque, ~línea 875)

### Reemplazar:
```css
.pillar { padding:16px 0 8px 12px; }
```

### Por:
```css
.pillar { padding:16px 0 8px 12px; }
.pillar-body { max-height:800px; }
.pillar-h { cursor:default; }
.pillar-h::after { display:none; }
```
Opcional: si querés mantener el acordeón en mobile, borrar estas 3 líneas.

---

## 3. JS — `renderPillars()`

**Localización:** ~línea 1622

### En el `return` del `container.innerHTML`, cambiar:
```js
return `<div class="pillar"><div class="pillar-h">${p.name}</div>${subsHtml}${extra}</div>`;
```
### Por:
```js
return `<div class="pillar"><div class="pillar-h">${p.name}</div><div class="pillar-body">${subsHtml}${extra}</div></div>`;
```

---

## 4. JS — Click handler en `.pillar-h`

**Localización:** después del `container.querySelectorAll('.pillar-l[data-sub]')` loop (~línea 1647)

### Agregar:
```js
container.querySelectorAll('.pillar-h').forEach(hdr => {
  hdr.addEventListener('click', () => {
    const parent = hdr.parentElement;
    const isOpen = parent.classList.contains('open');
    container.querySelectorAll('.pillar.open').forEach(p => p.classList.remove('open'));
    if (!isOpen) parent.classList.add('open');
  });
});
```

---

## 5. JS — Cerrar acordeón al clickear un `.tab`

**Localización:** dentro de `renderTabs()` ~línea 1663

### Agregar después de `btn.classList.add('on');`:
```js
document.querySelectorAll('.pillar.open').forEach(p => p.classList.remove('open'));
```

---

## 6. JS — Cerrar acordeón al clickear un `.pillar-l`

**Localización:** dentro del click handler de `.pillar-l[data-sub]` ~línea 1639

### Ya incluye `container.querySelectorAll('.pillar-l').forEach(l => l.classList.remove('on'));`
### Agregar después de esa línea:
```js
document.querySelectorAll('.pillar.open').forEach(p => p.classList.remove('open'));
```

---

## Verificación post-implementación

| Qué chequear | Cómo |
|---|---|
| Sin errores en consola | DevTools → Console |
| Click en header abre/cierra | Probar cada uno de los 5 pilares |
| Solo uno abierto a la vez | Abrir uno, clickear otro, el primero se cierra |
| Click en subcategoría filtra bien | Clickear "Parejas" → se muestran solo esos productos |
| Click en tabs planos cierra acordeón | Click en un tab → pilares se cierran |
| Click en filtros / clearSearch cierra acordeón | Misma lógica (ya implementado) |
| Mobile responsive | Testear con emulación 375px |
| Animación suave | Verificar transición de max-height |
