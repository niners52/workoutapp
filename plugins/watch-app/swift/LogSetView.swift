import SwiftUI

struct LogSetView: View {
    @ObservedObject var viewModel: WatchViewModel
    @Environment(\.dismiss) var dismiss

    @State private var weight: Double = 0
    @State private var reps: Int = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("Log Set")
                    .font(.headline)

                VStack(spacing: 4) {
                    let unitLabel = viewModel.unitSystem == "metric" ? "kg" : "lbs"
                    Text("Weight (\(unitLabel))")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    HStack {
                        Button(action: {
                            let increment = viewModel.unitSystem == "metric" ? 2.5 : 5.0
                            weight = max(0, weight - increment)
                        }) {
                            Image(systemName: "minus.circle.fill")
                                .font(.title3)
                        }

                        Text("\(weight, specifier: "%.1f")")
                            .font(.system(.title3, design: .monospaced))
                            .frame(minWidth: 60)

                        Button(action: {
                            let increment = viewModel.unitSystem == "metric" ? 2.5 : 5.0
                            weight += increment
                        }) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                        }
                    }
                    .foregroundColor(Color(hex: "#FFC52F"))
                }

                VStack(spacing: 4) {
                    Text("Reps")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    HStack {
                        Button(action: { reps = max(0, reps - 1) }) {
                            Image(systemName: "minus.circle.fill")
                                .font(.title3)
                        }

                        Text("\(reps)")
                            .font(.system(.title3, design: .monospaced))
                            .frame(minWidth: 40)

                        Button(action: { reps += 1 }) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                        }
                    }
                    .foregroundColor(Color(hex: "#FFC52F"))
                }

                Button(action: {
                    viewModel.logSetFromWatch(weight: weight, reps: reps)
                    dismiss()
                }) {
                    Text("Save Set")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(hex: "#FFC52F"))
                .disabled(weight <= 0 || reps <= 0)
            }
            .padding()
        }
        .onAppear {
            weight = viewModel.lastWeight
            reps = viewModel.lastReps
        }
    }
}

#Preview {
    LogSetView(viewModel: WatchViewModel())
}
