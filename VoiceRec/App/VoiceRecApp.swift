import SwiftUI
import GoogleSignIn

@main
struct VoiceRecApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.none) // ダークモード対応（システム設定に従う）
        }
    }
}
