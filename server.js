const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Carpetas públicas
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('/tmp/uploads'));

// Directorios temporales para Vercel
const dataDir = '/tmp/data';
const uploadsDir = '/tmp/uploads';

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const productsFile = path.join(dataDir, 'products.json');
const configFile = path.join(dataDir, 'config.json');

// Configuración por defecto
const defaultConfig = {
  whatsappNumber: "5492494000000",
  horarios: {
    lunesViernes: "9:00 — 23:00 hs",
    sabados: "9:00 — 23:00 hs",
    domingos: "10:00 — 22:00 hs",
    feriados: "10:00 — 21:00 hs"
  },
  tickerItems: [
    "📦 Packaging discreto",
    "⚡ Entrega hoy en Tandil",
    "💳 Todos los medios de pago",
    "📲 Atención 9 a 23 hs",
    "✅ Productos certificados",
    "🔒 Compra 100% privada"
  ],
  adminPassword: "admin123"
};

// Crear archivos si no existen
if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, JSON.stringify([], null, 2));
}

if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
}

// Funciones helper
function readProducts() {
  return JSON.parse(fs.readFileSync(productsFile));
}

function writeProducts(data) {
  fs.writeFileSync(productsFile, JSON.stringify(data, null, 2));
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configFile));
}

function writeConfig(data) {
  fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
}

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API pública
app.get('/api/products', (req, res) => {
  const products = readProducts();
  const { categoria } = req.query;

  if (categoria && categoria !== 'Todo') {
    return res.json(products.filter(p => p.categoria === categoria));
  }

  res.json(products);
});

app.get('/api/config', (req, res) => {
  const { adminPassword, ...publicConfig } = readConfig();
  res.json(publicConfig);
});

// Middleware auth
const checkAuth = (req, res, next) => {
  const token = req.headers.authorization;
  const config = readConfig();

  if (token === config.adminPassword) {
    next();
  } else {
    res.status(401).json({ error: 'No autorizado' });
  }
};

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const config = readConfig();

  if (password === config.adminPassword) {
    res.json({
      success: true,
      token: password
    });
  } else {
    res.status(401).json({
      error: 'Contraseña incorrecta'
    });
  }
});

// Crear producto
app.post('/api/products', checkAuth, upload.single('imagen'), (req, res) => {
  const products = readProducts();

  const newId =
    products.length > 0
      ? Math.max(...products.map(p => p.id)) + 1
      : 1;

  let imagenUrl = req.body.imagenUrl || '';

  if (req.file) {
    imagenUrl = `/uploads/${req.file.filename}`;
  }

  const nuevo = {
    id: newId,
    nombre: req.body.nombre,
    categoria: req.body.categoria,
    precio: req.body.precio,
    precioAnterior: req.body.precioAnterior || null,
    descripcion: req.body.descripcion,
    imagen: imagenUrl,
    badge: req.body.badge || '',
    rating: parseFloat(req.body.rating) || 4.5,
    destacado: req.body.destacado === 'true'
  };

  products.push(nuevo);

  writeProducts(products);

  res.json(nuevo);
});

// Editar producto
app.put('/api/products/:id', checkAuth, upload.single('imagen'), (req, res) => {
  let products = readProducts();

  const id = parseInt(req.params.id);

  const index = products.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({
      error: 'No encontrado'
    });
  }

  let imagenUrl = req.body.imagenUrl || products[index].imagen;

  if (req.file) {
    imagenUrl = `/uploads/${req.file.filename}`;
  }

  products[index] = {
    ...products[index],
    nombre: req.body.nombre,
    categoria: req.body.categoria,
    precio: req.body.precio,
    precioAnterior: req.body.precioAnterior || null,
    descripcion: req.body.descripcion,
    imagen: imagenUrl,
    badge: req.body.badge || '',
    rating: parseFloat(req.body.rating) || products[index].rating,
    destacado: req.body.destacado === 'true'
  };

  writeProducts(products);

  res.json(products[index]);
});

// Eliminar producto
app.delete('/api/products/:id', checkAuth, (req, res) => {
  let products = readProducts();

  const id = parseInt(req.params.id);

  const newProducts = products.filter(p => p.id !== id);

  if (newProducts.length === products.length) {
    return res.status(404).json({
      error: 'No encontrado'
    });
  }

  writeProducts(newProducts);

  res.json({
    success: true
  });
});

// Config admin
app.get('/api/admin/config', checkAuth, (req, res) => {
  res.json(readConfig());
});

app.put('/api/admin/config', checkAuth, (req, res) => {
  const current = readConfig();

  const updated = {
    ...current,
    ...req.body
  };

  writeConfig(updated);

  res.json(updated);
});

// Cambiar contraseña
app.post('/api/admin/change-password', checkAuth, (req, res) => {
  const { newPassword } = req.body;

  const config = readConfig();

  config.adminPassword = newPassword;

  writeConfig(config);

  res.json({
    success: true
  });
});

// Export para Vercel
module.exports = app;