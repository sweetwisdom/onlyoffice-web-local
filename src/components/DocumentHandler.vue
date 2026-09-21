<template>
    <div class="editor-container" v-loading="loading" element-loading-text="Loading...">
        <div id="iframe"></div>
    </div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { getDocumentType, DocmentType } from '@/utils/util'
import { g_sEmpty_bin } from '@/utils/empty_bin'
// @ts-ignore
import {
    initX2TScript,
    initX2T,
    convertDocument,
    convertBinToDocumentAndDownload,
    c_oAscFileType2,
} from '@/utils/x2t'
// 设置prop
const props = defineProps<{
    file: DocmentType
}>()

const editor = ref<any>(null)
const loading = ref(false)

// 全局 media 映射对象
const media: { [key: string]: string } = {}

// 文件监听停止函数（在顶层 onBeforeUnmount 中调用，避免异步上下文注册生命周期钩子的警告）
let stopFileWatch: (() => void) | null = null

onMounted(async () => {
    loading.value = true
    try {
        await initX2TScript()
        // 加载编辑器API
        await loadEditorApi()
        await initX2T()
        console.log('app has loading')
        loading.value = false
        // 监听 props.file 变化并执行 openFile

        stopFileWatch = watch(
            () => [props.file.fileName, props.file.file],
            async () => {
                try {
                    await openFile()
                } catch (error) {
                    console.error('Error opening file:', error)
                    alert('文件打开失败，请检查文件格式')
                }
            },
            { immediate: true }, // 立即执行一次以处理初始值
        )
    } catch (error) {
        console.error('Failed to initialize editor:', error)
        // 错误已在各函数中处理
    }
})
// 合并后的文件操作方法
async function handleDocumentOperation(options: {
    isNew: boolean
    fileName: string
    file?: File | null
}) {
    try {
        const { isNew, fileName, file } = options
        const fileType = fileName.split('.').pop() || ''
        const docType = getDocumentType(fileType)

        // 获取文档内容
        let documentData: {
            bin: Uint8Array | string
            media?: any
        }

        if (isNew) {
            // 新建文档使用空模板
            const emptyBin = g_sEmpty_bin[`.${fileType}`]
            if (!emptyBin) {
                throw new Error(`不支持的文件类型: ${fileType}`)
            }
            documentData = { bin: emptyBin }
        } else {
            // 打开现有文档需要转换
            if (!file) throw new Error('无效的文件对象')
            documentData = await convertDocument(file)
        }

        // 创建编辑器实例
        createEditorInstance({
            fileName,
            fileType,
            binData: documentData.bin,
            media: documentData.media,
        })
    } catch (error: any) {
        console.error('文档操作失败:', error)
        alert(`文档操作失败: ${error.message}`)
        throw error
    }
}

// 公共编辑器创建方法
function createEditorInstance(config: {
    fileName: string
    fileType: string
    binData: Uint8Array | string
    media?: any
}) {
    // 清理旧编辑器实例
    if (editor.value) {
        editor.value.destroyEditor()
        editor.value = null
    }

    // 切换文档：释放旧 media 的对象 URL 并清空映射，避免残留资源污染新文档
    Object.values(media).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
        }
    })
    Object.keys(media).forEach((key) => delete media[key])

    const { fileName, fileType, binData, media: docMedia } = config

    // 记录文档解包出的 media（保存时需写回 x2t 虚拟文件系统，否则图片丢失）
    if (docMedia) {
        Object.assign(media, docMedia)
    }

    editor.value = new window.DocsAPI.DocEditor('iframe', {
        document: {
            title: fileName,
            url: fileName, // 使用文件名作为标识
            fileType: fileType,
            permissions: {
                edit: true,
                chat: false,
                protect: false,
            },
        },
        editorConfig: {
            lang: 'zh',
            customization: {
                help: false,
                about: false,
                hideRightMenu: true,
                features: {
                    spellcheck: {
                        change: false,
                    },
                },
                anonymous: {
                    request: false,
                    label: 'Guest',
                },
            },
        },
        events: {
            onAppReady: () => {
                // 设置媒体资源
                if (Object.keys(media).length > 0) {
                    editor.value.sendCommand({
                        command: 'asc_setImageUrls',
                        data: { urls: media },
                    })
                }

                // 加载文档内容
                editor.value.sendCommand({
                    command: 'asc_openDocument',
                    data: { buf: binData },
                })
            },
            onDocumentReady: () => {
                console.log('文档加载完成:', fileName)
            },
            onSave: handleSaveDocument,
            // writeFile
            // todo writeFile 当外部粘贴图片时候处理
            writeFile: handleWriteFile,
        },
    })
}

// 修改后的openFile方法
async function openFile() {
    const { fileName, file } = props.file

    await handleDocumentOperation({
        isNew: !file, // 根据是否存在file判断是否新建
        fileName,
        file,
    })
}

onBeforeUnmount(() => {
    // 停止文件监听
    stopFileWatch?.()
    stopFileWatch = null

    // 清理资源
    if (editor.value) {
        // 如果编辑器有销毁方法，调用它
        if (typeof editor.value.destroyEditor === 'function') {
            editor.value.destroyEditor()
        }
    }
})

