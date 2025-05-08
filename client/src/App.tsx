import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

// Definir tipos para los mensajes y documentos
interface Message {
  username: string;
  message: string;
  timestamp: string;
}

interface Document {
  id: string;
  room: string;
  title: string;
  path?: string;
  content?: string;
  lastModified: string;
}

const App: React.FC = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docContent, setDocContent] = useState('');
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [room, setRoom] = useState('General');
  const [tempRoom, setTempRoom] = useState('General');
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    if (isLoggedIn && !socketRef.current) {
      const ws = new WebSocket('ws://localhost:4000');
      socketRef.current = ws;
      setSocket(ws);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', room, username }));
      };

      ws.onmessage = (event) => {

        try {
          const data = JSON.parse(event.data);
          if (data.type === 'doc_update') {
            setDocContent(data.content || '');
          } else {
            setMessages((prev) => [...prev, data]);
          }
        } catch (err) {
        }
      };

      ws.onerror = (err) => {
        setError('No se pudo conectar al servidor');
      };

      ws.onclose = () => {
        socketRef.current = null;
        setSocket(null);
      };
    }

  }, [isLoggedIn, room, username]);

  useEffect(() => {
    if (isLoggedIn) {
      axios
        .get(`http://localhost:4000/api/history/${room}`)
        .then((response) => {
          setMessages(response.data);
        })
        .catch((error) => {
          setError('Error al cargar el historial');
        });

      axios
        .get(`http://localhost:4000/api/documents/${room}`)
        .then((response) => {
          setDocuments(response.data);
          const doc = response.data.find((d: Document) => d.content);
          setDocContent(doc?.content || '');
        })
        .catch((error) => {
          setError('Error al cargar documentos');
        });
    }
  }, [isLoggedIn, room]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      await axios.post('http://localhost:4000/auth/login', {
        username,
        password,
      });
      setIsLoggedIn(true);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Credenciales inválidas');
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      await axios.post('http://localhost:4000/auth/register', {
        username,
        password,
      });
      alert('Usuario registrado. Por favor, inicia sesión.');
      setShowRegister(false);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Error al registrar');
    }
  };

  const sendMessage = () => {
    if (!input || !socket || socket.readyState !== WebSocket.OPEN) {
      setError('No se puede enviar el mensaje: conexión no establecida o mensaje vacío');
      return;
    }
    try {
      socket.send(JSON.stringify({ type: 'message', room, username, message: input }));
      setInput('');
    } catch (err) {
      setError('Error al enviar el mensaje');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('room', room);
    try {
      await axios.post('http://localhost:4000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Archivo subido');
      const response = await axios.get(`http://localhost:4000/api/documents/${room}`);
      setDocuments(response.data);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Error al subir archivo');
    }
  };

  const updateDoc = (content: string) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('No se puede actualizar el documento: conexión no establecida');
      return;
    }
    try {
      socket.send(JSON.stringify({ type: 'doc_update', room, content }));
      setDocContent(content);
    } catch (err) {
      setError('Error al actualizar el documento');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    setMessages([]);
    setDocuments([]);
    setDocContent('');
    setRoom('sala1');
    setTempRoom('sala1');
    if (socketRef.current) {
      socketRef.current.close();
    }
  };

  const handleChangeRoom = () => {
    if (tempRoom && tempRoom !== room) {
      setRoom(tempRoom);
    }
  };

  if (!isLoggedIn) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>{showRegister ? 'Registrar' : 'Iniciar sesión'}</h1>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {showRegister ? (
          <form onSubmit={handleRegister}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuario"
              style={{ margin: '10px', padding: '5px' }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              style={{ margin: '10px', padding: '5px' }}
            />
            <button type="submit" style={{ margin: '10px', padding: '5px 10px' }}>
              Registrar
            </button>
            <button
              type="button"
              onClick={() => setShowRegister(false)}
              style={{ margin: '10px', padding: '5px 10px' }}
            >
              Volver al login
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuario"
              style={{ margin: '10px', padding: '5px' }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              style={{ margin: '10px', padding: '5px' }}
            />
            <button type="submit" style={{ margin: '10px', padding: '5px 10px' }}>
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              style={{ margin: '10px', padding: '5px 10px' }}
            >
              Crear cuenta
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Sala: {room}</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {/* <div style={{ margin: '10px' }}>
        <input
          type="text"
          value={tempRoom}
          onChange={(e) => setTempRoom(e.target.value)}
          placeholder="Nombre de la sala"
          style={{ margin: '10px', padding: '5px' }}
        />
        <button
          onClick={handleChangeRoom}
          style={{ margin: '10px', padding: '5px 10px' }}
        >
          Cambiar sala
        </button>
      </div> */}
      <h2>Chat</h2>
      <div style={{ margin: '20px 0' }}>
        {messages.map((msg, i) => (
          <p key={i}>
            <strong>{msg.username}</strong>: {msg.message}
          </p>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Escribe un mensaje"
        style={{ margin: '10px', padding: '5px' }}
      />
      <button onClick={sendMessage} style={{ margin: '10px', padding: '5px 10px' }}>
        Enviar
      </button>
      <button
        onClick={() => window.open(`http://localhost:4000/api/export/${room}?format=txt`)}
        style={{ margin: '10px', padding: '5px 10px' }}
      >
        Descargar historial (TXT)
      </button>
      <button
        onClick={handleLogout}
        style={{ margin: '10px', padding: '5px 10px', background: 'red', color: 'white' }}
      >
        Cerrar sesión
      </button>
      <div>
        <h2>Archivos</h2>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={handleUpload}
          style={{ margin: '10px' }}
        />
        <ul>
          {documents.map((doc) => (
            <li key={doc.id}>
              <a href={`http://localhost:4000/api/download/${doc.id}`} download>
                {doc.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2>Documento colaborativo</h2>
        <textarea
          value={docContent}
          onChange={(e) => updateDoc(e.target.value)}
          placeholder="Escribe aquí el contenido del documento..."
          style={{ width: '100%', height: '200px', margin: '10px', padding: '5px' }}
        />
      </div>
    </div>
  );
};

export default App;