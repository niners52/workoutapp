import ActivityKit
import Foundation

// Shared attributes for the Rest Timer Live Activity
// This file is shared between the main app and the widget extension

public struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic state that updates during the activity
        var endTime: Date
        var isPaused: Bool
        var remainingSeconds: Int
    }

    // Static attributes set when starting the activity
    var timerName: String
    var totalSeconds: Int
}
