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
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Schibsted Grotesk",
        body: "Source Sans Pro",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f6f7f3",
          lightgray: "#e3e7df",
          gray: "#9aa49c",
          darkgray: "#4f5b53",
          dark: "#121713",
          secondary: "#4f7600",
          tertiary: "#4c8063",
          highlight: "rgba(79, 118, 0, 0.12)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          light: "#0b0e0c",
          lightgray: "#242a26",
          gray: "#78837b",
          darkgray: "#b4c0b7",
          dark: "#eef5ef",
          secondary: "#b8ff57",
          tertiary: "#82d9a0",
          highlight: "rgba(184, 255, 87, 0.11)",
          textHighlight: "#b3aa0288",
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
