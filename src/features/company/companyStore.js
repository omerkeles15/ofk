import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Mock geçmiş data üreteci - 5 dakika aralıklı kayıtlar
function generateHistory(deviceId, unit, count = 120) {
  const baseValues = { 'DEV-001': 70, 'DEV-002': 3.0, 'DEV-003': 60, 'DEV-004': 218 }
  const base = baseValues[deviceId] ?? 50
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => ({
    id: `${deviceId}-H-${i}`,
    value: parseFloat((base + (Math.random() - 0.5) * 10).toFixed(2)),
    unit,
    timestamp: new Date(now - (count - i) * 5 * 60 * 1000).toISOString(),
  }))
}

// Geçmiş veriler ayrı map: { [deviceId]: [...records] }

// Tüm cihazlardan en yüksek numarayı bul, bir sonrakini üret
function getNextDeviceId(companies) {
  const ids = companies
    .flatMap((c) => c.locations)
    .flatMap((l) => l.devices)
    .map((d) => {
      const match = d.id.match(/DEV-(\d+)/)
      return match ? parseInt(match[1], 10) : 0
    })
  const max = ids.length > 0 ? Math.max(...ids) : 0
  return `DEV-${String(max + 1).padStart(3, '0')}`
}
const initialHistory = {
  'DEV-001': generateHistory('DEV-001', '°C'),
  'DEV-002': generateHistory('DEV-002', 'bar'),
  'DEV-003': generateHistory('DEV-003', '%'),
  'DEV-004': generateHistory('DEV-004', 'V'),
}

const initialCompanies = [
  {
    id: 1,
    displayName: 'Acme Enerji',
    fullName: 'Acme Enerji Sanayi A.Ş.',
    managers: ['firma1'],
    locations: [
      {
        id: 1,
        name: 'İzmir Tire Tesisi',
        managers: ['lokasyon1'],
        users: ['kullanici1'],
        devices: [
          { id: 'DEV-001', tagName: 'Sıcaklık Sensörü A', value: 72.4, unit: '°C', timestamp: new Date().toISOString(), status: 'online' },
          { id: 'DEV-002', tagName: 'Basınç Sensörü B', value: 3.2, unit: 'bar', timestamp: new Date().toISOString(), status: 'online' },
          { id: 'DEV-003', tagName: 'Nem Sensörü C', value: 65, unit: '%', timestamp: new Date().toISOString(), status: 'offline' },
        ],
      },
      {
        id: 2,
        name: 'İstanbul Fabrika',
        managers: [],
        users: [],
        devices: [
          { id: 'DEV-004', tagName: 'Voltaj Sensörü D', value: 220, unit: 'V', timestamp: new Date().toISOString(), status: 'online' },
        ],
      },
    ],
  },
]

