const PREFIX = "cache:"

type PageCache = Record<string, string>

export const toCacheKey = (url: string | undefined): string | null => {
  if (url === undefined) return null
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.origin + u.pathname
  } catch {
    return null
  }
}

export const getCache = async (page: string): Promise<PageCache> => {
  const key = PREFIX + page
  const result = await chrome.storage.local.get(key)
  return (result[key] as PageCache | undefined) ?? {}
}

export const putCache = async (page: string, source: string, translated: string): Promise<void> => {
  const cache = await getCache(page)
  cache[source] = translated
  await chrome.storage.local.set({ [PREFIX + page]: cache })
}

export const listCachedPages = async (): Promise<string[]> => {
  const all = await chrome.storage.local.get(null)
  return Object.keys(all)
    .filter((key) => key.startsWith(PREFIX))
    .map((key) => key.slice(PREFIX.length))
    .sort()
}

export const deleteCache = async (page: string): Promise<void> => {
  await chrome.storage.local.remove(PREFIX + page)
}
