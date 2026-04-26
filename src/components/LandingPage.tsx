import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const LETTERS = ['D', 'E', 'M', 'E', 'N', 'T']
const LETTER_STAGGER = 0.055
const FIRST_SWAP_DELAY = 900
const SWAP_DURATION = 1050
const LOOP_DELAY = 2400
const BUTTON_DELAY = 1350
const SWAP_TRANSITION = {
  duration: SWAP_DURATION / 1000,
  ease: [0.76, 0, 0.24, 1] as [number, number, number, number],
  times: [0, 0.5, 1],
}

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

          <span
            className={`landing-suffix-wrap ${swapped ? 'is-ai' : ''}`}
            aria-hidden
          >
            <motion.span
              className="landing-suffix-sheen"
              animate={{
                opacity: swapped ? [0, 0.85, 0.35] : 0,
                scaleX: swapped ? [0.35, 1, 0.88] : 0.3,
              }}
              transition={{ duration: 0.75, ease: 'easeOut' }}
            />
            <motion.span
              className="landing-letter landing-letter--suffix landing-suffix-letter"
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: 1,
                x: swapped ? ['0ch', '0.54ch', '1.08ch'] : ['1.08ch', '0.54ch', '0ch'],
                y: 0,
                scale: swapped ? [1, 1.04, 1] : [1, 1.02, 1],
                color: swapped ? '#36B37E' : '#f7fff9',
              }}
              transition={{
                ...SWAP_TRANSITION,
                opacity: {
                  delay: LETTERS.length * LETTER_STAGGER,
                  duration: 0.45,
                },
              }}
            >
              I
            </motion.span>
            <motion.span
              className="landing-letter landing-letter--suffix landing-suffix-letter"
              initial={{ opacity: 0, x: '1.08ch', y: 20 }}
              animate={{
                opacity: 1,
                x: swapped ? ['1.08ch', '0.54ch', '0ch'] : ['0ch', '0.54ch', '1.08ch'],
                y: 0,
                scale: swapped ? [1, 1.04, 1] : [1, 1.02, 1],
                color: swapped ? '#36B37E' : '#f7fff9',
              }}
              transition={{
                ...SWAP_TRANSITION,
                opacity: {
                  delay: (LETTERS.length + 1) * LETTER_STAGGER,
                  duration: 0.45,
                },
              }}
            >
              A
            </motion.span>
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
