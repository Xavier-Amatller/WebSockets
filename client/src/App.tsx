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
    try {
      await axios.post("http://localhost:4000/auth/login", {
        username,
        password,
      })
      setIsLoggedIn(true)
    } catch (error: any) {
      setError(error.response?.data?.error || "Credenciales inválidas")
    }
  }

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    try {
      await axios.post("http://localhost:4000/auth/register", {
        username,
        password,
      })
      alert("Usuario registrado. Por favor, inicia sesión.")
      setShowRegister(false)
    } catch (error: any) {
      setError(error.response?.data?.error || "Error al registrar")
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
    const formData = new FormData()
    formData.append("file", file)
    formData.append("room", room)
    try {
      await axios.post("http://localhost:4000/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      alert("Archivo subido")
      const response = await axios.get(`http://localhost:4000/api/documents/${room}`)
      setDocuments(response.data)
    } catch (error: any) {
      setError(error.response?.data?.error || "Error al subir archivo")
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
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-center mb-6">{showRegister ? "Crear cuenta" : "Iniciar sesión"}</h2>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md">{error}</div>}

          {showRegister ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium block">
                  Usuario
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                  placeholder="Nombre de usuario"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium block">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Registrar
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                  className="w-full bg-white text-blue-600 border border-blue-600 py-2 px-4 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Volver al login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium block">
                  Usuario
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                  placeholder="Nombre de usuario"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium block">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegister(true)}
                  className="w-full bg-white text-blue-600 border border-blue-600 py-2 px-4 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Crear cuenta
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 py-4 px-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold">Chat Colaborativo</h1>
          <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">{room}</span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={tempRoom}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempRoom(e.target.value)}
              placeholder="Cambiar sala"
              className="w-40 px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleChangeRoom}
              className="inline-flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Unirse
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md">{error}</div>}

      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full flex flex-col">
          <div className="mb-4 border-b border-gray-200">
            <div className="flex space-x-4">
              <button
                onClick={() => setActiveTab("chat")}
                className={`pb-2 px-1 ${
                  activeTab === "chat"
                    ? "border-b-2 border-blue-500 text-blue-600 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <div className="flex items-center">
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
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  Chat
                </div>
              </button>
              <button
                onClick={() => setActiveTab("documents")}
                className={`pb-2 px-1 ${
                  activeTab === "documents"
                    ? "border-b-2 border-blue-500 text-blue-600 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <div className="flex items-center">
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

          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col space-y-4 h-full">
              <div className="flex-1 overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 h-[calc(100vh-280px)] overflow-y-auto">
                  <div className="space-y-4">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex items-start space-x-2 ${msg.username === username ? "justify-end" : ""}`}
                      >
                        {msg.username !== username && (
                          <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">
                            {msg.username.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] px-4 py-2 rounded-lg ${
                            msg.username === username ? "bg-blue-500 text-white" : "bg-gray-100"
                          }`}
                        >
                          {msg.username !== username && <p className="text-xs font-medium mb-1">{msg.username}</p>}
                          <p className="text-sm">{msg.message}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                <div className="p-4 border-t border-gray-200">
                  <div className="flex w-full space-x-2">
                    <input
                      value={input}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={sendMessage}
                      className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
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

              <div className="flex justify-end">
                <button
                  onClick={() => window.open(`http://localhost:4000/api/export/${room}?format=txt`)}
                  className="inline-flex items-center px-3 py-1 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {activeTab === "documents" && (
            <div className="flex-1 flex flex-col space-y-4 h-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="text-lg font-medium">Archivos compartidos</h3>
                  </div>
                  <div className="p-4">
                    <div className="mb-4">
                      <label htmlFor="file-upload" className="block text-sm font-medium mb-2">
                        Subir nuevo archivo
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          id="file-upload"
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          onChange={handleUpload}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
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
                        </button>
                      </div>
                    </div>

                    {documents.length > 0 ? (
                      <ul className="divide-y">
                        {documents.map((doc) => (
                          <li key={doc.id} className="py-2">
                            <a
                              href={`http://localhost:4000/api/download/${doc.id}`}
                              download
                              className="flex items-center text-sm text-blue-600 hover:underline"
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
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                              </svg>
                              {doc.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">No hay archivos compartidos</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <h3 className="text-lg font-medium">Documento colaborativo</h3>
                  </div>
                  <div className="p-4">
                    <textarea
                      value={docContent}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateDoc(e.target.value)}
                      placeholder="Escribe aquí el contenido del documento..."
                      className="w-full min-h-[200px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
