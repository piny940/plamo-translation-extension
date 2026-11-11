const host = document.createElement("div")
const root = host.attachShadow({ mode: "open" })

const button = document.createElement("button")
button.style.cssText =
  "position: fixed; z-index: 2147483647; padding: 2px; border: none; background: #fff; cursor: pointer; display: none; border-radius: 50%; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);"

const icon = document.createElement("img")
icon.src = chrome.runtime.getURL("translation-button.jpg")
icon.style.cssText = "display: block; width: 18px; height: 18px;"
button.append(icon)

const tooltip = document.createElement("div")
tooltip.style.cssText =
  "position: fixed; z-index: 2147483647; max-width: 600px; padding: 6px 10px; " +
  "background: #333; color: #fff; font-size: 16px; line-height: 1.5; border-radius: 4px; " +
  "pointer-events: none; white-space: pre-wrap; display: none;"

root.append(button, tooltip)
document.body.appendChild(host)

let selectedText = ""
let selectedRect: DOMRect | null = null
let requestId = 0

const isInsideHost = (event: Event): boolean => event.composedPath().includes(host)

const hideAll = (): void => {
  button.style.display = "none"
  tooltip.style.display = "none"
  requestId++
}

const showTooltip = (text: string, rect: DOMRect): void => {
  tooltip.textContent = text
  tooltip.style.display = "block"
  let left = rect.left
  if (left + tooltip.offsetWidth > window.innerWidth) left = window.innerWidth - tooltip.offsetWidth - 8
  if (left < 0) left = 8
  let top = rect.top - tooltip.offsetHeight - 8
  if (top < 0) top = rect.bottom + 8
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

document.addEventListener("mouseup", (event) => {
  if (isInsideHost(event)) return
  const selection = document.getSelection()
  const text = selection?.toString().trim() ?? ""
  if (selection === null || text === "" || selection.rangeCount === 0) {
    button.style.display = "none"
    return
  }
  selectedText = text
  selectedRect = selection.getRangeAt(0).getBoundingClientRect()
  button.style.left = `${event.clientX + 8}px`
  button.style.top = `${event.clientY + 8}px`
  button.style.display = "block"
})

document.addEventListener("mousedown", (event) => {
  if (isInsideHost(event)) return
  hideAll()
})

window.addEventListener("scroll", hideAll, { capture: true, passive: true })

button.addEventListener("mousedown", (event) => {
  event.preventDefault()
})

button.addEventListener("click", () => {
  const rect = selectedRect
  if (rect === null) return
  button.style.display = "none"
  const id = ++requestId
  showTooltip("翻訳中…", rect)
  chrome.runtime
    .sendMessage({ type: "translateText", text: selectedText })
    .then((response: { ok: boolean; text?: string } | undefined) => {
      if (id !== requestId) return
      showTooltip(response?.ok === true && response.text !== undefined ? response.text : "翻訳に失敗しました", rect)
    })
    .catch((e: unknown) => {
      console.error(e)
      if (id !== requestId) return
      showTooltip("翻訳に失敗しました", rect)
    })
})
