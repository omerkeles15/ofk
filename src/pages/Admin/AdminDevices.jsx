import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, BarChart2 } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import SearchInput from '../../components/SearchInput'
import { useSearch } from '../../hooks/useSearch'
import { adminMenu } from './adminMenu'
import axios from 'axios'

export default function AdminDevices() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [devices, setDevices] = useState([])
  const activeRef = useRef(true)

  // 2 saniyede bir /api/devices'dan güncel veri çek (cache'siz, son değer dahil)
  useEffect(() => {
    activeRef.current = true

    const fetchDevices = async () => {
      try {
        const res = await axios.get('/api/devices')
        if (activeRef.current) setDevices(res.data)
      } catch { /* ignore */ }
    }

    fetchDevices()
    const interval = setInterval(fetchDevices, 2000)

    return () => {
      activeRef.current = false
      clearInterval(interval)
    }
  }, [])

  const filtered = useSearch(devices, ['id', 'tagName', 'companyName', 'locationName'], search)
  const onlineCount = devices.filter((d) => d.status === 'online').length

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Cihaz Listesi</h1>
            <p className="text-gray-500 text-sm">
              {devices.length} cihaz · {onlineCount} aktif · {devices.length - onlineCount} pasif
            </p>
          </div>
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder="ID, tag name, firma veya lokasyon ara..." />

        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Device ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Tag Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Firma</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Lokasyon</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Son Değer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Durum</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Cihaz bulunamadı</td></tr>
              ) : filtered.map((d) => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded font-semibold">{d.id}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{d.tagName}</td>
                  <td className="px-4 py-3 text-gray-500">{d.companyName}</td>
                  <td className="px-4 py-3 text-gray-500">{d.locationName}</td>
                  <td className="px-4 py-3">
                    {d.status === 'online' && (d.lastValue != null) ? (
                      <>
                        <span className="font-semibold text-gray-800">{d.lastValue}</span>
                        <span className="text-gray-400 text-xs ml-1">{d.lastUnit || d.unit}</span>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
                      ${d.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
                      {d.status === 'online' ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/admin/device/${d.id}`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors">
                        <BarChart2 size={13} /> İzle
                      </button>
                      <button onClick={() => navigate(`/admin/companies/${d.companyId}`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium transition-colors">
                        <Eye size={13} /> Firma
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}
