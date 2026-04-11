import Foundation
import Combine

@MainActor
class PlayerViewModel: ObservableObject {
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Float = 1.0
    @Published var isTranscribing = false
    @Published var isTranslating = false
    @Published var errorMessage: String?
    @Published var showError = false

    let playerService = AudioPlayerService()
    private let transcriptionService = SpeechTranscriptionService()
    private let summarizationService = SummarizationService()
    private let translationService = TranslationService()
    private var cancellables = Set<AnyCancellable>()

    private(set) var recording: Recording?
    var onRecordingUpdated: ((String, String?) -> Void)?
    var onTranslationUpdated: ((String) -> Void)?

    let availableRates: [Float] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

    init() {
        playerService.$isPlaying
            .receive(on: DispatchQueue.main)
            .assign(to: &$isPlaying)
        playerService.$currentTime
            .receive(on: DispatchQueue.main)
            .assign(to: &$currentTime)
        playerService.$duration
            .receive(on: DispatchQueue.main)
            .assign(to: &$duration)
    }

    func load(recording: Recording) {
        self.recording = recording
        playerService.load(url: recording.url)
        duration = playerService.duration
        currentTime = 0
    }

    func togglePlay() {
        if isPlaying {
            playerService.pause()
        } else {
            playerService.play()
        }
    }

    func seek(to time: TimeInterval) {
        playerService.seek(to: time)
    }

    func skipBackward15() { playerService.skipBackward(seconds: 15) }
    func skipBackward30() { playerService.skipBackward(seconds: 30) }
    func skipForward15() { playerService.skipForward(seconds: 15) }
    func skipForward30() { playerService.skipForward(seconds: 30) }

    func setRate(_ rate: Float) {
        playbackRate = rate
        playerService.setRate(rate)
    }

    var remainingTime: TimeInterval {
        max(0, duration - currentTime)
    }

    func formatTime(_ time: TimeInterval) -> String {
        let mins = Int(time) / 60
        let secs = Int(time) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    func transcribeRecording() async {
        guard let recording = recording else { return }
        isTranscribing = true
        do {
            let text = try await transcriptionService.transcribe(url: recording.url)
            let summary = summarizationService.summarize(text: text)
            onRecordingUpdated?(text, summary.isEmpty ? nil : summary)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
        isTranscribing = false
    }

    func translateText(_ text: String) async {
        isTranslating = true
        do {
            let translated = try await translationService.translateJaToEn(text: text)
            onTranslationUpdated?(translated)
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
        isTranslating = false
    }
}
