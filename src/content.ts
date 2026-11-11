export interface Unit {
  id: number
  text: string
}

interface InlineNode {
  el: Element
  selfClosing: boolean
}

interface PlamoState {
  nextId: number
  originals: Map<number, string>
  inlineNodes: Map<number, InlineNode[]>
  originalTexts: Map<number, string>
  tooltipReady: boolean
}

type PlamoGlobal = { __plamo?: PlamoState }

export const collectUnits = (): Unit[] => {
  const g = globalThis as unknown as PlamoGlobal
  g.__plamo ??= {
    nextId: 1,
    originals: new Map(),
    inlineNodes: new Map(),
    originalTexts: new Map(),
    tooltipReady: false,
  }
  const state = g.__plamo

  const EXCLUDED_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "PRE", "CODE", "TEXTAREA", "SVG", "MATH",
  ])
  const LIST_TAGS = new Set(["UL", "OL", "DL"])
  const MAX_CHARS = 2000

  const isExcluded = (el: Element): boolean =>
    EXCLUDED_TAGS.has(el.tagName.toUpperCase()) ||
    el.getAttribute("translate") === "no" ||
    el.classList.contains("notranslate") ||
    (el instanceof HTMLElement && el.isContentEditable)

  const isBlock = (el: Element): boolean => {
    const display = getComputedStyle(el).display
    return !display.startsWith("inline") && display !== "none" && display !== "contents"
  }

  const blockMemo = new Map<Element, boolean>()
  const hasBlockDescendant = (el: Element): boolean => {
    const cached = blockMemo.get(el)
    if (cached !== undefined) return cached
    let result = false
    for (const child of Array.from(el.children)) {
      if (isBlock(child) || (!isExcluded(child) && hasBlockDescendant(child))) {
        result = true
        break
      }
    }
    blockMemo.set(el, result)
    return result
  }

  const hasText = (node: Node): boolean => (node.textContent ?? "").trim() !== ""

  const escape = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  const serialize = (node: Node, nodes: InlineNode[]): string => {
    let out = ""
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += escape((child.textContent ?? "").replace(/\s+/g, " "))
      } else if (child instanceof Element) {
        if (isExcluded(child) || !hasText(child)) {
          nodes.push({ el: child, selfClosing: true })
          out += `<t${nodes.length}/>`
        } else {
          nodes.push({ el: child, selfClosing: false })
          const n = nodes.length
          out += `<t${n}>${serialize(child, nodes)}</t${n}>`
        }
      }
    }
    return out
  }

  const units: Unit[] = []
  const addUnit = (el: Element): void => {
    const nodes: InlineNode[] = []
    const text = serialize(el, nodes).trim()
    if (text === "") return
    register(el, nodes, text)
  }
  const toText = (node: Node, depth: number): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ")
    if (!(node instanceof Element)) return ""
    const tag = node.tagName.toUpperCase()
    if (LIST_TAGS.has(tag)) {
      const indent = "  ".repeat(depth)
      const lines = Array.from(node.children).map((child) => {
        const childTag = child.tagName.toUpperCase()
        const marker =
          tag !== "DL" && childTag === "LI" ? "・" : tag === "DL" && childTag === "DD" ? "  " : ""
        return indent + marker + toText(child, depth + 1).trim()
      })
      return `\n${lines.join("\n")}\n`
    }
    return Array.from(node.childNodes).map((child) => toText(child, depth)).join("")
  }
  const register = (el: Element, nodes: InlineNode[], text: string): void => {
    const id = state.nextId++
    el.setAttribute("data-plamo-id", String(id))
    state.originals.set(id, el.innerHTML)
    state.inlineNodes.set(id, nodes)
    state.originalTexts.set(id, toText(el, 0).replace(/ *\n+/g, "\n").trim())
    units.push({ id, text })
  }

  const visit = (el: Element): void => {
    if (isExcluded(el) || el.hasAttribute("data-plamo-id")) return
    if (LIST_TAGS.has(el.tagName.toUpperCase())) {
      const nodes: InlineNode[] = []
      const text = serialize(el, nodes).trim()
      if (text !== "" && text.length <= MAX_CHARS) {
        register(el, nodes, text)
        return
      }
    }
    if (!hasBlockDescendant(el)) {
      if (hasText(el)) addUnit(el)
      return
    }
    let run: Node[] = []
    const flush = (): void => {
      if (run.some(hasText)) {
        const span = document.createElement("span")
        run[0]!.parentNode!.insertBefore(span, run[0]!)
        for (const node of run) span.appendChild(node)
        addUnit(span)
      }
      run = []
    }
    for (const child of Array.from(el.childNodes)) {
      const isInline =
        child.nodeType === Node.TEXT_NODE ||
        (child instanceof Element &&
          !isBlock(child) &&
          (isExcluded(child) || !hasBlockDescendant(child)))
      if (isInline) {
        run.push(child)
        continue
      }
      flush()
      if (child instanceof Element) visit(child)
    }
    flush()
  }

  visit(document.body)
  return units
}

