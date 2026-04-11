import SwiftUI

struct WatchRecordingListView: View {
    @ObservedObject var recorder: AudioRecorderService
    @ObservedObject var connectivity: WatchConnectivityService

    var body: some View {
        let urls = recorder.savedRecordingURLs
        if urls.isEmpty {
            Text("録音なし")
                .foregroundStyle(.secondary)
                .font(.caption)
        } else {
            List(urls, id: \.self) { url in
                WatchRecordingRow(url: url, connectivity: connectivity)
            }
        }
    }
}

struct WatchRecordingRow: View {
    let url: URL
    @ObservedObject var connectivity: WatchConnectivityService

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(url.deletingPathExtension().lastPathComponent)
                .font(.caption2.bold())
                .lineLimit(2)

            HStack {
                Button {
                    connectivity.sendRecording(url: url)
                } label: {
                    Image(systemName: "iphone.and.arrow.forward")
                        .font(.caption2)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.blue)

                Spacer()

                if connectivity.isTransferring {
                    ProgressView()
                        .scaleEffect(0.6)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
