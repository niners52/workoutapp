import Foundation
import WatchConnectivity

@objc class WatchConnectivityManager: NSObject, WCSessionDelegate {
    @objc static let shared = WatchConnectivityManager()
    private var session: WCSession?
    var onSetLoggedFromWatch: (([String: Any]) -> Void)?
    var onRestTimerActionFromWatch: ((String) -> Void)?
    var onStateRequested: (() -> Void)?

    override init() {
        super.init()
        if WCSession.isSupported() {
            session = WCSession.default
            session?.delegate = self
            session?.activate()
        }
    }

    @objc func sendWorkoutState(_ state: [String: Any]) {
        guard let session = session else { return }
        if session.isReachable {
            session.sendMessage(state, replyHandler: nil) { _ in
                try? session.updateApplicationContext(state)
            }
        } else {
            try? session.updateApplicationContext(state)
        }
    }

    @objc func sendRestTimerUpdate(_ data: [String: Any]) {
        guard let session = session, session.isReachable else { return }
        var message = data
        message["type"] = "restTimer"
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    @objc func sendWorkoutEnded() {
        guard let session = session else { return }
        try? session.updateApplicationContext(["isActive": false, "type": "workoutEnded"])
    }

    // WCSessionDelegate
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let type = message["type"] as? String {
            switch type {
            case "logSet": onSetLoggedFromWatch?(message)
            case "restTimerAction":
                if let action = message["action"] as? String { onRestTimerActionFromWatch?(action) }
            case "requestState": onStateRequested?()
            default: break
            }
        }
    }
}