export const applyTranslation = (id: number, translated: string): void => {
  const state = (globalThis as unknown as PlamoGlobal).__plamo
  const target = document.querySelector(`[data-plamo-id="${id}"]`)
  const nodes = state?.inlineNodes.get(id)
  if (state === undefined || target === null || nodes === undefined) return

  if (!state.tooltipReady) {
    state.tooltipReady = true
    const host = document.createElement("div")
    const tooltip = document.createElement("div")
    tooltip.style.cssText =
      "position: fixed; z-index: 2147483647; max-width: 600px; padding: 6px 10px; " +
      "background: #333; color: #fff; font-size: 16px; line-height: 1.5; border-radius: 4px; " +
      "pointer-events: none; white-space: pre-wrap; display: none;"
    host.attachShadow({ mode: "open" }).appendChild(tooltip)
    document.body.appendChild(host)
    const hide = (): void => {
      tooltip.style.display = "none"
    }
    document.addEventListener("mouseover", (event) => {
      const el =
        event.target instanceof Element ? event.target.closest("[data-plamo-translated]") : null
      const text = el === null ? undefined : state.originalTexts.get(Number(el.getAttribute("data-plamo-id")))
      if (el === null || text === undefined) {
        hide()
        return
      }
      tooltip.textContent = text
      tooltip.style.display = "block"
      const rect = el.getBoundingClientRect()
      let left = rect.left
      if (left + tooltip.offsetWidth > window.innerWidth) left = window.innerWidth - tooltip.offsetWidth - 8
      if (left < 0) left = 8
      tooltip.style.left = `${left}px`
      tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`
    })
    window.addEventListener("scroll", hide, { capture: true, passive: true })
  }

  const unescape = (s: string): string =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

  type Token =
    | { kind: "text"; text: string }
    | { kind: "open" | "close" | "self"; n: number }

  const TAG = /<(\/?)t(\d+)(\/?)>/g
  const tokens: Token[] = []
  let last = 0
  for (const m of translated.matchAll(TAG)) {
    if (m.index > last) tokens.push({ kind: "text", text: translated.slice(last, m.index) })
    const n = Number(m[2])
    tokens.push({ kind: m[1] === "/" ? "close" : m[3] === "/" ? "self" : "open", n })
    last = m.index + m[0].length
  }
  if (last < translated.length) tokens.push({ kind: "text", text: translated.slice(last) })

  const used = new Set<number>()
  const stack: number[] = []
  let valid = true
  for (const token of tokens) {
    if (token.kind === "text") continue
    const node = nodes[token.n - 1]
    if (node === undefined) {
      valid = false
      break
    }
    if (token.kind === "close") {
      if (stack.pop() !== token.n) {
        valid = false
        break
      }
      continue
    }
    if (used.has(token.n)) return
    used.add(token.n)
    if (token.kind === "open") {
      if (node.selfClosing) {
        valid = false
        break
      }
      stack.push(token.n)
    }
  }
  if (stack.length > 0) valid = false

  if (!valid) {
    target.textContent = unescape(translated.replace(TAG, ""))
    target.setAttribute("data-plamo-translated", "")
    return
  }

  const fragment = document.createDocumentFragment()
  const parents: Node[] = [fragment]
  for (const token of tokens) {
    const parent = parents[parents.length - 1]!
    if (token.kind === "text") {
      parent.appendChild(document.createTextNode(unescape(token.text)))
    } else if (token.kind === "self") {
      parent.appendChild(nodes[token.n - 1]!.el)
    } else if (token.kind === "open") {
      const el = nodes[token.n - 1]!.el
      el.replaceChildren()
      parent.appendChild(el)
      parents.push(el)
    } else {
      parents.pop()
    }
  }
  target.replaceChildren(fragment)
  target.setAttribute("data-plamo-translated", "")
}
