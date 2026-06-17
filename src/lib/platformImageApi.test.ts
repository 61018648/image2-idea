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
      job: {
        id: 'job-1',
        status: 'succeeded',
        costCredits: 1,
        images: ['aW1hZ2U='],
        actualParams: { size: '1024x1024' },
        createdAt: '2026-06-17T00:00:00.000Z',
      },
      creditsQuoted: 1,
      creditsCharged: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const result = await callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultPlatformProfile({ baseUrl: '', apiKey: 'browser-key' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/platform/generations', expect.objectContaining({ method: 'POST' }))
    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(result.actualParams).toEqual({ size: '1024x1024' })
  })

  it('accepts a base URL that already points at /api/platform', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: 'job-1',
        status: 'succeeded',
        costCredits: 1,
        images: ['aW1hZ2U='],
        createdAt: '2026-06-17T00:00:00.000Z',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultPlatformProfile({ baseUrl: 'https://platform.example.com/api/platform' }))

    expect(fetchMock).toHaveBeenCalledWith('https://platform.example.com/api/platform/generations', expect.objectContaining({ method: 'POST' }))
  })

  it('does not send the browser profile API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: 'job-1',
        status: 'succeeded',
        costCredits: 1,
        images: ['data:image/png;base64,aW1hZ2U='],
        createdAt: '2026-06-17T00:00:00.000Z',
      },
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
      job: {
        id: 'job-1',
        status: 'succeeded',
        costCredits: 2,
        images: ['aW1hZ2U='],
        createdAt: '2026-06-17T00:00:00.000Z',
      },
      creditsQuoted: 2,
      creditsCharged: 2,
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

  it('downloads platform asset URLs returned by completed jobs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        job: {
          id: 'job-asset',
          status: 'succeeded',
          costCredits: 1,
          images: ['/api/platform/assets/asset_test.png'],
          rawImageUrls: ['/api/platform/assets/asset_test.png'],
          createdAt: '2026-06-17T00:00:00.000Z',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(new Blob(['image-bytes'], { type: 'image/png' }), { status: 200, headers: { 'Content-Type': 'image/png' } }))

    const result = await callPlatformImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultPlatformProfile({ baseUrl: 'https://platform.example.com/api/platform' }))

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://platform.example.com/api/platform/assets/asset_test.png', expect.objectContaining({ cache: 'no-store' }))
    expect(result.images[0]).toMatch(/^data:image\/png;base64,/)
    expect(result.rawImageUrls).toEqual(['https://platform.example.com/api/platform/assets/asset_test.png'])
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
