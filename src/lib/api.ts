import { createDefaultPlatformProfile, getActiveApiProfile, getCustomProviderDefinition } from './apiProfiles'
import { callFalAiImageApi } from './falAiImageApi'
import { callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import { callPlatformImageApi } from './platformImageApi'
import type { CallApiOptions, CallApiResult } from './imageApiShared'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  const platformProfile = profile.provider === 'platform'
    ? profile
    : opts.settings.profiles.find((item) => item.provider === 'platform') ?? createDefaultPlatformProfile()
  return callPlatformImageApi(opts, platformProfile)

  if (profile.provider === 'platform') return callPlatformImageApi(opts, profile)
  if (profile.provider === 'fal') return callFalAiImageApi(opts, profile)

  return callOpenAICompatibleImageApi(opts, profile, getCustomProviderDefinition(opts.settings, profile.provider))
}
