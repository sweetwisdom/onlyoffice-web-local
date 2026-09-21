import { useEffect, useRef, useState } from 'react'
import {
  bufferToBlobUrl,
  createEditor,
  type OfficeEditor
} from 'oo-offline'
import { LanguageSwitcher, useLocale } from './i18n'
import { clearPendingDoc, getPendingDoc, type PendingDoc } from './pendingDoc'
import { writeFileBuffer } from './fs/workspace'
import { parseEditorQuery } from './route'

const BASE_URL = new URL(import.meta.env.BASE_URL || './', window.location.href).href

function docFromPath(
  path: string,
  titles: { newDoc: string; doc: string }
): PendingDoc | null {
  const q = parseEditorQuery(path.includes('?') ? path.slice(path.indexOf('?')) : '')
  if (!q) return null
  return {
    title: q.isNew ? `${titles.newDoc}.${q.fileType}` : `${titles.doc}.${q.fileType}`,
    fileType: q.fileType,
    buffer: null,
    ephemeral: true
  }
}

/** 同页 DocsAPI 直挂：createEditor → DocsAPI.DocEditor */
export function EditorPage(props: { path: string; navigate: (to: string) => void }) {
  const { path, navigate } = props
  const { t, editorLang } = useLocale()
  const mountRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<OfficeEditor | null>(null)
  const launchRef = useRef<PendingDoc | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const [doc, setDoc] = useState<PendingDoc | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(() => t('loadingEditor'))
  const [modified, setModified] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!launchRef.current) {
      launchRef.current =
        getPendingDoc() ||
        docFromPath(path, { newDoc: t('newDocTitle'), doc: t('docTitle') })
    }
    const launch = launchRef.current
    if (!launch) {
      setError(t('noPendingDoc'))
      return
    }
    setDoc(launch)
    setError('')
    setStatus(t('loadingEditor'))

    const mount = mountRef.current
    if (!mount) return

    let cancelled = false

    ;(async () => {
      try {
        let url: string | undefined
        if (launch.buffer && launch.buffer.byteLength > 0) {
          url = bufferToBlobUrl(launch.buffer, launch.fileType)
          blobUrlRef.current = url
        }

        const editor = await createEditor({
          container: mount,
          baseUrl: BASE_URL,
          document: {
            url,
            fileType: launch.fileType,
            title: launch.title,
            key: `demo-${Date.now()}`,
            isForm: launch.fileType === 'pdf' ? false : undefined
          },
          lang: editorLang,
          onReady: () => {
            clearPendingDoc()
            setStatus(t('editorReady'))
          },
          onDocumentReady: () => setStatus(t('docOpened')),
          onStateChange: setModified,
          onError: (err) => setError(err.message),
          onRequestClose: () => navigate('/')
        })

        if (cancelled) {
          editor.destroy()
          return
        }
        editorRef.current = editor
      } catch (e) {
        if (!cancelled) setError(String((e as Error)?.message || e))
      }
    })()

    return () => {
      cancelled = true
      editorRef.current?.destroy()
      editorRef.current = null
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [path, navigate, editorLang, t])

  async function onSave() {
    const editor = editorRef.current
    const active = doc
    if (!editor || !active) return
    setSaving(true)
    setError('')
    try {
      const result = await editor.save(active.fileType)
      if (active.handle) {
        await writeFileBuffer(active.handle, result.buffer)
        setStatus(`${t('savedLocal')}${active.title}`)
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([result.buffer]))
        a.download = active.title
        a.click()
        URL.revokeObjectURL(a.href)
        setStatus(`${t('downloaded')}${active.title}`)
      }
      setModified(false)
    } catch (e) {
      setError(`${t('saveFailed')}${(e as Error)?.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor-page">
      <div className="editor-bar">
        <button type="button" className="btn ghost" onClick={() => navigate('/')}>
          {t('home')}
        </button>
        <span className={`dot${modified ? ' on' : ''}`} />
        <span className="title">{doc?.title || t('editor')}</span>
        <span className="bar-status">{status}</span>
        <LanguageSwitcher />
        <button type="button" className="btn primary" disabled={saving || !doc} onClick={() => void onSave()}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
      {error && <div className="banner warn editor-err">{error}</div>}
      <div className="editor-mount" ref={mountRef} />
    </div>
  )
}