function loadEditorApi(): Promise<void> {
    return new Promise((resolve, reject) => {
        // 检查是否已加载
        if (window.DocsAPI) {
            resolve()
            return
        }

        // 加载编辑器API
        const script = document.createElement('script')
        script.src = './web-apps/apps/api/documents/api.js'
        script.onload = () => resolve()
        script.onerror = (error) => {
            console.error('Failed to load OnlyOffice API:', error)
            alert('无法加载编辑器组件。请确保已正确安装 OnlyOffice API。')
            reject(error)
        }
        document.head.appendChild(script)
    })
}

interface SaveEvent {
    data: {
        data: string | Uint8Array
        option: any
    }
}

// 辅助函数：将base64字符串转为Uint8Array（兼容 data URI 前缀）
function base64ToUint8Array(base64: string): Uint8Array {
    const payload = base64.includes(',') ? base64.split(',')[1] : base64
    const binaryString = atob(payload)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
}

async function handleSaveDocument(event: SaveEvent) {
    console.log('Save document event:', event)

    try {
        if (event.data && event.data.data) {
            const { data, option } = event.data

            // onSave 载荷为 base64 字符串（nobase64=false），转换为二进制后再交给 x2t 转换
            const binData = typeof data === 'string' ? base64ToUint8Array(data) : data

            // 根据输出格式获取扩展名，找不到时回退为源文件扩展名
            const sourceExt = props.file.fileName.split('.').pop()?.toUpperCase() || 'DOCX'
            const targetExt = c_oAscFileType2[option?.outputformat] || sourceExt

            // 创建下载（传入 media，图片等资源会写回 x2t 虚拟文件系统）
            await convertBinToDocumentAndDownload(binData, props.file.fileName, targetExt, media)
        }
    } catch (error) {
        console.error('保存文档失败:', error)
        alert('文档保存失败，请重试')
    } finally {
        // 无论成功失败都需告知编辑器保存结束，否则编辑器会一直处于保存锁定状态
        editor.value?.sendCommand({
            command: 'asc_onSaveCallback',
            data: { err_code: 0 },
        })
    }
}

/**
 * 处理文件写入请求（主要用于处理粘贴的图片）
 * @param event - OnlyOffice 编辑器的文件写入事件
 */
function handleWriteFile(event: any) {
    try {
        console.log('Write file event:', event)

        const { data: eventData } = event
        if (!eventData) {
            console.warn('No data provided in writeFile event')
            return
        }

        const {
            data: imageData, // Uint8Array 图片数据
            file: fileName, // 文件名，如 "display8image-174799443357-0.png"
            target, // 目标对象，包含 frameOrigin 等信息
        } = eventData

        // 验证数据
        if (!imageData || !(imageData instanceof Uint8Array)) {
            throw new Error('Invalid image data: expected Uint8Array')
        }

        if (!fileName || typeof fileName !== 'string') {
            throw new Error('Invalid file name')
        }

        // 从文件名中提取扩展名
        const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'png'
        const mimeType = getMimeTypeFromExtension(fileExtension)

        // 创建 Blob 对象
        const blob = new Blob([imageData], { type: mimeType })

        // 创建对象 URL
        const objectUrl = URL.createObjectURL(blob)
        // 将图片设置为base64url
        //  const base64Url = `data:${mimeType};base64,${btoa(String.fromCharCode(...imageData))}`;
        // 将图片URL添加到媒体映射中，使用原始文件名作为key
        media[`media/${fileName}`] = objectUrl
        editor.value.sendCommand({
            command: 'asc_setImageUrls',
            data: {
                urls: media,
            },
        })

        editor.value.sendCommand({
            command: 'asc_writeFileCallback',
            data: {
                // 图片base64
                path: objectUrl,
                imgName: fileName,
            },
        })
        console.log(`Successfully processed image: ${fileName}, URL: ${objectUrl}`)
    } catch (error) {
        console.error('Error handling writeFile:', error)

        // 通知编辑器文件处理失败
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (editor.value && typeof editor.value.sendCommand === 'function') {
            editor.value.sendCommand({
                command: 'asc_writeFileCallback',
                data: {
                    success: false,
                    error: errorMessage,
                },
            })
        }

        if (event.callback && typeof event.callback === 'function') {
            event.callback({
                success: false,
                error: errorMessage,
            })
        }
    }
}

/**
 * 根据文件扩展名获取 MIME 类型
 * @param extension - 文件扩展名
 * @returns string - MIME 类型
 */
function getMimeTypeFromExtension(extension: string): string {
    const mimeMap: { [key: string]: string } = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        tiff: 'image/tiff',
        tif: 'image/tiff',
    }

    return mimeMap[extension?.toLowerCase()] || 'image/png'
}

// 组件卸载时清理对象 URL
onBeforeUnmount(() => {
    // 清理媒体资源的对象 URL
    Object.values(media).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
        }
    })

    // 清理编辑器资源
    if (editor.value) {
        if (typeof editor.value.destroyEditor === 'function') {
            editor.value.destroyEditor()
        }
    }
})
</script>

<style scoped>
.editor-container {
    width: 100%;
    height: 100vh;
}

#iframe {
    width: 100%;
    height: 100%;
}
</style>

