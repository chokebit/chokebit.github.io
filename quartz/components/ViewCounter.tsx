import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import styles from "./styles/viewCounter.scss"

const ViewCounter: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const lang = fileData.frontmatter?.lang === "cn" ? "cn" : "en"
  const isHome = fileData.slug === "index" || fileData.slug === "index.cn"

  return (
    <div
      class={`view-counter ${isHome ? "view-counter--total" : "view-counter--page"}`}
      data-view-counter
      data-counter-mode={isHome ? "total" : "page"}
      role="status"
      aria-live="polite"
    >
      <span class="view-counter__signal" aria-hidden="true" />
      <span class="view-counter__label">
        {isHome
          ? lang === "cn"
            ? "全站访问"
            : "SITE VISITS"
          : lang === "cn"
            ? "阅读"
            : "VIEWS"}
      </span>
      <strong class="view-counter__value" data-counter-value>
        —
      </strong>
    </div>
  )
}

ViewCounter.css = styles
ViewCounter.afterDOMLoaded = `
const refreshViewCounters = async () => {
  const counters = Array.from(document.querySelectorAll("[data-view-counter]"))

  await Promise.all(counters.map(async (counter) => {
    const value = counter.querySelector("[data-counter-value]")
    if (!value) return

    const mode = counter.getAttribute("data-counter-mode")
    const path = mode === "total" ? "TOTAL" : window.location.pathname
    const endpoint = "https://chokebit.goatcounter.com/counter/" + encodeURIComponent(path) + ".json"

    counter.classList.remove("is-ready")

    try {
      const response = await fetch(endpoint, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
      })

      if (!response.ok) throw new Error("GoatCounter returned " + response.status)

      const data = await response.json()
      value.textContent = data.count ?? "0"
      counter.classList.add("is-ready")
    } catch {
      value.textContent = "—"
    }
  }))
}

refreshViewCounters()
document.addEventListener("nav", refreshViewCounters)
`

export default (() => ViewCounter) satisfies QuartzComponentConstructor
