import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Filter, AlertTriangle, BarChart2, Cpu, HelpCircle } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import Modal from '../../components/Modal'
import DeviceJsonInfoModal from '../../components/DeviceJsonInfoModal'
import IOPointHistoryPanel from '../../components/IOPointHistoryPanel'
import { useCompanyStore } from '../../features/company/companyStore'
import { useAuth } from '../../hooks/useAuth'
import { getDeltaXAddresses, getDeltaYAddresses, DATA_TYPES } from '../../features/device/deviceCatalog'

const PAGE_SIZE_OPTIONS = [50, 100, 200]
const ADMIN_PASSWORD = 'admin123'

function DateTimeInput({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}

function SensorView({ device, history, filtered, paginated }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Son Değer', value: `${device.value} ${device.unit}` },
          { label: 'Toplam Kayıt', value: history.length },
          { label: 'Filtreli Kayıt', value: filtered.length },
          { label: 'Gösterilen', value: paginated.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Değer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Birim</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tarih</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Saat</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">Kayıt bulunamadı</td></tr>
            ) : paginated.map((r, i) => {
              const dt = new Date(r.timestamp)
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{r.value}</td>
                  <td className="px-4 py-2.5 text-gray-500">{r.unit}</td>
                  <td className="px-4 py-2.5 text-gray-600">{dt.toLocaleDateString('tr-TR')}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{dt.toLocaleTimeString('tr-TR')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Tag input — kendi local state'i var, blur'da parent'a bildirir
function TagInput({ addr, value, onChange }) {
  const [local, setLocal] = useState(value)
  const ref = useRef(null)

  // Dışarıdan gelen value değişirse sync et (kaydet sonrası)
  useEffect(() => { setLocal(value) }, [value])

  return (
    <input
      ref={ref}
      type="text"
      placeholder="Tag ismi girin..."
      className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value)
        onChange(addr, e.target.value)
      }}
    />
  )
}

function PlcViewInner({ deviceId, plcIoConfig, modbusConfig, initialTags, isAdmin, onSaveTags, onDirtyChange, ioCurrentValues }) {
  const cfg = plcIoConfig ?? {}
  const xAddrs = getDeltaXAddresses(cfg.digitalInputs?.count ?? 0)
  const yAddrs = getDeltaYAddresses(cfg.digitalOutputs?.count ?? 0)
  const drStart = cfg.dataRegister?.start ?? 0
  const drEnd = cfg.dataRegister?.end ?? 0
  const drTypeLabel = DATA_TYPES.find((t) => t.value === cfg.dataRegister?.dataType)?.label ?? '-'

  const tagsRef = useRef({ ...(initialTags ?? {}) })
  const [renderKey, setRenderKey] = useState(0)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialTags ?? {}))
  const [saved, setSaved] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState(null) // { address, tagName, dataType }

  const setTag = useCallback((key, val) => {
    tagsRef.current = { ...tagsRef.current, [key]: val }
    const dirty = JSON.stringify(tagsRef.current) !== savedSnapshot
    onDirtyChange?.(dirty)
  }, [savedSnapshot, onDirtyChange])

  // Belirli adres grubunun taglarını temizle
  const clearTagsForGroup = useCallback((addrs) => {
    const updated = { ...tagsRef.current }
    addrs.forEach((a) => { delete updated[a] })
    tagsRef.current = updated
    const dirty = JSON.stringify(updated) !== savedSnapshot
    onDirtyChange?.(dirty)
    setRenderKey((k) => k + 1) // input'ları güncelle
  }, [savedSnapshot, onDirtyChange])

  const handleSave = useCallback(() => {
    const currentTags = { ...tagsRef.current }
    onSaveTags(currentTags)
    const snap = JSON.stringify(currentTags)
    setSavedSnapshot(snap)
    onDirtyChange?.(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }, [onSaveTags, onDirtyChange])

  const IoRow = ({ addr, color, statusColor, dataType: rowDataType }) => {
    const currentVal = ioCurrentValues?.[addr]
    const isBit = rowDataType === 'bit'
    const isOn = currentVal === '1' || currentVal === 'true' || currentVal === true
    const dotColor = currentVal != null
      ? (isBit ? (isOn ? 'bg-green-500' : 'bg-red-500') : 'bg-blue-400')
      : statusColor

    return (
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors group"
        onClick={() => setSelectedPoint({ address: addr, tagName: tagsRef.current[addr] || '', dataType: rowDataType })}
        title="Geçmiş verileri görüntüle"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
        <span className={`font-mono text-xs font-semibold w-12 shrink-0 ${color}`}>{addr}</span>
        {isAdmin ? (
          <TagInput addr={addr} value={tagsRef.current[addr] ?? ''} onChange={setTag} />
        ) : (
          <span className="flex-1 text-xs text-gray-700">{tagsRef.current[addr] || '—'}</span>
        )}
        {currentVal != null && (
          <span className="shrink-0 ml-1">
            {isBit ? (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold
                ${isOn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {isOn ? 'ON' : 'OFF'}
              </span>
            ) : (
              <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{currentVal}</span>
            )}
          </span>
        )}
        <span className="text-gray-300 group-hover:text-blue-400 shrink-0 text-xs ml-auto">▶</span>
      </div>
    )
  }

  const plcContent = (
    <div className="space-y-5">
      {modbusConfig && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Modbus Yapılandırma</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Slave ID', value: modbusConfig.slaveId },
              { label: 'Baud Rate', value: modbusConfig.baudRate },
              { label: 'Data Biti', value: modbusConfig.dataBits },
              { label: 'Stop Biti', value: modbusConfig.stopBits },
              { label: 'Parity', value: modbusConfig.parity?.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={handleSave}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors
              ${saved ? 'bg-green-100 text-green-700' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
            {saved ? '✓ Tag İsimleri Kaydedildi' : 'Tag İsimlerini Kaydet'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Dijital Girişler (X) — {xAddrs.length} adet
            </p>
            {isAdmin && xAddrs.length > 0 && (
              <button onClick={() => clearTagsForGroup(xAddrs)}
                className="text-xs text-red-400 hover:text-red-600">Tagları Temizle</button>
            )}
          </div>
          {isAdmin && <p className="text-xs text-gray-400 mb-2 italic">🟢 ON · 🔴 OFF — backend bağlandığında aktif olacak</p>}
          <div className="space-y-0.5">
            {xAddrs.length === 0 && <span className="text-xs text-gray-400">Tanımlı giriş yok</span>}
            {xAddrs.map((addr) => <IoRow key={`${addr}-${renderKey}`} addr={addr} color="text-blue-700" statusColor="bg-gray-300" dataType="bit" />)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Dijital Çıkışlar (Y) — {yAddrs.length} adet
            </p>
            {isAdmin && yAddrs.length > 0 && (
              <button onClick={() => clearTagsForGroup(yAddrs)}
                className="text-xs text-red-400 hover:text-red-600">Tagları Temizle</button>
            )}
          </div>
          <div className="space-y-0.5">
            {yAddrs.length === 0 && <span className="text-xs text-gray-400">Tanımlı çıkış yok</span>}
            {yAddrs.map((addr) => <IoRow key={`${addr}-${renderKey}`} addr={addr} color="text-green-700" statusColor="bg-gray-300" dataType="bit" />)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Analog Girişler (AI) — {cfg.analogInputs?.length ?? 0} kanal
            </p>
            {isAdmin && cfg.analogInputs?.length > 0 && (
              <button onClick={() => clearTagsForGroup(cfg.analogInputs.map((ai) => `AI${ai.channel}`))}
                className="text-xs text-red-400 hover:text-red-600">Tagları Temizle</button>
            )}
          </div>
          <div className="space-y-0.5">
            {(!cfg.analogInputs || cfg.analogInputs.length === 0) && <span className="text-xs text-gray-400">Tanımlı analog giriş yok</span>}
            {cfg.analogInputs?.map((ai) => {
              const addr = `AI${ai.channel}`
              const typeLabel = DATA_TYPES.find((t) => t.value === ai.dataType)?.label ?? ai.dataType
              const currentVal = ioCurrentValues?.[addr]
              return (
                <div key={`${addr}-${renderKey}`}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors group"
                  onClick={() => setSelectedPoint({ address: addr, tagName: tagsRef.current[addr] || '', dataType: ai.dataType })}
                  title="Geçmiş verileri görüntüle"
                >
                  <span className="font-mono text-xs font-semibold text-orange-600 w-12 shrink-0">{addr}</span>
                  <span className="text-xs text-gray-400 w-24 shrink-0">{typeLabel}</span>
                  {isAdmin ? (
                    <TagInput addr={addr} value={tagsRef.current[addr] ?? ''} onChange={setTag} />
                  ) : (
                    <span className="flex-1 text-xs text-gray-700">{tagsRef.current[addr] || '—'}</span>
                  )}
                  {currentVal != null && (
                    <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{currentVal}</span>
                  )}
                  <span className="text-gray-300 group-hover:text-blue-400 shrink-0 text-xs ml-auto">▶</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Analog Çıkışlar (AO) — {cfg.analogOutputs?.length ?? 0} kanal
            </p>
            {isAdmin && cfg.analogOutputs?.length > 0 && (
              <button onClick={() => clearTagsForGroup(cfg.analogOutputs.map((ao) => `AO${ao.channel}`))}
                className="text-xs text-red-400 hover:text-red-600">Tagları Temizle</button>
            )}
          </div>
          <div className="space-y-0.5">
            {(!cfg.analogOutputs || cfg.analogOutputs.length === 0) && <span className="text-xs text-gray-400">Tanımlı analog çıkış yok</span>}
            {cfg.analogOutputs?.map((ao) => {
              const addr = `AO${ao.channel}`
              const typeLabel = DATA_TYPES.find((t) => t.value === ao.dataType)?.label ?? ao.dataType
              const currentVal = ioCurrentValues?.[addr]
              return (
                <div key={`${addr}-${renderKey}`}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors group"
                  onClick={() => setSelectedPoint({ address: addr, tagName: tagsRef.current[addr] || '', dataType: ao.dataType })}
                  title="Geçmiş verileri görüntüle"
                >
                  <span className="font-mono text-xs font-semibold text-purple-600 w-12 shrink-0">{addr}</span>
                  <span className="text-xs text-gray-400 w-24 shrink-0">{typeLabel}</span>
                  {isAdmin ? (
                    <TagInput addr={addr} value={tagsRef.current[addr] ?? ''} onChange={setTag} />
                  ) : (
                    <span className="flex-1 text-xs text-gray-700">{tagsRef.current[addr] || '—'}</span>
                  )}
                  {currentVal != null && (
                    <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{currentVal}</span>
                  )}
                  <span className="text-gray-300 group-hover:text-blue-400 shrink-0 text-xs ml-auto">▶</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Data Register (D) — D{drStart}–D{drEnd} · {Math.max(0, drEnd - drStart + 1)} adet · {drTypeLabel}
          </p>
          {isAdmin && drEnd >= drStart && (
            <button onClick={() => clearTagsForGroup(Array.from({ length: drEnd - drStart + 1 }, (_, i) => `D${drStart + i}`))}
              className="text-xs text-red-400 hover:text-red-600">Tagları Temizle</button>
          )}
        </div>
        <div className="space-y-0.5 max-h-96 overflow-y-auto">
          {Array.from({ length: Math.min(drEnd - drStart + 1, 200) }, (_, i) => drStart + i).map((n) => {
            const addr = `D${n}`
            const currentVal = ioCurrentValues?.[addr]
            return (
              <div key={`${addr}-${renderKey}`}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors group"
                onClick={() => setSelectedPoint({ address: addr, tagName: tagsRef.current[addr] || '', dataType: cfg.dataRegister?.dataType ?? 'word' })}
                title="Geçmiş verileri görüntüle"
              >
                <span className="font-mono text-xs font-semibold text-gray-600 w-12 shrink-0">{addr}</span>
                {isAdmin ? (
                  <TagInput addr={addr} value={tagsRef.current[addr] ?? ''} onChange={setTag} />
                ) : (
                  <span className="flex-1 text-xs text-gray-700">{tagsRef.current[addr] || '—'}</span>
                )}
                {currentVal != null && (
                  <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{currentVal}</span>
                )}
                <span className="text-gray-300 group-hover:text-blue-400 shrink-0 text-xs ml-auto">▶</span>
              </div>
            )
          })}
          {drEnd - drStart + 1 > 200 && <p className="text-xs text-gray-400 text-center py-2">İlk 200 register gösteriliyor</p>}
        </div>
      </div>
    </div>
  )

  // Seçili I/O noktası varsa geçmiş panelini göster, yoksa normal PLC görünümü
  if (selectedPoint) {
    return (
      <IOPointHistoryPanel
        deviceId={deviceId}
        address={selectedPoint.address}
        tagName={selectedPoint.tagName}
        dataType={selectedPoint.dataType}
        isAdmin={isAdmin}
        onClose={() => setSelectedPoint(null)}
      />
    )
  }

  return plcContent
}

export default function DeviceHistoryPage({ menuItems }) {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const { companies, deviceHistory, clearHistory, deleteHistoryRange, updateDevice, ioHistory } = useCompanyStore()
  const isAdmin = role === 'admin'

  const device = useMemo(() => {
    for (const c of companies) {
      for (const l of c.locations) {
        const d = l.devices.find((d) => d.id === deviceId)
        if (d) return { ...d, locationName: l.name, companyName: c.displayName, companyId: c.id, locationId: l.id }
      }
    }
    return null
  }, [companies, deviceId])

  const history = deviceHistory[deviceId] ?? []
  const isPLC = device?.deviceType === 'plc'

  // PLC I/O noktalarının mevcut (en son) değerlerini hesapla
  const ioCurrentValues = useMemo(() => {
    if (!isPLC) return {}
    const values = {}
    for (const [key, records] of Object.entries(ioHistory)) {
      if (!key.startsWith(`${deviceId}:`)) continue
      const addr = key.split(':')[1]
      if (records.length > 0) {
        // En son kaydın değerini al
        const sorted = [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        values[addr] = sorted[0].value
      }
    }
    return values
  }, [isPLC, ioHistory, deviceId])

  const [pageSize, setPageSize] = useState(50)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteMode, setDeleteMode] = useState('all')
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [plcDirty, setPlcDirty] = useState(false)
  const [showPlcLeaveWarning, setShowPlcLeaveWarning] = useState(false)
  const [showJsonModal, setShowJsonModal] = useState(false)

  const filtered = useMemo(() => {
    let data = [...history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    if (filterFrom) data = data.filter((r) => new Date(r.timestamp) >= new Date(filterFrom))
    if (filterTo) data = data.filter((r) => new Date(r.timestamp) <= new Date(filterTo))
    return data
  }, [history, filterFrom, filterTo])

  const paginated = filtered.slice(0, pageSize)

  const handleDelete = (e) => {
    e.preventDefault()
    setPwError('')
    if (password !== ADMIN_PASSWORD) { setPwError('Şifre hatalı'); return }
    if (deleteMode === 'all') { clearHistory(deviceId) }
    else {
      if (!filterFrom && !filterTo) { setPwError('Tarih aralığı seçilmemiş'); return }
      deleteHistoryRange(deviceId, filterFrom || '0', filterTo || '9999')
    }
    setPassword('')
    setShowDeleteModal(false)
  }

  const handleGoBack = () => {
    if (isPLC && plcDirty && isAdmin) { setShowPlcLeaveWarning(true) }
    else { navigate(-1) }
  }

  // Stable callback refs — PlcView'in re-mount olmasını engeller
  const saveTagsRef = useRef()
  saveTagsRef.current = (tags) => updateDevice(device?.companyId, device?.locationId, device?.id, { ioTags: tags })
  const stableSaveTags = useCallback((tags) => saveTagsRef.current(tags), [])

  const dirtyRef = useRef()
  dirtyRef.current = setPlcDirty
  const stableDirtyChange = useCallback((v) => dirtyRef.current(v), [])

  if (!device) return (
    <AppLayout menuItems={menuItems}><p className="text-gray-500">Cihaz bulunamadı.</p></AppLayout>
  )

  return (
    <AppLayout menuItems={menuItems}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={handleGoBack} className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {isPLC ? <Cpu size={20} className="text-purple-500" /> : <BarChart2 size={20} className="text-blue-500" />}
              {device.tagName}
            </h1>
            <p className="text-gray-500 text-sm">
              {device.id} · {device.locationName} · {device.companyName}
              {device.subtype && <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">{device.subtype.toUpperCase().replace('_', '-')}</span>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowJsonModal(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
              title="Veri gönderim formatını görüntüle"
            >
              <HelpCircle size={18} />
            </button>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full
              ${device.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {device.status === 'online' ? 'Aktif' : 'Pasif'}
            </span>
          </div>
        </div>

        {!isPLC ? (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Filter size={15} /><span className="font-medium">Filtrele</span>
                </div>
                <DateTimeInput label="Başlangıç" value={filterFrom} onChange={setFilterFrom} />
                <DateTimeInput label="Bitiş" value={filterTo} onChange={setFilterTo} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Göster</label>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                    className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>İlk {n} kayıt</option>)}
                  </select>
                </div>
                <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
                  className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 mt-auto">Temizle</button>
                {isAdmin && (
                  <div className="ml-auto flex gap-2 mt-auto">
                    {(filterFrom || filterTo) && (
                      <button onClick={() => { setDeleteMode('range'); setPassword(''); setPwError(''); setShowDeleteModal(true) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-orange-200 text-orange-600 rounded-xl text-sm hover:bg-orange-50">
                        <Trash2 size={13} /> Seçili Aralığı Sil
                      </button>
                    )}
                    <button onClick={() => { setDeleteMode('all'); setPassword(''); setPwError(''); setShowDeleteModal(true) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50">
                      <Trash2 size={13} /> Tüm Geçmişi Sil
                    </button>
                  </div>
                )}
              </div>
            </div>
            <SensorView device={device} history={history} filtered={filtered} paginated={paginated} />
          </>
        ) : (
          <PlcViewInner
            key={device.id}
            deviceId={device.id}
            plcIoConfig={device.plcIoConfig}
            modbusConfig={device.modbusConfig}
            initialTags={device.ioTags}
            isAdmin={isAdmin}
            onSaveTags={stableSaveTags}
            onDirtyChange={stableDirtyChange}
            ioCurrentValues={ioCurrentValues}
          />
        )}

        {isPLC && plcDirty && isAdmin && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs text-amber-700 font-medium">Kaydedilmemiş değişiklikler var</span>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <Modal title={deleteMode === 'all' ? 'Tüm Geçmişi Sil' : 'Seçili Aralığı Sil'} onClose={() => setShowDeleteModal(false)}>
          <form onSubmit={handleDelete} className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                {deleteMode === 'all'
                  ? `"${device.tagName}" cihazına ait tüm geçmiş veriler silinecek.`
                  : 'Seçili aralıktaki veriler silinecek.'} Bu işlem geri alınamaz.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin şifrenizi girin</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="••••••••" autoFocus />
            </div>
            {pwError && <p className="text-red-500 text-sm">{pwError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Sil</button>
            </div>
          </form>
        </Modal>
      )}

      {showPlcLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-semibold text-gray-900">Tag isimlerinde değişiklik yapıldı</p>
            <p className="text-sm text-gray-500">Kaydedilmemiş değişiklikler kaybolacak. Çıkmak istediğinize emin misiniz?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowPlcLeaveWarning(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Kal</button>
              <button onClick={() => { setShowPlcLeaveWarning(false); navigate(-1) }}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Çık</button>
            </div>
          </div>
        </div>
      )}

      {showJsonModal && (
        <DeviceJsonInfoModal
          device={device}
          company={{ id: device.companyId, displayName: device.companyName }}
          location={{ id: device.locationId, name: device.locationName }}
          onClose={() => setShowJsonModal(false)}
        />
      )}
    </AppLayout>
  )
}
