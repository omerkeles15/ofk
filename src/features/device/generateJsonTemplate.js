import { getDeltaXAddresses, getDeltaYAddresses } from './deviceCatalog'

/**
 * Cihaz yapılandırmasına göre dinamik JSON şablonu üretir.
 * Sensör ve PLC cihazları için farklı formatlar oluşturur.
 * Tüm değerler string formatındadır.
 *
 * @param {object} device - Cihaz nesnesi
 * @param {object} company - Firma nesnesi
 * @param {object} location - Lokasyon nesnesi
 * @returns {object} JSON şablon nesnesi
 */
export function generateDeviceJsonTemplate(device, company, location) {
  const base = {
    deviceId: String(device.id),
    companyId: String(company.id),
    locationId: String(location.id),
    timestamp: new Date().toISOString(),
    type: device.deviceType,
  }

  if (device.deviceType === 'sensor') {
    return {
      ...base,
      data: {
        value: String(device.value ?? 0),
        unit: device.unit ?? '',
        status: device.status ?? 'offline',
      },
    }
  }

  // PLC cihazları için I/O yapılandırmasına göre dinamik JSON üret
  const io = device.plcIoConfig ?? {}

  const xAddrs = getDeltaXAddresses(io.digitalInputs?.count ?? 0)
  const yAddrs = getDeltaYAddresses(io.digitalOutputs?.count ?? 0)

  const digitalInputs = {}
  xAddrs.forEach((addr) => {
    digitalInputs[addr] = '0'
  })

  const digitalOutputs = {}
  yAddrs.forEach((addr) => {
    digitalOutputs[addr] = '0'
  })

  const analogInputs = {}
  ;(io.analogInputs ?? []).forEach((ai) => {
    analogInputs[`AI${ai.channel}`] = { value: '0', dataType: ai.dataType }
  })

  const analogOutputs = {}
  ;(io.analogOutputs ?? []).forEach((ao) => {
    analogOutputs[`AO${ao.channel}`] = { value: '0', dataType: ao.dataType }
  })

  const dataRegisters = {}
  const dr = io.dataRegister ?? { start: 0, end: 0, dataType: 'word' }
  for (let i = dr.start; i <= dr.end; i++) {
    dataRegisters[`D${i}`] = { value: '0', dataType: dr.dataType }
  }

  return {
    ...base,
    model: device.subtype ?? '',
    modbus: device.modbusConfig ?? null,
    data: {
      digitalInputs,
      digitalOutputs,
      analogInputs,
      analogOutputs,
      dataRegisters,
    },
  }
}
