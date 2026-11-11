import { JSX, memo } from "react"

const translatePage = async (): Promise<void> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) throw new Error("No active tab")
    await chrome.runtime.sendMessage({ type: "translate", tabId: tab.id })
  } catch (e) {
    console.error(e)
  }
}

const App = (): JSX.Element => {
  return <button onClick={translatePage}>翻訳</button>
}

export default memo(App)
