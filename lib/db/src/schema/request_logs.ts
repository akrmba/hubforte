import { pgTable, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'

export const requestLogs = pgTable('request_logs', {
  id:          text('id').primaryKey(),
  requestId:   text('request_id').notNull(),
  tenantId:    text('tenant_id'),    // which tenant made the request — required for founder incident model
  method:      text('method').notNull(),
  path:        text('path').notNull(),
  statusCode:  integer('status_code'),
  durationMs:  integer('duration_ms'),
  userId:      text('user_id'),
  slowRequest: boolean('slow_request').default(false),
  isError:     boolean('is_error').default(false),
  isCritical:  boolean('is_critical').default(false),
  timestamp:   timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
  idxTimestamp:   index('request_logs_timestamp_idx').on(table.timestamp),
  idxStatusCode:  index('request_logs_status_code_idx').on(table.statusCode),
  idxUserId:      index('request_logs_user_id_idx').on(table.userId),
  idxTenantId:    index('request_logs_tenant_id_idx').on(table.tenantId),
  idxSlowRequest: index('request_logs_slow_request_idx').on(table.slowRequest),
}))
