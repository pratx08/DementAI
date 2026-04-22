import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const assetPath = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

// ─── Company detail data ────────────────────────────────────────
type Company = {
  id: string
  name: string
  tag: string
  sourceLabel: string
  sourceUrl: string
  /** Drop files into public/competitors/ and Vite serves them at these paths */
  imageSrc: string
  videoSrc: string
  accent: string
}

const COMPANIES: Company[] = [
  {
    id: 'guardian',
    name: 'AI Smart Glasses',
    tag: '£1M Prize · Dementia Tech',
    sourceLabel: 'The Guardian',
    sourceUrl: 'https://www.theguardian.com/society/2026/mar/18/ai-smart-glasses-1m-prize-technology-dementia',
    imageSrc: assetPath('competitors/guardian-cover.jpg'),
    videoSrc: assetPath('competitors/guardian-video.mp4'),
    accent: '#F5A623',
  },
  {
    id: 'careyaya',
    name: 'CareYaya',
    tag: 'MedaCareLLM · AI Glasses',
    sourceLabel: 'Healthcare Digital',
    sourceUrl: 'https://healthcare-digital.com/technology-and-ai/careyayas-medacarellm-ai-glasses-support-dementia-patients',
    imageSrc: assetPath('competitors/careyaya-cover.jpg'),
    videoSrc: assetPath('competitors/careyaya-video.mp4'),
    accent: '#C471ED',
  },
]

// ─── Card definitions ───────────────────────────────────────────
type Bullet = { label: string; detail: string }
type Card = {
  accent: string
  eyebrow: string
  stat: string
  statLabel: string
  title: string
  body: string
  bullets?: Bullet[]
  showCompetitors?: boolean
  icon: React.ReactNode
}

const CARDS: Card[] = [
  {
    accent: '#E8624A',
    eyebrow: 'The Problem',
    stat: '55M+',
    statLabel: 'people living with dementia worldwide — a new diagnosis every 3 seconds',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <path d="M24 8C15.16 8 8 15.16 8 24s7.16 16 16 16 16-7.16 16-16S32.84 8 24 8Z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M24 16v10l6 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'The crisis hiding in plain sight.',
    body: "For a dementia patient, the cruelest symptom isn't forgetting a name — it's looking at their daughter's face and seeing a stranger. Current tools track location and dispense pills. Not one solves real-time face recognition. That is the gap DementAI was built to close.",
    bullets: [
      { label: '$1.3T', detail: 'annual global cost of dementia care (WHO, 2023)' },
      { label: '70%', detail: 'of patients cannot consistently recognise close family within 5 years of diagnosis' },
    ],
  },
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
    body: 'Tap a competitor below to see what they offer — and where DementAI goes further.',
    showCompetitors: true,
  },
  {
    accent: '#36B37E',
    eyebrow: 'Our Edge',
    stat: '0',
    statLabel: 'competing apps combine all three: face recognition · live captions · smart summaries',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="ob-icon" aria-hidden>
        <path d="M24 6l14 5v11c0 10-6.3 18.8-14 21C16.3 40.8 10 32 10 22V11l14-5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M18 24l4 4 8-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Private. Present. Unmatched.',
    body: 'DementAI is the only solution that works entirely on-device — no internet required, no data ever leaves the phone. It identifies faces in under a second, captions speech live, and distils each conversation into one actionable memory card.',
    bullets: [
      { label: 'On-device AI', detail: 'Runs offline · no cloud · HIPAA-aligned by design' },
      { label: 'Unified UX', detail: 'Face recognition + captions + summaries in one tap' },
    ],
  },
]

// ─── Slide variants ─────────────────────────────────────────────
const SLIDE = {
  enter: (dir: number) => ({ x: dir > 0 ? '65%' : '-65%', opacity: 0, scale: 0.95 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? '-65%' : '65%', opacity: 0, scale: 0.95 }),
}

const DETAIL_VARIANTS = {
  enter:  { y: '100%', opacity: 0 },
  center: { y: 0,      opacity: 1 },
  exit:   { y: '100%', opacity: 0 },
}

