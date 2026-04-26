import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const LETTERS = ['D', 'E', 'M', 'E', 'N', 'T']
const LETTER_STAGGER = 0.08
const FIRST_SWAP_DELAY = 1200
const LOOP_DELAY = 4500
const BUTTON_DELAY = 2200

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [swapped, setSwapped] = useState(false)
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    let loopTimer: number | undefined

    const swapTimer = window.setTimeout(() => {
      setSwapped(true)
      loopTimer = window.setInterval(() => {
        setSwapped((current) => !current)
      }, LOOP_DELAY)
    }, FIRST_SWAP_DELAY)

    const buttonTimer = window.setTimeout(() => {
      setShowButton(true)
    }, BUTTON_DELAY)

    return () => {
      window.clearTimeout(swapTimer)
      window.clearTimeout(buttonTimer)
      if (loopTimer) window.clearInterval(loopTimer)
    }
  }, [])

  return (
    <div className="landing-shell">
      <div className="landing-glow" aria-hidden />

      <div className="landing-content">
        <div className="landing-wordmark" aria-label="DementAI">
          <span className="landing-fixed-letters" aria-hidden>
            {LETTERS.map((letter, i) => (
              <motion.span
                key={letter + i}
                className="landing-letter"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * LETTER_STAGGER,
                  duration: 0.8,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {letter}
              </motion.span>
            ))}
          </span>

          <span className="landing-suffix-wrap" aria-hidden>
            <AnimatePresence mode="wait">
              <motion.span
                key={swapped ? 'ai' : 'ia'}
                className="landing-suffix-inner"
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-100%', opacity: 0 }}
                transition={{
                  y: {
                    type: 'spring',
                    stiffness: 45,
                    damping: 14,
                    mass: 1,
                  },
                  opacity: { duration: 0.4 }
                }}
              >
                {swapped ? (
                  <>
                    <span className="landing-letter landing-letter--ai">A</span>
                    <span className="landing-letter landing-letter--ai">I</span>
                  </>
                ) : (
                  <>
                    <span className="landing-letter">I</span>
                    <span className="landing-letter">A</span>
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>

        <motion.p
          className="landing-tagline"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: showButton ? 1 : 0, y: showButton ? 0 : 10 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Memory, recognised.
        </motion.p>

        <motion.button
          className="landing-cta"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: showButton ? 1 : 0, y: showButton ? 0 : 10 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          style={{ pointerEvents: showButton ? 'auto' : 'none' }}
          onClick={onStart}
          aria-label="Get started"
          tabIndex={showButton ? 0 : -1}
        >
          Get started
          <svg className="landing-cta-arrow" viewBox="0 0 20 20" fill="none" aria-hidden>
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
