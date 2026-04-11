import SwiftUI

struct PlayerView: View {
    let recording: Recording
    @ObservedObject var listViewModel: RecordingListViewModel
    @StateObject private var viewModel = PlayerViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var activeTab = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                playerCard
                    .padding(.horizontal)
                    .padding(.top, 8)

                Picker("", selection: $activeTab) {
                    Text("文字起こし").tag(0)
                    Text("要約").tag(1)
                    Text("翻訳").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 16)

                ScrollView {
                    tabContent
                        .padding()
                }
            }
            .navigationTitle(recording.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("閉じる") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    GoogleDriveButton(recording: recording)
                }
            }
            .alert("エラー", isPresented: $viewModel.showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
        .onAppear {
            viewModel.load(recording: recording)
            viewModel.onRecordingUpdated = { transcription, summary in
                listViewModel.updateTranscription(for: recording,
                                                  transcription: transcription,
                                                  summary: summary)
            }
            viewModel.onTranslationUpdated = { translation in
                listViewModel.updateTranslation(for: recording, translation: translation)
            }
        }
        .onDisappear {
            viewModel.playerService.stop()
        }
    }

    // MARK: - Player Card
    private var playerCard: some View {
        VStack(spacing: 16) {
            waveformView
                .frame(height: 40)
                .padding(.top, 8)

            HStack {
                Text(viewModel.formatTime(viewModel.currentTime))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                Spacer()
                Text("-" + viewModel.formatTime(viewModel.remainingTime))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Slider(
                value: Binding(
                    get: { viewModel.duration > 0 ? viewModel.currentTime / viewModel.duration : 0 },
                    set: { viewModel.seek(to: $0 * viewModel.duration) }
                )
            )
            .accentColor(.accentColor)

            HStack(spacing: 24) {
                skipButton(seconds: 30, forward: false)
                skipButton(seconds: 15, forward: false)

                Button {
                    viewModel.togglePlay()
                } label: {
                    Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.accentColor)
                }
                .buttonStyle(.plain)

                skipButton(seconds: 15, forward: true)
                skipButton(seconds: 30, forward: true)
            }

            speedControl
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    // 固定の高さ配列でランダム再描画を回避
    private let waveBarHeights: [CGFloat] = [
        12, 20, 28, 16, 32, 24, 14, 30, 18, 26,
        22, 10, 28, 16, 32, 20, 12, 24, 18, 8
    ]

    private var waveformView: some View {
        HStack(spacing: 2) {
            ForEach(Array(waveBarHeights.enumerated()), id: \.offset) { i, h in
                RoundedRectangle(cornerRadius: 2)
                    .fill(viewModel.isPlaying ? Color.accentColor : Color.secondary.opacity(0.4))
                    .frame(width: 3, height: viewModel.isPlaying ? h : 8)
                    .animation(
                        viewModel.isPlaying
                            ? .easeInOut(duration: 0.4 + Double(i % 5) * 0.04)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.04)
                            : .easeOut(duration: 0.2),
                        value: viewModel.isPlaying
                    )
            }
        }
    }

    private func skipButton(seconds: Int, forward: Bool) -> some View {
        Button {
            switch (forward, seconds) {
            case (false, 15): viewModel.skipBackward15()
            case (false, 30): viewModel.skipBackward30()
            case (true, 15):  viewModel.skipForward15()
            default:          viewModel.skipForward30()
            }
        } label: {
            Image(systemName: forward ? "goforward.\(seconds)" : "gobackward.\(seconds)")
                .font(.title3)
        }
        .foregroundStyle(.primary)
    }

    private var speedControl: some View {
        HStack(spacing: 6) {
            Text("速度:")
                .font(.caption)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(viewModel.availableRates, id: \.self) { rate in
                        Button {
                            viewModel.setRate(rate)
                        } label: {
                            Text(rateLabel(rate))
                                .font(.caption)
                                .fontWeight(viewModel.playbackRate == rate ? .bold : .regular)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(
                                    viewModel.playbackRate == rate
                                        ? Color.accentColor
                                        : Color.secondary.opacity(0.15),
                                    in: Capsule()
                                )
                                .foregroundStyle(viewModel.playbackRate == rate ? .white : .primary)
                        }
                    }
                }
            }
        }
    }

    private func rateLabel(_ rate: Float) -> String {
        rate == 1.0 ? "1x" : String(format: "%.2gx", rate)
    }

    // MARK: - Tabs
    @ViewBuilder
    private var tabContent: some View {
        let currentRec = listViewModel.recordings.first { $0.id == recording.id }
        switch activeTab {
        case 0: transcriptionTab(recording: currentRec)
        case 1: summaryTab(recording: currentRec)
        case 2: translationTab(recording: currentRec)
        default: EmptyView()
        }
    }

    @ViewBuilder
    private func transcriptionTab(recording: Recording?) -> some View {
        if viewModel.isTranscribing {
            progressRow(label: "文字起こし中...")
        } else if let text = recording?.transcription {
            selectable(text: text)
        } else {
            emptyAction(
                icon: "text.bubble",
                message: "文字起こしがありません",
                buttonLabel: "文字起こし開始",
                buttonIcon: "waveform.and.mic",
                color: .blue
            ) {
                Task { await viewModel.transcribeRecording() }
            }
        }
    }

    @ViewBuilder
    private func summaryTab(recording: Recording?) -> some View {
        if let summary = recording?.summary {
            selectable(text: summary)
        } else {
            let noTranscription = recording?.transcription == nil
            emptyAction(
                icon: "doc.text.magnifyingglass",
                message: noTranscription ? "まず文字起こしを行ってください" : "要約がありません",
                buttonLabel: nil,
                buttonIcon: nil,
                color: .blue,
                action: nil
            )
        }
    }

    @ViewBuilder
    private func translationTab(recording: Recording?) -> some View {
        if viewModel.isTranslating {
            progressRow(label: "翻訳中...")
        } else if let translation = recording?.translation {
            selectable(text: translation)
        } else {
            let transcription = recording?.transcription
            emptyAction(
                icon: "globe",
                message: transcription == nil ? "まず文字起こしを行ってください" : "翻訳がありません",
                buttonLabel: transcription != nil ? "日→英 翻訳" : nil,
                buttonIcon: "globe",
                color: .green
            ) {
                if let text = transcription {
                    Task { await viewModel.translateText(text) }
                }
            }
        }
    }

    private func selectable(text: String) -> some View {
        Text(text)
            .font(.body)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
    }

    private func progressRow(label: String) -> some View {
        HStack(spacing: 12) {
            ProgressView()
            Text(label).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.top, 40)
    }

    private func emptyAction(
        icon: String,
        message: String,
        buttonLabel: String?,
        buttonIcon: String?,
        color: Color,
        action: (() -> Void)? = nil
    ) -> some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text(message)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let label = buttonLabel, let icon = buttonIcon, let action = action {
                Button(action: action) {
                    Label(label, systemImage: icon)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(color, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
    }
}
