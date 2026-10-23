import { useEffect, useMemo, useState } from 'react'
import './ChatPage.css'

const STORAGE_KEY = 'waypoint-chat-history-v1'

function loadChats(storageKey) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    return Array.isArray(stored)
      ? stored.filter((chat) => chat && typeof chat.id === 'string' && Array.isArray(chat.messages))
      : []
  } catch {
    return []
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function ChatPage({ user, onBack }) {
  const storageKey = `${STORAGE_KEY}:${user?.email?.toLowerCase() ?? 'demo'}`
  const [chats, setChats] = useState(() => loadChats(storageKey))
  const [activeChatId, setActiveChatId] = useState(() => loadChats(storageKey)[0]?.id ?? null)
  const [draft, setDraft] = useState('')
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) ?? null, [chats, activeChatId])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(chats))
    } catch {
      // The chat remains usable for this session when browser storage is unavailable.
    }
  }, [chats, storageKey])

  function startNewChat() {
    const chat = { id: createId(), title: 'New chat', createdAt: new Date().toISOString(), messages: [] }
    setChats((current) => [chat, ...current])
    setActiveChatId(chat.id)
    setDraft('')
  }

  function sendMessage(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    const chatId = activeChatId ?? createId()
    const now = new Date().toISOString()
    const userMessage = { id: createId(), role: 'user', content: text, createdAt: now }
    const assistantMessage = { id: createId(), role: 'assistant', content: 'Message recieved', createdAt: new Date().toISOString() }
    setChats((current) => {
      const existing = current.find((chat) => chat.id === chatId)
      if (!existing) {
        return [{ id: chatId, title: text.slice(0, 48), createdAt: now, messages: [userMessage, assistantMessage] }, ...current]
      }
      return [
        { ...existing, title: existing.messages.length ? existing.title : text.slice(0, 48), createdAt: now, messages: [...existing.messages, userMessage, assistantMessage] },
        ...current.filter((chat) => chat.id !== chatId),
      ]
    })
    setActiveChatId(chatId)
    setDraft('')
  }

  return (
    <main className="chat-page">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-top">
          <a className="chat-brand" href="#home" onClick={(event) => { event.preventDefault(); onBack() }} aria-label="Back to WayPoint">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>WayPoint</span>
          </a>
          <button className="chat-new-button" type="button" onClick={startNewChat}><span aria-hidden="true">＋</span> New chat</button>
        </div>
        <div className="chat-history-heading">Recent</div>
        <nav className="chat-history" aria-label="Previous chats">
          {chats.length ? chats.map((chat) => (
            <button className={`chat-history-item${chat.id === activeChatId ? ' is-active' : ''}`} type="button" key={chat.id} onClick={() => setActiveChatId(chat.id)}>
              <span className="chat-history-icon" aria-hidden="true">▤</span><span>{chat.title || 'New chat'}</span>
            </button>
          )) : <p className="chat-history-empty">Your conversations will appear here.</p>}
        </nav>
        <div className="chat-sidebar-footer"><span className="chat-user-avatar">{user?.email?.[0]?.toUpperCase() ?? 'W'}</span><span>{user?.email ?? 'WayPoint account'}</span></div>
      </aside>

      <section className="chat-main" aria-label="WayPoint chat">
        <header className="chat-topbar">
          <button className="chat-mobile-back" type="button" onClick={onBack}>← WayPoint</button>
          <span>WayPoint assistant <span className="chat-model-badge">Preview</span></span>
          <button className="chat-close-button" type="button" onClick={onBack} aria-label="Close chat">×</button>
        </header>
        <div className={`chat-conversation${activeChat?.messages.length ? ' has-messages' : ''}`}>
          {activeChat?.messages.length ? (
            <div className="chat-messages">
              {activeChat.messages.map((item) => (
                <article className={`chat-message ${item.role}`} key={item.id}>
                  <span className="chat-message-avatar">{item.role === 'user' ? (user?.email?.[0]?.toUpperCase() ?? 'Y') : 'W'}</span>
                  <p>{item.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="chat-empty-state">
              <div className="chat-empty-mark" aria-hidden="true"><span className="brand-mark"><i /><i /><i /><i /></span></div>
              <h1>What would you like to explore?</h1>
              <p>Ask about your neighborhood, nearby businesses, or ideas for reaching local customers.</p>
              <div className="chat-suggestion-list">
                <button type="button" onClick={() => setDraft('What can I learn about my neighborhood?')}>What can I learn about my neighborhood?</button>
                <button type="button" onClick={() => setDraft('How can I explore nearby competitors?')}>How can I explore nearby competitors?</button>
              </div>
            </div>
          )}
        </div>
        <div className="chat-compose-wrap">
          <form className="chat-compose" onSubmit={sendMessage}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Message WayPoint" rows="1" aria-label="Message WayPoint" />
            <button type="submit" disabled={!draft.trim()} aria-label="Send message">↑</button>
          </form>
          <p className="chat-compose-note">Chats are saved in this browser. Assistant responses are a preview.</p>
        </div>
      </section>
    </main>
  )
}

export default ChatPage
