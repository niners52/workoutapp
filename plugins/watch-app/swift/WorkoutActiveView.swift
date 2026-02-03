import SwiftUI

struct WorkoutActiveView: View {
    @ObservedObject var viewModel: WatchViewModel
    @State private var showLogSet = false

    var body: some View {
        TabView {
            // Tab 1: Current exercise + rest timer
            ScrollView {
                VStack(spacing: 8) {
                    Text(viewModel.exerciseName)
                        .font(.headline)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)

                    Text("Exercise \(viewModel.exerciseIndex + 1) of \(viewModel.totalExercises)")
                        .font(.caption2)
                        .foregroundColor(.secondary)

                    Text("Set \(viewModel.currentSetNumber)")
                        .font(.title3)
                        .foregroundColor(Color(hex: "#FFC52F"))

                    if viewModel.lastWeight > 0 {
                        let unitLabel = viewModel.unitSystem == "metric" ? "kg" : "lbs"
                        Text("Last: \(viewModel.lastWeight, specifier: "%.1f") \(unitLabel) × \(viewModel.lastReps)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer().frame(height: 8)

                    if viewModel.restTimerActive {
                        RestTimerView(
                            remaining: viewModel.restTimerRemaining,
                            total: viewModel.restTimerTotal
                        )
                    } else {
                        Button(action: { showLogSet = true }) {
                            Label("Log Set", systemImage: "plus.circle.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(hex: "#FFC52F"))
                    }
                }
                .padding()
            }

            // Tab 2: Quick log
            LogSetView(viewModel: viewModel)
        }
        .tabViewStyle(.carousel)
        .sheet(isPresented: $showLogSet) {
            LogSetView(viewModel: viewModel)
        }
    }
}

struct RestTimerView: View {
    let remaining: Int
    let total: Int

    var progress: Double {
        guard total > 0 else { return 0 }
        return Double(total - remaining) / Double(total)
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.3), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(Color(hex: "#FFC52F"), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 1), value: progress)

                Text(formatTime(remaining))
                    .font(.system(.title2, design: .monospaced))
                    .foregroundColor(Color(hex: "#FFC52F"))
            }
            .frame(width: 80, height: 80)

            Text("Rest")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }

    func formatTime(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

#Preview {
    WorkoutActiveView(viewModel: WatchViewModel())
}
