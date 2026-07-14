const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// ─── Resend (email transaccional) ───────────────────────────────────────────
let resendClient = null;
function getResend() {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const { Resend } = require('resend');
    resendClient = new Resend(key);
    return resendClient;
  } catch (_) { return null; }
}
const RESEND_FROM = 'El Lado B <onboarding@resend.dev>';

function emailBase(titleHtml, bodyHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c0c10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">
  <div style="text-align:center;margin-bottom:28px;">
    <a href="/" style="font-family:Georgia,serif;font-size:20px;color:#eef2f5;text-decoration:none;">El <em style="color:#ff3366;font-style:italic;">Lado B</em></a>
  </div>
  <div style="background:#111116;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:28px 24px;">
    ${titleHtml}
    ${bodyHtml}
  </div>
  <div style="text-align:center;margin-top:20px;font-size:11px;color:rgba(200,215,230,.35);">
    Packaging discreto · Envío a todo el país · Atención 10 a 21 hs
  </div>
</div></body></html>`;
}

async function sendEmail(to, subject, html) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({ from: RESEND_FROM, to, subject, html });
  } catch (err) {
    console.error('Error enviando email:', err.message);
  }
}

function siteUrl(req) {
  // Simple: always use production domain
  return 'https://ladobsex.vercel.app';
}

function sendOrderReceivedEmail(order) {
  if (!order.email) return Promise.resolve();
  const num = order.order_number || '';
  const total = order.total || '';
  const addr = order.shipping_address || {};
  const addrText = [addr.street + (addr.number ? ' ' + addr.number : ''), addr.city + ', ' + addr.province, 'CP: ' + addr.postalCode].filter(Boolean).join(' · ');
  const itemCount = (order.items || []).reduce((s, i) => s + (i.qty || 1), 0);
  const link = siteUrl() + '/pedido/' + num + '?email=' + encodeURIComponent(order.email);
  const html = emailBase(
    `<h2 style="color:#eef2f5;font-size:18px;margin:0 0 6px;">Tu pedido <span style="color:#ff3366;">#${num}</span> fue recibido</h2>`,
    `<p style="color:rgba(200,215,230,.7);font-size:14px;line-height:1.7;margin:0 0 18px;">Recibimos tu pedido y estamos esperando la confirmación de tu pago.</p>
     <div style="background:rgba(255,255,255,.04);border-radius:6px;padding:14px;margin-bottom:18px;">
       <div style="color:rgba(200,215,230,.5);font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Resumen</div>
       <div style="color:#eef2f5;font-size:13px;line-height:1.8;">
         <strong style="color:#66ffcc;">${itemCount} producto${itemCount !== 1 ? 's' : ''}</strong> · Total: <strong style="color:#66ffcc;">${total}</strong><br>
         ${addrText ? '📍 ' + addrText : ''}
         ${order.estimated_delivery ? '<br>📦 Estimado: ' + order.estimated_delivery : ''}
       </div>
     </div>
     <a href="${link}" style="display:inline-block;background:#ff3366;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;padding:12px 24px;border-radius:6px;text-decoration:none;">Seguir mi pedido</a>`
  );
  return sendEmail(order.email, 'Tu pedido #' + num + ' fue recibido', html);
}

function sendOrderConfirmedEmail(order) {
  if (!order.email) return Promise.resolve();
  const num = order.order_number || '';
  const link = siteUrl() + '/pedido/' + num + '?email=' + encodeURIComponent(order.email);
  const html = emailBase(
    `<h2 style="color:#eef2f5;font-size:18px;margin:0 0 6px;">Tu pedido <span style="color:#ff3366;">#${num}</span> fue confirmado</h2>`,
    `<p style="color:rgba(200,215,230,.7);font-size:14px;line-height:1.7;margin:0 0 18px;">Tu pago fue verificado. Estamos preparando tu envío.</p>
     <a href="${link}" style="display:inline-block;background:#ff3366;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;padding:12px 24px;border-radius:6px;text-decoration:none;">Seguir mi pedido</a>`
  );
  return sendEmail(order.email, 'Tu pedido #' + num + ' fue confirmado', html);
}

function sendOrderShippedEmail(order) {
  if (!order.email) return Promise.resolve();
  const num = order.order_number || '';
  const tracking = order.tracking_number || '';
  const link = siteUrl() + '/pedido/' + num + '?email=' + encodeURIComponent(order.email);
  const html = emailBase(
    `<h2 style="color:#eef2f5;font-size:18px;margin:0 0 6px;">Tu pedido <span style="color:#ff3366;">#${num}</span> fue enviado</h2>`,
    `<p style="color:rgba(200,215,230,.7);font-size:14px;line-height:1.7;margin:0 0 18px;">Tu pedido está en camino.</p>
     ${tracking ? `<div style="background:rgba(255,255,255,.04);border-radius:6px;padding:14px;margin-bottom:18px;">
       <div style="color:rgba(200,215,230,.5);font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Tracking</div>
       <div style="color:#66ffcc;font-family:monospace;font-size:14px;">${tracking}</div>
     </div>` : ''}
     <a href="${link}" style="display:inline-block;background:#ff3366;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;padding:12px 24px;border-radius:6px;text-decoration:none;">Seguir mi pedido</a>`
  );
  return sendEmail(order.email, 'Tu pedido #' + num + ' fue enviado', html);
}

