import { useEffect, useMemo, useState } from 'react'
import './ChatPage.css'
import { apiRequest } from '../services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

const STORAGE_KEY = 'waypoint-chat-history-v1'

function loadChats(storageKey) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    return Array.isArray(stored)
      ? stored.filter((chat) => chat && typeof chat.id === 'string' && Array.isArray(chat.messages))
        .map((chat) => ({ ...chat, conversationId: /^[0-9]+$/.test(String(chat.conversationId ?? '')) ? String(chat.conversationId) : null }))
      : []
  } catch {
    return []
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function ChatPage({ user, onBack, integration, search }) {
  const storageKey = `${STORAGE_KEY}:${user?.email?.toLowerCase() ?? 'demo'}`
  const [chats, setChats] = useState(() => loadChats(storageKey))
  const [activeChatId, setActiveChatId] = useState(() => loadChats(storageKey)[0]?.id ?? null)
  const [draft, setDraft] = useState('')
  const [pendingChatId, setPendingChatId] = useState(null)
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

  const analysis = integration.activeAnalysis
  const context = analysis?.agent_context
  const contextKey = context ? `${context.business_id}:${context.location_id}` : null
  const contextLoading = integration.selected?.status === 'loading' || integration.status === 'loading'
  const contextNote = contextLoading ? 'Location analysis is loading. General business chat is available; selected-location metrics are not attached yet.'
    : !context ? 'General business chat is available. No verified selected-location metrics are attached; simulated dashboard values are never sent as facts.' : null

  async function submit(text, retry = false) {
    if (!text || pendingChatId) return
    const chatId = activeChatId ?? createId()
    const existing = chats.find((chat) => chat.id === chatId)
    const now = new Date().toISOString()
    const userMessage = { id: createId(), role: 'user', content: text, createdAt: now }
    const priorMessages = existing?.messages ?? []
    const messages = retry ? priorMessages : [...priorMessages, userMessage]
    const locationLabel = integration.selected?.feature.properties.h3_cell ?? integration.locationLabel ?? search?.zipCode
    setChats((current) => [{ ...existing, id: chatId, title: existing?.messages.length ? existing.title : text.slice(0, 48), createdAt: existing?.createdAt ?? now, messages, error: null, retryText: null }, ...current.filter((chat) => chat.id !== chatId)])
    setActiveChatId(chatId)
    setDraft('')
    setPendingChatId(chatId)
    try {
      const selectedZone = context && integration.selected && integration.request ? {
        h3_cell: integration.selected.feature.properties.h3_cell,
        map_request: { business_type: integration.request.business_type, location: integration.request.location },
      } : null
      const response = await apiRequest('/agent/chat', { ...(context ?? {}), message: text,
        ...(selectedZone ? { selected_zone: selectedZone } : {}),
        ...(existing?.conversationId ? { conversation_id: existing.conversationId } : {}) })
      setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat,
        conversationId: response.conversation_id, contextKey,
        messages: [...chat.messages, { id: createId(), role: 'assistant', content: response.response, createdAt: new Date().toISOString(), location: context ? locationLabel : null, queryIds: response.analyst_query_ids }],
      } : chat))
    } catch (error) {
      setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, error: error.message, retryText: text,
        // Expired conversations require an explicit new thread; transport failures retain history.
        conversationId: error.status === 409 ? null : existing?.conversationId, contextKey: null,
      } : chat))
    } finally { setPendingChatId(null) }
  }

  function sendMessage(event) {
    event.preventDefault()
    if (draft.trim().length <= 3000) submit(draft.trim())
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
                  <div className="chat-message-content">{item.role === 'assistant' ? (
                    <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} skipHtml>{item.content}</ReactMarkdown></div>
                  ) : <p>{item.content}</p>}{(item.location || item.queryIds?.length > 0) && <small>{item.location && <>Location: {item.location} ? </>}{item.queryIds?.length > 0 && <>Snowflake queries: {item.queryIds.join(', ')}</>}</small>}</div>
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
          {contextNote && <p role="status">{contextNote}</p>}
          {context && <p>Current location: {integration.selected?.feature.properties.h3_cell ?? integration.locationLabel ?? search?.zipCode} ? {search?.businessType}</p>}
          {pendingChatId && pendingChatId === activeChatId && <p role="status">Cortex Agent is checking Snowflake metrics?</p>}
          {activeChat?.error && <p role="alert">{activeChat.error} <button disabled={!!pendingChatId} onClick={() => submit(activeChat.retryText, true)}>Retry</button></p>}
          <form className="chat-compose" onSubmit={sendMessage}>
            <textarea maxLength={3000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Message WayPoint" rows="1" aria-label="Message WayPoint" />
            <button type="submit" disabled={!draft.trim() || !!pendingChatId} aria-label="Send message">↑</button>
          </form>
          <p className="chat-compose-note">Chats are saved in this browser. Responses use the saved Snowflake Cortex Agent. Location metrics are attached only when verified.</p>
        </div>
      </section>
    </main>
  )
}

export default ChatPage
