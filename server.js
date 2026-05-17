const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const productsFile = './data/products.json';
const configFile = './data/config.json';

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

if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, JSON.stringify([], null, 2));
}
if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
}

function readProducts() { return JSON.parse(fs.readFileSync(productsFile)); }
function writeProducts(data) { fs.writeFileSync(productsFile, JSON.stringify(data, null, 2)); }
function readConfig() { return JSON.parse(fs.readFileSync(configFile)); }
function writeConfig(data) { fs.writeFileSync(configFile, JSON.stringify(data, null, 2)); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

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

// API admin
const checkAuth = (req, res, next) => {
  const token = req.headers.authorization;
  const config = readConfig();
  if (token === config.adminPassword) next();
  else res.status(401).json({ error: 'No autorizado' });
};

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const config = readConfig();
  if (password === config.adminPassword) res.json({ success: true, token: password });
  else res.status(401).json({ error: 'Contraseña incorrecta' });
});

app.post('/api/products', checkAuth, upload.single('imagen'), (req, res) => {
  const products = readProducts();
  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  let imagenUrl = req.body.imagenUrl || '';
  if (req.file) imagenUrl = `/uploads/${req.file.filename}`;
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

app.put('/api/products/:id', checkAuth, upload.single('imagen'), (req, res) => {
  let products = readProducts();
  const id = parseInt(req.params.id);
  const index = products.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'No encontrado' });
  let imagenUrl = req.body.imagenUrl || products[index].imagen;
  if (req.file) imagenUrl = `/uploads/${req.file.filename}`;
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

app.delete('/api/products/:id', checkAuth, (req, res) => {
  let products = readProducts();
  const id = parseInt(req.params.id);
  const newProducts = products.filter(p => p.id !== id);
  if (newProducts.length === products.length) return res.status(404).json({ error: 'No encontrado' });
  writeProducts(newProducts);
  res.json({ success: true });
});

app.get('/api/admin/config', checkAuth, (req, res) => res.json(readConfig()));
app.put('/api/admin/config', checkAuth, (req, res) => {
  const current = readConfig();
  const updated = { ...current, ...req.body };
  writeConfig(updated);
  res.json(updated);
});
app.post('/api/admin/change-password', checkAuth, (req, res) => {
  const { newPassword } = req.body;
  const config = readConfig();
  config.adminPassword = newPassword;
  writeConfig(config);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
});