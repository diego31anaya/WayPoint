import { useEffect, useState } from 'react'
import { AuthContext } from './auth'
const SESSION_KEY = 'waypoint-demo-session-v1'

function readSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null')
    return session && typeof session.email === 'string' && session.email.trim()
      ? { email: session.email.trim() }
      : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)

  useEffect(() => {
    try {
      if (user) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(user))
      } else {
        window.localStorage.removeItem(SESSION_KEY)
      }
    } catch {
      // Keep the session active for this page view if browser storage is unavailable.
    }
  }, [user])

  function signIn(nextUser) {
    setUser({ email: nextUser.email.trim() })
  }

  function signOut() {
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
