import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, BarChart2 } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import SearchInput from '../../components/SearchInput'
import { useCompanyStore } from '../../features/company/companyStore'
import { useSearch } from '../../hooks/useSearch'
import { adminMenu } from './adminMenu'

export default function AdminDevices() {
  const companies = useCompanyStore((s) => s.companies)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  // Tüm cihazları düz liste olarak topla
  const allDevices = useMemo(() => {
    const list = []
    for (const c of companies) {
      for (const l of c.locations) {
        for (const d of l.devices) {
          list.push({
            ...d,
            companyName: c.displayName,
            locationName: l.name,
            companyId: c.id,
            locationId: l.id,
          })
        }
      }
    }
    // DEV-001, DEV-002... sırasına göre sırala
    return list.sort((a, b) => {
      const na = parseInt(a.id.replace(/\D/g, ''), 10)
      const nb = parseInt(b.id.replace(/\D/g, ''), 10)
      return na - nb
    })
  }, [companies])

  const filtered = useSearch(allDevices, ['id', 'tagName', 'companyName', 'locationName'], search)

  const onlineCount = allDevices.filter((d) => d.status === 'online').length

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-5">
        {/* Başlık */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Cihaz Listesi</h1>
            <p className="text-gray-500 text-sm">
              {allDevices.length} cihaz · {onlineCount} aktif · {allDevices.length - onlineCount} pasif
            </p>
          </div>
        </div>

        {/* Arama */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ID, tag name, firma veya lokasyon ara..."
        />

        {/* Tablo */}
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
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">Cihaz bulunamadı</td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded font-semibold">{d.id}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.tagName}</td>
                    <td className="px-4 py-3 text-gray-500">{d.companyName}</td>
                    <td className="px-4 py-3 text-gray-500">{d.locationName}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-800">{d.value}</span>
                      <span className="text-gray-400 text-xs ml-1">{d.unit}</span>
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
                        <button
                          onClick={() => navigate(`/admin/device/${d.id}`)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors"
                          title="Geçmiş Verileri Görüntüle"
                        >
                          <BarChart2 size={13} /> İzle
                        </button>
                        <button
                          onClick={() => navigate(`/admin/companies/${d.companyId}`)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium transition-colors"
                          title="Firmaya Git"
                        >
                          <Eye size={13} /> Firma
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}
