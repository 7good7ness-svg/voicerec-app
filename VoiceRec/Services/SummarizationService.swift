import NaturalLanguage
import Foundation

class SummarizationService {
    /// Extractive summarization using NaturalLanguage framework
    func summarize(text: String, sentenceCount: Int = 5) -> String {
        guard !text.isEmpty else { return "" }

        let tokenizer = NLTokenizer(unit: .sentence)
        tokenizer.string = text
        var sentences: [String] = []
        tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
            let sentence = String(text[range]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !sentence.isEmpty {
                sentences.append(sentence)
            }
            return true
        }

        guard sentences.count > sentenceCount else { return text }

        // Score sentences by word importance using TF-IDF-like approach
        let scores = scoreSentences(sentences, in: text)
        let ranked = scores.sorted { $0.value > $1.value }
        let topIndices = Set(ranked.prefix(sentenceCount).map { $0.key })

        // Return sentences in original order
        let summary = sentences.enumerated()
            .filter { topIndices.contains($0.offset) }
            .map { $0.element }
            .joined(separator: "　")

        return summary
    }

    private func scoreSentences(_ sentences: [String], in text: String) -> [Int: Double] {
        // Compute word frequencies across the whole text
        let tagger = NLTagger(tagSchemes: [.lexicalClass])
        tagger.string = text
        var wordFreq: [String: Int] = [:]

        tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .lexicalClass) { tag, range in
            let word = String(text[range]).lowercased()
            if let tag = tag, tag != .whitespace, tag != .punctuation, word.count > 1 {
                wordFreq[word, default: 0] += 1
            }
            return true
        }

        // Score each sentence
        var scores: [Int: Double] = [:]
        for (index, sentence) in sentences.enumerated() {
            var score = 0.0
            var wordCount = 0
            tagger.string = sentence
            tagger.enumerateTags(in: sentence.startIndex..<sentence.endIndex, unit: .word, scheme: .lexicalClass) { tag, range in
                let word = String(sentence[range]).lowercased()
                if let tag = tag, tag != .whitespace, tag != .punctuation {
                    score += Double(wordFreq[word] ?? 0)
                    wordCount += 1
                }
                return true
            }
            scores[index] = wordCount > 0 ? score / Double(wordCount) : 0
        }
        return scores
    }
}
