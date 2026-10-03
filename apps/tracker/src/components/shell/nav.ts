import {
  Gem,
  History,
  LayoutDashboard,
  Package,
  Settings,
  Swords,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-vue-next'

export interface AccountSection {
  name: string
  label: string
  icon: LucideIcon
  /** Shown in the mobile tab bar (the rest live under "More"). */
  primary?: boolean
}

/** The sections of one Genshin account, in navigation order. */
export const ACCOUNT_SECTIONS: AccountSection[] = [
  { name: 'account-overview', label: 'Overview', icon: LayoutDashboard, primary: true },
  { name: 'account-characters', label: 'Characters', icon: Users, primary: true },
  { name: 'account-artifacts', label: 'Artifacts', icon: Gem, primary: true },
  { name: 'account-weapons', label: 'Weapons', icon: Swords },
  { name: 'account-materials', label: 'Materials', icon: Package, primary: true },
  { name: 'account-snapshots', label: 'Snapshots', icon: History },
  { name: 'account-import', label: 'Import', icon: Upload },
  { name: 'account-settings', label: 'Manage', icon: Settings },
]
