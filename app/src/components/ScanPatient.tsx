import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { PatientRow, View } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

// Narrow, local type for the browser's native barcode API - not in TypeScript's standard DOM lib yet,
// and only available on some browsers (mainly Chrome/Android). We feature-detect before using it.
type DetectedBarcode = { rawValue: string }
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}
declare global {
  interface Window { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }
}

export default function ScanPatient({ go }: { go: (v: View) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [supported, setSupported] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices)
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function openPatient(displayId: string) {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('search_patients', { p_query: displayId.trim() })
    setBusy(false)
    if (error) return setError(errMsg(error))
    const match = (data as PatientRow[] | null)?.find((p) => p.display_id.toLowerCase() === displayId.trim().toLowerCase())
    if (!match) return setError(`No patient found with ID "${displayId}" at your facility.`)
    stopCamera()
    go({ name: 'patient', id: match.id })
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setScanning(true)
      const Detector = window.BarcodeDetector!
      const detector = new Detector({ formats: ['qr_code'] })
      const loop = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0) {
            await openPatient(codes[0].rawValue)
            return
          }
        } catch {
          /* a frame occasionally fails to decode; just try the next one */
        }
        if (streamRef.current) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    } catch (e) {
      setError(errMsg(e) === 'Something went wrong' ? 'Could not access the camera. Check permissions.' : errMsg(e))
    }
  }

  return (
    <div className="space-y-3">
      <BackBar title="Scan patient" onBack={() => { stopCamera(); go({ name: 'patients' }) }} />
      <ErrorBox message={error} />

      {supported ? (
        <Card className="space-y-3">
          {!scanning ? (
            <button onClick={startCamera} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3">
              Open camera
            </button>
          ) : (
            <>
              <video ref={videoRef} className="w-full rounded-lg bg-black aspect-square object-cover" muted playsInline />
              <button onClick={stopCamera} className="w-full rounded-xl bg-white border border-slate-300 py-3">Stop camera</button>
            </>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-600">Camera scanning isn't supported on this browser. Type the patient ID instead.</p>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Or type the patient ID</h2>
        <div className="flex gap-2">
          <input
            value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 31397HL"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
          <button onClick={() => openPatient(manual)} disabled={busy || manual.trim().length < 2} className="rounded-lg bg-slate-800 text-white px-4 disabled:opacity-40">
            Go
          </button>
        </div>
      </Card>
    </div>
  )
}
