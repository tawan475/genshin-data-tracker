import {
  FileDown,
  Gem,
  History,
  LayoutDashboard,
  Package,
  Swords,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-vue-next'

export interface NavItem {
  name: string
  label: string
  /** Mobile tab bar label, when `label` is too long. */
  short?: string
  icon: LucideIcon
  /** Shown in the mobile tab bar (the rest live under "More"). */
  primary?: boolean
}

/** The original sidebar's "User" section. */
export const USER_SECTIONS: NavItem[] = [
  { name: 'home', label: 'Overview', icon: LayoutDashboard },
  { name: 'accounts', label: 'Accounts & Keys', icon: Users },
]

/** The sections of one Genshin account, in the original sidebar's order. */
export const ACCOUNT_SECTIONS: NavItem[] = [
  { name: 'account-overview', label: 'Overview', icon: LayoutDashboard, primary: true },
  {
    name: 'account-progression',
    label: 'Detailed Progression',
    short: 'Progression',
    icon: TrendingUp,
    primary: true,
  },
  { name: 'account-snapshots', label: 'Snapshots', icon: History },
  { name: 'account-characters', label: 'Characters', icon: Users },
  { name: 'account-artifacts', label: 'Artifacts', icon: Gem, primary: true },
  { name: 'account-weapons', label: 'Weapons', icon: Swords },
  { name: 'account-materials', label: 'Materials', icon: Package, primary: true },
  { name: 'account-export', label: 'Export', icon: FileDown },
]
