import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

function makeRequest(method: string, path = '/api/health') {
  return new NextRequest(`http://localhost:3000${path}`, { method })
}

describe('CORS middleware', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 for an OPTIONS request', async () => {
      const res = middleware(makeRequest('OPTIONS'))
      expect(res.status).toBe(204)
    })

    it('sets Access-Control-Allow-Origin on OPTIONS', async () => {
      const res = middleware(makeRequest('OPTIONS'))
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    })

    it('sets Access-Control-Allow-Methods on OPTIONS', async () => {
      const res = middleware(makeRequest('OPTIONS'))
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
    })

    it('sets Access-Control-Allow-Headers on OPTIONS', async () => {
      const res = middleware(makeRequest('OPTIONS'))
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
    })
  })

  describe('non-preflight requests', () => {
    it('passes through GET requests (NextResponse.next)', async () => {
      const res = middleware(makeRequest('GET'))
      // NextResponse.next() sets x-middleware-next: 1 to signal pass-through
      expect(res.headers.get('x-middleware-next')).toBe('1')
    })

    it('sets Access-Control-Allow-Origin on GET', async () => {
      const res = middleware(makeRequest('GET'))
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    })

    it('sets Access-Control-Allow-Methods on GET', async () => {
      const res = middleware(makeRequest('GET'))
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
    })

    it('sets Access-Control-Allow-Headers on GET', async () => {
      const res = middleware(makeRequest('GET'))
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
    })

    it('sets Access-Control-Allow-Origin on POST', async () => {
      const res = middleware(makeRequest('POST'))
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    })
  })
})
