import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Card = {
  index: number
  icon: React.ReactNode
  title: string
  body: string
  accent: string
}

const CARDS: Card[] = [
  {
    index: 0,
    accent: '#36B37E',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="24" cy="24" r="3" fill="currentColor" />
        <path d="M4 24C4 24 12 8 24 8s20 16 20 16-8 16-20 16S4 24 4 24Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Every face, remembered.',
    body: 'On-device AI recognises the people around you in real time — no cloud, no delay, no privacy trade-off.',
  },
  {
    index: 1,
    accent: '#5B8DEF',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <rect x="6" y="12" width="36" height="26" rx="5" stroke="currentColor" strokeWidth="2.2" />
        <path d="M15 22h18M15 29h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M18 12V8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M30 12V8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Hear every word.',
    body: 'Real-time captions appear as people speak, keeping every conversation clear, present, and visible.',
  },
  {
    index: 2,
    accent: '#F5A623',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <path d="M24 6l3.7 7.5L36 14.8l-6 5.8 1.4 8.2L24 24.8l-7.4 3.9 1.4-8.2-6-5.8 8.3-1.3L24 6Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M12 38h24M16 43h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    title: 'What matters, distilled.',
    body: 'Conversations are compressed into a single memory card. Only the most important detail is kept — greetings never displace appointments.',
  },
  {
    index: 3,
    accent: '#C471ED',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <circle cx="16" cy="18" r="6" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="32" cy="18" r="6" stroke="currentColor" strokeWidth="2.2" />
        <path d="M4 38c0-6.6 5.4-12 12-12h16c6.6 0 12 5.4 12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Stay connected to care.',
    body: 'Family and caregivers get a live view of daily encounters, visitor schedules, reminders, and cognitive patterns.',
  },
  {
    index: 4,
    accent: '#36B37E',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <path d="M24 6l14 5v11c0 10-6.3 18.8-14 21C16.3 40.8 10 32 10 22V11l14-5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M18 24l4 4 8-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Your data never leaves.',
    body: 'All recognition runs entirely on your device. No accounts, no tracking — just you and the people who matter.',
  },
]

const SLIDE = {
  enter: (dir: number) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0, scale: 0.94 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-60%' : '60%', opacity: 0, scale: 0.94 }),
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

      {/* Card */}
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
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Step label */}
            <p className="ob-step" style={{ color: card.accent }}>
              {String(index + 1).padStart(2, '0')} / {String(CARDS.length).padStart(2, '0')}
            </p>

            {/* Icon */}
            <div className="ob-icon-wrap" style={{ color: card.accent }}>
              {card.icon}
            </div>

            {/* Text */}
            <h2 className="ob-title">{card.title}</h2>
            <p className="ob-body">{card.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="ob-nav">
        {/* Progress dots */}
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

        {/* Next / Begin button */}
        <motion.button
          className="ob-next"
          onClick={next}
          style={{ backgroundColor: card.accent }}
          whileTap={{ scale: 0.92 }}
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
