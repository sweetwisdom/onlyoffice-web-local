/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_API_URL: string
  VITE_APP_TITLE: string
  VITE_PORT: number
  // 其他环境变量声明...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// OnlyOffice 本地编辑器 API（./web-apps/apps/api/documents/api.js 动态加载）
interface Window {
  DocsAPI: any
}
