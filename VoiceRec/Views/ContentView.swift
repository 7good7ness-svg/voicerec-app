import SwiftUI

struct ContentView: View {
    @StateObject private var listViewModel = RecordingListViewModel()

    var body: some View {
        RecordingListView(viewModel: listViewModel)
    }
}

#Preview {
    ContentView()
}
