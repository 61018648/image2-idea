import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { createDefaultPlatformProfile, DEFAULT_SETTINGS } from './apiProfiles'
import { callPlatformImageApi } from './platformImageApi'

describe('callPlatformImageApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts to the same-origin platform endpoint when baseUrl is empty', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      images: ['aW1hZ2U='],
      actualParams: { size: '1024x1024' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultPlatformProfile({ baseUrl: '', apiKey: 'browser-key' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/platform/images/generations', expect.objectContaining({ method: 'POST' }))
    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(result.actualParams).toEqual({ size: '1024x1024' })
  })

  it('accepts a base URL that already points at /api/platform', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      images: ['aW1hZ2U='],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultPlatformProfile({ baseUrl: 'https://platform.example.com/api/platform' }))

    expect(fetchMock).toHaveBeenCalledWith('https://platform.example.com/api/platform/images/generations', expect.objectContaining({ method: 'POST' }))
  })

  it('does not send the browser profile API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      images: ['data:image/png;base64,aW1hZ2U='],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultPlatformProfile({ baseUrl: 'https://platform.example.com', apiKey: 'secret-browser-key' }))

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.stringify(init)).not.toContain('secret-browser-key')
    expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' })
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('sends prompt params and input images in the request body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      images: ['aW1hZ2U='],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS, size: '1024x1024', n: 2 },
      inputImageDataUrls: ['data:image/png;base64,input'],
      maskDataUrl: 'data:image/png;base64,mask',
    }, createDefaultPlatformProfile())

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS, size: '1024x1024', n: 2 },
      inputImageDataUrls: ['data:image/png;base64,input'],
      maskDataUrl: 'data:image/png;base64,mask',
    })
  })

  it('throws platform HTTP errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: '余额不足' },
    }), { status: 402, headers: { 'Content-Type': 'application/json' } }))

    await expect(callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultPlatformProfile())).rejects.toThrow('余额不足')
  })
})
