const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { readDB, writeDB } = require('./utils/db');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
      const parsedData = JSON.parse(data);
      const { type, room, username, message, content, saveVersion } = parsedData;

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
        
        // Inicializar documentVersions si no existe
        if (!db.documentVersions) {
          db.documentVersions = [];
        }
        
        let doc = db.documents.find((d) => d.room === room && d.content !== undefined);
        
        if (doc) {
          // Guardar versión anterior si el contenido ha cambiado y se solicita guardar versión
          if (saveVersion && doc.content !== content) {
            db.documentVersions.push({
              id: uuidv4(),
              documentId: doc.id,
              content: doc.content, // Guardar contenido anterior
              createdBy: username || 'Usuario desconocido',
              createdAt: new Date().toISOString(),
              versionNumber: getNextVersionNumber(db.documentVersions, doc.id)
            });
          }
          
          // Actualizar el documento
          doc.content = content;
          doc.lastModified = new Date().toISOString();
        } else {
          // Crear nuevo documento
          doc = {
            id: uuidv4(),
            room,
            title: `Documento ${room}`,
            content,
            lastModified: new Date().toISOString(),
          };
          db.documents.push(doc);
          
          // Crear primera versión
          if (saveVersion) {
            db.documentVersions.push({
              id: uuidv4(),
              documentId: doc.id,
              content,
              createdBy: username || 'Usuario desconocido',
              createdAt: new Date().toISOString(),
              versionNumber: 1
            });
          }
        }
        
        await writeDB(db);
        
        const clients = clientsByRoom.get(room) || [];
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
              type: 'doc_update', 
              content,
              documentId: doc.id
            }));
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

// Función auxiliar para obtener el siguiente número de versión
function getNextVersionNumber(versions, documentId) {
  if (!versions || versions.length === 0) return 1;
  
  const docVersions = versions.filter(v => v.documentId === documentId);
  if (docVersions.length === 0) return 1;
  
  const maxVersion = Math.max(...docVersions.map(v => v.versionNumber || 0));
  return maxVersion + 1;
}

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
      id: uuidv4(),
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

// Endpoint para obtener el historial de versiones de un archivo/documento
app.get('/api/version/:archivo', async (req, res) => {
  try {
    const { archivo } = req.params;
    const db = await readDB();
    
    const documento = db.documents.find(doc => doc.id === archivo);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    if (!db.documentVersions) {
      db.documentVersions = [];
    }
    
    const versiones = db.documentVersions.filter(version => version.documentId === archivo);
    
    versiones.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    versiones.forEach((version, index) => {
      if (!version.versionNumber) {
        version.versionNumber = versiones.length - index;
      }
    });
    
    res.json(versiones);
  } catch (error) {
    console.error('Error al obtener versiones del documento:', error);
    res.status(500).json({ error: 'Error al obtener el historial de versiones' });
  }
});

app.post('/api/version/restore/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;
    const { username, room } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Se requiere el nombre de usuario' });
    }
    
    const db = await readDB();
    
    if (!db.documentVersions) {
      return res.status(404).json({ error: 'No hay versiones disponibles' });
    }
    
    const version = db.documentVersions.find(v => v.id === versionId);
    if (!version) {
      return res.status(404).json({ error: 'Versión no encontrada' });
    }

    const documento = db.documents.find(doc => doc.id === version.documentId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
      db.documentVersions.push({
      id: uuidv4(),
      documentId: documento.id,
      content: documento.content,
      createdBy: username,
      createdAt: new Date().toISOString(),
      versionNumber: getNextVersionNumber(db.documentVersions, documento.id),
      isAutoSave: true
    });
    
    documento.content = version.content;
    documento.lastModified = new Date().toISOString();
    
    await writeDB(db);
    
    const clients = clientsByRoom.get(room) || [];
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ 
          type: 'doc_update', 
          content: version.content,
          documentId: documento.id,
          restored: true
        }));
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Versión restaurada correctamente',
      document: documento
    });
  } catch (error) {
    console.error('Error al restaurar versión:', error);
    res.status(500).json({ error: 'Error al restaurar la versión' });
  }
});

app.post('/api/version/create', async (req, res) => {
  try {
    const { documentId, username } = req.body;
    
    if (!documentId || !username) {
      return res.status(400).json({ error: 'Se requiere el ID del documento y el nombre de usuario' });
    }
    
    const db = await readDB();
    
    const documento = db.documents.find(doc => doc.id === documentId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    if (!db.documentVersions) {
      db.documentVersions = [];
    }
    
    const newVersion = {
      id: uuidv4(),
      documentId,
      content: documento.content,
      createdBy: username,
      createdAt: new Date().toISOString(),
      versionNumber: getNextVersionNumber(db.documentVersions, documentId)
    };
    
    db.documentVersions.push(newVersion);
    await writeDB(db);
    
    res.json({ 
      success: true, 
      message: 'Versión creada correctamente',
      version: newVersion
    });
  } catch (error) {
    console.error('Error al crear versión:', error);
    res.status(500).json({ error: 'Error al crear la versión' });
  }
});

// Endpoint para exportar una versión específica
app.get('/api/version/export/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;
    const format = req.query.format || 'txt';
    
    const db = await readDB();
    
    if (!db.documentVersions) {
      return res.status(404).json({ error: 'No hay versiones disponibles' });
    }
    
    const version = db.documentVersions.find(v => v.id === versionId);
    if (!version) {
      return res.status(404).json({ error: 'Versión no encontrada' });
    }
    
    const documento = db.documents.find(doc => doc.id === version.documentId);
    const title = documento ? documento.title : 'documento';
    
    if (format === 'json') {
      res.set('Content-Type', 'application/json');
      res.set('Content-Disposition', `attachment; filename=${title}_v${version.versionNumber}.json`);
      res.json({
        version: version.versionNumber,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
        content: version.content
      });
    } else {
      res.set('Content-Type', 'text/plain');
      res.set('Content-Disposition', `attachment; filename=${title}_v${version.versionNumber}.txt`);
      res.send(version.content);
    }
  } catch (error) {
    console.error('Error al exportar versión:', error);
    res.status(500).json({ error: 'Error al exportar la versión' });
  }
});

server.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});