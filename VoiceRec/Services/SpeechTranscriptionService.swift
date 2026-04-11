import Speech
import AVFoundation

class SpeechTranscriptionService: ObservableObject {
    @Published var isTranscribing = false
    @Published var progress: Double = 0

    func transcribe(url: URL) async throws -> String {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized ||
              (await requestPermission()) else {
            throw TranscriptionError.notAuthorized
        }

        let locale = Locale(identifier: "ja-JP")
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            // Fallback to device locale
            guard let fallbackRecognizer = SFSpeechRecognizer(), fallbackRecognizer.isAvailable else {
                throw TranscriptionError.notAvailable
            }
            return try await performRecognition(with: fallbackRecognizer, url: url)
        }

        return try await performRecognition(with: recognizer, url: url)
    }

    private func performRecognition(with recognizer: SFSpeechRecognizer, url: URL) async throws -> String {
        return try await withCheckedThrowingContinuation { continuation in
            let request = SFSpeechURLRecognitionRequest(url: url)
            request.shouldReportPartialResults = false
            request.taskHint = .dictation

            DispatchQueue.main.async { self.isTranscribing = true }

            recognizer.recognitionTask(with: request) { [weak self] result, error in
                if let error = error {
                    DispatchQueue.main.async { self?.isTranscribing = false }
                    continuation.resume(throwing: error)
                    return
                }
                if let result = result, result.isFinal {
                    DispatchQueue.main.async { self?.isTranscribing = false }
                    continuation.resume(returning: result.bestTranscription.formattedString)
                }
            }
        }
    }

    private func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    enum TranscriptionError: LocalizedError {
        case notAuthorized
        case notAvailable

        var errorDescription: String? {
            switch self {
            case .notAuthorized: return "音声認識の権限がありません"
            case .notAvailable: return "音声認識が利用できません"
            }
        }
    }
}
