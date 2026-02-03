import SwiftUI
import WatchConnectivity

struct ContentView: View {
    @StateObject private var viewModel = WatchViewModel()

    var body: some View {
        if viewModel.isWorkoutActive {
            WorkoutActiveView(viewModel: viewModel)
        } else {
            IdleView()
        }
    }
}

struct IdleView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 40))
                .foregroundColor(Color(hex: "#FFC52F"))
            Text("Workout Tracker")
                .font(.headline)
            Text("Start a workout on\nyour iPhone")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
