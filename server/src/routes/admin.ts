import { errorResponse, jsonResponse } from '../http.js'
import { getBillingStore } from '../billing/store.js'
import { getGenerationJobStore } from '../generationJobs/store.js'
import { readRequiredSession } from '../auth/session.js'

export async function handleAdminRequest(request: Request): Promise<Response> {
  try {
    await readRequiredSession(request)

    const [billing, jobs] = await Promise.all([
      getBillingStore().getAdminStats(),
      getGenerationJobStore().getAdminStats(),
    ])

    return jsonResponse({
      billing,
      jobs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(message, message === 'Unauthorized' ? 401 : 400, message === 'Unauthorized' ? 'unauthorized' : 'bad_request')
  }
}
