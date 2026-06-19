const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ─── Admin panel (protegido) ────────────────────────────────────────────────
app.get('/admin.html', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Carpetas públicas
app.use(express.static(path.join(__dirname, 'public')));

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
        lunesViernes: '9:00 — 23:00 hs',
        sabados: '9:00 — 23:00 hs',
        domingos: '10:00 — 22:00 hs',
        feriados: '10:00 — 21:00 hs'
      },
      tickerItems: [
        '📦 Packaging discreto',
        '⚡ Entrega hoy en Tandil',
        '💳 Todos los medios de pago',
        '📲 Atención 9 a 23 hs',
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

// ─── Ruta principal ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

    const siteUrl   = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`;

    const nombre    = producto.nombre      || 'Producto';
    const precio    = producto.precio      || '';
    const desc      = producto.descripcion || '';
    const imagen    = producto.imagen      || '';
    const categoria = producto.categoria   || '';
    const badge     = producto.badge       === 'new'  ? ' · 🆕 Nuevo'
                    : producto.badge       === 'hot'  ? ' · 🔥 Más vendido'
                    : producto.badge       === 'sale' ? ' · 🏷️ Oferta'
                    : '';

    const ogTitle       = `${nombre} — ${precio}${badge}`;
    const ogDescription = `${desc} | 📦 Envío discreto · Atención 9 a 23 hs · El Lado B Sex Shop Tandil`;
    const ogUrl         = `${siteUrl}/producto/${req.params.id}`;

    // HTML mínimo con todas las meta OG que WhatsApp necesita
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ogTitle} — El Lado B · Sex Shop Tandil</title>

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
  <meta name="twitter:image"       content="${imagen}">

  <!-- WhatsApp usa canonical para identificar la URL -->
  <link rel="canonical" href="${ogUrl}">

  <!-- Redirige al visitante humano a la tienda -->
  <meta http-equiv="refresh" content="0; url=/">
  <style>
    body { margin:0; background:#050508; color:#eef2f5; font-family:sans-serif;
           display:flex; align-items:center; justify-content:center; min-height:100vh;
           flex-direction:column; gap:16px; text-align:center; padding:20px; }
    img  { max-width:260px; border-radius:4px; }
    h1   { font-size:20px; margin:0; }
    p    { color:#66ffcc; font-size:18px; font-weight:700; margin:0; }
    a    { color:#ff3366; }
  </style>
</head>
<body>
  <img src="${imagen}" alt="${nombre}">
  <h1>${nombre}</h1>
  <p>${precio}</p>
  <a href="/">← Ir a la tienda</a>
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
app.get('/api/products', async (req, res) => {
  try {
    const col = await getProducts().catch(() => null);
    if (!col) return res.json(getProductsFromJSON());

    const { categoria, search } = req.query;
    let query = {};
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
    const { adminPassword, _id, ...publicConfig } = cfg;
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
    console.log('LOGIN intento:', { recibido: accessPassword, accessOk, adminOk });
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
      destacado: req.body.destacado === 'true'
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
    const col = await getOrders();
    const order = {
      items: req.body.items || [],
      total: req.body.total || '',
      paymentMethod: req.body.paymentMethod || '',
      customerInfo: req.body.customerInfo || {},
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