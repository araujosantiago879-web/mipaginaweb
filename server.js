const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '200kb' }));

// ─── Cabeceras de seguridad ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if ((req.headers['x-forwarded-proto'] || '') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ─── Admin panel (protegido) ────────────────────────────────────────────────
app.get('/admin.html', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Carpetas públicas (index:false para poder inyectar SEO en "/")
// Imágenes e íconos con caché de 7 días; HTML siempre revalidado
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders(res, filePath) {
    if (/\.(png|jpe?g|svg|webp|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ─── MongoDB ────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI; // variable de entorno en Vercel
let db;

async function connectDB() {
  if (db) return db;
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('eladob'); // nombre de tu base de datos
  console.log('✅ Conectado a MongoDB Atlas');

  // Número correcto de WhatsApp
  const WA_NUMBER = '5492494639700';

  // Crear config por defecto o asegurar passwords conocidas
  const configCol = db.collection('config');
  const existing = await configCol.findOne({ _id: 'main' });
  if (!existing) {
    await configCol.insertOne({
      _id: 'main',
      whatsappNumber: WA_NUMBER,
      horarios: {
        lunesViernes: '10:00 — 21:00 hs',
        sabados: '10:00 — 21:00 hs',
        domingos: '10:00 — 21:00 hs',
        feriados: '10:00 — 21:00 hs'
      },
      tickerItems: [
        '📦 Packaging discreto',
        '⚡ Entrega hoy en Tandil',
        '💳 Todos los medios de pago',
        '📲 Atención 10 a 21 hs',
        '✅ Productos certificados',
        '🔒 Compra 100% privada'
      ],
      adminPassword: 'admin123',
      pageAccessPassword: 'admin123',
      efectivoHabilitado: false,
      efectivoTexto: '',
      otroHabilitado: false,
      otroTitulo: '',
      otroTexto: ''
    });
    console.log('✅ Config creada por defecto');
  } else {
    const updates = {};
    // Asegurar pageAccessPassword si no existe
    if (!existing.pageAccessPassword) {
      updates.pageAccessPassword = existing.adminPassword || 'admin123';
    }
    // Asegurar campos de pago si no existen
    if (existing.otroHabilitado === undefined) updates.otroHabilitado = false;
    if (existing.otroTitulo === undefined) updates.otroTitulo = '';
    if (existing.otroTexto === undefined) updates.otroTexto = '';
    // Actualizar número placeholder si es necesario
    if (existing.whatsappNumber === '5492494000000' || existing.whatsappNumber === '5492490000000') {
      updates.whatsappNumber = WA_NUMBER;
    }
    if (Object.keys(updates).length > 0) {
      await configCol.updateOne({ _id: 'main' }, { $set: updates });
      console.log('✅ Config actualizada:', Object.keys(updates).join(', '));
    }
  }

  return db;
}

// Helper para obtener colecciones
async function getProducts() {
  const database = await connectDB();
  return database.collection('products');
}
async function getConfig() {
  const database = await connectDB();
  return database.collection('config');
}

// ─── Multer (imágenes → /uploads/) ──────────────────────────────────────────
const uploadDir = path.join(__dirname, 'public', 'uploads');
try {
  if (!require('fs').existsSync(uploadDir)) {
    require('fs').mkdirSync(uploadDir, { recursive: true });
  }
} catch (_) {
  // Vercel: filesystem de solo lectura, ignorar
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Origen absoluto del sitio (dominio real detrás del proxy de Vercel)
function siteOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${host.startsWith('localhost') ? 'http' : proto}://${host}`;
}

// Card de producto renderizada en el servidor (para crawlers sin JS y
// primer pintado instantáneo; el frontend la re-renderiza al hidratar)
function ssrCard(p) {
  const img = escapeHtml((p.imagenes && p.imagenes[0]) || p.imagen || '');
  const rating = p.rating != null ? p.rating : 4.5;
  const badgeTxt = p.badge === 'new' ? 'Nuevo' : p.badge === 'hot' ? '🔥 Hot' : p.badge === 'sale' ? 'Oferta' : '';
  const desc = (p.descripcion || '');
  return `<article class="card" data-id="${escapeHtml(String(p.id ?? ''))}">
    <div class="card-thumb"><img src="${img}" alt="${escapeHtml(p.nombre || 'Producto')}" loading="lazy" decoding="async">${badgeTxt ? `<span class="card-badge b-${p.badge}">${badgeTxt}</span>` : ''}</div>
    <div class="card-body">
      <div class="card-cat">${escapeHtml(p.categoria || '')}</div>
      <div class="card-name">${escapeHtml(p.nombre || '')}</div>
      <div class="card-desc">${escapeHtml(desc.substring(0, 65))}${desc.length > 65 ? '…' : ''}</div>
      <div class="card-foot">
        <div class="card-price">${escapeHtml(p.precio || '')}</div>
        <div class="stars">${'★'.repeat(Math.floor(rating))}<span class="star-n">${rating}</span></div>
        <div class="rating-mini">★ ${rating}</div>
      </div>
    </div>
  </article>`;
}

// ─── Ruta principal (inyecta canonical / og absolutos + productos para SEO) ──
app.get('/', async (req, res) => {
  try {
    const origin = siteOrigin(req);
    let html = require('fs').readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    html = html
      .replace('<meta property="og:image" content="/og-image.png">',
               `<meta property="og:image" content="${origin}/og-image.png">`)
      .replace('<meta name="twitter:image" content="/og-image.png">',
               `<meta name="twitter:image" content="${origin}/og-image.png">`)
      .replace('<!--seo:canonical-->',
               `<link rel="canonical" href="${origin}/">\n  <meta property="og:url" content="${origin}/">`);

    // Incrustar los primeros 29 productos (mismo límite que la vista "Todo")
    try {
      let prods = [];
      try {
        const col = await getProducts();
        prods = (await col.find({ pausado: { $ne: true } }).limit(29).toArray())
          .map(({ _id, ...p }) => ({ id: _id, ...p }));
      } catch (_) {
        prods = getProductsFromJSON().filter(p => !p.pausado).slice(0, 29);
      }
      if (prods.length) {
        html = html.replace('<div class="products" id="products-container"></div>',
          `<div class="products" id="products-container">${prods.map(ssrCard).join('')}</div>`);
      }
    } catch (_) {}

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ─── Monitoreo simple ────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let db = 'sin conexión';
  try { const col = await getProducts(); await col.estimatedDocumentCount(); db = 'ok'; } catch (_) {}
  res.json({ ok: true, db, uptime: Math.round(process.uptime()) });
});

// ─── robots.txt y sitemap.xml ────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const origin = siteOrigin(req);
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin.html

Sitemap: ${origin}/sitemap.xml
`);
});

app.get('/sitemap.xml', async (req, res) => {
  const origin = siteOrigin(req);
  let urls = [`  <url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`];
  try {
    const col = await getProducts();
    const products = await col.find({ pausado: { $ne: true } }).project({ _id: 1 }).toArray();
    urls = urls.concat(products.map(p =>
      `  <url><loc>${origin}/producto/${p._id}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`));
  } catch (_) {
    // sin DB: solo la home
  }
  res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`);
});


// Escapar texto que se inyecta en HTML/atributos (página OG de producto)
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Página de producto con Open Graph (para preview rico en WhatsApp) ───────
// URL: /producto/:id
// WhatsApp escanea esta página y muestra imagen + título + descripción en el chat
app.get('/producto/:id', async (req, res) => {
  try {
    const col = await getProducts();
    const { ObjectId } = require('mongodb');
    let producto = null;

    // Buscar por ObjectId
    try {
      producto = await col.findOne({ _id: new ObjectId(req.params.id) });
    } catch (_) {
      // Si el id no es un ObjectId válido, buscar de otra manera
      producto = null;
    }

    if (!producto) {
      return res.redirect('/');
    }

    const siteUrl   = siteOrigin(req);

    const nombre    = escapeHtml(producto.nombre      || 'Producto');
    const precio    = escapeHtml(producto.precio      || '');
    const desc      = escapeHtml(producto.descripcion || '');
    const imagen    = escapeHtml(producto.imagen      || '');
    const categoria = escapeHtml(producto.categoria   || '');
    const badge     = producto.badge       === 'new'  ? ' · 🆕 Nuevo'
                    : producto.badge       === 'hot'  ? ' · 🔥 Más vendido'
                    : producto.badge       === 'sale' ? ' · 🏷️ Oferta'
                    : '';

    const ogTitle       = `${nombre} — ${precio}${badge}`;
    const ogDescription = `${desc} | 📦 Envío discreto · Atención 10 a 21 hs · El Lado B Sex Shop Tandil`;
    const ogUrl         = `${siteUrl}/producto/${req.params.id}`;
    const precioNum     = parseInt(String(producto.precio || '').replace(/[^0-9]/g, ''), 10) || 0;
    const waNumber      = '5492494639700';
    const waMsg         = encodeURIComponent(`¡Hola! Quiero consultar por: ${producto.nombre} (${producto.precio})\n${ogUrl}`);

    // Datos estructurados para Google (Product + Offer)
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: producto.nombre || 'Producto',
      description: producto.descripcion || '',
      image: producto.imagen ? [producto.imagen] : [],
      category: producto.categoria || '',
      url: ogUrl,
      ...(producto.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: producto.rating, reviewCount: 1, bestRating: 5 } } : {}),
      offers: {
        '@type': 'Offer',
        price: precioNum,
        priceCurrency: 'ARS',
        availability: 'https://schema.org/InStock',
        url: ogUrl
      }
    });

    // Página real e indexable (antes redirigía al instante y Google la ignoraba)
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ogTitle} — El Lado B · Sex Shop Tandil</title>
  <meta name="description" content="${ogDescription}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">

  <!-- Open Graph (WhatsApp, Facebook, Telegram) -->
  <meta property="og:type"        content="product">
  <meta property="og:site_name"   content="El Lado B · Sex Shop Tandil">
  <meta property="og:url"         content="${ogUrl}">
  <meta property="og:title"       content="${ogTitle}">
  <meta property="og:description" content="${ogDescription}">
  <meta property="og:image"       content="${imagen}">
  <meta property="og:image:width"  content="800">
  <meta property="og:image:height" content="800">
  <meta property="og:locale"      content="es_AR">

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${ogTitle}">
  <meta name="twitter:description" content="${ogDescription}">
  <meta name="twitter:image"      content="${imagen}">

  <link rel="canonical" href="${ogUrl}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0c0c10; color:#eef2f5; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
           min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:24px 20px 48px; }
    .marca { font-family:Georgia,serif; font-size:22px; margin-bottom:4px; }
    .marca em { font-style:italic; color:#ff3366; }
    .marca small { display:block; font-family:monospace; font-size:9px; letter-spacing:3px; text-transform:uppercase; color:rgba(200,215,230,.4); margin-top:2px; text-align:center; }
    .tarjeta { max-width:420px; width:100%; margin-top:28px; background:#111116; border:1px solid rgba(255,255,255,.07); border-radius:10px; overflow:hidden; }
    .tarjeta img { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; background:#18181e; }
    .cuerpo { padding:22px; display:flex; flex-direction:column; gap:10px; }
    .cat { font-family:monospace; font-size:10px; letter-spacing:2.5px; text-transform:uppercase; color:#ff3366; }
    h1 { font-family:Georgia,serif; font-size:26px; line-height:1.15; }
    .precio { font-family:monospace; font-size:26px; color:#66ffcc; }
    .desc { font-size:14px; line-height:1.7; color:rgba(200,215,230,.65); }
    .garantias { font-size:12px; color:rgba(200,215,230,.5); line-height:1.9; border-top:1px solid rgba(255,255,255,.07); padding-top:12px; }
    .btn-wa { display:flex; align-items:center; justify-content:center; gap:8px; background:#25d366; color:#06220f;
              font-weight:800; font-size:13px; letter-spacing:1px; text-transform:uppercase; padding:16px; border-radius:4px; text-decoration:none; margin-top:6px; }
    .btn-tienda { display:block; text-align:center; color:rgba(200,215,230,.6); font-size:13px; text-decoration:none; padding:12px; }
    .btn-tienda:hover, .btn-wa:hover { opacity:.9; }
  </style>
</head>
<body>
  <a href="/" class="marca" style="text-decoration:none;">El <em>Lado B</em><small>Sex Shop · Tandil</small></a>
  <div class="tarjeta">
    ${imagen ? `<img src="${imagen}" alt="${nombre}">` : ''}
    <div class="cuerpo">
      ${categoria ? `<span class="cat">${categoria}</span>` : ''}
      <h1>${nombre}</h1>
      <div class="precio">${precio}</div>
      ${desc ? `<p class="desc">${desc}</p>` : ''}
      <div class="garantias">📦 Packaging 100% discreto, sin logos<br>⚡ Entrega hoy en Tandil · envíos a todo el país<br>💳 Todos los medios de pago</div>
      <a class="btn-wa" href="https://wa.me/${waNumber}?text=${waMsg}">Consultar por WhatsApp</a>
      <a class="btn-tienda" href="/">← Ver toda la tienda</a>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache 5 min para que WhatsApp retenga la preview
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);

  } catch (err) {
    console.error('Error en /producto/:id', err);
    res.redirect('/');
  }
});

// ─── API pública ─────────────────────────────────────────────────────────────

// Helper: productos desde JSON (fallback sin DB)
function getProductsFromJSON() {
  try { return require('./data/products.json').map(({ id, ...p }) => ({ id, ...p })); }
  catch { return []; }
}

// GET /api/products (con búsqueda)
// ?todos=1 incluye también los productos pausados (lo usa el panel admin)
app.get('/api/products', async (req, res) => {
  try {
    const { categoria, search, todos } = req.query;
    const col = await getProducts().catch(() => null);
    if (!col) {
      const lista = getProductsFromJSON();
      return res.json(todos ? lista : lista.filter(p => !p.pausado));
    }

    let query = {};
    if (!todos) query.pausado = { $ne: true };
    if (categoria && categoria !== 'Todo') query.categoria = categoria;
    if (search && search.trim()) {
      const s = search.trim();
      const regex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { nombre: regex },
        { categoria: regex },
        { descripcion: regex },
        { badge: regex }
      ];
    }
    const products = await col.find(query).toArray();
    const result = products.map(({ _id, ...p }) => ({ id: _id, ...p }));
    res.json(result);
  } catch (err) {
    console.error(err);
    // fallback: devolver desde JSON
    res.json(getProductsFromJSON());
  }
});

