export { loadApi, normalizeBaseUrl, apiScriptUrl } from './loadApi'
export {
  buildDocsConfig,
  bufferToBlobUrl,
  detectDocumentType,
  normalizeExtension
} from './normalize'
export { createEditor } from './createEditor'
export { prepareSaveStream, beginFileStreamCapture, waitForFileStream } from './saveStream'
export type {
  CreateEditorOptions,
  DocumentType,
  OfficeDocumentInput,
  OfficeEditor,
  SaveResult
} from './types'
