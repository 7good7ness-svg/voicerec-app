import AVFoundation
import WatchKit

class AudioRecorderService: NSObject, ObservableObject {
    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var errorMessage: String?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var startTime: Date?

    var currentRecordingURL: URL? {
        recorder?.url
    }

    func startRecording() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default)
        try session.setActive(true)

        let fileName = "録音_\(Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false))).m4a"
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: " ", with: "_")

        let url = recordingsDirectory.appendingPathComponent(fileName)

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder?.delegate = self
        recorder?.record()
        isRecording = true
        startTime = Date()
        startTimer()
    }

    func stopRecording() -> URL? {
        recorder?.stop()
        isRecording = false
        stopTimer()
        recordingDuration = 0
        let url = recorder?.url
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false)
        return url
    }

    private var recordingsDirectory: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docs.appendingPathComponent("Recordings")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let start = self?.startTime else { return }
            self?.recordingDuration = Date().timeIntervalSince(start)
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    var savedRecordingURLs: [URL] {
        let dir = recordingsDirectory
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: [.creationDateKey],
            options: .skipsHiddenFiles
        ) else { return [] }
        return files
            .filter { $0.pathExtension == "m4a" }
            .sorted { url1, url2 in
                let d1 = (try? url1.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? Date.distantPast
                let d2 = (try? url2.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? Date.distantPast
                return d1 > d2
            }
    }

    func formattedDuration(_ duration: TimeInterval) -> String {
        let mins = Int(duration) / 60
        let secs = Int(duration) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

extension AudioRecorderService: AVAudioRecorderDelegate {
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            DispatchQueue.main.async {
                self.errorMessage = "録音に失敗しました"
                self.isRecording = false
            }
        }
    }
}
