import { useState, useEffect, useRef } from 'react'
import { Av } from './ui.jsx'
import * as db from '../lib/db.js'

const BALLOON_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
const BALLOON_COUNT = 14
const DURATION_MS = 5000

// Short synthesized "cheer" — an ascending major arpeggio — so this needs no audio asset to source
// or commit. Browsers can block audio without a prior user gesture; that's fine, the visual
// celebration runs regardless.
function playCheer() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.11
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1200)
  } catch { /* autoplay blocked or unsupported — visual still plays */ }
}

// Mounted once, globally, in App.jsx for every logged-in user regardless of role. Subscribes to
// distributor_celebrations INSERTs (Supabase Realtime) so the moment Admin marks a lead's payment
// received and it becomes a real Distributor, every other open session sees it live — not just the
// actor's own toast. Queues celebrations one at a time if two land close together.
export default function CelebrationOverlay() {
  const [active, setActive] = useState(null)
  const [balloons, setBalloons] = useState([])
  const queueRef = useRef([])
  const timerRef = useRef(null)

  const playNext = () => {
    if (queueRef.current.length === 0) { setActive(null); return }
    const next = queueRef.current.shift()
    setActive(next)
    setBalloons(Array.from({ length: BALLOON_COUNT }, (_, i) => ({
      id: `${next.id}-${i}`,
      left: Math.random() * 100,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
      duration: 3.8 + Math.random() * 2.2,
      delay: Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 60,
      size: 42 + Math.random() * 22,
    })))
    playCheer()
    timerRef.current = setTimeout(playNext, DURATION_MS)
  }

  useEffect(() => {
    const unsubscribe = db.subscribeDistributorCelebrations(row => {
      queueRef.current.push(row)
      if (!timerRef.current) playNext()
    })
    return () => {
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`
        @keyframes celebrationFloatUp {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          8% { opacity: 1; }
          100% { transform: translate(var(--drift), -115vh) rotate(8deg); opacity: 0; }
        }
        @keyframes celebrationCardIn {
          0% { transform: translate(-50%, -20px) scale(0.9); opacity: 0; }
          15% { transform: translate(-50%, 0) scale(1); opacity: 1; }
          85% { transform: translate(-50%, 0) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -10px) scale(0.96); opacity: 0; }
        }
      `}</style>

      {balloons.map(b => (
        <div key={b.id} style={{
          position: 'absolute', bottom: -80, left: `${b.left}%`,
          animation: `celebrationFloatUp ${b.duration}s ease-in ${b.delay}s forwards`,
          '--drift': `${b.drift}px`,
        }}>
          <div style={{
            width: b.size, height: b.size * 1.2, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            background: `radial-gradient(circle at 32% 28%, ${b.color}dd, ${b.color})`,
            boxShadow: `inset -4px -6px 8px rgba(0,0,0,0.15)`,
          }} />
          <div style={{ width: 1, height: 30, background: '#9ca3af', margin: '0 auto' }} />
        </div>
      ))}

      <div style={{
        position: 'absolute', top: 24, left: '50%',
        animation: `celebrationCardIn ${DURATION_MS / 1000}s ease-in-out forwards`,
        background: '#ffffff', borderRadius: 16, padding: '14px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 12,
        maxWidth: 360,
      }}>
        {active.avatar
          ? <Av av={active.avatar} color={active.color || '#6b7280'} sz={44} />
          : <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🎉</div>
        }
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>🎉 New Distributor Created!</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {active.distributor_name}{active.member_name ? ` · first visited by ${active.member_name}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
