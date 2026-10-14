// Message keys are typed from the English files: `$t('…')` and `t('…')` with a
// key that does not exist fail the type-check.
import type { MessageSchema } from './index'

declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends MessageSchema {}
}
