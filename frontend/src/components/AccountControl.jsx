import './AccountControl.css'

function getInitials(user) {
  const label = user?.displayName || user?.name || user?.user_metadata?.full_name || ''
  if (!label && user?.email) {
    const emailName = user.email.split('@')[0]
    const parts = emailName.split(/[._-]+/).filter(Boolean)
    return parts.length > 1
      ? parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('')
      : emailName.slice(0, 2).toUpperCase()
  }
  return label
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function AccountControl({ user = null, onCreateAccount, onOpenDashboard }) {
  if (user) {
    const initials = getInitials(user) || '?'
    const label = user.displayName || user.name || user.user_metadata?.full_name || user.email || 'your account'

    if (onOpenDashboard) {
      return (
        <button
          className="account-avatar"
          type="button"
          aria-label={`Open dashboard for ${label}`}
          onClick={onOpenDashboard}
        >
          {initials}
        </button>
      )
    }

    return <span className="account-avatar" role="img" aria-label={`Signed in as ${label}`}>{initials}</span>
  }

  return (
    <button className="create-account-button" type="button" onClick={onCreateAccount}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="7" cy="6" r="3" />
        <path d="M1.8 16.5c.5-3 2.2-4.5 5.2-4.5 1.7 0 3 .5 3.9 1.5M15 8v7m-3.5-3.5h7" />
      </svg>
      <span>Create account</span>
    </button>
  )
}

export default AccountControl
