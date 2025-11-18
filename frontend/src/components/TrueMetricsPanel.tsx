import { useEffect, useState } from 'react'
import { TrueMetrics } from '../types'
import { Info } from 'lucide-react'

interface Props {
  sessionId: string
  refreshTrigger?: number // Increment this to trigger a refresh
}

export default function TrueMetricsPanel({ sessionId, refreshTrigger }: Props) {
  const [trueMetrics, setTrueMetrics] = useState<TrueMetrics | null>(null)
  const [sessionStats, setSessionStats] = useState<{ totalImages: number; totalBoxes: number; verifiedCount: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      setError(null)
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const res = await fetch(`${API_URL}/api/validations/${sessionId}`)
      
      if (!res.ok) {
        if (res.status === 404) {
          setError('SESSION_EXPIRED')
          setTrueMetrics(null)
          setSessionStats(null)
          return
        }
        throw new Error('Failed to fetch metrics')
      }

      const data = await res.json()
      
      // Session-wide metrics from backend
      if (data.true_metrics) {
        setTrueMetrics(data.true_metrics)
      } else {
        setTrueMetrics(null)
      }
      
      // Calculate stats from all images in the session
      const images = data.images || []
      const totalBoxes = images.reduce((sum: number, img: any) => 
        sum + (img.boxes?.length || 0), 0)
      const verifiedBoxes = images.reduce((sum: number, img: any) => 
        sum + (img.boxes?.filter((b: any) => b.is_verified)?.length || 0), 0)
      
      setSessionStats({
        totalImages: images.length,
        totalBoxes: totalBoxes,
        verifiedCount: verifiedBoxes
      })
    } catch (err) {
      console.error('Failed to fetch true metrics:', err)
      setError('FETCH_ERROR')
      setTrueMetrics(null)
      setSessionStats(null)
    } finally {
      setLoading(false)
    }
  }

  // Fetch metrics only when:
  // 1. Component mounts
  // 2. Session changes
  // 3. refreshTrigger changes (parent tells us to refresh)
  useEffect(() => {
    if (sessionId) {
      fetchMetrics()
    }
  }, [sessionId, refreshTrigger])

  const verifiedCount = sessionStats?.verifiedCount || 0
  const sessionInfo = sessionStats 
    ? `${sessionStats.totalImages} images, ${sessionStats.totalBoxes} total boxes` 
    : 'Loading...'

  // Show session expired error
  if (error === 'SESSION_EXPIRED') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border-2 border-red-200 p-6 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-xl font-bold mb-2 text-red-900">Session Expired</h3>
              <p className="text-sm text-red-700 mb-3">
                This session no longer exists on the server. Your images are cached locally, but validation data has been cleaned up.
              </p>
              <p className="text-sm text-red-700 mb-4">
                <strong>To continue:</strong> Click the "Home" button and upload your images again to create a new session.
              </p>
              <div className="text-xs text-red-600 bg-red-100 p-3 rounded border border-red-200">
                <strong>Why did this happen?</strong><br/>
                Server sessions are automatically cleaned up after a period of inactivity to save resources. Your images remain cached in your browser, but the backend has no record of this session.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show generic fetch error
  if (error === 'FETCH_ERROR') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-yellow-50 border-2 border-yellow-200 p-6 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-xl font-bold mb-2 text-yellow-900">Unable to Load Metrics</h3>
              <p className="text-sm text-yellow-700 mb-3">
                Could not connect to the server. Please check your internet connection and try again.
              </p>
              <button
                onClick={() => fetchMetrics()}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (verifiedCount === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold mb-2 text-blue-900">Classification Metrics</h3>
            <p className="text-sm text-blue-700">
              Mark boxes as correct or incorrect to see true classification metrics.
            </p>
            <p className="text-xs text-blue-600 mt-2">
              Session: {sessionInfo} • 0 verified
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Classification Metrics</h3>
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!trueMetrics) {
    return null
  }

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Classification Metrics</h3>
      </div>
      <div className="text-sm text-gray-600 mb-4">
        Session: {sessionInfo} • {verifiedCount} verified
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 p-4 rounded">
          <div className="text-xs text-green-700 font-medium mb-1">Precision</div>
          <div className="text-2xl font-bold text-green-900">
            {formatPercent(trueMetrics.precision)}
          </div>
          <div className="text-xs text-green-600 mt-1">
            How many detections are correct
          </div>
        </div>
        
        <div className="bg-blue-50 p-4 rounded">
          <div className="text-xs text-blue-700 font-medium mb-1">Recall</div>
          <div className="text-2xl font-bold text-blue-900">
            {formatPercent(trueMetrics.recall)}
          </div>
          <div className="text-xs text-blue-600 mt-1">
            How many objects were detected
          </div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded">
          <div className="text-xs text-purple-700 font-medium mb-1">F1 Score</div>
          <div className="text-2xl font-bold text-purple-900">
            {formatPercent(trueMetrics.f1_score)}
          </div>
          <div className="text-xs text-purple-600 mt-1">
            Balanced accuracy
          </div>
        </div>
      </div>

      {/* Classification Breakdown */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold mb-3 text-gray-700">Classification Breakdown</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded">
            <span className="text-sm text-green-700">True Positives</span>
            <span className="text-lg font-bold text-green-900">{trueMetrics.true_positives}</span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-red-50 rounded">
            <span className="text-sm text-red-700">False Positives</span>
            <span className="text-lg font-bold text-red-900">{trueMetrics.false_positives}</span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-orange-50 rounded">
            <span className="text-sm text-orange-700">False Negatives</span>
            <span className="text-lg font-bold text-orange-900">{trueMetrics.false_negatives}</span>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
        <p className="mb-1">
          <strong>TP:</strong> Correct detections (marked with ✓)
        </p>
        <p className="mb-1">
          <strong>FP:</strong> Wrong detections (marked with ✗)
        </p>
        <p>
          <strong>FN:</strong> Missed objects (manually added boxes)
        </p>
      </div>

      {/* Session Info */}
      {sessionStats && sessionStats.totalImages > 1 && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Session Overview
          </h4>
          <div className="text-xs text-blue-700 space-y-1">
            <p>
              <strong>Total Images:</strong> {sessionStats.totalImages} images processed
            </p>
            <p>
              <strong>Total Boxes:</strong> {sessionStats.totalBoxes} detections across all images
            </p>
            <p>
              <strong>Verified:</strong> {sessionStats.verifiedCount} of {sessionStats.totalBoxes} boxes ({((sessionStats.verifiedCount / sessionStats.totalBoxes) * 100).toFixed(1)}%)
            </p>
            <p className="mt-2 pt-2 border-t border-blue-300 text-blue-600">
              Metrics above are aggregated across <strong>all {sessionStats.totalImages} images</strong> in this session
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
