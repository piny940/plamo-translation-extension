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
}

type PlamoGlobal = { __plamo?: PlamoState }

export const collectUnits = (): Unit[] => {
  const g = globalThis as unknown as PlamoGlobal
  g.__plamo ??= { nextId: 1, originals: new Map(), inlineNodes: new Map() }
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
  const register = (el: Element, nodes: InlineNode[], text: string): void => {
    const id = state.nextId++
    el.setAttribute("data-plamo-id", String(id))
    state.originals.set(id, el.innerHTML)
    state.inlineNodes.set(id, nodes)
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
  if (target === null || nodes === undefined) return

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
}
