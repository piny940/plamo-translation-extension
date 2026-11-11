import { JSX, memo, useEffect, useState } from "react"
import { deleteCache, listCachedPages } from "./cache"

type Tab = "translate" | "cache"

const translatePage = async (): Promise<void> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) throw new Error("No active tab")
    await chrome.runtime.sendMessage({ type: "translate", tabId: tab.id, url: tab.url })
  } catch (e) {
    console.error(e)
  }
}

const CacheList = (): JSX.Element => {
  const [pages, setPages] = useState<string[]>([])

  useEffect(() => {
    const load = (): void => {
      listCachedPages().then(setPages).catch(console.error)
    }
    const onChanged = (_: unknown, areaName: string): void => {
      if (areaName === "local") load()
    }
    load()
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  if (pages.length === 0) return <p>キャッシュはありません</p>
  return (
    <ul className="cache-list">
      {pages.map((page) => (
        <li key={page} className="cache-item">
          <span className="cache-url">{page}</span>
          <button className="cache-delete" onClick={() => deleteCache(page).catch(console.error)}>
            削除
          </button>
        </li>
      ))}
    </ul>
  )
}

const App = (): JSX.Element => {
  const [tab, setTab] = useState<Tab>("translate")
  return (
    <div className="layout">
      <nav className="navbar">
        <button className={tab === "translate" ? "active" : ""} onClick={() => setTab("translate")}>
          翻訳
        </button>
        <button className={tab === "cache" ? "active" : ""} onClick={() => setTab("cache")}>
          キャッシュ
        </button>
      </nav>
      <main className="content">
        {tab === "translate" ? (
          <button className="translate-button" onClick={translatePage}>翻訳</button>
        ) : (
          <CacheList />
        )}
      </main>
    </div>
  )
}

export default memo(App)
