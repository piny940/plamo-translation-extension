import { getCache, putCache, toCacheKey } from "./cache"
import { applyTranslation, collectUnits, pickNearestId } from "./content"

const OLLAMA_URL = "http://localhost:11434/api/generate"
const MODEL = "hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M"
const CONCURRENCY = 3

const translate = async (text: string): Promise<string> => {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      raw: true,
      stream: false,
      prompt:
        "<|plamo:tag|>dataset<|plamo:msg|>translation" +
        "<|plamo:tag|>input<|plamo:msg|>" +
        text +
        "<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>ja<|plamo:msg|>",
      options: {
        temperature: 0,
        num_ctx: 8192,
        num_predict: 4096,
        stop: ["<|plamo:tag|>", "<|plamo:bos|>"],
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`)
  }
  const data: { response: string } = await res.json()
  return data.response
}

const translateTab = async (tabId: number, page: string | null): Promise<void> => {
  console.log("Start translating")
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectUnits,
  })
  const pending = new Map((injection?.result ?? []).map((unit) => [unit.id, unit]))
  if (page !== null) {
    const cache = await getCache(page)
    for (const unit of [...pending.values()]) {
      const cached = cache[unit.text]
      if (cached === undefined) continue
      pending.delete(unit.id)
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: applyTranslation,
          args: [unit.id, cached],
        })
      } catch (e) {
        console.error(e)
      }
    }
  }
  const worker = async (): Promise<void> => {
    while (pending.size > 0) {
      let hoveredId: number | null = null
      try {
        const [hovered] = await chrome.scripting.executeScript({
          target: { tabId },
          func: pickNearestId,
          args: [[...pending.keys()]],
        })
        hoveredId = hovered?.result ?? null
      } catch (e) {
        console.error(e)
      }
      const unit = (hoveredId === null ? undefined : pending.get(hoveredId)) ?? pending.values().next().value
      if (unit === undefined) return
      pending.delete(unit.id)
      try {
        const translated = await translate(unit.text)
        await chrome.scripting.executeScript({
          target: { tabId },
          func: applyTranslation,
          args: [unit.id, translated],
        })
        if (page !== null) await putCache(page, unit.text, translated)
      } catch (e) {
        console.error(e)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as { type?: unknown; tabId?: unknown; url?: unknown; text?: unknown }
  if (msg.type === "translate" && typeof msg.tabId === "number") {
    const url = typeof msg.url === "string" ? msg.url : undefined
    translateTab(msg.tabId, toCacheKey(url)).catch(console.error)
  }
  if (msg.type === "translateText" && typeof msg.text === "string") {
    translate(msg.text)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((e) => {
        console.error(e)
        sendResponse({ ok: false })
      })
    return true
  }
  return undefined
})
