import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.2, *)
struct RestTimerWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            // Lock Screen / Banner UI
            LockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "timer")
                        .font(.title2)
                        .foregroundColor(.orange)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...context.state.endTime, countsDown: true)
                        .font(.title2.monospacedDigit())
                        .foregroundColor(.white)
                        .frame(width: 80)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("Rest Timer")
                        .font(.headline)
                        .foregroundColor(.white)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(
                        timerInterval: Date()...context.state.endTime,
                        countsDown: true
                    ) {
                        EmptyView()
                    }
                    .progressViewStyle(.linear)
                    .tint(.orange)
                    .padding(.horizontal)
                }
            } compactLeading: {
                // Compact leading (left side of pill)
                Image(systemName: "timer")
                    .foregroundColor(.orange)
            } compactTrailing: {
                // Compact trailing (right side of pill)
                Text(timerInterval: Date()...context.state.endTime, countsDown: true)
                    .monospacedDigit()
                    .foregroundColor(.orange)
                    .frame(width: 44)
            } minimal: {
                // Minimal view (when another activity is expanded)
                Image(systemName: "timer")
                    .foregroundColor(.orange)
            }
            .widgetURL(URL(string: "workouttracker://timer"))
            .keylineTint(.orange)
        }
    }
}

@available(iOS 16.2, *)
struct LockScreenView: View {
    let context: ActivityViewContext<RestTimerAttributes>

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "timer")
                    .font(.title2)
                    .foregroundColor(.orange)

                Text("Rest Timer")
                    .font(.headline)
                    .foregroundColor(.white)

                Spacer()

                Text(timerInterval: Date()...context.state.endTime, countsDown: true)
                    .font(.title.monospacedDigit().bold())
                    .foregroundColor(.orange)
            }

            ProgressView(
                timerInterval: Date()...context.state.endTime,
                countsDown: true
            ) {
                EmptyView()
            }
            .progressViewStyle(.linear)
            .tint(.orange)
        }
        .padding()
        .background(Color.black.opacity(0.8))
    }
}

// Preview for development
@available(iOS 16.2, *)
struct RestTimerWidgetLiveActivity_Previews: PreviewProvider {
    static let attributes = RestTimerAttributes(timerName: "Rest", totalSeconds: 90)
    static let contentState = RestTimerAttributes.ContentState(
        endTime: Date().addingTimeInterval(90),
        isPaused: false,
        remainingSeconds: 90
    )

    static var previews: some View {
        attributes
            .previewContext(contentState, viewKind: .dynamicIsland(.compact))
            .previewDisplayName("Compact")

        attributes
            .previewContext(contentState, viewKind: .dynamicIsland(.expanded))
            .previewDisplayName("Expanded")

        attributes
            .previewContext(contentState, viewKind: .content)
            .previewDisplayName("Lock Screen")
    }
}
