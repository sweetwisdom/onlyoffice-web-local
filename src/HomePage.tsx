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
import { LanguageSwitcher, useLocale } from './i18n'
import { setPendingDoc } from './pendingDoc'

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

const NEW_TYPES: { ext: 'docx' | 'xlsx' | 'pptx' | 'pdf'; key: 'typeWord' | 'typeCell' | 'typeSlide' | 'typePdf'; cls: string }[] = [
  { ext: 'docx', key: 'typeWord', cls: 'word' },
  { ext: 'xlsx', key: 'typeCell', cls: 'cell' },
  { ext: 'pptx', key: 'typeSlide', cls: 'slide' },
  { ext: 'pdf', key: 'typePdf', cls: 'pdf' }
]

export function HomePage(props: { navigate: (to: string) => void }) {
  const { navigate } = props
  const { t } = useLocale()
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
      title: `${t('newDocTitle')}.${ext}`,
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
      setError(`${t('openFailed')}${(e as Error)?.message || e}`)
    }
  }

  async function onPickDir() {
    setError('')
    try {
      const handle = await pickDirectory()
      setDir(handle)
      setNeedAuth(false)
      await refreshList(handle)
      setStatus(`${t('workspacePrefix')}${handle.name}`)
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
      setError(String((e as Error)?.message || e))
    }
  }

  async function onReauth() {
    if (!dir) return
    const perm = await ensurePermission(dir, 'readwrite')
    if (perm !== 'granted') {
      setError(t('permDenied'))
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
            <div className="brand-sub">{t('brandSub')}</div>
          </div>
        </div>

        <button type="button" className="nav-new" onClick={() => openNew('docx')}>
          <span className="plus">+</span> {t('navNew')}
        </button>

        <nav className="nav">
          <button type="button" className="nav-item active" onClick={() => navigate('/')}>
            {t('navOpen')}
          </button>
          {fsOk && (
            <button type="button" className="nav-item" onClick={() => void onPickDir()}>
              {t('navFolder')}
            </button>
          )}
          {needAuth && (
            <button type="button" className="nav-item" onClick={() => void onReauth()}>
              {t('navReauth')}
            </button>
          )}
        </nav>

        <div className="sider-foot">
          <LanguageSwitcher />
          {dir && (
            <button
              type="button"
              className="nav-item mute"
              onClick={() => {
                void clearDirectoryHandle()
                setDir(null)
                setFiles([])
                setStatus(t('workspaceCleared'))
              }}
            >
              {t('navClearWorkspace')}
            </button>
          )}
        </div>
      </aside>

      <main className="main-pane">
        <div className="quick-types">
          {NEW_TYPES.map((item) => (
            <button
              key={item.ext}
              type="button"
              className={`type-chip ${item.cls}`}
              title={`${t('navNew')} ${t(item.key)}`}
              onClick={() => openNew(item.ext)}
            >
              {item.ext === 'docx' ? 'W' : item.ext === 'xlsx' ? 'X' : item.ext === 'pptx' ? 'P' : 'PDF'}
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
          <h3>{t('dropTitle')}</h3>
          <p>{t('dropHint')}</p>
          <p className="formats">Supports: DOCX, DOC, XLSX, XLS, PPTX, PPT, PDF</p>
        </label>

        <section className="block">
          <h2>{t('sectionNew')}</h2>
          <div className="new-grid">
            {NEW_TYPES.map((item) => (
              <button key={item.ext} type="button" className="new-card" onClick={() => openNew(item.ext)}>
                <span className={`type-icon ${item.cls}`}>
                  {item.ext === 'docx' ? 'W' : item.ext === 'xlsx' ? 'X' : item.ext === 'pptx' ? 'P' : 'PDF'}
                </span>
                <span>{t(item.key)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-head">
            <h2>
              {t('sectionRecent')}
              {dir ? ` · ${dir.name}` : ''}
            </h2>
            {dir && (
              <button type="button" className="linkish" onClick={() => void refreshList(dir)}>
                {t('refresh')}
              </button>
            )}
          </div>
          <div className="recent-list">
            {!files.length && (
              <div className="recent-empty">
                <p>{t('recentEmpty')}</p>
                <p className="mute">{t('recentEmptyHint')}</p>
              </div>
            )}
            {files.map((f) => (
              <button
                key={f.name}
                type="button"
                className="recent-item"
                onClick={() => void openWorkspaceFile(f)}
              >
                <span
                  className={`type-icon sm ${
                    f.fileType === 'xlsx' || f.fileType === 'xls'
                      ? 'cell'
                      : f.fileType === 'pptx' || f.fileType === 'ppt'
                        ? 'slide'
                        : f.fileType === 'pdf'
                          ? 'pdf'
                          : 'word'
                  }`}
                >
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
