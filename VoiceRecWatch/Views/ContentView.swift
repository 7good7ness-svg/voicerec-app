import SwiftUI

struct WatchContentView: View {
    @StateObject private var recorder = AudioRecorderService()
    // WatchConnectivityService は ObservableObject なので
    // singleton を @ObservedObject で監視する
    @ObservedObject private var connectivity = WatchConnectivityService.shared

    var body: some View {
        TabView {
            RecordingView(recorder: recorder, connectivity: connectivity)
                .tabItem {
                    Label("録音", systemImage: "mic.fill")
                }

            NavigationStack {
                WatchRecordingListView(recorder: recorder, connectivity: connectivity)
                    .navigationTitle("一覧")
                    .navigationBarTitleDisplayMode(.inline)
            }
            .tabItem {
                Label("一覧", systemImage: "list.bullet")
            }
        }
    }
}

#Preview {
    WatchContentView()
}
