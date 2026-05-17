// Cursor
const dot = document.getElementById('c-dot');
const ring = document.getElementById('c-ring');
let mx = 0, my = 0, rx = 0, ry = 0;
document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; dot.style.left = mx + 'px'; dot.style.top = my + 'px'; });
(function loop() { rx += (mx - rx) * 0.1; ry += (my - ry) * 0.1; ring.style.left = rx + 'px'; ring.style.top = ry + 'px'; requestAnimationFrame(loop); })();

let productos = [];
let categoriasUnicas = [];
let filtroActual = 'all';
let ordenActual = 'default';

// Configuración
let config = { whatsappNumber: '', horarios: {}, tickerItems: [] };

// Carrito
let cartCount = 0;
function updateCart(n = 1) { cartCount += n; document.getElementById('cart-n').textContent = cartCount; }
function showToast(msg) { const t = document.getElementById('toast'); document.getElementById('toast-msg').textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }

// Cargar datos
async function loadProducts() {
  const res = await fetch('/api/products');
  productos = await res.json();
  categoriasUnicas = ['Todo', ...new Set(productos.map(p => p.categoria))];
  renderTabs();
  renderProducts();
}
async function loadConfig() {
  const res = await fetch('/api/config');
  config = await res.json();
  // Actualizar números de WhatsApp
  const waLink = `https://wa.me/${config.whatsappNumber}`;
  document.querySelectorAll('#hero-whatsapp, #wpp-block-link, #footer-wa, #footer-wa-link, .m-wpp').forEach(el => { if (el) el.href = waLink; });
  // Ticker
  const tickerTrack = document.getElementById('ticker-track');
  if (tickerTrack) {
    let itemsHtml = '';
    for (let i = 0; i < 2; i++) {
      config.tickerItems.forEach(item => { itemsHtml += `<span class="ticker-item">${item}</span>`; });
    }
    tickerTrack.innerHTML = itemsHtml;
  }
  // Horarios
  const horariosRows = document.getElementById('horarios-rows');
  if (horariosRows && config.horarios) {
    horariosRows.innerHTML = `
      <div class="hor-row"><span>Lunes a Viernes</span><span>${config.horarios.lunesViernes}</span></div>
      <div class="hor-row"><span>Sábados</span><span>${config.horarios.sabados}</span></div>
      <div class="hor-row"><span>Domingos</span><span>${config.horarios.domingos}</span></div>
      <div class="hor-row"><span>Feriados</span><span>${config.horarios.feriados}</span></div>
    `;
  }
}
function renderTabs() {
  const tabsBar = document.getElementById('tabs-bar');
  tabsBar.innerHTML = categoriasUnicas.map(cat => {
    const count = cat === 'Todo' ? productos.length : productos.filter(p => p.categoria === cat).length;
    return `<button class="tab ${cat === 'Todo' ? 'on' : ''}" data-categoria="${cat}">${cat} <span class="tab-badge">${count}</span></button>`;
  }).join('');
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      const cat = btn.dataset.categoria;
      renderProducts(cat === 'Todo' ? null : cat);
    });
  });
}
function renderProducts(categoria = null) {
  let filtered = categoria ? productos.filter(p => p.categoria === categoria) : [...productos];
  // Aplicar filtro adicional (Nuevos, Ofertas, etc.)
  if (filtroActual === 'new') filtered = filtered.filter(p => p.badge === 'new');
  else if (filtroActual === 'hot') filtered = filtered.filter(p => p.badge === 'hot');
  else if (filtroActual === 'sale') filtered = filtered.filter(p => p.badge === 'sale');
  // Ordenar
  if (ordenActual === 'price-asc') filtered.sort((a,b) => parseFloat(a.precio.replace('$','').replace('.','')) - parseFloat(b.precio.replace('$','').replace('.','')));
  else if (ordenActual === 'price-desc') filtered.sort((a,b) => parseFloat(b.precio.replace('$','').replace('.','')) - parseFloat(a.precio.replace('$','').replace('.','')));
  const container = document.getElementById('products-container');
  container.innerHTML = filtered.map(p => `
    <div class="card" data-p='${JSON.stringify(p)}'>
      <div class="card-thumb">
        <img src="${p.imagen}" alt="${p.nombre}">
        ${p.badge ? `<span class="card-badge b-${p.badge}">${p.badge === 'new' ? 'Nuevo' : p.badge === 'hot' ? '🔥 Hot' : 'Oferta'}</span>` : ''}
        <button class="card-fav">♡</button>
        <div class="card-hover-cta">
          <button class="cta-add" onclick="quickAdd(this)">Agregar al carrito</button>
          <button class="cta-view" onclick="openModal(this)"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></button>
        </div>
      </div>
      <div class="card-body">
        <div class="card-cat">${p.categoria}</div>
        <div class="card-name">${p.nombre}</div>
        <div class="card-desc">${p.descripcion.substring(0, 60)}${p.descripcion.length > 60 ? '…' : ''}</div>
        <div class="card-foot">
          <div class="card-price">${p.precio}${p.precioAnterior ? `<del>${p.precioAnterior}</del>` : ''}</div>
          <div class="stars">${'★'.repeat(Math.floor(p.rating))}${p.rating % 1 ? '½' : ''}<span class="star-n">${p.rating}</span></div>
        </div>
      </div>
    </div>
  `).join('');
}
function quickAdd(btn) { updateCart(); showToast('Producto agregado al carrito'); const orig = btn.textContent; btn.textContent = '✓ Listo!'; btn.style.background = '#2a7d42'; setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1200); }
function openModal(btn) {
  const card = btn.closest('.card');
  const p = JSON.parse(card.dataset.p);
  document.getElementById('m-img').src = p.imagen;
  document.getElementById('m-cat').textContent = p.categoria;
  document.getElementById('m-name').textContent = p.nombre;
  document.getElementById('m-price').textContent = p.precio;
  document.getElementById('m-desc').textContent = p.descripcion;
  document.getElementById('modal-bg').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(e) { if (e.target === document.getElementById('modal-bg')) { document.getElementById('modal-bg').classList.remove('open'); document.body.style.overflow = ''; } }
document.getElementById('modal-close').addEventListener('click', () => { document.getElementById('modal-bg').classList.remove('open'); document.body.style.overflow = ''; });
function addFromModal() { updateCart(); showToast('Producto agregado al carrito'); const btn = document.querySelector('.m-add'); const orig = btn.textContent; btn.textContent = '✓ Agregado'; btn.style.background = '#2a7d42'; setTimeout(() => { btn.textContent = orig; btn.style.background = ''; document.getElementById('modal-bg').classList.remove('open'); document.body.style.overflow = ''; }, 1300); }
function handleNL() { const inp = document.querySelector('.nl-input'); if (!inp.value || !inp.value.includes('@')) { inp.style.borderColor = 'var(--rose)'; setTimeout(() => inp.style.borderColor = '', 1500); return; } const btn = document.querySelector('.nl-btn'); btn.textContent = '✓ ¡Te suscribiste!'; btn.style.background = '#2a7d42'; inp.value = ''; setTimeout(() => { btn.textContent = 'Suscribirme — Es gratis'; btn.style.background = ''; }, 3000); }
// Filtros toolbar
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    filtroActual = btn.dataset.filter;
    renderProducts(document.querySelector('.tab.on')?.dataset.categoria || null);
  });
});
document.getElementById('sort-select').addEventListener('change', e => { ordenActual = e.target.value; renderProducts(document.querySelector('.tab.on')?.dataset.categoria || null); });
// Footer categorías
function renderFooterCats() {
  const footerCats = document.getElementById('footer-categorias');
  if (footerCats) footerCats.innerHTML = categoriasUnicas.filter(c => c !== 'Todo').map(c => `<li><a href="#tienda" data-cat="${c}">${c}</a></li>`).join('');
  document.querySelectorAll('#footer-categorias a').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); document.querySelector(`.tab[data-categoria="${a.dataset.cat}"]`).click(); window.scrollTo({ top: document.getElementById('tienda').offsetTop - 80, behavior: 'smooth' }); });
  });
}
// Inicializar
loadConfig().then(() => { loadProducts().then(() => renderFooterCats()); });
// Scroll reveal
const obs = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('vis'); }); }, { threshold: .08 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
// Fav hearts
document.addEventListener('click', (e) => { if (e.target.classList.contains('card-fav')) { e.stopPropagation(); e.target.textContent = e.target.textContent === '♡' ? '♥' : '♡'; e.target.style.color = e.target.textContent === '♥' ? 'var(--rose)' : ''; } });