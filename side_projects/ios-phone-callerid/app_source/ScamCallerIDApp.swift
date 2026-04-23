import SwiftUI

@main
struct ScamCallerIDApp: App {
    @StateObject private var statusManager = CallDirectoryStatusManager()
    @StateObject private var reloadManager = CallDirectoryReloadManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(statusManager)
                .environmentObject(reloadManager)
                .task {
                    await statusManager.refreshStatus()
                }
        }
    }
}
