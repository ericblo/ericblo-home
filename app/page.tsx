'use client'

import { useCallback, useEffect, useState } from 'react'
import Globe, { type Project } from '@/components/globe'

const PROJECTS: Project[] = [
  { slug: 'underthecanopy', place: 'Yucatán', lat: 20.4, lon: -89.1 },
  { slug: 'thetiltedtimes', place: 'New York City', lat: 40.71, lon: -74.0 },
  { slug: 'thebestpeople', place: 'Washington, DC', lat: 38.9, lon: -77.04 },
  { slug: 'balticway', place: 'The Baltics', lat: 56.95, lon: 24.1 },
  { slug: 'pajtim', place: 'Kosovo', lat: 42.6, lon: 20.9 },
]

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

export default function Home() {
  const [active, setActive] = useState<number | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  // Coming back to this page (Back button) can restore it with a project still
  // highlighted, which would leave the globe parked on it. Start fresh instead.
  useEffect(() => {
    const reset = () => {
      setActive(null)
      setFocus(null)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  // Let the globe finish turning toward the dot before leaving the page.
  const open = useCallback(
    (project: Project) => {
      window.setTimeout(() => window.location.assign(`/${project.slug}`), reducedMotion ? 0 : 550)
    },
    [reducedMotion],
  )

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#04060a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(58,88,140,0.17),transparent_62%)]"
      />

      <header className="home-fade pointer-events-none absolute left-6 top-6 z-10 md:left-10 md:top-9" style={{ animationDelay: '2.3s' }}>
        <h1 className="text-lg font-semibold tracking-tight">eric blohm</h1>
      </header>

      <div className="home-fade relative min-h-0 flex-1" style={{ animationDuration: '1.4s' }}>
        <Globe
          projects={PROJECTS}
          active={active}
          onActiveChange={setActive}
          focus={focus}
          onOpen={open}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* A plain list of the same projects: visible on phones, where dots are hard to
          tap, and reachable by keyboard and screen readers everywhere. */}
      <nav
        aria-label="Projects"
        className="home-fade relative z-10 px-6 pb-8 md:sr-only"
        style={{ animationDelay: '2.3s' }}
      >
        <ul className="flex flex-col divide-y divide-white/10 border-y border-white/10">
          {PROJECTS.map((project, i) => (
            <li key={project.slug}>
              <a
                href={`/${project.slug}`}
                onFocus={() => {
                  setActive(i)
                  setFocus(i)
                }}
                onBlur={() => {
                  setActive(null)
                  setFocus(null)
                }}
                className="flex items-baseline justify-between gap-4 py-3 outline-none focus-visible:text-[#ffd9a0]"
              >
                <span className="flex items-center gap-3 text-[15px] font-medium tracking-tight">
                  <span className="size-1.5 rounded-full bg-[#ffd9a0] shadow-[0_0_8px_2px_rgba(255,217,160,0.55)]" />
                  {project.slug}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {project.place}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  )
}
