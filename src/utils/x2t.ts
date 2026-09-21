// types/x2t.d.ts - 类型定义文件
interface EmscriptenFileSystem {
    mkdir(path: string): void
    readdir(path: string): string[]
    readFile(path: string, options?: { encoding: 'binary' }): Uint8Array
    writeFile(path: string, data: Uint8Array | string): void
    unlink(path: string): void
}

interface EmscriptenModule {
    FS: EmscriptenFileSystem
    ccall: (funcName: string, returnType: string, argTypes: string[], args: any[]) => number
    onRuntimeInitialized: () => void
}

interface ConversionResult {
    fileName: string
    type: DocumentType
    bin: Uint8Array
    media: Record<string, string>
}

interface BinConversionResult {
    fileName: string
    data: Uint8Array
}

type DocumentType = 'word' | 'cell' | 'slide'
type SupportedExtension =
    | 'docx'
    | 'doc'
    | 'odt'
    | 'rtf'
    | 'txt'
    | 'xlsx'
    | 'xls'
    | 'ods'
    | 'csv'
    | 'pptx'
    | 'ppt'
    | 'odp'

declare global {
    interface Window {
        Module: EmscriptenModule
    }
}

/**
 * X2T 工具类 - 负责文档转换功能
 */
class X2TConverter {
    private x2tModule: EmscriptenModule | null = null
    private isReady = false
    private initPromise: Promise<EmscriptenModule> | null = null
    private hasScriptLoaded = false

    // 支持的文件类型映射
    private readonly DOCUMENT_TYPE_MAP: Record<string, DocumentType> = {
        docx: 'word',
        doc: 'word',
        odt: 'word',
        rtf: 'word',
        txt: 'word',
        xlsx: 'cell',
        xls: 'cell',
        ods: 'cell',
        csv: 'cell',
        pptx: 'slide',
        ppt: 'slide',
        odp: 'slide',
    }

    private readonly WORKING_DIRS = [
        '/working',
        '/working/media',
        '/working/fonts',
        '/working/themes',
    ]
    private readonly SCRIPT_PATH = './wasm/x2t/x2t.js'
    private readonly INIT_TIMEOUT = 20000

