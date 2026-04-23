import CallKit
import Foundation

@MainActor
final class CallDirectoryReloadManager: ObservableObject {
    @Published private(set) var logs: [String] = []

    // REPLACE with your real extension bundle identifier.
    private let extensionIdentifier = "com.wuwu0102.scamcall.CallDirectoryExtension"

    func reloadExtension() async {
        appendLog("Starting reload request")

        do {
            try await CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: extensionIdentifier)
            appendLog("Reload completed successfully")
        } catch {
            appendLog("Reload failed: \(error.localizedDescription)")
        }
    }

    private func appendLog(_ message: String) {
        let timestamp = Date().formatted(date: .omitted, time: .standard)
        logs.append("[\(timestamp)] \(message)")
    }
}
