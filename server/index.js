// Importación de módulos necesarios
const express = require('express');                // Framework web para Node.js
const http = require('http');                      // Módulo HTTP nativo de Node.js
const WebSocket = require('ws');                   // Implementación de WebSockets para Node.js
const cors = require('cors');                      // Middleware para habilitar CORS (Cross-Origin Resource Sharing)
const { readDB, writeDB } = require('./utils/db'); // Funciones personalizadas para leer/escribir en la base de datos
const multer = require('multer');                  // Middleware para manejar datos multipart/form-data (subida de archivos)
const path = require('path');                      // Módulo para trabajar con rutas de archivos
const { v4: uuidv4 } = require('uuid');           // Generador de identificadores únicos

// Configuración inicial de Express
const app = express();                             // Creación de la aplicación Express
const port = 4000;                                 // Puerto en el que escuchará el servidor

// Middleware global
app.use(cors());                                   // Habilita CORS para todas las rutas
app.use(express.json());                           // Parsea las solicitudes con contenido JSON

// Creación del servidor HTTP y configuración de WebSockets
const server = http.createServer(app);             // Crea un servidor HTTP usando la app Express
const wss = new WebSocket.Server({ server });      // Configura WebSockets en el mismo servidor HTTP

// Mapa para almacenar clientes por sala (estructura de datos para la gestión de salas)
const clientsByRoom = new Map();                   // Usa Map para asociar salas con conjuntos de clientes

// Configuración de multer para la subida de archivos
const upload = multer({
  dest: 'uploads/',                                // Directorio donde se guardarán los archivos
  limits: { fileSize: 5 * 1024 * 1024 },           // Límite de tamaño: 5MB
  fileFilter: (req, file, cb) => {                 // Filtro para tipos de archivo permitidos
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);                              // Acepta el archivo
    } else {
      cb(new Error('Tipo de archivo no permitido')); // Rechaza el archivo
    }
  },
});

// Manejo de conexiones WebSocket
wss.on('connection', (ws) => {
 // Manejo de mensajes recibidos
 ws.on('message', async (data) => {
  try {
    const parsedData = JSON.parse(data);           // Parsea los datos JSON recibidos
    const { type, room, username, message, content, saveVersion } = parsedData;

    // Manejo de diferentes tipos de mensajes
    if (type === 'join') {
      // Unirse a una sala
      ws.room = room;                              // Almacena la sala en el objeto WebSocket
      if (!clientsByRoom.has(room)) {
        clientsByRoom.set(room, new Set());        // Crea un nuevo conjunto si la sala no existe
      }
      clientsByRoom.get(room).add(ws);             // Añade el cliente al conjunto de la sala
    } else if (type === 'message') {
      // Envío de mensaje de chat
      const db = await readDB();                   // Lee la base de datos
      const newMessage = {
        username,
        message,
        room,
        timestamp: new Date().toISOString(),       // Añade timestamp en formato ISO
      };
      db.messages.push(newMessage);                // Añade el mensaje a la base de datos
      await writeDB(db);                           // Guarda los cambios

      // Difunde el mensaje a todos los clientes en la sala
      const clients = clientsByRoom.get(room) || [];
      
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(newMessage));
        }
      });
    } else if (type === 'doc_update') {
      // Actualización de documento colaborativo
      const db = await readDB();
      
      // Inicializa el array de versiones si no existe
      if (!db.documentVersions) {
        db.documentVersions = [];
      }
      
      // Busca el documento existente para la sala
      let doc = db.documents.find((d) => d.room === room && d.content !== undefined);
      
      if (doc) {
        // Si el documento existe y se debe guardar versión
        if (saveVersion && doc.content !== content) {
          // Crea una nueva versión con el contenido anterior
          db.documentVersions.push({
            id: uuidv4(),
            documentId: doc.id,
            content: doc.content,                  // Guarda el contenido anterior
            createdBy: username || 'Usuario desconocido',
            createdAt: new Date().toISOString(),
            versionNumber: getNextVersionNumber(db.documentVersions, doc.id)
          });
        }
        
        // Actualiza el contenido y la fecha de modificación
        doc.content = content;
        doc.lastModified = new Date().toISOString();
      } else {
        // Si el documento no existe, crea uno nuevo
        doc = {
          id: uuidv4(),
          room,
          title: `Documento ${room}`,
          content,
          lastModified: new Date().toISOString(),
        };
        db.documents.push(doc);
        
        // Si se debe guardar versión, crea la primera versión
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
      
      await writeDB(db);                           // Guarda los cambios en la base de datos
      
      // Notifica a todos los clientes en la sala sobre la actualización
      const clients = clientsByRoom.get(room) || [];
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'doc_update', 
            content,
            documentId: doc.id,
            editedBy: username || 'Usuario desconocido'
          }));
        }
      });
    } else if (type === 'doc_typing') {
      // Notificación de que un usuario está escribiendo
      const clients = clientsByRoom.get(room) || [];
      clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          // Envía la notificación a todos excepto al remitente
          client.send(JSON.stringify({ 
            type: 'doc_typing', 
            username: username || 'Usuario desconocido'
          }));
        }
      });
    }
  } catch (err) {
    console.error('Error al procesar mensaje WebSocket:', err);
  }
});

  // Manejo de cierre de conexión
  ws.on('close', () => {
    if (ws.room && clientsByRoom.has(ws.room)) {
      clientsByRoom.get(ws.room).delete(ws);       // Elimina el cliente de la sala
      if (clientsByRoom.get(ws.room).size === 0) {
        clientsByRoom.delete(ws.room);             // Elimina la sala si está vacía
      }
    }
  });

  // Manejo de errores de WebSocket
  ws.on('error', (err) => {
    console.error('Error en WebSocket:', err);
  });
});

