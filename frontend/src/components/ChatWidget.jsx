import { useEffect, useRef, useState } from 'react'
import './ChatWidget.css'

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! Send me a message and I’ll be happy to help.' },
  ])
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  function handleSubmit(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    setMessages((currentMessages) => [
      ...currentMessages,
      { role: 'user', text },
      { role: 'assistant', text: 'Message recieved' },
    ])
    setDraft('')
  }

  return (
    <div className="chat-widget">
      {isOpen && (
        <section className="chat-panel" aria-label="WayPoint chat">
          <header className="chat-header">
            <div className="chat-header-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4.5 5.75h15v10.5h-8.1L7 19.5v-3.25H4.5z" />
                <path d="M8 10.5h8M8 13.5h5" />
              </svg>
            </div>
            <div className="chat-title">
              <strong>WayPoint assistant</strong>
              <span>Here to help you explore</span>
            </div>
            <button
              className="chat-close"
              type="button"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
            </button>
          </header>

          <div className="chat-messages" role="log" aria-label="Chat messages" aria-relevant="additions">
            {messages.map((message, index) => (
              <div className={`chat-message chat-message-${message.role}`} key={`${message.role}-${index}`}>
                {message.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-composer" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type a message..."
              aria-label="Type a chat message"
            />
            <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M10 4l6 6-6 6" /></svg>
            </button>
          </form>
        </section>
      )}

      <button
        className="chat-launcher"
        type="button"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.75h15v10.5h-8.1L7 19.5v-3.25H4.5z" /><path d="M8 10.5h8M8 13.5h5" /></svg>
        )}
      </button>
    </div>
  )
}

export default ChatWidget
