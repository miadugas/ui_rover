export interface DeviceFrameProps {
  src: string | null
  alt: string
  className?: string
}

/**
 * Phone silhouette for design entries. The chrome is drawn from chrome tokens
 * only — never palette colors — so a saved screenshot reads true inside it.
 */
export function DeviceFrame({ src, alt, className = '' }: DeviceFrameProps) {
  return (
    <div
      className={`w-[320px] max-w-full overflow-hidden rounded-[1.75rem] border-2 border-chrome-300 bg-chrome-0 p-2 ${className}`}
    >
      <div className="flex justify-center py-2">
        <span aria-hidden className="block h-1.5 w-16 rounded-full bg-chrome-400" />
      </div>
      {src ? (
        <img src={src} alt={alt} className="w-full rounded-block object-contain" />
      ) : (
        <div className="wire flex h-96 items-center justify-center rounded-block">
          <span className="label-mono text-chrome-400">loading</span>
        </div>
      )}
    </div>
  )
}
