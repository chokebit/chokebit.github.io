import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import styles from "./styles/languageToggle.scss"

const LanguageToggle: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const currentLang = (fileData.frontmatter?.lang as string) ?? "en"
  const translations = (fileData.frontmatter?.translations as Record<string, string>) ?? {}

  return (
    <div class="language-toggle">
      <button
        class={`lang-btn ${currentLang === "en" ? "active" : ""}`}
        data-lang="en"
        data-href={translations.en ?? ""}
        aria-label="English"
      >
        EN
      </button>
      <span class="lang-sep">/</span>
      <button
        class={`lang-btn ${currentLang === "cn" ? "active" : ""}`}
        data-lang="cn"
        data-href={translations.cn ?? ""}
        aria-label="中文"
      >
        中文
      </button>
    </div>
  )
}

LanguageToggle.css = styles
LanguageToggle.afterDOMLoaded = `
const applyLang = (lang) => {
  document.documentElement.setAttribute("data-user-lang", lang)
  localStorage.setItem("user-lang", lang)
  for (const btn of document.querySelectorAll(".lang-btn")) {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === lang)
  }
}

const filterFolderPages = (lang) => {
  for (const li of document.querySelectorAll(".section-li")) {
    const a = li.querySelector("a")
    const href = a?.getAttribute("href") || ""
    const isCn = href.includes(".cn")
    li.style.display = (lang === "en" && isCn) || (lang === "cn" && !isCn) ? "none" : ""
  }
}

const localizeExplorer = (lang) => {
  for (const folderLi of document.querySelectorAll(".explorer .folder-container")) {
    const li = folderLi.parentElement
    const innerUl = li?.querySelector(":scope > .folder-outer > ul")
    if (!innerUl) continue
    // Find .cn index child
    const cnLink = innerUl.querySelector("a[data-for$='index.cn']")
    const folderLink = folderLi.querySelector(".folder-title")
    if (!folderLink) continue
    const defaultTitle = folderLink.getAttribute("data-default-title") || folderLink.textContent
    folderLink.setAttribute("data-default-title", defaultTitle)
    if (lang === "cn" && cnLink) {
      folderLink.textContent = cnLink.textContent
      folderLink.setAttribute("data-for", cnLink.getAttribute("data-for") || "")
      folderLink.setAttribute("href", cnLink.getAttribute("href") || "")
    } else {
      folderLink.textContent = defaultTitle
    }
  }
}

const saved = localStorage.getItem("user-lang")
const browserLang = navigator.language.startsWith("zh") ? "cn" : "en"
applyLang(saved ?? browserLang)

// Auto-redirect on first visit: if browser language differs from page language
// and a translation exists, redirect to the matching version.
if (!saved) {
  const targetBtn = document.querySelector(".lang-btn[data-lang='" + browserLang + "']")
  const targetHref = targetBtn?.getAttribute("data-href")
  if (targetHref) {
    window.location.href = "/" + targetHref
  }
}

// Initial folder page filtering
filterFolderPages(saved ?? browserLang)

document.addEventListener("nav", () => {
  const current = localStorage.getItem("user-lang") ?? "en"
  applyLang(current)
  // Poll until Explorer rendered, then localize
  let attempts = 0
  const poll = setInterval(() => {
    if (document.querySelector(".explorer .folder-container") || ++attempts > 20) {
      clearInterval(poll)
      localizeExplorer(current)
      filterFolderPages(current)
    }
  }, 100)
  for (const btn of document.querySelectorAll(".lang-btn")) {
    const handler = () => {
      const href = btn.getAttribute("data-href")
      const lang = btn.getAttribute("data-lang")
      if (lang) applyLang(lang)
      window.location.href = href ? "/" + href : "/" + (lang === "cn" ? "index.cn" : "")
    }
    btn.addEventListener("click", handler)
    window.addCleanup(() => btn.removeEventListener("click", handler))
  }
})
`

export default (() => LanguageToggle) satisfies QuartzComponentConstructor
