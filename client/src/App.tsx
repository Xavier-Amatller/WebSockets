// Directiva para indicar que es un componente de cliente (Next.js)
"use client"

// Importaciones necesarias
import type React from "react"
import { useEffect, useState, useRef } from "react" // Hooks de React
import axios from "axios" // Cliente HTTP para peticiones al servidor

// Definición de interfaces TypeScript para tipado estricto
interface Message {
  username: string
  message: string
  timestamp: string
}

interface Document {
  id: string
  room: string
  title: string
  path?: string
  content?: string
  lastModified: string
}

interface DocumentVersion {
  id: string
  documentId: string
  content: string
  createdBy: string
  createdAt: string
}

// Componente principal
const ChatAppComponent: React.FC = () => {
  // Estado para la conexión WebSocket
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const socketRef = useRef<WebSocket | null>(null) // Referencia persistente al socket

  // Estados para datos de la aplicación
  const [messages, setMessages] = useState<Message[]>([]) // Mensajes del chat
  const [documents, setDocuments] = useState<Document[]>([]) // Documentos compartidos
  const [docContent, setDocContent] = useState("") // Contenido del documento actual
  const [input, setInput] = useState("") // Input del mensaje a enviar

  // Estados para autenticación
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // Estados para gestión de salas
  const [room, setRoom] = useState("General") // Sala actual
  const [tempRoom, setTempRoom] = useState("General") // Sala temporal (para cambio)
  const [newRoomName, setNewRoomName] = useState("") // Nombre para nueva sala

  // Estados para UI y experiencia de usuario
  const [error, setError] = useState<string | null>(null) // Mensajes de error
  const [showRegister, setShowRegister] = useState(false) // Alternar entre login/registro
  const messagesEndRef = useRef<HTMLDivElement>(null) // Referencia para auto-scroll
  const [isLoading, setIsLoading] = useState(false) // Estado de carga
  const [showRoomModal, setShowRoomModal] = useState(false) // Modal para cambiar sala
  const [isUploading, setIsUploading] = useState(false) // Estado de subida de archivos
  const [showEmojiPicker, setShowEmojiPicker] = useState(false) // Selector de emojis

  // Estados para gestión de documentos
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null) // Documento seleccionado
  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>([]) // Versiones del documento
  const [showVersionHistory, setShowVersionHistory] = useState(false) // Modal de historial
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null) // Versión seleccionada
  const [isVersionRestoring, setIsVersionRestoring] = useState(false) // Estado de restauración
  const [lastSavedContent, setLastSavedContent] = useState("") // Último contenido guardado
  const [saveTimeout, setSaveTimeout] = useState<number | null>(null) // Timeout para autoguardado
  const [editingUser, setEditingUser] = useState<string | null>(null) // Usuario editando actualmente

  // Efecto para establecer la conexión WebSocket cuando el usuario inicia sesión
  useEffect(() => {
    if (isLoggedIn && !socketRef.current) {
      // Crea una nueva conexión WebSocket
      const ws = new WebSocket("ws://localhost:4000")
      socketRef.current = ws
      setSocket(ws)

      // Cuando se abre la conexión, envía un mensaje para unirse a la sala
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", room, username }))
      }

      // Manejo de mensajes recibidos
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "doc_update") {
            // Actualización de documento
            setDocContent(data.content || "")
            setEditingUser(data.editedBy || null)
          } else if (data.type === "doc_typing") {
            // Notificación de que alguien está escribiendo
            setEditingUser(data.username || null)
          } else {
            // Mensaje de chat normal
            setMessages((prev) => [...prev, data])
          }
        } catch (err) {
          // Error silencioso al parsear JSON
        }
      }

      // Manejo de errores de conexión
      ws.onerror = () => {
        setError("No se pudo conectar al servidor")
      }

      // Manejo de cierre de conexión
      ws.onclose = () => {
        socketRef.current = null
        setSocket(null)
      }
    }
  }, [isLoggedIn, room, username]) // Se ejecuta cuando cambian estas dependencias

  // Efecto para cargar historial de mensajes y documentos al iniciar sesión o cambiar de sala
  useEffect(() => {
    if (isLoggedIn) {
      // Carga el historial de mensajes
      axios
        .get(`http://localhost:4000/api/history/${room}`)
        .then((response) => {
          setMessages(response.data)
        })
        .catch(() => {
          setError("Error al cargar el historial")
        })

      // Carga los documentos de la sala
      axios
        .get(`http://localhost:4000/api/documents/${room}`)
        .then((response) => {
          setDocuments(response.data)
          // Busca un documento con contenido para mostrarlo
          const doc = response.data.find((d: Document) => d.content)
          if (doc) {
            setDocContent(doc.content || "")
            setLastSavedContent(doc.content || "")
          }
        })
        .catch(() => {
          setError("Error al cargar documentos")
        })
    }
  }, [isLoggedIn, room])

  // Efecto para hacer scroll automático al final de los mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Efecto para autoguardado de documentos con debounce
  useEffect(() => {
    if (docContent !== lastSavedContent && isLoggedIn) {
      // Limpia el timeout anterior si existe
      if (saveTimeout) {
        window.clearTimeout(saveTimeout)
      }

      // Establece un nuevo timeout para guardar después de 2 segundos de inactividad
      const timeout = window.setTimeout(() => {
        updateDoc(docContent, true) // Guarda el documento
        setLastSavedContent(docContent)
      }, 2000) // 2 segundos de debounce

      setSaveTimeout(timeout)
    }

    // Limpieza al desmontar el componente
    return () => {
      if (saveTimeout) {
        window.clearTimeout(saveTimeout)
      }
    }
  }, [docContent, lastSavedContent, isLoggedIn])

  // Función para manejar el inicio de sesión
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await axios.post("http://localhost:4000/auth/login", {
        username,
        password,
      })
      setIsLoggedIn(true)
    } catch (error: any) {
      setError(error.response?.data?.error || "Credenciales inválidas")
    } finally {
      setIsLoading(false)
    }
  }

  // Función para manejar el registro de usuario
  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await axios.post("http://localhost:4000/auth/register", {
        username,
        password,
      })
      alert("Usuario registrado. Por favor, inicia sesión.")
      setShowRegister(false)
    } catch (error: any) {
      setError(error.response?.data?.error || "Error al registrar")
    } finally {
      setIsLoading(false)
    }
  }

  // Función para enviar mensajes
  const sendMessage = () => {
    if (!input || !socket || socket.readyState !== WebSocket.OPEN) {
      setError("No se puede enviar el mensaje: conexión no establecida o mensaje vacío")
      return
    }
    try {
      socket.send(JSON.stringify({ type: "message", room, username, message: input }))
      setInput("") // Limpia el input después de enviar
    } catch (err) {
      setError("Error al enviar el mensaje")
    }
  }

  // Función para subir archivos
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("room", room)

    try {
      await axios.post("http://localhost:4000/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      // Recarga la lista de documentos después de subir
      const response = await axios.get(`http://localhost:4000/api/documents/${room}`)
      setDocuments(response.data)
    } catch (error: any) {
      setError(error.response?.data?.error || "Error al subir archivo")
    } finally {
      setIsUploading(false)
    }
  }

  // Función para actualizar el documento colaborativo
  const updateDoc = (content: string, createVersion = false) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("No se puede actualizar el documento: conexión no establecida")
      return
    }
    try {
      socket.send(
        JSON.stringify({
          type: "doc_update",
          room,
          content,
          username,
          createVersion, // Indica si se debe crear una nueva versión
        }),
      )
      setDocContent(content)
    } catch (err) {
      setError("Error al actualizar el documento")
    }
  }

  // Función para cerrar sesión
  const handleLogout = () => {
    setIsLoggedIn(false)
    setUsername("")
    setPassword("")
    setMessages([])
    setDocuments([])
    setDocContent("")
    setRoom("General")
    setTempRoom("General")
    // Cierra la conexión WebSocket
    if (socketRef.current) {
      socketRef.current.close()
    }
  }

  // Función para cambiar de sala
  const handleChangeRoom = () => {
    if (tempRoom && tempRoom !== room) {
      setRoom(tempRoom)
      setShowRoomModal(false)
    }
  }

  // Función para crear una nueva sala
  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      setRoom(newRoomName.trim())
      setTempRoom(newRoomName.trim())
      setNewRoomName("")
      setShowRoomModal(false)
    }
  }

  // Función para manejar teclas en el input (enviar con Enter)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Función para formatear timestamps en formato hora:minutos
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  // Función para formatear fechas completas
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Función para añadir emojis al mensaje
  const addEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji)
    setShowEmojiPicker(false)
  }

  // Función para cargar versiones de un documento
  const loadDocumentVersions = async (documentId: string) => {
    try {
      const response = await axios.get(`http://localhost:4000/api/version/${documentId}`)
      setDocumentVersions(response.data)
      setShowVersionHistory(true)
    } catch (error: any) {
      setError(error.response?.data?.error || "Error al cargar versiones del documento")
    }
  }

  // Función para restaurar una versión anterior
  const restoreVersion = async (version: DocumentVersion) => {
    setIsVersionRestoring(true)
    try {
      await axios.post(`http://localhost:4000/api/version/restore/${version.id}`, {
        room,
        username,
      })

      // Actualiza la UI con el contenido restaurado
      setDocContent(version.content)
      setLastSavedContent(version.content)
      setShowVersionHistory(false)
      setSelectedVersion(null)

      // Notifica a otros usuarios sobre la restauración
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "doc_update",
            room,
            content: version.content,
            username,
          }),
        )
      }
    } catch (error: any) {
      setError(error.response?.data?.error || "Error al restaurar versión")
    } finally {
      setIsVersionRestoring(false)
    }
  }

  // Lista de emojis disponibles
  const emojis = ["😊", "👍", "❤️", "🎉", "🔥", "😂", "🤔", "👏", "🙏", "✅"]

  // Renderizado condicional: pantalla de login/registro si no está autenticado
  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="w-full max-w-md">
          {/* Cabecera de la aplicación */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Chat Colaborativo</h1>
            <p className="text-gray-600 mt-2">Conecta, colabora y comparte en tiempo real</p>
          </div>

          {/* Tarjeta de login/registro */}
          <div className="bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {showRegister ? "Crear cuenta" : "Bienvenido de nuevo"}
              </h2>
              <p className="text-gray-600 mb-6">
                {showRegister
                  ? "Crea una cuenta para comenzar a colaborar"
                  : "Inicia sesión para continuar con tu trabajo"}
              </p>

              {/* Mensaje de error */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-red-500"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Formulario de registro */}
              {showRegister ? (
                <form onSubmit={handleRegister} className="space-y-5">
                  {/* Campo de usuario */}
                  <div className="space-y-2">
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                      Nombre de usuario
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg
                          className="h-5 w-5 text-gray-400"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                        placeholder="usuario123"
                        className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        required
                      />
                    </div>
                  </div>
                  {/* Campo de contraseña */}
                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Contraseña
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg
                          className="h-5 w-5 text-gray-400"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        required
                      />
                    </div>
                  </div>
                  {/* Botón de registro con estado de carga */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex justify-center items-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                    >
                      {isLoading ? (
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
                        "Crear cuenta"
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                // Formulario de login
                <form onSubmit={handleLogin} className="space-y-5">
                  {/* Campo de usuario */}
                  <div className="space-y-2">
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                      Nombre de usuario
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg
                          className="h-5 w-5 text-gray-400"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                        placeholder="usuario123"
                        className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        required
                      />
                    </div>
                  </div>
                  {/* Campo de contraseña con enlace de recuperación */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        Contraseña
                      </label>
                      <a href="#" className="text-sm font-medium text-teal-600 hover:text-teal-500">
                        ¿Olvidaste tu contraseña?
                      </a>
                    </div>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg
                          className="h-5 w-5 text-gray-400"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        required
                      />
                    </div>
                  </div>
                  {/* Botón de login con estado de carga */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex justify-center items-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                    >
                      {isLoading ? (
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
                        "Iniciar sesión"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Pie de la tarjeta con alternancia entre login/registro */}
            <div className="px-8 py-6 bg-gray-50 border-t border-gray-200">
              <p className="text-center text-sm text-gray-600">
                {showRegister ? "¿Ya tienes una cuenta?" : "¿No tienes una cuenta?"}
                <button
                  type="button"
                  onClick={() => setShowRegister(!showRegister)}
                  className="ml-1 font-medium text-teal-600 hover:text-teal-500 focus:outline-none"
                >
                  {showRegister ? "Iniciar sesión" : "Regístrate ahora"}
                </button>
              </p>
            </div>
          </div>

          {/* Pie de página */}
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-500">
              &copy; {new Date().getFullYear()} Chat Colaborativo. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Interfaz principal cuando el usuario está autenticado
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Cabecera */}
      <header className="bg-white border-b border-gray-200 py-3 px-6 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Logo y nombre de la sala */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-teal-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <h1 className="text-xl font-bold ml-2">Chat Colaborativo</h1>
            </div>
            <div className="hidden md:flex items-center space-x-1">
              <span className="text-sm text-gray-600">Sala actual:</span>
              <span className="bg-teal-100 text-teal-800 text-sm font-medium px-2.5 py-0.5 rounded-full">{room}</span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center space-x-3">
            {/* Botón para cambiar de sala */}
            <button
              onClick={() => setShowRoomModal(true)}
              className="inline-flex items-center px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2 text-gray-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Cambiar sala
            </button>

            {/* Avatar del usuario */}
            <div className="relative">
              <button className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-teal-100 text-teal-800 hover:bg-teal-200 focus:outline-none focus:ring-2 focus:ring-teal-500">
                <span className="font-medium text-sm">{username.substring(0, 2).toUpperCase()}</span>
              </button>
            </div>

            {/* Botón de cierre de sesión */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Mensaje de error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md flex items-start">
          <svg
            className="h-5 w-5 text-red-500 mr-2 mt-0.5 flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Contenido principal - Interfaz unificada */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Columna izquierda - Chat */}
          <div className="flex flex-col h-full">
            <div className="bg-white rounded-xl shadow-md border border-gray-200">
              {/* Cabecera del chat */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 text-teal-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  Chat
                </h3>
                <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {messages.length} mensajes
                </span>
              </div>

              {/* Mensajes del chat */}
              <div className="p-6 h-[500px] overflow-y-auto bg-gray-50">
                <div className="space-y-4">
                  {messages.length > 0 ? (
                    messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex items-start space-x-2 ${msg.username === username ? "justify-end" : ""}`}
                      >
                        {/* Avatar para mensajes de otros usuarios */}
                        {msg.username !== username && (
                          <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                            {msg.username.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className={`max-w-[80%] ${msg.username === username ? "order-first mr-2" : ""}`}>
                          {/* Burbuja de mensaje */}
                          <div
                            className={`px-4 py-3 rounded-2xl ${
                              msg.username === username
                                ? "bg-teal-500 text-white rounded-tr-none"
                                : "bg-white border border-gray-200 shadow-sm rounded-tl-none"
                            }`}
                          >
                            {/* Nombre de usuario para mensajes de otros */}
                            {msg.username !== username && (
                              <p className="text-xs font-medium mb-1 text-gray-600">{msg.username}</p>
                            )}
                            <p className="text-sm">{msg.message}</p>
                          </div>
                          {/* Timestamp del mensaje */}
                          <p className="text-xs text-gray-500 mt-1 ml-2">{formatTimestamp(msg.timestamp)}</p>
                        </div>
                        {/* Avatar para mensajes propios */}
                        {msg.username === username && (
                          <div className="h-10 w-10 rounded-full bg-teal-500 flex items-center justify-center text-white text-sm font-medium">
                            {msg.username.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    // Estado vacío cuando no hay mensajes
                    <div className="flex flex-col items-center justify-center h-full text-center py-10">
                      <div className="bg-gray-100 p-4 rounded-full mb-4">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-10 w-10 text-gray-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-1">No hay mensajes aún</h3>
                      <p className="text-gray-500 max-w-sm">Sé el primero en enviar un mensaje en esta sala de chat.</p>
                    </div>
                  )}
                  {/* Referencia para auto-scroll */}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input para enviar mensajes */}
              <div className="p-4 border-t border-gray-200 bg-white">
                <div className="flex w-full space-x-2">
                  <div className="relative flex-1">
                    <input
                      value={input}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Escribe un mensaje..."
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    {/* Botón de emojis */}
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-7.536 5.879a1 1 0 001.415 0 3 3 0 014.242 0 1 1 0 001.415-1.415 5 5 0 00-7.072 0 1 1 0 000 1.415z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    {/* Selector de emojis */}
                    {showEmojiPicker && (
                      <div className="absolute right-0 bottom-12 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-10">
                        <div className="flex flex-wrap gap-2 max-w-[200px]">
                          {emojis.map((emoji, index) => (
                            <button
                              key={index}
                              onClick={() => addEmoji(emoji)}
                              className="text-xl hover:bg-gray-100 p-1 rounded"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Botón de enviar */}
                  <button
                    onClick={sendMessage}
                    className="inline-flex items-center justify-center px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Botón para exportar historial */}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => window.open(`http://localhost:4000/api/export/${room}?format=txt`)}
                className="inline-flex items-center px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Descargar historial
              </button>
            </div>
          </div>

          {/* Columna derecha - Documento colaborativo */}
          <div className="flex flex-col h-full">
            <div className="bg-white rounded-xl shadow-md border border-gray-200">
              {/* Cabecera del documento */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 text-teal-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Documento colaborativo
                </h3>
                {/* Botón para ver historial de versiones */}
                <button
                  onClick={() => {
                    const doc = documents.find((d) => d.room === room && d.content)
                    if (doc) {
                      loadDocumentVersions(doc.id)
                    } else {
                      setError("No hay versiones disponibles para este documento")
                    }
                  }}
                  className="inline-flex items-center px-2 py-1 text-xs bg-teal-50 border border-teal-200 text-teal-700 rounded-md hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Historial de versiones
                </button>
              </div>
              <div className="p-6">
                {/* Información del documento */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 mr-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Documento de la sala: {room}</h4>
                      <p className="text-xs text-gray-500">
                        {editingUser ? `Editando: ${editingUser}` : "Edición en tiempo real"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <span className="h-2 w-2 mr-1 bg-green-500 rounded-full"></span>
                      Colaborativo
                    </span>
                  </div>
                </div>
                {/* Editor de documento */}
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  {/* Barra de herramientas */}
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-300 flex items-center space-x-2">
                    <button
                      onClick={() => updateDoc(docContent, true)}
                      className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
                      title="Guardar versión"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2-2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                      </svg>
                    </button>
                    {/* Otros botones de herramientas */}
                    <button className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <button className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    <button className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                  {/* Área de texto para edición colaborativa */}
                  <textarea
                    value={docContent}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                      setDocContent(e.target.value)
                      // Notifica a otros usuarios que estás escribiendo
                      if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(
                          JSON.stringify({
                            type: "doc_typing",
                            room,
                            username,
                          }),
                        )
                      }
                    }}
                    placeholder="Escribe aquí el contenido del documento colaborativo..."
                    className="w-full h-[400px] px-4 py-3 border-0 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
            </div>

            {/* Botón para subir archivos */}
            <div className="flex justify-between mt-4">
              <div className="relative">
                <input
                  id="file-upload"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleUpload}
                  className="sr-only"
                  disabled={isUploading}
                />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center px-4 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors cursor-pointer"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  {isUploading ? "Subiendo..." : "Subir archivo"}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Sección de archivos compartidos */}
        <div className="mt-6 bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2 text-teal-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Archivos compartidos
            </h3>
            <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {documents.length} archivos
            </span>
          </div>
          <div className="p-6">
            {documents.length > 0 ? (
              // Lista de documentos
              <div className="overflow-hidden bg-white rounded-lg border border-gray-200">
                <ul className="divide-y divide-gray-200">
                  {documents.map((doc) => (
                    <li key={doc.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0">
                          <div className="flex-shrink-0 bg-gray-100 p-2 rounded-lg">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-6 w-6 text-gray-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              <line x1="16" y1="13" x2="8" y2="13"></line>
                              <line x1="16" y1="17" x2="8" y2="17"></line>
                              <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                          </div>
                          <div className="ml-3 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                            <p className="text-xs text-gray-500">
                              Modificado: {new Date(doc.lastModified).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setSelectedDocument(doc)}
                            className="p-1 text-gray-500 hover:text-teal-600 rounded-full hover:bg-gray-100"
                            title="Ver detalles"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                              <path
                                fillRule="evenodd"
                                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                          <a
                            href={`http://localhost:4000/api/download/${doc.id}`}
                            download
                            className="p-1 text-gray-500 hover:text-teal-600 rounded-full hover:bg-gray-100"
                            title="Descargar"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </a>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              // Estado vacío cuando no hay documentos
              <div className="flex flex-col items-center justify-center text-center py-10 bg-gray-50 rounded-lg border border-gray-200 border-dashed">
                <div className="bg-gray-100 p-4 rounded-full mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No hay archivos</h3>
                <p className="text-gray-500 max-w-sm mb-4">
                  Sube tu primer archivo para compartirlo con todos en esta sala.
                </p>
                <label
                  htmlFor="file-upload-empty"
                  className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  Subir archivo
                  <input
                    id="file-upload-empty"
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleUpload}
                    className="sr-only"
                    disabled={isUploading}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal para cambiar de sala */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Cambiar de sala</h3>
              <button onClick={() => setShowRoomModal(false)} className="text-gray-400 hover:text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <label htmlFor="room-name" className="block text-sm font-medium text-gray-700 mb-2">
                Unirse a una sala existente
              </label>
              <div className="flex items-center">
                <input
                  id="room-name"
                  type="text"
                  value={tempRoom}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempRoom(e.target.value)}
                  placeholder="Nombre de la sala"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <button
                  onClick={handleChangeRoom}
                  className="ml-2 inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                >
                  Unirse
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="new-room" className="block text-sm font-medium text-gray-700 mb-2">
                Crear una nueva sala
              </label>
              <div className="flex items-center">
                <input
                  id="new-room"
                  type="text"
                  value={newRoomName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRoomName(e.target.value)}
                  placeholder="Nombre de la nueva sala"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <button
                  onClick={handleCreateRoom}
                  className="ml-2 inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                >
                  Crear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalles del documento */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Detalles del documento</h3>
              <button onClick={() => setSelectedDocument(null)} className="text-gray-400 hover:text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 bg-gray-100 p-3 rounded-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-gray-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <div className="ml-4">
                  <h4 className="text-lg font-medium text-gray-900">{selectedDocument.title}</h4>
                  <p className="text-sm text-gray-500 mt-1">ID: {selectedDocument.id}</p>
                  <p className="text-sm text-gray-500">Sala: {selectedDocument.room}</p>
                  <p className="text-sm text-gray-500">
                    Última modificación: {new Date(selectedDocument.lastModified).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setSelectedDocument(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
              >
                Cerrar
              </button>
              <a
                href={`http://localhost:4000/api/download/${selectedDocument.id}`}
                download
                className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Descargar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal de historial de versiones */}
      {showVersionHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Historial de versiones del documento</h3>
              <button
                onClick={() => {
                  setShowVersionHistory(false)
                  setSelectedVersion(null)
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <p className="text-sm text-gray-600">
                  Selecciona una versión para ver su contenido. Puedes restaurar cualquier versión anterior.
                </p>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-1 text-xs font-medium text-gray-500">Versión</div>
                    <div className="col-span-3 text-xs font-medium text-gray-500">Fecha</div>
                    <div className="col-span-3 text-xs font-medium text-gray-500">Autor</div>
                    <div className="col-span-5 text-xs font-medium text-gray-500">Acciones</div>
                  </div>
                </div>

                <div className="divide-y divide-gray-200 max-h-[300px] overflow-y-auto">
                  {documentVersions.length > 0 ? (
                    documentVersions.map((version, index) => (
                      <div
                        key={version.id}
                        className={`px-4 py-3 ${selectedVersion?.id === version.id ? "bg-teal-50" : "hover:bg-gray-50"}`}
                      >
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-1">
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs font-medium">
                              {documentVersions.length - index}
                            </span>
                          </div>
                          <div className="col-span-3">
                            <p className="text-sm text-gray-900">{formatDate(version.createdAt)}</p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-sm text-gray-900">{version.createdBy}</p>
                          </div>
                          <div className="col-span-5 flex items-center space-x-2">
                            <button
                              onClick={() => setSelectedVersion(version)}
                              className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 border border-gray-200 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-3 w-3 mr-1"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                <path
                                  fillRule="evenodd"
                                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Ver
                            </button>
                            <button
                              onClick={() => restoreVersion(version)}
                              disabled={isVersionRestoring}
                              className="inline-flex items-center px-2 py-1 text-xs bg-teal-100 border border-teal-200 text-teal-700 rounded-md hover:bg-teal-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                            >
                              {isVersionRestoring ? (
                                <svg
                                  className="animate-spin h-3 w-3 mr-1"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3 w-3 mr-1"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                              Restaurar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center">
                      <p className="text-gray-500">No hay versiones disponibles para este documento.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedVersion && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Vista previa de la versión</h4>
                <div className="border border-gray-300 rounded-lg bg-gray-50 p-4 max-h-[200px] overflow-y-auto">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap">{selectedVersion.content}</pre>
                </div>
              </div>
            )}

            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={() => {
                  setShowVersionHistory(false)
                  setSelectedVersion(null)
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatAppComponent