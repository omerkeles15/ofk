import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Mock kullanıcılar - gerçek projede API'den gelir
const MOCK_USERS = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin', name: 'Sistem Admini' },
  { id: 2, username: 'firma1', password: 'firma123', role: 'company_manager', name: 'Ahmet Yılmaz', companyId: 1 },
  { id: 3, username: 'lokasyon1', password: 'lok123', role: 'location_manager', name: 'Mehmet Demir', companyId: 1, locationId: 1 },
  { id: 4, username: 'kullanici1', password: 'kul123', role: 'user', name: 'Ayşe Kaya', companyId: 1, locationId: 1 },
]

const ROLE_REDIRECTS = {
  admin: '/admin/dashboard',
  company_manager: '/company/dashboard',
  location_manager: '/location/dashboard',
  user: '/user/dashboard',
}

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (username, password) => {
        const found = MOCK_USERS.find(
          (u) => u.username === username && u.password === password
        )
        if (!found) throw new Error('Kullanıcı adı veya şifre hatalı')
        const { password: _, ...safeUser } = found
        set({ user: safeUser, token: `mock-token-${found.id}`, isAuthenticated: true })
        return ROLE_REDIRECTS[found.role]
      },

      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    { name: 'auth-storage' }
  )
)
