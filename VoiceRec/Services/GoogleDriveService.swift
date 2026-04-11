import Foundation
import GoogleSignIn

@MainActor
class GoogleDriveService: ObservableObject {
    @Published var isSignedIn = false
    @Published var isUploading = false
    @Published var uploadProgress: Double = 0
    @Published var currentUser: GIDGoogleUser?

    private let driveAPIBase = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
    private let driveScope = "https://www.googleapis.com/auth/drive.file"

    init() {
        restoreSignIn()
    }

    private func restoreSignIn() {
        GIDSignIn.sharedInstance.restorePreviousSignIn { [weak self] user, error in
            Task { @MainActor in
                self?.currentUser = user
                self?.isSignedIn = user != nil
            }
        }
    }

    func signIn(presenting viewController: UIViewController) async throws {
        let result = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: viewController,
            hint: nil,
            additionalScopes: [driveScope]
        )
        currentUser = result.user
        isSignedIn = true
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        currentUser = nil
        isSignedIn = false
    }

    func uploadFile(url: URL, fileName: String) async throws -> String {
        guard let user = currentUser else {
            throw DriveError.notSignedIn
        }

        // Refresh token if needed
        try await user.refreshTokensIfNeeded()
        guard let accessToken = user.accessToken.tokenString as String? else {
            throw DriveError.tokenError
        }

        isUploading = true
        uploadProgress = 0
        defer { isUploading = false }

        let fileData = try Data(contentsOf: url)
        let metadata = """
        {
            "name": "\(fileName)",
            "parents": []
        }
        """.data(using: .utf8)!

        let boundary = "VoiceRecBoundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/json; charset=UTF-8\r\n\r\n".data(using: .utf8)!)
        body.append(metadata)
        body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--".data(using: .utf8)!)

        var request = URLRequest(url: URL(string: driveAPIBase)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/related; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown"
            throw DriveError.uploadFailed(msg)
        }

        uploadProgress = 1.0

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let fileId = json["id"] as? String {
            return "https://drive.google.com/file/d/\(fileId)/view"
        }
        return "アップロード完了"
    }

    enum DriveError: LocalizedError {
        case notSignedIn
        case tokenError
        case uploadFailed(String)

        var errorDescription: String? {
            switch self {
            case .notSignedIn: return "Google アカウントにサインインしてください"
            case .tokenError: return "認証トークンの取得に失敗しました"
            case .uploadFailed(let msg): return "アップロードに失敗しました: \(msg)"
            }
        }
    }
}
