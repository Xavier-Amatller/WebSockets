import React, { useEffect, useState } from 'react';
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
  path: string;
  lastModified: string;
}

const App: React.FC = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [room, setRoom] = useState('sala1'); // Sala por defecto
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  // Conectar al WebSocket y cargar historial y documentos al iniciar sesión
  useEffect(() => {
    if (isLoggedIn) {
      const ws = new WebSocket('ws://localhost:4000');

      ws.onopen = () => {
        console.log('Conectado al WebSocket');
        ws.send(JSON.stringify({ type: 'join', room, username }));
      };

      ws.onmessage = (event) => {
        try {
          const data: Message = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);
        } catch (err) {
          console.error('Error al parsear mensaje WebSocket:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('Error en WebSocket:', err);
        setError('No se pudo conectar al servidor');
      };

      ws.onclose = () => {
        console.log('Desconectado del WebSocket');
      };

      setSocket(ws);

      // Cargar historial de mensajes
      axios
        .get(`http://localhost:4000/api/history/${room}`)
        .then((response) => {
          setMessages(response.data);
        })
        .catch((error) => {
          console.error('Error al cargar historial:', error);
          setError('Error al cargar el historial');
        });

      // Cargar documentos
      axios
        .get(`http://localhost:4000/api/documents/${room}`)
        .then((response) => {
          setDocuments(response.data);
        })
        .catch((error) => {
          console.error('Error al cargar documentos:', error);
          setError('Error al cargar documentos');
        });

      return () => ws.close();
    }
  }, [isLoggedIn, room, username]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const response = await axios.post('http://localhost:4000/auth/login', {
        username,
        password,
      });
      console.log('Login exitoso:', response.data);
      setIsLoggedIn(true);
    } catch (error: any) {
      console.error('Error en login:', error);
      setError(error.response?.data?.error || 'Credenciales inválidas');
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const response = await axios.post('http://localhost:4000/auth/register', {
        username,
        password,
      });
      console.log('Registro exitoso:', response.data);
      alert('Usuario registrado. Por favor, inicia sesión.');
      setShowRegister(false);
    } catch (error: any) {
      console.error('Error en registro:', error);
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
      console.error('Error al enviar mensaje:', err);
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
      // Recargar lista de documentos
      const response = await axios.get(`http://localhost:4000/api/documents/${room}`);
      setDocuments(response.data);
    } catch (error: any) {
      console.error('Error al subir archivo:', error);
      setError(error.response?.data?.error || 'Error al subir archivo');
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
      <h1>Chat en sala: {room}</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input
        type="text"
        value={room}
        onChange={(e) => setRoom(e.target.value)}
        placeholder="Nombre de la sala"
        style={{ margin: '10px', padding: '5px' }}
      />
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
    </div>
  );
};

export default App;