import './ChatNavButton.css'

function ChatNavButton({ onClick }) {
  return (
    <button className="chat-nav-button" type="button" onClick={onClick}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 3.5h14v10H9.5L5.5 17v-3.5H3z" />
        <path d="M6.5 7.5h7M6.5 10.5h4.5" />
      </svg>
      <span>Chat</span>
    </button>
  )
}

export default ChatNavButton