function sendOrderDeliveredEmail(order) {
  if (!order.email) return Promise.resolve();
  const num = order.order_number || '';
  const link = siteUrl() + '/pedido/' + num + '?email=' + encodeURIComponent(order.email);
  const html = emailBase(
    `<h2 style="color:#eef2f5;font-size:18px;margin:0 0 6px;">Tu pedido <span style="color:#ff3366;">#${num}</span> fue entregado</h2>`,
    `<p style="color:rgba(200,215,230,.7);font-size:14px;line-height:1.7;margin:0 0 18px;">Tu pedido ya fue entregado. Gracias por comprar con nosotros.</p>
     <a href="${link}" style="display:inline-block;background:#ff3366;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;padding:12px 24px;border-radius:6px;text-decoration:none;">Ver detalles del pedido</a>`
  );
  return sendEmail(order.email, 'Tu pedido #' + num + ' fue entregado', html);
}

function sendOrderCancelledEmail(order) {
  if (!order.email) return Promise.resolve();
  const num = order.order_number || '';
  const reason = order.delay_reason || '';
  const waNumber = '5492494639700';
  const waLink = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent('Hola, quiero consultar por mi pedido #' + num);
  const html = emailBase(
    `<h2 style="color:#eef2f5;font-size:18px;margin:0 0 6px;">Tu pedido <span style="color:#ff3366;">#${num}</span> fue cancelado</h2>`,
    `<p style="color:rgba(200,215,230,.7);font-size:14px;line-height:1.7;margin:0 0 18px;">Tu pedido fue cancelado.${reason ? '<br>Motivo: ' + reason : ''}</p>
     <p style="color:rgba(200,215,230,.5);font-size:13px;margin:0 0 18px;">Si tenés dudas, escribinos por WhatsApp.</p>
     <a href="${waLink}" style="display:inline-block;background:#25d366;color:#06220f;font-weight:700;font-size:12px;letter-spacing:1px;padding:12px 24px;border-radius:6px;text-decoration:none;">Consultar por WhatsApp</a>`
  );
  return sendEmail(order.email, 'Tu pedido #' + num + ' fue cancelado', html);
}

function sendOrderDelayedEmail(order) {
  if (!order.email) return Promise.resolve();
  const num = order.order_number || '';
  const reason = order.delay_reason || '';
  const link = siteUrl() + '/pedido/' + num + '?email=' + encodeURIComponent(order.email);
  const html = emailBase(
    `<h2 style="color:#eef2f5;font-size:18px;margin:0 0 6px;">Tu pedido <span style="color:#ff3366;">#${num}</span> está demorado</h2>`,
    `<p style="color:rgba(200,215,230,.7);font-size:14px;line-height:1.7;margin:0 0 18px;">Tu pedido tarda más de lo previsto.${reason ? '<br>Motivo: ' + reason : ''}</p>
     <p style="color:rgba(200,215,230,.5);font-size:13px;margin:0 0 18px;">Seguimos trabajando para que llegue lo antes posible. Si tenés dudas, escribinos por WhatsApp.</p>
     <a href="${link}" style="display:inline-block;background:#ff3366;color:#fff;font-weight:700;font-size:12px;letter-spacing:1px;padding:12px 24px;border-radius:6px;text-decoration:none;">Seguir mi pedido</a>`
  );
  return sendEmail(order.email, 'Tu pedido #' + num + ' está demorado', html);
}

function sendEmailForStatus(order) {
  const status = order.status;
  if (status === 'confirmed') return sendOrderConfirmedEmail(order);
  if (status === 'shipped') return sendOrderShippedEmail(order);
  if (status === 'delivered') return sendOrderDeliveredEmail(order);
  if (status === 'cancelled') return sendOrderCancelledEmail(order);
  if (status === 'delayed') return sendOrderDelayedEmail(order);
  return Promise.resolve();
}

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

// ─── Rate limiter (in-memory, por IP) ──────────────────────────────────────
const rateLimitStore = new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
             || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = rateLimitStore.get(ip);
    if (!rec || now > rec.reset) {
      rateLimitStore.set(ip, { count: 1, reset: now + windowMs });
      return next();
    }
    rec.count++;
    if (rec.count > maxRequests) {
      return res.status(429).json({ error: 'Demasiadas solicitudes, intentá más tarde' });
    }
    next();
  };
}
// Limpiar entradas expiradas cada 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimitStore) { if (now > rec.reset) rateLimitStore.delete(ip); }
}, 5 * 60 * 1000);

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
  if (!MONGO_URI) {
    console.log('ℹ️  MONGO_URI no definida, operando sin DB');
    return null;
  }
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
        '⚡ Entrega hoy mismo',
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
async function getOrders() {
  const database = await connectDB();
  return database.collection('orders');
}
async function getShippingZones() {
  const database = await connectDB();
  return database.collection('shipping_zones');
}
async function getCounters() {
  const database = await connectDB();
  return database.collection('counters');
}

