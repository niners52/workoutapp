import Foundation
import WatchConnectivity
import Combine
import SwiftUI

class WatchViewModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var isWorkoutActive = false
    @Published var exerciseName = ""
    @Published var exerciseIndex = 0
    @Published var totalExercises = 0
    @Published var currentSetNumber = 1
    @Published var targetSets = 3
    @Published var lastWeight: Double = 0
    @Published var lastReps: Int = 0
    @Published var restTimerActive = false
    @Published var restTimerRemaining = 0
    @Published var restTimerTotal = 0
    @Published var unitSystem = "imperial"

    private var session: WCSession?

    override init() {
        super.init()
        if WCSession.isSupported() {
            session = WCSession.default
            session?.delegate = self
            session?.activate()
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated {
            requestCurrentState()
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { self.handleMessage(message) }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { self.handleMessage(applicationContext) }
    }

    private func handleMessage(_ data: [String: Any]) {
        if let type = data["type"] as? String {
            if type == "restTimer" {
                restTimerActive = data["isActive"] as? Bool ?? false
                restTimerRemaining = data["remaining"] as? Int ?? 0
                restTimerTotal = data["total"] as? Int ?? 0
                if let name = data["exerciseName"] as? String { exerciseName = name }
                return
            }
            if type == "workoutEnded" {
                isWorkoutActive = false
                return
            }
        }

        isWorkoutActive = data["isActive"] as? Bool ?? false
        exerciseName = data["exerciseName"] as? String ?? ""
        exerciseIndex = data["exerciseIndex"] as? Int ?? 0
        totalExercises = data["totalExercises"] as? Int ?? 0
        currentSetNumber = data["currentSetNumber"] as? Int ?? 1
        targetSets = data["targetSets"] as? Int ?? 3
        lastWeight = data["lastWeight"] as? Double ?? 0
        lastReps = data["lastReps"] as? Int ?? 0
        restTimerActive = data["restTimerActive"] as? Bool ?? false
        restTimerRemaining = data["restTimerRemaining"] as? Int ?? 0
        restTimerTotal = data["restTimerTotal"] as? Int ?? 0
        unitSystem = data["unitSystem"] as? String ?? "imperial"
    }

    func logSetFromWatch(weight: Double, reps: Int) {
        guard let session = session, session.isReachable else { return }
        session.sendMessage([
            "type": "logSet",
            "weight": weight,
            "reps": reps,
            "exerciseIndex": exerciseIndex,
        ], replyHandler: nil, errorHandler: { error in
            print("Failed to send set: \(error)")
        })
    }

    func requestCurrentState() {
        guard let session = session, session.isReachable else { return }
        session.sendMessage(["type": "requestState"], replyHandler: nil, errorHandler: nil)
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b)
    }
}
