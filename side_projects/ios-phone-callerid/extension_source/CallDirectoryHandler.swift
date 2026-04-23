import CallKit
import Foundation

final class CallDirectoryHandler: CXCallDirectoryProvider {
    override func beginRequest(with context: CXCallDirectoryExtensionContext) {
        context.delegate = self

        do {
            let data = try loadJSONData()
            let entries = try PhoneNumberParser.parseValidSortedEntries(from: data)

            for entry in entries {
                context.addIdentificationEntry(withNextSequentialPhoneNumber: entry.number, label: entry.label)
            }

            context.completeRequest()
        } catch {
            let nsError = error as NSError
            context.cancelRequest(withError: nsError)
        }
    }

    private func loadJSONData() throws -> Data {
        if let sharedURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: ExtensionConstants.appGroupIdentifier)?
            .appendingPathComponent(ExtensionConstants.sharedJSONFileName),
           FileManager.default.fileExists(atPath: sharedURL.path) {
            return try Data(contentsOf: sharedURL)
        }

        guard let bundledURL = Bundle.main.url(forResource: ExtensionConstants.bundledFallbackJSONName, withExtension: "json") else {
            throw ExtensionDataError.missingBundledFallback
        }

        return try Data(contentsOf: bundledURL)
    }
}

extension CallDirectoryHandler: CXCallDirectoryExtensionContextDelegate {
    func requestFailed(for extensionContext: CXCallDirectoryExtensionContext, withError error: Error) {
        NSLog("Call directory request failed: \(error.localizedDescription)")
    }
}

enum ExtensionDataError: LocalizedError {
    case missingBundledFallback

    var errorDescription: String? {
        switch self {
        case .missingBundledFallback:
            return "Bundled fallback JSON missing from Call Directory Extension target."
        }
    }
}