// ─── Company detail view ────────────────────────────────────────
function CompanyDetail({ company, onBack }: { company: Company; onBack: () => void }) {
  const [imageReady, setImageReady] = useState(false)
  const [videoReady, setVideoReady] = useState(false)

  return (
    <motion.div
      className="cd-shell"
      variants={DETAIL_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Top bar: back + source link */}
      <div className="cd-topbar">
        <button className="cd-back" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Back</span>
        </button>

        <a
          className="cd-source"
          href={company.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: company.accent }}
          aria-label={`Source: ${company.sourceLabel}`}
        >
          <svg viewBox="0 0 20 20" fill="none" className="cd-source-icon" aria-hidden>
            <path d="M11 3h6v6M17 3l-9 9M8 5H4a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-4"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {company.sourceLabel}
        </a>
      </div>

      {/* Company name */}
      <div className="cd-name-row">
        <span className="cd-company-name">{company.name}</span>
        <span className="cd-company-tag" style={{ color: company.accent }}>{company.tag}</span>
      </div>

      {/* Image placeholder */}
      <div className="cd-media-block">
        <img
          className="cd-image"
          src={company.imageSrc}
          alt={`${company.name} cover`}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(false)}
        />
        {!imageReady && (
          <div className="cd-image-placeholder" aria-hidden>
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="4" y="8" width="40" height="30" rx="4" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="16" cy="20" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M4 30l10-8 8 6 6-4 16 10" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Add image to<br /><code>public/competitors/{company.id}-cover.jpg</code></span>
          </div>
        )}
      </div>

      {/* Video placeholder */}
      <div className="cd-media-block cd-media-block--video">
        <video
          className="cd-video"
          src={company.videoSrc}
          controls
          playsInline
          onLoadedData={() => setVideoReady(true)}
          onError={() => setVideoReady(false)}
        />
        {!videoReady && (
          <div className="cd-video-placeholder" aria-hidden>
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="4" y="8" width="40" height="30" rx="4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 18l12 6-12 6V18Z" stroke="currentColor" strokeWidth="1.8"
              strokeLinejoin="round" />
          </svg>
          <span>Add video to<br /><code>public/competitors/{company.id}-video.mp4</code></span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Competitor mini-cards ───────────────────────────────────────
function CompetitorCards({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="cc-grid">
      {COMPANIES.map((c) => (
        <button
          key={c.id}
          className="cc-card"
          style={{ '--cc-accent': c.accent } as React.CSSProperties}
          onClick={() => onSelect(c.id)}
          aria-label={`View ${c.name}`}
        >
          <span className="cc-card-name">{c.name}</span>
          <span className="cc-card-tag" style={{ color: c.accent }}>{c.tag}</span>
          <svg className="cc-arrow" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────
export function OnboardingCards({ onDone }: { onDone: () => void }) {
  const [index, setIndex]                         = useState(0)
  const [dir, setDir]                             = useState(1)
  const [activeCompany, setActiveCompany]         = useState<Company | null>(null)

  function next() {
    if (index === CARDS.length - 1) { onDone(); return }
    setDir(1)
    setIndex((i) => i + 1)
  }

  const card   = CARDS[index]
  const isLast = index === CARDS.length - 1

  return (
    <div className="ob-shell">
      <div className="ob-glow" aria-hidden />

      {/* ── Card stage ── */}
      <div className="ob-stage">
        <AnimatePresence mode="wait" custom={dir}>
          {activeCompany ? (
            /* Company detail overlay */
            <CompanyDetail
              key={`detail-${activeCompany.id}`}
              company={activeCompany}
              onBack={() => setActiveCompany(null)}
            />
          ) : (
            /* Normal pitch card */
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
                <span className="ob-eyebrow" style={{ color: card.accent }}>{card.eyebrow}</span>
                <span className="ob-step-count">{index + 1} / {CARDS.length}</span>
              </div>

              {/* Stat */}
              <div className="ob-stat-block">
                <span className="ob-stat-number" style={{ color: card.accent }}>{card.stat}</span>
                <span className="ob-stat-label">{card.statLabel}</span>
              </div>

              {/* Divider */}
              <div className="ob-divider" style={{ background: card.accent }} />

              {/* Title + body */}
              <h2 className="ob-title">{card.title}</h2>
              <p className="ob-body">{card.body}</p>

              {/* Bullet rows */}
              {card.bullets && (
                <ul className="ob-bullets">
                  {card.bullets.map((b) => (
                    <li key={b.label} className="ob-bullet">
                      <span className="ob-bullet-label" style={{ color: card.accent }}>{b.label}</span>
                      <span className="ob-bullet-detail">{b.detail}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Competitor cards (card 2 only) */}
              {card.showCompetitors && (
                <CompetitorCards
                  onSelect={(id) => setActiveCompany(COMPANIES.find((c) => c.id === id) ?? null)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation (hidden when detail is open) ── */}
      <AnimatePresence>
        {!activeCompany && (
          <motion.div
            className="ob-nav"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
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
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
