import { useEffect, useState } from 'react'
import { motion, LayoutGroup } from 'framer-motion'

const LETTERS = ['D', 'E', 'M', 'E', 'N', 'T']
const LETTER_STAGGER = 0.07
const FIRST_SWAP_DELAY = 1200
const SWAP_DURATION = 1800
const LOOP_DELAY = 2600
const BUTTON_DELAY = FIRST_SWAP_DELAY + SWAP_DURATION + 250
const SWAP_EASE = [0.76, 0, 0.24, 1] as const

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [swapped, setSwapped] = useState(false)
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    let loopTimer: number | undefined

    const swapTimer = window.setTimeout(() => {
      setSwapped(true)
      loopTimer = window.setInterval(() => {
        setSwapped((current) => !current)
      }, LOOP_DELAY + SWAP_DURATION)
    }, FIRST_SWAP_DELAY)

    const buttonTimer = window.setTimeout(() => {
      setShowButton(true)
    }, BUTTON_DELAY)

    return () => {
      window.clearTimeout(swapTimer)
      window.clearTimeout(buttonTimer)

      if (loopTimer) {
        window.clearInterval(loopTimer)
      }
    }
  }, [])

  const suffixTransition = {
    layout: { duration: SWAP_DURATION / 1000, ease: SWAP_EASE },
    color: { duration: 0.7, delay: (SWAP_DURATION / 1000) * 0.35 },
  }

  return (
    <div className="landing-shell">
      <div className="landing-glow" aria-hidden />

      <div className="landing-content">
        <LayoutGroup id="wordmark">
          <div className="landing-wordmark" aria-label="DementAI">
            <span className="landing-fixed-letters" aria-hidden>
              {LETTERS.map((letter, i) => (
                <motion.span
                  key={letter + i}
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

            <span className="landing-suffix-wrap" aria-hidden>
              {!swapped ? (
                <>
                  <motion.span
                    layoutId="letter-i"
                    layout
                    className="landing-letter landing-letter--suffix"
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0, color: '#f7fff9' }}
                    transition={{
                      ...suffixTransition,
                      opacity: {
                        delay: LETTERS.length * LETTER_STAGGER,
                        duration: 0.5,
                        ease: [0.22, 1, 0.36, 1],
                      },
                      y: {
                        delay: LETTERS.length * LETTER_STAGGER,
                        duration: 0.5,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    }}
                  >
                    I
                  </motion.span>
                  <motion.span
                    layoutId="letter-a"
                    layout
                    className="landing-letter landing-letter--suffix"
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0, color: '#f7fff9' }}
                    transition={{
                      ...suffixTransition,
                      opacity: {
                        delay: (LETTERS.length + 1) * LETTER_STAGGER,
                        duration: 0.5,
                        ease: [0.22, 1, 0.36, 1],
                      },
                      y: {
                        delay: (LETTERS.length + 1) * LETTER_STAGGER,
                        duration: 0.5,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    }}
                  >
                    A
                  </motion.span>
                </>
              ) : (
                <>
                  <motion.span
                    layoutId="letter-a"
                    layout
                    className="landing-letter landing-letter--suffix landing-letter--ai"
                    animate={{ color: '#36B37E' }}
                    transition={suffixTransition}
                  >
                    A
                  </motion.span>
                  <motion.span
                    layoutId="letter-i"
                    layout
                    className="landing-letter landing-letter--suffix landing-letter--ai"
                    animate={{ color: '#36B37E' }}
                    transition={suffixTransition}
                  >
                    I
                  </motion.span>
                </>
              )}
            </span>
          </div>
        </LayoutGroup>

        <motion.p
          className="landing-tagline"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: showButton ? 1 : 0, y: showButton ? 0 : 10 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          Memory, recognised.
        </motion.p>

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
