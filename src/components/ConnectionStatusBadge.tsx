import { Wifi, WifiOff } from 'lucide-react'

interface Props {
  connected: boolean | null
  compact?: boolean
  onClick?: () => void
}

export default function ConnectionStatusBadge({ connected, compact, onClick }: Props) {
  const color = connected === null ? 'text-gray-400' : connected ? 'text-emerald-500' : 'text-red-500'
  const bgPulse = connected === null ? '' : connected ? '' : 'animate-pulse'
  const label = connected === null ? 'Checking...' : connected ? 'POS Connected' : 'POS Offline'
  const Icon = connected === false ? WifiOff : Wifi

  if (compact) {
    return (
      <button onClick={onClick} className={`p-1.5 rounded-full hover:bg-gray-100 transition-colors ${color} ${bgPulse}`} aria-label={label} title={label}>
        <Icon size={16} />
      </button>
    )
  }

  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 text-[11px] font-medium ${color} ${bgPulse}`} title={label}>
      <Icon size={12} />
      <span>{label}</span>
    </button>
  )
}
