import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  clearDirectoryHandle,
  ensurePermission,
  listOfficeFiles,
  loadDirectoryHandle,
  pickDirectory,
  readFileBuffer,
  supportsFileSystemAccess,
  type WorkspaceFile
} from './fs/workspace'
import { setPendingDoc } from './pendingDoc'

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

const NEW_TYPES: { ext: 'docx' | 'xlsx' | 'pptx' | 'pdf'; label: string; cls: string }[] = [
  { ext: 'docx', label: '文档', cls: 'word' },
  { ext: 'xlsx', label: '电子表格', cls: 'cell' },
  { ext: 'pptx', label: '演示文稿', cls: 'slide' },
  { ext: 'pdf', label: 'PDF', cls: 'pdf' }
]

export function HomePage(props: { navigate: (to: string) => void }) {
  const { navigate } = props
  const fsOk = useMemo(() => supportsFileSystemAccess(), [])
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [needAuth, setNeedAuth] = useState(false)
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const refreshList = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setFiles(await listOfficeFiles(handle))
  }, [])

  useEffect(() => {
    if (!fsOk) return
    let cancelled = false
    ;(async () => {
      try {
        const saved = await loadDirectoryHandle()
        if (!saved || cancelled) return
        const perm = await saved.queryPermission({ mode: 'readwrite' })
        if (perm === 'granted') {
          setDir(saved)
          setNeedAuth(false)
          await refreshList(saved)
        } else {
          setDir(saved)
          setNeedAuth(true)
        }
      } catch (e) {
        console.warn(e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fsOk, refreshList])

  function openNew(ext: 'docx' | 'xlsx' | 'pptx' | 'pdf') {
    setPendingDoc({
      title: `新建文档.${ext}`,
      fileType: ext,
      buffer: null,
      ephemeral: true
    })
    navigate(`/editor?new=${ext}`)
  }

  async function openFile(file: File) {
    const fileType = file.name.split('.').pop()?.toLowerCase() || 'docx'
    const buffer = await file.arrayBuffer()
    setPendingDoc({
      title: file.name,
      fileType,
      buffer,
      ephemeral: true
    })
    navigate(`/editor?open=${fileType}`)
  }

  async function openWorkspaceFile(file: WorkspaceFile) {
    try {
      const buffer = await readFileBuffer(file.handle)
      setPendingDoc({
        title: file.name,
        fileType: file.fileType,
        buffer,
        handle: file.handle
      })
      navigate(`/editor?open=${file.fileType}`)
    } catch (e) {
      setError(`打开失败：${(e as Error)?.message || e}`)
    }
  }

  async function onPickDir() {
    setError('')
    try {
      const handle = await pickDirectory()
      setDir(handle)
      setNeedAuth(false)
      await refreshList(handle)
      setStatus(`工作区：${handle.name}`)
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
      setError(String((e as Error)?.message || e))
    }
  }

  async function onReauth() {
    if (!dir) return
    const perm = await ensurePermission(dir, 'readwrite')
    if (perm !== 'granted') {
      setError('未获得目录读写权限')
      return
    }
    setNeedAuth(false)
    await refreshList(dir)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void openFile(f)
  }

  return (
    <div className="shell">
      <aside className="sider">
        <div className="brand">
          <span className="logo">OO</span>
          <div>
            <div className="brand-name">office-web-local</div>
            <div className="brand-sub">本地编辑 · 不连服务器</div>
          </div>
        </div>

        <button type="button" className="nav-new" onClick={() => openNew('docx')}>
          <span className="plus">+</span> 新建
        </button>

        <nav className="nav">
          <button type="button" className="nav-item active" onClick={() => navigate('/')}>
            打开
          </button>
          {fsOk && (
            <button type="button" className="nav-item" onClick={() => void onPickDir()}>
              本机文件夹
            </button>
          )}
          {needAuth && (
            <button type="button" className="nav-item" onClick={() => void onReauth()}>
              重新授权
            </button>
          )}
        </nav>

        <div className="sider-foot">
          {dir && (
            <button
              type="button"
              className="nav-item mute"
              onClick={() => {
                void clearDirectoryHandle()
                setDir(null)
                setFiles([])
                setStatus('已清除工作区')
              }}
            >
              清除工作区
            </button>
          )}
        </div>
      </aside>

      <main className="main-pane">
        <div className="quick-types">
          {NEW_TYPES.map((t) => (
            <button
              key={t.ext}
              type="button"
              className={`type-chip ${t.cls}`}
              title={`新建 ${t.label}`}
              onClick={() => openNew(t.ext)}
            >
              {t.ext === 'docx' ? 'W' : t.ext === 'xlsx' ? 'X' : t.ext === 'pptx' ? 'P' : 'PDF'}
            </button>
          ))}
        </div>

        {error && <div className="banner warn">{error}</div>}
        {status && <p className="hint-line">{status}</p>}

        <label
          className={`dropzone${dragOver ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            hidden
            accept=".docx,.xlsx,.pptx,.pdf,.doc,.xls,.ppt,.odt,.ods,.odp"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void openFile(f)
              e.target.value = ''
            }}
          />
          <div className="drop-icon">↑</div>
          <h3>选择文件</h3>
          <p>将 Office 文档拖放到此处，或点击从计算机浏览</p>
          <p className="formats">Supports: DOCX, DOC, XLSX, XLS, PPTX, PPT, PDF</p>
        </label>

        <section className="block">
          <h2>新建</h2>
          <div className="new-grid">
            {NEW_TYPES.map((t) => (
              <button key={t.ext} type="button" className="new-card" onClick={() => openNew(t.ext)}>
                <span className={`type-icon ${t.cls}`}>
                  {t.ext === 'docx' ? 'W' : t.ext === 'xlsx' ? 'X' : t.ext === 'pptx' ? 'P' : 'PDF'}
                </span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-head">
            <h2>最近{dir ? ` · ${dir.name}` : ''}</h2>
            {dir && (
              <button type="button" className="linkish" onClick={() => void refreshList(dir)}>
                刷新
              </button>
            )}
          </div>
          <div className="recent-list">
            {!files.length && (
              <div className="recent-empty">
                <p>无最近文件</p>
                <p className="mute">打开本机文件夹或拖入文件后，会出现在这里以便快速访问</p>
              </div>
            )}
            {files.map((f) => (
              <button
                key={f.name}
                type="button"
                className="recent-item"
                onClick={() => void openWorkspaceFile(f)}
              >
                <span className={`type-icon sm ${f.fileType === 'xlsx' || f.fileType === 'xls' ? 'cell' : f.fileType === 'pptx' || f.fileType === 'ppt' ? 'slide' : f.fileType === 'pdf' ? 'pdf' : 'word'}`}>
                  {f.fileType.slice(0, 3).toUpperCase()}
                </span>
                <span className="recent-meta">
                  <span className="name">{f.name}</span>
                  <span className="sub">
                    {formatSize(f.size)} · {new Date(f.lastModified).toLocaleString()}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
