import type { PermissionNode } from '@gdt/shared'
import {
  ClipboardList,
  Gem,
  HardDrive,
  History,
  LayoutDashboard,
  Package,
  ScrollText,
  Shield,
  Swords,
  Trophy,
  TrendingUp,
  Upload,
  UserCog,
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
  { name: 'account-progression', label: 'Progression', icon: TrendingUp },
  { name: 'account-characters', label: 'Characters', icon: Users, primary: true },
  { name: 'account-artifacts', label: 'Artifacts', icon: Gem, primary: true },
  { name: 'account-weapons', label: 'Weapons', icon: Swords },
  { name: 'account-materials', label: 'Materials', icon: Package, primary: true },
  { name: 'account-planner', label: 'Planner', icon: ClipboardList, primary: true },
  { name: 'account-achievements', label: 'Achievements', icon: Trophy },
  { name: 'account-snapshots', label: 'Snapshots', icon: History },
  { name: 'account-import', label: 'Import', icon: Upload },
  { name: 'account-settings', label: 'Manage', icon: UserCog },
]

export interface StaffSection extends AccountSection {
  /** The node the page needs (the Worker checks it again). */
  permission: PermissionNode
}

/** The staff dashboard's pages, shown to whoever holds their node. */
export const STAFF_SECTIONS: StaffSection[] = [
  {
    name: 'staff-overview',
    label: 'Overview',
    icon: LayoutDashboard,
    permission: 'staff.view',
    primary: true,
  },
  { name: 'staff-users', label: 'Users', icon: Users, permission: 'users.view', primary: true },
  {
    name: 'staff-storage',
    label: 'Storage',
    icon: HardDrive,
    permission: 'data.storage',
    primary: true,
  },
  { name: 'staff-roles', label: 'Roles', icon: Shield, permission: 'roles.manage' },
  { name: 'staff-audit', label: 'Audit', icon: ScrollText, permission: 'audit.view' },
]