    /**
     * 加载 X2T 脚本文件
     */
    async loadScript(): Promise<void> {
        if (this.hasScriptLoaded) return

        return new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = this.SCRIPT_PATH
            script.onload = () => {
                this.hasScriptLoaded = true
                console.log('X2T WASM script loaded successfully')
                resolve()
            }

            script.onerror = (error) => {
                const errorMsg = 'Failed to load X2T WASM script'
                console.error(errorMsg, error)
                reject(new Error(errorMsg))
            }

            document.head.appendChild(script)
        })
    }

    /**
     * 初始化 X2T 模块
     */
    async initialize(): Promise<EmscriptenModule> {
        if (this.isReady && this.x2tModule) {
            return this.x2tModule
        }

        // 防止重复初始化
        if (this.initPromise) {
            return this.initPromise
        }

        this.initPromise = this.doInitialize()
        return this.initPromise
    }

    private async doInitialize(): Promise<EmscriptenModule> {
        try {
            // 确保脚本已加载
            await this.loadScript()

            return new Promise((resolve, reject) => {
                const x2t = window.Module
                if (!x2t) {
                    reject(new Error('X2T module not found after script loading'))
                    return
                }

                // 设置超时处理
                const timeoutId = setTimeout(() => {
                    if (!this.isReady) {
                        reject(new Error(`X2T initialization timeout after ${this.INIT_TIMEOUT}ms`))
                    }
                }, this.INIT_TIMEOUT)

                x2t.onRuntimeInitialized = () => {
                    try {
                        clearTimeout(timeoutId)
                        this.createWorkingDirectories(x2t)
                        this.x2tModule = x2t
                        this.isReady = true
                        console.log('X2T module initialized successfully')
                        resolve(x2t)
                    } catch (error) {
                        reject(error)
                    }
                }
            })
        } catch (error) {
            this.initPromise = null // 重置以允许重试
            throw error
        }
    }

    /**
     * 创建工作目录
     */
    private createWorkingDirectories(x2t: EmscriptenModule): void {
        this.WORKING_DIRS.forEach((dir) => {
            try {
                x2t.FS.mkdir(dir)
            } catch (error) {
                // 目录可能已存在，忽略错误
                console.warn(`Directory ${dir} may already exist:`, error)
            }
        })
    }

    /**
     * 获取文档类型
     */
    private getDocumentType(extension: string): DocumentType {
        const docType = this.DOCUMENT_TYPE_MAP[extension.toLowerCase()]
        if (!docType) {
            throw new Error(`Unsupported file format: ${extension}`)
        }
        return docType
    }

    /**
     * 清理文件名
     */
    private sanitizeFileName(input: string): string {
        if (typeof input !== 'string' || !input.trim()) {
            return 'file.bin'
        }

        const parts = input.split('.')
        const ext = parts.pop() || 'bin'
        const name = parts.join('.')

        const illegalChars = /[\/\?<>\\:\*\|"]/g
        const controlChars = /[\x00-\x1f\x80-\x9f]/g
        const reservedPattern = /^\.+$/
        const unsafeChars = /[&'%!"{}[\]]/g

        let sanitized = name
            .replace(illegalChars, '')
            .replace(controlChars, '')
            .replace(reservedPattern, '')
            .replace(unsafeChars, '')

        sanitized = sanitized.trim() || 'file'
        return `${sanitized.slice(0, 200)}.${ext}` // 限制长度
    }

    /**
     * 执行文档转换
     */
    private executeConversion(paramsPath: string): void {
        if (!this.x2tModule) {
            throw new Error('X2T module not initialized')
        }

        const result = this.x2tModule.ccall('main1', 'number', ['string'], [paramsPath])
        if (result !== 0) {
            throw new Error(`Conversion failed with code: ${result}`)
        }
    }

    /**
     * 创建转换参数XML
     */
    private createConversionParams(
        fromPath: string,
        toPath: string,
        additionalParams = '',
    ): string {
        return `<?xml version="1.0" encoding="utf-8"?>
<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <m_sFileFrom>${fromPath}</m_sFileFrom>
  <m_sThemeDir>/working/themes</m_sThemeDir>
  <m_sFileTo>${toPath}</m_sFileTo>
  <m_bIsNoBase64>false</m_bIsNoBase64>
  ${additionalParams}
</TaskQueueDataConvert>`
    }

    /**
     * 读取媒体文件
     */
    private readMediaFiles(): Record<string, string> {
        if (!this.x2tModule) return {}

        const media: Record<string, string> = {}

        try {
            const files = this.x2tModule.FS.readdir('/working/media/')

            files
                .filter((file) => file !== '.' && file !== '..')
                .forEach((file) => {
                    try {
                        const fileData = this.x2tModule!.FS.readFile(`/working/media/${file}`, {
                            encoding: 'binary',
                        })

                        const blob = new Blob([fileData])
                        const mediaUrl = URL.createObjectURL(blob)
                        media[`media/${file}`] = mediaUrl
                    } catch (error) {
                        console.warn(`Failed to read media file ${file}:`, error)
                    }
                })
        } catch (error) {
            console.warn('Failed to read media directory:', error)
        }

        return media
    }

    /**
     * 清理上一次转换残留的文件，避免旧文件（尤其是 media）污染新文档
     */
    private cleanWorkingDir(): void {
        if (!this.x2tModule) return

        const dirs = ['/working', '/working/media']
        dirs.forEach((dir) => {
            try {
                const files = this.x2tModule!.FS.readdir(dir)
                files
                    .filter((file) => file !== '.' && file !== '..')
                    .forEach((file) => {
                        try {
                            // 目录（如 media/fonts/themes）unlink 会抛错，直接忽略
                            this.x2tModule!.FS.unlink(`${dir}/${file}`)
                        } catch {
                            // 忽略目录或不可删除的文件
                        }
                    })
            } catch (error) {
                console.warn(`Failed to clean directory ${dir}:`, error)
            }
        })
    }

    /**
     * 将文档转换为 bin 格式
     */
    async convertDocument(file: File): Promise<ConversionResult> {
        await this.initialize()

        const fileName = file.name
        const fileExt = fileName.split('.').pop()?.toLowerCase() || ''
        const documentType = this.getDocumentType(fileExt)

        try {
            // 清理上一次转换的残留文件
            this.cleanWorkingDir()

            // 读取文件内容
            const arrayBuffer = await file.arrayBuffer()
            const data = new Uint8Array(arrayBuffer)

            // 生成安全的文件名
            const sanitizedName = this.sanitizeFileName(fileName)
            const inputPath = `/working/${sanitizedName}`
            const outputPath = `${inputPath}.bin`

            // 写入文件到虚拟文件系统
            this.x2tModule!.FS.writeFile(inputPath, data)

            // 创建转换参数
            const params = this.createConversionParams(inputPath, outputPath)
            this.x2tModule!.FS.writeFile('/working/params.xml', params)

            // 执行转换
            this.executeConversion('/working/params.xml')

            // 读取转换结果
            const result = this.x2tModule!.FS.readFile(outputPath)
            const media = this.readMediaFiles()

            return {
                fileName: sanitizedName,
                type: documentType,
                bin: result,
                media,
            }
        } catch (error) {
            throw new Error(
                `Document conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * 将 media 资源（blob URL）写入虚拟文件系统的 /working/media/，
     * 使 bin 转换回文档时能引用到图片等资源
     */
    private async writeMediaToFS(media?: Record<string, string>): Promise<void> {
        if (!media || !this.x2tModule) return

        for (const [key, url] of Object.entries(media)) {
            if (typeof url !== 'string' || !url.startsWith('blob:')) continue
            try {
                const fileName = key.replace(/^media\//, '')
                const res = await fetch(url)
                const buf = new Uint8Array(await res.arrayBuffer())
                this.x2tModule!.FS.writeFile(`/working/media/${fileName}`, buf)
            } catch (error) {
                console.warn(`Failed to write media file ${key} to FS:`, error)
            }
        }
    }

    /**
     * 将 bin 格式转换为指定格式并下载
     */
    async convertBinToDocumentAndDownload(
        bin: Uint8Array | string,
        originalFileName: string,
        targetExt?: string,
        media?: Record<string, string>,
    ): Promise<BinConversionResult> {
        await this.initialize()

        // 未指定目标格式时，回退为源文件的扩展名
        const sourceExt = originalFileName.split('.').pop()?.toLowerCase() || 'docx'
        const ext = (targetExt || sourceExt).toLowerCase()

        const sanitizedBase = this.sanitizeFileName(originalFileName).replace(/\.[^/.]+$/, '')
        const binFileName = `${sanitizedBase}.bin`
        const outputFileName = `${sanitizedBase}.${ext}`

        try {
            // 先将图片等 media 资源写入虚拟文件系统，否则转换结果中图片会丢失
            await this.writeMediaToFS(media)

            // 写入 bin 文件
            this.x2tModule!.FS.writeFile(`/working/${binFileName}`, bin)

            // 创建转换参数
            let additionalParams = ''
            if (ext === 'pdf') {
                additionalParams = '<m_sFontDir>/working/fonts/</m_sFontDir>'
            }

            const params = this.createConversionParams(
                `/working/${binFileName}`,
                `/working/${outputFileName}`,
                additionalParams,
            )

            this.x2tModule!.FS.writeFile('/working/params.xml', params)

            // 执行转换
            this.executeConversion('/working/params.xml')

            // 读取生成的文档
            const result = this.x2tModule!.FS.readFile(`/working/${outputFileName}`)

            // 下载文件
            // TODO: 完善打印功能
            await this.saveWithFileSystemAPI(result, outputFileName)

            return {
                fileName: outputFileName,
                data: result,
            }
        } catch (error) {
            throw new Error(
                `Bin to document conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * 下载文件
     */
    private downloadFile(data: Uint8Array, fileName: string): void {
        const blob = new Blob([data])
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')

        link.href = url
        link.download = fileName
        link.style.display = 'none'

        document.body.appendChild(link)
        link.click()

        // 清理资源
        setTimeout(() => {
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        }, 100)
    }
    /**
     * 根据文件扩展名获取 MIME 类型
     */
    private getMimeTypeFromExtension(extension: string): string {
        const mimeMap: Record<string, string> = {
            // 文档类型
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            doc: 'application/msword',
            odt: 'application/vnd.oasis.opendocument.text',
            rtf: 'application/rtf',
            txt: 'text/plain',
            pdf: 'application/pdf',

            // 表格类型
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls: 'application/vnd.ms-excel',
            ods: 'application/vnd.oasis.opendocument.spreadsheet',
            csv: 'text/csv',

            // 演示文稿类型
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            ppt: 'application/vnd.ms-powerpoint',
            odp: 'application/vnd.oasis.opendocument.presentation',

            // 图片类型
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            bmp: 'image/bmp',
            webp: 'image/webp',
            svg: 'image/svg+xml',
        }

        return mimeMap[extension.toLowerCase()] || 'application/octet-stream'
    }

    /**
     * 获取文件类型描述
     */
    private getFileDescription(extension: string): string {
        const descriptionMap: Record<string, string> = {
            docx: 'Word Document',
            doc: 'Word 97-2003 Document',
            odt: 'OpenDocument Text',
            pdf: 'PDF Document',
            xlsx: 'Excel Workbook',
            xls: 'Excel 97-2003 Workbook',
            ods: 'OpenDocument Spreadsheet',
            pptx: 'PowerPoint Presentation',
            ppt: 'PowerPoint 97-2003 Presentation',
            odp: 'OpenDocument Presentation',
            txt: 'Text Document',
            rtf: 'Rich Text Format',
            csv: 'CSV File',
        }

        return descriptionMap[extension.toLowerCase()] || 'Document'
    }

    /**
     * 使用现代文件系统 API 保存文件
     */
    private async saveWithFileSystemAPI(
        data: Uint8Array,
        fileName: string,
        mimeType?: string,
    ): Promise<void> {
        if (!(window as any).showSaveFilePicker) {
            this.downloadFile(data, fileName)
            return
        }
        try {
            // 获取文件扩展名并确定 MIME 类型
            const extension = fileName.split('.').pop()?.toLowerCase() || ''
            const detectedMimeType = mimeType || this.getMimeTypeFromExtension(extension)

            // 显示文件保存对话框
            const fileHandle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [
                    {
                        description: this.getFileDescription(extension),
                        accept: {
                            [detectedMimeType]: [`.${extension}`],
                        },
                    },
                ],
            })

            // 创建可写流并写入数据
            const writable = await fileHandle.createWritable()
            await writable.write(data)
            await writable.close()

            console.log('File saved successfully:', fileName)
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                console.log('User cancelled the save operation')
                return
            }
            throw error
        }
    }

    /**
     * 销毁实例，清理资源
     */
    destroy(): void {
        this.x2tModule = null
        this.isReady = false
        this.initPromise = null
        console.log('X2T converter destroyed')
    }
}

// 单例实例
const x2tConverter = new X2TConverter()

// 导出的公共 API
export const initX2TScript = () => x2tConverter.loadScript()
export const initX2T = () => x2tConverter.initialize()
export const convertDocument = (file: File) => x2tConverter.convertDocument(file)
export const convertBinToDocumentAndDownload = (
    bin: Uint8Array | string,
    fileName: string,
    targetExt?: string,
    media?: Record<string, string>,
) => x2tConverter.convertBinToDocumentAndDownload(bin, fileName, targetExt, media)

// 文件类型常量
export const oAscFileType = {
    UNKNOWN: 0,
    PDF: 513,
    PDFA: 521,
    DJVU: 515,
    XPS: 516,
    DOCX: 65,
    DOC: 66,
    ODT: 67,
    RTF: 68,
    TXT: 69,
    HTML: 70,
    MHT: 71,
    EPUB: 72,
    FB2: 73,
    MOBI: 74,
    DOCM: 75,
    DOTX: 76,
    DOTM: 77,
    FODT: 78,
    OTT: 79,
    DOC_FLAT: 80,
    DOCX_FLAT: 81,
    HTML_IN_CONTAINER: 82,
    DOCX_PACKAGE: 84,
    OFORM: 85,
    DOCXF: 86,
    DOCY: 4097,
    CANVAS_WORD: 8193,
    JSON: 2056,
    XLSX: 257,
    XLS: 258,
    ODS: 259,
    CSV: 260,
    XLSM: 261,
    XLTX: 262,
    XLTM: 263,
    XLSB: 264,
    FODS: 265,
    OTS: 266,
    XLSX_FLAT: 267,
    XLSX_PACKAGE: 268,
    XLSY: 4098,
    PPTX: 129,
    PPT: 130,
    ODP: 131,
    PPSX: 132,
    PPTM: 133,
    PPSM: 134,
    POTX: 135,
    POTM: 136,
    FODP: 137,
    OTP: 138,
    PPTX_PACKAGE: 139,
    IMG: 1024,
    JPG: 1025,
    TIFF: 1026,
    TGA: 1027,
    GIF: 1028,
    PNG: 1029,
    EMF: 1030,
    WMF: 1031,
    BMP: 1032,
    CR2: 1033,
    PCX: 1034,
    RAS: 1035,
    PSD: 1036,
    ICO: 1037,
} as const

export const c_oAscFileType2 = Object.fromEntries(
    Object.entries(oAscFileType).map(([key, value]) => [value, key]),
) as Record<number, keyof typeof oAscFileType>
