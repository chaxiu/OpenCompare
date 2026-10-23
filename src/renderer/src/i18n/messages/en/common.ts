import { common as zhCommon } from '../zh/common'

/** Mirrors `zh/common.ts` key for key; a missing or extra key fails typecheck. */
export const common: Record<keyof typeof zhCommon, string> = {
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.retry': 'Try again',
  'common.dismiss': 'Dismiss',
  'common.loading': 'Loading…',
  'common.error.title': 'Something went wrong',
  'common.error.unknown': 'Unknown error',
  'common.itemCount': '{count} items'
}
