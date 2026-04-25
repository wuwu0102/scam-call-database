import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var statusManager: CallDirectoryStatusManager
    @EnvironmentObject private var reloadManager: CallDirectoryReloadManager

    @State private var importResultMessage: String = ""

    private var extensionInstructions: String {
        "Enable caller ID at: Settings > Apps > Phone > Call Blocking & Identification > Scam Caller ID"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Scam Caller ID")
                        .font(.largeTitle.bold())

                    Text("MVP host app for Apple Call Directory Extension. Uses local JSON data for caller identification labels.")
                        .foregroundStyle(.secondary)

                    GroupBox("Extension status") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(statusManager.statusText)
                            if let lastCheckedAt = statusManager.lastCheckedAt {
                                Text("Last checked: \(lastCheckedAt.formatted(date: .abbreviated, time: .standard))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button("Refresh extension status") {
                        Task { await statusManager.refreshStatus() }
                    }
                    .buttonStyle(.bordered)

                    Button("Reload caller ID database") {
                        Task {
                            await reloadManager.reloadExtension()
                            await statusManager.refreshStatus()
                        }
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Import bundled ios_numbers.json into shared app group") {
                        do {
                            try SharedPhoneNumberStore.copyBundledFallbackToSharedContainer()
                            importResultMessage = "Imported ios_numbers.json into shared app group container."
                        } catch {
                            importResultMessage = "Import failed: \(error.localizedDescription)"
                        }
                    }
                    .buttonStyle(.bordered)

                    if !importResultMessage.isEmpty {
                        Text(importResultMessage)
                            .font(.caption)
                    }

                    GroupBox("Enable guidance") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(extensionInstructions)

                            Button("Open Settings app") {
                                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                                UIApplication.shared.open(url)
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    GroupBox("Logs") {
                        if reloadManager.logs.isEmpty {
                            Text("No logs yet")
                                .foregroundStyle(.secondary)
                        } else {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(reloadManager.logs.reversed(), id: \.self) { log in
                                    Text(log)
                                        .font(.caption.monospaced())
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Caller ID MVP")
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(CallDirectoryStatusManager())
        .environmentObject(CallDirectoryReloadManager())
}
