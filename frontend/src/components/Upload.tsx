import { useState } from 'react'
import { api } from '../api.ts'
import { Box, Metrics } from '../types.ts'
import { Info } from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'

interface Props {
  onComplete: (results: Array<{
    sessionId: string
    imageSrc: string
    boxes: Box[]
    metrics: Metrics
    imageId: string
    filename?: string
  }>) => void
  existingSessionId?: string | null
  compact?: boolean
}

export default function Upload({ onComplete, existingSessionId, compact = false }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [loadingSubmessage, setLoadingSubmessage] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files).slice(0, 10) // Limit to 10 files
      setFiles(selectedFiles)
      setFile(selectedFiles[0]) // For backward compatibility
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file && files.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const filesToProcess = files.length > 0 ? files : [file!]
      setUploadProgress({ current: 0, total: filesToProcess.length })

      // Store all results before calling onComplete
      const results: Array<{
        sessionId: string
        imageSrc: string
        boxes: Box[]
        metrics: Metrics
        imageId: string
        filename: string
      }> = []

      // Use existing session or create new one with first upload
      let sessionId = existingSessionId
      
      // Process ALL images first
      for (let i = 0; i < filesToProcess.length; i++) {
        const currentFile = filesToProcess[i]
        
        // Update progress
        setUploadProgress({ current: i + 1, total: filesToProcess.length })

        // Step 1: Upload
        setLoadingMessage(`Uploading image ${i + 1} of ${filesToProcess.length}...`)
        setLoadingSubmessage(`${currentFile.name} (${(currentFile.size / 1024).toFixed(1)} KB)`)
        
        let uploadRes
        if (i === 0 && !sessionId) {
          uploadRes = await api.upload(currentFile)
          sessionId = uploadRes.session_id
        } else {
          uploadRes = await api.upload(currentFile, sessionId!)
        }
        
        const imageId = uploadRes.image_id
        const imageBase64 = uploadRes.image_data  // Get base64 data from upload response

        // Step 2: Run AI detection on the SPECIFIC image using base64 data
        setLoadingMessage(`Detecting objects ${i + 1} of ${filesToProcess.length}...`)
        setLoadingSubmessage(`YOLOv8 is analyzing ${currentFile.name}`)
        const inferRes = await api.infer(sessionId!, imageId, imageBase64)

        // Step 3: Construct data URL for display (reuse base64 from upload)
        setLoadingMessage(`Processing results ${i + 1} of ${filesToProcess.length}...`)
        setLoadingSubmessage(`Preparing ${currentFile.name} for editor`)
        
        // Determine MIME type for data URL
        const mimeType = uploadRes.mime || 'image/jpeg'
        const imageSrc = `data:${mimeType};base64,${imageBase64}`

        // Store result (don't call onComplete yet!)
        results.push({
          sessionId: sessionId!,
          imageSrc,
          boxes: inferRes.boxes,
          metrics: inferRes.metrics,
          imageId: inferRes.image_id,
          filename: currentFile.name
        })
      }

      // ALL images processed - now call onComplete ONCE with all results
      setLoadingMessage('Loading editor...')
      setLoadingSubmessage(`All ${results.length} images ready!`)
      
      onComplete(results)

      // Clear files after successful upload
      setFile(null)
      setFiles([])
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
      setUploadProgress(null)
      setLoadingMessage('')
      setLoadingSubmessage('')
    }
  }

  return (
    <>
      {loading && (
        <LoadingSpinner 
          message={loadingMessage}
          submessage={loadingSubmessage}
          progress={uploadProgress ? (uploadProgress.current / uploadProgress.total) * 100 : undefined}
        />
      )}
      
      <div className={compact ? "" : "max-w-md mx-auto bg-white p-8 rounded-lg shadow"}>
      {!compact && (
        <>
          <h2 className="text-2xl font-bold mb-4">
            {existingSessionId ? 'Upload Next Image' : 'Upload Image'}
          </h2>
          
          {existingSessionId && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded text-sm flex items-start gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Continuing session - metrics will accumulate across images</span>
            </div>
          )}
        </>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="file-upload" className={compact ? "sr-only" : "block text-sm font-medium text-gray-700 mb-2"}>
            Choose image(s)
          </label>
          <input
            id="file-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            multiple
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>

        {files.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-700 mb-2">
              Selected: {files.length} file{files.length !== 1 ? 's' : ''}
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="text-xs text-gray-600 flex justify-between">
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="ml-2">{(f.size / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadProgress && (
          <div className="mb-4">
            <div className="text-sm text-gray-700 mb-2">
              Processing {uploadProgress.current} of {uploadProgress.total}...
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={(!file && files.length === 0) || loading}
          className={`w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition font-medium ${compact ? 'text-sm' : 'text-base'}`}
        >
          {loading 
            ? (uploadProgress 
              ? `${uploadProgress.current}/${uploadProgress.total}...` 
              : 'Processing...')
            : compact
              ? '+ Upload'
              : `Upload & Detect ${files.length > 1 ? `(${files.length} images)` : ''}`
          }
        </button>
      </form>
    </div>
    </>
  )
}
