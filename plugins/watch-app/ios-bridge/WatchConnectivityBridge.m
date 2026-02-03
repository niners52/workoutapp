#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <WatchConnectivity/WatchConnectivity.h>

@interface WatchConnectivityBridge : RCTEventEmitter <RCTBridgeModule, WCSessionDelegate>
@end

@implementation WatchConnectivityBridge {
    WCSession *_session;
    BOOL _hasListeners;
}

RCT_EXPORT_MODULE();

- (instancetype)init {
    self = [super init];
    if (self) {
        if ([WCSession isSupported]) {
            _session = [WCSession defaultSession];
            _session.delegate = self;
            [_session activateSession];
        }
    }
    return self;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onWatchSetLogged", @"onWatchRestTimerAction", @"onWatchRequestState"];
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (void)startObserving {
    _hasListeners = YES;
}

- (void)stopObserving {
    _hasListeners = NO;
}

#pragma mark - Exported Methods

RCT_EXPORT_METHOD(sendWorkoutState:(NSDictionary *)state) {
    if (!_session) return;

    if (_session.isReachable) {
        [_session sendMessage:state replyHandler:nil errorHandler:^(NSError *error) {
            // Fallback to application context if message fails
            [self->_session updateApplicationContext:state error:nil];
        }];
    } else {
        [_session updateApplicationContext:state error:nil];
    }
}

RCT_EXPORT_METHOD(sendRestTimerUpdate:(NSDictionary *)data) {
    if (!_session || !_session.isReachable) return;

    NSMutableDictionary *message = [data mutableCopy];
    message[@"type"] = @"restTimer";
    [_session sendMessage:message replyHandler:nil errorHandler:nil];
}

RCT_EXPORT_METHOD(sendWorkoutEnded) {
    if (!_session) return;

    NSDictionary *msg = @{@"isActive": @NO, @"type": @"workoutEnded"};
    [_session updateApplicationContext:msg error:nil];
}

RCT_EXPORT_METHOD(isWatchPaired:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if ([WCSession isSupported]) {
        resolve(@(_session.isPaired));
    } else {
        resolve(@NO);
    }
}

RCT_EXPORT_METHOD(isWatchReachable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if ([WCSession isSupported]) {
        resolve(@(_session.isReachable));
    } else {
        resolve(@NO);
    }
}

#pragma mark - WCSessionDelegate

- (void)session:(WCSession *)session activationDidCompleteWithState:(WCSessionActivationState)activationState error:(NSError *)error {
    // Session activated
}

- (void)sessionDidBecomeInactive:(WCSession *)session {
    // Session became inactive
}

- (void)sessionDidDeactivate:(WCSession *)session {
    // Reactivate session
    [session activateSession];
}

- (void)session:(WCSession *)session didReceiveMessage:(NSDictionary<NSString *,id> *)message {
    if (!_hasListeners) return;

    NSString *type = message[@"type"];
    if (!type) return;

    if ([type isEqualToString:@"logSet"]) {
        [self sendEventWithName:@"onWatchSetLogged" body:message];
    } else if ([type isEqualToString:@"restTimerAction"]) {
        NSString *action = message[@"action"];
        if (action) {
            [self sendEventWithName:@"onWatchRestTimerAction" body:@{@"action": action}];
        }
    } else if ([type isEqualToString:@"requestState"]) {
        [self sendEventWithName:@"onWatchRequestState" body:nil];
    }
}

@end
