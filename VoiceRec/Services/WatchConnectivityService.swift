import WatchConnectivity
import Foundation
import Combine

class WatchConnectivityService: NSObject, ObservableObject {
    @Published var receivedRecordings: [URL] = []
    @Published var isReachable = false

    var onFileReceived: ((URL, String) -> Void)?

    static let shared = WatchConnectivityService()

    override init() {
        super.init()
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }
}

extension WatchConnectivityService: WCSessionDelegate {
    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        let tempURL = file.fileURL
        let fileName = file.metadata?["fileName"] as? String ?? "録音_\(Date().timeIntervalSince1970).m4a"
        let destURL = Recording.recordingsDirectory.appendingPathComponent(fileName)

        do {
            if FileManager.default.fileExists(atPath: destURL.path) {
                try FileManager.default.removeItem(at: destURL)
            }
            try FileManager.default.copyItem(at: tempURL, to: destURL)
            DispatchQueue.main.async {
                self.onFileReceived?(destURL, fileName)
            }
        } catch {
            print("Failed to save received file: \(error)")
        }
    }
}
