/** Inert service provider for the session telemetry capability. @module @deepseek-ai/dsh-session-telemetry-disabled */

import {
  SessionTelemetryBackend,
  type SessionTelemetryRecord,
  type SessionTelemetrySharingStatus,
} from '@deepseek-ai/dsh-session-telemetry'

/** Session telemetry backend that retains every telemetry record in the local process. */
export default class DisabledSessionTelemetryBackend extends SessionTelemetryBackend {
  override readonly sharing: SessionTelemetrySharingStatus = 'disabled'

  emit(_record: SessionTelemetryRecord): void {}

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}