// Función auxiliar para obtener el siguiente número de versión
function getNextVersionNumber(versions, documentId) {
  if (!versions || versions.length === 0) return 1;
  
  // Filtra las versiones del documento específico
  const docVersions = versions.filter(v => v.documentId === documentId);
  if (docVersions.length === 0) return 1;
  
  // Encuentra el número de versión más alto y suma 1
  const maxVersion = Math.max(...docVersions.map(v => v.versionNumber || 0));
  return maxVersion + 1;
}

// Middleware para verificar autenticación de usuario
const verifyUser = async (req, res, next) => {
  const { username, password } = req.body;
  const db = await readDB();
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  req.user = user;                                 // Añade el usuario a la solicitud
  next();                                          // Continúa con el siguiente middleware
};

// Ruta para registro de usuarios
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const db = await readDB();
  // Verifica si el usuario ya existe
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: 'Usuario ya existe' });
  }

  // Añade el nuevo usuario
  db.users.push({ username, password });           // NOTA: Las contraseñas deberían hashearse
  await writeDB(db);
  res.status(201).json({ message: 'Usuario registrado' });
});

// Ruta para login de usuarios
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await readDB();
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  res.json({ message: 'Login exitoso', user });
});

// Ruta para enviar mensajes (vía HTTP, alternativa a WebSockets)
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

  // Notifica a los clientes conectados vía WebSocket
  const clients = clientsByRoom.get(room) || [];
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(newMessage));
    }
  });

  res.json({ sent: true });
});

// Ruta para obtener historial de mensajes de una sala
app.get('/api/history/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const messages = db.messages.filter((msg) => msg.room === room);
  res.json(messages);
});

// Ruta para exportar historial de mensajes
app.get('/api/export/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const messages = db.messages.filter((msg) => msg.room === room);
  const format = req.query.format || 'txt';
  
  if (format === 'json') {
    // Exporta en formato JSON
    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', `attachment; filename=${room}_history.json`);
    res.json(messages);
  } else {
    // Exporta en formato texto plano
    const text = messages.map((msg) => `${msg.username}: ${msg.message}`).join('\n');
    res.set('Content-Type', 'text/plain');
    res.set('Content-Disposition', `attachment; filename=${room}_history.txt`);
    res.send(text);
  }
});

// Ruta para subir archivos
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { room } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó un archivo' });
    }
    const db = await readDB();
    // Registra el archivo en la base de datos
    db.documents.push({
      id: uuidv4(),
      room,
      title: req.file.originalname,
      path: req.file.path,                         // Ruta donde se guardó el archivo
      lastModified: new Date().toISOString(),
    });
    await writeDB(db);
    res.json({ message: 'Archivo subido' });
  } catch (error) {
    console.error('Error al subir archivo:', error);
    res.status(400).json({ error: error.message || 'Error al subir archivo' });
  }
});

// Ruta para obtener documentos de una sala
app.get('/api/documents/:room', async (req, res) => {
  const { room } = req.params;
  const db = await readDB();
  const documents = db.documents.filter((doc) => doc.room === room);
  res.json(documents);
});

