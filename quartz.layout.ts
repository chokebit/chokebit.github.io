import { SharedLayout, PageLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// 所有页面共享
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [
    Component.NavLinks(),
    Component.LanguageToggle(),
    Component.Darkmode(),
    Component.Search(),
  ],
  afterBody: [],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/chokebit",
    },
  }),
}

// 左侧栏：品牌 + 控件 + Explorer
const leftSidebar = [
  Component.DesktopOnly(Component.Explorer()),
]

// 内容页面布局
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: leftSidebar,
  right: [
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// 列表页面布局（文件夹页、标签页）
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: leftSidebar,
  right: [],
}
