import { SharedLayout, PageLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import { QuartzComponentProps } from "./quartz/components/types"

const viewCounter = Component.ViewCounter()
const isHomePage = ({ fileData }: QuartzComponentProps) =>
  fileData.slug === "index" || fileData.slug === "index.cn"
const isTechIndex = ({ fileData }: QuartzComponentProps) =>
  fileData.slug === "tech/index" || fileData.slug === "tech/index.cn"

// 所有页面共享
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [
    Component.NavLinks(),
    Component.LanguageToggle(),
    Component.Darkmode(),
    Component.Search(),
  ],
  afterBody: [
    Component.ConditionalRender({
      component: viewCounter,
      condition: isHomePage,
    }),
  ],
  footer: Component.Footer({
    links: {
      X: "https://x.com/chokebit3xp",
      Email: "mailto:chokebit3xp@gmail.com",
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
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (props) => !isTechIndex(props),
    }),
    Component.ConditionalRender({
      component: Component.ArticleTitle(),
      condition: (props) => !isTechIndex(props),
    }),
    Component.ConditionalRender({
      component: Component.ContentMeta(),
      condition: (props) => !isTechIndex(props),
    }),
    Component.TagList(),
    Component.ConditionalRender({
      component: viewCounter,
      condition: (props) => !isHomePage(props) && !isTechIndex(props),
    }),
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
    Component.ConditionalRender({
      component: viewCounter,
      condition: (props) => !isHomePage(props),
    }),
  ],
  left: leftSidebar,
  right: [],
}
