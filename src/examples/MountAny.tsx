import type { ReactNode } from 'react'

export type MountLayout = 'full' | 'split' | 'drawer'

export function MountAny(props: { layout: MountLayout; children: ReactNode }) {
  const { layout, children } = props

  if (layout === 'full') {
    return (
      <div className="stage layout-full">
        <section className="panel">
          <header>容器 A · 全宽</header>
          <div className="body">{children}</div>
        </section>
      </div>
    )
  }

  if (layout === 'split') {
    return (
      <div className="stage layout-split">
        <section className="panel">
          <header>容器 A · 左侧</header>
          <div className="body">{children}</div>
        </section>
        <section className="panel">
          <header>容器 B · 占位</header>
          <div className="empty-stage">切换布局会把编辑器挂到不同容器（先销毁再挂载）</div>
        </section>
      </div>
    )
  }

  return (
    <div className="stage layout-drawer">
      <section className="panel">
        <header>主区占位</header>
        <div className="empty-stage">编辑器在右侧抽屉容器中</div>
      </section>
      <section className="panel">
        <header>容器 C · 抽屉</header>
        <div className="body">{children}</div>
      </section>
    </div>
  )
}
