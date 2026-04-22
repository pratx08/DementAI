import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const LETTERS = ['D', 'E', 'M', 'E', 'N', 'T']
const LETTER_STAGGER = 0.07
const SWAP_DELAY = 1600   // ms until IA → AI swap begins
const BUTTON_DELAY = 2600 // ms until Get Started appears

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [swapped, setSwapped] = useState(false)
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    const swapTimer = setTimeout(() => setSwapped(true), SWAP_DELAY)
    const btnTimer = setTimeout(() => setShowButton(true), BUTTON_DELAY)
    return () => {
      clearTimeout(swapTimer)
      clearTimeout(btnTimer)
    }
  }, [])

  return (
    <div className="landing-shell">
      {/* Ambient glow */}
      <div className="landing-glow" aria-hidden />

      <div className="landing-content">
        {/* Wordmark */}
        <div className="landing-wordmark" aria-label="DementAI">
          {/* Staggered letters: D E M E N T */}
          <span className="landing-fixed-letters" aria-hidden>
            {LETTERS.map((letter, i) => (
              <motion.span
                key={i}
                className="landing-letter"
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * LETTER_STAGGER,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {letter}
              </motion.span>
            ))}
          </span>

          {/* Swapping suffix: IA → AI */}
          <span className="landing-suffix-wrap" aria-hidden>
            <AnimatePresence mode="wait">
              {!swapped ? (
                <motion.span
                  key="ia"
                  className="landing-letter"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20, filter: 'blur(6px)' }}
                  transition={{
                    delay: LETTERS.length * LETTER_STAGGER,
                    duration: 0.5,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  IA
                </motion.span>
              ) : (
                <motion.span
                  key="ai"
                  className="landing-letter landing-letter--ai"
                  initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                >
                  AI
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </div>

        {/* Tagline */}
        <motion.p
          className="landing-tagline"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: swapped ? 1 : 0, y: swapped ? 0 : 12 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          Memory, recognised.
        </motion.p>

        {/* CTA button — always in DOM so layout never shifts, opacity fades in */}
        <motion.button
          className="landing-cta"
          animate={{ opacity: showButton ? 1 : 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          style={{ pointerEvents: showButton ? 'auto' : 'none' }}
          onClick={onStart}
          aria-label="Get started"
          tabIndex={showButton ? 0 : -1}
        >
          Get started
          <svg
            className="landing-cta-arrow"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 10h12M11 5l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.button>
      </div>
    </div>
  )
}
