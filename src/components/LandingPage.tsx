import { useEffect, useState } from 'react'
import { motion, LayoutGroup } from 'framer-motion'

const LETTERS = ['D', 'E', 'M', 'E', 'N', 'T']
const LETTER_STAGGER   = 0.07
const SWAP_DELAY       = 1500  // ms — when IA → AI swap fires
const SWAP_DURATION    = 1100  // ms — how long the cross takes
const BUTTON_DELAY     = SWAP_DELAY + SWAP_DURATION + 200 // appears only after swap settles

export function LandingPage({ onStart }: { onStart: () => void }) {
  const [swapped, setSwapped]       = useState(false)
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    const swapTimer   = setTimeout(() => setSwapped(true),    SWAP_DELAY)
    const buttonTimer = setTimeout(() => setShowButton(true), BUTTON_DELAY)
    return () => {
      clearTimeout(swapTimer)
      clearTimeout(buttonTimer)
    }
  }, [])

  return (
    <div className="landing-shell">
      <div className="landing-glow" aria-hidden />

      <div className="landing-content">

        {/* ── Wordmark ─────────────────────────────────────── */}
        <LayoutGroup id="wordmark">
          <div className="landing-wordmark" aria-label="DementAI">

            {/* Fixed letters: D E M E N T */}
            <span className="landing-fixed-letters" aria-hidden>
              {LETTERS.map((letter, i) => (
                <motion.span
                  key={letter + i}
                  className="landing-letter"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay:    i * LETTER_STAGGER,
                    duration: 0.5,
                    ease:     [0.22, 1, 0.36, 1],
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </span>

            {/*
              Suffix letters — they ALWAYS stay mounted.
              When `swapped` flips, we reverse their DOM order inside the
              flex container. Framer Motion's `layout` + `layoutId` detects
              the position change and animates each letter to its new spot,
              making them visually cross each other.
            */}
            <span className="landing-suffix-wrap" aria-hidden>
              {!swapped ? (
                /* ── DEMENTIA order: I then A ── */
                <>
                  <motion.span
                    layoutId="letter-i"
                    layout
                    className="landing-letter"
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      layout:   { duration: SWAP_DURATION / 1000, ease: [0.22, 1, 0.36, 1] },
                      opacity:  { delay: LETTERS.length * LETTER_STAGGER, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                      y:        { delay: LETTERS.length * LETTER_STAGGER, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                    }}
                  >
                    I
                  </motion.span>
                  <motion.span
                    layoutId="letter-a"
                    layout
                    className="landing-letter"
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      layout:   { duration: SWAP_DURATION / 1000, ease: [0.22, 1, 0.36, 1] },
                      opacity:  { delay: (LETTERS.length + 1) * LETTER_STAGGER, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                      y:        { delay: (LETTERS.length + 1) * LETTER_STAGGER, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                    }}
                  >
                    A
                  </motion.span>
                </>
              ) : (
                /* ── After swap: A then I  →  reads as "AI" ── */
                <>
                  <motion.span
                    layoutId="letter-a"
                    layout
                    className="landing-letter landing-letter--ai"
                    animate={{ color: '#36B37E' }}
                    transition={{
                      layout: { duration: SWAP_DURATION / 1000, ease: [0.22, 1, 0.36, 1] },
                      color:  { duration: 0.35, delay: (SWAP_DURATION / 1000) * 0.5 },
                    }}
                  >
                    A
                  </motion.span>
                  <motion.span
                    layoutId="letter-i"
                    layout
                    className="landing-letter landing-letter--ai"
                    animate={{ color: '#36B37E' }}
                    transition={{
                      layout: { duration: SWAP_DURATION / 1000, ease: [0.22, 1, 0.36, 1] },
                      color:  { duration: 0.35, delay: (SWAP_DURATION / 1000) * 0.5 },
                    }}
                  >
                    I
                  </motion.span>
                </>
              )}
            </span>

          </div>
        </LayoutGroup>

        {/* ── Tagline — fades in once letters are swapped ── */}
        <motion.p
          className="landing-tagline"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: swapped ? 1 : 0, y: swapped ? 0 : 10 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          Memory, recognised.
        </motion.p>

        {/* ── CTA — always in DOM so layout never shifts ── */}
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
