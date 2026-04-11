import SwiftUI

struct RecordingView: View {
    @ObservedObject var recorder: AudioRecorderService
    @ObservedObject var connectivity: WatchConnectivityService
    @State private var showSendConfirm = false
    @State private var lastRecordedURL: URL?

    var body: some View {
        VStack(spacing: 12) {
            Spacer()

            // Recording status
            if recorder.isRecording {
                recordingIndicator
            } else {
                micIcon
            }

            // Record button
            Button {
                if recorder.isRecording {
                    lastRecordedURL = recorder.stopRecording()
                } else {
                    try? recorder.startRecording()
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(recorder.isRecording ? Color.red : Color.accentColor)
                        .frame(width: 64, height: 64)
                    Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)

            // Status text
            if let status = connectivity.lastTransferStatus {
                Text(status)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }

            // Send to iPhone button
            if let url = lastRecordedURL, !recorder.isRecording {
                Button {
                    connectivity.sendRecording(url: url)
                    lastRecordedURL = nil
                } label: {
                    Label("iPhoneへ転送", systemImage: "iphone.and.arrow.forward")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .tint(.blue)
            }

            Spacer()
        }
        .navigationTitle("録音")
    }

    private var recordingIndicator: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Circle()
                    .fill(.red)
                    .frame(width: 8, height: 8)
                    .opacity(0.8)
                    .animation(.easeInOut(duration: 0.8).repeatForever(), value: recorder.isRecording)
                Text("録音中")
                    .font(.caption.bold())
                    .foregroundStyle(.red)
            }
            Text(recorder.formattedDuration(recorder.recordingDuration))
                .font(.title3.monospacedDigit().bold())
        }
    }

    private var micIcon: some View {
        VStack(spacing: 4) {
            Image(systemName: "mic.circle")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("タップして録音")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
