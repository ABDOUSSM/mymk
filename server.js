const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. نظام الحماية (Auth) ---
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required');
    }
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    if (credentials[0] === 'admin' && credentials[1] === '123456') {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Invalid credentials');
    }
};

// --- 2. حماية صفحة الأدمن (يجب أن تكون قبل السطر رقم 3) ---
// ملاحظة: انقل ملف admin.html من مجلد public وضعه بجانب server.js مباشرة
app.get('/admin.html', auth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html')); 
});

// --- 3. الملفات العامة (الصور، الصفحة الرئيسية) ---
app.use(express.static('public'));

// --- 4. إعدادات الرفع (Multer) ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// --- 5. قاعدة البيانات ---
const db = new sqlite3.Database('store.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price TEXT, image TEXT, description TEXT, quantity INTEGER DEFAULT 0, colors TEXT DEFAULT '[]')`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER, productName TEXT, selectedColor TEXT, userName TEXT, phone TEXT, city TEXT, address TEXT, status TEXT DEFAULT 'قيد الانتظار', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`ALTER TABLE products ADD COLUMN quantity INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'قيد الانتظار'`, () => {});
});

// --- 6. المسارات (API Routes) ---

app.get('/api/products', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => res.json(rows));
});

app.post('/api/products', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'colorImages', maxCount: 10 }]), (req, res) => {
    const { name, price, description, quantity, colorNames } = req.body;
    const mainImage = req.files['image'] ? '/uploads/' + req.files['image'][0].filename : '';
    let colorsData = [];
    try {
        const names = JSON.parse(colorNames || '[]');
        const colorFiles = req.files['colorImages'] || [];
        names.forEach((cName, index) => {
            if (colorFiles[index]) colorsData.push({ name: cName, image: '/uploads/' + colorFiles[index].filename });
        });
    } catch(e) {}
    db.run(`INSERT INTO products (name, price, description, quantity, colors, image) VALUES (?,?,?,?,?,?)`, 
    [name, price, description, quantity || 0, JSON.stringify(colorsData), mainImage], () => res.json({ success: true }));
});

app.post('/api/order', (req, res) => {
    const { productId, productName, selectedColor, name, phone, city, address } = req.body;
    db.run(`INSERT INTO orders (productId, productName, selectedColor, userName, phone, city, address) VALUES (?,?,?,?,?,?,?)`, 
    [productId, productName, selectedColor, name, phone, city, address], () => res.json({ success: true }));
});

app.get('/api/orders', auth, (req, res) => { // حماية الـ API أيضاً
    db.all('SELECT * FROM orders ORDER BY id DESC', (err, rows) => res.json(rows));
});

app.put('/api/orders/:id/status', auth, (req, res) => {
    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [req.body.status, req.params.id], () => res.json({ success: true }));
});

app.delete('/api/products/:id', auth, (req, res) => {
    db.run(`DELETE FROM products WHERE id = ?`, req.params.id, () => res.json({ success: true }));
});

// --- 7. التشغيل ---
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));