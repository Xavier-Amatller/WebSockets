const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { readDB, writeDB } = require('./utils/db');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clientsByRoom = new Map();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  },
});

wss.on('connection', (ws) => {

  ws.on('message', async (data) => {
    try {
      const { type, room, username, message, content } = JSON.parse(data);

      if (type === 'join') {
        ws.room = room;
        if (!clientsByRoom.has(room)) {
          clientsByRoom.set(room, new Set());
        }
        clientsByRoom.get(room).add(ws);
      } else if (type === 'message') {
        const db = await readDB();
        const newMessage = {
          username,
          message,
          room,
          timestamp: new Date().toISOString(),
        };
        db.messages.push(newMessage);
        await writeDB(db);

        const clients = clientsByRoom.get(room) || [];
        
        clients.forEach((client) => {
         
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(newMessage));
          }
        });
      } else if (type === 'doc_update') {
        const db = await readDB();
        let doc = db.documents.find((d) => d.room === room && d.content);
        if (doc) {
          doc.content = content;
          doc.lastModified = new Date().toISOString();
        } else {
          doc = {
            id: `d${db.documents.length + 1}`,
            room,
            title: `Documento ${room}`,
            content,
            lastModified: new Date().toISOString(),
          };
          db.documents.push(doc);
        }
        await writeDB(db);

        const clients = clientsByRoom.get(room) || [];
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'doc_update', content }));
          }
        });
      }
    } catch (err) {
      console.error('Error al procesar mensaje WebSocket:', err);
    }
  });

  ws.on('close', () => {
    if (ws.room && clientsByRoom.has(ws.room)) {
      clientsByRoom.get(ws.room).delete(ws);
      if (clientsByRoom.get(ws.room).size === 0) {
        clientsByRoom.delete(ws.room);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('Error en WebSocket:', err);
  });
});

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

app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const db = await readDB();
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: 'Usuario ya existe' });
  }

  db.users.push({ username, password });
  await writeDB(db);
  res.status(201).json({ message: 'Usuario registrado' });
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await readDB();
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  res.json({ message: 'Login exitoso', user });
});

app.post('/api/message', verifyUser, async (req, res) => {
  const { message, room } = req.body;
  const username = req.user.username;

  if (!message || !room) {
    return res.status(400).json({ error: 'Mensaje o sala vacíos' });
  }

  const db = await readDB();
  const newMessage = {
    username,
    message,
    room,
    timestamp: new Date().toISOString(),
  };
  db.messages.push(newMessage);
  await writeDB(db);

  const clients = clientsByRoom.get(room) || [];
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(newMessage));
    }
  });

  res.json({ sent: true });
});

app.get('/api/history/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const messages = db.messages.filter((msg) => msg.room === room);
  res.json(messages);
});

app.get('/api/export/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const messages = db.messages.filter((msg) => msg.room === room);
  const format = req.query.format || 'txt';
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

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { room } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó un archivo' });
    }
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
  } catch (error) {
    console.error('Error al subir archivo:', error);
    res.status(400).json({ error: error.message || 'Error al subir archivo' });
  }
});

app.get('/api/documents/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const documents = db.documents.filter((doc) => doc.room === room);
  res.json(documents);
});

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