import UIKit
import Capacitor
import Security

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let appWindow = UIWindow(windowScene: windowScene)
        appWindow.rootViewController = SmartL3arnViewController()
        window = appWindow
        appWindow.makeKeyAndVisible()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [
                .openInPlace: context.options.openInPlace
            ]

            if let sourceApplication = context.options.sourceApplication {
                options[.sourceApplication] = sourceApplication
            }

            if let annotation = context.options.annotation {
                options[.annotation] = annotation
            }

            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: context.url,
                options: options
            )
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}

class SmartL3arnViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAiPlugin())
    }
}

@objc(NativeAiPlugin)
class NativeAiPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativeAiPlugin"
    let jsName = "NativeAi"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAiStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveOpenRouterKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeOpenRouterKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getApiUsage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAiDiagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "evaluateAnswer", returnType: CAPPluginReturnPromise)
    ]

    private let requestLock = NSLock()
    private var activeRequests = 0

    private lazy var journal = NativeAiJournal(directory:
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("smartL3arn-AI", isDirectory: true))
    private var configuredModel: String { privateBuildConfig["OPENROUTER_MODEL"] ?? "openrouter/free" }
    private var credentialSource: String? { readKey() != nil ? "stored" : (bundledKey != nil ? "bundled" : nil) }

    @objc func getApiUsage(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.journal.report(model: self.configuredModel)) }
    }
    @objc func getAiDiagnostics(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.journal.diagnostics()) }
    }

    private var keyQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.smartl3arn.app.openrouter",
         kSecAttrAccount as String: "api-key"]
    }

    private func readKey() -> String? {
        var query = keyQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private var privateBuildConfig: [String: String] {
        #if DEBUG
        guard let url = Bundle.main.url(forResource: "openrouter-private-build", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let config = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
        else { return [:] }
        return config
        #else
        return [:]
        #endif
    }

    private var bundledKey: String? {
        guard let key = privateBuildConfig["OPENROUTER_API_KEY"]?
            .trimmingCharacters(in: .whitespacesAndNewlines), !key.isEmpty else { return nil }
        return key
    }

    @objc func getAiStatus(_ call: CAPPluginCall) {
        let source = credentialSource
        let configured = source != nil
        call.resolve(["available": true, "configured": configured,
                      "credentialSource": source as Any? ?? NSNull(), "model": configuredModel])
    }

    @objc func saveOpenRouterKey(_ call: CAPPluginCall) {
        guard let key = call.getString("apiKey")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !key.isEmpty, key.count <= 4000 else {
            call.resolve(["ok": false, "reason": "invalid-input"])
            return
        }
        send(key: key, endpoint: "key", body: nil) { body, reason in
            guard reason == nil else {
                call.resolve(["ok": false, "reason": reason!])
                return
            }
            let attributes: [String: Any] = [kSecValueData as String: Data(key.utf8)]
            var status = SecItemUpdate(self.keyQuery as CFDictionary, attributes as CFDictionary)
            if status == errSecItemNotFound {
                var query = self.keyQuery
                query[kSecValueData as String] = Data(key.utf8)
                query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                status = SecItemAdd(query as CFDictionary, nil)
            }
            call.resolve(status == errSecSuccess ? ["ok": true]
                : ["ok": false, "reason": "secure-storage-unavailable"])
        }
    }

    @objc func removeOpenRouterKey(_ call: CAPPluginCall) {
        let status = SecItemDelete(keyQuery as CFDictionary)
        call.resolve(["ok": status == errSecSuccess || status == errSecItemNotFound])
    }

    @objc func evaluateAnswer(_ call: CAPPluginCall) {
        guard let key = readKey() ?? bundledKey else {
            call.resolve(["ok": false, "reason": "not-configured"])
            return
        }
        let input: [String: Any] = [
            "deckName": call.getString("deckName") as Any? ?? NSNull(),
            "question": call.getString("question") as Any? ?? NSNull(),
            "referenceAnswer": call.getString("referenceAnswer") as Any? ?? NSNull(),
            "userAnswer": call.getString("userAnswer") as Any? ?? NSNull(),
            "language": call.getString("language") ?? "en"
        ]
        guard let body = NativeAiEvaluationRequest.body(input: input, model: configuredModel),
              let data = try? JSONSerialization.data(withJSONObject: body), data.count <= 64000 else {
            call.resolve(["ok": false, "reason": "invalid-input"])
            return
        }
        send(key: key, endpoint: "chat/completions", body: data) { body, reason in
            if let reason = reason { call.resolve(["ok": false, "reason": reason]) }
            else { call.resolve(["ok": true, "body": body ?? [:]]) }
        }
    }

    private func send(key: String, endpoint: String, body: Data?,
                      completion: @escaping ([String: Any]?, String?) -> Void) {
        requestLock.lock()
        guard activeRequests < 2 else {
            requestLock.unlock()
            completion(nil, "rate-limit")
            return
        }
        activeRequests += 1
        requestLock.unlock()
        var request = URLRequest(url: URL(string: "https://openrouter.ai/api/v1/" + endpoint)!)
        request.timeoutInterval = 60
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpBody = body
        request.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("smartL3arn", forHTTPHeaderField: "X-Title")
        let started = Date()
        let operation = endpoint == "key" ? "validate-key" : "evaluate"
        let source = operation == "validate-key" ? "provided" : credentialSource
        let model = configuredModel
        URLSession.shared.dataTask(with: request) { data, response, error in
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            var reason: String?
            if let error = error as? URLError {
                reason = error.code == .timedOut ? "timeout" : "unavailable"
            } else if error != nil { reason = "unavailable" }
            else if let response = response as? HTTPURLResponse {
                let apiError = json?["error"] as? [String: Any]
                let status = (apiError?["code"] as? Int) ?? response.statusCode
                switch status {
                case 401: reason = "auth"
                case 402: reason = "credits"
                case 403: reason = "forbidden"
                case 404: reason = "model-unavailable"
                case 408, 504: reason = "timeout"
                case 429: reason = "rate-limit"
                case 200..<300: reason = apiError == nil ? nil : "unavailable"
                default: reason = "unavailable"
                }
                if json == nil && reason == nil { reason = "invalid-response" }
            } else { reason = "unavailable" }
            if reason == nil && operation == "evaluate" && !NativeAiJournal.evaluationIsValid(json) {
                reason = "invalid-response"
            }
            let resultReason = reason
            let status = (response as? HTTPURLResponse)?.statusCode
            let duration = Int(Date().timeIntervalSince(started) * 1000)
            self.requestLock.lock()
            self.activeRequests -= 1
            self.requestLock.unlock()
            DispatchQueue.main.async {
                self.journal.record(body: json, model: model, reason: resultReason, status: status,
                    durationMs: duration, operation: operation, credentialSource: source)
                completion(json, resultReason)
            }
        }.resume()
    }
}
