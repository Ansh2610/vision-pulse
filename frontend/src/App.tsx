import { useState, useEffect } from 'react'
import { Home, FileImage, BarChart3, Image as ImageIcon, PenTool } from 'lucide-react'
import LandingPage from './components/LandingPage.tsx'
import Upload from './components/Upload.tsx'
import Canvas from './components/Canvas.tsx'
import Gallery from './components/Gallery.tsx'
import TrueMetricsPanel from './components/TrueMetricsPanel.tsx'
import DetectedObjectsPanel from './components/DetectedObjectsPanel.tsx'
import { api } from './api.ts'
import { Box, Metrics } from './types.ts'
import { saveSessionCache, loadSessionCache, clearSessionCache } from './utils/cache.ts'

interface ImageHistory {
  id: string
  imageSrc: string
  boxes: Box[]
  timestamp: Date
  filename: string
  selectedBoxIndex?: number | null  // Remember which box was selected for this image
}

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [boxes, setBoxes] = useState<Box[]>([])
  const [_metrics, setMetrics] = useState<Metrics | null>(null) // YOLO metrics (kept for potential future use)
  const [activeTab, setActiveTab] = useState<'editor' | 'metrics' | 'gallery'>('editor')
  const [imageCount, setImageCount] = useState(0)
  const [imageHistory, setImageHistory] = useState<ImageHistory[]>([])
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number | null>(null)
  const [currentImageId, setCurrentImageId] = useState<string>('') // Track current image ID for Canvas key
  const [metricsRefreshTrigger, setMetricsRefreshTrigger] = useState(0) // Increment to trigger metrics refresh
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false) // For smooth image transitions

  // Load cached session on mount (HYBRID CACHE: IndexedDB + localStorage fallback)
  useEffect(() => {
    const restoreCache = async () => {
      try {
        const cached = await loadSessionCache()
        if (cached) {
          setSessionId(cached.sessionId)
          setImageHistory(cached.images)
          setImageCount(cached.images.length)
          
          // Show most recent image
          const lastImage = cached.images[cached.images.length - 1]
          setImageSrc(lastImage.imageSrc)
          setBoxes(lastImage.boxes)
          setCurrentImageId(lastImage.id)
          setSelectedBoxIndex(lastImage.selectedBoxIndex ?? null)
          
          console.log('[APP] Restored session from cache:', cached.sessionId)
          console.log('[APP] Loaded', cached.images.length, 'cached images')
        }
      } catch (err) {
        console.error('[APP] Failed to restore cache:', err)
      }
    }
    
    restoreCache()
  }, []) // Run once on mount

  // Auto-save to cache whenever session data changes (DEBOUNCED)
  useEffect(() => {
    if (!sessionId || imageHistory.length === 0) return
    
    // Debounce saves to avoid excessive writes (save 500ms after last change)
    const timeoutId = setTimeout(() => {
      saveSessionCache(sessionId, imageHistory)
        .catch(err => console.error('[APP] Failed to save cache:', err))
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }, [sessionId, imageHistory])

  // Save selection state to image history whenever it changes
  useEffect(() => {
    if (currentHistoryIndex !== null) {
      setImageHistory((prev) => {
        const updated = [...prev]
        if (updated[currentHistoryIndex]) {
          updated[currentHistoryIndex] = {
            ...updated[currentHistoryIndex],
            selectedBoxIndex: selectedBoxIndex
          }
        }
        return updated
      })
    } else if (imageHistory.length > 0) {
      // Save to the most recent image
      setImageHistory((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          selectedBoxIndex: selectedBoxIndex
        }
        return updated
      })
    }
  }, [selectedBoxIndex, currentHistoryIndex])

  // Add keyboard shortcut: Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedBoxIndex !== null) {
        setSelectedBoxIndex(null)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedBoxIndex])

  const handleUploadComplete = (results: Array<{
    sessionId: string
    imageSrc: string
    boxes: Box[]
    metrics: Metrics
    imageId: string
    filename?: string
  }>) => {
    if (results.length === 0) return
    
    console.log('[BATCH UPLOAD COMPLETE] Processing', results.length, 'images')
    
    // Set session from first result
    const sessionId = results[0].sessionId
    setSessionId(sessionId)
    
    // Add ALL images to history first
    const newHistoryItems: ImageHistory[] = results.map(result => ({
      id: result.imageId,
      imageSrc: result.imageSrc,
      boxes: result.boxes,
      timestamp: new Date(),
      filename: result.filename || 'image.jpg'
    }))
    
    setImageHistory((prev) => [...prev, ...newHistoryItems])
    setImageCount((prev) => prev + results.length)
    
    // Show the LAST uploaded image in editor
    const lastResult = results[results.length - 1]
    setImageSrc(lastResult.imageSrc)
    setBoxes(lastResult.boxes)
    setMetrics(lastResult.metrics)
    setCurrentImageId(lastResult.imageId)
    setCurrentHistoryIndex(null)
    
    // NOW switch to editor (only once, after all images loaded)
    setActiveTab('editor')
    
    console.log('[BATCH UPLOAD COMPLETE] Loaded', results.length, 'images, showing last one')
  }

  const handleReset = () => {
    // Clear cache when user explicitly resets
    clearSessionCache().catch(err => console.error('[APP] Failed to clear cache:', err))
    
    setSessionId(null)
    setImageSrc(null)
    setBoxes([])
    setMetrics(null)
    setActiveTab('editor')
    setImageCount(0)
    setImageHistory([])
    setCurrentHistoryIndex(null)
    
    console.log('[APP] Session reset, cache cleared')
  }

  const handleSelectHistoryImage = (index: number) => {
    const historyItem = imageHistory[index]
    
    // Start transition animation
    setIsTransitioning(true)
    
    // Wait for fade out, then switch content
    setTimeout(() => {
      // CLIENT-SIDE ONLY: Use cached data from imageHistory
      // This avoids re-running YOLO inference when switching between images
      setImageSrc(historyItem.imageSrc)
      setBoxes([...historyItem.boxes]) // Create new array to trigger re-render
      setCurrentHistoryIndex(index)
      setCurrentImageId(historyItem.id)
      setActiveTab('editor')
      
      // Restore the selection for this image
      setSelectedBoxIndex(historyItem.selectedBoxIndex ?? null)
      
      console.log('[CLIENT CACHE] Switched to image index:', index, 'ID:', historyItem.id)
      console.log('[CLIENT CACHE] Loaded', historyItem.boxes.length, 'cached boxes')
      console.log('[CLIENT CACHE] Restored selection:', historyItem.selectedBoxIndex ?? 'none')
      
      // Fade back in
      setTimeout(() => setIsTransitioning(false), 50)
    }, 150) // Fade out duration
  }

  const handleDeleteImage = (index: number) => {
    // Determine which image to show after deletion
    const newHistory = imageHistory.filter((_, i) => i !== index)
    
    // If deleting current image, switch to previous or next available
    if (currentHistoryIndex === index) {
      if (newHistory.length === 0) {
        // No images left - clear view
        setImageSrc(null)
        setBoxes([])
        setCurrentHistoryIndex(null)
      } else {
        // Switch to previous image, or first if deleting index 0
        const newIndex = index > 0 ? index - 1 : 0
        const targetImage = newHistory[newIndex]
        
        // Load the target image
        setImageSrc(targetImage.imageSrc)
        setBoxes(targetImage.boxes)
        setCurrentImageId(targetImage.id)
        setCurrentHistoryIndex(newIndex)
      }
    } else if (currentHistoryIndex !== null && currentHistoryIndex > index) {
      // Adjust current index if we deleted an earlier image
      setCurrentHistoryIndex(currentHistoryIndex - 1)
    }
    
    // Update history
    setImageHistory(newHistory)
  }

  const handleUpdateCurrentBoxes = (updatedBoxes: Box[]) => {
    // Update boxes in current view
    setBoxes(updatedBoxes)
    
    // Trigger metrics refresh when boxes are updated (verified/unverified)
    setMetricsRefreshTrigger(prev => prev + 1)
    
    // If viewing a history item, update it in history
    if (currentHistoryIndex !== null) {
      setImageHistory((prev) => {
        const updated = [...prev]
        updated[currentHistoryIndex] = {
          ...updated[currentHistoryIndex],
          boxes: updatedBoxes
        }
        return updated
      })
    } else {
      // Update the most recent item in history
      setImageHistory((prev) => {
        if (prev.length === 0) return prev
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          boxes: updatedBoxes
        }
        return updated
      })
    }
  }

  const handleVerifyBox = async (idx: number, isCorrect: boolean) => {
    try {
      const box = boxes[idx]
      const box_id = box.box_id || `fallback_${idx}`
      
      // Call validation API
      await api.validate(sessionId!, [
        {
          box_id: box_id,
          is_correct: isCorrect,
        },
      ])

      // Update local state
      const updatedBoxes = [...boxes]
      updatedBoxes[idx] = {
        ...updatedBoxes[idx],
        is_verified: true,
        is_correct: isCorrect,
      }
      handleUpdateCurrentBoxes(updatedBoxes)
    } catch (err) {
      console.error('Verification failed:', err)
      alert('Failed to verify box. Please try again.')
    }
  }

  const handleDeleteBox = async (idx: number) => {
    if (!confirm('Delete this annotation?')) {
      return
    }

    try {
      const boxToDelete = boxes[idx]
      
      // Validate required data
      if (!boxToDelete.box_id) {
        console.error('[DELETE BOX] Box has no box_id')
        alert('Cannot delete box: missing ID')
        return
      }
      
      // Call backend to delete the box
      await api.deleteBox(sessionId!, currentImageId!, boxToDelete.box_id)
      
      // Update local state
      const updatedBoxes = boxes.filter((_, i) => i !== idx)
      setBoxes(updatedBoxes)
      handleUpdateCurrentBoxes(updatedBoxes)
      setSelectedBoxIndex(null)
      
      console.log('[DELETE BOX] Successfully deleted box:', boxToDelete.box_id)
    } catch (err) {
      console.error('Delete box failed:', err)
      alert('Failed to delete box. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white shadow-sm z-10">
        <div className="px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <div className="w-3.5 h-3.5 border-2 border-white rounded"></div>
            </div>
            <h1 className="text-lg font-bold text-gray-900">VisionPulse</h1>
          </div>
          {imageSrc && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-2 text-sm"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation */}
        {imageSrc && (
          <aside className="w-48 bg-white shadow-lg flex flex-col">
            <nav className="flex-1 p-4 space-y-2">
              <button
                onClick={() => setActiveTab('editor')}
                className={`w-full px-4 py-3 rounded-lg text-left font-medium transition flex items-center gap-3 ${
                  activeTab === 'editor' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <PenTool className="w-4 h-4" />
                <span>Editor</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('metrics')
                  setMetricsRefreshTrigger(prev => prev + 1)
                }}
                className={`w-full px-4 py-3 rounded-lg text-left font-medium transition flex items-center gap-3 ${
                  activeTab === 'metrics' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Metrics</span>
              </button>
              <button
                onClick={() => setActiveTab('gallery')}
                className={`w-full px-4 py-3 rounded-lg text-left font-medium transition flex items-center gap-3 ${
                  activeTab === 'gallery' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <FileImage className="w-4 h-4" />
                <span>Gallery</span>
                <span className="ml-auto text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                  {imageHistory.length}
                </span>
              </button>
            </nav>
            
            <div className="p-4 border-t border-gray-200">
              <div className="text-xs text-gray-500 text-center">
                {imageCount} image{imageCount !== 1 ? 's' : ''} processed
              </div>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {!imageSrc ? (
            <LandingPage onComplete={handleUploadComplete} />
          ) : (
            <div className="h-full flex flex-col">
              {/* Center Content Area */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col">
                  {activeTab === 'editor' ? (
                    <>
                      {/* Image Navigation */}
                      {imageHistory.length > 1 && (
                        <div className="flex justify-between items-center px-6 py-3 bg-white border-b">
                          <button
                            onClick={() => {
                              const prevIndex = currentHistoryIndex === null 
                                ? imageHistory.length - 2 
                                : Math.max(0, currentHistoryIndex - 1)
                              handleSelectHistoryImage(prevIndex)
                            }}
                            disabled={currentHistoryIndex === 0 || isTransitioning}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200"
                          >
                            ← Previous
                          </button>
                          <span className="text-sm font-medium text-gray-700">
                            Image {(currentHistoryIndex ?? imageHistory.length - 1) + 1} of {imageHistory.length}
                          </span>
                          <button
                            onClick={() => {
                              const nextIndex = currentHistoryIndex === null 
                                ? imageHistory.length - 1 
                                : Math.min(imageHistory.length - 1, currentHistoryIndex + 1)
                              handleSelectHistoryImage(nextIndex)
                            }}
                            disabled={currentHistoryIndex === imageHistory.length - 1 || (currentHistoryIndex === null && imageHistory.length === 1) || isTransitioning}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200"
                          >
                            Next →
                          </button>
                        </div>
                      )}
                      
                      {/* Canvas with smooth transition */}
                      <div 
                        className={`flex-1 flex flex-col transition-opacity duration-200 ${
                          isTransitioning ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{ transition: 'opacity 0.15s ease-in-out' }}
                      >
                        <Canvas
                          key={currentImageId}
                          sessionId={sessionId!}
                          imageId={currentImageId!}
                          imageSrc={imageSrc!}
                          initialBoxes={boxes}
                          onBoxesUpdate={handleUpdateCurrentBoxes}
                          onBoxSelect={setSelectedBoxIndex}
                          selectedBoxIndex={selectedBoxIndex}
                          drawingMode={drawingMode}
                        />

                        {/* Detected Objects Panel */}
                        <DetectedObjectsPanel
                          boxes={boxes}
                          imageSrc={imageSrc!}
                          selectedBoxIndex={selectedBoxIndex}
                          onSelectBox={setSelectedBoxIndex}
                          onVerifyBox={handleVerifyBox}
                          onDeleteBox={handleDeleteBox}
                        />
                      </div>
                    </>
                  ) : activeTab === 'gallery' ? (
                  <Gallery
                    images={imageHistory}
                    onSelectImage={handleSelectHistoryImage}
                    onDeleteImage={handleDeleteImage}
                    currentIndex={currentHistoryIndex}
                  />
                ) : (
                  <TrueMetricsPanel sessionId={sessionId!} refreshTrigger={metricsRefreshTrigger} />
                )}
              </div> {/* close flex-1 flex flex-col for content area */}

              {/* Right Sidebar - Actions */}
              {activeTab === 'editor' && (
                <aside className="w-64 bg-white shadow-lg border-l border-gray-200">
                  <div className="p-6 space-y-6">
                    {/* Upload Button */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Add Images
                      </h3>
                      <Upload 
                        onComplete={handleUploadComplete} 
                        existingSessionId={sessionId}
                        compact={true}
                      />
                    </div>

                    {/* Drawing Mode Toggle */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <PenTool className="w-4 h-4" />
                        Annotate
                      </h3>
                      <button
                        onClick={() => setDrawingMode(!drawingMode)}
                        className={`w-full px-4 py-2 rounded-lg font-medium transition ${
                          drawingMode
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {drawingMode ? 'Drawing Mode ON' : 'Draw Box'}
                      </button>
                      {drawingMode && (
                        <p className="mt-2 text-xs text-gray-600">
                          Click and drag on the image to draw a bounding box. You'll be prompted to name it.
                        </p>
                      )}
                    </div>

                    {/* Selected Box Info */}
                    {selectedBoxIndex !== null && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-800 mb-3">Selected</h3>
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="font-medium text-sm">{boxes[selectedBoxIndex].label}</div>
                          <div className="text-xs text-gray-600 mt-1">
                            {(boxes[selectedBoxIndex].confidence * 100).toFixed(1)}%
                            {boxes[selectedBoxIndex].is_manual && ' (Manual)'}
                          </div>
                          <button
                            onClick={() => handleDeleteBox(selectedBoxIndex)}
                            className="mt-2 w-full px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                          >
                            Delete Selected
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">ESC</kbd> to deselect
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      <button
                        onClick={() => alert('Export functionality - Coming soon!')}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                      >
                        Export YOLO
                      </button>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}
        </main>
      </div>
    </div>
  )
}

export default App
