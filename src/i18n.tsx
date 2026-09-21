import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'

/** 与 web-apps locale 包对齐：zh.json / en.json / zh-tw.json */
export type AppLocale = 'zh-CN' | 'en' | 'zh-TW'

const STORAGE_KEY = 'oo-web-local-lang'

export const LOCALE_OPTIONS: { value: AppLocale; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'EN' },
  { value: 'zh-TW', label: '繁中' }
]

type MessageKey =
  | 'brandSub'
  | 'navNew'
  | 'navOpen'
  | 'navFolder'
  | 'navReauth'
  | 'navClearWorkspace'
  | 'typeWord'
  | 'typeCell'
  | 'typeSlide'
  | 'typePdf'
  | 'dropTitle'
  | 'dropHint'
  | 'sectionNew'
  | 'sectionRecent'
  | 'refresh'
  | 'recentEmpty'
  | 'recentEmptyHint'
  | 'workspacePrefix'
  | 'workspaceCleared'
  | 'permDenied'
  | 'openFailed'
  | 'newDocTitle'
  | 'docTitle'
  | 'home'
  | 'editor'
  | 'save'
  | 'saving'
  | 'loadingEditor'
  | 'editorReady'
  | 'docOpened'
  | 'noPendingDoc'
  | 'savedLocal'
  | 'downloaded'
  | 'saveFailed'
  | 'langLabel'

const MESSAGES: Record<AppLocale, Record<MessageKey, string>> = {
  'zh-CN': {
    brandSub: '本地编辑 · 不连服务器',
    navNew: '新建',
    navOpen: '打开',
    navFolder: '本机文件夹',
    navReauth: '重新授权',
    navClearWorkspace: '清除工作区',
    typeWord: '文档',
    typeCell: '电子表格',
    typeSlide: '演示文稿',
    typePdf: 'PDF',
    dropTitle: '选择文件',
    dropHint: '将 Office 文档拖放到此处，或点击从计算机浏览',
    sectionNew: '新建',
    sectionRecent: '最近',
    refresh: '刷新',
    recentEmpty: '无最近文件',
    recentEmptyHint: '打开本机文件夹或拖入文件后，会出现在这里以便快速访问',
    workspacePrefix: '工作区：',
    workspaceCleared: '已清除工作区',
    permDenied: '未获得目录读写权限',
    openFailed: '打开失败：',
    newDocTitle: '新建文档',
    docTitle: '文档',
    home: '← 首页',
    editor: '编辑器',
    save: '保存',
    saving: '保存中…',
    loadingEditor: '正在加载编辑器…',
    editorReady: '编辑器就绪',
    docOpened: '文档已打开',
    noPendingDoc: '没有待打开的文档，请从首页新建或打开文件',
    savedLocal: '已写回本机：',
    downloaded: '已下载 ',
    saveFailed: '保存失败：',
    langLabel: '语言'
  },
  en: {
    brandSub: 'Local edit · no server',
    navNew: 'New',
    navOpen: 'Open',
    navFolder: 'Local folder',
    navReauth: 'Re-authorize',
    navClearWorkspace: 'Clear workspace',
    typeWord: 'Document',
    typeCell: 'Spreadsheet',
    typeSlide: 'Presentation',
    typePdf: 'PDF',
    dropTitle: 'Choose a file',
    dropHint: 'Drop an Office file here, or click to browse',
    sectionNew: 'Create',
    sectionRecent: 'Recent',
    refresh: 'Refresh',
    recentEmpty: 'No recent files',
    recentEmptyHint: 'Open a local folder or drop a file to see it here',
    workspacePrefix: 'Workspace: ',
    workspaceCleared: 'Workspace cleared',
    permDenied: 'Folder permission denied',
    openFailed: 'Failed to open: ',
    newDocTitle: 'Untitled',
    docTitle: 'Document',
    home: '← Home',
    editor: 'Editor',
    save: 'Save',
    saving: 'Saving…',
    loadingEditor: 'Loading editor…',
    editorReady: 'Editor ready',
    docOpened: 'Document opened',
    noPendingDoc: 'No document to open. Create or open a file from Home.',
    savedLocal: 'Saved to disk: ',
    downloaded: 'Downloaded ',
    saveFailed: 'Save failed: ',
    langLabel: 'Language'
  },
  'zh-TW': {
    brandSub: '本機編輯 · 不連伺服器',
    navNew: '新建',
    navOpen: '開啟',
    navFolder: '本機資料夾',
    navReauth: '重新授權',
    navClearWorkspace: '清除工作區',
    typeWord: '文件',
    typeCell: '試算表',
    typeSlide: '簡報',
    typePdf: 'PDF',
    dropTitle: '選擇檔案',
    dropHint: '將 Office 文件拖放到此處，或點擊從電腦瀏覽',
    sectionNew: '新建',
    sectionRecent: '最近',
    refresh: '重新整理',
    recentEmpty: '無最近檔案',
    recentEmptyHint: '開啟本機資料夾或拖入檔案後，會顯示於此以便快速存取',
    workspacePrefix: '工作區：',
    workspaceCleared: '已清除工作區',
    permDenied: '未取得目錄讀寫權限',
    openFailed: '開啟失敗：',
    newDocTitle: '新建文件',
    docTitle: '文件',
    home: '← 首頁',
    editor: '編輯器',
    save: '儲存',
    saving: '儲存中…',
    loadingEditor: '正在載入編輯器…',
    editorReady: '編輯器就緒',
    docOpened: '文件已開啟',
    noPendingDoc: '沒有待開啟的文件，請從首頁新建或開啟檔案',
    savedLocal: '已寫回本機：',
    downloaded: '已下載 ',
    saveFailed: '儲存失敗：',
    langLabel: '語言'
  }
}

function readStoredLocale(): AppLocale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'zh-CN' || v === 'en' || v === 'zh-TW') return v
  } catch {
    /* ignore */
  }
  return 'zh-CN'
}

function applyHtmlLang(locale: AppLocale) {
  document.documentElement.lang = locale === 'en' ? 'en' : locale
}

type LocaleContextValue = {
  locale: AppLocale
  /** OnlyOffice editorConfig.lang */
  editorLang: string
  setLocale: (locale: AppLocale) => void
  t: (key: MessageKey) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    const initial = readStoredLocale()
    applyHtmlLang(initial)
    return initial
  })

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next)
    applyHtmlLang(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo<LocaleContextValue>(() => {
    const dict = MESSAGES[locale]
    return {
      locale,
      editorLang: locale,
      setLocale,
      t: (key) => dict[key] || MESSAGES['zh-CN'][key] || key
    }
  }, [locale, setLocale])

  return <LocaleContext.Provider value={value}>{props.children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale()
  return (
    <div className="lang-switch" role="group" aria-label={t('langLabel')}>
      {LOCALE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`lang-btn${locale === opt.value ? ' active' : ''}`}
          aria-pressed={locale === opt.value}
          onClick={() => setLocale(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
