import Foundation
import AVFoundation
import Combine

@MainActor
class RecordingListViewModel: ObservableObject {
    @Published var recordings: [Recording] = []
    @Published var errorMessage: String?
    @Published var showError = false

    private let saveKey = "VoiceRecRecordings"
    private let watchService = WatchConnectivityService.shared

    init() {
        loadRecordings()
        setupWatchReceiver()
    }

    private func setupWatchReceiver() {
        watchService.onFileReceived = { [weak self] url, fileName in
            Task { @MainActor in
                let duration = await self?.getAudioDuration(url: url) ?? 0
                let name = String(fileName.dropLast(4)) // remove .m4a
                let recording = Recording(
                    name: name,
                    fileName: fileName,
                    duration: duration,
                    isFromWatch: true
                )
                self?.recordings.insert(recording, at: 0)
                self?.saveRecordings()
            }
        }
    }

    func loadRecordings() {
        guard let data = UserDefaults.standard.data(forKey: saveKey),
              let decoded = try? JSONDecoder().decode([Recording].self, from: data) else {
            return
        }
        // Filter out recordings whose files no longer exist
        recordings = decoded.filter { FileManager.default.fileExists(atPath: $0.url.path) }
    }

    func saveRecordings() {
        guard let data = try? JSONEncoder().encode(recordings) else { return }
        UserDefaults.standard.set(data, forKey: saveKey)
    }

    func delete(_ recording: Recording) {
        try? FileManager.default.removeItem(at: recording.url)
        recordings.removeAll { $0.id == recording.id }
        saveRecordings()
    }

    func rename(_ recording: Recording, to newName: String) {
        guard let index = recordings.firstIndex(where: { $0.id == recording.id }) else { return }
        recordings[index].name = newName
        saveRecordings()
    }

    func updateTranscription(for recording: Recording, transcription: String, summary: String?) {
        guard let index = recordings.firstIndex(where: { $0.id == recording.id }) else { return }
        recordings[index].transcription = transcription
        recordings[index].summary = summary
        recordings[index].isTranscribed = true
        saveRecordings()
    }

    func updateTranslation(for recording: Recording, translation: String) {
        guard let index = recordings.firstIndex(where: { $0.id == recording.id }) else { return }
        recordings[index].translation = translation
        saveRecordings()
    }

    private func getAudioDuration(url: URL) async -> TimeInterval {
        let asset = AVURLAsset(url: url)
        do {
            let duration = try await asset.load(.duration)
            return duration.seconds
        } catch {
            return 0
        }
    }
}
