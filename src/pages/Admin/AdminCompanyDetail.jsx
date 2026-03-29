import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Pencil, Eye, Network } from 'lucide-react'
import AppLayout from '../../components/Layout/AppLayout'
import Modal from '../../components/Modal'
import Table from '../../components/Table'
import FormField from '../../components/FormField'
import { useFormValidation } from '../../hooks/useFormValidation'
import { useCompanyStore } from '../../features/company/companyStore'
import { DEVICE_TYPE_OPTIONS, getSubtypes, getUnit, DEFAULT_MODBUS_CONFIG, MODBUS_OPTIONS, DEFAULT_PLC_IO_CONFIG, DATA_TYPES } from '../../features/device/deviceCatalog'
import { adminMenu } from './adminMenu'

// Toggle Switch bileşeni
function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
        ${checked ? 'bg-green-500' : 'bg-gray-300'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
          ${checked ? 'translate-x-4' : 'translate-x-1'}`}
      />
    </button>
  )
}

export default function AdminCompanyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { companies, addLocation, updateLocation, deleteLocation, addDevice, updateDevice, deleteDevice, toggleDeviceStatus, peekNextDeviceId } = useCompanyStore()
  const company = companies.find((c) => c.id === Number(id))

  const [showLocModal, setShowLocModal] = useState(false)
  const [editLocTarget, setEditLocTarget] = useState(null)
  const [showDevModal, setShowDevModal] = useState(false)
  const [editDevTarget, setEditDevTarget] = useState(null)
  const [modbusViewDevice, setModbusViewDevice] = useState(null) // Modbus popup
  const [selectedLocId, setSelectedLocId] = useState(null)
  const [locForm, setLocForm] = useState({ name: '' })
  const [devForm, setDevForm] = useState({ tagName: '', deviceType: '', subtype: '', unit: '', modbusConfig: null, plcIoConfig: null })
  const [devError, setDevError] = useState('')

  const locValidationRules = useMemo(() => ({
    name: (v) => (!v || !v.trim()) ? 'Lokasyon adı boş bırakılamaz' : null,
  }), [])
  const { errors: locErrors, validate: validateLoc, clearErrors: clearLocErrors } = useFormValidation(locValidationRules)

  if (!company) return (
    <AppLayout menuItems={adminMenu}>
      <p className="text-gray-500">Firma bulunamadı.</p>
    </AppLayout>
  )

  const handleAddLocation = (e) => {
    e.preventDefault()
    if (!validateLoc(locForm)) return
    addLocation(company.id, { name: locForm.name })
    setLocForm({ name: '' })
    setShowLocModal(false)
  }

  const handleEditLocation = (e) => {
    e.preventDefault()
    if (!validateLoc(locForm)) return
    updateLocation(company.id, editLocTarget.id, { name: locForm.name })
    setEditLocTarget(null)
  }

  const handleAddDevice = (e) => {
    e.preventDefault()
    setDevError('')
    try {
      addDevice(company.id, selectedLocId, devForm)
      setDevForm({ tagName: '', deviceType: '', subtype: '', unit: '', modbusConfig: null, plcIoConfig: null })
      setShowDevModal(false)
    } catch (err) {
      setDevError(err.message)
    }
  }

  const handleEditDevice = (e) => {
    e.preventDefault()
    setDevError('')
    try {
      const allDeviceIds = companies
        .flatMap((c) => c.locations)
        .flatMap((l) => l.devices)
        .map((d) => d.id)
        .filter((did) => did !== editDevTarget.device.id)
      if (allDeviceIds.includes(devForm.id)) {
        throw new Error(`Device ID "${devForm.id}" zaten kullanımda`)
      }
      updateDevice(company.id, editDevTarget.locId, editDevTarget.device.id, devForm)
      setEditDevTarget(null)
      setDevForm({ tagName: '', deviceType: '', subtype: '', unit: '', modbusConfig: null, plcIoConfig: null })
    } catch (err) {
      setDevError(err.message)
    }
  }

  const deviceColumns = [
    { key: 'id', label: 'Device ID' },
    { key: 'tagName', label: 'Tag Name' },
    { key: 'unit', label: 'Birim' },
    {
      key: 'status',
      label: 'Durum',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={r.status === 'online'}
            onChange={() => toggleDeviceStatus(company.id, r._locId, r.id)}
          />
          <span className={`text-xs font-medium ${r.status === 'online' ? 'text-green-600' : 'text-gray-400'}`}>
            {r.status === 'online' ? 'Aktif' : 'Pasif'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/admin/device/${r.id}`)}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"
            title="Görüntüle"
          >
            <Eye size={14} />
          </button>
          {/* Modbus ikonu — sadece PLC cihazlarda */}
          {r.deviceType === 'plc' && r.modbusConfig && (
            <button
              onClick={() => setModbusViewDevice(r)}
              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500"
              title="Modbus Yapılandırma"
            >
              <Network size={14} />
            </button>
          )}
          <button
            onClick={() => {
              setDevForm({ tagName: r.tagName, deviceType: r.deviceType ?? '', subtype: r.subtype ?? '', unit: r.unit ?? '', modbusConfig: r.modbusConfig ?? null, plcIoConfig: r.plcIoConfig ? JSON.parse(JSON.stringify(r.plcIoConfig)) : null })
              setDevError('')
              setEditDevTarget({ device: r, locId: r._locId })
            }}
            className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500"
            title="Düzenle"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => deleteDevice(company.id, r._locId, r.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
            title="Sil"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AppLayout menuItems={adminMenu}>
      <div className="space-y-6">
        {/* Başlık */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/companies')}
            className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold">{company.displayName}</h1>
            <p className="text-gray-500 text-sm">{company.fullName}</p>
          </div>
        </div>

        {/* Lokasyon başlığı */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Lokasyonlar ({company.locations.length})</h2>
          <button
            onClick={() => { setLocForm({ name: '' }); clearLocErrors(); setShowLocModal(true) }}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm"
          >
            <Plus size={14} /> Lokasyon Ekle
          </button>
        </div>

        {/* Lokasyon kartları */}
        {company.locations.map((loc) => {
          const devData = loc.devices.map((d) => ({ ...d, _locId: loc.id }))
          return (
            <div key={loc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{loc.name}</h3>
                <div className="flex items-center gap-2">
                  {/* Lokasyon düzenle */}
                  <button
                    onClick={() => { setLocForm({ name: loc.name }); clearLocErrors(); setEditLocTarget(loc) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-sm hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-colors"
                  >
                    <Pencil size={13} /> Düzenle
                  </button>
                  {/* Cihaz ekle */}
                  <button
                    onClick={() => { setSelectedLocId(loc.id); setDevForm({ id: '', tagName: '', unit: '' }); setShowDevModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    <Plus size={13} /> Cihaz Ekle
                  </button>
                  {/* Lokasyon sil */}
                  <button
                    onClick={() => deleteLocation(company.id, loc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-xl text-sm hover:bg-red-50 text-red-500 transition-colors"
                    title="Lokasyonu Sil"
                  >
                    <Trash2 size={13} /> Sil
                  </button>
                </div>
              </div>
              <Table columns={deviceColumns} data={devData} emptyText="Bu lokasyonda cihaz yok" />
            </div>
          )
        })}
      </div>

      {/* Modbus Görüntüleme Modalı */}
      {modbusViewDevice && (
        <Modal
          title={`Modbus Yapılandırma — ${modbusViewDevice.tagName}`}
          onClose={() => setModbusViewDevice(null)}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
              <span className="text-xs text-gray-500 font-medium">Cihaz:</span>
              <span className="font-mono text-sm font-bold text-gray-700">{modbusViewDevice.id}</span>
              <span className="text-xs text-gray-400 ml-1">· {modbusViewDevice.subtype?.toUpperCase().replace('_', '-')}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Slave ID',   value: modbusViewDevice.modbusConfig.slaveId },
                { label: 'Baud Rate',  value: modbusViewDevice.modbusConfig.baudRate },
                { label: 'Data Biti',  value: modbusViewDevice.modbusConfig.dataBits },
                { label: 'Stop Biti',  value: modbusViewDevice.modbusConfig.stopBits },
                { label: 'Parity',     value: modbusViewDevice.modbusConfig.parity?.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="font-semibold text-gray-800">{value}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setModbusViewDevice(null)}
              className="w-full py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 mt-2"
            >
              Kapat
            </button>
          </div>
        </Modal>
      )}

      {/* Lokasyon Ekle Modal */}
      {showLocModal && (
        <Modal title="Lokasyon Ekle" onClose={() => setShowLocModal(false)}>
          <form onSubmit={handleAddLocation} className="space-y-4">
            <FormField label="Lokasyon Adı" error={locErrors.name} required>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="İzmir Tire Tesisi"
                value={locForm.name}
                onChange={(e) => setLocForm({ name: e.target.value })}
              />
            </FormField>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowLocModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Ekle</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Lokasyon Düzenle Modal */}
      {editLocTarget && (
        <Modal title={`Lokasyon Düzenle — ${editLocTarget.name}`} onClose={() => setEditLocTarget(null)}>
          <form onSubmit={handleEditLocation} className="space-y-4">
            <FormField label="Lokasyon Adı" error={locErrors.name} required>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={locForm.name}
                onChange={(e) => setLocForm({ name: e.target.value })}
              />
            </FormField>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditLocTarget(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Kaydet</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cihaz Düzenle Modal */}
      {editDevTarget && (
        <Modal title={`Cihaz Düzenle — ${editDevTarget.device.tagName}`} onClose={() => { setEditDevTarget(null); setDevError('') }}>
          <form onSubmit={handleEditDevice} className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
              <span className="text-xs text-gray-500 font-medium">Device ID:</span>
              <span className="font-mono text-sm font-bold text-gray-700">{editDevTarget.device.id}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.tagName}
                onChange={(e) => setDevForm({ ...devForm, tagName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cihaz Tipi</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.deviceType}
                onChange={(e) => setDevForm({ ...devForm, deviceType: e.target.value, subtype: '', unit: '', modbusConfig: null, plcIoConfig: null })}
              >
                <option value="">Seçiniz</option>
                {DEVICE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {devForm.deviceType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {devForm.deviceType === 'plc' ? 'Model / Seri' : 'Sensör Tipi'}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={devForm.subtype}
                  onChange={(e) => {
                    const unit = getUnit(devForm.deviceType, e.target.value)
                    const modbusConfig = devForm.deviceType === 'plc'
                      ? (devForm.modbusConfig ?? { ...DEFAULT_MODBUS_CONFIG })
                      : null
                    const plcIoConfig = devForm.deviceType === 'plc'
                      ? (devForm.plcIoConfig ?? JSON.parse(JSON.stringify(DEFAULT_PLC_IO_CONFIG)))
                      : null
                    setDevForm({ ...devForm, subtype: e.target.value, unit, modbusConfig, plcIoConfig })
                  }}
                >
                  <option value="">Seçiniz</option>
                  {getSubtypes(devForm.deviceType).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
            {devForm.unit && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl">
                <span className="text-xs text-green-600 font-medium">Birim:</span>
                <span className="font-mono text-sm font-bold text-green-700">{devForm.unit}</span>
              </div>
            )}
            {devForm.deviceType === 'plc' && devForm.subtype && devForm.modbusConfig && (
              <div className="border border-blue-100 rounded-xl p-4 space-y-3 bg-blue-50/40">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Modbus Yapılandırma</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Slave ID</label>
                    <input type="number" min={1} max={247}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.slaveId}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, slaveId: Number(e.target.value) } })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Baud Rate</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.baudRate}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, baudRate: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.baudRate.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.dataBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, dataBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.dataBits.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stop Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.stopBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, stopBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.stopBits.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Parity</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.parity}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, parity: e.target.value } })}>
                      {MODBUS_OPTIONS.parity.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
            {/* PLC I/O Yapılandırma — düzenle */}
            {devForm.deviceType === 'plc' && devForm.subtype && devForm.plcIoConfig && (
              <div className="border border-purple-100 rounded-xl p-4 space-y-4 bg-purple-50/30">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">I/O Yapılandırma</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dijital Giriş (X) Sayısı</label>
                    <select
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                      value={devForm.plcIoConfig.digitalInputs.count}
                      onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, digitalInputs: { count: Number(e.target.value) } } })}>
                      {[0, 8, 16, 24, 32, 40, 48, 64].map((n) => (
                        <option key={n} value={n}>{n === 0 ? 'Yok' : `${n} adet`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dijital Çıkış (Y) Sayısı</label>
                    <select
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                      value={devForm.plcIoConfig.digitalOutputs.count}
                      onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, digitalOutputs: { count: Number(e.target.value) } } })}>
                      {[0, 6, 14, 22, 30, 38, 46, 54].map((n) => (
                        <option key={n} value={n}>{n === 0 ? 'Yok' : `${n} adet`}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Analog Girişler */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">Analog Girişler (AI)</label>
                    <button type="button"
                      onClick={() => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogInputs: [...devForm.plcIoConfig.analogInputs, { channel: devForm.plcIoConfig.analogInputs.length, dataType: 'word' }] } })}
                      className="text-xs text-purple-600 hover:text-purple-800">+ Kanal Ekle</button>
                  </div>
                  {devForm.plcIoConfig.analogInputs.map((ai, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-gray-500 w-16 shrink-0">AI{ai.channel}</span>
                      <select className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={ai.dataType}
                        onChange={(e) => {
                          const updated = devForm.plcIoConfig.analogInputs.map((a, i) => i === idx ? { ...a, dataType: e.target.value } : a)
                          setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogInputs: updated } })
                        }}>
                        {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button type="button" onClick={() => {
                        const updated = devForm.plcIoConfig.analogInputs.filter((_, i) => i !== idx)
                        setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogInputs: updated } })
                      }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>

                {/* Analog Çıkışlar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">Analog Çıkışlar (AO)</label>
                    <button type="button"
                      onClick={() => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogOutputs: [...devForm.plcIoConfig.analogOutputs, { channel: devForm.plcIoConfig.analogOutputs.length, dataType: 'word' }] } })}
                      className="text-xs text-purple-600 hover:text-purple-800">+ Kanal Ekle</button>
                  </div>
                  {devForm.plcIoConfig.analogOutputs.map((ao, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-gray-500 w-16 shrink-0">AO{ao.channel}</span>
                      <select className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={ao.dataType}
                        onChange={(e) => {
                          const updated = devForm.plcIoConfig.analogOutputs.map((a, i) => i === idx ? { ...a, dataType: e.target.value } : a)
                          setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogOutputs: updated } })
                        }}>
                        {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button type="button" onClick={() => {
                        const updated = devForm.plcIoConfig.analogOutputs.filter((_, i) => i !== idx)
                        setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogOutputs: updated } })
                      }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>

                {/* Data Register */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Data Register (D) Aralığı</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Başlangıç</label>
                      <input type="number" min={0}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={devForm.plcIoConfig.dataRegister.start}
                        onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, dataRegister: { ...devForm.plcIoConfig.dataRegister, start: Number(e.target.value) } } })} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Bitiş</label>
                      <input type="number" min={0}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={devForm.plcIoConfig.dataRegister.end}
                        onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, dataRegister: { ...devForm.plcIoConfig.dataRegister, end: Number(e.target.value) } } })} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Veri Tipi</label>
                      <select className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={devForm.plcIoConfig.dataRegister.dataType}
                        onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, dataRegister: { ...devForm.plcIoConfig.dataRegister, dataType: e.target.value } } })}>
                        {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {devError && <p className="text-red-500 text-sm">{devError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setEditDevTarget(null); setDevError('') }}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Kaydet</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cihaz Ekle Modal */}
      {showDevModal && (
        <Modal title="Cihaz Ekle" onClose={() => { setShowDevModal(false); setDevError('') }}>
          <form onSubmit={handleAddDevice} className="space-y-4">
            {/* Otomatik ID önizleme */}
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl">
              <span className="text-xs text-blue-500 font-medium">Otomatik ID:</span>
              <span className="font-mono text-sm font-bold text-blue-700">{peekNextDeviceId()}</span>
            </div>

            {/* Tag Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name</label>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Örn: Kazan Sıcaklık Sensörü"
                value={devForm.tagName}
                onChange={(e) => setDevForm({ ...devForm, tagName: e.target.value })}
                required
              />
            </div>

            {/* Cihaz Tipi */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cihaz Tipi</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={devForm.deviceType}
                onChange={(e) => setDevForm({ ...devForm, deviceType: e.target.value, subtype: '', unit: '' })}
                required
              >
                <option value="">Seçiniz</option>
                {DEVICE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Alt Tip — cihaz tipi seçilince görünür */}
            {devForm.deviceType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {devForm.deviceType === 'plc' ? 'Model / Seri' : 'Sensör Tipi'}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={devForm.subtype}
                  onChange={(e) => {
                    const unit = getUnit(devForm.deviceType, e.target.value)
                    const modbusConfig = devForm.deviceType === 'plc' ? { ...DEFAULT_MODBUS_CONFIG } : null
                    setDevForm({ ...devForm, subtype: e.target.value, unit, modbusConfig })
                  }}
                  required
                >
                  <option value="">Seçiniz</option>
                  {getSubtypes(devForm.deviceType).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Birim — otomatik atanır */}
            {devForm.unit && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl">
                <span className="text-xs text-green-600 font-medium">Otomatik Birim:</span>
                <span className="font-mono text-sm font-bold text-green-700">{devForm.unit}</span>
              </div>
            )}

            {/* Modbus Yapılandırma — sadece PLC seçilince */}
            {devForm.deviceType === 'plc' && devForm.subtype && devForm.modbusConfig && (
              <div className="border border-blue-100 rounded-xl p-4 space-y-3 bg-blue-50/40">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Modbus Yapılandırma</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Slave ID</label>
                    <input type="number" min={1} max={247}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.slaveId}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, slaveId: Number(e.target.value) } })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Baud Rate</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.baudRate}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, baudRate: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.baudRate.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.dataBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, dataBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.dataBits.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stop Biti</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.stopBits}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, stopBits: Number(e.target.value) } })}>
                      {MODBUS_OPTIONS.stopBits.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Parity</label>
                    <select className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={devForm.modbusConfig.parity}
                      onChange={(e) => setDevForm({ ...devForm, modbusConfig: { ...devForm.modbusConfig, parity: e.target.value } })}>
                      {MODBUS_OPTIONS.parity.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* PLC I/O Yapılandırma */}
            {devForm.deviceType === 'plc' && devForm.subtype && devForm.plcIoConfig && (
              <div className="border border-purple-100 rounded-xl p-4 space-y-4 bg-purple-50/30">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">I/O Yapılandırma</p>

                {/* Dijital Giriş / Çıkış sayısı */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Dijital Giriş (X) Sayısı
                    </label>
                    <select
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                      value={devForm.plcIoConfig.digitalInputs.count}
                      onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, digitalInputs: { count: Number(e.target.value) } } })}
                    >
                      {[0, 8, 16, 24, 32, 40, 48, 64].map((n) => (
                        <option key={n} value={n}>{n === 0 ? 'Yok' : `${n} adet (X0–X${n - 1} grubu)`}</option>
                      ))}
                    </select>
                    {devForm.plcIoConfig.digitalInputs.count > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {(() => {
                          const addrs = []
                          const count = devForm.plcIoConfig.digitalInputs.count
                          for (let i = 0; i < 8 && addrs.length < count; i++) addrs.push(`X${i}`)
                          for (let g = 2; addrs.length < count; g++) {
                            const base = g * 10
                            for (let i = 0; i < 8 && addrs.length < count; i++) addrs.push(`X${base + i}`)
                          }
                          const first = addrs[0]
                          const last = addrs[addrs.length - 1]
                          return `${first} → ${last}`
                        })()}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Dijital Çıkış (Y) Sayısı
                    </label>
                    <select
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                      value={devForm.plcIoConfig.digitalOutputs.count}
                      onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, digitalOutputs: { count: Number(e.target.value) } } })}
                    >
                      {[0, 6, 14, 22, 30, 38, 46, 54].map((n) => (
                        <option key={n} value={n}>{n === 0 ? 'Yok' : `${n} adet`}</option>
                      ))}
                    </select>
                    {devForm.plcIoConfig.digitalOutputs.count > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {(() => {
                          const addrs = []
                          const count = devForm.plcIoConfig.digitalOutputs.count
                          for (let i = 0; i < 6 && addrs.length < count; i++) addrs.push(`Y${i}`)
                          for (let g = 2; addrs.length < count; g++) {
                            const base = g * 10
                            for (let i = 0; i < 8 && addrs.length < count; i++) addrs.push(`Y${base + i}`)
                          }
                          const first = addrs[0]
                          const last = addrs[addrs.length - 1]
                          return `${first} → ${last}`
                        })()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Analog Girişler */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">Analog Girişler (AI)</label>
                    <button type="button"
                      onClick={() => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogInputs: [...devForm.plcIoConfig.analogInputs, { channel: devForm.plcIoConfig.analogInputs.length, dataType: 'word' }] } })}
                      className="text-xs text-purple-600 hover:text-purple-800">+ Kanal Ekle</button>
                  </div>
                  {devForm.plcIoConfig.analogInputs.map((ai, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-gray-500 w-16 shrink-0">AI{ai.channel}</span>
                      <select className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={ai.dataType}
                        onChange={(e) => {
                          const updated = devForm.plcIoConfig.analogInputs.map((a, i) => i === idx ? { ...a, dataType: e.target.value } : a)
                          setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogInputs: updated } })
                        }}>
                        {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button type="button" onClick={() => {
                        const updated = devForm.plcIoConfig.analogInputs.filter((_, i) => i !== idx)
                        setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogInputs: updated } })
                      }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>

                {/* Analog Çıkışlar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">Analog Çıkışlar (AO)</label>
                    <button type="button"
                      onClick={() => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogOutputs: [...devForm.plcIoConfig.analogOutputs, { channel: devForm.plcIoConfig.analogOutputs.length, dataType: 'word' }] } })}
                      className="text-xs text-purple-600 hover:text-purple-800">+ Kanal Ekle</button>
                  </div>
                  {devForm.plcIoConfig.analogOutputs.map((ao, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-gray-500 w-16 shrink-0">AO{ao.channel}</span>
                      <select className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={ao.dataType}
                        onChange={(e) => {
                          const updated = devForm.plcIoConfig.analogOutputs.map((a, i) => i === idx ? { ...a, dataType: e.target.value } : a)
                          setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogOutputs: updated } })
                        }}>
                        {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button type="button" onClick={() => {
                        const updated = devForm.plcIoConfig.analogOutputs.filter((_, i) => i !== idx)
                        setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, analogOutputs: updated } })
                      }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>

                {/* Data Register aralığı */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Data Register (D) Aralığı</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Başlangıç</label>
                      <input type="number" min={0}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={devForm.plcIoConfig.dataRegister.start}
                        onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, dataRegister: { ...devForm.plcIoConfig.dataRegister, start: Number(e.target.value) } } })} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Bitiş</label>
                      <input type="number" min={0}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={devForm.plcIoConfig.dataRegister.end}
                        onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, dataRegister: { ...devForm.plcIoConfig.dataRegister, end: Number(e.target.value) } } })} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Veri Tipi</label>
                      <select className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={devForm.plcIoConfig.dataRegister.dataType}
                        onChange={(e) => setDevForm({ ...devForm, plcIoConfig: { ...devForm.plcIoConfig, dataRegister: { ...devForm.plcIoConfig.dataRegister, dataType: e.target.value } } })}>
                        {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {devError && <p className="text-red-500 text-sm">{devError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowDevModal(false); setDevError('') }}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">İptal</button>
              <button type="submit"
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium">Ekle</button>
            </div>
          </form>
        </Modal>
      )}
    </AppLayout>
  )
}