// Ruta para descargar un documento
app.get('/api/download/:id', async (req, res) => {
  const { id } = req.params;
  const db = await readDB();
  const document = db.documents.find((doc) => doc.id === id);
  if (!document) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  res.download(document.path, document.title);     // Envía el archivo como descarga
});

// Ruta para obtener el historial de versiones de un documento
app.get('/api/version/:archivo', async (req, res) => {
  try {
    const { archivo } = req.params;                // ID del documento
    const db = await readDB();
    
    // Verifica que el documento exista
    const documento = db.documents.find(doc => doc.id === archivo);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    // Inicializa el array de versiones si no existe
    if (!db.documentVersions) {
      db.documentVersions = [];
    }
    
    // Filtra las versiones del documento específico
    const versiones = db.documentVersions.filter(version => version.documentId === archivo);
    
    // Ordena las versiones por fecha (más recientes primero)
    versiones.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Asigna números de versión si faltan
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

// Ruta para restaurar una versión anterior de un documento
app.post('/api/version/restore/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;              // ID de la versión a restaurar
    const { username, room } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Se requiere el nombre de usuario' });
    }
    
    const db = await readDB();
    
    if (!db.documentVersions) {
      return res.status(404).json({ error: 'No hay versiones disponibles' });
    }
    
    // Busca la versión a restaurar
    const version = db.documentVersions.find(v => v.id === versionId);
    if (!version) {
      return res.status(404).json({ error: 'Versión no encontrada' });
    }

    // Busca el documento asociado
    const documento = db.documents.find(doc => doc.id === version.documentId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    // Guarda el estado actual como una nueva versión antes de restaurar
    db.documentVersions.push({
      id: uuidv4(),
      documentId: documento.id,
      content: documento.content,
      createdBy: username,
      createdAt: new Date().toISOString(),
      versionNumber: getNextVersionNumber(db.documentVersions, documento.id),
      isAutoSave: true                             // Marca que es un autoguardado antes de restaurar
    });
    
    // Restaura el contenido de la versión seleccionada
    documento.content = version.content;
    documento.lastModified = new Date().toISOString();
    
    await writeDB(db);
    
    // Notifica a todos los clientes en la sala sobre la restauración
    const clients = clientsByRoom.get(room) || [];
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ 
          type: 'doc_update', 
          content: version.content,
          documentId: documento.id,
          restored: true                           // Indica que es una restauración
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

// Ruta para crear manualmente una nueva versión
app.post('/api/version/create', async (req, res) => {
  try {
    const { documentId, username } = req.body;
    
    if (!documentId || !username) {
      return res.status(400).json({ error: 'Se requiere el ID del documento y el nombre de usuario' });
    }
    
    const db = await readDB();
    
    // Verifica que el documento exista
    const documento = db.documents.find(doc => doc.id === documentId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    // Inicializa el array de versiones si no existe
    if (!db.documentVersions) {
      db.documentVersions = [];
    }
    
    // Crea una nueva versión con el contenido actual
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

// Ruta para exportar una versión específica
app.get('/api/version/export/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;
    const format = req.query.format || 'txt';      // Formato de exportación
    
    const db = await readDB();
    
    if (!db.documentVersions) {
      return res.status(404).json({ error: 'No hay versiones disponibles' });
    }
    
    // Busca la versión a exportar
    const version = db.documentVersions.find(v => v.id === versionId);
    if (!version) {
      return res.status(404).json({ error: 'Versión no encontrada' });
    }
    
    // Obtiene el título del documento
    const documento = db.documents.find(doc => doc.id === version.documentId);
    const title = documento ? documento.title : 'documento';
    
    if (format === 'json') {
      // Exporta en formato JSON
      res.set('Content-Type', 'application/json');
      res.set('Content-Disposition', `attachment; filename=${title}_v${version.versionNumber}.json`);
      res.json({
        version: version.versionNumber,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
        content: version.content
      });
    } else {
      // Exporta en formato texto plano
      res.set('Content-Type', 'text/plain');
      res.set('Content-Disposition', `attachment; filename=${title}_v${version.versionNumber}.txt`);
      res.send(version.content);
    }
  } catch (error) {
    console.error('Error al exportar versión:', error);
    res.status(500).json({ error: 'Error al exportar la versión' });
  }
});

// Inicia el servidor
server.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});