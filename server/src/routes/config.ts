import { readPlatformConfig } from '../admin/configStore.js'
import { jsonResponse } from '../http.js'

export async function handlePublicConfigRequest(): Promise<Response> {
  const config = await readPlatformConfig()
  return jsonResponse({
    config: {
      siteName: config.siteName,
      supportEmail: config.supportEmail,
      epayEnabled: config.epayEnabled,
      epayPaymentTypes: config.epayPaymentTypes,
      balanceUnitCents: config.balanceUnitCents,
    },
  })
}
