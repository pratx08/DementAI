import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Bullet = { label: string; detail: string }

type Card = {
  accent: string
  eyebrow: string
  stat: string
  statLabel: string
  title: string
  body: string
  bullets?: Bullet[]
  icon: React.ReactNode
}

const CARDS: Card[] = [
  /* ── Card 1 · Problem Definition & Insight ──────────────── */
  {
    accent: '#E8624A',
    eyebrow: 'The Problem',
    stat: '55M+',
    statLabel: 'people living with dementia worldwide — a new diagnosis every 3 seconds',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <path
          d="M24 8C15.16 8 8 15.16 8 24s7.16 16 16 16 16-7.16 16-16S32.84 8 24 8Z"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <path d="M24 16v10l6 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'The crisis hiding in plain sight.',
    body: 'For a dementia patient, the cruelest symptom isn\'t forgetting a name — it\'s looking at their daughter\'s face and seeing a stranger. Current tools track location and dispense pills. Not one solves real-time face recognition. That is the gap DementAI was built to close.',
    bullets: [
      { label: '$1.3T', detail: 'annual global cost of dementia care (WHO, 2023)' },
      { label: '70%', detail: 'of patients cannot consistently recognise close family within 5 years of diagnosis' },
    ],
  },

  /* ── Card 2 · Market Understanding & Differentiation ────── */
  {
    accent: '#5B8DEF',
    eyebrow: 'The Market',
    stat: '$4.3B',
    statLabel: 'global dementia care-tech market by 2027 · CAGR 8.1%',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <rect x="6" y="28" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="2.2" />
        <rect x="20" y="18" width="8" height="24" rx="2" stroke="currentColor" strokeWidth="2.2" />
        <rect x="34" y="8" width="8" height="34" rx="2" stroke="currentColor" strokeWidth="2.2" />
        <path d="M10 22l10-8 10 6 10-12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'A massive market. A glaring blind spot.',
    body: 'CrossSense offers sensor-based navigation aids for sensory impairment — a different user, a different use case. No existing product combines on-device face recognition, live captions, and AI-generated conversation summaries in a single privacy-first app built specifically for dementia.',
    bullets: [
      { label: 'CrossSense', detail: 'Sensor / audio navigation for sensory impairment — not dementia-specific, no face recognition' },
      { label: 'DementAI', detail: 'Real-time face ID + captions + memory cards · 100% on-device · zero cloud dependency' },
    ],
  },

  /* ── Card 3 · Why DementAI Wins ─────────────────────────── */
  {
    accent: '#36B37E',
    eyebrow: 'Our Edge',
    stat: '0',
    statLabel: 'competing apps combine all three: face recognition · live captions · smart summaries',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <path
          d="M24 6l14 5v11c0 10-6.3 18.8-14 21C16.3 40.8 10 32 10 22V11l14-5Z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M18 24l4 4 8-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Private. Present. Unmatched.',
    body: 'DementAI is the only solution that works entirely on-device — no internet required, no data ever leaves the phone. It identifies faces in under a second, captions speech live, and distils each conversation into one actionable memory card. Built for the moment that matters most.',
    bullets: [
      { label: 'On-device AI', detail: 'Runs offline · no cloud · HIPAA-aligned by design' },
      { label: 'Unified UX', detail: 'Face recognition + captions + summaries in one tap' },
    ],
  },
]

const SLIDE = {
  enter: (dir: number) => ({ x: dir > 0 ? '65%' : '-65%', opacity: 0, scale: 0.95 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-65%' : '65%', opacity: 0, scale: 0.95 }),
}

export function OnboardingCards({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState(1)

  function next() {
    if (index === CARDS.length - 1) {
      onDone()
      return
    }
    setDir(1)
    setIndex((i) => i + 1)
  }

  const card = CARDS[index]
  const isLast = index === CARDS.length - 1

  return (
    <div className="ob-shell">
      <div className="ob-glow" aria-hidden />

      {/* Card stage */}
      <div className="ob-stage">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={index}
            className="ob-card"
            custom={dir}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Eyebrow + step */}
            <div className="ob-header-row">
              <span className="ob-eyebrow" style={{ color: card.accent }}>
                {card.eyebrow}
              </span>
              <span className="ob-step-count">
                {index + 1} / {CARDS.length}
              </span>
            </div>

            {/* Big stat */}
            <div className="ob-stat-block">
              <span className="ob-stat-number" style={{ color: card.accent }}>
                {card.stat}
              </span>
              <span className="ob-stat-label">{card.statLabel}</span>
            </div>

            {/* Divider */}
            <div className="ob-divider" style={{ background: card.accent }} />

            {/* Title */}
            <h2 className="ob-title">{card.title}</h2>

            {/* Body */}
            <p className="ob-body">{card.body}</p>

            {/* Bullets */}
            {card.bullets && (
              <ul className="ob-bullets">
                {card.bullets.map((b) => (
                  <li key={b.label} className="ob-bullet">
                    <span className="ob-bullet-label" style={{ color: card.accent }}>
                      {b.label}
                    </span>
                    <span className="ob-bullet-detail">{b.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="ob-nav">
        <div className="ob-dots" role="tablist" aria-label="Progress">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className={`ob-dot ${i === index ? 'ob-dot--active' : ''}`}
              style={i === index ? { backgroundColor: card.accent } : undefined}
              role="tab"
              aria-selected={i === index}
            />
          ))}
        </div>

        <motion.button
          className="ob-next"
          onClick={next}
          style={{ backgroundColor: card.accent }}
          whileTap={{ scale: 0.91 }}
          aria-label={isLast ? 'Begin' : 'Next'}
        >
          {isLast ? (
            <span className="ob-next-label">Begin</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </motion.button>
      </div>
    </div>
  )
}
