import { createContext, useContext } from 'react'

// Kept apart from AuthProvider so fast refresh can reload the provider file.
export const AuthContext = createContext(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
