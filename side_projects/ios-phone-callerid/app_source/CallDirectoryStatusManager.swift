import CallKit
import Foundation

@MainActor
final class CallDirectoryStatusManager: ObservableObject {
    @Published private(set) var statusText: String = "Unknown"
    @Published private(set) var lastCheckedAt: Date?

    // REPLACE with your real extension bundle identifier.
    private let extensionIdentifier = "com.wuwu0102.scamcall.CallDirectoryExtension"

    func refreshStatus() async {
        let manager = CXCallDirectoryManager.sharedInstance

        do {
            let enabled = try await manager.enabledStatus(forExtensionWithIdentifier: extensionIdentifier)
            switch enabled {
            case .enabled:
                statusText = "Enabled"
            case .disabled:
                statusText = "Disabled (enable in Settings > Phone > Call Blocking & Identification)"
            case .unknown:
                statusText = "Unknown"
            @unknown default:
                statusText = "Unknown future status"
            }
        } catch {
            statusText = "Status check failed: \(error.localizedDescription)"
        }

        lastCheckedAt = Date()
    }
}
