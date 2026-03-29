import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const initialUsers = [
  { id: 2, username: 'firma1', name: 'Ahmet Yılmaz', role: 'company_manager', companyId: 1, locationId: null },
  { id: 3, username: 'lokasyon1', name: 'Mehmet Demir', role: 'location_manager', companyId: 1, locationId: 1 },
  { id: 4, username: 'kullanici1', name: 'Ayşe Kaya', role: 'user', companyId: 1, locationId: 1 },
]

export const useUserStore = create(
  persist(
    (set, get) => ({
      users: initialUsers,

      addUser: (user) => {
        const exists = get().users.find((u) => u.username === user.username)
        if (exists) throw new Error(`"${user.username}" kullanıcı adı zaten alınmış`)
        set((s) => ({ users: [...s.users, { ...user, id: Date.now() }] }))
      },

      updateUser: (id, data) =>
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...data } : u)) })),

      deleteUser: (id) =>
        set((s) => ({ users: s.users.filter((u) => u.id !== id) })),
    }),
    { name: 'scada-user-storage' }
  )
)
