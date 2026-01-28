import Foundation
import ActivityKit

@available(iOS 16.2, *)
@objc(LiveActivityModule)
class LiveActivityModule: NSObject {

    private var currentActivity: Activity<RestTimerAttributes>?

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func isLiveActivitySupported(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
        } else {
            resolve(false)
        }
    }

    @objc
    func startRestTimer(_ seconds: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                reject("NOT_SUPPORTED", "Live Activities are not enabled", nil)
                return
            }

            // End any existing activity first
            Task {
                await self.endAllActivities()

                let endTime = Date().addingTimeInterval(TimeInterval(seconds))

                let attributes = RestTimerAttributes(
                    timerName: "Rest",
                    totalSeconds: seconds
                )

                let contentState = RestTimerAttributes.ContentState(
                    endTime: endTime,
                    isPaused: false,
                    remainingSeconds: seconds
                )

                do {
                    let activity = try Activity.request(
                        attributes: attributes,
                        contentState: contentState,
                        pushType: nil
                    )
                    self.currentActivity = activity
                    resolve(activity.id)
                } catch {
                    reject("START_FAILED", "Failed to start Live Activity: \(error.localizedDescription)", error)
                }
            }
        } else {
            reject("NOT_SUPPORTED", "Live Activities require iOS 16.2+", nil)
        }
    }

    @objc
    func updateRestTimer(_ remainingSeconds: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            guard let activity = currentActivity else {
                reject("NO_ACTIVITY", "No active Live Activity", nil)
                return
            }

            let endTime = Date().addingTimeInterval(TimeInterval(remainingSeconds))
            let contentState = RestTimerAttributes.ContentState(
                endTime: endTime,
                isPaused: false,
                remainingSeconds: remainingSeconds
            )

            Task {
                await activity.update(using: contentState)
                resolve(true)
            }
        } else {
            reject("NOT_SUPPORTED", "Live Activities require iOS 16.2+", nil)
        }
    }

    @objc
    func stopRestTimer(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            Task {
                await self.endAllActivities()
                resolve(true)
            }
        } else {
            reject("NOT_SUPPORTED", "Live Activities require iOS 16.2+", nil)
        }
    }

    @objc
    func endRestTimerWithAlert(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            guard let activity = currentActivity else {
                resolve(true)
                return
            }

            // Set end time to now to show "0:00" briefly before dismissing
            let finalState = RestTimerAttributes.ContentState(
                endTime: Date(),
                isPaused: false,
                remainingSeconds: 0
            )

            Task {
                // Update to show completion state
                await activity.update(using: finalState)

                // End the activity after a brief delay so user can see it completed
                try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds

                await activity.end(
                    using: finalState,
                    dismissalPolicy: .immediate
                )
                self.currentActivity = nil
                resolve(true)
            }
        } else {
            reject("NOT_SUPPORTED", "Live Activities require iOS 16.2+", nil)
        }
    }

    @available(iOS 16.2, *)
    private func endAllActivities() async {
        // End current tracked activity
        if let activity = currentActivity {
            let finalState = RestTimerAttributes.ContentState(
                endTime: Date(),
                isPaused: false,
                remainingSeconds: 0
            )
            await activity.end(using: finalState, dismissalPolicy: .immediate)
        }
        currentActivity = nil

        // Also clean up any orphaned activities
        for activity in Activity<RestTimerAttributes>.activities {
            let finalState = RestTimerAttributes.ContentState(
                endTime: Date(),
                isPaused: false,
                remainingSeconds: 0
            )
            await activity.end(using: finalState, dismissalPolicy: .immediate)
        }
    }
}
