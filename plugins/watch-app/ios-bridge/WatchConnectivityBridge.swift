import Foundation
import WatchConnectivity

@objc(WatchConnectivityBridge)
class WatchConnectivityBridge: RCTEventEmitter {
    private let manager = WatchConnectivityManager.shared

    override init() {
        super.init()
        manager.onSetLoggedFromWatch = { [weak self] data in
            self?.sendEvent(withName: "onWatchSetLogged", body: data)
        }
        manager.onRestTimerActionFromWatch = { [weak self] action in
            self?.sendEvent(withName: "onWatchRestTimerAction", body: ["action": action])
        }
        manager.onStateRequested = { [weak self] in
            self?.sendEvent(withName: "onWatchRequestState", body: nil)
        }
    }

    override func supportedEvents() -> [String] {
        ["onWatchSetLogged", "onWatchRestTimerAction", "onWatchRequestState"]
    }

    override static func requiresMainQueueSetup() -> Bool { false }

    @objc func sendWorkoutState(_ state: NSDictionary) {
        manager.sendWorkoutState(state as! [String: Any])
    }

    @objc func sendRestTimerUpdate(_ data: NSDictionary) {
        manager.sendRestTimerUpdate(data as! [String: Any])
    }

    @objc func sendWorkoutEnded() {
        manager.sendWorkoutEnded()
    }

    @objc func isWatchPaired(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if WCSession.isSupported() {
            resolve(WCSession.default.isPaired)
        } else {
            resolve(false)
        }
    }

    @objc func isWatchReachable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if WCSession.isSupported() {
            resolve(WCSession.default.isReachable)
        } else {
            resolve(false)
        }
    }
}
