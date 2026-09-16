import { Link } from 'react-router'
import { Badge } from '../components/Badge'
import { CaptureCard } from '../features/capture/CaptureCard'
import { PLATFORM_LABEL } from '../lib/platform'
import { useLibrary } from '../lib/useLibrary'
import type { Entry } from '../types'

const RECENT_LIMIT = 4
const RECENT_SWATCH_LIMIT = 6

function RecentEntry({ entry }: { entry: Entry }) {
  const swatches = entry.colors?.slice(0, RECENT_SWATCH_LIMIT) ?? []

  return (
    <li>
      <Link
        to={`/entry/${entry.id}`}
        className="flex items-center gap-2 rounded-block border border-chrome-200 px-2 py-1.5 hover:bg-chrome-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <Badge>{PLATFORM_LABEL[entry.platform]}</Badge>
        <Badge tone="accent">{entry.kind}</Badge>
        {swatches.length > 0 && (
          <span className="flex items-center gap-0.5">
            {swatches.map((hex) => (
              <span
                key={hex}
                title={hex}
                className="h-3.5 w-3.5 rounded-xs border border-chrome-200"
                style={{ backgroundColor: hex }}
              />
            ))}
          </span>
        )}
      </Link>
    </li>
  )
}

export function LandingPage() {
  const { entries } = useLibrary()
  const recent = entries.slice(0, RECENT_LIMIT)

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <p className="label-mono text-chrome-500">ui_rover</p>
        <h1 className="text-2xl font-semibold text-chrome-900">
          Paste a post. Keep the palette.
        </h1>
        <div className="flex gap-2" aria-hidden="true">
          <div className="wire h-10 w-24 rounded-block" />
          <div className="wire h-10 flex-1 rounded-block" />
          <div className="wire h-10 w-16 rounded-block" />
        </div>
      </section>

      <CaptureCard />

      {recent.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="label-mono text-chrome-600">
            Recent
          </h2>
          <ul className="flex flex-wrap gap-2">
            {recent.map((entry) => (
              <RecentEntry key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