// Seed automático: si no hay productos, cargar desde data/products.json
async function autoSeed() {
  try {
    const col = await getProducts();
    const count = await col.countDocuments();
    if (count === 0) {
      const products = require('./data/products.json');
      const prepared = products.map(({ id, ...p }) => ({
        ...p,
        creadoEn: new Date()
      }));
      await col.insertMany(prepared);
      console.log(`✅ Seed automático: ${prepared.length} productos cargados`);
    } else {
      console.log(`ℹ️  Seed: ya hay ${count} productos en la DB`);
    }
  } catch (err) {
    console.error('Error en autoSeed:', err.message);
  }
}
autoSeed();

// POST /api/seed (manual)
app.post('/api/seed', async (req, res) => {
  try {
    const col = await getProducts();
    await col.deleteMany({});
    const products = require('./data/products.json');
    const prepared = products.map(({ id, ...p }) => ({
      ...p,
      creadoEn: new Date()
    }));
    await col.insertMany(prepared);
    res.json({ success: true, count: prepared.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al seedear' });
  }
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
  try {
    const col = await getProducts();
    let producto;
    try { producto = await col.findOne({ _id: new ObjectId(req.params.id) }); } catch (_) {}
    if (!producto) return res.status(404).json({ error: 'No encontrado' });
    const { _id, ...data } = producto;
    res.json({ id: _id, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/config
app.get('/api/config', async (req, res) => {
  try {
    const col = await getConfig().catch(() => null);
    if (!col) return res.json({ whatsappNumber: '5492494639700' });
    const cfg = await col.findOne({ _id: 'main' });
    // Nunca exponer credenciales ni datos de recuperación en la API pública
    const { adminPassword, pageAccessPassword, recoveryQuestion, recoveryAnswer, _id, ...publicConfig } = cfg;
    res.json(publicConfig);
  } catch (err) {
    res.json({ whatsappNumber: '5492494639700' });
  }
});

// ─── Middleware auth ─────────────────────────────────────────────────────────
const checkAuth = async (req, res, next) => {
  try {
    const token = req.headers['authorization'];
    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }
    const col = await getConfig();
    const cfg = await col.findOne({ _id: 'main' });
    if (token !== cfg.adminPassword) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Error de autenticación' });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  try {
    const col = await getConfig();
    const cfg = await col.findOne({ _id: 'main' });
    if (password === cfg.adminPassword) {
      res.json({ success: true, token: password });
    } else {
      res.status(401).json({ error: 'Contraseña incorrecta' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── Verificar acceso al panel (dos contraseñas) ────────────────────────────
app.post('/api/verify-admin-access', async (req, res) => {
  const { accessPassword, adminPassword } = req.body;
  try {
    const col = await getConfig();
    const cfg = await col.findOne({ _id: 'main' });
    const storedAccess = (cfg.pageAccessPassword || cfg.adminPassword || '').trim();
    const storedAdmin = (cfg.adminPassword || '').trim();
    const accessOk = accessPassword.trim() === storedAccess;
    const adminOk = adminPassword.trim() === storedAdmin;
    if (accessOk && adminOk) {
      res.json({ success: true, token: storedAdmin });
    } else {
      res.status(401).json({ error: 'Contraseña incorrecta' });
    }
  } catch (err) {
    console.error('LOGIN error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── Recuperación de contraseña ───────────────────────────────────────────────
app.get('/api/recovery-question', async (req, res) => {
  try {
    const col = await getConfig();
    const cfg = await col.findOne({ _id: 'main' });
    res.json({ question: cfg.recoveryQuestion || '' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/recover-password', async (req, res) => {
  try {
    const col = await getConfig();
    const cfg = await col.findOne({ _id: 'main' });
    const userAnswer = (req.body.answer || '').trim().toLowerCase();
    const storedAnswer = (cfg.recoveryAnswer || '').trim().toLowerCase();
    if (userAnswer && storedAnswer && userAnswer === storedAnswer) {
      res.json({ verified: true });
    } else {
      res.status(401).json({ error: 'Respuesta incorrecta' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/reset-passwords', async (req, res) => {
  try {
    const col = await getConfig();
    const cfg = await col.findOne({ _id: 'main' });
    const userAnswer = (req.body.answer || '').trim().toLowerCase();
    const storedAnswer = (cfg.recoveryAnswer || '').trim().toLowerCase();
    if (!userAnswer || !storedAnswer || userAnswer !== storedAnswer) {
      return res.status(401).json({ error: 'Respuesta incorrecta' });
    }
    const { newAccessPassword, newAdminPassword } = req.body;
    if (!newAccessPassword || !newAdminPassword) {
      return res.status(400).json({ error: 'Faltan contraseñas' });
    }
    await col.updateOne(
      { _id: 'main' },
      { $set: { pageAccessPassword: newAccessPassword, adminPassword: newAdminPassword } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── Crear producto ───────────────────────────────────────────────────────────
app.post('/api/products', checkAuth, upload.array('imagenes', 10), async (req, res) => {
  try {
    const col = await getProducts();

    let imagenes = [];
    if (req.files && req.files.length > 0) {
      imagenes = req.files.map(f => `/uploads/${f.filename}`);
    }
    if (req.body.imagenesConservar) {
      try {
        const urls = JSON.parse(req.body.imagenesConservar);
        imagenes = [...imagenes, ...urls];
      } catch (_) {}
    }

    const nuevo = {
      nombre: req.body.nombre,
      categoria: req.body.categoria,
      precio: req.body.precio,
      precioAnterior: req.body.precioAnterior || null,
      descripcion: req.body.descripcion,
      imagen: imagenes[0] || '',
      imagenes: imagenes,
      badge: req.body.badge || '',
      rating: parseFloat(req.body.rating) || 4.5,
      destacado: req.body.destacado === 'true',
      pausado: req.body.pausado === 'true',
      creadoEn: new Date()
    };

    const result = await col.insertOne(nuevo);
    res.json({ id: result.insertedId, ...nuevo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// ─── Editar producto ──────────────────────────────────────────────────────────
app.put('/api/products/:id', checkAuth, upload.array('imagenes', 10), async (req, res) => {
  try {
    const col = await getProducts();
    const id = new ObjectId(req.params.id);

    const existing = await col.findOne({ _id: id });
    if (!existing) return res.status(404).json({ error: 'No encontrado' });

    const fs = require('fs');

    // 1. Determinar imágenes a conservar (enviadas desde el frontend)
    let imagenesFinal = [];
    if (req.body.imagenesConservar) {
      try {
        imagenesFinal = JSON.parse(req.body.imagenesConservar);
      } catch (_) {
        imagenesFinal = [];
      }
    } else {
      // Si no se envió, mantener las existentes (compatibilidad)
      imagenesFinal = existing.imagenes || (existing.imagen ? [existing.imagen] : []);
    }

    // 2. Eliminar del filesystem las imágenes marcadas para remover
    if (req.body.imagenesARemover) {
      try {
        const aRemover = JSON.parse(req.body.imagenesARemover);
        aRemover.forEach(imgPath => {
          const filePath = path.join(__dirname, 'public', imgPath.replace(/^\//, ''));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      } catch (_) {}
    }

    // 3. Agregar imágenes nuevas subidas
    if (req.files && req.files.length > 0) {
      const nuevas = req.files.map(f => `/uploads/${f.filename}`);
      imagenesFinal = [...imagenesFinal, ...nuevas];
    }

    const updated = {
      nombre: req.body.nombre,
      categoria: req.body.categoria,
      precio: req.body.precio,
      precioAnterior: req.body.precioAnterior || null,
      descripcion: req.body.descripcion,
      imagen: imagenesFinal[0] || '',
      imagenes: imagenesFinal,
      badge: req.body.badge || '',
      rating: parseFloat(req.body.rating) || existing.rating,
      destacado: req.body.destacado === 'true',
      pausado: req.body.pausado === 'true'
    };

    await col.updateOne({ _id: id }, { $set: updated });
    res.json({ id: req.params.id, ...updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar producto' });
  }
});

// ─── Eliminar producto ────────────────────────────────────────────────────────
app.delete('/api/products/:id', checkAuth, async (req, res) => {
  try {
    const col = await getProducts();
    const id = new ObjectId(req.params.id);
    const existing = await col.findOne({ _id: id });
    if (!existing) return res.status(404).json({ error: 'No encontrado' });

    // Eliminar archivos de imágenes del filesystem
    const fs = require('fs');
    const todas = existing.imagenes || (existing.imagen ? [existing.imagen] : []);
    todas.forEach(imgPath => {
      const filePath = path.join(__dirname, 'public', imgPath.replace(/^\//, ''));
      if (filePath.startsWith(path.join(__dirname, 'public', 'uploads')) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    const result = await col.deleteOne({ _id: id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// ─── Config admin ─────────────────────────────────────────────────────────────
app.get('/api/admin/config', checkAuth, async (req, res) => {
  try {
    const col = await getConfig();
    const cfg = await col.findOne({ _id: 'main' });
    const { _id, ...data } = cfg;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.put('/api/admin/config', checkAuth, async (req, res) => {
  try {
    const col = await getConfig();
    const current = await col.findOne({ _id: 'main' });
    const updated = { ...current, ...req.body, _id: 'main' };
    await col.replaceOne({ _id: 'main' }, updated);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar config' });
  }
});

// ─── Orders (pedidos) ────────────────────────────────────────────────────────
async function getOrders() {
  const database = await connectDB();
  return database.collection('orders');
}

// POST /api/orders (sin auth — lo usa el frontend público)
app.post('/api/orders', async (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items.slice(0, 50).map(i => ({
      nombre: String((i && i.nombre) || '').slice(0, 200),
      precio: String((i && i.precio) || '').slice(0, 40),
      qty: Math.max(1, Math.min(99, parseInt(i && i.qty, 10) || 1))
    })) : [];
    if (!items.length) return res.status(400).json({ error: 'Pedido vacío' });
    const col = await getOrders();
    const ci = (b.customerInfo && typeof b.customerInfo === 'object') ? b.customerInfo : {};
    const order = {
      items,
      total: String(b.total || '').slice(0, 40),
      paymentMethod: String(b.paymentMethod || '').slice(0, 60),
      customerInfo: {
        nombre: String(ci.nombre || '').slice(0, 120),
        telefono: String(ci.telefono || '').slice(0, 40)
      },
      createdAt: new Date(),
      status: 'pendiente'
    };
    const result = await col.insertOne(order);
    res.json({ id: result.insertedId, ...order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar pedido' });
  }
});

// GET /api/orders (auth required)
app.get('/api/orders', checkAuth, async (req, res) => {
  try {
    const col = await getOrders();
    const orders = await col.find().sort({ createdAt: -1 }).toArray();
    const result = orders.map(({ _id, ...o }) => ({ id: _id, ...o }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// PATCH /api/orders/:id (auth required)
app.patch('/api/orders/:id', checkAuth, async (req, res) => {
  try {
    const col = await getOrders();
    const id = new ObjectId(req.params.id);
    await col.updateOne({ _id: id }, { $set: { status: req.body.status || 'completado' } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

// DELETE /api/orders/:id (auth required)
app.delete('/api/orders/:id', checkAuth, async (req, res) => {
  try {
    const col = await getOrders();
    const id = new ObjectId(req.params.id);
    await col.deleteOne({ _id: id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar pedido' });
  }
});

// ─── Cambiar contraseña ───────────────────────────────────────────────────────
app.post('/api/admin/change-password', checkAuth, async (req, res) => {
  const { newPassword } = req.body;
  try {
    const col = await getConfig();
    await col.updateOne({ _id: 'main' }, { $set: { adminPassword: newPassword } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// ─── Export para Vercel / escuchar en local ───────────────────────────────────
module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Servidor corriendo en http://localhost:${PORT}`));
}