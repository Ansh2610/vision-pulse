const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'

// CSRF token management
let csrfToken: string = ''

const getCsrfToken = async (): Promise<string> => {
  if (csrfToken) return csrfToken

  // Add timeout for CSRF token fetch (cold start tolerance)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90000)
  
  try {
    const res = await fetch(`${API_URL}/csrf-token`, {
      credentials: 'include',
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)

    if (!res.ok) {
      throw new Error('Failed to fetch CSRF token')
    }

    const data = await res.json()
    csrfToken = data.csrf_token || ''
    return csrfToken
  } catch (err: any) {
    clearTimeout(timeoutId)
    
    // If cold start timeout, provide helpful error
    if (err.name === 'AbortError') {
      throw new Error('Backend is starting up, please wait and try again...')
    }
    throw err
  }
}

const makeAuthenticatedRequest = async (
  url: string,
  options: RequestInit = {},
  retries = 2
): Promise<Response> => {
  const token = await getCsrfToken()
  
  const headers = new Headers(options.headers)
  if (token) {
    headers.set('X-CSRF-Token', token)
  }
  
  // Create abort controller with 90s timeout (handles Fly.io cold starts)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90000)
  
  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    return res
  } catch (err: any) {
    clearTimeout(timeoutId)
    
    // Retry on network errors or timeouts (backend might be cold-starting)
    if (retries > 0 && (err.name === 'AbortError' || err.message?.includes('fetch'))) {
      console.warn(`[API] Request failed, retrying... (${retries} attempts left)`)
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2s before retry
      return makeAuthenticatedRequest(url, options, retries - 1)
    }
    
    throw err
  }
}

export const api = {
  upload: async (file: File, sessionId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    
    // Add session_id to URL if provided
    const url = sessionId 
      ? `${API_URL}/api/upload?session_id=${sessionId}`
      : `${API_URL}/api/upload`

    const res = await makeAuthenticatedRequest(url, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Upload failed')
    }

    return res.json()
  },

  infer: async (sessionId: string, imageId?: string, imageData?: string) => {
    const url = imageId
      ? `${API_URL}/api/infer/${sessionId}?image_id=${imageId}`
      : `${API_URL}/api/infer/${sessionId}`
    
    const res = await makeAuthenticatedRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: imageData ? JSON.stringify({ image_data: imageData }) : undefined,
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Inference failed')
    }

    return res.json()
  },

  export: async (sessionId: string, boxes: any[], width: number, height: number) => {
    const res = await makeAuthenticatedRequest(`${API_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        boxes,
        image_width: width,
        image_height: height,
      }),
    })

    if (!res.ok) {
      throw new Error('Export failed')
    }

    return res.blob()
  },

  validate: async (sessionId: string, validations: Array<{ box_id: string; is_correct: boolean }>) => {
    const res = await makeAuthenticatedRequest(`${API_URL}/api/validate/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validations }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Validation failed')
    }

    return res.json()
  },

  addManualBox: async (sessionId: string, imageId: string, box: any) => {
    const res = await makeAuthenticatedRequest(`${API_URL}/api/add-manual-box/${sessionId}/${imageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(box),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Failed to add manual box')
    }

    return res.json()
  },

  deleteBox: async (sessionId: string, imageId: string, boxId: string) => {
    const res = await makeAuthenticatedRequest(`${API_URL}/api/delete-box/${sessionId}/${imageId}/${boxId}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Failed to delete box')
    }

    return res.json()
  },

  connectMetrics: (sessionId: string) => {
    return new WebSocket(`${WS_URL}/ws/metrics/${sessionId}`)
  },
}
