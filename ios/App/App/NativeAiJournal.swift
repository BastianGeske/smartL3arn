import Foundation
import CoreFoundation

// Response metadata only: no keys, questions, answers or raw error messages.
final class NativeAiJournal {
    private let directory: URL
    private let files = FileManager.default
    private(set) var persistenceError = false
    private let iso = ISO8601DateFormatter()
    init(directory: URL) { self.directory = directory }

    private func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
              n.doubleValue.isFinite, n.doubleValue >= 0 else { return nil }
        return n.doubleValue
    }
    private func count(_ value: Any?) -> Int? {
        guard let n = number(value), n.rounded() == n, n <= 9_007_199_254_740_991 else { return nil }
        return Int(n)
    }
    private func safeModel(_ value: Any?, fallback: String) -> String {
        guard let model = value as? String, model.count <= 200,
              model.range(of: "^[a-zA-Z0-9~._:-]+/[a-zA-Z0-9~./:_-]+$", options: .regularExpression) != nil,
              !model.lowercased().contains("sk-"), !model.lowercased().contains("bearer") else { return fallback }
        return model
    }
    private func append(_ entry: [String: Any], name: String, rotate: Bool = false) throws {
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent(name)
        var data = try JSONSerialization.data(withJSONObject: entry, options: [.sortedKeys])
        data.append(0x0A)
        if rotate, let size = (try? files.attributesOfItem(atPath: url.path)[.size]) as? NSNumber,
           size.intValue + data.count > 1_048_576 {
            let previous = directory.appendingPathComponent(name + ".1")
            if files.fileExists(atPath: previous.path) { try files.removeItem(at: previous) }
            try files.moveItem(at: url, to: previous)
        }
        if !files.fileExists(atPath: url.path) { try Data().write(to: url, options: .atomic) }
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    }
    func record(body: [String: Any]?, model: String, reason: String?, status: Int?,
                durationMs: Int, operation: String, credentialSource: String?) {
        let timestamp = iso.string(from: Date())
        let actualModel = safeModel(body?["model"], fallback: safeModel(model, fallback: "openrouter/free"))
        do {
            if operation == "evaluate" {
                let usage = body?["usage"] as? [String: Any] ?? [:]
                let input = count(usage["prompt_tokens"]), output = count(usage["completion_tokens"])
                let total = count(usage["total_tokens"]) ?? (input != nil && output != nil ? input! + output! : nil)
                try append([
                    "timestamp": timestamp, "model": actualModel, "outcome": reason == nil ? "success" : "failure",
                    "inputTokens": input as Any? ?? NSNull(), "outputTokens": output as Any? ?? NSNull(),
                    "totalTokens": total as Any? ?? NSNull(),
                    "cachedTokens": count((usage["prompt_tokens_details"] as? [String: Any])?["cached_tokens"]) as Any? ?? NSNull(),
                    "reasoningTokens": count((usage["completion_tokens_details"] as? [String: Any])?["reasoning_tokens"]) as Any? ?? NSNull(),
                    "costUsd": number(usage["cost"]) as Any? ?? NSNull()
                ], name: "api-usage.jsonl")
            }
            var log: [String: Any] = ["timestamp": timestamp, "model": actualModel,
                "event": reason == nil ? "request-success" : "request-failure",
                "operation": operation, "durationMs": max(0, durationMs)]
            let reasons = ["auth", "credits", "forbidden", "model-unavailable", "timeout", "rate-limit", "unavailable", "invalid-response"]
            if let reason = reason, reasons.contains(reason) { log["reason"] = reason }
            if let status = status, (100...599).contains(status) { log["status"] = status }
            if let source = credentialSource, ["stored", "bundled", "provided"].contains(source) { log["credentialSource"] = source }
            try append(log, name: "openrouter-debug.jsonl", rotate: true)
        } catch { persistenceError = true }
    }
    private func read(_ name: String) -> (entries: [[String: Any]], invalid: Int) {
        let url = directory.appendingPathComponent(name)
        guard files.fileExists(atPath: url.path) else { return ([], 0) }
        guard let text = try? String(contentsOf: url, encoding: .utf8) else {
            persistenceError = true
            return ([], 1)
        }
        var entries: [[String: Any]] = [], invalid = 0
        for line in text.split(separator: "\n") {
            guard let data = String(line).data(using: .utf8),
                  let entry = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let timestamp = entry["timestamp"] as? String, iso.date(from: timestamp) != nil else {
                invalid += 1
                continue
            }
            entries.append(entry)
        }
        return (entries, invalid)
    }
    func report(model: String) -> [String: Any] {
        let journal = read("api-usage.jsonl")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        var groups: [String: [String: Any]] = [:], invalid = journal.invalid
        for entry in journal.entries {
            guard let date = iso.date(from: entry["timestamp"] as? String ?? ""),
                  let model = entry["model"] as? String,
                  ["success", "failure"].contains(entry["outcome"] as? String ?? "") else {
                invalid += 1
                continue
            }
            let day = formatter.string(from: date), key = formatter.string(from: date) + ":" + model
            var group = groups[key] ?? ["day": day, "model": model,
                "requests": 0, "successes": 0, "failures": 0, "inputTokens": 0, "outputTokens": 0,
                "totalTokens": 0, "cachedTokens": 0, "reasoningTokens": 0, "tokenRequests": 0,
                "costRequests": 0, "costUsd": 0.0]
            func increment(_ field: String, by amount: Int = 1) { group[field] = (group[field] as? Int ?? 0) + amount }
            increment("requests")
            increment(entry["outcome"] as? String == "success" ? "successes" : "failures")
            for field in ["inputTokens", "outputTokens", "totalTokens", "cachedTokens", "reasoningTokens"] {
                increment(field, by: count(entry[field]) ?? 0)
            }
            if count(entry["inputTokens"]) != nil && count(entry["outputTokens"]) != nil { increment("tokenRequests") }
            if let cost = number(entry["costUsd"]) {
                increment("costRequests")
                group["costUsd"] = (group["costUsd"] as? Double ?? 0) + cost
            }
            groups[key] = group
        }
        let sorted = groups.values.sorted {
            let left = $0["day"] as? String ?? "", right = $1["day"] as? String ?? ""
            return left == right ? ($0["model"] as? String ?? "") < ($1["model"] as? String ?? "") : left > right
        }
        return ["model": model, "groups": sorted, "persistenceError": persistenceError, "unreadableEntries": invalid]
    }
    func diagnostics() -> [String: Any] {
        let previous = read("openrouter-debug.jsonl.1"), current = read("openrouter-debug.jsonl")
        let lines = (previous.entries + current.entries).compactMap { entry -> String? in
            var safe: [String: Any] = ["timestamp": entry["timestamp"]!]
            let model = safeModel(entry["model"], fallback: "")
            if !model.isEmpty { safe["model"] = model }
            let allowed = [
                "event": ["request-success", "request-failure"],
                "operation": ["evaluate", "validate-key"],
                "credentialSource": ["stored", "bundled", "provided"],
                "reason": ["auth", "credits", "forbidden", "model-unavailable", "timeout", "rate-limit", "unavailable", "invalid-response"]
            ]
            for (field, values) in allowed {
                if let value = entry[field] as? String, values.contains(value) { safe[field] = value }
            }
            if let duration = count(entry["durationMs"]) { safe["durationMs"] = duration }
            if let status = count(entry["status"]), (100...599).contains(status) { safe["status"] = status }
            guard let data = try? JSONSerialization.data(withJSONObject: safe, options: [.sortedKeys]) else { return nil }
            return String(data: data, encoding: .utf8)
        }
        return ["filename": "smartL3arn-openrouter-\(iso.string(from: Date()).prefix(10)).jsonl",
            "content": lines.isEmpty ? "" : lines.joined(separator: "\n") + "\n",
            "persistenceError": persistenceError || previous.invalid > 0 || current.invalid > 0]
    }
    static func evaluationIsValid(_ body: [String: Any]?) -> Bool {
        guard let choice = (body?["choices"] as? [[String: Any]])?.first,
              choice["error"] == nil, let message = choice["message"] as? [String: Any],
              let content = message["content"] as? String, let data = content.data(using: .utf8),
              let evaluation = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let verdict = evaluation["verdict"] as? String,
              ["correct", "mostly_correct", "partially_correct", "incorrect"].contains(verdict),
              let feedback = evaluation["feedback"] as? String,
              !feedback.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return true
    }
}
