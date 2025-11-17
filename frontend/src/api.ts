const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'

// CSRF token management
let csrfToken: string = ''

const getCsrfToken = async (): Promise<string> => {
  if (csrfToken) return csrfToken

  const res = await fetch(`${API_URL}/csrf-token`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error('Failed to fetch CSRF token')
  }

  const data = await res.json()
  csrfToken = data.csrf_token || ''
  return csrfToken
}

const makeAuthenticatedRequest = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = await getCsrfToken()
  
  const headers = new Headers(options.headers)
  if (token) {
    headers.set('X-CSRF-Token', token)
  }
  
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })

  return res
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
