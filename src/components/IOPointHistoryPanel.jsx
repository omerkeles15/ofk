import { useState, useMemo } from 'react'
import { ArrowLeft, Trash2, Filter } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import { useCompanyStore } from '../features/company/companyStore'

const PAGE_SIZE_OPTIONS = [50, 100, 200]
const ADMIN_PASSWORD = 'admin123'

/**
 * Değeri dataType'a göre parse eder ve gösterim formatına çevirir.
 * Dijital (bit) noktalar: "1" → true (ON), "0" → false (OFF)
 * Analog/register: dataType'a göre parseInt veya parseFloat
 */
function parseValue(rawValue, dataType) {
  if (dataType === 'bit') {
    return rawValue === '1' || rawValue === 'true' || rawValue === true
  }
  if (dataType === 'float') return parseFloat(rawValue)
  return parseInt(rawValue, 10)
}

/**
 * Dijital değer için ON/OFF badge render eder.
 */
function DigitalBadge({ value }) {
  const isOn = value === true || value === '1' || value === 'true'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
      ${isOn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-green-500' : 'bg-red-500'}`} />
      {isOn ? 'ON' : 'OFF'}
    </span>
  )
}

/**
 * IOPointHistoryPanel — Seçilen I/O noktasının geçmiş verilerini tablo formatında gösterir.
 *
 * Props:
 * - deviceId: Cihaz ID (ör: "DEV-005")
 * - address: I/O nokta adresi (ör: "X0", "AI0", "D50")
 * - tagName: Tag ismi (ör: "Start Butonu")
 * - dataType: Veri tipi ("bit", "word", "dword", "unsigned", "udword", "float")
 * - isAdmin: Admin yetkisi
 * - onClose: Panel kapatma callback
 */
export default function IOPointHistoryPanel({ deviceId, address, tagName, dataType, isAdmin, onClose }) {
  const ioHistory = useCompanyStore((s) => s.ioHistory)
  const clearIOHistory = useCompanyStore((s) => s.clearIOHistory)

  const key = `${deviceId}:${address}`
  const records = ioHistory[key] ?? []

  const [pageSize, setPageSize] = useState(50)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isBit = dataType === 'bit'

  // Tarih sırasına göre azalan sıralama (en yeni en üstte)
  const sorted = useMemo(() =>
    [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [records]
  )

  // Tarih filtresi
  const filtered = useMemo(() => {
    let data = sorted
    if (filterFrom) data = data.filter((r) => new Date(r.timestamp) >= new Date(filterFrom))
    if (filterTo) data = data.filter((r) => new Date(r.timestamp) <= new Date(filterTo))
    return data
  }, [sorted, filterFrom, filterTo])

  // Sayfalama
  const paginated = filtered.slice(0, pageSize)

  const handleDeleteConfirm = () => {
    clearIOHistory(deviceId, address)
    setShowDeleteConfirm(false)
  }

  const handlePasswordVerify = (pw) => pw === ADMIN_PASSWORD

  const clearFilters = () => {
    setFilterFrom('')
    setFilterTo('')
  }

  // Adres tipini belirle
  const getAddressType = () => {
    if (address.startsWith('X')) return 'Dijital Giriş'
    if (address.startsWith('Y')) return 'Dijital Çıkış'
    if (address.startsWith('AI')) return 'Analog Giriş'
    if (address.startsWith('AO')) return 'Analog Çıkış'
    if (address.startsWith('D')) return 'Data Register'
    return ''
  }

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="font-mono">{address}</span>
            {tagName && <span className="text-gray-500 font-normal">— {tagName}</span>}
          </h2>
          <p className="text-xs text-gray-400">{getAddressType()} · {deviceId}</p>
        </div>
      </div>

      {/* Filtre alanı */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={15} /><span className="font-medium">Filtrele</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Başlangıç</label>
            <input type="datetime-local" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Bitiş</label>
            <input type="datetime-local" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Göster</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>İlk {n} kayıt</option>)}
            </select>
          </div>
          <button onClick={clearFilters}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 mt-auto">Temizle</button>
          {isAdmin && records.length > 0 && (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50 mt-auto">
              <Trash2 size={13} /> Tüm Geçmişi Sil
            </button>
          )}
        </div>
      </div>

      {/* Özet istatistikler */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Toplam Kayıt', value: records.length },
          { label: 'Filtreli Kayıt', value: filtered.length },
          { label: 'Gösterilen', value: paginated.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Geçmiş tablosu */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Değer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tarih</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Saat</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400">Kayıt bulunamadı</td></tr>
            ) : paginated.map((r, i) => {
              const dt = new Date(r.timestamp)
              const parsed = parseValue(r.value, dataType)
              return (
                <tr key={r.id ?? i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    {isBit ? <DigitalBadge value={r.value} /> : (
                      <span className="font-semibold text-gray-800">{isNaN(parsed) ? r.value : parsed}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{dt.toLocaleDateString('tr-TR')}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{dt.toLocaleTimeString('tr-TR')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Silme onay dialogu */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Tüm Geçmişi Sil"
          message={`"${address}${tagName ? ` — ${tagName}` : ''}" noktasına ait tüm geçmiş veriler silinecek. Bu işlem geri alınamaz.`}
          requirePassword
          onPasswordVerify={handlePasswordVerify}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
