import { FullSlug, resolveRelative } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import styles from "./styles/navLinks.scss"

const NavLinks: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const lang = fileData.frontmatter?.lang === "cn" ? "cn" : "en"
  const currentSlug = fileData.slug ?? ("index" as FullSlug)
  const homeSlug = (lang === "cn" ? "index.cn" : "index") as FullSlug

  const links = [
    ...(lang === "cn"
      ? [
          {
            label: "量化",
            slug: "quant/index.cn" as FullSlug,
            section: "quant/",
            matchChildren: true,
          },
        ]
      : []),
    {
      label: "AI Native",
      slug: (lang === "cn" ? "ai-native/index.cn" : "ai-native/index") as FullSlug,
      section: "ai-native/",
      matchChildren: true,
    },
    {
      label: lang === "cn" ? "技术档案" : "Tech Archive",
      slug: (lang === "cn" ? "tech/index.cn" : "tech/index") as FullSlug,
      section: "tech/",
      matchChildren: true,
    },
    {
      label: lang === "cn" ? "归档" : "Archive",
      slug: (lang === "cn" ? "build/index.cn" : "products/index") as FullSlug,
      section: lang === "cn" ? "build/" : "products/",
      matchChildren: true,
    },
  ]

  const homeHref = resolveRelative(currentSlug, homeSlug)

  return (
    <nav class="nav-links" aria-label={lang === "cn" ? "主导航" : "Primary navigation"}>
      <a href={homeHref} class="brand-link" aria-label={lang === "cn" ? "Chokebit 首页" : "Chokebit home"}>
        <span class="brand-mark">C_</span>
        <span class="brand-name">CHOKEBIT</span>
      </a>
      <div class="nav-link-list">
        {links.map((link) => {
          const isActive =
            currentSlug === link.slug || (link.matchChildren && currentSlug.startsWith(link.section))
          return (
            <a
              href={resolveRelative(currentSlug, link.slug)}
              class="nav-link"
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </a>
          )
        })}
        <a href={`${homeHref}#about`} class="nav-link">
          {lang === "cn" ? "关于" : "About"}
        </a>
      </div>
    </nav>
  )
}

NavLinks.css = styles

export default (() => NavLinks) satisfies QuartzComponentConstructor
