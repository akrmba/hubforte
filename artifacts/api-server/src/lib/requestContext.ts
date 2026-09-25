import { AsyncLocalStorage } from 'async_hooks'

interface RequestContext {
  requestId: string
  userId?: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export const getRequestId = (): string =>
  requestContext.getStore()?.requestId ?? 'no-context'

export const getContextUserId = (): string | undefined =>
  requestContext.getStore()?.userId
