import SwiftUI

struct RecordingListView: View {
    @ObservedObject var viewModel: RecordingListViewModel
    @State private var selectedRecording: Recording?
    @State private var showPlayer = false
    @State private var editingRecording: Recording?
    @State private var newName = ""
    @State private var showRenameAlert = false
    @State private var showDeleteConfirm = false
    @State private var recordingToDelete: Recording?

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.recordings.isEmpty {
                    emptyState
                } else {
                    recordingList
                }
            }
            .navigationTitle("VoiceRec")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    watchStatusIndicator
                }
            }
            .sheet(item: $selectedRecording) { recording in
                PlayerView(recording: recording, listViewModel: viewModel)
            }
            .alert("名前を変更", isPresented: $showRenameAlert) {
                TextField("録音名", text: $newName)
                Button("変更") {
                    if let rec = editingRecording, !newName.isEmpty {
                        viewModel.rename(rec, to: newName)
                    }
                }
                Button("キャンセル", role: .cancel) {}
            }
            .alert("削除しますか？", isPresented: $showDeleteConfirm) {
                Button("削除", role: .destructive) {
                    if let rec = recordingToDelete {
                        viewModel.delete(rec)
                    }
                }
                Button("キャンセル", role: .cancel) {}
            } message: {
                Text("この録音は完全に削除されます")
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "waveform.circle")
                .font(.system(size: 80))
                .foregroundStyle(.secondary)
            Text("録音がありません")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text("Apple Watchで録音を開始してください")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private var recordingList: some View {
        List {
            ForEach(viewModel.recordings) { recording in
                RecordingRow(recording: recording)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        selectedRecording = recording
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            recordingToDelete = recording
                            showDeleteConfirm = true
                        } label: {
                            Label("削除", systemImage: "trash")
                        }
                        Button {
                            editingRecording = recording
                            newName = recording.name
                            showRenameAlert = true
                        } label: {
                            Label("名前変更", systemImage: "pencil")
                        }
                        .tint(.orange)
                    }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var watchStatusIndicator: some View {
        HStack(spacing: 4) {
            Image(systemName: "applewatch")
                .foregroundStyle(WatchConnectivityService.shared.isReachable ? .green : .secondary)
            if WatchConnectivityService.shared.isReachable {
                Text("接続中")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        }
    }
}

struct RecordingRow: View {
    let recording: Recording

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(recording.isFromWatch ? Color.blue.opacity(0.15) : Color.purple.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: recording.isFromWatch ? "applewatch" : "iphone")
                    .foregroundStyle(recording.isFromWatch ? .blue : .purple)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(recording.name)
                        .font(.headline)
                        .lineLimit(1)
                    if recording.isTranscribed {
                        Image(systemName: "text.bubble.fill")
                            .font(.caption)
                            .foregroundStyle(.teal)
                    }
                }
                HStack(spacing: 8) {
                    Text(recording.formattedDate)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("·")
                        .foregroundStyle(.tertiary)
                    Text(recording.formattedDuration)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}
