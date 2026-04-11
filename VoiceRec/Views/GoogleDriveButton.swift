import SwiftUI
import GoogleSignIn

struct GoogleDriveButton: View {
    let recording: Recording
    @StateObject private var driveService = GoogleDriveService()
    @State private var showSignInSheet = false
    @State private var uploadResult: String?
    @State private var showResult = false

    var body: some View {
        Button {
            if driveService.isSignedIn {
                Task { await uploadToDrive() }
            } else {
                showSignInSheet = true
            }
        } label: {
            if driveService.isUploading {
                ProgressView()
            } else {
                Label("Drive", systemImage: driveService.isSignedIn ? "arrow.up.circle" : "person.badge.plus")
                    .labelStyle(.iconOnly)
                    .font(.title3)
                    .foregroundStyle(driveService.isSignedIn ? .blue : .secondary)
            }
        }
        .sheet(isPresented: $showSignInSheet) {
            GoogleSignInView(driveService: driveService, onSignedIn: {
                showSignInSheet = false
                Task { await uploadToDrive() }
            })
        }
        .alert("アップロード完了", isPresented: $showResult) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(uploadResult ?? "")
        }
    }

    private func uploadToDrive() async {
        do {
            let result = try await driveService.uploadFile(
                url: recording.url,
                fileName: recording.fileName
            )
            uploadResult = result
            showResult = true
        } catch {
            uploadResult = error.localizedDescription
            showResult = true
        }
    }
}

struct GoogleSignInView: View {
    @ObservedObject var driveService: GoogleDriveService
    let onSignedIn: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "g.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.blue)
            Text("Google ドライブに接続")
                .font(.title2.bold())
            Text("録音ファイルをGoogle ドライブにアップロードするには、Googleアカウントでサインインしてください。")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            GoogleSignInButtonView(driveService: driveService, onSignedIn: onSignedIn)
                .frame(height: 50)
                .padding(.horizontal, 40)

            Button("キャンセル") { dismiss() }
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
    }
}

struct GoogleSignInButtonView: UIViewRepresentable {
    @ObservedObject var driveService: GoogleDriveService
    let onSignedIn: () -> Void

    func makeUIView(context: Context) -> GIDSignInButton {
        let button = GIDSignInButton()
        button.style = .wide
        button.addTarget(context.coordinator, action: #selector(Coordinator.signIn), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: GIDSignInButton, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(driveService: driveService, onSignedIn: onSignedIn)
    }

    class Coordinator: NSObject {
        let driveService: GoogleDriveService
        let onSignedIn: () -> Void

        init(driveService: GoogleDriveService, onSignedIn: @escaping () -> Void) {
            self.driveService = driveService
            self.onSignedIn = onSignedIn
        }

        @objc func signIn() {
            guard let rootVC = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first?.windows.first?.rootViewController else { return }
            Task { @MainActor in
                do {
                    try await driveService.signIn(presenting: rootVC)
                    onSignedIn()
                } catch {
                    print("Sign in error: \(error)")
                }
            }
        }
    }
}
