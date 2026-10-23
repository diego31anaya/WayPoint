import { useEffect, useState } from 'react'
import { readSavedLocations, savedLocationId, writeSavedLocations } from '../services/savedLocations'
import { AuthContext } from './AuthContextBase'

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

function readInitialAuthState() {
  const user = readSession()
  return { user, savedLocations: readSavedLocations(user?.email) }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readInitialAuthState)
  const { user, savedLocations } = auth

  useEffect(() => {
    try {
      if (user) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(user))
        writeSavedLocations(user.email, savedLocations)
      } else {
        window.localStorage.removeItem(SESSION_KEY)
      }
    } catch {
      // Keep the session active for this page view if browser storage is unavailable.
    }
  }, [user, savedLocations])

  function signIn(nextUser) {
    const signedInUser = { email: nextUser.email.trim() }
    setAuth({ user: signedInUser, savedLocations: readSavedLocations(signedInUser.email) })
  }

  function signOut() {
    setAuth({ user: null, savedLocations: [] })
  }

  function saveLocation(location) {
    if (!location?.zipCode || !location?.businessType || !Number(location.radiusMiles)) return
    const savedLocation = {
      ...location,
      id: savedLocationId(location),
      savedAt: new Date().toISOString(),
    }
    setAuth((current) => current.user
      ? {
          ...current,
          savedLocations: [savedLocation, ...current.savedLocations.filter((item) => item.id !== savedLocation.id)],
        }
      : current)
  }

  function removeSavedLocation(id) {
    setAuth((current) => ({
      ...current,
      savedLocations: current.savedLocations.filter((location) => location.id !== id),
    }))
  }

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, savedLocations, saveLocation, removeSavedLocation }}>
      {children}
    </AuthContext.Provider>
  )
}
