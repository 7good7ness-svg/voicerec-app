import Foundation

struct Recording: Identifiable, Codable, Equatable {
    var id: UUID
    var name: String
    var fileName: String
    var date: Date
    var duration: TimeInterval
    var isTranscribed: Bool
    var transcription: String?
    var summary: String?
    var translation: String?
    var isFromWatch: Bool

    init(
        id: UUID = UUID(),
        name: String,
        fileName: String,
        date: Date = Date(),
        duration: TimeInterval = 0,
        isFromWatch: Bool = false
    ) {
        self.id = id
        self.name = name
        self.fileName = fileName
        self.date = date
        self.duration = duration
        self.isTranscribed = false
        self.transcription = nil
        self.summary = nil
        self.translation = nil
        self.isFromWatch = isFromWatch
    }

    var url: URL {
        Recording.recordingsDirectory.appendingPathComponent(fileName)
    }

    static var recordingsDirectory: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docs.appendingPathComponent("Recordings")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    var formattedDuration: String {
        let mins = Int(duration) / 60
        let secs = Int(duration) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        formatter.locale = Locale(identifier: "ja_JP")
        return formatter.string(from: date)
    }
}
