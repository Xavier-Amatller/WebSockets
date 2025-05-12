"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import axios from "axios"

// Definir tipos para los mensajes y documentos
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

const App: React.FC = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [docContent, setDocContent] = useState("")
  const [input, setInput] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [room, setRoom] = useState("General")
  const [tempRoom, setTempRoom] = useState("General")
  const [error, setError] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [activeTab, setActiveTab] = useState("chat")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showRoomModal, setShowRoomModal] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)

  useEffect(() => {
    if (isLoggedIn && !socketRef.current) {
      const ws = new WebSocket("ws://localhost:4000")
      socketRef.current = ws
      setSocket(ws)

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", room, username }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "doc_update") {
            setDocContent(data.content || "")
          } else {
            setMessages((prev) => [...prev, data])
          }
        } catch (err) {
          // Silent error
        }
      }

      ws.onerror = () => {
        setError("No se pudo conectar al servidor")
      }

      ws.onclose = () => {
        socketRef.current = null
        setSocket(null)
      }
    }
  }, [isLoggedIn, room, username])

  useEffect(() => {
    if (isLoggedIn) {
      axios
        .get(`http://localhost:4000/api/history/${room}`)
        .then((response) => {
          setMessages(response.data)
        })
        .catch(() => {
          setError("Error al cargar el historial")
        })

      axios
        .get(`http://localhost:4000/api/documents/${room}`)
        .then((response) => {
          setDocuments(response.data)
          const doc = response.data.find((d: Document) => d.content)
          setDocContent(doc?.content || "")
        })
        .catch(() => {
          setError("Error al cargar documentos")
        })
    }
  }, [isLoggedIn, room])

  useEffect(() => {
    // Scroll to bottom of messages
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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

  const sendMessage = () => {
    if (!input || !socket || socket.readyState !== WebSocket.OPEN) {
      setError("No se puede enviar el mensaje: conexión no establecida o mensaje vacío")
      return
    }
    try {
      socket.send(JSON.stringify({ type: "message", room, username, message: input }))
      setInput("")
    } catch (err) {
      setError("Error al enviar el mensaje")
    }
  }

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
      const response = await axios.get(`http://localhost:4000/api/documents/${room}`)
      setDocuments(response.data)
    } catch (error: any) {
      setError(error.response?.data?.error || "Error al subir archivo")
    } finally {
      setIsUploading(false)
    }
  }

  const updateDoc = (content: string) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("No se puede actualizar el documento: conexión no establecida")
      return
    }
    try {
      socket.send(JSON.stringify({ type: "doc_update", room, content }))
      setDocContent(content)
    } catch (err) {
      setError("Error al actualizar el documento")
    }
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setUsername("")
    setPassword("")
    setMessages([])
    setDocuments([])
    setDocContent("")
    setRoom("General")
    setTempRoom("General")
    if (socketRef.current) {
      socketRef.current.close()
    }
  }

  const handleChangeRoom = () => {
    if (tempRoom && tempRoom !== room) {
      setRoom(tempRoom)
      setShowRoomModal(false)
    }
  }

  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      setRoom(newRoomName.trim())
      setTempRoom(newRoomName.trim())
      setNewRoomName("")
      setShowRoomModal(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const addEmoji = (emoji: string) => {
    setInput(prev => prev + emoji)
    setShowEmojiPicker(false)
  }

  const emojis = ["😊", "👍", "❤️", "🎉", "🔥", "😂", "🤔", "👏", "🙏", "✅"]

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Chat Colaborativo</h1>
            <p className="text-gray-600 mt-2">Conecta, colabora y comparte en tiempo real</p>
          </div>
          
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

              {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {showRegister ? (
                <form onSubmit={handleRegister} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                      Nombre de usuario
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
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
                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Contraseña
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
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
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex justify-center items-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                    >
                      {isLoading ? (
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : "Crear cuenta"}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                      Nombre de usuario
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
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
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
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
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full flex justify-center items-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                    >
                      {isLoading ? (
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : "Iniciar sesión"}
                    </button>
                  </div>
                </form>
              )}
            </div>
            
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
          
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-500">
              &copy; {new Date().getFullYear()} Chat Colaborativo. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-3 px-6 shadow-sm">
        <div className="flex items-center justify-between">
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
              <span className="bg-teal-100 text-teal-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                {room}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
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
            
            <div className="relative">
              <button
                className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-teal-100 text-teal-800 hover:bg-teal-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <span className="font-medium text-sm">{username.substring(0, 2).toUpperCase()}</span>
              </button>
            </div>
            
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

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md flex items-start">
          <svg className="h-5 w-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
          <button 
            onClick={() => setError(null)} 
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full flex flex-col">
          {/* Tabs */}
          <div className="mb-6">
            <div className="flex space-x-1 border-b border-gray-200">
              <button
                onClick={() => setActiveTab("chat")}
                className={`py-3 px-4 ${
                  activeTab === "chat"
                    ? "border-b-2 border-teal-500 text-teal-600 font-medium"
                    : "text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:border-b"
                } transition-colors`}
              >
                <div className="flex items-center">
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
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  Chat
                </div>
              </button>
              <button
                onClick={() => setActiveTab("documents")}
                className={`py-3 px-4 ${
                  activeTab === "documents"
                    ? "border-b-2 border-teal-500 text-teal-600 font-medium"
                    : "text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:border-b"
                } transition-colors`}
              >
                <div className="flex items-center">
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
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Documentos
                </div>
              </button>
            </div>
          </div>

          {/* Chat Tab */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col h-full">
              <div className="flex-1 overflow-hidden bg-white rounded-xl shadow-md border border-gray-200">
                {/* Chat messages */}
                <div className="p-6 h-[calc(100vh-280px)] overflow-y-auto bg-gray-50">
                  <div className="space-y-4">
                    {messages.length > 0 ? (
                      messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex items-start space-x-2 ${msg.username === username ? "justify-end" : ""}`}
                        >
                          {msg.username !== username && (
                            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                              {msg.username.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className={`max-w-[80%] ${msg.username === username ? "order-first mr-2" : ""}`}>
                            <div
                              className={`px-4 py-3 rounded-2xl ${
                                msg.username === username 
                                  ? "bg-teal-500 text-white rounded-tr-none" 
                                  : "bg-white border border-gray-200 shadow-sm rounded-tl-none"
                              }`}
                            >
                              {msg.username !== username && (
                                <p className="text-xs font-medium mb-1 text-gray-600">{msg.username}</p>
                              )}
                              <p className="text-sm">{msg.message}</p>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-2">
                              {formatTimestamp(msg.timestamp)}
                            </p>
                          </div>
                          {msg.username === username && (
                            <div className="h-10 w-10 rounded-full bg-teal-500 flex items-center justify-center text-white text-sm font-medium">
                              {msg.username.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
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
                        <p className="text-gray-500 max-w-sm">
                          Sé el primero en enviar un mensaje en esta sala de chat.
                        </p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                
                {/* Message input */}
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
                      <button 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-7.536 5.879a1 1 0 001.415 0 3 3 0 014.242 0 1 1 0 001.415-1.415 5 5 0 00-7.072 0 1 1 0 000 1.415z" clipRule="evenodd" />
                        </svg>
                      </button>
                      
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

              {/* Export button */}
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
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && (
            <div className="flex-1 flex flex-col h-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Files section */}
                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">Archivos compartidos</h3>
                    <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {documents.length} archivos
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="mb-6">
                      <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
                        Subir nuevo archivo
                      </label>
                      <div className="flex items-center">
                        <div className="relative flex-1">
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
                            className="flex items-center justify-center w-full px-4 py-3 border border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5 text-gray-400 mr-2"
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
                            <span className="text-sm text-gray-600">
                              {isUploading ? "Subiendo..." : "Haz clic para seleccionar un archivo"}
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {documents.length > 0 ? (
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
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                  <a
                                    href={`http://localhost:4000/api/download/${doc.id}`}
                                    download
                                    className="p-1 text-gray-500 hover:text-teal-600 rounded-full hover:bg-gray-100"
                                    title="Descargar"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                  </a>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
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
                          htmlFor="file-upload"
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
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Collaborative document */}
                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Documento colaborativo</h3>
                  </div>
                  <div className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 mr-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">Documento de la sala: {room}</h4>
                          <p className="text-xs text-gray-500">Edición en tiempo real</p>
                        </div>
                      </div>
                      <div>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <span className="h-2 w-2 mr-1 bg-green-500 rounded-full"></span>
                          Colaborativo
                        </span>
                      </div>
                    </div>
                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-300 flex items-center space-x-2">
                        <button className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                      <textarea
                        value={docContent}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateDoc(e.target.value)}
                        placeholder="Escribe aquí el contenido del documento colaborativo..."
                        className="w-full min-h-[300px] px-4 py-3 border-0 focus:outline-none focus:ring-0 resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Room change modal */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Cambiar de sala</h3>
              <button 
                onClick={() => setShowRoomModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Document detail modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Detalles del documento</h3>
              <button 
                onClick={() => setSelectedDocument(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    </div>
  )
}

export default App