// ─── Order number atómico: LD-00001 ─────────────────────────────────────────
async function getNextOrderNumber() {
  const col = await getCounters();
  const result = await col.findOneAndUpdate(
    { _id: 'orders' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = (result && result.seq) ? result.seq : 1;
  return 'LD-' + String(seq).padStart(5, '0');
}

// ─── Seed: zonas de envío por defecto ───────────────────────────────────────
const DEFAULT_SHIPPING_ZONES = [
  { zone_name: 'CABA',                    cp_from: 'C1000', cp_to: 'C1499', price: 0,    estimated_days: 1, activa: true },
  { zone_name: 'GBA Norte',               cp_from: 'B1601', cp_to: 'B1699', price: 0,    estimated_days: 1, activa: true },
  { zone_name: 'GBA Sur',                 cp_from: 'B1800', cp_to: 'B1899', price: 0,    estimated_days: 1, activa: true },
  { zone_name: 'Buenos Aires Centro',     cp_from: 'B2000', cp_to: 'B2999', price: 1500, estimated_days: 2, activa: true },
  { zone_name: 'Buenos Aires Costa',      cp_from: 'B7000', cp_to: 'B9499', price: 1500, estimated_days: 2, activa: true },
  { zone_name: 'Córdoba',                 cp_from: 'X5000', cp_to: 'X5999', price: 2000, estimated_days: 3, activa: true },
  { zone_name: 'Santa Fe',                cp_from: 'S2000', cp_to: 'S3999', price: 2000, estimated_days: 3, activa: true },
  { zone_name: 'Mendoza',                 cp_from: 'M5000', cp_to: 'M5999', price: 2500, estimated_days: 4, activa: true },
  { zone_name: 'Interior General',        cp_from: '0000',  cp_to: 'Z9999', price: 2500, estimated_days: 4, activa: true }
];

async function seedDefaultShippingZones() {
  try {
    const col = await getShippingZones().catch(() => null);
    if (!col) return;
    const count = await col.countDocuments();
    if (count === 0) {
      await col.insertMany(DEFAULT_SHIPPING_ZONES);
      console.log('✅ Zonas de envío por defecto creadas');
    }
  } catch (_) {}
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
  const imgs = p.imagenes && p.imagenes.length ? p.imagenes : (p.imagen ? [p.imagen] : []);
  const img = escapeHtml(imgs[0] || '');
  const rating = p.rating != null ? p.rating : 4.5;
  const badgeTxt = p.badge === 'new' ? 'Nuevo' : p.badge === 'hot' ? '🔥 Hot' : p.badge === 'sale' ? 'Oferta' : '';
  const desc = (p.descripcion || '');
  const fotosCountTxt = imgs.length > 1 ? `<span class="card-fotos-count">📷 ${imgs.length}</span>` : '';
  return `<article class="card" data-id="${escapeHtml(String(p.id ?? ''))}">
    <div class="card-thumb"><img src="${img}" alt="${escapeHtml(p.nombre || 'Producto')}" loading="lazy" decoding="async">${badgeTxt ? `<span class="card-badge b-${p.badge}">${badgeTxt}</span>` : ''}${fotosCountTxt}</div>
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
    const ogDescription = `${desc} | 📦 Envío discreto · Atención 10 a 21 hs · El Lado B Sex Shop`;
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
  <title>${ogTitle} — El Lado B · Sex Shop</title>
  <meta name="description" content="${ogDescription}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">

  <!-- Open Graph (WhatsApp, Facebook, Telegram) -->
  <meta property="og:type"        content="product">
  <meta property="og:site_name"   content="El Lado B · Sex Shop">
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
  <a href="/" class="marca" style="text-decoration:none;">El <em>Lado B</em><small>Sex Shop</small></a>
  <div class="tarjeta">
    ${imagen ? `<img src="${imagen}" alt="${nombre}">` : ''}
    <div class="cuerpo">
      ${categoria ? `<span class="cat">${categoria}</span>` : ''}
      <h1>${nombre}</h1>
      <div class="precio">${precio}</div>
      ${desc ? `<p class="desc">${desc}</p>` : ''}
      <div class="garantias">📦 Packaging 100% discreto, sin logos<br>⚡ Entrega hoy mismo · envíos a todo el país<br>💳 Todos los medios de pago</div>
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
    const col = await getProducts().catch(() => null);
    if (!col) return;
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
seedDefaultShippingZones();

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

// ─── API pública: zonas y cálculo de envío ──────────────────────────────────

// GET /api/shipping/zones (público, solo zonas activas)
app.get('/api/shipping/zones', async (req, res) => {
  try {
    const col = await getShippingZones().catch(() => null);
    if (!col) return res.json(DEFAULT_SHIPPING_ZONES.filter(z => z.activa));
    const zones = await col.find({ activa: true }).toArray();
    res.json(zones.map(({ _id, ...z }) => z));
  } catch (err) {
    res.json(DEFAULT_SHIPPING_ZONES.filter(z => z.activa));
  }
});

// GET /api/shipping/calculate?cp=XXXX&subtotal=NNN
app.get('/api/shipping/calculate', rateLimit(20, 60 * 1000), async (req, res) => {
  try {
    const cp = String(req.query.cp || '').trim();
    const subtotal = parseFloat(req.query.subtotal) || 0;
    if (!cp || cp.length < 2) {
      return res.status(400).json({ error: 'Código postal requerido' });
    }

    const cpUpper = cp.toUpperCase();

    // Intentar desde DB, fallback a defaults
    let zones = DEFAULT_SHIPPING_ZONES;
    try {
      const col = await getShippingZones();
      const dbZones = await col.find({ activa: true }).toArray();
      if (dbZones.length) zones = dbZones;
    } catch (_) {}

    // Buscar zona por prefijo del CP (matchea los primeros caracteres)
    const match = zones.find(z => {
      const from = (z.cp_from || '').toUpperCase();
      const to = (z.cp_to || '').toUpperCase();
      return cpUpper >= from && cpUpper <= to;
    }) || zones.find(z => z.zone_name === 'Interior General');

    if (!match) {
      return res.json({ zone: null, shipping_cost: 0, estimated_days: null, free_shipping: false });
    }

    // Envío gratis si subtotal >= 50.000
    const FREE_THRESHOLD = 50000;
    const freeShipping = subtotal >= FREE_THRESHOLD;
    const cost = freeShipping ? 0 : (match.price || 0);

    // Calcular fecha estimada (días hábiles aproximados)
    let estimatedDate = null;
    if (match.estimated_days) {
      const d = new Date();
      let added = 0;
      while (added < match.estimated_days) {
        d.setDate(d.getDate() + 1);
        const day = d.getDay();
        if (day !== 0 && day !== 6) added++;
      }
      estimatedDate = d.toISOString().split('T')[0];
    }

    res.json({
      zone: match.zone_name,
      shipping_cost: cost,
      estimated_days: match.estimated_days || null,
      estimated_date: estimatedDate,
      free_shipping: freeShipping
    });
  } catch (err) {
    console.error('Error en /api/shipping/calculate:', err);
    res.status(500).json({ error: 'Error al calcular envío' });
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

// GET /api/admin/shipping/zones (auth — CRUD completo para admin)
app.get('/api/admin/shipping/zones', checkAuth, async (req, res) => {
  try {
    const col = await getShippingZones().catch(() => null);
    if (!col) return res.json(DEFAULT_SHIPPING_ZONES);
    const zones = await col.find().sort({ cp_from: 1 }).toArray();
    res.json(zones.map(({ _id, ...z }) => ({ id: _id, ...z })));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener zonas' });
  }
});

app.post('/api/admin/shipping/zones', checkAuth, async (req, res) => {
  try {
    const col = await getShippingZones();
    const zone = {
      zone_name: String(req.body.zone_name || '').slice(0, 80),
      cp_from: String(req.body.cp_from || '').toUpperCase().slice(0, 10),
      cp_to: String(req.body.cp_to || '').toUpperCase().slice(0, 10),
      price: Math.max(0, parseInt(req.body.price, 10) || 0),
      estimated_days: Math.max(1, parseInt(req.body.estimated_days, 10) || 1),
      activa: req.body.activa !== false
    };
    if (!zone.zone_name || !zone.cp_from || !zone.cp_to) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const result = await col.insertOne(zone);
    res.json({ id: result.insertedId, ...zone });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear zona' });
  }
});

app.put('/api/admin/shipping/zones/:id', checkAuth, async (req, res) => {
  try {
    const col = await getShippingZones();
    const id = new ObjectId(req.params.id);
    const updates = {};
    if (req.body.zone_name !== undefined) updates.zone_name = String(req.body.zone_name).slice(0, 80);
    if (req.body.cp_from !== undefined) updates.cp_from = String(req.body.cp_from).toUpperCase().slice(0, 10);
    if (req.body.cp_to !== undefined) updates.cp_to = String(req.body.cp_to).toUpperCase().slice(0, 10);
    if (req.body.price !== undefined) updates.price = Math.max(0, parseInt(req.body.price, 10) || 0);
    if (req.body.estimated_days !== undefined) updates.estimated_days = Math.max(1, parseInt(req.body.estimated_days, 10) || 1);
    if (req.body.activa !== undefined) updates.activa = !!req.body.activa;
    await col.updateOne({ _id: id }, { $set: updates });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar zona' });
  }
});

app.delete('/api/admin/shipping/zones/:id', checkAuth, async (req, res) => {
  try {
    const col = await getShippingZones();
    await col.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar zona' });
  }
});

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

// ─── Orders (pedidos) ──────────────────────────────────────────────────────

// POST /api/orders (sin auth — lo usa el frontend público)
app.post('/api/orders', rateLimit(10, 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};

    // ── Validar items ──
    const items = Array.isArray(b.items) ? b.items.slice(0, 50).map(i => ({
      product_id: String((i && i.product_id) || '').slice(0, 60),
      nombre:     String((i && i.nombre) || '').slice(0, 200),
      precio:     String((i && i.precio) || '').slice(0, 40),
      precioNum:  parseFloat(String((i && i.precio) || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0,
      imagen:     String((i && i.imagen) || '').slice(0, 500),
      qty:        Math.max(1, Math.min(99, parseInt(i && i.qty, 10) || 1))
    })) : [];
    if (!items.length) return res.status(400).json({ error: 'Pedido vacío' });

    // ── Validar email ──
    const email = String(b.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // ── Validar dirección ──
    const addr = b.shipping_address || {};
    const shipping_address = {
      street:      String(addr.street || '').slice(0, 200),
      number:      String(addr.number || '').slice(0, 20),
      floor:       String(addr.floor || '').slice(0, 10),
      dept:        String(addr.dept || '').slice(0, 10),
      city:        String(addr.city || '').slice(0, 120),
      province:    String(addr.province || '').slice(0, 80),
      postalCode:  String(addr.postalCode || '').slice(0, 10),
      instructions:String(addr.instructions || '').slice(0, 300)
    };
    if (!shipping_address.street || !shipping_address.city || !shipping_address.province || !shipping_address.postalCode) {
      return res.status(400).json({ error: 'Faltan datos de dirección (calle, ciudad, provincia, CP)' });
    }

    // ── Calcular envío server-side ──
    const subtotal = items.reduce((sum, i) => sum + (i.precioNum * i.qty), 0);
    let shippingZone = null;
    let shippingCost = 0;
    let estimatedDays = null;
    let estimatedDate = null;

    try {
      const zones = DEFAULT_SHIPPING_ZONES;
      const cpUpper = shipping_address.postalCode.toUpperCase();
      const match = zones.find(z => {
        const from = (z.cp_from || '').toUpperCase();
        const to = (z.cp_to || '').toUpperCase();
        return cpUpper >= from && cpUpper <= to;
      }) || zones.find(z => z.zone_name === 'Interior General');
      if (match) {
        shippingZone = match.zone_name;
        const FREE_THRESHOLD = 50000;
        shippingCost = subtotal >= FREE_THRESHOLD ? 0 : (match.price || 0);
        estimatedDays = match.estimated_days || null;
        if (estimatedDays) {
          const d = new Date(); let added = 0;
          while (added < estimatedDays) { d.setDate(d.getDate() + 1); const day = d.getDay(); if (day !== 0 && day !== 6) added++; }
          estimatedDate = d.toISOString().split('T')[0];
        }
      }
    } catch (_) {}

    // ── Generar número de orden atómico ──
    const order_number = await getNextOrderNumber();

    // ── Customer info (legacy compat) ──
    const ci = (b.customerInfo && typeof b.customerInfo === 'object') ? b.customerInfo : {};

    // ── Tracking events iniciales ──
    const now = new Date();
    const tracking_events = [
      { date: now.toISOString(), status: 'received', description: 'Pedido recibido, esperando confirmación de pago' }
    ];

    // ── Construir order ──
    const order = {
      order_number,
      items,
      email,
      customerInfo: {
        nombre:   String(ci.nombre || '').slice(0, 120),
        telefono: String(ci.telefono || '').slice(0, 40)
      },
      shipping_address,
      shippingZone,
      shippingCost,
      subtotal,
      total: String(b.total || (subtotal + shippingCost)).slice(0, 40),
      paymentMethod: String(b.paymentMethod || '').slice(0, 60),
      status: 'pending_payment',
      tracking_events,
      tracking_number: null,
      delay_reason: null,
      estimated_delivery: estimatedDate,
      createdAt: now
    };

    const col = await getOrders();
    const result = await col.insertOne(order);
    sendOrderReceivedEmail(order).catch(() => {});
    res.json({ id: result.insertedId, order_number, ...order });
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

// PATCH /api/orders/:id (auth required — admin gestiona estado)
app.patch('/api/orders/:id', checkAuth, async (req, res) => {
  try {
    const col = await getOrders();
    const id = new ObjectId(req.params.id);
    const order = await col.findOne({ _id: id });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const updates = {};
    const b = req.body || {};

    if (b.status) updates.status = b.status;
    if (b.tracking_number !== undefined) updates.tracking_number = String(b.tracking_number || '').slice(0, 100);
    if (b.delay_reason !== undefined) updates.delay_reason = String(b.delay_reason || '').slice(0, 300);

    // Agregar tracking event si cambió el estado
    if (b.status && b.status !== order.status) {
      const eventDesc = b.event_description || getStatusDescription(b.status);
      const newEvent = { date: new Date().toISOString(), status: b.status, description: eventDesc };
      await col.updateOne({ _id: id }, {
        $set: updates,
        $push: { tracking_events: newEvent }
      });
      sendEmailForStatus({ ...order, ...updates, email: order.email, order_number: order.order_number }).catch(() => {});
    } else {
      await col.updateOne({ _id: id }, { $set: updates });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

// POST /api/admin/orders/:id/resend-email (auth required)
app.post('/api/admin/orders/:id/resend-email', checkAuth, async (req, res) => {
  try {
    const col = await getOrders();
    const order = await col.findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!order.email) return res.status(400).json({ error: 'El pedido no tiene email' });
    await sendEmailForStatus(order);
    res.json({ success: true });
  } catch (err) {
    console.error('Error reenviando email:', err);
    res.status(500).json({ error: 'Error al reenviar email' });
  }
});

function getStatusDescription(status) {
  const descriptions = {
    pending_payment: 'Esperando confirmación de pago',
    confirmed:       'Pago confirmado, preparando envío',
    shipped:         'Pedido despachado',
    delivered:       'Pedido entregado',
    cancelled:       'Pedido cancelado'
  };
  return descriptions[status] || 'Estado actualizado';
}

// DELETE /api/orders/:id (auth required)
app.delete('/api/orders/:id', checkAuth, async (req, res) => {
  try {
    const col = await getOrders();
    await col.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar pedido' });
  }
});

// ─── Página de seguimiento /pedido/:order_number ────────────────────────────
app.get('/pedido/:order_number', rateLimit(10, 60 * 1000), async (req, res) => {
  try {
    const orderNumber = String(req.params.order_number || '').toUpperCase().trim();
    if (!/^LD-\d{5}$/.test(orderNumber)) {
      return res.status(400).send('<!DOCTYPE html><html><head><title>Pedido no encontrado</title></head><body style="background:#0c0c10;color:#eef2f5;font-family:sans-serif;text-align:center;padding:80px 20px"><h1>Pedido no encontrado</h1><p style="color:rgba(200,215,230,.6)">Formato de número inválido. Debe ser LD-XXXXX.</p><a href="/" style="color:#ff3366">← Volver a la tienda</a></body></html>');
    }

    const col = await getOrders();
    const order = await col.findOne({ order_number: orderNumber });
    if (!order) {
      return res.status(404).send('<!DOCTYPE html><html><head><title>Pedido no encontrado</title></head><body style="background:#0c0c10;color:#eef2f5;font-family:sans-serif;text-align:center;padding:80px 20px"><h1>Pedido no encontrado</h1><p style="color:rgba(200,215,230,.6)">No encontramos un pedido con ese número.</p><a href="/" style="color:#ff3366">← Volver a la tienda</a></body></html>');
    }

    // Verificar email si se provee (query ?email=)
    const queryEmail = String(req.query.email || '').trim().toLowerCase();
    const emailMatch = queryEmail && queryEmail === (order.email || '').toLowerCase();

    const waNumber = '5492494639700';

    // Mapeo de estados para UI
    const statusLabels = {
      pending_payment: 'Esperando pago',
      confirmed: 'Pago confirmado',
      shipped: 'En camino',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
      delayed: 'Demorado'
    };
    const statusIcons = {
      pending_payment: '💳',
      confirmed: '✅',
      shipped: '🚚',
      delivered: '📦',
      cancelled: '❌',
      delayed: '⚠️'
    };

    const statusOrder = ['pending_payment', 'confirmed', 'shipped', 'delivered'];
    const currentIdx = order.status === 'delayed' ? -1 : statusOrder.indexOf(order.status);
    const isCancelled = order.status === 'cancelled';
    const isDelayed = order.status === 'delayed';

    // Construir timeline
    const timelineHtml = statusOrder.map((st, i) => {
      let cls = 'timeline-step';
      if (isCancelled) cls += (st === 'pending_payment') ? ' active' : '';
      else if (isDelayed && i <= currentIdx) cls += i === currentIdx ? ' active delayed' : ' done';
      else if (i < currentIdx) cls += ' done';
      else if (i === currentIdx) cls += ' active';
      return `<div class="${cls}">
        <div class="step-icon">${statusIcons[st]}</div>
        <div class="step-label">${statusLabels[st]}</div>
      </div>`;
    }).join('');

    // Events
    const eventsHtml = (order.tracking_events || []).slice().reverse().map(ev => {
      const d = new Date(ev.date);
      const dateStr = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return `<div class="event-row">
        <div class="event-date">${dateStr} ${timeStr}</div>
        <div class="event-desc">${escapeHtml(ev.description || ev.status)}</div>
      </div>`;
    }).join('');

    // Productos (solo si email matchea)
    let itemsHtml = '';
    if (emailMatch) {
      itemsHtml = (order.items || []).map(it => `
        <div class="order-item">
          ${it.imagen ? `<img src="${escapeHtml(it.imagen)}" alt="${escapeHtml(it.nombre)}" class="item-img">` : '<div class="item-img item-img-placeholder"></div>'}
          <div class="item-info">
            <div class="item-name">${escapeHtml(it.nombre)}</div>
            <div class="item-qty">x${it.qty}</div>
          </div>
          <div class="item-price">${escapeHtml(it.precio)}</div>
        </div>
      `).join('');
    }

    // Dirección (solo si email matchea)
    let addressHtml = '';
    if (emailMatch && order.shipping_address) {
      const a = order.shipping_address;
      const parts = [a.street + (a.number ? ' ' + a.number : '')];
      if (a.floor) parts.push('Piso ' + a.floor + (a.dept ? ' ' + a.dept : ''));
      parts.push(a.city + ', ' + a.province);
      parts.push('CP: ' + a.postalCode);
      if (a.instructions) parts.push('Indicaciones: ' + a.instructions);
      addressHtml = `<div class="info-box"><div class="info-title">📍 Dirección de envío</div><div class="info-content">${parts.map(escapeHtml).join('<br>')}</div></div>`;
    }

    // Pago (solo si email matchea)
    let paymentHtml = '';
    if (emailMatch) {
      let paymentContent = '<strong>Método:</strong> ' + escapeHtml(order.paymentMethod || 'Transferencia');
      paymentContent += '<br><strong>Estado:</strong> ' + escapeHtml(statusLabels[order.status] || order.status);
      if (order.paymentMethod === 'transferencia' || !order.paymentMethod) {
        paymentContent += `<br><br><strong>CBU:</strong> <code>000000310001000123456789</code>`;
        paymentContent += `<br><strong>Alias:</strong> <code>ELLADOB.SHOP</code>`;
        paymentContent += `<br><br>Enviá el comprobante por WhatsApp para confirmar tu pedido.`;
      }
      const waMsg = encodeURIComponent(`Hola! Comprobante de pago para pedido ${order.order_number}`);
      paymentContent += `<br><br><a href="https://wa.me/${waNumber}?text=${waMsg}" class="btn-wa-sm">📲 Enviar comprobante por WhatsApp</a>`;
      paymentHtml = `<div class="info-box"><div class="info-title">💳 Pago</div><div class="info-content">${paymentContent}</div></div>`;
    }

    // Envío
    let shippingHtml = '';
    if (emailMatch && order.shippingZone) {
      shippingHtml = `<div class="info-box"><div class="info-title">🚚 Envío</div><div class="info-content">
        <strong>Zona:</strong> ${escapeHtml(order.shippingZone)}<br>
        <strong>Costo:</strong> ${order.shippingCost === 0 ? '<span style="color:#66ffcc">¡Gratis!</span>' : '$' + order.shippingCost.toLocaleString('es-AR')}<br>
        ${order.estimated_delivery ? '<strong>Estimado:</strong> ' + escapeHtml(order.estimated_delivery) : ''}
      </div></div>`;
    }

    const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent('Consulta sobre pedido ' + orderNumber)}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pedido ${escapeHtml(orderNumber)} — El Lado B</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0c0c10; color:#eef2f5; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; min-height:100vh; padding:24px 16px 60px; }
    .container { max-width:480px; margin:0 auto; }
    .header { text-align:center; margin-bottom:32px; }
    .brand { font-family:Georgia,serif; font-size:20px; color:#eef2f5; text-decoration:none; }
    .brand em { color:#ff3366; font-style:italic; }
    .order-num { font-family:monospace; font-size:14px; color:rgba(200,215,230,.5); margin-top:8px; letter-spacing:2px; }
    .status-badge { display:inline-block; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:600; margin-top:12px; background:rgba(255,51,102,.15); color:#ff3366; }
    .status-badge.confirmed { background:rgba(102,255,204,.15); color:#66ffcc; }
    .status-badge.shipped { background:rgba(37,211,102,.15); color:#25d366; }
    .status-badge.delivered { background:rgba(102,255,204,.15); color:#66ffcc; }
    .status-badge.cancelled { background:rgba(255,80,80,.15); color:#ff5050; }
    .timeline { display:flex; justify-content:space-between; margin:28px 0; position:relative; }
    .timeline::before { content:''; position:absolute; top:18px; left:10%; right:10%; height:2px; background:rgba(255,255,255,.1); }
    .timeline-step { display:flex; flex-direction:column; align-items:center; flex:1; position:relative; z-index:1; opacity:.35; }
    .timeline-step.done { opacity:.7; }
    .timeline-step.active { opacity:1; }
    .step-icon { width:36px; height:36px; border-radius:50%; background:#111116; border:2px solid rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center; font-size:16px; }
    .timeline-step.active .step-icon { border-color:#ff3366; background:rgba(255,51,102,.15); }
    .timeline-step.done .step-icon { border-color:#66ffcc; background:rgba(102,255,204,.15); }
    .step-label { font-size:10px; margin-top:6px; text-align:center; color:rgba(200,215,230,.6); }
    .info-box { background:#111116; border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:16px; margin-bottom:16px; }
    .info-title { font-size:14px; font-weight:600; margin-bottom:10px; }
    .info-content { font-size:13px; line-height:1.8; color:rgba(200,215,230,.7); }
    .info-content code { background:rgba(255,255,255,.08); padding:2px 6px; border-radius:4px; font-size:12px; }
    .order-item { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.05); }
    .order-item:last-child { border-bottom:none; }
    .item-img { width:48px; height:48px; border-radius:8px; object-fit:cover; background:#18181e; }
    .item-img-placeholder { display:flex; align-items:center; justify-content:center; font-size:20px; }
    .item-info { flex:1; }
    .item-name { font-size:13px; font-weight:500; }
    .item-qty { font-size:11px; color:rgba(200,215,230,.5); }
    .item-price { font-family:monospace; font-size:13px; color:#66ffcc; }
    .event-row { padding:8px 0; border-bottom:1px solid rgba(255,255,255,.05); }
    .event-row:last-child { border-bottom:none; }
    .event-date { font-size:11px; color:rgba(200,215,230,.4); }
    .event-desc { font-size:13px; margin-top:2px; }
    .btn-wa-sm { display:inline-block; background:#25d366; color:#06220f; font-size:12px; font-weight:700; padding:8px 16px; border-radius:6px; text-decoration:none; margin-top:8px; }
    .btn-wa-lg { display:flex; align-items:center; justify-content:center; gap:8px; background:#25d366; color:#06220f; font-weight:800; font-size:14px; padding:16px; border-radius:10px; text-decoration:none; margin-top:20px; }
    .email-prompt { background:#111116; border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:20px; text-align:center; margin:20px 0; }
    .email-prompt p { font-size:13px; color:rgba(200,215,230,.6); margin-bottom:12px; }
    .email-form { display:flex; gap:8px; }
    .email-form input { flex:1; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:10px 12px; color:#eef2f5; font-size:13px; }
    .email-form button { background:#ff3366; color:#fff; border:none; border-radius:8px; padding:10px 16px; font-weight:600; font-size:13px; cursor:pointer; }
    .back-link { display:block; text-align:center; margin-top:24px; font-size:13px; color:rgba(200,215,230,.5); text-decoration:none; }
    .section-title { font-size:12px; text-transform:uppercase; letter-spacing:2px; color:rgba(200,215,230,.4); margin:20px 0 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="/" class="brand">El <em>Lado B</em></a>
      <div class="order-num">${escapeHtml(orderNumber)}</div>
      <div class="status-badge ${order.status}">${statusIcons[order.status] || ''} ${statusLabels[order.status] || order.status}</div>
    </div>

    <div class="timeline">${timelineHtml}</div>

    ${!emailMatch ? `
      <div class="email-prompt">
        <p>Ingresá tu email para ver los detalles del pedido, dirección y datos de pago.</p>
        <form class="email-form" onsubmit="event.preventDefault(); window.location.href='/pedido/${escapeHtml(orderNumber)}?email='+encodeURIComponent(this.email.value)">
          <input type="email" name="email" placeholder="tu@email.com" required>
          <button type="submit">Verificar</button>
        </form>
      </div>
    ` : ''}

    <div class="section-title">Seguimiento</div>
    <div class="info-box">
      ${eventsHtml || '<div class="info-content" style="color:rgba(200,215,230,.4)">Sin eventos registrados</div>'}
    </div>

    ${emailMatch ? `
      ${itemsHtml ? '<div class="section-title">Productos</div><div class="info-box">' + itemsHtml + '</div>' : ''}
      ${addressHtml}
      ${shippingHtml}
      ${paymentHtml}
      <div class="info-box"><div class="info-title">📧 Email</div><div class="info-content">${escapeHtml(order.email)}</div></div>
    ` : ''}

    <a href="${waLink}" class="btn-wa-lg">📲 Consultar por WhatsApp</a>
    <a href="/" class="back-link">← Volver a la tienda</a>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html);
  } catch (err) {
    console.error('Error en /pedido/:order_number', err);
    res.status(500).send('<!DOCTYPE html><html><head><title>Error</title></head><body style="background:#0c0c10;color:#eef2f5;font-family:sans-serif;text-align:center;padding:80px 20px"><h1>Error del servidor</h1><a href="/" style="color:#ff3366">← Volver</a></body></html>');
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

// ─── Test endpoint temporal (quitar después) ──────────────────────────────────
app.get('/api/test-email', async (req, res) => {
  const resend = getResend();
  if (!resend) return res.json({ ok: false, error: 'Resend no inicializado — falta RESEND_API_KEY o el paquete no está instalado' });
  try {
    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: 'araujosantiago879@gmail.com',
      subject: 'Test El Lado B',
      html: '<h1 style="color:#ff3366;">Funciona!</h1><p>Si ves esto, el envío está OK.</p>'
    });
    res.json({ ok: true, result });
  } catch (err) {
    res.json({ ok: false, error: err.message, statusCode: err.statusCode });
  }
});

// ─── Export para Vercel / escuchar en local ───────────────────────────────────
module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Servidor corriendo en http://localhost:${PORT}`));
}