export const useCompanyStore = create(
  persist(
    (set, get) => ({
  companies: initialCompanies,
  deviceHistory: initialHistory, // { [deviceId]: [{id, value, unit, timestamp}] }
  ioHistory: {}, // { ["{deviceId}:{address}"]: IOHistoryRecord[] }

  // --- PLC I/O Nokta Bazlı Geçmiş Aksiyonları ---

  // Tek bir I/O noktasına geçmiş kayıt ekle
  appendIOHistory: (deviceId, address, record) =>
    set((s) => {
      const key = `${deviceId}:${address}`
      return {
        ioHistory: {
          ...s.ioHistory,
          [key]: [...(s.ioHistory[key] ?? []), record],
        },
      }
    }),

  // Toplu I/O geçmiş kaydı ekle (tek JSON geldiğinde tüm noktalar güncellenir)
  appendBulkIOHistory: (deviceId, dataMap, timestamp) =>
    set((s) => {
      const updated = { ...s.ioHistory }
      for (const [address, value] of Object.entries(dataMap)) {
        const key = `${deviceId}:${address}`
        const record = {
          id: `${key}-H-${Date.now()}`,
          value: String(value),
          timestamp,
        }
        updated[key] = [...(updated[key] ?? []), record]
      }
      return { ioHistory: updated }
    }),

  // Tek bir I/O noktasının geçmişini sil
  clearIOHistory: (deviceId, address) =>
    set((s) => {
      const key = `${deviceId}:${address}`
      return { ioHistory: { ...s.ioHistory, [key]: [] } }
    }),

  // Bir cihazın tüm I/O geçmişini sil
  clearAllIOHistory: (deviceId) =>
    set((s) => {
      const updated = { ...s.ioHistory }
      for (const key of Object.keys(updated)) {
        if (key.startsWith(`${deviceId}:`)) updated[key] = []
      }
      return { ioHistory: updated }
    }),

  // Geçmişe yeni kayıt ekle (gerçek projede WebSocket/polling ile çağrılır)
  appendHistory: (deviceId, record) =>
    set((s) => ({
      deviceHistory: {
        ...s.deviceHistory,
        [deviceId]: [...(s.deviceHistory[deviceId] ?? []), record],
      },
    })),

  // Tüm geçmişi sil (şifre kontrolü store dışında yapılır)
  clearHistory: (deviceId) =>
    set((s) => ({
      deviceHistory: { ...s.deviceHistory, [deviceId]: [] },
    })),

  // Belirli tarih aralığını sil
  deleteHistoryRange: (deviceId, fromTs, toTs) =>
    set((s) => ({
      deviceHistory: {
        ...s.deviceHistory,
        [deviceId]: (s.deviceHistory[deviceId] ?? []).filter(
          (r) => r.timestamp < fromTs || r.timestamp > toTs
        ),
      },
    })),

  // Bir sonraki otomatik Device ID'yi döner (preview için)
  peekNextDeviceId: () => getNextDeviceId(get().companies),

  addCompany: (company) => {
    const companies = get().companies
    const maxId = companies.reduce((max, c) => Math.max(max, c.id), 0)
    const newCompany = { ...company, id: maxId + 1, locations: [] }
    set((s) => ({ companies: [...s.companies, newCompany] }))
  },

  updateCompany: (id, data) =>
    set((s) => ({
      companies: s.companies.map((c) => (c.id === id ? { ...c, ...data } : c)),
    })),

  deleteCompany: (id) =>
    set((s) => ({ companies: s.companies.filter((c) => c.id !== id) })),

  addLocation: (companyId, location) => {
    const company = get().companies.find((c) => c.id === companyId)
    const companyLocIds = (company?.locations ?? []).map((l) => l.id)
    const maxLocId = companyLocIds.length > 0 ? Math.max(...companyLocIds) : 0
    const newLoc = { ...location, id: maxLocId + 1, users: [], devices: [] }
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId ? { ...c, locations: [...c.locations, newLoc] } : c
      ),
    }))
  },

  addDevice: (companyId, locationId, device) => {
    // ID otomatik üretilir, dışarıdan gelirse override edilmez
    const autoId = getNextDeviceId(get().companies)
    const newDevice = {
      ...device,
      id: autoId,
      value: 0,
      timestamp: new Date().toISOString(),
      status: 'offline',
      // deviceType ve subtype form'dan gelir, unit katalogdan otomatik atanır
    }
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId
          ? {
              ...c,
              locations: c.locations.map((l) =>
                l.id === locationId ? { ...l, devices: [...l.devices, newDevice] } : l
              ),
            }
          : c
      ),
    }))
  },

  deleteDevice: (companyId, locationId, deviceId) =>
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId
          ? {
              ...c,
              locations: c.locations.map((l) =>
                l.id === locationId
                  ? { ...l, devices: l.devices.filter((d) => d.id !== deviceId) }
                  : l
              ),
            }
          : c
      ),
    })),

  updateDevice: (companyId, locationId, deviceId, data) =>
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId
          ? {
              ...c,
              locations: c.locations.map((l) =>
                l.id === locationId
                  ? {
                      ...l,
                      devices: l.devices.map((d) =>
                        d.id === deviceId ? { ...d, ...data } : d
                      ),
                    }
                  : l
              ),
            }
          : c
      ),
    })),

  toggleDeviceStatus: (companyId, locationId, deviceId) =>
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId
          ? {
              ...c,
              locations: c.locations.map((l) =>
                l.id === locationId
                  ? {
                      ...l,
                      devices: l.devices.map((d) =>
                        d.id === deviceId
                          ? { ...d, status: d.status === 'online' ? 'offline' : 'online', timestamp: new Date().toISOString() }
                          : d
                      ),
                    }
                  : l
              ),
            }
          : c
      ),
    })),

  updateLocation: (companyId, locationId, data) =>
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId
          ? { ...c, locations: c.locations.map((l) => (l.id === locationId ? { ...l, ...data } : l)) }
          : c
      ),
    })),

  deleteLocation: (companyId, locationId) =>
    set((s) => ({
      companies: s.companies.map((c) =>
        c.id === companyId
          ? { ...c, locations: c.locations.filter((l) => l.id !== locationId) }
          : c
      ),
    })),
  }),
  {
    name: 'scada-company-storage',
    // deviceHistory büyük olabilir, ayrı key'de tut
    partialize: (state) => ({
      companies: state.companies,
      deviceHistory: state.deviceHistory,
      ioHistory: state.ioHistory,
    }),
  }
))
