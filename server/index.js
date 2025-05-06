const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { readDB, writeDB } = require('./utils/db'); // Importa las funciones de persistencia

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Mapa para asociar clientes a salas
const clientsByRoom = new Map();

// WebSocket para manejar mensajes y salas
wss.on('connection', (ws) => {
  console.log('Cliente conectado');

  // Manejar mensajes enviados por el cliente
  ws.on('message', async (data) => {
    const { type, room, username, message } = JSON.parse(data);

    if (type === 'join') {
      // Unir al cliente a una sala
      ws.room = room;
      if (!clientsByRoom.has(room)) {
        clientsByRoom.set(room, new Set());
      }
      clientsByRoom.get(room).add(ws);
      console.log(`${username} se unió a la sala ${room}`);
    } else if (type === 'message') {
      // Guardar el mensaje en db.json
      const db = await readDB();
      db.messages.push({ username, message, room, timestamp: new Date() });
      await writeDB(db);

      // Enviar el mensaje a todos los clientes en la misma sala
      const clients = clientsByRoom.get(room) || [];
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ username, message, timestamp: new Date() }));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('Cliente desconectado');
    // Eliminar al cliente de su sala
    if (ws.room && clientsByRoom.has(ws.room)) {
      clientsByRoom.get(ws.room).delete(ws);
      if (clientsByRoom.get(ws.room).size === 0) {
        clientsByRoom.delete(ws.room);
      }
    }
  });
});

// Middleware para verificar usuario autenticado
const verifyUser = async (req, res, next) => {
  const { username, password } = req.body;
  const db = await readDB();
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  req.user = user;
  next();
};

// Endpoint para registrar usuarios
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const db = await readDB();
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: 'Usuario ya existe' });
  }

  db.users.push({ username, password }); // En producción, usa bcrypt
  await writeDB(db);
  res.status(201).json({ message: 'Usuario registrado' });
});

// Endpoint para login
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await readDB();
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  res.json({ message: 'Login exitoso', user });
});

// Endpoint para enviar mensajes (modificado para usar WebSocket)
app.post('/api/message', verifyUser, async (req, res) => {
  const { message, room } = req.body;
  const username = req.user.username;

  if (!message || !room) {
    return res.status(400).json({ error: 'Mensaje o sala vacíos' });
  }

  // Guardar el mensaje en db.json
  const db = await readDB();
  db.messages.push({ username, message, room, timestamp: new Date() });
  await writeDB(db);

  // Enviar el mensaje a los clientes en la sala
  const clients = clientsByRoom.get(room) || [];
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ username, message, timestamp: new Date() }));
    }
  });

  res.json({ sent: true });
});

// Endpoint para recuperar el historial de mensajes
app.get('/api/history/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const messages = db.messages.filter((msg) => msg.room === room);
  res.json(messages);
});

// Endpoint para exportar el historial de mensajes
app.get('/api/export/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const messages = db.messages.filter((msg) => msg.room === room);
  const format = req.query.format || 'txt'; // ?format=txt o ?format=json
  if (format === 'json') {
    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', `attachment; filename=${room}_history.json`);
    res.json(messages);
  } else {
    const text = messages.map((msg) => `${msg.username}: ${msg.message}`).join('\n');
    res.set('Content-Type', 'text/plain');
    res.set('Content-Disposition', `attachment; filename=${room}_history.txt`);
    res.send(text);
  }
});

const multer = require('multer');
const path = require('path');
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
});

// Endpoint para subir archivos
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const { room } = req.body;
  const db = await readDB();
  db.documents.push({
    id: `d${db.documents.length + 1}`,
    room,
    title: req.file.originalname,
    path: req.file.path,
    lastModified: new Date().toISOString(),
  });
  await writeDB(db);
  res.json({ message: 'Archivo subido' });
});

// Endpoint para listar documentos de una sala
app.get('/api/documents/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const documents = db.documents.filter((doc) => doc.room === room);
  res.json(documents);
});

// Endpoint para descargar un documento
app.get('/api/download/:id', async (req, res) => {
  const { id } = req.params;
  const db = await readDB();
  const document = db.documents.find((doc) => doc.id === id);
  if (!document) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  res.download(document.path, document.title);
});

server.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

