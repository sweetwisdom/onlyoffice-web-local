<template>
  <div class="home">
    <!-- 顶部操作区域 -->
    <div class="top-operation-bar" v-if="!docmentObj?.fileName">
      <el-button type="primary" @click="showCreateDialog = true">新建/打开文件</el-button>
    </div>
    <div class="editor-content">
      <DocumentHandler
        v-if="docmentObj?.fileName"
        style="height: 100%; width: 100%"
        :file="docmentObj"
        ref="documentHandler"
      />
      <!-- 主要内容区域 -->
      <div class="main-content" v-else>
        <h1>欢迎使用文档编辑器</h1>
        <p>点击顶部按钮开始创建或打开文档</p>
      </div>
    </div>

    <!-- 使用DocumentHandler组件，通过prop传递文件 -->

    <!-- 面板转换为对话框 -->
    <el-dialog v-model="showCreateDialog" title="新建/打开文件" width="450px" center>
      <div id="panel-createnew">
        <div class="header">新建</div>
        <div class="thumb-list">
          <div class="thumb-wrap" template="WORD" @click="onCreateNew('.docx')">
            <div class="thumb" style="background-image: url('./img/doc-formats/docx.png')"></div>
            <div class="title">文档</div>
          </div>
          <div class="thumb-wrap" template="EXCEL" @click="onCreateNew('.xlsx')">
            <div class="thumb" style="background-image: url('./img/doc-formats/xlsx.png')"></div>
            <div class="title">表格</div>
          </div>
          <div class="thumb-wrap" template="PPT" @click="onCreateNew('.pptx')">
            <div class="thumb" style="background-image: url('./img/doc-formats/pptx.png')"></div>
            <div class="title">演示文稿</div>
          </div>
        </div>
        <div class="header">打开</div>
        <div class="open-container">
          <el-button type="info" size="large" :icon="FolderOpened" @click="onOpenDocument" plain>
            打开本地文件
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { FolderOpened } from '@element-plus/icons-vue'
import { onMounted, ref } from 'vue'
import { DocmentType } from '@/utils/util'
import DocumentHandler from '../components/DocumentHandler.vue'
import { useRoute } from 'vue-router'
import { ElLoading } from 'element-plus'
const showCreateDialog = ref(false)
const selectedFile = ref<File | null>(null)
const documentHandler = ref<InstanceType<typeof DocumentHandler> | null>(null)
const docmentObj = ref<DocmentType | null>(null)

const onCreateNew = (ext: string) => {
  docmentObj.value = {
    fileName: '新建文档' + ext,
    file: null,
  }
  showCreateDialog.value = false
}

const onOpenDocument = async () => {
  // 创建文件选择器，选择Office文档
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.docx,.xlsx,.pptx,.doc,.xls,.ppt'
  // 挂载到 DOM（部分浏览器如 Safari iOS 对未挂载的 input 不触发文件选择）
  input.style.display = 'none'

  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) {
      showCreateDialog.value = false
      docmentObj.value = {
        fileName: file.name,
        file: file,
      }
    }
    // 选择完成后移除
    input.remove()
  }

  document.body.appendChild(input)
  input.click()
}
// 页面初始化后根据路由地址获取文件 并自动打开
async function initFileUrl() {
  const route = useRoute()
  const url = route.query.url as string | undefined
  const filenameParam = route.query.filename as string | undefined
  if (!url) {
    console.warn('未提供文件 URL')
    return
  }
  const laodingInstance = ElLoading.service({
    lock: true,
    text: 'Loading',
    background: 'rgba(0, 0, 0, 0.7)',
  })
  try {
    const res = await fetch(url)

    if (!res.ok) throw new Error('文件请求失败')
    laodingInstance.close()
    const blob = await res.blob()
    let fileName = ''

    // 1. 从 query 参数获取 filename
    if (filenameParam) {
      fileName = filenameParam
    }

    // 2. 如果没有 filename 参数，尝试从 URL 末尾解析
    if (!fileName) {
      const match = decodeURIComponent(url).match(/\/([^\/?#]+)$/)
      if (match && match[1].includes('.')) {
        fileName = match[1]
      }
    }

    // 3. 如果 URL 也解析失败，尝试从 Content-Disposition 响应头获取
    if (!fileName) {
      const disposition = res.headers.get('Content-Disposition')
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/)
        if (match) {
          fileName = decodeURIComponent(match[1] || match[2])
        }
      }
    }

    // 4. 最终还拿不到文件名，拒绝处理
    if (!fileName) {
      console.error('无法确定文件名，拒绝打开')
      return
    }

    const file = new File([blob], fileName, { type: blob.type })
    docmentObj.value = { fileName, file }
    showCreateDialog.value = false
  } catch (err) {
    console.error('加载文件失败:', err)
    laodingInstance.close()
  }
}
onMounted(() => {
  initFileUrl()
})
</script>

<style lang="less" scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f5f5;
}

.top-operation-bar {
  background-color: white;
  padding: 12px 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.editor-content {
  flex-grow: 1;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;

  h1 {
    margin-bottom: 20px;
  }
}

#panel-createnew {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 20px;
  .header {
    font-size: 18px;
    padding: 0 0 0 25px;
    white-space: nowrap;
    margin-top: 20px;
    margin-bottom: 20px;
  }

  .thumb-list {
    display: flex;
    justify-content: space-around;

    .thumb-wrap {
      display: inline-block;
      text-align: center;
      width: auto;
      cursor: pointer;
      vertical-align: top;
      border-radius: 4px;

      .thumb {
        width: 96px;
        height: 96px;
        background-repeat: no-repeat;
        background-position: center;
        margin: 12px 12px 0px 12px;
        background-size: contain;
      }

      .title {
        width: 104px;
        font-size: 14px;
        line-height: 14px;
        height: 28px;
        margin: 8px 8px 12px 8px;
        word-break: break-word;
        word-wrap: break-word;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      &:hover {
        background-color: #e0e0e0;
      }

      &:active {
        color: rgba(0, 0, 0, 0.8);
        background-color: #cbcbcb;
      }
    }
  }
}
.open-container {
  text-align: center;
  padding-bottom: 25px;
  margin-top: 20px;
}
</style>
