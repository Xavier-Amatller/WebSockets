# Chat Colaborativo en Tiempo Real

Una aplicación web de chat colaborativo que permite a los usuarios comunicarse, editar documentos en tiempo real y compartir archivos en salas temáticas.

## Características

- **Chat en tiempo real**: Comunicación instantánea entre usuarios en la misma sala
- **Edición colaborativa de documentos**: Edición simultánea de documentos con indicadores de quién está editando
- **Historial de versiones**: Sistema completo de control de versiones para documentos
- **Gestión de archivos**: Subida, descarga y visualización de archivos compartidos
- **Sistema de salas**: Creación y cambio entre diferentes salas de chat
- **Autenticación de usuarios**: Registro e inicio de sesión de usuarios

## Tecnologías utilizadas

### Backend
- Node.js
- Express
- WebSockets (ws)
- Multer (para manejo de archivos)
- UUID (para generación de identificadores únicos)

### Frontend
- React
- TypeScript
- Tailwind CSS
- Axios (para peticiones HTTP)


## Instalación

### Requisitos previos
- Node.js (v14 o superior)
- npm o yarn

### Pasos para la instalación

1. Clonar el repositorio:
\`\`\`bash
git clone https://github.com/tu-usuario/chat-colaborativo.git
cd chat-colaborativo
\`\`\`

2. Instalar dependencias del servidor:
\`\`\`bash
cd server
npm install
\`\`\`

3. Instalar dependencias del cliente:
\`\`\`bash
cd ../client
npm install
\`\`\`

## Ejecución

1. Iniciar el servidor:
\`\`\`bash
cd server
npm start
\`\`\`

2. Iniciar el cliente:
\`\`\`bash
cd ../client
npm run dev
\`\`\`

3. Abrir el navegador en `http://localhost:3000`

## Uso

1. **Registro/Inicio de sesión**: Crea una cuenta o inicia sesión con credenciales existentes
2. **Cambiar de sala**: Usa el botón "Cambiar sala" para unirte a una sala existente o crear una nueva
3. **Enviar mensajes**: Escribe en el campo de texto y presiona Enter o el botón de enviar
4. **Editar documentos**: Escribe en el área de texto del documento colaborativo
5. **Subir archivos**: Usa el botón "Subir archivo" para compartir archivos con otros usuarios
6. **Ver historial de versiones**: Haz clic en "Historial de versiones" para ver y restaurar versiones anteriores

## Funcionalidades principales

### Sistema de chat en tiempo real
- Mensajes instantáneos entre usuarios
- Indicador de quién está escribiendo
- Historial de mensajes por sala
- Exportación del historial de chat

### Edición colaborativa de documentos
- Edición simultánea por múltiples usuarios
- Indicador de quién está editando
- Guardado automático con sistema de versiones
- Restauración de versiones anteriores

### Gestión de archivos
- Subida de archivos (imágenes, PDFs)
- Visualización de archivos compartidos
- Descarga de archivos

