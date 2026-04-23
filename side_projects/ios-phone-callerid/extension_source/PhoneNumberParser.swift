import CallKit
import Foundation

struct ParsedPhoneNumberEntry: Hashable {
    let number: CXCallDirectoryPhoneNumber
    let label: String
}

enum PhoneNumberParser {
    static func parseValidSortedEntries(from data: Data) throws -> [ParsedPhoneNumberEntry] {
        let decoder = JSONDecoder()
        let rows = try decoder.decode([PhoneNumberRecord].self, from: data)

        var unique: [Int64: String] = [:]

        for row in rows {
            let cleanLabel = row.label.trimmingCharacters(in: .whitespacesAndNewlines)
            guard row.number > 0 else { continue }
            guard !cleanLabel.isEmpty else { continue }
            unique[row.number] = cleanLabel
        }

        return unique
            .map { ParsedPhoneNumberEntry(number: CXCallDirectoryPhoneNumber($0.key), label: $0.value) }
            .sorted { $0.number < $1.number }
    }
}
