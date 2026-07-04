import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import styles from "./styles/navLinks.scss"

const NavLinks: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const lang = (fileData.frontmatter?.lang as string) ?? "en"

  const links = [
    { label: lang === "zh" ? "首页" : "Home", href: `${lang}/index` },
    { label: lang === "zh" ? "关于" : "About Me", href: `${lang}/about` },
    { label: lang === "zh" ? "媒体" : "Media", href: `${lang}/media` },
    { label: lang === "zh" ? "赞助" : "Donate", href: `${lang}/donate` },
  ]

  return (
    <nav class="nav-links">
      {links.map((link) => (
        <a href={"/" + link.href} class="nav-link">
          {link.label}
        </a>
      ))}
    </nav>
  )
}

NavLinks.css = styles

export default (() => NavLinks) satisfies QuartzComponentConstructor
