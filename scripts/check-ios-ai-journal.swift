import Foundation

@main
struct CheckAiJournal {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("smartl3arn-journal-test-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let journal = NativeAiJournal(directory: root)
        var checks = 0
        func expect(_ condition: Bool, _ message: String) {
            precondition(condition, message)
            checks += 1
        }
        let input: [String: Any] = ["deckName": "Test", "question": "Question", "referenceAnswer": "Reference", "userAnswer": "Answer", "language": "de", "max_tokens": 999999, "model": "untrusted/model"]
        let request = NativeAiEvaluationRequest.body(input: input, model: "trusted/model")!
        expect(request["max_tokens"] as? Int == 4096, "native token limit cannot be overridden")
        expect(request["model"] as? String == "trusted/model", "native model cannot be overridden")
        expect((request["messages"] as? [[String: String]])?.first?["content"]?.contains("German") == true, "native language selection")
        expect(NativeAiEvaluationRequest.body(input: ["body": request], model: "trusted/model") == nil, "arbitrary API body rejected")
        var oversized = input
        oversized["question"] = String(repeating: "x", count: 4001)
        expect(NativeAiEvaluationRequest.body(input: oversized, model: "trusted/model") == nil, "native field limit")
        oversized["question"] = String(repeating: "😀", count: 2001)
        expect(NativeAiEvaluationRequest.body(input: oversized, model: "trusted/model") == nil, "native UTF16 field limit matches JS")
        func record(_ body: [String: Any]?, reason: String? = nil, operation: String = "evaluate") {
            journal.record(body: body, model: "test/model", reason: reason, status: 200,
                durationMs: 50, operation: operation, credentialSource: "bundled")
        }
        let valid: [String: Any] = ["choices": [["message": ["content": "{\"verdict\":\"correct\",\"feedback\":\"Richtig\"}"]]]]
        expect(NativeAiJournal.evaluationIsValid(valid), "valid evaluation")
        expect(!NativeAiJournal.evaluationIsValid(["choices": []]), "missing evaluation rejected")
        expect(!NativeAiJournal.evaluationIsValid(["choices": [["message": ["content": "{\"verdict\":\"correct\",\"feedback\":\" \"}"]]]]), "empty feedback rejected")
        record(["model": "test/model", "apiKey": "SECRET", "choices": "PRIVATE ANSWER",
            "usage": ["prompt_tokens": 100, "completion_tokens": 20, "cost": 0.002,
                "prompt_tokens_details": ["cached_tokens": 50], "completion_tokens_details": ["reasoning_tokens": 10]]])
        record(["usage": ["cost": 0.001]], reason: "invalid-response")
        record(nil, reason: "timeout")
        record(["usage": ["prompt_tokens": 0, "completion_tokens": 0, "cost": 0]])
        record(["usage": ["cost": "0", "prompt_tokens": true, "completion_tokens": -1]])
        record(nil, operation: "validate-key")
        let report = NativeAiJournal(directory: root).report(model: "configured/model")
        let groups = report["groups"] as! [[String: Any]]
        let group = groups[0]
        expect(report["model"] as? String == "configured/model", "configured model")
        expect(groups.count == 1, "groups per actual model and local day")
        expect(group["requests"] as? Int == 5, "validation excluded; requests persist after restart")
        expect(group["successes"] as? Int == 3 && group["failures"] as? Int == 2, "failed checks counted")
        expect(group["totalTokens"] as? Int == 120, "tokens do not double-count cache or reasoning")
        expect(group["cachedTokens"] as? Int == 50 && group["reasoningTokens"] as? Int == 10, "subsets recorded")
        expect(group["tokenRequests"] as? Int == 2, "unknown invalid and boolean counts excluded")
        expect(group["costRequests"] as? Int == 3, "free known; unknown excluded")
        expect(abs((group["costUsd"] as! Double) - 0.003) < 0.0000001, "cost of malformed output retained")
        let raw = try String(contentsOf: root.appendingPathComponent("api-usage.jsonl"), encoding: .utf8)
        let logs = journal.diagnostics()["content"] as! String
        expect(!raw.contains("SECRET") && !raw.contains("PRIVATE ANSWER"), "usage privacy")
        expect(!logs.contains("SECRET") && !logs.contains("PRIVATE ANSWER"), "diagnostics privacy")
        expect(logs.contains("timeout") && logs.contains("invalid-response"), "failure diagnostics")
        let logUrl = root.appendingPathComponent("openrouter-debug.jsonl")
        try "{\"timestamp\":\"2026-10-04T10:00:00Z\",\"model\":\"sk-or-v1-secret\",\"reason\":\"secret-key\",\"apiKey\":\"secret-key\"}\n".write(to: logUrl, atomically: true, encoding: .utf8)
        expect(!(journal.diagnostics()["content"] as! String).contains("secret"), "export sanitizes historical values")
        try String(repeating: " ", count: 1_048_576).write(to: logUrl, atomically: true, encoding: .utf8)
        record(nil, reason: "timeout", operation: "validate-key")
        expect(FileManager.default.fileExists(atPath: logUrl.path + ".1"), "diagnostic logs rotate")
        try (raw + "interrupted-row\n").write(to: root.appendingPathComponent("api-usage.jsonl"), atomically: true, encoding: .utf8)
        expect(journal.report(model: "test/model")["unreadableEntries"] as? Int == 1, "corrupt rows reported")
        let blocked = root.appendingPathComponent("not-a-directory")
        try Data().write(to: blocked)
        let broken = NativeAiJournal(directory: blocked)
        broken.record(body: nil, model: "test/model", reason: "timeout", status: nil, durationMs: 1, operation: "evaluate", credentialSource: nil)
        expect(broken.report(model: "test/model")["persistenceError"] as? Bool == true, "storage failure visible")
        print("Native iOS AI journal: \(checks) checks passed.")
    }
}
