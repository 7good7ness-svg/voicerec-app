import WatchConnectivity
import Foundation

class WatchConnectivityService: NSObject, ObservableObject {
    @Published var isReachable = false
    @Published var transferProgress: Double = 0
    @Published var isTransferring = false
    @Published var lastTransferStatus: String?

    static let shared = WatchConnectivityService()

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func sendRecording(url: URL) {
        guard WCSession.default.activationState == .activated else {
            lastTransferStatus = "iPhoneに接続されていません"
            return
        }

        isTransferring = true
        let metadata: [String: Any] = ["fileName": url.lastPathComponent]
        WCSession.default.transferFile(url, metadata: metadata)
        lastTransferStatus = "転送中..."
    }
}

extension WatchConnectivityService: WCSessionDelegate {
    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        DispatchQueue.main.async {
            self.isTransferring = false
            if let error = error {
                self.lastTransferStatus = "転送失敗: \(error.localizedDescription)"
            } else {
                self.lastTransferStatus = "転送完了"
            }
        }
    }
}
