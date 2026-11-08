import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "CHOKEBIT",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "goatcounter",
      websiteId: "chokebit",
    },
    locale: "en-US",
    baseUrl: "chokebit.github.io",
    ignorePatterns: ["private", "templates", ".gitkeep"],
    defaultDateType: "created",
    theme: {
      // 与产品统一：系统字体，不加载 Google Fonts
      fontOrigin: "local",
      cdnCaching: true,
      typography: {
        header: "PingFang SC",
        body: "PingFang SC",
        code: "JetBrains Mono",
      },
      // 与产品统一：白天暖白 + 深紫，夜晚紫黑 + 淡紫
      colors: {
        lightMode: {
          light: "#faf9f5",
          lightgray: "#e6e2d8",
          gray: "#8a857a",
          darkgray: "#57534b",
          dark: "#1f1e1d",
          secondary: "#5b3fb0",
          tertiary: "#2f6fca",
          highlight: "rgba(91, 63, 176, 0.09)",
          textHighlight: "#c4b5fd66",
        },
        darkMode: {
          light: "#110e17",
          lightgray: "#2c2637",
          gray: "#8b849e",
          darkgray: "#c3bdd0",
          dark: "#ece9f1",
          secondary: "#c4b5fd",
          tertiary: "#5b9cf0",
          highlight: "rgba(196, 181, 253, 0.12)",
          textHighlight: "#5b3fb088",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({ priority: ["frontmatter", "git", "filesystem"] }),
      Plugin.SyntaxHighlighting(),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({ enableSiteMap: true, enableRSS: true }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
