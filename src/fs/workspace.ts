/** File System Access API 工作区：句柄持久化到 IDB，文件字节始终读本机磁盘 */

const DB_NAME = 'oo-offline-demo'
const DB_STORE = 'handles'
const DIR_KEY = 'workspace'

export const OFFICE_EXTS = new Set([
  'docx', 'doc', 'odt', 'rtf', 'txt',
  'xlsx', 'xls', 'ods', 'csv',
  'pptx', 'ppt', 'odp',
  'pdf'
])

export interface WorkspaceFile {
  name: string
  fileType: string
  lastModified: number
  size: number
  handle: FileSystemFileHandle
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(handle, DIR_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb()
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(DIR_KEY)
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return handle
}

export async function clearDirectoryHandle(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(DIR_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await saveDirectoryHandle(handle)
  return handle
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = 'readwrite'
): Promise<PermissionState> {
  const opts = { mode }
  const current = await handle.queryPermission(opts)
  if (current === 'granted') return current
  return handle.requestPermission(opts)
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > -1 ? name.slice(i + 1).toLowerCase() : ''
}

export async function listOfficeFiles(
  dir: FileSystemDirectoryHandle
): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue
    const fileType = extOf(name)
    if (!OFFICE_EXTS.has(fileType)) continue
    const file = await handle.getFile()
    files.push({
      name,
      fileType,
      lastModified: file.lastModified,
      size: file.size,
      handle
    })
  }
  files.sort((a, b) => b.lastModified - a.lastModified)
  return files
}

export async function readFileBuffer(handle: FileSystemFileHandle): Promise<ArrayBuffer> {
  const file = await handle.getFile()
  return file.arrayBuffer()
}

export async function writeFileBuffer(
  handle: FileSystemFileHandle,
  buffer: ArrayBuffer
): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(buffer)
  await writable.close()
}

export async function createFileInDir(
  dir: FileSystemDirectoryHandle,
  name: string,
  buffer?: ArrayBuffer
): Promise<FileSystemFileHandle> {
  const handle = await dir.getFileHandle(name, { create: true })
  if (buffer) await writeFileBuffer(handle, buffer)
  else {
    const writable = await handle.createWritable()
    await writable.close()
  }
  return handle
}

declare global {
  interface Window {
    showDirectoryPicker: (options?: {
      mode?: 'read' | 'readwrite'
    }) => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
    queryPermission: (descriptor?: { mode?: FileSystemPermissionMode }) => Promise<PermissionState>
    requestPermission: (descriptor?: { mode?: FileSystemPermissionMode }) => Promise<PermissionState>
    getFileHandle: (
      name: string,
      options?: { create?: boolean }
    ) => Promise<FileSystemFileHandle>
  }

  interface FileSystemFileHandle {
    getFile: () => Promise<File>
    createWritable: () => Promise<FileSystemWritableFileStream>
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write: (data: BufferSource | Blob | string) => Promise<void>
    close: () => Promise<void>
  }

  type FileSystemPermissionMode = 'read' | 'readwrite'
}
