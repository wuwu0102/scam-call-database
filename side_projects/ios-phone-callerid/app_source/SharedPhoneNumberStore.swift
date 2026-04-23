import Foundation

struct SharedPhoneNumberStore {
    // REPLACE with your real app group identifier.
    static let appGroupIdentifier = "group.com.wuwu0102.scamcall"
    static let sharedJSONFileName = "phone_numbers.json"
    static let bundledFallbackJSONName = "phone_numbers_sample"

    static func sharedJSONFileURL() throws -> URL {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
            throw SharedStoreError.missingSharedContainer
        }

        return containerURL.appendingPathComponent(sharedJSONFileName)
    }

    static func copyBundledFallbackToSharedContainer() throws {
        guard let bundledURL = Bundle.main.url(forResource: bundledFallbackJSONName, withExtension: "json") else {
            throw SharedStoreError.missingBundledFallback
        }

        let destinationURL = try sharedJSONFileURL()
        let data = try Data(contentsOf: bundledURL)
        try data.write(to: destinationURL, options: .atomic)
    }

    static func importJSON(from sourceURL: URL) throws {
        let destinationURL = try sharedJSONFileURL()
        let data = try Data(contentsOf: sourceURL)
        try data.write(to: destinationURL, options: .atomic)
    }
}

enum SharedStoreError: LocalizedError {
    case missingSharedContainer
    case missingBundledFallback

    var errorDescription: String? {
        switch self {
        case .missingSharedContainer:
            return "Shared app group container not available. Check app group entitlement configuration."
        case .missingBundledFallback:
            return "Bundled fallback JSON file is missing from the host app target."
        }
    }
}
